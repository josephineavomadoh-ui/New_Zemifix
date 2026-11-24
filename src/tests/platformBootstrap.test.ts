import { describe, it, expect } from 'vitest';
import { platformBootstrapAdmin } from '@/src/lib/platformBootstrap';
import { hasPlatformPermission, requirePlatformPermission } from '@/src/lib/platformPermissions';

describe('ZemiFix Platform Super Administrator Bootstrap & RBAC Tests (Phase S1.6)', () => {
  it('1. Rejects weak or missing credentials during bootstrap', async () => {
    const res1 = await platformBootstrapAdmin({ name: 'Admin', email: '', password: 'short' });
    expect(res1.success).toBe(false);
    expect(res1.message).toContain('Invalid email or password');
  });

  it('2. Enforces explicit platform permissions without role-name bypasses', () => {
    const adminWithExplicitPerms = {
      id: 'admin-1',
      name: 'Super Admin',
      email: 'admin@zemifix.com',
      roleId: 'role-1',
      roleCode: 'SUPER_ADMIN',
      roleName: 'Platform Super Administrator',
      mfaEnabled: false,
      permissions: [
        { resource: 'tenant', action: 'create' },
        { resource: 'tenant', action: 'read' },
      ],
    };

    const adminWithoutPerms = {
      id: 'admin-2',
      name: 'Restricted Admin',
      email: 'restricted@zemifix.com',
      roleId: 'role-2',
      roleCode: 'CUSTOM',
      roleName: 'Custom Role',
      mfaEnabled: true,
      permissions: [],
    };

    // Explicit permission allowed
    expect(hasPlatformPermission(adminWithExplicitPerms, 'tenant', 'create')).toBe(true);
    expect(() => requirePlatformPermission(adminWithExplicitPerms, 'tenant', 'create')).not.toThrow();

    // Missing permission denied
    expect(hasPlatformPermission(adminWithExplicitPerms, 'tenant', 'suspend')).toBe(false);
    expect(() => requirePlatformPermission(adminWithExplicitPerms, 'tenant', 'suspend')).toThrow();

    // Admin without perms denied
    expect(hasPlatformPermission(adminWithoutPerms, 'tenant', 'read')).toBe(false);
    expect(() => requirePlatformPermission(adminWithoutPerms, 'tenant', 'read')).toThrow();
  });
});
