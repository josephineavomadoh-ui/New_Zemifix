import { NextRequest, NextResponse } from 'next/server';
import { withApiSecurity } from '@/src/lib/authWrapper';

export const GET = withApiSecurity(
  { realm: 'STAFF', resource: 'inventory', action: 'read' },
  async (req, { user, tx }) => {
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED: Active staff session required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const partId = searchParams.get('partId');

    const transactions = await tx.stockTransaction.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(partId ? { partId } : {}),
      },
      include: {
        store: { select: { name: true, code: true } },
        part: { select: { name: true, partNumber: true, uom: true } },
        actingUser: { select: { name: true, email: true } },
        workOrder: { select: { workOrderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ transactions, count: transactions.length });
  }
);
