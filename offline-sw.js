// SanjivramOS offline install: keeps a copy of the desktop (and the built-in sj-* games) in this
// browser's cache so it still opens with no connection to the SanjivramOS server.
// Only files that are safe to keep are cached; terminals, files, the Web Browser and other live
// server features are always passed straight through to the network.
const CACHE = 'sjos-offline-v1';
const scope = new URL(self.registration.scope);
const rel = url => url.pathname.slice(scope.pathname.length); // path inside SanjivramOS, no leading slash

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('sjos-offline-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const isShell = p => p === '' || p === 'index.html';
const isStatic = p => p === 'manifest.webmanifest' || p === 'build/icon.png' || p.startsWith('vendor/') || /^games\/sj-[\w.-]+\/(index\.html)?$/.test(p);

async function put(key, res) {
  if (!res || res.status !== 200 || res.type === 'opaqueredirect') return;
  try { const c = await caches.open(CACHE); await c.put(key, res); } catch {}
}
// Desktop page: try the network first (so updates arrive), fall back to the saved copy.
async function shell(req) {
  const key = new URL('index.html', scope).href;
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
    if (res.ok) put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw err;
  }
}
// Libraries, icon and built-in games: answer from the cache at once and refresh it in the background.
async function stale(req, event) {
  const key = req.url.split('#')[0].split('?')[0];
  const hit = await caches.match(key);
  const net = fetch(req).then(res => { put(key, res.clone()); return res; });
  if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
  return net;
}
// Server info: when offline, say so and switch off the features that need the server,
// but keep the list of games so the cached ones still open.
async function serverInfo(req) {
  const key = new URL('sanjivram-server.json', scope).href;
  try {
    const res = await fetch(req);
    if (res.ok) put(key, res.clone());
    return res;
  } catch {
    const hit = await caches.match(key);
    let j = {};
    try { j = hit ? await hit.json() : {}; } catch {}
    const cached = await caches.open(CACHE).then(c => c.keys()).then(ks => ks.map(r => (/\/games\/(sj-[\w.-]+)\//.exec(r.url) || [])[1]).filter(Boolean)).catch(() => []);
    const body = { app: 'SanjivramOS', offline: true, shell: false, claude: false, slander: false, vip: false, files: false, desktop: false, linuxApps: false, android: false, games: (j.games || []).filter(g => cached.includes(g)) };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const p = rel(url);
  if (isShell(p) && (req.mode === 'navigate' || req.destination === 'document')) return event.respondWith(shell(req));
  if (p === 'sanjivram-server.json') return event.respondWith(serverInfo(req));
  if (isStatic(p)) return event.respondWith(stale(req, event));
  // everything else (APIs, live server features, other games) goes to the network untouched
});

// The page asks for these to fill or empty the cache.
self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'clear') event.waitUntil(caches.delete(CACHE).then(() => event.source && event.source.postMessage({ type: 'cleared' })));
});
