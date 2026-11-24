import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { GET } from '@/src/app/api/work-orders/route';
import { getWorkOrders, getPaginatedWorkOrders } from '@/src/lib/services/workOrderService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2A: Pilot Integration of Work Orders Read Endpoint & Service Transaction Propagation', () => {
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
      name: 'John Maintenance',
      email: 'john@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Maintenance Technician',
        permissions: [
          {
            permission: {
              resource: 'work_order',
              action: 'read',
            },
          },
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

  function createMockTx() {
    const workOrdersList = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        workOrderNumber: 'WO-2026-000001',
        title: 'Generator Maintenance',
        description: 'Routine oil change',
        status: 'OPEN',
        priority: 'MEDIUM',
        type: 'CORRECTIVE',
        branchId: '33333333-3333-4333-8333-333333333333',
        departmentId: '44444444-4444-4444-8444-444444444444',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

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
      userScopeGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ path: '/HQ-ACC/' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workOrder: {
        findMany: vi.fn().mockResolvedValue(workOrdersList),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, workOrdersList };
  }

  it('1. Executes getWorkOrders inside signed security transaction cleanly', async () => {
    const user = createMockUser();
    const { client, tx, workOrdersList } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const workOrders = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getWorkOrders(user, activeTx);
    });

    expect(workOrders).toEqual(workOrdersList);
    expect(tx.workOrder.findMany).toHaveBeenCalled();
  });

  it('2. Executes getPaginatedWorkOrders inside signed security transaction cleanly', async () => {
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

    const result = await withSecurityContext(client, secContext, async (activeTx) => {
      return await getPaginatedWorkOrders(user, { page: 1, pageSize: 10 }, activeTx);
    });

    expect(result.workOrders.length).toBe(1);
    expect(result.pagination.totalCount).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
    expect(tx.workOrder.count).toHaveBeenCalled();
    expect(tx.workOrder.findMany).toHaveBeenCalled();
  });

  it('3. Rejects unauthenticated request on GET /api/work-orders (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
