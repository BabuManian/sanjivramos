/* Game Maker app: editor, sprite painter, play-test, publish/browse/like/remix, leaderboards and online races. */
(() => {
'use strict';
const E = window.MakerEngine, $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kit = window.SJG ? SJG.init('maker', { vs: false, title: 'Game Maker', trophies: [
  { id: 'first', name: 'Game Designer', desc: 'Play-test your own game', icon: '🧩' },
  { id: 'publish', name: 'Published!', desc: 'Publish a game for everyone', icon: '🌐' },
  { id: 'artist', name: 'Pixel Artist', desc: 'Draw your own sprite', icon: '🎨' },
  { id: 'clear', name: 'Game Tester', desc: 'Beat someone else\'s game', icon: '🏁' },
  { id: 'race', name: 'Race Day', desc: 'Finish an online race', icon: '🏎️' },
  { id: 'levels5', name: 'World Builder', desc: 'Make a game with 5 levels', icon: '🗺️' },
] }) : null;
const sfx = n => kit && kit.sfx(n);
const ORDER = ['P', '#', '=', '-', 'I', 'B', 'O', 'G', 'C', 'K', 'D', 'H', 'X', 'N', 'S', 'L', 'E', 'F', 'Z', 'J', 'T', 'W'];
const E3 = window.MakerEngine3D;

/* ---------------- drafts (this device) ---------------- */
const DK = 'maker.drafts';
const loadDrafts = () => { try { return JSON.parse(localStorage.getItem(DK)) || {}; } catch { return {}; } };
const saveDrafts = d => { try { localStorage.setItem(DK, JSON.stringify(d)); return true; } catch { toast('This device is out of storage space — export the game to a file.'); return false; } };
const uid = () => Math.random().toString(36).slice(2, 10);
let draftId = null, game = null, li = 0, tool = 'pen', brush = '#', zoom = 1, undo = [], redo = [], dirty = false;
function newDraft(template = 'platformer', example = true) {
  const g = example ? (template === '3d' ? E3.example() : E.exampleGame(template)) : { v: 1, title: 'My game', template, settings: { ...E.DEFAULT_SETTINGS, ...(template === 'topdown' ? { stomp: false, theme: 3 } : {}) }, sprites: {}, levels: [E.blankLevel(40, template === 'topdown' ? 14 : 15, template)] };
  draftId = uid(); game = g; li = 0; undo = []; redo = []; persist(); renderEditor();
}
function openDraft(id) { const d = loadDrafts()[id]; if (!d) return; draftId = id; game = d.data; li = 0; undo = []; redo = []; renderEditor(); show('create'); }
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { const d = loadDrafts(); d[draftId] = { ...(d[draftId] || {}), data: game, updated: Date.now() }; saveDrafts(d); try { localStorage.setItem('maker.last', draftId); } catch {} }, 300);
}

