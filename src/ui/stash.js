// The stash panel (docs/HOUSING.md "The stash", docs/INVENTORY.md; ROADMAP R-18 to R-21): the shared stash, opened at the
// cottage's Treasure Chest or at any Stash Chest built in the village, with the bag beside it. Tabs of 10 × 6 along the top:
//   - a click or a tap opens a tab; the open tab again (its pencil) renames it and picks its colour (a popover);
//   - the "+" tab buys the next one (a popover with the price, what you'd get, greyed when you're short);
//   - an item dropped on a tab header goes into that tab (the first spot with room), and the bag's quick move
//     (Ctrl+Click, the pad's X) fills the open tab first, then the first tab with room (ui/inventory.js ItemDrag);
//   - Lost & Found: a tab of its own after the bought ones, while it holds anything (rewards and finds that found no room);
//     it only gives back, and it goes once it's empty;
//   - the filter chips under the drawer fade every item that doesn't match (it keeps its place); each header counts its
//     matches; Sort packs the open tab (rpg/grid.js packOrder);
//   - the pad: LT / RT (and LB / RB) step the tabs (ui/padNav.js), the D-pad reaches the headers, A opens one (or drops
//     the held item in it), Y renames it, R3 sorts.
// The state is rpg/stash.js's: state.stash (one 10 × 6 grid per tab), state.stashTabs ({ name, color }), state.lostFound.
import { esc, fmt, replay, setText } from './dom.js';
import { glyph } from './glyphs.js';
import { padGlyph, padWording } from './padGlyphs.js';
import { Panel } from './panel.js';
import { makeSlot, layoutGrid } from './inventory.js';
import { Actions } from '../core/actions.js';
import { TAB_CELLS, STASH_MAX_TABS, TAB_COLORS, TAB_COLOR_IDS, TAB_NAME_MAX, tabCount, tabItems, tabHex, nextTabPrice, stashItems, defaultTabName, tabGrid, lostGrid, lostItems } from '../rpg/stash.js';
import { sortGroup } from '../rpg/grid.js';
import { registerDebug } from '../debug/registry.js';
import './stash.css';

const PENCIL = '<svg class="st-pen" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 25l1.6-6.2L20.8 6.6a2.6 2.6 0 0 1 3.7 0l.9.9a2.6 2.6 0 0 1 0 3.7L13.2 23.4z" fill="#fff6e8" stroke="#4a2c2a" stroke-width="2.6" stroke-linejoin="round"/><path d="M18.6 8.8l4.6 4.6" stroke="#4a2c2a" stroke-width="2.4"/><path d="M7 25l1.6-6.2 4.6 4.6z" fill="#ffcf4a" stroke="#4a2c2a" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const MAT_NAME = { coins: 'coins', wood: 'wood', stone: 'stone', petal: 'petals', crystal: 'crystals', bone: 'bones', mochi: 'mochi', silk: 'silk', lantern: 'lanterns' };
const MAT_GLYPH = { coins: 'coin' };
const COLOR_NAME = { pink: 'Sakura pink', peach: 'Peach', gold: 'Honey gold', leaf: 'Leaf green', mint: 'Mint', sky: 'Sky blue', lav: 'Lavender', rose: 'Rose' };
const LOST = -1, LOST_HEX = '#e8a64a';
/** the filter chips (R-21): what each shows (rpg/grid.js sortGroup) */
export const STASH_FILTERS = [
  { id: 'all', name: 'All', g: 'sparkle', test: () => true },
  { id: 'weapon', name: 'Weapons', g: 'swords', test: it => sortGroup(it) === 'weapon' },
  { id: 'armour', name: 'Armour', g: 'outfit', test: it => ['outfit', 'hat', 'feet'].includes(sortGroup(it)) },
  { id: 'jewel', name: 'Jewellery', g: 'collar', test: it => sortGroup(it) === 'jewel' },
  { id: 'treat', name: 'Treats', g: 'treat', test: it => sortGroup(it) === 'treat' },
  { id: 'other', name: 'Other', g: 'gift', test: it => sortGroup(it) === 'other' },
];
const FILTER_KEY = 'chewy3d.stashFilter';
function hintTo(e, t) { if (!e) return; const h = padWording(esc(t)); if (e._h !== h) { e._h = h; e.innerHTML = h; } }

