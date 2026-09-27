// Chewy — the player. WASD / click-to-move (routed round walls, buildings, trees and water by core/nav.js), dodge roll,
// interaction, weapon visuals and grass bending.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid, CAST, boneSwordGeo, tennisBall, enableXray } from './charKit.js';
import { Input } from '../core/input.js';
import { navFor, PathFollow } from '../core/nav.js';
import { Events } from '../core/events.js';
import { U } from '../gfx/materials.js';
import { clamp } from '../core/util.js';

export class Player extends Actor {
  constructor(world, G) {
    const rig = buildHumanoid(CAST.chewy);
    super(world, rig, { radius: 0.3, speed: 4.4, name: 'Chewy' });
    this.G = G;
    enableXray(rig, '#ffc890', 0.6);
    this.moveTarget = null; this.interactTarget = null;
    // click-to-move route toward moveTarget (the melee assist and loot pickup steer through moveTarget too)
    this.route = new PathFollow({ replan: 0.12, far: 0.6 });
    this.navDir = new THREE.Vector3(); this.navOn = false;
    this.rollT = 0; this.rollDir = new THREE.Vector3(); this.rollCd = 0;
    this.stepAcc = 0;
    this.inputDir = new THREE.Vector3();
    this.controlLocked = false;
    // weapons
    this.sword = new THREE.Mesh(boneSwordGeo(), rig.mat); this.sword.castShadow = true;
    this.ball = tennisBall(0.1);
    this.swordBack = new THREE.Mesh(boneSwordGeo(), rig.mat); this.swordBack.castShadow = true; this.swordBack.scale.setScalar(0.8);
    this.swordBack.position.set(0.02, -0.02, -0.02); this.swordBack.rotation.set(0.1, 0, 2.5);
    rig.parts.back.add(this.swordBack);
    this.weaponType = 'sword';
    this.setWeapon('sword');
    this.speedMul = 1;
  }
  setWeapon(type, look = {}) {
    this.weaponType = type;
    const h = this.rig.parts.handR;
    // both stay attached (the idle one shrunk to nothing) so each shader is compiled up front — no hitch on the first swap
    if (this.sword.parent !== h) h.add(this.sword);
    if (this.ball.parent !== h) h.add(this.ball);
    this.sword.rotation.set(Math.PI * 0.78, 0, -0.25); this.sword.position.set(0, -0.02, 0.02);
    this.ball.position.set(0, -0.06, 0.03);
    const sword = type === 'sword';
    this.sword.scale.setScalar(sword ? 1 : 0.0001); this.sword.castShadow = sword;
    this.ball.scale.setScalar(sword ? 0.0001 : 1); this.ball.castShadow = !sword;
    this.swordBack.visible = !sword;
    this._sheathed = undefined; // re-evaluated by carrySword next frame
  }

