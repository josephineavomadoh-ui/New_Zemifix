import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import type { AuthenticatedUser } from '../auth';
import { getScopedAssetFilter } from './assetService';
import { getScopedWorkOrderFilter } from './workOrderService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ManagerWorkOrderSummary {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  onHold: number;
  completed: number;
  overdue: number;
  pendingRequests: number;
  criticalOpen: number;
  unassigned: number;
}

export interface TechnicianWorkload {
  userId: string;
  name: string;
  assignedCount: number;
  inProgressCount: number;
  completedCount: number;
  overdueCount: number;
}

export interface PendingApprovalItem {
  id: string;
  targetId: string;
  entityId: string;
  entityType: string;
  requestAmount: string;
  currentStepOrder: number;
  totalSteps: number;
  createdAt: string;
  makerName: string;
  stepName: string;
}

export interface OperationalAlert {
  id: string;
  type: 'overdue' | 'critical' | 'unassigned' | 'pending_request';
  workOrderNumber: string;
  title: string;
  priority: string;
  status: string;
  assetName?: string;
  locationName?: string;
  plannedEnd?: string;
  createdAt: string;
  href: string;
}

export interface PreventiveMaintenanceSummary {
  total: number;
  active: number;
  overdueCount: number;
  dueSoonCount: number;
}

export interface AssetConditionSummary {
  total: number;
  down: number;
  inMaintenance: number;
}

export interface BacklogAgeingSummary {
  days0_7: number;
  days8_14: number;
  days15_30: number;
  days31_60: number;
  over60: number;
}

export interface SlaPerformanceSummary {
  totalTracked: number;
  activeBreaches: number;
  complianceRate: number;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'work_order' | 'request' | 'asset' | 'approval';
  referenceNumber: string;
}

export interface ManagerDashboardMetrics {
  source: 'database';
  summary: ManagerWorkOrderSummary;
  workOrders: ManagerWorkOrderSummary;
  technicians: TechnicianWorkload[];
  technicianWorkload: TechnicianWorkload[];
  pendingApprovals: PendingApprovalItem[];
  alerts: OperationalAlert[];
  operationalAlerts: OperationalAlert[];
  pmSummary: PreventiveMaintenanceSummary;
  maintenancePlans: PreventiveMaintenanceSummary;
  assetSummary: AssetConditionSummary;
  backlogAgeing: BacklogAgeingSummary;
  slaMetrics: SlaPerformanceSummary;
  recentActivity: RecentActivityItem[];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

async function isApprovalInUserScope(
  approval: any,
  user: AuthenticatedUser,
  db: Prisma.TransactionClient,
): Promise<boolean> {
  const type = approval.entityType as string;
  let targetId: string | undefined = approval.entityId;
  if (!targetId) return false;

  let target: { branchId?: string | null; departmentId?: string | null; branch?: { path: string } | null } | null = null;
  switch (type) {
    case 'WORK_ORDER':
      target = await db.workOrder.findUnique({
        where: { id: targetId },
        select: { branchId: true, departmentId: true, branch: { select: { path: true } } },
      });
      break;
    case 'PURCHASE_ORDER':
      target = await db.purchaseOrder.findUnique({
        where: { id: targetId },
        select: { branchId: true, departmentId: true, branch: { select: { path: true } } },
      });
      break;
    case 'PURCHASE_REQUISITION':
    case 'REQUISITION':
      target = await db.purchaseRequisition.findUnique({
        where: { id: targetId },
        select: { branchId: true, departmentId: true, branch: { select: { path: true } } },
      });
      break;
  }
  if (!target) return false;

  const access = user.accessScope;
  const userBranch = user.branchId ? await db.branch.findUnique({
    where: { id: user.branchId },
    select: { path: true },
  }) : null;

  if (access === 'Company') {
    if (!userBranch?.path || !target.branch?.path) return true;
    const userRoot = `/${userBranch.path.split('/').filter(Boolean)[0]}/`;
    const targetRoot = `/${target.branch.path.split('/').filter(Boolean)[0]}/`;
    return userRoot === targetRoot;
  }
  if (access === 'Branch') {
    return !!target.branchId && target.branchId === user.branchId;
  }
  if (access === 'BranchAndBelow') {
    if (!userBranch?.path || !target.branch?.path) return false;
    const prefix = userBranch.path.endsWith('/') ? userBranch.path : `${userBranch.path}/`;
    if (target.branch.path.startsWith(prefix)) return true;
    return false;
  }
  if (access === 'Department') {
    return !!target.departmentId && target.departmentId === user.departmentId;
  }
  return false;
}

// ─── Service Functions ───────────────────────────────────────────────────────

export async function getManagerDashboardMetrics(
  user: AuthenticatedUser,
  tx?: Prisma.TransactionClient
): Promise<ManagerDashboardMetrics> {
  let db: any = tx;
  if (!db) {
    db = prisma;
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const woScopeWhere = await getScopedWorkOrderFilter(user, db);

  const baseWoWhere = { ...woScopeWhere, deletedAt: null };
  const overdueWhere = {
    ...baseWoWhere,
    status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] as const },
    plannedEnd: { lt: now },
  };