export class StashPanel extends Panel {
  constructor(ui) {
    super(ui, { name: 'stash', title: 'Stash', jp: '倉庫', side: 'left', cls: 'p-stash', icon: 'chest' }); this.tab = 0;
    this.filter = 'all'; try { const f = localStorage.getItem(FILTER_KEY); if (STASH_FILTERS.some(x => x.id === f)) this.filter = f; } catch (e) { /* private mode */ }
  }
  init() {
    const b = this.body;
    b.innerHTML = `<div class="st-strip"><span class="kc pad st-glyph pad-only">${padGlyph('LT')}</span><div class="st-tabs" role="tablist"></div><span class="kc pad st-glyph pad-only">${padGlyph('RT')}</span></div>
      <div class="grid g10 stash-grid" data-g="stash"></div>
      <div class="st-tools"><div class="st-chips" role="group" aria-label="Show">${STASH_FILTERS.map(f => `<button class="st-chip" data-f="${f.id}" title="Show ${f.name.toLowerCase()}">${glyph(f.g)}<span>${f.name}</span></button>`).join('')}</div><button class="btn sm st-sort" title="Sort this tab">${glyph('sort')}Sort<span class="kc sm pad pad-only">${padGlyph('R3')}</span></button></div>
      <div class="inv-foot st-foot"><div class="st-cap"><b>0</b><span>/ 60</span></div><div class="inv-hint"></div></div>`;
    this.strip = b.querySelector('.st-tabs');
    this.grid = b.querySelector('.stash-grid');
    this.cells = [];
    this.ensureCells(TAB_CELLS);
    this.capEl = b.querySelector('.st-cap b'); this.capOf = b.querySelector('.st-cap span');
    this.strip.addEventListener('click', e => {
      const t = e.target.closest('.st-tab'); if (!t) return;
      if (t.dataset.buy) { this.openBuy(t); return; }
      const k = t.dataset.t === 'lost' ? LOST : +t.dataset.t, D = this.ui.drag;
      if (D?.held) { D.toTab(D.held, k); return; } // (an item in hand goes into that tab)
      if (k === this.tab) { if (k !== LOST) this.openEdit(k, t); } else { this.setTab(k); this.ui.sfx?.('tab'); }
    });
    b.querySelector('.st-chips').addEventListener('click', e => { const c = e.target.closest('.st-chip'); if (c) this.setFilter(c.dataset.f); });
    b.querySelector('.st-sort').addEventListener('click', () => this.sort());
  }
  /** one slot element per cell of the open view (a tab: 60; Lost & Found: its pages) */
  ensureCells(n) {
    while (this.cells.length < n) { const k = this.cells.length, s = makeSlot('stash', k); s.style.setProperty('--i', k % TAB_CELLS); this.grid.appendChild(s); this.cells.push(s); }
    while (this.cells.length > n) this.cells.pop().remove();
  }
  hasLost() { return lostItems(this.st).length > 0; }
  onOpen() { if (this.tab >= tabCount(this.st) || (this.tab === LOST && !this.hasLost())) this.tab = 0; this._sig = null; this.render(); }
  onClose() { this.ui.hidePopover?.(); }
  /** the open tab → t (LOST: Lost & Found); the cells re-point at its grid */
  setTab(t, { quiet = false } = {}) {
    const n = tabCount(this.st);
    t = t === LOST && this.hasLost() ? LOST : Math.max(0, Math.min(n - 1, t | 0));
    if (t === this.tab && !quiet) return;
    this.tab = t; this.ui.tip.hide(); this.ui.hidePopover?.();
    for (const s of this.cells) s._sig = undefined;
    this._sig = null; this.render();
    if (!quiet) replay(this.grid, 'st-swap', 380);
  }
  /** the tabs in strip order: the bought ones, then Lost & Found while it holds anything */
  order() { const o = Array.from({ length: tabCount(this.st) }, (_, t) => t); if (this.hasLost()) o.push(LOST); return o; }
  /** LT / RT on the pad: the next or the previous tab (wrapping) */
  step(d) { const o = this.order(); if (o.length < 2) { this.ui.sfx?.('deny'); return false; } const i = Math.max(0, o.indexOf(this.tab)); this.setTab(o[(i + d + o.length) % o.length]); this.ui.sfx?.('tab'); return true; }
  /** the open view: a tab's grid, or Lost & Found's */
  view() { return this.tab === LOST ? lostGrid(this.st) : tabGrid(this.st, this.tab); }
  /** is this item faded by the filter? (no hover, no pick-up, nothing dropped onto it) */
  dimmed(it) { if (!it || !this.isOpen || this.filter === 'all') return false; const f = STASH_FILTERS.find(x => x.id === this.filter); return !!f && !f.test(it); }
  setFilter(id) {
    if (!STASH_FILTERS.some(x => x.id === id) || id === this.filter) return;
    this.filter = id; try { localStorage.setItem(FILTER_KEY, id); } catch (e) { /* private mode */ }
    this.ui.sfx?.('tab'); this._sig = null; this.render();
  }
  /** Sort the open tab (rpg/grid.js packOrder); Lost & Found isn't sorted */
  sort() {
    if (this.tab === LOST) { this.ui.sfx?.('deny'); return false; }
    const ok = this.G.actions?.sortContainer?.('stash', this.tab);
    if (!ok) { this.ui.sfx?.('deny'); return false; }
    for (const s of this.cells) { s._sig = undefined; s._popNext = false; }
    this.ui.sfx?.('sort'); this.ui.refreshItems(); replay(this.grid, 'g-sorted', 520);
    return true;
  }
  render() {
    const st = this.st; if (!st.stash) return;
    if (this.tab !== LOST && this.tab >= tabCount(st)) this.setTab(0, { quiet: true });
    if (this.tab === LOST && !this.hasLost()) { this.tab = 0; for (const s of this.cells) s._sig = undefined; }
    const v = this.view(), lost = this.tab === LOST;
    this.ensureCells(v.w * v.h);
    this.grid.dataset.g = lost ? 'lost' : 'stash';
    for (const s of this.cells) if (s.dataset.c !== this.grid.dataset.g) { s.dataset.c = this.grid.dataset.g; s._sig = undefined; }
    layoutGrid(this.cells, v, this.ui, { dim: it => this.dimmed(it) });
    this.renderTabs();
    const items = lost ? lostItems(st) : tabItems(st, this.tab);
    setText(this.capEl, String(items.length)); setText(this.capOf, lost ? 'waiting' : '/ 60');
    this.panel.style.setProperty('--stc', lost ? LOST_HEX : tabHex(st.stashTabs?.[this.tab]));
    this.panel.classList.toggle('st-lostv', lost);
    for (const c of this.body.querySelectorAll('.st-chip')) c.classList.toggle('on', c.dataset.f === this.filter);
    this.body.querySelector('.st-sort').disabled = lost;
    hintTo(this.body.querySelector('.inv-hint'), lost ? 'Rewards and finds that found no room wait here · take them out when you can' : 'Ctrl+Click moves items to and from the Bag · drop one on a tab to file it there'); // (the pad's and touch's words: padWording)
  }
  /** how many items in tab t (LOST: Lost & Found) the filter shows */
  matches(t) { const items = t === LOST ? lostItems(this.st) : tabItems(this.st, t); return this.filter === 'all' ? items.length : items.filter(it => !this.dimmed(it)).length; }
  renderTabs() {
    const st = this.st, tabs = st.stashTabs || [], n = tabCount(st), price = nextTabPrice(st), afford = price && this.G.actions?.hasMaterials?.(price);
    const counts = tabs.map((_, t) => this.matches(t)), lostN = this.hasLost() ? this.matches(LOST) : -1;
    const sig = `${this.tab}|${n}|${tabs.map(t => t.name + ':' + t.color).join(',')}|${counts.join(',')}|${lostN}|${this.filter}|${price ? price.coins : '-'}|${afford}`;
    if (sig === this._sig) return; this._sig = sig;
    const f = this.filter !== 'all' ? STASH_FILTERS.find(x => x.id === this.filter)?.name.toLowerCase() : '';
    let h = '';
    for (let t = 0; t < n; t++) {
      const tab = tabs[t] || {}, on = t === this.tab, nm = tab.name || defaultTabName(t);
      h += `<button class="st-tab${on ? ' on' : ''}${f ? ' filt' : ''}" data-t="${t}" role="tab" aria-selected="${on}" style="--tc:${tabHex(tab)}" title="${esc(nm)}${f ? ` · ${counts[t]} ${f}` : ''}${on ? ' · rename and recolour' : ''}"><i class="st-dot"></i><span class="st-nm">${esc(nm)}</span><b class="st-n${counts[t] ? '' : ' zero'}">${counts[t]}</b>${on ? PENCIL : ''}</button>`;
    }
    if (lostN >= 0) h += `<button class="st-tab st-lost${this.tab === LOST ? ' on' : ''}" data-t="lost" role="tab" aria-selected="${this.tab === LOST}" style="--tc:${LOST_HEX}" title="Lost &amp; Found: rewards and finds that found no room"><span class="st-lg">${glyph('chest')}</span><span class="st-nm">Lost &amp; Found</span><b class="st-n${lostN ? '' : ' zero'}">${lostN}</b></button>`;
    if (price) h += `<button class="st-tab st-buy${afford ? '' : ' poor'}" data-buy="1" title="A new tab: 60 more slots">${glyph('plus')}<span class="st-pr">${glyph('coin')}${fmt(price.coins)}</span></button>`;
    this.strip.innerHTML = h;
  }
  /** a tab header's element (the drop target, the pop on a purchase) */
  tabEl(t) { return this.strip.querySelector(`.st-tab[data-t="${t === LOST ? 'lost' : t}"]`); }
  /** a tab took an item (a drop on its header, the quick move): its count chip pops */
  bumpTab(t) { this._sig = null; this.renderTabs(); const e = this.tabEl(t); if (e) replay(e, 'st-got', 520); }

