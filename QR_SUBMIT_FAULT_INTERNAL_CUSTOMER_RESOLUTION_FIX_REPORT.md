# QR Submit Fault Internal & Customer Asset Resolution Fix Report

**Date:** November 18, 2026  
**Environment:** `zemifix_dev`  
**Scope:** Phase 1 to Phase 5 Implementation & Verification of the Public QR Maintenance Request Resolution & Submission Fix for Internal Branch & Customer-Site Assets.

---

## Executive Summary

This report documents the successful implementation of the approved architectural solution addressing the `INVALID_SITE_REFERENCE` error during public QR maintenance request submissions. The fix supports both **Facility Mode** (internal company branch assets) and **Contractor Mode** (customer site assets) securely on the server without introducing unsafe fallbacks or violating customer tenant isolation.

---

## 1. Root Cause Addressed

- **Previous Issue:** Public QR requests for internal branch assets (which have a `branchId` but `siteId: null`) failed submission validation because `PublicRequestIntake` rigidly required a foreign key to `CustomerSite` (`siteId`), and the frontend form submitted a hardcoded default site code (`'STE-TARKWA-01'`).
- **Resolution:** Made `siteId` optional on `PublicRequestIntake`, added an optional `branchId` referencing `Branch`, removed the hardcoded frontend fallback, and updated server-side submission logic to correctly associate internal assets with their owning `branchId` and customer assets with their valid active `CustomerSite`.

---

## 2. Schema Changes & Migration

- **Prisma Schema Updates:**
  - `PublicRequestIntake`: Made `siteId String? @db.Uuid` optional; added `branchId String? @db.Uuid` with relation to `Branch`.
  - `Branch`: Added inverse relation `publicIntakes PublicRequestIntake[]`.
- **Migration Name:** `20261118000001_add_branch_id_to_public_request_intake`
- **Database Used:** `zemifix_dev` (Applied successfully via non-destructive SQL execution without database reset or data loss).

---

## 3. Files Changed

1. **`prisma/schema.prisma`** — Added `branchId` and optional `siteId` to `PublicRequestIntake`.
2. **`src/app/request/qr/page.tsx`** — Removed hardcoded `'STE-TARKWA-01'` fallback; dynamically utilizes site or branch context from QR resolution.
3. **`src/lib/services/portalService.ts`** — Updated `submitPublicQrRequest` to validate and store either `siteId` (for customer assets) or `branchId` (for internal branch assets) server-side without arbitrary fallbacks.
4. **`src/lib/services/workRequestService.ts`** — Updated `getPublicRequestIntakes` and `processPublicRequestIntake` to handle internal branch Intakes and convert them into Work Orders with the correct `branchId` and `siteId: null`.
5. **`src/tests/qrRequestWorkflow.test.ts`** — Added automated test coverage (Test 7) verifying internal branch asset QR request submission and Planner conversion to Work Order.

---

## 4. Test Results

- **TypeScript Compilation:** `npm run lint` (`tsc --noEmit`) passed with **0 errors**.
- **Automated Integration Tests:** All 7 test cases in `qrRequestWorkflow.test.ts` passed successfully (`vitest run`).

---

## 5. Security & Tenant Isolation Considerations

- **Server-Side Verification:** All asset, site, and branch associations are derived and validated on the server. Client-supplied IDs are never blindly trusted.
- **No Arbitrary Fallbacks:** The system never assigns a request to an arbitrary customer site or falls back to the first active customer site.
- **Tenant Isolation:** External customer assets remain strictly isolated to their authorized `CustomerSite` records, while internal assets correctly route through their owning branches.
