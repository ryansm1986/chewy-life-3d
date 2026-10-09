// Homestead XP (docs/COZY.md §3.3, ROADMAP CZ-9): small XP for the hero you walk with, so a cozy player isn't stuck at
// level 1 in town. Pure table and rule here; installHomesteadXp(G) wires the events (no three.js, no DOM).
//   a harvest 3 × the crop's days · a fish 4 / 6 / 9 / 12 by rarity · a dish cooked 4 · a building placed 8 · a gather
//   node 1 · a dig 4 (cozy/scavenge.js SCAV_XP) — each × (1 + level / 10); a delivered request pays as it always has.
// The XP goes through actions.addXp (the active hero's catch-up applies), and the "+N xp" float shows it over the hero.
import { Events } from '../core/events.js';
import { CROPS, PANTRY } from '../life/pantry.js';
import { SCAV_XP } from './scavenge.js';

export const HOME_XP = { harvestPerDay: 3, fish: [4, 6, 9, 12], cook: 4, build: 8, gather: SCAV_XP.gather, dig: SCAV_XP.dig };
/** the XP for a homestead act at the hero's level: base × (1 + level / 10), at least 1 */
export const homeXp = (base, lvl = 1) => (base > 0 ? Math.max(1, Math.round(base * (1 + Math.max(1, lvl) / 10))) : 0);
/** the base XP of an event → n (0: none) */
export function homeXpBase(kind, e = {}) {
  switch (kind) {
    case 'harvest': return HOME_XP.harvestPerDay * (CROPS[e.crop]?.days || 1) * Math.max(1, e.n || 1);
    case 'fish': return HOME_XP.fish[Math.max(0, Math.min(3, PANTRY[e.id]?.rare || 0))];
    case 'cook': return HOME_XP.cook * Math.max(1, e.n || 1);
    case 'build': return e.free ? 0 : HOME_XP.build;
    case 'gather': return HOME_XP.gather;
    case 'dig': return HOME_XP.dig;
    default: return 0;
  }
}
/** listen for the homestead's events; each pays the hero being played → { off } */
export function installHomesteadXp(G) {
  const give = (kind, e) => {
    const st = G.state, base = homeXpBase(kind, e); if (!base || G.titleActive) return;
    const n = homeXp(base, st.player?.lvl || 1), got = G.actions?.addXp?.(n) || 0;
    if (got > 0 && G.player) G.ui?.float?.(G.player.pos.clone().setY(G.player.pos.y + 2), `+${got} xp`, { kind: 'xp' });
    Events.emit('homestead:xp', { kind, xp: got });
  };
  const offs = [
    Events.on('garden:harvest', e => give('harvest', e)),
    Events.on('fish:caught', e => give('fish', e)),
    Events.on('dish:cooked', e => give('cook', e)),
    Events.on('building:placed', e => give('build', e)),
    Events.on('scavenge:gather', e => give('gather', e)),
    Events.on('scavenge:dig', e => give('dig', e)),
  ];
  return { off: () => offs.forEach(f => typeof f === 'function' && f()) };
}
