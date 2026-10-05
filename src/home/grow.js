// Interiors grow with the house (docs/HOUSING.md §5): when a house levels up, its room shell gets bigger and the
// furniture already there keeps its place against the same walls. Pure (node-tested in tools/test-rpg.mjs).
//
// migrateInterior(interior, toLayoutId) → { interior (a new object), moved: n, stored: [items that no longer fit] }
// Each step between layouts has an offset for the main room (and one for an alcove that becomes the second room);
// wall items slide along their wall; anything that doesn't fit where it lands tries the cells nearby (canPlace), and
// what still doesn't fit is handed back (the caller puts it in storage). Tabletop items ride on their table.
import { LAYOUTS } from './rooms.js';
import { canPlace } from './placement.js';

// [from, to]: (x, z, item) → [dx, dz]; a wall item on the west wall keeps x = 0 (it slides along the wall)
const STEPS = {
  'home1>home2': () => [0, 4],
  'home2>home3': (x, z) => (z < 4 ? [-1, 2] : [10, -4]),
  'cottage1>cottage2': () => [0, 4],
  'cottage2>cottage3': (x, z) => (z < 4 ? [1, 2] : [10, -4]),
};
const CHAIN = { home1: 'home2', home2: 'home3', cottage1: 'cottage2', cottage2: 'cottage3' };

/** the layouts from a to b (inclusive), following the growth chain; null when b isn't reachable from a */
export function pathOf(a, b) {
  const out = [a]; let c = a;
  while (c !== b) { c = CHAIN[c]; if (!c) return null; out.push(c); }
  return out;
}
function step(items, from, to) {
  const f = STEPS[`${from}>${to}`]; if (!f) return items;
  const hostOf = new Map(items.map(it => [it.k, it]));
  return items.map(it0 => {
    const it = { ...it0 };
    const base = it.mount === 'table' ? hostOf.get(it.on) || it : it; // (a tabletop item moves with its table)
    const [dx, dz] = f(base.x, base.z, base);
    if (it.mount === 'wall' && it.side === 'w') it.z += dz; // (it stays on the outer west wall: the second room's, at L3)
    else { it.x += dx; it.z += dz; }
    return it;
  });
}
/** fit items into a layout in order (tables before what stands on them): each tries its spot, then the cells nearby */
export function fitItems(layoutId, items) {
  const L = LAYOUTS[layoutId], placed = [], left = [];
  const order = [...items.filter(it => it.mount !== 'table'), ...items.filter(it => it.mount === 'table')];
  for (const it of order) {
    if (it.mount === 'table') {
      const host = placed.find(h => h.k === it.on);
      if (!host) { left.push(it); continue; }
      const c = { ...it };
      if (!canPlace(L, placed, c).ok) { c.x = host.x; c.z = host.z; }
      if (canPlace(L, placed, c).ok) placed.push(c); else left.push(it);
      continue;
    }
    const tries = [it];
    if (it.mount === 'wall') for (let d = 1; d <= 10; d++) for (const s of [d, -d]) tries.push(it.side === 'n' ? { ...it, x: it.x + s } : { ...it, z: it.z + s });
    else for (let d = 1; d <= 4; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === d) tries.push({ ...it, x: it.x + dx, z: it.z + dz });
    const ok = tries.find(c => c.x >= 0 && c.z >= 0 && canPlace(L, placed, c).ok);
    if (ok) placed.push(ok); else left.push(it);
  }
  // (a table that didn't fit takes what stood on it along)
  for (const it of [...placed]) if (it.mount === 'table' && !placed.some(h => h.k === it.on)) { placed.splice(placed.indexOf(it), 1); left.push(it); }
  return { placed, left };
}
export function migrateInterior(I, to) {
  if (!I || I.layout === to) return { interior: I, moved: 0, stored: [] };
  const path = pathOf(I.layout, to);
  if (!path) { const { placed, left } = fitItems(to, I.items || []); return { interior: { ...I, layout: to, items: placed }, moved: placed.length, stored: left }; }
  let items = (I.items || []).map(it => ({ ...it }));
  for (let i = 0; i < path.length - 1; i++) items = step(items, path[i], path[i + 1]);
  const { placed, left } = fitItems(to, items);
  return { interior: { ...I, layout: to, items: placed }, moved: placed.length, stored: left };
}
