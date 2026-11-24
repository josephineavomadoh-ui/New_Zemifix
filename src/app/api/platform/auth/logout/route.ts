import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPlatformAdmin, revokePlatformSession } from '@/src/lib/platformAuth';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { logPlatformAudit } from '@/src/lib/platformAuditService';
import { jwtVerify } from 'jose';

export async function POST(req: NextRequest) {
  if (!validatePlatformCsrf(req)) {
    return csrfRejectResponse();
  }

  const token = req.cookies.get('zemifix_platform_session')?.value;
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.PLATFORM_SESSION_SECRET || 'dev-platform-session-secret-at-least-32-chars-long');
      const { payload } = await jwtVerify(token, secret, { issuer: 'zemifix-platform', audience: 'zemifix:platform_admin' });
      if (payload.jti) {
        await revokePlatformSession(payload.jti as string);
      }
    } catch {
      // Ignore token decode errors on logout
    }
  }

  const admin = await getCurrentPlatformAdmin(req);
  if (admin) {
    await logPlatformAudit({
      platformUserId: admin.id,
      action: 'PLATFORM_LOGOUT',
      targetResource: 'PlatformUser',
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });
  }

  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });
  res.cookies.set({
    name: 'zemifix_platform_session',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  return res;
}
