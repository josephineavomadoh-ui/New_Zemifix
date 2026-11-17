# ZemiFix CMMS — Technician PWA Phase 3 Implementation Report

**Date**: November 17, 2026  
**Implementation Phase**: Phase 3 — Photo Attachment Synchronization  
**Target Application**: ZemiFix Technician PWA (`/pwa`)

---

## 1. Executive Summary

Phase 3 of the ZemiFix Technician PWA implementation has been completed. The **Photo Attachment Synchronization Pipeline** has been implemented, providing field technicians with dual photo selection options (mobile camera capture vs gallery selection), image preview and removal before submission, description/caption tagging, and evidence classification (`BEFORE` Repair, `AFTER` Repair, and `GENERAL` Condition).

Offline photos are persisted durably as IndexedDB blobs in the `pendingPhotos` store, complete with UUIDv7 identifiers, captions, and evidence stage tags. When connectivity is restored, `uploadPendingPhotos()` uploads queued photos via multipart `FormData` to `/api/work-orders/[id]/attachments`, updating attachment records in PostgreSQL and removing uploaded blobs from client storage upon server confirmation. Failed uploads are safely retained for automatic retry.

All 30 Vitest unit tests across 6 test suites in the PWA module passed (100% pass rate).

---

## 2. Existing Infrastructure Reused

Phase 3 reused ZemiFix's core database models, file storage, and backend services without schema modifications or duplicate file stores:

- **Prisma Model**: `WorkOrderAttachment` (`id`, `workOrderId`, `uploaderUserId`, `fileName`, `fileUrl`, `fileSize`, `mimeType`).
- **File Storage**: Local filesystem storage in `storage/uploads/work-orders/` with path traversal prevention.
- **Backend API**: `POST /api/work-orders/[id]/attachments` with `getScopedWorkOrderFilter(user)` authorization.
- **Offline Storage**: IndexedDB `pendingPhotos` object store in `ZemiFixTechnicianPwaDB` (v2).
- **Sync Infrastructure**: `uploadPendingPhotos()` in `src/lib/pwa/offlineSyncManager.ts`.

---

## 3. Camera & Gallery Capture Functionality

Upgraded the Photo Evidence card in `src/app/pwa/work-orders/[id]/page.tsx`:

- **Dual Selection Options**:
  - **Take Photo**: Camera capture trigger (`<input type="file" accept="image/*" capture="environment" />`).
  - **Select Gallery**: Mobile device gallery picker (`<input type="file" accept="image/*" />`).
- **Pre-Upload Image Preview**: Preview thumbnail rendered upon selection with dimensions and a clear/discard button (`handleRemoveSelectedPhoto`).
- **Photo Caption / Description**: Text input field (`photoCaption`) allowing technicians to enter explanatory notes (e.g. *"Cracked motor casing seal"*).
- **Evidence Classification**: Dropdown selector (`evidenceType`) classifying photos into `BEFORE` (Before Repair), `AFTER` (After Repair), or `GENERAL` (General Condition).
- **Attachments Display**: Lists both server-uploaded attachments (`wo.attachments`) and pending offline photo uploads (`queuedPhotos`).

---

## 4. Offline Persistence & Storage

- **IndexedDB `pendingPhotos` Store**: Selected photo files or blobs are saved durably using `addPendingPhoto()` with the following schema:
  - `localId`: UUIDv7 unique identifier.
  - `workOrderId`: Target work order identifier.
  - `blob`: Raw image binary Blob.
  - `mimeType`: Image MIME type (`image/jpeg`, `image/png`, `image/webp`).
  - `fileName`: Original file name.
  - `caption`: Description text string.
  - `evidenceType`: Stage classification (`BEFORE`, `AFTER`, `GENERAL`).
  - `capturedAt`: Timestamp.
  - `uploadStatus`: `'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED'`.
- **Durable Retention**: Photos remain stored in IndexedDB until server receipt is explicitly confirmed.

---

