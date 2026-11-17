// @vitest-environment node
/**
 * Unit tests for src/lib/pwa/offlineSyncManager.ts
 *
 * All db.ts imports and global fetch are mocked; navigator.onLine is stubbed
 * per test to control the online/offline branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock db.ts ───────────────────────────────────────────────────────────────
vi.mock('../../lib/pwa/db', () => ({
  getPendingPhotos: vi.fn(),
  updatePendingPhotoStatus: vi.fn(),
  deletePendingPhoto: vi.fn(),
  getQueuedOutboxMutations: vi.fn(),
  openIndexedDb: vi.fn(),
}));

import {
  getPendingPhotos,
  updatePendingPhotoStatus,
  deletePendingPhoto,
  getQueuedOutboxMutations,
  openIndexedDb,
} from '../../lib/pwa/db';
import { flushOfflineSyncQueue, uploadPendingPhotos } from '../../lib/pwa/offlineSyncManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a minimal mock IDBDatabase whose syncOutbox store accepts put/delete. */
function makeMockDb() {
  const storeMock = {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  };
  const txMock = {
    objectStore: vi.fn().mockReturnValue(storeMock),
    set oncomplete(h: (() => void) | null) {
      if (h) Promise.resolve().then(h);
    },
  };
  const dbMock = {
    transaction: vi.fn().mockReturnValue(txMock),
  };
  return { dbMock, txMock, storeMock };
}

/** Stub `navigator.onLine`. Vitest runs in node so navigator may not exist. */
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

