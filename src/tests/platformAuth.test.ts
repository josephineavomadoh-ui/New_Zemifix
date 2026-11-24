import { describe, it, expect } from 'vitest';
import {
  hashPlatformPassword,
  verifyPlatformPassword,
  checkPlatformLoginRateLimit,
  verifyTotpCode,
  signPlatformToken,
} from '@/src/lib/platformAuth';
import { hasPlatformPermission, requirePlatformPermission } from '@/src/lib/platformPermissions';

describe('ZemiFix Platform Authentication Foundation (S1.3)', () => {
  it('1. Verifies and hashes platform passwords correctly', async () => {
    const password = 'SecurePlatformAdminPassword123!';
    const hash = await hashPlatformPassword(password);
    expect(hash).not.toBe(password);

    const isValid = await verifyPlatformPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPlatformPassword('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('2. Enforces login rate limiting', () => {
    const ipKey = 'test-ip-127.0.0.1';
    for (let i = 0; i < 5; i++) {
      expect(checkPlatformLoginRateLimit(ipKey)).toBe(true);
    }
    // 6th attempt should be rate limited
    expect(checkPlatformLoginRateLimit(ipKey)).toBe(false);
  });

  it('3. Enforces platform RBAC permission checks', () => {
    const superAdmin = {
      id: 'admin-1',
      name: 'Super Admin',
      email: 'super@zemifix.com',
      roleId: 'role-1',
      roleCode: 'SUPER_ADMIN',
      roleName: 'Super Administrator',
      mfaEnabled: true,
      permissions: [{ resource: '*', action: '*' }],
    };

    const regularAdmin = {
      id: 'admin-2',
      name: 'Support Admin',
      email: 'support@zemifix.com',
      roleId: 'role-2',
      roleCode: 'SUPPORT_ADMIN',
      roleName: 'Support Administrator',
      mfaEnabled: true,
      permissions: [{ resource: 'tenant', action: 'read' }],
    };

    // SuperAdmin bypasses
    expect(hasPlatformPermission(superAdmin, 'tenant', 'write')).toBe(true);
    expect(() => requirePlatformPermission(superAdmin, 'tenant', 'write')).not.toThrow();

    // Regular admin with read permission
    expect(hasPlatformPermission(regularAdmin, 'tenant', 'read')).toBe(true);
    expect(() => requirePlatformPermission(regularAdmin, 'tenant', 'read')).not.toThrow();

    // Regular admin without write permission
    expect(hasPlatformPermission(regularAdmin, 'tenant', 'write')).toBe(false);
    expect(() => requirePlatformPermission(regularAdmin, 'tenant', 'write')).toThrow();
  });
});
