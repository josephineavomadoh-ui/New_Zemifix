import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createStockAdjustment } from '@/src/lib/services/inventoryService';

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'update' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const result = await createStockAdjustment(
      user,
      {
        storeId: body.storeId,
        partId: body.partId,
        countedQuantity: parseFloat(body.countedQuantity),
        reason: body.reason,
      },
      tx
    );

    return NextResponse.json({ success: true, result }, { status: 201 });
  }
);
