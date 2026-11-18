# ZemiFix CMMS — Background Worker, SLA Engine, PM Generator & Notification System Audit

**Date:** 2026-07-10  
**Auditor:** Automated Investigation (Read-Only)  
**Database Scope:** zemifix_dev (read-only)  
**Project Root:** `E:\HP\Downloads\remix-zemifix-cmms`

---

## Executive Summary

All four components have substantial, well-structured service-layer code. The architecture is coherent and security-conscious. However, **none of the four components operates fully automatically in production** without external intervention. The critical missing piece across all components is a scheduler — there is no cron job, no Vercel cron configuration, no `setInterval`, no Agenda/BullMQ, and no long-running process that periodically calls the worker endpoint or enqueues PM/SLA jobs on a schedule.

Concretely:

- **Background Worker:** Fully implemented as a database-backed pull-queue system. The worker executor (`runBackgroundWorker`) is correct and sophisticated. However, **no code ever enqueues a `GENERATE_PREVENTIVE_MAINTENANCE` or `MONITOR_SLAS` job in production outside of tests and manual API calls.** The worker itself must be externally triggered via a POST to `/api/internal/workers/run`, which requires `WORKER_SECRET` — a variable not present in the actual `.env` file.

- **SLA Engine:** Policy CRUD, breach detection, and notification hooks are all fully implemented. The elapsed-time calculation is wall-clock only — it does **not** apply business-hours filtering despite `businessHoursOnly` being stored per rule and the calendar data being fetched. SLA evaluation is never automatically triggered by work-order state transitions.

- **PM Generator:** Work-order generation logic and idempotency guards are complete and correct. The `calculateNextDueDate` function passes all 6 unit tests. However, PM jobs are **never enqueued automatically** — not when a plan is created, not on a schedule, not on any event. Only acceptance tests manually `prisma.backgroundJob.create` to simulate enqueueing.

- **Notification System:** The most complete of the four. In-app creation, email delivery pipeline, idempotency, access-scope filtering, templates, and preferences are all implemented. 11 unit tests pass, plus 2 PGlite persistence tests. The main gap is that `executeNotificationProcessingJob` (called by the `PROCESS_NOTIFICATIONS` background job) **marks deliveries as SENT without actually sending email** — it sets `status: 'SENT'` directly without calling `processNotificationEmailDeliveries()` or any email provider. Real email sending only happens via `runNotificationWorker()` at `/api/internal/notifications/process`, which uses a separate secret (`NOTIFICATION_WORKER_SECRET`) absent from both `.env` and `.env.example`.

---

## 1. Implementation Status

| Component | Status | Evidence |
|---|---|---|
| Background Worker — Queue/Execution Engine | IMPLEMENTED BUT NOT VERIFIED | No external scheduler triggers it |
| Background Worker — WORKER_SECRET configured | NOT IMPLEMENTED | `WORKER_SECRET` absent from `.env` |
| SLA Engine — Policy/Calendar CRUD | IMPLEMENTED BUT NOT VERIFIED | No runtime execution traced |
| SLA Engine — Breach Detection | IMPLEMENTED BUT NOT VERIFIED | Never auto-triggered from WO events |
| SLA Engine — Business Hours Calculation | BROKEN | `businessHoursOnly` flag is stored but never applied in time math |
| PM Generator — Next-Due Calculation | COMPLETE AND VERIFIED | 6/6 unit tests pass |
| PM Generator — Auto Job Enqueueing | NOT IMPLEMENTED | No code path enqueues PM jobs in production |
| PM Generator — Work Order Generation Logic | IMPLEMENTED BUT NOT VERIFIED | Tested only via acceptance tests against `zemifix_acceptance` |
| Notification System — In-App Creation | IMPLEMENTED BUT NOT VERIFIED | Unit-tested with mocks; not runtime-verified |
| Notification System — Email Delivery Pipeline | IMPLEMENTED BUT NOT VERIFIED | PGlite persistence test passes; real send untested |
| Notification System — `PROCESS_NOTIFICATIONS` job email sending | BROKEN | Marks SENT without calling provider |
| Integration — PM → Worker → Work Order | IMPLEMENTED BUT DISCONNECTED | Chain works if PM job exists; never auto-enqueued |
| Integration — SLA → Breach → Notification | IMPLEMENTED BUT DISCONNECTED | Chain works if SLA job exists; never auto-triggered |
| Integration — Email delivery via background job | BROKEN | Wrong function called; no actual send |

---

## 2. Component Detail

### 2.1 Background Worker

**Status: IMPLEMENTED BUT NOT VERIFIED (scheduler missing; WORKER_SECRET absent)**

#### File
`src/lib/services/backgroundJobService.ts`

#### How a job enters the queue

