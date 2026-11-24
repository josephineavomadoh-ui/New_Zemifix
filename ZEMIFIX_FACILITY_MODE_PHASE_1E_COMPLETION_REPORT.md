# ZemiFix Facility Mode — Phase 1E Completion Report
## Procurement Navigation Permission Boundary Correction

**Project:** ZemiFix CMMS  
**Phase:** Facility Mode Phase 1E  
**Date:** 2026-11-20  
**Status:** ✅ COMPLETE

---

## 1. Executive Summary

Phase 1E corrected a navigation permission leakage in which the legacy `stock:issue` permission was incorrectly granting Storekeeper users (and any other users holding only `stock:issue`) visibility into Procurement navigation destinations.

The fix is surgical and limited to frontend navigation configuration only. No backend authorization, authentication, database schemas, or Prisma artifacts were touched.

All existing tests pass. Two new regression tests were added. TypeScript strict-mode check passes with zero errors.

---

## 2. Problem Identified

### Root Cause
In the Procurement navigation group (`facilityNavigationGroups`), all four destinations — Requisitions, Purchase Orders, Receipts, and Suppliers — were configured with `mode: 'any'` and two permissions:

```typescript
permissions: [
  { resource: 'inventory', action: 'read' },  // ← Correct
  { resource: 'stock', action: 'issue' },      // ← Incorrect leakage
],
mode: 'any',
```

A user with **only** `stock:issue` and no `inventory:read` could therefore see all Procurement navigation destinations.

### Why This Is Wrong
`stock:issue` represents the ability to physically issue stock items from a storeroom against a work order. It is an operational, transactional permission.

Procurement (Requisitions, Purchase Orders, Goods Received Notes, Suppliers) is a separate purchasing workflow. A stock issuer who cannot read inventory management records has no authorised reason to access the procurement workflow pages.

The same leakage existed in the `contractorNavigationGroups` `Supply` group quick-nav `Procurement` link.

### No Dedicated Procurement Permission Exists
Inspection of `prisma/seed.ts` confirms there are no dedicated procurement permissions seeded (`purchase_requisition:read`, `purchase_order:read`, `goods_received_note:read`, `vendor:read` are absent). All procurement API routes use `getCurrentUser()` only — no `withApiSecurity` guard. This means backend procurement access is open to any authenticated staff member. The frontend navigation boundary is therefore the only access control layer.

**Decision:** Remove `stock:issue` from all procurement destinations. Use `inventory:read` only as the minimum procurement navigation gate. This correctly separates stock issuance (operational) from procurement visibility (inventory management responsibility).

---

## 3. Correction Applied

### File: `src/components/layout/AppSidebar.tsx`

#### Procurement Group (facilityNavigationGroups) — 4 items corrected

**Before (all 4 items):**
```typescript
permission: {
  permissions: [
    { resource: 'inventory', action: 'read' },
    { resource: 'stock', action: 'issue' },   // ← REMOVED
  ],
  mode: 'any',
},
```

**After (all 4 items):**
```typescript
// Phase 1E: stock:issue removed — procurement requires inventory:read only.
// stock:issue (physical issuance) does not imply procurement authorisation.
permission: {
  permissions: [{ resource: 'inventory', action: 'read' }],
},
```

Items corrected:
- `Requisitions` (`/procurement/requisitions`)
- `Purchase Orders` (`/procurement/purchase-orders`)
- `Receipts` (`/procurement/receipts`)
- `Suppliers` (`/procurement/vendors`)

#### Supply Group (contractorNavigationGroups) — 1 item corrected

**Before:**
```typescript
{
  name: 'Procurement',
  href: '/procurement',
  permission: {
    permissions: [
      { resource: 'inventory', action: 'read' },
      { resource: 'stock', action: 'issue' },   // ← REMOVED
    ],
    mode: 'any',
  },
},
```

**After:**
```typescript
{
  name: 'Procurement',
  href: '/procurement',
  // Phase 1E: stock:issue removed — mirrors the main Procurement group correction.
  permission: {
    permissions: [{ resource: 'inventory', action: 'read' }],
  },
},
```

#### Inventory Group — UNCHANGED (Correct Behaviour Preserved)

The following Inventory destinations **retain** the dual fallback `inventory:read OR stock:issue`:

| Destination | Permission Rule |
|---|---|
| Parts | `inventory:read` OR `stock:issue` |
| Stores | `inventory:read` OR `stock:issue` |
| Stock Transactions | `inventory:read` OR `stock:issue` OR `audit:read` |
| Reorder Queue | `inventory:read` OR `stock:issue` |
| Returns | `inventory:read` OR `stock:issue` |

This is correct. A stock issuer legitimately needs access to their inventory item screens and transaction records to perform their daily work.

---

## 4. Updated Navigation Permission Mapping — Procurement Group

| Destination | Required Permission | Mode | Storekeeper (stock:issue only) | Storekeeper (inventory:read + stock:issue) | Manager (inventory:read) |
|---|---|---|---|---|---|
| Requisitions | `inventory:read` | any | ❌ Hidden | ✅ Visible | ✅ Visible |
| Purchase Orders | `inventory:read` | any | ❌ Hidden | ✅ Visible | ✅ Visible |
| Receipts | `inventory:read` | any | ❌ Hidden | ✅ Visible | ✅ Visible |
| Suppliers | `inventory:read` | any | ❌ Hidden | ✅ Visible | ✅ Visible |

---

## 5. Role-by-Role Verification Results

