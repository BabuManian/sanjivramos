// Web Browser extensions: Chrome extensions installed for the headless Chromium in vip.js.
// Each extension is an unpacked folder in <data>/.vip-extensions/<folder>/; state.json remembers which are switched off.
// Install from the Chrome Web Store (link or 32-letter ID), or from a .crx / .zip / folder on this phone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

let DIR = '';
export function extInit(dataDir) { DIR = path.join(dataDir, '.vip-extensions'); }
const STATE = () => path.join(DIR, 'state.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch { return {}; } };
const writeState = s => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE(), JSON.stringify(s, null, 1)); };

// Chrome extension IDs: the first 128 bits of SHA-256 (of the public key, or of the folder path for keyless unpacked ones), written with a–p.
const idOf = buf => [...crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
const idFromKeyB64 = k => idOf(Buffer.from(k, 'base64'));
const readManifest = dir => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));

function msg(dir, m, s) {
  const k = /^__MSG_(.+)__$/.exec(String(s || '')); if (!k) return s || '';
  for (const loc of [m.default_locale, 'en', 'en_US'].filter(Boolean)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8').replace(/^﻿/, ''));
      const hit = Object.keys(j).find(x => x.toLowerCase() === k[1].toLowerCase());
      if (hit && j[hit].message) return j[hit].message;
    } catch {}
  }
  return s;
}
function iconData(dir, m) {
  const icons = m.icons || (m.action || m.browser_action || {}).default_icon || {};
  const list = typeof icons === 'string' ? [[48, icons]] : Object.entries(icons).map(([s, f]) => [+s, f]).sort((a, b) => a[0] - b[0]);
  const pick = list.find(([s]) => s >= 32) || list[list.length - 1];
  if (!pick) return '';
  try {
    const f = path.join(dir, String(pick[1]).replace(/^\/+/, ''));
    if (!f.startsWith(dir + path.sep) || fs.statSync(f).size > 200000) return '';
    const ext = path.extname(f).toLowerCase(), type = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext];
    return type ? `data:${type};base64,${fs.readFileSync(f).toString('base64')}` : '';
  } catch { return ''; }
}
function info(folder, state = readState()) {
  const dir = path.join(DIR, folder);
  let m; try { m = readManifest(dir); } catch { return null; }
  let real = dir; try { real = fs.realpathSync(dir); } catch {}
  const id = m.key ? idFromKeyB64(m.key) : idOf(Buffer.from(real));
  const act = m.action || m.browser_action || m.page_action || {};
  return {
    folder, dir: real, id, name: msg(dir, m, m.name) || folder, version: m.version || '', description: msg(dir, m, m.description).slice(0, 200),
    mv: m.manifest_version | 0, enabled: !(state[folder] && state[folder].off), popup: act.default_popup ? String(act.default_popup).replace(/^\/+/, '') : '',
    options: String(m.options_page || (m.options_ui && m.options_ui.page) || '').replace(/^\/+/, ''), icon: iconData(dir, m), store: !!(state[folder] && state[folder].store)
  };
}
export function extList() {
  if (!DIR) return [];
  let names = []; try { names = fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name); } catch {}
  const st = readState();
  return names.map(n => info(n, st)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
// Chromium flags for the switched-on extensions (+ live install/remove over the DevTools pipe).
export function extFlags() {
  const on = extList().filter(e => e.enabled).map(e => e.dir).filter(d => !d.includes(','));
  return ['--enable-unsafe-extension-debugging', ...(on.length ? [`--load-extension=${on.join(',')}`, `--disable-extensions-except=${on.join(',')}`] : [])];
}

/* ---------- unpacking ---------- */
function unzip(buf, dest) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a zip / extension file');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip file');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    const rel = path.posix.normalize(name);
    if (rel.startsWith('../') || rel === '..' || path.posix.isAbsolute(rel)) throw new Error('Unsafe path in zip: ' + name);
    const out = path.join(dest, rel);
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    const start = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28), data = buf.subarray(start, start + csize);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : (() => { throw new Error('Unsupported zip compression'); })());
  }
}
// Minimal protobuf reader for the CRX3 header: returns [field, bytes] pairs of length-delimited fields.
function pbFields(b) {
  const out = []; let i = 0;
  const varint = () => { let r = 0, s = 0, c; do { c = b[i++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80 && i < b.length); return r; };
  while (i < b.length) {
    const tag = varint(), f = Math.floor(tag / 8), w = tag & 7;
    if (w === 2) { const n = varint(); out.push([f, b.subarray(i, i + n)]); i += n; }
    else if (w === 0) varint(); else if (w === 5) i += 4; else if (w === 1) i += 8; else break;
  }
  return out;
}
function crxSplit(buf, wantId) {
  if (buf.toString('latin1', 0, 4) !== 'Cr24') return { zip: buf, key: null };   // plain .zip
  const ver = buf.readUInt32LE(4);
  if (ver === 2) { const pk = buf.readUInt32LE(8), sg = buf.readUInt32LE(12); return { key: buf.subarray(16, 16 + pk), zip: buf.subarray(16 + pk + sg) }; }
  if (ver !== 3) throw new Error('Unknown .crx version ' + ver);
  const hl = buf.readUInt32LE(8), hdr = buf.subarray(12, 12 + hl);
  const keys = pbFields(hdr).filter(([f]) => f === 2 || f === 3).map(([, v]) => (pbFields(v).find(([f]) => f === 1) || [])[1]).filter(Boolean);
  return { zip: buf.subarray(12 + hl), key: keys.find(k => idOf(k) === wantId) || keys[0] || null };
}
function installBuffer(buf, folderHint, wantId, meta = {}) {
  const { zip, key } = crxSplit(buf, wantId);
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(DIR, '.tmp-'));
  try {
    unzip(zip, tmp);
    // Some zips wrap everything in one folder.
    let root = tmp;
    if (!fs.existsSync(path.join(root, 'manifest.json'))) {
      const subs = fs.readdirSync(root).filter(n => fs.existsSync(path.join(root, n, 'manifest.json')));
      if (subs.length !== 1) throw new Error('No manifest.json found — that isn’t a Chrome extension');
      root = path.join(root, subs[0]);
    }
    return finish(root, folderHint, key, meta, tmp);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
function finish(root, folderHint, key, meta, tmp) {
  const m = readManifest(root);
  if (key && !m.key) { m.key = Buffer.from(key).toString('base64'); fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(m, null, 2)); }
  fs.rmSync(path.join(root, '_metadata'), { recursive: true, force: true });   // Chrome won't load unpacked folders with "_" names
  const folder = (m.key ? idFromKeyB64(m.key) : String(folderHint || msg(root, m, m.name) || 'extension').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)) || 'extension';
  const dest = path.join(DIR, folder);
  const old = extList().find(e => e.folder === folder);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(root, dest);
  const st = readState(); st[folder] = { ...(st[folder] || {}), ...meta }; writeState(st);
  return { ...info(folder), updated: !!old, oldDir: old && old.dir };
}

