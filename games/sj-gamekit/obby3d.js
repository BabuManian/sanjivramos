/* SanjivramOS 3D obstacle-course kit (used by Sky Obby and Lava Rise). Needs gl3d.js.
   const W = Obby3D.create({ R, input, look: () => look, onDie, onCheckpoint, onCoin, onPower })
   W.add({ k, b:[x0,y0,z0,x1,y1,z1], col, chunk, ... })  kinds:
     solid · kill (red, deadly) · move {axis:'x'|'y'|'z', amp, speed, phase} · vanish (falls away after you touch it)
     tramp {power} · conv {dir:[x,z], speed} · spin {len, speed, y} (deadly spinning bar, b = its hub) · laser {period, on} (deadly when on)
     cp {stage} checkpoint pad · coin · power {type}
   W.build(chunk?) makes the static meshes · W.update(dt) moves everything · W.render(env, extra) draws               */
(() => {
  'use strict';
  if (window.Obby3D) return;
  const { M, hex, dirOf, pushBox } = GL3D;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NOFLOOR = () => -1e9;   // no ground plane: fall off and you're out
  function create(o) {
    const R = o.R, IN = o.input;
    const objs = [], chunks = new Map();   // chunk id → {static:[...], dyn:[...], mesh, box}
    const P = Object.assign(GL3D.Body(0, 2, 0, 0.32, 1.8), { yaw: Math.PI, face: Math.PI, walk: 0, jumps: 0, coyote: 0, buffer: 0, dead: 0, on: null, air: 0 });
    const W = { objs, chunks, P, cam: { yaw: Math.PI, pitch: -0.32, dist: 7 }, t: 0, spawn: [0, 2, 0], doubleJump: false, speedMul: 1, jumpMul: 1, trail: null, trailPts: [], frozen: false };
    const chunkOf = id => { if (!chunks.has(id)) chunks.set(id, { id, stat: [], dyn: [], mesh: null, box: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], dirty: true }); return chunks.get(id); };
    W.add = ob => {
      ob.chunk = ob.chunk || 0; ob.cur = ob.b.slice(); ob.vis = 1; ob.t = 0;
      const c = chunkOf(ob.chunk);
      (ob.k === 'solid' || ob.k === 'kill' ? c.stat : c.dyn).push(ob); objs.push(ob);
      const bb = ob.k === 'spin' ? [ob.b[0] - ob.len, ob.b[1] - 1, ob.b[2] - ob.len, ob.b[3] + ob.len, ob.b[4] + 1, ob.b[5] + ob.len] : ob.k === 'move' ? grow(ob.b, ob.axis, ob.amp) : ob.b;
      for (let i = 0; i < 3; i++) { c.box[i] = Math.min(c.box[i], bb[i]); c.box[i + 3] = Math.max(c.box[i + 3], bb[i + 3]); }
      c.dirty = true; return ob;
    };
    const grow = (b, ax, a) => { const i = { x: 0, y: 1, z: 2 }[ax]; const g = b.slice(); g[i] -= a; g[i + 3] += a; return g; };
    W.dropChunk = id => { const c = chunks.get(id); if (!c) return; if (c.mesh && R) R.gl.deleteBuffer(c.mesh.b); chunks.delete(id); for (let i = objs.length - 1; i >= 0; i--) if (objs[i].chunk === id) objs.splice(i, 1); };
    W.clear = () => { for (const id of [...chunks.keys()]) W.dropChunk(id); W.trailPts = []; };
    W.build = () => {
      if (!R) { for (const c of chunks.values()) c.dirty = false; return; }
      for (const c of chunks.values()) if (c.dirty) {
        const a = [];
        for (const ob of c.stat) { const b = ob.b; pushBox(a, b[0], b[1], b[2], b[3], b[4], b[5], ob.col || (ob.k === 'kill' ? '#ef4444' : '#94a3b8')); if (ob.k === 'solid' && ob.trim !== false && b[4] - b[1] < 3) pushBox(a, b[0] - 0.02, b[4] - 0.08, b[2] - 0.02, b[3] + 0.02, b[4] + 0.01, b[5] + 0.02, ob.trim || shade(ob.col || '#94a3b8', 0.18)); }
        if (c.mesh) R.gl.deleteBuffer(c.mesh.b);
        c.mesh = a.length ? R.mesh(a) : null; c.dirty = false;
      }
    };
    function shade(h, k) { const c = typeof h === 'string' ? hex(h) : h; return c.map(v => clamp(v + (1 - v) * k, 0, 1)); }
    const near = (c, x, y, z, r) => x > c.box[0] - r && x < c.box[3] + r && z > c.box[2] - r && z < c.box[5] + r && y > c.box[1] - r && y < c.box[4] + r;

    /* ---------- dynamic objects ---------- */
    function animate(dt) {
      W.t += dt;
      for (const c of chunks.values()) for (const ob of c.dyn) {
        const b = ob.b, cur = ob.cur;
        if (ob.k === 'move') { const i = { x: 0, y: 1, z: 2 }[ob.axis], off = Math.sin(W.t * ob.speed + (ob.phase || 0)) * ob.amp; ob.dx = ob.dy = ob.dz = 0; const prev = cur[i]; for (let k = 0; k < 6; k++) cur[k] = b[k]; cur[i] += off; cur[i + 3] += off; ob['d' + ob.axis] = cur[i] - prev; }
        if (ob.k === 'vanish') { if (ob.touched) { ob.t += dt; ob.vis = ob.t < 0.55 ? 1 - ob.t / 0.55 * 0.5 : 0; if (ob.t > 3.2) { ob.touched = false; ob.t = 0; ob.vis = 1; } } }
        if (ob.k === 'laser') ob.vis = ((W.t + (ob.phase || 0)) % ob.period) < ob.period * (ob.on || 0.5) ? 1 : 0;
        if (ob.k === 'spin') ob.ang = W.t * ob.speed + (ob.phase || 0);
        if (ob.k === 'coin' || ob.k === 'power') ob.ang = W.t * 2.5;
      }
    }
    function solidsNear(x, y, z) {
      const out = [];
      for (const c of chunks.values()) { if (!near(c, x, y, z, 4)) continue;
        for (const ob of c.stat) if (ob.k === 'solid' && Math.abs((ob.b[0] + ob.b[3]) / 2 - x) < (ob.b[3] - ob.b[0]) / 2 + 3 && Math.abs((ob.b[2] + ob.b[5]) / 2 - z) < (ob.b[5] - ob.b[2]) / 2 + 3) out.push(ob.b);
        for (const ob of c.dyn) if ((ob.k === 'move' || ob.k === 'tramp' || ob.k === 'conv' || ob.k === 'cp' || (ob.k === 'vanish' && ob.vis > 0.4))) { const k = ob.cur; if (x > k[0] - 3 && x < k[3] + 3 && z > k[2] - 3 && z < k[5] + 3) { k.ob = ob; out.push(k); } }
      }
      return out;
    }
    function deadly(x, y, z) {
      const pb = [x - P.r * 0.8, y + 0.05, z - P.r * 0.8, x + P.r * 0.8, y + P.h - 0.1, z + P.r * 0.8];
      const hit = b => pb[0] < b[3] && pb[3] > b[0] && pb[1] < b[4] + 0.06 && pb[4] > b[1] && pb[2] < b[5] && pb[5] > b[2];
      for (const c of chunks.values()) { if (!near(c, x, y, z, 6)) continue;
        for (const ob of c.stat) if (ob.k === 'kill' && hit(ob.b)) return true;
        for (const ob of c.dyn) {
          if (ob.k === 'laser' && ob.vis && hit(ob.b)) return true;
          if (ob.k === 'spin') { const cx = (ob.b[0] + ob.b[3]) / 2, cz = (ob.b[2] + ob.b[5]) / 2, by = ob.y; if (y > by + 0.25 || y + P.h < by - 0.25) continue; const ex = Math.cos(ob.ang), ez = Math.sin(ob.ang), px = x - cx, pz = z - cz, t = clamp(px * ex + pz * ez, -ob.len, ob.len); if (Math.hypot(px - ex * t, pz - ez * t) < 0.32 + P.r) return true; }
        }
      }
      return false;
    }

    /* ---------- the player ---------- */
    W.update = (dt, inp) => {
      animate(dt);
      if (W.frozen) return [];
      const ev = [];
      if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0) respawn(); return ev; }
      // parkour: climbing over a ledge takes a moment
      if (P.climb) { const c = P.climb; c.t += dt; const k = Math.min(1, c.t / c.d), e = k * k * (3 - 2 * k); P.y = c.from[1] + (c.to[1] - c.from[1]) * Math.min(1, e * 1.5); P.x = c.from[0] + (c.to[0] - c.from[0]) * e; P.z = c.from[2] + (c.to[2] - c.from[2]) * e; P.vy = 0; if (k >= 1) { P.climb = null; P.y = c.to[1]; P.ground = true; } return ev; }
      // ride moving platforms
      if (P.on && P.on.k === 'move') { P.x += P.on.dx || 0; P.y += P.on.dy || 0; P.z += P.on.dz || 0; }
      if (P.on && P.on.k === 'conv') { P.x += P.on.dir[0] * P.on.speed * dt; P.z += P.on.dir[1] * P.on.speed * dt; }
      const f = dirOf(W.cam.yaw), rx = Math.cos(W.cam.yaw), rz = -Math.sin(W.cam.yaw);
      let mx = rx * inp.mx + f[0] * -inp.mz, mz = rz * inp.mx + f[2] * -inp.mz; const ml = Math.hypot(mx, mz);
      const spd = 7.2 * W.speedMul * (inp.run ? 1.25 : 1);
      if (ml > 0.05) { mx /= Math.max(1, ml); mz /= Math.max(1, ml); P.face = Math.atan2(-mx, -mz); P.walk += dt * 11; }
      const accel = P.ground ? 14 : 6;
      P.vx += (mx * spd - P.vx) * Math.min(1, dt * accel); P.vz += (mz * spd - P.vz) * Math.min(1, dt * accel);
      // jumping: coyote time + jump buffering + optional double jump
      P.coyote = P.ground ? 0.12 : Math.max(0, P.coyote - dt);
      P.buffer = inp.jump ? 0.14 : Math.max(0, P.buffer - dt);
      if (P.ground) { P.jumps = 0; P.bounced = false; }
      if (P.buffer > 0 && (P.coyote > 0 || (W.doubleJump && P.jumps < 2 && !P.ground))) { P.vy = 9.6 * W.jumpMul; P.buffer = 0; P.coyote = 0; P.jumps = P.ground || P.jumps === 0 ? 1 : 2; ev.push('jump'); GL3D.tone(P.jumps === 2 ? 520 : 300, 0.09, 'triangle', 0.04, P.jumps === 2 ? 900 : 560); }
      if (!inp.jumpHeld && P.vy > 3 && !P.bounced && !P.wallT) P.vy -= 30 * dt;   // short hop when you let go (not on trampolines)
      if (W.parkour) parkour(dt, inp, mx, mz, ml, ev);
      const wasGround = P.ground, vyBefore = P.vy;
      GL3D.moveBody(P, dt, solidsNear(P.x, P.y, P.z), NOFLOOR, 26);
      // what are we standing on?
      P.on = null;
      if (P.ground) for (const k of solidsNear(P.x, P.y, P.z)) if (Math.abs(k[4] - P.y) < 0.06 && P.x + P.r > k[0] && P.x - P.r < k[3] && P.z + P.r > k[2] && P.z - P.r < k[5]) { P.on = k.ob || null; if (k.ob) break; }
      if (P.ground && !wasGround && vyBefore < -6) { ev.push('land'); GL3D.noise(0.05, 0.03, 1500); }
      const on = P.on;
      if (on) {
        if (on.k === 'tramp') { P.vy = on.power || 17; P.ground = false; P.bounced = true; ev.push('bounce'); GL3D.tone(220, 0.25, 'sine', 0.06, 880); }
        if (on.k === 'vanish' && !on.touched) { on.touched = true; on.t = 0; GL3D.tone(700, 0.05, 'square', 0.03); }
        if (on.k === 'cp' && W.cpStage !== on.stage && (W.cpStage == null || on.stage > W.cpStage)) { W.cpStage = on.stage; W.spawn = [(on.cur[0] + on.cur[3]) / 2, on.cur[4], (on.cur[2] + on.cur[5]) / 2]; ev.push('cp'); o.onCheckpoint && o.onCheckpoint(on.stage); }
      }
      // coins / power-ups
      for (const c of chunks.values()) { if (!near(c, P.x, P.y, P.z, 2)) continue; for (const ob of c.dyn) if ((ob.k === 'coin' || ob.k === 'power') && !ob.taken && Math.abs((ob.b[0] + ob.b[3]) / 2 - P.x) < 0.9 && Math.abs((ob.b[2] + ob.b[5]) / 2 - P.z) < 0.9 && P.y + 1 > ob.b[1] - 0.6 && P.y < ob.b[4] + 0.4) { ob.taken = true; if (ob.k === 'coin') { o.onCoin && o.onCoin(ob); GL3D.tone(988, 0.06, 'square', 0.04); setTimeout(() => GL3D.tone(1319, 0.1, 'square', 0.04), 70); } else { o.onPower && o.onPower(ob); GL3D.tone(500, 0.3, 'square', 0.05, 1200); } } }
      if ((!W.god && deadly(P.x, P.y, P.z)) || P.y < (W.killY != null ? W.killY : W.spawn[1] - 30)) die();
      P.yaw += Math.atan2(Math.sin(P.face - P.yaw), Math.cos(P.face - P.yaw)) * Math.min(1, dt * 14);
      P.air = P.ground ? 0 : P.air + dt;
      if (W.trail && Math.hypot(P.vx, P.vz) > 1) { W.trailPts.push([P.x, P.y + 0.3, P.z, 1]); if (W.trailPts.length > 40) W.trailPts.shift(); }
      for (const t of W.trailPts) t[3] -= dt * 1.6; W.trailPts = W.trailPts.filter(t => t[3] > 0);
      return ev;
    };
    /* ---------- parkour moves (W.parkour = true): slide, vault/mantle, wall-run + wall-jump ---------- */
    function parkour(dt, inp, mx, mz, ml, ev) {
      const boxes = solidsNear(P.x, P.y, P.z);
      const inBox = (x, y, z) => boxes.find(b => x > b[0] && x < b[3] && z > b[2] && z < b[5] && y > b[1] && y < b[4]);
      const hs = Math.hypot(P.vx, P.vz);
      if (inp.slide && P.ground && !(P.slideT > 0)) {   // works from a standstill too (in the direction you're pushing / facing)
        const d = hs > 1 ? [P.vx / hs, P.vz / hs] : ml > 0.1 ? [mx / ml, mz / ml] : [-Math.sin(P.face), -Math.cos(P.face)], v = Math.max(hs, 9.5);
        P.slideT = 0.8; P.slideV = [d[0] * v, d[1] * v]; P.h = 0.9; ev.push('slide'); GL3D.noise(0.4, 0.04, 1200);
      }
      if (P.slideT > 0) { P.slideT -= dt; const k = Math.max(0.55, P.slideT / 0.8); P.vx = P.slideV[0] * k; P.vz = P.slideV[1] * k; if (P.slideT <= 0) { if (inBox(P.x, P.y + 1.3, P.z)) P.slideT = 0.05; else P.h = 1.8; } return; }
      if (ml > 0.3) {   // a ledge in front: vault it from the ground, mantle it from the air
        const px = P.x + mx / ml * (P.r + 0.35), pz = P.z + mz / ml * (P.r + 0.35);
        for (const b of boxes) {
          if (!(px > b[0] && px < b[3] && pz > b[2] && pz < b[5])) continue;
          const up = b[4] - P.y, lim = P.ground ? 1.15 : 2.6;
          if (up > 0.45 && up < lim && !inBox(px, b[4] + 1, pz) && (P.ground || P.vy < 7)) { P.climb = { t: 0, d: P.ground ? 0.22 : 0.4, from: [P.x, P.y, P.z], to: [px + mx / ml * 0.3, b[4], pz + mz / ml * 0.3] }; P.wallT = 0; ev.push(P.ground ? 'vault' : 'mantle'); GL3D.tone(P.ground ? 380 : 260, 0.12, 'triangle', 0.04, 520); return; }
        }
      }
      if (!P.ground && hs > 4.5 && ml > 0.3) {   // wall-run
        const rxs = -P.vz / hs, rzs = P.vx / hs; let side = 0;
        for (const sd of [1, -1]) { const b = inBox(P.x + rxs * sd * (P.r + 0.32), P.y + 0.9, P.z + rzs * sd * (P.r + 0.32)); if (b && b[4] > P.y + 1.4) { side = sd; break; } }
        if (side) {
          if (!P.wallT) { P.wallT = 0.001; P.vy = Math.max(P.vy, 2.5); ev.push('wallrun'); GL3D.noise(0.3, 0.03, 2500); }
          P.wallT += dt; P.wallSide = side; const nx = -rxs * side, nz = -rzs * side;
          if (P.wallT < 1.5) P.vy = Math.max(P.vy, -0.8 - P.wallT * 1.2);
          if (inp.jump) { P.vy = 9.4; P.vx += nx * 6.5; P.vz += nz * 6.5; P.wallT = 0; P.jumps = 1; P.buffer = 0; ev.push('walljump'); GL3D.tone(420, 0.1, 'triangle', 0.05, 760); }
        } else P.wallT = 0;
      } else if (P.ground) P.wallT = 0;
    }
    function die() { if (P.dead > 0) return; P.dead = 0.6; P.vx = P.vy = P.vz = 0; W.deathAt = [P.x, P.y, P.z]; GL3D.tone(200, 0.3, 'sawtooth', 0.06, 70); o.onDie && o.onDie(); }
    function respawn() { P.climb = null; P.slideT = 0; P.h = 1.8; P.wallT = 0; P.x = W.spawn[0]; P.y = W.spawn[1] + 0.05; P.z = W.spawn[2]; P.vx = P.vy = P.vz = 0; P.on = null; W.trailPts = []; for (const ob of objs) if (ob.k === 'vanish') { ob.touched = false; ob.vis = 1; ob.t = 0; } }
    W.die = die; W.respawn = respawn;
    W.place = (x, y, z) => { P.x = x; P.y = y; P.z = z; P.vx = P.vy = P.vz = 0; W.spawn = [x, y, z]; };

    /* ---------- camera ---------- */
    W.camera = (inp, dt) => {
      const fp = GL3D.view.fp;
      W.cam.yaw -= inp.lookX * 0.0042; W.cam.pitch = clamp(W.cam.pitch - inp.lookY * 0.0036, fp ? -1.45 : -1.25, fp ? 1.3 : 0.5);
      if (fp) { P.face = W.cam.yaw; return { eye: [P.x, P.y + 1.62, P.z], yaw: W.cam.yaw, pitch: W.cam.pitch, fov: 1.25, far: 260, fp: true }; }
      if (inp.wheel) W.cam.dist = clamp(W.cam.dist + inp.wheel * 0.7, 3, 14);
      const tgt = [P.x, P.y + 1.4, P.z], f = dirOf(W.cam.yaw, W.cam.pitch), d = W.cam.dist;
      return { eye: [tgt[0] - f[0] * d, tgt[1] - f[1] * d + 0.5, tgt[2] - f[2] * d], yaw: W.cam.yaw, pitch: W.cam.pitch - 0.06, fov: 1.15, far: 260 };
    };

    /* ---------- drawing ---------- */
    W.render = (cam, env, extra) => {
      if (!R) return;
      W.build();
      R.begin(cam, env);
      const ex = cam.eye[0], ez = cam.eye[2], ey = cam.eye[1], viewD = env.view || 140;
      for (const c of chunks.values()) {
        const cx = clamp(ex, c.box[0], c.box[3]), cy = clamp(ey, c.box[1], c.box[4]), cz = clamp(ez, c.box[2], c.box[5]);
        if (Math.hypot(cx - ex, cy - ey, cz - ez) > viewD) continue;
        if (c.mesh) R.draw(c.mesh);
        for (const ob of c.dyn) drawDyn(ob);
        for (const ob of c.stat) if (ob.k === 'kill' && ob.glow !== false && Math.hypot((ob.b[0] + ob.b[3]) / 2 - ex, (ob.b[2] + ob.b[5]) / 2 - ez) < 40) R.glow([(ob.b[0] + ob.b[3]) / 2, ob.b[4] + 0.1, (ob.b[2] + ob.b[5]) / 2], Math.max(ob.b[3] - ob.b[0], ob.b[5] - ob.b[2]) * 0.7, [1, 0.25, 0.15], 0.22);
      }
      if (extra) extra(R);
      // you
      if (cam.fp) {}
      else if (P.dead <= 0) R.person(o.look ? o.look() : null, P.x, P.y, P.z, P.yaw, { walk: P.ground ? P.walk : 0, speed: Math.min(1, Math.hypot(P.vx, P.vz) / 5), groundY: groundBelow(), swing: !P.ground && P.jumps === 2 ? Math.min(1, P.air * 3) : 0 });
      else for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, k = 0.6 - P.dead; R.cube(M.chain(M.T(W.deathAt[0] + Math.cos(a) * k * 3, W.deathAt[1] + 1 + Math.sin(i) * k, W.deathAt[2] + Math.sin(a) * k * 3), M.S(0.25)), '#f8fafc', 1, 0.6); }
      if (W.trail) for (const t of W.trailPts) R.glow([t[0], t[1], t[2]], 0.35 + t[3] * 0.3, typeof W.trail === 'function' ? W.trail(t) : W.trail, t[3] * 0.8);
      R.end();
      if (cam.fp) { if (P.dead <= 0) R.viewModel(cam, { walk: P.walk, speed: P.ground ? Math.min(1, Math.hypot(P.vx, P.vz) / 5) : 0, sleeve: (o.look && o.look() && o.look().shirt) || '#3b82f6', skin: (o.look && o.look() && o.look().skin) || '#f8c9a0' }); }
    };
    function groundBelow() { let best = -1e9; for (const k of solidsNear(P.x, P.y, P.z)) if (P.x > k[0] && P.x < k[3] && P.z > k[2] && P.z < k[5] && k[4] <= P.y + 0.05 && k[4] > best) best = k[4]; return best > -1e8 ? best : P.y - 50; }
    function drawDyn(ob) {
      const c = ob.cur, col = ob.col;
      switch (ob.k) {
        case 'move': R.box(c[0], c[1], c[2], c[3], c[4], c[5], col || '#38bdf8'); R.box(c[0] - 0.02, c[4] - 0.08, c[2] - 0.02, c[3] + 0.02, c[4] + 0.01, c[5] + 0.02, '#e0f2fe'); break;
        case 'vanish': if (ob.vis > 0) R.box(c[0], c[1] - (1 - ob.vis) * 0.6, c[2], c[3], c[4] - (1 - ob.vis) * 0.6, c[5], col || '#fde68a', ob.vis < 1 ? Math.max(0.15, ob.vis) : 1); break;
        case 'tramp': R.box(c[0], c[1], c[2], c[3], c[4] - 0.15, c[5], '#334155'); R.box(c[0] + 0.1, c[4] - 0.15, c[2] + 0.1, c[3] - 0.1, c[4], c[5] - 0.1, col || '#22c55e', 1, 0.35); R.glow([(c[0] + c[3]) / 2, c[4] + 0.2, (c[2] + c[5]) / 2], 1.2, [0.3, 1, 0.5], 0.25); break;
        case 'conv': { R.box(c[0], c[1], c[2], c[3], c[4], c[5], '#475569'); const n = 6, off = (W.t * ob.speed * 0.5) % 1; for (let i = 0; i < n; i++) { const k = (i + off) / n; const x = c[0] + (c[3] - c[0]) * (ob.dir[0] ? k : 0.5), z = c[2] + (c[5] - c[2]) * (ob.dir[1] ? k : 0.5); R.cube(M.chain(M.T(x, c[4] + 0.02, z), M.RY(Math.atan2(-ob.dir[0], -ob.dir[1])), M.S(0.5, 0.04, 0.25)), '#facc15', 1, 0.6); } break; }
        case 'spin': { const cx = (ob.b[0] + ob.b[3]) / 2, cz = (ob.b[2] + ob.b[5]) / 2; R.box(cx - 0.25, ob.b[1], cz - 0.25, cx + 0.25, ob.y + 0.3, cz + 0.25, '#334155'); R.cube(M.chain(M.T(cx, ob.y, cz), M.RY(-ob.ang), M.S(ob.len * 2, 0.35, 0.35)), col || '#ef4444', 1, 0.45); R.glow([cx + Math.cos(ob.ang) * ob.len, ob.y, cz + Math.sin(ob.ang) * ob.len], 0.9, [1, 0.3, 0.2], 0.5); R.glow([cx - Math.cos(ob.ang) * ob.len, ob.y, cz - Math.sin(ob.ang) * ob.len], 0.9, [1, 0.3, 0.2], 0.5); break; }
        case 'laser': { const on = ob.vis; R.box(c[0], c[1], c[2], c[3], c[4], c[5], on ? (col || '#f43f5e') : '#3f3f46', on ? 0.85 : 0.25, on ? 1 : 0); if (on) R.glow([(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, (c[2] + c[5]) / 2], 1.6, [1, 0.2, 0.35], 0.4); break; }
        case 'cp': { const reached = W.cpStage != null && ob.stage <= W.cpStage; R.box(c[0], c[1], c[2], c[3], c[4], c[5], reached ? '#16a34a' : '#64748b'); R.box(c[0] + 0.2, c[4], c[2] + 0.2, c[3] - 0.2, c[4] + 0.05, c[5] - 0.2, reached ? '#4ade80' : '#cbd5e1', 1, 0.5); const px = c[3] - 0.4, pz = c[2] + 0.4; R.box(px - 0.06, c[4], pz - 0.06, px + 0.06, c[4] + 2.6, pz + 0.06, '#e5e7eb'); R.cube(M.chain(M.T(px - 0.5, c[4] + 2.2 + Math.sin(W.t * 3) * 0.03, pz), M.RY(Math.sin(W.t * 2) * 0.2), M.S(0.9, 0.55, 0.05)), reached ? '#22c55e' : '#f97316', 1, 0.3); if (!reached) R.glow([(c[0] + c[3]) / 2, c[4] + 0.4, (c[2] + c[5]) / 2], 1.8, [1, 0.6, 0.2], 0.3); break; }
        case 'coin': if (!ob.taken) { const x = (c[0] + c[3]) / 2, y = (c[1] + c[4]) / 2 + Math.sin(ob.ang * 1.3) * 0.12, z = (c[2] + c[5]) / 2; R.cube(M.chain(M.T(x, y, z), M.RY(ob.ang), M.S(0.5, 0.5, 0.12)), '#facc15', 1, 0.5); R.glow([x, y, z], 0.9, [1, 0.8, 0.2], 0.45); } break;
        case 'power': if (!ob.taken) { const x = (c[0] + c[3]) / 2, y = (c[1] + c[4]) / 2 + Math.sin(ob.ang) * 0.15, z = (c[2] + c[5]) / 2; R.cube(M.chain(M.T(x, y, z), M.RY(ob.ang), M.RX(0.6), M.S(0.55)), col || '#a855f7', 1, 0.7); R.glow([x, y, z], 1.4, hex(col || '#a855f7'), 0.6); } break;
      }
    }
    return W;
  }
  window.Obby3D = { create };
})();
