// SanjivramOS multiplayer: game rooms on this server (WebSocket /play), room codes, and LAN discovery.
// How it works: every player on the same Wi-Fi/LAN opens SanjivramOS from the same server, so this server is the
// rendezvous point. Rooms are host-authoritative: the host's game runs the simulation; the server relays inputs to the
// host and the host's state to everyone, checks who may send what, and enforces sizes and rates.
// LAN discovery between *different* SanjivramOS servers: each one broadcasts a small UDP beacon (port 41999) with its
// address and public rooms; others list them. Browsers can't do mDNS/UDP themselves, so the server does it for them.
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { userFromReq, publicUser, setActivity, userById } from './social.js';

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const rooms = new Map();        // code -> room
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const GRACE = 20e3;             // a dropped player keeps their slot this long
const BEACON_PORT = 41999;
const peers = new Map();        // "ip:port" -> {name, addr, port, rooms, seen}
let PORT = 8080, SERVER_NAME = os.hostname();

function newCode() { for (;;) { let c = ''; for (const b of crypto.randomBytes(5)) c += CODE_CHARS[b % CODE_CHARS.length]; if (!rooms.has(c)) return c; } }
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 16).toString('hex');
function summary(r) {
  const host = r.members.get(r.host);
  return { code: r.code, name: r.name, game: r.game, gameName: r.gameName, map: r.map, mode: r.mode, players: [...r.members.values()].filter(m => !m.spectator).length, spectators: [...r.members.values()].filter(m => m.spectator).length,
    max: r.max, status: r.status, private: r.private, locked: !!r.pwHash, host: host ? host.user.display : '', hostUser: host ? host.user.username : '', created: r.created, server: SERVER_NAME };
}
function roomState(r) {
  return { ...summary(r), hostId: r.host, teams: r.teams, settings: r.settings,
    members: [...r.members.values()].map(m => ({ ...publicUser(userById(m.user.id) || m.user), ready: m.ready, team: m.team, spectator: m.spectator, connected: !!m.ws, ping: m.ping, joined: m.joined })), chat: r.chat.slice(-50) };
}
function sendWs(ws, msg) { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(r, msg, except) { const s = JSON.stringify(msg); for (const m of r.members.values()) if (m.user.id !== except) sendWs(m.ws, s); }
const pushState = r => broadcast(r, { t: 'room', room: roomState(r) });
function pickHost(r) {
  const cand = [...r.members.values()].filter(m => m.ws && !m.spectator).sort((a, b) => a.joined - b.joined)[0] || [...r.members.values()].filter(m => m.ws)[0];
  if (!cand) { if (r.members.size) { pushState(r); return; } closeRoom(r, 'empty'); return; }
  r.host = cand.user.id;
  broadcast(r, { t: 'host', host: r.host, name: cand.user.display });
  r.chat.push({ sys: true, text: `${cand.user.display} is now the host`, at: Date.now() });
  pushState(r);
}
function removeMember(r, uid, why) {
  const m = r.members.get(uid); if (!m) return;
  clearTimeout(m.dropT); r.members.delete(uid); setActivity(uid, null);
  if (m.ws) { m.ws.room = null; sendWs(m.ws, { t: 'left', why }); }
  r.chat.push({ sys: true, text: `${m.user.display} ${why === 'kicked' ? 'was removed' : 'left'}`, at: Date.now() });
  if (!r.members.size) { closeRoom(r, 'empty'); return; }
  broadcast(r, { t: 'peer-left', uid, why });
  if (r.host === uid) pickHost(r); else pushState(r);
}
function closeRoom(r, why) { for (const m of r.members.values()) { clearTimeout(m.dropT); if (m.ws) { m.ws.room = null; sendWs(m.ws, { t: 'closed', why }); } setActivity(m.user.id, null); } rooms.delete(r.code); }
function clamp(s, n) { return String(s == null ? '' : s).slice(0, n); }

const RATE = new Map();
function rate(uid, n, ms) { const now = Date.now(), a = (RATE.get(uid) || []).filter(t => now - t < ms); a.push(now); RATE.set(uid, a); return a.length > n; }

function handle(ws, me, a) {
  const reply = (obj) => { if (a.rq) sendWs(ws, { re: a.rq, ...obj }); };
  const r = ws.room && rooms.get(ws.room);
  switch (a.op) {
    case 'ping': return sendWs(ws, { t: 'pong', ts: a.ts });
    case 'rooms': return reply({ rooms: [...rooms.values()].filter(x => !x.private).map(summary), lan: [...peers.values()].filter(p => Date.now() - p.seen < 15e3).map(p => ({ name: p.name, addr: p.addr, port: p.port, url: `http://${p.addr.includes(':') ? '[' + p.addr + ']' : p.addr}:${p.port}/`, rooms: p.rooms })), server: SERVER_NAME });
    case 'create': {
      if (rate('c' + me.id, 10, 60e3)) return reply({ error: 'Too many rooms created. Wait a minute.' });
      if (r) removeMember(r, me.id, 'left');
      const code = newCode(), salt = crypto.randomBytes(8).toString('hex');
      const room = { code, name: clamp(a.name, 40) || `${me.display}'s room`, game: clamp(a.game, 32), gameName: clamp(a.gameName, 40), map: clamp(a.map, 40), mode: clamp(a.mode, 40),
        max: Math.max(2, Math.min(16, +a.max || 4)), private: !!a.private, salt, pwHash: a.password ? hashPw(a.password, salt) : null, teams: Array.isArray(a.teams) ? a.teams.slice(0, 4).map(t => clamp(t, 16)) : null,
        settings: a.settings && typeof a.settings === 'object' ? JSON.parse(JSON.stringify(a.settings).slice(0, 4000)) : {}, status: 'lobby', host: me.id, members: new Map(), chat: [], created: Date.now() };
      rooms.set(code, room);
      join(ws, me, room, false);
      return reply({ room: roomState(room) });
    }
    case 'join': {
      const code = clamp(a.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const room = rooms.get(code);
      if (!room) return reply({ error: 'No room with that code on this server. Check the code, or that you’re on the same network as the host.' });
      if (room.game && a.game && room.game !== a.game) return reply({ error: `That room is for ${room.gameName || room.game}.`, game: room.game });
      const back = room.members.get(me.id);
      if (!back) {
        if (room.pwHash && (!a.password || hashPw(a.password, room.salt) !== room.pwHash)) { if (rate('pw' + me.id, 8, 60e3)) return reply({ error: 'Too many wrong passwords' }); return reply({ error: a.password ? 'Wrong room password.' : 'This room needs a password.', needPassword: true }); }
        const spectating = !!a.spectate || [...room.members.values()].filter(m => !m.spectator).length >= room.max;
        if (spectating && !a.spectate && room.status === 'lobby') return reply({ error: 'That room is full.', full: true });
        if (r && r !== room) removeMember(r, me.id, 'left');
        join(ws, me, room, spectating);
      } else join(ws, me, room, back.spectator);
      return reply({ room: roomState(room) });
    }
    case 'leave': if (r) removeMember(r, me.id, 'left'); return reply({ ok: true });
  }
  if (!r) return reply({ error: 'You’re not in a room' });
  const mine = r.members.get(me.id), isHost = r.host === me.id;
  switch (a.op) {
    case 'ready': mine.ready = !!a.on; pushState(r); return reply({ ok: true });
    case 'team': if (!r.teams) return reply({ error: 'No teams in this game' }); mine.team = Math.max(0, Math.min(r.teams.length - 1, +a.team || 0)); pushState(r); return reply({ ok: true });
    case 'spectate': mine.spectator = !!a.on; if (!a.on && [...r.members.values()].filter(m => !m.spectator).length > r.max) { mine.spectator = true; return reply({ error: 'No free player slots' }); } pushState(r); return reply({ ok: true });
    case 'chat': {
      if (rate('ch' + me.id, 8, 5e3)) return reply({ error: 'Slow down' });
      const text = clamp(a.text, 300).trim(); if (!text) return reply({ ok: true });
      const line = { uid: me.id, name: me.display, text, at: Date.now() }; r.chat.push(line); if (r.chat.length > 100) r.chat.shift();
      broadcast(r, { t: 'chat', line }); return reply({ ok: true });
    }
    case 'update': {
      if (!isHost) return reply({ error: 'Only the host can change the room' });
      for (const k of ['map', 'mode', 'name']) if (a[k] !== undefined) r[k] = clamp(a[k], 40);
      if (a.max !== undefined) r.max = Math.max(2, Math.min(16, +a.max || r.max));
      if (a.private !== undefined) r.private = !!a.private;
      if (a.password !== undefined) r.pwHash = a.password ? hashPw(a.password, r.salt) : null;
      if (a.settings && typeof a.settings === 'object') r.settings = JSON.parse(JSON.stringify(a.settings).slice(0, 4000));
      if (a.status && ['lobby', 'playing', 'ended'].includes(a.status)) { r.status = a.status; if (a.status === 'lobby') for (const m of r.members.values()) m.ready = false; }
      if (a.teams !== undefined) for (const [uid, team] of Object.entries(a.teams || {})) { const m = r.members.get(+uid); if (m) m.team = +team; }
      pushState(r); return reply({ ok: true });
    }
    case 'kick': { if (!isHost) return reply({ error: 'Only the host can remove players' }); if (+a.uid === me.id) return reply({ error: 'You can’t kick yourself' }); removeMember(r, +a.uid, 'kicked'); return reply({ ok: true }); }
    case 'transfer': { if (!isHost) return reply({ error: 'Only the host can do that' }); const m = r.members.get(+a.uid); if (!m || !m.ws) return reply({ error: 'They’re not connected' }); r.host = m.user.id; broadcast(r, { t: 'host', host: r.host, name: m.user.display }); pushState(r); return reply({ ok: true }); }
    case 'start': {
      if (!isHost) return reply({ error: 'Only the host can start' });
      r.status = 'playing'; r.seed = crypto.randomInt(1, 2 ** 31);
      broadcast(r, { t: 'start', seed: r.seed, room: roomState(r) }); return reply({ ok: true });
    }
    case 'm': {
      // game traffic: clients → host (default) or host → everyone / one player. Spectators only receive.
      if (rate('m' + me.id, 120, 1e3)) return;
      if (mine.spectator && !isHost) return;
      const d = a.d, s = JSON.stringify({ t: 'm', from: me.id, d });
      if (s.length > 32000) return;
      if (isHost) {
        if (a.to === undefined || a.to === 'all') { for (const m of r.members.values()) if (m.user.id !== me.id) sendWs(m.ws, s); }
        else { const m = r.members.get(+a.to); if (m) sendWs(m.ws, s); }
      } else {
        // non-hosts may only talk to the host (or, for peer-style games that allow it, to everyone)
        if (a.to === 'all' && r.settings && r.settings.p2p) { for (const m of r.members.values()) if (m.user.id !== me.id) sendWs(m.ws, s); }
        else sendWs(r.members.get(r.host) && r.members.get(r.host).ws, s);
      }
      return;
    }
    case 'stats': { if (!isHost) return; broadcast(r, { t: 'stats', d: a.d }); return reply({ ok: true }); }
  }
  reply({ error: 'Unknown request' });
}
function join(ws, me, room, spectator) {
  let m = room.members.get(me.id);
  if (m) { if (m.ws && m.ws !== ws) { m.ws.room = null; sendWs(m.ws, { t: 'left', why: 'joined elsewhere' }); } clearTimeout(m.dropT); m.ws = ws; m.user = me; broadcast(room, { t: 'peer-back', uid: me.id }, me.id); }
  else {
    const counts = room.teams ? room.teams.map((_, i) => [...room.members.values()].filter(x => x.team === i && !x.spectator).length) : [];
    m = { user: me, ws, ready: false, spectator, team: room.teams ? counts.indexOf(Math.min(...counts)) : 0, joined: Date.now(), ping: 0 };
    room.members.set(me.id, m);
    room.chat.push({ sys: true, text: `${me.display} joined${spectator ? ' as a spectator' : ''}`, at: Date.now() });
    broadcast(room, { t: 'peer-joined', user: publicUser(me) }, me.id);
  }
  ws.room = room.code;
  { const h = room.members.get(room.host); if (!h || (!h.ws && !(room.settings && room.settings.hostGrace))) { room.host = me.id; broadcast(room, { t: 'host', host: me.id, name: me.display }); } }
  setActivity(me.id, { game: room.game, gameName: room.gameName, room: room.private ? null : room.code });
  pushState(room);
  if (room.status === 'playing') sendWs(ws, { t: 'start', seed: room.seed, room: roomState(room), late: true });
}

export function playUpgrade(req, socket, head) {
  const me = userFromReq(req);
  if (!me) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    ws.on('message', raw => { let a; try { a = JSON.parse(raw); } catch { return; } try { handle(ws, me, a); } catch (e) { if (a && a.rq) sendWs(ws, { re: a.rq, error: e.message }); } });
    ws.on('close', () => {
      const r = ws.room && rooms.get(ws.room); if (!r) return;
      const m = r.members.get(me.id); if (!m || m.ws !== ws) return;
      m.ws = null; broadcast(r, { t: 'peer-drop', uid: me.id });
      // Rooms can ask to keep the host's seat while they reload (versus races reload every page at the start).
      if (r.host === me.id && !(r.settings && r.settings.hostGrace)) pickHost(r); else pushState(r);
      m.dropT = setTimeout(() => removeMember(r, me.id, 'disconnected'), GRACE);
    });
    sendWs(ws, { t: 'hello', me: publicUser(me), server: SERVER_NAME });
  });
}
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 20e3).unref();
// rooms nobody has touched for 6 hours are closed
setInterval(() => { for (const r of rooms.values()) if (![...r.members.values()].some(m => m.ws) && Date.now() - r.created > 6 * 3600e3) closeRoom(r, 'idle'); }, 600e3).unref();

