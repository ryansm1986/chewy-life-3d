// The charged-abilities DPS-band sim (docs/CHARGE.md §3 Balance, §6): sustained damage of a skill-focused build that
// casts one skill on repeat for a 60 s fight, tapping vs. fully charging (Stage Ⅲ, every perk), against a pack and a single
// target. Test-only (imported by tools/test-rpg.mjs; never bundled into the game).
//   node tools/charge-sim.mjs [ids...] [--stage 3] [--quiet]
//
// The model, per skill (all numbers are the real skillRuntime / chargeRuntime params at hero level 30, skill level 12):
// - the hero is a skill build: 145 stat points, half in Energy (zoom), the rest split; no gear;
// - a cast takes CAST s (the release animation); a charged cast first charges for the Stage Ⅲ time (Quick Wind-up 3), and
//   can't start charging while the skill is cooling down (as in the game); zoom regenerates the whole time, and the release
//   waits at full charge until it can be paid for;
// - any time the hero isn't casting or charging, the basic Attack fills in (it costs nothing), so waiting for zoom isn't free
//   for the tapper; charging is time the hero isn't attacking;
// - damage per cast = Σ dmgPct × the foes each part hits: a pack of PACK foes within 3 m of the aim point (area parts hit
//   ~PACK·(r/3)², lines ~2.6, fans by the share of their spread the pack fills, bounces by their count), or one target;
// - channels (Whirlwind Stance, Moonbeam) channel in 3 s bursts (the charged one winds up first, then revs, then spins out free);
// - summons and buffs report a value ratio (their damage × uptime, or what they protect / heal); the band is asserted on
//   the damage skills.
import { newHeroState } from '../src/rpg/actions.js';
import { computeStats } from '../src/rpg/stats.js';
import { skillRuntime, SKILLS } from '../src/rpg/skills.js';
import { CHARGE, chargeRuntime, stageTimes, PERK_STAGE } from '../src/rpg/charge.js';
import { poeSim } from './charge-sim-poe.mjs';
import { shihtzuSim } from './charge-sim-shihtzu.mjs';
import { goldenSim } from './charge-sim-golden.mjs';

export const PACK = 5, RP = 3, CAST = 0.5, FIGHT = 60, ATK = { pct: 100, every: 0.45 };
export const BAND = [1.1, 1.3]; // sustained gain of a fully charged, fully perked cast over tapping (docs/CHARGE.md §3), on the blend below
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** foes hit by the parts of a cast. sc: { n: foes in the pack (1 = a single target) } */
const area = (r, sc) => (sc.n <= 1 ? 1 : clamp(sc.n * (r / RP) ** 2, 1, sc.n));
const line = (pierce, sc) => (sc.n <= 1 ? 1 : Math.min(1 + pierce, 2.6));
const fan = (count, spread, sc) => count * Math.min(1, (sc.n <= 1 ? 9.5 : 53) / Math.max(1, spread)); // (a pack 6 m off fills ~53°, a lone foe ~9.5°)
const bounces = (n, sc) => (sc.n <= 1 ? 1 : n);
const rk = (k, id) => k?.[id] || 0;
const pp = (c, s, id) => c.perks[id].pct * PERK_STAGE[Math.max(0, Math.min(2, (s || 1) - 1))]; // (perk damage grows with the charge)

