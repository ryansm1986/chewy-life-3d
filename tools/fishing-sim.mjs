// The fishing balance sim (docs/HOMESTEAD.md §3, ROADMAP R-12): a bot with a human's reaction time plays the real reel
// (src/life/reelSim.js) and the bite, and reports the success rate per fish, rarity tier, rod and setting. Test-only
// (imported by tools/test-rpg.mjs and, in the page, by tools/qa/s15-homestead.mjs; never bundled into the game).
//   node tools/fishing-sim.mjs [N] [--fish id,id] [--profile beginner|casual]
//
// The player model (humanReel):
// - they see the bar REACTION s late (beginner 0.28-0.36 s: a ~0.25 s human reaction plus a phone's touch and display
//   lag; casual 0.2-0.26 s), with noise in what they see (σ 0.04 / 0.025 of the bar), and a 0.3-0.6 s glance away now
//   and then (4% / 1.5% a second);
// - they make up for part of their own lag (pred: an internal model, "after a couple of tries") and chase the fish: they
//   hold while the zone is slower than they'd like it (kp × the error), with a little hysteresis;
// - the bite: a surprise after the wait, a reaction of ~0.3 s plus a long tail (biteRT).
import { ReelSim } from '../src/life/reelSim.js';
import { FISH, reelParams } from '../src/life/fishData.js';
import { PANTRY } from '../src/life/pantry.js';

export const mulberry = s => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2831853 * r());
export const PROFILES = {
  first: { delay: [0.34, 0.44], noise: 0.05, pred: 0.15, kp: 2.5, hyst: 0.07, lapse: 0.06, bite: 0.16 },
  beginner: { delay: [0.28, 0.36], noise: 0.04, pred: 0.4, kp: 3, hyst: 0.06, lapse: 0.04, bite: 0.1 },
  casual: { delay: [0.2, 0.26], noise: 0.025, pred: 0.8, kp: 4, hyst: 0.05, lapse: 0.015, bite: 0.05 },
};
// the tier targets for a beginner (docs/HOMESTEAD.md §3 "Balance"): the success rates the retune was solved for
export const TARGETS = { rod1: [0.9, 0.85, 0.6, 0.1], rod2: [0.95, 0.95, 0.85, 0.5] }; // (floors: common, uncommon, rare, legendary)
export const TIERS = ['common', 'uncommon', 'rare', 'legendary'];

/** one reel by a human-like player → { done: 'catch' | 'escape' | 'timeout', t } */
export function humanReel(opts, prof, rng, cap = 40) {
  const s = new ReelSim({ ...opts, rng }), dt = 1 / 60, hist = [];
  const lagOf = () => prof.delay[0] + rng() * (prof.delay[1] - prof.delay[0]);
  let t = 0, hold = false, lapseT = 0, delay = lagOf();
  while (!s.done && t < cap) {
    hist.push([s.f, s.z, s.v]);
    const lag = Math.round(delay / dt), o = hist[Math.max(0, hist.length - 1 - lag)];
    if (lapseT > 0) lapseT -= dt; // (a glance away: they keep doing what they were doing)
    else {
      if (rng() < prof.lapse * dt) lapseT = 0.3 + rng() * 0.3;
      const o2 = hist[Math.max(0, hist.length - 1 - lag - 6)], fv = (o[0] - o2[0]) / (6 * dt), L = delay * prof.pred;
      const f = o[0] + fv * L * 0.5 + gauss(rng) * prof.noise, v = o[2] + (hold ? 1.2 : -1.2) * L;
      const zc = o[1] + o[2] * L + s.zh / 2 + gauss(rng) * prof.noise * 0.5, e = prof.kp * (f - zc) - v;
      if (e > prof.hyst) hold = true; else if (e < -prof.hyst) hold = false;
      if (rng() < dt * 2) delay = lagOf();
    }
    s.step(dt, hold); t += dt;
  }
  return { done: s.done || 'timeout', t };
}
/** a human's reaction to the bite's splash (s) */
export const biteRT = (rng, prof) => 0.22 + prof.bite + Math.exp(-2.1 + 0.55 * gauss(rng));

/** success per fish: { id: { tier, d, beh, reel, t, bite } } for a rod and a setting (relaxed) */
export function table({ rod = 1, relaxed = false, profile = 'beginner', N = 300, fish = Object.keys(FISH), seed = 7 } = {}) {
  const P = PROFILES[profile], R = reelParams(rod, { relaxed }), out = {};
  for (const id of fish) {
    const f = FISH[id], rng = mulberry(seed * 977 + id.length * 31 + rod * 7 + (relaxed ? 3 : 0));
    let ok = 0, tt = 0, bite = 0;
    for (let i = 0; i < N; i++) {
      const r = humanReel({ d: f.d, beh: f.beh, zone: R.zone, drain: R.drain }, P, rng);
      if (r.done === 'catch') { ok++; tt += r.t; }
      if (biteRT(rng, P) <= R.window) bite++;
    }
    out[id] = { tier: PANTRY[id]?.rare || 0, d: f.d, beh: f.beh, reel: ok / N, t: tt / Math.max(1, ok), bite: bite / N };
  }
  return out;
}
/** the mean reel success per rarity tier (0 common … 3 legendary) */
export const tierMeans = t => [0, 1, 2, 3].map(k => { const l = Object.values(t).filter(e => e.tier === k); return l.length ? l.reduce((a, e) => a + e.reel, 0) / l.length : null; });

if (typeof process !== 'undefined' && process.argv?.[1]?.replace(/\\/g, '/').endsWith('tools/fishing-sim.mjs')) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
  const N = +(a.find(x => /^\d+$/.test(x)) || 300), fish = opt('fish')?.split(','), profiles = opt('profile') ? [opt('profile')] : Object.keys(PROFILES);
  for (const profile of profiles) for (const [rod, relaxed] of [[1, false], [2, false], [1, true], [2, true]]) {
    const t = table({ rod, relaxed, profile, N, fish: fish || undefined });
    console.log(`\n== ${profile}, ${rod === 1 ? 'Bamboo Rod' : 'Moonlit Rod'}, ${relaxed ? 'Relaxed' : 'Normal'} (${JSON.stringify(reelParams(rod, { relaxed }))})`);
    for (const [id, e] of Object.entries(t).sort((x, y) => x[1].d - y[1].d)) console.log(`  ${id.padEnd(13)} ${TIERS[e.tier].padEnd(9)} d ${e.d.toFixed(2)} ${e.beh.padEnd(7)}  reel ${(e.reel * 100).toFixed(0).padStart(3)}% in ${e.t.toFixed(1)} s · bite ${(e.bite * 100).toFixed(0)}%`);
    console.log('  tiers:', tierMeans(t).map((v, i) => `${TIERS[i]} ${(v * 100).toFixed(0)}%`).join(' · '));
  }
}
