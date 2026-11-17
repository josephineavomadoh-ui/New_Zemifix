import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getGoodsReceivedNoteById, approveGoodsReceivedNote } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const grn = await getGoodsReceivedNoteById(user, id);
    return NextResponse.json({ grn });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch GRN' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const result = await approveGoodsReceivedNote(user, id);
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to approve Goods Received Note' }, { status: 400 });
  }
}
