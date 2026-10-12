// The stash and its tabs (docs/HOUSING.md "The stash", docs/INVENTORY.md; ROADMAP R-18, R-19). Pure: no DOM, no
// three.js (node-tested in tools/test-rpg.mjs).
//
// The shape (one shared stash, opened at the cottage's Treasure Chest or at any Stash Chest built in the village):
//   - state.stash: one flat array of 10 × 6 grids, one per tab. Tab t holds indices [t * 60, t * 60 + 60), stored by
//     anchor (rpg/grid.js). An old save's 60-slot stash is tab 1, every item in the same slot.
//   - state.stashTabs: [{ name, color }], one per tab owned (1 to STASH_MAX_TABS). color: a TAB_COLORS id.
//   - state.lostFound: the Lost & Found (R-20), a 10-wide grid in pages of 10 × 6 that grows as needed: rewards and finds
//     with no room in the bag or the stash wait there (stow). It doesn't count against the six tabs, it only gives back,
//     and it's gone again once it's empty. Absent (or []) when empty.
// The actions (rpg/actions.js) buy, rename and colour tabs; everything else here reads or places.
import { TAB_W, TAB_H, TAB_CELLS, BAG_W, BAG_H, findSpot, placed, packGrid, gridProblems, bagGrid } from './grid.js';

export { TAB_CELLS };
export const STASH_MAX_TABS = 6;
export const TAB_NAME_MAX = 16;
/** the tab colours: a few of the UI's palette (ui/style.css) */
export const TAB_COLORS = { pink: '#ff8fb0', peach: '#ffb07a', gold: '#ffcf4a', leaf: '#8fcf6a', mint: '#8fe0c0', sky: '#8fd0ff', lav: '#c3b3ff', rose: '#e8506e' };
export const TAB_COLOR_IDS = Object.keys(TAB_COLORS);
const DEFAULT_COLOR = ['pink', 'sky', 'mint', 'gold', 'lav', 'peach'];
/** what the next tab costs: TAB_PRICES[n] buys tab n + 1 when you own n (docs/HOUSING.md, the table) */
export const TAB_PRICES = [
  null,
  { coins: 500, wood: 12, stone: 8 },
  { coins: 1500, wood: 25, stone: 15, silk: 3 },
  { coins: 4000, wood: 40, stone: 25, silk: 5, lantern: 2 },
  { coins: 10000, wood: 60, stone: 40, crystal: 4, lantern: 4 },
  { coins: 25000, wood: 90, stone: 60, silk: 6, crystal: 8, lantern: 6 },
];

export const defaultTabName = t => `Tab ${t + 1}`;
export const defaultTab = t => ({ name: defaultTabName(t), color: DEFAULT_COLOR[t % DEFAULT_COLOR.length] });
/** how many tabs this save owns */
export const tabCount = st => Math.max(1, st?.stashTabs?.length || 1);
/** tab t as a grid view (rpg/grid.js) */
export const tabGrid = (st, t) => ({ cells: st.stash, off: t * TAB_CELLS, w: TAB_W, h: TAB_H });
/** the tab an absolute stash index is in */
export const tabOf = i => Math.floor(i / TAB_CELLS);
/** a tab's colour as hex */
export const tabHex = tab => TAB_COLORS[tab?.color] || TAB_COLORS.pink;
/** every item in the stash */
export const stashItems = st => (st?.stash || []).filter(Boolean);
/** the items in tab t */
export const tabItems = (st, t) => placed(tabGrid(st, t)).map(p => p.item);
/** where `item` would go: tab `prefer` first, then the others in order → an absolute index, or -1 when every tab is full */
export function stashSpot(st, item, prefer = 0) {
  const n = tabCount(st), order = [prefer, ...Array.from({ length: n }, (_, t) => t).filter(t => t !== prefer)];
  for (const t of order) { if (t < 0 || t >= n) continue; const i = findSpot(tabGrid(st, t), item); if (i >= 0) return i; }
  return -1;
}
/** put `item` in the stash (tab `prefer` first) → its index, or -1 (nothing changed) */
export function stashPut(st, item, prefer = 0) {
  if (!st || !item) return -1;
  const i = stashSpot(st, item, prefer); if (i >= 0) st.stash[i] = item;
  return i;
}
/** the next tab's price, or null once all STASH_MAX_TABS are open */
export const nextTabPrice = st => (tabCount(st) < STASH_MAX_TABS ? TAB_PRICES[tabCount(st)] : null);

/** a typed tab name, tidied: trimmed, single spaces, at most TAB_NAME_MAX characters ('' gives the default) */
export function cleanTabName(s, t = 0) {
  const n = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  return [...n].slice(0, TAB_NAME_MAX).join('').trim() || defaultTabName(t);
}

// ------------------------------------------------------------------ mutations (through G.actions)
/** open one more tab (the price is the caller's) → its index */
export function addTab(st) {
  migrateStash(st);
  const t = st.stashTabs.length;
  st.stashTabs.push(defaultTab(t));
  for (let k = 0; k < TAB_CELLS; k++) st.stash.push(null);
  return t;
}
export function setTabName(st, t, name) { const tab = st?.stashTabs?.[t]; if (!tab) return false; tab.name = cleanTabName(name, t); return true; }
export function setTabColor(st, t, color) { const tab = st?.stashTabs?.[t]; if (!tab || !TAB_COLORS[color]) return false; tab.color = color; return true; }

