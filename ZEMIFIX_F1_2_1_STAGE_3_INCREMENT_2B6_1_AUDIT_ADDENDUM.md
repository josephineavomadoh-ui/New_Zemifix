# ZemiFix F1.2.1 Stage 3 — Increment 2B6.1 Final Audit Evidence & Accounting Policy Addendum

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 Stage 3 Increment 2B6.1 Audit  
**Document Type:** Final Credit-Note Accounting Policy & Organizational Scope Audit Addendum  
**Date:** November 20, 2026  
**Status:** **APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Audit Scope:** Credit-Note Accounting Policy (Policy A), Organizational Access Scope (`assertInvoiceScope`), Concurrency & Handler Matrix  
**Execution Type:** STRICTLY READ-ONLY CODE AUDIT (Zero application code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Final Gate Decision

### **FINAL AUDIT VERDICT: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**
*(This final audit addendum establishes that ZemiFix implements **Policy A (Receivables-Only Credit Notes)** for commercial invoices, and that `assertInvoiceScope` enforces strict tenant, branch, department, and own access-scope boundaries across all financial operations. Proceeding with Increment 2B7 to secure Customer Portal API routes [`/api/portal/*`] and `portalService.ts` is **AUTHORIZED TO PROCEED IN DEVELOPMENT**.)*

---

## 1. Established Credit-Note Accounting Policy (Policy A — Receivables-Only Credit Notes)

Source code analysis of `issueCreditNote` (`src/lib/services/billingService.ts#L480-L535`) confirms that ZemiFix implements **Policy A (Receivables-Only Credit Notes)**.

### 1.1 Accounting Model Specification
Under Policy A:
1. **Purpose:** Credit notes are issued strictly against open, unpaid, or partially paid invoice balances to reduce outstanding accounts receivable.
2. **Formula:**
   $$\text{Max Creditable} = \text{Total Invoice Amount} - \text{Paid Amount} - \text{Current Credited Amount}$$
3. **Receivables Adjustment:** When a credit note is issued, it increases `invoice.creditedAmount` and reduces `invoice.balanceDue`:
   $$\text{New Balance Due} = \text{Total Amount} - \text{Paid Amount} - \text{New Credited Amount}$$
4. **Paid Invoice Protection:** If an invoice has already been fully paid (`paidAmount` = `totalAmount`), `maxCreditable` evaluates to `0.00`. Attempting to issue a credit note against a fully paid invoice throws `EXCESS_CREDIT_PROHIBITED`. Fully paid invoices cannot receive credit notes to reduce balance due; refunds or customer prepayments are managed separately in customer account ledger entries.

---

## 2. Worked Numerical Examples & Financial Consequences

### Example 1: Unpaid Invoice
- **Initial Invoice:** `subtotal` = GHS 100.00, Ghana Statutory Taxes (20%) = GHS 20.00. `totalAmount` = GHS 120.00. `paidAmount` = GHS 0.00, `creditedAmount` = GHS 0.00. `balanceDue` = GHS 120.00.
- **Credit Note Request:** Subtotal GHS 50.00 (Total credit GHS 60.00 incl. 20% tax).
- **Calculation:** `maxCreditable` = 120.00 - 0.00 - 0.00 = GHS 120.00. Total Credit (60.00) <= `maxCreditable` (120.00) -> **APPROVED**.
- **Result:** `creditedAmount` becomes GHS 60.00. New `balanceDue` = 120.00 - 0.00 - 60.00 = GHS 60.00.

### Example 2: Partially Paid Invoice
- **Initial Invoice:** `totalAmount` = GHS 120.00. `paidAmount` = GHS 50.00, `creditedAmount` = GHS 0.00. `balanceDue` = GHS 70.00.
- **Credit Note Request:** Subtotal GHS 30.00 (Total credit GHS 36.00).
- **Calculation:** `maxCreditable` = 120.00 - 50.00 - 0.00 = GHS 70.00. Total Credit (36.00) <= `maxCreditable` (70.00) -> **APPROVED**.
- **Result:** `creditedAmount` = GHS 36.00. New `balanceDue` = 120.00 - 50.00 - 36.00 = GHS 34.00.

### Example 3: Fully Paid Invoice (Policy A Protection)
- **Initial Invoice:** `totalAmount` = GHS 120.00. `paidAmount` = GHS 120.00, `creditedAmount` = GHS 0.00. `balanceDue` = GHS 0.00.
- **Credit Note Request:** Subtotal GHS 10.00 (Total credit GHS 12.00).
- **Calculation:** `maxCreditable` = 120.00 - 120.00 - 0.00 = GHS 0.00. Total Credit (12.00) > `maxCreditable` (0.00) -> **REJECTED**.
- **Result:** Throws `EXCESS_CREDIT_PROHIBITED: Credit note total (12) exceeds remaining creditable amount (0)`.

### Example 4: Cumulative Credit Notes Exceeding Limit
- **Initial Invoice:** `totalAmount` = GHS 120.00. `paidAmount` = GHS 0.00, `creditedAmount` = GHS 100.00. `balanceDue` = GHS 20.00.
- **Credit Note Request:** Subtotal GHS 25.00 (Total credit GHS 30.00).
- **Calculation:** `maxCreditable` = 120.00 - 0.00 - 100.00 = GHS 20.00. Total Credit (30.00) > `maxCreditable` (20.00) -> **REJECTED**.
- **Result:** Throws `EXCESS_CREDIT_PROHIBITED: Credit note total (30) exceeds remaining creditable amount (20)`.

---

## 3. Organizational Access-Scope Verification (`assertInvoiceScope`)

Inspection of `assertInvoiceScope` (`src/lib/services/billingService.ts#L30-L80`) confirms strict organizational scope enforcement:

| Access Scope | Scope Verification & Filtering Mechanism | Access Boundary Enforcement |
|---|---|---|
| **`Company`** | Full access to all branches and departments. | Unrestricted branch access within tenant company. |
| **`Branch`** | Verifies creator's `branchId === user.branchId` OR present in `userScopeGrant` active branch grants. | Rejects access if invoice creator belongs to another branch without active grant (`UNAUTHORIZED_INVOICE_SCOPE`). |
| **`BranchAndBelow`** | Resolves tree path prefix (`starts_with(creatorBranch.path, userBranch.path)`). | Allows access to child branches under user's branch hierarchy; rejects parent or sibling branches. |
| **`Department`** | Verifies branch match AND `creator.departmentId === user.departmentId` (or active department grant). | Restricts access strictly to user's assigned department within their branch. |
| **`Own`** | Verifies `invoice.createdByUserId === user.id`. | Restricts invoice mutation and access strictly to invoices created by the authenticated user. |

---

## 4. Reconciled Finance API Route and Handler Matrix (7 Files / 11 Handlers)

| Endpoint Route Path | HTTP Method | Business Operation | Target Realm | Required RBAC Permission | Primary Service Function Called |
|---|---|---|---|---|---|
| `/api/finance/invoices` | `GET` | Query commercial invoices | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.invoice.findMany` |
| `/api/finance/invoices` | `POST` | Create draft invoice | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `createInvoice` |
| `/api/finance/invoices/[id]/submit` | `POST` | Submit draft for approval | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `submitInvoiceForApproval` |
| `/api/finance/invoices/[id]/approve` | `POST` | Approve commercial invoice | `STAFF` | `{ resource: 'invoice', action: 'approve' }` | `approveInvoice` |
| `/api/finance/invoices/[id]/send` | `POST` | Mark invoice sent to customer | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `markInvoiceSent` |
| `/api/finance/payments` | `GET` | Query payment remittances | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.payment.findMany` |
| `/api/finance/payments` | `POST` | Record payment remittance | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `recordPaymentRemittance` |
| `/api/finance/credit-notes` | `GET` | Query credit notes list | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.creditNote.findMany` |
| `/api/finance/credit-notes` | `POST` | Issue credit note | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `issueCreditNote` |
| `/api/finance/internal-recharges` | `GET` | Query internal recharges | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.internalRecharge.findMany` |
| `/api/finance/internal-recharges` | `POST` | Record internal recharge | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `recordInternalRecharge` |

---

## 5. Mandatory Pre-Conditions for Stage 3 Increment 2B7

1. **Development-Only Implementation:** Refactoring of Customer Portal API routes (`/api/portal/*`) and `portalService.ts` is authorized to proceed in development.
2. **Migrations Remain Unapplied:** Database migrations `20261119000001` and `20261119000002` MUST remain unapplied until Stage 3 code implementation is complete.

---

## 6. Final Approval Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**

* **Status:** The Stage 3 Increment 2B6.1 Final Audit Evidence Addendum is **COMPLETE, RECONCILED, AND APPROVED FOR STAGE 3 INCREMENT 2B7**.
* **Authorized Next Action:** Proceed with **Implementation Increment 2B7** to secure Customer Portal API routes (`/api/portal/*`) and `portalService.ts`.

---
*Addendum authored automatically by ZemiFix Enterprise Security Engineering Engine.*
