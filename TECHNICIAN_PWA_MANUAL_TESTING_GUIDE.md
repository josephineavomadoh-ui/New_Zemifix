# ZemiFix CMMS — Technician PWA Manual Mobile Testing Setup & Acceptance Guide

**Target Application**: ZemiFix CMMS Technician PWA (`/pwa`)  
**Development Database**: `zemifix_dev` ONLY  
**Protected Database (`zemifix_acceptance`)**: Untouched & Protected

---

## 1. Safety & Database Restrictions

- **Database Safety**: Only use `zemifix_dev`. Never connect to, query, or modify `zemifix_acceptance`.
- **Database Preservations**: Never execute database resets, truncations, schema migrations, or destructive cleanups.
- **Audit & Protection**: Inventory tamper protection triggers remain active. Stock movements pass through `postStockTransaction()`.
- **No Unapproved Commits**: Do not commit or push changes.

---

## 2. Command Reference & Server Launch

### Command to Start Next.js Development Server
Open PowerShell or Terminal in `E:\HP\Downloads\remix-zemifix-cmms`:

```bash
npm run dev
```

*Note: `npm run dev` executes `next dev -H 0.0.0.0 -p 3000`, which binds the server to all network interfaces (`0.0.0.0`) on port 3000.*

### Application Entry Point URLs
- **Desktop / Host Machine**: `http://localhost:3000/pwa`
- **Mobile Network URL**: `http://<YOUR_COMPUTER_LOCAL_IP>:3000/pwa`

---

## 3. Accessing Dev Server from Android / iOS on local Wi-Fi

1. Connect your Android or iOS mobile phone to the **same Wi-Fi network** as your development PC.
2. Find your PC's local IP address:
   - **Windows**: Open PowerShell/CMD and run `ipconfig`. Look for `IPv4 Address` (e.g. `192.168.1.105` or `10.0.0.15`).
   - **macOS/Linux**: Run `ip a` or `ifconfig`.
3. Test connectivity from the mobile browser:
   Open Chrome (Android) or Safari (iOS) and navigate to `http://<YOUR_LOCAL_IP>:3000/pwa`.

---

## 4. Configuring Temporary HTTPS for Mobile PWA Features

> [!IMPORTANT]
> Service Workers, Web App Installation, W3C Background Sync, and HTML5 Camera Sensor features require **HTTPS** when accessed from a non-localhost IP address.

### Option A: Using `ngrok` (Recommended & Easiest)
In a separate terminal window, execute:

```bash
npx ngrok http 3000
```

Copy the generated HTTPS forwarding URL (e.g., `https://a1b2c3d4.ngrok-free.app`).  
Navigate to `https://a1b2c3d4.ngrok-free.app/pwa` on your mobile device.

### Option B: Using Next.js Experimental HTTPS
Execute:

```bash
npx next dev -H 0.0.0.0 -p 3000 --experimental-https
```

On your mobile device, navigate to `https://<YOUR_LOCAL_IP>:3000/pwa` and accept the self-signed developer certificate prompt.

---

## 5. Installing PWA on Android Chrome

1. Open the secure HTTPS PWA URL (e.g., `https://<NGROK_URL>/pwa`) in **Android Chrome**.
2. Wait for Chrome to display the **"Add ZemiFix PWA to Home screen"** banner at the bottom.
3. If no automatic banner appears:
   - Tap the **3 vertical dots menu** (top-right).
   - Select **"Install app"** or **"Add to Home screen"**.
4. Confirm by tapping **Install**.
5. Return to your Android home screen and launch **ZemiFix PWA**. The application opens in **standalone fullscreen mode** without browser address bars.

---

## 6. Installing & Testing Standalone Mode on iOS Safari

1. Open the secure HTTPS PWA URL in **iOS Safari**.
2. Tap the **Share button** (square with upward arrow) in the bottom toolbar.
3. Scroll down the action sheet and tap **"Add to Home Screen"**.
4. Set the name to **"ZemiFix PWA"** and tap **Add** in the top-right corner.
5. Return to the iOS Home screen and tap the **ZemiFix PWA** icon.
6. Verify that the application launches in standalone fullscreen mode without Safari navigation controls.

---

## 7. Technician Test Account Setup & Scope Verification

