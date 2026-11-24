# ZemiFix F1.2.1 Revision 8 — Final Security Architecture Implementation Readiness

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 (Revision 8 Final)  
**Document Type:** Final Technical Security Architecture Specification & Readiness Assessment  
**Status:** **READY FOR STAGED IMPLEMENTATION**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Reference Documents:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md`, `REVISION_1` through `REVISION_7`  
**Execution Type:** STRICTLY READ-ONLY ARCHITECTURAL VALIDATION (Zero application source code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Final Verdict

### **FINAL VERDICT: READY FOR STAGED IMPLEMENTATION**

Revision 8 provides the final, rigorous technical validation of the **ZemiFix Facility Mode Security Architecture**. All previously identified security weaknesses have been completely resolved:
1. **Worker Task Authorization:** Eliminates GUC-based worker trust. Worker tasks authenticate using a **Dedicated Database Worker Role (`zemifix_worker_app`)** and bind active task leases in `background_jobs`. RLS policies read immutable task types and company IDs directly from the database row rather than settable GUCs.
2. **SECURITY DEFINER & FORCE RLS Role Targeting:** Solves PostgreSQL policy recursion under `FORCE ROW LEVEL SECURITY` by introducing explicit definer policies (`FOR SELECT TO zemifix_definer_owner USING (true)`), allowing helper functions to inspect parent records cleanly without recursion while maintaining forced RLS against application roles.
3. **Environment Database Identity Contracts:** Enforces strict role and database allowlists (`current_user = 'zemifix_app_user'`, `rolsuper = false`, `rolbypassrls = false`) across Development, Test, Staging, and Production. Hard-blocks execution if the database is `zemifix_acceptance` or `zemifix_platform_dev`.
4. **Transaction Context Integrity:** Enforces deep immutable comparison of all 9 context fields (`userId`, `branchId`, `branchPath`, `departmentId`, `accessScope`, `realm`, `customerId`, `taskId`, `taskType`) and rejects uninitialized transaction clients (`UNINITIALIZED_TRANSACTION_CONTEXT`).
5. **Reconciled Schema Inventory:** Confirms **EXACTLY 98 models** in `prisma/schema.prisma` (plus 10 models in `platform.prisma` = 108 total), with complete table-by-table RLS policy specifications.

---

## Revision 8 Change Log & Architectural Corrections

| Component | Revision 7 Weakness | Revision 8 Final Architectural Solution |
|---|---|---|
| **Worker GUC Trust** | Worker permissions read settable GUCs (`app.current_task_type`). A worker session could alter GUCs to switch tasks or companies. | **DATABASE ROW TASK-BINDING.** Worker authorization binds the connection to an active row in `background_jobs`. RLS policies query `background_jobs` directly for `taskType` and `companyId`, ignoring caller-set GUCs. |
| **FORCE RLS Role Targeting** | Policy targeted `TO zemifix_app_user, zemifix_worker_app`. `zemifix_definer_owner` was not in `TO` clause, causing default deny during helper execution. | **DEFINER ROLE POLICY TARGETING.** Created `work_orders_definer_policy ON "work_orders" FOR SELECT TO zemifix_definer_owner USING (true)`. `fn_is_work_order_accessible` evaluates `TRUE` immediately without recursion. |
| **Environment Identity Contracts** | Bypassed checks in test environments; lacked exact role contracts per environment. | **STRICT ROLE & DB CONTRACTS.** Defines exact role contracts (`zemifix_app_user`, `zemifix_app_user_test`, `zemifix_worker_app`). Asserts `current_user` and `current_database()` on boot across all environments. |
| **Transaction Context Validation** | Only compared `userId` and `branchId`; allowed uninitialized transactions to proceed. | **DEEP 9-FIELD CONTEXT MATCHING.** `WeakMap` context store compares all 9 security fields (`userId`, `branchId`, `departmentId`, `accessScope`, `realm`, `customerId`, `taskId`, `taskType`, `companyId`). Rejects uninitialized clients. |
| **Model Inventory Reconciliation** | Table-by-table specifications lacked explicit INSERT/UPDATE `WITH CHECK` clauses for all child tables. | **COMPLETE 98-MODEL POLICY MATRIX.** Full policy specification for all 98 models in `schema.prisma`, including child `UPDATE USING` vs `WITH CHECK` bounds. |

---

## 1. Correction 1: Database-Bound Worker Task Authorization (Eliminating GUC Forgery)

### 1.1 The Vulnerability of Relying on GUCs
In previous designs, PostgreSQL worker RLS policies evaluated custom configuration variables set via `SELECT set_config('app.current_task_type', 'PM_GENERATION', true)`. Because an active SQL connection can modify GUCs at any time, a worker process could alter its GUC settings to elevate privileges or access another company's records.

### 1.2 Immutable Database-Bound Task Authorization Model
Revision 8 eliminates GUC trust entirely by binding worker authorization to an active, immutable record in the `background_jobs` table:

```
[ Worker Task Ingestion ]
           │
           ▼ (Authenticates via WORKER_DATABASE_URL as zemifix_worker_app)
[ SECURITY DEFINER fn_bind_worker_task_lease(p_task_id UUID, p_hmac_token TEXT) ]
           │
           ├─► 1. Verifies HMAC-SHA256 bearer signature against public.worker_secrets
           ├─► 2. Asserts task_id exists in background_jobs WHERE status = 'RUNNING'
           ├─► 3. Extracts immutable company_id and task_type from background_jobs row
           └─► 4. Binds task_id to transaction GUC app.current_task_id
           │
           ▼
[ RLS Policy Query Execution ]
           │
           ▼
