// The Sightings board (docs/COZY.md §6.3; ROADMAP CZ-4). Pure (no three.js, no DOM): node-tested in tools/test-rpg.mjs
// "COZY: PEACEFUL".
//
// Three sightings a world day (the phase-A world clock: cozy/clock.js worldDay), rolled by the day's seed across the
// open zones' wild areas: each is a named pack in one wild area,
//   unique    "Old Kiba, a unique Kamaitachi, prowls the Kamaitachi Thicket" (a named unique and a few escorts)
//   champion  "Grumpy Momo's champion Kuri hold Old Root Hollow" (a champion pack under a named leader)
//   swarm     "A big swarm of Takenoko has gathered in the Fallen Shrine" (a lot of the zone's kind)
// It spawns in that area on that day's visits (RegionMode: a spawn tagged `wild`, `keep` and `sighting`), marked with a
// red pin on the minimap and a dot on the Travel Map card. Clearing it pays the bounty: coins (1.5 × what the pack
// itself would drop on average), the zone's materials, a gem at 25%, and Guild renown (cosmetic: a title).
//
//   state.cozy.sightings = { day, list: [sighting], renown, total }      (normalizeCozy keeps the shape)
//   sighting = { id, day, zone, area, areaName, kind, monster, monsterName, name, line, lvl, count, bounty: { coins,
//                mats: { key: n }, gem }, renown, done }
import { mulberry32 } from '../core/util.js';
import { titled } from './peaceful.js';

export const SIGHTINGS_A_DAY = 3;
export const GEM_P = 0.25;
/** each kind: its rank, pack size (before the kind's own pack multiplier) and renown */
export const KINDS = {
  unique: { rank: 'unique', count: [2, 3], renown: 3, label: 'Unique' },
  champion: { rank: 'champion', count: [3, 4], renown: 2, label: 'Champion pack' },
  swarm: { rank: 'normal', count: [10, 13], renown: 2, label: 'Big swarm' },
};
/** renown titles (the Guild card shows the title: phase D) */
export const TITLES = [[0, 'Wanderer'], [3, 'Yokai Spotter'], [10, 'Bounty Hunter'], [25, 'Wild Warden'], [50, 'Legend of the Wilds']];
export function renownTitle(n = 0) { let t = TITLES[0][1]; for (const [k, s] of TITLES) if (n >= k) t = s; return t; }
/** the next title and the renown it needs, or null at the top */
export function nextTitle(n = 0) { const t = TITLES.find(([k]) => k > n); return t ? { at: t[0], title: t[1] } : null; }
/** each zone's bounty materials (the first is the common one) */
export const ZONE_MATS = { bamboo: ['wood', 'silk', 'bone'], maple: ['wood', 'petal', 'mochi'], tidepool: ['stone', 'silk', 'crystal'], onsen: ['stone', 'crystal', 'lantern'] };
const NAME_A = ['Old', 'Big', 'Grumpy', 'Sly', 'Sleepy', 'Mama', 'Cranky', 'Shy', 'Lord', 'Granny', 'Little', 'Lucky'];
const NAME_B = { bamboo: ['Kiba', 'Tsume', 'Hayate', 'Sasa', 'Kaze'], maple: ['Kuri', 'Momo', 'Akane', 'Iga', 'Kaki'], tidepool: ['Shio', 'Kani', 'Nami', 'Uro', 'Awa'], onsen: ['Yuki', 'Kori', 'Fubuki', 'Shimo', 'Tsurara'] };

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** state.cozy.sightings, made whole */
export function sightingsOf(state) {
  const c = state.cozy ||= {};
  const S = c.sightings = c.sightings && typeof c.sightings === 'object' ? c.sightings : {};
  S.day = Math.floor(num(S.day, -1)); if (!Array.isArray(S.list)) S.list = []; else if (S.list.some(s => !s || typeof s.id !== 'string')) S.list = S.list.filter(s => s && typeof s.id === 'string');
  S.renown = Math.max(0, Math.floor(num(S.renown))); S.total = Math.max(0, Math.floor(num(S.total)));
  return S;
}
/** what a pack drops in coins on average (rpg/loot.js TREASURE: p × (lvl × mean mul + 3) a monster) */
export function packCoins(kind, lvl, count) {
  const per = { normal: 0.45 * (lvl * 2.75 + 3), champion: 0.8 * (lvl * 5 + 3), unique: 1 * (lvl * 9 + 3) };
  if (kind === 'unique') return per.unique + count * per.normal;
  if (kind === 'champion') return per.champion * (count + 1);
  return per.normal * count;
}
/** the bounty for a sighting (pure, seeded) */
export function bountyFor(kind, lvl, count, zone, rnd) {
  const mats = ZONE_MATS[zone] || ['wood', 'stone'], out = {};
  const n = { unique: [3, 5], champion: [4, 6], swarm: [6, 9] }[kind] || [4, 6];
  out[mats[0]] = n[0] + Math.floor(rnd() * (n[1] - n[0] + 1));
  const k2 = mats[1 + Math.floor(rnd() * (mats.length - 1))];
  out[k2] = (out[k2] || 0) + 1 + Math.floor(rnd() * 2) + (kind === 'unique' ? 1 : 0);
  return { coins: Math.round(1.5 * packCoins(kind, lvl, count)), mats: out, gem: rnd() < GEM_P };
}
/**
 * Roll a day's sightings.
 * zones: [{ zone, areas: [{ id, name }], monsters: [{ id, name }], lvl }] (the open zones; lvl: the wild level there)
 * → up to SIGHTINGS_A_DAY sightings, each in a different wild area, spread over the zones.
 */
