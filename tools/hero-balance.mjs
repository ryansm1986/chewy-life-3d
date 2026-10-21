// Hero balance: Chewy vs Moka vs Poe at the same level and gear (docs/POE.md §4). Test-only (imported by test-rpg).
//   node tools/hero-balance.mjs [--levels 6,15,30,45]
//
// Per hero and level: a skill build (the bread-and-butter skill and its mastery as high as the level gates allow, the
// rest of the points into its synergies), stat points 50% into the weapon's damage stat, 30% Vitality, 20% Energy, and
// the same gear for all: the highest normal-quality base of the hero's weapon that the level allows, nothing else.
//  - clear speed: sustained damage per second over a 60 s fight, the skill cast on repeat at its real cycle (the cast
//    animations / the fūma's flight) with zoom regenerating; idle time (waiting for zoom) fills with the basic attack.
//    Pack = 5 foes within 3 m of the aim point (area parts hit ~5·(r/3)²: tools/charge-sim.mjs' model; the fūma's two
//    passes ~2.8 + 2.4 of them);
//    blend = 70% pack, 30% single (as the charge band).
//  - survivability: effective life against a monster of the same level: life / ((1 − dodge)(1 − block)(1 − defense DR)).
import { newHeroState } from '../src/rpg/actions.js';
import { computeStats, playerPhysDR } from '../src/rpg/stats.js';
import { skillRuntime, canLearn } from '../src/rpg/skills.js';
import { ITEM_BASES, GEAR_BASE_IDS, generateItem } from '../src/rpg/items.js';
import { RNG } from '../src/core/util.js';
import { SHIHTZU_TRAINING } from '../src/rpg/skillsShihtzu.js';
import { GOLDEN_TRAINING } from '../src/rpg/skillsGolden.js';
import { STELLA_TRAINING } from '../src/rpg/skillsStella.js';

export const FIGHT = 60, PACK = 5, RP = 3, BLEND = 0.7;
const area = (r, n) => (n <= 1 ? 1 : Math.max(1, Math.min(n, n * (r / RP) ** 2)));
/** the foes a straight line catches in a pack (the dragoon's thrusts: len m long, half-width w, a foe's body 0.3 either
 *  side): its area over the pack's, with the same crowding near the hero as area()'s arcs (×1.8 over a uniform spread) */
