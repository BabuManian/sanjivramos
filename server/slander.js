// Slander Studio: meme sound effects fetched with yt-dlp (YouTube search, or a TikTok/Instagram/YouTube link)
// and kept as short MP3s in <data>/.slander so they play instantly next time.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(path.resolve(process.env.SANJIVRAM_DATA || ROOT), '.slander');
const okId = id => /^[\w-]{1,48}$/.test(id || '');
const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; } };
const running = new Map();   // id → child

function list() {
  const out = {};
  try {
    for (const f of fs.readdirSync(DIR)) {
      const m = /^([\w-]+)\.mp3$/.exec(f); if (!m) continue;
      let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(DIR, m[1] + '.json'), 'utf8')); } catch {}
      out[m[1]] = { title: meta.title || '', url: meta.url || '', duration: meta.duration || 0, size: fs.statSync(path.join(DIR, f)).size };
    }
  } catch {}
  return out;
}

function fetchSound({ id, query, url, skip = 0, maxLen = 30 }) {
  return new Promise(resolve => {
    if (!okId(id)) return resolve({ error: 'Bad sound id' });
    if (running.has(id)) return resolve({ error: 'Already downloading' });
    if (!has('yt-dlp')) return resolve({ error: 'yt-dlp isn’t installed. Press “Install yt-dlp”, or in Termux: pkg install yt-dlp' });
    fs.mkdirSync(DIR, { recursive: true });
    const link = String(url || '').trim(), q = String(query || '').trim().slice(0, 200);
    if (link && !/^https?:\/\/[^\s]+$/i.test(link)) return resolve({ error: 'That link doesn’t look right' });
    if (!link && !q) return resolve({ error: 'Nothing to search for' });
    const n = Math.max(0, Math.min(20, skip | 0));
    const tmp = path.join(DIR, `.${id}.part`);
    for (const f of fs.readdirSync(DIR)) if (f.startsWith(`.${id}.part`)) try { fs.unlinkSync(path.join(DIR, f)); } catch {}
    const secs = Math.max(3, Math.min(120, maxLen | 0));
    const args = ['--no-playlist', '--no-progress', '--no-warnings', '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '--postprocessor-args', `ExtractAudio:-t ${secs}`, '--max-filesize', '60M', '-o', `${tmp}.%(ext)s`,
      '--print-to-file', '%(title)s\t%(duration)s\t%(webpage_url)s', `${tmp}.info`];
    if (link) args.push(link);
    else args.push('--match-filter', 'duration <= 90', '--max-downloads', '1', '--playlist-items', `${n + 1}:`, `ytsearch${n + 8}:${q}`);
    const env = { ...process.env }; delete env.SITE_PASSWORD;
    const child = spawn('yt-dlp', args, { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
    running.set(id, child);
    let err = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', d => { err = (err + d).slice(-1500); });
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 150000);
    child.on('error', e => { clearTimeout(t); running.delete(id); resolve({ error: e.message }); });
    child.on('close', () => {
      clearTimeout(t); running.delete(id);
      const mp3 = `${tmp}.mp3`;
      if (!fs.existsSync(mp3)) {
        const line = err.split('\n').map(s => s.trim()).filter(s => /ERROR/.test(s)).pop() || err.trim().split('\n').pop() || '';
        return resolve({ error: line ? line.replace(/^ERROR:\s*/, '').slice(0, 300) : 'No short clip found — try a different search or paste a link' });
      }
      let [title = '', duration = '', webUrl = ''] = (() => { try { return fs.readFileSync(`${tmp}.info`, 'utf8').trim().split('\n').pop().split('\t'); } catch { return []; } })();
      fs.renameSync(mp3, path.join(DIR, `${id}.mp3`));
      const meta = { title, url: webUrl || link, duration: Math.min(+duration || 0, secs), query: q, skip: n, at: Date.now() };
      fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify(meta));
      try { fs.unlinkSync(`${tmp}.info`); } catch {}
      resolve({ ok: true, ...meta });
    });
  });
}

/** POST /linux-app/slander-* actions. Returns true when handled. */
export async function slanderAction(action, body, reply) {
  if (action === 'slander-status') return reply(200, { ytdlp: has('yt-dlp'), ffmpeg: has('ffmpeg'), sounds: list(), busy: [...running.keys()] }), true;
  if (action === 'slander-fetch') { const r = await fetchSound(body); return reply(r.error ? 400 : 200, r), true; }
  if (action === 'slander-delete') {
    if (!okId(body.id)) return reply(400, { error: 'Bad sound id' }), true;
    for (const ext of ['mp3', 'json']) try { fs.unlinkSync(path.join(DIR, `${body.id}.${ext}`)); } catch {}
    return reply(200, { ok: true }), true;
  }
  if (action === 'slander-install') {
    const r = await new Promise(res => {
      const c = spawn('sh', ['-c', 'command -v pkg >/dev/null && pkg install -y yt-dlp || python3 -m pip install -U yt-dlp'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; c.stdout.on('data', d => { out = (out + d).slice(-800); }); c.stderr.on('data', d => { out = (out + d).slice(-800); });
      c.on('close', code => res({ code, out })); c.on('error', e => res({ code: 1, out: e.message }));
    });
    return reply(has('yt-dlp') ? 200 : 500, has('yt-dlp') ? { ok: true } : { error: 'Couldn’t install yt-dlp: ' + r.out.trim().split('\n').pop() }), true;
  }
  return false;
}

/** GET /slander-audio/<id> — a downloaded clip. */
export function serveSlander(req, res, id) {
  const f = path.join(DIR, `${id}.mp3`);
  if (!okId(id) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  const st = fs.statSync(f);
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': st.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(f).pipe(res);
}
