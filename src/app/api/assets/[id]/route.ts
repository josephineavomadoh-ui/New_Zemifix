import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getScopedAssetFilter } from '@/src/lib/services/assetService';
import { appendAuditLog } from '@/src/lib/services/auditService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'asset', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
    }

    const scopeFilter = await getScopedAssetFilter(user, tx);
    const asset = await tx.asset.findFirst({
      where: { id, ...scopeFilter, deletedAt: null },
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
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ asset });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'asset', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
    }

    const scopeFilter = await getScopedAssetFilter(user, tx);
    const existing = await tx.asset.findFirst({ where: { id, ...scopeFilter, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const body = await req.json();

    const asset = await tx.asset.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        assetTag: body.assetTag,
        isActive: body.isActive,
        description: body.description,
        criticality: body.criticality,
        manufacturer: body.manufacturer,
        modelNumber: body.modelNumber,
        serialNumber: body.serialNumber,
        custodianUserId: body.custodianUserId ?? null,
        responsibleUserId: body.responsibleUserId ?? null,
        responsibleDepartmentId: body.responsibleDepartmentId ?? null,
      },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'EDITED_ASSET_DETAILS',
      resource: 'asset',
      resourceId: id,
      payload: { name: body.name, assetTag: asset.assetTag },
    });

    return NextResponse.json({ success: true, asset });
  }
);

export const DELETE = withApiSecurity(
  { realm: 'STAFF', resource: 'asset', action: 'delete' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
    }

    const scopeFilter = await getScopedAssetFilter(user, tx);
    const existing = await tx.asset.findFirst({ where: { id, ...scopeFilter, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const asset = await tx.asset.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await appendAuditLog(tx, {
      actorUserId: user.id,
      action: 'ARCHIVED_ASSET',
      resource: 'asset',
      resourceId: id,
      payload: { assetTag: asset.assetTag, name: asset.name },
    });

    return NextResponse.json({ success: true, archived: true });
  }
);
