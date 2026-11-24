// Files: SanjivramOS's native file manager for this machine (the phone's Termux home, shared storage, proot distros…).
// Same rules as the phone shell: SANJIVRAM_SHELL=1, this phone or your own network only, never the public tunnel.
// GET  /linux-fs/list?p=<dir>          folder listing
// GET  /linux-fs/raw?p=<file>[&dl=1]   the file itself, with Range support so videos can seek (used for wallpapers too)
// PUT  /linux-fs/upload?p=<dir>&name=  upload one file (raw body)
// POST /linux-fs/op  { op, ... }       mkdir, rename, delete, copy, move, write, read
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const HOME = os.homedir();
const PREFIX = process.env.PREFIX || '';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.3gp': 'video/3gpp',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8', '.sh': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.js': 'text/plain; charset=utf-8', '.html': 'text/plain; charset=utf-8', '.css': 'text/plain; charset=utf-8'
};
const mimeOf = f => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
// Shown inline (wallpapers, previews). Everything else downloads, so a page can never run from this server's origin.
const INLINE = /^(image\/(?!svg)|video\/|audio\/|text\/plain)/;

/** "~/x" → home; relative paths are relative to home. */
export function resolvePath(p) {
  p = String(p || '~');
  if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
  if (!path.isAbsolute(p)) p = path.join(HOME, p);
  return path.resolve(p);
}
const pretty = p => (p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p);

/** Shortcuts shown in the sidebar (only the ones that exist on this machine). */
export function places() {
  const s = path.join(HOME, 'storage');
  const list = [
    ['Home', HOME, 'home'], ['Desktop', path.join(HOME, 'Desktop'), 'grid'], ['Downloads', path.join(s, 'downloads'), 'download'], ['Downloads', path.join(HOME, 'Downloads'), 'download'],
    ['Phone storage', path.join(s, 'shared'), 'hdd'], ['Camera', path.join(s, 'dcim'), 'camera'], ['Pictures', path.join(s, 'pictures'), 'image'], ['Pictures', path.join(HOME, 'Pictures'), 'image'],
    ['Movies', path.join(s, 'movies'), 'video'], ['Videos', path.join(HOME, 'Videos'), 'video'], ['Music', path.join(s, 'music'), 'music'], ['Music', path.join(HOME, 'Music'), 'music'],
    ['Linux distros', PREFIX && path.join(PREFIX, 'var/lib/proot-distro/installed-rootfs'), 'penguin'], ['Termux system', PREFIX, 'terminal'], ['Root /', '/', 'hdd']
  ];
  const seen = new Set(), out = [];
  for (const [name, p, icon] of list) {
    if (!p || seen.has(name)) continue;
    try { fs.readdirSync(p); seen.add(name); out.push({ name, path: pretty(p), icon }); } catch {}
  }
  return out;
}

