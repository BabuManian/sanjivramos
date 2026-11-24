/* SanjivramOS multiplayer kit for the sj- games (talks to the server's /play WebSocket).
   const net = await SJNet.lobby({ game:'chess', gameName:'Chess', max:2, min:2, maps:['Classic'], modes:['Blitz 5+0'], teams:['White','Black'] });
   net.isHost, net.me, net.room, net.seed
   net.send(data[, toUserId|'all'])   — clients → host (default); host → everyone (default) or one player
   net.on('m', (data, fromUserId) => …)  · 'host' · 'peer-left' · 'peer-joined' · 'peer-drop' · 'peer-back' · 'room' · 'start' · 'closed' · 'chat'
   net.rematch() (host) · net.leave() · net.ping (ms) · net.say(text)
   Sign-in uses the same SanjivramOS account as Messages (cookie session) — no separate login. */
(() => {
  'use strict';
  if (window.SJNet) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `
.sjn{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(6,9,18,.72);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8ecf4;animation:sjnf .18s ease-out}
@keyframes sjnf{from{opacity:0}}
@keyframes sjnp{from{opacity:0;transform:translateY(10px) scale(.98)}}
.sjn-card{width:min(720px,calc(100% - 24px));max-height:calc(100% - 24px);display:flex;flex-direction:column;background:rgba(22,27,40,.86);border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;animation:sjnp .22s cubic-bezier(.2,.9,.3,1.2)}
.sjn-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
.sjn-head h2{margin:0;font-size:18px;flex:1;font-weight:650;letter-spacing:.2px}
.sjn-who{font-size:12px;opacity:.7}
.sjn-tabs{display:flex;gap:4px;padding:0 12px 10px;border-bottom:1px solid rgba(255,255,255,.06)}
.sjn button{font:inherit;border:none;cursor:pointer;color:inherit;background:none}
.sjn-tab{padding:7px 12px;border-radius:999px;opacity:.7;transition:background .15s,opacity .15s}
.sjn-tab:hover{opacity:1;background:rgba(255,255,255,.06)}
.sjn-tab.on{opacity:1;background:rgba(99,140,255,.22);color:#c9d7ff}
.sjn-body{padding:14px 16px;overflow:auto;flex:1;min-height:180px}
.sjn-btn{background:#3b6cff!important;color:#fff!important;padding:9px 16px;border-radius:10px;font-weight:600;transition:transform .12s,filter .12s}
.sjn-btn:hover{filter:brightness(1.1)}.sjn-btn:active{transform:scale(.97)}
.sjn-btn.sec{background:rgba(255,255,255,.08)!important;color:#e8ecf4!important}
.sjn-btn.ok{background:#16a34a!important}.sjn-btn.warn{background:#dc2626!important}
.sjn-btn:disabled{opacity:.45;cursor:default;transform:none}
.sjn input,.sjn select{font:inherit;color:inherit;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 11px;outline:none;min-width:0}
.sjn input:focus,.sjn select:focus{border-color:#5b84ff;box-shadow:0 0 0 3px rgba(91,132,255,.25)}
.sjn select option{background:#1b2133}
.sjn-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}
.sjn-row label{min-width:92px;opacity:.75}
.sjn-grow{flex:1}
.sjn-list{display:flex;flex-direction:column;gap:6px}
.sjn-room{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);text-align:left;width:100%;transition:background .15s}
.sjn-room:hover{background:rgba(255,255,255,.08)}
.sjn-room b{display:block}.sjn-room small{opacity:.65}
.sjn-pill{font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.08);white-space:nowrap}
.sjn-pill.live{background:rgba(22,163,74,.25);color:#86efac}.sjn-pill.lock{background:rgba(234,179,8,.2);color:#fde68a}
.sjn-empty{text-align:center;opacity:.6;padding:26px 8px}
.sjn-err{color:#fca5a5;min-height:18px;font-size:13px;margin-top:6px}
.sjn-code{font:700 30px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:6px;padding:8px 14px;border-radius:12px;background:rgba(91,132,255,.15);color:#c9d7ff;user-select:all}
.sjn-lobby{display:grid;grid-template-columns:1.1fr 1fr;gap:14px}
@media (max-width:620px){.sjn-lobby{grid-template-columns:1fr}}
.sjn-players{display:flex;flex-direction:column;gap:6px}
.sjn-p{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.04)}
.sjn-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;background:#334155;flex:0 0 30px;overflow:hidden;font-size:13px}
.sjn-av img{width:100%;height:100%;object-fit:cover}
.sjn-p .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sjn-dot{width:8px;height:8px;border-radius:50%;background:#64748b}.sjn-dot.on{background:#22c55e}
.sjn-chat{display:flex;flex-direction:column;height:230px;border-radius:12px;background:rgba(0,0,0,.2);overflow:hidden}
.sjn-lines{flex:1;overflow:auto;padding:8px 10px;font-size:13px;display:flex;flex-direction:column;gap:3px}
.sjn-lines .sys{opacity:.55;font-style:italic}
.sjn-chat form{display:flex;gap:6px;padding:6px;border-top:1px solid rgba(255,255,255,.06)}
.sjn-chat input{flex:1}
.sjn-foot{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);flex-wrap:wrap}
.sjn-x{width:32px;height:32px;border-radius:50%;font-size:18px;opacity:.7}.sjn-x:hover{opacity:1;background:rgba(255,255,255,.08)}
.sjn-skel{height:52px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:sjns 1.2s infinite}
@keyframes sjns{to{background-position:-200% 0}}
.sjn-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100001;background:rgba(15,23,42,.92);color:#e2e8f0;padding:8px 14px;border-radius:999px;font:13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.4)}
@media (prefers-reduced-motion:reduce){.sjn,.sjn-card,.sjn-skel{animation:none}}
`;
  function css() { if (document.getElementById('sjn-css')) return; const s = document.createElement('style'); s.id = 'sjn-css'; s.textContent = CSS; document.head.appendChild(s); }
  const avatar = u => `<span class="sjn-av">${u && u.look && window.SJLook ? `<img src="${SJLook.face(u.look, 64)}" alt="">` : u && u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(((u && (u.display || u.username)) || '?').charAt(0).toUpperCase())}</span>`;
  // the shared character (look.js) loads next to this file
  const base = (document.currentScript && document.currentScript.src || '').replace(/net\.js.*$/, '') || '../sj-gamekit/';
  const lookReady = window.SJLook ? Promise.resolve() : new Promise(res => { const sc = document.createElement('script'); sc.src = base + 'look.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
  function toast(t) { const d = document.createElement('div'); d.className = 'sjn-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

  /* ---------- connection ---------- */
  class Conn {
    constructor() { this.n = 0; this.pend = new Map(); this.h = {}; this.ping = 0; this.closedByUs = false; this.code = null; }
    on(t, f) { (this.h[t] = this.h[t] || []).push(f); return this; }
    off(t, f) { this.h[t] = (this.h[t] || []).filter(x => x !== f); }
    emit(t, ...a) { for (const f of this.h[t] || []) try { f(...a); } catch (e) { console.error(e); } }
    open() {
      return new Promise((res, rej) => {
        const ws = this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/play');
        let opened = false;
        ws.onopen = () => { opened = true; res(this); this.pingT = setInterval(() => this.raw({ op: 'ping', ts: performance.now() }), 2000); };
        ws.onerror = () => { if (!opened) rej(new Error('Can’t reach the game server. Is SanjivramOS up to date (restart it)?')); };
        ws.onclose = () => { clearInterval(this.pingT); for (const r of this.pend.values()) r({ error: 'Connection lost' }); this.pend.clear(); if (opened && !this.closedByUs) this.reconnect(); };
        ws.onmessage = e => {
          let d; try { d = JSON.parse(e.data); } catch { return; }
          if (d.re && this.pend.has(d.re)) { this.pend.get(d.re)(d); this.pend.delete(d.re); return; }
          if (d.t === 'pong') { this.ping = Math.round(performance.now() - d.ts); this.emit('ping', this.ping); return; }
          if (d.t === 'hello') { this.me = d.me; this.server = d.server; }
          if (d.t === 'room') this.room = d.room;
          if (d.t === 'm') { this.emit('m', d.d, d.from); return; }
          this.emit(d.t, d);
        };
      });
    }
    async reconnect() {
      this.emit('reconnecting');
      for (let i = 0; i < 12 && !this.closedByUs; i++) {
        await new Promise(r => setTimeout(r, Math.min(4000, 400 * 2 ** i)));
        try { await this.open(); if (this.code) { const r = await this.req({ op: 'join', code: this.code }); if (r.error) { this.emit('closed', { why: r.error }); return; } } this.emit('reconnected'); return; } catch {}
      }
      this.emit('closed', { why: 'Lost connection to the server' });
    }
    raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    req(o) { return new Promise(r => { const rq = ++this.n; this.pend.set(rq, r); this.raw({ ...o, rq }); setTimeout(() => { if (this.pend.has(rq)) { this.pend.delete(rq); r({ error: 'The server didn’t answer' }); } }, 8000); }); }
    close() { this.closedByUs = true; clearInterval(this.pingT); try { this.ws.close(); } catch {} }
  }

  /* ---------- account (shared with Messages) ---------- */
  async function me() { try { const r = await fetch('/social/api/me', { credentials: 'same-origin' }); return r.ok ? (await r.json()).me : null; } catch { return null; } }
  function signInForm(body, done) {
    body.innerHTML = `<p style="margin:0 0 10px;opacity:.8">Sign in with your SanjivramOS account to play online. It's the same account Messages uses, so friends see what you're playing.</p>
      <div class="sjn-row"><label>Username</label><input class="sjn-grow" id="sjn-u" autocomplete="username" maxlength="24"></div>
      <div class="sjn-row"><label>Password</label><input class="sjn-grow" id="sjn-pw" type="password" autocomplete="current-password"></div>
      <div class="sjn-row"><button class="sjn-btn" id="sjn-in">Sign in</button><button class="sjn-btn sec" id="sjn-new">Create account</button></div><div class="sjn-err" id="sjn-e"></div>`;
    const go = async kind => {
      const r = await fetch('/social/api/' + kind, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: body.querySelector('#sjn-u').value.trim(), password: body.querySelector('#sjn-pw').value }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { body.querySelector('#sjn-e').textContent = j.error || 'Something went wrong'; return; } done(j.me);
    };
    body.querySelector('#sjn-in').onclick = () => go('login'); body.querySelector('#sjn-new').onclick = () => go('signup');
    body.querySelector('#sjn-pw').onkeydown = e => { if (e.key === 'Enter') go('login'); };
    setTimeout(() => body.querySelector('#sjn-u').focus(), 50);
  }

  /* ---------- the lobby ---------- */
  function lobby(opts) {
    css();
    const o = Object.assign({ max: 4, min: 2, maps: [], modes: [], teams: null, title: opts.gameName || 'Multiplayer' }, opts);
    return new Promise((resolve, reject) => {
      const root = document.createElement('div'); root.className = 'sjn';
      root.innerHTML = `<div class="sjn-card" role="dialog" aria-label="${esc(o.title)} online"><div class="sjn-head"><h2>🌐 ${esc(o.title)} — online</h2><span class="sjn-who"></span><button class="sjn-x" title="Close" aria-label="Close">×</button></div><div class="sjn-tabs"></div><div class="sjn-body"></div><div class="sjn-foot" hidden></div></div>`;
      document.body.appendChild(root);
      const $ = s => root.querySelector(s), body = $('.sjn-body'), tabs = $('.sjn-tabs'), foot = $('.sjn-foot');
      let conn = null, tab = 'browse', refreshT = null, done = false;
      const close = (err) => { clearInterval(refreshT); root.remove(); if (!done) { done = true; if (conn) conn.close(); reject(err || new Error('closed')); } };
      $('.sjn-x').onclick = () => { if (conn && conn.room) conn.req({ op: 'leave' }); close(); };
      const finish = net => { done = true; clearInterval(refreshT); root.remove(); resolve(net); };

      const showTabs = () => {
        tabs.hidden = false; foot.hidden = true;
        tabs.innerHTML = [['browse', 'Browse rooms'], ['host', 'Host a game'], ['code', 'Join with code'], ['char', '🧍 My character']].map(([k, l]) => `<button class="sjn-tab${tab === k ? ' on' : ''}" data-k="${k}">${l}</button>`).join('');
        tabs.onclick = e => { const b = e.target.closest('[data-k]'); if (b) { tab = b.dataset.k; render(); } };
      };
      const render = () => { clearInterval(refreshT); showTabs(); ({ browse, host, code, char })[tab](); };
      async function char() {
        body.innerHTML = '<div class="sjn-empty">Loading…</div>';
        await lookReady; if (!window.SJLook) { body.innerHTML = '<div class="sjn-empty">Couldn’t load the character maker.</div>'; return; }
        const look = await SJLook.get();
        body.innerHTML = `<p style="margin:0 0 10px;opacity:.8">This is you in every online game — other players see it in the lobby and in games like Lantern Woods and Stormhouse.</p><div id="sjn-ed"></div><div class="sjn-row"><button class="sjn-btn" id="sjn-save">Save character</button><span class="sjn-err" id="sjn-e" style="margin:0"></span></div>`;
        const ed = SJLook.editor(body.querySelector('#sjn-ed'), look);
        $('#sjn-save').onclick = async () => { const w = await SJLook.save(ed.get()); $('#sjn-e').style.color = w === 'error' ? '' : '#86efac'; $('#sjn-e').textContent = w === 'account' ? 'Saved to your account ✓' : w === 'local' ? 'Saved on this device ✓' : 'Couldn’t save — restart SanjivramOS and try again'; if (conn && conn.me) conn.me.look = ed.get(); };
      }

      function browse() {
        body.innerHTML = `<div class="sjn-list">${'<div class="sjn-skel"></div>'.repeat(3)}</div>`;
        const load = async () => {
          const r = await conn.req({ op: 'rooms' }); if (tab !== 'browse' || !root.isConnected) return;
          const mine = (r.rooms || []).filter(x => x.game === o.game), others = (r.rooms || []).filter(x => x.game !== o.game);
          const row = x => `<button class="sjn-room" data-code="${esc(x.code)}" data-lock="${x.locked ? 1 : ''}"><span><b>${esc(x.name)}</b><small>${esc(x.gameName || x.game)} · host ${esc(x.host)}${x.map ? ' · ' + esc(x.map) : ''}${x.mode ? ' · ' + esc(x.mode) : ''}</small></span><span class="sjn-pill${x.status === 'playing' ? ' live' : ''}">${x.status === 'playing' ? 'In game' : 'Lobby'}</span><span class="sjn-pill${x.locked ? ' lock' : ''}">${x.locked ? '🔒 ' : ''}${x.players}/${x.max} · ${conn.ping || '–'} ms</span></button>`;
          body.innerHTML = `<div class="sjn-row" style="margin-top:0"><span class="sjn-grow" style="opacity:.7">Rooms on <b>${esc(r.server)}</b> — everyone using this SanjivramOS on your network sees them.</span><button class="sjn-btn sec" id="sjn-r">↻ Refresh</button></div>
            <div class="sjn-list">${mine.length ? mine.map(row).join('') : `<div class="sjn-empty">No ${esc(o.gameName)} rooms yet. Host one and share the code!</div>`}</div>
            ${others.length ? `<p style="opacity:.6;margin:14px 0 6px">Other games</p><div class="sjn-list">${others.map(row).join('')}</div>` : ''}
            ${(r.lan || []).length ? `<p style="opacity:.6;margin:14px 0 6px">Other SanjivramOS servers on this network</p><div class="sjn-list">${r.lan.map(s => `<a class="sjn-room" href="${esc(s.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span><b>${esc(s.name)}</b><small>${esc(s.url)} · ${s.rooms.length} open room${s.rooms.length === 1 ? '' : 's'}: ${s.rooms.slice(0, 3).map(x => esc(x.game + ' ' + x.code)).join(', ')}</small></span><span class="sjn-pill">LAN</span><span class="sjn-pill">Open ↗</span></a>`).join('')}</div>` : ''}`;
          $('#sjn-r').onclick = load;
          body.querySelectorAll('[data-code]').forEach(b => b.onclick = () => joinCode(b.dataset.code, b.dataset.lock ? prompt('Room password') : undefined));
        };
        load(); refreshT = setInterval(load, 4000);
      }
      function host() {
        const sel = (id, list) => list.length ? `<select id="${id}" class="sjn-grow">${list.map(x => `<option>${esc(x)}</option>`).join('')}</select>` : '';
        body.innerHTML = `<div class="sjn-row"><label>Room name</label><input id="sjn-n" class="sjn-grow" maxlength="40" value="${esc((conn.me && conn.me.display) || 'My')}'s ${esc(o.gameName)}"></div>
          ${o.maps.length ? `<div class="sjn-row"><label>Map</label>${sel('sjn-map', o.maps)}</div>` : ''}${o.modes.length ? `<div class="sjn-row"><label>Mode</label>${sel('sjn-mode', o.modes)}</div>` : ''}
          ${o.max > 2 ? `<div class="sjn-row"><label>Players</label><select id="sjn-max">${Array.from({ length: o.max - o.min + 1 }, (_, i) => o.min + i).map(n => `<option${n === o.max ? ' selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
          <div class="sjn-row"><label>Password</label><input id="sjn-pw2" class="sjn-grow" type="password" placeholder="Optional" autocomplete="new-password"></div>
          <div class="sjn-row"><label>Visibility</label><label style="min-width:0;opacity:1"><input type="checkbox" id="sjn-priv"> Private (only people with the code)</label></div>
          <div class="sjn-row"><button class="sjn-btn" id="sjn-h">Create room</button></div><div class="sjn-err" id="sjn-e"></div>`;
        $('#sjn-h').onclick = async () => {
          const v = id => { const e = root.querySelector(id); return e ? e.value : ''; };
          await lookReady;
          const r = await conn.req({ op: 'create', game: o.game, gameName: o.gameName, name: v('#sjn-n'), map: v('#sjn-map'), mode: v('#sjn-mode'), max: +v('#sjn-max') || o.max, password: v('#sjn-pw2'), private: $('#sjn-priv').checked, teams: o.teams, settings: o.settings || {} });
          if (r.error) { $('#sjn-e').textContent = r.error; return; }
          conn.code = r.room.code; inRoom();
        };
      }
      function code(prefill = '') {
        body.innerHTML = `<p style="opacity:.8;margin:0 0 8px">Type the code the host shared with you.</p><div class="sjn-row"><input id="sjn-c" maxlength="5" placeholder="ABCDE" value="${esc(prefill)}" style="font:700 22px ui-monospace,monospace;letter-spacing:6px;text-transform:uppercase;width:180px"><button class="sjn-btn" id="sjn-j">Join</button></div>
          <div class="sjn-row"><input id="sjn-pw3" type="password" placeholder="Password (if the room has one)" class="sjn-grow"></div><div class="sjn-err" id="sjn-e"></div>
          <p style="opacity:.6;font-size:12px;margin-top:14px">On a different SanjivramOS server? Open its address (e.g. <b>http://192.168.1.20:8080</b>) and join there — rooms live on the server that hosts them.</p>`;
        const go = () => joinCode($('#sjn-c').value, $('#sjn-pw3').value || undefined);
        $('#sjn-j').onclick = go; $('#sjn-c').onkeydown = e => { if (e.key === 'Enter') go(); };
        setTimeout(() => $('#sjn-c').focus(), 30);
      }
      async function joinCode(c, password, spectate) {
        const r = await conn.req({ op: 'join', code: String(c || '').toUpperCase().trim(), password, game: o.game, spectate });
        if (r.error) {
          if (r.full && confirm('That room is full. Watch as a spectator?')) return joinCode(c, password, true);
          if (r.needPassword && !password) { const p = prompt('This room has a password'); if (p) return joinCode(c, p); }
          if (tab !== 'code') { tab = 'code'; render(); code(c); }
          const e = root.querySelector('#sjn-e'); if (e) e.textContent = r.error; else toast(r.error);
          return;
        }
        conn.code = r.room.code; inRoom();
      }

      function inRoom() {
        clearInterval(refreshT); tabs.hidden = true; foot.hidden = false;
        const draw = () => {
          const r = conn.room; if (!r || !root.isConnected) return;
          const meId = conn.me.id, isHost = r.hostId === meId, mine = r.members.find(m => m.id === meId) || {};
          const players = r.members.filter(m => !m.spectator), ready = players.filter(m => m.ready || m.id === r.hostId).length;
          const canStart = isHost && players.length >= o.min && ready === players.length;
          const teamCol = ['#60a5fa', '#f87171', '#facc15', '#4ade80'];
          body.innerHTML = `<div class="sjn-lobby"><div>
              <div class="sjn-row" style="margin-top:0"><span class="sjn-code" title="Room code">${esc(r.code)}</span><button class="sjn-btn sec" id="sjn-copy">Copy</button><button class="sjn-btn sec" id="sjn-inv">Invite…</button></div>
              <div style="opacity:.7;font-size:12px;margin-bottom:10px">${esc(r.name)}${r.map ? ' · ' + esc(r.map) : ''}${r.mode ? ' · ' + esc(r.mode) : ''} · ${r.private ? 'Private' : 'Public'}${r.locked ? ' · 🔒' : ''}</div>
              <div class="sjn-players">${r.members.map(m => `<div class="sjn-p">${avatar(m)}<span class="n">${esc(m.display)}${m.id === r.hostId ? ' 👑' : ''}${m.id === meId ? ' (you)' : ''}</span>
                ${r.teams && !m.spectator ? `<span class="sjn-pill" style="color:${teamCol[m.team] || '#fff'}">${esc(r.teams[m.team] || '')}</span>` : ''}
                ${m.spectator ? '<span class="sjn-pill">👁 Watching</span>' : `<span class="sjn-pill${m.ready || m.id === r.hostId ? ' live' : ''}">${m.id === r.hostId ? 'Host' : m.ready ? 'Ready' : 'Not ready'}</span>`}
                <span class="sjn-dot${m.connected ? ' on' : ''}" title="${m.connected ? 'Connected' : 'Reconnecting…'}"></span>
                ${isHost && m.id !== meId ? `<button class="sjn-x" data-kick="${m.id}" title="Remove from room" style="width:26px;height:26px;font-size:14px">✕</button>` : ''}</div>`).join('')}</div>
              ${players.length < r.max ? `<div style="opacity:.55;font-size:12px;margin-top:8px">${r.max - players.length} open slot${r.max - players.length === 1 ? '' : 's'} — share the code.</div>` : ''}
            </div><div class="sjn-chat"><div class="sjn-lines">${r.chat.map(l => l.sys ? `<div class="sys">${esc(l.text)}</div>` : `<div><b>${esc(l.name)}:</b> ${esc(l.text)}</div>`).join('')}</div><form><input maxlength="300" placeholder="Say something…" aria-label="Lobby chat"><button class="sjn-btn sec">Send</button></form></div></div>`;
          const lines = body.querySelector('.sjn-lines'); lines.scrollTop = lines.scrollHeight;
          body.querySelector('form').onsubmit = e => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) conn.req({ op: 'chat', text: i.value }); i.value = ''; };
          $('#sjn-copy').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(r.code) : Promise.reject()).then(() => toast('Code copied'), () => toast('Code: ' + r.code)); };
          $('#sjn-inv').onclick = () => invite(r);
          body.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => conn.req({ op: 'kick', uid: +b.dataset.kick }));
          foot.innerHTML = `${r.teams && !mine.spectator ? r.teams.map((t, i) => `<button class="sjn-btn sec" data-team="${i}" style="${mine.team === i ? 'outline:2px solid ' + teamCol[i] : ''}">${esc(t)}</button>`).join('') : ''}
            <button class="sjn-btn sec" id="sjn-spec">${mine.spectator ? 'Play' : 'Spectate'}</button><span class="sjn-grow"></span><span style="opacity:.6;font-size:12px">${conn.ping || '–'} ms</span>
            <button class="sjn-btn sec" id="sjn-leave">Leave</button>
            ${isHost ? `<button class="sjn-btn ok" id="sjn-start" ${canStart ? '' : 'disabled'} title="${canStart ? '' : players.length < o.min ? 'Waiting for players' : 'Waiting for everyone to be ready'}">Start (${ready}/${players.length} ready)</button>`
              : mine.spectator ? '' : `<button class="sjn-btn ${mine.ready ? 'sec' : 'ok'}" id="sjn-ready">${mine.ready ? 'Not ready' : 'Ready'}</button>`}`;
          foot.querySelectorAll('[data-team]').forEach(b => b.onclick = () => conn.req({ op: 'team', team: +b.dataset.team }));
          $('#sjn-spec').onclick = async () => { const x = await conn.req({ op: 'spectate', on: !mine.spectator }); if (x.error) toast(x.error); };
          $('#sjn-leave').onclick = async () => { await conn.req({ op: 'leave' }); conn.code = null; conn.room = null; tab = 'browse'; render(); };
          const rd = $('#sjn-ready'); if (rd) rd.onclick = () => conn.req({ op: 'ready', on: !mine.ready });
          const st = $('#sjn-start'); if (st) st.onclick = () => conn.req({ op: 'start' });
        };
        conn.on('room', draw); conn.on('chat', d => { if (conn.room) { conn.room.chat.push(d.line); draw(); } }); conn.on('ping', () => { const s = root.querySelector('.sjn-foot span[style*="font-size:12px"]'); if (s) s.textContent = conn.ping + ' ms'; });
        conn.on('host', d => toast(`${d.name} is now the host`));
        conn.on('left', d => { if (d.why === 'kicked') toast('The host removed you from the room'); conn.code = null; conn.room = null; tab = 'browse'; if (root.isConnected) render(); });
        conn.on('closed', d => { toast('Room closed' + (d.why ? ': ' + d.why : '')); conn.code = null; conn.room = null; tab = 'browse'; if (root.isConnected) render(); });
        draw();
      }
      function invite(r) {
        const msg = { sjnet: 'invite', game: o.game, gameName: o.gameName, code: r.code, name: r.name };
        if (window.parent !== window) { window.parent.postMessage(msg, location.origin); toast('Choose who to invite in Messages'); }
        else { const link = location.origin + location.pathname + '?join=' + r.code; (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Invite link copied'), () => prompt('Share this link', link)); }
      }

      (async () => {
        body.innerHTML = `<div class="sjn-list">${'<div class="sjn-skel"></div>'.repeat(3)}</div>`;
        let user = await me();
        const start = async () => {
          $('.sjn-who').textContent = 'Signed in as ' + user.display;
          try { conn = await new Conn().open(); } catch (e) { body.innerHTML = `<div class="sjn-empty">${esc(e.message)}</div>`; return; }
          await new Promise(r => setTimeout(r, 60));
          conn.me = conn.me || user;
          conn.on('start', d => {
            const net = makeNet(conn, d);
            if (!done) finish(net);
          });
          const want = new URLSearchParams(location.search).get('join') || o.join;
          if (want) joinCode(want); else render();
        };
        if (user) start(); else { tabs.hidden = true; signInForm(body, u => { user = u; start(); }); }
      })();
    });
  }
  function makeNet(conn, d) {
    const net = {
      conn, me: conn.me, get room() { return conn.room; }, get isHost() { return conn.room && conn.room.hostId === conn.me.id; }, seed: d.seed, late: !!d.late, get ping() { return conn.ping; },
      players() { return (conn.room ? conn.room.members : []).filter(m => !m.spectator); },
      spectating() { const m = conn.room && conn.room.members.find(x => x.id === conn.me.id); return !!(m && m.spectator); },
      send(data, to) { conn.raw({ op: 'm', d: data, to }); },
      on(t, f) { conn.on(t, t === 'm' ? f : d => f(d)); return net; },
      say(text) { return conn.req({ op: 'chat', text }); },
      stats(s) { return conn.req({ op: 'stats', d: s }); },
      rematch() { return conn.req({ op: 'start' }); },
      leave() { conn.req({ op: 'leave' }); conn.close(); },
    };
    return net;
  }
  window.SJNet = { lobby, me, toast, connect: () => new Conn().open(), esc, look: () => lookReady.then(() => window.SJLook) };
})();
