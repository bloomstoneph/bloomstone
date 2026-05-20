// ============================================================
// Bloomstone PMS — Service Worker
// ============================================================
const CACHE_NAME = 'bloomstone-v49';

// Core app files — always fetched fresh from network
const NETWORK_FIRST = [
  'bloomstone-logic.js',
  'index.html',
  './',
  ''
];

const PRECACHE = [
  './icon.svg',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const filename = url.pathname.split('/').pop();

  // Network-first for HTML and JS — always get the latest code
  const isAppFile = event.request.mode === 'navigate'
    || filename === 'bloomstone-logic.js'
    || filename === 'index.html'
    || filename === '';

  if (isAppFile) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(r => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache-first for icons, manifest, fonts (rarely change)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
