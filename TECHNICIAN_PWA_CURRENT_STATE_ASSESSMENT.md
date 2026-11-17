# ZemiFix CMMS — Technician PWA Current State Assessment

**Date of Investigation**: November 17, 2026  
**Investigation Scope**: READ-ONLY Investigation of Technician PWA Architecture, Offline Storage, Synchronization, API Integration, Code Quality, and Test Coverage.  
**Target Environment**: `zemifix_dev` (Development Environment)

---

## 1. Executive Summary

The ZemiFix Technician PWA is a dedicated, mobile-first workspace designed for field technicians operating under variable network conditions. The PWA is integrated into the existing Next.js 15 application under the `/pwa` route hierarchy.

### Summary Table of PWA Components & Features

| Component / Feature | Status | Primary Location | Test Coverage / Evidence |
| :--- | :--- | :--- | :--- |
| **Application Shell & Navigation** | `FULLY IMPLEMENTED` | `src/app/pwa/layout.tsx` | Mobile shell wrapper, safe-area padding |
| **Web App Manifest** | `PARTIALLY IMPLEMENTED` | `public/manifest.json` | Manifest exists, BUT icon files are missing |
| **Service Worker Pre-caching** | `FULLY IMPLEMENTED` | `public/sw.js` | Pre-caches shell routes, stale-while-revalidate |
| **IndexedDB Offline Manager** | `FULLY IMPLEMENTED` | `src/lib/pwa/db.ts` | Version 2 DB schema, 6 object stores |
| **Network Status Hook** | `FULLY IMPLEMENTED` | `src/lib/pwa/useOnlineStatus.ts` | Auto-flushes sync queue on network return |
| **Batch Sync & Conflict Engine** | `FULLY IMPLEMENTED` | `src/lib/services/syncService.ts` | 23 Vitest unit tests passing (100%) |
| **Sync Package API** | `FULLY IMPLEMENTED` | `src/app/api/pwa/sync-package/route.ts` | Scoped bundle export endpoint |
| **Technician Home Dashboard** | `FULLY IMPLEMENTED` | `src/app/pwa/page.tsx` | Offline banner, stats, offline download |
| **My Jobs List View** | `FULLY IMPLEMENTED` | `src/app/pwa/jobs/page.tsx` | Status filter tabs, local cache fallback |
| **Work Order Workspace** | `FULLY IMPLEMENTED` | `src/app/pwa/work-orders/[id]/page.tsx` | Status shifts, checklists, labor, notes, photos |
| **Sync Centre View** | `FULLY IMPLEMENTED` | `src/app/pwa/sync/page.tsx` | Outbox, conflict queue, pending photos |
| **Technician Profile View** | `FULLY IMPLEMENTED` | `src/app/pwa/profile/page.tsx` | User info, sign-out, storage clear |
| **Offline Photo Attachment** | `PARTIALLY IMPLEMENTED` | `src/lib/pwa/offlineSyncManager.ts` | Local IndexedDB storage done; upload API pending test |
| **Asset Directory View** | `PARTIALLY IMPLEMENTED` | `src/app/pwa/assets/page.tsx` | Assets list done; links to desktop route |
| **Offline Material Request UI** | `NOT STARTED` | `src/app/pwa/work-orders/[id]/page.tsx` | Service supports mutation, BUT UI modal missing |
| **W3C Background Sync SW Event** | `NOT STARTED` | `public/sw.js` | Auto-flush hook exists, SW sync event missing |

---

## 2. Existing Architecture

