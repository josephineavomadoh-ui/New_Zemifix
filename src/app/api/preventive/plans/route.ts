import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';
import { getCurrentUser } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Enforce branch scope if user has restricted access
    const branchFilter = user.accessScope === 'Branch' && user.branchId ? { branchId: user.branchId } : {};

    const plans = await prisma.maintenancePlan.findMany({
      where: {
        deletedAt: null,
        ...branchFilter,
      },
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ plans }, { status: 200 });
  } catch (err: any) {
    console.error('Failed to fetch maintenance plans:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      assetId,
      triggerType,
      frequency,
      nextDue,
      assignedTeam,
      estimatedHours,
      checklist,
      requiredParts,
      requiredLabor,
    } = body;

    if (!name || !assetId || !frequency || !nextDue) {
      return NextResponse.json(
        { error: 'Missing required fields: name, assetId, frequency, nextDue.' },
        { status: 400 }
      );
    }

    // Verify asset exists and is accessible
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { branch: true },
    });

    if (!asset || asset.deletedAt) {
      return NextResponse.json({ error: 'Selected equipment asset not found or inactive.' }, { status: 404 });
    }

    // Generate unique plan code
    const count = await prisma.maintenancePlan.count();
    const code = `PM-${String(count + 15).padStart(4, '0')}`;

    const newPlan = await prisma.maintenancePlan.create({
      data: {
        code,
        name: name.trim(),
        description: description?.trim() || null,
        assetId,
        branchId: asset.branchId || user.branchId,
        triggerType: triggerType === 'METER' ? 'METER' : 'TIME',
        frequency: frequency.trim(),
        status: 'ACTIVE',
        assignedTeam: assignedTeam?.trim() || 'General Maintenance Team',
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : 3.0,
        nextDue: new Date(nextDue),
        compliancePercent: 100,
        checklist: checklist ?? [],
        requiredParts: requiredParts ?? [],
        requiredLabor: requiredLabor ?? [],
      },
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

    return NextResponse.json({ plan: newPlan }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to create maintenance plan:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
