// Offline support for the installed app. The production build replaces the asset slot with every
// file in the bundle, so a later visit with no network still boots. Navigation falls back to the
// shell. A script or image is never answered with that HTML: doing so left the page stuck on
// "Gerando o mundo…" because the module failed to parse.
const CACHE = 'dead-sector-v2';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  /*__DS_ASSETS__*/
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put('./index.html', copy).catch(() => undefined));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || caches.match('./') || Response.error()),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => undefined));
        }
        return res;
      });
    }),
  );
});
