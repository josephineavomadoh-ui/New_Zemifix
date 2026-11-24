import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { submitInvoiceForApproval } from '@/src/lib/services/billingService';

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'create' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });

    const invoice = await submitInvoiceForApproval(user, id, tx);
    return NextResponse.json({ success: true, invoice });
  }
);
