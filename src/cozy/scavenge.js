// Scavenging (docs/COZY.md §7, §8; ROADMAP CZ-5, CZ-6): the gather nodes and Shadow's dig spots of every area, what
// they give, the world-day refill and the dig's golden band. Pure data and functions (no three.js, no DOM): node-tested
// in tools/test-rpg.mjs "SCAVENGE", and the pace is checked by tools/scavenge-sim.mjs.
//
//   state.cozy.scav = {
//     [area]: { day, taken: [node id], found: [spot id], dug: [spot id], quest: day the quest find was dug (-1) },
//     tools:  { basket: bool, bandana: bool },          // the Guild's two upgrades (phase D sells them; COZY §7.1)
//     stats:  { gathered, dug, perfect, streak, best }, // the perfect-dig streak (a run of perfect digs)
//     cheat:  { perfect: n },                           // debug: the next n digs are perfect (the Cozy debug section)
//   }
//   area: 'home' (Blossom Hollow) | 'bamboo' | 'maple' | 'tidepool' | 'onsen'.
//
// The refill rides the world clock (cozy/clock.js): a record whose day is not today's world day is wiped when it is next
// read, so the nodes come back, and the dig spots move, each world day; time away (capped at 8 game hours) counts like
// play, so an absence that crosses a world day refills them too. Node ids are fixed per area (scavengeWorld.js builds them
// from fixed slots), so "taken" survives a reload. Dig spots are picked per day from the area's fixed candidate sites.
import { mulberry32 } from '../core/util.js';
import { worldDay } from './clock.js';

export const SCAV_AREAS = ['home', 'bamboo', 'maple', 'tidepool', 'onsen'];
/** the dig: the ring fills over DIG_SECS while held; letting go inside the golden band is a Perfect dig (COZY §7.1) */
export const DIG_SECS = 1.4;
export const DIG_BAND = [0.7, 0.85];
/** Shadow's nose: how near a hidden spot has to be before he smells it (the Bandana: 18 m) */
export const NOSE_RANGE = 12, NOSE_RANGE_BANDANA = 18;
/** the pickup pose for a gather (life/tools.js run) */
export const GATHER_SECS = 0.6;
/** homestead XP (COZY §3.3: × (1 + lvl / 10)); CZ-9 owns the hook, these are the numbers it uses */
export const SCAV_XP = { gather: 1, dig: 4 };

// ------------------------------------------------------------------ the node kinds
// mats: { material: [min, max] } · pantry: { pool: [ids], n: [min, max] } · coins: [min, max] · model: scavengeModels.js
export const NODE_KINDS = {
  // Blossom Hollow
  driftwood:  { name: 'Driftwood', verb: 'Gather driftwood', mats: { wood: [2, 4] }, model: 'driftwood' },
  riverStone: { name: 'River stones', verb: 'Pick up river stones', mats: { stone: [1, 3] }, model: 'riverStone' },
  petalDrift: { name: 'Sakura drift', verb: 'Scoop up the petals', mats: { petal: [1, 2] }, model: 'petalDrift' },
  mulberry:   { name: 'Old mulberry', verb: 'Collect the silk cocoons', mats: { silk: [1, 1] }, model: 'mulberry', keep: true },
  // the Whispering Bamboo Grove
  culms:      { name: 'Fallen culms', verb: 'Gather fallen culms', mats: { wood: [2, 4] }, model: 'culms' },
  mossRubble: { name: 'Mossy rubble', verb: 'Pick up mossy stones', mats: { stone: [2, 4] }, model: 'mossRubble' },
  cocoons:    { name: 'Silk-moth cocoons', verb: 'Collect the cocoons', mats: { silk: [1, 2] }, model: 'cocoons', keep: true },
  shoots:     { name: 'Bamboo shoots', verb: 'Forage', pantry: { pool: ['bamboo', 'bamboo', 'shiitake'], n: [1, 2] }, model: 'shoots' },
  // Momiji Hollow
  branches:   { name: 'Fallen branches', verb: 'Gather fallen branches', mats: { wood: [2, 4] }, model: 'branches' },
  terrace:    { name: 'Terrace stones', verb: 'Pick up terrace stones', mats: { stone: [2, 4] }, model: 'terrace' },
  mapleLeaves:{ name: 'Maple leaves', verb: 'Press the maple leaves', mats: { petal: [1, 2] }, model: 'mapleLeaves' },
  honeyLog:   { name: 'Hollow log', verb: 'Forage', pantry: { pool: ['honey', 'shiitake', 'shiitake'], n: [1, 2] }, model: 'honeyLog' },
  // Tidepool Point
  seaDrift:   { name: 'Driftwood', verb: 'Gather driftwood', mats: { wood: [2, 4] }, model: 'seaDrift' },
  seaStones:  { name: 'Sea-smoothed stones', verb: 'Pick up sea stones', mats: { stone: [2, 4] }, model: 'seaStones' },
  netScraps:  { name: 'Net scraps', verb: 'Untangle the net', mats: { silk: [1, 2] }, model: 'netScraps' },
  seaGlass:   { name: 'Sea glass', verb: 'Pick out the sea glass', mats: { crystal: [1, 2] }, model: 'seaGlass' },
  seaweed:    { name: 'Seaweed and shells', verb: 'Forage', pantry: { pool: ['seaweed'], n: [2, 3] }, coins: [4, 10], model: 'seaweed' },
  // the Onsen
  pine:       { name: 'Snowy pine branches', verb: 'Gather pine branches', mats: { wood: [2, 4] }, model: 'pine' },
  sinter:     { name: 'Spring sinter', verb: 'Chip off the sinter', mats: { stone: [2, 4] }, model: 'sinter' },
  iceCrystal: { name: 'Ice crystals', verb: 'Collect the ice crystals', mats: { crystal: [1, 2] }, model: 'iceCrystal' },
  snowForage: { name: 'Mushroom stump', verb: 'Forage', pantry: { pool: ['shiitake', 'shiitake', 'honey'], n: [1, 2] }, model: 'snowForage' },
};

