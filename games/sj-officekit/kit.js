/* SanjivramOS Office kit — shared by Write, Sheets and Present.
   ZIP read/write (for .docx/.xlsx/.pptx), a small document library in localStorage, and UI helpers. */
(() => {
'use strict';
const K = window.Kit = {};
const enc = new TextEncoder(), dec = new TextDecoder();
K.enc = s => enc.encode(s);
K.dec = b => dec.decode(b);
K.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// XML text: also drop characters XML 1.0 forbids (Office refuses the file otherwise)
K.x = s => K.esc(String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')).replace(/'/g, '&apos;');
K.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
K.$ = (s, r = document) => r.querySelector(s);
K.$$ = (s, r = document) => [...r.querySelectorAll(s)];
K.h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// ---------- ZIP ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
K.crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const canDeflate = typeof CompressionStream !== 'undefined';
// files: [[name, string|Uint8Array], ...] in order. Returns a Blob.
K.zip = async (files, mime = 'application/zip') => {
  const parts = [], central = []; let off = 0;
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)), dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());
  for (const [name, data] of files) {
    const raw = typeof data === 'string' ? K.enc(data) : data, nm = K.enc(name), crc = K.crc32(raw);
    let body = raw, method = 0;
    if (canDeflate && raw.length > 256 && !/\.(png|jpe?g|gif|webp)$/i.test(name)) { try { const c = await pipe(raw, new CompressionStream('deflate-raw')); if (c.length < raw.length) { body = c; method = 8; } } catch {} }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(lh.buffer), nm, body); central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + body.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: mime });
};
// Returns Map(name -> Uint8Array)
K.unzip = async buf => {
  const u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset, u.byteLength), out = new Map();
  let e = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This isn’t a valid Office file (no ZIP directory found).');
  const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = K.dec(u.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), data = u.subarray(ds, ds + cs);
    if (!name.endsWith('/')) {
      if (method === 0) out.set(name, data.slice());
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unpack compressed files. Try a newer Chrome.');
        out.set(name, await pipe(data, new DecompressionStream('deflate-raw')));
      }
    }
    p += 46 + nl + xl + cl;
  }
  return out;
};
K.xml = s => new DOMParser().parseFromString(typeof s === 'string' ? s : K.dec(s), 'application/xml');
// namespace-agnostic element helpers for OOXML
K.kids = (el, local) => el ? [...el.children].filter(c => c.localName === local) : [];
K.kid = (el, local) => K.kids(el, local)[0] || null;
K.all = (el, local) => el ? [...el.getElementsByTagNameNS('*', local)] : [];
K.attr = (el, name) => { if (!el) return null; for (const a of el.attributes) if (a.localName === name) return a.value; return null; };
K.rid = el => el ? el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || K.attr(el, 'id') : null;
K.rels = (files, path) => {
  const m = {}, f = files.get(path); if (!f) return m;
  K.all(K.xml(f), 'Relationship').forEach(r => { m[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '', mode: r.getAttribute('TargetMode') }; });
  return m;
};
K.resolve = (base, target) => { if (target.startsWith('/')) return target.slice(1); const p = base.split('/'); p.pop(); for (const s of target.split('/')) { if (s === '..') p.pop(); else if (s !== '.') p.push(s); } return p.join('/'); };
K.b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
K.fromDataUrl = url => { const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url || ''); if (!m) return null; const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return { mime: m[1], data: u, ext: ({ 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'png', 'image/svg+xml': 'png' })[m[1]] || 'png' }; };
K.mimeOf = name => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' })[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';
// webp/svg aren't allowed in older Office: re-encode to PNG
K.toPng = url => new Promise(res => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth || 300; c.height = i.naturalHeight || 150; c.getContext('2d').drawImage(i, 0, 0); res({ url: c.toDataURL('image/png'), w: c.width, h: c.height }); }; i.onerror = () => res(null); i.src = url; });
K.imgSize = url => new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 300, h: 200 }); i.src = url; });
K.officeImage = async url => { let d = K.fromDataUrl(url); if (!d) return null; if (!/png|jpeg|gif/.test(d.mime)) { const p = await K.toPng(url); if (!p) return null; d = K.fromDataUrl(p.url); } return d; };

