self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  // Only intercept http/https protocols
  if (!url.startsWith('http') && !url.startsWith('https')) return;

  // Do not intercept API requests (let them go through normal browser stack)
  if (url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request).catch((error) => {
      console.warn('Service Worker fetch failed for:', url, error);
      // Return a fallback or a default error response that doesn't crash the browser tab
      return new Response('Network error occurred', {
        status: 480,
        statusText: 'Service Worker Fetch Failed'
      });
    })
  );
});
