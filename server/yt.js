// Kushtube: a private YouTube client for SanjivramOS.
// Sources: yt-dlp (kept loaded in a helper process, server/yt-worker.py), Invidious and Piped — asked in parallel,
// first good answer wins. Lists are served from cache instantly and refreshed in the background; videos you're likely
// to open are resolved ahead of time (prefetch). Video is streamed through this server with Range support, using
// one-time tokens for links the server resolved itself (never an open proxy).
// Routes (signed-in, "Use the YouTube app" permission):
//   GET /yt/api/status · home?region= · search?q=&page=&type= · shorts?page=&q= · video/:id · related/:id?title=
//       channel/:id?tab=videos|shorts · feed?ids=UC..,UC.. · foryou?subs=&aff=&seeds=&seen= · shortsfy?page=&chans=&seen= · sponsor/:id · prefetch?ids=a,b,c
//   GET /yt/stream?t=TOKEN · /yt/img?u=<YouTube image URL> (thumbnails/avatars fetched by this server, cached on disk)
// Env: SJ_YT_INSTANCES (Invidious bases), SJ_YT_PIPED (extra Piped API bases), SJ_YT_NO_YTDLP=1, SJ_YT_NO_WARM=1
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { permGate } from './social.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const FALLBACK_INV = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.f5.si', 'https://iv.melmac.space', 'https://invidious.privacyredirect.com', 'https://inv.tux.pizza', 'https://invidious.jing.rocks'];
const PIPED = (process.env.SJ_YT_PIPED || '').split(',').map(s => s.trim()).filter(Boolean).concat(['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://pipedapi.r4fo.com']);
const ENV_INV = (process.env.SJ_YT_INSTANCES || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const CHAN = /^UC[\w-]{22}$/, VID = /^[\w-]{11}$/;
let lastErr = '', lastSource = '', lastUse = 0;

/* ---------------- cache: fresh for `ttl`, then served stale (and refreshed in the background) until `stale` ---------------- */
const cache = new Map();
function cached(key, ttl, fn, stale = ttl * 8) {
  let c = cache.get(key); const now = Date.now();
  if (c && 'v' in c && now - c.t < ttl) return Promise.resolve(c.v);
  if (!c) { c = {}; cache.set(key, c); if (cache.size > 800) cache.delete(cache.keys().next().value); }
  if (!c.p) c.p = fn().then(v => { c.v = v; c.t = Date.now(); c.p = null; return v; }, e => { c.p = null; throw e; });
  if ('v' in c && now - c.t < stale) { c.p.catch(() => {}); return Promise.resolve(c.v); }
  return c.p;
}
const has = key => { const c = cache.get(key); return !!(c && ('v' in c || c.p)); };

/* ---------------- helpers ---------------- */
async function getJSON(url, ms = 6000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ac.signal }); if (!r.ok) throw new Error(`${new URL(url).host} said ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
const https = u => !u ? '' : u.startsWith('//') ? 'https:' + u : u;
const thumbOf = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const fmtLen = s => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const num = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
const clean = list => list.filter(Boolean);
const nonEmpty = l => { if (!l.length) throw new Error('nothing found'); return l; };
/** run every source at once; the first that works wins */
function race(...fns) {
  return Promise.any(fns.map(f => f())).catch(e => { const m = ((e && e.errors) || []).map(x => x && x.message).filter(Boolean)[0] || 'nothing answered'; lastErr = m; throw new Error(m); });
}
/** try groups in order (each group can itself be a race) */
async function any(...fns) { let err; for (const f of fns) { try { return await f(); } catch (e) { err = e; } } lastErr = err ? err.message : ''; throw err || new Error('Nothing worked'); }

const tokens = new Map();   // token → { url, exp, mime }
function token(url, mime) { const t = crypto.randomBytes(12).toString('base64url'); tokens.set(t, { url, exp: Date.now() + 5 * 3600e3, mime }); if (tokens.size > 8000) for (const [k, v] of tokens) { if (v.exp < Date.now()) tokens.delete(k); if (tokens.size < 6000) break; } return t; }
const streamUrl = (url, mime) => '/yt/stream?t=' + token(url, mime);

/* ---------------- Invidious + Piped (parallel) ---------------- */
let invList = null, invAt = 0, goodInv = null, goodPiped = null;
async function invInstances() {
  if (ENV_INV.length) return ENV_INV;
  if (!invList || Date.now() - invAt > 6 * 3600e3) {
    invAt = Date.now();
    try {
      const j = await getJSON('https://api.invidious.io/instances.json?sort_by=health', 5000);
      const up = j.filter(([, d]) => d && d.type === 'https' && d.api && !(d.monitor && d.monitor.down)).map(([, d]) => d.uri.replace(/\/$/, ''));
      invList = up.length ? [...new Set(up.concat(FALLBACK_INV))] : FALLBACK_INV.slice();
    } catch { invList = invList || FALLBACK_INV.slice(); }
  }
  return goodInv ? [goodInv, ...invList.filter(x => x !== goodInv)] : invList;
}
async function inv(path) {
  const list = (await invInstances()).slice(0, 3);
  return Promise.any(list.map(async base => { const j = await getJSON(base + path); if (j && j.error) throw new Error(j.error); return { j, base }; }))
    .then(r => { goodInv = r.base; lastSource = 'invidious ' + new URL(r.base).host; return r; }, () => { goodInv = null; throw new Error('No Invidious instance answered'); });
}
async function piped(path) {
  const list = (goodPiped ? [goodPiped, ...PIPED.filter(x => x !== goodPiped)] : PIPED).slice(0, 3);
  return Promise.any(list.map(async base => { const j = await getJSON(base + path); if (j && j.error) throw new Error(j.error); return { j, base }; }))
    .then(r => { goodPiped = r.base; lastSource = 'piped ' + new URL(r.base).host; return r; }, () => { goodPiped = null; throw new Error('No Piped instance answered'); });
}

/* ---------------- yt-dlp: one helper process that stays loaded (falls back to running the yt-dlp command) ---------------- */
let hasYtdlp = null;
function ytdlpOk() { if (process.env.SJ_YT_NO_YTDLP) return false; if (hasYtdlp === null) { try { execFileSync('yt-dlp', ['--version'], { stdio: 'ignore', timeout: 8000 }); hasYtdlp = true; } catch { hasYtdlp = false; } } return hasYtdlp; }
let W = null, workerBroken = 0, idleT = null;
function worker() {
  if (W && !W.dead) return W;
  if (Date.now() - workerBroken < 10 * 60e3) return null;
  try {
    const proc = spawn('python3', [fileURLToPath(new URL('./yt-worker.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'ignore'] });
    const w = W = { proc, pend: new Map(), n: 0, dead: false, ready: false };
    readline.createInterface({ input: proc.stdout }).on('line', l => {
      let j; try { j = JSON.parse(l); } catch { return; }
      if (j.ready) { w.ready = true; return; }
      const p = w.pend.get(j.n); if (!p) return; w.pend.delete(j.n); clearTimeout(p.t);
      j.ok ? p.res(j.data) : p.rej(new Error(j.error || 'yt-dlp failed'));
    });
    proc.on('error', () => {}); proc.stdin.on('error', () => {});
    proc.on('exit', () => { if (!w.ready) workerBroken = Date.now(); w.dead = true; for (const p of w.pend.values()) { clearTimeout(p.t); p.rej(new Error('yt-dlp helper stopped')); } w.pend.clear(); });
    return w;
  } catch { workerBroken = Date.now(); return null; }
}
function ytdlpCli(url, flat, end, ms) {
  return new Promise((res, rej) => {
    const args = ['--no-warnings', '-J', ...(flat ? ['--flat-playlist', '--playlist-end', String(end || 30)] : ['--no-playlist']), url];
    const c = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; const t = setTimeout(() => c.kill('SIGKILL'), ms);
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err = (err + d).slice(-800); });
    c.on('error', () => {});
    c.on('close', code => { clearTimeout(t); try { res(JSON.parse(out)); } catch { rej(new Error((err.trim().split('\n').pop() || `yt-dlp exited ${code}`).slice(0, 300))); } });
  });
}
function ytdlp(url, { flat = false, end = 30, ms = 40000 } = {}) {
  if (!ytdlpOk()) return Promise.reject(new Error('yt-dlp isn’t installed'));
  clearTimeout(idleT); idleT = setTimeout(() => { if (W && !W.dead && !W.pend.size) W.proc.kill(); }, 15 * 60e3);   // free the memory when nobody watches
  const w = worker();
  const p = !w ? ytdlpCli(url, flat, end, ms) : new Promise((res, rej) => {
    const n = ++w.n, t = setTimeout(() => { w.pend.delete(n); rej(new Error('yt-dlp took too long')); }, ms);
    w.pend.set(n, { res, rej, t }); w.proc.stdin.write(JSON.stringify({ n, url, flat, end }) + '\n');
  });
  return p.then(v => { lastSource = 'yt-dlp'; return v; });
}
// background work (prefetch) never takes more than 2 yt-dlp slots, so what you tapped always goes first
let bgBusy = 0; const bgQueue = [];
function background(fn) { bgQueue.push(fn); pumpBg(); }
function pumpBg() { while (bgBusy < 2 && bgQueue.length) { const fn = bgQueue.shift(); bgBusy++; fn().catch(() => {}).finally(() => { bgBusy--; pumpBg(); }); } }

/* ---------------- normalisers ---------------- */
function invCard(v) {
  if (v.type === 'channel') return { type: 'channel', id: v.authorId, name: v.author, thumb: https(((v.authorThumbnails || []).slice(-1)[0] || {}).url), subs: v.subCount, videos: v.videoCount, desc: v.description || '' };
  if (v.type === 'playlist' || !VID.test(v.videoId || '')) return null;
  const len = v.lengthSeconds | 0;
  return { type: 'video', id: v.videoId, title: v.title, author: v.author, authorId: v.authorId, len, length: len ? fmtLen(len) : (v.liveNow ? 'LIVE' : ''), views: v.viewCount, published: v.published ? v.published * 1000 : 0, ago: v.publishedText || '', thumb: thumbOf(v.videoId), live: !!v.liveNow, short: (len > 0 && len <= 62) || !!v.isShort };
}
const pipedId = u => ((/[?&]v=([\w-]{11})/.exec(u || '') || /\/shorts\/([\w-]{11})/.exec(u || '') || [])[1]);
const pipedChan = u => ((/\/channel\/(UC[\w-]{22})/.exec(u || '') || [])[1]);
function pipedCard(v) {
  if (v.type === 'channel') return { type: 'channel', id: pipedChan(v.url), name: v.name, thumb: v.thumbnail, subs: v.subscribers, videos: v.videos, desc: v.description || '' };
  if (v.type === 'playlist') return null;
  const id = pipedId(v.url); if (!id) return null;
  const len = v.duration > 0 ? v.duration : 0;
  return { type: 'video', id, title: v.title, author: v.uploaderName, authorId: pipedChan(v.uploaderUrl), len, length: len ? fmtLen(len) : (v.duration === -1 && !v.isShort && !(v.uploaded > 0) && !v.uploadedDate ? 'LIVE' : ''), views: v.views, published: v.uploaded > 0 ? v.uploaded : 0, ago: v.uploadedDate || '', thumb: thumbOf(id), short: !!v.isShort || (len > 0 && len <= 62) };
}
function dlCard(e) {
  if (!e || !VID.test(e.id || '')) return null;
  const len = e.duration | 0;
  return { type: 'video', id: e.id, title: e.title, author: e.channel || e.uploader, authorId: e.channel_id, len, length: len ? fmtLen(len) : '', views: e.view_count, published: e.timestamp ? e.timestamp * 1000 : 0, ago: '', thumb: thumbOf(e.id), short: (len > 0 && len <= 62) || /\/shorts\//.test(e.url || '') };
}

/* ---------------- lists ---------------- */
function home(region) {
  return cached('home:' + region, 15 * 60e3, () => any(
    () => race(
      async () => { const { j } = await inv(`/api/v1/trending?region=${region}`); return nonEmpty(clean(j.map(invCard))); },
      async () => { const { j } = await piped(`/trending?region=${region}`); return nonEmpty(clean(j.map(pipedCard)).filter(v => v.length !== 'LIVE')); },
    ),
    async () => { const { j } = await inv('/api/v1/popular'); return nonEmpty(clean(j.map(x => invCard({ ...x, type: 'video' })))); },
    async () => nonEmpty(clean(((await ytdlp('ytsearch40:trending today', { flat: true, end: 40 })).entries || []).map(dlCard))),
  ), 48 * 3600e3);
}
function search(q, page, type) {
  return cached(`s:${type}:${page}:${q}`, 15 * 60e3, () => any(
    () => race(
      async () => { const { j } = await inv(`/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&type=${type}`); return nonEmpty(clean(j.map(invCard))); },
      ...(page === 1 ? [async () => { const { j } = await piped(`/search?q=${encodeURIComponent(q)}&filter=${type === 'channel' ? 'channels' : 'videos'}`); return nonEmpty(clean((j.items || []).map(pipedCard))); }] : []),
    ),
    async () => clean(((await ytdlp(`ytsearch${20 * page}:${q}`, { flat: true, end: 20 * page })).entries || []).slice(20 * (page - 1)).map(dlCard)),
  ), 24 * 3600e3);
}
const SHORT_TAGS = ['shorts', 'funny', 'satisfying', 'gaming', 'animals', 'football', 'minecraft', 'lifehacks', 'music', 'science', 'cooking', 'art', 'basketball', 'magic', 'dance', 'cars'];
function shorts(page, q) {
  const tag = q ? q.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() || 'shorts' : SHORT_TAGS[(page - 1) % SHORT_TAGS.length];
  const topic = q ? (/#shorts/i.test(q) ? q : q + ' #shorts') : '#' + tag + ' #shorts';
  return cached(`sh:${page}:${topic}`, 30 * 60e3, () => any(
    // YouTube's own hashtag Shorts shelf (real vertical Shorts)
    async () => nonEmpty(clean(((await ytdlp(`https://www.youtube.com/hashtag/${encodeURIComponent(tag)}/shorts`, { flat: true, end: 30 })).entries || []).map(e => { const c = dlCard(e); if (c) c.short = true; return c; }))),
    () => race(
      async () => { const { j } = await inv(`/api/v1/search?q=${encodeURIComponent(topic)}&type=video&duration=short`); return nonEmpty(clean(j.map(invCard)).filter(v => v.len > 0 && v.len <= 75)); },
      async () => { const { j } = await piped(`/search?q=${encodeURIComponent(topic)}&filter=videos`); return nonEmpty(clean((j.items || []).map(pipedCard)).filter(v => v.short || (v.len > 0 && v.len <= 75))); },
    ),
  ), 24 * 3600e3);
}

