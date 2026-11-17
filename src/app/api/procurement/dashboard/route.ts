import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { getProcurementMetrics } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metrics = await getProcurementMetrics(user);
    return NextResponse.json(metrics, { status: 200 });
  } catch (err: any) {
    console.error('GET /api/procurement/dashboard failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Failed to load procurement dashboard metrics' },
      { status: 500 }
    );
  }
}
