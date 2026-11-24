import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { GET as getAssetsRoute, POST as postAssetRoute } from '@/src/app/api/assets/route';
import { GET as getAssetDetailRoute, PATCH as patchAssetRoute, DELETE as deleteAssetRoute } from '@/src/app/api/assets/[id]/route';
import { POST as relocateAssetRoute } from '@/src/app/api/assets/[id]/relocate/route';
import { POST as updateAssetStatusRoute } from '@/src/app/api/assets/[id]/status/route';
import { getScopedAssetFilter, createAsset } from '@/src/lib/services/assetService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B3: Asset API Security & Transaction Propagation', () => {
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

  function createMockUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Asset Manager',
      email: 'assetmgr@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Asset Manager',
        permissions: [
          { permission: { resource: 'asset', action: 'read' } },
          { permission: { resource: 'asset', action: 'create' } },
          { permission: { resource: 'asset', action: 'update' } },
          { permission: { resource: 'asset', action: 'delete' } },
        ],
      },
      branchId: '33333333-3333-4333-8333-333333333333',
      branch: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'HQ Branch',
        code: 'HQ-ACC',
        type: 'HeadOffice',
        path: '/HQ-ACC/',
      },
      departmentId: '44444444-4444-4444-8444-444444444444',
      accessScope: 'Branch',
      isActive: true,
      locale: 'en-GH',
      ...overrides,
    };
  }

  function createMockTx(mockAsset: any = null) {
    const defaultAsset = {
      id: '77777777-7777-4777-8777-777777777777',
      assetTag: 'AST-2026-001',
      name: 'Diesel Generator 500kVA',
      description: 'Main backup generator',
      status: 'OPERATIONAL',
      categoryId: 'cat-1',
      branchId: '33333333-3333-4333-8333-333333333333',
      locationId: 'loc-1',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const targetAsset = mockAsset !== undefined ? mockAsset : defaultAsset;

    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('pg_backend_pid()')) {
          return [
            {
              backendPid: '1234',
              transactionId: '5678',
              sessionUser: 'zemifix_app_user',
              currentDatabase: 'zemifix_dev',
            },
          ];
        }
        if (sql.includes('FOR UPDATE')) {
          return [{
            id: defaultAsset.id,
            branchId: defaultAsset.branchId,
            locationId: defaultAsset.locationId,
            ownerCustomerId: null,
            physicalSiteCustomerId: null,
            siteId: null,
            ownershipType: 'COMPANY_OWNED',
            managingOrgType: 'INTERNAL_BRANCH',
            status: 'OPERATIONAL',
          }];
        }
        return [];
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      userScopeGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ path: '/HQ-ACC/' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      location: {
        findUnique: vi.fn().mockResolvedValue({ id: 'loc-2', branchId: '33333333-3333-4333-8333-333333333333' }),
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([defaultAsset]),
        findFirst: vi.fn().mockResolvedValue(targetAsset),
        create: vi.fn().mockResolvedValue(defaultAsset),
        update: vi.fn().mockResolvedValue(defaultAsset),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, defaultAsset, targetAsset };
  }

  it('1. Executes getScopedAssetFilter with tx parameter cleanly', async () => {
    const user = createMockUser();
    const { client, tx } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const filter = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getScopedAssetFilter(user, activeTx);
    });

    expect(filter).toBeDefined();
    expect(filter.deletedAt).toBeNull();
    expect(tx.userScopeGrant.findMany).toHaveBeenCalled();
  });

  it('2. Rejects unauthenticated request on GET /api/assets (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/assets', {
      method: 'GET',
    });

    const res = await getAssetsRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('3. Rejects unauthenticated request on GET /api/assets/[id] (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/assets/77777777-7777-4777-8777-777777777777', {
      method: 'GET',
    });

    const res = await getAssetDetailRoute(req, { params: Promise.resolve({ id: '77777777-7777-4777-8777-777777777777' }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('4. Rejects unauthenticated request on POST /api/assets/[id]/relocate (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/assets/77777777-7777-4777-8777-777777777777/relocate', {
      method: 'POST',
      body: JSON.stringify({ toLocationId: 'loc-2', reason: 'Moved to workshop' }),
    });

    const res = await relocateAssetRoute(req, { params: Promise.resolve({ id: '77777777-7777-4777-8777-777777777777' }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('5. Rejects unauthenticated request on POST /api/assets/[id]/status (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/assets/77777777-7777-4777-8777-777777777777/status', {
      method: 'POST',
      body: JSON.stringify({ newStatus: 'IN_MAINTENANCE', reason: 'Under repair' }),
    });

    const res = await updateAssetStatusRoute(req, { params: Promise.resolve({ id: '77777777-7777-4777-8777-777777777777' }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
