// The rest of the Shih Tzu's skills (docs/SHIHTZU.md §3): SkillRunner casts `cast_<id>(R, aim, target, o)` for the 13
// skills after the starters, and the per-frame state they keep. combat/shihtzuSkills.js mixes these in
// (installShihtzuSkills) and calls updateStzArts(dt) / clearStzArts() from its own update / clear. Each cast takes `o`,
// the charged release's extras (combat/chargedShihtzu.js: the perks ride on the real cast).
//  Flail Arts:   Tug of Woe (the ball flung out on a rope, a foe and its friends hauled in), Melancholy Maelstrom (a
//                channel: the ball whirled overhead, foes dragged in and bonked), Steadfast Sulk (a guard, then a spin
//                that grows with every blow taken), The Heaviest Sigh (a hop, a slam, a bone-shaped crack and three
//                shockwaves);
//  Gloom Hexes:  Grumble Cloud (a raining, slowing cloud), Case of the Mopes (slow, weaken, vulnerable), Mournful Awoo
//                (a howl that stings, scares and spreads hexes), Everlasting Gloom (a hex that bursts and jumps on);
//  Ghostlight Tome: Ghost Pups and Grandpaw's Ghost (combat/shihtzuAllies.js), Borrowed Warmth (draining threads),
//                Bone Ward (a barrier of orbiting bones that fly at foes when it breaks), Wayhome Lantern (a pool of
//                mending light that rekindles him once from a fatal blow).
// The guard pieces (the Sulk's block, the mopes' weaken, the ward's barrier, the lantern's rekindle) are applied in
// shihtzuGuard (shihtzuSkills.js) through stzGuardArts() below.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, dampAngle, ease } from '../core/util.js';
import { stzFx, STZ_COL } from '../gfx/shihtzuFx.js';
import '../gfx/shihtzuFxArts.js';
import { GhostPup, Grandpaw } from './shihtzuAllies.js';
import { Actions } from '../core/actions.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const MAX_CLOUDS = 4, MAX_TETHERS = 6;

