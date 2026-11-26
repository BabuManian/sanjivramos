// Kushtok: a fast TikTok client.
// A headless Chromium on this machine (own profile folder, .tt-profile) loads tiktok.com in hidden tabs. We read the
// video lists TikTok's own web app downloads (its /api/…/item_list responses), and stream the videos through this
// server with the browser's cookies, so the Kushtok page can play them in a plain fast <video> player.
// Signing in happens on TikTok's own login page in that browser: by QR code (scan with the TikTok phone app), or in a
// live login view. Passwords are typed straight into TikTok's page; nothing here stores them. Cookies stay in the profile.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './vip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(process.env.SANJIVRAM_DATA || ROOT);
const PROFILE = path.join(DATA, '.tt-profile');
const TT = 'https://www.tiktok.com';
const IDLE_MS = 10 * 60e3, MAX_FEEDS = 3;
const W = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- the browser ---------------- */
let C = null, idleT = 0;
function launch() {
  const bin = chromiumPath();
  if (!bin) throw new Error('Chromium isn’t installed. In Termux: pkg install x11-repo && pkg install chromium');
  fs.mkdirSync(PROFILE, { recursive: true });
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(PROFILE, f)); } catch {} }
  const env = { ...process.env };
  for (const k of ['SITE_PASSWORD', 'DISPLAY', 'WAYLAND_DISPLAY', 'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'ALL_PROXY']) delete env[k];
  const proc = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--remote-debugging-pipe', `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', '--mute-audio', '--disable-features=Translate,MediaRouter',
    '--window-size=1280,800', '--password-store=basic', '--autoplay-policy=user-gesture-required', 'about:blank'], { env, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  const pending = new Map(), on = new Map();   // sessionId → event handler
  let id = 0, buf = '';
  const c = { proc, on, ua: '' };
  c.call = (method, params = {}, sessionId) => new Promise((res, rej) => {
    if (!proc.stdio[3].writable) return rej(new Error('Chromium stopped'));
    const i = ++id; pending.set(i, { res, rej });
    proc.stdio[3].write(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }) + '\0');
  });
  proc.stdio[4].on('data', d => {
    buf += d; let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      let m; try { m = JSON.parse(raw); } catch { continue; }
      if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }
      else if (m.sessionId && on.has(m.sessionId)) { try { on.get(m.sessionId)(m); } catch (e) { console.error('tiktok:', e.message); } }
    }
  });
  proc.stderr.on('data', () => {});
  proc.stdio[3].on('error', () => {});
  proc.on('exit', () => { for (const p of pending.values()) p.rej(new Error('Chromium stopped')); if (C === c) { C = null; feeds.clear(); loginTab = null; } });
  c.ready = (async () => { const v = await c.call('Browser.getVersion'); c.ua = String(v.userAgent || '').replace('HeadlessChrome', 'Chrome'); return c; })();
  c.ready.catch(() => { try { proc.kill('SIGKILL'); } catch {} });
  return c;
}
async function browser() {
  clearTimeout(idleT); idleT = setTimeout(() => { if (C) try { C.proc.kill('SIGTERM'); } catch {} }, IDLE_MS);
  if (!C) C = launch();
  return C.ready;
}
const uaMeta = ua => {
  const full = (/Chrome\/([\d.]+)/.exec(ua) || [, '140.0.0.0'])[1], major = full.split('.')[0];
  const brands = [['Chromium', major], ['Google Chrome', major], ['Not=A?Brand', '24']];
  return { brands: brands.map(([brand, version]) => ({ brand, version })), fullVersionList: brands.map(([brand, v]) => ({ brand, version: v === major ? full : v + '.0.0.0' })), fullVersion: full, platform: 'Linux', platformVersion: '6.1.0', architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false };
};
// Hidden feed tabs never need to play or show anything: mute/pause videos and skip downloading video and pictures.
const QUIET = `setInterval(()=>{for(const v of document.querySelectorAll('video')){v.muted=true;if(!v.paused)v.pause()}},400)`;
const BLOCK = ['*://*/video/tos/*', '*mime_type=video*', '*.mp4*', '*~tplv-*', '*.jpeg?*', '*.webp?*', '*/aweme/v1/play/*'];
async function newTab({ quiet = true, w = 1280, h = 800 } = {}) {
  const c = await browser();
  const { targetId } = await c.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.call('Target.attachToTarget', { targetId, flatten: true });
  await Promise.all(['Page.enable', 'Network.enable', 'Runtime.enable'].map(m => c.call(m, {}, sessionId).catch(() => {})));
  await c.call('Network.setUserAgentOverride', { userAgent: c.ua, acceptLanguage: 'en-US,en', platform: 'Linux x86_64', userAgentMetadata: uaMeta(c.ua) }, sessionId).catch(() => {});
  await c.call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId).catch(() => {});
  if (quiet) {
    await c.call('Network.setBlockedURLs', { urls: BLOCK }, sessionId).catch(() => {});
    await c.call('Page.addScriptToEvaluateOnNewDocument', { source: QUIET }, sessionId).catch(() => {});
  }
  return { tid: targetId, sid: sessionId, c };
}
const closeTab = t => { if (t && C) { C.on.delete(t.sid); C.call('Target.closeTarget', { targetId: t.tid }).catch(() => {}); } };
const evalIn = async (t, expr, timeout = 15000) => {
  const r = await Promise.race([t.c.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, t.sid), W(timeout).then(() => { throw new Error('TikTok took too long'); })]);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text || 'error').split('\n')[0]);
  return r.result.value;
};

