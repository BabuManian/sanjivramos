// SanjivramOS shell: one full-screen Electron window showing the local SanjivramOS server.
// While the boot updater downloads the latest version from GitHub, a splash shows its progress.
const { app, BrowserWindow, session, globalShortcut } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 8080;
const URL = `http://localhost:${PORT}/`;            // "localhost" = trusted local browser, no password needed
const STATUS = '/run/sanjivramos/status';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
app.setName('SanjivramOS');

let win;
const serverUp = () => new Promise(res => {
  const req = http.get(URL, r => { r.resume(); res(r.statusCode < 500); });
  req.on('error', () => res(false));
  req.setTimeout(1500, () => { req.destroy(); res(false); });
});
const readStatus = () => { try { return fs.readFileSync(STATUS, 'utf8').trim(); } catch { return ''; } };

async function waitAndLoad() {
  win.loadFile(path.join(__dirname, 'splash.html'));
  for (;;) {
    if (await serverUp()) break;
    const s = readStatus() || 'Starting SanjivramOS…';
    win.webContents.executeJavaScript(`window.setStatus && setStatus(${JSON.stringify(s)})`).catch(() => {});
    await new Promise(r => setTimeout(r, 700));
  }
  win.loadURL(URL);
}

function fullWindow(extra = {}) {
  return new BrowserWindow({
    fullscreen: true, frame: false, backgroundColor: '#05060a', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }, ...extra,
  });
}

app.whenReady().then(() => {
  // Camera / mic / notifications / fullscreen for SanjivramOS itself (calls, voice messages, games).
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const origin = (() => { try { return new globalThis.URL(details.requestingUrl || wc.getURL()).hostname; } catch { return ''; } })();
    cb(['localhost', '127.0.0.1'].includes(origin));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(origin || ''));

  win = fullWindow();
  win.setMenu(null);
  // Popups (sign-in windows, links that open new tabs) get their own full-screen window; Ctrl+W closes them.
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#ffffff' } }));
  app.on('browser-window-created', (_, w) => {
    w.webContents.on('before-input-event', (e, i) => {
      if (w !== win && i.control && i.key.toLowerCase() === 'w') { e.preventDefault(); w.close(); }
    });
  });
  // Server restarted / page crashed → splash until it's back.
  win.webContents.on('did-fail-load', (_e, code, _d, url) => { if (code !== -3 && url.startsWith(URL)) setTimeout(waitAndLoad, 1000); });
  win.webContents.on('render-process-gone', () => setTimeout(waitAndLoad, 500));
  globalShortcut.register('CommandOrControl+Shift+R', () => win.webContents.reloadIgnoringCache());
  globalShortcut.register('CommandOrControl+Alt+I', () => win.webContents.toggleDevTools());
  waitAndLoad();
});

// Closing the last window would leave a black screen — the session service starts the shell again.
app.on('window-all-closed', () => app.quit());
