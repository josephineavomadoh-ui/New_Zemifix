# ZemiFix CMMS — Role-Based Dashboard Feature Discovery & Specification

This specification defines the complete functional requirements, responsibilities, screens, features, actions, reports, and permissions for all 10 ZemiFix user workspaces, comparing ideal architectural design against current implementation status.

---

## Part 1 — Company Administrator Dashboard

### 1. Responsibilities & Scope
The Company Administrator holds full system-level control over the organization. Responsibilities include system configuration, user provisioning, role-based access control (RBAC), branch/department hierarchies, audit log inspection, and high-level operational overview.

### 2. Required Features & Modules
- **Company-Wide Operational Overview:** Aggregated KPIs for total assets, work order states (open, pending, overdue, completed), service requests, and PM compliance.
- **Financial & Inventory Overview:** High-level expenditure trends, stock valuation, and procurement status.
- **User Management:** Provisioning staff accounts, resetting passwords, activating/deactivating users, assigning roles and branch/department scopes.
- **RBAC & Permissions:** Managing system roles and fine-grained permissions (`RolePermission`).
- **Organization Structure:** Managing branches (Head Office, Regions, Outlets with materialized paths) and department trees.
- **System Settings & Audit Logs:** Currency, timezones, tax schemes, numbering prefixes, and tamper-evident audit trail inspection (`audit_logs`).
- **Reports & Analytics:** Full access to standard and financial reports.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** The Admin dashboard (`DashboardView.tsx`), user management (`/users`), organization settings (`/organization`), and audit modules are fully connected to real Prisma models and server-side API routes.

---

## Part 2 — Finance Dashboard

### 1. Responsibilities & Scope
Managing the financial health of the organization, accounts receivable, accounts payable, customer invoices, supplier invoices, maintenance cost allocation, statutory tax reporting (Ghana VAT, NHIL, GetFund), and budget monitoring.

### 2. Required Features & Modules
- **Accounts Receivable & Payable:** Invoices, credit notes, payments, payment allocations, and customer statements.
- **Invoice Management:** Creating, approving, issuing gapless invoice numbers, and tracking payment status (Draft, Issued, Partially Paid, Paid, Overdue, Cancelled).
- **Expense & Cost Tracking:** Aggregating maintenance labour, spare parts consumption, and contractor costs.
- **Budget Management:** Departmental/branch budget utilization tracking.
- **Tax Compliance & Reports:** Ghana statutory tax breakdown, cash flow reports, and financial exports.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented & Enhanced.**
- **Details:** The Finance dashboard (`FinanceDashboardView.tsx`) and API (`/api/dashboard/finance/kpis`) provide comprehensive metrics (Outstanding, Paid, Overdue, Total Receivable) and recent invoice summaries alongside billing and procurement modules.

---

## Part 3 — Cashier Dashboard

### 1. Responsibilities & Scope
Handling direct customer payment collections, recording remittances, looking up customer invoices, applying payments (cash, bank transfer, mobile money), generating official payment receipts, and daily cash reconciliation.

### 2. Required Features & Modules
- **Payment Collection & Recording:** Recording payments against specific customer invoices with reference numbers and payment methods.
- **Remittance Lookup:** Searching customer accounts, outstanding invoices, and unallocated payment balances.
- **Receipt Generation:** Downloading/printing official payment receipts.
- **Daily Summaries & Reconciliation:** End-of-day collection summaries and unallocated funds tracking.
- **Maker-Checker Control:** Cashiers record payments (maker), while Finance/Admin reviews or reconciles (checker).

### 3. Implementation Status & Gaps
- **Status:** **Implemented.**
- **Details:** Integrated with the `Payment` and `PaymentAllocation` models and cashier API endpoints.

---

## Part 4 — Manager Dashboard

### 1. Responsibilities & Scope
Branch or operations management overseeing work orders, service requests, departmental performance, technician productivity, asset availability, maintenance expenditure, and SLA compliance.

### 2. Required Features & Modules
- **Operational Performance Overview:** Work order throughput, backlog, and SLA breach tracking.
- **Asset Availability & Downtime:** Tracking asset reliability, MTBF/MTTR metrics, and downtime incidents.
- **Cost & Budget Monitoring:** Overseeing branch maintenance expenditure and approval limits.
- **Escalations & Approvals:** Reviewing high-value purchase requisitions, work order overruns, and stock issues (maker-checker).

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** The Manager dashboard (`ManagerDashboardView.tsx`) and API (`/api/dashboard/manager-stats`) aggregate branch and department metrics in real time.

---

## Part 5 — Supervisor Dashboard

### 1. Responsibilities & Scope
Direct supervision of field and workshop technicians, work order assignment, prioritization, emergency dispatch, job progress monitoring, and completed work verification.

