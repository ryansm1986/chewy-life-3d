// Zone progression (docs/ZONES.md §1, §8.2 as built; ROADMAP Z-C4). Pure (no three.js): node-tested in tools/test-rpg.mjs.
//  - The order is unchanged: Bamboo → Maple → Tidepool → Onsen (the biome recipes' unlock.after chain).
//  - A zone opens at its hero level (as before), or when the previous zone's DUNGEON has been cleared once
//    (zones[prev].dungeon.cleared > 0, or by a crew: dungeon.crew > 0, docs/COZY.md §3.2). Saves that beat a region boss outdoors before the bosses moved into the dungeons
//    (zones[prev].regionBoss > 0) keep the next zone open.
//  - The first clear of a zone dungeon gives the zone's boss unique (ZONE_UNIQUE, rpg/items.js UNIQUES with `zone`:
//    never rolled at random) and a guaranteed rare (dungeon/zoneRun.js), and opens the next zone (zoneUnlockOnClear).
import { zoneOf } from './zones.js';

export const ZONE_ORDER = ['bamboo', 'maple', 'tidepool', 'onsen'];
/** the zone after `id` in the order, or null */
export const nextZone = id => ZONE_ORDER[ZONE_ORDER.indexOf(id) + 1] || null;
export const prevZone = id => { const i = ZONE_ORDER.indexOf(id); return i > 0 ? ZONE_ORDER[i - 1] : null; };
/** each zone dungeon's boss unique (dropped by the first-clear chest) */
export const ZONE_UNIQUE = { bamboo: 'tenguGaleFeather', maple: 'danzaburoLeaf', tidepool: 'umibozuPearl', onsen: 'yukiOnnaCord' };
/** has zone `id` been opened by its predecessor (its dungeon cleared by you or a crew, or a migrated save's beaten
 *  region boss)? */
export function openedByPrev(state, id) {
  const p = prevZone(id); if (!p) return false;
  const z = zoneOf(state, p);
  return z.dungeon.cleared > 0 || z.dungeon.crew > 0 || z.regionBoss > 0;
}
/** the zone dungeon's first clear opens the next zone → its id if it was newly opened, else null */
export function zoneUnlockOnClear(state, id) {
  const n = nextZone(id); if (!n) return null;
  const z = zoneOf(state, n); if (z.unlocked) return null;
  z.unlocked = true;
  return n;
}
