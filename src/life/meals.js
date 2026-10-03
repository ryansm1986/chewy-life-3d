// Well Fed (docs/HOMESTEAD.md §4): the buff a dish leaves behind. One at a time per hero, stored on the hero's own
// player object — state.heroes[id].player.meal = { dish, buff, tier, left, dur } (seconds of play) — so it follows that
// hero through the Burrow, the regions and save / load, and computeStats (rpg/stats.js) folds it in like gear.
// Pure data + functions (node-tested).

// per tier 1..3
export const BUFFS = {
  hearty: { name: 'Hearty', jp: 'ほかほか', color: '#ff8fb0', glyph: 'heart', text: t => `+${[8, 12, 18][t - 1]}% max life, +${[1, 1.6, 2.4][t - 1]} life/s` },
  swift: { name: 'Swift', jp: 'すばやい', color: '#8fe0c0', glyph: 'bolt', text: t => `+${[8, 12, 18][t - 1]}% move and attack speed` },
  strong: { name: 'Strong', jp: 'ちからもち', color: '#ff9a6a', glyph: 'sword', text: t => `+${[10, 16, 25][t - 1]}% damage` },
  lucky: { name: 'Lucky', jp: 'ラッキー', color: '#ffd84a', glyph: 'clover', text: t => `+${[20, 35, 60][t - 1]}% magic find and coins` },
  zen: { name: 'Zen', jp: 'おちつき', color: '#8fd0ff', glyph: 'sparkle', text: t => `+${[25, 40, 60][t - 1]}% zoom regen, -${[5, 8, 12][t - 1]}% cooldowns` },
};
export const TIER_NAMES = ['', 'I', 'II', 'III'];
export const buffInfo = m => (m && BUFFS[m.buff]) || null;
export const mealLabel = m => (m ? `${BUFFS[m.buff]?.name || 'Well Fed'} ${TIER_NAMES[m.tier] || ''}`.trim() : '');

/** The meal a dish leaves: { dish, buff, tier, left, dur } (food: life/pantry.js dish.food) */
export function mealFor(dish, food) {
  const dur = Math.round((food.mins || 10) * 60);
  return { dish, buff: food.buff, tier: Math.max(1, Math.min(3, food.tier || 1)), left: dur, dur };
}
export const mealActive = m => !!(m && m.left > 0 && BUFFS[m.buff]);

/** Fold a meal into the stat accumulator (computeStats, before the derived stats are built): the percent stats. */
export function mealAcc(meal, add) {
  if (!mealActive(meal)) return;
  const t = meal.tier - 1;
  switch (meal.buff) {
    case 'swift': add('moveSpeed', [8, 12, 18][t]); add('atkSpeed', [8, 12, 18][t]); add('castSpeed', [8, 12, 18][t]); break;
    case 'strong': add('dmgPct', [10, 16, 25][t]); break;
    case 'lucky': add('mf', [20, 35, 60][t]); add('gf', [20, 35, 60][t]); break;
    case 'zen': add('zoomRegen', [25, 40, 60][t]); add('cdr', [5, 8, 12][t]); break;
  }
}
/** …and the multipliers on the finished numbers (Hearty: max life and regen). d: the derived stats. */
export function mealPost(meal, d) {
  if (!mealActive(meal)) return;
  const t = meal.tier - 1;
  if (meal.buff === 'hearty') { d.lifeMax = Math.round(d.lifeMax * (1 + [0.08, 0.12, 0.18][t])); d.lifeRegen = Math.round((d.lifeRegen + [1, 1.6, 2.4][t]) * 10) / 10; }
  d.meal = { buff: meal.buff, tier: meal.tier, dish: meal.dish };
}
