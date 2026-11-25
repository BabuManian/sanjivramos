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
  'O': ['Hole', 'Basic', '3D: an empty gap you can fall into'],
  'r': ['Stone', 'Blocks', 'Solid grey stone'],
  'w': ['Wood', 'Blocks', 'Solid wooden planks'],
  'm': ['Metal', 'Blocks', 'Solid steel with rivets'],
  'a': ['Sand', 'Blocks', 'Solid sand block'],
  'q': ['Glass', 'Blocks', 'Solid see-through glass'],
  'u': ['Gold block', 'Blocks', 'Solid shiny gold'],
  'c': ['Cloud', 'Blocks', 'Fluffy platform you can jump up through'],
  'h': ['Ladder', 'Blocks', 'Climb it: hold jump/up to go up, down to go down'],
  '?': ['Mystery block', 'Blocks', 'Bump it (jump into it from below) for a coin'],
  '>': ['Conveyor →', 'Blocks', 'Moves you to the right while you stand on it'],
  '<': ['Conveyor ←', 'Blocks', 'Moves you to the left while you stand on it'],
  'M': ['Moving platform', 'Blocks', 'Platform that slides left and right — ride it'],
  'V': ['Elevator', 'Blocks', 'Platform that goes up and down — ride it'],
  '!': ['Switch', 'Blocks', 'Touch it to swap red and blue blocks'],
  'R': ['Red block', 'Blocks', 'Solid until the switch is pressed'],
  'U': ['Blue block', 'Blocks', 'Only solid after the switch is pressed'],
  'g': ['Grass block', 'Blocks', 'Solid grassy block'],
  'l': ['Leaves', 'Blocks', 'Solid leafy block'],
  'v': ['Snow block', 'Blocks', 'Solid snow'],
  'y': ['Candy block', 'Blocks', 'Solid striped candy'],
  '7': ['Obsidian', 'Blocks', 'Solid dark stone — even TNT can’t break it'],
  '8': ['Hay bale', 'Blocks', 'Solid hay'],
  '5': ['Jelly', 'Blocks', 'Bouncy! Land on it to spring up (hold down to stop)'],
  '6': ['Honey', 'Blocks', 'Sticky — you walk and jump slowly on it'],
  '9': ['TNT', 'Blocks', 'Touch it or shoot it — boom! Breaks blocks and enemies nearby'],
  '{': ['Breakable brick', 'Blocks', 'Bump it from below or shoot it to smash it'],
  '}': ['Blink block', 'Blocks', 'Turns on and off every 2 seconds'],
  '_': ['Rope bridge', 'Blocks', 'Thin bridge you can jump up through'],
  '|': ['Vine', 'Blocks', 'Climb it like a ladder'],
  '/': ['Fan', 'Blocks', 'Blows you up into the air'],
  '[': ['Pipe', 'Blocks', 'Solid green pipe'],
  ']': ['Warp pipe', 'Blocks', 'Stand on it and press down to warp to the next warp pipe'],
  '&': ['Cactus', 'Blocks', 'Solid, but prickly — hurts to touch'],
  'G': ['Goal flag', 'Goals', 'Touch it to finish the level'],
  'C': ['Coin', 'Goals', 'Collect for points'],
  'K': ['Key', 'Goals', 'Opens one locked door'],
  'D': ['Locked door', 'Goals', 'Needs a key'],
  'H': ['Heart', 'Goals', 'Extra life'],
  'X': ['Checkpoint', 'Goals', 'You restart here after a hit'],
  'N': ['Sign', 'Goals', 'Shows a message when touched'],
  '$': ['Gem', 'Power-ups', 'Worth 5 points'],
  '+': ['Star', 'Power-ups', 'Invincible for 8 seconds — touch enemies to defeat them'],
  'j': ['Wings', 'Power-ups', 'Double jump for the rest of the level'],
  's': ['Speed shoes', 'Power-ups', 'Run super fast for 8 seconds'],
  'b': ['Blaster', 'Power-ups', 'Lets you shoot (X or J) for the rest of the level'],
  '0': ['Shield', 'Power-ups', 'Blocks the next hit'],
  'Â': ['Magnet', 'Power-ups', 'Pulls coins to you for 10 seconds'],
  'Ê': ['Feather', 'Power-ups', 'Floaty low gravity for 10 seconds'],
  'Î': ['Freeze clock', 'Power-ups', 'Freezes every enemy for 5 seconds'],
  'ý': ['Light orb', 'Power-ups', 'Your light shines twice as far for 20 seconds — shadows flee'],
  'S': ['Spikes', 'Danger', 'Hurts'],
  'L': ['Lava', 'Danger', 'Hurts'],
  'E': ['Walker', 'Danger', 'Enemy that walks side to side'],
  'F': ['Flyer', 'Danger', 'Enemy that flies up and down'],
  'Z': ['Turret', 'Danger', 'Shoots at you'],
  'e': ['Spiky', 'Danger', 'Walker with spikes — don’t jump on it!'],
  'Y': ['Hopper', 'Danger', 'Frog that hops towards you'],
  'Q': ['Ghost', 'Danger', 'Floats through walls after you — stops when you look at it'],
  'A': ['Saw blade', 'Danger', 'Spinning saw that flies side to side. Can’t be beaten'],
  'i': ['Icicle', 'Danger', 'Falls when you walk under it'],
  'f': ['Fire spinner', 'Danger', 'Ring of fireballs spinning around'],
  '%': ['Boss', 'Danger', 'Big boss with 6 hit points: jumps, chases and shoots'],
  '^': ['Ceiling spikes', 'Danger', 'Spikes hanging down — hurts'],
  'Ñ': ['Crusher', 'Danger', 'Heavy block that slams down when you walk under it'],
  'Ç': ['Bat', 'Danger', 'Hangs still, then swoops at you'],
  'Ø': ['Bomber bird', 'Danger', 'Flies along and drops bombs'],
  'Ö': ['Biter plant', 'Danger', 'Pops up and down — only safe when it’s hiding'],
  'Ü': ['Slime', 'Danger', 'Slow, wobbly and jumpy'],
  'ï': ['Zombie', 'Danger', 'Shuffles after you when you get close. Jump on it'],
  'ð': ['Shadow', 'Danger', 'Lives in the dark and drifts after you — runs from bright light'],
  'n': ['Villager', 'Characters', 'Friendly person who says something when you walk up'],
  'z': ['Wizard', 'Characters', 'Wise wizard who says something when you walk up'],
  '@': ['Robot', 'Characters', 'Helpful robot who says something when you walk up'],
  'k': ['Knight', 'Characters', 'Brave knight who says something when you walk up'],
  'd': ['Pet dog', 'Characters', 'Follows you everywhere'],
  'é': ['Queen', 'Characters', 'Royal queen who says something when you walk up'],
  'í': ['Alien', 'Characters', 'Friendly alien who says something when you walk up'],
  'ó': ['Chef', 'Characters', 'Cheerful chef who says something when you walk up'],
  'á': ['Pet cat', 'Characters', 'Follows you everywhere'],
  'ú': ['Chicken', 'Characters', 'Wanders around and runs away from you'],
  'J': ['Spring', 'Fun', 'Big bounce (top-down: speed boost)'],
  'T': ['Teleporter', 'Fun', 'Jumps you to the next teleporter'],
  'W': ['Water', 'Fun', 'Swim slowly through it'],
  't': ['Tree', 'Decoration', 'Just for looks — you walk past it'],
  'o': ['Bush', 'Decoration', 'Just for looks'],
  '*': ['Flower', 'Decoration', 'Just for looks'],
  'p': ['Grass', 'Decoration', 'Just for looks'],
  'x': ['Torch', 'Decoration', 'Flickering torch, just for looks'],
  '~': ['Cloud', 'Decoration', 'Floating cloud, just for looks'],
  '1': ['Mushroom', 'Decoration', 'Just for looks'],
  '2': ['Crystal', 'Decoration', 'Glowing crystal, just for looks'],
  '3': ['Rock', 'Decoration', 'Just for looks'],
  '4': ['Fence', 'Decoration', 'Just for looks'],
  'à': ['Palm tree', 'Decoration', 'Just for looks'],
  'è': ['Snowman', 'Decoration', 'Just for looks'],
  'ì': ['Pumpkin', 'Decoration', 'Just for looks'],
  'ò': ['Statue', 'Decoration', 'Just for looks'],
  'ù': ['Flag', 'Decoration', 'Waving flag, just for looks'],
  'â': ['Bones', 'Decoration', 'Spooky, just for looks'],
  'ê': ['Lantern', 'Decoration', 'Glowing lantern, just for looks'],
  'ô': ['Mailbox', 'Decoration', 'Just for looks'],
  'û': ['Sunflower', 'Decoration', 'Just for looks'],
  ':': ['Window', 'Decoration', 'A window on the wall behind you'],
  ';': ['Hanging vines', 'Decoration', 'Just for looks'],
  ',': ['Pebbles', 'Decoration', 'Just for looks'],
  'ñ': ['Candle', 'Decoration', 'A little light in dark levels'],
};
/** palette order (an object can't keep it: number-like keys such as '0' always come first) */
const TILE_ORDER = ["P", "#", "=", "-", "I", "B", "O", "r", "w", "m", "a", "q", "u", "c", "h", "?", ">", "<", "M", "V", "!", "R", "U", "g", "l", "v", "y", "7", "8", "5", "6", "9", "{", "}", "_", "|", "/", "[", "]", "&", "G", "C", "K", "D", "H", "X", "N", "$", "+", "j", "s", "b", "0", "Â", "Ê", "Î", "ý", "S", "L", "E", "F", "Z", "e", "Y", "Q", "A", "i", "f", "%", "^", "Ñ", "Ç", "Ø", "Ö", "Ü", "ï", "ð", "n", "z", "@", "k", "d", "é", "í", "ó", "á", "ú", "J", "T", "W", "t", "o", "*", "p", "x", "~", "1", "2", "3", "4", "à", "è", "ì", "ò", "ù", "â", "ê", "ô", "û", ":", ";", ",", "ñ"];
/** characters that say something (their text is stored like sign text) */
const TALK = new Set(['N', 'n', 'z', '@', 'k', 'é', 'í', 'ó']);
/** tiles that become moving things when the game runs */
const ENTS = new Set(['C', 'K', 'H', 'E', 'F', '$', '+', 'j', 's', 'b', '0', 'e', 'Y', 'Q', 'A', 'i', 'f', '%', 'n', 'z', '@', 'k', 'd', 'M', 'V', 'é', 'í', 'ó', 'á', 'ú', 'Ñ', 'Ç', 'Ø', 'Ö', 'Ü', 'Â', 'Ê', 'Î', 'ï', 'ð', 'ý']);
/** tiles that make no sense in some game types (hidden from the palette there) */
const NOT_IN = { topdown: new Set(['-', 'c', 'h', 'M', 'V', 'i', '_', '|', '/', '^', 'Ñ', '5']), platformer: new Set(['O']), '3d': new Set([]) };
const SOLID = new Set(['#', '=', 'I', 'B', 'D', 'Z', 'r', 'w', 'm', 'a', 'q', 'u', '?', '>', '<', 'R', 'U', 'g', 'l', 'v', 'y', '7', '8', '5', '6', '9', '{', '}', '/', '[', ']', '&']);
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
    case 'O': r(0, 0, 1, 1, '#05070d'); r(.08, .08, .84, .84, '#0f172a'); circ(.3, .35, .04, '#475569'); circ(.7, .6, .03, '#475569'); break;
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
    case 'r': r(0, 0, 1, 1, '#6b7280'); r(0, 0, 1, .1, '#9ca3af'); r(.08, .3, .38, .28, '#4b5563'); r(.55, .6, .35, .3, '#4b5563'); r(.5, .15, .3, .2, '#7b8494'); break;
    case 'w': r(0, 0, 1, 1, '#b45309'); for (const b of [.25, .5, .75]) r(0, b - .02, 1, .04, '#78350f'); r(.3, .02, .03, .21, '#78350f'); r(.7, .27, .03, .21, '#78350f'); r(.4, .52, .03, .21, '#78350f'); r(.15, .77, .03, .21, '#78350f'); break;
    case 'm': r(0, 0, 1, 1, '#64748b'); r(.04, .04, .92, .92, '#94a3b8'); r(.04, .04, .92, .08, '#cbd5e1'); for (const [a, b] of [[.15, .15], [.85, .15], [.15, .85], [.85, .85]]) circ(a, b, .05, '#475569'); break;
    case 'a': r(0, 0, 1, 1, '#fcd34d'); r(0, 0, 1, .12, '#fde68a'); for (const [a, b] of [[.2, .35], [.6, .5], [.35, .75], [.8, .8], [.75, .25]]) r(a, b, .06, .06, '#d97706'); break;
    case 'q': g.fillStyle = 'rgba(186,230,253,.28)'; g.fillRect(x, y, s, s); g.strokeStyle = 'rgba(224,242,254,.85)'; g.lineWidth = s * .05; g.strokeRect(x + s * .03, y + s * .03, s * .94, s * .94); r(.18, .15, .08, .4, 'rgba(255,255,255,.7)'); r(.32, .15, .05, .2, 'rgba(255,255,255,.5)'); break;
    case 'u': r(0, 0, 1, 1, '#ca8a04'); r(.06, .06, .88, .88, '#facc15'); r(.06, .06, .88, .12, '#fef08a'); g.fillStyle = 'rgba(255,255,255,' + (.35 + Math.sin(t * 3 + x) * .3) + ')'; g.beginPath(); g.moveTo(x + .2 * s, y + .75 * s); g.lineTo(x + .35 * s, y + .75 * s); g.lineTo(x + .75 * s, y + .25 * s); g.lineTo(x + .6 * s, y + .25 * s); g.fill(); break;
    case 'c': circ(.25, .25, .2, '#f8fafc'); circ(.5, .18, .24, '#fff'); circ(.75, .25, .2, '#f8fafc'); r(.08, .22, .84, .16, '#fff'); r(.08, .36, .84, .05, '#cbd5e1'); break;
    case 'h': r(.15, 0, .1, 1, '#a16207'); r(.75, 0, .1, 1, '#a16207'); for (const b of [.12, .37, .62, .87]) r(.15, b, .7, .08, '#ca8a04'); break;
    case '?': if (opts.used) { r(0, 0, 1, 1, '#78350f'); r(.06, .06, .88, .88, '#92400e'); break; } r(0, 0, 1, 1, '#b45309'); r(.05, .05, .9, .9, '#f59e0b'); for (const [a, b] of [[.12, .12], [.82, .12], [.12, .82], [.82, .82]]) r(a, b, .06, .06, '#92400e'); g.fillStyle = '#fff'; g.font = `bold ${s * .62}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x + s / 2, y + s * .54 + Math.sin(t * 4) * s * .03); break;
    case '>': case '<': { r(0, .1, 1, .8, '#334155'); r(0, .1, 1, .12, '#64748b'); r(0, .78, 1, .12, '#64748b'); const d = ch === '>' ? 1 : -1, off = ((t * 1.2 * d) % 1 + 1) % 1; g.fillStyle = '#fbbf24'; for (let k = -1; k < 2; k++) { const cx = x + ((k + off) * .5 + .25) * s; if (cx < x - s * .1 || cx > x + s * 1.05) continue; g.beginPath(); g.moveTo(cx - d * .1 * s, y + .35 * s); g.lineTo(cx + d * .1 * s, y + .5 * s); g.lineTo(cx - d * .1 * s, y + .65 * s); g.fill(); } break; }
    case 'M': case 'V': r(0, 0, 1, .38, '#0ea5e9'); r(0, 0, 1, .1, '#7dd3fc'); r(.05, .38, .9, .08, '#0369a1'); g.fillStyle = '#e0f2fe'; g.font = `bold ${s * .28}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch === 'M' ? '⇆' : '⇅', x + s / 2, y + s * .22); break;
    case '!': { const on = !!opts.sw; r(.1, .78, .8, .22, '#4b5563'); r(.22, on ? .7 : .55, .56, on ? .1 : .25, on ? '#3b82f6' : '#ef4444'); break; }
    case 'R': case 'U': { const solid = (ch === 'R') !== !!opts.sw, col = ch === 'R' ? '#ef4444' : '#3b82f6'; if (solid) { r(0, 0, 1, 1, col); r(.08, .08, .84, .84, ch === 'R' ? '#f87171' : '#60a5fa'); r(.3, .3, .4, .4, col); } else { g.strokeStyle = col; g.lineWidth = s * .06; g.setLineDash([s * .14, s * .1]); g.strokeRect(x + s * .08, y + s * .08, s * .84, s * .84); g.setLineDash([]); } break; }
    case '$': { const k = 1 + Math.sin(t * 4) * .05; g.fillStyle = '#22d3ee'; g.beginPath(); g.moveTo(x + .5 * s, y + (.5 - .38 * k) * s); g.lineTo(x + (.5 + .3 * k) * s, y + .4 * s); g.lineTo(x + .5 * s, y + (.5 + .38 * k) * s); g.lineTo(x + (.5 - .3 * k) * s, y + .4 * s); g.fill(); g.fillStyle = '#a5f3fc'; g.beginPath(); g.moveTo(x + .5 * s, y + .16 * s); g.lineTo(x + .66 * s, y + .4 * s); g.lineTo(x + .5 * s, y + .46 * s); g.fill(); break; }
    case '+': { g.fillStyle = `hsl(${(t * 200) % 360},95%,60%)`; g.beginPath(); for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rad = (k % 2 ? .18 : .42) * s; g.lineTo(x + .5 * s + Math.cos(an) * rad, y + .52 * s + Math.sin(an) * rad); } g.fill(); circ(.42, .48, .04, '#111'); circ(.58, .48, .04, '#111'); break; }
    case 'j': { const f = Math.sin(t * 8) * .06; g.fillStyle = '#fff'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(x + (.5 + d * .2) * s, y + (.45 + f * d) * s, .22 * s, .12 * s, d * -.5, 0, 7); g.fill(); } circ(.5, .55, .1, '#fbbf24'); break; }
    case 's': r(.15, .5, .55, .3, '#ef4444'); r(.15, .75, .75, .1, '#f8fafc'); r(.15, .3, .25, .25, '#ef4444'); r(.25, .55, .4, .05, '#fff'); g.strokeStyle = '#fbbf24'; g.lineWidth = s * .05; g.beginPath(); for (const b of [.4, .55, .7]) { g.moveTo(x + .02 * s, y + b * s); g.lineTo(x + (.1 + Math.sin(t * 10 + b * 9) * .03) * s, y + b * s); } g.stroke(); break;
    case 'b': r(.15, .38, .62, .2, '#475569'); r(.72, .42, .18, .12, '#1e293b'); r(.22, .55, .16, .3, '#334155'); r(.2, .34, .3, .06, '#22d3ee'); circ(.9, .48, .05 + Math.abs(Math.sin(t * 6)) * .03, '#fde047'); break;
    case '0': { g.strokeStyle = `rgba(56,189,248,${.6 + Math.sin(t * 5) * .25})`; g.lineWidth = s * .09; g.beginPath(); g.arc(x + .5 * s, y + .5 * s, .34 * s, 0, 7); g.stroke(); g.fillStyle = 'rgba(125,211,252,.25)'; g.fill(); r(.36, .3, .12, .06, 'rgba(255,255,255,.8)'); break; }
    case 'e': circ(.5, .62, .34, '#16a34a'); g.fillStyle = '#e5e7eb'; for (let k = 0; k < 5; k++) { const an = Math.PI + k * Math.PI / 4, cx = x + .5 * s + Math.cos(an) * .32 * s, cy = y + .62 * s + Math.sin(an) * .32 * s; g.beginPath(); g.moveTo(cx + Math.cos(an) * .2 * s, cy + Math.sin(an) * .2 * s); g.lineTo(cx + Math.cos(an + 1.6) * .07 * s, cy + Math.sin(an + 1.6) * .07 * s); g.lineTo(cx + Math.cos(an - 1.6) * .07 * s, cy + Math.sin(an - 1.6) * .07 * s); g.fill(); } circ(.4, .6, .07, '#fff'); circ(.6, .6, .07, '#fff'); circ(.41, .62, .035, '#000'); circ(.59, .62, .035, '#000'); break;
    case 'Y': { const sq = opts.air ? -.06 : .04; g.fillStyle = '#22c55e'; g.beginPath(); g.ellipse(x + .5 * s, y + (.68 + sq) * s, .38 * s, (.26 - sq) * s, 0, 0, 7); g.fill(); circ(.32, .42 + sq, .12, '#22c55e'); circ(.68, .42 + sq, .12, '#22c55e'); circ(.32, .42 + sq, .06, '#fff'); circ(.68, .42 + sq, .06, '#fff'); circ(.32, .43 + sq, .03, '#000'); circ(.68, .43 + sq, .03, '#000'); r(.38, .72 + sq, .24, .04, '#14532d'); r(.08, .9, .25, .08, '#15803d'); r(.67, .9, .25, .08, '#15803d'); break; }
    case 'Q': { const wv = Math.sin(t * 3) * .04; g.fillStyle = opts.shy ? 'rgba(241,245,249,.55)' : 'rgba(241,245,249,.92)'; g.beginPath(); g.arc(x + .5 * s, y + (.45 + wv) * s, .34 * s, Math.PI, 0); for (let k = 0; k <= 4; k++) g.lineTo(x + (.84 - k * .17) * s, y + (.9 + wv + (k % 2 ? -.08 : 0)) * s); g.fill(); if (opts.shy) { r(.3, .35 + wv, .15, .1, '#94a3b8'); r(.55, .35 + wv, .15, .1, '#94a3b8'); } else { circ(.38, .42 + wv, .07, '#111'); circ(.62, .42 + wv, .07, '#111'); g.fillStyle = '#111'; g.beginPath(); g.ellipse(x + .5 * s, y + (.62 + wv) * s, .08 * s, .1 * s, 0, 0, 7); g.fill(); } break; }
    case 'A': { g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(t * 12); g.fillStyle = '#cbd5e1'; g.beginPath(); for (let k = 0; k < 16; k++) { const rad = (k % 2 ? .3 : .46) * s, an = k * Math.PI / 8; g.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); } g.fill(); g.fillStyle = '#64748b'; g.beginPath(); g.arc(0, 0, .14 * s, 0, 7); g.fill(); g.restore(); break; }
    case 'i': g.fillStyle = '#bae6fd'; g.beginPath(); g.moveTo(x + .15 * s, y); g.lineTo(x + .85 * s, y); g.lineTo(x + .5 * s, y + .95 * s); g.fill(); g.fillStyle = '#f0f9ff'; g.beginPath(); g.moveTo(x + .35 * s, y); g.lineTo(x + .5 * s, y); g.lineTo(x + .45 * s, y + .5 * s); g.fill(); break;
    case 'f': circ(.5, .5, .2, '#57534e'); circ(.5, .5, .1, '#f97316'); if (!opts.live) { g.fillStyle = '#f97316'; for (let k = 1; k <= 2; k++) { g.beginPath(); g.arc(x + (.5 + k * .2 * Math.cos(t * 2)) * s, y + (.5 + k * .2 * Math.sin(t * 2)) * s, .08 * s, 0, 7); g.fill(); } } break;
    case '%': { const big = opts.big || 1, ss = s * big; const R2 = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(x + a * ss, y + b * ss, w * ss, h * ss); }, C2 = (cx, cy, rad, c) => { g.fillStyle = c; g.beginPath(); g.arc(x + cx * ss, y + cy * ss, rad * ss, 0, 7); g.fill(); };
      C2(.5, .58, .42, opts.hurt ? '#fff' : '#b91c1c'); C2(.5, .62, .3, opts.hurt ? '#fecaca' : '#ef4444'); g.fillStyle = '#fbbf24'; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + (.5 + d * .22) * ss, y + .24 * ss); g.lineTo(x + (.5 + d * .38) * ss, y + .0 * ss); g.lineTo(x + (.5 + d * .34) * ss, y + .3 * ss); g.fill(); }
      C2(.36, .48, .09, '#fff'); C2(.64, .48, .09, '#fff'); C2(.38, .5, .045, '#000'); C2(.62, .5, .045, '#000'); R2(.26, .36, .2, .05, '#450a0a'); R2(.54, .36, .2, .05, '#450a0a'); R2(.34, .72, .32, .07, '#450a0a'); g.fillStyle = '#fff'; for (let k = 0; k < 4; k++) R2(.36 + k * .075, .72, .04, .05, '#fff'); R2(.2, .93, .2, .07, '#7f1d1d'); R2(.6, .93, .2, .07, '#7f1d1d'); break; }
    case 'n': case 'z': case '@': case 'k': drawPerson(g, ch, x, y, s, opts.flip, opts.anim || 0); break;
    case 'd': { const b = Math.abs(Math.sin(opts.anim || 0)) * .05, f = opts.flip ? -1 : 1, X = v => x + (f > 0 ? v : 1 - v) * s; g.fillStyle = '#b45309'; g.beginPath(); g.ellipse(X(.45), y + (.68 - b) * s, .28 * s, .17 * s, 0, 0, 7); g.fill(); g.beginPath(); g.arc(X(.74), y + (.48 - b) * s, .16 * s, 0, 7); g.fill(); g.fillStyle = '#78350f'; g.beginPath(); g.ellipse(X(.68), y + (.42 - b) * s, .06 * s, .12 * s, f * .4, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(X(.8), y + (.45 - b) * s, .03 * s, 0, 7); g.arc(X(.9), y + (.5 - b) * s, .035 * s, 0, 7); g.fill(); g.fillStyle = '#b45309'; for (const v of [.25, .38, .55, .65]) g.fillRect(Math.min(X(v), X(v + .07)), y + (.78 - b) * s, .07 * s, .2 * s + b * s); g.strokeStyle = '#b45309'; g.lineWidth = .07 * s; g.beginPath(); g.moveTo(X(.2), y + .62 * s); g.lineTo(X(.08), y + (.45 + Math.sin(t * 14) * .06) * s); g.stroke(); break; }
    case 't': r(.4, .45, .2, .55, '#78350f'); circ(.5, .3, .34, '#15803d'); circ(.3, .42, .22, '#16a34a'); circ(.7, .42, .22, '#16a34a'); circ(.5, .12, .2, '#22c55e'); break;
    case 'o': circ(.3, .7, .25, '#15803d'); circ(.7, .7, .25, '#15803d'); circ(.5, .58, .3, '#16a34a'); circ(.4, .55, .05, '#ef4444'); circ(.65, .65, .05, '#ef4444'); r(0, .9, 1, .1, 'rgba(0,0,0,0)'); break;
    case '*': r(.47, .5, .06, .5, '#16a34a'); r(.53, .7, .15, .05, '#16a34a'); for (let k = 0; k < 5; k++) { const an = k * Math.PI * 2 / 5 + Math.sin(t) * .1; circ(.5 + Math.cos(an) * .14, .38 + Math.sin(an) * .14, .1, '#f472b6'); } circ(.5, .38, .08, '#fde047'); break;
    case 'p': g.strokeStyle = '#22c55e'; g.lineWidth = s * .06; g.beginPath(); for (const [a, h] of [[.2, .35], [.35, .5], [.5, .3], [.65, .45], [.8, .3]]) { g.moveTo(x + a * s, y + s); g.quadraticCurveTo(x + (a + .02) * s, y + (1 - h / 2) * s, x + (a + .06 + Math.sin(t * 2 + a * 9) * .03) * s, y + (1 - h) * s); } g.stroke(); break;
    case 'x': { r(.44, .45, .12, .55, '#78350f'); r(.38, .4, .24, .08, '#57534e'); const fl = Math.sin(t * 17 + x) * .04; g.fillStyle = 'rgba(251,191,36,.18)'; g.beginPath(); g.arc(x + .5 * s, y + .28 * s, .42 * s, 0, 7); g.fill(); g.fillStyle = '#f97316'; g.beginPath(); g.ellipse(x + .5 * s, y + (.28 + fl) * s, .12 * s, .18 * s, 0, 0, 7); g.fill(); g.fillStyle = '#fde047'; g.beginPath(); g.ellipse(x + .5 * s, y + (.32 + fl) * s, .06 * s, .1 * s, 0, 0, 7); g.fill(); break; }
    case '~': { const d = Math.sin(t * .8 + x * .01) * .05; circ(.3 + d, .5, .18, 'rgba(255,255,255,.85)'); circ(.52 + d, .42, .22, 'rgba(255,255,255,.9)'); circ(.72 + d, .52, .16, 'rgba(255,255,255,.85)'); r(.25 + d, .5, .5, .16, 'rgba(255,255,255,.9)'); break; }
    case '1': r(.42, .55, .16, .45, '#fef3c7'); g.fillStyle = '#dc2626'; g.beginPath(); g.ellipse(x + .5 * s, y + .55 * s, .36 * s, .3 * s, 0, Math.PI, 0); g.fill(); circ(.36, .42, .06, '#fff'); circ(.6, .36, .07, '#fff'); circ(.68, .5, .04, '#fff'); break;
    case '2': { g.fillStyle = `rgba(168,85,247,${.15 + Math.sin(t * 2 + x) * .08})`; g.beginPath(); g.arc(x + .5 * s, y + .6 * s, .45 * s, 0, 7); g.fill(); for (const [a, h, w2] of [[.5, .8, .14], [.3, .5, .1], [.7, .55, .1]]) { g.fillStyle = '#a855f7'; g.beginPath(); g.moveTo(x + (a - w2) * s, y + s); g.lineTo(x + a * s, y + (1 - h) * s); g.lineTo(x + (a + w2) * s, y + s); g.fill(); g.fillStyle = '#e9d5ff'; g.beginPath(); g.moveTo(x + (a - w2 * .3) * s, y + .95 * s); g.lineTo(x + a * s, y + (1 - h * .9) * s); g.lineTo(x + a * s, y + .95 * s); g.fill(); } break; }
    case '3': g.fillStyle = '#78716c'; g.beginPath(); g.ellipse(x + .5 * s, y + .78 * s, .4 * s, .24 * s, 0, 0, 7); g.fill(); g.fillStyle = '#a8a29e'; g.beginPath(); g.ellipse(x + .42 * s, y + .7 * s, .2 * s, .1 * s, -.3, 0, 7); g.fill(); break;
    case '4': r(.12, .35, .12, .65, '#d6a756'); r(.76, .35, .12, .65, '#d6a756'); r(0, .5, 1, .1, '#b45309'); r(0, .75, 1, .1, '#b45309'); g.fillStyle = '#d6a756'; for (const a of [.12, .76]) { g.beginPath(); g.moveTo(x + a * s, y + .35 * s); g.lineTo(x + (a + .06) * s, y + .25 * s); g.lineTo(x + (a + .12) * s, y + .35 * s); g.fill(); } break;
    case 'g': r(0, 0, 1, 1, '#854d0e'); r(0, 0, 1, .3, '#16a34a'); for (let k = 0; k < 5; k++) r(k * .2 + .04, .28, .1, .08 + (k % 2) * .06, '#16a34a'); r(.6, .6, .12, .08, '#713f12'); break;
    case 'l': r(0, 0, 1, 1, '#15803d'); for (const [a, b2] of [[.2, .2], [.6, .15], [.4, .5], [.8, .6], [.15, .75], [.6, .85]]) circ(a, b2, .14, '#22c55e'); break;
    case 'v': r(0, 0, 1, 1, '#e2e8f0'); r(0, 0, 1, .25, '#fff'); circ(.3, .55, .05, '#cbd5e1'); circ(.7, .7, .04, '#cbd5e1'); break;
    case 'y': r(0, 0, 1, 1, '#fdf2f8'); g.fillStyle = '#ec4899'; for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(x + k * .5 * s, y + s); g.lineTo(x + (k * .5 + .25) * s, y + s); g.lineTo(x + (k * .5 + 1.25) * s, y); g.lineTo(x + (k * .5 + 1) * s, y); g.fill(); } g.strokeStyle = '#be185d'; g.lineWidth = s * .04; g.strokeRect(x, y, s, s); break;
    case '7': r(0, 0, 1, 1, '#1e1b4b'); r(.1, .15, .3, .2, '#312e81'); r(.55, .55, .3, .25, '#312e81'); r(.6, .2, .08, .08, '#7c3aed'); break;
    case '8': r(0, .05, 1, .95, '#eab308'); r(0, .05, 1, .1, '#fde047'); g.strokeStyle = '#a16207'; g.lineWidth = s * .03; g.beginPath(); for (let k = 1; k < 6; k++) { g.moveTo(x + k * .17 * s, y + .2 * s); g.lineTo(x + (k * .17 - .05) * s, y + .95 * s); } g.stroke(); r(0, .45, 1, .07, '#92400e'); break;
    case '5': { const sq = Math.sin(t * 6 + x) * .03; g.fillStyle = 'rgba(74,222,128,.85)'; g.beginPath(); g.roundRect(x + .02 * s, y + (.08 + sq) * s, .96 * s, (.9 - sq) * s, .22 * s); g.fill(); r(.15, .2 + sq, .25, .1, 'rgba(255,255,255,.7)'); circ(.35, .55, .05, '#14532d'); circ(.65, .55, .05, '#14532d'); break; }
    case '6': r(0, .1, 1, .9, '#d97706'); g.fillStyle = '#fbbf24'; g.beginPath(); g.moveTo(x, y + .1 * s); for (let k = 0; k <= 5; k++) g.lineTo(x + k * .2 * s, y + (.1 + (k % 2 ? .25 : .05)) * s); g.lineTo(x + s, y + .1 * s); g.fill(); r(.15, .45, .1, .1, '#fde68a'); break;
    case '9': r(.05, .1, .9, .9, '#dc2626'); r(.05, .45, .9, .2, '#f8fafc'); g.fillStyle = '#111'; g.font = `bold ${s * .2}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TNT', x + s / 2, y + .56 * s); r(.47, 0, .06, .12, '#78350f'); if (opts.fuse) circ(.5, 0, .08 + Math.random() * .05, '#fde047'); break;
    case '{': r(0, 0, 1, 1, '#c2410c'); r(.04, .04, .92, .42, '#ea580c'); r(.04, .54, .42, .42, '#ea580c'); r(.54, .54, .42, .42, '#ea580c'); r(.1, .1, .2, .06, '#fdba74'); break;
    case '}': if (opts.on === false) { g.strokeStyle = '#a78bfa'; g.lineWidth = s * .05; g.setLineDash([s * .12, s * .1]); g.strokeRect(x + s * .08, y + s * .08, s * .84, s * .84); g.setLineDash([]); } else { r(0, 0, 1, 1, '#7c3aed'); r(.08, .08, .84, .84, '#a78bfa'); circ(.5, .5, .16, '#ede9fe'); } break;
    case '_': r(0, .08, 1, .14, '#a16207'); for (let k = 0; k < 5; k++) r(k * .2 + .02, .06, .16, .18, '#ca8a04'); g.strokeStyle = '#78350f'; g.lineWidth = s * .03; g.beginPath(); g.moveTo(x, y + .04 * s); g.quadraticCurveTo(x + .5 * s, y + .14 * s, x + s, y + .04 * s); g.stroke(); break;
    case '|': g.strokeStyle = '#16a34a'; g.lineWidth = s * .1; g.beginPath(); g.moveTo(x + .5 * s, y); for (let k = 1; k <= 4; k++) g.lineTo(x + (.5 + (k % 2 ? .12 : -.12)) * s, y + k * .25 * s); g.stroke(); for (const b2 of [.2, .6]) { g.fillStyle = '#22c55e'; g.beginPath(); g.ellipse(x + .66 * s, y + b2 * s, .12 * s, .06 * s, .5, 0, 7); g.fill(); } break;
    case '/': { r(0, .55, 1, .45, '#475569'); r(.05, .6, .9, .35, '#64748b'); g.save(); g.translate(x + .5 * s, y + .77 * s); g.scale(1, .35); g.rotate(t * 14); g.fillStyle = '#e2e8f0'; for (let k = 0; k < 3; k++) { g.rotate(Math.PI * 2 / 3); g.beginPath(); g.ellipse(.2 * s, 0, .2 * s, .07 * s, 0, 0, 7); g.fill(); } g.restore(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = s * .03; g.beginPath(); for (const a of [.25, .5, .75]) { const yy = ((t * 2 + a) % 1) * .5; g.moveTo(x + a * s, y + (.5 - yy) * s); g.lineTo(x + a * s, y + (.35 - yy) * s); } g.stroke(); break; }
    case '[': r(.08, 0, .84, 1, '#15803d'); r(.18, 0, .14, 1, '#4ade80'); r(.7, 0, .1, 1, '#166534'); break;
    case ']': r(.08, .25, .84, .75, '#15803d'); r(0, 0, 1, .3, '#16a34a'); r(.08, .03, .22, .24, '#4ade80'); r(.18, .3, .12, .7, '#4ade80'); r(.15, .08, .7, .12, '#052e16'); break;
    case '&': r(.32, .05, .36, .95, '#16a34a'); r(.06, .35, .18, .1, '#16a34a'); r(.06, .2, .1, .25, '#16a34a'); r(.76, .5, .18, .1, '#16a34a'); r(.84, .3, .1, .3, '#16a34a'); g.fillStyle = '#fef9c3'; for (const [a, b2] of [[.3, .2], [.7, .3], [.3, .55], [.7, .7], [.3, .85], [.5, .05]]) g.fillRect(x + a * s - 1, y + b2 * s, s * .06, s * .03); break;
    case '^': g.fillStyle = '#d4d4d8'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + (k / 3) * s, y); g.lineTo(x + (k / 3 + 1 / 6) * s, y + .55 * s); g.lineTo(x + ((k + 1) / 3) * s, y); g.fill(); } r(0, 0, 1, .06, '#52525b'); break;
    case 'Ñ': r(.02, 0, .96, 1, '#57534e'); r(.08, .06, .84, .88, '#78716c'); g.fillStyle = '#e7e5e4'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + (k * .25) * s, y + s); g.lineTo(x + (k * .25 + .125) * s, y + 1.12 * s); g.lineTo(x + (k + 1) * .25 * s, y + s); g.fill(); } r(.25, .3, .15, .12, opts.angry ? '#ef4444' : '#1c1917'); r(.6, .3, .15, .12, opts.angry ? '#ef4444' : '#1c1917'); r(.3, .62, .4, .07, '#1c1917'); break;
    case 'Ç': { const fl = opts.hang ? 0 : Math.sin(t * 22) * .15; g.fillStyle = '#4c1d95'; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(x + .5 * s, y + .45 * s); g.lineTo(x + (.5 + d * .45) * s, y + (.3 - fl) * s); g.lineTo(x + (.5 + d * .35) * s, y + (.6 - fl * .5) * s); g.lineTo(x + (.5 + d * .2) * s, y + .55 * s); g.fill(); } circ(.5, .48, .16, '#6d28d9'); circ(.44, .45, .04, '#fde047'); circ(.56, .45, .04, '#fde047'); break; }
    case 'Ø': { const fl = Math.sin(t * 16) * .12; circ(.5, .5, .24, '#0f172a'); g.fillStyle = '#1e293b'; g.beginPath(); g.ellipse(x + .3 * s, y + (.4 + fl) * s, .2 * s, .08 * s, -.3, 0, 7); g.ellipse(x + .7 * s, y + (.4 + fl) * s, .2 * s, .08 * s, .3, 0, 7); g.fill(); circ(opts.flip ? .62 : .38, .45, .05, '#fff'); g.fillStyle = '#f59e0b'; g.beginPath(); const bx = opts.flip ? .72 : .28, d = opts.flip ? 1 : -1; g.moveTo(x + bx * s, y + .48 * s); g.lineTo(x + (bx + d * .16) * s, y + .53 * s); g.lineTo(x + bx * s, y + .58 * s); g.fill(); break; }
    case 'Ö': { const up = opts.up == null ? 1 : opts.up; r(.15, .75, .7, .25, '#15803d'); r(.1, .7, .8, .1, '#16a34a'); if (up > .05) { const top = .75 - .6 * up; r(.45, top + .3, .1, .75 - top - .3, '#16a34a'); circ(.5, top + .2, .22, '#dc2626'); g.fillStyle = '#fff'; for (let k = 0; k < 4; k++) g.fillRect(x + (.32 + k * .1) * s, y + (top + .18) * s, .05 * s, .05 * s); circ(.42, top + .08, .04, '#fff'); circ(.58, top + .08, .04, '#fff'); } break; }
    case 'Ü': { const sq = opts.air ? -.08 : Math.sin(t * 5 + x) * .04; g.fillStyle = 'rgba(132,204,22,.9)'; g.beginPath(); g.ellipse(x + .5 * s, y + (.7 - sq) * s, (.4 + sq) * s, (.28 - sq) * s, 0, 0, 7); g.fill(); r(.25, .55, .1, .06, 'rgba(255,255,255,.7)'); circ(.4, .66, .05, '#1a2e05'); circ(.6, .66, .05, '#1a2e05'); break; }
    case 'Â': g.lineWidth = s * .16; g.strokeStyle = '#dc2626'; g.beginPath(); g.arc(x + .5 * s, y + .45 * s, .26 * s, Math.PI, 0); g.stroke(); r(.16, .45, .16, .3, '#dc2626'); r(.68, .45, .16, .3, '#dc2626'); r(.16, .7, .16, .12, '#e5e7eb'); r(.68, .7, .16, .12, '#e5e7eb'); break;
    case 'Ê': { const w2 = Math.sin(t * 3) * .08; g.save(); g.translate(x + .5 * s, y + .5 * s); g.rotate(-.7 + w2); g.fillStyle = '#e0f2fe'; g.beginPath(); g.ellipse(0, 0, .14 * s, .42 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#7dd3fc'; g.lineWidth = s * .03; g.beginPath(); g.moveTo(0, -.4 * s); g.lineTo(0, .45 * s); g.stroke(); g.restore(); break; }
    case 'Î': circ(.5, .55, .34, '#0ea5e9'); circ(.5, .55, .27, '#e0f2fe'); r(.47, .32, .06, .25, '#0f172a'); r(.5, .52, .17, .05, '#0f172a'); r(.38, .12, .24, .1, '#0ea5e9'); g.fillStyle = 'rgba(186,230,253,' + (.3 + Math.sin(t * 4) * .2) + ')'; g.fillRect(x, y, s * .15, s * .15); break;
    case 'é': case 'í': case 'ó': drawPerson(g, ch, x, y, s, opts.flip, opts.anim || 0); break;
    case 'á': { const b = Math.abs(Math.sin(opts.anim || 0)) * .05, f = opts.flip ? -1 : 1, X = v => x + (f > 0 ? v : 1 - v) * s; g.fillStyle = '#9ca3af'; g.beginPath(); g.ellipse(X(.45), y + (.7 - b) * s, .26 * s, .14 * s, 0, 0, 7); g.fill(); g.beginPath(); g.arc(X(.74), y + (.52 - b) * s, .15 * s, 0, 7); g.fill(); for (const v of [.64, .82]) { g.beginPath(); g.moveTo(X(v), y + (.42 - b) * s); g.lineTo(X(v + .04), y + (.28 - b) * s); g.lineTo(X(v + .09), y + (.42 - b) * s); g.fill(); } g.fillStyle = '#84cc16'; g.beginPath(); g.arc(X(.7), y + (.5 - b) * s, .03 * s, 0, 7); g.arc(X(.8), y + (.5 - b) * s, .03 * s, 0, 7); g.fill(); g.fillStyle = '#9ca3af'; for (const v of [.27, .38, .52, .6]) g.fillRect(Math.min(X(v), X(v + .06)), y + (.8 - b) * s, .06 * s, .2 * s + b * s); g.strokeStyle = '#9ca3af'; g.lineWidth = .06 * s; g.beginPath(); g.moveTo(X(.2), y + .66 * s); g.quadraticCurveTo(X(.02), y + .6 * s, X(.08), y + (.3 + Math.sin(t * 4) * .05) * s); g.stroke(); break; }
    case 'ú': { const b = Math.abs(Math.sin(opts.anim || 0)) * .06, f = opts.flip ? -1 : 1, X = v => x + (f > 0 ? v : 1 - v) * s; g.fillStyle = '#f8fafc'; g.beginPath(); g.ellipse(X(.45), y + (.62 - b) * s, .26 * s, .22 * s, 0, 0, 7); g.fill(); g.beginPath(); g.arc(X(.68), y + (.38 - b) * s, .13 * s, 0, 7); g.fill(); g.fillStyle = '#ef4444'; g.beginPath(); g.arc(X(.68), y + (.24 - b) * s, .05 * s, 0, 7); g.fill(); g.fillStyle = '#f59e0b'; g.beginPath(); g.moveTo(X(.79), y + (.36 - b) * s); g.lineTo(X(.92), y + (.4 - b) * s); g.lineTo(X(.79), y + (.44 - b) * s); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(X(.71), y + (.35 - b) * s, .025 * s, 0, 7); g.fill(); g.fillStyle = '#f59e0b'; g.fillRect(Math.min(X(.4), X(.44)), y + .82 * s, .04 * s, .16 * s); g.fillRect(Math.min(X(.52), X(.56)), y + .82 * s, .04 * s, .16 * s); break; }
    case 'à': r(.44, .3, .12, .7, '#a16207'); for (let k = 0; k < 4; k++) r(.44, .35 + k * .17, .12, .03, '#78350f'); g.fillStyle = '#16a34a'; for (const an of [-2.6, -2, -1.1, -.5]) { g.beginPath(); g.ellipse(x + (.5 + Math.cos(an) * .25) * s, y + (.25 + Math.sin(an) * .12 + .1) * s, .26 * s, .07 * s, an + Math.PI / 2 + Math.PI / 2, 0, 7); g.fill(); } circ(.46, .34, .05, '#78350f'); circ(.56, .36, .05, '#78350f'); break;
    case 'è': circ(.5, .75, .24, '#f8fafc'); circ(.5, .42, .17, '#f8fafc'); circ(.45, .38, .025, '#111'); circ(.55, .38, .025, '#111'); g.fillStyle = '#f97316'; g.beginPath(); g.moveTo(x + .5 * s, y + .43 * s); g.lineTo(x + .66 * s, y + .46 * s); g.lineTo(x + .5 * s, y + .48 * s); g.fill(); r(.36, .22, .28, .06, '#111'); r(.41, .06, .18, .17, '#111'); r(.35, .54, .3, .05, '#dc2626'); circ(.5, .7, .025, '#111'); circ(.5, .8, .025, '#111'); break;
    case 'ì': g.fillStyle = '#ea580c'; g.beginPath(); g.ellipse(x + .5 * s, y + .68 * s, .4 * s, .3 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#c2410c'; g.lineWidth = s * .03; g.beginPath(); g.ellipse(x + .5 * s, y + .68 * s, .15 * s, .3 * s, 0, 0, 7); g.stroke(); r(.47, .3, .07, .12, '#166534'); g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(x + .33 * s, y + .62 * s); g.lineTo(x + .4 * s, y + .55 * s); g.lineTo(x + .45 * s, y + .62 * s); g.moveTo(x + .55 * s, y + .62 * s); g.lineTo(x + .6 * s, y + .55 * s); g.lineTo(x + .67 * s, y + .62 * s); g.fill(); r(.36, .74, .28, .05, '#fde047'); break;
    case 'ò': r(.25, .8, .5, .2, '#a8a29e'); r(.32, .75, .36, .06, '#d6d3d1'); circ(.5, .25, .13, '#d6d3d1'); r(.37, .38, .26, .38, '#d6d3d1'); r(.28, .4, .1, .22, '#d6d3d1'); r(.62, .25, .08, .3, '#d6d3d1'); break;
    case 'ù': { r(.2, .05, .05, .95, '#9ca3af'); g.fillStyle = '#ef4444'; g.beginPath(); g.moveTo(x + .25 * s, y + .08 * s); for (let k = 0; k <= 6; k++) g.lineTo(x + (.25 + k * .1) * s, y + (.1 + Math.sin(t * 6 - k) * .04) * s); for (let k = 6; k >= 0; k--) g.lineTo(x + (.25 + k * .1) * s, y + (.42 + Math.sin(t * 6 - k) * .04) * s); g.fill(); circ(.22, .04, .05, '#facc15'); break; }
    case 'â': g.fillStyle = '#e7e5e4'; g.beginPath(); g.arc(x + .4 * s, y + .72 * s, .16 * s, 0, 7); g.fill(); r(.32, .8, .16, .1, '#e7e5e4'); circ(.34, .7, .04, '#292524'); circ(.46, .7, .04, '#292524'); g.save(); g.translate(x + .7 * s, y + .85 * s); g.rotate(.5); g.fillRect(-.18 * s, -.03 * s, .36 * s, .06 * s); g.beginPath(); g.arc(-.18 * s, 0, .05 * s, 0, 7); g.arc(.18 * s, 0, .05 * s, 0, 7); g.fill(); g.restore(); break;
    case 'ê': { const fl = Math.sin(t * 9 + x) * .02; g.strokeStyle = '#57534e'; g.lineWidth = s * .03; g.beginPath(); g.moveTo(x + .5 * s, y); g.lineTo(x + .5 * s, y + .25 * s); g.stroke(); g.fillStyle = `rgba(253,224,71,${.18 + fl * 2})`; g.beginPath(); g.arc(x + .5 * s, y + .5 * s, .45 * s, 0, 7); g.fill(); r(.32, .25, .36, .06, '#292524'); r(.35, .31, .3, .34, '#fde68a'); r(.32, .65, .36, .06, '#292524'); circ(.5, .48 + fl, .07, '#f97316'); break; }
    case 'ô': r(.45, .5, .1, .5, '#78350f'); g.fillStyle = '#2563eb'; g.beginPath(); g.roundRect(x + .2 * s, y + .22 * s, .6 * s, .32 * s, [.16 * s, .16 * s, 0, 0]); g.fill(); r(.24, .36, .2, .04, '#1e3a8a'); r(.72, .1, .04, .2, '#ef4444'); r(.72, .1, .12, .07, '#ef4444'); break;
    case 'û': r(.47, .45, .06, .55, '#16a34a'); g.fillStyle = '#16a34a'; g.beginPath(); g.ellipse(x + .62 * s, y + .7 * s, .12 * s, .05 * s, -.4, 0, 7); g.fill(); g.fillStyle = '#facc15'; for (let k = 0; k < 10; k++) { const an = k * Math.PI / 5 + Math.sin(t) * .05; g.beginPath(); g.ellipse(x + (.5 + Math.cos(an) * .17) * s, y + (.3 + Math.sin(an) * .17) * s, .09 * s, .04 * s, an, 0, 7); g.fill(); } circ(.5, .3, .12, '#78350f'); break;
    case ':': r(.12, .12, .76, .76, '#78350f'); r(.18, .18, .64, .64, '#7dd3fc'); r(.47, .18, .06, .64, '#78350f'); r(.18, .47, .64, .06, '#78350f'); r(.22, .22, .12, .06, 'rgba(255,255,255,.6)'); break;
    case ';': g.strokeStyle = '#15803d'; g.lineWidth = s * .05; g.beginPath(); for (const a of [.2, .5, .8]) { g.moveTo(x + a * s, y); g.quadraticCurveTo(x + (a + Math.sin(t + a * 5) * .08) * s, y + .4 * s, x + a * s, y + (.6 + a * .3) * s); } g.stroke(); g.fillStyle = '#22c55e'; for (const [a, b2] of [[.22, .3], [.5, .55], [.78, .4], [.2, .6], [.8, .8]]) { g.beginPath(); g.ellipse(x + a * s, y + b2 * s, .07 * s, .04 * s, .6, 0, 7); g.fill(); } break;
    case 'ï': { const sw = Math.sin((opts.anim || 0)) * .06, f = opts.flip ? -1 : 1, X = v => x + (f > 0 ? v : 1 - v) * s; r(.3, .62, .14, .38, '#1e3a8a'); r(.56, .62, .14, .38, '#1e3a8a'); r(.26, .32, .48, .34, '#4d7c0f'); r(.3, .4, .12, .1, '#365314'); g.fillStyle = '#84cc16'; g.fillRect(X(.62) - (f > 0 ? 0 : .34 * s), y + (.36 + sw) * s, .34 * s, .1 * s); r(.28, .04, .44, .32, '#a3e635'); r(.36, .13, .08, .07, '#450a0a'); r(.56, .13, .08, .07, '#450a0a'); r(.4, .26, .22, .04, '#3f6212'); break; }
    case 'ð': { const wv = Math.sin(t * 4 + x) * .05; g.fillStyle = 'rgba(15,10,30,.92)'; g.beginPath(); g.arc(x + .5 * s, y + .42 * s, .36 * s, Math.PI, 0); for (let k = 0; k <= 4; k++) g.lineTo(x + (.86 - k * .18) * s, y + (.9 + (k % 2 ? wv : -wv)) * s); g.fill(); g.fillStyle = '#f5f3ff'; g.beginPath(); g.arc(x + .38 * s, y + .4 * s, .06 * s, 0, 7); g.arc(x + .62 * s, y + .4 * s, .06 * s, 0, 7); g.fill(); break; }
    case 'ý': { const p = 1 + Math.sin(t * 5) * .08; g.fillStyle = 'rgba(253,224,71,.25)'; g.beginPath(); g.arc(x + .5 * s, y + .5 * s, .44 * s * p, 0, 7); g.fill(); circ(.5, .5, .24, '#fde047'); circ(.45, .44, .09, '#fffbeb'); break; }
    case 'ñ': { const fl = Math.sin(t * 13 + x) * .03; r(.42, .5, .16, .42, '#f5f5f4'); r(.36, .88, .28, .08, '#a8a29e'); g.fillStyle = '#f97316'; g.beginPath(); g.ellipse(x + (.5 + fl) * s, y + .4 * s, .07 * s, .13 * s, 0, 0, 7); g.fill(); circ(.5, .44, .04, '#fde68a'); break; }
    case ',': for (const [a, b2, rr, c] of [[.25, .88, .1, '#a8a29e'], [.5, .9, .08, '#78716c'], [.7, .86, .12, '#d6d3d1'], [.88, .92, .06, '#a8a29e']]) { g.fillStyle = c; g.beginPath(); g.ellipse(x + a * s, y + b2 * s, rr * s, rr * .7 * s, 0, 0, 7); g.fill(); } break;
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
/* Characters are drawn from a "look" (also what the character designer makes):
   { skin, hair, hairStyle 0 short·1 long·2 spiky·3 bald·4 ponytail·5 curly, eyes, shirt, pants, shoes,
     hat 0 none·1 cap·2 wizard·3 crown·4 helmet·5 bow·6 top hat·7 chef·8 antenna, hatCol, acc 0 none·1 glasses·2 moustache·3 scarf·4 beard·5 cape, accCol, robot } */
const PEOPLE = {
  n: { shirt: '#2563eb', hair: '#78350f' },
  z: { shirt: '#7c3aed', pants: '#5b21b6', hair: '#e5e7eb', hat: 2, hatCol: '#5b21b6', acc: 4 },
  '@': { robot: true },
  k: { shirt: '#94a3b8', pants: '#475569', hat: 4, acc: 5, accCol: '#dc2626' },
  'é': { shirt: '#ec4899', pants: '#ec4899', hair: '#facc15', hairStyle: 1, hat: 3, acc: 5, accCol: '#a21caf' },
  'í': { skin: '#86efac', shirt: '#0f766e', pants: '#134e4a', hairStyle: 3, hat: 8, eyes: '#111' },
  'ó': { shirt: '#f8fafc', pants: '#334155', hair: '#1f2937', hat: 7, acc: 2 },
};
const LOOK_DEFAULT = { skin: '#fcd5b5', hair: '#78350f', hairStyle: 0, eyes: '#111111', shirt: '#2563eb', pants: '#1f2937', shoes: '#111827', hat: 0, hatCol: '#ef4444', acc: 0, accCol: '#111827' };
function drawPerson(g, ch, x, y, s, flip, anim) { drawLook(g, PEOPLE[ch] || PEOPLE.n, x, y, s, flip, anim); }
function drawLook(g, look, x, y, s, flip, anim = 0) {
  const P = Object.assign({}, LOOK_DEFAULT, look || {}), b = Math.abs(Math.sin(anim)) * .03 * s, e = flip ? -.04 : .04;
  const R = (a, c, w, h, col) => { g.fillStyle = col; g.fillRect(x + a * s, y + c * s - b, w * s, h * s); };
  const O = (cx, cy, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x + cx * s, y + cy * s - b, r * s, 0, 7); g.fill(); };
  const poly = (col, ...pts) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < pts.length; i += 2) g.lineTo(x + pts[i] * s, y + pts[i + 1] * s - b); g.fill(); };
  if (P.robot) {
    R(.2, .42, .6, .42, P.shirt === LOOK_DEFAULT.shirt ? '#94a3b8' : P.shirt); R(.28, .5, .44, .16, '#334155'); O(.4, .58, .04, '#22d3ee'); O(.6, .58, .04, '#22d3ee');
    R(.25, .1, .5, .32, '#cbd5e1'); R(.32, .18, .36, .14, '#0f172a'); O(.42 + e, .25, .045, '#22d3ee'); O(.58 + e, .25, .045, '#22d3ee'); R(.48, 0, .04, .1, '#64748b'); O(.5, 0, .05, '#ef4444');
    g.fillStyle = '#475569'; g.fillRect(x + .26 * s, y + .84 * s, .18 * s, .16 * s); g.fillRect(x + .56 * s, y + .84 * s, .18 * s, .16 * s); return;
  }
  if (P.acc === 5) poly(P.accCol, .26, .44, .74, .44, .8 + (flip ? .06 : -.06), .9, .2 + (flip ? .06 : -.06), .9);   // cape behind
  const lg = Math.sin(anim) * .05;
  g.fillStyle = P.pants; g.fillRect(x + (.3 + lg) * s, y + .8 * s, .15 * s, .14 * s); g.fillRect(x + (.55 - lg) * s, y + .8 * s, .15 * s, .14 * s);
  g.fillStyle = P.shoes; g.fillRect(x + (.28 + lg) * s, y + .93 * s, .19 * s, .07 * s); g.fillRect(x + (.53 - lg) * s, y + .93 * s, .19 * s, .07 * s);
  g.fillStyle = P.shirt; g.beginPath(); g.roundRect(x + .24 * s, y + .44 * s - b, .52 * s, .4 * s, .1 * s); g.fill();
  R(.24, .76, .52, .08, P.pants);
  if (P.hairStyle === 1 || P.hairStyle === 4) R(.3, .22, .4, .3, P.hair);   // long hair behind the face
  O(.5, .3, .19, P.skin);
  const hs = P.hairStyle;
  if (hs === 0 || hs === 1) { g.fillStyle = P.hair; g.beginPath(); g.arc(x + .5 * s, y + .25 * s - b, .2 * s, Math.PI, 0); g.fill(); }
  else if (hs === 2) poly(P.hair, .3, .25, .34, .04, .42, .17, .5, .0, .58, .17, .66, .04, .7, .25);
  else if (hs === 4) { g.fillStyle = P.hair; g.beginPath(); g.arc(x + .5 * s, y + .25 * s - b, .2 * s, Math.PI, 0); g.fill(); O(flip ? .76 : .24, .3, .08, P.hair); }
  else if (hs === 5) for (const [cx, cy] of [[.34, .2], [.44, .12], [.56, .12], [.66, .2], [.5, .16]]) O(cx, cy, .08, P.hair);
  const eyesY = .3; O(.43 + e, eyesY, .03, P.eyes); O(.57 + e, eyesY, .03, P.eyes);
  if (P.acc === 1) { g.strokeStyle = P.accCol; g.lineWidth = s * .03; g.beginPath(); g.arc(x + (.43 + e) * s, y + eyesY * s - b, .055 * s, 0, 7); g.moveTo(x + (.625 + e) * s, y + eyesY * s - b); g.arc(x + (.57 + e) * s, y + eyesY * s - b, .055 * s, 0, 7); g.stroke(); }
  if (P.acc === 2) R(.42 + e, .37, .16, .035, P.hair === LOOK_DEFAULT.hair && P.accCol !== LOOK_DEFAULT.accCol ? P.accCol : P.hair);
  if (P.acc === 3) R(.3, .44, .4, .07, P.accCol);
  if (P.acc === 4) poly(P.hair, .36, .36, .5, .62, .64, .36);
  const hc = P.hatCol;
  switch (P.hat) {
    case 1: g.fillStyle = hc; g.beginPath(); g.arc(x + .5 * s, y + .22 * s - b, .2 * s, Math.PI, 0); g.fill(); R(flip ? .18 : .5, .19, .32, .05, hc); break;
    case 2: poly(hc, .24, .2, .5 + e * 3, -.14, .76, .2); O(.6, .05, .03, '#fde047'); break;
    case 3: poly('#facc15', .32, .16, .32, .02, .4, .1, .5, 0, .6, .1, .68, .02, .68, .16); O(.5, .1, .025, '#ef4444'); break;
    case 4: g.fillStyle = '#cbd5e1'; g.beginPath(); g.arc(x + .5 * s, y + .28 * s - b, .21 * s, Math.PI, 0); g.fill(); R(.29, .27, .42, .05, '#64748b'); R(.47, .02, .06, .1, hc); break;
    case 5: O(.38, .1, .07, hc); O(.5, .12, .04, hc); O(.62, .1, .07, hc); break;
    case 6: R(.3, .1, .4, .04, '#111'); R(.36, -.1, .28, .2, '#111'); R(.36, .05, .28, .03, hc); break;
    case 7: R(.34, .1, .32, .06, '#f8fafc'); O(.42, .02, .08, '#f8fafc'); O(.58, .02, .08, '#f8fafc'); O(.5, -.02, .09, '#f8fafc'); break;
    case 8: R(.4, -.02, .03, .14, '#64748b'); R(.57, -.02, .03, .14, '#64748b'); O(.415, -.03, .04, hc); O(.585, -.03, .04, hc); break;
  }
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
      if (template === '3d') row += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 'O' : '.';
      else if (template === 'topdown') row += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? '#' : '.';
      else row += y >= h - 2 ? '#' : '.';
    }
    rows.push(row);
  }
  const L = { w, h, tiles: rows.join(''), signs: {} };
  const set = (x, y, c) => { L.tiles = L.tiles.slice(0, y * w + x) + c + L.tiles.slice(y * w + x + 1); };
  if (template === 'topdown' || template === '3d') { set(2, 2, 'P'); set(w - 3, h - 3, 'G'); } else { set(2, h - 3, 'P'); set(w - 3, h - 3, 'G'); }
  return L;
}
function fromRows(rows, signs = {}) { const w = Math.max(...rows.map(r => r.length)); return { w, h: rows.length, tiles: rows.map(r => r.padEnd(w, '.')).join(''), signs }; }
function exampleGame(template) {
  if (template === 'topdown') return {
    v: 1, title: 'Dungeon Dash', template, settings: { ...DEFAULT_SETTINGS, theme: 3, shoot: true, stomp: false, win: 'goal' }, sprites: {},
    levels: [fromRows([
      '##############################',
      '#P..C..x.#..t....E....2..C...#',
      '#..n.....#..............######',
      '#..N.....#...C.....#.........#',
      '#........D.........#....F.o..#',
      '####.#####...?.....#.........#',
      '#........#...#######.........#',
      '#..C.....#.....$.....T..d....#',
      '#....E...#.....SSS...........#',
      '#...*....#..........Q........#',
      '#.T....K.#....C......####D####',
      '#........#....+......#.......#',
      '#..C.0...#....H..1...#...G.x.#',
      '##############################',
    ], { [3 * 30 + 3]: 'Find the keys to open the doors.\nPress Space to shoot!', [2 * 30 + 3]: 'Welcome to the dungeon! My dog got in somewhere… and watch out for the ghost.' })],
  };
  return {
    v: 1, title: 'Mystery Meadows', template: 'platformer', settings: { ...DEFAULT_SETTINGS }, sprites: {},
    levels: [fromRows([
      "................................................................",
      ".....~................~.................~................~......",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "...................N...........CCC.......................H......",
      "..........?.?.?...-----....$................+..........hrrrr....",
      "..........................wwww............cccc.........h........",
      "..............................M........................h........",
      ".P.p*..n.t.o......x.E.1.d.*p..........>>>>.z..Y....3X..h..e.4G..",
      "##############...#############........#########SSS##############",
      "##############LLL#############........##########################",
    ], {"647": "Hi! Bump the ? blocks from below for coins. Watch out for the river of lava!", "683": "A wizard tip: the star makes you invincible. Grab it and charge!", "403": "Arrows or WASD to move, Up/Space to jump. Climb ladders with Up."}),
    fromRows([
      "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
      "...................i...i....................................",
      "............................................................",
      "............................................................",
      "......................................u.....................",
      "......................................u.....................",
      "............R.........................u.....................",
      "............R..................0......u.....----............",
      "............R........CCC......qqqq....u.....................",
      "............R.......UUUUU.............u..........V..........",
      "............R.........................D......%..............",
      ".P.@.x..!...R.b.2.E.......f..Q....KXk....x..........x...*Gt.",
      "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
      "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
    ], {"663": "BEEP. Red blocks block the way. Step on the switch to turn on the blue ones.", "696": "The boss is just ahead! Jump on its head or blast it six times."})],
  };
}

/* ---------------- runtime ---------------- */
// MakerEngine.run(canvas, game, { onWin(stats), onLose, onLevel(i), onPos(p), ghosts:() => [{name,l,x,y,f,col}], hud(text), banner(text), sign(text) })
function run(cv, game, o = {}) {
  const g = cv.getContext('2d');
  const set = { ...DEFAULT_SETTINGS, ...(game.settings || {}) }, top = game.template === 'topdown';
  const sprites = game.sprites || {};
  const TS = 32;
  let li = o.startLevel || 0, L, grid, ents, P, cam = { x: 0, y: 0 }, t = 0, levelT = 0, totalT = 0, coins = 0, totalCoins = 0, deaths = 0, lives = set.lives || Infinity, keys = 0, state = 'play', raf = 0, last = performance.now(), cp = null, bullets = [], parts = [], signTxt = null, timeLeft = 0, stopped = false, frozen = o.countdown || 0, sw = false, gems = 0, pw = { wings: false, blaster: false };
  const used = new Set();
  // v3: lighting, weather, story cards, survive mode, TNT, power-up timers
  let dark = 0, weather = '', storyHold = null, surviveLeft = 0, frozenE = 0, wx = [], mc = null;
  const tnt = new Map(), PICK = new Set(['C', 'K', 'H', '$', '+', 'j', 's', 'b', '0', 'Â', 'Ê', 'Î', 'ý']);
  const ENEMY = new Set(['E', 'F', 'e', 'Y', 'Q', 'A', 'i', 'ï', 'Ç', 'Ø', 'Ü', 'ð']), STOMP = new Set(['E', 'F', 'Y', 'ï', 'Ç', 'Ø', 'Ü']), KILLABLE = new Set(['E', 'F', 'Z', 'e', 'Y', 'Q', '%', 'ï', 'Ç', 'Ø', 'Ü', 'Ö', 'ð']), SHOOTABLE = new Set(['E', 'F', 'e', 'Y', 'Q', 'ï', 'Ç', 'Ø', 'Ü', 'Ö', 'ð']);
  const input = { l: false, r: false, u: false, d: false, a: false, b: false, aPressed: false, bPressed: false };
  const GRAV = 1500 * set.gravity, SPEED = [0, 120, 170, 230][set.speed] || 170, JUMPV = ([0, 450, 560, 670][set.jump] || 560) * Math.sqrt(set.gravity), ESPD = [0, 40, 65, 100][set.enemySpeed] || 65;
  const at = (x, y) => (x < 0 || x >= L.w || y < 0 || y >= L.h) ? (top ? '#' : (y < 0 ? '.' : (x < 0 || x >= L.w ? '#' : '.'))) : grid[y * L.w + x];
  const solidAt = (x, y) => { const c = at(x, y); if (c === 'R') return !sw; if (c === 'U') return sw; if (top && (c === '>' || c === '<')) return false; if (c === '}') return Math.floor(t / 2) % 2 === 0; return SOLID.has(c) && !(c === 'B' && crumbleGone(x, y)); };
  const crumble = new Map();
  const crumbleGone = (x, y) => { const c = crumble.get(y * L.w + x); return c && c.gone; };
  function loadLevel(i) {
    li = i; L = game.levels[i]; grid = L.tiles.split(''); ents = []; bullets = []; parts = []; crumble.clear(); keys = 0; levelT = 0; signTxt = null; sw = false; used.clear(); pw = { wings: false, blaster: false };
    timeLeft = set.timer || 0;
    dark = L.dark != null && L.dark !== '' ? +L.dark : (+set.dark || 0); weather = L.weather != null && L.weather !== '' ? L.weather : (set.weather || '');
    surviveLeft = set.win === 'survive' ? (set.timer || 60) : 0; storyHold = L.story && !o.countdown ? String(L.story) : null; frozenE = 0; tnt.clear(); wx = [];
    let ps = null;
    grid.forEach((ch, k) => {
      const x = k % L.w, y = Math.floor(k / L.w);
      if (ch === 'P') { ps = { x, y }; grid[k] = '.'; }
      else if (ENTS.has(ch)) {
        const e = { k: ch, x: x * TS, y: y * TS, w: TS, h: TS, sx: x * TS, sy: y * TS, vx: 0, vy: 0, alive: true, hp: 1, tile: k, anim: 0, cd: 1 + Math.random() };
        if (ch === 'E' || ch === 'e') e.vx = -ESPD;
        else if (ch === 'F') e.vy = -ESPD;
        else if (ch === 'A') { e.vx = ESPD * 1.6; e.x += 2; e.y += 2; e.w = e.h = 28; }
        else if (ch === 'M') { e.vx = ESPD * 1.1; e.h = 12; }
        else if (ch === 'V') { e.vy = -ESPD * 1.1; e.h = 12; }
        else if (ch === '%') { e.w = e.h = 56; e.x -= 12; e.y -= 24; e.sx = e.x; e.hp = 6; e.cd = 2; }
        else if (ch === 'Ç') { e.hang = true; e.y += 2; }
        else if (ch === 'Ø') { e.vx = ESPD * 1.1; e.cd = 2; }
        else if (ch === 'Ö') e.ph = (x * 1.7 + y) % 6;
        else if (ch === 'Ü') { e.cd = 1 + Math.random(); e.w = 28; e.h = 24; e.x += 2; e.y += 8; }
        else if (ch === 'ï') { e.vx = -ESPD * .5; e.w = 24; e.x += 4; }
        else if (ch === 'ð') { e.ph = Math.random() * 6; e.w = e.h = 28; e.x += 2; e.y += 2; }
        else if (ch === 'Ñ') { e.st = 0; e.w = 30; e.x += 1; }
        else if (ch === 'ú') { e.vx = 28; e.w = 24; e.x += 4; e.y += 6; e.h = 26; }
        else if (ch === 'á') { e.w = e.h = 26; e.x += 3; e.y += 6; }
        else if (ch === 'd') { e.w = e.h = 26; e.x += 3; e.y += 6; }
        else if (ch === 'f') e.ph = (x * 7 + y * 3) % 6;
        else if (TALK.has(ch)) { e.vx = Math.random() < .5 ? -18 : 18; e.text = (L.signs || {})[k] || ''; e.w = 26; e.x += 3; }
        else if (ch === 'i') e.st = 0;
        ents.push(e); grid[k] = '.';
      }
      else if (ch === 'Z') ents.push({ k: 'Z', x: x * TS, y: y * TS, w: TS, h: TS, cd: 1 + Math.random(), alive: true, hp: 3, tile: k });
    });
    totalCoins = ents.filter(e => e.k === 'C').length;
    ps = ps || { x: 1, y: 1 };
    cp = { x: ps.x * TS + 4, y: ps.y * TS + (top ? 4 : 2) };
    spawnPlayer();
    o.onLevel && o.onLevel(i);
    banner(game.levels.length > 1 ? `Level ${i + 1}` : '', 1.2);
  }
  function spawnPlayer() { P = { magnet: 0, feather: 0, light: 0, star: 0, shield: false, plat: null, x: cp.x, y: cp.y, w: 24, h: top ? 24 : 30, vx: 0, vy: 0, on: false, face: 1, jumps: 0, inv: 1, anim: 0, boost: 0, cdShot: 0, tp: 0 }; }
  let bannerT = 0, bannerTxt = '';
  function banner(txt, d = 1.5) { bannerTxt = txt; bannerT = d; o.banner && o.banner(txt); }
  function hurt(force) {
    if (state !== 'play' || (!force && (P.inv > 0 || P.star > 0))) return;
    if (!force && P.shield) { P.shield = false; P.inv = 1.2; sfx('pop'); burst(P.x + 12, P.y + 14, '#38bdf8'); banner('🛡️ Shield broke!', .8); return; }
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
      const tc = at(x, y), solid = solidAt(x, y), ledge = !top && (tc === '-' || tc === 'c' || tc === '_' || (tc === 'h' && at(x, y - 1) !== 'h')) && dy > 0 && oy + b.h <= y * TS + 1 && !b.drop;
      if (solid || ledge) {
        if (dy > 0) { b.y = y * TS - b.h; hit.bottom = true; hit.btile = [x, y]; } else if (dy < 0) { b.y = (y + 1) * TS; hit.top = true; hit.ttile = [x, y]; }
        y0 = Math.floor(b.y / TS); y1 = Math.floor((b.y + b.h - .01) / TS);
      }
    }
    return hit;
  }
  const overl = (a, b, m = 0) => a.x + m < b.x + b.w && a.x + a.w - m > b.x && a.y + m < b.y + b.h && a.y + a.h - m > b.y;
  const tilesUnder = b => { const out = []; for (let y = Math.floor(b.y / TS); y <= Math.floor((b.y + b.h - .01) / TS); y++) for (let x = Math.floor(b.x / TS); x <= Math.floor((b.x + b.w - .01) / TS); x++) out.push([x, y, at(x, y)]); return out; };

  function lightTNT(x, y, d) { const k = y * L.w + x; if (at(x, y) === '9' && !tnt.has(k)) { tnt.set(k, d); sfx('pop'); } }
  function explode(x, y) {
    grid[y * L.w + x] = '.'; sfx('boom');
    for (let k = 0; k < 3; k++) burst(x * TS + 16 + (Math.random() - .5) * 40, y * TS + 16 + (Math.random() - .5) * 40, ['#f97316', '#fde047', '#78716c'][k]);
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      if (Math.hypot(xx - x, yy - y) > 2.3 || xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) continue; const c = at(xx, yy);
      if (c === '9') lightTNT(xx, yy, .15); else if (c !== '7' && c !== 'G' && c !== ']' && c !== '[' && (SOLID.has(c) || c === 'S' || c === '^')) grid[yy * L.w + xx] = '.';
    }
    const cx = x * TS + 16, cy = y * TS + 16;
    for (const e of ents) if (e.alive && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < TS * 2.6) { if (e.k === '%') { bossHit(e); bossHit(Object.assign(e, { inv: 0 })); } else if (KILLABLE.has(e.k) || ENEMY.has(e.k)) { e.alive = false; burst(e.x + 16, e.y + 16, '#fde047'); } }
    if (Math.hypot(P.x + P.w / 2 - cx, P.y + P.h / 2 - cy) < TS * 1.7) hurt();
  }
  function warp(x, y) {
    const all = []; grid.forEach((ch, k) => { if (ch === ']') all.push(k); });
    if (all.length < 2) return; const k = all[(all.indexOf(y * L.w + x) + 1) % all.length];
    P.x = (k % L.w) * TS + 4; P.y = (Math.floor(k / L.w) - 1) * TS + 2; P.vy = 0; P.tp = .8; sfx('power'); burst(P.x + 12, P.y + 20, '#22c55e');
  }
  function bump(x, y) {
    const k = y * L.w + x;
    if (at(x, y) === '{') { grid[k] = '.'; sfx('hit'); burst(x * TS + 16, y * TS + 16, '#b45309'); return; }
    if (at(x, y) === '9') { lightTNT(x, y, .6); return; }
    if (at(x, y) !== '?' || used.has(k)) return;
    used.add(k); coins++; sfx('coin'); parts.push({ x: x * TS + 16, y: y * TS - 8, vx: 0, vy: -260, t: .5, c: '#facc15' }); burst(x * TS + 16, y * TS, '#fde68a');
  }
  function bossHit(e) {
    if (e.inv > 0) return; e.hp--; e.inv = .8; sfx('hit'); burst(e.x + e.w / 2, e.y + 10, '#ef4444');
    if (e.hp <= 0) { e.alive = false; sfx('boom'); for (let k = 0; k < 4; k++) burst(e.x + Math.random() * e.w, e.y + Math.random() * e.h, k % 2 ? '#fbbf24' : '#ef4444'); banner('🏆 Boss defeated!', 1.6); }
  }
  const fireBall = (e, k) => { const an = t * 1.8 + e.ph; return [e.x + 16 + Math.cos(an) * k * TS * .55, e.y + 16 + Math.sin(an) * k * TS * .55]; };
  function update(dt) {
    t += dt;
    if (frozen > 0) { frozen -= dt; banner(frozen > 0 ? String(Math.ceil(frozen)) : 'GO!', frozen > 0 ? .3 : .8); return; }
    if (state !== 'play') return;
    if (storyHold) { if (input.aPressed || input.bPressed) { storyHold = null; sfx('power'); } input.aPressed = input.bPressed = false; return; }
    levelT += dt; totalT += dt;
    if (set.win === 'survive') { surviveLeft -= dt; if (surviveLeft <= 0) return levelDone(); }
    P.magnet = Math.max(0, P.magnet - dt); P.feather = Math.max(0, P.feather - dt); P.light = Math.max(0, P.light - dt); frozenE = Math.max(0, frozenE - dt);
    for (const [k, v] of tnt) { const nv = v - dt; if (nv <= 0) { tnt.delete(k); explode(k % L.w, Math.floor(k / L.w)); } else tnt.set(k, nv); }
    if (P.magnet > 0) for (const e of ents) if (e.alive && (e.k === 'C' || e.k === '$')) { const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy); if (d < TS * 5 && d > 1) { e.x += dx / d * 320 * dt; e.y += dy / d * 320 * dt; } }
    if (set.timer && set.win !== 'survive') { timeLeft -= dt; if (timeLeft <= 0) { hurt(true); timeLeft = set.timer; } }
    P.inv = Math.max(0, P.inv - dt); P.star = Math.max(0, P.star - dt); P.cdShot -= dt; P.boost = Math.max(0, P.boost - dt); P.tp = Math.max(0, P.tp - dt);
    const inWater = tilesUnder(P).some(([, , c]) => c === 'W');
    const onIce = !top && P.on && [Math.floor((P.x + 2) / TS), Math.floor((P.x + P.w - 2) / TS)].some(x => at(x, Math.floor((P.y + P.h + 2) / TS)) === 'I');
    const onHoney = !top && P.on && [Math.floor((P.x + 2) / TS), Math.floor((P.x + P.w - 2) / TS)].some(x => at(x, Math.floor((P.y + P.h + 2) / TS)) === '6');
    const spd = SPEED * (P.boost > 0 ? 1.8 : 1) * (inWater ? .6 : 1) * (onHoney ? .45 : 1);
    if (top) {
      let ix = (input.r ? 1 : 0) - (input.l ? 1 : 0), iy = (input.d ? 1 : 0) - (input.u ? 1 : 0);
      if (ix && iy) { ix *= .707; iy *= .707; }
      P.vx = ix * spd; P.vy = iy * spd;
      if (ix) P.face = ix > 0 ? 1 : -1;
      if (ix || iy) { P.dir = [Math.sign(ix), Math.sign(iy)]; P.anim += dt * 12; }
      const ha = box(P, P.vx * dt, 0), hb = box(P, 0, P.vy * dt); for (const hh of [ha.tile, hb.btile, hb.ttile]) if (hh && at(...hh) === '&') hurt();
    } else {
      const ix = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      const acc = onIce ? 5 : 16;
      P.vx += (ix * spd - P.vx) * Math.min(1, acc * dt);
      if (ix) { P.face = ix; P.anim += dt * 12; }
      const onLadder = tilesUnder(P).some(([, , c]) => c === 'h' || c === '|');
      if (onLadder && (input.a || input.d) && !P.climb) P.climb = true;
      if (!onLadder) P.climb = false;
      if (P.climb) { P.vx *= .6; P.vy = ((input.d ? 1 : 0) - (input.a ? 1 : 0)) * 140; P.jumps = 0; input.aPressed = false; if (input.a || input.d) P.anim += dt * 10; }
      else if (input.aPressed) {
        if (inWater) { P.vy = -JUMPV * .55; sfx('jump'); }
        else if (P.on || P.coyote > 0) { P.vy = -JUMPV * (onHoney ? .6 : 1); P.on = false; P.coyote = 0; P.jumps = 1; sfx('jump'); }
        else if ((set.doubleJump || pw.wings) && P.jumps < 2) { P.vy = -JUMPV * .9; P.jumps = 2; sfx('jump'); burst(P.x + 12, P.y + P.h, '#fff'); }
      }
      if (!P.climb) { if (!input.a && P.vy < -JUMPV * .4 && !inWater) P.vy = -JUMPV * .4; // variable jump height
      P.vy = Math.min(inWater ? 120 : P.feather > 0 ? 260 : 900, P.vy + GRAV * (inWater ? .25 : 1) * (P.feather > 0 ? .45 : 1) * dt); }
      P.drop = input.d;
      const hxP = box(P, P.vx * dt, 0); if (hxP.x && hxP.tile && at(...hxP.tile) === '&') hurt();
      const prevBottom = P.y + P.h;
      const h = box(P, 0, P.vy * dt);
      P.plat = null;
      if (P.vy >= 0 && !P.climb) for (const e of ents) if (e.alive && (e.k === 'M' || e.k === 'V') && P.x + P.w > e.x + 2 && P.x < e.x + e.w - 2 && prevBottom <= e.y + 6 && P.y + P.h >= e.y) { P.y = e.y - P.h; P.plat = e; h.bottom = true; h.btile = null; }
      P.coyote = Math.max(0, (P.coyote || 0) - dt);
      if (h.bottom) { P.vy = 0; if (!P.on) P.jumps = 0; P.on = true; P.coyote = .1; const [bx, by] = h.btile || [-9, -9]; const bc = at(bx, by); if (bc === '>' || bc === '<') box(P, (bc === '>' ? 1 : -1) * 95 * dt, 0); if (bc === 'B') { const c = crumble.get(by * L.w + bx) || { t: 0, gone: false }; if (!c.t) c.t = .45; crumble.set(by * L.w + bx, c); } }
      else { if (P.on) P.coyote = .1; P.on = false; }
      if (h.bottom && h.btile) { const bc2 = at(...h.btile); if (bc2 === '5' && !input.d) { P.vy = -JUMPV * 1.25; P.on = false; P.jumps = 1; sfx('jump'); } else if (bc2 === ']' && input.d && P.tp <= 0) warp(...h.btile); else if (bc2 === '&') hurt(); }
      if (h.top) { P.vy = 40; bump(...h.ttile); if (at(...h.ttile) === '&') hurt(); }
      { const cx = Math.floor((P.x + P.w / 2) / TS); for (let yy = Math.floor((P.y + P.h - 1) / TS), n = 0; n < 7; yy++, n++) { const c = at(cx, yy); if (c === '/') { P.vy = Math.max(P.vy - 2700 * dt, -430); P.on = false; break; } if (solidAt(cx, yy)) break; } }
      if (P.y > L.h * TS + 200) hurt(true);
    }
    for (const [k, c] of crumble) { if (!c.gone && c.t > 0) { c.t -= dt; if (c.t <= 0) { c.gone = true; c.back = 3; burst((k % L.w) * TS + 16, Math.floor(k / L.w) * TS + 16, '#d97706'); } } else if (c.gone) { c.back -= dt; if (c.back <= 0 && !overl(P, { x: (k % L.w) * TS, y: Math.floor(k / L.w) * TS, w: TS, h: TS })) crumble.delete(k); } }
    // tiles touched
    signTxt = null;
    let onSw = false;
    for (const [x, y, c] of tilesUnder(P)) {
      if (c === '!') { onSw = true; if (!P.onSw) { sw = !sw; sfx('power'); burst(x * TS + 16, y * TS + 24, sw ? '#3b82f6' : '#ef4444'); banner(sw ? '🔵 Blue blocks on!' : '🔴 Red blocks on!', .9); } }
      if (top && (c === '>' || c === '<')) box(P, (c === '>' ? 1 : -1) * 95 * dt, 0);
      const tb = { x: x * TS, y: y * TS, w: TS, h: TS };
      if (c === 'S' && overl(P, { x: tb.x + 4, y: tb.y + 14, w: 24, h: 18 })) hurt();
      if (c === 'L' && overl(P, { x: tb.x, y: tb.y + 8, w: TS, h: 24 })) hurt();
      if (c === '^' && overl(P, { x: tb.x + 4, y: tb.y, w: 24, h: 16 })) hurt();
      if (c === 'G' && set.win === 'goal') return levelDone();
      if (c === 'X' && (!cp.tile || cp.tile !== y * L.w + x)) { cp = { x: tb.x + 4, y: tb.y + (top ? 4 : 2), tile: y * L.w + x }; sfx('power'); banner('Checkpoint!', .9); }
      if (c === 'N') signTxt = (L.signs && L.signs[y * L.w + x]) || '…';
      if (c === 'J') { if (top) { if (P.boost <= 0) sfx('power'); P.boost = 1; } else if (P.vy >= 0 && overl(P, { x: tb.x + 4, y: tb.y + 10, w: 24, h: 22 })) { P.vy = -JUMPV * 1.55; P.jumps = 1; sfx('jump'); } }
      if (c === 'T' && P.tp <= 0) {
        const all = []; grid.forEach((ch, k) => { if (ch === 'T') all.push(k); });
        if (all.length > 1) { const k = all[(all.indexOf(y * L.w + x) + 1) % all.length]; P.x = (k % L.w) * TS + 4; P.y = Math.floor(k / L.w) * TS + (top ? 4 : 2); P.tp = .8; P.vy = 0; sfx('power'); burst(P.x + 12, P.y + 12, '#a855f7'); }
      }
    }
    P.onSw = onSw;
    // doors (touch from the side or below/above)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = Math.floor((P.x + P.w / 2 + dx * (P.w / 2 + 3)) / TS), y = Math.floor((P.y + P.h / 2 + dy * (P.h / 2 + 3)) / TS);
      if (top && at(x, y) === '?') bump(x, y);
      if (at(x, y) === '9') lightTNT(x, y, .6);
      if (at(x, y) === 'D' && keys > 0) { keys--; grid[y * L.w + x] = '.'; sfx('coin'); burst(x * TS + 16, y * TS + 16, '#facc15'); }
    }
    // shooting
    if ((set.shoot || pw.blaster) && input.bPressed && P.cdShot <= 0) {
      P.cdShot = .3; sfx('shoot');
      const d = top ? (P.dir || [P.face, 0]) : [P.face, 0];
      bullets.push({ x: P.x + P.w / 2, y: P.y + P.h / 2, vx: d[0] * 480, vy: d[1] * 480, mine: true, t: 1.2 });
    }
    input.aPressed = input.bPressed = false;
    // entities
    for (const e of ents) {
      if (!e.alive) continue;
      if (e.k === 'M' || e.k === 'V') {
        const ride = P.plat === e, ox = e.x, oy = e.y, R = TS * 4;
        if (e.k === 'M') { const hh = box(e, e.vx * dt, 0); if (hh.x || Math.abs(e.x - e.sx) > R) { e.vx = -e.vx; e.x = Math.max(e.sx - R, Math.min(e.sx + R, e.x)); } }
        else { const hh = box(e, 0, e.vy * dt); if (hh.top || hh.bottom || Math.abs(e.y - e.sy) > R) { e.vy = -e.vy; e.y = Math.max(e.sy - R, Math.min(e.sy + R, e.y)); } }
        if (ride && !top) { box(P, e.x - ox, 0); if (e.y < oy) box(P, 0, e.y - oy); else P.y = e.y - P.h; }
        continue;
      }
      if (e.k === 'f') { for (let k = 1; k <= 3; k++) { const [bx, by] = fireBall(e, k); if (Math.abs(bx - (P.x + P.w / 2)) < 15 && Math.abs(by - (P.y + P.h / 2)) < 17) hurt(); } continue; }
      if (TALK.has(e.k)) {
        const near = Math.abs(P.x - e.x) < 56 && Math.abs(P.y - e.y) < 50;
        if (near) { e.flip = P.x < e.x; signTxt = e.text || '…'; }
        else {
          const hh = box(e, e.vx * dt, 0);
          if (hh.x || Math.abs(e.x - e.sx) > TS * 1.2) { e.vx = -e.vx; e.x = Math.max(e.sx - TS * 1.2, Math.min(e.sx + TS * 1.2, e.x)); }
          if (!top) { const ax = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / TS), ay = Math.floor((e.y + e.h + 4) / TS); if (!solidAt(ax, ay) && at(ax, ay) !== '-' && solidAt(Math.floor((e.x + e.w / 2) / TS), ay)) e.vx = -e.vx; }
          e.flip = e.vx < 0; e.anim += dt * 8;
        }
        continue;
      }
      if (frozenE > 0 && !PICK.has(e.k) && e.k !== 'd' && e.k !== 'á' && !TALK.has(e.k)) continue;
      if (e.k === 'd' || e.k === 'á') {
        const tx = P.x - P.face * 30, dx = tx - e.x, dy = P.y - e.y;
        if (Math.abs(dx) > TS * 10 || Math.abs(dy) > TS * 8) { e.x = P.x; e.y = P.y; e.vy = 0; }
        const sp = Math.min(SPEED * 1.15, Math.abs(dx) * 4 + 20);
        if (top) { const d = Math.hypot(dx, dy); if (d > 22) { box(e, dx / d * sp * dt, 0); box(e, 0, dy / d * sp * dt); e.anim += dt * 12; e.flip = dx < 0; } }
        else {
          e.vx = Math.abs(dx) > 10 ? Math.sign(dx) * sp : 0; e.vy = Math.min(900, e.vy + GRAV * dt);
          const hx = box(e, e.vx * dt, 0), v = box(e, 0, e.vy * dt);
          if (v.bottom) { e.vy = 0; if ((hx.x && e.vx) || (dy < -TS * 1.5 && Math.abs(dx) < TS * 4)) e.vy = -JUMPV * .95; }
          if (e.vx) { e.anim += dt * 12; e.flip = e.vx < 0; }
        }
        continue;
      }
      if (e.k === 'Y') {
        e.cd -= dt; const dir = Math.sign(P.x - e.x) || 1; e.flip = dir > 0;
        if (top) { if (e.cd <= 0 && Math.hypot(P.x - e.x, P.y - e.y) < TS * 9) { e.cd = 1.4; e.hop = .4; const d = Math.hypot(P.x - e.x, P.y - e.y) || 1; e.hx = (P.x - e.x) / d * ESPD * 2.6; e.hy = (P.y - e.y) / d * ESPD * 2.6; } if (e.hop > 0) { e.hop -= dt; box(e, e.hx * dt, 0); box(e, 0, e.hy * dt); } e.air = e.hop > 0; }
        else {
          e.vy = Math.min(900, e.vy + GRAV * dt); const hx = box(e, e.vx * dt, 0); if (hx.x) e.vx = -e.vx;
          const v = box(e, 0, e.vy * dt);
          if (v.bottom) { e.vy = 0; e.vx = 0; e.air = false; if (e.cd <= 0 && Math.abs(P.x - e.x) < TS * 9) { e.cd = 1.1 + Math.random() * .8; e.vy = -JUMPV * .75; e.vx = dir * ESPD * 1.8; e.air = true; } }
          if (e.y > L.h * TS + 100) e.alive = false;
        }
      } else if (e.k === 'Q') {
        const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
        e.flip = dx > 0; e.shy = !top && d < TS * 12 && Math.sign(dx) === -P.face;
        if (!e.shy && d < TS * 12 && d > 1) { const sp = ESPD * (top ? .75 : .95); e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; }
      } else if (e.k === 'A') {
        const hh = box(e, e.vx * dt, 0); if (hh.x || Math.abs(e.x - e.sx) > TS * 5) { e.vx = -e.vx; e.x = Math.max(e.sx - TS * 5, Math.min(e.sx + TS * 5, e.x)); }
      } else if (e.k === 'i') {
        if (e.st === 0 && !top && Math.abs(P.x + P.w / 2 - (e.x + 16)) < 26 && P.y > e.y && P.y - e.y < TS * 10) { e.st = 1; e.shake = .35; }
        else if (e.st === 1) { e.shake -= dt; if (e.shake <= 0) e.st = 2; }
        else if (e.st === 2) { e.vy = Math.min(900, e.vy + GRAV * dt); e.y += e.vy * dt; if (e.y > e.sy + 8 && solidAt(Math.floor((e.x + 16) / TS), Math.floor((e.y + 30) / TS))) { e.alive = false; burst(e.x + 16, e.y + 26, '#bae6fd'); sfx('pop'); } if (e.y > L.h * TS + 50) e.alive = false; }
      } else if (e.k === '%') {
        const dx = P.x - e.x - e.w / 2, near = Math.abs(dx) < TS * 14 && Math.abs(P.y - e.y) < TS * 9;
        e.flip = dx > 0; e.inv = Math.max(0, (e.inv || 0) - dt); e.cd -= dt;
        e.vx = near ? Math.sign(dx) * ESPD * .9 : 0;
        if (top) { box(e, e.vx * dt, 0); box(e, 0, (near ? Math.sign(P.y - e.y) * ESPD * .9 : 0) * dt); }
        else { e.vy = Math.min(900, e.vy + GRAV * dt); box(e, e.vx * dt, 0); const v = box(e, 0, e.vy * dt); if (v.bottom) { e.vy = 0; if (near && Math.random() < dt * .6) e.vy = -JUMPV * .8; } if (e.y > L.h * TS + 100) { e.alive = false; banner('🏆 Boss defeated!', 1.6); } }
        if (near && e.cd <= 0) { e.cd = 2.2; const base = Math.atan2(P.y + 15 - (e.y + e.h / 2), P.x + 12 - (e.x + e.w / 2)); for (const a of [-.28, 0, .28]) bullets.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: Math.cos(base + a) * 210, vy: Math.sin(base + a) * 210, t: 3 }); sfx('pop'); }
      } else if (e.k === 'E' || e.k === 'e') {
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
      if (e.k === 'ï') {
        const dx = P.x - e.x, dy = P.y - e.y, near = Math.abs(dx) < TS * 8 && Math.abs(dy) < TS * (top ? 8 : 3);
        if (top) { if (near) { const d = Math.hypot(dx, dy) || 1; box(e, dx / d * ESPD * .55 * dt, 0); box(e, 0, dy / d * ESPD * .55 * dt); } else { const hh = box(e, e.vx * dt, 0); if (hh.x) e.vx = -e.vx; } e.flip = dx > 0; e.anim += dt * 5; }
        else {
          if (near) e.vx = Math.sign(dx) * ESPD * .6;
          e.vy = Math.min(900, (e.vy || 0) + GRAV * dt); const hh = box(e, e.vx * dt, 0); if (hh.x) e.vx = -e.vx;
          const v = box(e, 0, e.vy * dt); if (v.bottom) { e.vy = 0; const ax = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / TS), ay = Math.floor((e.y + e.h + 4) / TS); if (!near && !solidAt(ax, ay) && at(ax, ay) !== '-') e.vx = -e.vx; }
          if (e.y > L.h * TS + 100) e.alive = false; e.flip = e.vx > 0; e.anim += dt * 5;
        }
        if ((e.groan = (e.groan || 2 + Math.random() * 4) - dt) <= 0) { e.groan = 3 + Math.random() * 5; if (near) sfx('hurt'); }
      } else if (e.k === 'ð') {
        const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, lit = P.light > 0 || P.star > 0;
        if (lit && d < TS * 8) { e.x -= dx / d * ESPD * 1.4 * dt; e.y -= dy / d * ESPD * 1.4 * dt; }
        else if (d < TS * 11) { e.x += dx / d * ESPD * .55 * dt; e.y += dy / d * ESPD * .55 * dt + Math.sin(t * 2 + e.ph) * 10 * dt; }
        e.flip = dx > 0; e.lit = lit;
      } else if (e.k === 'Ñ') {
        if (e.st === 0) { if (!top && P.x + P.w > e.x - 4 && P.x < e.x + e.w + 4 && P.y > e.y && P.y - e.y < TS * 9) { e.st = 1; e.vy = 0; } }
        else if (e.st === 1) { e.vy = Math.min(1100, e.vy + GRAV * 1.6 * dt); const v = box(e, 0, e.vy * dt); if (v.bottom || e.y > L.h * TS) { e.st = 2; e.wait = .7; sfx('boom'); burst(e.x + 16, e.y + e.h, '#a8a29e'); } if (overl(P, e, 3)) hurt(); }
        else if (e.st === 2) { e.wait -= dt; if (e.wait <= 0) e.st = 3; }
        else { e.y -= 70 * dt; if (e.y <= e.sy) { e.y = e.sy; e.st = 0; } }
        continue;
      } else if (e.k === 'Ç') {
        const dx = P.x - e.x, dy = P.y - e.y;
        if (e.hang) { if (Math.abs(dx) < TS * 5 && dy > -TS && dy < TS * 7) { e.hang = false; e.t = 0; sfx('pop'); } }
        else { e.t = (e.t || 0) + dt; const back = e.t > 3.2, tx = back ? e.sx - e.x : dx, ty = back ? e.sy - e.y : dy, d = Math.hypot(tx, ty) || 1; e.x += tx / d * ESPD * 1.5 * dt; e.y += ty / d * ESPD * 1.5 * dt + Math.sin(t * 9) * 40 * dt; e.flip = tx > 0; if (back && d < 4) { e.x = e.sx; e.y = e.sy; e.hang = true; } }
      } else if (e.k === 'Ø') {
        const hh = box(e, e.vx * dt, 0); if (hh.x || Math.abs(e.x - e.sx) > TS * 6) { e.vx = -e.vx; e.x = Math.max(e.sx - TS * 6, Math.min(e.sx + TS * 6, e.x)); }
        e.flip = e.vx > 0; e.cd -= dt;
        if (e.cd <= 0 && Math.abs(P.x - e.x) < TS * 2.5 && P.y > e.y) { e.cd = 1.9; bullets.push({ x: e.x + 16, y: e.y + 26, vx: top ? Math.sign(P.x - e.x) * 120 : 0, vy: top ? Math.sign(P.y - e.y) * 120 : 40, t: 3, g: !top }); sfx('pop'); }
      } else if (e.k === 'Ö') {
        e.up = Math.max(0, Math.min(1, Math.sin(t * 1.6 + e.ph) * 1.6));
        if (e.up > .35 && overl(P, { x: e.x + 6, y: e.y + TS * (1 - e.up * .9), w: 20, h: TS * e.up * .9 }, 0)) hurt();
        continue;
      } else if (e.k === 'Ü') {
        e.cd -= dt; const dir = Math.sign(P.x - e.x) || 1; e.flip = dir > 0;
        if (top) { if (e.cd <= 0 && Math.hypot(P.x - e.x, P.y - e.y) < TS * 7) { e.cd = 1.8; const d = Math.hypot(P.x - e.x, P.y - e.y) || 1; e.hx = (P.x - e.x) / d * ESPD * 1.6; e.hy = (P.y - e.y) / d * ESPD * 1.6; e.hop = .35; } if (e.hop > 0) { e.hop -= dt; box(e, e.hx * dt, 0); box(e, 0, e.hy * dt); e.air = true; } else e.air = false; }
        else { e.vy = Math.min(900, e.vy + GRAV * dt); const hx = box(e, e.vx * dt, 0); if (hx.x) e.vx = -e.vx; const v = box(e, 0, e.vy * dt); if (v.bottom) { e.vy = 0; e.vx = 0; e.air = false; if (e.cd <= 0 && Math.abs(P.x - e.x) < TS * 7) { e.cd = 1.5 + Math.random(); e.vy = -JUMPV * .5; e.vx = dir * ESPD * 1.1; e.air = true; } } if (e.y > L.h * TS + 100) e.alive = false; }
      } else if (e.k === 'ú') {
        const dx = P.x - e.x, scared = Math.abs(dx) < TS * 3 && Math.abs(P.y - e.y) < TS * 2;
        if (scared) e.vx = -Math.sign(dx || 1) * 110; else if (Math.abs(e.vx) > 40 || Math.random() < dt * .5) e.vx = (Math.random() < .5 ? -1 : 1) * 28;
        if (top) { const hh = box(e, e.vx * dt, 0); if (hh.x) e.vx = -e.vx; }
        else { e.vy = Math.min(900, (e.vy || 0) + GRAV * dt); const hh = box(e, e.vx * dt, 0); if (hh.x) e.vx = -e.vx; const v = box(e, 0, e.vy * dt); if (v.bottom) { e.vy = 0; if (scared && Math.random() < dt * 2) e.vy = -JUMPV * .4; } }
        e.flip = e.vx > 0; e.anim += dt * (scared ? 16 : 6); continue;
      }
      if (!overl(P, e, 4)) continue;
      if (e.k === 'C') { e.alive = false; coins++; sfx('coin'); }
      else if (e.k === 'K') { e.alive = false; keys++; sfx('power'); banner('Got a key!', .8); }
      else if (e.k === 'H') { e.alive = false; if (lives !== Infinity) lives++; sfx('power'); }
      else if (e.k === '$') { e.alive = false; gems++; sfx('coin'); burst(e.x + 16, e.y + 16, '#22d3ee'); }
      else if (e.k === '+') { e.alive = false; P.star = 8; sfx('power'); banner('⭐ Super star!', .9); }
      else if (e.k === 'j') { e.alive = false; pw.wings = true; if (top) P.boost = 6; sfx('power'); banner(top ? '🪽 Speed!' : '🪽 Double jump!', .9); }
      else if (e.k === 's') { e.alive = false; P.boost = 8; sfx('power'); banner('👟 Super speed!', .9); }
      else if (e.k === 'b') { e.alive = false; pw.blaster = true; sfx('power'); banner('🔫 Blaster! Press X or J to shoot', 1.8); }
      else if (e.k === '0') { e.alive = false; P.shield = true; sfx('power'); banner('🛡️ Shield!', .9); }
      else if (e.k === 'Â') { e.alive = false; P.magnet = 10; sfx('power'); banner('🧲 Magnet!', .9); }
      else if (e.k === 'Ê') { e.alive = false; P.feather = 10; sfx('power'); banner('🪶 Floaty!', .9); }
      else if (e.k === 'Î') { e.alive = false; frozenE = 5; sfx('power'); banner('🧊 Enemies frozen!', .9); }
      else if (e.k === 'ý') { e.alive = false; P.light = 20; sfx('power'); banner('💡 Bright light!', .9); }
      else if (e.k === 'ð' && e.lit) { }
      else if (e.k === '%') {
        if ((!top && P.vy > 60 && P.y + P.h - e.y < 24) || P.star > 0) { bossHit(e); if (!top) P.vy = -JUMPV * .7; }
        else hurt();
      }
      else if (ENEMY.has(e.k)) {
        if (P.star > 0) { if (e.k !== 'A') { e.alive = false; sfx('hit'); burst(e.x + 16, e.y + 16, '#fde047'); } }
        else if (!top && set.stomp && STOMP.has(e.k) && P.vy > 60 && P.y + P.h - e.y < 18) { e.alive = false; P.vy = -JUMPV * .6; sfx('hit'); burst(e.x + 16, e.y + 16, '#7c3aed'); }
        else hurt();
      }
    }
    for (const b of bullets) {
      if (b.g) b.vy += 700 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
      if (solidAt(Math.floor(b.x / TS), Math.floor(b.y / TS))) {
        b.t = 0; const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
        if (b.mine && at(tx, ty) === '{') { grid[ty * L.w + tx] = '.'; burst(b.x, b.y, '#b45309'); sfx('hit'); } if (at(tx, ty) === '9') lightTNT(tx, ty, .12); if (b.g) burst(b.x, b.y, '#f97316');
        if (b.mine && at(tx, ty) === 'Z') { const z = ents.find(e => e.k === 'Z' && e.tile === ty * L.w + tx && e.alive); if (z && --z.hp <= 0) { z.alive = false; grid[z.tile] = '.'; burst(b.x, b.y, '#9ca3af'); sfx('boom'); } }
        continue;
      }
      if (b.mine) { for (const e of ents) if (e.alive && e.k === '%' && b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) { b.t = 0; bossHit(e); } for (const e of ents) if (b.t > 0 && e.alive && SHOOTABLE.has(e.k) && b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) { e.alive = false; b.t = 0; burst(e.x + 16, e.y + 16, '#7c3aed'); sfx('hit'); } }
      else if (b.x > P.x && b.x < P.x + P.w && b.y > P.y && b.y < P.y + P.h) { b.t = 0; hurt(); }
    }
    bullets = bullets.filter(b => b.t > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.t -= dt; }
    parts = parts.filter(p => p.t > 0);
    if (set.win === 'coins' && totalCoins && !ents.some(e => e.k === 'C' && e.alive)) return levelDone();
    if (set.win === 'enemies' && !ents.some(e => KILLABLE.has(e.k) && e.alive)) return levelDone();
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
      drawTile(g, c, x * TS + shake, y * TS, TS, sprites, t, { active: cp.tile === y * L.w + x, sw, used: c === '?' && used.has(y * L.w + x), on: c === '}' ? Math.floor(t / 2) % 2 === 0 : undefined });
    }
    for (const e of ents) if (e.alive) {
      if (e.k === 'f') { drawTile(g, 'f', e.x, e.y, TS, sprites, t, { live: 1 }); for (let k = 1; k <= 3; k++) { const [bx, by] = fireBall(e, k); g.fillStyle = '#f97316'; g.beginPath(); g.arc(bx, by, 7, 0, 7); g.fill(); g.fillStyle = '#fde047'; g.beginPath(); g.arc(bx, by, 3.5, 0, 7); g.fill(); } }
      else if (e.k === '%') { if (!(e.inv > 0 && Math.floor(t * 16) % 2)) drawTile(g, '%', e.x, e.y, e.w, sprites, t, { flip: e.flip, hurt: e.inv > .6 }); g.fillStyle = '#0008'; g.fillRect(e.x + 4, e.y - 10, e.w - 8, 6); g.fillStyle = '#ef4444'; g.fillRect(e.x + 5, e.y - 9, (e.w - 10) * e.hp / 6, 4); }
      else if (e.k === 'ð') { g.globalAlpha = dark ? 1 : .75; drawTile(g, 'ð', e.x - 2, e.y - 2, TS, sprites, t, {}); g.globalAlpha = 1; }
      else if (e.k === 'á') drawTile(g, 'á', e.x - 3, e.y - 6, TS, sprites, t, { flip: e.flip, anim: e.anim });
      else if (e.k === 'd') drawTile(g, 'd', e.x - 3, e.y - 6, TS, sprites, t, { flip: e.flip, anim: e.anim });
      else if (TALK.has(e.k)) drawTile(g, e.k, e.x - 3, e.y, TS, sprites, t, { flip: e.flip, anim: e.anim });
      else if (e.k === 'A') drawTile(g, 'A', e.x - 2, e.y - 2, TS, sprites, t, {});
      else drawTile(g, e.k, e.x + (e.k === 'i' && e.st === 1 ? Math.sin(t * 70) * 2 : 0), e.y, TS, sprites, t, { flip: (e.k === 'E' || e.k === 'e') ? e.vx > 0 : e.flip, anim: e.anim, air: e.air, shy: e.shy, up: e.up, hang: e.hang });
      if (frozenE > 0 && !PICK.has(e.k) && !TALK.has(e.k)) { g.fillStyle = 'rgba(125,211,252,.35)'; g.fillRect(e.x, e.y, e.w, e.h); }
    }
    // ghosts (online race)
    if (o.ghosts) for (const gh of o.ghosts()) if (gh.l === li) {
      g.globalAlpha = .45; drawTile(g, 'P', gh.x - 4, gh.y - (top ? 4 : 2), TS, sprites, t, { flip: gh.f < 0, anim: t * 10 }); g.globalAlpha = 1;
      g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(gh.name, gh.x + 12, gh.y - 8); g.fillText(gh.name, gh.x + 12, gh.y - 8);
    }
    if (P.star > 0) { g.fillStyle = `hsla(${(t * 400) % 360},95%,60%,.45)`; g.beginPath(); g.arc(P.x + P.w / 2, P.y + P.h / 2, 24, 0, 7); g.fill(); }
    if (!(P.inv > 0 && Math.floor(t * 14) % 2)) drawTile(g, 'P', P.x - 4, P.y - (top ? 4 : 2), TS, sprites, t, { flip: P.face < 0, anim: P.anim });
    if (P.shield) { g.strokeStyle = `rgba(56,189,248,${.55 + Math.sin(t * 6) * .2})`; g.lineWidth = 3; g.beginPath(); g.arc(P.x + P.w / 2, P.y + P.h / 2, 22, 0, 7); g.stroke(); }
    for (const b of bullets) { g.fillStyle = b.mine ? '#fde047' : '#f87171'; g.beginPath(); g.arc(b.x, b.y, 4, 0, 7); g.fill(); }
    for (const p of parts) { g.globalAlpha = Math.max(0, p.t / .6); g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4); }
    g.globalAlpha = 1;
    for (const [k] of tnt) if (Math.floor(t * 10) % 2) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect((k % L.w) * TS, Math.floor(k / L.w) * TS, TS, TS); }
    mood(W, H, sc, dpr, x0, x1, y0, y1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bannerT > 0) { bannerT -= 1 / 60; }
    const goalTxt = set.win === 'survive' ? `⏳ ${Math.ceil(surviveLeft)}s` : set.win === 'coins' ? `🪙 ${coins - (totalCoinsBefore())}/${totalCoins}` : set.win === 'enemies' ? `👾 ${ents.filter(e => KILLABLE.has(e.k) && e.alive).length} left` : `🪙 ${coins}`;
    o.hud && o.hud(`${lives === Infinity ? '' : '❤️ ' + lives + '  '}${goalTxt}${gems ? '  💎 ' + gems : ''}${keys ? '  🔑 ' + keys : ''}${P.shield ? '  🛡️' : ''}${P.star > 0 ? '  ⭐ ' + Math.ceil(P.star) : ''}${pw.blaster && !set.shoot ? '  🔫' : ''}`, `${game.levels.length > 1 ? `Level ${li + 1}/${game.levels.length}  ` : ''}⏱ ${set.timer ? Math.ceil(timeLeft) : totalT.toFixed(1)}`, bannerT > 0 && !storyHold ? bannerTxt : '');
    o.sign && o.sign(signTxt);
  }
  const LIGHTS = { x: 3.4, 'ê': 3.4, 'ñ': 2.6, '2': 2.2, L: 1.9, G: 2.4, X: 1.4, W: 0, '+': 0 };
  function mood(W, H, sc, dpr, x0, x1, y0, y1) {
    const cw = cv.width, ch = cv.height, wpx = (wx2, wy2) => [(wx2 - cam.x) * sc * dpr, (wy2 - cam.y) * sc * dpr];
    if (dark > 0) {
      if (!mc) mc = document.createElement('canvas'); if (mc.width !== cw || mc.height !== ch) { mc.width = cw; mc.height = ch; }
      const m = mc.getContext('2d'); m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, cw, ch);
      m.fillStyle = `rgba(4,3,12,${[0, .55, .84, .97][dark] || .84})`; m.fillRect(0, 0, cw, ch); m.globalCompositeOperation = 'destination-out';
      const hole = (wx2, wy2, rTiles, k = 1) => { const [sx, sy] = wpx(wx2, wy2), r = rTiles * TS * sc * dpr * k; if (sx < -r || sy < -r || sx > cw + r || sy > ch + r) return; const gr = m.createRadialGradient(sx, sy, r * .15, sx, sy, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); m.fillStyle = gr; m.fillRect(sx - r, sy - r, r * 2, r * 2); };
      hole(P.x + P.w / 2, P.y + P.h / 2, ([0, 7.5, 5, 3.6][dark] || 5) * (P.light > 0 ? 1.9 : 1) * (P.star > 0 ? 1.3 : 1));
      const flames = [];
      for (let y = Math.max(0, y0 - 3); y <= Math.min(L.h - 1, y1 + 3); y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(L.w - 1, x1 + 3); x++) { const c = grid[y * L.w + x], r = LIGHTS[c]; if (r) { const fl = c === 'x' || c === 'ñ' || c === 'ê' ? .92 + Math.sin(t * 11 + x * 3) * .06 : 1; hole(x * TS + 16, y * TS + 14, r, fl); if (c !== 'G' && c !== 'X' && c !== '2') flames.push([x * TS + 16, y * TS + 14, r]); } }
      for (const e of ents) if (e.alive) { if (e.k === 'f') { hole(e.x + 16, e.y + 16, 3.4); flames.push([e.x + 16, e.y + 16, 3]); } else if (e.k === 'ý' || e.k === '+') hole(e.x + 16, e.y + 16, 2); else if (e.k === 'C' || e.k === '$') hole(e.x + 16, e.y + 16, .9); }
      for (const b of bullets) hole(b.x, b.y, b.mine ? 1 : .8);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(mc, 0, 0);
      g.globalCompositeOperation = 'lighter';
      for (const [fx, fy, r] of flames) { const [sx, sy] = wpx(fx, fy), rr = r * TS * sc * dpr * .7; if (sx < -rr || sy < -rr || sx > cw + rr || sy > ch + rr) continue; const gr = g.createRadialGradient(sx, sy, 0, sx, sy, rr); gr.addColorStop(0, 'rgba(255,140,40,.22)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); }
      g.restore();
      // shadows' eyes glow even in the dark
      for (const e of ents) if (e.alive && e.k === 'ð') { const [sx, sy] = wpx(e.x + 14, e.y + 12); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#ede9fe'; for (const d of [-5, 5]) { g.beginPath(); g.arc(sx + d * sc * dpr, sy, 2.2 * sc * dpr, 0, 7); g.fill(); } g.restore(); }
    }
    if (weather) {
      g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const N = { rain: 150, snow: 110, leaves: 36, embers: 60, fog: 0 }[weather] || 0;
      while (wx.length < N) wx.push({ x: Math.random() * W, y: Math.random() * H, v: .6 + Math.random() * .8, r: Math.random() * 6 });
      const dt = 1 / 60;
      if (weather === 'rain') { g.strokeStyle = 'rgba(186,214,255,.55)'; g.lineWidth = 1.2; g.beginPath(); for (const p of wx) { p.y += 900 * p.v * dt; p.x -= 120 * dt; if (p.y > H) { p.y = -10; p.x = Math.random() * (W + 100); } g.moveTo(p.x, p.y); g.lineTo(p.x - 4, p.y + 14 * p.v); } g.stroke(); }
      else if (weather === 'snow') { g.fillStyle = 'rgba(255,255,255,.9)'; for (const p of wx) { p.y += 50 * p.v * dt; p.x += Math.sin(t + p.r) * 20 * dt; if (p.y > H) { p.y = -5; p.x = Math.random() * W; } g.beginPath(); g.arc(p.x, p.y, 1.2 + p.v * 1.4, 0, 7); g.fill(); } }
      else if (weather === 'leaves') { for (const p of wx) { p.y += 45 * p.v * dt; p.x += (Math.sin(t * 1.3 + p.r) * 40 - 20) * dt; if (p.y > H || p.x < -10) { p.y = -8; p.x = Math.random() * (W + 60); } g.save(); g.translate(p.x, p.y); g.rotate(t * 2 + p.r); g.fillStyle = ['#ea580c', '#ca8a04', '#b91c1c'][Math.floor(p.r) % 3]; g.beginPath(); g.ellipse(0, 0, 5, 2.5, 0, 0, 7); g.fill(); g.restore(); } }
      else if (weather === 'embers') { g.globalCompositeOperation = 'lighter'; for (const p of wx) { p.y -= 40 * p.v * dt; p.x += Math.sin(t * 2 + p.r) * 25 * dt; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } g.fillStyle = `rgba(255,${120 + (p.r * 15 | 0)},40,${.5 + Math.sin(t * 6 + p.r) * .3})`; g.beginPath(); g.arc(p.x, p.y, 1.5 + p.v, 0, 7); g.fill(); } }
      else if (weather === 'fog') { for (let k = 0; k < 3; k++) { const yy = H * (.3 + k * .25), off = ((t * (12 + k * 6)) % (W + 400)) - 200, gr = g.createRadialGradient(off, yy, 10, off, yy, W * .55); gr.addColorStop(0, 'rgba(226,232,240,.28)'); gr.addColorStop(1, 'rgba(226,232,240,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); } }
      g.restore();
    }
    if (storyHold) {
      g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = 'rgba(2,6,23,.78)'; g.fillRect(0, 0, W, H);
      const bw = Math.min(560, W - 40); g.font = '600 18px Georgia, serif'; const words = storyHold.split(/\s+/), lines = []; let ln = '';
      for (const w of words) { const tt = ln ? ln + ' ' + w : w; if (g.measureText(tt).width > bw - 48) { lines.push(ln); ln = w; } else ln = tt; } if (ln) lines.push(ln);
      const bh = lines.length * 27 + 84, bx = (W - bw) / 2, by = (H - bh) / 2;
      g.fillStyle = 'rgba(15,23,42,.96)'; g.strokeStyle = 'rgba(148,163,184,.35)'; g.lineWidth = 1; g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 16) : g.rect(bx, by, bw, bh); g.fill(); g.stroke();
      g.fillStyle = '#e2e8f0'; g.textAlign = 'left'; g.textBaseline = 'top'; lines.forEach((l, i) => g.fillText(l, bx + 24, by + 24 + i * 27));
      g.font = '600 13px system-ui'; g.fillStyle = `rgba(253,224,71,${.6 + Math.sin(t * 4) * .3})`; g.textAlign = 'right'; g.fillText('Press jump to continue ▶', bx + bw - 22, by + bh - 34);
      g.restore();
    }
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
    debug: { get dark() { return dark; }, get weather() { return weather; }, get story() { return storyHold; }, get grid() { return grid; }, get frozenE() { return frozenE; }, tnt, ents: () => ents, set, step: dt => update(dt), skipLevel: () => levelDone(), get coins() { return coins; }, get gems() { return gems; }, get lives() { return lives; }, get sign() { return signTxt; }, get sw() { return sw; } },
  };
}

window.MakerEngine = { PAL, TILES, PEOPLE, LOOK_DEFAULT, drawLook, TILE_ORDER, TALK, NOT_IN, SOLID, THEMES, DEFAULT_SETTINGS, drawTile, drawSprite, drawBackground, blankLevel, exampleGame, run, spriteCanvas };
})();
