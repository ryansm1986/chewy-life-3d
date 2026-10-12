// Spatial focus navigation for the gamepad (docs/CONTROLS.md §3, ROADMAP CT-2). While the pad plays and a panel, the
// popover or the guide's offer card is open, a focus ring sits on one element of it:
//   - the D-pad or the left stick moves it to the nearest element that way (its own row or column first; across side by
//     side panels too: the bag next to a shop or the stash);
//   - A selects (a click, or the element's own action: HANDLERS), B goes back (ui.back: a held item, the popover, the
//     top panel), LB / RB switch the panel's tabs, X / Y act per element (drop / sell / stash, equip / use, assign,
//     charge perks, eat, sell all…);
//   - in the pad's tabbed menu (CT-11, ui/padMenu.js): LB / RB its pages, LT / RT the page's own tabs, B closes it all;
//     the K panel's Charge drawer steps with a right-stick flick;
//   - the tooltip follows the focus (the element's own hover tooltip, anchored to it), a slider takes ◀ ▶, a scrolled
//     list scrolls the focus into view, and a footer of glyph hints names what each button does here;
//   - the last focus of each panel is remembered for the next time it opens.
// The pad's dialogue and title screen keep their own small handlers (ui.js padDialogue / padTitle); build and decorate
// mode drive the virtual cursor (ui/padCursor.js).
import { Actions } from '../core/actions.js';
import { el } from './dom.js';
import { padGlyph } from './padGlyphs.js';

