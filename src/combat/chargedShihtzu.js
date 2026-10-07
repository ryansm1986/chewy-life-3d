// The Shih Tzu's charged releases (docs/CHARGE.md §7, docs/SHIHTZU.md §3): SkillRunner methods `charged_<id>(R, aim,
// target)`, the same contract as chargedPoe.js: R.params are the charged numbers (rpg/chargeShihtzu.js apply + the
// balance tune), R.charge = { stage, perks, color, base }. Each rides on his real cast (shihtzuSkills.js /
// shihtzuArts.js) through fromFrame(): the cast's first action starts from the wound-back frame the charge pose was
// holding (shihtzuPoses.js SHIHTZU_CHARGE_POSES), and the perks go in as the cast's `o` extras. Installed by
// shihtzuSkills.js installShihtzuSkills.
import { perkAt } from '../rpg/charge.js';

const M = {
  // ================================================================== Flail Arts
  charged_woefulWallop(R, aim, target) {
    const p = R.params;
    this.fromFrame(0.5, () => this.cast_woefulWallop(R, aim, target, { stun: p.stun, aftershock: perkAt(R, 'aftershock'), woe: perkAt(R, 'woe') }));
  },
  charged_tugOfWoe(R, aim, target) {
    this.fromFrame(0.32, () => this.cast_tugOfWoe(R, aim, target, { slam: perkAt(R, 'slam') }));
  },
  charged_maelstrom(R, aim, target) {
    this.cast_maelstrom(R, aim, target, { finale: perkAt(R, 'finale'), drift: perkAt(R, 'drift') });
  },
  charged_steadfastSulk(R, aim, target) {
    this.cast_steadfastSulk(R, aim, target, { preBlows: R.params.preBlows || 0, stun: 0.25 });
  },
  charged_heaviestSigh(R, aim, target) {
    const p = R.params, extra = p.extraRings || 0, rolling = perkAt(R, 'rolling');
    this.fromFrame(0.45, () => this.cast_heaviestSigh(R, aim, target, { rings: extra, wide: extra ? (p.rings + extra) / p.rings : 1, ringPct: extra && rolling ? 25 : 0 }));
  },
  // ================================================================== Gloom Hexes
  charged_drippingPaw(R, aim, target) {
    const k = R.charge.perks, split = perkAt(R, 'split');
    this.fromFrame(0.48, () => this.cast_drippingPaw(R, aim, target, { stacks: R.params.stacksAt || 1, split: k.split || 0, splitPct: split?.pct || 50, puddle: perkAt(R, 'puddle') }));
  },
  charged_grumbleCloud(R, aim, target) {
    this.fromFrame(0.45, () => this.cast_grumbleCloud(R, aim, target, { follow: perkAt(R, 'follow'), thunder: perkAt(R, 'thunder') }));
  },
  charged_caseOfMopes(R, aim, target) {
    this.fromFrame(0.48, () => this.cast_caseOfMopes(R, aim, target, { spread: perkAt(R, 'spread') }));
  },
  charged_mournfulAwoo(R, aim, target) {
    this.fromFrame(0.2, () => this.cast_mournfulAwoo(R, aim, target, { encore: perkAt(R, 'echo'), chorus: perkAt(R, 'chorus') }));
  },
  charged_everlastingGloom(R, aim, target) {
    const deep = perkAt(R, 'deep');
    this.fromFrame(0.45, () => this.cast_everlastingGloom(R, aim, target, { stacks: deep ? deep.stacks : 1 }));
  },
  // ================================================================== Ghostlight Tome
  charged_ghostPups(R, aim, target) {
    const G = this.G, haunt = perkAt(R, 'haunt'), m = G.derived?.hexMul || 1;
    this.fromFrame(0.4, () => this.cast_ghostPups(R, aim, target, { hex: haunt ? { dps: haunt.dps * m, dur: haunt.dur, cap: G.derived?.hexStacks || 3 } : null, big: R.charge.stage >= 3 && !!perkAt(R, 'runt') }));
  },
  charged_borrowedWarmth(R, aim, target) {
    this.fromFrame(0.48, () => this.cast_borrowedWarmth(R, aim, target, { share: perkAt(R, 'share') }));
  },
  charged_boneWard(R, aim, target) {
    const marrow = perkAt(R, 'marrow');
    this.fromFrame(0.4, () => this.cast_boneWard(R, aim, target, { bonePct: marrow ? marrow.k : 1, broth: perkAt(R, 'broth') }));
  },
  charged_wayhomeLantern(R, aim, target) {
    this.fromFrame(0.4, () => this.cast_wayhomeLantern(R, aim, target, { calm: perkAt(R, 'calm') }));
  },
  charged_grandpawsGhost(R, aim, target) {
    this.fromFrame(0.4, () => this.cast_grandpawsGhost(R, aim, target, { size: R.params.size || 1, stories: perkAt(R, 'stories'), lantern: perkAt(R, 'lantern') }));
  },
};
export function installChargedShihtzu(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
