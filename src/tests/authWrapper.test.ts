import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { withApiSecurity } from '@/src/lib/authWrapper';
import {
  withSecurityContext,
  SecurityContextInput,
} from '@/src/lib/services/securityContextService';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 1: Reusable API Security Wrapper & AUTH Realm Support', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.APP_ENV = 'test';
    process.env.TEST_DATABASE_URL =
      'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
    process.env.APP_CONTEXT_HMAC_SECRET =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockClient() {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          backendPid: '1234',
          transactionId: '5678',
          sessionUser: 'zemifix_app_user',
          currentDatabase: 'zemifix_dev',
        },
      ]),
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx };
  }

  describe('1. AUTH Realm Security Context Support', () => {
    it('1.1 Allows empty userId when realm is AUTH', () => {
      const input: SecurityContextInput = {
        userId: '',
        realm: 'AUTH',
        accessScope: 'Own',
      };

      const { client, tx } = createMockClient();

      return expect(
        withSecurityContext(client, input, async (transaction) => {
          expect(transaction).toBe(tx);
          return 'AUTH_CONTEXT_OK';
        })
      ).resolves.toBe('AUTH_CONTEXT_OK');
    });

    it('1.2 Rejects empty userId when realm is STAFF and allowAnonymous is false', () => {
      const input: SecurityContextInput = {
        userId: '',
        realm: 'STAFF',
        accessScope: 'Own',
      };

      const { client } = createMockClient();

      return expect(
        withSecurityContext(client, input, async () => 'OK')
      ).rejects.toThrowError(/SECURITY_CONTEXT_MISSING.*Authenticated user context is required/i);
    });

    it('1.3 Allows empty userId when realm is WORKER or PUBLIC_QR', () => {
      const workerInput: SecurityContextInput = {
        userId: '',
        realm: 'WORKER',
        accessScope: 'Company',
      };

      const qrInput: SecurityContextInput = {
        userId: '',
        realm: 'PUBLIC_QR',
        accessScope: 'Own',
      };

      const { client } = createMockClient();

      return Promise.all([
        withSecurityContext(client, workerInput, async () => 'WORKER_OK'),
        withSecurityContext(client, qrInput, async () => 'PUBLIC_QR_OK'),
      ]).then(([workerRes, qrRes]) => {
        expect(workerRes).toBe('WORKER_OK');
        expect(qrRes).toBe('PUBLIC_QR_OK');
      });
    });
  });

  describe('2. withApiSecurity API Route Wrapper Behavior', () => {
    it('2.1 Wraps AUTH realm handler and executes callback with tx', async () => {
      const { client } = createMockClient();

      const wrappedHandler = withApiSecurity(
        { realm: 'AUTH', allowAnonymous: true, client },
        async (req, ctx) => {
          expect(ctx.securityContext.realm).toBe('AUTH');
          expect(ctx.securityContext.userId).toBe('');
          expect(ctx.user).toBeNull();
          expect(ctx.tx).toBeDefined();
          return NextResponse.json({ success: true, realm: 'AUTH' });
        }
      );

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
      });

      const res = await wrappedHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.realm).toBe('AUTH');
    });

    it('2.2 Rejects WORKER route requests missing Authorization header (HTTP 403)', async () => {
      const { client } = createMockClient();

      const wrappedHandler = withApiSecurity(
        { realm: 'WORKER', client },
        async () => NextResponse.json({ success: true })
      );

      const req = new NextRequest('http://localhost:3000/api/internal/workers/run', {
        method: 'POST',
      });

      const res = await wrappedHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/Worker HMAC token required/i);
    });

    it('2.3 Rejects unauthenticated STAFF requests when allowAnonymous is false (HTTP 401)', async () => {
      const { client } = createMockClient();

      const wrappedHandler = withApiSecurity(
        { realm: 'STAFF', client },
        async () => NextResponse.json({ success: true })
      );

      const req = new NextRequest('http://localhost:3000/api/work-orders', {
        method: 'GET',
      });

      const res = await wrappedHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
    });
  });
});
