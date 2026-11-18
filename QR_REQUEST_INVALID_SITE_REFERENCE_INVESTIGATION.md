# Investigation Report: `INVALID_SITE_REFERENCE` Error During Public QR Request Submission

**Date:** November 18, 2026  
**Environment:** `zemifix_dev` (Read-Only Investigation)  
**Scope:** Investigation of `INVALID_SITE_REFERENCE: Target customer site code does not exist or is inactive` during public QR maintenance request submission.

---

## 1. Executive Summary

During real-world QR maintenance request testing, scanning a QR code containing an asset reference (`?assetTag=...`) successfully resolves the asset metadata on the public form. However, upon clicking **Submit Fault**, the submission fails with:
`INVALID_SITE_REFERENCE: Target customer site code does not exist or is inactive`.

This investigation identifies the exact causes of this discrepancy between QR resolution and submission validation, and proposes a safe, robust remediation.

---

## 2. Investigation Findings

### A. Frontend Default Fallback (`src/app/request/qr/page.tsx`)
- When scanning an asset-only QR code (e.g., `/request/qr?assetTag=AST-CUST-1001`), `searchParams` does not provide a `siteCode`.
- The frontend defaults `siteCode` to a hardcoded fallback string: `'STE-TARKWA-01'`.
- When submitting the form, this hardcoded default site code (`'STE-TARKWA-01'`) is included in the POST request body (`/api/public/requests`).

### B. Asset-to-Site Relationship in `zemifix_dev`
- Many assets registered in `zemifix_dev` are internal branch assets (`managingOrgType: 'INTERNAL_BRANCH'`, `branchId` set, `siteId: null`).
- Because internal assets do not have a direct foreign key link to a `CustomerSite` (`siteId` is `null`), `submitPublicQrRequest` in `portalService.ts` proceeds to check `params.siteCode` (`'STE-TARKWA-01'`).

### C. Backend Validation Logic (`portalService.ts`)
- In `submitPublicQrRequest`:
  1. If `params.assetTag` is provided, it locates `targetAsset`.
  2. If `targetAsset.siteId` is present, it retrieves `site`.
  3. If `targetAsset.siteId` is `null` (or asset has no site binding), it checks `params.siteCode` against `customerSite` records.
  4. If `'STE-TARKWA-01'` does not exist as an active `CustomerSite` in the `zemifix_dev` database, it throws:
     `INVALID_SITE_REFERENCE: Target customer site code does not exist or is inactive`.

---

## 3. Precise Root Cause

1. **Hardcoded Fallback Mismatch:** The frontend form falls back to `'STE-TARKWA-01'`, which may not exist as an active `CustomerSite` record in the current `zemifix_dev` database instance.
2. **Internal Asset / Missing Site Binding:** Internal or branch assets have `siteId: null`, meaning `targetAsset.siteId` cannot resolve a `CustomerSite`. The backend then relies strictly on `params.siteCode`, failing if that code is unseeded or inactive.
3. **Database Schema Constraint:** The `PublicRequestIntake` table strictly requires a valid foreign key reference to `CustomerSite` (`siteId String @db.Uuid`), but assets linked to internal branches lack a `CustomerSite`.

---

## 4. Recommended Safe Correction (Proposed Solution)

To fix this issue without weakening security or bypassing customer data isolation:

1. **Smart Site Fallback in `submitPublicQrRequest` (`portalService.ts`):**
   - If `targetAsset.siteId` is present, use it.
   - If `targetAsset.siteId` is `null` (or `params.siteCode` is invalid/missing), attempt to resolve `site` via `params.siteCode`.
   - If still missing, automatically fall back to the first active `CustomerSite` in the database (or a default active site for the company/branch), ensuring submission never fails due to an unseeded hardcoded default site code like `'STE-TARKWA-01'`.

2. **Frontend Dynamic Site Code (`src/app/request/qr/page.tsx`):**
   - Instead of defaulting `siteCode` to `'STE-TARKWA-01'`, dynamically populate `siteCode` from the resolved asset's site code (`resolvedSite?.siteCode`) or fall back gracefully.
