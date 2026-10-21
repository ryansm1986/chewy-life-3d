// Stella the Sun Oracle's skills (docs/STELLA.md §2–§5): SkillRunner cast implementations (`cast_<id>(R, aim, target, o)`)
// plus the per-frame state they need. installStellaSkills(proto) mixes these into SkillRunner; skillRunner.js routes the
// parasol's basic attack here (cast_parasolSweep) and calls updateStella(dt) / clearStella().
//
//  - stlHit(e, o): every hit of hers. Her damage is the game's fire (resistances, fire gear, fire-enchanted foes as for
//    Chewy's Blazing Ball), drawn as sunlight: its number floats in sun gold and its hit spark is gold, never a flame
//    (combat.hitMonster `look: 'sun'`). It folds in the two marks:
//      · Sunlit (Radiance): her rays gild foes (up to 3 stacks, 6 s: a pip a stack over the foe). With the Sunlit passive
//        each stack makes the foe take more of her (and her little sun's) fire, and a full gilding flares on her next fire
//        hit (once a foe every 2 s);
//      · Sunburn (Corona): a skill's own sunburn (burnPct, % of weapon damage a second) and, with the Sunburn passive, a
//        share of every hit as a burn; sunburnt foes take more from the Corona. A sunburn is the game's fire damage over
//        time (monster status 'burn', flagged `sun`: it ticks as a golden shimmer and gold numbers: combat.js).
//  - The Sunsweep (the basic attack, cast_parasolSweep): two sweeps of the open wagasa throwing crescents of sunlight on a
//    90° arc, then a twirl's ring of light round her; a pause over 1.3 s starts it over; the reach assist lunges or walks
//    her up as for the others' melee.
//  - Radiance: Golden Ray (a line through every foe), Glint (a cone that dazzles), Prism (a fan of rays), Solar Ray (a
//    channel that ramps), Sundial (twelve columns round her). The Corona and the Dawn: stellaArts.js; Hinata and the pack:
//    stellaAllies.js; the charged releases: chargedStella.js.
//  - stellaGuard(dmg, src): a blow on her (combat.hitPlayer): the Zoomies' dodge, her halo and sun shell soak it, Hope
//    Springs catches a fall. stlGuardAlly(e, dmg): the same for Shadow and the little suns.
// Looks: gfx/stellaFx.js; poses: actors/stellaPoses.js; the wagasa: actors/stellaGear.js; sounds: audio/stella.sfx.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, angleDiff } from '../core/util.js';
import { stlFx } from '../gfx/stellaFx.js';
import { finialWorld } from '../actors/stellaGear.js';
import { installStellaArts } from './stellaArts.js';
import { installChargedStella } from './chargedStella.js';
import { steerPoint } from './autoTarget.js';
import { Input } from '../core/input.js';
import { perkAt } from '../rpg/charge.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _h = new THREE.Vector3(), _f = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const SWEEPS = ['parasolSweep1', 'parasolSweep2', 'parasolTwirl'];
const SWEEP_DUR = [0.42, 0.42, 0.5]; // (the actions' own durations: each move takes one attack at her attack speed; the twirl a touch longer)
const MELEE_SET = new Set(SWEEPS);
const LUNGE_SPEED = 9;
const GILD_MAX = 3, GILD_T = 6;
/** Radiance's rays (they gild) */
export const STL_RAY_IDS = new Set(['goldenRay', 'glint', 'prism', 'solarRay', 'sundial']);

