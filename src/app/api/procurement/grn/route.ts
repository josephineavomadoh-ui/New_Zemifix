import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { createGoodsReceivedNote, getGoodsReceivedNotes } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const grns = await getGoodsReceivedNotes(user);
    return NextResponse.json({ grns, count: grns.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch Goods Received Notes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const result = await createGoodsReceivedNote(user, body);

    return NextResponse.json({ success: true, result }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to create Goods Received Note' }, { status: 400 });
  }
}