/* ---------------- turning TikTok's data into ours ---------------- */
const media = new Map();   // video id → { urls: [...], music }
function remember(id, m) { media.delete(id); media.set(id, m); if (media.size > 3000) for (const k of [...media.keys()].slice(0, 1000)) media.delete(k); }
const first = u => (u && (u.url_list || u.urlList || [])[0]) || (typeof u === 'string' ? u : '');
function normItem(it) {
  if (!it || !it.id || !(it.video || it.imagePost)) return null;
  // Ads and promoted posts: skip them (they often can't play outside TikTok anyway).
  if (it.isAd || it.is_ad || it.adAuthorization || it.ad_info || it.adInfo || it.adLabelVersion || it.isPromoted || it.brandOrganicType === 1 || (it.aweme_type && it.aweme_type !== 0 && it.aweme_type !== 150 && it.aweme_type !== 61)) return null;
  const v = it.video || {}, a = it.author || {}, st = it.statsV2 || it.stats || {}, m = it.music || {};
  // Prefer an H.264 copy near 1.2 Mbit/s: quick to start, small on phone data, still sharp on a phone screen.
  const br = (v.bitrateInfo || []).filter(b => b.PlayAddr && (b.PlayAddr.UrlList || []).length && !/265|hevc|bytevc/i.test(b.CodecType || ''))
    .sort((x, y) => Math.abs((x.Bitrate || 0) - 0.85e6) - Math.abs((y.Bitrate || 0) - 0.85e6));
  const urls = [...br.flatMap(b => b.PlayAddr.UrlList.slice(0, 2)), v.playAddr, v.downloadAddr].filter(Boolean);
  const photo = it.imagePost && it.imagePost.images ? it.imagePost.images.map(i => first(i.imageURL)).filter(Boolean) : null;
  if (!photo && !urls.length) return null;
  remember(it.id, { urls: [...new Set(urls)], music: m.playUrl || '', imgs: photo || [] });
  return {
    id: it.id, desc: it.desc || '', created: +it.createTime || 0,
    author: { id: a.uniqueId || '', uid: a.id || '', name: a.nickname || a.uniqueId || '', avatar: a.avatarThumb || a.avatarMedium || '', verified: !!a.verified },
    cover: v.cover || v.originCover || v.dynamicCover || (photo && photo[0]) || '', w: +v.width || 0, h: +v.height || 0, dur: +v.duration || 0,
    photo: photo ? photo.length : 0, music: { title: m.title || '', author: m.authorName || '' },
    stats: { likes: +st.diggCount || 0, comments: +st.commentCount || 0, shares: +st.shareCount || 0, plays: +st.playCount || 0, saves: +st.collectCount || 0 },
    liked: !!it.digged, following: !!(it.authorStats && it.isFollowing) || a.relation === 1
  };
}
const normUser = u => u && (u.unique_id || u.uniqueId) ? { id: u.unique_id || u.uniqueId, uid: u.uid || u.id || '', name: u.nickname || '', avatar: first(u.avatar_thumb) || u.avatarThumb || u.avatarMedium || '', verified: !!(u.verified || (u.custom_verify)), followers: +(u.follower_count || (u.stats && u.stats.followerCount) || 0), sig: u.signature || '' } : null;
// Lists of videos (or people) inside any of TikTok's API answers.
function harvest(j) {
  const items = [], users = [];
  for (const it of j.itemList || j.item_list || j.items || []) items.push(it);
  for (const d of j.data || []) { if (d && d.item) items.push(d.item); if (d && d.user_info) users.push(d.user_info); if (d && d.user_list) users.push(...d.user_list.map(x => x.user_info)); }
  for (const u of j.user_list || []) users.push(u.user_info || u);
  return { items, users, hasMore: j.hasMore != null ? !!j.hasMore : j.has_more != null ? !!j.has_more : undefined };
}
const API_RE = /\/api\/(prefetch\/explore|recommend|post|repost|favorite|following|friend|challenge|explore|related|search|music|preload|item\/detail)[^?]*/;

