// The Shih Tzu's summons (docs/SHIHTZU.md §3, the Ghostlight Tome): the ghost pups and Grandpaw's Ghost. Allies in the
// combat sense (team 'ally': monsters may go for them, combat.hitAlly → takeDamage), updated by the SkillRunner
// (combat/shihtzuArts.js keeps them in runner.stzAllies). Their looks are gfx/shihtzuGhosts.js through ShihtzuFX: the pups
// are slots in the scene's instanced pup batch (cheap: one draw for all of them), Grandpaw a pooled mesh. Friendly: the
// pups tumble about after him with a blep and nip at foes (a nip keeps a hex going); Grandpaw floats over the crowd,
// stomps, howls hexes over everything near, and starts by licking the hero's face.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, dist, TAU, clamp, dampAngle, ease } from '../core/util.js';
import { stzFx, STZ_COL } from '../gfx/shihtzuFx.js';
import '../gfx/shihtzuFxArts.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** 0..1: how much a summon (its feet at pos, a body radius r and height h in metres) covers the hero on screen: their
 *  screen circles overlapping, the summon nearer the camera. Four projections a summon a frame. The owner's CP2 review:
 *  Grandpaw and the pups in front of him hid him in a fight; a summon over him now fades to 35%. */
export function coversHero(G, pos, r, h) {
  const P = G.player, cam = G.engine?.camera; if (!P || !cam) return 0;
  const cp = cam.position;
  const dH = cp.distanceTo(_a.set(P.pos.x, P.pos.y + 0.6, P.pos.z)), dS = cp.distanceTo(_b.set(pos.x, pos.y + h * 0.5, pos.z));
  if (dS >= dH - 0.2) return 0; // (behind him, or beside him)
  const asp = innerWidth / Math.max(1, innerHeight);
  _a.project(cam); const hx = _a.x * asp, hy = _a.y; _a.set(P.pos.x, P.pos.y + 1.25, P.pos.z).project(cam); const rH = Math.hypot(_a.x * asp - hx, _a.y - hy);
  _b.project(cam); const sx = _b.x * asp, sy = _b.y; _b.set(pos.x, pos.y + h, pos.z).project(cam); const rS = Math.max(Math.hypot(_b.x * asp - sx, _b.y - sy), r / Math.max(0.5, dS) * 1.2);
  const d = Math.hypot(hx - sx, hy - sy);
  return clamp((rH + rS - d) / Math.max(1e-4, rH * 1.2));
}
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const ground = (G, x, z) => G.world.heightAt?.(x, z) ?? 0;

