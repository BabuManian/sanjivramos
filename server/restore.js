// OS restore points: roll index.html back to one of the saved copies in .backup-* (used by sanjsh "restore").
//   GET  /os-restore/list            → { points: [{ id, label, file, date, size }] }   newest first
//   POST /os-restore/apply { id }    → backs up the current index.html, then copies the chosen copy over it
//   GET  /os-restore/                → a tiny standalone page, so you can still restore (or undo) even if the
//                                      restored version has no "restore" command of its own.
// Only from this phone / your own network (same rule as the shell), because it rewrites the OS.
import fs from 'node:fs';
import path from 'node:path';

const MAX_SIZE = 64 * 1024 * 1024;

/** Every saved index.html copy: files inside .backup-* folders, top-level .backup-*.html and index.html.* copies. */
function points(root) {
  const out = [];
  const add = (rel, label) => {
    try {
      const st = fs.statSync(path.join(root, rel));
      if (st.isFile() && st.size > 1000 && st.size < MAX_SIZE) out.push({ id: rel, label, file: rel, date: st.mtime.toISOString(), size: st.size });
    } catch {}
  };
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith('.backup-')) {
      let st; try { st = fs.statSync(path.join(root, name)); } catch { continue; }
      const tag = name.replace(/^\.backup-/, '').replace(/\.html$/, '');
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(path.join(root, name))) if (/^index.*\.html$/.test(f)) add(name + '/' + f, f === 'index.html' ? tag : `${tag} (${f.replace(/^index[.-]?|\.html$/g, '') || f})`);
      } else if (/\.html$/.test(name)) add(name, tag);
    } else if (/^index\.html\.(bak|before-[\w-]+)$/.test(name)) add(name, name.replace(/^index\.html\./, ''));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

function apply(root, id) {
  const list = points(root), pt = list.find(x => x.id === id);
  if (!pt) throw new Error('no such restore point');
  const src = path.join(root, pt.file), dst = path.join(root, 'index.html');
  if (!src.startsWith(root + path.sep)) throw new Error('bad path');
  // Keep what's there now, so the restore itself can be undone.
  const keep = path.join(root, `.backup-${stamp()}-before-restore`);
  fs.mkdirSync(keep, { recursive: true });
  fs.copyFileSync(dst, path.join(keep, 'index.html'));
  const tmp = dst + '.restoring';
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dst);
  return { restored: pt, savedCurrentAs: path.basename(keep) };
}

const PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SanjivramOS restore</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:16px;max-width:760px;margin:auto}h1{font-size:20px}
li{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #333}ul{list-style:none;padding:0}span{flex:1}small{color:#999;display:block}
button{background:#ff7a59;color:#111;border:0;border-radius:6px;padding:6px 12px;font-weight:600}a{color:#7ab8ff}</style>
<h1>Restore SanjivramOS</h1><p>Pick a version. The one you have now is backed up first, so you can always come back here and undo. <a href="../">Back to SanjivramOS</a></p><ul id=l>Loading…</ul>
<script>
const l=document.getElementById('l');
fetch('list',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>{l.innerHTML='';j.points.forEach(p=>{const li=document.createElement('li');
li.innerHTML='<span></span><button>Restore</button>';li.firstChild.textContent=p.label;const s=document.createElement('small');s.textContent=new Date(p.date).toLocaleString()+' · '+(p.size/1048576).toFixed(1)+' MB · '+p.file;li.firstChild.appendChild(s);
li.lastChild.onclick=async()=>{if(!confirm('Restore '+p.label+'?'))return;const r=await fetch('apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:p.id})});const k=await r.json();
if(!r.ok)return alert(k.error||'failed');alert('Restored. Your previous version was saved as '+k.savedCurrentAs);location.href='../';};l.appendChild(li);});})
.catch(e=>{l.textContent=e===403?'Restore only works from this phone or your own network, with the shell turned on.':'Could not load restore points.';});
</script>`;

/** Returns true if it handled the request. */
export function handleRestore(req, res, url, allowed, root, readJson) {
  if (!url.pathname.startsWith('/os-restore')) return false;
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const sub = url.pathname.slice('/os-restore'.length);
  if (sub === '' ) { res.writeHead(302, { location: 'os-restore/' }); res.end(); return true; }
  if (sub === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(PAGE); return true; }
  if (!allowed) { json(403, { error: 'Restore only works from this phone or your own network, with the shell turned on.' }); return true; }
  if (sub === '/list' && req.method === 'GET') { try { json(200, { points: points(root) }); } catch (e) { json(500, { error: e.message }); } return true; }
  if (sub === '/apply' && req.method === 'POST') {
    readJson(req).then(b => json(200, apply(root, String(b.id || '')))).catch(e => json(400, { error: e.message }));
    return true;
  }
  json(404, { error: 'not found' });
  return true;
}
