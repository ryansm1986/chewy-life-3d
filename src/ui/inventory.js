// Inventory (10x4 grid + paper doll), the shared item pick-up / drag & drop controller, and the item grids' layout.
// The bag and the stash are grids of placed items (rpg/grid.js, docs/INVENTORY.md): layoutGrid lays a grid's cells out
// (each item's anchor cell spans its footprint, the cells it covers hide), and ItemDrag drops a held item by where the
// pointer is over a grid (the footprint centred on it), showing a green or red footprint first.
import { el, esc, fmt, replay, setText, rarityColor } from './dom.js';
import { glyph, SLOT_GLYPH } from './glyphs.js';
import { portrait } from './portraits.js';
import { Panel } from './panel.js';
import { itemIconURL, itemIconSizedURL, itemName, meetsReq, equipSlotsFor, sellPrice } from './rpg.js';
import { itemTipHTML } from './tooltip.js';
import { PantryView } from './pantry.js';
import { FurnitureView } from './furniture.js';
import { padWording } from './padGlyphs.js';
import { Actions } from '../core/actions.js';
import { stashSpot, tabGrid, tabOf, lostGrid } from '../rpg/stash.js';
import { bagGrid, findSpot, fitsAt, cover, itemSize } from '../rpg/grid.js';
import { isUpgrade } from '../rpg/power.js';
import './itemGrid.css';

/** a footer hint: the mouse's wording, or the pad's buttons while it plays */
function hintTo(e, t) { if (!e) return; const h = padWording(esc(t)); if (e._h !== h) { e._h = h; e.innerHTML = h; } }

export const EQUIP_SLOTS = ['weapon', 'weaponAlt', 'hat', 'outfit', 'collar', 'charm1', 'charm2', 'boots', 'paws'];
const SLOT_LABEL = { weapon: 'Weapon', weaponAlt: 'Swap', hat: 'Hat', outfit: 'Outfit', collar: 'Collar', charm1: 'Charm', charm2: 'Charm', boots: 'Boots', paws: 'Paws' };

// ------------------------------------------------------------------ slot helpers
export function makeSlot(c, i, cls = '') {
  const s = el('div', 'slot ' + cls);
  s.dataset.c = c; s.dataset.i = i;
  return s;
}
export function paintSlot(s, item, ui, w = 1, h = 1) {
  const st = ui.G?.state, d = ui.G?.derived;
  const req = item ? meetsReq(item, st, d).ok : true;
  const up = !!item && item.kind === 'gear' && s.dataset.c !== 'equip' && !!st && isUpgrade(item, st); // (the green arrow: better for the hero being played, docs/STATS.md §1)
  const sig = item ? `${item.uid}|${item.qty || 1}|${req}|${ui.seen.has(item.uid)}|${w}x${h}|${(item.gems || []).length}|${up}` : '';
  if (s._sig === sig) return;
  const first = s._sig === undefined;
  const hadItem = !!s._sig || first;
  s._sig = sig;
  s.classList.remove('r-normal', 'r-magic', 'r-rare', 'r-unique', 'r-set', 'has', 'unmet', 'new', 'upg');
  const lbl = s.dataset.c === 'equip' ? `<span class="sl-lbl">${glyph(SLOT_GLYPH[s.dataset.i] || 'sparkle')}</span>` : '';
  if (!item) { s.innerHTML = lbl; return; }
  s.classList.add('has', 'r-' + (item.rarity || 'normal'));
  if (!req) s.classList.add('unmet');
  if (!ui.seen.has(item.uid)) s.classList.add('new');
  if (up) s.classList.add('upg');
  s.style.setProperty('--rc', rarityColor(item.rarity));
  s.innerHTML = `<img src="${w * h > 1 ? itemIconSizedURL(item, w, h) : itemIconURL(item)}" alt="" draggable="false">${item.qty > 1 ? `<b class="qty">${item.qty}</b>` : ''}${up ? '<i class="upg-a" title="Better than what you wear"></i>' : ''}${item.sockets ? `<span class="socks">${Array.from({ length: item.sockets }, (_, k) => `<i class="${item.gems?.[k] ? 'on' : ''}"${item.gems?.[k] ? ` style="--gc:${GEM_DOT[item.gems[k].type] || '#ff8fd0'}"` : ''}></i>`).join('')}</span>` : ''}`;
  if (!hadItem || s._popNext) { s._popNext = false; replay(s, 'pop', 500); }
}

/** the socket dots' colours: each treat's own (rpg/items.js GEMS) */
const GEM_DOT = { ruby: '#e8364a', blueberry: '#4a6ae8', lemon: '#ffd83a', cheese: '#ffc83a', diamond: '#cfe6ff', topaz: '#ffa82a' };

