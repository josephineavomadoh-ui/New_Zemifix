import { describe, it, expect } from 'vitest';
import { generatePlatformCsrfToken } from '@/src/lib/platformCsrf';

describe('ZemiFix Platform CSRF Token Delivery & Validation Tests (Task 1)', () => {
  it('1. Generates consistent and secure session-bound CSRF tokens', () => {
    const jti = 'test-session-jti-uuid-999';
    const token1 = generatePlatformCsrfToken(jti);
    const token2 = generatePlatformCsrfToken(jti);

    expect(token1).toBe(token2);
    expect(token1.length).toBe(64); // SHA-256 hex digest length

    const tokenOther = generatePlatformCsrfToken('different-jti');
    expect(token1).not.toBe(tokenOther);
  });
});
