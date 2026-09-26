// Chewy — the player. WASD / click-to-move, dodge roll, interaction, weapon visuals and grass bending.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid, CAST, boneSwordGeo, tennisBall } from './charKit.js';
import { Input } from '../core/input.js';
import { Events } from '../core/events.js';
import { U } from '../gfx/materials.js';
import { clamp } from '../core/util.js';

export class Player extends Actor {
  constructor(world, G) {
    const rig = buildHumanoid(CAST.chewy);
    super(world, rig, { radius: 0.3, speed: 4.4, name: 'Chewy' });
    this.G = G;
    this.moveTarget = null; this.interactTarget = null;
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
    h.remove(this.sword); h.remove(this.ball);
    if (type === 'sword') {
      h.add(this.sword); this.sword.rotation.set(Math.PI * 0.62, 0, 0); this.sword.position.set(0, -0.02, 0.02);
      this.swordBack.visible = false;
    } else {
      h.add(this.ball); this.ball.position.set(0, -0.06, 0.03);
      this.swordBack.visible = true;
    }
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
      if (dir.lengthSq() > 0 && !this.busyAction()) moved = this.step(dir, dt, this.speedMul * (this.canMoveWhileActing ? 0.75 : 1));
      else if (this.moveTarget && !this.busyAction()) {
        const arrived = this.moveTo(this.moveTarget.x, this.moveTarget.z, dt, this.speedMul, this.interactTarget ? (this.interactTarget.radius || 1.2) : 0.12);
        moved = 1;
        if (arrived) {
          const it = this.interactTarget; this.moveTarget = null; this.interactTarget = null;
          if (it) { this.faceTo(it.pos.x, it.pos.z); it.onInteract?.(); }
        }
      }
    }
    // footsteps
    this.stepAcc += this.anim.speed * dt;
    if (this.stepAcc > 0.62) { this.stepAcc = 0; Events.emit('footstep', this.pos); }
    // grass bending around Chewy
    U.uBenders.value[0].set(this.pos.x, this.pos.y, this.pos.z, 0.55);
    super.update(dt);
  }
  busyAction() { const a = this.anim.action; return a && ['swing', 'swing2', 'throw', 'cast', 'bark', 'slam', 'pickup', 'drink'].includes(a.name) && !this.canMoveWhileActing; }
}
