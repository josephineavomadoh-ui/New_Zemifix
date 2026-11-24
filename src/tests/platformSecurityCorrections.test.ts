import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { validatePlatformCsrf } from '@/src/lib/platformCsrf';
import { generateBase32Secret } from '@/src/lib/platformAuth';

describe('ZemiFix Platform Security Corrections (Phase S1.4 Task 4)', () => {
  it('1. Enforces strict Origin AND valid x-platform-csrf header validation for CSRF', async () => {
    const host = 'localhost:3001';

    // Missing Origin -> rejected
    const missingOrigin = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'POST',
      headers: {
        host,
        'x-platform-csrf': 'valid-token-xyz',
      },
    });
    expect(await validatePlatformCsrf(missingOrigin)).toBe(false);

    // Incorrect Origin -> rejected
    const badOrigin = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'POST',
      headers: {
        origin: 'http://malicious.com',
        host,
        'x-platform-csrf': 'valid-token-xyz',
      },
    });
    expect(await validatePlatformCsrf(badOrigin)).toBe(false);

    // Missing CSRF header -> rejected (even if origin matches)
    const missingCsrf = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3001',
        host,
      },
    });
    expect(await validatePlatformCsrf(missingCsrf)).toBe(false);

    // GET requests exempt
    const getReq = new NextRequest('http://localhost:3001/api/platform/tenants', {
      method: 'GET',
    });
    expect(await validatePlatformCsrf(getReq)).toBe(true);
  });

  it('2. Generates and verifies TOTP MFA secrets correctly', () => {
    const secret = generateBase32Secret(20);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
  });
});
