// SanjivramOS web server: serves the OS, its phone shell, desktop and games.
// Run: npm start   (env: PORT, SITE_PASSWORD,
//                   SANJIVRAM_SHELL=1 to let the Terminal and Linux apps use this machine — from this machine and your own
//                   network only (private/VPN addresses), never through the public tunnel.)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import ipaddr from 'ipaddr.js';
import { handleShell } from './shell.js';
import { handleVnc, handleVncPort } from './vnc.js';
import { handleClaude, claudeAsk, handleDesktopRelay } from './claude.js';
import { slanderAction, serveSlander } from './slander.js';
import { handleVip, chromiumPath } from './vip.js';
import { ttApi } from './tiktok.js';
import { handleFiles } from './files.js';
import { handleRestore } from './restore.js';
import { serveGame, gameRedirect, installedGames, gamesApi } from './games.js';
import { parseSpec, runGui, exportDesktop, removeDesktop, readJson, scanApps, iconFileOk, sysInfo, distros, NATIVE, listXWins, xwinOp, setXMargins } from './linuxapps.js';
import { spawn } from 'node:child_process';
import { ensureDesktop } from './vnc.js';
import { initSocial, handleSocial, socialUpgrade, ipBan, bannedPage, noteVisit, claudeGate, terminalGate } from './social.js';
import { playUpgrade, playApi, startLan } from './play.js';
import { initMaker, makerApi } from './maker.js';
import { ytApi } from './yt.js';
import { initAi, aiApi } from './ai.js';
import https from 'node:https';
import crypto from 'node:crypto';
import { ensureCert } from './tls.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Where the server keeps logs and state. The Termux install uses its own folder; system-wide installs (the Debian
// package in /opt) set SANJIVRAM_DATA to a folder the user can write to.
const DATA = path.resolve(process.env.SANJIVRAM_DATA || ROOT);
const PORT = parseInt(process.env.PORT || '8080', 10);
const PASSWORD = process.env.SITE_PASSWORD || '';
// HTTPS on your own network (self-signed), so other devices can use the camera/microphone (calls, voice messages).
// Port: SJ_HTTPS_PORT (default PORT+1); SJ_HTTPS=0 turns it off.
const HTTPS_PORT = process.env.SJ_HTTPS === '0' ? 0 : parseInt(process.env.SJ_HTTPS_PORT || String(parseInt(process.env.PORT || '8080', 10) + 1), 10);
// Moving to the https address: the http page hands its saved desktop (localStorage) over through a one-time token.
const transfers = new Map();
try { initSocial(DATA); } catch (e) { console.error('[social] off:', e.message); }
try { initMaker(DATA); } catch (e) { console.error('[maker] off:', e.message); }
try { initAi(DATA); } catch (e) { console.error('[ai] off:', e.message); }
// A shell runs any command on this machine, so it's only offered behind a password.
const SHELL_ON = process.env.SANJIVRAM_SHELL === '1';
// Who may use the shell, Linux apps and desktop: this phone and any device on your own network (Wi-Fi, LAN, VPNs such
// as Tailscale/WireGuard/ZeroTier). Never through the public tunnel (Cloudflare connects from 127.0.0.1 but adds cf-* headers).
// GitHub Codespaces forwards every request through its own (GitHub-login) proxy, so nothing ever looks local there.
// SANJIVRAM_TRUST_FORWARD=1 lets forwarded requests use the shell too — but only when a site password is set.
const TRUST_FORWARD = process.env.SANJIVRAM_TRUST_FORWARD === '1' && !!PASSWORD;
const shellOk = req => SHELL_ON && authorized(req) && (TRUST_FORWARD || (!viaTunnel(req) && fromOwnNetwork(req)));

// Text files are sent gzipped (index.html shrinks from ~1.7 MB to ~400 KB); each file is compressed once per change.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/;
const gzCache = new Map();
function gzipped(file, etag, cb) {
  const hit = gzCache.get(file);
  if (hit && hit.etag === etag) { cb(null, hit.buf); return; }
  fs.readFile(file, (err, raw) => {
    if (err) { cb(err); return; }
    zlib.gzip(raw, { level: 6 }, (e, buf) => {
      if (!e) { gzCache.set(file, { etag, buf }); if (gzCache.size > 64) gzCache.delete(gzCache.keys().next().value); }
      cb(e, buf);
    });
  });
}