/** GET /play/rooms — the public list (for the Games hub without opening a socket). */
export function playApi(req, res, url) {
  if (url.pathname !== '/play/rooms') return false;
  const me = userFromReq(req);
  res.writeHead(me ? 200 : 401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(me ? { rooms: [...rooms.values()].filter(x => !x.private).map(summary), lan: [...peers.values()].filter(p => Date.now() - p.seen < 15e3).map(p => ({ name: p.name, url: `http://${p.addr}:${p.port}/`, rooms: p.rooms })), server: SERVER_NAME } : { error: 'Not signed in' }));
  return true;
}

/* ---------------- LAN beacon ---------------- */
function lanAddrs() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i); return out; }
function broadcastAddr(i) { const a = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number); return a.map((x, k) => (x & m[k]) | (~m[k] & 255)).join('.'); }
export function startLan(port, opts = {}) {
  PORT = port; SERVER_NAME = (process.env.SJ_SERVER_NAME || os.hostname() || 'SanjivramOS').slice(0, 40);
  if (process.env.SJ_LAN_DISCOVERY === '0') return;
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const id = crypto.randomBytes(6).toString('hex');
  sock.on('error', e => { console.log('[play] LAN discovery off:', e.message); try { sock.close(); } catch {} });
  sock.on('message', (buf, rinfo) => {
    try {
      const j = JSON.parse(buf.toString()); if (j.sjos !== 1 || j.id === id) return;
      peers.set(rinfo.address + ':' + j.port, { name: String(j.name).slice(0, 40), addr: rinfo.address, port: +j.port, rooms: (j.rooms || []).slice(0, 20), seen: Date.now() });
    } catch {}
  });
  sock.bind(BEACON_PORT, () => {
    try { sock.setBroadcast(true); } catch {}
    const beat = () => {
      const pub = [...rooms.values()].filter(r => !r.private).slice(0, 20).map(r => { const s = summary(r); return { code: s.code, name: s.name, game: s.gameName || s.game, players: s.players, max: s.max, locked: s.locked, status: s.status }; });
      const msg = Buffer.from(JSON.stringify({ sjos: 1, id, name: SERVER_NAME, port: PORT, rooms: pub }));
      for (const i of lanAddrs()) sock.send(msg, BEACON_PORT, broadcastAddr(i), () => {});
    };
    beat(); setInterval(beat, 5000).unref();
    console.log(`[play] LAN discovery on (UDP ${BEACON_PORT}) as "${SERVER_NAME}"`);
  });
}
export const playRooms = () => rooms;
