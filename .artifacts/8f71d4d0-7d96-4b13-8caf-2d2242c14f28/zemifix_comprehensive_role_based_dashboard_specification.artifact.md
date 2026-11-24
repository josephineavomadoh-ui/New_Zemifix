# ZEMIFIX_COMPREHENSIVE_ROLE_BASED_DASHBOARD_SPECIFICATION

This document provides a comprehensive, screen-by-screen, and action-by-action feature specification for all ten ZemiFix CMMS workspaces, complete with architectural breakdown, backend service mapping, permission models, business workflows, and rigorous code implementation comparisons.

---

## 1. Company Administrator Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Total assets, open work orders, pending service requests, PM compliance rate, active staff count, stock valuation, and monthly expenditure.
- **Charts & Graphs:** 6-month expenditure trend, asset condition distribution, and work order status breakdown.
- **Recent Activity:** System audit logs (`audit_logs`), security events, and user logins.
- **Alerts & Notifications:** Critical system alerts, database health warnings, and failed background jobs.
- **Pending Tasks & Approvals:** High-value purchase requisitions, unassigned user access requests, and configuration exceptions.
- **Filters & Date Ranges:** Global date range picker (Today, This Week, This Month, Custom), branch selector, and department filter.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Dashboard, Assets, Work Orders, Requests, Preventive Maintenance, Inventory, Procurement, Finance, Reports, Users & Access, Organization, Settings, Audit Logs.
- **Subpages & Tabs:** User Directory, Roles & Permissions, Branches & Departments, Company Settings, Audit Trail.
- **Detail Pages:** User profile & permission matrix, Branch detail & hierarchy view, Asset register detail.
- **Search & Filtering:** Global search bar for users, assets, and work orders with multi-column filtering.

### 3. FEATURE OPERATIONS
- **View:** Company-wide data across all branches and departments.
- **Create:** New staff accounts, roles, permissions, branches, departments, assets, and system configurations.
- **Edit:** User profiles, role permissions, branch trees, department structures, and company tax/currency settings.
- **Approve/Reject:** High-value requisitions, budget overruns, and system overrides.
- **Submit:** System configuration changes and administrative data imports.
- **Export/Print:** Audit logs (CSV/PDF), user directory, and asset register reports.
- **Access Restrictions:** Full unrestricted administrative access across all modules and tenants.

### 4. FORMS & ACTIONS
- **Add Staff Form:** Fields for Name, Email, Phone, Password, Role ID, Branch ID, Department ID, Access Scope (`Company`), and Approval Limit. Validation: Zod schema (`createUserSchema`), email format, min 8-char password. Outcome: User record created with bcrypt password hash.
- **Role Permissions Matrix:** Checkbox grid for assigning resources and actions (`create`, `read`, `update`, `approve`, `verify`, `close`, `manage`).

