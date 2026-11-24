# ZemiFix F1.2.1 — Unified Security Architecture Design

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1  
**Document Type:** Technical Architecture Design Specification  
**Status:** Architecture Baseline & Formal Review Candidate  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Reference Document:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md`  
**Execution Type:** READ-ONLY ARCHITECTURAL SPECIFICATION (No application code or database modifications executed)

---

## 1. Executive Summary

This document specifies the **Unified Security Architecture Design** for ZemiFix CMMS Facility Mode. Based on the findings of the F1.1 Security Audit, this architecture closes critical vulnerability gaps—specifically cross-branch data leaks in secondary modules, dormant PostgreSQL Row-Level Security (RLS) in web API handlers, and inconsistent permission enforcement—without requiring a full rewrite of existing application code.

### Core Architectural Pillars:
1. **Higher-Order API Security Wrapper (`withApiSecurityContext`):** Standardizes authentication, permission verification (`resource:action`), access-scope resolution, and transaction-bound PostgreSQL context establishment across all API handlers under `src/app/api/`.
2. **Transaction-Bound PostgreSQL RLS Integration:** Guarantees that PostgreSQL custom configuration settings (`set_config('app.current_*', ..., true)`) and protected DML queries execute on the **exact same transaction-scoped client (`tx`)** with `is_local = true`, eliminating context leaks across pooled connections.
3. **Universal Access-Scope Engine (`getScopedFilter`):** Uniformly applies `Own`, `Department`, `Branch`, `BranchAndBelow` (hierarchical materialized path `/1/4/9/`), and `Company` filtering across all 12 CMMS domains, including Inventory, Procurement, Finance, Preventive Maintenance, and SLA Breaches.
4. **Dual-Role Database Runtime Isolation:** Enforces strict separation between the administrative migration owner (`postgres`) and the restricted non-superuser application runtime role (`zemifix_app_user`), supported by environment-variable startup guards (`APP_DATABASE_URL`).

---

## 2. Current Architecture Assessment & Retained Foundations

The proposed security architecture preserves all established structural conventions of ZemiFix:

- **Next.js 15 App Router & React 19:** Server-side route handlers under `src/app/api/` remain the primary API interface.
- **Prisma 6 & PostgreSQL 16:** Prisma Client is retained as the ORM, extended with UUIDv7 generation (`src/lib/prisma.ts`).
- **Identity & Realm Separation:** Internal staff (`User`), external customer contacts (`CustomerContact`), and background workers (`app_realm = 'WORKER'`) remain strictly separated.
- **SaaS Control Plane & Tenant Data Isolation:** The central SaaS control plane database (`zemifix_platform_dev`) and tenant databases (`zemifix_dev`) remain decoupled.
- **Branch & Department Hierarchy:** Branch trees (`Branch.path`) and department structures remain the foundational organizational boundary.

---

## 3. Proposed Architecture Overview

The Security Architecture enforces a **4-Layer Defense-in-Depth Pipeline**:

```
[ Client HTTP Request ]
          │
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: Middleware Security Gate (src/middleware.ts)                  │
│ • Validates session cookie ('zemifix_session')                         │
│ • Enforces CSRF origin checks for mutation methods (POST/PUT/DELETE)   │
│ • Restricts technician routes to /pwa                                  │
└────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: Higher-Order API Security Wrapper (withApiSecurityContext)    │
│ • Validates active staff session & account status                       │
│ • Enforces granular resource-action permissions (e.g. 'inventory:read')│
│ • Resolves effective user access scope ('Own'..'Company')              │
└────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: Application Access-Scope Filtering (getScopedFilter)          │
│ • Generates Prisma 'where' clauses (Branch, Department, AssignedUser)  │
│ • Supports 'BranchAndBelow' via materialized paths (path LIKE '...')   │
└────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: Database-Level Row-Level Security (PostgreSQL RLS)            │
│ • Runs inside transaction-scoped client (tx)                           │
│ • Executes set_config('app.current_*', ..., is_local => true)          │
│ • Fail-closed RLS policies enforce DB-level read/write boundary        │
└────────────────────────────────────────────────────────────────────────┘
          │
          ▼
