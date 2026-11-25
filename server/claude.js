// Claude app bridge: runs Claude Code (`claude -p`) on this machine and streams its JSON events over a WebSocket.
// Same rules as the phone shell (SANJIVRAM_SHELL=1, own network only, same site) — Claude Code can run commands here.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 40 * 1024 * 1024 });
const MODES = ['default', 'acceptEdits', 'auto', 'plan', 'bypassPermissions', 'dontAsk'];
const CLAUDE = process.env.SANJIVRAM_CLAUDE || 'claude';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const UPLOAD_DIR = path.join(os.homedir(), 'claude-uploads');   // files attached in the Claude app
const UPLOAD_MAX = 25 * 1024 * 1024;
const MCP_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'claude-desktop-mcp.mjs');

/* ---- Desktop control relay ----
   Each Claude app connection gets a random token. Claude Code's MCP helper (claude-desktop-mcp.mjs)
   POSTs tool calls to /claude-desktop with that token; we pass them to the app window over its
   WebSocket and answer with what the desktop page sends back. */
const relays = new Map();   // token → { send, pending: Map(id → resolve) }
let relaySeq = 0;
export async function handleDesktopRelay(req, res, readJson) {
  const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST') return reply(405, { ok: false, result: 'POST only' });
  let body; try { body = await readJson(req); } catch { return reply(400, { ok: false, result: 'Bad request' }); }
  const r = typeof body.token === 'string' && body.token.length === 64 && relays.get(body.token);
  if (!r) return reply(403, { ok: false, result: 'The Claude app window that started this is closed.' });
  const id = ++relaySeq;
  const done = await new Promise(resolve => {
    const t = setTimeout(() => { r.pending.delete(id); resolve({ ok: false, result: 'The desktop did not answer in time.' }); }, 60000);
    r.pending.set(id, v => { clearTimeout(t); resolve(v); });
    r.send({ type: 'desktop', id, tool: String(body.tool || ''), args: body.args && typeof body.args === 'object' ? body.args : {} });
  });
  reply(200, done);
}

