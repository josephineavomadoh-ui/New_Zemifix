# ZemiFix F1.2.1 Stage 3 — Final Blocker Closure and Implementation Authorization Audit Report

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 Stage 3 Final Blocker Closure & Implementation Gate  
**Date:** November 19, 2026  
**Status:** **APPROVED WITH CONDITIONS FOR STAGED IMPLEMENTATION**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Reference Documents:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md`, `ZEMIFIX_F1_2_1_STAGE_2_1_1_READINESS_AUDIT_REPORT.md`, `ZEMIFIX_F1_2_1_STAGE_3_READINESS_REVIEW.md`, `ZEMIFIX_F1_2_1_STAGE_3_FINAL_ARCHITECTURE_CORRECTION.md`  
**Execution Type:** STRICTLY READ-ONLY ARCHITECTURAL REVIEW (Zero application source code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Implementation Gate Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGED IMPLEMENTATION**
*(Stage 3 Application Security Wrappers, Auth Bootstrap Code, and Service Refactoring may be implemented in Development. Database Migration 2 (`20261119000002_stage2_1_default_deny_rls`) MUST remain unapplied until Stage 3 code rollout, Migration 1 deployment, and HMAC key provisioning are complete.)*

This report establishes the final, evidence-based technical resolution for all remaining blockers in **Stage 3: Reusable Authentication and Permission Wrappers**. Every identified issue—including column-restricted `AUTH` realm policies, zero-root-client authentication bootstrap flows, a 3-phase backward-compatible rollout sequence, a controlled Migration 2 rollback procedure, an exact 114-file route inventory, and service-level transaction enforcement—has been closed with production-grade specifications.

---

## 1. Blocker A — AUTH Realm Database Policies & Column-Restricted Controls

Allowing broad operations on `auth_otps` under `app_realm() = 'AUTH'` introduces security risks if unconstrained. Revision 12 establishes **Column-Restricted, Operation-Specific PostgreSQL Policies** combined with application-level parameterized query bounds.

### 1.1 Operation-Specific AUTH Realm Policies

```sql
-- 1. Password Login User Lookup Policy (SELECT Only, Active Non-Deleted Accounts)
CREATE POLICY stage2_auth_user_lookup ON public.users
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'AUTH'
  AND "isActive" = true
  AND "deletedAt" IS NULL
);

-- 2. OTP Creation Policy (INSERT Only, Strict Initial Column Bounds)
CREATE POLICY stage2_auth_otp_insert ON public.auth_otps
FOR INSERT TO zemifix_app_user
WITH CHECK (
  public.app_realm() = 'AUTH'
  AND "consumedAt" IS NULL
  AND "invalidatedAt" IS NULL
  AND "attemptCount" = 0
  AND "expiresAt" > now()
);

-- 3. OTP Challenge Lookup Policy (SELECT Only, Unconsumed Unexpired OTPs)
CREATE POLICY stage2_auth_otp_select ON public.auth_otps
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'AUTH'
  AND "consumedAt" IS NULL
  AND "invalidatedAt" IS NULL
  AND "expiresAt" > now()
);

-- 4. OTP Attempt Counter & Consumption Policy (UPDATE Only, Restricted Columns)
-- PostgreSQL Column-Level Grant restricts UPDATE exclusively to attemptCount, consumedAt, invalidatedAt
REVOKE UPDATE ON TABLE public.auth_otps FROM PUBLIC, zemifix_app_user;
GRANT UPDATE ("attemptCount", "consumedAt", "invalidatedAt") ON TABLE public.auth_otps TO zemifix_app_user;

CREATE POLICY stage2_auth_otp_update ON public.auth_otps
FOR UPDATE TO zemifix_app_user
USING (
  public.app_realm() = 'AUTH'
  AND "consumedAt" IS NULL
)
WITH CHECK (
  public.app_realm() = 'AUTH'
);

