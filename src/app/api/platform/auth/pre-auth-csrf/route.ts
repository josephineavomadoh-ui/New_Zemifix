import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const preAuthToken = crypto.randomBytes(32).toString('hex');
  const res = NextResponse.json({ preAuthCsrfToken: preAuthToken });
  res.cookies.set({
    name: 'zemifix_platform_preauth_csrf',
    value: preAuthToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60, // 15 mins
  });
  res.headers.set('Cache-Control', 'no-store, no-cache');
  return res;
}