/** Lay a grid's cells out as placed items: an item's anchor cell spans its footprint (and shows its icon drawn into it),
 *  the cells it covers hide, an empty cell is a 1 x 1 spot. cells: one slot element per cell of the view (data-i becomes
 *  the absolute index); g: the grid view (rpg/grid.js); o.dim(item): fade it (the stash's filter: no hover, no pick-up). */
export function layoutGrid(cells, g, ui, o = {}) {
  const n = g.w * g.h, cov = cover(g);
  for (let k = 0; k < cells.length; k++) {
    const s = cells[k], abs = g.off + k;
    if (+s.dataset.i !== abs) { s.dataset.i = abs; s._sig = undefined; }
    if (k >= n) { if (!s._cov) { s._cov = true; s.classList.add('cov'); } continue; }
    const a = cov[k];
    if (a >= 0 && a !== abs) { if (!s._cov) { s._cov = true; s.classList.add('cov'); } continue; }
    if (s._cov) { s._cov = false; s.classList.remove('cov'); }
    const it = g.cells[abs] || null, [w0, h0] = it ? itemSize(it) : [1, 1], x = k % g.w, y = (k / g.w) | 0, w = Math.min(w0, g.w - x), h = Math.min(h0, g.h - y); // (clamped: a footprint never widens the grid, even in a layout that's off)
    const area = `${y + 1} / ${x + 1} / span ${h} / span ${w}`;
    if (s._area !== area) { s._area = area; s.style.gridArea = area; s.classList.toggle('span', w * h > 1); s.classList.toggle('tall', h > w); s.classList.toggle('wide', w > h); }
    paintSlot(s, it, ui, w, h);
    const dim = !!(it && o.dim?.(it));
    if (dim !== !!s._dim) { s._dim = dim; s.classList.toggle('dim', dim); }
  }
}

