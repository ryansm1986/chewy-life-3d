// Foosy the dragoon's models for the charged-abilities DPS-band sim (tools/charge-sim.mjs, docs/CHARGE.md §3): expected
// damage % per cast (Σ dmgPct × the foes each part hits) for each of his damage skills, and a value per cast for Dragon
// Heart and his two buffs. charge-sim.mjs merges these into its tables (goldenSim(kit)). Same conventions as
// charge-sim-shihtzu.mjs: p = params, k = perk ranks (charged only), s = stage (0 = a tap), sc = { n: foes in the pack
// (1 = a single target) }, c = the charge table; pp(c, s, id) = a perk's pct at that stage.
// His thrusts and charges hit a line (lineN: the line's area over the pack's, with the same crowding near the hero as
// tools/hero-balance.mjs lineArea); burns count at a realised share (BURN: a new burn replaces the last one on a foe).
export function goldenSim({ area, rk, pp, RP }) {
  const BURN = 0.6;
  const lineN = (len, w, sc) => (sc.n <= 1 ? 1 : Math.max(1, Math.min(sc.n, sc.n * (len * 2 * (w + 0.3)) / (Math.PI * RP * RP) * 1.8)));
  const perk = (k, s, c, id) => (rk(k, id) ? pp(c, s, id) / 100 : 0);
  const DMG = {
    // ---- Lance Arts
    sunbeamThrust: (p, k, s, sc, c) => p.dmgPct * lineN(p.length, p.width, sc) * (1 + perk(k, s, c, 'secondSun')),
    sunfallJump: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) + (rk(k, 'embers') ? pp(c, s, 'embers') * c.perks.embers.t * BURN * area(p.radius * 0.8, sc) * 0.5 : 0),
    pinwheelSweep: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (1 + 0.8 * ((p.turns || 1) - 1) * (p.turnPct || 100) / 100) + (rk(k, 'gust') ? p.dmgPct * pp(c, s, 'gust') / 100 * area(Math.min(p.radius + c.perks.gust.r, RP + 1), sc) * 0.7 : 0),
    gallantCharge: (p, k, s, sc, c) => p.dmgPct * lineN(Math.min(p.distance, 2 * RP), p.width / 2, sc) * (p.carry ? 1.1 : 1) + (rk(k, 'skid') ? p.dmgPct * pp(c, s, 'skid') / 100 * area(c.perks.skid.r, sc) * 0.7 : 0),
    starfallLance: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDur * BURN) * area(p.radius, sc)
      + (s >= 3 && rk(k, 'constellation') ? c.perks.constellation.n * p.dmgPct * pp(c, s, 'constellation') / 100 * area(c.perks.constellation.r, sc) * 0.6 : 0),
    // ---- Javelins
    bonkDart: (p, k, s, sc, c) => p.dmgPct * (1 + p.splash / 100 * (area(p.splashRadius, sc) - 1)) * (1 + (s ? rk(k, 'split') * perk(k, s, c, 'split') * (sc.n > 1 ? 0.8 : 0.3) : 0))
      + (rk(k, 'wobble') && sc.n > 1 ? p.dmgPct * pp(c, s, 'wobble') / 100 * 0.8 : 0),
    tailwagVolley: (p, k, s, sc, c) => p.dmgPct * (sc.n <= 1 ? 1 + (p.count - 1) * 0.2 : p.count * 0.75) * (1 + perk(k, s, c, 'echo')),
    trueFlight: (p, k, s, sc, c) => p.dmgPct * lineN(Math.min(p.range, 2 * RP + 1), p.width, sc) * (1 + perk(k, s, c, 'twin')),
    emberleafJavelin: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDur * BURN) * area(p.radius, sc) + (rk(k, 'kindling') && sc.n > 1 ? c.perks.kindling.n * p.dmgPct * pp(c, s, 'kindling') / 100 : 0),
    sunshower: (p, k, s, sc, c) => p.dmgPct * p.count * Math.min(1, sc.n * (p.impactRadius / p.radius) ** 2)
      + (s >= 3 && rk(k, 'rainbow') ? c.perks.rainbow.n * p.dmgPct * pp(c, s, 'rainbow') / 100 * Math.min(1, area(c.perks.rainbow.r, sc) / 2) : 0),
    // ---- the Whelp Bond (Shadow's)
    emberBreath: (p, k, s, sc) => (p.dmgPct * p.ticks + p.burnPct * p.burnDur * BURN) * area(Math.min(p.range, RP + 1), sc) * Math.min(1, p.arc / 90),
    divebombSwoop: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDur * BURN) * area(p.radius, sc) * (1 + (p.loops || 0) * (p.loopPct || 60) / 100)
      + (rk(k, 'scorch') ? pp(c, s, 'scorch') * c.perks.scorch.t * BURN * area(p.radius * 0.8, sc) * 0.5 * (1 + (p.loops || 0)) : 0),
  };
  const VALUE = {
    wingShield: (p, k, s, sc, c) => p.absorbPct * 8 + p.gustPct * area(p.gustRadius, sc) * 0.5 + (rk(k, 'regen') ? c.perks.regen.regen * p.duration * 4 : 0) + (rk(k, 'singe') ? pp(c, s, 'singe') * 0.5 : 0),
    mightyRoar: (p, k) => p.dmgBuff * p.duration * (1 + p.aspd / 100) * Math.min(1.3, p.radius / 6) * (rk(k, 'fear') ? 1.1 : 1) * (rk(k, 'pep') ? 1.05 : 1),
    dragonHeart: (p, k, s, sc, c) => (p.dmgPct / p.every * p.duration * area(p.radius, sc) * 0.6 + p.burnPct * p.burnDur * 0.3 * area(p.radius, sc)) * Math.min(1.5, 0.75 + 0.25 * (1 + p.heartLife / 100) * (p.size || 1))
      + (s >= 3 && rk(k, 'dragonJump') ? pp(c, s, 'dragonJump') * area(c.perks.dragonJump.r, sc) : 0) + (rk(k, 'hearth') ? c.perks.hearth.regen * p.duration * 4 : 0),
  };
  return { DMG, VALUE };
}
