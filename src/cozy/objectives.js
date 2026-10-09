// The expedition objectives (docs/COZY.md §3, §4.2, §4.6, §4.7; ROADMAP CZ-2). Pure data and functions (no three.js,
// no DOM): node-tested in tools/test-rpg.mjs "COZY".
//
//   objective(state, id) → the objective, built from its id (any id the table knows, errands of any day included), or
//   null. Its shape (COZY §4.10):
//     { id, kind: 'errand' | 'quest' | 'burrowBoss' | 'siege' | 'dungeon', name, jp, desc, story,
//       place: { area, zone?, label, jp, color }, level, power (the full need, before progress), hours,
//       gates: [{ kind: 'rank' | 'pop' | 'built' | 'guild' | 'heroes' | 'any', n?, type?, any?, label }],
//       supplies: { meals: per member (0: optional), potions?: max, mealSure?: a packed lunch makes it a sure thing },
//       binds: { village: zone } | null,        // what a success completes (cozy/expeditionRun.js applies it)
//       rewards: { kills (XP: worth that many kills of its level), coins: [a, b], items: [rarity…], itemChance?,
//                  mats: { n: [a, b], pool: { mat: weight } }, pantry?: { n: [a, b], pool: [ids] }, find?, trophy? },
//       tags: ['siege', 'find', …], seats?: the camps' share of a siege }
//   storyObjectives(state)   the story's crew routes on offer now (phase A: the first siege relief, Takemori)
//   errandsFor(state, day)   today's errands: 3 per open area, seeded by the world day
//   objectivePower(state, o) the need now (a siege counts only the camps still standing; a partial's kept progress)
//
// The story side (COZY §12): G.story.crewObjectives(state) is what the Board lists under Story; until the story's
// reroute (CZ-9) installs its own, the cozy runtime sets it to storyObjectives.
import { mulberry32 } from '../core/util.js';
import { VILLAGES } from '../regions/village/data.js';
import { REGIONS, regionUnlocked } from '../regions/index.js';
import { zoneOf } from '../rpg/zones.js';
import { ZONE_ORDER } from '../rpg/zoneProgress.js';

/** an objective's power = its level × its kind's factor (COZY §4.2) */
export const KIND_FACTOR = { errand: 6, quest: 9, burrowBoss: 12, siege: 14, dungeon: 18 };
/** the story objectives the Board offers in phase A (CZ-9 reroutes the rest of the story) */
export const STORY_READY = new Set(['relief:bamboo']);
/** a kill's XP at a monster level (rpg/stats.js monsterStats: a normal monster, a plain kind) */
export const killXp = L => Math.round(8 * Math.pow(Math.max(1, L), 1.35) + 4);

