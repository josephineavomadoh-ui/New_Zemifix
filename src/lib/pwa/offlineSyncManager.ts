import {
  deletePendingPhoto,
  getPendingPhotos,
  getQueuedOutboxMutations,
  openIndexedDb,
  QueuedOfflineMutation,
  updatePendingPhotoStatus,
} from './db';

/**
 * Uploads all PENDING photos from the local IndexedDB pendingPhotos store to
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
  const pending = allPhotos.filter((p) => p.uploadStatus === 'PENDING');

  let uploadedCount = 0;
  let failedCount = 0;

  for (const photo of pending) {
    await updatePendingPhotoStatus(photo.localId, 'UPLOADING');

    let res: Response | undefined;
    try {
      const formData = new FormData();
      formData.append('file', photo.blob, photo.fileName);

      res = await fetch(`/api/work-orders/${photo.workOrderId}/attachments`, {
        method: 'POST',
        body: formData,
        // No Content-Type header — browser sets it with the multipart boundary
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
 * Flushes client-side IndexedDB sync outbox queue to server batch API
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

  await uploadPendingPhotos();

  try {
    const queuedMutations = await getQueuedOutboxMutations();
    if (queuedMutations.length === 0) {
      return { success: true, syncedCount: 0, conflictCount: 0, failedCount: 0 };
    }

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
  }
}
