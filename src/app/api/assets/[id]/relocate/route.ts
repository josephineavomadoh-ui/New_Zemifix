import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { relocateAsset, getScopedAssetFilter } from '@/src/lib/services/assetService';

export const POST = withApiSecurity(
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

    const result = await relocateAsset(tx, {
      assetId: existing.id,
      toLocationId: body.toLocationId,
      toSiteId: body.toSiteId,
      toPhysicalSiteCustomerId: body.toPhysicalSiteCustomerId,
      reason: body.reason,
      movedByUserId: user.id,
    });

    return NextResponse.json({ success: true, result });
  }
);
