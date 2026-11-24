import { describe, it, expect, beforeAll } from 'vitest';
import { verifySessionToken, createSessionToken } from '@/src/lib/auth';

describe('ZemiFix Performance Phase P1: Authentication Optimization & Security Tests', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long-here!!';
  });

  it('1. Verifies session token creation and verification flow', async () => {
    const payload = {
      userId: 'usr-test-123',
      email: 'test@zemifix.com',
      role: 'Admin',
      branchId: 'branch-123',
      accessScope: 'Company',
    };

    const token = await createSessionToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.role).toBe(payload.role);
  });

  it('2. Rejects invalid, malformed, or tampered session tokens', async () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';
    const verified = await verifySessionToken(invalidToken);
    expect(verified).toBeNull();
  });
});