const lineArea = (len, w, n) => (n <= 1 ? 1 : Math.max(1, Math.min(n, n * (len * 2 * (w + 0.3)) / (Math.PI * RP * RP) * 1.8)));
/** the fūma's round trip in seconds: combat/poeSkills.js updateFuma's flight integrated (the hero standing still) */
export function fumaFlight(p, dt = 1 / 240) {
  let x = 0, z = 0, a = 0, t = 0, trav = 0, out = true, back = 0;
  while (t < 4.5) {
    t += dt;
    if (out) {
      const k = Math.min(1, trav / p.range), v = p.speed * (1 - 0.62 * k * k);
      a += p.curve * dt * (0.5 + 2.2 * k * k); x += Math.sin(a) * v * dt; z += Math.cos(a) * v * dt; trav += v * dt;
      if (trav >= p.range) out = false;
    } else {
      const L = Math.hypot(x, z); if (L < 0.62) return t;
      back += dt;
      const want = Math.atan2(-x, -z); let df = want - a; df = Math.atan2(Math.sin(df), Math.cos(df));
      a += Math.max(-13 * dt, Math.min(13 * dt, df));
      const v = p.speed * Math.min(0.38 + back * 2.2, 1.3), st = Math.min(L, v * dt);
      x += Math.sin(a) * st; z += Math.cos(a) * st;
    }
  }
  return t;
}
// per hero: the main skill, its mastery, synergy picks, the damage stat; cycle(R, d) → s per cast; hits(p, n) → Σ dmgPct·foes / 100
export const BUILDS = {
  chewy: { skill: 'chomp', mastery: 'boneMastery', extra: ['dig'], stat: 'str', wtype: 'sword',
    cycle: (R, d) => 0.46 / (d.aspd * 0.5), hits: (p, n) => p.dmgPct * area(p.radius, n) * Math.min(1, p.arc / 200) / 100,
    attack: (p, n, d) => ({ per: p.dmgPct * area(p.radius || 1.8, n) * Math.min(1, (p.arc || 110) / 200) / 100, cycle: 1 / d.aspd }) },
  moka: { skill: 'splash', mastery: 'tideMastery', extra: ['shake'], stat: 'ene', wtype: 'staff',
    cycle: (R, d) => 0.5 / (d.castMul || 1), hits: (p, n) => p.dmgPct * (1 + p.splashPct / 100 * (area(p.splashRadius, n) - 1)) / 100,
    attack: (p, n, d) => ({ per: p.dmgPct / 100, cycle: 0.36 / (d.aspd * 0.45) }) },
  poe: { skill: 'fumaThrow', mastery: 'shurikenMastery', extra: ['kunaiFan'], stat: 'dex', wtype: 'fuma',
    // a throw holds the next one until the fūma is home (combat/poeSkills.js castBlocked): the wind-up to the release, then the flight
    cycle: (R, d) => 0.45 * 0.46 / (d.aspd * 0.55) + fumaFlight(R.params),
    hits: (p, n) => p.dmgPct * (n <= 1 ? 2 : 2.8 + 2.4 * p.backPct / 100) / 100,
    attack: (p, n, d) => ({ per: p.dmgPct * area(p.radius, n) * Math.min(1, ((p.arc * 2 + 330) / 3) / 200) * (1 + 0.15 / 3) / 100, cycle: (0.34 / 0.45 + 0.32 / 0.45 + 0.48 / 0.42) / 3 / d.aspd }) },
  // a reference build, not in the band: Shadow Step on repeat (blink 0.24 s + strike 0.36 s at 1.05×; its cooldown; one foe or the
  // ~1.1 its 150° swipe catches in a pack), its from-behind crit bonus counted in
  'poe·step': { hero: 'poe', ref: true, skill: 'shadowStep', mastery: 'afterimageDash', extra: ['vanish', 'swiftWind'], stat: 'dex', wtype: 'fuma',
    cycle: (R, d) => Math.max(R.cd, 0.24 + 0.36 / 1.05), hits: (p, n, d) => p.dmgPct * area(p.radius, n) * Math.min(1, p.arc / 200) * (1 + Math.min(1, (d.crit + p.critBonus) / 100) * 0.5) / (1 + d.crit / 100 * 0.5) / 100,
    attack: (p, n, d) => BUILDS.poe.attack(p, n, d) },
  // the Shih Tzu (docs/SHIHTZU.md §4): Woeful Wallop on repeat (the 'wallop' action, 0.66 s at animSpeed 0.6), Weight of the World,
  // then its synergies; his basic attack is the three-swing combo (two swings at 1/aspd, the slam at 1/(0.85 aspd), ×1.35 on 110°)
  shihtzu: { skill: 'woefulWallop', mastery: 'weightOfWorld', extra: ['maelstrom', 'heaviestSigh'], stat: 'str', wtype: 'flail',
    cycle: (R, d) => 0.66 / (d.aspd * 0.6), hits: (p, n) => p.dmgPct * area(p.radius, n) * Math.min(1, p.arc / 200) / 100,
    attack: (p, n, d) => ({ per: p.dmgPct * (2 * area(p.radius, n) * Math.min(1, p.arc / 200) + 1.35 * area(p.radius * 0.92, n) * 0.55) / 3 / 100, cycle: (2 + 1 / 0.85) / 3 / d.aspd }) },
  // the hex build (docs/SHIHTZU.md §4), also in the band: an Energy build that keeps its gloom up rather than casting one skill on
  // repeat. Points: one in each rotation skill first (and Case of the Mopes, the prerequisite), then Dripping Paw, Lingering Gloom,
  // Grumble Cloud, Mournful Awoo, Everlasting Gloom, Grudge Ledger. The fight is a rotation (rotation() below).
  'shihtzu·hex': { hero: 'shihtzu', skill: 'drippingPaw', mastery: 'lingeringGloom', stat: 'ene', wtype: 'flail',
    plan: [['drippingPaw', 1], ['grumbleCloud', 1], ['caseOfMopes', 1], ['mournfulAwoo', 1], ['everlastingGloom', 1], ['drippingPaw', 8], ['lingeringGloom', 6], ['grumbleCloud', 6], ['mournfulAwoo', 4], ['everlastingGloom', 6],
      ['drippingPaw', 20], ['lingeringGloom', 20], ['grumbleCloud', 20], ['everlastingGloom', 20], ['mournfulAwoo', 20], ['grudgeLedger', 20]],
    rotation: (st, d, n) => hexRotation(st, d, n),
    attack: (p, n, d) => BUILDS.shihtzu.attack(p, n, d) },
  // Foosy the dragoon (docs/GOLDEN.md §4): the lance build, Sunbeam Thrust on repeat (the 'sunbeamThrust' action, 0.62 s at
  // animSpeed 0.62: one attack's time) down a long line, A Knight's Vow, then its synergies; his basic attack is the reach
  // combo (two thrusts down a line at 1/aspd, then a sweeping swat ×1.15 on its arc at 1/(0.9 aspd))
  golden: { skill: 'sunbeamThrust', mastery: 'knightsVow', extra: ['pinwheelSweep', 'sunfallJump', 'gallantCharge'], stat: 'str', wtype: 'lance',
    cycle: (R, d) => 0.62 / (d.aspd * 0.62), hits: (p, n) => p.dmgPct * lineArea(p.length, p.width, n) / 100,
    attack: (p, n, d) => ({ per: p.dmgPct * (2 * lineArea(p.radius, p.width, n) + 1.15 * area(p.sweepRadius, n) * Math.min(1, p.arc / 200)) / 3 / 100, cycle: (2 + 1 / 0.9) / 3 / d.aspd }) },
  // the javelin build (a Dexterity build: 50% of the points in Dexterity, so javMul > 1): Tailwag Volley on repeat (the
  // 'javToss' action, 0.46 s at his cast speed; Bonk Dart while it fights better, at the low levels), Keen Nose, Bonk Dart,
  // True Flight. Each javelin of the fan bonks the first
  // foe it reaches: in a pack about three in four find one; a lone foe catches the middle one or two
  'golden·jav': { hero: 'golden', skill: 'tailwagVolley', mastery: 'keenNose', stat: 'dex', wtype: 'lance',
    plan: [['bonkDart', 1], ['tailwagVolley', 20], ['keenNose', 20], ['bonkDart', 20], ['trueFlight', 20], ['sunshower', 20]],
    alt: [{ skill: 'bonkDart', cycle: (R, d) => 0.46 / (d.castMul || 1), hits: (p, n) => p.dmgPct * (1 + p.splash / 100 * (area(p.splashRadius, n) - 1)) / 100 }],
    cycle: (R, d) => 0.46 / (d.castMul || 1), hits: (p, n) => p.dmgPct * (n <= 1 ? 1 + (p.count - 1) * 0.2 : p.count * 0.75) / 100,
    attack: (p, n, d) => BUILDS.golden.attack(p, n, d) },
  // the Whelp Bond build (an Energy build: whelpMul > 1): Ember Breath on repeat (Shadow breathes three puffs a call; a call
  // while he's still breathing adds its puffs to his, so it's paced by the cooldown, the call and the puffs), Best Friends,
  // then Divebomb Swoop, Warm Heart, Mighty Little Roar, Dragon Heart. The cone (50°, ~4 m) catches ~arc/120 of a pack (a
  // lone foe is in it whole).
  'golden·whelp': { hero: 'golden', skill: 'emberBreath', mastery: 'bestFriends', stat: 'ene', wtype: 'lance',
    plan: [['emberBreath', 1], ['bestFriends', 1], ['divebombSwoop', 1], ['emberBreath', 20], ['bestFriends', 20], ['divebombSwoop', 20], ['wingShield', 1], ['warmHeart', 20], ['mightyRoar', 20], ['dragonHeart', 20]],
    cycle: (R, d) => Math.max(R.cd, 0.45 / (d.castMul || 1), R.params.ticks * 0.17),
    hits: (p, n, d) => (p.dmgPct * p.ticks + p.burnPct * Math.min(p.burnDur, Math.max(0.6, p.ticks * 0.17))) * (n <= 1 ? 1 : Math.max(1, area(Math.min(p.range, RP + 1), n) * Math.min(1, p.arc / 120))) / 100,
    attack: (p, n, d) => BUILDS.golden.attack(p, n, d) },
  // Stella the Sun Oracle (docs/STELLA.md §7): an Energy hero (70% of her points in Energy, as Moka). Her fights are rotations
  // (stlRotation below). Her basic attack is the Sunsweep (two sweeps on a 90° arc at 1/aspd, then a twirl's ring ×1.1 at
  // 1/(0.9 aspd)). Radiance: Golden Ray on repeat down a 10 m line (a pack skill), Solar Ray against a lone foe when it fights
  // better; Corona: Solar Flare on repeat with Hinata kept up; Dawn: the support (Halo kept on her, Kind Light, half its
  // presses falling back to a foe); stella·heal: Radiance with a Morning Light every 8 s (the heal budget).
  stella: { hero: 'stella', skill: 'goldenRay', mastery: 'innerLight', stat: 'ene', wtype: 'parasol',
    plan: [['morningLight', 1], ['goldenRay', 20], ['innerLight', 20], ['prism', 1], ['sunlit', 20], ['solarRay', 20], ['prism', 20]],
    rotation: (st, d, n) => stlRotation(st, d, n, 'ray'), attack: (p, n, d) => stlSweep(p, n, d) },
  'stella·flare': { hero: 'stella', skill: 'solarFlare', mastery: 'sunKissed', stat: 'ene', wtype: 'parasol',
    plan: [['morningLight', 1], ['solarFlare', 20], ['sunKissed', 20], ['sunspot', 1], ['skippingSun', 1], ['sunburn', 20], ['littleSun', 20], ['sunspot', 20]],
    rotation: (st, d, n) => stlRotation(st, d, n, 'flare'), attack: (p, n, d) => stlSweep(p, n, d) },
  'stella·dawn': { hero: 'stella', skill: 'kindLight', mastery: 'sunnyDisposition', stat: 'ene', wtype: 'parasol',
    plan: [['morningLight', 1], ['kindLight', 1], ['sunnyDisposition', 1], ['halo', 1], ['kindLight', 20], ['sunnyDisposition', 20], ['halo', 20], ['stlZoomies', 5], ['sunDog', 10], ['daybreak', 10]],
    rotation: (st, d, n) => stlRotation(st, d, n, 'dawn'), attack: (p, n, d) => stlSweep(p, n, d) },
  // the single-target build (STELLA §7: Solar Ray for one big foe): Inner Light while Solar Ray's row is closed, then Solar Ray
  'stella·solar': { hero: 'stella', ref: true, skill: 'goldenRay', mastery: 'innerLight', stat: 'ene', wtype: 'parasol',
    plan: [['morningLight', 1], ['goldenRay', 1], ['prism', 1], ['solarRay', 20], ['innerLight', 20], ['sunlit', 20], ['goldenRay', 20]],
    rotation: (st, d, n) => stlRotation(st, d, n, 'ray'), attack: (p, n, d) => stlSweep(p, n, d) },
  'stella·heal': { hero: 'stella', ref: true, skill: 'goldenRay', mastery: 'innerLight', stat: 'ene', wtype: 'parasol',
    plan: [['morningLight', 1], ['goldenRay', 20], ['innerLight', 20], ['prism', 1], ['sunlit', 20], ['solarRay', 20], ['prism', 20]],
    rotation: (st, d, n) => stlRotation(st, d, n, 'ray', true), attack: (p, n, d) => stlSweep(p, n, d) },
};
/** Stella's Sunsweep combo as a basic attack (the ATTACK params: radius, arc, ringRadius, ringMul) */
export function stlSweep(p, n, d) { return { per: p.dmgPct * (2 * area(p.radius, n) * Math.min(1, p.arc / 200) + p.ringMul * area(p.ringRadius, n)) / 3 / 100, cycle: (2 + 1 / 0.9) / 3 / d.aspd }; }
/** Stella's sustained damage (weapon-damage % a second) against n foes, by build. Each second of fight, zoom and cast time
 *  go by priority (as hexRotation): the heal budget's Morning Light (every 8 s), the Dawn's Halo kept on her, Hinata kept up
 *  (Corona), then the build's skill on repeat with what's left; any time still free swings the wagasa. The marks: Sunlit
 *  (Radiance) counts ~2 stacks a gilded foe and its flare once every ~2.5 s; Sunburn (Corona) its take on sunburnt foes. */
