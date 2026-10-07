// Pawhaven's desktop shell (docs/DESKTOP.md, docs/CONTROLS.md §5 and §11, ROADMAP CT-4): one Electron window that
// plays the production build from the app's own files. The main process does nothing else: it serves the game on a
// private app:// origin (a secure context, so the Gamepad API is there; saves are that origin's localStorage, kept in
// the app's userData folder), opens full screen without browser chrome, toggles windowed on F11 / Alt+Enter or from
// Settings (remembered in userData/window.json), and quits when the game asks.
//
// Switches (for testing; the packaged app needs none):
//   --windowed / --fullscreen     start that way this time (not remembered)
//   --deck / --no-deck            report a Steam Deck to the game (else Steam's SteamDeck=1 decides)
//   --user-data=<dir>             keep saves and window state there instead of the app's userData
//   --query=<qs>                  open the game with that query string (e.g. fresh&nointro)
//   --url=<url>                   load a URL instead of the packaged build (e.g. the dev server)
//   --game-dir=<dir>              serve the game from that folder
const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const arg = (name) => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const userData = arg('user-data');
if (typeof userData === 'string') app.setPath('userData', path.resolve(userData));
app.setAppUserModelId?.('com.holiestdiver.pawhaven');
// the GPU: WebGL2 on every driver Chromium might blocklist (the Deck's Mesa / RADV included), as the QA browsers run
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // (the music starts on the title, no click needed)

const GAME = (() => {
  const want = arg('game-dir');
  if (typeof want === 'string') return path.resolve(want);
  const packed = path.join(__dirname, 'game');
  return fs.existsSync(path.join(packed, 'index.html')) ? packed : path.resolve(__dirname, '../../dist-desktop/app/game'); // (run from tools/desktop/ after a build)
})();
const DECK = arg('no-deck') ? false : arg('deck') ? true : process.env.SteamDeck === '1';
const STATE = () => path.join(app.getPath('userData'), 'window.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch (e) { return {}; } };
const writeState = (s) => { try { fs.mkdirSync(path.dirname(STATE()), { recursive: true }); fs.writeFileSync(STATE(), JSON.stringify(s)); } catch (e) { /* read-only: never mind */ } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };

// app://pawhaven/… → the game's files: a standard, secure origin (localStorage, fetch, module scripts, the Gamepad API)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

const PRIMARY = app.requestSingleInstanceLock(); // (a second launch only focuses the first window: see 'second-instance')
if (!PRIMARY) app.quit();
let win = null;

function serve() {
  protocol.handle('app', async (req) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url).pathname); } catch (e) { return new Response('bad request', { status: 400 }); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(GAME, rel));
    if (file !== GAME && !file.startsWith(GAME + path.sep)) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } });
    } catch (e) { return new Response('not found', { status: 404 }); }
  });
}

function createWindow() {
  const st = readState();
  const full = arg('windowed') ? false : arg('fullscreen') ? true : st.fullscreen !== false; // (full screen unless the player chose windowed)
  const b = st.bounds || {};
  win = new BrowserWindow({
    title: 'Pawhaven', width: b.width || 1280, height: b.height || 800, x: b.x, y: b.y, minWidth: 960, minHeight: 600,
    fullscreen: full, autoHideMenuBar: true, backgroundColor: '#2b2033', show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      additionalArguments: [`--pawhaven-deck=${DECK ? 1 : 0}`, `--pawhaven-fullscreen=${full ? 1 : 0}`, `--pawhaven-version=${app.getVersion()}`],
    },
  });
  const save = (full = win?.isFullScreen()) => { if (!win || win.isDestroyed()) return; const s = readState(); s.fullscreen = !!full; if (!full && !win.isFullScreen() && !win.isMaximized()) s.bounds = win.getBounds(); writeState(s); };
  // (the events say which way it went: on Windows isFullScreen() still reports the old state while they fire)
  const tell = (on) => { if (win && !win.isDestroyed()) win.webContents.send('pawhaven:fullscreen', on); };
  win.on('enter-full-screen', () => { tell(true); save(true); });
  win.on('leave-full-screen', () => { tell(false); save(false); });
  win.on('close', () => save());
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  // F11 and Alt+Enter toggle full screen (the game never sees them)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  // nothing but the game in this window: links open in the system browser, no pop-ups, no navigating away
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://pawhaven/') && !(typeof arg('url') === 'string' && url.startsWith(new URL(arg('url')).origin))) e.preventDefault(); });
  const q = arg('query'), url = arg('url');
  win.loadURL(typeof url === 'string' ? url : `app://pawhaven/index.html${typeof q === 'string' && q ? '?' + q : ''}`);
  win.on('closed', () => { win = null; });
}

ipcMain.on('pawhaven:quit', () => { if (win && !win.isDestroyed()) win.close(); else app.quit(); }); // (close: the game's beforeunload saves first)
ipcMain.on('pawhaven:fullscreen', (e, on) => { if (win && !win.isDestroyed()) win.setFullScreen(!!on); });

Menu.setApplicationMenu(null);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { if (!PRIMARY) return; serve(); createWindow(); });
app.on('window-all-closed', () => app.quit());
