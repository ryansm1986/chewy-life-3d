// Item footprints and the grid containers (docs/INVENTORY.md; ROADMAP R-20). Pure: no DOM, no three.js (node-tested in
// tools/test-rpg.mjs).
//
// The bag and every stash tab are grids of placed items. Each is stored by anchor in a flat array: cells[off + y * w + x]
// holds the item whose top-left cell is (x, y), and the other cells its footprint covers stay null. So the save keeps its
// old shape (state.inventory: one 10 × 4 grid; state.stash: one 10 × 6 grid per tab, tab t from index t * 60), and
// placed(g) gives the { item, i, x, y, w, h } list of what sits where.
//
// A grid view: { cells, off, w, h } (bagGrid, and tabGrid in rpg/stash.js).
//
// Footprints: itemSize(item) → [w, h] in cells (WEAPON_SIZE, SLOT_SIZE). Every helper answers for them: cover, fitsAt,
// findSpot, placed, and the packer (packOrder / packGrid) that Sort and the save migration use.

export const BAG_W = 10, BAG_H = 4;
export const TAB_W = 10, TAB_H = 6, TAB_CELLS = TAB_W * TAB_H;
/** the footprints are on (R-20; docs/INVENTORY.md §3 has the table) */
export const SIZES_ON = true;

const ONE = Object.freeze([1, 1]);
/** the footprints by weapon type and gear slot, [w, h] in cells (nothing over 4 cells; docs/INVENTORY.md §3) */
export const WEAPON_SIZE = { sword: [1, 2], ball: [1, 1], staff: [1, 3], fuma: [2, 2], flail: [1, 2], lance: [1, 3] };
export const SLOT_SIZE = { hat: [2, 1], outfit: [2, 2], boots: [2, 1], paws: [2, 1], collar: [1, 1], charm: [1, 1] };
/** an item's footprint, [w, h] in cells: gear by its weapon type or slot; treats (gems), keys, gifts and the rest 1 × 1 */
export function itemSize(it) {
  if (!SIZES_ON || !it || it.kind !== 'gear') return ONE;
  return (it.slot === 'weapon' ? WEAPON_SIZE[it.wtype] : SLOT_SIZE[it.slot]) || ONE;
}
/** the footprint's area in cells */
export const itemArea = it => { const [w, h] = itemSize(it); return w * h; };

/** the bag as a grid view */
export const bagGrid = st => ({ cells: st.inventory, off: 0, w: BAG_W, h: BAG_H });

/** which anchor covers each cell of the grid: an Int32Array(w * h) of absolute indices (-1 = free). `ignore` (an absolute
 *  index) leaves that item out, for moving it within its own grid. */
export function cover(g, ignore = -1) {
  const { cells, off, w, h } = g, out = new Int32Array(w * h).fill(-1);
  for (let k = 0; k < w * h; k++) {
    const i = off + k, it = cells[i]; if (!it || i === ignore) continue;
    const [iw, ih] = itemSize(it), x0 = k % w, y0 = (k / w) | 0;
    for (let y = y0; y < Math.min(h, y0 + ih); y++) for (let x = x0; x < Math.min(w, x0 + iw); x++) if (out[y * w + x] < 0) out[y * w + x] = i;
  }
  return out;
}

/** can `item` go with its top-left at (x, y)? → { ok, under: [the absolute indices of the items it would cover] }.
 *  ok is false off the grid; `under` says what's in the way (one item: a swap, as in Diablo; two or more: refused). */
export function fitsAt(g, item, x, y, ignore = -1, cov = null) {
  const [iw, ih] = itemSize(item);
  if (x < 0 || y < 0 || x + iw > g.w || y + ih > g.h) return { ok: false, out: true, under: [] };
  const c = cov || cover(g, ignore), under = [];
  for (let yy = y; yy < y + ih; yy++) for (let xx = x; xx < x + iw; xx++) { const a = c[yy * g.w + xx]; if (a >= 0 && !under.includes(a)) under.push(a); }
  return { ok: !under.length, out: false, under };
}

