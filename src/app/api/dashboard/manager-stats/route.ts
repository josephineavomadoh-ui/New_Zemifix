import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { getManagerDashboardMetrics } from '@/src/lib/services/managerDashboardService';
import { handleApiError } from '@/src/lib/db-errors';

/**
 * GET /api/dashboard/manager-stats
 *
 * Provides operational metrics scoped to the authenticated Manager or Supervisor.
 * Access control: staff with work_order:read (or wildcard *:*).
 * Data scope: enforced by service layer (work order, asset, approvals, etc.)
 */
export const GET = withApiSecurity(
  {
    // STAFF realm is default; enforce required permission
    realm: 'STAFF',
    resource: 'work_order',
    action: 'read',
  },
  async (req: NextRequest, { user, tx }) => {
    // user is guaranteed to be non‑null by the wrapper (unless allowAnonymous)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Authentication required.' }, { status: 401 });
    }
    const metrics = await getManagerDashboardMetrics(user, tx);
    return NextResponse.json(metrics);
  }
);
