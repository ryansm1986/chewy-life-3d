// The desktop app's update card (docs/DESKTOP.md "Updates from inside the app", ROADMAP CT-9). Only the desktop app has
// window.pawhaven.update (tools/desktop/preload.cjs): in a browser, on itch or with updates off, UPD is null and none of
// this shows. The card is the pause menu's 'update' view (ui/menu.js), so the controller's focus ring and glyphs,
// touch and the mouse work as in any panel:
//   - the launch check: once the title is up, the app asks GitHub; a newer version opens the card over the title
//     (Install now / Later). Offline or any trouble: silent. Later: not again until the next launch (the app keeps it);
//   - Settings › About › Check for updates: the same card, from Settings (it says "up to date", or a gentle error);
//   - Install now: the download's progress, then the app reloads the game into the new version (a shell update
//     restarts the app). On the new title a toast says so; after a rollback, it says that instead.
// The QA reads ui.desktopUpdate (this module's state): tools/qa/desktop-update.mjs.
import { esc } from './dom.js';
import { glyph } from './glyphs.js';
import CSS from './desktopUpdate.css?inline';
import { version as VERSION } from '../../package.json';

export const UPD = globalThis.pawhaven?.desktop && globalThis.pawhaven.update ? globalThis.pawhaven.update : null;
const st = { phase: 'idle', res: null, error: '', got: 0, total: 0, auto: 'off', shown: 0, back: null, info: null };
let UI = null, inflight = false; // (inflight: an install is under way; a progress message that lands after its answer is ignored)

const MB = n => (n >= 2 ** 30 ? (n / 2 ** 30).toFixed(1) + ' GB' : Math.max(0.1, n / 2 ** 20).toFixed(n >= 100 * 2 ** 20 ? 0 : 1) + ' MB');
const BUSY = new Set(['downloading', 'installing', 'restarting']);
export const updateBusy = () => BUSY.has(st.phase);

/** set up the card and the launch check (ui/desktop.js installDesktop calls this once) */
export function installUpdates(ui) {
  if (!UPD) return;
  UI = ui; ui.desktopUpdate = st;
  try { const s = document.createElement('style'); s.id = 'desktop-update-css'; s.textContent = CSS; document.head.appendChild(s); } catch (e) { /* */ }
  UPD.onProgress(p => {
    if (!p || !inflight) return;
    st.phase = p.phase === 'download' ? 'downloading' : p.phase === 'install' ? 'installing' : p.phase === 'restart' ? 'restarting' : st.phase;
    if (p.phase === 'download') { st.got = p.got || 0; st.total = p.total || st.total; }
    if (p.phase === 'restart') { st.version = p.version; st.shellRestart = !!p.shell; }
    render();
  });
  // what happened last time (an update installed, or rolled back), shown once the title is on screen
  UPD.info().then(i => { st.info = i; if (i?.notice) whenTitle(() => notice(i.notice)); }).catch(() => {});
  // the launch check: once, a moment after the title appears (the app remembers it for the session)
  st.auto = 'waiting';
  whenTitle(() => {
    st.auto = 'checking';
    UPD.check({ manual: false }).then(r => { st.auto = 'done'; st.autoRes = r; if (r?.status === 'available') offerFromTitle(r); }, () => { st.auto = 'done'; });
  }, 1800);
}

/** run fn once the game has booted to an idle title (no menu, no transition), checking every half second for a minute */
function whenTitle(fn, delay = 0) {
  let n = 0;
  const t = setInterval(() => {
    const ui = UI; if (++n > 120) { clearInterval(t); return; }
    if (!window.__ready || ui?.mode !== 'title') return;
    clearInterval(t);
    setTimeout(fn, delay);
  }, 500);
}

function offerFromTitle(r) {
  const ui = UI;
  let n = 0;
  const t = setInterval(() => { // (if Settings is open over the title, wait for it to close; if a game started, drop it)
    if (++n > 600 || ui.mode !== 'title') { clearInterval(t); return; }
    if (ui.iris?.active || ui.dlg?.active || Object.entries(ui.panels || {}).some(([n, p]) => p?.isOpen && !ui.nonBlocking?.(n))) return; // (anyModal() is always true on the title)
    clearInterval(t);
    st.res = r; st.phase = 'available'; st.back = null; st.shown++;
    ui.layers.title?.classList.add('behind'); // (as Settings does: ui/title.js)
    const off = ui.G?.events?.on?.('ui:close', e => { if (e?.name === 'menu') { ui.layers.title?.classList.remove('behind'); off?.(); } });
    ui.open('menu', { view: 'update', from: 'title' });
  }, 250);
}

