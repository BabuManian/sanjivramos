// Phone shell for the Terminal app: a real login shell on the machine running this server, streamed over a WebSocket.
// Off unless SANJIVRAM_SHELL=1 and a SITE_PASSWORD is set — anyone who can open it can run any command here.
import { spawn, execFileSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { parseSpec, buildScript, q } from './linuxapps.js';

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const has = cmd => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; } };
const SHELL = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : has('bash') ? 'bash' : 'sh';
// `script` (util-linux) gives the shell a real terminal, so prompts, colours, Ctrl+C, nano/vim and top work.
const HAS_SCRIPT = has('script');

/** The pseudo-terminal of the shell started by `script`, found through /proc. */
function ptyOf(scriptPid) {
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      if (+stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1] !== scriptPid) continue;
      const tty = fs.readlinkSync(`/proc/${d}/fd/0`);
      if (tty.startsWith('/dev/pts/')) return tty;
    } catch {}
  }
  return null;
}

export function handleShell(req, socket, head) {
  wss.handleUpgrade(req, socket, head, ws => {
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    delete env.SITE_PASSWORD;
    env.SANJIVRAMOS_WEB_SHELL = '1';   // lets sanjivramos/install.sh restart the server without cutting off this shell
    // ?run=<base64 JSON>: a terminal app made with the App Store's "Make a Linux App" runs its command instead of a plain shell.
    let spec = null;
    try { const r = new URL(req.url, 'http://x').searchParams.get('run'); if (r) spec = parseSpec(JSON.parse(Buffer.from(r, 'base64').toString())); } catch {}
    const line = spec ? `${SHELL} -lc ${q(buildScript(spec))}` : `${SHELL} -l`;
    const child = HAS_SCRIPT
      ? spawn('script', ['-q', '-f', '-e', '-c', line, '/dev/null'], { cwd: os.homedir(), env })
      : spec ? spawn(SHELL, ['-lc', buildScript(spec)], { cwd: os.homedir(), env }) : spawn(SHELL, ['-i'], { cwd: os.homedir(), env });
    let tty = null, size = null;
    const resize = () => {
      if (!size || !HAS_SCRIPT) return;
      tty = tty || ptyOf(child.pid);
      if (tty) execFile('stty', ['-F', tty, 'rows', String(size[1]), 'cols', String(size[0])], () => {});
    };
    const send = data => { if (ws.readyState === ws.OPEN) ws.send(data); };
    child.stdout.on('data', send);
    child.stderr.on('data', send);
    child.on('exit', code => { if (!spec) send(`\r\n[shell exited${code ? ` with code ${code}` : ''}]\r\n`); ws.close(spec ? 4000 : 1000, spec ? 'app exited' : ''); });
    child.on('error', err => { send(`\r\n[couldn't start a shell: ${err.message}]\r\n`); ws.close(); });
    if (!HAS_SCRIPT) send('[No terminal support: install it with "pkg install util-linux" for prompts, colours and full-screen apps]\r\n');
    // Binary frames are keystrokes; text frames are control messages ({"resize":[cols,rows]}).
    ws.on('message', (data, isBinary) => {
      if (isBinary) { if (child.stdin.writable) child.stdin.write(data); return; }
      try {
        const m = JSON.parse(String(data));
        if (Array.isArray(m.resize)) { size = m.resize.map(n => Math.max(1, Math.min(1000, n | 0))); resize(); setTimeout(resize, 400); }
      } catch {}
    });
    ws.on('close', () => { try { process.kill(-child.pid, 'SIGHUP'); } catch {} try { child.kill('SIGHUP'); } catch {} });
  });
}
