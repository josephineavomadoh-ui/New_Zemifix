import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/prisma';
import { getWorkOrders } from '@/src/lib/services/workOrderService';

export async function GET(req: NextRequest) {
  try {
    let user;
    try {
      user = await getCurrentUser(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch scoped work orders list
    const workOrderList = await getWorkOrders(user);

    // Fetch full detail for each work order using the same includes as GET /api/work-orders/[id]
    const workOrders = await Promise.all(
      workOrderList.map((wo) =>
        prisma.workOrder.findUnique({
          where: { id: wo.id },
          include: {
            asset: { select: { id: true, name: true, assetTag: true, status: true, modelNumber: true, serialNumber: true, imageUrl: true } },
            location: { select: { id: true, name: true, code: true, building: true, room: true } },
            branch: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            supervisorUser: { select: { id: true, name: true, email: true } },
            assignedUser: { select: { id: true, name: true, email: true } },
            tasks: { orderBy: { taskOrder: 'asc' } },
            checklists: { orderBy: { itemOrder: 'asc' } },
            labor: { include: { technicianUser: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
            parts: { orderBy: { createdAt: 'desc' } },
            statusHistory: { include: { changedByUser: { select: { name: true } } }, orderBy: { changedAt: 'desc' } },
            assignmentHistory: { include: { assignedUser: { select: { name: true } }, assignedByUser: { select: { name: true } } }, orderBy: { assignedAt: 'desc' } },
            sourceWorkRequests: true,
          },
        })
      )
    );

    const validWorkOrders = workOrders.filter((wo) => wo !== null && wo.deletedAt === null);

    // Collect distinct asset IDs from work orders
    const assetIds = [
      ...new Set(
        validWorkOrders
          .map((wo) => wo!.assetId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    // Fetch each asset with the same includes as GET /api/assets/[id] and /api/assets/[id]/meters
    const assets = await Promise.all(
      assetIds.map((assetId) =>
        prisma.asset.findUnique({
          where: { id: assetId },
          include: {
            category: true,
            location: true,
            branch: true,
            ownerCustomer: true,
            managingCustomer: true,
            site: true,
            custodianUser: { select: { id: true, name: true, email: true } },
            responsibleUser: { select: { id: true, name: true, email: true } },
            responsibleDepartment: { select: { id: true, name: true, code: true } },
            parentAsset: { select: { id: true, name: true, assetTag: true } },
            childAssets: { select: { id: true, name: true, assetTag: true, status: true } },
            meters: { include: { readings: { orderBy: { readingTimestamp: 'desc' }, take: 10 } } },
            downtimeLogs: { orderBy: { startedAt: 'desc' }, take: 10 },
            locationHistory: { orderBy: { movedAt: 'desc' }, take: 10 },
            statusHistory: { orderBy: { changedAt: 'desc' }, take: 10 },
            boms: true,
            workOrders: { include: { assignedUser: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 10 },
            workRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        })
      )
    );

    const validAssets = assets.filter((a) => a !== null && a.deletedAt === null);

    return NextResponse.json({
      workOrders: validWorkOrders,
      assets: validAssets,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[API /api/pwa/sync-package GET error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
