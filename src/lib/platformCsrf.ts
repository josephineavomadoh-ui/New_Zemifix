import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import crypto from 'crypto';

const SECRET_KEY = new TextEncoder().encode(
  process.env.PLATFORM_SESSION_SECRET || 'dev-platform-session-secret-at-least-32-chars-long'
);

export function generatePlatformCsrfToken(jti: string): string {
  return crypto.createHmac('sha256', SECRET_KEY).update(jti).digest('hex');
}

export async function validatePlatformCsrf(req: NextRequest): Promise<boolean> {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const csrfHeader = req.headers.get('x-platform-csrf');

  // 1. Strict Origin-to-Host validation
  if (!origin || !host || !origin.includes(host)) {
    return false;
  }

  if (!csrfHeader || csrfHeader.trim() === '') {
    return false;
  }

  const pathname = req.nextUrl.pathname;

  // Pre-auth CSRF validation for login endpoint
  if (pathname.includes('/auth/login')) {
    const preAuthCookie = req.cookies.get('zemifix_platform_preauth_csrf')?.value;
    if (!preAuthCookie) return false;
    if (csrfHeader.length !== preAuthCookie.length) return false;
    return crypto.timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(preAuthCookie));
  }

  // Session-bound CSRF validation for authenticated platform mutations
  const token = req.cookies.get('zemifix_platform_session')?.value;
  if (!token) {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      issuer: 'zemifix-platform',
      audience: 'zemifix:platform_admin',
    });

    const jti = payload.jti as string;
    if (!jti) return false;

    const expectedCsrf = generatePlatformCsrfToken(jti);
    if (csrfHeader.length !== expectedCsrf.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(expectedCsrf));
  } catch {
    return false;
  }
}

export function csrfRejectResponse() {
  return NextResponse.json({ error: 'Forbidden: Strict Origin and valid session-bound CSRF token required' }, { status: 403 });
}
