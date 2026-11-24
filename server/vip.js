// VIP Browser: a real Chromium running headless on this machine — no web proxy, no X server, no Fluxbox/XFCE.
// Pages are streamed to the browser window as JPEG frames (DevTools screencast) and clicks/keys are sent back.
// Chromium is driven over a private pipe (--remote-debugging-pipe), so no debugging port is ever opened.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { extInit, extList, extFlags, extInstall, extRemove, extSetEnabled } from './vipext.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.SANJIVRAM_DATA || ROOT);
const PROFILE = path.join(DATA, '.vip-profile');
extInit(DATA);
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 8 * 1024 * 1024 });
const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; } };
let BIN;
export function chromiumPath() {
  if (BIN !== undefined) return BIN;
  BIN = [process.env.SANJIVRAM_CHROMIUM, 'chromium-browser', 'chromium', 'google-chrome-stable', 'google-chrome'].filter(Boolean).find(has) || null;
  return BIN;
}

// Ads and trackers blocked when "Block ads" is on (DevTools URL patterns).
const ADS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'pagead2.googlesyndication.com', 'adnxs.com', 'taboola.com', 'outbrain.com', 'criteo.com', 'criteo.net', 'amazon-adsystem.com',
  'scorecardresearch.com', 'quantserve.com', 'moatads.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'adsrvr.org', 'casalemedia.com',
  'facebook.net/tr', 'connect.facebook.net', 'hotjar.com', 'popads.net', 'propellerads.com', 'adcash.com', 'exoclick.com', 'mgid.com', 'zedo.com',
  'yieldmo.com', 'smartadserver.com', 'teads.tv', 'media.net', 'bidswitch.net', '33across.com', 'sharethrough.com', 'adform.net', 'serving-sys.com']
  .flatMap(d => [`*://*.${d}/*`, `*://${d}/*`]);

/* ---------- people (browser profiles) ----------
   Each person gets their own Chromium with its own folder: their own sign-ins, cookies and history, and several people
   can browse at the same time. "main" is the original .vip-profile. Guests get a throwaway folder per window. */
const PROFILES_DIR = path.join(DATA, '.vip-profiles');
const PFILE = path.join(PROFILES_DIR, 'profiles.json');
const PCOLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];
// Every Chromium uses a few hundred MB, so cap how many run at once on the phone (SANJIVRAM_BROWSER_MAX).
const MAX_CHROMES = Math.max(1, Math.min(12, +process.env.SANJIVRAM_BROWSER_MAX || 4));
function profiles() {
  let l = []; try { l = JSON.parse(fs.readFileSync(PFILE, 'utf8')).filter(p => p && /^[a-z0-9-]{1,40}$/.test(p.id)); } catch {}
  if (!l.some(p => p.id === 'main')) l.unshift({ id: 'main', name: 'Me', color: PCOLORS[0] });
  return l;
}
const saveProfiles = l => { fs.mkdirSync(PROFILES_DIR, { recursive: true }); fs.writeFileSync(PFILE, JSON.stringify(l, null, 1), { mode: 0o600 }); };
const profileDir = id => id === 'main' ? PROFILE : path.join(PROFILES_DIR, id);
// What the phone shows about a person. Never the salt or password hash.
const publicP = p => ({ id: p.id, name: p.name, color: p.color, user: p.user || '', hasLogin: !!p.hash });
function profileList() {
  return profiles().map(p => ({ ...publicP(p), running: chromes.has(p.id), windows: chromes.has(p.id) ? chromes.get(p.id).sessions.size : 0 }));
}

/* ---------- logins: every saved person has a username and a password ----------
   Passwords are stored as scrypt hashes and checked here on the server, so a window can't skip the sign-in. */