const M = {
  stlFx() { return stlFx(this.G); },
  /** where her light leaves the wagasa: the finial's sun disc (the wagasa in her paw), else above her right shoulder */
  stlFinial(out = _f) {
    const P = this.G.player, R = P?.parasol;
    if (R && R.holder.parent && R.how && R.how !== 'carry') { finialWorld(R, out); if (out.distanceToSquared(P.pos) < 9) { out.y = Math.max(out.y, P.pos.y + 0.6); return out; } }
    return out.set(P.pos.x + Math.sin(P.facing) * 0.3, P.pos.y + 1.25, P.pos.z + Math.cos(P.facing) * 0.3);
  },
  /** her light's origin at chest height, out along her facing (the rays run level from here) */
  stlFrom(out = _f) { const P = this.G.player; this.stlFinial(out); out.y = Math.min(out.y, P.pos.y + 1.0); out.y = Math.max(out.y, P.pos.y + 0.7); return out; },

  // ================================================================== the hit, the marks
  /** the gilding on a foe now (expired stacks dropped) */
  stlGildOf(e) { const now = this.G.engine.time || 0; if (!e._stlG) return 0; if (now > (e._stlGT || 0)) { e._stlG = 0; return 0; } return e._stlG; },
  stlAddGild(e, n = 1) {
    if (!e.alive || !n) return;
    const now = this.G.engine.time || 0, before = this.stlGildOf(e);
    e._stlG = Math.min(GILD_MAX, before + n); e._stlGT = now + GILD_T;
    (this.stlGilded ||= new Set()).add(e);
    if (e._stlG > before && e._stlG >= GILD_MAX) sfx('stl_gild', { pos: e.pos, vol: 0.5 });
  },
  /** a sunburn (the game's fire burn, drawn gold): the stronger of what's there and this */
  stlBurn(e, dps, dur) {
    if (!e.alive || !(dps > 0) || !(dur > 0) || e.breakable) return;
    const s = e.status ||= {}, b = s.burn;
    if (b?.t > 0 && b.dps * b.t >= dps * dur) { b.sun = b.sun || !!b.sunMine; return; }
    e.applyStatus?.('burn', dur, dps);
    if (s.burn) { s.burn.sun = true; s.burn.sunMine = true; }
  },
  /** every hit of hers. o: { dmgPct, tree ('ray' | 'flare' | 'dawn'), knock, stun, from, gild (stacks added), burnPct /
   *  burnDur (the skill's own sunburn: % of weapon damage a second), source, silent, noFlare, mult } → the damage */
  stlHit(e, o = {}) {
    if (!e || !e.alive) return 0;
    const G = this.G, D = G.derived, now = G.engine.time || 0;
    let m = o.mult || 1;
    const g = e.breakable ? 0 : this.stlGildOf(e);
    if (D.sunlit && g) m *= 1 + g * D.sunlit.per / 100;
    if (o.tree === 'flare' && D.sunburn && e.status?.burn?.t > 0) m *= 1 + D.sunburn.take / 100;
    if ((e._stlMirrorT || 0) > now) m *= 1 + (e._stlMirror || 0) / 100; // (Mirror Flash)
    const dmg = this.combat.hitMonster(e, { dmgPct: o.dmgPct ?? 100, element: 'fire', look: 'sun', knock: o.knock || 0, stun: o.stun || 0, from: o.from || G.player.pos, source: o.source || 'player', mult: m, silent: !!o.silent });
    if (!dmg || e.breakable) return dmg;
    // the sunburn: the skill's own, or the Sunburn passive's share of the hit (the stronger)
    let dps = o.burnPct > 0 ? dmg * o.burnPct / Math.max(1, o.dmgPct ?? 100) : 0, dur = o.burnDur || 0;
    if (D.sunburn) { const pd = dmg * D.sunburn.pct / 100 / D.sunburn.dur; if (pd * D.sunburn.dur > dps * dur) { dps = pd; dur = D.sunburn.dur; } }
    if (dps > 0 && e.alive) this.stlBurn(e, dps, dur);
    // a full gilding flares on her next fire hit (Sunlit; once a foe every 2 s)
    if (!o.noFlare && D.sunlit && g >= D.sunlit.stacks && now - (e._stlFlareT ?? -9) >= D.sunlit.every) {
      e._stlFlareT = now; e._stlG = 0;
      const at = _h.set(e.pos.x, G.world.heightAt?.(e.pos.x, e.pos.z) ?? e.pos.y, e.pos.z).clone();
      this.stlFx().gildFlare(at, D.sunlit.flareR);
      sfx('stl_flare', { pos: at, pitch: 1.3, vol: 0.55 });
      this.combat.inRadius(at.x, at.z, D.sunlit.flareR, 'ally', x => { if (isFoe(x)) this.stlHit(x, { dmgPct: D.sunlit.flarePct, tree: 'ray', from: at, noFlare: true }); });
    }
    if (o.gild && e.alive) this.stlAddGild(e, o.gild);
    return dmg;
  },
  /** every foe in a line from origin along facing, len long and half wide either side (their bodies count) */
  stlLine(origin, facing, len, half, fn) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    this.combat.inRadius(origin.x + fx * len * 0.5, origin.z + fz * len * 0.5, len * 0.5 + half + 0.5, 'ally', e => {
      if (!isFoe(e) && !e.breakable) return;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx), r = e.bodyR || e.radius || 0.3;
      if (along < -0.4 || along > len + r || side > half + r) return;
      fn(e, along);
    });
  },
  /** every foe in a cone from origin: half-angle half (rad), range */
  stlCone(origin, facing, half, range, fn) {
    this.combat.inRadius(origin.x, origin.z, range, 'ally', (e, d) => {
      if (!isFoe(e) && !e.breakable) return;
      const a = Math.atan2(e.pos.x - origin.x, e.pos.z - origin.z), r = e.bodyR || e.radius || 0.3;
      if (d < 0.8 || Math.abs(angleDiff(facing, a)) <= half + Math.atan2(r, Math.max(0.5, d))) fn(e, d);
    });
  },
  /** where a ray aimed at `aim` (or the clicked foe) points, from her → the yaw */
  stlAimYaw(aim, target) {
    const P = this.G.player, to = target?.alive && !target.breakable ? target.pos : aim;
    const dx = to.x - P.pos.x, dz = to.z - P.pos.z;
    return Math.hypot(dx, dz) > 0.2 ? Math.atan2(dx, dz) : P.facing;
  },
  stlFace(yaw) { const P = this.G.player; P.faceTarget = P.facing = yaw; },

  // ================================================================== the Sunsweep: sweep, sweep, twirl
  cast_parasolSweep(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    const now = G.engine.time || 0;
    if (now - (this.stlComboT ?? -9) > 1.3) this.stlCombo = 0;
    const k = (this.stlCombo || 0) % 3; this.stlCombo = (this.stlCombo || 0) + 1; this.stlComboT = now;
    const m = this.melee; this.melee = null; // (her own lunge below: skillRunner's tracks only Chewy's cuts)
    this.stlMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    const twirl = k === 2, act = SWEEPS[k];
    P.anim.play(act, { speed: this.attacksPerSec() * SWEEP_DUR[k] * (twirl ? 0.9 : 1), onEvent: ev => {
      if (ev !== 'hit') return;
      this.stlSnapIn(target, twirl ? p.ringRadius : p.radius);
      const f = P.facing, fx = this.stlFx();
      let hit = 0;
      if (twirl) {
        fx.twirl(P.pos, { r: p.ringRadius });
        sfx('stl_twirl');
        this.combat.inRadius(P.pos.x, P.pos.z, p.ringRadius, 'ally', e => { if (!isFoe(e) && !e.breakable) return; this.stlHit(e, { dmgPct: p.dmgPct * p.ringMul, tree: 'ray', knock: 0.6, from: P.pos }); hit++; });
      } else {
        fx.sweep(P.pos, f, { arc: p.arc * Math.PI / 180, r: p.radius, rev: k === 1, y: 0.6 });
        sfx('stl_sweep', { pitch: 1 + k * 0.08 });
        this.arcHit(P.pos, f, p.radius, p.arc, e => { if (!isFoe(e) && !e.breakable) return; this.stlHit(e, { dmgPct: p.dmgPct, tree: 'ray', knock: p.knockback, from: P.pos }); hit++; }, target);
      }
      if (hit) G.engine.rig.shake(twirl ? 0.12 : 0.07);
      this.stlMelee = null;
    } });
  },
  stlSnapIn(target, radius) {
    const m = this.stlMelee, G = this.G, P = G.player;
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
  stlTrackMelee(dt) {
    const m = this.stlMelee, G = this.G, P = G.player;
    if (!m) return;
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !MELEE_SET.has(P.anim.action?.name)) { this.stlMelee = null; return; }
    const t = m.target, dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    if (d > m.reach + m.budget + 0.35) { this.stlMelee = null; return; }
    const want = d - (m.reach - 0.3);
    if (want <= 0 || m.budget <= 0) return;
    const step = Math.min(want, m.budget, LUNGE_SPEED * dt);
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    const moved = Math.hypot(P.pos.x - _t.x, P.pos.z - _t.z);
    m.budget = moved < step * 0.3 ? 0 : m.budget - moved;
  },

  // ================================================================== RADIANCE · Golden Ray
  cast_goldenRay(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, yaw = this.stlAimYaw(aim, target);
    this.stlFace(yaw);
    P.anim.play('parasolAim', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stlFace(yaw);
      this.stlRay(yaw, { dmgPct: p.dmgPct, length: p.length, width: p.width, gild: p.gild, k: o.k || 1, tree: 'ray' });
      sfx('stl_ray', { pitch: o.k > 1 ? 0.9 : 1 });
      for (const s of o.split || []) this.stlRay(yaw + s.a, { dmgPct: p.dmgPct * s.pct / 100, length: p.length, width: p.width * 0.8, gild: 1, tree: 'ray' }); // (Split Shot)
      if (o.afterglow) { const from = this.stlFrom(_v).clone(); _d.set(Math.sin(yaw), 0, Math.cos(yaw)); this.stlAfterglow(from, yaw, p.length, p.width, o.afterglow, p.dmgPct); }
    } });
  },
  /** one ray of light from the finial along yaw: every foe in the line → how many it hit. o: { dmgPct, length, width,
   *  gild, k (looks), tree, rose, onHit(e, along) } */
  stlRay(yaw, o) {
    const G = this.G, P = G.player, fx = this.stlFx(), from = this.stlFrom(_v).clone();
    _d.set(Math.sin(yaw), 0, Math.cos(yaw));
    fx.ray(from, _d, o.length, { width: o.width * (o.k || 1), k: 1, rose: o.rose });
    let n = 0;
    this.stlLine(P.pos, yaw, o.length, o.width, (e, along) => {
      n++;
      this.stlHit(e, { dmgPct: o.dmgPct, tree: o.tree || 'ray', from: P.pos, gild: o.gild || 0, knock: 0.15 });
      if (n <= 4) fx.disc(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), { r: 0.22 });
      o.onHit?.(e, along);
    });
    return n;
  },
  /** Afterglow: the ray's line stays lit a moment, searing what stands in it */
  stlAfterglow(from, yaw, len, width, perk, dmgPct) {
    const G = this.G, P = G.player, at = P.pos.clone();
    _d.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.stlFx().afterglow(from, _d, len, width, perk.t);
    let ticks = Math.round(perk.t / 0.5);
    (this.stlZones ||= []).push(this.combat.addZone({ pos: at, life: perk.t + 0.05, tick: 0.5, onTick: () => { if (ticks-- <= 0 || G.playerDead) return; this.stlLine(at, yaw, len, width, e => this.stlHit(e, { dmgPct: perk.pct * 0.5, tree: 'ray', from: at, silent: false })); } }));
  },

  // ================================================================== RADIANCE · Glint
  cast_glint(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, yaw = this.stlAimYaw(aim, target);
    this.stlFace(yaw);
    P.anim.play('parasolGlint', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stlFace(yaw);
      const half = p.arc * Math.PI / 360, from = this.stlFinial(_v).clone();
      this.stlFx().glint(from, yaw, half * 2, p.range, { k: o.k || 1 });
      sfx('stl_glint');
      this.stlCone(P.pos, yaw, half, p.range, e => {
        this.stlHit(e, { dmgPct: p.dmgPct, tree: 'ray', from: P.pos, gild: p.gild });
        if (!e.alive || e.breakable) return;
        e.applyStatus?.('blind', p.dazzle); e.status.blindMiss = Math.max(e.status.blindMiss || 0, p.miss / 100);
        this.stlFx().glare(e);
        if (o.mirror) { e._stlMirror = o.mirror.take; e._stlMirrorT = (G.engine.time || 0) + o.mirror.t; } // (Mirror Flash)
      });
    } });
  },

  // ================================================================== RADIANCE · Prism
  cast_prism(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, yaw = this.stlAimYaw(aim, target);
    this.stlFace(yaw);
    P.anim.play('parasolAim', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stlFace(yaw);
      const n = p.count, spread = p.spread * Math.PI / 180, gilt = new Set();
      sfx('stl_prism');
      this.stlFx().disc(this.stlFinial(_w), { r: 0.4, life: 0.3 });
      for (let i = 0; i < n; i++) {
        const a = yaw + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
        this.stlRay(a, { dmgPct: p.dmgPct, length: p.length, width: p.width, gild: 0, k: o.k || 1, onHit: e => {
          if (o.focal || !gilt.has(e)) { gilt.add(e); this.stlAddGild(e, p.gild); } // (once a foe a cast; Focal Point: once a ray)
          if (o.refraction && !e.alive && !e._stlRefr) { e._stlRefr = true; const from = e.pos.clone(); for (const s of [-0.35, 0.35]) this.after(0.05, () => this.stlRayFrom(from, a + s, { dmgPct: p.dmgPct * o.refraction.pct / 100, length: p.length * 0.6, width: p.width })); } // (Refraction)
        } });
      }
    } });
  },
  /** a ray from a point that isn't her (Refraction's split): every foe in its line */
  stlRayFrom(from, yaw, o) {
    const fx = this.stlFx(); _d.set(Math.sin(yaw), 0, Math.cos(yaw));
    fx.ray(_w.set(from.x, from.y + 0.8, from.z), _d, o.length, { width: o.width, core: false });
    this.stlLine(from, yaw, o.length, o.width, e => this.stlHit(e, { dmgPct: o.dmgPct, tree: 'ray', from, gild: 1 }));
  },

  // ================================================================== RADIANCE · Solar Ray (a channel: the beam ramps while it holds)
  cast_solarRay(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    if (this.channel?.id === 'solarRay') return;
    const fx = this.stlFx(), beam = fx.beam();
    const c = this.channel = { id: 'solarRay', R, o, t: 0, acc: 0, hum: 0, beam, target: target?.alive && !target.breakable ? target : null, ramp: o.heat0 || 0, rampT: 0,
      update: (dt, input) => this.updateSolarRay(dt, input),
      end: () => { beam.end(); if (P.anim.action?.name === 'solarChannel') P.anim.stop('solarChannel'); P.canMoveWhileActing = false; this.stlWalk = 1; } };
    P.anim.play('solarChannel'); P.canMoveWhileActing = true; this.stlWalk = p.walk;
    sfx('stl_beam', { pitch: 1 });
  },
  /** the beam's target: the foe near the aim point (the lock, the cursor), else the one it holds, else the nearest ahead */
  stlBeamPick(c, aim, range) {
    const G = this.G, P = G.player;
    let best = null, bs = 1e9;
    if (aim) this.combat.inRadius(aim.x, aim.z, 1.6, 'ally', (e, d) => { if (!isFoe(e) || dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) > range + (e.radius || 0.3)) return; if (d < bs) { bs = d; best = e; } });
    if (best) return best;
    if (c.target?.alive && dist(c.target.pos.x, c.target.pos.z, P.pos.x, P.pos.z) <= range + (c.target.radius || 0.3) + 0.5) return c.target;
    let bd = 1e9;
    this.combat.inRadius(P.pos.x, P.pos.z, range, 'ally', (e, d) => { if (!isFoe(e)) return; const off = Math.abs(angleDiff(P.facing, Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z))); if (off > 0.9) return; const s = d + off * 3; if (s < bd) { bd = s; best = e; } });
    return best;
  },
  updateSolarRay(dt, input) {
    const G = this.G, P = G.player, c = this.channel, p = c.R.params, fx = this.stlFx();
    const held = input.holding('solarRay') || c.toggleHeld, out = !held && c.spinOut > 0 && P.anim.action?.name === 'solarChannel';
    if (out) c.spinOut -= dt;
    if ((!held && !out) || G.playerDead || P.anim.action?.name !== 'solarChannel') { if (c.R.charge && c.spinOut !== undefined && !G.playerDead) this.solarFinish(c); return this.endChannel(); }
    c.t += dt; c.acc += dt; c.hum -= dt;
    const aim = this.aimOverride || this.charge?.aimOverride || steerPoint() || G.engine.mouseGround?.(Input.mouse.nx, Input.mouse.ny, (x, z) => G.world.heightAt(x, z));
    if (c.R !== c.R0) { c.R0 = c.R; if (c.R.charge) c.ramp = Math.max(c.ramp, c.R.params.heat0 || 0); } // (a charged beam revs up stage by stage: charge.js swaps c.R)
    const tgt = this.stlBeamPick(c, aim, p.range);
    if (tgt !== c.target) { c.target = tgt; c.ramp = c.R.params.heat0 || 0; } // (a new target starts it over)
    const from = this.stlFinial(_v);
    let to;
    if (tgt) { to = _w.set(tgt.pos.x, tgt.pos.y + (tgt.height || 1) * 0.55, tgt.pos.z); P.faceTarget = Math.atan2(tgt.pos.x - P.pos.x, tgt.pos.z - P.pos.z); }
    else { const f = P.facing; to = _w.set(P.pos.x + Math.sin(f) * p.range * 0.6, from.y - 0.2, P.pos.z + Math.cos(f) * p.range * 0.6); }
    c.ramp = Math.min(p.rampMax - 1, c.ramp + (tgt ? p.ramp / 100 * dt : 0));
    const heat = clamp(c.ramp / Math.max(0.01, p.rampMax - 1));
    c.beam.set(from, to, p.width, heat);
    if (c.hum <= 0) { c.hum = 0.3; sfx('stl_beam', { pitch: 1 + 0.4 * heat, vol: 0.6 }); }
    if (c.acc >= p.tick) {
      c.acc -= p.tick;
      if (!out && !G.actions.spendZoom(c.R.cost * p.tick)) { this.endChannel(); G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); return; }
      if (tgt) {
        const per = p.dmgPct * p.tick * (1 + c.ramp);
        this.stlHit(tgt, { dmgPct: per, tree: 'ray', from: P.pos, gild: (c.gildT = (c.gildT || 0) + p.tick) >= 1 ? (c.gildT = 0, p.gild) : 0, silent: false });
        // (and the first foe in the way)
        const yaw = Math.atan2(tgt.pos.x - P.pos.x, tgt.pos.z - P.pos.z), D = dist(tgt.pos.x, tgt.pos.z, P.pos.x, P.pos.z);
        let first = null, fa = 1e9;
        this.stlLine(P.pos, yaw, Math.max(0.5, D - (tgt.radius || 0.3)), p.width, (e, along) => { if (e !== tgt && isFoe(e) && along < fa) { fa = along; first = e; } });
        if (first) this.stlHit(first, { dmgPct: per, tree: 'ray', from: P.pos });
      }
    }
  },
  /** a charged beam let go: Lens Flare (its end bursts) */
  solarFinish(c) {
    const lf = perkAt(c.R, 'lensFlare'); if (!lf) return; // (at the stage it reached: c.R)
    const t = c.target, G = this.G;
    const at = t?.alive ? t.pos.clone() : (() => { const P = G.player, f = P.facing; return new THREE.Vector3(P.pos.x + Math.sin(f) * 6, P.pos.y, P.pos.z + Math.cos(f) * 6); })();
    at.y = G.world.heightAt?.(at.x, at.z) ?? at.y;
    this.stlFx().flare(at, lf.r, { k: 1, rose: false }); sfx('stl_flare', { pos: at, pitch: 1.15 });
    this.combat.inRadius(at.x, at.z, lf.r, 'ally', e => { if (isFoe(e)) this.stlHit(e, { dmgPct: c.R.params.dmgPct * lf.pct / 100, tree: 'ray', from: at }); });
  },

  // ================================================================== RADIANCE · Sundial
  cast_sundial(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('gnomonPlant', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'plant') return;
      const at = P.pos.clone(), f0 = P.facing, fx = this.stlFx(), rounds = o.longest ? 2 : 1, n = p.count, second = (o.longest?.second ?? 100) / 100; // (Longest Day: the second round at 50%)
      const shade = fx.gnomon(at, p.rMax);
      sfx('stl_hour', { hour: 0 });
      let i = 0, t = 0;
      const total = n * rounds, step = p.duration / n;
      const S = this.stlSundial = { shade, at, done: false };
      fx.run((dt) => {
        if (S.done) return false; // (cleared: a hero switch, a floor change)
        t += dt;
        const ang = f0 + (i + Math.min(1, t / step)) / n * TAU;
        shade.set(ang, 1);
        if (G.playerDead) { shade.end(); this.stlSundial = null; return false; }
        while (t >= step && i < total) {
          t -= step;
          const a = f0 + ((i % n) + 0.5) / n * TAU, r = p.rMin + (p.rMax - p.rMin) * (((i * 5) % 7) / 6);
          const spot = _h.set(at.x + Math.sin(a) * r, 0, at.z + Math.cos(a) * r); spot.y = G.world.heightAt?.(spot.x, spot.z) ?? at.y;
          fx.column(spot, p.radius);
          sfx('stl_hour', { hour: i % 12, vol: 0.7 });
          const c = spot.clone();
          const k = i >= n ? second : 1;
          this.combat.inRadius(c.x, c.z, p.radius, 'ally', e => { if (isFoe(e) || e.breakable) this.stlHit(e, { dmgPct: p.dmgPct * k, tree: 'ray', from: c, gild: p.gild }); });
          i++;
        }
        if (i >= total) { shade.end(); this.stlSundial = null; return false; }
        return true;
      });
    } });
  },

  // ================================================================== a blow on her (combat.hitPlayer → stellaGuard)
  stellaGuard(dmg, src) {
    const G = this.G, P = G.player;
    if (P?.hero !== 'stella') return dmg;
    const now = G.engine.time || 0;
    P._stlHitT = now;
    const z = this.stlZoom;
    if (z && z.t > 0 && Math.random() * 100 < z.dodge) { G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.4), 'Zoom!', { kind: 'status', color: '#ffe6a0' }); return 0; } // (the Zoomies' dodge)
    dmg = this.stlSoak(P, dmg, src);
    if (dmg < 0.5) return 0;
    // Hope Springs (a charged Daybreak): anyone in its light who would fall is caught once
    const life = G.actions.life?.() ?? 1e9, hope = this.stlDay?.hope;
    if (hope && dmg >= life && !hope.used.has(P) && this.stlInDay(P.pos)) { hope.used.add(P); G.actions.heal(Math.max(0, G.derived.lifeMax * hope.pct / 100 - life)); this.stlCaught(P.pos, 1.2); return 0; } // (caught at 30%)
    return dmg;
  },

  // ================================================================== per frame
  updateStella(dt) {
    const G = this.G, P = G.player;
    if (!P) return;
    if (this.stlMelee) this.stlTrackMelee(dt);
    // the gilding over each gilded foe (one sprite a foe a frame), dropped when it fades
    if (this.stlGilded?.size) {
      const fx = this.stlFx(), D = G.derived;
      for (const e of this.stlGilded) {
        const n = e.alive ? this.stlGildOf(e) : 0;
        if (!n) { this.stlGilded.delete(e); continue; }
        fx.pips(e, n, n >= GILD_MAX && !!D.sunlit);
      }
    }
    this.updateStellaArts(dt);
    for (const s of this.stlSuns || []) s.update(dt);
    if (this.stlSuns?.length) this.stlSuns = this.stlSuns.filter(s => s.alive);
    // her walk: Solar Ray's (half speed) and the Zoomies' (a burst of speed)
    P.stlSpeed = (this.channel?.id === 'solarRay' ? this.stlWalk || 0.5 : 1) * (this.stlZoom?.t > 0 ? 1 + this.stlZoom.speed / 100 : 1);
  },
  /** end every effect of hers (floor change, hero switch, death): the player's rig may be replaced right after */
  clearStella() {
    this.stlMelee = null; this.stlCombo = 0;
    this.stlGilded?.clear();
    if (this.stlSundial) { this.stlSundial.done = true; this.stlSundial.shade?.end(); } this.stlSundial = null;
    for (const s of this.stlSuns || []) s.expire(true);
    this.stlSuns = [];
    this.clearStellaArts();
    if (this.G.player) this.G.player.stlSpeed = 1;
  },
};

/** Mix Stella's cast implementations into SkillRunner.prototype (skillRunner.js does this at import). */
export function installStellaSkills(proto) {
  for (const k in M) if (!(k in proto)) proto[k] = M[k];
  installStellaArts(proto); installChargedStella(proto);
  const blocked = proto.castBlocked;
  proto.castBlocked = function (id, aim, target, charge) { return this.stlCastBlocked?.(id) || (blocked ? blocked.call(this, id, aim, target, charge) : false); };
}