/* ---------------- one video: playable streams (video-only + audio for the MSE player, plus combined ones) ---------------- */
const blank = () => ({ progressive: [], video: [], audio: [], captions: [] });
const playable = S => S.progressive.length || (S.video.length && S.audio.length);
function dedupeVideo(list) {
  const by = new Map();
  for (const v of list) { const k = v.height + (v.fps > 30 ? 'p60' : ''); const o = by.get(k); if (!o || (v.bitrate || 0) > (o.bitrate || 0)) by.set(k, v); }
  return [...by.values()].sort((a, b) => b.height - a.height || (b.fps || 0) - (a.fps || 0));
}
/* Videos can carry several audio tracks (YouTube auto-dubs into Hindi etc.): original track first, then bitrate. */
const byAudio = (a, b) => (b.orig || 0) - (a.orig || 0) || b.bitrate - a.bitrate;
function fromYtdlp(id, j) {
  const S = blank(), vids = [];
  for (const f of j.formats || []) {
    if (!f.url || (f.protocol && !/^https?$/.test(f.protocol))) continue;
    const v = f.vcodec && f.vcodec !== 'none', a = f.acodec && f.acodec !== 'none';
    const short = Math.min(f.width || 1e4, f.height || 1e4);
    if (v && a && f.ext === 'mp4') S.progressive.push({ label: short + 'p', height: short, width: f.width, mime: `video/mp4; codecs="${f.vcodec}, ${f.acodec}"`, url: streamUrl(f.url, 'video/mp4') });
    else if (v && !a && f.ext === 'mp4' && /^avc1/.test(f.vcodec)) vids.push({ label: short + 'p' + (f.fps > 30 ? Math.round(f.fps) : ''), height: short, width: f.width, h: f.height, fps: f.fps, bitrate: f.tbr || 0, mime: `video/mp4; codecs="${f.vcodec}"`, url: streamUrl(f.url, 'video/mp4') });
    else if (!v && a && f.ext === 'm4a' && !/drc/.test(f.format_id || '')) S.audio.push({ orig: /original/i.test(f.format_note || '') || (f.language_preference || 0) >= 10 ? 2 : /dub/i.test(f.format_note || '') || (f.language_preference || 0) < 0 ? -1 : /default/i.test(f.format_note || '') ? 1 : 0, lang: f.language || '', bitrate: (f.abr || 0) * 1000, mime: `audio/mp4; codecs="${f.acodec}"`, url: streamUrl(f.url, 'audio/mp4') });
  }
  S.video = dedupeVideo(vids);
  S.audio.sort(byAudio);
  for (const [lang, subs] of Object.entries(j.subtitles || {})) { const v = (subs || []).find(x => x.ext === 'vtt'); if (v && S.captions.length < 30) S.captions.push({ label: (subs[0] && subs[0].name) || lang, lang, url: streamUrl(v.url, 'text/vtt') }); }
  if (!playable(S)) throw new Error('no playable formats');
  return { id, title: j.title, desc: j.description || '', author: j.channel || j.uploader, authorId: j.channel_id, authorThumb: '', subs: j.channel_follower_count ? num(j.channel_follower_count) + ' subscribers' : '', views: j.view_count, likes: j.like_count, published: j.timestamp ? j.timestamp * 1000 : 0, ago: '', len: j.duration, live: !!j.is_live, vertical: (j.height || 0) > (j.width || 0), thumb: thumbOf(id), streams: S, related: [], source: 'yt-dlp' };
}
function fromInvidious(id, j, base) {
  const S = blank(), vids = [];
  for (const f of j.formatStreams || []) S.progressive.push({ label: f.qualityLabel || f.quality, height: parseInt(f.qualityLabel || f.resolution) || 0, mime: f.type || 'video/mp4', url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, 'video/mp4') });
  for (const f of j.adaptiveFormats || []) {
    const t = f.type || '';
    if (/^video\/mp4/.test(t) && /avc1/.test(t)) { const h = parseInt(f.resolution || f.qualityLabel) || 0; vids.push({ label: f.qualityLabel, height: h, fps: f.fps, bitrate: +f.bitrate || 0, mime: t, url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, 'video/mp4') }); }
    if (/^audio\/mp4/.test(t)) S.audio.push({ orig: f.audioTrack ? (/original/i.test(f.audioTrack.displayName || '') ? 2 : f.audioTrack.audioIsDefault ? 1 : -1) : 0, bitrate: +f.bitrate || 0, mime: t, url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, 'audio/mp4') });
  }
  S.video = dedupeVideo(vids); S.audio.sort(byAudio);
  for (const c of j.captions || []) S.captions.push({ label: c.label, lang: c.language_code || c.languageCode, url: streamUrl(base + c.url, 'text/vtt') });
  if (!playable(S)) throw new Error('no playable formats');
  return { id, title: j.title, desc: j.description || '', author: j.author, authorId: j.authorId, authorThumb: https(((j.authorThumbnails || []).slice(-1)[0] || {}).url), subs: j.subCountText || '', views: j.viewCount, likes: j.likeCount, published: j.published * 1000, ago: j.publishedText, len: j.lengthSeconds, live: !!j.liveNow, thumb: thumbOf(id),
    streams: S, related: clean((j.recommendedVideos || []).map(x => invCard({ ...x, type: 'video' }))), source: 'invidious' };
}
function fromPiped(id, j) {
  const S = blank(), vids = [];
  for (const f of j.videoStreams || []) {
    if (!/\d/.test(f.quality || '') || !/videoplayback|googlevideo/.test(f.url || '')) continue;
    const h = parseInt(f.quality) || 0, mime = f.codec ? `${f.mimeType}; codecs="${f.codec}"` : f.mimeType;
    if (f.videoOnly) { if (/avc1/.test(f.codec || '')) vids.push({ label: f.quality, height: h, fps: f.fps, bitrate: f.bitrate || 0, mime, url: streamUrl(f.url, f.mimeType) }); }
    else S.progressive.push({ label: f.quality, height: h, mime: f.mimeType, url: streamUrl(f.url, f.mimeType) });
  }
  for (const f of j.audioStreams || []) if (/mp4|m4a/.test(f.mimeType || '')) S.audio.push({ orig: f.audioTrackType ? (/^ORIGINAL$/i.test(f.audioTrackType) ? 2 : -1) : 0, lang: f.audioTrackLocale || '', bitrate: f.bitrate || 0, mime: f.codec ? `audio/mp4; codecs="${f.codec}"` : 'audio/mp4', url: streamUrl(f.url, 'audio/mp4') });
  S.video = dedupeVideo(vids); S.audio.sort(byAudio);
  for (const c of j.subtitles || []) S.captions.push({ label: c.name, lang: c.code, url: streamUrl(c.url, 'text/vtt') });
  if (!playable(S)) throw new Error('no playable formats');
  return { id, title: j.title, desc: (j.description || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''), author: j.uploader, authorId: pipedChan(j.uploaderUrl), authorThumb: j.uploaderAvatar, subs: j.uploaderSubscriberCount > 0 ? num(j.uploaderSubscriberCount) + ' subscribers' : '', views: j.views, likes: j.likes, published: j.uploadDate ? Date.parse(j.uploadDate) : 0, ago: '', len: j.duration, live: !!j.livestream, thumb: thumbOf(id),
    streams: S, related: clean((j.relatedStreams || []).map(pipedCard)), source: 'piped' };
}
function video(id) {
  // stream links last ~6 hours, so a resolved video is kept 3 hours and never served stale
  return cached('v:' + id, 3 * 3600e3, () => any(
    async () => fromYtdlp(id, await ytdlp(`https://www.youtube.com/watch?v=${id}`)),
    () => race(async () => { const { j, base } = await inv(`/api/v1/videos/${id}`); return fromInvidious(id, j, base); },
      async () => { const { j } = await piped(`/streams/${id}`); return fromPiped(id, j); }),
  ), 3 * 3600e3);
}
function prefetch(ids) { for (const id of ids) if (!has('v:' + id)) background(() => video(id)); }
// related videos + channel avatar: Invidious and Piped race; if both fail, search for the title
function related(id, title) {
  return cached('rel:' + id, 3 * 3600e3, () => race(
    async () => { const { j: r } = await inv(`/api/v1/videos/${id}`); return { related: nonEmpty(clean((r.recommendedVideos || []).map(x => invCard({ ...x, type: 'video' })))), authorThumb: https(((r.authorThumbnails || []).slice(-1)[0] || {}).url) }; },
    async () => { const { j: r } = await piped(`/streams/${id}`); return { related: nonEmpty(clean((r.relatedStreams || []).map(pipedCard))), authorThumb: r.uploaderAvatar }; },
  ).catch(async () => ({ related: title ? (await search(title.split(/[|(\[]/)[0].slice(0, 60), 1, 'video').catch(() => [])).filter(v => v.id !== id) : [] })));
}
async function chanYtdlp(id, tab) {
  const j = await ytdlp(`https://www.youtube.com/channel/${id}/${tab}`, { flat: true, end: 30 });
  return { id, name: j.channel || j.uploader || j.title, thumb: '', banner: '', subs: j.channel_follower_count || 0, desc: j.description || '', videos: clean((j.entries || []).map(e => { const c = dlCard(e); if (c && tab === 'shorts') c.short = true; return c; })) };
}
function channel(id, tab) {
  return cached(`ch:${id}:${tab}`, 30 * 60e3, () => any(
    () => race(
      async () => {
        const [{ j: info }, { j: list }] = await Promise.all([inv(`/api/v1/channels/${id}`), inv(`/api/v1/channels/${id}/${tab}`)]);
        return { id, name: info.author, thumb: https(((info.authorThumbnails || []).slice(-1)[0] || {}).url), banner: https(((info.authorBanners || [])[0] || {}).url), subs: info.subCount, desc: info.description || '', videos: nonEmpty(clean((list.videos || list || []).map(x => invCard({ ...x, type: 'video', isShort: tab === 'shorts' })))) };
      },
      async () => {
        const { j } = await piped(`/channel/${id}`);
        let vids = j.relatedStreams || [];
        if (tab === 'shorts') { const t = (j.tabs || []).find(x => x.name === 'shorts'); if (!t) throw new Error('no shorts tab'); const r = await piped(`/channels/tabs?data=${encodeURIComponent(t.data)}`); vids = r.j.content || []; }
        let videos = clean(vids.map(pipedCard));
        // Piped stopped listing a channel's normal videos (only a Shorts tab) — take the list from yt-dlp, keep Piped's name/avatar/banner
        if (!videos.length) videos = (await chanYtdlp(id, tab)).videos;
        return { id, name: j.name, thumb: j.avatarUrl, banner: j.bannerUrl, subs: j.subscriberCount, desc: j.description || '', videos: nonEmpty(videos) };
      },
    ),
    () => chanYtdlp(id, tab),
  ), 24 * 3600e3);
}
async function feed(ids) {
  const parts = await Promise.all(ids.map(id => channel(id, 'videos').then(c => c.videos.slice(0, 8).map(v => ({ ...v, author: v.author || c.name, authorId: id }))).catch(() => [])));
  return parts.flat().sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 120);
}
function sponsor(id) {
  return cached('sb:' + id, 3600e3, async () => {
    try { const j = await getJSON(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${encodeURIComponent('["sponsor","selfpromo","interaction","intro","outro"]')}`, 4000); return j.map(x => ({ start: x.segment[0], end: x.segment[1], cat: x.category })); }
    catch { return []; }
  });
}

/* ---------------- For you: subscriptions + "because you watched" + similar channels, mixed and de-duplicated ----------------
   subs = subscribed channel ids, aff = channels you watch most (most first), seeds = videos you watched/liked recently,
   seen = videos to leave out. Every input is cached elsewhere (channel 30 min, related 3 h), so a repeat is cheap. */
async function limitAll(list, n, fn) { const out = new Array(list.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; try { out[k] = await fn(list[k]); } catch { out[k] = null; } } })); return out; }
async function forYou({ subs, aff, seeds, seen, region }) {
  const now = Date.now(), seenSet = new Set(seen), subSet = new Set(subs);
  const affRank = new Map(aff.map((id, i) => [id, i]));
  const affinity = id => affRank.has(id) ? 1.5 - affRank.get(id) / Math.max(10, aff.length) : 0;   // 0..1.5
  const fresh = ms => ms > 0 ? Math.pow(0.5, (now - ms) / (4 * 86400e3)) : 0.25;                    // half-life 4 days
  // the subscriptions you actually watch go first; at most 14 channels per refresh
  const subPick = subs.slice().sort((a, b) => (affRank.get(a) ?? 99) - (affRank.get(b) ?? 99)).slice(0, 14);
  const chans = await limitAll(subPick, 4, id => channel(id, 'videos'));
  const cand = new Map();   // id → { v, score, why }
  const add = (v, score, why) => {
    if (!v || !v.id || v.short || v.length === 'LIVE' || seenSet.has(v.id)) return;
    const c = cand.get(v.id); if (c) { c.score += score * 0.5; return; }
    cand.set(v.id, { v, score, why });
  };
  const subLatest = [];
  chans.forEach((c, i) => {
    if (!c) return; const id = subPick[i];
    c.videos.filter(v => !v.short).slice(0, 6).forEach((v, k) => {
      v = { ...v, author: v.author || c.name, authorId: v.authorId || id };
      if (k === 0) subLatest.push(v);
      add(v, 3 + 2.5 * fresh(v.published) + affinity(id) - k * 0.3, { kind: 'sub', name: c.name });
    });
  });
  // "because you watched": related videos of recent watches + newest uploads of the subs you watch most
  const seedList = [...seeds.slice(0, 8).map(id => ({ id })), ...subLatest.slice(0, 5)].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 12);
  const rel = await limitAll(seedList, 4, s => related(s.id, s.title || ''));
  const chanHits = new Map();   // channel → { n, name, from }
  rel.forEach((r, i) => {
    if (!r || !r.related) return;
    const seed = seedList[i], watched = !seed.author, weight = watched ? 1.2 : 0.8;
    r.related.slice(0, 15).forEach((v, k) => {
      if (v.authorId && !subSet.has(v.authorId)) { const h = chanHits.get(v.authorId) || { n: 0, name: v.author, from: seed.author || '' }; h.n++; chanHits.set(v.authorId, h); }
      add(v, weight * (1.6 - k * 0.07) + 0.6 * fresh(v.published) + Math.min(0.6, Math.log10((v.views || 0) + 1) / 10) + affinity(v.authorId),
        watched ? { kind: 'because', seed: seed.id } : { kind: 'similar', name: seed.author });
    });
  });
  // channels that keep coming up next to what you like are "similar channels"
  const similar = [...chanHits.entries()].filter(([, h]) => h.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  for (const [id, h] of similar) for (const c of cand.values()) if (c.v.authorId === id) { c.score += 0.35 * Math.min(4, h.n); if (c.why.kind !== 'sub') c.why = { kind: 'similar', name: h.from || h.name }; }
  // a little trending so the feed never gets stale
  try { (await home(region)).slice(0, 12).forEach((v, k) => add(v, 1.1 - k * 0.05, { kind: 'trending' })); } catch {}
  // three ranked lanes, blended in a fixed rhythm: subscriptions · discovery (because you watched / similar) · trending
  const lanes = { S: [], D: [], T: [] };
  for (const c of cand.values()) lanes[c.why.kind === 'sub' ? 'S' : c.why.kind === 'trending' ? 'T' : 'D'].push(c);
  const out = [], perChan = new Map(), used = new Set();
  const take = lane => {   // best in the lane, but channels already shown (and very recent ones) are pushed down
    const L = lanes[lane]; let bi = -1, bs = -1e9;
    for (let i = 0; i < L.length; i++) {
      const c = L[i]; if (used.has(c.v.id)) continue;
      const sc = c.score * Math.pow(0.55, perChan.get(c.v.authorId) || 0) - (out.slice(-3).some(o => o.v.authorId === c.v.authorId) ? 1.5 : 0);
      if (sc > bs) { bs = sc; bi = i; }
    }
    if (bi < 0) return false;
    const [c] = L.splice(bi, 1); used.add(c.v.id); perChan.set(c.v.authorId, (perChan.get(c.v.authorId) || 0) + 1); out.push(c); return true;
  };
  const RHYTHM = 'SDDSDTSDDSDD';
  for (let i = 0; out.length < 60 && (lanes.S.length + lanes.D.length + lanes.T.length); i++) {
    const want = RHYTHM[i % RHYTHM.length];
    if (!take(want)) take(want === 'S' ? 'D' : 'S') || take('D') || take('T');
  }
  return {
    items: out.map(c => ({ ...c.v, why: c.why })),
    similar: similar.map(([id, h]) => ({ id, name: (h.name || '').replace(/ and \d+ more$/, ''), hits: h.n })),
  };
}

/* ---------------- Shorts for you: Shorts from your subs, channels whose Shorts you watch/like, and similar channels,
   two of those to every general hashtag Short; each page walks on to the next few channels ---------------- */
async function shortsForYou({ chans, seen, page }) {
  const seenSet = new Set(seen), per = 6, pick = [];
  const depth = chans.length ? Math.floor((page - 1) * per / chans.length) * 4 : 0;   // each pass over your channels goes 4 Shorts deeper
  if (chans.length) for (let i = 0; i < per; i++) pick.push(chans[((page - 1) * per + i) % chans.length]);
  const uniq = [...new Set(pick)];
  const lists = await limitAll(uniq, 3, id => channel(id, 'shorts'));
  // newest few from each channel, dealt round-robin so one channel never fills the screen
  const decks = lists.map((c, i) => (c ? c.videos : []).filter(v => !seenSet.has(v.id))
    .slice(depth, depth + 4).map(v => ({ ...v, short: true, author: v.author || c.name, authorId: v.authorId || uniq[i], why: { kind: 'chan', name: c.name } })));
  const mine = []; for (let k = 0; k < 4; k++) for (const d of decks) if (d[k]) mine.push(d[k]);
  let general = []; try { general = (await shorts(page, '')).filter(v => !seenSet.has(v.id)); } catch {}
  const out = [], ids = new Set(); let a = 0, b = 0;
  while (a < mine.length || b < general.length) {
    for (let n = 0; n < 2 && a < mine.length; n++) { const v = mine[a++]; if (!ids.has(v.id)) { ids.add(v.id); out.push(v); } }
    if (b < general.length) { const v = general[b++]; if (!ids.has(v.id)) { ids.add(v.id); out.push(v); } }
    if (out.length >= 30) break;
  }
  if (!out.length) throw new Error('No Shorts found');
  return out;
}

/* ---------------- warm-up: trending and the first Shorts are ready before anyone opens Kushtube ---------------- */
function warm(force) {
  if (process.env.SJ_YT_NO_WARM) return;
  if (!force && Date.now() - lastUse > 12 * 3600e3) return;
  home('US').then(l => prefetch(l.slice(0, 4).map(v => v.id))).catch(() => {});
  shorts(1, '').then(l => prefetch(l.slice(0, 3).map(v => v.id))).catch(() => {});
}
setTimeout(() => warm(true), 8000).unref();
setInterval(() => warm(false), 20 * 60e3).unref();

/* ---------------- streaming ---------------- */
async function stream(req, res, t) {
  const tk = tokens.get(t);
  if (!tk || tk.exp < Date.now()) { res.writeHead(410, { 'content-type': 'text/plain' }); res.end('This video link expired — reopen the video.'); return; }
  const ac = new AbortController(); req.on('close', () => ac.abort());
  const h = { 'user-agent': UA }; if (req.headers.range) h.range = req.headers.range;
  let up;
  try { up = await fetch(tk.url, { headers: h, redirect: 'follow', signal: ac.signal }); }
  catch (e) { if (!res.headersSent) { res.writeHead(502, { 'content-type': 'text/plain' }); res.end('Couldn’t reach the video: ' + e.message); } return; }
  const out = { 'content-type': up.headers.get('content-type') || tk.mime || 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' };
  for (const k of ['content-length', 'content-range']) { const v = up.headers.get(k); if (v) out[k] = v; }
  res.writeHead(up.status, out);
  if (!up.body || req.method === 'HEAD') { res.end(); return; }
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

/* ---------------- images: thumbnails + avatars come through this server (WebP when YouTube has it), cached on disk ---------------- */
const IMG_HOST = /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$|^proxy\.piped\.|^pipedproxy\./;
const IMG_DIR = path.join(path.resolve(process.env.SANJIVRAM_DATA || fileURLToPath(new URL('..', import.meta.url))), '.yt-img');
const IMG_MAX = 4000, imgBusy = new Map(); let imgCount = -1;
function imgPrune() {
  try {
    const files = fs.readdirSync(IMG_DIR).map(n => { const f = path.join(IMG_DIR, n); return { f, t: fs.statSync(f).mtimeMs }; }).sort((a, b) => a.t - b.t);
    for (const x of files.slice(0, Math.max(0, files.length - IMG_MAX * 0.8))) fs.rmSync(x.f, { force: true });
    imgCount = Math.min(files.length, IMG_MAX * 0.8);
  } catch { imgCount = 0; }
}
async function fetchImg(u) {
  const tries = [u];
  const m = /^https:\/\/i\d?\.ytimg\.com\/vi\/([\w-]{11})\/(\w+)\.jpg$/.exec(u);
  if (m) tries.unshift(`https://i.ytimg.com/vi_webp/${m[1]}/${m[2]}.webp`);   // about a third smaller
  for (const t of tries) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(t, { headers: { 'user-agent': UA }, signal: ac.signal });
      const type = r.headers.get('content-type') || '';
      if (r.ok && /^image\//.test(type)) { const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 200) return { type, buf }; }
    } catch {} finally { clearTimeout(tm); }
  }
  throw new Error('no image');
}
async function serveImg(req, res, u) {
  let host = ''; try { const x = new URL(u); if (x.protocol === 'https:') host = x.hostname; } catch {}
  if (!host || !IMG_HOST.test(host)) { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Not a YouTube image'); return; }
  const key = crypto.createHash('sha1').update(u).digest('hex'), file = path.join(IMG_DIR, key);
  const out = (type, buf) => { res.writeHead(200, { 'content-type': type, 'content-length': buf.length, 'cache-control': 'private, max-age=604800, immutable' }); res.end(buf); };
  try { const buf = fs.readFileSync(file); const n = buf.indexOf(10); out(buf.subarray(0, n).toString(), buf.subarray(n + 1)); return; } catch {}
  let p = imgBusy.get(key);
  if (!p) {
    p = fetchImg(u).then(r => {
      try {
        fs.mkdirSync(IMG_DIR, { recursive: true }); fs.writeFileSync(file, Buffer.concat([Buffer.from(r.type + '\n'), r.buf]));
        if (imgCount < 0) imgPrune(); else if (++imgCount > IMG_MAX) imgPrune();
      } catch {}
      return r;
    }).finally(() => imgBusy.delete(key));
    imgBusy.set(key, p);
  }
  try { const r = await p; out(r.type, r.buf); }
  catch { res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'max-age=300' }); res.end('Image not found'); }
}

/* ---------------- router ---------------- */
export async function ytApi(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/yt/')) return false;
  const send = (code, obj, maxAge = 0) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': maxAge ? `private, max-age=${maxAge}` : 'no-store' }); res.end(JSON.stringify(obj)); };
  const why = permGate(req, 'youtube', 'Kushtube');
  if (why) { send(401, { error: why }); return true; }
  lastUse = Date.now();
  try {
    if (p === '/yt/stream') { await stream(req, res, url.searchParams.get('t') || ''); return true; }
    if (p === '/yt/img') { await serveImg(req, res, url.searchParams.get('u') || ''); return true; }
    const q = k => url.searchParams.get(k) || '', page = Math.max(1, Math.min(20, +q('page') || 1));
    const region = /^[A-Z]{2}$/.test(q('region')) ? q('region') : 'US';
    let m;
    if (p === '/yt/api/status') return send(200, { ytdlp: ytdlpOk(), helper: !!(W && !W.dead && W.ready), invidious: goodInv, piped: goodPiped, last: lastSource, lastErr }), true;
    if (p === '/yt/api/home') { const items = await home(region); prefetch(items.slice(0, 4).map(v => v.id)); return send(200, { items }), true; }
    if (p === '/yt/api/search') { const s = q('q').slice(0, 200).trim(); if (!s) return send(400, { error: 'Type something to search for.' }), true; return send(200, { items: await search(s, page, q('type') === 'channel' ? 'channel' : 'video') }), true; }
    if (p === '/yt/api/shorts') { const items = await shorts(page, q('q').slice(0, 100)); prefetch(items.slice(0, 2).map(v => v.id)); return send(200, { items }), true; }
    if (p === '/yt/api/prefetch') { prefetch(q('ids').split(',').filter(x => VID.test(x)).slice(0, 8)); return send(200, { ok: true }), true; }
    if ((m = /^\/yt\/api\/video\/([\w-]{11})$/.exec(p))) return send(200, await video(m[1])), true;
    if ((m = /^\/yt\/api\/related\/([\w-]{11})$/.exec(p))) return send(200, await related(m[1], q('title').slice(0, 200)), 1800), true;
    if ((m = /^\/yt\/api\/sponsor\/([\w-]{11})$/.exec(p))) return send(200, { segments: await sponsor(m[1]) }, 3600), true;
    if ((m = /^\/yt\/api\/channel\/(UC[\w-]{22})$/.exec(p))) return send(200, await channel(m[1], q('tab') === 'shorts' ? 'shorts' : 'videos')), true;
    if (p === '/yt/api/shortsfy') {
      const ids = (k, re, n) => q(k).split(',').filter(x => re.test(x)).slice(0, n);
      const chans = [...new Set(ids('chans', CHAN, 40))], seen = ids('seen', VID, 150);
      const key = 'sfy:' + page + ':' + crypto.createHash('sha1').update(chans.join() + '|' + seen.join()).digest('hex');
      const items = await cached(key, 15 * 60e3, () => shortsForYou({ chans, seen, page }), 6 * 3600e3);
      prefetch(items.slice(0, 2).map(v => v.id)); return send(200, { items }), true;
    }
    if (p === '/yt/api/foryou') {
      const ids = (k, re, n) => q(k).split(',').filter(x => re.test(x)).slice(0, n);
      const args = { subs: ids('subs', CHAN, 80), aff: ids('aff', CHAN, 30), seeds: ids('seeds', VID, 10), seen: ids('seen', VID, 120), region };
      const key = 'fy:' + crypto.createHash('sha1').update(JSON.stringify(args)).digest('hex');
      return send(200, await cached(key, 10 * 60e3, () => forYou(args), 6 * 3600e3)), true;
    }
    if (p === '/yt/api/feed') { const ids = q('ids').split(',').filter(x => CHAN.test(x)).slice(0, 60); return send(200, { items: await feed(ids) }), true; }
    send(404, { error: 'Unknown Kushtube request' }); return true;
  } catch (e) {
    send(502, { error: `YouTube isn’t answering right now (${e.message}). Try again in a minute${ytdlpOk() ? '' : ', or install yt-dlp in Termux: pkg install yt-dlp'}.` });
    return true;
  }
}
export const _test = { invCard, pipedCard, dlCard, fromYtdlp, tokens, cached };
