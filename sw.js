// SanjivramOS service worker: routes proxied pages (under ./scramjet/) through Scramjet.
// Requests to other websites are left alone, so the rest of SanjivramOS behaves exactly as without it.
importScripts('proxy/scram/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function handleRequest(event) {
  await scramjet.loadConfig();
  if (scramjet.route(event)) return scramjet.fetch(event);
  return fetch(event.request);
}
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(handleRequest(event));
});
