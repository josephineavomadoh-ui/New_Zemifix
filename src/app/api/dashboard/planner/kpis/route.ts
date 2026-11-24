import { NextResponse } from 'next/server';
import { hasPermission } from '@/src/lib/auth';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getScopedWorkOrderFilter } from '@/src/lib/services/workOrderService';

function canPlan(user: { role?: { name?: string } }) {
  return (
    hasPermission(user as any, 'work_order', 'read') ||
    hasPermission(user as any, 'work_order', 'assign') ||
    /planner|dispatcher/i.test(user.role?.name ?? '')
  );
}

const OPEN_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'] as const;

/**
 * Planner comprehensive planning and dispatch dataset inside the caller's scope.
 */
export const GET = withApiSecurity(
  { realm: 'STAFF' },
  async (_req, { user, tx }) => {
    if (!user || !canPlan(user)) {
      return NextResponse.json({ error: 'FORBIDDEN: Work order access is required.' }, { status: 403 });
    }

    const scope = await getScopedWorkOrderFilter(user, tx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const openWhere = { ...scope, deletedAt: null, status: { in: [...OPEN_STATUSES] } };

    const [
      backlog,
      unassigned,
      overdue,
      dueSoon,
      scheduledToday,
      pendingRequestsCount,
      unassignedWorkOrders,
      technicians,
      maintenanceRequests,
      maintenancePlans,
      priorityGroups,
    ] = await Promise.all([
      tx.workOrder.count({ where: openWhere }),
      tx.workOrder.count({ where: { ...openWhere, assignedUserId: null } }),
      tx.workOrder.count({ where: { ...openWhere, plannedEnd: { lt: now } } }),
      tx.workOrder.count({
        where: { ...openWhere, plannedEnd: { gte: now, lte: soon } },
      }),
      tx.workOrder.count({
        where: {
          ...openWhere,
          OR: [
            { plannedStart: { gte: todayStart, lte: todayEnd } },
            { plannedEnd: { gte: todayStart, lte: todayEnd } },
          ],
        },
      }),
      tx.workRequest.count({
        where: {
          ...scope,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
      }),
      tx.workOrder.findMany({
        where: { ...openWhere, assignedUserId: null },
        take: 25,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          asset: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      tx.user.findMany({
        where: {
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
        take: 20,
      }),
      tx.workRequest.findMany({
        where: {
          ...scope,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        },
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      tx.maintenancePlan.findMany({
        where: {
          ...(scope.branchId ? { branchId: scope.branchId } : {}),
          status: 'ACTIVE',
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: { select: { id: true, name: true } },
        },
      }),
      tx.workOrder.groupBy({
        by: ['priority'],
        where: openWhere,
        _count: { id: true },
      }),
    ]);

    // Compute active workload count per technician
    const technicianIds = technicians.map((t) => t.id);
    const activeAssignments = await tx.workOrder.groupBy({
      by: ['assignedUserId'],
      where: {
        ...openWhere,
        assignedUserId: { in: technicianIds },
      },
      _count: { id: true },
    });

    const workloadMap = new Map<string, number>();
    for (const assignment of activeAssignments) {
      if (assignment.assignedUserId) {
        workloadMap.set(assignment.assignedUserId, assignment._count.id);
      }
    }

    const techniciansWorkload = technicians.map((tech) => ({
      id: tech.id,
      name: tech.name,
      email: tech.email,
      role: tech.role?.name ?? 'Technician',
      activeWorkOrdersCount: workloadMap.get(tech.id) ?? 0,
    }));

    const priorityDistribution: Record<string, number> = {
      EMERGENCY: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const group of priorityGroups) {
      if (group.priority) {
        priorityDistribution[group.priority] = group._count.id;
      }
    }

    return NextResponse.json({
      backlog,
      unassigned,
      overdue,
      dueSoon,
      scheduledToday,
      pendingRequests: pendingRequestsCount,
      upcomingPmCount: maintenancePlans.length,
      unassignedWorkOrders,
      techniciansWorkload,
      maintenanceRequests,
      maintenancePlans,
      priorityDistribution,
    });
  }
);