// ------------------------------------------------------------------ pick-up / drag controller
export class ItemDrag {
  constructor(ui) {
    this.ui = ui; this.held = null; this.press = null; this.dragging = false;
    this.ghost = el('div', 'cursor-item'); this.ghost.innerHTML = '<div class="ci-in"><img alt=""></div>';
    ui.layers.over.appendChild(this.ghost);
    this.gimg = this.ghost.querySelector('img');
    const L = ui.layers.panels;
    L.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e), { passive: true });
    addEventListener('pointerup', e => this.up(e));
    L.addEventListener('contextmenu', e => { const s = e.target.closest('.slot[data-c]'); if (s) { e.preventDefault(); this.context(s, e); } });
    // clicking the world while holding an item drops it on the ground
    addEventListener('mousedown', e => {
      if (!this.held || e.button !== 0) return;
      if (e.target && e.target.id === 'game') { e.stopPropagation(); this.dropToGround(this.held); }
    }, true);
    L.addEventListener('mouseover', e => {
      const s = e.target.closest('.slot[data-c]'); if (!s || s === this._hover) return;
      this._hover = s; this.hoverSlot(s);
    });
    L.addEventListener('mouseout', e => { const s = e.target.closest('.slot[data-c]'); if (s && !s.contains(e.relatedTarget)) { this._hover = null; ui.tip.hide(s); } });
  }
  get A() { return this.ui.G?.actions || {}; }
  addr(s) { const c = s.dataset.c; return { c, i: c === 'equip' ? s.dataset.i : +s.dataset.i }; }
  get(a) {
    const st = this.ui.G?.state; if (!st || !a) return null;
    if (a.c === 'inv') return st.inventory?.[a.i] || null;
    if (a.c === 'stash') return st.stash?.[a.i] || null;
    if (a.c === 'lost') return st.lostFound?.[a.i] || null;
    if (a.c === 'equip') return st.equipment?.[a.i] || null;
    if (a.c === 'shop') return this.ui.panels.shop?.itemAt(a.i) || null;
    return null;
  }
  same(a, b) { return a && b && a.c === b.c && a.i === b.i; }
  hoverSlot(s) {
    const a = this.addr(s); const it = this.get(a);
    if (!it) { if (a.c === 'equip') this.ui.tip.show(`<div class="tt-simple"><div class="tt-h">${SLOT_LABEL[a.i] || a.i}</div><div class="tt-d tt-dim">Empty — drag gear here</div></div>`, '', s); return; }
    if (!this.ui.seen.has(it.uid)) { this.ui.seen.add(it.uid); s.classList.remove('new'); }
    if (this.dragging || this.held) return;
    this.ui.tip.show(this.tipFor(it, a), 'item', s, () => { const i2 = this.get(a); return i2 ? this.tipFor(i2, a) : ''; });
  }
  tipFor(it, a) {
    const ui = this.ui, st = ui.G?.state;
    const hints = [];
    const shop = ui.isOpen('shop'), stash = ui.isOpen('stash');
    if (a.c === 'inv') {
      if (it.kind === 'gear') hints.push('<b>Right-click</b> equip');
      else if (it.kind !== 'material') hints.push('<b>Right-click</b> use');
      if (shop) hints.push('<b>Shift+Right-click</b> sell');
      if (stash) hints.push('<b>Ctrl+Click</b> to stash');
      hints.push('<b>Drag</b> to move');
    } else if (a.c === 'equip') hints.push('<b>Right-click</b> unequip');
    else if (a.c === 'stash' || a.c === 'lost') hints.push('<b>Right-click</b> to bag');
    const price = shop && a.c !== 'shop' ? { label: 'Sells for', value: sellPrice(it) } : null;
    return itemTipHTML(it, { state: st, derived: ui.G?.derived, compare: a.c === 'equip' ? null : x => this.equippedFor(x), price, hints });
  }
  equippedFor(item) {
    const eq = this.ui.G?.state?.equipment || {};
    const slots = equipSlotsFor(item); if (!slots.length) return null;
    if (item.slot === 'weapon') return eq[(this.ui.G.state.player?.activeWeapon ? 'weaponAlt' : 'weapon')] || eq.weapon || null;
    for (const s of slots) if (eq[s]) return eq[s];
    return null;
  }
  down(e) {
    if (e.button !== 0) return;
    const s = e.target.closest('.slot[data-c]');
    if (s?.dataset.c === 'shop') return; // shop handles its own clicks
    if (this.held) { // put it down: an equip slot, else where the pointer is over a grid (the footprint centred on it)
      const tgt = s?.dataset.c === 'equip' ? this.addr(s) : this.gridTarget(e.clientX, e.clientY);
      if (!tgt) return;
      e.preventDefault();
      if (e.pointerType === 'touch' && tgt.c !== 'equip') { this.touchHold = true; this.preview(e.clientX, e.clientY); return; } // (touch: the footprint shows under the finger; it goes down when the finger lifts)
      this.place(this.held, tgt);
      return;
    }
    if (!s || s._dim) return;
    const a = this.addr(s);
    e.preventDefault();
    const it = this.get(a); if (!it) return;
    if (e.ctrlKey || e.metaKey) { this.quickMove(a, it); return; }
    this.press = { a, x: e.clientX, y: e.clientY, s };
  }
  move(e) {
    this.mx = e.clientX; this.my = e.clientY;
    if (this.press && !this.dragging && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6) {
      this.dragging = true; this.lift(this.press.a, this.press.s);
    }
    if (this.dragging || this.held) { this.ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`; this.preview(e.clientX, e.clientY); }
  }
  up(e) {
    if (this.touchHold) { // (touch, an item in hand: it goes down where the finger lifts, over a grid)
      this.touchHold = false;
      const tgt = this.gridTarget(e.clientX, e.clientY);
      if (tgt && this.held) this.place(this.held, tgt); else this.hidePreview();
      return;
    }
    if (!this.press) return;
    const p = this.press; this.press = null;
    if (this.dragging) {
      this.dragging = false;
      const from = this.held;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const s = under?.closest?.('.slot[data-c="equip"]'), tab = under?.closest?.('.p-stash .st-tab[data-t]'), tgt = !s && this.gridTarget(e.clientX, e.clientY);
      if (s) this.place(from, this.addr(s));
      else if (tgt) this.place(from, tgt);
      else if (tab) this.toTab(from, tab.dataset.t === 'lost' ? -1 : +tab.dataset.t); // (dropped on a stash tab's header: into that tab)
      else if (under && under.id === 'game') this.dropToGround(from);
      else this.cancel();
    } else {
      // plain click → pick up (D2 style)
      this.lift(p.a, p.s);
      this.ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    }
  }
  // ---------------------------------------------------------------- the grids under the pointer (docs/INVENTORY.md)
  /** a grid element's container and view: the bag, the stash's open tab, Lost & Found */
  viewOf(ge) {
    const st = this.ui.G?.state, c = ge?.dataset.g; if (!st || !c) return null;
    if (c === 'inv') return { c, g: bagGrid(st) };
    if (c === 'stash') return { c, g: tabGrid(st, this.ui.panels.stash?.tab || 0) };
    if (c === 'lost') return { c, g: lostGrid(st) };
    return null;
  }
  /** the grid element on top at a screen point (the one you see there: not a panel behind another), and the point in its
   *  cells (x, y: fractional) */
  gridUnder(x, y) {
    const top = document.elementFromPoint(x, y), ge = top?.closest?.('.grid[data-g]');
    if (ge && ge.closest('.l-panels')) {
      const r = ge.getBoundingClientRect();
      const v = this.viewOf(ge); if (!v || !v.g.h) return null;
      const cs = getComputedStyle(ge), C = parseFloat(cs.gridTemplateColumns) || 52, G = parseFloat(cs.columnGap) || 0, pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
      const z = r.width / (2 * bl + pl + (parseFloat(cs.paddingRight) || 0) + v.g.w * C + (v.g.w - 1) * G) || 1;
      return { ge, ...v, C, G, pl, pt, cx: ((x - r.left) / z - bl - pl + G / 2) / (C + G), cy: ((y - r.top) / z - bt - pt + G / 2) / (C + G) };
    }
    return null;
  }
  /** where the held item (else a 1 x 1) would go with the pointer at a screen point: its footprint centred there, kept on
   *  the grid; a grid ref (its anchor), or null off the grids */
  gridTarget(x, y) {
    const u = this.gridUnder(x, y); if (!u) return null;
    const it = this.held && this.get(this.held), [w, h] = it ? itemSize(it) : [1, 1];
    const ax = Math.max(0, Math.min(u.g.w - w, Math.floor(u.cx - w / 2 + 0.5 + 1e-6))), ay = Math.max(0, Math.min(u.g.h - h, Math.floor(u.cy - h / 2 + 0.5 + 1e-6))); // (an even footprint over a cell's centre: that cell is its left / top one)
    return { c: u.c, i: u.g.off + ay * u.g.w + ax };
  }
  /** a grid ref held at the focus (the pad): the anchor kept on the grid for the held item's footprint */
  clampTo(to, it) {
    if (!to || to.c === 'equip' || !it) return to;
    const g = this.viewFor(to); if (!g) return to;
    const [w, h] = itemSize(it), k = to.i - g.off, x = Math.min(g.w - w, k % g.w), y = Math.min(g.h - h, (k / g.w) | 0);
    return { c: to.c, i: g.off + Math.max(0, y) * g.w + Math.max(0, x) };
  }
  /** the grid view a grid ref is in (the bag, its stash tab, Lost & Found), whichever tab the stash shows */
  viewFor(ref) {
    const st = this.ui.G?.state; if (!st || !ref) return null;
    if (ref.c === 'inv') return bagGrid(st);
    if (ref.c === 'stash') return tabGrid(st, tabOf(ref.i));
    if (ref.c === 'lost') return lostGrid(st);
    return null;
  }
  /** can an item (the held one) from `from` go at a grid ref? 'ok' (free), 'swap' (onto exactly one, which you then
   *  hold), or 'bad' (onto two or more, off the grid, into Lost & Found, onto an item the stash's filter fades) */
  verdict(to, from = this.held, it = from && this.get(from)) {
    if (!it || !to || to.c === 'equip' || to.c === 'lost') return 'bad';
    const g = this.viewFor(to); if (!g) return 'bad';
    const k = to.i - g.off, f = fitsAt(g, it, k % g.w, (k / g.w) | 0, from?.c === to.c ? from.i : -1);
    if (f.out || f.under.length > 1) return 'bad';
    if (f.under.length === 1) { const b = g.cells[f.under[0]]; if (this.ui.panels.stash?.dimmed?.(b)) return 'bad'; return 'swap'; }
    return 'ok';
  }
  /** the footprint under the pointer (or the pad's focus): green where it can go, gold onto one item (a swap), red not */
  preview(x, y, to = null) {
    const t = to || this.gridTarget(x, y), it = this.held && this.get(this.held);
    if (!t || !it || t.c === 'equip') { this.hidePreview(); return; }
    const ge = this.ui.layers.panels.querySelector(`.grid[data-g="${t.c}"]`), v = ge && this.viewOf(ge); if (!v || (t.c === 'stash' && tabOf(t.i) !== (this.ui.panels.stash?.tab ?? 0))) { this.hidePreview(); return; }
    let fp = ge.querySelector(':scope > .g-fp'); if (!fp) { fp = el('div', 'g-fp'); ge.appendChild(fp); }
    if (this._fp && this._fp !== fp) this._fp.classList.remove('on');
    this._fp = fp;
    const cs = getComputedStyle(ge), C = parseFloat(cs.gridTemplateColumns) || 52, G = parseFloat(cs.columnGap) || 0, pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
    const [w, h] = itemSize(it), k = t.i - v.g.off, ax = k % v.g.w, ay = (k / v.g.w) | 0, vd = this.verdict(t);
    fp.style.transform = `translate(${pl + ax * (C + G) - 2}px,${pt + ay * (C + G) - 2}px)`;
    fp.style.width = `${w * C + (w - 1) * G + 4}px`; fp.style.height = `${h * C + (h - 1) * G + 4}px`;
    fp.className = `g-fp on ${vd}`;
    this._fpAt = { ...t, vd };
  }
  hidePreview() { if (this._fp) this._fp.classList.remove('on'); this._fpAt = null; }
  lift(a, s) {
    const it = this.get(a); if (!it) return;
    this.held = a; this.heldEl = s;
    const [gw, gh] = itemSize(it);
    this.gimg.src = gw * gh > 1 ? itemIconSizedURL(it, gw, gh) : itemIconURL(it);
    this.ghost.style.setProperty('--gw', gw); this.ghost.style.setProperty('--gh', gh);
    this.ghost.style.setProperty('--rc', rarityColor(it.rarity));
    this.ghost.classList.remove('show'); void this.ghost.offsetWidth; this.ghost.classList.add('show');
    if (this.mx != null) this.ghost.style.transform = `translate3d(${this.mx}px,${this.my}px,0)`;
    s?.classList.add('lifted');
    this.ui.tip.hide();
    this.ui.root.classList.add('holding');
    // highlight equip targets
    const ok = new Set(equipSlotsFor(it));
    for (const e of this.ui.layers.panels.querySelectorAll('.slot[data-c="equip"]')) {
      e.classList.toggle('can-drop', ok.has(e.dataset.i));
      e.classList.toggle('no-drop', !ok.has(e.dataset.i));
    }
    this.ui.sfx?.('pick');
  }
  cancel() {
    this.hidePreview(); this.touchHold = false;
    this.held = null;
    this.heldEl?.classList.remove('lifted'); this.heldEl = null;
    this.ghost.classList.remove('show');
    this.ui.root.classList.remove('holding');
    for (const e of this.ui.layers.panels.querySelectorAll('.can-drop, .no-drop')) e.classList.remove('can-drop', 'no-drop');
  }
  place(from, to) {
    if (!from) return;
    const it = this.get(from);
    to = this.clampTo(to, it);
    if (this.same(from, to)) { this.cancel(); return; }
    if (to.c === 'equip' && it && !equipSlotsFor(it).includes(to.i)) { this.deny(to); return; }
    if (to.c === 'shop' || to.c === 'lost') { this.deny(to); return; } // (Lost & Found only gives back)
    if (to.c !== 'equip' && this.verdict(to, from, it) === 'bad') { this.deny(to); return; } // (onto two or more, or a filtered-out item)
    if (from.c === 'equip' && to.c !== 'equip') {
      const g = this.viewFor(to), k = g ? to.i - g.off : 0;
      const f = g ? fitsAt(g, it, k % g.w, (k / g.w) | 0) : { under: [] }, other = f.under.length === 1 ? g.cells[f.under[0]] : null;
      if (other && !equipSlotsFor(other).includes(from.i)) { this.deny(to); return; }
    }
    const A = this.A;
    let r = true;
    try { r = A.moveItem ? A.moveItem(from, to) : false; } catch (e) { console.warn('[ui] moveItem failed', e); r = false; }
    this.cancel();
    if (r === false) { this.deny(to); return; }
    this.ui.sfx?.('drop');
    this.markPop(to);
    this.ui.refreshItems();
    if (r?.swap) { // (onto one item: you're holding that one now, as in Diablo)
      const s = this.ui.layers.panels.querySelector(`.slot[data-c="${r.swap.c}"][data-i="${r.swap.i}"]`);
      this.lift(r.swap, s);
      if (this.mx != null) this.preview(this.mx, this.my);
      this.ui.padNav?.ghostTo?.(this.ui.padNav.cur || s);
    }
  }
  markPop(a) { const s = this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`); if (s) { s._popNext = true; } }
  deny(a) {
    const s = a && this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`);
    if (s) replay(s, 'deny', 450);
    this.cancel();
    this.ui.sfx?.('deny');
  }
  dropToGround(from) {
    const it = this.get(from);
    this.cancel();
    if (!it) return;
    try { this.A.dropItem?.(from); } catch (e) { console.warn('[ui] dropItem failed', e); }
    this.ui.refreshItems();
  }
  quickMove(a, it) {
    const st = this.ui.G.state;
    if (this.ui.isOpen('shop') && a.c === 'inv') { this.sell(a); return; }
    // bag → stash: the open tab first, then the first tab with room (rpg/stash.js); stash → bag: the first spot that fits
    if (a.c === 'inv' && this.ui.isOpen('stash')) { const open = this.ui.panels.stash?.tab || 0, j = stashSpot(st, it, open); if (j >= 0) { this.place(a, { c: 'stash', i: j }); if (tabOf(j) !== open) this.ui.panels.stash?.bumpTab?.(tabOf(j)); } else { this.deny(a); this.ui.toast?.('The stash is full!', { icon: 'chest', color: '#ff8fb0' }); } return; }
    if (a.c === 'stash' || a.c === 'lost') { const j = findSpot(bagGrid(st), it); if (j >= 0) this.place(a, { c: 'inv', i: j }); else { this.deny(a); this.ui.toast?.('No room in your bag', { icon: 'bag', color: '#ff8fb0' }); } }
  }
  /** an item dropped on a stash tab's header (a drag, a click or a tap while holding it, the pad's A): into that tab's
   *  first spot with room. Its own tab: it stays where it is. */
  toTab(from, t) {
    const st = this.ui.G?.state, it = this.get(from); if (!st || !it) { this.cancel(); return; }
    if (t < 0) { this.cancel(); this.ui.sfx?.('deny'); this.ui.toast?.('Lost & Found only gives back', { icon: 'chest', color: '#ff8fb0' }); return; }
    if (from.c === 'stash' && tabOf(from.i) === t) { this.cancel(); return; }
    const j = findSpot(tabGrid(st, t), it);
    if (j < 0) { const tab = st.stashTabs?.[t]; this.cancel(); this.ui.sfx?.('deny'); this.ui.toast?.(`${tab?.name || 'That tab'} is full!`, { icon: 'chest', color: '#ff8fb0' }); this.ui.panels.stash?.bumpTab?.(t); return; }
    this.place(from, { c: 'stash', i: j });
    this.ui.panels.stash?.bumpTab?.(t);
  }
  sell(a) {
    const it = this.get(a); if (!it) return;
    const sp = this.ui.panels.shop;
    const r = sp?.opts?.onSell ? sp.opts.onSell(a, it) : this.A.sellItem?.(a);
    if (r === false) { this.deny(a); return; }
    this.ui.sfx?.('coin');
    const s = this.ui.layers.panels.querySelector(`.slot[data-c="${a.c}"][data-i="${a.i}"]`);
    if (s) { const r2 = s.getBoundingClientRect(); this.ui.burst(r2.left + r2.width / 2, r2.top + r2.height / 2, { n: 10, colors: ['#ffcf4a', '#fff3b8', '#ffb34a'], kind: 'dot', spread: 50 }); }
    this.ui.tip.hide();
    this.ui.refreshItems();
  }
  context(s, e) {
    if (this.held) { this.cancel(); return; }
    const a = this.addr(s), it = this.get(a); if (!it) return;
    const A = this.A;
    if (a.c === 'shop') return;
    if (e.shiftKey && this.ui.isOpen('shop') && a.c !== 'equip') { this.sell(a); return; }
    let r;
    if (a.c === 'inv') {
      if (it.kind === 'gear') {
        const req = meetsReq(it, this.ui.G.state, this.ui.G.derived);
        if (!req.ok) { this.deny(a); this.ui.toast(`${this.st.player?.name || 'Chewy'} can't use that${req.other ? '' : ' yet'}!`, { icon: 'lock', color: '#ff6a7a' }); return; }
        r = A.equip?.(a.i);
        if (r !== false) { const sl = equipSlotsFor(it); for (const x of sl) this.markPop({ c: 'equip', i: x }); this.ui.sfx?.('equip'); }
      } else r = A.useItem ? A.useItem(a) : A.use ? A.use(a) : undefined;
    } else if (a.c === 'equip') { r = A.unequip?.(a.i); }
    else if (a.c === 'stash' || a.c === 'lost') { this.quickMove(a, it); return; }
    if (r === false) this.deny(a);
    this.ui.tip.hide();
    this.ui.refreshItems();
    // keep tooltip fresh on the slot still under the cursor
    requestAnimationFrame(() => { const u = document.elementFromPoint(this.mx ?? 0, this.my ?? 0)?.closest?.('.slot[data-c]'); if (u) this.hoverSlot(u); });
  }
}

