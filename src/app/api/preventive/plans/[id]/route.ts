import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { getCurrentUser } from '@/src/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { status } = body;

    if (!status || !['ACTIVE', 'PAUSED', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid or missing status value.' }, { status: 400 });
    }

    const existingPlan = await prisma.maintenancePlan.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existingPlan) {
      return NextResponse.json({ error: 'Maintenance plan not found.' }, { status: 404 });
    }

    const updatedPlan = await prisma.maintenancePlan.update({
      where: { id },
      data: { status },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            assetTag: true,
            imageUrl: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    return NextResponse.json({ plan: updatedPlan }, { status: 200 });
  } catch (err: any) {
    console.error('Failed to update maintenance plan status:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
