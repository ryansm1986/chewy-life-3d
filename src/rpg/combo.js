// Combo chains (docs/COMBO.md): tap a weapon strike again within the chain window to chain it, step 1 → step 2 → the
// finisher, then the chain starts over. The sibling of the Charge tree (rpg/charge.js): this module is pure data +
// helpers (node-testable, no THREE / DOM): the combo table, the perk rules and comboRuntime(), which turns a skill's
// runtime (a tap's, or a charged release's) into its chain step's. The chain's state machine lives in
// combat/combo.js, the finisher's looks in gfx/comboFx.js, the K panel's Combo pane in ui/comboPanel.js.
//
// Rules (COMBO.md §1, §3):
//   • a tap is the normal cast; tapping the SAME skill again within WINDOW s of the step ending (the hero free to act
//     again; a press during the recovery is buffered) chains it; any other skill, a roll or the window running out
//     drops the chain;
//   • steps 2 and 3 play the normal cast; step 3, the finisher, hits FINISH_PCT % harder, then the chain starts over;
//   • a held charge released while the chain is live lands as its finisher (the bonus, and the chain ends); it pays its
//     charged cost and plays at its own speed (the cost and speed perks are the taps');
//   • perks only make chains cheaper and faster (the owner, 2026-11-03: "Cheaper chains and faster attacks. I don't want
//     a movement speed buff"): Quick Hands, Light Touch, Free Finisher, Tempo. Nothing here touches move speed.
// Each table entry: { id, color, keys, speedKeys, waitKey, perks }
//   keys: the damage params the finisher scales; speedKeys: params Quick Hands / Tempo quicken too (Fūma Throw's flight,
//   whose round trip is what gates the next throw); waitKey: a SkillRunner field that, while set, keeps the step going
//   (the fūma still in the air), so the window opens when the skill can really be cast again.
import { SKILLS } from './skills.js';
import { CHARGE } from './charge.js';

export const WINDOW = 0.55;
export const STEPS = 3;
export const FINISH_PCT = 15;
export const QUICK_PER_RANK = 5;
export const LIGHT_PER_RANK = 15;
export const TEMPO = Object.freeze({ pct: 8, t: 3 });
export const STEP_NAME = ['', 'Tap', 'Chain', 'Finisher'];

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ the perks (one generic set; each skill its own ranks)
// c: the skill's table entry (its cost numbers: Light Touch's % per rank, the share of the finisher's zoom Free Finisher
// waives). One set for every strike but Kunai Fan, whose casts are zoom-bound (see SPEC).
const PERKS = c => ({
  quick: {
    id: 'quick', name: 'Quick Hands', kind: 'common', icon: 'quick', ranks: 3, req: [1, 3, 6],
    desc: 'Chained steps play faster: the swing and its hit come sooner.',
    info(r) { return `Steps 2 and the finisher play ${QUICK_PER_RANK * r}% faster (attack speed)`; },
  },
  light: {
    id: 'light', name: 'Light Touch', kind: 'common', icon: 'light', ranks: 2, req: [2, 5],
    desc: 'Chained steps cost less zoom.',
    info(r, cost) { return `Steps 2 and the finisher cost ${c.light * r}% less zoom${cost ? ` (${cost} → ${r1(cost * (1 - c.light * r / 100))})` : ''}`; },
  },
  free: {
    id: 'free', name: c.free >= 100 ? 'Free Finisher' : 'Thrifty Finisher', kind: 'unique', icon: 'free', ranks: 1, req: [8],
    desc: c.free >= 100 ? 'A tapped finisher costs no zoom at all.' : `A tapped finisher costs ${100 - c.free}% of its zoom.`,
    info(r, cost) { return c.free >= 100 ? `A tapped finisher costs no zoom${cost ? ` (was ${cost})` : ''}` : `A tapped finisher costs ${100 - c.free}% of its zoom${cost ? ` (${cost} → ${r1(cost * (1 - c.free / 100))})` : ''}`; },
  },
  tempo: {
    id: 'tempo', name: 'Tempo', kind: 'unique', icon: 'tempo', ranks: 1, req: [10],
    desc: `Land a finisher and your weapon strikes quicken: +${TEMPO.pct}% attack speed for ${TEMPO.t}s.`,
    info() { return `A finisher that lands: +${TEMPO.pct}% attack speed for ${TEMPO.t}s on every Combo strike (never move speed)`; },
  },
});

