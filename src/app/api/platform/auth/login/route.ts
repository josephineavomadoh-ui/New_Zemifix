import { NextRequest, NextResponse } from 'next/server';
import { platformPrisma } from '@/src/lib/platformPrisma';
import {
  verifyPlatformPassword,
  checkPlatformLoginRateLimit,
  createPlatformSession,
  verifyTotpCode,
} from '@/src/lib/platformAuth';
import { decryptSecret } from '@/src/lib/platformEncryption';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { signEnrollmentToken } from '@/src/lib/platformMfaEnrollment';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function POST(req: NextRequest) {
  if (!(await validatePlatformCsrf(req))) {
    return csrfRejectResponse();
  }

  const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';

  try {
    const body = await req.json();
    const { email, password, totpCode } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const rateKey = `${clientIp}-${email.trim().toLowerCase()}`;
    if (!checkPlatformLoginRateLimit(rateKey)) {
      await logPlatformAudit({
        action: 'PLATFORM_LOGIN_RATE_LIMITED',
        targetResource: 'PlatformUser',
        outcome: 'FAILURE',
        clientIp,
        payload: { email },
      });
      return NextResponse.json({ error: 'Too many login attempts. Please try again in 15 minutes.' }, { status: 429 });
    }

    const admin = await platformPrisma.platformUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { role: true },
    });

    if (!admin || !admin.isActive) {
      await logPlatformAudit({
        action: 'PLATFORM_LOGIN_FAILED',
        targetResource: 'PlatformUser',
        outcome: 'FAILURE',
        clientIp,
        payload: { email, reason: 'Invalid credentials or inactive account' },
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isPasswordValid = await verifyPlatformPassword(password, admin.passwordHash);
    if (!isPasswordValid) {
      await logPlatformAudit({
        platformUserId: admin.id,
        action: 'PLATFORM_LOGIN_FAILED',
        targetResource: 'PlatformUser',
        outcome: 'FAILURE',
        clientIp,
        payload: { email, reason: 'Incorrect password' },
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Mandatory MFA verification / enrollment flow
    if (admin.mfaEnabled) {
      if (!totpCode) {
        return NextResponse.json({
          status: 'MFA_REQUIRED',
          message: 'TOTP authentication code is required.',
          requiresMfa: true,
        }, { status: 200 });
      }

      const decryptedSecret = decryptSecret(admin.mfaSecret ?? '');
      if (!decryptedSecret || !verifyTotpCode(decryptedSecret, totpCode)) {
        await logPlatformAudit({
          platformUserId: admin.id,
          action: 'PLATFORM_MFA_FAILED',
          targetResource: 'PlatformUser',
          outcome: 'FAILURE',
          clientIp,
          payload: { email },
        });
        return NextResponse.json({ error: 'Invalid TOTP authentication code' }, { status: 401 });
      }
    } else {
      // Issue restricted enrollment challenge token (does not grant full session)
      const enrollmentToken = await signEnrollmentToken(admin.id, admin.email);
      await logPlatformAudit({
        platformUserId: admin.id,
        action: 'PLATFORM_MFA_ENROLLMENT_CHALLENGE_ISSUED',
        targetResource: 'PlatformUser',
        outcome: 'SUCCESS',
        clientIp,
        payload: { email },
      });

      return NextResponse.json({
        status: 'MFA_ENROLLMENT_REQUIRED',
        message: 'Mandatory TOTP MFA enrollment required for platform administrators.',
        requiresMfaEnrollment: true,
        enrollmentToken,
      }, { status: 200 });
    }

    // Create full authenticated session
    const { token } = await createPlatformSession(admin.id);

    await logPlatformAudit({
      platformUserId: admin.id,
      action: 'PLATFORM_LOGIN_SUCCESS',
      targetResource: 'PlatformUser',
      outcome: 'SUCCESS',
      clientIp,
      payload: { email: admin.email },
    });

    const res = NextResponse.json({ success: true, admin: { id: admin.id, name: admin.name, email: admin.email } });
    res.cookies.set({
      name: 'zemifix_platform_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 4 * 60 * 60, // 4 hours
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}
