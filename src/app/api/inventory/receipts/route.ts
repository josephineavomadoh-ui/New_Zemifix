import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { postStockTransaction } from '@/src/lib/services/inventoryService';

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'update' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();

    const result = await postStockTransaction(tx, {
      transactionType: body.transactionType ?? 'RECEIPT',
      storeId: body.storeId,
      partId: body.partId,
      quantity: parseFloat(body.quantity),
      unitCost: parseFloat(body.unitCost),
      referenceDoc: body.referenceDoc,
      actingUserId: user.id,
    });

    return NextResponse.json({ success: true, result }, { status: 201 });
  }
);