`enqueueBackgroundJob(params)` calls `prisma.backgroundJob.upsert` with `where: { idempotencyKey }`. This is a correct idempotency guard — a second call with the same key returns the existing row without duplication.

Supported job types (defined in the `EnqueueJobParams` interface):
- `GENERATE_PREVENTIVE_MAINTENANCE`
- `MONITOR_SLAS`
- `PROCESS_NOTIFICATIONS`
- `ANCHOR_DAILY_AUDIT_LOGS`

**Critical finding:** Searching the entire `src/` tree for callers of `enqueueBackgroundJob` finds only two call sites:

1. `enqueueDailyAuditAnchorJob()` in `backgroundJobService.ts` itself — which enqueues `ANCHOR_DAILY_AUDIT_LOGS`.
2. `recoverMissedAuditAnchorDays()` in `backgroundJobService.ts` — which calls `enqueueDailyAuditAnchorJob`.

**No production code enqueues `GENERATE_PREVENTIVE_MAINTENANCE`, `MONITOR_SLAS`, or `PROCESS_NOTIFICATIONS` jobs.** These are only enqueued in acceptance tests by directly calling `prisma.backgroundJob.create`.

#### How a worker picks up a job

`claimNextBackgroundJob(workerId, targetJobType?)` issues a `SELECT … FOR UPDATE SKIP LOCKED` query inside a Prisma transaction. This is correct and safe for concurrent workers. The job is marked `RUNNING` with a 5-minute lease (`expiresAt`). On re-entry, an expired `RUNNING` job is reclaimed.

`runBackgroundWorker(workerId, targetJobType?)` calls `claimNextBackgroundJob`, dispatches to the right executor, then applies an **ownership fencing check** using `updateMany` with `WHERE workerId = ? AND status = 'RUNNING' AND expiresAt > now`. This correctly prevents a worker from completing a job whose lease was stolen.

#### How the worker is invoked

`POST /api/internal/workers/run` — authenticated by `x-worker-secret` header matching `process.env.WORKER_SECRET`.

`GET /api/internal/workers/metrics` — authenticated by session token (normal user auth).

**Critical finding:** `WORKER_SECRET` is required to be ≥ 32 characters but is **absent from `.env`**. The env schema (`src/lib/env.ts`) requires it. The endpoint returns HTTP 401 if the secret is unset or under 32 characters. No external trigger (cron job, Vercel cron, cloud scheduler, `setInterval`) calls this endpoint.

#### Retry and failure handling

On failure, `retryCount` increments and status becomes `RETRYING` (or `FAILED` if `retryCount >= maxRetries`). Exponential backoff is applied: `backoffMs = 2^retryCount * 1000`, stored in `expiresAt`. The next `claimNextBackgroundJob` picks up `RETRYING` jobs whose `expiresAt < now`. This is correct.

#### Pending jobs surviving restarts

Yes — jobs are stored in the `background_jobs` table in PostgreSQL, so they survive process restarts. Status transitions persist to the database.

#### Worker heartbeat

`updateWorkerHeartbeat(workerId, currentJobId?)` upserts a `background_workers` row. This is called at claim and completion time. No watchdog process monitors stale heartbeats.

#### Database models

```
background_jobs         (id, jobType, status, payload, result, retryCount, maxRetries,
                         workerId, startedAt, expiresAt, completedAt, lastError,
                         idempotencyKey, createdAt, updatedAt)

background_workers      (id, workerId, status, currentJobId, lastHeartbeatAt,
                         createdAt, updatedAt)
```

Index: `(status, jobType, expiresAt, createdAt)` — optimal for the `claimNextBackgroundJob` query.

---

### 2.2 SLA Engine

**Status: PARTIALLY IMPLEMENTED — business-hours math is missing; auto-triggering is absent**

#### Files
- `src/lib/services/slaService.ts`
- `src/app/api/sla/policies/route.ts`
- `src/app/api/sla/breaches/route.ts`
- `prisma/migrations/20261110000006_stage_r1_contracts_and_sla/migration.sql`

#### Database models

```
sla_calendars           (id, name, timezone, mondayStart/End…fridayStart/End,
                         version, createdAt, updatedAt)

sla_calendar_holidays   (id, calendarId, holidayDate, name)

sla_policies            (id, policyNumber, name, description, calendarId,
                         isActive, deletedAt, createdAt, updatedAt)

sla_rules               (id, slaPolicyId, priority, responseTargetMinutes,
                         resolutionTargetMinutes, businessHoursOnly)
                         UNIQUE (slaPolicyId, priority)

sla_breach_logs         (id, workOrderId, slaPolicyId, priority, breachType,
                         slaCycle, targetMinutes, actualElapsedMinutes, breachedAt)
                         UNIQUE (workOrderId, breachType, slaCycle)

work_orders             (…, slaPolicyId, slaResponseTargetMinutes,
                         slaResolutionTargetMinutes, slaSnapshotPolicyId,
                         slaSnapshotCalendarId, slaSnapshotCalendarVersion,
                         slaSnapshotCalendarData, slaCycle, slaBreaches[])
```