function notice(n) {
  const ui = UI; if (!ui || !n) return;
  if (n.kind === 'updated') ui.toast?.(`Pawhaven is now v${n.version} ♡`, { icon: 'sparkle', color: '#c9f5e4', duration: 6 });
  else if (n.kind === 'rolledBack') ui.toast?.(`That update (v${n.version}) wouldn't start, so Pawhaven went back to v${n.to || VERSION}. Your save is safe ♡`, { icon: 'save', color: '#ffd8a8', duration: 9 });
}

// ---------------------------------------------------------------- the card (the menu's .mn-update view)
/** Settings › About › Check for updates: the card from Settings, checking by hand */
export function checkFromSettings(menu) {
  if (!UPD) return;
  st.back = 'settings';
  if (!BUSY.has(st.phase)) { st.phase = 'checking'; st.res = null; st.error = ''; }
  menu.setView('update');
  if (st.phase !== 'checking') return;
  const t0 = performance.now();
  UPD.check({ manual: true }).then(r => {
    const go = () => {
      if (BUSY.has(st.phase) || st.phase !== 'checking') return; // (Back was pressed while it looked: leave it be)
      st.res = r;
      st.phase = r?.status === 'available' ? 'available' : r?.status === 'none' || r?.status === 'dismissed' ? 'none' : r?.status === 'busy' ? 'downloading' : 'error';
      st.error = r?.error || '';
      render();
    };
    setTimeout(go, Math.max(0, 600 - (performance.now() - t0))); // (a beat of "Looking…", so a fast answer doesn't flicker)
  }, e => { st.phase = 'error'; st.error = String(e?.message || e); render(); });
}

/** the menu's view HTML for the current phase */
export function updateHTML() {
  const r = st.res || {}, cur = r.current || st.info?.game || VERSION;
  UI?.panels?.menu?.panel?.classList.toggle('upd-busy', st.phase === 'installing' || st.phase === 'restarting'); // (no close button while it unpacks and restarts)
  const btn = (a, label, g, cls = '') => `<button class="btn ${cls}" data-a="${a}">${glyph(g)}${label}</button>`;
  const head = (g, t, sub = '') => `<div class="up-head"><div class="up-badge">${glyph(g)}</div><div><div class="up-t">${t}</div>${sub ? `<div class="up-sub">${sub}</div>` : ''}</div></div>`;
  switch (st.phase) {
    case 'checking':
      return `${head('sparkle', 'Looking for a new version…', `You have Pawhaven v${esc(cur)}`)}<div class="up-bar wait"><i></i></div><div class="up-btns">${btn('back', 'Back', 'swap')}</div>`;
    case 'none':
      return `${head('check', "You're up to date ♡", `Pawhaven v${esc(cur)} is the newest version.`)}<div class="up-btns">${btn('back', 'Back', 'swap')}</div>`;
    case 'error':
      return `${head('question', "Couldn't check for updates", `${esc(cap(st.error || 'something went wrong'))}. Check the internet connection and try again.`)}<div class="up-btns">${btn('updRetry', 'Try again', 'sort', 'mint')}${btn('back', 'Back', 'swap')}</div>`;
    case 'failed':
      return `${head('question', "The update didn't install", `${esc(cap(st.error || 'something went wrong'))}. Nothing changed: you're still on v${esc(cur)}.`)}<div class="up-btns">${btn('updInstall', 'Try again', 'sort', 'mint')}${btn('back', 'Back', 'swap')}</div>`;
    case 'downloading': {
      const p = st.total ? Math.min(1, st.got / st.total) : 0;
      return `${head('save', `Downloading v${esc(r.version || '')}…`, st.total ? `${MB(st.got)} of ${MB(st.total)}` : 'Starting…')}<div class="up-bar"><i style="width:${(p * 100).toFixed(1)}%"></i><b>${Math.round(p * 100)}%</b></div><div class="up-note">Your save stays exactly as it is.</div><div class="up-btns">${btn('updCancel', 'Cancel', 'exit')}</div>`;
    }
    case 'installing':
      return `${head('sparkle', `Installing v${esc(r.version || '')}…`, 'Checked and safe. Unpacking it now.')}<div class="up-bar full"><i style="width:100%"></i></div>`;
    case 'restarting':
      return `${head('sakura', `Restarting into v${esc(st.version || r.version || '')}…`, st.shellRestart ? 'The app closes and opens again by itself.' : 'Just a moment.')}<div class="up-bar full"><i style="width:100%"></i></div>`;
    case 'available': {
      const page = r.kind === 'page', shellUp = r.kind === 'shell';
      const sub = page ? `You have v${esc(cur)}. This one needs the new app: download it from the release page (your saves stay).`
        : `You have v${esc(cur)} · ${MB(r.size || 0)} download${shellUp ? ' (the app itself: it restarts when done)' : ''}`;
      const notes = r.notes ? `<div class="up-notes">${esc(r.notes).replace(/\n/g, '<br>')}</div>` : '';
      const failed = r.failed ? `<div class="up-note warn">It didn't start last time. Trying again is safe: if it doesn't start, Pawhaven goes back by itself.</div>` : '';
      return `${head('gift', `Update available: v${esc(r.version)}`, sub)}${notes}${failed}<div class="up-btns">${page ? btn('updPage', 'Open the download page', 'map', 'pink big') : btn('updInstall', 'Install now', 'sparkle', 'pink big')}${btn('updLater', 'Later', 'swap', 'big')}</div>`;
    }
    default: return `${head('paw', 'Updates')}<div class="up-btns">${btn('back', 'Back', 'swap')}</div>`;
  }
}
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function render() {
  const v = UI?.panels?.menu?.body?.querySelector('.mn-update');
  if (v) v.innerHTML = updateHTML();
}
export const renderUpdate = render;

