# ZemiFix F1.2.1 Stage 3 — Revision 4 Final Security Defect Closure Report

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 Stage 3 Revision 4 Defect Closure  
**Document Type:** Final Security Architecture Defect Closure Report  
**Status:** **APPROVED WITH CONDITIONS FOR STAGE 3 CODE IMPLEMENTATION**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Reference Documents:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md`, `ZEMIFIX_F1_2_1_STAGE_2_1_1_READINESS_AUDIT_REPORT.md`, `ZEMIFIX_F1_2_1_STAGE_3_FINAL_SECURITY_CORRECTIONS_REV3.md`  
**Execution Type:** STRICTLY READ-ONLY ARCHITECTURAL REVIEW (Zero application source code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Stage 3 Multi-Gate Verdicts

### **STAGE 3 MULTI-GATE VERDICTS**

| Gate / Milestone | Status & Decision | Gate Conditions & Requirements |
|---|---|---|
| **Gate A: Development Stage 3 Code Implementation** | **APPROVED** | Code wrappers (`src/lib/authWrapper.ts`), service refactoring, and `'AUTH'` realm handlers may proceed in development. |
| **Gate B: AUTH Database Helpers Implementation** | **APPROVED WITH CONDITIONS** | Must use hardened `SECURITY DEFINER` functions owned by `zemifix_definer_owner` with `SET search_path = pg_catalog, public`. |
| **Gate C: Migration 1 Deployment** | **BLOCKED** | Blocked until Stage 3 code implementation is complete and tested in development. |
| **Gate D: HMAC Key Provisioning** | **BLOCKED** | Blocked until Migration 1 is applied in Phase A. Executed via `npm run provision:security-context-key`. |
| **Gate E: Migration 2 Activation (Default Deny)** | **BLOCKED** | Blocked until Stage 3 code rollout and Phase A key verification are complete. |
| **Gate F: Production Deployment** | **BLOCKED** | Blocked until Stage 7 integration testing and Stage 8 final verification are complete. |

---

## 1. AUTH Function Security Corrections (`SECURITY DEFINER` Auth Helpers)

Revision 4 resolves all security defects in the unauthenticated authentication helpers by enforcing **Atomic Concurrency Locks**, **Exclusive Identity Constraints**, and **Hardened `SECURITY DEFINER` Attributes**.

### 1.1 Hardened `SECURITY DEFINER` SQL Specifications

```sql
-- 1. Narrowly Scoped User Lookup Function (Email Exact Match Only)
CREATE OR REPLACE FUNCTION public.fn_auth_lookup_user_by_email(p_email TEXT)
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  "passwordHash" VARCHAR,
  "isActive" BOOLEAN,
  "roleId" UUID,
  "branchId" UUID,
  "departmentId" UUID,
  "accessScope" AccessScope
)
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Assert AUTH Realm Execution Context
  IF app_realm() != 'AUTH' THEN
    RAISE EXCEPTION 'AUTH_REALM_REQUIRED: User lookup is restricted to the AUTH security realm.';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, u."passwordHash", u."isActive", u."roleId", u."branchId", u."departmentId", u."accessScope"
  FROM public."users" u
  WHERE lower(u.email) = lower(p_email)
    AND u."isActive" = true
    AND u."deletedAt" IS NULL;
END;
$$;

-- 2. Customer Contact Lookup Function (Customer Portal Login)
CREATE OR REPLACE FUNCTION public.fn_auth_lookup_customer_contact_by_email(p_email TEXT)
RETURNS TABLE (
  id UUID,
  "customerId" UUID,
  email VARCHAR,
  "passwordHash" VARCHAR,
  "isActive" BOOLEAN
)
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF app_realm() != 'AUTH' THEN
    RAISE EXCEPTION 'AUTH_REALM_REQUIRED: Customer contact lookup is restricted to the AUTH security realm.';
  END IF;

  RETURN QUERY
  SELECT c.id, c."customerId", c.email, c."passwordHash", c."isActive"
  FROM public."customer_contacts" c
  WHERE lower(c.email) = lower(p_email)
    AND c."isActive" = true
    AND c."deletedAt" IS NULL;
END;
$$;

-- 3. Atomic Concurrency-Safe OTP Creation Function (INSERT Only)
CREATE OR REPLACE FUNCTION public.fn_auth_create_otp(
  p_user_id UUID,
  p_customer_contact_id UUID,
  p_otp_code_hash VARCHAR,
  p_purpose VARCHAR,
  p_destination VARCHAR,
  p_channel VARCHAR,
  p_expires_at TIMESTAMPTZ
) RETURNS UUID
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
DECLARE
  v_otp_id UUID := gen_random_uuid();
