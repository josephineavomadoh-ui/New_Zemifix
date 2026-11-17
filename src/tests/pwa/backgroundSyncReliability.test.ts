// @vitest-environment node
/**
 * Unit tests for Technician PWA Synchronization Reliability & W3C Background Sync (Phase 4)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock IndexedDB Manager
vi.mock('../../lib/pwa/db', () => ({
  getPendingPhotos: vi.fn(),
  updatePendingPhotoStatus: vi.fn(),
  deletePendingPhoto: vi.fn(),
  getQueuedOutboxMutations: vi.fn(),
  openIndexedDb: vi.fn(),
}));

import {
  getPendingPhotos,
  getQueuedOutboxMutations,
} from '../../lib/pwa/db';
import {
  flushOfflineSyncQueue,
  registerBackgroundSync,
} from '../../lib/pwa/offlineSyncManager';

/** Stub `window` so environment checks pass in Node. */
function ensureWindow() {
  if (typeof globalThis.window === 'undefined') {
    // @ts-ignore
    globalThis.window = globalThis;
  }
}

/** Stub `navigator.onLine`. */
function setOnline(value: boolean) {
  if (typeof globalThis.navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: value },
      configurable: true,
      writable: true,
    });
  } else {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value,
      configurable: true,
      writable: true,
    });
  }
}

describe('Technician PWA Synchronization Reliability & Background Sync (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWindow();
    setOnline(true);
  });

  it('1. Registers W3C Background Sync tag with Service Worker when supported', async () => {
    const registerMock = vi.fn().mockResolvedValue(undefined);
    const swMock = {
      ready: Promise.resolve({
        sync: {
          register: registerMock,
        },
      }),
    };

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: swMock,
      configurable: true,
      writable: true,
    });
    // @ts-ignore
    globalThis.window.SyncManager = function () {};

    const registered = await registerBackgroundSync();

    expect(registered).toBe(true);
    expect(registerMock).toHaveBeenCalledWith('zemifix-pwa-sync');
  });

  it('2. Fallbacks gracefully when Background Sync is not supported by browser', async () => {
    const swMockNoSync = {
      ready: Promise.resolve({}), // No sync property on registration
    };

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: swMockNoSync,
      configurable: true,
      writable: true,
    });
    // @ts-ignore
    delete globalThis.window.SyncManager;

    const registered = await registerBackgroundSync();

    expect(registered).toBe(false);
  });

  it('3. Sorts queued mutations chronologically by timestamp before batch submission', async () => {
    const mut1 = {
      idempotencyKey: 'idemp-001',
      actionType: 'WORK_ORDER_STATUS_SHIFT',
      entityType: 'work_order',
      entityId: 'wo-1',
      payload: { workOrderId: 'wo-1', newStatus: 'IN_PROGRESS' },
      timestamp: 2000,
      status: 'QUEUED' as const,
    };

    const mut2 = {
      idempotencyKey: 'idemp-002',
      actionType: 'CHECKLIST_UPDATE',
      entityType: 'checklist_item',
      entityId: 'chk-1',
      payload: { checklistItemId: 'chk-1', passFail: true },
      timestamp: 1000, // Earlier timestamp
      status: 'QUEUED' as const,
    };

    vi.mocked(getPendingPhotos).mockResolvedValue([]);
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([mut1, mut2]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        syncedCount: 2,
        conflictCount: 0,
        failedCount: 0,
        results: [
          { idempotencyKey: 'idemp-002', status: 'SYNCED' },
          { idempotencyKey: 'idemp-001', status: 'SYNCED' },
        ],
      }),
    });

    globalThis.fetch = fetchMock;

    const mockDb = {
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn().mockReturnValue({
          delete: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
        }),
      }),
    };
    const openDbMock = vi.fn().mockResolvedValue(mockDb);
    const dbModule = await import('../../lib/pwa/db');
    vi.mocked(dbModule.openIndexedDb).mockImplementation(openDbMock as any);

    const result = await flushOfflineSyncQueue();

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();

    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Verify mut2 (timestamp 1000) was ordered before mut1 (timestamp 2000)
    expect(fetchBody.mutations[0].idempotencyKey).toBe('idemp-002');
    expect(fetchBody.mutations[1].idempotencyKey).toBe('idemp-001');
  });
});
