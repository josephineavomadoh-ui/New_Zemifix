import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createPurchaseRequisition, getPurchaseRequisitions } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const branchId = searchParams.get('branchId') ?? undefined;

    const requisitions = await getPurchaseRequisitions(user, { search, status, branchId }, tx);
    return NextResponse.json({ requisitions, count: requisitions.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const requisition = await createPurchaseRequisition(user, body, tx);

    return NextResponse.json({ success: true, requisition }, { status: 201 });
  }
);
