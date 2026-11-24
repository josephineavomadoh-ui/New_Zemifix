// Development‑only OTP retrieval endpoint (server‑only)
import { NextRequest, NextResponse } from 'next/server';
import { verifyPreAuthToken } from '@/src/lib/auth';
import { prisma } from '@/src/lib/prisma';
import { getOtp } from '@/src/lib/services/devOtpStore';
import { isDevLike } from '@/src/lib/env';

/**
 * GET /api/auth/dev/otp?email=<email>
 *
 * - Only works when NODE_ENV === 'development'.
 * - Requires header X‑DEV‑OTP‑SECRET matching process.env.DEV_OTP_SECRET.
 * - Validates that the user resolved from the email matches the userId embedded
 *   in the pre‑auth token (preventing cross‑user leakage).
 * - Returns the plaintext OTP only while it is still valid according to the
 *   authoritative expiry stored in the dev cache.
 */
export async function GET(req: NextRequest) {
  // 1️⃣ Environment guard
  if (!isDevLike()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 2️⃣ Secret header check
  const providedSecret = req.headers.get('x-dev-otp-secret');
  const expectedSecret = process.env.DEV_OTP_SECRET; // must be defined locally, never committed
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3️⃣ Email query param
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Missing email query param' }, { status: 400 });
  }

  // 4️⃣ Resolve user record (read‑only)
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 5️⃣ Read pre‑auth cookie and verify token
  const preAuthCookie = req.cookies.get('zemifix_preauth')?.value;
  if (!preAuthCookie) {
    return NextResponse.json({ error: 'Missing pre‑auth cookie' }, { status: 401 });
  }
  const payload = await verifyPreAuthToken(preAuthCookie);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid pre‑auth token' }, { status: 401 });
  }

  // 6️⃣ Ensure the request is for the same user as the pre‑auth token
  if (payload.userId !== user.id) {
    return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
  }

  // 7️⃣ Retrieve cached OTP using the challenge ID from the pre‑auth payload
  const otp = getOtp(payload.otpRecordId);
  if (!otp) {
    return NextResponse.json({ error: 'No active OTP' }, { status: 404 });
  }

  // 8️⃣ Return the plaintext OTP (development only)
  return NextResponse.json({ otp });
}
