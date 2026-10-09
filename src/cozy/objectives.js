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
//   storyObjectives(state)   the story's crew routes on offer now (COZY §3: the Burrow quests' fights, the four siege
//                            reliefs, the zone dungeons' first clears)
//   errandsFor(state, day)   today's errands: 3 per open area, seeded by the world day
//   objectivePower(state, o) the need now (a siege counts only the camps still standing; a quest only the fight that's
//                            left; a dungeon a partial (or you) got to floor 2 of: 30% less)
//
// The story side (COZY §12): G.story.crewObjectives(state) is what the Board lists under Story (world/story.js sets it
// to storyObjectives); a quest objective binds { quest } (Story.crewResult completes its fight steps), a relief
// { village }, a dungeon clear { dungeon: zone } (cozy/expeditionRun.js crewClear).
import { mulberry32 } from '../core/util.js';
import { VILLAGES } from '../regions/village/data.js';
import { REGIONS, regionUnlocked } from '../regions/index.js';
import { zoneOf } from '../rpg/zones.js';
import { ZONE_ORDER } from '../rpg/zoneProgress.js';
import { DUNGEONS, ZONE_DUNGEON } from '../dungeon/defs.js';
import { ZONE_QUESTS, questItemName } from '../world/zoneQuests.js';
import { ZONE_NPCS } from '../regions/village/data.js';

/** an objective's power = its level × its kind's factor (COZY §4.2) */
export const KIND_FACTOR = { errand: 6, quest: 9, burrowBoss: 12, siege: 14, dungeon: 18 };
/** the siege reliefs the Board offers (phase A offered Takemori only; CZ-9 opens all four) */
export const STORY_READY = new Set(['relief:bamboo', 'relief:maple', 'relief:tidepool', 'relief:onsen']);
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
    { id: 'patrol', name: 'Burrow patrol: floors {lo}–{hi}', mats: { bone: 3, mochi: 2 }, line: 'The mochi slimes were mostly bluffing.' },
    { id: 'mushrooms', name: 'A mushroom hunt on floor {mid}', mats: { mochi: 2, petal: 1 }, pantry: ['shiitake'], line: 'The kinoko were very rude. The shiitake were delicious.' },
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
// trophy: the captain's torn banner (home/furniture.js, a wall piece: COZY §4.6)
export const RELIEFS = {
  bamboo: { captain: 'Captain Galeclaw', specialty: 'silk', trophy: 'bannerGaleclaw', gates: [{ kind: 'any', label: 'The Guild built, a crew of 2, or packed lunches', any: [{ kind: 'guild', n: 1 }, { kind: 'crew', n: 2 }, { kind: 'lunches' }] }] },
  maple: { captain: 'Captain Strawgrin', specialty: 'petal', trophy: 'bannerStrawgrin', gates: [{ kind: 'rank', n: 3 }] },
  tidepool: { captain: 'Captain Brineclaw', specialty: 'crystal', trophy: 'bannerBrineclaw', gates: [{ kind: 'rank', n: 3 }, { kind: 'guild', n: 2 }] },
  onsen: { captain: 'Captain Frostbelly', specialty: 'lantern', trophy: 'bannerFrostbelly', gates: [{ kind: 'guild', n: 3 }] },
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
      mats: { n: [10, 20], pool: { [R.specialty]: 3, wood: 2, stone: 2, bone: 1 } }, trophy: R.trophy || null },
    tags: ['siege', 'story'],
  };
}