#### SLA assignment

When `createWorkOrder` is called with a `slaPolicyId` (or the work order derives it from a contract), the service snapshots:
- `slaResponseTargetMinutes` and `slaResolutionTargetMinutes` from the matching priority rule
- `slaSnapshotCalendarData` as a JSON copy of the calendar

This immutable snapshot is correct — it means historical SLA targets are preserved even if the policy changes.

#### Breach detection logic

`evaluateWorkOrderSla(workOrderId)`:
1. Loads work order with status history and SLA policy.
2. Finds first transition to `ASSIGNED` or `IN_PROGRESS` as the response timestamp.
3. Calculates `elapsedResponseMinutes` as wall-clock time from `createdAt` to that event.
4. Deducts ON_HOLD intervals from resolution time (correct pause/resume semantics).
5. Logs a `SlaBreachLog` row if elapsed > target. The unique constraint `(workOrderId, breachType, slaCycle)` prevents duplicate breach records.
6. Calls `notifyStaff` for `SLA_WARNING` (at 80% of target) and `SLA_BREACH`.

**Critical finding — business hours not applied:** The `SlaRule` model stores `businessHoursOnly: Boolean`. The calendar data (business hours per weekday, holidays) is fetched and snapshotted. However, `evaluateWorkOrderSla` computes elapsed time as raw wall-clock milliseconds with no business-hours filtering. The calendar and holiday data are loaded but never used in the calculation. If a work order is opened on a Friday evening and the target is "4 business hours," the system will count Saturday and Sunday as elapsed time, potentially logging a false breach.

#### How SLA evaluation is triggered

There are two trigger paths:

1. **Manual/on-demand:** `POST /api/sla/breaches` calls `evaluateAllActiveSlaBreaches()`. This requires a logged-in user and manually triggers evaluation of all open work orders.

2. **Background job:** `MONITOR_SLAS` job type calls `executeSlaMonitoringJob()` which calls `evaluateAllActiveSlaBreaches()`. As noted above, this job is never enqueued automatically.

3. **Secondary endpoint:** `POST /api/internal/notifications/process` runs `runNotificationWorker()` and `evaluateAllActiveSlaBreaches()` concurrently. This requires `NOTIFICATION_WORKER_SECRET` (absent from `.env`).

**SLA evaluation is never automatically triggered by work-order state transitions** (e.g., creation, status change, assignment). `transitionWorkOrderStatus` and `createWorkOrder` do not call any SLA evaluation function.

#### Escalation rules

There are no escalation rules implemented. SLA breaches generate notifications but do not trigger escalation actions (re-assignment, supervisor alert with time-out, priority upgrade). The `SlaBreachLog` is append-only and informational only.

---

### 2.3 Preventive Maintenance Generator

**Status: PARTIALLY IMPLEMENTED — generation logic is correct; auto-enqueueing is absent**

#### Files
- `src/lib/services/backgroundJobService.ts` — `executePreventiveMaintenanceJob`, `calculateNextDueDate`
- `src/app/api/preventive/plans/route.ts` — plan CRUD
- `src/app/api/preventive/plans/[id]/route.ts` — plan status update (ACTIVE/PAUSED/COMPLETED)
- `src/lib/services/pmRecurrence.test.ts` — 6 unit tests for `calculateNextDueDate`

#### Database model

```
maintenance_plans       (id, code, name, description, assetId, branchId,
                         triggerType [TIME|METER], frequency, status [ACTIVE|PAUSED|COMPLETED],
                         assignedTeam, estimatedHours, lastCompleted, nextDue,
                         isOverdue, compliancePercent, checklist, requiredParts,
                         requiredLabor, createdAt, updatedAt, deletedAt)
```

**Missing fields:** No `meterReadingThreshold`, no `meterUnit`, no `lastMeterReading`. The `triggerType` field supports `METER` but no meter-based logic exists in the generator. `METER`-type plans would never generate work orders.

#### Generation logic

`executePreventiveMaintenanceJob(payload?)`:
1. Queries `ACTIVE` maintenance plans where the linked asset is `OPERATIONAL`.
2. For each plan, constructs an `occurrenceKey = pm-occ:<planId>:<today-UTC-date>`.
3. Acquires a PostgreSQL advisory lock `pg_advisory_xact_lock(hashtext(occurrenceKey))` — this prevents race conditions across concurrent workers on the same date.
4. Checks for an existing work order with `description CONTAINS occurrenceKey`. If found, skips. If not found, calls `createWorkOrder()` and updates `nextDue` via `calculateNextDueDate`.