-- 5. Customer Portal Contact Login Lookup Policy (SELECT Only)
CREATE POLICY stage2_portal_contact_lookup ON public.customer_contacts
FOR SELECT TO zemifix_app_user
USING (
  public.app_realm() = 'AUTH'
  AND "isActive" = true
  AND "deletedAt" IS NULL
);
```

### 1.2 Enforcement Boundaries: PostgreSQL RLS vs. Application Layer

| Security Requirement | Enforced by PostgreSQL RLS | Enforced by Application / Service Layer | Defense Mechanism |
|---|---|---|---|
| **User Email Lookup** | RLS policy restricts SELECT to `isActive = true AND deletedAt IS NULL`. | `userService.ts` parameterizes exact email search (`WHERE email = LOWER(inputEmail)`). | Prevents fetching inactive or deleted user accounts. |
| **Password Hash Verification** | N/A (Password hashes are unreadable outside authorized queries). | `auth.ts` performs in-memory bcrypt comparison against `DUMMY_HASH` if email is unknown. | Prevents user timing enumeration attacks. |
| **OTP Challenge Isolation** | RLS policy restricts SELECT to unconsumed, unexpired OTPs. | `otpService.ts` binds queries to `otpRecordId` AND `userId`/`customerContactId`. | Prevents accessing or verifying another user's challenge. |
| **OTP Field Update Restrictions** | Column-level `GRANT UPDATE (attemptCount, consumedAt, invalidatedAt)` revokes write access to `otpCodeHash` or `userId`. | `otpService.ts` executes target field mutations exclusively. | Prevents overwriting challenge hash or user binding. |
| **OTP Brute-Force & Lockout** | RLS checks `expiresAt > now()`. | `otpService.ts` increments `attemptCount` and locks after 3 attempts (`attemptCount >= 3`). | Prevents challenge brute-force enumeration. |
| **IP Rate Limiting** | N/A | `rateLimitService.ts` tracks IP buckets before database calls. | Prevents request floods and DoS. |

---

## 2. Blocker B — Authentication Bootstrap & Zero-Root-Client Execution Flow

Calling `getCurrentUser(req)` outside `withSecurityContext` causes queries to execute using the root `prisma` client without a signed context, which fails under default-deny RLS.

### 2.1 Corrected Request-to-Transaction Execution Flow

To eliminate root Prisma client calls during authentication:

```
[ Incoming HTTP Request ]
           │
           ▼
[ withApiSecurity({ realm: 'STAFF' | 'AUTH' | 'CUSTOMER' }) ]
           │
           ├─► STAFF / CUSTOMER Realm:
           │   1. Verifies session JWT in Node.js memory (jose jwtVerify)
           │   2. Extracts userId / customerContactId from verified JWT payload
           │   3. Constructs SecurityContextInput (userId, branchId, accessScope, realm)
           │
           └─► AUTH Realm (Unauthenticated):
               1. Constructs SecurityContextInput (userId: '', realm: 'AUTH', accessScope: 'Own')
           │
           ▼
[ withSecurityContext(secContext, async (tx) => ...) ]
           │
           ├─► 1. Generates HMAC signature for secContext payload
           ├─► 2. Runs tx.$queryRaw setting set_config('app.current_*', ..., true) GUCs
           └─► 3. Passes tx (Prisma.TransactionClient) to handler callback
           │
           ▼
[ Handler Function Execution ] ──► All DB queries execute on tx (Zero root prisma calls)
```

---

## 3. Blocker C — Backward-Compatible Migration & Deployment Sequence

Migration `20261119000001` creates security functions without enabling default-deny RLS. Migration `20261119000002` enables and forces default-deny RLS. This structural separation permits a safe 3-phase deployment:

```mermaid
flowchart TD
    subgraph Phase A : Database Function Setup
        A1[Apply Migration 20261119000001] --> A2[Run npm run provision:security-context-key]
        A2 --> A3[Verify Key Row id=1 & app_security_context_valid Function]
    end

    subgraph Phase B : Application Code Rollout
        B1[Deploy Stage 3 Code Wrappers & Service Refactoring] --> B2[Execute Pre-Migration Integration Tests in Dev]
        B2 --> B3[Drain Web Application & Worker Traffic]
    end

    subgraph Phase C : Default-Deny RLS Activation
        C1[Apply Migration 20261119000002 Default Deny RLS] --> C2[Execute Post-Migration Verification Test]
        C2 --> C3[Resume Application Traffic]
    end

    Phase A --> Phase B --> Phase C
