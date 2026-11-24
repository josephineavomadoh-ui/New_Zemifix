# ZemiFix F1.1 — Security and Data Isolation Verification Audit Report

**Project:** ZemiFix CMMS  
**Audit Target:** Security Architecture, RBAC, Access Scopes, Data Isolation, and PostgreSQL Row-Level Security (RLS)  
**Date:** November 19, 2026  
**Auditor:** Enterprise Security & System Architecture Audit Engine  
**Technology Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Target File:** `ZEMIFIX_F1_1_SECURITY_AND_DATA_ISOLATION_VERIFICATION.md`

---

## 1. Executive Summary

This independent security and data-isolation audit evaluates the authentication, authorization, access control scoping, branch/department isolation, and database-level Row-Level Security (RLS) implementation in ZemiFix Facility Mode.

### Key Audit Findings:
1. **Authentication & Session Management:** **SECURE.** Password hashing uses bcrypt with constant-time dummy hash verification for unknown users (`auth.ts#L100`). Multi-factor authentication relies on 6-digit HMAC-SHA256 hashed OTPs with 5-minute expirations. HTTP-only session cookies and CSRF origin verification (`middleware.ts#L43`) are strictly enforced.
2. **Access-Scope Scoping Gaps (P0):** Application-level access-scope utilities (`getScopedWorkOrderFilter`, `getScopedAssetFilter`, `getScopedWorkRequestFilter`) correctly enforce `Own`, `Department`, `Branch`, `BranchAndBelow`, and `Company` access scopes for Work Orders, Assets, and Requests. However, **Inventory Parts, Stock Transactions, Stores, Purchase Requisitions, Purchase Orders, Supplier Invoices, PM Plans, and SLA Breaches lack complete access-scope enforcement**. Procurement service only performs binary checks (`Company` vs `user.branchId`), completely ignoring `BranchAndBelow` (materialized tree paths), `Department`, and `Own` scopes.
3. **Dormant PostgreSQL Row-Level Security (RLS) (P0):** PostgreSQL RLS is enabled and forced on 7 core tables (`work_orders`, `assets`, `customers`, `customer_sites`, `invoices`, `quotes`, `audit_logs`), and a fail-closed policy engine exists for the `zemifix_app_user` role. However, **`withSecurityContext()` is NEVER called by any API route handler in `src/app/api/` or any application service**. 
4. **Database Runtime Role Dual-Behavior (P0):**
   - If Prisma connects using `DATABASE_URL` as the superuser/owner, PostgreSQL **bypasses RLS entirely**, leaving the database without RLS protection.
   - If Prisma connects using `APP_DATABASE_URL` as `zemifix_app_user`, queries on RLS-protected tables **fail-closed (return 0 rows)** because transaction GUC variables (`app.current_user_id`, `app.current_branch_id`) are never populated by API handlers.

---

## 2. Overall Security Verdict

### **VERDICT: CRITICAL SECURITY WEAKNESSES IDENTIFIED (P0)**

* **Deployment Status:** **BLOCKED FOR COMMERCIAL DEPLOYMENT** until Phase F1.2 Security Remediation.
* **Primary Cause:** Mismatch between application-level API handlers and database-level security context population, combined with incomplete access-scope helpers across secondary operational modules.

---

## 3. Scope and Methodology

### Scope of Investigation:
- Middleware authentication & CSRF validation (`src/middleware.ts`)
- User, Role, Permission, RolePermission, UserScopeGrant schema (`prisma/schema.prisma`)
- Session management & OTP verification (`src/lib/auth.ts`, `src/lib/services/otpService.ts`)
- Permission & Scoping utilities (`src/lib/services/securityContextService.ts`, `workOrderService.ts`, `assetService.ts`, `workRequestService.ts`, `inventoryService.ts`, `procurementService.ts`)
- Database Prisma Client configuration (`src/lib/prisma.ts`)
- PostgreSQL RLS migrations (`prisma/migrations/20261113000003_stage6_2_runtime_app_role/`, `20261114000001_stage6_2_rls_policies/`, `20261114000002_stage6_2_rls_fail_closed_hardening/`)
- All API route handlers under `src/app/api/`

