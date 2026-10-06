// Poe's charged releases (docs/CHARGE.md §7, docs/POE.md §3): SkillRunner methods `charged_<id>(R, aim, target)`, the
// same contract as chargedChewy.js / chargedMoka.js — R.params are the charged numbers (rpg/chargePoe.js apply + the
// balance tune), R.charge = { stage, perks, color, base }. Each one rides on her real cast (poeSkills.js, poeArts.js,
// poeJutsu.js, poeShadow.js) through fromFrame(): the cast's first action starts from the wound-back frame the charge
// pose was holding, and the perks go in as the cast's `o` extras. Installed by poeSkills.js installPoeSkills.
import { perkAt } from '../rpg/charge.js';

const by = (arr, s) => (Array.isArray(arr) ? arr[Math.max(0, Math.min(arr.length - 1, s - 1))] : arr);

const M = {
  // ================================================================== Shuriken Arts
  charged_fumaThrow(R, aim, target) {
    const s = R.charge.stage, k = R.charge.perks, orbit = perkAt(R, 'orbit'), split = perkAt(R, 'split');
    const o = { size: R.params.size, orbit: orbit ? { t: by(orbit.t, s), r: orbit.r, every: orbit.every, pct: orbit.pct } : null, twin: k.split ? { n: k.split, pct: split.pct } : null };
    this.fromFrame(0.4, () => this.cast_fumaThrow(R, aim, target, o));
  },
  charged_kunaiFan(R, aim, target) {
    const o = { tags: perkAt(R, 'tags') }; // (Bigger Pawful's kunai are in R.params.extra)
    this.fromFrame(0.42, () => this.cast_kunaiFan(R, aim, target, o));
  },
  charged_shadowStitch(R, aim, target) {
    this.fromFrame(0.42, () => this.cast_shadowStitch(R, aim, target, { needle: perkAt(R, 'needle') }));
  },
  charged_whirlingFuma(R, aim, target) {
    this.fromFrame(0.4, () => this.cast_whirlingFuma(R, aim, target, { size: R.params.size, drift: perkAt(R, 'drift'), shrapnel: perkAt(R, 'shrapnel') }));
  },
  charged_shurikenRain(R, aim, target) {
    const s = R.charge.stage;
    this.fromFrame(0.14, () => this.cast_shurikenRain(R, aim, target, { bigStar: s >= 3 ? perkAt(R, 'bigStar') : null }));
  },
  charged_thousandStars(R, aim, target) {
    const s = R.charge.stage;
    this.cast_thousandStars(R, aim, target, { supernova: s >= 3 ? perkAt(R, 'supernova') : null });
  },
  // ================================================================== Ninjutsu
  charged_smokeBomb(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_smokeBomb(R, aim, target, { pepper: perkAt(R, 'pepper'), perfect: perkAt(R, 'perfect') }));
  },
  charged_puffBall(R, aim, target) {
    const k = R.charge.perks, split = perkAt(R, 'split');
    this.fromFrame(0.5, () => this.cast_puffBall(R, aim, target, { size: R.params.size, split: k.split || 0, splitPct: split?.pct, bounce: perkAt(R, 'bounce') }));
  },
  charged_shadowClone(R, aim, target) {
    const lure = perkAt(R, 'lure');
    this.fromFrame(0.3, () => this.cast_shadowClone(R, aim, target, { lifeMul: R.params.lifeMul, lure: lure ? lure.r : 0, boom: perkAt(R, 'boom') }));
  },
  charged_substitution(R, aim, target) {
    this.fromFrame(0.5, () => this.cast_substitution(R, aim, target, { twoLogs: !!R.charge.perks.twoLogs, splinters: perkAt(R, 'splinters') }));
  },
  charged_thunderPaw(R, aim, target) {
    this.fromFrame(0.5, () => this.cast_thunderPaw(R, aim, target, { echo: perkAt(R, 'echo'), storm: perkAt(R, 'storm') }));
  },
  charged_smokeDragon(R, aim, target) {
    const s = R.charge.stage;
    this.fromFrame(0.55, () => this.cast_smokeDragon(R, aim, target, { twin: s >= 3 ? perkAt(R, 'twin') : null }));
  },
  // ================================================================== Shadow Step
  charged_shadowStep(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_shadowStep(R, aim, target, { sure: !!R.charge.perks.sure, echo: perkAt(R, 'echo') }));
  },
  charged_afterimageDash(R, aim, target) {
    this.cast_afterimageDash(R, aim, target, { rewind: !!R.charge.perks.rewind, mirage: perkAt(R, 'mirage') });
  },
  charged_vanish(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_vanish(R, aim, target, { smokeExit: perkAt(R, 'smokeExit'), triple: !!R.charge.perks.triple }));
  },
  charged_caltropFlip(R, aim, target) {
    this.cast_caltropFlip(R, aim, target, { spiky: perkAt(R, 'spiky') });
  },
  charged_bullseyeMark(R, aim, target) {
    this.fromFrame(0.45, () => this.cast_bullseyeMark(R, aim, target, { marks: R.params.marks, spread: perkAt(R, 'spread'), jackpot: perkAt(R, 'jackpot') }));
  },
  charged_phantomBarrage(R, aim, target) {
    const s = R.charge.stage;
    this.cast_phantomBarrage(R, aim, target, { finale: s >= 3 ? perkAt(R, 'finale') : null });
  },
};
export function installChargedPoe(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
