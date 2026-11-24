// Linux apps made in SanjivramOS's App Store ("Make a Linux App"): a command that runs on this machine, either in a
// terminal window (CLI) or on the VNC desktop shown by noVNC (GUI). Same rules as the phone shell:
// SANJIVRAM_SHELL=1 and a SITE_PASSWORD, and requests must come from SanjivramOS itself.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Single-quote for sh: everything inside stays literal. */
export const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

const DISTRO = /^[a-z0-9][\w.-]{0,40}$/i;
const ID = /^lx-[a-z0-9]{1,24}$/;

/** Checks an app description from the browser; returns null when it's unusable. */
export function parseSpec(o) {
  if (!o || typeof o !== 'object') return null;
  const cmd = String(o.cmd || '').trim(), setup = String(o.setup || '').trim(), distro = String(o.distro || '').trim();
  if (!cmd || cmd.length > 4000 || setup.length > 4000) return null;
  if (distro && !DISTRO.test(distro)) return null;
  return {
    cmd, setup, distro,
    mode: o.mode === 'gui' ? 'gui' : 'cli',
    hold: o.hold !== false,
    name: String(o.name || 'App').replace(/[\r\n]/g, ' ').slice(0, 40),
    cwd: String(o.cwd || '').trim().slice(0, 500)
  };
}

/** The shell script that runs the app: optional working folder and one-time setup, then the command,
 *  inside a proot-distro Linux when one is chosen. */
export function buildScript(spec) {
  const inner = [];
  if (spec.mode === 'gui' && !spec.fromMenu) inner.push('export DISPLAY=:3');   // the Fluxbox apps display (menu launchers keep their own)
  if (spec.cwd) inner.push(`cd ${spec.cwd.startsWith('~/') ? '"$HOME"/' + q(spec.cwd.slice(2)) : q(spec.cwd)} || exit 1`);
  if (spec.setup) {
    const bin = (spec.cmd.match(/^\s*([^\s=;&|<>()]+)(\s|$)/) || [])[1];
    const check = bin ? `command -v ${q(bin)} >/dev/null 2>&1` : 'false';
    inner.push(`if ! ${check}; then printf '\\033[1;36m==> Setting up %s…\\033[0m\\n' ${q(spec.name)}; eval ${q(spec.setup)} || { echo "Setup failed."; exit 1; }; fi`);
  }
  inner.push(`eval ${q(spec.cmd)}`);
  const body = inner.join('\n');
  let script = spec.distro
    ? `command -v proot-distro >/dev/null 2>&1 || { echo "proot-distro isn't installed: pkg install proot-distro && proot-distro install ${spec.distro}"; exit 1; }\nproot-distro login ${q(spec.distro)} --shared-tmp -- sh -lc ${q(body)}`
    : body;
  if (spec.mode === 'cli' && spec.hold) {
    script = `( ${script}\n)\nst=$?\nprintf '\\n\\033[2m[%s finished (exit code %s) — press Enter to close]\\033[0m' ${q(spec.name)} "$st"\nread -r _`;
  }
  return script;
}

/** Is this command on the PATH? */
const has = cmd => (process.env.PATH || '').split(':').some(d => { try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch { return false; } });
export const SHELL = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : has('bash') ? 'bash' : 'sh';

/** Runs a GUI app on the desktop's display. Resolves when it has either failed quickly or is still running after a moment. */
/** The D-Bus session of the apps display's Fluxbox, so apps there can talk to each other (Thunar, Firefox tabs…). */
function appsBus() {
  try {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      let cmd; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
      if (!/^fluxbox\0-rc\0.*fluxbox-apps\/init/.test(cmd) && !/fluxbox-apps\/init/.test(cmd.split('\0').slice(0, 3).join(' '))) continue;
      const m = /(?:^|\0)DBUS_SESSION_BUS_ADDRESS=([^\0]+)/.exec(fs.readFileSync(`/proc/${d}/environ`, 'utf8'));
      if (m) return { DBUS_SESSION_BUS_ADDRESS: m[1] };
    }
  } catch {}
  return {};
}

