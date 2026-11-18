import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalContact } from '@/src/lib/portalAuth';
import { prisma } from '@/src/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: contact.customerId },
      include: {
        sites: { where: { deletedAt: null, isActive: true } },
        contacts: { where: { deletedAt: null } },
      },
    });

    const contactDetails = await prisma.customerContact.findUnique({
      where: { id: contact.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isPrimaryContact: true,
        canViewFinancials: true,
        canApproveQuotes: true,
        canRequestWork: true,
      },
    });

    return NextResponse.json({ contact: contactDetails, customer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch portal profile' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const contact = await getCurrentPortalContact(req);
    if (!contact) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone } = body;

    const updated = await prisma.customerContact.update({
      where: { id: contact.id },
      data: {
        name: name || contact.name,
        phone: phone !== undefined ? phone : undefined,
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    return NextResponse.json({ success: true, contact: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update profile' }, { status: 500 });
  }
}