### Step 1: Identify or Create a Safe Technician Account
You can log in using an existing staff user or provision a dedicated test technician in `zemifix_dev` using a simple script:

- **Role**: `Technician`
- **Access Scope**: `Branch` or `Company`
- **Branch**: `HQ-ACC` (Accra HQ)
- **Department**: `DEPT-ENG` (Engineering)

### Step 2: Existing Seed Credentials (if seeded)
- **Admin**: `admin@zemifix.local` (Password: from `.env` or `Password123!`)
- **Technician**: `d4admin.<ts>@zemifix.local`

### Step 3: Login Procedure
1. Navigate to `/login` or `/pwa`.
2. Enter the technician email and password.
3. If OTP verification is prompted, enter the OTP sent to email or check console output in dev mode.
4. Verify HTTP-only session cookie is set and session redirects to `/pwa`.

---

## 8. Preparing Safe Test Work Orders, Assets & Materials

To avoid modifying operational data in `zemifix_dev`, create dedicated test records:

1. **Test Work Order**: `WO-TEST-9001` assigned to your test technician account.
2. **Test Asset**: `AST-TEST-9001` (e.g. "Cat 345D Excavator") with an attached `CONTINUOUS_INCREMENTAL` meter.
3. **Test Store & Parts**: `STR-ACC-MAIN` (Main Store) with part `P-BEAR-001` (Roller Bearing).

---

## 9. Inspecting Mobile DevTools, IndexedDB & Sync Outbox

### Inspecting via Desktop Browser DevTools
1. Open Chrome on PC -> `http://localhost:3000/pwa`.
2. Press `F12` to open DevTools.
3. **Manifest Inspection**: Go to **Application** -> **Manifest**. Verify icons (`/icon-192.png`, `/icon-512.png`), `start_url: "/pwa"`, and `display: "standalone"`.
4. **Service Worker Inspection**: Go to **Application** -> **Service Workers**. Verify `/sw.js` status is `Activated and is running`.
5. **IndexedDB Inspection**: Go to **Application** -> **IndexedDB** -> `ZemiFixTechnicianPwaDB`:
   - `cachedWorkOrders`: Inspect cached assigned jobs list.
   - `cachedWorkOrderDetails`: Inspect full work order JSON payload.
   - `cachedAssets`: Inspect cached asset records & meters.
   - `syncOutbox`: Inspect queued offline mutations (`actionType`, `idempotencyKey`, `status`).
   - `pendingPhotos`: Inspect stored photo blobs (`uploadStatus`, `caption`, `evidenceType`).
   - `conflictQueue`: Inspect server conflict records.
6. **Network Batch Sync Inspection**: Go to **Network** tab -> Filter by `batch`. Inspect `POST /api/sync/batch` request payload and server response.

### Inspecting Real Android Chrome via Remote Debugging
1. Connect Android phone to PC via USB cable. Enable **USB Debugging** in Android Developer Options.
2. On PC Chrome, navigate to `chrome://inspect/#devices`.
3. Find your Android device and tap **Inspect** next to the ZemiFix PWA tab.

---

## 10. Safely Resetting Local PWA Test Data

When you need to clear local PWA test cache without deleting server records in PostgreSQL:

### Method 1: Inside the PWA App
1. Open ZemiFix PWA on mobile.
2. Tap **Profile** in the bottom navigation bar (`/pwa/profile`).
3. Tap **"Clear offline data"**.
4. IndexedDB stores will be emptied safely.

### Method 2: Via Browser DevTools
1. Open DevTools -> **Application** tab.
2. Click **Storage** in the left menu.
3. Click **"Clear site data"**.

---

## 11. Step-by-Step Manual Acceptance Checklist

Execute the following 12 test procedures on your mobile device:

### Test 1: PWA Installation & Launch
- [ ] Open PWA HTTPS URL in mobile browser.
- [ ] Install PWA to Home screen.
- [ ] Launch PWA from Home screen. Verify standalone fullscreen mode without browser URL bar.

### Test 2: Authentication & Expiry Handling
- [ ] Sign in with technician credentials and complete OTP if prompted.
- [ ] Verify profile displays correct name, role, branch, and department.
- [ ] Test session expiration overlay by clearing session cookie; confirm PWA displays session expired overlay instead of crashing.

