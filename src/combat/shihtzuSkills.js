// The Shih Tzu's skills (docs/SHIHTZU.md): SkillRunner cast implementations (`cast_<id>(R, aim, target)`) plus the
// per-frame state they need: the three-swing flail combo and its lunge, Woeful Wallop, Dripping Paw's flying curse and
// the hexes (gloom damage over time, stacking on a foe), the guard (combat.hitPlayer asks shihtzuGuard() before a blow
// lands: the class's damage reduction, Iron Topknot and the Gloom Blanket). installShihtzuSkills(proto) mixes these
// into SkillRunner; skillRunner.js routes the flail basic attack here (cast_flailSwing) and calls updateShihtzu(dt) /
// clearShihtzu(). The flail's rope and ball are a chain (actors/shihtzuGear.js): the poses pull it (shihtzuPoses.js),
// the hits land on the action's beat; the trail follows the real ball (gfx/shihtzuFx.js).
// Looks: gfx/shihtzuFx.js; poses: actors/shihtzuPoses.js; the flail: actors/shihtzuGear.js; sounds: audio/shihtzu.sfx.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import { stzFx, STZ_COL } from '../gfx/shihtzuFx.js';
import { flailBall } from '../actors/shihtzuGear.js';
import { BLANKET } from '../rpg/skillsShihtzu.js';
import { installShihtzuArts } from './shihtzuArts.js';
import { installChargedShihtzu } from './chargedShihtzu.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const SWINGS = ['flailSwing1', 'flailSwing2', 'flailSlam'];
const SWING_DUR = [0.5, 0.48, 0.62]; // (the actions' own durations: each swing takes one attack at his attack speed; the slam a little longer)
const SWING_SET = new Set([...SWINGS, 'wallop']);
const TRAIL_SET = new Set([...SWING_SET, 'sulkSpin', 'sigh', 'tugThrow', 'stzWhirl']); // (the moves whose ball draws a trail)
const LUNGE_SPEED = 9;
const GLOOM = '#5ce0c0';
const minorHit = e => (e.lifeMax || 0) * (e.def?.boss ? 0.015 : 0.05);