// ------------------------------------------------------------------ the areas
// nodes: kind → how many (COZY §7.2: 14–18 a zone, Blossom Hollow 10–12) · dig: the dig table, weights per outcome
// (one roll a dig; a Perfect dig rolls once more) · spots: dig spots a day [min, max] (+1 with the Bandana)
// · ground: the dig mound's look (scavengeModels.js)
export const AREA_DEFS = {
  home: {
    name: 'Blossom Hollow', ground: 'loam', spots: [2, 3],
    nodes: { driftwood: 3, riverStone: 3, petalDrift: 3, mulberry: 1 },
    dig: [{ w: 52, mats: { bone: [1, 2] } }, { w: 22, coins: [10, 24], what: 'a few old coins' }, { w: 12, mats: { crystal: [1, 1] }, what: 'a glinting crystal' }, { w: 10, mats: { lantern: [1, 1] }, what: 'a lantern part' }, { w: 4, find: true }],
  },
  bamboo: {
    name: 'Whispering Bamboo Grove', ground: 'loam', spots: [2, 3],
    nodes: { culms: 6, mossRubble: 4, cocoons: 3, shoots: 3 },
    dig: [{ w: 40, mats: { bone: [1, 2] } }, { w: 20, coins: [18, 36], what: 'an old kunai (sold for coins)' }, { w: 22, mats: { lantern: [1, 1] }, what: 'a lantern part' }, { w: 12, mats: { crystal: [1, 1] }, what: 'a geode' }, { w: 6, find: true }],
  },
  maple: {
    name: 'Momiji Hollow', ground: 'leafy', spots: [2, 3],
    nodes: { branches: 6, terrace: 4, mapleLeaves: 3, honeyLog: 3 },
    dig: [{ w: 40, mats: { bone: [1, 2] } }, { w: 20, coins: [24, 44], what: 'a lost charm (sold for coins)' }, { w: 20, mats: { lantern: [1, 1] }, what: 'a lantern part' }, { w: 14, mats: { crystal: [1, 1] }, what: 'a geode' }, { w: 6, find: true }],
  },
  tidepool: {
    name: 'Tidepool Point', ground: 'sand', spots: [2, 3],
    nodes: { seaDrift: 6, seaStones: 4, netScraps: 2, seaGlass: 2, seaweed: 2 },
    dig: [{ w: 40, mats: { bone: [2, 3] }, what: 'old whale bone' }, { w: 26, mats: { lantern: [1, 1] }, what: 'a glass float' }, { w: 16, coins: [24, 48], what: 'a lost doubloon' }, { w: 12, mats: { crystal: [1, 1] } }, { w: 6, find: true }],
  },
  onsen: {
    name: 'Yukimi Onsen', ground: 'snow', spots: [2, 3],
    nodes: { pine: 6, sinter: 4, iceCrystal: 3, snowForage: 3 },
    dig: [{ w: 34, mats: { lantern: [1, 1] }, what: 'a snow lantern' }, { w: 28, mats: { crystal: [1, 2] } }, { w: 26, mats: { bone: [1, 2] } }, { w: 6, coins: [30, 60] }, { w: 6, find: true }],
  },
};
export const nodeCount = area => Object.values(AREA_DEFS[area]?.nodes || {}).reduce((a, n) => a + n, 0);
/** the area a zone's scavenging belongs to (the zones are the regions: 'bamboo'…), or 'home' in the village */
export const areaFor = (mode, zone) => (mode === 'village' ? 'home' : SCAV_AREAS.includes(zone) ? zone : null);

