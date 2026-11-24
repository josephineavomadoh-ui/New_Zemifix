# ZemiFix F1.2.1 Stage 3 — Increment 2B6.1 Final Audit Clarification and Evidence Addendum

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 Stage 3 Increment 2B6.1 Audit Addendum  
**Document Type:** Independent Audit Evidence Clarification Addendum  
**Date:** November 20, 2026  
**Status:** **APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Audit Target:** Handler Count Reconciliation, Credit-Note Accounting, Internal Recharge Uniqueness, Scope & Concurrency Evidence  
**Execution Type:** STRICTLY READ-ONLY CODE AUDIT (Zero application code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Updated Authorization Decision

### **FINAL AUDIT VERDICT: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**
*(This audit evidence addendum resolves all outstanding questions regarding Finance API handler counts, credit-note accounting formulas, internal recharge uniqueness locks, and concurrency classifications. Proceeding with Increment 2B7 to secure Customer Portal API routes [`/api/portal/*`] and `portalService.ts` is **AUTHORIZED TO PROCEED IN DEVELOPMENT**.)*

---

## 1. Reconciled Finance API Route and Handler Matrix (7 Files / 11 Handlers)

Inspection of `src/app/api/finance/` confirms **7 route.ts files** containing **11 individual exported HTTP method handler functions**:

| Endpoint Route Path | HTTP Method | Business Operation | Target Realm | Required RBAC Permission | Primary Service Function Called | Line Reference |
|---|---|---|---|---|---|---|
| `/api/finance/invoices` | `GET` | Query commercial invoices | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.invoice.findMany` | `invoices/route.ts#L5` |
| `/api/finance/invoices` | `POST` | Create draft invoice | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `createInvoice` | `invoices/route.ts#L24` |
| `/api/finance/invoices/[id]/submit` | `POST` | Submit draft for approval | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `submitInvoiceForApproval` | `submit/route.ts#L5` |
| `/api/finance/invoices/[id]/approve` | `POST` | Approve commercial invoice | `STAFF` | `{ resource: 'invoice', action: 'approve' }` | `approveInvoice` | `approve/route.ts#L5` |
| `/api/finance/invoices/[id]/send` | `POST` | Mark invoice sent to customer | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `markInvoiceSent` | `send/route.ts#L5` |
| `/api/finance/payments` | `GET` | Query payment remittances | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.payment.findMany` | `payments/route.ts#L5` |
| `/api/finance/payments` | `POST` | Record payment remittance | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `recordPaymentRemittance` | `payments/route.ts#L20` |
| `/api/finance/credit-notes` | `GET` | Query credit notes list | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.creditNote.findMany` | `credit-notes/route.ts#L5` |
| `/api/finance/credit-notes` | `POST` | Issue credit note | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `issueCreditNote` | `credit-notes/route.ts#L20` |
| `/api/finance/internal-recharges` | `GET` | Query internal recharges | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.internalRecharge.findMany` | `internal-recharges/route.ts#L5` |
| `/api/finance/internal-recharges` | `POST` | Record internal recharge | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `recordInternalRecharge` | `internal-recharges/route.ts#L20` |

---

## 2. Credit-Note Accounting Rule Verification & Worked Numerical Example

### 2.1 Implemented Formula (`billingService.ts#L500-L515`)
$$\text{Max Creditable} = \text{Total Invoice Amount} - \text{Paid Amount} - \text{Current Credited Amount}$$

### 2.2 Worked Numerical Example
- **Initial Invoice:** `subtotal` = GHS 100.00. Ghana Statutory Taxes (20%) = GHS 20.00. `totalAmount` = GHS 120.00. `balanceDue` = GHS 120.00.
- **Scenario A (Partial Payment Received):**
  - Customer pays GHS 50.00 (`paidAmount` = GHS 50.00). `balanceDue` becomes GHS 70.00.
  - Credit note requested for subtotal GHS 30.00 (Total Credit = GHS 36.00).
  - `maxCreditable` = 120.00 - 50.00 - 0.00 = GHS 70.00.
  - Since Total Credit (36.00) <= `maxCreditable` (70.00), credit note is issued.
  - New `creditedAmount` = GHS 36.00. New `balanceDue` = 120.00 - 50.00 - 36.00 = GHS 34.00.
- **Scenario B (Fully Paid Invoice):**
  - Customer has paid the full GHS 120.00 (`paidAmount` = GHS 120.00). `balanceDue` = GHS 0.00.
  - `maxCreditable` = 120.00 - 120.00 - 0.00 = GHS 0.00.
  - Attempting to issue a credit note against this fully paid invoice throws `EXCESS_CREDIT_PROHIBITED` (`totalCredit > maxCreditable`), preventing over-crediting paid invoices.

---

## 3. Internal Recharge Uniqueness Verification

1. **Row-Level Lock:** `recordInternalRecharge` executes `SELECT id, "workOrderNumber" FROM "work_orders" WHERE id = ${params.workOrderId}::uuid FOR UPDATE` (`billingService.ts#L575`), serializing concurrent recharge attempts on the same work order.
2. **Application Check:** Queries `tx.internalRecharge.findUnique({ where: { workOrderId: wo.id } })`. If found, throws `DUPLICATE_RECHARGE`.
3. **Database Schema Constraint:** In `prisma/schema.prisma`, model `InternalRecharge` enforces `@unique` on `workOrderId`, ensuring PostgreSQL database-level uniqueness is also enforced.

---

## 4. PostgreSQL Concurrency & Verification Classification

| Security / Concurrency Mechanism | Verified Evidence Type | Source Code & Test Location |
|---|---|---|
| **Gapless Sequence Lock (`allocateDocumentNumber`)** | Source Code & Mocked Unit Test | `billingService.ts#L125`, `src/tests/financeSecurity.test.ts` |
| **Payment Overpayment Lock (`recordPaymentRemittance`)** | Source Code & Mocked Unit Test | `billingService.ts#L410`, `src/tests/financeSecurity.test.ts` |
| **Credit Note Cumulative Limit (`issueCreditNote`)** | Source Code & Mocked Unit Test | `billingService.ts#L480`, `src/tests/financeSecurity.test.ts` |
| **Internal Recharge Row Lock (`recordInternalRecharge`)** | Source Code & Mocked Unit Test | `billingService.ts#L575`, `src/tests/financeSecurity.test.ts` |
| **Live PostgreSQL Row-Level Locking & RLS Enforcement** | Deferred (Stage 7) | Requires Phase A/C migration activation against `zemifix_dev_test`. |

---

## 5. Mandatory Pre-Conditions for Stage 3 Increment 2B7

1. **Development-Only Implementation:** Refactoring of Customer Portal API routes (`/api/portal/*`) and `portalService.ts` is authorized to proceed in development.
2. **Migrations Remain Unapplied:** Database migrations `20261119000001` and `20261119000002` MUST remain unapplied until Stage 3 code implementation is complete.

---

## 6. Final Approval Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**

* **Status:** The Stage 3 Increment 2B6.1 Audit Addendum is **COMPLETE, RECONCILED, AND APPROVED FOR STAGE 3 INCREMENT 2B7**.
* **Authorized Next Action:** Proceed with **Implementation Increment 2B7** to secure Customer Portal API routes (`/api/portal/*`) and `portalService.ts`.

---
*Addendum authored automatically by ZemiFix Enterprise Security Engineering Engine.*
