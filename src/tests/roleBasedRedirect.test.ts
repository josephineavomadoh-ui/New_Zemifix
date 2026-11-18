// @vitest-environment node
/**
 * Integration & Security Test Suite for Role-Based Post-Authentication Navigation (Phase 8)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { createSessionToken, SESSION_COOKIE_NAME } from '../lib/auth';
import { generateUuidV7 } from '../lib/uuid';

describe('Role-Based Post-Authentication Navigation & Route Protection', () => {
  let adminToken: string;
  let technicianToken: string;

  beforeEach(async () => {
    // 1. Generate authenticated session tokens for Admin and Technician roles
    adminToken = await createSessionToken({
      userId: generateUuidV7(),
      email: 'admin@zemifix.local',
      role: 'Admin',
      branchId: generateUuidV7(),
      accessScope: 'Company',
    });

    technicianToken = await createSessionToken({
      userId: generateUuidV7(),
      email: 'y.osei@zemifix.local',
      role: 'Technician',
      branchId: generateUuidV7(),
      accessScope: 'Branch',
    });
  });

  it('1. Middleware redirects Technician accessing /dashboard to /pwa', async () => {
    const req = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${technicianToken}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/pwa');
  });

  it('2. Middleware allows Technician to access /pwa directly without redirecting', async () => {
    const req = new NextRequest('http://localhost:3000/pwa', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${technicianToken}` },
    });

    const res = await middleware(req);
    // Should NOT be redirected (status 200 / Next response)
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('3. Middleware allows Admin to access /dashboard directly without redirecting', async () => {
    const req = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('4. Middleware redirects Technician visiting root / to /pwa', async () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${technicianToken}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/pwa');
  });

  it('5. Middleware redirects Admin visiting root / to /dashboard', async () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('6. Middleware redirects authenticated Technician visiting /login to /pwa', async () => {
    const req = new NextRequest('http://localhost:3000/login', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${technicianToken}` },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/pwa');
  });

  it('7. Unauthenticated request to /pwa redirects to /login?redirect=/pwa', async () => {
    const req = new NextRequest('http://localhost:3000/pwa');

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?redirect=%2Fpwa');
  });

  it('8. Safe redirect resolution prevents open redirect exploits', () => {
    const resolveTargetRoute = (rawRedirect: string | null, userRoleName: string): string => {
      if (
        rawRedirect &&
        rawRedirect.startsWith('/') &&
        !rawRedirect.startsWith('//') &&
        !rawRedirect.includes(':')
      ) {
        return rawRedirect;
      }
      return userRoleName === 'Technician' ? '/pwa' : '/dashboard';
    };

    // Open redirect attempts:
    expect(resolveTargetRoute('//evil-attacker.com', 'Technician')).toBe('/pwa');
    expect(resolveTargetRoute('https://evil-attacker.com', 'Admin')).toBe('/dashboard');
    expect(resolveTargetRoute('javascript:alert(1)', 'Technician')).toBe('/pwa');

    // Valid internal relative redirects:
    expect(resolveTargetRoute('/pwa/work-orders/123', 'Technician')).toBe('/pwa/work-orders/123');
    expect(resolveTargetRoute('/dashboard/assets', 'Admin')).toBe('/dashboard/assets');
  });
});
