import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { GET as getPartsRoute, POST as createPartRoute } from '@/src/app/api/inventory/parts/route';
import { GET as getStoresRoute, POST as createStoreRoute } from '@/src/app/api/inventory/stores/route';
import { POST as issueMaterialRoute } from '@/src/app/api/inventory/issues/route';
import { POST as postReceiptRoute } from '@/src/app/api/inventory/receipts/route';
import { POST as executeTransferRoute } from '@/src/app/api/inventory/transfers/route';
import { createPart, createStore, getParts, getStores } from '@/src/lib/services/inventoryService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B4: Inventory API Security & Transaction Propagation', () => {
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
      name: 'Inventory Controller',
      email: 'inventory@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Inventory Manager',
        permissions: [
          { permission: { resource: 'inventory', action: 'read' } },
          { permission: { resource: 'inventory', action: 'create' } },
          { permission: { resource: 'inventory', action: 'update' } },
          { permission: { resource: 'inventory', action: 'delete' } },
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
      accessScope: 'Company',
      isActive: true,
      locale: 'en-GH',
      ...overrides,
    };
  }

  function createMockTx() {
    const defaultPart = {
      id: 'part-100',
      partNumber: 'P-100',
      name: 'Oil Filter 12mm',
      category: 'SPARE_PARTS',
      uom: 'PCS',
      standardCost: new Prisma.Decimal(25),
      averageCost: new Prisma.Decimal(25),
      isActive: true,
      createdAt: new Date(),
    };

    const defaultStore = {
      id: 'store-1',
      code: 'MAIN-STORE',
      name: 'Main Central Store',
      type: 'MAIN',
      branchId: '33333333-3333-4333-8333-333333333333',
      isActive: true,
      createdAt: new Date(),
    };

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
        return [];
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      part: {
        findMany: vi.fn().mockResolvedValue([defaultPart]),
        create: vi.fn().mockResolvedValue(defaultPart),
      },
      store: {
        findMany: vi.fn().mockResolvedValue([defaultStore]),
        create: vi.fn().mockResolvedValue(defaultStore),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, defaultPart, defaultStore };
  }

  it('1. Executes getParts with tx parameter cleanly inside signed transaction', async () => {
    const user = createMockUser();
    const { client, tx, defaultPart } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const parts = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getParts(user, undefined, undefined, activeTx);
    });

    expect(parts).toEqual([defaultPart]);
    expect(tx.part.findMany).toHaveBeenCalled();
  });

  it('2. Executes createPart with tx parameter cleanly inside signed transaction', async () => {
    const user = createMockUser();
    const { client, tx, defaultPart } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const part = await withSecurityContext(client, secContext, async (activeTx) => {
      return await createPart(user, { partNumber: 'P-100', name: 'Oil Filter 12mm' }, activeTx);
    });

    expect(part).toEqual(defaultPart);
    expect(tx.part.create).toHaveBeenCalled();
  });

  it('3. Rejects unauthenticated request on GET /api/inventory/parts (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/inventory/parts', {
      method: 'GET',
    });

    const res = await getPartsRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('4. Rejects unauthenticated request on POST /api/inventory/issues (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/inventory/issues', {
      method: 'POST',
      body: JSON.stringify({ workOrderId: 'wo-1', storeId: 'store-1', partId: 'part-1', quantity: 1 }),
    });

    const res = await issueMaterialRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