/** her casts' action lengths at cast speed 1 (actors/stellaPoses.js: parasolAim, parasolRaise) */
export const STL_CAST = { aim: 0.56, raise: 0.7 };
export function stlRotation(st, d, n, kind, heal = false, parts = null) {
  const has = id => (st.player.skills[id] || 0) > 0, rt = id => (has(id) ? skillRuntime(id, st, d) : null), A = skillRuntime('attack', st, d);
  const cm = d.castMul || 1;
  let zoom = d.zoomRegen, time = 1;
  const take = (R, rate, castT) => { if (!R) return 0; const r = Math.max(0, Math.min(rate, zoom / R.cost, time / castT)); zoom -= r * R.cost; time -= r * castT; return r; };
  const P = {};
  const lit = d.sunlit ? 1 + 2 * d.sunlit.per / 100 : 1, litFlare = d.sunlit ? d.sunlit.flarePct / 2.5 * area(d.sunlit.flareR, n) : 0;
  const burnt = d.sunburn ? 1 + d.sunburn.take / 100 : 1;
  const AIM = STL_CAST.aim / cm, RAISE = STL_CAST.raise / cm;
  if (heal) take(rt('morningLight'), 1 / 8, RAISE);
  if (kind === 'ray') {
    const ray = rt('goldenRay'), sol = n <= 1 ? rt('solarRay') : null;
    if (sol) { // a lone foe: Solar Ray held, ramping +ramp%/s to ×rampMax (a hold of H s averages its ramp), while zoom lasts
      const H = Math.max(1, Math.min(time, zoom / Math.max(0.01, sol.cost)) * FIGHT), up = (sol.params.rampMax - 1) / (sol.params.ramp / 100), avg = H > up ? 1 + (sol.params.rampMax - 1) * (H - up / 2) / H : 1 + sol.params.ramp / 100 * H / 2;
      const f = Math.min(time, zoom / sol.cost); zoom -= f * sol.cost; time -= f;
      P.solar = f * sol.params.dmgPct * avg * lit + (d.sunlit ? f * litFlare : 0);
    }
    const r = take(ray, 1 / AIM, AIM);
    P.ray = r * ray.params.dmgPct * lineArea(ray.params.length, ray.params.width, n) * lit + (d.sunlit ? Math.min(1, r * 3) * litFlare : 0);
  } else if (kind === 'flare') {
    const sun = rt('littleSun'), fl = rt('solarFlare');
    const rSun = take(sun, sun ? 1 / Math.max(sun.cd, sun.params.duration) : 0, 0.85 / cm), up = sun ? Math.min(1, rSun * sun.params.duration) : 0;
    P.hinata = sun ? up * sun.params.dmgPct / sun.params.every * burnt : 0;
    const r = take(fl, 1 / RAISE, RAISE);
    P.flare = r * (fl.params.dmgPct + fl.params.burnPct * fl.params.burnDur * 0.6) * area(fl.params.radius, n) * burnt;
  } else { // the Dawn: Halo kept on her (its flare when it ends), Kind Light with the rest (half its presses at a foe)
    const halo = rt('halo'), kl = rt('kindLight');
    const rH = take(halo, halo ? 1 / halo.params.duration : 0, RAISE);
    P.halo = halo ? rH * halo.params.flarePct * (1 + 0.2 * halo.params.burnDur * 0.6) * area(halo.params.radius, n) : 0;
    const r = take(kl, 1 / AIM, AIM);
    P.kind = r * 0.5 * kl.params.rayPct * lineArea(kl.params.length, kl.params.width, n);
  }
  const atk = stlSweep(A.params, n, d); P.swing = Math.max(0, time) * atk.per * 100 / atk.cycle;
  let dps = 0; for (const k in P) dps += P[k];
  if (parts) Object.assign(parts, P, { time, zoom });
  return dps / 100;
}
/** Stella's healing a second on herself, by build (the heal budget's Morning Light every 8 s; the Dawn's Halo kept on her
 *  and half its Kind Light presses healing her), as a share of her life a second */