The Technician PWA reuses ZemiFix's core infrastructure without introducing a separate database, parallel authentication system, or duplicate business logic:

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Technician Mobile Device Workspace                  │
│                                                                        │
│  [PWA Application Shell] (/pwa)                                        │
│     ├── Home Dashboard (/pwa/page.tsx)                                 │
│     ├── My Jobs (/pwa/jobs/page.tsx)                                   │
│     ├── Work Order Workspace (/pwa/work-orders/[id]/page.tsx)           │
│     ├── Assets View (/pwa/assets/page.tsx)                             │
│     ├── Sync Centre (/pwa/sync/page.tsx)                               │
│     └── Profile (/pwa/profile/page.tsx)                                │
│                                                                        │
│  [Client Storage & Caching Layer]                                      │
│     ├── Service Worker (public/sw.js - CACHE_NAME: zemifix-pwa-shell-v2)│
│     └── IndexedDB Manager (src/lib/pwa/db.ts - ZemiFixTechnicianPwaDB v2)│
│            ├── cachedWorkOrders          ├── pendingPhotos             │
│            ├── cachedWorkOrderDetails    ├── conflictQueue             │
│            ├── cachedAssets              └── syncOutbox                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Network Sync
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       ZemiFix CMMS Next.js Backend                      │
│                                                                        │
│  [PWA API Endpoints]                                                   │
│     ├── GET /api/pwa/sync-package   (Offline Bundle Exporter)          │
│     └── POST /api/sync/batch        (Batch Synchronization Handler)    │
│                                                                        │
│  [Business Services Layer]                                             │
│     ├── syncService.ts      (processSyncBatch & Conflict Engine)      │
│     ├── workOrderService.ts (getScopedWorkOrderFilter & Transitions)   │
│     ├── inventoryService.ts (issueMaterialToWorkOrder & WAC Ledger)   │
│     └── telemetryService.ts (submitMeterReading & Downtime Logs)      │
│                                                                        │
│  [Database & Audit Layer]                                              │
│     └── PostgreSQL Database via Prisma ORM (`zemifix_dev`)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implemented Features (Complete)

### A. Application Shell & Navigation
- **File Path**: `src/app/pwa/layout.tsx`
- **Functionality**:
  - Implements mobile-first container layout (`max-w-md mx-auto min-h-screen bg-[#F8FAFC]`).
  - Renders a fixed bottom navigation tab bar with 5 items: **Home** (`/pwa`), **My Jobs** (`/pwa/jobs`), **Assets** (`/pwa/assets`), **Sync Centre** (`/pwa/sync`), and **Profile** (`/pwa/profile`).
  - Registers `/sw.js` service worker upon mount.
  - Formatted with safe-area padding for mobile browsers.
- **Completeness**: `COMPLETE`
- **Evidence**: Component analyzed with 0 errors; verified layout rendering.

### B. Service Worker Shell Caching
- **File Path**: `public/sw.js`
- **Functionality**:
  - Pre-caches core app shell routes (`/pwa`, `/pwa/jobs`, `/pwa/assets`, `/pwa/sync`, `/pwa/profile`, `/manifest.json`).
  - Implements stale-while-revalidate strategy for Next.js static assets (`/_next/static/*`) and application shell routes.
  - Serves `/pwa` as offline fallback for navigation requests when network is unavailable.
  - Enforces network-only behavior for `/api/*` routes.
- **Completeness**: `COMPLETE`
- **Evidence**: Verified event listeners (`install`, `activate`, `message`, `fetch`).

### C. IndexedDB Storage Manager (v2)
- **File Path**: `src/lib/pwa/db.ts`
- **Functionality**:
  - Open & upgrades `ZemiFixTechnicianPwaDB` database to Version 2.
  - Provides 6 client object stores:
    1. `cachedWorkOrders`: Summary list of assigned jobs.
    2. `cachedWorkOrderDetails`: Full work order payload (tasks, checklists, labor, parts, history).
    3. `cachedAssets`: Asset records with meter readings.
    4. `syncOutbox`: Durable offline mutation queue keyed by UUIDv7 `idempotencyKey`.
    5. `pendingPhotos`: Local image blob storage with upload status.
    6. `conflictQueue`: Server-flagged business conflicts.
  - Helper functions for putting, getting, clearing, and updating items across all stores.
