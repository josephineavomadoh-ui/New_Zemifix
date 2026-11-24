import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createSupplierReturn, getSupplierReturns } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const returns = await getSupplierReturns(user, tx);
    return NextResponse.json({ returns, count: returns.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const body = await req.json();
    const supplierReturn = await createSupplierReturn(user, body, true, tx);

    return NextResponse.json({ success: true, supplierReturn }, { status: 201 });
  }
);