**Issues found:**
- The idempotency check is `description.contains(occurrenceKey)` — a substring search on a text field. This is functional but fragile; if the description format ever changes, duplicate work orders could be created.
- The generator does not check `plan.nextDue <= now`. It generates a work order for any active plan on the day the job runs, regardless of whether the plan is actually due.
- Missed schedules are not handled. If the job does not run for 3 days, the system will not generate 3 missed work orders; it will generate one for today and advance `nextDue` by one period.
- `adminUser = prisma.user.findFirst({ where: { isActive: true } })` — the generated work order is attributed to the first active user in the database, not to a designated system account or the plan's assigned team.
- No notification is sent after a PM work order is generated (no `PM_GENERATED` event type; the `PM_REMINDER` template is only used by `createPreventiveMaintenanceReminders` which looks at future `plannedStart` dates on existing work orders).

#### `calculateNextDueDate` — test results

All 6 unit tests pass (`npx vitest run src/lib/services/pmRecurrence.test.ts`):

| Recurrence | Input | Expected output | Result |
|---|---|---|---|
| Daily | 2026-01-15 | 2026-01-16 | ✅ PASS |
| Weekly | 2026-01-15 | 2026-01-22 | ✅ PASS |
| Monthly (Jan 31 → Feb) | 2026-01-31 | 2026-02-28 (clamped) | ✅ PASS |
| Annual leap-year (Feb 29 → non-leap) | 2024-02-29 | 2025-02-28 | ✅ PASS |
| Quarterly | 2026-01-15 | 2026-04-15 | ✅ PASS |
| Annual (12 months) | 2026-05-10 | 2027-05-10 | ✅ PASS |

#### How PM jobs should be enqueued (but are not)

The only code that creates a `GENERATE_PREVENTIVE_MAINTENANCE` job in the database is acceptance test code in `phase4_5_workflows.test.ts` using `prisma.backgroundJob.create` directly. No production route or service ever calls `enqueueBackgroundJob({ jobType: 'GENERATE_PREVENTIVE_MAINTENANCE', … })`.

For the system to work automatically, something external must POST to `/api/internal/workers/run` with `{ jobType: 'GENERATE_PREVENTIVE_MAINTENANCE' }` on a daily schedule.

---

### 2.4 Notification System

**Status: IMPLEMENTED BUT NOT VERIFIED (email delivery broken in background job path)**

#### Files
- `src/lib/services/notificationService.ts`
- `src/app/api/notifications/route.ts`, `[id]/route.ts`, `preferences/route.ts`, `read-all/route.ts`, `templates/route.ts`
- `src/app/api/portal/notifications/route.ts`
- `src/app/api/internal/notifications/process/route.ts`
- `prisma/migrations/20261110000009_stage_r1_notifications/migration.sql`

#### Database models

```
notifications                   (id, realm [STAFF|CUSTOMER], recipientUserId?,
                                  recipientContactId?, customerId?, siteId?,
                                  branchId?, departmentId?, eventType,
                                  idempotencyKey UNIQUE, title, body, link,
                                  emailSubject, emailBody, data, inAppEnabled,
                                  createdAt, readAt)

notification_preferences        (id, recipientUserId?, recipientContactId?,
                                  eventType, inAppEnabled, emailEnabled)
                                  UNIQUE (recipientUserId, eventType)
                                  UNIQUE (recipientContactId, eventType)

notification_templates          (id, realm, eventType, titleTemplate, bodyTemplate,
                                  emailSubject, emailBody, isActive)
                                  UNIQUE (realm, eventType)

notification_email_deliveries   (id, notificationId UNIQUE, status [PENDING|SENDING|SENT|FAILED],
                                  attemptCount, maxAttempts [default 5],
                                  nextAttemptAt, lockedAt, sentAt, lastError,
                                  providerMessageId, createdAt, updatedAt)

notification_delivery_attempts  (id, deliveryId, attemptNumber, status [STARTED|SENT|FAILED],
                                  attemptedAt, completedAt, error, providerMessageId)
                                  UNIQUE (deliveryId, attemptNumber)
```

#### Templates seeded by migration

The migration `20261110000009_stage_r1_notifications` seeds the following templates:

**STAFF realm:** `WORK_ORDER_ASSIGNED`, `WORK_ORDER_REASSIGNED`, `WORK_ORDER_STATUS_CHANGED`, `WORK_REQUEST_NEW`, `WORK_REQUEST_DECIDED`, `APPROVAL_REQUESTED`, `APPROVAL_DECIDED`, `SLA_WARNING`, `SLA_BREACH`, `LOW_STOCK`, `PURCHASE_ORDER_ISSUED`, `GOODS_RECEIVED`, `INVOICE_APPROVAL_REQUESTED`, `INVOICE_APPROVED`, `INVOICE_ISSUED`, `INVOICE_SENT`, `PAYMENT_RECORDED`, `PAYMENT_ALLOCATED`, `CREDIT_NOTE_ISSUED`, `PM_REMINDER`, `CUSTOMER_QUOTE_DECISION`