const USER_RE = /^[a-z0-9_.-]{3,24}$/;
const cleanName = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 30);
const cleanUser = v => { const u = String(v || '').trim().toLowerCase(); if (!USER_RE.test(u)) throw new Error('Usernames are 3–24 letters, numbers, dots, dashes or underscores'); return u; };
const checkNewPass = pw => { if (String(pw || '').length < 6) throw new Error('Passwords need at least 6 characters'); };
const takenUser = (u, selfId) => { if (profiles().some(x => x.user === u && x.id !== selfId)) throw new Error('That username is taken'); };
function setPass(p, pw) { p.salt = crypto.randomBytes(16).toString('hex'); p.hash = crypto.scryptSync(String(pw), p.salt, 32).toString('hex'); }
function passOk(p, pw) {
  const h = crypto.scryptSync(String(pw || ''), p.salt, 32), want = Buffer.from(p.hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
// Five wrong tries in a row lock a person for a minute (in memory; a restart clears it).
const fails = new Map();
// Returns '' when the username and password are right, otherwise the reason.
function login(p, user, pw) {
  const f = fails.get(p.id) || { n: 0, until: 0 };
  if (f.until > Date.now()) return `Too many wrong tries — wait ${Math.ceil((f.until - Date.now()) / 1000)} seconds.`;
  if (p.hash && String(user || '').trim().toLowerCase() === p.user && passOk(p, pw)) { fails.delete(p.id); return ''; }
  if (++f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; }
  fails.set(p.id, f);
  return 'Wrong username or password.';
}
function allSessions() { const s = []; for (const c of chromes.values()) s.push(...c.sessions); return s.concat([...choosing]); }

/* ---------- one Chromium per person ---------- */
const chromes = new Map();  // profile key → { proc, call(method, params, sessionId), ua, sessions, idleT, key }
const choosing = new Set(); // windows still choosing who's browsing

function launch(key, dir, temp = false) {
  const have = chromes.get(key);
  // A browser that's shutting down still holds its folder: wait for it instead of attaching to it.
  if (have && have.dying) return Promise.reject(new Error('That browser is still closing — try again in a moment.'));
  if (have) { clearTimeout(have.idleT); return have.ready; }
  if (chromes.size >= MAX_CHROMES) return Promise.reject(new Error(`${MAX_CHROMES} people are already browsing — that's the most this phone runs at once. Close a browser window, or pick a person who's already browsing.`));
  const bin = chromiumPath();
  if (!bin) return Promise.reject(new Error('Chromium isn’t installed. In Termux: pkg install x11-repo && pkg install chromium'));
  const PROFILE = dir;
  fs.mkdirSync(PROFILE, { recursive: true });
  const env = { ...process.env };
  for (const k of ['SITE_PASSWORD', 'DISPLAY', 'WAYLAND_DISPLAY', 'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']) delete env[k];
  const dl = [path.join(os.homedir(), 'storage', 'downloads'), path.join(os.homedir(), 'Downloads')].find(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }) || os.homedir();
  // A crashed Chromium leaves a lock behind that stops the next start.
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(PROFILE, f)); } catch {} }
  const proc = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--remote-debugging-pipe', `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--mute-audio', '--disable-features=Translate,MediaRouter',
    '--window-size=1280,800', '--password-store=basic',
    // Render at 2x pixel density so text is sharp on phone screens. (Headless Chromium's screencast ignores the
    // per-page deviceScaleFactor, so this is the only reliable way; the page scales frames down for "HD off".)
    // Override with SANJIVRAM_BROWSER_SCALE=1 (faster on slow phones) … 3.
    `--force-device-scale-factor=${Math.min(3, Math.max(1, +process.env.SANJIVRAM_BROWSER_SCALE || 2))}`,
    // Keep painting at full speed even though there's no real window on screen.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-ipc-flooding-protection',
    '--disable-smooth-scrolling', '--num-raster-threads=4', ...extFlags(), 'about:blank'], { env, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let id = 0, buf = '';
  const c = { proc, ua: '', dl, key, temp, dir, sessions: new Set(), idleT: null };
  chromes.set(key, c);
  c.call = (method, params = {}, sessionId) => new Promise((res, rej) => {
    if (!proc.stdio[3].writable) return rej(new Error('Chromium stopped'));
    const i = ++id; pending.set(i, { res, rej });
    proc.stdio[3].write(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }) + '\0');
  });
  proc.stdio[4].on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(raw); } catch { continue; }
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }
      else for (const s of c.sessions) { try { s.onEvent(m); } catch (e) { console.error('vip:', e.message); } }
    }
  });
  let errTail = '';
  proc.stderr.on('data', d => { errTail = (errTail + d).slice(-1500); });
  proc.stdio[3].on('error', () => {});
  proc.on('error', err => { for (const p of pending.values()) p.rej(err); });
  proc.on('exit', code => {
    if (chromes.get(key) === c) chromes.delete(key);
    clearTimeout(c.idleT);
    for (const p of pending.values()) p.rej(new Error('Chromium stopped'));
    pending.clear();
    for (const s of [...c.sessions]) s.chromeGone(code, errTail);
    if (temp) setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 500);   // guests leave nothing behind
    for (const s of allSessions()) s.people();
  });
  c.ready = (async () => {
    const v = await c.call('Browser.getVersion');
    c.ua = String(v.userAgent || '').replace('HeadlessChrome', 'Chrome');
    c.version = v.product;
    await c.call('Target.setDiscoverTargets', { discover: true });
    await c.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl, eventsEnabled: true }).catch(() => {});
    return c;
  })();
  c.ready.catch(() => { try { proc.kill('SIGKILL'); } catch {} });
  return c.ready;
}
function maybeStop(c) {
  if (!c) return;
  clearTimeout(c.idleT);
  if (c.sessions.size) return;
  // Free the memory a few minutes after a person's last window closes (straight away for guests).
  c.idleT = setTimeout(() => { if (!c.sessions.size) stopChrome(c); }, c.temp ? 0 : 3 * 60000);
}
function stopChrome(c) { c.dying = true; try { c.proc.kill('SIGTERM'); } catch {} }
// Old guest folders from a crash or restart.
try { for (const n of fs.readdirSync(PROFILES_DIR)) if (n.startsWith('guest-')) fs.rmSync(path.join(PROFILES_DIR, n), { recursive: true, force: true }); } catch {}