  // ---------------------------------------------------------------- the "+" tab: buy the next one
  openBuy(anchor) {
    const st = this.st, price = nextTabPrice(st), A = this.G.actions; if (!price) return;
    const n = tabCount(st), mats = st.materials || {};
    const have = k => (k === 'coins' ? st.coins || 0 : mats[k] || 0);
    const short = Object.entries(price).filter(([k, v]) => have(k) < v);
    const chips = Object.entries(price).map(([k, v]) => `<span class="sb-c${have(k) < v ? ' short' : ''}" title="You have ${fmt(have(k))}">${glyph(MAT_GLYPH[k] || k)}<b>${fmt(v)}</b>${have(k) < v ? `<i>· you have ${fmt(have(k))}</i>` : ''}</span>`).join('');
    const mini = `<span class="sb-mini" style="--tc:${TAB_COLORS[['pink', 'sky', 'mint', 'gold', 'lav', 'peach'][n % 6]]}">${'<i></i>'.repeat(10)}</span>`;
    const why = short.length ? `You need ${short.map(([k, v]) => `${fmt(v - have(k))} more ${MAT_NAME[k] || k}`).join(', ')}` : '';
    this.ui.popover(anchor, `<div class="st-pop sb-pop"><div class="pop-h">${glyph('chest')}A new stash tab</div>
      <div class="sb-what">${mini}<div><b>Tab ${n + 1}</b> of ${STASH_MAX_TABS}<br>60 more slots, named and coloured your way</div></div>
      <div class="sb-cost">${chips}</div>${why ? `<div class="sb-why">${why}</div>` : ''}
      <div class="sb-btns"><button class="btn sm sb-go${short.length ? '' : ' gold'}"${short.length ? ' disabled' : ''}>${glyph('coin')}Buy it</button><button class="btn sm sb-no">Not now</button></div></div>`, e => {
      if (e.target.closest('.sb-no')) return true;
      if (!e.target.closest('.sb-go')) return false;
      const t = A?.buyStashTab?.();
      if (t) { this.ui.sfx?.('buy'); this.G.events?.emit?.('sfx', 'confetti_pop', { vol: 0.5 }); this.setTab(t); this.celebrate(t); }
      else this.ui.sfx?.('deny');
      return true;
    }, 'down');
    this.clampPop();
  }
  celebrate(t) {
    requestAnimationFrame(() => {
      const e = this.tabEl(t); if (!e) return; replay(e, 'st-new', 900);
      const r = e.getBoundingClientRect(); this.ui.burst?.(r.left + r.width / 2, r.top + r.height / 2, { n: 16, colors: [tabHex(this.st.stashTabs?.[t]), '#fff3b8', '#ffcf4a'], kind: 'star', spread: 70 });
    });
  }
  // ---------------------------------------------------------------- rename and recolour the open tab
  openEdit(t, anchor) {
    const st = this.st, tab = st.stashTabs?.[t], A = this.G.actions; if (!tab) return;
    this.ui.popover(anchor, `<div class="st-pop se-pop"><div class="pop-h">${PENCIL}Tab ${t + 1}</div>
      <input class="se-name" type="text" maxlength="${TAB_NAME_MAX}" value="${esc(tab.name)}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-label="The tab's name" data-focus>
      <div class="se-cols">${TAB_COLOR_IDS.map(c => `<button class="se-col${c === tab.color ? ' on' : ''}" data-col="${c}" style="--c:${TAB_COLORS[c]}" title="${COLOR_NAME[c]}" aria-label="${COLOR_NAME[c]}"></button>`).join('')}</div>
      <div class="sb-btns"><button class="btn sm pink se-ok">${glyph('check')}Done</button></div></div>`, e => {
      const c = e.target.closest('.se-col');
      if (c) { A?.colorStashTab?.(t, c.dataset.col); for (const b of this.ui.pop.querySelectorAll('.se-col')) b.classList.toggle('on', b === c); this.ui.sfx?.('select'); this.render(); return false; }
      if (e.target.closest('.se-ok')) { this.commitName(t); return true; }
      return false;
    }, 'down');
    const inp = this.ui.pop.querySelector('.se-name');
    if (inp) {
      inp.addEventListener('click', () => inp.focus()); // (the pad's A "clicks" it: the field takes the keys; on the Deck, Steam + X brings up its keyboard)
      inp.addEventListener('input', () => { A?.renameStashTab?.(t, inp.value); this._sig = null; this.renderTabs(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.commitName(t); this.ui.hidePopover(); } });
      if (Actions.device === 'mouse') requestAnimationFrame(() => { try { inp.focus({ preventScroll: true }); inp.select(); } catch (x) { /* */ } });
    }
    this.clampPop();
  }
  commitName(t) {
    const inp = this.ui.pop.querySelector('.se-name'); if (!inp) return;
    this.G.actions?.renameStashTab?.(t, inp.value); inp.blur(); this._sig = null; this.render();
  }
  /** keep the popover on the screen (its arrow still points at the tab) */
  clampPop() {
    const p = this.ui.pop, box = p?.firstElementChild; if (!box) return;
    box.style.removeProperty('--st-adx'); p.style.removeProperty('margin-left');
    box.style.animation = 'none'; // (measured at its full size, not mid pop-in)
    const r = box.getBoundingClientRect(), M = 8;
    box.style.animation = '';
    const dx = r.left < M ? M - r.left : r.right > innerWidth - M ? innerWidth - M - r.right : 0;
    if (!dx) return;
    p.style.marginLeft = dx + 'px';
    const z = box.currentCSSZoom || parseFloat(getComputedStyle(box).zoom) || 1;
    box.style.setProperty('--st-adx', (-dx / z).toFixed(1) + 'px');
  }
}

