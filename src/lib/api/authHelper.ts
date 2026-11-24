import { getCurrentUser, requireAuth, AuthenticatedUser } from '@/src/lib/auth';

/**
 * Authentication helper for API routes.
 * Wraps the core auth utilities to provide concise imports.
 */
export async function getUser(req?: any): Promise<AuthenticatedUser | null> {
  return await getCurrentUser(req);
}

export async function ensureAuth(options?: { roles?: string[]; resource?: string; action?: string }) {
  return await requireAuth(options);
}
