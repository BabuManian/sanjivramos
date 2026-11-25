// SanjivramOS social backend: accounts, friends, conversations, messages, files, presence, call signalling.
// Storage: SQLite (node:sqlite, built into Node 22+) in <DATA>/.social/social.db, uploads in <DATA>/.social/files/.
// Identity follows the Web Browser's "people" model (vip.js): a username + password checked on the server (scrypt),
// then a random session token kept in an HttpOnly cookie (only its SHA-256 is stored). The OS lock-screen PIN stays
// local to each browser, so a server identity is needed for people on different devices to talk to each other.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import ipaddr from 'ipaddr.js';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';

let db, DIR, FILES;
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const sockets = new Map();          // userId -> Set(ws)
const MAX_UPLOAD = 25 * 1024 * 1024;
const COOKIE = 'sjsid';
const log = (...a) => console.log('[social]', ...a);

/* ---------------- database + migrations ---------------- */
const MIGRATIONS = [
  `CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, display TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
     avatar TEXT, bio TEXT DEFAULT '', created INTEGER NOT NULL, last_seen INTEGER, role TEXT DEFAULT 'user', banned INTEGER DEFAULT 0);
   CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER, last INTEGER, agent TEXT);
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE friends(a INTEGER NOT NULL, b INTEGER NOT NULL, status TEXT NOT NULL, requester INTEGER, created INTEGER, PRIMARY KEY(a,b));
   CREATE TABLE blocks(user_id INTEGER, blocked INTEGER, PRIMARY KEY(user_id, blocked));
   CREATE TABLE convos(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT, avatar TEXT, dm_key TEXT UNIQUE, created_by INTEGER, created INTEGER, last_msg INTEGER DEFAULT 0);
   CREATE TABLE members(convo_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'member', joined INTEGER, last_read INTEGER DEFAULT 0, last_delivered INTEGER DEFAULT 0,
     muted INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, nick TEXT, PRIMARY KEY(convo_id, user_id));
   CREATE INDEX members_user ON members(user_id);
   CREATE TABLE messages(id INTEGER PRIMARY KEY, convo_id INTEGER NOT NULL, user_id INTEGER, kind TEXT NOT NULL, body TEXT, meta TEXT, reply_to INTEGER,
     thread_root INTEGER, forwarded INTEGER DEFAULT 0, created INTEGER NOT NULL, edited INTEGER, deleted INTEGER DEFAULT 0);
   CREATE INDEX messages_convo ON messages(convo_id, id);
   CREATE INDEX messages_thread ON messages(thread_root);
   CREATE TABLE reactions(msg_id INTEGER, user_id INTEGER, emoji TEXT, PRIMARY KEY(msg_id, user_id, emoji));
   CREATE TABLE pins(convo_id INTEGER, msg_id INTEGER, pinned_by INTEGER, created INTEGER, PRIMARY KEY(convo_id, msg_id));
   CREATE TABLE files(id TEXT PRIMARY KEY, owner INTEGER, name TEXT, mime TEXT, size INTEGER, kind TEXT, created INTEGER);
   CREATE TABLE file_access(file_id TEXT, convo_id INTEGER, PRIMARY KEY(file_id, convo_id));
   CREATE TABLE calls(id INTEGER PRIMARY KEY, convo_id INTEGER, started_by INTEGER, video INTEGER, started INTEGER, answered INTEGER, ended INTEGER);
   CREATE TABLE call_people(call_id INTEGER, user_id INTEGER, joined INTEGER, left INTEGER, PRIMARY KEY(call_id, user_id));
   CREATE TABLE reports(id INTEGER PRIMARY KEY, reporter INTEGER, user_id INTEGER, msg_id INTEGER, reason TEXT, created INTEGER, resolved INTEGER DEFAULT 0);
   CREATE TABLE stickers(id INTEGER PRIMARY KEY, user_id INTEGER, pack TEXT, file_id TEXT, created INTEGER);`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS msg_fts USING fts5(body, content='messages', content_rowid='id');
   CREATE TRIGGER msg_ai AFTER INSERT ON messages BEGIN INSERT INTO msg_fts(rowid, body) VALUES (new.id, new.body); END;
   CREATE TRIGGER msg_ad AFTER DELETE ON messages BEGIN INSERT INTO msg_fts(msg_fts, rowid, body) VALUES('delete', old.id, old.body); END;
   CREATE TRIGGER msg_au AFTER UPDATE OF body ON messages BEGIN INSERT INTO msg_fts(msg_fts, rowid, body) VALUES('delete', old.id, old.body); INSERT INTO msg_fts(rowid, body) VALUES (new.id, new.body); END;`,
  `ALTER TABLE convos ADD COLUMN theme TEXT; ALTER TABLE users ADD COLUMN prefs TEXT;`,
  // v4: per-person permissions (JSON list of what's switched OFF) and an owner ("op") above admins: the first admin
  `ALTER TABLE users ADD COLUMN perms TEXT;
   UPDATE users SET role='owner' WHERE id=(SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner');`,
  // v5: which IP addresses each account uses, and IP bans (block the whole of SanjivramOS for that address)
  `CREATE TABLE user_ips(user_id INTEGER, ip TEXT, first INTEGER, last INTEGER, hits INTEGER DEFAULT 0, PRIMARY KEY(user_id, ip));
   CREATE INDEX user_ips_ip ON user_ips(ip);
   CREATE TABLE ip_bans(ip TEXT PRIMARY KEY, user_id INTEGER, username TEXT, reason TEXT, by_id INTEGER, created INTEGER);`,
  // v6: every address that opens SanjivramOS (signed in to Messages or not), so admins can see and ban visitors too
  `CREATE TABLE visitors(ip TEXT PRIMARY KEY, first INTEGER, last INTEGER, hits INTEGER DEFAULT 0, agent TEXT, via TEXT);`,
  // v7: devices (a long-lived browser ID cookie) so ONE person can be banned without blocking their whole network
  `CREATE TABLE devices(id TEXT PRIMARY KEY, first INTEGER, last INTEGER, hits INTEGER DEFAULT 0, agent TEXT, ip TEXT, via TEXT);
   CREATE TABLE device_users(device TEXT, user_id INTEGER, last INTEGER, PRIMARY KEY(device, user_id));
   CREATE TABLE device_bans(device TEXT PRIMARY KEY, user_id INTEGER, username TEXT, reason TEXT, by_id INTEGER, created INTEGER, ip TEXT, agent TEXT);`,
  // v8: each account's SanjivramOS desktop (settings, layout, dock, desktop icons…) so it follows you to any device
  `CREATE TABLE os_profiles(user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL, bytes INTEGER DEFAULT 0);`,
];
export function initSocial(dataDir) {
  DIR = path.join(dataDir, '.social'); FILES = path.join(DIR, 'files');
  fs.mkdirSync(FILES, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(path.join(DIR, 'social.db'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  db.exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)');
  const ver = +((db.prepare(`SELECT v FROM meta WHERE k='version'`).get() || {}).v || 0);
  for (let i = ver; i < MIGRATIONS.length; i++) {
    try { db.exec('BEGIN'); db.exec(MIGRATIONS[i]); db.prepare(`INSERT OR REPLACE INTO meta(k,v) VALUES('version',?)`).run(String(i + 1)); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); if (i === 1) { log('full-text search unavailable, using LIKE:', e.message); db.prepare(`INSERT OR REPLACE INTO meta(k,v) VALUES('version',?)`).run(String(i + 1)); } else throw e; }
  }
  hasFts = !!db.prepare(`SELECT name FROM sqlite_master WHERE name='msg_fts'`).get();
  loadBans();
  setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE last < ?').run(Date.now() - 90 * 864e5); } catch {} }, 3600e3).unref();
  log('database ready', path.join(DIR, 'social.db'));
}
let hasFts = false;
const q = (sql, ...a) => db.prepare(sql).all(...a);
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);

/* ---------------- accounts ---------------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const USER_RE = /^[a-zA-Z0-9_.]{3,24}$/;
const prefsOf = u => { if (!u) return {}; if (u._p) return u._p; let p = {}; try { p = JSON.parse(u.prefs || '{}') || {}; } catch {} return p; };
// Privacy: people can hide being online / last seen, and what they're playing.
/* game character ("look"): colours + part numbers, made in the Character app (games/sj-avatar) and shown in online games */
const LOOK_COLORS = ['skin', 'hair', 'eye', 'shirt', 'shirt2', 'pants', 'shoes', 'hatColor', 'accColor', 'markColor', 'heldColor', 'petColor', 'auraColor'], LOOK_PARTS = ['hairStyle', 'eyes', 'mouth', 'shirtStyle', 'hat', 'acc', 'body', 'brows', 'faceMark', 'held', 'pet', 'aura'];
const LOOK_SLOTS = ['hat', 'face', 'badge', 'back', 'held', 'pet'];
function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  const o = {};
  for (const k of LOOK_COLORS) if (typeof l[k] === 'string' && /^#[0-9a-f]{6}$/i.test(l[k])) o[k] = l[k].toLowerCase();
  for (const k of LOOK_PARTS) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] < 32) o[k] = l[k];
  if (typeof l.title === 'string') o.title = l.title.replace(/[\u0000-\u001f<>]/g, '').slice(0, 24);
  // items people drew themselves (Item Workshop): 16×16 pixels, 16-colour palette, one per slot
  if (l.custom && typeof l.custom === 'object') {
    const c = {};
    for (const sl of LOOK_SLOTS) {
      const it = l.custom[sl];
      if (!it || typeof it.d !== 'string' || !/^[.0-9a-f]{256}$/.test(it.d) || !Array.isArray(it.p) || it.p.length > 16) continue;
      if (!it.p.every(x => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x))) continue;
      c[sl] = { n: String(it.n || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24), s: sl, p: it.p.map(x => x.toLowerCase()), d: it.d };
    }
    if (Object.keys(c).length) o.custom = c;
  }
  return Object.keys(o).length ? o : null;
}
const publicUser = u => { if (!u) return u; const p = prefsOf(u); return { id: u.id, username: u.username, display: u.display, avatar: u.avatar || null, bio: u.bio || '', look: p.look || null, online: p.showOnline === false ? false : sockets.has(u.id), lastSeen: p.showOnline === false ? null : (u.last_seen || null), activity: p.showActivity === false ? null : (activity.get(u.id) || null) }; };
const userById = id => q1('SELECT * FROM users WHERE id=?', id);
/* ---------------- IP addresses + IP bans ---------------- */
const LOOP = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const normIp = ip => String(ip || '').trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1').toLowerCase();
/** The visitor's real address. Forwarding headers are trusted only from this phone itself (the Cloudflare tunnel /
    a local proxy connect from 127.0.0.1); anyone else could fake them. */
export function clientIp(req) {
  const raw = req.socket && req.socket.remoteAddress;
  if (LOOP.has(raw)) {
    const h = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0];
    if (h && String(h).trim()) return normIp(h);
  }
  return normIp(raw);
}
/** This phone's own browser (no proxy in between): never banned, so the owner can't lock themselves out. */
const ownBrowser = req => LOOP.has(req.socket && req.socket.remoteAddress) && !['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded', 'via'].some(h => h in req.headers);
let bans = new Map(), devBans = new Map();
function loadBans() { bans = new Map(q('SELECT * FROM ip_bans').map(b => [b.ip, b])); devBans = new Map(q('SELECT * FROM device_bans').map(b => [b.device, b])); }
/* Devices: every browser gets a random ID cookie "sjdev" (10 years). It isn't secret (the page keeps a copy in
   localStorage and puts it back if cookies are cleared), it only tells devices behind one shared IP apart. */
