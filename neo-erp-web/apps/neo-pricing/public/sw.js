self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only intercept http and https protocols to prevent runtime errors with extensions or chrome-extension://
  if (event.request.url.startsWith('http') || event.request.url.startsWith('https')) {
    event.respondWith(fetch(event.request));
  }
});
