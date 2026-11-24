// Android apps streamed straight to the browser: runs scrcpy's server on the phone (over adb) on a new virtual display,
// and relays its H.264 video to a WebSocket. The browser decodes it with WebCodecs (GPU), and sends touch/keys back as
// scrcpy control messages. No Xvnc, SDL or CPU video decoding on the Termux side.
//
// WS /astream?mode=app&pkg=<package>&size=WxH&dpi=N   — one app on its own display
// WS /astream?mode=desk&size=WxH&dpi=N                — a desktop (launcher + freeform windows)
// Server → browser: binary [kind u8][payload]: 0 = size (u32 w, u32 h), 1 = codec config (SPS/PPS), 2 = key frame, 3 = frame;
//                   text JSON: {type:'display', id} | {type:'error', error} | {type:'launched', ok, error}
// Browser → server: binary = raw scrcpy control message; text JSON {type:'launch', pkg, activity}
import net from 'node:net';
import fs from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { adbStatus } from './android.js';

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const JAR = (process.env.PREFIX || '/data/data/com.termux/files/usr') + '/share/scrcpy/scrcpy-server';
const REMOTE_DIR = '/data/local/tmp/';
const PKG_RE = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/, ACT_RE = /^[\w.$]+$/;
const ALLOWED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 9, 16, 17, 21]);   // key, text, touch, scroll, back, panels, set clipboard, start app, reset video, resize display

const run = (args, timeout = 20000) => new Promise(res => execFile('adb', args, { timeout, maxBuffer: 1 << 20 }, (err, out, e) => res({ code: err ? 1 : 0, out: String(out || '') + String(e || '') })));
let version = null;
async function serverVersion() {
  if (version) return version;
  const out = await new Promise(res => execFile('scrcpy', ['--version'], { timeout: 10000 }, (e, o) => res(String(o || ''))));
  return (version = (/scrcpy (\d+\.\d+(?:\.\d+)?)/.exec(out) || [])[1] || null);
}
// The server deletes its own jar once it has started, so every session pushes a fresh copy (its own name, so two
// sessions starting together don't race).
async function pushJar(serial, remote) {
  if (!fs.existsSync(JAR)) return false;
  return (await run(['-s', serial, 'push', JAR, remote], 30000)).code === 0;
}

const dying = new Set();   // servers still shutting down: a new one started meanwhile can abort
export function handleAstream(req, socket, head, url) {
  wss.handleUpgrade(req, socket, head, ws => session(ws, url).catch(err => { try { ws.send(JSON.stringify({ type: 'error', error: err.message })); ws.close(); } catch {} }));
}

