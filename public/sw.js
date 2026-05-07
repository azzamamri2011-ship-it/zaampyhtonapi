const CACHE_NAME = 'zaam-music-v2';
const assets = [
  './',
  './index.html',
  './script.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // Memaksa SW baru langsung aktif
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request);
    })
  );
});
