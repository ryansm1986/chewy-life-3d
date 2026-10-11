// Fitting the UI to the screen, on every device (ROADMAP CT-10; docs/CONTROLS.md §10.5 and §12.11).
//  · Panels. The room is the HUD layer's box (the safe area: the Deck's margins, a notch, the itch insets) less 8 px. A
//    panel taller than the room gets .m-fit (fit.css): it sits between the room's top and bottom with its title, tabs and
//    ✕ in place and its body scrolling inside. One that fits but would cross the room's edge where it sits (the K panel
//    at 125% on a 16:9 screen) is moved in instead. A panel lays itself out for the room first when it can
//    (fitRoom(w, h): Settings' two columns, menu.js). Phones always fit (mobile.css), so only fitRoom runs there.
//    (Until CT-10 only a tablet's panels were fitted, CT-7's Mobile.fitTall; a Deck, a desktop at 125% or a phone the
//    game took for a tablet had none, and Settings ran off the Deck's screen.)
//  · The scroll hint. A panel's body that scrolls fades at an edge with more beyond it, and a chevron at its foot says
//    there is more below (a tap or click on it scrolls down). fit-up / fit-down on the body, .fit-more in the panel.
//  · The HUD. Where the hotbar's group (the orbs and the dock) and the bottom-right buttons would overlap (the Deck's
//    1.15 UI, 125% on any 16:9 screen), the buttons fold into two rows (.hud-tight) and the group moves left of them
//    (--bc-dx). The toasts rise above the level badges when the group's left orb reaches under them (.hud-toasts-up).
//    On touch the top-right column closes up when its chips would meet the touch cluster (.hud-tr-tight). Build and
//    decorate's glyph footer keeps between the portrait and the minimap (--pc-max). hudRects() is what the pad's glyph
//    footer keeps clear of (ui/padNav.js); tools/qa/ui-audit-lib.mjs hudOverlap checks it all.
//  · A bar laid over the panels' top (a tab strip) marks itself .fit-above, and the room starts under it.
import './fit.css';

const M = 8; // the room's margin inside the safe area, screen px
const GAP = 16; // between the hotbar's group and the bottom-right buttons, the HUD's own px
const TOAST_W = 18 + 350 + 10; // the toasts' column: left 18 + a toast's max width (fx.css) + a gap

export class Fit {
  constructor(ui) {
    this.ui = ui; this.n = 0; this.hudSig = '';
    // the scroll hint follows any panel body's scroll
    ui.layers.panels.addEventListener('scroll', e => { const b = e.target; if (b?.classList?.contains('pb')) this.hint(b); }, { capture: true, passive: true });
    addEventListener('resize', () => { this.hudSig = ''; requestAnimationFrame(() => this.now()); });
  }

  /** per frame (UI.update): the panels every fourth frame while one is open, the HUD every thirtieth (twice a second) */
  update() {
    this.n++;
    if (this.ui._order.length && this.n % 4 === 0) this.panels();
    if (this.n % 30 === 0) this.hud();
  }
  /** at once: a panel opened, a view changed, the screen or the UI size changed */
  now() { if (!this.ui.ready && !this.ui.root) return; this.panels(); this.hud(); }