// ------------------------------------------------------------------ the places errands go
// level: the content's level; find: the furniture table its finds come from (home/finds.js)
export const AREAS = {
  home: { label: "Blossom Hollow's outskirts", short: 'Blossom Hollow', jp: 'さくら村', color: '#ff8fb0', level: 2, find: 'burrow' },
  burrow: { label: "The Burrow's upper floors", short: 'The Burrow', jp: '巣穴', color: '#c9925a', level: 4, find: 'burrow' },
  bamboo: { zone: 'bamboo', find: 'bamboo' }, maple: { zone: 'maple', find: 'maple' }, tidepool: { zone: 'tidepool', find: 'tidepool' }, onsen: { zone: 'onsen', find: 'onsen' },
};
export function areaInfo(area) {
  const A = AREAS[area]; if (!A) return null;
  if (!A.zone) return { area, ...A };
  const R = REGIONS[A.zone];
  return { area, zone: A.zone, label: R?.name || A.zone, short: R?.name?.split(' ').slice(-2).join(' ') || A.zone, jp: R?.jp || '', color: R?.color || '#8fe0c0', level: (R?.levels?.[0] || 1) + 1, find: A.find };
}
// the errands of each area (COZY §4.7): mats are weights, pantry are forage the crew brings home
export const ERRANDS = {
  home: [
    { id: 'drift', name: 'Driftwood on the far shore', mats: { wood: 3, stone: 1 }, line: 'The tide brought in a whole beach of it.' },
    { id: 'petals', name: 'Petal drifts by the river', mats: { petal: 3, wood: 1 }, line: 'The sakura by the river let go all at once.' },
    { id: 'pebbles', name: 'River stones for the paths', mats: { stone: 3, petal: 0.5 }, line: 'Smooth, round, and only slightly fishy.' },
    { id: 'mulberry', name: 'The old mulberry by the farms', mats: { silk: 1, wood: 2 }, line: 'The silk-moths were very polite about it.' },
    { id: 'shells', name: 'A beachcomb on the south shore', mats: { stone: 2, crystal: 0.35, wood: 1 }, line: 'A crab guarded the best shell. We negotiated.' },
  ],
  burrow: [
    { id: 'patrol', name: 'Burrow patrol: floors 1–4', mats: { bone: 3, mochi: 2 }, line: 'The mochi slimes were mostly bluffing.' },
    { id: 'mushrooms', name: 'A mushroom hunt on floor 3', mats: { mochi: 2, petal: 1 }, pantry: ['shiitake'], line: 'The kinoko were very rude. The shiitake were delicious.' },
    { id: 'lanterns', name: 'Lost lanterns of the upper floors', mats: { lantern: 1, bone: 2 }, line: 'Somebody had been using them as hats.' },
    { id: 'jelly', name: 'Mochi jelly for Rosie', mats: { mochi: 3, bone: 0.5 }, line: 'Rosie said it was for baking. Shadow said it was for him.' },
  ],
  bamboo: [
    { id: 'silkmoth', name: 'Silk-moth season in the grove', mats: { silk: 3, wood: 1 }, pantry: ['bamboo'], line: 'The cocoons hang off the culms like little lanterns.' },
    { id: 'culms', name: 'Fallen culms by the stream', mats: { wood: 3, stone: 1 }, line: 'The wind did all the hard work.' },
    { id: 'shrinepath', name: 'Lantern parts from the old shrine path', mats: { lantern: 2, stone: 1 }, line: 'The old shrine hummed the whole time. Friendly humming.' },
    { id: 'shoots', name: 'Bamboo shoots for the inn', mats: { wood: 2, silk: 0.5 }, pantry: ['bamboo', 'shiitake'], line: 'Okami Fuku says they make the best soup.' },
  ],
  maple: [
    { id: 'terraces', name: 'Terrace stones on the red hills', mats: { stone: 3, wood: 1 }, line: 'Every stone came with a free leaf on top.' },
    { id: 'leaves', name: 'Pressed maple leaves', mats: { petal: 3, wood: 0.5 }, line: 'The reddest ones were hiding under the tea bushes.' },
    { id: 'honey', name: 'Honey from the hollow oaks', mats: { wood: 2, petal: 1 }, pantry: ['honey'], line: 'The bees were busy. We were busier. Mostly.' },
    { id: 'charms', name: 'Lost charms on the shrine steps', mats: { lantern: 1, bone: 1, stone: 1 }, line: 'Each charm had a wish on it. We put them back.' },
  ],
  tidepool: [
    { id: 'seaglass', name: 'Sea-glass hunt at low tide', mats: { crystal: 3, stone: 1 }, line: 'The tide went out and left its pockets full.' },
    { id: 'driftwood', name: 'Driftwood along the point', mats: { wood: 3, stone: 0.5 }, line: 'Some of it was shaped like a fish. Some of it was a fish.' },
    { id: 'nets', name: 'Net scraps from the old wreck', mats: { silk: 2, wood: 1 }, pantry: ['seaweed'], line: 'The wreck creaked a lot, but it never said anything mean.' },
    { id: 'floats', name: 'Glass floats in the shallows', mats: { lantern: 1, crystal: 1 }, line: 'They bob about like tiny moons.' },
  ],
  onsen: [
    { id: 'icecrystals', name: 'Ice crystals by the frozen falls', mats: { crystal: 3, stone: 0.5 }, line: 'They sing a little when the sun hits them.' },
    { id: 'snowlanterns', name: 'Snow lanterns on the slope', mats: { lantern: 2, stone: 1 }, line: 'The snowmen did not want to share. We built them friends.' },
    { id: 'pines', name: 'Snowy pine branches', mats: { wood: 3, stone: 1 }, pantry: ['shiitake'], line: 'Every branch dropped its snow on somebody. Mostly on Shadow.' },
    { id: 'sinter', name: 'Spring sinter by the hot springs', mats: { stone: 3, crystal: 0.5 }, pantry: ['honey'], line: 'We may have had a short soak. For science.' },
  ],
};

