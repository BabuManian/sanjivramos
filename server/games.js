// Game sites downloaded by termux/game.sh into ~/games/<name>, served by this server at /games/<name>/.
// Some sites link to absolute paths (/images/...) as if they owned the whole website; requests like that coming
// from a game page are redirected into that game's folder, so its pages keep working under /games/<name>/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.resolve(process.env.GAMES_DIR || path.join(os.homedir(), 'games'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jsonc': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.swf': 'application/x-shockwave-flash'
};

/** Names of the downloaded games. */
export const installedGames = () => {
  try { return fs.readdirSync(DIR).filter(n => /^[\w.-]+$/.test(n) && !n.startsWith('.') && !n.endsWith('.part') && fs.statSync(path.join(DIR, n)).isDirectory()); }
  catch { return []; }
};

/** For a request SanjivramOS itself doesn't serve: if a game page asked for it, the same path inside that game. */
export function gameRedirect(req, url) {
  let ref;
  try { ref = new URL(req.headers.referer); } catch { return null; }
  if (ref.host !== req.headers.host) return null;
  const m = /^\/games\/([\w.-]+)\//.exec(ref.pathname);
  return m && installedGames().includes(m[1]) ? `/games/${m[1]}${url.pathname}${url.search}` : null;
}

/** Serves /games/<name>/...; returns false for other paths. */
export function serveGame(req, res, url) {
  const m = /^\/games\/([\w.-]+)(\/.*)?$/.exec(url.pathname);
  if (!m) return false;
  if (!m[2]) { res.writeHead(301, { location: `/games/${m[1]}/` }); res.end(); return true; }
  let rel;
  try { rel = decodeURIComponent(m[2]); } catch { res.writeHead(400); res.end(); return true; }
  const root = path.join(DIR, m[1]);
  let file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return true; }
  if (/(^|\/)\.git(\/|$)/.test(rel)) { res.writeHead(404); res.end(); return true; }
  let st;
  try {
    st = fs.statSync(file);
    if (st.isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); res.end(); return true; }
      file = path.join(file, 'index.html'); st = fs.statSync(file);
    }
  } catch { st = null; }
  if (!st || !st.isFile()) {
    const nf = path.join(root, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    if (fs.existsSync(nf)) fs.createReadStream(nf).pipe(res); else res.end('Not found');
    return true;
  }
  const headers = { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r && (r[1] || r[2])) {
    const start = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), end = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return true; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

/* ===================== Download API for a game site (used by Seraph's "Download" button) =====================
   GET /games-api/<site>/list            → the site's games and apps (name, thumbnail, size) and its shared files
   GET /games-api/<site>/files?…         → every file path for a selection (to save into browser storage)
   GET /games-api/<site>/zip?…           → a .zip (or .tar without zip) of a selection, streamed
   Selection: items=<id>,<id>… (ids like "games/slope") and/or kind=games|apps|all; core=1 adds the shared site files. */
import { spawn, execFileSync } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const SKIP = new Set(['.git', 'node_modules']);
const fsp = fs.promises;
/** Walks a folder without blocking the server (a game site can be many GB and hundreds of thousands of files). */
async function walk(dir, cb, rel = '') {
  let list; try { list = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const d of list) {
    if (SKIP.has(d.name)) continue;
    const p = path.join(dir, d.name), r = rel ? rel + '/' + d.name : d.name;
    if (d.isDirectory()) await walk(p, cb, r);
    else if (d.isFile()) { try { cb(r, (await fsp.stat(p)).size); } catch {} }
  }
}
const catalogs = new Map(), building = new Map();
/** The site's games/apps list with sizes. Built in the background once, then cached for 30 minutes. */
function catalog(site) {
  const hit = catalogs.get(site);
  if (hit && Date.now() - hit.at < 30 * 60000) return Promise.resolve(hit.data);
  if (!building.has(site)) building.set(site, buildInWorker(site).then(data => { catalogs.set(site, { at: Date.now(), data }); return data; }).finally(() => building.delete(site)));
  // A stale list is still fine to show while a fresh one is built.
  return hit ? Promise.resolve(hit.data) : building.get(site);
}
/** Counting the sizes of thousands of files keeps the disk busy for a while, so it runs in a worker thread:
 *  the server keeps answering everything else meanwhile. */
function buildInWorker(site) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { site } });
    w.once('message', m => (m.error ? reject(new Error(m.error)) : resolve(m.data)));
    w.once('error', reject);
    w.once('exit', code => { if (code) reject(new Error('catalog worker exited ' + code)); });
  });
}
if (!isMainThread && workerData && workerData.site) {
  buildCatalog(workerData.site).then(data => parentPort.postMessage({ data }), err => parentPort.postMessage({ error: err.message }));
}
async function buildCatalog(site) {
  const root = path.join(DIR, site);
  const items = new Map();
  for (const [kind, folder] of [['game', 'games'], ['app', 'apps']]) {
    let html = ''; try { html = await fsp.readFile(path.join(root, folder, 'index.html'), 'utf8'); } catch {}
    for (const m of html.matchAll(/<a\b[^>]*href="([^"#?:]+?)\/index\.html"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const sub = path.posix.normalize(m[1]).replace(/^\.\//, '');
      if (sub.startsWith('..') || !fs.existsSync(path.join(root, folder, sub))) continue;
      const id = `${folder}/${sub}`;
      if (items.has(id)) continue;
      const name = ((/<h2>([^<]*)<\/h2>/i.exec(m[2]) || [])[1] || sub).trim();
      const thumb = (/url\(['"]?([^'")]+)['"]?\)/i.exec(m[2]) || [])[1] || '';
      items.set(id, { id, kind, name, thumb: thumb ? path.posix.normalize(path.posix.join(folder, thumb)) : '' });
    }
    try {
      for (const d of await fsp.readdir(path.join(root, folder), { withFileTypes: true })) {
        if (!d.isDirectory() || SKIP.has(d.name)) continue;
        const id = `${folder}/${d.name}`;
        if (![...items.keys()].some(k => k === id || k.startsWith(id + '/'))) items.set(id, { id, kind, name: d.name, thumb: '' });
      }
    } catch {}
  }
  for (const it of items.values()) { let size = 0, files = 0; await walk(path.join(root, it.id), (r, s) => { size += s; files++; }); it.size = size; it.files = files; }
  let coreSize = 0, coreFiles = 0;
  const core = [];
  try { for (const d of await fsp.readdir(root, { withFileTypes: true })) if (!SKIP.has(d.name) && !d.name.startsWith('.') && !['games', 'apps', 'CNAME'].includes(d.name)) core.push(d.name); } catch {}
  for (const n of core) {
    const p = path.join(root, n);
    try { if ((await fsp.stat(p)).isDirectory()) await walk(p, (r, s) => { coreSize += s; coreFiles++; }); else { coreSize += (await fsp.stat(p)).size; coreFiles++; } } catch {}
  }
  const listPages = ['games/index.html', 'apps/index.html'].filter(f => fs.existsSync(path.join(root, f)));
  return { site, items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)), core: { size: coreSize, files: coreFiles, entries: core, pages: listPages }, zip: hasZip() };
}
let zipOk = null;
const hasZip = () => { if (zipOk === null) { try { execFileSync('sh', ['-c', 'command -v zip'], { stdio: 'ignore' }); zipOk = true; } catch { zipOk = false; } } return zipOk; };
/** The folders and files (relative to the site) a request selects; only ids from the catalog are accepted. */
function selection(cat, q) {
  const kind = q.get('kind'), ids = new Set((q.get('items') || '').split(',').filter(Boolean));
  const chosen = cat.items.filter(it => kind === 'all' || (kind === 'games' && it.kind === 'game') || (kind === 'apps' && it.kind === 'app') || ids.has(it.id));
  const paths = chosen.map(it => it.id);
  if (q.get('core') === '1' || kind === 'all') paths.unshift(...cat.core.entries, ...cat.core.pages);
  return { chosen, paths };
}