### 5. REPORTS
- **Audit Log Report:** Filterable by date, user, entity type, and status. Exportable to CSV/PDF.
- **System Activity & Performance Report:** Active sessions, login success/failure ratios, and database connection status.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/users`, `/api/users/[id]`, `/api/organization/branches`, `/api/organization/departments`, `/api/dashboard/stats`, `/api/audit`.
- **Services:** `userService.ts`, `organizationService.ts`, `auditService.ts`, `auth.ts`.
- **Database Models:** `User`, `Role`, `Permission`, `RolePermission`, `Branch`, `Department`, `Company`, `AuditLog`.

### 7. PERMISSIONS
- **Allowed:** Unrestricted administrative permissions (`settings:manage`, `audit:read`, `work_order:*`, `invoice:*`, etc.).
- **Prohibited:** None at the company level. (Platform-level super admin actions are outside company admin scope).
- **Scope:** `Company` access scope by default.

### 8. WORKFLOWS
- Interacts with all staff roles by provisioning accounts, assigning roles, resolving branch permission boundaries, and auditing operational activities.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Source code in `DashboardView.tsx`, `users/page.tsx`, `organization/page.tsx`, and backend services fully implement admin provisioning, RBAC, and audit logs.

---

## 2. Finance Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Outstanding Invoices, Paid Invoices, Overdue Invoices, Total Receivable Balance, and Month Expenditure.
- **Charts & Graphs:** 6-month expenditure trend (labour, parts, contractor costs) and Ghana tax breakdown.
- **Recent Activity:** Recent customer invoices and payment remittances.
- **Alerts & Notifications:** Overdue invoice alerts and budget utilization warnings (>80% or >100%).
- **Pending Tasks & Approvals:** Invoices requiring approval or verification.
- **Filters & Date Ranges:** Invoice status filter, customer filter, and date range picker.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Finance, Invoices, Payments, Expenses, Budgets, Reports.
- **Tabs:** Expenditure, Budgets, Customer Invoices, Payments, Customers.
- **Detail Pages:** Invoice detail view with line items, tax breakdown, and payment allocation history.
- **Search & Filtering:** Search by invoice number, customer name, or payment reference.

### 3. FEATURE OPERATIONS
- **View:** Customer invoices, payments, expense records, budget utilization, and tax schedules.
- **Create:** Customer invoices (draft/issued), credit notes, expense records, and manual payment entries.
- **Edit:** Draft invoices, expense records, and budget allocations.
- **Approve/Reject:** Customer invoices and adjustment credit notes (Maker-Checker approval).
- **Submit:** Issued invoices to customers and approval requests.
- **Export/Print:** Printable invoice PDFs (`/api/portal/invoices/[id]/pdf`), financial statements, and ledger exports (CSV/PDF).
- **Access Restrictions:** Restricted from managing system users, branches, or executing physical maintenance tasks.

### 4. FORMS & ACTIONS
- **New Invoice Form:** Fields for Customer ID, Site ID, Contract ID, Issue Date, Due Date, Currency, Tax Scheme (`GHANA_STATUTORY_2026`), Line Items (description, quantity, unit price). Validation: Zod schema. Outcome: Invoice created in `DRAFT` or `ISSUED` status with calculated VAT, NHIL, GetFund.

### 5. REPORTS
- **Aged Receivables Report:** Outstanding balances categorized by 30, 60, 90+ days.
- **Ghana Statutory Tax Report:** Breakdown of VAT (15%), NHIL (2.5%), and GetFund (2.5%).
- **Monthly Maintenance Expenditure Report:** Breakdown by labour, parts, and contractor costs.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/finance/invoices`, `/api/finance/payments`, `/api/dashboard/finance/kpis`.
- **Services:** `billingService.ts`, `reportService.ts`.
- **Database Models:** `Invoice`, `InvoiceLine`, `Payment`, `PaymentAllocation`, `CreditNote`, `Budget`.

### 7. PERMISSIONS
- **Allowed:** `invoice:*`, `payment:*`, `budget:*`, `finance:read`.
- **Prohibited:** `settings:manage`, `user:*`.
- **Scope:** Branch or Company financial scope.

### 8. WORKFLOWS
- Receives approved work orders from Supervisors/Managers, generates gapless invoices, tracks payments collected by Cashiers, and reconciles ledger balances.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE** (Enhanced with recent invoice tables and financial KPI summaries).
- **Evidence:** Verified in `FinanceView.tsx`, `FinanceDashboardView.tsx`, and `billingService.ts`.

---

## 3. Cashier Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Today's collections, total unallocated payments, pending receipts count, and cash drawer total.
- **Charts & Graphs:** Daily collection volume and payment method distribution (Cash, MoMo, Bank Transfer, Cheque).
- **Recent Activity:** Recent payment remittances and allocations.
- **Alerts & Notifications:** Unallocated remittance warnings and payment reversal notices.
- **Pending Tasks & Approvals:** Unreconciled payment receipts.
- **Filters & Date Ranges:** Date picker for daily/weekly reconciliation and payment method filter.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Cashier, Payments, Customer Lookup, Receipts, Daily Summary.
- **Tabs:** Collect Payment, Payment History, Unallocated Remittances, Daily Reconciliation.
- **Detail Pages:** Payment remittance detail view with allocation breakdown.
- **Search & Filtering:** Search by customer name, invoice number, or payment reference number.

