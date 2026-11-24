// Android apps on this phone: list the launchable ones (with real names via aapt), serve their icons, and open them.
// Uses Termux's `cmd package` / `pm` / `am`, plus `aapt` (pkg install aapt) and `unzip`. Results are cached in DATA.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

const PKG_RE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const ACT_RE = /^[\w.$]+$/;

/** Run a command; resolves stdout (string or Buffer) even if it exited non-zero, or null if it couldn't run. */
const run = (cmd, args, { buffer = false, timeout = 30000 } = {}) => new Promise(res => {
  execFile(cmd, args, { maxBuffer: 64 << 20, timeout, encoding: buffer ? 'buffer' : 'utf8' }, (err, out) => res(out && out.length ? out : err ? null : out));
});

/** Run jobs with at most n at once. */
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export function androidOk() { return fs.existsSync('/system/build.prop') || !!process.env.ANDROID_ROOT; }

let cacheFile, iconDir, mem = null, busy = null;
function init(DATA) {
  if (cacheFile) return;
  cacheFile = path.join(DATA, '.android-apps.json');
  iconDir = path.join(DATA, '.android-icons');
  try { mem = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { mem = { info: {}, list: null, at: 0 }; }
  mem.info = mem.info || {};
}

/** Name and icon path of an APK from `aapt dump badging`. */
async function badging(apk) {
  const out = await run('aapt', ['dump', 'badging', apk], { timeout: 20000 });
  if (!out) return { label: '', icons: [] };
  const lab = /^application-label-en(?:-US)?:'(.*)'$/m.exec(out) || /^application-label:'(.*)'$/m.exec(out) || /^application: label='([^']*)'/m.exec(out);
  const icons = [...out.matchAll(/^application-icon-(\d+):'(.*)'$/gm)].sort((a, b) => b[1] - a[1]).map(m => m[2]);
  const main = /^application: .*icon='([^']*)'/m.exec(out);
  if (main && !icons.includes(main[1])) icons.push(main[1]);
  return { label: lab ? lab[1].trim() : '', icons };
}

