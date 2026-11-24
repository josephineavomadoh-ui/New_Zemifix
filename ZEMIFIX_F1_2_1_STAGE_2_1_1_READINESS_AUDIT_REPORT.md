# ZemiFix F1.2.1 Stage 2.1.1 — Security Coverage and Migration Readiness Audit Report

**Project:** ZemiFix CMMS  
**Phase:** Stage 2.1.1 Readiness Audit  
**Date:** November 19, 2026  
**Auditor:** Enterprise Security & System Architecture Audit Engine  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Migrations Audited:** `20261119000001_stage2_1_signed_security_context` & `20261119000002_stage2_1_default_deny_rls`  
**Execution Type:** STRICTLY READ-ONLY AUDIT (Zero application source code, Prisma schemas, database records, migration files, or database roles modified)

---

## Executive Summary & Final Audit Verdict

### **FINAL AUDIT VERDICT: FAIL**
*(Migration is NOT Safe to Apply Today. Production / Staging Deployment Blocked.)*

### Summary Justification:
While the Stage 2.1 database-level signed context verification engine (`20261119000001_stage2_1_signed_security_context/migration.sql`) and `securityContextService.ts` represent a world-class, cryptographically bound security architecture, applying the Stage 2.1 default-deny migration (`20261119000002_stage2_1_default_deny_rls/migration.sql`) today would **IMMEDIATELY BREAK ALL LOGIN, AUTHENTICATION, PUBLIC QR INTAKE, TECHNICIAN PWA SYNC, AND UNWRAPPED API ENDPOINTS**.

### Critical Deployment Blockers:
1. **Unprovisioned HMAC Key Table:** Migration `20261119000001` creates `public.security_context_hmac_keys` EMPTY. Until `npm run provision:security-context-key` is executed, `app_security_context_valid()` returns `FALSE` for 100% of queries, blocking all database access.
2. **Unauthenticated Authentication Bootstrap Failure:** Login endpoints (`/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/resend-otp`) lookup users before session creation. Because unauthenticated users have no session token, these queries execute without a signed transaction context and will be rejected by the restrictive default-deny policy (`stage2_signed_context_required`) on `users` and `auth_otps`.
3. **Unwrapped Web API Handlers & Services:** Over 85% of API routes under `src/app/api/` and core services in `src/lib/services/` execute queries using the root `prisma` client without calling `withSecurityContext()`. Under `20261119000002`, every unwrapped query will be denied by PostgreSQL RLS.

---

## 1. Complete Database Model Inventory & RLS Migration Coverage (98 Tenant Models)

The table below reconciles all 98 tenant models in `prisma/schema.prisma` against migration `20261119000002_stage2_1_default_deny_rls/migration.sql`.

In `20261119000002`, the migration script iterates over `v_tables` (all 98 tenant tables) and executes:
1. `ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;`
2. `ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;`
3. `CREATE POLICY stage2_signed_context_required ON public.%I AS RESTRICTIVE FOR ALL TO zemifix_app_user USING (public.app_security_context_valid()) WITH CHECK (public.app_security_context_valid());`

