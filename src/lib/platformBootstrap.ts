import bcrypt from 'bcryptjs';
import { platformPrisma } from './platformPrisma';
import { logPlatformAudit } from './platformAuditService';

export interface BootstrapPlatformAdminParams {
  name: string;
  email: string;
  password: string;
  clientIp?: string;
}

export async function platformBootstrapAdmin(
  params: BootstrapPlatformAdminParams
): Promise<{ success: boolean; message: string; adminId?: string }> {
  const emailClean = params.email?.trim().toLowerCase();
  if (!emailClean || !params.password || params.password.length < 8) {
    await logPlatformAudit({
      action: 'PLATFORM_BOOTSTRAP_FAILED',
      targetResource: 'PlatformUser',
      outcome: 'FAILURE',
      clientIp: params.clientIp || '127.0.0.1',
      payload: { email: emailClean, reason: 'Missing or weak credentials' },
    });
    return { success: false, message: 'Invalid email or password (minimum 8 characters required).' };
  }

  try {
    return await platformPrisma.$transaction(async (tx) => {
      // 1. Check if any platform user already exists (race-safe check)
      const existingCount = await tx.platformUser.count();
      if (existingCount > 0) {
        await logPlatformAudit({
          action: 'PLATFORM_BOOTSTRAP_REFUSED',
          targetResource: 'PlatformUser',
          outcome: 'FAILURE',
          clientIp: params.clientIp || '127.0.0.1',
          payload: { email: emailClean, reason: 'Super Administrator already exists' },
        });
        return { success: false, message: 'Refused: A Platform Super Administrator already exists.' };
      }

      // 2. Ensure SuperAdmin role and explicit permissions exist
      let superRole = await tx.platformRole.findUnique({
        where: { code: 'SUPER_ADMIN' },
      });

      if (!superRole) {
        superRole = await tx.platformRole.create({
          data: {
            code: 'SUPER_ADMIN',
            name: 'Platform Super Administrator',
            description: 'Full platform management and provisioning rights',
          },
        });
      }

      const defaultPermissions = [
        { resource: 'tenant', action: 'create' },
        { resource: 'tenant', action: 'read' },
        { resource: 'tenant', action: 'update' },
        { resource: 'tenant', action: 'suspend' },
        { resource: 'tenant', action: 'restore' },
        { resource: '*', action: '*' },
      ];

      for (const p of defaultPermissions) {
        let perm = await tx.platformPermission.findUnique({
          where: { resource_action: { resource: p.resource, action: p.action } },
        });
        if (!perm) {
          perm = await tx.platformPermission.create({
            data: { resource: p.resource, action: p.action, description: `Permission for ${p.resource}:${p.action}` },
          });
        }
        await tx.platformRolePermission.upsert({
          where: { roleId_permissionId: { roleId: superRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: superRole.id, permissionId: perm.id },
        });
      }

      // 3. Hash password using bcrypt (cost 10)
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(params.password, salt);

      // 4. Create initial Platform Super Administrator
      const admin = await tx.platformUser.create({
        data: {
          name: params.name?.trim() || 'Platform Super Admin',
          email: emailClean,
          passwordHash,
          isActive: true,
          mfaEnabled: false, // Forces mandatory MFA enrollment on first login
          roleId: superRole.id,
        },
      });

      await logPlatformAudit({
        platformUserId: admin.id,
        action: 'PLATFORM_BOOTSTRAP_SUCCESS',
        targetResource: 'PlatformUser',
        outcome: 'SUCCESS',
        clientIp: params.clientIp || '127.0.0.1',
        payload: { email: emailClean, roleCode: 'SUPER_ADMIN' },
      });

      return { success: true, message: 'Platform Super Administrator successfully bootstrapped.', adminId: admin.id };
    }, { isolationLevel: 'Serializable' });
  } catch (err: any) {
    await logPlatformAudit({
      action: 'PLATFORM_BOOTSTRAP_ERROR',
      targetResource: 'PlatformUser',
      outcome: 'FAILURE',
      clientIp: params.clientIp || '127.0.0.1',
      payload: { error: err.message },
    });
    return { success: false, message: `Bootstrap failed: ${err.message}` };
  }
}
