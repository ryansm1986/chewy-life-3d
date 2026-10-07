// Zone save state (docs/ZONES.md §8; ROADMAP Z-A4). Pure (no three.js): node-tested in tools/test-rpg.mjs.
//
//   state.zones[id] = { unlocked, visits, regionBoss,
//                       village: 'besieged' | 'saved', siegeCamps: [...],
//                       dungeon: { cleared, bestFloor, tier: { unlocked, cleared: [t...] }, spirit: { best },
//                                  lantern: { tier, spirit, mods } | null },
//                       quests: {...} }
//   The Deep Burrow (the Burrow's tier runs: dungeon/defs.js burrowDeep) keeps the same dungeon record in
//   state.dungeon.deep (tierRecord).
//   The four outdoor regions (src/regions) are the zones; a zone's dungeon is dungeon/defs.js ZONE_DUNGEON[id].
//   regionBoss counts the outdoor boss's defeats (today's region climax); dungeon.cleared counts the zone dungeon's boss,
//   so the dungeon's first clear (phase C's first-clear rewards) stays detectable for every save.
//
// Old saves: state.regions = { unlocked, cleared, visits } migrates once (normalizeZones): unlocked → zones[id].unlocked,
// cleared → zones[id].regionBoss, visits → zones[id].visits. Afterwards state.regions is a live, unsaved view of
// state.zones in that old shape, so region code, the Travel Map and QA keep reading and writing it unchanged.
import { DUNGEONS } from '../dungeon/defs.js';

export const ZONE_IDS = ['bamboo', 'maple', 'tidepool', 'onsen'];
export const TIER_MAX = 5;
/** the Deep Burrow's story clear: Tamamo on Burrow floor 20 (state.dungeon.deepest past 20 means she fell) */
export const DEEP_STORY_FLOOR = 21;

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
/** a zone record with every field present and of the right type (missing ones at their fresh values) */
export function fillZone(z) {
  z = obj(z) || {};
  z.unlocked = !!z.unlocked; z.visits = Math.max(0, +z.visits || 0); z.regionBoss = Math.max(0, +z.regionBoss || 0);
  if (z.village !== 'saved') z.village = 'besieged';
  if (!Array.isArray(z.siegeCamps)) z.siegeCamps = [];
  z.dungeon = fillTiers(z.dungeon);
  z.quests = obj(z.quests) || {};
  return z;
}
/** A dungeon's clear / tier record made whole: { cleared, bestFloor, tier: { unlocked, cleared: [t…] }, spirit: { best },
 *  lantern: { tier, spirit, mods } | null }. storyClear: the story run was beaten before tiers were tracked (old saves:
 *  T0 counts as cleared and T1 opens — docs/ZONES.md §5.1). */
export function fillTiers(d, storyClear = false) {
  d = obj(d) || {};
  d.cleared = Math.max(0, +d.cleared || 0); d.bestFloor = Math.max(0, +d.bestFloor || 0);
  const t = d.tier = obj(d.tier) || {};
  t.unlocked = Math.max(0, Math.min(TIER_MAX, +t.unlocked || 0));
  t.cleared = Array.isArray(t.cleared) ? [...new Set(t.cleared.map(v => Math.floor(+v)).filter(v => v >= 0 && v <= TIER_MAX))].sort((a, b) => a - b) : [];
  d.spirit = obj(d.spirit) || {}; d.spirit.best = Math.max(0, Math.floor(+d.spirit.best || 0));
  if (d.cleared > 0 || storyClear) { if (!t.cleared.includes(0)) t.cleared.unshift(0); t.unlocked = Math.max(1, t.unlocked); } // (the migration)
  const ln = obj(d.lantern);
  d.lantern = ln ? { tier: Math.max(0, Math.min(TIER_MAX, Math.floor(+ln.tier || 0))), spirit: Math.max(0, Math.floor(+ln.spirit || 0)), mods: Array.isArray(ln.mods) ? ln.mods.filter(x => typeof x === 'string').slice(0, 6) : [] } : null;
  return d;
}
export const newZone = () => fillZone({});