const FOCUSABLE = 'button, [data-focus], .slot[data-c], .node, .chg-pk, .sh-item, .ck-row, .mx-it, .mx-slot.has, .q-item, .tv-pin, .gf-card, .pslot[data-id], .sp-card, .card, .fl-card, .dr, .rm-set, .rm-o, input[type=range]';
const SKIP = '.ph-x, .pad-skip';
// where focus lands when a panel opens (else its first element that isn't a tab)
const START = {
  menu: '[data-a="resume"], .ctl-b:not(.locked), .seg button.on, .tog',
  inventory: '.slot[data-c="inv"].has, .slot[data-c="inv"], .pslot[data-id]',
  stash: '.slot[data-c="stash"], .slot[data-c="lost"]', shop: '.sh-item', skills: '.node.can, .node.learned, .node', character: '.at-plus:not([disabled]), .attr .at-plus, .dr',
  quests: '.q-item, .gd-card .btn, .fl-card', cook: '.ck-row.sel, .ck-row', craft: '.ck-row.sel, .ck-row', travel: '.tv-pin.sel, .tv-pin.here, .tv-pin', gift: '.gf-card', seeds: '.sp-card',
  houseCard: '.btn.pink, .btn', remodel: '.rm-set.on, .rm-set', lantern: '.ln-go',
  burrow: '.dn-go, .dn-pin.sel', // (the Burrow door's den picker: docs/ZONES.md §4.1)
  expeditions: '.ex-go:not([disabled]), .ex-mem.can, .ex-obj.sel, .ex-recall, .ex-obj', awayCard: '.aw-ok', // (the cozy path: docs/COZY.md §10)
  sightings: '.sg-go:not([disabled])', // (the Sightings board: docs/COZY.md §6.3)
  map: '.mp-row.sel, .mp-row', // (the big map's directory: ROADMAP UX-1)
  guild: '.gd-sign:not([disabled]), .gd-up:not([disabled]), .gd-pay, .gd-buy:not([disabled]), .gd-board', // (the Adventurers' Guild: docs/COZY.md §5)
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SEL = '.on, .sel, .selected, .active';

export class PadNav {
  constructor(ui) {
    this.ui = ui; this.cur = null; this.scopeKey = ''; this.last = new Map(); this.armed = null;
    this.ring = el('div', 'pad-ring'); this.ring.innerHTML = '<i class="pr-paw"></i>';
    this.hintsEl = el('div', 'pad-hints');
    ui.layers.over.appendChild(this.ring); ui.layers.over.appendChild(this.hintsEl);
  }
  get G() { return this.ui.G; }
  // ---------------------------------------------------------------- scope
  /** the elements focus may move between now, and the top panel (for tabs and hints); null: nothing to navigate */
  scope() {
    const ui = this.ui;
    if (ui.pop?.classList.contains('show')) return { roots: [ui.pop], top: null, key: 'pop' };
    if (ui.tutorial?.offering) return { roots: [ui.tutorial.$.offer], top: null, key: 'offer' };
    const open = ui._order.filter(n => ui.panels[n]?.isOpen && !ui.nonBlocking(n));
    if (!open.length) return null;
    const names = open.includes('menu') ? ['menu'] : open; // (the pause menu sits over everything)
    const top = ui.panels[names[names.length - 1]];
    return { roots: names.map(n => ui.panels[n].panel).filter(Boolean), top, key: names.join(',') + ':' + (top.view || top.tab || '') };
  }
  candidates(roots) {
    const out = [];
    for (const r of roots) for (const e of r.querySelectorAll(FOCUSABLE)) {
      if (e.closest(SKIP) || e.disabled) continue;
      const p = e.parentElement?.closest(FOCUSABLE); if (p && r.contains(p)) continue; // (a button inside a focusable card)
      if (!visible(e)) continue;
      out.push(e);
    }
    return out;
  }
  // ---------------------------------------------------------------- per frame (UI.padInput while the pad plays)
  /** → true when it handled the pad this frame (a scope exists) */
  update() {
    const A = Actions;
    if (A.device !== 'pad' && !this.cur && !this.ring.classList.contains('on') && !this.hintsEl.classList.contains('on')) return false; // (the mouse plays: nothing to tidy)
    const S = this.scope();
    if (!S || A.device !== 'pad') { this.blur(); this.hide(); this.cur = null; this.scopeKey = ''; return false; }
    // the candidates (layout reads): again on a scope change, any pad press, a lost focus, or every 0.3 s
    const t = performance.now(), busy = A.pPressed.size || A.nav;
    if (!this._cands || S.key !== this.scopeKey || busy || !this.cur?.isConnected || t - this._candT > 300) { this._cands = this.candidates(S.roots); this._candT = t; }
    const cands = this._cands;
    if (S.key !== this.scopeKey || !this.cur || !this.cur.isConnected || !cands.includes(this.cur)) {
      const prev = this.scopeKey; this.scopeKey = S.key;
      const keep = this.cur && this.cur.isConnected && cands.includes(this.cur) ? this.cur : null;
      this.focus(keep || this.remembered(S, cands) || this.start(S, cands, prev), cands);
    }
    const cur = this.cur, h = handlerFor(cur), now = performance.now(), dt = Math.min(0.05, (now - (this._t || now)) / 1000); this._t = now;
    // the map (ui/map.js padFrame): the left stick moves it under its crosshair (A there pins the mark), the triggers or the
    // right stick zoom, R3 goes back to you; so only the D-pad walks the focus there (the directory's rows: UX-1)
    const onMap = S.top?.name === 'map', nav = onMap && S.top.pans?.() ? A.dnav : A.nav;
    if (onMap) S.top.padFrame?.(dt, A);
    // the pad's buttons
    if (nav) {
      if (cur?.matches('input[type=range]') && (nav === 'left' || nav === 'right')) this.slide(cur, nav === 'right' ? 1 : -1);
      else { const n = this.step(cands, nav); if (n) { this.focus(n, cands); this.ui.sfx('hover'); } else this.bump(); }
    }
    // LB / RB: the tabbed menu's pages (CT-11: ui/padMenu.js), else the top panel's tabs; LT / RT in the tabbed menu: the
    // page's own tabs (Settings' pages are the menu's); the map keeps LT / RT for its zoom
    const PM = this.ui.padMenu?.active ? this.ui.padMenu : null;
    const SP = !PM && S.key !== 'pop' && this.ui.isOpen('stash') ? this.ui.panels.stash : null; // (the stash's tabs: LT / RT, and LB / RB as a lone panel's own tabs; ROADMAP R-19, ui/stash.js)
    if (A.padHit('LB') || A.padHit('RB')) { const d = A.padHit('RB') ? 1 : -1; A.padConsume('LB'); A.padConsume('RB'); if (PM) { this.blur(); this.cur = null; PM.step(d); } else if (SP) this.stashTab(SP, d); else this.tab(S, d); }
    if (PM && S.top?.name !== 'map' && (A.padHit('LT') || A.padHit('RT'))) { const d = A.padHit('RT') ? 1 : -1; A.padConsume('LT'); A.padConsume('RT'); if (!PM.subTab(d)) this.tab(S, d); else { this.blur(); this.cur = null; } }
    if (SP && (A.padHit('LT') || A.padHit('RT'))) { const d = A.padHit('RT') ? 1 : -1; A.padConsume('LT'); A.padConsume('RT'); this.stashTab(SP, d); }
    // R3 in the bag or the stash: Sort the grid the focus is in (the bag, or the stash's open tab: docs/INVENTORY.md)
    if (A.padHit('R3') && this.cur && !this.ui.drag?.held) { const P = this.cur.closest('.p-stash') ? this.ui.panels.stash : this.cur.closest('.p-inv') ? this.ui.panels.inventory : null; if (P?.sort) { A.padConsume('R3'); P.sort(); this.refocus(this.cur); } }
    // the K panel: a right-stick flick steps the Charge drawer through the tree's skills (R-16; the focus stays where it is)
    if (S.top?.name === 'skills') { const ax = A.aim().x, fl = Math.abs(ax) > 0.6 ? Math.sign(ax) : Math.abs(ax) < 0.3 ? 0 : this._flick || 0; if (fl && fl !== this._flick) S.top.chg.cycle(fl); this._flick = fl; }
    if (A.padHit('A') && this.cur) { A.padConsume('A'); this.armed = null; this.press(this.cur); }
    if (A.padHit('X') && this.cur) { A.padConsume('X'); h?.x?.(this.cur, this); }
    if (A.padHit('Y') && this.cur) { A.padConsume('Y'); this.armed = null; h?.y?.(this.cur, this); }
    if (A.padHit('B')) { // back: in the tabbed menu a held item or the popover first, then the whole menu; else out of the menu's Settings / Controls to its main page first, else ui.back (a held item, the popover, the top panel)
      A.padConsume('B'); this.armed = null;
      const M = this.ui.panels.menu;
      if (PM && !this.ui.pop?.classList.contains('show') && !this.ui.drag?.held && !M.wait) { this.blur(); this.cur = null; PM.close(); }
      else if (S.top === M && M.view !== 'main' && !M.wait) { this.blur(); M.act('back'); this.cur = null; } else this.ui.back();
    }
    this.draw(S);
    return true;
  }
  start(S, cands, prevKey) {
    const name = S.top?.name, want = START[name];
    if (want) for (const sel of want.split(',')) { const e = cands.find(c => c.matches(sel.trim())); if (e) return e; }
    const top = S.top?.panel;
    const inTop = top ? cands.filter(c => top.contains(c)) : cands;
    return inTop.find(c => c.matches(SEL) && !c.matches('.tab')) || inTop.find(c => !c.matches('.tab')) || inTop[0] || cands[0] || null;
  }
  remembered(S, cands) {
    const m = this.last.get(S.key); if (!m) return null;
    if (m.el?.isConnected && cands.includes(m.el)) return m.el;
    return cands.find(c => c.matches(m.sel)) || null;
  }
  focus(e, cands) {
    if (e === this.cur) return;
    this.blur();
    this.cur = e || null;
    if (!e) return;
    this.last.set(this.scopeKey, { el: e, sel: selectorOf(e) });
    try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (x) { /* */ }
    // its own hover tooltip, anchored to it (the item, skill, perk and building tooltips are bound to hover)
    const r = e.getBoundingClientRect(), T = this.ui.tip;
    T.x = Math.min(innerWidth - 20, r.right - 4); T.y = r.top + 10;
    fire(e, 'pointerover'); fire(e, 'mouseover'); fire(e, 'mouseenter', false); fire(e, 'pointerenter', false);
    if (T.on) T.place();
    if (this.ui.drag?.held) this.ghostTo(e); // (a held item rides the focus, its footprint under it)
    void cands;
  }
  ghostTo(e) {
    const D = this.ui.drag; if (!D?.held || !e) return;
    const r = e.getBoundingClientRect();
    D.mx = r.left + r.width * 0.7; D.my = r.top + r.height * 0.7;
    D.ghost.style.transform = `translate3d(${D.mx}px,${D.my}px,0)`;
    // the held item's footprint at the focused cell (its top-left there, kept on the grid): green, gold (a swap) or red
    const a = e.matches?.('.slot[data-c]') ? slotAddr(e) : null;
    if (a && a.c !== 'equip' && a.c !== 'shop') D.preview?.(0, 0, D.clampTo(a, D.get(D.held))); else D.hidePreview?.();
  }
  blur() {
    const e = this.cur; if (!e) return;
    fire(e, 'mouseout'); fire(e, 'mouseleave', false); fire(e, 'pointerleave', false);
    this.ui.tip.hide(e);
  }
  /** A: the element's own action (HANDLERS), else a click */
  press(e) {
    const h = handlerFor(e);
    if (h?.a) { h.a(e, this); this.refocus(e); return; }
    if (e.matches('input[type=range]')) return;
    e.click();
    this.refocus(e);
  }
  /** after an action re-rendered the panel the element may be a new node: find its twin, and refresh the tooltip */
  refocus(e) {
    requestAnimationFrame(() => {
      const S = this.scope(); if (!S) return;
      const cands = this.candidates(S.roots);
      let n = e.isConnected && cands.includes(e) ? e : cands.find(c => c.matches(selectorOf(e)));
      if (!n) return;
      if (n === this.cur) { this.cur = null; this.ui.tip.hide(); }
      this.focus(n, cands);
    });
  }
  /** the nearest candidate in a direction: its own row / column first, then the closest by angle and distance */
  step(cands, dir) {
    const c = this.cur?.getBoundingClientRect(); if (!c) return cands[0] || null;
    const [dx, dy] = DIRS[dir], cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    // two passes: first only what lies within a cone that way (or shares the row / column), then anything that way
    for (const cone of [true, false]) {
      const best = this.pick(cands, c, dx, dy, cx, cy, cone);
      if (best) return best;
    }
    return null;
  }
  pick(cands, c, dx, dy, cx, cy, cone) {
    let best = null, bs = 1e9;
    for (const e of cands) {
      if (e === this.cur) continue;
      const r = e.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      const vx = ex - cx, vy = ey - cy, along = vx * dx + vy * dy;
      if (along < 4) continue;
      const lineUp = dx ? r.top < c.bottom - 2 && r.bottom > c.top + 2 : r.left < c.right - 2 && r.right > c.left + 2;
      if (cone && !lineUp && Math.abs(dx ? vy : vx) > along * 1.2) continue;
      // the edge gap that way (half the centre distance when they overlap that way), the gap across (0 when they share
      // a row / column), a toll for leaving the row / column, and the centre offset to break ties
      const gap = dx ? (dx > 0 ? r.left - c.right : c.left - r.right) : (dy > 0 ? r.top - c.bottom : c.top - r.bottom);
      const across = dx ? Math.max(0, r.top - c.bottom, c.top - r.bottom) : Math.max(0, r.left - c.right, c.left - r.right);
      const overlap = across === 0 && (dx ? r.top < c.bottom - 2 && r.bottom > c.top + 2 : r.left < c.right - 2 && r.right > c.left + 2);
      const s = (gap > 0 ? gap : along * 0.5) + across * 3 + (overlap ? 0 : 30) + Math.abs(dx ? vy : vx) * 0.15;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  bump() { const e = this.cur; if (!e) return; this.ring.classList.remove('bump'); void this.ring.offsetWidth; this.ring.classList.add('bump'); }
  slide(inp, d) {
    const step = +(inp.step || 0) > 1 ? +inp.step : Math.max(1, Math.round((+inp.max - +inp.min) / 20));
    const v = Math.max(+inp.min, Math.min(+inp.max, +inp.value + d * step));
    if (v === +inp.value) return this.bump();
    inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); this.ui.sfx('tick');
  }
  /** the stash's tabs (LT / RT): the focus stays on its slot, which now shows the new tab's item (its tooltip too) */
  stashTab(SP, d) { if (!SP.step(d)) return; const e = this.cur; if (e?.closest('.p-stash')) { this.blur(); this.cur = null; if (e.isConnected) this.focus(e, this._cands || []); } }
  /** LB / RB: the top panel's tabs (the inventory views, the skill trees, the shop's Buy / Sell, the Controls devices…) */
  tab(S, d) {
    const root = S.top?.panel; if (!root) return;
    const tabs = [...root.querySelectorAll('.tabs .tab, .ctl-tabs button')].filter(visible);
    if (tabs.length < 2) return;
    let i = tabs.findIndex(t => t.classList.contains('on')); if (i < 0) i = 0;
    const n = tabs[(i + d + tabs.length) % tabs.length];
    n.click();
    this.blur(); this.cur = null; this.scopeKey = ''; // (the panel re-renders: land on its new content)
  }
  // ---------------------------------------------------------------- the ring and the hints
  draw(S) {
    const e = this.cur, R = this.ring;
    if (!e || !e.isConnected) { R.classList.remove('on'); R._for = null; this.hints(S, null); return; } // (a panel with nothing to focus, the map: its hints only)
    const r = e.getBoundingClientRect(), pad = 4;
    // (a row scrolled out of a panel's body, by a finger or the wheel: no ring floating over the panel's frame)
    const sb = e.closest('.pb'), sr = sb && sb.scrollHeight > sb.clientHeight + 2 ? sb.getBoundingClientRect() : null;
    if (sr && (r.bottom < sr.top + 4 || r.top > sr.bottom - 4)) { R.classList.remove('on'); this.hints(S, e, r); return; }
    R.style.transform = `translate(${(r.left - pad).toFixed(1)}px,${(r.top - pad).toFixed(1)}px)`;
    R.style.width = `${(r.width + pad * 2).toFixed(1)}px`; R.style.height = `${(r.height + pad * 2).toFixed(1)}px`;
    if (R._for !== e) { R._for = e; const br = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 8; R.style.borderRadius = `${Math.min(r.height / 2 + pad, br + pad)}px`; }
    R.classList.add('on');
    this.hints(S, e, r);
  }
  hints(S, e) {
    const h = handlerFor(e), list = [];
    const a = e && h?.label ? h.label(e, this) : null;
    if (e) list.push(['A', (a && a.a != null ? a.a : null) ?? (e.matches('input[type=range]') ? '' : e.matches('.tab') ? 'Open' : 'Select')]);
    if (a?.x) list.push(['X', a.x]);
    if (a?.y) list.push(['Y', a.y]);
    const root = S.top?.panel, PM = this.ui.padMenu?.active, tabs = !!root && [...root.querySelectorAll('.tabs .tab, .ctl-tabs button')].filter(visible).length > 1;
    if (e?.matches('.p-inv .slot[data-c="inv"], .p-stash .slot[data-c="stash"]') && !this.ui.drag?.held) list.push(['R3', 'Sort']); // (docs/INVENTORY.md)
    if (PM) { list.push(['LB+RB', 'Pages']); if (tabs || this.ui.padMenu.current() === 'settings') list.push(['LT+RT', 'Tabs']); } // (the tabbed menu: CT-11)
    else if (tabs) list.push(['LB+RB', 'Tabs']);
    if (!PM && S.key !== 'pop' && this.ui.isOpen('stash') && (this.ui.G?.state?.stashTabs?.length || 1) > 1) list.push(['LT+RT', 'Stash tabs']);
    if (e?.matches('input[type=range]')) list.push(['DLeft+DRight', 'Adjust']);
    if (S.top?.name === 'map') list.push(...(S.top.padHints?.() || [['LT+RT', 'Zoom']]));
    if (S.top?.name === 'skills' && !S.top.chg?.el.hidden) list.push(['RS', 'Charge skill']);
    list.push(['B', this.ui.drag?.held ? 'Cancel' : S.key === 'pop' ? 'Close' : PM ? 'Close' : 'Back']);
    const sig = list.map(x => x.join(':')).join('|') + Actions.padStyle;
    if (sig !== this._hsig) {
      this._hsig = sig;
      this.hintsEl.innerHTML = list.filter(x => x[1]).map(([b, t]) => `<span class="ph-i">${b.split('+').map(t2 => `<span class="kc pad">${padGlyph(t2)}</span>`).join('')}<b>${t}</b></span>`).join('');
    }
    // where it goes, the first spot on the screen that keeps clear of the HUD's bars (the orbs, the hotbar, the
    // bottom-right buttons, the minimap: ui/fit.js hudRects; CT-10: beside a tall panel it sat on the Deck's hotbar):
    // under the top panel, centred on it; above it; beside it (right, then left), as low as is clear; over its bottom
    // edge (at the right, then the middle); else just inside its bottom-right corner (clear of a centred Back or OK).
    // M: the margin (the Deck's safe area: deck.css)
    const P = S.top?.panel || S.roots[0], pr = P?.getBoundingClientRect(); if (!pr) return;
    const dk = P.querySelector(':scope > .chg-drawer:not([hidden])'), dr = dk && dk.offsetParent ? dk.getBoundingClientRect() : null; // (the K panel's docked Charge drawer counts as the panel)
    const box = dr && dr.width > 2 ? { left: Math.min(pr.left, dr.left), top: Math.min(pr.top, dr.top), right: Math.max(pr.right, dr.right), bottom: Math.max(pr.bottom, dr.bottom) } : pr;
    if (box !== pr) box.width = box.right - box.left;
    const H = this.hintsEl; H.classList.add('on');
    const keep = [...(this.ui.fit?.hudRects?.() || []), ...(this.ui.padMenu?.rects?.() || [])], M = this.ui.root?.classList.contains('deck-ui') ? 14 : 6; // (+ the tabbed menu's strip: CT-11)
    const key = `${this._hsig}|${[box.left, box.top, box.right, box.bottom].map(Math.round)}|${keep.map(k => Math.round(k.r.left) + ',' + Math.round(k.r.top)).join(';')}|${innerWidth}x${innerHeight}`;
    if (key === H._key && performance.now() - (H._keyT || 0) < 500) return; // (placed: the same hints, panel and HUD)
    H._key = key; H._keyT = performance.now();
    const clear = (x, y, w, hh) => keep.every(({ r }) => x + w <= r.left || x >= r.right || y + hh <= r.top || y >= r.bottom);
    const on = (x, y, w, hh) => x >= M && x + w <= innerWidth - M && y >= M && y + hh <= innerHeight - M;
    const size = mw => { H.style.maxWidth = mw ? mw.toFixed(0) + 'px' : ''; return [H.offsetWidth, H.offsetHeight]; };
    const beside = (right, w, hh) => { const out = [], by = Math.min(innerHeight - M - hh, box.bottom - hh); for (let yy = by; yy >= Math.max(M, box.top + 40); yy -= 24) out.push([right ? box.right + 12 : box.left - 12 - w, yy]); return out; };
    let [w, hh] = size(0), pick = null;
    const cx = box.left + box.width / 2 - w / 2, rx = box.right - w - 34;
    pick = [[cx, box.bottom + 10], [cx, box.top - hh - 10], ...beside(true, w, hh), ...beside(false, w, hh), [rx, box.bottom - hh / 2], [cx, box.bottom - hh / 2]].find(([x, y]) => on(x, y, w, hh) && clear(x, y, w, hh));
    // too wide for the room beside the panel: wrapped to the room there, right side first (the K panel's long footer)
    for (const right of [true, false]) {
      if (pick) break;
      const room = Math.floor(right ? innerWidth - M - box.right - 12 : box.left - 12 - M) - 2; if (room < 200 || room >= w) continue;
      const [w2, h2] = size(room); pick = beside(right, w2, h2).find(([x, y]) => on(x, y, w2, h2) && clear(x, y, w2, h2)); if (pick) { w = w2; hh = h2; } else [w, hh] = size(0);
    }
    let [x, y] = pick || [box.right - w - 34, box.bottom - hh - 18]; // (else just inside the panel's bottom-right corner)
    x = Math.max(M + 2, Math.min(innerWidth - w - M - 2, x)); y = Math.max(M, Math.min(innerHeight - M - hh, y));
    if (H._x !== x || H._y !== y) { H._x = x; H._y = y; H.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`; }
  }
  hide() { this.ring.classList.remove('on'); this.hintsEl.classList.remove('on'); this.ring._for = null; if (!this.scope()) { this.cur = null; this.scopeKey = ''; } }
  /** an action that wants a second press to confirm (dropping an item): true on the second press within 1.6 s */
  confirm(e, what) {
    const now = performance.now();
    if (this.armed && this.armed.e === e && this.armed.what === what && now - this.armed.t < 1600) { this.armed = null; return true; }
    this.armed = { e, what, t: now };
    const r = e.getBoundingClientRect(); this.ui.toast?.(`Press ${Actions.tokenName('X', 'pad')} again to ${what}`, { color: '#ffd8a8', duration: 1.6 });
    void r;
    return false;
  }
}

// ---------------------------------------------------------------- per-element actions
// a: what A does instead of a click · x / y: the X and Y actions · label(): the footer's words for A / X / Y
const shopOpen = nav => nav.ui.isOpen('shop'), stashOpen = nav => nav.ui.isOpen('stash');
const slotAddr = e => ({ c: e.dataset.c, i: e.dataset.c === 'equip' ? e.dataset.i : +e.dataset.i });
const HANDLERS = [
  { // bag, stash, Lost & Found and the paper doll: A picks up / puts down (the item rides the focus, its footprint under
    // it; onto one item you then hold that one), Y equips / uses / unequips, X sells, stashes or drops
    match: '.slot[data-c="inv"], .slot[data-c="stash"], .slot[data-c="lost"], .slot[data-c="equip"]',
    a(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e);
      if (D.held) { D.place(D.held, a); return; }
      if (!D.get(a) || e.classList.contains('dim')) { nav.bump(); return; } // (faded by the stash's filter: it stays put)
      D.lift(a, e); nav.ghostTo(e);
    },
    y(e, nav) { const D = nav.ui.drag; if (D.held) return; if (D.get(slotAddr(e))) D.context(e, { shiftKey: false }); },
    x(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e), it = D.get(a); if (!it || D.held) return;
      if (a.c === 'inv' && shopOpen(nav)) { D.sell(a); return; }
      if ((a.c === 'inv' && stashOpen(nav)) || a.c === 'stash' || a.c === 'lost') { if (!e.classList.contains('dim')) D.quickMove(a, it); return; }
      if (a.c === 'inv' && nav.confirm(e, 'drop it')) D.dropToGround(a);
    },
    label(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e), it = D.get(a);
      if (D.held) return { a: 'Place' };
      if (!it) return { a: '' };
      if (e.classList.contains('dim')) return { a: '' };
      const box = a.c === 'stash' || a.c === 'lost';
      return { a: 'Pick up', y: a.c === 'equip' ? 'Unequip' : box ? 'To bag' : it.kind === 'gear' ? 'Equip' : it.kind !== 'material' ? 'Use' : '', x: a.c === 'equip' ? '' : a.c === 'inv' && shopOpen(nav) ? 'Sell' : (a.c === 'inv' && stashOpen(nav)) ? 'Stash' : box ? '' : 'Drop' };
    },
  },
  { // the stash's tabs (ui/stash.js, ROADMAP R-19): A opens one (or puts the held item in it), A on the open one or Y renames
    // it and picks its colour; the "+" tab buys the next one
    match: '.p-stash .st-tab',
    a(e, nav) {
      const D = nav.ui.drag, P = nav.ui.panels.stash;
      if (e.dataset.buy) { P.openBuy(e); return; }
      const t = e.dataset.t === 'lost' ? -1 : +e.dataset.t;
      if (D.held) { D.toTab(D.held, t); return; }
      if (t === P.tab) { if (t >= 0) P.openEdit(t, e); } else { P.setTab(t); nav.ui.sfx('tab'); }
    },
    y(e, nav) { if (e.dataset.buy || e.dataset.t === 'lost' || nav.ui.drag.held) return; const P = nav.ui.panels.stash, t = +e.dataset.t; if (t !== P.tab) P.setTab(t); P.openEdit(t, P.tabEl(t) || e); },
    label(e, nav) {
      if (e.dataset.buy) return { a: 'Buy a tab' };
      const lost = e.dataset.t === 'lost', on = (lost ? -1 : +e.dataset.t) === nav.ui.panels.stash.tab;
      if (nav.ui.drag?.held) return { a: lost ? '' : 'Put it in here' };
      return { a: on ? (lost ? '' : 'Rename') : 'Open', y: lost ? '' : 'Rename' };
    },
  },
  { // the skill trees: A learns, Y assigns to the hotbar (the slot popover), X opens the charge perks
    match: '.p-skills .node',
    a(e, nav) { nav.ui.panels.skills.learn(e.dataset.id, e); },
    y(e, nav) { nav.ui.panels.skills.assignPopover(e.dataset.id, e); },
    x(e, nav) { const S = nav.ui.panels.skills; if (e.querySelector('.nd-chg.on')) S.chg.choose(e.dataset.id); }, // (choose: the node's tooltip steps aside until the focus moves, so the drawer shows)
    label(e) { const l = !e.classList.contains('maxed'); return { a: l ? 'Learn' : '', y: e.classList.contains('passive') ? '' : 'Assign', x: e.querySelector('.nd-chg.on') ? 'Charge perks' : '' }; },
  },
  { // shops: A buys (or sells one), X sells them all (pantry goods)
    match: '.sh-item',
    x(e) { if (e.dataset.pid || isPantryBuy(e)) e.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); }, // (Shift+Click: sell them all / buy 5)
    label(e) { return { a: e.classList.contains('sell') ? 'Sell' : 'Buy', x: e.dataset.pid ? 'Sell all' : isPantryBuy(e) ? 'Buy 5' : '' }; },
  },
  { // the Pantry: A picks, Y eats a dish
    match: '.pslot[data-id]',
    y(e) { e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); },
    label(e, nav) { const p = nav.ui.panels.inventory; return { a: 'Choose', y: p?.view === 'pantry' && e.closest('.pv, .p-inv') ? 'Eat' : '' }; },
  },
  { // the big map's People and Places (ui/mapDir.js): A pins (the map centres on them), Y Shadow takes you there, X unpins
    match: '.mp-row',
    y(e, nav) { const M = nav.ui.panels.map; M.select(e.dataset.key, { pin: true, centre: true }); M.takeMeThere(); },
    x(e, nav) { const G = nav.ui.G; if (G?.mapPin?.is(e.dataset.key)) { G.mapPin.clear('unpin'); nav.ui.panels.map.dir.render(true); } },
    label(e, nav) { const G = nav.ui.G, away = e.classList.contains('away'); return { a: away ? 'Show' : 'Pin', y: !away && G?.lead ? 'Take me there' : '', x: G?.mapPin?.is(e.dataset.key) ? 'Unpin' : '' }; },
  },
  { match: '.p-stash .st-chip', label(e) { return { a: e.classList.contains('on') ? '' : 'Show only these' }; } }, // (the stash's filter chips)
  { match: '.mp-chip', label(e) { return { a: e.classList.contains('on') ? 'Hide' : 'Show' }; } }, // (the map's filter chips)
  { match: '.chg-pk', label() { return { a: 'Learn' }; } },
  { match: '.chg-sk', label(e) { return { a: e.classList.contains('sel') ? '' : 'Show its perks' }; } }, // (the Charge drawer's skill strip, R-16)
  { match: '.ck-row', label() { return { a: 'Choose' }; } },
  { match: '.dr', a() {}, label() { return { a: '' }; } }, // (a stat row: its tooltip only)
  { // the Spirit Lantern (ui/lantern.js): A adds / removes a card or sets off, X "Surprise me", Y "Recommended"
    match: '.p-lantern button',
    x(e, nav) { nav.ui.panels.lantern.surprise(); },
    y(e, nav) { nav.ui.panels.lantern.recommend(); },
    label(e) { return { a: e.matches('.ln-card') ? (e.classList.contains('on') ? 'Remove' : 'Add') : e.matches('.ln-go') ? 'Set off' : e.matches('.ln-slot') ? 'Take out' : 'Select', x: 'Surprise me', y: 'Recommended' }; },
  },
  { // the Sightings board (ui/sightings.js): A on a sighting's button opens the Travel Map on its zone
    match: '.p-sight button',
    label() { return { a: 'Travel Map' }; },
  },
  { // the Adventurers' Guild (ui/guild.js): A signs a candidate on, pays back wages, dismisses (twice), upgrades, buys a tool, opens a board
    match: '.p-guild button',
    label(e) { return { a: e.matches('.gd-sign') ? 'Sign on' : e.matches('.gd-pay') ? 'Pay' : e.matches('.gd-dis') ? (e.classList.contains('armed') ? 'Dismiss' : 'Dismiss…') : e.matches('.gd-up') ? 'Upgrade' : e.matches('.gd-buy') ? 'Buy' : e.matches('.gd-board') ? 'Open' : 'Select' }; },
  },
  { // the Expedition Board (ui/expeditions.js): A adds / removes a crew member, picks a job or sends; Y the best crew, X clear
    match: '.p-exp button',
    x(e, nav) { const P = nav.ui.panels.expeditions; if (P.view === 'story' || P.view === 'village' || P.view === 'errands') P.clear(); },
    y(e, nav) { const P = nav.ui.panels.expeditions; if (P.view === 'story' || P.view === 'village' || P.view === 'errands') P.best(); },
    label(e, nav) {
      const P = nav.ui.panels.expeditions, pick = P.view === 'story' || P.view === 'village' || P.view === 'errands'; // (village: the zone villagers' quests, docs/COZY.md §3.2)
      const a = e.matches('.ex-mem') ? (e.classList.contains('on') ? 'Remove' : 'Add') : e.matches('.ex-go') ? 'Send off' : e.matches('.ex-recall') ? 'Call home' : e.matches('.ex-obj') ? (P.view === 'reports' ? 'Read' : 'Pick') : e.matches('.ex-tog') ? 'Lunches' : 'Select';
      return { a, x: pick ? 'Clear' : '', y: pick ? 'Best crew' : '' };
    },
  },
];
function isPantryBuy(e) { return !e.classList.contains('sell') && e.classList.contains('pgood') && !e.classList.contains('tool'); }
function handlerFor(e) { if (!e) return null; for (const h of HANDLERS) if (e.matches(h.match)) return h; return null; }

// ---------------------------------------------------------------- helpers
function visible(e) {
  const r = e.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false;
  return getComputedStyle(e).visibility !== 'hidden';
}
function fire(e, type, bubbles = true) {
  const Ev = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  try { e.dispatchEvent(new Ev(type, { bubbles, cancelable: true, view: window, relatedTarget: null })); } catch (x) { /* */ }
}
/** a selector that finds the same element after a re-render (data attributes, else the class and the index) */
function selectorOf(e) {
  const d = e.dataset || {};
  for (const k of ['id', 'i', 'c', 'a', 't', 'k', 'v', 'p', 'z', 'm', 'key', 'pid', 'inv', 'fid', 'bind', 'dev', 'open']) if (d[k] != null) {
    const cls = [...e.classList].filter(c => /^[a-z]/.test(c) && !['on', 'sel', 'has', 'new', 'pop', 'lifted', 'can-drop', 'no-drop'].includes(c))[0];
    const extra = k === 'i' && d.c != null ? `[data-c="${d.c}"]` : '';
    return `${cls ? '.' + cls : e.tagName.toLowerCase()}[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(String(d[k]))}"]${extra}`;
  }
  return e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).filter(c => !['on', 'sel'].includes(c)).map(c => CSS.escape(c)).join('.') : e.tagName.toLowerCase();
}
