import { NextRequest, NextResponse } from 'next/server';
import { platformPrisma } from '@/src/lib/platformPrisma';
import { verifyTotpCode, createPlatformSession } from '@/src/lib/platformAuth';
import { encryptSecret } from '@/src/lib/platformEncryption';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { verifyEnrollmentToken, getPendingEnrollmentSecret, clearPendingEnrollment } from '@/src/lib/platformMfaEnrollment';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function POST(req: NextRequest) {
  if (!(await validatePlatformCsrf(req))) {
    return csrfRejectResponse();
  }

  try {
    const body = await req.json();
    const { enrollmentToken, totpCode } = body;

    if (!enrollmentToken || !totpCode || totpCode.length !== 6) {
      return NextResponse.json({ error: 'Enrollment token and valid 6-digit TOTP code are required' }, { status: 400 });
    }

    const adminInfo = await verifyEnrollmentToken(enrollmentToken);
    if (!adminInfo) {
      return NextResponse.json({ error: 'Invalid or expired enrollment token' }, { status: 401 });
    }

    const secret = getPendingEnrollmentSecret(adminInfo.adminId);
    if (!secret) {
      return NextResponse.json({ error: 'MFA enrollment session expired or not initiated. Please restart enrollment.' }, { status: 400 });
    }

    if (!verifyTotpCode(secret, totpCode)) {
      await logPlatformAudit({
        platformUserId: adminInfo.adminId,
        action: 'PLATFORM_MFA_ENROLL_VERIFY_FAILED',
        targetResource: 'PlatformUser',
        outcome: 'FAILURE',
        clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
      });
      return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 400 });
    }

    // Encrypt TOTP secret at rest using AES-256-GCM
    const encryptedSecret = encryptSecret(secret);

    // Success: activate MFA on user record
    await platformPrisma.platformUser.update({
      where: { id: adminInfo.adminId },
      data: {
        mfaSecret: encryptedSecret,
        mfaEnabled: true,
      },
    });

    clearPendingEnrollment(adminInfo.adminId);

    // Issue full platform session upon successful enrollment and verification
    const { token } = await createPlatformSession(adminInfo.adminId);

    await logPlatformAudit({
      platformUserId: adminInfo.adminId,
      action: 'PLATFORM_MFA_ENROLLED_AND_AUTHENTICATED',
      targetResource: 'PlatformUser',
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    const res = NextResponse.json({ success: true, message: 'MFA successfully enabled and session established.' });
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
    return NextResponse.json({ error: err.message ?? 'Failed to verify MFA enrollment' }, { status: 500 });
  }
}
