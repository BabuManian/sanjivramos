// SanjivramOS shell: the SanjivramOS desktop in one screen-sized Electron window, kept *below* real Linux app windows
// (Openbox runs alongside, so native apps get real windows on top instead of a noVNC stream).
// While the boot updater downloads the latest version from GitHub, a splash shows its progress.
// The Web Browser app uses Electron <webview>s (real Chromium tabs) through the small API in preload.js.
const { app, BrowserWindow, session, globalShortcut, screen, ipcMain, Menu, clipboard, dialog, shell, webContents } = require('electron');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 8080;
const HOME_URL = `http://localhost:${PORT}/`;      // "localhost" = trusted local browser, no password needed
const STATUS = '/run/sanjivramos/status';
const TITLE = 'SanjivramOS Desktop';               // Openbox keeps the window with this title below other windows
const WEB = 'persist:web';                         // Web Browser tabs: their own cookies/storage, kept across boots
const isLocal = u => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u || '');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar,VaapiVideoDecodeLinuxGL,CanvasOopRasterization');
app.setName('SanjivramOS');

let win;
const serverUp = () => new Promise(res => {
  const req = http.get(HOME_URL, r => { r.resume(); res(r.statusCode < 500); });
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
  win.loadURL(HOME_URL);
}

const fitScreen = () => { if (win && !win.isFullScreen()) win.setBounds(screen.getPrimaryDisplay().bounds); };

/* ---------------- Web Browser tabs (<webview>) ---------------- */
const send = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };
const KEYS = new Set(['t', 'w', 'l', 'r', 'f', 'd', 'n', 'tab', '=', '+', '-', '0', 'h', 'j', 'shift+t']);