/** the first spot where `item` fits, top-left first (row by row) → an absolute index, or -1 */
export function findSpot(g, item, ignore = -1) {
  const c = cover(g, ignore), [iw, ih] = itemSize(item);
  for (let y = 0; y + ih <= g.h; y++) for (let x = 0; x + iw <= g.w; x++) if (fitsAt(g, item, x, y, ignore, c).ok) return g.off + y * g.w + x;
  return -1;
}

/** what sits where: [{ item, i, x, y, w, h }] (i: the absolute index of its anchor) */
export function placed(g) {
  const out = [];
  for (let k = 0; k < g.w * g.h; k++) { const it = g.cells[g.off + k]; if (!it) continue; const [w, h] = itemSize(it); out.push({ item: it, i: g.off + k, x: k % g.w, y: (k / g.w) | 0, w, h }); }
  return out;
}

/** the items in a grid */
export const gridItems = g => placed(g).map(p => p.item);
/** free cells (not covered by any footprint) */
export function freeCells(g) { let n = 0; for (const a of cover(g)) if (a < 0) n++; return n; }
/** footprints that overlap or hang off the grid: [absolute indices] (a healthy grid has none) */
export function gridProblems(g) {
  const bad = [], seen = new Int32Array(g.w * g.h).fill(-1);
  for (const p of placed(g)) {
    if (p.x + p.w > g.w || p.y + p.h > g.h) { bad.push(p.i); continue; }
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) { const k = y * g.w + x; if (seen[k] >= 0 && !bad.includes(p.i)) bad.push(p.i); seen[k] = p.i; }
  }
  return bad;
}

// ------------------------------------------------------------------ sorting and packing (R-21; the migration, R-20)
/** the type groups, in Sort's order: weapons, outfits, hats, paws and boots, collars and charms, treats, the rest */
export const SORT_GROUPS = ['weapon', 'outfit', 'hat', 'feet', 'jewel', 'treat', 'other'];
export function sortGroup(it) {
  if (!it) return 'other';
  if (it.kind === 'gem') return 'treat';
  if (it.kind !== 'gear') return 'other';
  if (it.slot === 'weapon') return 'weapon';
  if (it.slot === 'outfit') return 'outfit';
  if (it.slot === 'hat') return 'hat';
  if (it.slot === 'paws' || it.slot === 'boots') return 'feet';
  if (it.slot === 'collar' || it.slot === 'charm') return 'jewel';
  return 'other';
}
const RARITY_RANK = { set: 0, unique: 1, rare: 2, magic: 3, normal: 4 };
/** Sort's order: the type group, the biggest footprint first within it (so the packing is tidy), the rarest first, the
 *  highest item level, then a fixed tie-break (base, name, uid): the same items always come out in the same order */
export function packOrder(items) {
  const k = it => [SORT_GROUPS.indexOf(sortGroup(it)), -itemArea(it), RARITY_RANK[it.rarity] ?? 5, -(it.ilvl || 0), it.slot === 'weapon' ? it.wtype || '' : it.slot || '', it.base || '', it.name || '', it.uid || ''];
  return items.slice().sort((a, b) => { const A = k(a), B = k(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1; return 0; });
}
/** the first spot where `item` fits at or after cell `from` (reading order), else the first before it → an absolute
 *  index, or -1 */
export function findSpotFrom(g, item, from = 0, ignore = -1) {
  const c = cover(g, ignore), [iw, ih] = itemSize(item), n = g.w * g.h;
  for (let pass = 0; pass < 2; pass++) for (let k = pass ? 0 : from; k < (pass ? from : n); k++) {
    const x = k % g.w, y = (k / g.w) | 0; if (x + iw > g.w || y + ih > g.h) continue;
    if (fitsAt(g, item, x, y, ignore, c).ok) return g.off + k;
  }
  return -1;
}
/** Pack `items` into an empty w × h grid in Sort's order: each goes to the first spot that fits after the one before it
 *  (so the groups read in order, left to right and down), else into a gap before it → { cells: Array(w * h) (anchors),
 *  left: [the items that didn't fit] } */
export function packGrid(items, w, h) {
  const g = { cells: Array(w * h).fill(null), off: 0, w, h }, left = [];
  let from = 0;
  for (const it of packOrder(items)) { const i = findSpotFrom(g, it, from); if (i >= 0) { g.cells[i] = it; from = i; } else left.push(it); }
  return { cells: g.cells, left };
}
