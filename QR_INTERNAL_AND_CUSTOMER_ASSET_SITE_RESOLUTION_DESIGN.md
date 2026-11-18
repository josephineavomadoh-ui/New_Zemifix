# Architectural Design: Internal vs. Customer Asset QR Site & Branch Resolution

**Date:** November 18, 2026  
**Environment:** `zemifix_dev` (Read-Only Architectural Design)  
**Scope:** Architectural design for resolving internal branch assets vs. customer-site assets during public QR maintenance request intake and preventing `INVALID_SITE_REFERENCE` errors without violating tenant isolation or using arbitrary site fallbacks.

---

## 1. Executive Summary

ZemiFix CMMS supports dual operating modes: **Facility Mode** (internal company branches, departments, and equipment) and **Contractor Mode** (external commercial customer sites and customer-owned assets). 

Currently, the public QR maintenance request intake (`PublicRequestIntake`) rigidly requires a foreign key relation to `CustomerSite` (`siteId`). When a user scans a QR code for an internal company/branch asset (which possesses a `branchId` but no `CustomerSite`), the submission fails with `INVALID_SITE_REFERENCE` or attempts to fall back to a hardcoded site code (`'STE-TARKWA-01'`). 

This document defines the correct architectural design to resolve internal branch assets versus customer-site assets securely and robustly.

---

## 2. Prisma Model Analysis

| Model | Key Foreign Keys & Fields | Purpose / Domain |
| :--- | :--- | :--- |
| **`Asset`** | `branchId`, `locationId`, `siteId`, `physicalSiteCustomerId`, `managingOrgType` | Represents physical equipment. Can be internal (`branchId`) or customer-owned (`siteId`). |
| **`Branch`** | `id`, `code`, `name`, `path` | Internal organizational hierarchy (Facility Mode). |
| **`CustomerSite`** | `id`, `customerId`, `siteCode`, `name` | External client properties serviced under contract (Contractor Mode). |
| **`PublicRequestIntake`** | `siteId` (Required FK to `CustomerSite`), `assetId` | Public intake queue for QR requests. Currently mandates a `CustomerSite`. |
| **`WorkOrder`** | `siteId`, `assetId`, `branchId`, `customerId` | Active maintenance work order. Supports both internal branch execution and customer billing. |

---

## 3. Distinguishing Internal vs. Customer Assets

ZemiFix distinguishes asset operational contexts via:
1. **`managingOrgType`**: 
   - `'INTERNAL_BRANCH'` → Managed internally by company branches/departments.
   - `'EXTERNAL_CONTRACTOR'` → Managed for/by an external customer.
2. **Placement Foreign Keys**:
   - Internal Assets have `branchId` (and optional `locationId`) populated, while `siteId` and `physicalSiteCustomerId` are `NULL`.
   - Customer Site Assets have `siteId` and `physicalSiteCustomerId` populated, pointing to a valid `CustomerSite`.

---

## 4. Architectural Workflows for Work Order Conversion

### Scenario A: Internal Branch Asset QR Request
1. **Scan:** User scans QR code on an internal substation transformer (`AST-INTERNAL-01`).
2. **Resolution:** `/api/public/qr/resolve` identifies the asset, its managing/physical `branch`, and returns branch metadata.
3. **Submission:** User submits description. Instead of requiring a non-existent `CustomerSite`, the intake associates with the asset's owning `branchId` (or an optional nullable `siteId`).
4. **Planner Conversion:** Planner reviews intake in queue and converts to a WorkOrder where `branchId` is set to the asset's branch, `assetId` is set, and `siteId` is `null`.

### Scenario B: Customer-Site Asset QR Request
1. **Scan:** User scans QR code on a client mining asset (`AST-CUST-1001`).
2. **Resolution:** `/api/public/qr/resolve` identifies the asset and its associated `CustomerSite`.
3. **Submission:** User submits description. Intake stores `siteId` pointing to the valid `CustomerSite`.
4. **Planner Conversion:** Planner converts to a WorkOrder with `siteId`, `customerId`, and `assetId` correctly populated for billing and SLA tracking.

---

## 5. Recommended Robust Solution

1. **Eliminate Hardcoded Fallbacks:** Remove all fallback reliance on hardcoded site codes (such as `'STE-TARKWA-01'`).
2. **Context-Aware Validation in `submitPublicQrRequest` (`portalService.ts`):**
   - Inspect `targetAsset`:
     - If `targetAsset.siteId` is present, resolve and validate against `CustomerSite`.
     - If `targetAsset.managingOrgType === 'INTERNAL_BRANCH'` or `targetAsset.branchId` is present (internal asset), allow intake without requiring a `CustomerSite`.
3. **Preserve Customer Isolation:** External customer assets must always resolve to their authorized `CustomerSite`. Internal assets route through their owning `Branch`.

---

## 6. Schema Change Assessment

- **Current Limitation:** `PublicRequestIntake` has `siteId String @db.Uuid`, which enforces a mandatory foreign key to `CustomerSite`.
- **Proposed Schema Adjustment (Requires Approval):**
  - Make `siteId` optional (`siteId String? @db.Uuid`).
  - Add optional `branchId String? @db.Uuid` (foreign key to `Branch`) to `PublicRequestIntake`.
  - This allows internal branch maintenance requests to be stored and processed without violating foreign key constraints or assigning unrelated customer sites.

---

## 7. Required Acceptance Tests

1. Submit a public QR request for an internal branch asset and verify successful intake storage with owning branch reference.
2. Submit a public QR request for a customer site asset and verify successful intake storage linked to the correct `CustomerSite`.
3. Verify that unmapped or invalid asset/site references are correctly rejected with 404/400 without falling back to unrelated customer sites.
