// Fishing data (docs/HOMESTEAD.md §3): where and when each fish bites, how hard it fights, how big it grows, and the
// Fish Log records. Pure data + helpers (node tests); the names, icons and prices live in pantry.js.
//
// state.fishing = { rod: 0 none | 1 Bamboo Rod | 2 Moonlit Rod, milestones: [5, ...] claimed, lastRecord? }
// state.fishLog = { [id]: { n, best, day, spot, time } } (household, lazy-init)
import { PANTRY } from './pantry.js';

export const SPOTS = {
  pond: { name: 'Koi Pond', jp: '鯉の池' },
  river: { name: 'River', jp: '川' },
  sea: { name: 'Seaside', jp: '海辺' },
  bamboo: { name: 'Bamboo Creeks', jp: '竹の小川' },
  maple: { name: 'Maple Ponds', jp: '紅葉の池' },
  tidepool: { name: 'Tide Pools', jp: '潮だまり' },
  onsen: { name: 'Frozen Pond', jp: '氷の池' }, // (Yukimi Onsen's water is ice or hot springs: you fish through a hole in the ice)
};
export const TIMES = { day: 'Day (6–17)', evening: 'Evening (17–21)', night: 'Night (21–6)' };
export const timeOf = h => (h >= 6 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'night');
const ALL = ['day', 'evening', 'night'];

// d: how hard it fights (0..1: its speed and darts, and a slightly smaller zone); it rises with the rarity (R-12: common
// 0.15-0.32, uncommon 0.4-0.55, rare 0.64-0.68, the legendary Moon Koi 0.72), so the Fish Log's rare fish are the
// hard ones. beh: 'smooth' | 'darter' | 'sinker' (likes the bottom) | 'floater'
// spots: { spot: weight } or { spot: [weight, [times]] } for a spot with its own hours; size: [min, max] cm
export const FISH = {
  crucian: { spots: { pond: 10, maple: 6, bamboo: 4, onsen: 3 }, times: ALL, d: 0.15, beh: 'smooth', size: [12, 30] },
  koi: { spots: { pond: 6 }, times: ['day', 'evening'], d: 0.4, beh: 'smooth', size: [30, 70] },
  goldKoi: { spots: { pond: 1.4 }, times: ['night'], d: 0.68, beh: 'floater', size: [40, 80] },
  moonKoi: { spots: { pond: 0.22 }, times: ['night'], d: 0.72, beh: 'darter', size: [60, 100] },
  ayu: { spots: { river: 8, bamboo: 7 }, times: ['day'], d: 0.28, beh: 'darter', size: [12, 26] },
  trout: { spots: { river: 6, bamboo: 5 }, times: ['day', 'evening'], d: 0.42, beh: 'smooth', size: [18, 38] },
  char: { spots: { river: 3, onsen: [5, ALL] }, times: ['evening', 'night'], d: 0.46, beh: 'smooth', size: [20, 48] },
  loach: { spots: { pond: 5, maple: 7 }, times: ['day', 'evening'], d: 0.2, beh: 'sinker', size: [8, 18] },
  rainbowTrout: { spots: { maple: 5, river: 1 }, times: ALL, d: 0.52, beh: 'darter', size: [25, 58] },
  salmon: { spots: { onsen: 6, river: [0.7, ['evening']] }, times: ALL, d: 0.55, beh: 'smooth', size: [50, 95] },
  seaBream: { spots: { sea: 4, tidepool: 3 }, times: ['day'], d: 0.48, beh: 'smooth', size: [25, 62] },
  mackerel: { spots: { sea: 8 }, times: ALL, d: 0.32, beh: 'darter', size: [25, 46] },
  flounder: { spots: { sea: 5, tidepool: 5 }, times: ['day', 'evening'], d: 0.25, beh: 'sinker', size: [20, 48] },
  octopus: { spots: { sea: 2.5, tidepool: 4 }, times: ['evening', 'night'], d: 0.5, beh: 'sinker', size: [30, 85] },
  pufferfish: { spots: { tidepool: 6, sea: [0.8, ['night']] }, times: ALL, d: 0.64, beh: 'floater', size: [10, 32] },
};
export const FISH_IDS = Object.keys(FISH);