[ PostgreSQL Engine (zemifix_app_user Role) ]
```

---

## 4. API Security Flow & Wrapper Specification

### 4.1 Higher-Order Wrapper Signature
To ensure zero boilerplate repetition across API routes, a reusable higher-order function `withApiSecurityContext` will wrap Next.js API handlers.

```typescript
// Proposed Specification for src/lib/authWrapper.ts

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, AuthenticatedUser } from './auth';
import { withSecurityContext, SecurityContextInput } from './services/securityContextService';
import { ForbiddenError, AuthenticationError } from './db-errors';

export interface ApiSecurityOptions {
  /** Optional resource permission requirement e.g. 'inventory' */
  resource?: string;
  /** Optional action permission requirement e.g. 'read' */
  action?: string;
  /** Roles authorized to bypass permission check (e.g. ['Admin']) */
  roles?: string[];
  /** Execution realm (defaults to 'STAFF') */
  realm?: 'STAFF' | 'CUSTOMER' | 'WORKER';
}

export type AuthenticatedApiHandler<T = any> = (
  req: NextRequest,
  context: {
    user: AuthenticatedUser;
    securityContext: SecurityContextInput;
    tx: any; // Transaction-scoped Prisma Client
    params?: any;
  }
) => Promise<NextResponse | T>;

/**
 * Higher-order function wrapping API handlers with full authentication,
 * RBAC permission verification, and transaction-bound PostgreSQL RLS setup.
 */
export function withApiSecurity<T = any>(
  options: ApiSecurityOptions,
  handler: AuthenticatedApiHandler<T>
) {
  return async (req: NextRequest, routeParams?: { params: Promise<any> }) => {
    try {
      // 1. Authenticate user session
      const user = await getCurrentUser(req);
      if (!user) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED: Active session required.' },
          { status: 401 }
        );
      }

      // 2. Verify account status
      if (!user.isActive || user.deletedAt) {
        return NextResponse.json(
          { error: 'FORBIDDEN: Account is deactivated or deleted.' },
          { status: 403 }
        );
      }

      // 3. Verify Role & Resource-Action Permissions
      if (options.roles && options.roles.length > 0) {
        const hasRole = options.roles.includes(user.role.name) || user.role.name === 'Admin';
        if (!hasRole) {
          return NextResponse.json(
            { error: `FORBIDDEN: Role "${user.role.name}" is unauthorized for this endpoint.` },
            { status: 403 }
          );
        }
      }

      if (options.resource && options.action) {
        const hasPerm = user.role.permissions?.some(
          (rp) =>
            rp.permission.resource === options.resource &&
            rp.permission.action === options.action
        ) || user.role.name === 'Admin';

        if (!hasPerm) {
          return NextResponse.json(
            { error: `FORBIDDEN: Missing required permission "${options.resource}:${options.action}".` },
            { status: 403 }
          );
        }
      }

      // 4. Construct Security Context Input
      const secContext: SecurityContextInput = {
        userId: user.id,
        branchId: user.branchId,
        branchPath: user.branch?.path ?? null,
        departmentId: user.departmentId ?? null,
        accessScope: user.accessScope ?? 'Own',
        realm: options.realm ?? 'STAFF',
      };

      const resolvedParams = routeParams?.params ? await routeParams.params : undefined;

      // 5. Execute Handler Inside Transaction-Bound PostgreSQL Security Context
      return await withSecurityContext(secContext, async (tx) => {
        return await handler(req, {
          user,
          securityContext: secContext,
          tx,
          params: resolvedParams,
        });
      });
    } catch (err: any) {
      console.error('[API Security Wrapper Error]:', err);
      const status = err instanceof AuthenticationError ? 401 : err instanceof ForbiddenError ? 403 : 500;
      return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status });
    }
  };
}
```

---

## 5. Transaction-Bound PostgreSQL RLS Design

### 5.1 Connection Pooling & Context Isolation Safeguards
PostgreSQL connection poolers (e.g. PgBouncer or Prisma connection pool) reuse physical TCP connections across different HTTP requests. Calling `SET app.current_user_id = '...'` globally on a pooled connection risks **security context bleeding** to subsequent requests.

To solve this, ZemiFix mandates `set_config(..., is_local => true)`.

```sql
SELECT set_config('app.current_user_id', 'usr_123', true);
```

When `is_local` is set to `true`, PostgreSQL scope is restricted **strictly to the current transaction block (`BEGIN ... COMMIT / ROLLBACK`)**. As soon as the transaction completes, all custom GUC settings automatically revert to empty strings, guaranteeing zero context leakage across connection pool reuse.

### 5.2 Implementation Blueprint for `securityContextService.ts`

```typescript
// Proposed Implementation for src/lib/services/securityContextService.ts