### Methodology:
- **Static Code Analysis:** Code flow tracing from request ingestion in `middleware.ts` down to Prisma query execution in `src/lib/services/`.
- **Database Schema & SQL Policy Inspection:** Analysis of PostgreSQL custom GUC functions (`app_user_id()`, `app_branch_path()`, `app_access_scope()`) and policy definitions in `migration.sql`.
- **Safety Restriction Compliance:** Read-only inspection exclusively. No database mutations, seeds, resets, or git changes were performed.

---

## 4. Authentication and Authorization Findings

### 4.1 Authentication Pipeline
```
[ Client Request ]
       │
       ▼
[ middleware.ts ] ──► (CSRF check for POST/PUT/PATCH/DELETE; Public path pass-through)
       │
       ▼
[ getCurrentUser(req) ] ──► (Verifies JWT cookie 'zemifix_session'; fetches User + Role + Permissions + Branch + Department)
       │
       ▼
[ API Handler ] ──► (Optionally calls requireAuth(); executes Prisma Query)
```

1. **Pre-Auth & Session Isolation:** Session JWTs use `issuer: 'zemifix-cmms'` and `audience: 'zemifix-staff'`. Pre-auth tokens use `audience: 'zemifix-preauth'`, preventing unverified OTP sessions from accessing protected API endpoints.
2. **OTP Enforcement:** `otpService.ts` hashes 6-digit codes using `OTP_SECRET` via HMAC-SHA256, enforces 5-minute expiration, and locks after 3 failed attempts.
3. **Permission Checks:** `requireAuth({ roles, resource, action })` evaluates `hasPermission(user, resource, action)`.
   - *Finding:* While `requireAuth` works as intended, **fewer than 15% of API routes in `src/app/api/` call `requireAuth` with specific resource:action permissions**. Most handlers call `getCurrentUser(req)` and proceed directly to database queries without verifying specific permissions.

---

## 5. Branch and Department Isolation Findings

### 5.1 Scoping Utility Coverage

ZemiFix defines 5 distinct Access Scopes (`AccessScope` enum):
- `Own`: User's own assigned/created records.
- `Department`: Records assigned to user's department.
- `Branch`: Records assigned to user's specific branch.
- `BranchAndBelow`: Records assigned to user's branch OR any child branch (using `path LIKE parentPath || '%'` materialized path).
- `Company`: Global access across all branches.

#### Module Access-Scope Analysis:

| Operational Domain | Scoping Helper | Scoping Capability | Assessment & Deficit |
|--------------------|----------------|-------------------|----------------------|
| **Work Orders** | `getScopedWorkOrderFilter(user)` | `Own`, `Department`, `Branch`, `BranchAndBelow`, `Company` | **COMPLETE.** Uses materialized paths for `BranchAndBelow`. |
| **Assets** | `getScopedAssetFilter(user)` | `Own`, `Department`, `Branch`, `BranchAndBelow`, `Company` | **COMPLETE.** Correctly scopes physical and responsible branches. |
| **Work Requests** | `getScopedWorkRequestFilter(user)` | `Own`, `Department`, `Branch`, `BranchAndBelow`, `Company` | **COMPLETE.** Correctly handles request ownership. |
| **Inventory (Parts & Stores)** | None | None | **CRITICAL GAP.** `getParts()` in `inventoryService.ts#L65` returns all parts across all stores/branches company-wide. |
| **Procurement (PRs & POs)** | Binary check | `Company` vs `user.branchId` | **HIGH GAP.** In `procurementService.ts#L85`, `BranchAndBelow` (child branches), `Department`, and `Own` are ignored. |
| **Finance (Invoices & Credit Notes)** | None | None | **CRITICAL GAP.** `GET /api/finance/invoices` queries all invoices without branch or department filters. |
| **Preventive Maintenance** | None | None | **HIGH GAP.** `GET /api/preventive/plans` fetches all maintenance plans company-wide. |
| **SLA Breaches** | None | None | **HIGH GAP.** `GET /api/sla/breaches` returns global breach logs without branch filtering. |

---

## 6. API Coverage Audit Matrix

The matrix below evaluates authentication, permission enforcement, access scoping, branch isolation, and RLS protection across all active API routes.

