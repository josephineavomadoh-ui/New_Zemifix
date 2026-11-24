# ZemiFix Facility Mode — Phase 2A Completion Report
## Manager/Supervisor Operational Workspace

**Project:** ZemiFix CMMS  
**Phase:** Facility Mode Phase 2A  
**Date:** 2026-11-20  
**Status:** ✅ COMPLETE

---

## 1. Discovery Findings

### Existing Architecture (pre-Phase 2A)
| Component | Location | Notes |
|---|---|---|
| Dashboard page | `src/app/dashboard/page.tsx` | Single-component, no routing |
| DashboardView | `src/components/dashboard/DashboardView.tsx` | Full Company Admin dashboard |
| KpiCard | `src/components/dashboard/KpiCard.tsx` | Reusable, well-structured |
| Dashboard stats API | `src/app/api/dashboard/stats/route.ts` | Returns `LiveDashboardMetrics` via `getDashboardMetrics()` |
| dashboardService | `src/lib/services/dashboardService.ts` | Parallel Prisma queries, scoped via `getScopedWorkOrderFilter` |
| AppShell | `src/components/layout/AppShell.tsx` | Shell wrapper — not modified |
| Shell | `src/components/layout/Shell.tsx` | Thin wrapper around AppShell |
| auth-context | `src/lib/auth-context.tsx` | `UserSession` with `role.permissions[]` |

### Key Authoritative Findings
1. **`getScopedWorkOrderFilter(user)`** in `workOrderService.ts` correctly implements all five scopes: `Company`, `BranchAndBelow`, `Branch`, `Department`, `Own`. Reused directly in the new service.
2. **Approval system** (`approvalService.ts`) is fully implemented with maker-checker enforcement at the database transaction level. `makerUserId !== checker.id` is enforced in `submitApprovalDecision`. The dashboard shows pending approvals for display only — the actual approval action happens via the existing approval API.
3. **`approvalRequest.steps`** contains the active step with `requiredRoleId`. The dashboard surfaces the step name and current progress without exposing role validation logic.
4. **`MaintenancePlan`** model has `nextDue`, `status`, and `branchId` — allowing PM due-soon and overdue counts.
5. **`WorkOrder`** has `assignedUserId`, `supervisorUserId`, `plannedEnd`, `priority`, and `status` — all used for manager KPIs.
6. **`WorkRequest`** has status `SUBMITTED` for pending service requests.
7. **User.assignedWorkOrders** relation enables technician workload queries without N+1.
8. **No dedicated procurement permissions exist** (confirmed from Phase 1D/1E). Not relevant to this phase.
9. **`/api/users`** uses `requireAuth()` without `work_order` permission guard — accessible to any authenticated user. Used only for general staff info.
10. **`DashboardView`** contains hardcoded "Operations overview" text in its hero — used as the discriminating text in routing tests.

### Permission Structure
The session object (`UserSession`) carries:
```typescript
role: {
  permissions: Array<{ permission: { resource: string; action: string } }>;
}
```
Routing is based entirely on these permissions — no role-name strings.

---

## 2. Workspace Architecture

### Routing Decision Tree (permission-only)

```
/dashboard
│
├── user is null ──────────────────────────────→ DashboardView (default)
├── *:* (wildcard / Admin) ────────────────────→ DashboardView (admin preserved)  
├── work_order:read (any combination) ─────────→ ManagerDashboardView
└── all others (invoice:read, inventory, etc.) → DashboardView (future phases)
```

### Component Architecture

```
src/app/dashboard/page.tsx  (DashboardRouter — updated)
├── useAuth() → permission check
├── → DashboardView (admin, finance, storekeeper)
└── → ManagerDashboardView (manager, supervisor, planner, technician, multi-role)

src/components/dashboard/ManagerDashboardView.tsx  (NEW)
├── Fetches /api/dashboard/manager-stats
├── Hero header (role-aware label, branch, scope, quick summary pills)
├── KPI Cards (6): Active WOs, Overdue, Pending Requests, Critical/Urgent, Unassigned, PM Plans
├── Operational Alerts (up to 15, deduped by WO id)
├── Approvals panel (pending, excluding user's own requests)
├── Work order status bar chart (horizontal bars)
├── Technician workload (live assignments with inline progress bar)
├── Asset condition summary
└── Quick access link grid

src/app/api/dashboard/manager-stats/route.ts  (NEW)
└── Calls getManagerDashboardMetrics(user) with work_order:read permission guard

src/lib/services/managerDashboardService.ts  (NEW)
└── 13 parallel Prisma queries, fully scoped
```

