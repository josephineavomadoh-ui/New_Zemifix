import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createWorkOrder, getWorkOrders, getPaginatedWorkOrders } from '@/src/lib/services/workOrderService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    if (pageParam !== null || pageSizeParam !== null) {
      const page = pageParam ? parseInt(pageParam, 10) : 1;
      const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 50;
      const result = await getPaginatedWorkOrders(user, { page, pageSize }, tx);
      return NextResponse.json({ workOrders: result.workOrders, pagination: result.pagination, count: result.workOrders.length });
    }

    const workOrders = await getWorkOrders(user, tx);
    return NextResponse.json({ workOrders, count: workOrders.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'work_order', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const workOrder = await createWorkOrder(user, body, tx);

    return NextResponse.json({ success: true, workOrder }, { status: 201 });
  }
);