const DEV_COOKIE = 'sjdev', DEV_RE = /^[a-f0-9]{32}$/;
export function deviceOf(req) { const m = /(?:^|;\s*)sjdev=([a-f0-9]{32})(?:;|$)/.exec(req.headers.cookie || ''); return m ? m[1] : null; }
function addCookie(res, c) { const old = res.getHeader('set-cookie'); res.setHeader('set-cookie', [].concat(old || [], c)); }
/** null, or the ban for this request (its device, or its address). Used by the main server for EVERY request and WebSocket. */
export function ipBan(req) {
  if (!db || (!bans.size && !devBans.size) || ownBrowser(req)) return null;
  const d = deviceOf(req); if (d && devBans.has(d)) { const b = devBans.get(d); return { ...b, ip: clientIp(req), device: true }; }
  return bans.get(clientIp(req)) || null;
}
export function bannedPage(ban) {
  const esc2 = t => String(t || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banned · SanjivramOS</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#eee;font:16px system-ui,sans-serif;text-align:center}div{max-width:420px;padding:32px;border-radius:24px;background:#18181f;border:1px solid #2a2a35}h1{margin:.3em 0;font-size:26px}b{color:#f87171}small{color:#888;display:block;margin-top:18px}</style>
<div><div style="font-size:64px">🚫</div><h1>You’re banned from SanjivramOS</h1><p>${ban.username ? `Account: <b>@${esc2(ban.username)}</b><br>` : ''}${ban.device ? 'This device' : `This internet address (${esc2(ban.ip)})`} can’t use SanjivramOS any more.</p>${ban.reason ? `<p>Reason: ${esc2(ban.reason)}</p>` : ''}<small>If you think this is a mistake, talk to the owner.</small></div>`;
}
const visitSeen = new Map();   // ip -> last DB write (at most one write per address per 30 s)
/** Called by the main server for every request / WebSocket that isn't banned. */
export function noteVisit(req, res) {
  if (!db) return;
  let dev = deviceOf(req);
  if (!dev && res && !res.headersSent) { dev = crypto.randomBytes(16).toString('hex'); addCookie(res, `${DEV_COOKIE}=${dev}; Path=/; Max-Age=315360000; SameSite=Lax`); req.newDevice = dev; }
  if (ownBrowser(req)) return;
  const ip = clientIp(req); if (!ip) return;
  if (dev) { const k = 'd' + dev, now = Date.now(); if (now - (visitSeen.get(k) || 0) >= 30e3) { visitSeen.set(k, now);
    try { run('INSERT INTO devices(id,first,last,hits,agent,ip,via) VALUES(?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET last=excluded.last, hits=hits+1, agent=excluded.agent, ip=excluded.ip, via=excluded.via', dev, now, now, String(req.headers['user-agent'] || '').slice(0, 200), ip, LOOP.has(req.socket && req.socket.remoteAddress) ? 'tunnel' : 'network'); } catch {} } }
  const now = Date.now(); if (now - (visitSeen.get(ip) || 0) < 30e3) return; visitSeen.set(ip, now);
  if (visitSeen.size > 5000) visitSeen.clear();
  const via = LOOP.has(req.socket && req.socket.remoteAddress) ? 'tunnel' : 'network';
  try { run('INSERT INTO visitors(ip,first,last,hits,agent,via) VALUES(?,?,?,1,?,?) ON CONFLICT(ip) DO UPDATE SET last=excluded.last, hits=hits+1, agent=excluded.agent, via=excluded.via', ip, now, now, String(req.headers['user-agent'] || '').slice(0, 200), via); } catch {}
}
function device(ua) {
  ua = String(ua || '');
  const os = /CrOS/.test(ua) ? 'Chromebook' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' on ') || (ua ? ua.slice(0, 40) : 'Unknown device');
}
const ipSeen = new Map();   // "uid|ip" -> last write, so we touch the DB at most once a minute per pair
function noteIp(u, req) {
  if (ownBrowser(req)) return;   // the phone itself
  const ip = clientIp(req); if (!ip) return;
  const k = u.id + '|' + ip, now = Date.now(); if (now - (ipSeen.get(k) || 0) < 60e3) return; ipSeen.set(k, now);
  try { run('INSERT INTO user_ips(user_id,ip,first,last,hits) VALUES(?,?,?,?,1) ON CONFLICT(user_id,ip) DO UPDATE SET last=excluded.last, hits=hits+1', u.id, ip, now, now); } catch {}
  const dev = deviceOf(req) || req.newDevice; if (dev) try { run('INSERT INTO device_users(device,user_id,last) VALUES(?,?,?) ON CONFLICT(device,user_id) DO UPDATE SET last=excluded.last', dev, u.id, now); } catch {}
}
export function userFromReq(req) {
  if (!db) return null;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(req.headers.cookie || '');
  if (!m) return null;
  const s = q1('SELECT * FROM sessions WHERE token=?', sha(m[1]));
  if (!s) return null;
  const u = userById(s.user_id);
  if (!u || u.banned) return null;
  noteIp(u, req);
  if (Date.now() - (s.last || 0) > 60e3) run('UPDATE sessions SET last=? WHERE token=?', Date.now(), s.token);
  return u;
}
// Login attempts: 8 per 10 minutes per address, and 5 wrong passwords lock that username for a minute.
const attempts = new Map(), locks = new Map();
function limited(map, key, max, ms) { const now = Date.now(), a = (map.get(key) || []).filter(t => now - t < ms); a.push(now); map.set(key, a); return a.length > max; }
function newSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  noteIp(user, req);
  run('INSERT INTO sessions(token,user_id,created,last,agent) VALUES(?,?,?,?,?)', sha(token), user.id, Date.now(), Date.now(), String(req.headers['user-agent'] || '').slice(0, 160));
  addCookie(res, `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${90 * 86400}`);
}

/* ---------------- HTTP API (/social/api/*, /social/file/*) ---------------- */
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function sameOrigin(req) { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return req.method === 'GET'; } }
async function body(req, max = 64 * 1024) {
  let size = 0; const parts = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('Too large'), { code: 413 }); parts.push(c); }
  return Buffer.concat(parts);
}
export async function handleSocial(req, res, url) {
  if (!db) { send(res, 503, { error: 'Social service is not running' }); return; }
  const p = url.pathname;
  try {
    if (p.startsWith('/social/file/')) return serveFile(req, res, url);
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Cross-site request refused' });
    const ip = req.socket.remoteAddress || '';
    if (p === '/social/api/signup' && req.method === 'POST') {
      if (limited(attempts, 'su' + ip, +process.env.SJ_SIGNUPS_PER_HOUR || 10, 3600e3)) return send(res, 429, { error: 'Too many new accounts from this device. Try again later.' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const username = String(b.username || '').trim(), display = String(b.display || username).trim().slice(0, 40), pw = String(b.password || '');
      if (!USER_RE.test(username)) return send(res, 400, { error: 'Usernames are 3–24 letters, numbers, _ or .' });
      if (pw.length < 6) return send(res, 400, { error: 'Use a password of at least 6 characters.' });
      if (q1('SELECT id FROM users WHERE username=?', username)) return send(res, 409, { error: 'That username is taken.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const first = !q1('SELECT id FROM users LIMIT 1');
      const r = run('INSERT INTO users(username,display,salt,hash,created,role) VALUES(?,?,?,?,?,?)', username, display || username, salt, hashPw(pw, salt), Date.now(), first ? 'owner' : 'user');
      const u = userById(Number(r.lastInsertRowid));
      newSession(res, u, req); return send(res, 200, { me: meOf(u) });
    }
    if (p === '/social/api/login' && req.method === 'POST') {
      if (limited(attempts, 'li' + ip, 20, 600e3)) return send(res, 429, { error: 'Too many sign-in attempts. Wait a few minutes.' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const username = String(b.username || '').trim();
      const lock = locks.get(username.toLowerCase());
      if (lock && lock.until > Date.now()) return send(res, 429, { error: 'Too many wrong passwords. Try again in a minute.' });
      const u = q1('SELECT * FROM users WHERE username=?', username);
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(b.password || '', u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
      if (!ok) { const l = locks.get(username.toLowerCase()) || { n: 0 }; l.n++; if (l.n >= 5) { l.until = Date.now() + 60e3; l.n = 0; } locks.set(username.toLowerCase(), l); return send(res, 401, { error: 'Wrong username or password.' }); }
      if (u.banned) return send(res, 403, { error: 'This account has been suspended.' });
      locks.delete(username.toLowerCase());
      newSession(res, u, req); return send(res, 200, { me: meOf(u) });
    }
    if (p === '/social/api/logout' && req.method === 'POST') {
      const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(req.headers.cookie || '');
      if (m) run('DELETE FROM sessions WHERE token=?', sha(m[1]));
      addCookie(res, `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      return send(res, 200, { ok: true });
    }
    const me = userFromReq(req);
    if (p === '/social/api/me') return send(res, me ? 200 : 401, me ? { me: meOf(me) } : { error: 'Not signed in' });
    if (!me) return send(res, 401, { error: 'Not signed in' });
    // the account's saved desktop
    if (p === '/social/api/os' && req.method === 'GET') {
      const row = q1('SELECT data, updated FROM os_profiles WHERE user_id=?', me.id);
      return send(res, 200, row ? { data: JSON.parse(row.data), updated: row.updated } : { data: null, updated: 0 });
    }
    if (p === '/social/api/os' && req.method === 'POST') {
      if (limited(attempts, 'os' + me.id, 60, 60e3)) return send(res, 429, { error: 'Saving too often — slow down.' });
      let b; try { b = JSON.parse((await body(req, 4 * 1024 * 1024)).toString() || '{}'); } catch { return send(res, 413, { error: 'Your desktop is too big to save (4 MB max).' }); }
      if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return send(res, 400, { error: 'Nothing to save.' });
      const data = {}; for (const [k, v] of Object.entries(b.data)) if (typeof k === 'string' && k.length < 200 && typeof v === 'string') data[k] = v;
      const json = JSON.stringify(data), updated = Date.now();
      run('INSERT INTO os_profiles(user_id, data, updated, bytes) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, bytes=excluded.bytes', me.id, json, updated, json.length);
      return send(res, 200, { ok: true, updated });
    }
    // the lock screen checks your account password without making a new session
    if (p === '/social/api/verify' && req.method === 'POST') {
      const key = 'vf' + me.id; if (limited(attempts, key, 12, 60e3)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const ok = crypto.timingSafeEqual(Buffer.from(hashPw(b.password || '', me.salt), 'hex'), Buffer.from(me.hash, 'hex'));
      return send(res, ok ? 200 : 401, ok ? { ok: true } : { error: 'Wrong password.' });
    }
    if (p === '/social/api/look' && req.method === 'POST') {
      if (limited(attempts, 'lk' + me.id, 30, 60e3)) return send(res, 429, { error: 'Slow down a little.' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const pr = prefsOf(me), look = cleanLook(b.look);
      if (look) pr.look = look; else delete pr.look;
      run('UPDATE users SET prefs=? WHERE id=?', JSON.stringify(pr), me.id);
      return send(res, 200, { me: meOf(userById(me.id)) });
    }
    if (p === '/social/api/password' && req.method === 'POST') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      if (hashPw(b.old || '', me.salt) !== me.hash) return send(res, 401, { error: 'Your current password is wrong.' });
      if (String(b.password || '').length < 6) return send(res, 400, { error: 'Use at least 6 characters.' });
      const salt = crypto.randomBytes(16).toString('hex');
      run('UPDATE users SET salt=?, hash=? WHERE id=?', salt, hashPw(b.password, salt), me.id);
      run('DELETE FROM sessions WHERE user_id=?', me.id); newSession(res, me, req);
      return send(res, 200, { ok: true });
    }
    if (p === '/social/api/upload' && req.method === 'POST') {
      if (limited(attempts, 'up' + me.id, 60, 600e3)) return send(res, 429, { error: 'Too many uploads. Slow down a little.' });
      { const k = String(req.headers['x-kind'] || ''); const pk = k === 'avatar' ? null : k === 'sticker' ? 'gifs' : 'media'; if (pk && !can(me, pk)) return send(res, 403, { error: `An admin has turned off “${PERMS[pk]}” for your account.` }); }
      const buf = await body(req, MAX_UPLOAD);
      if (!buf.length) return send(res, 400, { error: 'Empty file' });
      const name = decodeURIComponent(String(req.headers['x-name'] || 'file')).replace(/[\\/\0]/g, '_').slice(0, 120) || 'file';
      const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].slice(0, 80);
      const kind = String(req.headers['x-kind'] || 'attachment').replace(/[^a-z]/g, '').slice(0, 12);
      const id = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(path.join(FILES, id), buf, { mode: 0o600 });
      run('INSERT INTO files(id,owner,name,mime,size,kind,created) VALUES(?,?,?,?,?,?,?)', id, me.id, name, mime, buf.length, kind, Date.now());
      return send(res, 200, { id, name, mime, size: buf.length, url: `/social/file/${id}` });
    }
    if (p === '/social/gifmedia') return gifMedia(req, res, url);
    if (p === '/social/api/gif') { if (!can(me, 'gifs')) return send(res, 403, { error: 'noperm', message: `An admin has turned off “${PERMS.gifs}” for your account.` }); return gif(req, res, url, me); }
    if (p === '/social/api/gifkey' && req.method === 'POST') {
      if (!isAdmin(me)) return send(res, 403, { error: 'Only an admin can set the GIF key.' });
      if (process.env.GIPHY_API_KEY) return send(res, 400, { error: 'This server already gets its key from GIPHY_API_KEY.' });
      const k = String(JSON.parse((await body(req)).toString() || '{}').key || '').trim();
      if (k && !/^[A-Za-z0-9]{16,64}$/.test(k)) return send(res, 400, { error: 'That doesn’t look like a GIPHY API key.' });
      if (k) { try { await getJson(`https://api.giphy.com/v1/gifs/trending?api_key=${k}&limit=1`); } catch (e) { return send(res, 400, { error: 'GIPHY didn’t accept that key: ' + e.message }); } }
      const f = path.join(DIR, 'giphy-key'); if (k) fs.writeFileSync(f, k, { mode: 0o600 }); else fs.rmSync(f, { force: true });
      fileKey = k; gifCache.clear();
      for (const uid of sockets.keys()) emit(uid, { t: 'gif.on', on: !!k });
      return send(res, 200, { ok: true, on: !!k });
    }
    if (p === '/social/api/preview') return preview(res, url, me);
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, e.code === 413 ? 413 : 500, { error: e.code === 413 ? 'File is larger than 25 MB.' : e.message }); }
}
const meOf = u => ({ ...publicUser(u), role: u.role, perms: permsOf(u) });
/* ---------------- roles + permissions ----------------
   owner ("op", the first account) > admin > user. You can only manage people below you; admins/owner skip permission checks. */