### 2. Required Features & Modules
- **Team & Technician Availability:** Tracking active technicians and daily workload distribution.
- **Work Order Assignment & Reassignment:** Dispatching jobs, setting priorities, and handling emergency work orders.
- **Job Progress & Verification:** Reviewing technician notes, hours logged, parts consumed, and verifying completed work before closure.
- **Material Requests:** Reviewing and approving technician parts requests.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** Integrated with work order assignment and verification workflows.

---

## Part 6 — Planner Dashboard

### 1. Responsibilities & Scope
Maintenance planning, preventive maintenance (PM) scheduling, recurring maintenance templates, automatic work-order generation, backlog management, and resource forecasting.

### 2. Required Features & Modules
- **Maintenance Calendar & Schedules:** Calendar views and PM plan configurations (meter-based or time-based recurrence).
- **Automatic Work Order Generation:** Background job and scheduled workers generating work orders from PM templates.
- **Backlog & Resource Planning:** Tracking unassigned jobs, due-soon tasks (7 days), and labor scheduling.
- **Job Plans & Task Templates:** Standardized operating procedures (SOPs) and task checklists for recurring maintenance.

### 4. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** Planner dashboard (`PlannerDashboardView.tsx`) and API (`/api/dashboard/planner/kpis`) track backlog, unassigned, overdue, and due-soon maintenance items.

---

## Part 7 — Technician Dashboard

### 1. Responsibilities & Scope
Execution of assigned work orders in the field or workshop, recording labor time, consuming spare parts, logging asset readings, uploading photos, and working offline via PWA.

### 2. Required Features & Modules
- **My Assigned Work Orders:** Filterable list of active jobs assigned to the technician.
- **Execution Toolkit:** Work checklists, safety instructions, asset history, labor time logging, parts consumption, and asset meter readings.
- **Attachments & Notes:** Uploading photos/documents and adding diagnostic notes.
- **Offline PWA Support:** Local IndexedDB storage, offline synchronization manager (`offlineSyncManager.ts`), and conflict-free sync with server validation.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented & Verified.**
- **Details:** Powered by `TechnicianDashboardView.tsx` and the robust PWA offline architecture.

---

## Part 8 — Storekeeper Dashboard

### 1. Responsibilities & Scope
Managing parts inventory, warehouse/store locations, stock receipts (GRN), stock issues to work orders, stock transfers, physical counts, and append-only stock transaction ledgers.

### 2. Required Features & Modules
- **Inventory Overview & Valuation:** Tracking total active parts, low-stock alerts, out-of-stock items, and total stock valuation (`totalValue`).
- **Stock Movements:** Stock receipts, issues, adjustments, returns, and transfers between stores.
- **Reorder Management:** Monitoring reorder levels (`reorderLevel`) to prevent stockouts.
- **Append-Only Ledger:** Immutable stock transactions (`stock_transactions`) tracking every inventory event.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented & Enhanced.**
- **Details:** Storekeeper dashboard (`StorekeeperDashboardView.tsx`) and API (`/api/dashboard/storekeeper/kpis`) now compute total parts, low-stock items, out-of-stock count, and stock valuation accurately.

---

## Part 9 — Platform Super Administrator

### 1. Responsibilities & Scope
Managing multi-tenant SaaS infrastructure, tenant provisioning, subscription lifecycle, platform security events, and global monitoring across all tenants.

### 2. Required Features & Modules
- **Tenant Provisioning & Lifecycle:** Registering, provisioning, activating, suspending, and restoring tenants.
- **Platform Health & Monitoring:** System-wide metrics, provisioning failure tracking, and audit logs.
- **Strict Isolation:** Completely separate platform database (`zemifix_platform_dev`) and platform auth (`platformAuth.ts`).

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** Platform API routes (`/api/platform/*`) and bootstrap services (`platformBootstrap.ts`) provide complete SaaS platform administration.

---

## Part 10 — Customer / Contractor Portal

### 1. Responsibilities & Scope
Self-service portal for external customers and contracted service providers to submit maintenance requests, view quotation approvals, track active work orders, and review billing statements.

### 2. Required Features & Modules
- **Service Request Intake:** Submitting and tracking maintenance requests and scanning public QR codes.
- **Quotations & Approvals:** Reviewing and approving contractor quotes.
- **Invoices & Payments:** Viewing invoices and payment history.
- **Portal Isolation:** Dedicated customer/contractor authentication (`portalAuth.ts`) and scoped data access.

### 3. Implementation Status & Gaps
- **Status:** **Fully Implemented.**
- **Details:** Complete portal routing (`/portal/*`) and API support.