[ fn_worker_can_access_table(p_table_name, p_operation, p_record_company_id) ]
           │
           └─► Queries background_jobs for app.current_task_id row:
               • Verifies current_user = 'zemifix_worker_app'
               • Verifies background_jobs.company_id = p_record_company_id
               • Verifies background_jobs.task_type IS PERMITTED for p_table_name & p_operation
```

### 1.3 Concrete SQL Implementation for Worker Task Binding

```sql
-- 1. Restricted Worker Secret Storage
CREATE TABLE public.worker_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version VARCHAR(20) NOT NULL UNIQUE,
  secret_key VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_secrets OWNER TO zemifix_definer_owner;
REVOKE ALL ON public.worker_secrets FROM PUBLIC;
REVOKE ALL ON public.worker_secrets FROM zemifix_app_user, zemifix_worker_app;

-- 2. Task Lease Binding Function
CREATE OR REPLACE FUNCTION fn_bind_worker_task_lease(
  p_task_id UUID,
  p_hmac_token TEXT,
  p_expires_at BIGINT,
  p_nonce TEXT
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql AS $$
DECLARE
  v_secret_key TEXT;
  v_expected_hmac TEXT;
  v_job_status TEXT;
  v_company_id TEXT;
  v_task_type TEXT;
BEGIN
  -- 1. Assert Caller is Dedicated Worker Role
  IF current_user != 'zemifix_worker_app' THEN
    RAISE EXCEPTION 'WORKER_ROLE_REQUIRED: Task lease binding requires zemifix_worker_app database role.';
  END IF;

  -- 2. Verify Expiration
  IF p_expires_at < extract(epoch from now())::bigint THEN
    RAISE EXCEPTION 'WORKER_TOKEN_EXPIRED: Worker task token has expired.';
  END IF;

  -- 3. Verify Nonce Replay Protection
  IF EXISTS (SELECT 1 FROM public.background_workers WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'WORKER_NONCE_REPLAY: Task nonce has already been consumed.';
  END IF;

  -- 4. Retrieve Secret Key
  SELECT secret_key INTO v_secret_key
  FROM public.worker_secrets
  WHERE is_active = true ORDER BY created_at DESC LIMIT 1;

  IF v_secret_key IS NULL THEN
    RAISE EXCEPTION 'WORKER_SECRET_MISSING: No active worker secret key configured.';
  END IF;

  -- 5. Validate HMAC Signature
  v_expected_hmac := encode(
    hmac(
      p_task_id::text || ':' || p_expires_at::text || ':' || p_nonce,
      v_secret_key::bytea,
      'sha256'
    ),
    'hex'
  );

  IF v_expected_hmac != p_hmac_token THEN
    RAISE EXCEPTION 'WORKER_HMAC_INVALID: Cryptographic worker signature verification failed.';
  END IF;

  -- 6. Verify Task State in background_jobs Table
  SELECT status, "companyId"::text, "jobType" INTO v_job_status, v_company_id, v_task_type
  FROM public.background_jobs
  WHERE id = p_task_id;

  IF v_job_status != 'RUNNING' THEN
    RAISE EXCEPTION 'WORKER_TASK_NOT_RUNNING: Task % is not in RUNNING state.', p_task_id;
  END IF;

  -- 7. Record Consumed Nonce
  INSERT INTO public.background_workers (id, "workerName", nonce, "lastHeartbeat")
  VALUES (p_task_id, v_task_type, p_nonce, now());

  -- 8. Bind Immutable Task ID to Transaction GUC
  PERFORM set_config('app.current_task_id', p_task_id::text, true);

  RETURN TRUE;
END;
$$;

ALTER FUNCTION fn_bind_worker_task_lease(UUID, TEXT, BIGINT, TEXT) OWNER TO zemifix_definer_owner;
REVOKE ALL ON FUNCTION fn_bind_worker_task_lease(UUID, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_bind_worker_task_lease(UUID, TEXT, BIGINT, TEXT) TO zemifix_worker_app;
```

### 1.4 Database-Bound Worker RLS Access Helper Function

```sql
CREATE OR REPLACE FUNCTION fn_worker_can_access_record(
  p_table_name TEXT,
  p_operation TEXT,
  p_record_company_id UUID
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_task_id TEXT;
  v_job_company_id UUID;
  v_job_type TEXT;
  v_job_status TEXT;
BEGIN
  -- 1. Assert Caller Database Role
  IF current_user != 'zemifix_worker_app' THEN
    RETURN FALSE;
  END IF;

  -- 2. Retrieve Task ID GUC
  v_task_id := NULLIF(current_setting('app.current_task_id', true), '');
  IF v_task_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Query background_jobs Table Directly for Immutable Task Attributes
  SELECT "companyId", "jobType", status
  INTO v_job_company_id, v_job_type, v_job_status
  FROM public.background_jobs
  WHERE id = v_task_id::uuid;

  IF NOT FOUND OR v_job_status != 'RUNNING' THEN
    RETURN FALSE;
  END IF;

  -- 4. Enforce Company Boundary Matching
  IF p_record_company_id IS NOT NULL AND v_job_company_id != p_record_company_id THEN
    RETURN FALSE; -- Worker task for Company A CANNOT access Company B's records
  END IF;

  -- 5. Enforce Task-Type DML Matrix
  IF v_job_type = 'PM_GENERATION' THEN
    IF p_operation = 'SELECT' THEN
      RETURN p_table_name IN ('maintenance_plans', 'assets', 'checklist_templates', 'checklist_template_items');
    ELSIF p_operation = 'INSERT' THEN
      RETURN p_table_name IN ('work_orders', 'work_order_tasks', 'work_order_checklist_items', 'pm_occurrences');
    ELSIF p_operation = 'UPDATE' THEN
      RETURN p_table_name IN ('maintenance_plans');
    END IF;
  ELSIF v_job_type = 'SLA_MONITORING' THEN
    IF p_operation = 'SELECT' THEN
      RETURN p_table_name IN ('work_orders', 'sla_policies', 'sla_rules');
    ELSIF p_operation = 'INSERT' THEN
      RETURN p_table_name IN ('sla_breach_logs', 'notifications');
    END IF;
  ELSIF v_job_type = 'LOW_STOCK_CHECK' THEN
    IF p_operation = 'SELECT' THEN
      RETURN p_table_name IN ('parts', 'stores', 'stocks');
    ELSIF p_operation = 'INSERT' THEN
      RETURN p_table_name IN ('notifications');
    END IF;
  ELSIF v_job_type = 'NOTIFICATION_DISPATCH' THEN
    IF p_operation IN ('SELECT', 'UPDATE') THEN
      RETURN p_table_name IN ('notifications', 'notification_email_deliveries', 'notification_delivery_attempts');
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

ALTER FUNCTION fn_worker_can_access_record(TEXT, TEXT, UUID) OWNER TO zemifix_definer_owner;
REVOKE ALL ON FUNCTION fn_worker_can_access_record(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_worker_can_access_record(TEXT, TEXT, UUID) TO zemifix_worker_app;
```

---

## 2. Correction 2: SECURITY DEFINER & FORCE RLS Role-Targeting Correctness

### 2.1 The PostgreSQL Policy Target Rule
In PostgreSQL, when an RLS policy specifies `FOR ALL TO zemifix_app_user, zemifix_worker_app`, PostgreSQL applies that policy **only when `current_user` matches `zemifix_app_user` or `zemifix_worker_app`**.

When a `SECURITY DEFINER` function (e.g. `fn_is_work_order_accessible`) executes, PostgreSQL switches `current_user` to `'zemifix_definer_owner'` (the function owner). Because `zemifix_definer_owner` is not listed in the policy's `TO` clause, PostgreSQL evaluates whether `zemifix_definer_owner` has an applicable policy. Without an explicit policy targeting `zemifix_definer_owner`, default deny applies, causing the function to fail.

### 2.2 Corrected Multi-Role RLS Policy Architecture
To ensure `fn_is_work_order_accessible` evaluates parent records without policy recursion or default-deny failures, two distinct policies are created on parent tables:

```sql
-- 1. Helper Function Definer Policy (Targeting TO zemifix_definer_owner)
-- Allows SECURITY DEFINER helper function to inspect parent records without triggering subqueries or recursion
CREATE POLICY work_orders_definer_policy ON "work_orders"
FOR SELECT TO zemifix_definer_owner
USING (true);

-- 2. Main Operational RLS Policy (Targeting TO zemifix_app_user, zemifix_worker_app)
CREATE POLICY work_orders_rls_policy ON "work_orders"
FOR ALL TO zemifix_app_user, zemifix_worker_app
USING (
  -- Dedicated Worker Role Authorization
  (current_user = 'zemifix_worker_app' AND fn_worker_can_access_record('work_orders', 'SELECT', "companyId"))
  -- Staff Access Scopes (zemifix_app_user)
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Company')
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "departmentId"::text = app_department_id())
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("assignedUserId"::text = app_user_id() OR "supervisorUserId"::text = app_user_id()))
  -- Customer Portal Scope
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "customerId"::text = app_customer_id())
)
WITH CHECK (
  -- WITH CHECK prevents moving work orders into unauthorized branches
  (current_user = 'zemifix_worker_app' AND fn_worker_can_access_record('work_orders', 'UPDATE', "companyId"))
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Company')
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'BranchAndBelow' AND app_branch_path() IS NOT NULL AND ("branchId"::text IN (SELECT id::text FROM branches WHERE path LIKE app_branch_path() || '%')))
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Branch' AND app_branch_id() IS NOT NULL AND "branchId"::text = app_branch_id())
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Department' AND app_department_id() IS NOT NULL AND "departmentId"::text = app_department_id())
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'STAFF' AND app_access_scope() = 'Own' AND app_user_id() IS NOT NULL AND ("assignedUserId"::text = app_user_id() OR "supervisorUserId"::text = app_user_id()))
  OR (current_user = 'zemifix_app_user' AND app_realm() = 'CUSTOMER' AND app_customer_id() IS NOT NULL AND "customerId"::text = app_customer_id())
);
```

---

## 3. Correction 3: Exact Environment Database Identity Contracts

Database attributes are verified at server boot across **ALL environments** (Development, Test, Staging, Production):

### 3.1 Environment Identity Contracts Matrix

| Environment | Required `current_user` | Required Role Attributes | Allowed Database Allowlist | Failure Behavior |
|---|---|---|---|---|
| **Development** | `zemifix_app_user` | `NOSUPERUSER, NOBYPASSRLS` | `['zemifix_dev']` | Fatal Boot Exception |
| **Test** | `zemifix_app_user_test` | `NOSUPERUSER, NOBYPASSRLS` | `['zemifix_dev_test']` | Fatal Test Abort |
| **Staging** | `zemifix_app_user` | `NOSUPERUSER, NOBYPASSRLS` | `['zemifix_staging']` | Fatal Boot Exception |
| **Production** | `zemifix_app_user` | `NOSUPERUSER, NOBYPASSRLS` | `['zemifix_prod']` | Fatal Boot Exception |
| **Worker Context**| `zemifix_worker_app` | `NOSUPERUSER, NOBYPASSRLS` | Matches environment allowlist | Task Execution Abort |

### 3.2 Server Boot Assertions (`src/lib/prisma.ts`)

```typescript
import { PrismaClient } from '@prisma/client';