export const PERMS = { chat: 'Send messages', media: 'Photos, files & voice messages', gifs: 'GIFs & stickers', calls: 'Voice & video calls', groups: 'Create group chats', friends: 'Add friends', invites: 'Send game invites', claude: 'Use the Claude app', youtube: 'Use the YouTube app', ai: 'Use AI apps (OpenRouter, Groq…)' };
const RANK = { owner: 3, admin: 2, user: 1 };
const rankOf = u => RANK[u && u.role] || 1;
const isAdmin = u => !!u && (u.role === 'admin' || u.role === 'owner');
function deniedOf(u) { try { const d = JSON.parse(u.perms || '[]'); return Array.isArray(d) ? d.filter(k => k in PERMS) : []; } catch { return []; } }
function permsOf(u) { const off = isAdmin(u) ? [] : deniedOf(u); return Object.fromEntries(Object.keys(PERMS).map(k => [k, !off.includes(k)])); }
function can(u, k) { return isAdmin(u) || !deniedOf(u).includes(k); }
function need(u, k) { if (!can(u, k)) throw new Error(`An admin has turned off “${PERMS[k]}” for your account`); }
function needAbove(me, u) { if (!u) throw new Error('No such account'); if (u.id === me.id) throw new Error('You can’t do that to your own account'); if (rankOf(me) <= rankOf(u)) throw new Error(u.role === 'owner' ? 'Nobody can change the owner account' : 'Only the owner can manage admins'); }
/** The Claude app needs a signed-in Messages account (and the "claude" permission). null = allowed, else why not. */
export function claudeGate(req) {
  if (!db) return null;   // Messages/accounts not running: don't lock the owner out of Claude
  const u = userFromReq(req);
  if (!u) return 'Sign in with your SanjivramOS account (the same one as Messages) to use Claude.';
  if (!can(u, 'claude')) return `An admin has turned off “${PERMS.claude}” for your account.`;
  return null;
}
/** Terminal / shell access: only these accounts (SANJIVRAM_TERMINAL_USERS, comma-separated; default y8tireu).
 *  Fails closed: no accounts DB or not signed in = no shell. null = allowed, else why not. */
export const TERMINAL_USERS = (process.env.SANJIVRAM_TERMINAL_USERS || 'y8tireu').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
export function terminalGate(req) {
  if (!db) return 'The Terminal needs the SanjivramOS accounts service, which is not running.';
  const u = userFromReq(req);
  if (!u) return 'Sign in with your SanjivramOS account to use the Terminal.';
  if (!TERMINAL_USERS.includes(String(u.username).toLowerCase())) return 'The Terminal is only available to the owner of this SanjivramOS.';
  return null;
}
/** Generic gate for server features tied to a permission (YouTube…): null = allowed, else why not. */
export function permGate(req, key, what) {
  if (!db) return null;
  const u = userFromReq(req);
  if (!u) return `Sign in with your SanjivramOS profile (the same one as Messages) to use ${what}.`;
  if (!can(u, key)) return `An admin has turned off “${PERMS[key]}” for your account.`;
  return null;
}
export function socialSignedIn(req) { return db ? userFromReq(req) : null; }
const userDeleteHooks = [];
/** other modules (e.g. Game Maker) can clean up when an account is deleted */
export function onUserDeleted(fn) { userDeleteHooks.push(fn); }
function canSeeFile(me, f) {
  if (f.owner === me.id || f.kind === 'avatar' || f.kind === 'sticker') return true;
  return !!q1('SELECT 1 FROM file_access fa JOIN members m ON m.convo_id=fa.convo_id WHERE fa.file_id=? AND m.user_id=?', f.id, me.id);
}
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(webm|ogg|mpeg|mp4|wav|x-wav|aac))$/;
function serveFile(req, res, url) {
  const me = userFromReq(req);
  const id = url.pathname.slice(13).replace(/[^a-f0-9]/g, '');
  const f = id && q1('SELECT * FROM files WHERE id=?', id);
  if (!me || !f || !canSeeFile(me, f)) { res.writeHead(404); res.end(); return; }
  const file = path.join(FILES, f.id);
  let st; try { st = fs.statSync(file); } catch { res.writeHead(404); res.end(); return; }
  // Only plain media is shown inline; everything else (HTML, SVG, scripts…) downloads, so it can never run on this site.
  const inline = INLINE.test(f.mime) && !url.searchParams.has('dl');
  const headers = { 'content-type': inline ? f.mime : 'application/octet-stream', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cache-control': 'private, max-age=31536000, immutable', 'accept-ranges': 'bytes',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}` };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && inline) {
    const start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start >= st.size || start < 0) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res); return;
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- GIFs: GIPHY (Tenor's public API closed on 30 June 2026). The key stays on this server. ---------------- */
const gifCache = new Map();
function getJson(u, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const r = https.get(u, { timeout, headers: { 'user-agent': 'SanjivramOS' } }, res => {
      let d = ''; res.setEncoding('utf8'); res.on('data', c => { d += c; if (d.length > 3e6) r.destroy(); });
      res.on('end', () => { try { const j = JSON.parse(d); res.statusCode < 300 ? resolve(j) : reject(new Error((j.meta && j.meta.msg) || ('HTTP ' + res.statusCode))); } catch (e) { reject(e); } });
    });
    r.on('timeout', () => r.destroy(new Error('timed out'))); r.on('error', reject);
  });
}
// Key: env GIPHY_API_KEY, or one an admin pasted in Messages → Settings (saved in <DATA>/.social/giphy-key, 0600).
let fileKey;
function gifKey() {
  if (process.env.GIPHY_API_KEY) return process.env.GIPHY_API_KEY;
  if (fileKey === undefined) { try { fileKey = fs.readFileSync(path.join(DIR, 'giphy-key'), 'utf8').trim(); } catch { fileKey = ''; } }
  return fileKey;
}
async function gif(req, res, url, me) {
  const key = gifKey();
  if (!key) return send(res, 503, { error: 'nokey', message: 'GIF search needs a GIPHY API key. Get a free one at developers.giphy.com, then start SanjivramOS with GIPHY_API_KEY=<key>.' });
  if (limited(attempts, 'gif' + me.id, 120, 60e3)) return send(res, 429, { error: 'Too many GIF searches. Wait a moment.' });
  const type = url.searchParams.get('type') || 'trending', kind = url.searchParams.get('kind') === 'stickers' ? 'stickers' : 'gifs';
  const qs = String(url.searchParams.get('q') || '').slice(0, 80), offset = Math.max(0, Math.min(4900, +url.searchParams.get('offset') || 0));
  const rating = ['g', 'pg', 'pg-13', 'r'].includes(url.searchParams.get('rating')) ? url.searchParams.get('rating') : 'pg-13';
  let api;
  if (type === 'search' && qs) api = `https://api.giphy.com/v1/${kind}/search?api_key=${key}&q=${encodeURIComponent(qs)}&limit=30&offset=${offset}&rating=${rating}&bundle=messaging_non_clips`;
  else if (type === 'autocomplete' && qs) api = `https://api.giphy.com/v1/gifs/search/tags?api_key=${key}&q=${encodeURIComponent(qs)}&limit=8`;
  else if (type === 'related' && qs) api = `https://api.giphy.com/v1/tags/related/${encodeURIComponent(qs)}?api_key=${key}`;
  else if (type === 'trending-searches') api = `https://api.giphy.com/v1/trending/searches?api_key=${key}`;
  else if (type === 'categories') api = `https://api.giphy.com/v1/gifs/categories?api_key=${key}`;
  else api = `https://api.giphy.com/v1/${kind}/trending?api_key=${key}&limit=30&offset=${offset}&rating=${rating}&bundle=messaging_non_clips`;
  const ck = api.split(key).join(''), hit = gifCache.get(ck);
  if (hit && Date.now() - hit.t < 5 * 60e3) return send(res, 200, hit.v);
  try {
    const j = await getJson(api);
    let v;
    if (type === 'autocomplete' || type === 'related') v = { terms: (j.data || []).map(x => x.name).slice(0, 10) };
    else if (type === 'trending-searches') v = { terms: (j.data || []).slice(0, 16) };
    else if (type === 'categories') v = { categories: (j.data || []).map(c => ({ name: c.name, q: c.name_encoded || c.name, preview: c.gif && c.gif.images && c.gif.images.fixed_width_small && c.gif.images.fixed_width_small.url })) };
    else v = { next: j.pagination && j.pagination.total_count > offset + 30 ? offset + 30 : null, items: (j.data || []).map(g => {
      const im = g.images || {}, pv = im.fixed_width_small || im.fixed_width || im.downsized, full = im.fixed_width || im.downsized_medium || im.original;
      return { id: g.id, title: g.title || '', w: +(pv && pv.width) || 100, h: +(pv && pv.height) || 100, preview: pv && (pv.webp || pv.url), mp4: full && full.mp4, url: full && (full.webp || full.url), fw: +(full && full.width) || 200, fh: +(full && full.height) || 200 };
    }).filter(x => x.preview && x.url) };
    gifCache.set(ck, { t: Date.now(), v }); if (gifCache.size > 300) gifCache.delete(gifCache.keys().next().value);
    send(res, 200, v);
  } catch (e) { send(res, 502, { error: 'GIPHY: ' + e.message }); }
}

/* ---------------- GIF picture proxy: this server downloads GIPHY media once, keeps it on disk and serves it, so
   browsers never talk to giphy.com (works where GIPHY is blocked/slow, and nothing about the viewer leaks to GIPHY). ---------------- */
