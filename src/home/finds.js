// Finds (docs/HOUSING.md §3): themed rare furniture drops in the outdoor regions and the Burrow, layered on top of
// rpg/loot.js like the homestead's seeds and forage (life/pantry.js), so rollDrops' seeded tests stay put. Pure data +
// functions (node-tested in tools/test-rpg.mjs; rng injectable). dungeon/dungeonMode.js calls findDrops on a kill and
// when a chest opens; the drop is a ground-loot entry { type: 'furniture', key: id, n: 1 } (combat/groundLoot.js shows
// the piece itself, scaled down, bobbing with a sparkle; picking it up puts it in your furniture storage).
//
// Each region has its own set (plus a few pieces made for it); the Burrow has two oddities you can't get anywhere
// else (a lucky cat, a yokai lantern) and, now and then, any piece Tanu could sell at the village's rank. The odds are
// low for a monster, better for a chest and good for a boss; one kill or one chest never drops two pieces.
import { FURNITURE_IDS, itemDef, shopRank } from './furniture.js';

export const FIND_TABLES = {
  bamboo: ['bambooPlanter', 'bambooBench', 'bambooLantern', 'hangingPlanter', 'pandaPlush'],
  maple: ['mapleRug', 'acornStool', 'mapleWreath', 'wp_maple'],
  tidepool: ['fishTank', 'shellLamp', 'waveRug', 'glassFloats', 'lilyTub', 'frogFountain', 'wp_waves'],
  onsen: ['onsenNoren', 'cypressBucket', 'wp_wood', 'fl_stone'],
  burrow: ['luckyCat', 'yokaiLantern'],
};
export const FIND_WHERE = Object.keys(FIND_TABLES);
/** the chance of a find: per monster (by rank), per chest (plain / golden) and per boss */
export const FIND_P = { normal: 0.012, champion: 0.03, unique: 0.05, boss: 0.35, chest0: 0.1, chest1: 0.12, chest2: 0.15 };
/** in the Burrow, the share of finds that are any rank-appropriate piece rather than one of its oddities */
export const BURROW_ANY = 0.3;

/** how likely a find is for this kind of drop */
export const findChance = kind => FIND_P[kind] ?? FIND_P.normal;
/** a piece's weight in its table: the find-only ones (never sold) come up twice as often; cheaper ones a bit more */
export const findWeight = id => { const d = itemDef(id); return (d.shop === false ? 2 : 1) * Math.pow(300 / ((d.price || 100) + 150), 0.8); };
/** the pieces any-piece Burrow finds choose from at a village rank */
export const anyPool = (rank = 1) => FURNITURE_IDS.filter(id => { const r = shopRank(itemDef(id)); return r > 0 && r <= rank; });

function weighted(ids, rng) {
  const w = ids.map(findWeight), tot = w.reduce((a, b) => a + b, 0);
  let x = rng() * tot;
  for (let i = 0; i < ids.length; i++) { x -= w[i]; if (x <= 0) return ids[i]; }
  return ids[ids.length - 1];
}
/** Which piece a find is (no chance roll) → furniture / surface id */
export function pickFind(where, rank = 1, rng = Math.random) {
  const table = FIND_TABLES[where] || FIND_TABLES.burrow;
  if (where === 'burrow' || !FIND_TABLES[where]) {
    const any = anyPool(rank);
    if (any.length && rng() < BURROW_ANY) return weighted(any, rng);
  }
  return weighted(table, rng);
}
/** The treasure roll: where: a region id or 'burrow'; kind: a monster rank ('normal' | 'champion' | 'unique'), 'boss',
 *  'chest0' (plain) or 'chest2' (golden) → [] or [{ type: 'furniture', key, n: 1 }] (never more than one).
 *  o: { rank (the village's), rng, force (skip the chance roll) } */
export function rollFind(where, kind = 'normal', o = {}) {
  const rng = o.rng || Math.random;
  if (!o.force && rng() >= findChance(kind)) return [];
  return [{ type: 'furniture', key: pickFind(where, o.rank || 1, rng), n: 1 }];
}
/** The game's hook (dungeon/dungeonMode.js): the roll for a Burrow floor or a region visit. G.finds.force > 0 makes the
 *  next roll a sure find (tests and QA). */
export function findDrops(G, mode, kind = 'normal') {
  const where = mode?.isRegion ? mode.regionId : 'burrow';
  const F = G?.finds, force = !!(F && F.force > 0);
  const out = rollFind(where, kind, { rank: G?.sim?.stats?.rank || 1, force });
  if (force && out.length) F.force--;
  return out;
}
