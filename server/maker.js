// Game Maker sharing: people publish no-code games made in games/sj-maker, everyone on this server can browse,
// play, like, remix them and post leaderboard times. Accounts = the social (Messages) accounts, same cookie.
// Storage: <DATA>/.maker/maker.db (node:sqlite). Routes: /maker/api/*  (JSON, same-origin writes only).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { userFromReq, onUserDeleted } from './social.js';

let db = null;
const MIGRATIONS = [
  `CREATE TABLE games(id TEXT PRIMARY KEY, owner INTEGER NOT NULL, owner_name TEXT, title TEXT NOT NULL, descr TEXT, template TEXT,
     data TEXT NOT NULL, thumb TEXT, created INTEGER, updated INTEGER, plays INTEGER DEFAULT 0, likes INTEGER DEFAULT 0,
     remix_of TEXT, levels INTEGER DEFAULT 1, hidden INTEGER DEFAULT 0);
   CREATE INDEX games_updated ON games(updated); CREATE INDEX games_owner ON games(owner);
   CREATE TABLE likes(game TEXT, user INTEGER, PRIMARY KEY(game, user));
   CREATE TABLE scores(game TEXT, user INTEGER, name TEXT, ms INTEGER, coins INTEGER, at INTEGER, PRIMARY KEY(game, user));
   CREATE TABLE plays(game TEXT, who TEXT, at INTEGER, PRIMARY KEY(game, who));`,
];
export function initMaker(dataDir) {
  const dir = path.join(dataDir, '.maker');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(path.join(dir, 'maker.db'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);');
  const ver = +((db.prepare(`SELECT v FROM meta WHERE k='version'`).get() || {}).v || 0);
  for (let i = ver; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN'); db.exec(MIGRATIONS[i]); db.prepare(`INSERT OR REPLACE INTO meta(k,v) VALUES('version',?)`).run(String(i + 1)); db.exec('COMMIT');
  }
  // a deleted Messages account takes its published games, likes and scores with it
  onUserDeleted(uid => { const games = q('SELECT id FROM games WHERE owner=?', uid).map(g => g.id); for (const g of games) { run('DELETE FROM likes WHERE game=?', g); run('DELETE FROM scores WHERE game=?', g); run('DELETE FROM plays WHERE game=?', g); } run('DELETE FROM games WHERE owner=?', uid); run('DELETE FROM likes WHERE user=?', uid); run('DELETE FROM scores WHERE user=?', uid); });
}
const q = (s, ...a) => db.prepare(s).all(...a), q1 = (s, ...a) => db.prepare(s).get(...a), run = (s, ...a) => db.prepare(s).run(...a);
function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function sameOrigin(req) { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } }
async function body(req, max) {
  let size = 0; const parts = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('That game is too big to publish (limit 600 KB).'), { code: 413 }); parts.push(c); }
  return JSON.parse(Buffer.concat(parts).toString() || '{}');
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const summary = (g, me) => ({ id: g.id, title: g.title, desc: g.descr, template: g.template, author: g.owner_name, mine: !!(me && me.id === g.owner),
  plays: g.plays, likes: g.likes, levels: g.levels, created: g.created, updated: g.updated, thumb: g.thumb || null, remixOf: g.remix_of || null,
  liked: !!(me && q1('SELECT 1 x FROM likes WHERE game=? AND user=?', g.id, me.id)) });
const posts = new Map();
const tooMany = (key, max, ms) => { const now = Date.now(), a = (posts.get(key) || []).filter(t => now - t < ms); a.push(now); posts.set(key, a); return a.length > max; };

// Validate the game file just enough that nobody can store something that isn't a maker game.
function checkData(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.levels) || !d.levels.length || d.levels.length > 30) throw new Error('A game needs 1–30 levels.');
  for (const L of d.levels) {
    if (!L || typeof L.tiles !== 'string' || !(L.w >= 8 && L.w <= 200) || !(L.h >= 6 && L.h <= 60) || L.tiles.length !== L.w * L.h) throw new Error('A level is damaged.');
    if (!L.tiles.includes('P')) throw new Error('Every level needs a player start.');
  }
  if (!['platformer', 'topdown', '3d'].includes(d.template)) throw new Error('Unknown game type.');
}

