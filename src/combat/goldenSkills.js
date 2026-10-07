// The Golden Retriever dragoon's skills (docs/GOLDEN.md): SkillRunner cast implementations (`cast_<id>(R, aim, target)`)
// plus the per-frame state they need: the reach combo (two long thrusts, then a sweeping swat) and its lunge, Sunbeam
// Thrust, the javelins (thrown on readable arcs from the quiver: Bonk Dart; their flight, bonks and the ones left stuck
// in the ground, all in one instanced batch: gfx/goldenFx.js). installGoldenSkills(proto) mixes these into SkillRunner;
// skillRunner.js routes the lance basic attack here (cast_lancePoke) and calls updateGolden(dt) / clearGolden().
// Reach is his identity: the thrusts hit a long, narrow line (lineHit), not an arc.
// Looks: gfx/goldenFx.js; poses: actors/goldenPoses.js; the lance: actors/goldenGear.js; sounds: audio/golden.sfx.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import { gldFx } from '../gfx/goldenFx.js';
import { bladeFx } from '../gfx/bladeFx.js';
import { lancePoint } from '../actors/goldenGear.js';
import { installGoldenArts } from './goldenArts.js';
import { installGoldenWhelp } from './goldenWhelp.js';
import { installChargedGolden } from './chargedGolden.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _h = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const POKES = ['lanceThrust1', 'lanceThrust2', 'lanceSwat'];
const POKE_DUR = [0.42, 0.42, 0.5]; // (the actions' own durations: each move takes one attack at his attack speed; the swat a little longer)
const MELEE_SET = new Set([...POKES, 'sunbeamThrust']);
const LUNGE_SPEED = 9;
const JAV_G = 16; // m/s²: a javelin's arc (a ~1 m apex over 10 m: it reads as a lob, not a laser)

