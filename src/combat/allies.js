// Allied summons: spirit pups (Pack Call), the squeaky decoy (Fetch Mastery), and Moka's Decoy Duck + Spirit Retriever.
import * as THREE from 'three';
import { Actor } from '../actors/actor.js';
import { buildBoston, cloneRig } from '../actors/charKit.js';
import { kabutoGeo, kabutoMaterial } from '../gfx/samuraiProps.js';
const KABUTO = { y: 0.07, z: -0.01, s: 0.82 }; // (on the pup's head bone)

// one baked spirit-pup rig; every summon clones it (shared geometry) instead of building a Boston from scratch
let pupTemplate = null;
function pupRig() {
  if (!pupTemplate) {
    pupTemplate = buildBoston({ fur: '#6a8ad8', collar: '#ffffff', outline: '#bfe0ff' });
    pupTemplate.mat.emissive.set('#4a7aff'); pupTemplate.mat.emissiveIntensity = 0.6; pupTemplate.mat.transparent = true; pupTemplate.mat.opacity = 0.85;
    // Chewy the samurai's pups wear tiny kabuto (gfx/samuraiProps.js; every clone shares the helmet's geometry and material)
    const head = pupTemplate.parts.head;
    if (head) { const k = new THREE.Mesh(kabutoGeo(), kabutoMaterial()); k.name = 'kabuto'; k.position.set(0, KABUTO.y, KABUTO.z); k.rotation.x = -0.15; k.scale.setScalar(KABUTO.s); head.add(k); }
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
import { rand, dist, TAU, clamp, dampAngle } from '../core/util.js';
import { spellFx } from '../gfx/spellFx.js';

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
    this.t += dt; this.biteCd -= dt; this.pounceCd = (this.pounceCd ?? 1) - dt;
    if (this.t > this.p.duration) return this.expire();
    const G = this.G, P = G.player;
    const tgt = G.combat.nearest(P.pos, 'ally', 9);
    // a charged Pack Call's Spirit Wolf pounces on foes 2-6 m away (docs/CHARGE.md)
    if (this.pouncing) {
      this.pouncing.t += dt; const k = Math.min(1, this.pouncing.t / 0.32);
      this.pos.lerpVectors(this.pouncing.from, this.pouncing.to, k); this.rig.offsetY = Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) { const e = this.pouncing.e; this.pouncing = null; this.rig.offsetY = 0; if (e.alive) { G.combat.hitMonster(e, { dmgPct: this.p.pupDmgPct * 1.5, element: 'frost', source: 'pup', from: this.pos, knock: 0.8 }); e.applyStatus?.('slow', 2, 0.5); } G.vfx.ring(this.pos, { color: '#bfe0ff', r0: 0.2, r1: 1.6, life: 0.35 }); Events.emit('sfx', 'bark', { pitch: 0.75 }); }
      super.update(dt); return;
    }
    if (this.pounce && tgt && this.pounceCd <= 0) {
      const d = dist(tgt.pos.x, tgt.pos.z, this.pos.x, this.pos.z);
      if (d > 2 && d < 6) { this.pounceCd = 3; this.pouncing = { t: 0, e: tgt, from: this.pos.clone(), to: tgt.pos.clone().add(this.pos.clone().sub(tgt.pos).setY(0).normalize().multiplyScalar(tgt.radius + 0.4)) }; this.faceTo(tgt.pos.x, tgt.pos.z); }
    }
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
    this.lifeMax = Math.round(G.derived.lifeMax * 0.6); this.life = this.lifeMax; this.res = {}; this.s0 = p.size || 1; this.radius *= this.s0; this.height *= this.s0; // (a charged Giant Squeaker is bigger)
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
    this.mesh.scale.lerp(_one.setScalar(this.s0), 1 - Math.exp(-10 * dt));
    this.mesh.rotation.y += dt * 1.5; this.mesh.position.y = this.pos.y + Math.abs(Math.sin(this.t * 5)) * 0.08;
    if (this.acc >= this.p.pulse) {
      this.acc = 0;
      this.G.vfx.stink(this.pos, 10);
      this.G.combat.inRadius(this.pos.x, this.pos.z, this.p.cloudRadius, 'ally', e => { this.G.combat.hitMonster(e, { dmgPct: this.p.dmgPct, element: 'stink', source: 'decoy', from: this.pos, noCrit: true }); e.applyStatus?.('poison', 2, this.G.derived.dmgMax * 0.15); });
    }
    if (this.t > this.p.duration) this.expire();
  }
}