/* ---------------- feeds: one hidden TikTok tab per list ---------------- */
const feeds = new Map();   // key → feed
const FEED_URL = { foryou: () => `${TT}/foryou`, following: () => `${TT}/following`, explore: () => `${TT}/explore`, user: q => `${TT}/@${encodeURIComponent(q)}`, search: q => `${TT}/search/video?q=${encodeURIComponent(q)}`, users: q => `${TT}/search/user?q=${encodeURIComponent(q)}`, tag: q => `${TT}/tag/${encodeURIComponent(q)}`, video: q => `${TT}/@x/video/${encodeURIComponent(q)}` };
const opening = new Map();
function openFeed(key, kind, q) {
  if (opening.has(key)) return opening.get(key);
  const p = openFeed1(key, kind, q).finally(() => opening.delete(key));
  opening.set(key, p); return p;
}
async function openFeed1(key, kind, q) {
  const old = feeds.get(key); if (old) { feeds.delete(key); closeTab(old.tab); }
  while ([...feeds.keys()].filter(k => !k.endsWith('#spare')).length >= MAX_FEEDS && !key.endsWith('#spare')) { const [k, f] = [...feeds].filter(([k]) => !k.endsWith('#spare')).sort((a, b) => a[1].t - b[1].t)[0]; feeds.delete(k); closeTab(f.tab); }
  const tab = await newTab();
  const f = { key, kind, q, tab, items: [], ids: new Set(), users: [], uids: new Set(), hasMore: true, t: Date.now(), wake: [], profile: null, urls: new Map(), err: '' };
  feeds.set(key, f);
  const add = list => { let n = 0; for (const it of list) { const x = normItem(it); if (x && !f.ids.has(x.id)) { f.ids.add(x.id); f.items.push(x); n++; } } return n; };
  f.add = add;
  tab.c.on.set(tab.sid, async m => {
    const p = m.params || {};
    if (m.method === 'Network.responseReceived' && API_RE.test(p.response.url)) f.urls.set(p.requestId, p.response.url);
    else if (m.method === 'Network.loadingFinished' && f.urls.has(p.requestId)) {
      f.urls.delete(p.requestId);
      try {
        const b = await tab.c.call('Network.getResponseBody', { requestId: p.requestId }, tab.sid);
        const j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString() : b.body), h = harvest(j);
        add(h.items);
        for (const u of h.users.map(normUser)) if (u && !f.uids.has(u.id)) { f.uids.add(u.id); f.users.push(u); }
        if (h.hasMore === false && (h.items.length || h.users.length)) f.hasMore = false;
        f.wake.splice(0).forEach(r => r());
      } catch {}
    } else if (m.method === 'Page.loadEventFired') readPage(f).then(() => f.wake.splice(0).forEach(r => r())).catch(() => {});
  });
  await tab.c.call('Page.navigate', { url: FEED_URL[kind](q) }, tab.sid);
  return f;
}
// Data TikTok puts straight into the page (profile header, a single video).
async function readPage(f) {
  const j = await evalIn(f.tab, `(() => { const e = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'); if (!e) return null; try { const s = JSON.parse(e.textContent).__DEFAULT_SCOPE__ || {}; const u = s['webapp.user-detail'], v = s['webapp.video-detail']; return { user: u && u.userInfo || null, item: v && v.itemInfo && v.itemInfo.itemStruct || null, status: (u || v || {}).statusCode } } catch (e) { return null } })()`, 8000).catch(() => null);
  if (!j) return;
  if (j.user && j.user.user) { const u = j.user.user, s = j.user.stats || {}; f.profile = { id: u.uniqueId, uid: u.id, name: u.nickname, avatar: u.avatarLarger || u.avatarMedium || u.avatarThumb, sig: u.signature || '', verified: !!u.verified, private: !!u.privateAccount, followers: +s.followerCount || 0, following: +s.followingCount || 0, likes: +s.heartCount || +s.heart || 0, videos: +s.videoCount || 0, relation: u.relation }; }
  if (j.item) f.add([j.item]);
  if (f.kind === 'user' && f.profile && (f.profile.private || f.profile.videos === 0)) f.hasMore = false;
  if (f.kind === 'video') f.hasMore = false;
}
const waitNew = (f, ms) => new Promise(r => { const t = setTimeout(r, ms); f.wake.push(() => { clearTimeout(t); r(); }); });
// Ask the hidden page for more: scroll its list and press ↓ (the For You feed moves one video per key press).
async function pull(f) {
  await evalIn(f.tab, `(() => { const els = [...document.querySelectorAll('article, [data-e2e="recommend-list-item-container"], [data-e2e="user-post-item"], [data-e2e="search_video-item"], [data-e2e="challenge-item"], [class*="DivItemContainer"]')]; const l = els.pop(); if (l) l.scrollIntoView({ block: 'end' }); window.scrollBy(0, innerHeight * 3); for (const s of document.querySelectorAll('[class*="ColumnListContainer"], [class*="DivColumnList"], main')) s.scrollTop += innerHeight * 3; return els.length })()`, 5000).catch(() => {});
  for (let i = 0; i < 4; i++) {
    for (const type of ['keyDown', 'keyUp']) await f.tab.c.call('Input.dispatchKeyEvent', { type, key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, f.tab.sid).catch(() => {});
    await W(120);
  }
}
async function feed(kind, q, cursor, fresh) {
  // TikTok only lets signed-in people search videos; for guests, look the words up as a hashtag instead.
  if ((kind === 'search' || kind === 'users' || kind === 'tag') && !(await me())) return { items: [], users: [], next: 0, hasMore: false, note: 'TikTok only lets signed-in people search. Sign in, or open a profile by typing @name.', signin: true };
  const key = kind + ':' + (q || '').toLowerCase();
  let f = feeds.get(key) || (opening.has(key) ? await opening.get(key) : null);
  const endless = kind === 'foryou' || kind === 'following' || kind === 'explore';
  // Endless feeds keep their tab: "fresh" just starts after everything already shown (new videos, no reload wait).
  const spareKey = key + '#spare', spare = feeds.get(spareKey);
  if (fresh && endless && f && f.served && spare && spare.items.length) {
    // A new For You is already waiting in the background: swap to it straight away.
    feeds.delete(spareKey); closeTab(f.tab); spare.key = key; feeds.set(key, spare); f = spare;
  }
  else if (!f || f.dead || (fresh && (!endless || f.served)) || (cursor === 0 && Date.now() - f.t > 30 * 60e3) || (endless && f.items.length > 600)) f = await openFeed(key, kind, q);
  // Keep one fresh For You loading behind the scenes for the next refresh or visit.
  if (kind === 'foryou' && !feeds.has(spareKey) && !opening.has(spareKey)) setTimeout(() => { if (C && !feeds.has(spareKey)) openFeed(spareKey, kind, q).catch(() => {}); }, 6000);
  f.t = Date.now();
  const base = 0;
  const want = cursor + 8, list = () => kind === 'users' ? f.users : f.items;
  const deadline = Date.now() + (list().length ? 9000 : 20000);
  let tries = 0;
  while (list().length < want && f.hasMore && Date.now() < deadline) {
    const before = list().length;
    if (before || tries > 0) await pull(f);
    await waitNew(f, before ? 3500 : 6000);
    if (list().length === before) tries++;
    if (tries >= 3 && list().length) break;
  }
  const out = list().slice(cursor, cursor + 15); f.served = true;
  return { items: kind === 'users' ? [] : out, users: kind === 'users' ? out : f.users.slice(0, 12), next: cursor - base + out.length, hasMore: f.hasMore || list().length > cursor + out.length, profile: f.profile };
}

/* ---------------- cookies, sign-in state ---------------- */
let ckCache = { t: 0, s: '', all: [] };
async function cookies(force) {
  if (!force && Date.now() - ckCache.t < 30000) return ckCache;
  const c = await browser();
  const r = await c.call('Storage.getCookies', {}).catch(() => ({ cookies: [] }));
  const all = (r.cookies || []).filter(k => /(^|\.)tiktok(v)?\.com$|tiktokcdn|byteoversea|ibyteimg/.test(k.domain.replace(/^\./, '')));
  ckCache = { t: Date.now(), all, s: all.filter(k => /tiktok\.com$/.test(k.domain)).map(k => `${k.name}=${k.value}`).join('; ') };
  return ckCache;
}
const signedIn = ck => ck.all.some(k => (k.name === 'sessionid' || k.name === 'sessionid_ss') && k.value);
let meCache = { t: 0, v: null };
function getText(u, cookie, ua) {
  return new Promise((res, rej) => {
    const r = https.get(u, { headers: { 'user-agent': ua, cookie, referer: TT + '/', accept: 'text/html,application/json' }, timeout: 12000 }, up => { let b = ''; up.setEncoding('utf8'); up.on('data', d => { b += d; if (b.length > 4e6) up.destroy(); }); up.on('end', () => res(b)); });
    r.on('error', rej); r.on('timeout', () => r.destroy(new Error('timeout')));
  });
}
// Your current picture is on your profile page (the account-info answer can be an old one).
async function currentAvatar(id, cookie, ua) {
  try {
    const html = await getText(`${TT}/@${encodeURIComponent(id)}`, cookie, ua);
    const m = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html); if (!m) return '';
    const u = (((JSON.parse(m[1]).__DEFAULT_SCOPE__ || {})['webapp.user-detail'] || {}).userInfo || {}).user || {};
    return u.avatarMedium || u.avatarThumb || u.avatarLarger || '';
  } catch { return ''; }
}
function getJson(u, cookie, ua) {
  return new Promise((res, rej) => {
    const r = https.get(u, { headers: { 'user-agent': ua, cookie, referer: TT + '/', accept: 'application/json' }, timeout: 10000 }, up => { let b = ''; up.setEncoding('utf8'); up.on('data', d => { b += d; if (b.length > 2e6) up.destroy(); }); up.on('end', () => { try { res(JSON.parse(b)); } catch { rej(new Error('bad answer')); } }); });
    r.on('error', rej); r.on('timeout', () => r.destroy(new Error('timeout')));
  });
}
async function me(force) {
  const ck = await cookies(force);
  if (!signedIn(ck)) { meCache = { t: Date.now(), v: null }; return null; }
  if (!force && meCache.v && Date.now() - meCache.t < 10 * 60e3) return meCache.v;
  try {
    const j = await getJson(`${TT}/passport/web/account/info/?aid=1459&app_language=en`, ck.s, C.ua);
    const d = j.data || {};
    const fresh = d.username ? await currentAvatar(d.username, ck.s, C.ua) : '';
    meCache = { t: Date.now(), v: { id: d.username || '', name: d.username || d.screen_name || '', avatar: fresh || d.avatar_url || d.avatar_large_url || d.avatar_thumb_url || '', uid: d.user_id_str || String(d.user_id || '') } };
  } catch { meCache = { t: Date.now(), v: { id: '', name: 'Signed in', avatar: '' } }; }
  return meCache.v;
}

