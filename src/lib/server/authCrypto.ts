// Server‑only cryptographic utilities (Node.js only)
// This file lives under `src/lib/server` so it is never imported by client code.
// It provides thin wrappers around the Node `crypto` core module.

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Constant‑time buffer comparison.
 * Returns true only when the two buffers have identical contents.
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Compute an HMAC‑SHA256 digest and return it as a hex string.
 * Used for OTP hashing and security‑context signatures.
 */
export function hmacSha256(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}
