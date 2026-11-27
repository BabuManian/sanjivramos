// SanjivramOS system app: the installer and the computer's own settings, in SanjivramOS's look.
// Pages: --sj-page=install | wifi | power | display | sound | keyboard | datetime | account | about
// The UI (ui/index.html) talks to this process through preload.js (window.sys).
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pageArg = argv => ((argv.find(a => a.startsWith('--sj-page=')) || '').split('=')[1] || 'install');
const PAGE = pageArg(process.argv);
const TITLES = { install: 'Install SanjivramOS', wifi: 'Wi-Fi', power: 'Power', display: 'Display', sound: 'Sound', keyboard: 'Keyboard', datetime: 'Date & time', account: 'Password & sign-in', about: 'About this computer' };
const SIZES = { install: [980, 680], wifi: [520, 640], power: [520, 360], display: [680, 640], sound: [600, 600], keyboard: [560, 520], datetime: [560, 520], account: [560, 560], about: [600, 640] };
const LIVE = (() => { try { return /\bboot=casper\b/.test(fs.readFileSync('/proc/cmdline', 'utf8')); } catch { return false; } })();
const ADMIN = '/usr/lib/sanjivramos/system/sjos-admin';

app.setName('SanjivramOS System');
if (!app.requestSingleInstanceLock({ page: PAGE })) { app.quit(); return; }

let win, installing = false;
app.on('second-instance', (_e, argv) => {
  if (!win) return;
  const p = pageArg(argv);
  if (!installing && p !== currentPage && TITLES[p]) open(p);
  win.show(); win.focus();
});

let currentPage = TITLES[PAGE] ? PAGE : 'install';
function open(page) {
  currentPage = TITLES[page] ? page : 'install';
  const [w, h] = SIZES[currentPage];
  win.setTitle(TITLES[currentPage]);
  win.setMinimumSize(Math.min(w, 480), Math.min(h, 340));
  win.setSize(w, h); win.center();
  win.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: { page: currentPage, live: LIVE ? '1' : '0' } });
}

app.whenReady().then(() => {
  const [w, h] = SIZES[currentPage];
  win = new BrowserWindow({
    width: w, height: h, title: TITLES[currentPage], backgroundColor: '#1b1a19', autoHideMenuBar: true, show: false,
    icon: '/usr/share/sanjivramos/logo.png',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.setMenu(null);
  win.on('page-title-updated', e => e.preventDefault());
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('close', e => {
    if (!installing) return;
    e.preventDefault();
    dialog.showMessageBox(win, { type: 'warning', message: 'SanjivramOS is being installed', detail: 'Please wait until it finishes. Closing now could leave the disk unusable.', buttons: ['Keep installing'] });
  });
  open(currentPage);
});
app.on('window-all-closed', () => app.quit());

/* ---------------- helpers ---------------- */
const run = (cmd, args, opts = {}) => new Promise(resolve => {
  const { input, ...o } = opts;
  const child = execFile(cmd, args, { timeout: 45000, maxBuffer: 16 << 20, ...o }, (err, stdout, stderr) =>
    resolve({ ok: !err, code: err ? err.code : 0, out: String(stdout || ''), err: String(stderr || (err && err.message) || '').trim() }));
  if (input !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(input); }
});
const has = bin => ['/usr/bin/', '/usr/sbin/', '/bin/', '/sbin/', '/usr/local/bin/'].some(d => { try { fs.accessSync(d + bin, fs.constants.X_OK); return true; } catch { return false; } });
// The desktop session's environment (Wayland or X11), written by the session scripts.
const sessionEnv = () => {
  const env = {};
  try {
    const f = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, 'sanjivramos-session.env');
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l); if (m) env[m[1]] = m[2]; }
  } catch {}
  return env;
};
const SESSION = () => { const e = sessionEnv(); return { wayland: (e.SJ_SESSION || (process.env.WAYLAND_DISPLAY ? 'wayland' : 'x11')) === 'wayland', env: { ...process.env, ...e } }; };
// The settings helper (as root, via sudo; see sjos-admin). Returns {ok, err}.
const admin = async (what, data) => {
  const r = await run('sudo', ['-n', ADMIN, what], { input: JSON.stringify(data || {}), timeout: 30000 });
  try { const j = JSON.parse(r.out.trim().split('\n').pop()); if (typeof j.ok === 'boolean') return j; } catch {}
  if (/password is required|a terminal is required|not allowed|may not run/i.test(r.err)) return { ok: false, err: 'Only an administrator can change this.' };
  return { ok: r.ok, err: r.err || 'That didn’t work.' };
};
// nmcli -t output: fields separated by ':', with ':' and '\' inside values escaped by '\'.
const nmSplit = line => { const f = []; let cur = '', esc = false; for (const ch of line) { if (esc) { cur += ch; esc = false; } else if (ch === '\\') esc = true; else if (ch === ':') { f.push(cur); cur = ''; } else cur += ch; } f.push(cur); return f; };
const readFile = (f, d = '') => { try { return fs.readFileSync(f, 'utf8'); } catch { return d; } };