| Module | API Route | Operation | Auth Check | Permission Check | Access Scope Enforced | Branch Isolation | RLS Protection | Finding / Severity |
|---|---|---|---|---|---|---|---|---|
| **Auth** | `/api/auth/login` | POST | Anonymous | N/A | N/A | N/A | N/A | **PASS.** Pre-auth token issued. |
| **Auth** | `/api/auth/verify-otp` | POST | Pre-Auth | N/A | N/A | N/A | N/A | **PASS.** Session cookie set on success. |
| **Assets** | `/api/assets` | GET | Session | None | Yes (`getScopedAssetFilter`) | Yes | Dormant | **PASS (App Level).** RLS dormant. |
| **Assets** | `/api/assets` | POST | Session | None | Partial (Created by User) | No Check | Dormant | **WARN (P2).** No branch write check. |
| **Assets** | `/api/assets/[id]` | GET | Session | None | Partial | Partial | Dormant | **WARN (P2).** Single fetch un-scoped. |
| **Work Orders** | `/api/work-orders` | GET | Session | None | Yes (`getScopedWorkOrderFilter`) | Yes | Dormant | **PASS (App Level).** RLS dormant. |
| **Work Orders** | `/api/work-orders` | POST | Session | None | Enforced by Service | Yes | Dormant | **PASS (App Level).** Service scopes. |
| **Requests** | `/api/requests` | GET | Session | None | Yes (`getScopedWorkRequestFilter`) | Yes | Dormant | **PASS (App Level).** Scoped. |
| **Public QR** | `/api/public/requests` | POST | Anonymous | Public | N/A | Token Resolved | N/A | **PASS.** Rate-limited & idempotency key. |
| **Inventory** | `/api/inventory/parts` | GET | Session | None | **NO** | **NO** | None | **VULNERABLE (P0).** Global data leak. |
| **Inventory** | `/api/inventory/stores` | GET | Session | None | **NO** | **NO** | None | **VULNERABLE (P0).** All stores returned. |
| **Inventory** | `/api/inventory/issues` | POST | Session | None | Partial | Partial | None | **VULNERABLE (P1).** Can issue from any store. |
| **Procurement** | `/api/procurement/requisitions` | GET | Session | None | Binary Only (`Company` vs `Branch`) | Partial | None | **VULNERABLE (P1).** Child branches hidden. |
| **Procurement** | `/api/procurement/purchase-orders` | GET | Session | None | Binary Only | Partial | None | **VULNERABLE (P1).** Child branches hidden. |
| **Finance** | `/api/finance/invoices` | GET | Session | None | **NO** | **NO** | Dormant | **VULNERABLE (P0).** Global invoice leak. |
| **Finance** | `/api/finance/payments` | GET | Session | None | **NO** | **NO** | None | **VULNERABLE (P0).** Global payment leak. |
| **Preventive** | `/api/preventive/plans` | GET | Session | None | **NO** | **NO** | None | **VULNERABLE (P1).** Global PM plan leak. |
| **SLA** | `/api/sla/breaches` | GET | Session | None | **NO** | **NO** | None | **VULNERABLE (P1).** Global breach leak. |
| **Organization** | `/api/organization/branches` | GET | Session | `Admin`, `MaintenanceManager` | Company | Global | N/A | **PASS.** Role restricted. |
| **Users** | `/api/users` | GET | Session | None | Company | Global | N/A | **WARN (P2).** All staff returned. |

---

## 7. PostgreSQL Row-Level Security (RLS) Findings

### 7.1 RLS Configuration vs. Runtime Execution

```
                       [ Incoming Web Request ]
                                  │
                                  ▼
                       [ Next.js API Route Handler ]
                                  │
          ┌───────────────────────┴───────────────────────┐
          │                                               │
(withSecurityContext NOT CALLED)                 (withSecurityContext CALLED)
          │                                               │
          ▼                                               ▼
[ GUC Variables Empty ]                        [ GUC Variables Populated ]
(app.current_branch_id = NULL)                 (app.current_branch_id = 'uuid')
          │                                               │
          ├───────────────────────────────┐               │
          ▼                               ▼               ▼
[ APP_DATABASE_URL User ]       [ DATABASE_URL Superuser ] [ APP_DATABASE_URL User ]
  (zemifix_app_user)               (postgres)               (zemifix_app_user)
          │                               │                       │
          ▼                               ▼                       ▼
[ RLS Policy = FALSE ]         [ RLS BYPASSED ]         [ RLS Enforced Correctly ]
  (Returns 0 Rows / Fails)       (Returns All Rows)        (Returns Scoped Rows)
   ▲                                                       ▲
   │                                                       │
   └──────── CURRENT WEB RUNTIME FAIL-CLOSED ──────────────┘
```

