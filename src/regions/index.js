// Region registry: the four outdoor biomes, their order and unlock rules (docs/REGIONS.md §1).
import bamboo from './biomes/bamboo.js';
import maple from './biomes/maple.js';
import tidepool from './biomes/tidepool.js';
import onsen from './biomes/onsen.js';
import { normalizeZones } from '../rpg/zones.js';
import { openedByPrev } from '../rpg/zoneProgress.js';
import { DUNGEONS, ZONE_DUNGEON } from '../dungeon/defs.js';

export const REGIONS = { bamboo, maple, tidepool, onsen };
export const REGION_IDS = ['bamboo', 'maple', 'tidepool', 'onsen'];

/** state.regions = { unlocked, cleared, visits }: since the zones rework a live view of state.zones (rpg/zones.js:
 *  unlocked → zones[id].unlocked, cleared → zones[id].regionBoss, visits → zones[id].visits), migrated from older saves */
export function regionState(state) {
  normalizeZones(state);
  return state.regions;
}
/** Is region `id` open for the active hero? (its level, or the previous zone's dungeon cleared once — or, for a save from
 *  before the bosses moved into the dungeons, the previous region's boss beaten outdoors: rpg/zoneProgress.js) → { ok, why } */
export function regionUnlocked(state, id) {
  const def = REGIONS[id]; if (!def) return { ok: false, why: 'Unknown region' };
  const R = regionState(state), u = def.unlock || {};
  if (R.unlocked[id]) return { ok: true, why: '' };
  let top = state.player?.lvl || 1;
  for (const h of Object.values(state.heroes || {})) top = Math.max(top, h.player?.lvl || 1);
  if (top >= (u.level || 1)) return { ok: true, why: '' };
  if (u.after && openedByPrev(state, id)) return { ok: true, why: '' };
  const prev = u.after ? REGIONS[u.after] : null, pd = prev && DUNGEONS[ZONE_DUNGEON[u.after]];
  return { ok: false, why: prev ? (pd?.gate ? `Reach level ${u.level} or clear the ${pd.name}` : `Reach level ${u.level} or defeat the boss of ${prev.name}`) : `Reach level ${u.level}` };
}
/** Monster level for a visit: the hero's level clamped to the region's range */
export function regionLevel(def, heroLvl) { return Math.max(def.levels[0], Math.min(def.levels[1], heroLvl || 1)); }
