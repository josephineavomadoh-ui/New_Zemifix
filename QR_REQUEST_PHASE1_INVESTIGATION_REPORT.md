# ZemiFix CMMS — Public QR Maintenance Request Phase 1 Investigation Report

**Date of Investigation**: November 17, 2026  
**Investigation Scope**: Comprehensive audit of Public QR Intake, Middleware, Prisma Models, Public API Routes, Work Request Services, and Planner Review Workflows.  
**Target Environment**: `zemifix_dev` (Development Environment)

---

## 1. Executive Summary

A comprehensive investigation of the **R1 Public QR Maintenance Request Feature** in ZemiFix CMMS was conducted. The underlying database models (`PublicRequestIntake`, `WorkRequest`, `CustomerSite`, `Asset`, `Location`), public submission service (`submitPublicQrRequest`), and Work Order conversion service (`reviewWorkRequest`) are already defined. However, several critical integration gaps were identified:

1. **Middleware Security Redirection**: `/request/qr` was omitted from `PUBLIC_PATHS` in `src/middleware.ts`, causing anonymous users scanning QR codes to be redirected to `/login`.
2. **Dynamic URL & Metadata Resolution**: The public QR page (`src/app/request/qr/page.tsx`) hardcoded site code state (`'STE-TARKWA-01'`) and lacked automatic query parameter resolution (`?siteCode=...&assetTag=...` or `?token=...`).
3. **Public Photo Attachment Upload**: No public photo upload endpoint existed to safely validate MIME types (`image/jpeg`, `image/png`, `image/webp`) and file sizes (max 10MB) for public reporters.
4. **Planner Review Integration**: Public intake submissions (`PublicRequestIntake` with status `RECEIVED`) were created in PostgreSQL, but were not integrated into the main Staff Triage & Review view (`/requests`), preventing Planners from converting public intake records into `WorkRequest` or `WorkOrder` items.

---

## 2. Component Investigation Matrix

| Component / Feature | Current Implementation Status | File Location | Gaps / Action Required |
| :--- | :--- | :--- | :--- |
| **Public QR Page Route** | `PARTIALLY IMPLEMENTED` | `src/app/request/qr/page.tsx` | Needs URL search parameter parsing, brand UI overhaul, public metadata fetch, and photo attachment upload |
| **Middleware Public Access** | `INCOMPLETE` | `src/middleware.ts` | `/request/qr` and `/api/public/` must be added to `PUBLIC_PATHS` allowlist |
| **Public Intake API Route** | `PARTIALLY IMPLEMENTED` | `src/app/api/public/requests/route.ts` | Enforces IP rate limiting; needs photo upload integration & input schema validation |
| **Public Metadata Resolve API** | `NOT IMPLEMENTED` | `src/app/api/public/qr/resolve/route.ts` | Must return non-sensitive site & asset details for scanned QR parameters |
| **Public Photo Upload API** | `NOT IMPLEMENTED` | `src/app/api/public/upload/route.ts` | Must validate MIME types (`image/*`) and file size limits (<= 10MB) |
| **Prisma Model `PublicRequestIntake`** | `FULLY IMPLEMENTED` | `prisma/schema.prisma` | Model exists mapping to `public_request_intake` table |
| **Public Request Intake Service** | `PARTIALLY IMPLEMENTED` | `src/lib/services/portalService.ts` | `submitPublicQrRequest()` handles DB site/asset resolution & 5/hr rate limits; needs branch/location support |
| **Work Request Model & Service** | `FULLY IMPLEMENTED` | `src/lib/services/workRequestService.ts` | `createWorkRequest()` and `reviewWorkRequest()` handle `CONVERT` and `REJECT` actions |
| **Planner Triage & Review UI** | `PARTIALLY IMPLEMENTED` | `src/app/requests/page.tsx` | Displays internal `WorkRequest` items; needs `PublicRequestIntake` section with approve/convert triggers |

---

## 3. Intended End-to-End Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Public Mobile QR Scanner                        │
│                                                                        │
│  User scans QR Code on Equipment/Site Asset Label                     │
│  URL: https://cmms.zemifix.local/request/qr?siteCode=STE-TARKWA-01...  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Public Request Intake Page                        │
│                     (src/app/request/qr/page.tsx)                      │
│                                                                        │
│  - Allowed through Middleware (no /login redirect)                     │
│  - Fetches non-sensitive site/asset info via /api/public/qr/resolve     │
│  - Collects Reporter Name, Phone, Email, Problem Description, Photo    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Public API & Services                          │
│                                                                        │
│  - POST /api/public/upload   (Validates photo size <=10MB & MIME)     │
│  - POST /api/public/requests (Applies 10/min IP & 5/hr DB rate limit)  │
│  - portalService.ts          (Creates PublicRequestIntake record)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database (zemifix_dev)                 │
│                                                                        │
│  Table: public_request_intake (status: 'RECEIVED')                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Staff Triage & Review Workspace                   │
│                         (src/app/requests/page.tsx)                    │
│                                                                        │
│  - Authorized Planner reviews incoming public intake requests          │
│  - Options: Reject (with reason) OR Convert to Work Order / Request    │
│  - Calls reviewWorkRequest() in workRequestService.ts                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Technician PWA / Execution                        │
│                      (Work Order Status: OPEN)                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Required Implementation Plan (Phases 2 – 7)

1. **Phase 2 — Public QR Request Experience & Middleware**:
   - Add `/request/qr` and `/api/public/` to `PUBLIC_PATHS` in `src/middleware.ts`.
   - Upgrade `src/app/request/qr/page.tsx` with dynamic URL parameter parsing, ZemiFix brand styling (#0B1336 Navy, #FF5B00 Safety Orange), photo upload control, and auto-resolved site/asset context.
2. **Phase 3 — QR Identification & Metadata Resolution**:
   - Create `GET /api/public/qr/resolve` to look up site and asset metadata using non-sensitive codes (`siteCode`, `assetTag`) without exposing internal DB UUIDs or confidential parameters.
   - Support QR code preview/print interface in Asset Details (`src/app/dashboard/assets/[id]/page.tsx`).
3. **Phase 4 — Request Submission & File Upload**:
   - Create `POST /api/public/upload` supporting public photo uploads with strict MIME type (`image/jpeg`, `image/png`, `image/webp`) and file size limits (<= 10MB).
   - Update `submitPublicQrRequest` in `portalService.ts` to support both customer sites and internal branch/location tags.
4. **Phase 5 — Planner Review & Conversion**:
   - Update `src/lib/services/workRequestService.ts` to support listing and converting `PublicRequestIntake` items into `WorkRequest` and `WorkOrder` records.
   - Update `src/app/requests/page.tsx` and `src/components/requests/RequestsView.tsx` so Planners can view, reject, or convert public intake items with 1-click idempotency protection.
5. **Phase 6 — Security & Access Control**:
   - Enforce IP rate limiting and DB anti-spam rate limiting.
   - Revalidate site/asset active state (`isActive: true`, `deletedAt: null`).
   - Protect all internal staff APIs.
6. **Phase 7 — Automated & Integration Testing**:
   - Write comprehensive unit/integration test suite (`src/tests/qrRequestWorkflow.test.ts`).
   - Run TypeScript static analysis (`analyze_file`).
