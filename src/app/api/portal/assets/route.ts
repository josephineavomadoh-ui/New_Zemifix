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

    const assets = await prisma.asset.findMany({
      where: {
        OR: [
          { siteId: { in: authorizedSiteIds } },
          { physicalSiteCustomerId: contact.customerId },
          { ownerCustomerId: contact.customerId },
        ],
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        site: { select: { id: true, name: true, siteCode: true } },
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ assets, count: assets.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch customer assets' }, { status: 500 });
  }
}