// ---------- files ----------
K.download = (blob, name) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  K.toast('Saved ' + name + ' to Downloads');
};
K.pick = accept => new Promise(res => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
  i.onchange = () => { res(i.files[0] || null); i.remove(); }; document.body.appendChild(i); i.click();
});
K.readAs = (file, how) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r[how](file); });
K.safeName = s => (String(s || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled').slice(0, 80);

// ---------- document library (localStorage) ----------
K.Library = class {
  constructor(app) { this.key = 'sjoffice.' + app; }
  list() { try { return JSON.parse(localStorage.getItem(this.key + '.index') || '[]'); } catch { return []; } }
  load(id) { try { return JSON.parse(localStorage.getItem(this.key + '.doc.' + id)); } catch { return null; } }
  save(id, name, data, extra = {}) {
    try { localStorage.setItem(this.key + '.doc.' + id, JSON.stringify(data)); }
    catch { K.toast('Storage is full — export this file to keep it', 4000); return false; }
    const l = this.list().filter(d => d.id !== id); l.unshift({ id, name, updated: Date.now(), ...extra });
    localStorage.setItem(this.key + '.index', JSON.stringify(l)); return true;
  }
  remove(id) { localStorage.removeItem(this.key + '.doc.' + id); localStorage.setItem(this.key + '.index', JSON.stringify(this.list().filter(d => d.id !== id))); }
  rename(id, name) { const l = this.list(); const d = l.find(x => x.id === id); if (d) { d.name = name; localStorage.setItem(this.key + '.index', JSON.stringify(l)); } }
};
K.when = t => { const d = Date.now() - t; if (d < 60e3) return 'just now'; if (d < 3600e3) return Math.round(d / 60e3) + ' min ago'; if (d < 86400e3) return Math.round(d / 3600e3) + ' h ago'; return new Date(t).toLocaleDateString(); };

// ---------- UI ----------
K.toast = (msg, ms = 2200) => {
  let t = K.$('.k-toast'); if (!t) { t = K.h('<div class="k-toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms);
};
// Simple dropdown menus: K.menu(button, [{label, hint, act, sep, checked}])
K.menu = (anchor, items) => {
  K.closeMenu();
  const m = K.h('<div class="k-menu" role="menu"></div>');
  items.forEach(it => {
    if (it === '-') return m.appendChild(K.h('<div class="k-sep"></div>'));
    const b = K.h(`<button class="k-mi${it.disabled ? ' dis' : ''}"><span class="k-ck">${it.checked ? '✓' : ''}</span><span>${K.esc(it.label)}</span><kbd>${K.esc(it.hint || '')}</kbd></button>`);
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { K.closeMenu(); if (!it.disabled) it.act(); }; m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = K.clamp(r.left, 4, innerWidth - mw - 4) + 'px';
  m.style.top = (r.bottom + mh + 4 > innerHeight ? Math.max(4, r.top - mh - 2) : r.bottom + 2) + 'px';
  setTimeout(() => document.addEventListener('mousedown', K._mclose = e => { if (!m.contains(e.target)) K.closeMenu(); }, true), 0);
};
K.closeMenu = () => { K.$$('.k-menu').forEach(m => m.remove()); if (K._mclose) document.removeEventListener('mousedown', K._mclose, true); K._mclose = null; };
// Modal dialog. fields: [{id, label, type, value, options}] → Promise(values|null)
K.dialog = (title, fields = [], { ok = 'OK', cancel = 'Cancel', html = '' } = {}) => new Promise(res => {
  const d = K.h(`<div class="k-modal"><form class="k-dlg"><h3>${K.esc(title)}</h3>${html}${fields.map(f => `<label>${K.esc(f.label || '')}${
    f.type === 'select' ? `<select name="${f.id}">${f.options.map(o => `<option value="${K.esc(o[0])}"${o[0] == f.value ? ' selected' : ''}>${K.esc(o[1])}</option>`).join('')}</select>`
    : f.type === 'textarea' ? `<textarea name="${f.id}" rows="4">${K.esc(f.value || '')}</textarea>`
    : `<input name="${f.id}" type="${f.type || 'text'}" value="${K.esc(f.value == null ? '' : f.value)}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}>`}</label>`).join('')}
    <div class="k-btns">${cancel ? `<button type="button" class="k-btn" data-c>${K.esc(cancel)}</button>` : ''}<button class="k-btn pri">${K.esc(ok)}</button></div></form></div>`);
  document.body.appendChild(d);
  const f = K.$('form', d), first = K.$('input,select,textarea', f); if (first) { first.focus(); if (first.select) first.select(); }
  const done = v => { d.remove(); res(v); };
  f.onsubmit = e => { e.preventDefault(); const v = {}; fields.forEach(x => v[x.id] = f.elements[x.id].value); done(v); };
  const c = K.$('[data-c]', f); if (c) c.onclick = () => done(null);
  d.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
  d.onmousedown = e => { if (e.target === d) done(null); };
});
K.confirm = (title, text, ok = 'OK') => K.dialog(title, [], { ok, html: `<p>${K.esc(text)}</p>` }).then(v => !!v);

// Home screen: recent documents + templates
K.home = ({ el, title, accent, lib, templates, onOpen, onNew, onImport, importLabel }) => {
  const render = () => {
    const docs = lib.list();
    el.innerHTML = `<div class="k-home"><div class="k-hhead" style="--acc:${accent}"><h1>${K.esc(title)}</h1><button class="k-btn pri" data-imp>${K.esc(importLabel)}</button></div>
      <h2>New</h2><div class="k-tpls">${templates.map((t, i) => `<button class="k-tpl" data-tpl="${i}"><div class="k-tprev">${t.preview || ''}</div><span>${K.esc(t.name)}</span></button>`).join('')}</div>
      <h2>Recent</h2>${docs.length ? `<div class="k-docs">${docs.map(d => `<div class="k-doc" data-id="${d.id}"><button class="k-dopen"><b>${K.esc(d.name)}</b><small>${K.when(d.updated)}</small></button><button class="k-dmore" title="More" data-m="${d.id}">⋯</button></div>`).join('')}</div>` : '<p class="k-empty">Nothing here yet. Pick a template above, or open a file.</p>'}
      <p class="k-foot">Saved in this browser automatically. Use <b>File → Save as…</b> to get a real file you can share.</p></div>`;
    K.$$('[data-tpl]', el).forEach(b => b.onclick = () => onNew(templates[+b.dataset.tpl]));
    K.$$('.k-dopen', el).forEach(b => b.onclick = () => onOpen(b.parentNode.dataset.id));
    K.$('[data-imp]', el).onclick = onImport;
    K.$$('[data-m]', el).forEach(b => b.onclick = () => {
      const id = b.dataset.m, d = lib.list().find(x => x.id === id);
      K.menu(b, [
        { label: 'Open', act: () => onOpen(id) },
        { label: 'Rename…', act: async () => { const v = await K.dialog('Rename', [{ id: 'n', label: 'Name', value: d.name }]); if (v && v.n.trim()) { lib.rename(id, v.n.trim()); const doc = lib.load(id); if (doc) { doc.name = v.n.trim(); lib.save(id, doc.name, doc); } render(); } } },
        { label: 'Make a copy', act: () => { const doc = lib.load(id); if (doc) { const nid = K.uid(); doc.name = d.name + ' (copy)'; lib.save(nid, doc.name, doc); render(); } } },
        '-',
        { label: 'Delete', act: async () => { if (await K.confirm('Delete “' + d.name + '”?', 'This can’t be undone.', 'Delete')) { lib.remove(id); render(); } } }
      ]);
    });
  };
  render(); return render;
};

// Shared styles
document.head.appendChild(K.h(`<style>
:root{--k-bg:#f3f4f6;--k-panel:#fff;--k-line:#d9dce1;--k-text:#1f2328;--k-sub:#5f6773;--k-hover:#eceef1;--k-acc:#2563eb}
@media (prefers-color-scheme:dark){:root{--k-bg:#1b1d21;--k-panel:#25282d;--k-line:#3a3e45;--k-text:#e8eaed;--k-sub:#9aa1ab;--k-hover:#30343a}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--k-bg);color:var(--k-text);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button{font:inherit;color:inherit}
.k-btn{border:1px solid var(--k-line);background:var(--k-panel);border-radius:8px;padding:7px 14px;cursor:pointer}
.k-btn:hover{background:var(--k-hover)}
.k-btn.pri{background:var(--k-acc);border-color:var(--k-acc);color:#fff}
.k-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);background:#222;color:#fff;padding:9px 16px;border-radius:10px;opacity:0;transition:.2s;pointer-events:none;z-index:99;max-width:90vw;font-size:13px}
.k-toast.on{opacity:.95;transform:translate(-50%,0)}
.k-menu{position:fixed;z-index:90;min-width:210px;max-height:80vh;overflow:auto;background:var(--k-panel);border:1px solid var(--k-line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:5px}
.k-mi{display:flex;width:100%;align-items:center;gap:8px;border:none;background:none;padding:7px 10px;border-radius:6px;cursor:pointer;text-align:left}
.k-mi:hover{background:var(--k-hover)} .k-mi.dis{opacity:.45;cursor:default}
.k-mi .k-ck{width:14px;color:var(--k-acc)} .k-mi span:nth-child(2){flex:1} .k-mi kbd{font:12px system-ui;color:var(--k-sub)}
.k-sep{height:1px;background:var(--k-line);margin:4px 2px}
.k-modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:95;padding:16px}
.k-dlg{background:var(--k-panel);border-radius:14px;padding:18px 20px;min-width:min(340px,92vw);max-width:94vw;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.k-dlg h3{margin:0 0 12px;font-size:17px} .k-dlg p{color:var(--k-sub);margin:0 0 12px}
.k-dlg label{display:block;margin:0 0 10px;font-size:13px;color:var(--k-sub)}
.k-dlg input,.k-dlg select,.k-dlg textarea{display:block;width:100%;margin-top:4px;font:inherit;padding:8px 10px;border:1px solid var(--k-line);border-radius:8px;background:var(--k-bg);color:var(--k-text)}
.k-dlg input[type=color]{height:38px;padding:3px}
.k-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.k-home{max-width:980px;margin:0 auto;padding:18px 22px 40px;height:100%;overflow:auto}
.k-hhead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0 10px;border-bottom:3px solid var(--acc)}
.k-hhead h1{margin:0;font-size:24px}
.k-home h2{font-size:14px;color:var(--k-sub);margin:20px 0 10px;font-weight:600}
.k-tpls{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.k-tpl{border:none;background:none;padding:0;cursor:pointer;text-align:left}
.k-tprev{aspect-ratio:var(--tp-ar,0.77);border:1px solid var(--k-line);border-radius:8px;background:#fff;overflow:hidden;position:relative;transition:.15s;color:#222}
.k-tpl:hover .k-tprev{border-color:var(--k-acc);box-shadow:0 0 0 2px var(--k-acc)}
.k-tpl span{display:block;margin-top:6px;font-size:13px}
.k-docs{display:flex;flex-direction:column;border:1px solid var(--k-line);border-radius:10px;overflow:hidden;background:var(--k-panel)}
.k-doc{display:flex;align-items:center;border-bottom:1px solid var(--k-line)} .k-doc:last-child{border-bottom:none}
.k-dopen{flex:1;display:flex;justify-content:space-between;gap:10px;border:none;background:none;padding:11px 14px;cursor:pointer;text-align:left}
.k-dopen:hover,.k-dmore:hover{background:var(--k-hover)} .k-dopen small{color:var(--k-sub)}
.k-dmore{border:none;background:none;padding:11px 14px;cursor:pointer;font-size:18px;line-height:1}
.k-empty,.k-foot{color:var(--k-sub)} .k-foot{margin-top:22px;font-size:12px}
/* app chrome */
.k-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--k-panel);border-bottom:1px solid var(--k-line);flex-wrap:wrap}
.k-bar .k-title{font:inherit;font-weight:600;border:1px solid transparent;background:none;border-radius:6px;padding:4px 8px;min-width:80px;max-width:260px;color:var(--k-text)}
.k-bar .k-title:hover,.k-bar .k-title:focus{border-color:var(--k-line);outline:none}
.k-mb{border:none;background:none;padding:5px 9px;border-radius:6px;cursor:pointer}
.k-mb:hover{background:var(--k-hover)}
.k-status{margin-left:auto;color:var(--k-sub);font-size:12px;padding-right:6px}
.k-tools{display:flex;align-items:center;gap:2px;padding:4px 8px;background:var(--k-panel);border-bottom:1px solid var(--k-line);flex-wrap:wrap}
.k-tb{border:none;background:none;min-width:30px;height:30px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;font-size:14px}
.k-tb:hover{background:var(--k-hover)} .k-tb.on{background:color-mix(in srgb,var(--k-acc) 20%,transparent);color:var(--k-acc)}
.k-tools select,.k-tools input[type=number]{font:inherit;font-size:13px;height:30px;border:1px solid var(--k-line);border-radius:6px;background:var(--k-bg);color:var(--k-text);padding:0 6px}
.k-tools input[type=color]{width:30px;height:30px;border:none;padding:2px;background:none;cursor:pointer}
.k-vs{width:1px;height:22px;background:var(--k-line);margin:0 4px}
.k-col{position:relative;display:inline-flex} .k-col input{position:absolute;inset:0;opacity:0;cursor:pointer}
.k-col i{position:absolute;left:6px;right:6px;bottom:4px;height:3px;border-radius:2px}
@media print{.k-toast,.k-menu,.k-modal{display:none!important}}
</style>`));
})();