/* ---------------- account ---------------- */
let me = null;
async function refreshMe() {
  try { const r = await fetch('/maker/api/me', { credentials: 'same-origin' }); me = r.ok ? (await r.json()).me : null; serverOk = r.ok; } catch { me = null; serverOk = false; }
  $('who').innerHTML = me ? `Signed in as <b>${esc(me.display)}</b>` : serverOk ? `<button id="signIn">Sign in to publish</button>` : '<span title="Publishing needs the SanjivramOS server">Offline</span>';
  const b = $('signIn'); if (b) b.onclick = () => signIn();
  return me;
}
let serverOk = false;
function signIn() {
  return new Promise(resolve => {
    dialog(`<h2>Sign in</h2><p>Use your SanjivramOS account (the same one as Messages and online games) to publish games, like them and post times.</p>
      <div class="row"><input id="su" placeholder="Username" autocomplete="username" maxlength="24" style="flex:1"></div>
      <div class="row"><input id="sp" type="password" placeholder="Password" autocomplete="current-password" style="flex:1"></div>
      <div class="err" id="se"></div>
      <div class="row"><button class="pri" id="sIn">Sign in</button><button id="sNew">Create account</button><span class="sp"></span><button id="sX">Cancel</button></div>`);
    const go = async kind => {
      try {
        const r = await fetch('/social/api/' + kind, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: $('su').value.trim(), password: $('sp').value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { $('se').textContent = j.error || 'Something went wrong'; return; }
        closeDialog(); await refreshMe(); resolve(me);
      } catch { $('se').textContent = 'Could not reach the server.'; }
    };
    $('sIn').onclick = () => go('login'); $('sNew').onclick = () => go('signup'); $('sX').onclick = () => { closeDialog(); resolve(null); };
    $('sp').onkeydown = e => { if (e.key === 'Enter') go('login'); };
    setTimeout(() => $('su').focus(), 30);
  });
}
const api = async (path, opt = {}) => {
  const r = await fetch('/maker/api/' + path, { credentials: 'same-origin', ...opt, headers: { 'content-type': 'application/json', ...(opt.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
  return j;
};

/* ---------------- dialog / toast ---------------- */
function dialog(html) { $('dlgCard').innerHTML = html; $('dlg').hidden = false; }
function closeDialog() { $('dlg').hidden = true; $('dlgCard').innerHTML = ''; }
$('dlg').addEventListener('pointerdown', e => { if (e.target === $('dlg')) closeDialog(); });
function toast(t) {
  const d = document.createElement('div'); d.textContent = t;
  d.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#111827;color:#fde68a;padding:9px 16px;border-radius:999px;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.5);font-weight:600';
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
}

/* ---------------- views ---------------- */
function show(v) {
  for (const x of ['create', 'browse', 'mine']) $('v-' + x).hidden = x !== v;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'browse') loadGallery();
  if (v === 'mine') renderMine();
  if (v === 'create') requestAnimationFrame(drawEditor);
}
$('tabs').onclick = e => { const b = e.target.closest('[data-v]'); if (b) show(b.dataset.v); };

/* ---------------- editor ---------------- */
const ed = $('ed'), eg = ed.getContext('2d'), TS = 32;
const L = () => game.levels[li];
function renderEditor() {
  $('title').value = game.title || '';
  renderPalette(); renderLevels(); renderSettings(); drawEditor();
}
function renderPalette() {
  const p = $('palette'); p.innerHTML = '';
  let grp = '';
  for (const ch of ORDER) {
    const [name, group, help] = E.TILES[ch];
    if (game.template === 'topdown' && ch === '-') continue;
    if (game.template !== '3d' && ch === 'O') continue;
    if (group !== grp) { grp = group; const h = document.createElement('h4'); h.textContent = group; p.appendChild(h); }
    const b = document.createElement('button'); b.className = 'pt' + (brush === ch ? ' on' : ''); b.title = help; b.dataset.ch = ch;
    const c = document.createElement('canvas'); c.width = c.height = 32; E.drawTile(c.getContext('2d'), ch, 0, 0, 32, game.sprites, 0);
    b.appendChild(c); const s = document.createElement('span'); s.textContent = name; b.appendChild(s);
    const pen = document.createElement('button'); pen.className = 'ed'; pen.textContent = '🎨'; pen.title = 'Change how it looks'; pen.dataset.edit = ch; b.appendChild(pen);
    p.appendChild(b);
  }
}
$('palette').addEventListener('click', e => {
  const pe = e.target.closest('[data-edit]'); if (pe) { e.stopPropagation(); spriteEditor(pe.dataset.edit); return; }
  const b = e.target.closest('[data-ch]'); if (!b) return;
  brush = b.dataset.ch; if (tool === 'erase' || tool === 'pan') setTool('pen'); renderPalette();
});
function renderLevels() {
  const t = $('levelTabs');
  t.innerHTML = game.levels.map((_, i) => `<button data-l="${i}" class="${i === li ? 'on' : ''}" title="Level ${i + 1}">${i + 1}</button>`).join('') + `<button id="lvMenu" title="Level options">⋯</button>`;
}
$('levelTabs').onclick = e => {
  const b = e.target.closest('[data-l]'); if (b) { li = +b.dataset.l; undo = []; redo = []; renderLevels(); drawEditor(); return; }
  if (e.target.id === 'lvMenu') levelMenu();
};
function levelMenu() {
  const lv = L();
  dialog(`<h2>Level ${li + 1}</h2><p>${lv.w} × ${lv.h} blocks</p>
    <div class="row"><button id="lAdd">＋ New level</button><button id="lDup">⧉ Duplicate</button><button id="lDel" class="warn" ${game.levels.length < 2 ? 'disabled' : ''}>🗑 Delete</button></div>
    <div class="row"><button id="lLeft" ${li === 0 ? 'disabled' : ''}>◀ Move earlier</button><button id="lRight" ${li === game.levels.length - 1 ? 'disabled' : ''}>Move later ▶</button></div>
    <h4>Size</h4><div class="row">Width <button data-rs="w-10">−10</button><button data-rs="w10">+10</button> &nbsp; Height <button data-rs="h-2">−2</button><button data-rs="h2">+2</button></div>
    <div class="row"><button id="lClear">Clear level</button><span class="sp"></span><button id="lX" class="pri">Done</button></div>`);
  $('lX').onclick = closeDialog;
  $('lAdd').onclick = () => { if (game.levels.length >= 30) return toast('30 levels max'); game.levels.splice(li + 1, 0, E.blankLevel(40, game.template === 'topdown' ? 14 : 15, game.template)); li++; done(); if (game.levels.length >= 5) kit && kit.unlock('levels5'); };
  $('lDup').onclick = () => { if (game.levels.length >= 30) return toast('30 levels max'); game.levels.splice(li + 1, 0, JSON.parse(JSON.stringify(L()))); li++; done(); };
  $('lDel').onclick = () => { if (game.levels.length < 2 || !confirm('Delete this level?')) return; game.levels.splice(li, 1); li = Math.max(0, li - 1); done(); };
  $('lLeft').onclick = () => { const a = game.levels; [a[li - 1], a[li]] = [a[li], a[li - 1]]; li--; done(); };
  $('lRight').onclick = () => { const a = game.levels; [a[li + 1], a[li]] = [a[li], a[li + 1]]; li++; done(); };
  $('lClear').onclick = () => { if (!confirm('Clear everything on this level?')) return; snapshot(); const b = E.blankLevel(L().w, L().h, game.template); game.levels[li] = b; done(); };
  document.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { snapshot(); resize(b.dataset.rs[0], +b.dataset.rs.slice(1)); done(false); levelMenu(); });
  function done(close = true) { undo = []; redo = []; persist(); renderLevels(); drawEditor(); if (close) closeDialog(); }
}
function resize(dim, d) {
  const lv = L(), nw = dim === 'w' ? Math.max(8, Math.min(200, lv.w + d)) : lv.w, nh = dim === 'h' ? Math.max(6, Math.min(60, lv.h + d)) : lv.h;
  let s = '';
  // growing height adds rows on top so the ground stays at the bottom
  const dy = nh - lv.h;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const oy = y - dy, inside = x < lv.w && oy >= 0 && oy < lv.h;
    s += inside ? lv.tiles[oy * lv.w + x] : (game.template === 'platformer' && oy >= lv.h - 2 && x >= lv.w ? lv.tiles[(Math.min(lv.h - 1, Math.max(0, oy))) * lv.w + lv.w - 1] === '#' ? '#' : '.' : '.');
  }
  const signs = {}; for (const k in lv.signs || {}) { const x = k % lv.w, y = Math.floor(k / lv.w) + dy; if (x < nw && y >= 0 && y < nh) signs[y * nw + x] = lv.signs[k]; }
  if (!s.includes('P')) s = 'P' + s.slice(1);
  game.levels[li] = { ...lv, w: nw, h: nh, tiles: s, signs };
}
function drawEditor() {
  if (!game || $('v-create').hidden) return;
  const lv = L(), s = TS * zoom;
  ed.width = lv.w * s; ed.height = lv.h * s;
  eg.imageSmoothingEnabled = false;
  E.drawBackground(eg, game.settings.theme, ed.width, ed.height, 0, 0);
  if (game.template === 'topdown') { eg.fillStyle = 'rgba(0,0,0,.25)'; eg.fillRect(0, 0, ed.width, ed.height); }
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) { const c = lv.tiles[y * lv.w + x]; if (c !== '.') E.drawTile(eg, c, x * s, y * s, s, game.sprites, 0); }
  eg.strokeStyle = 'rgba(255,255,255,.12)'; eg.lineWidth = 1;
  eg.beginPath(); for (let x = 0; x <= lv.w; x++) { eg.moveTo(x * s + .5, 0); eg.lineTo(x * s + .5, ed.height); } for (let y = 0; y <= lv.h; y++) { eg.moveTo(0, y * s + .5); eg.lineTo(ed.width, y * s + .5); } eg.stroke();
  if (rectStart && hoverCell) { const [ax, ay] = rectStart, [bx, by] = hoverCell; eg.strokeStyle = '#fde047'; eg.lineWidth = 2; eg.strokeRect(Math.min(ax, bx) * s, Math.min(ay, by) * s, (Math.abs(bx - ax) + 1) * s, (Math.abs(by - ay) + 1) * s); }
  else if (hoverCell && tool !== 'pan') { eg.strokeStyle = tool === 'erase' ? '#f87171' : '#fde047'; eg.lineWidth = 2; eg.strokeRect(hoverCell[0] * s + 1, hoverCell[1] * s + 1, s - 2, s - 2); }
}
function snapshot() { undo.push(JSON.stringify(L())); if (undo.length > 80) undo.shift(); redo = []; }
function setCell(x, y, ch) {
  const lv = L(); if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return false;
  const k = y * lv.w + x; if (lv.tiles[k] === ch) return false;
  if (lv.tiles[k] === 'P' && ch !== 'P' && lv.tiles.split('P').length <= 2) { toast('Every level needs a player start — place one somewhere else first.'); return false; }
  let t = lv.tiles;
  if (ch === 'P') t = t.replace(/P/g, '.');
  t = t.slice(0, k) + ch + t.slice(k + 1);
  lv.tiles = t;
  if (ch !== 'N' && lv.signs) delete lv.signs[k];
  return true;
}
let painting = false, rectStart = null, hoverCell = null, panning = null, lastCell = null;
const cellOf = e => { const r = ed.getBoundingClientRect(), s = TS * zoom; return [Math.floor((e.clientX - r.left) / s), Math.floor((e.clientY - r.top) / s)]; };
ed.addEventListener('contextmenu', e => e.preventDefault());
ed.addEventListener('pointerdown', e => {
  try { ed.setPointerCapture(e.pointerId); } catch {}
  const cell = cellOf(e), erase = e.button === 2 || tool === 'erase';
  if (tool === 'pan' || e.button === 1 || spaceDown) { panning = { x: e.clientX, y: e.clientY, sl: $('editWrap').scrollLeft, st: $('editWrap').scrollTop }; return; }
  if (tool === 'fill' && !erase) { snapshot(); bucket(cell, brush); afterEdit(); return; }
  if (tool === 'rect') { rectStart = cell; rectErase = erase; return; }
  snapshot(); painting = erase ? '.' : brush; lastCell = null; paintAt(cell);
});
let rectErase = false;
ed.addEventListener('pointermove', e => {
  const cell = cellOf(e);
  if (panning) { $('editWrap').scrollLeft = panning.sl - (e.clientX - panning.x); $('editWrap').scrollTop = panning.st - (e.clientY - panning.y); return; }
  if (!hoverCell || hoverCell[0] !== cell[0] || hoverCell[1] !== cell[1]) { hoverCell = cell; if (painting) paintAt(cell); drawEditor(); }
});
ed.addEventListener('pointerleave', () => { hoverCell = null; drawEditor(); });
addEventListener('pointerup', () => {
  if (panning) { panning = null; return; }
  if (rectStart && hoverCell) {
    snapshot(); const [ax, ay] = rectStart, [bx, by] = hoverCell, ch = rectErase ? '.' : brush;
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) setCell(x, y, ch === 'P' ? '.' : ch);
    if (ch === 'P') setCell(bx, by, 'P');
    rectStart = null; afterEdit(); return;
  }
  rectStart = null;
  if (painting) { painting = false; afterEdit(); }
});
function paintAt([x, y]) {
  // fill the gap between pointer events so fast strokes don't skip cells
  const pts = []; if (lastCell) { const n = Math.max(Math.abs(x - lastCell[0]), Math.abs(y - lastCell[1])); for (let i = 1; i <= n; i++) pts.push([Math.round(lastCell[0] + (x - lastCell[0]) * i / n), Math.round(lastCell[1] + (y - lastCell[1]) * i / n)]); } else pts.push([x, y]);
  lastCell = [x, y];
  for (const [a, b] of pts) {
    if (setCell(a, b, painting) && painting === 'N') {
      const txt = prompt('What should this sign say?', ''); if (txt != null) { L().signs = L().signs || {}; L().signs[b * L().w + a] = txt.slice(0, 200); } painting = false;
    }
  }
  drawEditor();
}
function bucket([x, y], ch) {
  const lv = L(); if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return;
  const from = lv.tiles[y * lv.w + x]; if (from === ch || ch === 'P') return;
  const t = lv.tiles.split(''), st = [[x, y]]; let n = 0;
  while (st.length && n < 5000) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= lv.w || b >= lv.h || t[b * lv.w + a] !== from) continue; t[b * lv.w + a] = ch; n++; st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
  if (!t.includes('P')) return toast('That would cover the player start.');
  lv.tiles = t.join('');
}
function afterEdit() { persist(); drawEditor(); }
function setTool(t) { tool = t; document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); ed.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; }
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('undo').onclick = () => { if (!undo.length) return; redo.push(JSON.stringify(L())); game.levels[li] = JSON.parse(undo.pop()); afterEdit(); };
$('redo').onclick = () => { if (!redo.length) return; undo.push(JSON.stringify(L())); game.levels[li] = JSON.parse(redo.pop()); afterEdit(); };
$('zoomIn').onclick = () => { zoom = Math.min(2, zoom * 1.25); drawEditor(); };
$('zoomOut').onclick = () => { zoom = Math.max(.4, zoom / 1.25); drawEditor(); };
$('title').oninput = () => { game.title = $('title').value; persist(); };
let spaceDown = false;
addEventListener('keydown', e => {
  if ($('v-create').hidden || !$('play').hidden || !$('dlg').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); $('undo').click(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); $('redo').click(); }
  const k = { b: 'pen', e: 'erase', r: 'rect', f: 'fill' }[e.key]; if (k && !e.ctrlKey) setTool(k);
});
addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });

/* ---------------- settings panel ---------------- */
function renderSettings() {
  const s = game.settings, plat = game.template === 'platformer' || game.template === '3d';
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('settings').innerHTML = `
    <h4>Game type</h4>${`<div class="seg" data-key="template">${[['platformer', '🏃 Side view'], ['topdown', '🗺️ Top-down'], ['3d', '🧊 3D']].map(([v, l]) => `<button data-v="${v}" class="${game.template === v ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    <h4>How to win a level</h4>${seg('win', [['goal', '🚩 Reach flag'], ['coins', '🪙 All coins'], ['enemies', '👾 Beat enemies']])}
    <h4>Player</h4>
    <div class="f"><label>Speed</label>${seg('speed', [[1, 'Slow'], [2, 'Normal'], [3, 'Fast']])}</div>
    ${plat ? `<div class="f"><label>Jump</label>${seg('jump', [[1, 'Low'], [2, 'Normal'], [3, 'High']])}</div>
    <div class="f"><label>Gravity</label>${seg('gravity', [[.55, 'Moon'], [1, 'Normal'], [1.5, 'Heavy']])}</div>
    <div class="f"><label for="sDJ">Double jump</label><input type="checkbox" id="sDJ" data-bool="doubleJump" ${s.doubleJump ? 'checked' : ''}></div>
    <div class="f"><label for="sSt">Jump on enemies to beat them</label><input type="checkbox" id="sSt" data-bool="stomp" ${s.stomp ? 'checked' : ''}></div>` : ''}
    <div class="f"><label for="sSh">Can shoot (Space / ✦)</label><input type="checkbox" id="sSh" data-bool="shoot" ${s.shoot ? 'checked' : ''}></div>
    <h4>Challenge</h4>
    <div class="f"><label>Lives</label>${seg('lives', [[1, '1'], [3, '3'], [5, '5'], [0, '∞']])}</div>
    <div class="f"><label>Timer</label>${seg('timer', [[0, 'Off'], [30, '30s'], [60, '60s'], [120, '2m']])}</div>
    <div class="f"><label>Enemy speed</label>${seg('enemySpeed', [[1, 'Slow'], [2, 'Normal'], [3, 'Fast']])}</div>
    <h4>Background</h4><select id="sTheme">${E.THEMES.map((t, i) => `<option value="${i}" ${+s.theme === i ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
    <h4>File</h4><div class="seg"><button id="exportBtn">⬇ Export</button><button id="newFromHere">＋ New game</button></div>`;
}
$('settings').addEventListener('click', e => {
  const b = e.target.closest('.seg[data-key] button'); if (!b) {
    if (e.target.id === 'exportBtn') exportGame(); if (e.target.id === 'newFromHere') newGameDialog(); return;
  }
  const key = b.parentElement.dataset.key, v = b.dataset.v;
  if (key === 'template') { if (game.template === v) return; if (!confirm('Switch the game type? Your levels stay, but they play differently.')) return; game.template = v; if (v === 'topdown') game.settings.stomp = false; renderPalette(); }
  else game.settings[key] = isNaN(+v) ? v : +v;
  persist(); renderSettings(); drawEditor();
});
$('settings').addEventListener('change', e => {
  if (e.target.dataset.bool) game.settings[e.target.dataset.bool] = e.target.checked;
  if (e.target.id === 'sTheme') { game.settings.theme = +e.target.value; drawEditor(); }
  persist();
});

/* ---------------- sprite painter ---------------- */
const EMOJI = '🙂😎🤖👽👻🐱🐶🐸🐵🦊🐼🐧🐤🦖🐙🦀🐝🐞🧙🥷🦸🧟👾💀🔥⭐🌟💎🪙🍎🍕🍩🎁🔑🗝️🚪🏁🚩❤️💖⚡💣🧱🪨🌳🌵🍄🌊☁️🌈🚀🛸⚽🏀🎈'.match(/\p{Extended_Pictographic}️?/gu);
function spriteEditor(ch) {
  const cur = game.sprites[ch] || {};
  let px = (cur.px || '0'.repeat(64)).split(''), col = 1, mode = cur.emoji ? 'emoji' : 'pixel', emoji = cur.emoji || '';
  if (!cur.px && !cur.emoji) { // start from the default look, sampled down to 8×8 with the nearest palette colour
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); E.drawTile(g, ch, 0, 0, 8, {}, 0);
    const d = g.getImageData(0, 0, 8, 8).data;
    px = Array.from({ length: 64 }, (_, i) => { if (d[i * 4 + 3] < 100) return '0'; let best = 1, bd = 1e9; for (let k = 1; k < 16; k++) { const h = E.PAL[k], r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16), dd = (r - d[i * 4]) ** 2 + (gg - d[i * 4 + 1]) ** 2 + (b - d[i * 4 + 2]) ** 2; if (dd < bd) { bd = dd; best = k; } } return best.toString(16); });
  }
  dialog(`<h2>🎨 ${esc(E.TILES[ch][0])}</h2><p>Draw your own pixel art or pick an emoji. It changes this block everywhere in your game.</p>
    <div class="row"><button id="mPx" class="${mode === 'pixel' ? 'on' : ''}">Pixel art</button><button id="mEm" class="${mode === 'emoji' ? 'on' : ''}">Emoji</button></div>
    <div id="sprBody" style="margin-top:10px"></div>
    <div class="row"><button id="sprReset">Reset to default</button><span class="sp"></span><button id="sprCancel">Cancel</button><button class="pri" id="sprOk">Use it</button></div>`);
  const body = $('sprBody');
  function render() {
    $('mPx').classList.toggle('on', mode === 'pixel'); $('mEm').classList.toggle('on', mode === 'emoji');
    if (mode === 'pixel') {
      body.innerHTML = `<div class="spr"><div class="grid8" id="g8">${px.map((v, i) => `<div data-i="${i}" style="background:${E.PAL[parseInt(v, 16)] || 'transparent'}"></div>`).join('')}</div>
        <div><div class="pal">${E.PAL.map((c, i) => `<button data-c="${i}" class="${i === col ? 'on' : ''}" style="background:${c || 'repeating-conic-gradient(#555 0 25%,#333 0 50%) 0/10px 10px'}" title="${i ? c : 'Clear'}"></button>`).join('')}</div>
        <div class="row"><button id="flipH">⇋ Flip</button><button id="clr">Clear</button></div></div></div>`;
      const g8 = $('g8'); let down = false;
      const paint = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const d = el && el.closest('#g8 [data-i]'); if (!d) return; px[+d.dataset.i] = col.toString(16); d.style.background = E.PAL[col] || 'transparent'; };
      g8.onpointerdown = e => { down = true; try { g8.setPointerCapture(e.pointerId); } catch {} paint(e); };
      g8.onpointermove = e => { if (down) paint(e); };
      g8.onpointerup = () => { down = false; };
      body.querySelector('.pal').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { col = +b.dataset.c; render(); } };
      $('flipH').onclick = () => { const n = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) n.push(px[y * 8 + 7 - x]); px = n; render(); };
      $('clr').onclick = () => { px = '0'.repeat(64).split(''); render(); };
    } else {
      body.innerHTML = `<div class="row"><input id="emIn" value="${esc(emoji)}" maxlength="8" style="width:80px;font-size:22px;text-align:center" aria-label="Emoji"><span style="color:var(--dim)">Type or paste any emoji, or pick one:</span></div><div class="emojis">${EMOJI.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div>`;
      body.querySelector('.emojis').onclick = e => { const b = e.target.closest('[data-e]'); if (b) { emoji = b.dataset.e; $('emIn').value = emoji; } };
      $('emIn').oninput = () => { emoji = $('emIn').value.trim(); };
    }
  }
  render();
  $('mPx').onclick = () => { mode = 'pixel'; render(); }; $('mEm').onclick = () => { mode = 'emoji'; render(); };
  $('sprCancel').onclick = closeDialog;
  $('sprReset').onclick = () => { delete game.sprites[ch]; closeDialog(); persist(); renderPalette(); drawEditor(); };
  $('sprOk').onclick = () => {
    if (mode === 'pixel') { if (px.every(v => v === '0')) delete game.sprites[ch]; else { game.sprites[ch] = { px: px.join('') }; kit && kit.unlock('artist'); } }
    else if (emoji) game.sprites[ch] = { emoji: [...emoji].slice(0, 4).join('') };
    closeDialog(); persist(); renderPalette(); drawEditor();
  };
}

/* ---------------- playing ---------------- */
let runner = null, playCtx = null;
const touchUI = matchMedia('(pointer:coarse)').matches;
function play(gameData, ctx = {}) {
  // ctx: { published:{id,title}, test:true, race:{net,...} }
  $('play').hidden = false; $('endCard').hidden = true;
  const td = gameData.template === 'topdown', d3 = gameData.template === '3d', shoot = !d3 && gameData.settings && gameData.settings.shoot;
  const lay = d3 ? { tcL: [14, 50], tcR: [110, 50], tcU: [62, 100], tcD: [62, 0], tcA: 'r' } : td ? { tcL: [14, 50], tcR: [110, 50], tcU: [62, 100], tcD: [62, 0], tcB: shoot && 'r' } : { tcL: [14, 24], tcR: [92, 24], tcA: 'r', tcB: shoot && 'r2' };
  for (const id of ['tcL', 'tcR', 'tcU', 'tcD', 'tcA', 'tcB']) {
    const el = $(id), v = lay[id]; el.style.display = touchUI && v ? 'flex' : 'none';
    if (Array.isArray(v)) { el.style.left = v[0] + 'px'; el.style.bottom = (v[1] + 14) + 'px'; el.style.right = 'auto'; }
    else if (v === 'r') { el.style.right = '16px'; el.style.bottom = '30px'; el.style.left = 'auto'; }
    else if (v === 'r2') { el.style.right = '110px'; el.style.bottom = '24px'; el.style.left = 'auto'; }
  }
  playCtx = ctx;
  if (runner) runner.stop();
  $('pc').style.display = d3 ? 'none' : '';
  runner = (d3 ? (o => E3.run($('play'), gameData, o)) : (o => E.run($('pc'), gameData, o)))({
    sfx, countdown: ctx.race ? 3 : 0, startLevel: ctx.startLevel || 0,
    hud: (l, r, b) => { $('hLeft').textContent = l; $('hRight').textContent = r; $('banner').textContent = b; },
    sign: txt => { $('sign').hidden = !txt; if (txt) $('sign').textContent = txt; },
    onWin: st => finished(true, st), onLose: st => finished(false, st),
    onPos: ctx.race ? p => ctx.race.pos(p) : null, nogl: !!window.__makerNoGL,
    ghosts: ctx.race ? () => ctx.race.ghosts() : null,
  });
  if (ctx.test) kit && kit.unlock('first');
  if (ctx.published && serverOk) api('play/' + ctx.published.id, { method: 'POST', body: '{}' }).catch(() => {});
}
function stopPlay() { if (runner) runner.stop(); runner = null; $('play').hidden = true; if (playCtx && playCtx.race) playCtx.race.leave(); playCtx = null; }
$('exitPlay').onclick = stopPlay;
async function finished(won, st) {
  const ctx = playCtx || {};
  $('endCard').hidden = false;
  $('eTitle').textContent = won ? '🎉 You beat it!' : '💀 Game over';
  $('eInfo').textContent = won ? `Time ${(st.ms / 1000).toFixed(2)}s · ${st.coins} coins · ${st.deaths} hit${st.deaths === 1 ? '' : 's'}` : `You ran out of lives on level ${st.level + 1}.`;
  $('eBoard').innerHTML = '';
  const btns = [];
  if (!won) btns.push(['Try again', () => { $('endCard').hidden = true; runner.restartLevel(); }]);
  btns.push(['Play again', () => play(runnerData, ctx)]);
  btns.push([ctx.test ? 'Back to editor' : 'Close', stopPlay]);
  $('eBtns').innerHTML = ''; for (const [t, f] of btns) { const b = document.createElement('button'); b.textContent = t; b.onclick = f; $('eBtns').appendChild(b); }
  if (won) sfx('win');
  if (won && ctx.published && !ctx.mine) kit && kit.unlock('clear');
  if (ctx.race && !ctx.race.together) { ctx.race.finish(won ? st.ms : null); if (won) kit && kit.unlock('race'); }
  if (won && ctx.published && serverOk) {
    if (!me) { $('eBoard').innerHTML = `<p>Sign in to put your time on the leaderboard.</p>`; const b = document.createElement('button'); b.textContent = 'Sign in & submit'; b.onclick = async () => { if (await signIn()) submit(); }; $('eBoard').appendChild(b); }
    else submit();
    async function submit() {
      try { const r = await api('score/' + ctx.published.id, { method: 'POST', body: JSON.stringify({ ms: st.ms, coins: st.coins }) }); $('eBoard').innerHTML = (r.best ? `<p>🏆 New personal best — you're #${r.rank}!</p>` : `<p>Your best is still faster. Rank #${r.rank}.</p>`) + board(r.scores); }
      catch (e) { $('eBoard').textContent = e.message; }
    }
  }
}
let runnerData = null;
const board = scores => scores && scores.length ? `<table class="lb">${scores.map((s, i) => `<tr><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(s.name)}</td><td>${(s.ms / 1000).toFixed(2)}s</td></tr>`).join('')}</table>` : '<p>No times yet — be the first!</p>';
function startPlay(data, ctx) { runnerData = data; play(data, ctx); }
$('testBtn').onclick = () => { game.title = $('title').value || game.title; startPlay(JSON.parse(JSON.stringify(game)), { test: true, startLevel: li }); };
// keyboard + touch → runner input
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', Space: 'b', KeyX: 'b', KeyJ: 'b', KeyZ: 'a', KeyK: 'a' };
addEventListener('keydown', e => {
  if ($('play').hidden || !runner) return;
  if (e.code === 'Escape') { stopPlay(); return; }
  const top = runnerData && (runnerData.template === 'topdown' || runnerData.template === '3d');
  let k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
  if (!top && (k === 'u' || e.code === 'Space') && !(runnerData.settings && runnerData.settings.shoot && e.code === 'Space')) k = 'a';
  if (e.repeat) return;
  runner.input[k] = true; if (k === 'a') runner.input.aPressed = true; if (k === 'b') runner.input.bPressed = true;
});
addEventListener('keyup', e => {
  if (!runner) return; const k = KEYMAP[e.code]; if (!k) return;
  runner.input[k] = false; if (k === 'u' || e.code === 'Space') runner.input.a = false;
});
for (const [id, k] of [['tcL', 'l'], ['tcR', 'r'], ['tcU', 'u'], ['tcD', 'd'], ['tcA', 'a'], ['tcB', 'b']]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); if (!runner) return; el.classList.add('dn'); runner.input[k] = true; if (k === 'a') runner.input.aPressed = true; if (k === 'b') runner.input.bPressed = true; if (k === 'a' && runnerData.template === 'topdown') runner.input.u = true; });
  const off = e => { e.preventDefault(); el.classList.remove('dn'); if (!runner) return; runner.input[k] = false; if (k === 'a' && runnerData.template === 'topdown') runner.input.u = false; };
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}