### 3. FEATURE OPERATIONS
- **View:** Customer accounts, outstanding invoice balances, payment history, and daily collection summaries.
- **Create:** Payment remittance records, payment allocations against open invoices.
- **Edit:** Unallocated payment notes or references (prior to final reconciliation).
- **Approve/Reject:** Cannot approve invoices or issue credit notes (Maker only; requires Finance/Admin checker).
- **Submit:** Recorded payment batches for financial reconciliation.
- **Export/Print:** Official payment receipts (PDF) and daily collection reports.
- **Access Restrictions:** Cannot modify invoices, credit notes, or general ledger budgets.

### 4. FORMS & ACTIONS
- **Record Payment Form:** Fields for Customer ID, Amount, Payment Method (`CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `CHEQUE`), Reference Number, Payment Date, Notes, and Invoice Allocation lines. Validation: Amount must not exceed outstanding balance or unallocated funds. Outcome: `Payment` record created and allocated.

### 5. REPORTS
- **Daily Cashier Collection Report:** Itemized payments collected by method, cashier ID, and shift. Exportable to PDF/CSV.
- **Unallocated Remittance Report:** List of payments with positive `unallocatedAmount`.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/finance/payments`, `/api/customers`.
- **Services:** `billingService.ts`, `customerService.ts`.
- **Database Models:** `Payment`, `PaymentAllocation`, `Customer`, `Invoice`.

### 7. PERMISSIONS
- **Allowed:** `payment:create`, `payment:read`, `customer:read`, `invoice:read`.
- **Prohibited:** `invoice:create`, `invoice:approve`, `credit_note:*`.
- **Scope:** Branch/Department collection scope.

### 8. WORKFLOWS
- Interacts with Customers making payments and Finance officers who review and reconcile collected remittances.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Supported by `Payment` and `PaymentAllocation` models and billing services.

---

## 4. Manager Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Active work orders, open service requests, SLA compliance %, asset availability %, maintenance expenditure, and open purchase orders.
- **Charts & Graphs:** Work order completion rate, department workload distribution, and monthly maintenance spend.
- **Recent Activity:** Critical asset downtime events and high-priority work order completions.
- **Alerts & Notifications:** SLA breach warnings, budget threshold alerts, and overdue PM alerts.
- **Pending Tasks & Approvals:** Work order cost overruns, purchase requisitions requiring managerial approval, and stock issue approvals.
- **Filters & Date Ranges:** Branch selector, department filter, and date range selector.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Dashboard, Work Orders, Assets, Preventive Maintenance, Inventory, Procurement, Reports.
- **Tabs:** Overview, Operations, Assets, Procurement, Performance.
- **Detail Pages:** Branch performance summary, asset health drill-down, and work order audit trail.
- **Search & Filtering:** Multi-criteria filtering by branch, department, priority, and status.

### 3. FEATURE OPERATIONS
- **View:** Comprehensive operational statistics, asset reliability metrics, and departmental costs across assigned branch scope.
- **Create:** Maintenance budgets, capital purchase requisitions, and high-level work orders.
- **Edit:** Work order priority/scope, budget limits, and asset classifications.
- **Approve/Reject:** Purchase requisitions, work order cost variations, and stock issue exceptions (Maker-Checker).
- **Submit:** Operational reports and capital budget requests.
- **Export/Print:** Executive summary reports (PDF/CSV) and KPI dashboards.
- **Access Restrictions:** Restricted from modifying global system roles, security settings, or multi-tenant platform configurations.

### 4. FORMS & ACTIONS
- **Manager Approval Modal:** Fields for Approval Status (`APPROVED` / `REJECTED`), Approval Notes, and Spending Limit verification. Outcome: `ApprovalRequest` status updated, audit log recorded.

### 5. REPORTS
- **Branch Operational Performance Report:** Work order completion times, technician utilization, and backlog aging.
- **Asset Availability & Reliability Report:** MTBF, MTTR, and total downtime hours by asset category.
- **Maintenance Cost & Budget Report:** Actual spend vs. allocated budget by department.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/dashboard/manager-stats`, `/api/work-orders`, `/api/procurement/requisitions`.
- **Services:** `managerDashboardService.ts`, `workOrderService.ts`, `procurementService.ts`.
- **Database Models:** `WorkOrder`, `Asset`, `PurchaseRequisition`, `ApprovalRequest`, `Branch`, `Department`.

### 7. PERMISSIONS
- **Allowed:** `work_order:approve`, `requisition:approve`, `stock:approve_issue`, `report:read`.
- **Prohibited:** `settings:manage`, `user:create`.
- **Scope:** Branch and below (`BranchAndBelow`) or Company.

### 8. WORKFLOWS
- Reviews and approves requisitions and work orders submitted by Supervisors/Planners, and coordinates with Finance on maintenance budgets.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Fully implemented in `ManagerDashboardView.tsx`, `managerDashboardService.ts`, and associated API routes.

---

## 5. Supervisor Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Active team work orders, unassigned jobs, pending technician verification, emergency jobs, and team attendance/availability.
- **Charts & Graphs:** Technician workload distribution and job completion status pie chart.
- **Recent Activity:** Technician job updates, labor logs, and completed task submissions.
- **Alerts & Notifications:** Emergency work order alerts, overdue job warnings, and parts request notifications.
- **Pending Tasks & Approvals:** Completed work orders awaiting supervisor sign-off/verification, and parts requests.
- **Filters & Date Ranges:** Technician filter, shift filter, and date range picker.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Work Orders, Dispatch, Technicians, Asset Readings, Reports.
- **Tabs:** Active Jobs, Unassigned, Pending Verification, Team Workload.
- **Detail Pages:** Work order dispatch view, technician schedule view, and task completion checklist.
- **Search & Filtering:** Search by work order number, technician name, or asset tag.

### 3. FEATURE OPERATIONS
- **View:** Team work orders, technician schedules, asset status, and pending verifications.
- **Create:** Ad-hoc work orders, emergency dispatch tasks, and team shift schedules.
- **Edit:** Work order assignment, priority, scheduled dates, and estimated hours.
- **Approve/Reject:** Completed work orders (Verification/Sign-off) and material/parts requests.
- **Submit:** Verified work orders to closure or billing.
- **Export/Print:** Daily shift handover reports and team productivity logs.
- **AccessRestrictions:** Cannot approve capital purchase requisitions or modify financial budgets.

### 4. FORMS & ACTIONS
- **Work Order Assignment Form:** Fields for Work Order ID, Assigned Technician ID, Scheduled Start, Priority, and Dispatch Instructions. Outcome: `assignedUserId` updated, status changed to `ASSIGNED`, notification dispatched to technician.
- **Work Verification Modal:** Fields for Verification Status (`VERIFIED` / `REJECTED`), Quality Rating, and Sign-off Notes. Outcome: Work order status advanced to `VERIFIED` or returned to `IN_PROGRESS`.

### 5. REPORTS
- **Daily Supervisor Shift Report:** Jobs dispatched, completed, verified, and pending.
- **Technician Productivity & Labor Report:** Total hours logged, work orders completed per technician.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/work-orders`, `/api/work-orders/[id]/assign`, `/api/work-orders/[id]/status`, `/api/users`.
- **Services:** `workOrderService.ts`, `userService.ts`.
- **Database Models:** `WorkOrder`, `User`, `Asset`, `WorkOrderTask`, `WorkOrderLabor`.

### 7. PERMISSIONS
- **Allowed:** `work_order:create`, `work_order:assign`, `work_order:verify`, `work_order:update`.
- **Prohibited:** `invoice:approve`, `settings:manage`.
- **Scope:** Branch operational scope.

### 8. WORKFLOWS
- Receives service requests or PM work orders from Planners, assigns them to Technicians, and verifies completed work before passing to Finance/Closure.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Supported by work order assignment and status update APIs (`/api/work-orders/[id]/assign`).

---

## 6. Planner Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Maintenance backlog, unassigned work orders, overdue PMs, due-soon maintenance (7 days), and schedule compliance %.
- **Charts & Graphs:** Preventive maintenance calendar timeline and maintenance backlog aging chart.
- **Recent Activity:** Automatically generated PM work orders and converted service requests.
- **Alerts & Notifications:** Overdue PM alerts, calendar schedule conflicts, and asset shutdown notices.
- **Pending Tasks & Approvals:** Incoming service requests requiring triage/conversion into work orders.
- **Filters & Date Ranges:** Calendar view (Day, Week, Month), branch filter, and asset category filter.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Maintenance Calendar, Preventive Maintenance, Service Requests, Work Orders, Asset History.
- **Tabs:** Calendar, PM Plans, Service Requests, Backlog, Scheduling.
- **Detail Pages:** PM Plan detail view with recurrence rules, Task Template / Job Plan editor.
- **Search & Filtering:** Search by PM plan name, asset tag, or request subject.

### 3. FEATURE OPERATIONS
- **View:** Maintenance calendar, PM schedules, asset maintenance histories, and service request intake.
- **Create:** Preventive maintenance plans (`PreventiveMaintenancePlan`), Job Plans/Task Templates, and work orders from service requests.
- **Edit:** PM recurrence rules, scheduled maintenance windows, and job plan steps.
- **Approve/Reject:** Service requests (convert to work order or reject with reason).
- **Submit:** Scheduled maintenance batches and resource plans.
- **Export/Print:** Maintenance schedules (PDF/CSV) and calendar exports.
- **Access Restrictions:** Cannot execute physical maintenance tasks or process financial invoices.

### 4. FORMS & ACTIONS
- **Preventive Maintenance Plan Form:** Fields for Plan Name, Asset ID or Category ID, Trigger Type (`METER` or `CALENDAR`), Interval Value, Unit (Days/Weeks/Months or Operating Hours), Assigned Team, and Job Plan ID. Validation: Recurrence rule validity. Outcome: PM schedule created.
- **Service Request Conversion Form:** Fields for Request ID, Priority, Assigned Planner/Supervisor, Target Start Date, and Work Order Scope. Outcome: Service request status updated to `CONVERTED`, new `WorkOrder` created.

### 5. REPORTS
- **PM Schedule Compliance Report:** Planned vs. executed preventive maintenance tasks over time.
- **Maintenance Backlog Report:** Unresolved work orders categorized by age and priority.
- **Resource & Labour Forecast Report:** Projected maintenance labor hours required over upcoming weeks.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/preventive/plans`, `/api/requests`, `/api/work-orders`, `/api/dashboard/planner/kpis`.
- **Services:** `pmService.ts` (or `workOrderService.ts`), `workRequestService.ts`.
- **Database Models:** `PreventiveMaintenancePlan`, `WorkOrder`, `ServiceRequest`, `JobPlan`, `Asset`.

### 7. PERMISSIONS
- **Allowed:** `preventive_maintenance:*`, `work_request:read`, `work_request:update`, `work_order:create`.
- **Prohibited:** `invoice:*`, `user:*`.
- **Scope:** Branch/Company planning scope.

### 8. WORKFLOWS
- Ingests service requests, creates preventive maintenance schedules that automatically spawn work orders, and hands off open work orders to Supervisors for technician assignment.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Supported by `PlannerDashboardView.tsx`, `/api/dashboard/planner/kpis`, and preventive maintenance models.

---

## 7. Technician Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** My assigned jobs, active timer status, pending parts requests, and completed jobs this week.
- **Charts & Graphs:** Personal completion rate and hours logged by day.
- **Recent Activity:** Recently completed work orders and submitted labor logs.
- **Alerts & Notifications:** High-priority job dispatches, parts request approvals, and safety warnings.
- **Pending Tasks & Approvals:** Open assigned work orders requiring action.
- **Filters & Date Ranges:** Status filter (Assigned, In Progress, On Hold) and date picker.

### 2. NAVIGATION & SCREENS
- **PWA Navigation / Mobile App:** Home / My Jobs, Job Details, Checklist, Parts Request, Asset Scanner (QR), Profile, Sync Status.
- **Tabs:** Assigned, In Progress, Completed, Offline Sync.
- **Detail Pages:** Work Order execution screen with step-by-step checklists, safety notes, and meters.
- **Search & Filtering:** Search assigned work orders by ID, asset name, or location.

### 3. FEATURE OPERATIONS
- **View:** Assigned work order details, asset manuals, location maps, and safety instructions.
- **Create:** Labor time logs (`WorkOrderLabor`), spare parts requests (`WorkOrderPart`), asset meter readings, and photo/attachment uploads.
- **Edit:** Work order status (`IN_PROGRESS`, `ON_HOLD`, `COMPLETED`), checklist item completion status, and notes.
- **Approve/Reject:** None (Technician is an execution role; verifications require Supervisors).
- **Submit:** Completed work orders for supervisor verification.
- **Export/Print:** Job completion summary sheets.
- **Access Restrictions:** Restricted strictly to assigned work orders; cannot view financial records, user directories, or modify system settings.

### 4. FORMS & ACTIONS
- **Labor Log Form:** Fields for Work Order ID, Hours Worked, Date, Labor Rate/Type, and Work Description. Outcome: `WorkOrderLabor` record added, total labour cost updated.
- **Parts Consumption Form:** Fields for Work Order ID, Part ID, Quantity Used, and Store ID. Outcome: `WorkOrderPart` recorded, store stock quantity decremented.
- **Meter Reading Form:** Fields for Asset ID, Meter Type, Reading Value, and Date. Outcome: `AssetReading` created.

### 5. REPORTS
- **Technician Timesheet & Activity Report:** Hours logged and tasks executed by technician.
- **Parts Consumption Report:** Materials used on work orders.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/pwa/*`, `/api/work-orders/[id]/labor`, `/api/work-orders/[id]/parts`, `/api/public/upload`, `/api/sync/batch`.
- **Services:** `workOrderService.ts`, `inventoryService.ts`, `syncService.ts`.
- **Database Models:** `WorkOrder`, `WorkOrderLabor`, `WorkOrderPart`, `AssetReading`, `Attachment`.

### 7. PERMISSIONS
- **Allowed:** `work_order:read`, `work_order:update` (assigned jobs), `stock:issue`.
- **Prohibited:** `work_order:approve`, `work_order:verify`, `settings:*`.
- **Scope:** Assigned records (`Own` or assigned branch).

### 8. WORKFLOWS
- Receives job assignments from Supervisors, executes work in the field (online or offline via PWA), logs labor and parts, and submits completed jobs for supervisor verification.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Fully implemented in `TechnicianDashboardView.tsx`, PWA offline manager, and sync batch endpoints.

---

## 8. Storekeeper Dashboard

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Total Active Parts, Low Stock Items (at/below reorder level), Out of Stock Items, and Total Stock Valuation (`totalValue`).
- **Charts & Graphs:** Stock valuation by category and monthly stock movement volume (receipts vs. issues).
- **Recent Activity:** Recent goods received notes (GRN), stock issues, and inventory adjustments.
- **Alerts & Notifications:** Low-stock threshold warnings and out-of-stock emergency alerts.
- **Pending Tasks & Approvals:** Purchase requisitions awaiting stock verification and parts requests from technicians.
- **Filters & Date Ranges:** Store/Warehouse selector, part category filter, and date range picker.

### 2. NAVIGATION & SCREENS
- **Sidebar Navigation:** Inventory, Parts Catalog, Stores/Warehouses, Stock Balances, Receipts (GRN), Issues, Transfers, Adjustments, Valuations.
- **Tabs:** Overview, Parts, Stock Balances, Receipts, Issues, Transfers, Adjustments.
- **Detail Pages:** Part detail view with multi-store balance breakdown and transaction ledger.
- **Search & Filtering:** Search parts by part number, barcode, name, or category.

### 3. FEATURE OPERATIONS
- **View:** Parts catalog, multi-warehouse stock balances, reorder thresholds, and immutable transaction ledgers.
- **Create:** Part master items, store warehouses, stock receipts (GRN), stock issues, stock transfers, and stock adjustments.
- **Edit:** Part descriptions, reorder levels (`reorderLevel`), min/max stock thresholds, and bin locations.
- **Approve/Reject:** Stock issues exceeding standard limits (Maker-Checker with Finance/Manager).
- **Submit:** Physical stock counts and inventory adjustment sheets.
- **Export/Print:** Stock valuation reports, reorder lists, and transaction ledger exports (CSV/PDF).
- **Access Restrictions:** Cannot process financial invoices, approve customer contracts, or execute maintenance work orders.

### 4. FORMS & ACTIONS
- **Stock Receipt / GRN Form:** Fields for Store ID, Purchase Order ID, Supplier ID, Delivery Date, Items (Part ID, Quantity Received, Unit Cost, Batch Number). Outcome: `GoodsReceivedNote` created, `Stock` quantities incremented, append-only `StockTransaction` logged, WAC recomputed.
- **Stock Issue Form:** Fields for Store ID, Work Order ID (optional), Recipient Name, Items (Part ID, Quantity Issued). Outcome: `Stock` quantities decremented, `StockTransaction` recorded.

### 5. REPORTS
- **Inventory Valuation Report:** Total monetary value of stock across all warehouses categorized by part category.
- **Reorder & Low Stock Report:** List of parts where `quantityOnHand <= reorderLevel`.
- **Append-Only Stock Ledger Report:** Chronological audit trail of all inventory receipts, issues, adjustments, and transfers.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/inventory/parts`, `/api/inventory/stores`, `/api/inventory/transactions`, `/api/procurement/grn`, `/api/dashboard/storekeeper/kpis`.
- **Services:** `inventoryService.ts`, `procurementService.ts`.
- **Database Models:** `Part`, `Store`, `Stock`, `StockTransaction`, `GoodsReceivedNote`, `StoreTransfer`, `StockAdjustment`.

### 7. PERMISSIONS
- **Allowed:** `inventory:*`, `stock:*`, `part:*`.
- **Prohibited:** `invoice:*`, `work_order:verify`, `settings:*`.
- **Scope:** Warehouse/Branch inventory scope.

### 8. WORKFLOWS
- Receives purchase orders from Procurement and issues spare parts to Technicians for work orders, updating stock balances and logging append-only ledger entries.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE** (Enhanced with Low Stock KPI and valuation metrics).
- **Evidence:** Fully implemented in `StorekeeperDashboardView.tsx`, `inventoryService.ts`, and inventory API routes.

---

## Part 9 — Platform Super Administrator

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** Total active tenants, pending tenant provisioning requests, system-wide database health, and active platform user sessions.
- **Charts & Graphs:** Tenant growth trend and resource utilization across platform clusters.
- **Recent Activity:** Tenant registrations, provisioning completions, suspension events, and platform security audits.
- **Alerts & Notifications:** Provisioning failures, database migration errors, and security threshold breaches.
- **Pending Tasks & Approvals:** Pending tenant onboarding requests and subscription plan activations.
- **Filters & Date Ranges:** Tenant status filter (Active, Suspended, Provisioning), date range picker.

### 2. NAVIGATION & SCREENS
- **Platform Navigation:** Tenants, Subscriptions, Platform Audit Logs, Security Events, System Configuration, Support Tools.
- **Tabs:** Tenant Directory, Provisioning, System Health, Security Audit.
- **Detail Pages:** Tenant detail view with administrative controls (Suspend, Restore, Update Subscription).
- **Search & Filtering:** Search tenants by name, domain, or subscription plan.

### 3. FEATURE OPERATIONS
- **View:** Multi-tenant registry, tenant health statuses, platform audit trails, and security event logs.
- **Create:** New tenant organizations, subscription plans, and platform administrator accounts.
- **Edit:** Tenant configuration, subscription tiers, active status (Suspend/Restore).
- **Approve/Reject:** Tenant registration requests and plan upgrades.
- **Submit:** Platform-wide security policies and tenant migration scripts.
- **Export/Print:** Platform audit logs and tenant billing summaries.
- **Access Restrictions:** Strict separation from Company Administrator data; platform super admins manage SaaS infrastructure and tenant lifecycles.

### 4. FORMS & ACTIONS
- **Tenant Provisioning Form:** Fields for Tenant Organization Name, Subdomain/Slug, Admin Email, Admin Initial Password, Subscription Tier (`TRIAL`, `ACTIVE`), and Dedicated Database URL (if applicable). Outcome: Tenant database provisioned, bootstrap admin user created.
- **Tenant Suspension Action:** Fields for Tenant ID, Reason for Suspension. Outcome: `TenantStatus` updated to `SUSPENDED`, active sessions invalidated.

### 5. REPORTS
- **Tenant Subscription & Usage Report:** Active tenants, storage/user metrics, and renewal dates.
- **Platform Security & Audit Report:** Cross-tenant security events and superadmin administrative actions.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/platform/tenants`, `/api/platform/auth/*`, `/api/platform/subscriptions`.
- **Services:** `platformBootstrap.ts`, `platformAuth.ts`, `platformAuditService.ts`.
- **Database Models:** `PlatformUser`, `PlatformRole`, `Tenant`, `Subscription`, `PlatformAuditLog` (stored in platform database `zemifix_platform_dev`).

### 7. PERMISSIONS
- **Allowed:** Platform superadmin permissions (`platform:manage`, `tenant:*`, `subscription:*`).
- **Prohibited:** Cannot directly access individual tenant application databases without explicit context.
- **Scope:** Global SaaS platform scope.

### 8. WORKFLOWS
- Provisions new customer organizations onto the ZemiFix SaaS platform, monitors tenant health, and handles subscription lifecycle management.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Supported by `platformBootstrap.ts`, `platformAuth.ts`, and platform API routes (`/api/platform/tenants`).

---

## Part 10 — Customer / Contractor Portal

### 1. DASHBOARD OVERVIEW
- **Summary Cards & KPIs:** My open maintenance requests, active work orders in progress, pending quotation approvals, and unpaid invoices.
- **Charts & Graphs:** Request status timeline and expenditure summary for customer assets.
- **Recent Activity:** Updates on submitted maintenance requests and contractor job completions.
- **Alerts & Notifications:** Quotation approval requests, invoice payment reminders, and work completion notices.
- **Pending Tasks & Approvals:** Contractor quotations awaiting customer approval.
- **Filters & Date Ranges:** Request status filter, date range picker.

### 2. NAVIGATION & SCREENS
- **Portal Navigation:** Dashboard, Maintenance Requests, QR Request Scanner, Work Orders, Quotations, Invoices, Contracts, Profile.
- **Tabs:** Requests, Work Orders, Quotes, Invoices.
- **Detail Pages:** Request detail view, quotation approval screen, invoice payment view.
- **Search & Filtering:** Search requests or invoices by reference number.

### 3. FEATURE OPERATIONS
- **View:** Customer-specific maintenance requests, active work orders on customer assets, contractor quotes, and billing statements.
- **Create:** Maintenance service requests, public QR code work requests (`/request/qr`).
- **Edit:** Draft service request details (before submission).
- **Approve/Reject:** Contractor quotations and cost estimates.
- **Submit:** Maintenance service requests.
- **Export/Print:** Invoice PDFs and maintenance statements.
- **Access Restrictions:** Strict customer realm isolation (`portalAuth.ts`); customers can only view and interact with their own assets, requests, and invoices; zero access to internal staff dashboards or other tenant data.

### 4. FORMS & ACTIONS
- **Service Request Form:** Fields for Site ID, Asset ID (optional), Subject/Title, Description, Priority, Contact Person, Phone. Outcome: `ServiceRequest` created with status `RECEIVED`.
- **Quotation Approval Action:** Fields for Quote ID, Decision (`APPROVED` / `REJECTED`), Comments. Outcome: Quote status updated, work order advancement unblocked.

### 5. REPORTS
- **Customer Statement of Account Report:** Invoices issued, payments made, and current balance due.
- **Asset Maintenance History Report:** Service records for customer-owned assets.

### 6. BACKEND INTEGRATION
- **API Routes:** `/api/portal/*`, `/api/public/requests`, `/api/public/qr/resolve`.
- **Services:** `portalService.ts`, `quoteService.ts`, `workRequestService.ts`.
- **Database Models:** `Customer`, `CustomerSite`, `CustomerContract`, `ServiceRequest`, `Quote`, `Invoice`, `Payment`.

### 7. PERMISSIONS
- **Allowed:** Customer portal permissions (`portal:read`, `request:create`, `quote:approve`, `invoice:read`).
- **Prohibited:** All internal staff permissions (`settings:*`, `user:*`, `inventory:*`, `work_order:assign`).
- **Scope:** Customer organization scope.

### 8. WORKFLOWS
- External customers/contractors submit service requests or scan asset QR codes, approve contractor quotations, and pay invoices through the isolated customer portal.

### 9. IMPLEMENTATION COMPARISON
- **Status:** **COMPLETE**
- **Evidence:** Fully implemented in `portalService.ts`, portal API routes (`/api/portal/*`), and customer authentication middleware.
