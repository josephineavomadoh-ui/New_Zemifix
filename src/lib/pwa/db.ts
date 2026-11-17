/**
 * Client-Side IndexedDB Storage Manager for Offline Technician PWA
 */

// ── Existing interfaces (v1) ─────────────────────────────────────────────────

export interface CachedWorkOrder {
  id: string;
  workOrderNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  asset?: any;
  location?: any;
  tasks?: any[];
  checklists?: any[];
  cachedAt: number;
}

export interface QueuedOfflineMutation {
  idempotencyKey: string;
  actionType: string; // WORK_ORDER_STATUS_SHIFT | CHECKLIST_UPDATE | LABOR_LOG | MATERIAL_ISSUE_REQUEST | METER_READING
  entityType: string;
  entityId: string;
  payload: any;
  timestamp: number;
  status: 'QUEUED' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  errorMessage?: string;
}

// ── New interfaces (v2) ──────────────────────────────────────────────────────

export interface CachedWorkOrderDetail {
  id: string;
  workOrderNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  asset?: any;
  location?: any;
  assignedTechnician?: any;
  checklists?: any[];
  laborRecords?: any[];
  parts?: any[];
  statusHistory?: any[];
  meters?: any[];
  cachedAt: number;
}

export interface CachedAsset {
  id: string;
  name: string;
  tag?: string;
  category?: string;
  status?: string;
  location?: any;
  model?: string;
  serialNumber?: string;
  meters?: any[];
  cachedAt: number;
}

export interface PendingPhoto {
  localId: string;
  workOrderId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  capturedAt: number;
  uploadStatus: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
  errorMessage?: string;
  caption?: string;
  evidenceType?: 'BEFORE' | 'AFTER' | 'GENERAL';
}

export interface ConflictRecord {
  idempotencyKey: string;
  conflictType: string;
  actionType: string;
  entityId: string;
  clientState: any;
  reason: string;
  occurredAt: number;
}

// ── DB constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'ZemiFixTechnicianPwaDB';
const DB_VERSION = 2;

// ── Open / upgrade ───────────────────────────────────────────────────────────

export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in current environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // ── Version 1 stores ─────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('cachedWorkOrders')) {
        db.createObjectStore('cachedWorkOrders', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('syncOutbox')) {
        const outbox = db.createObjectStore('syncOutbox', { keyPath: 'idempotencyKey' });
        outbox.createIndex('status', 'status', { unique: false });
        outbox.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // ── Version 2 stores ─────────────────────────────────────────────────
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('cachedWorkOrderDetails')) {
          db.createObjectStore('cachedWorkOrderDetails', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('cachedAssets')) {
          db.createObjectStore('cachedAssets', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('pendingPhotos')) {
          const photosStore = db.createObjectStore('pendingPhotos', { keyPath: 'localId' });
          photosStore.createIndex('workOrderId', 'workOrderId', { unique: false });
          photosStore.createIndex('uploadStatus', 'uploadStatus', { unique: false });
        }

        if (!db.objectStoreNames.contains('conflictQueue')) {
          db.createObjectStore('conflictQueue', { keyPath: 'idempotencyKey' });
        }
      }
    };
  });
}

// ── Existing v1 helpers ──────────────────────────────────────────────────────

export async function cacheWorkOrdersLocally(workOrders: CachedWorkOrder[]): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedWorkOrders', 'readwrite');
  const store = tx.objectStore('cachedWorkOrders');

  for (const wo of workOrders) {
    store.put({ ...wo, cachedAt: Date.now() });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedWorkOrdersLocally(): Promise<CachedWorkOrder[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedWorkOrders', 'readonly');
  const store = tx.objectStore('cachedWorkOrders');
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as CachedWorkOrder[]);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineMutation(mutation: QueuedOfflineMutation): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('syncOutbox', 'readwrite');
  const store = tx.objectStore('syncOutbox');

  store.put(mutation);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedOutboxMutations(): Promise<QueuedOfflineMutation[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('syncOutbox', 'readonly');
  const store = tx.objectStore('syncOutbox');
  const index = store.index('status');
  const request = index.getAll('QUEUED');

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as QueuedOfflineMutation[]);
    request.onerror = () => reject(request.error);
  });
}

export async function clearOfflineCache(): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction(
    ['cachedWorkOrders', 'syncOutbox', 'cachedWorkOrderDetails', 'cachedAssets', 'pendingPhotos', 'conflictQueue'],
    'readwrite'
  );
  tx.objectStore('cachedWorkOrders').clear();
  tx.objectStore('syncOutbox').clear();
  tx.objectStore('cachedWorkOrderDetails').clear();
  tx.objectStore('cachedAssets').clear();
  tx.objectStore('pendingPhotos').clear();
  tx.objectStore('conflictQueue').clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── New v2 helpers ────────────────────────────────────────────────────────────

export async function cacheWorkOrderDetail(detail: CachedWorkOrderDetail): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedWorkOrderDetails', 'readwrite');
  tx.objectStore('cachedWorkOrderDetails').put({ ...detail, cachedAt: Date.now() });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedWorkOrderDetail(id: string): Promise<CachedWorkOrderDetail | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedWorkOrderDetails', 'readonly');
  const request = tx.objectStore('cachedWorkOrderDetails').get(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as CachedWorkOrderDetail) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheAssets(assets: CachedAsset[]): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedAssets', 'readwrite');
  const store = tx.objectStore('cachedAssets');

  for (const asset of assets) {
    store.put({ ...asset, cachedAt: Date.now() });
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAssets(): Promise<CachedAsset[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedAssets', 'readonly');
  const request = tx.objectStore('cachedAssets').getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as CachedAsset[]);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedAssetById(id: string): Promise<CachedAsset | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('cachedAssets', 'readonly');
  const request = tx.objectStore('cachedAssets').get(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as CachedAsset) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingPhoto(photo: PendingPhoto): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('pendingPhotos', 'readwrite');
  tx.objectStore('pendingPhotos').put(photo);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingPhotos(): Promise<PendingPhoto[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('pendingPhotos', 'readonly');
  const request = tx.objectStore('pendingPhotos').getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as PendingPhoto[]);
    request.onerror = () => reject(request.error);
  });
}

export async function updatePendingPhotoStatus(
  localId: string,
  status: PendingPhoto['uploadStatus'],
  errorMessage?: string
): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('pendingPhotos', 'readwrite');
  const store = tx.objectStore('pendingPhotos');
  const getReq = store.get(localId);

  return new Promise((resolve, reject) => {
    getReq.onsuccess = () => {
      const record = getReq.result as PendingPhoto | undefined;
      if (!record) {
        reject(new Error(`PendingPhoto not found: ${localId}`));
        return;
      }
      record.uploadStatus = status;
      if (errorMessage !== undefined) {
        record.errorMessage = errorMessage;
      } else {
        delete record.errorMessage;
      }
      store.put(record);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePendingPhoto(localId: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('pendingPhotos', 'readwrite');
  tx.objectStore('pendingPhotos').delete(localId);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addConflictRecord(conflict: ConflictRecord): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflictQueue', 'readwrite');
  tx.objectStore('conflictQueue').put(conflict);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getConflictRecords(): Promise<ConflictRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflictQueue', 'readonly');
  const request = tx.objectStore('conflictQueue').getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as ConflictRecord[]);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteConflictRecord(idempotencyKey: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('conflictQueue', 'readwrite');
  tx.objectStore('conflictQueue').delete(idempotencyKey);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