/* ---------------- publish ---------------- */
function thumbnail(data) {
  const lv = data.levels[0], c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d');
  E.drawBackground(g, data.settings.theme, 320, 180, 0, 0);
  const s = Math.max(8, Math.floor(180 / lv.h)), p = lv.tiles.indexOf('P'), px = p % lv.w, x0 = Math.max(0, Math.min(lv.w - Math.ceil(320 / s), px - 4));
  for (let y = 0; y < lv.h; y++) for (let x = x0; x < Math.min(lv.w, x0 + Math.ceil(320 / s) + 1); x++) { const ch = lv.tiles[y * lv.w + x]; if (ch !== '.') E.drawTile(g, ch, (x - x0) * s, 180 - lv.h * s + y * s, s, data.sprites, 0); }
  return c.toDataURL('image/jpeg', .7);
}
$('pubBtn').onclick = async () => {
  if (!serverOk) { await refreshMe(); if (!serverOk) return toast('Publishing needs the SanjivramOS server.'); }
  if (!me && !(await signIn())) return;
  const drafts = loadDrafts(), d = drafts[draftId] || {};
  game.title = $('title').value.trim() || game.title || 'Untitled game';
  dialog(`<h2>🌐 Publish “${esc(game.title)}”</h2><p>Everyone on this SanjivramOS server can find it in “Play games”, play it, like it, remix it and race it online.${d.pubId ? ' This updates your published version.' : ''}</p>
    <div class="row"><input id="pubTitle" value="${esc(game.title)}" maxlength="60" style="flex:1" aria-label="Title"></div>
    <div class="row"><textarea id="pubDesc" rows="3" maxlength="300" style="flex:1" placeholder="Describe your game (optional)">${esc(d.desc || '')}</textarea></div>
    <div class="err" id="pubErr"></div>
    <div class="row"><span class="sp"></span><button id="pubCancel">Cancel</button><button class="pub" id="pubGo">${d.pubId ? 'Update' : 'Publish'}</button></div>`);
  $('pubCancel').onclick = closeDialog;
  $('pubGo').onclick = async () => {
    game.title = $('pubTitle').value.trim() || game.title; $('title').value = game.title;
    $('pubGo').disabled = true;
    try {
      const r = await api('publish', { method: 'POST', body: JSON.stringify({ id: d.pubId, title: game.title, desc: $('pubDesc').value, data: game, thumb: thumbnail(game), remixOf: d.remixOf }) });
      const all = loadDrafts(); all[draftId] = { ...(all[draftId] || {}), data: game, pubId: r.id, desc: $('pubDesc').value, updated: Date.now() }; saveDrafts(all);
      kit && kit.unlock('publish'); sfx('win');
      dialog(`<h2>🎉 It's live!</h2><p>Anyone on this server can play it now. Share the link:</p><div class="row"><input readonly id="shareLink" value="${esc(location.origin + location.pathname + '?play=' + r.id)}" style="flex:1"><button id="copyL">Copy</button></div><div class="row"><span class="sp"></span><button class="pri" id="okL">Done</button></div>`);
      $('copyL').onclick = () => { $('shareLink').select(); (navigator.clipboard ? navigator.clipboard.writeText($('shareLink').value) : Promise.reject()).then(() => toast('Link copied'), () => document.execCommand('copy')); };
      $('okL').onclick = closeDialog;
    } catch (e) { $('pubErr').textContent = e.message; $('pubGo').disabled = false; if (e.status === 401) { me = null; refreshMe(); } }
  };
};

