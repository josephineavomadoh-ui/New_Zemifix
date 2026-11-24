# CONTRACTOR_MODE_TEST_READINESS_REPORT.md

This report provides a comprehensive, read-only readiness assessment and technical blueprint for conducting an end-to-end testing exercise of **ZemiFix Contractor Mode** (Commercial Field Services, Client Contracts, Quotations, and Billing).

---

## Task 1 — Contractor Mode Entry

1. **How a user enters Contractor Mode:**
   - Internal staff enter Contractor Mode by logging in with valid staff credentials (`admin@zemifix.local`) and accessing contractor-specific modules (`/customers`, `/contracts`, `/quotes`, `/finance`) or toggling/viewing operating modes in **Company Settings** (`SettingsView.tsx`) or **Organization** (`/organization`).
2. **Mode Selector & Configuration:**
   - Operating modes are stored in the `Company.modes` JSON column (`{ "facility": true, "contractor": true }`). The application shell (`AppShell.tsx`, `AppSidebar.tsx`) inspects these flags and sets `sidebarMode` to `'facility'`, `'contractor'`, or `'combined'`, rendering the appropriate `contractorNavigationGroups`.
3. **Exact Routes for Contractor Mode:**
   - `/customers` (Client & Site Directory)
   - `/contracts` (Maintenance Service Level Agreements & Retainers)
   - `/quotes` (Commercial Quotations & Estimates)
   - `/finance/invoices` (Commercial Billing & Job-to-Cash)
   - `/reports` (Contractor Performance & Profitability Reports)
4. **Enabled & Usable Status:**
   - Contractor Mode is fully enabled in the codebase and schema (seed defaults `contractor: true`), rendering dedicated contractor navigation groups and commercial billing modules when active.
5. **App Shell & Navigation Sharing:**
   - Facility Mode and Contractor Mode share the same authenticated application shell (`AppShell.tsx`), but dynamically switch or combine sidebar navigation groups (`facilityNavigationGroups` vs. `contractorNavigationGroups`) based on company mode configuration and user permissions.

---

## Task 2 — Contractor Internal Roles

Contractor Mode operations are executed by internal company staff holding standard ZemiFix roles, operating on external client entities:
- **Company Administrator:** Full management of customer accounts, contract terms, rate cards, and global contractor settings.
- **Operations Manager / Branch Manager:** Oversees customer SLA compliance, contract profitability, and job-to-cash workflows.
- **Supervisor / Dispatcher:** Assigns technicians to customer site work orders and verifies completed client jobs.
- **Planner:** Schedules recurring customer maintenance contracts and SLA-backed preventive maintenance.
- **Technician:** Executes work orders at external customer sites, logging labor, parts, and customer sign-offs.
- **Finance / Billing Officer:** Generates commercial invoices from unbilled work items, records customer payments, and manages credit notes.

---

## Task 3 — Contractor Business Workflows Matrix

