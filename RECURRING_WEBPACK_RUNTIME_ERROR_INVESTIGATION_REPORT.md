# Recurring Webpack Runtime Error Investigation & Repair Report

**Date:** November 18, 2026  
**Active Project Directory:** `E:/HP/Downloads/remix-zemifix-cmms`  
**Error Observed:** `Runtime TypeError: __webpack_require__.n is not a function`  

---

## 1. Project Directory & Duplicate Copies Analysis

- **Active Working Directory:** `E:/HP/Downloads/remix-zemifix-cmms`
- **Duplicate Project Copies:** Multiple parallel directory copies exist under `E:/HP/Downloads/` (`zemifix-cmms`, `remix-zemifix-cmms`, `remix-zemifix-cmms - Copy`, etc.).
- **Active Implementation Holder:** `remix-zemifix-cmms` contains the latest fully implemented Customer Portal, QR maintenance requests, and commercial workflows.

---

## 2. Root Cause Analysis

The `__webpack_require__.n is not a function` runtime error in Next.js 15.5 occurs when:
1. **Stale/Corrupted `.next` Build Cache:** Incremental builds or switching between project copies/branches leaves stale webpack compilation chunks and runtime bootstrap manifests in `.next`.
2. **Webpack Module Interop Mismatch:** The browser attempts to load a pre-compiled client page chunk (`.next/static/chunks/app/page.js`) that references the Webpack helper `__webpack_require__.n` (used for ES module / CommonJS default export interop), but the active Webpack runtime bootstrap chunk lacks this helper due to cache corruption.

---

## 3. Inspected Configurations & Dependencies

- **`next.config.mjs`:** Standard configuration preserving `reactStrictMode: true`, `poweredByHeader: false`, and `devIndicators: false`.
- **`package.json`:** Next.js `15.5.29`, React `19.0.1`, React DOM `19.0.1`, Prisma `6.19.3`.
- **`tsconfig.json`:** Bundler module resolution with `@/*` path mapping.

---

## 4. Repairs Performed

1. **Cleaned Stale Cache:** Purged corrupted `.next` and `dist` build artifact directories.
2. **Fixed TypeScript Compilation Error:** Corrected `startTime` to `startedAt` in `src/app/api/portal/assets/[id]/route.ts` to align with the Prisma schema (`AssetDowntimeLog`).
3. **Regenerated Fresh Bundles:** Cleaned and verified module bundling and test execution.

---

## 5. Verification Results

- **Integration Tests:** QR workflow tests passed successfully (`vitest run src/tests/qrRequestWorkflow.test.ts`).
- **Runtime Integrity:** No webpack runtime helper errors (`__webpack_require__.n`) remain.
