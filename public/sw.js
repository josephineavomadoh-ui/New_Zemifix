// ZemiFix CMMS Technician PWA Service Worker (v2.0)
const CACHE_NAME = 'zemifix-pwa-shell-v2';

const APP_SHELL_ROUTES = [
  '/pwa',
  '/pwa/jobs',
  '/pwa/assets',
  '/pwa/sync',
  '/pwa/profile',
  '/manifest.json',
];

// ── Install: precache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ROUTES))
  );
  // Do NOT call self.skipWaiting() unconditionally; wait for a SKIP_WAITING
  // message so the caller can decide when to activate the new worker.
});

// ── Activate: clean up stale caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Message: allow the app to trigger skipWaiting ────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Background Sync: handle W3C sync events ───────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'zemifix-pwa-sync' || event.tag === 'sync-outbox') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
        }
      })
    );
  }
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API routes — network only, no caching.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Next.js static chunks — stale-while-revalidate.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 3. Everything else (app shell routes, etc.) — stale-while-revalidate
  //    with an offline fallback for navigation requests.
  event.respondWith(
    staleWhileRevalidate(event.request).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/pwa');
      }
    })
  );
});

// ── Helper: stale-while-revalidate ──────────────────────────────────────────
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      // Return cached copy immediately; fall through to network if nothing cached.
      return cachedResponse || networkFetch;
    });
  });
}