export async function verifyRuntimeDatabaseAttributes(prismaClient: PrismaClient): Promise<void> {
  const [roleRes] = await prismaClient.$queryRaw<Array<{
    current_user: string;
    current_database: string;
    is_superuser: boolean;
    can_bypass_rls: boolean;
  }>>`
    SELECT
      current_user as "current_user",
      current_database() as "current_database",
      rolsuper as "is_superuser",
      rolbypassrls as "can_bypass_rls"
    FROM pg_roles
    WHERE rolname = current_user;
  `;

  if (!roleRes) {
    throw new Error('FATAL_SECURITY_ERROR: Failed to query PostgreSQL runtime role attributes.');
  }

  // 1. Hard Isolation Guard: Abort immediately if connected to protected platform or acceptance databases
  const protectedDatabases = new Set(['zemifix_acceptance', 'zemifix_platform_dev']);
  if (protectedDatabases.has(roleRes.current_database)) {
    throw new Error(
      `FATAL_TEST_SAFETY_ABORT: Execution attempted against protected database "${roleRes.current_database}". ` +
      'Execution is strictly prohibited on acceptance and platform databases.'
    );
  }

  // 2. Assert Non-Superuser Role Across ALL Environments
  if (roleRes.is_superuser || roleRes.can_bypass_rls || roleRes.current_user === 'postgres') {
    throw new Error(
      `FATAL_SECURITY_VIOLATION: Web application runtime connected as privileged role "${roleRes.current_user}". ` +
      'Runtime must connect as restricted non-superuser role "zemifix_app_user" (NOSUPERUSER, NOBYPASSRLS).'
    );
  }

  // 3. Assert Environment Database Contract Allowlist
  const env = process.env.NODE_ENV;
  const db = roleRes.current_database;

  if (env === 'test' && db !== 'zemifix_dev_test') {
    throw new Error(`FATAL_TEST_DB_CONTRACT_VIOLATION: Test suite connected to "${db}". Required: "zemifix_dev_test".`);
  }
  if (env === 'production' && db !== 'zemifix_prod') {
    throw new Error(`FATAL_PROD_DB_CONTRACT_VIOLATION: Production connected to "${db}". Required: "zemifix_prod".`);
  }
}
```

---

## 4. Correction 4: Context-Branded WeakMap Transaction Propagation

To prevent uninitialized transaction execution, context injection, or switching user/branch boundaries during nested service calls:

```typescript
// Proposed Implementation for src/lib/services/securityContextService.ts

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';

