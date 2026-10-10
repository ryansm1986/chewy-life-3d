// The desktop shell's bridge (tools/desktop/main.cjs, docs/DESKTOP.md): what the game may know and ask of the app.
// window.pawhaven = { desktop: true, deck, platform, version, isFullscreen(), setFullscreen(on), onFullscreen(fn), quit() }
//   deck: Steam reports a Steam Deck (SteamDeck=1): the game then starts on its Deck preset (src/core/deck.js)
//   isFullscreen / setFullscreen / onFullscreen: Settings › Full screen and F11 / Alt+Enter (the app remembers the choice)
//   quit(): closes the window (the game saves on beforeunload) and the app
//   update (CT-9, docs/DESKTOP.md "Updates from inside the app"; null when updates are off): info() → { shell, game,
//     source, notice, … }; check({ manual }) → { status: none | available | error | dismissed, version, notes, size,
//     kind: content | shell | page, failed }; install() (progress through onProgress(fn): { phase: download | install
//     | restart, got, total }); cancel(); later() (no more asking until the next launch); openPage() (the release)
const { contextBridge, ipcRenderer } = require('electron');

const flag = (name) => { const a = process.argv.find(x => x.startsWith(`--pawhaven-${name}=`)); return a ? a.slice(a.indexOf('=') + 1) : ''; };
let full = flag('fullscreen') === '1';
const subs = new Set();
ipcRenderer.on('pawhaven:fullscreen', (e, on) => { full = !!on; for (const fn of subs) { try { fn(full); } catch (err) { /* a listener's own trouble */ } } });
const usubs = new Set();
ipcRenderer.on('pawhaven:update-progress', (e, p) => { for (const fn of usubs) { try { fn(p); } catch (err) { /* */ } } });
const ask = (op, o) => ipcRenderer.invoke('pawhaven:update', op, o);

contextBridge.exposeInMainWorld('pawhaven', {
  desktop: true,
  deck: flag('deck') === '1',
  platform: process.platform,
  version: flag('version'),
  isFullscreen: () => full,
  setFullscreen: (on) => ipcRenderer.send('pawhaven:fullscreen', !!on),
  onFullscreen: (fn) => { if (typeof fn === 'function') subs.add(fn); },
  quit: () => ipcRenderer.send('pawhaven:quit'),
  update: flag('updates') === '1' ? {
    info: () => ask('info'),
    check: (o) => ask('check', { manual: !!o?.manual }),
    install: () => ask('install'),
    cancel: () => ask('cancel'),
    later: () => ask('later'),
    openPage: () => ask('page'),
    onProgress: (fn) => { if (typeof fn === 'function') usubs.add(fn); return () => usubs.delete(fn); },
  } : null,
});