// ------------------------------------------------------------------ the combo table: the weapon strikes (COMBO.md §2)
// Cooldown-free, non-channel, spammable strikes only: shouts, summons, buffs, leaps and cooldown skills stay charge-only.
// The four row-0 strikes added on 2026-11-03 (swallow, fumaFlurry, glumBonk, eagerJabs) join as their defs land: an id
// whose skill doesn't exist (yet) is skipped. Kunai Fan's casts cost twice the others' and are zoom-bound even tapped, so
// any saving is extra fans: its cost perks are gentler (Light Touch 5% a rank, a Thrifty Finisher 40% off) to keep
// it in the band (tools/combo-sim.mjs: with the common numbers it chained at ×1.56).
const SPEC = {
  chomp: {}, swallow: {}, throw: {},                                         // Chewy: Crescent Chomp, Swallow Return, Power Throw
  splash: {}, kibble: {},                                                    // Moka: Splash Bolt, Kibble Missiles
  fumaThrow: { speedKeys: ['speed'], waitKey: 'poeFuma' }, fumaFlurry: {}, kunaiFan: { light: 5, free: 40 }, // Poe: Fūma Throw, Fūma Flurry, Kunai Fan
  woefulWallop: {}, glumBonk: {},                                            // Floofy: Woeful Wallop, Glum Bonk
  sunbeamThrust: {}, eagerJabs: {}, bonkDart: {},                            // Foosy: Sunbeam Thrust, Eager Jabs, Bonk Dart
  goldenRay: {}, solarFlare: {},                                             // Stella: Golden Ray, Solar Flare
};
export const COMBO_LIST = Object.freeze(Object.keys(SPEC));
const ELEM_COL = { phys: '#ffe6a0', fire: '#ffb04a', frost: '#7fd4ff', zap: '#ffe07a', stink: '#b8e880', holy: '#fff0b0' };
const C = {};
for (const id of COMBO_LIST) {
  const def = SKILLS[id]; if (!def) continue; // (not landed yet)
  const s = SPEC[id];
  const c = C[id] = { id, color: CHARGE[id]?.color || ELEM_COL[def.element] || '#ffe6a0', keys: s.keys || ['dmgPct', 'burnPct'], speedKeys: s.speedKeys || [], waitKey: s.waitKey || null, light: s.light ?? LIGHT_PER_RANK, free: s.free ?? 100 };
  c.perks = PERKS(c);
  def.combo = C[id]; // (the skill def carries its combo table too: SKILLS.chomp.combo)
}
export const COMBO = C;
export const COMBO_IDS = Object.keys(C);
/** the listed strikes whose skill hasn't landed yet (the coordinator's final pass) */
export const comboMissing = () => COMBO_LIST.filter(id => !SKILLS[id]);

// ------------------------------------------------------------------ helpers (all pure)
const EMPTY = Object.freeze({});
const P = st => st?.player || {};
/** Does this skill chain? */
export const comboable = id => !!C[id];
/** Perk ranks the active hero bought for a skill's combo → { perkId: rank } (never null). */
export const comboPerksOf = (state, id) => P(state).comboPerks?.[id] || EMPTY;
/** a tree's combo skills in reading order (row, then column) */
export const comboSkillsOf = tree => COMBO_IDS.filter(id => SKILLS[id]?.tree === tree).sort((a, b) => SKILLS[a].row - SKILLS[b].row || SKILLS[a].col - SKILLS[b].col);
/** Attack-speed multiplier of a step: Quick Hands on the chained steps (2, 3), Tempo on all while it lasts. */
export const stepSpeed = (step, k = EMPTY, tempo = false) => (step >= 2 ? 1 + QUICK_PER_RANK * (k.quick || 0) / 100 : 1) * (tempo ? 1 + TEMPO.pct / 100 : 1);
/** The zoom a tapped step costs: Light Touch on the chained steps, nothing for a finisher with Free Finisher (c: the
 *  skill's table entry, for its own cost numbers; default the common ones). */
export function stepCost(cost, step, k = EMPTY, c = null) {
  const light = c?.light ?? LIGHT_PER_RANK, free = c?.free ?? 100;
  let v = cost || 0;
  if (step >= 2) v *= 1 - light * Math.min(2, k.light || 0) / 100;
  if (step >= STEPS && k.free) v *= Math.max(0, 1 - free / 100);
  return r1(v);
}

/**
 * A skill's runtime as chain step `step` (COMBO.md §5): R (skillRuntime's, or chargeRuntime's for a held charge) with the
 * step's cost and, for the finisher, the bonus damage; R.combo = { step, fin, speed, color } for the cast path.
 * o.charged: a held charge landing as the finisher (keeps its charged cost and speed); o.tempo: Tempo is up.
 * Mutates and returns R (skillRuntime returns fresh params each call). A skill with no combo table, or step < 1, → R.
 */
