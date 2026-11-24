import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { recordWorkOrderPart } from '@/src/lib/services/workOrderService';

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Work order ID required' }, { status: 400 });
    }

    const body = await req.json();
    const part = await recordWorkOrderPart(
      user,
      {
        workOrderId: id,
        partNumber: body.partNumber,
        partName: body.partName,
        quantityPlanned: body.quantityPlanned ? parseFloat(body.quantityPlanned) : undefined,
        quantityConsumed: body.quantityConsumed ? parseFloat(body.quantityConsumed) : undefined,
        unitCost: body.unitCost ? parseFloat(body.unitCost) : undefined,
      },
      tx
    );

    return NextResponse.json({ success: true, part }, { status: 201 });
  }
);
