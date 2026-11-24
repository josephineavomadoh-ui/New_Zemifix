import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { GET as getRequisitionsRoute, POST as createRequisitionRoute } from '@/src/app/api/procurement/requisitions/route';
import { GET as getPurchaseOrdersRoute, POST as createPurchaseOrderRoute } from '@/src/app/api/procurement/purchase-orders/route';
import { POST as createGrnRoute } from '@/src/app/api/procurement/grn/route';
import { createPurchaseRequisition, createPurchaseOrder, getPurchaseRequisitions, getPurchaseOrders } from '@/src/lib/services/procurementService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B5: Procurement API Security & Transaction Propagation', () => {
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
      name: 'Procurement Manager',
      email: 'procurement@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Procurement Officer',
        permissions: [
          { permission: { resource: 'procurement', action: 'read' } },
          { permission: { resource: 'procurement', action: 'create' } },
          { permission: { resource: 'procurement', action: 'update' } },
          { permission: { resource: 'procurement', action: 'approve' } },
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
    const defaultReq = {
      id: 'pr-100',
      requisitionNumber: 'PR-2026-000001',
      justification: 'Spare parts for generator',
      priority: 'MEDIUM',
      status: 'SUBMITTED',
      estimatedTotal: new Prisma.Decimal(500),
      branchId: '33333333-3333-4333-8333-333333333333',
      requesterUserId: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date(),
    };

    const defaultPo = {
      id: 'po-100',
      poNumber: 'PO-2026-000001',
      vendorId: 'vendor-1',
      totalAmount: new Prisma.Decimal(592.5),
      status: 'ISSUED',
      branchId: '33333333-3333-4333-8333-333333333333',
      approvedByUserId: '11111111-1111-4111-8111-111111111111',
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
      purchaseRequisition: {
        findMany: vi.fn().mockResolvedValue([defaultReq]),
        create: vi.fn().mockResolvedValue(defaultReq),
      },
      purchaseOrder: {
        findMany: vi.fn().mockResolvedValue([defaultPo]),
        create: vi.fn().mockResolvedValue(defaultPo),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, defaultReq, defaultPo };
  }

  it('1. Executes getPurchaseRequisitions with tx parameter cleanly inside signed transaction', async () => {
    const user = createMockUser();
    const { client, tx, defaultReq } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const reqs = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getPurchaseRequisitions(user, undefined, activeTx);
    });

    expect(reqs).toEqual([defaultReq]);
    expect(tx.purchaseRequisition.findMany).toHaveBeenCalled();
  });

  it('2. Executes createPurchaseRequisition with tx parameter cleanly inside signed transaction', async () => {
    const user = createMockUser();
    const { client, tx, defaultReq } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Company',
      realm: 'STAFF',
    };

    const reqData = {
      justification: 'Spare parts for generator',
      items: [{ description: 'Oil filter', quantity: 2, estimatedUnitPrice: 250 }],
    };

    const req = await withSecurityContext(client, secContext, async (activeTx) => {
      return await createPurchaseRequisition(user, reqData, activeTx);
    });

    expect(req).toEqual(defaultReq);
    expect(tx.purchaseRequisition.create).toHaveBeenCalled();
  });

  it('3. Rejects unauthenticated request on GET /api/procurement/requisitions (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/procurement/requisitions', {
      method: 'GET',
    });

    const res = await getRequisitionsRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });

  it('4. Rejects unauthenticated request on POST /api/procurement/grn (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/procurement/grn', {
      method: 'POST',
      body: JSON.stringify({ poId: 'po-1', storeId: 'store-1', items: [] }),
    });

    const res = await createGrnRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