const M = {
  stzFx() { return stzFx(this.G); },
  /** the trail on the player's flail (made once per flail: a rig swap makes a new one) */
  stzTrail() {
    const F = this.G.player?.flail; if (!F) return null;
    if (this._stzTrailF !== F) { this._stzTrail?.end(); this._stzTrailF = F; this._stzTrail = this.stzFx().trail(F); }
    return this._stzTrail;
  },

  // ================================================================== basic attack: the three-swing flail combo
  cast_flailSwing(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    const now = G.engine.time || 0;
    if (now - (this.stzComboT ?? -9) > 1.4) this.stzCombo = 0;
    const k = (this.stzCombo || 0) % 3; this.stzCombo = (this.stzCombo || 0) + 1; this.stzComboT = now;
    const m = this.melee; this.melee = null; // (his own lunge below: skillRunner's tracks only Chewy's cuts)
    this.stzMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    const slam = k === 2, act = SWINGS[k];
    sfx('flail_whoosh', { pitch: slam ? 0.85 : 1 + k * 0.06, vol: 0.8 });
    P.anim.play(act, { speed: this.attacksPerSec() * SWING_DUR[k] * (slam ? 0.85 : 1), onEvent: ev => {
      if (ev !== 'hit') return;
      this.stzSnapIn(target, p.radius);
      const f = P.facing, fx = this.stzFx();
      const radius = slam ? p.radius * 0.92 : p.radius, arc = slam ? 110 : p.arc, mult = slam ? 1.35 : 1;
      let hit = 0;
      this.arcHit(P.pos, f, radius, arc, e => {
        this.combat.hitMonster(e, { dmgPct: p.dmgPct * mult, knock: p.knockback * (slam ? 2.2 : 1), stun: slam ? 0.2 : 0, from: P.pos });
        hit++;
      }, target);
      if (slam) { // the thud lands under the ball when it's down in front of him (else on his facing, 1.35 m out)
        const F = P.flail; if (F) flailBall(F, _w);
        const fwd = F ? (_w.x - P.pos.x) * Math.sin(f) + (_w.z - P.pos.z) * Math.cos(f) : 0;
        if (F && fwd > 0.6 && fwd < 2.4 && _w.y - P.pos.y < 0.6) _v.set(_w.x, 0, _w.z); else _v.set(P.pos.x + Math.sin(f) * 1.35, 0, P.pos.z + Math.cos(f) * 1.35);
        _v.y = G.world.heightAt?.(_v.x, _v.z) ?? P.pos.y;
        fx.thud(_v, 1, true); sfx('flail_thud'); G.engine.rig.shake(0.22);
      }
      if (hit) { sfx(slam ? 'flail_bonk' : 'flail_hit', { pitch: 1 + k * 0.05 }); if (!slam) G.engine.rig.shake(0.1); }
      this.stzMelee = null;
    } });
  },
  /** at the hit frame: close a small gap to the aimed-at foe (what's left of the lunge budget) */
  stzSnapIn(target, radius) {
    const m = this.stzMelee, G = this.G, P = G.player;
    if (!m || !target || m.target !== target || !target.alive) return;
    const dx = target.pos.x - P.pos.x, dz = target.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    const step = Math.min(d - (radius + (target.radius || 0.3) - 0.25), m.budget);
    if (step <= 0.02) return;
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    m.budget = 0;
  },
  /** during a swing's wind-up: keep facing the target and lunge (≤ the budget, collision-safe) if it drifted away */
  stzTrackMelee(dt) {
    const m = this.stzMelee, G = this.G, P = G.player;
    if (!m) return;
    const act = P.anim.action?.name;
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !SWING_SET.has(act)) { this.stzMelee = null; return; }
    const t = m.target, dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    if (d > m.reach + m.budget + 0.35) { this.stzMelee = null; return; }
    const want = d - (m.reach - 0.3);
    if (want <= 0 || m.budget <= 0) return;
    const step = Math.min(want, m.budget, LUNGE_SPEED * dt);
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    const moved = Math.hypot(P.pos.x - _t.x, P.pos.z - _t.z);
    m.budget = moved < step * 0.3 ? 0 : m.budget - moved;
  },

  // ================================================================== FLAIL ARTS · Woeful Wallop
  cast_woefulWallop(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const m = this.melee; this.melee = null;
    this.stzMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    this.stzCombo = 0;
    sfx('stz_sigh', { vol: 0.8 });
    P.anim.play('wallop', { speed: this.animSpeed(0.6), onEvent: ev => {
      if (ev !== 'hit') return;
      this.stzSnapIn(target, p.radius);
      const f = P.facing, fx = this.stzFx();
      sfx('flail_whoosh', { pitch: 0.8 });
      let hit = 0;
      const cap = G.derived?.hexStacks || 3, hm = G.derived?.hexMul || 1;
      fx.sweep(P.pos, f, p.arc, p.radius * (o.reach || 1));
      this.arcHit(P.pos, f, p.radius * (o.reach || 1), p.arc, e => {
        this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback * (o.knock || 1), stun: o.stun || 0, from: P.pos });
        if (!e.breakable) fx.gloomPuff(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), 2, 0.25, STZ_COL.dust);
        if (o.woe && !e.breakable) this.stzHex(e, o.woe.dps * hm, o.woe.dur, 1, cap); // (Wallop of Woe)
        hit++;
      }, target);
      if (hit) { sfx('flail_bonk', { pitch: 0.95 }); G.engine.rig.shake(0.2); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.04); }
      if (o.aftershock) this.after?.(0.16, () => { // (Aftershock: the ball comes down at the end of the sweep)
        const F = P.flail; if (F) flailBall(F, _w); else _w.set(P.pos.x + Math.sin(P.facing), 0, P.pos.z + Math.cos(P.facing));
        _w.y = G.world.heightAt?.(_w.x, _w.z) ?? P.pos.y; const at = _w.clone();
        fx.thud(at, 1.1, true); sfx('flail_thud', { pitch: 0.9 }); G.engine.rig.shake(0.15);
        this.combat.inRadius(at.x, at.z, o.aftershock.r, 'ally', e => { if (e.alive && (e.team === 'enemy' || e.breakable)) this.combat.hitMonster(e, { dmgPct: p.dmgPct * o.aftershock.pct / 100, knock: 0.5, from: at }); });
      });
      this.stzMelee = null;
    } });
  },

  // ================================================================== GLOOM HEXES · Dripping Paw
  cast_drippingPaw(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('hex_cast', { vol: 0.85 });
    P.anim.play('hexFlick', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stzShoot(R, aim, target, o);
    } });
  },
  /** the flying curse: a ghostlight paw print from his left paw toward the target (or the aim), splatting on the first foe */
  stzShoot(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.stzFx();
    const hand = P.rig.parts.handL; P.rig.root.updateMatrixWorld(true);
    const from = hand ? hand.getWorldPosition(new THREE.Vector3()) : P.pos.clone().setY(P.pos.y + 0.7);
    from.y = Math.max(from.y, P.pos.y + 0.55);
    const to = target?.alive && !target.breakable ? target.pos : aim;
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z); if (dir.lengthSq() < 1e-4) dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); dir.normalize();
    const h = fx.pawShot();
    (this.stzShots ||= []).push({ R, o, pos: from, dir, left: p.range, speed: p.speed, h, t: 0, y0: from.y });
    // Paw Prints (a charged split): one more paw a rank, fanned out either side, each splatting for o.splitPct %
    for (let i = 0; i < (o.split || 0); i++) {
      const a = (i % 2 ? -1 : 1) * 0.24 * (1 + Math.floor(i / 2)), d2 = new THREE.Vector3(dir.x * Math.cos(a) - dir.z * Math.sin(a), 0, dir.x * Math.sin(a) + dir.z * Math.cos(a));
      this.stzShots.push({ R, o: { ...o, split: 0, puddle: null, pct: (o.splitPct || 50) / 100 }, pos: from.clone(), dir: d2, left: p.range, speed: p.speed, h: fx.pawShot(), t: 0, y0: from.y });
    }
  },
  updateStzShots(dt) {
    const S = this.stzShots; if (!S?.length) return;
    const G = this.G;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i]; s.t += dt;
      const step = Math.min(s.left, s.speed * dt); s.left -= step;
      s.pos.addScaledVector(s.dir, step);
      const gy = G.world.heightAt?.(s.pos.x, s.pos.z) ?? 0;
      s.pos.y = Math.max(gy + 0.55, s.y0 + (gy + 0.7 - s.y0) * Math.min(1, s.t * 4)) + Math.sin(s.t * 18) * 0.03;
      s.h.set(s.pos, s.dir, dt);
      let hit = null;
      this.combat.inRadius(s.pos.x, s.pos.z, 0.42, 'ally', e => { if (!hit && !e.breakable) hit = e; });
      const blocked = G.world.collision?.solidAt?.(s.pos.x, s.pos.z, 0.15);
      if (hit || s.left <= 0.001 || blocked) {
        s.h.end(); S.splice(i, 1);
        _v.copy(hit ? hit.pos : s.pos); _v.y = G.world.heightAt?.(_v.x, _v.z) ?? 0;
        this.stzSplat(s.R, _v, s.o);
      }
    }
  },
  /** the curse lands at `at`: the splat's damage and a hex stack on every foe it splashed */
  stzSplat(R, at, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.stzFx(), r = p.radius * (o.radius || 1);
    fx.splat(at, r); sfx('hex_splat');
    this.combat.inRadius(at.x, at.z, r, 'ally', e => {
      this.combat.hitMonster(e, { dmgPct: p.dmgPct * (o.pct || 1), element: 'gloom', from: P.pos });
      if (!e.breakable) this.stzHex(e, p.dotPct * (o.pct || 1), p.duration, o.stacks || 1, p.stacks);
    });
    if (o.puddle) (this.stzPuddles ||= []).push({ R, pos: at.clone(), r, t: 0, dur: o.puddle.t, acc: 0 }); // (Gloom Puddle)
  },

  // ================================================================== the hexes (gloom damage over time)
  /** put `add` hex stacks on a foe (up to cap): each stack ticks dps % gloom per second; a new stack refreshes the timer */
  stzHex(e, dps, dur, add = 1, cap = 3) {
    if (!e.alive || e.breakable || e.team !== 'enemy') return null;
    const H = this.stzHexes || (this.stzHexes = new Map());
    let h = H.get(e);
    if (!h) { h = { n: 0, dps: 0, t: 0, dur: 0, acc: 0.25, mark: this.stzFx().hexMark(e) }; H.set(e, h); }
    h.n = Math.min(cap, h.n + add); h.dps = Math.max(h.dps, dps); h.t = Math.max(h.t, dur); h.dur = Math.max(h.dur, dur); h.mark.stacks = h.n;
    return h;
  },
  /** Gloom Puddle: a charged splat's puddle re-hexes whoever stands in it, every second */
  updateStzPuddles(dt) {
    const S = this.stzPuddles; if (!S?.length) return;
    for (let i = S.length - 1; i >= 0; i--) {
      const q = S[i], p = q.R.params; q.t += dt; q.acc += dt;
      if (q.acc >= 1) { q.acc -= 1; this.stzFx().splat(q.pos, q.r * 0.8); this.combat.inRadius(q.pos.x, q.pos.z, q.r, 'ally', e => { if (e.alive && e.team === 'enemy' && !e.breakable) this.stzHex(e, p.dotPct, p.duration, 1, p.stacks); }); }
      if (q.t >= q.dur) S.splice(i, 1);
    }
  },
  updateStzHexes(dt) {
    const H = this.stzHexes; if (!H?.size) return;
    const G = this.G, fx = this.stzFx();
    let ticks = 0;
    for (const [e, h] of H) {
      if (!e.alive || h.t <= 0 || e.team !== 'enemy') { if (!e.alive && h.ever) this.stzEverBurst(e, h); h.mark.end(); H.delete(e); continue; }
      h.t -= dt; h.acc += dt;
      if (h.acc >= 0.5) {
        h.acc -= 0.5;
        const dmg = this.combat.hitMonster(e, { dmgPct: h.dps * h.n * 0.5, element: 'gloom', noCrit: true, silent: true });
        if (dmg > 0) this.combat.dmgFloat(e.pos.x, e.pos.y + (e.height || 1) + 0.1, e.pos.z, dmg, false, `${dmg}`, { kind: 'dmg', color: GLOOM, ref: minorHit(e) });
        if (Math.random() < 0.5) fx.gloomPuff(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.6, e.pos.z), 1, 0.25);
        if (ticks++ < 2 && Math.random() < 0.35) sfx('hex_tick', { vol: 0.5, pos: e.pos });
      }
    }
  },
  /** Everlasting Gloom: a foe that drops while it carries the great hex bursts, and the hex jumps on to the next foe */
  stzEverBurst(e, h) {
    const G = this.G, fx = this.stzFx(), g = h.ever, at = _h.copy(e.pos);
    fx.burst(at, g.burstRadius);
    this.combat.inRadius(at.x, at.z, g.burstRadius, 'ally', x => { if (x.alive && x.team === 'enemy' && !x.breakable) this.combat.hitMonster(x, { dmgPct: g.burstPct, element: 'gloom', from: at }); });
    sfx('hex_splat', { pitch: 0.75 });
    if (g.jumps <= 0) return;
    let best = null, bd = g.jumpRange;
    for (const x of this.combat.entities) {
      if (!x.alive || x.team !== 'enemy' || x.breakable || x === e) continue;
      const hh = this.stzHexes?.get(x); if (hh?.ever) continue;
      const d = dist(x.pos.x, x.pos.z, at.x, at.z); if (d < bd) { bd = d; best = x; }
    }
    if (!best) return;
    g.jumps--;
    fx.hexJump(at, best.pos);
    const tgt = best;
    this.after?.(0.3, () => { if (tgt.alive) { const nh = this.stzHex(tgt, g.dotPct, g.dur, 1, G.derived?.hexStacks || 3); if (nh) nh.ever = g; } });
  },
  /** foes hexed within r of a point (the Gloom Blanket, Mournful Awoo) */
  stzHexedNear(pos, r) {
    const H = this.stzHexes; if (!H?.size) return 0;
    let n = 0;
    for (const e of H.keys()) if (e.alive && dist(e.pos.x, e.pos.z, pos.x, pos.z) < r) n++;
    return n;
  },

  // ================================================================== the guard (combat.hitPlayer)
  /** a blow is about to land on him: the class's damage reduction, Iron Topknot and the Gloom Blanket (each hexed foe
   *  within BLANKET.r takes BLANKET.per % off, up to BLANKET.max). → the damage that gets through */
  shihtzuGuard(dmg, src) {
    const G = this.G, P = G.player;
    if (P?.hero !== 'shihtzu') return dmg;
    const blanket = Math.min(BLANKET.max, this.stzHexedNear(P.pos, BLANKET.r)) * BLANKET.per;
    const dr = Math.min(60, (G.derived?.dmgReduce || 0) + blanket);
    if (blanket > 0 && Math.random() < 0.35) this.stzFx().gloomPuff(_h.set(P.pos.x, P.pos.y + 0.7, P.pos.z), 2, 0.35);
    // then the arts: the mopes' weaken, the Sulk's block, Bone Ward's barrier, the lantern's rekindle (shihtzuArts.js)
    const r = this.stzGuardArts(dmg * (1 - dr / 100), src);
    return r.soak ? 0 : r.dmg;
  },

  // ================================================================== per frame
  updateShihtzu(dt) {
    const G = this.G, P = G.player;
    if (!P) return;
    if (this.stzMelee) this.stzTrackMelee(dt);
    this.updateStzShots(dt);
    this.updateStzPuddles(dt);
    this.updateStzHexes(dt);
    this.updateStzArts(dt);
    // the trail follows his flail's ball while it's swung (and fades out after)
    if (P.hero === 'shihtzu' && P.flail) {
      const a = P.anim.action, swinging = a && TRAIL_SET.has(a.name) && !this.stzTug, sp = P.flail.chain.speed || 0;
      const tr = this.stzTrail(); tr?.on(swinging ? clamp((sp - 2.5) / 4) : 0);
    }
    // a hex wind-up gathers ghostlight on his free paw
    const ch = this.charge?.active;
    if (ch && P.hero === 'shihtzu' && !ch.chan && P.rig.parts.handL) this.stzFx().gather(P.rig.parts.handL.getWorldPosition(_w), dt, ch.tMax ? ch.t / ch.tMax : 0);
  },
  /** end every Shih Tzu effect (floor change, hero switch, death): the player's rig may be replaced right after */
  clearShihtzu() {
    this.stzMelee = null; this.stzCombo = 0;
    for (const s of this.stzShots || []) s.h.end(); this.stzShots = []; this.stzPuddles = [];
    for (const h of this.stzHexes?.values() || []) h.mark.end(); this.stzHexes?.clear();
    this._stzTrail?.end(); this._stzTrail = null; this._stzTrailF = null;
    this.clearStzArts();
  },
};

/** Mix the Shih Tzu's cast implementations into SkillRunner.prototype (skillRunner.js does this at import). Woeful
 *  Wallop is a melee swing too: the reach assist walks him up to a far target and lunges at a near one. */
export function installShihtzuSkills(proto) {
  for (const k in M) if (!(k in proto)) proto[k] = M[k];
  installShihtzuArts(proto);
  installChargedShihtzu(proto);
  const isMelee = proto.isMelee;
  proto.isMelee = function (id, R) { return id === 'woefulWallop' || isMelee.call(this, id, R); };
}
