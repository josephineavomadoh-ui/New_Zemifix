import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getPurchaseOrderById, updatePurchaseOrderStatus } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const purchaseOrder = await getPurchaseOrderById(user, id);
    return NextResponse.json({ purchaseOrder });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch purchase order' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { action, notes } = body;

    const purchaseOrder = await updatePurchaseOrderStatus(user, id, action, notes);
    return NextResponse.json({ success: true, purchaseOrder });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update purchase order status' }, { status: 400 });
  }
}