export function stlHealRate(st, d, kind, heal) {
  const has = id => (st.player.skills[id] || 0) > 0, rt = id => (has(id) ? skillRuntime(id, st, d) : null);
  let h = 0;
  if (heal) { const ml = rt('morningLight'); if (ml) h += ml.params.healPct / 100 / 8; }
  if (kind === 'dawn') {
    const halo = rt('halo'), kl = rt('kindLight'), cm = d.castMul || 1;
    if (halo) h += halo.params.absorbPct / 100 / halo.params.duration;
    if (kl) { const left = Math.max(0, d.zoomRegen - (halo ? halo.cost / halo.params.duration : 0)), r = Math.min(1 / (0.5 / cm), left / kl.cost); h += r * 0.5 * kl.params.healPct / 100; }
  }
  return h;
}
/** the hex build's sustained damage (weapon-damage % per second) against n foes. Per second of fight, zoom and cast time are spent
 *  by priority: Everlasting Gloom kept up, one Grumble Cloud kept up, Mournful Awoo on its cooldown (it spreads the hexes to the whole
 *  pack), Dripping Paw with what's left; any time still free swings the flail. The hexes: every hexed foe carries min(cap, stacks
 *  applied over a hex's run) stacks, each ticking the strongest hex's dps (one hex record per foe: combat/shihtzuSkills.js stzHex). */