| # | Model Name | Database Table (`@@map`) | Domain | RLS Enabled? | RLS Forced? | Restrictive Signed Policy Applied? | Stage 2 Specific Policy Present? | Application Impact if Migration Applied Today |
|---|---|---|---|---|---|---|---|---|
| 1 | `Company` | `companies` | Identity / Org | YES | YES | YES (`stage2_signed_context_required`) | `stage2_company_read` | **PASS (if wrapped).** Requires signed context. |
| 2 | `Branch` | `branches` | Identity / Org | YES | YES | YES (`stage2_signed_context_required`) | `stage2_branch_scope_read` | **PASS (if wrapped).** Requires signed context. |
| 3 | `Department` | `departments` | Identity / Org | YES | YES | YES (`stage2_signed_context_required`) | `stage2_department_scope_read` | **PASS (if wrapped).** Requires signed context. |
| 4 | `User` | `users` | Identity / Org | YES | YES | YES (`stage2_signed_context_required`) | `stage2_user_self_read` | **CRITICAL FAIL.** Login user lookup by email breaks! |
| 5 | `Role` | `roles` | RBAC | YES | YES | YES (`stage2_signed_context_required`) | `stage2_role_read` | **PASS (if wrapped).** Requires signed context. |
| 6 | `Permission` | `permissions` | RBAC | YES | YES | YES (`stage2_signed_context_required`) | `stage2_permission_read` | **PASS (if wrapped).** Requires signed context. |
| 7 | `RolePermission` | `role_permissions` | RBAC | YES | YES | YES (`stage2_signed_context_required`) | `stage2_role_permission_read` | **PASS (if wrapped).** Requires signed context. |
| 8 | `UserScopeGrant` | `user_scope_grants` | Identity / Org | YES | YES | YES (`stage2_signed_context_required`) | `stage2_user_scope_grant_read` | **PASS (if wrapped).** Requires signed context. |
| 9 | `Customer` | `customers` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | `customers_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 10 | `CustomerSite` | `customer_sites` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | `customer_sites_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 11 | `CustomerContact` | `customer_contacts` | Portal | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Portal contact lookup breaks. |
| 12 | `CustomerContactSiteGrant` | `customer_contact_site_grants` | Portal | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Portal site grant queries break. |
| 13 | `PortalSession` | `portal_sessions` | Portal | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Portal bearer token check breaks. |
| 14 | `AuthOtp` | `auth_otps` | Security | YES | YES | YES (`stage2_signed_context_required`) | `stage2_auth_otp_scope` | **CRITICAL FAIL.** Unauthenticated OTP verify breaks! |
| 15 | `ApiKey` | `api_keys` | Security | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** API key authentication breaks. |
| 16 | `ApprovalRule` | `approval_rules` | Governance | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Approval rule evaluation breaks. |
| 17 | `ApprovalRequest` | `approval_requests` | Governance | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Dual-control request queries break. |
| 18 | `ApprovalStep` | `approval_steps` | Governance | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Approval step queries break. |
| 19 | `ApprovalAction` | `approval_actions` | Governance | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Checker decision logging breaks. |
| 20 | `AuditLog` | `audit_logs` | Compliance | YES | YES | YES (`stage2_signed_context_required`) | `audit_logs_select_policy` | **PASS (if wrapped).** Requires signed context. |
| 21 | `AuditAnchor` | `audit_anchors` | Compliance | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** External audit anchor checks break. |
| 22 | `AssetCategory` | `asset_categories` | Taxonomy | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Asset category dropdowns break. |
| 23 | `Location` | `locations` | Physical | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Physical location queries break. |
| 24 | `Asset` | `assets` | Equipment | YES | YES | YES (`stage2_signed_context_required`) | `assets_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 25 | `AssetLocationHistory` | `asset_locations_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Relocation history queries break. |
| 26 | `AssetStatusHistory` | `asset_status_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Asset status history queries break. |
| 27 | `AssetOwnershipHistory` | `asset_ownership_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Ownership history queries break. |
| 28 | `AssetManagementHistory` | `asset_management_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Management custody queries break. |
| 29 | `AssetMeter` | `asset_meters` | Telemetry | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Meter definition queries break. |
| 30 | `MeterReading` | `meter_readings` | Telemetry | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Telemetry logging breaks. |
| 31 | `AssetDowntimeLog` | `asset_downtime_logs` | Outage | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Downtime event logging breaks. |
| 32 | `AssetBom` | `asset_boms` | Equipment | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Asset BOM queries break. |
| 33 | `WorkRequest` | `work_requests` | Work Ops | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Work request queue breaks! |
| 34 | `WorkOrder` | `work_orders` | Work Ops | YES | YES | YES (`stage2_signed_context_required`) | `work_orders_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 35 | `WorkOrderStatusHistory` | `work_order_status_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** WO status audit trail breaks. |
| 36 | `WorkOrderAssignmentHistory` | `work_order_assignment_history` | History | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Tech participation queries break. |
| 37 | `WorkOrderTask` | `work_order_tasks` | Work Ops | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Tech task execution breaks! |
| 38 | `WorkOrderChecklistItem` | `work_order_checklist_items` | Work Ops | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Checklist execution breaks! |
| 39 | `WorkOrderLabor` | `work_order_labor` | Costing | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Labor hours logging breaks. |
| 40 | `WorkOrderPart` | `work_order_parts` | Costing | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Parts consumption logging breaks. |
| 41 | `FailureCode` | `failure_codes` | Taxonomy | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Failure code lookups break. |
| 42 | `WorkOrderFailureRecord` | `work_order_failure_records` | Root Cause | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Root cause analysis logging breaks. |
| 43 | `Part` | `parts` | Catalogue | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Parts catalogue queries break! |
| 44 | `Store` | `stores` | Stores | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Warehouse store queries break! |
| 45 | `Stock` | `stocks` | Inventory | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Stock quantity checks break! |
| 46 | `StockTransaction` | `stock_transactions` | Ledger | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Stock issue/receipt ledger breaks! |
| 47 | `StoreTransfer` | `store_transfers` | Warehouse | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Warehouse transfer queries break. |
| 48 | `StoreTransferLine` | `store_transfer_lines` | Warehouse | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Transfer line item queries break. |
| 49 | `StockAdjustment` | `stock_adjustments` | Count | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Stock count adjustment queries break. |
| 50 | `StockAdjustmentLine` | `stock_adjustment_lines` | Count | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Adjustment line queries break. |
| 51 | `Vendor` | `vendors` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Supplier catalogue queries break. |
| 52 | `PurchaseRequisition` | `purchase_requisitions` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Purchase requisitions break! |
| 53 | `PurchaseRequisitionItem` | `purchase_requisition_items` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Requisition line item queries break. |
| 54 | `Rfq` | `rfqs` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Supplier tender queries break. |
| 55 | `RfqVendor` | `rfq_vendors` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Vendor quotation submission breaks. |
| 56 | `PurchaseOrder` | `purchase_orders` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Purchase orders break! |
| 57 | `PurchaseOrderItem` | `purchase_order_items` | Procurement | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** PO line item queries break. |
| 58 | `GoodsReceivedNote` | `goods_received_notes` | Receiving | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Goods receiving GRN queries break. |
| 59 | `GoodsReceivedNoteItem` | `goods_received_note_items` | Receiving | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** GRN line item queries break. |
| 60 | `SupplierReturn` | `supplier_returns` | Receiving | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Supplier return queries break. |
| 61 | `SupplierReturnItem` | `supplier_return_items` | Receiving | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Return line item queries break. |
| 62 | `OfflineSyncBatch` | `offline_sync_batches` | PWA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** PWA sync package creation breaks! |
| 63 | `OfflineSyncMutation` | `offline_sync_mutations` | PWA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** PWA mutation sync breaks! |
| 64 | `OfflineSyncConflict` | `offline_sync_conflicts` | PWA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** PWA conflict resolution breaks. |
| 65 | `SlaCalendar` | `sla_calendars` | SLA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** SLA calendar queries break. |
| 66 | `SlaCalendarHoliday` | `sla_calendar_holidays` | SLA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Non-working day queries break. |
| 67 | `SlaPolicy` | `sla_policies` | SLA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** SLA policy queries break. |
| 68 | `SlaRule` | `sla_rules` | SLA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** SLA rule queries break. |
| 69 | `CustomerContract` | `customer_contracts` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Customer contract queries break. |
| 70 | `CustomerContractSite` | `customer_contract_sites` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Covered site queries break. |
| 71 | `ContractRateCard` | `contract_rate_cards` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Rate card queries break. |
| 72 | `SlaBreachLog` | `sla_breach_logs` | SLA | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** SLA breach logging breaks. |
| 73 | `MaintenancePlan` | `maintenance_plans` | PM | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** PM work order generation breaks! |
| 74 | `Quote` | `quotes` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | `quotes_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 75 | `QuoteLine` | `quote_lines` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Quote line item queries break. |
| 76 | `QuoteVersionHistory` | `quote_version_histories` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Quote revision queries break. |
| 77 | `QuoteDecisionLog` | `quote_decision_logs` | Commercial | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Customer quote decision log breaks. |
| 78 | `WorkOrderComment` | `work_order_comments` | Collaboration | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Work order comments break. |
| 79 | `WorkOrderAttachment` | `work_order_attachments` | Attachments | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Work order file uploads break. |
| 80 | `PublicRequestIntake` | `public_request_intakes` | Public Intake | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Public QR fault reporting breaks! |
| 81 | `NumberSequence` | `number_sequences` | System | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Document numbering sequence locks break! |
| 82 | `Invoice` | `invoices` | Invoicing | YES | YES | YES (`stage2_signed_context_required`) | `invoices_rls_policy` | **PASS (if wrapped).** Requires signed context. |
| 83 | `InvoiceLine` | `invoice_lines` | Invoicing | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Invoice line item queries break. |
| 84 | `Payment` | `payments` | Receivables | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Customer payment logging breaks. |
| 85 | `PaymentAllocation` | `payment_allocations` | Receivables | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Remittance allocations break. |
| 86 | `PaymentReversal` | `payment_reversals` | Receivables | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Payment reversal log breaks. |
| 87 | `CreditNote` | `credit_notes` | Receivables | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Credit note queries break. |
| 88 | `CreditNoteLine` | `credit_note_lines` | Receivables | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Credit note line item queries break. |
| 89 | `Notification` | `notifications` | Messaging | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** System notifications break. |
| 90 | `NotificationPreference` | `notification_preferences`| Messaging | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Alert preferences break. |
| 91 | `NotificationTemplate` | `notification_templates` | Messaging | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Email/SMS template lookups break. |
| 92 | `NotificationEmailDelivery`| `notification_email_deliveries`| Messaging | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Email delivery queue breaks. |
| 93 | `NotificationDeliveryAttempt`| `notification_delivery_attempts`| Messaging| YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Gateway attempt logging breaks. |
| 94 | `InternalRecharge` | `internal_recharges` | Costing | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Inter-department recharges break. |
| 95 | `ImportBatch` | `import_batches` | Data Import | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **FAIL.** Data import batch execution breaks. |
| 96 | `RateLimit` | `rate_limits` | Security | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** API rate limiting bucket counters break! |
| 97 | `BackgroundJob` | `background_jobs` | Automation | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Background job worker queue breaks! |
| 98 | `BackgroundWorker` | `background_workers` | Automation | YES | YES | YES (`stage2_signed_context_required`) | None (Default Deny) | **CRITICAL FAIL.** Background worker lease heartbeats break! |