**CUSTOMER realm:** `PORTAL_QUOTE_DECISION`, `CUSTOMER_WORK_ORDER_STATUS`, `CUSTOMER_INVOICE_ISSUED`, `CUSTOMER_PAYMENT_RECORDED`, `CUSTOMER_PAYMENT_ALLOCATED`, `CUSTOMER_CREDIT_NOTE_ISSUED`, `CUSTOMER_WORK_REQUEST_DECISION`

**Missing templates:** `PM_GENERATED` (no template for PM work-order generation events), `USER_ACTIVATION` (created on-the-fly in `importService.ts` using an upsert, not in the migration).

#### Notification creation flow (connected events)

| Event | Triggered from | Template used |
|---|---|---|
| Work order created with assignee | `createWorkOrder` → `notifyStaff` | `WORK_ORDER_ASSIGNED` |
| Work order assigned | `assignWorkOrder` → `notifyStaff` | `WORK_ORDER_ASSIGNED` |
| Work order reassigned | `assignWorkOrder` → `notifyStaff` | `WORK_ORDER_REASSIGNED` |
| Work order status change | `transitionWorkOrderStatus` → `notifyStaff` | `WORK_ORDER_STATUS_CHANGED` |
| Customer portal status update | `transitionWorkOrderStatus` → `notifyCustomerContact` | `CUSTOMER_WORK_ORDER_STATUS` |
| New work request | `createWorkRequest` → `notifyStaff` | `WORK_REQUEST_NEW` |
| Work request decided | `processWorkRequestDecision` → `notifyStaff` | `WORK_REQUEST_DECIDED` |
| Approval requested | `approvalService` → `notifyStaff` | `APPROVAL_REQUESTED` |
| Approval decided | `approvalService` → `notifyStaff` | `APPROVAL_DECIDED` |
| SLA warning (80% of target) | `evaluateWorkOrderSla` → `notifyStaff` | `SLA_WARNING` |
| SLA breach | `evaluateWorkOrderSla` → `notifyStaff` | `SLA_BREACH` |
| Low stock | `inventoryService` → `notifyStaff` | `LOW_STOCK` |
| Purchase order issued | `procurementService` → `notifyStaff` | `PURCHASE_ORDER_ISSUED` |
| Invoice events | `billingService` → `notifyStaff` / `notifyCustomerContact` | Various |
| PM reminder (future work orders) | `createPreventiveMaintenanceReminders` → `notifyStaff` | `PM_REMINDER` |
| User import activation | `importService` → `notifyStaff` | `USER_ACTIVATION` |
| Quote decision | `quoteService` → `notifyCustomerContact` / `notifyStaff` | `PORTAL_QUOTE_DECISION` / `CUSTOMER_QUOTE_DECISION` |

#### Access-scope filtering

`createForRecipient` checks `recipient.accessScope` and `branchId` path prefix before creating a notification. Users outside the event's branch/department scope (without a `UserScopeGrant`) receive null — the notification is silently dropped. This is correct and security-preserving.

#### Email provider

