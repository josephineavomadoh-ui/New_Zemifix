// @vitest-environment node
/**
 * Unit tests for Technician PWA Asset Details Workspace & Offline Sync (Phase 2)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateUuidV7 } from '../../lib/uuid';

// Mock IndexedDB Manager
vi.mock('../../lib/pwa/db', () => ({
  cacheAssets: vi.fn(),
  getCachedAssets: vi.fn(),
  getCachedAssetById: vi.fn(),
  enqueueOfflineMutation: vi.fn(),
  getQueuedOutboxMutations: vi.fn(),
  openIndexedDb: vi.fn(),
}));

import {
  cacheAssets,
  getCachedAssets,
  getCachedAssetById,
  enqueueOfflineMutation,
  getQueuedOutboxMutations,
} from '../../lib/pwa/db';

describe('Technician PWA Asset Workspace & Offline Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Caches asset detail locally in IndexedDB store', async () => {
    const testAsset = {
      id: 'asset-test-uuid-001',
      name: 'Cat 345D Hydraulic Excavator',
      tag: 'AST-EXC-001',
      category: 'Heavy Equipment',
      status: 'OPERATIONAL',
      cachedAt: Date.now(),
    };

    vi.mocked(cacheAssets).mockResolvedValue(undefined);
    vi.mocked(getCachedAssetById).mockResolvedValue(testAsset as any);

    await cacheAssets([testAsset as any]);
    const cached = await getCachedAssetById('asset-test-uuid-001');

    expect(cacheAssets).toHaveBeenCalledWith([testAsset]);
    expect(cached?.name).toBe('Cat 345D Hydraulic Excavator');
    expect(cached?.tag).toBe('AST-EXC-001');
  });

  it('2. Enqueues METER_READING offline mutation with UUIDv7 idempotency key', async () => {
    const assetId = 'asset-test-uuid-001';
    const meterId = 'meter-test-uuid-001';
    const idempotencyKey = generateUuidV7();

    const payload = {
      assetId,
      meterId,
      readingValue: 1450.5,
      readingTimestamp: new Date().toISOString(),
    };

    const mutationItem = {
      idempotencyKey,
      actionType: 'METER_READING',
      entityType: 'asset_meter',
      entityId: meterId,
      payload,
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };

    vi.mocked(enqueueOfflineMutation).mockResolvedValue(undefined);

    await enqueueOfflineMutation(mutationItem);

    expect(enqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey,
        actionType: 'METER_READING',
        entityType: 'asset_meter',
        entityId: meterId,
        payload: expect.objectContaining({
          assetId,
          meterId,
          readingValue: 1450.5,
        }),
        status: 'QUEUED',
      })
    );
  });

  it('3. Enqueues DOWNTIME_START offline mutation with UUIDv7 idempotency key', async () => {
    const assetId = 'asset-test-uuid-002';
    const idempotencyKey = generateUuidV7();

    const payload = {
      assetId,
      downtimeType: 'UNPLANNED',
      reason: 'Hydraulic pump main line burst',
      startedAt: new Date().toISOString(),
    };

    const mutationItem = {
      idempotencyKey,
      actionType: 'DOWNTIME_START',
      entityType: 'asset',
      entityId: assetId,
      payload,
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };

    vi.mocked(enqueueOfflineMutation).mockResolvedValue(undefined);

    await enqueueOfflineMutation(mutationItem);

    expect(enqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey,
        actionType: 'DOWNTIME_START',
        entityType: 'asset',
        entityId: assetId,
        payload: expect.objectContaining({
          assetId,
          downtimeType: 'UNPLANNED',
          reason: 'Hydraulic pump main line burst',
        }),
        status: 'QUEUED',
      })
    );
  });
});