// the old { unlocked, cleared, visits } maps, live on state.zones (writes create the zone)
const MAPS = {
  unlocked: [z => z.unlocked, (z, v) => { z.unlocked = !!v; }],
  cleared: [z => z.regionBoss, (z, v) => { z.regionBoss = Math.max(0, +v || 0); }],
  visits: [z => z.visits, (z, v) => { z.visits = Math.max(0, +v || 0); }],
};
const VIEWS = new WeakMap();
function regionsView(state) {
  let v = VIEWS.get(state);
  if (v) return v;
  v = {};
  for (const [name, [read, write]] of Object.entries(MAPS)) {
    const Z = () => state.zones;
    v[name] = new Proxy({}, {
      get: (t, k) => (typeof k === 'string' && obj(Z()[k]) ? read(Z()[k]) : Reflect.get(t, k)),
      set: (t, k, val) => { if (typeof k !== 'string') return Reflect.set(t, k, val); write(zoneOf(state, k), val); return true; },
      has: (t, k) => typeof k === 'string' && !!obj(Z()[k]),
      deleteProperty: (t, k) => { if (obj(Z()[k])) write(Z()[k], undefined); return true; },
      ownKeys: () => Object.keys(Z()),
      getOwnPropertyDescriptor: (t, k) => (typeof k === 'string' && obj(Z()[k]) ? { value: read(Z()[k]), writable: true, enumerable: true, configurable: true } : undefined),
    });
  }
  VIEWS.set(state, v);
  return v;
}
// merge an old-shape regions object into the zones (a max-merge: idempotent, never loses progress)
function mergeRegions(state, R) {
  R = obj(R); if (!R) return;
  for (const id of new Set([...Object.keys(obj(R.unlocked) || {}), ...Object.keys(obj(R.cleared) || {}), ...Object.keys(obj(R.visits) || {})])) {
    const z = zoneOf(state, id);
    if (R.unlocked?.[id]) z.unlocked = true;
    z.regionBoss = Math.max(z.regionBoss, +R.cleared?.[id] || 0);
    z.visits = Math.max(z.visits, +R.visits?.[id] || 0);
  }
}
/** Make state.zones whole (migrating an old state.regions once) and install the state.regions view. Idempotent;
 *  game.js runs it at boot, regionState() and zoneOf() on demand. → state */
export function normalizeZones(state) {
  if (!state) return state;
  state.zones = obj(state.zones) || {};
  for (const id of ZONE_IDS) state.zones[id] = fillZone(state.zones[id]);
  for (const id of Object.keys(state.zones)) if (!ZONE_IDS.includes(id)) state.zones[id] = fillZone(state.zones[id]);
  const own = Object.getOwnPropertyDescriptor(state, 'regions');
  if (own && !own.get) { delete state.regions; mergeRegions(state, own.value); } // (an old save's plain state.regions)
  if (!own || !own.get) Object.defineProperty(state, 'regions', { configurable: true, enumerable: false, get: () => regionsView(state), set: v => mergeRegions(state, v) });
  if (obj(state.dungeon)) tierRecord(state, 'burrowDeep'); // (the Deep Burrow's record, migrated from the Burrow's deepest floor)
  return state;
}
/** state.zones[id], made whole (and created when new) */
export function zoneOf(state, id) {
  if (!obj(state.zones)) normalizeZones(state);
  const Z = state.zones;
  return (Z[id] = fillZone(Z[id]));
}
/** a floor of the zone's dungeon reached (DungeonMode.start) */
export function noteFloor(state, id, floor) { const d = zoneOf(state, id).dungeon; d.bestFloor = Math.max(d.bestFloor, floor || 0); return d.bestFloor; }
// ------------------------------------------------------------------ tiers and the Spirit endgame (docs/ZONES.md §5.1)
/** The tier record of a dungeon: a zone ('bamboo'), its dungeon ('bambooDepths'), or the Deep Burrow ('burrowDeep': kept
 *  in state.dungeon.deep; its story clear is Tamamo on Burrow floor 20). → fillTiers' record, or null */
