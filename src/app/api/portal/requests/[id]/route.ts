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
    const request = await prisma.publicRequestIntake.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, siteCode: true, customerId: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
      },
    });

    if (!request || request.site.customerId !== contact.customerId) {
      return NextResponse.json({ error: 'Request not found or unauthorized' }, { status: 404 });
    }

    const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);
    if (!authorizedSiteIds.includes(request.siteId)) {
      return NextResponse.json({ error: 'Unauthorized access to site request' }, { status: 403 });
    }

    return NextResponse.json({ request });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch request details' }, { status: 500 });
  }
}