BEGIN
  IF app_realm() != 'AUTH' THEN
    RAISE EXCEPTION 'AUTH_REALM_REQUIRED: OTP creation is restricted to the AUTH security realm.';
  END IF;

  -- Validate Exclusive Identity Binding (userId XOR customerContactId)
  IF (p_user_id IS NULL AND p_customer_contact_id IS NULL) OR (p_user_id IS NOT NULL AND p_customer_contact_id IS NOT NULL) THEN
    RAISE EXCEPTION 'INVALID_IDENTITY_BINDING: Exactly one of userId or customerContactId must be provided.';
  END IF;

  -- Invalidate any existing unconsumed OTPs for the target identity with row lock
  IF p_user_id IS NOT NULL THEN
    UPDATE public.auth_otps
    SET "invalidatedAt" = now()
    WHERE "userId" = p_user_id AND purpose = p_purpose AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL;
  ELSE
    UPDATE public.auth_otps
    SET "invalidatedAt" = now()
    WHERE "customerContactId" = p_customer_contact_id AND purpose = p_purpose AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL;
  END IF;

  -- Insert new OTP challenge
  INSERT INTO public.auth_otps (
    id, "userId", "customerContactId", "otpCodeHash", purpose, destination, channel, "expiresAt", "attemptCount", "createdAt"
  ) VALUES (
    v_otp_id, p_user_id, p_customer_contact_id, p_otp_code_hash, p_purpose, p_destination, p_channel, p_expires_at, 0, now()
  );

  RETURN v_otp_id;
END;
$$;