const STORE_ID = /(?:^|[/=])([a-p]{32})(?:$|[/?#&])/;
export function storeId(s) { const m = STORE_ID.exec(String(s || '').trim()); return m ? m[1] : null; }

// src: Chrome Web Store link / ID, or a path on this phone (.crx, .zip or an unpacked folder).
export async function extInstall(src, chromeVersion) {
  src = String(src || '').trim();
  if (!src) throw new Error('Paste a Chrome Web Store link');
  const local = src.replace(/^file:\/\//, '').replace(/^~(?=\/|$)/, os.homedir());
  if (path.isAbsolute(local) && fs.existsSync(local)) {
    const s = fs.statSync(local);
    if (s.isDirectory()) {
      if (!fs.existsSync(path.join(local, 'manifest.json'))) throw new Error('That folder has no manifest.json');
      fs.mkdirSync(DIR, { recursive: true });
      const tmp = fs.mkdtempSync(path.join(DIR, '.tmp-'));   // work on a copy — never change the user's own folder
      try { fs.cpSync(local, path.join(tmp, 'x'), { recursive: true }); return finish(path.join(tmp, 'x'), path.basename(local), null, { local: true }, tmp); }
      finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    }
    return installBuffer(fs.readFileSync(local), path.basename(local).replace(/\.(crx|zip)$/i, ''), null, { local: true });
  }
  const id = storeId(src);
  if (!id) throw new Error('That isn’t a Chrome Web Store link or extension ID');
  const ver = (/(\d+\.\d+\.\d+\.\d+)/.exec(chromeVersion || '') || [, '140.0.0.0'])[1];
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${ver}&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Chrome Web Store download failed (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('The Chrome Web Store didn’t send that extension (it may be removed or not public)');
  return installBuffer(buf, id, id, { store: true });
}
export function extRemove(folder) {
  const e = extList().find(x => x.folder === folder); if (!e) throw new Error('No such extension');
  fs.rmSync(path.join(DIR, folder), { recursive: true, force: true });
  const st = readState(); delete st[folder]; writeState(st);
  return e;
}
export function extSetEnabled(folder, on) {
  if (!extList().some(x => x.folder === folder)) throw new Error('No such extension');
  const st = readState(); st[folder] = { ...(st[folder] || {}), off: !on }; if (on) delete st[folder].off; writeState(st);
  return info(folder, st);
}
