// Tube: a private YouTube client for SanjivramOS. The server asks Invidious instances first, then Piped, then the local
// yt-dlp — and normalises everything into one shape. Videos are streamed through this server (Range requests work), so
// YouTube's IP-locked links play on any device, and nothing in the browser talks to Google directly except thumbnails.
// Routes (signed-in, "Use the YouTube app" permission):
//   GET /yt/api/status · home?region= · search?q=&page=&type= · shorts?page=&q= · video/:id · comments/:id?c=
//       channel/:id?tab=videos|shorts&c= · feed?ids=UC..,UC.. · sponsor/:id
//   GET /yt/stream?t=TOKEN  (only links the server resolved itself — never an open proxy)
// Env: SJ_YT_INSTANCES (comma list of Invidious bases, skips discovery), SJ_YT_PIPED (extra Piped API bases), SJ_YT_NO_YTDLP=1
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { permGate } from './social.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const FALLBACK_INV = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be', 'https://invidious.f5.si', 'https://iv.melmac.space', 'https://invidious.privacyredirect.com', 'https://inv.tux.pizza', 'https://invidious.jing.rocks'];
const PIPED = (process.env.SJ_YT_PIPED || '').split(',').map(s => s.trim()).filter(Boolean).concat(['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee', 'https://pipedapi.r4fo.com']);
const ENV_INV = (process.env.SJ_YT_INSTANCES || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const VID = /^[\w-]{11}$/, CHAN = /^UC[\w-]{22}$/;

/* ---------------- helpers ---------------- */
const cache = new Map();
async function cached(key, ttl, fn) {
  const c = cache.get(key); if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn(); cache.set(key, { t: Date.now(), v });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return v;
}
async function getJSON(url, ms = 8000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ac.signal }); if (!r.ok) throw new Error(`${new URL(url).host} said ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
const https = u => !u ? '' : u.startsWith('//') ? 'https:' + u : u;
const thumbOf = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const fmtLen = s => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const tokens = new Map();   // token → { url, exp, mime }
function token(url, mime) { const t = crypto.randomBytes(12).toString('base64url'); tokens.set(t, { url, exp: Date.now() + 5 * 3600e3, mime }); if (tokens.size > 5000) for (const [k, v] of tokens) { if (v.exp < Date.now()) tokens.delete(k); if (tokens.size < 4000) break; } return t; }
const streamUrl = (url, mime) => '/yt/stream?t=' + token(url, mime);

/* ---------------- backends ---------------- */
let invList = null, invAt = 0, goodInv = null, goodPiped = null, lastErr = '', lastSource = '';
async function invInstances() {
  if (ENV_INV.length) return ENV_INV;
  if (!invList || Date.now() - invAt > 6 * 3600e3) {
    invAt = Date.now();
    try {
      const j = await getJSON('https://api.invidious.io/instances.json?sort_by=health', 6000);
      const up = j.filter(([, d]) => d && d.type === 'https' && d.api && !(d.monitor && d.monitor.down)).map(([, d]) => d.uri.replace(/\/$/, ''));
      invList = up.length ? [...new Set(up.concat(FALLBACK_INV))] : FALLBACK_INV.slice();
    } catch { invList = invList || FALLBACK_INV.slice(); }
  }
  return goodInv ? [goodInv, ...invList.filter(x => x !== goodInv)] : invList;
}
async function inv(path) {
  let err; for (const base of (await invInstances()).slice(0, 5)) {
    try { const j = await getJSON(base + path); if (j && j.error) throw new Error(j.error); goodInv = base; lastSource = 'invidious ' + new URL(base).host; return { j, base }; }
    catch (e) { err = e; if (goodInv === base) goodInv = null; }
  }
  throw err || new Error('No Invidious instance answered');
}
async function piped(path) {
  const list = goodPiped ? [goodPiped, ...PIPED.filter(x => x !== goodPiped)] : PIPED;
  let err; for (const base of list.slice(0, 4)) {
    try { const j = await getJSON(base + path); if (j && j.error) throw new Error(j.error); goodPiped = base; lastSource = 'piped ' + new URL(base).host; return { j, base }; }
    catch (e) { err = e; if (goodPiped === base) goodPiped = null; }
  }
  throw err || new Error('No Piped instance answered');
}
let hasYtdlp = null;
function ytdlpOk() { if (process.env.SJ_YT_NO_YTDLP) return false; if (hasYtdlp === null) { try { execFileSync('yt-dlp', ['--version'], { stdio: 'ignore', timeout: 8000 }); hasYtdlp = true; } catch { hasYtdlp = false; } } return hasYtdlp; }
function ytdlp(args, ms = 40000) {
  return new Promise((res, rej) => {
    if (!ytdlpOk()) return rej(new Error('yt-dlp isn’t installed'));
    const c = spawn('yt-dlp', ['--no-warnings', '-J', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; const t = setTimeout(() => c.kill('SIGKILL'), ms);
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err = (err + d).slice(-800); });
    c.on('close', code => { clearTimeout(t); try { lastSource = 'yt-dlp'; res(JSON.parse(out)); } catch { rej(new Error((err.trim().split('\n').pop() || `yt-dlp exited ${code}`).slice(0, 300))); } });
  });
}
/** try each backend in turn; the first that works wins */
async function any(...fns) { let err; for (const f of fns) { try { return await f(); } catch (e) { err = e; } } lastErr = err ? err.message : ''; throw err || new Error('Nothing worked'); }

/* ---------------- normalisers ---------------- */
function invCard(v) {
  if (v.type === 'channel') return { type: 'channel', id: v.authorId, name: v.author, thumb: https(((v.authorThumbnails || []).slice(-1)[0] || {}).url), subs: v.subCount, videos: v.videoCount, desc: v.description || '' };
  if (v.type === 'playlist') return null;
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
  return { type: 'video', id, title: v.title, author: v.uploaderName, authorId: pipedChan(v.uploaderUrl), len, length: len ? fmtLen(len) : (v.duration === -1 ? 'LIVE' : ''), views: v.views, published: v.uploaded > 0 ? v.uploaded : 0, ago: v.uploadedDate || '', thumb: thumbOf(id), short: !!v.isShort || (len > 0 && len <= 62) };
}
function dlCard(e) {
  if (!e || !VID.test(e.id || '')) return null;
  const len = e.duration | 0;
  return { type: 'video', id: e.id, title: e.title, author: e.channel || e.uploader, authorId: e.channel_id, len, length: len ? fmtLen(len) : '', views: e.view_count, published: e.timestamp ? e.timestamp * 1000 : 0, ago: '', thumb: thumbOf(e.id), short: (len > 0 && len <= 62) || /\/shorts\//.test(e.url || '') };
}
const clean = list => list.filter(Boolean);

/* ---------------- the API ---------------- */
async function home(region) {
  return cached('home:' + region, 15 * 60e3, () => any(
    async () => { const { j } = await inv(`/api/v1/trending?region=${region}`); const l = clean(j.map(invCard)); if (!l.length) throw new Error('empty'); return l; },
    async () => { const { j } = await inv('/api/v1/popular'); return clean(j.map(x => invCard({ ...x, type: 'video' }))); },
    async () => { const { j } = await piped(`/trending?region=${region}`); return nonEmpty(clean(j.map(pipedCard))); },
    async () => clean(((await ytdlp(['--flat-playlist', '--playlist-end', '40', 'ytsearch40:trending today'])).entries || []).map(dlCard)),
  ));
}
async function search(q, page, type) {
  return cached(`s:${type}:${page}:${q}`, 10 * 60e3, () => any(
    async () => { const { j } = await inv(`/api/v1/search?q=${encodeURIComponent(q)}&page=${page}&type=${type}`); return clean(j.map(invCard)); },
    async () => { const { j } = await piped(`/search?q=${encodeURIComponent(q)}&filter=${type === 'channel' ? 'channels' : 'videos'}`); return clean((j.items || []).map(pipedCard)); },
    async () => clean(((await ytdlp(['--flat-playlist', '--playlist-end', String(20 * page), `ytsearch${20 * page}:${q}`])).entries || []).slice(20 * (page - 1)).map(dlCard)),
  ));
}
const SHORT_TAGS = ['shorts', 'funny', 'satisfying', 'gaming', 'animals', 'football', 'minecraft', 'lifehacks', 'music', 'science', 'cooking', 'art', 'basketball', 'magic', 'dance', 'cars'];
const nonEmpty = l => { if (!l.length) throw new Error('nothing found'); return l; };
async function shorts(page, q) {
  const tag = q ? q.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() || 'shorts' : SHORT_TAGS[(page - 1) % SHORT_TAGS.length];
  const topic = q ? (/#shorts/i.test(q) ? q : q + ' #shorts') : '#' + tag + ' #shorts';
  return cached(`sh:${page}:${topic}`, 20 * 60e3, () => any(
    // YouTube's own hashtag Shorts shelf (real vertical Shorts)
    async () => nonEmpty(clean(((await ytdlp(['--flat-playlist', '--playlist-end', '30', `https://www.youtube.com/hashtag/${encodeURIComponent(tag)}/shorts`])).entries || []).map(e => { const c = dlCard(e); if (c) c.short = true; return c; }))),
    async () => { const { j } = await inv(`/api/v1/search?q=${encodeURIComponent(topic)}&type=video&duration=short&page=${Math.ceil(page / SHORT_TOPICS.length) || 1}`); const l = clean(j.map(invCard)).filter(v => v.len > 0 && v.len <= 75); if (!l.length) throw new Error('no shorts'); return l; },
    async () => { const { j } = await piped(`/search?q=${encodeURIComponent(topic)}&filter=videos`); return nonEmpty(clean((j.items || []).map(pipedCard)).filter(v => v.short || (v.len > 0 && v.len <= 75))); },
  ));
}
function invStreams(j, base, id) {
  const S = { progressive: [], video: [], audio: [], captions: [] };
  for (const f of j.formatStreams || []) S.progressive.push({ itag: f.itag, label: f.qualityLabel || f.quality, mime: (f.type || '').split(';')[0] || 'video/mp4', url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, (f.type || '').split(';')[0]) });
  for (const f of j.adaptiveFormats || []) {
    const mime = (f.type || '').split(';')[0];
    if (/^video\/mp4/.test(mime) && /avc1/.test(f.type || '')) S.video.push({ itag: f.itag, label: f.qualityLabel, height: parseInt(f.resolution || f.qualityLabel) || 0, mime, url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, mime) });
    if (/^audio\/mp4/.test(mime)) S.audio.push({ itag: f.itag, bitrate: +f.bitrate || 0, mime, url: streamUrl(`${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, mime) });
  }
  for (const c of j.captions || []) S.captions.push({ label: c.label, lang: c.language_code || c.languageCode, url: streamUrl(base + c.url, 'text/vtt') });
  return S;
}
async function video(id) {
  return cached('v:' + id, 60 * 60e3, () => any(
    () => videoDl(id),
    async () => {
      const { j, base } = await inv(`/api/v1/videos/${id}`);
      const st = invStreams(j, base, id); if (!st.progressive.length && !(st.video.length && st.audio.length)) throw new Error('no playable formats');
      return { id, title: j.title, desc: j.description || '', author: j.author, authorId: j.authorId, authorThumb: https(((j.authorThumbnails || []).slice(-1)[0] || {}).url), subs: j.subCountText || '', views: j.viewCount, likes: j.likeCount, published: j.published * 1000, ago: j.publishedText, len: j.lengthSeconds, live: !!j.liveNow, thumb: thumbOf(id), keywords: j.keywords || [],
        streams: st, related: clean((j.recommendedVideos || []).map(x => invCard({ ...x, type: 'video' }))), source: 'invidious' };
    },
    async () => {
      const { j } = await piped(`/streams/${id}`);
      const S = { progressive: [], video: [], audio: [], captions: [] };
      for (const f of j.videoStreams || []) { if (!/\d/.test(f.quality || '') || !/videoplayback|googlevideo/.test(f.url || '')) continue; const st = { itag: f.itag, label: f.quality, height: parseInt(f.quality) || 0, mime: f.mimeType, url: streamUrl(f.url, f.mimeType) }; if (f.videoOnly) { if (/avc1/.test(f.codec || '') || f.mimeType === 'video/mp4') S.video.push(st); } else S.progressive.push(st); }
      for (const f of j.audioStreams || []) if (/mp4|m4a/.test(f.mimeType || '')) S.audio.push({ itag: f.itag, bitrate: f.bitrate || 0, mime: f.mimeType, url: streamUrl(f.url, f.mimeType) });
      for (const c of j.subtitles || []) S.captions.push({ label: c.name, lang: c.code, url: streamUrl(c.url, 'text/vtt') });
      if (!S.progressive.length && !(S.video.length && S.audio.length)) throw new Error('no playable formats');
      return { id, title: j.title, desc: (j.description || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''), author: j.uploader, authorId: pipedChan(j.uploaderUrl), authorThumb: j.uploaderAvatar, subs: j.uploaderSubscriberCount > 0 ? j.uploaderSubscriberCount.toLocaleString() + ' subscribers' : '', views: j.views, likes: j.likes, published: j.uploadDate ? Date.parse(j.uploadDate) : 0, ago: '', len: j.duration, live: !!j.livestream, thumb: thumbOf(id), keywords: j.tags || [],
        streams: S, related: clean((j.relatedStreams || []).map(pipedCard)), source: 'piped' };
    },
  ));
}
async function videoDl(id) {
      const j = await ytdlp(['--no-playlist', `https://www.youtube.com/watch?v=${id}`]);
      const S = { progressive: [], video: [], audio: [], captions: [] };
      for (const f of j.formats || []) {
        if (!f.url || f.protocol && !/^https?$/.test(f.protocol)) continue;
        const v = f.vcodec && f.vcodec !== 'none', a = f.acodec && f.acodec !== 'none';
        if (v && a && f.ext === 'mp4') S.progressive.push({ itag: f.format_id, label: (f.height || '') + 'p', mime: 'video/mp4', url: streamUrl(f.url, 'video/mp4') });
        else if (v && !a && f.ext === 'mp4' && /avc1/.test(f.vcodec)) S.video.push({ itag: f.format_id, label: f.height + 'p', height: f.height || 0, mime: 'video/mp4', url: streamUrl(f.url, 'video/mp4') });
        else if (!v && a && f.ext === 'm4a') S.audio.push({ itag: f.format_id, bitrate: (f.abr || 0) * 1000, mime: 'audio/mp4', url: streamUrl(f.url, 'audio/mp4') });
      }
      for (const [lang, subs] of Object.entries(j.subtitles || {})) { const v = (subs || []).find(x => x.ext === 'vtt'); if (v && S.captions.length < 30) S.captions.push({ label: (subs[0] && subs[0].name) || lang, lang, url: streamUrl(v.url, 'text/vtt') }); }
      if (!S.progressive.length && !(S.video.length && S.audio.length)) throw new Error('no playable formats');
      const extra = await Promise.race([related(id, j.title), new Promise(r => setTimeout(() => r({}), 1500))]).catch(() => ({}));
      lastSource = 'yt-dlp';
      return { id, title: j.title, desc: j.description || '', author: j.channel || j.uploader, authorId: j.channel_id, authorThumb: extra.authorThumb || '', subs: j.channel_follower_count ? num(j.channel_follower_count) + ' subscribers' : '', views: j.view_count, likes: j.like_count, published: j.timestamp ? j.timestamp * 1000 : 0, ago: '', len: j.duration, live: !!j.is_live, thumb: thumbOf(id), keywords: j.tags || [], streams: S, related: extra.related || [], source: 'yt-dlp' };
}
// related videos + channel avatar: Invidious and Piped race; if both fail, search for the title
function related(id, title) {
  return cached('rel:' + id, 60 * 60e3, () => Promise.any([
    (async () => { const { j: r } = await inv(`/api/v1/videos/${id}`); return { related: nonEmpty(clean((r.recommendedVideos || []).map(x => invCard({ ...x, type: 'video' })))), authorThumb: https(((r.authorThumbnails || []).slice(-1)[0] || {}).url) }; })(),
    (async () => { const { j: r } = await piped(`/streams/${id}`); return { related: nonEmpty(clean((r.relatedStreams || []).map(pipedCard))), authorThumb: r.uploaderAvatar }; })(),
  ]).catch(async () => ({ related: title ? (await search(title.split(/[|(\[]/)[0].slice(0, 60), 1, 'video').catch(() => [])).filter(v => v.id !== id) : [] })));
}
const num = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
async function comments(id, c) {
  return cached(`c:${id}:${c}`, 10 * 60e3, () => any(
    async () => { const { j } = await inv(`/api/v1/comments/${id}${c ? '?continuation=' + encodeURIComponent(c) : ''}`); return { comments: (j.comments || []).map(x => ({ author: x.author, thumb: https(((x.authorThumbnails || []).slice(-1)[0] || {}).url), text: x.content || '', likes: x.likeCount, ago: x.publishedText, replies: (x.replies && x.replies.replyCount) || 0, pinned: !!x.isPinned, hearted: !!x.creatorHeart })), next: j.continuation || null }; },
    async () => { const { j } = await piped(c ? `/nextpage/comments/${id}?nextpage=${encodeURIComponent(c)}` : `/comments/${id}`); return { comments: (j.comments || []).map(x => ({ author: x.author, thumb: x.thumbnail, text: (x.commentText || '').replace(/<[^>]+>/g, ''), likes: x.likeCount, ago: x.commentedTime, replies: x.replyCount || 0, pinned: !!x.pinned, hearted: !!x.hearted })), next: j.nextpage || null }; },
  ));
}
async function channel(id, tab, c) {
  return cached(`ch:${id}:${tab}:${c}`, 20 * 60e3, () => any(
    async () => {
      const [{ j: info }, { j: list }] = await Promise.all([inv(`/api/v1/channels/${id}`), inv(`/api/v1/channels/${id}/${tab}${c ? '?continuation=' + encodeURIComponent(c) : ''}`)]);
      const banner = https(((info.authorBanners || [])[0] || {}).url);
      return { id, name: info.author, thumb: https(((info.authorThumbnails || []).slice(-1)[0] || {}).url), banner, subs: info.subCount, desc: info.description || '', videos: clean((list.videos || list || []).map(x => invCard({ ...x, type: 'video', isShort: tab === 'shorts' }))), next: list.continuation || null };
    },
    async () => {
      const { j } = await piped(`/channel/${id}`);
      let vids = j.relatedStreams || [];
      if (tab === 'shorts') { const t = (j.tabs || []).find(x => x.name === 'shorts'); if (t) { const r = await piped(`/channels/tabs?data=${encodeURIComponent(t.data)}`); vids = r.j.content || []; } }
      return { id, name: j.name, thumb: j.avatarUrl, banner: j.bannerUrl, subs: j.subscriberCount, desc: j.description || '', videos: clean(vids.map(pipedCard)), next: null };
    },
    async () => {
      const j = await ytdlp(['--flat-playlist', '--playlist-end', '30', `https://www.youtube.com/channel/${id}/${tab}`]);
      return { id, name: j.channel || j.uploader || j.title, thumb: '', banner: '', subs: j.channel_follower_count || 0, desc: j.description || '', videos: clean((j.entries || []).map(dlCard)), next: null };
    },
  ));
}
async function feed(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 6) {
    const part = await Promise.all(ids.slice(i, i + 6).map(id => channel(id, 'videos', '').then(c => c.videos.slice(0, 8).map(v => ({ ...v, author: v.author || c.name, authorId: id }))).catch(() => [])));
    for (const p of part) out.push(...p);
  }
  return out.sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 120);
}
async function sponsor(id) {
  return cached('sb:' + id, 60 * 60e3, async () => {
    try { const j = await getJSON(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${encodeURIComponent('["sponsor","selfpromo","interaction","intro","outro"]')}`, 5000); return j.map(x => ({ start: x.segment[0], end: x.segment[1], cat: x.category })); }
    catch { return []; }
  });
}

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

/* ---------------- router ---------------- */
export async function ytApi(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/yt/')) return false;
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const why = permGate(req, 'youtube', 'Tube');
  if (why) { send(401, { error: why }); return true; }
  try {
    if (p === '/yt/stream') { await stream(req, res, url.searchParams.get('t') || ''); return true; }
    const q = k => url.searchParams.get(k) || '', page = Math.max(1, Math.min(20, +q('page') || 1));
    const region = /^[A-Z]{2}$/.test(q('region')) ? q('region') : 'US';
    let m;
    if (p === '/yt/api/status') return send(200, { ytdlp: ytdlpOk(), invidious: goodInv, piped: goodPiped, last: lastSource, lastErr }), true;
    if (p === '/yt/api/home') return send(200, { items: await home(region), source: lastSource }), true;
    if (p === '/yt/api/search') { const s = q('q').slice(0, 200).trim(); if (!s) return send(400, { error: 'Type something to search for.' }), true; return send(200, { items: await search(s, page, q('type') === 'channel' ? 'channel' : 'video'), source: lastSource }), true; }
    if (p === '/yt/api/shorts') return send(200, { items: await shorts(page, q('q').slice(0, 100)), source: lastSource }), true;
    if ((m = /^\/yt\/api\/video\/([\w-]{11})$/.exec(p))) return send(200, await video(m[1])), true;
    if ((m = /^\/yt\/api\/related\/([\w-]{11})$/.exec(p))) return send(200, await related(m[1], q('title').slice(0, 200))), true;
    if ((m = /^\/yt\/api\/comments\/([\w-]{11})$/.exec(p))) return send(200, await comments(m[1], q('c').slice(0, 2000))), true;
    if ((m = /^\/yt\/api\/sponsor\/([\w-]{11})$/.exec(p))) return send(200, { segments: await sponsor(m[1]) }), true;
    if ((m = /^\/yt\/api\/channel\/(UC[\w-]{22})$/.exec(p))) return send(200, await channel(m[1], q('tab') === 'shorts' ? 'shorts' : 'videos', q('c').slice(0, 2000))), true;
    if (p === '/yt/api/feed') { const ids = q('ids').split(',').filter(x => CHAN.test(x)).slice(0, 60); return send(200, { items: await feed(ids) }), true; }
    send(404, { error: 'Unknown Tube request' }); return true;
  } catch (e) {
    send(502, { error: `YouTube isn’t answering right now (${e.message}). Try again in a minute${ytdlpOk() ? '' : ', or install yt-dlp in Termux: pkg install yt-dlp'}.` });
    return true;
  }
}
export const _test = { invCard, pipedCard, dlCard, invStreams, tokens };