// ------------------------------------------------------------------ the Blossom Hollow story's fights (COZY §3.1)
// One crew route per quest whose steps need a fight. The quest data (world/story.js QUESTS) is untouched: the route
// names the quest; a crew that brings it home completes its fight steps (Story.crewResult). floor: the Burrow floor it's
// set on (its level); power: an explicit need (burrow1: Moka L1 alone with Rosie's lunch is good odds); trophy: the
// boss's keepsake (home/furniture.js); boss: whose quest unique waits for your own first win (Story owes it).
const FLOOR_BOSS = [{ type: 'floor' }, { type: 'boss' }];
const BURROW_PLACE = { area: 'burrow', zone: null, jp: '巣穴', color: '#c9925a' };
export const BURROW_ROUTES = {
  burrow1: { name: 'Peek into the Burrow', title: 'Something Squishy', giver: 'rosie', floor: 2, power: 12, hours: 2, kind: 'quest', freeLunch: true, mochi: 3, gates: [], trophy: null, boss: null, steps: [{ type: 'kill', n: 8 }, { type: 'collect', mat: 'mochi', n: 3 }],
    desc: 'Strange squeaks from the Burrow on the shrine hill. A friend can take a peek for you (Rosie packs the lunch), and bring back the Mochi Jelly she wants.' },
  king: { name: 'The King of Squish', title: 'The King of Squish', giver: 'rosie', floor: 5, hours: 6, kind: 'burrowBoss', steps: FLOOR_BOSS, gates: [{ kind: 'quest', id: 'homes', label: 'A Home for Everyone done (9 homes)' }], trophy: 'trophyMochiCrown', boss: 'mochiKing',
    desc: 'A giant mochi with a crown is hogging floor 5. A crew can go down, deflate his ego and bring his crown cushion home.' },
  umbrella: { name: 'Umbrella Trouble', title: 'Umbrella Trouble', giver: 'rosie', floor: 10, hours: 6, kind: 'burrowBoss', steps: FLOOR_BOSS, gates: [{ kind: 'built', type: 'shrine', label: 'A Blossom Shrine built' }], trophy: 'trophyKasaStand', boss: 'kasaLord',
    desc: 'Umbrellas keep hopping out of the Burrow at night. Their lord, Karakasa, waits on floor 10. A crew can fold him up.' },
  oni: { name: "Oni's Kitchen Nightmare", title: "Oni's Kitchen Nightmare", giver: 'rosie', floor: 15, hours: 8, kind: 'burrowBoss', steps: FLOOR_BOSS, gates: [{ kind: 'built', type: 'onsen', label: 'A Hot Spring built' }, { kind: 'pop', n: 30 }], trophy: 'trophyOniCleaver', boss: 'oniChef',
    desc: 'Someone is stealing all the dumplings. The trail leads to Gorobei\'s kitchen on floor 15. A crew can take his cleaver away.' },
  tails: { name: 'Nine Tails of Moonlight', title: 'Nine Tails of Moonlight', giver: 'kitsune', floor: 20, hours: 10, kind: 'burrowBoss', steps: FLOOR_BOSS, gates: [{ kind: 'guild', n: 2 }, { kind: 'rank', n: 4 }], trophy: 'trophyMoonLantern', boss: 'nineTails', deep: true,
    desc: 'The old fox spirit Tamamo stirs on floor 20. A patient crew can calm her, and her moon lantern will wake the Spirit Lantern by the Burrow door.' },
};
/** the steps of a quest a crew can do: the fights (and burrow1's Mochi Jelly, which they bring home) */
export const CREW_STEP_TYPES = new Set(['kill', 'floor', 'boss', 'collect']);
const killsOfFloor = f => Math.round(0.6 * (f * 10 + 20)); // (~60% of a hands-on run down to the boss, COZY §4.6)
function burrowObjective(state, qid) {
  const B = BURROW_ROUTES[qid]; if (!B) return null;
  const level = B.floor, kind = B.kind, power = B.power || level * KIND_FACTOR[kind];
  const boss = kind === 'burrowBoss';
  return {
    id: `quest:${qid}`, kind, story: true, name: B.name, jp: '巣穴', desc: B.desc, quest: qid, questTitle: B.title, giver: B.giver,
    place: { ...BURROW_PLACE, label: `The Burrow, floor ${B.floor}` },
    level, power, hours: B.hours,
    gates: B.gates, supplies: boss ? { meals: 1, potions: 3 } : { meals: 0, potions: 0, freeLunch: !!B.freeLunch },
    binds: { quest: qid }, boss: B.boss, deep: !!B.deep,
    rewards: boss
      ? { kills: killsOfFloor(B.floor), coins: [Math.round(0.6 * (40 + 30 * level)), Math.round(0.6 * (60 + 40 * level))], items: ['magic', 'magic', 'rare'],
        mats: { n: [16, 30], pool: { bone: 3, mochi: 2, wood: 1, stone: 1, ...(level >= 10 ? { silk: 1 } : {}), ...(level >= 15 ? { crystal: 1 } : {}), ...(level >= 20 ? { lantern: 1 } : {}) } }, trophy: B.trophy }
      : { kills: 10, coins: [12, 24], items: [], itemChance: { magic: 0.15 }, mats: { n: [3, 6], pool: { bone: 2, petal: 1, wood: 1 } }, mochi: B.mochi || 0 },
    tags: boss ? ['story', 'burrow', 'dungeon'] : ['story', 'burrow'],
  };
}
/** the quest record of an active story quest, or null */
const activeQuest = (state, id) => (state.quests?.active || []).find(q => q.id === id) || null;
/** the current step of an active quest whose route a crew can take (its def's steps passed in: world/story.js QUESTS) */
export function questRouteStep(state, qid, steps = BURROW_ROUTES[qid]?.steps) {
  const q = activeQuest(state, qid); if (!q || !steps) return null;
  const s = steps[q.step]; if (!s || !CREW_STEP_TYPES.has(s.type)) return null;
  if (s.type === 'collect' && s.mat !== 'mochi') return null;
  return { q, s, i: q.step };
}