---

## 3. Routes and Components Created or Modified

### New Files
| File | Purpose |
|---|---|
| `src/app/api/dashboard/manager-stats/route.ts` | Manager stats API endpoint |
| `src/lib/services/managerDashboardService.ts` | Manager metrics service (13 parallel queries) |
| `src/components/dashboard/ManagerDashboardView.tsx` | Manager/Supervisor workspace UI |
| `src/tests/managerDashboard.test.tsx` | 25 tests (component, routing, permission boundary) |

### Modified Files
| File | Change |
|---|---|
| `src/app/dashboard/page.tsx` | Replaced single-component render with `DashboardRouter` — permission-only routing |

### Unchanged Files
All Phase 1A–1E files remain untouched. The existing Company Admin `DashboardView` is completely preserved.

---

## 4. KPI and Chart Data Sources

| KPI | Source | Notes |
|---|---|---|
| Active Work Orders | `WorkOrder.groupBy(status)` | Scoped via `getScopedWorkOrderFilter` |
| Overdue Work Orders | `WorkOrder.count(status IN active, plannedEnd < now)` | Scoped |
| Pending Service Requests | `WorkRequest.count(status = SUBMITTED)` | Company-wide |
| Critical / Urgent Open | `WorkOrder.count(priority IN CRITICAL/URGENT, status IN active)` | Scoped |
| Unassigned Open | `WorkOrder.count(status = OPEN, assignedUserId = null)` | Scoped |
| PM Plans (active/overdue/due soon) | `MaintenancePlan.count(status, nextDue)` | Branch-scoped |
| Operational Alerts | `WorkOrder.findMany(overdue, critical, unassigned)` + `WorkRequest` | Deduped, top 15 |
| Technician workload | `User.findMany(assignedWorkOrders)` | WO scope applied |
| Pending Approvals | `ApprovalRequest.findMany(status=PENDING, makerUserId ≠ user.id)` | No role restriction (backend enforces authority) |
| Asset summary | `Asset.groupBy(status)` | Company-wide |

**Work order status distribution chart:** Horizontal bar visualization built from the same `groupBy` query data — no separate query.

---

## 5. Manager vs Supervisor Permission Differences

Both Manager and Supervisor land in `ManagerDashboardView`. The workspace **adapts dynamically** to the actual scoped data, not by role name:

| Characteristic | Manager (typical) | Supervisor (typical) |
|---|---|---|
| Permission set | `work_order:read`, `asset:read`, `inventory:read`, `settings:manage`, `report:read` | `work_order:read`, `asset:read`, `report:read` |
| Access scope | `BranchAndBelow` or `Company` | `Branch` |
| WO scope visibility | Broader (sub-branches) | Branch only |
| Procurement | Visible in sidebar (Phase 1E) | Not visible unless has `inventory:read` |
| Dashboard workspace | ManagerDashboardView | ManagerDashboardView |
| Data volume | Higher (more branches) | Narrower (own branch) |
| Role label | "Manager operational workspace" | "Supervisor operational workspace" |

The workspace hero displays `user.role.name` (e.g. "Supervisor operational workspace") — this is **display-only**, not an authorization check.

---

## 6. Data Scope Enforcement

Scope enforcement is implemented at the **service layer** via `getScopedWorkOrderFilter(user)`:

