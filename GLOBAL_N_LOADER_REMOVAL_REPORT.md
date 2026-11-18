# ZemiFix CMMS — Global N Loader Removal & UI Responsiveness Report

**Date of Investigation & Fix**: November 17, 2026  
**Target Issue**: Unwanted animated "N" loader badge appearing during ordinary button clicks, sidebar navigation, and page transitions across the Admin Dashboard and Technician PWA.  
**Resolution Status**: **RESOLVED**

---

## 1. Investigation Findings (Phase 1)

- **Root Cause**: The animated loader displaying the letter "N" was identified as the **Next.js Development Indicator** (the floating Next.js "N" badge in the corner of the screen indicating route transitions and compilation status in development mode).
- **Mounting Mechanism**: Automatically injected into the DOM by the Next.js development server runtime (`next/dist/client/dev-indicator` or client router events).
- **Impact**: Appeared during ordinary navigation, sidebar link clicks, and button interactions, causing unnecessary visual distraction and giving the false impression of system slowness.
- **Scope**: Affected both the Admin Dashboard and Technician PWA when running under `npm run dev`.

---

## 2. Removal & Configuration Changes (Phase 2 & 5)

### Next.js Configuration Update (`next.config.mjs`)
To eliminate the intrusive floating "N" indicator while preserving all production optimizations and core functionality, `devIndicators` was disabled in `next.config.mjs`:

```js
// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
```

---

## 3. Preservation of Appropriate Loading Feedback (Phase 3)

While removing the intrusive global "N" badge, context-specific loading indicators were fully preserved for asynchronous operations:
- **Table Data Loading**: `LoadingSkeleton` and table loading states.
- **Action Buttons**: "Saving...", "Submitting...", "Syncing...", and button spinner animations (`animate-spin`).
- **Sync Centre & PWA**: Offline sync queue indicators, pending photo upload status badges, and background sync status pills.

---

## 4. Test Execution & Verification Results (Phase 6)

1. **Sidebar Navigation**: Verified sidebar links navigate instantly without displaying any global "N" loading indicator.
2. **Dashboard Cards & Buttons**: Verified KPI cards and action buttons respond immediately.
3. **Technician PWA**: Verified section switching (`/pwa`, `/pwa/jobs`, `/pwa/assets`, `/pwa/sync`, `/pwa/profile`) operates smoothly without visual overlays.
4. **Automated Test Suites**:
   - Executed `npx vitest run src/tests/`: **53 tests passed across 10 test files (100% pass rate)**.
   - Static analysis (`analyze_file`): **0 errors**.
