// Zone village buffs that outlast a visit (docs/ZONES.md §2; ROADMAP Z-D5). One so far: the Yukimi Bathhouse's soak,
// "Onsen Glow" — a long-lasting warmth that lives on the hero beside the Well Fed meal (life/meals.js) and doesn't
// replace it. P.soak = { left, dur } (seconds of play) on the active hero's player record (saved with it); computeStats
// folds it in (soakAcc / soakPost), kitchen.update ticks it down (tickSoak), game.js syncBuffs shows the HUD chip.
// Pure but for tickSoak's recompute / event (node-tested in tools/test-rpg.mjs).
import { Events } from '../core/events.js';

export const SOAK = { name: 'Onsen Glow', jp: '湯上がり', color: '#ffb08a', glyph: 'heart', mins: 20, lifePct: 12, regen: 2, frost: 25 };
export const soakText = () => `+${SOAK.lifePct}% max life, +${SOAK.regen} life/s, +${SOAK.frost}% frost resist`;
export const soakActive = s => !!(s && s.left > 0);

/** computeStats: the additive stats (like gear while it lasts) */
export function soakAcc(s, add) {
  if (!soakActive(s)) return;
  add('lifeRegen', SOAK.regen); add('resFrost', SOAK.frost);
}
/** computeStats: the multiplier on the finished numbers (max life), and d.soak for the UI */
export function soakPost(s, d) {
  if (!soakActive(s)) return;
  d.lifeMax = Math.round(d.lifeMax * (1 + SOAK.lifePct / 100));
  d.soak = { left: s.left };
}
/** a fresh soak on the hero (the bathhouse): → the record */
export function startSoak(player, mins = SOAK.mins) {
  const dur = Math.round(mins * 60);
  player.soak = { left: dur, dur };
  return player.soak;
}
/** count the active hero's soak down (seconds of play); when it runs out the stats go back. → true on expiry */
export function tickSoak(G, dt) {
  const P = G?.state?.player, s = P?.soak;
  if (!s) return false;
  s.left -= dt;
  if (s.left > 0) return false;
  P.soak = null; G.actions?.recompute?.();
  Events.emit('soak:expired', {});
  G.ui?.toast?.('The onsen warmth fades… a soak at the Yukimi Bathhouse brings it back', { icon: 'heart', color: SOAK.color });
  return true;
}
/** the HUD chip (game.js syncBuffs) */
export function soakChip(G) {
  const s = G?.state?.player?.soak;
  if (!soakActive(s)) return null;
  return { id: 'soak', name: `${SOAK.name}: ${soakText()}`, glyph: SOAK.glyph, color: SOAK.color, time: s.left };
}