// One misbehaving connection must never take the whole server down.
process.on('uncaughtException', err => console.error('error:', err.message));
process.on('unhandledRejection', err => console.error('error:', err && err.message));

// Only these files and folders are public; the server code, .git and node_modules never are.
const PUBLIC = [/^\/(index\.html|LICENSE|README\.md|manifest\.webmanifest|offline-sw\.js)$/, /^\/vendor\//, /^\/build\/icon\.png$/];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.oga': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.map': 'application/json', '.md': 'text/markdown; charset=utf-8', '.webmanifest': 'application/manifest+json', '': 'text/plain; charset=utf-8' };

/** Opened in this phone's own browser (http://localhost / 127.0.0.1) — not through the Cloudflare tunnel or any
 *  other proxy, which also connect from 127.0.0.1 but add forwarding headers. Those still need the password.
 *  Turn off with LOCAL_NO_PASSWORD=0. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'cdn-loop', 'via'];
/** Came in through the Cloudflare tunnel (or another forwarding proxy running on this phone). */
const viaTunnel = req => LOOPBACK.has(req.socket.remoteAddress) ? PROXY_HEADERS.some(h => h in req.headers) : ['cf-connecting-ip', 'cf-ray', 'cdn-loop'].some(h => h in req.headers);
/** This phone, or a private/VPN address: 10.x, 172.16–31.x, 192.168.x, 100.64–127.x (Tailscale), fc00::/7, link-local. */
const OWN_RANGES = new Set(['loopback', 'private', 'carrierGradeNat', 'uniqueLocal', 'linkLocal']);
const fromOwnNetwork = req => { try { return OWN_RANGES.has(ipaddr.process(req.socket.remoteAddress || '').range()); } catch { return false; } };
const isLocalBrowser = req => process.env.LOCAL_NO_PASSWORD !== '0'
  && LOOPBACK.has(req.socket.remoteAddress)
  && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '')
  && !PROXY_HEADERS.some(h => h in req.headers);

/** SanjivramOS Linux (the distro sets SANJIVRAM_LOCAL_TERMINAL=1): the person at this computer may use the Terminal without
 *  a SanjivramOS account. It's their own computer and their own Linux user. Other devices still need the owner account. */
const localTerminal = req => process.env.SANJIVRAM_LOCAL_TERMINAL === '1' && isLocalBrowser(req);

/** SanjivramOS Linux: the Linux account SanjivramOS runs as (its full name was typed in the installer), so the first-run setup
 *  can use it instead of asking again. */
const linuxUser = () => {
  try {
    const u = os.userInfo(), line = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find(l => l.split(':')[0] === u.username) || '';
    return { username: u.username, name: (line.split(':')[4] || '').split(',')[0].trim() || u.username };
  } catch { return null; }
};