const M = {
  /** a world point in front of his left paw (the tome, the lantern, the hex) */
  stzPaw(out, side = 'L') {
    const P = this.G.player, h = P.rig?.parts?.[side === 'L' ? 'handL' : 'handR'];
    if (h) { P.rig.root.updateMatrixWorld(true); h.getWorldPosition(out); if (out.distanceToSquared(P.pos) < 9) return out; }
    return out.set(P.pos.x + Math.sin(P.facing) * 0.4, P.pos.y + 0.75, P.pos.z + Math.cos(P.facing) * 0.4);
  },
  /** the spectral tome opens in his left paw for `dur` s (the tome casts), its pages flying on `pages()` */
  stzTomeOpen(dur = 0.7) {
    const fx = this.stzFx(), h = fx.tome(), P = this.G.player;
    const T = { h, t: 0, dur };
    (this.stzTomes ||= []).push(T);
    return T;
  },
  stzGround(v) { v.y = this.G.world.heightAt?.(v.x, v.z) ?? v.y; return v; },

  // ================================================================== FLAIL ARTS · Tug of Woe
  cast_tugOfWoe(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    if (this.stzTug) this.stzTugEnd(true);
    this.stzCombo = 0;
    sfx('flail_whoosh', { pitch: 0.9 });
    P.anim.play('tugThrow', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      const F = P.flail; if (!F) return;
      const from = this.stzPaw(new THREE.Vector3(), 'R');
      const to = target?.alive && !target.breakable ? target.pos : aim;
      const dir = new THREE.Vector3(to.x - P.pos.x, 0, to.z - P.pos.z); if (dir.lengthSq() < 1e-4) dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); dir.normalize();
      const h = this.stzFx().tug(F);
      F.head.visible = false; for (const l of F.links) l.visible = false;
      this.stzTug = { R, o, F, h, from, ball: from.clone(), dir, out: 0, range: p.range * (o.range || 1), speed: p.speed, state: 'out', t: 0, hit: null, grabbed: [], y0: from.y };
      sfx('tug_fling');
    } });
  },
  updateStzTug(dt) {
    const T = this.stzTug; if (!T) return;
    const G = this.G, P = G.player, p = T.R.params, fx = this.stzFx();
    if (!P || G.playerDead || !T.F.holder.parent) return this.stzTugEnd(true);
    T.t += dt;
    const hand = this.stzPaw(_h, 'R');
    if (T.state === 'out') {
      const step = Math.min(T.range - T.out, T.speed * dt); T.out += step;
      T.ball.set(P.pos.x + T.dir.x * (T.out + 0.5), 0, P.pos.z + T.dir.z * (T.out + 0.5)); T.ball.y = (G.world.heightAt?.(T.ball.x, T.ball.z) ?? 0) + 0.65;
      let hit = null;
      this.combat.inRadius(T.ball.x, T.ball.z, 0.55, 'ally', e => { if (!hit && isFoe(e)) hit = e; });
      if (hit || T.out >= T.range - 1e-3 || G.world.collision?.solidAt?.(T.ball.x, T.ball.z, 0.15)) {
        if (hit) {
          // it wraps round the foe (a ring of rope and a squeak), and he heaves
          T.hit = hit; T.state = 'wrap'; T.t = 0;
          fx.ring(_v.copy(hit.pos), (hit.radius || 0.4) + 0.4, 0.3, STZ_COL.plumLt, 0.5); fx.glint(_v.setY(hit.pos.y + (hit.height || 1) * 0.6), 3);
          sfx('flail_hit', { pitch: 1.1 });
          const r = p.grabRadius * (T.o.wide || 1), n = p.extra + (T.o.extra || 0);
          const near = []; this.combat.inRadius(hit.pos.x, hit.pos.z, r, 'ally', e => { if (isFoe(e) && e !== hit) near.push(e); });
          near.sort((a, b) => dist(a.pos.x, a.pos.z, hit.pos.x, hit.pos.z) - dist(b.pos.x, b.pos.z, hit.pos.x, hit.pos.z));
          T.grabbed = [hit, ...near.slice(0, n)];
          P.faceTarget = P.facing = Math.atan2(hit.pos.x - P.pos.x, hit.pos.z - P.pos.z);
          P.anim.play('tugHaul', { speed: 1, onEvent: ev => { if (ev === 'haul' && this.stzTug === T) this.stzTugHaul(T); } });
        } else { T.state = 'back'; T.t = 0; T.back0 = T.ball.clone(); }
      }
    } else if (T.state === 'wrap') {
      T.ball.copy(T.hit.alive ? T.hit.pos : T.ball).setY((T.hit.pos?.y || 0) + Math.min(1.2, (T.hit.height || 1) * 0.6));
      if (T.t > 0.6) { T.state = 'back'; T.t = 0; T.back0 = T.ball.clone(); } // (the haul never came: reel in)
    } else if (T.state === 'haul') {
      // the hauled foes slide in toward a spot in front of him; the ball rides in with the first one
      const k = clamp(T.t / 0.3), e0 = ease.inQuad(k);
      for (const g of T.pulls) {
        if (!g.e.alive) continue;
        _t.copy(g.e.pos); g.e.pos.x = g.from.x + (g.to.x - g.from.x) * e0; g.e.pos.z = g.from.z + (g.to.z - g.from.z) * e0;
        (g.e.world || G.world).collision?.resolve(g.e.pos, (g.e.radius || 0.3) * 0.8, _t);
        if (Math.random() < dt * 30) G.vfx.dust(g.e.pos, { n: 1, size: 0.2 });
      }
      const lead = T.pulls[0]?.e;
      T.ball.copy(lead?.alive ? lead.pos : T.ball).setY((lead?.pos.y || 0) + 0.6);
      if (k >= 1 && !T.landed) {
        T.landed = true;
        for (const g of T.pulls) if (g.e.alive) {
          this.combat.hitMonster(g.e, { dmgPct: p.dmgPct, stun: p.daze, knock: 0.15, from: P.pos });
          if (!g.e.def?.boss && g.e.alive) this.fx?.()?.dizzy?.(g.e, p.daze);
        }
        if (T.o.slam && T.pulls.length > 1) { // (Bonk Together: the hauled crowd knocks heads)
          _v.copy(T.pulls[0].to); this.stzGround(_v); fx.thud(_v, 1, true);
          this.combat.inRadius(_v.x, _v.z, T.o.slam.r, 'ally', e => { if (isFoe(e)) this.combat.hitMonster(e, { dmgPct: p.dmgPct * T.o.slam.pct / 100, from: _v, knock: 0.6 }); });
        }
        sfx('flail_bonk', { pitch: 1.05 }); G.engine.rig.shake(0.15);
        T.state = 'back'; T.t = 0; T.back0 = T.ball.clone();
      }
    } else if (T.state === 'back') {
      const k = clamp(T.t / 0.22);
      T.ball.lerpVectors(T.back0, hand, ease.inQuad(k));
      if (k >= 1) return this.stzTugEnd();
    }
    const slack = T.state === 'out' ? 0.15 * (1 - T.out / T.range) : T.state === 'back' ? 0.4 : 0.05;
    T.h.set(hand, T.ball, slack);
  },
  /** the heave: every grabbed foe is dragged in (bosses only flinch) */
  stzTugHaul(T) {
    const G = this.G, P = G.player;
    T.state = 'haul'; T.t = 0; T.pulls = [];
    const f = P.facing;
    T.grabbed.forEach((e, i) => {
      if (!e.alive) return;
      if (e.def?.boss) { this.combat.hitMonster(e, { dmgPct: T.R.params.dmgPct * 0.6, stun: 0.15, from: P.pos }); return; }
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.8, d = 1.25 + (e.radius || 0.3) + Math.floor((i + 1) / 2) * 0.35;
      const to = new THREE.Vector3(P.pos.x + Math.sin(f) * d + Math.cos(f) * side, e.pos.y, P.pos.z + Math.cos(f) * d - Math.sin(f) * side);
      T.pulls.push({ e, from: e.pos.clone(), to });
    });
    sfx('tug_haul');
  },
  stzTugEnd(silent) {
    const T = this.stzTug; if (!T) return;
    this.stzTug = null; T.h.end();
    if (T.F) { T.F.head.visible = true; for (const l of T.F.links) l.visible = true; }
    if (!silent) sfx('flail_hit', { pitch: 0.8, vol: 0.5 });
  },

  // ================================================================== FLAIL ARTS · Melancholy Maelstrom (a channel)
  cast_maelstrom(R, aim, target, o = {}) {
    const G = this.G, P = G.player;
    if (this.channel?.id === 'maelstrom') return;
    this.stzCombo = 0;
    const c = this.channel = { id: 'maelstrom', R, o, acc: 1 / Math.max(1, R.params.hitsPerSec), t: 0, hum: 0, sw: this.stzFx().swirl(),
      update: (dt, input) => this.updateMaelstrom(dt, input),
      end: () => { c.sw.end(); if (P.anim.action?.name === 'stzWhirl') P.anim.stop('stzWhirl'); P.canMoveWhileActing = false; } };
    P.anim.play('stzWhirl'); P.canMoveWhileActing = true;
    sfx('flail_whoosh', { pitch: 0.8 });
  },
  updateMaelstrom(dt, input) {
    const G = this.G, P = G.player, c = this.channel, p = c.R.params, fx = this.stzFx();
    const held = input.holding('maelstrom') || c.toggleHeld, out = !held && c.spinOut > 0 && P.anim.action?.name === 'stzWhirl';
    if (out) {
      c.spinOut -= dt;
      if (c.o?.drift) { const a = this.charge?.cursorGround?.(_t); if (a) { const dx = a.x - P.pos.x, dz = a.z - P.pos.z, d = Math.hypot(dx, dz); if (d > 0.3) this.slideHero(_w.set(dx / d, 0, dz / d), Math.min(d, c.o.drift.speed * dt)); } } // (Drifting Gloom)
    }
    if ((!held && !out) || G.playerDead || P.anim.action?.name !== 'stzWhirl') {
      if (c.R.charge && c.spinOut !== undefined && !G.playerDead) this.maelstromFinish(c);
      return this.endChannel();
    }
    c.t += dt; c.acc += dt; c.hum -= dt;
    const r = p.radius;
    c.sw.set(P.pos, r, dt);
    // foes nearby are dragged in toward him (bosses barely budge: pullFoe)
    for (const e of this.foesNear(P.pos.x, P.pos.z, r + 2.5)) this.pullFoe(e, P.pos.x, P.pos.z, p.pull * dt, r * 0.45);
    if (c.hum <= 0) { c.hum = 0.24; sfx('flail_whoosh', { pitch: 0.75 + 0.1 * Math.random(), vol: 0.45 }); }
    if (c.acc >= 1 / p.hitsPerSec) {
      c.acc = 0;
      if (!out && !G.actions.spendZoom(c.R.cost / p.hitsPerSec)) { this.endChannel(); G.ui?.float?.(P.pos.clone().setY(1.6), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); return; }
      let n = 0;
      this.nova(P.pos, r, e => { if (!isFoe(e) && !e.breakable) return; n++; this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }); });
      if (n) { sfx('flail_hit', { pitch: 0.9 + Math.random() * 0.2, vol: 0.5 }); fx.glint(_v.set(P.pos.x, P.pos.y + 1.6, P.pos.z), 2); }
    }
  },
  /** a charged Maelstrom's end (Dizzy Finale): the ball comes down in one last slam all round him */
  maelstromFinish(c) {
    const G = this.G, P = G.player, p = c.R.params, fx = this.stzFx(), fin = c.o?.finale;
    if (!fin) return;
    fx.thud(this.stzGround(_v.set(P.pos.x + Math.sin(P.facing) * 1.2, 0, P.pos.z + Math.cos(P.facing) * 1.2)), 1.3, true); fx.shock(P.pos, p.radius + 1, 0.4);
    this.nova(P.pos, p.radius + 1, e => { if (isFoe(e)) { this.combat.hitMonster(e, { dmgPct: p.dmgPct * fin.pct / 100, knock: 1.4, stun: fin.dizzy, from: P.pos }); if (!e.def?.boss) this.fx?.()?.dizzy?.(e, fin.dizzy); } });
    sfx('flail_thud'); G.engine.rig.shake(0.3);
  },

  // ================================================================== FLAIL ARTS · Steadfast Sulk
  cast_steadfastSulk(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    this.stzSulkEnd(true);
    this.stzCombo = 0;
    P.anim.play('sulk');
    this.stzSulk = { R, o, t: 0, dur: p.guard, blows: o.preBlows || 0, h: this.stzFx().sulk() };
    sfx('stz_sigh', { pitch: 1.1, vol: 0.7 }); sfx('sulk_hmph');
  },
  updateStzSulk(dt) {
    const S = this.stzSulk; if (!S) return;
    const G = this.G, P = G.player;
    S.t += dt; S.h.set(P.pos);
    if (G.playerDead) return this.stzSulkEnd(true);
    if (P.anim.action?.name !== 'sulk') return this.stzSulkEnd(true); // (another move broke the sulk off: no spin)
    if (S.t >= S.dur) this.stzSulkSpin(S);
  },
  stzSulkSpin(S) {
    const G = this.G, P = G.player, p = S.R.params, fx = this.stzFx();
    this.stzSulk = null; S.h.end();
    const blows = Math.min(p.maxBlows + (S.o.maxBlows || 0), S.blows), mult = 1 + p.perBlow * blows / 100;
    sfx('flail_whoosh', { pitch: 0.85 });
    P.anim.play('sulkSpin', { speed: 1, onEvent: ev => {
      if (ev !== 'hit') return;
      const r = p.radius * (S.o.wide || 1);
      fx.shock(P.pos, r, 0.35);
      let n = 0;
      this.nova(P.pos, r, e => { if (!isFoe(e) && !e.breakable) return; n++; this.combat.hitMonster(e, { dmgPct: p.dmgPct * mult, knock: p.knockback, from: P.pos, stun: S.o.stun || 0 }); });
      if (n) { sfx('flail_bonk', { pitch: 0.9 }); G.engine.rig.shake(0.15 + 0.04 * blows); }
      if (blows >= 2) G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.9), blows >= 4 ? 'HMPH!!' : 'Hmph!', { kind: 'status', color: '#e6dcef' });
    } });
    // the trail: the spin's ball
    this.stzTrail()?.on(1);
  },
  stzSulkEnd(silent) { const S = this.stzSulk; if (!S) return; this.stzSulk = null; S.h.end(); },

  // ================================================================== FLAIL ARTS · The Heaviest Sigh
  cast_heaviestSigh(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    this.stzCombo = 0;
    const d = Math.max(0, Math.min(p.leap, dist(aim.x, aim.z, P.pos.x, P.pos.z) - 1.2)), f = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
    const to = new THREE.Vector3(P.pos.x + Math.sin(f) * d, P.pos.y, P.pos.z + Math.cos(f) * d);
    this.stzLeap = { from: P.pos.clone(), to, u0: 0.5, u1: 0.76 };
    sfx('stz_sigh', { pitch: 0.85, vol: 1 });
    P.anim.play('sigh', { speed: this.animSpeed(0.95), onEvent: ev => {
      if (ev !== 'hit') return;
      this.stzLeap = null;
      const fx = this.stzFx(), at = this.stzGround(_w.set(P.pos.x + Math.sin(P.facing) * 0.9, 0, P.pos.z + Math.cos(P.facing) * 0.9)).clone();
      fx.crack(at, P.facing, 1 + 0.15 * (o.rings || 0)); fx.thud(at, 1.4, true);
      sfx('flail_thud', { pitch: 0.7, vol: 1 }); sfx('sigh_crack'); G.engine.rig.shake(0.45); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.05);
      const rings = p.rings + (o.rings || 0), R1 = p.radius * (o.wide || 1), hit = new Set();
      for (let i = 0; i < rings; i++) {
        const r = R1 * (i + 1) / rings, delay = i * 0.16;
        const go = () => {
          fx.shock(at, r, 0.42);
          if (i) sfx('flail_thud', { pitch: 0.85 + 0.1 * i, vol: 0.6 });
          this.combat.inRadius(at.x, at.z, r + 0.3, 'ally', e => {
            if (hit.has(e) || (!isFoe(e) && !e.breakable)) return; hit.add(e);
            this.combat.hitMonster(e, { dmgPct: p.dmgPct * (o.ringPct ? 1 + o.ringPct * i / 100 : 1), stun: p.stun, knock: p.knockback * (1 - 0.2 * i), from: at });
            if (!e.def?.boss && e.alive && !e.breakable) this.fx?.()?.dizzy?.(e, p.stun);
          });
        };
        if (delay > 0) this.after(delay, go); else go();
      }
    } });
  },
  updateStzLeap() {
    const L = this.stzLeap; if (!L) return;
    const G = this.G, P = G.player, a = P.anim.action;
    if (!a || a.name !== 'sigh') { this.stzLeap = null; return; }
    const u = clamp(a.t / a.dur), k = clamp((u - L.u0) / (L.u1 - L.u0));
    if (k <= 0) return;
    _t.copy(P.pos); P.pos.x = L.from.x + (L.to.x - L.from.x) * ease.inOutQuad(k); P.pos.z = L.from.z + (L.to.z - L.from.z) * ease.inOutQuad(k);
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    if (k >= 1) this.stzLeap = null;
  },

  // ================================================================== GLOOM HEXES · Grumble Cloud
  cast_grumbleCloud(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('hex_cast', { pitch: 0.85 });
    P.anim.play('hexFlick', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const at = this.clampAim(aim, p.range).clone(), r = p.radius * (o.size || 1);
      const C = this.stzClouds ||= [];
      while (C.filter(c => !c.done).length >= Math.min(MAX_CLOUDS, p.maxClouds)) { const c = C.find(x => !x.done); c.done = true; c.h.end(); }
      C.push({ R, o, pos: at, r, t: 0, dur: p.duration * (o.dur || 1), acc: 0, bolt: 1.2, h: this.stzFx().cloud(at, r), done: false });
      sfx('grumble'); this.stzFx().gloomPuff(_v.copy(at).setY(at.y + 2.6), 6, r * 0.5, STZ_COL.lilac);
    } });
  },
  updateStzClouds(dt) {
    const C = this.stzClouds; if (!C?.length) return;
    const G = this.G, fx = this.stzFx();
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i];
      if (c.done) { C.splice(i, 1); continue; }
      c.t += dt; c.acc += dt;
      if (c.o.follow) { // (Brooding Drift: the charged cloud drifts after the nearest foe)
        const e = this.combat.nearest?.(c.pos, 'ally', c.r + 4);
        if (e) { const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z, d = Math.hypot(dx, dz); if (d > 0.3) { const s = Math.min(d, c.o.follow.speed * dt); c.pos.x += dx / d * s; c.pos.z += dz / d * s; this.stzGround(c.pos); c.h.set(c.pos); } }
      }
      const p = c.R.params;
      if (c.acc >= p.tick) {
        c.acc -= p.tick;
        let n = 0;
        this.combat.inRadius(c.pos.x, c.pos.z, c.r, 'ally', e => { if (!isFoe(e)) return; n++; this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'gloom', noCrit: true, silent: n > 6 }); e.applyStatus?.('slow', p.tick + 0.25, p.slow); });
        if (n && Math.random() < 0.4) sfx('rain_tick', { vol: 0.35, pos: c.pos });
      }
      if (c.o.thunder) { // (Grumble Grumble: now and then the cloud grumbles a bolt onto one foe beneath it)
        c.bolt -= dt;
        if (c.bolt <= 0) {
          c.bolt = c.o.thunder.every;
          let e = null; this.combat.inRadius(c.pos.x, c.pos.z, c.r, 'ally', x => { if (!e && isFoe(x)) e = x; });
          if (e) { G.vfx.lightning?.(_v.set(c.pos.x, c.pos.y + 2.5, c.pos.z), _w.set(e.pos.x, e.pos.y + 0.6, e.pos.z), { color: '#bff6e6', width: 0.08, life: 0.18, jag: 0.35 }); this.combat.hitMonster(e, { dmgPct: p.dmgPct * c.o.thunder.pct / 100, element: 'gloom', stun: c.o.thunder.stun }); sfx('grumble', { pitch: 1.3, vol: 0.6 }); }
        }
      }
      if (c.t >= c.dur) { c.done = true; c.h.end(); C.splice(i, 1); }
    }
  },

  // ================================================================== GLOOM HEXES · Case of the Mopes
  cast_caseOfMopes(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('stz_sigh', { pitch: 1.05, vol: 0.8 });
    P.anim.play('hexFlick', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const at = this.clampAim(aim, p.range).clone(), r = p.radius * (o.size || 1), fx = this.stzFx();
      fx.mopeWave(at, r); sfx('mopes');
      this.combat.inRadius(at.x, at.z, r, 'ally', e => { if (isFoe(e)) this.stzMope(e, p, o); });
    } });
  },
  /** give a foe the mopes: slower, weaker (shihtzuGuard reads it), and more vulnerable (cursedMul, restored after) */
  stzMope(e, p, o = {}) {
    const Mo = this.stzMopes ||= new Map();
    const dur = p.duration * (o.dur || 1), vuln = 1 + (p.vuln + (o.vuln || 0)) / 100;
    let m = Mo.get(e);
    if (!m) { m = { t: 0, h: this.stzFx().mopes(e) }; Mo.set(e, m); }
    m.t = Math.max(m.t, dur); m.weaken = p.weaken; m.vuln = vuln; m.spread = o.spread || null; m.p = p; m.o = o;
    e.applyStatus?.('slow', dur, p.slow);
    e.cursedMul = Math.max(e.cursedMul || 1, vuln); m.mul = e.cursedMul;
  },
  updateStzMopes(dt) {
    const Mo = this.stzMopes; if (!Mo?.size) return;
    for (const [e, m] of Mo) {
      m.t -= dt;
      if (!e.alive || m.t <= 0) {
        if (!e.alive && m.spread) { // (Contagious Mopes: a moping foe that drops passes them to the nearest foe)
          const n = this.combat.nearest?.(e.pos, 'ally', m.spread.r); if (n && !Mo.has(n)) { this.stzFx().hexJump(e.pos, n.pos); this.stzMope(n, m.p, { ...m.o, spread: null }); }
        }
        if (e.cursedMul === m.mul) e.cursedMul = 1;
        m.h?.end(); Mo.delete(e);
      }
    }
  },

  // ================================================================== GLOOM HEXES · Mournful Awoo
  cast_mournfulAwoo(R, aim, target, o = {}) {
    const G = this.G, P = G.player;
    P.anim.play('awoo', { speed: 1, onEvent: ev => {
      if (ev !== 'howl') return;
      this.stzAwoo(R, o, 1);
      if (o.encore) this.after(o.encore.delay, () => { if (!G.playerDead) this.stzAwoo(R, o, o.encore.pct / 100, true); });
    } });
  },
  stzAwoo(R, o, k = 1, echo = false) {
    const G = this.G, P = G.player, p = R.params, fx = this.stzFx(), r = p.radius;
    fx.awoo(P.pos, r); fx.howlWave(P.pos, r, 0.5); sfx('stz_awoo', { pitch: echo ? 1.12 : 1, vol: echo ? 0.6 : 1 });
    // the strongest hex nearby is what spreads: it hops from the foe carrying it to every foe in earshot as the howl reaches them
    let dps = 0, dur = 0, src = null, H = this.stzHexes;
    if (H) for (const [e, h] of H) if (e.alive && dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) < r) { if (h.dps > dps) { dps = h.dps; dur = h.dur || 5; src = e; } }
    const cap = G.derived?.hexStacks || 3, from = src ? src.pos.clone() : P.pos.clone(), speed = r / 0.5;
    let hops = 0;
    this.combat.inRadius(P.pos.x, P.pos.z, r, 'ally', e => {
      if (!isFoe(e)) return;
      this.combat.hitMonster(e, { dmgPct: p.dmgPct * k, element: 'gloom', from: P.pos });
      if (!echo) e.applyStatus?.('fear', p.fear);
      if (dps > 0) {
        const at = dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) / speed, tgt = e;
        if (e !== src && hops++ < 14) this.after(at, () => { if (tgt.alive) { fx.hexHop(from, tgt.pos); this.stzHex(tgt, dps, dur, p.spread, cap); } });
        else this.stzHex(e, dps, dur, p.spread, cap);
      }
    });
    if (o.chorus) for (const a of this.stzAllies || []) { // (Chorus: the ghosts howl along)
      if (!a.alive) continue;
      fx.awoo(a.pos, o.chorus.r);
      this.combat.inRadius(a.pos.x, a.pos.z, o.chorus.r, 'ally', e => { if (isFoe(e)) this.combat.hitMonster(e, { dmgPct: p.dmgPct * k * o.chorus.pct / 100, element: 'gloom', from: a.pos, silent: true }); });
    }
    if (o.chorus && this.stzAllies?.length) this.after(0.1, () => sfx('pup_yip', { pitch: 0.9, vol: 0.6 }));
  },

  // ================================================================== GLOOM HEXES · Everlasting Gloom
  cast_everlastingGloom(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('hex_cast', { pitch: 0.7, vol: 1 });
    P.anim.play('hexRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const at = this.clampAim(aim, p.range).clone(), r = p.radius * (o.size || 1), fx = this.stzFx();
      fx.bigHex(at, r);
      const group = { jumps: p.jumps + (o.jumps || 0), burstPct: p.burstPct, burstRadius: p.burstRadius, jumpRange: p.jumpRange, dotPct: p.dotPct, dur: p.duration };
      this.after(0.25, () => {
        sfx('hex_splat', { pitch: 0.8, vol: 1 }); G.engine.rig.shake(0.12);
        const cap = G.derived?.hexStacks || 3;
        this.combat.inRadius(at.x, at.z, r, 'ally', e => { if (!isFoe(e)) return; const h = this.stzHex(e, p.dotPct, p.duration, o.stacks || 1, cap); if (h) h.ever = group; });
      });
    } });
  },

  // ================================================================== GHOSTLIGHT TOME · Ghost Pups
  stzPupCount() { let n = 0; for (const a of this.stzAllies || []) if (a.alive && a instanceof GhostPup) n++; return n; },
  cast_ghostPups(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const T = this.stzTomeOpen(0.75);
    sfx('tome_open');
    P.anim.play('tomeRead', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const A = (this.stzAllies ||= []).filter(a => a.alive), pups = A.filter(a => a instanceof GhostPup);
      for (const x of pups) x.refresh(R, o);
      const want = Math.min(8, p.pups + (o.extra || 0));
      const at = this.stzPaw(_v, 'L');
      for (let i = pups.length; i < want; i++) {
        const a = P.facing + (i - (want - 1) / 2) * 0.6;
        const pos = new THREE.Vector3(P.pos.x + Math.sin(a) * 1.1, P.pos.y, P.pos.z + Math.cos(a) * 1.1);
        const pup = new GhostPup(G, R, pos, i, o); if (pup.alive) A.push(pup);
      }
      this.stzAllies = A;
      T.h.pages(5); this.stzFx().summonPuff(at, 0.4);
      sfx('pup_yip', { pitch: 1.25 }); this.after(0.12, () => sfx('pup_yip', { pitch: 1.4, vol: 0.6 }));
    } });
  },
  // ================================================================== GHOSTLIGHT TOME · Grandpaw's Ghost
  cast_grandpawsGhost(R, aim, target, o = {}) {
    const G = this.G, P = G.player;
    const T = this.stzTomeOpen(0.8);
    sfx('tome_open', { pitch: 0.85 });
    P.anim.play('tomeRead', { speed: (G.derived?.castMul || 1) * 0.85, onEvent: ev => {
      if (ev !== 'release') return;
      const A = (this.stzAllies ||= []).filter(a => a.alive);
      const old = A.find(a => a instanceof Grandpaw);
      T.h.pages(9);
      if (old) old.refresh(R, o);
      else {
        const pos = new THREE.Vector3(P.pos.x + Math.sin(P.facing) * 1.8, P.pos.y, P.pos.z + Math.cos(P.facing) * 1.8);
        A.push(new Grandpaw(G, R, pos, o));
      }
      this.stzAllies = A;
    } });
  },

  // ================================================================== GHOSTLIGHT TOME · Borrowed Warmth
  cast_borrowedWarmth(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('hex_cast', { pitch: 1.15, vol: 0.8 });
    P.anim.play('hexFlick', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      const n = Math.min(MAX_TETHERS, p.tethers + (o.extra || 0)), pick = [];
      if (target && isFoe(target) && dist(target.pos.x, target.pos.z, P.pos.x, P.pos.z) < p.range) pick.push(target);
      const near = []; this.combat.inRadius(P.pos.x, P.pos.z, p.range, 'ally', e => { if (isFoe(e) && !pick.includes(e)) near.push(e); });
      near.sort((a, b) => dist(a.pos.x, a.pos.z, aim.x, aim.z) - dist(b.pos.x, b.pos.z, aim.x, aim.z));
      for (const e of near) { if (pick.length >= n) break; pick.push(e); }
      const Tt = this.stzTethers ||= [];
      for (const e of pick) {
        const old = Tt.find(t => t.e === e); if (old) { old.t = 0; continue; }
        if (Tt.length >= MAX_TETHERS) { const x = Tt.shift(); x.h.end(); }
        Tt.push({ R, o, e, t: 0, dur: p.duration * (o.dur || 1), acc: 0, h: this.stzFx().tether() });
      }
      if (pick.length) sfx('warmth');
    } });
  },
  updateStzTethers(dt) {
    const Tt = this.stzTethers; if (!Tt?.length) return;
    const G = this.G, P = G.player, fx = this.stzFx();
    let healed = 0;
    for (let i = Tt.length - 1; i >= 0; i--) {
      const T = Tt[i], p = T.R.params, e = T.e;
      T.t += dt; T.acc += dt;
      if (!e.alive || T.t >= T.dur || G.playerDead || dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) > p.snap) { T.h.end(); Tt.splice(i, 1); continue; }
      T.h.set(_v.set(e.pos.x, e.pos.y + Math.min(1.6, (e.height || 1) * 0.6), e.pos.z), _w.set(P.pos.x, P.pos.y + 0.8, P.pos.z), dt);
      if (T.acc >= p.tick) {
        T.acc -= p.tick;
        const d = this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'gloom', noCrit: true, silent: Tt.length > 3 }) || 0;
        healed += d * (p.heal + (T.o.heal || 0)) / 100;
        if (T.o.share) for (const a of this.stzAllies || []) if (a.alive) a.heal?.(d * T.o.share.pct / 100); // (Shared Warmth: the ghosts are warmed too)
      }
    }
    if (healed > 0) {
      const got = G.actions.heal?.(healed) || 0;
      if (got >= 1) { this._stzHealAcc = (this._stzHealAcc || 0) + got; if (!this._stzHealT || G.engine.time - this._stzHealT > 0.6) { this._stzHealT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), `+${Math.round(this._stzHealAcc)}`, { kind: 'heal', color: '#7af0b0' }); this._stzHealAcc = 0; fx.hearts(_v.set(P.pos.x, P.pos.y + 1.2, P.pos.z), 1); } }
    }
  },

  // ================================================================== GHOSTLIGHT TOME · Bone Ward
  cast_boneWard(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const T = this.stzTomeOpen(0.7);
    sfx('tome_open', { pitch: 1.1 });
    P.anim.play('tomeRead', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stzWardEnd(true);
      const B = this.stzFx().boneBatch(), n = Math.min(10, p.bones + (o.extra || 0)), max = Math.round((G.derived?.lifeMax || 100) * p.absorbPct / 100 * (o.pool || 1));
      const bones = []; for (let i = 0; i < n; i++) { const s = B.add(); if (s) bones.push({ s, a: (i / n) * TAU }); }
      this.stzWard = { R, o, t: 0, dur: p.duration, pool: max, max, bones, spin: 0, hitT: 0 };
      T.h.pages(4); this.stzFx().summonPuff(_v.copy(P.pos).setY(P.pos.y + 0.6), 0.5);
      sfx('bone_ward');
    } });
  },
  updateStzWard(dt) {
    const W = this.stzWard, G = this.G, P = G.player, fx = this.stzFx();
    if (W) {
      W.t += dt; W.spin += dt * 2.6; W.hitT = Math.max(0, W.hitT - dt * 4);
      if (G.playerDead) return this.stzWardEnd(true);
      if (W.o.broth) G.actions.heal?.((G.derived?.lifeMax || 100) * W.o.broth.regen / 100 * dt); // (Bone Broth)
      const k = Math.max(0.35, W.pool / Math.max(1, W.max)), B = fx.boneBatch(), r = W.R.params.radius;
      W.bones.forEach((b, i) => {
        const a = b.a + W.spin, y = P.pos.y + 0.75 + Math.sin(W.t * 3 + i) * 0.08;
        B.set(b.s, { x: P.pos.x + Math.cos(a) * r, y, z: P.pos.z + Math.sin(a) * r, yaw: -a, roll: 0.35, pitch: Math.sin(W.t * 2 + i) * 0.3, scale: 1.55 * (1 + W.hitT * 0.15), alpha: k * Math.min(1, W.t * 4) });
      });
      if (W.pool <= 0 || W.t >= W.dur) this.stzWardBreak();
    }
    // bones flying off at foes
    const F = this.stzBoneShots; if (!F?.length) return;
    const B = fx.boneBatch();
    for (let i = F.length - 1; i >= 0; i--) {
      const s = F[i]; s.t += dt;
      const k = clamp(s.t / s.dur), to = s.e?.alive ? s.e.pos : s.to;
      _v.lerpVectors(s.from, to, ease.inQuad(k)); _v.y = s.from.y + (to.y + 0.6 - s.from.y) * k + Math.sin(k * Math.PI) * 1.1;
      B.set(s.s, { x: _v.x, y: _v.y, z: _v.z, yaw: s.t * 14, roll: s.t * 9, scale: 1.55, alpha: 1 });
      if (Math.random() < 0.6) fx.pn.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.25, size: 0.14, size1: 0.04, color: STZ_COL.ghostLt, alpha: 0.6, alpha1: 0, frame: 8 });
      if (k >= 1) {
        if (s.e?.alive) { this.combat.hitMonster(s.e, { dmgPct: s.pct, element: 'gloom', knock: 0.3, from: s.from }); fx.glint(_v, 2); }
        B.remove(s.s); F.splice(i, 1);
        if (Math.random() < 0.5) sfx('bone_tink', { pos: _v });
      }
    }
  },
  /** the ward breaks (or runs out): every bone flies off at the nearest foes */
  stzWardBreak() {
    const W = this.stzWard; if (!W) return;
    this.stzWard = null;
    const G = this.G, P = G.player, p = W.R.params, fx = this.stzFx(), B = fx.boneBatch();
    const foes = []; this.combat.inRadius(P.pos.x, P.pos.z, 9, 'ally', e => { if (isFoe(e)) foes.push(e); });
    foes.sort((a, b) => dist(a.pos.x, a.pos.z, P.pos.x, P.pos.z) - dist(b.pos.x, b.pos.z, P.pos.x, P.pos.z));
    const F = this.stzBoneShots ||= [];
    W.bones.forEach((b, i) => {
      const e = foes.length ? foes[i % foes.length] : null;
      if (!e) { B.remove(b.s); return; }
      const a = b.a + W.spin;
      F.push({ s: b.s, e, from: new THREE.Vector3(P.pos.x + Math.cos(a) * p.radius, P.pos.y + 0.75, P.pos.z + Math.sin(a) * p.radius), to: e.pos.clone(), t: -i * 0.05, dur: 0.32 + Math.min(0.3, dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) * 0.03), pct: p.dmgPct * (W.o.bonePct || 1) });
    });
    fx.summonPuff(_v.copy(P.pos).setY(P.pos.y + 0.6), 0.5); sfx('bone_ward', { pitch: 1.3 });
  },
  stzWardEnd(silent) {
    const W = this.stzWard; if (!W) return;
    this.stzWard = null;
    const B = this.stzFx().boneBatch(); for (const b of W.bones) B.remove(b.s);
  },

  // ================================================================== GHOSTLIGHT TOME · Wayhome Lantern
  cast_wayhomeLantern(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('tome_open', { pitch: 0.95, vol: 0.6 });
    P.anim.play('lanternSet', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'set') return;
      const d = Math.min(p.range, Math.max(1.1, dist(aim.x, aim.z, P.pos.x, P.pos.z))), f = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
      const at = this.stzGround(new THREE.Vector3(P.pos.x + Math.sin(f) * Math.min(d, 1.1), 0, P.pos.z + Math.cos(f) * Math.min(d, 1.1)));
      this.stzLanternEnd();
      const r = p.radius * (o.size || 1);
      this.stzLantern = { R, o, pos: at, r, t: 0, dur: p.duration * (o.dur || 1), acc: 0, rekindle: true, h: this.stzFx().lantern(at, r) };
      sfx('lantern_set');
    } });
  },
  updateStzLantern(dt) {
    const L = this.stzLantern; if (!L) return;
    const G = this.G, P = G.player, p = L.R.params;
    L.t += dt; L.acc += dt;
    if (L.t >= L.dur || (L.endAt && L.t >= L.endAt)) return this.stzLanternEnd();
    const inside = (x, z) => dist(x, z, L.pos.x, L.pos.z) < L.r;
    const lm = G.derived?.lifeMax || 100;
    if (!G.playerDead && inside(P.pos.x, P.pos.z)) G.actions.heal?.(lm * p.regen / 100 * dt);
    for (const a of this.stzAllies || []) if (a.alive && inside(a.pos.x, a.pos.z)) a.heal?.(a.lifeMax * p.regen / 100 * dt);
    if (L.acc >= 0.5) {
      L.acc -= 0.5;
      this.combat.inRadius(L.pos.x, L.pos.z, L.r, 'ally', e => { if (isFoe(e)) { this.combat.hitMonster(e, { dmgPct: p.dmgPct * 0.5, element: 'gloom', noCrit: true, silent: true }); if (L.o.calm) e.applyStatus?.('slow', 0.7, L.o.calm.slow); } });
    }
  },
  stzLanternEnd() { const L = this.stzLantern; if (!L) return; this.stzLantern = null; L.h.end(); },

  // ================================================================== the guard pieces (shihtzuGuard calls this)
  /** dmg about to land on him from src → what gets through (the mopes' weaken, the Sulk's block, Bone Ward's barrier,
   *  the lantern's rekindle). → { dmg, soak } (soak: the hit was eaten whole: no hurt, no number) */
  stzGuardArts(dmg, src) {
    const G = this.G, P = G.player, fx = this.stzFx();
    const mo = src && this.stzMopes?.get(src); if (mo) dmg *= 1 - mo.weaken / 100;
    const S = this.stzSulk;
    if (S) {
      const p = S.R.params; dmg *= 1 - Math.min(90, p.block + (S.o.block || 0)) / 100; S.blows++;
      S.h.blow(_v.set(P.pos.x, P.pos.y + 0.9, P.pos.z)); sfx('sulk_hmph', { vol: 0.6, pitch: 1 + 0.06 * S.blows });
    }
    const W = this.stzWard;
    if (W && dmg > 0) {
      const a = Math.min(W.pool, dmg); W.pool -= a; dmg -= a; W.hitT = 1;
      fx.glint(_v.set(P.pos.x, P.pos.y + 0.8, P.pos.z), 2); sfx('bone_tink', { vol: 0.6 });
      if (dmg < 0.5) { G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.4), 'Bonk!', { kind: 'status', color: '#bff6e6' }); if (W.pool <= 0) this.stzWardBreak(); return { dmg: 0, soak: true }; }
      if (W.pool <= 0) this.stzWardBreak();
    }
    const L = this.stzLantern;
    if (L?.rekindle && !G.playerDead && dmg >= (G.actions.life?.() ?? 1e9)) {
      // the lantern lights him home: the blow doesn't land, he's back up at rekindle % life, the lantern flares and gutters
      L.rekindle = false; L.endAt = L.t + 1.4;
      const lm = G.derived?.lifeMax || 100, want = lm * L.R.params.rekindle / 100, now = G.actions.life?.() || 0;
      if (want > now) G.actions.heal?.(want - now);
      L.h.flare(); fx.hearts(_v.set(P.pos.x, P.pos.y + 1.4, P.pos.z), 6);
      G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.9), 'Rekindled!', { kind: 'status', color: '#bff6e6' });
      sfx('lantern_rekindle'); G.engine.post?.pulse?.('#bff6e6', 0.12);
      return { dmg: 0, soak: true };
    }
    return { dmg, soak: false };
  },

  // ================================================================== per frame / clear
  updateStzArts(dt) {
    const G = this.G, P = G.player;
    this.updateStzTug(dt);
    this.updateStzSulk(dt);
    this.updateStzLeap(dt);
    this.updateStzClouds(dt);
    this.updateStzMopes(dt);
    this.updateStzTethers(dt);
    this.updateStzWard(dt);
    this.updateStzLantern(dt);
    if (this.stzAllies?.length) { for (const a of this.stzAllies) a.update(dt); if (this.stzAllies.some(a => !a.alive)) this.stzAllies = this.stzAllies.filter(a => a.alive); }
    // the tome follows his left paw while it's open
    const T = this.stzTomes;
    if (T?.length && P) for (let i = T.length - 1; i >= 0; i--) { const x = T[i]; x.t += dt; this.stzPaw(_v, 'L'); _v.y += 0.12; x.h.set(_v, P.facing); if (x.t >= x.dur) { x.h.end(); T.splice(i, 1); } }
  },
  clearStzArts() {
    this.stzTugEnd(true); this.stzSulkEnd(true); this.stzLeap = null;
    for (const c of this.stzClouds || []) c.h.end(); this.stzClouds = [];
    for (const [e, m] of this.stzMopes || []) { if (e.cursedMul === m.mul) e.cursedMul = 1; m.h?.end(); } this.stzMopes?.clear();
    for (const t of this.stzTethers || []) t.h.end(); this.stzTethers = [];
    this.stzWardEnd(true);
    const B = this.G.vfx?.stz?._bones; for (const s of this.stzBoneShots || []) B?.remove(s.s); this.stzBoneShots = [];
    this.stzLanternEnd();
    for (const a of this.stzAllies || []) a.expire(true); this.stzAllies = [];
    for (const x of this.stzTomes || []) x.h.end(); this.stzTomes = [];
    if (this.channel?.id === 'maelstrom') this.endChannel();
  },
};
export function installShihtzuArts(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