/* ---------------- sign in: QR code, or a live view of TikTok's login page ---------------- */
let loginTab = null, loginMode = '';
async function loginOpen(mode) {
  if (loginTab && loginMode === mode) return loginTab;
  closeTab(loginTab); loginTab = null;
  const t = await newTab({ quiet: false, w: 420, h: 760 });
  t.c.on.set(t.sid, () => {});
  await t.c.call('Page.navigate', { url: mode === 'qr' ? `${TT}/login/qrcode` : `${TT}/login` }, t.sid);
  loginTab = t; loginMode = mode;
  await focus(t);
  await settle(t);
  return t;
}
// Headless Chromium only delivers clicks and typing to the tab in front.
const focus = t => t.c.call('Target.activateTarget', { targetId: t.tid }).catch(() => {});
async function settle(t, ms = 12000) { const end = Date.now() + ms; while (Date.now() < end) { const r = await evalIn(t, 'document.readyState', 2000).catch(() => ''); if (r === 'complete' || r === 'interactive') return; await W(250); } }
async function shot(t, opts) {
  for (let i = 0; i < 4; i++) { try { return (await t.c.call('Page.captureScreenshot', opts, t.sid)).data; } catch (e) { if (i === 3) throw e; await W(400); } }
}
async function loginDone() {
  const ck = await cookies(true);
  if (!signedIn(ck)) return false;
  closeTab(loginTab); loginTab = null;
  for (const [k, f] of feeds) { closeTab(f.tab); feeds.delete(k); }   // feeds become yours
  await me(true);
  return true;
}
async function qr() {
  if (await loginDone()) return { done: true, me: meCache.v };
  const t = await loginOpen('qr');
  let box = null;
  for (let i = 0; i < 30 && !box; i++) {
    // Wait for the real code: TikTok shows a blurred placeholder (and a spinner) while it fetches one.
    box = await evalIn(t, `(() => { const c = [...document.querySelectorAll('canvas, img')].map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width >= 100 && r.width < 400 && Math.abs(r.width - r.height) < 8 && (e.tagName === 'CANVAS' || /qr/i.test(e.alt + e.src + e.className)))[0]; if (!c) return null;
      for (let e = c[0], i = 0; e && i < 6; e = e.parentElement, i++) { const s = getComputedStyle(e); if ((s.filter && s.filter !== 'none') || +s.opacity < .9 || /loading|blur|mask/i.test(e.className)) return null; }
      const box = c[0].parentElement && c[0].parentElement.getBoundingClientRect(); if (box && document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2).some(e => /loading|spin/i.test(e.className))) return null;
      const r = c[1]; return { x: r.x, y: r.y, w: r.width, h: r.height } })()`, 4000).catch(() => null);
    if (!box) await W(500);
  }
  if (!box) { const s = await t.c.call('Page.captureScreenshot', { format: 'jpeg', quality: 70 }, t.sid); return { done: false, img: 'data:image/jpeg;base64,' + s.data, whole: true }; }
  const pad = 12, s = await t.c.call('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2, scale: 2 } }, t.sid);
  return { done: false, img: 'data:image/png;base64,' + s.data };
}
async function liveFrame() {
  if (await loginDone()) return { done: true, me: meCache.v };
  const t = await loginOpen('live');
  const data = await shot(t, { format: 'jpeg', quality: 75 });
  const info = await evalIn(t, 'location.href', 3000).catch(() => '');
  return { done: false, img: 'data:image/jpeg;base64,' + data, w: 420, h: 760, url: info };
}
async function liveInput(m) {
  const t = loginTab && loginMode === 'live' ? loginTab : await loginOpen('live'), call = (k, p) => t.c.call(k, p, t.sid);
  await focus(t);
  const X = v => Math.max(0, Math.min(420, +v || 0)), Y = v => Math.max(0, Math.min(760, +v || 0));
  if (m.t === 'click') { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: X(m.x), y: Y(m.y), button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); }
  else if (m.t === 'drag') {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(m.x1), y: Y(m.y1) });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: X(m.x1), y: Y(m.y1), button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X(m.x1 + (m.x2 - m.x1) * i / 16), y: Y(m.y1 + (m.y2 - m.y1) * i / 16), button: 'left', buttons: 1 }); await W(25); }
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X(m.x2), y: Y(m.y2), button: 'left', buttons: 0, clickCount: 1 });
  }
  else if (m.t === 'scroll') await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 210, y: 380, deltaX: 0, deltaY: Math.max(-2000, Math.min(2000, +m.dy || 0)) });
  else if (m.t === 'text' && m.text) await call('Input.insertText', { text: String(m.text).slice(0, 500) });
  else if (m.t === 'key') {
    const K = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Delete: 46 }[m.key];
    if (K) for (const type of ['rawKeyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: m.key, code: m.key, windowsVirtualKeyCode: K, text: m.key === 'Enter' && type === 'rawKeyDown' ? '\r' : undefined });
  }
  else if (m.t === 'back') await evalIn(t, 'history.back(), 1', 3000).catch(() => {});
  else if (m.t === 'home') await call('Page.navigate', { url: `${TT}/login` });
  await W(m.t === 'text' ? 60 : 350);
  return liveFrame();
}

