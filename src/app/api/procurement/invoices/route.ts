import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';
import { performThreeWayMatch, getPurchaseOrders } from '@/src/lib/services/procurementService';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const pos = await getPurchaseOrders(user, undefined, tx);
    const invoiceMatches = await Promise.all(
      pos.map(async (po) => {
        try {
          return await performThreeWayMatch(user, { poId: po.id }, tx);
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({ matches: invoiceMatches.filter(Boolean) });
  }
);

export const POST = withApiSecurity(
  { realm: 'STAFF', resource: 'procurement', action: 'update' },
  async (req, { user, tx }) => {
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });

    const body = await req.json();
    const matchResult = await performThreeWayMatch(user, body, tx);

    return NextResponse.json({ success: true, matchResult });
  }
);