## 5. Upload & Synchronization Behavior

- **Sync Drains**: `uploadPendingPhotos()` drains both `'PENDING'` and `'FAILED'` photo records when online.
- **Multipart Form Payload**: Constructs `FormData` with fields:
  - `file`: Image binary blob.
  - `caption`: Description string.
  - `evidenceType`: Stage classification tag.
- **Server File Labeling**: `POST /api/work-orders/[id]/attachments` formats the `WorkOrderAttachment.fileName` as `[${evidenceType}] ${caption || file.name}` (e.g. `[BEFORE] Cracked motor casing seal`).
- **Safe State Transitions**:
  1. Status set to `UPLOADING` before fetch execution.
  2. On HTTP 201 Created: Local record deleted via `deletePendingPhoto(localId)`.
  3. On Network/Server Error: Status set to `FAILED` with error text saved, retaining the photo blob for retry.
- **Session Expiry Handling**: HTTP 401 response sets `sessionExpired: true`, pausing uploads until re-authentication.

---

## 6. Security Controls

- **Authentication**: Reuses HTTP-only session cookies (`/api/auth/me`).
- **Work Order Authorization**: `POST /api/work-orders/[id]/attachments` enforces `getScopedWorkOrderFilter(user)`, rejecting unauthorized foreign branch attachments.
- **File Validation**: Enforces MIME type allowlist (`image/jpeg`, `image/png`, `image/webp`) and a 10 MB maximum file size limit.
- **Path Traversal Guard**: Filenames sanitized and verified against upload directory bounds (`storage/uploads/work-orders/`).

---

## 7. Files Created and Modified

| File Path | Status | Purpose |
| :--- | :--- | :--- |
| `src/app/pwa/work-orders/[id]/page.tsx` | `MODIFIED` | Dual camera/gallery inputs, image preview, removal button, captioning, evidence tagging |
| `src/lib/pwa/db.ts` | `MODIFIED` | Added `caption` and `evidenceType` to `PendingPhoto` interface |
| `src/lib/pwa/offlineSyncManager.ts` | `MODIFIED` | Updated `uploadPendingPhotos()` to retry `FAILED` uploads and attach caption & evidence type |
| `src/app/api/work-orders/[id]/attachments/route.ts` | `MODIFIED` | Updated POST handler to read `caption` and `evidenceType` from `FormData` |
| `src/tests/pwa/photoUpload.test.ts` | `NEW` | Unit tests for Phase 3 photo persistence, evidence tagging, retry behavior, and upload status |
| `TECHNICIAN_PWA_PHASE3_IMPLEMENTATION_REPORT.md` | `NEW` | Phase 3 implementation report |

---

## 8. Test Execution Results

Executed Vitest unit test suite across all 6 PWA test files:

```
 RUN  v2.1.9 E:/HP/Downloads/remix-zemifix-cmms

 ✓ src/tests/pwa/db.test.ts (9)
 ✓ src/tests/pwa/offlineSyncManager.test.ts (10)
 ✓ src/tests/pwa/syncService.test.ts (4)
 ✓ src/tests/pwa/materialRequest.test.ts (2)
 ✓ src/tests/pwa/assetWorkspace.test.ts (3)
 ✓ src/tests/pwa/photoUpload.test.ts (2)

 Test Files  6 passed (6)
      Tests  30 passed (30)
   Start at  14:07:02
   Duration  18.88s
```

### Static Code Analysis (`analyze_file`)
- Analyzed all modified/created TypeScript files — **0 errors found**.

---

## 9. Remaining Limitations & Recommended Next Phase

1. **W3C Background Sync API Event**:
   - Auto-sync triggers via `useOnlineStatus` (`window.addEventListener('online')`) or manual button triggers in Sync Centre. Next phase can register W3C `self.addEventListener('sync')` in `public/sw.js`.
2. **Push Notifications**:
   - Web Push API notification handling (`self.addEventListener('push')`) is not present in `public/sw.js`.