// expected damage % per cast (Σ dmgPct × foes), by skill. p: params, k: perks (charged only), s: stage (0 = tap)
const DMG = {
  chomp: (p, k, s, sc) => p.dmgPct * area(p.radius, sc) * Math.min(1, p.arc / 200) + (p.wave ? p.dmgPct * p.wavePct / 100 * area(Math.min(p.wave, RP + 1), sc) * 0.8 : 0),
  dig: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (1 + (rk(k, 'aftershock') ? pp(c, s, 'aftershock') / 100 : 0)),
  bonestorm: (p, k, s, sc, c) => p.dmgPct * Math.min(p.count * p.orbitSpeed / 6.283, 1 / p.hitInterval * 1.6) * p.duration * area(p.radius, sc) * 0.5 + (rk(k, 'volley') ? p.count * p.dmgPct * pp(c, s, 'volley') / 100 * 0.8 : 0),
  throw: (p, k, s, sc, c) => { const L = line(p.pierce, sc), n = 1 + (s ? rk(k, 'split') * 0.7 * (sc.n > 1 ? 0.8 : 0) : 0); return p.dmgPct * L * n * (1 + (rk(k, 'boomerang') ? pp(c, s, 'boomerang') / 100 : 0)); },
  ricochet: (p, k, s, sc, c) => { const n = bounces(p.bounces + 1, sc), pin = rk(k, 'pinball') ? 1 + c.perks.pinball.dmg * (n - 1) / 2 : 1; return p.dmgPct * n * pin * (1 + (s ? (p.arcPct || 0) / 100 * (sc.n > 1 ? 1 : 0) + (rk(k, 'cling') ? pp(c, s, 'cling') / 100 : 0) : 0)); },
  multi: (p, k, s, sc, c) => p.dmgPct * fan(p.count, p.spread, sc) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0)) * (rk(k, 'bouncy') && sc.n > 1 ? 1.3 : 1),
  blaze: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDuration * 0.6) * area(p.radius, sc) * (1 + (rk(k, 'hotPotato') ? c.perks.hotPotato.hops * pp(c, s, 'hotPotato') / 100 * (sc.n > 1 ? 1 : 0.5) : 0)),
  fetchstorm: (p, k, s, sc, c) => p.dmgPct * p.count * Math.min(1, sc.n * (p.impactRadius / p.radius) ** 2) + (rk(k, 'bigOne') ? p.dmgPct * pp(c, s, 'bigOne') / 100 * area(c.perks.bigOne.r, sc) : 0),
  woof: (p, k, s, sc, c) => p.dmgPct * area(s ? Math.min(p.reach, RP + 1) : p.radius, sc) * (s ? Math.min(1, (p.cone || 90) / 90) : 0.8) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0)) * (rk(k, 'bigBad') ? 1 + c.perks.bigBad.vuln / 100 * 0.5 : 1),
  zoom: (p, k, s, sc, c) => p.dmgPct * line(Math.min(p.distance / 2.5, 4), sc) * (s && rk(k, 'pingpong') ? 1.6 : 1) + (s ? p.dmgPct * (p.trailPct || 0) / 100 * line(3, sc) * (p.trail / 0.5) * 0.5 : 0) + (rk(k, 'afterimage') ? p.dmgPct * pp(c, s, 'afterimage') / 100 * area(2, sc) : 0),
  moonhowl: (p, k, s, sc, c) => p.dmgPct * p.strikes * Math.min(1, area(p.strikeRadius, sc) / Math.max(1, sc.n) * (sc.n > 1 ? 2.2 : 1)) + (s >= 3 && rk(k, 'eclipse') ? p.dmgPct * pp(c, s, 'eclipse') / 100 * c.perks.eclipse.dur * 2 * area(p.radius, sc) * 0.5 : 0),
  splash: (p, k, s, sc, c) => p.dmgPct * (1 + p.splashPct / 100 * (area(p.splashRadius, sc) - 1)) * (1 + (s ? rk(k, 'split') * 0.7 * (sc.n > 1 ? 0.8 : 0) : 0)) + (rk(k, 'rain') ? p.dmgPct * pp(c, s, 'rain') / 100 * c.perks.rain.n[2] * Math.min(1, area(c.perks.rain.r, sc) / 2) : 0),
  shake: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0)),
  puddleHop: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) + (rk(k, 'hopscotch') ? p.dmgPct * pp(c, s, 'hopscotch') / 100 * Math.min(c.perks.hopscotch.n, sc.n - 1) * area(1.6, sc) / Math.max(1, sc.n) * 2 : 0),
  whirlpool: (p, k, s, sc, c) => p.dmgPct * p.duration / p.tick * area(p.radius, sc) * 0.4 + (rk(k, 'geyser') ? p.dmgPct * pp(c, s, 'geyser') / 100 * area(p.radius, sc) : 0),
  greatWave: (p, k, s, sc) => p.dmgPct * area(Math.min(p.width / 2, RP + 1), sc) * (p.carry ? 1.15 : 1),
  kibble: (p, k, s, sc, c) => p.dmgPct * p.count * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0) + (rk(k, 'twinkle') ? pp(c, s, 'twinkle') / 100 * (sc.n > 1 ? 1.5 : 1) : 0)),
  squeak: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (1 + (rk(k, 'squeakSqueak') ? c.perks.squeakSqueak.n[2] * pp(c, s, 'squeakSqueak') / 100 * 0.8 : 0) + (rk(k, 'stars') ? pp(c, s, 'stars') / 100 * (sc.n > 1 ? 2 : 0) : 0)),
  pawRune: (p, k, s, sc, c) => p.dmgPct * area(p.radius, sc) * (s && p.lure ? 1.1 : 1) + (s ? rk(k, 'split') * p.dmgPct * pp(c, s, 'split') / 100 * area(p.radius * 0.75, sc) * 0.6 : 0) + (rk(k, 'parade') ? c.perks.parade.n * p.dmgPct * pp(c, s, 'parade') / 100 * area(p.radius * 0.6, sc) * 0.6 : 0),
  constellation: (p, k, s, sc, c) => p.dmgPct * Math.min(p.links, sc.n <= 1 ? 1 : sc.n) * (1 + p.twinklePct / 100) + (rk(k, 'chart') ? p.dmgPct * pp(c, s, 'chart') / 100 * c.perks.chart.t * 0.5 * Math.min(p.links, sc.n) : 0) + (rk(k, 'dipper') && sc.n >= 7 ? p.dmgPct * pp(c, s, 'dipper') / 100 * area(c.perks.dipper.r, sc) : 0),
  meteor: (p, k, s, sc, c) => (p.dmgPct + p.burnPct * p.burnDuration * 0.6) * area(p.radius, sc) + (s >= 3 && rk(k, 'shower') ? c.perks.shower.n * p.dmgPct * pp(c, s, 'shower') / 100 * area(1.6, sc) * 0.6 : 0),
  fetchLeash: (p, k, s, sc, c) => p.dmgPct * Math.min(p.grabs || 1, sc.n) * (1 + (s ? (p.slamPct || 0) / 100 * (sc.n > 1 ? 1.5 : 0) : 0)) + (rk(k, 'fling') ? p.dmgPct * pp(c, s, 'fling') / 100 * area(2, sc) * 0.5 : 0),
  feathers: (p, k, s, sc, c) => p.dmgPct * fan(p.count, p.spread, sc) * line(p.pierce, sc) / (sc.n <= 1 ? 1 : 1.6) * (1 + (rk(k, 'echo') ? pp(c, s, 'echo') / 100 : 0)) + (rk(k, 'pillow') ? c.perks.pillow.n * p.dmgPct * pp(c, s, 'pillow') / 100 * (sc.n > 1 ? 2 : 1) : 0),
  duckCall: (p, k, s, sc, c) => p.dmgPct * area(Math.min(p.radius, RP + 1), sc) + (rk(k, 'goose') && s >= 3 ? c.perks.goose.n * p.dmgPct * pp(c, s, 'goose') / 100 : 0),
  mallards: (p, k, s, sc, c) => p.dmgPct * p.count * Math.min(1, area(p.impactRadius, sc) * (RP / Math.max(RP, p.area)) ** 2 * 1.4) * (1 + (rk(k, 'loop') ? pp(c, s, 'loop') / 100 : 0)),
};
// channels: damage % per second while channelling, and the charged extras (spin-out seconds, the finale burst)
const CHAN = {
  whirl: (p, k, s, sc, c) => ({ dps: p.dmgPct * p.hitsPerSec * area(p.radius + (s && p.pull ? 0.35 : 0), sc) * (s && p.pull ? 1.15 : 1), out: s ? p.spinOut || 0 : 0, burst: s && rk(k, 'finale') ? p.dmgPct * pp(c, s, 'finale') / 100 * area(p.radius, sc) : 0 }),
  moonbeam: (p, k, s, sc, c) => ({ dps: p.dmgPct * p.ticksPerSec * area(p.radius, sc) * (s >= 2 && rk(k, 'twin') ? 1 + pp(c, s, 'twin') / 100 * 0.6 : 1), out: s ? p.linger || 0 : 0, burst: s ? p.dmgPct * (p.burstPct || 150) / 100 * area(2, sc) + (rk(k, 'crescent') ? p.dmgPct * pp(c, s, 'crescent') / 100 * area(c.perks.crescent.r, sc) * 0.6 : 0) : 0 }),
};
// summons / buffs: a value per cast (not asserted against the damage band)
const VALUE = {
  decoy: (p, k, s, sc, c) => p.dmgPct * (p.duration / p.pulse) * area(p.cloudRadius, sc) * Math.min(1, p.life / 400) * (rk(k, 'double') ? 1.4 : 1) + (rk(k, 'finale') ? p.dmgPct * pp(c, s, 'finale') / 100 * area(3, sc) : 0),
  duckDecoy: (p, k, s, sc, c) => p.dmgPct * area(p.popRadius, sc) + (rk(k, 'ducklings') ? c.perks.ducklings.n[2] * p.dmgPct * pp(c, s, 'ducklings') / 100 * area(1.5, sc) : 0),
  spiritRetriever: (p, k, s, sc, c) => p.dmgPct * Math.min(30, p.life / 25) / p.biteCd * (rk(k, 'goodGirl') ? 1.15 : 1) * (rk(k, 'puppy') && s >= 3 ? 1 + c.perks.puppy.k : 1),
  packcall: (p, k, s) => p.pupDmgPct * (p.pups + ((p.alpha || 1) - 1)) * (rk(k, 'packLeader') ? 1.1 : 1),
  treat: (p, k, s, sc) => p.healPct + p.healFlat / 3 + p.dmgPct * area(p.radius, sc) * 0.3,
  howl: (p, k, s) => p.dmgBuff * p.duration,
  bubble: (p, k, s, sc) => p.absorb + p.dmgPct * area(p.radius, sc) * 0.5,
};
// Poe's models (tools/charge-sim-poe.mjs: her 15 damage skills, her summon and her two buffs)
{ const poe = poeSim({ area, line, fan, rk, pp, RP }); Object.assign(DMG, poe.DMG); Object.assign(VALUE, poe.VALUE); }
// the Shih Tzu's (tools/charge-sim-shihtzu.mjs: 9 damage skills, the Maelstrom channel, 2 summons and 3 buffs)
{ const stz = shihtzuSim({ area, line, fan, rk, pp, RP }); Object.assign(DMG, stz.DMG); Object.assign(CHAN, stz.CHAN); Object.assign(VALUE, stz.VALUE); }
// Foosy's (tools/charge-sim-golden.mjs: 12 damage skills, Dragon Heart and 2 buffs)
{ const gld = goldenSim({ area, line, fan, rk, pp, RP }); Object.assign(DMG, gld.DMG); Object.assign(VALUE, gld.VALUE); }
export const KIND = id => (DMG[id] ? 'damage' : CHAN[id] ? 'channel' : 'utility');