/** Stub `window` so the `typeof window === 'undefined'` check passes. */
function ensureWindow() {
  if (typeof globalThis.window === 'undefined') {
    // @ts-ignore
    globalThis.window = globalThis;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('offlineSyncManager — uploadPendingPhotos()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWindow();
  });

  it('returns { uploadedCount: 0, failedCount: 0 } when offline', async () => {
    setOnline(false);

    const result = await uploadPendingPhotos();

    expect(result).toEqual({ uploadedCount: 0, failedCount: 0 });
    expect(getPendingPhotos).not.toHaveBeenCalled();
  });

  it('returns { uploadedCount: 0, failedCount: 0 } when there are no pending photos', async () => {
    setOnline(true);
    vi.mocked(getPendingPhotos).mockResolvedValue([]);

    const result = await uploadPendingPhotos();

    expect(result).toEqual({ uploadedCount: 0, failedCount: 0 });
  });

  it('uploads a pending photo and calls deletePendingPhoto on success', async () => {
    setOnline(true);

    const photo = {
      localId: 'photo-1',
      workOrderId: 'wo-1',
      blob: new Blob(['img'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING' as const,
    };
    vi.mocked(getPendingPhotos).mockResolvedValue([photo]);
    vi.mocked(updatePendingPhotoStatus).mockResolvedValue(undefined);
    vi.mocked(deletePendingPhoto).mockResolvedValue(undefined);

    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    globalThis.fetch = fetchMock;

    const result = await uploadPendingPhotos();

    expect(updatePendingPhotoStatus).toHaveBeenCalledWith('photo-1', 'UPLOADING');
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/work-orders/wo-1/attachments`,
      expect.objectContaining({ method: 'POST' })
    );
    expect(deletePendingPhoto).toHaveBeenCalledWith('photo-1');
    expect(result).toEqual({ uploadedCount: 1, failedCount: 0 });
  });

  it('marks photo as FAILED when the server returns a non-OK response', async () => {
    setOnline(true);

    const photo = {
      localId: 'photo-fail',
      workOrderId: 'wo-1',
      blob: new Blob(['img']),
      mimeType: 'image/jpeg',
      fileName: 'fail.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING' as const,
    };
    vi.mocked(getPendingPhotos).mockResolvedValue([photo]);
    vi.mocked(updatePendingPhotoStatus).mockResolvedValue(undefined);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    } as unknown as Response);

    const result = await uploadPendingPhotos();

    expect(updatePendingPhotoStatus).toHaveBeenCalledWith('photo-fail', 'FAILED', 'Internal Server Error');
    expect(deletePendingPhoto).not.toHaveBeenCalled();
    expect(result).toEqual({ uploadedCount: 0, failedCount: 1 });
  });
});

describe('offlineSyncManager — flushOfflineSyncQueue()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWindow();
    // Reset fetch mock
    globalThis.fetch = vi.fn();
  });

  it('returns { success: false, ... } when offline', async () => {
    setOnline(false);

    const result = await flushOfflineSyncQueue();

    expect(result).toEqual({ success: false, syncedCount: 0, conflictCount: 0, failedCount: 0 });
    expect(getQueuedOutboxMutations).not.toHaveBeenCalled();
  });

  it('returns { success: true, syncedCount: 0, ... } when outbox is empty', async () => {
    setOnline(true);
    vi.mocked(getPendingPhotos).mockResolvedValue([]);
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([]);

    const result = await flushOfflineSyncQueue();

    expect(result).toEqual({ success: true, syncedCount: 0, conflictCount: 0, failedCount: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/sync/batch', expect.anything());
  });

  it('calls /api/sync/batch with the correct payload when outbox has mutations', async () => {
    setOnline(true);
    vi.mocked(getPendingPhotos).mockResolvedValue([]);

    const mutation = {
      idempotencyKey: 'key-1',
      actionType: 'WORK_ORDER_STATUS_SHIFT',
      entityType: 'work_order',
      entityId: 'wo-1',
      payload: { newStatus: 'IN_PROGRESS' },
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([mutation]);

    const { dbMock } = makeMockDb();
    vi.mocked(openIndexedDb).mockResolvedValue(dbMock as unknown as IDBDatabase);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ syncedCount: 1, conflictCount: 0, failedCount: 0, results: [] }),
    } as unknown as Response);

    await flushOfflineSyncQueue();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sync/batch',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              idempotencyKey: mutation.idempotencyKey,
              actionType: mutation.actionType,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              payload: mutation.payload,
            },
          ],
        }),
      })
    );
  });

  it('deletes a mutation from IndexedDB when server returns SYNCED', async () => {
    setOnline(true);
    vi.mocked(getPendingPhotos).mockResolvedValue([]);

    const mutation = {
      idempotencyKey: 'synced-key-1',
      actionType: 'LABOR_LOG',
      entityType: 'labor',
      entityId: 'wo-1',
      payload: {},
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([mutation]);

    const { dbMock, storeMock } = makeMockDb();
    vi.mocked(openIndexedDb).mockResolvedValue(dbMock as unknown as IDBDatabase);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        syncedCount: 1,
        conflictCount: 0,
        failedCount: 0,
        results: [{ idempotencyKey: 'synced-key-1', status: 'SYNCED' }],
      }),
    } as unknown as Response);

    await flushOfflineSyncQueue();

    expect(storeMock.delete).toHaveBeenCalledWith('synced-key-1');
  });

  it('updates mutation status to CONFLICT when server returns CONFLICT', async () => {
    setOnline(true);
    vi.mocked(getPendingPhotos).mockResolvedValue([]);

    const mutation = {
      idempotencyKey: 'conflict-key-1',
      actionType: 'WORK_ORDER_STATUS_SHIFT',
      entityType: 'work_order',
      entityId: 'wo-1',
      payload: { newStatus: 'COMPLETED' },
      timestamp: Date.now(),
      status: 'QUEUED' as const,
    };
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([mutation]);

    const { dbMock, storeMock } = makeMockDb();

    // The get request used inside the CONFLICT branch must return the mutation record
    storeMock.get.mockReturnValue({
      result: mutation,
      set onsuccess(h: ((ev: Event) => void) | null) {
        if (h) Promise.resolve().then(() => h(new Event('success')));
      },
    });

    vi.mocked(openIndexedDb).mockResolvedValue(dbMock as unknown as IDBDatabase);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        syncedCount: 0,
        conflictCount: 1,
        failedCount: 0,
        results: [
          { idempotencyKey: 'conflict-key-1', status: 'CONFLICT', reason: 'WO_STATUS_MISMATCH' },
        ],
      }),
    } as unknown as Response);

    await flushOfflineSyncQueue();

    // put() should be called to update the item with status: 'CONFLICT'
    expect(storeMock.put).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'conflict-key-1',
        status: 'CONFLICT',
      })
    );
  });

  it('calls uploadPendingPhotos() before fetching outbox', async () => {
    setOnline(true);
    // Provide a photo so we can confirm the upload URL is hit first
    const photo = {
      localId: 'photo-order-1',
      workOrderId: 'wo-1',
      blob: new Blob(['img']),
      mimeType: 'image/jpeg',
      fileName: 'order.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING' as const,
    };
    vi.mocked(getPendingPhotos).mockResolvedValue([photo]);
    vi.mocked(updatePendingPhotoStatus).mockResolvedValue(undefined);
    vi.mocked(deletePendingPhoto).mockResolvedValue(undefined);
    vi.mocked(getQueuedOutboxMutations).mockResolvedValue([]);

    const callOrder: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url as string);
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({ syncedCount: 0, conflictCount: 0, failedCount: 0, results: [] }) });
    });

    await flushOfflineSyncQueue();

    // The attachment endpoint must be called (it's the photo upload)
    expect(callOrder.some((u) => u.includes('/attachments'))).toBe(true);
    // The batch endpoint is NOT called because the outbox was empty
    expect(callOrder.every((u) => !u.includes('/api/sync/batch'))).toBe(true);
  });
});