`createResendNotificationEmailProvider()` uses the [Resend](https://resend.com) SDK. It requires:
- `RESEND_API_KEY` — present in `.env` as `re_EXc5NK75_...`
- `NOTIFICATIONS_EMAIL_FROM` — **absent from `.env`** and from `.env.example`

If `NOTIFICATIONS_EMAIL_FROM` is not set, `processNotificationEmailDeliveries` will throw `NOTIFICATION_EMAIL_PROVIDER_NOT_CONFIGURED` for every delivery attempt.

#### Critical bug: `executeNotificationProcessingJob` does not send email

The `PROCESS_NOTIFICATIONS` background job calls `executeNotificationProcessingJob()` (in `backgroundJobService.ts`, lines 273–313). This function:

1. Queries `notification_email_deliveries` where `status IN ('PENDING', 'FAILED')` and `attemptCount < 5`.
2. For each delivery, sets `status = 'SENT'` directly.
3. **Does not call `processNotificationEmailDeliveries()`** (the full email-sending function in `notificationService.ts`).
4. **Does not call any email provider.**
5. Does not update `NotificationDeliveryAttempt` records.

This means that when the `PROCESS_NOTIFICATIONS` background job runs, it will silently mark all pending email deliveries as `SENT` without sending a single email. The correct function to call is `processNotificationEmailDeliveries()` from `notificationService.ts`, which implements the full locking, retry, provider call, and attempt-logging pipeline.

The working email path exists at `POST /api/internal/notifications/process` → `runNotificationWorker()` → `processNotificationEmailDeliveries()`. But this endpoint requires `NOTIFICATION_WORKER_SECRET` which is not in `.env` or `.env.example`.

#### Test results

```
npx vitest run src/lib/services/pmRecurrence.test.ts
                src/lib/services/notificationService.test.ts
                src/lib/services/workOrderNotification.test.ts
→ 11/11 tests PASS

npx vitest run src/lib/services/notificationPersistence.test.ts
→ 2/2 tests PASS (runs against in-memory PGlite)
```

---

## 3. Integration Audit

### Does the PM Generator enqueue jobs for the Worker?

**No.** No production code path ever calls `enqueueBackgroundJob({ jobType: 'GENERATE_PREVENTIVE_MAINTENANCE', … })`. The only places a PM job appears in the queue are:
- Acceptance tests (`phase4_5_workflows.test.ts`) calling `prisma.backgroundJob.create` directly against `zemifix_acceptance`.
- Manual calls to `POST /api/internal/workers/run` with `{ jobType: 'GENERATE_PREVENTIVE_MAINTENANCE' }`.

### Does the Worker process SLA monitoring jobs?

**Only if manually triggered.** `runBackgroundWorker` with job type `MONITOR_SLAS` does call `evaluateAllActiveSlaBreaches`. But `MONITOR_SLAS` jobs are never enqueued by any production code.

### Does an SLA breach generate a notification?

**Yes, when evaluation runs.** `evaluateWorkOrderSla` calls `notifyStaff` with `SLA_BREACH` and `SLA_WARNING` event types inside a transaction. If the template exists (it does — seeded by migration) and the recipient passes scope checks, a `Notification` row and a `NotificationEmailDelivery` row are created correctly.

### Does the Notification System deliver that notification?

**In-app: yes (once the notification is created).** The `GET /api/notifications` endpoint returns unread in-app notifications.

**Email: broken in the background-job path.** If the email is eventually processed by `executeNotificationProcessingJob`, it will be marked SENT without being sent. If processed by `runNotificationWorker()` at `/api/internal/notifications/process`, it would be sent via Resend — but that endpoint's secret is unconfigured.

### Are failures logged and retried?

**Yes — in the `processNotificationEmailDeliveries` path.** The `NotificationDeliveryAttempt` table logs each attempt with status, error, and provider message ID. Exponential backoff (`2^(attemptCount-1)` minutes, capped at 1440) is applied. After `maxAttempts` (5), status is permanently `FAILED`.

**No — in the `executeNotificationProcessingJob` path.** This function does not create attempt records and silently marks everything SENT.

### Are duplicate notifications prevented?

**Yes.** The `idempotencyKey` column on `notifications` has a `UNIQUE` constraint, and `createMany` with `skipDuplicates: true` is used. The key is `${eventKey}:${recipientId}`, making repeated calls for the same event idempotent at the database level.

### Integration flow diagram (as-implemented)

```
PM Plan created (POST /api/preventive/plans)
    │
    └─► Plan stored in DB — NO job enqueued
         (gap: nothing automatically runs the generator)

Manual/external trigger:
POST /api/internal/workers/run { jobType: 'GENERATE_PREVENTIVE_MAINTENANCE' }
    │   [requires WORKER_SECRET, not set in .env]
    │
    ▼
runBackgroundWorker()
    │
    ▼
executePreventiveMaintenanceJob()
    │
    ├─► Advisory lock per plan+date
    ├─► createWorkOrder() → notifyStaff(WORK_ORDER_ASSIGNED) ✓
    └─► updateMaintenancePlan(nextDue) ✓
         │
         └─► Notification row created
              │
              └─► NotificationEmailDelivery row (PENDING)
                    │
                    ├─► Path A: PROCESS_NOTIFICATIONS background job
                    │       └─► executeNotificationProcessingJob()
                    │               └─► Sets SENT with no actual email ✗ (BUG)
                    │
                    └─► Path B: POST /api/internal/notifications/process
                            └─► runNotificationWorker()
                                    └─► processNotificationEmailDeliveries()
                                            └─► Resend.send() ✓
                                            [requires NOTIFICATION_WORKER_SECRET, not set]

Work order status change → notifyStaff(WORK_ORDER_STATUS_CHANGED) ✓
SLA evaluation (manual/job) → notifyStaff(SLA_BREACH) ✓
    [SLA elapsed time is wall-clock only, no business-hours deduction] ✗
```

---

## 4. Security and Reliability Issues

### Critical

1. **`WORKER_SECRET` absent from `.env`:** The worker endpoint (`/api/internal/workers/run`) returns 401 for every request. No background processing of any kind (PM generation, SLA monitoring, notification delivery) can occur.

2. **`NOTIFICATIONS_EMAIL_FROM` absent from `.env` and `.env.example`:** `processNotificationEmailDeliveries()` throws `NOTIFICATION_EMAIL_PROVIDER_NOT_CONFIGURED` without it. No notification emails are sent.

3. **`executeNotificationProcessingJob` marks deliveries SENT without sending:** Any deployment relying on the `PROCESS_NOTIFICATIONS` background job for email delivery will silently drop all emails while reporting success. This is a logic error in `backgroundJobService.ts` lines 273–313.

4. **No automatic job enqueueing for PM or SLA:** PM work orders and SLA breach checks only happen when someone manually triggers them. This defeats the purpose of an automated CMMS.

### High

5. **SLA elapsed-time calculation ignores business hours:** `evaluateWorkOrderSla` calculates elapsed minutes as raw wall-clock time regardless of `businessHoursOnly: true` on the SLA rule. Night hours, weekends, and holidays inflate elapsed time, producing false breach alerts.

6. **PM generator does not check `nextDue`:** `executePreventiveMaintenanceJob` generates a work order for every active plan regardless of whether it is due today. If run daily, this creates one work order per plan per day, not one per due cycle.

7. **`NOTIFICATION_WORKER_SECRET` not documented or set:** The `/api/internal/notifications/process` endpoint uses a separate secret not referenced in `.env.example`. Its name differs from `WORKER_SECRET`, creating confusion about which credential does what.

### Medium

8. **PM generator uses `findFirst({ where: { isActive: true } })` as the creating user:** PM work orders are attributed to an arbitrary first user. This breaks audit trails and prevents proper maker-checker accountability.

9. **PM idempotency check uses `description.contains(occurrenceKey)`:** A substring search on description text is fragile. If description format changes or is truncated, duplicate work orders could be generated for the same occurrence.

10. **Audit anchor scheduler test fails against dev database:** `auditAnchorScheduler.test.ts` has one failing test (expected date `2185-08-24`, received `2065-07-08`) because the test generates a future-biased random offset that varies run to run. This is a test bug (non-deterministic test date), not a logic bug. 2/3 tests pass.

11. **Missing `METER`-type PM logic:** `triggerType: METER` is stored and accepted by the API, but `executePreventiveMaintenanceJob` has no meter-reading branch. All `METER`-type plans are silently skipped.

---

## 5. Existing Tests and Results

| Test file | Type | Passes | Notes |
|---|---|---|---|
| `pmRecurrence.test.ts` | Unit (pure function) | 6/6 ✅ | Tests `calculateNextDueDate` only; no DB |
| `notificationService.test.ts` | Unit (mocked DB) | 4/4 ✅ | Tests `notifyStaff`, `notifyCustomerContact`, delivery retry |
| `workOrderNotification.test.ts` | Unit (mocked DB) | 1/1 ✅ | Tests `assignWorkOrder` calls `notifyStaff` |
| `notificationPersistence.test.ts` | Integration (PGlite) | 2/2 ✅ | Tests schema constraints and idempotency |
| `auditAnchorScheduler.test.ts` | Integration (live DB) | 2/3 ⚠️ | 1 failure due to non-deterministic test date |
| `phase4_4_workflows.test.ts` | Acceptance (zemifix_acceptance) | Not run | Requires `zemifix_acceptance` |
| `phase4_5_workflows.test.ts` | Acceptance (zemifix_acceptance) | Not run | Requires `zemifix_acceptance`; tests PM worker |
| `phase4_6_workflows.test.ts` | Acceptance (zemifix_acceptance) | Not run | Requires `zemifix_acceptance` |
| `pgRlsFailClosed.test.ts` | Integration (live DB) | Not run in this audit | Tests PostgreSQL RLS |
| `pgRlsPolicies.test.ts` | Integration (live DB) | Not run in this audit | Tests PostgreSQL RLS |

**Key observation:** The only test that exercises the PM worker end-to-end (`phase4_5_workflows.test.ts`) runs against `zemifix_acceptance` and manually creates the background job via raw Prisma calls. The acceptance tests are well-written but cannot be used to validate production behaviour against `zemifix_dev`.

---

## 6. Prioritized Implementation Roadmap

### Priority 1 — Unblock all automation (without these nothing automatic works)

**P1-A: Add `WORKER_SECRET` to `.env` and `.env.example`**  
Generate a 40+ character random string and add it. Without this, the worker endpoint returns 401 always.

**P1-B: Add `NOTIFICATIONS_EMAIL_FROM` to `.env` and `.env.example`**  
Example: `NOTIFICATIONS_EMAIL_FROM=ZemiFix CMMS <notifications@yourdomain.com>`. Without this, all email delivery throws at provider initialization.

**P1-C: Fix `executeNotificationProcessingJob` to actually send email**  
In `backgroundJobService.ts`, replace the body of `executeNotificationProcessingJob` with a call to `processNotificationEmailDeliveries({ batchSize: 50 })` imported from `notificationService.ts`. The current implementation marks deliveries SENT with no actual send.

**P1-D: Set up an external scheduler to call the worker endpoint**  
Choose one of:
- Vercel Cron Jobs (add `vercel.json` with `crons` array calling `/api/internal/workers/run`)
- A `cron.ts` script invoked by `node-cron` or a hosted cron service
- A cloud scheduler (AWS EventBridge, GCP Cloud Scheduler) targeting the endpoint

Minimum schedule: every 15 minutes for SLA/notification processing; daily for PM generation.

### Priority 2 — Make PM generation correct

**P2-A: Enqueue PM job on a schedule or trigger**  
Either add a dedicated API route `/api/internal/workers/enqueue-pm` that creates the job and is called by the scheduler, or add PM job enqueueing logic inside the daily scheduler.

**P2-B: Add `nextDue <= now` filter to `executePreventiveMaintenanceJob`**  
Change the `planWhere` filter to include `nextDue: { lte: now }`. Without this, the generator creates a work order for every active plan every day regardless of schedule.

**P2-C: Replace arbitrary first-user attribution**  
Add a `systemActorUserId` to company settings or introduce a system service account. Use it for PM work-order creation instead of `findFirst({ where: { isActive: true } })`.

**P2-D: Implement `METER`-type PM generation**  
Add meter reading lookup and threshold comparison to `executePreventiveMaintenanceJob` for plans with `triggerType = 'METER'`.

### Priority 3 — Correct SLA calculations

**P3-A: Implement business-hours elapsed-time calculation**  
Write a `calcBusinessMinutes(start, end, calendar, holidays)` utility. Apply it inside `evaluateWorkOrderSla` when `rule.businessHoursOnly === true`. The calendar data is already snapshotted on the work order (`slaSnapshotCalendarData`) — the data is available, the function just doesn't use it.

**P3-B: Trigger SLA evaluation on work-order state transitions**  
Call `evaluateWorkOrderSla(wo.id)` at the end of `transitionWorkOrderStatus` (or enqueue a `MONITOR_SLAS` job for that specific work order) so breach detection happens immediately on status changes, not only on periodic scans.

**P3-C: Add configurable escalation rules**  
Currently, breaches log a notification and stop. Add an escalation model (e.g., notify supervisor after N additional minutes, escalate priority) and wire it into the breach detection path.

### Priority 4 — Operational completeness

**P4-A: Add PM notification on work-order generation**  
Add a `PM_GENERATED` notification template and call `notifyStaff` after `createWorkOrder` succeeds inside `executePreventiveMaintenanceJob`.

**P4-B: Harden PM idempotency key**  
Store the `occurrenceKey` in a dedicated `maintenancePlanOccurrences` table (or as a separate field on the work order) instead of embedding it in the description. This makes the duplicate check a proper indexed lookup.

**P4-C: Document `NOTIFICATION_WORKER_SECRET` in `.env.example`**  
The `/api/internal/notifications/process` endpoint uses `process.env.NOTIFICATION_WORKER_SECRET` but this variable appears nowhere in `.env.example`. Add it with a comment explaining it is the secret for the notification-processing endpoint, distinct from `WORKER_SECRET`.

**P4-D: Fix `auditAnchorScheduler.test.ts` non-deterministic date test**  
The failing test generates a random future date offset. Replace with a fixed deterministic future date to make the test reliable.

---

## 7. Summary Table

| Finding | Severity | File(s) |
|---|---|---|
| `WORKER_SECRET` absent from `.env` | Critical | `.env`, `src/lib/env.ts` |
| `NOTIFICATIONS_EMAIL_FROM` absent from `.env` | Critical | `.env`, `notificationService.ts:327` |
| `executeNotificationProcessingJob` marks SENT without sending | Critical | `backgroundJobService.ts:273–313` |
| No PM or SLA jobs ever enqueued automatically | Critical | `backgroundJobService.ts` |
| SLA ignores business hours | High | `slaService.ts:167–185` |
| PM generator ignores `nextDue` | High | `backgroundJobService.ts:197–246` |
| PM attribution to arbitrary first user | Medium | `backgroundJobService.ts:214` |
| PM idempotency via substring search | Medium | `backgroundJobService.ts:224` |
| `METER`-type PM unimplemented | Medium | `backgroundJobService.ts` |
| `NOTIFICATION_WORKER_SECRET` undocumented | Medium | `.env.example`, `notificationService.ts:325` |
| No SLA escalation rules | Medium | `slaService.ts` |
| `auditAnchorScheduler.test.ts` non-deterministic failure | Low | `auditAnchorScheduler.test.ts:74` |
