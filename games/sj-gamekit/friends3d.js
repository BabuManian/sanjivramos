/* Play together in 3D games: everyone in the room sees everyone else's character (their SanjivramOS "look")
   running around live, with name tags. No host simulation — each player sends their own position ~12×/s.
   const F = await SJFriends.join({ game, gameName, join })   (opens the SanjivramOS lobby)
   F.send({x,y,z,yaw,walk,spd, ...extra}) every frame (throttled) · F.update(dt) · F.draw(R[, extra, keep]) · F.tags(R, box[, keep]) · F.list() · F.leave()
   F.seed (same for everyone; changes on rematch) · F.on('start', seed => …) · F.isHost · F.rematch()                   */
(() => {
  'use strict';
  if (window.SJFriends) return;
  const base = (document.currentScript && document.currentScript.src || '').replace(/friends3d\.js.*$/, '') || '../sj-gamekit/';
  const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function available() { if (!/^https?:$/.test(location.protocol)) return false; try { return (await fetch('/healthz', { cache: 'no-store' })).ok; } catch { return false; } }
  async function join(opts) {
    if (!window.SJNet) await load(base + 'net.js');
    const net = await SJNet.lobby(Object.assign({ max: 8, min: 1, settings: { p2p: true, hostGrace: 20000 } }, opts));
    const others = new Map(), h = {};
    const F = {
      net, seed: net.seed, get isHost() { return net.isHost; }, me: net.me,
      on(t, f) { (h[t] = h[t] || []).push(f); return F; },
      emit(t, ...a) { for (const f of h[t] || []) try { f(...a); } catch (e) { console.error(e); } },
      lastSend: 0,
      send(st, force) { const now = performance.now(); if (!force && now - F.lastSend < 80) return; F.lastSend = now; net.send({ f3: 1, s: pack(st) }, 'all'); },
      shout(data) { net.send({ f3: 2, d: data }, 'all'); },
      update(dt) {
        for (const o of others.values()) {
          const k = Math.min(1, dt * 12);
          for (const a of ['x', 'y', 'z']) o[a] += (o.t[a] - o[a]) * k;
          let dy = o.t.yaw - o.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); o.yaw += dy * k;
          o.walk += dt * 11 * Math.min(1, o.t.spd || 0);
        }
      },
      draw(R, extra, keep) { for (const o of others.values()) { if (o.t.dead || (keep && !keep(o))) continue; R.person(o.look, o.x, o.y, o.z, o.yaw, Object.assign({ walk: o.walk, speed: Math.min(1, o.t.spd || 0), groundY: o.t.gy == null ? o.y : o.t.gy }, extra ? extra(o) : {})); } },
      /** name tags as DOM labels over each character */
      tags(R, box, keep) {
        if (!box) return;
        const seen = new Set();
        for (const [id, o] of others) {
          seen.add(String(id));
          let el = box.querySelector(`[data-u="${id}"]`);
          if (!el) { el = document.createElement('div'); el.dataset.u = id; el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 12px system-ui;white-space:nowrap;pointer-events:none'; box.appendChild(el); }
          const p = R.project([o.x, o.y + 2.35, o.z]);
          el.style.display = p.vis && p.z < 60 && !o.t.dead && (!keep || keep(o)) ? '' : 'none';
          if (p.vis) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.opacity = String(Math.max(0.35, 1 - p.z / 60)); }
          const txt = o.name + (o.t.label ? ' · ' + o.t.label : ''); if (el.textContent !== txt) el.textContent = txt;
        }
        for (const el of [...box.children]) if (!seen.has(el.dataset.u)) el.remove();
      },
      list() { return [...others.values()]; },
      players() { return net.players(); },
      rematch() { return net.rematch(); },
      leave() { try { net.leave(); } catch {} others.clear(); },
    };
    const pack = st => { const o = {}; for (const k in st) o[k] = typeof st[k] === 'number' ? Math.round(st[k] * 100) / 100 : st[k]; return o; };
    const who = uid => net.players().find(m => m.id === uid) || (net.room ? net.room.members.find(m => m.id === uid) : null) || {};
    net.on('m', (d, from) => {
      if (!d || from === net.me.id) return;
      if (d.f3 === 2) { F.emit('shout', d.d, from, who(from)); return; }
      if (d.f3 !== 1) return;
      let o = others.get(from);
      const m = who(from);
      if (!o) { o = { id: from, x: d.s.x, y: d.s.y, z: d.s.z, yaw: d.s.yaw || 0, walk: 0, t: d.s, name: m.display || 'Player', look: m.look || null }; others.set(from, o); F.emit('join', o); }
      o.t = d.s; o.seen = performance.now(); if (m.look) o.look = m.look; if (m.display) o.name = m.display;
    });
    net.on('peer-left', d => { others.delete(d.uid); F.emit('left', d.uid); });
    net.on('start', d => { F.seed = d.seed; F.emit('start', d.seed); });
    net.on('room', () => F.emit('room'));
    setInterval(() => { for (const [id, o] of others) if (performance.now() - o.seen > 8000) others.delete(id); }, 2000);
    return F;
  }
  window.SJFriends = { join, available, esc };
})();
