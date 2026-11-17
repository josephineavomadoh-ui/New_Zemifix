// @vitest-environment node
/**
 * Unit tests for Technician PWA Photo Attachment Synchronization (Phase 3)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateUuidV7 } from '../../lib/uuid';

// Mock IndexedDB and Offline Manager
vi.mock('../../lib/pwa/db', () => ({
  addPendingPhoto: vi.fn(),
  getPendingPhotos: vi.fn(),
  updatePendingPhotoStatus: vi.fn(),
  deletePendingPhoto: vi.fn(),
  openIndexedDb: vi.fn(),
}));

import {
  addPendingPhoto,
  getPendingPhotos,
  updatePendingPhotoStatus,
  deletePendingPhoto,
} from '../../lib/pwa/db';
import { uploadPendingPhotos } from '../../lib/pwa/offlineSyncManager';

/** Stub `window` so the `typeof window === 'undefined'` check passes in Node. */
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

describe('Technician PWA Photo Attachment Offline Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWindow();
    setOnline(true);
  });

  it('1. Stores pending photo with evidence type and caption in IndexedDB', async () => {
    const localId = generateUuidV7();
    const workOrderId = 'wo-test-uuid-999';

    const photoRecord = {
      localId,
      workOrderId,
      blob: new Blob(['fake-image-bytes'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'pump_repair_before.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING' as const,
      caption: 'Cracked casing seal before repair',
      evidenceType: 'BEFORE' as const,
    };

    vi.mocked(addPendingPhoto).mockResolvedValue(undefined);

    await addPendingPhoto(photoRecord);

    expect(addPendingPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        localId,
        workOrderId,
        caption: 'Cracked casing seal before repair',
        evidenceType: 'BEFORE',
        uploadStatus: 'PENDING',
      })
    );
  });

  it('2. Retries failed photo uploads and attaches caption and evidence type to FormData', async () => {
    const mockPhotos = [
      {
        localId: 'photo-local-001',
        workOrderId: 'wo-101',
        blob: new Blob(['fake-image-bytes'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
        fileName: 'motor_after.jpg',
        capturedAt: Date.now(),
        uploadStatus: 'FAILED' as const,
        caption: 'New motor installed and aligned',
        evidenceType: 'AFTER' as const,
      },
    ];

    vi.mocked(getPendingPhotos).mockResolvedValue(mockPhotos as any);
    vi.mocked(updatePendingPhotoStatus).mockResolvedValue(undefined);
    vi.mocked(deletePendingPhoto).mockResolvedValue(undefined);

    // Mock global fetch to return 201 Created
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ attachment: { id: 'att-server-001' } }),
    } as Response);

    const result = await uploadPendingPhotos();

    expect(result.uploadedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(updatePendingPhotoStatus).toHaveBeenCalledWith('photo-local-001', 'UPLOADING');
    expect(deletePendingPhoto).toHaveBeenCalledWith('photo-local-001');

    // Restore fetch
    globalThis.fetch = originalFetch;
  });
});
