import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createInvoice, getInvoices } from '@/src/lib/services/billingService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? undefined;
    const customerId = searchParams.get('customerId') ?? undefined;

    const invoices = await getInvoices(user, { status, customerId }, tx);

    return NextResponse.json({ invoices, count: invoices.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const invoice = await createInvoice(user, {
      ...body,
      dueDate: new Date(body.dueDate),
    }, tx);

    return NextResponse.json({ success: true, invoice }, { status: 201 });
  }
);
