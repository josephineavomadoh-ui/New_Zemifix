# ZEMIFIX_FINAL_APPROVED_DASHBOARD_FEATURE_SPECIFICATION

This document establishes the final architectural and implementation-verified baseline for all ten ZemiFix CMMS workspaces. It incorporates strict role boundary enforcement, separates Customer Portal from Contractor operations, details implementation evidence and verification statuses, and enforces core business rules (maker-checker, gapless invoice numbering, append-only stock ledgers, and tenant/customer isolation).

---

## 1. Feature Completeness Matrix (All 10 Workspaces)

| Workspace / Role | Overview & KPIs | Navigation & Screens | Feature Operations | Forms & Validation | Reports | Backend Integration | Permissions & RBAC | Business Rules & Audit | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Company Administrator** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **2. Finance** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **3. Cashier** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **4. Manager** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **5. Supervisor** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **6. Planner** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **7. Technician** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **8. Storekeeper** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **9. Platform Super Admin** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |
| **10. Customer & Contractor Portal** | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | COMPLETE | **COMPLETE** |

---

## 2. Role Boundaries & Architectural Isolation

### Strict Boundary Enforcement
1. **Company Administrator:** Restricted strictly to their single tenant company (`Company` scope or branch scope). Cannot access other tenants' databases, platform super-admin routes (`/api/platform/*`), or perform SaaS infrastructure provisioning.
2. **Platform Super Administrator:** Manages multi-tenant SaaS infrastructure, tenant provisioning, activation, suspension, and restoration via dedicated platform database (`zemifix_platform_dev`) and platform auth (`platformAuth.ts`). Zero tenant data overlap.
3. **Internal Contractor Employees:** Operates within the company or branch as internal maintenance staff with assigned roles (Technician, Supervisor, Planner, etc.), subject to branch and department access scopes.
4. **External Customer Portal Users:** Authenticates via isolated customer portal auth (`portalAuth.ts`) and is restricted solely to viewing and interacting with their organization's assets, service requests, quotations, and invoices.

---

## 3. Separation of Customer Portal vs. Contractor Operations

| Dimension | External Customer Portal | Internal Contractor Operations |
| :--- | :--- | :--- |
| **Authentication Realm** | `CUSTOMER` realm (`portalAuth.ts`, `zemifix_portal_session`) | `STAFF` realm (`auth.ts`, `zemifix_session`) |
| **Data Boundary** | Strictly isolated to the customer's organization ID (`customerId`), sites, and contracts | Internal company branches, departments, and cross-branch operations per access scope |
| **Primary Screens** | Public QR request intake (`/request/qr`), portal dashboard, request tracker, quote approval, invoice viewing | Full operational dashboards (Admin, Manager, Supervisor, Planner, Technician, Storekeeper, Finance, Cashier) |
| **Permissions** | `portal:read`, `request:create`, `quote:approve`, `invoice:read` | Full staff RBAC (`work_order:*`, `inventory:*`, `invoice:*`, etc.) |

---

## 4. Implementation Evidence & Verification Baseline

For every feature marked **COMPLETE**, the following implementation evidence has been verified against the codebase:

- **Company Administrator:**
  - *Source Files:* `src/components/dashboard/DashboardView.tsx`, `src/app/users/page.tsx`, `src/app/organization/page.tsx`.
  - *API Routes:* `/api/users`, `/api/organization/branches`, `/api/organization/departments`, `/api/audit`.
  - *Services:* `userService.ts`, `organizationService.ts`, `auditService.ts`.
  - *Tests:* `sidebarPermissions.test.ts`, `roleBasedRedirect.test.ts`.
- **Finance & Cashier:**
  - *Source Files:* `src/components/finance/FinanceView.tsx`, `src/components/dashboard/FinanceDashboardView.tsx`.
  - *API Routes:* `/api/finance/invoices`, `/api/finance/payments`, `/api/dashboard/finance/kpis`.
  - *Services:* `billingService.ts`, `reportService.ts`.
  - *Tests:* `financeSecurity.test.ts`, `financeReadIsolation.test.ts`.
- **Manager & Supervisor:**
  - *Source Files:* `src/components/dashboard/ManagerDashboardView.tsx`, work order management views.
  - *API Routes:* `/api/dashboard/manager-stats`, `/api/work-orders`, `/api/work-orders/[id]/assign`.
  - *Services:* `managerDashboardService.ts`, `workOrderService.ts`.
  - *Tests:* `managerDashboard.test.tsx`, `workOrderSecurityContext.test.ts`.
- **Planner:**
  - *Source Files:* `src/components/dashboard/PlannerDashboardView.tsx`, preventive maintenance views.
  - *API Routes:* `/api/dashboard/planner/kpis`, `/api/preventive/plans`.
  - *Services:* `pmRecurrence.test.ts`, `workRequestService.ts`.
  - *Tests:* `qrRequestWorkflow.test.ts`.
- **Technician & PWA:**
  - *Source Files:* `src/components/dashboard/TechnicianDashboardView.tsx`, PWA views.
  - *API Routes:* `/api/pwa/*`, `/api/sync/batch`.
  - *Services:* `syncService.ts`, `offlineSyncManager.ts`.
  - *Tests:* `offlineSyncManager.test.ts`, `db.test.ts`.
- **Storekeeper:**
  - *Source Files:* `src/components/dashboard/StorekeeperDashboardView.tsx`, inventory views.
  - *API Routes:* `/api/dashboard/storekeeper/kpis`, `/api/inventory/parts`, `/api/inventory/transactions`.
  - *Services:* `inventoryService.ts`, `procurementService.ts`.
  - *Tests:* `inventoryReadinessAudit.test.ts`.
- **Platform Super Admin:**
  - *Source Files:* `src/lib/platformAuth.ts`, `src/lib/platformBootstrap.ts`.
  - *API Routes:* `/api/platform/tenants`, `/api/platform/auth/*`.
  - *Services:* `platformAuditService.ts`.
  - *Tests:* `platformApi.test.ts`, `platformAuth.test.ts`.
- **Customer & Contractor Portal:**
  - *Source Files:* `src/app/portal/*`, `src/app/request/qr/page.tsx`.
  - *API Routes:* `/api/portal/*`, `/api/public/requests`, `/api/public/qr/resolve`.
  - *Services:* `portalService.ts`, `quoteService.ts`.
  - *Tests:* `portalService` integration tests.

---

## 5. Core Business Rules Enforcement

1. **Maker-Checker Approvals:** Enforced across procurement, work order cost overruns, and stock issues. The user who creates a record (maker) cannot approve it (checker).
2. **Gapless Invoice Numbering:** `invoiceNumber` is allocated strictly upon approval, ensuring sequential and unmanipulated statutory billing.
3. **Payment Allocation & Reconciliation:** Payments are tracked in `payments` and allocated via `payment_allocations`, updating `paidAmount` and `balanceDue`.
4. **Append-Only Stock Transactions:** `stock_transactions` is an immutable ledger; stock updates maintain WAC and require valid store balances.
5. **Branch & Department Scopes:** Enforced at the database query layer via `accessScope` (`Own`, `Department`, `Branch`, `BranchAndBelow`, `Company`).
6. **Tenant & Customer Isolation:** Isolated via PostgreSQL RLS schemas, security context transaction scoping, and realm separation (`STAFF` vs `CUSTOMER` vs `WORKER`).
7. **Authentication & OTP:** Mandatory password verification followed by 2-step OTP challenge generation and verification, with terminal logging in dev-like environments (`isDevLike()`).
8. **Audit Logging:** Tamper-evident audit logs (`audit_logs`) record all critical entity mutations with IP addresses and timestamps.
