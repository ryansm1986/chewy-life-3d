// The pad's tabbed menu (docs/CONTROLS.md §14.4, ROADMAP CT-11): Menu opens one console-style menu whose pages are the
// existing panels, and LB / RB move between them (wrapping):
//   Bag · Character · Skills · Journal · Map · Game (the pause page: Resume, Build, Decorate, Home, Save, Quit) · Settings
// It opens on the last page used (the first time: Game). A strip across the top names the pages, with the LB / RB glyphs at
// its ends; it marks itself .fit-above, so CT-10's fit (ui/fit.js) starts the panels' room under it.
//   - Each page is the panel the keys open (ui.open), so no panel is rewritten; switching closes one and opens the next.
//   - The pages' own tabs are LT / RT (ui/padNav.js asks subTab first): the Bag's views, the skill trees, the Journal's tabs;
//     Settings' are its pages here: General (the Settings rows) · Controller · Keyboard & mouse · Touch (Controls per device).
//   - B (after a held item or a popover: padNav) and Menu close the whole menu.
//   - Only while the pad plays: the keyboard, the mouse and touch open single panels as before. The page is read from
//     what's actually open every frame (current()), so a panel closed or opened by other means ends it cleanly.
import { Actions } from '../core/actions.js';
import { el } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph } from './padGlyphs.js';
import './padMenu.css';

/** [page, label, glyph] in strip order */
export const PAGES = [['inventory', 'Bag', 'bag'], ['character', 'Character', 'star'], ['skills', 'Skills', 'sparkle'], ['quests', 'Journal', 'book'], ['map', 'Map', 'map'], ['game', 'Game', 'paw'], ['settings', 'Settings', 'gear']];
/** Settings' own pages (LT / RT): [key, label] */
export const SETTINGS_PAGES = [['general', 'General'], ['pad', 'Controller'], ['kbm', 'Keyboard & mouse'], ['touch', 'Touch']];
const PANEL_PAGES = new Set(['inventory', 'character', 'skills', 'quests', 'map']);

export class PadMenu {
  constructor(ui) {
    this.ui = ui; this.active = false; this.last = 'game';
    this.root = el('div', 'pm-strip fit-above');
    ui.layers.over.appendChild(this.root);
    this.root.addEventListener('click', e => { const t = e.target.closest('.pm-tab'); if (t) this.show(t.dataset.k); }); // (a finger or a click on the strip works too)
  }
  /** the page now open (read from the panels), or null */
  current() {
    const U = this.ui;
    if (U.isOpen('menu')) { const v = U.panels.menu.view; return v === 'main' ? 'game' : v === 'settings' || v === 'controls' ? 'settings' : null; }
    for (const k of PANEL_PAGES) if (U.isOpen(k)) return k;
    return null;
  }
  /** Settings' page now: 'general' | 'pad' | 'kbm' | 'touch' */
  settingsPage() { const M = this.ui.panels.menu; return M.view === 'controls' ? M.dev || 'pad' : 'general'; }
  /** Menu on the pad: the menu on the last page used */
  open(page) {
    const U = this.ui; if (U.mode === 'title' || !U.ready) return;
    this.active = true;
    this.root.classList.add('on'); U.root.classList.add('pm-on'); // (before the panel opens: its fit starts under the strip)
    this.show(page || this.last || 'game');
    this.render();
  }
  /** B or Menu: the whole menu closes (the page's panel and the bag's companions) */
  close() {
    const U = this.ui; this.active = false;
    U._user = true;
    try { if (U.isOpen('menu')) U.close('menu'); for (const k of PANEL_PAGES) if (U.isOpen(k)) U.close(k); } finally { U._user = false; }
    this.hide();
  }
  hide() { this.root.classList.remove('on'); this.ui.root?.classList.remove('pm-on'); this._sig = ''; }
  /** the strip's boxes while it's up, for padNav's glyph footer to keep clear of ({ r } as ui/fit.js hudRects) */
  rects() { if (!this.active) return []; return [...this.root.children].map(e => ({ r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 1); }
  /** open a page (closing the one up) */
  show(k) {
    const U = this.ui, cur = this.current();
    if (!PAGES.some(p => p[0] === k)) return;
    U.hidePopover(); U.drag?.cancel(); // (a held item goes back to its slot)
    if (cur !== k) {
      U._user = true;
      try {
        if (k === 'game' || k === 'settings') {
          for (const n of PANEL_PAGES) if (U.isOpen(n)) U.close(n, true);
          const view = k === 'game' ? 'main' : 'settings';
          if (U.isOpen('menu')) U.panels.menu.setView(view); else U.open('menu', { view });
        } else {
          if (U.isOpen('menu')) U.close('menu', true);
          for (const n of PANEL_PAGES) if (n !== k && U.isOpen(n)) U.close(n, true);
          U.open(k, k === 'inventory' ? { view: U.panels.inventory.view || 'bag' } : undefined);
        }
      } finally { U._user = false; }
    }
    this.last = k; this.render();
  }
  /** LB / RB: the next or previous page, wrapping */
  step(d) {
    const i = Math.max(0, PAGES.findIndex(p => p[0] === (this.current() || this.last)));
    this.show(PAGES[(i + d + PAGES.length) % PAGES.length][0]);
    this.ui.sfx('tab');
  }
  /** LT / RT on a page: Settings' own pages (→ true); the other pages' tabs are padNav's (→ false) */
  subTab(d) {
    if (this.current() !== 'settings') return false;
    const M = this.ui.panels.menu, i = Math.max(0, SETTINGS_PAGES.findIndex(p => p[0] === this.settingsPage())), k = SETTINGS_PAGES[(i + d + SETTINGS_PAGES.length) % SETTINGS_PAGES.length][0];
    if (k === 'general') M.setView('settings');
    else { if (M.view !== 'controls') M.setView('controls'); M.cancelWait?.(); M.dev = k; M.renderControls(); }
    this.ui.sfx('tab'); this.render();
    return true;
  }
  /** per frame (UI.update): ends itself when the pad stops, a page closed by other means, or a panel that isn't a page took over */
  update() {
    if (!this.active) { if (this.root.classList.contains('on')) this.hide(); return; }
    const U = this.ui, cur = this.current();
    if (Actions.device !== 'pad' || U.mode === 'title' || !cur) { this.active = false; this.hide(); return; }
    this.last = cur;
    this.render();
  }
  render() {
    const cur = this.current() || this.last, sub = cur === 'settings' ? this.settingsPage() : '';
    const sig = cur + '|' + sub + '|' + Actions.padStyle;
    if (sig === this._sig) return; this._sig = sig;
    const bump = t => `<span class="kc pad pm-b">${padGlyph(t)}</span>`;
    this.root.innerHTML = `<div class="pm-row">${bump('LB')}<div class="pm-tabs">${PAGES.map(([k, n, g]) => `<button class="pm-tab${k === cur ? ' on' : ''}" data-k="${k}">${glyph(g)}<span>${n}</span></button>`).join('')}</div>${bump('RB')}</div>`
      + (cur === 'settings' ? `<div class="pm-sub">${bump('LT')}${SETTINGS_PAGES.map(([k, n]) => `<span class="pm-st${k === sub ? ' on' : ''}">${n}</span>`).join('<i class="pm-dot"></i>')}${bump('RT')}</div>` : '');
  }
}