export async function makerApi(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/maker/api/')) return false;
  if (!db) { send(res, 503, { error: 'Game sharing is not running on this server.' }); return true; }
  try {
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Cross-site request refused' }), true;
    const me = userFromReq(req);
    const ip = req.socket.remoteAddress || '';
    if (p === '/maker/api/me') return send(res, 200, { me: me ? { id: me.id, username: me.username, display: me.display, admin: me.role === 'admin' || me.role === 'owner' } : null }), true;
    if (p === '/maker/api/list' && req.method === 'GET') {
      const sort = { top: 'likes DESC, plays DESC', plays: 'plays DESC', new: 'updated DESC' }[url.searchParams.get('sort')] || 'updated DESC';
      const term = clean(url.searchParams.get('q'), 60), mine = url.searchParams.get('mine') === '1';
      let rows;
      if (mine) rows = me ? q(`SELECT * FROM games WHERE owner=? ORDER BY updated DESC LIMIT 200`, me.id) : [];
      else if (term) rows = q(`SELECT * FROM games WHERE hidden=0 AND (title LIKE ? OR descr LIKE ? OR owner_name LIKE ?) ORDER BY ${sort} LIMIT 120`, `%${term}%`, `%${term}%`, `%${term}%`);
      else rows = q(`SELECT * FROM games WHERE hidden=0 ORDER BY ${sort} LIMIT 120`);
      return send(res, 200, { games: rows.map(g => summary(g, me)) }), true;
    }
    let m = /^\/maker\/api\/game\/([a-z0-9]{8})$/.exec(p);
    if (m && req.method === 'GET') {
      const g = q1('SELECT * FROM games WHERE id=?', m[1]);
      if (!g || (g.hidden && !(me && (me.id === g.owner || (me.role === 'admin' || me.role === 'owner'))))) return send(res, 404, { error: 'Game not found' }), true;
      const scores = q('SELECT name, ms, coins, at FROM scores WHERE game=? ORDER BY ms ASC LIMIT 20', g.id);
      return send(res, 200, { game: { ...summary(g, me), data: JSON.parse(g.data) }, scores }), true;
    }
    if (m && req.method === 'DELETE') {
      if (!me) return send(res, 401, { error: 'Sign in first' }), true;
      const g = q1('SELECT * FROM games WHERE id=?', m[1]);
      if (!g) return send(res, 404, { error: 'Game not found' }), true;
      if (g.owner !== me.id && me.role !== 'admin' && me.role !== 'owner') return send(res, 403, { error: 'Only the maker can delete this game' }), true;
      run('DELETE FROM games WHERE id=?', g.id); run('DELETE FROM likes WHERE game=?', g.id); run('DELETE FROM scores WHERE game=?', g.id); run('DELETE FROM plays WHERE game=?', g.id);
      return send(res, 200, { ok: true }), true;
    }
    if (p === '/maker/api/publish' && req.method === 'POST') {
      if (!me) return send(res, 401, { error: 'Sign in to publish' }), true;
      if (tooMany('pub' + me.id, 30, 3600e3)) return send(res, 429, { error: 'Slow down — too many publishes this hour.' }), true;
      const b = await body(req, 600 * 1024);
      checkData(b.data);
      const title = clean(b.title || b.data.title, 60) || 'Untitled game', descr = clean(b.desc, 300);
      const thumb = typeof b.thumb === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.thumb) && b.thumb.length < 120000 ? b.thumb : null;
      const data = JSON.stringify(b.data);
      let id = typeof b.id === 'string' && /^[a-z0-9]{8}$/.test(b.id) ? b.id : null;
      const old = id && q1('SELECT * FROM games WHERE id=?', id);
      if (old && old.owner !== me.id) id = null; // someone else's game → publish as a new remix
      if (old && old.owner === me.id) {
        run('UPDATE games SET title=?, descr=?, template=?, data=?, thumb=?, updated=?, levels=?, owner_name=? WHERE id=?', title, descr, b.data.template, data, thumb, Date.now(), b.data.levels.length, me.display || me.username, id);
      } else {
        id = crypto.randomBytes(6).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(8, '0').slice(0, 8);
        while (q1('SELECT 1 x FROM games WHERE id=?', id)) id = crypto.randomBytes(8).toString('hex').slice(0, 8);
        const remix = typeof b.remixOf === 'string' && /^[a-z0-9]{8}$/.test(b.remixOf) ? b.remixOf : null;
        run('INSERT INTO games(id, owner, owner_name, title, descr, template, data, thumb, created, updated, remix_of, levels) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          id, me.id, me.display || me.username, title, descr, b.data.template, data, thumb, Date.now(), Date.now(), remix, b.data.levels.length);
      }
      return send(res, 200, { id }), true;
    }
    m = /^\/maker\/api\/(like|play|score|hide)\/([a-z0-9]{8})$/.exec(p);
    if (m && req.method === 'POST') {
      const g = q1('SELECT * FROM games WHERE id=?', m[2]);
      if (!g) return send(res, 404, { error: 'Game not found' }), true;
      if (m[1] === 'play') { // one play per person (or device address) per game per hour
        const who = me ? 'u' + me.id : 'ip' + ip, prev = q1('SELECT at FROM plays WHERE game=? AND who=?', g.id, who);
        if (!prev || Date.now() - prev.at > 3600e3) { run('INSERT OR REPLACE INTO plays(game, who, at) VALUES(?,?,?)', g.id, who, Date.now()); run('UPDATE games SET plays=plays+1 WHERE id=?', g.id); }
        return send(res, 200, { plays: q1('SELECT plays FROM games WHERE id=?', g.id).plays }), true;
      }
      if (!me) return send(res, 401, { error: 'Sign in first' }), true;
      if (m[1] === 'like') {
        const had = q1('SELECT 1 x FROM likes WHERE game=? AND user=?', g.id, me.id);
        if (had) run('DELETE FROM likes WHERE game=? AND user=?', g.id, me.id); else run('INSERT INTO likes(game, user) VALUES(?,?)', g.id, me.id);
        const n = q1('SELECT COUNT(*) n FROM likes WHERE game=?', g.id).n; run('UPDATE games SET likes=? WHERE id=?', n, g.id);
        return send(res, 200, { liked: !had, likes: n }), true;
      }
      if (m[1] === 'hide') {
        if (g.owner !== me.id && me.role !== 'admin' && me.role !== 'owner') return send(res, 403, { error: 'Not allowed' }), true;
        run('UPDATE games SET hidden=1-hidden WHERE id=?', g.id); return send(res, 200, { hidden: !g.hidden }), true;
      }
      if (m[1] === 'score') {
        if (tooMany('sc' + me.id, 60, 600e3)) return send(res, 429, { error: 'Too many scores' }), true;
        const b = await body(req, 2048), ms = Math.round(+b.ms), coins = Math.max(0, Math.min(99999, Math.round(+b.coins || 0)));
        if (!(ms >= 500 && ms < 6 * 3600e3)) return send(res, 400, { error: 'Bad time' }), true;
        const prev = q1('SELECT ms FROM scores WHERE game=? AND user=?', g.id, me.id);
        if (!prev || ms < prev.ms) run('INSERT OR REPLACE INTO scores(game, user, name, ms, coins, at) VALUES(?,?,?,?,?,?)', g.id, me.id, me.display || me.username, ms, coins, Date.now());
        const rank = q1('SELECT COUNT(*) n FROM scores WHERE game=? AND ms<?', g.id, Math.min(ms, prev ? prev.ms : ms)).n + 1;
        return send(res, 200, { best: !prev || ms < prev.ms, rank, scores: q('SELECT name, ms, coins, at FROM scores WHERE game=? ORDER BY ms ASC LIMIT 20', g.id) }), true;
      }
    }
    send(res, 404, { error: 'Unknown request' });
  } catch (e) { send(res, e.code === 413 ? 413 : 400, { error: e.message || 'Bad request' }); }
  return true;
}