function cleanEnv() {
  const env = { ...process.env };
  // Never hand the site password or a parent Claude Code session's settings to the child.
  for (const k of ['SITE_PASSWORD', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT']) delete env[k];
  env.SANJIVRAMOS_CLAUDE_APP = '1';
  return env;
}

function resolveDir(d) {
  const home = os.homedir();
  let p = String(d || '').trim() || home;
  if (p === '~' || p.startsWith('~/')) p = path.join(home, p.slice(1));
  p = path.resolve(home, p);
  try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  return null;
}

export function handleClaude(req, socket, head) {
  const port = req.socket.localPort;
  wss.handleUpgrade(req, socket, head, ws => {
    let child = null, mcpFile = null;
    const send = obj => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
    const token = crypto.randomBytes(32).toString('hex'), relay = { send, pending: new Map() };
    relays.set(token, relay);
    const dropMcp = () => { if (mcpFile) { fs.rm(mcpFile, { force: true }, () => {}); mcpFile = null; } };
    const stop = () => { if (child) { try { child.kill('SIGINT'); } catch {} const c = child; setTimeout(() => { try { c.kill('SIGKILL'); } catch {} }, 3000); } };

    ws.on('message', data => {
      let m;
      try { m = JSON.parse(String(data)); } catch { return; }
      if (m.type === 'stop') { stop(); return; }
      if (m.type === 'ping') { send({ type: 'pong' }); return; }
      if (m.type === 'desktop-result') { const f = relay.pending.get(m.id); if (f) { relay.pending.delete(m.id); f({ ok: !!m.ok, result: m.result }); } return; }
      if (m.type === 'upload') {
        // One attached file per message: { id, name, data (base64) } → saved under ~/claude-uploads/<date>/.
        const fail = msg => send({ type: 'uploaded', id: m.id, ok: false, message: msg });
        try {
          const buf = Buffer.from(String(m.data || ''), 'base64');
          if (!buf.length) return fail('The file is empty.');
          if (buf.length > UPLOAD_MAX) return fail('Files can be up to 25 MB.');
          let name = path.basename(String(m.name || 'file')).replace(/[\x00-\x1f/\\:*?"<>|]+/g, '_').replace(/^\.+/, '').slice(-120) || 'file';
          const dir = path.join(UPLOAD_DIR, new Date().toISOString().slice(0, 10));
          fs.mkdirSync(dir, { recursive: true });
          const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
          let file = path.join(dir, name);
          for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} (${i})${ext}`);
          fs.writeFileSync(file, buf);
          send({ type: 'uploaded', id: m.id, ok: true, path: file, size: buf.length });
        } catch (err) { fail(err.message); }
        return;
      }
      if (m.type !== 'prompt') return;
      if (child) { send({ type: 'error', message: 'Claude is still answering — stop it first.' }); return; }
      const prompt = String(m.prompt || '');
      if (!prompt.trim()) return;
      const cwd = resolveDir(m.cwd);
      if (!cwd) { send({ type: 'error', message: `No such folder: ${m.cwd}` }); send({ type: 'done', code: 1 }); return; }
      const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
      if (/^[\w-]{8,64}$/.test(m.sessionId || '')) args.push('--resume', m.sessionId);
      if (/^[\w.\-\[\]]{1,64}$/.test(m.model || '')) args.push('--model', m.model);
      if (MODES.includes(m.mode)) args.push('--permission-mode', m.mode);
      if (EFFORTS.includes(m.effort)) args.push('--effort', m.effort);
      if (Array.isArray(m.files) && m.files.length) { try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); args.push('--add-dir', UPLOAD_DIR); } catch {} }
      if (m.system && typeof m.system === 'string') args.push('--append-system-prompt', m.system.slice(0, 12000));
      if (m.desktop === 'on' || m.desktop === 'full') {
        // The MCP config holds the token, so it goes in a private temp file rather than on the command line.
        dropMcp();
        mcpFile = path.join(os.tmpdir(), `sj-claude-mcp-${token.slice(0, 12)}-${Date.now()}.json`);
        const cfg = { mcpServers: { sjdesktop: { type: 'stdio', command: process.execPath, args: [MCP_SCRIPT],
          env: { SJ_DESKTOP_URL: `http://127.0.0.1:${port}/claude-desktop`, SJ_DESKTOP_TOKEN: token, SJ_DESKTOP_FULL: m.desktop === 'full' ? '1' : '0' } } } };
        try { fs.writeFileSync(mcpFile, JSON.stringify(cfg), { mode: 0o600 }); args.push('--mcp-config', mcpFile, '--allowedTools', 'mcp__sjdesktop'); }
        catch (err) { mcpFile = null; send({ type: 'stderr', text: 'Desktop control unavailable: ' + err.message + '\n' }); }
      }
      send({ type: 'start', cwd });
      try {
        child = spawn(CLAUDE, args, { cwd, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) { child = null; send({ type: 'error', message: err.message }); send({ type: 'done', code: 1 }); return; }
      const me = child;
      let buf = '', errBuf = '';
      me.stdout.on('data', d => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          try { send({ type: 'event', event: JSON.parse(line) }); } catch { send({ type: 'stderr', text: line + '\n' }); }
        }
      });
      me.stderr.on('data', d => { errBuf = (errBuf + d).slice(-4000); send({ type: 'stderr', text: String(d) }); });
      me.on('error', err => send({ type: 'error', message: err.code === 'ENOENT' ? 'Claude Code isn’t installed here. In Termux: npm install -g @anthropic-ai/claude-code' : err.message }));
      me.on('close', code => { if (child === me) { child = null; dropMcp(); } send({ type: 'done', code, stderr: code ? errBuf.slice(-1500) : '' }); });
      me.stdin.end(prompt);
    });
    ws.on('close', () => { stop(); relays.delete(token); relay.pending.forEach(f => f({ ok: false, result: 'The Claude app window closed.' })); dropMcp(); });
  });
}

/** One quick question, no tools and nothing saved (Spotlight answers, Settings "what did you mean?").
 *  POST JSON { prompt, system?, model? } → { text, cost }. */
export function claudeAsk(body, res) {
  const reply = (code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const prompt = String(body.prompt || '').slice(0, 200000);
  if (!prompt.trim()) return reply(400, { error: 'Empty question' });
  const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config',
    '--model', /^[\w.\-\[\]]{1,64}$/.test(body.model || '') ? body.model : 'haiku'];
  if (typeof body.system === 'string' && body.system) args.push('--append-system-prompt', body.system.slice(0, 20000));
  let out = '', err = '', child;
  try { child = spawn(CLAUDE, args, { cwd: os.homedir(), env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { return reply(500, { error: e.message }); }
  const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 120000);
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err = (err + d).slice(-2000); });
  child.on('error', e => { clearTimeout(t); reply(500, { error: e.code === 'ENOENT' ? 'Claude Code isn’t installed on the server.' : e.message }); });
  child.on('close', code => {
    clearTimeout(t);
    try { const j = JSON.parse(out); return j.is_error ? reply(502, { error: j.result || 'Claude error' }) : reply(200, { text: j.result || '', cost: j.total_cost_usd || 0 }); }
    catch { reply(502, { error: (err || out || `Claude exited with code ${code}`).trim().slice(-500) }); }
  });
  child.stdin.end(prompt);
}

/** Promise version of claudeAsk for server code (the Messages bots): no tools, nothing saved.
 *  Resolves to the reply text; rejects with a readable Error. */
export function claudeText(prompt, { system = '', model = 'sonnet', timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence', '--strict-mcp-config',
      '--model', /^[\w.\-\[\]]{1,64}$/.test(model) ? model : 'sonnet'];
    if (system) args.push('--append-system-prompt', String(system).slice(0, 20000));
    let out = '', err = '', child;
    try { child = spawn(CLAUDE, args, { cwd: os.homedir(), env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return reject(e); }
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, timeout);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); });
    child.on('error', e => { clearTimeout(t); reject(new Error(e.code === 'ENOENT' ? 'Claude Code isn’t installed on the server.' : e.message)); });
    child.on('close', code => {
      clearTimeout(t);
      try { const j = JSON.parse(out); if (j.is_error) reject(new Error(j.result || 'Claude error')); else resolve(String(j.result || '')); }
      catch { reject(new Error((err || out || `Claude exited with code ${code}`).trim().slice(-300))); }
    });
    child.stdin.end(String(prompt).slice(0, 200000));
  });
}
