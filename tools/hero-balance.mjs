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

export const FIGHT = 60, PACK = 5, RP = 3, BLEND = 0.7;
const area = (r, n) => (n <= 1 ? 1 : Math.max(1, Math.min(n, n * (r / RP) ** 2)));
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
};

/** a hero at `lvl` with the build above → { st, d } */
export function buildHero(id, lvl) {
  const B = BUILDS[id], h = newHeroState(B.hero || id), st = { player: h.player, equipment: h.equipment, flags: {} }, P = st.player;
  P.lvl = lvl; P.skillPts = lvl; P.skills = {};
  const pts = (lvl - 1) * 5; P.stats[B.stat] += Math.round(pts * 0.5); P.stats.vit += Math.round(pts * 0.3); P.stats.ene += pts - Math.round(pts * 0.5) - Math.round(pts * 0.3);
  // skill points: the main skill first, then its mastery, then the synergy picks (each as far as the level gates allow)
  const order = [B.skill, B.mastery, ...B.extra];
  for (let guard = 0; guard < 200 && P.skillPts > 0; guard++) {
    const id2 = order.find(s => (P.skills[s] || 0) < 20 && canLearn(s, st).ok);
    if (!id2) break;
    P.skills[id2] = (P.skills[id2] || 0) + 1; P.skillPts--;
  }
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
  const B = BUILDS[id], { st, d } = buildHero(id, lvl), R = skillRuntime(B.skill, st, d), A = skillRuntime('attack', st, d);
  const out = { id, lvl, skill: B.skill, skillLvl: R.lvl, dmg: [d.dmgMin, d.dmgMax], life: d.lifeMax, zoom: d.zoomMax, regen: d.zoomRegen, crit: d.crit, dodge: d.dodge || 0, block: d.block || 0 };
  for (const [k, n] of [['pack', PACK], ['single', 1]]) {
    const f = fight({ cost: R.cost, cd: R.cd, cycle: B.cycle(R, d), per: B.hits(R.params, n, d), atk: B.attack(A.params, n, d), zoomMax: d.zoomMax, regen: d.zoomRegen });
    out[k] = Math.round(f.dps * 100) / 100;
  }
  const avg = (d.dmgMin + d.dmgMax) / 2 * (1 + d.crit / 100 * ((d.critMul || 1.5) - 1));
  out.blend = Math.round((BLEND * out.pack + (1 - BLEND) * out.single) * 100) / 100;
  out.dps = Math.round(out.blend * avg); out.singleDps = Math.round(out.single * avg);
  out.ehp = Math.round(d.lifeMax / ((1 - out.dodge / 100) * (1 - out.block / 100) * (1 - playerPhysDR(d.def || 0, lvl))));
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
}