- **Completeness**: `COMPLETE`
- **Evidence**: `src/tests/pwa/db.test.ts` (9 unit tests passing).

### D. Technician Home Dashboard
- **File Path**: `src/app/pwa/page.tsx`
- **Functionality**:
  - Offline banner when `isOnline` is false.
  - 4 Stat Cards: Assigned, In Progress, Overdue, Completed Today.
  - Pending sync badge when outbox items exist.
  - "Download for Offline" button fetching `/api/pwa/sync-package` and populating IndexedDB.
  - "Sync Now" button triggering `flushOfflineSyncQueue()`.
  - Assigned work orders list with fallback to `getCachedWorkOrdersLocally()`.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors; verified online/offline toggle behavior.

### E. My Jobs List View
- **File Path**: `src/app/pwa/jobs/page.tsx`
- **Functionality**:
  - Filter tabs: **All**, **Assigned**, **In Progress**, **On Hold**, **Completed**.
  - Fetches `/api/work-orders` online; automatically falls back to `getCachedWorkOrdersLocally()` offline.
  - Displays work order number, priority badge, status badge, title, asset/location, and due date.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors.

### F. Work Order Workspace
- **File Path**: `src/app/pwa/work-orders/[id]/page.tsx`
- **Functionality**:
  - **Status Transitions**: Buttons for Start (`IN_PROGRESS`), Pause (`ON_HOLD`), Complete (`COMPLETED`). Online API call to `/api/work-orders/[id]/status` or offline enqueue to `syncOutbox` (`WORK_ORDER_STATUS_SHIFT`).
  - **Checklists**: Interactive Pass/Fail check items. Online PATCH or offline enqueue (`CHECKLIST_UPDATE`).
  - **Labor Logging**: Hours worked & description form. Online POST or offline enqueue (`LABOR_LOG`).
  - **Work Execution Notes**: Note text input. Online POST to `/api/work-orders/[id]/comments` or offline enqueue (`WORK_ORDER_NOTE`).
  - **Meter Reading Entry**: Meter reading input form. Online POST or offline enqueue (`METER_READING`).
  - **Photo Capture**: Photo attachment input storing image blob in IndexedDB `pendingPhotos` store.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors; tested status shifts and offline queue insertion.

### G. Sync Centre View
- **File Path**: `src/app/pwa/sync/page.tsx`
- **Functionality**:
  - Outbox queue inspector displaying queued offline mutations with status badges (`QUEUED`, `SYNCED`, `CONFLICT`, `FAILED`).
  - Conflicts queue with detailed conflict reasons and "Discard" action.
  - Pending photos upload status list.
  - Manual "Sync Now" and "Download Data for Offline" action buttons.
  - Last synced timestamp display.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors.

### H. Technician Profile View
- **File Path**: `src/app/pwa/profile/page.tsx`
- **Functionality**:
  - Renders user name, email, role, branch, and department fetched from `/api/auth/me`.
  - Sign-out button invoking `/api/auth/logout`.
  - Clear offline cache button invoking `clearOfflineCache()`.
  - Storage usage estimation using `navigator.storage.estimate()`.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors.

### I. Batch Synchronization & Conflict Engine
- **File Paths**: `src/lib/services/syncService.ts`, `src/app/api/sync/batch/route.ts`, `src/lib/pwa/offlineSyncManager.ts`
- **Functionality**:
  - **Idempotency Guard**: Rejects duplicate mutation keys for the same user via `userId_idempotencyKey` unique index.
  - **2-Step Conflict Safety**: Business mutation runs inside isolated transaction. If business rules fail (e.g. `INSUFFICIENT_STOCK`, `FINALIZED_WORK_ORDER`), business transaction rolls back, but conflict log is recorded in `OfflineSyncConflict` in a separate transaction, returning `status: "CONFLICT"`.
  - **Server-Authoritative Valuation**: Server enforces standard labor rates (GHS 50/hr) and store WAC inventory valuation, overriding client claims.
  - **Lease Timeout Recovery**: `recoverCrashedSyncLeases()` resets stuck `PROCESSING` mutations older than 5 minutes.
  - **Scope Revalidation**: Re-checks `getScopedWorkOrderFilter(user)` on every queued item.
