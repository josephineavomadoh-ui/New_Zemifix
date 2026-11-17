import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getSupplierReturnById } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const supplierReturn = await getSupplierReturnById(user, id);
    return NextResponse.json({ supplierReturn });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch supplier return' }, { status: 404 });
  }
}
