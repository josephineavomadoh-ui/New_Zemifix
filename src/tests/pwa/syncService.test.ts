// @vitest-environment node
/**
 * Integration-style unit tests for src/lib/services/syncService.ts
 *
 * Covers the WORK_ORDER_NOTE action type and error handling in
 * executeSingleOfflineMutation (via processSyncBatch).
 *
 * Uses vi.mock to replace prisma, the UUID helper, and all dependent service
 * modules so that no database connection is required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../lib/prisma', () => ({ prisma: {} }));

vi.mock('../../lib/uuid', () => ({
  generateUuidV7: vi.fn().mockReturnValue('mock-uuid-v7'),
}));

vi.mock('../../lib/services/auditService', () => ({
  appendAuditLog: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/services/workOrderService', () => ({
  getScopedWorkOrderFilter: vi.fn().mockResolvedValue({ deletedAt: null }),
  transitionWorkOrderStatus: vi.fn(),
  recordWorkOrderLabor: vi.fn(),
}));

vi.mock('../../lib/services/inventoryService', () => ({
  issueMaterialToWorkOrder: vi.fn(),
  postStockTransaction: vi.fn(),
}));

vi.mock('../../lib/services/telemetryService', () => ({
  submitMeterReading: vi.fn(),
  logDowntimeStart: vi.fn(),
}));

import { prisma } from '../../lib/prisma';
import { getScopedWorkOrderFilter } from '../../lib/services/workOrderService';
import { processSyncBatch } from '../../lib/services/syncService';
import type { AuthenticatedUser } from '../../lib/auth';
import type { QueuedMutationItem } from '../../lib/services/syncService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser: AuthenticatedUser = {
  id: 'user-tech-1',
  name: 'Jane Tech',
  email: 'jane.tech@example.test',
  roleId: 'role-tech',
  role: { id: 'role-tech', name: 'Technician' },
  branchId: 'branch-1',
  branch: { id: 'branch-1', name: 'Main Branch', code: 'MB', type: 'Branch' },
  accessScope: 'Branch',
  isActive: true,
  locale: 'en',
};

/**
 * Returns a prisma mock that:
 * - has no existing mutation (findUnique returns null → forces full processing)
 * - creates the batch, creates the mutation record, updates both
 * - runs $transaction by calling the callback with a tx object built from makeInnerTx
 *   on the first call; subsequent calls (the conflict-recording 2nd $transaction) get
 *   a tx that exposes offlineSyncMutation.update and offlineSyncConflict.create.
 */