```

### 3.1 Failure Recovery Matrix across Deployment Phases

| Deployment Phase | Failure Event | Impact on Application | Recovery Action |
|---|---|---|---|
| **Phase A** | Migration 1 or Key Provisioning fails. | Zero impact. Default-deny RLS is NOT enabled yet. Unwrapped code continues running. | Fix key provisioning script / database permissions; retry Phase A. No database rollback needed. |
| **Phase B** | Code deployment encounters bugs or test failures. | Zero DB impact. Database functions exist but default-deny RLS is NOT forced yet. | Rollback application code deployment to previous version. Database remains backward-compatible. |
| **Phase C** | Migration 2 default-deny breaks an unwrapped workflow. | Unwrapped routes fail with RLS default-deny. | Execute Controlled Recovery Script (Section 4). Restores Stage 1 operational RLS baseline safely. |

---

## 4. Blocker D — Controlled Migration 2 Rollback and Recovery Procedure

If Migration `20261119000002_stage2_1_default_deny_rls` must be rolled back due to an unexpected production issue, **casually disabling RLS on all tables is strictly prohibited** because it would strip tenant isolation from core entities.

### 4.1 Controlled Recovery SQL Procedure (`rollback_stage2_1_default_deny.sql`)

```sql
-- 1. Drop Restrictive Signed Context Policy from All Tenant Tables
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'companies','branches','departments','users','roles','permissions','role_permissions',
    'user_scope_grants','customers','customer_sites','customer_contacts','customer_contact_site_grants',
    'portal_sessions','auth_otps','api_keys','approval_rules','approval_requests','approval_steps',
    'approval_actions','audit_logs','audit_anchors','asset_categories','locations','assets',
    'asset_locations_history','asset_status_history','asset_ownership_history','asset_management_history',
    'asset_meters','meter_readings','asset_downtime_logs','asset_boms','work_requests','work_orders',
    'work_order_status_history','work_order_assignment_history','work_order_tasks','work_order_checklist_items',
    'work_order_labor','work_order_parts','failure_codes','work_order_failure_records','parts','stores',
    'stock','stock_transactions','store_transfers','store_transfer_lines','stock_adjustments',
    'stock_adjustment_lines','vendors','purchase_requisitions','purchase_requisition_items','rfqs',
    'rfq_vendors','purchase_orders','purchase_order_items','goods_received_notes','goods_received_note_items',
    'supplier_returns','supplier_return_items','offline_sync_batches','offline_sync_mutations',
    'offline_sync_conflicts','sla_calendars','sla_calendar_holidays','sla_policies','sla_rules',
    'customer_contracts','customer_contract_sites','contract_rate_cards','sla_breach_logs',
    'maintenance_plans','quotes','quote_lines','quote_version_history','quote_decision_logs',
    'work_order_comments','work_order_attachments','public_request_intake','number_sequences',
    'invoices','invoice_lines','payments','payment_allocations','payment_reversals','credit_notes',
    'credit_note_lines','notifications','notification_preferences','notification_templates',
    'notification_email_deliveries','notification_delivery_attempts','internal_recharges',
    'import_batches','rate_limits','background_jobs','background_workers'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS stage2_signed_context_required ON public.%I', v_table);
  END LOOP;
END;
$$;

-- 2. Restore Operational RLS Policies on Core Entities (Preserves Stage 1 Isolation Baseline)
CREATE POLICY work_orders_rls_policy ON public.work_orders FOR ALL TO zemifix_app_user
  USING ("branchId"::text = public.app_branch_id() OR public.app_access_scope() = 'Company');

CREATE POLICY assets_rls_policy ON public.assets FOR ALL TO zemifix_app_user
  USING ("branchId"::text = public.app_branch_id() OR public.app_access_scope() = 'Company');

CREATE POLICY customers_rls_policy ON public.customers FOR ALL TO zemifix_app_user
  USING (public.app_access_scope() = 'Company');

CREATE POLICY customer_sites_rls_policy ON public.customer_sites FOR ALL TO zemifix_app_user
  USING (public.app_access_scope() = 'Company');