/** a skill-build hero at level 30 with skill level `lvl` in every charged skill of its class */
export function simHero(hero, lvl = 12) {
  const h = newHeroState(hero), st = { player: h.player, equipment: h.equipment };
  st.player.lvl = 30;
  const pts = 145; st.player.stats.ene += Math.round(pts * 0.5); st.player.stats.vit += Math.round(pts * 0.25);
  const main = hero === 'moka' || hero === 'poe' ? 'dex' : 'str'; st.player.stats[main] = (st.player.stats[main] || 0) + Math.round(pts * 0.25);
  for (const id of Object.keys(CHARGE)) if (SKILLS[id].cls === hero) st.player.skills[id] = lvl;
  return { st, d: computeStats(st) };
}
const fullPerks = id => Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks]));

/** run the 60 s fight: → { dmg, casts } (damage in skill-% units, basic attacks included) */
function fight({ cost, cd, prep, per, zoomMax, regen }) {
  let t = 0, z = zoomMax, ready = 0, dmg = 0, casts = 0;
  const filler = dtt => { dmg += ATK.pct * dtt / ATK.every; };
  while (t < FIGHT) {
    // wait for the cooldown (attacking meanwhile)
    if (ready > t) { const w = Math.min(ready, FIGHT) - t; filler(w); z = Math.min(zoomMax, z + regen * w); t += w; continue; }
    // the charge (or nothing, for a tap), during which zoom regenerates; then wait for the zoom to pay for it
    t += prep; z = Math.min(zoomMax, z + regen * prep);
    if (z < cost) { const w = (cost - z) / regen; if (prep > 0) { t += w; z = cost; } else { filler(w); t += w; z = cost; } }
    if (t > FIGHT) break;
    z -= cost; dmg += per; casts++;
    t += CAST; z = Math.min(zoomMax, z + regen * CAST); ready = t - CAST + cd;
  }
  return { dmg, casts };
}
function chanFight({ costPerSec, wind, chan, dps, out, burst, zoomMax, regen }) {
  // channel in bursts of `chan` s (zoom allowing), then spin out free; attack while waiting for zoom
  let t = 0, z = zoomMax, dmg = 0;
  while (t < FIGHT) {
    const need = costPerSec * chan;
    if (z < need * 0.5) { const w = (need - z) / regen; dmg += ATK.pct * w / ATK.every; t += w; z = need; continue; }
    t += wind; z = Math.min(zoomMax, z + regen * wind);
    const len = Math.min(chan, z / Math.max(0.01, costPerSec - regen) || chan);
    dmg += dps * len; z -= (costPerSec - regen) * len; t += len;
    dmg += dps * out + burst; t += out; z = Math.min(zoomMax, z + regen * out);
  }
  return { dmg };
}

