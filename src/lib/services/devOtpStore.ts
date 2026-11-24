// Development‑only in‑memory OTP cache keyed by OTP challenge ID.
// Stores the plain code together with its exact expiry timestamp.
// All functions become no‑ops when not in dev-like environment (isDevLike() is false).

import { isDevLike } from '../env';

type OtpEntry = { code: string; expiresAt: Date };
const cache = new Map<string, OtpEntry>();

/**
 * Store a fresh OTP for a specific challenge.
 * `challengeId` is the primary‑key of the AuthOtp record.
 * `expiresAt` must be the authoritative expiry timestamp from the DB.
 */
export function setOtp(challengeId: string, code: string, expiresAt: Date): void {
  if (!isDevLike()) return;
  cache.set(challengeId, { code, expiresAt });
}

/**
 * Retrieve the OTP **only if it is still valid**.
 * Returns undefined when missing, expired, or when not in development.
 */
export function getOtp(challengeId: string): string | undefined {
  if (!isDevLike()) return undefined;
  const entry = cache.get(challengeId);
  if (!entry) return undefined;
  if (entry.expiresAt <= new Date()) {
    // Auto‑cleanup expired entry.
    cache.delete(challengeId);
    return undefined;
  }
  return entry.code;
}

/**
 * Delete a cached OTP entry (used after successful verification or when a
 * challenge becomes permanently invalid – e.g. exhausted, expired, etc.).
 */
export function clearOtp(challengeId: string): void {
  if (!isDevLike()) return;
  cache.delete(challengeId);
}