// ------------------------------------------------------------------ the zone dungeons' first clears (COZY §3.2)
// trophy: the boss's keepsake; the boss unique stays for your own first clear (dungeon/zoneRun.js)
export const DUNGEON_ROUTES = {
  bamboo: { trophy: 'trophyTenguFan', specialty: 'silk', gates: [{ kind: 'rank', n: 2 }] },
  maple: { trophy: 'trophyLeafJar', specialty: 'petal', gates: [{ kind: 'guild', n: 2 }] },
  tidepool: { trophy: 'trophySeaLantern', specialty: 'crystal', gates: [{ kind: 'rank', n: 4 }] },
  onsen: { trophy: 'trophyFrostMirror', specialty: 'lantern', gates: [{ kind: 'rank', n: 4 }, { kind: 'guild', n: 3 }] },
};
function dungeonObjective(zone) {
  const R = DUNGEON_ROUTES[zone], did = ZONE_DUNGEON[zone], D = DUNGEONS[did], reg = REGIONS[zone]; if (!R || !D || !reg) return null;
  const level = zoneBand(zone)[0] + 4;
  return {
    id: `dungeon:${zone}`, kind: 'dungeon', story: true, name: `Clear the ${D.name}`, jp: reg.jp,
    desc: `The yokai of ${reg.name} came up out of the ${D.name}. A strong crew can fight down both floors and drive its boss off: the way on opens, and the Spirit Lantern at its gate wakes.`,
    place: { area: zone, zone, dungeon: did, label: `The ${D.name}, ${reg.name}`, jp: reg.jp, color: reg.color },
    level, power: level * KIND_FACTOR.dungeon, hours: 10, gates: R.gates, supplies: { meals: 1, potions: 3, potionsNeed: 2 },
    binds: { dungeon: zone }, dungeonId: did,
    rewards: { kills: 50, coins: [Math.round(0.6 * (60 + 40 * level)), Math.round(0.6 * (90 + 55 * level))], items: ['magic', 'magic', 'rare'],
      mats: { n: [16, 30], pool: { [R.specialty]: 3, wood: 2, stone: 2, bone: 1 } }, trophy: R.trophy },
    tags: ['dungeon', 'story'],
  };
}
/** is a zone dungeon's crew route on offer: its village saved, never cleared by you or a crew */
export function dungeonRouteOpen(state, zone) {
  if (!DUNGEON_ROUTES[zone] || !ZONE_DUNGEON[zone]) return false;
  const Z = zoneOf(state, zone);
  if (Z.village !== 'saved' || Z.dungeon.cleared > 0 || Z.dungeon.crew > 0) return false;
  return regionUnlocked(state, zone).ok;
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
/** The Burrow's errands go as deep as the story has (CZ-9): the upper floors (level 4) until King Mochi is gone, then the
 *  floors under each Burrow boss beaten (by you or a crew): a crew levels on errands near its own level all along. */
export function burrowErrandLevel(state) {
  const done = new Set(state?.quests?.done || []), deepest = state?.dungeon?.deepest || 0;
  let f = 0; for (const [q, fl] of [['king', 5], ['umbrella', 10], ['oni', 15], ['tails', 20]]) if (done.has(q)) f = fl;
  return Math.max(AREAS.burrow.level, f + 2, Math.min(20, deepest - 1));
}
function errandObjective(id, state = null) {
  const [, d, area, tid] = id.split(':'), day = +d;
  const A = areaInfo(area), t = ERRANDS[area]?.find(x => x.id === tid);
  if (!A || !t || !(day >= 0)) return null;
  const r = mulberry32(hashStr(id)), level = area === 'burrow' ? burrowErrandLevel(state) : A.level, hours = r() < 0.5 ? 2 : 3;
  const name = t.name.replace('{lo}', Math.max(1, level - 3)).replace('{hi}', level).replace('{mid}', Math.max(1, level - 1));
  const label = area === 'burrow' && level > AREAS.burrow.level ? `The Burrow, floors ${Math.max(1, level - 3)}–${level}` : A.label;
  return {
    id, kind: 'errand', story: false, name, jp: A.jp, desc: t.line, day,
    place: { area, zone: A.zone || null, label, jp: A.jp, color: A.color },
    level, power: level * KIND_FACTOR.errand, hours,
    gates: [], supplies: { meals: 0, potions: 0, mealSure: true }, binds: null,
    rewards: { kills: 15, coins: [4 + level * 3, 8 + level * 5], items: [], itemChance: { magic: 0.1 }, mats: { n: [6, 14].map(v => Math.round(v * (hours === 3 ? 1.2 : 1))), pool: t.mats },
      pantry: t.pantry ? { n: [1, 3], pool: t.pantry } : null, find: 0.08, findWhere: A.find },
    tags: ['errand'], line: t.line,
  };
}
/** today's errands for every open area → objectives */
export function errandsFor(state, day) {
  return openAreas(state).flatMap(a => errandIds(a, day)).map(id => errandObjective(id, state)).filter(Boolean);
}

// ------------------------------------------------------------------ the zone villagers' quests (COZY §3.2)
// One crew route per step whose objective is in the zone dungeon: a kill count, a find, a rescue, a floor to reach, or
// the boss (when the dungeon's own first clear isn't on the Board: it covers the boss). The id names the step
// (zq:<quest>:<step>), so a step you finish first takes its route off the Board. The turn-in talk is always yours.
const ZQ_TYPES = new Set(['kill', 'find', 'rescue', 'dungeonFloor', 'boss']);
/** the current step of an active zone quest a crew can take → { q, s, i } | null */
export function zoneQuestStep(state, qid) {
  const Q = ZONE_QUESTS[qid], q = Q && activeQuest(state, qid); if (!q) return null;
  const s = Q.steps[q.step]; if (!s || !ZQ_TYPES.has(s.type)) return null;
  if (s.type === 'kill' && !s.dungeon) return null;
  if (s.type === 'boss' && dungeonRouteOpen(state, Q.zone)) return null; // (the dungeon's first clear is on the Board: it covers the boss)
  return { q, s, i: q.step };
}
const ZQ_MONSTER = { kamaitachi: 'Kamaitachi', kakashi: 'Kakashi', heikegani: 'Heike-gani', yukidaruma: 'Yuki-daruma' }; // (the zone quests' kill steps: their names as the steps say them)
const plural = (n, w) => (n === 1 ? w : /s$/.test(w) ? w : `${w}s`);
function zoneQuestObjective(state, qid, i) {
  const Q = ZONE_QUESTS[qid], s = Q?.steps?.[i]; if (!s || !ZQ_TYPES.has(s.type)) return null;
  const zone = Q.zone, reg = REGIONS[zone], did = s.dungeon || ZONE_DUNGEON[zone], D = DUNGEONS[did]; if (!reg || !D) return null;
  const level = zoneBand(zone)[0] + 3, boss = s.type === 'boss', giver = ZONE_NPCS[Q.giver]?.name || 'the village';
  const name = s.type === 'find' ? `Find ${s.n > 1 ? `${s.n} ` : ''}${s.n > 1 ? plural(s.n, questItemName(s.item)) : questItemName(s.item)}`
    : s.type === 'rescue' ? `Bring ${ZONE_NPCS[s.npc]?.name || 'them'} home`
    : s.type === 'kill' ? `Teach ${s.n} ${ZQ_MONSTER[s.monster] || 'yokai'} some manners`
    : s.type === 'dungeonFloor' ? `Scout floor ${s.n || 1} of the ${D.name}` : `Drive off the boss of the ${D.name}`;
  const kills = s.type === 'kill' ? s.n : s.type === 'dungeonFloor' ? 18 : boss ? 40 : 12;
  const pr = state.cozy?.exp?.progress?.[`zq:${qid}:${i}`];
  return {
    id: `zq:${qid}:${i}`, kind: boss ? 'dungeon' : 'quest', story: true, village: true, name, jp: reg.jp, quest: qid, questTitle: Q.title, giver: Q.giver,
    desc: `${Q.desc} ${giver} will want to hear it from you when they're back.`,
    place: { area: zone, zone, dungeon: did, label: `The ${D.name}${s.floor ? `, floor ${s.floor}` : ''}`, jp: reg.jp, color: reg.color },
    level: boss ? level + 1 : level, power: (boss ? level + 1 : level) * KIND_FACTOR[boss ? 'dungeon' : 'quest'], hours: boss ? 8 : 4,
    gates: [], supplies: { meals: 1, potions: 3 }, binds: { zq: qid, step: i }, step: s,
    trail: !!pr?.trail, // (a partial found the trail: the next try is a sure thing at r ≥ 0.9, COZY §4.3)
    rewards: { kills, coins: [Math.round(0.6 * (20 + 12 * level)), Math.round(0.6 * (30 + 18 * level))], items: boss ? ['magic', 'rare'] : ['magic'],
      mats: { n: [4, 8], pool: { [DUNGEON_ROUTES[zone]?.specialty || 'wood']: 2, wood: 1, stone: 1, bone: 1 } }, questItem: s.type === 'find' ? s.item : null, rescue: s.type === 'rescue' ? s.npc : null },
    tags: s.type === 'find' ? ['find', 'quest'] : s.type === 'rescue' ? ['rescue', 'quest'] : boss ? ['dungeon', 'quest'] : ['quest'],
  };
}
/** the village quests' crew routes on offer now (the Board's Village quests tab) → objectives */
export function villageObjectives(state) {
  const out = [];
  for (const q of state.quests?.active || []) { const at = ZONE_QUESTS[q.id] && zoneQuestStep(state, q.id); if (at) out.push(zoneQuestObjective(state, q.id, at.i)); }
  return out.filter(Boolean);
}

// ------------------------------------------------------------------ lookup
/** any objective by id (errands of any day included) → the objective, or null */
export function objective(state, id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('errand:')) return errandObjective(id, state);
  if (id.startsWith('relief:')) return reliefObjective(id.slice(7));
  if (id.startsWith('quest:')) return burrowObjective(state, id.slice(6));
  if (id.startsWith('dungeon:')) return dungeonObjective(id.slice(8));
  if (id.startsWith('zq:')) { const [, qid, i] = id.split(':'); return zoneQuestObjective(state, qid, +i); }
  return null;
}
/** is a siege relief on offer: the zone is open and its village still besieged */
export function reliefOpen(state, zone) {
  if (!VILLAGES[zone]?.ready || !RELIEFS[zone]) return false;
  if (zoneOf(state, zone).village === 'saved') return false;
  return regionUnlocked(state, zone).ok;
}
/** The story's crew routes on offer now → objectives: the Burrow quest being played (COZY §3.1), the besieged villages
 *  of the open zones, the saved zones' dungeons never cleared (§3.2) */
