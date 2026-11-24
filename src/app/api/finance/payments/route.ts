import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { recordPaymentRemittance, getPayments } from '@/src/lib/services/billingService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const payments = await getPayments(user, tx);

    return NextResponse.json({ payments, count: payments.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const result = await recordPaymentRemittance(user, {
      customerId: body.customerId,
      invoiceId: body.invoiceId,
      amount: parseFloat(body.amount),
      paymentMethod: body.paymentMethod,
      referenceNumber: body.referenceNumber,
      notes: body.notes,
    }, tx);

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  }
);
