// Debug tools: the always-loaded part (docs/DEBUG.md, ROADMAP R-10). Off by default and safe for real players:
//  - turning debug on needs the password, asked by a small cozy prompt (DebugGatePanel below), from either way in:
//    ?debug in the URL, or seven taps on the version in Settings › About (ui/menu.js). The right password turns it on
//    and remembers it on this device (localStorage 'chewy3d.debug'), until Settings › About › Turn off.
//  - once on: F10 or ` (backquote), the HUD's little bug button (touch too) or Select+Start (View+Menu) on a pad open
//    the debug menu, which is a separate module (./debugMenu.js) only fetched then: a player with debug off never loads it.
// Everything here is small on purpose: the prompt, the keys, the pad combo, the bug button and the lazy load.
import { el } from '../ui/dom.js';
import { Panel } from '../ui/panel.js';
import { Actions } from '../core/actions.js';
import { checkPassword } from './registry.js';
import './access.css';

const KEY = 'chewy3d.debug';
const TRIES = 5, COOLDOWN = 30; // wrong passwords before a short breather, and its length (s)
export const BUG_SVG = '<svg class="dbg-bug-ic" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 9.5 7 6M22 9.5 25 6M6 17H2.5M29.5 17H26M7 24l-3 3M25 24l3 3" stroke="#4a2c2a" stroke-width="2.4" stroke-linecap="round" fill="none"/><ellipse cx="16" cy="18" rx="9.5" ry="10" fill="#ff7a8e" stroke="#4a2c2a" stroke-width="2.4"/><path d="M16 8.5V28" stroke="#4a2c2a" stroke-width="2"/><circle cx="16" cy="9.5" r="5" fill="#4a2c2a"/><circle cx="11.6" cy="16" r="1.9" fill="#4a2c2a"/><circle cx="20.4" cy="16" r="1.9" fill="#4a2c2a"/><circle cx="12.2" cy="22.4" r="1.6" fill="#4a2c2a"/><circle cx="19.8" cy="22.4" r="1.6" fill="#4a2c2a"/><circle cx="14.2" cy="8.4" r="1" fill="#fff"/><circle cx="17.8" cy="8.4" r="1" fill="#fff"/></svg>';
const stored = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
const store = on => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* private mode: this session only */ } };

/** The password prompt: a text field (touch keyboards; the pad's A focuses it), Unlock / Not now, a gentle shake on a
 *  wrong password and a short breather after five. */
class DebugGatePanel extends Panel {
  constructor(ui, api) { super(ui, { name: 'debugGate', title: 'Debug tools', jp: 'デバッグ', side: 'center', cls: 'p-dbg-gate', icon: 'key' }); this.api = api; this.wrong = 0; this.until = 0; this.overTitle = true; } // (overTitle: it can ask on the title screen too)
  build() {
    super.build();
    this.back = el('div', 'modal-bg'); this.wrap.prepend(this.back);
    this.back.addEventListener('click', () => this.ui.close('debugGate'));
  }
  init() {
    this.body.innerHTML = `<div class="dg">
      <div class="dg-top"><div class="dg-bug">${BUG_SVG}</div><p class="dg-t">Testing tools for the game's makers. They can change your save, so they need a password.</p></div>
      <form class="dg-f" autocomplete="off"><input class="dg-in" type="password" name="dbgpass" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Password" aria-label="Debug password" data-focus></form>
      <div class="dg-msg" aria-live="polite"></div>
      <div class="dg-btns"><button class="btn mint" data-a="ok" type="button">Unlock</button><button class="btn" data-a="cancel" type="button">Not now</button></div>
    </div>`;
    this.input = this.body.querySelector('.dg-in'); this.msg = this.body.querySelector('.dg-msg');
    this.body.querySelector('.dg-f').addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    this.input.addEventListener('click', () => this.input.focus()); // (the pad's A "clicks" it: focus, so a keyboard can type)
    this.input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { this.input.blur(); this.ui.close('debugGate'); } });
    this.body.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ok') this.submit(); else this.ui.close('debugGate'); });
  }
  onOpen() {
    this.input.value = ''; this.say(this.cooling() ? this.coolText() : '');
    this.tickCool();
    if (Actions.device !== 'pad') { try { this.input.focus({ preventScroll: true }); } catch (e) { /* */ } } // (a tap or a click opened it: the keyboard comes up at once)
  }
  onClose() { this.input?.blur(); clearInterval(this._cool); if (this.ui.mode === 'title') this.ui.layers.title?.classList.remove('behind'); }
  say(t, cls = '') { this.msg.textContent = t; this.msg.className = 'dg-msg' + (cls ? ' ' + cls : ''); }
  cooling() { return performance.now() < this.until; }
  coolText() { return `Let's take a little break… try again in ${Math.ceil((this.until - performance.now()) / 1000)} s.`; }
  tickCool() {
    clearInterval(this._cool);
    const on = this.cooling(); this.input.disabled = on; this.body.querySelector('[data-a="ok"]').disabled = on;
    if (!on) return;
    this._cool = setInterval(() => { if (this.cooling()) this.say(this.coolText()); else { clearInterval(this._cool); this.wrong = 0; this.input.disabled = false; this.body.querySelector('[data-a="ok"]').disabled = false; this.say('Okay, one more go!'); } }, 250);
  }
  async submit() {
    if (this.cooling() || this.busy) return;
    const text = this.input.value; if (!text.trim()) { this.shake(); this.say('Type the password first.'); return; }
    this.busy = true;
    let ok = false; try { ok = await checkPassword(text); } finally { this.busy = false; }
    if (ok) { this.wrong = 0; this.input.value = ''; this.input.blur(); this.ui.close('debugGate', true); this.api.enable({ open: true }); return; }
    this.wrong++; this.input.value = ''; this.shake(); this.ui.sfx?.('deny');
    if (this.wrong >= TRIES) { this.until = performance.now() + COOLDOWN * 1000; this.say(this.coolText(), 'bad'); this.tickCool(); }
    else this.say("Hmm, that's not it.", 'bad');
  }
  shake() { const p = this.panel; p.classList.remove('dg-shake'); void p.offsetWidth; p.classList.add('dg-shake'); }
}

