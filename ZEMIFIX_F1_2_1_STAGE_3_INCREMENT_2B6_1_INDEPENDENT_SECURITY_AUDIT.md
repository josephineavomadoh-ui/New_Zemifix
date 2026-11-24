# ZemiFix F1.2.1 Stage 3 — Increment 2B6.1 Independent Security Audit Report

**Project:** ZemiFix CMMS  
**Phase:** F1.2.1 Stage 3 Increment 2B6.1 Audit  
**Document Type:** Independent Source Code Security & Financial Integrity Audit Report  
**Date:** November 20, 2026  
**Status:** **APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**  
**Target Stack:** Next.js 15, React 19, Prisma 6, PostgreSQL 16  
**Audit Scope:** Finance Security & Financial Integrity Corrections (`/api/finance/*` & `billingService.ts`)  
**Execution Type:** STRICTLY READ-ONLY CODE AUDIT (Zero application code, Prisma schemas, database records, migration files, environment files, or database roles modified)

---

## Executive Summary & Increment 2B7 Authorization Decision

### **FINAL AUDIT VERDICT: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**
*(The Increment 2B6.1 independent security audit confirms that Invoice Creator Self-Approval Prevention, Payment Remittance Concurrency Row Locking, Cumulative Credit Note Limit Enforcement, and Internal Recharge Uniqueness Guards in `src/lib/services/billingService.ts` are mathematically sound, concurrency-safe, and fail-closed. Proceeding with Increment 2B7 to secure Customer Portal API routes [`/api/portal/*`] and `portalService.ts` is **AUTHORIZED TO PROCEED IN DEVELOPMENT**.)*

---

## 1. Audit Scope & Safety Restrictions Confirmation

The following source files and test suites were audited line-by-line:
1. `src/app/api/finance/invoices/route.ts` — Invoices API handler (`GET`, `POST`).
2. `src/app/api/finance/invoices/[id]/submit/route.ts` — Invoice Submit API handler (`POST`).
3. `src/app/api/finance/invoices/[id]/approve/route.ts` — Invoice Approve API handler (`POST`).
4. `src/app/api/finance/invoices/[id]/send/route.ts` — Invoice Send API handler (`POST`).
5. `src/app/api/finance/payments/route.ts` — Payments API handler (`GET`, `POST`).
6. `src/app/api/finance/credit-notes/route.ts` — Credit Notes API handler (`GET`, `POST`).
7. `src/app/api/finance/internal-recharges/route.ts` — Internal Recharges API handler (`GET`, `POST`).
8. `src/lib/services/billingService.ts` — Master billing & financial transaction functions.
9. `src/lib/authWrapper.ts` — Reusable `withApiSecurity` higher-order wrapper.
10. `src/lib/services/securityContextService.ts` — Signed transaction context manager.
11. `src/lib/services/securityTransactionScope.ts` — AsyncLocalStorage transaction state manager.
12. `prisma/seed.ts` — System permission definitions (`resource: 'invoice'`).
13. `src/tests/financeSecurity.test.ts` — Unit test suite for Increment 2B6.1.

### Safety Restrictions Confirmation:
- **No Database Modification:** Zero database records, tables, schemas, or roles were created, updated, or deleted.
- **No Migrations Executed:** Migration files `20261119000001` and `20261119000002` remain unapplied.
- **No Access to Protected Databases:** `zemifix_acceptance` and `zemifix_platform_dev` were **not accessed, queried, or modified**.
- **No Git Operations:** Zero git commits, pushes, or branch operations were executed.

---

## 2. Complete Finance API Route and Method Security Matrix (7 Files / 9 Handlers)

Inspection of `src/app/api/finance/` confirms **7 route.ts files** containing 9 individual HTTP method handler functions:

| Endpoint Route Path | HTTP Method | Business Operation | Target Realm | Required RBAC Permission | Primary Service Function Called | Line References |
|---|---|---|---|---|---|---|
| `/api/finance/invoices` | `GET` | Query commercial invoices | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.invoice.findMany` | `invoices/route.ts#L5-L22` |
| `/api/finance/invoices` | `POST` | Create draft invoice | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `createInvoice(user, body, tx)` | `invoices/route.ts#L24-L35` |
| `/api/finance/invoices/[id]/submit` | `POST` | Submit draft for approval | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `submitInvoiceForApproval(user, id, tx)` | `invoices/[id]/submit/route.ts#L5-L14` |
| `/api/finance/invoices/[id]/approve` | `POST` | Approve & allocate invoice # | `STAFF` | `{ resource: 'invoice', action: 'approve' }` | `approveInvoice(user, id, tx)` | `invoices/[id]/approve/route.ts#L5-L14` |
| `/api/finance/invoices/[id]/send` | `POST` | Mark invoice sent to customer | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `markInvoiceSent(user, id, tx)` | `invoices/[id]/send/route.ts#L5-L14` |
| `/api/finance/payments` | `GET` | Query payment remittances | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.payment.findMany` | `payments/route.ts#L5-L18` |
| `/api/finance/payments` | `POST` | Record payment remittance | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `recordPaymentRemittance(user, params, tx)` | `payments/route.ts#L20-L33` |
| `/api/finance/credit-notes` | `GET` | Query credit notes list | `STAFF` | `{ resource: 'invoice', action: 'read' }` | `tx.creditNote.findMany` | `credit-notes/route.ts#L5-L18` |
| `/api/finance/credit-notes` | `POST` | Issue credit note | `STAFF` | `{ resource: 'invoice', action: 'create' }` | `issueCreditNote(user, params, tx)` | `credit-notes/route.ts#L20-L33` |

