// Treasure-class style drops (D2 flavour): monster kills and chests.
// Every drop entry is one of:
//   { type:'coins', n }  { type:'item', item }  { type:'potion', key:'heart'|'zoom'|'rejuv' }
//   { type:'material', key, n }  { type:'gem', item }
// Item level = monster level. Rarity uses items.rollRarity (diminishing magic find, D2 formula).
// actions.pickup() accepts any of these entries directly.
import { generateItem, makeGem, GEM_TYPES, toRng, rollRarity } from './items.js';

export const MATERIAL_KEYS = ['wood', 'stone', 'petal', 'crystal', 'bone', 'mochi', 'silk', 'lantern'];
/** Material table: minimum level and weight. Deeper floors unlock rarer building materials. */
export const MATERIAL_TABLE = [
  { key: 'wood', lvl: 1, w: 30 }, { key: 'stone', lvl: 1, w: 26 }, { key: 'bone', lvl: 1, w: 24 }, { key: 'petal', lvl: 1, w: 16 },
  { key: 'mochi', lvl: 4, w: 14 }, { key: 'silk', lvl: 10, w: 9 }, { key: 'crystal', lvl: 15, w: 7 }, { key: 'lantern', lvl: 20, w: 6 },
];
/** Monster kinds that favour a material (50% of their material drops). */
export const KIND_MATERIAL = { mochi: 'mochi', lantern: 'lantern', kinoko: 'petal', dust: 'silk', kasa: 'wood', oni: 'bone', tanuki: 'stone', kitsune: 'crystal' };

/** Treasure classes per monster rank. picks = rolls per category. */
export const TREASURE = {
  normal: { picks: 1, coins: { p: 0.45, mul: [1.5, 4] }, item: { p: 0.16 }, potion: { p: 0.10 }, material: { p: 0.14, n: [1, 2] }, gem: { p: 0.02 } },
  champion: { picks: 2, coins: { p: 0.8, mul: [3, 7] }, item: { p: 0.45 }, potion: { p: 0.3 }, material: { p: 0.35, n: [1, 3] }, gem: { p: 0.06 } },
  unique: { picks: 3, coins: { p: 1, mul: [6, 12] }, item: { p: 0.7 }, potion: { p: 0.5 }, material: { p: 0.6, n: [2, 4] }, gem: { p: 0.14 } },
  boss: { picks: 5, coins: { p: 1, mul: [10, 20], piles: 3 }, item: { p: 0.9 }, potion: { p: 0.8 }, material: { p: 1, n: [4, 8] }, gem: { p: 0.6 }, guaranteed: 'rare' },
};
/**
 * Building basics (wood / stone). The village-building loop runs on these (mid-tier buildings want 16-26 wood + 10-24
 * stone), so on top of the themed material roll every kill has a chance at a small bundle, early floors pay out more,
 * chests always hold a bundle and clearing a floor leaves a supply cache (floorClearDrops): ~1-2 floors per building.
 */
export const BASICS = { normal: { p: 0.1, n: [1, 2] }, champion: { p: 0.4, n: [2, 3] }, unique: { p: 0.85, n: [3, 5] }, boss: { p: 1, n: [6, 10] } };
export const basicsBoost = lvl => (lvl <= 7 ? 1.5 : lvl <= 13 ? 1.25 : 1);
export const POTION_WEIGHTS = lvl => [
  { key: 'heart', w: 64 }, { key: 'zoom', w: 30 }, { key: 'rejuv', w: 4 + Math.min(10, lvl / 5) },
];

function rollGemTier(lvl, rng) {
  const r = rng.next();
  if (lvl < 15) return 0;
  if (lvl < 30) return r < 0.75 ? 0 : 1;
  if (lvl < 45) return r < 0.3 ? 0 : r < 0.85 ? 1 : 2;
  return r < 0.1 ? 0 : r < 0.6 ? 1 : 2;
}
function rollMaterial(lvl, rng, kind) {
  if (kind && KIND_MATERIAL[kind] && rng.chance(0.5)) return KIND_MATERIAL[kind];
  return rng.weighted(MATERIAL_TABLE.filter(m => m.lvl <= Math.max(1, lvl))).key;
}
const coinsFor = (lvl, mul, gf, rng) => Math.max(1, Math.round((lvl * rng.range(mul[0], mul[1]) + rng.int(1, 5)) * (1 + (gf || 0) / 100)));

/**
 * Roll a monster's drops. o = { mlvl, rank:'normal'|'champion'|'unique'|'boss', mf, gf, rng, kind? }
 * Bosses always drop at least one rare-or-better item.
 */