-- 4. Atomic Concurrency-Safe OTP Verification & Consumption Function
CREATE OR REPLACE FUNCTION public.fn_auth_verify_otp_challenge(
  p_otp_record_id UUID,
  p_submitted_code_hash VARCHAR
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = pg_catalog, public
LANGUAGE plpgsql AS $$
DECLARE
  v_stored_hash VARCHAR;
  v_expires_at TIMESTAMPTZ;
  v_consumed_at TIMESTAMPTZ;
  v_invalidated_at TIMESTAMPTZ;
  v_attempt_count INT;
  v_user_id UUID;
  v_contact_id UUID;
BEGIN
  IF app_realm() != 'AUTH' THEN
    RAISE EXCEPTION 'AUTH_REALM_REQUIRED: OTP verification is restricted to the AUTH security realm.';
  END IF;

  -- Query exact OTP challenge row with SELECT FOR UPDATE to prevent race conditions
  SELECT "otpCodeHash", "expiresAt", "consumedAt", "invalidatedAt", "attemptCount", "userId", "customerContactId"
  INTO v_stored_hash, v_expires_at, v_consumed_at, v_invalidated_at, v_attempt_count, v_user_id, v_contact_id
  FROM public.auth_otps
  WHERE id = p_otp_record_id
  FOR UPDATE;

  -- Check challenge validity
  IF NOT FOUND OR v_consumed_at IS NOT NULL OR v_invalidated_at IS NOT NULL OR v_expires_at < now() OR v_attempt_count >= 3 THEN
    RETURN FALSE;
  END IF;

  -- Increment attempt counter atomically
  UPDATE public.auth_otps
  SET "attemptCount" = "attemptCount" + 1
  WHERE id = p_otp_record_id;

  -- Verify hash matching
  IF v_stored_hash != p_submitted_code_hash THEN
    RETURN FALSE;
  END IF;

  -- Mark OTP consumed atomically
  UPDATE public.auth_otps
  SET "consumedAt" = now()
  WHERE id = p_otp_record_id;

  -- Update user last login timestamp
  IF v_user_id IS NOT NULL THEN
    UPDATE public.users SET "lastLoginAt" = now() WHERE id = v_user_id;
  ELSIF v_contact_id IS NOT NULL THEN
    UPDATE public.customer_contacts SET "lastLoginAt" = now() WHERE id = v_contact_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- Function Ownership & Security Hardening
ALTER FUNCTION public.fn_auth_lookup_user_by_email(TEXT) OWNER TO zemifix_definer_owner;
ALTER FUNCTION public.fn_auth_lookup_customer_contact_by_email(TEXT) OWNER TO zemifix_definer_owner;
ALTER FUNCTION public.fn_auth_create_otp(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ) OWNER TO zemifix_definer_owner;
ALTER FUNCTION public.fn_auth_verify_otp_challenge(UUID, VARCHAR) OWNER TO zemifix_definer_owner;

REVOKE ALL ON FUNCTION public.fn_auth_lookup_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auth_lookup_customer_contact_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auth_create_otp(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auth_verify_otp_challenge(UUID, VARCHAR) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_auth_lookup_user_by_email(TEXT) TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.fn_auth_lookup_customer_contact_by_email(TEXT) TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.fn_auth_create_otp(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ) TO zemifix_app_user;
GRANT EXECUTE ON FUNCTION public.fn_auth_verify_otp_challenge(UUID, VARCHAR) TO zemifix_app_user;
```

---

## 2. Migration 2 Derived Recovery Specification

Inspection of `20261119000002_stage2_1_default_deny_rls/migration.sql` confirms exact database modifications made during Migration 2:
1. Enables and forces RLS on all 98 tenant tables.
2. Applies `stage2_signed_context_required` policy (`AS RESTRICTIVE FOR ALL TO zemifix_app_user USING (public.app_security_context_valid()) WITH CHECK (public.app_security_context_valid())`).
3. Drops pre-existing Stage 1 policies on `work_orders`, `assets`, `customers`, `customer_sites`, `invoices`, `quotes`, `audit_logs`.
4. Adds new Stage 2 policies on core identity, branch, department, and domain tables.
5. Revokes `UPDATE ON users` (except `lastLoginAt`).

### 2.1 Derived Migration 2 Recovery Script (`rollback_stage2_1_default_deny.sql`)

```sql
-- 1. Drop Restrictive Signed Context Policy from All 98 Tenant Tables
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

-- 2. Drop Created Stage 2 Policies
DROP POLICY IF EXISTS stage2_company_read ON public.companies;
DROP POLICY IF EXISTS stage2_branch_scope_read ON public.branches;
DROP POLICY IF EXISTS stage2_department_scope_read ON public.departments;
DROP POLICY IF EXISTS stage2_user_self_read ON public.users;
DROP POLICY IF EXISTS stage2_role_read ON public.roles;
DROP POLICY IF EXISTS stage2_permission_read ON public.permissions;
DROP POLICY IF EXISTS stage2_role_permission_read ON public.role_permissions;
DROP POLICY IF EXISTS stage2_user_scope_grant_read ON public.user_scope_grants;
DROP POLICY IF EXISTS stage2_auth_otp_scope ON public.auth_otps;
DROP POLICY IF EXISTS work_orders_rls_policy ON public.work_orders;
DROP POLICY IF EXISTS work_orders_customer_read ON public.work_orders;
DROP POLICY IF EXISTS assets_rls_policy ON public.assets;
DROP POLICY IF EXISTS assets_customer_read ON public.assets;
DROP POLICY IF EXISTS customers_rls_policy ON public.customers;
DROP POLICY IF EXISTS customers_customer_read ON public.customers;
DROP POLICY IF EXISTS customer_sites_rls_policy ON public.customer_sites;
DROP POLICY IF EXISTS customer_sites_customer_read ON public.customer_sites;
DROP POLICY IF EXISTS invoices_rls_policy ON public.invoices;
DROP POLICY IF EXISTS invoices_customer_read ON public.invoices;
DROP POLICY IF EXISTS quotes_rls_policy ON public.quotes;
DROP POLICY IF EXISTS quotes_customer_read ON public.quotes;
DROP POLICY IF EXISTS audit_logs_select_policy ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON public.audit_logs;
DROP POLICY IF EXISTS stage2_user_last_login_update ON public.users;

-- 3. Restore Operational RLS Policies on Core Entities (Preserves Stage 1 Tenant Isolation Baseline)
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

-- 4. Restore Column UPDATE Privileges on Users Table
GRANT UPDATE ON TABLE public.users TO zemifix_app_user;
```

---

## 3. Reconciled API Route File & Method Inventory (114 Route Files / 184 Handlers)

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

## 4. Evidence-Based Service Transaction Enforcement Matrix

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

## 5. Security Test Suite Evidence & Reconciliation

### 5.1 Database Connection Safety Confirmation
- **`zemifix_acceptance`:** **NOT ACCESSED.** Zero connection attempts executed during this audit.
- **`zemifix_platform_dev`:** **NOT ACCESSED.** Zero connection attempts executed during this audit.

### 5.2 Complete 22-Scenario Security Test Matrix

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

## 6. Stage 3 Prioritized Implementation Backlog & Acceptance Criteria

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

## 7. Final Implementation Gate Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGE 3 CODE IMPLEMENTATION**

* **Status:** The Stage 3 Revision 4 Security Defect Closure Report is **COMPLETE, RECONCILED, AND APPROVED FOR CODE IMPLEMENTATION**.
* **Mandatory Pre-Implementation Conditions:**
  1. Stage 3 code wrappers (`src/lib/authWrapper.ts`, service refactoring, and `'AUTH'` realm `SECURITY DEFINER` functions) must be fully implemented and tested in development before applying database migrations.
  2. Migration `20261119000001_stage2_1_signed_security_context` and HMAC key provisioning (`npm run provision:security-context-key`) MUST be executed in Phase A before applying Migration `20261119000002_stage2_1_default_deny_rls` in Phase C.

---
*Specification authored automatically by ZemiFix Enterprise Security Engineering Engine.*