function setupPrismaMock(makeInnerTx: () => Record<string, unknown>) {
  const batchRecord = {
    id: 'batch-uuid',
    batchRef: 'BATCH-2026-000001',
    userId: mockUser.id,
    status: 'PROCESSING',
    mutationCount: 1,
  };

  const mutationRecord = {
    id: 'mutation-uuid',
    status: 'PROCESSING',
  };

  const updatedBatch = {
    ...batchRecord,
    status: 'COMPLETED',
    syncedCount: 1,
    conflictCount: 0,
    failedCount: 0,
  };

  // The conflict-resolution path in processSyncBatch calls prisma.$transaction a
  // second time with a tx that needs offlineSyncMutation.update and
  // offlineSyncConflict.create.
  const conflictTx = {
    offlineSyncMutation: {
      update: vi.fn().mockResolvedValue({ ...mutationRecord, status: 'CONFLICT' }),
    },
    offlineSyncConflict: {
      create: vi.fn().mockResolvedValue({ id: 'conflict-record-uuid' }),
    },
  };

  let txCallCount = 0;

  const mockPrisma = {
    offlineSyncMutation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(mutationRecord),
      update: vi.fn().mockResolvedValue({ ...mutationRecord, status: 'SYNCED' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    offlineSyncBatch: {
      create: vi.fn().mockResolvedValue(batchRecord),
      update: vi.fn().mockResolvedValue(updatedBatch),
    },
    $transaction: vi.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
      txCallCount++;
      // First call → business operation tx (uses caller-supplied inner tx)
      // Subsequent calls → conflict-recording tx
      return cb(txCallCount === 1 ? makeInnerTx() : conflictTx);
    }),
  };

  Object.assign(prisma, mockPrisma);
  return mockPrisma;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('syncService — WORK_ORDER_NOTE action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a WorkOrderComment record with isCustomerVisible: false', async () => {
    const createdComment = {
      id: 'comment-1',
      workOrderId: 'wo-1',
      authorUserId: mockUser.id,
      commentText: 'Completed the inspection',
      isCustomerVisible: false,
    };

    const txWorkOrderCreate = vi.fn().mockResolvedValue(createdComment);
    const txWorkOrderFindFirst = vi.fn().mockResolvedValue({ id: 'wo-1' });

    setupPrismaMock(() => ({
      workOrder: { findFirst: txWorkOrderFindFirst },
      workOrderComment: { create: txWorkOrderCreate },
    }));

    const mutation: QueuedMutationItem = {
      idempotencyKey: 'key-note-1',
      actionType: 'WORK_ORDER_NOTE',
      entityType: 'work_order_comment',
      entityId: 'wo-1',
      payload: { workOrderId: 'wo-1', body: 'Completed the inspection' },
    };

    const result = await processSyncBatch(mockUser, { mutations: [mutation] });

    expect(result.syncedCount).toBe(1);
    expect(result.conflictCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.results[0].status).toBe('SYNCED');

    // Verify the comment was created with the right shape
    expect(txWorkOrderCreate).toHaveBeenCalledWith({
      data: {
        workOrderId: 'wo-1',
        authorUserId: mockUser.id,
        commentText: 'Completed the inspection',
        isCustomerVisible: false,
      },
    });
  });

  it('is rejected with UNAUTHORIZED_WORK_ORDER when the work order is not in scope', async () => {
    // findFirst returns null → work order not in scope
    const txWorkOrderFindFirst = vi.fn().mockResolvedValue(null);

    setupPrismaMock(() => ({
      workOrder: { findFirst: txWorkOrderFindFirst },
      workOrderComment: { create: vi.fn() },
    }));

    const mutation: QueuedMutationItem = {
      idempotencyKey: 'key-note-unauth',
      actionType: 'WORK_ORDER_NOTE',
      entityType: 'work_order_comment',
      entityId: 'wo-restricted',
      payload: { workOrderId: 'wo-restricted', body: 'Some note' },
    };

    const result = await processSyncBatch(mockUser, { mutations: [mutation] });

    // The mutation should land as CONFLICT (UNAUTHORIZED_WORK_ORDER is a conflict code)
    expect(result.conflictCount).toBe(1);
    expect(result.syncedCount).toBe(0);
    expect(result.results[0].status).toBe('CONFLICT');
    expect(result.results[0].reason).toMatch(/UNAUTHORIZED_WORK_ORDER/);
  });

  it('creates a comment when body is empty (body validation is the API layer job)', async () => {
    const txWorkOrderCreate = vi.fn().mockResolvedValue({
      id: 'comment-empty-body',
      commentText: '',
      isCustomerVisible: false,
    });
    const txWorkOrderFindFirst = vi.fn().mockResolvedValue({ id: 'wo-1' });

    setupPrismaMock(() => ({
      workOrder: { findFirst: txWorkOrderFindFirst },
      workOrderComment: { create: txWorkOrderCreate },
    }));

    const mutation: QueuedMutationItem = {
      idempotencyKey: 'key-note-empty',
      actionType: 'WORK_ORDER_NOTE',
      entityType: 'work_order_comment',
      entityId: 'wo-1',
      payload: { workOrderId: 'wo-1', body: '' },
    };

    const result = await processSyncBatch(mockUser, { mutations: [mutation] });

    expect(result.syncedCount).toBe(1);
    expect(txWorkOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ commentText: '', isCustomerVisible: false }),
    });
  });
});

describe('syncService — unknown action type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a FAILED result for an unsupported action type', async () => {
    const txWorkOrderFindFirst = vi.fn().mockResolvedValue({ id: 'wo-1' });

    setupPrismaMock(() => ({
      workOrder: { findFirst: txWorkOrderFindFirst },
    }));

    const mutation: QueuedMutationItem = {
      idempotencyKey: 'key-unknown',
      actionType: 'TELEPORT_TECHNICIAN',
      entityType: 'work_order',
      entityId: 'wo-1',
      payload: { workOrderId: 'wo-1' },
    };

    const result = await processSyncBatch(mockUser, { mutations: [mutation] });

    expect(result.failedCount).toBe(1);
    expect(result.syncedCount).toBe(0);
    expect(result.results[0].status).toBe('FAILED');
    expect(result.results[0].error).toMatch(/UNSUPPORTED_ACTION_TYPE/);
  });
});