// ------------------------------------------------------------------ the state
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** state.cozy.scav made whole (idempotent; cozy/state.js normalizeCozy leaves it to us) */
export function scavState(state) {
  const c = (state.cozy ||= {});
  const S = c.scav = obj(c.scav) || {};
  for (const a of SCAV_AREAS) {
    const r = obj(S[a]); if (!r) continue;
    r.day = Math.floor(num(r.day, -1)); r.taken = arr(r.taken); r.found = arr(r.found); r.dug = arr(r.dug); r.quest = Math.floor(num(r.quest, -1));
  }
  const T = S.tools = obj(S.tools) || {}; T.basket = !!T.basket; T.bandana = !!T.bandana;
  const st = S.stats = obj(S.stats) || {};
  for (const k of ['gathered', 'dug', 'perfect', 'streak', 'best']) st[k] = Math.max(0, Math.floor(num(st[k])));
  const ch = S.cheat = obj(S.cheat) || {}; ch.perfect = Math.max(0, Math.floor(num(ch.perfect)));
  return S;
}
/** today's world day */
export const scavDay = state => worldDay(num(state?.cozy?.clock?.h));
/** an area's record for `day`: a record from an earlier day is refilled (wiped) first → { day, taken, found, dug, quest } */
export function areaRec(state, area, day = scavDay(state)) {
  const S = scavState(state);
  let r = S[area];
  if (!r || r.day !== day) r = S[area] = { day, taken: [], found: [], dug: [], quest: r?.quest ?? -1 };
  return r;
}
/** areas whose record is from before `day` (what a world day crossed while away refilled: the away card's line) */
export const staleAreas = (state, day = scavDay(state)) => SCAV_AREAS.filter(a => { const r = state?.cozy?.scav?.[a]; return r && r.day >= 0 && r.day < day && (r.taken.length || r.dug.length); });
export const nodeTaken = (state, area, id) => areaRec(state, area).taken.includes(id);
/** mark a node gathered → false when it already was */
export function takeNode(state, area, id) {
  const r = areaRec(state, area);
  if (r.taken.includes(id)) return false;
  r.taken.push(id); scavState(state).stats.gathered++;
  return true;
}
/** Shadow found a spot (it shows its paw mark until it's dug, for the rest of the day) */
export function findSpot(state, area, id) { const r = areaRec(state, area); if (r.found.includes(id) || r.dug.includes(id)) return false; r.found.push(id); return true; }
export const spotFound = (state, area, id) => areaRec(state, area).found.includes(id);
export const spotDug = (state, area, id) => areaRec(state, area).dug.includes(id);
/** a spot dug (perfect or not): the streak and the stats → { streak, best } */
export function digSpot(state, area, id, perfect) {
  const r = areaRec(state, area), S = scavState(state), st = S.stats;
  if (!r.dug.includes(id)) r.dug.push(id);
  r.found = r.found.filter(x => x !== id);
  st.dug++;
  if (perfect) { st.perfect++; st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
  return { streak: st.streak, best: st.best };
}

// ------------------------------------------------------------------ the dig band
/** the ring's fill (0..1) when let go → 'perfect' | 'normal' (never a fail: COZY §7.1) */
export const digResult = k => (k >= DIG_BAND[0] && k <= DIG_BAND[1] ? 'perfect' : 'normal');
/** debug: is this dig forced perfect (and spend one) */
export function cheatPerfect(state) { const ch = scavState(state).cheat; if (ch.perfect > 0) { ch.perfect--; return true; } return false; }

// ------------------------------------------------------------------ dig spots
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** how many dig spots an area has on a world day (2–3, seeded; +1 with Shadow's Bandana) */
export function spotCount(area, day, { bandana = false } = {}) {
  const A = AREA_DEFS[area]; if (!A) return 0;
  const [a, b] = A.spots, r = mulberry32(hashStr(`spots:${area}:${day}`));
  return a + Math.floor(r() * (b - a + 1)) + (bandana ? 1 : 0);
}
/** the candidate sites a day's spots sit on: n of `cands` (indices), seeded by the area and the day, spread out (no two
 *  picks closer than `gap` m when positions are given: cands = [{ x, z }]) */
export function pickSpots(area, day, cands, n, gap = 14) {
  const r = mulberry32(hashStr(`dig:${area}:${day}`)), idx = cands.map((_, i) => i), out = [];
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (const i of idx) {
    if (out.length >= n) break;
    const c = cands[i];
    if (c && out.some(k => Math.hypot(cands[k].x - c.x, cands[k].z - c.z) < gap)) continue;
    out.push(i);
  }
  for (const i of idx) { if (out.length >= n) break; if (!out.includes(i)) out.push(i); } // (a small area: fill up regardless)
  return out;
}
export const spotId = (area, day, i) => `${area}:d${day}:${i}`;

// ------------------------------------------------------------------ yields
const roll = ([a, b], r) => a + Math.floor(r() * (b - a + 1));
const addTo = (o, k, n) => { if (n > 0) o[k] = (o[k] || 0) + n; };
/** what a gather node gives → { mats: {k: n}, pantry: {id: n}, coins }. o: { basket } (the Forager's Basket: +1) */
export function gatherYield(kind, rng = Math.random, { basket = false } = {}) {
  const K = NODE_KINDS[kind], out = { mats: {}, pantry: {}, coins: 0 };
  if (!K) return out;
  let first = true;
  for (const [m, rg] of Object.entries(K.mats || {})) { addTo(out.mats, m, roll(rg, rng) + (basket && first ? 1 : 0)); first = false; }
  if (K.pantry) { const id = K.pantry.pool[Math.floor(rng() * K.pantry.pool.length) % K.pantry.pool.length]; addTo(out.pantry, id, roll(K.pantry.n, rng) + (basket && first ? 1 : 0)); }
  if (K.coins) out.coins = roll(K.coins, rng);
  return out;
}
/** what a dig gives → { mats, coins, find (a furniture find: the runtime picks it), lines: [what] }. A Perfect dig rolls
 *  twice (COZY §7.1: one bonus roll). */
export function digYield(area, rng = Math.random, { perfect = false } = {}) {
  const T = AREA_DEFS[area]?.dig || AREA_DEFS.home.dig, tot = T.reduce((a, o) => a + o.w, 0);
  const out = { mats: {}, coins: 0, find: false, lines: [] };
  for (let k = 0; k < (perfect ? 2 : 1); k++) {
    let x = rng() * tot, o = T[T.length - 1];
    for (const e of T) { x -= e.w; if (x <= 0) { o = e; break; } }
    if (o.find && out.find) o = T[0]; // (never two furniture finds from one dig)
    for (const [m, rg] of Object.entries(o.mats || {})) addTo(out.mats, m, roll(rg, rng));
    if (o.coins) out.coins += roll(o.coins, rng);
    if (o.find) out.find = true;
    if (o.what) out.lines.push(o.what);
  }
  return out;
}
/** the average yield of one gather of a kind and one dig of an area (the sim and the docs' table) */
export function meanGather(kind, o = {}) {
  const K = NODE_KINDS[kind], out = {};
  let first = true;
  for (const [m, [a, b]] of Object.entries(K?.mats || {})) { out[m] = (a + b) / 2 + (o.basket && first ? 1 : 0); first = false; }
  if (K?.pantry) out.forage = (K.pantry.n[0] + K.pantry.n[1]) / 2 + (o.basket && first ? 1 : 0);
  if (K?.coins) out.coins = (K.coins[0] + K.coins[1]) / 2;
  return out;
}
export function meanDig(area, perfectRate = 0) {
  const T = AREA_DEFS[area].dig, tot = T.reduce((a, o) => a + o.w, 0), out = {}, rolls = 1 + perfectRate;
  for (const o of T) {
    const p = o.w / tot * rolls;
    for (const [m, [a, b]] of Object.entries(o.mats || {})) out[m] = (out[m] || 0) + p * (a + b) / 2;
    if (o.coins) out.coins = (out.coins || 0) + p * (o.coins[0] + o.coins[1]) / 2;
    if (o.find) out.find = (out.find || 0) + p;
  }
  return out;
}

// ------------------------------------------------------------------ quest items from dig spots (COZY §7.2)
/** An active zone quest's current step that is a `find` of an item from this area (its QUEST_ITEMS zone), which a dig
 *  spot can turn up once a world day → { quest, item, name, step } or null. quests: world/zoneQuests.js ZONE_QUESTS,
 *  items: QUEST_ITEMS (passed in, so this stays free of the story's imports). */
export function questFind(state, area, quests, items, day = scavDay(state)) {
  if (area === 'home') return null;
  const r = state?.cozy?.scav?.[area];
  if (r && r.quest === day) return null; // (one a day)
  for (const q of state?.quests?.active || []) {
    const d = quests?.[q.id], s = d?.steps?.[q.step];
    if (!s || s.type !== 'find' || items?.[s.item]?.zone !== area) continue;
    if ((q.prog || 0) >= (s.n || 1)) continue;
    return { quest: q.id, item: s.item, name: items[s.item].name, step: s };
  }
  return null;
}
export function markQuestDig(state, area, day = scavDay(state)) { areaRec(state, area, day).quest = day; }