/* ---------------- things done as you, inside a TikTok tab (its own scripts sign the requests) ---------------- */
async function anyTab() {
  for (const f of feeds.values()) if (!f.dead) return f.tab;
  return (await openFeed('foryou:', 'foryou', '')).tab;
}
const pageFetch = async (u, post) => evalIn(await anyTab(), `fetch(${JSON.stringify(u)}, { method: ${post ? "'POST'" : "'GET'"}, credentials: 'include', headers: { accept: 'application/json' } }).then(r => r.text()).then(t => { try { return JSON.parse(t) } catch (e) { return { status_code: -1, raw: t.slice(0, 200) } } })`, 15000);
async function comments(id, cursor) {
  const j = await pageFetch(`/api/comment/list/?aid=1988&aweme_id=${encodeURIComponent(id)}&count=30&cursor=${cursor | 0}`);
  return { items: (j.comments || []).map(c => ({ id: c.cid, text: c.text || '', likes: +c.digg_count || 0, replies: +c.reply_comment_total || 0, t: +c.create_time || 0, user: { id: c.user && c.user.unique_id || '', name: c.user && c.user.nickname || '', avatar: c.user && first(c.user.avatar_thumb) } })), next: +j.cursor || 0, hasMore: !!j.has_more, total: +j.total || 0 };
}
let actTab = null;
async function actionTab() {
  if (actTab && C && C.on.has(actTab.sid)) return actTab;
  const t = await newTab({ w: 1280, h: 860 }); t.waiters = []; t.pend = new Set();
  t.c.on.set(t.sid, async m => {
    const p = m.params || {};
    if (m.method === 'Network.responseReceived' && /\/api\/commit\//.test(p.response.url)) t.pend.add(p.requestId);
    else if (m.method === 'Network.loadingFinished' && t.pend.has(p.requestId)) {
      t.pend.delete(p.requestId);
      try { const b = await t.c.call('Network.getResponseBody', { requestId: p.requestId }, t.sid); const j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString() : b.body); t.waiters.splice(0).forEach(r => r(j)); } catch {}
    }
  });
  actTab = t; return t;
}
async function videoPage(id, author) {
  const t = await actionTab();
  const here = await evalIn(t, 'location.href', 3000).catch(() => '');
  if (!here.includes('/video/' + id)) { await t.c.call('Page.navigate', { url: `${TT}/@${encodeURIComponent(author || 'x')}/video/${encodeURIComponent(id)}` }, t.sid); await W(800); await settle(t); }
  return t;
}
async function findBtn(t, js, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await evalIn(t, `(() => { const b = (${js})(); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); if (!r.width) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2, pressed: b.getAttribute('aria-pressed'), text: (b.textContent || '').trim().slice(0, 30) } })()`, 4000).catch(() => null);
    if (r) return r; await W(400);
  }
  return null;
}
async function press(t, b) {
  const got = new Promise(r => { t.waiters.push(r); setTimeout(() => r(null), 9000); });
  await focus(t);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await t.c.call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }, t.sid);
  const j = await got;
  if (!j) throw new Error('TikTok didn’t answer. Try again in a moment.');
  if (j.status_code !== 0) throw new Error(j.status_msg || 'TikTok said no');
  return j;
}
const LIKE_BTN = `() => { const i = document.querySelector('[data-e2e="browse-like-icon"], [data-e2e="like-icon"]'); return (i && (i.closest('button') || i)) || [...document.querySelectorAll('button[aria-label]')].find(x => /^like|like video/i.test(x.getAttribute('aria-label'))) }`;
// TikTok paints the heart red once you've liked a video.
const LIKED = `(() => { const i = document.querySelector('[data-e2e="browse-like-icon"], [data-e2e="like-icon"]'); if (!i) return null; const b = i.closest('button'); if (b && b.getAttribute('aria-pressed')) return b.getAttribute('aria-pressed') === 'true'; const cs = [i, ...i.querySelectorAll('*')].map(e => getComputedStyle(e)); return cs.some(c => /254, ?44, ?85|255, ?59, ?92|fe2c55/i.test(c.color + c.fill + c.backgroundColor)) || /fe2c55|FE2C55|rgb\\(254, ?44, ?85\\)/.test(i.innerHTML) })()`;
async function like(id, on, author) {
  const t = await videoPage(id, author);
  const b = await findBtn(t, LIKE_BTN);
  if (!b) throw new Error('Couldn’t find TikTok’s like button for this video');
  const liked = await evalIn(t, LIKED, 3000).catch(() => null);
  if (liked === on || b.pressed === (on ? 'true' : 'false')) return { ok: true };
  await press(t, b);
  return { ok: true };
}
async function follow(id, on, author) {
  const t = await videoPage(id, author);
  const b = await findBtn(t, `() => document.querySelector('[data-e2e="feed-follow"], [data-e2e="browse-follow"], [data-e2e="follow-button"]') || [...document.querySelectorAll('button')].find(x => /^follow$/i.test((x.textContent || '').trim()))`);
  if (!b) throw new Error('Couldn’t find TikTok’s follow button');
  if (on && /following|friends/i.test(b.text)) return { ok: true };
  await press(t, b);
  return { ok: true };
}

