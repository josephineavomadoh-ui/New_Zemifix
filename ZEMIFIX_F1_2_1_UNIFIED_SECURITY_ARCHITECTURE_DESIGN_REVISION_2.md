# ZemiFix F1.2.1 Revision 2 — Unified Security Architecture Design

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 (Revision 2)  
**Document Type:** Technical Architecture Design Specification  
**Status:** Architecture Baseline & Formal Review Candidate  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Reference Documents:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md` & `ZEMIFIX_F1_2_1_UNIFIED_SECURITY_ARCHITECTURE_DESIGN.md` (Revision 1)  
**Execution Type:** READ-ONLY ARCHITECTURAL REVIEW (No application code or database modifications executed)

---

## Change Log: Revision 2 vs. Revision 1

| Component | Revision 1 Deficiency | Revision 2 Architectural Correction |
|---|---|---|
| **Permission Bypass** | `Admin` role automatically bypassed resource-action permission checks in wrapper code. | **REMOVED AUTOMATIC BYPASS.** Explicit administrative permission model implemented. `Admin` permissions are explicitly assigned in `role_permissions` (`*:*` grant), preserving auditability and custom role compatibility. |
| **Prisma Transaction Client** | Relied on undocumented `$isTransaction` property and used `$executeRaw` for `SELECT set_config(...)`. | **CORRECTED.** Uses official Prisma `$transaction` interactive transaction client `tx` cleanly. Replaced `$executeRaw` with `$queryRaw` for `SELECT set_config(...)` operations. |
| **Security Realms** | Treated all API routes under generic staff wrapper. | **REALM SEPARATION.** Classified API routes into 6 distinct security realms (`STAFF`, `CUSTOMER`, `PUBLIC_QR`, `AUTH`, `WORKER`, `SYSTEM`) with tailored auth and RLS rules. |
| **Worker Security** | Granted background workers global company-wide access via a shared worker secret key. | **TASK-BOUND WORKER SECURITY.** Worker tasks receive task-bound identities (`taskId`, `taskType`), tenant IDs, and restricted operational authority. |
| **RLS Coverage** | Incomplete table coverage; lacked junction and audit ledger mappings. | **EXHAUSTIVE TABLE INVENTORY.** Table-by-table matrix covering all 42 tables in `schema.prisma` with explicit `SELECT`, `INSERT`, `UPDATE`, `DELETE` policy clauses. |
| **Runtime Role Isolation**| Allowed fallback to `DATABASE_URL` if `APP_DATABASE_URL` was unconfigured. | **FAIL-CLOSED STARTUP.** Mandatory runtime check in `prisma.ts` that throws a fatal startup exception if `APP_DATABASE_URL` is missing in non-test environments. |
| **Multi-Store & PO Scoping**| Assumed simple single `branchId` column on all entities. | **MULTI-RELATIONSHIP SCOPING.** Explicit scoping rules for dual-store transfers (`storeId` / `toStoreId`), multi-branch POs, and supplier invoice linkages. |

---

## 1. Executive Summary

This specification presents **Revision 2 of the Unified Security Architecture Design** for ZemiFix CMMS Facility Mode. Revision 2 addresses the architectural concerns identified in Revision 1 by establishing explicit administrative permission models, technically valid Prisma interactive transaction handlers using `$queryRaw`, 6 discrete API security realms, task-bound background worker authorization, and a complete table-by-table PostgreSQL Row-Level Security (RLS) inventory.

---

## 2. Corrected Permission Architecture (No Unrestricted Admin Bypass)

### 2.1 Explicit Administrative Permission Model
In Revision 1, the wrapper permitted users with `role.name === 'Admin'` to bypass resource-action permission checks. Revision 2 **eliminates all hardcoded role name bypasses in application code**.

1. **Explicit Permission Seed:** The `Admin` role receives explicit permission assignments in the `role_permissions` junction table (or an explicit wildcard permission `*:*`).
2. **Custom Role Compatibility:** System security evaluates permission grants, not string role names. A custom role (e.g. `RegionalMaintenanceDirector`) can be granted administrative capabilities without requiring code modifications.
3. **Control Plane Decoupling:** Platform Super Administrators (`zemifix_platform_dev`) operate strictly within the SaaS Control Plane. A Platform Admin has **zero implicit access** to tenant operational data in `zemifix_dev` unless explicitly granted a scoped tenant staff session.
4. **Emergency / Exceptional Action Control:** High-impact administrative actions (e.g. deleting an asset, force-closing an open WO, overriding budget limits) mandate step-up OTP verification (`purpose = 'STEP_UP_APPROVAL'`) and generate a dual-control `ApprovalRequest` and immutable `AuditLog` entry.

---

## 3. Corrected Prisma Transaction & PostgreSQL RLS Architecture

### 3.1 Technically Valid Transaction Handler & Query Operation
Revision 2 replaces undocumented Prisma properties and corrects raw SQL operations:
1. **Raw SQL Correctness:** `SELECT set_config(...)` is a query operation returning rows. It MUST be executed via `$queryRaw` rather than `$executeRaw` (which is reserved for `UPDATE`/`INSERT`/`DELETE` returning affected row counts).
2. **Transaction Client Propagation:** All protected queries execute directly on the interactive transaction client `tx` created by `prisma.$transaction(async (tx) => ...)`.

```typescript
// Proposed Specification for src/lib/services/securityContextService.ts