// Local start pages (Mynt etc.): file://~/x → the home folder; a folder → its index.html.
function fixUrl(u) {
  u = String(u || '');
  if (!/^file:\/\//i.test(u)) return u;
  let p = decodeURIComponent(u.slice(7).replace(/[?#].*$/, '')).replace(/^~(?=\/|$)/, os.homedir());
  try { if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html'); } catch {}
  return 'file://' + encodeURI(p) + (u.match(/[?#].*$/) || [''])[0];
}
// Client hints without "HeadlessChrome" — some sites (DuckDuckGo, Cloudflare checks) block headless browsers.
function uaMeta(ua, mobile) {
  const full = (/Chrome\/([\d.]+)/.exec(ua) || [, '140.0.0.0'])[1], major = full.split('.')[0];
  const brands = [['Chromium', major], ['Google Chrome', major], ['Not=A?Brand', '24']];
  return {
    brands: brands.map(([brand, version]) => ({ brand, version })), fullVersionList: brands.map(([brand, v]) => ({ brand, version: v === major ? full : v + '.0.0.0' })),
    fullVersion: full, platform: mobile ? 'Android' : 'Linux', platformVersion: mobile ? '14.0.0' : '6.1.0', architecture: mobile ? '' : 'x86', model: mobile ? 'Pixel 8' : '', mobile: !!mobile, bitness: '64', wow64: false
  };
}
const MOBILE_UA = ua => ua.replace(/\(X11; Linux [^)]*\)/, '(Linux; Android 14; Pixel 8)').replace(/Safari\/537\.36$/, 'Mobile Safari/537.36');

/* ---------- one VIP window ---------- */
export function handleVip(req, socket, head) {
  wss.handleUpgrade(req, socket, head, ws => {
    const tabs = new Map();   // targetId → { sessionId, url, title, loading }
    let active = null, view = { w: 1024, h: 700, dpr: 1, zoom: 1 }, opts = { adblock: true, dark: true, scheme: 'dark', mobile: false, quality: 60 }, closed = false;
    const send = obj => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
    // Frames: "SJF1" + CSS width/height (uint16) + JPEG, so the page can show each frame at its real size (never stretched).
    // Only one frame is in flight at a time; while it's sending, newer frames replace the waiting one, so you always see
    // the latest picture instead of a backlog.
    let sending = false, waiting = null;
    const pushFrame = (jpeg, w, h) => {
      const hd = Buffer.alloc(8); hd.write('SJF1', 0, 'latin1'); hd.writeUInt16LE(Math.max(1, Math.min(65535, Math.round(w))), 4); hd.writeUInt16LE(Math.max(1, Math.min(65535, Math.round(h))), 6);
      const buf = Buffer.concat([hd, jpeg]);
      if (sending) { waiting = buf; return; }
      const go = b => { if (ws.readyState !== ws.OPEN) { sending = false; return; } sending = true; ws.send(b, () => { const n = waiting; waiting = null; if (n) go(n); else sending = false; }); };
      go(buf);
    };
    let chrome = null, who = null;   // this window's Chromium and person
    const call = (m, p, sid) => chrome && chromes.get(chrome.key) === chrome ? chrome.call(m, p, sid) : Promise.reject(new Error('Chromium stopped'));
    const tabList = () => send({ type: 'tabs', active, tabs: [...tabs].map(([id, t]) => ({ id, url: t.url, title: t.title, loading: t.loading, canBack: t.canBack, canFwd: t.canFwd })) });
    const sidOf = id => (tabs.get(id) || {}).sessionId;

    const applyView = async id => {
      const sid = sidOf(id); if (!sid) return;
      const z = view.zoom || 1;
      await call('Emulation.setDeviceMetricsOverride', { width: Math.round(view.w / z), height: Math.round(view.h / z), deviceScaleFactor: view.dpr * z, mobile: !!opts.mobile }, sid).catch(() => {});
      await call('Emulation.setTouchEmulationEnabled', { enabled: !!opts.mobile, maxTouchPoints: 5 }, sid).catch(() => {});
    };
    const applyOpts = async id => {
      const sid = sidOf(id); if (!sid) return;
      await call('Network.setUserAgentOverride', { userAgent: opts.mobile ? MOBILE_UA(chrome.ua) : chrome.ua, acceptLanguage: 'en-US,en', platform: opts.mobile ? 'Linux armv8l' : 'Linux x86_64', userAgentMetadata: uaMeta(chrome.ua, opts.mobile) }, sid)
        .catch(() => call('Network.setUserAgentOverride', { userAgent: opts.mobile ? MOBILE_UA(chrome.ua) : chrome.ua, acceptLanguage: 'en-US,en' }, sid)).catch(() => {});
      await call('Network.setBlockedURLs', { urls: opts.adblock ? ADS : [] }, sid).catch(() => {});
      await call('Emulation.setAutoDarkModeOverride', opts.dark ? { enabled: true } : {}, sid).catch(() => {});
      // Sites with their own dark theme pick it up from prefers-color-scheme.
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opts.scheme === 'light' ? 'light' : 'dark' }] }, sid).catch(() => {});
      await applyView(id);
    };
    const startCast = async id => {
      const sid = sidOf(id); if (!sid) return;
      await call('Page.stopScreencast', {}, sid).catch(() => {});   // a running screencast keeps its old size limits otherwise
      await call('Page.startScreencast', { format: 'jpeg', quality: Math.max(20, Math.min(95, opts.quality | 0)), maxWidth: Math.round(view.w * view.dpr), maxHeight: Math.round(view.h * view.dpr), everyNthFrame: 1 }, sid).catch(() => {});
    };
    const stopCast = id => { const sid = sidOf(id); if (sid) call('Page.stopScreencast', {}, sid).catch(() => {}); };
    const refreshHistory = async id => {
      const t = tabs.get(id); if (!t) return;
      try { const h = await call('Page.getNavigationHistory', {}, t.sessionId); t.canBack = h.currentIndex > 0; t.canFwd = h.currentIndex < h.entries.length - 1; t.hist = h; } catch {}
    };
    // Runs in every page: reports the current selection (so the client can copy it straight away,
    // inside the user's key press) and anything the site itself copies (copy buttons, Ctrl+C handlers),
    // which would otherwise land in headless Chromium's own clipboard.
    const CLIP_HOOK = `(()=>{if(window.__sjClipOn)return;window.__sjClipOn=1;
const post=(k,t)=>{try{window.__sjClip(JSON.stringify({k,t:String(t==null?'':t).slice(0,1e6)}))}catch(e){}};
const deep=()=>{let a=document.activeElement;while(a&&a.shadowRoot&&a.shadowRoot.activeElement)a=a.shadowRoot.activeElement;return a};
const sel=()=>{const a=deep();try{if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&a.selectionStart!=null&&a.selectionEnd>a.selectionStart&&a.type!=='password')return a.value.slice(a.selectionStart,a.selectionEnd)}catch(e){}
let r=a&&a.getRootNode&&a.getRootNode();let s=r&&r!==document&&r.getSelection?r.getSelection():null;return String(s&&String(s)?s:getSelection())};
let tm=0;const tick=()=>{clearTimeout(tm);tm=setTimeout(()=>{if(window.top!==window&&!document.hasFocus())return;post('sel',sel())},60)};
document.addEventListener('selectionchange',tick,true);document.addEventListener('mouseup',tick,true);document.addEventListener('keyup',tick,true);addEventListener('focus',tick,true);
const onCopy=e=>{let got=null;const d=e.clipboardData;if(d){const o=d.setData;d.setData=function(ty,v){if(/text(\\/plain)?$/i.test(ty)||got==null)got=v;return o.call(this,ty,v)}}
const s=sel();setTimeout(()=>{if(got!=null)post('copy',got);else if(!e.defaultPrevented&&s)post('copy',s)},0)};
document.addEventListener('copy',onCopy,true);document.addEventListener('cut',onCopy,true);
const c=navigator.clipboard;if(c){const w=c.writeText&&c.writeText.bind(c);c.writeText=t=>{post('copy',t);return w?w(t).catch(()=>{}):Promise.resolve()};
const w2=c.write&&c.write.bind(c);if(w2)c.write=async items=>{try{for(const it of items||[]){if(it.types&&it.types.includes('text/plain')){post('copy',await (await it.getType('text/plain')).text());break}}}catch(e){}return w2(items).catch(()=>{})}}})()`;
    const attach = async (targetId, info = {}) => {
      if (tabs.has(targetId)) return;
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
      tabs.set(targetId, { sessionId, url: info.url || '', title: info.title || '', loading: false });
      await Promise.all(['Page.enable', 'Network.enable', 'Runtime.enable'].map(m => call(m, {}, sessionId).catch(() => {})));
      await call('Runtime.addBinding', { name: '__sjClip' }, sessionId).catch(() => {});
      await call('Page.addScriptToEvaluateOnNewDocument', { source: CLIP_HOOK }, sessionId).catch(() => {});
      call('Runtime.evaluate', { expression: CLIP_HOOK }, sessionId).catch(() => {});
      await applyOpts(targetId);
    };
    const switchTo = async id => {
      if (!tabs.has(id)) return;
      if (active && active !== id) stopCast(active);
      active = id; send({ type: 'sel', text: '' });
      await call('Target.activateTarget', { targetId: id }).catch(() => {});
      await applyView(id); await startCast(id);
      // Screencasts only send a frame when something repaints, so show the tab straight away.
      call('Page.captureScreenshot', { format: 'jpeg', quality: Math.max(20, Math.min(95, opts.quality | 0)) }, sidOf(id)).then(r => { if (active === id) pushFrame(Buffer.from(r.data, 'base64'), view.w / (view.zoom || 1), view.h / (view.zoom || 1)); }).catch(() => {});
      tabList();
    };
    const newTab = async url => {
      const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
      await attach(targetId, { url: 'about:blank' });
      await switchTo(targetId);
      if (url) await call('Page.navigate', { url: fixUrl(url) }, sidOf(targetId)).catch(e => send({ type: 'error', message: e.message }));
      return targetId;
    };
    const closeTab = async id => {
      if (!tabs.has(id)) return;
      await call('Target.closeTarget', { targetId: id }).catch(() => {});
    };

    const me = {
      onEvent(m) {
        if (closed) return;
        const sid = m.sessionId, p = m.params || {};
        const tabId = sid ? [...tabs].find(([, t]) => t.sessionId === sid)?.[0] : null;
        if (m.method === 'Page.screencastFrame') {
          if (!tabId) return;
          call('Page.screencastFrameAck', { sessionId: p.sessionId }, sid).catch(() => {});
          if (tabId === active) { const md = p.metadata || {}; pushFrame(Buffer.from(p.data, 'base64'), md.deviceWidth || view.w / (view.zoom || 1), md.deviceHeight || view.h / (view.zoom || 1)); }
          return;
        }
        if (m.method === 'Target.targetCreated' && p.targetInfo.type === 'page' && p.targetInfo.openerId && tabs.has(p.targetInfo.openerId)) {
          // A link that opens a new window/tab (target=_blank, window.open) becomes a new tab here.
          attach(p.targetInfo.targetId, p.targetInfo).then(() => switchTo(p.targetInfo.targetId)).catch(() => {});
          return;
        }
        if (m.method === 'Target.targetInfoChanged' && tabs.has(p.targetInfo.targetId)) {
          const t = tabs.get(p.targetInfo.targetId); t.url = p.targetInfo.url; t.title = p.targetInfo.title;
          refreshHistory(p.targetInfo.targetId).then(tabList); return;
        }
        if (m.method === 'Target.targetDestroyed' && tabs.has(p.targetId)) {
          tabs.delete(p.targetId);
          if (active === p.targetId) { active = null; const next = [...tabs.keys()].pop(); if (next) switchTo(next); else send({ type: 'empty' }); }
          tabList(); return;
        }
        if (!tabId) return;
        const t = tabs.get(tabId);
        if (m.method === 'Page.frameStartedLoading' && p.frameId === tabId) { t.loading = true; tabList(); }
        else if (m.method === 'Page.frameStoppedLoading' && p.frameId === tabId) { t.loading = false; refreshHistory(tabId).then(tabList); }
        else if (m.method === 'Runtime.bindingCalled' && p.name === '__sjClip') {
          let d; try { d = JSON.parse(p.payload); } catch { return; }
          if (d.k === 'sel') { if (tabId === active) send({ type: 'sel', text: d.t }); }
          else if (d.k === 'copy' && d.t) send({ type: 'copy', text: d.t, page: true });
        }
        else if (m.method === 'Page.javascriptDialogOpening') send({ type: 'dialog', tab: tabId, kind: p.type, message: p.message, defaultPrompt: p.defaultPrompt || '' });
        else if (m.method === 'Page.downloadWillBegin' || m.method === 'Browser.downloadWillBegin') send({ type: 'download', name: p.suggestedFilename, dir: chrome.dl });
      },
      exts() { send({ type: 'exts', list: extList() }); },
      people() { send({ type: 'people', list: profileList(), max: MAX_CHROMES, me: who }); },
      chromeGone(code, tail) { tabs.clear(); active = null; chrome = null; if (!closed) choosing.add(me); send({ type: 'crashed', message: `Chromium stopped${code ? ` (code ${code})` : ''}.`, detail: String(tail || '').split('\n').filter(l => !/dbus|DBus/.test(l)).slice(-3).join('\n') }); }
    };
    choosing.add(me); me.people();

    const KEYMODS = m => (m.alt ? 1 : 0) | (m.ctrl ? 2 : 0) | (m.meta ? 4 : 0) | (m.shift ? 8 : 0);
    const COMMANDS = { a: 'selectAll', z: 'undo', y: 'redo', c: 'copy', x: 'cut' };
    ws.on('message', async (data, isBinary) => {
      if (isBinary) return;
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      const sid = sidOf(active);
      try {
        switch (m.type) {
          case 'hello': {
            view = { w: clamp(m.w, 200, 3840), h: clamp(m.h, 150, 2160), dpr: Math.min(3, Math.max(.5, +m.dpr || 1)), zoom: Math.min(3, Math.max(.25, +m.zoom || 1)) };
            Object.assign(opts, m.opts || {});
            if (chrome) break;
            // Who's browsing: a saved person (must sign in with username + password), or a guest (own throwaway Chromium, deleted when the window closes).
            const guest = m.profile === 'guest', p = guest ? null : profiles().find(x => x.id === m.profile) || profiles()[0];
            if (!guest) {
              if (!p.hash) { send({ type: 'needs-login', id: p.id, name: p.name }); break; }
              const bad = login(p, m.user, m.pass);
              if (bad) { send({ type: 'denied', id: p.id, name: p.name, message: bad }); break; }
            }
            const key = guest ? 'guest-' + crypto.randomBytes(5).toString('hex') : p.id;
            who = guest ? { id: 'guest', name: 'Guest', color: '#64748b', guest: true } : publicP(p);
            send({ type: 'status', message: chromes.has(key) ? `Opening ${who.name}’s browser…` : `Starting Chromium for ${who.name}…` });
            const ready = launch(key, guest ? path.join(PROFILES_DIR, key) : profileDir(key), guest);
            const c = chromes.get(key);
            if (c) { c.sessions.add(me); clearTimeout(c.idleT); }
            choosing.delete(me);
            try { chrome = await ready; }
            catch (err) { if (c) { c.sessions.delete(me); maybeStop(c); } choosing.add(me); who = null; send({ type: 'busy', message: err.message }); break; }
            if (closed) { chrome.sessions.delete(me); maybeStop(chrome); break; }
            for (const s of allSessions()) s.people();
            send({ type: 'ready', version: chrome.version, downloads: chrome.dl, who });
            await newTab(m.url || 'https://www.google.com/');
            break;
          }
          case 'resize': view = { w: clamp(m.w, 200, 3840), h: clamp(m.h, 150, 2160), dpr: Math.min(3, Math.max(.5, +m.dpr || view.dpr)), zoom: Math.min(3, Math.max(.25, +m.zoom || view.zoom)) }; if (active) { await applyView(active); await startCast(active); } break;
          case 'opts': Object.assign(opts, m.opts || {}); for (const id of tabs.keys()) await applyOpts(id); if (active) await startCast(active); if (m.reload && sid) await call('Page.reload', {}, sid); break;
          case 'nav': if (sid) await call('Page.navigate', { url: fixUrl(m.url) }, sid).catch(e => send({ type: 'error', message: e.message })); break;
          case 'back': case 'forward': {
            const t = tabs.get(active); await refreshHistory(active);
            const h = t && t.hist; if (!h) break;
            const e = h.entries[h.currentIndex + (m.type === 'back' ? -1 : 1)];
            if (e) await call('Page.navigateToHistoryEntry', { entryId: e.id }, sid);
            break;
          }
          case 'reload': if (sid) await call('Page.reload', { ignoreCache: !!m.hard }, sid); break;
          case 'stop': if (sid) await call('Page.stopLoading', {}, sid); break;
          case 'newtab': await newTab(m.url || 'https://www.google.com/'); break;
          case 'close': await closeTab(m.id || active); break;
          case 'switch': await switchTo(m.id); break;
          case 'mouse': if (sid) await call('Input.dispatchMouseEvent', { type: m.ev, x: +m.x, y: +m.y, button: m.button || 'none', buttons: m.buttons | 0, clickCount: m.clickCount | 0, modifiers: KEYMODS(m) }, sid); break;
          case 'wheel': if (sid) await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +m.x, y: +m.y, deltaX: +m.dx || 0, deltaY: +m.dy || 0, modifiers: KEYMODS(m) }, sid); break;
          case 'touch': if (sid) await call('Input.dispatchTouchEvent', { type: m.ev, touchPoints: (m.points || []).map(p => ({ x: +p.x, y: +p.y, id: p.id | 0 })) }, sid); break;
          case 'key': {
            if (!sid) break;
            const k = String(m.key || '');
            const base = { key: k, code: m.code || '', windowsVirtualKeyCode: m.keyCode | 0, nativeVirtualKeyCode: m.keyCode | 0, modifiers: KEYMODS(m), autoRepeat: !!m.repeat };
            if (m.ev === 'keyUp') { await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sid); break; }
            const text = k === 'Enter' ? '\r' : k.length === 1 && !m.ctrl && !m.meta ? k : '';
            const cmd = (m.ctrl || m.meta) && !m.alt ? (m.shift && k.toLowerCase() === 'z' ? 'redo' : COMMANDS[k.toLowerCase()]) : null;
            await call('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, text, unmodifiedText: text, ...(cmd ? { commands: [cmd] } : {}) }, sid);
            break;
          }
          case 'text': if (sid && m.text) await call('Input.insertText', { text: String(m.text) }, sid); break;
          case 'copy': {
            if (!sid) break;
            const r = await call('Runtime.evaluate', { expression: '(()=>{let a=document.activeElement;while(a&&a.shadowRoot&&a.shadowRoot.activeElement)a=a.shadowRoot.activeElement;try{if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.selectionEnd>a.selectionStart)return a.value.slice(a.selectionStart,a.selectionEnd)}catch(e){}if(a&&a.tagName==="IFRAME")try{const s=String(a.contentWindow.getSelection());if(s)return s}catch(e){}const r=a&&a.getRootNode&&a.getRootNode();const s=r&&r!==document&&r.getSelection?String(r.getSelection()):"";return s||String(getSelection())})()', returnByValue: true }, sid);
            send({ type: 'copy', text: (r.result && r.result.value) || '', cut: !!m.cut, ask: true });
            if (m.cut) await call('Runtime.evaluate', { expression: 'document.execCommand("delete")' }, sid).catch(() => {});
            break;
          }
          case 'dialog': { const s = sidOf(m.tab); if (s) await call('Page.handleJavaScriptDialog', { accept: !!m.accept, promptText: String(m.text || '') }, s); break; }
          case 'screenshot': if (sid) { const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!m.full }, sid); send({ type: 'file', name: 'screenshot.png', mime: 'image/png', data: r.data }); } break;
          case 'pdf': if (sid) { const r = await call('Page.printToPDF', { printBackground: true }, sid); send({ type: 'file', name: ((tabs.get(active) || {}).title || 'page').replace(/[^\w\- ]+/g, '').slice(0, 50) + '.pdf', mime: 'application/pdf', data: r.data }); } break;
          case 'find': if (sid) await call('Runtime.evaluate', { expression: `window.find(${JSON.stringify(String(m.text || ''))}, false, ${!!m.back}, true)` }, sid); break;
          // ---------- extensions ----------
          case 'ext-list': me.exts(); break;
          case 'ext-install': {
            send({ type: 'ext-busy', message: 'Downloading extension…' });
            const e = await extInstall(m.src, chrome && chrome.version);
            if (e.updated && e.oldDir && e.oldDir !== e.dir) await liveUnload(e.id);
            const live = e.enabled && await liveLoad(e.dir);
            send({ type: 'ext-done', message: `${e.name} ${e.updated ? 'updated' : 'added'}${e.mv === 2 ? ' — note: it’s a Manifest V2 extension, which current Chromium no longer runs' : ''}`, restart: e.enabled && !live, id: e.id, popup: e.popup });
            for (const s of allSessions()) s.exts();
            break;
          }
          case 'ext-toggle': {
            const e = extSetEnabled(String(m.folder), !!m.on);
            const live = !e ? false : m.on ? await liveLoad(e.dir) : await liveUnload(e.id);
            send({ type: 'ext-done', message: `${e ? e.name : 'Extension'} ${m.on ? 'on' : 'off'}`, restart: !live });
            for (const s of allSessions()) s.exts();
            break;
          }
          case 'ext-remove': {
            const e = extRemove(String(m.folder));
            const live = await liveUnload(e.id);
            send({ type: 'ext-done', message: `${e.name} removed`, restart: e.enabled && !live });
            for (const s of allSessions()) s.exts();
            break;
          }
          case 'ext-open': {
            const id = String(m.id || ''), page = String(m.page || '').replace(/^\/+/, '');
            if (!/^[a-p]{32}$/.test(id) || page.split('/').includes('..')) break;
            await newTab(`chrome-extension://${id}/${page}`);
            break;
          }
          case 'ext-restart': if (chrome) stopChrome(chrome); break;
          // ---------- people ----------
          case 'people': me.people(); break;
          case 'people-add': {
            const name = cleanName(m.name);
            if (!name) throw new Error('Type a name for them');
            const user = cleanUser(m.user);
            checkNewPass(m.pass);
            takenUser(user, null);
            const l = profiles();
            if (l.length >= 20) throw new Error('That’s the most people (20)');
            const p = { id: 'p-' + crypto.randomBytes(4).toString('hex'), name, color: PCOLORS[l.length % PCOLORS.length], user };
            setPass(p, m.pass);
            l.push(p); saveProfiles(l);
            for (const s of allSessions()) s.people();
            send({ type: 'people-done', id: p.id, message: `${name} added` });
            break;
          }
          case 'people-account': {
            // Change a person's username and password. Needs their current password once they have one.
            const id = String(m.id || ''), l = profiles(), p = l.find(x => x.id === id);
            if (!p) throw new Error('That person is gone');
            const user = cleanUser(m.user);
            takenUser(user, id);
            checkNewPass(m.newPass);
            if (p.hash) { const bad = login(p, p.user, m.oldPass); if (bad) throw new Error(bad.startsWith('Wrong') ? 'The current password is wrong.' : bad); }
            p.user = user; setPass(p, m.newPass); saveProfiles(l);
            for (const s of allSessions()) s.people();
            send({ type: 'people-done', id, message: 'Username and password saved' });
            break;
          }
          case 'people-rename': {
            const l = profiles(), p = l.find(x => x.id === m.id), name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 30);
            if (!p || !name) break;
            p.name = name; saveProfiles(l);
            for (const s of allSessions()) s.people();
            break;
          }
          case 'people-remove': {
            const id = String(m.id || ''), l = profiles(), p = l.find(x => x.id === id);
            if (!p || id === 'main') throw new Error('The first person can’t be removed');
            if (chromes.has(id)) throw new Error(`${p.name} is browsing right now — close their browser windows first`);
            if (p.hash) { const bad = login(p, p.user, m.pass); if (bad) throw new Error(bad); }
            saveProfiles(l.filter(x => x.id !== id));
            fs.rmSync(profileDir(id), { recursive: true, force: true });
            for (const s of allSessions()) s.people();
            send({ type: 'people-done', id, message: `${p.name} removed` });
            break;
          }
          case 'clear': if (sid) { await call('Network.clearBrowserCookies', {}, sid); await call('Network.clearBrowserCache', {}, sid); await call('Storage.clearDataForOrigin', { origin: '*', storageTypes: 'all' }, sid).catch(() => {}); send({ type: 'status', message: 'Cookies and cache cleared' }); } break;
        }
      } catch (err) { send({ type: 'error', message: err.message }); }
    });
    ws.on('close', () => {
      closed = true; choosing.delete(me);
      const c = chrome; if (c) c.sessions.delete(me);
      for (const id of tabs.keys()) call('Target.closeTarget', { targetId: id }).catch(() => {});
      tabs.clear(); maybeStop(c);
      for (const s of allSessions()) s.people();
    });
  });
}
// Add/remove an extension in the running Chromium (needs --enable-unsafe-extension-debugging + the DevTools pipe).
// false = not running or not supported: it takes effect the next time Chromium starts.
// Extensions are shared by everyone, so this applies to every running Chromium.
async function liveAll(method, params) {
  let ok = true;
  for (const c of chromes.values()) { try { await c.ready; await c.call(method, params); } catch { ok = false; } }
  return ok;
}
const liveLoad = dir => liveAll('Extensions.loadUnpacked', { path: dir });
const liveUnload = id => liveAll('Extensions.uninstall', { id });
const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v) || a));