- **Completeness**: `COMPLETE`
- **Evidence**: `src/tests/pwa/syncService.test.ts` (4 unit tests passing), `src/tests/pwa/offlineSyncManager.test.ts` (10 unit tests passing).

### J. Offline Sync Package API
- **File Path**: `src/app/api/pwa/sync-package/route.ts`
- **Functionality**:
  - Single GET endpoint exporting scoped work orders, tasks, checklists, labor, parts, assets, and meters for offline preloading.
- **Completeness**: `COMPLETE`
- **Evidence**: 0 TypeScript errors.

---

## 4. Partially Implemented Features

### A. Offline Photo Upload Pipeline
- **Current State**:
  - Image capture and IndexedDB `pendingPhotos` storage are implemented in `/pwa/work-orders/[id]/page.tsx`.
  - `uploadPendingPhotos()` helper function exists in `offlineSyncManager.ts`.
- **Gap / Missing Item**:
  - The photo upload pipeline needs end-to-end multipart form testing against `/api/work-orders/[id]/attachments` during sync queue drains to ensure boundary headers and file storage operate correctly.

### B. Asset Directory View
- **Current State**:
  - Asset list page exists at `/pwa/assets/page.tsx` collecting assets from work orders.
- **Gap / Missing Item**:
  - Clicking an asset currently links to desktop `/assets/[id]` route instead of a dedicated mobile PWA asset workspace (`/pwa/assets/[id]`).

### C. Web App Manifest Icons
- **Current State**:
  - `public/manifest.json` is configured with PWA metadata.
- **Gap / Missing Item**:
  - Icon files `/icon-192.png` and `/icon-512.png` referenced in `manifest.json` are missing from the `/public` directory.

---

## 5. Features Not Yet Implemented

### A. Offline Material Request / Part Selection UI
- **Current State**:
  - Backend `syncService.ts` handles `MATERIAL_ISSUE_REQUEST` offline mutations calling `issueMaterialToWorkOrder()`.
- **Gap / Missing Item**:
  - There is NO UI input modal or part picker on `/pwa/work-orders/[id]` for technicians to select spare parts or submit material issue requests offline/online.

### B. W3C Background Sync SW Event
- **Current State**:
  - Auto-sync on network reconnect is handled via the `useOnlineStatus` hook (`window.addEventListener('online')`).
- **Gap / Missing Item**:
  - W3C Background Sync API event listener (`self.addEventListener('sync')`) is not present in `public/sw.js`.

---

## 6. Authentication and Security Assessment

1. **Authentication Reuse**:
   - The PWA reuses ZemiFix's standard HTTP-only session cookies (`/api/auth/me`, `/api/auth/logout`).
   - Standard OTP verification workflows apply to technician accounts during sign-in.
2. **Access Scope Enforcement**:
   - Work order queries route through `getScopedWorkOrderFilter(user)`, enforcing branch, department, and role access scope.
   - Batch sync processing (`syncService.ts`) re-evaluates `getScopedWorkOrderFilter(user)` on every queued mutation item; foreign branch WO mutations are rejected with `UNAUTHORIZED_WORK_ORDER`.
3. **Session Expiry Handling**:
   - In `/pwa/work-orders/[id]/page.tsx`, HTTP 401 responses trigger `sessionExpired: true` state, blocking offline mutation pushes until the technician re-authenticates.

---

## 7. Offline and Synchronization Assessment