### Test 3: Home Dashboard & Work Order Caching
- [ ] Open `/pwa` while online.
- [ ] Tap **"Download Data for Offline"**. Verify success feedback banner.
- [ ] Verify assigned work orders list displays stats (Assigned, In Progress, Overdue, Completed Today).

### Test 4: Offline Work Order Execution
- [ ] Enable **Airplane Mode** on mobile device.
- [ ] Verify top offline banner appears (*"You are offline — showing cached data"*).
- [ ] Tap an assigned work order to open `/pwa/work-orders/[id]`.
- [ ] Tap **"Start Work"** (status shifts to `IN_PROGRESS`).
- [ ] Toggle a checklist item to `PASS`.
- [ ] Log labor hours (e.g. 2.5 hours) with description.
- [ ] Add a work note.

### Test 5: Offline Material Request Workflow
- [ ] While still offline, scroll to **Materials & Part Requests**.
- [ ] Select warehouse store and catalog part.
- [ ] Enter quantity (e.g. 3 PCS) and reason note.
- [ ] Tap **"Submit Material Request"**.
- [ ] Verify blue banner appears (*"Material request saved offline & queued for sync"*).
- [ ] Verify requested item appears in *"Pending Offline Requests"* list.

### Test 6: Offline Photo Evidence Capture
- [ ] While still offline, scroll to **Photo Evidence & Attachments**.
- [ ] Tap **"Take Photo"** (camera) or **"Select Gallery"**.
- [ ] Select/capture photo and verify preview thumbnail renders.
- [ ] Select Evidence Stage (`BEFORE` Repair) and type caption (*"Cracked casing seal"*).
- [ ] Tap **"Save & Attach Photo"**.
- [ ] Verify photo appears in *"Pending Offline Uploads"* list.

### Test 7: Mobile Asset Directory & Workspace
- [ ] Tap **Assets** in bottom navigation (`/pwa/assets`).
- [ ] Search by tag or name; test status filter chips (`Active`, `Down`, `In Maintenance`).
- [ ] Tap an asset to open dedicated workspace (`/pwa/assets/[id]`).
- [ ] Verify asset overview, manufacturer, model, S/N, location, and branch.

### Test 8: Meter Reading Monotonicity Rule Validation
- [ ] On asset workspace, find a continuous meter showing current reading (e.g., 1000 hrs).
- [ ] Enter a lower invalid reading (e.g., 900 hrs) and tap **Record**.
- [ ] Verify red error banner appears (*"INVALID_METER_READING: Incremental reading value cannot be less than current reading"*).
- [ ] Enter a valid higher reading (e.g., 1050 hrs) and tap **Record**.
- [ ] Verify reading queues offline successfully.

### Test 9: Equipment Downtime Reporting & Recovery
- [ ] On asset workspace, fill **Report Equipment Downtime** form (`UNPLANNED`, reason).
- [ ] Tap **"Log Equipment Downtime"**.
- [ ] Verify asset status changes to `DOWN` and active downtime red banner appears.

### Test 10: App Close & Offline Retention
- [ ] Force close ZemiFix PWA application on mobile while still offline.
- [ ] Re-open ZemiFix PWA.
- [ ] Open **Sync Centre** (`/pwa/sync`).
- [ ] Verify all queued mutations, outbox items, and pending photos are retained intact in IndexedDB.

### Test 11: Network Reconnect & Synchronization
- [ ] Disable Airplane Mode / reconnect mobile device to Wi-Fi/data.
- [ ] Open **Sync Centre** (`/pwa/sync`).
- [ ] Tap **"Sync Now"** (or observe auto-sync on reconnect).
- [ ] Verify outbox queue drains to 0 pending items.
- [ ] Verify pending photo uploads complete and status changes to uploaded.
- [ ] Verify last synced timestamp updates.

### Test 12: Server Verification & Ledger Integrity
- [ ] Inspect PostgreSQL database in `zemifix_dev`.
- [ ] Verify work order status updated to `IN_PROGRESS`.
- [ ] Verify `WorkOrderAttachment` record created with evidence tag `[BEFORE]` and image stored in `storage/uploads/work-orders/`.
- [ ] Verify `issueMaterialToWorkOrder()` executed, deducting stock via append-only `StockTransaction` ledger.
- [ ] Verify `submitMeterReading()` updated asset meter reading.
- [ ] Verify audit log chain remains valid.
