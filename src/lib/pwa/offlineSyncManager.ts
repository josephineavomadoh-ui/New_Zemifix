import {
  deletePendingPhoto,
  getPendingPhotos,
  getQueuedOutboxMutations,
  openIndexedDb,
  QueuedOfflineMutation,
  updatePendingPhotoStatus,
} from './db';

let isSyncing = false;

/**
 * Registers W3C Background Sync with the Service Worker if supported by the browser.
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      // @ts-ignore
      await registration.sync.register('zemifix-pwa-sync');
      return true;
    }
  } catch (err) {
    console.warn('[PWA] W3C Background Sync registration unavailable/failed:', err);
  }
  return false;
}

/**
 * Uploads all PENDING and FAILED photos from the local IndexedDB pendingPhotos store to
 * the server attachment endpoint, updating each record's status as it goes.
 */
export async function uploadPendingPhotos(): Promise<{
  uploadedCount: number;
  failedCount: number;
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { uploadedCount: 0, failedCount: 0 };
  }

  const allPhotos = await getPendingPhotos();
  const pending = allPhotos.filter((p) => p.uploadStatus === 'PENDING' || p.uploadStatus === 'FAILED');

  let uploadedCount = 0;
  let failedCount = 0;

  for (const photo of pending) {
    await updatePendingPhotoStatus(photo.localId, 'UPLOADING');

    let res: Response | undefined;
    try {
      const formData = new FormData();
      formData.append('file', photo.blob, photo.fileName);
      if (photo.caption) formData.append('caption', photo.caption);
      if (photo.evidenceType) formData.append('evidenceType', photo.evidenceType);

      res = await fetch(`/api/work-orders/${photo.workOrderId}/attachments`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await deletePendingPhoto(photo.localId);
        uploadedCount++;
      } else {
        const errorText = await res.text();
        await updatePendingPhotoStatus(photo.localId, 'FAILED', errorText);
        failedCount++;
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      await updatePendingPhotoStatus(photo.localId, 'FAILED', errorText);
      failedCount++;
    }
  }

  return { uploadedCount, failedCount };
}

/**
 * Internal worker function for flushing IndexedDB sync outbox queue to server batch API.
 */
async function internalFlushOfflineSyncQueue(): Promise<{
  success: boolean;
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
}> {
  if (isSyncing) {
    console.warn('[PWA] Sync flush skipped: in-memory sync process currently running.');
    return { success: false, syncedCount: 0, conflictCount: 0, failedCount: 0 };
  }

  isSyncing = true;

  try {
    await uploadPendingPhotos();

    const queuedMutations = await getQueuedOutboxMutations();
    if (queuedMutations.length === 0) {
      return { success: true, syncedCount: 0, conflictCount: 0, failedCount: 0 };
    }

    // Preserve strict chronological mutation order
    queuedMutations.sort((a, b) => a.timestamp - b.timestamp);

    const payload = {
      mutations: queuedMutations.map((m) => ({
        idempotencyKey: m.idempotencyKey,
        actionType: m.actionType,
        entityType: m.entityType,
        entityId: m.entityId,
        payload: m.payload,
      })),
    };

    const res = await fetch('/api/sync/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sync batch');

    // Update local IndexedDB outbox items based on server results
    const db = await openIndexedDb();
    const tx = db.transaction('syncOutbox', 'readwrite');
    const store = tx.objectStore('syncOutbox');

    for (const resultItem of data.results ?? []) {
      const itemKey = resultItem.idempotencyKey;
      if (resultItem.status === 'SYNCED') {
        store.delete(itemKey); // Remove synced item from client outbox
      } else if (resultItem.status === 'CONFLICT') {
        const getReq = store.get(itemKey);
        getReq.onsuccess = () => {
          if (getReq.result) {
            store.put({
              ...getReq.result,
              status: 'CONFLICT',
              errorMessage: resultItem.reason ?? 'Conflict detected',
            });
          }
        };
      }
    }

    return {
      success: true,
      syncedCount: data.syncedCount ?? 0,
      conflictCount: data.conflictCount ?? 0,
      failedCount: data.failedCount ?? 0,
    };
  } catch (err) {
    console.error('Offline sync flush failed:', err);
    return { success: false, syncedCount: 0, conflictCount: 0, failedCount: 0 };
  } finally {
    isSyncing = false;
  }
}

/**
 * Flushes client-side IndexedDB sync outbox queue to server batch API.
 * Uses Web Locks API (`navigator.locks`) when available for cross-tab concurrency prevention.
 */
export async function flushOfflineSyncQueue(): Promise<{
  success: boolean;
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
}> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { success: false, syncedCount: 0, conflictCount: 0, failedCount: 0 };
  }

  // Cross-Tab / Cross-Worker Lock (Web Locks API)
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    let result = { success: false, syncedCount: 0, conflictCount: 0, failedCount: 0 };
    await navigator.locks.request('zemifix-sync-lock', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        console.warn('[PWA] Cross-tab sync skipped: another tab or worker holds zemifix-sync-lock.');
        return;
      }
      result = await internalFlushOfflineSyncQueue();
    });
    return result;
  }

  return await internalFlushOfflineSyncQueue();
}

// Attach Service Worker message listener in browser environment
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_BACKGROUND_SYNC') {
      flushOfflineSyncQueue().catch((err) =>
        console.error('[PWA] Background Sync trigger flush error:', err)
      );
    }
  });
}
