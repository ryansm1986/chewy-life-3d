// Dungeon definitions (docs/ZONES.md §4, §8): what a dungeon IS, so gen.js and DungeonMode run any of them from one
// table instead of a bare Burrow floor number. Pure data + helpers (no three.js): node-tested in tools/test-rpg.mjs.
//
//   DUNGEONS[id] = { id, kind: 'burrow' | 'zone' | 'deep', name, zone, theme, monsters, boss, levels, floors, waypoints, stub? }
//     theme     a gen.js THEMES key, or null: the Burrow's rotation by floor (themeFor); themes: one per floor (the Deep
//               Burrow)
//     monsters  the dungeon's own roster (MONSTERS ids), or null: the theme's table
//     boss      the last floor's boss (a MONSTERS id), or null: the Burrow's every-5th-floor bosses (bossFor)
//     levels    [lo, hi] the zone band (T0 = the hero's level clamped to it; tiers add 4 each, capped at 60); the Burrow
//               has none: its monsters are floor + 1
//     floors    Infinity (the Burrow) or the floor count; the last floor holds the boss
//     waypoints the Burrow's every-5th-floor waypoints (only the Burrow)
//
// A run is one entry into one floor: { def, id, floor, tier, spirit, mods, seed, packSeed } — beginRun() makes one,
// rerolling the seed per entry (state.dungeon.runs). G.enterDungeon(n) is still the Burrow's floor n. tier 1–5 and
// spirit S (a Spirit run carries tier 5) are the tier runs (docs/ZONES.md §5.1, rpg/tiers.js); mods are the picked
// modifiers (rpg/zoneMods.js), cleaned to the run's slots.
import { themeFor, bossFor } from './gen.js';
import { runLevel, TIER_MAX } from '../rpg/tiers.js';
import { cleanMods } from '../rpg/zoneMods.js';

export const DUNGEONS = {
  burrow: { id: 'burrow', kind: 'burrow', name: 'The Burrow', zone: null, theme: null, monsters: null, boss: null, levels: null, floors: Infinity, waypoints: true },
  // The four zone dungeons: 2 floors and a boss each (docs/ZONES.md §4, §8.2): zone floors (zoneGen.js: ~8 chambers, the
  // dense packs, the round boss arena on floor 2), the zone's roster and its region boss. `gate`: the dungeon is entered
  // from its gate at the end of the zone's trail (regions/dungeonGate.js), and its boss no longer spawns outdoors.
  // `stub`: its kit is still a Burrow stand-in theme (ROADMAP Z-C1). The rosters and bosses are the zones' own
  // (registered by src/regions/monsters/index.js); DungeonMode falls back to the theme's table if not.
  bambooDepths: { id: 'bambooDepths', kind: 'zone', name: 'Bamboo Depths', zone: 'bamboo', theme: 'bambooCave', monsters: ['takenoko', 'kodama', 'kamaitachi'], tank: 'iwabozu', boss: 'tenguMaster', levels: [4, 12], floors: 2, waypoints: false, gate: true },
  mapleRoots: { id: 'mapleRoots', kind: 'zone', name: 'Maple Roots', zone: 'maple', theme: 'mapleHalls', monsters: ['kuri', 'kakashi', 'momijiWisp'], tank: 'tesso', boss: 'danzaburo', levels: [11, 19], floors: 2, waypoints: false, gate: true },
  tideCaves: { id: 'tideCaves', kind: 'zone', name: 'Tide Caves', zone: 'tidepool', theme: 'seaCave', monsters: ['kappa', 'heikegani', 'kurage'], tank: 'sazaeOni', boss: 'umibozu', levels: [18, 27], floors: 2, waypoints: false, gate: true },
  onsenCaverns: { id: 'onsenCaverns', kind: 'zone', name: 'Onsen Caverns', zone: 'onsen', theme: 'iceCavern', monsters: ['yukiwarashi', 'yukidaruma', 'tsurara'], tank: 'akaname', boss: 'yukiOnna', levels: [26, 35], floors: 2, waypoints: false, gate: true },
  // The Deep Burrow (docs/ZONES.md §5.1): the Burrow's tier runs, at its own Spirit Lantern by the Burrow door. Two floors
  // on the Burrow's deepest themes — the Crystal Grotto, then the Moonlit Fox Sanctum with Tamamo — in the Burrow's own
  // layouts (gen.js rooms and corridors), at the band of its floors 16–20 (+4 a tier). Its T0 is the story Burrow:
  // Tamamo beaten on floor 20 opens T1. Tier runs only (no T0 entry), no waypoints, no Burrow records.
  burrowDeep: { id: 'burrowDeep', kind: 'deep', name: 'The Deep Burrow', zone: null, theme: null, themes: ['crystal', 'moon'], monsters: null, boss: 'nineTails', levels: [17, 21], floors: 2, waypoints: false, tierOnly: true },
};
export const DUNGEON_IDS = Object.keys(DUNGEONS);
/** zone id → its dungeon id ('bamboo' → 'bambooDepths') */
export const ZONE_DUNGEON = Object.fromEntries(Object.values(DUNGEONS).filter(d => d.zone).map(d => [d.zone, d.id]));
export { TIER_LEVEL, LEVEL_CAP } from '../rpg/tiers.js';

