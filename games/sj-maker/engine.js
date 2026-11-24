/* Game Maker engine: tile definitions, default art, and the runtime that plays a game made in the editor.
   A game = { v, title, template:'platformer'|'topdown', settings:{...}, sprites:{ch:{px?:64 hex chars, emoji?}}, levels:[{w,h,tiles,signs:{idx:text}}] } */
(() => {
'use strict';
const PAL = ['', '#000000', '#ffffff', '#9ca3af', '#4b5563', '#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#92400e'];
// ch: [name, group, help]
const TILES = {
  '.': ['Empty', 'Basic', 'Nothing here'],
  'P': ['Player start', 'Basic', 'Where the hero begins (one per level)'],
  '#': ['Ground', 'Basic', 'Solid block'],
  '=': ['Bricks', 'Basic', 'Solid block, different look'],
  '-': ['Ledge', 'Basic', 'Platform you can jump up through'],
  'I': ['Ice', 'Basic', 'Slippery solid block'],
  'B': ['Crumble block', 'Basic', 'Falls apart after you stand on it, comes back later'],
  'G': ['Goal flag', 'Goals', 'Touch it to finish the level'],
  'C': ['Coin', 'Goals', 'Collect for points'],
  'K': ['Key', 'Goals', 'Opens one locked door'],
  'D': ['Locked door', 'Goals', 'Needs a key'],
  'H': ['Heart', 'Goals', 'Extra life'],
  'X': ['Checkpoint', 'Goals', 'You restart here after a hit'],
  'N': ['Sign', 'Goals', 'Shows a message when touched'],
  'S': ['Spikes', 'Danger', 'Hurts'],
  'L': ['Lava', 'Danger', 'Hurts'],
  'E': ['Walker', 'Danger', 'Enemy that walks side to side'],
  'F': ['Flyer', 'Danger', 'Enemy that flies up and down'],
  'Z': ['Turret', 'Danger', 'Shoots at you'],
  'J': ['Spring', 'Fun', 'Big bounce (top-down: speed boost)'],
  'T': ['Teleporter', 'Fun', 'Jumps you to the next teleporter'],
  'W': ['Water', 'Fun', 'Swim slowly through it'],
};
const SOLID = new Set(['#', '=', 'I', 'B', 'D', 'Z']);
const THEMES = [
  { name: 'Sunny sky', sky: ['#60a5fa', '#bfdbfe'], hill: '#86efac', hill2: '#4ade80' },
  { name: 'Sunset', sky: ['#f97316', '#fde68a'], hill: '#c2410c', hill2: '#9a3412' },
  { name: 'Night', sky: ['#0f172a', '#312e81'], hill: '#1e1b4b', hill2: '#312e81', stars: true },
  { name: 'Cave', sky: ['#1c1917', '#44403c'], hill: '#292524', hill2: '#1c1917' },
  { name: 'Space', sky: ['#020617', '#0f172a'], hill: null, stars: true },
  { name: 'Candy', sky: ['#f9a8d4', '#fce7f3'], hill: '#f472b6', hill2: '#ec4899' },
  { name: 'Forest', sky: ['#14532d', '#86efac'], hill: '#166534', hill2: '#14532d' },
  { name: 'Snow', sky: ['#cbd5e1', '#f8fafc'], hill: '#e2e8f0', hill2: '#cbd5e1' },
];
const DEFAULT_SETTINGS = { gravity: 1, speed: 2, jump: 2, doubleJump: false, lives: 3, timer: 0, win: 'goal', stomp: true, shoot: false, theme: 0, enemySpeed: 2 };

/* ---------------- drawing ---------------- */
const spriteCache = new Map();
function spriteCanvas(spr) {
  const key = spr.px || ('e' + spr.emoji);
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  if (spr.px) { c.width = c.height = 8; const g = c.getContext('2d'); for (let i = 0; i < 64; i++) { const v = parseInt(spr.px[i], 16); if (v) { g.fillStyle = PAL[v]; g.fillRect(i % 8, Math.floor(i / 8), 1, 1); } } }
  else { c.width = c.height = 64; const g = c.getContext('2d'); g.font = '52px system-ui, "Noto Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(spr.emoji, 32, 36); }
  spriteCache.set(key, c); if (spriteCache.size > 300) spriteCache.delete(spriteCache.keys().next().value);
  return c;
}
function drawSprite(g, spr, x, y, s, flip) {
  const c = spriteCanvas(spr);
  g.save(); g.imageSmoothingEnabled = !spr.px;
  if (flip) { g.translate(x + s, y); g.scale(-1, 1); g.drawImage(c, 0, 0, s, s); } else g.drawImage(c, x, y, s, s);
  g.restore();
}
// Default look of each tile (original simple art).
function drawTile(g, ch, x, y, s, sprites, t = 0, opts = {}) {
  const spr = sprites && sprites[ch];
  if (spr && (spr.px || spr.emoji)) { drawSprite(g, spr, x, y, s, opts.flip); return; }
  const r = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(x + a * s, y + b * s, w * s, h * s); };
  const circ = (cx, cy, rad, c) => { g.fillStyle = c; g.beginPath(); g.arc(x + cx * s, y + cy * s, rad * s, 0, 7); g.fill(); };
  switch (ch) {
    case '#': r(0, 0, 1, 1, '#92400e'); r(0, 0, 1, .22, '#22c55e'); r(.1, .4, .15, .1, '#78350f'); r(.6, .65, .18, .1, '#78350f'); break;
    case '=': r(0, 0, 1, 1, '#b91c1c'); g.fillStyle = '#7f1d1d'; for (const [a, b, w] of [[0, .48, 1], [0, .98, 1], [.48, 0, .04], [.2, .5, .04], [.75, .5, .04]]) g.fillRect(x + a * s, y + b * s - (b > .9 ? .04 * s : 0), w * s, .04 * s + (w < .1 ? .46 * s : 0)); break;
    case '-': r(0, 0, 1, .25, '#a16207'); r(0, .25, 1, .06, '#713f12'); break;
    case 'I': r(0, 0, 1, 1, '#bae6fd'); r(0, 0, 1, .15, '#f0f9ff'); r(.15, .3, .3, .06, '#fff'); break;
    case 'B': r(.04, .04, .92, .92, '#d97706'); r(.04, .04, .92, .1, '#fbbf24'); g.strokeStyle = '#78350f'; g.lineWidth = s * .05; g.beginPath(); g.moveTo(x + .3 * s, y + .2 * s); g.lineTo(x + .5 * s, y + .5 * s); g.lineTo(x + .4 * s, y + .8 * s); g.stroke(); break;
    case 'G': r(.15, .05, .08, .95, '#e5e7eb'); g.fillStyle = '#22c55e'; g.beginPath(); g.moveTo(x + .23 * s, y + .08 * s); g.lineTo(x + .9 * s, y + .25 * s + Math.sin(t * 4) * .03 * s); g.lineTo(x + .23 * s, y + .45 * s); g.fill(); break;
    case 'C': { const w = Math.abs(Math.cos(t * 3)) * .32 + .06; g.fillStyle = '#facc15'; g.beginPath(); g.ellipse(x + .5 * s, y + .5 * s, w * s, .34 * s, 0, 0, 7); g.fill(); g.fillStyle = '#fde68a'; g.beginPath(); g.ellipse(x + .5 * s, y + .5 * s, w * .5 * s, .22 * s, 0, 0, 7); g.fill(); break; }
    case 'K': circ(.32, .5, .18, '#facc15'); circ(.32, .5, .08, '#0000'); r(.45, .45, .45, .1, '#facc15'); r(.75, .55, .08, .15, '#facc15'); r(.6, .55, .08, .12, '#facc15'); break;
    case 'D': r(.08, 0, .84, 1, '#57534e'); r(.14, .06, .72, .94, '#a16207'); circ(.5, .5, .09, '#facc15'); r(.47, .52, .06, .16, '#facc15'); break;
    case 'H': { g.fillStyle = '#ef4444'; const k = 1 + Math.sin(t * 5) * .06; g.beginPath(); const cx = x + .5 * s, cy = y + .55 * s, z = .3 * s * k; g.moveTo(cx, cy + z); g.bezierCurveTo(cx - z * 1.8, cy - z * .3, cx - z * .6, cy - z * 1.6, cx, cy - z * .5); g.bezierCurveTo(cx + z * .6, cy - z * 1.6, cx + z * 1.8, cy - z * .3, cx, cy + z); g.fill(); break; }
    case 'X': r(.45, .1, .08, .9, '#9ca3af'); g.fillStyle = opts.active ? '#22c55e' : '#ef4444'; g.beginPath(); g.moveTo(x + .53 * s, y + .12 * s); g.lineTo(x + .85 * s, y + .25 * s); g.lineTo(x + .53 * s, y + .38 * s); g.fill(); break;
    case 'N': r(.46, .5, .08, .5, '#78350f'); r(.1, .15, .8, .45, '#d97706'); r(.18, .26, .64, .05, '#78350f'); r(.18, .38, .5, .05, '#78350f'); break;
    case 'S': g.fillStyle = '#d4d4d8'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + (k / 3) * s, y + s); g.lineTo(x + (k / 3 + 1 / 6) * s, y + .45 * s); g.lineTo(x + ((k + 1) / 3) * s, y + s); g.fill(); } break;
    case 'L': r(0, .2, 1, .8, '#dc2626'); g.fillStyle = '#f97316'; g.beginPath(); g.moveTo(x, y + .25 * s); for (let k = 0; k <= 4; k++) g.lineTo(x + k / 4 * s, y + (.2 + Math.sin(t * 3 + k + x) * .07) * s); g.lineTo(x + s, y + .45 * s); g.lineTo(x, y + .45 * s); g.fill(); break;
    case 'E': circ(.5, .58, .38, '#7c3aed'); circ(.36, .5, .1, '#fff'); circ(.64, .5, .1, '#fff'); circ(.38, .52, .05, '#000'); circ(.62, .52, .05, '#000'); r(.2, .9, .2, .1, '#4c1d95'); r(.6, .9, .2, .1, '#4c1d95'); break;
    case 'F': circ(.5, .5, .3, '#0ea5e9'); g.fillStyle = '#e0f2fe'; g.beginPath(); g.ellipse(x + .18 * s, y + (.35 + Math.sin(t * 20) * .08) * s, .16 * s, .08 * s, 0, 0, 7); g.ellipse(x + .82 * s, y + (.35 + Math.sin(t * 20) * .08) * s, .16 * s, .08 * s, 0, 0, 7); g.fill(); circ(.42, .46, .07, '#000'); circ(.58, .46, .07, '#000'); break;
    case 'Z': r(.1, .3, .8, .7, '#4b5563'); circ(.5, .35, .25, '#6b7280'); r(opts.flip ? 0 : .5, .3, .5, .12, '#111827'); circ(.5, .35, .07, '#ef4444'); break;
    case 'J': r(.15, .75, .7, .25, '#4b5563'); g.strokeStyle = '#9ca3af'; g.lineWidth = s * .06; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(x + .25 * s, y + (.72 - k * .12) * s); g.lineTo(x + .75 * s, y + (.66 - k * .12) * s); } g.stroke(); r(.1, .28, .8, .1, '#ef4444'); break;
    case 'T': { g.strokeStyle = '#a855f7'; g.lineWidth = s * .08; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + .5 * s, y + .5 * s, (.42 - k * .12) * s, (.42 - k * .12) * s * .9, t * (k + 1), 0, 5); g.stroke(); } break; }
    case 'W': g.fillStyle = 'rgba(56,189,248,.55)'; g.fillRect(x, y, s, s); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + ((t * 20 + x) % s), y + .2 * s, .2 * s, .05 * s); break;
    case 'P': drawHero(g, x, y, s, opts.flip, opts.anim || 0); break;
  }
}
function drawHero(g, x, y, s, flip, anim) {
  const bob = Math.abs(Math.sin(anim)) * .04 * s;
  g.fillStyle = '#f97316'; g.beginPath(); g.roundRect(x + .14 * s, y + .12 * s - bob, .72 * s, .78 * s, .22 * s); g.fill();
  g.fillStyle = '#fdba74'; g.beginPath(); g.roundRect(x + .22 * s, y + .2 * s - bob, .56 * s, .36 * s, .12 * s); g.fill();
  const ex = flip ? -.06 : .06;
  g.fillStyle = '#111'; g.beginPath(); g.arc(x + (.4 + ex) * s, y + .36 * s - bob, .05 * s, 0, 7); g.arc(x + (.62 + ex) * s, y + .36 * s - bob, .05 * s, 0, 7); g.fill();
  g.fillStyle = '#1e3a8a'; const lg = Math.sin(anim) * .06;
  g.fillRect(x + (.24 + lg) * s, y + .86 * s, .18 * s, .14 * s); g.fillRect(x + (.58 - lg) * s, y + .86 * s, .18 * s, .14 * s);
}
function drawBackground(g, theme, W, H, camX, camY) {
  const th = THEMES[theme] || THEMES[0];
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[1]);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (th.stars) { g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 70; i++) { const sx = ((i * 137.5 - camX * .1) % W + W) % W, sy = (i * 71.3) % (H * .7); g.fillRect(sx, sy, 2, 2); } }
  if (th.hill) for (let L = 0; L < 2; L++) {
    g.fillStyle = L ? th.hill2 : th.hill; g.globalAlpha = L ? .9 : .6; g.beginPath(); g.moveTo(0, H);
    const f = L ? .4 : .2, base = H * (L ? .78 : .66);
    for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, base - 40 * Math.sin((x + camX * f) / (L ? 150 : 230)) - 18 * Math.sin((x + camX * f) / 61 + L));
    g.lineTo(W, H); g.fill(); g.globalAlpha = 1;
  }
}