| Scope | Behaviour |
|---|---|
| `Company` | No filter — all records |
| `BranchAndBelow` | `branch.path STARTSWITH userBranch.path` + scope grants |
| `Branch` | `branchId IN [user.branchId, ...grantedBranchIds]` |
| `Department` | `departmentId IN [user.departmentId, ...grantedDeptIds]` |
| `Own` | `assignedUserId = user.id OR supervisorUserId = user.id` |

**PM Plans** use a simplified branch filter: `branchId = user.branchId` for Branch/BranchAndBelow scopes, unrestricted for Company. This matches the existing `/api/preventive/plans` backend behaviour.

**Assets** are queried company-wide for the summary panel (consistent with the existing `DashboardView` behaviour).

**Approvals** are queried company-wide filtered only by `makerUserId ≠ user.id` — the backend `submitApprovalDecision` enforces organizational scope, role, permission, and approval limit at transaction time.

**Tenant isolation** is enforced by the existing RLS policies and security context. The manager service does not bypass these.

---

## 7. Approval Workflow Integration

**Display only.** The workspace shows:
- Pending `ApprovalRequest` items where `makerUserId ≠ user.id`
- Entity type, submitted by, step name, step progress (n/total), date, amount
- A notice: "You cannot approve requests you submitted"

**What the workspace does NOT do:**
- Submit approval decisions (no POST to any approval endpoint)
- Bypass maker-checker validation
- Filter by role (the backend does this at decision time)
- Invent new approval entity types

**Actual approval action:** The user must navigate to the relevant procurement/finance module and use the existing approval flow, which calls `POST /api/[entity]/[id]/approve` → `submitApprovalDecision()` → full backend validation.

**Entity types surfaced:** `PURCHASE_REQUISITION`, `PURCHASE_ORDER`, `GOODS_RECEIVED_NOTE` (the three registered payload builders in `approvalService.ts`).

---

## 8. Tests Added

### New test file: `src/tests/managerDashboard.test.tsx`

| Group | Tests | Description |
|---|---|---|
| ManagerDashboardView — Rendering | 12 | Skeleton, hero, KPIs, error banner, alerts, empty states, approvals, notice, quick links |
| DashboardPage — Permission routing | 7 | Admin→DashboardView, Manager→Manager, Supervisor→Manager, Tech→Manager, Finance→Default, Storekeeper→Default, Multi-responsibility→Manager |
| Permission boundary | 2 | 403 error state, role-name bypass blocked |
| Supervisor rendering | 1 | Correct role label displayed |
| Admin dashboard preservation | 2 | Admin does NOT see ManagerDashboardView; DashboardView mounts without crash |

**Test type:** Unit/component tests with mocked `fetch` and `useAuth`. No database connection required.

---

## 9. Test Execution Results

```
✓ src/tests/managerDashboard.test.tsx      25 tests   6654ms
✓ src/tests/sidebarPermissions.test.ts     29 tests     83ms  (Phase 1D+1E — unchanged)
✓ src/tests/notificationHub.test.tsx       10 tests   1326ms  (Phase 1C — unchanged)

Test Files  3 passed (3)
     Tests  64 passed (64)
```

**All 64 tests: PASS. Exit code: 0.**

---

## 10. TypeScript Check

```
npx tsc --noEmit --project tsconfig.json
```

**Result: Exit code 0. Zero errors.**

---

## 11. Backend Capabilities Missing / Limitations

### Missing Backend Capabilities

| Capability | Gap | Impact |
|---|---|---|
| PM compliance percentage | `MaintenancePlan.compliancePercent` exists in schema but not surfaced in stats | Could show "12 plans, 87% compliance" — requires a service-level aggregate |
| Preventive maintenance work order count | No dedicated query linking `MaintenancePlan` to generated `WorkOrder` | Cannot show "5 PM tasks completed this month" |
| Technician availability | No `User.availability` or shift model in schema | Availability cards would show fabricated data — excluded entirely |
| Team capacity metrics | No `Team` model beyond `User.teamIds[]` JSON array | Cannot show team utilization % |
| Mean time to repair (MTTR) | Requires `WorkOrder.startedAt` and `closedAt` delta — `startedAt` not in schema | Cannot calculate MTTR |
| Mean time between failures (MTBF) | Requires downtime log correlation with failure events | Not in scope, no backend |
| Work order approval flow | No `work_order` approval rule in `approvalService` (only PR/PO/GRN) | Cannot surface WO approval requests in dashboard |
| SLA-linked work orders | `slaService` exists but `WorkOrder.slaId` not in schema | Cannot show per-WO SLA compliance |

