// Quest moments: the words and the places (ROADMAP UX-2; docs/QUESTS.md). Pure: no three.js, no DOM (node-tested in
// tools/test-rpg.mjs "QUEST MOMENTS"). world/questMoments.js runs the moments with these; ui/questCard.js draws the card.
//
//   goalOf(d)            → [action, place]: the card's goal line ("Find King Mochi", "the Mossy Burrow, floor 2"), from
//                          the quest's own `goal` field, else made from its main step
//   rewardList(r)        → [{ k, id?, n? }]: the card's reward icons, in order
//   stepArea(s, o)       → { key, kind, … } | null: the area a step's objective is in ('dun:<id>:<floor>', 'dun:<id>' any
//                          floor, 'dun:burrow' any den, 'zone:<id>', 'district:<id>', 'giver:<npc>' (a Blossom Hollow
//                          villager, wherever they are now), 'room:<owner>'); the place title fires on entering it (once
//                          per step and area), and Shadow's 'arrive' line with it
//   areasHere(w)         → the keys of the area you are in (w = { mode, dungeon, floor, zone, district, givers, room })
//   handInText(d, name)  → the hand-in step's line ("Bring the news to Rosie", or the quest's own handIn.text)
//   lineFor(d, q, s, beat, ctx) → Shadow's line for a beat at a step's place (the quest's own `lines`, else the step
//                          type's template), with {giver}, {npc}, {item}, {boss} filled; null when he has none
//   districtAt(x, z)     → the Blossom Hollow district at a spot ('market', 'pond', …) or null
//   npcDistrict(id)      → a Blossom Hollow villager's district (their anchor: layout.js ANCHORS; Rosie's bakery)
//   bare(text)           → a step's text without its trailing "(Bamboo Depths, floor 1)" (the place title says where)
import { destOf } from './questSteps.js';
import { DUNGEONS, BURROW, isBurrow } from '../dungeon/defs.js';
import { DISTRICTS, PLOTS } from './plots.js';
import { ANCHORS, LANDMARKS, PLAZA, POND, HILL, squareDist } from './layout.js';
import { ZONE_NPCS } from '../regions/village/data.js';

/** a step's text without a trailing parenthetical place */
export const bare = t => String(t || '').replace(/\s*\([^()]*\)\s*$/, '').trim();

