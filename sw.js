// Offline support for the installed app. The production build replaces the asset slot with every
// file in the bundle, so a later visit with no network still boots. Navigation falls back to the
// shell. A script or image is never answered with that HTML: doing so left the page stuck on
// "Gerando o mundo…" because the module failed to parse.
const CACHE = 'dead-sector-2414f12977';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  "./.nojekyll",
  "./assets/index-CNxsT3OJ.js",
  "./assets/index-cwR9Xcc8.css",
  "./fx/beacon_pulse.png",
  "./fx/bite.png",
  "./fx/blood_hit.png",
  "./fx/convoy.png",
  "./fx/day_turn.png",
  "./fx/door_splinters.png",
  "./fx/dust_puff.png",
  "./fx/glass_shatter.png",
  "./fx/horde_alert.png",
  "./fx/ichor_hit.png",
  "./fx/impact_sparks.png",
  "./fx/infected_death.png",
  "./fx/manifest.json",
  "./fx/muzzle_flash.png",
  "./fx/objective_done.png",
  "./fx/panic_pulse.png",
  "./fx/plank_splinters.png",
  "./fx/rescue_done.png",
  "./fx/scream_burst.png",
  "./fx/sector_lost.png",
  "./fx/wreck_fire.png",
  "./fx/wreck_smoke.png",
  "./sprites/manifest.json",
  "./sprites/sv-alfa-civilian.png",
  "./sprites/sv-alfa-leader.png",
  "./sprites/sv-alfa-marksman.png",
  "./sprites/sv-alfa-medic.png",
  "./sprites/sv-bravo-leader.png",
  "./sprites/sv-bravo-mechanic.png",
  "./sprites/sv-bravo-scout.png",
  "./sprites/sv-bravo-volunteer.png",
  "./sprites/sv-civilian.png",
  "./sprites/sv-recruit.png",
  "./sprites/zb-crawler-0.png",
  "./sprites/zb-crawler-1.png",
  "./sprites/zb-heavy.png",
  "./sprites/zb-runner.png",
  "./sprites/zb-screamer.png",
  "./sprites/zb-walker-0.png",
  "./sprites/zb-walker-1.png",
  "./sprites/zb-walker-2.png",
  "./sprites/zb-walker-3.png",
  "./sprites/zb-walker-4.png",
  "./sprites/zb-walker-5.png",
  "./sprites/zb-walker-6.png",
  "./sprites/zb-walker-7.png"
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
