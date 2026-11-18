// @vitest-environment node
/**
 * Unit tests for CSRF Origin & Trusted Development Origins in middleware.ts
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, getTrustedOrigins } from '../../middleware';

describe('CSRF Request Origin Validation in Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      ADDITIONAL_TRUSTED_ORIGINS: 'https://underfoot-monument-morphing.ngrok-free.dev',
    };
  });

  it('1. Correctly parses trusted origins from environment variables', () => {
    const origins = getTrustedOrigins();
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('https://underfoot-monument-morphing.ngrok-free.dev')).toBe(true);
  });

  it('2. Permits mutation requests originating from http://localhost:3000', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('3. Permits mutation requests originating from trusted ngrok origin', async () => {
    const req = new NextRequest('https://underfoot-monument-morphing.ngrok-free.dev/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://underfoot-monument-morphing.ngrok-free.dev' },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it('4. Rejects mutation requests originating from untrusted third-party origins with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://evil-untrusted-hacker.com' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('CSRF_VALIDATION_FAILED: Request origin is untrusted.');
  });

  it('5. Rejects mutation requests from unlisted ngrok domains with 403 (No Wildcard Bypasses)', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://other-untrusted-tunnel.ngrok-free.dev' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('CSRF_VALIDATION_FAILED: Request origin is untrusted.');
  });

  it('6. Allows read-only GET requests on API routes regardless of origin header', async () => {
    const req = new NextRequest('http://localhost:3000/api/procurement/dashboard', {
      method: 'GET',
      headers: { origin: 'https://untrusted-hacker.com' },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });
});
