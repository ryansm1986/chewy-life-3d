// Projectiles: tennis balls (pierce / ricochet / return), fireballs, fox-fire, acorns, sparks, lobbed pots.
import * as THREE from 'three';
import { makeToon, makeGlow } from '../gfx/materials.js';
import { tennisBallTexture, glowTexture } from '../gfx/textures.js';
import { Events } from '../core/events.js';
import { rand, TAU } from '../core/util.js';

let ballGeo, ballMat, acornGeo, acornMat, potGeo, potMat;
function ballMesh(r = 0.12) {
  ballGeo ||= new THREE.SphereGeometry(1, 16, 12);
  ballMat ||= makeToon({ map: tennisBallTexture(), rim: 0.6, brush: 0.04, emissive: '#ffffff', emissiveIntensity: 0 });
  const m = new THREE.Mesh(ballGeo, ballMat); m.scale.setScalar(r); m.castShadow = true; return m;
}
function acornMesh() {
  if (!acornGeo) { acornGeo = new THREE.SphereGeometry(0.1, 10, 8); acornGeo.scale(1, 1.25, 1); acornMat = makeToon({ color: '#b07a4a', rim: 0.4 }); }
  const m = new THREE.Mesh(acornGeo, acornMat); m.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 6, 0, TAU, 0, Math.PI / 2), makeToon({ color: '#6a4a30', rim: 0.3 })); cap.position.y = 0.04; m.add(cap);
  return m;
}
function potMesh() {
  if (!potGeo) { potGeo = new THREE.SphereGeometry(0.22, 12, 10); potGeo.scale(1, 0.85, 1); potMat = makeToon({ color: '#8a5a3a', rim: 0.3 }); }
  const m = new THREE.Mesh(potGeo, potMat); m.castShadow = true; return m;
}
function glowSprite(color, s = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sp.scale.setScalar(s); return sp;
}

const VIS = {
  ball: { mesh: () => { const g = new THREE.Group(); g.add(ballMesh(0.16), glowSprite('#ff7a6a', 0.7)); return g; }, trail: '#ff8a70', trailSize: 0.55, light: null },
  blaze: { mesh: () => { const g = new THREE.Group(); g.add(ballMesh(0.18), glowSprite('#ff9a3c', 2.4)); return g; }, trail: '#ff9a3c', fire: true, fireSize: 0.7, light: '#ff8a3a' },
  fireball: { mesh: () => glowSprite('#ffa050', 1.1), trail: '#ff7a3a', fire: true, light: '#ff8a3a' },
  foxfire: { mesh: () => glowSprite('#8ab8ff', 1.0), trail: '#aac8ff', light: '#7aa8ff' },
  spark: { mesh: () => glowSprite('#fff27a', 0.6), trail: '#fff27a' },
  acorn: { mesh: acornMesh, trail: null },
  firepot: { mesh: potMesh, trail: '#ffb070', fire: true },
  bone: { mesh: () => glowSprite('#fff6e0', 0.8), trail: '#fff6e0' },
  moonball: { mesh: () => { const g = new THREE.Group(); g.add(ballMesh(0.2), glowSprite('#ffe8a0', 1.8)); return g; }, trail: '#fff0b0', trailSize: 0.7 },
};