// ================================================================== Moka's Duck Hunt summons (models + VFX in gfx/spellFx.js)
const _dv = new THREE.Vector3(), _one = new THREE.Vector3();
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
// Decoy Duck: a wind-up rubber duck that waddles to the target point and quacks; every monster within its lure radius
// must go for it (monster.pickTarget reads tauntFor). Pops in confetti (and damage) when it breaks or runs down.
export class DuckDecoy {
  constructor(G, from, to, p) {
    this.G = G; this.p = p; this.team = 'ally'; this.alive = true; this.taunt = true; this.radius = 0.32; this.height = 0.55; this.res = {};
    this.pos = from.clone(); this.to = to.clone(); this.lifeMax = p.life; this.life = p.life;
    this.fx = spellFx(G); this.model = this.fx.duckModel();
    this.t = 0; this.acc = p.quack * 0.6; this.sq = 0; this.yaw = Math.atan2(to.x - from.x, to.z - from.z); this.moving = true;
    G.combat.add(this);
    G.vfx.poof(this.pos.clone().setY(this.pos.y + 0.3), { color: '#fff4c0', n: 8, size: 0.5 });
    this.sync(0);
  }
  tauntFor(m) { return Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < this.p.lureRadius ? 99 : 0; }
  takeDamage(dmg) { if (!this.alive) return; this.life -= dmg; this.sq = 1; Events.emit('sfx', 'squeak', { vol: 0.45 }); if (this.life <= 0) this.pop(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, p = this.p;
    this.t += dt;
    const dx = this.to.x - this.pos.x, dz = this.to.z - this.pos.z, d = Math.hypot(dx, dz);
    this.moving = d > 0.12;
    if (this.moving) {
      const step = Math.min(d, 3.4 * dt); _dv.copy(this.pos);
      this.pos.x += dx / d * step; this.pos.z += dz / d * step;
      G.world.collision?.resolve(this.pos, this.radius, _dv);
      if (Math.hypot(this.pos.x - _dv.x, this.pos.z - _dv.z) < step * 0.3) this.to.copy(this.pos); // bumped into a wall: sit here
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
      if (Math.random() < dt * 6) G.vfx.dust(this.pos, { n: 1, size: 0.15 });
    } else if (G.player) { // arrived: turn round to show off (three-quarter view, so the wind-up key shows)
      this.yaw = dampAngle(this.yaw, Math.atan2(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z) + 0.7, 5, dt);
    }
    this.pos.y = G.world.heightAt(this.pos.x, this.pos.z);
    this.acc += dt;
    if (this.acc >= p.quack) {
      this.acc = 0; this.sq = 1;
      this.fx.quack(this.pos, { r: p.lureRadius });
      Events.emit('sfx', 'quack', { pos: this.pos, vol: 0.7, pitch: 1.05 });
      G.combat.inRadius(this.pos.x, this.pos.z, p.lureRadius, 'ally', e => { if (isFoe(e)) e.applyStatus?.('slow', 1.1, p.slow); });
    }
    this.sq = Math.max(0, this.sq - dt * 4);
    if (this.t > p.duration) return this.pop();
    this.sync(dt);
  }
  sync(dt) {
    const m = this.model, w = this.moving ? Math.sin(this.t * 17) : 0, s = this.sq * Math.sin(this.sq * 9), S = 1.35 * (this.p.size || 1); // (a charged Mother Duck is bigger)
    m.root.position.set(this.pos.x, this.pos.y + (this.moving ? Math.abs(w) * 0.06 : 0), this.pos.z);
    m.root.rotation.set(this.moving ? -0.08 : 0, this.yaw + (this.moving ? w * 0.14 : Math.sin(this.t * 2.2) * 0.2), this.moving ? w * 0.2 : 0);
    m.root.scale.set(S * (1 + s * 0.22), S * (1 - s * 0.28), S * (1 + s * 0.22));
    m.key.rotation.z += dt * (this.moving ? 12 : 3);
    m.halo.material.opacity = 0.22 + 0.1 * Math.sin(this.t * 5);
  }
  pop() {
    if (!this.alive) return; this.alive = false;
    const G = this.G, p = this.p, at = this.pos.clone();
    G.combat.remove(this);
    this.fx.confetti(at, 40); this.fx.splash(at, { r: 1.1 }); this.fx.text('POP!', at.clone().setY(at.y + 1), { a: '#fff4a0', b: '#ff8fb0', size: 1.2, life: 0.7 });
    Events.emit('sfx', 'confetti_pop', { pos: at });
    G.combat.inRadius(at.x, at.z, p.popRadius, 'ally', e => G.combat.hitMonster(e, { dmgPct: p.dmgPct, from: at, knock: 1, source: 'decoy' }));
    this.fx.giveDuck(this.model);
  }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    this.G.combat.remove(this);
    if (!silent) this.fx.confetti(this.pos, 20);
    this.fx.giveDuck(this.model);
  }
}

