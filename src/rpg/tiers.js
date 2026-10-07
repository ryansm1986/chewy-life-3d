// Tier runs and the Spirit endgame (docs/ZONES.md §5 and §5.1 as built; ROADMAP Z-E1, Z-E4). Pure (no three.js):
// node-tested in tools/test-rpg.mjs. The numbers live here; the modifiers are rpg/zoneMods.js; the save records are
// rpg/zones.js (tierRecord); the run itself (rewards applied, the run-wide effects) is dungeon/tierRun.js.
//
//   A run = { tier: 0..5, spirit: 0 | S (1…∞), mods: [ids] }. A Spirit run carries tier 5 (so quest filters "tier ≥ n" and
//   events treat it as at least T5) and its Spirit tier S; its monsters are level 60.
//   Rewards are summed: the tier's (or the Spirit tier's) own bonus plus every picked modifier's (rewardTotals), as
//   fractions (0.25 = +25%): qty (item quantity), rarity (= +N magic find), xp, boss (the boss's hoard).
export const TIER_MAX = 5, TIER_LEVEL = 4, LEVEL_CAP = 60, SPIRIT_LEVEL = 60;
/** the pinnacle "Four Seasons" fight replaces the last boss on every 10th Spirit tier */
export const PINNACLE_EVERY = 10;

// T0 is the story run (no modifiers). pack: pack-size multiplier; champ: the chance a plain room pack is promoted to a
// champion pack; qty / rarity / xp: the reward bonus; slots: how many modifiers may be picked.
export const TIERS = [
  { t: 0, pack: 1.00, champ: 0.00, qty: 0.00, rarity: 0.00, xp: 0.00, slots: 0 },
  { t: 1, pack: 1.06, champ: 0.04, qty: 0.10, rarity: 0.06, xp: 0.08, slots: 1 },
  { t: 2, pack: 1.12, champ: 0.08, qty: 0.20, rarity: 0.12, xp: 0.16, slots: 2 },
  { t: 3, pack: 1.18, champ: 0.12, qty: 0.30, rarity: 0.18, xp: 0.24, slots: 2 },
  { t: 4, pack: 1.24, champ: 0.16, qty: 0.40, rarity: 0.24, xp: 0.32, slots: 3 },
  { t: 5, pack: 1.30, champ: 0.20, qty: 0.50, rarity: 0.30, xp: 0.40, slots: 3 },
];
const r3 = v => Math.round(v * 1000) / 1000;
/** a Spirit tier's numbers: on top of T5's, stacking per tier (life and damage multipliers on every monster) */
export function spiritInfo(s) {
  s = Math.max(1, Math.floor(s || 1));
  return {
    s, pack: r3(Math.min(1.5, 1.3 + 0.02 * s)), champ: r3(Math.min(0.3, 0.2 + 0.01 * s)),
    life: r3(1 + 0.1 * s), dmg: r3(1 + 0.05 * s),
    qty: r3(0.5 + 0.06 * s), rarity: r3(0.3 + 0.04 * s), xp: r3(0.4 + 0.03 * s),
    slots: s >= 10 ? 6 : s >= 5 ? 5 : 4,
    unique: r3(Math.min(0.25, 0.03 + 0.01 * s)), // (the endgame unique's chance in the run's clear chest)
    leaderUnique: r3(Math.min(0.03, 0.005 + 0.001 * s)), // (… and from each unique pack's leader)
    pinnacle: s % PINNACLE_EVERY === 0,
  };
}
/** the run's base numbers (a tier's, or a Spirit tier's) */
export function runInfo({ tier = 0, spirit = 0 } = {}) {
  if (spirit > 0) return { ...spiritInfo(spirit), t: TIER_MAX, spirit: true };
  const T = TIERS[Math.max(0, Math.min(TIER_MAX, Math.floor(tier || 0)))];
  return { ...T, life: 1, dmg: 1, spirit: false, s: 0, unique: 0, leaderUnique: 0, pinnacle: false };
}
/** how many modifiers the run takes (T1 1, T2 2, T3 2, T4 3, T5 3; Spirit 4, 5 from S5, 6 from S10) */
export const slotsFor = run => runInfo(run).slots;
/** a run's monster level: the band (the hero clamped to it) + 1 a floor + 4 a tier, capped at 60; a Spirit run is 60 */
export function runLevel(levels, floor = 1, { tier = 0, spirit = 0 } = {}, heroLvl = 1) {
  if (spirit > 0) return SPIRIT_LEVEL;
  if (!levels) return floor + 1;
  const [lo, hi] = levels, band = Math.max(lo, Math.min(hi, heroLvl || 1));
  return Math.min(LEVEL_CAP, band + (floor - 1) + TIER_LEVEL * (tier || 0));
}
/** a short label: "T3", "Spirit 7" */
export const runLabel = ({ tier = 0, spirit = 0 } = {}) => (spirit > 0 ? `Spirit ${spirit}` : tier > 0 ? `Tier ${tier}` : 'Story');

// ------------------------------------------------------------------ the clear chest
/** What the run's clear chest holds (the Lantern chest that rises by the last boss of a tier or Spirit run):
 *  { rares, magic, gem, coinMul, rejuv, zoneUnique, endgameChance, pinnacle } — dungeon/tierRun.js rolls the items.
 *  first: the first clear of this tier (or Spirit tier) in this dungeon. */
export function clearChest({ tier = 0, spirit = 0 } = {}, first = false) {
  if (spirit > 0) {
    const S = spiritInfo(spirit);
    return { rares: Math.min(6, 3 + Math.floor(spirit / 5)) + (first ? 1 : 0), magic: 2, gem: 1, gemTier: 2, coinMul: r3(3.5 + 0.25 * spirit), rejuv: 2, zoneUnique: false, endgameChance: S.pinnacle ? 0 : S.unique, pinnacle: S.pinnacle };
  }
  const t = Math.max(1, Math.min(TIER_MAX, tier));
  return { rares: [0, 1, 2, 2, 3, 3][t] + (first ? 1 : 0), magic: 2, gem: t >= 3 ? 1 : 0, gemTier: t >= 4 ? 1 : 0, coinMul: r3((1 + 0.5 * t) * (first ? 2 : 1)), rejuv: t >= 3 ? 1 : 0, zoneUnique: first && t === TIER_MAX, endgameChance: 0, pinnacle: false };
}
