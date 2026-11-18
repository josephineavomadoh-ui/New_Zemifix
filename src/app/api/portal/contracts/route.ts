import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedSiteIdsForContact } from '@/src/lib/services/portalService';

export async function GET(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);

    const contracts = await prisma.customerContract.findMany({
      where: {
        customerId: contact.customerId,
        deletedAt: null,
      },
      include: {
        slaPolicy: { select: { name: true, policyNumber: true, description: true } },
        contractSites: {
          include: { site: { select: { id: true, name: true, siteCode: true } } },
        },
        rateCards: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ contracts, count: contracts.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch customer contracts' }, { status: 500 });
  }
}
