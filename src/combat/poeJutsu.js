// Poe's Ninjutsu (docs/POE.md §3): Fire Release: Puff Ball, Shadow Clone, Substitution, Lightning Release: Thunder Paw,
// Smoke Dragon (Smoke Bomb lives in poeSkills.js). Jutsu damage already carries Energy (skillsPoe.js jutsuMul). Mixed
// into SkillRunner by poeSkills.js; the shared machinery (poeShoot, poeZone, poeLob…) is in poeArts.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, angleDiff } from '../core/util.js';
import '../gfx/poeFxArts.js';
import { POE_COL } from '../gfx/poeFx.js';
import { smokeCopy } from '../actors/poeProps.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;

// ------------------------------------------------------------------ the smoke copies (Shadow Clone)
// An ally entity monsters can pick on (they're as cute as she is). It keeps a slot beside her and mirrors her pose
// every frame, so it slashes when she slashes; poeCloneEcho makes the hits real (clonePct of hers).
const SLOTS = [[-1.15, -0.25], [1.15, -0.25], [-0.85, -1.15], [0.85, -1.15]];
export class ShadowClone {
  constructor(G, runner, pos, p, o, slot) {
    this.G = G; this.runner = runner; this.p = p; this.o = o; this.slot = slot;
    this.team = 'ally'; this.alive = true; this.radius = 0.3; this.height = 1.0; this.res = {}; this.kind = 'poeClone';
    this.lifeMax = Math.round(p.life * (o.lifeMul || 1)); this.life = this.lifeMax;
    this.t = 0; this.hurt = 0; this.dur = p.duration;
    this.pos = pos.clone(); this.facing = G.player.facing;
    this.copy = runner.poeImage() || smokeCopy(G.player.rig); this.copyRig = runner.poeImgRig; // (from her pool of smoke copies: no clone build mid-fight)
    if (this.copy.root.parent !== G.world.scene) G.world.scene.add(this.copy.root);
    this.copy.root.visible = true; this.copy.set(0);
    G.combat.add(this);
  }
  tauntFor(m) { return this.o.lure && Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < this.o.lure ? 99 : 0; }
  takeDamage(dmg) { if (!this.alive) return; this.life -= dmg; this.hurt = 1; if (this.life <= 0) this.expire(); }
  heal(n) { this.life = Math.min(this.lifeMax, this.life + n); }
  update(dt) {
    if (!this.alive) return;
    const G = this.G, P = G.player; this.t += dt; this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.t >= this.dur || G.playerDead) return this.expire();
    // keep its slot beside her (rotated with her facing), a touch behind her pace
    const [sx, sz] = SLOTS[this.slot % SLOTS.length], f = P.facing, cs = Math.cos(f), sn = Math.sin(f);
    const tx = P.pos.x + sx * cs + sz * sn, tz = P.pos.z - sx * sn + sz * cs, dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 6) this.pos.set(tx, P.pos.y, tz);
    else if (d > 0.05) { const st = Math.min(d, Math.max(4, d * 6) * dt); _t.copy(this.pos); this.pos.x += dx / d * st; this.pos.z += dz / d * st; G.world.collision?.resolve(this.pos, this.radius, _t); }
    this.pos.y = G.world.heightAt(this.pos.x, this.pos.z);
    this.facing = f;
    // mirror her pose; the root sits on its own spot with her yaw and her hop
    const C = this.copy, R = P.rig.root;
    C.mirror(); C.root.position.set(this.pos.x, this.pos.y + (R.position.y - P.pos.y), this.pos.z); C.root.quaternion.copy(R.quaternion);
    C.tick(G.engine.time || 0);
    const fadeIn = clamp(this.t / 0.25), fadeOut = clamp((this.dur - this.t) / 0.5);
    C.set((0.82 + 0.15 * this.hurt) * Math.min(fadeIn, fadeOut) * (this.t > this.dur - 1.2 ? 0.75 + 0.25 * Math.sin(this.t * 22) : 1));
    if (Math.random() < dt * 8) this.runner.pfx().pn.spawn({ frame: 0, x: this.pos.x + rand(-0.2, 0.2), y: this.pos.y + rand(0.2, 0.9), z: this.pos.z + rand(-0.2, 0.2), vy: rand(0.4, 0.8), life: 0.5, size: 0.14, size1: 0.3, color: POE_COL.ink2, alpha: 0.4, alpha1: 0 });
  }
  expire(silent) {
    if (!this.alive) return; this.alive = false;
    const G = this.G, fx = this.runner.pfx();
    G.combat.remove(this);
    if (this.copyRig && this.copyRig === this.runner.poeImgRig && this.runner.poeImgAll?.includes(this.copy)) { this.copy.root.visible = false; this.copy.root.parent?.remove(this.copy.root); this.runner.poeImgFree.push(this.copy); } else this.copy.dispose();
    if (silent) return;
    fx.puff(this.pos, { r: 0.7, n: 9, low: true }); sfx('poe_vanish', { pos: this.pos, vol: 0.5, pitch: 1.2 });
    // Clone Pop (a charged clone's perk): it bursts in a cloud of pepper smoke
    const b = this.o.boom;
    if (b) { fx.puff(this.pos, { r: b.r, n: 10 }); sfx('smoke_bomb', { pos: this.pos, vol: 0.6 }); this.runner.poeNova(this.pos.x, this.pos.z, b.r, e => { this.runner.poeHit(e, { dmgPct: b.pct, element: 'stink', knock: 0.6, from: this.pos }); if (e.alive && !e.breakable) this.runner.poeBlind(e, b.blind, 50); }); }
  }
}
// ------------------------------------------------------------------ the substitution log
export class SubLog {
  constructor(G, runner, pos, p, o) {
    this.G = G; this.runner = runner; this.p = p; this.o = o;
    this.team = 'ally'; this.alive = true; this.radius = 0.35; this.height = 0.45; this.res = {}; this.kind = 'poeLog';
    this.lifeMax = 1e6; this.life = 1e6; this.t = 0; this.sq = 0;
    this.pos = pos.clone(); this.pos.y = G.world.heightAt(pos.x, pos.z);
    this.m = runner.pfx().prop('log'); this.yaw = G.player.facing + Math.PI / 2 + rand(-0.4, 0.4);
    this.m.position.copy(this.pos); this.m.position.y += 0.17; this.m.rotation.set(0, this.yaw, 0); this.m.scale.setScalar(1.25);
    G.combat.add(this);
  }
  tauntFor(m) { return Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) < this.p.taunt ? 99 : 0; }
  takeDamage() { if (!this.alive) return; this.sq = 1; if (!this._sq || this.G.engine.time - this._sq > 0.25) { this._sq = this.G.engine.time; sfx('squeak', { pos: this.pos, vol: 0.45, pitch: 0.8 }); } }
  heal() {}
  update(dt) {
    if (!this.alive) return;
    this.t += dt; this.sq = Math.max(0, this.sq - dt * 6);
    const pop = this.t < 0.2 ? Math.sin(this.t / 0.2 * Math.PI) * 0.15 : 0;
    this.m.scale.set(1.25 * (1 + 0.18 * this.sq), 1.25 * (1 - 0.22 * this.sq + pop), 1.25 * (1 + 0.18 * this.sq));
    this.m.rotation.z = Math.sin(this.t * 30) * 0.06 * this.sq;
    if (this.t >= this.p.logLife || this.G.playerDead) this.pop();
  }
  pop(silent) {
    if (!this.alive) return; this.alive = false;
    const G = this.G, R = this.runner, fx = R.pfx(), p = this.p;
    G.combat.remove(this); fx.give('log', this.m);
    if (silent) return;
    fx.logPop(this.pos, p.popRadius); sfx('smoke_bomb', { pos: this.pos, vol: 0.7, pitch: 1.1 }); G.engine.rig.shake(0.15);
    R.poeNova(this.pos.x, this.pos.z, p.popRadius, e => { R.poeHit(e, { dmgPct: p.dmgPct, element: 'stink', knock: 0.6, from: this.pos }); if (e.alive && !e.breakable) R.poeBlind(e, p.blind, 50); });
    if (this.o.splinters) { const s = this.o.splinters, from = this.pos.clone(); from.y += 0.35; for (let i = 0; i < s.n; i++) { const a = (i / s.n) * TAU + rand(-0.2, 0.2); R.poeShoot({ kind: 'shard', pos: from, dir: _v.set(Math.cos(a), 0, Math.sin(a)), speed: 13, range: 4.5, radius: 0.3, pierce: 1, scale: 1.2, onHit: e => R.poeHit(e, { dmgPct: p.dmgPct * s.pct / 100, knock: 0.3, from }) }); } }
  }
}