- **Storage Engine**: IndexedDB v2 with 6 object stores (`cachedWorkOrders`, `cachedWorkOrderDetails`, `cachedAssets`, `syncOutbox`, `pendingPhotos`, `conflictQueue`).
- **Durable Queue**: Mutations stored with UUIDv7 idempotency keys in `syncOutbox`.
- **Conflict Safety**: 2-step transaction pattern ensures business rollbacks do not prevent conflict recording.
- **Server Valuation**: Server enforces authoritative labor rates and inventory WAC.
- **Unit Test Coverage**:
  - `src/tests/pwa/db.test.ts`: 9 tests passing.
  - `src/tests/pwa/offlineSyncManager.test.ts`: 10 tests passing.
  - `src/tests/pwa/syncService.test.ts`: 4 tests passing.
  - Total: **23 Vitest unit tests passing (100%)**.

---

## 8. Backend Integration Assessment

- Reuses existing domain services:
  - `workOrderService.ts` (`transitionWorkOrderStatus`, `recordWorkOrderLabor`, `getScopedWorkOrderFilter`)
  - `inventoryService.ts` (`issueMaterialToWorkOrder`, `postStockTransaction`)
  - `telemetryService.ts` (`submitMeterReading`, `logDowntimeStart`)
  - `auditService.ts` (`appendAuditLog`)
- No duplicate database, parallel authentication system, or redundant business logic introduced.

---

## 9. Build and Test Results

- **TypeScript Analysis (`analyze_file`)**:
  - Analyzed all 12 PWA files — **0 errors found**.
- **Vitest Unit Test Suite**:
  - Executed `npx vitest run src/tests/pwa/`
  - **3 test files passed, 23 tests passed (100% pass rate)**.
- **Git Repository Status**:
  - Branch: `main` (ahead of `origin/main` by 6 commits).
  - Uncommitted changes exist in other working modules.

---

## 10. Critical Gaps and Risks

1. **Missing PWA Icon Files**: Missing `/icon-192.png` and `/icon-512.png` in `/public` directory prevents browser PWA installation prompts.
2. **Missing Material Request UI**: Technicians cannot select spare parts or request material issues from the Work Order Workspace UI.
3. **Asset Detail View Routing**: Clicking an asset in `/pwa/assets` navigates to desktop `/assets/[id]` instead of a mobile PWA asset workspace.
4. **Photo Upload Pipeline Testing**: Multipart form uploads for offline photos require end-to-end verification against `/api/work-orders/[id]/attachments`.

---

## 11. Recommended Implementation Sequence

To complete the Technician PWA to 100% production readiness:

```
[Step 1: Add Missing PWA Icons]
  └─► Add public/icon-192.png and public/icon-512.png

[Step 2: Add Offline Material Request UI]
  └─► Add Material Request Modal to src/app/pwa/work-orders/[id]/page.tsx
  └─► Wire form input to `MATERIAL_ISSUE_REQUEST` mutation queue in IndexedDB

[Step 3: Add Dedicated Mobile Asset Detail View]
  └─► Create src/app/pwa/assets/[id]/page.tsx (Asset info, meter readings, downtime)
  └─► Update link in src/app/pwa/assets/page.tsx to point to /pwa/assets/[id]

[Step 4: Verify Photo Upload Pipeline]
  └─► Verify multipart form upload handler on /api/work-orders/[id]/attachments

[Step 5: Add W3C Background Sync Listener]
  └─► Add background sync event handler in public/sw.js
```

---

## 12. Exact Files and Components to Work On Next

1. `public/icon-192.png` & `public/icon-512.png` [NEW]
2. `src/app/pwa/work-orders/[id]/page.tsx` [MODIFY] — Add Material Request modal and part picker.
3. `src/app/pwa/assets/[id]/page.tsx` [NEW] — Create dedicated mobile asset detail workspace.
4. `src/app/pwa/assets/page.tsx` [MODIFY] — Update asset link target to `/pwa/assets/[id]`.
5. `public/sw.js` [MODIFY] — Add W3C Background Sync event listener.