// the rods and Settings › Fishing (R-12, measured with tools/fishing-sim.mjs): zone: the catch zone's height; drain: how
// fast the meter empties (×); window: the bite's (s). Relaxed: the zone ×1.2, half the drain, the window ×1.5.
export const RODS = { 1: { zone: 0.32, drain: 1, window: 1.0 }, 2: { zone: 0.38, drain: 0.8, window: 1.15 } };
export const RELAXED = { zone: 1.2, drain: 0.5, window: 1.5 };
/** the reel and bite numbers for a rod (1 Bamboo, 2 Moonlit) → { zone, drain, window, relaxed } */
export function reelParams(rod = 1, { relaxed = false } = {}) {
  const r = RODS[Math.min(2, Math.max(1, rod | 0))], k = relaxed ? RELAXED : { zone: 1, drain: 1, window: 1 };
  return { zone: Math.round(r.zone * k.zone * 1000) / 1000, drain: Math.round(r.drain * k.drain * 1000) / 1000, window: Math.round(r.window * k.window * 100) / 100, relaxed: !!relaxed };
}

/** Fish that can bite at this spot and hour → [{ id, w }] (the Moonlit Rod makes rare fish a little likelier). */
export function biters(spot, hour, rod = 1) {
  const t = timeOf(hour), out = [];
  for (const [id, f] of Object.entries(FISH)) {
    const s = f.spots[spot]; if (s == null) continue;
    const [w, times] = Array.isArray(s) ? s : [s, f.times];
    if (!times.includes(t)) continue;
    out.push({ id, w: w * (rod >= 2 && (PANTRY[id]?.rare || 0) >= 2 ? 1.6 : 1) });
  }
  return out;
}
/** Roll the fish that bites. rng: () => [0, 1). */
export function rollFish(spot, hour, rod = 1, rng = Math.random) {
  const list = biters(spot, hour, rod); if (!list.length) return null;
  let x = rng() * list.reduce((a, e) => a + e.w, 0);
  for (const e of list) { x -= e.w; if (x <= 0) return e.id; }
  return list[list.length - 1].id;
}
/** Its size in cm (one decimal): mostly small-to-middling, now and then a whopper. */
export function rollSize(id, rng = Math.random) {
  const [a, b] = FISH[id].size, k = rng() < 0.04 ? 0.92 + rng() * 0.08 : Math.pow(rng(), 1.6) * 0.95;
  return Math.round((a + (b - a) * k) * 10) / 10;
}

// ------------------------------------------------------------------ the Fish Log
export const fishLogOf = st => (st.fishLog ||= {});
export const fishingOf = st => { const f = st.fishing ||= { rod: 0 }; f.milestones ||= []; return f; };
export const MILESTONES = [5, 10, 15];
/** Record a catch → { first, record, species (count after), milestone (newly reached) | null } */
export function recordCatch(st, id, size, { spot = null, hour = 12, day = 1 } = {}) {
  const L = fishLogOf(st), e = L[id], first = !e;
  const before = Object.keys(L).length;
  const rec = L[id] = e || { n: 0, best: 0, day, spot, time: timeOf(hour) };
  rec.n++;
  const record = !first && size > rec.best;
  if (size > rec.best) rec.best = size;
  const species = Object.keys(L).length;
  const milestone = MILESTONES.find(m => before < m && species >= m) || null;
  return { first, record, species, milestone };
}
/** Where and when a fish bites, in words (the Fish Log hints). */
export function fishHabits(id) {
  const f = FISH[id];
  return Object.entries(f.spots).map(([s, v]) => { const times = Array.isArray(v) ? v[1] : f.times; return `${SPOTS[s].name}${times.length === 3 ? '' : ` (${times.join(', ')})`}`; });
}