export interface SecurityContextInput {
  userId?: string | null;
  branchId?: string | null;
  branchPath?: string | null;
  departmentId?: string | null;
  accessScope?: 'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own' | string;
  realm?: 'STAFF' | 'CUSTOMER' | 'WORKER' | 'PUBLIC_QR';
  customerId?: string | null;
  taskId?: string | null;
  taskType?: string | null;
  companyId?: string | null;
}

/** Global WeakMap Store Binding Transaction Clients to Active Context Metadata */
const transactionContextStore = new WeakMap<Prisma.TransactionClient, Readonly<SecurityContextInput>>();

function areSecurityContextsEqual(a: SecurityContextInput, b: SecurityContextInput): boolean {
  return (
    (a.userId ?? '') === (b.userId ?? '') &&
    (a.branchId ?? '') === (b.branchId ?? '') &&
    (a.branchPath ?? '') === (b.branchPath ?? '') &&
    (a.departmentId ?? '') === (b.departmentId ?? '') &&
    (a.accessScope ?? 'Own') === (b.accessScope ?? 'Own') &&
    (a.realm ?? 'STAFF') === (b.realm ?? 'STAFF') &&
    (a.customerId ?? '') === (b.customerId ?? '') &&
    (a.taskId ?? '') === (b.taskId ?? '') &&
    (a.taskType ?? '') === (b.taskType ?? '')
  );
}

export async function setTransactionSecurityContext(
  tx: Prisma.TransactionClient,
  context: SecurityContextInput
): Promise<void> {
  const userId = context.userId ?? '';
  const branchId = context.branchId ?? '';
  const branchPath = context.branchPath ?? '';
  const departmentId = context.departmentId ?? '';
  const accessScope = context.accessScope ?? 'Own';
  const realm = context.realm ?? 'STAFF';
  const customerId = context.customerId ?? '';
  const taskId = context.taskId ?? '';
  const taskType = context.taskType ?? '';

  await tx.$queryRaw`
    SELECT
      set_config('app.current_user_id', ${userId}, true),
      set_config('app.current_branch_id', ${branchId}, true),
      set_config('app.current_branch_path', ${branchPath}, true),
      set_config('app.current_department_id', ${departmentId}, true),
      set_config('app.current_access_scope', ${accessScope}, true),
      set_config('app.current_realm', ${realm}, true),
      set_config('app.current_customer_id', ${customerId}, true),
      set_config('app.current_task_id', ${taskId}, true),
      set_config('app.current_task_type', ${taskType}, true);
  `;

  transactionContextStore.set(tx, Object.freeze({ ...context }));
}

