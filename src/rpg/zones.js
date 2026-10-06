// Zone save state (docs/ZONES.md §8; ROADMAP Z-A4). Pure (no three.js): node-tested in tools/test-rpg.mjs.
//
//   state.zones[id] = { unlocked, visits, regionBoss,
//                       village: 'besieged' | 'saved', siegeCamps: [...],
//                       dungeon: { cleared, bestFloor, tier: { unlocked, cleared: [t...] }, spirit: { best } },
//                       quests: {...} }
//   The four outdoor regions (src/regions) are the zones; a zone's dungeon is dungeon/defs.js ZONE_DUNGEON[id].
//   regionBoss counts the outdoor boss's defeats (today's region climax); dungeon.cleared counts the zone dungeon's boss,
//   so the dungeon's first clear (phase C's first-clear rewards) stays detectable for every save.
//
// Old saves: state.regions = { unlocked, cleared, visits } migrates once (normalizeZones): unlocked → zones[id].unlocked,
// cleared → zones[id].regionBoss, visits → zones[id].visits. Afterwards state.regions is a live, unsaved view of
// state.zones in that old shape, so region code, the Travel Map and QA keep reading and writing it unchanged.
export const ZONE_IDS = ['bamboo', 'maple', 'tidepool', 'onsen'];
export const TIER_MAX = 5;

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
/** a zone record with every field present and of the right type (missing ones at their fresh values) */
export function fillZone(z) {
  z = obj(z) || {};
  z.unlocked = !!z.unlocked; z.visits = Math.max(0, +z.visits || 0); z.regionBoss = Math.max(0, +z.regionBoss || 0);
  if (z.village !== 'saved') z.village = 'besieged';
  if (!Array.isArray(z.siegeCamps)) z.siegeCamps = [];
  const d = z.dungeon = obj(z.dungeon) || {};
  d.cleared = Math.max(0, +d.cleared || 0); d.bestFloor = Math.max(0, +d.bestFloor || 0);
  const t = d.tier = obj(d.tier) || {};
  t.unlocked = Math.max(0, Math.min(TIER_MAX, +t.unlocked || 0)); if (!Array.isArray(t.cleared)) t.cleared = [];
  d.spirit = obj(d.spirit) || {}; d.spirit.best = Math.max(0, +d.spirit.best || 0);
  z.quests = obj(z.quests) || {};
  return z;
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
/** The zone dungeon's boss fell on a run at `tier` (0 = the story clear). A clear at the highest open tier opens the next
 *  (T0 → T1 … up to T5). → { first, cleared, tierUnlocked: n | null } */
export function recordDungeonClear(state, id, tier = 0) {
  const d = zoneOf(state, id).dungeon, first = d.cleared === 0;
  d.cleared++;
  if (!d.tier.cleared.includes(tier)) { d.tier.cleared.push(tier); d.tier.cleared.sort((a, b) => a - b); }
  let tierUnlocked = null;
  if (tier >= d.tier.unlocked && d.tier.unlocked < TIER_MAX) tierUnlocked = d.tier.unlocked = Math.min(TIER_MAX, tier + 1);
  return { first, cleared: d.cleared, tierUnlocked };
}
/** has the zone dungeon been cleared at tier n or higher? */
export const tierCleared = (state, id, n) => zoneOf(state, id).dungeon.tier.cleared.some(t => t >= n);
/** The zone's village is saved (phase D's siege end calls this, then emits 'village:saved'). → true the first time */
export function saveVillage(state, id) { const z = zoneOf(state, id); if (z.village === 'saved') return false; z.village = 'saved'; z.siegeCamps = []; return true; }
export const villageSaved = (state, id) => zoneOf(state, id).village === 'saved';
