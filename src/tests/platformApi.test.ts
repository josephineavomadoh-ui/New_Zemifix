import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { validatePlatformCsrf } from '@/src/lib/platformCsrf';
import { hasPlatformPermission } from '@/src/lib/platformPermissions';

describe('ZemiFix Platform API Foundation Tests (S1.4)', () => {
  it('1. Validates strict dual Origin AND x-platform-csrf header matching', async () => {
    // GET request always valid
    const getReq = new NextRequest('http://localhost:3001/api/platform/tenants', { method: 'GET' });
    expect(await validatePlatformCsrf(getReq)).toBe(true);

    // POST request with missing origin or csrf header -> rejected
    const missingCsrfReq = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3001',
        host: 'localhost:3001',
      },
    });
    expect(await validatePlatformCsrf(missingCsrfReq)).toBe(false);

    // POST request with mismatched origin -> rejected
    const badOriginReq = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'POST',
      headers: {
        origin: 'http://malicious-site.com',
        host: 'localhost:3001',
        'x-platform-csrf': 'valid-csrf-token',
      },
    });
    expect(await validatePlatformCsrf(badOriginReq)).toBe(false);
  });

  it('2. Enforces explicit platform RBAC permissions', () => {
    const admin = {
      id: 'usr-1',
      name: 'Admin',
      email: 'admin@zemifix.com',
      roleId: 'role-1',
      roleCode: 'TENANT_MANAGER',
      roleName: 'Tenant Manager',
      mfaEnabled: true,
      permissions: [
        { resource: 'tenant', action: 'read' },
        { resource: 'tenant', action: 'create' },
      ],
    };

    expect(hasPlatformPermission(admin, 'tenant', 'read')).toBe(true);
    expect(hasPlatformPermission(admin, 'tenant', 'create')).toBe(true);
    expect(hasPlatformPermission(admin, 'tenant', 'suspend')).toBe(false);
    expect(hasPlatformPermission(admin, 'settings', 'manage')).toBe(false);
  });
});