/** sustained ratio of charging (stage s, perks k) over tapping for one skill → { kind, pack, single, burst } */
export function chargeBand(id, { stage = 3, perks = null, lvl = 12 } = {}) {
  const c = CHARGE[id], hero = SKILLS[id].cls;
  const { st, d } = simHero(hero, lvl);
  st.player.chargePerks = {};
  const R0 = skillRuntime(id, st, d);
  st.player.chargePerks = { [id]: perks || fullPerks(id) };
  const k = st.player.chargePerks[id], R = chargeRuntime(id, st, d, stage);
  const t = stageTimes(c, k)[stage - 1];
  const out = { id, kind: KIND(id), stage, t: Math.round(t * 100) / 100, cost: [R0.cost, R.cost] };
  for (const [name, sc] of [['pack', { n: PACK }], ['single', { n: 1 }]]) {
    let a, b, b0, b1;
    if (DMG[id]) {
      b0 = DMG[id](R0.params, {}, 0, sc, c); b1 = DMG[id](R.params, k, stage, sc, c);
      a = fight({ cost: R0.cost, cd: R0.cd, prep: 0, per: b0, zoomMax: d.zoomMax, regen: d.zoomRegen });
      b = fight({ cost: R.cost, cd: R0.cd, prep: t, per: b1, zoomMax: d.zoomMax, regen: d.zoomRegen });
    } else if (CHAN[id]) {
      const x0 = CHAN[id](R0.params, {}, 0, sc, c), x1 = CHAN[id](R.params, k, stage, sc, c);
      b0 = x0.dps; b1 = x1.dps;
      a = chanFight({ costPerSec: R0.cost, wind: 0, chan: 3, dps: x0.dps, out: 0, burst: 0, zoomMax: d.zoomMax, regen: d.zoomRegen });
      b = chanFight({ costPerSec: R.cost, wind: stageTimes(c, k)[0], chan: 3, dps: x1.dps, out: x1.out, burst: x1.burst, zoomMax: d.zoomMax, regen: d.zoomRegen });
    } else {
      b0 = VALUE[id](R0.params, {}, 0, sc, c); b1 = VALUE[id](R.params, k, stage, sc, c);
      // utility: value per zoom, charged over tapped (they're cast once per need, so time matters little)
      a = { dmg: b0 / R0.cost }; b = { dmg: b1 / R.cost };
    }
    out[name] = Math.round(b.dmg / a.dmg * 100) / 100;
    if (name === 'pack') out.burst = Math.round(b1 / b0 * 100) / 100;
  }
  return out;
}