| Role | Inventory Visible | Procurement Visible | Correct? |
|---|---|---|---|
| Admin (`*:*`) | ✅ | ✅ | ✅ |
| Manager (`inventory:read` + others) | ✅ | ✅ | ✅ |
| Supervisor (`work_order:read`, `asset:read`) | ❌ | ❌ | ✅ |
| Planner (`work_order:read`, `asset:read`) | ❌ | ❌ | ✅ |
| Technician (`work_order:read`) | ❌ | ❌ | ✅ |
| Storekeeper (`inventory:read` + `stock:issue`) | ✅ | ✅ | ✅ |
| **Storekeeper (`stock:issue` only)** | **✅** | **❌ (Phase 1E Fix)** | **✅** |
| Finance (`invoice:read`, `report:read`) | ❌ | ❌ | ✅ |
| Finance + `inventory:read` | ✅ | ✅ | ✅ |
| Cashier (`invoice:read`, `invoice:create`) | ❌ | ❌ | ✅ |
| Auditor (`audit:read`, `report:read`) | ✅ (Stock Transactions only) | ❌ | ✅ |
| Executive (read-only bundle) | ✅ | ✅ | ✅ |

---

## 6. Tests Added and Changed

### `src/tests/sidebarPermissions.test.ts`

**Updated:**
- Describe block renamed to `Phase 1D + 1E` to reflect the cumulative scope.
- Test 7 description clarified: "Storekeeper with `inventory:read + stock:issue` sees Inventory AND Procurement" (behaviour unchanged — user has `inventory:read`, so Procurement still visible).
- Test 16 updated: Finance + `inventory:read` now explicitly asserts `Procurement` group and `Requisitions`/`Purchase Orders` visibility (consistent with the corrected rule that `inventory:read` grants procurement).

**Added:**
- **Test 28** — *Phase 1E core regression*: Storekeeper with **only** `stock:issue` (no `inventory:read`) sees Inventory but NOT Procurement. Explicitly asserts all 5 procurement items are hidden.
- **Test 29** — *Additional boundary*: `stock:approve_issue`-only user sees neither Inventory destinations nor Procurement. Only Dashboard is visible.

### Test Count

| Test File | Before | After |
|---|---|---|
| `sidebarPermissions.test.ts` | 27 | 29 |
| `notificationHub.test.tsx` | 10 | 10 (unchanged) |
| **Total** | **37** | **39** |

---

## 7. Test Execution Results

### Sidebar Permissions (29 tests)
```
✓ src/tests/sidebarPermissions.test.ts (29 tests) 64ms
Test Files  1 passed (1)
     Tests  29 passed (29)
```

### Full Suite (39 tests)
```
✓ src/tests/sidebarPermissions.test.ts (29 tests) 134ms
✓ src/tests/notificationHub.test.tsx (10 tests) 3180ms
Test Files  2 passed (2)
     Tests  39 passed (39)
```

**All tests: PASS. Exit code: 0.**

---

## 8. TypeScript Check Results

```
npx tsc --noEmit --project tsconfig.json
```

**Result: Exit code 0. Zero errors. Zero warnings.**

---

## 9. Files Modified

| File | Change Type | Description |
|---|---|---|
| `src/components/layout/AppSidebar.tsx` | Modified | Removed `stock:issue` from 4 Procurement group items and 1 Supply group quick-nav item |
| `src/tests/sidebarPermissions.test.ts` | Modified + Extended | Updated Tests 7, 16; added Tests 28, 29 |

---

## 10. Files Explicitly NOT Modified

The following files were inspected read-only and not changed:

| File | Reason |
|---|---|
| `src/lib/auth.ts` | Backend auth — out of scope |
| `src/lib/authWrapper.ts` | API security wrapper — out of scope |
| `src/middleware.ts` | Route middleware — out of scope |
| `src/lib/auth-context.tsx` | Auth context provider — no changes needed |
| `prisma/schema.prisma` | Database schema — out of scope |
| `prisma/seed.ts` | Database seed — out of scope (read-only inspection) |
| `src/app/api/procurement/**` | Backend API routes — out of scope |
| All other backend services | Out of scope |

No migrations were executed. No database was written to. No test databases (`zemifix_acceptance`, `zemifix_platform_dev`) were accessed.

---

## 11. Limitations and Carry-Forward Notes

> [!NOTE]
> **Backend procurement authorization is open to any authenticated staff member.**
> All procurement API routes use `getCurrentUser()` with no `withApiSecurity` guard. This means that a `stock:issue`-only user who knows a direct URL can still access procurement data at the HTTP level. The frontend navigation boundary correction in Phase 1E removes the accidental UI invitation, but does not eliminate the backend gap.
>
> **Recommendation for a future phase:** Add `withApiSecurity` guards with appropriate permission checks to procurement API routes, or add dedicated procurement permissions to `prisma/seed.ts`. This is a backend task and outside the scope of Phase 1E.

---

## 12. Phase Completion Status Summary (1A–1E)

| Phase | Description | Status |
|---|---|---|
| 1A | NotificationHub integration into AppTopbar | ✅ Complete |
| 1B | Permission-aware sidebar navigation | ✅ Complete |
| 1C | Permission-only auth (role-name bypass removal), sidebar tests | ✅ Complete |
| 1D | Permission catalogue reconciliation (backend alignment) | ✅ Complete |
| 1E | Procurement navigation permission boundary correction | ✅ Complete |

**Phase 1 (1A–1E) is fully complete.** The codebase is ready for Phase 2 role-specific workspace development.
