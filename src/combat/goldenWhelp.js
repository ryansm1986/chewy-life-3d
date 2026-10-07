// The Whelp Bond (docs/GOLDEN.md §3, §6): the dragoon's commands to Shadow the dragon whelp. SkillRunner casts
// (`cast_<id>(R, aim, target, o)`; o: a charged release's extras) and the per-frame state behind them, mixed in by
// goldenSkills.js installGoldenSkills. Foosy calls ("Shadow, breathe!": the 'whelpCall' pose) and Shadow does the work:
// this module decides where Shadow goes, how high, which way he faces and what he hits; actors/whelp.js flies him there
// (Whelp.act, the "puppet": { to, at, speed, lift, liftNow, rate, pitch, wings, face, walk, grounded }).
//  - Ember Breath: he flutters to Foosy's side (across the camera's view: never in front of him), breathes a cone of
//    embers in puffs, the foes smoulder;
//  - Divebomb Swoop: a climb as high as his wings allow, a tucked dive onto the spot, an ember splash (charged: loops);
//  - Wing Shield: an absorb on Foosy (combat.hitPlayer → goldenGuard → gldShieldSoak) while Shadow hovers before him
//    with his wings spread (rotated off the camera's line to him); a big flap's gust when it gives way;
//  - Mighty Little Roar: the pack's damage and attack speed buff (combat.buffs.roar), the foes round them flinch;
//  - Dragon Heart: Shadow grows huge (anim.grow), walks into the fight on the ground, sweeps ember breath, stomps, draws
//    the foes (Companion.tauntFor); he stays behind Foosy on screen where he can and fades where he'd cover him
//    (coversHero, as the Shih Tzu's Grandpaw).
// The Bond's actives wait while Shadow is knocked out (castBlocked → gldWhelpBlocked).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { clamp, dist, ease } from '../core/util.js';
import { WHELP_ACTIVES } from '../rpg/skillsGolden.js';
import { coversHero } from './shihtzuAllies.js';
import { GLD_COL } from '../gfx/goldenFx.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const BIG_BLOCKS = new Set(['divebombSwoop', 'wingShield', 'dragonHeart']);