import { prisma } from '../prisma';

export interface SecurityContextInput {
  userId?: string | null;
  branchId?: string | null;
  branchPath?: string | null;
  departmentId?: string | null;
  accessScope?: 'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own' | string;
  realm?: 'STAFF' | 'CUSTOMER' | 'WORKER';
  customerId?: string | null;
}

/**
 * Sets transaction-scoped PostgreSQL GUC configuration variables (`set_config(..., true)`).
 * Must be executed within an active transaction (`tx`).
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

  // Execute set_config with is_local = true (transaction scoped)
  await tx.$executeRaw`
    SELECT
      set_config('app.current_user_id', ${userId}, true),
      set_config('app.current_branch_id', ${branchId}, true),
      set_config('app.current_branch_path', ${branchPath}, true),
      set_config('app.current_department_id', ${departmentId}, true),
      set_config('app.current_access_scope', ${accessScope}, true),
      set_config('app.current_realm', ${realm}, true),
      set_config('app.current_customer_id', ${customerId}, true);
  `;
}

/**
 * Executes a callback within a transaction block where PostgreSQL RLS context is populated.
 */
export async function withSecurityContext<T>(
  context: SecurityContextInput,
  callback: (tx: any) => Promise<T>,
  client: any = prisma
): Promise<T> {
  // If client is already inside an active transaction, execute directly
  if (client.$isTransaction) {
    await setTransactionSecurityContext(client, context);
    return callback(client);
  }

  // Otherwise, wrap in an interactive $transaction
  return client.$transaction(
    async (tx: any) => {
      await setTransactionSecurityContext(tx, context);
      return callback(tx);
    },
    { timeout: 15000 }
  );
}
```

---

## 6. Universal Access-Scope Engine Specification

Application-level Prisma queries must generate precise `where` filters based on `user.accessScope`.

### 6.1 Domain Mapping Matrix

| Domain | Entity | Direct Branch Column | `BranchAndBelow` Filter Rule | `Department` Filter Rule | `Own` Filter Rule |
|---|---|---|---|---|---|
| **Work Orders** | `WorkOrder` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `assignedUserId = userId OR supervisorUserId = userId` |
| **Assets** | `Asset` | `branchId` | `branch.path LIKE userBranchPath %` | `responsibleDepartmentId = userDeptId` | `responsibleUserId = userId OR custodianUserId = userId` |
| **Work Requests** | `WorkRequest` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `requesterUserId = userId` |
| **Stores** | `Store` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `managerUserId = userId` |
| **Inventory Parts** | `Part` | Via `stocks.store` | `stocks.some.store.branch.path LIKE ...` | `stocks.some.store.departmentId = ...` | `stocks.some.store.managerUserId = ...` |
| **Stock Transactions** | `StockTransaction` | Via `store` / `toStore` | `store.branch.path LIKE ...` | `store.departmentId = ...` | `performedByUserId = userId` |
| **Procurement PRs** | `PurchaseRequisition` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `requesterUserId = userId` |
| **Procurement POs** | `PurchaseOrder` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `createdByUser = userId OR approvedByUserId = userId` |
| **Finance Invoices** | `Invoice` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `createdByUser = userId` |
| **Preventive Maintenance**| `MaintenancePlan` | `branchId` | `branch.path LIKE userBranchPath %` | `departmentId = userDeptId` | `createdByUserId = userId` |
| **SLA Breaches** | `SLABreachLog` | Via `workOrder` | `workOrder.branch.path LIKE ...` | `workOrder.departmentId = ...` | `workOrder.assignedUserId = userId` |

---

## 7. RBAC Permission Model & Resource-Action Strategy

Permissions follow the standard `resource:action` catalog:

### 7.1 Resource-Action Permission Catalog
- **Assets:** `asset:read`, `asset:create`, `asset:update`, `asset:delete`, `asset:relocate`
- **Work Orders:** `work_order:read`, `work_order:create`, `work_order:update`, `work_order:assign`, `work_order:approve`, `work_order:close`
- **Inventory:** `inventory:read`, `inventory:create_part`, `inventory:issue`, `inventory:transfer`, `inventory:adjust`
- **Procurement:** `procurement:read`, `procurement:requisition_create`, `procurement:requisition_approve`, `procurement:po_create`, `procurement:po_approve`, `procurement:grn_create`
- **Finance:** `finance:read`, `finance:invoice_create`, `finance:invoice_approve`, `finance:recharge_create`
- **Organization:** `organization:read`, `organization:manage_branches`, `organization:manage_users`

---

## 8. Database RLS Coverage Matrix

RLS policies will be extended in migration `20261119000001_stage6_3_rls_secondary_tables`.

| Table Name | Entity Class | RLS Status | Policy Scope Target (`USING` & `WITH CHECK`) |
|---|---|---|---|
| `work_orders` | Domain Core | **ENABLED & FORCED** | Branch, BranchAndBelow, Dept, Own, Customer |
| `assets` | Domain Core | **ENABLED & FORCED** | Branch, BranchAndBelow, Dept, Own, Customer |
| `customers` | Domain Core | **ENABLED & FORCED** | Staff / Worker / Own Customer ID |
| `customer_sites` | Domain Core | **ENABLED & FORCED** | Staff / Worker / Own Customer ID |
| `invoices` | Financial | **ENABLED & FORCED** | Staff / Worker / Own Customer ID |
| `quotes` | Commercial | **ENABLED & FORCED** | Staff / Worker / Own Customer ID |
| `audit_logs` | Compliance | **ENABLED & FORCED** | Select: Company Scope Staff / Insert: Public Check True |
| `stores` | Inventory (NEW) | **TO ENABLE** | Branch, BranchAndBelow, Dept Scope |
| `parts` | Inventory (NEW) | **TO ENABLE** | Staff Read All / Write Company Scope |
| `stock_transactions` | Inventory (NEW) | **TO ENABLE** | Store Branch / Dept Scope |
| `purchase_requisitions`| Procurement (NEW)| **TO ENABLE** | Branch, BranchAndBelow, Dept, Own Scope |
| `purchase_orders` | Procurement (NEW)| **TO ENABLE** | Branch, BranchAndBelow, Dept, Own Scope |
| `maintenance_plans` | PM (NEW) | **TO ENABLE** | Branch, BranchAndBelow, Dept Scope |

---

## 9. Database Runtime-Role Architecture

To ensure Prisma never silently bypasses RLS in production:

```
┌─────────────────────────────────────────────────────────────┐
│ ENVIRONMENT VARIABLES                                       │
│ • DATABASE_URL     = postgres://postgres:...@host/zemifix   │
│   (Superuser / Migration Owner — Used ONLY by Prisma CLI)   │
│                                                             │
│ • APP_DATABASE_URL = postgres://zemifix_app_user:...@host   │
│   (Restricted Non-Superuser Role — Used by Web Web Application)│
└─────────────────────────────────────────────────────────────┘
```

### 9.1 Fail-Closed Startup Validation
In `src/lib/prisma.ts`:
```typescript
if (process.env.NODE_ENV === 'production' && !process.env.APP_DATABASE_URL) {
  throw new Error(
    'CRITICAL_SECURITY_FATAL: APP_DATABASE_URL environment variable is required in production ' +
    'to enforce non-superuser PostgreSQL Row-Level Security (RLS).'
  );
}
```

---

## 10. Background Worker Security Architecture

Automated scheduled jobs (`processPreventiveMaintenanceJobs`, `evaluateSLAThresholds`, `dispatchNotifications`) do not run under a logged-in staff session.

### Worker Context Protocol:
1. Internal worker runner (`/api/internal/workers/run`) validates the `WORKER_SECRET_KEY` bearer token.
2. Background tasks initialize a special `WORKER` security context:
   ```typescript
   const workerContext: SecurityContextInput = {
     userId: '00000000-0000-0000-0000-000000000000',
     realm: 'WORKER',
     accessScope: 'Company',
   };
   ```
3. PostgreSQL RLS functions evaluate `app_realm() = 'WORKER'` to `TRUE`, granting the background worker full DML permissions to generate work orders and process SLA breaches across all branches safely.

---

## 11. Testing Strategy

### 11.1 Test Suite Breakdown
1. **Unit Tests (`withApiSecurity.test.ts`):** Validates authentication checks, 401 response for missing sessions, and 403 response for missing permissions.
2. **Integration Tests (`crossBranchIsolation.test.ts`):** Asserts that a user in Branch A cannot read or write records belonging to Branch B across all 12 modules.
3. **Concurrent Transaction Isolation Tests (`rlsTransactionIsolation.test.ts`):** Simulates 50 parallel requests with alternating `branchId` contexts to verify zero GUC configuration leakage across connection pooling.

---

## 12. Implementation & Remediation Sequence (Phase F1.2)

1. **Step 1:** Implement `withApiSecurity` higher-order wrapper in `src/lib/authWrapper.ts`.
2. **Step 2:** Refactor `src/lib/services/securityContextService.ts` for safe transaction client execution.
3. **Step 3:** Implement universal scope filters (`getScopedInventoryFilter`, `getScopedProcurementFilter`, `getScopedFinanceFilter`, `getScopedPMFilter`) in `src/lib/services/`.
4. **Step 4:** Wrap all route handlers under `src/app/api/` with `withApiSecurity`.
5. **Step 5:** Create SQL migration `20261119000001_stage6_3_rls_secondary_tables` to apply RLS to Stores, Parts, Stock Transactions, PRs, POs, and PM Plans.
6. **Step 6:** Add production startup check in `src/lib/prisma.ts`.

---

## 13. Exact Files Expected to Change in Phase F1.2

1. `src/lib/authWrapper.ts` **[NEW]**
2. `src/lib/services/securityContextService.ts`
3. `src/lib/prisma.ts`
4. `src/lib/services/inventoryService.ts`
5. `src/lib/services/procurementService.ts`
6. `src/lib/services/billingService.ts`
7. `src/app/api/assets/route.ts`
8. `src/app/api/work-orders/route.ts`
9. `src/app/api/inventory/parts/route.ts`
10. `src/app/api/inventory/stores/route.ts`
11. `src/app/api/procurement/requisitions/route.ts`
12. `src/app/api/procurement/purchase-orders/route.ts`
13. `src/app/api/finance/invoices/route.ts`
14. `src/app/api/preventive/plans/route.ts`
15. `src/app/api/sla/breaches/route.ts`
16. `prisma/migrations/20261119000001_stage6_3_rls_secondary_tables/migration.sql` **[NEW]**

---
*Specification authored automatically by ZemiFix Enterprise Security Architecture Engine. Baseline architecture inspection completed on `E:\HP\Downloads\remix-zemifix-cmms`.*
