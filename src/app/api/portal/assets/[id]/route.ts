import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedSiteIdsForContact } from '@/src/lib/services/portalService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        site: { select: { id: true, name: true, siteCode: true, customerId: true } },
        location: { select: { id: true, name: true, code: true } },
        workOrders: {
          where: { customerId: contact.customerId, deletedAt: null },
          select: {
            id: true,
            workOrderNumber: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
            actualEnd: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        downtimeLogs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!asset || asset.deletedAt !== null) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);
    const isAuthorized =
      (asset.siteId && authorizedSiteIds.includes(asset.siteId)) ||
      asset.physicalSiteCustomerId === contact.customerId ||
      asset.ownerCustomerId === contact.customerId;

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized access to asset' }, { status: 403 });
    }

    return NextResponse.json({ asset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch asset details' }, { status: 500 });
  }
}