export const M = {
  // ================================================================== Fire Release: Puff Ball
  cast_puffBall(R, aim, target, o = {}) {
    const P = this.G.player;
    this.poeBreakStealth();
    P.anim.play('puffSpit', { speed: 1.15 * (this.castRate?.() || 1), onEvent: ev => {
      if (ev === 'spit') this.poePuffBall(R, aim, target, o);
    } });
    _h.set(P.pos.x, P.pos.y + 0.95, P.pos.z).addScaledVector(this.forward(), 0.3); this.pfx().seal(_h, POE_COL.mustard); sfx('poe_seal', { pitch: 1.1 });
  },
  poePuffBall(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    const from = _h.set(P.pos.x, P.pos.y + 0.85, P.pos.z).addScaledVector(this.forward(), 0.45).clone();
    const to = target?.alive && !target.breakable ? target.pos : aim, base = Math.atan2(to.x - P.pos.x, to.z - P.pos.z);
    const n = 1 + (o.split || 0), spread = 0.16;
    sfx('puff_spit'); G.engine.rig.shake(0.06);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i - (n - 1) / 2) * spread), main = n === 1 || i === (n - 1) / 2 || (n === 2), kk = main ? (n === 2 ? 0.85 : 1) : (o.splitPct || 50) / 100;
      const size = (o.size || 1) * (main ? 1 : 0.7);
      this.poeShoot({ kind: 'fire', pos: from, dir: _v.set(Math.sin(a), 0, Math.cos(a)), speed: p.speed, range: p.range, radius: 0.3 * size, size, hop: { len: 2.6, h: 0.5 },
        onHit: (e, s) => this.poeFireBurst(s.pos, R, e, kk, o),
        onEnd: (s, wall) => { if (!s.stuck) this.poeFireBurst(s.pos, R, null, kk, o); } });
    }
  },
  /** the Puff Ball bursts: the primary takes the full hit, the burst splashes its neighbours, everyone burns */
  poeFireBurst(at, R, primary, kk = 1, o = {}, hop = 0) {
    const G = this.G, p = R.params, fx = this.pfx(), g = this.ground(at.clone());
    fx.fireBurst(g, p.radius); sfx('fire_burst', { pos: g }); G.engine.rig.shake(0.14);
    const burn = (e, dmg, pct) => { if (e.alive && !e.breakable && dmg) e.applyStatus?.('burn', p.burnDuration, dmg * p.burnPct / 100 / Math.max(1, pct / 100)); };
    if (primary?.alive) { const d = this.poeHit(primary, { dmgPct: p.dmgPct * kk, element: 'fire', knock: 0.5, from: this.G.player.pos }); burn(primary, d, p.dmgPct * kk); }
    const hit = [];
    this.poeNova(g.x, g.z, p.radius, e => { if (e === primary) return; const pct = p.dmgPct * kk * p.splashPct / 100; const d = this.poeHit(e, { dmgPct: pct, element: 'fire', knock: 0.4, from: g }); burn(e, d, pct); hit.push(e); });
    // Bouncing Ember (a charged ball's perk): it hops on to more foes after the burst
    if (o.bounce && hop < o.bounce.n) {
      const seen = new Set([primary, ...hit]);
      const next = this.combat.nearest(g, 'ally', 6, e => !seen.has(e) && !e.breakable);
      if (next) this.poeShoot({ kind: 'fire', pos: g.clone().setY(g.y + 0.4), dir: _v.copy(next.pos).sub(g).setY(0).normalize(), speed: p.speed * 1.1, range: 7, radius: 0.25, size: 0.7, hop: { len: 1.6, h: 0.6 },
        onHit: (e, s) => this.poeFireBurst(s.pos, R, e, kk * o.bounce.pct / 100, o, hop + 1) });
    }
  },

  // ================================================================== Shadow Clone
  cast_shadowClone(R, aim, target, o = {}) {
    const P = this.G.player;
    this.poeBreakStealth(true);
    P.anim.play('crossSeal', { speed: this.castRate?.() || 1, onEvent: ev => { if (ev === 'poof') this.poeMakeClones(R, o); } });
    sfx('poe_seal');
  },
  poeMakeClones(R, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    for (const c of this.poeClones || []) c.expire(true);
    this.poeClones = [];
    const n = Math.min(4, p.clones + (o.extra || 0)), f = P.facing, cs = Math.cos(f), sn = Math.sin(f);
    for (let i = 0; i < n; i++) {
      const [sx, sz] = SLOTS[i]; _v.set(P.pos.x + sx * cs + sz * sn, P.pos.y, P.pos.z - sx * sn + sz * cs);
      if (G.world.walkable && !G.world.walkable(_v.x, _v.z)) _v.copy(P.pos);
      const c = new ShadowClone(G, this, _v, p, o, i);
      this.poeClones.push(c);
      fx.puff(c.pos, { r: 0.5, n: 7, low: true });
    }
    fx.word('POOF!', _h.set(P.pos.x, P.pos.y + 1.7, P.pos.z), { a: '#ffffff', b: '#b8a8e0', size: 1.05, life: 0.7 });
    sfx('smoke_bomb', { vol: 0.7, pitch: 1.2 }); sfx('poe_vanish', { pitch: 0.9, vol: 0.6 });
  },
  /** her clones copy what she just did (kind 'slash' | 'throw' | 'kunai'), at clonePct of her damage */
  poeCloneEcho(kind, a = {}) {
    const L = this.poeClones; if (!L?.length) return;
    const G = this.G, P = G.player, fx = this.pfx();
    for (const c of L) {
      if (!c.alive || c.t < 0.2) continue;
      const k = c.p.clonePct / 100;
      if (kind === 'slash') {
        G.vfx.slash(c.pos, P.facing, { arc: (a.arc || 130) * Math.PI / 180, r: (a.radius || 1.9) * 0.9, width: 0.6, color: '#c8b8f0', life: 0.18, glow: false });
        this.arcHit(c.pos, P.facing, a.radius || 1.9, a.arc || 130, e => this.poeHit(e, { dmgPct: a.dmgPct * k, knock: 0.15, from: c.pos, clone: true }));
      } else if (kind === 'throw') {
        // a smoky fūma straight out along her aim and back to the clone
        const look = P.equippedLook?.() || {}, h = fx.fumaFly(look, this.fumaScale() * 0.85), from = c.pos.clone(); from.y += 0.85;
        const dir = a.dir.clone(), range = (a.range || 6.5) * 0.85, speed = a.speed || 19, hitO = new Set(), hitB = new Set();
        let s = 0, back = false, spin = 0;
        this.poeZone({ life: 2.5, update: (dt, z) => {
          spin += dt * 30; s += (back ? -1 : 1) * speed * dt; if (!back && s >= range) back = true;
          const home = _w.set(c.pos.x, c.pos.y + 0.85, c.pos.z);
          _v.copy(back ? home : from).addScaledVector(dir, back ? Math.max(0, s) : s);
          if (back && s <= 0) return false;
          h.set(_v, spin, 0, speed, G.world.heightAt(_v.x, _v.z));
          const set = back ? hitB : hitO;
          for (const e of this.combat.entities) if (e.alive && e.team === 'enemy' && !set.has(e) && Math.hypot(e.pos.x - _v.x, e.pos.z - _v.z) < 0.6 + (e.radius || 0.3)) { set.add(e); this.poeHit(e, { dmgPct: a.dmgPct * k, knock: 0.2, from: _v.clone(), clone: true }); }
        }, end: () => h.end() });
      } else if (kind === 'kunai') {
        const n = Math.max(2, Math.ceil(a.count / 2)), base = Math.atan2(a.aim.x - c.pos.x, a.aim.z - c.pos.z), spread = (a.spread * Math.PI) / 180 * 0.7, from = c.pos.clone(); from.y += 0.8;
        for (let i = 0; i < n; i++) { const ang = base + (i / (n - 1) - 0.5) * spread; this.poeShoot({ kind: 'kunai', pos: from, dir: _v.set(Math.sin(ang), 0, Math.cos(ang)), speed: a.speed, range: a.range * 0.85, radius: 0.24, onHit: e => this.poeHit(e, { dmgPct: a.dmgPct * k, knock: 0.15, from, clone: true }) }); }
      }
    }
  },

  // ================================================================== Substitution
  cast_substitution(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const to = this.poeBlinkSpot(aim, p.range);
    this.poeBreakStealth(true);
    P.invuln = true; this._subT = 0.6;
    P.anim.play('swapSeal', { speed: 1.2, onEvent: ev => {
      if (ev !== 'swap') return;
      const fx = this.pfx(), at = P.pos.clone();
      for (const l of this.poeLogs || []) l.pop(); // (one log at a time — the old one pops now)
      this.poeLogs = [new SubLog(G, this, at, p, o)];
      if (o.twoLogs) this.poeLogs.push(new SubLog(G, this, _v.copy(at).addScaledVector(this.forward(), -1).add(_w.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5))), p, { ...o, splinters: null }));
      fx.puff(at, { r: 0.8, n: 9, low: true }); fx.word('POOF!', _h.set(at.x, at.y + 1.5, at.z), { a: '#ffffff', b: '#c8e0a0', size: 0.95, life: 0.6 });
      // every foe that was after her bites the log instead
      for (const e of this.combat.entities) if (isFoe(e) && e.atkTarget === P && (e.state === 'windup' || e.state === 'attack') && !e.def?.boss) e.cancelAttack?.();
      P.setPos(to.x, to.z); P.pos.y = G.world.heightAt(to.x, to.z); P.sync?.();
      fx.puff(P.pos, { r: 0.6, n: 7, low: true });
      sfx('poe_vanish'); sfx('shadow_pop', { pitch: 1.2 });
      P.anim.play('swapLand');
    } });
  },
  /** the far end of a blink: the aim clamped to range, walked back along the line until it's open floor */
  poeBlinkSpot(aim, range) {
    const G = this.G, P = G.player, W = G.world;
    const dx = aim.x - P.pos.x, dz = aim.z - P.pos.z, d = Math.hypot(dx, dz) || 1, L = Math.min(range, d);
    for (let s = L; s > 0.4; s -= 0.3) { const x = P.pos.x + dx / d * s, z = P.pos.z + dz / d * s; if ((!W.walkable || W.walkable(x, z)) && !W.collision?.solidAt?.(x, z, 0.3)) return new THREE.Vector3(x, W.heightAt(x, z), z); }
    return P.pos.clone();
  },

  // ================================================================== Lightning Release: Thunder Paw
  cast_thunderPaw(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const foe = this.pickFoe(aim, target, p.range), at = foe ? foe.pos.clone() : this.clampAim(aim, p.range);
    this.poeBreakStealth();
    this.faceTo(at);
    this.poeCrackleT = 0.5;
    sfx('zap_charge');
    P.anim.play('thunderSlap', { speed: this.castRate?.() || 1, onEvent: ev => { if (ev === 'slap') { this.poeCrackleT = 0; this.poeThunder(R, foe, at, o, 1); } } });
  },
  poeThunder(R, first, at, o = {}, power = 1) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    // the slap: a crack at her paw, then the bolt drops on the target and leaps foe to foe
    fx.pawPrint(this.ground(P.pos.clone().addScaledVector(this.forward(), 0.5)), 0.5, 0.8); G.engine.rig.shake(0.2 + 0.1 * power);
    sfx('thunder_crack', { vol: 0.6 + 0.4 * power });
    const strike = (e, pos, i) => {
      fx.thunderStrike(pos, power);
      if (e) this.poeHit(e, { dmgPct: p.dmgPct * power * Math.pow(1 - p.falloff / 100, i), element: 'zap', stun: p.stun, from: pos });
      else this.poeNova(pos.x, pos.z, 1.2, x => this.poeHit(x, { dmgPct: p.dmgPct * power, element: 'zap', stun: p.stun, from: pos }));
    };
    const tgt = first?.alive ? first : null;
    strike(tgt, this.ground((tgt ? tgt.pos : at).clone()), 0);
    if (tgt) {
      const seen = new Set([tgt]); let cur = tgt;
      for (let i = 1; i <= p.chains; i++) {
        let best = null, bd = p.chainRange;
        for (const e of this.combat.entities) { if (!isFoe(e) || seen.has(e)) continue; const d = dist(e.pos.x, e.pos.z, cur.pos.x, cur.pos.z); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        seen.add(best); const a = cur, b = best, ii = i;
        this.after(ii * 0.09, () => {
          if (!b.alive) return;
          fx.chainArc(_v.set(a.pos.x, a.pos.y + (a.height || 1) * 0.6, a.pos.z), _w.set(b.pos.x, b.pos.y + (b.height || 1) * 0.6, b.pos.z));
          if (power === 1) fx.pawPrint(this.ground(b.pos.clone()), 0.36, 0.9); sfx('zap', { pos: b.pos, vol: 0.5, pitch: 1 + ii * 0.06 }); // (the echo leaves no new prints)
          this.poeHit(b, { dmgPct: p.dmgPct * power * Math.pow(1 - p.falloff / 100, ii), element: 'zap', stun: p.stun, from: a.pos });
        });
        cur = best;
      }
    }
    // Thunderhead (a charged bolt's perk): a little storm cloud stays over the spot, zapping a foe beneath it
    if (o.storm && power === 1) {
      const c = this.ground((tgt ? tgt.pos : at).clone()); let zap = 0.3;
      this.poeZone({ life: o.storm.t, update: (dt, z) => {
        if (Math.random() < dt * 6) fx.pn.spawn({ frame: 0, x: c.x + rand(-0.7, 0.7), y: c.y + 3.2 + rand(-0.15, 0.15), z: c.z + rand(-0.7, 0.7), vx: rand(-0.2, 0.2), life: 0.7, size: 0.55, size1: 0.75, color: POE_COL.smokeDk, alpha: 0.55, alpha1: 0, fadeIn: 0.15 });
        zap -= dt; if (zap > 0) return;
        zap = 0.5;
        const e = this.foesNear(c.x, c.z, 2.4)[0];
        if (e) { fx.chainArc(_v.set(c.x, c.y + 3, c.z), _w.set(e.pos.x, e.pos.y + 0.5, e.pos.z)); sfx('zap', { pos: e.pos, vol: 0.4 }); this.poeHit(e, { dmgPct: p.dmgPct * o.storm.pct / 100, element: 'zap', from: c }); }
      } });
    }
    if (o.echo && power === 1) this.after(o.echo.delay || 0.45, () => this.poeThunder(R, tgt?.alive ? tgt : null, at, { ...o, echo: null, storm: null }, (o.echo.pct || 50) / 100));
  },

  // ================================================================== Smoke Dragon
  cast_smokeDragon(R, aim, target, o = {}) {
    const P = this.G.player, fx = this.pfx();
    this.poeBreakStealth(true);
    this.faceTo(aim);
    const dir = _v.set(aim.x - P.pos.x, 0, aim.z - P.pos.z); if (dir.lengthSq() < 0.01) dir.copy(this.forward()); dir.normalize();
    const d0 = dir.clone();
    P.anim.play('dragonSeal', { speed: this.castRate?.() || 1, onEvent: ev => {
      if (ev === 'seal' || ev === 'seal2') { fx.seal(_h.set(P.pos.x, P.pos.y + 1, P.pos.z).addScaledVector(this.forward(), 0.3), POE_COL.violet, 0.45); sfx('poe_seal', { pitch: ev === 'seal' ? 1 : 1.15 }); }
      else if (ev === 'release') { this.poeDragon(R, P.pos.clone(), d0, o, 1); if (o.twin) this.after(0.55, () => this.poeDragon(R, P.pos.clone().addScaledVector(d0, R.params.length), d0.clone().negate(), o, o.twin.pct / 100)); }
    } });
  },
  poeDragon(R, from, dir, o, power) {
    const G = this.G, p = R.params, fx = this.pfx(), h = fx.dragon(Math.min(1.5, p.width / 3.2) * (power < 1 ? 0.85 : 1));
    const side = new THREE.Vector3(-dir.z, 0, dir.x), hit = new Set(), pos = from.clone().addScaledVector(dir, 1.4);
    sfx('dragon_roar', { vol: power < 1 ? 0.6 : 1 }); G.engine.rig.shake(0.25);
    let s = 0, whoosh = 0;
    this.poeZone({ life: p.length / p.speed + 0.1, update: (dt) => {
      s += p.speed * dt; pos.copy(from).addScaledVector(dir, 1.4 + s); pos.y = G.world.heightAt(pos.x, pos.z);
      h.set(pos, dir, dt, p.width);
      whoosh -= dt; if (whoosh <= 0) { whoosh = 0.3; sfx('dragon_whoosh', { pos, vol: 0.5 }); }
      for (const e of this.combat.entities) {
        if (!(e.alive && e.team === 'enemy') || hit.has(e)) continue;
        const rx = e.pos.x - from.x, rz = e.pos.z - from.z, along = rx * dir.x + rz * dir.z, lat = rx * side.x + rz * side.z;
        if (along > 1.4 + s + 0.5 || along < 0 || Math.abs(lat) > p.width / 2 + (e.radius || 0.3)) continue;
        hit.add(e);
        const k = Math.sign(lat) || 1;
        this.poeHit(e, { dmgPct: p.dmgPct * power, element: 'stink', knock: 0, from: pos });
        if (e.alive && !e.breakable) { this.poeBlind(e, p.blind, 60); if (!e.def?.boss) e.knock?.addScaledVector(_t.copy(dir).multiplyScalar(0.6).addScaledVector(side, k * 0.8).normalize(), p.knockback * 7); }
      }
    }, end: () => { h.end(); fx.puff(pos, { r: 1.2, n: 10 }); } });
  },
};