// ------------------------------------------------------------------ the siege reliefs (COZY §3.2)
// gates (data: CZ-9 retunes them): Takemori needs the Guild built, a crew of two, or one hero with packed lunches (the
// first relief must be reachable by a cozy player with only Moka benched: the Guild is phase D's, and Poe joins in
// Takemori's own zone; the director's call, 2026-10-08); the others the village's rank and the Guild's level
export const RELIEFS = {
  bamboo: { captain: 'Captain Galeclaw', specialty: 'silk', gates: [{ kind: 'any', label: 'The Guild built, a crew of 2, or packed lunches', any: [{ kind: 'guild', n: 1 }, { kind: 'crew', n: 2 }, { kind: 'lunches' }] }] },
  maple: { captain: 'Captain Strawgrin', specialty: 'petal', gates: [{ kind: 'rank', n: 3 }] },
  tidepool: { captain: 'Captain Brineclaw', specialty: 'crystal', gates: [{ kind: 'rank', n: 3 }, { kind: 'guild', n: 2 }] },
  onsen: { captain: 'Captain Frostbelly', specialty: 'lantern', gates: [{ kind: 'guild', n: 3 }] },
};
const zoneBand = zone => REGIONS[zone]?.levels || [1, 10];
function reliefObjective(zone) {
  const V = VILLAGES[zone], R = RELIEFS[zone], reg = REGIONS[zone]; if (!V || !R || !reg) return null;
  const level = zoneBand(zone)[0] + 2, camps = V.camps.length || 3, fodder = V.camps.reduce((a, c) => a + (c.n || 5), 0);
  return {
    id: `relief:${zone}`, kind: 'siege', story: true, name: `Relieve ${V.name.replace(/ (Village|Hamlet|Port|Spa Village)$/, '')}`, jp: V.jp,
    desc: `Yokai camps ring ${V.name} and ${R.captain} holds the square. A crew can break the camps, open the cages and drive the captain off.`,
    place: { area: zone, zone, label: `${V.name}, ${reg.name}`, jp: V.jp, color: reg.color },
    level, power: level * KIND_FACTOR.siege, hours: 6, camps,
    gates: R.gates, supplies: { meals: 1, potions: 3 },
    binds: { village: zone }, captain: R.captain,
    rewards: { kills: fodder + 30, coins: [Math.round(0.6 * (fodder * (3 + level) + 60 + 10 * level)), Math.round(0.6 * (fodder * (4 + level) + 80 + 12 * level))], items: ['magic', 'rare'],
      mats: { n: [10, 20], pool: { [R.specialty]: 3, wood: 2, stone: 2, bone: 1 } }, trophy: null },
    tags: ['siege', 'story'],
  };
}

