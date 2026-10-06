// Poe's models for the charged-abilities DPS-band sim (tools/charge-sim.mjs, docs/CHARGE.md §3): expected damage % per
// cast (Σ dmgPct × the foes each part hits) for each of her damage skills, and a value per cast for her summon and her
// buffs. charge-sim.mjs merges these into its tables (poeSim(kit)). Same conventions: p = params, k = perk ranks
// (charged only), s = stage (0 = a tap), sc = { n: foes in the pack (1 = a single target) }, c = the charge table;
// pp(c, s, id) = a perk's pct at that stage.
export function poeSim({ area, line, fan, rk, pp, RP }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // the fūma's two passes: in a pack each pass slices ~2.6 foes a 0.62 m disc wide (more when it's bigger)
  const passFoes = (r, sc) => (sc.n <= 1 ? 1 : clamp(2.6 * Math.sqrt(r / 0.62), 1, sc.n));
  const chain = (n, chains, falloff) => { let t = 0; for (let i = 0; i <= Math.min(chains, n - 1); i++) t += Math.pow(1 - falloff / 100, i); return t; };
  const DMG = {
    fumaThrow: (p, k, s, sc, c) => p.dmgPct * passFoes(p.radius, sc) * (1 + p.backPct / 100) * (1 + (s && rk(k, 'split') ? rk(k, 'split') * pp(c, s, 'split') / 100 * 0.75 : 0))
      + (rk(k, 'orbit') ? p.dmgPct * pp(c, s, 'orbit') / 100 * (c.perks.orbit.t[Math.max(0, s - 1)] / c.perks.orbit.every) * area(c.perks.orbit.r, sc) : 0),
    kunaiFan: (p, k, s, sc, c) => { const n = p.count + (p.extra || 0); return p.dmgPct * fan(n, p.spread, sc) * (sc.n <= 1 ? 1 : 1 + 0.5 * (p.pierce || 0))
      + (rk(k, 'tags') ? fan(n, p.spread, sc) * p.dmgPct * pp(c, s, 'tags') / 100 * Math.min(2, area(c.perks.tags.r, sc)) : 0); },
    shadowStitch: (p, k, s, sc) => p.dmgPct * (1 + 0.5 * (area(p.radius, sc) - 1)),
    whirlingFuma: (p, k, s, sc, c) => p.dmgPct * (p.duration / p.tick) * area(p.radius + 0.4, sc) * 0.4
      + (rk(k, 'shrapnel') ? c.perks.shrapnel.n * p.dmgPct * pp(c, s, 'shrapnel') / 100 * (sc.n <= 1 ? 0.15 : 0.5) : 0),
    shurikenRain: (p, k, s, sc, c) => p.dmgPct * p.count * Math.min(1, sc.n * (p.impactRadius / p.radius) ** 2)
      + (s >= 3 && rk(k, 'bigStar') ? p.dmgPct * pp(c, s, 'bigStar') / 100 * area(c.perks.bigStar.r, sc) : 0),
    thousandStars: (p, k, s, sc, c) => p.dmgPct * (p.duration / p.tick) * area(p.radius, sc) * 0.8
      + (s >= 3 && rk(k, 'supernova') ? p.dmgPct * pp(c, s, 'supernova') / 100 * area(p.radius, sc) : 0),
    smokeBomb: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * 1.2 // (+ the blind's worth: monsters missing is damage she doesn't take)
      + (rk(k, 'pepper') ? p.dmgPct * pp(c, s, 'pepper') / 100 * c.perks.pepper.t * area(p.radius, sc) * 0.6 : 0),
    puffBall: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDuration * 0.6) * (1 + p.splashPct / 100 * (area(p.radius, sc) - 1)) * (1 + (s ? rk(k, 'split') * 0.5 * (sc.n > 1 ? 0.8 : 0) : 0))
      + (rk(k, 'bounce') && sc.n > 1 ? c.perks.bounce.n * p.dmgPct * pp(c, s, 'bounce') / 100 * 0.7 : 0),
    substitution: (p, k, s, sc, c) => p.dmgPct * area(p.popRadius, sc) * (s && rk(k, 'twoLogs') ? 1.5 : 1) * 1.3 // (+ the lure's worth)
      + (rk(k, 'splinters') ? c.perks.splinters.n * p.dmgPct * pp(c, s, 'splinters') / 100 * (sc.n <= 1 ? 0.15 : 0.45) : 0),
    thunderPaw: (p, k, s, sc, c) => p.dmgPct * (sc.n <= 1 ? 1 : chain(sc.n, p.chains, p.falloff)) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0))
      + (rk(k, 'storm') ? p.dmgPct * pp(c, s, 'storm') / 100 * (c.perks.storm.t / 0.5) * 0.8 : 0),
    smokeDragon: (p, k, s, sc, c) => p.dmgPct * area(Math.min(p.width / 2, RP + 1), sc) * (1 + (s >= 3 && rk(k, 'twin') ? pp(c, s, 'twin') / 100 : 0)),
    shadowStep: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * Math.min(1, p.arc / 200) * (1 + (p.critBonus - 25) / 200) * (s && rk(k, 'sure') ? 1.25 : 1) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0)), // (Sure Kill: the crit it would have rolled ~45% of the time)
    afterimageDash: (p, k, s, sc, c) => p.dmgPct * line(Math.min(p.distance / 2.5, 4), sc) * (s && rk(k, 'rewind') ? 1.6 : 1)
      + p.images * p.burstPct * Math.min(1, area(p.burstRadius, sc) / Math.max(1, sc.n) * (sc.n > 1 ? 2.2 : 1)) * 0.6,
    caltropFlip: (p, k, s, sc) => p.dmgPct * (p.duration / p.tick) * area(p.radius, sc) * 0.4,
    phantomBarrage: (p, k, s, sc, c) => p.dmgPct * Math.min(p.targets, sc.n <= 1 ? 1 : sc.n) * (sc.n <= 1 ? 1.4 : 1) // (a lone foe: struck from behind, a sure crit)
      + (s >= 3 && rk(k, 'finale') ? p.dmgPct * pp(c, s, 'finale') / 100 * Math.min(p.targets, sc.n) : 0),
  };
  const VALUE = {
    shadowClone: (p, k, s, sc, c) => p.clonePct * p.clones * Math.min(1, p.duration / 12) * Math.min(1.5, 0.6 + 0.4 * (p.lifeMul || 1)) * (rk(k, 'boom') ? 1.1 : 1) * (rk(k, 'lure') ? 1.08 : 1),
    vanish: (p, k, s) => (100 + p.bonusPct) * p.critX * (1 + p.duration / 20) * (rk(k, 'triple') ? 1.25 : 1) * (rk(k, 'smokeExit') ? 1.08 : 1),
    bullseyeMark: (p, k, s, sc, c) => ((p.vuln * 3 + p.stackPct * 6 * Math.min(2, area(p.burstRadius, sc))) * (p.marks || 1)) * (rk(k, 'jackpot') ? 1.12 : 1) * (rk(k, 'spread') ? 1.1 : 1),
  };
  return { DMG, VALUE };
}
