/* SanjivramOS game character ("look") — one character you design once and see in every online game.
   Saved on your SanjivramOS account (POST /social/api/look) and in localStorage 'sjlook' (works offline / signed out).
   SJLook.get() → look · SJLook.save(look) · SJLook.random() · SJLook.draw(ctx, look, x, y, h, {pose, t, face}) — full body
   SJLook.face(look, px) → data: URL portrait · SJLook.editor(container, look, onChange) — the creator UI
   Parts are numbers, colours are #rrggbb, so the server can check them (server/social.js cleanLook).            */
(() => {
  'use strict';
  if (window.SJLook) return;
  const PARTS = {
    hairStyle: ['Short', 'Spiky', 'Long', 'Bob', 'Mohawk', 'Bun', 'Curly', 'Bald', 'Ponytail', 'Side part', 'Afro', 'Braids', 'Pigtails', 'Flat top', 'Messy', 'Long wavy'],
    eyes: ['Round', 'Happy', 'Sleepy', 'Wide', 'Wink', 'Determined', 'Stars', 'Hearts', 'Cat', 'Angry', 'Closed', 'Sparkly'],
    brows: ['Normal', 'Angry', 'Worried', 'None', 'Thick', 'Raised'],
    mouth: ['Smile', 'Grin', 'Flat', 'Open', 'Smirk', 'Tongue', 'Teeth', 'Surprised', 'Fangs', 'Frown', 'Cat'],
    faceMark: ['None', 'Freckles', 'Blush', 'Mustache', 'Beard', 'Scar', 'Whiskers', 'Face paint', 'Bandage', 'Star sticker'],
    shirtStyle: ['T-shirt', 'Hoodie', 'Jacket', 'Stripes', 'Vest', 'Armor', 'Suit', 'Dress', 'Overalls', 'Tank top', 'Sweater', 'Robe', 'Jersey', 'Lab coat'],
    hat: ['None', 'Cap', 'Beanie', 'Crown', 'Top hat', 'Headband', 'Helmet', 'Wizard', 'Headphones', 'Cowboy', 'Pirate', 'Party hat', 'Bunny ears', 'Cat ears', 'Halo', 'Horns', 'Chef', 'Flower', 'Santa', 'Viking', 'Propeller', 'Hair bow', 'Antennae', 'Fedora', 'Sparkle fedora', 'Shadow hood', 'Winged helm', 'Crystal crown', 'Flame helm', 'Frost horns', 'Royal helm', 'Storm wings helm', 'Angel wing helm', 'Dragon helm', 'Knight helm', 'Samurai helm', 'Pumpkin head', 'Tiara', 'Traffic cone', 'Space helmet', 'Ninja hood', 'Gear top hat', 'Dark crown', 'Witch hat', 'Pharaoh headdress'],
    acc: ['None', 'Glasses', 'Shades', 'Mask', 'Scarf', 'Backpack', 'Cape', 'Wings', 'Bow tie', 'Tie', 'Necklace', 'Eyepatch', 'Monocle', 'Jetpack', 'Tail', 'Earrings'],
    held: ['None', 'Sword', 'Magic wand', 'Shield', 'Balloon', 'Guitar', 'Ice cream', 'Flag', 'Torch', 'Phone', 'Umbrella', 'Hammer', 'Bow', 'Lollipop', 'Fishing rod'],
    pet: ['None', 'Cat', 'Dog', 'Bird', 'Slime', 'Robot', 'Ghost', 'Dragon', 'Bunny'],
    aura: ['None', 'Sparkles', 'Fire', 'Hearts', 'Snow', 'Bubbles', 'Lightning', 'Music'],
    body: ['Slim', 'Normal', 'Strong'],
  };
  const PAL = {
    skin: ['#ffe0c7', '#f8c9a0', '#e0a476', '#c68652', '#8d5a36', '#5c3a21', '#ffd2e8', '#b9f0c8', '#bcd7ff'],
    hair: ['#1f1a17', '#4a2f1d', '#8a5a2b', '#d6a756', '#f3e3a0', '#c0392b', '#ff7ac8', '#5b8cff', '#33d1a1', '#e5e7eb'],
    shirt: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f1f5f9', '#334155', '#111827'],
    pants: ['#1e3a8a', '#334155', '#111827', '#78350f', '#065f46', '#7f1d1d', '#e5e7eb', '#a16207'],
    shoes: ['#111827', '#f8fafc', '#b91c1c', '#1d4ed8', '#92400e', '#16a34a'],
  };
  PAL.shirt2 = PAL.shirt; PAL.hatColor = PAL.shirt; PAL.accColor = PAL.shirt.concat(['#9ca3af']); PAL.eye = ['#1f2937', '#2563eb', '#059669', '#7c2d12', '#7c3aed', '#dc2626'];
  PAL.markColor = ['#ef4444', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#f1f5f9', '#111827', '#ec4899'];
  PAL.heldColor = PAL.shirt.concat(['#9ca3af', '#facc15']); PAL.petColor = ['#f97316', '#f1f5f9', '#111827', '#9ca3af', '#a16207', '#22c55e', '#60a5fa', '#f472b6', '#a855f7', '#facc15'];
  PAL.auraColor = ['#facc15', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#22d3ee', '#22c55e', '#f1f5f9'];
  const DEF = { skin: '#f8c9a0', hair: '#4a2f1d', eye: '#1f2937', shirt: '#3b82f6', shirt2: '#f1f5f9', pants: '#334155', shoes: '#111827', hatColor: '#ef4444', accColor: '#111827', markColor: '#ef4444', heldColor: '#9ca3af', petColor: '#f97316', auraColor: '#facc15', hairStyle: 0, eyes: 0, brows: 0, mouth: 0, faceMark: 0, shirtStyle: 0, hat: 0, acc: 0, held: 0, pet: 0, aura: 0, body: 1, title: '', custom: null };
  const pick = a => a[Math.random() * a.length | 0];
  function random() {
    const l = { ...DEF };
    for (const k of Object.keys(PAL)) l[k] = pick(PAL[k]);
    for (const k of Object.keys(PARTS)) l[k] = Math.random() * PARTS[k].length | 0;
    for (const k of ['hat', 'acc', 'faceMark', 'held', 'pet', 'aura']) if (Math.random() < .55) l[k] = 0;
    return l;
  }
  const norm = l => ({ ...DEF, ...(l || {}) });
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem('sjlook')); } catch {}
  async function get(fromServer = true) {
    if (fromServer) try { const r = await fetch('/social/api/me', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j.me && j.me.look) { cache = j.me.look; try { localStorage.setItem('sjlook', JSON.stringify(cache)); } catch {} } } } catch {}
    return norm(cache);
  }
  async function save(l) {
    cache = norm(l); try { localStorage.setItem('sjlook', JSON.stringify(cache)); } catch {}
    try { const r = await fetch('/social/api/look', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look: cache }) }); return r.ok ? 'account' : r.status === 401 ? 'local' : 'error'; } catch { return 'local'; }
  }
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))); return `rgb(${c})`; };
  const rgb = hex => { const n = parseInt((hex || '#888888').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };


  /* ---------- custom items: 16×16 pixel art you draw yourself (Item Workshop in the Character Creator) ----------
     item = { n: name, s: slot, p: [16 × '#rrggbb'], d: 256 chars ('.' = see-through, '0'-'f' = palette index) }
     Worn items live in look.custom[slot]; your collection lives in localStorage 'sjlook.items'.                 */
  const SLOTS = [['hat', 'Hat', '🎩'], ['face', 'Face', '😎'], ['badge', 'Badge', '🏅'], ['back', 'Back', '🪽'], ['held', 'Held item', '🗡️'], ['pet', 'Pet', '🐾']];
  const SLOT_IDS = SLOTS.map(x => x[0]);
  const IPAL = ['#111827', '#ffffff', '#9ca3af', '#4b5563', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#92400e', '#f8c9a0', '#7f1d1d'];
  const HEX = /^#[0-9a-f]{6}$/i;
  function cleanItem(it, slot) {
    if (!it || typeof it !== 'object' || typeof it.d !== 'string' || !/^[.0-9a-f]{256}$/.test(it.d)) return null;
    const p = (Array.isArray(it.p) ? it.p : []).slice(0, 16).map(c => typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : '#000000');
    while (p.length < 16) p.push(IPAL[p.length]);
    const s = SLOT_IDS.includes(slot || it.s) ? (slot || it.s) : 'hat';
    return { n: String(it.n || 'My item').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) || 'My item', s, p, d: it.d };
  }
  const okItem = it => !!(it && typeof it.d === 'string' && it.d.length === 256 && Array.isArray(it.p));
  const custom = (L, slot) => { const it = L && L.custom && L.custom[slot]; return okItem(it) ? it : null; };
  const itemKey = it => it.d + it.p.join('');
  const imgCache = new Map(), runCache = new Map();
  function itemCanvas(it) {
    const k = itemKey(it); let c = imgCache.get(k); if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
    for (let i = 0; i < 256; i++) { const ch = it.d[i]; if (ch === '.') continue; x.fillStyle = it.p[parseInt(ch, 16)]; x.fillRect(i % 16, i >> 4, 1, 1); }
    if (imgCache.size > 300) imgCache.clear(); imgCache.set(k, c); return c;
  }
  /** draw an item square w×w with top-left (x, y); flip mirrors it */
  function drawItem(ctx, it, x, y, w, flip) {
    if (!okItem(it)) return; ctx.save(); ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(x + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + w / 2), 0); }
    ctx.drawImage(itemCanvas(it), x, y, w, w); ctx.restore();
  }
  const itemURL = (it, px = 64) => { const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'); drawItem(x, it, 0, 0, px); return c.toDataURL(); };
  /** rows of same-colour pixels merged into runs {x, y, w, c} — the 3D kit draws one box per run */
  function runs(it) {
    if (!okItem(it)) return null; const k = itemKey(it); let r = runCache.get(k); if (r) return r; r = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16;) { const ch = it.d[y * 16 + x]; if (ch === '.') { x++; continue; } let w = 1; while (x + w < 16 && it.d[y * 16 + x + w] === ch) w++; r.push({ x, y, w, c: it.p[parseInt(ch, 16)] }); x += w; }
    if (runCache.size > 300) runCache.clear(); runCache.set(k, r); return r;
  }
  /* ---------- clothing made from your own pictures: look.cloth.shirt / look.cloth.pants ----------
     { n, w, h, px } — px = w×h pixels, 6 hex chars each ('......' = see-through). Shirt covers the chest,
     pants: left half → left leg, right half → right leg. */
  const CLOTH_KINDS = ['shirt', 'pants'];
  const okCloth = c => !!(c && Number.isInteger(c.w) && Number.isInteger(c.h) && c.w >= 4 && c.h >= 4 && c.w <= 32 && c.h <= 32 && typeof c.px === 'string' && c.px.length === c.w * c.h * 6 && /^[0-9a-f.]+$/.test(c.px));
  const cloth = (L, k) => { const c = L && L.cloth && L.cloth[k]; return okCloth(c) ? c : null; };
  const clothCache = new Map(), cloth3d = new Map();
  function clothCanvas(c) {
    let cv = clothCache.get(c.px); if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = c.w; cv.height = c.h; const x = cv.getContext('2d'), im = x.createImageData(c.w, c.h);
    for (let i = 0; i < c.w * c.h; i++) { const h = c.px.substr(i * 6, 6); if (h[0] === '.') continue; const n = parseInt(h, 16); im.data[i * 4] = n >> 16; im.data[i * 4 + 1] = n >> 8 & 255; im.data[i * 4 + 2] = n & 255; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); if (clothCache.size > 60) clothCache.clear(); clothCache.set(c.px, cv); return cv;
  }
  /** a coarse cols×rows colour grid of a clothing picture (for the 3D kit), merged into runs {x, y, w, c} */
  function clothRuns(c, cols, rows, x0 = 0, x1 = 1) {
    const key = c.px + cols + rows + x0 + x1; let r = cloth3d.get(key); if (r) return r; r = [];
    for (let gy = 0; gy < rows; gy++) {
      let prev = null;
      for (let gx = 0; gx < cols; gx++) {
        let R = 0, G = 0, B = 0, n = 0;
        const sx0 = Math.floor((x0 + (x1 - x0) * gx / cols) * c.w), sx1 = Math.max(sx0 + 1, Math.floor((x0 + (x1 - x0) * (gx + 1) / cols) * c.w)), sy0 = Math.floor(gy / rows * c.h), sy1 = Math.max(sy0 + 1, Math.floor((gy + 1) / rows * c.h));
        for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const h = c.px.substr((y * c.w + x) * 6, 6); if (h[0] === '.') continue; const v = parseInt(h, 16); R += v >> 16; G += v >> 8 & 255; B += v & 255; n++; }
        if (!n) { prev = null; continue; }
        const q = v => Math.min(255, Math.round(v / n / 17) * 17), col = '#' + [q(R), q(G), q(B)].map(v => v.toString(16).padStart(2, '0')).join('');
        if (prev && prev.c === col) prev.w++; else { prev = { x: gx, y: gy, w: 1, c: col }; r.push(prev); }
      }
    }
    if (cloth3d.size > 60) cloth3d.clear(); cloth3d.set(key, r); return r;
  }
  const Clothes = {
    list() { try { const v = JSON.parse(localStorage.getItem('sjlook.clothes')); return Array.isArray(v) ? v.filter(okCloth) : []; } catch { return []; } },
    _set(v) { try { localStorage.setItem('sjlook.clothes', JSON.stringify(v.slice(0, 60))); return true; } catch { return false; } },
    put(c) { if (!okCloth(c)) return null; const k = { id: c.id || Math.random().toString(36).slice(2, 10), kind: CLOTH_KINDS.includes(c.kind) ? c.kind : 'shirt', n: String(c.n || 'My clothes').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24), w: c.w, h: c.h, px: c.px, avg: HEX.test(c.avg || '') ? c.avg : null }; const l = Clothes.list().filter(x => x.id !== k.id); return Clothes._set([k, ...l]) ? k : null; },
    remove(id) { Clothes._set(Clothes.list().filter(x => x.id !== id)); },
  };
  const Items = {
    list() { try { const v = JSON.parse(localStorage.getItem('sjlook.items')); return Array.isArray(v) ? v.filter(okItem) : []; } catch { return []; } },
    _set(v) { try { localStorage.setItem('sjlook.items', JSON.stringify(v.slice(0, 120))); } catch {} },
    /** add or update (same id) — returns the stored item */
    put(it) { const c = cleanItem(it); if (!c) return null; c.id = it.id || Math.random().toString(36).slice(2, 10); const l = Items.list().filter(x => x.id !== c.id); Items._set([c, ...l]); return c; },
    remove(id) { Items._set(Items.list().filter(x => x.id !== id)); },
    code(it) { const c = cleanItem(it); return 'SJITEM:' + btoa(JSON.stringify([c.n, c.s, c.p.map(x => x.slice(1)).join(''), c.d])); },
    parse(code) { try { const m = /SJITEM:([A-Za-z0-9+/=]+)/.exec(String(code)); if (!m) return null; const [n, s, p, d] = JSON.parse(atob(m[1])); return cleanItem({ n, s, d, p: String(p).match(/.{6}/g).map(x => '#' + x) }); } catch { return null; } },
  };
  /* starter designs to remix — rows of 16, characters index the default item palette IPAL */
  const T = (n, s, rows) => ({ n, s, p: IPAL.slice(), d: rows.join('') });
  const E = '................';
  const TEMPLATES = [
    T('Gold crown', 'hat', [E, E, E, E, E, E, E, E, E, '.6.....66.....6.', '.66...6666...66.', '.666.666666.666.', '.66666666666666.', '.66466696664666.', '.66666666666666.', '.dddddddddddddd.']),
    T('Top hat', 'hat', [E, E, E, E, '....00000000....', '....00000000....', '....00000000....', '....00000000....', '....00000000....', '....00000000....', '....00000000....', '....cccccccc....', '....cccccccc....', '....00000000....', '.00000000000000.', '.00000000000000.']),
    T('Cool shades', 'face', [E, E, E, E, E, E, '.00000000000000.', '.09999000099990.', '..0990....0990..', '...00......00...', E, E, E, E, E, E]),
    T('Heart', 'badge', [E, E, '...444....444...', '..44444..44444..', '.44144444444444.', '.41444444444444.', '.44444444444444.', '.44444444444444.', '..444444444444..', '...4444444444...', '....44444444....', '.....444444.....', '......4444......', '.......44.......', E, E]),
    T('Lightning', 'badge', [E, '.........666....', '........666.....', '.......666......', '......666.......', '.....666........', '....66666666....', '.......6666.....', '......666.......', '.....666........', '....666.........', '...66...........', '..6.............', E, E, E]),
    T('Angel wings', 'back', [E, '11............11', '111..........111', '1211........1121', '12111......11121', '112111....111211', '1112111..1112111', '1111211..1121111', '1111121..1211111', '.111111..111111.', '.11111....11111.', '..1111....1111..', '...11......11...', E, E, E]),
    T('Knight sword', 'held', ['.......11.......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '......1221......', '...6666666666...', '.......dd.......', '.......dd.......', '.......dd.......', '......6666......']),
    T('Ghost buddy', 'pet', [E, '.....111111.....', '....11111111....', '...1111111111...', '...1101111011...', '...1001111001...', '...1111111111...', '...111c11c111...', '...1111001111...', '...1111111111...', '...1111111111...', '...1111111111...', '...11.111.111...', '...1...1...1....', E, E]),
    T('Flower', 'hat', [E, E, E, E, E, E, E, '......cc........', '.....c66c.......', '......cc........', '.......7........', '......77........', '.......7........', E, E, E]),
  ];

  /* ---------- 2D drawing: a chunky cartoon figure, feet at (x, y), h = total height ---------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function star(ctx, x, y, r, n = 5) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); }
  function heart(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y + r * .9); ctx.bezierCurveTo(x - r * 1.4, y - r * .1, x - r * .6, y - r * 1.1, x, y - r * .35); ctx.bezierCurveTo(x + r * .6, y - r * 1.1, x + r * 1.4, y - r * .1, x, y + r * .9); ctx.fill(); }
  function head(ctx, L, cx, cy, s, face = 1, t = 0) {
    const hw = 1.0 * s, hh = 0.95 * s;
    // back hair
    ctx.fillStyle = L.hair;
    if (L.hairStyle === 2) rr(ctx, cx - hw * .62, cy - hh * .45, hw * 1.24, hh * 1.15, s * .3), ctx.fill();
    if (L.hairStyle === 8) { ctx.beginPath(); ctx.ellipse(cx - face * hw * .55, cy + hh * .1, s * .16, s * .38, 0, 0, 7); ctx.fill(); }
    if (L.hairStyle === 10) { ctx.beginPath(); ctx.arc(cx, cy - hh * .18, s * .78, 0, 7); ctx.fill(); }
    if (L.hairStyle === 11) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(cx + sx * hw * .5, cy - hh * .1 + i * s * .2, s * .1, s * .12, 0, 0, 7); ctx.fill(); }
    if (L.hairStyle === 12) for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * hw * .68, cy - hh * .25, s * .22, 0, 7); ctx.fill(); }
    if (L.hairStyle === 15) { ctx.beginPath(); ctx.moveTo(cx - hw * .62, cy - hh * .3); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - hw * .62 + i * hw * .207, cy + hh * (.62 + (i % 2) * .12)); ctx.lineTo(cx + hw * .62, cy - hh * .3); ctx.fill(); }
    // face
    ctx.fillStyle = L.skin; rr(ctx, cx - hw / 2, cy - hh / 2, hw, hh, s * .28); ctx.fill();
    ctx.fillStyle = shade(L.skin, -.12); ctx.beginPath(); ctx.ellipse(cx - hw * .52, cy + hh * .05, s * .09, s * .13, 0, 0, 7); ctx.ellipse(cx + hw * .52, cy + hh * .05, s * .09, s * .13, 0, 0, 7); ctx.fill();
    // hair on top
    ctx.fillStyle = L.hair;
    const top = cy - hh / 2;
    switch (L.hairStyle) {
      case 0: case 2: case 8: case 9: case 11: case 12: case 15: rr(ctx, cx - hw * .53, top - s * .06, hw * 1.06, hh * .34, s * .2); ctx.fill(); if (L.hairStyle === 9) { ctx.beginPath(); ctx.moveTo(cx - hw * .53, top + hh * .25); ctx.lineTo(cx + hw * .1, top + hh * .2); ctx.lineTo(cx - hw * .53, top + hh * .5); ctx.fill(); } break;
      case 1: for (let i = 0; i < 5; i++) { const x = cx - hw * .5 + i * hw * .25; ctx.beginPath(); ctx.moveTo(x - s * .1, top + s * .15); ctx.lineTo(x + s * .02, top - s * .28); ctx.lineTo(x + s * .17, top + s * .15); ctx.fill(); } rr(ctx, cx - hw * .53, top - s * .02, hw * 1.06, hh * .26, s * .12); ctx.fill(); break;
      case 3: rr(ctx, cx - hw * .6, top - s * .06, hw * 1.2, hh * .75, s * .25); ctx.fill(); ctx.fillStyle = L.skin; rr(ctx, cx - hw * .42, top + hh * .25, hw * .84, hh * .7, s * .2); ctx.fill(); break;
      case 4: rr(ctx, cx - s * .1, top - s * .35, s * .2, hh * .55, s * .08); ctx.fill(); break;
      case 5: rr(ctx, cx - hw * .53, top - s * .04, hw * 1.06, hh * .3, s * .2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, top - s * .18, s * .2, 0, 7); ctx.fill(); break;
      case 6: for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - hw * .45 + i * hw * .18, top + s * .02, s * .17, 0, 7); ctx.fill(); } break;
      case 7: case 10: break;
      case 13: rr(ctx, cx - hw * .53, top - s * .3, hw * 1.06, s * .44, s * .06); ctx.fill(); break;
      case 14: rr(ctx, cx - hw * .53, top - s * .04, hw * 1.06, hh * .3, s * .2); ctx.fill(); for (const [dx, dy, a] of [[-.4, -.05, -.7], [-.15, -.18, -.3], [.1, -.2, .2], [.35, -.1, .6], [.0, .12, 2.6]]) { ctx.save(); ctx.translate(cx + dx * hw, top + dy * s); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, s * .1, s * .24, 0, 0, 7); ctx.fill(); ctx.restore(); } break;
    }
    // eyes
    const ey = cy - hh * .02, ex = hw * .22;
    ctx.fillStyle = L.eye; ctx.strokeStyle = L.eye; ctx.lineWidth = Math.max(1, s * .06); ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex + face * s * .04;
      if (L.eyes === 6) { ctx.fillStyle = '#facc15'; star(ctx, x, ey, s * .12); ctx.fillStyle = L.eye; }
      else if (L.eyes === 7) { ctx.fillStyle = '#ef4444'; heart(ctx, x, ey, s * .11); ctx.fillStyle = L.eye; }
      else if (L.eyes === 8) { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(x, ey, s * .085, s * .09, 0, 0, 7); ctx.fill(); ctx.fillStyle = L.eye; ctx.beginPath(); ctx.ellipse(x, ey, s * .025, s * .08, 0, 0, 7); ctx.fill(); }
      else if (L.eyes === 9) { ctx.beginPath(); ctx.arc(x, ey, s * .075, 0, 7); ctx.fill(); ctx.fillStyle = L.skin; ctx.beginPath(); ctx.moveTo(x - s * .12, ey - s * .12 - sx * s * .04); ctx.lineTo(x + s * .12, ey - s * .12 + sx * s * .04); ctx.lineTo(x + s * .12, ey - s * .02 + sx * s * .04); ctx.lineTo(x - s * .12, ey - s * .02 - sx * s * .04); ctx.fill(); ctx.fillStyle = L.eye; }
      else if (L.eyes === 10) { ctx.beginPath(); ctx.arc(x, ey - s * .03, s * .07, Math.PI * .1, Math.PI * .9); ctx.stroke(); }
      else if (L.eyes === 11) { ctx.beginPath(); ctx.ellipse(x, ey, s * .1, s * .12, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * .04, ey - s * .05, s * .04, 0, 7); ctx.arc(x - s * .04, ey + s * .05, s * .02, 0, 7); ctx.fill(); ctx.fillStyle = L.eye; }
      else if (L.eyes === 1) { ctx.beginPath(); ctx.arc(x, ey + s * .03, s * .07, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (L.eyes === 2) { ctx.beginPath(); ctx.moveTo(x - s * .07, ey); ctx.lineTo(x + s * .07, ey); ctx.stroke(); }
      else if (L.eyes === 4 && sx === 1) { ctx.beginPath(); ctx.moveTo(x - s * .07, ey); ctx.lineTo(x + s * .07, ey - s * .02); ctx.stroke(); }
      else { const r = L.eyes === 3 ? s * .1 : s * .075; ctx.beginPath(); ctx.ellipse(x, ey, r * .8, r, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * .3, ey - r * .35, r * .3, 0, 7); ctx.fill(); ctx.fillStyle = L.eye; if (L.eyes === 5) { ctx.fillStyle = L.skin; ctx.fillRect(x - r, ey - r * 1.2, r * 2, r * .7); ctx.fillStyle = L.eye; } }
    }
    // brows
    if (L.brows !== 3) { ctx.strokeStyle = shade(L.hair, -.2); ctx.lineWidth = Math.max(1, s * .05); for (const sx of [-1, 1]) { const x = cx + sx * ex + face * s * .04, tilt = L.brows === 1 ? sx * .06 : L.brows === 2 ? -sx * .06 : 0; ctx.lineWidth = Math.max(1, s * (L.brows === 4 ? .09 : .05)); ctx.beginPath(); if (L.brows === 5) { ctx.arc(x, ey - s * .14, s * .1, Math.PI * 1.15, Math.PI * 1.85); } else { ctx.moveTo(x - s * .09, ey - s * .17 - tilt * s); ctx.lineTo(x + s * .09, ey - s * .17 + tilt * s); } ctx.stroke(); } }
    // mouth
    const my = cy + hh * .26, mx = cx + face * s * .04;
    if (L.faceMark === 4) { ctx.fillStyle = L.hair; ctx.beginPath(); ctx.moveTo(cx - hw * .5, cy + hh * .02); ctx.lineTo(cx + hw * .5, cy + hh * .02); ctx.quadraticCurveTo(cx + hw * .5, cy + hh * .72, cx, cy + hh * .72); ctx.quadraticCurveTo(cx - hw * .5, cy + hh * .72, cx - hw * .5, cy + hh * .02); ctx.fill(); ctx.fillStyle = L.skin; ctx.beginPath(); ctx.ellipse(mx, my, s * .17, s * .09, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#7f1d1d'; ctx.fillStyle = '#7f1d1d'; ctx.lineWidth = Math.max(1, s * .05);
    if (L.mouth === 0) { ctx.beginPath(); ctx.arc(mx, my - s * .06, s * .12, .25 * Math.PI, .75 * Math.PI); ctx.stroke(); }
    else if (L.mouth === 1) { ctx.beginPath(); ctx.arc(mx, my - s * .07, s * .14, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(mx - s * .11, my - s * .07, s * .22, s * .04); }
    else if (L.mouth === 2) { ctx.beginPath(); ctx.moveTo(mx - s * .1, my); ctx.lineTo(mx + s * .1, my); ctx.stroke(); }
    else if (L.mouth === 3) { ctx.beginPath(); ctx.ellipse(mx, my, s * .07, s * .09, 0, 0, 7); ctx.fill(); }
    else if (L.mouth === 5) { ctx.beginPath(); ctx.arc(mx, my - s * .07, s * .13, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.ellipse(mx + s * .03, my + s * .04, s * .06, s * .06, 0, 0, 7); ctx.fill(); }
    else if (L.mouth === 6) { ctx.fillStyle = '#fff'; rr(ctx, mx - s * .12, my - s * .06, s * .24, s * .1, s * .03); ctx.fill(); ctx.lineWidth = Math.max(1, s * .025); ctx.stroke(); ctx.beginPath(); ctx.moveTo(mx - s * .12, my - s * .01); ctx.lineTo(mx + s * .12, my - s * .01); ctx.moveTo(mx, my - s * .06); ctx.lineTo(mx, my + s * .04); ctx.stroke(); }
    else if (L.mouth === 7) { ctx.beginPath(); ctx.ellipse(mx, my, s * .06, s * .08, 0, 0, 7); ctx.stroke(); }
    else if (L.mouth === 8) { ctx.beginPath(); ctx.arc(mx, my - s * .06, s * .12, .2 * Math.PI, .8 * Math.PI); ctx.stroke(); ctx.fillStyle = '#fff'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + sx * s * .09, my - s * .01); ctx.lineTo(mx + sx * s * .05, my); ctx.lineTo(mx + sx * s * .075, my + s * .07); ctx.fill(); } }
    else if (L.mouth === 9) { ctx.beginPath(); ctx.arc(mx, my + s * .1, s * .12, 1.25 * Math.PI, 1.75 * Math.PI); ctx.stroke(); }
    else if (L.mouth === 10) { ctx.beginPath(); ctx.arc(mx - s * .055, my - s * .02, s * .055, 0, Math.PI); ctx.arc(mx + s * .055, my - s * .02, s * .055, 0, Math.PI); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(mx - s * .1, my); ctx.quadraticCurveTo(mx + s * .05, my + s * .03, mx + s * .12, my - s * .06); ctx.stroke(); }
    // face marks
    const ch = cy + hh * .16;
    switch (L.faceMark) {
      case 1: ctx.fillStyle = shade(L.skin, -.35); for (const sx of [-1, 1]) for (const [dx, dy] of [[0, 0], [.07, .05], [-.06, .06], [.03, -.05]]) { ctx.beginPath(); ctx.arc(cx + sx * hw * .3 + dx * s, ch + dy * s, s * .018, 0, 7); ctx.fill(); } break;
      case 2: ctx.fillStyle = 'rgba(244,114,182,.55)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sx * hw * .32, ch + s * .02, s * .1, s * .055, 0, 0, 7); ctx.fill(); } break;
      case 3: ctx.fillStyle = L.hair; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(mx + sx * s * .08, my - s * .1, s * .1, s * .045, sx * .25, 0, 7); ctx.fill(); } break;
      case 5: ctx.strokeStyle = '#9f1239'; ctx.lineWidth = Math.max(1, s * .03); ctx.beginPath(); ctx.moveTo(cx + ex - s * .05, ey - s * .2); ctx.lineTo(cx + ex + s * .12, ey + s * .16); for (let i = 0; i < 3; i++) { const u = i / 2 * .7 + .15, px = cx + ex - s * .05 + s * .17 * u, py = ey - s * .2 + s * .36 * u; ctx.moveTo(px - s * .04, py + s * .02); ctx.lineTo(px + s * .04, py - s * .02); } ctx.stroke(); break;
      case 6: ctx.strokeStyle = shade(L.skin, -.5); ctx.lineWidth = Math.max(1, s * .018); ctx.beginPath(); for (const sx of [-1, 1]) for (const a of [-.15, 0, .15]) { ctx.moveTo(cx + sx * hw * .22, ch); ctx.lineTo(cx + sx * hw * .5, ch + a * s); } ctx.stroke(); break;
      case 7: ctx.fillStyle = L.markColor; for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) { rr(ctx, cx + sx * hw * .32 - s * .09, ch - s * .03 + i * s * .07, s * .18, s * .035, s * .015); ctx.fill(); } break;
      case 8: ctx.save(); ctx.translate(cx + hw * .05, ey + s * .1); ctx.rotate(-.5); ctx.fillStyle = '#fcd9b6'; rr(ctx, -s * .16, -s * .045, s * .32, s * .09, s * .03); ctx.fill(); ctx.fillStyle = '#e8b98f'; ctx.fillRect(-s * .04, -s * .045, s * .08, s * .09); ctx.restore(); break;
      case 9: ctx.fillStyle = L.markColor; star(ctx, cx - face * hw * .32, ch, s * .07); break;
    }
    // accessories on the face
    ctx.lineWidth = Math.max(1, s * .045);
    if (L.acc === 1 || L.acc === 2) { ctx.strokeStyle = L.acc === 2 ? '#111' : L.accColor; ctx.fillStyle = L.acc === 2 ? 'rgba(10,10,10,.92)' : 'rgba(255,255,255,.15)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * ex + face * s * .04, ey, s * .13, 0, 7); ctx.fill(); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(cx - ex + s * .17, ey); ctx.lineTo(cx + ex - s * .09, ey); ctx.stroke(); }
    if (L.acc === 3) { ctx.fillStyle = L.accColor; rr(ctx, cx - hw * .42, cy + hh * .08, hw * .84, hh * .34, s * .12); ctx.fill(); }
    if (L.acc === 11) { const x = cx - ex + face * s * .04; ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(x, ey, s * .12, s * .1, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, s * .025); ctx.beginPath(); ctx.moveTo(cx - hw * .5, ey - s * .2); ctx.lineTo(cx + hw * .5, ey + s * .05); ctx.stroke(); }
    if (L.acc === 12) { const x = cx + ex + face * s * .04; ctx.strokeStyle = '#facc15'; ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, ey, s * .12, 0, 7); ctx.fill(); ctx.stroke(); ctx.lineWidth = Math.max(1, s * .015); ctx.beginPath(); ctx.moveTo(x + s * .1, ey + s * .06); ctx.quadraticCurveTo(x + s * .2, ey + s * .3, x + s * .05, ey + s * .45); ctx.stroke(); }
    if (L.acc === 15) { ctx.fillStyle = L.accColor; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * hw * .54, cy + hh * .22, s * .045, 0, 7); ctx.fill(); } }
    // hats
    ctx.fillStyle = L.hatColor;
    const ht = top + s * .02;
    switch (L.hat) {
      case 1: rr(ctx, cx - hw * .55, ht - s * .22, hw * 1.1, s * .34, s * .15); ctx.fill(); rr(ctx, cx + face * hw * .2 - hw * .35, ht + s * .02, hw * .7, s * .09, s * .04); ctx.fill(); break;
      case 2: rr(ctx, cx - hw * .56, ht - s * .3, hw * 1.12, s * .44, s * .22); ctx.fill(); ctx.fillStyle = shade(L.hatColor, -.2); ctx.fillRect(cx - hw * .56, ht + s * .02, hw * 1.12, s * .1); ctx.beginPath(); ctx.arc(cx, ht - s * .32, s * .09, 0, 7); ctx.fill(); break;
      case 3: ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(cx - hw * .42, ht + s * .02); for (let i = 0; i <= 4; i++) { ctx.lineTo(cx - hw * .42 + i * hw * .21, ht - (i % 2 ? s * .12 : s * .32)); } ctx.lineTo(cx + hw * .42, ht + s * .02); ctx.fill(); break;
      case 4: ctx.fillStyle = '#111827'; ctx.fillRect(cx - hw * .4, ht - s * .55, hw * .8, s * .58); ctx.fillRect(cx - hw * .62, ht - s * .02, hw * 1.24, s * .09); ctx.fillStyle = L.hatColor; ctx.fillRect(cx - hw * .4, ht - s * .14, hw * .8, s * .1); break;
      case 5: ctx.fillRect(cx - hw * .52, ht + s * .06, hw * 1.04, s * .11); break;
      case 6: rr(ctx, cx - hw * .58, ht - s * .2, hw * 1.16, hh * .62, s * .3); ctx.fill(); ctx.fillStyle = 'rgba(120,200,255,.55)'; rr(ctx, cx - hw * .4, ey - s * .14, hw * .8, s * .26, s * .1); ctx.fill(); break;
      case 7: ctx.beginPath(); ctx.moveTo(cx - hw * .6, ht + s * .08); ctx.lineTo(cx + face * s * .15, ht - s * .8); ctx.lineTo(cx + hw * .6, ht + s * .08); ctx.fill(); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(cx, ht - s * .25, s * .06, 0, 7); ctx.fill(); break;
      case 9: ctx.beginPath(); ctx.ellipse(cx, ht + s * .04, hw * .95, s * .1, 0, 0, 7); ctx.fill(); rr(ctx, cx - hw * .38, ht - s * .34, hw * .76, s * .4, s * .12); ctx.fill(); ctx.fillStyle = shade(L.hatColor, -.3); ctx.fillRect(cx - hw * .38, ht - s * .05, hw * .76, s * .07); break;
      case 10: ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.moveTo(cx - hw * .75, ht + s * .06); ctx.quadraticCurveTo(cx, ht - s * .7, cx + hw * .75, ht + s * .06); ctx.quadraticCurveTo(cx, ht - s * .12, cx - hw * .75, ht + s * .06); ctx.fill(); ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(cx, ht - s * .2, s * .07, 0, 7); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.fillRect(cx - hw * .6, ht - s * .02, hw * 1.2, s * .05); break;
      case 11: { ctx.beginPath(); ctx.moveTo(cx - hw * .3, ht + s * .02); ctx.lineTo(cx + face * s * .05, ht - s * .62); ctx.lineTo(cx + hw * .3, ht + s * .02); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 1; i < 3; i++) { const y = ht + s * .02 - i * s * .2, w = hw * .3 * (1 - i * .32); ctx.fillRect(cx - w, y, w * 2, s * .05); } ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx + face * s * .05, ht - s * .64, s * .07, 0, 7); ctx.fill(); break; }
      case 12: for (const sx of [-1, 1]) { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.ellipse(cx + sx * hw * .22, ht - s * .38, s * .1, s * .36, sx * .15, 0, 7); ctx.fill(); ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.ellipse(cx + sx * hw * .22, ht - s * .36, s * .045, s * .26, sx * .15, 0, 7); ctx.fill(); } break;
      case 13: for (const sx of [-1, 1]) { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(cx + sx * hw * .48, ht + s * .1); ctx.lineTo(cx + sx * hw * .42, ht - s * .3); ctx.lineTo(cx + sx * hw * .1, ht + s * .04); ctx.fill(); ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.moveTo(cx + sx * hw * .41, ht + s * .05); ctx.lineTo(cx + sx * hw * .38, ht - s * .17); ctx.lineTo(cx + sx * hw * .2, ht + s * .03); ctx.fill(); } break;
      case 14: ctx.strokeStyle = '#fde047'; ctx.lineWidth = s * .07; ctx.shadowColor = '#fde047'; ctx.shadowBlur = s * .3; ctx.beginPath(); ctx.ellipse(cx, ht - s * .3 + Math.sin(t * 3) * s * .03, hw * .42, s * .1, 0, 0, 7); ctx.stroke(); ctx.shadowBlur = 0; break;
      case 15: for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .38, ht + s * .08); ctx.quadraticCurveTo(cx + sx * hw * .6, ht - s * .15, cx + sx * hw * .5, ht - s * .38); ctx.quadraticCurveTo(cx + sx * hw * .38, ht - s * .1, cx + sx * hw * .16, ht + s * .06); ctx.fill(); } break;
      case 16: ctx.fillStyle = '#f8fafc'; ctx.fillRect(cx - hw * .4, ht - s * .2, hw * .8, s * .26); for (const dx of [-.28, 0, .28]) { ctx.beginPath(); ctx.arc(cx + dx * hw, ht - s * .32, s * .22, 0, 7); ctx.fill(); } ctx.fillStyle = '#e2e8f0'; ctx.fillRect(cx - hw * .4, ht - s * .02, hw * .8, s * .06); break;
      case 17: { const fx = cx + face * hw * .36, fy = ht + s * .05; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * s * .1, fy + Math.sin(a) * s * .1, s * .08, 0, 7); ctx.fill(); } ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(fx, fy, s * .065, 0, 7); ctx.fill(); break; }
      case 18: ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(cx - hw * .52, ht + s * .02); ctx.quadraticCurveTo(cx - face * hw * .1, ht - s * .7, cx - face * hw * .75, ht - s * .1); ctx.lineTo(cx + hw * .52, ht + s * .02); ctx.fill(); ctx.fillStyle = '#fff'; rr(ctx, cx - hw * .56, ht - s * .06, hw * 1.12, s * .16, s * .08); ctx.fill(); ctx.beginPath(); ctx.arc(cx - face * hw * .75, ht - s * .1, s * .1, 0, 7); ctx.fill(); break;
      case 19: ctx.fillStyle = '#f5f5f4'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .45, ht - s * .02); ctx.quadraticCurveTo(cx + sx * hw * .85, ht - s * .1, cx + sx * hw * .8, ht - s * .5); ctx.quadraticCurveTo(cx + sx * hw * .7, ht - s * .2, cx + sx * hw * .4, ht - s * .2); ctx.fill(); } ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.arc(cx, ht + s * .05, hw * .53, Math.PI, 0); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.fillRect(cx - hw * .53, ht - s * .02, hw * 1.06, s * .08); break;
      case 20: rr(ctx, cx - hw * .55, ht - s * .2, hw * 1.1, s * .3, s * .15); ctx.fill(); ctx.fillStyle = '#64748b'; ctx.fillRect(cx - s * .02, ht - s * .34, s * .04, s * .14); { const w = Math.cos(t * 18) * hw * .5; ctx.fillStyle = '#facc15'; ctx.fillRect(cx - Math.abs(w), ht - s * .38, Math.abs(w) * 2 + 1, s * .06); } break;
      case 21: { const bx = cx + face * hw * .3, by = ht - s * .02; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - s * .22, by - s * .14); ctx.lineTo(bx - s * .22, by + s * .14); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + s * .22, by - s * .14); ctx.lineTo(bx + s * .22, by + s * .14); ctx.fill(); ctx.fillStyle = shade(L.hatColor, -.25); ctx.beginPath(); ctx.arc(bx, by, s * .06, 0, 7); ctx.fill(); break; }
      case 22: ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(1, s * .035); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .15, ht + s * .02); ctx.quadraticCurveTo(cx + sx * hw * .2, ht - s * .3, cx + sx * hw * .35, ht - s * .45); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + sx * hw * .35, ht - s * .45, s * .07, 0, 7); ctx.fill(); } break;
      case 23: case 24: { ctx.beginPath(); ctx.ellipse(cx, ht + s * .04, hw * .85, s * .09, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - hw * .4, ht + s * .04); ctx.lineTo(cx - hw * .34, ht - s * .34); ctx.quadraticCurveTo(cx, ht - s * .22, cx + hw * .34, ht - s * .34); ctx.lineTo(cx + hw * .4, ht + s * .04); ctx.fill(); ctx.fillStyle = '#111827'; ctx.fillRect(cx - hw * .4, ht - s * .08, hw * .8, s * .09);
        if (L.hat === 24) { ctx.fillStyle = shade(L.hatColor, .55); ctx.shadowColor = L.hatColor; ctx.shadowBlur = s * .25; for (let i = 0; i < 7; i++) { const a = t * 1.3 + i * .9, r = hw * (.55 + .25 * Math.sin(i * 2.3)), k = .5 + .5 * Math.sin(t * 5 + i * 1.7); star(ctx, cx + Math.cos(a) * r, ht - s * .1 + Math.sin(a) * r * .9, s * .08 * k + s * .02, 4); } ctx.shadowBlur = 0; } break; }
      case 25: { ctx.fillStyle = 'rgba(0,0,0,.82)'; rr(ctx, cx - hw * .5, cy - hh * .5, hw, hh, s * .28); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(cx - hw * .66, cy + hh * .55); ctx.quadraticCurveTo(cx - hw * .72, ht - s * .3, cx, ht - s * .34); ctx.quadraticCurveTo(cx + hw * .72, ht - s * .3, cx + hw * .66, cy + hh * .55); ctx.lineTo(cx + hw * .42, cy + hh * .55); ctx.quadraticCurveTo(cx + hw * .48, ht + s * .02, cx, ht + s * .0); ctx.quadraticCurveTo(cx - hw * .48, ht + s * .02, cx - hw * .42, cy + hh * .55); ctx.fill(); ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(1, s * .035); ctx.stroke();
        const ec = L.accColor === '#111827' ? '#ef4444' : L.accColor; ctx.fillStyle = ec; ctx.shadowColor = ec; ctx.shadowBlur = s * .35; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sx * hw * .2 + face * s * .04, ey, s * .07, s * .035, sx * -.25, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; break; }
      case 26: { ctx.fillStyle = '#f8fafc'; for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(cx + sx * hw * .5, ht + s * .1); ctx.rotate(sx * (.5 + k * .3)); ctx.beginPath(); ctx.ellipse(0, -s * (.25 + k * .02), s * .08, s * (.3 - k * .05), 0, 0, 7); ctx.fill(); ctx.restore(); } ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(cx, ht + s * .12, hw * .56, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - hw * .56, ht + s * .1, s * .14, hh * .55); ctx.fillRect(cx + hw * .56 - s * .14, ht + s * .1, s * .14, hh * .55); ctx.fillStyle = L.hatColor; ctx.fillRect(cx - hw * .56, ht + s * .06, hw * 1.12, s * .07); ctx.fillStyle = '#94a3b8'; ctx.fillRect(cx - s * .03 + face * s * .04, ht + s * .1, s * .06, hh * .4); break; }
      case 27: { ctx.shadowColor = L.hatColor; ctx.shadowBlur = s * .3; for (const [dx, hgt, w] of [[-.36, .32, .1], [-.18, .5, .12], [0, .7, .14], [.18, .5, .12], [.36, .32, .1]]) { ctx.fillStyle = hexA(L.hatColor, .85); ctx.beginPath(); ctx.moveTo(cx + dx * hw - w * s, ht + s * .06); ctx.lineTo(cx + dx * hw, ht - hgt * s); ctx.lineTo(cx + dx * hw + w * s, ht + s * .06); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(cx + dx * hw - w * s * .4, ht); ctx.lineTo(cx + dx * hw, ht - hgt * s * .85); ctx.lineTo(cx + dx * hw, ht); ctx.fill(); } ctx.shadowBlur = 0; ctx.fillStyle = '#e5e7eb'; ctx.fillRect(cx - hw * .5, ht + s * .02, hw, s * .07); break; }
      case 28: { for (let i = 0; i < 5; i++) { const fx = cx - hw * .36 + i * hw * .18, fh = s * (.3 + .15 * Math.sin(t * 9 + i * 1.9) + (i === 2 ? .15 : 0)); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(fx - s * .1, ht - s * .1); ctx.quadraticCurveTo(fx - s * .05, ht - s * .1 - fh * .6, fx, ht - s * .1 - fh); ctx.quadraticCurveTo(fx + s * .05, ht - s * .1 - fh * .6, fx + s * .1, ht - s * .1); ctx.fill(); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.ellipse(fx, ht - s * .15 - fh * .25, s * .04, fh * .25, 0, 0, 7); ctx.fill(); } ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(cx, ht + s * .1, hw * .56, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#111827'; rr(ctx, cx - hw * .4, ey - s * .08, hw * .8, s * .14, s * .05); ctx.fill(); ctx.fillStyle = '#f97316'; ctx.fillRect(cx - hw * .3, ey - s * .02, hw * .6, s * .03); break; }
      case 29: { ctx.shadowColor = '#7dd3fc'; ctx.shadowBlur = s * .3; ctx.fillStyle = '#bae6fd'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .3, ht + s * .1); ctx.bezierCurveTo(cx + sx * hw * .9, ht - s * .05, cx + sx * hw * .95, ht - s * .5, cx + sx * hw * .7, ht - s * .75); ctx.bezierCurveTo(cx + sx * hw * .7, ht - s * .4, cx + sx * hw * .5, ht - s * .2, cx + sx * hw * .12, ht + s * .04); ctx.fill(); } ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { const k = .5 + .5 * Math.sin(t * 4 + i * 2); star(ctx, cx + Math.sin(i * 2.4) * hw * .7, ht - s * (.2 + i * .15), s * .05 * k + s * .01, 4); } break; }
      case 30: { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(cx - face * s * .05, ht - s * .3); ctx.quadraticCurveTo(cx - face * s * .6, ht - s * 1.0, cx - face * s * .9, ht - s * .2 + Math.sin(t * 3) * s * .05); ctx.quadraticCurveTo(cx - face * s * .5, ht - s * .6, cx + face * s * .08, ht - s * .25); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx, ht + s * .1, hw * .56, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - hw * .2, ht - s * .3); ctx.lineTo(cx, ht - s * .5); ctx.lineTo(cx + hw * .2, ht - s * .3); ctx.fill(); ctx.fillStyle = '#b45309'; ctx.fillRect(cx - hw * .56, ht + s * .05, hw * 1.12, s * .07); ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = s * .2; ctx.beginPath(); ctx.arc(cx, ht - s * .14, s * .07, 0, 7); ctx.fill(); ctx.shadowBlur = 0; break; }
      case 31: case 32: { const angel = L.hat === 32, big = angel ? 1.35 : 1; for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { ctx.save(); ctx.translate(cx + sx * hw * .48, ht + s * .12); ctx.rotate(sx * (angel ? .15 + k * .2 : .55 + k * .2) + Math.sin(t * 2) * .03 * sx); ctx.fillStyle = angel ? (k % 2 ? '#f8fafc' : '#e2e8f0') : (k % 2 ? '#e0f2fe' : '#bae6fd'); ctx.beginPath(); ctx.ellipse(0, -s * (.42 - k * .03) * big, s * .09, s * (.46 - k * .05) * big, 0, 0, 7); ctx.fill(); if (angel) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(1, s * .02); ctx.stroke(); } ctx.restore(); }
        ctx.fillStyle = angel ? '#facc15' : L.hatColor; ctx.beginPath(); ctx.arc(cx, ht + s * .14, hw * .57, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - hw * .57, ht + s * .12, s * .13, hh * .5); ctx.fillRect(cx + hw * .57 - s * .13, ht + s * .12, s * .13, hh * .5);
        ctx.fillStyle = angel ? '#fde68a' : '#facc15'; ctx.fillRect(cx - hw * .57, ht + s * .08, hw * 1.14, s * .07); ctx.beginPath(); ctx.moveTo(cx - s * .06 + face * s * .04, ht - s * .3); ctx.lineTo(cx + face * s * .04, ht - s * .45); ctx.lineTo(cx + s * .06 + face * s * .04, ht - s * .3); ctx.lineTo(cx + s * .04 + face * s * .04, ht + s * .1); ctx.lineTo(cx - s * .04 + face * s * .04, ht + s * .1); ctx.fill();
        if (!angel) { ctx.fillStyle = '#60a5fa'; ctx.shadowColor = '#60a5fa'; ctx.shadowBlur = s * .25; ctx.beginPath(); ctx.arc(cx + face * s * .04, ht - s * .05, s * .05, 0, 7); ctx.fill(); ctx.shadowBlur = 0; } break; }
      case 33: { ctx.fillStyle = '#f5f5f4'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .4, ht + s * .02); ctx.quadraticCurveTo(cx + sx * hw * 1.0, ht - s * .05, cx + sx * hw * .95, ht - s * .6); ctx.quadraticCurveTo(cx + sx * hw * .75, ht - s * .2, cx + sx * hw * .3, ht - s * .14); ctx.fill(); } ctx.fillStyle = shade(L.hatColor, -.25); for (let i = 0; i < 4; i++) { const sx = cx - hw * .3 + i * hw * .2; ctx.beginPath(); ctx.moveTo(sx - s * .07, ht - s * .2); ctx.lineTo(sx, ht - s * .42 - (i % 3 ? s * .06 : 0)); ctx.lineTo(sx + s * .07, ht - s * .2); ctx.fill(); }
        ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(cx, ht + s * .12, hw * .58, Math.PI, 0); ctx.fill(); ctx.fillStyle = shade(L.hatColor, -.2); for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - hw * .4 + i * hw * .16, ht - s * .02 + (i % 2) * s * .07, s * .05, 0, Math.PI); ctx.fill(); } ctx.fillStyle = '#facc15'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = s * .2; ctx.beginPath(); ctx.ellipse(cx + face * s * .04, ht - s * .14, s * .07, s * .04, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0; break; }
      case 34: { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(cx, ht - s * .1); ctx.quadraticCurveTo(cx - face * s * .2, ht - s * .85, cx - face * s * .75, ht - s * .55 + Math.sin(t * 3) * s * .04); ctx.quadraticCurveTo(cx - face * s * .3, ht - s * .45, cx + face * s * .1, ht - s * .08); ctx.fill(); ctx.fillStyle = '#9ca3af'; rr(ctx, cx - hw * .58, ht - s * .14, hw * 1.16, hh * 1.02, s * .3); ctx.fill(); ctx.fillStyle = '#6b7280'; ctx.fillRect(cx - hw * .58, ey - s * .14, hw * 1.16, s * .05); ctx.fillStyle = '#111827'; for (const dy of [-.04, .06]) rr(ctx, cx - hw * .4 + face * s * .04, ey + dy * s, hw * .8, s * .045, s * .02), ctx.fill(); ctx.fillStyle = '#4b5563'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx - hw * .2 + i * hw * .13 + face * s * .04, cy + hh * .28, s * .025, 0, 7); ctx.fill(); } break; }
      case 35: { ctx.fillStyle = '#1f2937'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .55, ht + s * .15); ctx.lineTo(cx + sx * hw * .85, ht + s * .45); ctx.lineTo(cx + sx * hw * .6, ht + s * .55); ctx.lineTo(cx + sx * hw * .45, ht + s * .2); ctx.fill(); } ctx.beginPath(); ctx.arc(cx, ht + s * .14, hw * .58, Math.PI, 0); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.fillRect(cx - hw * .58, ht + s * .08, hw * 1.16, s * .07); ctx.strokeStyle = '#facc15'; ctx.lineWidth = s * .07; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + face * s * .04, ht - s * .02); ctx.quadraticCurveTo(cx + sx * hw * .2, ht - s * .3, cx + sx * hw * .45, ht - s * .62); ctx.stroke(); } ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(cx + face * s * .04, ht - s * .02, s * .07, 0, 7); ctx.fill(); break; }
      case 36: { ctx.fillStyle = '#ea580c'; for (const dx of [-.3, .3, 0]) { ctx.beginPath(); ctx.ellipse(cx + dx * hw, cy - s * .05, hw * (dx ? .38 : .42), hh * .62, 0, 0, 7); ctx.fill(); } ctx.strokeStyle = '#c2410c'; ctx.lineWidth = Math.max(1, s * .03); for (const dx of [-.18, .18]) { ctx.beginPath(); ctx.ellipse(cx + dx * hw, cy - s * .05, hw * .2, hh * .6, 0, 0, 7); ctx.stroke(); } ctx.fillStyle = '#16a34a'; ctx.fillRect(cx - s * .05, cy - hh * .75, s * .1, s * .18);
        const gl = .7 + .3 * Math.sin(t * 7); ctx.fillStyle = `rgba(253,224,71,${gl})`; ctx.shadowColor = '#facc15'; ctx.shadowBlur = s * .25; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .3 + face * s * .04, ey - s * .1); ctx.lineTo(cx + sx * hw * .14 + face * s * .04, ey + s * .06); ctx.lineTo(cx + sx * hw * .44 + face * s * .04, ey + s * .06); ctx.fill(); } ctx.beginPath(); ctx.moveTo(cx - hw * .32, cy + hh * .15); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - hw * .32 + i * hw * .107, cy + hh * (.15 + (i % 2 ? .1 : 0))); ctx.lineTo(cx + hw * .32, cy + hh * .3); ctx.quadraticCurveTo(cx, cy + hh * .5, cx - hw * .32, cy + hh * .3); ctx.fill(); ctx.shadowBlur = 0; break; }
      case 37: { ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(cx - hw * .4, ht + s * .1); ctx.quadraticCurveTo(cx, ht - s * .05, cx + hw * .4, ht + s * .1); ctx.lineTo(cx + hw * .3, ht + s * .02); ctx.lineTo(cx + hw * .12, ht - s * .08); ctx.lineTo(cx, ht - s * .26); ctx.lineTo(cx - hw * .12, ht - s * .08); ctx.lineTo(cx - hw * .3, ht + s * .02); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.shadowColor = L.hatColor; ctx.shadowBlur = s * .2; ctx.beginPath(); ctx.arc(cx, ht - s * .07, s * .055, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const k = .5 + .5 * Math.sin(t * 5 + i * 2); star(ctx, cx + (i - 1) * hw * .35, ht - s * (.2 + (i % 2) * .12), s * .05 * k + s * .01, 4); } break; }
      case 38: { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(cx - hw * .36, ht + s * .06); ctx.lineTo(cx - s * .06, ht - s * .8); ctx.lineTo(cx + s * .06, ht - s * .8); ctx.lineTo(cx + hw * .36, ht + s * .06); ctx.fill(); ctx.fillStyle = '#f8fafc'; for (const [y0, w] of [[-.25, .2], [-.52, .12]]) { ctx.beginPath(); ctx.moveTo(cx - hw * w - s * .03, ht + y0 * s + s * .08); ctx.lineTo(cx - hw * w * .7, ht + y0 * s - s * .02); ctx.lineTo(cx + hw * w * .7, ht + y0 * s - s * .02); ctx.lineTo(cx + hw * w + s * .03, ht + y0 * s + s * .08); ctx.fill(); } ctx.fillStyle = '#ea580c'; rr(ctx, cx - hw * .6, ht + s * .02, hw * 1.2, s * .1, s * .03); ctx.fill(); break; }
      case 39: { ctx.fillStyle = 'rgba(186,230,253,.22)'; ctx.strokeStyle = 'rgba(224,242,254,.9)'; ctx.lineWidth = Math.max(1, s * .04); ctx.beginPath(); ctx.arc(cx, cy - s * .05, hw * .86, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(cx - hw * .4, cy - hh * .45, s * .1, s * .2, .6, 0, 7); ctx.fill(); ctx.fillStyle = L.hatColor; rr(ctx, cx - hw * .7, cy + hh * .62, hw * 1.4, s * .14, s * .06); ctx.fill(); ctx.fillStyle = '#cbd5e1'; ctx.fillRect(cx - s * .02, cy - hh * .95 - s * .25, s * .04, s * .2); ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ef4444' : '#fca5a5'; ctx.beginPath(); ctx.arc(cx, cy - hh * .95 - s * .27, s * .05, 0, 7); ctx.fill(); break; }
      case 40: { ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.moveTo(cx - face * hw * .45, ht + s * .2); ctx.quadraticCurveTo(cx - face * hw * 1.1, ht + s * .3 + Math.sin(t * 5) * s * .08, cx - face * hw * 1.3, ht + s * .55); ctx.lineTo(cx - face * hw * 1.1, ht + s * .6); ctx.quadraticCurveTo(cx - face * hw * .9, ht + s * .4, cx - face * hw * .45, ht + s * .35); ctx.fill(); rr(ctx, cx - hw * .55, ht - s * .1, hw * 1.1, hh * .45, s * .25); ctx.fill(); rr(ctx, cx - hw * .55, ey + s * .1, hw * 1.1, hh * .55, s * .2); ctx.fill(); ctx.fillStyle = shade(L.hatColor, -.25); ctx.fillRect(cx - hw * .55, ey - s * .17, hw * 1.1, s * .05); break; }
      case 41: { ctx.fillStyle = '#78350f'; ctx.fillRect(cx - hw * .38, ht - s * .55, hw * .76, s * .58); ctx.fillRect(cx - hw * .62, ht - s * .02, hw * 1.24, s * .09); ctx.fillStyle = '#d97706'; ctx.fillRect(cx - hw * .38, ht - s * .16, hw * .76, s * .08); const gear = (gx, gy, r, a) => { ctx.fillStyle = '#facc15'; ctx.beginPath(); for (let i = 0; i < 16; i++) { const q = i % 2 ? r * .72 : r, an = a + i * Math.PI / 8; ctx.lineTo(gx + Math.cos(an) * q, gy + Math.sin(an) * q); } ctx.fill(); ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(gx, gy, r * .35, 0, 7); ctx.fill(); }; gear(cx + face * hw * .2, ht - s * .35, s * .14, t); gear(cx - face * hw * .05, ht - s * .22, s * .09, -t * 1.5);
        ctx.fillStyle = '#a16207'; ctx.fillRect(cx - hw * .5, ht + s * .08, hw, s * .06); for (const sx of [-1, 1]) { ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.arc(cx + sx * hw * .2, ht + s * .11, s * .1, 0, 7); ctx.fill(); ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(cx + sx * hw * .2, ht + s * .11, s * .065, 0, 7); ctx.fill(); } break; }
      case 42: { ctx.fillStyle = '#111827'; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = s * .3; ctx.beginPath(); ctx.moveTo(cx - hw * .48, ht + s * .08); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - hw * .48 + i * hw * .16, ht - (i % 2 ? s * .12 : s * (.45 + (i === 3 ? .15 : 0)))); ctx.lineTo(cx + hw * .48, ht + s * .08); ctx.fill(); ctx.shadowBlur = 0; const gc = L.hatColor === '#ef4444' ? '#a855f7' : L.hatColor; ctx.fillStyle = gc; ctx.shadowColor = gc; ctx.shadowBlur = s * .3; for (const dx of [-.32, 0, .32]) { ctx.beginPath(); ctx.arc(cx + dx * hw, ht - s * .02, s * .05, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; break; }
      case 43: { ctx.beginPath(); ctx.ellipse(cx, ht + s * .05, hw * .9, s * .12, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx - hw * .4, ht + s * .05); ctx.lineTo(cx - hw * .1, ht - s * .6); ctx.quadraticCurveTo(cx - face * s * .1, ht - s * 1.05, cx - face * s * .6, ht - s * .85); ctx.quadraticCurveTo(cx + face * s * .05, ht - s * .7, cx + hw * .15, ht - s * .55); ctx.lineTo(cx + hw * .4, ht + s * .05); ctx.fill(); ctx.fillStyle = '#111827'; ctx.fillRect(cx - hw * .4, ht - s * .1, hw * .8, s * .1); ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(1, s * .03); ctx.strokeRect(cx - s * .07, ht - s * .11, s * .14, s * .12); break; }
      case 44: { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sx * hw * .45, ht + s * .05); ctx.lineTo(cx + sx * hw * .82, cy + hh * .7); ctx.lineTo(cx + sx * hw * .55, cy + hh * .7); ctx.lineTo(cx + sx * hw * .45, cy - hh * .1); ctx.closePath(); ctx.fillStyle = L.hatColor; ctx.fill(); ctx.save(); ctx.clip(); ctx.fillStyle = '#facc15'; for (let i = 0; i < 8; i++) ctx.fillRect(cx - hw, ht + i * s * .14, hw * 2, s * .06); ctx.restore(); } ctx.fillStyle = L.hatColor; ctx.beginPath(); ctx.arc(cx, ht + s * .14, hw * .58, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#facc15'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - hw * .58, ht - s * .18 + i * s * .09, hw * 1.16, s * .04); ctx.fillRect(cx - hw * .58, ht + s * .1, hw * 1.16, s * .07); ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.ellipse(cx + face * s * .04, ht - s * .05, s * .04, s * .09, 0, 0, 7); ctx.fill(); break; }
      case 8: ctx.strokeStyle = L.hatColor; ctx.lineWidth = s * .08; ctx.beginPath(); ctx.arc(cx, cy - s * .05, hw * .56, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); rr(ctx, cx - hw * .64, cy - s * .12, s * .16, s * .3, s * .06); ctx.fill(); rr(ctx, cx + hw * .64 - s * .16, cy - s * .12, s * .16, s * .3, s * .06); ctx.fill(); break;
    }
    // your own designs
    const cf = custom(L, 'face'); if (cf) drawItem(ctx, cf, cx - hw * .55, cy - hw * .58, hw * 1.1, face < 0);
    const chat = custom(L, 'hat'); if (chat) drawItem(ctx, chat, cx - hw * .7, top + s * .28 - hw * 1.4, hw * 1.4, face < 0);
  }
  const hexA = (hex, a) => { const n = parseInt((hex || '#ffffff').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  /** a held item; origin = the hand, upright, f = facing */
  function drawHeld(ctx, L, s, f, t) {
    const c = L.heldColor; ctx.save(); ctx.scale(f, 1); ctx.lineCap = 'round';
    const ci = custom(L, 'held');
    if (ci) { const w = s * 1.5; drawItem(ctx, ci, -w / 2, -w * .8, w); ctx.restore(); return; }
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, w * s, h * s); };
    switch (L.held) {
      case 1: ctx.rotate(.35); R(-.04, -.05, .08, .24, '#78350f'); ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(-.07 * s, -.1 * s); ctx.lineTo(-.07 * s, -1.2 * s); ctx.lineTo(0, -1.34 * s); ctx.lineTo(.07 * s, -1.2 * s); ctx.lineTo(.07 * s, -.1 * s); ctx.fill(); R(-.01, -1.15, .025, 1, '#ffffff'); R(-.2, -.13, .4, .08, c); break;
      case 2: ctx.rotate(.4); R(-.03, -.75, .06, .85, '#3f2a1d'); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = s * .4; star(ctx, 0, -.86 * s, .2 * s); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; star(ctx, Math.cos(a) * .35 * s, -.86 * s + Math.sin(a) * .3 * s, .05 * s * (1 + Math.sin(t * 6 + i))); } break;
      case 3: ctx.fillStyle = shade(c, -.25); ctx.beginPath(); ctx.arc(.12 * s, -.05 * s, .4 * s, 0, 7); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(.12 * s, -.05 * s, .32 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#f8fafc'; star(ctx, .12 * s, -.05 * s, .16 * s); break;
      case 4: { const bx = (.3 + Math.sin(t * 2) * .05) * s, by = -1.85 * s; ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = Math.max(1, s * .02); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(.3 * s, -.8 * s, bx, by + .36 * s); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(bx, by, .3 * s, .36 * s, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(bx - .1 * s, by - .12 * s, .06 * s, .1 * s, -.4, 0, 7); ctx.fill(); break; }
      case 5: ctx.rotate(-.9); R(-.05, -1, .1, .85, '#78350f'); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, .12 * s, .3 * s, 0, 7); ctx.arc(0, -.2 * s, .23 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(0, -.05 * s, .08 * s, 0, 7); ctx.fill(); R(-.08, -1.1, .16, .14, '#3f2a1d'); break;
      case 6: ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.moveTo(-.14 * s, -.2 * s); ctx.lineTo(.14 * s, -.2 * s); ctx.lineTo(0, .18 * s); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -.32 * s, .18 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(.03 * s, -.52 * s, .05 * s, 0, 7); ctx.fill(); break;
      case 7: R(-.025, -1.45, .05, 1.6, '#9ca3af'); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(.02 * s, -1.42 * s); for (let i = 0; i <= 6; i++) ctx.lineTo((.02 + i * .1) * s, (-1.42 + Math.sin(t * 6 + i) * .04) * s); for (let i = 6; i >= 0; i--) ctx.lineTo((.02 + i * .1) * s, (-1.02 + Math.sin(t * 6 + i) * .04) * s); ctx.fill(); break;
      case 8: R(-.05, -.6, .1, .75, '#78350f'); for (const [k, col] of [[1, '#f97316'], [.6, '#facc15']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, (-.78 - .05 * k) * s, (.14 + Math.sin(t * 20) * .02) * k * s, (.26 + Math.cos(t * 17) * .04) * k * s, 0, 0, 7); ctx.fill(); } break;
      case 9: ctx.fillStyle = '#111827'; rr(ctx, -.11 * s, -.34 * s, .22 * s, .38 * s, .04 * s); ctx.fill(); ctx.fillStyle = c; rr(ctx, -.08 * s, -.3 * s, .16 * s, .3 * s, .02 * s); ctx.fill(); break;
      case 10: R(-.02, -1.7, .04, 1.75, '#334155'); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -1.65 * s, .75 * s, Math.PI, 0); ctx.fill(); ctx.fillStyle = shade(c, -.2); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-.56 * s + i * .375 * s, -1.65 * s, .19 * s, 0, Math.PI); ctx.fill(); } ctx.strokeStyle = '#334155'; ctx.lineWidth = Math.max(1, s * .04); ctx.beginPath(); ctx.arc(-.08 * s, .05 * s, .08 * s, 0, Math.PI); ctx.stroke(); break;
      case 11: ctx.rotate(.3); R(-.04, -.8, .08, .95, '#92400e'); ctx.fillStyle = c; rr(ctx, -.26 * s, -1.02 * s, .52 * s, .26 * s, .05 * s); ctx.fill(); break;
      case 12: ctx.strokeStyle = c; ctx.lineWidth = s * .07; ctx.beginPath(); ctx.arc(-.35 * s, -.1 * s, .6 * s, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = Math.max(1, s * .015); ctx.beginPath(); ctx.moveTo(-.35 * s + Math.cos(-1.1) * .6 * s, -.1 * s + Math.sin(-1.1) * .6 * s); ctx.lineTo(-.35 * s + Math.cos(1.1) * .6 * s, -.1 * s + Math.sin(1.1) * .6 * s); ctx.stroke(); break;
      case 13: R(-.02, -.7, .04, .75, '#f8fafc'); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -.86 * s, .23 * s, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, s * .035); ctx.beginPath(); for (let a = 0; a < 12; a += .3) ctx.lineTo(Math.cos(a) * a * .016 * s, -.86 * s + Math.sin(a) * a * .016 * s); ctx.stroke(); break;
      case 14: ctx.strokeStyle = '#78350f'; ctx.lineWidth = s * .05; ctx.beginPath(); ctx.moveTo(0, .1 * s); ctx.lineTo(1 * s, -1.4 * s); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1 * s, -1.4 * s); ctx.lineTo(1.05 * s, (-.25 + Math.sin(t * 2) * .05) * s); ctx.stroke(); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(1.05 * s, (-.2 + Math.sin(t * 2) * .05) * s, .07 * s, 0, 7); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(1.05 * s, (-.14 + Math.sin(t * 2) * .05) * s, .07 * s, 0, Math.PI); ctx.fill(); break;
    }
    ctx.restore();
  }
  /** a pet standing at (x, ground y), facing f */
  function drawPet(ctx, L, x, y, s, f, t) {
    const c = L.petColor, u = s * .42, dk = shade(c, -.25); ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    const eye = (ex, ey, r = u * .08) => { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + r * .3, ey - r * .3, r * .35, 0, 7); ctx.fill(); };
    const ell = (ex, ey, rx, ry, col, rot = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, 7); ctx.fill(); };
    const fly = [3, 5, 6, 7].includes(L.pet), lift = fly ? s * 1.7 + Math.sin(t * 3) * u * .25 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, u * .8 * (fly ? .6 : 1), u * .15, 0, 0, 7); ctx.fill();
    const ci = custom(L, 'pet');
    if (ci) { const hop = Math.abs(Math.sin(t * 3)) * u * .3, w = u * 2.6; drawItem(ctx, ci, -w / 2, -w - hop, w); ctx.restore(); return; }
    ctx.translate(0, -lift);
    switch (L.pet) {
      case 1: case 2: { const dog = L.pet === 2; ctx.strokeStyle = c; ctx.lineWidth = u * .18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-u * .6, -u * .6); ctx.quadraticCurveTo(-u * 1.1, -u * (dog ? .9 : 1.3) + Math.sin(t * (dog ? 14 : 3)) * u * .2, -u * (dog ? .9 : .8), -u * (dog ? 1.1 : 1.5)); ctx.stroke(); ell(0, -u * .55, u * .7, u * .42, c); ell(-u * .4, -u * .12, u * .12, u * .14, dk); ell(u * .4, -u * .12, u * .12, u * .14, dk); ell(u * .6, -u * 1.05, u * .42, u * .4, c);
        if (dog) { ell(u * .35, -u * 1.05, u * .14, u * .3, dk, .3); ell(u * .9, -u * .95, u * .2, u * .14, shade(c, .3)); ell(u * 1.05, -u * 1.0, u * .07, u * .06, '#111'); }
        else { ctx.fillStyle = c; for (const ex of [.35, .8]) { ctx.beginPath(); ctx.moveTo(u * (ex - .14), -u * 1.3); ctx.lineTo(u * ex, -u * 1.65); ctx.lineTo(u * (ex + .14), -u * 1.3); ctx.fill(); } ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.arc(u * .9, -u * .98, u * .05, 0, 7); ctx.fill(); }
        eye(u * .72, -u * 1.12); break; }
      case 3: { ell(0, -u * .5, u * .45, u * .4, c); ctx.save(); ctx.translate(-u * .1, -u * .55); ctx.scale(1, Math.sin(t * 14)); ell(-u * .1, -u * .25, u * .32, u * .22, dk); ctx.restore(); ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(u * .4, -u * .6); ctx.lineTo(u * .7, -u * .5); ctx.lineTo(u * .4, -u * .42); ctx.fill(); eye(u * .2, -u * .65); break; }
      case 4: { const k = 1 + Math.sin(t * 4) * .1; ctx.globalAlpha = .9; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -u * .02, u * .75 / k, u * .75 * k, 0, Math.PI, 0); ctx.fill(); ctx.globalAlpha = 1; ell(-u * .3, -u * .5 * k, u * .1, u * .16, 'rgba(255,255,255,.5)', .4); eye(u * .15, -u * .35 * k); eye(u * .45, -u * .35 * k); break; }
      case 5: { ctx.fillStyle = c; rr(ctx, -u * .45, -u * .8, u * .9, u * .7, u * .12); ctx.fill(); rr(ctx, -u * .35, -u * 1.45, u * .7, u * .55, u * .12); ctx.fill(); ctx.fillStyle = '#334155'; ctx.fillRect(-u * .03, -u * 1.7, u * .06, u * .25); ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ef4444' : '#fca5a5'; ctx.beginPath(); ctx.arc(0, -u * 1.72, u * .08, 0, 7); ctx.fill(); ctx.fillStyle = '#22d3ee'; ctx.fillRect(-u * .2, -u * 1.25, u * .14, u * .1); ctx.fillRect(u * .1, -u * 1.25, u * .14, u * .1); ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(-u * .25, -u * .1); ctx.lineTo(0, u * (.3 + Math.random() * .15)); ctx.lineTo(u * .25, -u * .1); ctx.fill(); break; }
      case 6: { ctx.globalAlpha = .85; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -u * .9, u * .55, Math.PI, 0); ctx.lineTo(u * .55, -u * .1); for (let i = 0; i <= 4; i++) ctx.lineTo(u * .55 - i * u * .275, -u * (.1 + (i % 2) * .2) + Math.sin(t * 5 + i) * u * .05); ctx.fill(); ctx.globalAlpha = 1; eye(-u * .15, -u * .9, u * .1); eye(u * .2, -u * .9, u * .1); break; }
      case 7: { ctx.save(); ctx.translate(-u * .1, -u * .7); ctx.scale(1, .4 + Math.abs(Math.sin(t * 8)) * .6); ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-u * .5, -u * .8); ctx.lineTo(u * .3, -u * .2); ctx.fill(); ctx.restore(); ctx.strokeStyle = c; ctx.lineWidth = u * .16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-u * .4, -u * .5); ctx.quadraticCurveTo(-u * .9, -u * .3, -u * 1.0, -u * .7); ctx.stroke(); ell(0, -u * .5, u * .5, u * .32, c); ell(u * .55, -u * .85, u * .3, u * .25, c); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(u * .4, -u * 1.05); ctx.lineTo(u * .35, -u * 1.3); ctx.lineTo(u * .52, -u * 1.08); ctx.fill(); eye(u * .65, -u * .9); break; }
      case 8: { const hop = Math.abs(Math.sin(t * 4)) * u * .4; ctx.translate(0, -hop); ell(-u * .65, -u * .55, u * .16, u * .16, '#fff'); ell(0, -u * .5, u * .6, u * .45, c); ell(u * .5, -u * 1.0, u * .36, u * .34, c); for (const ex of [.35, .6]) { ell(u * ex, -u * 1.6, u * .1, u * .35, c, ex - .5); ell(u * ex, -u * 1.58, u * .05, u * .25, '#f9a8d4', ex - .5); } eye(u * .62, -u * 1.05); break; }
    }
    ctx.restore();
  }
  /** aura: a soft glow behind (front = false) and particles in front */
  function drawAura(ctx, L, x, top, bottom, s, t, front) {
    const c = L.auraColor, H = bottom - top, cy = top + H * .55;
    if (!front) { const g = ctx.createRadialGradient(x, cy, s * .2, x, cy, H * .62); g.addColorStop(0, hexA(c, .38)); g.addColorStop(1, hexA(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - H * .65, cy - H * .65, H * 1.3, H * 1.3); return; }
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const r1 = Math.sin(i * 12.9898) * 43758.5453 % 1, r2 = Math.abs(Math.sin(i * 78.233) * 12543.123 % 1), ph = (t * (.3 + r2 * .25) + i / 12) % 1;
      const px = x + r1 * s * 1.5;
      ctx.globalAlpha = 1; ctx.fillStyle = c; ctx.strokeStyle = c;
      switch (L.aura) {
        case 1: { const a = .5 + .5 * Math.sin(t * 5 + i * 2); ctx.globalAlpha = a; star(ctx, px, top + r2 * H, s * .1 * (.4 + a), 4); break; }
        case 2: { const py = bottom - ph * H * .85, k = 1 - ph; ctx.globalAlpha = k; ctx.fillStyle = ph < .3 ? '#fde047' : ph < .6 ? '#f97316' : c; ctx.beginPath(); ctx.ellipse(px * .7 + x * .3, py, s * .14 * k, s * .22 * k, 0, 0, 7); ctx.fill(); break; }
        case 3: ctx.globalAlpha = 1 - ph; heart(ctx, px, bottom - ph * H * 1.05, s * .11); break;
        case 4: ctx.fillStyle = '#fff'; ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(px + Math.sin(t * 2 + i) * s * .15, top - s * .3 + ph * (H + s * .3), s * .05, 0, 7); ctx.fill(); break;
        case 5: ctx.globalAlpha = (1 - ph) * .9; ctx.lineWidth = Math.max(1, s * .025); ctx.beginPath(); ctx.arc(px + Math.sin(t * 3 + i) * s * .1, bottom - ph * H * 1.05, s * (.05 + r2 * .07), 0, 7); ctx.stroke(); break;
        case 6: if (i < 4 && Math.sin(t * 23 + i * 7) > .55) { ctx.lineWidth = Math.max(1, s * .05); ctx.shadowColor = c; ctx.shadowBlur = s * .3; ctx.beginPath(); let lx = px, ly = top + r2 * H * .5; ctx.moveTo(lx, ly); for (let k = 0; k < 4; k++) { lx += (k % 2 ? -1 : 1) * s * .15; ly += s * .2; ctx.lineTo(lx, ly); } ctx.stroke(); ctx.shadowBlur = 0; } break;
        case 7: if (i < 6) { ctx.globalAlpha = 1 - ph; ctx.font = `700 ${s * .32}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(i % 2 ? '♪' : '♫', px + Math.sin(t * 2 + i) * s * .2, bottom - s * .5 - ph * H); } break;
      }
    }
    ctx.restore();
  }
  /** full figure. pose: 'idle' | 'walk' | 'jump' | 'wave'; t = animation time; face = 1 right / -1 left */
  function draw(ctx, look, x, y, h, o = {}) {
    let L = norm(look); const s = h / 3.1, t = o.t || 0, face = o.face || 1, pose = o.pose || 'idle';
    const cShirt = cloth(L, 'shirt'), cPants = cloth(L, 'pants');
    if (cShirt) L = { ...L, shirtStyle: 99 };
    const bw = [0.72, 0.85, 1.0][L.body] * s, legH = s * .95, torH = s * 1.05, sw = pose === 'walk' ? Math.sin(t * 9) : 0, bob = pose === 'walk' ? Math.abs(Math.sin(t * 9)) * s * .05 : pose === 'idle' ? Math.sin(t * 2) * s * .02 : 0;
    ctx.save(); ctx.lineJoin = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, bw * .7, s * .12, 0, 0, 7); ctx.fill();
    const hipY = y - legH - bob, shY = hipY - torH;
    // cape / backpack behind
    if (L.acc === 6) { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(x - bw * .5, shY + s * .08); ctx.lineTo(x + bw * .5, shY + s * .08); ctx.lineTo(x + bw * .7 - face * sw * s * .1, hipY + legH * .7); ctx.lineTo(x - bw * .7 - face * sw * s * .1, hipY + legH * .7); ctx.fill(); }
    if (L.aura) drawAura(ctx, L, x, shY - s * 1.5, y, s, t, false);
    if (L.acc === 7) { const fl = Math.sin(t * 6) * .1; for (const sx of [-1, 1]) { ctx.save(); ctx.translate(x + sx * bw * .25, shY + s * .35); ctx.rotate(sx * fl); [[1.35, .62, .7], [.95, .85, .85], [.55, 1.05, 1]].forEach(([a, len, k]) => { const dx = sx * Math.sin(a), dy = -Math.cos(a); ctx.fillStyle = shade(L.accColor, k < 1 ? -.12 * (1 - k) * 4 : 0); ctx.beginPath(); ctx.ellipse(dx * len * s * .5, dy * len * s * .5, s * .17, len * s * .55, Math.atan2(dy, dx) + Math.PI / 2, 0, 7); ctx.fill(); }); ctx.restore(); } }
    if (L.acc === 13) { for (const sx of [-.28, .28]) { ctx.fillStyle = '#9ca3af'; rr(ctx, x - face * bw * .55 + sx * s - s * .14, shY + s * .05, s * .28, torH * .75, s * .1); ctx.fill(); ctx.fillStyle = L.accColor; ctx.fillRect(x - face * bw * .55 + sx * s - s * .14, shY + torH * .25, s * .28, s * .1); if (pose === 'jump') { ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.moveTo(x - face * bw * .55 + sx * s - s * .1, shY + torH * .8); ctx.lineTo(x - face * bw * .55 + sx * s, shY + torH * (1.3 + Math.random() * .3)); ctx.lineTo(x - face * bw * .55 + sx * s + s * .1, shY + torH * .8); ctx.fill(); } } }
    if (L.acc === 14) { ctx.strokeStyle = L.accColor; ctx.lineWidth = s * .14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - face * bw * .3, hipY - s * .1); ctx.quadraticCurveTo(x - face * bw * 1.2, hipY + Math.sin(t * 4) * s * .2, x - face * bw * 1.1, hipY - s * .7); ctx.stroke(); }
    { const cb = custom(L, 'back'); if (cb) drawItem(ctx, cb, x - s * 1.25, shY - s * .8, s * 2.5, face < 0); }
    if (L.acc === 5) { ctx.fillStyle = L.accColor; rr(ctx, x - face * bw * .75 - bw * .25, shY + s * .15, bw * .5, torH * .7, s * .1); ctx.fill(); }
    // legs
    const leg = (dx, a) => { ctx.save(); ctx.translate(x + dx, hipY); ctx.rotate(a); ctx.fillStyle = L.pants; rr(ctx, -bw * .2, 0, bw * .4, legH * .86, s * .1); ctx.fill(); if (cPants) { ctx.save(); ctx.clip(); ctx.imageSmoothingEnabled = false; const cc = clothCanvas(cPants), hw2 = cc.width / 2; ctx.drawImage(cc, dx < 0 ? 0 : hw2, 0, hw2, cc.height, -bw * .2, 0, bw * .4, legH * .86); ctx.restore(); } ctx.fillStyle = L.shoes; rr(ctx, -bw * .22 + face * s * .04, legH * .78, bw * .44 + s * .06, legH * .2, s * .08); ctx.fill(); ctx.restore(); };
    const la = pose === 'jump' ? .35 : sw * .5;
    leg(-bw * .23, la); leg(bw * .23, pose === 'jump' ? -.2 : -la);
    // arms (back one first)
    const armCol = [0, 4, 9, 12].includes(L.shirtStyle) ? L.skin : L.shirtStyle === 13 ? '#f1f5f9' : L.shirt, holding = !o.noHeld && (L.held || custom(L, 'held'));
    const arm = (dx, a, front) => { ctx.save(); ctx.translate(x + dx, shY + s * .12); ctx.rotate(a); ctx.fillStyle = armCol; if (!front) ctx.globalAlpha = .92; rr(ctx, -s * .14, 0, s * .28, torH * .82, s * .12); ctx.fill(); if (L.shirtStyle === 0 || L.shirtStyle === 12) { ctx.fillStyle = L.shirtStyle === 12 ? L.shirt2 : L.shirt; rr(ctx, -s * .15, 0, s * .3, torH * .3, s * .1); ctx.fill(); } ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, torH * .84, s * .14, 0, 7); ctx.fill(); if (front && holding) { ctx.translate(0, torH * .84); ctx.rotate(-a); drawHeld(ctx, L, s, face, t); } ctx.restore(); };
    const aa = pose === 'jump' ? -2.4 : pose === 'wave' ? -2.6 + Math.sin(t * 8) * .35 : holding ? -face * .5 - sw * .2 : -sw * .55;
    arm(-bw * .58, pose === 'jump' ? 2.4 : sw * .55, false);
    // torso
    ctx.fillStyle = L.shirt; rr(ctx, x - bw * .5, shY, bw, torH, s * .2); ctx.fill();
    if (cShirt) { ctx.save(); ctx.clip(); ctx.imageSmoothingEnabled = false; ctx.drawImage(clothCanvas(cShirt), x - bw * .5, shY, bw, torH); ctx.restore(); }
    if (L.shirtStyle === 3) { ctx.fillStyle = L.shirt2; for (let i = 1; i < 4; i++) ctx.fillRect(x - bw * .5, shY + torH * i / 4.2, bw, torH * .08); }
    if (L.shirtStyle === 1) { ctx.fillStyle = shade(L.shirt, -.15); rr(ctx, x - bw * .3, shY + torH * .55, bw * .6, torH * .28, s * .08); ctx.fill(); ctx.strokeStyle = L.shirt2; ctx.lineWidth = s * .04; ctx.beginPath(); ctx.moveTo(x - s * .1, shY + s * .05); ctx.lineTo(x - s * .12, shY + torH * .4); ctx.moveTo(x + s * .1, shY + s * .05); ctx.lineTo(x + s * .12, shY + torH * .4); ctx.stroke(); }
    if (L.shirtStyle === 2) { ctx.fillStyle = L.shirt2; ctx.fillRect(x - bw * .08, shY, bw * .16, torH); }
    if (L.shirtStyle === 4) { ctx.fillStyle = L.shirt2; rr(ctx, x - bw * .5, shY, bw * .3, torH, s * .15); ctx.fill(); rr(ctx, x + bw * .2, shY, bw * .3, torH, s * .15); ctx.fill(); }
    if (L.shirtStyle === 5) { ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, x - bw * .38, shY + torH * .1, bw * .76, torH * .5, s * .12); ctx.fill(); ctx.fillStyle = L.shirt2; ctx.beginPath(); ctx.arc(x, shY + torH * .35, s * .12, 0, 7); ctx.fill(); }
    switch (L.shirtStyle) {
      case 6: ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(x - bw * .22, shY); ctx.lineTo(x + bw * .22, shY); ctx.lineTo(x, shY + torH * .55); ctx.fill(); ctx.fillStyle = L.shirt2; ctx.beginPath(); ctx.moveTo(x - s * .05, shY + s * .05); ctx.lineTo(x + s * .05, shY + s * .05); ctx.lineTo(x + s * .06, shY + torH * .45); ctx.lineTo(x, shY + torH * .52); ctx.lineTo(x - s * .06, shY + torH * .45); ctx.fill(); ctx.fillStyle = shade(L.shirt, -.25); for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * bw * .22, shY); ctx.lineTo(x + sx * bw * .05, shY + torH * .55); ctx.lineTo(x + sx * bw * .3, shY + torH * .3); ctx.fill(); } break;
      case 7: ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.moveTo(x - bw * .45, hipY - torH * .2); ctx.lineTo(x + bw * .45, hipY - torH * .2); ctx.lineTo(x + bw * .78, hipY + legH * .55); ctx.lineTo(x - bw * .78, hipY + legH * .55); ctx.fill(); ctx.fillStyle = L.shirt2; ctx.fillRect(x - bw * .5, hipY - torH * .3, bw, torH * .1); ctx.fillRect(x - bw * .78, hipY + legH * .47, bw * 1.56, legH * .08); break;
      case 8: ctx.fillStyle = L.pants; rr(ctx, x - bw * .32, shY + torH * .32, bw * .64, torH * .68, s * .06); ctx.fill(); ctx.fillRect(x - bw * .5, shY + torH * .75, bw, torH * .25); ctx.fillRect(x - bw * .42, shY, s * .1, torH * .4); ctx.fillRect(x + bw * .42 - s * .1, shY, s * .1, torH * .4); ctx.fillStyle = '#facc15'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * bw * .24, shY + torH * .4, s * .045, 0, 7); ctx.fill(); } break;
      case 9: ctx.fillStyle = L.skin; for (const sx of [-1, 1]) { rr(ctx, sx < 0 ? x - bw * .5 : x + bw * .26, shY, bw * .24, torH * .32, s * .1); ctx.fill(); } ctx.beginPath(); ctx.arc(x, shY, bw * .16, 0, Math.PI); ctx.fill(); break;
      case 10: ctx.strokeStyle = L.shirt2; ctx.lineWidth = s * .1; ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(x - bw * .5 + i * bw / 6, shY + torH * (.35 + (i % 2) * .12)); ctx.stroke(); ctx.fillStyle = shade(L.shirt, -.2); ctx.fillRect(x - bw * .5, hipY - torH * .18, bw, torH * .1); break;
      case 11: ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.moveTo(x - bw * .5, shY + s * .2); ctx.lineTo(x + bw * .5, shY + s * .2); ctx.lineTo(x + bw * .72, y - s * .22); ctx.lineTo(x - bw * .72, y - s * .22); ctx.fill(); ctx.strokeStyle = L.shirt2; ctx.lineWidth = s * .12; ctx.beginPath(); ctx.moveTo(x - bw * .5, hipY - torH * .25); ctx.lineTo(x + bw * .5, hipY - torH * .1); ctx.stroke(); ctx.lineWidth = s * .05; ctx.beginPath(); ctx.moveTo(x - bw * .25, shY); ctx.lineTo(x + bw * .1, shY + torH * .5); ctx.stroke(); break;
      case 12: ctx.fillStyle = L.shirt2; ctx.font = `800 ${s * .55}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String((L.title || 'x').length % 9 + 1) + String((L.hairStyle + L.eyes) % 10), x, shY + torH * .5); ctx.fillRect(x - bw * .22, shY, bw * .44, s * .06); break;
      case 13: ctx.fillStyle = '#f1f5f9'; rr(ctx, x - bw * .5, shY, bw, torH * 1.25, s * .15); ctx.fill(); ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.moveTo(x - bw * .15, shY); ctx.lineTo(x + bw * .15, shY); ctx.lineTo(x + bw * .08, hipY); ctx.lineTo(x - bw * .08, hipY); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = Math.max(1, s * .03); ctx.strokeRect(x + bw * .2, shY + torH * .55, bw * .2, torH * .2); ctx.fillStyle = L.shirt2; ctx.fillRect(x - bw * .38, shY + torH * .28, s * .05, s * .2); break;
    }
    ctx.fillStyle = shade(L.pants, -.25); if (![7, 11, 13].includes(L.shirtStyle)) ctx.fillRect(x - bw * .5, hipY - torH * .1, bw, torH * .1);
    if (L.acc === 4) { ctx.fillStyle = L.accColor; rr(ctx, x - bw * .45, shY - s * .05, bw * .9, s * .26, s * .1); ctx.fill(); rr(ctx, x + face * bw * .1, shY + s * .1, s * .2, torH * .45, s * .06); ctx.fill(); }
    if (L.acc === 8) { ctx.fillStyle = L.accColor; const by = shY + s * .1; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x - s * .18, by - s * .1); ctx.lineTo(x - s * .18, by + s * .1); ctx.closePath(); ctx.moveTo(x, by); ctx.lineTo(x + s * .18, by - s * .1); ctx.lineTo(x + s * .18, by + s * .1); ctx.fill(); ctx.beginPath(); ctx.arc(x, by, s * .05, 0, 7); ctx.fill(); }
    if (L.acc === 9) { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(x - s * .06, shY + s * .03); ctx.lineTo(x + s * .06, shY + s * .03); ctx.lineTo(x + s * .09, shY + torH * .6); ctx.lineTo(x, shY + torH * .7); ctx.lineTo(x - s * .09, shY + torH * .6); ctx.fill(); }
    if (L.acc === 10) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = Math.max(1, s * .035); ctx.beginPath(); ctx.arc(x, shY - s * .05, bw * .32, Math.PI * .15, Math.PI * .85); ctx.stroke(); ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(x, shY + bw * .26); ctx.lineTo(x + s * .08, shY + bw * .26 + s * .1); ctx.lineTo(x, shY + bw * .26 + s * .2); ctx.lineTo(x - s * .08, shY + bw * .26 + s * .1); ctx.fill(); }
    { const cb = custom(L, 'badge'); if (cb) drawItem(ctx, cb, x + face * bw * .08 - s * .26, shY + torH * .18, s * .52, face < 0); }
    arm(bw * .58, aa, true);
    head(ctx, L, x + face * s * .04, shY - s * .5 - bob * .3, s, face, t);
    if (L.aura) drawAura(ctx, L, x, shY - s * 1.5, y, s, t, true);
    if (!o.noPet && (L.pet || custom(L, 'pet'))) drawPet(ctx, L, x - face * (bw * .5 + s * .95), y, s, face, t);
    if (o.name) { ctx.font = `600 ${Math.max(10, s * .38)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.55)'; const w = ctx.measureText(o.name).width + s * .4; rr(ctx, x - w / 2, shY - s * 1.9, w, s * .55, s * .2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(o.name, x, shY - s * 1.5); }
    ctx.restore();
  }
  const faceCache = new Map();
  function face(look, px = 64) {
    const key = JSON.stringify(look) + px; if (faceCache.has(key)) return faceCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d');
    x.fillStyle = '#1e293b'; x.fillRect(0, 0, px, px);
    head(x, norm(look), px / 2, px * .56, px * .62, 1);
    const url = c.toDataURL(); faceCache.set(key, url); return url;
  }

  /* ---------- the editor ---------- */
  const ECSS = `.sjl{display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:14px;color:#e5e7eb;font:13px system-ui,sans-serif}
@media (max-width:560px){.sjl{grid-template-columns:1fr}}
.sjl canvas{width:100%;max-width:220px;aspect-ratio:3/4;border-radius:14px;background:radial-gradient(circle at 50% 30%,#334155,#0f172a);display:block;margin:0 auto}
.sjl-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.sjl button{font:inherit;border:none;cursor:pointer;color:inherit;background:none}
.sjl-tab{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.06)}.sjl-tab.on{background:#3b6cff;color:#fff}
.sjl-opts{display:flex;flex-wrap:wrap;gap:6px}
.sjl-opt{padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.07)}.sjl-opt.on{outline:2px solid #60a5fa;background:rgba(96,165,250,.2)}
.sjl-sw{width:28px;height:28px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.2)}.sjl-sw.on{outline:3px solid #fff;outline-offset:2px}
.sjl h4{margin:10px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.6}
.sjl-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.sjl-row input{flex:1;min-width:120px;font:inherit;color:inherit;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:7px 10px}
.sjl-act{padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.1)!important}
.sjl-it{display:flex;flex-direction:column;align-items:center;gap:3px;width:68px;padding:5px 3px;border-radius:10px;background:rgba(255,255,255,.07);font-size:11px;line-height:1.15}.sjl-it.on{outline:2px solid #60a5fa;background:rgba(96,165,250,.2)}
.sjl-it img,.sjl-it .none{width:44px;height:44px;image-rendering:pixelated;border-radius:6px;background:repeating-conic-gradient(#334155 0 25%,#1e293b 0 50%) 0 0/10px 10px}.sjl-it .none{display:grid;place-items:center;font-size:20px}
.sjl-it span{max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sjl-note{opacity:.65;font-size:12px;margin:8px 0}`;
  const GROUPS = [
    ['Face', [['skin', 'Skin'], ['eyes', 'Eyes'], ['eye', 'Eye colour'], ['brows', 'Eyebrows'], ['mouth', 'Mouth'], ['faceMark', 'Face extras'], ['markColor', 'Face paint colour']]],
    ['Hair', [['hairStyle', 'Style'], ['hair', 'Colour']]],
    ['Outfit', [['shirtStyle', 'Top'], ['shirt', 'Main colour'], ['shirt2', 'Second colour'], ['pants', 'Trousers'], ['shoes', 'Shoes'], ['body', 'Build']]],
    ['Extras', [['hat', 'Hat'], ['hatColor', 'Hat colour'], ['acc', 'Accessory'], ['accColor', 'Accessory colour']]],
    ['Fun', [['held', 'Holding'], ['heldColor', 'Item colour'], ['pet', 'Pet'], ['petColor', 'Pet colour'], ['aura', 'Aura'], ['auraColor', 'Aura colour']]],
    ['My items', []],
  ];
  /** items you can wear in a slot: your collection plus whatever you already wear there */
  function slotItems(L, slot) {
    const mine = Items.list().filter(it => it.s === slot), cur = custom(L, slot);
    if (cur && !mine.some(it => itemKey(it) === itemKey(cur))) mine.unshift({ ...cur, s: slot });
    return mine;
  }
  function editor(box, look, onChange, opts = {}) {
    if (!document.getElementById('sjl-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sjl-css', textContent: ECSS }));
    let L = norm(look), g = 0, t = 0, raf = 0;
    box.innerHTML = `<div class="sjl"><div><canvas width="330" height="440"></canvas><div class="sjl-row" style="justify-content:center"><button class="sjl-act" data-a="rand">🎲 Random</button><button class="sjl-act" data-a="pose">💃 Pose</button></div></div><div><div class="sjl-tabs"></div><div class="sjl-body"></div><div class="sjl-row"><input maxlength="24" placeholder="Title under your name (optional)" value=""></div></div></div>`;
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), tabs = box.querySelector('.sjl-tabs'), body = box.querySelector('.sjl-body'), title = box.querySelector('input');
    title.value = L.title || '';
    const poses = ['idle', 'walk', 'wave', 'jump']; let pi = 0;
    const paint = () => { if (!cv.isConnected) { cancelAnimationFrame(raf); return; } t += 1 / 60; ctx.clearRect(0, 0, cv.width, cv.height); draw(ctx, L, 165, 410, 340, { t, pose: poses[pi], name: L.title || '' }); raf = requestAnimationFrame(paint); };
    const render = () => {
      tabs.innerHTML = GROUPS.map(([n], i) => `<button class="sjl-tab${i === g ? ' on' : ''}" data-g="${i}">${n}</button>`).join('');
      if (GROUPS[g][0] === 'My items') {
        const any = Items.list().length || SLOT_IDS.some(sl => custom(L, sl));
        body.innerHTML = `<div class="sjl-note">Things you designed in the <b>Item Workshop</b>. Tap one to wear it — everyone sees it in online games.${opts.workshop ? '' : ' Open the Character Creator app to make new ones.'}</div>` + (opts.workshop ? `<button class="sjl-act" data-a="workshop">🎨 Open Item Workshop</button>` : '') + (any ? SLOTS.map(([sl, label, ic]) => { const list = slotItems(L, sl), cur = custom(L, sl); return `<h4>${ic} ${label}</h4><div class="sjl-opts"><button class="sjl-it${cur ? '' : ' on'}" data-slot="${sl}" data-i="-1"><div class="none">∅</div><span>None</span></button>${list.map((it, i) => `<button class="sjl-it${cur && itemKey(cur) === itemKey(it) ? ' on' : ''}" data-slot="${sl}" data-i="${i}" title="${esc(it.n)}"><img src="${itemURL(it, 48)}" alt=""><span>${esc(it.n)}</span></button>`).join('')}</div>`; }).join('') : '<div class="sjl-note">You haven’t made any items yet.</div>');
        return;
      }
      body.innerHTML = GROUPS[g][1].map(([k, label]) => `<h4>${label}</h4><div class="sjl-opts">${PARTS[k] ? PARTS[k].map((n, i) => `<button class="sjl-opt${L[k] === i ? ' on' : ''}" data-k="${k}" data-v="${i}">${n}</button>`).join('') : PAL[k].map(c => `<button class="sjl-sw${L[k] === c ? ' on' : ''}" style="background:${c}" data-k="${k}" data-c="${c}" title="${c}"></button>`).join('') + `<input type="color" data-k="${k}" value="${L[k]}" title="Any colour" style="width:30px;height:30px;border:none;background:none;padding:0">`}</div>`).join('');
    };
    const changed = () => { render(); onChange && onChange(L); };
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.g) { g = +b.dataset.g; render(); return; }
      if (b.dataset.a === 'rand') { L = { ...random(), title: L.title, custom: L.custom }; changed(); return; }
      if (b.dataset.a === 'workshop') { opts.workshop && opts.workshop(); return; }
      if (b.dataset.slot) { const sl = b.dataset.slot, it = slotItems(L, sl)[+b.dataset.i], c = { ...(L.custom || {}) }; if (it) { const k = cleanItem(it, sl); c[sl] = { n: k.n, s: sl, p: k.p, d: k.d }; } else delete c[sl]; L = { ...L, custom: Object.keys(c).length ? c : null }; changed(); return; }
      if (b.dataset.a === 'pose') { pi = (pi + 1) % poses.length; return; }
      if (b.dataset.k) { L = { ...L, [b.dataset.k]: b.dataset.c || +b.dataset.v }; changed(); }
    };
    box.oninput = e => { if (e.target === title) { L = { ...L, title: title.value }; onChange && onChange(L); } else if (e.target.type === 'color') { L = { ...L, [e.target.dataset.k]: e.target.value }; onChange && onChange(L); } };
    box.onchange = e => { if (e.target.type === 'color') render(); };
    render(); paint();
    return { get: () => L, set: l => { L = norm(l); title.value = L.title || ''; render(); }, refresh: render, tab: name => { const i = GROUPS.findIndex(x => x[0] === name); if (i >= 0) { g = i; render(); } } };
  }
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  window.SJLook = { get, save, random, draw, head, face, editor, rgb, norm, PARTS, PAL, DEF, SLOTS, IPAL, TEMPLATES, Items, cleanItem, drawItem, itemURL, itemCanvas, runs, custom, Clothes, cloth, clothCanvas, clothRuns, okCloth, get cached() { return norm(cache); } };
})();
