import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/auth';
import { performThreeWayMatch, getPurchaseOrders } from '@/src/lib/services/procurementService';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pos = await getPurchaseOrders(user);
    const invoiceMatches = await Promise.all(
      pos.map(async (po) => {
        try {
          return await performThreeWayMatch(user, { poId: po.id });
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({ matches: invoiceMatches.filter(Boolean) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to perform invoice matching' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const matchResult = await performThreeWayMatch(user, body);

    return NextResponse.json({ success: true, matchResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to match invoice' }, { status: 400 });
  }
}