export function storyObjectives(state) {
  const out = [];
  for (const q of state.quests?.active || []) if (BURROW_ROUTES[q.id] && questRouteStep(state, q.id)) out.push(burrowObjective(state, q.id));
  for (const z of ZONE_ORDER) {
    if (STORY_READY.has(`relief:${z}`) && reliefOpen(state, z)) out.push(reliefObjective(z));
    if (dungeonRouteOpen(state, z)) out.push(dungeonObjective(z));
  }
  return out.filter(Boolean);
}
/** is the objective still on offer (for an expedition being sent, or one saved mid-trip) */
export function objectiveOpen(state, o) {
  if (!o) return false;
  if (o.kind === 'siege') return reliefOpen(state, o.binds.village);
  if (o.binds?.quest) return !!questRouteStep(state, o.binds.quest);
  if (o.binds?.dungeon) return dungeonRouteOpen(state, o.binds.dungeon);
  if (o.binds?.zq) { const at = zoneQuestStep(state, o.binds.zq); return !!at && at.i === o.binds.step; }
  return true;
}
/** camps of a siege still standing (zones[z].siegeCamps; a fresh zone: all of them) */
export function campsStanding(state, zone) {
  const V = VILLAGES[zone]; if (!V) return 0;
  const Z = zoneOf(state, zone);
  if (Z.village === 'saved') return 0;
  return V.camps.filter(c => !Z.siegeCamps.find(s => s.id === c.id)?.cleared).length;
}
/** How much of a quest route's fight is left (COZY §4.9: your progress counts): burrow1's kills still to make (its Mochi
 *  Jelly alone is a quarter), a Burrow boss once the floor is reached 70% → 0.25–1 */
