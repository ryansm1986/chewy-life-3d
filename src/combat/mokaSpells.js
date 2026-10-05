// Moka's spells: SkillRunner cast implementations (`cast_<id>(R, aim, target)`) plus the per-frame state they need
// (Moonbeam channel, runes, bubble, leash yanks, Puddle Hop, the Great Wave surf and sweep, summons, timers).
// installMokaSpells(SkillRunner.prototype) mixes these in; skillRunner.js calls updateMoka(dt) / clearMoka() and
// routes the staff basic attack to cast_staffBolt. Visuals live in gfx/spellFx.js, sounds in audio/sfx.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import { spellFx, setSpellGame, PAL } from '../gfx/spellFx.js';
import { DuckDecoy, SpiritRetriever } from './allies.js';
import { STAFF_GRIP, setStaffGlow } from '../actors/heroGear.js';
import { perkAt } from '../rpg/charge.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const FOES = [];
// staff angle (radians from upright, + = pointing forward) through each cast (t = 0..1 of the action)
const STAFF = {
  staffBolt: t => 0.15 + 1.05 * Math.sin(clamp((t - 0.25) / 0.5) * Math.PI),
  staffCast: t => (t < 0.45 ? -0.25 * (t / 0.45) : -0.25 + 1.45 * Math.sin(clamp((t - 0.45) / 0.55) * Math.PI * 0.8)),
  skyCast: t => 0.05 * Math.sin(t * 8),
  beam: () => 0,
  wetShake: t => 0.3 + Math.sin(t * 40) * 0.25,
  summon: t => (t < 0.62 ? (t / 0.62) * TAU * 2 : 1.1 * Math.sin(clamp((t - 0.62) / 0.38) * Math.PI)),
  yank: t => (t < 0.3 ? 1.3 * (t / 0.3) : t < 0.58 ? 1.3 : 1.3 - 1.8 * clamp((t - 0.58) / 0.2) + 0.5 * clamp((t - 0.8) / 0.2)),
  puddleHop: () => 0.2,
  surf: t => 0.55 + Math.sin(t * 9) * 0.1,
  duckCall: t => 0.4 + 0.3 * Math.sin(t * 20) * clamp((t - 0.3) / 0.2),
};