export function hexRotation(st, d, n, parts = null) {
  const has = id => (st.player.skills[id] || 0) > 0, rt = id => (has(id) ? skillRuntime(id, st, d) : null);
  const paw = rt('drippingPaw'), cloud = rt('grumbleCloud'), awoo = rt('mournfulAwoo'), ever = rt('everlastingGloom'), A = skillRuntime('attack', st, d);
  const cm = d.castMul || 1;
  let zoom = d.zoomRegen, time = 1, dps = 0;
  const take = (R, rate, castT) => { if (!R) return 0; const r = Math.max(0, Math.min(rate, zoom / R.cost, time / castT)); zoom -= r * R.cost; time -= r * castT; return r; };
  const rEver = take(ever, ever ? 1 / Math.max(ever.cd, ever.params.duration) : 0, 0.7 / cm);
  const rCloud = take(cloud, cloud ? 1 / Math.max(cloud.cd, cloud.params.duration) : 0, 0.42 / cm);
  const rAwoo = take(awoo, awoo ? 1 / awoo.cd : 0, 1.1);
  const rPaw = take(paw, 1 / (0.42 / cm), 0.42 / cm);
  const everUp = ever ? Math.min(1, rEver * ever.params.duration) : 0, cloudUp = cloud ? Math.min(1, rCloud * cloud.params.duration) : 0;
  const pawArea = area(paw.params.radius, n), hexed = n <= 1 ? 1 : Math.max(pawArea, everUp > 0.5 ? area(ever.params.radius, n) : 0, rAwoo > 0 ? area(Math.min(awoo.params.radius, RP + 1), n) : 0);
  const cap = d.hexStacks || 3, dur = paw.params.duration;
  const stacks = Math.min(cap, everUp + rPaw * dur * Math.min(1, pawArea / hexed) + (rAwoo > 0 ? rAwoo * awoo.params.spread * dur : 0));
  const dot = Math.max(paw.params.dotPct, everUp > 0.5 ? ever.params.dotPct : 0);
  const atk = BUILDS.shihtzu.attack(A.params, n, d);
  const P = {
    hex: stacks * dot * hexed, paw: rPaw * paw.params.dmgPct * pawArea,
    cloud: cloud ? cloudUp * cloud.params.dmgPct / cloud.params.tick * area(cloud.params.radius, n) : 0,
    awoo: awoo ? rAwoo * awoo.params.dmgPct * area(Math.min(awoo.params.radius, RP + 1), n) : 0,
    burst: ever ? rEver * ever.params.burstPct * 0.3 * (n <= 1 ? 0 : Math.min(n - 1, 1 + ever.params.jumps)) : 0, // (a few foes drop inside a fight: their bursts)
    swing: Math.max(0, time) * atk.per * 100 / atk.cycle,
  };
  for (const k in P) dps += P[k];
  if (parts) Object.assign(parts, P, { stacks, hexed, rPaw, rAwoo, rEver, rCloud, time });
  return dps / 100;
}