/** Every app with a launcher icon: [{ pkg, activity, label, system }]. Cached; force re-reads everything. */
export async function listAndroid(DATA, force = false) {
  init(DATA);
  if (!force && mem.list && Date.now() - mem.at < 60000) return { apps: mem.list, at: mem.at };
  if (busy) return busy;
  busy = (async () => {
    const q = await run('cmd', ['package', 'query-activities', '--brief', '--user', '0', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']);
    if (!q) throw new Error('Couldn’t read the phone’s apps (cmd package failed).');
    const acts = new Map();
    for (const m of q.matchAll(/^\s+([\w.]+)\/([\w.$]+)\s*$/gm)) if (!acts.has(m[1])) acts.set(m[1], m[2].startsWith('.') ? m[1] + m[2] : m[2]);
    const paths = new Map(), third = new Set();
    for (const line of String(await run('pm', ['list', 'packages', '-f']) || '').split('\n')) {
      const m = /^package:(.+)=([\w.]+)\s*$/.exec(line.trim()); if (m) paths.set(m[2], m[1]);
    }
    for (const line of String(await run('pm', ['list', 'packages', '-3']) || '').split('\n')) { const m = /^package:([\w.]+)/.exec(line.trim()); if (m) third.add(m[1]); }
    const hasAapt = !!(await run('sh', ['-c', 'command -v aapt']));
    const pkgs = [...acts.keys()];
    await pool(pkgs, 4, async pkg => {
      const apk = paths.get(pkg); if (!apk) return;
      let mtime = 0; try { mtime = fs.statSync(apk).mtimeMs; } catch {}
      const old = mem.info[pkg];
      if (old && old.apk === apk && old.mtime === mtime && (old.label || !hasAapt)) return;
      const b = hasAapt ? await badging(apk) : { label: '', icons: [] };
      mem.info[pkg] = { apk, mtime, label: b.label, icons: b.icons };
      try { fs.rmSync(path.join(iconDir, pkg + '.bin'), { force: true }); fs.rmSync(path.join(iconDir, pkg + '.json'), { force: true }); } catch {}
    });
    const pretty = pkg => { const p = pkg.split('.').filter(x => !/^(com|org|net|android|app|apps|google|samsung|sec|client|mobile)$/.test(x)); const w = p[p.length - 1] || pkg; return w[0].toUpperCase() + w.slice(1); };
    const list = pkgs.filter(p => p !== 'com.termux.api').map(pkg => {
      const i = mem.info[pkg] || {};
      return { pkg, activity: acts.get(pkg), label: i.label || pretty(pkg), system: !third.has(pkg), v: Math.round((i.mtime || 0) / 1000) % 1e6 };
    }).sort((a, b) => a.label.localeCompare(b.label));
    mem.list = list; mem.at = Date.now();
    try { fs.writeFileSync(cacheFile, JSON.stringify(mem)); } catch {}
    return { apps: list, at: mem.at, aapt: hasAapt };
  })().finally(() => { busy = null; });
  return busy;
}

const DPI = s => /xxxhdpi/.test(s) ? 6 : /xxhdpi/.test(s) ? 5 : /xhdpi/.test(s) ? 4 : /hdpi/.test(s) ? 3 : /mdpi/.test(s) ? 2 : /ldpi/.test(s) ? 1 : 0;
const IMG = /\.(png|webp|jpe?g)$/i;
const sniff = b => b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null;

/** Best raster launcher picture inside the APK (for apps whose icon is an adaptive/vector XML). */
async function apkRaster(apk, icons) {
  const want = icons.map(p => path.basename(p).replace(/\.\w+$/, ''));
  const exact = icons.find(p => IMG.test(p));
  if (exact) return exact;
  const ls = await run('unzip', ['-l', apk], { timeout: 20000 });
  if (!ls) return null;
  const files = [...String(ls).matchAll(/^\s*(\d+)\s+\S+\s+\S+\s+(res\/\S+)$/gm)].map(m => ({ size: +m[1], name: m[2] }))
    .filter(f => IMG.test(f.name) && /^res\/(mipmap|drawable)/.test(f.name));
  const score = f => {
    const base = path.basename(f.name).replace(/\.\w+$/, '');
    if (/foreground|background|monochrome|transparent|notif|splash|banner|_bg$/i.test(base)) return -1;
    let s = DPI(f.name) * 10;
    if (want.includes(base)) s += 100; else if (/^ic_launcher(_round)?$/.test(base)) s += 80; else if (/launcher|app_icon|ic_logo/.test(base)) s += 40; else return -1;
    if (/_round/.test(base)) s -= 5;
    return s;
  };
  const best = files.map(f => [score(f), f]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1].size - a[1].size)[0];
  return best ? best[1].name : null;
}

/** The app's icon from its Google Play page (adaptive icons can't be drawn from the APK without its resource table). */
async function playIcon(pkg) {
  try {
    const ac = AbortSignal.timeout(12000);
    const html = await (await fetch(`https://play.google.com/store/apps/details?id=${pkg}&hl=en`, { signal: ac, headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } })).text();
    const m = /<meta property="og:image" content="([^"]+)"/.exec(html) || /<img[^>]+src="(https:\/\/play-lh\.googleusercontent\.com\/[^"]+)"[^>]+itemprop="image"/.exec(html);
    if (!m) return null;
    const url = m[1].replace(/&amp;/g, '&').replace(/=[swh]\d[^/]*$/, '') + '=s192';
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const buf = Buffer.from(await r.arrayBuffer());
    return sniff(buf) ? buf : null;
  } catch { return null; }
}

