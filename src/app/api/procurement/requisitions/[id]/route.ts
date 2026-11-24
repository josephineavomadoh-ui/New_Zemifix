import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getRequisitionById, updateRequisitionStatus } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Requisition ID required' }, { status: 400 });

    const requisition = await getRequisitionById(user, id, tx);
    return NextResponse.json({ requisition });
  }
);

export const PATCH = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'approve' },
  async (req, { user, tx, params }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { id } = params ?? {};
    if (!id) return NextResponse.json({ error: 'Requisition ID required' }, { status: 400 });

    const body = await req.json();
    const { action, notes } = body;

    const requisition = await updateRequisitionStatus(user, id, action, notes, tx);
    return NextResponse.json({ success: true, requisition });
  }
);