// Spirit Retriever: a spectral golden retriever (one-draw-call mesh posed by SpellFX) that trots after Moka, bites the
// nearest foe and now and then lets out a dazing bark. Stays until knocked out (or the floor / hero changes).
export class SpiritRetriever {
  constructor(G, pos, p) {
    this.G = G; this.team = 'ally'; this.alive = true; this.radius = 0.3; this.height = 0.8; this.res = { frost: 30, zap: 30 };
    this.fx = spellFx(G); this.model = this.fx.retrieverModel();
    this.pos = pos.clone(); this.yaw = G.player?.facing || 0; this.phase = 0; this.move = 0; this.t = 0;
    this.biteT = -1; this.barkT = -1; this.biteCd = 0.3; this.barkCd = 1.5; this.alpha = 0; this.hurt = 0; this.target = null; this.retarget = 0;
    this.refresh(p, true);
    G.combat.add(this);
    this.lightPos = this.pos.clone().setY(this.pos.y + 0.8);
    this.glowSrc = G.world.lightPool?.addSource({ pos: this.lightPos, color: new THREE.Color('#ffd070'), intensity: 2.4, radius: 3.6 });
    G.vfx.pillar(this.pos, { color: '#ffe8a0', r: 0.6, h: 6, life: 0.7, opacity: 0.7 });
    this.fx.starBurst(this.pos.clone().setY(this.pos.y + 0.6), { r: 1.2, n: 14 });
    this.pose();
  }
  refresh(p, first) {
    this.p = p; this.lifeMax = p.life; this.life = p.life;
    this.model.material.uniforms?.uCol?.value.set(p.golden ? '#ffd45a' : '#ffe2a8'); // (a charged summon glows gold)
    if (!first) { this.fx.starBurst(this.pos.clone().setY(this.pos.y + 0.6), { r: 0.9, n: 10 }); this.G.vfx.heal(this.pos.clone()); }
  }
  takeDamage(dmg) { if (!this.alive) return; this.life -= dmg; this.hurt = 1; if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, P = G.player, p = this.p;
    if (!P) return;
    this.t += dt; this.biteCd -= dt; this.barkCd -= dt; this.hurt = Math.max(0, this.hurt - dt * 4); this.frenzyT = Math.max(0, (this.frenzyT || 0) - dt);
    this.alpha = Math.min(1, this.alpha + dt * 3);
    // pick a foe near Moka (re-evaluated a few times a second)
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.alive) {
      this.retarget = 0.3; this.target = null; let bd = 1e9;
      for (const e of G.combat.entities) {
        if (!isFoe(e)) continue;
        const dm = dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z); if (dm > 9) continue;
        const d = dist(e.pos.x, e.pos.z, this.pos.x, this.pos.z) + dm * 0.4;
        if (d < bd) { bd = d; this.target = e; }
      }
    }
    let gx, gz, stop;
    const T = this.target;
    if (T) { gx = T.pos.x; gz = T.pos.z; stop = (T.radius || 0.3) + 0.45; }
    else { const b = P.facing + Math.PI * 0.8; gx = P.pos.x + Math.sin(b) * 1.3; gz = P.pos.z + Math.cos(b) * 1.3; stop = 0.35; }
    if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) > 14) { // left behind: blink back to Moka in a puff of stars
      this.fx.starBurst(this.pos.clone().setY(this.pos.y + 0.5), { r: 0.8, n: 8 });
      this.pos.set(P.pos.x - Math.sin(P.facing), 0, P.pos.z - Math.cos(P.facing)); this.pos.y = G.world.heightAt(this.pos.x, this.pos.z);
      this.fx.starBurst(this.pos.clone().setY(this.pos.y + 0.5), { r: 0.8, n: 8 });
    }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
    let want = 0;
    if (d > stop && this.biteT < 0) {
      const sp = p.speed * (T ? 1 : clamp((d - stop) / 1.5, 0.3, 1)), step = Math.min(d - stop, sp * dt);
      _dv.copy(this.pos); this.pos.x += dx / d * step; this.pos.z += dz / d * step;
      G.world.collision?.resolve(this.pos, this.radius, _dv);
      want = clamp(step / Math.max(1e-4, p.speed * dt));
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
    } else if (T) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 14, dt);
    this.pos.y = G.world.heightAt(this.pos.x, this.pos.z);
    this.move += (want - this.move) * Math.min(1, dt * 10);
    this.phase += dt * (6 + 9 * this.move) * this.move;
    // bite
    if (T && d <= stop + 0.15 && this.biteCd <= 0 && this.biteT < 0) { this.biteT = 0; this.biteCd = p.biteCd / (this.frenzyT > 0 ? 1.4 : 1); this.bitten = false; } // (Good Girl!: +40% bite speed)
    if (this.biteT >= 0) {
      this.biteT += dt;
      if (!this.bitten && this.biteT > 0.12 && T?.alive) {
        this.bitten = true;
        G.combat.hitMonster(T, { dmgPct: p.dmgPct, from: this.pos, knock: 0.3, source: 'retriever' });
        this.fx.sparkBurst(T.pos.clone().setY(T.pos.y + (T.height || 1) * 0.5), { n: 6, speed: 3, size: 0.26 });
        Events.emit('sfx', 'bark_small', { pitch: 1.2, vol: 0.5 });
      }
      if (this.biteT > 0.32) this.biteT = -1;
    }
    // dazing bark when foes crowd in
    if (this.barkCd <= 0 && T && d < p.barkRadius) {
      this.barkCd = p.barkEvery; this.barkT = 0;
      Events.emit('sfx', 'retriever_bark', { pos: this.pos });
      G.vfx.ring(this.pos, { color: '#ffe8a0', r0: 0.3, r1: p.barkRadius, life: 0.4, y: 0.5 });
      G.combat.inRadius(this.pos.x, this.pos.z, p.barkRadius, 'ally', e => { if (!isFoe(e)) return; G.combat.hitMonster(e, { dmgPct: p.dmgPct * 0.35, from: this.pos, stun: p.barkStun, knock: 0.8, source: 'retriever' }); if (!e.def?.boss) this.fx.dizzy(e, p.barkStun); });
    }
    if (this.barkT >= 0) { this.barkT += dt; if (this.barkT > 0.45) this.barkT = -1; }
    if (Math.random() < dt * (4 + 8 * this.move)) this.fx.pa.spawn({ frame: 2, x: this.pos.x + rand(-0.25, 0.25), y: this.pos.y + rand(0.2, 0.8), z: this.pos.z + rand(-0.3, 0.3), vy: 0.5, life: 0.6, size: rand(0.12, 0.22), size1: 0.02, color: '#ffe8a0', alpha: 0.9, alpha1: 0 });
    this.lightPos.set(this.pos.x, this.pos.y + 0.8, this.pos.z);
    this.pose();
  }
  pose() {
    const b = this.biteT >= 0 ? Math.sin(clamp(this.biteT / 0.32) * Math.PI) : 0, k = this.barkT >= 0 ? Math.sin(clamp(this.barkT / 0.45) * Math.PI) : 0;
    this.fx.poseRetriever(this.model, { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, t: this.t, move: this.move, phase: this.phase, bite: b, bark: k, alpha: this.alpha * (1 - this.hurt * 0.5 * (0.5 + 0.5 * Math.sin(this.t * 40))), scale: 1.2 * (this.p.size || 1) }); // (a charged Golden Retriever is bigger)
  }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    const G = this.G;
    G.combat.remove(this);
    if (this.glowSrc) G.world.lightPool?.removeSource(this.glowSrc);
    if (!silent) { this.fx.starBurst(this.pos.clone().setY(this.pos.y + 0.6), { r: 1, n: 12 }); G.vfx.poof(this.pos.clone().setY(this.pos.y + 0.4), { color: '#fff0c0', n: 10 }); Events.emit('sfx', 'whine', { vol: 0.5 }); }
    this.fx.giveRetriever(this.model);
  }
}