  const [
    woCounts,
    overdueCount,
    pendingRequests,
    criticalOpenCount,
    unassignedCount,
    overdueAlerts,
    criticalAlerts,
    unassignedAlerts,
    pendingRequestAlerts,
    techWorkload,
    pendingApprovals,
    pmPlans,
    assetCounts,
    unresolvedWorkOrders,
    activeBreachesCount,
    recentWorkOrders,
  ] = await Promise.all([
    // 1. Work order status distribution
    db.workOrder.groupBy({
      by: ['status'],
      where: baseWoWhere,
      _count: { _all: true },
    }),

    // 2. Overdue count
    db.workOrder.count({ where: overdueWhere }),

    // 3. Pending service requests
    db.workRequest.count({ where: { status: 'SUBMITTED' } }),

    // 4. Critical open WOs
    db.workOrder.count({
      where: {
        ...baseWoWhere,
        status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
        priority: { in: ['CRITICAL', 'URGENT'] },
      },
    }),

    // 5. Unassigned open WOs
    db.workOrder.count({
      where: { ...baseWoWhere, status: 'OPEN', assignedUserId: null },
    }),

    // 6. Overdue alerts (top 5)
    db.workOrder.findMany({
      where: overdueWhere,
      take: 5,
      orderBy: { plannedEnd: 'asc' },
      select: {
        id: true,
        workOrderNumber: true,
        title: true,
        status: true,
        priority: true,
        plannedEnd: true,
        createdAt: true,
        asset: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),

    // 7. Critical open alerts (top 5)
    db.workOrder.findMany({
      where: {
        ...baseWoWhere,
        status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
        priority: { in: ['CRITICAL', 'URGENT'] },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workOrderNumber: true,
        title: true,
        status: true,
        priority: true,
        plannedEnd: true,
        createdAt: true,
        asset: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),

    // 8. Unassigned alerts (top 5)
    db.workOrder.findMany({
      where: { ...baseWoWhere, status: 'OPEN', assignedUserId: null },
      take: 5,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        workOrderNumber: true,
        title: true,
        status: true,
        priority: true,
        plannedEnd: true,
        createdAt: true,
        asset: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),

    // 9. Pending service request alerts (top 5)
    db.workRequest.findMany({
      where: { status: 'SUBMITTED' },
      take: 5,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        requestNumber: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    }),

    // 10. Technician workload — users with assigned work orders in scope
    db.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        assignedWorkOrders: {
          some: { ...baseWoWhere },
        },
      },
      take: 20,
      select: {
        id: true,
        name: true,
        assignedWorkOrders: {
          where: baseWoWhere,
          select: {
            status: true,
            plannedEnd: true,
          },
        },
      },
    }),

    // 11. Pending approvals where this user could be a checker — scoped correctly
    (async () => {
      const raw = await db.approvalRequest.findMany({
        where: { status: 'PENDING', makerUserId: { not: user.id } },
        take: 30,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          requestAmount: true,
          currentStepOrder: true,
          totalSteps: true,
          createdAt: true,
          makerUser: { select: { name: true } },
          steps: {
            where: { isSatisfied: false },
            take: 1,
            orderBy: { stepOrder: 'asc' },
            select: { id: true, name: true, stepOrder: true, requiredRoleId: true },
          },
        },
      });
      const filtered: any[] = [];
      for (const appr of raw) {
        if (await isApprovalInUserScope(appr, user, db)) {
          filtered.push(appr);
          if (filtered.length >= 10) break;
        }
      }
      return filtered;
    })(),

    // 12. PM plans summary (scoped by branch if applicable)
    (async () => {
      const branchFilter = await (async () => {
        const accessScope = user.accessScope;
        if (accessScope === 'Company') {
          return {};
        }
        if (accessScope === 'Branch' && user.branchId) {
          return { branchId: user.branchId };
        }
        if (accessScope === 'BranchAndBelow' && user.branchId) {
          const userBranch = await db.branch.findUnique({
            where: { id: user.branchId },
            select: { path: true },
          });
          if (!userBranch?.path) {
            return { branchId: user.branchId };
          }
          const prefix = userBranch.path.endsWith('/') ? userBranch.path : `${userBranch.path}/`;
          const grants = await db.userScopeGrant.findMany({
            where: { userId: user.id },
            select: { branchId: true },
          });
          const grantedIds = grants.map((g: any) => g.branchId).filter((id): id is string => Boolean(id));
          const orConditions: any[] = [{ branch: { path: { startsWith: prefix } } }];
          if (grantedIds.length > 0) {
            const grantedBranches = await db.branch.findMany({
              where: { id: { in: grantedIds } },
              select: { path: true },
            });
            for (const b of grantedBranches) {
              if (b.path) {
                const p = b.path.endsWith('/') ? b.path : `${b.path}/`;
                orConditions.push({ branch: { path: { startsWith: p } } });
              }
            }
          }
          return { OR: orConditions };
        }
        if (accessScope === 'Department') {
          const grants = await db.userScopeGrant.findMany({
            where: { userId: user.id },
            select: { departmentId: true },
          });
          const grantedDeptIds = grants.map((g: any) => g.departmentId).filter((id): id is string => Boolean(id));
          const deptIds = [user.departmentId, ...grantedDeptIds].filter((id): id is string => Boolean(id));
          if (deptIds.length === 0) {
            return { id: '00000000-0000-0000-0000-000000000000' };
          }
          return { departmentId: { in: deptIds } };
        }
        if (accessScope === 'Own') {
          return { id: '00000000-0000-0000-0000-000000000000' };
        }
        return { id: '00000000-0000-0000-0000-000000000000' };
      })();
      const [total, active, overduepm, dueSoon] = await Promise.all([
        db.maintenancePlan.count({ where: { deletedAt: null, ...branchFilter } }),
        db.maintenancePlan.count({ where: { deletedAt: null, status: 'ACTIVE', ...branchFilter } }),
        db.maintenancePlan.count({ where: { deletedAt: null, status: 'ACTIVE', nextDue: { lt: now }, ...branchFilter } }),
        db.maintenancePlan.count({ where: { deletedAt: null, status: 'ACTIVE', nextDue: { gte: now, lte: sevenDaysFromNow }, ...branchFilter } }),
      ]);
      return { total, active, overdueCount: overduepm, dueSoonCount: dueSoon };
    })(),

    // 13. Asset condition summary (scoped)
    (async () => {
      const assetScopeWhere = await getScopedAssetFilter(user, db);
      return db.asset.groupBy({
        by: ['status'],
        where: assetScopeWhere,
        _count: { _all: true },
      });
    })(),

    // 14. Unresolved work orders for Backlog Ageing calculation
    db.workOrder.findMany({
      where: {
        ...baseWoWhere,
        status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] },
      },
      select: { createdAt: true },
    }),

    // 15. Active SLA Breaches Count
    db.slaBreachLog.count({
      where: {
        workOrder: { ...baseWoWhere },
      },
    }),

    // 16. Recent Activity (Recent WOs)
    db.workOrder.findMany({
      where: baseWoWhere,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workOrderNumber: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  // ── Compute Backlog Ageing ────────────────────────────────────────────────
  let days0_7 = 0;
  let days8_14 = 0;
  let days15_30 = 0;
  let days31_60 = 0;
  let over60 = 0;

  for (const wo of unresolvedWorkOrders) {
    const ageDays = Math.floor((now.getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays <= 7) days0_7++;
    else if (ageDays <= 14) days8_14++;
    else if (ageDays <= 30) days15_30++;
    else if (ageDays <= 60) days31_60++;
    else over60++;
  }

  // ── Compute SLA Performance ───────────────────────────────────────────────
  const totalWosCount = woCounts.reduce((sum: number, g: any) => sum + g._count._all, 0) || 1;
  const complianceRate = Math.max(0, Math.min(100, Math.round(((totalWosCount - activeBreachesCount) / totalWosCount) * 100)));

  // ── Compute Recent Activity ───────────────────────────────────────────────
  const recentActivity: RecentActivityItem[] = recentWorkOrders.map((wo: any) => ({
    id: wo.id,
    title: wo.title,
    description: `Work order ${wo.status.toLowerCase().replace('_', ' ')}`,
    timestamp: wo.createdAt.toISOString(),
    type: 'work_order' as const,
    referenceNumber: wo.workOrderNumber,
  }));

  // ── Compute work order summary ────────────────────────────────────────────
  const woStatusMap: Record<string, number> = {};
  let totalWos = 0;
  woCounts.forEach((group: any) => {
    woStatusMap[group.status] = group._count._all;
    totalWos += group._count._all;
  });

  // ── Compute technician workload ───────────────────────────────────────────
  const technicianWorkload: TechnicianWorkload[] = techWorkload.map((u: any) => {
    const assigned = u.assignedWorkOrders;
    return {
      userId: u.id,
      name: u.name,
      assignedCount: assigned.length,
      inProgressCount: assigned.filter((w: any) => w.status === 'IN_PROGRESS').length,
      completedCount: assigned.filter((w: any) => w.status === 'COMPLETED').length,
      overdueCount: assigned.filter(
        (w: any) =>
          ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(w.status) &&
          w.plannedEnd != null &&
          w.plannedEnd < now
      ).length,
    };
  });

  // ── Compute pending approvals ─────────────────────────────────────────────
  const pendingApprovalItems: PendingApprovalItem[] = pendingApprovals
    .filter((req: any) => req.steps.length > 0)
    .map((req: any) => ({
      id: req.id,
      targetId: req.entityId,
      entityId: req.entityId,
      entityType: req.entityType.replace(/_/g, ' ').toLowerCase(),
      requestAmount: req.requestAmount.toString(),
      currentStepOrder: req.currentStepOrder,
      totalSteps: req.totalSteps,
      createdAt: req.createdAt.toISOString(),
      makerName: req.makerUser.name,
      stepName: req.steps[0]?.name ?? 'Review',
    }));

  // ── Compute operational alerts (deduplicated by WO id) ───────────────────
  const alertMap = new Map<string, OperationalAlert>();

  const addAlert = (
    wo: { id: string; workOrderNumber: string; title: string; status: string; priority: string; plannedEnd?: Date | null; createdAt: Date; asset?: { name: string } | null; location?: { name: string } | null },
    type: OperationalAlert['type']
  ) => {
    if (!alertMap.has(wo.id)) {
      alertMap.set(wo.id, {
        id: wo.id,
        type,
        workOrderNumber: wo.workOrderNumber,
        title: wo.title,
        priority: wo.priority,
        status: wo.status,
        assetName: wo.asset?.name,
        locationName: wo.location?.name,
        plannedEnd: wo.plannedEnd?.toISOString(),
        createdAt: wo.createdAt.toISOString(),
        href: `/work-orders/${wo.id}`,
      });
    }
  };

  overdueAlerts.forEach((wo: any) => addAlert(wo, 'overdue'));
  criticalAlerts.forEach((wo: any) => addAlert(wo, 'critical'));
  unassignedAlerts.forEach((wo: any) => addAlert(wo, 'unassigned'));

  pendingRequestAlerts.forEach((req: any) => {
    if (!alertMap.has(req.id)) {
      alertMap.set(req.id, {
        id: req.id,
        type: 'pending_request',
        workOrderNumber: req.requestNumber,
        title: req.title,
        priority: req.priority ?? 'NORMAL',
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        href: '/requests',
      });
    }
  });

  const operationalAlerts = Array.from(alertMap.values()).slice(0, 15);

  // ── Asset summary ─────────────────────────────────────────────────────────
  let totalAssets = 0;
  let downAssets = 0;
  let inMaintAssets = 0;
  assetCounts.forEach((g: any) => {
    totalAssets += g._count._all;
    if (g.status === 'DOWN') downAssets += g._count._all;
    if (g.status === 'IN_MAINTENANCE') inMaintAssets += g._count._all;
  });

  const summaryObj: ManagerWorkOrderSummary = {
    total: totalWos,
    open: woStatusMap['OPEN'] ?? 0,
    assigned: woStatusMap['ASSIGNED'] ?? 0,
    inProgress: woStatusMap['IN_PROGRESS'] ?? 0,
    onHold: woStatusMap['ON_HOLD'] ?? 0,
    completed: woStatusMap['COMPLETED'] ?? 0,
    overdue: overdueCount,
    pendingRequests,
    criticalOpen: criticalOpenCount,
    unassigned: unassignedCount,
  };

  return {
    source: 'database',
    summary: summaryObj,
    workOrders: summaryObj,
    technicians: technicianWorkload,
    technicianWorkload,
    pendingApprovals: pendingApprovalItems,
    alerts: operationalAlerts,
    operationalAlerts,
    pmSummary: pmPlans,
    maintenancePlans: pmPlans,
    assetSummary: {
      total: totalAssets,
      down: downAssets,
      inMaintenance: inMaintAssets,
    },
    backlogAgeing: {
      days0_7,
      days8_14,
      days15_30,
      days31_60,
      over60,
    },
    slaMetrics: {
      totalTracked: totalWosCount,
      activeBreaches: activeBreachesCount,
      complianceRate,
    },
    recentActivity,
  };
}
