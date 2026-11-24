import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getRfqById, addVendorQuotation, evaluateVendorQuotations } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'RFQ ID required' }, { status: 400 });

    const rfq = await getRfqById(user, id, tx);
    return NextResponse.json({ rfq });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'update' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'RFQ ID required' }, { status: 400 });

    const body = await req.json();

    const quotation = await addVendorQuotation(user, { ...body, rfqId: id }, tx);
    return NextResponse.json({ success: true, quotation }, { status: 201 });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'approve' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'RFQ ID required' }, { status: 400 });

    const body = await req.json();

    const evaluatedRfq = await evaluateVendorQuotations(user, { ...body, rfqId: id }, tx);
    return NextResponse.json({ success: true, rfq: evaluatedRfq });
  }
);