export function questLeft(state, o) {
  const at = o?.binds?.quest && questRouteStep(state, o.binds.quest); if (!at) return 1;
  const { q, s, i } = at;
  if (s.type === 'kill') return Math.max(0.25, 1 - (q.prog || 0) / (s.n || 1));
  if (s.type === 'collect') return 0.25;
  if (s.type === 'boss' && i > 0) return 0.7;
  return 1;
}
/** The need now: a siege counts only the camps still standing (each broken camp −25%; the captain is the last 25%); a
 *  quest only the fight that's left; a dungeon a partial (or your own run) got to floor 2 of needs 30% less. → power */
export function objectivePower(state, o) {
  if (!o) return 0;
  let p = o.power;
  if (o.kind === 'siege') p *= 0.25 + 0.25 * Math.min(o.camps || 3, campsStanding(state, o.binds.village));
  if (o.binds?.quest) p *= questLeft(state, o);
  if (o.binds?.zq && o.step?.type === 'kill') { const q = activeQuest(state, o.binds.zq); if (q?.step === o.binds.step) p *= Math.max(0.25, 1 - (q.prog || 0) / (o.step.n || 1)); } // (your kills count)
  if (o.binds?.zq && o.step?.type === 'find') { const q = activeQuest(state, o.binds.zq); if (q?.step === o.binds.step) p *= Math.max(0.34, 1 - (q.prog || 0) / (o.step.n || 1)); } // (and the items you found)
  const pr = state.cozy?.exp?.progress?.[o.id];
  if (o.kind === 'dungeon' && (pr?.floor >= 2 || (o.binds?.dungeon && zoneOf(state, o.binds.dungeon).dungeon.bestFloor >= 2))) p *= 0.7;
  return Math.max(1, Math.round(p));
}
