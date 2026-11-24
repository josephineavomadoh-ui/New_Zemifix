import { AuthenticatedPlatformAdmin } from './platformAuth';

export function hasPlatformPermission(
  admin: AuthenticatedPlatformAdmin | null,
  resource: string,
  action: string
): boolean {
  if (!admin || !admin.permissions) return false;

  // Strict explicit permission lookup (no hardcoded role-name bypasses)
  return admin.permissions.some(
    (p) =>
      (p.resource === '*' || p.resource === resource) &&
      (p.action === '*' || p.action === action)
  );
}

export function requirePlatformPermission(
  admin: AuthenticatedPlatformAdmin | null,
  resource: string,
  action: string
): void {
  if (!hasPlatformPermission(admin, resource, action)) {
    throw new Error(`FORBIDDEN: Platform administrator lacks required permission [${resource}:${action}]`);
  }
}