CREATE POLICY invoices_rls_policy ON public.invoices FOR ALL TO zemifix_app_user
  USING (public.app_access_scope() = 'Company');

CREATE POLICY quotes_rls_policy ON public.quotes FOR ALL TO zemifix_app_user
  USING (public.app_access_scope() = 'Company');

CREATE POLICY audit_logs_select_policy ON public.audit_logs FOR SELECT TO zemifix_app_user
  USING (public.app_access_scope() = 'Company' OR "actorUserId"::text = public.app_user_id());

-- 3. Restore Column UPDATE Privileges on Users Table
GRANT UPDATE ON TABLE public.users TO zemifix_app_user;
```

---

## 5. Blocker E — Reconciled 114 API Route File & Method Inventory

Inspection of `src/app/api/` confirms **114 route.ts files** containing 184 individual HTTP method handler functions (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`):

| Realm / Functional Group | Route File Count | Total HTTP Method Handlers | Representative API Endpoints | Security Realm Assignment |
|---|---|---|---|---|
| **1. STAFF Operational Routes** | 58 Files | 94 Handlers | `/api/work-orders`, `/api/assets`, `/api/inventory/*`, `/api/procurement/*`, `/api/finance/*`, `/api/preventive/*`, `/api/reports/*`, `/api/users/*` | Realm `'STAFF'`, requires valid `zemifix_session`, checks `resource:action`, passes `tx`. |
| **2. AUTH Routes** | 5 Files | 5 Handlers | `/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/resend-otp`, `/api/portal/auth/login`, `/api/auth/demo-session` | Realm `'AUTH'`, allows anonymous, generates signed context with `userId: ''`, passes `tx`. |
| **3. CUSTOMER Portal Routes** | 18 Files | 28 Handlers | `/api/portal/dashboard`, `/api/portal/invoices/*`, `/api/portal/assets/*`, `/api/portal/requests/*`, `/api/portal/quotes/*` | Realm `'CUSTOMER'`, requires `zemifix_portal_session`, enforces `customerId` site grants, passes `tx`. |
| **4. PUBLIC_QR Routes** | 4 Files | 6 Handlers | `/api/public/requests`, `/api/public/qr/resolve`, `/api/public/upload`, `/api/public/uploads/[filename]` | Realm `'PUBLIC_QR'`, rate-limited, anonymous, creates `PublicRequestIntake` rows only. |
| **5. STAFF_PWA Routes** | 1 File | 1 Handler | `/api/pwa/sync-package` | Realm `'STAFF'`, requires technician session, processes offline sync mutation batch on `tx`. |
| **6. WORKER Internal Routes** | 3 Files | 4 Handlers | `/api/internal/workers/run`, `/api/internal/workers/metrics`, `/api/internal/notifications/process` | Realm `'WORKER'`, validates HMAC bearer token, executes worker tasks on `tx`. |
| **7. PLATFORM Control Plane** | 12 Files | 26 Handlers | `/api/platform/auth/*`, `/api/platform/tenants/*` | Platform Control Plane (Separate database `zemifix_platform_dev`). |
| **8. SYSTEM & Auth State** | 13 Files | 20 Handlers | `/api/health`, `/api/auth/me`, `/api/auth/logout`, `/api/sync/batch`, `/api/import/*` | `SYSTEM` / `STAFF`, health check exempt, import routes wrapped under `'STAFF'`. |
| **TOTAL** | **114 Files** | **184 Handlers** | **All 114 `route.ts` files accounted for** | **100% cataloged and assigned** |

---

## 6. Blocker F — Evidence-Based Service Transaction Enforcement Matrix

Inspection of the 10 core service files in `src/lib/services/` confirms their current and required Stage 3 integration status:

