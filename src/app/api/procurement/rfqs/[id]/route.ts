import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getRfqById, addVendorQuotation, evaluateVendorQuotations } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const rfq = await getRfqById(user, id);
    return NextResponse.json({ rfq });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch RFQ' }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const quotation = await addVendorQuotation(user, { ...body, rfqId: id });
    return NextResponse.json({ success: true, quotation }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to record vendor quotation' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const evaluatedRfq = await evaluateVendorQuotations(user, { ...body, rfqId: id });
    return NextResponse.json({ success: true, rfq: evaluatedRfq });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to evaluate RFQ' }, { status: 400 });
  }
}