/* ---------------- streaming videos and pictures ---------------- */
const IMG_HOST = /(^|\.)(tiktokcdn(-[a-z]+)?\.com|tiktokcdn-us\.com|tiktok\.com|ibyteimg\.com|byteimg\.com|muscdn\.com|tiktokv\.com)$/;
function pipe(u, req, res, extra, hops = 0) {
  return new Promise(resolve => {
    let url; try { url = new URL(u); } catch { return resolve(false); }
    if (url.protocol !== 'https:') return resolve(false);
    const up = https.get(url, { headers: { 'user-agent': (C && C.ua) || 'Mozilla/5.0', referer: TT + '/', accept: '*/*', ...extra }, timeout: 15000 }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 3) { r.resume(); return resolve(pipe(new URL(r.headers.location, url).href, req, res, extra, hops + 1)); }
      if (r.statusCode !== 200 && r.statusCode !== 206) { r.resume(); return resolve(false); }
      const h = { 'content-type': r.headers['content-type'] || 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
      for (const k of ['content-length', 'content-range']) if (r.headers[k]) h[k] = r.headers[k];
      res.writeHead(r.statusCode, h); r.pipe(res);
      res.on('close', () => up.destroy());
      resolve(true);
    });
    up.on('error', () => resolve(false)); up.on('timeout', () => up.destroy());
  });
}
async function streamVideo(req, res, id, which) {
  const m = media.get(id);
  if (!m) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Unknown video'); return; }
  const ck = await cookies();
  const list = which === 'music' ? [m.music] : which && /^\d+$/.test(which) ? [m.imgs[+which]] : m.urls;
  const extra = { cookie: ck.s }; if (req.headers.range && !/^\d+$/.test(which || '')) extra.range = req.headers.range;
  for (const u of list.filter(Boolean)) if (await pipe(u, req, res, extra)) return;
  res.writeHead(410, { 'content-type': 'text/plain' }); res.end('Video link expired');
}
async function img(req, res, u) {
  let ok = false; try { const h = new URL(u); ok = h.protocol === 'https:' && IMG_HOST.test(h.hostname); } catch {}
  if (!ok || !(await pipe(u, req, res, {}))) { res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'max-age=300' }); res.end(); }
}