/* ---------------- gallery ---------------- */
let galleryT = null;
async function loadGallery() {
  const box = $('gallery');
  box.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const r = await api(`list?sort=${$('sort').value}&q=${encodeURIComponent($('q').value.trim())}`);
    box.innerHTML = r.games.length ? r.games.map(card).join('') : `<div class="empty">No games yet. Make one in 🛠 Create and press 🌐 Publish!</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${esc(serverOk ? e.message : 'Sharing needs the SanjivramOS server.')}</div>`; }
}
const card = g => `<button class="gcard" data-gid="${g.id}"><div class="th" style="${g.thumb ? `background-image:url(${g.thumb})` : ''}">${g.thumb ? '' : '🎮'}</div><div class="meta"><b>${esc(g.title)}</b><small>by ${esc(g.author)}${g.mine ? ' (you)' : ''}</small><small>❤️ ${g.likes} · ▶ ${g.plays} · ${g.levels} level${g.levels === 1 ? '' : 's'} · ${g.template === 'topdown' ? 'Top-down' : 'Side view'}</small></div></button>`;
$('q').oninput = () => { clearTimeout(galleryT); galleryT = setTimeout(loadGallery, 300); };
$('sort').onchange = loadGallery; $('refresh').onclick = loadGallery;
document.addEventListener('click', e => { const c = e.target.closest('[data-gid]'); if (c) openGame(c.dataset.gid); });
async function openGame(id) {
  let r; try { r = await api('game/' + id); } catch (e) { return toast(e.message); }
  const g = r.game;
  dialog(`<div class="detail-th" style="${g.thumb ? `background-image:url(${g.thumb})` : ''}"></div><h2>${esc(g.title)}</h2><p>by ${esc(g.author)} · ${g.levels} level${g.levels === 1 ? '' : 's'} · ▶ ${g.plays} plays${g.remixOf ? ' · remix' : ''}</p>${g.desc ? `<p style="color:var(--txt)">${esc(g.desc)}</p>` : ''}
    <div class="row"><button class="pri" id="gPlay">▶ Play</button><button id="gRace">🏁 Race friends online</button><button id="gLike">${g.liked ? '❤️' : '🤍'} ${g.likes}</button><button id="gRemix">🔁 Remix</button><button id="gShare">🔗 Link</button></div>
    ${g.mine || (me && me.admin) ? `<div class="row">${g.mine ? '<button id="gEdit">✏️ Edit</button>' : ''}<button id="gDel" class="warn">🗑 Delete</button></div>` : ''}
    <h4 style="margin:14px 0 2px">🏆 Fastest times</h4>${board(r.scores)}
    <div class="row"><span class="sp"></span><button id="gX">Close</button></div>`);
  $('gX').onclick = closeDialog;
  $('gPlay').onclick = () => { closeDialog(); startPlay(g.data, { published: { id: g.id, title: g.title }, mine: g.mine }); };
  $('gRace').onclick = () => { closeDialog(); hostRace(g); };
  $('gLike').onclick = async () => { if (!me && !(await signIn())) return; try { const x = await api('like/' + g.id, { method: 'POST', body: '{}' }); g.liked = x.liked; g.likes = x.likes; $('gLike').textContent = `${x.liked ? '❤️' : '🤍'} ${x.likes}`; } catch (e) { toast(e.message); } };
  $('gRemix').onclick = () => { const d = loadDrafts(); draftId = uid(); game = JSON.parse(JSON.stringify(g.data)); game.title = (g.title + ' (remix)').slice(0, 60); d[draftId] = { data: game, updated: Date.now(), remixOf: g.id }; saveDrafts(d); li = 0; closeDialog(); renderEditor(); show('create'); toast('Remix copied to your drafts'); };
  $('gShare').onclick = () => { const link = location.origin + location.pathname + '?play=' + g.id; (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copied'), () => prompt('Share this link', link)); };
  if ($('gEdit')) $('gEdit').onclick = () => { const d = loadDrafts(); let id = Object.keys(d).find(k => d[k].pubId === g.id); if (!id) { id = uid(); d[id] = { data: g.data, pubId: g.id, desc: g.desc, updated: Date.now() }; saveDrafts(d); } closeDialog(); openDraft(id); };
  if ($('gDel')) $('gDel').onclick = async () => { if (!confirm('Delete this game for everyone?')) return; try { await api('game/' + g.id, { method: 'DELETE' }); closeDialog(); loadGallery(); renderMine(); toast('Deleted'); } catch (e) { toast(e.message); } };
}

/* ---------------- my games ---------------- */
async function renderMine() {
  const d = loadDrafts(), ids = Object.keys(d).sort((a, b) => (d[b].updated || 0) - (d[a].updated || 0));
  $('drafts').innerHTML = ids.length ? ids.map(id => { const x = d[id]; return `<div class="gcard"><div class="th" style="background-image:url(${thumbCache(id, x.data)})"></div><div class="meta"><b>${esc(x.data.title || 'Untitled')}</b><small>${x.data.levels.length} level${x.data.levels.length === 1 ? '' : 's'} · ${x.pubId ? '🌐 published' : 'not published'}</small><div class="row" style="margin-top:6px"><button data-open="${id}">✏️ Edit</button><button data-dl="${id}" title="Export file">⬇</button><button data-rm="${id}" title="Delete draft">🗑</button></div></div></div>`; }).join('') : '<div class="empty">No drafts yet.</div>';
  try { const r = await api('list?mine=1'); $('published').innerHTML = r.games.length ? r.games.map(card).join('') : `<div class="empty">${me ? 'You have not published anything yet.' : 'Sign in to see your published games.'}</div>`; }
  catch { $('published').innerHTML = `<div class="empty">Publishing needs the SanjivramOS server.</div>`; }
}
const thumbs = new Map();
function thumbCache(id, data) { const k = id + JSON.stringify(data.levels[0]).length; if (!thumbs.has(k)) thumbs.set(k, thumbnail(data)); return thumbs.get(k); }
$('drafts').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'), dl = e.target.closest('[data-dl]'), rm = e.target.closest('[data-rm]');
  if (o) openDraft(o.dataset.open);
  if (dl) { const d = loadDrafts()[dl.dataset.dl]; exportGame(d.data); }
  if (rm && confirm('Delete this draft from this device? (Published copies stay online.)')) { const d = loadDrafts(); delete d[rm.dataset.rm]; saveDrafts(d); if (draftId === rm.dataset.rm) newDraft(); renderMine(); }
});
function exportGame(data = game) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = (data.title || 'game').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') + '.sjgame.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const data = JSON.parse(await f.text()); if (!Array.isArray(data.levels) || !data.levels.length) throw 0; const d = loadDrafts(), id = uid(); d[id] = { data, updated: Date.now() }; saveDrafts(d); openDraft(id); toast('Imported'); }
  catch { toast('That file is not a Game Maker game.'); }
  e.target.value = '';
};
$('newGame').onclick = newGameDialog;
function newGameDialog() {
  dialog(`<h2>New game</h2><p>Pick a starting point — you can change everything later.</p>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
      <button class="gcard" data-new="platformer:1"><div class="th">🏃</div><div class="meta"><b>Side-view example</b><small>Jump, coins, enemies, 2 levels</small></div></button>
      <button class="gcard" data-new="topdown:1"><div class="th">🗺️</div><div class="meta"><b>Top-down example</b><small>Keys, doors, shooting</small></div></button>
      <button class="gcard" data-new="platformer:0"><div class="th">⬜</div><div class="meta"><b>Blank side view</b><small>Just ground</small></div></button>
      <button class="gcard" data-new="3d:1"><div class="th">🧊</div><div class="meta"><b>3D example</b><small>Jump, keys, lava, a castle</small></div></button>
      <button class="gcard" data-new="claude:1"><div class="th">🤖</div><div class="meta"><b>Ask Claude</b><small>Describe it, Claude builds it</small></div></button>
      <button class="gcard" data-new="topdown:0"><div class="th">🔲</div><div class="meta"><b>Blank top-down</b><small>Just walls</small></div></button>
    </div><div class="row"><span class="sp"></span><button id="nX">Cancel</button></div>`);
  $('nX').onclick = closeDialog;
  $('dlgCard').querySelectorAll('[data-new]').forEach(b => b.onclick = e => { e.stopPropagation(); const [t, ex] = b.dataset.new.split(':'); closeDialog(); if (t === 'claude') { show('create'); claudeDialog('new'); return; } newDraft(t, ex === '1'); show('create'); });
}