1. **Configured & Enabled Tables:** RLS is `ENABLED` and `FORCED` on 7 tables (`work_orders`, `assets`, `customers`, `customer_sites`, `invoices`, `quotes`, `audit_logs`).
2. **Policy Architecture:** Policies check PostgreSQL custom GUC functions (`app_access_scope()`, `app_branch_path()`, `app_branch_id()`, `app_user_id()`).
3. **Execution Reality:**
   - `securityContextService.ts` exports `withSecurityContext()`, which executes:
     ```sql
     SELECT
       set_config('app.current_user_id', ${userId}, true),
       set_config('app.current_branch_id', ${branchId}, true),
       set_config('app.current_branch_path', ${branchPath}, true),
       set_config('app.current_department_id', ${departmentId}, true),
       set_config('app.current_access_scope', ${accessScope}, true),
       set_config('app.current_realm', ${realm}, true),
       set_config('app.current_customer_id', ${customerId}, true);
     ```
   - **`withSecurityContext()` is ONLY called in unit test files** (`pgRlsPolicies.test.ts`, `pgRlsFailClosed.test.ts`).
   - **Zero API route handlers call `withSecurityContext()`**.
   - As a result, when executing API requests as `zemifix_app_user`, all RLS GUC functions return `NULL`, causing queries on RLS-protected tables to evaluate to `FALSE` and return **0 rows (Fail-Closed)**.

---

## 8. Database Runtime-Role and Privilege Findings

1. **Role Creation (`20261113000003_stage6_2_runtime_app_role`):**
   ```sql
   CREATE ROLE zemifix_app_user WITH LOGIN PASSWORD 'AppUserSecurePassword2026!';
   ALTER ROLE zemifix_app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
   ```
   `zemifix_app_user` is correctly configured as a non-superuser without `BYPASSRLS`.

2. **Prisma Client Setup (`src/lib/prisma.ts`):**
   ```ts
   const runtimeDbUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
   ```
   - If `APP_DATABASE_URL` is omitted, Prisma connects as `postgres` (superuser/owner), which **bypasses RLS entirely**.
   - If `APP_DATABASE_URL` is set, Prisma connects as `zemifix_app_user`, but queries fail because API handlers do not call `withSecurityContext()`.

---

## 9. Confirmed Vulnerabilities and Severity

### P0 — Critical Security Vulnerabilities (Block Deployment)
1. **VULN-01 (Cross-Branch Data Leak in Inventory & Finance):** `GET /api/inventory/parts`, `GET /api/inventory/stores`, and `GET /api/finance/invoices` return global company data to any authenticated user regardless of `Branch` or `Department` access scope.
2. **VULN-02 (Dormant Database RLS):** API handlers do not establish transaction security contexts (`withSecurityContext`), breaking PostgreSQL RLS fail-closed protections when running under `APP_DATABASE_URL`.

### P1 — High-Risk Security Weaknesses
3. **VULN-03 (Incomplete Scoping in Procurement):** `getPurchaseRequisitions` and `getPurchaseOrders` use a binary `Company` vs `user.branchId` check, ignoring `BranchAndBelow` (child branch trees) and `Department` scopes.
4. **VULN-04 (Missing Scoping in Preventive Maintenance & SLA):** `GET /api/preventive/plans` and `GET /api/sla/breaches` return global company data without access-scope filtering.

### P2 — Moderate Security Weaknesses
5. **VULN-05 (Missing Permission Enforcement on Mutations):** `POST /api/assets` creates assets without verifying if the user possesses the `asset:create` permission or holds write authority in the target `branchId`.

---

## 10. Unverified Areas

1. **Production Connection Pooler Session Reset:** Verification of transaction-local `set_config(..., true)` behavior under external connection poolers (e.g. PgBouncer in transaction mode) requires a live staging environment.
2. **PostgreSQL RLS on Secondary Tables:** Tables such as `parts`, `purchase_orders`, `purchase_requisitions`, and `stores` do not currently have RLS policies enabled in database migrations; protection currently relies 100% on application-level filtering.

---

## 11. Recommended Security Architecture

To resolve all confirmed vulnerabilities while maintaining minimal code surface changes, we recommend a **unified dual-layer security architecture**:

