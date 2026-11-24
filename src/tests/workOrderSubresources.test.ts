import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
  process.env.APP_CONTEXT_HMAC_SECRET =
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
});

import { POST as postComment } from '@/src/app/api/work-orders/[id]/comments/route';
import { POST as postLabor } from '@/src/app/api/work-orders/[id]/labor/route';
import { POST as postParts } from '@/src/app/api/work-orders/[id]/parts/route';
import {
  createWorkOrderComment,
  recordWorkOrderLabor,
  recordWorkOrderPart,
  addWorkOrderAttachmentMetadata,
} from '@/src/lib/services/workOrderService';
import { withSecurityContext, SecurityContextInput } from '@/src/lib/services/securityContextService';
import type { AuthenticatedUser } from '@/src/lib/auth';
import { Prisma, PrismaClient } from '@prisma/client';

describe('Stage 3 Increment 2B2C: Secure Work Order Sub-Resource Endpoints', () => {
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
      name: 'John Tech',
      email: 'tech@zemifix.com',
      roleId: '22222222-2222-4222-8222-222222222222',
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Maintenance Technician',
        permissions: [
          {
            permission: {
              resource: 'work_order',
              action: 'update',
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
    const defaultWo = {
      id: '55555555-5555-4555-8555-555555555555',
      workOrderNumber: 'WO-2026-000001',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      actualHours: new Prisma.Decimal(0),
      totalCost: new Prisma.Decimal(0),
      branchId: '33333333-3333-4333-8333-333333333333',
      departmentId: '44444444-4444-4444-8444-444444444444',
      deletedAt: null,
      contract: null,
    };

    const mockComment = {
      id: 'comm-1',
      workOrderId: defaultWo.id,
      authorUserId: '11111111-1111-4111-8111-111111111111',
      commentText: 'Replaced oil filter',
      isCustomerVisible: false,
      createdAt: new Date(),
    };

    const mockLabor = {
      id: 'labor-1',
      workOrderId: defaultWo.id,
      technicianUserId: '11111111-1111-4111-8111-111111111111',
      workDate: new Date(),
      hoursWorked: new Prisma.Decimal(2),
      skillCategory: 'REGULAR',
      hourlyRate: new Prisma.Decimal(50),
      totalCost: new Prisma.Decimal(100),
      description: 'Filter replacement labor',
    };

    const mockPart = {
      id: 'part-1',
      workOrderId: defaultWo.id,
      partNumber: 'P-100',
      partName: 'Oil Filter 12mm',
      quantityPlanned: new Prisma.Decimal(1),
      quantityConsumed: new Prisma.Decimal(1),
      unitCost: new Prisma.Decimal(25),
    };

    const mockAttachment = {
      id: 'att-1',
      workOrderId: defaultWo.id,
      uploaderUserId: '11111111-1111-4111-8111-111111111111',
      fileName: '[GENERAL] oil-filter.jpg',
      fileUrl: 'work-orders/12345-oil-filter.jpg',
      fileSize: 102400,
      mimeType: 'image/jpeg',
      isCustomerVisible: false,
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
      userScopeGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({ path: '/HQ-ACC/' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      workOrder: {
        findFirst: vi.fn().mockResolvedValue(defaultWo),
        findUnique: vi.fn().mockResolvedValue(defaultWo),
        update: vi.fn().mockResolvedValue(defaultWo),
      },
      workOrderComment: {
        create: vi.fn().mockResolvedValue(mockComment),
      },
      workOrderLabor: {
        create: vi.fn().mockResolvedValue(mockLabor),
      },
      workOrderPart: {
        create: vi.fn().mockResolvedValue(mockPart),
      },
      workOrderAttachment: {
        create: vi.fn().mockResolvedValue(mockAttachment),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    return { client, tx, mockComment, mockLabor, mockPart, mockAttachment };
  }

  describe('1. Work Order Comments', () => {
    it('1.1 Executes createWorkOrderComment inside signed transaction cleanly', async () => {
      const user = createMockUser();
      const { client, tx, mockComment } = createMockTx();

      const secContext: SecurityContextInput = {
        userId: user.id,
        branchId: user.branchId,
        branchPath: user.branch.path ?? '',
        departmentId: user.departmentId,
        accessScope: 'Branch',
        realm: 'STAFF',
      };

      const result = await withSecurityContext(client, secContext, async (activeTx) => {
        return await createWorkOrderComment(
          user,
          { workOrderId: '55555555-5555-4555-8555-555555555555', commentText: 'Replaced oil filter' },
          activeTx
        );
      });

      expect(result).toEqual(mockComment);
      expect(tx.workOrderComment.create).toHaveBeenCalled();
    });

    it('1.2 Rejects unauthenticated request on POST /api/work-orders/[id]/comments (HTTP 401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/work-orders/55555555-5555-4555-8555-555555555555/comments', {
        method: 'POST',
        body: JSON.stringify({ body: 'Test comment' }),
      });

      const res = await postComment(req, { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
    });
  });

  describe('2. Work Order Labor', () => {
    it('2.1 Executes recordWorkOrderLabor inside signed transaction cleanly', async () => {
      const user = createMockUser();
      const { client, tx, mockLabor } = createMockTx();

      const secContext: SecurityContextInput = {
        userId: user.id,
        branchId: user.branchId,
        branchPath: user.branch.path ?? '',
        departmentId: user.departmentId,
        accessScope: 'Branch',
        realm: 'STAFF',
      };

      const result = await withSecurityContext(client, secContext, async (activeTx) => {
        return await recordWorkOrderLabor(
          user,
          { workOrderId: '55555555-5555-4555-8555-555555555555', technicianUserId: user.id, workDate: new Date(), hoursWorked: 2 },
          activeTx
        );
      });

      expect(result).toEqual(mockLabor);
      expect(tx.workOrderLabor.create).toHaveBeenCalled();
    });

    it('2.2 Rejects unauthenticated request on POST /api/work-orders/[id]/labor (HTTP 401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/work-orders/55555555-5555-4555-8555-555555555555/labor', {
        method: 'POST',
        body: JSON.stringify({ hoursWorked: '2' }),
      });

      const res = await postLabor(req, { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
    });
  });

  describe('3. Work Order Parts', () => {
    it('3.1 Executes recordWorkOrderPart inside signed transaction cleanly', async () => {
      const user = createMockUser();
      const { client, tx, mockPart } = createMockTx();

      const secContext: SecurityContextInput = {
        userId: user.id,
        branchId: user.branchId,
        branchPath: user.branch.path ?? '',
        departmentId: user.departmentId,
        accessScope: 'Branch',
        realm: 'STAFF',
      };

      const result = await withSecurityContext(client, secContext, async (activeTx) => {
        return await recordWorkOrderPart(
          user,
          { workOrderId: '55555555-5555-4555-8555-555555555555', partNumber: 'P-100', partName: 'Oil Filter 12mm', quantityConsumed: 1, unitCost: 25 },
          activeTx
        );
      });

      expect(result).toEqual(mockPart);
      expect(tx.workOrderPart.create).toHaveBeenCalled();
    });

    it('3.2 Rejects unauthenticated request on POST /api/work-orders/[id]/parts (HTTP 401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/work-orders/55555555-5555-4555-8555-555555555555/parts', {
        method: 'POST',
        body: JSON.stringify({ partNumber: 'P-100', partName: 'Filter' }),
      });

      const res = await postParts(req, { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/UNAUTHORIZED: Active staff session required/i);
    });
  });

  describe('4. Work Order Attachments', () => {
    it('4.1 Executes addWorkOrderAttachmentMetadata inside signed transaction cleanly', async () => {
      const user = createMockUser();
      const { client, tx, mockAttachment } = createMockTx();

      const secContext: SecurityContextInput = {
        userId: user.id,
        branchId: user.branchId,
        branchPath: user.branch.path ?? '',
        departmentId: user.departmentId,
        accessScope: 'Branch',
        realm: 'STAFF',
      };

      const result = await withSecurityContext(client, secContext, async (activeTx) => {
        return await addWorkOrderAttachmentMetadata(
          user,
          {
            workOrderId: '55555555-5555-4555-8555-555555555555',
            fileName: '[GENERAL] oil-filter.jpg',
            fileUrl: 'work-orders/12345-oil-filter.jpg',
            fileSize: 102400,
            mimeType: 'image/jpeg',
          },
          activeTx
        );
      });

      expect(result).toEqual(mockAttachment);
      expect(tx.workOrderAttachment.create).toHaveBeenCalled();
    });
  });
});
