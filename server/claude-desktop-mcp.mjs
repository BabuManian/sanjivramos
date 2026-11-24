#!/usr/bin/env node
// MCP server (stdio) that Claude Code starts for the SanjivramOS Claude app.
// Every tool call is POSTed to the SanjivramOS server (/claude-desktop), which hands it to the
// Claude app window that started this run; the desktop page does the work and sends the result back.
// Env: SJ_DESKTOP_URL (relay URL), SJ_DESKTOP_TOKEN (per-connection secret), SJ_DESKTOP_FULL=1 (adds run_js).
import http from 'node:http';
import readline from 'node:readline';

const URL_ = process.env.SJ_DESKTOP_URL, TOKEN = process.env.SJ_DESKTOP_TOKEN, FULL = process.env.SJ_DESKTOP_FULL === '1';
const obj = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

const TOOLS = [
  { name: 'get_desktop_state', description: 'See the SanjivramOS desktop right now: open windows (id, app, title, state, workspace), the active window, the current look (layout, colour scheme, accent, wallpaper, icons, font), workspaces, screen size and device mode. Call this first.', inputSchema: obj({}) },
  { name: 'list_apps', description: 'List installed SanjivramOS apps (id and name). Optional search query.', inputSchema: obj({ query: str('Filter by name, id or keyword') }) },
  { name: 'open_app', description: 'Open an app by id or name (e.g. "notepad", "Calculator", "settings", "browser", "terminal", "files"). Returns the new window id. Optional args are passed to the app, e.g. { "url": "https://…" } for browser, { "section": "wallpaper" } for settings, { "text": "…" } for notepad.', inputSchema: obj({ app: str('App id or name'), args: { type: 'object', description: 'Optional launch arguments' } }, ['app']) },
  { name: 'window_action', description: 'Do something to a window. Identify it by window_id (from get_desktop_state) or app id; defaults to the active window.', inputSchema: obj({
    window_id: str('Window id like "w3"'), app: str('App id — acts on its top window'),
    action: str('What to do', { enum: ['focus', 'close', 'minimize', 'maximize', 'restore', 'snap_left', 'snap_right', 'center', 'fullscreen', 'always_on_top', 'not_on_top', 'move_to_workspace', 'resize'] }),
    workspace: { type: 'integer', description: 'For move_to_workspace' }, width: { type: 'integer' }, height: { type: 'integer' }, x: { type: 'integer' }, y: { type: 'integer' } }, ['action']) },
  { name: 'read_window', description: 'Read what a window shows: its visible text, text fields (with their current values) and buttons. Use before click/type_text.', inputSchema: obj({ window_id: str('Window id; defaults to the active window'), max_chars: { type: 'integer', description: 'Default 6000' } }) },
  { name: 'click', description: 'Click a button, link, tab or menu item inside a window, found by its visible text, title or aria-label (case-insensitive; exact match preferred, else contains).', inputSchema: obj({ window_id: str('Window id; defaults to the active window'), text: str('Text of the thing to click'), index: { type: 'integer', description: 'Which match if several (0-based)' } }, ['text']) },
  { name: 'type_text', description: 'Type into a text field in a window. field = placeholder/label/name/aria-label of the field (default: the main text area or the focused field). mode "replace" (default) or "append". submit=true presses Enter afterwards.', inputSchema: obj({ window_id: str('Window id; defaults to the active window'), text: str('Text to type'), field: str('Which field'), mode: str('replace or append', { enum: ['replace', 'append'] }), submit: { type: 'boolean' } }, ['text']) },
  { name: 'press_keys', description: 'Send a key press to the desktop/active window, e.g. "Ctrl+S", "Enter", "Escape", "Super".', inputSchema: obj({ keys: str('Key combo') }, ['keys']) },
  { name: 'get_settings', description: 'Read SanjivramOS settings. Give keys, or a query to search setting names; with neither, returns every setting key with its current value.', inputSchema: obj({ keys: { type: 'array', items: { type: 'string' } }, query: str('Substring of setting names') }) },
  { name: 'set_settings', description: 'Change SanjivramOS settings, e.g. { "clock24": true, "dockSize": "l", "blur": false, "scrFrame": "rainbow" }. Only existing keys; values must have the same type as the current value. Use apply_look for scheme/layout/theme packs.', inputSchema: obj({ settings: { type: 'object', description: 'key → new value' } }, ['settings']) },
  { name: 'list_looks', description: 'List what can be applied with apply_look: wallpapers, layouts, schemes, theme_packs, accents, fonts or icon_styles. Use query to search (there are 800+ wallpapers).', inputSchema: obj({ kind: str('Which list', { enum: ['wallpapers', 'layouts', 'schemes', 'theme_packs', 'accents', 'fonts', 'icon_styles'] }), query: str('Search text'), limit: { type: 'integer', description: 'Default 40' } }, ['kind']) },
  { name: 'apply_look', description: 'Change how the desktop looks. Any combination of: theme_pack (id), scheme (id), layout (id), wallpaper (id), accent (#rrggbb), icon_style (id), font (id), dark (true/false). The user can undo it from Settings → Themes.', inputSchema: obj({ theme_pack: str(''), scheme: str(''), layout: str(''), wallpaper: str(''), accent: str('#rrggbb'), icon_style: str(''), font: str(''), dark: { type: 'boolean' } }) },
  { name: 'system_action', description: 'Desktop-wide actions.', inputSchema: obj({ action: str('What to do', { enum: ['show_desktop', 'switch_workspace', 'overview', 'start_menu', 'spotlight', 'toggle_dark', 'dnd_on', 'dnd_off', 'lock', 'screensaver', 'undo_look', 'close_all_windows', 'minimize_all', 'tile_windows', 'untile_windows'] }), workspace: { type: 'integer' } }, ['action']) },
  { name: 'notify', description: 'Show a notification banner on the desktop.', inputSchema: obj({ title: str('Title'), message: str('Body') }, ['title']) },
  { name: 'run_in_terminal', description: 'Open the SanjivramOS Terminal app and run a shell command in it, visibly, for the user to watch. (For your own work, prefer your Bash tool.)', inputSchema: obj({ command: str('Shell command') }, ['command']) },
  { name: 'add_widget', description: 'Add a desktop widget (clock, calendar, notes, weather, quote, countdown, system, …).', inputSchema: obj({ type: str('Widget type id; call with "list" to see the types') }, ['type']) }
];
if (FULL) TOOLS.push({ name: 'run_js', description: 'Run JavaScript inside the SanjivramOS page (full access). Globals: WM, Apps, Settings, Theme, Themes, Toast, Store, Widgets, Desktop… Async allowed; the value of the last `return` is sent back as JSON.', inputSchema: obj({ code: str('Function body, e.g. "return WM.list().length"') }, ['code']) });

function relay(tool, args) {
  return new Promise(resolve => {
    if (!URL_ || !TOKEN) return resolve({ ok: false, result: 'Desktop control is not connected.' });
    const body = JSON.stringify({ token: TOKEN, tool, args: args || {} });
    const u = new URL(URL_);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: 65000 }, res => {
      let b = ''; res.on('data', d => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false, result: `Bad reply from SanjivramOS (${res.statusCode})` }); } });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', e => resolve({ ok: false, result: 'Could not reach SanjivramOS: ' + e.message }));
    req.end(body);
  });
}

const out = m => process.stdout.write(JSON.stringify(m) + '\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  const { id, method, params } = m;
  if (id === undefined) return;   // notifications
  if (method === 'initialize') return out({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sanjivramos-desktop', version: '1.0.0' } } });
  if (method === 'ping') return out({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return out({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some(t => t.name === name)) return out({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Unknown tool ${name}` }], isError: true } });
    const r = await relay(name, params.arguments || {});
    const text = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 1);
    return out({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: (text || (r.ok ? 'Done.' : 'Failed.')).slice(0, 60000) }], isError: !r.ok } });
  }
  out({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
});