/* ---------------- starter content ---------------- */
function blankLevel(w = 40, h = 15, template = 'platformer') {
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (template === 'topdown') row += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.';
      else row += y >= h - 2 ? '#' : '.';
    }
    rows.push(row);
  }
  const L = { w, h, tiles: rows.join(''), signs: {} };
  const set = (x, y, c) => { L.tiles = L.tiles.slice(0, y * w + x) + c + L.tiles.slice(y * w + x + 1); };
  if (template === 'topdown') { set(2, 2, 'P'); set(w - 3, h - 3, 'G'); } else { set(2, h - 3, 'P'); set(w - 3, h - 3, 'G'); }
  return L;
}
function fromRows(rows, signs = {}) { const w = Math.max(...rows.map(r => r.length)); return { w, h: rows.length, tiles: rows.map(r => r.padEnd(w, '.')).join(''), signs }; }
function exampleGame(template) {
  if (template === 'topdown') return {
    v: 1, title: 'Dungeon Dash', template, settings: { ...DEFAULT_SETTINGS, theme: 3, shoot: true, stomp: false, win: 'goal' }, sprites: {},
    levels: [fromRows([
      '##############################',
      '#P..C....#.......E.......C...#',
      '#........#..............######',
      '#..N.....#...C.....#.........#',
      '#........D.........#....F....#',
      '####.#####.........#.........#',
      '#........#...#######.........#',
      '#..C.....#...........T.......#',
      '#....E...#.....SSS...........#',
      '#........#...................#',
      '#.T....K.#....C......####D####',
      '#........#...........#.......#',
      '#..C.....#....H......#...G...#',
      '##############################',
    ], { [3 * 30 + 3]: 'Find the keys to open the doors.\nPress Space to shoot!' })],
  };
  return {
    v: 1, title: 'Hill Hopper', template: 'platformer', settings: { ...DEFAULT_SETTINGS }, sprites: {},
    levels: [fromRows([
      '..................................................',
      '..................................................',
      '..................................................',
      '.....................CCC..........................',
      '....................-----.............CCC.........',
      '...............C.......................===........',
      '..............===...........F..............C...G..',
      '.........N...........................====..====...',
      '...........C...C..........==..................#...',
      '.P........###.###.....E......X.....J.......E..#...',
      '###########...#########...########...##############',
      '###########LLL#########SSS########...##############',
    ], { [7 * 50 + 9]: 'Arrows or WASD to move, Up/Space to jump.\nJump on enemies to squash them!' }),
    fromRows([
      '..........................................',
      '..........................................',
      '........CCC...............................',
      '.......BBBBB.........F............CCC.....',
      '..........................E......=====....',
      '....-----.........=================.......',
      '..................#...............#....G..',
      '.P.....J..........#.....C...C.....#...###.',
      '#####...######....#..====..===....#.......',
      '#####...######SSSS#...............######..',
      '#####...######################LLLL######..',
    ])],
  };
}