// ------------------------------------------------------------------ the card's goal and rewards
/** the place words for a step's destination (questSteps.js destOf) */
export function placeWords(dest, zoneName = z => z) {
  if (!dest) return '';
  if (dest.dungeon === BURROW) return 'the Burrow on Shrine Hill';
  const D = dest.dungeon && DUNGEONS[dest.dungeon];
  if (D) { const n = /^\S+'s /.test(D.name) ? D.name : `the ${D.name}`; return dest.floor ? `${n}, floor ${dest.floor}` : n; }
  if (dest.zone) return zoneName(dest.zone);
  if (dest.home) return 'Blossom Hollow';
  return '';
}
/** the card's goal: [action, place]. A quest may write its own (`goal: ['Find King Mochi', 'the Mossy Burrow, floor 2']`);
 *  otherwise its main step (the last that isn't the turn-in talk) says what, and where it is says where. */
export function goalOf(d, { zoneName, npcName = id => id } = {}) {
  if (!d) return ['', ''];
  if (Array.isArray(d.goal)) return [d.goal[0] || '', d.goal[1] || ''];
  if (typeof d.goal === 'string') return [d.goal, ''];
  const steps = d.steps || [];
  const main = [...steps].reverse().find(s => s.type !== 'talk') || steps[0];
  if (!main) return [d.title || '', ''];
  if (main.type === 'deliver' || main.type === 'decorate') return [bare(main.text), main.npc ? (main.type === 'decorate' ? `${npcName(main.npc)}'s home` : npcName(main.npc)) : ''];
  return [bare(main.text), placeWords(destOf(main), zoneName)];
}
/** the reward as a list for the card's icons: coins, xp, skill points, the treasure, materials, potions, pantry goods,
 *  a recipe, furniture, a workbench recipe, friendship */
export function rewardList(r = {}) {
  const out = [];
  if (r.coins) out.push({ k: 'coins', n: r.coins });
  if (r.xp) out.push({ k: 'xp', n: r.xp });
  if (r.skillPts) out.push({ k: 'skill', n: r.skillPts });
  if (r.unique) out.push({ k: 'unique' });
  for (const id in r.mats || {}) out.push({ k: 'mat', id, n: r.mats[id] });
  for (const id in r.potions || {}) out.push({ k: 'potion', id, n: r.potions[id] });
  for (const id in r.pantry || {}) out.push({ k: 'pantry', id, n: r.pantry[id] });
  if (r.recipe) out.push({ k: 'recipe', id: r.recipe });
  if (r.furniture) out.push({ k: 'furniture', id: r.furniture });
  if (r.craft) out.push({ k: 'craft', id: r.craft });
  if (r.hearts) out.push({ k: 'hearts', n: r.hearts });
  return out;
}

// ------------------------------------------------------------------ Blossom Hollow's districts
// a few landmarks that sit between the districts' lots, as the district they belong to (the plaza is the Civic Core's,
// the koi pond Pond Park's, the shrine hill Shrine Hill's)
const LANDMARK_DISTRICT = [
  { district: 'core', d: (x, z) => squareDist(PLAZA, x, z) - 4 },
  { district: 'pond', d: (x, z) => Math.hypot(x - POND.x, z - POND.z) - POND.r - 8 },
  { district: 'shrine', d: (x, z) => Math.hypot((x - HILL.x) / 0.9, z - HILL.z) - HILL.foot * 0.8 },
];
/** the district at a spot: a landmark's, else the nearest lot's within 16 m, else the nearest district label within 30 m */
export function districtAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let best = null, bd = 0;
  for (const L of LANDMARK_DISTRICT) { const d = L.d(x, z); if (d < bd) { bd = d; best = L.district; } }
  if (best) return best;
  bd = 16;
  for (const p of PLOTS) { const dx = Math.max(p.x - x, 0, x - (p.x + p.w)), dz = Math.max(p.z - z, 0, z - (p.z + p.d)), d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = p.district; } }
  if (best) return best;
  bd = 30;
  for (const [k, D] of Object.entries(DISTRICTS)) { const d = Math.hypot(D.label[0] - x, D.label[1] - z); if (d < bd) { bd = d; best = k; } }
  return best;
}
export const districtName = k => DISTRICTS[k]?.name || '';
/** a Blossom Hollow villager's district: where their day is anchored (Rosie: her bakery) */
export function npcDistrict(id) {
  const a = id === 'rosie' ? LANDMARKS.rosieShop : ANCHORS[id];
  return a ? districtAt(a.x, a.z) : null;
}

// ------------------------------------------------------------------ areas (the place title, Shadow's lines)
/** The area a step's objective is in, or null (nothing to arrive at: build, grow, cook, a request). A floor step's area
 *  is its den as a whole (floor 1 is the way to floor 2, and arriving on floor 2 completes it); a boss's is its floor;
 *  a turn-in talk's is the giver's village (a zone villager's zone, a Blossom Hollow villager's district). */
export function stepArea(s, { request = false } = {}) {
  if (!s || request) return null;
  if (s.type === 'talk' || s.type === 'deliver') {
    const z = ZONE_NPCS[s.npc]?.zone; if (z) return { key: `zone:${z}`, kind: 'zone', zone: z };
    return s.npc ? { key: `giver:${s.npc}`, kind: 'giver', npc: s.npc } : null; // (a Blossom Hollow villager: where they are now, world/questMoments.js here)
  }
  if (s.type === 'decorate') return s.npc ? { key: `room:${s.npc}`, kind: 'room', owner: s.npc } : null;
  if (s.type === 'reach' && (!s.at || s.at === 'home')) { const di = districtAt(s.x, s.z); return di ? { key: `district:${di}`, kind: 'district', district: di } : null; }
  const dest = destOf(s); if (!dest) return null;
  if (dest.dungeon) {
    const id = dest.dungeon, any = s.type === 'floor' || s.type === 'dungeonFloor' || !dest.floor;
    return any ? { key: `dun:${id}`, kind: 'dungeon', dungeon: id } : { key: `dun:${id}:${dest.floor}`, kind: 'dungeon', dungeon: id, floor: dest.floor };
  }
  if (dest.zone) return { key: `zone:${dest.zone}`, kind: 'zone', zone: dest.zone };
  return null;
}
/** the keys of where you are: w = { mode: 'village' | 'dungeon' | 'region' | 'interior', dungeon, floor, zone, district,
 *  room } */
