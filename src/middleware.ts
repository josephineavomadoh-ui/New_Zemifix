import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/src/lib/auth';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/demo-session',
  '/api/auth/me',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/health',
  '/request/qr',
  '/request',
  '/api/public',
];

export function getTrustedOrigins(): Set<string> {
  const origins = new Set<string>();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    origins.add(new URL(appUrl).origin);
  } catch {
    origins.add('http://localhost:3000');
  }

  const additional = process.env.ADDITIONAL_TRUSTED_ORIGINS;
  if (additional) {
    additional
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((urlStr) => {
        try {
          const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`).origin;
          origins.add(parsed);
        } catch {
          // Ignore invalid URL formats
        }
      });
  }

  return origins;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const origin = request.headers.get('origin');

  // 1. CSRF & Request-Origin Protection for mutation methods (POST, PUT, PATCH, DELETE) on API routes
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
    !pathname.startsWith('/api/health') &&
    !pathname.startsWith('/api/sync/')
  ) {
    const trustedOrigins = getTrustedOrigins();
    const isLocalhost = origin
      ? origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')
      : false;
    const isExplicitlyTrusted = origin ? trustedOrigins.has(origin) : false;
    const isTrustedOrigin = origin ? (isExplicitlyTrusted || isLocalhost) : true;

    if (origin && !isTrustedOrigin) {
      return NextResponse.json(
        { error: 'CSRF_VALIDATION_FAILED: Request origin is untrusted.' },
        { status: 403 }
      );
    }
  }

  // 2. Build response with comprehensive HTTP Security Headers
  let response = NextResponse.next();

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return response;
  }

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self';
    frame-ancestors 'none';
  `.replace(/\s{2,}/g, ' ').trim();

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 3. Allow static Next.js assets to pass through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/tailwind.css')
  ) {
    return response;
  }

  // 4. Role-Aware Navigation & Protection for Authenticated Sessions
  const sessionCookie = request.cookies.get('zemifix_session')?.value;

  if (sessionCookie) {
    const sessionPayload = await verifySessionToken(sessionCookie);

    if (sessionPayload) {
      const userRole = sessionPayload.role || '';
      const isTechnician = userRole.toLowerCase().includes('technician');

      // Technicians attempting to access administrative dashboard routes are redirected to /pwa
      if (isTechnician && (pathname === '/' || pathname.startsWith('/dashboard'))) {
        return NextResponse.redirect(new URL('/pwa', request.url));
      }

      // Root path '/' or '/login' redirects authenticated users to their role default landing page
      if (pathname === '/' || pathname === '/login') {
        const defaultLanding = isTechnician ? '/pwa' : '/dashboard';
        return NextResponse.redirect(new URL(defaultLanding, request.url));
      }
    }
  }

  // 5. Allow unauthenticated public paths and API routes to pass through
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/api/')
  ) {
    return response;
  }

  // 6. Unauthenticated requests to protected pages redirect to /login?redirect=${pathname}
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/' && pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
