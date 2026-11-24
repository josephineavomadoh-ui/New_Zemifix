import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createPurchaseOrder, getPurchaseOrders } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const vendorId = searchParams.get('vendorId') ?? undefined;

    const purchaseOrders = await getPurchaseOrders(user, { search, status, vendorId }, tx);
    return NextResponse.json({ purchaseOrders, count: purchaseOrders.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const body = await req.json();
    const purchaseOrder = await createPurchaseOrder(user, body, tx);

    return NextResponse.json({ success: true, purchaseOrder }, { status: 201 });
  }
);
