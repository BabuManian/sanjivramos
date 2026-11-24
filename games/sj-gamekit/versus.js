/* SanjivramOS Versus — turns any sj- game into an online race. Loaded by kit.js when the page is served by SanjivramOS.
   Not in a room: shows a 🌐 Online button → lobby (net.js) → when the host starts, every player reloads the game with
   ?vs=CODE&seed=N (kit.js seeds Math.random, so everyone gets the same levels/pieces/enemies).
   In a room: 3-2-1 countdown, live scoreboard, the host referees the round, results + rematch.
   Per-game options (SJG.init(..., { vs: {...} })):
     mode: 'score' (best score wins; init's lower:true = lowest wins) | 'time' (first to finish wins)
     live: '#selector' | () => number   — score shown while playing
     final: false  — the game's SJG.score() calls are progress, not "I'm done" (round ends on the clock)
     levelKey, levels — puzzle games: everyone starts on the same level                                         */
(() => {
  'use strict';
  if (window.SJVersus) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `
.sjv-btn{position:fixed;z-index:99990;left:8px;bottom:8px;display:flex;align-items:center;gap:6px;padding:7px 12px;border:none;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:blur(8px);opacity:.82;transition:opacity .15s,transform .1s;touch-action:none;user-select:none}
.sjv-btn:hover{opacity:1}.sjv-btn:active{transform:scale(.96)}
.sjv-hud{position:fixed;z-index:99990;top:8px;right:8px;min-width:190px;max-width:260px;background:rgba(10,14,26,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#e5e7eb;border:1px solid rgba(255,255,255,.08);border-radius:14px;font:13px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);overflow:hidden;touch-action:none;user-select:none}
.sjv-hud header{display:flex;align-items:center;gap:6px;padding:7px 10px;background:rgba(255,255,255,.05);font-weight:700;cursor:grab}
.sjv-hud header span{flex:1}.sjv-hud header button{border:none;background:none;color:#cbd5e1;cursor:pointer;font:inherit;padding:0 4px}
.sjv-rows{padding:4px 6px 6px;max-height:40vh;overflow:auto}
.sjv-hud.min .sjv-rows{display:none}
.sjv-r{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:8px}
.sjv-r.me{background:rgba(59,130,246,.25)}
.sjv-r .p{width:18px;text-align:center;font-weight:700;opacity:.8}.sjv-r .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sjv-r .v{font-variant-numeric:tabular-nums;font-weight:700}.sjv-r .d{font-size:11px;color:#86efac}.sjv-r.off{opacity:.45}
.sjv-over{position:fixed;inset:0;z-index:99995;display:flex;align-items:center;justify-content:center;background:rgba(5,8,16,.72);backdrop-filter:blur(8px);color:#fff;font:15px system-ui,sans-serif;animation:sjvf .2s}
@keyframes sjvf{from{opacity:0}}
.sjv-count{font:800 120px/1 system-ui,sans-serif;text-shadow:0 0 40px rgba(96,165,250,.8);animation:sjvp .9s ease-out infinite}
@keyframes sjvp{from{transform:scale(1.4);opacity:0}30%{opacity:1}to{transform:scale(1)}}
.sjv-card{width:min(420px,calc(100% - 28px));background:rgba(20,26,44,.95);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px 22px;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center}
.sjv-card h2{margin:4px 0 2px;font-size:26px}.sjv-card p{opacity:.75;margin:4px 0 12px}
.sjv-pod{display:flex;flex-direction:column;gap:6px;text-align:left;margin:10px 0 14px}
.sjv-pod .sjv-r{background:rgba(255,255,255,.05);padding:8px 10px}.sjv-pod .sjv-r.me{background:rgba(59,130,246,.3)}
.sjv-card button{border:none;border-radius:10px;padding:10px 16px;font:600 14px system-ui;cursor:pointer;margin:3px;background:rgba(255,255,255,.1);color:#fff}
.sjv-card button.pri{background:#3b6cff}
.sjv-toast{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99996;background:rgba(15,23,42,.92);color:#e2e8f0;padding:8px 14px;border-radius:999px;font:13px system-ui}
@media (prefers-reduced-motion:reduce){.sjv-count{animation:none}}`;
  function css() { if (!document.getElementById('sjv-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sjv-css', textContent: CSS })); }
  const pos = { get: k => { try { return JSON.parse(localStorage.getItem('sjv.pos.' + k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('sjv.pos.' + k, JSON.stringify(v)); } catch {} } };
  /** drag an element; remembers where you left it */
  function draggable(el, handle, key, onTap) {
    const p = pos.get(key); if (p) Object.assign(el.style, { left: p.l, top: p.t, right: 'auto', bottom: 'auto' });
    let d = null;
    handle.addEventListener('pointerdown', e => { if (e.target.closest('button') && e.target !== handle && !onTap) return; d = { x: e.clientX, y: e.clientY, r: el.getBoundingClientRect(), moved: false }; try { handle.setPointerCapture(e.pointerId); } catch {} });
    handle.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.moved && Math.hypot(dx, dy) < 6) return; d.moved = true; const l = Math.max(0, Math.min(innerWidth - d.r.width, d.r.left + dx)), t = Math.max(0, Math.min(innerHeight - d.r.height, d.r.top + dy)); Object.assign(el.style, { left: l + 'px', top: t + 'px', right: 'auto', bottom: 'auto' }); });
    handle.addEventListener('pointerup', e => { if (!d) return; if (d.moved) pos.set(key, { l: el.style.left, t: el.style.top }); else if (onTap) onTap(e); d = null; });
  }
  function toast(t) { const d = document.createElement('div'); d.className = 'sjv-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
  const DURATIONS = { '3 minutes': 180, '5 minutes': 300, '2 minutes': 120, '1 minute': 60, '10 minutes': 600, 'Until everyone finishes': 0 };

  function setup(SJG, o, VS, registerFinal) {
    css();
    const cfg = Object.assign({ mode: 'score' }, o.vs || {}), game = o._id, title = o.title || game, lower = !!o.lower;
    if (o.remote) return remotePlay(SJG, o);
    if (!VS) return offerButton();

    /* ---------- not in a room: the Online button ---------- */
    function offerButton() {
      if (document.querySelector('.sjv-btn')) return;
      const b = document.createElement('button'); b.className = 'sjv-btn'; b.title = 'Play this game online against friends (drag to move)';
      b.innerHTML = '🌐 <span>Online</span>';
      document.body.appendChild(b);
      draggable(b, b, game + '.btn', () => openLobby());
      const q = new URLSearchParams(location.search), join = q.get('join'); if (join) openLobby(join); else if (q.get('online')) openLobby();
    }
    async function openLobby(join) {
      let net;
      const modes = cfg.mode === 'time' && cfg.final !== false ? ['Until everyone finishes', '3 minutes', '5 minutes', '10 minutes'] : cfg.final === false ? ['3 minutes', '5 minutes', '2 minutes', '10 minutes'] : ['Until everyone finishes', '3 minutes', '5 minutes', '2 minutes'];
      try { net = await SJNet.lobby({ game, gameName: title, max: 8, min: 2, modes, settings: { hostGrace: 20000, versus: true }, join }); }
      catch { return; }
      go(net.room.code, net.seed);
    }
    function go(code, seed) { const u = new URL(location.href); u.searchParams.delete('join'); u.searchParams.set('vs', code); u.searchParams.set('seed', seed); location.replace(u.href); }

    /* ---------- in a room: the race ---------- */
    let forceEnd = false, conn = null, me = null, room = null, isHost = false, done = null, ended = false, board = new Map(), endAt = 0, startT = 0, lastLive = null;
    const hud = document.createElement('div'); hud.className = 'sjv-hud';
    hud.innerHTML = `<header><span>🌐 ${esc(title)}</span><b class="sjv-clock"></b><button class="sjv-end" title="End the round now (host)" hidden>⏹</button><button class="sjv-out" title="Leave room">✕</button><button class="sjv-min" title="Hide/show">▾</button></header><div class="sjv-rows"><div class="sjv-r"><span class="n">Connecting…</span></div></div>`;
    // countdown that blocks input until everyone's ready
    const over = document.createElement('div'); over.className = 'sjv-over'; over.innerHTML = '<div class="sjv-count">…</div>';
    const block = e => { if (over.isConnected && !e.target.closest('.sjv-over button')) { e.stopImmediatePropagation(); e.preventDefault(); } };
    ['keydown', 'keyup', 'pointerdown', 'mousedown', 'touchstart', 'click'].forEach(t => addEventListener(t, block, true));
    const mount = () => { document.body.appendChild(hud); document.body.appendChild(over); draggable(hud, hud.querySelector('header'), game + '.hud'); hud.querySelector('.sjv-min').onclick = () => hud.classList.toggle('min'); hud.querySelector('.sjv-out').onclick = () => { if (confirm('Leave this online room?')) leave(); }; hud.querySelector('.sjv-end').onclick = () => { if (isHost && !ended && confirm('End the round now? Everyone is ranked on their current score.')) { forceEnd = true; hostTick(); } }; };
    if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);

    /* ---------- the host chooses: menu clicks (level, track, car, map, mode…) are mirrored to every guest,
       and guests can't change those menus themselves. Games can name their menu with vs.menu: 'selector'. ---------- */
    const MENU = cfg.menu || '#menu,#pick,#picks,#title,.menu,#levels,.levels,#lvls,#modes,#start,#startBtn,#stages,#tracks,#cars,#maps,.picker,.select,.level-select';
    const CLICKY = 'button,a,select,input,label,li,[data-i],[data-k],[data-id],[data-mode],[data-l],[data-lv],[data-level],[data-t],[role=button],[onclick],.chip,.card,.opt,.lvl,.level';
    const pathOf = el => { const p = []; while (el && el !== document.body) { const par = el.parentElement; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.children, el)); el = par; } return p.join('.'); };
    const byPath = s => s.split('.').reduce((el, i) => el && el.children[+i], document.body);
    let followTip = 0;
    const hostPick = e => {
      if (!conn || !room || !e.isTrusted || e.target.closest('.sjv-hud,.sjv-over,.sjv-btn')) return;
      const inMenu = e.target.closest && e.target.closest(MENU); if (!inMenu) return;
      if (isHost) {
        if (e.type !== 'click' && e.type !== 'change') return;
        const el = e.target.closest(CLICKY) || e.target, p = pathOf(el); if (p == null) return;
        if (e.type === 'click') conn.raw({ op: 'm', d: { vs: 'pick', p } });
        else conn.raw({ op: 'm', d: { vs: 'set', p, v: el.value, c: !!el.checked } });
      } else if (e.type !== 'change' && e.type !== 'input') {
        e.stopImmediatePropagation(); e.preventDefault();
        if (e.type === 'click' && Date.now() - followTip > 2500) { followTip = Date.now(); toast('👑 The host picks for everyone — you’ll follow'); }
      }
    };
    ['click', 'change', 'pointerdown', 'mousedown', 'touchstart'].forEach(t => addEventListener(t, hostPick, true));
    const applyPick = (d, tries = 0) => {
      const el = byPath(d.p);
      if (!el) { if (tries < 15) setTimeout(() => applyPick(d, tries + 1), 150); return; }
      if (d.vs === 'pick') el.click();
      else { if ('checked' in el && (el.type === 'checkbox' || el.type === 'radio')) el.checked = d.c; else el.value = d.v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    const live = () => {
      try {
        if (typeof cfg.live === 'function') { const v = cfg.live(); return isFinite(v) ? +v : null; }
        if (typeof cfg.live === 'string') { const el = document.querySelector(cfg.live); const m = el && /-?\d+(\.\d+)?/.exec(el.textContent.replace(/,/g, '')); return m ? +m[0] : null; }
      } catch {}
      return null;
    };
    registerFinal((v, mode) => {
      if (done || ended || !startT || cfg.final === false) return;
      if (cfg.finalModes && !cfg.finalModes.includes(mode)) return;
      done = { v: +v, t: Date.now() - startT };
      report(); toast(cfg.mode === 'time' ? `Finished in ${(done.t / 1000).toFixed(1)} s!` : `Final score: ${v}`);
    });
    function report() {
      const msg = { vs: 'live', v: done ? done.v : live(), done: !!done, t: done ? done.t : null };
      if (isHost) take(me.id, msg); else conn.raw({ op: 'm', d: msg });
    }
    function take(uid, m) {
      const b = board.get(uid) || {}; if (b.done && !m.done) return;
      board.set(uid, { v: m.v == null ? b.v : m.v, done: !!m.done, t: m.t, seen: Date.now() });
    }
    const people = () => (room ? room.members : []).filter(m => !m.spectator);
    function ranked() {
      const rows = people().map(m => { const b = board.get(m.id) || {}; return { id: m.id, name: m.display, v: b.v, done: !!b.done, t: b.t, on: m.connected !== false }; });
      const val = r => r.v == null ? (lower ? Infinity : -Infinity) : r.v;
      rows.sort((a, b) => {
        if (cfg.mode === 'time') { if (a.done !== b.done) return a.done ? -1 : 1; if (a.done) return a.t - b.t; }
        return lower ? val(a) - val(b) : val(b) - val(a);
      });
      return rows;
    }
    const fmt = r => r.v == null ? '–' : (cfg.mode === 'time' && r.done ? (r.t / 1000).toFixed(1) + 's' : Math.round(r.v * 100) / 100);
    function drawHud(rows, left) {
      hud.querySelector('.sjv-end').hidden = !isHost || ended;
      const clock = hud.querySelector('.sjv-clock'); clock.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : '';
      hud.querySelector('.sjv-rows').innerHTML = rows.map((r, i) => `<div class="sjv-r${me && r.id === me.id ? ' me' : ''}${r.on ? '' : ' off'}"><span class="p">${i + 1}</span><span class="n">${esc(r.name)}</span>${r.done ? '<span class="d">✓</span>' : ''}<span class="v">${fmt(r)}</span></div>`).join('') || '<div class="sjv-r"><span class="n">Waiting…</span></div>';
    }
    // the host referees: collects everyone's scores, broadcasts the board, decides when the round ends
    function hostTick() {
      if (!isHost || ended) return;
      const rows = ranked(), left = endAt ? Math.max(0, (endAt - Date.now()) / 1000) : 0;
      const everyoneDone = rows.length && rows.every(r => r.done || !r.on && Date.now() - startT > 25000);
      const timeUp = endAt && Date.now() >= endAt;
      const finish = (everyoneDone && cfg.final !== false) || timeUp || forceEnd;
      conn.raw({ op: 'm', d: { vs: 'board', rows, left, end: finish, endAt } });
      drawHud(rows, left);
      if (finish) endRound(rows);
    }
    function endRound(rows) {
      if (ended) return; ended = true;
      const place = rows.findIndex(r => r.id === me.id) + 1, won = place === 1 && rows.length > 1;
      if (won) { SJG.unlock && SJG.stat('vsWins'); SJG.toast && SJG.toast('You won the race!', '🏆', true); SJG.sfx && SJG.sfx('win'); } else SJG.sfx && SJG.sfx('lose');
      const card = document.createElement('div'); card.className = 'sjv-over';
      card.innerHTML = `<div class="sjv-card"><div style="font-size:44px">${won ? '🏆' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🏁'}</div><h2>${won ? 'You win!' : place ? `You placed #${place}` : 'Round over'}</h2><p>${esc(title)} · ${cfg.mode === 'time' ? 'fastest finish wins' : lower ? 'lowest score wins' : 'highest score wins'}</p>
        <div class="sjv-pod">${rows.map((r, i) => `<div class="sjv-r${r.id === me.id ? ' me' : ''}"><span class="p">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="n">${esc(r.name)}</span><span class="v">${fmt(r)}${r.done || cfg.mode !== 'time' ? '' : ' (DNF)'}</span></div>`).join('')}</div>
        ${isHost ? '<button class="pri" data-x="again">Rematch</button>' : '<p style="font-size:13px">Waiting for the host to start a rematch…</p>'}<button data-x="stay">Keep playing</button><button data-x="leave">Leave room</button></div>`;
      document.body.appendChild(card);
      card.onclick = e => { const b = e.target.closest('[data-x]'); if (!b) return; if (b.dataset.x === 'again') conn.req({ op: 'start' }); if (b.dataset.x === 'stay') card.remove(); if (b.dataset.x === 'leave') leave(); };
    }
    function leave() { if (conn) { conn.req({ op: 'leave' }); conn.close(); } const u = new URL(location.href); u.searchParams.delete('vs'); u.searchParams.delete('seed'); location.replace(u.href); }

    (async () => {
      try {
        conn = await SJNet.connect();
        const r = await conn.req({ op: 'join', code: VS.code });
        if (r.error) throw new Error(r.error);
        room = r.room; me = conn.me || (await SJNet.me()); isHost = room.hostId === me.id;
      } catch (e) {
        over.innerHTML = `<div class="sjv-card"><h2>Couldn’t join the race</h2><p>${esc(e.message)}</p><button class="pri" data-x="leave">Play offline</button></div>`;
        over.onclick = ev => { if (ev.target.closest('[data-x]')) leave(); };
        return;
      }
      const dur = DURATIONS[room.mode] != null ? DURATIONS[room.mode] : (cfg.final === false ? 180 : 0);
      conn.on('room', d => { room = d.room; isHost = room.hostId === me.id; });
      conn.on('host', d => { isHost = d.host === me.id; if (isHost) toast('You are now the referee'); });
      conn.on('start', d => { if (d.seed && d.seed !== VS.seed) go(VS.code, d.seed); });
      conn.on('closed', () => { toast('The room closed'); setTimeout(leave, 1500); });
      conn.on('left', d => { if (d.why === 'kicked') { toast('The host removed you'); setTimeout(leave, 1200); } });
      conn.on('reconnected', () => report());
      conn.on('m', (d, from) => {
        if (!d || !d.vs) return;
        if (d.vs === 'live' && isHost) take(from, d);
        if ((d.vs === 'pick' || d.vs === 'set') && !isHost && from === room.hostId) applyPick(d);
        if (d.vs === 'board' && !isHost) { if (d.endAt) endAt = d.endAt; drawHud(d.rows, d.left); if (d.end) endRound(d.rows); }
      });
      // countdown, then go
      const c = over.querySelector('.sjv-count');
      for (const n of ['3', '2', '1', 'GO!']) { c.textContent = n; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; SJG.sfx && SJG.sfx(n === 'GO!' ? 'power' : 'click'); await new Promise(res => setTimeout(res, n === 'GO!' ? 500 : 800)); }
      over.remove();
      startT = Date.now();
      if (isHost && dur) endAt = startT + dur * 1000;
      board.set(me.id, { v: null });
      setInterval(() => { if (!ended) report(); }, 1000);
      setInterval(hostTick, 1000);
      report();
    })();
  }

  /* ---------- Live netplay (replaces the old video "Remote Play" stream) ----------
     The host's game runs the real simulation and sends small JSON snapshots of the game state (~30 a second) over the
     game-room socket. Every guest runs the same page in "guest" mode: it draws from the snapshots and sends its keys
     back, which the host plays as player 2. No video, so it's sharp at any size, uses ~1/50th of the bandwidth and
     works on any connection the room works on.
     o.remote = { snap() → state, load(state), hz?, field: 'code'|'key', map: {guestKey: hostKey}, blockHost: [...],
                  start?() (host, when the guest arrives: e.g. switch to 2-player mode — the host still picks the rest),
                  turn?() → 0|1, pad: [[label, code], …], hide?: 'selector' (host-only UI), help }
     The game checks SJG.netRole ('host' | 'guest' | null); a guest skips its own update() and only draws.          */
  const RCSS = `.sjr-bar{position:fixed;z-index:99990;left:50%;bottom:8px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:5px 8px 5px 12px;border-radius:999px;background:rgba(15,23,42,.85);color:#e2e8f0;font:12.5px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);max-width:calc(100% - 16px)}
.sjr-bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sjr-bar b.ping{font-variant-numeric:tabular-nums;opacity:.8}
.sjr-bar button{border:none;border-radius:999px;padding:5px 10px;background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer;white-space:nowrap}
.sjr-wait{position:fixed;inset:0;z-index:99989;display:grid;place-items:center;background:rgba(5,8,16,.6);backdrop-filter:blur(6px);color:#fff;font:16px system-ui,sans-serif;text-align:center}
.sjr-wait b{display:block;font-size:22px;margin:8px 0 4px}
.sjr-pad{position:fixed;z-index:99991;left:0;right:0;bottom:52px;display:flex;justify-content:space-between;padding:0 18px;pointer-events:none}
.sjr-pad>div{display:grid;gap:8px;pointer-events:auto}.sjr-pad .dp{grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px)}.sjr-pad .ab{grid-template-columns:repeat(2,70px)}
.sjr-pad button{border:none;border-radius:14px;background:rgba(255,255,255,.18);color:#fff;font:700 14px system-ui;touch-action:none;user-select:none;min-height:52px}
.sjr-pad button:active,.sjr-pad button.on{background:rgba(59,130,246,.6)}
.sjr-hide{display:none!important}`;
  /** round numbers so snapshots stay small (Infinity → null, the game's load() must accept that) */
  const pack = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));
  function remotePlay(SJG, o) {
    const R = o.remote, title = o.title || o._id;
    if (!document.getElementById('sjr-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sjr-css', textContent: RCSS }));
    const b = document.createElement('button'); b.className = 'sjv-btn'; b.title = 'Play with a friend online (drag to move)'; b.innerHTML = '🌐 <span>Online</span>';
    document.body.appendChild(b);
    draggable(b, b, o._id + '.btn', () => open());
    const q = new URLSearchParams(location.search), join = q.get('join'); if (join) open(join); else if (q.get('online')) open();
    async function open(joinCode) {
      let net;
      try { net = await SJNet.lobby({ game: o._id, gameName: title, max: 2, min: 2, modes: ['Live — the host picks, both play'], settings: { netplay: 2 }, join: joinCode }); } catch { return; }
      b.remove();
      const bar = document.createElement('div'); bar.className = 'sjr-bar'; document.body.appendChild(bar);
      if (net.isHost) host(net, bar); else guest(net, bar);
    }
    const other = net => net.players().find(m => m.id !== net.me.id);
    function host(net, bar) {
      SJG.netRole = 'host';
      bar.innerHTML = `<span>🌐 Online · you're the host (player 1) — you pick, your friend follows</span><b class="ping"></b><button data-x="leave">Leave</button>`;
      bar.onclick = e => { if (e.target.closest('[data-x=leave]') && confirm('Leave the online game?')) { net.leave(); SJG.netRole = null; bar.remove(); location.replace(location.pathname); } };
      // sounds the host plays are replayed on the guest
      const sq = [], sfx0 = SJG.sfx; SJG.sfx = function (n) { if (sq.length < 12) sq.push(n); return sfx0.apply(this, arguments); };
      const fire = (type, key, code) => { const ev = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }); ev.__sjRemote = true; document.dispatchEvent(ev); };
      const blockHost = new Set(R.blockHost || []), field = R.field || 'code', down = new Map();
      const guard = e => {
        if (e.__sjRemote) { if (R.turn && R.turn() !== 1) e.stopImmediatePropagation(); return; }
        if (e.key === 'Escape') return;
        if (blockHost.has(e[field]) || (R.turn && R.turn() === 1 && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))) { e.stopImmediatePropagation(); e.preventDefault(); }
      };
      addEventListener('keydown', guard, true); addEventListener('keyup', guard, true);
      let started = false;
      net.on('m', (d, from) => {
        if (!d || !d.np) return;
        if (d.np === 'hi') { if (!started && R.start) { started = true; try { R.start(); } catch (e) { console.warn(e); } } send(true); }
        if (d.np === 'k') {
          const src = d[field], mapped = (R.map || {})[src] || src;
          if (d.t === 'd') down.set(src, mapped); else down.delete(src);
          if (field === 'code') fire(d.t === 'd' ? 'keydown' : 'keyup', mapped.startsWith('Key') ? mapped.slice(3).toLowerCase() : mapped.startsWith('Arrow') ? mapped : d.key, mapped);
          else fire(d.t === 'd' ? 'keydown' : 'keyup', mapped, d.code);
        }
      });
      const releaseAll = () => { for (const [, mapped] of down) fire('keyup', mapped, mapped); down.clear(); };
      net.on('peer-left', () => { releaseAll(); bar.querySelector('span').textContent = '🌐 Your friend left — you can keep playing'; });
      net.on('peer-drop', releaseAll);
      net.on('peer-joined', () => send(true)); net.on('peer-back', () => send(true));
      let seq = 0, lastFull = 0;
      const send = full => {
        if (net.players().length + (net.room ? net.room.members.filter(m => m.spectator).length : 0) < 2) return;
        let s; try { s = R.snap(full || Date.now() - lastFull > 2000); } catch (e) { console.warn('snap', e); return; }
        if (full || Date.now() - lastFull > 2000) lastFull = Date.now();
        net.send({ np: 's', n: ++seq, s: pack(s), fx: sq.splice(0) });
      };
      setInterval(() => send(false), 1000 / (R.hz || 30));
      setInterval(() => { const p = bar.querySelector('.ping'); if (p) p.textContent = net.ping ? net.ping + ' ms' : ''; const g = other(net); const sp = bar.querySelector('span'); if (g && sp && !/left/.test(sp.textContent)) sp.textContent = `🌐 Online · ${g.display} is player 2 — you pick, they follow`; }, 1000);
    }
    function guest(net, bar) {
      SJG.netRole = 'guest';
      if (R.hide) document.querySelectorAll(R.hide).forEach(el => el.classList.add('sjr-hide'));
      bar.innerHTML = `<span>🌐 ${SJNet.esc(title)} · you're <b>player 2</b> · ${SJNet.esc(R.help || 'use your normal keys')}</span><b class="ping"></b><button data-x="pad">🎮</button><button data-x="leave">Leave</button>`;
      const wait = document.createElement('div'); wait.className = 'sjr-wait'; wait.innerHTML = `<div>⏳<b>Connecting to the host…</b><small>They pick the mode, fighters and stage — you'll follow.</small></div>`; document.body.appendChild(wait);
      const swallow = e => { if (e.key === 'Escape' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; e.stopImmediatePropagation(); e.preventDefault(); };
      const sendKey = (t, e) => net.send({ np: 'k', t, code: e.code, key: e.key });
      addEventListener('keydown', e => { if (e.repeat) { swallow(e); return; } if (!/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) sendKey('d', e); swallow(e); }, true);
      addEventListener('keyup', e => { if (!/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) sendKey('u', e); swallow(e); }, true);
      addEventListener('blur', () => { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) net.send({ np: 'k', t: 'u', code: c, key: c }); });
      let lastN = 0, lastAt = 0;
      net.on('m', d => {
        if (!d || d.np !== 's') return;
        if (d.n <= lastN && d.n > lastN - 1000) return; lastN = d.n; lastAt = Date.now();   // drop late, out-of-order snapshots
        try { R.load(d.s); } catch (e) { console.warn('load', e); return; }
        for (const n of d.fx || []) try { SJNet.sfx ? SJNet.sfx(n) : sfx0(n); } catch {}
        const menu = R.inMenu ? R.inMenu(d.s) : false;
        wait.hidden = !menu; if (menu) wait.innerHTML = `<div>👑<b>${SJNet.esc((net.players().find(m => m.id === net.room.hostId) || {}).display || 'The host')} is choosing…</b><small>${SJNet.esc(R.menuText ? R.menuText(d.s) : 'Mode, characters and map — you’ll jump in when they start.')}</small></div>`;
      });
      const sfx0 = SJG.sfx.bind(SJG);
      net.on('peer-left', () => { wait.hidden = false; wait.innerHTML = '<div>👋<b>The host left the game</b><small>Close this window or press Leave.</small></div>'; });
      net.on('closed', () => { wait.hidden = false; wait.innerHTML = '<div>👋<b>The room closed</b></div>'; });
      setInterval(() => {
        const p = bar.querySelector('.ping'); if (p) p.textContent = net.ping ? net.ping + ' ms' : '';
        if (lastAt && Date.now() - lastAt > 3000 && wait.hidden) { wait.hidden = false; wait.innerHTML = '<div>📶<b>Waiting for the host…</b><small>Their game is paused or the connection dropped.</small></div>'; }
      }, 1000);
      const hello = () => net.send({ np: 'hi' }); hello(); net.on('reconnected', hello);
      let pad = null;
      const togglePad = () => {
        if (pad) { pad.remove(); pad = null; return; }
        pad = document.createElement('div'); pad.className = 'sjr-pad';
        const P = R.pad || [['A', 'KeyF'], ['B', 'KeyG'], ['C', 'KeyH']];
        pad.innerHTML = `<div class="dp"><i></i><button data-k="KeyW">▲</button><i></i><button data-k="KeyA">◀</button><i></i><button data-k="KeyD">▶</button><i></i><button data-k="KeyS">▼</button><i></i></div><div class="ab">${P.map(([l, c]) => `<button data-k="${c}">${l}</button>`).join('')}</div>`;
        pad.querySelectorAll('[data-k]').forEach(btn => {
          const code = btn.dataset.k, key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
          const dn = e => { e.preventDefault(); btn.classList.add('on'); net.send({ np: 'k', t: 'd', code, key }); }, up = () => { if (!btn.classList.contains('on')) return; btn.classList.remove('on'); net.send({ np: 'k', t: 'u', code, key }); };
          btn.addEventListener('pointerdown', dn); btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
        });
        document.body.appendChild(pad);
      };
      if (matchMedia('(pointer:coarse)').matches) togglePad();
      bar.onclick = e => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'pad') togglePad(); if (x.dataset.x === 'leave') { net.leave(); location.replace(location.pathname); } };
    }
  }
  window.SJVersus = { setup };
})();
