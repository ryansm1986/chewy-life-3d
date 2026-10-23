// Dungeon definitions (docs/ZONES.md §4, §8): what a dungeon IS, so gen.js and DungeonMode run any of them from one
// table instead of a bare Burrow floor number. Pure data + helpers (no three.js): node-tested in tools/test-rpg.mjs.
//
//   DUNGEONS[id] = { id, kind: 'burrow' | 'zone' | 'deep', name, zone, theme, monsters, boss, levels, floors, waypoints, stub? }
//     kind      'burrow': one of the Burrow's four dens (den: its place in the order, 0–3; docs/ZONES.md §4.1); 'zone': a
//               zone dungeon; 'deep': the Deep Burrow's tier runs
//     theme     a gen.js THEMES key; themes: one per floor (a den, the Deep Burrow)
//     monsters  the dungeon's own roster (MONSTERS ids), or null: the theme's table
//     boss      the last floor's boss (a MONSTERS id)
//     levels    [lo, hi] the band (T0 = the hero's level clamped to it, +1 a floor; tiers add 4 each, capped at 60)
//     floors    the floor count; the last floor holds the boss
//     waypoints none any more (the endless Burrow's every-5th-floor waypoints went with it: ROADMAP Z-H1)
//
// A run is one entry into one floor: { def, id, floor, tier, spirit, mods, seed, packSeed } — beginRun() makes one,
// rerolling the seed per entry (state.dungeon.runs). G.enterDungeon(n), an old Burrow floor number, is the den that
// holds that floor now (legacyFloor). tier 1–5 and spirit S (a Spirit run carries tier 5) are the tier runs
// (docs/ZONES.md §5.1, rpg/tiers.js); mods are the picked modifiers (rpg/zoneMods.js), cleaned to the run's slots.
import { themeFor, bossFor } from './gen.js';
import { runLevel, TIER_MAX } from '../rpg/tiers.js';
import { cleanMods } from '../rpg/zoneMods.js';