export function gamesApi(req, res, url) {
  const m0 = /^\/games-api\/([\w.-]+)\/(list|files|zip)$/.exec(url.pathname);
  if (!m0) return false;
  apiAsync(req, res, url, m0).catch(err => { try { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: err.message })); } catch {} });
  return true;
}
async function apiAsync(req, res, url, m) {
  const [, site, action] = m;
  if (!installedGames().includes(site)) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"No such site"}'); return true; }
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const cat = await catalog(site);
  if (action === 'list') { json(200, cat); return true; }
  const root = path.join(DIR, site), { chosen, paths } = selection(cat, url.searchParams);
  if (!paths.length) { json(400, { error: 'Nothing selected' }); return true; }
  if (action === 'files') {
    const files = []; let size = 0;
    for (const p of paths) {
      const abs = path.join(root, p);
      try { const st = await fsp.stat(abs); if (st.isDirectory()) await walk(abs, (r, s) => { files.push(p + '/' + r); size += s; }); else { files.push(p); size += st.size; } } catch {}
    }
    json(200, { files, size, items: chosen.map(c => c.id) });
    return true;
  }
  // zip: stream it, uncompressed (game files are mostly compressed already) so it starts at once and works for GBs (zip64).
  const what = url.searchParams.get('kind') === 'all' ? 'everything' : url.searchParams.get('kind') || `${chosen.length}-items`;
  const useZip = hasZip();
  const child = useZip
    ? spawn('zip', ['-r', '-0', '-q', '-', ...paths, '-x', '*/.git/*', '.git/*'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    : spawn('tar', ['-c', '--exclude=.git', '-f', '-', ...paths], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  res.writeHead(200, { 'content-type': useZip ? 'application/zip' : 'application/x-tar', 'content-disposition': `attachment; filename="${site}-${what}.${useZip ? 'zip' : 'tar'}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  child.stdout.pipe(res);
  child.on('error', () => res.destroy());
  res.on('close', () => { try { child.kill(); } catch {} });
  return true;
}