export function rollSightings(day, zones, n = SIGHTINGS_A_DAY) {
  const pool = (zones || []).filter(z => z?.areas?.length && z.monsters?.length);
  if (!pool.length) return [];
  const rnd = mulberry32(((day + 1) * 2654435761) >>> 0);
  const order = pool.slice().sort((a, b) => a.zone.localeCompare(b.zone));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const out = [], used = new Set(), kinds = ['unique', 'champion', 'swarm'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; } // (kinds.length: with all four zones open, order.length swapped holes into the 3 kinds)
  for (let k = 0; out.length < n && k < n * 6; k++) {
    const Z = order[k % order.length], free = Z.areas.filter(a => !used.has(Z.zone + ':' + a.id));
    if (!free.length) continue;
    const a = free[Math.floor(rnd() * free.length)]; used.add(Z.zone + ':' + a.id);
    const kind = kinds[out.length % kinds.length], K = KINDS[kind], mon = Z.monsters[Math.floor(rnd() * Z.monsters.length)];
    const count = K.count[0] + Math.floor(rnd() * (K.count[1] - K.count[0] + 1)), lvl = Math.max(1, Math.round(Z.lvl || 1));
    const B = NAME_B[Z.zone] || NAME_B.bamboo, name = `${NAME_A[Math.floor(rnd() * NAME_A.length)]} ${B[Math.floor(rnd() * B.length)]}`;
    const line = kind === 'unique' ? `${name}, a unique ${mon.name}, prowls ${a.name}`
      : kind === 'champion' ? `${name}'s champion ${mon.name} pack holds ${a.name}`
      : `A big swarm of ${mon.name} has gathered in ${a.name}`;
    out.push({ id: `d${day}:${out.length}`, day, zone: Z.zone, area: a.id, areaName: a.name, kind, monster: mon.id, monsterName: mon.name, name: kind === 'swarm' ? `${mon.name} swarm` : name, line: titled(line), lvl, count, bounty: bountyFor(kind, lvl, count, Z.zone, rnd), renown: K.renown, done: false });
  }
  return out;
}
/** today's sightings: re-rolled when the world day has moved on (or `force`) → the list */
export function sightingsToday(state, day, zones, force = false) {
  const S = sightingsOf(state);
  if (force || S.day !== day) { S.day = day; S.list = rollSightings(day, zones); }
  return S.list;
}
/** a sighting cleared: done, renown and the count → the sighting (null when unknown or already done) */
export function clearSighting(state, id) {
  const S = sightingsOf(state), s = S.list.find(x => x.id === id);
  if (!s || s.done) return null;
  s.done = true; S.renown += s.renown || 0; S.total++;
  return s;
}
/** the live (not cleared) sightings in a zone today */
export const liveIn = (state, zone) => sightingsOf(state).list.filter(s => s.zone === zone && !s.done);