/** a button on the card (ui/menu.js act) → true when handled */
export function updateAct(menu, a) {
  if (!UPD) return false;
  if (a === 'updInstall') { install(menu); return true; }
  if (a === 'updLater') { UPD.later(); st.phase = 'idle'; leave(menu); return true; }
  if (a === 'updCancel') { UPD.cancel(); return true; }
  if (a === 'updRetry') { checkFromSettings(menu); return true; }
  if (a === 'updPage') { UPD.openPage(); UPD.later(); st.phase = 'idle'; leave(menu); return true; }
  return false;
}
/** Back on the card: to Settings when it came from there, else close it (Later). Nothing while it installs. */
export function updateBack(menu) {
  if (BUSY.has(st.phase) && st.phase !== 'downloading') return;
  if (st.phase === 'downloading') { UPD.cancel(); return; }
  if (st.phase === 'available') UPD.later();
  st.phase = 'idle'; leave(menu);
}
function leave(menu) { if (st.back === 'settings') menu.setView('settings'); else menu.ui.close('menu'); }
/** the menu closed while the card showed (Esc, the backdrop): an offer means Later; a download stops (it resumes next time) */
export function updateClosed() {
  if (!UPD) return;
  if (st.phase === 'available') { UPD.later(); st.phase = 'idle'; }
  else if (st.phase === 'downloading') UPD.cancel();
  else if (!BUSY.has(st.phase)) st.phase = 'idle';
}

async function install(menu) {
  const G = menu.ui.G;
  if (G && !G.titleActive) { try { G.save?.(); } catch (e) { /* (the page's own unload save follows anyway) */ } } // (Settings during a game)
  st.phase = 'downloading'; st.got = 0; st.total = st.res?.size || 0; st.error = ''; render();
  inflight = true;
  const r = await UPD.install().catch(e => ({ ok: false, error: String(e?.message || e) }));
  if (!r?.ok || r.opened) inflight = false; // (restarting: the progress keeps coming until the page goes)
  if (r?.ok && r.opened) { st.phase = 'idle'; leave(menu); return; }
  if (r?.ok) return; // (restarting: the app reloads the game)
  st.phase = r?.cancelled ? (st.res ? 'available' : 'idle') : 'failed'; st.error = r?.error || '';
  render();
}