export function comboRuntime(R, step, k = EMPTY, o = {}) {
  const c = R && C[R.id];
  if (!c || !(step >= 1)) return R;
  const s = Math.min(STEPS, Math.max(1, Math.round(step))), fin = s >= STEPS, p = R.params || (R.params = {});
  const speed = o.charged ? 1 : stepSpeed(s, k, !!o.tempo), base = R.cost;
  if (!o.charged) R.cost = stepCost(R.cost, s, k, c);
  if (fin) for (const key of c.keys) if (typeof p[key] === 'number') p[key] *= 1 + FINISH_PCT / 100;
  if (speed !== 1) for (const key of c.speedKeys) if (typeof p[key] === 'number') p[key] = r2(p[key] * speed);
  R.combo = { step: s, fin, speed, color: c.color, base, charged: !!o.charged };
  return R;
}

/** The chain at the hero's numbers, for the tooltips and the drawer: [{ step, name, cost, speed, dmgPct }] (dmgPct: the
 *  skill's main damage at that step). R0: the skill's tap runtime (skillRuntime). */
export function comboSteps(id, k = EMPTY, R0 = null) {
  if (!C[id]) return [];
  const cost = R0?.cost ?? 0, dmg = R0?.params?.dmgPct ?? null;
  return [1, 2, 3].map(s => ({ step: s, name: STEP_NAME[s], cost: stepCost(cost, s, k, C[id]), speed: r2(stepSpeed(s, k)), dmgPct: dmg == null ? null : Math.round(dmg * (s === STEPS ? 1 + FINISH_PCT / 100 : 1)) }));
}

// ------------------------------------------------------------------ perks: rules + spending (like charge.js canLearnPerk)
/** Can the active hero buy the next rank of a combo perk right now? → { ok, why, rank, need } */
export function canLearnComboPerk(id, perkId, state) {
  const def = SKILLS[id], c = C[id], perk = c?.perks?.[perkId];
  if (!def || !perk) return { ok: false, why: 'Unknown perk' };
  const pl = P(state);
  if (def.cls && def.cls !== (pl.cls || 'chewy')) return { ok: false, why: "Another hero's skill" };
  const base = pl.skills?.[id] || 0, rank = comboPerksOf(state, id)[perkId] || 0;
  if (rank >= perk.ranks) return { ok: false, why: 'Mastered!', rank };
  if (base <= 0) return { ok: false, why: `Learn ${def.name} first`, rank, need: perk.req[0] };
  const need = perk.req[Math.min(rank, perk.req.length - 1)];
  if (base < need) return { ok: false, why: `Requires ${def.name} level ${need}`, rank, need };
  if ((pl.skillPts || 0) <= 0) return { ok: false, why: 'No skill points', rank, need };
  return { ok: true, why: '', rank, need };
}
/** Spend a skill point on a combo perk (mutates the active hero). → { ok, why, rank } */
export function learnComboPerk(state, id, perkId) {
  const c = canLearnComboPerk(id, perkId, state);
  if (!c.ok) return c;
  const pl = state.player, all = pl.comboPerks || (pl.comboPerks = {}), k = all[id] || (all[id] = {});
  k[perkId] = (k[perkId] || 0) + 1;
  pl.skillPts--;
  return { ok: true, why: '', rank: k[perkId] };
}
/** Skill points the active hero has in combo perks (respec refunds them). */
export function comboPerkPoints(state) { let n = 0; const all = P(state).comboPerks || {}; for (const id in all) for (const q in all[id]) n += all[id][q] || 0; return n; }
/** Has the hero bought any combo perk on this skill? (the hotbar's chain badge) */
export const hasComboPerks = (state, id) => { const k = comboPerksOf(state, id); for (const q in k) if (k[q] > 0) return true; return false; };
/** Every rank of every perk of a skill (the sims, the tests, the debug menu) */
export const fullComboPerks = id => (C[id] ? Object.fromEntries(Object.values(C[id].perks).map(p => [p.id, p.ranks])) : {});
/** Save migration: every hero gets a comboPerks object (older saves: {}). Mutates st. */
export function migrateComboPerks(st) {
  for (const id in st?.heroes || {}) { const pl = st.heroes[id]?.player; if (pl && (typeof pl.comboPerks !== 'object' || !pl.comboPerks)) pl.comboPerks = {}; }
  if (st?.player && (typeof st.player.comboPerks !== 'object' || !st.player.comboPerks)) st.player.comboPerks = {};
  return st;
}
