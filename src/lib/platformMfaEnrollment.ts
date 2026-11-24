import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

const SECRET_KEY = new TextEncoder().encode(
  process.env.PLATFORM_SESSION_SECRET || 'dev-platform-session-secret-at-least-32-chars-long'
);

// In-memory pending MFA enrollments mapping adminId -> { secret: string, expiresAt: number }
const pendingEnrollments = new Map<string, { secret: string; expiresAt: number }>();

export async function signEnrollmentToken(adminId: string, email: string): Promise<string> {
  return await new SignJWT({
    adminId,
    email,
    purpose: 'mfa_enrollment',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('zemifix-platform')
    .setAudience('zemifix:platform_enrollment')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET_KEY);
}

export async function verifyEnrollmentToken(token: string): Promise<{ adminId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      issuer: 'zemifix-platform',
      audience: 'zemifix:platform_enrollment',
    });
    if (payload.purpose !== 'mfa_enrollment' || !payload.adminId) {
      return null;
    }
    return { adminId: payload.adminId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export function setPendingEnrollment(adminId: string, secret: string): void {
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  pendingEnrollments.set(adminId, { secret, expiresAt });
}

export function getPendingEnrollmentSecret(adminId: string): string | null {
  const record = pendingEnrollments.get(adminId);
  if (!record || Date.now() > record.expiresAt) {
    pendingEnrollments.delete(adminId);
    return null;
  }
  return record.secret;
}

export function clearPendingEnrollment(adminId: string): void {
  pendingEnrollments.delete(adminId);
}