export class Projectile {
  // o: {team, kind, pos, dir, speed, range, radius, dmgPct|dmg, element, level, pierce, bounces, bounceRange, returns,
  //     lob:{to:Vector3, h, time}, onHit(target, proj)->void, onEnd(proj), knock, owner, homing}
  constructor(combat, o) {
    this.c = combat; this.G = combat.G; this.o = o;
    this.team = o.team; this.kind = o.kind || 'ball';
    this.pos = o.pos.clone(); this.dir = (o.dir || new THREE.Vector3(1, 0, 0)).clone().setY(0).normalize();
    this.speed = o.speed || 12; this.range = o.range || 10; this.radius = o.radius || 0.3;
    this.pierce = o.pierce || 0; this.bounces = o.bounces || 0; this.returns = !!o.returns;
    this.traveled = 0; this.alive = true; this.hitSet = new Set(); this.returning = false;
    const vis = VIS[this.kind] || VIS.ball;
    this.vis = vis;
    this.mesh = vis.mesh(); this.mesh.position.copy(this.pos);
    this.G.world.scene.add(this.mesh);
    this.t = 0;
    if (o.lob) { this.lob = { from: this.pos.clone(), to: o.lob.to.clone(), h: o.lob.h || 3, time: o.lob.time || 0.8 }; }
    if (vis.light) this.lightSrc = this.G.world.lightPool.addSource({ pos: this.pos, color: new THREE.Color(vis.light), intensity: 5, radius: 5, priority: 2 });
  }
  targets() {
    const out = [];
    if (this.team === 'ally') { for (const e of this.c.entities) if (e.alive && e.team === 'enemy') out.push(e); }
    else { const p = this.G.player; if (p && !this.G.playerDead) out.push(p); for (const e of this.c.entities) if (e.alive && e.team === 'ally') out.push(e); }
    return out;
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const G = this.G, vfx = G.vfx;
    if (this.lob) {
      const k = Math.min(1, this.t / this.lob.time);
      this.pos.lerpVectors(this.lob.from, this.lob.to, k); this.pos.y = this.lob.from.y + Math.sin(k * Math.PI) * this.lob.h + (this.lob.to.y - this.lob.from.y) * k;
      this.mesh.position.copy(this.pos); this.mesh.rotation.x += dt * 8;
      if (this.vis.fire) vfx.fire(this.pos, 1, { size: 0.3 });
      if (k >= 1) { this.o.onEnd?.(this); return false; }
      return true;
    }
    // returning ball homes back to Chewy
    if (this.returning) {
      const p = G.player; const to = p.pos.clone().setY(p.pos.y + 0.7);
      const d = to.clone().sub(this.pos); const L = d.length();
      if (L < 0.5) { Events.emit('sfx', 'ball_catch'); return false; }
      this.dir.copy(d).normalize();
      this.pos.addScaledVector(this.dir, Math.min(L, this.speed * 1.3 * dt));
    } else {
      if (this.o.homing && this.homeTarget?.alive) { const d = this.homeTarget.pos.clone().setY(this.pos.y).sub(this.pos).normalize(); this.dir.lerp(d, Math.min(1, dt * this.o.homing)).normalize(); }
      const step = this.speed * dt;
      const nx = this.pos.x + this.dir.x * step, nz = this.pos.z + this.dir.z * step;
      // walls
      if (G.world.collision?.solidAt?.(nx, nz, 0.05)) {
        if (this.kind === 'ball' && this.bounces > 0) {
          const bx = G.world.collision.solidAt(nx, this.pos.z, 0.05), bz = G.world.collision.solidAt(this.pos.x, nz, 0.05);
          if (bx) this.dir.x *= -1; if (bz) this.dir.z *= -1; if (!bx && !bz) this.dir.negate();
          this.bounces--; Events.emit('sfx', 'ball_bounce', { pos: this.pos }); vfx.sparks(this.pos, { n: 4, color: '#fff', speed: 2, size: 0.2 });
        } else return this.end(true);
      } else { this.pos.x = nx; this.pos.z = nz; this.traveled += step; }
      if (this.traveled > this.range) { if (this.returns) this.returning = true; else return this.end(false); }
      // hits
      for (const e of this.targets()) {
        if (this.hitSet.has(e)) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < this.radius + (e.radius || 0.3)) {
          this.hitSet.add(e);
          this.o.onHit?.(e, this);
          if (this.kind === 'ball' && this.o.ricochet > 0) { // bounce toward the next nearest enemy
            this.o.ricochet--;
            const next = this.c.nearest(this.pos, this.team, this.o.bounceRange || 6, x => !this.hitSet.has(x));
            if (next) { this.dir.copy(next.pos).sub(this.pos).setY(0).normalize(); this.traveled = 0; this.range = this.o.bounceRange || 6; Events.emit('sfx', 'ball_bounce'); continue; }
          }
          if (this.pierce > 0) { this.pierce--; continue; }
          if (this.returns) { this.returning = true; break; }
          return this.end(true);
        }
      }
    }
    this.mesh.position.copy(this.pos);
    if (this.mesh.isMesh || this.mesh.isGroup) { this.mesh.rotation.x += dt * 18; this.mesh.rotation.z += dt * 7; }
    if (this.vis.trail) {
      if (this.vis.fire) vfx.fire(this.pos, 2, { spread: 0.1, size: this.vis.fireSize || 0.4 });
      else vfx.glow.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, life: 0.32, size: this.vis.trailSize || 0.45, size1: 0.04, color: this.vis.trail, alpha: 0.75, alpha1: 0 });
    }
    return true;
  }
  end(hitSomething) { this.o.onEnd?.(this, hitSomething); if (this.returns && !this.returning) { this.returning = true; return true; } return false; }
  dispose() { this.alive = false; this.mesh.parent?.remove(this.mesh); if (this.lightSrc) this.G.world.lightPool.removeSource(this.lightSrc); }
}