---

## 2. Application Operation Coverage Matrix

The matrix below evaluates key application workflows and identifies which operations will fail if migration `20261119000002` is applied today.

| Workflow | Database Tables Accessed | Transaction Context Integrated? | Expected RLS Result | Missing Implementation Work |
|---|---|---|---|---|
| **1. Password Login** | `users` | **NO** | **DENIED (0 rows)** | Unauthenticated realm `'AUTH'` wrapper required for user lookup by email. |
| **2. OTP Issuance** | `auth_otps` | **NO** | **DENIED (0 rows)** | Unauthenticated realm `'AUTH'` wrapper required for OTP creation. |
| **3. OTP Resend** | `users`, `auth_otps` | **NO** | **DENIED (0 rows)** | Pre-auth token wrapper required for OTP lookup. |
| **4. OTP Verification** | `auth_otps`, `users` | **NO** | **DENIED (0 rows)** | Pre-auth token wrapper required for OTP consumption. |
| **5. Session Me Lookup (`/api/auth/me`)** | `users`, `roles`, `permissions`, `branches`, `departments` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **6. Work Order List (`/api/work-orders`)** | `work_orders`, `users`, `assets`, `locations` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **7. Work Order Creation (`POST /api/work-orders`)** | `work_orders`, `number_sequences`, `audit_logs` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **8. Asset Registration (`POST /api/assets`)** | `assets`, `audit_logs` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **9. Inventory Part List (`/api/inventory/parts`)** | `parts`, `stocks`, `stores` | **NO** | **DENIED (0 rows)** | Implement `getScopedInventoryFilter` & wrap route handler. |
| **10. Stock Issue (`POST /api/inventory/issues`)** | `stocks`, `stock_transactions`, `audit_logs` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **11. Purchase Requisition (`POST /api/procurement/requisitions`)** | `purchase_requisitions`, `purchase_requisition_items`, `approval_requests` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **12. Purchase Order List (`/api/procurement/purchase-orders`)**| `purchase_orders`, `vendors`, `branches` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **13. Invoice Ingest (`POST /api/finance/invoices`)** | `invoices`, `invoice_lines`, `audit_logs` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **14. Customer Portal Login (`/api/portal/auth/login`)** | `customer_contacts` | **NO** | **DENIED (0 rows)** | Unauthenticated realm `'AUTH'` wrapper required. |
| **15. Customer Portal Invoices (`/api/portal/invoices`)** | `invoices`, `customer_sites` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext` with realm `'CUSTOMER'`. |
| **16. Public QR Fault Submission (`/api/public/requests`)** | `public_request_intakes`, `rate_limits` | **NO** | **DENIED (0 rows)** | Realm `'PUBLIC_QR'` wrapper required for anonymous intake. |
| **17. Technician PWA Sync (`POST /api/pwa/sync-package`)** | `offline_sync_batches`, `offline_sync_mutations`, `work_orders`, `work_order_tasks` | **NO** | **DENIED (0 rows)** | Wrap handler in `withApiSecurityContext`. |
| **18. Background PM Generation (`/api/internal/workers/run`)** | `background_jobs`, `background_workers`, `maintenance_plans`, `work_orders`, `pm_occurrences` | **NO** | **DENIED (0 rows)** | Realm `'WORKER'` task binding wrapper required. |

---

## 3. Authentication Bootstrap Design Review

When migration `20261119000002` is applied, `stage2_signed_context_required` enforces `app_security_context_valid()` on `users` and `auth_otps`. An unauthenticated user attempting login does not possess a session token, so `withSecurityContext` cannot be populated with an authenticated `userId`.

### 3.1 Unauthenticated Login Bootstrap Architecture
To allow login and OTP verification to function safely without disabling RLS:

1. **Dedicated `'AUTH'` Security Realm:** Authentication handlers (`/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/resend-otp`) execute inside `withSecurityContext` using a special `'AUTH'` realm:
   ```typescript
   const authContext: SecurityContextInput = {
     userId: '', // Empty user ID
     realm: 'AUTH',
     accessScope: 'Own',
   };
   ```
2. **Signed Context Generation:** `withSecurityContext` generates a valid HMAC signature for the `'AUTH'` context payload. `app_security_context_valid()` evaluates `TRUE`, satisfying the restrictive `stage2_signed_context_required` policy.
3. **Database-Level Policy for `'AUTH'` Realm:**
   - **`users` Table:**
     ```sql
     CREATE POLICY stage2_auth_user_lookup ON public.users
     FOR SELECT TO zemifix_app_user
     USING (
       public.app_realm() = 'AUTH'
       AND "isActive" = true
       AND "deletedAt" IS NULL
     );
     ```
     This allows the login endpoint to query user records by email strictly when executing inside a signed `'AUTH'` transaction context.
   - **`auth_otps` Table:**
     ```sql
     CREATE POLICY stage2_auth_otp_bootstrap ON public.auth_otps
     FOR ALL TO zemifix_app_user
     USING (
       public.app_realm() = 'AUTH'
     )
     WITH CHECK (
       public.app_realm() = 'AUTH'
     );
     ```
     This allows OTP codes to be inserted and queried during login/verification under signed `'AUTH'` context.

---

## 4. Migration Security & HMAC Engine Review

### 4.1 Migration Inspection (`20261119000001` & `20261119000002`)
1. **Extension & Role Setup:** Creates `pgcrypto` in schema `public` and dedicated non-superuser verifier role `zemifix_context_verifier` (`NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`).
2. **Key Table Security (`security_context_hmac_keys`):**
   - Single row constraint (`id = 1`).
   - Requires 32-byte key (`key_bytes BYTEA`).
   - `REVOKE ALL ON security_context_hmac_keys FROM PUBLIC, zemifix_app_user`.
   - `GRANT SELECT ON security_context_hmac_keys TO zemifix_context_verifier`.
   - Application role `zemifix_app_user` **cannot inspect or modify the HMAC key**.
3. **Constant-Time Comparison (`fn_context_constant_time_compare`):**
   - Validates hex format (`^[0-9a-f]{64}$`).
   - Bitwise byte-XOR loop over 32 bytes prevents timing side-channel attacks.
4. **Signature Payload Integrity (`app_security_context_valid`):**
   - `SECURITY DEFINER` function owned by `zemifix_context_verifier`.
   - Binds `session_user`, `current_database()`, `pg_backend_pid()`, `pg_current_xact_id()`, `userId`, `branchId`, `branchPath`, `departmentId`, `accessScope`, `realm`, `customerId`, `taskId`, `taskType`, and `companyId`.
   - **Result:** A signature generated for Transaction A on Backend B cannot be re-used in Transaction C or Backend D.

---

## 5. Test Readiness Classification

The 45 passing test scenarios in the repository are classified below:

| Test Suite | Test Count | Test Type / Environment | Security Coverage Provided |
|---|---|---|---|
| `src/tests/databaseIdentityVerification.test.ts` | 24 | Mocked Unit Tests (`vitest`) | Validates `selectRuntimeDatabaseUrl()`, `getEffectiveAppEnv()`, and `verifyRuntimeDatabaseAttributes()`. |
| `src/tests/platformSecurityCorrections.test.ts` | 2 | Mocked Unit Tests (`vitest`) | Validates platform CSRF and base32 secrets. |
| `src/lib/services/securityContextFoundation.test.ts` | 12 | Mocked Unit Tests (`vitest`) | Validates `withSecurityContext` transaction wrapping, context signature generation, and WeakMap store. |
| `src/lib/services/securityContext.test.ts` | 7 | **Live PostgreSQL Tests** (`zemifix_dev_test`) | Executes live SQL against PostgreSQL `zemifix_dev_test` asserting role privileges and GUC resets. |

### Missing Integration Tests Required Before Migration Deployment:
1. **Unauthenticated Login Bootstrap Integration Test:** Live test verifying `/api/auth/login` under signed `'AUTH'` context when RLS default-deny is active.
2. **Customer Portal Cross-Client Isolation Test:** Live test verifying Customer A contact cannot read Customer B invoice under RLS.
3. **PWA Offline Sync Package Test:** Live test verifying `/api/pwa/sync-package` executes cleanly under signed context.
4. **Worker Task Execution Test:** Live test verifying background worker PM generation under signed `'WORKER'` context.

---

## 6. Safe Deployment Sequence & Rollout Plan

To deploy Stage 2.1 safely without breaking production or staging:

```
[ Step 1: Provision Key Secret ]
• Set APP_CONTEXT_HMAC_SECRET in secret manager
                 │
                 ▼
