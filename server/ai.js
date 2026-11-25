// AI providers: OpenRouter, Groq, OpenAI and any other OpenAI-compatible API ("custom").
// The API keys stay on this machine in <DATA>/.ai/providers.json (mode 0600) and never go to the browser:
// pages talk to /ai/api/* and this server adds the key. Used by the "OpenRouter AI" app and the Game Maker.
//   GET  /ai/api/providers                 → [{id, name, base, configured, hint, custom}] + canEdit
//   POST /ai/api/providers {id, key, name?, base?}   (admins; key '' removes it, custom ids need name + base)
//   GET  /ai/api/models?provider=          → [{id, name, free, ctx}]   (cached 10 min)
//   POST /ai/api/chat {provider, model, messages, system?, stream?, max_tokens?, temperature?}
import fs from 'node:fs';
import path from 'node:path';
import { userFromReq, permGate } from './social.js';

export const BUILTIN = {
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', site: 'https://openrouter.ai/keys' },
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', site: 'https://console.groq.com/keys' },
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', site: 'https://platform.openai.com/api-keys' },
};
let FILE = '', conf = { providers: {} };
const modelCache = new Map();

export function initAi(DATA) {
  const dir = path.join(DATA, '.ai');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  FILE = path.join(dir, 'providers.json');
  try { conf = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!conf.providers) conf.providers = {}; } catch {}
  // A key can also come from the environment (handy for Codespaces): OPENROUTER_API_KEY, GROQ_API_KEY, OPENAI_API_KEY.
  for (const id of Object.keys(BUILTIN)) { const k = process.env[id.toUpperCase() + '_API_KEY']; if (k && !conf.providers[id]) conf.providers[id] = { key: k }; }
}
function save() { fs.writeFileSync(FILE + '.tmp', JSON.stringify(conf, null, 1), { mode: 0o600 }); fs.renameSync(FILE + '.tmp', FILE); }
const hint = k => k ? k.slice(0, 8) + '…' + k.slice(-4) : '';
function provider(id) {
  const c = conf.providers[id]; if (!c || !c.key) return null;
  const b = BUILTIN[id];
  return b ? { id, name: b.name, base: b.base, key: c.key } : (c.base ? { id, name: c.name || id, base: c.base, key: c.key } : null);
}
function list(u) {
  const out = Object.entries(BUILTIN).map(([id, b]) => ({ id, name: b.name, base: b.base, site: b.site, configured: !!(conf.providers[id] && conf.providers[id].key), custom: false }));
  for (const [id, c] of Object.entries(conf.providers)) if (!BUILTIN[id] && c.base) out.push({ id, name: c.name || id, base: c.base, configured: !!c.key, custom: true });
  const admin = u && (u.role === 'admin' || u.role === 'owner');
  if (admin) for (const p of out) p.hint = hint((conf.providers[p.id] || {}).key);
  return { providers: out, canEdit: !!admin };
}

