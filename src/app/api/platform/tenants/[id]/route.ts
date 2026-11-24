import { NextRequest, NextResponse } from 'next/server';
import { platformPrisma } from '@/src/lib/platformPrisma';
import { getCurrentPlatformAdmin } from '@/src/lib/platformAuth';
import { requirePlatformPermission } from '@/src/lib/platformPermissions';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    requirePlatformPermission(admin, 'tenant', 'read');

    const { id } = await params;
    const tenant = await platformPrisma.tenant.findUnique({
      where: { id },
      include: {
        deployment: true,
        subscription: { include: { plan: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({ tenant });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch tenant details' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validatePlatformCsrf(req)) {
    return csrfRejectResponse();
  }

  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    requirePlatformPermission(admin, 'tenant', 'update');

    const { id } = await params;
    const body = await req.json();
    const { name, status } = body;

    const existing = await platformPrisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const updated = await platformPrisma.tenant.update({
      where: { id },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        status: status !== undefined ? status : undefined,
      },
    });

    await logPlatformAudit({
      platformUserId: admin.id,
      tenantId: id,
      action: 'TENANT_METADATA_UPDATED',
      targetResource: 'Tenant',
      targetResourceId: id,
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
      payload: { name, status },
    });

    return NextResponse.json({ success: true, tenant: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to update tenant' }, { status: 500 });
  }
}
