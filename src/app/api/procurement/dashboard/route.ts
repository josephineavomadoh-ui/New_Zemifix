import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getProcurementMetrics } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const metrics = await getProcurementMetrics(user, tx);
    return NextResponse.json(metrics, { status: 200 });
  }
);
