# Customer Portal Phase R2 — Invoice PDF Generation and Download Implementation Report

**Date:** November 18, 2026  
**Environment:** `zemifix_dev`  
**Scope:** Phase R2 implementation of professional PDF invoice generation, secure download API, and customer portal UI integration for ZemiFix CMMS.

---

## Executive Summary

This report documents the implementation of Phase R2 for the ZemiFix Customer Portal. Authenticated enterprise customers can now view and download professional, printable PDF invoices containing complete company details, customer organization billing addresses, itemized line items, Ghana statutory taxes (VAT 15%, NHIL 2.5%, GETFund 2.5%), payment status, amounts paid, and outstanding balances.

---

## 1. Files Created and Modified

1. **`src/app/api/portal/invoices/[id]/pdf/route.ts`** [NEW] — Secure customer-authenticated invoice PDF/print document endpoint enforcing strict tenant and site-level authorization.
2. **`src/app/portal/invoices/page.tsx`** [MODIFIED] — Added "View / Download PDF" action buttons to each invoice row in the customer billing table.

---

## 2. PDF Generation Architecture

- **Approach:** Server-side generation of a professionally styled HTML invoice document configured with dedicated print CSS (`@media print`) and an auto-trigger print script (`window.print()`). This allows users to instantly view, print, or save as PDF across all desktop and mobile browsers without requiring heavy external binary dependencies.
- **Content Included:**
  - **Company Information:** ZemiFix registered company name, legal name, address, and Ghana tax scheme info.
  - **Customer Information:** Customer organization name, billing address, and associated site details.
  - **Invoice Information:** Invoice number, issue date, due date, status, and linked Work Order reference.
  - **Itemized Line Items:** Description, quantity, unit price, and line total.
  - **Financial Summary:** Subtotal, VAT (15%), NHIL & GETFund (5%), total invoice amount, amount paid, and outstanding balance due.
  - **Payment Instructions:** Professional footer guidance referencing invoice numbers for bank/payment reconciliation.

---

## 3. Secure Download API Implementation

- **Route:** `GET /api/portal/invoices/[id]/pdf`
- **Security & Authorization Controls:**
  1. **Authentication:** Requires a valid, HMAC-signed customer portal session cookie (`zemifix_portal_session`) validated via `getCurrentPortalContact`.
  2. **Tenant Isolation:** Verifies that `invoice.customerId === contact.customerId`. Mismatched IDs return `403 Forbidden`.
  3. **Site-Level Access:** Verifies that if an invoice is tied to a `siteId`, it falls within the contact's authorized site grants (`getAuthorizedSiteIdsForContact`).
  4. **IDOR Prevention:** Returns `404 Not Found` for nonexistent or soft-deleted invoices.
  5. **Cache Control:** Sets `Cache-Control: no-store, private` to prevent private financial documents from being cached publicly.

---

## 4. UI/UX Changes

- Updated the Customer Invoices & Billing table (`/portal/invoices`) to include an action column with direct **"View / Download PDF"** buttons styled in ZemiFix Brand Orange (`#FF5B00`).

---

## 5. Test Results & Verification

- **TypeScript Compilation:** `npm run lint` (`tsc --noEmit`) passed with **0 errors**.
- **Integration Tests:** Existing workflow and QR request tests passed successfully (`vitest run`).

---

## 6. Limitations

- Relies on the browser's native print-to-PDF engine for generating local PDF files from the secure printable HTML view.

---

## 7. Manual Testing Instructions

1. Log into the Customer Portal at `/portal/login` using an authorized customer contact credential.
2. Navigate to **Invoices & Billing** (`/portal/invoices`).
3. Click **"View / Download PDF"** on any listed invoice.
4. Verify that the printable invoice document opens in a new tab, displays correct company and customer details, itemized lines, Ghana statutory tax breakdown, and prompts the print/save dialog.
5. Test direct IDOR protection by attempting to access an invoice ID belonging to another customer organization (verifying an immediate 403/404 rejection).