const dbg = (...a) => { if (process.env.SJ_ASTREAM_DEBUG) console.log('[astream]', ...a); };
async function session(ws, url) {
  const q = url.searchParams, desk = q.get('mode') === 'desk', pkg = q.get('pkg') || '';
  const size = /^\d{3,4}x\d{3,4}$/.test(q.get('size') || '') ? q.get('size') : desk ? '1600x900' : '720x1280';
  const dpi = Math.min(640, Math.max(100, parseInt(q.get('dpi'), 10) || (desk ? 200 : 240)));
  if (!desk && !PKG_RE.test(pkg)) throw new Error('Bad package name');
  let closed = false, srv = null, video = null, control = null, port = 0, serial = '', displayId = null;
  const say = o => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(o)); };
  const cleanup = () => {
    if (closed) return; closed = true;
    try { video && video.destroy(); } catch {} try { control && control.destroy(); } catch {}
    if (srv && srv.exitCode == null) {
      const p = new Promise(r => { srv.once('exit', r); setTimeout(r, 4000); }); dying.add(p); p.finally(() => setTimeout(() => dying.delete(p), 500));
      try { srv.kill(); } catch {}
    }
    if (serial && port) run(['-s', serial, 'forward', '--remove', 'tcp:' + port]);
    if (serial && scid) run(['-s', serial, 'shell', `pkill -f scid=${scid}; rm -f ${REMOTE_DIR}sj-scrcpy-${scid}.jar`]);
    try { ws.close(); } catch {}
  };
  ws.on('close', cleanup); ws.on('error', cleanup);

  dbg('start', url.search);
  const st = await adbStatus(false);
  dbg('adb', st);
  if (closed) return;
  if (!st.connected) { say({ type: 'error', noadb: true, error: 'adb isn’t connected (turn on Wireless debugging).' }); return cleanup(); }
  serial = st.serial;
  const ver = await serverVersion();
  var scid = (Math.random() * 0x7fffffff | 0).toString(16).padStart(8, '0');
  const REMOTE = REMOTE_DIR + 'sj-scrcpy-' + scid + '.jar';
  if (!ver || !(await pushJar(serial, REMOTE))) { say({ type: 'error', error: 'scrcpy isn’t installed in Termux (pkg install scrcpy).' }); return cleanup(); }
  if (desk) await run(['-s', serial, 'shell', 'settings put global enable_freeform_support 1; settings put global force_desktop_mode_on_external_displays 1; settings put global force_resizable_activities 1']);
  for (let i = 0; i < 20 && !port; i++) {
    const p = 27300 + Math.floor(Math.random() * 600);
    if ((await run(['-s', serial, 'forward', 'tcp:' + p, 'localabstract:scrcpy_' + scid])).code === 0) port = p;
  }
  if (!port) { say({ type: 'error', error: 'Couldn’t open an adb tunnel.' }); return cleanup(); }
  // Keep this command short: on this phone app_process crashes ("stack corruption") when its arguments get long, so
  // only non-default options go here (log level info, h264, control and the dummy byte are already the defaults).
  const opts = [`scid=${scid}`, 'tunnel_forward=true', 'audio=false', `video_bit_rate=${Math.min(16, Math.max(2, parseInt(q.get('mbps'), 10) || 8))}000000`,
    `new_display=${desk ? '1280x720' : size}/${dpi}`];
  if (q.get('fps')) opts.push(`max_fps=${Math.min(60, Math.max(15, parseInt(q.get('fps'), 10) || 60))}`);
  if (desk) opts.push('flex_display=true');   // the browser resizes the display to fit its window (RESIZE_DISPLAY), so no black bars
  else opts.push('vd_system_decorations=false');   // just the app, no launcher behind it
  if (dying.size) { await Promise.all([...dying]); await new Promise(r => setTimeout(r, 600)); }
  if (closed) return;
  let log = '', tries = 0;
  const onLog = d => {
    dbg('srv', String(d).trim());
    log = (log + d).slice(-4000);
    const m = /New display: \S+ \(id=(\d+)\)/.exec(log);
    if (m && displayId == null) { displayId = +m[1]; say({ type: 'display', id: displayId }); }
  };
  // The server sometimes aborts at start (e.g. right after another one closed): start it again once or twice.
  const startSrv = () => {
    tries++;
    const p = srv = spawn('adb', ['-s', serial, 'shell', `CLASSPATH=${REMOTE} app_process / com.genymobile.scrcpy.Server ${ver} ${opts.join(' ')}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', onLog); p.stderr.on('data', onLog);
    p.on('exit', () => {
      if (closed || p !== srv) return;
      if (!video && tries < 3) { dbg('retry'); setTimeout(async () => { if (!closed && await pushJar(serial, REMOTE) && !closed) startSrv(); }, 500); return; }
      say({ type: 'error', error: (log.trim().split('\n').filter(l => /ERROR|Exception/.test(l)).pop() || 'The app stream ended.').replace(/^\[server\]\s*/, '') }); cleanup();
    });
  };
  startSrv();

  const connect = () => new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => res(s)); s.once('error', () => res(null)); });
  for (let i = 0; i < 60 && !video && !closed; i++) {
    await new Promise(r => setTimeout(r, 250));
    const s = await connect();
    if (!s) continue;
    // With tunnel_forward the server sends one byte once it's really there (adb accepts connections before that).
    const ok = await new Promise(r => { s.once('data', d => { if (d[0] === 0) { if (d.length > 1) s.unshift(d.subarray(1)); r(true); } else r(false); }); s.once('close', () => r(false)); setTimeout(() => r(false), 3000); });
    if (ok) video = s; else s.destroy();
  }
  dbg('video', !!video, 'closed', closed);
  if (!video || closed) { if (!closed) say({ type: 'error', error: 'The phone didn’t start the stream. ' + (log.trim().split('\n').pop() || '') }); return cleanup(); }
  control = await connect();
  if (!control) { say({ type: 'error', error: 'No control connection.' }); return cleanup(); }
  // A flex display started big crashes the server on this phone, so start at 1280x720 and resize straight away.
  if (desk && size !== '1280x720') (async () => {
    for (let i = 0; i < 60 && displayId == null && !closed; i++) await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 500));
    if (closed || !control) return;
    const [w, h] = size.split('x').map(Number), b = Buffer.alloc(5); b[0] = 21; b.writeUInt16BE(w, 1); b.writeUInt16BE(h, 3); control.write(b);
  })();
  control.on('data', () => {});   // device messages (clipboard etc.) — not used
  control.on('error', cleanup); video.on('error', cleanup); video.on('close', cleanup);

  // Start the app fullscreen on its display once that exists (the display has a launcher, and desktop mode would
  // otherwise open the app as a small window).
  const act = q.get('act') || '';
  if (!desk) (async () => {
    for (let i = 0; i < 40 && displayId == null && !closed; i++) await new Promise(r => setTimeout(r, 150));
    if (closed || displayId == null) return;
    const target = act && ACT_RE.test(act) ? ['-n', `${pkg}/${act}`] : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', pkg];
    const r = await run(['-s', serial, 'shell', 'am', 'start', '--display', String(displayId), '--windowingMode', '1', '-f', '0x10000000', ...target]);
    if (/Error|Exception/.test(r.out) && !closed) { const name = Buffer.from(pkg); control.write(Buffer.concat([Buffer.from([16, name.length]), name])); }
  })();

  // Video: 64-byte device name, 4-byte codec id, then 12-byte headers: session (bit 31: u32 w, u32 h) or packet (bit 30 config, bit 29 key, u32 size).
  let buf = Buffer.alloc(0), stage = 0;
  const send = (kind, payload) => { if (ws.readyState === ws.OPEN && ws.bufferedAmount < 8 << 20) ws.send(Buffer.concat([Buffer.from([kind]), payload])); };
  video.on('data', d => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      if (stage === 0) { if (buf.length < 64) return; buf = buf.subarray(64); stage = 1; }
      if (stage === 1) { if (buf.length < 4) return; buf = buf.subarray(4); stage = 2; }
      if (buf.length < 12) return;
      const hi = buf.readUInt32BE(0);
      if (hi >>> 31) { send(0, Buffer.from(buf.subarray(4, 12))); buf = buf.subarray(12); continue; }
      const size = buf.readUInt32BE(8);
      if (buf.length < 12 + size) return;
      const body = buf.subarray(12, 12 + size);
      // Under back-pressure drop non-key frames (they'd only add lag); keys and config always go.
      const kind = (hi >>> 30) & 1 ? 1 : (hi >>> 29) & 1 ? 2 : 3;
      if (kind !== 3 || ws.bufferedAmount < 1 << 20) send(kind, Buffer.from(body));
      buf = buf.subarray(12 + size);
    }
  });

  ws.on('message', async (data, isBinary) => {
    if (closed) return;
    if (isBinary) { const b = Buffer.from(data); if (b.length && ALLOWED.has(b[0])) control.write(b); return; }
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    if (m.type === 'launch' && desk) {
      if (displayId == null || !PKG_RE.test(m.pkg || '') || (m.activity && !ACT_RE.test(m.activity))) return say({ type: 'launched', ok: false, error: 'Not ready' });
      const target = m.activity ? ['-n', `${m.pkg}/${m.activity}`] : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', m.pkg];
      const r = await run(['-s', serial, 'shell', 'am', 'start', '--display', String(displayId), '--windowingMode', '5', ...target]);
      say({ type: 'launched', pkg: m.pkg, ok: !/Error|Exception/.test(r.out), error: r.out.trim().split('\n').pop() });
    }
    // Apps open on this desktop (for the taskbar), and closing one.
    if (m.type === 'tasks' && desk && displayId != null) say({ type: 'tasks', tasks: await tasksOn(serial, displayId) });
    if (m.type === 'close' && desk && displayId != null) {
      const id = parseInt(m.id, 10), mine = (await tasksOn(serial, displayId)).some(t => t.id === id);
      if (mine) await run(['-s', serial, 'shell', 'am', 'stack', 'remove', String(id)]);
      say({ type: 'tasks', tasks: await tasksOn(serial, displayId) });
    }
  });
}

/** Root tasks (apps) on a display, from `am stack list`, skipping the launcher: [{ id, task, pkg, act, visible }]. */
async function tasksOn(serial, display) {
  const out = (await run(['-s', serial, 'shell', 'am', 'stack', 'list'])).out, list = [];
  for (const blk of out.split(/\n(?=RootTask id=)/)) {
    const h = /^RootTask id=(\d+) .*displayId=(\d+)/m.exec(blk);
    if (!h || +h[2] !== display || /mActivityType=(home|recents)/.test(blk)) continue;
    const t = /taskId=(\d+): ([\w.]+)\/([\w.$]+).*?visible=(true|false)/.exec(blk);
    if (t) list.push({ id: +h[1], task: +t[1], pkg: t[2], act: t[3], visible: t[4] === 'true' });
  }
  return list;
}