export const DUNGEONS = {
  // The Burrow's four dens (docs/ZONES.md §4.1; ROADMAP Z-H1, the owner's pick 2026-10-11): picked at the Burrow door in
  // Blossom Hollow, each two floors of the Burrow's own rooms and corridors (gen.js) with its boss's chamber at the far
  // end of floor 2; the first is open from the start, each next one when the den before it is cleared (rpg/dens.js).
  // levels: the old floors' monster levels (2–6, 7–11, 12–16, 17–21): floor 1 at the band with the hero clamped to
  // [lo, hi], floor 2 one more, the boss two over that. sub: a floor's own name under the den's in the banner.
  mossyBurrow: { id: 'mossyBurrow', kind: 'burrow', den: 0, name: 'Mossy Burrow', zone: null, theme: 'burrow', themes: ['burrow', 'burrow'], monsters: null, boss: 'mochiKing', levels: [2, 5], floors: 2, waypoints: false, quest: 'king' },
  foxShrine: { id: 'foxShrine', kind: 'burrow', den: 1, name: 'Fox Shrine', zone: null, theme: 'shrine', themes: ['shrine', 'shrine'], monsters: null, boss: 'kasaLord', levels: [7, 10], floors: 2, waypoints: false, quest: 'umbrella' },
  oniKitchen: { id: 'oniKitchen', kind: 'burrow', den: 2, name: "Oni's Kitchen", zone: null, theme: 'kitchen', themes: ['kitchen', 'kitchen'], monsters: null, boss: 'oniChef', levels: [12, 15], floors: 2, waypoints: false, quest: 'oni' },
  moonSanctum: { id: 'moonSanctum', kind: 'burrow', den: 3, name: 'Moonlit Sanctum', zone: null, theme: 'crystal', themes: ['crystal', 'moon'], sub: ['Crystal Grotto', 'Moonlit Fox Sanctum'], monsters: null, boss: 'nineTails', levels: [17, 20], floors: 2, waypoints: false, quest: 'tails' },
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
  // layouts (gen.js rooms and corridors), at the band of the old floors 16–20 (+4 a tier). Its T0 is the Moonlit
  // Sanctum den: Tamamo beaten there opens T1. Tier runs only (no T0 entry), no waypoints, no den records.
  burrowDeep: { id: 'burrowDeep', kind: 'deep', name: 'The Deep Burrow', zone: null, theme: null, themes: ['crystal', 'moon'], monsters: null, boss: 'nineTails', levels: [17, 21], floors: 2, waypoints: false, tierOnly: true },
};
export const DUNGEON_IDS = Object.keys(DUNGEONS);
/** zone id → its dungeon id ('bamboo' → 'bambooDepths') */
export const ZONE_DUNGEON = Object.fromEntries(Object.values(DUNGEONS).filter(d => d.zone).map(d => [d.zone, d.id]));
export { TIER_LEVEL, LEVEL_CAP } from '../rpg/tiers.js';
/** the Burrow's dens in their order (the Mossy Burrow first, the Moonlit Sanctum last) */
export const DEN_IDS = Object.values(DUNGEONS).filter(d => d.kind === 'burrow').sort((a, b) => a.den - b.den).map(d => d.id);
/** 'burrow' names the Burrow as a whole (any of its dens): a quest step's pointer, the old saves' id */
export const BURROW = 'burrow';
/** is this dungeon id one of the Burrow's dens (or the Burrow as a whole)? */
export const isBurrow = id => id === BURROW || DUNGEONS[id]?.kind === 'burrow';
/** a den's name in a sentence: "the Fox Shrine", "Oni's Kitchen" (cap: "The Fox Shrine") */
export const theDen = (id, cap = false) => { const n = DUNGEONS[id]?.name || String(id); return /^\S+'s /.test(n) ? n : `${cap ? 'The' : 'the'} ${n}`; };
/** a den boss's den ('mochiKing' → 'mossyBurrow') */
export const DEN_OF_BOSS = Object.fromEntries(DEN_IDS.map(id => [DUNGEONS[id].boss, id]));
/** An old Burrow floor number (1–20, a boss every 5th) → the den that holds it now and the floor there: floors 1–5 are
 *  the Mossy Burrow, 6–10 the Fox Shrine, 11–15 Oni's Kitchen, 16 and deeper the Moonlit Sanctum; a boss floor (5, 10,
 *  15, 20) is its den's floor 2, the others floor 1. → { id, floor } */
export function legacyFloor(n) {
  const f = Math.max(1, Math.floor(+n || 1)), k = Math.min(DEN_IDS.length - 1, Math.floor((f - 1) / 5));
  return { id: DEN_IDS[k], floor: f % 5 === 0 && f <= 5 * DEN_IDS.length ? 2 : 1 };
}

export const dungeonDef = id => DUNGEONS[id] || DUNGEONS[DEN_IDS[0]];
/** G.enterDungeon's argument → { id, floor, tier, spirit, mods, seed? }: a number is an old Burrow floor, now the den
 *  that holds it (legacyFloor); { id: 'burrow', floor } the same; a den's id alone its floor 1. The dens have no tiers
 *  (the Burrow's tier runs are the Deep Burrow's); a Spirit run is tier 5; mods are cleaned to the run's slots
 *  (rpg/zoneMods.js cleanMods). */
export function normRun(arg) {
  if (typeof arg === 'string' && DUNGEONS[arg]) arg = { id: arg, floor: 1 };
  if (arg == null || typeof arg !== 'object') return { ...legacyFloor(arg), tier: 0, spirit: 0, mods: [] };
  if (arg.id == null || arg.id === BURROW) arg = { ...arg, ...legacyFloor(arg.floor) };
  const def = dungeonDef(arg.id), cap = Number.isFinite(def.floors) ? def.floors : Infinity;
  const spirit = def.kind === 'burrow' ? 0 : Math.max(0, Math.floor(+arg.spirit || 0));
  const tier = def.kind === 'burrow' ? 0 : spirit > 0 ? TIER_MAX : Math.max(0, Math.min(TIER_MAX, Math.floor(+arg.tier || 0)));
  const mods = Array.isArray(arg.mods) ? cleanMods(arg.mods, { tier, spirit }) : [];
  return { id: def.id, floor: Math.min(cap, Math.max(1, Math.floor(+arg.floor || 1))), tier, spirit, mods, ...(arg.seed != null ? { seed: +arg.seed } : {}),
    // (a Town Portal's way back, dungeon/townPortal.js: the exact pack seed and hero level the floor was built with, and its snapshot)
    ...(arg.packSeed != null ? { packSeed: +arg.packSeed } : {}), ...(arg.heroLvl != null ? { heroLvl: +arg.heroLvl } : {}), ...(arg.resume ? { resume: arg.resume } : {}) };
}
/** the monster level on a floor: the hero clamped to the dungeon's band, + 1 a floor, +4 a tier (cap 60); a Spirit run
 *  60 (rpg/tiers.js runLevel) */
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
    // a den's floors (gen.js rooms and corridors; docs/ZONES.md §4.1): floor 1 the size of the old floors under its boss
    // (depth: the old floor it stands for, 3 / 8 / 13 / 18); floor 2 a full floor too, 9–12 rooms (one more each den
    // down) with a treasure room, the big room (30 m) its boss's chamber at the far end, the arrival the room farthest from it
    ...(def.kind === 'burrow' ? (last ? { depth: 5 * def.den + 5, rooms: 9 + def.den, size: 70 + 3 * def.den, bigBoss: true, treasure: true } : { depth: 5 * def.den + 3 }) : {}),
  };
}
// each dungeon its own layouts for the same seed
const SALT = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return h * 7; };
/** Start an entry into a dungeon floor: the def, the clamped floor, and this entry's seeds. Without a pinned seed every
 *  entry rerolls (state.dungeon.runs + 1, from a per-save state.dungeon.seed). fixedSeed (?dseed=N, the QA's pin) gives
 *  every dungeon floor one fixed layout. An explicit arg.seed wins over both. */
export function beginRun(state, arg, { fixedSeed = null, rand = Math.random } = {}) {
  const r = normRun(arg), def = dungeonDef(r.id), D = state.dungeon ||= { deepest: 0, waypoints: [1] }, salt = SALT(def.id);
  let seed, packSeed;
  if (r.seed != null) { seed = r.seed; packSeed = r.packSeed ?? r.seed * 31 + r.floor; }
  else if (fixedSeed != null) { seed = fixedSeed + r.floor * 17 + salt; packSeed = r.floor * 999 + (fixedSeed - 1) + salt; }
  else {
    if (!D.seed) D.seed = 1 + Math.floor(rand() * 99991);
    D.runs = (D.runs || 0) + 1;
    seed = D.seed + r.floor * 17 + D.runs * 101 + salt; packSeed = r.floor * 999 + D.runs + D.seed * 7 + salt;
  }
  return { def, id: def.id, floor: r.floor, tier: r.tier, spirit: r.spirit, mods: r.mods, seed, packSeed, ...(r.heroLvl != null ? { heroLvl: r.heroLvl } : {}), ...(r.resume ? { resume: r.resume } : {}) }; // (resume: a Town Portal's snapshot, dungeon/townPortal.js)
}