  // camera-relative WASD
  readMoveInput() {
    const d = this.inputDir.set(0, 0, 0);
    if (this.controlLocked || this.G.ui?.anyModal?.()) return d;
    const { f, r } = this.G.engine.rig.groundAxes();
    if (Input.down('w') || Input.down('up')) d.add(f);
    if (Input.down('s') || Input.down('down')) d.sub(f);
    if (Input.down('d') || Input.down('right')) d.add(r);
    if (Input.down('a') || Input.down('left')) d.sub(r);
    if (d.lengthSq() > 0) d.normalize();
    return d;
  }
  roll(dir) {
    if (this.rollCd > 0 || this.rollT > 0) return false;
    this.rollDir.copy(dir.lengthSq() > 0 ? dir : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing))).normalize();
    this.rollT = 0.42; this.rollCd = 0.75;
    this.anim.play('roll');
    this.faceTarget = Math.atan2(this.rollDir.x, this.rollDir.z);
    Events.emit('sfx', 'dash');
    Events.emit('player:roll');
    return true;
  }
  update(dt) {
    this.rollCd = Math.max(0, this.rollCd - dt);
    const G = this.G;
    let moved = 0;
    // external speed modifiers (buffs, chill auras)
    this.slowT = Math.max(0, (this.slowT || 0) - dt);
    this.speedMul = (G.combat?.moveMul?.() || 1) * (G.derived?.moveMul || 1) * (this.slowT > 0 ? 1 - (this.slowAmt || 0.3) : 1) * (G.combat?.buffs?.shrineZoom ? 1.35 : 1);
    if (this.navWorld !== this.world) { this.navWorld = this.world; const nav = navFor(this.world); if (nav && !nav.built) nav.build(); } // ~5-8 ms, once per world (behind the load / iris)
    if (G.playerDead) { super.update(dt); return; }
    if (this.knock && this.knock.lengthSq() > 0.01) { const b = this.pos.clone(); this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.exp(-10 * dt)); this.world.collision?.resolve(this.pos, this.radius, b); }
    if (this.leap || this.dash) { this.pos.y = this.world.heightAt(this.pos.x, this.pos.z); super.update(dt); return; }
    if (this.rollT > 0) {
      this.rollT -= dt;
      moved = this.step(this.rollDir, dt, 2.1);
      this.invuln = true;
    } else {
      this.invuln = false;
      const dir = this.readMoveInput();
      if (dir.lengthSq() > 0) { this.moveTarget = null; this.interactTarget = null; }
      if (Input.hit('space') && !this.controlLocked && !G.ui?.anyModal?.()) {
        if (this.roll(dir.lengthSq() ? dir : new THREE.Vector3())) Input.consume('space');
      }
      const navWas = this.navOn; this.navOn = false;
      if (dir.lengthSq() > 0 && !this.busyAction()) moved = this.step(dir, dt, this.speedMul * (this.canMoveWhileActing ? 0.75 : 1));
      else if (this.moveTarget && !this.busyAction()) {
        const it = this.interactTarget, mt = this.moveTarget;
        if (it?.pos) { mt.x = it.pos.x; mt.z = it.pos.z; } // a villager walks on while Chewy heads over
        const stop = it ? (it.radius || 1.2) : 0.12;
        const r = this.walkTo(mt.x, mt.z, dt, stop, navWas);
        moved = 1;
        if (r) {
          this.moveTarget = null; this.interactTarget = null; this.route.clear();
          // interact on arrival (or from the closest spot the map allows, if that's still near enough)
          if (it && (r === 1 || Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < stop + 0.8)) { this.faceTo(it.pos.x, it.pos.z); it.onInteract?.(); }
        }
      }
      if (!this.moveTarget && this.route.pts) this.route.clear();
    }
    // footsteps
    this.stepAcc += this.anim.speed * dt;
    if (this.stepAcc > 0.62) { this.stepAcc = 0; Events.emit('footstep', this.pos); }
    // grass bending around Chewy
    U.uBenders.value[0].set(this.pos.x, this.pos.y, this.pos.z, 0.55);
    super.update(dt);
    this.carrySword(dt);
  }
  // Keep the bone sword at its relaxed carry angle while walking: the walk cycle's arm swing and forward lean used to
  // tip it level like a lance. Attacks and skills (any animator action) pose it freely.
  carrySword(dt) {
    if (this.weaponType !== 'sword') return;
    // In the village the sword rides on his back (he was leaning on it like a cane); it comes out for any attack or
    // skill and goes back a few seconds later. In the Burrow it stays in hand.
    if (this.anim.action) this._drawnT = 3;
    this._drawnT = Math.max(0, (this._drawnT || 0) - dt);
    const sheathed = this.G.mode === 'village' && this._drawnT <= 0;
    if (sheathed !== this._sheathed) {
      this._sheathed = sheathed;
      this.sword.scale.setScalar(sheathed ? 0.0001 : 1); this.sword.castShadow = !sheathed;
      this.swordBack.visible = sheathed;
    }
    if (sheathed) return;
    const arm = this.rig.parts.armR, body = this.rig.parts.body, R = this.anim.rest;
    const ra = R.get(arm), rb = R.get(body); if (!ra || !rb) return;
    const want = this.anim.action ? 0 : 1;
    this._carry = (this._carry ?? 1) + (want - (this._carry ?? 1)) * Math.min(1, dt * 14);
    const tilt = (arm.rotation.x - ra.r.x) + (body.rotation.x - rb.r.x);
    this.sword.rotation.x = Math.PI * 0.78 - tilt * this._carry;
  }
  get nav() { return navFor(this.world); } // this world's clearance grid (debug / tests)
  // walk toward (tx, tz) along a route round obstacles: 0 walking, 1 arrived within stop, 2 got as close as the map
  // allows (target walled off / inside something), -1 no route (walled in, or wedged for a while)
  walkTo(tx, tz, dt, stop, smooth = true) {
    const px = this.pos.x, pz = this.pos.z;
    if (Math.hypot(tx - px, tz - pz) < stop) return 1;
    const nav = navFor(this.world);
    if (!nav) return this.moveTo(tx, tz, dt, this.speedMul, stop) ? 1 : 0;
    const f = this.route, w = f.steer(nav, px, pz, tx, tz, dt);
    if (!w) { // no route at all (standing somewhere the grid calls solid): the old straight walk, still watched
      if (this.moveTo(tx, tz, dt, this.speedMul, stop)) return 1;
      this.navOn = true;
      return f.watch(nav, this.pos.x, this.pos.z, this.speed * this.speedMul * dt, dt) ? -1 : 0;
    }
    const dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz);
    if (f.last && (d < (f.exact ? 0.02 : 0.2))) return f.exact ? 1 : 2;
    // ease the heading into each new leg instead of snapping (not on the final approach: no orbiting the goal)
    const nd = this.navDir, k = smooth && !(f.last && d < 0.8) ? 1 - Math.exp(-dt * 16) : 1;
    nd.x += (dx / d - nd.x) * k; nd.z += (dz / d - nd.z) * k; nd.y = 0;
    const l = Math.hypot(nd.x, nd.z); if (l < 1e-4) nd.set(dx / d, 0, dz / d); else nd.multiplyScalar(1 / l);
    const slow = f.last ? Math.min(1, d / (this.speed * this.speedMul * dt + 1e-6)) : 1;
    this.step(nd, dt, this.speedMul * slow);
    this.navOn = true;
    const gaveUp = f.watch(nav, this.pos.x, this.pos.z, this.speed * this.speedMul * slow * dt, dt);
    if (f.stuck && f.last && Math.hypot(tx - this.pos.x, tz - this.pos.z) < 0.5) return f.exact ? 1 : 2; // pressed against it: close enough
    return gaveUp ? -1 : 0;
  }
  busyAction() { const a = this.anim.action; return a && ['swing', 'swing2', 'throw', 'cast', 'bark', 'slam', 'pickup', 'drink'].includes(a.name) && !this.canMoveWhileActing; }
}