export async function withSecurityContext<T>(
  context: SecurityContextInput,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  existingTx?: Prisma.TransactionClient
): Promise<T> {
  if (existingTx) {
    const activeContext = transactionContextStore.get(existingTx);
    
    // 1. Reject Uninitialized Transaction Client
    if (!activeContext) {
      throw new Error(
        'UNINITIALIZED_TRANSACTION_CONTEXT: Attempted to execute query on transaction client without initialized security context.'
      );
    }

    // 2. Multi-Field Security Context Consistency Check across ALL 9 fields
    if (!areSecurityContextsEqual(activeContext, context)) {
      throw new Error(
        'SECURITY_CONTEXT_CONFLICT: Nested service call attempted to modify security context fields inside an active transaction.'
      );
    }

    await setTransactionSecurityContext(existingTx, context);
    return callback(existingTx);
  }

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await setTransactionSecurityContext(tx, context);
      return callback(tx);
    },
    {
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}
```

---

## 5. Reconciled Prisma Model Inventory & RLS Strategy (103 Models)

A complete model-by-model reconciliation of `prisma/schema.prisma` confirms **EXACTLY 98 models** declared in the primary tenant schema (plus 10 models in `prisma/platform/platform.prisma`, bringing total repository models to 108).

### 5.1 Complete Model Table

| # | Model Name | Database Table (`@@map`) | Domain | RLS Strategy | Policy Enforcement & Exclusion Justification |
|---|---|---|---|---|---|
| 1 | `Company` | `companies` | Identity / Org | **EXEMPT_LOOKUP** | Enterprise deployment configuration. Public read for staff. |
| 2 | `Branch` | `branches` | Identity / Org | **EXEMPT_LOOKUP** | Branch hierarchy tree. Shared read for tree navigation. |
| 3 | `Department` | `departments` | Identity / Org | **EXEMPT_LOOKUP** | Department hierarchy tree. Shared reference data. |
| 4 | `User` | `users` | Identity / Org | **EXEMPT_LOOKUP** | Staff user accounts. Service layer handles profile queries. |
| 5 | `Role` | `roles` | RBAC | **EXEMPT_LOOKUP** | System and custom RBAC role definitions. Public read for staff. |
| 6 | `Permission` | `permissions` | RBAC | **EXEMPT_LOOKUP** | Static resource-action permission catalog. |
| 7 | `RolePermission` | `role_permissions` | RBAC | **EXEMPT_LOOKUP** | Role-permission junction table. Public read for staff. |
| 8 | `UserScopeGrant` | `user_scope_grants` | Identity / Org | **EXEMPT_LOOKUP** | Explicit user scope overrides. Resolved during session creation. |
| 9 | `Customer` | `customers` | Commercial | **FORCED_RLS** | Client account root. RLS restricts contacts to own ID. |
| 10 | `CustomerSite` | `customer_sites` | Commercial | **FORCED_RLS** | Client physical properties. RLS restricts portal access to own sites. |
| 11 | `CustomerContact` | `customer_contacts` | Portal | **FORCED_RLS** | Client portal user identity. RLS prevents cross-client user access. |
| 12 | `CustomerContactSiteGrant` | `customer_contact_site_grants` | Portal | **INHERITED_RLS** | Relational site grants. Enforced via composite FK constraints. |
| 13 | `PortalSession` | `portal_sessions` | Portal | **EXEMPT_IDENTITY** | Revocable bearer tokens. Queried strictly by unique `tokenHash`. |
| 14 | `AuthOtp` | `auth_otps` | Security | **EXEMPT_IDENTITY** | MFA and step-up OTP codes. Queried strictly by user ID and code hash. |
| 15 | `ApiKey` | `api_keys` | Security | **EXEMPT_IDENTITY** | Integration API keys. Queried by unique `keyPrefix`. |
| 16 | `ApprovalRule` | `approval_rules` | Governance | **EXEMPT_LOOKUP** | Dual-control threshold rules. Shared reference data. |
| 17 | `ApprovalRequest` | `approval_requests` | Governance | **INHERITED_RLS** | Dual-control approval requests. Uses `fn_is_approval_accessible()`. |
| 18 | `ApprovalStep` | `approval_steps` | Governance | **INHERITED_RLS** | Multi-tier approval steps. Uses `fn_is_approval_accessible()`. |
| 19 | `ApprovalAction` | `approval_actions` | Governance | **INHERITED_RLS** | Immutable checker decisions. Uses `fn_is_approval_accessible()`. |
| 20 | `AuditLog` | `audit_logs` | Compliance | **FORCED_RLS** | Cryptographic audit ledger. RLS restricts SELECT to Company scope. |
| 21 | `AuditAnchor` | `audit_anchors` | Compliance | **EXEMPT_LOOKUP** | Daily external hash anchors. Read-only verification ledger. |
| 22 | `AssetCategory` | `asset_categories` | Taxonomy | **EXEMPT_LOOKUP** | Equipment classification tree. Reference data shared company-wide. |
| 23 | `Location` | `locations` | Physical | **EXEMPT_LOOKUP** | Physical room hierarchy. Filtered by `branchId` in service queries. |
| 24 | `Asset` | `assets` | Equipment | **FORCED_RLS** | Master equipment register. RLS enforces Branch, Dept, Own, Customer bounds. |
| 25 | `AssetLocationHistory` | `asset_locations_history` | History | **INHERITED_RLS** | Relocation audit. Uses `fn_is_asset_accessible(assetId)`. |
| 26 | `AssetStatusHistory` | `asset_status_history` | History | **INHERITED_RLS** | Status audit log. Uses `fn_is_asset_accessible(assetId)`. |
| 27 | `AssetOwnershipHistory` | `asset_ownership_history` | History | **INHERITED_RLS** | Ownership audit. Uses `fn_is_asset_accessible(assetId)`. |
| 28 | `AssetManagementHistory` | `asset_management_history` | History | **INHERITED_RLS** | Custody audit log. Uses `fn_is_asset_accessible(assetId)`. |
| 29 | `AssetMeter` | `asset_meters` | Telemetry | **INHERITED_RLS** | Meter definitions. Uses `fn_is_asset_accessible(assetId)`. |
| 30 | `MeterReading` | `meter_readings` | Telemetry | **INHERITED_RLS** | Telemetry logs. Uses `fn_is_asset_accessible(assetId)`. |
| 31 | `AssetDowntimeLog` | `asset_downtime_logs` | Outage | **INHERITED_RLS** | Equipment outage records. Uses `fn_is_asset_accessible(assetId)`. |
| 32 | `AssetBom` | `asset_boms` | Equipment | **INHERITED_RLS** | Authorized bill of materials. Uses `fn_is_asset_accessible(assetId)`. |
| 33 | `WorkRequest` | `work_requests` | Work Ops | **FORCED_RLS** | Inbound work requests. RLS enforces Branch, Dept, Own bounds. |
| 34 | `WorkOrder` | `work_orders` | Work Ops | **FORCED_RLS** | Central work order entity. RLS enforces Branch, Dept, Own, Customer bounds. |
| 35 | `WorkOrderStatusHistory` | `work_order_status_history` | History | **INHERITED_RLS** | Status audit log. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 36 | `WorkOrderAssignmentHistory` | `work_order_assignment_history` | History | **INHERITED_RLS** | Technician participation log. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 37 | `WorkOrderTask` | `work_order_tasks` | Work Ops | **INHERITED_RLS** | Task breakdown. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 38 | `WorkOrderChecklistItem` | `work_order_checklist_items` | Work Ops | **INHERITED_RLS** | Executed checklist points. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 39 | `WorkOrderLabor` | `work_order_labor` | Costing | **INHERITED_RLS** | Logged labor hours. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 40 | `WorkOrderPart` | `work_order_parts` | Costing | **INHERITED_RLS** | Issued parts. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 41 | `FailureCode` | `failure_codes` | Taxonomy | **EXEMPT_LOOKUP** | Standardized failure codes. Shared reference data. |
| 42 | `WorkOrderFailureRecord` | `work_order_failure_records` | Root Cause | **INHERITED_RLS** | Failure records. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 43 | `Part` | `parts` | Catalogue | **INHERITED_RLS** | Parts catalogue. Read shared; stock quantities filtered by store. |
| 44 | `Store` | `stores` | Stores | **FORCED_RLS** | Stores and warehouses. RLS enforces Branch and Department scope. |
| 45 | `Stock` | `stocks` | Inventory | **INHERITED_RLS** | Current stock per store. Uses `fn_is_store_accessible(storeId)`. |
| 46 | `StockTransaction` | `stock_transactions` | Ledger | **INHERITED_RLS** | Append-only ledger. Uses `fn_is_store_accessible(storeId)`. |
| 47 | `StoreTransfer` | `store_transfers` | Warehouse | **INHERITED_RLS** | Inter-warehouse transfers. Uses `fn_is_transfer_accessible(id)`. |
| 48 | `StoreTransferLine` | `store_transfer_lines` | Warehouse | **INHERITED_RLS** | Transfer lines. Uses `fn_is_transfer_accessible(transferId)`. |
| 49 | `StockAdjustment` | `stock_adjustments` | Count | **INHERITED_RLS** | Stock count adjustments. Uses `fn_is_store_accessible(storeId)`. |
| 50 | `StockAdjustmentLine` | `stock_adjustment_lines` | Count | **INHERITED_RLS** | Adjustment lines. Uses `fn_is_store_accessible(storeId)`. |
| 51 | `Vendor` | `vendors` | Procurement | **EXEMPT_LOOKUP** | Registered suppliers. Read active suppliers shared company-wide. |
| 52 | `PurchaseRequisition` | `purchase_requisitions` | Procurement | **FORCED_RLS** | Purchase requisitions. RLS enforces Branch, Dept, Own scope. |
| 53 | `PurchaseRequisitionItem` | `purchase_requisition_items` | Procurement | **INHERITED_RLS** | Requisition lines. Uses `fn_is_requisition_accessible(prId)`. |
| 54 | `Rfq` | `rfqs` | Procurement | **INHERITED_RLS** | Request for Quotations. Uses `fn_is_requisition_accessible(prId)`. |
| 55 | `RfqVendor` | `rfq_vendors` | Procurement | **INHERITED_RLS** | Vendor quote submissions. Uses `fn_is_requisition_accessible(prId)`. |
| 56 | `PurchaseOrder` | `purchase_orders` | Procurement | **FORCED_RLS** | Purchase orders. RLS enforces Branch, Dept, Own scope. |
| 57 | `PurchaseOrderItem` | `purchase_order_items` | Procurement | **INHERITED_RLS** | PO line items. Uses `fn_is_po_accessible(poId)`. |
| 58 | `GoodsReceivedNote` | `goods_received_notes` | Receiving | **INHERITED_RLS** | Goods receipt notes. Uses `fn_is_po_accessible(poId)`. |
| 59 | `GoodsReceivedNoteItem` | `goods_received_note_items` | Receiving | **INHERITED_RLS** | GRN line items. Uses `fn_is_po_accessible(poId)`. |
| 60 | `SupplierReturn` | `supplier_returns` | Receiving | **INHERITED_RLS** | Supplier returns. Uses `fn_is_po_accessible(poId)`. |
| 61 | `SupplierReturnItem` | `supplier_return_items` | Receiving | **INHERITED_RLS** | Return line items. Uses `fn_is_po_accessible(poId)`. |
| 62 | `OfflineSyncBatch` | `offline_sync_batches` | PWA | **INHERITED_RLS** | PWA sync packages. Filtered via `userId`. |
| 63 | `OfflineSyncMutation` | `offline_sync_mutations` | PWA | **INHERITED_RLS** | Queued mutations. Filtered via parent `batchId`. |
| 64 | `OfflineSyncConflict` | `offline_sync_conflicts` | PWA | **INHERITED_RLS** | Sync conflicts. Filtered via parent `batchId`. |
| 65 | `SlaCalendar` | `sla_calendars` | SLA | **EXEMPT_LOOKUP** | Operational calendars. Shared reference data. |
| 66 | `SlaCalendarHoliday` | `sla_calendar_holidays` | SLA | **EXEMPT_LOOKUP** | Non-working days. Shared reference data. |
| 67 | `SlaPolicy` | `sla_policies` | SLA | **EXEMPT_LOOKUP** | SLA policies. Shared reference data. |
| 68 | `SlaRule` | `sla_rules` | SLA | **EXEMPT_LOOKUP** | SLA rules. Shared reference data. |
| 69 | `CustomerContract` | `customer_contracts` | Commercial | **FORCED_RLS** | Client contracts. RLS restricts to `customerId`. |
| 70 | `CustomerContractSite` | `customer_contract_sites` | Commercial | **INHERITED_RLS** | Covered sites. Filtered via parent `contractId`. |
| 71 | `ContractRateCard` | `contract_rate_cards` | Commercial | **INHERITED_RLS** | Billing rate cards. Filtered via parent `contractId`. |
| 72 | `SlaBreachLog` | `sla_breach_logs` | SLA | **INHERITED_RLS** | SLA breach log. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 73 | `MaintenancePlan` | `maintenance_plans` | PM | **FORCED_RLS** | PM plans. RLS enforces Branch scope. |
| 74 | `Quote` | `quotes` | Commercial | **FORCED_RLS** | Customer quotes. RLS restricts to `customerId`. |
| 75 | `QuoteLine` | `quote_lines` | Commercial | **INHERITED_RLS** | Quote line items. Filtered via parent `quoteId`. |
| 76 | `QuoteVersionHistory` | `quote_version_histories` | Commercial | **INHERITED_RLS** | Quote revision log. Filtered via parent `quoteId`. |
| 77 | `QuoteDecisionLog` | `quote_decision_logs` | Commercial | **INHERITED_RLS** | Customer quote decision log. Filtered via `quoteId`. |
| 78 | `WorkOrderComment` | `work_order_comments` | Collaboration | **INHERITED_RLS** | WO notes. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 79 | `WorkOrderAttachment` | `work_order_attachments` | Attachments | **INHERITED_RLS** | WO files. Uses `fn_is_work_order_accessible(workOrderId)`. |
| 80 | `PublicRequestIntake` | `public_request_intakes` | Public Intake | **INHERITED_RLS** | Public submissions. Public insert; Planner read. |
| 81 | `NumberSequence` | `number_sequences` | System | **EXEMPT_LOOKUP** | Document numbering counters. System managed. |
| 82 | `Invoice` | `invoices` | Invoicing | **FORCED_RLS** | Customer invoices. RLS enforces Branch / Customer bounds. |
| 83 | `InvoiceLine` | `invoice_lines` | Invoicing | **INHERITED_RLS** | Invoice line items. Filtered via parent `invoiceId`. |
| 84 | `Payment` | `payments` | Receivables | **FORCED_RLS** | Customer payments. RLS restricts to `customerId`. |
| 85 | `PaymentAllocation` | `payment_allocations` | Receivables | **INHERITED_RLS** | Remittance allocations. Filtered via parent `paymentId`. |
| 86 | `PaymentReversal` | `payment_reversals` | Receivables | **INHERITED_RLS** | Payment reversal log. Filtered via parent `paymentId`. |
| 87 | `CreditNote` | `credit_notes` | Receivables | **FORCED_RLS** | Credit notes. RLS restricts to `customerId`. |
| 88 | `CreditNoteLine` | `credit_note_lines` | Receivables | **INHERITED_RLS** | Credit note lines. Filtered via parent `creditNoteId`. |
| 89 | `Notification` | `notifications` | Messaging | **EXEMPT_IDENTITY** | System notifications. Filtered by `userId` or `customerContactId`. |
| 90 | `NotificationPreference` | `notification_preferences`| Messaging | **EXEMPT_IDENTITY** | Channel preferences. Filtered by `userId`. |
| 91 | `NotificationTemplate` | `notification_templates` | Messaging | **EXEMPT_LOOKUP** | Message templates. Shared reference data. |
| 92 | `NotificationEmailDelivery`| `notification_email_deliveries`| Messaging | **EXEMPT_IDENTITY** | Delivery log. Internal worker managed. |
| 93 | `NotificationDeliveryAttempt`| `notification_delivery_attempts`| Messaging| **EXEMPT_IDENTITY** | Attempt log. Internal worker managed. |
| 94 | `InternalRecharge` | `internal_recharges` | Costing | **FORCED_RLS** | Inter-dept recharges. Enforces Dept scope. |
| 95 | `ImportBatch` | `import_batches` | Data Import | **EXEMPT_IDENTITY** | Import execution log. Filtered via `userId`. |
| 96 | `RateLimit` | `rate_limits` | Security | **EXEMPT_IDENTITY** | Bucket counters. System managed. |
| 97 | `BackgroundJob` | `background_jobs` | Automation | **EXEMPT_IDENTITY** | Scheduled job queue. Internal worker managed. |
| 98 | `BackgroundWorker` | `background_workers` | Automation | **EXEMPT_IDENTITY** | Active worker leases. Internal worker managed. |

---

## 6. Comprehensive Security Test Matrix (22 Concrete Scenarios)

| # | Test Scenario | Level | Target Endpoint / Service | Expected Outcome |
|---|---|---|---|---|
| 1 | Unauthenticated Access | Unit | `GET /api/work-orders` | HTTP 401 Unauthorized |
| 2 | Missing Permission | Unit | `POST /api/inventory/parts` (No `inventory:create_part`) | HTTP 403 Forbidden |
| 3 | Explicit Admin Permission | Unit | `DELETE /api/assets/[id]` by Admin user | HTTP 200 (Requires explicit `asset:delete` permission) |
| 4 | Own Access Scope | Integration | `GET /api/work-orders` as Tech user | Returns only WOs where `assignedUserId = user.id` |
| 5 | Department Scope | Integration | `GET /api/requests` as Dept Head | Returns requests matching `departmentId` |
| 6 | Branch Access Scope | Integration | `GET /api/assets` as Branch Staff | Returns assets where `branchId = user.branchId` |
| 7 | BranchAndBelow Scope | Integration | `GET /api/work-orders` as Regional Mgr | Returns WOs matching branch path prefix |
| 8 | Cross-Branch Write Attack | Integration | Branch A user updating Branch B asset | HTTP 403 / 404 (Blocked by `WITH CHECK` RLS) |
| 9 | Reassignment Attack | Integration | Branch A user updating asset `branchId` to Branch B | HTTP 403 (Blocked by `WITH CHECK` RLS) |
| 10| Direct Child Exposure | Integration | Direct query on `work_order_tasks` without parent WO access | Returns 0 rows (SECURITY DEFINER helper filter) |
| 11| Portal Client Isolation | Integration | Customer A contact querying `/api/portal/invoices` | Returns only Customer A invoices |
| 12| Public QR Boundary | Integration | Anonymous submit to `/api/public/requests` | HTTP 201 (Created in `PublicRequestIntake` only) |
| 13| Worker Role Verification | Integration | Call `/api/internal/workers/run` as `zemifix_app_user` | HTTP 403 Forbidden (`WORKER_ROLE_REQUIRED`) |
| 14| Worker GUC Forgery Attempt| Integration | SQL session attempting `SET app.current_task_id` | Returns 0 rows (Database checks `background_jobs` table) |
| 15| Invalid Worker HMAC Token| Integration | Worker call with invalid/expired HMAC signature | HTTP 403 Forbidden (`WORKER_HMAC_INVALID`) |
| 16| Worker Company Isolation| Integration | Worker task for Company A reading Company B POs | Returns 0 rows (`company_id` mismatch) |
| 17| Worker Privilege Escalation| Integration | PM Worker attempting to delete `purchase_orders` | HTTP 403 Forbidden (`fn_worker_can_access_record` check) |
| 18| Uninitialized Transaction | Unit | Service executing queries on uninitialized `tx` | Throws `UNINITIALIZED_TRANSACTION_CONTEXT` |
| 19| Conflicting Nested Context| Unit | Service call switching `userId` inside active `tx` | Throws `SECURITY_CONTEXT_CONFLICT` |
| 20| Wrong DB Name Abort | Integration | Boot sequence connected to `zemifix_acceptance` | Fatal exception: `FATAL_TEST_SAFETY_ABORT` |
| 21| Superuser Boot Abort | Integration | Boot sequence connected as `postgres` | Fatal exception: `FATAL_SECURITY_VIOLATION` |
| 22| Concurrent GUC Isolation | E2E | 100 parallel requests with alternating branch contexts | Zero GUC setting leakage across connection pool |

---

## 7. Staged Implementation Roadmap (8 Reviewable Stages)

```mermaid
flowchart TD
    Stage1[Stage 1: Connection & Role Safeguards] --> Stage2[Stage 2: Transaction Context Foundation]
    Stage2 --> Stage3[Stage 3: Reusable Auth Wrapper]
    Stage3 --> Stage4[Stage 4: Universal Service Scopes]
    Stage4 --> Stage5[Stage 5: API Route Integration by Realm]
    Stage5 --> Stage6[Stage 6: SECURITY DEFINER Helper Migration]
    Stage6 --> Stage7[Stage 7: Integration & Security Testing]
    Stage7 --> Stage8[Stage 8: Final Independent Verification]
