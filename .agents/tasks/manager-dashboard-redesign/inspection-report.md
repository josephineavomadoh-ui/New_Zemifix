# Manager Dashboard Redesign — Codebase Inspection Report

**Branch:** `feature/manager-dashboard-redesign`  
**Worktree:** `e:\HP\Downloads\remix-zemifix-cmms\.worktrees\manager-dashboard-redesign`  
**Base commit:** `bc6a2c9` (identical to `main`)  
**Date:** 2026-11-23

---

## 1. Worktree Status

The worktree is a clean checkout of `main` on the new branch. None of the target files (`ManagerDashboardView.tsx`, `managerDashboardService.ts`, `src/app/api/dashboard/manager-stats/route.ts`) exist in the worktree yet — they all live in the main workspace and must be **ported and redesigned**. All reference files (`DashboardView.tsx`, `KpiCard.tsx`, schema, services, auth) exist identically in both locations.

---

## 2. Files Catalogued

| # | File | Location | Status in Worktree |
|---|------|----------|--------------------|
| 1 | `src/components/dashboard/ManagerDashboardView.tsx` | Main workspace only | **DOES NOT EXIST** — to be created |
| 2 | `src/lib/services/managerDashboardService.ts` | Main workspace only | **DOES NOT EXIST** — to be created |
| 3 | `src/app/api/dashboard/manager-stats/route.ts` | Main workspace only | **DOES NOT EXIST** — to be created |
| 4 | `src/components/dashboard/FinanceDashboardView.tsx` | Main workspace only | **DOES NOT EXIST** in worktree |
| 5 | `src/components/dashboard/KpiCard.tsx` | Both | Present |
| 6 | `src/components/dashboard/DashboardView.tsx` | Both | Present |
| 7 | `src/lib/auth.ts` | Both | Present |
| 8 | `src/lib/auth-context.tsx` | Both | Present |
| 9 | `src/lib/services/workOrderService.ts` | Both | Present |
| 10 | `src/lib/services/assetService.ts` | Both | Present |
| 11 | `src/lib/services/dashboardService.ts` | Both | Present |
| 12 | `src/app/dashboard/page.tsx` | Main workspace only | Different — worktree has minimal version |
| 13 | `src/app/api/dashboard/finance/kpis/route.ts` | Main workspace only | **DOES NOT EXIST** in worktree |
| 14 | `prisma/schema.prisma` | Both | Present |
| 15 | `src/tests/managerDashboard.test.tsx` | Main workspace only | In `src/tests/`, not worktree `src/lib/services/` |

---

## 3. `ManagerDashboardMetrics` Type — Current Fields

From `src/lib/services/managerDashboardService.ts` (main workspace, 17,695 bytes):

```typescript
export interface ManagerDashboardMetrics {
  source: 'database';

  // Duplicated under two keys for backward compat
  summary: ManagerWorkOrderSummary;
  workOrders: ManagerWorkOrderSummary;

  // Duplicated under two keys
  technicians: TechnicianWorkload[];
  technicianWorkload: TechnicianWorkload[];

  pendingApprovals: PendingApprovalItem[];

  // Duplicated under two keys
  alerts: OperationalAlert[];
  operationalAlerts: OperationalAlert[];

  // Duplicated under two keys
  pmSummary: PreventiveMaintenanceSummary;
  maintenancePlans: PreventiveMaintenanceSummary;

  assetSummary: AssetConditionSummary;
}
```

### Sub-types:

**`ManagerWorkOrderSummary`**
```
total, open, assigned, inProgress, onHold, completed,
overdue, pendingRequests, criticalOpen, unassigned
```

**`TechnicianWorkload`**
```
userId, name, assignedCount, inProgressCount, completedCount, overdueCount
```

**`PendingApprovalItem`**
```
id, targetId, entityId, entityType, requestAmount (string),
currentStepOrder, totalSteps, createdAt (ISO string),
makerName, stepName
```

**`OperationalAlert`**
```
id, type ('overdue'|'critical'|'unassigned'|'pending_request'),
workOrderNumber, title, priority, status,
assetName?, locationName?, plannedEnd? (ISO string),
createdAt (ISO string), href
```

**`PreventiveMaintenanceSummary`**
```
total, active, overdueCount, dueSoonCount
```

**`AssetConditionSummary`**
```
total, down, inMaintenance
```

---

## 4. `getManagerDashboardMetrics()` — Prisma Queries Executed

The function runs **13 parallel Promise.all blocks**:

1. `workOrder.groupBy({ by: ['status'] })` — work order status distribution
2. `workOrder.count()` — overdue (active status + plannedEnd < now)
3. `workRequest.count({ status: 'SUBMITTED' })` — pending requests
4. `workOrder.count()` — critical/urgent open WOs (priority CRITICAL|URGENT, status OPEN|ASSIGNED|IN_PROGRESS)
5. `workOrder.count()` — unassigned open WOs (status OPEN, assignedUserId null)
6. `workOrder.findMany({ take: 5, orderBy: plannedEnd asc })` — overdue alert records
7. `workOrder.findMany({ take: 5, orderBy: createdAt desc })` — critical alert records
8. `workOrder.findMany({ take: 5, orderBy: createdAt asc })` — unassigned alert records
9. `workRequest.findMany({ take: 5 })` — pending request alert records
10. `user.findMany({ where: { assignedWorkOrders.some: baseWoWhere }, take: 20 })` — technician workload with nested WO statuses
11. `approvalRequest.findMany()` — pending approvals (status PENDING, makerUserId ≠ user.id), then filtered by `isApprovalInUserScope()` for WORK_ORDER, PURCHASE_ORDER, PURCHASE_REQUISITION
12. `maintenancePlan.count()` × 4 — total, active, overdue, due soon (branched by scope)
13. `asset.groupBy({ by: ['status'] })` — asset condition counts (scoped via `getScopedAssetFilter`)

All work-order queries use `getScopedWorkOrderFilter(user)` for tenant isolation.

---

## 5. `manager-stats` API Route

**Path:** `GET /api/dashboard/manager-stats`  
**Wrapper:** `withApiSecurity({ realm: 'STAFF', resource: 'work_order', action: 'read' }, handler)`  
**Permission required:** `work_order:read` (or wildcard `*:*`)  
**Auth:** `getCurrentUser(req)` via `withApiSecurity` — rejects unauthenticated requests with 401  
**Error handling:** `handleApiError(error)` from `src/lib/db-errors.ts`

The worktree's `src/app/api/dashboard/stats/route.ts` uses a simpler pattern — `getCurrentUser(req)` directly without `withApiSecurity`. The manager-stats route must use `withApiSecurity`.

---

## 6. `FinanceDashboardView.tsx` — Design Patterns to Replicate

From `src/components/dashboard/FinanceDashboardView.tsx` (main workspace):

**Header / Quick Action Toolbar:**
```tsx
<div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
  <div>
    <h2 className="text-sm font-bold text-[#0B1336]">Title</h2>
    <p className="text-xs text-slate-500">Subtitle</p>
  </div>
  <div className="flex items-center gap-2">
    <Link ... className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
      <Icon className="h-3.5 w-3.5 text-[#FF5B00]" /> Secondary Action
    </Link>
    <Link ... className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]">
      <Plus className="h-4 w-4" /> Primary Action
    </Link>
  </div>
</div>
```