async function models(p) {
  const hit = modelCache.get(p.id); if (hit && Date.now() - hit.t < 10 * 60e3) return hit.list;
  const r = await fetch(p.base + '/models', { headers: { authorization: 'Bearer ' + p.key }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${p.name} said ${r.status}`);
  const j = await r.json();
  const list = (j.data || []).filter(m => m && m.id && !/whisper|tts|embed|guard|moderation|dall-e|image|audio|transcri/i.test(m.id)).map(m => {
    const pr = m.pricing || {};
    const free = p.id === 'groq' || /:free$/.test(m.id) || (pr.prompt === '0' && pr.completion === '0');
    return { id: m.id, name: m.name || m.id, free, ctx: m.context_length || m.context_window || 0 };
  }).sort((a, b) => (b.free - a.free) || a.name.localeCompare(b.name));
  modelCache.set(p.id, { t: Date.now(), list });
  return list;
}

const send = (res, code, obj) => { if (res.headersSent) return; res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
function readBody(req, max = 2e6) {
  return new Promise((ok, bad) => { const parts = []; let n = 0; req.on('data', c => { n += c.length; if (n > max) { bad(new Error('Too big')); req.destroy(); } else parts.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString() || '{}')); } catch { bad(new Error('Bad JSON')); } }); req.on('error', bad); });
}
const sameSite = req => { try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; } };

export async function aiApi(req, res, url) {
  const p = url.pathname;
  const u = userFromReq(req);
  if (p === '/ai/api/providers' && req.method === 'GET') return send(res, 200, list(u));
  const why = permGate(req, 'ai', 'the AI apps');
  if (why) return send(res, 403, { error: why });
  if (req.method === 'POST' && !sameSite(req)) return send(res, 403, { error: 'Cross-site request refused' });

  if (p === '/ai/api/providers' && req.method === 'POST') {
    if (!(u && (u.role === 'admin' || u.role === 'owner'))) return send(res, 403, { error: 'Only an admin can change the API keys.' });
    const b = await readBody(req).catch(() => ({}));
    let id = String(b.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    const key = String(b.key || '').trim().slice(0, 400);
    if (!id) return send(res, 400, { error: 'Missing provider' });
    if (BUILTIN[id]) {
      if (key) conf.providers[id] = { key }; else delete conf.providers[id];
    } else {
      if (b.remove) delete conf.providers[id];
      else {
        let base = String(b.base || '').trim().replace(/\/+$/, '');
        if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(base)) return send(res, 400, { error: 'The API address must start with https://' });
        conf.providers[id] = { name: String(b.name || id).slice(0, 40), base, key: key || (conf.providers[id] || {}).key || '' };
      }
    }
    modelCache.delete(id); save();
    return send(res, 200, list(u));
  }
  if (p === '/ai/api/models' && req.method === 'GET') {
    const pv = provider(String(url.searchParams.get('provider') || ''));
    if (!pv) return send(res, 400, { error: 'That provider has no API key yet.' });
    try { return send(res, 200, { models: await models(pv) }); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (p === '/ai/api/chat' && req.method === 'POST') {
    let b; try { b = await readBody(req, 4e6); } catch (e) { return send(res, 400, { error: e.message }); }
    const pv = provider(String(b.provider || ''));
    if (!pv) return send(res, 400, { error: 'That provider has no API key yet. Add one in OpenRouter AI → Providers.' });
    const model = String(b.model || '').slice(0, 200);
    if (!model) return send(res, 400, { error: 'Pick a model' });
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-60)
      .filter(m => m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 200000) }));
    if (typeof b.system === 'string' && b.system) msgs.unshift({ role: 'system', content: b.system.slice(0, 40000) });
    if (!msgs.some(m => m.role === 'user')) return send(res, 400, { error: 'Empty question' });
    const stream = !!b.stream;
    const body = { model, messages: msgs, stream };
    if (+b.max_tokens > 0) body.max_tokens = Math.min(+b.max_tokens, 32000);
    if (b.temperature != null && isFinite(b.temperature)) body.temperature = Math.max(0, Math.min(2, +b.temperature));
    const ac = new AbortController(); res.on('close', () => ac.abort());
    const t = setTimeout(() => ac.abort(), 180000);
    let up;
    try {
      up = await fetch(pv.base + '/chat/completions', { method: 'POST', signal: ac.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + pv.key, 'HTTP-Referer': 'https://github.com/BabuManian/sanjivramos', 'X-Title': 'SanjivramOS' },
        body: JSON.stringify(body) });
    } catch (e) { clearTimeout(t); return send(res, 502, { error: `Couldn't reach ${pv.name}: ${e.message}` }); }
    if (!up.ok) {
      clearTimeout(t);
      let msg = `${pv.name} said ${up.status}`;
      try { const j = await up.json(); const m = (j.error && (j.error.message || j.error)) || j.message; if (m) msg += ': ' + String(typeof m === 'string' ? m : JSON.stringify(m)).slice(0, 400); } catch {}
      return send(res, up.status === 429 ? 429 : 502, { error: msg });
    }
    if (!stream) {
      try { const j = await up.json(); clearTimeout(t); const c = (j.choices || [])[0] || {}; return send(res, 200, { text: (c.message && c.message.content) || '', model: j.model || model, usage: j.usage || null }); }
      catch (e) { clearTimeout(t); return send(res, 502, { error: e.message }); }
    }
    // Stream: pass the provider's server-sent events straight through.
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    try { for await (const chunk of up.body) res.write(chunk); } catch {}
    clearTimeout(t); res.end();
    return;
  }
  send(res, 404, { error: 'Not found' });
}