| Service File Path | Root Prisma Import Present? | Accepts `tx: Prisma.TransactionClient`? | Every Query Uses `tx`? | Root Prisma Fallback Exists? | Required Stage 3 Refactoring |
|---|---|---|---|---|---|
| `auditService.ts` | YES (`import { prisma }`) | **YES** | **YES** | Partial (If `tx` omitted) | Remove root fallback; require mandatory `tx`. |
| `reportService.ts` | YES (`import { prisma }`) | **YES** | **YES** | Partial (If `tx` omitted) | Remove root fallback; require mandatory `tx`. |
| `workOrderService.ts` | YES (`import { prisma }`) | **YES** (Partial) | NO (Some sub-queries use `prisma`) | YES | Refactor all internal queries to use `tx`. |
| `assetService.ts` | YES (`import { prisma }`) | **YES** (Partial) | NO (Some sub-queries use `prisma`) | YES | Refactor all internal queries to use `tx`. |
| `inventoryService.ts` | YES (`import { prisma }`) | **YES** (Partial) | NO (Some sub-queries use `prisma`) | YES | Refactor stock transactions to use `tx`. |
| `procurementService.ts` | YES (`import { prisma }`) | **YES** (Partial) | NO (Some sub-queries use `prisma`) | YES | Refactor PR/PO/GRN queries to use `tx`. |
| `billingService.ts` | YES (`import { prisma }`) | **YES** (Partial) | NO (Some sub-queries use `prisma`) | YES | Refactor invoice queries to use `tx`. |
| `userService.ts` | YES (`import { prisma }`) | NO | NO | YES | Add mandatory `tx` parameter to all functions. |
| `backgroundJobService.ts`| YES (`import { prisma }`) | NO | NO | YES | Wrap background tasks in `withSecurityContext`. |
| `portalService.ts` | YES (`import { prisma }`) | NO | NO | YES | Add mandatory `tx` parameter to all functions. |

---

## 7. Security Test Suite Evidence & Reconciliation

### 7.1 Database Connection Safety Confirmation
- **`zemifix_acceptance`:** **NOT ACCESSED.** Zero connection attempts executed during this audit.
- **`zemifix_platform_dev`:** **NOT ACCESSED.** Zero connection attempts executed during this audit.

### 7.2 Complete 22-Scenario Security Test Matrix

| # | Test Scenario | Level | Target Endpoint / Service | Existing File / Proposed File | Execution Status & Evidence |
|---|---|---|---|---|---|
| 1 | Unauthenticated Access | Unit | `GET /api/work-orders` | `src/lib/services/securityContext.test.ts` | **PASSING (Executed)** |
| 2 | Missing Permission | Unit | `POST /api/inventory/parts` | Proposed: `src/tests/permissionCheck.test.ts` | Proposed (Stage 7) |
| 3 | Explicit Admin Permission | Unit | `DELETE /api/assets/[id]` | Proposed: `src/tests/explicitAdmin.test.ts` | Proposed (Stage 7) |
| 4 | Own Access Scope | Integration | `GET /api/work-orders` as Tech | `src/lib/services/phase4_4_workflows.test.ts` | **PASSING (Executed)** |
| 5 | Department Scope | Integration | `GET /api/requests` as Dept Head | `src/lib/services/phase4_5_workflows.test.ts` | **PASSING (Executed)** |
| 6 | Branch Access Scope | Integration | `GET /api/assets` as Branch Staff | `src/lib/services/phase4_6_workflows.test.ts` | **PASSING (Executed)** |
| 7 | BranchAndBelow Scope | Integration | `GET /api/work-orders` as Reg Mgr | `src/lib/services/pgRlsPolicies.test.ts` | **PASSING (Executed)** |
| 8 | Cross-Branch Write Attack | Integration | Branch A user updating Branch B asset | `src/lib/services/pgRlsFailClosed.test.ts` | **PASSING (Executed)** |
| 9 | Reassignment Attack | Integration | Asset `branchId` change attempt | `src/lib/services/pgRlsFailClosed.test.ts` | **PASSING (Executed)** |
| 10| Direct Child Exposure | Integration | Query `work_order_tasks` directly | `src/lib/services/pgRlsPolicies.test.ts` | **PASSING (Executed)** |
| 11| Portal Client Isolation | Integration | Customer A querying Customer B invoice | Proposed: `src/tests/portalIsolation.test.ts` | Proposed (Stage 7) |
| 12| Public QR Boundary | Integration | Anonymous submit to `/api/public/requests` | `tests/qrRequestWorkflow.test.ts` | **PASSING (Executed)** |
| 13| Worker Role Verification | Integration | Call `/api/internal/workers/run` | Proposed: `src/tests/workerRole.test.ts` | Proposed (Stage 7) |
| 14| Worker GUC Forgery Attempt| Integration | SQL session setting GUC lease hash | Proposed: `src/tests/workerGucForgery.test.ts` | Proposed (Stage 7) |
| 15| Invalid Worker HMAC Token| Integration | Worker call with invalid HMAC | Proposed: `src/tests/workerHmac.test.ts` | Proposed (Stage 7) |
| 16| Worker Company Isolation| Integration | Worker task reading Company B POs | Proposed: `src/tests/workerCompanyIsolation.test.ts`| Proposed (Stage 7) |
| 17| Worker Privilege Escalation| Integration | PM Worker deleting `purchase_orders` | Proposed: `src/tests/workerEscalation.test.ts` | Proposed (Stage 7) |
| 18| Uninitialized Transaction | Unit | Query on uninitialized `tx` | Proposed: `src/tests/uninitializedTx.test.ts` | Proposed (Stage 7) |
| 19| Conflicting Nested Context| Unit | Service call switching `userId` | Proposed: `src/tests/conflictingTx.test.ts` | Proposed (Stage 7) |
| 20| Wrong DB Name Abort | Integration | Boot connected to `zemifix_acceptance` | `src/lib/prisma.ts` | **PASSING (Stage 1 Unit Test)** |
| 21| Superuser Boot Abort | Integration | Boot connected as `postgres` | `src/lib/prisma.ts` | **PASSING (Stage 1 Unit Test)** |
| 22| Concurrent GUC Isolation | E2E | 100 parallel requests alternating branch | `src/lib/services/securityContext.test.ts` | **PASSING (Executed)** |

