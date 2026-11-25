const VERSION = '0.12.3';
const BUILD = '__BUILD__';
const CACHE = `liftlog-${VERSION}-${BUILD}`;
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/main.js', 'js/active.js', 'js/theme.js', 'js/howto.js', 'js/rest.js', 'js/logic/workout.js', 'js/logic/stats.js', 'js/views/workout.js', 'js/views/extras.js', 'js/views/musclemap.js', 'js/views/carousel.js', 'js/version.js', 'js/db.js', 'js/photos.js', 'js/views/photos.js', 'js/alternatives.js', 'js/migrate.js', 'js/seed.js', 'js/ui.js', 'js/icons.js',
  'js/logic/progression.js', 'js/logic/timer.js', 'js/logic/substitution.js', 'js/logic/carryover.js', 'js/logic/csv.js',
  'js/views/train.js', 'js/views/history.js', 'js/views/library.js', 'js/views/picker.js', 'js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('liftlog-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'GET_VERSION') e.source?.postMessage({ type: 'VERSION', version: VERSION, build: BUILD, cache: CACHE });
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
