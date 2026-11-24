import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@/src/lib/platformEncryption';
import { generatePlatformCsrfToken } from '@/src/lib/platformCsrf';

describe('ZemiFix Platform Security Remediation Tests (Phase S1.4)', () => {
  it('1. Encrypts and decrypts TOTP secrets securely (AES-256-GCM)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('2. Rejects tampered or corrupted encrypted secrets', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);
    const parts = encrypted.split(':');
    parts[2] = 'deadbeef' + parts[2]; // tamper ciphertext
    const tampered = parts.join(':');

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('3. Generates session-bound CSRF tokens', () => {
    const jti = 'session-jti-uuid-1234';
    const token1 = generatePlatformCsrfToken(jti);
    const token2 = generatePlatformCsrfToken(jti);
    expect(token1).toBe(token2);
    expect(token1.length).toBe(64);

    const tokenDifferent = generatePlatformCsrfToken('different-jti');
    expect(token1).not.toBe(tokenDifferent);
  });
});
