import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, siteCode: true } },
        lines: true,
        decisionLogs: {
          include: { customerContact: { select: { name: true, email: true } } },
          orderBy: { decidedAt: 'desc' },
        },
      },
    });

    if (!quote || quote.customerId !== contact.customerId) {
      return NextResponse.json({ error: 'Quotation not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ quote });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch quotation details' }, { status: 500 });
  }
}
