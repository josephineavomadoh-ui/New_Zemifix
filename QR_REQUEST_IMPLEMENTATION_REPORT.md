# ZemiFix CMMS — Public QR Maintenance Request Implementation Report

**Date of Implementation**: November 17, 2026  
**Module**: R1 Public QR Maintenance Request Feature  
**Target Environment**: `zemifix_dev` (Development Environment)

---

## 1. Executive Summary

The **R1 Public QR Maintenance Request Feature** has been completed. The architecture follows ZemiFix's modular monolith design:

```
Public Mobile QR Scanner → /request/qr → /api/public/requests → portalService.ts → PostgreSQL (public_request_intake) → Planner Review (/requests) → Work Order → Technician PWA
```

Anonymous public users can scan a QR code on any equipment or customer site label, open the mobile-optimized request form without logging in, view pre-resolved site/asset details, attach a photo, and submit a maintenance fault report.

Authorized Planners review incoming public intake reports in the main ZemiFix system (`/requests`), inspect evidence photos and reporter details, and convert verified reports into active Work Orders (or reject/mark spam) with 1-click idempotency protection.

---

## 2. Implemented Components & Files

### A. Middleware Security Configuration
- **File**: `src/middleware.ts`
- **Changes**: Added `/request/qr`, `/request`, and `/api/public` to `PUBLIC_PATHS` allowlist.
- **Result**: Anonymous public users scanning QR codes are granted direct access to the intake form without being redirected to `/login`. Staff management routes remain protected by session cookies.

### B. Public QR Intake Experience & Brand UI
- **File**: `src/app/request/qr/page.tsx`
- **Design**: Built with ZemiFix visual identity (`#0B1336` Navy background, `#FF5B00` Safety Orange accent buttons, white cards, responsive mobile container).
- **URL Parameter Resolution**: Parses `siteCode`, `assetTag`, or `locationCode` from query parameters (`?siteCode=...&assetTag=...`).
- **Dynamic Context Display**: Automatically fetches non-sensitive site/asset metadata from `/api/public/qr/resolve` so users see their physical equipment/site context instead of raw IDs.
- **Photo Upload**: Supports immediate photo evidence selection & upload via `POST /api/public/upload`.

### C. Public Metadata & Upload API Routes
- **`GET /api/public/qr/resolve/route.ts`**: Resolves `siteCode`, `assetTag`, or `locationCode` to non-sensitive site/asset names and addresses without exposing database UUIDs. Enforces rate limiting (30 requests/min).
- **`POST /api/public/upload/route.ts`**: Public file upload endpoint enforcing MIME validation (`image/jpeg`, `image/png`, `image/webp`), max 10MB size limit, path traversal guards, and rate limiting (5 uploads/min/IP).
- **`GET /api/public/uploads/[filename]/route.ts`**: Serves uploaded public photo attachments safely with content-type headers.

### D. Public Intake Service & Idempotency
- **File**: `src/lib/services/portalService.ts` (`submitPublicQrRequest`)
- **Validation**: Resolves `siteCode` to active `CustomerSite` or branch. Resolves `assetTag` to active `Asset`. Rejects inactive or non-existent sites/assets.
- **Idempotency Guard**: Checks `idempotencyKey` to return existing intake on duplicate POST requests.
- **Anti-Spam Rate Limit**: Enforces maximum 10 submissions per IP per hour.

### E. Planner Review & Work Order Conversion Engine
- **Files**:
  - `src/lib/services/workRequestService.ts` (`getPublicRequestIntakes`, `processPublicRequestIntake`)
  - `src/app/api/requests/public/route.ts`
  - `src/app/api/requests/public/[id]/review/route.ts`
  - `src/app/requests/page.tsx`
- **Functionality**:
  - **Triage Queue**: Displays incoming public intake items alongside internal work requests in `/requests`.
  - **Single-Click Conversion**: Planner converts a public intake item into an active `WorkOrder` (`status = 'OPEN'`, `type = 'CORRECTIVE'`).
  - **Evidence Attachment**: Automatically creates a `WorkOrderAttachment` from the public photo (`[BEFORE] Public Fault Photo`).
  - **Idempotency Protection**: Re-processing a converted or rejected intake throws `FINALIZED_INTAKE`, preventing duplicate Work Orders.

---

## 3. Summary of Files Created and Modified

| File Path | Status | Description |
| :--- | :--- | :--- |
| `src/middleware.ts` | `MODIFIED` | Added `/request/qr` and `/api/public` to `PUBLIC_PATHS` |
| `src/app/request/qr/page.tsx` | `MODIFIED` | Complete public QR request form with brand UI & photo upload |
| `src/app/api/public/qr/resolve/route.ts` | `NEW` | Public QR metadata resolution endpoint |
| `src/app/api/public/upload/route.ts` | `NEW` | Public photo upload endpoint with MIME & 10MB size checks |
| `src/app/api/public/uploads/[filename]/route.ts` | `NEW` | Safe photo server route |
| `src/lib/services/portalService.ts` | `MODIFIED` | Updated `submitPublicQrRequest` with reference validation & rate limits |
| `src/lib/services/workRequestService.ts` | `MODIFIED` | Added `getPublicRequestIntakes()` and `processPublicRequestIntake()` |
| `src/app/api/requests/public/route.ts` | `NEW` | GET endpoint for Planner public intake queue |
| `src/app/api/requests/public/[id]/review/route.ts` | `NEW` | POST endpoint for Planner public intake conversion & review |
| `src/app/requests/page.tsx` | `MODIFIED` | Added Public QR Intake Queue tab & conversion actions |
| `src/tests/qrRequestWorkflow.test.ts` | `NEW` | Integration test suite verifying end-to-end QR request workflow |