// ------------------------------------------------------------------ the save migration
/** Saves from before the stash tabs (one flat 60-slot `state.stash`, no `state.stashTabs`) become tab 1, every item in
 *  the same slot. Also tidies any save: one tab at least; enough tabs to hold every item already stored (never drops
 *  one); a full 60 cells per tab (trailing empties trimmed, holes and non-items cleared); tab names and colours made
 *  valid. Idempotent: a second run changes nothing. Called by normalizeHeroes (rpg/actions.js) on every load. */
export function migrateStash(st) {
  if (!st) return st;
  const a = Array.isArray(st.stash) ? st.stash : [];
  for (let i = 0; i < a.length; i++) if (!a[i] || typeof a[i] !== 'object') a[i] = null;
  let last = -1; for (let i = a.length - 1; i >= 0; i--) if (a[i]) { last = i; break; }
  const tabs = (Array.isArray(st.stashTabs) ? st.stashTabs : []).filter(t => t && typeof t === 'object');
  const n = Math.max(1, tabs.length, Math.ceil((last + 1) / TAB_CELLS)); // (more than STASH_MAX_TABS only for an item-stuffed test save: kept, never cut)
  while (tabs.length < n) tabs.push(defaultTab(tabs.length));
  tabs.forEach((t, k) => { t.name = cleanTabName(t.name, k); if (!TAB_COLORS[t.color]) t.color = defaultTab(k).color; });
  while (a.length < n * TAB_CELLS) a.push(null);
  a.length = n * TAB_CELLS;
  st.stash = a; st.stashTabs = tabs;
  return st;
}

// ------------------------------------------------------------------ Lost & Found (R-20): an item is never lost
export const LOST_PAGE = TAB_CELLS;
/** Lost & Found as a grid view (10 wide, as many rows as its pages) */
export const lostGrid = st => { const a = st.lostFound || []; return { cells: a, off: 0, w: TAB_W, h: Math.floor(a.length / TAB_W) }; };
export const lostItems = st => (st?.lostFound || []).filter(Boolean);
/** put `item` in Lost & Found (a new page when it's full) → its index */
export function lostPut(st, item) {
  if (!Array.isArray(st.lostFound)) st.lostFound = [];
  let i = st.lostFound.length ? findSpot(lostGrid(st), item) : -1;
  if (i < 0) { const at = st.lostFound.length; for (let k = 0; k < LOST_PAGE; k++) st.lostFound.push(null); i = findSpot({ cells: st.lostFound, off: at, w: TAB_W, h: TAB_H }, item); }
  st.lostFound[i] = item;
  return i;
}
/** Lost & Found empty → gone; empty pages at its end trimmed */
export function lostTidy(st) {
  const a = st?.lostFound; if (!Array.isArray(a)) return;
  let last = -1; for (let i = a.length - 1; i >= 0; i--) if (a[i]) { last = i; break; }
  if (last < 0) { delete st.lostFound; return; }
  a.length = Math.max(LOST_PAGE, Math.ceil((last + 1) / LOST_PAGE) * LOST_PAGE);
}
/** somewhere for an item that must not be lost (a reward, a find, a swapped-out item): the bag, then the stash (tab
 *  `prefer` first), then Lost & Found → { c: 'inv' | 'stash' | 'lost', i } */
export function stow(st, item, { bag = true, prefer = 0 } = {}) {
  if (bag) { const i = findSpot(bagGrid(st), item); if (i >= 0) { st.inventory[i] = item; return { c: 'inv', i }; } }
  const j = stashPut(st, item, prefer); if (j >= 0) return { c: 'stash', i: j };
  return { c: 'lost', i: lostPut(st, item) };
}

// ------------------------------------------------------------------ the save migration for footprints (R-20)
/** Items take up space now (rpg/grid.js itemSize). Saves from before (state.gridV < 1): every stash tab and the bag
 *  are packed in Sort's order (grid.js packOrder); what doesn't fit in its own tab or the bag goes to the stash's first
 *  tab with room, then Lost & Found. Later, any grid whose footprints overlap or hang off it (it shouldn't happen) is
 *  repacked the same way. Never drops an item; idempotent (a packed save is left alone). Called by normalizeHeroes after
 *  migrateStash. → { moved: n, lost: n } */
export function packSave(st) {
  if (!st || !Array.isArray(st.inventory)) return { moved: 0, lost: 0 };
  const first = (st.gridV | 0) < 1, over = [];
  let moved = 0;
  const repack = (cells, off, w, h) => {
    const g = { cells, off, w, h };
    if (!first && !gridProblems(g).length) return;
    const items = placed(g).map(p => p.item), r = packGrid(items, w, h);
    for (let k = 0; k < w * h; k++) cells[off + k] = r.cells[k];
    over.push(...r.left); moved += items.length;
  };
  migrateStash(st);
  for (let t = 0; t < tabCount(st); t++) repack(st.stash, t * TAB_CELLS, TAB_W, TAB_H);
  while (st.inventory.length < BAG_W * BAG_H) st.inventory.push(null);
  for (let i = 0; i < st.inventory.length; i++) if (!st.inventory[i] || typeof st.inventory[i] !== 'object') st.inventory[i] = null;
  repack(st.inventory, 0, BAG_W, BAG_H);
  if (Array.isArray(st.lostFound) && st.lostFound.length) { const L = lostGrid(st); if (gridProblems(L).length) { const items = lostItems(st); st.lostFound = []; over.push(...items); } }
  let lost = 0;
  for (const it of over) { const r = stow(st, it, { bag: false }); if (r.c === 'lost') lost++; }
  lostTidy(st);
  st.gridV = 1;
  return { moved, lost, over: over.length };
}