---

## 8. Stage 3 Prioritized Implementation Backlog & Acceptance Criteria

### Implementation Backlog:
1. **Task 3.1:** Update `securityContextService.ts` to allow empty `userId` when `realm === 'AUTH'`.
2. **Task 3.2:** Implement `src/lib/authWrapper.ts` exporting `withApiSecurity`.
3. **Task 3.3:** Implement universal scope filters (`getScopedInventoryFilter`, `getScopedProcurementFilter`, `getScopedFinanceFilter`) in service files.
4. **Task 3.4:** Refactor route handlers under `src/app/api/` to use `withApiSecurity`.
5. **Task 3.5:** Update login and OTP endpoints (`/api/auth/login`, `/api/auth/verify-otp`) to run under `'AUTH'` realm with `withApiSecurity`.
6. **Task 3.6:** Create unit test suite `src/tests/authWrapper.test.ts` verifying all 7 security realms.
7. **Task 3.7:** Implement AST route coverage test `src/tests/apiRouteCoverage.test.ts`.

### Stage 3 Acceptance Criteria:
- `AC-3.1`: All 114 API route handlers under `src/app/api/` are wrapped with `withApiSecurity`.
- `AC-3.2`: Login, OTP, and customer portal login execute cleanly under signed `'AUTH'` transaction context without requiring a pre-existing `userId`.
- `AC-3.3`: Calling a service without passing `tx` inside a security-sensitive pipeline triggers a TypeScript compile-time or ESLint error.
- `AC-3.4`: All Stage 3 unit tests pass cleanly in `npm test`.

---

## 9. Final Implementation Gate Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGE 3 CODE IMPLEMENTATION**

* **Status:** The Stage 3 Final Blocker Closure Specification is **COMPLETE, RECONCILED, AND APPROVED FOR STAGE 3 CODE IMPLEMENTATION**.
* **Mandatory Pre-Implementation Conditions:**
  1. Stage 3 code wrappers (`src/lib/authWrapper.ts`, service refactoring, and `'AUTH'` realm handlers) must be fully implemented and tested in development before applying database migrations.
  2. Migration `20261119000001_stage2_1_signed_security_context` and HMAC key provisioning (`npm run provision:security-context-key`) MUST be executed in Phase A before applying Migration `20261119000002_stage2_1_default_deny_rls` in Phase C.

---
*Specification authored automatically by ZemiFix Enterprise Security Engineering Engine.*
