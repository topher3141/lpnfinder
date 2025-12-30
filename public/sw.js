// Minimal service worker so Chrome treats the site as installable.
// (No caching logic yet — safe + simple.)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
