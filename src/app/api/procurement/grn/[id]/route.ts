import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getGoodsReceivedNoteById, approveGoodsReceivedNote } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'GRN ID required' }, { status: 400 });

    const grn = await getGoodsReceivedNoteById(user, id, tx);
    return NextResponse.json({ grn });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'approve' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'GRN ID required' }, { status: 400 });

    const result = await approveGoodsReceivedNote(user, id, false, tx);
    return NextResponse.json({ success: true, result });
  }
);