const M = {
  fx() { return spellFx(this.G); },
  castRate() { return clamp(this.G.derived?.castMul || 1, 0.5, 2.5); },
  /** world position of the staff's orb (spell origin); falls back to the hand / chest */
  staffTip(out = new THREE.Vector3()) {
    const P = this.G.player, orb = P.staff?.userData?.orb;
    if (orb && orb.parent) { orb.getWorldPosition(out); if (out.y > P.pos.y + 0.3 && out.distanceToSquared(P.pos) < 9) return out; }
    const h = P.rig?.parts?.handR;
    if (h) { h.getWorldPosition(out); out.y += 0.55; return out; }
    return out.copy(P.pos).addScaledVector(this.forward(), 0.4).setY(P.pos.y + 1.2);
  },
  /** a projectile launch point: the orb, held to a sensible flight height */
  launchPoint(out = new THREE.Vector3()) {
    const P = this.G.player; this.staffTip(out);
    out.y = clamp(out.y, P.pos.y + 0.75, P.pos.y + 1.25);
    return out;
  },
  ground(p) { p.y = this.G.world.heightAt(p.x, p.z); return p; },
  /** aim point clamped to range (and to open floor along the way when walls matter) */
  clampAim(aim, range) {
    const P = this.G.player, d = dist(aim.x, aim.z, P.pos.x, P.pos.z), out = aim.clone();
    if (d > range) { out.x = P.pos.x + (aim.x - P.pos.x) / d * range; out.z = P.pos.z + (aim.z - P.pos.z) / d * range; }
    return this.ground(out);
  },
  foesNear(x, z, r, out = FOES) {
    out.length = 0;
    for (const e of this.combat.entities) if (isFoe(e) && Math.hypot(e.pos.x - x, e.pos.z - z) < r + (e.radius || 0.3)) out.push(e);
    return out;
  },
  /** the clicked monster, else the one nearest the aim point (within `range` of Moka) */
  pickFoe(aim, target, range) {
    const P = this.G.player;
    if (target && isFoe(target) && dist(target.pos.x, target.pos.z, P.pos.x, P.pos.z) < range + (target.radius || 0.3)) return target;
    let best = null, bs = 1e9;
    for (const e of this.combat.entities) {
      if (!isFoe(e) || dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) > range + (e.radius || 0.3)) continue;
      const d = dist(e.pos.x, e.pos.z, aim.x, aim.z);
      if (d < 3 + (e.radius || 0.3) && d < bs) { bs = d; best = e; }
    }
    return best;
  },
  /** hit + statuses (chill/slow, stun → dizzy stars) */
  mokaHit(e, { dmgPct, element = 'phys', knock = 0, stun = 0, from = null, chill = 0, chillDur = 0, slow = 0, slowDur = 1, source = 'player', silent = false }) {
    if (!e.alive) return 0;
    const dmg = this.combat.hitMonster(e, { dmgPct, element, knock, stun, from: from || this.G.player.pos, source, silent });
    if (e.breakable) return dmg; // pots: no statuses, no dizzy stars
    if (chill && e.alive) { e.applyStatus?.('slow', chillDur || 1.5, chill); this.fx().chill(e); }
    if (slow && e.alive) e.applyStatus?.('slow', slowDur, slow);
    if (stun && e.alive && !e.def?.boss) this.fx().dizzy(e, stun);
    return dmg;
  },
  nova2(x, z, r, fn) { this.combat.inRadius(x, z, r, 'ally', fn); },
  after(delay, fn) { (this.timers ||= []).push({ t: delay, fn }); },
  /** drag a foe toward (cx, cz) by up to `step` m (bosses barely budge), collision-safe */
  pullFoe(e, cx, cz, step, minD = 0.4) {
    if (e.def?.boss) step *= 0.1;
    const dx = cx - e.pos.x, dz = cz - e.pos.z, d = Math.hypot(dx, dz);
    if (d <= minD || step <= 0) return;
    const s = Math.min(step, d - minD);
    _t.copy(e.pos); e.pos.x += dx / d * s; e.pos.z += dz / d * s;
    (e.world || this.G.world).collision?.resolve(e.pos, (e.radius || 0.3) * 0.8, _t);
  },
  playCast(name, onCast, ev = 'cast', speed = 1) {
    const P = this.G.player;
    P.anim.play(name, { speed: speed * this.castRate(), onEvent: e => { if (e === ev) onCast(); } });
  },
  /** a sparkle burst at the orb and a brighter orb for a moment */
  tipFlash(color = PAL.sea, size = 1) { this.fx().castFlash(this.staffTip(_w), color, size); this.staffGlowK = 2.8; },
  faceTo(p) { const P = this.G.player; P.faceTarget = P.facing = Math.atan2(p.x - P.pos.x, p.z - P.pos.z); },

  // ================================================================== basic attack: sparkle bolt
  cast_staffBolt(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('staffBolt', { speed: this.attacksPerSec() * 0.45, onEvent: ev => {
      if (ev !== 'release') return;
      const from = this.launchPoint(), to = target?.alive ? target.pos : aim;
      const dir = _v.set(to.x - from.x, 0, to.z - from.z); if (dir.lengthSq() < 0.01) dir.copy(this.forward()); dir.normalize();
      this.tipFlash(PAL.sea, 0.7);
      sfx('moka_bolt');
      const pr = this.combat.spawn({ team: 'ally', kind: 'sparkbolt', pos: from, dir, speed: p.speed || 15, range: p.range || 11, radius: 0.3, pierce: p.pierce || 0, homing: target?.alive ? 3 : 0,
        onHit: e => { this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: p.element || 'phys', knock: 0.2, from: P.pos }); this.fx().starBurst(e.pos.clone().setY(e.pos.y + (e.height || 1) * 0.55), { r: 0.55, n: 6, color: PAL.sea, color2: PAL.lilac }); },
        onEnd: (pr2, hit) => { if (!hit) this.fx().sparkBurst(pr2.pos, { n: 6, color: PAL.sea, speed: 2, size: 0.24 }); } });
      if (target?.alive) pr.homeTarget = target;
    } });
  },

  // ================================================================== TIDEWATER
  cast_splash(R, aim, target) {
    const P = this.G.player, p = R.params;
    this.playCast('staffCast', () => {
      const from = this.launchPoint(), to = target?.alive ? target.pos : aim;
      const dir = _v.set(to.x - from.x, 0, to.z - from.z); if (dir.lengthSq() < 0.01) dir.copy(this.forward()); dir.normalize();
      this.tipFlash(PAL.aqua, 0.9); sfx('splash_cast');
      const burst = (pos, primary) => {
        const g = this.ground(pos.clone());
        this.fx().splash(g, { r: p.splashRadius });
        sfx('water_splash', { pos: g, vol: 0.8 });
        this.nova2(g.x, g.z, p.splashRadius, e => { if (e !== primary) this.mokaHit(e, { dmgPct: p.dmgPct * p.splashPct / 100, element: 'frost', knock: 0.3, from: g, chill: p.chill, chillDur: p.chillDur }); });
      };
      const pr = this.combat.spawn({ team: 'ally', kind: 'waterorb', pos: from, dir, speed: p.speed, range: p.range, radius: 0.32,
        onHit: e => { pr._hitE = e; this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', knock: 0.5, from: P.pos, chill: p.chill, chillDur: p.chillDur }); burst(e.pos, e); },
        onEnd: (pr2) => { if (!pr2._hitE) burst(pr2.pos, null); } });
    });
  },
  cast_bubble(R) {
    const G = this.G, P = G.player, p = R.params;
    this.playCast('staffCast', () => {
      this.popBubble(true);
      const h = this.fx().bubble(out => out.copy(P.pos));
      this.bubbleShield = { hp: p.absorb, max: p.absorb, t: p.duration, h, p };
      sfx('bubble_up');
      this.tipFlash(PAL.aqua, 1.2);
      G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.8), `Bubble! (${p.absorb})`, { kind: 'status', color: '#9ff6ff' });
    });
  },
  /** combat.hitPlayer asks this first: the bubble soaks up hits; returns the damage that gets through */
  absorb(dmg) {
    const B = this.bubbleShield; if (!B || dmg <= 0) return dmg;
    const take = Math.min(B.hp, dmg); B.hp -= take; B.h.hit(); sfx('bubble_hit', { vol: 0.6 });
    if (B.hp <= 0.5) this.popBubble(false);
    return dmg - take;
  },
  popBubble(silent) {
    const B = this.bubbleShield; if (!B) return; this.bubbleShield = null;
    const P = this.G.player, p = B.p;
    if (silent) { B.h.end(); return; }
    B.h.pop(); sfx('bubble_pop');
    this.G.engine.rig.shake(0.25);
    this.nova2(P.pos.x, P.pos.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', knock: p.knockback, from: P.pos, chill: p.chill, chillDur: p.chillDur }));
  },
  cast_shake(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('wetShake', { speed: this.castRate(), onEvent: ev => {
      if (ev !== 'shake') return;
      this.fx().shakeSpray(P.pos, p.radius); sfx('shake_spray');
      G.engine.rig.shake(0.3);
      this.nova2(P.pos.x, P.pos.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', knock: p.knockback, from: P.pos, chill: p.chill, chillDur: p.chillDur }));
    } });
  },
  cast_puddleHop(R, aim) {
    const G = this.G, P = G.player, p = R.params, W = G.world;
    const rt = this.returnTrip; // (Return Trip: hop back to the charged hop's dive puddle, free — docs/CHARGE.md)
    if (rt && rt.until > (this.charge?.clock || 0)) { this.returnTrip = null; aim = rt.pos; G.actions.restoreZoom?.(R.cost); this.cds.puddleHop = 0; rt.h?.end?.(); }
    const dir = _v.set(aim.x - P.pos.x, 0, aim.z - P.pos.z); const want = Math.min(p.range, dir.length()); if (dir.lengthSq() < 1e-4) dir.copy(this.forward()); dir.normalize();
    const start = P.pos.clone(), end = P.pos.clone();
    for (let t = 0.25; t <= want + 1e-6; t += 0.25) { // furthest open floor along the line (walls stop the hop)
      const x = start.x + dir.x * t, z = start.z + dir.z * t;
      if (W.collision?.solidAt?.(x, z, P.radius * 0.8) || (W.walkable && !W.walkable(x, z))) break;
      end.set(x, 0, z);
    }
    this.ground(end);
    this.hop = { start, end, p };
    P.invuln = true; P.moveTarget = null;
    P.anim.play('puddleHop', { speed: this.castRate(), onEvent: ev => {
      const fx = this.fx();
      if (ev === 'dive') { fx.puddle(start, { r: 0.85, life: 0.9 }); fx.splash(start, { r: 0.9 }); sfx('puddle_dive'); }
      else if (ev === 'under') { fx.puddle(end, { r: 0.95, life: 1.2 }); P.pos.copy(end); P.sync?.(); }
      else if (ev === 'pop') {
        P.invuln = false; this.hop = null;
        fx.splash(end, { r: 1.4, big: true }); sfx('puddle_pop'); G.engine.rig.shake(0.2);
        this.nova2(end.x, end.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', knock: p.knockback, from: end, chill: p.chill, chillDur: p.chillDur }));
      } else if (ev === 'end') { P.invuln = false; this.hop = null; }
    } });
  },
  cast_whirlpool(R, aim) {
    const p = R.params, at = this.clampAim(aim, p.range);
    this.playCast('staffCast', () => {
      const h = this.fx().whirlpool(at, p.radius, p.duration);
      sfx('whirlpool', { pos: at });
      const zone = this.combat.addZone({ pos: at.clone(), radius: p.radius, life: p.duration, tick: p.tick, mokaFx: h, swirlT: 0,
        update: (dt, z) => {
          const r = p.radius * 1.2;
          for (const e of this.foesNear(z.pos.x, z.pos.z, r)) { const d = dist(e.pos.x, e.pos.z, z.pos.x, z.pos.z); this.pullFoe(e, z.pos.x, z.pos.z, p.pull * dt * (0.45 + 0.55 * clamp(d / r)), 0.35); }
          z.swirlT += dt; if (z.swirlT > 1.1 && z.t < z.life - 0.6) { z.swirlT = 0; sfx('whirlpool', { pos: z.pos, vol: 0.45 }); }
        },
        onTick: z => this.nova2(z.pos.x, z.pos.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', from: z.pos, chill: p.chill, chillDur: 1, silent: false })),
        dispose: () => h.end(), cancel: () => h.end() });
      (this.mokaZones ||= []).push(zone);
    });
  },
  cast_greatWave(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const dir = new THREE.Vector3(aim.x - P.pos.x, 0, aim.z - P.pos.z); if (dir.lengthSq() < 1e-4) dir.copy(this.forward()); dir.normalize();
    this.faceTo(_v.copy(P.pos).add(dir));
    P.anim.play('surf', { speed: 1, onEvent: ev => {
      if (ev !== 'wave') return;
      const origin = P.pos.clone().addScaledVector(dir, -0.6);
      const h = this.fx().greatWave(origin, dir, { length: p.length, width: p.width, speed: p.speed });
      sfx('wave_roar'); G.engine.rig.shake(0.35);
      this.surf = { dir, left: p.surf, t: 0 };
      this.waves = (this.waves || []).filter(w => w.h.alive);
      this.waves.push({ h, origin, dir, p, hit: new Set(), side: new THREE.Vector3(dir.z, 0, -dir.x) });
    } });
  },

  // ================================================================== STARLIGHT KIBBLE
  cast_kibble(R, aim, target) {
    const P = this.G.player, p = R.params;
    this.playCast('staffBolt', () => {
      const from = this.launchPoint(), foes = [];
      if (target && isFoe(target)) foes.push(target);
      const near = this.foesNear(P.pos.x, P.pos.z, p.range * 0.85).filter(e => e !== target);
      near.sort((a, b) => dist(a.pos.x, a.pos.z, aim.x, aim.z) - dist(b.pos.x, b.pos.z, aim.x, aim.z));
      for (const e of near) { if (foes.length >= p.count) break; foes.push(e); }
      const base = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
      this.tipFlash(PAL.gold, 1); sfx('kibble_toss');
      for (let i = 0; i < p.count; i++) {
        const tgt = foes.length ? foes[i % foes.length] : null;
        const a = base + (p.count > 1 ? (i / (p.count - 1) - 0.5) * 1.6 : 0);
        this.after(i * 0.045, () => {
          const pr = this.combat.spawn({ team: 'ally', kind: 'kibble', pos: from.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: p.speed, range: p.range, radius: 0.28, homing: tgt ? p.homing : 0,
            onHit: e => { this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', knock: 0.15, from: P.pos }); this.fx().starBurst(_u.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), { r: 0.7, n: 7 }); sfx('kibble_hit', { pos: e.pos }); },
            onEnd: (pr2, hit) => { if (!hit) this.fx().starBurst(pr2.pos, { r: 0.45, n: 4 }); } });
          pr.homeTarget = tgt;
        });
      }
    }, 'release');
  },
  cast_squeak(R) {
    const G = this.G, P = G.player, p = R.params;
    this.playCast('skyCast', () => {
      const at = P.pos.clone();
      this.fx().squeak(at, p.radius, 2.1);
      this.after(0.16, () => {
        sfx('squeak_big'); G.engine.rig.shake(0.3);
        this.nova2(at.x, at.z, p.radius, e => this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', knock: p.knockback, stun: p.stun, from: at }));
      });
    }, 'cast', 1.25);
  },
  cast_pawRune(R, aim) {
    const p = R.params, at = this.clampAim(aim, p.range);
    this.playCast('staffCast', () => {
      this.runes = (this.runes || []).filter(r => r.alive);
      while (this.runes.length >= p.maxRunes) { const old = this.runes.shift(); old.alive = false; old.h.end(); }
      this.runes.push({ pos: at, h: this.fx().pawRune(at, 1.15), t: 0, p, alive: true });
      sfx('rune_stamp', { pos: at });
    });
  },
  cast_moonbeam(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    if (this.channel?.id === 'moonbeam') return;
    const at = this.clampAim(aim, p.range);
    const beam = this.fx().moonbeam(p.radius); beam.pos.copy(at);
    this.channel = { id: 'moonbeam', R, acc: 1 / p.ticksPerSec, t: 0, beam, hum: 0, end: () => beam.end() };
    P.anim.play('beam'); P.canMoveWhileActing = true;
    sfx('moonbeam_start'); G.vfx.light(at.clone().setY(at.y + 1), '#d8d8ff', 10, 6, 0.3);
    this.tipFlash(PAL.moon, 1.3);
  },
  /** the channel tick for Moonbeam (skillRunner.update → here while it's held) */
  updateMoonbeam(dt, input) {
    const G = this.G, P = G.player, c = this.channel, p = c.R.params;
    // held (or Toggle-held); a charged beam let go lingers on its own for p.linger s, then bursts (docs/CHARGE.md)
    const held = input.holding('moonbeam') || c.toggleHeld, out = !held && c.spinOut > 0;
    if (out) c.spinOut -= dt;
    if ((!held && !out) || G.playerDead || P.anim.action?.name !== 'beam') { if (c.R.charge && c.spinOut !== undefined && !G.playerDead) this.beamFinish(c); return this.endChannel(); }
    c.t += dt; c.acc += dt; c.hum -= dt;
    const aim = this.aimOverride || G.engine.mouseGround(Input.mouse.nx, Input.mouse.ny, (x, z) => G.world.heightAt(x, z));
    const tgt = this.clampAim(aim, p.range), b = c.beam.pos;
    const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz), step = Math.min(d, p.follow * dt);
    if (d > 1e-3) { b.x += dx / d * step; b.z += dz / d * step; }
    b.y = G.world.heightAt(b.x, b.z);
    P.faceTarget = Math.atan2(b.x - P.pos.x, b.z - P.pos.z);
    if (c.hum <= 0) { c.hum = 0.42; sfx('moonbeam_hum', { vol: 0.7 }); }
    const iv = 1 / p.ticksPerSec;
    // Twin Moons: from Stage Ⅱ a smaller beam circles the charged one (docs/CHARGE.md)
    const twin = c.R.charge?.stage >= 2 ? perkAt(c.R, 'twin') : null;
    if (twin) {
      if (!c.twin) { c.twin = this.fx().moonbeam(p.radius * 0.6, 0.7); const e0 = c.end; c.end = () => { e0?.(); c.twin?.end(); }; }
      const a = c.t * 2.2; c.twin.pos.set(b.x + Math.cos(a) * 1.8, 0, b.z + Math.sin(a) * 1.8); c.twin.pos.y = G.world.heightAt(c.twin.pos.x, c.twin.pos.z);
    }
    if (c.acc >= iv) {
      c.acc -= iv;
      if (twin) this.nova2(c.twin.pos.x, c.twin.pos.z, p.radius * 0.6, e => this.mokaHit(e, { dmgPct: p.dmgPct * twin.pct / 100, element: 'zap', from: c.twin.pos, slow: p.slow, slowDur: 0.6, silent: false }));
      if (!out && !G.actions.spendZoom(c.R.cost * iv)) { this.endChannel(); G.ui?.float?.(P.pos.clone().setY(1.6), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); return; }
      let n = 0;
      this.nova2(b.x, b.z, p.radius, e => { n++; this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', from: b, slow: p.slow, slowDur: 0.6, silent: false }); });
      if (n) { this.fx().starBurst(_u.set(b.x, b.y + 0.4, b.z), { r: 0.5, n: 4, color: PAL.moon, color2: PAL.violet, ink: false }); sfx('moonbeam_tick', { vol: 0.5 }); }
    }
  },
  /** a charged Moonbeam fades out in a burst of moonlight where it stood */
  beamFinish(c) {
    const G = this.G, P = G.player, p = c.R.params, b = c.beam.pos;
    this.fx().starBurst(_u.set(b.x, b.y + 0.4, b.z), { r: 1.2, n: 16, color: PAL.moon, color2: PAL.violet });
    G.vfx.charge?.burst?.(b, { r: 2.2, life: 0.4, color: PAL.moon, w: 0.12 });
    sfx('rune_chime', { pos: b }); G.engine.rig.shake(0.2);
    this.nova2(b.x, b.z, 2, e => this.mokaHit(e, { dmgPct: p.dmgPct * (p.burstPct || 70) / 100, element: 'zap', from: b, knock: 0.6 }));
    // Crescent Cut: the beam's end sweeps out in a crescent of moonlight
    const cut = perkAt(c.R, 'crescent');
    if (cut) {
      const o = b.clone(), f = Math.atan2(b.x - P.pos.x, b.z - P.pos.z), hit = new Set();
      G.vfx.charge?.crescent?.(o, f, { arc: 5.6, r0: 0.6, r1: cut.r, life: 0.5, color: '#dfe6ff', width: 0.8, onStep: (r0, r1) => this.nova2(o.x, o.z, r1, e => { if (hit.has(e) || dist(e.pos.x, e.pos.z, o.x, o.z) + (e.radius || 0.3) < r0) return; hit.add(e); this.mokaHit(e, { dmgPct: p.dmgPct * cut.pct / 100, element: 'zap', from: o, knock: 0.8 }); }) });
      sfx('constellation_twinkle', { pitch: 0.8 });
    }
  },
  cast_constellation(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    const first = this.pickFoe(aim, target, p.range);
    if (!first) { G.actions.restoreZoom?.(R.cost); this.cds.constellation = 0; this.fx().sparkBurst(this.staffTip(_w), { n: 8, color: PAL.violet }); G.ui?.float?.(P.pos.clone().setY(1.8), 'No stars to link!', { kind: 'status', color: '#c8b0ff' }); sfx('ui_error'); return; }
    this.faceTo(first.pos);
    this.playCast('staffCast', () => {
      const fx = this.fx(), K = fx.constellation(), tip = { pos: this.staffTip(new THREE.Vector3()).clone(), alive: true, height: 0 };
      K.node(tip); tip.height = 0; tip.pos.y -= 0; // (the first node sits on the orb)
      const chain = [first], seen = new Set([first]);
      let cur = first;
      for (let i = 1; i < p.links; i++) {
        let best = null, bd = p.linkRange;
        for (const e of this.combat.entities) { if (!isFoe(e) || seen.has(e)) continue; const d = dist(e.pos.x, e.pos.z, cur.pos.x, cur.pos.z); if (d < bd) { bd = d; best = e; } }
        if (!best) break; chain.push(best); seen.add(best); cur = best;
      }
      let prev = tip;
      chain.forEach((e, i) => this.after(i * 0.085, () => {
        const n = K.node(e); K.link(prev, n); prev = n;
        sfx('star_chain', { pos: e.pos, pitch: 1 + i * 0.08 });
        this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', from: P.pos, slow: p.slow, slowDur: 1.2 });
      }));
      const tw = chain.length * 0.085 + 0.4;
      this.after(tw, () => { K.twinkle(); sfx('constellation_twinkle'); for (const e of chain) if (e.alive) this.mokaHit(e, { dmgPct: p.dmgPct * p.twinklePct / 100, element: 'zap', from: P.pos }); });
      this.after(tw + 0.35, () => K.end());
      (this.mokaFx ||= []).push(K);
    });
  },
  cast_meteor(R, aim) {
    const G = this.G, P = G.player, p = R.params, to = this.clampAim(aim, p.range);
    this.playCast('skyCast', () => {
      const cam = G.engine.camera, cr = _v.setFromMatrixColumn(cam.matrixWorld, 0), cf = _w.set(to.x - cam.position.x, 0, to.z - cam.position.z).normalize();
      const from = to.clone().addScaledVector(cf, -3).addScaledVector(cr, -7.5); from.y = to.y + 10.5; // streaks in across the screen
      sfx('meteor_whistle');
      this.tipFlash(PAL.gold, 1.4);
      const h = this.fx().meteor(from, to, { time: p.delay, r: p.radius, scale: p.size || 1, onImpact: at => {
        sfx('meteor_boom'); G.engine.rig.shake(0.9); G.engine.hitStop = Math.max(G.engine.hitStop, 0.07); G.engine.post.pulse('#ffd8a0', 0.28);
        this.nova2(at.x, at.z, p.radius, e => {
          const dmg = this.mokaHit(e, { dmgPct: p.dmgPct, element: 'zap', knock: p.knockback, stun: p.stun, from: at });
          if (e.alive && dmg) e.applyStatus?.('burn', p.burnDuration, dmg * p.burnPct / 100 / Math.max(1, p.dmgPct / 100));
        });
        const z = this.combat.addZone({ pos: at.clone(), radius: p.radius * 0.7, life: p.burnDuration, tick: 0.5,
          update: () => { if (Math.random() < 0.35) G.vfx.fire(_t.set(at.x + rand(-1, 1) * p.radius * 0.5, at.y, at.z + rand(-1, 1) * p.radius * 0.5), 1, { size: 0.5 }); },
          onTick: zz => this.nova2(zz.pos.x, zz.pos.z, zz.radius, e => e.applyStatus?.('burn', 1.2, Math.max(2, G.derived.dmgMax * p.burnPct / 100))) });
        (this.mokaZones ||= []).push(z);
      } });
      (this.mokaFx ||= []).push(h);
    }, 'cast', 1.1);
  },

  // ================================================================== DUCK HUNT
  cast_duckDecoy(R, aim) {
    const G = this.G, P = G.player, p = R.params, to = this.clampAim(aim, p.range);
    this.playCast('summon', () => {
      this.ducks = (this.ducks || []).filter(x => x.alive);
      while (this.ducks.length >= p.maxDecoys) this.ducks.shift().pop();
      const from = this.ground(P.pos.clone().addScaledVector(this.forward(), 0.7));
      this.ducks.push(new DuckDecoy(G, from, to, p));
      sfx('duck_windup'); this.tipFlash(PAL.duck, 1);
    }, 'summon');
  },
  cast_fetchLeash(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    const foe = this.pickFoe(aim, target, p.range);
    let loot = null;
    if (!foe) {
      const L = G.mode === 'dungeon' ? G.dungeon?.loot : G.villageLoot;
      let bd = 2.2;
      for (const e of L?.list || []) { if (e.t < e.fly) continue; const d = dist(e.to.x, e.to.z, aim.x, aim.z); if (d < bd && dist(e.to.x, e.to.z, P.pos.x, P.pos.z) < p.lootRange) { bd = d; loot = e; } }
      if (!loot) { G.actions.restoreZoom?.(R.cost); this.cds.fetchLeash = 0; G.ui?.float?.(P.pos.clone().setY(1.8), 'Nothing to fetch!', { kind: 'status', color: '#ffc080' }); sfx('ui_error'); return; }
    }
    const tgtPos = foe ? foe.pos : loot.to;
    this.faceTo(tgtPos);
    const lootH = { pos: loot?.to, alive: true, height: 0.35 };
    const who = foe || lootH;
    P.anim.play('yank', { speed: this.castRate(), onEvent: ev => {
      const fx = this.fx();
      if (ev === 'lash') {
        if (!who.alive && who !== lootH) return;
        const h = fx.leash(out => this.staffTip(out), out => out.set(who.pos.x, who.pos.y + (who.height || 1) * 0.62, who.pos.z));
        this.leashH = { h, who, foe, loot, t: 0, p, phase: 'out' };
        if (foe) fx.collar(foe, 1.0);
        sfx('leash_throw');
      } else if (ev === 'yank' && this.leashH) {
        const L = this.leashH; L.phase = 'yank'; L.t = 0;
        L.from = (foe ? foe.pos : loot.to).clone();
        L.dest = P.pos.clone().addScaledVector(this.forward(), 1.1 + (foe?.radius || 0.3));
        sfx('leash_snap'); G.engine.rig.shake(0.2);
        if (foe?.def?.boss) { L.phase = 'hold'; L.t = 0; this.mokaHit(foe, { dmgPct: p.dmgPct, from: P.pos, stun: p.stun }); }
      }
    } });
  },
  cast_feathers(R, aim) {
    const P = this.G.player, p = R.params;
    this.playCast('staffBolt', () => {
      const from = this.launchPoint(), base = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z), spread = p.spread * Math.PI / 180;
      this.fx().featherBurst(this.staffTip(_w), 6); sfx('feather_flutter');
      for (let i = 0; i < p.count; i++) {
        const a = base + (p.count > 1 ? (i / (p.count - 1) - 0.5) * spread : 0) + rand(-0.04, 0.04);
        this.combat.spawn({ team: 'ally', kind: 'feather', pos: from.clone(), dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), speed: p.speed * rand(0.92, 1.08), range: p.range * rand(0.9, 1.05), radius: 0.26, pierce: p.pierce,
          onHit: e => { this.mokaHit(e, { dmgPct: p.dmgPct, from: P.pos, knock: 0.25 }); this.fx().featherBurst(_u.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), 4); } });
      }
    }, 'release', 1.2);
  },
  cast_duckCall(R, aim) {
    const G = this.G, P = G.player, p = R.params, at = this.clampAim(aim, p.range);
    P.anim.play('duckCall', { speed: this.castRate(), onEvent: ev => {
      if (ev !== 'cast') return;
      this.fx().lure(at, p.radius, p.pullTime + 0.8);
      sfx('duck_call'); this.after(0.12, () => sfx('quack', { pitch: 0.9 }));
      const grabbed = this.foesNear(at.x, at.z, p.radius).map(e => ({ e, from: e.pos.clone() }));
      const z = this.combat.addZone({ pos: at.clone(), life: p.pullTime + 0.05, tick: 0,
        update: (dt, zz) => {
          const k = Math.min(1, zz.t / p.pullTime), ek = 1 - (1 - k) * (1 - k);
          for (const g of grabbed) {
            if (!g.e.alive || g.e.def?.boss) continue;
            const ang = Math.atan2(g.from.z - at.z, g.from.x - at.x), rr = 0.55 + (g.e.radius || 0.3);
            const tx = at.x + Math.cos(ang) * rr, tz = at.z + Math.sin(ang) * rr;
            _t.copy(g.e.pos); g.e.pos.x = g.from.x + (tx - g.from.x) * ek; g.e.pos.z = g.from.z + (tz - g.from.z) * ek;
            (g.e.world || G.world).collision?.resolve(g.e.pos, (g.e.radius || 0.3) * 0.8, _t);
            if (Math.random() < 0.5) G.vfx.dust(g.e.pos, { n: 1 });
          }
        },
        dispose: () => {
          G.engine.rig.shake(0.25); sfx('quack', { pitch: 1.2 });
          for (const g of grabbed) if (g.e.alive) this.mokaHit(g.e, { dmgPct: p.dmgPct, from: at, stun: p.stun });
        } });
      (this.mokaZones ||= []).push(z);
    } });
  },
  cast_spiritRetriever(R) {
    const G = this.G, P = G.player, p = R.params;
    this.playCast('summon', () => {
      const pos = this.ground(P.pos.clone().addScaledVector(this.forward(), 1.2));
      if (this.retriever?.alive) this.retriever.refresh(p);
      else this.retriever = new SpiritRetriever(G, pos, p);
      sfx('spirit_summon');
      this.after(0.35, () => sfx('retriever_bark'));
    }, 'summon');
  },
  cast_mallards(R, aim) {
    const G = this.G, P = G.player, p = R.params, center = this.clampAim(aim, p.range);
    this.playCast('skyCast', () => {
      const pts = this.foesNear(center.x, center.z, p.area).slice(0, p.count).map(e => this.ground(e.pos.clone()));
      sfx('mallard_wings'); this.after(0.3, () => sfx('quack', { pitch: 1.15 })); this.after(0.55, () => sfx('quack', { pitch: 0.95 }));
      const h = this.fx().mallards({ from: P.pos.clone(), center, n: p.count, area: p.area, points: pts, onImpact: (at, i) => {
        sfx('water_splash', { pos: at, vol: 0.55, pitch: 1.2 });
        if (i % 2 === 0) G.engine.rig.shake(0.18);
        this.nova2(at.x, at.z, p.impactRadius, e => this.mokaHit(e, { dmgPct: p.dmgPct, from: at, knock: 0.6, stun: p.stun, source: 'player' }));
      } });
      (this.mokaFx ||= []).push(h);
    }, 'cast', 1.1);
  },

  // ================================================================== per frame
  updateMoka(dt) {
    const G = this.G, P = G.player;
    if (!P) return;
    // timers (kibble volleys, chain jumps, delayed hits)
    if (this.timers?.length) for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); try { t.fn(); } catch (e) { console.warn('[moka]', e); } } }
    // the staff points where the cast goes
    const a = P.anim.action, f = a && STAFF[a.name];
    if (f && P.staff) {
      const arm = P.rig.parts.armR, body = P.rig.parts.body, Rr = P.anim.rest, ra = Rr.get(arm), rb = Rr.get(body);
      if (ra && rb) { const tilt = (arm.rotation.x - ra.r.x) + (body.rotation.x - rb.r.x), u = a.def.hold ? a.t : clamp(a.t / a.dur); P.staff.rotation.x = STAFF_GRIP.rotation[0] + f(u) - tilt; }
    }
    if (P.staff) {
      const want = this.channel?.id === 'moonbeam' ? 2.2 : 1;
      if ((this.staffGlowK || 1) !== want) { this.staffGlowK = this.staffGlowK > want ? Math.max(want, this.staffGlowK - dt * 5) : want; setStaffGlow(P.staff, this.staffGlowK); }
    }
    // bubble barrier
    const B = this.bubbleShield;
    if (B) { B.t -= dt; if (B.t <= 0 || G.playerDead) this.popBubble(G.playerDead); }
    // paw runes
    if (this.runes?.length) for (let i = this.runes.length - 1; i >= 0; i--) {
      const r = this.runes[i]; r.t += dt;
      if (!r.alive) { this.runes.splice(i, 1); continue; }
      if (r.t > r.p.life) { r.alive = false; r.h.end(); this.runes.splice(i, 1); continue; }
      if (r.t < r.p.arm) continue;
      let trig = false;
      for (const e of this.combat.entities) if (isFoe(e) && Math.hypot(e.pos.x - r.pos.x, e.pos.z - r.pos.z) < r.p.trigger + (e.radius || 0.3)) { trig = true; break; }
      if (trig) {
        r.alive = false; this.runes.splice(i, 1); r.h.erupt(r.p.radius, r.soft);
        sfx('rune_chime', { pos: r.pos }); G.engine.rig.shake(0.3);
        this.nova2(r.pos.x, r.pos.z, r.p.radius, e => this.mokaHit(e, { dmgPct: r.p.dmgPct, element: 'zap', knock: 0.8, stun: r.p.stun, from: r.pos }));
        r.onErupt?.(r); // (Paw Parade)
      }
    }
    // leash
    const L = this.leashH;
    if (L) {
      L.t += dt;
      if (L.phase === 'out') { L.h.frac = Math.min(1, L.t / 0.12); L.h.sag = 0.9; if (L.t > 1.2) { L.h.snap(); this.leashH = null; } }
      else if (L.phase === 'hold') { L.h.frac = 1; L.h.sag = 0.05; if (L.t > 0.25) { L.h.snap(); this.leashH = null; } }
      else if (L.phase === 'yank') {
        L.h.frac = 1; L.h.sag = 0.05;
        const k = Math.min(1, L.t / 0.26), ek = k * k * (3 - 2 * k);
        if (L.foe) {
          const e = L.foe;
          if (!e.alive) { L.h.snap(); this.leashH = null; }
          else {
            _t.copy(e.pos); e.pos.x = L.from.x + (L.dest.x - L.from.x) * ek; e.pos.z = L.from.z + (L.dest.z - L.from.z) * ek;
            (e.world || G.world).collision?.resolve(e.pos, (e.radius || 0.3) * 0.8, _t);
            if (Math.random() < 0.6) G.vfx.dust(e.pos, { n: 1 });
            if (k >= 1) { L.h.snap(); this.leashH = null; this.mokaHit(e, { dmgPct: L.p.dmgPct, from: P.pos, stun: L.p.stun, knock: 0 }); this.fx().starBurst(_u.set(e.pos.x, e.pos.y + 0.8, e.pos.z), { r: 0.8, n: 8, color: PAL.orange, color2: PAL.duck }); sfx('bark_small', { pitch: 1.5 }); }
          }
        } else if (L.loot) {
          const e = L.loot; e.to.x = L.from.x + (L.dest.x - L.from.x) * ek; e.to.z = L.from.z + (L.dest.z - L.from.z) * ek; e.to.y = G.world.heightAt(e.to.x, e.to.z);
          if (e.beam?.obj) e.beam.obj.position.set(e.to.x, e.to.y, e.to.z);
          if (e.light) e.light.pos.set(e.to.x, e.to.y + 1, e.to.z);
          if (k >= 1) { L.h.snap(); this.leashH = null; const Lo = G.mode === 'dungeon' ? G.dungeon?.loot : G.villageLoot; if (Lo?.list.includes(e)) Lo.tryPickup(e, true); sfx('pickup_item'); }
        }
      }
    }
    // Great Wave: the surf ride, then the sweep
    if (this.surf) {
      const s = this.surf; s.t += dt;
      const step = Math.min(s.left, 5 * dt);
      if (step > 0 && P.anim.action?.name === 'surf') {
        _t.copy(P.pos); P.pos.addScaledVector(s.dir, step); s.left -= step;
        G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
      } else this.surf = null;
    }
    if (this.waves?.length) for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i], h = w.h, p = w.p;
      if (!h.alive) { this.waves.splice(i, 1); continue; }
      const fx = w.origin.x + w.dir.x * h.front, fz = w.origin.z + w.dir.z * h.front;
      if (h.fallAt < 0 && h.front > 2 && G.world.collision?.solidAt?.(fx + w.dir.x * 0.6, fz + w.dir.z * 0.6, 0.1)) h.stop();
      const falling = h.fallAt >= 0;
      for (const e of this.combat.entities) {
        if (!isFoe(e) && !(e.alive && e.breakable)) continue;
        const rx = e.pos.x - w.origin.x, rz = e.pos.z - w.origin.z, along = rx * w.dir.x + rz * w.dir.z, lat = rx * w.side.x + rz * w.side.z;
        if (Math.abs(lat) > p.width / 2 + (e.radius || 0.3) || along > h.front + 0.5 || along < h.front - 2.2) continue;
        if (!w.hit.has(e)) { w.hit.add(e); this.mokaHit(e, { dmgPct: p.dmgPct, element: 'frost', knock: 0.6, from: w.origin, chill: p.chill, chillDur: p.chillDur }); }
        if (!falling && e.alive && !e.breakable && (!e.def?.boss || p.carry) && along < h.front + 0.7) { // carried along on the face of the wave (Tsunami: bosses too, a little)
          const push = Math.min(h.front + 0.7 - along, p.speed * 1.3 * dt) * (e.def?.boss ? 0.25 : 1);
          _t.copy(e.pos); e.pos.x += w.dir.x * push; e.pos.z += w.dir.z * push; (e.world || G.world).collision?.resolve(e.pos, (e.radius || 0.3) * 0.8, _t);
        }
      }
    }
    for (const x of this.ducks || []) x.update(dt);
    this.updateDucklings?.(dt); // (a charged Mother Duck's ducklings)
    if (this.retriever) { this.retriever.update(dt); if (!this.retriever.alive) this.retriever = null; }
    if (this.retrieverPup) { this.retrieverPup.update(dt); if (!this.retrieverPup.alive) this.retrieverPup = null; } // (Puppy Pal)
    if (this.mokaZones?.length) this.mokaZones = this.mokaZones.filter(z => z.t < z.life && this.combat.zones.includes(z));
    if (this.mokaFx?.length) this.mokaFx = this.mokaFx.filter(h => h.alive);
  },
  /** end every Moka effect (floor change, hero switch, death): the player's rig may be replaced right after */
  clearMoka() {
    const P = this.G.player;
    this.timers = [];
    if (this.hop) { this.hop = null; if (P) P.invuln = false; }
    this.surf = null;
    this.popBubble(true);
    for (const r of this.runes || []) { r.alive = false; r.h.end(); } this.runes = [];
    if (this.leashH) { this.leashH.h.snap(); this.leashH = null; }
    for (const w of this.waves || []) w.h.stop?.(); this.waves = [];
    for (const z of this.mokaZones || []) { z.cancel?.(); z.dispose = null; z.update = null; z.onTick = null; z.t = z.life; } this.mokaZones = [];
    for (const h of this.mokaFx || []) h.end?.(); this.mokaFx = [];
    for (const x of this.ducks || []) x.expire(true); this.ducks = [];
    for (const x of this.ducklings || []) x.expire(true); this.ducklings = [];
    for (const end of this.wraps || []) end(false); this.wraps = []; // (Bubble Wrap)
    if (this.retriever) { this.retriever.expire(true); this.retriever = null; }
    if (this.retrieverPup) { this.retrieverPup.expire(true); this.retrieverPup = null; }
    this.returnTrip = null;
  },
};

/** Mix Moka's cast implementations into SkillRunner.prototype (skillRunner.js does this at import). */
export function installMokaSpells(proto) { Object.assign(proto, M); }
export { setSpellGame };