/* ---------------- router ---------------- */
const body = req => new Promise(r => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
export async function ttApi(req, res, url, allowed) {
  const send = (code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (!allowed) return send(403, { error: 'Kushtok only works on your own network (it uses this machine’s browser and your TikTok sign-in).' });
  if (!chromiumPath()) return send(503, { error: 'Chromium isn’t installed. In Termux: pkg install x11-repo && pkg install chromium' });
  const p = url.pathname, q = k => url.searchParams.get(k) || '';
  try {
    if (p === '/tt/v') return await streamVideo(req, res, q('id'), q('k'));
    if (p === '/tt/img') return await img(req, res, q('u'));
    if (p === '/tt/api/status') { await browser(); const u = await me(q('force') === '1'); if (!feeds.has('foryou:')) openFeed('foryou:', 'foryou', '').catch(() => {}); return send(200, { signedIn: !!u, me: u }); }
    if (p === '/tt/api/feed') {
      const kind = q('kind') || 'foryou';
      if (!FEED_URL[kind]) return send(400, { error: 'Unknown list' });
      const term = q('q').trim().replace(/^@/, '').slice(0, 100);
      if (kind !== 'foryou' && kind !== 'following' && kind !== 'explore' && !term) return send(400, { error: 'Type something to look for' });
      if (kind === 'following' && !(await me())) return send(401, { error: 'Sign in to see who you follow', signin: true });
      return send(200, await feed(kind, term, Math.max(0, +q('cursor') || 0), q('fresh') === '1'));
    }
    if (p === '/tt/api/comments') return send(200, await comments(q('id'), +q('cursor') || 0));
    if (req.method !== 'POST') return send(404, { error: 'Not found' });
    const b = await body(req);
    if (p === '/tt/api/like') { if (!(await me())) return send(401, { error: 'Sign in to like videos', signin: true }); return send(200, await like(String(b.id || ''), !!b.on, String(b.author || ''))); }
    if (p === '/tt/api/follow') { if (!(await me())) return send(401, { error: 'Sign in to follow people', signin: true }); return send(200, await follow(String(b.id || ''), !!b.on, String(b.author || ''))); }
    if (p === '/tt/api/login/qr') return send(200, await qr());
    if (p === '/tt/api/login/live') return send(200, b.t ? await liveInput(b) : await liveFrame());
    if (p === '/tt/api/login/cancel') { closeTab(loginTab); loginTab = null; return send(200, { ok: true }); }
    if (p === '/tt/api/signout') {
      const c = await browser();
      for (const [k, f] of feeds) { closeTab(f.tab); feeds.delete(k); }
      const t = await newTab({ quiet: false }); await c.call('Network.clearBrowserCookies', {}, t.sid).catch(() => {}); await c.call('Storage.clearDataForOrigin', { origin: TT, storageTypes: 'all' }, t.sid).catch(() => {}); closeTab(t);
      ckCache.t = 0; meCache = { t: 0, v: null };
      return send(200, { ok: true });
    }
    return send(404, { error: 'Not found' });
  } catch (e) { send(500, { error: e.message || 'Something went wrong' }); }
}
