// Pawhaven's desktop shell (docs/DESKTOP.md, docs/CONTROLS.md §5 and §11, ROADMAP CT-4): one Electron window that
// plays the production build from the app's own files. The main process does nothing else: it serves the game on a
// private app:// origin (a secure context, so the Gamepad API is there; saves are that origin's localStorage, kept in
// the app's userData folder), opens full screen without browser chrome, toggles windowed on F11 / Alt+Enter or from
// Settings (remembered in userData/window.json), and quits when the game asks. It also updates itself (CT-9,
// docs/DESKTOP.md "Updates from inside the app", tools/desktop/updater.cjs): the game asks it to check GitHub's latest
// release, then to install a content update (a game zip into userData/updates/, served in place of the built-in game,
// on trial until the title comes up, rolled back if it doesn't) or a shell update (a new AppImage swapped in).
//
// Switches (for testing; the packaged app needs none):
//   --windowed / --fullscreen     start that way this time (not remembered)
//   --deck / --no-deck            report a Steam Deck to the game (else Steam's SteamDeck=1 decides)
//   --user-data=<dir>             keep saves and window state there instead of the app's userData
//   --query=<qs>                  open the game with that query string (e.g. fresh&nointro)
//   --url=<url>                   load a URL instead of the packaged build (e.g. the dev server; no updates)
//   --game-dir=<dir>              serve the game from that folder (no updates)
//   --no-updates                  never check for updates
//   --update-url=<url>            the QA: take update.json from a local test server (loopback http(s) only)
//   --update-boot-timeout=<s>     the QA (with --update-url): how long a fresh update may take to reach the title
const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const U = require('./updater.cjs');