export function rollDrops({ mlvl = 1, rank = 'normal', mf = 0, gf = 0, rng, kind } = {}) {
  rng = toRng(rng);
  const T = TREASURE[rank] || TREASURE.normal;
  const lvl = Math.max(1, Math.round(mlvl));
  const out = [];
  if (rng.chance(T.coins.p)) for (let i = 0; i < (T.coins.piles || 1); i++) out.push({ type: 'coins', n: coinsFor(lvl, T.coins.mul, gf, rng) });
  if (T.guaranteed) {
    let r = rollRarity(lvl, mf, 'boss', rng);
    if (r === 'normal' || r === 'magic') r = 'rare';
    out.push({ type: 'item', item: generateItem({ ilvl: lvl, rarity: r, rng }) });
  }
  // a boss's extra picks roll on the unique-monster table but skip the shallow-floor rare damping (items.earlyRareK)
  const itemRank = rank === 'boss' ? 'hoard' : rank;
  for (let i = 0; i < T.picks; i++) {
    if (rng.chance(T.item.p)) out.push({ type: 'item', item: generateItem({ ilvl: lvl, mf, rank: itemRank, rng }) });
    if (rng.chance(T.potion.p)) out.push({ type: 'potion', key: rng.weighted(POTION_WEIGHTS(lvl)).key });
  }
  if (rng.chance(T.material.p)) out.push({ type: 'material', key: rollMaterial(lvl, rng, kind), n: rng.int(T.material.n[0], T.material.n[1]) });
  if (rank === 'boss' && rng.chance(0.7)) out.push({ type: 'material', key: rollMaterial(lvl + 10, rng), n: rng.int(2, 4) });
  const Bs = BASICS[rank] || BASICS.normal;
  if (rng.chance(Math.min(1, Bs.p * basicsBoost(lvl)))) {
    const n = rng.int(Bs.n[0], Bs.n[1]);
    if (rank === 'boss') out.push({ type: 'material', key: 'wood', n }, { type: 'material', key: 'stone', n: Math.max(2, n - 2) });
    else out.push({ type: 'material', key: rng.chance(0.58) ? 'wood' : 'stone', n });
  }
  if (rng.chance(T.gem.p)) out.push({ type: 'gem', item: makeGem(rng.pick(GEM_TYPES), rollGemTier(lvl, rng)) });
  return out;
}

export const CHEST_QUALITY = ['plain', 'fancy', 'golden'];
/**
 * Chest contents. quality: 0|'plain' (wooden box), 1|'fancy' (lacquered, 1 guaranteed magic+), 2|'golden' (treasure, 1 guaranteed rare+).
 */
export function chestDrops(level = 1, quality = 0, rng, mf = 0) {
  rng = toRng(rng);
  const q = typeof quality === 'string' ? Math.max(0, CHEST_QUALITY.indexOf(quality)) : Math.max(0, Math.min(2, quality | 0));
  const lvl = Math.max(1, Math.round(level));
  const out = [];
  out.push({ type: 'coins', n: coinsFor(lvl, [[2, 5], [5, 10], [12, 24]][q], 0, rng) });
  const nItems = [rng.chance(0.6) ? 1 : 0, 2, 3][q];
  for (let i = 0; i < nItems; i++) {
    let rarity;
    if (i === 0 && q === 1) { rarity = rollRarity(lvl, mf, 'chest', rng); if (rarity === 'normal') rarity = 'magic'; }
    if (i === 0 && q === 2) { rarity = rollRarity(lvl, mf, 'boss', rng); if (rarity === 'normal' || rarity === 'magic') rarity = 'rare'; }
    out.push({ type: 'item', item: generateItem({ ilvl: lvl + q, rarity, mf, rank: 'chest', rng }) });
  }
  if (rng.chance([0.4, 0.7, 1][q])) out.push({ type: 'potion', key: rng.weighted(POTION_WEIGHTS(lvl)).key });
  if (q === 2) out.push({ type: 'potion', key: 'rejuv' });
  if (rng.chance([0.6, 0.8, 1][q])) out.push({ type: 'material', key: rollMaterial(lvl + q * 5, rng), n: rng.int(1 + q * 2, 3 + q * 3) });
  // every chest keeps a bundle of building supplies
  out.push({ type: 'material', key: 'wood', n: rng.int(2 + q * 2, 4 + q * 3) }, { type: 'material', key: 'stone', n: rng.int(1 + q * 2, 3 + q * 2) });
  if (rng.chance([0.04, 0.2, 0.6][q])) out.push({ type: 'gem', item: makeGem(rng.pick(GEM_TYPES), rollGemTier(lvl + q * 8, rng)) });
  return out;
}

/** Supply cache left when every monster on a floor is gone (wood + stone + a coin purse). */
export function floorClearDrops(level = 1, rng) {
  rng = toRng(rng);
  const lvl = Math.max(1, Math.round(level));
  return [
    { type: 'material', key: 'wood', n: rng.int(3, 5) + Math.floor(lvl / 6) },
    { type: 'material', key: 'stone', n: rng.int(2, 4) + Math.floor(lvl / 8) },
    { type: 'coins', n: coinsFor(lvl, [4, 8], 0, rng) },
  ];
}