const M = {
  gldFx() { return gldFx(this.G); },

  // ================================================================== hit shapes
  /** every foe in a line from `origin` along `facing`, `len` long and `half` wide either side (their bodies count) */
  lineHit(origin, facing, len, half, fn, primary = null) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    let got = false;
    this.combat.inRadius(origin.x, origin.z, len + 0.2, 'ally', e => {
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx), r = e.bodyR || e.radius || 0.3;
      if (along < -0.35 || along > len + r || side > half + r) return;
      if (e === primary) got = true;
      fn(e, along);
    });
    if (primary && !got && primary.alive && dist(primary.pos.x, primary.pos.z, origin.x, origin.z) < len + (primary.radius || 0.3) + 0.3) fn(primary, 0);
  },

  // ================================================================== the reach combo: thrust, thrust, swat
  cast_lancePoke(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    const now = G.engine.time || 0;
    if (now - (this.gldComboT ?? -9) > 1.3) this.gldCombo = 0;
    const k = (this.gldCombo || 0) % 3; this.gldCombo = (this.gldCombo || 0) + 1; this.gldComboT = now;
    const m = this.melee; this.melee = null; // (his own lunge below: skillRunner's tracks only Chewy's cuts)
    this.gldMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    const swat = k === 2, act = POKES[k];
    P.anim.play(act, { speed: this.attacksPerSec() * POKE_DUR[k] * (swat ? 0.9 : 1), onEvent: ev => {
      if (ev !== 'hit') return;
      this.gldSnapIn(target, swat ? p.sweepRadius : p.radius);
      const f = P.facing, fx = this.gldFx();
      let hit = 0;
      if (swat) {
        bladeFx(G).arc(P.pos, f, { arc: p.arc * Math.PI / 180, r: p.sweepRadius * 0.95, rev: true, y: 0.55, width: 0.42, life: 0.26, tilt: 0.1 });
        sfx('lance_whoosh', { pitch: 0.82, vol: 0.9 });
        this.arcHit(P.pos, f, p.sweepRadius, p.arc, e => { this.gldHit(e, { dmgPct: p.dmgPct * 1.15, knock: p.knockback * 2.4, from: P.pos }, true); hit++; }, target);
      } else {
        this.gldThrustFx(p.radius, 0.42, k);
        sfx('lance_whoosh', { pitch: 1.05 + k * 0.08, vol: 0.75 });
        this.lineHit(P.pos, f, p.radius, p.width, e => { this.gldHit(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }, true); hit++; if (hit <= 2) fx.bonk(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z)); }, target);
      }
      if (hit) { sfx('lance_poke', { pitch: swat ? 0.85 : 1 + k * 0.06 }); G.engine.rig.shake(swat ? 0.14 : 0.08); }
      this.gldMelee = null;
    } });
  },
  /** a thrust's look: the sunbeam streak from the lance's grip out to `len` along his facing, a puff at his feet */
  gldThrustFx(len, width, k = 0, big = false) {
    const G = this.G, P = G.player, f = P.facing, fx = this.gldFx();
    const L = P.lance, y = P.pos.y + 0.62;
    _d.set(Math.sin(f), 0, Math.cos(f));
    if (L) { lancePoint(L, 0.1, _v); _v.y = y; } else _v.set(P.pos.x + _d.x * 0.3, y, P.pos.z + _d.z * 0.3);
    const from = _v, reach = len - Math.hypot(from.x - P.pos.x, from.z - P.pos.z) + 0.25;
    fx.streak(from, _d, Math.max(0.6, reach), { width, life: big ? 0.3 : 0.2, core: big || k === 1 });
    fx.dust(_w.set(P.pos.x - _d.x * 0.25, P.pos.y, P.pos.z - _d.z * 0.25), big ? 6 : 2);
  },
  /** at the hit frame: close a small gap to the aimed-at foe (what's left of the lunge budget) */
  gldSnapIn(target, radius) {
    const m = this.gldMelee, G = this.G, P = G.player;
    if (!m || !target || m.target !== target || !target.alive) return;
    const dx = target.pos.x - P.pos.x, dz = target.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    const step = Math.min(d - (radius + (target.radius || 0.3) - 0.3), m.budget);
    if (step <= 0.02) return;
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    m.budget = 0;
  },
  /** during a poke's wind-up: keep facing the target and lunge (≤ the budget, collision-safe) if it drifted away */
  gldTrackMelee(dt) {
    const m = this.gldMelee, G = this.G, P = G.player;
    if (!m) return;
    const act = P.anim.action?.name;
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !MELEE_SET.has(act)) { this.gldMelee = null; return; }
    const t = m.target, dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    if (d > m.reach + m.budget + 0.35) { this.gldMelee = null; return; }
    const want = d - (m.reach - 0.3);
    if (want <= 0 || m.budget <= 0) return;
    const step = Math.min(want, m.budget, LUNGE_SPEED * dt);
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    const moved = Math.hypot(P.pos.x - _t.x, P.pos.z - _t.z);
    m.budget = moved < step * 0.3 ? 0 : m.budget - moved;
  },

  // ================================================================== LANCE ARTS · Sunbeam Thrust
  cast_sunbeamThrust(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const m = this.melee; this.melee = null;
    this.gldMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    this.gldCombo = 0;
    sfx('lance_whoosh', { pitch: 0.75, vol: 0.5 });
    P.anim.play('sunbeamThrust', { speed: this.animSpeed(0.62), onEvent: ev => {
      if (ev !== 'hit') return;
      this.gldSnapIn(target, p.length);
      const f = P.facing, fx = this.gldFx(), len = p.length * (o.reach || 1);
      this.gldThrustFx(len, p.width * 1.5, 0, true);
      sfx('sunbeam_thrust');
      let hit = 0;
      this.lineHit(P.pos, f, len, p.width * (o.wide || 1), e => {
        this.gldHit(e, { dmgPct: p.dmgPct, knock: p.knockback * (o.knock || 1), stun: o.stun || 0, from: P.pos }, true);
        if (hit++ < 4) fx.bonk(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), true);
      }, target);
      if (hit) { sfx('lance_poke', { pitch: 0.9 }); G.engine.rig.shake(0.18); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.035); }
      this.gldMelee = null;
      const ss = o.secondSun; // (Second Sun: a second beam down the same line a beat later)
      if (ss) { const at = P.pos.clone(), f0 = f; this.after(ss.delay, () => {
        if (G.playerDead) return;
        const d = new THREE.Vector3(Math.sin(f0), 0, Math.cos(f0)), from = new THREE.Vector3(at.x + d.x * 0.4, at.y + 0.62, at.z + d.z * 0.4);
        fx.streak(from, d, len, { width: p.width * 1.4, life: 0.26, core: true }); sfx('sunbeam_thrust', { pitch: 1.2, vol: 0.7 });
        this.lineHit(at, f0, len, p.width, e => this.gldHit(e, { dmgPct: p.dmgPct * ss.pct / 100, knock: p.knockback * 0.5, from: at }, true));
      }); }
    } });
  },

  // ================================================================== JAVELINS · Bonk Dart (and the javelins' flight)
  cast_bonkDart(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('jav_draw', { vol: 0.7 });
    P.anim.play('javToss', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const to = target?.alive && !target.breakable ? target.pos : aim;
      this.gldThrow(R, to, { dmgPct: p.dmgPct, speed: p.speed, range: p.range, splash: p.splash, splashRadius: p.splashRadius, ...o });
    } });
  },
  /** where a javelin leaves his paw (the right paw's javelin, else above his right shoulder) */
  gldHand(out) {
    const P = this.G.player, J = P.rig.parts.javelin;
    P.rig.root.updateMatrixWorld(true);
    if (J?.holder) J.holder.getWorldPosition(out); else out.set(P.pos.x, P.pos.y + 0.9, P.pos.z);
    out.y = Math.max(out.y, P.pos.y + 0.7);
    return out;
  },
  /** throw a javelin from his paw at `to` on an arc (flat: a straight, fast throw). o: { dmgPct, speed, range, splash,
   *  splashRadius, pierce (foes it goes through), flat, onHit(e, J) } */
  gldThrow(R, to, o = {}) {
    const G = this.G, P = G.player, fx = this.gldFx(), B = fx.javelins();
    const from = this.gldHand(new THREE.Vector3());
    _d.set(to.x - from.x, 0, to.z - from.z);
    let D = _d.length(); if (D < 0.5) { _d.set(Math.sin(P.facing), 0, Math.cos(P.facing)); D = o.range || 10; } _d.normalize();
    D = Math.min(Math.max(D, 2), o.range || 12);
    const s = o.speed || 19, T = D / s, g = o.flat ? 0 : JAV_G;
    const ty = (G.world.heightAt?.(from.x + _d.x * D, from.z + _d.z * D) ?? P.pos.y) + 0.55;
    const vy = o.flat ? 0 : (ty - from.y + 0.5 * g * T * T) / T;
    const J = { R, o, slot: B.add(), pos: from, vel: new THREE.Vector3(_d.x * s, vy, _d.z * s), g, t: 0, left: (o.range || 12) * 1.6, state: 'fly', hit: new Set(), pierce: o.pierce || 0, trail: 0, spin: 0 };
    (this.gldJav ||= []).push(J);
    if (!o.quiet) sfx('jav_fwip', { pitch: o.flat ? 1.15 : 1 });
    return J;
  },
  updateGldJavelins(dt) {
    const S = this.gldJav; if (!S?.length) return;
    const G = this.G, fx = this.gldFx(), B = fx.javelins(), P = G.player;
    for (let i = S.length - 1; i >= 0; i--) {
      const J = S[i]; J.t += dt;
      if (J.state === 'fly') {
        J.vel.y -= J.g * dt;
        const step = J.vel.length() * dt; J.left -= step;
        J.pos.addScaledVector(J.vel, dt);
        _d.copy(J.vel).normalize();
        B.set(J.slot, J.pos, _d, 0, 1);
        if ((J.trail += dt) > (J.o.trail ? 0.02 : 0.035)) { J.trail = 0; fx.javTrail(_v.copy(J.pos).addScaledVector(_d, -0.3)); if (J.o.trail === 1) fx.embers(_v, 1, { r: 0.05, up: 0.4, size: 0.16, life: 0.35 }); }
        if (J.o.rise) { if (J.t > 0.55) { B.remove(J.slot); S[i] = S[S.length - 1]; S.pop(); } continue; } // (Sunshower's fling: up out of sight)
        if (J.o.rain) { // (Sunshower's rain: nothing on the way down; the landing bonks round it)
          const gy = G.world.heightAt?.(J.pos.x, J.pos.z) ?? 0;
          if (J.pos.y <= gy + 0.06) { J.pos.y = gy + 0.1; this.gldRainHit(J); J.state = 'stuck'; J.stuckT = 0; J.life = 0.45; J.dir = _w.copy(J.vel).normalize().clone(); }
          continue;
        }
        // a foe it reaches (its height counts: the arc can sail over a short one)
        let hitE = null;
        this.combat.inRadius(J.pos.x, J.pos.z, J.o.width || 0.42, 'ally', e => {
          if (hitE || J.hit.has(e)) return;
          const top = e.pos.y + (e.height || 1) + 0.35;
          if (J.pos.y < e.pos.y - 0.2 || J.pos.y > top) return;
          hitE = e;
        });
        const gy = G.world.heightAt?.(J.pos.x, J.pos.z) ?? 0;
        const wall = G.world.collision?.solidAt?.(J.pos.x, J.pos.z, 0.08);
        if (hitE && J.o.stick) { this.gldEmberStick(J, hitE); continue; } // (Emberleaf: it sticks in the foe and glows)
        if (hitE) {
          J.hit.add(hitE);
          this.gldJavHit(J, hitE);
          if (J.pierce-- > 0) continue;
          // the blunt tip bonks and the javelin pops back off the foe, tumbling
          J.state = 'bounce'; J.vel.set(-J.vel.x * 0.18 + rand(-0.6, 0.6), rand(2.6, 3.4), -J.vel.z * 0.18 + rand(-0.6, 0.6)); J.g = 14; J.spinV = rand(10, 16) * (Math.random() < 0.5 ? -1 : 1);
        } else if (wall) {
          fx.bonk(J.pos); sfx('jav_bonk', { pos: J.pos, vol: 0.6 });
          J.state = 'bounce'; J.vel.set(-J.vel.x * 0.25, 2.2, -J.vel.z * 0.25); J.g = 14; J.spinV = 12;
        } else if (J.left <= 0 && J.g === 0) { J.g = JAV_G * 1.6; J.left = 99; // (a flat throw at the end of its range: it drops)
        } else if (J.o.stick && J.pos.y <= gy + 0.05) { this.gldEmberStick(J, null);
        } else if (J.pos.y <= gy + 0.05 || J.left <= 0) {
          // stuck in the ground at the angle it came down (a little sunk in), until it fades
          J.state = 'stuck'; J.pos.y = gy + 0.12; J.stuckT = 0; J.life = 0.9;
          J.dir = _w.copy(J.vel).normalize().clone(); if (J.dir.y > -0.25) { J.dir.y = -0.35; J.dir.normalize(); }
          J.pos.addScaledVector(J.dir, -0.12);
          this.gldFx().dust(_v.set(J.pos.x, gy, J.pos.z), 2); sfx('jav_stick', { pos: J.pos, vol: 0.6 });
          this.gldJavLand?.(J); // (Good Retriever: it stays to be scooped up: checkpoint 2)
        }
      } else if (J.state === 'bounce') {
        J.vel.y -= J.g * dt; J.pos.addScaledVector(J.vel, dt); J.spin += (J.spinV || 10) * dt;
        const gy = G.world.heightAt?.(J.pos.x, J.pos.z) ?? 0;
        // tumbling end over end: its axis turns in the vertical plane of its travel
        const h = Math.hypot(J.vel.x, J.vel.z) || 1;
        _d.set(J.vel.x / h * Math.cos(J.spin), Math.sin(J.spin), J.vel.z / h * Math.cos(J.spin));
        B.set(J.slot, J.pos, _d.normalize(), 0, 1);
        if (J.pos.y <= gy + 0.06) { // it lands flat and lies there a moment
          J.state = 'stuck'; J.pos.y = gy + 0.05; J.stuckT = 0; J.life = 0.7;
          J.dir = new THREE.Vector3(J.vel.x / h, -0.06, J.vel.z / h).normalize();
          this.gldJavLand?.(J);
        }
      } else if (J.state === 'ember') { // Emberleaf: stuck in a foe (riding along) or the ground, glowing brighter until it bursts
        J.fuse -= dt;
        if (J.foe && J.foe.alive) J.pos.set(J.foe.pos.x + J.off.x, J.foe.pos.y + J.off.y, J.foe.pos.z + J.off.z); else if (J.foe) { J.foe = null; J.pos.y = Math.max(J.pos.y - 0.4, (G.world.heightAt?.(J.pos.x, J.pos.z) ?? 0) + 0.12); }
        B.set(J.slot, J.pos, J.dir, 0, 1);
        const k = 1 - clamp(J.fuse / J.fuse0);
        if ((J.glowT += dt) > 0.07 - 0.04 * k) { J.glowT = 0; _v.copy(J.pos).addScaledVector(J.dir, -0.32); this.G.vfx.glow.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.16, size: 0.3 + 0.35 * k, size1: 0.12, color: '#ffc060', alpha: 0.3 + 0.25 * k, alpha1: 0 }); fx.embers(_v, 1, { r: 0.06, up: 0.9, size: 0.16 + 0.1 * k, life: 0.4 }); }
        if (J.fuse <= 0) { this.gldEmberBurst(J); B.remove(J.slot); S[i] = S[S.length - 1]; S.pop(); }
      } else { // stuck: wait, then sink and shrink away
        J.stuckT += dt;
        if (J.fetch && P && J.stuckT < J.life && Math.hypot(P.pos.x - J.pos.x, P.pos.z - J.pos.z) < 0.9) { this.gldScoop(J); B.remove(J.slot); S[i] = S[S.length - 1]; S.pop(); continue; } // (Good Retriever)
        const k = clamp((J.stuckT - J.life) / 0.3);
        B.set(J.slot, _v.copy(J.pos).addScaledVector(J.dir, k * 0.2), J.dir, 0, 1 - k);
        if (k >= 1 && !J.keep) { B.remove(J.slot); S[i] = S[S.length - 1]; S.pop(); }
      }
    }
  },
  /** a javelin reaches a foe: its damage, the bonk, Bonk Dart's splash */
  gldJavHit(J, e) {
    const G = this.G, P = G.player, o = J.o, fx = this.gldFx();
    this.combat.hitMonster(e, { dmgPct: o.dmgPct, element: o.element || 'phys', knock: o.knock ?? 0.35, stun: o.daze || 0, from: P.pos });
    if (o.daze && e.alive && !e.def?.boss) this.fx?.()?.dizzy?.(e, o.daze);
    _h.set(e.pos.x, Math.max(J.pos.y, e.pos.y + 0.3), e.pos.z);
    fx.bonk(_h, !!o.big); sfx('jav_bonk', { pos: e.pos, pitch: rand(0.95, 1.08) });
    if (o.splash && o.splashRadius) this.combat.inRadius(e.pos.x, e.pos.z, o.splashRadius, 'ally', x => { if (x !== e && x.alive) this.combat.hitMonster(x, { dmgPct: o.dmgPct * o.splash / 100, knock: 0.2, from: e.pos }); });
    if (o.splash && o.splashRadius > 1.5) G.vfx.ring(e.pos, { color: '#fff2c8', r0: 0.2, r1: o.splashRadius, life: 0.26, opacity: 0.35 }); // (Big Bonk's wider splash: its edge)
    this.gldMark(e);
    o.onHit?.(e, J);
  },

  // ================================================================== per frame
  updateGolden(dt) {
    const P = this.G.player;
    if (!P) return;
    if (this.gldMelee) this.gldTrackMelee(dt);
    this.updateGldJavelins(dt);
    this.updateGoldenArts(dt);
    this.updateGoldenWhelp(dt);
  },
  /** end every dragoon effect (floor change, hero switch, death): the player's rig may be replaced right after */
  clearGolden() {
    this.gldMelee = null; this.gldCombo = 0;
    const B = this.G.vfx?.gld?._jav;
    for (const J of this.gldJav || []) B?.remove(J.slot);
    this.gldJav = [];
    this.clearGoldenArts();
    this.clearGoldenWhelp();
  },
};

/** Mix the dragoon's cast implementations into SkillRunner.prototype (skillRunner.js does this at import). Sunbeam Thrust
 *  is a melee move too: the reach assist walks him up to a far target and lunges at a near one; its reach is its line. */
export function installGoldenSkills(proto) {
  for (const k in M) if (!(k in proto)) proto[k] = M[k];
  installGoldenArts(proto); installGoldenWhelp(proto); installChargedGolden(proto);
  const blocked = proto.castBlocked; // (Poe's fuma wait is there already: the dragoon's own checks first)
  proto.castBlocked = function (id, aim, target, charge) { return this.gldCastBlocked(id) || (blocked ? blocked.call(this, id, aim, target, charge) : false); };
  const isMelee = proto.isMelee, reach = proto.reach;
  proto.isMelee = function (id, R) { return id === 'sunbeamThrust' || isMelee.call(this, id, R); };
  proto.reach = function (R, target) { return R?.id === 'sunbeamThrust' ? R.params.length * 0.8 + (target?.radius || 0.3) - 0.15 : reach.call(this, R, target); };
}
