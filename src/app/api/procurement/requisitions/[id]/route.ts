import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getRequisitionById, updateRequisitionStatus } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const requisition = await getRequisitionById(user, id);
    return NextResponse.json({ requisition });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch requisition' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { action, notes } = body;

    const requisition = await updateRequisitionStatus(user, id, action, notes);
    return NextResponse.json({ success: true, requisition });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update requisition status' }, { status: 400 });
  }
}