const GIF_HOST = /^(media\d?|i)\.giphy\.com$/, GIF_CAP = 300 * 1024 * 1024, GIF_MAX = 25 * 1024 * 1024;
const gifLoads = new Map();   // in-flight downloads, so 5 people opening the picker fetch each GIF once
let gifBytes = -1;
function gifDir() { const d = path.join(DIR, 'gifcache'); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return d; }
function gifPrune() {
  const d = gifDir();
  const files = fs.readdirSync(d).filter(f => !f.endsWith('.tmp') && !f.endsWith('.type')).map(f => { try { const st = fs.statSync(path.join(d, f)); return { f, size: st.size, t: st.atimeMs > st.mtimeMs ? st.atimeMs : st.mtimeMs }; } catch { return null; } }).filter(Boolean);
  gifBytes = files.reduce((a, x) => a + x.size, 0);
  if (gifBytes <= GIF_CAP) return;
  files.sort((a, b) => a.t - b.t);
  for (const x of files) { if (gifBytes <= GIF_CAP * 0.8) break; try { fs.rmSync(path.join(d, x.f)); fs.rmSync(path.join(d, x.f + '.type'), { force: true }); gifBytes -= x.size; } catch {} }
}
function gifDownload(u, file, hops = 0) {
  return new Promise((resolve, reject) => {
    const r = https.get(u, { timeout: 15000, headers: { 'user-agent': 'Mozilla/5.0 (SanjivramOS GIF proxy)', accept: 'image/webp,image/gif,video/mp4,*/*' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 3) {
        res.resume(); let nu; try { nu = new URL(res.headers.location, u); } catch { return reject(new Error('bad redirect')); }
        if (nu.protocol !== 'https:' || !GIF_HOST.test(nu.hostname)) return reject(new Error('redirected away from GIPHY'));
        return gifDownload(nu.href, file, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GIPHY said ' + res.statusCode)); }
      const type = String(res.headers['content-type'] || '').split(';')[0];
      if (!/^(image\/(gif|webp|png|jpeg)|video\/mp4)$/.test(type)) { res.resume(); return reject(new Error('not a picture')); }
      const tmp = file + '.' + process.pid + '.tmp', out = fs.createWriteStream(tmp, { mode: 0o600 }); let n = 0;
      res.on('data', c => { n += c.length; if (n > GIF_MAX) { r.destroy(new Error('too big')); } });
      res.pipe(out);
      out.on('finish', () => { try { fs.writeFileSync(file + '.type', type); fs.renameSync(tmp, file); if (gifBytes >= 0) gifBytes += n; resolve(); } catch (e) { reject(e); } });
      const bad = e => { out.destroy(); try { fs.rmSync(tmp, { force: true }); } catch {} reject(e); };
      res.on('error', bad); r.on('error', bad);
    });
    r.on('timeout', () => r.destroy(new Error('GIPHY timed out'))); r.on('error', reject);
  });
}
async function gifMedia(req, res, url) {
  const me = userFromReq(req); if (!me) return send(res, 401, { error: 'Not signed in' });
  let u; try { u = new URL(String(url.searchParams.get('u') || '')); } catch { return send(res, 400, { error: 'Bad address' }); }
  if (u.protocol !== 'https:' || !GIF_HOST.test(u.hostname) || u.username || u.port) return send(res, 400, { error: 'Only GIPHY pictures' });
  const file = path.join(gifDir(), crypto.createHash('sha256').update(u.href).digest('hex').slice(0, 40));
  if (!fs.existsSync(file)) {
    if (limited(attempts, 'gm' + me.id, 600, 60e3)) return send(res, 429, { error: 'Slow down' });
    let job = gifLoads.get(file);
    if (!job) { job = gifDownload(u.href, file).finally(() => gifLoads.delete(file)); gifLoads.set(file, job); }
    try { await job; } catch (e) { return send(res, 502, { error: e.message }); }
    if (gifBytes < 0 || gifBytes > GIF_CAP) setImmediate(() => { try { gifPrune(); } catch {} });
  }
  let type = 'image/gif'; try { type = fs.readFileSync(file + '.type', 'utf8'); } catch {}
  const size = fs.statSync(file).size, now = new Date(); try { fs.utimesSync(file, now, fs.statSync(file).mtime); } catch {}
  const head = { 'content-type': type, 'cache-control': 'private, max-age=604800, immutable', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (a < 0) a = 0;
    if (a > b || a >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1 });
    return fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------------- link previews (public addresses only, so nobody can probe this network through it) ---------------- */
const pvCache = new Map();
async function publicHost(host) {
  const addrs = await dns.lookup(host, { all: true });
  return addrs.length && addrs.every(a => { try { return ipaddr.process(a.address).range() === 'unicast'; } catch { return false; } });
}
function fetchHead(u, depth = 0) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.get(u, { timeout: 6000, headers: { 'user-agent': 'Mozilla/5.0 (SanjivramOS link preview)', accept: 'text/html' } }, async res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 3) {
        res.resume();
        try { const n = new URL(res.headers.location, u); if (!/^https?:$/.test(n.protocol) || !(await publicHost(n.hostname))) return reject(new Error('blocked')); resolve(await fetchHead(n, depth + 1)); } catch (e) { reject(e); }
        return;
      }
      if (!/text\/html/.test(res.headers['content-type'] || '')) { res.resume(); return resolve(''); }
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => { d += c; if (d.length > 400000 || /<\/head>/i.test(d)) { r.destroy(); resolve(d); } });
      res.on('end', () => resolve(d));
    });
    r.on('timeout', () => r.destroy(new Error('timed out'))); r.on('error', reject);
  });
}
async function preview(res, url, me) {
  let u; try { u = new URL(url.searchParams.get('url') || ''); } catch { return send(res, 400, { error: 'bad url' }); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return send(res, 400, { error: 'bad url' });
  if (limited(attempts, 'pv' + me.id, 60, 60e3)) return send(res, 429, { error: 'slow down' });
  const hit = pvCache.get(u.href); if (hit) return send(res, 200, hit);
  try {
    if (!(await publicHost(u.hostname))) return send(res, 400, { error: 'private address' });
    const html = await fetchHead(u);
    const meta = k => { const m = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i').exec(html); return m ? m[1] : ''; };
    const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const title = dec(meta('og:title') || ((/<title[^>]*>([^<]*)/i.exec(html) || [])[1] || '')).slice(0, 200);
    let image = meta('og:image'); try { image = image ? new URL(dec(image), u).href : ''; } catch { image = ''; }
    const v = { url: u.href, site: dec(meta('og:site_name') || u.hostname), title, desc: dec(meta('og:description') || meta('description')).slice(0, 300), image: /^https:/.test(image) ? image : '' };
    pvCache.set(u.href, v); if (pvCache.size > 500) pvCache.delete(pvCache.keys().next().value);
    send(res, 200, v);
  } catch (e) { send(res, 200, { url: u.href, site: u.hostname, title: '', desc: '', image: '' }); }
}

/* ---------------- real-time: WebSocket /social ---------------- */
const activity = new Map();   // userId -> {game, gameName, room, since}
export function setActivity(uid, a) { if (a) activity.set(uid, { ...a, since: Date.now() }); else activity.delete(uid); presence(uid); }
function emit(uid, msg) { const set = sockets.get(uid); if (!set) return false; const s = JSON.stringify(msg); for (const ws of set) if (ws.readyState === 1) ws.send(s); return true; }
const memberIds = cid => q('SELECT user_id FROM members WHERE convo_id=?', cid).map(r => r.user_id);
function emitConvo(cid, msg, except) { for (const uid of memberIds(cid)) if (uid !== except) emit(uid, msg); }
const isMember = (cid, uid) => !!q1('SELECT 1 FROM members WHERE convo_id=? AND user_id=?', cid, uid);
const friendRow = (a, b) => q1('SELECT * FROM friends WHERE a=? AND b=?', Math.min(a, b), Math.max(a, b));
const blocked = (a, b) => !!q1('SELECT 1 FROM blocks WHERE (user_id=? AND blocked=?) OR (user_id=? AND blocked=?)', a, b, b, a);
function presence(uid) {
  const u = userById(uid); if (!u) return;
  const p = { t: 'presence', user: publicUser(u) };
  const friends = q(`SELECT CASE WHEN a=? THEN b ELSE a END AS f FROM friends WHERE (a=? OR b=?) AND status='accepted'`, uid, uid, uid).map(r => r.f);
  const mates = q('SELECT DISTINCT m2.user_id AS f FROM members m1 JOIN members m2 ON m1.convo_id=m2.convo_id WHERE m1.user_id=? AND m2.user_id<>?', uid, uid).map(r => r.f);
  for (const f of new Set([...friends, ...mates])) emit(f, p);
}
function msgOut(m, me) {
  if (!m) return null;
  const reacts = {}; for (const r of q('SELECT emoji, user_id FROM reactions WHERE msg_id=?', m.id)) (reacts[r.emoji] = reacts[r.emoji] || []).push(r.user_id);
  const replyTo = m.reply_to ? q1('SELECT id, user_id, kind, body, deleted FROM messages WHERE id=?', m.reply_to) : null;
  const threadN = q1('SELECT COUNT(*) n FROM messages WHERE thread_root=? AND deleted=0', m.id).n;
  return { id: m.id, cid: m.convo_id, uid: m.user_id, kind: m.deleted ? 'deleted' : m.kind, body: m.deleted ? '' : m.body, meta: m.deleted ? null : (m.meta ? JSON.parse(m.meta) : null), replyTo: replyTo && { id: replyTo.id, uid: replyTo.user_id, kind: replyTo.kind, body: replyTo.deleted ? '' : String(replyTo.body || '').slice(0, 140) },
    thread: m.thread_root || null, threadN, fwd: !!m.forwarded, at: m.created, edited: m.edited || null, reacts, pinned: !!q1('SELECT 1 FROM pins WHERE convo_id=? AND msg_id=?', m.convo_id, m.id) };
}
const hidesReads = id => prefsOf(q1('SELECT prefs FROM users WHERE id=?', id)).readReceipts === false;
function receiptsFor(cid, viewer) {
  const meHides = hidesReads(viewer);
  return q('SELECT user_id uid, last_read read, last_delivered delivered FROM members WHERE convo_id=?', cid).map(r => (r.uid !== viewer && (meHides || hidesReads(r.uid))) ? { ...r, read: 0 } : r);
}
function emitReceipts(cid, except) { for (const uid of memberIds(cid)) if (uid !== except) emit(uid, { t: 'receipts', cid, members: receiptsFor(cid, uid) }); }
function convoOut(c, uid) {
  const mem = q1('SELECT * FROM members WHERE convo_id=? AND user_id=?', c.id, uid);
  const people = q('SELECT u.*, m.role mrole, m.last_read, m.last_delivered FROM members m JOIN users u ON u.id=m.user_id WHERE m.convo_id=?', c.id);
  const last = q1('SELECT * FROM messages WHERE convo_id=? AND thread_root IS NULL ORDER BY id DESC LIMIT 1', c.id);
  const unread = q1('SELECT COUNT(*) n FROM messages WHERE convo_id=? AND id>? AND user_id<>? AND deleted=0 AND thread_root IS NULL', c.id, mem ? mem.last_read : 0, uid).n;
  return { id: c.id, kind: c.kind, name: c.name, avatar: c.avatar, created: c.created, muted: !!(mem && mem.muted), archived: !!(mem && mem.archived), role: mem && mem.role,
    members: people.map(p => ({ ...publicUser(p), role: p.mrole, read: p.id !== uid && (hidesReads(uid) || hidesReads(p.id)) ? 0 : p.last_read, delivered: p.last_delivered })), last: msgOut(last, uid), unread,
    theme: c.theme ? (() => { try { return JSON.parse(c.theme); } catch { return null; } })() : null };
}
function convoList(uid) { return q('SELECT c.* FROM convos c JOIN members m ON m.convo_id=c.id WHERE m.user_id=? ORDER BY c.last_msg DESC', uid).map(c => convoOut(c, uid)); }
function friendList(uid) {
  return q(`SELECT f.status, f.requester, u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=?`, uid, uid, uid)
    .map(r => ({ user: publicUser(r), status: r.status, incoming: r.status === 'pending' && r.requester !== uid }));
}
function addMessage(cid, uid, kind, bodyText, meta = null, extra = {}) {
  const now = Date.now();
  const r = run('INSERT INTO messages(convo_id,user_id,kind,body,meta,reply_to,thread_root,forwarded,created) VALUES(?,?,?,?,?,?,?,?,?)', cid, uid, kind, bodyText, meta ? JSON.stringify(meta) : null, extra.replyTo || null, extra.thread || null, extra.fwd ? 1 : 0, now);
  const id = Number(r.lastInsertRowid);
  if (!extra.thread) run('UPDATE convos SET last_msg=? WHERE id=?', now, cid);
  if (uid) run('UPDATE members SET last_read=?, last_delivered=MAX(last_delivered,?) WHERE convo_id=? AND user_id=?', id, id, cid, uid);
  const out = msgOut(q1('SELECT * FROM messages WHERE id=?', id), uid);
  emitConvo(cid, { t: 'msg', msg: out });
  // anyone online has it now: mark delivered and tell the sender
  for (const m of memberIds(cid)) if (m !== uid && sockets.has(m)) run('UPDATE members SET last_delivered=MAX(last_delivered,?) WHERE convo_id=? AND user_id=?', id, cid, m);
  emitReceipts(cid);
  return out;
}
function dmFor(a, b) {
  const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
  let c = q1('SELECT * FROM convos WHERE dm_key=?', key);
  if (!c) {
    const r = run('INSERT INTO convos(kind,dm_key,created_by,created,last_msg) VALUES(?,?,?,?,?)', 'dm', key, a, Date.now(), Date.now());
    const cid = Number(r.lastInsertRowid);
    for (const u of [a, b]) run('INSERT INTO members(convo_id,user_id,joined) VALUES(?,?,?)', cid, u, Date.now());
    c = q1('SELECT * FROM convos WHERE id=?', cid);
  }
  return c;
}

/* calls: signalling only — media goes peer to peer (WebRTC), so it never passes through this server unless a TURN relay is set */
const calls = new Map();   // callId -> {id, cid, video, people:Set(uid), ringing:Set(uid), timer}
function callOut(c) { return { id: c.id, cid: c.cid, video: c.video, by: c.by, people: [...c.people], ringing: [...c.ringing], started: c.started }; }
function endCall(c, why) {
  clearTimeout(c.timer); calls.delete(c.id);
  run('UPDATE calls SET ended=? WHERE id=?', Date.now(), c.id);
  const row = q1('SELECT * FROM calls WHERE id=?', c.id);
  const dur = row.answered ? Math.round((Date.now() - row.answered) / 1000) : 0;
  addMessage(c.cid, null, 'call', '', { video: !!c.video, by: c.by, missed: !row.answered, duration: dur, why });
  emitConvo(c.cid, { t: 'call.end', call: callOut(c), why });
}
function iceServers() {
  const list = [];
  const stun = process.env.SJ_STUN === 'off' ? '' : (process.env.SJ_STUN || 'stun:stun.l.google.com:19302');
  if (stun) list.push({ urls: stun.split(',') });
  if (process.env.SJ_TURN_URL) {
    // Short-lived TURN credentials (coturn "use-auth-secret" / REST API style) so the shared secret never reaches browsers.
    if (process.env.SJ_TURN_SECRET) { const user = `${Math.floor(Date.now() / 1000) + 12 * 3600}:sjos`; list.push({ urls: process.env.SJ_TURN_URL.split(','), username: user, credential: crypto.createHmac('sha1', process.env.SJ_TURN_SECRET).update(user).digest('base64') }); }
    else if (process.env.SJ_TURN_USER) list.push({ urls: process.env.SJ_TURN_URL.split(','), username: process.env.SJ_TURN_USER, credential: process.env.SJ_TURN_PASS || '' });
  }
  return list;
}

const OPS = {
  hello(me) { return { prefs: prefsOf(me), me: meOf(me), friends: friendList(me.id), convos: convoList(me.id), ice: iceServers(), calls: [...calls.values()].filter(c => isMember(c.cid, me.id)).map(callOut), gif: !!gifKey() }; },
  'user.search'(me, a) { const s = String(a.q || '').trim(); if (s.length < 1) return { users: [] }; return { users: q(`SELECT * FROM users WHERE (username LIKE ? OR display LIKE ?) AND id<>? AND banned=0 LIMIT 20`, s + '%', '%' + s + '%', me.id).filter(u => !blocked(me.id, u.id)).map(publicUser) }; },
  'user.get'(me, a) { const u = userById(+a.id); if (!u) throw new Error('No such user'); return { user: publicUser(u), friend: friendRow(me.id, u.id), blocked: !!q1('SELECT 1 FROM blocks WHERE user_id=? AND blocked=?', me.id, u.id) }; },
  'profile.update'(me, a) {
    const display = a.display !== undefined ? String(a.display).trim().slice(0, 40) || me.username : me.display;
    const bio = a.bio !== undefined ? String(a.bio).slice(0, 200) : me.bio;
    let avatar = me.avatar; if (a.avatar !== undefined) { avatar = a.avatar ? ownFileUrl(me, a.avatar, 'avatar') : null; }
    run('UPDATE users SET display=?, bio=?, avatar=? WHERE id=?', display, bio, avatar, me.id);
    presence(me.id); return { me: meOf(userById(me.id)) };
  },
  'friend.request'(me, a) {
    need(me, 'friends');
    const u = a.id ? userById(+a.id) : q1('SELECT * FROM users WHERE username=?', String(a.username || '').trim());
    if (!u || u.id === me.id || u.banned) throw new Error('No one with that username');
    if (blocked(me.id, u.id)) throw new Error('You can’t add this person');
    if (limited(attempts, 'fr' + me.id, 30, 3600e3)) throw new Error('Too many friend requests. Try later.');
    const f = friendRow(me.id, u.id);
    if (f && f.status === 'accepted') return { ok: true };
    if (f && f.status === 'pending' && f.requester !== me.id) return OPS['friend.accept'](me, { id: u.id });
    if (!f) run('INSERT INTO friends(a,b,status,requester,created) VALUES(?,?,?,?,?)', Math.min(me.id, u.id), Math.max(me.id, u.id), 'pending', me.id, Date.now());
    emit(u.id, { t: 'friends', friends: friendList(u.id), note: { kind: 'request', from: publicUser(me) } });
    return { friends: friendList(me.id) };
  },
  'friend.accept'(me, a) {
    const f = friendRow(me.id, +a.id); if (!f || f.requester === me.id) throw new Error('No request from them');
    run(`UPDATE friends SET status='accepted' WHERE a=? AND b=?`, f.a, f.b);
    emit(+a.id, { t: 'friends', friends: friendList(+a.id), note: { kind: 'accepted', from: publicUser(me) } });
    return { friends: friendList(me.id) };
  },
  'friend.remove'(me, a) { const f = friendRow(me.id, +a.id); if (f) run('DELETE FROM friends WHERE a=? AND b=?', f.a, f.b); emit(+a.id, { t: 'friends', friends: friendList(+a.id) }); return { friends: friendList(me.id) }; },
  block(me, a) { const id = +a.id; if (!userById(id) || id === me.id) throw new Error('No such user'); run('INSERT OR IGNORE INTO blocks VALUES(?,?)', me.id, id); OPS['friend.remove'](me, { id }); return { friends: friendList(me.id) }; },
  unblock(me, a) { run('DELETE FROM blocks WHERE user_id=? AND blocked=?', me.id, +a.id); return { ok: true }; },
  blocks(me) { return { users: q('SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked WHERE b.user_id=?', me.id).map(publicUser) }; },
  'convo.dm'(me, a) {
    const u = userById(+a.id); if (!u || u.id === me.id) throw new Error('No such user');
    if (blocked(me.id, u.id)) throw new Error('You can’t message this person');
    const c = dmFor(me.id, u.id); return { convo: convoOut(c, me.id) };
  },
  'convo.group'(me, a) {
    need(me, 'groups');
    const ids = [...new Set((a.members || []).map(Number))].filter(id => id !== me.id && userById(id) && !blocked(me.id, id)).slice(0, 49);
    if (!ids.length) throw new Error('Add at least one person');
    const name = String(a.name || '').trim().slice(0, 60) || null;
    const r = run('INSERT INTO convos(kind,name,created_by,created,last_msg) VALUES(?,?,?,?,?)', 'group', name, me.id, Date.now(), Date.now());
    const cid = Number(r.lastInsertRowid);
    run('INSERT INTO members(convo_id,user_id,role,joined) VALUES(?,?,?,?)', cid, me.id, 'owner', Date.now());
    for (const id of ids) run('INSERT INTO members(convo_id,user_id,joined) VALUES(?,?,?)', cid, id, Date.now());
    addMessage(cid, null, 'system', `${me.display} created the group`);
    for (const id of [me.id, ...ids]) emit(id, { t: 'convo', convo: convoOut(q1('SELECT * FROM convos WHERE id=?', cid), id) });
    return { convo: convoOut(q1('SELECT * FROM convos WHERE id=?', cid), me.id) };
  },
  'convo.update'(me, a) {
    const c = needConvo(me, a.cid); if (c.kind !== 'group') throw new Error('Only groups can be renamed');
    if (a.name !== undefined) { run('UPDATE convos SET name=? WHERE id=?', String(a.name).trim().slice(0, 60) || null, c.id); addMessage(c.id, null, 'system', `${me.display} renamed the group to “${String(a.name).trim().slice(0, 60)}”`); }
    if (a.avatar !== undefined) { const url = a.avatar ? ownFileUrl(me, a.avatar, 'avatar') : null; run('UPDATE convos SET avatar=? WHERE id=?', url, c.id); }
    pushConvo(c.id); return { ok: true };
  },
  'convo.add'(me, a) {
    const c = needConvo(me, a.cid); if (c.kind !== 'group') throw new Error('Not a group');
    const added = [];
    for (const id of (a.members || []).map(Number)) { const u = userById(id); if (u && !isMember(c.id, id) && !blocked(me.id, id)) { run('INSERT INTO members(convo_id,user_id,joined,last_read) VALUES(?,?,?,?)', c.id, id, Date.now(), 0); added.push(u.display); } }
    if (added.length) addMessage(c.id, null, 'system', `${me.display} added ${added.join(', ')}`);
    pushConvo(c.id); return { ok: true };
  },
  'convo.kick'(me, a) {
    const c = needConvo(me, a.cid), mine = q1('SELECT role FROM members WHERE convo_id=? AND user_id=?', c.id, me.id);
    if (c.kind !== 'group' || !['owner', 'admin'].includes(mine.role)) throw new Error('Only group admins can remove people');
    const u = userById(+a.id); if (!u || !isMember(c.id, u.id)) throw new Error('Not in this group');
    run('DELETE FROM members WHERE convo_id=? AND user_id=?', c.id, u.id); emit(u.id, { t: 'convo.gone', cid: c.id });
    addMessage(c.id, null, 'system', `${me.display} removed ${u.display}`); pushConvo(c.id); return { ok: true };
  },
  'convo.leave'(me, a) {
    const c = needConvo(me, a.cid); if (c.kind !== 'group') throw new Error('You can archive a direct chat instead');
    run('DELETE FROM members WHERE convo_id=? AND user_id=?', c.id, me.id);
    const left = memberIds(c.id);
    if (left.length && !q1(`SELECT 1 FROM members WHERE convo_id=? AND role='owner'`, c.id)) run(`UPDATE members SET role='owner' WHERE convo_id=? AND user_id=?`, c.id, left[0]);
    addMessage(c.id, null, 'system', `${me.display} left`); pushConvo(c.id); return { ok: true };
  },
  'convo.theme'(me, a) {
    const c = needConvo(me, a.cid), t = a.theme;
    let theme = null;
    if (t) {
      const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : null;
      theme = { id: String(t.id || 'custom').replace(/[^a-z0-9-]/gi, '').slice(0, 24), name: String(t.name || '').slice(0, 30), out: hex(t.out), outText: hex(t.outText), in: hex(t.in), inText: hex(t.inText), bg: hex(t.bg), bg2: hex(t.bg2), pattern: ['none', 'dots', 'grid', 'waves', 'stars', 'hearts'].includes(t.pattern) ? t.pattern : 'none', emoji: [...String(t.emoji || '')].slice(0, 2).join('') };
      if (!theme.out) throw new Error('Pick a bubble colour');
    }
    run('UPDATE convos SET theme=? WHERE id=?', theme ? JSON.stringify(theme) : null, c.id);
    addMessage(c.id, null, 'system', theme ? `${me.display} changed the chat theme to ${theme.name || 'a custom theme'}` : `${me.display} reset the chat theme`);
    pushConvo(c.id); return { ok: true };
  },
  'prefs.get'(me) { return { prefs: prefsOf(me) }; },
  'prefs.set'(me, a) {
    const p = prefsOf(me);
    for (const k of ['readReceipts', 'showOnline', 'showActivity']) if (typeof a[k] === 'boolean') p[k] = a[k];
    run('UPDATE users SET prefs=? WHERE id=?', JSON.stringify(p), me.id);
    presence(me.id);
    for (const r of q('SELECT convo_id FROM members WHERE user_id=?', me.id)) emitReceipts(r.convo_id);
    return { prefs: p };
  },
  'convo.settings'(me, a) {
    const c = needConvo(me, a.cid);
    if (a.muted !== undefined) run('UPDATE members SET muted=? WHERE convo_id=? AND user_id=?', a.muted ? 1 : 0, c.id, me.id);
    if (a.archived !== undefined) run('UPDATE members SET archived=? WHERE convo_id=? AND user_id=?', a.archived ? 1 : 0, c.id, me.id);
    return { convo: convoOut(c, me.id) };
  },
  'msgs.get'(me, a) {
    const c = needConvo(me, a.cid), lim = Math.min(100, +a.limit || 50);
    const rows = a.thread ? q('SELECT * FROM messages WHERE thread_root=? AND convo_id=? ORDER BY id', +a.thread, c.id)
      : q('SELECT * FROM messages WHERE convo_id=? AND thread_root IS NULL AND id < ? ORDER BY id DESC LIMIT ?', c.id, +a.before || 9e15, lim).reverse();
    return { msgs: rows.map(m => msgOut(m, me.id)), more: !a.thread && rows.length === lim, root: a.thread ? msgOut(q1('SELECT * FROM messages WHERE id=?', +a.thread), me.id) : null };
  },
  'msg.send'(me, a) {
    const c = needConvo(me, a.cid);
    if (c.kind === 'dm') { const other = memberIds(c.id).find(x => x !== me.id); if (other && blocked(me.id, other)) throw new Error('You can’t message this person'); }
    if (limited(attempts, 'msg' + me.id, 20, 10e3)) throw new Error('You’re sending messages too fast');
    need(me, 'chat');
    const kind = ['text', 'gif', 'sticker', 'file', 'voice', 'invite', 'image', 'video'].includes(a.kind) ? a.kind : 'text';
    const text = String(a.body || '').slice(0, 4000);
    if (kind === 'gif' || kind === 'sticker') need(me, 'gifs'); if (['file', 'voice', 'image', 'video'].includes(kind)) need(me, 'media'); if (kind === 'invite') need(me, 'invites');
    let meta = null;
    if (kind === 'text' && !text.trim()) throw new Error('Empty message');
    if (kind === 'gif' || kind === 'sticker') {
      const g = a.meta || {};
      if (g.file) { meta = { file: fileForConvo(me, g.file, c.id, true), w: +g.w || 0, h: +g.h || 0, name: String(g.name || '').slice(0, 80) }; }
      else if (kind === 'sticker' && g.emoji) { const e = String(g.emoji); if ([...e].length > 12 || /[<>&"]/.test(e)) throw new Error('Bad sticker'); meta = { emoji: e, pack: String(g.pack || '').slice(0, 30) }; }
      else { if (!/^https:\/\/(media\d?|i)\.giphy\.com\//.test(String(g.url || ''))) throw new Error('Unknown GIF source'); meta = { url: String(g.url), mp4: /^https:\/\/(media\d?|i)\.giphy\.com\//.test(String(g.mp4 || '')) ? String(g.mp4) : null, w: +g.w || 200, h: +g.h || 200, title: String(g.title || '').slice(0, 120), source: 'giphy' }; }
    }
    if (['file', 'voice', 'image', 'video'].includes(kind)) { const files = (a.meta && a.meta.files || []).slice(0, 10).map(id => fileForConvo(me, id, c.id)); if (!files.length) throw new Error('No file'); meta = { files, duration: a.meta.duration ? +a.meta.duration : undefined, wave: Array.isArray(a.meta.wave) ? a.meta.wave.slice(0, 64).map(n => Math.max(0, Math.min(1, +n || 0))) : undefined }; }
    if (kind === 'invite') { const i = a.meta || {}; meta = { game: String(i.game || '').slice(0, 40), name: String(i.name || '').slice(0, 60), code: String(i.code || '').replace(/[^A-Z0-9]/g, '').slice(0, 8), room: String(i.room || '').slice(0, 60), host: String(i.host || '').slice(0, 80) }; }
    if (kind === 'text' && a.meta && a.meta.screenshot) meta = { screenshot: fileForConvo(me, a.meta.screenshot, c.id) };
    let replyTo = null, thread = null;
    if (a.replyTo) { const r = q1('SELECT id FROM messages WHERE id=? AND convo_id=?', +a.replyTo, c.id); replyTo = r ? r.id : null; }
    if (a.thread) { const r = q1('SELECT id, thread_root FROM messages WHERE id=? AND convo_id=?', +a.thread, c.id); thread = r ? (r.thread_root || r.id) : null; }
    const msg = addMessage(c.id, me.id, kind, text, meta, { replyTo, thread });
    if (thread) emitConvo(c.id, { t: 'msg.update', msg: msgOut(q1('SELECT * FROM messages WHERE id=?', thread), me.id) });
    return { msg, clientId: a.clientId };
  },
  'msg.edit'(me, a) {
    const m = q1('SELECT * FROM messages WHERE id=?', +a.id); if (!m || m.user_id !== me.id || m.deleted || m.kind !== 'text') throw new Error('You can only edit your own text messages');
    const text = String(a.body || '').slice(0, 4000); if (!text.trim()) throw new Error('Empty message');
    run('UPDATE messages SET body=?, edited=? WHERE id=?', text, Date.now(), m.id);
    emitConvo(m.convo_id, { t: 'msg.update', msg: msgOut(q1('SELECT * FROM messages WHERE id=?', m.id), me.id) }); return { ok: true };
  },
  'msg.delete'(me, a) {
    const m = q1('SELECT * FROM messages WHERE id=?', +a.id); if (!m || !isMember(m.convo_id, me.id)) throw new Error('No such message');
    const mod = q1('SELECT role FROM members WHERE convo_id=? AND user_id=?', m.convo_id, me.id).role;
    if (m.user_id !== me.id && !['owner', 'admin'].includes(mod) && !isAdmin(me)) throw new Error('You can only delete your own messages');
    run(`UPDATE messages SET deleted=1, body='', meta=NULL WHERE id=?`, m.id); run('DELETE FROM pins WHERE msg_id=?', m.id);
    emitConvo(m.convo_id, { t: 'msg.update', msg: msgOut(q1('SELECT * FROM messages WHERE id=?', m.id), me.id) }); return { ok: true };
  },
  'msg.react'(me, a) {
    const m = q1('SELECT * FROM messages WHERE id=?', +a.id); if (!m || !isMember(m.convo_id, me.id) || m.deleted) throw new Error('No such message');
    const e = String(a.emoji || '').slice(0, 16); if (!e) throw new Error('No emoji');
    if (q1('SELECT 1 FROM reactions WHERE msg_id=? AND user_id=? AND emoji=?', m.id, me.id, e)) run('DELETE FROM reactions WHERE msg_id=? AND user_id=? AND emoji=?', m.id, me.id, e);
    else { if (q1('SELECT COUNT(*) n FROM reactions WHERE msg_id=? AND user_id=?', m.id, me.id).n >= 12) throw new Error('That’s enough reactions'); run('INSERT INTO reactions VALUES(?,?,?)', m.id, me.id, e); }
    emitConvo(m.convo_id, { t: 'msg.update', msg: msgOut(q1('SELECT * FROM messages WHERE id=?', m.id), me.id) }); return { ok: true };
  },
  'msg.pin'(me, a) {
    const m = q1('SELECT * FROM messages WHERE id=?', +a.id); if (!m || !isMember(m.convo_id, me.id) || m.deleted) throw new Error('No such message');
    if (a.on) run('INSERT OR IGNORE INTO pins VALUES(?,?,?,?)', m.convo_id, m.id, me.id, Date.now()); else run('DELETE FROM pins WHERE convo_id=? AND msg_id=?', m.convo_id, m.id);
    if (a.on) addMessage(m.convo_id, null, 'system', `${me.display} pinned a message`, { pin: m.id });
    emitConvo(m.convo_id, { t: 'msg.update', msg: msgOut(m, me.id) }); return { ok: true };
  },
  'pins.get'(me, a) { const c = needConvo(me, a.cid); return { msgs: q('SELECT m.* FROM pins p JOIN messages m ON m.id=p.msg_id WHERE p.convo_id=? ORDER BY p.created DESC', c.id).map(m => msgOut(m, me.id)) }; },
  'msg.forward'(me, a) {
    need(me, 'chat');
    const m = q1('SELECT * FROM messages WHERE id=?', +a.id); if (!m || !isMember(m.convo_id, me.id) || m.deleted) throw new Error('No such message');
    const c = needConvo(me, a.cid);
    const meta = m.meta ? JSON.parse(m.meta) : null;
    if (meta && meta.files) for (const f of meta.files) run('INSERT OR IGNORE INTO file_access VALUES(?,?)', f.id, c.id);
    if (meta && meta.file) run('INSERT OR IGNORE INTO file_access VALUES(?,?)', meta.file.id, c.id);
    return { msg: addMessage(c.id, me.id, m.kind, m.body, meta, { fwd: true }) };
  },
  read(me, a) {
    const c = needConvo(me, a.cid), id = +a.id || 0;
    run('UPDATE members SET last_read=MAX(last_read,?), last_delivered=MAX(last_delivered,?) WHERE convo_id=? AND user_id=?', id, id, c.id, me.id);
    emitReceipts(c.id);
    return { ok: true };
  },
  typing(me, a) { const c = needConvo(me, a.cid); emitConvo(c.id, { t: 'typing', cid: c.id, uid: me.id, thread: a.thread || null }, me.id); return null; },
  search(me, a) {
    const s = String(a.q || '').trim().slice(0, 100); if (!s) return { msgs: [] };
    const cid = a.cid ? needConvo(me, a.cid).id : null;
    let rows;
    if (hasFts) {
      const fts = s.split(/\s+/).map(w => '"' + w.replace(/"/g, '') + '"*').join(' ');
      rows = q(`SELECT m.* FROM msg_fts f JOIN messages m ON m.id=f.rowid JOIN members mb ON mb.convo_id=m.convo_id AND mb.user_id=? WHERE msg_fts MATCH ? AND m.deleted=0 ${cid ? 'AND m.convo_id=' + cid : ''} ORDER BY m.id DESC LIMIT 50`, me.id, fts);
    } else rows = q(`SELECT m.* FROM messages m JOIN members mb ON mb.convo_id=m.convo_id AND mb.user_id=? WHERE m.body LIKE ? AND m.deleted=0 ${cid ? 'AND m.convo_id=' + cid : ''} ORDER BY m.id DESC LIMIT 50`, me.id, '%' + s + '%');
    return { msgs: rows.map(m => msgOut(m, me.id)) };
  },
  report(me, a) {
    const m = a.msg ? q1('SELECT * FROM messages WHERE id=?', +a.msg) : null;
    if (m && !isMember(m.convo_id, me.id)) throw new Error('No such message');
    const uid = m ? m.user_id : +a.user; if (!userById(uid)) throw new Error('No such user');
    run('INSERT INTO reports(reporter,user_id,msg_id,reason,created) VALUES(?,?,?,?,?)', me.id, uid, m ? m.id : null, String(a.reason || '').slice(0, 500), Date.now());
    for (const ad of q(`SELECT id FROM users WHERE role IN ('admin','owner')`)) emit(ad.id, { t: 'mod.report' });
    return { ok: true };
  },
  'mod.reports'(me) { needAdmin(me); return { reports: q('SELECT r.*, u.username target, ru.username by_name, m.body FROM reports r JOIN users u ON u.id=r.user_id JOIN users ru ON ru.id=r.reporter LEFT JOIN messages m ON m.id=r.msg_id WHERE resolved=0 ORDER BY r.id DESC LIMIT 100') }; },
  'mod.resolve'(me, a) { needAdmin(me); run('UPDATE reports SET resolved=1 WHERE id=?', +a.id); return { ok: true }; },
  // ---- people management (admins; the owner can also manage admins) ----
  'mod.users'(me) {
    needAdmin(me);
    const counts = Object.fromEntries(q('SELECT user_id, COUNT(*) n FROM messages WHERE deleted=0 AND user_id IS NOT NULL GROUP BY user_id').map(r => [r.user_id, r.n]));
    const users = q('SELECT * FROM users ORDER BY id').map(u => ({ id: u.id, username: u.username, display: u.display, avatar: u.avatar || null, role: u.role || 'user', banned: !!u.banned,
      perms: permsOf(u), created: u.created, lastSeen: u.last_seen || null, online: sockets.has(u.id), msgs: counts[u.id] || 0, canManage: u.id !== me.id && rankOf(me) > rankOf(u) }));
    return { users, perms: PERMS, me: { id: me.id, role: me.role } };
  },
  'mod.perms'(me, a) {
    needAdmin(me); const u = userById(+a.id); needAbove(me, u);
    const p = a.perms || {}, off = Object.keys(PERMS).filter(k => p[k] === false);
    run('UPDATE users SET perms=? WHERE id=?', off.length ? JSON.stringify(off) : null, u.id);
    const nu = userById(u.id); emit(u.id, { t: 'me', me: meOf(nu) });
    return { ok: true, perms: permsOf(nu) };
  },
  'mod.role'(me, a) {
    if (me.role !== 'owner') throw new Error('Only the owner can make or remove admins');
    const u = userById(+a.id); needAbove(me, u);
    const role = a.role === 'admin' ? 'admin' : 'user';
    run('UPDATE users SET role=? WHERE id=?', role, u.id);
    emit(u.id, { t: 'me', me: meOf(userById(u.id)) });
    return { ok: true, role };
  },
  'mod.ban'(me, a) {
    needAdmin(me); const u = userById(+a.id); needAbove(me, u);
    run('UPDATE users SET banned=? WHERE id=?', a.on === false ? 0 : 1, u.id);
    if (a.on !== false) { run('DELETE FROM sessions WHERE user_id=?', u.id); for (const ws of sockets.get(u.id) || []) ws.close(4003, 'banned'); }
    return { ok: true };
  },
  'mod.ips'(me, a) {
    needAdmin(me); const u = userById(+a.id); if (!u) throw new Error('No such account');
    const ips = q('SELECT ip, first, last, hits FROM user_ips WHERE user_id=? ORDER BY last DESC LIMIT 30', u.id).map(r => ({ ...r, banned: bans.has(r.ip),
      others: q('SELECT u.username FROM user_ips i JOIN users u ON u.id=i.user_id WHERE i.ip=? AND i.user_id<>?', r.ip, u.id).map(x => x.username) }));
    return { ips };
  },
  'mod.visitors'(me) {
    needAdmin(me);
    const rows = q('SELECT * FROM visitors ORDER BY last DESC LIMIT 300');
    const accts = new Map(); for (const r of q('SELECT i.ip, u.username, u.role FROM user_ips i JOIN users u ON u.id=i.user_id')) { if (!accts.has(r.ip)) accts.set(r.ip, []); accts.get(r.ip).push(r.username); }
    const online = new Set(); for (const set of sockets.values()) for (const ws of set) if (ws.ip) online.add(ws.ip);
    return { visitors: rows.map(v => ({ ip: v.ip, first: v.first, last: v.last, hits: v.hits, device: device(v.agent), via: v.via, accounts: accts.get(v.ip) || [], banned: bans.has(v.ip), active: Date.now() - v.last < 3 * 60e3 || online.has(v.ip) })) };
  },
  'mod.bans'(me) { needAdmin(me); return { bans: q('SELECT b.*, u.username by_name FROM ip_bans b LEFT JOIN users u ON u.id=b.by_id ORDER BY b.created DESC'),
    devBans: q('SELECT b.*, u.username by_name FROM device_bans b LEFT JOIN users u ON u.id=b.by_id ORDER BY b.created DESC').map(b => ({ ...b, deviceName: device(b.agent) })) }; },
  'mod.devices'(me, a) {
    needAdmin(me);
    const users = new Map(); for (const r of q('SELECT d.device, u.username FROM device_users d JOIN users u ON u.id=d.user_id ORDER BY d.last DESC')) { if (!users.has(r.device)) users.set(r.device, []); users.get(r.device).push(r.username); }
    const online = new Set(); for (const set of sockets.values()) for (const ws of set) if (ws.dev) online.add(ws.dev);
    const rows = a && a.id ? q('SELECT d.* FROM devices d JOIN device_users x ON x.device=d.id WHERE x.user_id=? ORDER BY d.last DESC LIMIT 30', +a.id) : q('SELECT * FROM devices ORDER BY last DESC LIMIT 400');
    const shared = new Map(); for (const r of q('SELECT ip, COUNT(*) n FROM devices GROUP BY ip')) shared.set(r.ip, r.n);
    return { devices: rows.map(d => ({ id: d.id, short: d.id.slice(0, 6), first: d.first, last: d.last, hits: d.hits, device: device(d.agent), ip: d.ip, via: d.via, accounts: users.get(d.id) || [],
      banned: devBans.has(d.id), ipBanned: bans.has(d.ip), sameIp: (shared.get(d.ip) || 1) - 1, active: Date.now() - d.last < 3 * 60e3 || online.has(d.id) })) };
  },
  'mod.devban'(me, a) {
    needAdmin(me);
    const list = [].concat(a.devices || a.device || []).map(String).filter(x => DEV_RE.test(x)).slice(0, 50);
    if (!list.length) throw new Error('Which device?');
    const target = a.id ? userById(+a.id) : null; if (target) needAbove(me, target);
    for (const d of list) {
      const prot = q('SELECT u.username, u.role FROM device_users x JOIN users u ON u.id=x.user_id WHERE x.device=?', d).find(x => (RANK[x.role] || 1) >= rankOf(me));
      if (prot) throw new Error(`That device is also used by @${prot.username} (${prot.role}) — not banned`);
    }
    for (const d of list) {
      const row = q1('SELECT * FROM devices WHERE id=?', d) || {};
      const lu = target ? null : q1('SELECT user_id FROM device_users WHERE device=? ORDER BY last DESC LIMIT 1', d), who = target || (lu ? userById(lu.user_id) : null);
      run('INSERT OR REPLACE INTO device_bans(device,user_id,username,reason,by_id,created,ip,agent) VALUES(?,?,?,?,?,?,?,?)', d, who ? who.id : null, who ? who.username : null, String(a.reason || '').slice(0, 200) || null, me.id, Date.now(), row.ip || null, row.agent || null);
    }
    loadBans();
    for (const [uid, set] of sockets) for (const ws of set) if (ws.dev && devBans.has(ws.dev) && uid !== me.id) try { ws.close(4003, 'device banned'); } catch {}
    if (a.suspend && target) OPS['mod.ban'](me, { id: target.id });
    log(`device ban by @${me.username}: ${list.map(d => d.slice(0, 6)).join(', ')}`);
    return { ok: true, banned: list.length };
  },
  'mod.devunban'(me, a) { needAdmin(me); run('DELETE FROM device_bans WHERE device=?', String(a.device || '')); loadBans(); return { ok: true }; },
  'mod.ipban'(me, a) {
    needAdmin(me);
    const list = [].concat(a.ips || a.ip || []).map(normIp).filter(Boolean).slice(0, 50);
    if (!list.length) throw new Error('Which IP address?');
    const target = a.id ? userById(+a.id) : null; if (target) needAbove(me, target);
    const done = [];
    for (const ip of list) {
      if (!/^[0-9a-f:.]{3,45}$/.test(ip)) throw new Error(`“${ip}” isn’t an IP address`);
      if (LOOP.has(ip) || ip === '0.0.0.0') throw new Error('That’s this phone’s own address — banning it would block everyone coming through the tunnel');
      // never an address the owner/admins (anyone not below you) use
      const prot = q('SELECT u.username, u.role FROM user_ips i JOIN users u ON u.id=i.user_id WHERE i.ip=?', ip).find(x => (RANK[x.role] || 1) >= rankOf(me));
      if (prot) throw new Error(`${ip} is also used by @${prot.username} (${prot.role}) — not banned`);
      const last = target ? null : q1('SELECT user_id FROM user_ips WHERE ip=? ORDER BY last DESC LIMIT 1', ip), who = target || (last ? userById(last.user_id) : null);
      run('INSERT OR REPLACE INTO ip_bans(ip,user_id,username,reason,by_id,created) VALUES(?,?,?,?,?,?)', ip, who ? who.id : null, who ? who.username : null, String(a.reason || '').slice(0, 200) || null, me.id, Date.now());
      done.push(ip);
    }
    loadBans();
    // kick anyone connected from those addresses right now
    for (const [uid, set] of sockets) for (const ws of set) if (ws.ip && bans.has(ws.ip) && uid !== me.id) try { ws.close(4003, 'ip banned'); } catch {}
    if (a.suspend && target) OPS['mod.ban'](me, { id: target.id });
    log(`IP ban by @${me.username}: ${done.join(', ')}`);
    return { ok: true, banned: done };
  },
  'mod.ipunban'(me, a) { needAdmin(me); run('DELETE FROM ip_bans WHERE ip=?', normIp(a.ip)); loadBans(); return { ok: true }; },
  'mod.delete'(me, a) {
    needAdmin(me); const u = userById(+a.id); needAbove(me, u);
    if (String(a.confirm || '').toLowerCase() !== u.username.toLowerCase()) throw new Error('Type their username to confirm');
    deleteAccount(u);
    return { ok: true };
  },
  // stickers: your own uploaded packs
  'sticker.add'(me, a) { const url = ownFileUrl(me, a.file, 'sticker'); run('INSERT INTO stickers(user_id,pack,file_id,created) VALUES(?,?,?,?)', me.id, String(a.pack || 'My stickers').slice(0, 40), a.file, Date.now()); return OPS['sticker.list'](me); },
  'sticker.remove'(me, a) { run('DELETE FROM stickers WHERE id=? AND user_id=?', +a.id, me.id); return OPS['sticker.list'](me); },
  'sticker.list'(me) { return { stickers: q('SELECT s.id, s.pack, s.file_id file, f.mime FROM stickers s JOIN files f ON f.id=s.file_id WHERE s.user_id=? ORDER BY s.id', me.id) }; },
  // calls
  'call.start'(me, a) {
    need(me, 'calls');
    const c = needConvo(me, a.cid);
    const existing = [...calls.values()].find(x => x.cid === c.id);
    if (existing) return OPS['call.join'](me, { id: existing.id });
    if (limited(attempts, 'call' + me.id, 10, 60e3)) throw new Error('Too many calls');
    const r = run('INSERT INTO calls(convo_id,started_by,video,started) VALUES(?,?,?,?)', c.id, me.id, a.video ? 1 : 0, Date.now());
    const call = { id: Number(r.lastInsertRowid), cid: c.id, by: me.id, video: !!a.video, people: new Set([me.id]), ringing: new Set(memberIds(c.id).filter(x => x !== me.id && !blocked(me.id, x))), started: Date.now() };
    run('INSERT INTO call_people(call_id,user_id,joined) VALUES(?,?,?)', call.id, me.id, Date.now());
    calls.set(call.id, call);
    call.timer = setTimeout(() => { if (call.people.size <= 1) endCall(call, 'no answer'); else { call.ringing.clear(); emitConvo(call.cid, { t: 'call.state', call: callOut(call) }); } }, 45e3);
    for (const uid of call.ringing) emit(uid, { t: 'call.ring', call: callOut(call), from: publicUser(me), convo: convoOut(c, uid) });
    emitConvo(c.id, { t: 'call.state', call: callOut(call) });
    return { call: callOut(call) };
  },
  'call.join'(me, a) {
    need(me, 'calls');
    const call = calls.get(+a.id); if (!call || !isMember(call.cid, me.id)) throw new Error('That call has ended');
    if (call.people.size >= 8 && !call.people.has(me.id)) throw new Error('This call is full (8 people)');
    call.people.add(me.id); call.ringing.delete(me.id);
    run('INSERT OR REPLACE INTO call_people(call_id,user_id,joined) VALUES(?,?,?)', call.id, me.id, Date.now());
    run('UPDATE calls SET answered=COALESCE(answered,?) WHERE id=?', Date.now(), call.id);
    emitConvo(call.cid, { t: 'call.state', call: callOut(call), joined: me.id });
    return { call: callOut(call) };
  },
  'call.decline'(me, a) {
    const call = calls.get(+a.id); if (!call) return { ok: true };
    call.ringing.delete(me.id);
    emitConvo(call.cid, { t: 'call.state', call: callOut(call), declined: me.id });
    if (!call.ringing.size && call.people.size <= 1) endCall(call, 'declined');
    return { ok: true };
  },
  'call.leave'(me, a) {
    const call = calls.get(+a.id); if (!call) return { ok: true };
    call.people.delete(me.id); run('UPDATE call_people SET left=? WHERE call_id=? AND user_id=?', Date.now(), call.id, me.id);
    if (!call.people.size || (call.people.size === 1 && !call.ringing.size)) endCall(call, 'ended');
    else emitConvo(call.cid, { t: 'call.state', call: callOut(call), left: me.id });
    return { ok: true };
  },
  'call.signal'(me, a) {
    const call = calls.get(+a.id), to = +a.to;
    if (!call || !call.people.has(me.id) || !call.people.has(to)) return null;
    const d = a.data; if (!d || JSON.stringify(d).length > 64000) return null;
    emit(to, { t: 'call.signal', id: call.id, from: me.id, data: d });
    return null;
  },
  'call.media'(me, a) { const call = calls.get(+a.id); if (!call || !call.people.has(me.id)) return null; emitConvo(call.cid, { t: 'call.media', id: call.id, uid: me.id, mic: !!a.mic, cam: !!a.cam, screen: !!a.screen }, me.id); return null; },
  'call.history'(me) {
    return { calls: q(`SELECT c.*, cv.kind ckind, cv.name cname FROM calls c JOIN members m ON m.convo_id=c.convo_id AND m.user_id=? JOIN convos cv ON cv.id=c.convo_id ORDER BY c.id DESC LIMIT 100`, me.id)
      .map(c => ({ id: c.id, cid: c.convo_id, by: c.started_by, video: !!c.video, started: c.started, answered: c.answered, ended: c.ended, joined: !!q1('SELECT 1 FROM call_people WHERE call_id=? AND user_id=?', c.id, me.id) })) };
  },
  'activity.set'(me, a) { setActivity(me.id, a && a.game ? { game: String(a.game).slice(0, 40), gameName: String(a.gameName || '').slice(0, 60), room: a.room ? String(a.room).slice(0, 8) : null } : null); return null; },
};
/** Remove an account and everything that's only theirs. Direct chats with them go away; in groups their messages
    show as deleted and they leave the group. */
function deleteAccount(u) {
  for (const ws of sockets.get(u.id) || []) try { ws.close(4003, 'deleted'); } catch {}
  for (const c of calls.values()) if (c.people.has(u.id) || c.by === u.id) { try { OPS['call.leave'](u, { id: c.id }); } catch {} }
  const touched = new Set(), gone = [];
  db.exec('BEGIN');
  try {
    run('DELETE FROM os_profiles WHERE user_id=?', u.id);
    for (const { convo_id } of q('SELECT convo_id FROM members WHERE user_id=?', u.id)) {
      const c = q1('SELECT * FROM convos WHERE id=?', convo_id); if (!c) continue;
      if (c.kind === 'dm' || memberIds(c.id).length <= 1) {
        const others = memberIds(c.id).filter(x => x !== u.id);
        run('DELETE FROM reactions WHERE msg_id IN (SELECT id FROM messages WHERE convo_id=?)', c.id);
        run('DELETE FROM pins WHERE convo_id=?', c.id); run('DELETE FROM messages WHERE convo_id=?', c.id);
        run('DELETE FROM members WHERE convo_id=?', c.id); run('DELETE FROM file_access WHERE convo_id=?', c.id); run('DELETE FROM convos WHERE id=?', c.id);
        gone.push([c.id, others]);
      } else {
        run(`UPDATE messages SET deleted=1, body='', meta=NULL WHERE convo_id=? AND user_id=?`, c.id, u.id);
        run('DELETE FROM pins WHERE convo_id=? AND msg_id IN (SELECT id FROM messages WHERE user_id=?)', c.id, u.id);
        run('DELETE FROM members WHERE convo_id=? AND user_id=?', c.id, u.id);
        const left = memberIds(c.id);
        if (left.length && !q1(`SELECT 1 FROM members WHERE convo_id=? AND role='owner'`, c.id)) run(`UPDATE members SET role='owner' WHERE convo_id=? AND user_id=?`, c.id, left[0]);
        touched.add(c.id);
      }
    }
    run('DELETE FROM reactions WHERE user_id=?', u.id);
    run('DELETE FROM friends WHERE a=? OR b=?', u.id, u.id); run('DELETE FROM blocks WHERE user_id=? OR blocked=?', u.id, u.id);
    run('DELETE FROM sessions WHERE user_id=?', u.id); run('DELETE FROM stickers WHERE user_id=?', u.id);
    run('DELETE FROM reports WHERE user_id=? OR reporter=?', u.id, u.id); run('DELETE FROM user_ips WHERE user_id=?', u.id); run('DELETE FROM device_users WHERE user_id=?', u.id); run('DELETE FROM call_people WHERE user_id=?', u.id);
    // their uploads, unless a message elsewhere still shows them
    const files = q('SELECT id FROM files WHERE owner=?', u.id).map(f => f.id);
    for (const id of files) {
      const used = q(`SELECT 1 FROM messages WHERE deleted=0 AND meta LIKE ? LIMIT 1`, '%' + id + '%').length || q('SELECT 1 FROM users WHERE avatar LIKE ? AND id<>? LIMIT 1', '%' + id + '%', u.id).length;
      if (used) continue;
      run('DELETE FROM file_access WHERE file_id=?', id); run('DELETE FROM files WHERE id=?', id);
      try { fs.rmSync(path.join(FILES, id), { force: true }); } catch {}
    }
    run('DELETE FROM users WHERE id=?', u.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  sockets.delete(u.id); activity.delete(u.id);
  for (const [cid, others] of gone) for (const o of others) emit(o, { t: 'convo.gone', cid });
  for (const cid of touched) { addMessage(cid, null, 'system', `${u.display}’s account was deleted`); pushConvo(cid); }
  for (const id of q('SELECT id FROM users').map(r => r.id)) if (sockets.has(id)) emit(id, { t: 'friends', friends: friendList(id) });
  for (const fn of userDeleteHooks) try { fn(u.id); } catch (e) { log('delete hook:', e.message); }
  log(`deleted account @${u.username} (#${u.id})`);
}
function needConvo(me, cid) { const c = q1('SELECT * FROM convos WHERE id=?', +cid); if (!c || !isMember(c.id, me.id)) throw new Error('Conversation not found'); return c; }
function needAdmin(me) { if (!isAdmin(me)) throw new Error('Admins only'); }
function ownFileUrl(me, fid, kind) { const f = q1('SELECT * FROM files WHERE id=? AND owner=?', String(fid), me.id); if (!f || !/^image\//.test(f.mime)) throw new Error('Upload a picture first'); run('UPDATE files SET kind=? WHERE id=?', kind, f.id); return `/social/file/${f.id}`; }
function fileForConvo(me, fid, cid, stickerOk) {
  const f = q1('SELECT * FROM files WHERE id=?', String(fid));
  if (!f || !(f.owner === me.id || (stickerOk && f.kind === 'sticker') || canSeeFile(me, f))) throw new Error('File not found');
  run('INSERT OR IGNORE INTO file_access VALUES(?,?)', f.id, cid);
  return { id: f.id, name: f.name, mime: f.mime, size: f.size, url: `/social/file/${f.id}` };
}
function pushConvo(cid) { const c = q1('SELECT * FROM convos WHERE id=?', cid); for (const uid of memberIds(cid)) emit(uid, { t: 'convo', convo: convoOut(c, uid) }); }

export function socialUpgrade(req, socket, head) {
  const me = userFromReq(req);
  if (!me) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    const first = !sockets.has(me.id);
    if (first) sockets.set(me.id, new Set());
    sockets.get(me.id).add(ws); ws.ip = clientIp(req); ws.dev = deviceOf(req);
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    if (first) { run('UPDATE users SET last_seen=? WHERE id=?', Date.now(), me.id); presence(me.id);
      // everything that arrived while offline counts as delivered now
      for (const m of q('SELECT convo_id, (SELECT MAX(id) FROM messages WHERE convo_id=members.convo_id) mx FROM members WHERE user_id=?', me.id)) if (m.mx) { run('UPDATE members SET last_delivered=MAX(last_delivered,?) WHERE convo_id=? AND user_id=?', m.mx, m.convo_id, me.id); emitReceipts(m.convo_id, me.id); }
    }
    ws.on('message', raw => {
      let a; try { a = JSON.parse(raw); } catch { return; }
      const op = OPS[a.op];
      const user = userById(me.id);
      if (!user || user.banned) { ws.close(4003, 'signed out'); return; }
      if (limited(attempts, 'ws' + me.id, 400, 10e3)) { if (a.rq) ws.send(JSON.stringify({ re: a.rq, error: 'Too many requests' })); return; }
      if (!op) { if (a.rq) ws.send(JSON.stringify({ re: a.rq, error: 'Unknown request' })); return; }
      try { const r = op(user, a); if (a.rq) ws.send(JSON.stringify({ re: a.rq, ...(r || { ok: true }) })); }
      catch (e) { if (a.rq) ws.send(JSON.stringify({ re: a.rq, error: e.message })); }
    });
    ws.on('close', () => {
      const set = sockets.get(me.id); if (!set) return; set.delete(ws);
      if (!set.size) {
        sockets.delete(me.id); run('UPDATE users SET last_seen=? WHERE id=?', Date.now(), me.id);
        // leaving every call they were in after a short grace (a reload reconnects within it)
        setTimeout(() => { if (sockets.has(me.id)) return; for (const c of calls.values()) if (c.people.has(me.id)) OPS['call.leave'](me, { id: c.id }); activity.delete(me.id); presence(me.id); }, 8000);
        presence(me.id);
      }
    });
  });
}
setInterval(() => { for (const set of sockets.values()) for (const ws of set) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 30e3).unref();
export const socialDb = () => db;
export { publicUser, userById, emit, convoOut, addMessage, dmFor };