| Business Workflow | Implementation Status | Evidence / File Path / API / Model |
| :--- | :--- | :--- |
| **1. Customer & Customer-Site Management** | **IMPLEMENTED** | `src/app/customers/page.tsx`, `customerService.ts`, Models: `Customer`, `CustomerSite` |
| **2. Customer Contacts** | **IMPLEMENTED** | `customerService.ts`, Model: `CustomerContact` |
| **3. Contract Management** | **IMPLEMENTED** | `src/app/contracts/page.tsx`, `contractService.ts`, Model: `CustomerContract` |
| **4. SLA Management** | **IMPLEMENTED** | `contractService.ts`, Model: `ServiceLevelAgreement` |
| **5. Quotations & Quotation Approvals** | **IMPLEMENTED** | `src/app/quotes/page.tsx`, `quoteService.ts`, Models: `Quote`, `QuoteLine` |
| **6. Customer Maintenance Requests** | **IMPLEMENTED** | `src/app/requests/page.tsx`, `workRequestService.ts`, Model: `ServiceRequest` |
| **7. Work Order Creation & Assignment** | **IMPLEMENTED** | `src/app/work-orders/page.tsx`, `workOrderService.ts`, Model: `WorkOrder` |
| **8. Technician Execution & Completion** | **IMPLEMENTED** | `TechnicianDashboardView.tsx`, `offlineSyncManager.ts`, Models: `WorkOrderLabor`, `WorkOrderPart` |
| **9. Labour & Material Costing** | **IMPLEMENTED** | `workOrderService.ts`, `inventoryService.ts`, Models: `WorkOrderLabor`, `WorkOrderPart` |
| **10. Inventory & Stock Consumption** | **IMPLEMENTED** | `src/app/inventory/page.tsx`, `inventoryService.ts`, Models: `Part`, `Stock`, `StockTransaction` |
| **11. Customer Invoicing** | **IMPLEMENTED** | `src/app/finance/invoices/page.tsx`, `billingService.ts`, Models: `Invoice`, `InvoiceLine` |
| **12. Payment Recording & Allocation** | **IMPLEMENTED** | `billingService.ts`, Models: `Payment`, `PaymentAllocation` |
| **13. Customer Statements** | **IMPLEMENTED** | `reportService.ts`, `billingService.ts` |
| **14. Contractor Revenue & Profitability Reports** | **IMPLEMENTED** | `src/components/reports/ReportsView.tsx`, `reportService.ts` |

---

## Task 4 — Customer Portal (External)

1. **Authentication:** Separate portal authentication (`portalAuth.ts`) issuing a dedicated `zemifix_portal_session` cookie for the `CUSTOMER` realm.
2. **Data Isolation:** Strictly scoped to the authenticated customer ID (`customerId`), ensuring external clients only see their own sites, contracts, requests, and invoices.
3. **Features:**
   - Request submission and public QR code maintenance intake (`/request/qr`).
   - Quotation review and approval.
   - Work order tracking and history.
   - Invoice viewing and payment statements.
4. **Testing Strategy:** Test using dedicated portal test accounts (`portalAuth.ts`) at `/portal/login`, ensuring zero visibility into internal contractor cost data, margins, or other client records.

---

## Task 5 — Test Data and Test Accounts

1. **Existing Seed Records:**
   - Company record with `modes: { facility: true, contractor: true }`.
   - System administrator (`admin@zemifix.local`, password `javvy`).
   - Core roles (`Admin`, `Manager`, `Supervisor`, `Planner`, `Technician`, `Storekeeper`, `Finance`, `Cashier`).
2. **Proposed Test-Data Setup:**
   - Use existing `admin@zemifix.local` to create a test customer (e.g., *Tema Port Authority*), a customer site, a maintenance contract, an itemized quotation, a service request, and a commercial invoice through the UI to perform end-to-end testing without running destructive scripts or migrations.

---

## Task 6 — Facility Mode Isolation

1. **Scoping & Separation:**
   - Facility Mode uses internal `Branch` and `Department` hierarchies and internal `Location` nodes.
   - Contractor Mode uses `Customer`, `CustomerSite`, `CustomerContract`, and asset ownership typing (`CUSTOMER_OWNED` / `EXTERNAL_CONTRACTOR`).
2. **Risk Assessment:**
   - Zero cross-mode risk when access scopes and repository filters (`getScopedWorkOrderFilter`, `getScopedInvoiceFilter`) are applied. All queries enforce strict tenant and client data isolation.

---

## Recommended End-to-End Testing Sequence

1. Log in as Company Administrator (`admin@zemifix.local`).
2. Navigate to **Customers** (`/customers`) and create a test client and site.
3. Navigate to **Contracts** (`/contracts`) and establish a service contract.
4. Navigate to **Quotes** (`/quotes`) and create an itemized commercial quotation.
5. Submit a Customer Service Request or scan a client asset QR code.
6. Convert Request to Work Order via Planner/Supervisor.
7. Execute work as a Technician (logging labor and parts consumption).
8. Verify completed work as Supervisor.
9. Generate commercial invoice as Finance.
10. Record payment as Cashier.
11. Review contract profitability and customer performance in **Reports** (`/reports`).