// ------------------------------------------------------------------ errands
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** the areas errands go to today: Blossom Hollow's outskirts and the Burrow from day 1, and every saved zone */
export function openAreas(state) {
  const out = ['home', 'burrow'];
  for (const z of ZONE_ORDER) if (state.zones?.[z]?.village === 'saved') out.push(z);
  return out;
}
/** the 3 errands an area offers on a world day (seeded: the same three all day) → errand ids */
export function errandIds(area, day) {
  const T = ERRANDS[area]; if (!T) return [];
  const r = mulberry32(hashStr(`${area}:${day}`)), pool = T.map(t => t.id), out = [], n = Math.min(3, pool.length);
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out.map(t => `errand:${day}:${area}:${t}`);
}
function errandObjective(id) {
  const [, d, area, tid] = id.split(':'), day = +d;
  const A = areaInfo(area), t = ERRANDS[area]?.find(x => x.id === tid);
  if (!A || !t || !(day >= 0)) return null;
  const r = mulberry32(hashStr(id)), level = A.level, hours = r() < 0.5 ? 2 : 3;
  return {
    id, kind: 'errand', story: false, name: t.name, jp: A.jp, desc: t.line, day,
    place: { area, zone: A.zone || null, label: A.label, jp: A.jp, color: A.color },
    level, power: level * KIND_FACTOR.errand, hours,
    gates: [], supplies: { meals: 0, potions: 0, mealSure: true }, binds: null,
    rewards: { kills: 15, coins: [4 + level * 3, 8 + level * 5], items: [], itemChance: { magic: 0.1 }, mats: { n: [6, 14].map(v => Math.round(v * (hours === 3 ? 1.2 : 1))), pool: t.mats },
      pantry: t.pantry ? { n: [1, 3], pool: t.pantry } : null, find: 0.08, findWhere: A.find },
    tags: ['errand'], line: t.line,
  };
}
/** today's errands for every open area → objectives */
export function errandsFor(state, day) {
  return openAreas(state).flatMap(a => errandIds(a, day)).map(errandObjective).filter(Boolean);
}

// ------------------------------------------------------------------ lookup
/** any objective by id (errands of any day included) → the objective, or null */
export function objective(state, id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('errand:')) return errandObjective(id);
  if (id.startsWith('relief:')) return reliefObjective(id.slice(7));
  return null;
}
/** is a siege relief on offer: the zone is open and its village still besieged */
export function reliefOpen(state, zone) {
  if (!VILLAGES[zone]?.ready || !RELIEFS[zone]) return false;
  if (zoneOf(state, zone).village === 'saved') return false;
  return regionUnlocked(state, zone).ok;
}
/** the story's crew routes on offer now → objectives (phase A: the siege reliefs in STORY_READY) */
export function storyObjectives(state) {
  return ZONE_ORDER.filter(z => STORY_READY.has(`relief:${z}`) && reliefOpen(state, z)).map(reliefObjective).filter(Boolean);
}
/** is the objective still on offer (for an expedition being sent, or one saved mid-trip) */
export function objectiveOpen(state, o) {
  if (!o) return false;
  if (o.kind === 'siege') return reliefOpen(state, o.binds.village);
  return true;
}
/** camps of a siege still standing (zones[z].siegeCamps; a fresh zone: all of them) */
export function campsStanding(state, zone) {
  const V = VILLAGES[zone]; if (!V) return 0;
  const Z = zoneOf(state, zone);
  if (Z.village === 'saved') return 0;
  return V.camps.filter(c => !Z.siegeCamps.find(s => s.id === c.id)?.cleared).length;
}
/** The need now: a siege counts only the camps still standing (each broken camp −25%; the captain is the last 25%); a
 *  dungeon a partial got to floor 2 of needs 30% less (CZ-9). → power */
export function objectivePower(state, o) {
  if (!o) return 0;
  let p = o.power;
  if (o.kind === 'siege') p *= 0.25 + 0.25 * Math.min(o.camps || 3, campsStanding(state, o.binds.village));
  const pr = state.cozy?.exp?.progress?.[o.id];
  if (o.kind === 'dungeon' && pr?.floor >= 2) p *= 0.7;
  return Math.max(1, Math.round(p));
}
