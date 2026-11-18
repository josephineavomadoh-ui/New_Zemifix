# ZemiFix CMMS — Ngrok CSRF Trusted Origin Fix Report

**Date of Investigation**: November 17, 2026  
**Issue Reported**: `CSRF_VALIDATION_FAILED: Request origin is untrusted.` when authenticating or submitting API requests through temporary HTTPS tunnel `https://underfoot-monument-morphing.ngrok-free.dev`.  
**Resolution**: Added environment-driven trusted development origins configuration (`ADDITIONAL_TRUSTED_ORIGINS`) while retaining exact origin validation, preventing wildcards, and preserving all production CSRF protections.

---

## 1. Root Cause Analysis

- **Location**: `src/middleware.ts`
- **Mechanism**:
  - The middleware inspects the HTTP `origin` header for state-changing HTTP mutation requests (`POST`, `PUT`, `PATCH`, `DELETE`) targeting `/api/*` endpoints.
  - Previously, `TRUSTED_ORIGIN` was evaluated solely from `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'` alongside local `localhost:*` pattern matching.
  - When accessing the application via the ngrok HTTPS tunnel (`https://underfoot-monument-morphing.ngrok-free.dev`), the mobile browser transmits an `origin` header of `https://underfoot-monument-morphing.ngrok-free.dev`.
  - Because `https://underfoot-monument-morphing.ngrok-free.dev` did not match `http://localhost:3000` or `localhost:*`, the middleware rejected the request with HTTP 403 `CSRF_VALIDATION_FAILED: Request origin is untrusted.`.

---

## 2. Configuration & Architecture Fix

### A. Environment-Driven Trusted Origins (`ADDITIONAL_TRUSTED_ORIGINS`)
- Updated `src/lib/env.ts` to validate an optional `ADDITIONAL_TRUSTED_ORIGINS` environment variable.
- Updated `src/middleware.ts` with `getTrustedOrigins()` helper. It reads `NEXT_PUBLIC_APP_URL` and parses comma-separated explicit URLs from `process.env.ADDITIONAL_TRUSTED_ORIGINS`.

### B. Security & Safety Compliance
- **No Wildcards**: Rejects wildcard patterns (e.g., `*.ngrok-free.dev` is **not** accepted). Only exact explicit origins added to `ADDITIONAL_TRUSTED_ORIGINS` or `NEXT_PUBLIC_APP_URL` are trusted.
- **CSRF Protection Preserved**: All HTTP mutation requests (`POST`, `PUT`, `PATCH`, `DELETE`) on `/api/*` routes continue to require a trusted origin.
- **Untrusted Rejection**: Unrelated untrusted origins (e.g., `https://evil-untrusted-hacker.com` or non-configured ngrok tunnels) are strictly rejected with HTTP 403.
- **Localhost Backward Compatibility**: `http://localhost:*` and `https://localhost:*` remain trusted for local development.

---

## 3. Files Modified & Created

| File Path | Action | Description |
| :--- | :--- | :--- |
| `src/lib/env.ts` | `MODIFIED` | Added `ADDITIONAL_TRUSTED_ORIGINS` schema validation |
| `src/middleware.ts` | `MODIFIED` | Added `getTrustedOrigins()` and updated origin check logic |
| `.env.example` | `MODIFIED` | Documented `ADDITIONAL_TRUSTED_ORIGINS` usage for temporary dev tunnels |
| `src/tests/middleware/csrfOrigin.test.ts` | `NEW` | Unit test suite for CSRF origin validation and trusted dev origins |
| `NGROK_CSRF_TRUSTED_ORIGIN_FIX_REPORT.md` | `NEW` | Fix investigation & acceptance report |

---

## 4. Tests Executed & Actual Results

### A. Automated Middleware Unit Test Suite (`src/tests/middleware/csrfOrigin.test.ts`)
Executed `npx vitest run src/tests/middleware/csrfOrigin.test.ts`:

```
 RUN  v2.1.9 E:/HP/Downloads/remix-zemifix-cmms

 ✓ src/tests/middleware/csrfOrigin.test.ts (6)
   ✓ CSRF Request Origin Validation in Middleware (6)
     ✓ 1. Correctly parses trusted origins from environment variables
     ✓ 2. Permits mutation requests originating from http://localhost:3000
     ✓ 3. Permits mutation requests originating from trusted ngrok origin
     ✓ 4. Rejects mutation requests originating from untrusted third-party origins with 403
     ✓ 5. Rejects mutation requests from unlisted ngrok domains with 403 (No Wildcard Bypasses)
     ✓ 6. Allows read-only GET requests on API routes regardless of origin header

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  15:37:31
   Duration  12.68s
```

### B. Regression Test Suites
- **PWA Vitest Suite (`src/tests/pwa/`)**: **33 passed, 0 failed** across 7 test files.
- **Stage D4 Procurement Integration Suite (`scripts/test_stage_d4.ts`)**: **26 passed, 0 failed**.
- **Static Code Analysis (`analyze_file`)**: **0 errors**.

---

## 5. How to Configure Your Temporary Ngrok Origin

To test your temporary ngrok URL (`https://underfoot-monument-morphing.ngrok-free.dev`), add the following line to your local `.env` file (or export it in your environment):

```env
ADDITIONAL_TRUSTED_ORIGINS=https://underfoot-monument-morphing.ngrok-free.dev
```

If your ngrok domain changes in a future session, simply update `ADDITIONAL_TRUSTED_ORIGINS` in `.env` without modifying application source code.
