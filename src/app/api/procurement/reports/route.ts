import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getProcurementReports } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'PO_REGISTER';
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const branchId = searchParams.get('branchId') ?? undefined;
    const vendorId = searchParams.get('vendorId') ?? undefined;

    const data = await getProcurementReports(user, type, { startDate, endDate, branchId, vendorId });
    return NextResponse.json({ type, data, count: data.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to generate procurement report' }, { status: 500 });
  }
}
