import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';
import { getAuthorizedSiteIdsForContact } from '@/src/lib/services/portalService';
import { generateUuidV7 } from '@/src/lib/uuid';

export async function GET(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);

    // Fetch public intakes and work requests linked to customer sites or customer
    const requests = await prisma.publicRequestIntake.findMany({
      where: {
        siteId: { in: authorizedSiteIds },
      },
      include: {
        site: { select: { name: true, siteCode: true } },
        asset: { select: { name: true, assetTag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests, count: requests.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch customer maintenance requests' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!contact.canRequestWork && !contact.isPrimaryContact) {
      return NextResponse.json({ error: 'Permission denied: Contact not authorized to request work' }, { status: 403 });
    }

    const body = await req.json();
    const { siteId, assetId, description, photoUrl } = body;

    if (!siteId || !description) {
      return NextResponse.json({ error: 'Site ID and description are required' }, { status: 400 });
    }

    const authorizedSiteIds = await getAuthorizedSiteIdsForContact(contact);
    if (!authorizedSiteIds.includes(siteId)) {
      return NextResponse.json({ error: 'Unauthorized site access' }, { status: 403 });
    }

    // Verify site belongs to customer
    const site = await prisma.customerSite.findUnique({
      where: { id: siteId },
    });

    if (!site || site.customerId !== contact.customerId) {
      return NextResponse.json({ error: 'Invalid site reference' }, { status: 400 });
    }

    const intake = await prisma.publicRequestIntake.create({
      data: {
        id: generateUuidV7(),
        siteId,
        assetId: assetId || null,
        requesterName: contact.name,
        requesterEmail: contact.email,
        requesterPhone: 'Portal Contact',
        description,
        photoUrl: photoUrl || null,
        status: 'RECEIVED',
        clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
      },
    });

    return NextResponse.json({ success: true, intake }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to submit service request' }, { status: 500 });
  }
}