/** the foe nearest a point, near the hero (within `leash` of him), weighted toward him */
function pickFoe(G, from, leash = 9) {
  const P = G.player; let best = null, bd = 1e9;
  for (const e of G.combat.entities) {
    if (!isFoe(e)) continue;
    const dp = dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z); if (dp > leash) continue;
    const d = dist(e.pos.x, e.pos.z, from.x, from.z) + dp * 0.4;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ================================================================== the ghost pups
export class GhostPup {
  /** R: the Ghost Pups runtime (params: nipPct, nipEvery, lifePct, duration; a charged summon's extras ride on `o`) */
  constructor(G, R, pos, i, o = {}) {
    this.G = G; this.team = 'ally'; this.alive = true; this.radius = 0.24; this.height = 0.6; this.res = { gloom: 60 };
    this.fx = stzFx(G); this.slot = this.fx.pupBatch().add();
    this.i = i; this.pos = pos.clone(); this.yaw = G.player?.facing || 0; this.t = 0; this.ph = rand(0, TAU); this.alpha = 0; this.hurt = 0;
    this.nipCd = rand(0.2, 0.6); this.nipT = -1; this.target = null; this.retarget = 0; this.hop = 0; this.see = 1;
    this.refresh(R, o);
    if (!this.slot) { this.alive = false; return; }
    G.combat.add(this);
    this.fx.summonPuff(this.pos, 0.35);
  }
  refresh(R, o = {}) {
    const G = this.G, p = R.params;
    this.p = p; this.o = o; this.t = 0;
    this.lifeMax = Math.max(1, Math.round((G.derived?.lifeMax || 100) * p.lifePct / 100)); this.life = this.lifeMax;
    this.big = !!(o.big && this.i === 0); this.scale = this.big ? 1.3 : 1; // (The Runt: one extra-big pup)
  }
  takeDamage(dmg) { if (!this.alive) return; this.life -= dmg; this.hurt = 1; if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, P = G.player, p = this.p, S = G.skills;
    if (!P) return;
    this._dt = dt; this.t += dt; this.nipCd -= dt; this.hurt = Math.max(0, this.hurt - dt * 4); this.alpha = Math.min(1, this.alpha + dt * 3);
    if (this.t > p.duration) return this.expire();
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target?.alive) { this.retarget = 0.35; this.target = pickFoe(G, this.pos); }
    const T = this.target;
    // a place to be: at the foe, or in a loose fan behind the hero
    let gx, gz, stop;
    if (T) { gx = T.pos.x; gz = T.pos.z; stop = (T.radius || 0.3) + 0.3; }
    else { const n = Math.max(1, S?.stzPupCount?.() || 1), a = P.facing + Math.PI + (this.i - (n - 1) / 2) * 0.55; gx = P.pos.x + Math.sin(a) * 1.4; gz = P.pos.z + Math.cos(a) * 1.4; stop = 0.2; }
    if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) > 15) { this.fx.summonPuff(this.pos, 0.3); this.pos.set(P.pos.x - Math.sin(P.facing), P.pos.y, P.pos.z - Math.cos(P.facing)); this.fx.summonPuff(this.pos, 0.3); }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > stop && this.nipT < 0) {
      const sp = (T ? 7.5 : 6.5) * (T ? 1 : clamp((d - stop) / 1.2, 0.25, 1)), step = Math.min(d - stop, sp * dt);
      this.pos.x += dx / d * step; this.pos.z += dz / d * step; // (ghosts float over the clutter: no collision)
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt); this.hop = Math.min(1, this.hop + dt * 4);
    } else { this.hop = Math.max(0, this.hop - dt * 3); if (T) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt); }
    this.pos.y = ground(G, this.pos.x, this.pos.z);
    // a nip: a little lunge and a nod; a nip on a hexed foe keeps its hex going
    if (T && d <= stop + 0.2 && this.nipCd <= 0 && this.nipT < 0) { this.nipT = 0; this.nipCd = p.nipEvery * rand(0.9, 1.1); this.nipped = false; }
    if (this.nipT >= 0) {
      this.nipT += dt;
      if (!this.nipped && this.nipT > 0.12 && T?.alive) {
        this.nipped = true;
        G.combat.hitMonster(T, { dmgPct: p.nipPct * (this.big ? 2 : 1), element: 'gloom', source: 'pup', from: this.pos, silent: false });
        const h = S?.stzHexes?.get(T); if (h) h.t = Math.max(h.t, Math.min(h.dur || 5, h.t + 1.5));
        if (this.o.hex && S?.stzHex) S.stzHex(T, this.o.hex.dps, this.o.hex.dur, 1, this.o.hex.cap); // (Haunting Nips: a charged summon's pups hex too)
        this.fx.glint(_v.set(T.pos.x, T.pos.y + (T.height || 1) * 0.6, T.pos.z), 2);
        if (Math.random() < 0.5) sfx('pup_yip', { pitch: rand(1.1, 1.35), vol: 0.45, pos: this.pos });
      }
      if (this.nipT > 0.3) this.nipT = -1;
    }
    this.pose();
  }
  pose() {
    const nip = this.nipT >= 0 ? Math.sin(clamp(this.nipT / 0.3) * Math.PI) : 0;
    const bob = 0.32 + Math.sin(this.t * 3.1 + this.ph) * 0.06 + Math.abs(Math.sin(this.t * 9 + this.ph)) * 0.05 * this.hop;
    const k = Math.min(1, this.alpha * 1.4), fl = this.hurt > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(this.t * 40)) : 1;
    const fwd = nip * 0.18;
    this.see += ((1 - 0.65 * coversHero(this.G, this.pos, 0.25 * this.scale, 0.66 * this.scale)) - this.see) * Math.min(1, (this._dt || 0.016) * 10); // (fade over the hero)
    this.fx.pupBatch().set(this.slot, { x: this.pos.x + Math.sin(this.yaw) * fwd, y: this.pos.y + bob, z: this.pos.z + Math.cos(this.yaw) * fwd, yaw: this.yaw, pitch: 0.12 * this.hop + 0.25 * nip,
      scale: this.scale * (0.6 + 0.4 * ease.outBack(k)), sy: 1 + 0.06 * Math.sin(this.t * 6 + this.ph), phase: this.ph, nod: 0.45 * nip, alpha: k * fl * Math.min(1, (this.p.duration - this.t) * 2) * this.see, wag: 1 });
  }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    this.G.combat.remove(this);
    if (this.slot) this.fx.pupBatch().remove(this.slot);
    if (!silent) { this.fx.summonPuff(this.pos, 0.3); this.fx.hearts(_v.copy(this.pos).setY(this.pos.y + 0.6), 1); }
  }
}