/* ---------------- online races ---------------- */
// Host opens a room for a published game; everyone plays it at the same time and sees the others as ghosts.
async function hostRace(g) { return race({ gid: g.id, title: g.title }); }
$('raceJoin').onclick = () => race(null);
async function race(pick) {
  if (!window.SJNet) return toast('Online races need the SanjivramOS server.');
  let net;
  if (pick && pick.data && JSON.stringify(pick.data).length > 30000) return toast('This game is too big to send — publish it first, then host it from Play games.');
  try { net = await SJNet.lobby({ game: 'maker', gameName: 'Game Maker', max: 8, min: 2, modes: ['Race', 'Together'], settings: pick ? (pick.gid ? { gid: pick.gid, title: pick.title } : { inline: 1, title: pick.title }) : undefined, title: pick ? `Online: ${pick.title}` : 'Game Maker — play online' }); }
  catch { return; }
  const st = net.room.settings || {}, together = /together/i.test(net.room.mode || '');
  let data;
  if (st.gid) { try { data = (await api('game/' + st.gid)).game; } catch (e) { toast(e.message); net.leave(); return; } }
  else if (st.inline) {
    // the host sends the game itself to everyone (works for unpublished drafts)
    if (net.isHost && pick && pick.data) { const gd = pick.data; net.on('m', (d, from) => { if (d && d.need) net.send({ gd }, from); }); data = { id: null, title: pick.title, data: gd }; }
    else data = await new Promise(res => { let n = 0; const h = d => { if (d && d.gd) { clearInterval(t); res({ id: null, title: st.title || 'Game', data: d.gd }); } }; net.on('m', h); const ask = () => { if (n++ > 12) { clearInterval(t); res(null); } else net.send({ need: 1 }); }; const t = setInterval(ask, 1200); ask(); });
    if (!data) { toast('The host didn’t send the game. Try again.'); net.leave(); return; }
  } else { toast('That room has no game picked.'); net.leave(); return; }
  const others = new Map(), results = new Map(), COLS = ['#f472b6', '#38bdf8', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf', '#fb7185', '#facc15'];
  let lastSend = 0, myDone = null;
  const name = id => { const m = net.room.members.find(x => x.id === id); return m ? m.display : '?'; };
  const look = id => { const m = net.room.members.find(x => x.id === id); return m && m.look || null; };
  const raceCtx = {
    pos(p) {
      const now = performance.now(); if (now - lastSend < 90) return; lastSend = now;
      if (net.isHost) { others.set(net.me.id, { ...p, name: net.me.display }); net.send({ ps: [...others].map(([id, v]) => [id, v.l, v.x, v.y, v.f, v.z, v.d3 ? 1 : 0]) }); }
      else net.send({ p: [p.l, p.x, p.y, p.f, p.z, p.d3 ? 1 : 0] });
    },
    ghosts() { return [...others].filter(([id]) => id !== net.me.id).map(([id, v]) => ({ ...v, name: name(id), look: look(id) })); },
    together,
    finish(ms) { if (together) return; myDone = ms; if (net.isHost) { results.set(net.me.id, ms); shareResults(); } else net.send({ done: ms }); },
    leave() { try { net.leave(); } catch {} },
  };
  const shareResults = () => { net.send({ res: [...results] }); showResults(); };
  function showResults() {
    const rows = [...results].sort((a, b) => (a[1] == null) - (b[1] == null) || a[1] - b[1]);
    $('ghostList').innerHTML = '🏁 ' + rows.map(([id, ms], i) => `${i + 1}. ${esc(name(id))} ${ms == null ? 'DNF' : (ms / 1000).toFixed(2) + 's'}`).join('<br>');
  }
  net.on('m', (d, from) => {
    if (net.isHost && d.p) { const o = others.get(from); others.set(from, { l: d.p[0], x: d.p[1], y: d.p[2], f: d.p[3], z: d.p[4], d3: !!d.p[5], moving: o ? Math.hypot(o.x - d.p[1], (o.z || 0) - (d.p[4] || 0)) > 0.02 : false }); }
    if (!net.isHost && d.ps) for (const [id, l, x, y, f, z, d3] of d.ps) { const o = others.get(id); others.set(id, { l, x, y, f, z, d3: !!d3, moving: o ? Math.hypot(o.x - x, (o.z || 0) - (z || 0)) > 0.02 : false }); }
    if (net.isHost && d.done !== undefined) { results.set(from, d.done); shareResults(); }
    if (!net.isHost && d.res) { results.clear(); for (const [id, ms] of d.res) results.set(id, ms); showResults(); }
  });
  net.on('peer-left', d => { if (d && d.id) others.delete(d.id); });
  startPlay(data.data, { published: { id: data.id, title: data.title }, race: raceCtx });
  $('ghostList').textContent = together ? `🌐 Playing together · ${net.players().length} players` : `Racing ${net.players().length} players`;
}

/* ---------------- Claude: describe a game or a change, Claude builds it ---------------- */
const TILE_LIST = () => Object.entries(E.TILES).map(([c, [n, , h]]) => `${c} = ${n} (${h})`).join('\n');
const CLAUDE_RULES = () => `You design levels for the SanjivramOS Game Maker, a kids' game creation tool. Each level is a grid of single characters:
${TILE_LIST()}

Game types:
- "platformer": side view with gravity. Rows go top to bottom. The bottom 2 rows are mostly ground '#', with gaps of lava 'L' or spikes 'S' to jump over. '.' is air. Jumps must be possible: gaps up to 3 tiles wide, steps up to 2 tiles high. Use '-' ledges, 'J' springs and 'X' checkpoints.
- "topdown": seen from above. Surround the level with walls '#'. '.' is floor. Use keys 'K' with locked doors 'D', enemies 'E'/'F', turrets 'Z', teleporters 'T' (always in pairs).
- "3d": seen from above, played in 3D. '.' is floor you walk on, 'O' is a hole you fall into — surround the whole level with 'O' and use 'O' gaps (1-2 tiles) to jump across. '#' is a 1-high block you can jump onto, '=' is a tall wall, '-' a raised ledge, 'J' a spring, 'F' a moving lift, 'E' a spinning bar, 'Z' a laser fence, 'L' lava, 'K'/'D' keys and doors.

Rules: every level has exactly one 'P' (player start) and, unless the win setting is "coins", one 'G' (goal flag) reachable from P. All rows in a level have exactly the same length. Width 20–60, height 10–20 (platformer height 12–16). Put coins 'C' along the route and a few hearts 'H'. Make it fun, fair and a little surprising. The first level should have a sign 'N' with a short friendly hint.
Answer with ONLY JSON — no explanation, no code fences.`;
const NEW_FORMAT = `{"title":"…","template":"platformer|topdown|3d","settings":{"win":"goal|coins","lives":1|3|5|0,"theme":0-7 (0 sunny,1 sunset,2 night,3 cave,4 space,5 candy,6 forest,7 snow),"speed":1|2|3,"jump":1|2|3,"doubleJump":true|false,"shoot":true|false,"timer":0|30|60|120},"levels":[{"rows":["…","…"],"signs":[{"x":0,"y":0,"text":"…"}]}]}`;
async function askClaude(prompt, system, model) {
  const r = await fetch(location.origin + '/linux-app/claude-ask', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, system, model }) });
  const j = await r.json().catch(() => ({ error: 'Claude sent back something unexpected.' }));
  if (!r.ok) throw new Error(j.error || 'Claude isn’t available right now.');
  return j.text || '';
}
function parseJson(text) { const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b <= a) throw new Error('Claude didn’t send a game back. Try describing it differently.'); return JSON.parse(text.slice(a, b + 1)); }
const TILE_OK = new Set(Object.keys(E.TILES));
/** turn Claude's rows into a valid level (fixes sizes, unknown characters, missing start / goal) */
function cleanLevel(lv, template, win) {
  let rows = (Array.isArray(lv.rows) ? lv.rows : []).map(r => String(r)).filter(r => r.length).slice(0, 60);
  if (rows.length < 6) throw new Error('A level came back too small.');
  const fill = template === '3d' ? 'O' : template === 'topdown' ? '#' : '.';
  const w = Math.max(8, Math.min(200, Math.max(...rows.map(r => r.length))));
  rows = rows.map(r => [...r.slice(0, w).padEnd(w, fill)].map(c => TILE_OK.has(c) && (c !== 'O' || template === '3d') ? c : c === ' ' ? '.' : '.').join(''));
  let tiles = rows.join(''); const h = rows.length;
  const firstP = tiles.indexOf('P'); if (firstP < 0) { const spot = tiles.indexOf('.'); tiles = tiles.slice(0, spot) + 'P' + tiles.slice(spot + 1); } else tiles = tiles.slice(0, firstP + 1) + tiles.slice(firstP + 1).replace(/P/g, '.');
  if (win !== 'coins' && !tiles.includes('G')) { const spot = tiles.lastIndexOf('.'); tiles = tiles.slice(0, spot) + 'G' + tiles.slice(spot + 1); }
  const signs = {}; for (const sg of Array.isArray(lv.signs) ? lv.signs : []) { const i = (+sg.y) * w + (+sg.x); if (i >= 0 && i < tiles.length && tiles[i] === 'N' && sg.text) signs[i] = String(sg.text).slice(0, 200); }
  // signs without text get a friendly default
  [...tiles].forEach((c, i) => { if (c === 'N' && !signs[i]) signs[i] = 'Have fun!'; });
  return { w, h, tiles, signs };
}
function cleanGame(j, forceTemplate) {
  const template = forceTemplate || (['platformer', 'topdown', '3d'].includes(j.template) ? j.template : 'platformer');
  const st = { ...E.DEFAULT_SETTINGS }, js = j.settings || {};
  if (['goal', 'coins'].includes(js.win)) st.win = js.win;
  for (const [k, ok] of [['lives', [0, 1, 3, 5]], ['speed', [1, 2, 3]], ['jump', [1, 2, 3]], ['timer', [0, 30, 60, 120]], ['enemySpeed', [1, 2, 3]]]) if (ok.includes(+js[k])) st[k] = +js[k];
  if (+js.theme >= 0 && +js.theme < E.THEMES.length) st.theme = +js.theme;
  for (const k of ['doubleJump', 'shoot']) if (typeof js[k] === 'boolean') st[k] = js[k];
  if (template !== 'platformer') st.stomp = false;
  const levels = (Array.isArray(j.levels) ? j.levels : []).slice(0, 10).map(lv => cleanLevel(lv, template, st.win));
  if (!levels.length) throw new Error('Claude’s game had no levels.');
  return { v: 1, title: String(j.title || 'Claude’s game').slice(0, 60), template, settings: st, sprites: {}, levels };
}
function levelRows(lv) { const rows = []; for (let y = 0; y < lv.h; y++) rows.push(lv.tiles.slice(y * lv.w, (y + 1) * lv.w)); return rows; }
function claudeDialog(tab = 'new') {
  const pref = (() => { try { return localStorage.getItem('maker.claudeModel') || 'sonnet'; } catch { return 'sonnet'; } })();
  dialog(`<h2>🤖 Claude — your game-making helper</h2>
    <div class="seg" id="cTabs">${[['new', '✨ Make a new game'], ['edit', '✏️ Change this level'], ['ideas', '💡 Ideas & help']].map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <textarea id="cAsk" rows="4" maxlength="1500" style="width:100%;margin-top:10px;font:inherit;padding:10px;border-radius:10px;box-sizing:border-box" placeholder=""></textarea>
    <div class="row" id="cNewOpts" style="flex-wrap:wrap;gap:8px;margin-top:6px"><label>Type <select id="cType"><option value="">Claude picks</option><option value="platformer">🏃 Side view</option><option value="topdown">🗺️ Top-down</option><option value="3d">🧊 3D</option></select></label><label>Levels <select id="cLv"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label></div>
    <div class="row" style="gap:8px;margin-top:6px"><label>Claude <select id="cModel"><option value="sonnet" ${pref === 'sonnet' ? 'selected' : ''}>Smart (better levels)</option><option value="haiku" ${pref === 'haiku' ? 'selected' : ''}>Fast</option></select></label></div>
    <div id="cOut" style="white-space:pre-wrap;max-height:40vh;overflow:auto;margin-top:10px;line-height:1.5"></div>
    <div class="row"><span id="cStatus" style="opacity:.8"></span><span class="sp"></span><button id="cX">Close</button><button id="cGo" class="pri">Ask Claude</button></div>`);
  const ask = $('cAsk'), tabs = $('cTabs');
  const PH = { new: 'Describe your game… e.g. "A spooky castle with 3 levels, keys and doors, lots of lava and a secret room full of coins"', edit: 'What should change on this level? e.g. "make it harder with more spikes and a moving lift over a big gap"', ideas: 'Ask anything… e.g. "how can I make my level more fun?" or "give me 5 ideas for a 3D obby"' };
  const setTab = t => { tab = t; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); ask.placeholder = PH[t]; $('cNewOpts').style.display = t === 'new' ? '' : 'none'; $('cGo').textContent = t === 'ideas' ? 'Ask Claude' : t === 'new' ? 'Build it' : 'Change it'; $('cOut').textContent = ''; };
  tabs.onclick = e => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
  setTab(tab); setTimeout(() => ask.focus(), 50);
  $('cX').onclick = closeDialog;
  $('cGo').onclick = async () => {
    const text = ask.value.trim(); if (!text) { ask.focus(); return; }
    const model = $('cModel').value; try { localStorage.setItem('maker.claudeModel', model); } catch {}
    $('cGo').disabled = true; $('cStatus').textContent = '🤖 Claude is thinking… (this can take up to a minute)'; $('cOut').textContent = '';
    try {
      if (tab === 'ideas') {
        const ctxt = `The user is making a ${game.template === '3d' ? '3D' : game.template === 'topdown' ? 'top-down' : 'side-view'} game called "${game.title}" with ${game.levels.length} level(s). Current level:\n${levelRows(L()).join('\n')}\n\nTheir question: ${text}`;
        $('cOut').textContent = await askClaude(ctxt, 'You are a friendly game-design helper inside the SanjivramOS Game Maker (a kids\' level editor). Tiles:\n' + TILE_LIST() + '\nAnswer briefly and concretely in plain text (no JSON, no markdown headings).', model);
        $('cStatus').textContent = '';
      } else if (tab === 'new') {
        const t = $('cType').value, n = +$('cLv').value;
        const j = parseJson(await askClaude(`Make a complete game: ${text}\nNumber of levels: ${n}.${t ? ` Game type: "${t}".` : ' Pick the best game type.'}\nReply in exactly this JSON shape:\n${NEW_FORMAT}`, CLAUDE_RULES(), model));
        const g = cleanGame(j, t || null);
        draftId = uid(); game = g; li = 0; undo = []; redo = []; persist(); renderEditor();
        closeDialog(); toast(`🤖 Claude built “${g.title}” — ${g.levels.length} level${g.levels.length > 1 ? 's' : ''}. Press ▶ to play it!`); sfx('power');
      } else {
        const cur = L(), rows = levelRows(cur), signs = Object.entries(cur.signs || {}).map(([i, tx]) => ({ x: i % cur.w, y: Math.floor(i / cur.w), text: tx }));
        const j = parseJson(await askClaude(`This is a "${game.template}" level (win: ${game.settings.win}):\n${JSON.stringify({ rows, signs })}\n\nChange it like this: ${text}\nKeep what already works unless asked. Reply in exactly this JSON shape: {"rows":["…"],"signs":[{"x":0,"y":0,"text":"…"}]}`, CLAUDE_RULES(), model));
        const lv = cleanLevel(j, game.template, game.settings.win);
        snapshot(); game.levels[li] = lv; persist(); renderLevels(); drawEditor();
        closeDialog(); toast('🤖 Level changed — press ↶ to undo if you don’t like it.'); sfx('power');
      }
    } catch (e) { $('cStatus').textContent = '⚠️ ' + e.message; }
    finally { const b = $('cGo'); if (b) b.disabled = false; }
  };
}

