// The Shih Tzu's models for the charged-abilities DPS-band sim (tools/charge-sim.mjs, docs/CHARGE.md §3): expected
// damage % per cast (Σ dmgPct × the foes each part hits) for each of his damage skills, his channel (the Maelstrom), and a
// value per cast for his summons and buffs. charge-sim.mjs merges these into its tables (shihtzuSim(kit)). Same
// conventions as charge-sim-poe.mjs: p = params, k = perk ranks (charged only), s = stage (0 = a tap), sc = { n: foes in
// the pack (1 = a single target) }, c = the charge table; pp(c, s, id) = a perk's pct at that stage.
// Hexes (gloom over time) count at a realised share: a hex stacks on, and refreshes, what the last cast left, so only part
// of each cast's damage over time is new (HEX_REAL).
export function shihtzuSim({ area, rk, pp, RP }) {
  const HEX_REAL = 0.5;
  const pack = (n, sc) => (sc.n <= 1 ? 1 : Math.min(n, sc.n));
  const DMG = {
    woefulWallop: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * Math.min(1, p.arc / 200)
      + (rk(k, 'aftershock') ? p.dmgPct * pp(c, s, 'aftershock') / 100 * area(c.perks.aftershock.r, sc) * 0.7 : 0)
      + (rk(k, 'woe') ? c.perks.woe.dps * c.perks.woe.dur * HEX_REAL * 0.4 * area(p.radius, sc) * Math.min(1, p.arc / 200) : 0),
    tugOfWoe: (p, k, s, sc, c) => p.dmgPct * (sc.n <= 1 ? 1 : Math.min(1 + p.extra, sc.n * 0.8))
      + (s && rk(k, 'slam') ? p.dmgPct * pp(c, s, 'slam') / 100 * pack(1 + p.extra, sc) * 0.6 : 0),
    steadfastSulk: (p, k, s, sc) => p.dmgPct * (1 + p.perBlow * Math.min(p.maxBlows, (p.preBlows || 0) + 1.5) / 100) * area(p.radius, sc),
    heaviestSigh: (p, k, s, sc) => p.dmgPct * area(Math.min(p.radius * (1 + (p.extraRings || 0) / p.rings), RP + 1), sc) * (p.extraRings ? 1.15 : 1),
    drippingPaw: (p, k, s, sc, c) => { const one = (p.dmgPct + p.dotPct * p.duration * HEX_REAL * (1 + 0.35 * ((p.stacksAt || 1) - 1))) * area(p.radius, sc); // (stacks at once: front-loaded, the cap still holds)
      return one * (1 + (s ? rk(k, 'split') * pp(c, s, 'split') / 100 * (sc.n > 1 ? 0.8 : 0.3) : 0)) + (rk(k, 'puddle') ? p.dotPct * c.perks.puddle.t * 0.3 * area(p.radius, sc) : 0); },
    grumbleCloud: (p, k, s, sc, c) => p.dmgPct * (p.duration / p.tick) * area(p.radius, sc) * 0.5
      + (rk(k, 'thunder') ? (p.duration / c.perks.thunder.every) * p.dmgPct * pp(c, s, 'thunder') / 100 * 0.8 : 0),
    mournfulAwoo: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0))
      + p.spread * 40 * HEX_REAL * area(p.radius, sc) * 0.5
      + (rk(k, 'chorus') ? p.dmgPct * pp(c, s, 'chorus') / 100 * 3 * area(c.perks.chorus.r, sc) * 0.5 : 0),
    everlastingGloom: (p, k, s, sc, c) => p.dotPct * p.duration * 0.55 * (s >= 3 && rk(k, 'deep') ? 1.35 : 1) * area(p.radius, sc) + p.burstPct * 0.4 * pack(1 + p.jumps, sc),
    borrowedWarmth: (p, k, s, sc) => p.dmgPct * (p.duration / p.tick) * pack(p.tethers, sc) * 0.85 * (1 + p.heal / 200),
  };
  const CHAN = {
    maelstrom: (p, k, s, sc, c) => ({ dps: p.dmgPct * p.hitsPerSec * area(p.radius + (s ? 0.35 : 0), sc) * (s ? 1.12 : 1), out: s ? p.spinOut || 0 : 0,
      burst: s && rk(k, 'finale') ? p.dmgPct * pp(c, s, 'finale') / 100 * area(p.radius + 1, sc) : 0 }),
  };
  const VALUE = {
    caseOfMopes: (p, k, s, sc) => (p.vuln + p.weaken * 0.6) * p.duration * area(p.radius, sc) * (rk(k, 'spread') ? 1.1 : 1),
    ghostPups: (p, k, s) => p.nipPct / p.nipEvery * p.pups * Math.min(1, p.duration / 30) * Math.min(1.5, 0.6 + 0.4 * p.lifePct / 40) * (rk(k, 'haunt') ? 1.2 : 1) * (s >= 3 && rk(k, 'runt') ? 1 + 1 / p.pups : 1),
    boneWard: (p, k) => p.absorbPct * 8 + p.bones * p.dmgPct * 0.4 * (rk(k, 'marrow') ? 1.5 : 1) + (rk(k, 'broth') ? 10 : 0),
    wayhomeLantern: (p, k, s, sc) => p.regen * p.duration * 6 + p.dmgPct * p.duration * area(p.radius, sc) * 0.4 + p.rekindle * 0.5 + (rk(k, 'calm') ? 20 : 0),
    grandpawsGhost: (p, k, s, sc) => p.dmgPct / p.stompEvery * p.duration * area(p.radius, sc) * 0.6
      + p.hexPct * p.hexDur * HEX_REAL * (p.duration / (p.howlEvery * (rk(k, 'stories') ? 0.5 : 1))) * area(Math.min(p.howlRadius, RP + 1), sc) * 0.3
      + (rk(k, 'lantern') ? 15 : 0),
  };
  return { DMG, CHAN, VALUE };
}
