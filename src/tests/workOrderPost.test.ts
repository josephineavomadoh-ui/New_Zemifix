import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { POST } from '@/src/app/api/work-orders/route';
import { createWorkOrder } from '@/src/lib/services/workOrderService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B1: Secure Work Orders POST Endpoint', () => {
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
      name: 'John Supervisor',
      email: 'supervisor@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Maintenance Supervisor',
        permissions: [
          {
            permission: {
              resource: 'work_order',
              action: 'create',
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
    const createdWo = {
      id: '55555555-5555-4555-8555-555555555555',
      workOrderNumber: 'WO-2026-999999',
      title: 'Fix AC Unit',
      description: 'AC in server room is leaking',
      status: 'OPEN',
      priority: 'HIGH',
      type: 'CORRECTIVE',
      branchId: '33333333-3333-4333-8333-333333333333',
      departmentId: '44444444-4444-4444-8444-444444444444',
      supervisorUserId: '11111111-1111-4111-8111-111111111111',
      assignedUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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
      asset: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      location: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      customerContract: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      slaPolicy: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workOrder: {
        create: vi.fn().mockResolvedValue(createdWo),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, createdWo };
  }

  it('1. Executes createWorkOrder inside signed security transaction cleanly', async () => {
    const user = createMockUser();
    const { client, tx, createdWo } = createMockTx();

    const secContext: SecurityContextInput = {
      userId: user.id,
      branchId: user.branchId,
      branchPath: user.branch.path ?? '',
      departmentId: user.departmentId,
      accessScope: 'Branch',
      realm: 'STAFF',
    };

    const woData = {
      title: 'Fix AC Unit',
      description: 'AC in server room is leaking',
      type: 'CORRECTIVE' as const,
      priority: 'HIGH' as const,
    };

    const result = await withSecurityContext(client, secContext, async (activeTx) => {
      return await createWorkOrder(user, woData, activeTx);
    });

    expect(result).toEqual(createdWo);
    expect(tx.workOrder.create).toHaveBeenCalled();
  });

  it('2. Rejects unauthenticated request on POST /api/work-orders (HTTP 401)', async () => {
    const req = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test WO', description: 'Test' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
  });
});
