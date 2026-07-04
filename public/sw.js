const CACHE = 'awssbg-v1';
const STATIC = ['/manifest.json', '/logo.png', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Only cache same-origin requests, and never API responses — those carry
  // per-session, per-user data (PII, auth state) that must not persist in a
  // shared cache across logins on the same device.
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Let a logging-out client purge everything this SW has cached for the
// session that just ended, so the next login on a shared device doesn't
// inherit stale cached pages.
self.addEventListener('message', e => {
  if (e.data === 'CLEAR_CACHE') {
    e.waitUntil(caches.delete(CACHE));
  }
});