**KPI Card Grid:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4` using `SimpleKpiCard`  
**Sections:** `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`  
**Section header:** flex items-center justify-between + h3 `text-sm font-bold text-[#0B1336]`  
**Table:** `w-full text-left text-xs` with `border-b border-slate-100 text-slate-400` headers and `divide-y divide-slate-50` rows  
**Empty state:** Centered icon (orange circle bg), bold title, secondary text, orange CTA button  
**API pattern:** `fetch('/api/dashboard/finance/kpis')` in `useEffect` triggered on `[loading, user]`

The existing `ManagerDashboardView.tsx` (main workspace) already closely follows `DashboardView.tsx` patterns with the deep-navy hero header. The brief requires upgrading it to match the Finance Dashboard's higher visual quality. The key design divergence is:
- Finance uses `SimpleKpiCard` (simpler, 4-column grid)
- Manager should use `KpiCard` (richer, with progress bars, 8-card grid per brief)

---

## 7. `KpiCard.tsx` — Full Interface

```typescript
export interface KpiCardSegment {
  label: string;
  count: number;
  value: number;   // percentage 0-100
  color: string;   // Tailwind class e.g. 'bg-[#FF5B00]'
}

export interface KpiCardProps {
  category?: string;       // ALL CAPS label above title
  title: string;
  href: string;
  icon: LucideIcon;
  tone: 'navy' | 'orange' | 'emerald' | 'amber' | 'rose';
  value: string | number;
  badgeText?: string;
  subDetail?: string;
  progressBar?: {
    type: 'single' | 'segmented';
    value?: number;         // for 'single'
    color?: string;         // for 'single'
    segments?: KpiCardSegment[];  // for 'segmented'
  };
  footerText: string;
  footerTrend?: 'up' | 'down' | 'neutral' | 'check';
}
```

**`toneStyles`** (icon badge bg/text):
```
navy:    bg-slate-100 text-[#0B1336]
orange:  bg-orange-50 text-[#FF5B00]
emerald: bg-emerald-50 text-emerald-700
amber:   bg-amber-50 text-amber-800
rose:    bg-rose-50 text-rose-700
```

---

## 8. `DashboardView.tsx` — Helper Components (Worktree)

The worktree `DashboardView.tsx` exports/uses these **local** helper components:

| Component | Signature | Use |
|-----------|-----------|-----|
| `Panel` | `{ children, className? }` | White card with border/shadow |
| `SectionHeading` | `{ title, detail?, href?, linkLabel? }` | Section title + optional "View all" link |
| `HorizontalBars` | `{ items: { label, value, color }[] }` | Proportional progress bars |
| `StatusBadge` | `{ value: string }` | Colored status pill (COMPLETED=emerald, ON_HOLD=amber, OPEN=blue) |

The existing `ManagerDashboardView.tsx` (main workspace) uses its own local versions:
- `Panel` — same interface but `px-0` (content inside PanelHeader/body)
- `PanelHeader` — `{ title, detail?, href?, linkLabel? }` with border-b and px-5 py-4
- `HBar` — same as HorizontalBars with `h-1.5` bars
- `PriorityPill` — colored by CRITICAL/URGENT/HIGH/MEDIUM
- `StatusPill` — colored by COMPLETED/IN_PROGRESS/ASSIGNED/ON_HOLD/OPEN

---

## 9. `auth.ts` — Key Exports

```typescript
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  roleId: string;
  role: {
    id: string; name: string;
    permissions?: { permission: { resource: string; action: string } }[];
  };
  branchId: string;
  branch: { id: string; name: string; code: string; type: string };
  departmentId?: string | null;
  department?: { id: string; name: string; code: string } | null;
  accessScope: string;   // 'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own'
  approvalLimit?: any;
  isActive: boolean;
  locale: string;
}

export function hasPermission(user, resource: string, action: string): boolean
  // Admin role → always true; otherwise checks role.permissions array

export async function requireAuth(options?: { roles?, resource?, action? }): Promise<AuthenticatedUser>
  // Throws AuthenticationError (401) or ForbiddenError (403)

export async function getCurrentUser(req?: NextRequest): Promise<AuthenticatedUser | null>
  // Reads zemifix_session cookie, verifies JWT, loads full user+role+branch+dept from DB
```

**AccessScope enum values:** `Own | Department | Branch | BranchAndBelow | Company`

---

## 10. `auth-context.tsx` — `useAuth()` Hook

```typescript
interface AuthContextType {
  user: UserSession | null;      // null until loaded
  loading: boolean;
  selectedBranch: string;        // defaults to 'Accra Head Office', set from user.branch.name
  setSelectedBranch: (name: string) => void;
  login, verifyOtp, resendOtp, loginDemo, logout, refreshUser
}

// UserSession shape (client-side, subset of AuthenticatedUser):
interface UserSession {
  id, name, email, phone?,
  role: { id, name },
  branch: { id, name, code, type },
  department?: { id, name, code } | null,
  accessScope: string,
  approvalLimit?: number | null
}
```

**Usage pattern in dashboard components:**
```typescript
const { user, selectedBranch } = useAuth();
// user.role.name → role-based routing
// user.accessScope → branch selector label
// selectedBranch → display-only label in header
```

---

## 11. `workOrderService.ts` — `getScopedWorkOrderFilter()`

```typescript
export async function getScopedWorkOrderFilter(user: AuthenticatedUser): Promise<Prisma.WorkOrderWhereInput>
```

Returns a Prisma `WHERE` clause scoped by `user.accessScope`:

| Scope | Filter |
|-------|--------|
| `Company` | `{ deletedAt: null }` (all records in company) |
| `BranchAndBelow` | `{ OR: [branch.path.startsWith(userBranchPrefix), ...grantedBranchPaths] }` |
| `Branch` | `{ branchId: { in: [userBranchId, ...grantedBranchIds] } }` |
| `Department` | `{ departmentId: { in: [userDeptId, ...grantedDeptIds] } }` |
| `Own` | `{ OR: [assignedUserId: user.id, supervisorUserId: user.id] }` |

Always appends `OR [assignedUserId, supervisorUserId]` for Branch/BranchAndBelow/Department to ensure own WOs are visible.

Reads `UserScopeGrant` table for explicit grants beyond base scope.

---

## 12. `assetService.ts` — `getScopedAssetFilter()`

```typescript
export async function getScopedAssetFilter(user: AuthenticatedUser): Promise<Prisma.AssetWhereInput>
```

Same scope pattern as work orders but asset-specific fields:

| Scope | Filter |
|-------|--------|
| `Company` | `{ deletedAt: null }` |
| `BranchAndBelow` | `{ OR: [branch.path.startsWith(...), managingBranch.path.startsWith(...), ...grants] }` |
| `Branch` | `{ OR: [branchId: { in: validIds }, managingBranchId: { in: validIds }] }` |
| `Department` | `{ OR: [location.departmentId: { in: deptIds }, responsibleDepartmentId: { in: deptIds }] }` |
| `Own` | `{ OR: [custodianUserId: user.id, responsibleUserId: user.id] }` |

**Key difference from WO filter:** throws `UNAUTHORIZED_BRANCH_SCOPE` for BranchAndBelow without path; WO filter falls back gracefully.

---

## 13. `dashboardService.ts` — `getDashboardMetrics()` / `LiveDashboardMetrics`

This is the **Admin / Company Overview** dashboard service. It is **NOT scoped by user** (passes `user` only for display metadata). Key type:

```typescript
export interface LiveDashboardMetrics {
  organization: { companyName, baseCurrency, accessScope, totalBranches, totalDepartments, totalStaff, branchesList, departmentsList }
  source: 'database' | 'demonstration_mode';
  isDemoData: boolean;
  workOrders: { total, open, assigned, inProgress, onHold, completed, overdue, pendingRequests }
  assets: { total, operational, down, inMaintenance, availabilityPercentage, totalDowntimeMinutes }
  inventory: { totalPartCount, totalStockValue, lowStockCount }
  procurement: { pendingRequisitions, issuedPurchaseOrders, totalProcurementSpend }
  slaAndContracts: { activeContracts, slaBreachCount }
  finance: { totalInvoicedAmount, paidAmount, outstandingReceivables, internalRechargesCount, totalInternalRechargeAmount }
  recentWorkOrders: Array<{ id, workOrderNumber, title, status, priority, assetName?, locationName?, createdAt }>
}
export type DashboardStatistics = LiveDashboardMetrics;
```

The Manager dashboard does NOT use this service. It uses `managerDashboardService.getManagerDashboardMetrics()`.

---

## 14. `dashboard/page.tsx` (Main Workspace) — DashboardRouter

The main dashboard page routes users by role/permission:

```typescript
// Workspace keys and routing conditions:
'admin'       → DashboardView (Admin role or settings:manage + Company scope)
'finance'     → FinanceDashboardView (finance|cashier|billing role, or invoice:read/create/approve)
'manager'     → ManagerDashboardView (manager|supervisor role, or work_order:read/approve)
'planner'     → PlannerDashboardView (planner|dispatcher role, or work_order:schedule/assign)
'storekeeper' → StorekeeperDashboardView (storekeeper|inventory role, or inventory:read/stock:issue)
'technician'  → TechnicianDashboardView (technician role, or work_order:start/execute/update)
```

Role matching uses `RegExp.test(user.role.name)`:
- Manager: `/manager|supervisor/i`
- Finance: `/finance|cashier|billing/i`
- Planner: `/planner|dispatcher/i`
- Storekeeper: `/storekeeper|inventory/i`
- Technician: `/technician/i`
- Admin: `/admin|administrator/i`

**Worktree `dashboard/page.tsx`** is the old minimal version: `<Shell><DashboardView /></Shell>`. It needs to be replaced with the full DashboardRouter.

---

## 15. `finance/kpis` Route Pattern

**Path:** `GET /api/dashboard/finance/kpis`  
**Wrapper:** `withApiSecurity({ realm: 'STAFF' }, handler)`  
**Permission check:** custom `canReadFinance()` inside handler (invoice:read|create|approve or role name match)  
**Returns:**
```json
{
  "outstanding": number,
  "paid": number,
  "overdue": number,
  "totalReceivable": number,
  "collected": number,
  "recentInvoices": [{ id, invoiceNumber, total, paid, status, dueDate, customer }]
}
```

**Pattern to follow for manager-stats:** Use `withApiSecurity` wrapper with explicit `resource: 'work_order', action: 'read'`.

---

## 16. Prisma Schema — Key Models and Enums

### `WorkOrder` model — fields relevant to manager dashboard:
```
id, workOrderNumber, title, description,
type: WorkOrderType (CORRECTIVE|PREVENTIVE|EMERGENCY|INSPECTION|GENERAL)
priority: WorkOrderPriority (LOW|MEDIUM|HIGH|URGENT|EMERGENCY)
status: WorkOrderStatus (DRAFT|PENDING_APPROVAL|APPROVED|OPEN|ASSIGNED|IN_PROGRESS|ON_HOLD|COMPLETED|CANCELLED)
assetId, locationId, branchId, departmentId,
supervisorUserId, assignedUserId,
plannedStart, plannedEnd, actualStart, actualEnd,
estimatedHours, actualHours, estimatedCost, totalCost,
slaPolicyId, slaResponseTargetMinutes, slaResolutionTargetMinutes,
slaBreaches: SlaBreachLog[],
maintenancePlanId
```

### `Asset` model — status and availability fields:
```
status: AssetStatus (OPERATIONAL|DEGRADED|DOWN|IN_MAINTENANCE|STANDBY|RETIRED|DISPOSED)
criticality: Int (1-5, default 3)
branchId, managingBranchId, locationId, siteId,
responsibleUserId, responsibleDepartmentId, custodianUserId,
purchaseCost, purchaseDate, warrantyExpiry
```

### `ApprovalRequest` model:
```
id, entityType (WORK_ORDER|PURCHASE_ORDER|PURCHASE_REQUISITION|...),
entityId, makerUserId,
requestAmount: Decimal,
status: ApprovalRequestStatus (PENDING|APPROVED|REJECTED),
currentStepOrder, totalSteps, payloadHash
steps: ApprovalStep[]
```

### `MaintenancePlan` model:
```
id, code, name, assetId, branchId,
triggerType: PMTriggerType (TIME|METER),
frequency, status: PMPlanStatus (ACTIVE|PAUSED|COMPLETED),
lastCompleted?, nextDue, isOverdue, compliancePercent
```

### `SlaBreachLog` model:
```
id, workOrderId, slaPolicyId, priority, breachType: SlaBreachType,
slaCycle, targetMinutes, actualElapsedMinutes, breachedAt
Unique: [workOrderId, breachType, slaCycle]
```

### `InternalRecharge` model:
```
rechargeNumber, workOrderId, fromDepartmentId, toDepartmentId,
amount, description, rechargeDate, recordedByUserId
Unique: workOrderId (one recharge per WO)
```

### No `Budget` model exists in the schema. There is no `Budget`, `BudgetAllocation`, or `Expenditure` model. Maintenance expenditure data is derivable from `WorkOrder.totalCost` (aggregation) and `WorkOrderLabor.totalCost` + `WorkOrderPart.unitCost × quantityConsumed`. Internal cost tracking uses `InternalRecharge`.

---

## 17. Brief's 8 KPI Cards vs Current 6 KPI Cards

### Current ManagerDashboardView KPI cards (6 cards, xl:grid-cols-3):

| # | Card Title | Category | Tone | Data Source |
|---|-----------|----------|------|-------------|
| 1 | Active Work Orders | EXECUTION PIPELINE | navy | `wo.open + wo.assigned + wo.inProgress + wo.onHold` |
| 2 | Overdue Work Orders | COMPLIANCE | rose/emerald | `wo.overdue` |
| 3 | Pending Service Requests | TRIAGE | amber/navy | `wo.pendingRequests` |
| 4 | Critical / Urgent Open | CRITICAL OPERATIONS | rose/emerald | `wo.criticalOpen` |
| 5 | Unassigned Work Orders | ASSIGNMENT GAP | amber/emerald | `wo.unassigned` |
| 6 | PM Plans Active | PREVENTIVE MAINTENANCE | rose/amber/emerald | `metrics.maintenancePlans` |

### Brief's 8 Requested KPI Cards:

| # | Brief Card | Maps To |
|---|-----------|---------|
| 1 | Total Work Orders | `wo.total` ← **currently shown as badge text only** |
| 2 | Open Work Orders | `wo.open` ← **subsumed in card 1** |
| 3 | Completed Work Orders | `wo.completed` ← **currently shown as footer only** |
| 4 | Overdue Work Orders | `wo.overdue` ← **card 2 above** ✓ |
| 5 | SLA Compliance | % of WOs meeting SLA targets ← **NOT in service** |
| 6 | Asset Availability | % operational assets ← **NOT in service** (assetSummary lacks operational count) |
| 7 | Maintenance Expenditure | Sum of `WorkOrder.totalCost` for period ← **NOT in service** |
| 8 | Pending Approvals | `pendingApprovals.length` ← **shown in panel only, no KPI card** |

### Gaps between current 6 and brief's 8:

1. **SLA Compliance %** — `ManagerDashboardMetrics` has no SLA compliance percentage field. `SlaBreachLog` exists in schema but only `slaBreachCount` from admin dashboard. The service must add: total WOs with SLA policy, breached WOs count → compliance rate.
2. **Asset Availability %** — `assetSummary` has `{total, down, inMaintenance}` but not `operational`. Must add `operational` count or compute `availabilityPercentage` = `(total - down) / total × 100`.
3. **Maintenance Expenditure** — No field in `ManagerDashboardMetrics`. Requires new Prisma query: `workOrder.aggregate({ _sum: { totalCost: true }, where: { ...woScopeWhere, actualEnd: { gte: periodStart } } })`.
4. **Pending Approvals as KPI card** — The count is available via `pendingApprovals.length` on the client, but adding an explicit `pendingApprovalsCount` field to the metrics type would be cleaner.

---

## 18. Sections in Brief NOT Yet in `managerDashboardService`

The brief requests these sections that have no corresponding data in the current service:

### Section 5: Work Order Performance (Charts)
- **WO Status Distribution** — `wo.{open,assigned,inProgress,onHold,completed}` ✓ already available
- **WO Completion Trend** — ❌ No time-series data. Needs `workOrder.groupBy({ by: ['status', createdAt-bucket] })` or count by date range.
- **WO by Priority** — ❌ Not in service. Needs `workOrder.groupBy({ by: ['priority'] })`.
- **WO Backlog / Age Distribution** — ❌ Not in service. Needs age-bucket computation.

### Section 6: SLA Performance
- **SLA Compliance %** — ❌ Not in service. Needs `slaBreachLog.count` scoped to WOs in user scope, plus total WOs with SLA policy.
- **Jobs meeting response/resolution targets** — ❌ Not in service. Needs join of WO with SlaBreachLog.
- **PM Compliance** — `maintenancePlans.compliancePercent` exists per plan but not aggregated.
- `SlaBreachLog` table exists; `SlaPolicy` and `SlaRule` exist for target data.

### Section 7: Asset Performance
- **Asset table (requiring attention)** — ❌ Not in service. Needs `asset.findMany({ where: { OR: [status: DOWN|IN_MAINTENANCE, criticality: ≥ 4] }, include: { workOrders: { where: { status open } }, ... } })`.
- **Asset Availability over time** — ❌ Not in service. Would need `AssetDowntimeLog` aggregation.
- **Assets with repeated failures** — ❌ Not in service. Needs `WorkOrderFailureRecord` or `WorkOrder.groupBy({ by: ['assetId'] })`.

### Section 8: Branch Performance
- ❌ Entirely absent from service. Needs per-branch aggregation: `workOrder.groupBy({ by: ['branchId'] })` joined to branch names.
- Only relevant if `user.accessScope === 'Company' | 'BranchAndBelow'` with multiple branches.

### Section 9: Maintenance Cost / Budget
- **Maintenance Expenditure (period)** — ❌ Not in service. Needs `workOrder.aggregate(_sum.totalCost)` scoped to period + user scope.
- **Budget** — ❌ **No Budget model in schema**. Brief mentions "Budget allocated / Remaining budget / Budget utilisation %" but these cannot be served without a Budget model. The brief says "use actual financial and budget services" — this is not implementable without schema changes unless it is derived from `estimatedCost` vs `totalCost`.
- **Cost by maintenance category** — ❌ Not in service. Needs `workOrder.groupBy({ by: ['type'] }, _sum: { totalCost })`.

### Section 10: Pending Approvals (Full Table)
- **Full approval table with maker name, type, date, amount, status** — ✓ Already in `pendingApprovals[]` array.
- **Approve / Reject actions** — ❌ Not in the dashboard service (approval actions go to separate approval service endpoints, which exist in `approvalService.ts`).

### Section 11: Operational Alerts
- **Overdue, critical, unassigned WOs** — ✓ Already in `operationalAlerts[]`.
- **SLA breach alerts** — ❌ Not in service. Need `slaBreachLog.findMany` scoped to user.
- **Emergency WOs** — ❌ Not in service. Need `workOrder.findMany({ type: 'EMERGENCY' })`.
- **Overdue PM plans** — ✓ `maintenancePlans.overdueCount` available, but no alert records.
- **Budget threshold warnings** — ❌ No Budget model.
- **Repeated asset failures** — ❌ Not in service.

### Section 12: Recent Activity
- **Recently created WOs** — ❌ Not in `ManagerDashboardMetrics`. Exists in `LiveDashboardMetrics.recentWorkOrders` (admin service). Needs to be added.
- **Recently completed WOs** — ❌ Not in service.
- **Recent work requests** — ❌ Not in service.
- **Approval activity** — ❌ Not in service.

### Section 13: Quick Actions (Full Toolbar)
- Current view has 3 quick actions in hero header (Work orders, Requests, Preventive maintenance).
- Brief requests: View Work Orders, Review Approvals, View Maintenance Requests, View Asset Register, View Preventive Maintenance, View Reports.
- Current "Quick access" panel has 6 links: Work orders, Service requests, PM plans, Assets, Workers, Reports. ✓ Mostly covered but needs styling upgrade to match Finance toolbar pattern.

---

## 19. Summary Gap Table

| Required Feature | In Current Service | In Current View | Gap Type |
|-----------------|-------------------|-----------------|----------|
| Total WOs KPI card | ✓ `wo.total` | ❌ badge only | UI gap |
| Open WOs KPI card | ✓ `wo.open` | ❌ in composite card | UI gap |
| Completed WOs KPI card | ✓ `wo.completed` | ❌ footer only | UI gap |
| Overdue WOs KPI card | ✓ `wo.overdue` | ✓ dedicated card | ✓ |
| SLA Compliance % KPI | ❌ | ❌ | Service + UI gap |
| Asset Availability % KPI | Partial (`total`, `down`) | ❌ no KPI card | Service (need operational) + UI gap |
| Maintenance Expenditure KPI | ❌ | ❌ | Service + UI gap |
| Pending Approvals KPI card | Available as array length | ❌ panel only | UI gap |
| WO Completion Trend (chart) | ❌ | ❌ | Service + UI gap |
| WO by Priority distribution | ❌ | ❌ | Service + UI gap |
| WO Backlog / age | ❌ | ❌ | Service + UI gap |
| SLA metrics section | ❌ | ❌ | Service + UI gap |
| Asset attention table | ❌ | ❌ | Service + UI gap |
| Branch performance section | ❌ | ❌ | Service + UI gap |
| Budget monitoring | ❌ (no model) | ❌ | Schema gap — use `estimatedCost` vs `totalCost` |
| Full approval table | ✓ | ✓ panel | ✓ (UI polish only) |
| SLA breach alerts | ❌ | ❌ | Service + UI gap |
| Emergency WO alerts | ❌ | ❌ | Service + UI gap |
| PM overdue alerts (records) | Count only | Count only | Service gap |
| Recent activity feed | ❌ | ❌ | Service + UI gap |
| Quick actions toolbar | Partial (3 actions) | Partial | UI gap |
| Header redesign | — | Exists, needs upgrade | UI gap |
| FinanceDashboardView design | — | Partial match | UI gap |

---

## 20. Routes, Permissions, and Access Scope Patterns to Preserve

### API routes to preserve (do not modify):
- `GET /api/dashboard/stats` — admin overview, uses `getDashboardMetrics()`
- `GET /api/dashboard/finance/kpis` — finance workspace
- `GET /api/dashboard/planner/kpis` — planner workspace
- `GET /api/dashboard/storekeeper/kpis` — storekeeper workspace

### New route to create:
- `GET /api/dashboard/manager-stats` — using `withApiSecurity({ realm: 'STAFF', resource: 'work_order', action: 'read' })`

### Access scope values and enforcement:
- `user.accessScope`: `'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own'`
- All WO queries: via `getScopedWorkOrderFilter(user)` — **must not bypass**
- All asset queries: via `getScopedAssetFilter(user)` — **must not bypass**
- PM plan scope: custom branch-path logic in `managerDashboardService.ts` (replicate exactly)
- Approval scope: `isApprovalInUserScope()` helper (replicate exactly, do not loosen)
- Branch performance: only show if user has access to multiple branches (`accessScope === 'Company' | 'BranchAndBelow'`)

### Permission checks:
- Dashboard routing: `work_order:read` or `work_order:approve` (from `page.tsx`)
- API route: `work_order:read` (from `manager-stats/route.ts`)
- Maker-checker: `approvalRequest.makerUserId !== user.id` enforced at service layer

### Audit and tenant isolation:
- Never expose `passwordHash` from User model
- Never expose approval records outside `isApprovalInUserScope()` scope
- SLA breach data should be scoped to `woScopeWhere` join (breach.workOrderId IN scoped WOs)

---

## 21. Existing Test Coverage

**File:** `src/tests/managerDashboard.test.tsx` (28,425 bytes)  
**Framework:** Vitest + React Testing Library (jsdom environment)  
**Coverage:** Component-level tests with mocked fetch and auth — no DB required

Tests cover:
- Skeleton shown while loading
- Error banner on fetch failure with retry button
- KPI cards rendered with correct values (active WOs, overdue, pending requests, critical/urgent, unassigned, PM plans)
- Empty state when no data
- Operational alerts section (alerts shown or empty state)
- Pending approvals section (items shown or empty state)
- Technician workload section
- Quick access panel links
- Access scope badge in header
- Role-specific behavior (manager vs supervisor vs technician vs admin)

Tests **not yet written** (new sections):
- SLA compliance KPI card
- Asset availability KPI card
- Maintenance expenditure KPI card
- Branch performance section
- Recent activity feed
- Upgraded Quick Actions toolbar

---

## 22. Build and Test Commands

From `package.json` (discovered from worktree):

```bash
# Build
npx next build

# Type check
npx tsc --noEmit

# Unit tests (all)
npx vitest run

# Unit tests (manager dashboard only)
npx vitest run src/tests/managerDashboard

# Dev server
npx next dev
```

Vitest config is in `vitest.config.ts` at repo root.

---

## 23. Files the Implementation Must Create/Modify

### New files in worktree:
1. `src/lib/services/managerDashboardService.ts` — extended from main workspace version
2. `src/components/dashboard/ManagerDashboardView.tsx` — full redesign
3. `src/app/api/dashboard/manager-stats/route.ts` — port from main workspace
4. `src/components/dashboard/FinanceDashboardView.tsx` — port from main workspace (reference only)
5. `src/components/dashboard/SimpleKpiCard.tsx` — port from main workspace (used by Finance)
6. `src/components/dashboard/WorkspaceSelector.tsx` — port from main workspace (used by page.tsx)
7. `src/components/dashboard/TechnicianDashboardView.tsx` — port from main workspace (used by page.tsx)
8. `src/components/dashboard/PlannerDashboardView.tsx` — port from main workspace (used by page.tsx)
9. `src/components/dashboard/StorekeeperDashboardView.tsx` — port from main workspace (used by page.tsx)

### Modified files in worktree:
10. `src/app/dashboard/page.tsx` — replace minimal version with full DashboardRouter

### Test file to create in worktree:
11. `src/tests/managerDashboard.test.tsx` — port and extend from main workspace

---

## 24. Key Design Decisions for Implementation

1. **Budget section**: No `Budget` model exists in schema. Implement "Maintenance Cost Overview" using `WorkOrder.totalCost` (actual) vs `WorkOrder.estimatedCost` (planned) aggregated over scope and period. Label clearly as "Estimated vs Actual Cost" — do not claim it is "budget".

2. **Charts**: The brief requests "donut or horizontal bar charts" but no chart library is imported in any existing component. Use SVG-based or Tailwind CSS percentage bars (as `HorizontalBars` already does). Do not add a heavy chart library without confirming it's already a dependency.
   - Check `package.json` for `recharts`, `chart.js`, `d3` before deciding.

3. **Date range selector**: The brief requests a date range selector for the header. The current `selectedBranch` state in `useAuth` is a client-side display label. Implement date range as local component state (`useState<{ from: Date; to: Date }>`) passed down to the API as query params (`?from=&to=`). The service must accept optional `from`/`to` params.

4. **Branch selector in header**: The brief says "branch selector must respect the Manager's assigned access scope." `selectedBranch` from `useAuth` already reflects `user.branch.name`. For managers with Company/BranchAndBelow scope, the branch list comes from `organization.branchesList` in `LiveDashboardMetrics`. Use `useAuth().user.branch.name` as default; allow switching only within scoped branches.

5. **SLA compliance**: Compute as `(WOs with SLA policy that have no breach) / (total WOs with SLA policy) × 100`. Use `slaBreachLog.count({ where: { workOrderId: { in: scopedWoIds }, breachType: 'RESOLUTION' } })` and `workOrder.count({ where: { ...scope, slaPolicyId: { not: null } } })`.

6. **`authWrapper.ts`**: The worktree has the same auth files. The `withApiSecurity` wrapper is in `src/lib/authWrapper.ts` — present in both worktree and main.

