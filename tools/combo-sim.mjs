// The Combo DPS-band sim (docs/COMBO.md §3 Balance): the sustained damage of a strike-focused build that casts one
// combo skill on repeat, chaining every tap (step 1 → 2 → finisher), against the same taps with no chain. Test-only
// (imported by tools/test-rpg.mjs; never bundled into the game).
//   node tools/combo-sim.mjs [ids...] [--perks quick,light,free,tempo]
//
// The model extends the charge sim's (tools/charge-sim.mjs): the same skill-build hero at level 30 with skill level 12
// (145 stat points, half in Energy), the same per-cast damage models (Σ dmgPct × the foes each part hits, a pack of 5 or
// one target, blended 70 / 30), the same basic Attack filling any time the hero waits for zoom. What it adds:
// - the band is asserted on the charge sim's 60 s fight from a full pool (FIGHT); a LONG fight of 3 minutes, where the
//   pool runs dry and the cost perks count, is reported beside it (and capped: LONG_CAP);
// - each cast takes CAST s at the hero's base rate (Fūma Throw: the fūma's round trip, which is what gates the next
//   throw); a step's attack speed (Quick Hands, Tempo) divides it; the chain's buffered taps mean no gap between steps;
// - a chained step waiting for zoom keeps the chain while the wait is under the window (it just waits), else the chain
//   drops and the hero attacks meanwhile (the next cast is a step 1 again);
// - Tempo starts when a finisher lands (assumed: every finisher hits) and quickens every step while it lasts.
import { skillRuntime, SKILLS } from '../src/rpg/skills.js';
import { simHero, tapDamage, PACK, ATK } from './charge-sim.mjs';
import { COMBO, COMBO_IDS, WINDOW, STEPS, TEMPO, comboRuntime, fullComboPerks, stepSpeed } from '../src/rpg/combo.js';

export const FIGHT = 60, LONG = 180, CAST = 0.5, BLEND = 0.7;
export const BASE_BAND = [1.03, 1.07]; // the chain with no perks: about +5% (COMBO.md §3)
export const BAND = [1.1, 1.3];        // every perk: +10–30% sustained over plain taps, the same band as Charge's
export const LONG_CAP = 1.5;           // the long fight (the pool dry): the cost perks may add more, never runaway
const CAST_OF = { fumaThrow: 0.95 };   // (the fūma's round trip at every level: skillsPoe.js, tools/hero-balance.mjs)
const r2 = v => Math.round(v * 100) / 100;

/** one fight → damage in skill-% units (basic attacks included). steps: [per, cost, dur] for steps 1..3 (chain) or step 1
 *  alone (taps); tempo: Tempo's multiplier (1 = none) */
function fight({ chain, step: S, zoomMax, regen, tempo = 1, secs = FIGHT }) {
  let t = 0, z = zoomMax, dmg = 0, step = 1, tempoUntil = -1;
  const filler = w => { dmg += ATK.pct * w / ATK.every; };
  while (t < secs) {
    const st = chain ? S[step - 1] : S[0];
    if (z < st.cost - 1e-9) {
      const w = (st.cost - z) / regen;
      if (chain && step > 1 && w > WINDOW) { step = 1; continue; } // (too long a wait: the chain drops, attack meanwhile)
      if (!(chain && step > 1)) filler(w); // (a chained step waits out a short gap to keep its chain)
      t += w; z = st.cost; if (t > secs) break;
    }
    z -= st.cost; dmg += st.per;
    const d = st.dur / (t < tempoUntil ? tempo : 1);
    t += d; z = Math.min(zoomMax, z + regen * d);
    if (chain) { if (step >= STEPS) { step = 1; if (tempo > 1) tempoUntil = t + TEMPO.t; } else step++; }
  }
  return dmg;
}

/** the sustained ratio of chaining (perks k) over plain taps for one skill → { id, pack, single, blend, burst, long } (long:
 *  the blend over the LONG fight; null: no damage model for it yet) */
