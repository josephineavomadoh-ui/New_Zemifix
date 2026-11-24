import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { recordInternalRecharge, getInternalRecharges } from '@/src/lib/services/billingService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const recharges = await getInternalRecharges(user, tx);

    return NextResponse.json({ recharges, count: recharges.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const recharge = await recordInternalRecharge(user, {
      workOrderId: body.workOrderId,
      fromDepartmentId: body.fromDepartmentId,
      toDepartmentId: body.toDepartmentId,
      amount: parseFloat(body.amount),
      description: body.description,
    }, tx);

    return NextResponse.json({ success: true, recharge }, { status: 201 });
  }
);