// ---------------------------------------------------------------- the debug menu (docs/DEBUG.md)
registerDebug('village', [
  { label: 'Unlock all stash tabs', group: 'The stash', run: G => { const A = G.actions, st = G.state; let n = 0; while (nextTabPrice(st)) { A.addCoins(nextTabPrice(st).coins); for (const [k, v] of Object.entries(nextTabPrice(st))) if (k !== 'coins') A.addMaterial(k, v); if (!A.buyStashTab()) break; n++; } G.ui?.refreshItems?.(); return n ? `${n} stash tab${n > 1 ? 's' : ''} opened (${tabCount(st)} of ${STASH_MAX_TABS})` : 'Every stash tab is already open'; } },
  { label: 'Place a stash by me', run: G => { const r = G.stashDebug?.placeNear?.(); return r ? `A Stash Chest at ${r.x}, ${r.z}` : 'No room for a Stash Chest here (try the village, on open ground)'; } },
  { label: 'Fill the stash', choices: [10, 60, 200], run: async (G, n) => { const I = await import('../rpg/items.js'); const A = G.actions; let k = 0; for (let i = 0; i < n; i++) { if (A.stashPut(I.generateItem({ ilvl: G.state.player.lvl + 2 })) < 0) break; k++; } G.ui?.refreshItems?.(); return `${k} items in the stash (${stashItems(G.state).length} in all)`; } },
], { title: 'Village', icon: 'home' });

