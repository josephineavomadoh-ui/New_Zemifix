import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { assignWorkOrder } from '@/src/lib/services/workOrderService';

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
    const updated = await assignWorkOrder(
      user,
      {
        workOrderId: id,
        assignedUserId: body.assignedUserId,
      },
      tx
    );

    return NextResponse.json({ success: true, workOrder: updated });
  }
);
