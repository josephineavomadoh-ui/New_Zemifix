// @vitest-environment node
/**
 * Unit tests for src/lib/pwa/db.ts
 *
 * Uses a minimal in-memory IndexedDB stub because fake-indexeddb is not
 * installed and jsdom does not ship a real IDBFactory implementation.
 *
 * The stub is attached to `globalThis.window.indexedDB` before importing the
 * db module so that openIndexedDb() finds it at runtime. Each test gets a
 * fresh database (new stub instance) to avoid cross-test pollution.
 */
import { beforeEach, describe, expect, it } from 'vitest';

// ─── Minimal synchronous IDB stub ────────────────────────────────────────────
// Enough surface area for the helpers in db.ts to work: open, put, get, getAll,
// delete, clear, index.getAll, transaction (readwrite / readonly), oncomplete.

type StoreData = Map<IDBValidKey, unknown>;

function createFakeIDB() {
  // Per-db-name in-memory storage
  const dbs: Map<string, { version: number; stores: Map<string, StoreData>; indexes: Map<string, { field: string }> }> = new Map();

  const fakeIDBFactory: IDBFactory = {
    open(name: string, version?: number): IDBOpenDBRequest {
      let dbRecord = dbs.get(name);
      const needsUpgrade = !dbRecord || (version !== undefined && version > dbRecord.version);

      if (!dbRecord) {
        dbRecord = { version: version ?? 1, stores: new Map(), indexes: new Map() };
        dbs.set(name, dbRecord);
      }

      const stores = dbRecord.stores;
      const indexes = dbRecord.indexes;
      let upgradeEvent: IDBVersionChangeEvent | null = null;

      // Build the IDBDatabase facade
      const dbFacade: IDBDatabase = {
        objectStoreNames: {
          contains: (s: string) => stores.has(s),
          item: () => null,
          length: 0,
          [Symbol.iterator]: function* () { yield* stores.keys(); },
        } as unknown as DOMStringList,
        transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
          const names = typeof storeNames === 'string' ? [storeNames] : storeNames;
          const txCallbacks: Array<() => void> = [];

          const getStore = (n: string): StoreData => {
            if (!stores.has(n)) stores.set(n, new Map());
            return stores.get(n)!;
          };

          const makeRequest = <T>(fn: () => T): IDBRequest<T> => {
            let successCb: ((ev: Event) => void) | null = null;
            let errorCb: ((ev: Event) => void) | null = null;
            let result: T;
            try { result = fn(); } catch (err: any) {
              const req = {
                result: undefined as unknown as T,
                error: err,
                set onsuccess(h: ((ev: Event) => void) | null) { successCb = h; },
                get onsuccess() { return successCb; },
                set onerror(h: ((ev: Event) => void) | null) { errorCb = h; },
                get onerror() { return errorCb; },
              } as unknown as IDBRequest<T>;
              // fire error async
              Promise.resolve().then(() => { if (errorCb) errorCb(new Event('error')); });
              return req;
            }
            const req = {
              result,
              error: null,
              set onsuccess(h: ((ev: Event) => void) | null) {
                successCb = h;
                // fire async so callers can set their handlers first
                if (h) Promise.resolve().then(() => h(new Event('success')));
              },
              get onsuccess() { return successCb; },
              set onerror(h: ((ev: Event) => void) | null) { errorCb = h; },
              get onerror() { return errorCb; },
            } as unknown as IDBRequest<T>;
            return req;
          };

          const tx: IDBTransaction = {
            objectStore(n: string): IDBObjectStore {
              const store: IDBObjectStore = {
                put(value: unknown): IDBRequest {
                  return makeRequest(() => {
                    const record = value as Record<string, unknown>;
                    // determine keyPath from known stores
                    const keyPath = indexKeyPaths.get(n) ?? 'id';
                    const key = record[keyPath] as IDBValidKey;
                    getStore(n).set(key, value);
                    return key;
                  });
                },
                get(key: IDBValidKey): IDBRequest {
                  return makeRequest(() => getStore(n).get(key) ?? undefined);
                },
                getAll(): IDBRequest {
                  return makeRequest(() => Array.from(getStore(n).values()));
                },
                delete(key: IDBValidKey): IDBRequest {
                  return makeRequest(() => { getStore(n).delete(key); return undefined; });
                },
                clear(): IDBRequest {
                  return makeRequest(() => { getStore(n).clear(); return undefined; });
                },
                index(indexName: string): IDBIndex {
                  const idx = indexes.get(`${n}::${indexName}`);
                  if (!idx) throw new Error(`No index ${indexName} on ${n}`);
                  const field = idx.field;
                  return {
                    getAll(query?: unknown): IDBRequest {
                      return makeRequest(() => {
                        return Array.from(getStore(n).values()).filter(
                          (v: any) => v[field] === query
                        );
                      });
                    },
                  } as unknown as IDBIndex;
                },
                createIndex(name: string, keyPath: string, _opts?: IDBIndexParameters): IDBIndex {
                  indexes.set(`${n}::${name}`, { field: keyPath });
                  return {} as IDBIndex;
                },
              } as unknown as IDBObjectStore;
              return store;
            },
            set oncomplete(h: ((ev: Event) => void) | null) {
              if (h) txCallbacks.push(() => h(new Event('complete')));
            },
            get oncomplete() { return null; },
            set onerror(h: ((ev: Event) => void) | null) {},
            get onerror() { return null; },
          } as unknown as IDBTransaction;

          // Fire oncomplete after a macro-tick
          Promise.resolve().then(() => txCallbacks.forEach((cb) => cb()));
          return tx;
        },
        createObjectStore(name: string, options?: IDBObjectStoreParameters): IDBObjectStore {
          if (!stores.has(name)) stores.set(name, new Map());
          if (options?.keyPath) indexKeyPaths.set(name, options.keyPath as string);
          return dbFacade.transaction(name, 'readwrite').objectStore(name);
        },
        close() {},
        name,
        version: version ?? 1,
        onversionchange: null,
        onclose: null,
        onerror: null,
        onabort: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as unknown as IDBDatabase;

      // Store keyPath map so put() knows which field is the key
      const indexKeyPaths: Map<string, string> = new Map([
        ['cachedWorkOrders', 'id'],
        ['syncOutbox', 'idempotencyKey'],
        ['cachedWorkOrderDetails', 'id'],
        ['cachedAssets', 'id'],
        ['pendingPhotos', 'localId'],
        ['conflictQueue', 'idempotencyKey'],
      ]);

      let successCb: ((ev: Event) => void) | null = null;
      let upgradeCb: ((ev: IDBVersionChangeEvent) => void) | null = null;

      const openReq: IDBOpenDBRequest = {
        result: dbFacade,
        error: null,
        set onsuccess(h: ((ev: Event) => void) | null) { successCb = h; },
        get onsuccess() { return successCb; },
        set onerror(h: ((ev: Event) => void) | null) {},
        get onerror() { return null; },
        set onupgradeneeded(h: ((ev: IDBVersionChangeEvent) => void) | null) {
          upgradeCb = h;
        },
        get onupgradeneeded() { return upgradeCb; },
        onblocked: null,
        readyState: 'done',
        source: null,
        transaction: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as unknown as IDBOpenDBRequest;

      Promise.resolve().then(() => {
        if (needsUpgrade && upgradeCb) {
          const upgradeEvt = {
            oldVersion: 0,
            newVersion: version ?? 1,
            target: openReq,
          } as unknown as IDBVersionChangeEvent;
          upgradeCb(upgradeEvt);
        }
        // After upgrade, fire oncomplete of the upgrade transaction (already queued)
        // Then fire onsuccess on the open request
        Promise.resolve().then(() => {
          if (successCb) successCb(new Event('success'));
        });
      });

      return openReq;
    },
    deleteDatabase(): IDBOpenDBRequest { return {} as IDBOpenDBRequest; },
    cmp(): number { return 0; },
    databases(): Promise<IDBDatabaseInfo[]> { return Promise.resolve([]); },
  };

  return fakeIDBFactory;
}

// ─── Inject fake IDB before importing db module ───────────────────────────────
// We need a fresh db per describe block; because vitest re-uses the same module
// we patch window.indexedDB before each test.

function patchIndexedDB() {
  const fake = createFakeIDB();
  if (typeof globalThis.window === 'undefined') {
    // @ts-ignore
    globalThis.window = { indexedDB: fake };
  } else {
    // @ts-ignore
    globalThis.window.indexedDB = fake;
  }
}

// ─── Now import the module under test ────────────────────────────────────────
import {
  openIndexedDb,
  cacheWorkOrdersLocally,
  getCachedWorkOrdersLocally,
  enqueueOfflineMutation,
  getQueuedOutboxMutations,
  cacheWorkOrderDetail,
  getCachedWorkOrderDetail,
  addPendingPhoto,
  getPendingPhotos,
  updatePendingPhotoStatus,
  deletePendingPhoto,
  addConflictRecord,
  getConflictRecords,
  deleteConflictRecord,
  clearOfflineCache,
  type CachedWorkOrder,
  type QueuedOfflineMutation,
  type CachedWorkOrderDetail,
  type PendingPhoto,
  type ConflictRecord,
} from '../../lib/pwa/db';

describe('IndexedDB helpers (db.ts)', () => {
  beforeEach(() => {
    // Fresh in-memory database before each test
    patchIndexedDB();
  });

  it('openIndexedDb() returns a database instance', async () => {
    const db = await openIndexedDb();
    expect(db).toBeDefined();
    expect(typeof db.transaction).toBe('function');
  });

  it('cacheWorkOrdersLocally() stores items and getCachedWorkOrdersLocally() retrieves them', async () => {
    const workOrders: CachedWorkOrder[] = [
      {
        id: 'wo-1',
        workOrderNumber: 'WO-2026-001',
        title: 'Fix pump',
        description: 'Pump failure',
        status: 'OPEN',
        priority: 'HIGH',
        type: 'CORRECTIVE',
        cachedAt: Date.now(),
      },
      {
        id: 'wo-2',
        workOrderNumber: 'WO-2026-002',
        title: 'Inspect belt',
        description: 'Scheduled inspection',
        status: 'ASSIGNED',
        priority: 'NORMAL',
        type: 'PM',
        cachedAt: Date.now(),
      },
    ];

    await cacheWorkOrdersLocally(workOrders);
    const retrieved = await getCachedWorkOrdersLocally();

    expect(retrieved).toHaveLength(2);
    const ids = retrieved.map((r) => r.id);
    expect(ids).toContain('wo-1');
    expect(ids).toContain('wo-2');
  });

  it('enqueueOfflineMutation() stores a mutation and getQueuedOutboxMutations() returns only QUEUED items', async () => {
    const queued: QueuedOfflineMutation = {
      idempotencyKey: 'key-queued-1',
      actionType: 'WORK_ORDER_STATUS_SHIFT',
      entityType: 'work_order',
      entityId: 'wo-1',
      payload: { newStatus: 'IN_PROGRESS' },
      timestamp: Date.now(),
      status: 'QUEUED',
    };
    const synced: QueuedOfflineMutation = {
      idempotencyKey: 'key-synced-1',
      actionType: 'LABOR_LOG',
      entityType: 'labor',
      entityId: 'wo-1',
      payload: { hoursWorked: 2 },
      timestamp: Date.now(),
      status: 'SYNCED',
    };

    await enqueueOfflineMutation(queued);
    await enqueueOfflineMutation(synced);

    const results = await getQueuedOutboxMutations();

    // Only QUEUED items should come back
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.status === 'QUEUED')).toBe(true);
    expect(results.some((r) => r.idempotencyKey === 'key-queued-1')).toBe(true);
    expect(results.some((r) => r.idempotencyKey === 'key-synced-1')).toBe(false);
  });

  it('cacheWorkOrderDetail() stores and getCachedWorkOrderDetail(id) retrieves the correct record', async () => {
    const detail: CachedWorkOrderDetail = {
      id: 'wo-detail-1',
      workOrderNumber: 'WO-2026-003',
      title: 'Generator PM',
      description: 'Quarterly PM',
      status: 'OPEN',
      priority: 'NORMAL',
      type: 'PM',
      cachedAt: Date.now(),
    };

    await cacheWorkOrderDetail(detail);

    const fetched = await getCachedWorkOrderDetail('wo-detail-1');
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe('wo-detail-1');
    expect(fetched!.workOrderNumber).toBe('WO-2026-003');

    const missing = await getCachedWorkOrderDetail('nonexistent');
    expect(missing).toBeNull();
  });

  it('addPendingPhoto() stores a photo and getPendingPhotos() retrieves it', async () => {
    const photo: PendingPhoto = {
      localId: 'photo-local-1',
      workOrderId: 'wo-1',
      blob: new Blob(['fake-image-data'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'repair.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING',
    };

    await addPendingPhoto(photo);

    const photos = await getPendingPhotos();
    expect(photos.length).toBeGreaterThanOrEqual(1);
    const found = photos.find((p) => p.localId === 'photo-local-1');
    expect(found).toBeDefined();
    expect(found!.fileName).toBe('repair.jpg');
    expect(found!.uploadStatus).toBe('PENDING');
  });

  it('updatePendingPhotoStatus() changes uploadStatus', async () => {
    const photo: PendingPhoto = {
      localId: 'photo-local-2',
      workOrderId: 'wo-1',
      blob: new Blob(['img'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'before.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING',
    };

    await addPendingPhoto(photo);
    await updatePendingPhotoStatus('photo-local-2', 'UPLOADED');

    const photos = await getPendingPhotos();
    const updated = photos.find((p) => p.localId === 'photo-local-2');
    expect(updated).toBeDefined();
    expect(updated!.uploadStatus).toBe('UPLOADED');
  });

  it('deletePendingPhoto() removes the record', async () => {
    const photo: PendingPhoto = {
      localId: 'photo-local-3',
      workOrderId: 'wo-1',
      blob: new Blob(['img'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      fileName: 'delete-me.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING',
    };

    await addPendingPhoto(photo);
    await deletePendingPhoto('photo-local-3');

    const photos = await getPendingPhotos();
    expect(photos.some((p) => p.localId === 'photo-local-3')).toBe(false);
  });

  it('addConflictRecord(), getConflictRecords(), and deleteConflictRecord() work correctly', async () => {
    const conflict: ConflictRecord = {
      idempotencyKey: 'conflict-key-1',
      conflictType: 'WO_CANCELLED',
      actionType: 'WORK_ORDER_STATUS_SHIFT',
      entityId: 'wo-1',
      clientState: { newStatus: 'IN_PROGRESS' },
      reason: 'Work order was cancelled on the server',
      occurredAt: Date.now(),
    };

    await addConflictRecord(conflict);

    const records = await getConflictRecords();
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records.some((r) => r.idempotencyKey === 'conflict-key-1')).toBe(true);

    await deleteConflictRecord('conflict-key-1');
    const afterDelete = await getConflictRecords();
    expect(afterDelete.some((r) => r.idempotencyKey === 'conflict-key-1')).toBe(false);
  });

  it('clearOfflineCache() empties all stores', async () => {
    // Populate several stores
    await cacheWorkOrdersLocally([
      { id: 'wo-clear-1', workOrderNumber: 'WO-X', title: 'T', description: 'D', status: 'OPEN', priority: 'LOW', type: 'CORRECTIVE', cachedAt: Date.now() },
    ]);
    await enqueueOfflineMutation({
      idempotencyKey: 'clear-key-1',
      actionType: 'LABOR_LOG',
      entityType: 'labor',
      entityId: 'wo-1',
      payload: {},
      timestamp: Date.now(),
      status: 'QUEUED',
    });
    await addPendingPhoto({
      localId: 'clear-photo-1',
      workOrderId: 'wo-1',
      blob: new Blob(['x']),
      mimeType: 'image/jpeg',
      fileName: 'x.jpg',
      capturedAt: Date.now(),
      uploadStatus: 'PENDING',
    });

    await clearOfflineCache();

    const wos = await getCachedWorkOrdersLocally();
    const mutations = await getQueuedOutboxMutations();
    const photos = await getPendingPhotos();
    const conflicts = await getConflictRecords();

    expect(wos).toHaveLength(0);
    expect(mutations).toHaveLength(0);
    expect(photos).toHaveLength(0);
    expect(conflicts).toHaveLength(0);
  });
});