const authorized = req => {
  if (!PASSWORD || isLocalBrowser(req)) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':');
  return pass === PASSWORD;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  // Banned IP addresses (Messages → Settings → People) get nothing but the "banned" page.
  { const ban = ipBan(req); if (ban) { res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(bannedPage(ban)); return; } }
  noteVisit(req, res);
  // Claude app desktop control: only from this machine, authorised by the per-window token (not the site password).
  if (url.pathname === '/claude-desktop') {
    if (!LOOPBACK.has(req.socket.remoteAddress) || PROXY_HEADERS.some(h => h in req.headers)) { res.writeHead(403); res.end(); return; }
    handleDesktopRelay(req, res, readJson); return;
  }
  if (!authorized(req)) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="SanjivramOS"', 'content-type': 'text/plain' }); res.end('Password required'); return; }
  if (url.pathname === '/os-transfer') { osTransfer(req, res, url); return; }
  // Messages, calls and multiplayer (accounts, conversations, files, room list).
  if (url.pathname.startsWith('/social/')) { handleSocial(req, res, url); return; }
  if (playApi(req, res, url)) return;
  if (url.pathname.startsWith('/maker/api/')) { makerApi(req, res, url); return; }
  if (url.pathname.startsWith('/ai/api/')) { aiApi(req, res, url).catch(e => { if (!res.headersSent) { res.writeHead(500); res.end(e.message); } }); return; }
  // Kushtok (TikTok client): this machine's headless Chromium, own network only.
  if (url.pathname.startsWith('/tt/')) { ttApi(req, res, url, shellOk(req)).catch(e => { if (!res.headersSent) { res.writeHead(500); res.end(e.message); } }); return; }
  if (url.pathname.startsWith('/yt/')) { ytApi(req, res, url).catch(e => { if (!res.headersSent) { res.writeHead(500); res.end(e.message); } }); return; }
  // Files: the native file manager for this machine (and Linux files as wallpapers).
  if (url.pathname.startsWith('/linux-fs/')) { handleFiles(req, res, url, shellOk(req), readJson); return; }
  // Linux apps from the App Store: start a GUI app on the desktop, or add/remove an app in the Linux desktop's menus.
  // OS restore points (sanjsh "restore", or the /os-restore/ page).
  if (handleRestore(req, res, url, shellOk(req), ROOT, readJson)) return;
  if (url.pathname.startsWith('/linux-app/')) { linuxApp(req, res, url.pathname.slice(11)); return; }
  // Slander Studio clips (downloaded with yt-dlp on this machine).
  if (url.pathname.startsWith('/slander-audio/')) { if (!shellOk(req)) { res.writeHead(403); res.end(); return; } serveSlander(req, res, url.pathname.slice(15)); return; }
  // Icons of installed Linux apps (only image files inside the system's icon folders).
  if (url.pathname === '/linux-icon') {
    const f = shellOk(req) && iconFileOk(url.searchParams.get('p') || '');
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
    fs.createReadStream(f).pipe(res);
    return;
  }
  if (url.pathname === '/sanjivram-server.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ app: 'SanjivramOS', httpsPort: HTTPS_PORT && httpsUp ? HTTPS_PORT : 0, native: NATIVE && shellOk(req) && isLocalBrowser(req), localTerminal: shellOk(req) && localTerminal(req), linuxUser: NATIVE && isLocalBrowser(req) ? linuxUser() : null, shell: shellOk(req), claude: shellOk(req), slander: shellOk(req), vip: shellOk(req) && !!chromiumPath(), files: shellOk(req), desktop: shellOk(req), linuxApps: shellOk(req), android: shellOk(req), games: installedGames() }));
    return;
  }
  if (gamesApi(req, res, url)) return;
  if (serveGame(req, res, url)) return;
  // A game's link to "its" home page must not open SanjivramOS inside the game.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const to = gameRedirect(req, url);
    if (to) { res.writeHead(302, { location: to }); res.end(); return; }
  }
  if (url.pathname === '/phone-size') {
    // Written by desktop.sh when scrcpy connects, e.g. "1080x2400".
    const m = shellOk(req) && /^(\d+)x(\d+)/.exec((() => { try { return fs.readFileSync(path.join(DATA, '.phone-size'), 'utf8'); } catch { return ''; } })());
    res.writeHead(m ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(m ? JSON.stringify({ width: +m[1], height: +m[2] }) : '{}');
    return;
  }
  if (url.pathname === '/phone-battery') {
    // The phone's own battery (the one SanjivramOS runs on), not the viewing browser's.
    const rd = f => { try { return fs.readFileSync('/sys/class/power_supply/battery/' + f, 'utf8').trim(); } catch { return ''; } };
    const cap = parseInt(rd('capacity'), 10), status = rd('status'), temp = parseInt(rd('temp'), 10);
    const ok = cap >= 0 && cap <= 100;
    res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(ok ? JSON.stringify({ level: cap / 100, charging: /charging|full/i.test(status) && !/discharging|not charging/i.test(status), status, temp: isNaN(temp) ? null : temp / 10 }) : '{}');
    return;
  }
  let p;
  try { p = path.posix.normalize(decodeURIComponent(url.pathname)); } catch { res.writeHead(400); res.end(); return; }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p));
  const notFound = () => {
    const to = gameRedirect(req, url);
    if (to) { res.writeHead(302, { location: to }); res.end(); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  };
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.some(r => r.test(p))) { notFound(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { notFound(); return; }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = {
      'content-type': type,
      'cache-control': /^\/vendor\//.test(p) && !/\.(json|html)$/.test(p) ? 'public, max-age=86400' : 'no-cache',
      'x-content-type-options': 'nosniff',
      etag,
      vary: 'Accept-Encoding'
    };
    // Unchanged since the browser's copy: answer "304 Not Modified" instead of resending (index.html is ~1.7 MB).
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    const gz = COMPRESSIBLE.test(type) && st.size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (!gz) {
      res.writeHead(200, Object.assign(head, { 'content-length': st.size }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
      return;
    }
    gzipped(file, etag, (e, buf) => {
      if (e) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, Object.assign(head, { 'content-encoding': 'gzip', 'content-length': buf.length }));
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
});

async function linuxApp(req, res, action) {
  const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  // Runs commands on this machine, so: shell switched on, POSTed as JSON (no plain cross-site forms) from this site only.
  let sameSite = false;
  try { sameSite = new URL(req.headers.origin).host === req.headers.host; } catch {}
  if (!SHELL_ON) return reply(403, { error: 'The phone shell is off. In Termux: sanjivramos shell on, then sanjivramos restart.' });
  if (!shellOk(req)) return reply(403, { error: 'Linux apps and the Terminal are turned off on the public tunnel link. Use them on your own network.' });
  if (req.method !== 'POST' || !sameSite || !/^application\/json/.test(req.headers['content-type'] || '')) return reply(403, { error: 'Forbidden' });
  let body;
  try { body = await readJson(req); } catch { return reply(400, { error: 'Bad request' }); }
  try {
    if (action === 'claude-ask') { const why = claudeGate(req); if (why) return reply(403, { error: why }); return claudeAsk(body, res); }
    if (action.startsWith('slander-') && await slanderAction(action, body, reply)) return;
    if (action === 'remove') { removeDesktop(String(body.id || '')); return reply(200, { ok: true }); }
    if (action === 'scan') return reply(200, scanApps(!!body.force));
    if (action === 'sysinfo') return reply(200, sysInfo());
    if (action === 'distros') return reply(200, { distros: distros() });
    if (action === 'xwins') return reply(200, await listXWins());
    if (action === 'xwin') return reply(200, await xwinOp(String(body.id || ''), String(body.op || '')));
    if (action === 'xmargins') return reply(200, await setXMargins(body || {}));
    if (action === 'kill') {
      const pid = body.pid | 0, sig = ['SIGTERM', 'SIGKILL', 'SIGSTOP', 'SIGCONT'].includes(body.signal) ? body.signal : 'SIGTERM';
      if (pid <= 1 || pid === process.pid) return reply(400, { error: 'Not allowed' });
      try { process.kill(pid, sig); return reply(200, { ok: true }); } catch (err) { return reply(400, { error: err.code === 'EPERM' ? 'Not allowed to stop that process' : 'No such process' }); }
    }
    if (action === 'desktop') {
      const cmd = process.env.SANJIVRAM_DESKTOP_CMD, a = ['start', 'stop', 'restart', 'fluxbox', 'xfce', 'apps-start', 'apps-stop'].includes(body.action) ? body.action : null;
      if (!cmd || !a) return reply(400, { error: 'The desktop launcher isn’t set up (run sanjivramos install).' });
      spawn(cmd, [a], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
      return reply(200, { ok: true });
    }
    const spec = parseSpec(body);
    if (!spec) return reply(400, { error: 'The app needs a command.' });
    if (action === 'export') return reply(200, { ok: true, file: exportDesktop(spec, String(body.id || ''), body.icon) });
    if (action === 'run') {
      if (!NATIVE && !(await ensureDesktop())) return reply(500, { error: "The apps display didn't start. In Termux run: sanjivramos desktop apps-start" });
      return reply(200, await runGui(spec, path.join(DATA, 'linux-apps.log')));
    }
    reply(404, { error: 'Not found' });
  } catch (err) { reply(500, { error: err.message }); }
}

server.on('upgrade', (req, socket, head) => {
  if (ipBan(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  noteVisit(req);
  const url = new URL(req.url, 'http://x');
  // noVNC resolves its "vnc" path next to its page when no host is set, so accept that address too.
  const vnc = { '/vnc': 'desktop', '/vendor/novnc17/vnc': 'desktop', '/vendor/novnc17/scrcpy': 'scrcpy', '/vendor/novnc17/firefox': 'firefox', '/vendor/novnc17/apps': 'apps' }[url.pathname];
  if (url.pathname === '/social' || url.pathname === '/play') {
    // Open to anyone allowed on this site (not only the own network), but only from this site's own pages.
    let same = false;
    try { same = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!authorized(req) || !same) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (url.pathname === '/social') socialUpgrade(req, socket, head); else playUpgrade(req, socket, head);
    return;
  }
  if (url.pathname === '/shell' || url.pathname === '/claude' || url.pathname === '/vip' || vnc) {
    // Browsers resend saved passwords to WebSockets opened by any website, so also require it to come from this site.
    let sameSite = false;
    try { sameSite = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!shellOk(req) || !sameSite) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (url.pathname === '/shell' && !localTerminal(req) && terminalGate(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }   // terminal: owner account only (or the person at a SanjivramOS Linux computer)
    if (url.pathname === '/claude' && claudeGate(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }   // needs a Messages account
    if (vnc) handleVnc(req, socket, head, vnc); else if (url.pathname === '/claude') handleClaude(req, socket, head); else if (url.pathname === '/vip') handleVip(req, socket, head); else handleShell(req, socket, head);
    return;
  }
  socket.end();
});

let httpsUp = false;
function osTransfer(req, res, url) {
  const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
  for (const [k, v] of transfers) if (Date.now() - v.t > 5 * 60e3) transfers.delete(k);
  if (req.method === 'POST') {
    let same = false; try { same = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!same) return send(403, { error: 'Cross-site request refused' });
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 40e6) req.destroy(); else parts.push(c); });
    req.on('end', () => { if (transfers.size > 20) return send(429, { error: 'Busy' }); const token = crypto.randomBytes(24).toString('hex'); transfers.set(token, { t: Date.now(), data: Buffer.concat(parts) }); send(200, { token }); });
    return;
  }
  const t = transfers.get(String(url.searchParams.get('t') || ''));
  if (!t) return send(404, { error: 'Expired' });
  transfers.delete(url.searchParams.get('t'));
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(t.data);
}
server.listen(PORT, '0.0.0.0', () => {
  startLan(PORT);
  if (HTTPS_PORT) {
    try {
      const tls = ensureCert(DATA);
      const sec = https.createServer({ key: tls.key, cert: tls.cert });
      for (const f of server.listeners('request')) sec.on('request', f);
      for (const f of server.listeners('upgrade')) sec.on('upgrade', f);
      sec.on('error', e => console.error('[https] off:', e.message));
      sec.listen(HTTPS_PORT, '0.0.0.0', () => { httpsUp = true; console.log(`Secure (for calls on other devices): ${tls.ips.map(ip => `https://${ip}:${HTTPS_PORT}/`).join('  ')}  — self-signed: accept the warning once`); });
    } catch (e) { console.error('[https] off:', e.message); }
  }
  console.log(`SanjivramOS is running on http://localhost:${PORT}${PASSWORD ? ' (password protected)' : ''}`);
  if (SHELL_ON && TRUST_FORWARD) console.log('Shell: on for anyone with the site password (SANJIVRAM_TRUST_FORWARD)');
  else if (SHELL_ON) console.log('Phone shell and desktop: on (Terminal and Linux apps) — this phone and your own network only, never the tunnel');
  if (process.env.CODESPACE_NAME) console.log(`Codespace address: https://${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}/`);
});
const stop = () => { server.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
