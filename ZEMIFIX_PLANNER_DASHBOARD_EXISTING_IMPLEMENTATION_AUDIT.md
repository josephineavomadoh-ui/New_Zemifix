# ZemiFix Planner Dashboard — Existing Implementation & Completion Audit

## 1. Executive Summary
This audit inspects the current state of the ZemiFix Planner / Dispatcher Dashboard (`PlannerDashboardView.tsx`) and its supporting backend API (`/api/dashboard/planner/kpis`). 

While the Planner role routing, basic KPI fetching (Backlog, Unassigned, Overdue, Due Soon), and quick access links (`/work-orders`, `/work-orders/new`) are operational, the dashboard currently lacks deep interactive widgets such as calendar views, technician workload distribution, unassigned dispatch queues, preventive maintenance (PM) scheduling summaries, and material availability checks. This audit provides a comprehensive breakdown of completion status, architectural alignment, security boundaries, and a prioritized implementation roadmap for the upcoming Planner Dashboard redesign.

---

## 2. Existing Planner Architecture
- **Workspace Route**: `/dashboard` (`src/app/dashboard/page.tsx`) dynamically routes users with Planner / Dispatcher roles or `work_order:schedule` / `work_order:assign` permissions to the lazy-loaded `PlannerDashboardView`.
- **Component File**: `src/components/dashboard/PlannerDashboardView.tsx` (3.8KB).
- **API Endpoint**: `src/app/api/dashboard/planner/kpis/route.ts` protected by `withApiSecurity({ realm: 'STAFF' })`.
- **Data Access**: Leverages Prisma models (`workOrder`, `asset`, `inventoryItem`) adhering to branch and department access scoping rules via `getScopedWorkOrderFilter`.

---

## 3. Dashboard Section Completion Matrix

| Section | What to inspect | Status | Notes |
|---|---|---|---|
| Dashboard Overview | KPIs and planning summaries | **PARTIALLY COMPLETE** | Basic KPIs (Backlog, Unassigned, Overdue, Due Soon) exist; missing trend analysis & summary charts. |
| Planning Calendar | Daily, weekly and monthly maintenance schedules | **MISSING** | Links to `/work-orders`, but no embedded calendar widget. |
| Work Order Backlog | Unscheduled and unassigned work orders | **UI ONLY** | KPI count exists, but no dedicated backlog table or queue view. |
| Preventive Maintenance | PM plans, schedules and upcoming activities | **MISSING** | No PM schedule widget or recurring generator status. |
| PM Compliance | Completed, overdue and upcoming PM activities | **MISSING** | Not currently tracked on the planner dashboard. |
| Work Order Scheduling | Scheduling and rescheduling workflows | **BACKEND ONLY** | Supported in core work order management API, but no inline scheduling controls on dashboard. |
| Technician Availability | Available technicians and workload | **MISSING** | No technician capacity or load balancing widget. |
| Resource Allocation | Assignment of work to technicians | **UI ONLY** | "Unassigned" count is displayed, but direct assignment dispatch modal is missing from dashboard. |
| Priority Management | High-priority and critical maintenance | **MISSING** | Breakdown by priority (Emergency, High, Medium, Low) is not yet shown. |
| Maintenance Requests | Requests awaiting assessment and scheduling | **MISSING** | Public QR requests awaiting planner triage need a dedicated queue widget. |
| Asset Maintenance | Maintenance history and upcoming servicing | **MISSING** | Asset maintenance history links are general rather than planner-centric. |
| Material Availability | Parts required for scheduled jobs | **MISSING** | Stock check / inventory reservations before dispatch not displayed. |
| Schedule Conflicts | Technician, asset and scheduling conflicts | **MISSING** | Overlapping schedule detection is not surfaced in UI. |
| Recent Activity | Actual planning and scheduling events | **MISSING** | Audit stream of recent planning actions is missing. |
| Quick Actions | Functional planning operations | **COMPLETE** | Quick links to Maintenance Calendar and New Work Order are fully functional. |

---

## 4. Planning Workflow Assessment

