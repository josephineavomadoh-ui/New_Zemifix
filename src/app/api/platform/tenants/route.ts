import { NextRequest, NextResponse } from 'next/server';
import { platformPrisma } from '@/src/lib/platformPrisma';
import { getCurrentPlatformAdmin } from '@/src/lib/platformAuth';
import { requirePlatformPermission } from '@/src/lib/platformPermissions';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function GET(req: NextRequest) {
  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    requirePlatformPermission(admin, 'tenant', 'read');

    const tenants = await platformPrisma.tenant.findMany({
      include: {
        deployment: true,
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tenants, count: tenants.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch tenants' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validatePlatformCsrf(req)) {
    return csrfRejectResponse();
  }

  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    requirePlatformPermission(admin, 'tenant', 'create');

    const body = await req.json();
    const { slug, name, initialPlanCode } = body;

    if (!slug || !name) {
      return NextResponse.json({ error: 'Slug and organization name are required' }, { status: 400 });
    }

    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const existing = await platformPrisma.tenant.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      return NextResponse.json({ error: 'Tenant slug already exists. Please choose a unique slug.' }, { status: 400 });
    }

    // Create tenant record in REGISTERED status
    const tenant = await platformPrisma.tenant.create({
      data: {
        slug: cleanSlug,
        name: name.trim(),
        status: 'REGISTERED',
      },
    });

    // If initial plan code provided, attach subscription trial
    if (initialPlanCode) {
      const plan = await platformPrisma.subscriptionPlan.findUnique({
        where: { code: initialPlanCode },
      });
      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14-day trial
        await platformPrisma.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            status: 'TRIAL',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }
    }

    await logPlatformAudit({
      platformUserId: admin.id,
      tenantId: tenant.id,
      action: 'TENANT_REGISTRY_CREATED',
      targetResource: 'Tenant',
      targetResourceId: tenant.id,
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
      payload: { slug: cleanSlug, name: tenant.name },
    });

    return NextResponse.json({ success: true, tenant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to create tenant registry record' }, { status: 500 });
  }
}