// ------------------------------------------------------------------ inventory panel
// Three views: the Bag (gear, 40 slots + the paper doll), the Pantry (docs/HOMESTEAD.md §1, ui/pantry.js) and the
// Furniture storage (docs/HOUSING.md §2, ui/furniture.js).
export class InventoryPanel extends Panel {
  constructor(ui) { super(ui, { name: 'inventory', title: 'Bag', side: 'right', cls: 'p-inv', icon: 'bag' }); this.view = 'bag'; }
  init() {
    const b = this.body;
    this.extra.innerHTML = `<div class="tabs inv-tabs"><button class="tab on" data-v="bag">${glyph('bag')}Bag</button><button class="tab" data-v="pantry" style="--tc:#8fcf6a">${glyph('leaf')}Pantry<span class="kc sm">P</span></button><button class="tab" data-v="furniture" style="--tc:#ffb07a">${glyph('home')}Furniture</button></div>`;
    this.extra.querySelector('.inv-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t && t.dataset.v !== this.view) { this.setView(t.dataset.v); this.ui.sfx?.('tab'); } });
    b.innerHTML = `
      <div class="doll">
        <div class="doll-bg"><i class="petal p1"></i><i class="petal p2"></i><i class="petal p3"></i></div>
        <div class="doll-por">${portrait('chewy')}<div class="doll-shadow"></div></div>
        <div class="doll-name">Chewy <span class="lvtag">Lv <b>1</b></span></div>
        <button class="wswap" title="Swap weapons (X)">${glyph('swap')}<span class="kc sm">X</span></button>
      </div>
      <div class="inv-stats"></div>
      <div class="grid g10" data-g="inv"></div>
      <div class="inv-foot">
        <div class="pill coins">${glyph('coin')}<b>0</b></div>
        <div class="inv-hint">Drag items · Right-click to equip</div>
        <button class="btn sm sort">${glyph('sort')}Sort</button>
      </div>`;
    const doll = b.querySelector('.doll');
    const POS = { weapon: [18, 22, 'tall'], weaponAlt: [509, 22, 'tall'], hat: [108, 10], collar: [108, 82], outfit: [108, 154], charm1: [427, 10], charm2: [427, 82], paws: [427, 154], boots: [267, 164] };
    this.eq = {};
    for (const k of EQUIP_SLOTS) {
      const [x, y, t] = POS[k];
      const s = makeSlot('equip', k, 'eq ' + (t || ''));
      s.style.left = x + 'px'; s.style.top = y + 'px';
      doll.appendChild(s);
      doll.insertAdjacentHTML('beforeend', `<span class="eq-l" style="left:${x}px;top:${y + (t ? 111 : 59)}px;width:${t ? 64 : 56}px">${SLOT_LABEL[k]}</span>`);
      this.eq[k] = s;
    }
    const g = b.querySelector('.grid');
    this.cells = [];
    for (let i = 0; i < 40; i++) { const s = makeSlot('inv', i); s.style.setProperty('--i', i); g.appendChild(s); this.cells.push(s); }
    this.coins = b.querySelector('.inv-foot .coins b');
    this.statsEl = b.querySelector('.inv-stats');
    this.lvEl = b.querySelector('.lvtag b');
    b.querySelector('.sort').addEventListener('click', () => this.sort());
    b.querySelector('.wswap').addEventListener('click', () => { this.G.actions?.swapWeapons?.(); replay(b.querySelector('.wswap'), 'spin', 500); this.render(); });
    this.pv = new PantryView(this);
    b.insertBefore(this.pv.root, b.querySelector('.inv-foot'));
    this.fv = new FurnitureView(this);
    b.insertBefore(this.fv.root, b.querySelector('.inv-foot'));
    this.setView(this.view, true);
  }
  onOpen() { if (this.opts?.view && this.opts.view !== this.view) this.setView(this.opts.view, true); }
  setView(v, quiet) {
    this.view = v === 'pantry' || v === 'furniture' ? v : 'bag';
    if (!this.built) return;
    const P = this.view === 'pantry', F = this.view === 'furniture';
    this.panel.classList.toggle('v-pantry', P);
    this.panel.classList.toggle('v-furn', F);
    for (const t of this.extra.querySelectorAll('.inv-tabs .tab')) t.classList.toggle('on', t.dataset.v === this.view);
    this.setTitle(P ? 'Pantry' : F ? 'Furniture' : 'Bag');
    this.ui.tip.hide();
    if (!quiet) { this.pv._sig = null; replay(this.panel, 'vswap', 400); }
    this.render();
  }
  render() {
    if (this.view === 'pantry') { this.pv.render(); setText(this.coins, fmt(this.st.coins || 0)); hintTo(this.body.querySelector('.inv-hint'), 'Right-click a dish to eat · F at a garden bed to plant'); return; }
    if (this.view === 'furniture') { this.fv.render(); setText(this.coins, fmt(this.st.coins || 0)); hintTo(this.body.querySelector('.inv-hint'), Actions.device === 'pad' ? 'Your furniture storage · decorate from the game menu at home' : 'Your furniture storage · press B at home to decorate'); return; }
    const st = this.st, d = this.d, eq = st.equipment || {}, inv = st.inventory || [];
    const hero = st.activeHero || 'chewy';
    if (hero !== this._hero) { // the paper doll shows whoever is being played (the bag itself is shared)
      this._hero = hero;
      const por = this.body.querySelector('.doll-por'); por.innerHTML = portrait(hero) + '<div class="doll-shadow"></div>';
      this.body.querySelector('.doll-name').firstChild.textContent = (st.player?.name || 'Chewy') + ' ';
      this.body.querySelector('.doll').dataset.hero = hero;
    }
    for (const k of EQUIP_SLOTS) { const it = eq[k], [, h] = it && (k === 'weapon' || k === 'weaponAlt') ? itemSize(it) : [1, 1]; paintSlot(this.eq[k], it, this.ui, 1, h > 1 && itemSize(it)[0] === 1 ? 2 : 1); } // (a long weapon stands upright in its tall slot)
    layoutGrid(this.cells, bagGrid(st), this.ui); // (items take up space: rpg/grid.js)
    void inv;
    const aw = st.player?.activeWeapon ? 'weaponAlt' : 'weapon';
    this.eq.weapon.classList.toggle('active', aw === 'weapon');
    this.eq.weaponAlt.classList.toggle('active', aw === 'weaponAlt');
    setText(this.coins, fmt(st.coins || 0));
    setText(this.lvEl, String(st.player?.lvl || 1));
    const dmg = `${Math.round(d.dmgMin || 1)}–${Math.round(d.dmgMax || 3)}`;
    const html = [['swords', 'Damage', dmg], ['shield', 'Defense', Math.round(d.def || 0)], ['heart', 'Life', Math.round(d.lifeMax || 0)], ['bolt', 'Zoom', Math.round(d.zoomMax || 0)]]
      .map(([g, n, v]) => `<div class="ist">${glyph(g)}<span>${n}</span><b>${v}</b></div>`).join('');
    if (html !== this._stats) { this._stats = html; this.statsEl.innerHTML = html; }
    const shop = this.ui.isOpen('shop'), stash = this.ui.isOpen('stash');
    hintTo(this.body.querySelector('.inv-hint'), shop ? 'Shift+Right-click to sell' : stash ? 'Ctrl+Click to stash' : 'Drag items · Right-click to equip'); // (the pad's wording while it plays)
  }
  sort() {
    const A = this.G.actions || {};
    if (A.sortContainer) { if (A.sortContainer('inv')) { for (const c of this.cells) c._popNext = true, c._sig = undefined; this.ui.refreshItems(); this.ui.sfx?.('sort'); replay(this.body.querySelector('.grid'), 'g-sorted', 520); } else this.ui.sfx?.('deny'); return; }
    if (A.sortInventory) { A.sortInventory(); this.ui.refreshItems(); return; }
    if (!A.moveItem) return;
    const inv = this.st.inventory;
    const order = { unique: 0, set: 1, rare: 2, magic: 3, normal: 4 };
    const kindO = { gear: 0, gem: 1, gift: 2, key: 3, material: 4 };
    const want = inv.map((it, i) => ({ it, i })).filter(x => x.it).sort((a, b) =>
      (kindO[a.it.kind] ?? 5) - (kindO[b.it.kind] ?? 5) || (order[a.it.rarity] ?? 5) - (order[b.it.rarity] ?? 5) || (a.it.slot || '').localeCompare(b.it.slot || '') || (b.it.ilvl || 0) - (a.it.ilvl || 0)).map(x => x.it.uid);
    for (let target = 0; target < want.length; target++) {
      const cur = this.st.inventory.findIndex(x => x && x.uid === want[target]);
      if (cur !== target && cur >= 0) A.moveItem({ c: 'inv', i: cur }, { c: 'inv', i: target });
    }
    for (const c of this.cells) c._popNext = true, c._sig = null;
    this.ui.refreshItems();
    this.ui.sfx?.('sort');
  }
}

// ------------------------------------------------------------------ stash panel
// The stash panel and its tabs: ui/stash.js (ROADMAP R-18, R-19).
