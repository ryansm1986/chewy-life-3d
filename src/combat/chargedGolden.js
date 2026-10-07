// Foosy the dragoon's charged releases (docs/CHARGE.md §7, docs/GOLDEN.md §3b): SkillRunner methods `charged_<id>(R, aim,
// target)`, the same contract as chargedShihtzu.js: R.params are the charged numbers (rpg/chargeGolden.js apply + the
// balance tune), R.charge = { stage, perks, color, base }. Each rides on his real cast (goldenSkills.js / goldenArts.js /
// goldenWhelp.js) through fromFrame(): the cast's first action starts from the wound-back frame the charge pose was
// holding (goldenPoses.js GOLDEN_CHARGE_POSES), and the perks go in as the cast's `o` extras. Installed by
// goldenSkills.js installGoldenSkills.
import * as THREE from 'three';
import { perkAt } from '../rpg/charge.js';
import { dist, clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;

const M = {
  // ================================================================== Lance Arts
  charged_sunbeamThrust(R, aim, target) {
    this.fromFrame(0.36, () => this.cast_sunbeamThrust(R, aim, target, { stun: R.params.stun || 0, secondSun: perkAt(R, 'secondSun') }));
  },
  charged_sunfallJump(R, aim, target) {
    const p = R.params;
    this.fromFrame(0.13, () => this.cast_sunfallJump(R, aim, target, { high: p.high || 1, big: R.charge.stage >= 2, embers: perkAt(R, 'embers') }));
  },
  charged_pinwheelSweep(R, aim, target) {
    this.fromFrame(0.26, () => this.cast_pinwheelSweep(R, aim, target, { turns: R.params.turns || 1, turnPct: R.params.turnPct || 100, gust: perkAt(R, 'gust') }));
  },
  charged_gallantCharge(R, aim, target) {
    this.fromFrame(0.16, () => this.cast_gallantCharge(R, aim, target, { carry: !!R.params.carry, skid: perkAt(R, 'skid') }));
  },
  charged_starfallLance(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_starfallLance(R, aim, target, { constellation: R.charge.stage >= 3 ? perkAt(R, 'constellation') : null }));
  },
  // ================================================================== Javelins
  charged_bonkDart(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, n = R.charge.perks.split || 0, split = perkAt(R, 'split'), wob = perkAt(R, 'wobble');
    const onHit = wob ? (e) => this.gldWobble(e, p.dmgPct * wob.pct / 100, wob.r) : null;
    this.fromFrame(0.42, () => P.anim.play('javToss', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const to = target?.alive && !target.breakable ? target.pos : aim, o = { dmgPct: p.dmgPct, speed: p.speed, range: p.range, splash: p.splash, splashRadius: p.splashRadius, daze: p.daze, big: true, onHit };
      this.gldThrow(R, to, o);
      const from = this.gldHand(_v), base = Math.atan2(to.x - from.x, to.z - from.z), D = clamp(Math.hypot(to.x - from.x, to.z - from.z), 3, p.range);
      for (let i = 1; i <= n; i++) { // (Twin Darts: fanned either side)
        const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (split?.spread || 12) * Math.PI / 180;
        this.gldThrow(R, new THREE.Vector3(P.pos.x + Math.sin(a) * D, 0, P.pos.z + Math.cos(a) * D), { ...o, dmgPct: p.dmgPct * (split?.pct || 50) / 100, quiet: true });
      }
    } }));
  },
  /** Wobbly Bonk: the dart pops off its foe onto the nearest other one within r */
  gldWobble(e, dmgPct, r) {
    const G = this.G, fx = this.gldFx();
    let best = null, bd = r;
    for (const x of this.combat.entities) { if (x === e || !isFoe(x)) continue; const d = dist(x.pos.x, x.pos.z, e.pos.x, e.pos.z); if (d < bd) { bd = d; best = x; } }
    if (!best) return;
    const a = e.pos.clone(), b = best;
    fx.run((dt, t) => {
      const u = clamp(t / 0.28); _v.lerpVectors(a, b.pos, u); _v.y = a.y + 0.6 + Math.sin(u * Math.PI) * 1.1;
      G.vfx.glow.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.16, size: 0.22, size1: 0.06, color: '#fff2c8', alpha: 0.4, alpha1: 0 });
      if (u < 1) return true;
      if (b.alive) { this.combat.hitMonster(b, { dmgPct, knock: 0.3, from: a }); fx.bonk(_v.set(b.pos.x, b.pos.y + (b.height || 1) * 0.55, b.pos.z)); }
      return false;
    });
  },
  charged_tailwagVolley(R, aim, target) {
    this.fromFrame(0.4, () => this.cast_tailwagVolley(R, aim, target, { echo: perkAt(R, 'echo') }));
  },
  charged_trueFlight(R, aim, target) {
    this.fromFrame(0.46, () => this.cast_trueFlight(R, aim, target, { twin: perkAt(R, 'twin') }));
  },
  charged_emberleafJavelin(R, aim, target) {
    this.fromFrame(0.42, () => this.cast_emberleafJavelin(R, aim, target, { kindling: perkAt(R, 'kindling') }));
  },
  charged_sunshower(R, aim, target) {
    this.fromFrame(0.44, () => this.cast_sunshower(R, aim, target, { rainbow: R.charge.stage >= 3 ? perkAt(R, 'rainbow') : null }));
  },
  // ================================================================== Whelp Bond (Foosy's call starts from its raised paw)
  charged_emberBreath(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_emberBreath(R, aim, target, { edge: true }));
  },
  charged_divebombSwoop(R, aim, target) {
    const p = R.params;
    this.fromFrame(0.3, () => this.cast_divebombSwoop(R, aim, target, { loops: p.loops || 0, loopPct: p.loopPct || 60, scorch: perkAt(R, 'scorch') }));
  },
  charged_wingShield(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_wingShield(R, aim, target, { regen: perkAt(R, 'regen')?.regen || 0, singe: perkAt(R, 'singe') }));
  },
  charged_mightyRoar(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_mightyRoar(R, aim, target, { fear: perkAt(R, 'fear')?.fear || 0, pep: perkAt(R, 'pep')?.move || 0 }));
  },
  charged_dragonHeart(R, aim, target) {
    this.fromFrame(0.3, () => this.cast_dragonHeart(R, aim, target, { size: R.params.size || 1, hearth: perkAt(R, 'hearth')?.regen || 0, dragonJump: R.charge.stage >= 3 ? perkAt(R, 'dragonJump') : null }));
  },
};
export function installChargedGolden(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
