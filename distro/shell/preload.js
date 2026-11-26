// What SanjivramOS (only when served from localhost) can use from the Electron shell: window.sjNative.
const { contextBridge, ipcRenderer } = require('electron');

if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(location.href)) {
  const on = ch => cb => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
  contextBridge.exposeInMainWorld('sjNative', {
    platform: 'sanjivramos-linux',
    version: 2,
    webview: true,                       // the Web Browser app can use <webview> tabs
    onNewTab: on('sj:newtab'),           // {from: webContentsId, url, background}
    onKey: on('sj:key'),                 // {from, combo} browser shortcuts pressed inside a page
    onSearch: on('sj:search'),           // {from, text}
    onDownload: on('sj:download'),       // {id, name, path, received, total, state}
    setAdblock: on2 => ipcRenderer.invoke('sj:adblock', !!on2),
    openPath: p => ipcRenderer.invoke('sj:open-path', p),
    showFile: p => ipcRenderer.invoke('sj:show-file', p),
    clearData: () => ipcRenderer.invoke('sj:clear-data'),
    print: id => ipcRenderer.invoke('sj:print', id),
  });
}