/** Install the access layer on G (game.js, after the UI). → G.debug */
export function installDebugAccess(G) {
  const P = G.engine?.params || new URLSearchParams(location.search);
  const ui = G.ui;
  let on = stored(), menu = null, loading = null, taps = 0, lastTap = -1e9, bug = null;
  const api = G.debug = {
    get on() { return on; },
    get loaded() { return !!menu; },
    get isOpen() { return !!menu?.isOpen; },
    /** the right password went in (or it was already remembered): on, remembered, the bug button up */
    enable(o = {}) {
      const was = on; on = true; store(true);
      if (!was) { toast('Debug tools are on ♡', 'F10, ` , the bug button, or Select + Start on a pad'); G.save?.(); }
      syncBug();
      if (o.open) api.open();
      return true;
    },
    /** Settings › About › Turn off: forgotten on this device, the menu closed, the session toggles off */
    disable() {
      if (!on) return false;
      on = false; store(false);
      menu?.shutdown?.(); ui?.close?.('debug', true); ui?.close?.('debugGate', true);
      syncBug();
      toast('Debug tools are off', 'Seven taps on the version turn them on again');
      return true;
    },
    /** the password prompt (or straight on, when it's already remembered) */
    prompt() {
      if (on) return api.open();
      if (!ui?.open) return null;
      ui.close('menu', true); // (from Settings › About: the prompt takes the pause menu's place)
      if (ui.mode === 'title') ui.layers.title?.classList.add('behind'); // (over the title screen, as Settings is)
      ui._user = true; try { ui.open('debugGate'); } finally { ui._user = false; }
      return null;
    },
    async load() {
      if (menu) return menu;
      if (!on) return null;
      loading ||= import('./debugMenu.js').then(m => (menu = m.installDebugMenu(G, api))).catch(e => { console.error('[debug] the menu failed to load', e); loading = null; return null; });
      return loading;
    },
    async open(o) {
      if (!on) return api.prompt();
      if (ui?.mode === 'title' || G.titleActive) { toast('Debug tools are on', 'Start or continue the game, then F10 or the bug button'); return null; }
      const m = await api.load(); ui?.close?.('menu', true); m?.open(o); return m;
    },
    close() { menu?.close(); },
    async toggle() { if (!on) return null; if (menu?.isOpen) { menu.close(); return menu; } return api.open(); },
    /** Settings › About: seven taps on the version (within a couple of seconds of each other) */
    versionTap() {
      const now = performance.now();
      if (now - lastTap > 1500) taps = 0; // (a pause of more than a second and a half starts the count again)
      lastTap = now; taps++;
      if (on) { if (taps >= 3) { taps = 0; api.open(); } return; } // (already on: a few taps open the menu)
      const left = 7 - taps;
      if (left <= 0) { taps = 0; api.prompt(); return; }
      if (left <= 3) toast(`${left} more tap${left > 1 ? 's' : ''}…`);
    },
    /** per frame, right after Actions.poll (game.js): Select + Start on a pad, and the menu's own tick (its toggles) */
    frame(dt) {
      if (on) padCombo();
      menu?.frame?.(dt);
      if ((bugT -= dt) <= 0) { bugT = 0.5; placeBug(); }
    },
  };
  let bugT = 0;
  function toast(text, sub) { const T = ui?.toasts; if (T?.show) T.show(text, { icon: 'key', color: '#ffb0c8', sub }); else ui?.toast?.(text); }
  // ---- the password prompt panel (the UI's own panel list: padNav, the phone layout and Esc / B all just work)
  if (ui?.panels) ui.panels.debugGate = new DebugGatePanel(ui, api);
  // ---- keys: F10 or ` toggle the menu (only once debug is on: off, they do nothing at all)
  addEventListener('keydown', e => {
    if (!on || e.repeat) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'F10' || e.code === 'Backquote') { e.preventDefault(); api.toggle(); }
  });
  // ---- the pad: Select + Start (View + Menu) together; whichever went first doesn't also open its own panel
  function padCombo() {
    const A = Actions;
    if (!(A.padDown('View') && A.padDown('Menu')) || !(A.padHit('View') || A.padHit('Menu'))) return;
    const fresh = { View: A.padHit('View'), Menu: A.padHit('Menu') };
    A.padConsume('View'); A.padConsume('Menu');
    for (const [btn, panel] of [['View', 'map'], ['Menu', 'menu']]) if (!fresh[btn] && (A.holdT.get(btn) || 0) < 0.7 && ui?.isOpen?.(panel)) ui.close(panel, true); // (it went down a moment earlier and opened its own panel)
    api.toggle();
  }
  // ---- the HUD's bug button: left of the minimap (and of the touch buttons beside it), hidden on the title
  function syncBug() {
    if (!ui?.layers?.hud) return;
    if (!on) { bug?.remove(); bug = null; return; }
    if (!bug) {
      bug = el('button', 'dbg-bug', BUG_SVG); bug.type = 'button'; bug.title = 'Debug tools (F10)'; bug.setAttribute('aria-label', 'Debug tools');
      bug.addEventListener('click', e => { e.stopPropagation(); api.toggle(); });
      for (const ev of ['pointerdown', 'touchstart', 'mousedown']) bug.addEventListener(ev, e => e.stopPropagation(), { passive: true });
      ui.layers.over.appendChild(bug); // (screen pixels: the HUD layer is zoomed on touch; on a phone it hides while a panel is open)
    }
    placeBug();
  }
  // (QA tools' screenshots stay clean: under automation the bug shows only with ?debug in the URL or while the menu is open)
  const auto = typeof navigator !== 'undefined' && navigator.webdriver && !P.has('debug');
  function placeBug() {
    if (!bug) return;
    const R = ui.root, title = R?.dataset.mode === 'title', hide = title || (auto && !menu?.isOpen) || G.ui?.dlg?.active || (R?.classList.contains('m-phone') && R.classList.contains('has-panel'));
    bug.classList.toggle('hide', !!hide);
    if (hide) return;
    let x = innerWidth, top = 12;
    for (const e of document.querySelectorAll('.hud .mm-wrap, .hud .clock, .tc.on .tc-top .tc-b')) {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.top > 200) continue;
      if (r.left < x) { x = r.left; top = Math.max(8, r.top + 4); }
    }
    bug.style.left = `${Math.max(8, x - (bug.offsetWidth || 40) - 10)}px`; bug.style.top = `${top}px`;
  }
  syncBug();
  // ---- ?debug: the prompt as soon as the game is up (already remembered: nothing to ask)
  if (P.has('debug')) {
    if (on) api.load();
    else { const ask = () => (window.__ready && ui?.ready ? api.prompt() : setTimeout(ask, 300)); setTimeout(ask, 300); }
  }
  return api;
}