export function comboBand(id, { perks = null, lvl = 12 } = {}) {
  const c = COMBO[id]; if (!c) return null;
  const { st, d } = simHero(SKILLS[id].cls || 'chewy', lvl);
  st.player.skills[id] = Math.max(st.player.skills[id] || 0, lvl);
  const R0 = skillRuntime(id, st, d); if (!R0) return null;
  const k = perks || {}, cast = CAST_OF[id] || CAST;
  const out = { id, cost: R0.cost, long: 0 };
  for (const [name, sc, w] of [['pack', { n: PACK }, BLEND], ['single', { n: 1 }, 1 - BLEND]]) {
    const per0 = tapDamage(id, R0.params, sc); if (per0 == null) return null;
    const S = [1, 2, 3].map(s => { const R = comboRuntime(skillRuntime(id, st, d), s, k); return { per: tapDamage(id, R.params, sc), cost: R.cost, dur: cast / stepSpeed(s, k)}; });
    const taps = fight({ chain: false, step: [{ per: per0, cost: R0.cost, dur: cast }], zoomMax: d.zoomMax, regen: d.zoomRegen });
    const chained = fight({ chain: true, step: S, zoomMax: d.zoomMax, regen: d.zoomRegen, tempo: k.tempo ? 1 + TEMPO.pct / 100 : 1 });
    out[name] = r2(chained / taps);
    const tl = fight({ chain: false, step: [{ per: per0, cost: R0.cost, dur: cast }], zoomMax: d.zoomMax, regen: d.zoomRegen, secs: LONG });
    out.long += w * fight({ chain: true, step: S, zoomMax: d.zoomMax, regen: d.zoomRegen, tempo: k.tempo ? 1 + TEMPO.pct / 100 : 1, secs: LONG }) / tl;
    if (name === 'pack') out.burst = r2((S[0].per + S[1].per + S[2].per) / (S[0].dur + S[1].dur + S[2].dur) / (per0 / cast));
  }
  out.blend = r2(BLEND * out.pack + (1 - BLEND) * out.single); out.long = r2(out.long);
  return out;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/combo-sim.mjs')) {
  const args = process.argv.slice(2), ids = args.filter(a => !a.startsWith('--')), pi = args.indexOf('--perks');
  const only = pi >= 0 ? (args[pi + 1] || '').split(',').filter(Boolean) : null;
  console.log(`combo DPS band: sustained ${FIGHT}s (and ${LONG}s, the pool dry, capped ×${LONG_CAP}), ${Math.round(BLEND * 100)}% vs a pack of ${PACK} + ${Math.round((1 - BLEND) * 100)}% single targets — no perks ${BASE_BAND.map(x => '+' + Math.round((x - 1) * 100) + '%').join('..')}, every perk ${BAND.map(x => '+' + Math.round((x - 1) * 100) + '%').join('..')}`);
  for (const id of (ids.length ? ids : COMBO_IDS)) {
    const full = fullComboPerks(id), k = only ? Object.fromEntries(only.map(p => [p, full[p] || 0])) : full;
    const b = comboBand(id, { perks: {} }), f = comboBand(id, { perks: k });
    if (!b || !f) { console.log(`${id.padEnd(14)} (no damage model in the charge sim yet: skipped)`); continue; }
    const each = ['quick', 'light', 'free', 'tempo'].map(p => `${p} ×${comboBand(id, { perks: { [p]: full[p] } }).blend}`).join('  ');
    const tag = f.blend >= BAND[0] && f.blend <= BAND[1] ? 'ok' : f.blend < BAND[0] ? 'LOW' : 'HIGH';
    console.log(`${id.padEnd(14)} base ×${b.blend}  full ×${f.blend} (pack ×${f.pack}, single ×${f.single}, burst ×${f.burst}; ${LONG}s ×${f.long})  cost ${f.cost}  [${each}]  ${tag}${f.long > LONG_CAP ? ' LONG HIGH' : ''}`);
  }
}