const arg = (name) => { const a = process.argv.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a == null ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const userData = arg('user-data');
if (typeof userData === 'string') app.setPath('userData', path.resolve(userData));
app.setAppUserModelId?.('com.holiestdiver.pawhaven');
// the GPU: WebGL2 on every driver Chromium might blocklist (the Deck's Mesa / RADV included), as the QA browsers run
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // (the music starts on the title, no click needed)

const BUILTIN = (() => {
  const want = arg('game-dir');
  if (typeof want === 'string') return path.resolve(want);
  const packed = path.join(__dirname, 'game');
  return fs.existsSync(path.join(packed, 'index.html')) ? packed : path.resolve(__dirname, '../../dist-desktop/app/game'); // (run from tools/desktop/ after a build)
})();
let GAME = BUILTIN; // the folder app://pawhaven serves: the built-in game, or an installed update (userData/updates/game-<version>)
// updates: the packaged app checks GitHub; the QA's --update-url may point at a local server (loopback only)
const UPDATES = (() => {
  const url = arg('update-url');
  if (arg('no-updates') || typeof arg('url') === 'string' || typeof arg('game-dir') === 'string') return null;
  if (typeof url === 'string') {
    if (!U.allowedUrl(url, { test: true }) || U.allowedUrl(url, {})) { console.warn('[updates] --update-url must be a loopback address: updates are off'); return null; }
    const t = +arg('update-boot-timeout');
    return { url, policy: { test: true }, bootMs: t > 0 ? t * 1000 : 60000 };
  }
  return app.isPackaged ? { url: U.MANIFEST_URL, policy: {}, bootMs: 60000 } : null;
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
      additionalArguments: [`--pawhaven-deck=${DECK ? 1 : 0}`, `--pawhaven-fullscreen=${full ? 1 : 0}`, `--pawhaven-version=${app.getVersion()}`, `--pawhaven-updates=${UPDATES ? 1 : 0}`],
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
  const url = arg('url');
  win.loadURL(typeof url === 'string' ? url : GAME_URL());
  win.on('closed', () => { win = null; });
}
const GAME_URL = () => { const q = arg('query'); return `app://pawhaven/index.html${typeof q === 'string' && q ? '?' + q : ''}`; };

ipcMain.on('pawhaven:quit', () => { if (win && !win.isDestroyed()) win.close(); else app.quit(); }); // (close: the game's beforeunload saves first)
ipcMain.on('pawhaven:fullscreen', (e, on) => { if (win && !win.isDestroyed()) win.setFullScreen(!!on); });

// ---------------------------------------------------------------- updates (CT-9)
let store = null, CURRENT = null; // the content store (userData/updates) and { version, source } of the game being served
const S = { manifest: null, auto: null, dismissed: false, busy: false, ac: null, notice: null, trial: null };
const log = (...a) => console.log('[updates]', ...a);
const progress = p => { if (win && !win.isDestroyed()) win.webContents.send('pawhaven:update-progress', p); };
const reason = e => (e?.code === 'HASH_MISMATCH' ? 'the download failed its safety check, so it was thrown away' : e?.name === 'AbortError' ? 'cancelled' : /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|timed out|socket hang up/i.test(`${e?.code} ${e?.message}`) ? "couldn't reach GitHub" : String(e?.message || e).slice(0, 160));
const where = () => ({ shellVersion: app.getVersion(), gameVersion: CURRENT.version, platform: process.platform, appImage: process.platform === 'linux' ? process.env.APPIMAGE || '' : '', bad: store.read().bad });
function offer(m, manual) {
  const d = U.decide(m, where());
  if (d.kind === 'none') return { status: 'none', current: CURRENT.version, latest: m.version };
  if (d.failed && !manual) return { status: 'none', current: CURRENT.version, latest: m.version, skipped: true }; // (it failed to start: only a manual check offers it again)
  return { status: 'available', kind: d.kind, version: m.version, current: CURRENT.version, notes: m.notes, released: m.released, size: d.asset?.size || 0, failed: d.failed, page: m.page };
}
async function check({ manual = false } = {}) {
  if (S.busy) return { status: 'busy' };
  if (!manual && S.dismissed) return { status: 'dismissed', current: CURRENT.version }; // (Later: not again until the next launch)
  if (!manual && S.auto) return offer(S.auto, false); // (the launch check runs once a session: a reload to the title doesn't fetch again)
  try {
    const m = await U.fetchManifest(UPDATES.url, { policy: UPDATES.policy, timeout: manual ? 15000 : 10000, ua: `Pawhaven/${app.getVersion()}` });
    if (!m) return { status: 'none', current: CURRENT.version };
    S.manifest = m; if (!manual) S.auto = m;
    return offer(m, manual);
  } catch (e) { log('check failed:', e.message); return { status: 'error', error: reason(e), current: CURRENT.version }; }
}
/** load the game again from GAME; force: kill a stuck page first if the load doesn't commit */
function reloadGame(force) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents; let committed = false;
  wc.once('did-navigate', () => { committed = true; });
  wc.loadURL(GAME_URL()).catch(() => {});
  if (force) setTimeout(() => { if (!committed && win && !win.isDestroyed()) { log('the page is stuck: restarting its process'); try { wc.forcefullyCrashRenderer(); } catch (e) { /* */ } wc.loadURL(GAME_URL()).catch(() => {}); } }, 8000);
}
/** a freshly installed version: it must reach window.__ready in time, or the app goes back to the one before it */
function watchTrial(version) {
  const wc = win.webContents, t0 = Date.now(); let armed = false, asking = false, done = false;
  const end = () => { done = true; clearInterval(iv); wc.off('render-process-gone', gone); wc.off('did-navigate', arm); S.trial = null; };
  const fail = why => {
    if (done) return; end();
    log(`${version} failed to start (${why}): rolling back`);
    const p = store.rollback(version, why); GAME = p.dir; CURRENT = p; S.auto = null;
    S.notice = null; // (the store keeps the rollback's notice: the title shows it, now or at the next start)
    reloadGame(true);
  };
  const gone = () => fail('its page crashed');
  const arm = () => { armed = true; }; // (only the new page counts: before it commits, window.__ready is still the old page's)
  wc.on('render-process-gone', gone); wc.on('did-navigate', arm);
  const iv = setInterval(() => {
    if (done) return;
    if (!win || win.isDestroyed()) { end(); return; }
    if (Date.now() - t0 > UPDATES.bootMs) { fail(`no title within ${UPDATES.bootMs / 1000} s`); return; }
    if (!armed || asking) return;
    asking = true;
    wc.executeJavaScript('window.__ready === true', true).then(ok => { asking = false; if (ok && !done) { end(); store.confirm(version); log(`${version} started: kept`); } }, () => { asking = false; });
  }, 1000);
  S.trial = version;
}
async function install() {
  if (S.busy) return { ok: false, error: 'an update is already on its way' };
  if (S.trial) return { ok: false, error: 'the last update is still starting' };
  const m = S.manifest || S.auto; if (!m) return { ok: false, error: 'check for updates first' };
  const d = U.decide(m, where());
  if (d.kind === 'none') return { ok: false, error: "you're already up to date" };
  if (d.kind === 'page') { shell.openExternal(m.page); return { ok: true, opened: true }; }
  S.busy = true; S.ac = new AbortController();
  const onProgress = ({ got, total }) => progress({ phase: 'download', got, total });
  try {
    if (d.kind === 'content') {
      const free = U.freeBytes(path.dirname(store.root));
      if (free != null && free < d.asset.size * 3 + 64 * 2 ** 20) throw new Error(`not enough free space (${Math.round(d.asset.size * 3 / 2 ** 20)} MB needed)`);
      progress({ phase: 'download', got: 0, total: d.asset.size });
      const zip = await U.download(d.asset, path.join(store.downloads, `pawhaven-game-${m.version}.zip`), { policy: UPDATES.policy, signal: S.ac.signal, onProgress, ua: `Pawhaven/${app.getVersion()}` });
      progress({ phase: 'install' });
      const p = await store.install(zip, { version: m.version, minShell: m.content.minShell });
      fs.rmSync(zip, { force: true });
      log(`installed ${p.version} (from ${CURRENT.version}): restarting the game`);
      S.notice = { kind: 'updated', version: p.version, from: CURRENT.version };
      GAME = p.dir; CURRENT = p; S.auto = null; S.manifest = null;
      progress({ phase: 'restart', version: p.version });
      setTimeout(() => { if (!win || win.isDestroyed()) return; watchTrial(p.version); reloadGame(false); }, 700);
      return { ok: true, restarting: true, version: p.version };
    }
    // a shell update: the new AppImage beside the running one, checked, swapped in, then the app restarts
    const target = process.env.APPIMAGE;
    if (!target || !fs.existsSync(target)) throw new Error('this copy is not running as an AppImage');
    try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch (e) { throw new Error(`can't write next to the app (${path.dirname(target)})`); }
    const free = U.freeBytes(path.dirname(target));
    if (free != null && free < d.asset.size * 2 + 64 * 2 ** 20) throw new Error(`not enough free space (${Math.round(d.asset.size * 2 / 2 ** 20)} MB needed)`);
    progress({ phase: 'download', got: 0, total: d.asset.size });
    const fresh = await U.download(d.asset, U.appImageTemp(target), { policy: UPDATES.policy, signal: S.ac.signal, onProgress, ua: `Pawhaven/${app.getVersion()}` });
    progress({ phase: 'install' });
    const r = U.swapAppImage(target, fresh);
    log(`swapped in the ${m.version} AppImage (the old one kept: ${r.prev || 'no'}): restarting`);
    progress({ phase: 'restart', version: m.version, shell: true });
    app.relaunch({ execPath: target, args: U.relaunchArgs(process.argv) });
    setTimeout(() => app.quit(), 700); // (quit closes the window: the game's beforeunload saves)
    return { ok: true, restarting: true, version: m.version, shell: true };
  } catch (e) {
    log('install failed:', e.message);
    return { ok: false, error: reason(e), cancelled: e?.name === 'AbortError' };
  } finally { S.busy = false; S.ac = null; }
}
function updateInfo() {
  const notice = S.notice || store.takeNotice(); S.notice = null;
  return { enabled: true, shell: app.getVersion(), game: CURRENT.version, source: CURRENT.source, builtIn: store.builtInVersion, platform: process.platform, appImage: !!(process.platform === 'linux' && process.env.APPIMAGE), busy: S.busy, notice };
}
ipcMain.handle('pawhaven:update', async (e, op, o) => {
  if (!UPDATES || !store || !win || e.sender !== win.webContents || !String(e.senderFrame?.url || '').startsWith('app://pawhaven/')) return { status: 'disabled' };
  const opts = o && typeof o === 'object' ? o : {};
  switch (op) {
    case 'info': return updateInfo();
    case 'check': return check({ manual: !!opts.manual });
    case 'install': return install();
    case 'cancel': S.ac?.abort(); return { ok: true };
    case 'later': S.dismissed = true; return { ok: true };
    case 'page': { const m = S.manifest || S.auto; shell.openExternal(m?.page && U.allowedUrl(m.page, {}) ? m.page : U.RELEASES_URL); return { ok: true }; }
    default: return { status: 'unknown' };
  }
});

Menu.setApplicationMenu(null);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  if (!PRIMARY) return;
  if (UPDATES) {
    try {
      const builtIn = U.gameVersionOf(BUILTIN) || app.getVersion();
      store = new U.ContentStore({ root: path.join(app.getPath('userData'), 'updates'), builtInDir: BUILTIN, builtInVersion: builtIn, shellVersion: app.getVersion(), log });
      CURRENT = store.boot(); GAME = CURRENT.dir;
      log(`serving ${CURRENT.source === 'update' ? 'the update' : 'the built-in game'} ${CURRENT.version} (shell ${app.getVersion()})`);
    } catch (e) { console.error('[updates] the update folder is unusable: the built-in game runs', e); store = null; GAME = BUILTIN; }
  }
  serve(); createWindow();
});
app.on('window-all-closed', () => app.quit());