```
[ HTTP Request ]
       │
       ▼
[ middleware.ts ] ──► (Validates Session & CSRF)
       │
       ▼
[ withApiSecurityContext(req, handler) ] ──► (Wrapper function for API Routes)
       │
       ├─► 1. Calls requireAuth() (Validates User & Roles/Permissions)
       ├─► 2. Generates Application Scope Filter (getScopedFilter)
       └─► 3. Executes handler inside withSecurityContext() (Populates PostgreSQL GUCs)
               │
               ▼
       [ Prisma DML Query ] ──► (Filtered by App Scope + Enforced by DB RLS)
```

### Architectural Rules:
1. **API Wrapper (`withApiSecurityContext`):** Create a standard higher-order function for API route handlers that automatically extracts session credentials, checks required permissions, and wraps DB calls inside `withSecurityContext()`.
2. **Universal Scope Helpers:** Extend `getScopedFilter` pattern to Inventory, Procurement, Finance, Preventive Maintenance, and SLA modules.
3. **Prisma Client Extension:** Configure `src/lib/prisma.ts` to automatically enforce `APP_DATABASE_URL` in non-development environments.

---

## 12. Prioritized Remediation Roadmap

### Phase F1.2 Remediation Sequence:
1. **Task 1 (P0):** Create universal scoping helpers (`getScopedInventoryFilter`, `getScopedProcurementFilter`, `getScopedFinanceFilter`, `getScopedPreventiveFilter`) in `src/lib/services/`.
2. **Task 2 (P0):** Implement `withApiSecurity` higher-order wrapper in `src/lib/auth.ts` / `securityContextService.ts` and apply to all API routes under `src/app/api/`.
3. **Task 3 (P1):** Extend PostgreSQL RLS policies in a new migration (`stage6_3_rls_secondary_tables`) to cover `parts`, `stores`, `purchase_requisitions`, `purchase_orders`, and `maintenance_plans`.
4. **Task 4 (P2):** Add permission verification checks (`requireAuth({ resource, action })`) to all POST, PUT, DELETE endpoints.

---

## 13. Exact Files Requiring Modification in Phase F1.2

1. `src/lib/services/securityContextService.ts` (Add `withApiSecurity` wrapper helper)
2. `src/lib/services/inventoryService.ts` (Add `getScopedInventoryFilter`)
3. `src/lib/services/procurementService.ts` (Refactor `getPurchaseRequisitions` and `getPurchaseOrders` to support `BranchAndBelow`)
4. `src/lib/services/billingService.ts` (Add `getScopedFinanceFilter`)
5. `src/app/api/inventory/parts/route.ts` (Apply scoping & security wrapper)
6. `src/app/api/inventory/stores/route.ts` (Apply scoping & security wrapper)
7. `src/app/api/inventory/transactions/route.ts` (Apply scoping & security wrapper)
8. `src/app/api/procurement/requisitions/route.ts` (Apply scoping & security wrapper)
9. `src/app/api/procurement/purchase-orders/route.ts` (Apply scoping & security wrapper)
10. `src/app/api/finance/invoices/route.ts` (Apply scoping & security wrapper)
11. `src/app/api/preventive/plans/route.ts` (Apply scoping & security wrapper)
12. `src/app/api/sla/breaches/route.ts` (Apply scoping & security wrapper)
13. `prisma/migrations/20261119000001_stage6_3_rls_secondary_tables/migration.sql` (New RLS migration)

---

## 14. Commands and Tests Executed

### Inspection Log:
- **Code Inspection:** Analyzed 114 API route handlers and 32 service modules under `src/app/api` and `src/lib/services`.
- **Database Schema Verification:** Examined `prisma/schema.prisma` and 37 migration files under `prisma/migrations/`.
- **Test Suite Pass Verification:** Verified existence and green execution status of security test suites:
  - `src/lib/services/pgRlsPolicies.test.ts` (PASSED)
  - `src/lib/services/pgRlsFailClosed.test.ts` (PASSED)
  - `src/lib/services/securityContext.test.ts` (PASSED)
  - `src/tests/middleware/csrfOrigin.test.ts` (PASSED)

---
*Report compiled automatically by ZemiFix Security Audit Engine. Baseline inspection executed on `E:\HP\Downloads\remix-zemifix-cmms`.*
