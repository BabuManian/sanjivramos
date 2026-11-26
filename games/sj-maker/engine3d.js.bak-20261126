/* Game Maker — 3D games. The level grid you paint is the map seen from above; it becomes a 3D world:
   . floor   O hole (fall!)   # block (jump on it)   = tall wall   - raised ledge   I ice floor   B crumbling floor
   W water (low floor)   L lava   S spikes   J spring   X checkpoint   G goal   C coin   K key   D locked door
   H extra life   N sign   E spinning bar   F lift (goes up and down)   Z laser fence   T teleporter   P start
   MakerEngine3D.run(playElement, game, { hud, sign, onWin, onLose, onPos, ghosts, sfx, countdown, startLevel, nogl }) */
(() => {
  'use strict';
  const G3 = window.GL3D, { M } = G3;
  const T = 2;   // world units per tile
  const TILE_COL = { r: '#6b7280', w: '#b45309', m: '#94a3b8', a: '#fcd34d', q: '#bae6fd', u: '#facc15', R: '#ef4444', h: '#a16207', '.': '#7c9a5e', I: '#bae6fd', W: '#2563eb', '#': '#a16207', '=': '#78716c', '-': '#f59e0b', X: '#22c55e', S: '#9ca3af', D: '#7c2d12' };
  const SKIES = [
    { skyTop: '#2563eb', skyHorizon: '#bfdbfe', clouds: 0.6 }, { skyTop: '#9a3412', skyHorizon: '#fde68a', clouds: 0.5, sunGlow: [1, 0.6, 0.3] },
    { skyTop: '#020617', skyHorizon: '#312e81', stars: 1, amb: [0.25, 0.27, 0.4], sunCol: [0.3, 0.32, 0.5] }, { skyTop: '#1c1917', skyHorizon: '#44403c', amb: [0.3, 0.28, 0.26], sunCol: [0.35, 0.3, 0.25] },
    { skyTop: '#000000', skyHorizon: '#0f172a', stars: 1, amb: [0.28, 0.3, 0.45], sunCol: [0.4, 0.42, 0.6] }, { skyTop: '#db2777', skyHorizon: '#fce7f3', clouds: 0.5, cloudCol: [1, 0.9, 0.95] },
    { skyTop: '#14532d', skyHorizon: '#bbf7d0', clouds: 0.4 }, { skyTop: '#94a3b8', skyHorizon: '#f8fafc', clouds: 0.8 },
  ];
  function example() {
    const rows = [
      'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
      'O.P....C...OOOO....C....#.C..O',
      'O.......N..OOOO.........#....O',
      'O..........J..........E......O',
      'O.....###..OOOO....C.........O',
      'O..C..#C#..OOOOLLLLL...C.....O',
      'O.....###..OOOO..........X...O',
      'OOOO.OOOOOOOOOO..==D==..OOOOOO',
      'OOOO.OOOOOOOOOO..=...=..OOOOOO',
      'O....--...BBBB...=.G.=..ZZZ..O',
      'O.K.......BBBB...=====.....C.O',
      'O....F....OOOO..........H....O',
      'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
    ];
    const w = rows[0].length;
    return { v: 1, title: 'Sky Steps 3D', template: '3d', settings: { gravity: 1, speed: 2, jump: 2, doubleJump: false, lives: 3, timer: 0, win: 'goal', stomp: false, shoot: false, theme: 0, enemySpeed: 2 }, sprites: {},
      levels: [{ w, h: rows.length, tiles: rows.join(''), signs: { [2 * w + 8]: 'WASD to move, Space to jump, drag the mouse to look around.\nFind the key 🔑 to open the castle door!' } }] };
  }
  // looks for the characters you can talk to (same format as SanjivramOS avatars; missing fields use the defaults)
  const NPC_LOOK = { n: { shirt: '#2563eb', pants: '#1f2937', hair: '#78350f' }, z: { shirt: '#7c3aed', pants: '#5b21b6', hair: '#e5e7eb' }, '@': { shirt: '#94a3b8', pants: '#475569', skin: '#cbd5e1', hair: '#64748b' }, k: { shirt: '#94a3b8', pants: '#334155', hair: '#cbd5e1' } };
  function run(host, game, o = {}) {
    const cv = document.createElement('canvas'); cv.className = 'pc3d'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    host.insertBefore(cv, host.firstChild);
    const tags = document.createElement('div'); tags.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; host.insertBefore(tags, cv.nextSibling);
    let R = null; if (!o.nogl) try { R = G3.create(cv, { maxDpr: 1.5 }); } catch (e) { console.warn(e); }
    const IN = G3.Input(cv);
    const set = Object.assign({ speed: 2, jump: 2, lives: 3, timer: 0, win: 'goal', theme: 0, enemySpeed: 2, doubleJump: false }, game.settings || {});
    const input = { l: false, r: false, u: false, d: false, a: false, b: false, aPressed: false, bPressed: false };
    let li = o.startLevel || 0, W = null, coins = 0, totalCoins = 0, keys = 0, lives = set.lives || Infinity, deaths = 0, levelT = 0, totalT = 0, state = 'count', countT = o.countdown || 0, raf = 0, last = performance.now(), doors = [], teles = [], signs = [], npcs = [], tpCool = 0, speedT = 0, timeLeft = 0, signShown = null;
    const look = () => window.SJLook ? SJLook.cached : null;
    function loadLevel(i) {
      li = i; const L = game.levels[i]; doors = []; teles = []; signs = []; npcs = []; speedT = 0; keys = 0; levelT = 0; timeLeft = set.timer || 0;
      if (W) W.clear();
      W = Obby3D.create({ R, input: IN, look, onDie, onCoin: () => { coins++; o.sfx && o.sfx('coin'); }, onPower, onCheckpoint: () => o.sfx && o.sfx('power') });
      W.speedMul = [0.75, 0.75, 1, 1.3][set.speed] || 1; W.jumpMul = [0.85, 0.85, 1, 1.15][set.jump] || 1; W.doubleJump = !!set.doubleJump;
      let start = [T / 2, 0, T / 2], cpN = 0; totalCoins = 0; coins = 0;
      const espd = [0.8, 0.8, 1.4, 2.2][set.enemySpeed] || 1.4;
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const ch = L.tiles[y * L.w + x], x0 = x * T, z0 = y * T, x1 = x0 + T, z1 = z0 + T, cx = x0 + T / 2, cz = z0 + T / 2, chunk = Math.floor(y / 6);
        const floor = (top = 0, col) => W.add({ k: 'solid', b: [x0, top - 1, z0, x1, top, z1], col: col || ((x + y) % 2 ? '#7c9a5e' : '#86a868'), chunk });
        switch (ch) {
          case 'O': break;
          case '#': W.add({ k: 'solid', b: [x0, -1, z0, x1, 1.2, z1], col: TILE_COL['#'], chunk }); break;
          case '=': W.add({ k: 'solid', b: [x0, -1, z0, x1, 3.6, z1], col: TILE_COL['='], chunk }); break;
          case '-': floor(); W.add({ k: 'solid', b: [x0, 1.6, z0, x1, 2.1, z1], col: TILE_COL['-'], chunk }); break;
          case 'I': floor(0, TILE_COL.I); break;
          case 'W': floor(-0.5, TILE_COL.W); break;
          case 'B': W.add({ k: 'vanish', b: [x0, -0.6, z0, x1, 0, z1], col: '#fde68a', chunk }); break;
          case 'L': W.add({ k: 'kill', b: [x0, -1, z0, x1, 0.05, z1], col: '#f97316', chunk }); break;
          case 'S': floor(); W.add({ k: 'kill', b: [x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, 0.45, z1 - 0.2], col: '#9ca3af', chunk, glow: false }); break;
          case 'J': W.add({ k: 'tramp', b: [x0, -0.6, z0, x1, 0, z1], chunk, power: 16 }); break;
          case 'X': W.add({ k: 'cp', b: [x0, -0.8, z0, x1, 0, z1], chunk, stage: ++cpN }); break;
          case 'F': W.add({ k: 'move', b: [x0, -0.6, z0, x1, 0, z1], chunk, axis: 'y', amp: 1.6, speed: espd * 0.8, phase: x + y }); break;
          case 'G': floor(); W.add({ k: 'power', b: [cx - 0.5, 0.6, cz - 0.5, cx + 0.5, 1.6, cz + 0.5], chunk, type: 'goal', col: '#facc15' }); break;
          case 'C': floor(); W.add({ k: 'coin', b: [cx - 0.3, 0.6, cz - 0.3, cx + 0.3, 1.2, cz + 0.3], chunk }); totalCoins++; break;
          case 'H': floor(); W.add({ k: 'power', b: [cx - 0.3, 0.6, cz - 0.3, cx + 0.3, 1.4, cz + 0.3], chunk, type: 'heart', col: '#ef4444' }); break;
          case 'K': floor(); W.add({ k: 'power', b: [cx - 0.3, 0.6, cz - 0.3, cx + 0.3, 1.4, cz + 0.3], chunk, type: 'key', col: '#fde047' }); break;
          case 'D': floor(); { const id = 'door' + doors.length; W.add({ k: 'solid', b: [x0, 0, z0, x1, 3.6, z1], col: TILE_COL.D, chunk: id, trim: '#fbbf24' }); doors.push({ id, x: cx, z: cz }); } break;
          case 'N': floor(); W.add({ k: 'solid', b: [cx - 0.08, 0, cz - 0.08, cx + 0.08, 1.4, cz + 0.08], col: '#78350f', chunk, trim: false }); W.add({ k: 'solid', b: [cx - 0.6, 1.1, cz - 0.06, cx + 0.6, 1.7, cz + 0.06], col: '#d6a756', chunk, trim: false }); signs.push({ x: cx, z: cz, text: (L.signs || {})[y * L.w + x] || '' }); break;
          case 'E': floor(); W.add({ k: 'spin', b: [cx - 0.1, 0, cz - 0.1, cx + 0.1, 1, cz + 0.1], chunk, len: T * 0.9, speed: espd, y: 0.55, phase: x * 1.3 + y }); break;
          case 'Z': floor(); W.add({ k: 'laser', b: [x0, 0, cz - 0.1, x1, 2, cz + 0.1], chunk, period: 2.4 / espd * 1.4, on: 0.45, phase: x * 0.3 }); break;
          case 'T': floor(0, '#6d28d9'); teles.push({ x: cx, z: cz }); break;
          case 'P': floor(); start = [cx, 0.05, cz]; break;
          case 'r': case 'w': case 'm': case 'a': case 'q': case 'u': case 'R': case 'h': W.add({ k: 'solid', b: [x0, -1, z0, x1, 1.2, z1], col: TILE_COL[ch], chunk }); break;
          case 'U': floor(0, '#3b82f6'); break;
          case '!': floor(0, '#ef4444'); break;
          case 'c': floor(); W.add({ k: 'solid', b: [x0, 1.6, z0, x1, 2.1, z1], col: '#f8fafc', chunk }); break;
          case '?': W.add({ k: 'solid', b: [x0, -1, z0, x1, 1.2, z1], col: '#f59e0b', chunk }); W.add({ k: 'coin', b: [cx - 0.3, 1.7, cz - 0.3, cx + 0.3, 2.3, cz + 0.3], chunk }); totalCoins++; break;
          case '>': case '<': W.add({ k: 'conv', b: [x0, -1, z0, x1, 0, z1], chunk, dir: [ch === '>' ? 1 : -1, 0], speed: 3 }); break;
          case 'M': W.add({ k: 'move', b: [x0, -0.6, z0, x1, 0, z1], chunk, axis: 'x', amp: 3, speed: espd * 0.6, phase: x + y }); break;
          case 'V': W.add({ k: 'move', b: [x0, -0.6, z0, x1, 0, z1], chunk, axis: 'y', amp: 1.6, speed: espd * 0.8, phase: x + y }); break;
          case '$': floor(); W.add({ k: 'coin', b: [cx - 0.3, 0.6, cz - 0.3, cx + 0.3, 1.2, cz + 0.3], chunk }); totalCoins++; break;
          case '+': case 'j': case 's': case 'b': case '0': floor(); W.add({ k: 'power', b: [cx - 0.3, 0.6, cz - 0.3, cx + 0.3, 1.4, cz + 0.3], chunk, type: { '+': 'star', j: 'wings', s: 'speed', b: 'blaster', 0: 'shield' }[ch], col: { '+': '#fde047', j: '#f8fafc', s: '#ef4444', b: '#475569', 0: '#38bdf8' }[ch] }); break;
          case 'e': case 'i': floor(); W.add({ k: 'kill', b: [x0 + 0.3, 0, z0 + 0.3, x1 - 0.3, 0.7, z1 - 0.3], col: ch === 'i' ? '#bae6fd' : '#16a34a', chunk, glow: false }); break;
          case 'Y': case 'A': case 'f': case '%': floor(); W.add({ k: 'spin', b: [cx - 0.1, 0, cz - 0.1, cx + 0.1, 1, cz + 0.1], chunk, len: T * { Y: 0.7, A: 0.9, f: 1.3, '%': 1.7 }[ch], speed: espd * { Y: 1, A: 1.6, f: 0.9, '%': 0.7 }[ch], y: 0.55, phase: x * 1.3 + y }); break;
          case 'Q': floor(); W.add({ k: 'laser', b: [cx - 0.1, 0, z0, cx + 0.1, 2, z1], chunk, period: 2.4 / espd * 1.4, on: 0.45, phase: y * 0.4 }); break;
          case 'n': case 'z': case '@': case 'k': case 'd': { floor(); const text = (L.signs || {})[y * L.w + x] || (ch === 'd' ? 'Woof! 🐶' : ''); npcs.push({ ch, x: cx, z: cz, y: 0 }); if (text && ch !== 'd') signs.push({ x: cx, z: cz, text, npc: npcs[npcs.length - 1] }); break; }
          case 't': floor(); W.add({ k: 'solid', b: [cx - 0.2, 0, cz - 0.2, cx + 0.2, 2.2, cz + 0.2], col: '#78350f', chunk, trim: false }); W.add({ k: 'solid', b: [cx - 0.9, 2, cz - 0.9, cx + 0.9, 3.4, cz + 0.9], col: '#16a34a', chunk, trim: false }); break;
          case 'o': floor(); W.add({ k: 'solid', b: [x0 + 0.2, 0, z0 + 0.2, x1 - 0.2, 0.8, z1 - 0.2], col: '#16a34a', chunk, trim: false }); break;
          case '3': floor(); W.add({ k: 'solid', b: [x0 + 0.3, 0, z0 + 0.3, x1 - 0.3, 0.6, z1 - 0.3], col: '#78716c', chunk, trim: false }); break;
          case '4': floor(); W.add({ k: 'solid', b: [x0, 0, cz - 0.08, x1, 0.9, cz + 0.08], col: '#d6a756', chunk, trim: false }); break;
          case '2': floor(); W.add({ k: 'solid', b: [cx - 0.25, 0, cz - 0.25, cx + 0.25, 1.3, cz + 0.25], col: '#a855f7', chunk, trim: false }); break;
          case '1': floor(); W.add({ k: 'solid', b: [cx - 0.1, 0, cz - 0.1, cx + 0.1, 0.5, cz + 0.1], col: '#fef3c7', chunk, trim: false }); W.add({ k: 'solid', b: [cx - 0.4, 0.5, cz - 0.4, cx + 0.4, 0.8, cz + 0.4], col: '#dc2626', chunk, trim: false }); break;
          case 'x': floor(); W.add({ k: 'solid', b: [cx - 0.08, 0, cz - 0.08, cx + 0.08, 1.4, cz + 0.08], col: '#78350f', chunk, trim: false }); break;
          case '~': floor(); W.add({ k: 'solid', b: [x0, 4, z0 + 0.3, x1, 4.6, z1 - 0.3], col: '#f8fafc', chunk, trim: false }); break;
          default: floor();
        }
      }
      W.build(); W.place(...start); W.cpStage = 0;
      W.cam.yaw = Math.PI; W.cam.pitch = -0.45; W.cam.dist = 8;
      W.killY = -12;
      o.onLevel && o.onLevel(i);
    }
    function onPower(ob) {
      if (ob.type === 'goal') { if (set.win === 'coins' && coins < totalCoins) { ob.taken = false; banner(`Collect all the coins first (${coins}/${totalCoins})`); return; } levelDone(); }
      if (ob.type === 'heart') { if (lives !== Infinity) lives++; o.sfx && o.sfx('power'); }
      if (ob.type === 'key') { keys++; banner('🔑 Got a key — find a locked door'); }
      if (ob.type === 'star' || ob.type === 'shield') { if (lives !== Infinity) lives++; banner(ob.type === 'star' ? '⭐ Super star — extra life!' : '🛡️ Shield — extra life!'); o.sfx && o.sfx('power'); }
      if (ob.type === 'wings') { W.doubleJump = true; banner('🪽 Double jump!'); o.sfx && o.sfx('power'); }
      if (ob.type === 'speed') { if (!speedT) W.speedMul *= 1.35; speedT = 8; banner('👟 Super speed!'); o.sfx && o.sfx('power'); }
      if (ob.type === 'blaster') { coins += 5; banner('🔫 +5 coins'); o.sfx && o.sfx('coin'); }
    }
    let bannerT = 0, bannerTxt = '';
    const banner = t => { bannerTxt = t; bannerT = 2.5; };
    function onDie() { deaths++; o.sfx && o.sfx('hurt'); if (lives !== Infinity) { lives--; if (lives <= 0) { state = 'over'; setTimeout(() => o.onLose && o.onLose(stats()), 700); } } }
    function levelDone() {
      if (state !== 'play') return;
      o.sfx && o.sfx('win');
      if (li + 1 < game.levels.length) { banner(`Level ${li + 2}!`); state = 'next'; setTimeout(() => { loadLevel(li + 1); state = 'play'; }, 900); }
      else { state = 'won'; setTimeout(() => o.onWin && o.onWin(stats()), 600); }
    }
    const stats = () => ({ ms: Math.round(totalT * 1000), time: totalT, coins, deaths, levels: game.levels.length, level: li });
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const raw = IN.frame();
      const mx = raw.mx + (input.r ? 1 : 0) - (input.l ? 1 : 0), mz = raw.mz + (input.d ? 1 : 0) - (input.u ? 1 : 0);
      const jump = IN.hit('Space') || input.aPressed || IN.hit('Tap'); input.aPressed = false;
      const inp = { mx: Math.max(-1, Math.min(1, mx)), mz: Math.max(-1, Math.min(1, mz)), run: raw.run, jump: state === 'play' && jump, jumpHeld: IN.down('Space') || input.a, lookX: raw.lookX, lookY: raw.lookY, wheel: raw.wheel };
      if (state === 'count') { countT -= dt; if (countT <= 0) state = 'play'; inp.mx = inp.mz = 0; inp.jump = false; }
      if (state === 'play') { W.update(dt, inp); levelT += dt; totalT += dt; if (timeLeft) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; state = 'over'; o.onLose && o.onLose(stats()); } } }
      else W.update(dt, { mx: 0, mz: 0, jump: false, lookX: 0, lookY: 0 });
      const cam = W.camera(inp, dt);
      // doors open when you walk up with a key; teleporters send you to the next pad; signs show their text
      for (const d of doors) if (!d.open && keys > 0 && Math.hypot(W.P.x - d.x, W.P.z - d.z) < 2.4) { d.open = true; keys--; W.dropChunk(d.id); o.sfx && o.sfx('power'); banner('🚪 Unlocked!'); }
      if (speedT > 0) { speedT -= dt; if (speedT <= 0) { speedT = 0; W.speedMul /= 1.35; } }
      for (const n of npcs) if (n.ch === 'd') { const tx = W.P.x - Math.sin(W.P.yaw || 0) * 1.4, tz = W.P.z - Math.cos(W.P.yaw || 0) * 1.4, k = Math.min(1, dt * 3); n.moving = Math.hypot(tx - n.x, tz - n.z) > 0.4; n.x += (tx - n.x) * k; n.z += (tz - n.z) * k; n.y += ((W.P.y || 0) - n.y) * k; }
      tpCool -= dt;
      if (teles.length > 1 && tpCool <= 0 && W.P.ground) { const i = teles.findIndex(t => Math.hypot(W.P.x - t.x, W.P.z - t.z) < 0.9); if (i >= 0) { const t = teles[(i + 1) % teles.length]; W.P.x = t.x; W.P.z = t.z; W.P.y = 0.1; tpCool = 1.2; o.sfx && o.sfx('power'); } }
      const sg = signs.find(s => Math.hypot(W.P.x - s.x, W.P.z - s.z) < 2.6 && s.text);
      if ((sg && sg.text) !== signShown) { signShown = sg && sg.text; o.sign && o.sign(signShown || ''); }
      if (o.onPos) o.onPos({ l: li, x: W.P.x, y: W.P.y, z: W.P.z, f: W.P.yaw, d3: 1 });
      bannerT -= dt;
      o.hud && o.hud(`Level ${li + 1}/${game.levels.length} · 🪙 ${coins}${set.win === 'coins' ? '/' + totalCoins : ''}${keys ? ' · 🔑 ' + keys : ''}`, `${lives === Infinity ? '' : '❤️ ' + lives + ' · '}⏱ ${timeLeft ? Math.ceil(timeLeft) + 's' : Math.floor(levelT) + 's'}`, state === 'count' ? (countT > 0 ? Math.ceil(countT) : 'GO!') : bannerT > 0 ? bannerTxt : '');
      if (R) {
        const lvd = game.levels[li] && game.levels[li].dark, dk = lvd != null && lvd !== '' ? +lvd : (+set.dark || 0);
        let th = SKIES[set.theme] || SKIES[0];
        if (dk > 0) { const f = GL3D.dirOf(cam.yaw || 0, cam.pitch || 0), k = [1, .55, .3, .14][dk]; th = Object.assign({}, th, { skyTop: '#020208', skyHorizon: '#0b0a18', sky: '#05040c', stars: 1, clouds: 0, amb: [.4 * k, .4 * k, .5 * k], sunCol: [.3 * k, .3 * k, .4 * k], fog: [3, [160, 60, 34, 20][dk]], fogCol: '#05040c', flash: { p: cam.eye, d: f, c: [1.2, 1.1, .9], range: 26 } }); }
        W.render(cam, Object.assign({ fog: [60, 160], view: 120 }, th), r => {
          for (const t of teles) { r.box(t.x - 0.7, 0.01, t.z - 0.7, t.x + 0.7, 0.08, t.z + 0.7, '#a78bfa', 1, 0.8); r.glow([t.x, 0.6, t.z], 1.4, [0.6, 0.4, 1], 0.5); }
          for (const d of doors) if (!d.open) r.glow([d.x, 2.2, d.z], 1.2, [1, 0.8, 0.3], 0.25);
          for (const n of npcs) {
            const yaw = Math.atan2(W.P.x - n.x, W.P.z - n.z);
            if (n.ch === 'd') { const s = Math.sin(yaw), c = Math.cos(yaw); r.box(n.x - 0.35, n.y + 0.25, n.z - 0.35, n.x + 0.35, n.y + 0.7, n.z + 0.35, '#b45309'); r.box(n.x + s * 0.45 - 0.22, n.y + 0.55, n.z + c * 0.45 - 0.22, n.x + s * 0.45 + 0.22, n.y + 0.95, n.z + c * 0.45 + 0.22, '#92400e'); }
            else r.person(NPC_LOOK[n.ch] || null, n.x, n.y, n.z, yaw, { walk: 0, speed: 0 });
          }
          if (o.ghosts) for (const g of o.ghosts()) if (g.l === li && g.d3) { r.person(g.look || null, g.x, g.y, g.z, g.f || 0, { walk: performance.now() / 120, speed: g.moving ? 1 : 0 }); }
        });
        // name tags over other players
        if (o.ghosts) { const list = o.ghosts().filter(g => g.l === li && g.d3); tags.innerHTML = list.map(g => { const p = R.project([g.x, g.y + 2.4, g.z]); return p.vis ? `<div style="position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-100%);padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 12px system-ui;white-space:nowrap">${String(g.name || '').replace(/[<>&"]/g, '')}</div>` : ''; }).join(''); }
      }
      IN.endFrame();
    }
    loadLevel(li); state = countT > 0 ? 'count' : 'play';
    raf = requestAnimationFrame(frame);
    if (window.SJLook) SJLook.get();
    return {
      input,
      stop() { cancelAnimationFrame(raf); cv.remove(); tags.remove(); if (W) W.clear(); if (document.pointerLockElement) document.exitPointerLock(); },
      restartLevel() { lives = set.lives || Infinity; loadLevel(li); state = 'play'; }, get W() { return W; }, get state() { return state; }, step(n, dt = 1 / 60, inp = {}) { for (let i = 0; i < n; i++) { W.update(dt, Object.assign({ mx: 0, mz: 0, jump: false, lookX: 0, lookY: 0 }, inp)); } }, stats, levelDone,
    };
  }
  window.MakerEngine3D = { run, example, T };
})();
