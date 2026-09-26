// Base actor: owns a kit rig + animator, moves on the ground with collision, faces its motion.
import * as THREE from 'three';
import { Animator } from './animator.js';
import { contactShadow } from './charKit.js';
import { dampAngle, clamp } from '../core/util.js';

const _prev = new THREE.Vector3();
export class Actor {
  constructor(world, rig, { radius = 0.28, speed = 3.4, name = '' } = {}) {
    this.world = world;
    this.rig = rig;
    this.name = name || rig.spec?.name || 'actor';
    this.anim = new Animator(rig);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0; this.faceTarget = 0;
    this.radius = radius; this.speed = speed;
    this.shadow = contactShadow(rig.quadruped ? 0.28 : 0.32);
    this.alive = true;
    this.visible = true;
    this.turnRate = 14;
    world.scene.add(rig.root); world.scene.add(this.shadow);
  }
  setPos(x, z) { this.pos.set(x, this.world.heightAt(x, z), z); this.sync(); return this; }
  // walk toward a direction (unit xz) with collision; returns actual displacement
  step(dir, dt, speedMul = 1) {
    _prev.copy(this.pos);
    if (dir.lengthSq() > 1e-6) {
      this.pos.x += dir.x * this.speed * speedMul * dt;
      this.pos.z += dir.z * this.speed * speedMul * dt;
      this.faceTarget = Math.atan2(dir.x, dir.z);
    }
    this.world.collision?.resolve(this.pos, this.radius, _prev);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    return this.pos.distanceTo(_prev);
  }
  // move toward a world point; returns true when arrived
  moveTo(x, z, dt, speedMul = 1, stop = 0.15) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < stop) return true;
    const dir = new THREE.Vector3(dx / d, 0, dz / d);
    const k = Math.min(1, d / (this.speed * speedMul * dt + 1e-6));
    this.step(dir, dt, speedMul * k);
    return false;
  }
  faceTo(x, z) { this.faceTarget = Math.atan2(x - this.pos.x, z - this.pos.z); }
  sync() {
    const r = this.rig.root;
    r.position.set(this.pos.x, this.pos.y + (this.rig.offsetY || 0), this.pos.z);
    r.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    const lift = clamp(1 - (this.rig.offsetY || 0) * 1.2, 0.3, 1);
    this.shadow.scale.setScalar(lift);
  }
  update(dt) {
    this.facing = dampAngle(this.facing, this.faceTarget, this.turnRate, dt);
    this.anim.update(dt, this.pos);
    this.sync();
    this.rig.root.visible = this.visible; this.shadow.visible = this.visible;
  }
  changeWorld(world) {
    this.world.scene.remove(this.rig.root); this.world.scene.remove(this.shadow);
    this.world = world; world.scene.add(this.rig.root); world.scene.add(this.shadow);
    this.anim.first = true;
  }
  dispose() {
    this.world.scene.remove(this.rig.root); this.world.scene.remove(this.shadow);
  }
}