import { PrismaClient } from '@prisma/client';
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
}

/**
 * Sets transaction-scoped PostgreSQL custom GUC variables (`set_config(..., true)`).
 * Uses $queryRaw because SELECT set_config returns result rows.
 * is_local = true restricts configuration strictly to the current transaction block.
 */
export async function setTransactionSecurityContext(
  tx: any,
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

  await tx.$queryRaw`
    SELECT
      set_config('app.current_user_id', ${userId}, true),
      set_config('app.current_branch_id', ${branchId}, true),
      set_config('app.current_branch_path', ${branchPath}, true),
      set_config('app.current_department_id', ${departmentId}, true),
      set_config('app.current_access_scope', ${accessScope}, true),
      set_config('app.current_realm', ${realm}, true),
      set_config('app.current_customer_id', ${customerId}, true),
      set_config('app.current_task_id', ${taskId}, true);
  `;
}

/**
 * Interactive transaction wrapper establishing PostgreSQL RLS context safely.
 */
export async function withSecurityContext<T>(
  context: SecurityContextInput,
  callback: (tx: any) => Promise<T>,
  existingTx?: any
): Promise<T> {
  // If already executing within an existing transaction client, apply context and execute
  if (existingTx) {
    await setTransactionSecurityContext(existingTx, context);
    return callback(existingTx);
  }

  // Otherwise, start a new interactive transaction with timeout and rollback protection
  return prisma.$transaction(
    async (tx: any) => {
      await setTransactionSecurityContext(tx, context);
      return callback(tx);
    },
    {
      timeout: 15000, // 15-second interactive transaction timeout
      isolationLevel: 'ReadCommitted',
    }
  );
}
```

---

## 4. API Security Realms

API endpoints are partitioned into 6 distinct security realms, each enforcing appropriate authentication, access control, and database context:

```
                                [ Incoming API Request ]
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
│ 1. STAFF REALM  │               │ 2. CUSTOMER     │               │ 3. PUBLIC QR    │
│ /api/work-orders│               │ /api/portal/*   │               │ /api/public/*   │
│ • Staff Session │               │ • Portal Cookie │               │ • Anonymous     │
│ • RBAC & Scope  │               │ • Customer ID   │               │ • Rate Limited  │
└─────────────────┘               └─────────────────┘               └─────────────────┘
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
│ 4. AUTH REALM   │               │ 5. WORKER REALM │               │ 6. SYSTEM REALM │
│ /api/auth/*     │               │ /api/internal/* │               │ /api/health     │
│ • Pre-Auth JWT  │               │ • Task Token    │               │ • Unprotected   │
│ • OTP Challenge │               │ • Task Context  │               │ • Read-Only     │
└─────────────────┘               └─────────────────┘               └─────────────────┘
```

### 4.1 Realm Specifications

1. **Internal Staff Realm (`STAFF`):** Protects core CMMS operations (`/api/work-orders`, `/api/assets`, `/api/inventory`, `/api/procurement`). Requires valid `zemifix_session` cookie, verifies `resource:action` permissions, and applies user's effective access scope.
2. **Customer Portal Realm (`CUSTOMER`):** Protects client portal endpoints (`/api/portal/*`). Requires valid `zemifix_portal_session` cookie. Resolves `customerContactId` and `customerId`. Restricts queries strictly to the client's own customer ID and site grants (`customer_contact_site_grants`).
3. **Public QR / Request Realm (`PUBLIC_QR`):** Protects anonymous maintenance request routes (`/api/public/requests`, `/api/public/qr/resolve`). Requires NO session cookie. Rate-limited (10 reqs/hr per IP). Has **zero write access to core Work Orders or Assets**; writes exclusively to `PublicRequestIntake` table.
4. **Authentication & OTP Realm (`AUTH`):** Manages login and multi-factor authentication (`/api/auth/login`, `/api/auth/verify-otp`). Pre-auth endpoint issues a 10-minute JWT with `audience: 'zemifix-preauth'`.
5. **Internal Worker Realm (`WORKER`):** Manages background cron executions (`/api/internal/workers/run`). Requires HMAC task bearer signature. Establishes task-specific worker identity.
6. **Health & System Realm (`SYSTEM`):** Unprotected diagnostic endpoints (`/api/health`). Performs lightweight DB ping; returns no sensitive data.

---

## 5. Task-Bound Background Worker Security Architecture

Revision 2 eliminates unrestricted worker access. Shared secret keys are insufficient for database authorization.

### 5.1 Worker Task Identity & Least Privilege
Every background job execution receives a **Task-Bound Security Context**:

```typescript
export interface WorkerTaskContext {
  taskId: string;           // e.g. "task_pm_gen_20261119_001"
  taskType: 'PM_GENERATION' | 'SLA_MONITORING' | 'LOW_STOCK_CHECK' | 'NOTIFICATION_DISPATCH';
  companyId: string;
  allowedOperations: string[]; // e.g. ['work_order:create', 'pm_plan:read']
}
```

1. **Job Run Audit:** Worker execution logs start and end state in `background_job_runs` table (`jobType`, `status`, `startedAt`, `completedAt`, `affectedRecordCount`).
2. **Database Context:** `app_realm` is set to `'WORKER'`, and `app_task_id` is set to the specific `taskId`.
3. **RLS Policy Enforcement:** PostgreSQL RLS policies evaluate `app_realm() = 'WORKER'` and verify that the operation corresponds to the active task type.

---

## 6. Comprehensive Table-by-Table RLS Coverage Inventory

The table below catalogs all 42 tables in `prisma/schema.prisma` and their explicit RLS policies:

| # | Table Name | Entity Domain | RLS Status | Branch / Tenant Ownership | Proposed `SELECT` Policy | Proposed `INSERT` / `UPDATE` / `DELETE` Policy |
|---|---|---|---|---|---|---|
| 1 | `companies` | Config | **EXEMPT** | Company Root | Public Read for Staff / Admin Update | Admin Only Update |
| 2 | `branches` | Org | **EXEMPT** | Tree Root | Read Active Branches / Admin Update | Admin Only |
| 3 | `departments` | Org | **EXEMPT** | Tree Root | Read Active Depts / Admin Update | Admin Only |
| 4 | `users` | Identity | **EXEMPT** | Branch / Dept | Read Self & Branch Staff | Admin / User Mgr |
| 5 | `roles` | RBAC | **EXEMPT** | Global Config | Read All Roles | Admin Only |
| 6 | `permissions` | RBAC | **EXEMPT** | Global Config | Read All Permissions | Admin Only |
| 7 | `role_permissions` | RBAC | **EXEMPT** | Global Config | Read All Grants | Admin Only |
| 8 | `user_scope_grants`| Org | **EXEMPT** | Staff Link | Read Self Grants | Admin Only |
| 9 | `customers` | Commercial | **FORCED** | Tenant | Staff / Worker / Own Customer ID | Staff Create / Admin Update |
| 10 | `customer_sites` | Commercial | **FORCED** | Customer Link | Staff / Worker / Own Customer Sites | Staff Create / Admin Update |
| 11 | `customer_contacts`| Portal | **FORCED** | Customer Link | Staff / Worker / Own Contact ID | Admin / Primary Contact |
| 12 | `customer_contact_site_grants` | Portal | **FORCED** | Contact & Site | Staff / Worker / Own Site Grants | Primary Contact / Admin |
| 13 | `portal_sessions` | Portal | **EXEMPT** | Contact Link | Own Session ID | Own Session ID |
| 14 | `auth_otps` | Security | **EXEMPT** | User / Contact | Own Active OTP Row | Own Active OTP Row |
| 15 | `api_keys` | Security | **EXEMPT** | Branch Link | Admin / Key Manager | Admin Only |
| 16 | `approval_rules` | Governance | **EXEMPT** | Branch Link | Staff Read / Admin Write | Admin Only |
| 17 | `approval_requests`| Governance| **EXEMPT** | Branch Link | Staff Read Relevant Requests | Maker / Checker Only |
| 18 | `approval_steps` | Governance | **EXEMPT** | Request Link | Staff Read Relevant Steps | Checker Only |
| 19 | `approval_actions` | Governance | **EXEMPT** | Step Link | Staff Read Actions | Checker Only |
| 20 | `audit_logs` | Compliance | **FORCED** | Company Scope | Company Scope Staff / Worker | Append-Only (Insert True, Delete False) |
| 21 | `asset_categories`| Taxonomy | **EXEMPT** | Global Config | Read All Categories | Asset Manager Only |
| 22 | `locations` | Physical | **EXEMPT** | Branch Link | Read Branch Locations | Asset Manager Only |
| 23 | `assets` | Equipment | **FORCED** | Branch / Customer | Branch / Dept / Own / Customer Scope | Branch Scope Write |
| 24 | `asset_locations_history` | History | **EXEMPT** | Asset Link | Read Asset Location History | System Append Only |
| 25 | `asset_status_history` | History | **EXEMPT** | Asset Link | Read Asset Status History | System Append Only |
| 26 | `asset_ownership_history`| History | **EXEMPT** | Asset Link | Read Asset Ownership History | System Append Only |
| 27 | `asset_management_history`| History | **EXEMPT** | Asset Link | Read Management History | System Append Only |
| 28 | `asset_meters` | Telemetry | **EXEMPT** | Asset Link | Read Asset Meters | Asset Manager / Tech |
| 29 | `meter_readings` | Telemetry | **EXEMPT** | Asset Link | Read Meter Readings | Tech / System Append Only |
| 30 | `asset_downtime_logs` | Outage | **EXEMPT** | Asset Link | Read Downtime Logs | Tech / System Append Only |
| 31 | `work_requests` | Work Ops | **FORCED** | Branch / Dept | Branch / Dept / Own Scope | Staff Create / Planner Review |
| 32 | `public_request_intakes` | Intake | **EXEMPT** | Site Link | Staff Read Intakes | Public Insert Only |
| 33 | `work_orders` | Work Ops | **FORCED** | Branch / Dept | Branch / Dept / Own / Customer Scope | Branch / Assigned Tech Write |
| 34 | `work_order_status_history`| History | **EXEMPT** | WO Link | Read WO Status History | System Append Only |
| 35 | `work_order_tasks`| Work Ops | **EXEMPT** | WO Link | Read WO Tasks | Assigned Tech / Supervisor |
| 36 | `work_order_checklist_items`| Work Ops | **EXEMPT** | WO Link | Read Checklist Items | Assigned Tech / Supervisor |
| 37 | `work_order_labor` | Costing | **EXEMPT** | WO Link | Read WO Labor | Tech Log Self / Supervisor |
| 38 | `work_order_parts` | Costing | **EXEMPT** | WO Link | Read WO Parts | Storekeeper / Tech |
| 39 | `work_order_expenses`| Costing | **EXEMPT** | WO Link | Read WO Expenses | Tech / Supervisor |
| 40 | `work_order_attachments`| Attachments| **EXEMPT** | WO Link | Read WO Attachments | Staff / Customer Link |
| 41 | `work_order_comments`| Collaboration| **EXEMPT** | WO Link | Read WO Comments | Staff / Customer Link |
| 42 | `stores` | Stores | **TO ENABLE** | Branch / Dept | Branch / Dept Scope | Storekeeper / Admin |
| 43 | `parts` | Catalogue | **TO ENABLE** | Global Config | Read Active Parts | Storekeeper / Admin |
| 44 | `stocks` | Inventory | **TO ENABLE** | Store Link | Store Branch / Dept Scope | Storekeeper / System |
| 45 | `stock_transactions`| Ledger | **TO ENABLE** | Store Link | Store Branch / Dept Scope | Storekeeper Append Only |
| 46 | `store_transfers` | Warehouse | **TO ENABLE** | Source / Dest Store| Source or Dest Branch Scope | Storekeeper / Approver |
| 47 | `stock_adjustments`| Count | **TO ENABLE** | Store Link | Store Branch Scope | Storekeeper / Checker |
| 48 | `purchase_requisitions`| Procurement| **TO ENABLE** | Branch / Dept | Branch / Dept / Own Scope | Staff Create / Approver |
| 49 | `purchase_orders` | Procurement| **TO ENABLE** | Branch / Dept | Branch / Dept / Own Scope | Procurement Manager / Approver |
| 50 | `goods_received_notes`| Receiving | **TO ENABLE** | Store / PO Link | Store / Branch Scope | Storekeeper / Receiver |
| 51 | `supplier_invoices`| Finance | **TO ENABLE** | PO Link | Branch Scope | Finance Manager |
| 52 | `invoices` | Invoicing | **FORCED** | Branch / Customer | Branch Scope / Own Customer | Finance Manager |
| 53 | `payments` | Receivables | **TO ENABLE** | Invoice Link | Branch Scope / Own Customer | Finance Manager |
| 54 | `maintenance_plans`| PM | **TO ENABLE** | Branch / Asset | Branch / Dept Scope | Planner / Maintenance Mgr |

---

## 7. Complex Ownership Rules & Multi-Relationship Scoping

### 7.1 Inter-Warehouse Stock Transfers (`StoreTransfer`)
A stock transfer involves a source store (`fromStoreId`) and a destination store (`toStoreId`), which may belong to different branches:
* **Rule:** A Storekeeper assigned to Branch A can view a transfer if Branch A is either the source branch OR the destination branch (`fromStore.branchId = user.branchId OR toStore.branchId = user.branchId`).
* **Approval Rule:** Issuing stock requires write authority in the source store; receiving stock requires write authority in the destination store.

### 7.2 Multi-Branch Purchase Orders & Linked Invoices
A Purchase Order (`PurchaseOrder`) belongs to a ordering branch (`branchId`), but line items may specify delivery to multiple stores/branches:
* **Rule:** Procurement staff view POs based on the ordering `branchId` or destination `store.branchId`.
* **Linked Supplier Invoices:** A `SupplierInvoice` inherits access scope from its parent `PurchaseOrder.branchId`.

---

## 8. Database Runtime-Role Separation

```
[ Web Application Server ]
           │
           ▼ (APP_DATABASE_URL)
[ zemifix_app_user Role ] ──► (NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS)
           │
           ▼
[ PostgreSQL Engine ] ──► (Enforces Row-Level Security Policies)
```

1. **Prisma Client Startup Guard (`src/lib/prisma.ts`):**
   ```typescript
   if (process.env.NODE_ENV !== 'test' && !process.env.APP_DATABASE_URL) {
     throw new Error(
       'FATAL_SECURITY_ERROR: APP_DATABASE_URL is missing. Application runtime ' +
       'must connect using the restricted zemifix_app_user role.'
     );
   }
   ```
2. **Prisma CLI Migrations:** Migrations execute via `DATABASE_URL` (superuser `postgres`) during CI/CD build scripts, completely separate from the web runtime process.

---

## 9. Comprehensive Testing Strategy

| Test Suite | Test Type | Target Scope & Scenario | Expected Result |
|---|---|---|---|
| `authWrapper.test.ts` | Unit | Unauthenticated request to `/api/work-orders` | HTTP 401 Unauthorized |
| `permissionCheck.test.ts` | Unit | User without `inventory:issue` attempting stock issue | HTTP 403 Forbidden |
| `explicitAdmin.test.ts` | Unit | Admin user without explicit permission grant | HTTP 403 Forbidden (No hardcoded bypass) |
| `branchIsolation.test.ts` | Integration | Branch A user requesting Branch B asset ID | HTTP 404 / 403 Not Found |
| `branchAndBelow.test.ts` | Integration | Regional manager querying sub-branch work orders | HTTP 200 (Matches materialized path) |
| `customerPortal.test.ts` | Integration | Customer A contact attempting to view Customer B invoice | HTTP 403 Forbidden |
| `publicQrIntake.test.ts` | Integration | Anonymous QR form submission | HTTP 201 (Created in `PublicRequestIntake` only) |
| `workerTaskIsolation.test.ts`| Integration | PM worker attempting to delete purchase orders | HTTP 403 Forbidden (Task boundary enforced) |
| `rlsFailClosed.test.ts` | Integration | Query as `zemifix_app_user` without `withSecurityContext` | Returns 0 rows (Fail-Closed) |
| `concurrentGuc.test.ts` | E2E | 100 parallel requests with alternating branch contexts | Zero GUC leakage across connection pool |

---

## 10. Migration & Implementation Roadmap (Phase F1.2)

1. **Step 1:** Create `src/lib/authWrapper.ts` implementing `withApiSecurity`.
2. **Step 2:** Update `src/lib/services/securityContextService.ts` with valid `$queryRaw` SQL handlers.
3. **Step 3:** Implement universal scope helpers in `inventoryService.ts`, `procurementService.ts`, `billingService.ts`.
4. **Step 4:** Wrap all route handlers under `src/app/api/` with `withApiSecurity`.
5. **Step 5:** Create SQL migration `20261119000001_stage6_3_rls_secondary_tables` applying RLS to secondary tables.
6. **Step 6:** Add startup fail-closed guard in `src/lib/prisma.ts`.

---

## 11. Exact Files Expected to Change in Phase F1.2

1. `src/lib/authWrapper.ts` **[NEW]**
2. `src/lib/services/securityContextService.ts`
3. `src/lib/prisma.ts`
4. `src/lib/services/inventoryService.ts`
5. `src/lib/services/procurementService.ts`
6. `src/lib/services/billingService.ts`
7. Route Handlers under `src/app/api/` (Inventory, Procurement, Invoices, PM, SLA)
8. `prisma/migrations/20261119000001_stage6_3_rls_secondary_tables/migration.sql` **[NEW]**

---
*Specification authored automatically by ZemiFix Enterprise Security Architecture Engine. Baseline architecture review completed on `E:\HP\Downloads\remix-zemifix-cmms`.*