$('aiBtn').onclick = () => claudeDialog(game && game.levels.length ? 'edit' : 'new');
$('onlineBtn').onclick = () => { game.title = $('title').value || game.title; race({ data: JSON.parse(JSON.stringify(game)), title: game.title || 'My game' }); };
$('fsPlay').onclick = async () => {
  const el = document.documentElement;
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await el.requestFullscreen(); }
  catch { if (window.parent !== window) window.parent.postMessage({ sjg: 1, type: 'fullscreen' }, location.origin); }
};

/* ---------------- start ---------------- */
$('mute').onclick = () => { const m = kit ? kit.mute() : true; $('mute').textContent = m ? '🔇' : '🔊'; };
if (kit && kit.muted) $('mute').textContent = '🔇';
const q = new URLSearchParams(location.search);
const lastId = (() => { try { return localStorage.getItem('maker.last'); } catch { return null; } })();
if (lastId && loadDrafts()[lastId]) { draftId = lastId; game = loadDrafts()[lastId].data; renderEditor(); } else newDraft('platformer', true);
refreshMe().then(() => {
  if (q.get('play')) api('game/' + q.get('play')).then(r => startPlay(r.game.data, { published: { id: r.game.id, title: r.game.title }, mine: r.game.mine })).catch(e => toast(e.message));
  if (q.get('join')) race(null);
});
if (q.get('view')) show(q.get('view'));
window.__maker = () => ({ cleanGame, cleanLevel, claudeDialog, race, get game() { return game; }, get runner() { return runner; }, setCell, newDraft, startPlay, api, refreshMe, loadDrafts, get me() { return me; }, show, openGame });
})();