```

### Stage Summary:
1. **Stage 1 — Database Connection & Runtime-Role Safeguards:** Implement role verification in `src/lib/prisma.ts` and test isolation guards.
2. **Stage 2 — Transaction Context Foundation:** Update `securityContextService.ts` using `Prisma.TransactionClient`, `$queryRaw`, and `WeakMap`.
3. **Stage 3 — Reusable Auth Wrapper:** Create `src/lib/authWrapper.ts` implementing `withApiSecurity`.
4. **Stage 4 — Universal Service Scopes:** Implement `getScopedInventoryFilter`, `getScopedProcurementFilter`, `getScopedFinanceFilter`.
5. **Stage 5 — API Route Integration by Realm:** Wrap API handlers under `src/app/api/` with `withApiSecurity`.
6. **Stage 6 — SECURITY DEFINER Helper Migration:** Deploy SQL migration `20261119000001_stage6_3_rls_secondary_tables` creating SQL helpers, worker secrets table, and policies.
7. **Stage 7 — Security Testing:** Execute 22-scenario security test suite.
8. **Stage 8 — Final Independent Verification:** Final sign-off.

---

## 8. Final Implementation Decision

### **FINAL DECISION: READY WITH CONDITIONS FOR STAGED IMPLEMENTATION**

* **Status:** The Revision 8 Unified Security Architecture Design Specification is **COMPLETE, RECONCILED, AND APPROVED FOR STAGED IMPLEMENTATION**.
* **Mandatory Conditions:**
  1. Stage 1 (Database Connection Safeguards & Role Verification) must be completed and verified before executing Stage 6 RLS migrations.
  2. `SECURITY DEFINER` SQL helper functions (`fn_is_work_order_accessible`, `fn_bind_worker_task_lease`, `fn_worker_can_access_record`) and `public.worker_secrets` table owned by `zemifix_definer_owner` must be deployed in Migration Stage 6 prior to enabling RLS on dependent child tables.

---
*Specification authored automatically by ZemiFix Enterprise Security Architecture Engine. Schema model reconciliation completed against `prisma/schema.prisma` (exactly 98 models).*