/** a hero at `lvl` with the build above → { st, d } */
export function buildHero(id, lvl) {
  const B = BUILDS[id], h = newHeroState(B.hero || id), st = { player: h.player, equipment: h.equipment, flags: {} }, P = st.player;
  P.lvl = lvl; P.skillPts = lvl; P.skills = {};
  const pts = (lvl - 1) * 5, share = B.stat === 'ene' && (B.hero || id) === 'stella' ? 0.7 : 0.5; // (Stella: 70% of her points in Energy, her damage stat AND her zoom, as Moka's plan in STELLA §7)
  if (share !== 0.5) { P.stats.ene += Math.round(pts * share); P.stats.vit += pts - Math.round(pts * share); }
  else P.stats[B.stat] += Math.round(pts * 0.5); if (share === 0.5) { P.stats.vit += Math.round(pts * 0.3); P.stats.ene += pts - Math.round(pts * 0.5) - Math.round(pts * 0.3); }
  // skill points: the main skill first, then its mastery, then the synergy picks (each as far as the level gates allow)
  const plan = B.plan || [B.skill, B.mastery, ...B.extra].map(s => [s, 20]); // ([skill, up to level] in order: a plan puts points in steps)
  // (the balance models the finished class: skills still "in training" — built at a later checkpoint — count as learnable)
  const locked = [...SHIHTZU_TRAINING], lockedG = [...GOLDEN_TRAINING], lockedS = [...STELLA_TRAINING]; SHIHTZU_TRAINING.clear(); GOLDEN_TRAINING.clear(); STELLA_TRAINING.clear();
  try {
    for (let guard = 0; guard < 400 && P.skillPts > 0; guard++) {
      const step = plan.find(([s, max]) => (P.skills[s] || 0) < max && canLearn(s, st).ok);
      if (!step) break;
      P.skills[step[0]] = (P.skills[step[0]] || 0) + 1; P.skillPts--;
    }
  } finally { for (const id of locked) SHIHTZU_TRAINING.add(id); for (const id of lockedG) GOLDEN_TRAINING.add(id); for (const id of lockedS) STELLA_TRAINING.add(id); }
  // the gear: the best normal base of the weapon type the level allows (same rule for every hero)
  const base = GEAR_BASE_IDS.map(k => ITEM_BASES[k]).filter(b => b.wtype === B.wtype && b.req.lvl <= lvl && b.lvl <= lvl).sort((a, b) => (b.dmg[0] + b.dmg[1]) - (a.dmg[0] + a.dmg[1]))[0];
  st.equipment.weapon = generateItem({ ilvl: lvl, base: base.id, rarity: 'normal', rng: new RNG(5) }); st.equipment.weaponAlt = null;
  return { st, d: computeStats(st) };
}
function fight({ cost, cd, cycle, per, atk, zoomMax, regen }) {
  let t = 0, z = zoomMax, dmg = 0, casts = 0, ready = 0;
  while (t < FIGHT) {
    if (ready > t || z < cost) { // wait (for the cooldown or the zoom), slashing / bolting meanwhile
      const w = Math.max(ready - t, z < cost ? (cost - z) / regen : 0, 0.01);
      dmg += atk.per * w / atk.cycle; z = Math.min(zoomMax, z + regen * w); t += w; continue;
    }
    z -= cost; dmg += per; casts++; t += cycle; z = Math.min(zoomMax, z + regen * cycle); ready = t - cycle + cd;
  }
  return { dps: dmg / FIGHT, casts };
}
/** one hero at one level → { lvl, dmg: [min, max], life, zoom, pack, single, blend (weapon-damage % per second), dps (blend × avg damage), ehp, dodge } */
export function heroAt(id, lvl) {
  const B = BUILDS[id], { st, d } = buildHero(id, lvl), A = skillRuntime('attack', st, d);
  // (a build with `alt` [{ skill, cycle, hits }]: whichever of its skills fights better at this level is the one on repeat —
  //  the javelin build spams Bonk Dart until Tailwag Volley has a few points)
  const opts = [{ skill: B.skill, cycle: B.cycle, hits: B.hits }, ...(B.alt || [])].filter(o => skillRuntime(o.skill, st, d));
  const run = o => { const R = skillRuntime(o.skill, st, d), r = { R, o };
    for (const [k, n] of [['pack', PACK], ['single', 1]]) r[k] = Math.round(fight({ cost: R.cost, cd: R.cd, cycle: o.cycle(R, d), per: o.hits(R.params, n, d), atk: B.attack(A.params, n, d), zoomMax: d.zoomMax, regen: d.zoomRegen }).dps * 100) / 100;
    r.blend = BLEND * r.pack + (1 - BLEND) * r.single; return r; };
  const best = B.rotation ? null : opts.map(run).sort((a, b) => b.blend - a.blend)[0], R = best ? best.R : skillRuntime(B.skill, st, d);
  const out = { id, lvl, skill: best ? best.o.skill : B.skill, skillLvl: R.lvl, dmg: [d.dmgMin, d.dmgMax], life: d.lifeMax, zoom: d.zoomMax, regen: d.zoomRegen, crit: d.crit, dodge: d.dodge || 0, block: d.block || 0 };
  for (const [k, n] of [['pack', PACK], ['single', 1]]) out[k] = B.rotation ? Math.round(B.rotation(st, d, n) * 100) / 100 : best[k];
  const avg = (d.dmgMin + d.dmgMax) / 2 * (1 + d.crit / 100 * ((d.critMul || 1.5) - 1));
  out.blend = Math.round((BLEND * out.pack + (1 - BLEND) * out.single) * 100) / 100;
  out.dps = Math.round(out.blend * avg); out.singleDps = Math.round(out.single * avg);
  out.dr = d.dmgReduce || 0; // (the Shih Tzu's class damage reduction and Iron Topknot: stats.js shihtzuPassives)
  out.ehp = Math.round(d.lifeMax / ((1 - out.dodge / 100) * (1 - out.block / 100) * (1 - playerPhysDR(d.def || 0, lvl)) * (1 - out.dr / 100)));
  return out;
}
export function compare(levels = [6, 15, 30]) {
  return levels.map(L => { const r = Object.fromEntries(Object.keys(BUILDS).map(id => [id, heroAt(id, L)])); return { lvl: L, ...r }; });
}
/** Poe's blend dps over the Chewy–Moka mean, per level (the band test-rpg asserts: docs/POE.md §4); step: the Shadow Step
 *  build's clear (blend) and single-target dps over the mean's (a single-target specialist: ≥ ×0.6 clear, ≥ ×1.2 single) */