export function areasHere(w = {}) {
  if (w.mode === 'dungeon' && w.dungeon) {
    const out = [`dun:${w.dungeon}:${w.floor || 1}`, `dun:${w.dungeon}`];
    if (isBurrow(w.dungeon)) out.push(`dun:${BURROW}`);
    return out;
  }
  if (w.mode === 'region' && w.zone) return [`zone:${w.zone}`];
  if (w.mode === 'village') return [...(w.district ? [`district:${w.district}`] : []), ...(w.givers || []).map(id => `giver:${id}`)]; // (givers: the villagers you're with: within a few metres of them, or in the district they're in now)
  if (w.mode === 'interior' && w.room) return [`room:${w.room}`];
  return [];
}

// ------------------------------------------------------------------ the hand-in (docs/QUESTS.md §4)
/** the hand-in step's words: the quest's own (`handIn: { text }`), else "Bring the news to <giver>" */
export const handInText = (d, name) => d?.handIn?.text || `Bring the news to ${name}`;

// ------------------------------------------------------------------ Shadow's lines (docs/QUESTS.md §2)
/** The beats, in the order a trip meets them:
 *   door    at the dungeon's way in, with the step's dungeon ahead (the Burrow door, a zone's dungeon gate)
 *   arrive  on entering the step's area (with its place title, just after it)
 *   near    by a find's or a rescue's mark on its floor
 *   boss    in sight of the boss, before the fight
 *   home    the objective done, on the way back to the giver (not for a crew's finish: they did it)
 * A quest writes its own as `lines: { door, arrive, near, boss, home }`; any of them may be a list by step index
 * (`arrive: ['floor 1's line', "the boss floor's line"]`). The rest come from these, by the step's type. */
export const LINE_TEMPLATES = {
  door: { any: "Sniff sniff… something's down there. Stay close, okay?" },
  arrive: {
    kill: "Yokai everywhere! Let's shoo them out for {giver}.",
    collect: "Mochi Jelly wobbles when the squishy ones bounce. Let's find some!",
    find: "Sniff… I can smell {item} on this floor!",
    rescue: "{npc} is on this floor! I can smell them. This way!",
    floor: "The stairs down are somewhere on this floor. Down we go!",
    dungeonFloor: "The stairs down are somewhere on this floor. Down we go!",
    boss: "Something big is snoring on this floor… Ears up!",
    tier: "Spooky lanterns tonight… Stay close, okay?",
    reach: "Nearly there! It's just ahead.",
    talk: "I can smell {npc} from here! They're close.",
    villageSaved: "The village is just up the trail. Let's help them!",
    any: "We're here! Let's do this.",
  },
  near: { find: "There! I can see {item}!", rescue: "{npc} is right over there! Let's get that cage open!", any: "It's right here!" },
  boss: { any: "{boss} is just ahead! Ready when you are." },
  home: { any: "{giver}'s going to be so happy! Let's go and share the news." },
};
export const LINE_BEATS = Object.keys(LINE_TEMPLATES);
const fill = (t, ctx = {}) => String(t).replace(/\{(\w+)\}/g, (m, k) => ctx[k] ?? m);
/** Shadow's line for a beat at step s of quest d (record q): its own, else the template; null when there's none */
export function lineFor(d, q, s, beat, ctx = {}) {
  if (!d || !beat) return null;
  let own = d.lines?.[beat];
  if (Array.isArray(own)) own = own[q?.step ?? 0];
  else if (own && typeof own === 'object') own = own[q?.step ?? 0];
  const T = LINE_TEMPLATES[beat] || {};
  const t = own || (s ? T[s.type] : null) || T.any || null;
  return t ? fill(t, ctx) : null;
}
