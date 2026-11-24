import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getPurchaseOrderById, updatePurchaseOrderStatus } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Purchase order ID required' }, { status: 400 });

    const purchaseOrder = await getPurchaseOrderById(user, id, tx);
    return NextResponse.json({ purchaseOrder });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'approve' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Purchase order ID required' }, { status: 400 });

    const body = await req.json();
    const { action, notes } = body;

    const purchaseOrder = await updatePurchaseOrderStatus(user, id, action, notes, tx);
    return NextResponse.json({ success: true, purchaseOrder });
  }
);
