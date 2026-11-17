import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { createStockAdjustment } from '@/src/lib/services/inventoryService';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const result = await createStockAdjustment(user, {
      storeId: body.storeId,
      partId: body.partId,
      countedQuantity: parseFloat(body.countedQuantity),
      reason: body.reason,
    });

    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to create stock adjustment' }, { status: 400 });
  }
}