// ================================================================== Grandpaw's Ghost
const GP_SCALE = 2.4;
export class Grandpaw {
  /** R: the Grandpaw's Ghost runtime (params: duration, dmgPct, stompEvery, radius, howlEvery, howlRadius, hexPct, hexDur, lifePct) */
  constructor(G, R, pos, o = {}) {
    this.G = G; this.team = 'ally'; this.alive = true; this.radius = 0.6; this.height = 1.6; this.res = { gloom: 75, frost: 30, zap: 30 };
    this.fx = stzFx(G); this.gp = this.fx.grandpaw();
    this.pos = pos.clone(); this.yaw = (G.player?.facing || 0) + Math.PI; this.t = 0; this.ph = rand(0, TAU); this.alpha = 0; this.hurt = 0;
    this.see = 1; this.state = 'rise'; this.st = 0; this.stompT = -1; this.howlT = -1; this.stompCd = 1.2; this.howlCd = 1.6; this.lickT = -1; this.target = null; this.retarget = 0; this.lift = 0;
    this.refresh(R, o, true);
    G.combat.add(this);
    this.fx.summonPuff(this.pos, 0.9); this.fx.ring(this.pos, 2.4, 0.6, STZ_COL.ghost, 0.5);
    sfx('gp_rise', { pos: this.pos });
  }
  refresh(R, o = {}, first) {
    const G = this.G, p = R.params; this.p = p; this.o = o;
    this.lifeMax = Math.max(1, Math.round((G.derived?.lifeMax || 100) * p.lifePct / 100)); this.life = this.lifeMax; this.t = first ? 0 : Math.min(this.t, 0.7);
    this.scale = GP_SCALE * (o.size || 1);
    if (!first) { this.fx.summonPuff(this.pos, 0.8); this.fx.hearts(_v.copy(this.pos).setY(this.pos.y + 2), 4); }
  }
  /** he draws the crowd near him (a soft taunt: monsters within 6 m prefer him a little) */
  tauntFor(m) { return dist(m.pos.x, m.pos.z, this.pos.x, this.pos.z) < 6 ? 2.5 : 0; }
  takeDamage(dmg) { if (!this.alive) return; this.life -= dmg; this.hurt = 1; if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, P = G.player, p = this.p, S = G.skills, fx = this.fx;
    if (!P) return;
    this.t += dt; this.st += dt; this.hurt = Math.max(0, this.hurt - dt * 3); this.alpha = Math.min(1, this.alpha + dt * 2);
    if (this.t > p.duration) return this.expire();
    // rising out of the tome's light, then over to the hero for a lick on the face, then to work
    if (this.state === 'rise') { if (this.st > 0.7) { this.state = 'lick'; this.st = 0; } }
    else if (this.state === 'lick') {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt);
      if (d > 1.3) { const step = Math.min(d - 1.3, 5 * dt); this.pos.x += dx / d * step; this.pos.z += dz / d * step; }
      else if (this.lickT < 0) { this.lickT = 0; sfx('gp_lick', { pos: this.pos }); }
      if (this.lickT >= 0) {
        this.lickT += dt;
        if (this.lickT > 0.35 && !this.licked) { this.licked = true; fx.hearts(_v.copy(P.pos).setY(P.pos.y + 1.3), 5); P.anim?.play?.('happy', { force: false }); }
        if (this.lickT > 0.8) { this.state = 'fight'; this.st = 0; }
      }
      if (this.st > 2.5) { this.state = 'fight'; this.st = 0; }
    } else {
      this.retarget -= dt;
      if (this.retarget <= 0 || !this.target?.alive) { this.retarget = 0.4; this.target = pickFoe(G, this.pos, 10); }
      const T = this.target;
      let gx, gz, stop;
      if (T) { gx = T.pos.x; gz = T.pos.z; stop = (T.radius || 0.3) + p.radius * 0.45; }
      else { const a = P.facing + Math.PI * 0.75; gx = P.pos.x + Math.sin(a) * 2.2; gz = P.pos.z + Math.cos(a) * 2.2; stop = 0.4; }
      if (dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) > 16) { fx.summonPuff(this.pos, 0.8); this.pos.set(P.pos.x - Math.sin(P.facing) * 2, P.pos.y, P.pos.z - Math.cos(P.facing) * 2); fx.summonPuff(this.pos, 0.8); }
      const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
      if (d > stop && this.stompT < 0) { const step = Math.min(d - stop, (T ? 3.6 : 3) * dt); this.pos.x += dx / d * step; this.pos.z += dz / d * step; this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 5, dt); }
      else if (T) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt);
      this.stompCd -= dt; this.howlCd -= dt;
      const near = T && dist(T.pos.x, T.pos.z, this.pos.x, this.pos.z) < p.radius + (T.radius || 0.3);
      if (near && this.stompCd <= 0 && this.stompT < 0 && this.howlT < 0) { this.stompT = 0; this.stompCd = p.stompEvery; this.stomped = false; }
      if (T && this.howlCd <= 0 && this.stompT < 0 && this.howlT < 0) { this.howlT = 0; this.howlCd = p.howlEvery * (this.o.stories ? this.o.stories.k : 1); this.howled = false; sfx('gp_howl', { pos: this.pos }); }
      if (this.o.lantern && !G.playerDead && dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) < this.o.lantern.r) G.actions.heal?.((G.derived?.lifeMax || 100) * this.o.lantern.regen / 100 * dt); // (Grandpaw's Lantern)
    }
    this.pos.y = ground(G, this.pos.x, this.pos.z);
    // the stomp: he bobs up, then drops onto the floor in front of him
    if (this.stompT >= 0) {
      this.stompT += dt;
      if (!this.stomped && this.stompT > 0.38) {
        this.stomped = true;
        _v.set(this.pos.x + Math.sin(this.yaw) * 0.5, this.pos.y, this.pos.z + Math.cos(this.yaw) * 0.5);
        fx.thud(_v, 1.3, true); fx.ring(_v, p.radius, 0.4, STZ_COL.ghost, 0.45);
        G.combat.inRadius(_v.x, _v.z, p.radius, 'ally', e => { if (isFoe(e)) G.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'gloom', knock: 0.5, from: _v, source: 'grandpaw' }); });
        sfx('flail_thud', { pitch: 0.75, pos: _v }); G.engine.rig.shake(0.12);
      }
      if (this.stompT > 0.62) this.stompT = -1;
    }
    // the howl: head back, notes and a ring, and a hex on every foe in earshot
    if (this.howlT >= 0) {
      this.howlT += dt;
      if (!this.howled && this.howlT > 0.3) {
        this.howled = true;
        fx.awoo(this.pos, p.howlRadius);
        let n = 0;
        G.combat.inRadius(this.pos.x, this.pos.z, p.howlRadius, 'ally', e => { if (isFoe(e) && S?.stzHex && n++ < 24) S.stzHex(e, p.hexPct, p.hexDur, 1, G.derived?.hexStacks || 3); });
      }
      if (this.howlT > 1.0) this.howlT = -1;
    }
    this.pose(dt);
  }
  pose(dt) {
    const rise = ease.outCubic(clamp(this.t / 0.7)), stomp = this.stompT >= 0 ? this.stompT : -1;
    const up = stomp >= 0 ? (stomp < 0.38 ? ease.outQuad(stomp / 0.38) * 0.45 : Math.max(0, 0.45 * (1 - (stomp - 0.38) / 0.08))) : 0;
    const howl = this.howlT >= 0 ? Math.sin(clamp(this.howlT / 1.0) * Math.PI) : 0;
    const lick = this.lickT >= 0 && this.lickT < 0.8 ? Math.sin(clamp(this.lickT / 0.8) * Math.PI) : 0;
    const fl = this.hurt > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(this.t * 30)) : 1;
    const fade = Math.min(1, (this.p.duration - this.t) * 1.5);
    this.see += ((1 - 0.65 * coversHero(this.G, this.pos, 0.6 * this.scale / 2.4, 1.6 * this.scale / 2.4)) - this.see) * Math.min(1, (dt || 0.016) * 10); // (fade over the hero)
    const s = { x: this.pos.x, y: this.pos.y + 0.15 + Math.sin(this.t * 1.7 + this.ph) * 0.08 + up - (1 - rise) * 1.2, z: this.pos.z, yaw: this.yaw, pitch: 0.25 * lick + 0.12 * up,
      scale: this.scale * (0.5 + 0.5 * rise), sy: 1 - 0.08 * (stomp > 0.38 && stomp < 0.5 ? 1 : 0), phase: this.ph, nod: -0.55 * howl + 0.35 * lick, alpha: Math.min(1, this.alpha) * fl * fade * this.see, wag: up * 0.6 };
    this.gp.model.set(s);
    this.fx.lanternFlame(this.gp, s, dt);
  }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    this.G.combat.remove(this);
    if (!silent) { this.fx.summonPuff(this.pos, 1); this.fx.hearts(_v.copy(this.pos).setY(this.pos.y + 2.2), 5); sfx('gp_rise', { pitch: 1.3, vol: 0.6, pos: this.pos }); }
    this.fx.giveGrandpaw(this.gp);
  }
}