async function list(dir) {
  const abs = resolvePath(dir);
  const names = await fsp.readdir(abs);
  const entries = await Promise.all(names.map(async name => {
    const f = path.join(abs, name);
    try {
      const l = await fsp.lstat(f);
      let st = l, broken = false;
      if (l.isSymbolicLink()) { try { st = await fsp.stat(f); } catch { broken = true; } }
      return { name, dir: !broken && st.isDirectory(), size: st.size, mtime: st.mtimeMs, link: l.isSymbolicLink(), broken, mime: st.isDirectory() ? '' : mimeOf(name) };
    } catch { return { name, dir: false, size: 0, mtime: 0, mime: mimeOf(name), unreadable: true }; }
  }));
  let disk = null;
  try { const s = fs.statfsSync(abs); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch {}
  return { path: pretty(abs), abs, parent: abs === '/' ? null : pretty(path.dirname(abs)), entries, disk, places: places(), home: HOME };
}

/** Streams a file, honouring Range so <video> can seek and start quickly. */
function raw(req, res, p, download) {
  const f = resolvePath(p);
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    const type = mimeOf(f), inline = !download && INLINE.test(type);
    const headers = {
      'content-type': inline ? type : 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=300',
      'last-modified': st.mtime.toUTCString(), 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'",
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(f))}`
    };
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && st.size) {
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, st.size - +m[2]); }
      else { start = +m[1] || 0; if (m[2] !== '') end = Math.min(end, +m[2]); }
      if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return; }
      code = 206; headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
    }
    headers['content-length'] = st.size ? end - start + 1 : 0;
    res.writeHead(code, headers);
    if (req.method === 'HEAD' || !st.size) { res.end(); return; }
    fs.createReadStream(f, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
}

async function copyAny(src, dst) {
  if (dst === src || dst.startsWith(src + path.sep)) throw new Error('Can’t copy a folder into itself');
  await fsp.cp(src, dst, { recursive: true, errorOnExist: true, force: false });
}
/** "name", "name (2)", "name (3)"… — never overwrite on copy/upload. */
async function freeName(dir, name) {
  const ext = path.extname(name), base = ext && ext !== name ? name.slice(0, -ext.length) : name;
  for (let i = 1; i < 1000; i++) {
    const n = i === 1 ? name : `${base} (${i})${ext}`;
    try { await fsp.lstat(path.join(dir, n)); } catch { return n; }
  }
  throw new Error('Too many files with that name');
}
const okName = n => typeof n === 'string' && n && n !== '.' && n !== '..' && !n.includes('/') && !n.includes('\0') && n.length < 256;

async function op(b) {
  const P = k => resolvePath(b[k]);
  switch (b.op) {
    case 'mkdir': { if (!okName(b.name)) throw new Error('Bad folder name'); const d = path.join(P('dir'), b.name); await fsp.mkdir(d); return { path: pretty(d) }; }
    case 'touch': { if (!okName(b.name)) throw new Error('Bad file name'); const f = path.join(P('dir'), b.name); await fsp.writeFile(f, '', { flag: 'wx' }); return { path: pretty(f) }; }
    case 'rename': { if (!okName(b.name)) throw new Error('Bad name'); const f = P('path'), to = path.join(path.dirname(f), b.name); try { await fsp.lstat(to); throw new Error('Something with that name already exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; } await fsp.rename(f, to); return { path: pretty(to) }; }
    case 'delete': {
      const ps = (Array.isArray(b.paths) ? b.paths : [b.path]).map(x => resolvePath(x));
      for (const f of ps) { if (f === '/' || f === HOME || f === PREFIX) throw new Error('Not allowed to delete ' + pretty(f)); await fsp.rm(f, { recursive: true, force: false }); }
      return { ok: true };
    }
    case 'copy': case 'move': {
      const to = P('dir'), done = [];
      for (const s of (Array.isArray(b.paths) ? b.paths : []).map(x => resolvePath(x))) {
        const name = b.op === 'copy' || path.dirname(s) !== to ? await freeName(to, path.basename(s)) : path.basename(s), d = path.join(to, name);
        if (b.op === 'move') {
          if (d === s) continue;
          if (d.startsWith(s + path.sep)) throw new Error('Can’t move a folder into itself');
          try { await fsp.rename(s, d); } catch (e) { if (e.code !== 'EXDEV') throw e; await copyAny(s, d); await fsp.rm(s, { recursive: true }); }
        } else await copyAny(s, d);
        done.push(pretty(d));
      }
      return { paths: done };
    }
    case 'read': {
      const f = P('path'), st = await fsp.stat(f);
      if (st.size > 20 * 1024 * 1024) throw new Error('That file is too big to open as text (over 20 MB)');
      return { text: await fsp.readFile(f, 'utf8'), size: st.size, mtime: st.mtimeMs };
    }
    case 'write': { const f = P('path'); if (typeof b.text !== 'string') throw new Error('No text'); await fsp.writeFile(f, b.text); return { ok: true }; }
    case 'info': {
      const f = P('path'), st = await fsp.stat(f);
      return { path: pretty(f), size: st.size, mtime: st.mtimeMs, atime: st.atimeMs, mode: (st.mode & 0o777).toString(8), dir: st.isDirectory(), mime: st.isDirectory() ? '' : mimeOf(f) };
    }
    case 'images': {
      // Images (and videos when asked) in one folder — for wallpaper slideshows and the photo widget.
      const d = P('dir'), re = b.videos ? /\.(png|jpe?g|gif|webp|bmp|avif|mp4|m4v|webm|mov)$/i : /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
      const names = (await fsp.readdir(d)).filter(n => re.test(n) && !n.startsWith('.')).sort();
      return { dir: pretty(d), files: names.slice(0, 2000).map(n => pretty(path.join(d, n))) };
    }
    case 'recent': {
      // Newest files in Downloads (for the Files widget).
      const d = [path.join(HOME, 'storage', 'downloads'), path.join(HOME, 'Downloads'), HOME].find(x => { try { return fs.statSync(x).isDirectory(); } catch { return false; } });
      const out = [];
      for (const n of await fsp.readdir(d)) { if (n.startsWith('.')) continue; try { const st = await fsp.stat(path.join(d, n)); if (st.isFile()) out.push({ name: n, path: pretty(path.join(d, n)), mtime: st.mtimeMs, size: st.size, mime: mimeOf(n) }); } catch {} }
      return { dir: pretty(d), files: out.sort((a, b2) => b2.mtime - a.mtime).slice(0, 12) };
    }
  }
  throw new Error('Unknown action');
}

const reply = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const errMsg = e => ({ ENOENT: 'No such file or folder', EACCES: 'Permission denied', EPERM: 'Permission denied', EEXIST: 'Something with that name already exists', ENOTEMPTY: 'The folder isn’t empty', ENOTDIR: 'Not a folder', EISDIR: 'That’s a folder', ENOSPC: 'No space left' })[e.code] || e.message;

/** Handles /linux-fs/*. `allowed` = shell on and from this phone / own network. Returns true when it answered. */
export async function handleFiles(req, res, url, allowed, readJson) {
  if (!url.pathname.startsWith('/linux-fs/')) return false;
  const action = url.pathname.slice(10);
  if (!allowed) { reply(res, 403, { error: 'Files needs the phone shell. In Termux: sanjivramos shell on, then sanjivramos restart. (It’s off on the public tunnel link.)' }); return true; }
  // Other websites must never read or change files: browsers mark their requests cross-site.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') { reply(res, 403, { error: 'Forbidden' }); return true; }
  let sameSite = false;
  try { sameSite = new URL(req.headers.origin).host === req.headers.host; } catch {}
  try {
    if (action === 'list' && req.method === 'GET') return reply(res, 200, await list(url.searchParams.get('p') || '~')), true;
    if (action === 'places' && req.method === 'GET') return reply(res, 200, { places: places(), home: HOME }), true;
    if (action === 'raw' && (req.method === 'GET' || req.method === 'HEAD')) { raw(req, res, url.searchParams.get('p') || '', url.searchParams.get('dl') === '1'); return true; }
    if (action === 'text' && req.method === 'GET') {
      const f = resolvePath(url.searchParams.get('p') || ''), st = await fsp.stat(f);
      if (!st.isFile()) return reply(res, 400, { error: 'Not a file' }), true;
      if (st.size > 50 * 1024 * 1024) return reply(res, 400, { error: 'That file is too big to edit as text (over 50 MB)' }), true;
      const buf = await fsp.readFile(f);
      if (buf.subarray(0, 8000).includes(0)) return reply(res, 415, { error: 'That looks like a binary file, not text' }), true;
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-mtime': String(st.mtimeMs), 'x-size': String(st.size), 'x-path': encodeURIComponent(pretty(f)) });
      res.end(buf); return true;
    }
    if (!sameSite) { reply(res, 403, { error: 'Forbidden' }); return true; }
    if (action === 'upload' && req.method === 'PUT') {
      const dir = resolvePath(url.searchParams.get('p') || '~'), name = url.searchParams.get('name') || '';
      if (!okName(name)) return reply(res, 400, { error: 'Bad file name' }), true;
      const f = path.join(dir, await freeName(dir, name));
      await pipeline(req, fs.createWriteStream(f, { flags: 'wx' }));
      return reply(res, 200, { path: pretty(f) }), true;
    }
    // Text editors (Notepad, Code Studio): read/save a whole text file as the raw request/response body — no JSON
    // escaping, so big files open and save fast. Save writes to a temp file then renames it (no half-written files).
    if (action === 'save' && req.method === 'PUT') {
      const f = resolvePath(url.searchParams.get('p') || ''), dir = path.dirname(f), base = path.basename(f);
      if (!okName(base)) return reply(res, 400, { error: 'Bad file name' }), true;
      const want = url.searchParams.get('mtime');   // optional: refuse if the file changed on disk since it was opened
      let mode;
      try { const st = await fsp.stat(f); mode = st.mode; if (want && Math.abs(st.mtimeMs - +want) > 1 && url.searchParams.get('force') !== '1') return reply(res, 409, { error: 'The file changed on disk since you opened it', mtime: st.mtimeMs }), true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const tmp = path.join(dir, `.${base}.sjsave-${process.pid}-${Date.now()}`);
      await pipeline(req, fs.createWriteStream(tmp, { flags: 'wx', mode: mode ? mode & 0o777 : 0o644 }));
      await fsp.rename(tmp, f).catch(async e => { await fsp.rm(tmp, { force: true }); throw e; });
      const st = await fsp.stat(f);
      return reply(res, 200, { ok: true, path: pretty(f), mtime: st.mtimeMs, size: st.size }), true;
    }
    if (action === 'op' && req.method === 'POST' && /^application\/json/.test(req.headers['content-type'] || '')) {
      const body = await readJson(req, 8 * 1024 * 1024);
      return reply(res, 200, await op(body)), true;
    }
    reply(res, 404, { error: 'Not found' });
  } catch (e) { reply(res, 400, { error: errMsg(e) }); }
  return true;
}