export function poeBand(levels = [6, 15, 30, 45]) {
  return compare(levels).map(r => {
    const mean = k => (r.chewy[k] + r.moka[k]) / 2, S = r['poe·step'];
    return { lvl: r.lvl, dps: r.poe.dps / mean('dps'), ehp: r.poe.ehp / mean('ehp'), life: r.poe.life / mean('life'), step: { clear: S.dps / mean('dps'), single: S.singleDps / mean('singleDps') } };
  });
}

/** the Shih Tzu's blend dps and eHP over the Chewy–Moka–Poe mean, per level (the band test-rpg asserts: docs/SHIHTZU.md §4; the
 *  tank: a little under the mean in damage, well over it in survivability); hex: the hex build's clear (blend) and single target */
export function stzBand(levels = [6, 15, 30, 45]) {
  return compare(levels).map(r => {
    const mean = k => (r.chewy[k] + r.moka[k] + r.poe[k]) / 3, X = r['shihtzu·hex'];
    return { lvl: r.lvl, dps: r.shihtzu.dps / mean('dps'), ehp: r.shihtzu.ehp / mean('ehp'), life: r.shihtzu.life / mean('life'), hex: { clear: X.dps / mean('dps'), single: X.singleDps / mean('singleDps') } };
  });
}

/** Foosy's blend dps and eHP over the Chewy–Moka–Poe–Shih Tzu mean, per level (the band test-rpg asserts: docs/GOLDEN.md
 *  §4; mid-pack damage, solid life below the Shih Tzu's); jav: the javelin build's clear (blend) and single target */
export function gldBand(levels = [6, 15, 30, 45]) {
  return compare(levels).map(r => {
    const ids = ['chewy', 'moka', 'poe', 'shihtzu'], mean = k => ids.reduce((a, id) => a + r[id][k], 0) / ids.length, X = r['golden·jav'];
    const Y = r['golden·whelp'];
    return { lvl: r.lvl, dps: r.golden.dps / mean('dps'), ehp: r.golden.ehp / mean('ehp'), life: r.golden.life / mean('life'), stzEhp: r.golden.ehp / r.shihtzu.ehp, jav: { clear: X.dps / mean('dps'), single: X.singleDps / mean('singleDps') }, whelp: { clear: Y.dps / mean('dps'), single: Y.singleDps / mean('singleDps') } };
  });
}

/** Stella's clear (blend dps) and single-target dps over the five-hero mean (Chewy, Moka, Poe, the Shih Tzu, Foosy) per level,
 *  by build (docs/STELLA.md §7), and the time to fall under the standard pressure (incoming 5% of the mean's life a second,
 *  after defence: the mean falls in ~20 s; her heals and halo counted; capped at 60 s, the fight) */
