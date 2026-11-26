const CACHE_NAME = 'xuongin-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // Pass through everything, we just need a dummy fetch handler for PWA installability
  event.respondWith(fetch(event.request).catch(() => new Response('Offline')));
});