// ------------------------------------------------------------------ the solver (the balance pass)
// The band is measured on a blended fight: BLEND of the time against packs, the rest against single targets
// (champions, bosses). Targets per stage rise, so a longer charge is always the better sustained choice.
export const BLEND = 0.7, TARGET = [1.06, 1.14, 1.22], STAGE_OK = [0.95, 1.32]; // (Ⅰ / Ⅱ: about as good sustained as a full charge; it pays in burst)
export const blendOf = r => Math.round((BLEND * r.pack + (1 - BLEND) * r.single) * 100) / 100;
const SUMMON_DMG = new Set(['decoy', 'duckDecoy', 'spiritRetriever']);
/** solve one skill's tune → { dmg: [Ⅰ, Ⅱ, Ⅲ], shape } (null for the buffs). Rules: a charged hit is never weaker than
 *  a tap's or the stage before's; the release's growth in area / count / length is trimmed first. */
export function solveTune(id) {
  const c = CHARGE[id], kind = KIND(id);
  if (kind === 'utility' && !SUMMON_DMG.has(id)) return null;
  const save = c.tune, r2 = v => Math.round(v * 100) / 100;
  const at = (dmg, shape, stage) => { c.tune = { dmg, shape }; return blendOf(chargeBand(id, { stage })); };
  const { st, d } = simHero(SKILLS[id].cls);
  const tapDmg = skillRuntime(id, st, d).params.dmgPct || 0;
  st.player.chargePerks = { [id]: fullPerks(id) };
  const tableDmg = s => { c.tune = null; return chargeRuntime(id, st, d, s).params.dmgPct || 0; };
  const T = [1, 2, 3].map(tableDmg), floor = s => (tapDmg && T[s - 1] ? tapDmg / T[s - 1] : 0.05);
  const solveM = (g, s, mm = [1, 1, 1], lo = 0.05, hi = 6) => {
    const mk = v => mm.map((x, i) => (i === s - 1 ? v : x));
    if (at(mk(lo), g, s) >= TARGET[s - 1]) return lo;
    for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; if (at(mk(m), g, s) < TARGET[s - 1]) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // per stage, from Ⅲ down: the most growth (a non-decreasing share) that still lands on target with the hit at the
  // tap's, then the hit that lands it exactly (never under the tap's, never above the next stage's)
  const g = [1, 1, 1], m = [1, 1, 1];
  for (const s of [3, 2, 1]) {
    const fl = floor(s), cap = s === 3 ? 1 : g[s];
    if (kind !== 'utility' || SUMMON_DMG.has(id)) {
      const dm = m.map((v, i) => (i === s - 1 ? fl || 0.05 : v));
      let best = 0;
      for (let x = Math.round(cap * 20); x >= 0; x--) { const gg = g.map((v, i) => (i === s - 1 ? x / 20 : v)); if (at(dm, gg, s) <= TARGET[s - 1]) { best = x / 20; break; } }
      g[s - 1] = best;
    }
    // (rounded the safe way: up to the floor, down under the next stage's hit)
    const up = x => Math.ceil(x * 100 - 1e-6) / 100, dn = x => Math.floor(x * 100 + 1e-6) / 100;
    let v = Math.max(r2(solveM(g, s, m)), up(fl));
    if (s < 3 && tapDmg && T[s - 1] * v > T[s] * m[s]) v = Math.max(up(fl), dn(T[s] * m[s] / T[s - 1]));
    m[s - 1] = v;
  }
  c.tune = { dmg: m.slice(), shape: g.slice() };
  const res = [1, 2, 3].map(s => blendOf(chargeBand(id, { stage: s })));
  c.tune = save;
  return { dmg: m.slice(), shape: g, blend: res, over: res[2] < BAND[0] || res[2] > BAND[1] || res.some(x => x < STAGE_OK[0] || x > STAGE_OK[1]) };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/charge-sim.mjs')) {
  const args = process.argv.slice(2), ids = args.filter(a => !a.startsWith('--') && !/^\d$/.test(a));
  if (args.includes('--solve')) {
    const out = {};
    for (const id of (ids.length ? ids : Object.keys(CHARGE))) { const t = solveTune(id); if (t) out[id] = { dmg: t.dmg, shape: t.shape }; console.log(id.padEnd(16), t ? `tune: { dmg: [${t.dmg.join(', ')}], shape: [${t.shape.join(', ')}] }   blend Ⅰ/Ⅱ/Ⅲ ${t.blend.join(' / ')}${t.over ? '   OUT OF BAND' : ''}` : '(buff: not tuned)'); }
    if (args.includes('--json')) console.log('JSON ' + JSON.stringify(out));
    process.exit(0);
  }
  console.log(`charge DPS band: sustained ${FIGHT}s, ${Math.round(BLEND * 100)}% vs a pack of ${PACK} + ${Math.round((1 - BLEND) * 100)}% single targets, all perks — target at Ⅲ ${BAND.map(x => '+' + Math.round((x - 1) * 100) + '%').join(' to ')}`);
  for (const id of (ids.length ? ids : Object.keys(CHARGE))) {
    const r = [1, 2, 3].map(s => chargeBand(id, { stage: s })), b = r.map(blendOf), x = r[2];
    const tag = x.kind === 'utility' ? '(utility)' : b[2] >= BAND[0] && b[2] <= BAND[1] ? 'ok' : b[2] < BAND[0] ? 'LOW' : 'HIGH';
    console.log(`${id.padEnd(16)} ${x.kind.padEnd(8)} Ⅰ/Ⅱ/Ⅲ ×${b.join(' / ×').padEnd(20)} (Ⅲ pack ×${x.pack}, single ×${x.single}, burst ×${x.burst})  t ${x.t}s  cost ${x.cost.join('→')}  ${tag}`);
  }
}
