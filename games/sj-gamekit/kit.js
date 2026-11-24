/* SanjivramOS game kit — shared by the ~/games/sj-* games.
   High scores (top 10 per mode), trophies (achievements), play counts and play time, kept in localStorage 'sjg.data'
   so the Games hub (same origin) can show them. Also: gamepad → keyboard mapping, a tiny sound helper and toasts.
   Usage:  SJG.init('breakout', { title:'Breakout', trophies:[{id,name,desc,icon}], lower:false });
           SJG.score(1234, 'classic');  SJG.unlock('first');  SJG.stat('bricks', 1);  SJG.sfx('hit');           */
(() => {
  'use strict';
  const KEY = 'sjg.data';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { games: {} }; } catch { return { games: {} }; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} };
  const embedded = (() => { try { return window.parent !== window; } catch { return true; } })();
  /* Versus races (?vs=CODE&seed=N): every player's game uses the same random numbers, so levels/pieces/enemies match. */
  const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const VSQ = new URLSearchParams(location.search);
  const VS = VSQ.get('vs') && +VSQ.get('seed') ? { code: VSQ.get('vs').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), seed: +VSQ.get('seed') } : null;
  if (VS) Math.random = mulberry(VS.seed);
  let vsFinal = null, vsQueue = [];
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const kitBase = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/kit\.js.*$/, '') : '../sj-gamekit/';
  async function onlineSetup(o) {
    if ((o.vs === false && !o.remote) || !/^https?:$/.test(location.protocol)) return;
    try { const r = await fetch('/healthz', { cache: 'no-store' }); if (!r.ok) return; } catch { return; }
    if (!window.SJNet) await loadScript(kitBase + 'net.js');
    if (!window.SJVersus) await loadScript(kitBase + 'versus.js');
    window.SJVersus.setup(SJG, Object.assign({ _id: id }, o), VS, f => { vsFinal = f; for (const q of vsQueue.splice(0)) f(...q); });
  }
  let id = null, opts = {}, started = 0;

  function rec(d) {
    const g = d.games[id] || (d.games[id] = { scores: {}, ach: {}, stats: {}, plays: 0, time: 0 });
    g.scores = g.scores || {}; g.ach = g.ach || {}; g.stats = g.stats || {};
    return g;
  }
  function update(fn) { const d = load(); const r = fn(rec(d), d); save(d); return r; }
  function post(msg) { if (embedded) try { window.parent.postMessage(Object.assign({ sjg: 1, game: id, title: opts.title || id }, msg), location.origin); } catch {} }

  /* ---------- toasts (only when not inside SanjivramOS — there the desktop shows them) ---------- */
  let toastBox = null;
  function toast(text, icon = '🏆', force = false) {
    if (embedded && !force) return;
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:6px;pointer-events:none;font:600 13px system-ui,sans-serif';
      document.body.appendChild(toastBox);
    }
    const t = document.createElement('div');
    t.style.cssText = 'background:rgba(15,23,42,.92);color:#fde68a;padding:8px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;transform:translateY(-8px);transition:.25s';
    t.textContent = icon + ' ' + text;
    toastBox.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = 1; t.style.transform = 'none'; });
    setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ---------- play time ---------- */
  let tick = null;
  function flushTime() {
    if (!started || !id) return;
    const now = Date.now(), dt = Math.min(60, (now - started) / 1000);
    started = document.hidden ? 0 : now;
    if (dt > 0.5) update(g => { g.time = (g.time || 0) + dt; });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushTime(); else started = Date.now(); });
  addEventListener('pagehide', flushTime);

  /* ---------- sound: tiny WebAudio blips, muted with SJG.mute(true) ---------- */
  let ac = null, muted = false;
  try { muted = localStorage.getItem('sjg.mute') === '1'; } catch {}
  const SFX = {
    hit: [[520, 0.05, 'square']], coin: [[880, 0.06, 'square'], [1320, 0.08, 'square']], jump: [[300, 0.1, 'triangle', 600]],
    boom: [[120, 0.25, 'sawtooth', 40]], hurt: [[220, 0.15, 'sawtooth', 110]], win: [[523, 0.1], [659, 0.1], [784, 0.18]],
    lose: [[392, 0.12], [330, 0.12], [262, 0.25]], click: [[700, 0.03, 'square']], power: [[400, 0.08, 'square', 900], [900, 0.1, 'square', 1400]],
    shoot: [[900, 0.06, 'square', 300]], pop: [[600, 0.04, 'sine', 1200]],
  };
  function sfx(name) {
    if (muted) return;
    const seq = SFX[name] || SFX.click;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      let t = ac.currentTime;
      for (const [f, d, type = 'sine', f2] of seq) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.9;
      }
    } catch {}
  }

  /* ---------- gamepad → keyboard: d-pad/left stick = arrows, A = Space, B = Escape, X = Z, Y = X, Start = Enter/P ---------- */
  const PAD_MAP = { 0: [' ', 'Space'], 1: ['Escape', 'Escape'], 2: ['z', 'KeyZ'], 3: ['x', 'KeyX'], 4: ['q', 'KeyQ'], 5: ['e', 'KeyE'], 8: ['r', 'KeyR'], 9: ['Enter', 'Enter'], 12: ['ArrowUp', 'ArrowUp'], 13: ['ArrowDown', 'ArrowDown'], 14: ['ArrowLeft', 'ArrowLeft'], 15: ['ArrowRight', 'ArrowRight'] };
  const KC = { ' ': 32, Escape: 27, Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, z: 90, x: 88, q: 81, e: 69, r: 82, p: 80 };
  const held = new Set();
  function fire(type, key, code) {
    const ev = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => KC[key] || 0 }); Object.defineProperty(ev, 'which', { get: () => KC[key] || 0 }); } catch {}
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : document).dispatchEvent(ev);
  }
  function setHeld(name, on, key, code) {
    if (on && !held.has(name)) { held.add(name); fire('keydown', key, code); }
    else if (!on && held.has(name)) { held.delete(name); fire('keyup', key, code); }
  }
  let padLoop = 0;
  function pollPads() {
    padLoop = 0;
    if (opts.pads === false) return; // game reads gamepads itself (local multiplayer)
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) { held.forEach(n => { const [k, c] = n.startsWith('b') ? PAD_MAP[n.slice(1)] : AX[n]; setHeld(n, false, k, c); }); return; }
    const p = pads[0];
    for (const b in PAD_MAP) { const btn = p.buttons[b]; setHeld('b' + b, !!(btn && btn.pressed), ...PAD_MAP[b]); }
    const ax = p.axes || [], dz = 0.5;
    setHeld('aL', ax[0] < -dz, ...AX.aL); setHeld('aR', ax[0] > dz, ...AX.aR); setHeld('aU', ax[1] < -dz, ...AX.aU); setHeld('aD', ax[1] > dz, ...AX.aD);
    padLoop = requestAnimationFrame(pollPads);
  }
  const AX = { aL: ['ArrowLeft', 'ArrowLeft'], aR: ['ArrowRight', 'ArrowRight'], aU: ['ArrowUp', 'ArrowUp'], aD: ['ArrowDown', 'ArrowDown'] };
  addEventListener('gamepadconnected', () => { if (!padLoop) padLoop = requestAnimationFrame(pollPads); if (id) toast('Controller connected', '🎮', true); });

  const SJG = {
    embedded, versus: VS,
    init(gameId, o = {}) {
      id = gameId; opts = o;
      update(g => {
        g.title = o.title || g.title || gameId; g.plays = (g.plays || 0) + 1; g.last = Date.now(); g.lower = !!o.lower;
        if (o.trophies) g.defs = o.trophies.map(t => ({ id: t.id, name: t.name, desc: t.desc || '', icon: t.icon || '🏆' }));
        if (o.unit) g.unit = o.unit;
      });
      started = document.hidden ? 0 : Date.now();
      clearInterval(tick); tick = setInterval(flushTime, 15000);
      if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean) && !padLoop) padLoop = requestAnimationFrame(pollPads);
      // in a race, puzzle games start on the room's level (your own saved progress only ever goes up)
      if (VS && o.vs && o.vs.levelKey) {
        const key = o.vs.levelKey, L = 1 + (VS.seed % (o.vs.levels || 10)), gi = Storage.prototype.getItem, si = Storage.prototype.setItem;
        Storage.prototype.getItem = function (k) { return k === key && this === localStorage ? String(L) : gi.call(this, k); };
        Storage.prototype.setItem = function (k, v) { if (k === key && this === localStorage) { const cur = +gi.call(this, k) || 1; if (+v > cur) si.call(this, k, v); return; } return si.call(this, k, v); };
      }
      setTimeout(() => onlineSetup(o), VS ? 0 : 400);
      return SJG;
    },
    /** Record a score. Returns { best, isBest, rank } (rank 1-based within the top 10, 0 if not in it). */
    score(v, mode = 'main') {
      if (VS && isFinite(v)) { if (vsFinal) vsFinal(v, mode); else vsQueue.push([v, mode]); }
      if (!id || !isFinite(v)) return { best: v, isBest: false, rank: 0 };
      const lower = !!opts.lower;
      const res = update(g => {
        const list = g.scores[mode] || (g.scores[mode] = []);
        const prev = list.length ? list[0].v : null;
        const entry = { v, t: Date.now() };
        list.push(entry);
        list.sort((a, b) => lower ? a.v - b.v : b.v - a.v);
        list.length = Math.min(list.length, 10);
        const rank = list.indexOf(entry) + 1;
        const isBest = rank === 1 && (prev === null || (lower ? v < prev : v > prev));
        return { best: list[0].v, isBest, rank };
      });
      if (res.isBest) { post({ type: 'best', mode, value: v }); }
      return res;
    },
    best(mode = 'main') { const g = load().games[id]; const l = g && g.scores && g.scores[mode]; return l && l.length ? l[0].v : null; },
    top(mode = 'main') { const g = load().games[id]; return (g && g.scores && g.scores[mode]) || []; },
    has(tid) { const g = load().games[id]; return !!(g && g.ach && g.ach[tid]); },
    /** Unlock a trophy (by id from init's list). Shows it once. */
    unlock(tid) {
      if (!id) return false;
      const def = (opts.trophies || []).find(t => t.id === tid) || { id: tid, name: tid, icon: '🏆' };
      const fresh = update(g => { if (g.ach[tid]) return false; g.ach[tid] = Date.now(); return true; });
      if (fresh) { toast('Trophy: ' + def.name, def.icon || '🏆'); post({ type: 'trophy', id: tid, name: def.name, desc: def.desc || '', icon: def.icon || '🏆' }); sfx('win'); }
      return fresh;
    },
    /** Add to a counter (lifetime) and return the new total. */
    stat(k, inc = 1) { return update(g => (g.stats[k] = (g.stats[k] || 0) + inc)); },
    getStat(k) { const g = load().games[id]; return (g && g.stats && g.stats[k]) || 0; },
    sfx, toast,
    mute(on) { muted = on === undefined ? !muted : !!on; try { localStorage.setItem('sjg.mute', muted ? '1' : '0'); } catch {} return muted; },
    get muted() { return muted; },
    /** Seeded random (mulberry32) for daily / repeatable levels. */
    rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    daySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); },
  };
  window.SJG = SJG;
})();