export function stlBand(levels = [6, 15, 30, 45]) {
  return compare(levels).map(r => {
    const ids = ['chewy', 'moka', 'poe', 'shihtzu', 'golden'], mean = k => ids.reduce((a, id) => a + r[id][k], 0) / ids.length;
    const inc = 0.05 * mean('life'), fall = (life, ehp, hps) => Math.min(60, life / Math.max(1e-6, inc - hps * life)) * (ehp / life);
    const tMean = ids.reduce((a, id) => a + fall(r[id].life, r[id].ehp, 0), 0) / ids.length;
    const row = { lvl: r.lvl, tMean };
    for (const [k, kind, heal] of [['ray', 'ray', false], ['flare', 'flare', false], ['dawn', 'dawn', false], ['heal', 'ray', true], ['solar', 'ray', false]]) {
      const id = { ray: 'stella', flare: 'stella·flare', dawn: 'stella·dawn', heal: 'stella·heal', solar: 'stella·solar' }[k], X = r[id], h = buildHero(id, r.lvl);
      row[k] = { clear: X.dps / mean('dps'), single: X.singleDps / mean('singleDps'), falls: fall(X.life, X.ehp, stlHealRate(h.st, h.d, kind, heal)) / tMean, life: X.life / mean('life') };
    }
    return row;
  });
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/hero-balance.mjs')) {
  const a = process.argv.slice(2), li = a.indexOf('--levels');
  const levels = li >= 0 ? a[li + 1].split(',').map(Number) : [6, 15, 30, 45];
  console.log(`hero balance: ${FIGHT}s fights, ${Math.round(BLEND * 100)}% vs a pack of ${PACK} + ${Math.round((1 - BLEND) * 100)}% single; dps = blend × average hit (crits in)`);
  for (const row of compare(levels)) {
    console.log(`\nlevel ${row.lvl}`);
    for (const id of Object.keys(BUILDS)) {
      const h = row[id];
      console.log(`  ${id.padEnd(8)} ${h.skill.padEnd(10)} L${String(h.skillLvl).padEnd(3)} dmg ${h.dmg.join('-').padEnd(7)} life ${String(h.life).padEnd(5)} dodge ${String(h.dodge).padEnd(5)} eHP ${String(h.ehp).padEnd(5)} zoom ${String(h.zoom).padEnd(4)} · pack ×${h.pack} single ×${h.single} blend ×${h.blend} → ${h.dps} dps (single ${h.singleDps})`);
    }
  }
  const band = poeBand(levels);
  console.log('\npoe vs the chewy–moka mean: ' + band.map(b => `L${b.lvl} dps ×${b.dps.toFixed(2)} eHP ×${b.ehp.toFixed(2)} life ×${b.life.toFixed(2)}`).join(' · '));
  console.log('shadow step build vs the mean: ' + band.map(b => `L${b.lvl} clear ×${b.step.clear.toFixed(2)} single ×${b.step.single.toFixed(2)}`).join(' · '));
  const sb = stzBand(levels);
  console.log('shih tzu vs the chewy–moka–poe mean: ' + sb.map(b => `L${b.lvl} dps ×${b.dps.toFixed(2)} eHP ×${b.ehp.toFixed(2)} life ×${b.life.toFixed(2)}`).join(' · '));
  console.log('hex build vs the mean: ' + sb.map(b => `L${b.lvl} clear ×${b.hex.clear.toFixed(2)} single ×${b.hex.single.toFixed(2)}`).join(' · '));
  const gb = gldBand(levels);
  console.log('foosy (lance) vs the chewy–moka–poe–shih tzu mean: ' + gb.map(b => `L${b.lvl} dps ×${b.dps.toFixed(2)} eHP ×${b.ehp.toFixed(2)} (×${b.stzEhp.toFixed(2)} the shih tzu's) life ×${b.life.toFixed(2)}`).join(' · '));
  console.log('javelin build vs the mean: ' + gb.map(b => `L${b.lvl} clear ×${b.jav.clear.toFixed(2)} single ×${b.jav.single.toFixed(2)}`).join(' · '));
  console.log('whelp build vs the mean: ' + gb.map(b => `L${b.lvl} clear ×${b.whelp.clear.toFixed(2)} single ×${b.whelp.single.toFixed(2)}`).join(' · '));
  for (const b of stlBand(levels)) console.log(`stella L${b.lvl} vs the five-hero mean (falls: × the mean's ${b.tMean.toFixed(1)} s): ` + ['ray', 'flare', 'dawn', 'heal', 'solar'].map(k => `${k} clear ×${b[k].clear.toFixed(2)} single ×${b[k].single.toFixed(2)} falls ×${b[k].falls.toFixed(2)}`).join(' · ') + ` · life ×${b.ray.life.toFixed(2)}`);
}
