import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getProcurementReports } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'PO_REGISTER';
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const branchId = searchParams.get('branchId') ?? undefined;
    const vendorId = searchParams.get('vendorId') ?? undefined;

    const data = await getProcurementReports(user, type, { startDate, endDate, branchId, vendorId }, tx);
    return NextResponse.json({ type, data, count: data.length });
  }
);