const M = {
  /** can Shadow take the command? (the Bond's actives: castBlocked) */
  gldWhelpBlocked(id) {
    if (!WHELP_ACTIVES.has(id)) return false;
    const G = this.G, sh = G.companion, P = G.player;
    const why = !sh?.whelp ? "Shadow isn't here!" : sh.fainted > 0 ? 'Shadow is resting!' : this.gldBig && BIG_BLOCKS.has(id) ? 'Shadow is busy being a dragon!' : null;
    if (!why) return false;
    if (!this._gldWhyT || G.engine.time - this._gldWhyT > 1.2) { this._gldWhyT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), why, { kind: 'status', color: '#ffc8a0' }); Events.emit('sfx', 'ui_error'); }
    return true;
  },
  /** Foosy calls the command (the pose keeps his guard) */
  gldCall() {
    const G = this.G, P = G.player;
    P.anim.play('whelpCall', { speed: G.derived?.castMul || 1 });
    sfx('whelp_call');
  },
  /** start a move for Shadow (the one he was doing ends) */
  gldAct(a) {
    const sh = this.G.companion;
    this.gldW = a; a.t = 0; a.pup = { to: sh.pos.clone(), speed: 8, lift: 0.9, rate: 4, pitch: null, wings: 'beat', face: null };
    sh.whelp.act = a.pup; sh.whelp.landed = false;
    if (sh.anim.action?.name === 'sit') sh.anim.stop('sit');
  },
  gldEndAct() {
    this.gldW = null;
    const sh = this.G.companion;
    if (sh?.whelp && !this.gldBig) sh.whelp.act = null;
  },
  /** a spot `across` m beside the hero across the camera's view (Shadow's side of him), `fwd` m toward the angle `ang` */
  gldSideSpot(ang, across, fwd, out) {
    const G = this.G, P = G.player, sh = G.companion, yaw = G.engine?.rig?.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const s = (sh.pos.x - P.pos.x) * rx + (sh.pos.z - P.pos.z) * rz >= 0 ? 1 : -1;
    out.set(P.pos.x + rx * s * across + Math.sin(ang) * fwd, P.pos.y, P.pos.z + rz * s * across + Math.cos(ang) * fwd);
    const W = G.world; if (W.walkable?.(out.x, out.z) === false || W.collision?.solidAt?.(out.x, out.z, 0.25)) out.set(P.pos.x - rx * s * across + Math.sin(ang) * fwd, P.pos.y, P.pos.z - rz * s * across + Math.cos(ang) * fwd);
    return out;
  },
  /** where Shadow breathes from: a step out from Foosy toward the foes and a little to one side (the side that puts him
   *  most beside Foosy on screen, not behind or in front of him), so the cone runs away from him */
  gldBreathSpot(to, out) {
    const G = this.G, P = G.player, W = G.world, yaw = G.engine?.rig?.yaw ?? 0, cx = Math.sin(yaw), cz = Math.cos(yaw);
    let dx = to.x - P.pos.x, dz = to.z - P.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const px = dz, pz = -dx, fwd = Math.min(0.9, d * 0.4);
    let best = null, bs = 1e9;
    for (const s of [1, -1]) {
      const x = P.pos.x + dx * fwd + px * s * 0.6, z = P.pos.z + dz * fwd + pz * s * 0.6;
      if (W.walkable?.(x, z) === false || W.collision?.solidAt?.(x, z, 0.2)) continue;
      const toCam = (x - P.pos.x) * cx + (z - P.pos.z) * cz, side = Math.abs((x - P.pos.x) * cz - (z - P.pos.z) * cx); // (toward the camera from him; beside him across the view)
      const sc = toCam - 1.5 * side; // (the spot most beside him on screen, the further one from the camera on a tie)
      if (sc < bs) { bs = sc; best = s; }
    }
    const s = best ?? 1;
    return out.set(P.pos.x + dx * fwd + px * s * 0.6, P.pos.y, P.pos.z + dz * fwd + pz * s * 0.6);
  },
  /** the head of Shadow (where the breath and the roar come from) */
  gldHead(sh, out) {
    const g = sh.anim?.grow || 1, lift = sh.whelp?.lift || 0;
    return out.set(sh.pos.x + Math.sin(sh.facing) * 0.28 * g, sh.pos.y + lift + 0.42 * g, sh.pos.z + Math.cos(sh.facing) * 0.28 * g);
  },

  // ================================================================== Ember Breath
  cast_emberBreath(R, aim, target, o = {}) {
    const p = R.params, to = (target?.alive && !target.breakable ? target.pos : aim).clone();
    this.gldCall();
    if (this.gldBig) { this.gldBigSweep(p); return; } // (a dragon-sized Shadow breathes his sweep at once)
    const W = this.gldW, sh = this.G.companion;
    if (W?.kind === 'breath' && W.phase === 'breath') { // (still breathing: the call adds its puffs to his, at the new foe)
      W.to.copy(to); W.p = p; W.o = o; W.total = W.puffs + p.ticks;
      const a = sh.anim.action; if (a?.name === 'whelpBreath') a.t = Math.min(a.t, a.dur * 0.5); // (keeps puffing: back to the middle of the exhale)
      return;
    }
    this.gldAct({ kind: 'breath', p, o, to, phase: 'go', puffs: 0, total: p.ticks, spot: new THREE.Vector3() });
  },
  gldBreathStep(W, dt, sh) {
    const P = this.G.player, p = W.p, U = W.pup;
    if (W.phase === 'go') {
      this.gldBreathSpot(W.to, W.spot);
      U.to.copy(W.spot); U.speed = 10; U.lift = 0.75; U.rate = 5; U.wings = 'beat'; U.face = Math.atan2(W.to.x - sh.pos.x, W.to.z - sh.pos.z); U.pitch = null;
      if (dist(sh.pos.x, sh.pos.z, W.spot.x, W.spot.z) < 0.35 || W.t > 0.42) {
        W.phase = 'breath'; W.t0 = W.t;
        const dur = 0.34 + W.total * 0.17 + 0.25;
        sh.anim.play('whelpBreath', { force: true, speed: 0.95 / dur }); sfx('whelp_inhale', { pos: sh.pos });
      }
      return;
    }
    U.face = Math.atan2(W.to.x - sh.pos.x, W.to.z - sh.pos.z); U.to.copy(sh.pos);
    const tb = W.t - W.t0;
    while (W.puffs < W.total && tb >= 0.34 + W.puffs * 0.17) this.gldPuff(W, sh, W.puffs++);
    if (tb > 0.34 + W.total * 0.17 + 0.2) this.gldEndAct();
  },
  gldPuff(W, sh, i) {
    const p = W.p, fx = this.gldFx(), head = this.gldHead(sh, _h), ang = Math.atan2(W.to.x - sh.pos.x, W.to.z - sh.pos.z);
    fx.breath(head, ang, p.range, p.arc, { n: 18 + Math.round(p.arc / 10), edge: W.o.edge ? 0.6 : 0, size: 0.75, life: 0.5 });
    this.G.vfx.glow.spawn({ x: head.x, y: head.y, z: head.z, life: 0.18, size: 0.45, size1: 0.7, color: '#ffb060', alpha: 0.4, alpha1: 0 }); // (the puff at his mouth)
    sfx('whelp_breath', { pos: sh.pos, pitch: 1 + i * 0.04 });
    if (i === 0) this.G.vfx.light(head, '#ff9a50', 1.6, 4, 0.25);
    this.arcHit(sh.pos, ang, p.range, p.arc, e => {
      if (!isFoe(e)) return;
      const dmg = this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'fire', knock: 0.12, from: sh.pos });
      this.gldBurn(e, dmg, p.dmgPct, p.burnPct, p.burnDur);
    });
  },

  // ================================================================== Divebomb Swoop
  cast_divebombSwoop(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    this.gldCall();
    const foe = target?.alive && !target.breakable ? target : null, to = this.clampAim(foe ? foe.pos : aim, p.range);
    if (!foe) for (let i = 0; i < 12 && (G.world.walkable?.(to.x, to.z) === false || G.world.collision?.solidAt?.(to.x, to.z, 0.2)); i++) to.lerp(P.pos, 0.25); // (open floor: he comes back up from it)
    this.gldAct({ kind: 'swoop', p, o, to, foe, phase: 'climb', loop: 0, mul: 1, from: new THREE.Vector3(), at: new THREE.Vector3() });
  },
  gldSwoopStep(W, dt, sh) {
    const U = W.pup, wl = sh.whelp;
    if (W.phase === 'climb') { // up as high as his wings allow, short of the spot on his side of it
      if (W.foe?.alive) W.to.set(W.foe.pos.x, W.foe.pos.y, W.foe.pos.z);
      const d = Math.hypot(W.to.x - sh.pos.x, W.to.z - sh.pos.z) || 1, back = Math.min(1.6, d * 0.5);
      _v.set(W.to.x - (W.to.x - sh.pos.x) / d * back, 0, W.to.z - (W.to.z - sh.pos.z) / d * back);
      U.to.copy(_v); U.at = null; U.speed = 11; U.lift = 3.0; U.liftNow = null; U.rate = 9; U.pitch = -0.4; U.wings = 'beat'; U.face = Math.atan2(W.to.x - sh.pos.x, W.to.z - sh.pos.z);
      if (W.t > 0.42 || (wl.lift > 2.6 && Math.hypot(_v.x - sh.pos.x, _v.z - sh.pos.z) < 0.4)) { W.phase = 'dive'; W.t0 = W.t; W.from.copy(sh.pos); W.lift0 = wl.lift; sfx('whelp_swoop', { pos: sh.pos }); }
      return;
    }
    if (W.phase === 'dive') { // wings tucked, nose down, straight onto it
      const T = 0.26, k = clamp((W.t - W.t0) / T), e2 = k * k;
      W.at.set(W.from.x + (W.to.x - W.from.x) * e2, 0, W.from.z + (W.to.z - W.from.z) * e2);
      U.at = W.at; U.liftNow = W.lift0 * (1 - e2) + 0.2 * e2; U.pitch = 1.0; U.wings = 'tuck'; U.face = Math.atan2(W.to.x - W.from.x, W.to.z - W.from.z);
      if (Math.random() < 0.6) this.gldFx().embers(_v.set(sh.pos.x, sh.pos.y + wl.lift + 0.3, sh.pos.z), 1, { r: 0.1, up: 0.5, size: 0.2, life: 0.3 });
      if (k >= 1) this.gldSwoopHit(W, sh);
      return;
    }
    // pop back up, then (charged) loop round for another, or home
    U.at = null; U.liftNow = null; U.lift = 1.0; U.rate = 6; U.pitch = -0.25; U.wings = 'beat'; U.to.copy(sh.pos);
    if (W.t - W.t0 > 0.3) {
      if (W.loop < (W.o.loops || 0)) { W.loop++; W.mul = W.o.loopPct / 100; W.phase = 'climb'; W.t = 0; if (!W.foe?.alive) { const f = this.gldNearFoe(W.to, 4); if (f) { W.foe = f; } } }
      else this.gldEndAct();
    }
  },
  gldSwoopHit(W, sh) {
    const G = this.G, p = W.p, fx = this.gldFx(), at = _w.set(W.to.x, G.world.heightAt?.(W.to.x, W.to.z) ?? W.to.y, W.to.z).clone();
    W.phase = 'pop'; W.t0 = W.t;
    fx.emberBurst(at, p.radius); fx.dust(at, 4); sfx('whelp_thump', { pos: at }); G.engine.rig.shake(0.14);
    const dmgPct = p.dmgPct * W.mul;
    this.nova(at, p.radius, e => { const dmg = this.combat.hitMonster(e, { dmgPct, element: 'fire', knock: p.knockback, from: at }); this.gldBurn(e, dmg, dmgPct, p.burnPct, p.burnDur); });
    const sc = W.o.scorch; // (Scorched Earth)
    if (sc) this.gldSmoulder(at, p.radius * 0.8, sc.pct, sc.t);
  },
  gldNearFoe(at, r) { let best = null, bd = r; for (const e of this.combat.entities) { if (!isFoe(e)) continue; const d = dist(e.pos.x, e.pos.z, at.x, at.z); if (d < bd) { bd = d; best = e; } } return best; },

  // ================================================================== Wing Shield
  cast_wingShield(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.gldFx();
    this.gldCall();
    this.gldShield?.ring?.end();
    const max = (G.derived?.lifeMax || 100) * p.absorbPct / 100;
    this.gldShield = { p, o, left: max, max, t: p.duration, ring: fx.ring(P.pos, 1.05, { life: 0, follow: P, color: GLD_COL.emerald, alpha: 0.32, pulse: 0.1 }), floatT: 0 };
    sfx('whelp_shield', { pos: P.pos });
    if (this.gldW && this.gldW.kind !== 'shield') this.gldEndAct();
    this.gldAct({ kind: 'shield', phase: 'hold' });
  },
  /** the shield takes a blow on the felt → what gets through */
  gldShieldSoak(dmg, src = null) {
    const S = this.gldShield; if (!S || !(dmg > 0)) return dmg;
    const G = this.G, sh = G.companion, s = Math.min(S.left, dmg);
    S.left -= s; dmg -= s;
    const sg = S.o.singe; // (Ember Felt: the foe that struck it is singed)
    if (sg && src?.alive && src.team === 'enemy') { this.combat.hitMonster(src, { dmgPct: sg.pct, element: 'fire', knock: 0.2, from: G.player.pos }); this.gldFx().embers(src.pos, 3, { r: 0.2, up: 1, size: 0.2 }); }
    if (sh?.whelp) { sh.whelp.kick = 1; this.gldFx().embers(this.gldHead(sh, _h), 2, { r: 0.2, up: 0.6, size: 0.18 }); G.vfx.sparks(_h, { n: 5, color: '#fff2dc', speed: 3, size: 0.22 }); }
    if (G.engine.time - S.floatT > 0.4) { S.floatT = G.engine.time; G.ui?.float?.(G.player.pos.clone().setY(G.player.pos.y + 1.5), 'Fwump!', { kind: 'status', color: '#ffe6c8' }); sfx('whelp_flap', { vol: 1, pitch: 1.2 }); }
    if (S.left <= 0.5) this.gldShieldEnd(true);
    return dmg;
  },
  gldShieldStep(W, dt, sh) {
    const G = this.G, P = G.player, U = W.pup;
    if (!this.gldShield) { this.gldEndAct(); return; }
    // before him, toward the nearest foe (else his facing), turned off the camera's line to him so he never covers him
    const f0 = this.gldNearFoe(P.pos, 8), yaw = G.engine?.rig?.yaw ?? 0, cx = Math.sin(yaw), cz = Math.cos(yaw); // (cx, cz: from him toward the camera, on the ground)
    let a = f0 ? Math.atan2(f0.pos.x - P.pos.x, f0.pos.z - P.pos.z) : P.facing;
    const toCam = Math.sin(a) * cx + Math.cos(a) * cz;
    if (toCam > 0.35) { const side = Math.sin(a) * cz - Math.cos(a) * cx >= 0 ? 1 : -1, camA = Math.atan2(cx, cz); a = camA + side * Math.acos(0.35); }
    U.to.set(P.pos.x + Math.sin(a) * 1.05, 0, P.pos.z + Math.cos(a) * 1.05); U.at = null; U.liftNow = null;
    U.speed = 9; U.lift = 0.6; U.rate = 4; U.pitch = -0.32; U.wings = 'spread'; U.face = a;
  },
  updateGldShield(dt) {
    const S = this.gldShield; if (!S) return;
    const G = this.G;
    S.t -= dt;
    if (S.o.regen) G.actions.heal?.((G.derived?.lifeMax || 0) * S.o.regen / 100 * dt);
    if (S.t <= 0) this.gldShieldEnd(true);
  },
  gldShieldEnd(gust) {
    const S = this.gldShield; if (!S) return;
    this.gldShield = null; S.ring?.end();
    const G = this.G, P = G.player, sh = G.companion, p = S.p;
    if (this.gldW?.kind === 'shield') this.gldEndAct();
    if (!gust || !sh || sh.fainted > 0) return;
    if (sh.whelp) sh.whelp.burst = 1;
    this.gldFx().gust(P.pos, p.gustRadius); sfx('whelp_gust', { pos: P.pos }); G.engine.rig.shake(0.15);
    this.nova(P.pos, p.gustRadius, e => this.combat.hitMonster(e, { dmgPct: p.gustPct, knock: p.knockback, from: P.pos }));
  },

  // ================================================================== Mighty Little Roar
  cast_mightyRoar(R, aim, target, o = {}) {
    const p = R.params;
    this.gldCall();
    if (this.gldBig) { this.gldRoarNow(p, o); return; }
    this.gldAct({ kind: 'roar', p, o, phase: 'go', spot: new THREE.Vector3() });
  },
  gldRoarStep(W, dt, sh) {
    const P = this.G.player, U = W.pup;
    if (W.phase === 'go') {
      this.gldSideSpot(P.facing, 0.95, 0, W.spot);
      U.to.copy(W.spot); U.speed = 10; U.lift = 0.9; U.rate = 5; U.wings = 'beat'; U.face = P.facing; U.pitch = null;
      if (dist(sh.pos.x, sh.pos.z, W.spot.x, W.spot.z) < 0.35 || W.t > 0.38) {
        W.phase = 'roar'; W.t0 = W.t;
        sh.anim.play('whelpRoar', { force: true, onEvent: ev => { if (ev === 'roar' && this.gldW === W) this.gldRoarNow(W.p, W.o); } });
      }
      return;
    }
    U.to.copy(sh.pos); U.pitch = -0.35; U.wings = W.t - W.t0 > 0.4 && W.t - W.t0 < 0.8 ? 'spread' : 'beat';
    if (W.t - W.t0 > 1.05) this.gldEndAct();
  },
  gldRoarNow(p, o) {
    const G = this.G, P = G.player, sh = G.companion;
    G.combat.buffs.roar = { t: p.duration, dmg: p.dmgBuff, aspd: p.aspd, move: o.pep || 0 };
    const head = this.gldHead(sh, _h);
    this.gldFx().roar(head, p.radius); sfx('whelp_roar', { pos: sh.pos, pitch: this.gldBig ? 0.6 : 1 });
    G.vfx.sparkle(_v.set(P.pos.x, P.pos.y + 0.8, P.pos.z), { n: 8, color: '#ffd8a0', r: 0.45, size: 0.24 });
    const fear = o.fear;
    this.nova(P.pos, p.radius, e => { if (!isFoe(e)) return; if (fear) e.applyStatus?.('fear', fear); else e.applyStatus?.('stun', p.flinch); });
  },

  // ================================================================== Dragon Heart
  cast_dragonHeart(R, aim, target, o = {}) {
    const G = this.G, sh = G.companion, p = R.params, fx = this.gldFx();
    this.gldCall();
    this.gldEndAct();
    this.gldShrink = null;
    const B = this.gldBig = { p, o, t: 0, dur: p.duration, scale: p.scale * (o.size || 1), sweepT: 0.9, stompT: 1.8, see: 1, pup: { to: sh.pos.clone(), speed: 1.15, walk: true, grounded: true, wings: 'fold', face: null, lift: 0 } };
    sh.lifeMax = Math.round(sh.lifeMax * (1 + p.heartLife / 100)); sh.life = sh.lifeMax;
    sh.whelp.act = B.pup; sh.whelp.landed = false;
    _v.set(sh.pos.x, sh.pos.y + 0.5, sh.pos.z);
    G.vfx.poof(_v, { color: '#ffe8d0', n: 18, size: 0.8 }); fx.embers(_v, 14, { r: 0.6, up: 2.2, size: 0.3, life: 0.8 }); fx.leaves(_v, 8, { speed: 2.5 });
    sfx('dragon_grow', { pos: sh.pos }); G.engine.rig.shake(0.3);
  },
  /** the big Shadow's ember sweep (every p.every s; Ember Breath cast while he's big breathes one at once) */
  gldBigSweep(pb = null) {
    const B = this.gldBig, G = this.G, sh = G.companion; if (!B || !sh) return;
    const p = B.p, g = sh.anim.grow || 1, fx = this.gldFx();
    const c = _w.set(sh.pos.x + Math.sin(sh.facing) * 1.0 * g / 2.4, sh.pos.y, sh.pos.z + Math.cos(sh.facing) * 1.0 * g / 2.4).clone();
    sh.anim.play('whelpBreath', { force: true, speed: 1.7 });
    const head = this.gldHead(sh, _h);
    fx.breath(head, sh.facing, Math.min(p.radius + 0.6, 3.6), 150, { n: 24, edge: 0.55, size: 0.42, life: 0.45 }); // (edge-weighted: the rims of the sweep, the middle readable)
    sfx('whelp_breath', { pos: sh.pos, pitch: 0.65, vol: 1 });
    const d = pb ? pb.dmgPct : p.dmgPct, bp = pb ? pb.burnPct : p.burnPct, bd = pb ? pb.burnDur : p.burnDur;
    this.nova(c, p.radius, e => { if (!isFoe(e)) return; const dmg = this.combat.hitMonster(e, { dmgPct: d, element: 'fire', knock: 0.3, from: sh.pos }); this.gldBurn(e, dmg, d, bp, bd); });
  },
  updateGldBig(dt) {
    const B = this.gldBig, G = this.G, sh = G.companion;
    if (this.gldShrink) { const S = this.gldShrink; S.t += dt; const k = clamp(S.t / 0.4); if (sh?.anim) sh.anim.grow = S.from + (1 - S.from) * ease.inOutQuad(k); if (k >= 1) { this.gldShrink = null; if (sh?.anim) sh.anim.grow = 1; } }
    if (!B) return;
    if (!sh?.whelp || sh.fainted > 0) { this.gldBigEnd(true); return; }
    B.t += dt;
    const g = 1 + (B.scale - 1) * ease.outBack(clamp(B.t / 0.5));
    sh.anim.grow = g; sh.height = 0.6 * g;
    // into the fight on foot: beside the nearest foe near the hero, on the far side of it from the camera (so he stays
    // behind Foosy on screen), else a step behind Foosy
    const P = G.player, foe = this.gldNearFoe(P.pos, 7), yaw = G.engine?.rig?.yaw ?? 0, ax = -Math.sin(yaw), az = -Math.cos(yaw); // (away from the camera)
    if (foe) { B.pup.to.set(foe.pos.x + ax * (foe.radius || 0.4) * 1.2 + ax * 0.9, 0, foe.pos.z + az * (foe.radius || 0.4) * 1.2 + az * 0.9); B.pup.face = Math.atan2(foe.pos.x - sh.pos.x, foe.pos.z - sh.pos.z); }
    else { B.pup.to.set(P.pos.x + ax * 2.2 + Math.cos(yaw) * 0.8, 0, P.pos.z + az * 2.2 - Math.sin(yaw) * 0.8); B.pup.face = null; }
    if ((B.sweepT -= dt) <= 0) { B.sweepT = B.p.every; if (foe && dist(foe.pos.x, foe.pos.z, sh.pos.x, sh.pos.z) < B.p.radius + 1.2) { sh.faceTarget = sh.facing = Math.atan2(foe.pos.x - sh.pos.x, foe.pos.z - sh.pos.z); this.gldBigSweep(); } else B.sweepT = 0.25; }
    if ((B.stompT -= dt) <= 0 && !sh.anim.action) { B.stompT = 2.4; sh.anim.play('whelpStomp', { onEvent: ev => { if (ev === 'stomp' && this.gldBig) { G.vfx.dustRing(sh.pos, 1.4, 12); G.engine.rig.shake(0.1); sfx('dragon_stomp', { pos: sh.pos }); } } }); }
    // never hiding Foosy: fade where he'd cover him
    B.see += ((1 - 0.65 * coversHero(G, sh.pos, 0.3 * g, 0.75 * g)) - B.see) * Math.min(1, dt * 10);
    if (B.o.hearth) { G.actions.heal?.((G.derived?.lifeMax || 0) * B.o.hearth / 100 * dt); sh.heal?.(sh.lifeMax * B.o.hearth / 100 * dt); } // (Hearth Heart)
    this.gldFade(sh, B.see);
    if (B.t >= B.dur) this.gldBigEnd(false);
  },
  /** fade the big Shadow (his toon and his wings) to `see` */
  gldFade(sh, see) {
    const on = see < 0.98, mats = [sh.rig?.mat, sh.rig?.parts?.wings?.L?.children?.[0]?.material];
    for (const m of mats) { if (!m) continue; if (m.transparent !== on) { m.transparent = on; m.needsUpdate = true; } m.opacity = on ? see : 1; m.depthWrite = !on; }
  },
  gldBigEnd(fainted) {
    const B = this.gldBig; if (!B) return;
    this.gldBig = null;
    const G = this.G, sh = G.companion, fx = this.gldFx();
    if (!sh) return;
    this.gldFade(sh, 1); sh.height = 0.6;
    this.gldShrink = { t: 0, from: sh.anim?.grow || 1 };
    if (sh.whelp) sh.whelp.act = null;
    sh.recalc?.(); // (his life back to his own, the same share of it)
    _v.set(sh.pos.x, sh.pos.y + 0.5, sh.pos.z);
    G.vfx.poof(_v, { color: '#fff0e0', n: 14, size: 0.7 }); fx.embers(_v, 8, { r: 0.4, up: 1.6 });
    sfx('dragon_shrink', { pos: sh.pos });
    if (fainted) return;
    G.vfx.emote?.(sh, 'zzz', 1.6); // (and now he'd like a nap)
    const dj = B.o.dragonJump, P = G.player; // (Dragon's Jump: the two of them come down on the nearest foe together)
    if (dj && P && !P.anim.busy() && !P.leap && !P.dash) {
      const foe = this.gldNearFoe(P.pos, 7);
      if (foe) this.gldJumpStart({ dmgPct: dj.pct, radius: dj.r, stun: 0.8, knockback: 1.4, leap: 7, element: 'fire' }, foe.pos, { big: true, onLand: at => { fx.emberBurst(at, dj.r); } });
    }
  },

  // ================================================================== per frame / clear
  updateGoldenWhelp(dt) {
    const G = this.G, sh = G.companion;
    this.updateGldShield(dt); this.updateGldBig(dt);
    const rb = G.combat?.buffs?.roar; // (the roar's courage: a few motes rising off the pack)
    if (rb?.t > 0 && (this._roarT = (this._roarT || 0) + dt) > 0.3) { this._roarT = 0; const P = G.player; if (P) this.gldFx().embers(_v.set(P.pos.x, P.pos.y + 0.4, P.pos.z), 1, { r: 0.35, up: 1.2, size: 0.2 }); }
    const W = this.gldW;
    if (!W) { if (this.gldShield && sh?.whelp && !this.gldBig && sh.fainted <= 0) this.gldAct({ kind: 'shield', phase: 'hold' }); return; }
    if (!sh?.whelp || sh.fainted > 0) { this.gldEndAct(); return; }
    W.t += dt;
    if (W.kind === 'breath') this.gldBreathStep(W, dt, sh);
    else if (W.kind === 'swoop') this.gldSwoopStep(W, dt, sh);
    else if (W.kind === 'shield') this.gldShieldStep(W, dt, sh);
    else if (W.kind === 'roar') this.gldRoarStep(W, dt, sh);
  },
  clearGoldenWhelp() {
    this.gldShield?.ring?.end(); this.gldShield = null;
    const sh = this.G.companion;
    if (this.gldBig && sh) { this.gldFade(sh, 1); sh.height = 0.6; sh.recalc?.(); }
    this.gldBig = null; this.gldShrink = null; this.gldW = null;
    if (sh?.anim) sh.anim.grow = 1;
    if (sh?.whelp) sh.whelp.act = null;
  },
};

export function installGoldenWhelp(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