  // ---------------------------------------------------------------- panels
  /** the room for panels, screen px: the HUD layer's box (the safe area) inside the panel layer, less the margin */
  room() {
    const ui = this.ui, L = ui.layers.panels.getBoundingClientRect(), S = ui.layers.hud.getBoundingClientRect();
    let t = Math.max(L.top, S.top) + M;
    // (a bar laid over the panels' top, such as a tab strip, marks itself .fit-above: the room starts under it)
    for (const e of ui.root.querySelectorAll('.fit-above')) { const r = e.getBoundingClientRect(); if (r.height > 1 && r.bottom < L.top + L.height / 2 && getComputedStyle(e).visibility !== 'hidden') t = Math.max(t, r.bottom + M); }
    return { L, S, t, b: Math.min(L.bottom, S.bottom) - M, l: Math.max(L.left, S.left) + M, r: Math.min(L.right, S.right) - M };
  }
  panels() {
    const ui = this.ui, R = ui.root; if (!R || !ui.layers?.panels) return;
    const phone = R.classList.contains('m-phone'), room = this.room(), L = room.L;
    const z = ui.layers.panels.currentCSSZoom || (R.classList.contains('m-touch') ? ui.mobile?.pscale : ui.scale) || 1;
    // the fitted panels' top and bottom, in the panel layer's own px (fit.css)
    const fb = ((L.bottom - room.b) / z).toFixed(1) + 'px';
    if (R.style.getPropertyValue('--fit-b') !== fb) R.style.setProperty('--fit-b', fb);
    const X = 16 * z; // (the ✕ sits 16 px over the panel's top corner: style.css .ph-x; it stays inside the room too)
    const ft2 = ((room.t + X - L.top) / z).toFixed(1) + 'px';
    if (R.style.getPropertyValue('--fit-t') !== ft2) R.style.setProperty('--fit-t', ft2);
    const avail = room.b - room.t - X;
    for (const n of ui._order) {
      const P = ui.panels[n], w = P?.wrap;
      if (!w || !P.isOpen || !P.panel || !P.body || w.classList.contains('closing')) continue;
      P.fitRoom?.((room.r - room.l) / z, avail / z);
      if (P.side !== 'bottom' && !phone) {
        const fit = w.classList.contains('m-fit');
        // its natural height: the box, plus what its body scrolls when fitted
        const nat = (P.panel.offsetHeight + (fit ? Math.max(0, P.body.scrollHeight - P.body.clientHeight) : 0)) * z;
        // the panel's top may sit from lo (its ✕ inside the room) to hi (its foot inside the room)
        let lo = room.t + X, hi = room.b - nat;
        // the K panel's Charge drawer (R-16, ui/chargePanel.js fit) hangs down its right edge and slides up it as far as
        // 16 px under the panel's top when it would run off the screen's foot: so the panel's top must leave room below
        // for the tree's tallest drawer. Where the room's margin is in the way, the margin gives (never the ✕): at
        // 1280×720 and 125% a moved-in K panel had left the drawer's foot 5 px off the screen
        const C = P.chg, dk = C?.el, dock = !!dk && !dk.hidden && dk.offsetParent === P.panel;
        if (dock) {
          const sb = innerHeight - (ui.mobile?.sf?.b || 0) - (R.classList.contains('deck-ui') ? 12 : 0) - 6, need = sb - (16 + (C.tallest?.() || dk.offsetHeight)) * z;
          hi = Math.min(hi, need); if (need < lo) lo = Math.max(room.S.top + X, need);
        }
        const over = lo > hi + 0.5;
        // where it sits unfitted: the layer's middle, 20 px up (40 at the sides; style.css .pw.side-*), plus a drag
        const cy = L.top + L.height / 2 - (P.side === 'center' ? 20 : 40) * z + (P.dy || 0) * z, top0 = cy - nat / 2;
        const dy = over ? 0 : Math.min(hi, Math.max(lo, top0)) - top0;
        let moved = false;
        if (over !== fit) { w.classList.toggle('m-fit', over); moved = true; if (over) { P.dx = P.dy = 0; w.style.translate = ''; } }
        const mt = !over && Math.abs(dy) > 0.5 ? (dy / z).toFixed(1) + 'px' : '';
        if (w.style.marginTop !== mt) { w.style.marginTop = mt; moved = true; }
        // (fitted with the margin given up for the drawer: its top that much higher; fit.css --fit-up)
        const fu = over && lo < room.t + X - 0.5 ? ((lo - room.t - X) / z).toFixed(1) + 'px' : '';
        if (w.style.getPropertyValue('--fit-up') !== fu) { if (fu) w.style.setProperty('--fit-up', fu); else w.style.removeProperty('--fit-up'); moved = true; }
        if (moved && dock) C.fit?.(); // (the drawer re-places itself for the panel's new top)
      }
      this.hint(P.body);
    }
  }

  // ---------------------------------------------------------------- the scroll hint
  hint(b) {
    if (!b?.isConnected) return;
    const P = b.closest('.panel'); if (!P) return;
    const max = b.scrollHeight - b.clientHeight;
    const sc = max > 2 && /auto|scroll/.test(getComputedStyle(b).overflowY);
    const up = sc && b.scrollTop > 2, down = sc && b.scrollTop < max - 2;
    if (b.classList.contains('fit-up') !== up) b.classList.toggle('fit-up', up);
    if (b.classList.contains('fit-down') !== down) b.classList.toggle('fit-down', down);
    let c = P.querySelector(':scope > .fit-more');
    if (!down) { if (c) c.classList.remove('on'); return; }
    if (!c) {
      c = document.createElement('button');
      c.className = 'fit-more pad-skip'; c.type = 'button'; c.tabIndex = -1; c.title = 'More below';
      c.innerHTML = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M3 3l9 9 9-9" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      c.addEventListener('click', e => { e.stopPropagation(); const B = P.querySelector(':scope > .pb'); B?.scrollBy({ top: B.clientHeight * 0.7, behavior: 'smooth' }); });
      P.appendChild(c);
    }
    // on the body's foot, half below it, in the panel's own margin there (a phone: over its title bar's empty middle),
    // so it covers no row; above a phone's tab band, which sticks to that foot, inside the body
    const R = this.ui.root, z = P.currentCSSZoom || (R?.classList.contains('m-touch') ? this.ui.mobile?.pscale : this.ui.scale) || 1, pr = P.getBoundingClientRect(), br = b.getBoundingClientRect(); // (Safari before 18.2 has no currentCSSZoom)
    const tabs = b.querySelector(':scope > .tabs'), band = tabs && getComputedStyle(tabs).position === 'sticky' ? tabs.getBoundingClientRect().height : 0;
    const top = ((br.bottom - band - pr.top) / z - (band ? 30 : 14)).toFixed(0) + 'px';
    if (c.style.top !== top) c.style.top = top;
    c.classList.add('on');
  }

