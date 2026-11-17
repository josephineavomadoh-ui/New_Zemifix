// @vitest-environment node
/**
 * Unit tests for Technician PWA Material Request Workflow (Phase 1)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateUuidV7 } from '../../lib/uuid';

// Mock IndexedDB and Offline Manager
vi.mock('../../lib/pwa/db', () => ({
  enqueueOfflineMutation: vi.fn(),
  getQueuedOutboxMutations: vi.fn(),
  openIndexedDb: vi.fn(),
}));

import { enqueueOfflineMutation, getQueuedOutboxMutations } from '../../lib/pwa/db';

describe('Technician PWA Material Request Offline Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Generates UUIDv7 idempotency key and enqueues MATERIAL_ISSUE_REQUEST', async () => {
    const workOrderId = 'wo-test-uuid-001';
    const storeId = 'store-test-uuid-001';
    const partId = 'part-test-uuid-001';
    const idempotencyKey = generateUuidV7();

    const payload = {
      workOrderId,
      storeId,
      partId,
      quantity: 5,
      reason: 'Replacement roller bearings for conveyor maintenance',
      partName: 'SKF Roller Bearing',
      storeName: 'Main Store Warehouse',
    };

    const mutationItem = {
      idempotencyKey,
      actionType: 'MATERIAL_ISSUE_REQUEST',
      entityType: 'part',
      entityId: partId,
      payload,
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };

    vi.mocked(enqueueOfflineMutation).mockResolvedValue(undefined);

    await enqueueOfflineMutation(mutationItem);

    expect(enqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey,
        actionType: 'MATERIAL_ISSUE_REQUEST',
        entityType: 'part',
        entityId: partId,
        payload: expect.objectContaining({
          workOrderId,
          storeId,
          partId,
          quantity: 5,
          reason: 'Replacement roller bearings for conveyor maintenance',
        }),
        status: 'QUEUED',
      })
    );
  });

  it('2. Retrieves queued material requests from offline outbox', async () => {
    const mockOutbox = [
      {
        idempotencyKey: 'idemp-key-101',
        actionType: 'MATERIAL_ISSUE_REQUEST',
        entityType: 'part',
        entityId: 'part-101',
        payload: {
          workOrderId: 'wo-101',
          storeId: 'store-01',
          partId: 'part-101',
          quantity: 2,
          reason: 'Emergency seal replacement',
        },
        timestamp: Date.now(),
        status: 'QUEUED' as const,
      },
    ];

    vi.mocked(getQueuedOutboxMutations).mockResolvedValue(mockOutbox);

    const queued = await getQueuedOutboxMutations();

    expect(queued).toHaveLength(1);
    expect(queued[0].actionType).toBe('MATERIAL_ISSUE_REQUEST');
    expect(queued[0].payload.quantity).toBe(2);
    expect(queued[0].payload.workOrderId).toBe('wo-101');
  });
});
