// VNC displays for the Linux (noVNC) and scrcpy apps: bridges noVNC's WebSocket to a VNC server on this machine
// (localhost only), starting that display first when it isn't running. Same rules as the shell:
// SANJIVRAM_SHELL=1 and a password.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const CMD = process.env.SANJIVRAM_DESKTOP_CMD || '';   // termux/desktop.sh
const TARGETS = {
  desktop: { port: 5901, start: 'start', hint: 'sanjivramos desktop start' },
  // `always`: run the start command on every connection, so a scrcpy that exited or was killed comes back.
  // Apps display (:3): just Fluxbox, so single apps don't pay for a whole XFCE desktop. Linux apps opened from
  // SanjivramOS run here. Firefox runs here too; its start command brings up the display and runs on every
  // connection so a closed Firefox comes back (it does nothing while Firefox is open).
  apps: { port: 5903, start: 'apps-start', hint: 'sanjivramos desktop apps-start' },
  firefox: { port: 5903, start: 'firefox', hint: 'sanjivramos desktop firefox', always: true },
  scrcpy: { port: 5902, start: 'scrcpy-start', hint: 'sanjivramos desktop scrcpy-start', always: true }
};

const tryConnect = port => new Promise(res => {
  const s = net.connect(port, '127.0.0.1');
  s.once('connect', () => res(s));
  s.once('error', () => res(null));
});

const starting = {};
async function vncSocket(name) {
  const t = TARGETS[name];
  let s = await tryConnect(t.port);
  if (s && t.always && CMD && !starting[name]) spawn(CMD, [t.start], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (s || !CMD) return s;
  starting[name] = starting[name] || new Promise(res => {
    const p = spawn(CMD, [t.start], { detached: true, stdio: 'ignore' });
    p.on('error', () => res());
    p.on('exit', () => res());
    p.unref();
  }).finally(() => { setTimeout(() => { delete starting[name]; }, 1000); });
  await starting[name];
  // First start may install packages, so wait up to a minute.
  for (let i = 0; i < 120 && !s; i++) { await new Promise(r => setTimeout(r, 500)); s = await tryConnect(t.port); }
  return s;
}

/** Makes sure a display is running (default: the apps display :3), starting it if needed. */
const DISPLAY_NO = { desktop: 1, scrcpy: 2, apps: 3, firefox: 3 };
export async function ensureDesktop(name = 'apps') {
  // Already running? Look for its X socket rather than opening and dropping a VNC connection: TigerVNC counts
  // dropped connections as failed logins and blacklists 127.0.0.1 after a few, so noVNC then "fails to connect".
  const n = DISPLAY_NO[name], tmp = process.env.TMPDIR || path.join(process.env.PREFIX || '', 'tmp');
  if (n && fs.existsSync(path.join(tmp, '.X11-unix', 'X' + n)) && fs.existsSync(path.join(tmp, `.X${n}-lock`))) return true;
  const s = await vncSocket(name);
  if (s) s.destroy();
  return !!s;
}

export function handleVnc(req, socket, head, name = 'desktop') {
  wss.handleUpgrade(req, socket, head, async ws => {
    const vnc = await vncSocket(name);
    if (!vnc) { ws.close(1011, `Couldn't start. In Termux run: ${TARGETS[name].hint}`); return; }
    vnc.on('data', d => { if (ws.readyState === ws.OPEN) ws.send(d); });
    vnc.on('close', () => ws.close());
    vnc.on('error', () => ws.close());
    ws.on('message', d => vnc.write(d));
    ws.on('close', () => vnc.destroy());
  });
}

/** noVNC for an Android app window (display :10-:17, started by /linux-app/android-window): just bridge to its port. */
const watchers = new Map(), idleT = new Map();   // port → open viewers; stop an Android app display nobody watches
export function handleVncPort(req, socket, head, port, onIdle) {
  wss.handleUpgrade(req, socket, head, async ws => {
    clearTimeout(idleT.get(port)); watchers.set(port, (watchers.get(port) || 0) + 1);
    ws.on('close', () => {
      const n = (watchers.get(port) || 1) - 1; watchers.set(port, n);
      if (n <= 0 && onIdle) idleT.set(port, setTimeout(() => { if (!(watchers.get(port) > 0)) onIdle(); }, 30000));
    });
    let vnc = null;
    for (let i = 0; i < 60 && !vnc; i++) { vnc = await tryConnect(port); if (!vnc) await new Promise(r => setTimeout(r, 500)); }
    if (!vnc) { ws.close(1011, 'The Android app display isn’t running.'); return; }
    vnc.on('data', d => { if (ws.readyState === ws.OPEN) ws.send(d); });
    vnc.on('close', () => ws.close());
    vnc.on('error', () => ws.close());
    ws.on('message', d => vnc.write(d));
    ws.on('close', () => vnc.destroy());
  });
}
