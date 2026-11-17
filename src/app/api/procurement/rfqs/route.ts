import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { createRfq, getRfqs } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rfqs = await getRfqs(user);
    return NextResponse.json({ rfqs, count: rfqs.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch RFQs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const rfq = await createRfq(user, body);

    return NextResponse.json({ success: true, rfq }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to create RFQ' }, { status: 400 });
  }
}
