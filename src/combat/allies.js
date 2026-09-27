// Allied summons: spirit pups (Pack Call) and the squeaky decoy (Fetch Mastery).
import * as THREE from 'three';
import { Actor } from '../actors/actor.js';
import { buildBoston, cloneRig } from '../actors/charKit.js';

// one baked spirit-pup rig; every summon clones it (shared geometry) instead of building a Boston from scratch
let pupTemplate = null;
function pupRig() {
  if (!pupTemplate) {
    pupTemplate = buildBoston({ fur: '#6a8ad8', collar: '#ffffff', outline: '#bfe0ff' });
    pupTemplate.mat.emissive.set('#4a7aff'); pupTemplate.mat.emissiveIntensity = 0.6; pupTemplate.mat.transparent = true; pupTemplate.mat.opacity = 0.85;
  }
  return cloneRig(pupTemplate);
}
// a throwaway pup for the dungeon prewarm: its translucent, glowing material is its own shader variant (~100 ms to compile)
// kept for the whole session: disposing its material would release the compiled program again
let prewarmPup = null;
export function pupPrewarmRig() { return (prewarmPup ||= pupRig()); }
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { Events } from '../core/events.js';
import { rand, dist, TAU, clamp } from '../core/util.js';

export class SpiritPup extends Actor {
  constructor(G, pos, p) {
    const rig = pupRig();
    rig.root.scale.setScalar(0.85);
    super(G.world, rig, { radius: 0.22, speed: p.pupSpeed || 6, name: 'Spirit Pup' });
    this.G = G; this.p = p; this.team = 'ally'; this.alive = true; this.height = 0.6;
    this.lifeMax = Math.round(G.derived.lifeMax * p.pupLifePct / 100); this.life = this.lifeMax;
    this.t = 0; this.biteCd = 0; this.res = {};
    this.setPos(pos.x, pos.z);
    G.combat.add(this);
    G.vfx.poof(pos.clone().setY(0.4), { color: '#bfe0ff', n: 10 });
    this.glowSrc = G.world.lightPool.addSource({ pos: this.pos, color: new THREE.Color('#7aa8ff'), intensity: 3, radius: 4 });
  }
  takeDamage(dmg) { this.life -= dmg; this.anim.hit('#ffffff'); if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    this.G.combat.remove(this); this.G.world.lightPool.removeSource(this.glowSrc);
    if (!silent) this.G.vfx.poof(this.pos.clone().setY(0.4), { color: '#bfe0ff', n: 12 });
    this.dispose();
    // Actor.dispose leaves the contact shadow's own plane + canvas texture behind (one of each per summon)
    // (the material itself is left alone: disposing it could release the shared program and recompile on the next summon)
    const sh = this.shadow; sh.geometry.dispose(); sh.material.map?.dispose();
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt; this.biteCd -= dt;
    if (this.t > this.p.duration) return this.expire();
    const G = this.G, P = G.player;
    const tgt = G.combat.nearest(P.pos, 'ally', 9);
    if (tgt) {
      const d = dist(tgt.pos.x, tgt.pos.z, this.pos.x, this.pos.z);
      if (d > tgt.radius + 0.5) this.moveTo(tgt.pos.x, tgt.pos.z, dt, 1, tgt.radius + 0.4);
      else { this.faceTo(tgt.pos.x, tgt.pos.z); if (this.biteCd <= 0) { this.biteCd = 0.8; this.anim.play('bark'); G.combat.hitMonster(tgt, { dmgPct: this.p.pupDmgPct, element: 'frost', source: 'pup', from: this.pos }); tgt.applyStatus?.('slow', 1.5, this.p.chill || 0.3); Events.emit('sfx', 'bark_small', { pitch: 1.3 }); } }
    } else if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) > 2) this.moveTo(P.pos.x + rand(-1, 1), P.pos.z + rand(-1, 1), dt, 1, 0.8);
    if (Math.random() < dt * 10) G.vfx.spark.spawn({ x: this.pos.x + rand(-0.2, 0.2), y: rand(0.2, 0.6), z: this.pos.z + rand(-0.2, 0.2), vy: 0.6, life: 0.6, size: 0.15, color: '#bfe0ff', alpha: 0.8, alpha1: 0 });
    super.update(dt);
  }
}

let duckGeo;
function duckGeometry() {
  if (duckGeo) return duckGeo;
  const body = new THREE.SphereGeometry(0.22, 16, 12); body.scale(1.2, 0.85, 1); body.translate(0, 0.18, 0); paint(body, (p, n, o) => o.set('#ffd84a'));
  const head = new THREE.SphereGeometry(0.13, 14, 10); head.translate(0, 0.38, 0.12); paint(head, (p, n, o) => o.set('#ffd84a'));
  const beak = new THREE.SphereGeometry(0.06, 10, 8); beak.scale(1.2, 0.5, 1.2); beak.translate(0, 0.36, 0.25); paint(beak, (p, n, o) => o.set('#ff8a3a'));
  const eyes = [-1, 1].map(s => { const e = new THREE.SphereGeometry(0.022, 8, 6); e.translate(s * 0.06, 0.42, 0.22); return paint(e, (p, n, o) => o.set('#2a1418')); });
  duckGeo = merge([body, head, beak, ...eyes]);
  return duckGeo;
}

export class Decoy {
  constructor(G, pos, p) {
    this.G = G; this.p = p; this.team = 'ally'; this.alive = true; this.taunt = true; this.radius = 0.35; this.height = 0.5;
    this.pos = pos.clone(); this.pos.y = G.world.heightAt(pos.x, pos.z);
    this.lifeMax = Math.round(G.derived.lifeMax * 0.6); this.life = this.lifeMax; this.res = {};
    this.mesh = new THREE.Mesh(duckGeometry(), makeToon({ vertexColors: true, rim: 0.6 }));
    this.mesh.position.copy(this.pos); this.mesh.castShadow = true;
    const ol = new THREE.Mesh(duckGeo, makeOutline('#3a2230', 0.015)); this.mesh.add(ol);
    G.world.scene.add(this.mesh);
    this.t = 0; this.acc = 0;
    G.combat.add(this);
    G.vfx.ring(this.pos, { color: '#b8e880', r0: 0.2, r1: p.lureRadius, life: 0.6 });
    Events.emit('sfx', 'squeak');
  }
  takeDamage(dmg) { this.life -= dmg; this.mesh.scale.set(1.2, 0.8, 1.2); Events.emit('sfx', 'squeak', { vol: 0.5 }); if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  expire(silent) { if (!this.alive) return; this.alive = false; this.G.combat.remove(this); this.mesh.parent?.remove(this.mesh); if (!silent) this.G.vfx.poof(this.pos.clone().setY(0.3), { color: '#fff6a0', n: 10 }); }
  update(dt) {
    if (!this.alive) return;
    this.t += dt; this.acc += dt;
    this.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * dt));
    this.mesh.rotation.y += dt * 1.5; this.mesh.position.y = this.pos.y + Math.abs(Math.sin(this.t * 5)) * 0.08;
    if (this.acc >= this.p.pulse) {
      this.acc = 0;
      this.G.vfx.stink(this.pos, 10);
      this.G.combat.inRadius(this.pos.x, this.pos.z, this.p.cloudRadius, 'ally', e => { this.G.combat.hitMonster(e, { dmgPct: this.p.dmgPct, element: 'stink', source: 'decoy', from: this.pos, noCrit: true }); e.applyStatus?.('poison', 2, this.G.derived.dmgMax * 0.15); });
    }
    if (this.t > this.p.duration) this.expire();
  }
}
