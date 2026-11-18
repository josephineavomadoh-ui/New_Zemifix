import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quotes = await prisma.quote.findMany({
      where: {
        customerId: contact.customerId,
        status: { in: ['SENT_TO_CUSTOMER', 'CUSTOMER_ACCEPTED', 'CUSTOMER_DECLINED', 'APPROVED_INTERNAL'] },
      },
      include: {
        site: { select: { id: true, name: true, siteCode: true } },
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ quotes, count: quotes.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch customer quotes' }, { status: 500 });
  }
}
