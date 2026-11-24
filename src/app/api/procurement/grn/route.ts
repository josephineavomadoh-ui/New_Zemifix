import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { createGoodsReceivedNote, getGoodsReceivedNotes } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const grns = await getGoodsReceivedNotes(user, tx);
    return NextResponse.json({ grns, count: grns.length });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'create' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const body = await req.json();
    const result = await createGoodsReceivedNote(user, body, tx);

    return NextResponse.json({ success: true, result }, { status: 201 });
  }
);
