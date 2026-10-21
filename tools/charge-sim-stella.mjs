// Stella the Sun Oracle's models for the charged-abilities DPS-band sim (tools/charge-sim.mjs, docs/CHARGE.md §3,
// docs/STELLA.md §3a): expected damage % per cast (Σ dmgPct × the foes each part hits) for each of her damage skills, Solar
// Ray as a channel, and a value per cast for Hinata and the Dawn's heals, shields and buffs (reported, not banded). Same
// conventions as charge-sim-golden.mjs: p = params, k = perk ranks (charged only), s = stage (0 = a tap), sc = { n: foes in
// the pack (1 = a single target) }, c = the charge table; pp(c, s, id) = a perk's pct at that stage.
// Her rays hit a line (lineN, as the dragoon's thrusts); burns count at a realised share (BURN: a new burn replaces the
// last one on a foe). The gilding and the Sunburn passive are left out: they lift a tap and a charge alike.
export function stellaSim({ area, fan, rk, pp, RP }) {
  const BURN = 0.6;
  const lineN = (len, w, sc) => (sc.n <= 1 ? 1 : Math.max(1, Math.min(sc.n, sc.n * (Math.min(len, 2 * RP + 1) * 2 * (w + 0.3)) / (Math.PI * RP * RP) * 1.8)));
  const perk = (k, s, c, id) => (rk(k, id) ? pp(c, s, id) / 100 : 0);
  const split = (k, s, c, sc) => (s ? rk(k, 'split') * perk(k, s, c, 'split') * (sc.n > 1 ? 0.8 : 0.3) : 0);
  const DMG = {
    // ---- Radiance
    goldenRay: (p, k, s, sc, c) => p.dmgPct * lineN(p.length, p.width, sc) * (1 + split(k, s, c, sc)) + (rk(k, 'afterglow') ? pp(c, s, 'afterglow') * c.perks.afterglow.t * 0.5 * lineN(p.length, p.width, sc) : 0),
    glint: (p, k, s, sc, c) => p.dmgPct * area(Math.min(p.range, RP + 1), sc) * Math.min(1, p.arc / 120) * (rk(k, 'mirror') ? 1 + c.perks.mirror.take / 100 * 0.3 : 1),
    prism: (p, k, s, sc, c) => p.dmgPct * fan(p.count, p.spread, sc) * (sc.n > 1 ? 1.3 : 1) + (rk(k, 'refraction') && sc.n > 1 ? 2 * p.dmgPct * pp(c, s, 'refraction') / 100 * 0.4 : 0),
    sundial: (p, k, s, sc, c) => p.count * p.dmgPct * (sc.n <= 1 ? 0.12 : Math.min(1, area(p.radius, sc) * 0.4)) * (s >= 3 && rk(k, 'longest') ? 1 + c.perks.longest.second / 100 : 1),
    // ---- Corona
    solarFlare: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDur * BURN) * area(p.radius, sc) + (rk(k, 'prominence') && sc.n > 1 ? p.dmgPct * pp(c, s, 'prominence') / 100 * 0.7 : 0),
    skippingSun: (p, k, s, sc, c) => p.dmgPct * (sc.n <= 1 ? Math.min(p.skips, 1.5) : p.skips * Math.min(1, area(p.radius, sc) * 0.45)) * (1 + split(k, s, c, sc))
      + (rk(k, 'skimmer') ? p.skips * p.dmgPct * pp(c, s, 'skimmer') / 100 * (c.perks.skimmer.t / 0.5) * (sc.n <= 1 ? 0.08 : 0.25) : 0),
    sunspot: (p, k, s, sc, c) => (p.duration / p.tick) * p.dmgPct * 1.3 * area(p.radius, sc) * 0.45 * (rk(k, 'wander') && sc.n <= 1 ? 1.2 : 1)
      + (rk(k, 'cycle') ? Math.floor(p.duration / c.perks.cycle.every) * p.dmgPct * pp(c, s, 'cycle') / 100 * area(p.radius, sc) * 0.45 : 0),
    risingSun: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDur * BURN) * area(p.radius, sc) + (s >= 3 && rk(k, 'redSky') ? pp(c, s, 'redSky') * c.perks.redSky.t * area(p.radius, sc) * 0.6 : 0),
  };
  // Solar Ray: the beam ramps +ramp% a second while it holds (from heat0), ×rampMax at most; the first foe in the way too
  const CHAN = {
    solarRay: (p, k, s, sc, c) => {
      const avg = Math.min(p.rampMax - 1, (p.heat0 || 0) + p.ramp / 100 * 1.5);
      return { dps: p.dmgPct * (1 + avg) * (sc.n > 1 ? 1.4 : 1), out: s ? p.linger || 0 : 0, burst: s && rk(k, 'lensFlare') ? p.dmgPct * pp(c, s, 'lensFlare') / 100 * area(c.perks.lensFlare.r, sc) : 0 };
    },
  };
  // her summon and the Dawn: a value per cast (heals and shields as % of life, buffs as % × seconds)
  const VALUE = {
    littleSun: (p, k, s, sc, c) => (p.dmgPct / p.every * p.duration * 0.7 + (rk(k, 'sunny') ? c.perks.sunny.heal / c.perks.sunny.every : p.healPct / p.healEvery) * p.duration * 20) * Math.min(1.4, 0.8 + 0.2 * (p.size || 1)) * (s >= 3 && rk(k, 'twin') ? 1 + 0.5 * c.perks.twin.share / 100 : 1),
    morningLight: (p, k, s) => p.healPct + (p.linger || 0) * p.healPct * 0.05 + (rk(k, 'chorus') ? 1 : 0) + (s >= 3 && rk(k, 'clear') ? 2 : 0),
    kindLight: (p, k, s, sc, c) => p.healPct * (p.rays || 1) * (p.rays > 1 ? 0.8 : 1) + (rk(k, 'coat') ? c.perks.coat.shell * (p.rays || 1) * 0.5 : 0),
    halo: (p, k, s, sc, c) => p.absorbPct + p.flarePct * area(p.radius, sc) * 0.05 + (s >= 2 && rk(k, 'ring') ? p.absorbPct * c.perks.ring.share / 100 * 0.5 : 0) + (rk(k, 'solar') ? 1.5 : 0),
    sunDog: (p, k, s, sc, c) => p.dmgBuff * p.duration * 0.06 + p.searPct * p.duration / 0.9 * 0.05 + p.catchPct * 0.3 + (s >= 3 && rk(k, 'twinDogs') ? 3 : 0) + (rk(k, 'heel') ? 1 : 0),
    daybreak: (p, k, s) => p.dmgBuff * p.duration * 0.1 + p.healPct + (s >= 3 && rk(k, 'hope') ? 4 : 0),
  };
  return { DMG, CHAN, VALUE };
}
