import { NextRequest, NextResponse } from 'next/server';
import { platformPrisma } from '@/src/lib/platformPrisma';
import { getCurrentPlatformAdmin } from '@/src/lib/platformAuth';
import { requirePlatformPermission } from '@/src/lib/platformPermissions';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validatePlatformCsrf(req)) {
    return csrfRejectResponse();
  }

  try {
    const admin = await getCurrentPlatformAdmin(req);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    requirePlatformPermission(admin, 'tenant', 'suspend');

    const { id } = await params;
    const tenant = await platformPrisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (tenant.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Tenant is already suspended' }, { status: 400 });
    }

    const updated = await platformPrisma.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });

    await logPlatformAudit({
      platformUserId: admin.id,
      tenantId: id,
      action: 'TENANT_SUSPENDED',
      targetResource: 'Tenant',
      targetResourceId: id,
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    return NextResponse.json({ success: true, tenant: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to suspend tenant' }, { status: 500 });
  }
}