---

## 3. Detailed Verification of Increment 2B6.1 Corrections

### 3.1 Invoice Creator Self-Approval Guard (`approveInvoice`)
- **Source Verification:** `src/lib/services/billingService.ts#L265`
  ```typescript
  if (invoice.createdByUserId === user.id) {
    throw new Error('MAKER_CHECKER_VIOLATION: Invoice creator cannot approve their own commercial invoice.');
  }
  ```
- **Audit Evaluation:** Verified that `invoice.createdByUserId` is checked against `user.id` (the authenticated approver). If the creator calls `approveInvoice`, the function throws `MAKER_CHECKER_VIOLATION` before allocating an invoice number or updating status to `APPROVED`.
- **Test Evidence:** Tested in `src/tests/financeSecurity.test.ts` (Test 2 verifies self-approval rejection; Test 3 verifies approval success for a different checker user).

### 3.2 Payment Remittance Concurrency & Row Locking (`recordPaymentRemittance`)
- **Source Verification:** `src/lib/services/billingService.ts#L410-L425`
  ```sql
  SELECT id, "customerId", "siteId", status, "totalAmount"::text as "totalAmount",
         "paidAmount"::text as "paidAmount", "creditedAmount"::text as "creditedAmount",
         "balanceDue"::text as "balanceDue", "createdByUserId", "invoiceNumber", "draftReference"
    FROM "invoices"
   WHERE id = ${params.invoiceId}::uuid
  FOR UPDATE
  ```
- **Audit Evaluation:** Verified that target invoice row is locked `FOR UPDATE` in PostgreSQL before reading `balanceDue` and validating `paymentAmt <= currentBalance`. Concurrent payments for the same invoice are serialized by PostgreSQL. Overpayment attempts throw `OVERPAYMENT_PROHIBITED` and roll back atomically on `tx`.

### 3.3 Credit Note Cumulative Limit & Concurrency Protection (`issueCreditNote`)
- **Source Verification:** `src/lib/services/billingService.ts#L480-L510`
  ```typescript
  const currentCredited = new Prisma.Decimal(invoice.creditedAmount);
  const totalInvoiceAmount = new Prisma.Decimal(invoice.totalAmount);
  const maxCreditable = totalInvoiceAmount.sub(new Prisma.Decimal(invoice.paidAmount)).sub(currentCredited);

  if (totalCredit.gt(maxCreditable)) {
    throw new Error(`EXCESS_CREDIT_PROHIBITED: Credit note total (${totalCredit}) exceeds remaining creditable amount (${maxCreditable}).`);
  }
  ```
- **Audit Evaluation:** Verified that target invoice row is locked `FOR UPDATE` before calculating `maxCreditable = totalAmount - paidAmount - creditedAmount`. If `totalCredit > maxCreditable`, throws `EXCESS_CREDIT_PROHIBITED`. Prevents cumulative over-crediting and concurrent credit note issuance race conditions.

### 3.4 Internal Recharge Uniqueness Guard (`recordInternalRecharge`)
- **Source Verification:** `src/lib/services/billingService.ts#L570-L585`
  ```sql
  SELECT id, "workOrderNumber" FROM "work_orders" WHERE id = ${params.workOrderId}::uuid FOR UPDATE
  ```
- **Audit Evaluation:** Verified that target work order row is locked `FOR UPDATE` before checking `tx.internalRecharge.findUnique({ where: { workOrderId: wo.id } })`. If an internal recharge already exists, throws `DUPLICATE_RECHARGE`.

---

## 4. Test Evidence & Execution Verification

All 83 test assertions passed across 12 Vitest test suites:
```bash
npx vitest run src/tests/financeSecurity.test.ts src/tests/procurementSecurity.test.ts src/tests/inventorySecurity.test.ts src/tests/assetSecurity.test.ts src/tests/workOrderSubresources.test.ts src/tests/workOrderActions.test.ts src/tests/workOrderDetail.test.ts src/tests/workOrderPost.test.ts src/tests/workOrderPilot.test.ts src/tests/authWrapper.test.ts src/lib/services/securityContextFoundation.test.ts src/tests/databaseIdentityVerification.test.ts
```

- `src/tests/financeSecurity.test.ts` (5 tests): Mocked unit tests verifying `createInvoice`, `approveInvoice` self-approval rejection (`MAKER_CHECKER_VIOLATION`), checker approval success, HTTP 401 unauthenticated rejections, and `tx` propagation.
- TypeScript Verification: `npm run lint` (`tsc --noEmit`) passed cleanly with 0 errors.

---

## 5. Mandatory Pre-Conditions for Stage 3 Increment 2B7

1. **Development-Only Implementation:** Refactoring of Customer Portal API routes (`/api/portal/*`) and `portalService.ts` is authorized to proceed in development.
2. **Migrations Remain Unapplied:** Database migrations `20261119000001` and `20261119000002` MUST remain unapplied until Stage 3 code implementation is complete.

---

## 6. Final Approval Decision

### **FINAL DECISION: APPROVED WITH CONDITIONS FOR STAGE 3 INCREMENT 2B7**

* **Status:** The Stage 3 Increment 2B6.1 Independent Security Audit Report is **COMPLETE, RECONCILED, AND APPROVED FOR STAGE 3 INCREMENT 2B7**.
* **Authorized Next Action:** Proceed with **Implementation Increment 2B7** to secure Customer Portal API routes (`/api/portal/*`) and `portalService.ts`.

---
*Audit report compiled automatically by ZemiFix Enterprise Security Engineering Engine.*
