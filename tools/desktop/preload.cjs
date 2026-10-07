// The desktop shell's bridge (tools/desktop/main.cjs, docs/DESKTOP.md): what the game may know and ask of the app.
// window.pawhaven = { desktop: true, deck, platform, version, isFullscreen(), setFullscreen(on), onFullscreen(fn), quit() }
//   deck: Steam reports a Steam Deck (SteamDeck=1): the game then starts on its Deck preset (src/core/deck.js)
//   isFullscreen / setFullscreen / onFullscreen: Settings › Full screen and F11 / Alt+Enter (the app remembers the choice)
//   quit(): closes the window (the game saves on beforeunload) and the app
const { contextBridge, ipcRenderer } = require('electron');

const flag = (name) => { const a = process.argv.find(x => x.startsWith(`--pawhaven-${name}=`)); return a ? a.slice(a.indexOf('=') + 1) : ''; };
let full = flag('fullscreen') === '1';
const subs = new Set();
ipcRenderer.on('pawhaven:fullscreen', (e, on) => { full = !!on; for (const fn of subs) { try { fn(full); } catch (err) { /* a listener's own trouble */ } } });

contextBridge.exposeInMainWorld('pawhaven', {
  desktop: true,
  deck: flag('deck') === '1',
  platform: process.platform,
  version: flag('version'),
  isFullscreen: () => full,
  setFullscreen: (on) => ipcRenderer.send('pawhaven:fullscreen', !!on),
  onFullscreen: (fn) => { if (typeof fn === 'function') subs.add(fn); },
  quit: () => ipcRenderer.send('pawhaven:quit'),
});
