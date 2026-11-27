// The small API the SanjivramOS system app's page can use: window.sys.
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = ch => cb => ipcRenderer.on(ch, (_e, d) => cb(d));
contextBridge.exposeInMainWorld('sys', {
  info: () => call('sys:info'), close: () => call('sys:close'), open: p => call('sys:open', p), power: w => call('sys:power', w),
  disks: () => call('install:disks'), install: cfg => call('install:start', cfg),
  onProgress: on('install:progress'), onLog: on('install:log'),
  wifiState: () => call('wifi:state'), wifiList: r => call('wifi:list', !!r), wifiSaved: () => call('wifi:saved'),
  wifiConnect: (ssid, password, hidden) => call('wifi:connect', { ssid, password, hidden: !!hidden }),
  wifiDisconnect: s => call('wifi:disconnect', s), wifiForget: s => call('wifi:forget', s), wifiRadio: on2 => call('wifi:radio', !!on2),
  displayGet: () => call('display:get'), displayApply: o => call('display:apply', o), brightness: p => call('display:brightness', p),
  soundGet: () => call('sound:get'), soundVolume: (id, v) => call('sound:volume', id, v), soundMute: (id, m) => call('sound:mute', id, !!m), soundDefault: id => call('sound:default', id),
  keyboardGet: () => call('keyboard:get'), keyboardSet: k => call('keyboard:set', k),
  datetimeGet: () => call('datetime:get'), datetimeSet: d => call('datetime:set', d),
  accountGet: () => call('account:get'), accountPassword: d => call('account:password', d), accountLock: d => call('account:lock', d),
  aboutGet: () => call('about:get'), setHostname: h => call('about:hostname', h),
});