1. **Request/Task Creation**: **[COMPLETE]** Public QR requests or PM triggers correctly populate the maintenance queue.
2. **Planner Review**: **[PARTIALLY COMPLETE]** Planners can view basic unassigned counts, but lack a dedicated triage workbench.
3. **Priority & Requirement Assessment**: **[BACKEND ONLY]** Data model supports priorities and asset linking; UI controls pending.
4. **Technician Availability Check**: **[MISSING]** No active roster or shift availability widget.
5. **Material Availability Check**: **[MISSING]** Parts reservation status is not integrated into dispatch view.
6. **Schedule Work**: **[BACKEND ONLY]** Planned start/end dates are stored in DB; calendar drag/drop or quick rescheduling is missing.
7. **Assign Technician**: **[BACKEND ONLY]** `assignedUserId` field exists; inline assignment dispatch action is missing.
8. **Technician Execution**: **[COMPLETE]** Assigned work orders seamlessly transition to Technician PWA view.
9. **Work Completion & Verification**: **[COMPLETE]** Standard maintenance lifecycle closure functions as designed.

---

## 5. Calendar and Scheduling Assessment
- **Views**: Daily, weekly, and monthly calendar views are currently absent from the dashboard (though referenced via `/work-orders`).
- **Drag-and-Drop / Rescheduling**: Not implemented.
- **Recurring PMs**: Supported in DB schema / service layer, but not surfaced in planner metrics.
- **Conflict Warnings**: Asset or technician double-booking detection is not yet highlighted in the UI.
- **Filters**: Branch, technician, asset, status, and priority filters are handled in the general work orders module rather than embedded in the planner dashboard.

---

## 6. API, Service, and Database Integrations
- **API Endpoint**: `/api/dashboard/planner/kpis` correctly computes scoped counts for `backlog`, `unassigned`, `overdue`, and `dueSoon`.
- **Database Models**: Prisma schema (`WorkOrder`, `Asset`, `User`, `InventoryItem`) provides robust relational foundations.
- **Security & Scoping**: Enforced via `withApiSecurity` and `getScopedWorkOrderFilter`, ensuring multi-tenant isolation and branch/department boundaries.

---

## 7. Security Findings
- **RBAC**: Properly restricted to roles matching `/planner|dispatcher/i` or users holding `work_order:read` / `work_order:assign` permissions.
- **Data Scoping**: Strictly filters queries by user branch and department access scopes.
- **Makers-Checkers**: Aligned with ZemiFix authorization rules.

---

## 8. Runtime Verification Evidence
- **Source Code Inspection**: Verified `PlannerDashboardView.tsx` and `route.ts`.
- **Automated Tests**: Core routing tests (`sidebarPermissions.test.ts`) confirm Planner role boundaries.
- **Dashboard Load**: Successfully renders header toolbar, KPI cards, and professional empty state when authenticated as a Planner.

---

## 9. Prioritized Gap Analysis
- **P1 (Important Missing Functionality)**:
  - Unassigned work order quick-dispatch queue table.
  - Technician workload distribution widget.
  - Preventive Maintenance (PM) compliance & upcoming schedules overview.
- **P2 (UI/UX Polish & Dash Sections)**:
  - Priority breakdown distribution chart.
  - Maintenance requests awaiting triage queue.
  - Material/parts availability indicator for scheduled jobs.
- **P3 (Enhancements)**:
  - Interactive schedule conflict warnings.

---

## 10. Recommended Implementation Sequence
1. **API Enhancement**: Expand `/api/dashboard/planner/kpis` (or introduce `/api/dashboard/planner/queue`) to supply unassigned work orders list, technician workload summary, and PM schedule counts.
2. **UI Component Construction**: Build modular widgets for `PlannerDashboardView`:
   - Quick-dispatch unassigned work order table with one-click technician assignment.
   - Technician workload distribution card.
   - Preventive maintenance schedule snapshot.
3. **Testing & Verification**: Write unit and integration tests covering planner queue management, technician assignment, and RBAC boundaries.
