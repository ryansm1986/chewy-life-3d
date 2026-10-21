// Stella's charged releases (docs/CHARGE.md §7, docs/STELLA.md §3a): SkillRunner methods `charged_<id>(R, aim, target)`, the
// same contract as chargedGolden.js: R.params are the charged numbers (rpg/chargeStella.js apply + the balance tune),
// R.charge = { stage, perks, color, base }. Each rides on her real cast (stellaSkills.js / stellaArts.js) through
// fromFrame(): the cast's first action starts from the frame her wind-up pose was holding (stellaPoses.js STELLA_FROM), and
// the perks go in as the cast's `o` extras. Installed by stellaSkills.js installStellaSkills.
import { perkAt } from '../rpg/charge.js';
import { STELLA_FROM } from '../actors/stellaPoses.js';

const F = STELLA_FROM;
/** Split Shot's extra rays / discs: [{ a (rad off the aim), pct }] fanned either side */
function splits(R) {
  const n = R.charge?.perks?.split || 0, s = perkAt(R, 'split'); if (!n || !s) return [];
  return Array.from({ length: n }, (_, i) => ({ a: (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * (s.spread || 12) * Math.PI / 180, pct: s.pct || 50 }));
}
const at3 = (R, id) => (R.charge.stage >= 3 ? perkAt(R, id) : null);
const kOf = R => 1 + 0.15 * (R.charge?.stage || 1);

const M = {
  // ================================================================== Radiance
  charged_goldenRay(R, aim, target) { this.fromFrame(F.parasolAim, () => this.cast_goldenRay(R, aim, target, { k: kOf(R), split: splits(R), afterglow: perkAt(R, 'afterglow') })); },
  charged_glint(R, aim, target) { this.fromFrame(F.parasolGlint, () => this.cast_glint(R, aim, target, { k: kOf(R), mirror: perkAt(R, 'mirror') })); },
  charged_prism(R, aim, target) { this.fromFrame(F.parasolAim, () => this.cast_prism(R, aim, target, { k: kOf(R), refraction: perkAt(R, 'refraction'), focal: !!perkAt(R, 'focal') })); },
  // (a channel: the charge is its wind-up; the beam starts hotter, and a charged one let go burns on by itself)
  charged_solarRay(R, aim, target) { this.cast_solarRay(R, aim, target, { heat0: R.params.heat0 || 0, lensFlare: perkAt(R, 'lensFlare') }); },
  charged_sundial(R, aim, target) { this.fromFrame(F.gnomonPlant, () => this.cast_sundial(R, aim, target, { longest: at3(R, 'longest') })); },
  // ================================================================== Corona
  charged_solarFlare(R, aim, target) { this.fromFrame(F.parasolRaise, () => this.cast_solarFlare(R, aim, target, { prominence: perkAt(R, 'prominence'), coronal: perkAt(R, 'coronal') })); },
  charged_skippingSun(R, aim, target) { this.fromFrame(F.skimThrow, () => this.cast_skippingSun(R, aim, target, { split: splits(R), skimmer: perkAt(R, 'skimmer') })); },
  charged_sunspot(R, aim, target) { this.fromFrame(F.parasolRaise, () => this.cast_sunspot(R, aim, target, { wander: perkAt(R, 'wander'), cycle: perkAt(R, 'cycle') })); },
  charged_littleSun(R, aim, target) { this.fromFrame(F.sunCall, () => this.cast_littleSun(R, aim, target, { size: R.params.size || 1, sunny: perkAt(R, 'sunny'), twin: at3(R, 'twin') })); },
  charged_risingSun(R, aim, target) { this.fromFrame(F.parasolRaise, () => this.cast_risingSun(R, aim, target, { redSky: at3(R, 'redSky') })); },
  // ================================================================== Dawn
  charged_morningLight(R, aim, target) { this.fromFrame(F.parasolRaise, () => this.cast_morningLight(R, aim, target, { k: kOf(R), chorus: perkAt(R, 'chorus'), clear: !!at3(R, 'clear') })); },
  charged_kindLight(R, aim, target) { this.fromFrame(F.parasolAim, () => this.cast_kindLight(R, aim, target, { rays: R.params.rays || 1, coat: perkAt(R, 'coat'), bright: !!perkAt(R, 'bright') })); },
  charged_halo(R, aim, target) { this.fromFrame(F.parasolRaise, () => this.cast_halo(R, aim, target, { ring: R.charge.stage >= 2 ? perkAt(R, 'ring') : null, solar: perkAt(R, 'solar') })); },
  charged_sunDog(R, aim, target) { this.fromFrame(F.sunCall, () => this.cast_sunDog(R, aim, target, { heel: perkAt(R, 'heel'), twinDogs: at3(R, 'twinDogs') })); },
  charged_daybreak(R, aim, target) { this.fromFrame(F.sunCall, () => this.cast_daybreak(R, aim, target, { hope: at3(R, 'hope') })); },
};
export function installChargedStella(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
