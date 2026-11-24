import { NextRequest, NextResponse } from 'next/server';
import { generateBase32Secret } from '@/src/lib/platformAuth';
import { validatePlatformCsrf, csrfRejectResponse } from '@/src/lib/platformCsrf';
import { verifyEnrollmentToken, setPendingEnrollment } from '@/src/lib/platformMfaEnrollment';
import { logPlatformAudit } from '@/src/lib/platformAuditService';

export async function POST(req: NextRequest) {
  if (!(await validatePlatformCsrf(req))) {
    return csrfRejectResponse();
  }

  try {
    const body = await req.json();
    const { enrollmentToken } = body;

    if (!enrollmentToken) {
      return NextResponse.json({ error: 'Enrollment token is required' }, { status: 401 });
    }

    const adminInfo = await verifyEnrollmentToken(enrollmentToken);
    if (!adminInfo) {
      return NextResponse.json({ error: 'Invalid or expired enrollment token' }, { status: 401 });
    }

    const secret = generateBase32Secret();
    setPendingEnrollment(adminInfo.adminId, secret);

    const issuer = 'ZemiFixPlatform';
    const accountName = encodeURIComponent(adminInfo.email);
    const otpauthUri = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;

    await logPlatformAudit({
      platformUserId: adminInfo.adminId,
      action: 'PLATFORM_MFA_ENROLL_INITIATED',
      targetResource: 'PlatformUser',
      outcome: 'SUCCESS',
      clientIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    return NextResponse.json({
      success: true,
      secret,
      otpauthUri,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to initiate MFA enrollment' }, { status: 500 });
  }
}