export function runGui(spec, logFile) {
  const env = { ...process.env, DISPLAY: ':3', ...appsBus() };
  delete env.SITE_PASSWORD;
  return new Promise(resolve => {
    let out = '';
    const child = spawn(SHELL, ['-lc', buildScript(spec)], { cwd: os.homedir(), env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(logFile, { flags: 'a' });
    log.write(`\n--- ${new Date().toISOString()} ${spec.name}: ${spec.cmd}\n`);
    const take = d => { log.write(d); if (out.length < 4000) out += d; };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    child.on('error', err => finish({ ok: false, error: err.message }));
    child.on('exit', code => { log.end(); finish(code ? { ok: false, error: `It stopped with exit code ${code}.`, output: out.slice(-1500) } : { ok: true, exited: true }); });
    setTimeout(() => finish({ ok: true, running: true }), 2500);
    child.unref();
  });
}

/** Adds the app to the Linux desktop's own menus (XFCE and other freedesktop launchers), with its icon. */
export function exportDesktop(spec, id, icon) {
  if (!ID.test(id)) throw new Error('bad id');
  const share = path.join(os.homedir(), '.local', 'share');
  const appsDir = path.join(share, 'applications'), binDir = path.join(share, 'sanjivramos', 'apps'), iconDir = path.join(share, 'icons');
  for (const d of [appsDir, binDir, iconDir]) fs.mkdirSync(d, { recursive: true });
  const launcher = path.join(binDir, `${id}.sh`);
  fs.writeFileSync(launcher, `#!/bin/sh\n# Made by SanjivramOS (App Store → Make a Linux App)\n${buildScript({ ...spec, hold: spec.mode === 'cli', fromMenu: true })}\n`, { mode: 0o755 });
  let iconPath = '';
  const m = /^data:image\/(png|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(String(icon || ''));
  if (m) {
    iconPath = path.join(iconDir, `sanjivramos-${id}.${m[1] === 'png' ? 'png' : 'svg'}`);
    fs.writeFileSync(iconPath, Buffer.from(m[2], 'base64'));
  }
  const clean = s => String(s).replace(/[\r\n]/g, ' ');
  fs.writeFileSync(path.join(appsDir, `sanjivramos-${id}.desktop`), [
    '[Desktop Entry]', 'Type=Application', `Name=${clean(spec.name)}`, 'Comment=Made in SanjivramOS',
    `Exec=sh ${launcher}`, `Terminal=${spec.mode === 'cli' ? 'true' : 'false'}`, iconPath ? `Icon=${iconPath}` : 'Icon=application-x-executable',
    'Categories=Utility;', ''
  ].join('\n'));
  return path.join(appsDir, `sanjivramos-${id}.desktop`);
}

export function removeDesktop(id) {
  if (!ID.test(id)) return;
  const share = path.join(os.homedir(), '.local', 'share');
  for (const f of [path.join(share, 'applications', `sanjivramos-${id}.desktop`), path.join(share, 'sanjivramos', 'apps', `${id}.sh`),
    path.join(share, 'icons', `sanjivramos-${id}.png`), path.join(share, 'icons', `sanjivramos-${id}.svg`)]) {
    try { fs.unlinkSync(f); } catch {}
  }
}

/** Reads a small JSON request body. */
export function readJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', d => { size += d.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* ===================== Installed Linux apps (freedesktop .desktop files) ===================== */
const HOME = os.homedir();
const PREFIX = process.env.PREFIX && fs.existsSync(process.env.PREFIX) ? process.env.PREFIX : '/usr';
const ROOTFS = path.join(PREFIX, 'var', 'lib', 'proot-distro', 'installed-rootfs');
const IMG_EXT = ['.png', '.svg', '.jpg', '.jpeg', '.webp', '.gif', '.ico'];

/** proot-distro Linuxes installed on this phone. */
export function distros() {
  try { return fs.readdirSync(ROOTFS).filter(d => DISTRO.test(d) && fs.statSync(path.join(ROOTFS, d)).isDirectory()); } catch { return []; }
}
/** Data folders (…/share) for Termux/the host and for each distro. */
function dataDirs() {
  const host = [...new Set([path.join(HOME, '.local', 'share'), path.join(PREFIX, 'share'),
    ...(process.env.XDG_DATA_DIRS || '').split(':').filter(Boolean), '/usr/local/share', '/usr/share'])].filter(d => fs.existsSync(d));
  return [{ distro: '', dirs: host }, ...distros().map(d => ({ distro: d, dirs: ['usr/local/share', 'usr/share'].map(x => path.join(ROOTFS, d, x)).filter(x => fs.existsSync(x)) }))];
}
/** Folders icons may be served from. */
function iconRoots() {
  return [path.join(PREFIX, 'share'), path.join(HOME, '.local', 'share'), path.join(HOME, '.icons'), '/usr/share', '/usr/local/share',
    ...distros().flatMap(d => [path.join(ROOTFS, d, 'usr', 'share'), path.join(ROOTFS, d, 'opt')])];
}

const SECTION_ORDER = [['Settings', ['Settings', 'DesktopSettings', 'HardwareSettings']], ['Games', ['Game']], ['Development', ['Development', 'IDE']],
  ['Graphics', ['Graphics']], ['Multimedia', ['AudioVideo', 'Audio', 'Video']], ['Office', ['Office']], ['Education', ['Education', 'Science']],
  ['Internet', ['Network', 'WebBrowser', 'Email', 'Chat']], ['System', ['System', 'Monitor', 'PackageManager', 'TerminalEmulator', 'FileManager']],
  ['Accessories', ['Utility', 'Accessories', 'TextEditor']]];
const sectionOf = cats => (SECTION_ORDER.find(([, keys]) => keys.some(k => cats.includes(k))) || ['Other'])[0];

function parseDesktop(text) {
  const e = {}; let inEntry = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { if (inEntry) break; inEntry = line === '[Desktop Entry]'; continue; }
    if (!inEntry) continue;
    const i = line.indexOf('='); if (i < 0) continue;
    const k = line.slice(0, i).trim(); if (!(k in e)) e[k] = line.slice(i + 1).trim();
  }
  return e;
}
/** Exec line → shell command: field codes (%f, %U…) removed, %% kept as %. */
const cleanExec = x => x.replace(/%%/g, '\u0000').replace(/\s*%[fFuUdDnNickvm]/g, '').replace(/\u0000/g, '%').trim();
const onPath = (bin, distro) => {
  if (!bin) return false;
  if (bin.startsWith('/')) return fs.existsSync(distro ? path.join(ROOTFS, distro, bin) : bin);
  const dirs = distro ? ['usr/local/sbin', 'usr/local/bin', 'usr/sbin', 'usr/bin', 'sbin', 'bin'].map(d => path.join(ROOTFS, distro, d)) : (process.env.PATH || '').split(':');
  return dirs.some(d => { try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; } });
};

/** Finds icon files for the wanted icon names by walking the icon themes once. */
function resolveIcons(wanted) {
  const found = new Map();   // key "distro|name" -> [score, path]
  const consider = (key, file, score) => { const cur = found.get(key); if (!cur || score > cur[0]) found.set(key, [score, file]); };
  for (const { distro, dirs } of dataDirs()) {
    const names = wanted.get(distro); if (!names || !names.size) continue;
    for (const share of dirs) {
      // pixmaps: flat
      try { for (const f of fs.readdirSync(path.join(share, 'pixmaps'))) { const ext = path.extname(f).toLowerCase(), n = f.slice(0, -ext.length); if (IMG_EXT.includes(ext) && names.has(n)) consider(distro + '|' + n, path.join(share, 'pixmaps', f), ext === '.svg' ? 60 : 50); } } catch {}
      // icon themes: icons/<theme>/<size>/<context>/<name>.<ext> (or <context>/<size>)
      let themes = [];
      try { themes = fs.readdirSync(path.join(share, 'icons')); } catch {}
      const walk = (dir, depth, theme) => {
        let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const d of list) {
          const p = path.join(dir, d.name);
          if (d.isDirectory()) { if (depth < 3) walk(p, depth + 1, theme); continue; }
          const ext = path.extname(d.name).toLowerCase(); if (!IMG_EXT.includes(ext)) continue;
          const n = d.name.slice(0, -ext.length); if (!names.has(n)) continue;
          const m = /\/(\d+)x\d+(?:@\d)?\//.exec(p) || /\/(\d+)(?:@\d)?\//.exec(p);
          const size = ext === '.svg' ? 256 : m ? +m[1] : 48;
          let score = (size >= 64 ? 400 - Math.abs(size - 128) : size) + (ext === '.svg' && !/symbolic/.test(p) ? 120 : 0);
          if (/symbolic/.test(p)) score -= 300;
          if (theme === 'hicolor') score += 40;
          if (/\/apps\//.test(p)) score += 20;
          consider(distro + '|' + n, p, score);
        }
      };
      for (const t of themes) walk(path.join(share, 'icons', t), 0, t);
    }
  }
  return found;
}

let scanCache = null;
/** Every installed app with a .desktop file, from Termux/the host and every proot-distro. Cached for 20 s. */
export function scanApps(force = false) {
  if (!force && scanCache && Date.now() - scanCache.at < 20000) return scanCache.data;
  const apps = [], seen = new Set(), wanted = new Map();
  for (const { distro, dirs } of dataDirs()) {
    for (const share of dirs) {
      const appDir = path.join(share, 'applications');
      const files = [];
      const walk = (d, depth) => { let l; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of l) { if (x.isDirectory() && depth < 2) walk(path.join(d, x.name), depth + 1); else if (x.name.endsWith('.desktop')) files.push(path.join(d, x.name)); } };
      walk(appDir, 0);
      for (const file of files) {
        const fileId = path.relative(appDir, file).replace(/\//g, '-');
        const key = distro + '|' + fileId;
        if (seen.has(key)) continue;   // the first data dir wins (~/.local overrides system files)
        seen.add(key);
        let e; try { e = parseDesktop(fs.readFileSync(file, 'utf8')); } catch { continue; }
        if ((e.Type || 'Application') !== 'Application' || !e.Exec || !e.Name || e.Hidden === 'true') continue;
        const exec = cleanExec(e.Exec);
        const bin = (exec.match(/^\s*(?:env\s+(?:\S+=\S+\s+)*)?("[^"]+"|\S+)/) || [])[1]?.replace(/"/g, '');
        if (e.TryExec && !onPath(e.TryExec, distro)) continue;
        const cats = (e.Categories || '').split(';').filter(Boolean);
        let icon = e.Icon || '';
        if (icon && !icon.startsWith('/')) { if (!wanted.has(distro)) wanted.set(distro, new Set()); wanted.get(distro).add(icon.replace(/\.(png|svg|xpm)$/i, '')); }
        else if (icon && distro) icon = path.join(ROOTFS, distro, icon);
        apps.push({
          id: (distro ? distro + ':' : '') + fileId.replace(/\.desktop$/, ''), name: e.Name, generic: e.GenericName || '', comment: e.Comment || '',
          exec, terminal: e.Terminal === 'true', cats, section: sectionOf(cats), keywords: (e.Keywords || '').replace(/;/g, ' ').trim(),
          hidden: e.NoDisplay === 'true' || (!!e.OnlyShowIn && !/XFCE|LXDE|LXQt|GNOME|KDE|MATE/i.test(e.OnlyShowIn)),
          installed: bin ? onPath(bin, distro) : true, distro, iconName: icon, file
        });
      }
    }
  }
  const icons = resolveIcons(wanted);
  for (const a of apps) {
    const name = a.iconName;
    let p = '';
    if (name.startsWith('/')) p = IMG_EXT.includes(path.extname(name).toLowerCase()) && fs.existsSync(name) ? name : '';
    else if (name) p = (icons.get(a.distro + '|' + name.replace(/\.(png|svg|xpm)$/i, '')) || [])[1] || '';
    a.icon = p; delete a.iconName;
  }
  apps.sort((x, y) => x.name.localeCompare(y.name));
  const data = { apps, distros: distros(), at: Date.now() };
  scanCache = { at: Date.now(), data };
  return data;
}

/** Is this an icon file we may serve? (an image inside one of the icon/share folders, after resolving links) */
export function iconFileOk(p) {
  try {
    const real = fs.realpathSync(p);
    if (!IMG_EXT.includes(path.extname(real).toLowerCase()) || !fs.statSync(real).isFile()) return null;
    return iconRoots().some(r => { try { const rr = fs.realpathSync(r); return real.startsWith(rr + path.sep); } catch { return false; } }) ? real : null;
  } catch { return null; }
}

/* ===================== System info for the System Monitor app ===================== */
const readFile = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
let lastCpu = null;
export function sysInfo() {
  const mem = Object.fromEntries(readFile('/proc/meminfo').split('\n').map(l => l.split(':')).filter(x => x.length === 2).map(([k, v]) => [k.trim(), parseInt(v, 10) * 1024]));
  let disk = null;
  try { const s = fs.statfsSync(HOME); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch {}
  // CPU usage of this user's processes between two calls (Android hides the system-wide counters).
  const pageKb = 4, hz = 100, procs = [];
  let totalTicks = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const stat = readFile(`/proc/${d}/stat`); if (!stat) continue;
    const r = stat.lastIndexOf(')'), comm = stat.slice(stat.indexOf('(') + 1, r), f = stat.slice(r + 2).split(' ');
    const ticks = (+f[11]) + (+f[12]); totalTicks += ticks;
    const rss = (+f[21]) * pageKb * 1024;
    const cmd = readFile(`/proc/${d}/cmdline`).replace(/\0/g, ' ').trim();
    procs.push({ pid: +d, name: comm, cmd: cmd.slice(0, 160), rss, ticks, state: f[0], start: +f[19] / hz });
  }
  const now = Date.now(), prev = lastCpu; lastCpu = { now, map: new Map(procs.map(p => [p.pid, p.ticks])) };
  for (const p of procs) {
    const before = prev && prev.map.get(p.pid);
    p.cpu = prev && before != null ? Math.max(0, ((p.ticks - before) / hz) / ((now - prev.now) / 1000) * 100) : 0;
    delete p.ticks;
  }
  procs.sort((a, b) => b.cpu - a.cpu || b.rss - a.rss);
  return {
    host: os.hostname(), kernel: os.release(), arch: os.arch(), platform: process.env.PREFIX ? 'Android (Termux)' : os.platform(),
    uptime: os.uptime(), load: os.loadavg(), cpus: os.cpus().length, cpuModel: (os.cpus()[0] || {}).model || '',
    mem: { total: mem.MemTotal || os.totalmem(), available: mem.MemAvailable || os.freemem(), swapTotal: mem.SwapTotal || 0, swapFree: mem.SwapFree || 0 },
    disk, procs: procs.slice(0, 40), procCount: procs.length, distros: distros(), node: process.version
  };
}
