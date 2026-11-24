import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { issueCreditNote, getCreditNotes } from '@/src/lib/services/billingService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const creditNotes = await getCreditNotes(user, tx);

    return NextResponse.json({ creditNotes, count: creditNotes.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'invoice', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const body = await req.json();
    const creditNote = await issueCreditNote(user, {
      invoiceId: body.invoiceId,
      reason: body.reason,
      subtotal: parseFloat(body.subtotal),
    }, tx);

    return NextResponse.json({ success: true, creditNote }, { status: 201 });
  }
);