function setupWebview(wc) {
  const id = wc.id;
  // Links that open a new window (target=_blank, window.open) become tabs.
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (/^https?:|^about:blank/.test(url)) send('sj:newtab', { from: id, url, background: disposition === 'background-tab' });
    else if (/^(mailto|tel):/.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  // Browser shortcuts still work while the page has focus.
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const k = i.key.toLowerCase();
    let combo = null;
    if (i.control && !i.alt && KEYS.has((i.shift ? 'shift+' : '') + k)) combo = (i.shift ? 'ctrl+shift+' : 'ctrl+') + k;
    else if (i.alt && !i.control && (k === 'arrowleft' || k === 'arrowright' || k === 'home')) combo = 'alt+' + k;
    else if (['f5', 'f6', 'f11', 'f12', 'escape'].includes(k) && !i.control && !i.alt) combo = k;
    if (!combo) return;
    if (combo !== 'escape') e.preventDefault();   // Esc still reaches the page (closes its own dialogs)
    send('sj:key', { from: id, combo });
  });
  wc.on('context-menu', (_e, p) => {
    const items = [];
    const tab = url => send('sj:newtab', { from: id, url, background: true });
    if (p.linkURL) items.push({ label: 'Open link in new tab', click: () => tab(p.linkURL) }, { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.mediaType === 'image' && p.srcURL) items.push({ label: 'Open image in new tab', click: () => tab(p.srcURL) }, { label: 'Save image', click: () => wc.downloadURL(p.srcURL) }, { label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) }, { type: 'separator' });
    if (p.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' });
    else if (p.selectionText) items.push({ role: 'copy' }, { label: `Search for “${p.selectionText.slice(0, 30)}${p.selectionText.length > 30 ? '…' : ''}”`, click: () => send('sj:search', { from: id, text: p.selectionText }) }, { type: 'separator' });
    if (p.misspelledWord && p.dictionarySuggestions.length) items.unshift(...p.dictionarySuggestions.slice(0, 4).map(s => ({ label: s, click: () => wc.replaceMisspelling(s) })), { type: 'separator' });
    items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Reload', click: () => wc.reload() }, { type: 'separator' },
      { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

let blocker = null, blockOn = true;
async function setupWebSession() {
  const ses = session.fromPartition(WEB);
  ses.setUserAgent(ses.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?sanjivramos-shell\/\S+/i, '').replace(/\s?SanjivramOS\/\S+/, ''));
  // Downloads go straight to ~/Downloads; the browser shows progress.
  ses.on('will-download', (_e, item) => {
    const dir = path.join(os.homedir(), 'Downloads');
    fs.mkdirSync(dir, { recursive: true });
    let name = item.getFilename().replace(/[/\0]/g, '_') || 'download', file = path.join(dir, name), n = 1;
    const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    while (fs.existsSync(file)) file = path.join(dir, `${base} (${n++})${ext}`);
    item.setSavePath(file);
    const info = () => ({ id: item.getStartTime(), name: path.basename(file), path: file, received: item.getReceivedBytes(), total: item.getTotalBytes(), state: item.getState() });
    send('sj:download', info());
    let last = 0;
    item.on('updated', () => { if (Date.now() - last > 500) { last = Date.now(); send('sj:download', info()); } });
    item.once('done', () => send('sj:download', info()));
  });
  // Sites ask before using the camera, microphone or location; harmless things are just allowed.
  const ASK = { media: 'use your camera and microphone', geolocation: 'know your location', 'display-capture': 'see your screen' };
  const OK = new Set(['fullscreen', 'clipboard-sanitized-write', 'notifications', 'pointerLock', 'keyboardLock', 'window-management']);
  const asked = new Map();
  ses.setPermissionRequestHandler(async (wc, perm, cb, d) => {
    if (OK.has(perm)) return cb(true);
    if (!ASK[perm]) return cb(false);
    let host = ''; try { host = new URL(d.requestingUrl).host; } catch {}
    const key = host + '|' + perm;
    if (asked.has(key)) return cb(asked.get(key));
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Allow', 'Block'], defaultId: 1, cancelId: 1, title: 'Permission', message: `${host || 'This site'} wants to ${ASK[perm]}.` });
    asked.set(key, r.response === 0);
    cb(r.response === 0);
  });
  // Ad and tracker blocking (Ghostery's engine; the filter lists are cached on disk).
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const cache = path.join(app.getPath('userData'), 'adblock.bin');
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, { path: cache, read: fs.promises.readFile, write: fs.promises.writeFile });
    if (blockOn) blocker.enableBlockingInSession(ses);
  } catch (e) { console.error('[adblock] off:', e.message); }
}

ipcMain.handle('sj:adblock', (_e, on) => {
  blockOn = !!on;
  const ses = session.fromPartition(WEB);
  if (!blocker) return false;
  try { if (blockOn) blocker.enableBlockingInSession(ses); else blocker.disableBlockingInSession(ses); } catch {}
  return true;
});
ipcMain.handle('sj:open-path', (_e, p) => shell.openPath(String(p || '')));
ipcMain.handle('sj:show-file', (_e, p) => { shell.showItemInFolder(String(p || '')); return true; });
ipcMain.handle('sj:clear-data', async () => { const ses = session.fromPartition(WEB); await ses.clearStorageData(); await ses.clearCache(); return true; });
ipcMain.handle('sj:print', (_e, id) => { const wc = webContents.fromId(+id); if (wc) wc.print(); return !!wc; });

/* ---------------- Main window ---------------- */
app.whenReady().then(() => {
  // Camera / mic / notifications / fullscreen for SanjivramOS itself (calls, voice messages, games).
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(isLocal(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => isLocal(origin));
  setupWebSession();

  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().bounds, title: TITLE, frame: false, backgroundColor: '#05060a', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, webviewTag: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('page-title-updated', e => e.preventDefault());   // the title is how Openbox recognises this window
  screen.on('display-metrics-changed', fitScreen);
  screen.on('display-added', fitScreen);
  screen.on('display-removed', fitScreen);

  // Only SanjivramOS (localhost) may host webviews, and they never get Node or our preload.
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    if (!isLocal(win.webContents.getURL())) return e.preventDefault();
    delete prefs.preload;
    Object.assign(prefs, { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true });
    params.partition = WEB;
  });
  app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'webview') setupWebview(wc); });

  // Popups from SanjivramOS itself (sign-in windows…): normal Openbox windows.
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 720, autoHideMenuBar: true, backgroundColor: '#ffffff' } }));
  // Server restarted / page crashed → splash until it's back.
  win.webContents.on('did-fail-load', (_e, code, _d, url, main) => { if (main && code !== -3 && url.startsWith(HOME_URL)) setTimeout(waitAndLoad, 1000); });
  win.webContents.on('render-process-gone', () => setTimeout(waitAndLoad, 500));
  globalShortcut.register('CommandOrControl+Shift+R', () => win.webContents.reloadIgnoringCache());
  globalShortcut.register('CommandOrControl+Alt+I', () => win.webContents.toggleDevTools());
  waitAndLoad();
});

// The session service starts the shell again if it ever quits.
app.on('window-all-closed', () => app.quit());
