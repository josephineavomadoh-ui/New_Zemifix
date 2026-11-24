import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getWorkOrderById } from '@/src/lib/services/workOrderService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { id } = params ?? {};
    if (!id) {
      return NextResponse.json({ error: 'Work order ID required' }, { status: 400 });
    }

    const workOrder = await getWorkOrderById(user, id, tx);

    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    return NextResponse.json({ workOrder });
  }
);