export const dungeonDef = id => DUNGEONS[id] || DUNGEONS.burrow;
/** G.enterDungeon's argument → { id, floor, tier, spirit, mods, seed? }: a number is a Burrow floor (the old API). The
 *  endless Burrow has no tiers (its tier runs are the Deep Burrow's); a Spirit run is tier 5; mods are cleaned to the
 *  run's slots (rpg/zoneMods.js cleanMods). */
export function normRun(arg) {
  if (arg == null || typeof arg !== 'object') return { id: 'burrow', floor: Math.max(1, Math.floor(+arg || 1)), tier: 0, spirit: 0, mods: [] };
  const def = dungeonDef(arg.id), cap = Number.isFinite(def.floors) ? def.floors : Infinity;
  const spirit = def.kind === 'burrow' ? 0 : Math.max(0, Math.floor(+arg.spirit || 0));
  const tier = def.kind === 'burrow' ? 0 : spirit > 0 ? TIER_MAX : Math.max(0, Math.min(TIER_MAX, Math.floor(+arg.tier || 0)));
  const mods = Array.isArray(arg.mods) ? cleanMods(arg.mods, { tier, spirit }) : [];
  return { id: def.id, floor: Math.min(cap, Math.max(1, Math.floor(+arg.floor || 1))), tier, spirit, mods, ...(arg.seed != null ? { seed: +arg.seed } : {}) };
}
/** the monster level on a floor: the Burrow floor + 1; a zone dungeon (or the Deep Burrow) the hero clamped to its band,
 *  + 1 a floor, +4 a tier (cap 60); a Spirit run 60 (rpg/tiers.js runLevel) */
export function levelAt(def, floor, tier = 0, heroLvl = 1, spirit = 0) {
  return runLevel(def.levels, floor, { tier, spirit }, heroLvl);
}
/** what gen.js needs for one floor of a dungeon → { theme, boss, mlvl, waypoint, depth, tier, spirit, mods } */
export function floorPlan(def, floor, { tier = 0, heroLvl = 1, spirit = 0, mods = [] } = {}) {
  const last = Number.isFinite(def.floors) && floor >= def.floors;
  return {
    theme: def.themes?.[floor - 1] || def.theme || themeFor(floor),
    boss: def.boss ? (last ? def.boss : null) : bossFor(floor),
    mlvl: levelAt(def, floor, tier, heroLvl, spirit),
    tier, spirit, mods, // (the run's tier and modifiers: gen.js applies their layout effects, rpg/zoneMods.js layoutMods)
    waypoint: !!def.waypoints && floor % 5 === 1 && floor > 1,
    depth: floor, // (room count, size and the unique-pack chance grow with it: gen.js)
    // a zone dungeon's floors (zoneGen.js): ~9 chambers on floor 1, ~8 then the round arena (r ~17 m) on the last,
    // two objective slots a floor and 120–160 monsters at tier 0 (ZONES §4)
    ...(def.kind === 'zone' ? { layout: 'zone', rooms: last ? 8 : 9, size: last ? 84 : 76, arenaR: 17, slots: 2, density: [120, 160] } : {}),
  };
}
// each dungeon its own layouts for the same seed
const SALT = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return id === 'burrow' ? 0 : h * 7; };
/** Start an entry into a dungeon floor: the def, the clamped floor, and this entry's seeds. Without a pinned seed every
 *  entry rerolls (state.dungeon.runs + 1, from a per-save state.dungeon.seed). fixedSeed (?dseed=N, the QA's pin) gives
 *  the old fixed layouts: dseed=1 is exactly the pre-reroll Burrow. An explicit arg.seed wins over both. */
export function beginRun(state, arg, { fixedSeed = null, rand = Math.random } = {}) {
  const r = normRun(arg), def = dungeonDef(r.id), D = state.dungeon ||= { deepest: 0, waypoints: [1] }, salt = SALT(def.id);
  let seed, packSeed;
  if (r.seed != null) { seed = r.seed; packSeed = r.seed * 31 + r.floor; }
  else if (fixedSeed != null) { seed = fixedSeed + r.floor * 17 + salt; packSeed = r.floor * 999 + (fixedSeed - 1) + salt; }
  else {
    if (!D.seed) D.seed = 1 + Math.floor(rand() * 99991);
    D.runs = (D.runs || 0) + 1;
    seed = D.seed + r.floor * 17 + D.runs * 101 + salt; packSeed = r.floor * 999 + D.runs + D.seed * 7 + salt;
  }
  return { def, id: def.id, floor: r.floor, tier: r.tier, spirit: r.spirit, mods: r.mods, seed, packSeed };
}