/* ---------------- general ---------------- */
ipcMain.handle('sys:info', () => ({ page: currentPage, live: LIVE, uefi: fs.existsSync('/sys/firmware/efi'), user: os.userInfo().username }));
ipcMain.handle('sys:close', () => { if (!installing) win.close(); });
ipcMain.handle('sys:open', (_e, page) => { if (!installing && TITLES[page]) open(page); });
ipcMain.handle('sys:power', async (_e, what) => {
  const act = { off: 'poweroff', restart: 'reboot', sleep: 'suspend', firmware: 'reboot' }[what];
  if (!act) return { ok: false, err: 'Unknown action' };
  if (what === 'firmware') return run('systemctl', ['reboot', '--firmware-setup']);
  return run('systemctl', [act]);
});

/* ---------------- installer ---------------- */
// A readable disk name: "Samsung SSD 980", not a raw vendor ID like "0x1af4".
const diskName = d => {
  const parts = [d.vendor, d.model].map(x => String(x || '').trim()).filter(x => x && !/^0x[0-9a-f]+$/i.test(x) && !/^ata$/i.test(x));
  const name = [...new Set(parts)].join(' ').replace(/\s+/g, ' ').trim();
  if (name) return name;
  const t = String(d.tran || '').toLowerCase();
  return /\/vd[a-z]+$/.test(d.name) ? 'Virtual disk' : t === 'nvme' ? 'NVMe SSD' : t === 'usb' ? 'USB drive' : t === 'mmc' ? 'Memory card' : 'Disk';
};
// Every disk SanjivramOS could be installed on (not the USB stick it's running from, not RAM disks or CD drives).
ipcMain.handle('install:disks', async () => {
  const r = await run('lsblk', ['-J', '-b', '-p', '-o', 'NAME,SIZE,MODEL,VENDOR,TRAN,TYPE,RM,RO,MOUNTPOINTS,LABEL,FSTYPE']);
  if (!r.ok) return { ok: false, err: r.err };
  const live = /\/(cdrom|isodevice)$|^\/run\/(live|casper)/;
  const mounts = d => [...(d.mountpoints || []), ...(d.children || []).flatMap(mounts)].filter(Boolean);
  const osName = c => /^(ntfs|BitLocker)$/i.test(c.fstype || '') ? 'Windows' : /^(EFI|SYSTEM|ESP)$/i.test(c.label || '') ? '' : c.label || '';
  const disks = (JSON.parse(r.out).blockdevices || [])
    .filter(d => d.type === 'disk' && !d.ro && !/\/(zram|loop|ram|sr)\d/.test(d.name))
    .filter(d => !mounts(d).some(m => live.test(m)))
    .map(d => ({
      path: d.name, size: +d.size, model: diskName(d),
      tran: (d.tran || '').toLowerCase(), removable: d.rm === true || d.rm === '1',
      parts: (d.children || []).map(c => ({ path: c.name, size: +c.size, label: osName(c), fstype: c.fstype || '' })),
    }));
  return { ok: true, disks, ram: os.totalmem() };
});

