/* SanjivramOS game character ("look") — one character you design once and see in every online game.
   Saved on your SanjivramOS account (POST /social/api/look) and in localStorage 'sjlook' (works offline / signed out).
   SJLook.get() → look · SJLook.save(look) · SJLook.random() · SJLook.draw(ctx, look, x, y, h, {pose, t, face}) — full body
   SJLook.face(look, px) → data: URL portrait · SJLook.editor(container, look, onChange) — the creator UI
   Parts are numbers, colours are #rrggbb, so the server can check them (server/social.js cleanLook).            */
(() => {
  'use strict';
  if (window.SJLook) return;
  const PARTS = {
    hairStyle: ['Short', 'Spiky', 'Long', 'Bob', 'Mohawk', 'Bun', 'Curly', 'Bald', 'Ponytail', 'Side part'],
    eyes: ['Round', 'Happy', 'Sleepy', 'Wide', 'Wink', 'Determined'],
    brows: ['Normal', 'Angry', 'Worried', 'None'],
    mouth: ['Smile', 'Grin', 'Flat', 'Open', 'Smirk'],
    shirtStyle: ['T-shirt', 'Hoodie', 'Jacket', 'Stripes', 'Vest', 'Armor'],
    hat: ['None', 'Cap', 'Beanie', 'Crown', 'Top hat', 'Headband', 'Helmet', 'Wizard', 'Headphones'],
    acc: ['None', 'Glasses', 'Shades', 'Mask', 'Scarf', 'Backpack', 'Cape'],
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
  const DEF = { skin: '#f8c9a0', hair: '#4a2f1d', eye: '#1f2937', shirt: '#3b82f6', shirt2: '#f1f5f9', pants: '#334155', shoes: '#111827', hatColor: '#ef4444', accColor: '#111827', hairStyle: 0, eyes: 0, brows: 0, mouth: 0, shirtStyle: 0, hat: 0, acc: 0, body: 1, title: '' };
  const pick = a => a[Math.random() * a.length | 0];
  function random() {
    const l = { ...DEF };
    for (const k of Object.keys(PAL)) l[k] = pick(PAL[k]);
    for (const k of Object.keys(PARTS)) l[k] = Math.random() * PARTS[k].length | 0;
    if (Math.random() < .5) l.hat = 0; if (Math.random() < .5) l.acc = 0;
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

  /* ---------- 2D drawing: a chunky cartoon figure, feet at (x, y), h = total height ---------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function head(ctx, L, cx, cy, s, face = 1) {
    const hw = 1.0 * s, hh = 0.95 * s;
    // back hair
    ctx.fillStyle = L.hair;
    if (L.hairStyle === 2) rr(ctx, cx - hw * .62, cy - hh * .45, hw * 1.24, hh * 1.15, s * .3), ctx.fill();
    if (L.hairStyle === 8) { ctx.beginPath(); ctx.ellipse(cx - face * hw * .55, cy + hh * .1, s * .16, s * .38, 0, 0, 7); ctx.fill(); }
    // face
    ctx.fillStyle = L.skin; rr(ctx, cx - hw / 2, cy - hh / 2, hw, hh, s * .28); ctx.fill();
    ctx.fillStyle = shade(L.skin, -.12); ctx.beginPath(); ctx.ellipse(cx - hw * .52, cy + hh * .05, s * .09, s * .13, 0, 0, 7); ctx.ellipse(cx + hw * .52, cy + hh * .05, s * .09, s * .13, 0, 0, 7); ctx.fill();
    // hair on top
    ctx.fillStyle = L.hair;
    const top = cy - hh / 2;
    switch (L.hairStyle) {
      case 0: case 2: case 8: case 9: rr(ctx, cx - hw * .53, top - s * .06, hw * 1.06, hh * .34, s * .2); ctx.fill(); if (L.hairStyle === 9) { ctx.beginPath(); ctx.moveTo(cx - hw * .53, top + hh * .25); ctx.lineTo(cx + hw * .1, top + hh * .2); ctx.lineTo(cx - hw * .53, top + hh * .5); ctx.fill(); } break;
      case 1: for (let i = 0; i < 5; i++) { const x = cx - hw * .5 + i * hw * .25; ctx.beginPath(); ctx.moveTo(x - s * .1, top + s * .15); ctx.lineTo(x + s * .02, top - s * .28); ctx.lineTo(x + s * .17, top + s * .15); ctx.fill(); } rr(ctx, cx - hw * .53, top - s * .02, hw * 1.06, hh * .26, s * .12); ctx.fill(); break;
      case 3: rr(ctx, cx - hw * .6, top - s * .06, hw * 1.2, hh * .75, s * .25); ctx.fill(); ctx.fillStyle = L.skin; rr(ctx, cx - hw * .42, top + hh * .25, hw * .84, hh * .7, s * .2); ctx.fill(); break;
      case 4: rr(ctx, cx - s * .1, top - s * .35, s * .2, hh * .55, s * .08); ctx.fill(); break;
      case 5: rr(ctx, cx - hw * .53, top - s * .04, hw * 1.06, hh * .3, s * .2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, top - s * .18, s * .2, 0, 7); ctx.fill(); break;
      case 6: for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - hw * .45 + i * hw * .18, top + s * .02, s * .17, 0, 7); ctx.fill(); } break;
      case 7: break;
    }
    // eyes
    const ey = cy - hh * .02, ex = hw * .22;
    ctx.fillStyle = L.eye; ctx.strokeStyle = L.eye; ctx.lineWidth = Math.max(1, s * .06); ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const x = cx + sx * ex + face * s * .04;
      if (L.eyes === 1) { ctx.beginPath(); ctx.arc(x, ey + s * .03, s * .07, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (L.eyes === 2) { ctx.beginPath(); ctx.moveTo(x - s * .07, ey); ctx.lineTo(x + s * .07, ey); ctx.stroke(); }
      else if (L.eyes === 4 && sx === 1) { ctx.beginPath(); ctx.moveTo(x - s * .07, ey); ctx.lineTo(x + s * .07, ey - s * .02); ctx.stroke(); }
      else { const r = L.eyes === 3 ? s * .1 : s * .075; ctx.beginPath(); ctx.ellipse(x, ey, r * .8, r, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * .3, ey - r * .35, r * .3, 0, 7); ctx.fill(); ctx.fillStyle = L.eye; if (L.eyes === 5) { ctx.fillStyle = L.skin; ctx.fillRect(x - r, ey - r * 1.2, r * 2, r * .7); ctx.fillStyle = L.eye; } }
    }
    // brows
    if (L.brows !== 3) { ctx.strokeStyle = shade(L.hair, -.2); ctx.lineWidth = Math.max(1, s * .05); for (const sx of [-1, 1]) { const x = cx + sx * ex + face * s * .04, tilt = L.brows === 1 ? sx * .06 : L.brows === 2 ? -sx * .06 : 0; ctx.beginPath(); ctx.moveTo(x - s * .09, ey - s * .17 - tilt * s); ctx.lineTo(x + s * .09, ey - s * .17 + tilt * s); ctx.stroke(); } }
    // mouth
    const my = cy + hh * .26, mx = cx + face * s * .04;
    ctx.strokeStyle = '#7f1d1d'; ctx.fillStyle = '#7f1d1d'; ctx.lineWidth = Math.max(1, s * .05);
    if (L.mouth === 0) { ctx.beginPath(); ctx.arc(mx, my - s * .06, s * .12, .25 * Math.PI, .75 * Math.PI); ctx.stroke(); }
    else if (L.mouth === 1) { ctx.beginPath(); ctx.arc(mx, my - s * .07, s * .14, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(mx - s * .11, my - s * .07, s * .22, s * .04); }
    else if (L.mouth === 2) { ctx.beginPath(); ctx.moveTo(mx - s * .1, my); ctx.lineTo(mx + s * .1, my); ctx.stroke(); }
    else if (L.mouth === 3) { ctx.beginPath(); ctx.ellipse(mx, my, s * .07, s * .09, 0, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(mx - s * .1, my); ctx.quadraticCurveTo(mx + s * .05, my + s * .03, mx + s * .12, my - s * .06); ctx.stroke(); }
    // accessories on the face
    ctx.lineWidth = Math.max(1, s * .045);
    if (L.acc === 1 || L.acc === 2) { ctx.strokeStyle = L.acc === 2 ? '#111' : L.accColor; ctx.fillStyle = L.acc === 2 ? 'rgba(10,10,10,.92)' : 'rgba(255,255,255,.15)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sx * ex + face * s * .04, ey, s * .13, 0, 7); ctx.fill(); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(cx - ex + s * .17, ey); ctx.lineTo(cx + ex - s * .09, ey); ctx.stroke(); }
    if (L.acc === 3) { ctx.fillStyle = L.accColor; rr(ctx, cx - hw * .42, cy + hh * .08, hw * .84, hh * .34, s * .12); ctx.fill(); }
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
      case 8: ctx.strokeStyle = L.hatColor; ctx.lineWidth = s * .08; ctx.beginPath(); ctx.arc(cx, cy - s * .05, hw * .56, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); rr(ctx, cx - hw * .64, cy - s * .12, s * .16, s * .3, s * .06); ctx.fill(); rr(ctx, cx + hw * .64 - s * .16, cy - s * .12, s * .16, s * .3, s * .06); ctx.fill(); break;
    }
  }
  /** full figure. pose: 'idle' | 'walk' | 'jump' | 'wave'; t = animation time; face = 1 right / -1 left */
  function draw(ctx, look, x, y, h, o = {}) {
    const L = norm(look), s = h / 3.1, t = o.t || 0, face = o.face || 1, pose = o.pose || 'idle';
    const bw = [0.72, 0.85, 1.0][L.body] * s, legH = s * .95, torH = s * 1.05, sw = pose === 'walk' ? Math.sin(t * 9) : 0, bob = pose === 'walk' ? Math.abs(Math.sin(t * 9)) * s * .05 : pose === 'idle' ? Math.sin(t * 2) * s * .02 : 0;
    ctx.save(); ctx.lineJoin = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, bw * .7, s * .12, 0, 0, 7); ctx.fill();
    const hipY = y - legH - bob, shY = hipY - torH;
    // cape / backpack behind
    if (L.acc === 6) { ctx.fillStyle = L.accColor; ctx.beginPath(); ctx.moveTo(x - bw * .5, shY + s * .08); ctx.lineTo(x + bw * .5, shY + s * .08); ctx.lineTo(x + bw * .7 - face * sw * s * .1, hipY + legH * .7); ctx.lineTo(x - bw * .7 - face * sw * s * .1, hipY + legH * .7); ctx.fill(); }
    if (L.acc === 5) { ctx.fillStyle = L.accColor; rr(ctx, x - face * bw * .75 - bw * .25, shY + s * .15, bw * .5, torH * .7, s * .1); ctx.fill(); }
    // legs
    const leg = (dx, a) => { ctx.save(); ctx.translate(x + dx, hipY); ctx.rotate(a); ctx.fillStyle = L.pants; rr(ctx, -bw * .2, 0, bw * .4, legH * .86, s * .1); ctx.fill(); ctx.fillStyle = L.shoes; rr(ctx, -bw * .22 + face * s * .04, legH * .78, bw * .44 + s * .06, legH * .2, s * .08); ctx.fill(); ctx.restore(); };
    const la = pose === 'jump' ? .35 : sw * .5;
    leg(-bw * .23, la); leg(bw * .23, pose === 'jump' ? -.2 : -la);
    // arms (back one first)
    const arm = (dx, a, front) => { ctx.save(); ctx.translate(x + dx, shY + s * .12); ctx.rotate(a); ctx.fillStyle = L.shirtStyle === 0 || L.shirtStyle === 4 ? L.skin : L.shirt; if (!front) ctx.globalAlpha = .92; rr(ctx, -s * .14, 0, s * .28, torH * .82, s * .12); ctx.fill(); ctx.fillStyle = L.shirtStyle === 4 ? L.skin : L.shirt; if (L.shirtStyle === 0) rr(ctx, -s * .15, 0, s * .3, torH * .3, s * .1), ctx.fill(); ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, torH * .84, s * .14, 0, 7); ctx.fill(); ctx.restore(); };
    const aa = pose === 'jump' ? -2.4 : pose === 'wave' ? -2.6 + Math.sin(t * 8) * .35 : -sw * .55;
    arm(-bw * .58, pose === 'jump' ? 2.4 : sw * .55, false);
    // torso
    ctx.fillStyle = L.shirt; rr(ctx, x - bw * .5, shY, bw, torH, s * .2); ctx.fill();
    if (L.shirtStyle === 3) { ctx.fillStyle = L.shirt2; for (let i = 1; i < 4; i++) ctx.fillRect(x - bw * .5, shY + torH * i / 4.2, bw, torH * .08); }
    if (L.shirtStyle === 1) { ctx.fillStyle = shade(L.shirt, -.15); rr(ctx, x - bw * .3, shY + torH * .55, bw * .6, torH * .28, s * .08); ctx.fill(); ctx.strokeStyle = L.shirt2; ctx.lineWidth = s * .04; ctx.beginPath(); ctx.moveTo(x - s * .1, shY + s * .05); ctx.lineTo(x - s * .12, shY + torH * .4); ctx.moveTo(x + s * .1, shY + s * .05); ctx.lineTo(x + s * .12, shY + torH * .4); ctx.stroke(); }
    if (L.shirtStyle === 2) { ctx.fillStyle = L.shirt2; ctx.fillRect(x - bw * .08, shY, bw * .16, torH); }
    if (L.shirtStyle === 4) { ctx.fillStyle = L.shirt2; rr(ctx, x - bw * .5, shY, bw * .3, torH, s * .15); ctx.fill(); rr(ctx, x + bw * .2, shY, bw * .3, torH, s * .15); ctx.fill(); }
    if (L.shirtStyle === 5) { ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(ctx, x - bw * .38, shY + torH * .1, bw * .76, torH * .5, s * .12); ctx.fill(); ctx.fillStyle = L.shirt2; ctx.beginPath(); ctx.arc(x, shY + torH * .35, s * .12, 0, 7); ctx.fill(); }
    ctx.fillStyle = shade(L.pants, -.25); ctx.fillRect(x - bw * .5, hipY - torH * .1, bw, torH * .1);
    if (L.acc === 4) { ctx.fillStyle = L.accColor; rr(ctx, x - bw * .45, shY - s * .05, bw * .9, s * .26, s * .1); ctx.fill(); rr(ctx, x + face * bw * .1, shY + s * .1, s * .2, torH * .45, s * .06); ctx.fill(); }
    arm(bw * .58, aa, true);
    head(ctx, L, x + face * s * .04, shY - s * .5 - bob * .3, s, face);
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
.sjl-act{padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.1)!important}`;
  const GROUPS = [
    ['Face', [['skin', 'Skin'], ['eyes', 'Eyes'], ['eye', 'Eye colour'], ['brows', 'Eyebrows'], ['mouth', 'Mouth']]],
    ['Hair', [['hairStyle', 'Style'], ['hair', 'Colour']]],
    ['Outfit', [['shirtStyle', 'Top'], ['shirt', 'Main colour'], ['shirt2', 'Second colour'], ['pants', 'Trousers'], ['shoes', 'Shoes'], ['body', 'Build']]],
    ['Extras', [['hat', 'Hat'], ['hatColor', 'Hat colour'], ['acc', 'Accessory'], ['accColor', 'Accessory colour']]],
  ];
  function editor(box, look, onChange) {
    if (!document.getElementById('sjl-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sjl-css', textContent: ECSS }));
    let L = norm(look), g = 0, t = 0, raf = 0;
    box.innerHTML = `<div class="sjl"><div><canvas width="330" height="440"></canvas><div class="sjl-row" style="justify-content:center"><button class="sjl-act" data-a="rand">🎲 Random</button><button class="sjl-act" data-a="pose">💃 Pose</button></div></div><div><div class="sjl-tabs"></div><div class="sjl-body"></div><div class="sjl-row"><input maxlength="24" placeholder="Title under your name (optional)" value=""></div></div></div>`;
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), tabs = box.querySelector('.sjl-tabs'), body = box.querySelector('.sjl-body'), title = box.querySelector('input');
    title.value = L.title || '';
    const poses = ['idle', 'walk', 'wave', 'jump']; let pi = 0;
    const paint = () => { if (!cv.isConnected) { cancelAnimationFrame(raf); return; } t += 1 / 60; ctx.clearRect(0, 0, cv.width, cv.height); draw(ctx, L, 165, 410, 340, { t, pose: poses[pi], name: L.title || '' }); raf = requestAnimationFrame(paint); };
    const render = () => {
      tabs.innerHTML = GROUPS.map(([n], i) => `<button class="sjl-tab${i === g ? ' on' : ''}" data-g="${i}">${n}</button>`).join('');
      body.innerHTML = GROUPS[g][1].map(([k, label]) => `<h4>${label}</h4><div class="sjl-opts">${PARTS[k] ? PARTS[k].map((n, i) => `<button class="sjl-opt${L[k] === i ? ' on' : ''}" data-k="${k}" data-v="${i}">${n}</button>`).join('') : PAL[k].map(c => `<button class="sjl-sw${L[k] === c ? ' on' : ''}" style="background:${c}" data-k="${k}" data-c="${c}" title="${c}"></button>`).join('') + `<input type="color" data-k="${k}" value="${L[k]}" title="Any colour" style="width:30px;height:30px;border:none;background:none;padding:0">`}</div>`).join('');
    };
    const changed = () => { render(); onChange && onChange(L); };
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.g) { g = +b.dataset.g; render(); return; }
      if (b.dataset.a === 'rand') { L = { ...random(), title: L.title }; changed(); return; }
      if (b.dataset.a === 'pose') { pi = (pi + 1) % poses.length; return; }
      if (b.dataset.k) { L = { ...L, [b.dataset.k]: b.dataset.c || +b.dataset.v }; changed(); }
    };
    box.oninput = e => { if (e.target === title) { L = { ...L, title: title.value }; onChange && onChange(L); } else if (e.target.type === 'color') { L = { ...L, [e.target.dataset.k]: e.target.value }; onChange && onChange(L); } };
    box.onchange = e => { if (e.target.type === 'color') render(); };
    render(); paint();
    return { get: () => L, set: l => { L = norm(l); title.value = L.title || ''; render(); } };
  }
  window.SJLook = { get, save, random, draw, head, face, editor, rgb, norm, PARTS, PAL, DEF, get cached() { return norm(cache); } };
})();
