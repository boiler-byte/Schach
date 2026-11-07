/* Schach PWA – ausschließlich die lokalen App-Dateien für Offlinebetrieb speichern. */
const CACHE_NAME = 'schach-pwa-v1';
const CACHE_PREFIX = 'schach-pwa-';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './chess-engine.js',
  './cpu-easy.js',
  './cpu-medium.js',
  './cpu-hard.js',
  './game.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // Nur die vollständig vorab gespeicherten Spiel-Dateien aus dem Cache liefern.
  // Navigationsaufrufe funktionieren dadurch auch ohne Netzwerkverbindung.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return fetch(request);
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