/* ---------------- runtime ---------------- */
// MakerEngine.run(canvas, game, { onWin(stats), onLose, onLevel(i), onPos(p), ghosts:() => [{name,l,x,y,f,col}], hud(text), banner(text), sign(text) })
function run(cv, game, o = {}) {
  const g = cv.getContext('2d');
  const set = { ...DEFAULT_SETTINGS, ...(game.settings || {}) }, top = game.template === 'topdown';
  const sprites = game.sprites || {};
  const TS = 32;
  let li = o.startLevel || 0, L, grid, ents, P, cam = { x: 0, y: 0 }, t = 0, levelT = 0, totalT = 0, coins = 0, totalCoins = 0, deaths = 0, lives = set.lives || Infinity, keys = 0, state = 'play', raf = 0, last = performance.now(), cp = null, bullets = [], parts = [], signTxt = null, timeLeft = 0, stopped = false, frozen = o.countdown || 0;
  const input = { l: false, r: false, u: false, d: false, a: false, b: false, aPressed: false, bPressed: false };
  const GRAV = 1500 * set.gravity, SPEED = [0, 120, 170, 230][set.speed] || 170, JUMPV = ([0, 450, 560, 670][set.jump] || 560) * Math.sqrt(set.gravity), ESPD = [0, 40, 65, 100][set.enemySpeed] || 65;
  const at = (x, y) => (x < 0 || x >= L.w || y < 0 || y >= L.h) ? (top ? '#' : (y < 0 ? '.' : (x < 0 || x >= L.w ? '#' : '.'))) : grid[y * L.w + x];
  const solidAt = (x, y) => SOLID.has(at(x, y)) && !(at(x, y) === 'B' && crumbleGone(x, y));
  const crumble = new Map();
  const crumbleGone = (x, y) => { const c = crumble.get(y * L.w + x); return c && c.gone; };
  function loadLevel(i) {
    li = i; L = game.levels[i]; grid = L.tiles.split(''); ents = []; bullets = []; parts = []; crumble.clear(); keys = 0; levelT = 0; signTxt = null;
    timeLeft = set.timer || 0;
    let ps = null;
    grid.forEach((ch, k) => {
      const x = k % L.w, y = Math.floor(k / L.w);
      if (ch === 'P') { ps = { x, y }; grid[k] = '.'; }
      else if ('CKHE F'.includes(ch) && ch !== ' ') { ents.push({ k: ch, x: x * TS, y: y * TS, w: TS, h: TS, sx: x * TS, sy: y * TS, vx: ch === 'E' ? -ESPD : 0, vy: ch === 'F' ? -ESPD : 0, alive: true, hp: 1 }); grid[k] = '.'; }
      else if (ch === 'Z') ents.push({ k: 'Z', x: x * TS, y: y * TS, w: TS, h: TS, cd: 1 + Math.random(), alive: true, hp: 3, tile: k });
    });
    totalCoins = ents.filter(e => e.k === 'C').length;
    ps = ps || { x: 1, y: 1 };
    cp = { x: ps.x * TS + 4, y: ps.y * TS + (top ? 4 : 2) };
    spawnPlayer();
    o.onLevel && o.onLevel(i);
    banner(game.levels.length > 1 ? `Level ${i + 1}` : '', 1.2);
  }
  function spawnPlayer() { P = { x: cp.x, y: cp.y, w: 24, h: top ? 24 : 30, vx: 0, vy: 0, on: false, face: 1, jumps: 0, inv: 1, anim: 0, boost: 0, cdShot: 0, tp: 0 }; }
  let bannerT = 0, bannerTxt = '';
  function banner(txt, d = 1.5) { bannerTxt = txt; bannerT = d; o.banner && o.banner(txt); }
  function hurt() {
    if (P.inv > 0 || state !== 'play') return;
    deaths++; sfx('hurt'); burst(P.x + 12, P.y + 14, '#ef4444');
    if (lives !== Infinity) lives--;
    if (lives <= 0) { state = 'lose'; o.onLose && o.onLose({ level: li, deaths, time: totalT }); return; }
    spawnPlayer(); P.inv = 1.2;
  }
  function burst(x, y, c) { for (let i = 0; i < 12; i++) parts.push({ x, y, vx: (Math.random() - .5) * 260, vy: (Math.random() - .8) * 260, t: .6, c }); }
  const sfx = n => o.sfx && o.sfx(n);
  function box(b, dx, dy) {
    // move a body with tile collisions; returns hit flags
    const hit = { x: false, top: false, bottom: false };
    b.x += dx;
    let x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - .01) / TS), y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - .01) / TS);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solidAt(x, y)) {
      if (dx > 0) b.x = x * TS - b.w; else if (dx < 0) b.x = (x + 1) * TS; hit.x = true; hit.tile = [x, y];
      x0 = Math.floor(b.x / TS); x1 = Math.floor((b.x + b.w - .01) / TS);
    }
    const oy = b.y; b.y += dy;
    x0 = Math.floor(b.x / TS); x1 = Math.floor((b.x + b.w - .01) / TS); y0 = Math.floor(b.y / TS); y1 = Math.floor((b.y + b.h - .01) / TS);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const solid = solidAt(x, y), ledge = !top && at(x, y) === '-' && dy > 0 && oy + b.h <= y * TS + 1 && !b.drop;
      if (solid || ledge) {
        if (dy > 0) { b.y = y * TS - b.h; hit.bottom = true; hit.btile = [x, y]; } else if (dy < 0) { b.y = (y + 1) * TS; hit.top = true; hit.ttile = [x, y]; }
        y0 = Math.floor(b.y / TS); y1 = Math.floor((b.y + b.h - .01) / TS);
      }
    }
    return hit;
  }
  const overl = (a, b, m = 0) => a.x + m < b.x + b.w && a.x + a.w - m > b.x && a.y + m < b.y + b.h && a.y + a.h - m > b.y;
  const tilesUnder = b => { const out = []; for (let y = Math.floor(b.y / TS); y <= Math.floor((b.y + b.h - .01) / TS); y++) for (let x = Math.floor(b.x / TS); x <= Math.floor((b.x + b.w - .01) / TS); x++) out.push([x, y, at(x, y)]); return out; };

  function update(dt) {
    t += dt;
    if (frozen > 0) { frozen -= dt; banner(frozen > 0 ? String(Math.ceil(frozen)) : 'GO!', frozen > 0 ? .3 : .8); return; }
    if (state !== 'play') return;
    levelT += dt; totalT += dt;
    if (set.timer) { timeLeft -= dt; if (timeLeft <= 0) { P.inv = 0; hurt(); timeLeft = set.timer; } }
    P.inv = Math.max(0, P.inv - dt); P.cdShot -= dt; P.boost = Math.max(0, P.boost - dt); P.tp = Math.max(0, P.tp - dt);
    const inWater = tilesUnder(P).some(([, , c]) => c === 'W');
    const onIce = !top && P.on && [Math.floor((P.x + 2) / TS), Math.floor((P.x + P.w - 2) / TS)].some(x => at(x, Math.floor((P.y + P.h + 2) / TS)) === 'I');
    const spd = SPEED * (P.boost > 0 ? 1.8 : 1) * (inWater ? .6 : 1);
    if (top) {
      let ix = (input.r ? 1 : 0) - (input.l ? 1 : 0), iy = (input.d ? 1 : 0) - (input.u ? 1 : 0);
      if (ix && iy) { ix *= .707; iy *= .707; }
      P.vx = ix * spd; P.vy = iy * spd;
      if (ix) P.face = ix > 0 ? 1 : -1;
      if (ix || iy) { P.dir = [Math.sign(ix), Math.sign(iy)]; P.anim += dt * 12; }
      box(P, P.vx * dt, 0); box(P, 0, P.vy * dt);
    } else {
      const ix = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      const acc = onIce ? 5 : 16;
      P.vx += (ix * spd - P.vx) * Math.min(1, acc * dt);
      if (ix) { P.face = ix; P.anim += dt * 12; }
      if (input.aPressed) {
        if (inWater) { P.vy = -JUMPV * .55; sfx('jump'); }
        else if (P.on || P.coyote > 0) { P.vy = -JUMPV; P.on = false; P.coyote = 0; P.jumps = 1; sfx('jump'); }
        else if (set.doubleJump && P.jumps < 2) { P.vy = -JUMPV * .9; P.jumps = 2; sfx('jump'); burst(P.x + 12, P.y + P.h, '#fff'); }
      }
      if (!input.a && P.vy < -JUMPV * .4 && !inWater) P.vy = -JUMPV * .4; // variable jump height
      P.vy = Math.min(inWater ? 120 : 900, P.vy + GRAV * (inWater ? .25 : 1) * dt);
      P.drop = input.d;
      box(P, P.vx * dt, 0);
      const h = box(P, 0, P.vy * dt);
      P.coyote = Math.max(0, (P.coyote || 0) - dt);
      if (h.bottom) { P.vy = 0; if (!P.on) P.jumps = 0; P.on = true; P.coyote = .1; const [bx, by] = h.btile; if (at(bx, by) === 'B') { const c = crumble.get(by * L.w + bx) || { t: 0, gone: false }; if (!c.t) c.t = .45; crumble.set(by * L.w + bx, c); } }
      else { if (P.on) P.coyote = .1; P.on = false; }
      if (h.top) { P.vy = 40; }
      if (P.y > L.h * TS + 200) { P.inv = 0; hurt(); }
    }
    for (const [k, c] of crumble) { if (!c.gone && c.t > 0) { c.t -= dt; if (c.t <= 0) { c.gone = true; c.back = 3; burst((k % L.w) * TS + 16, Math.floor(k / L.w) * TS + 16, '#d97706'); } } else if (c.gone) { c.back -= dt; if (c.back <= 0 && !overl(P, { x: (k % L.w) * TS, y: Math.floor(k / L.w) * TS, w: TS, h: TS })) crumble.delete(k); } }
    // tiles touched
    signTxt = null;
    for (const [x, y, c] of tilesUnder(P)) {
      const tb = { x: x * TS, y: y * TS, w: TS, h: TS };
      if (c === 'S' && overl(P, { x: tb.x + 4, y: tb.y + 14, w: 24, h: 18 })) hurt();
      if (c === 'L' && overl(P, { x: tb.x, y: tb.y + 8, w: TS, h: 24 })) hurt();
      if (c === 'G' && set.win === 'goal') return levelDone();
      if (c === 'X' && (!cp.tile || cp.tile !== y * L.w + x)) { cp = { x: tb.x + 4, y: tb.y + (top ? 4 : 2), tile: y * L.w + x }; sfx('power'); banner('Checkpoint!', .9); }
      if (c === 'N') signTxt = (L.signs && L.signs[y * L.w + x]) || '…';
      if (c === 'J') { if (top) { if (P.boost <= 0) sfx('power'); P.boost = 1; } else if (P.vy >= 0 && overl(P, { x: tb.x + 4, y: tb.y + 10, w: 24, h: 22 })) { P.vy = -JUMPV * 1.55; P.jumps = 1; sfx('jump'); } }
      if (c === 'T' && P.tp <= 0) {
        const all = []; grid.forEach((ch, k) => { if (ch === 'T') all.push(k); });
        if (all.length > 1) { const k = all[(all.indexOf(y * L.w + x) + 1) % all.length]; P.x = (k % L.w) * TS + 4; P.y = Math.floor(k / L.w) * TS + (top ? 4 : 2); P.tp = .8; P.vy = 0; sfx('power'); burst(P.x + 12, P.y + 12, '#a855f7'); }
      }
    }
    // doors (touch from the side or below/above)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = Math.floor((P.x + P.w / 2 + dx * (P.w / 2 + 3)) / TS), y = Math.floor((P.y + P.h / 2 + dy * (P.h / 2 + 3)) / TS);
      if (at(x, y) === 'D' && keys > 0) { keys--; grid[y * L.w + x] = '.'; sfx('coin'); burst(x * TS + 16, y * TS + 16, '#facc15'); }
    }
    // shooting
    if (set.shoot && input.bPressed && P.cdShot <= 0) {
      P.cdShot = .3; sfx('shoot');
      const d = top ? (P.dir || [P.face, 0]) : [P.face, 0];
      bullets.push({ x: P.x + P.w / 2, y: P.y + P.h / 2, vx: d[0] * 480, vy: d[1] * 480, mine: true, t: 1.2 });
    }
    input.aPressed = input.bPressed = false;
    // entities
    for (const e of ents) {
      if (!e.alive) continue;
      if (e.k === 'E') {
        if (top) { const h = box(e, e.vx * dt, 0); if (h.x) e.vx = -e.vx; }
        else {
          e.vy = Math.min(900, (e.vy || 0) + GRAV * dt);
          const h = box(e, e.vx * dt, 0); if (h.x) e.vx = -e.vx;
          const v = box(e, 0, e.vy * dt); if (v.bottom) { e.vy = 0; const ax = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / TS), ay = Math.floor((e.y + e.h + 4) / TS); if (!solidAt(ax, ay) && at(ax, ay) !== '-') e.vx = -e.vx; }
          if (e.y > L.h * TS + 100) e.alive = false;
        }
      } else if (e.k === 'F') { const h = box(e, 0, e.vy * dt); if (h.top || h.bottom || Math.abs(e.y - e.sy) > TS * 3) { e.vy = -e.vy; if (Math.abs(e.y - e.sy) > TS * 3) e.y = e.sy + Math.sign(e.y - e.sy) * TS * 3; } }
      else if (e.k === 'Z') {
        e.cd -= dt; const dx = P.x - e.x, dy = P.y - e.y;
        if (e.cd <= 0 && Math.abs(dx) < 420 && Math.abs(dy) < 300) {
          e.cd = 1.8; const d = top ? (Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]) : [Math.sign(dx) || 1, 0];
          bullets.push({ x: e.x + 16 + d[0] * 18, y: e.y + 12 + d[1] * 18, vx: d[0] * 230, vy: d[1] * 230, t: 3 }); sfx('pop');
        }
        e.flip = dx < 0;
      }
      if (!overl(P, e, 4)) continue;
      if (e.k === 'C') { e.alive = false; coins++; sfx('coin'); }
      else if (e.k === 'K') { e.alive = false; keys++; sfx('power'); banner('Got a key!', .8); }
      else if (e.k === 'H') { e.alive = false; if (lives !== Infinity) lives++; sfx('power'); }
      else if (e.k === 'E' || e.k === 'F') {
        if (!top && set.stomp && P.vy > 60 && P.y + P.h - e.y < 18) { e.alive = false; P.vy = -JUMPV * .6; sfx('hit'); burst(e.x + 16, e.y + 16, '#7c3aed'); }
        else hurt();
      }
    }
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
      if (solidAt(Math.floor(b.x / TS), Math.floor(b.y / TS))) {
        b.t = 0; const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
        if (b.mine && at(tx, ty) === 'Z') { const z = ents.find(e => e.k === 'Z' && e.tile === ty * L.w + tx && e.alive); if (z && --z.hp <= 0) { z.alive = false; grid[z.tile] = '.'; burst(b.x, b.y, '#9ca3af'); sfx('boom'); } }
        continue;
      }
      if (b.mine) { for (const e of ents) if (e.alive && (e.k === 'E' || e.k === 'F') && b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) { e.alive = false; b.t = 0; burst(e.x + 16, e.y + 16, '#7c3aed'); sfx('hit'); } }
      else if (b.x > P.x && b.x < P.x + P.w && b.y > P.y && b.y < P.y + P.h) { b.t = 0; hurt(); }
    }
    bullets = bullets.filter(b => b.t > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.t -= dt; }
    parts = parts.filter(p => p.t > 0);
    if (set.win === 'coins' && totalCoins && !ents.some(e => e.k === 'C' && e.alive)) return levelDone();
    if (set.win === 'enemies' && !ents.some(e => (e.k === 'E' || e.k === 'F' || e.k === 'Z') && e.alive)) return levelDone();
    o.onPos && o.onPos({ l: li, x: Math.round(P.x), y: Math.round(P.y), f: P.face });
  }
  function levelDone() {
    sfx('win');
    if (li + 1 < game.levels.length) { loadLevel(li + 1); return; }
    state = 'win'; o.onWin && o.onWin({ ms: Math.round(totalT * 1000), coins, deaths });
  }
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const rowsVisible = Math.min(L.h, top ? 14 : 15), sc = Math.max(.5, H / (rowsVisible * TS));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(g, set.theme, W, H, cam.x * sc, cam.y);
    const vw = W / sc, vh = H / sc;
    const tx = P.x + P.w / 2 - vw / 2 + (top ? 0 : P.face * vw * .08), ty = P.y + P.h / 2 - vh / 2;
    cam.x += (tx - cam.x) * .15; cam.y += (ty - cam.y) * .15;
    cam.x = L.w * TS <= vw ? (L.w * TS - vw) / 2 : Math.max(0, Math.min(L.w * TS - vw, cam.x));
    cam.y = L.h * TS <= vh ? (L.h * TS - vh) : Math.max(0, Math.min(L.h * TS - vh, cam.y));
    g.setTransform(dpr * sc, 0, 0, dpr * sc, -cam.x * sc * dpr, -cam.y * sc * dpr);
    const x0 = Math.max(0, Math.floor(cam.x / TS)), x1 = Math.min(L.w - 1, Math.ceil((cam.x + vw) / TS)), y0 = Math.max(0, Math.floor(cam.y / TS)), y1 = Math.min(L.h - 1, Math.ceil((cam.y + vh) / TS));
    if (top) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, L.w * TS, L.h * TS); }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = grid[y * L.w + x];
      if (c === '.' || (c === 'B' && crumbleGone(x, y)) || c === 'Z') continue;
      let shake = 0; if (c === 'B') { const cr = crumble.get(y * L.w + x); if (cr && cr.t > 0) shake = Math.sin(t * 60) * 2; }
      drawTile(g, c, x * TS + shake, y * TS, TS, sprites, t, { active: cp.tile === y * L.w + x });
    }
    for (const e of ents) if (e.alive) drawTile(g, e.k, e.x, e.y, TS, sprites, t, { flip: e.k === 'E' ? e.vx > 0 : e.flip });
    // ghosts (online race)
    if (o.ghosts) for (const gh of o.ghosts()) if (gh.l === li) {
      g.globalAlpha = .45; drawTile(g, 'P', gh.x - 4, gh.y - (top ? 4 : 2), TS, sprites, t, { flip: gh.f < 0, anim: t * 10 }); g.globalAlpha = 1;
      g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(gh.name, gh.x + 12, gh.y - 8); g.fillText(gh.name, gh.x + 12, gh.y - 8);
    }
    if (!(P.inv > 0 && Math.floor(t * 14) % 2)) drawTile(g, 'P', P.x - 4, P.y - (top ? 4 : 2), TS, sprites, t, { flip: P.face < 0, anim: P.anim });
    for (const b of bullets) { g.fillStyle = b.mine ? '#fde047' : '#f87171'; g.beginPath(); g.arc(b.x, b.y, 4, 0, 7); g.fill(); }
    for (const p of parts) { g.globalAlpha = Math.max(0, p.t / .6); g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4); }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bannerT > 0) { bannerT -= 1 / 60; }
    const goalTxt = set.win === 'coins' ? `🪙 ${coins - (totalCoinsBefore())}/${totalCoins}` : set.win === 'enemies' ? `👾 ${ents.filter(e => (e.k === 'E' || e.k === 'F' || e.k === 'Z') && e.alive).length} left` : `🪙 ${coins}`;
    o.hud && o.hud(`${lives === Infinity ? '' : '❤️ ' + lives + '  '}${goalTxt}${keys ? '  🔑 ' + keys : ''}`, `${game.levels.length > 1 ? `Level ${li + 1}/${game.levels.length}  ` : ''}⏱ ${set.timer ? Math.ceil(timeLeft) : totalT.toFixed(1)}`, bannerT > 0 ? bannerTxt : '');
    o.sign && o.sign(signTxt);
  }
  let coinsAtLevel = 0;
  const totalCoinsBefore = () => coinsAtLevel;
  const origLoad = loadLevel;
  loadLevel = i => { coinsAtLevel = coins; origLoad(i); };
  function frame(now) {
    if (stopped) return;
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    // fixed small steps for stable collisions
    let n = Math.ceil(dt / (1 / 120)); for (let k = 0; k < n; k++) { update(dt / n); if (k < n - 1) { input.aPressed = input.aPressed && false; } }
    draw();
    raf = requestAnimationFrame(frame);
  }
  loadLevel(li);
  raf = requestAnimationFrame(frame);
  return {
    input, stop() { stopped = true; cancelAnimationFrame(raf); },
    restartLevel() { lives = set.lives || Infinity; state = 'play'; loadLevel(li); },
    get state() { return state; }, get level() { return li; }, get player() { return P; }, get time() { return totalT; },
    debug: { ents: () => ents, set, step: dt => update(dt), skipLevel: () => levelDone() },
  };
}

window.MakerEngine = { PAL, TILES, SOLID, THEMES, DEFAULT_SETTINGS, drawTile, drawSprite, drawBackground, blankLevel, exampleGame, run, spriteCanvas };
})();
