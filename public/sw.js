/**
 * InternTrack service worker.
 *
 * Strategy:
 *  - Navigations: network-first, falling back to the cached app shell when offline.
 *  - Static build assets (/assets/*, icons, fonts): cache-first, they are hashed.
 *  - Everything else (Supabase, AI providers): straight to the network, never cached.
 */

const VERSION = 'interntrack-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(cache => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase + AI providers stay live

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('/index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/index.html').then(r => r || Response.error())),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then(c => c.put(request, copy)).catch(() => undefined);
            }
            return res;
          }),
      ),
    );
  }
});

/**
 * Background Sync and Periodic Sync.
 *
 * The automation engine otherwise only runs while a tab is focused. Where the
 * browser supports these events (Chromium today) the worker wakes any open
 * client and asks it to run a pass — the engine itself stays in the page,
 * because that is where the local store and the Supabase session live.
 *
 * Neither event is guaranteed to fire, so this is an addition to the in-tab
 * interval, never a replacement for it.
 */
function wakeClients(reason) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    if (clients.length) {
      clients.forEach(client => client.postMessage({ type: 'run-automations', reason }));
      return;
    }
    // No page is open. There is nothing safe to run here — the store is in
    // localStorage, which a worker cannot read — so the pass waits for the next
    // visit, which the in-tab engine handles immediately on load.
  });
}

self.addEventListener('sync', event => {
  if (event.tag === 'interntrack-automations') event.waitUntil(wakeClients('sync'));
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'interntrack-automations') event.waitUntil(wakeClients('periodicsync'));
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