  // ---------------------------------------------------------------- the HUD
  hud() {
    const ui = this.ui, R = ui.root, $ = ui.hud?.$; if (!R || !$?.bc || !$.menubtns) return;
    // build and decorate's glyph footer (ui/padCursor.js, top centre) keeps between the portrait and the minimap
    const pc = $.pcard?.getBoundingClientRect?.() || ui.root.querySelector('.hud-tl .pcard')?.getBoundingClientRect(), mm = ui.root.querySelector('.hud-tr .mm-wrap')?.getBoundingClientRect();
    if (pc?.width && mm?.width) { const m = (Math.max(pc.right, innerWidth - mm.left) + 12) * 2, v = Math.max(320, innerWidth - m).toFixed(0) + 'px'; if (R.style.getPropertyValue('--pc-max') !== v) R.style.setProperty('--pc-max', v); }
    // (a dialogue or build mode has the group away: keep what was decided)
    if (ui.mode === 'title' || R.classList.contains('dlg-open') || R.classList.contains('building')) return;
    let tight = false, dx = 0, up = false, rows = 4;
    const touch = document.body.classList.contains('touch-active');
    // touch: the top-right column's chips (the run and crews chips, under the coins) clear of the touch cluster's top
    // skill slot: the column closes up its gaps when they would meet (a phone with crews out)
    const over = () => { const cs = [...R.querySelectorAll('.hud-tr .run-chip.on, .hud-tr .cz-chip.on')].map(e => e.getBoundingClientRect()), bs = [...R.querySelectorAll('.tc .tc-b')].map(e => e.getBoundingClientRect()).filter(r => r.width > 2);
      return cs.some(c => bs.some(r => Math.min(r.right, c.right) - Math.max(r.left, c.left) > 1 && Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > 1)); };
    const was = R.classList.contains('hud-tr-tight');
    if (touch) { if (was) R.classList.remove('hud-tr-tight'); if (over()) R.classList.add('hud-tr-tight'); }
    else if (was) R.classList.remove('hud-tr-tight');
    if (!touch) { // (touch moves the hotbar into its own buttons and hides these)
      const s = ui.scale || 1, Lw = ui.layers.hud.getBoundingClientRect().width / s, bcW = $.bc.getBoundingClientRect().width / s;
      if (bcW < 50 || Lw < 50) return;
      const n = $.menubtns.querySelectorAll('.mb').length;
      const row = k => 14 + 24 + k * 44 + (k - 1) * 6; // (hud.css: right 14, the tray's padding and border, 44 px buttons 6 apart)
      const right = Lw / 2 + bcW / 2;
      rows = Math.ceil(n / 2); tight = right - 3 > Lw - row(n); // (at 1600 px and 100% the two just touch, as designed, 3 px: the audit allows that too)
      dx = tight ? Math.min(0, Lw - row(rows) - GAP - right) : 0;
      up = Lw / 2 - bcW / 2 + dx < TOAST_W;
    }
    const sig = `${tight}|${dx.toFixed(0)}|${up}|${rows}`;
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    R.classList.toggle('hud-tight', tight); R.classList.toggle('hud-toasts-up', up);
    R.style.setProperty('--bc-dx', dx.toFixed(1) + 'px'); R.style.setProperty('--mb-cols', String(rows));
  }
  /** the HUD's bars, screen px: what the pad's glyph footer keeps clear of (padNav), [{ n, r: DOMRect }] */
  hudRects() {
    const t = performance.now(); if (this._hr && t - this._hrT < 100) return this._hr; // (the pad's footer asks every frame; a toast that arrives moves it within 0.1 s)
    this._hrT = t;
    const out = this._hr = [], vis = e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
    const R = this.ui.root; if (!R || this.ui.mode === 'title') return out;
    for (const e of R.querySelectorAll('.l-hud .hud-bc .orb-slot, .l-hud .hud .dock, .l-hud .hud-br .menubtns, .l-hud .hud-br .rci, .l-hud .hud-br .build-btn, .l-hud .lvb.on, .l-hud .hud-tr .mm-wrap, .l-hud .hud-tl .pcard, .l-hud .qtrack, .l-hud .hud-res, .l-hud .loc, .tc .tc-b, .toasts .toast')) {
      const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || !vis(e) || (e.closest('.hud-br, .hud-bc') && !vis(e.closest('.hud-br, .hud-bc')))) continue;
      out.push({ n: e.classList[0], r });
    }
    return out;
  }
}