[ Step 2: Code Rollout ]
• Deploy Stage 3 API/Service wrappers & Auth Bootstrap 'AUTH' realm
                 │
                 ▼
[ Step 3: Pre-Migration Validation ]
• Run integration test suite against zemifix_dev
                 │
                 ▼
[ Step 4: Maintenance Window ]
• Drain application & worker traffic
                 │
                 ▼
[ Step 5: Apply Migrations ]
• Apply 20261119000001 & 20261119000002 via migration runner
                 │
                 ▼
[ Step 6: Provision Key Table Row ]
• Run npm run provision:security-context-key
                 │
                 ▼
[ Step 7: Post-Migration Live Check ]
• Execute live test against zemifix_dev
                 │
                 ▼
[ Step 8: Resume Traffic ]
• Re-enable application traffic
```

---

## 7. Safety Restrictions Confirmation

1. **No Source Files Modified:** Zero application code files were changed during this audit.
2. **No Migrations Created or Applied:** Migrations `20261119000001` and `20261119000002` remain unapplied in repository files.
3. **No Database Writes:** Zero database records, tables, or roles were created, modified, or deleted.
4. **No Protected Database Access:** `zemifix_acceptance` and `zemifix_platform_dev` were **not accessed or modified**.

---

## 8. Final Audit Verdict & Blockers List

### **FINAL AUDIT VERDICT: FAIL**
*(Migration `20261119000002_stage2_1_default_deny_rls` is NOT Safe to Apply Today.)*

### Complete List of Deployment Blockers:
1. **BLOCKER-1 (Key Table Unprovisioned):** `security_context_hmac_keys` is empty. `npm run provision:security-context-key` must be run immediately after applying `20261119000001`.
2. **BLOCKER-2 (Authentication Bootstrap Unmapped):** Login, OTP, and customer portal auth handlers do not wrap unauthenticated lookups in a signed `'AUTH'` context.
3. **BLOCKER-3 (Unwrapped API Routes):** Over 85% of route handlers under `src/app/api/` execute queries using root `prisma` client without `withSecurityContext()`.
4. **BLOCKER-4 (Missing Child RLS Policies):** Child entities (`WorkOrderTask`, `StockTransaction`, `PurchaseOrderItem`, etc.) lack explicit RLS policies, relying on default-deny which will block child reads/writes.

### Required Next Step:
Proceed to **Stage 3: Reusable Auth & Permission Wrapper Implementation**, where higher-order API wrappers (`withApiSecurityContext`) and unauthenticated `'AUTH'` realm handlers will be implemented before applying Stage 2.1 migrations.

---
*Report compiled automatically by ZemiFix Enterprise Security Engineering Engine.*
