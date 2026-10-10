// Spatial focus navigation for the gamepad (docs/CONTROLS.md §3, ROADMAP CT-2). While the pad plays and a panel, the
// popover or the guide's offer card is open, a focus ring sits on one element of it:
//   - the D-pad or the left stick moves it to the nearest element that way (its own row or column first; across side by
//     side panels too: the bag next to a shop or the stash);
//   - A selects (a click, or the element's own action: HANDLERS), B goes back (ui.back: a held item, the popover, the
//     top panel), LB / RB switch the panel's tabs, X / Y act per element (drop / sell / stash, equip / use, assign,
//     charge perks, eat, sell all…);
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
  stash: '.slot[data-c="stash"]', shop: '.sh-item', skills: '.node.can, .node.learned, .node', character: '.at-plus:not([disabled]), .attr .at-plus, .dr',
  quests: '.q-item, .gd-card .btn, .fl-card', cook: '.ck-row.sel, .ck-row', craft: '.ck-row.sel, .ck-row', travel: '.tv-pin.sel, .tv-pin.here, .tv-pin', gift: '.gf-card', seeds: '.sp-card',
  houseCard: '.btn.pink, .btn', remodel: '.rm-set.on, .rm-set', lantern: '.ln-go',
  expeditions: '.ex-go:not([disabled]), .ex-mem.can, .ex-obj.sel, .ex-recall, .ex-obj', awayCard: '.aw-ok', // (the cozy path: docs/COZY.md §10)
  sightings: '.sg-go:not([disabled])', // (the Sightings board: docs/COZY.md §6.3)
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
    // the map: the triggers or the right stick zoom
    if (S.top?.name === 'map') { const z = (A.padDown('RT') ? 1 : 0) - (A.padDown('LT') ? 1 : 0) + A.aim().y; if (Math.abs(z) > 0.1) { const M = S.top; M.zoom = Math.max(0.5, Math.min(3, M.zoom * (1 + z * dt * 1.6))); M.draw(); } }
    // the pad's buttons
    if (A.nav) {
      if (cur?.matches('input[type=range]') && (A.nav === 'left' || A.nav === 'right')) this.slide(cur, A.nav === 'right' ? 1 : -1);
      else { const n = this.step(cands, A.nav); if (n) { this.focus(n, cands); this.ui.sfx('hover'); } else this.bump(); }
    }
    if (A.padHit('LB') || A.padHit('RB')) { this.tab(S, A.padHit('RB') ? 1 : -1); A.padConsume('LB'); A.padConsume('RB'); }
    // the K panel: LT / RT step the Charge drawer through the tree's skills (R-16; the focus stays where it is)
    if (S.top?.name === 'skills' && (A.padHit('LT') || A.padHit('RT'))) { const R = A.padHit('RT'); A.padConsume('LT'); A.padConsume('RT'); S.top.chg.cycle(R ? 1 : -1); }
    if (A.padHit('A') && this.cur) { A.padConsume('A'); this.armed = null; this.press(this.cur); }
    if (A.padHit('X') && this.cur) { A.padConsume('X'); h?.x?.(this.cur, this); }
    if (A.padHit('Y') && this.cur) { A.padConsume('Y'); this.armed = null; h?.y?.(this.cur, this); }
    if (A.padHit('B')) { // back: out of the menu's Settings / Controls to its main page first, else ui.back (a held item, the popover, the top panel)
      A.padConsume('B'); this.armed = null;
      const M = this.ui.panels.menu;
      if (S.top === M && M.view !== 'main' && !M.wait) { this.blur(); M.act('back'); this.cur = null; } else this.ui.back();
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
    if (this.ui.drag?.held) this.ghostTo(e); // (a held item rides the focus)
    void cands;
  }
  ghostTo(e) {
    const D = this.ui.drag; if (!D?.held) return;
    const r = e.getBoundingClientRect();
    D.mx = r.left + r.width * 0.7; D.my = r.top + r.height * 0.7;
    D.ghost.style.transform = `translate3d(${D.mx}px,${D.my}px,0)`;
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
    const root = S.top?.panel;
    if (root && [...root.querySelectorAll('.tabs .tab, .ctl-tabs button')].filter(visible).length > 1) list.push(['LB+RB', 'Tabs']);
    if (e?.matches('input[type=range]')) list.push(['DLeft+DRight', 'Adjust']);
    if (S.top?.name === 'map') list.push(['LT+RT', 'Zoom']);
    if (S.top?.name === 'skills' && !S.top.chg?.el.hidden) list.push(['LT+RT', 'Charge skill']);
    list.push(['B', this.ui.drag?.held ? 'Cancel' : S.key === 'pop' ? 'Close' : 'Back']);
    const sig = list.map(x => x.join(':')).join('|') + Actions.padStyle;
    if (sig !== this._hsig) {
      this._hsig = sig;
      this.hintsEl.innerHTML = list.filter(x => x[1]).map(([b, t]) => `<span class="ph-i">${b.split('+').map(t2 => `<span class="kc pad">${padGlyph(t2)}</span>`).join('')}<b>${t}</b></span>`).join('');
    }
    // under the top panel, centred on it; above it when there's no room; beside a panel as tall as the screen (its
    // bottom corner, right side first); else over its bottom edge. M: the margin (the Deck's safe area: deck.css)
    const box = (S.top?.panel || S.roots[0])?.getBoundingClientRect(); if (!box) return;
    const H = this.hintsEl; H.classList.add('on');
    const w = H.offsetWidth, hh = H.offsetHeight, M = this.ui.root?.classList.contains('deck-ui') ? 14 : 6;
    let x = box.left + box.width / 2 - w / 2, y = box.bottom + 10;
    if (y + hh > innerHeight - M) {
      y = box.top - hh - 10;
      if (y < M) {
        y = Math.min(innerHeight - M - hh, box.bottom - hh);
        if (box.right + 12 + w <= innerWidth - M) x = box.right + 12;
        else if (box.left - 12 - w >= M) x = box.left - 12 - w;
        else y = Math.min(innerHeight - M - hh, box.bottom - hh / 2);
      }
    }
    x = Math.max(M + 2, Math.min(innerWidth - w - M - 2, x));
    H.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
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
  { // bag, stash and the paper doll: A picks up / puts down (the item rides the focus), Y equips / uses / unequips, X sells, stashes or drops
    match: '.slot[data-c="inv"], .slot[data-c="stash"], .slot[data-c="equip"]',
    a(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e);
      if (D.held) { D.place(D.held, a); return; }
      if (!D.get(a)) return;
      D.lift(a, e); nav.ghostTo(e);
    },
    y(e, nav) { const D = nav.ui.drag; if (D.held) return; if (D.get(slotAddr(e))) D.context(e, { shiftKey: false }); },
    x(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e), it = D.get(a); if (!it || D.held) return;
      if (a.c === 'inv' && shopOpen(nav)) { D.sell(a); return; }
      if ((a.c === 'inv' && stashOpen(nav)) || a.c === 'stash') { D.quickMove(a, it); return; }
      if (a.c === 'inv' && nav.confirm(e, 'drop it')) D.dropToGround(a);
    },
    label(e, nav) {
      const D = nav.ui.drag, a = slotAddr(e), it = D.get(a);
      if (D.held) return { a: 'Place' };
      if (!it) return { a: '' };
      return { a: 'Pick up', y: a.c === 'equip' ? 'Unequip' : a.c === 'stash' ? 'To bag' : it.kind === 'gear' ? 'Equip' : it.kind !== 'material' ? 'Use' : '', x: a.c === 'equip' ? '' : a.c === 'inv' && shopOpen(nav) ? 'Sell' : (a.c === 'inv' && stashOpen(nav)) ? 'Stash' : a.c === 'stash' ? '' : 'Drop' };
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