ipcMain.handle('install:start', (_e, cfg) => new Promise(resolve => {
  if (installing) return resolve({ ok: false, err: 'Already installing' });
  installing = true;
  const child = spawn('sudo', ['-n', '/usr/lib/sanjivramos/system/sjos-install'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', error = '';
  const tail = [];
  const keep = l => { tail.push(l); if (tail.length > 60) tail.shift(); };
  child.stdout.on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      keep(line);
      let m;
      if ((m = /^PROGRESS (\d+) (.*)$/.exec(line))) win.webContents.send('install:progress', { pct: +m[1], text: m[2] });
      else if ((m = /^ERROR (.*)$/.exec(line))) error = m[1];
      else win.webContents.send('install:log', line);
    }
  });
  child.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => { keep(l); win.webContents.send('install:log', l); }));
  child.on('error', err => { installing = false; resolve({ ok: false, err: err.message, tail }); });
  child.on('exit', code => {
    installing = false;
    resolve(code === 0 ? { ok: true } : { ok: false, err: error || `The installer stopped (code ${code}).`, tail });
  });
  child.stdin.end(JSON.stringify(cfg));
}));

/* ---------------- Wi-Fi ---------------- */
const wifiDev = async () => {
  const r = await run('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
  return r.out.split('\n').filter(Boolean).map(nmSplit).map(([device, type, state, connection]) => ({ device, type, state, connection }));
};
ipcMain.handle('wifi:state', async () => {
  const radio = await run('nmcli', ['-t', 'radio', 'wifi']);
  const devices = await wifiDev();
  const conn = await run('nmcli', ['-t', 'networking', 'connectivity']);
  return { ok: radio.ok, enabled: radio.out.trim() === 'enabled', hasWifi: devices.some(d => d.type === 'wifi'), devices, online: /^full/.test(conn.out.trim()), connectivity: conn.out.trim(), err: radio.err };
});
ipcMain.handle('wifi:saved', async () => ({ ok: true, names: (await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show'])).out.split('\n').map(nmSplit).filter(([, t]) => /wireless/.test(t || '')).map(([n]) => n) }));
ipcMain.handle('wifi:list', async (_e, rescan) => {
  const r = await run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', rescan ? 'yes' : 'auto']);
  if (!r.ok) return { ok: false, err: r.err.replace(/^Error:\s*/, ''), nets: [] };
  const best = new Map();
  for (const [inUse, ssid, signal, security] of r.out.split('\n').filter(Boolean).map(nmSplit)) {
    if (!ssid) continue;
    const n = { ssid, signal: +signal || 0, secure: !!security && security !== '--', security, enterprise: /802\.1X|EAP/i.test(security || ''), active: inUse === '*' };
    const o = best.get(ssid);
    if (!o || n.active || (!o.active && n.signal > o.signal)) best.set(ssid, n);
  }
  return { ok: true, nets: [...best.values()].sort((a, b) => b.active - a.active || b.signal - a.signal) };
});
const wrongPw = e => /Secrets were required|no secrets|802-1x|psk: property is invalid|invalid passphrase|key-mgmt.*invalid/i.test(e);
ipcMain.handle('wifi:connect', async (_e, { ssid, password, hidden }) => {
  ssid = String(ssid || ''); password = password ? String(password) : '';
  if (!ssid) return { ok: false, err: 'Type the network name.' };
  const dev = (await wifiDev()).find(d => d.type === 'wifi');
  // A network joined before (saved password): just connect again.
  if (!password) {
    const saved = (await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show'])).out.split('\n').map(nmSplit).some(([n, t]) => n === ssid && /wireless/.test(t || ''));
    if (saved) { const up = await run('nmcli', ['-w', '45', 'connection', 'up', 'id', ssid], { timeout: 60000 }); if (up.ok) return { ok: true }; }
  }
  // An old profile with the same name (maybe with a wrong password) would be reused: start fresh.
  await run('nmcli', ['connection', 'delete', 'id', ssid]);
  const args = ['-w', '45', 'device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  if (dev) args.push('ifname', dev.device);
  if (hidden) args.push('hidden', 'yes');
  let r = await run('nmcli', args, { timeout: 60000 });
  // NetworkManager sometimes can't work out the security type by itself ("key-mgmt: property is missing"): spell it out.
  if (!r.ok && password && /key-mgmt|property is missing/i.test(r.err)) {
    await run('nmcli', ['connection', 'delete', 'id', ssid]);
    const add = ['connection', 'add', 'type', 'wifi', 'con-name', ssid, 'ssid', ssid, 'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', password];
    if (dev) add.splice(4, 0, 'ifname', dev.device);
    if (hidden) add.push('802-11-wireless.hidden', 'yes');
    const a = await run('nmcli', add);
    r = a.ok ? await run('nmcli', ['-w', '45', 'connection', 'up', 'id', ssid], { timeout: 60000 }) : a;
  }
  if (r.ok) return { ok: true };
  await run('nmcli', ['connection', 'delete', 'id', ssid]);   // don't keep a profile that doesn't work
  if (wrongPw(r.err)) return { ok: false, err: password ? 'Wrong password, try again.' : 'This network needs a password.' };
  if (/not authorized|insufficient privileges/i.test(r.err)) return { ok: false, err: 'This account isn’t allowed to change Wi-Fi settings.' };
  if (/No network with SSID/i.test(r.err)) return { ok: false, err: `Couldn’t find “${ssid}”. Move closer or check the name.` };
  if (/timeout|timed out/i.test(r.err)) return { ok: false, err: 'The network didn’t answer. Check the password and try again.' };
  return { ok: false, err: r.err.replace(/^Error:\s*/, '') || 'Couldn’t connect.' };
});
ipcMain.handle('wifi:disconnect', async (_e, ssid) => run('nmcli', ['connection', 'down', 'id', String(ssid)]));
ipcMain.handle('wifi:forget', async (_e, ssid) => run('nmcli', ['connection', 'delete', 'id', String(ssid)]));
ipcMain.handle('wifi:radio', async (_e, on) => run('nmcli', ['radio', 'wifi', on ? 'on' : 'off']));

/* ---------------- Display ---------------- */
const parseXrandr = out => {
  const outputs = []; let cur = null;
  for (const line of out.split('\n')) {
    let m;
    if ((m = /^(\S+) (connected|disconnected)( primary)?(?: (\d+)x(\d+)\+(\d+)\+(\d+))?(?: (normal|left|inverted|right))?/.exec(line))) {
      cur = m[2] === 'connected' ? { name: m[1], description: m[3] ? 'Main screen' : '', enabled: !!m[4], primary: !!m[3], x: +m[6] || 0, y: +m[7] || 0,
        transform: ({ left: '90', inverted: '180', right: '270' })[m[8]] || 'normal', scale: 1, modes: [] } : null;
      if (cur) outputs.push(cur);
    } else if (cur && (m = /^\s+(\d+)x(\d+)i?\s+(.*)$/.exec(line))) {
      const toks = m[3].trim().split(/\s+/);
      for (let i = 0; i < toks.length; i++) {
        const t = /^(\d+\.\d+)(\*?)(\+?)$/.exec(toks[i]); if (!t) continue;
        const pref = !!t[3] || toks[i + 1] === '+';
        cur.modes.push({ width: +m[1], height: +m[2], refresh: +t[1], current: !!t[2], preferred: pref });
      }
    }
  }
  return outputs;
};
const backlight = async () => {
  if (!has('brightnessctl')) return null;
  const r = await run('brightnessctl', ['-m', '-c', 'backlight', 'info']);
  const f = r.ok ? r.out.trim().split('\n')[0].split(',') : [];
  return f.length >= 5 ? { device: f[0], percent: parseInt(f[3], 10) || 0 } : null;
};
const DISPLAY_FILE = () => path.join(os.homedir(), '.config/sanjivramos/display.json');
ipcMain.handle('display:get', async () => {
  const s = SESSION();
  let outputs = [], err = '';
  if (s.wayland) {
    const r = await run('wlr-randr', ['--json'], { env: s.env });
    try {
      outputs = JSON.parse(r.out).map(o => ({ name: o.name, description: [o.make, o.model].filter(x => x && x !== 'Unknown').join(' ') || o.description || '', enabled: o.enabled !== false,
        x: (o.position || {}).x || 0, y: (o.position || {}).y || 0, transform: o.transform || 'normal', scale: +o.scale || 1,
        modes: (o.modes || []).map(m => ({ width: m.width, height: m.height, refresh: Math.round(m.refresh * 1000) / 1000, current: !!m.current, preferred: !!m.preferred })) }));
    } catch { err = r.err || 'Couldn’t read the screen settings.'; }
  } else {
    const r = await run('xrandr', ['--query'], { env: s.env });
    if (r.ok) outputs = parseXrandr(r.out); else err = r.err || 'Couldn’t read the screen settings.';
  }
  return { ok: !err, err, wayland: s.wayland, outputs, backlight: await backlight() };
});
const num = (v, lo, hi) => { v = +v; return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
ipcMain.handle('display:apply', async (_e, o) => {
  const s = SESSION();
  const name = String(o.name || ''); if (!/^[A-Za-z0-9._-]{1,40}$/.test(name)) return { ok: false, err: 'Unknown screen.' };
  const w = num(o.width, 160, 16384), h = num(o.height, 120, 16384), rate = num(o.refresh, 1, 1000), scale = num(o.scale, 0.5, 4) || 1;
  const tr = ['normal', '90', '180', '270'].includes(String(o.transform)) ? String(o.transform) : 'normal';
  const enabled = o.enabled !== false;
  let r;
  if (s.wayland) {
    const a = ['--output', name];
    if (!enabled) a.push('--off'); else {
      a.push('--on');
      if (w && h) a.push('--mode', rate ? `${w}x${h}@${rate}Hz` : `${w}x${h}`);
      a.push('--scale', String(scale), '--transform', tr);
    }
    r = await run('wlr-randr', a, { env: s.env });
  } else {
    const a = ['--output', name];
    if (!enabled) a.push('--off'); else {
      if (w && h) { a.push('--mode', `${w}x${h}`); if (rate) a.push('--rate', String(rate)); } else a.push('--auto');
      a.push('--rotate', ({ 90: 'left', 180: 'inverted', 270: 'right' })[tr] || 'normal');
    }
    r = await run('xrandr', a, { env: s.env });
  }
  if (!r.ok) return { ok: false, err: r.err || 'The screen didn’t accept that.' };
  if (o.save !== false) {
    const f = DISPLAY_FILE(); let all = {};
    try { all = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    all.outputs = all.outputs || {};
    all.outputs[name] = { mode: w && h ? `${w}x${h}` : '', refresh: rate || 0, scale, transform: tr, enabled };
    try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(all, null, 2)); } catch {}
  }
  return { ok: true };
});
ipcMain.handle('display:brightness', async (_e, pct) => {
  const p = num(pct, 1, 100); if (p === null) return { ok: false };
  return run('brightnessctl', ['-q', '-c', 'backlight', 'set', `${Math.round(p)}%`]);
});

/* ---------------- Sound ---------------- */
const pwEnv = () => ({ ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}` });
ipcMain.handle('sound:get', async () => {
  const r = await run('pw-dump', [], { env: pwEnv(), timeout: 15000 });
  let objs = [];
  try { objs = JSON.parse(r.out); } catch { return { ok: false, err: 'The sound system isn’t running.', sinks: [], sources: [] }; }
  let defSink = '', defSource = '';
  for (const o of objs) {
    if (o.type !== 'PipeWire:Interface:Metadata' || !o.props || o.props['metadata.name'] !== 'default') continue;
    for (const m of o.metadata || []) {
      let v = m.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
      const n = v && v.name;
      if (m.key === 'default.audio.sink') defSink = n; if (m.key === 'default.audio.source') defSource = n;
    }
  }
  const nodes = objs.filter(o => o.type === 'PipeWire:Interface:Node' && o.info && o.info.props);
  const pick = cls => nodes.filter(o => o.info.props['media.class'] === cls).map(o => ({ id: o.id, name: o.info.props['node.name'], label: o.info.props['node.description'] || o.info.props['node.nick'] || o.info.props['node.name'] }));
  const sinks = pick('Audio/Sink'), sources = pick('Audio/Source');
  for (const d of [...sinks, ...sources]) {
    const v = await run('wpctl', ['get-volume', String(d.id)], { env: pwEnv() });
    const m = /Volume:\s*([\d.]+)/.exec(v.out);
    d.volume = m ? +m[1] : 1; d.muted = /MUTED/.test(v.out);
    d.default = d.name === defSink || d.name === defSource;
  }
  return { ok: true, sinks, sources };
});
ipcMain.handle('sound:volume', async (_e, id, v) => { const x = num(v, 0, 1.5); if (x === null || !Number.isInteger(+id)) return { ok: false }; return run('wpctl', ['set-volume', String(+id), x.toFixed(2)], { env: pwEnv() }); });
ipcMain.handle('sound:mute', async (_e, id, m) => Number.isInteger(+id) ? run('wpctl', ['set-mute', String(+id), m ? '1' : '0'], { env: pwEnv() }) : { ok: false });
ipcMain.handle('sound:default', async (_e, id) => Number.isInteger(+id) ? run('wpctl', ['set-default', String(+id)], { env: pwEnv() }) : { ok: false });

/* ---------------- Keyboard ---------------- */
const kbFile = () => {
  const t = readFile('/etc/default/keyboard'), g = k => ((new RegExp(`^${k}="?([^"\\n]*)"?`, 'm')).exec(t) || [])[1] || '';
  return { layout: g('XKBLAYOUT') || 'us', variant: g('XKBVARIANT'), options: g('XKBOPTIONS') };
};
ipcMain.handle('keyboard:get', () => ({ ok: true, ...kbFile(), wayland: SESSION().wayland }));
ipcMain.handle('keyboard:set', async (_e, k) => {
  const r = await admin('keyboard', { layout: k.layout, variant: k.variant || '', options: k.options || '' });
  if (!r.ok) return r;
  const now = kbFile(), s = SESSION();
  // Use it right away in the running desktop too.
  if (s.wayland) {
    const dir = path.join(os.homedir(), '.config/labwc'), f = path.join(dir, 'environment');
    let lines = readFile(f).split('\n').filter(l => l && !/^XKB_DEFAULT_(LAYOUT|VARIANT|OPTIONS)=/.test(l));
    lines.push(`XKB_DEFAULT_LAYOUT=${now.layout}`, `XKB_DEFAULT_VARIANT=${now.variant}`, `XKB_DEFAULT_OPTIONS=${now.options}`);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, lines.join('\n') + '\n'); } catch {}
    const pid = +s.env.LABWC_PID; if (pid > 1) { try { process.kill(pid, 'SIGHUP'); } catch {} }
  } else {
    const a = ['-layout', now.layout]; if (now.variant) a.push('-variant', now.variant); a.push('-option', ''); if (now.options) a.push('-option', now.options);
    await run('setxkbmap', a, { env: s.env });
  }
  return { ok: true };
});

/* ---------------- Date & time ---------------- */
ipcMain.handle('datetime:get', async () => {
  const r = await run('timedatectl', ['show']);
  const g = k => ((new RegExp(`^${k}=(.*)$`, 'm')).exec(r.out) || [])[1] || '';
  const zones = (await run('timedatectl', ['list-timezones'])).out.split('\n').filter(Boolean);
  return { ok: true, timezone: g('Timezone') || readFile('/etc/timezone').trim() || 'UTC', ntp: g('NTP') === 'yes', synced: g('NTPSynchronized') === 'yes', canNtp: g('CanNTP') !== 'no', zones, now: Date.now() };
});
ipcMain.handle('datetime:set', async (_e, d) => {
  if (d.timezone) return admin('timezone', { timezone: d.timezone });
  if (typeof d.ntp === 'boolean') return admin('ntp', { on: d.ntp });
  if (d.time) return admin('time', { time: d.time });
  return { ok: false, err: 'Nothing to change.' };
});

/* ---------------- Password & sign-in ---------------- */
ipcMain.handle('account:get', () => {
  const u = os.userInfo(), line = readFile('/etc/passwd').split('\n').find(l => l.split(':')[0] === u.username) || '';
  return { ok: true, username: u.username, name: (line.split(':')[4] || '').split(',')[0] || u.username, lock: !fs.existsSync('/etc/sanjivramos/no-lock'), live: LIVE };
});
ipcMain.handle('account:password', (_e, d) => admin('password', { old: String(d.old || ''), new: String(d.new || '') }));
ipcMain.handle('account:lock', (_e, d) => admin('lock', { on: !!d.on, password: String(d.password || '') }));

/* ---------------- About ---------------- */
ipcMain.handle('about:get', async () => {
  const osr = readFile('/etc/os-release'), og = k => ((new RegExp(`^${k}="?([^"\\n]*)"?`, 'm')).exec(osr) || [])[1] || '';
  const cpu = (/^model name\s*:\s*(.*)$/m.exec(readFile('/proc/cpuinfo')) || [])[1] || os.cpus()[0]?.model || 'Unknown';
  const gpus = (await run('lspci', ['-mm'])).out.split('\n').filter(l => /"(VGA|3D|Display)/.test(l)).map(l => { const f = l.match(/"([^"]*)"/g) || []; return [f[1], f[2]].map(x => (x || '').replace(/"/g, '').replace(/ Corporation| Inc\.|\[AMD\/ATI\]/g, '')).join(' ').trim(); });
  const df = (await run('df', ['-B1', '--output=size,avail', '/'])).out.trim().split('\n').pop().trim().split(/\s+/).map(Number);
  const vendor = readFile('/sys/class/dmi/id/sys_vendor').trim(), product = readFile('/sys/class/dmi/id/product_name').trim();
  const sb = has('mokutil') ? (await run('mokutil', ['--sb-state'])).out : '';
  return {
    ok: true, hostname: os.hostname(), os: `${og('NAME') || 'SanjivramOS'} ${og('VERSION') || ''}`.trim(), kernel: os.release(),
    commit: readFile('/opt/sanjivramos/app/.sj-commit').trim().slice(0, 7), model: [vendor, product].filter(x => x && !/To be filled|System Product Name/i.test(x)).join(' '),
    cpu: cpu.replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' '), cores: os.cpus().length, memory: os.totalmem(), gpus, disk: { size: df[0] || 0, free: df[1] || 0 },
    boot: fs.existsSync('/sys/firmware/efi') ? (/enabled/i.test(sb) ? 'UEFI, Secure Boot on' : 'UEFI') : 'BIOS (legacy)', session: SESSION().wayland ? 'Wayland' : 'X11', uptime: os.uptime(), live: LIVE,
  };
});
ipcMain.handle('about:hostname', (_e, h) => admin('hostname', { hostname: String(h || '') }));
