import crypto from 'crypto';

const ENCRYPTION_KEY_RAW = process.env.PLATFORM_ENCRYPTION_KEY || process.env.PLATFORM_SESSION_SECRET;
if (!ENCRYPTION_KEY_RAW || ENCRYPTION_KEY_RAW.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL SECURITY ERROR: PLATFORM_ENCRYPTION_KEY must be defined and at least 32 characters long.');
  }
}

// Derive a 32-byte key using SHA-256
const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW || 'dev-encryption-key-fallback-32-chars-long!!').digest();

export function encryptSecret(plainText: string): string {
  if (!plainText) return plainText;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv(hex):authTag(hex):encrypted(hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText;
  try {
    const [ivHex, authTagHex, encryptedHex] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('Failed to decrypt secret: Authentication tag verification failed or data corrupted.');
  }
}