### Known Limitations

1. **Approval scope not filtered by user's organizational scope.** The pending approvals panel shows all `PENDING` requests company-wide (excluding user's own). The backend enforces scope at decision time. Future improvement: filter by `branchId` matching user scope.
2. **Asset summary is company-wide.** To scope it to the manager's branch, `getScopedAssetFilter(user)` should be called — it requires a transaction context. Added to backlog.
3. **Technician workload limited to 20 users.** Users with the highest number of assignments may be paginated away. Acceptable for dashboard; the Workers module has full data.
4. **Alert deduplication: first type wins.** If a WO is both overdue and critical, it shows as overdue. A future enhancement could multi-label alerts.
5. **Dashboard routing uses work_order:read as the sole entry gate.** Planner and Technician also land in the Manager workspace. Future phases may differentiate these.

---

## 12. Explicit Admin Dashboard Preservation Confirmation

> ✅ **The existing Company Administrator dashboard (`DashboardView`) is fully preserved and unchanged.**

- `src/components/dashboard/DashboardView.tsx` — **not modified**
- `src/lib/services/dashboardService.ts` — **not modified**
- `src/app/api/dashboard/stats/route.ts` — **not modified**

Admin users (with `*:*` wildcard permission) are explicitly routed to `DashboardView` **before** the `work_order:read` check. This is verified by test 24 (`Admin wildcard user does NOT see ManagerDashboardView`) and test 13 (`Admin user sees DashboardView - admin dashboard preserved`).

---

## 13. Files Modified and Created (Summary)

### New (4 files)
- [`src/app/api/dashboard/manager-stats/route.ts`](file:///E:/HP/Downloads/remix-zemifix-cmms/src/app/api/dashboard/manager-stats/route.ts)
- [`src/lib/services/managerDashboardService.ts`](file:///E:/HP/Downloads/remix-zemifix-cmms/src/lib/services/managerDashboardService.ts)
- [`src/components/dashboard/ManagerDashboardView.tsx`](file:///E:/HP/Downloads/remix-zemifix-cmms/src/components/dashboard/ManagerDashboardView.tsx)
- [`src/tests/managerDashboard.test.tsx`](file:///E:/HP/Downloads/remix-zemifix-cmms/src/tests/managerDashboard.test.tsx)

### Modified (1 file)
- [`src/app/dashboard/page.tsx`](file:///E:/HP/Downloads/remix-zemifix-cmms/src/app/dashboard/page.tsx) — added `DashboardRouter` with permission-only routing; existing `DashboardView` and `ManagerDashboardView` are both rendered via `Shell`

### Explicitly NOT Modified
- All auth files (`auth.ts`, `authWrapper.ts`, `middleware.ts`, `auth-context.tsx`)
- All Prisma files (schema, seed, migrations)
- All Phase 1A–1E files (AppSidebar, AppTopbar, AppShell, NotificationHub)
- All backend services except the new addition
- SaaS Control Plane, Contractor Portal, Technician PWA

---

## 14. Phase Completion Status

| Phase | Description | Status |
|---|---|---|
| 1A | NotificationHub integration | ✅ Complete |
| 1B | Permission-aware sidebar | ✅ Complete |
| 1C | Permission-only auth (role bypass removal) | ✅ Complete |
| 1D | Permission catalogue reconciliation | ✅ Complete |
| 1E | Procurement permission boundary correction | ✅ Complete |
| **2A** | **Manager/Supervisor operational workspace** | **✅ Complete** |
| 2B | Planner/Dispatcher workspace | Pending |
| 2C | Storekeeper workspace | Pending |
| 2D | Finance workspace | Pending |
| 2E | Executive workspace | Pending |