function letterIcon(pkg, label) {
  let h = 0; for (const c of pkg) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ch = (label || pkg.split('.').pop() || '?').trim()[0].toUpperCase().replace(/[<>&"']/g, '?');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h % 360},65%,58%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},60%,38%)"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="url(#g)"/><text x="48" y="64" font-family="sans-serif" font-size="46" font-weight="700" fill="#fff" text-anchor="middle">${ch}</text></svg>`);
}

const iconBusy = new Map();
let iconRunning = 0; const iconQueue = [];
const limit = fn => new Promise((res, rej) => { const go = () => { iconRunning++; fn().then(res, rej).finally(() => { iconRunning--; const n = iconQueue.shift(); n && n(); }); }; iconRunning < 3 ? go() : iconQueue.push(go); });

/** { type, buf } for a package's icon, made once and cached on disk. */
async function iconFor(DATA, pkg) {
  init(DATA);
  const bin = path.join(iconDir, pkg + '.bin'), meta = path.join(iconDir, pkg + '.json');
  try { return { type: JSON.parse(fs.readFileSync(meta, 'utf8')).type, buf: fs.readFileSync(bin) }; } catch {}
  if (iconBusy.has(pkg)) return iconBusy.get(pkg);
  const job = limit(async () => {
    const info = mem.info[pkg] || {};
    let buf = null;
    if (info.apk) {
      const icons = info.icons || [];
      const exact = icons.find(p => IMG.test(p));
      if (exact) buf = await run('unzip', ['-p', info.apk, exact], { buffer: true });
      if (!buf || !sniff(buf)) buf = await playIcon(pkg);
      if (!buf) { const r = await apkRaster(info.apk, icons); if (r) buf = await run('unzip', ['-p', info.apk, r], { buffer: true }); }
    }
    let type = buf && sniff(buf);
    if (!type) { buf = letterIcon(pkg, info.label); type = 'image/svg+xml'; }
    try { fs.mkdirSync(iconDir, { recursive: true }); fs.writeFileSync(bin, buf); fs.writeFileSync(meta, JSON.stringify({ type })); } catch {}
    return { type, buf };
  }).finally(() => iconBusy.delete(pkg));
  iconBusy.set(pkg, job);
  return job;
}

export async function serveAndroidIcon(DATA, req, res, pkg) {
  if (!PKG_RE.test(pkg || '')) { res.writeHead(400); res.end(); return; }
  try {
    const { type, buf } = await iconFor(DATA, pkg);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=86400' }); res.end(buf);
  } catch { res.writeHead(500); res.end(); }
}

/** Open an app: by its launcher activity when known, else by package. */
export function launchAndroid(pkg, activity) {
  if (!PKG_RE.test(pkg || '')) return Promise.resolve({ ok: false, error: 'Bad package name' });
  const target = activity && ACT_RE.test(activity) ? ['-n', `${pkg}/${activity}`] : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg];
  return new Promise(done => {
    let text = '', fin = false;
    const end = r => { if (!fin) { fin = true; done(r); } };
    const p = spawn('am', ['start', ...target, '-f', '0x10200000'], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => text += d); p.stderr.on('data', d => text += d);
    p.on('error', err => end({ ok: false, error: err.message }));
    p.on('close', code => end(code === 0 && !/Error|Exception|unable to resolve/i.test(text) ? { ok: true } : { ok: false, error: text.trim().split('\n').pop() || 'Couldn’t open the app' }));
    setTimeout(() => { try { p.kill(); } catch {} end({ ok: false, error: 'Timed out opening the app' }); }, 15000);
  });
}

/* ---- Android apps inside SanjivramOS windows: desktop.sh android-app runs scrcpy on a virtual display + its own Xvnc ---- */
const DESK = process.env.SANJIVRAM_DESKTOP_CMD || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'desktop.sh');
const open = new Map();   // display number → { pkg, at }
const runDesk = (args, timeout = 120000) => new Promise(res => {
  execFile('bash', [DESK, ...args], { timeout, maxBuffer: 1 << 20 }, (err, out, errOut) => res({ code: err ? (err.code ?? 1) : 0, out: String(out || '') + String(errOut || '') }));
});

/** Is adb connected to this phone (wireless debugging)? Tries to reconnect when not. */
export async function adbStatus(full = false) {
  const r = await runDesk(['adb-connect', full ? 'full' : 'quick'], 150000);
  const serial = r.out.trim().split('\n').pop();
  return { connected: r.code === 0 && !!serial, serial: r.code === 0 ? serial : '' };
}

/** `adb pair` with the code from Settings → Developer options → Wireless debugging → Pair device with pairing code. */
export async function adbPair(port, code, connectPort) {
  port = parseInt(port, 10); connectPort = parseInt(connectPort, 10);
  if (!(port > 0 && port < 65536) || !/^\d{6}$/.test(String(code || '').trim())) return { ok: false, error: 'Enter the pairing port and the 6-digit code.' };
  const out = String(await run('adb', ['pair', `127.0.0.1:${port}`, String(code).trim()], { timeout: 30000 }) || '');
  if (!/Successfully paired/i.test(out)) return { ok: false, error: out.trim().split('\n').pop() || 'Pairing failed — check the port and code.' };
  if (connectPort > 0 && connectPort < 65536) await run('adb', ['connect', `127.0.0.1:${connectPort}`], { timeout: 15000 });
  const st = await adbStatus();
  return { ok: true, connected: st.connected };
}

/** Virtual display ids made by scrcpy (named "scrcpy"). */
async function scrcpyDisplays(serial) {
  const out = String(await run('adb', ['-s', serial, 'shell', 'dumpsys', 'display'], { timeout: 15000 }) || '');
  return new Set([...out.matchAll(/DisplayInfo\{"scrcpy", displayId (\d+)/g)].map(m => +m[1]));
}

/** Start an app (or pkg "DESKTOP": a DeX-style desktop) on its own virtual display.
 *  Returns { ok, n, size } (n = X display; VNC on 5900+n) or { ok:false, noadb }. */
export async function openAndroidWindow(pkg, orient, full = false, size) {
  const desk = pkg === 'DESKTOP';
  if (!desk && !PKG_RE.test(pkg || '')) return { ok: false, error: 'Bad package name' };
  let n = 10; while (open.has(n) && n < 18) n++;
  if (n >= 18) return { ok: false, error: 'Too many Android apps open — close one first.' };
  size = desk && /^\d{3,4}x\d{3,4}$/.test(size || '') ? size : desk ? '1600x900' : orient === 'portrait' ? '720x1280' : '1280x720';
  open.set(n, { pkg, at: Date.now() });
  const st = desk ? await adbStatus(full) : null;
  const before = st && st.connected ? await scrcpyDisplays(st.serial) : new Set();
  const r = await runDesk(['android-app', String(n), pkg, size, desk ? '200' : '240', full ? 'full' : 'quick'], 180000);
  if (/NOADB/.test(r.out)) { open.delete(n); return { ok: false, noadb: true, error: 'adb isn’t connected (turn on Wireless debugging).' }; }
  const ok = /^OK (\S+)/m.exec(r.out);
  if (r.code !== 0 || !ok) { open.delete(n); return { ok: false, error: r.out.trim().split('\n').pop() || 'Couldn’t start the app display.' }; }
  const info = { pkg, at: Date.now(), serial: ok[1], display: null };
  open.set(n, info);
  if (desk) for (let i = 0; i < 24 && info.display == null; i++) {
    await new Promise(res => setTimeout(res, 500));
    const now = await scrcpyDisplays(info.serial);
    for (const d of now) if (!before.has(d)) info.display = d;
  }
  return { ok: true, n, size, display: info.display };
}

/** Open an app as a window on an Android Desktop (display n). */
export async function deskLaunch(n, pkg, activity) {
  const info = open.get(parseInt(n, 10));
  if (!info || info.display == null) return { ok: false, error: 'The Android Desktop isn’t running.' };
  if (!PKG_RE.test(pkg || '') || (activity && !ACT_RE.test(activity))) return { ok: false, error: 'Bad app' };
  const target = activity ? ['-n', `${pkg}/${activity}`] : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg];
  const out = String(await run('adb', ['-s', info.serial, 'shell', 'am', 'start', '--display', String(info.display), '--windowingMode', '5', ...target], { timeout: 20000 }) || '');
  return /Error|Exception/.test(out) ? { ok: false, error: out.trim().split('\n').pop() } : { ok: true };
}

export async function closeAndroidWindow(n) {
  n = parseInt(n, 10);
  if (!(n >= 10 && n <= 17)) return { ok: false };
  open.delete(n);
  await runDesk(['android-stop', String(n)], 20000);
  return { ok: true };
}