export function tierRecord(state, id) {
  if (!state) return null;
  if (ZONE_IDS.includes(id) || (obj(state.zones) && obj(state.zones[id]) && !DUNGEONS[id])) return zoneOf(state, id).dungeon;
  const def = DUNGEONS[id];
  if (def?.zone) return zoneOf(state, def.zone).dungeon;
  if (def?.kind === 'deep') { const D = state.dungeon = obj(state.dungeon) || { deepest: 0, waypoints: [1] }; return (D.deep = fillTiers(D.deep, (D.deepest || 0) >= DEEP_STORY_FLOOR)); }
  return null;
}
/** the dungeons with tier runs: the four zone dungeons and the Deep Burrow */
export const TIER_DUNGEONS = ['bambooDepths', 'mapleRoots', 'tideCaves', 'onsenCaverns', 'burrowDeep'];
/** A tier or Spirit run's last boss fell (tier 0 = the story clear). A clear at the highest open tier opens the next
 *  (T0 → T1 … up to T5); a Spirit clear raises the dungeon's Spirit best. → { first (the dungeon's first clear ever),
 *  cleared, tierUnlocked: n | null, firstTier (the first clear of this tier / Spirit tier here), spirit } */
export function recordDungeonClear(state, id, tier = 0, spirit = 0) {
  const d = tierRecord(state, id), first = d.cleared === 0;
  d.cleared++;
  let tierUnlocked = null, firstTier;
  if (spirit > 0) { firstTier = spirit > d.spirit.best; d.spirit.best = Math.max(d.spirit.best, spirit); }
  else {
    firstTier = !d.tier.cleared.includes(tier);
    if (firstTier) { d.tier.cleared.push(tier); d.tier.cleared.sort((a, b) => a - b); }
    if (tier >= d.tier.unlocked && d.tier.unlocked < TIER_MAX) tierUnlocked = d.tier.unlocked = Math.min(TIER_MAX, tier + 1);
  }
  return { first, cleared: d.cleared, tierUnlocked, firstTier, spirit };
}
/** has the dungeon (a zone, its dungeon, or the Deep Burrow) been cleared at tier n or higher? (a Spirit clear counts as T5) */
export const tierCleared = (state, id, n) => { const d = tierRecord(state, id); return !!d && (d.tier.cleared.some(t => t >= n) || (n <= TIER_MAX && d.spirit.best > 0)); };
/** the highest tier open at a dungeon's Lantern (0: none yet) */
export const tierOpen = (state, id) => tierRecord(state, id)?.tier.unlocked || 0;
/** the Spirit endgame opens once all four zone dungeons are cleared at T5 (the Deep Burrow is optional) */
export const spiritOpen = state => ZONE_IDS.every(z => tierCleared(state, z, TIER_MAX));
/** the best Spirit tier cleared anywhere (Spirit progress is shared: a Spirit clear in any dungeon opens the next in all) */
export const spiritBest = state => Math.max(0, ...TIER_DUNGEONS.map(id => tierRecord(state, id)?.spirit.best || 0));
/** the highest Spirit tier open (0 while the endgame is closed) */
export const spiritMax = state => (spiritOpen(state) ? spiritBest(state) + 1 : 0);
/** the Lantern remembers each dungeon's last setup */
export function rememberSetup(state, id, run) { const d = tierRecord(state, id); if (!d) return null; d.lantern = { tier: run.tier || 0, spirit: run.spirit || 0, mods: [...(run.mods || [])] }; return d.lantern; }
export const lastSetup = (state, id) => tierRecord(state, id)?.lantern || null;
/** The zone's village is saved (phase D's siege end calls this, then emits 'village:saved'). → true the first time */
export function saveVillage(state, id) { const z = zoneOf(state, id); if (z.village === 'saved') return false; z.village = 'saved'; z.siegeCamps = []; return true; }
export const villageSaved = (state, id) => zoneOf(state, id).village === 'saved';
