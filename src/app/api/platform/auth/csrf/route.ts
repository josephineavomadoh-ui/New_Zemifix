import { NextRequest, NextResponse } from 'next/server';
import { generatePlatformCsrfToken } from '@/src/lib/platformCsrf';
import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(
  process.env.PLATFORM_SESSION_SECRET || 'dev-platform-session-secret-at-least-32-chars-long'
);

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('zemifix_platform_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, SECRET_KEY, {
      issuer: 'zemifix-platform',
      audience: 'zemifix:platform_admin',
    });

    const jti = payload.jti as string;
    if (!jti) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const csrfToken = generatePlatformCsrfToken(jti);

    const res = NextResponse.json({ csrfToken });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
