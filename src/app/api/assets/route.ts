import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getScopedAssetFilter, createAsset } from '@/src/lib/services/assetService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'asset', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const filter = await getScopedAssetFilter(user, tx);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const categoryId = searchParams.get('categoryId');
    const branchId = searchParams.get('branchId');

    const where: any = {
      ...filter,
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { assetTag: { contains: search, mode: 'insensitive' } },
              { serialNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const assets = await tx.asset.findMany({
      where,
      include: {
        category: { select: { name: true, code: true } },
        location: { select: { name: true, code: true, building: true, room: true } },
        branch: { select: { name: true, code: true } },
        ownerCustomer: { select: { name: true, customerNumber: true } },
        managingCustomer: { select: { name: true, customerNumber: true } },
        site: { select: { name: true, siteCode: true } },
        custodianUser: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ assets, count: assets.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'asset', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const asset = await createAsset(user, {
      ...body,
      createdByUserId: user.id,
    }, tx);

    return NextResponse.json({ success: true, asset }, { status: 201 });
  }
);
