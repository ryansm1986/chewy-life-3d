// The Golden Retriever dragoon's Lance Arts and Javelins past the basics (docs/GOLDEN.md §3): SkillRunner casts
// (`cast_<id>(R, aim, target, o)`; o: a charged release's extras, combat/chargedGolden.js) and the per-frame state they
// need, mixed in by goldenSkills.js installGoldenSkills.
//  - Sunfall Jump: the dragoon's Jump (his own leap: P.leap = { own } so skillRunner leaves it alone and Player.update stands
//    aside; untouchable in the air), a landing telegraph, the crash;
//  - Pinwheel Sweep: his facing turns a whole turn (or more, charged) with the lance out at full reach, a hit per turn;
//  - Gallant Charge: his own dash (P.dash = { own }), the lance couched, foes in the path flung aside (or carried along);
//  - Starfall Lance: the lance thrown up out of sight, down as a falling star at the spot, the crash and its smoulder, the
//    lance bouncing home into his paw (the lance moves wait for it: castBlocked);
//  - Tailwag Volley, True Flight, Emberleaf Javelin (sticks, glows, bursts), Sunshower (the quiver up, a javelin rain);
//  - Steady Paws (goldenGuard: a foe that hits him up close may run onto the lance) and Good Retriever (landed javelins
//    stay to be scooped up for zoom and pep; a foe a javelin bonks is marked for the lance: gldHit).
// Looks: gfx/goldenFx.js; poses: actors/goldenPoses.js; sounds: audio/golden.sfx.js. Burns are the game's fire status
// (monster.applyStatus('burn', s, dps)): gldBurn turns a % of his lance damage into its dps.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, ease } from '../core/util.js';
import { GLD_COL } from '../gfx/goldenFx.js';
import { bladeFx } from '../gfx/bladeFx.js';
import { lanceObject, setLanceLook, lancePoint } from '../actors/goldenGear.js';
import { JUMP_U, jumpY } from '../actors/goldenPoses.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const JAV_G = 16;
const LANCE_IDS = new Set(['sunbeamThrust', 'sunfallJump', 'pinwheelSweep', 'gallantCharge', 'starfallLance']);
const EDGE = new THREE.Color('#ffd27a'), CORE = new THREE.Color('#fff6e0');

const M = {
  // ================================================================== shared
  /** a hit from his own moves; lance: Good Retriever's mark makes the lance hit harder */
  gldHit(e, o, lance = false) {
    if (lance && e.gldMark && e.gldMark.until > (this.G.engine.time || 0)) o.dmgPct *= 1 + e.gldMark.pct / 100;
    return this.combat.hitMonster(e, o);
  },
  /** set a foe smouldering: burnPct (% of his lance damage a second) for dur s — from a hit's damage when there was one
   *  (crits and resistances in, as Moka's burns), else his average hit; a stronger burn already on it stays */
  gldBurn(e, dealt, dmgPct, burnPct, dur) {
    if (!e?.alive || e.breakable || !(burnPct > 0) || !(dur > 0)) return;
    const D = this.G.derived || {}, avg = ((D.dmgMin || 1) + (D.dmgMax || 1)) / 2;
    const dps = Math.max(1, dealt > 0 && dmgPct > 0 ? dealt * burnPct / dmgPct : avg * burnPct / 100);
    const cur = e.status?.burn;
    if (cur?.t > 0 && cur.dps * cur.t > dps * dur) return;
    e.applyStatus?.('burn', dur, dps);
  },
  /** the lance moves wait while the lance is in the air (Starfall Lance); the Whelp Bond's while Shadow can't (goldenWhelp.js) */
  gldCastBlocked(id) {
    const G = this.G, P = G.player;
    if (P?.hero !== 'golden') return false;
    if (this.gldStar && (LANCE_IDS.has(id) || (id === 'attack' && G.derived?.weaponType === 'lance'))) {
      if (!this._gldWaitT || G.engine.time - this._gldWaitT > 1.2) { this._gldWaitT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), 'The lance is still up there!', { kind: 'status', color: '#bfe8c8' }); }
      return true;
    }
    return !!this.gldWhelpBlocked?.(id);
  },

  // ================================================================== LANCE ARTS · Sunfall Jump
  cast_sunfallJump(R, aim, target, o = {}) {
    const p = R.params, to = target?.alive && !target.breakable ? target.pos : aim;
    this.gldJumpStart({ dmgPct: p.dmgPct, radius: p.radius, stun: p.stun, knockback: p.knockback, leap: p.leap }, to, o);
  },
  /** the Jump itself (Sunfall Jump; a charged Dragon Heart's Dragon's Jump): q = { dmgPct, radius, stun, knockback, leap,
   *  element }, o: { high (×height), big (the star's crash), embers (Embers Below), onLand } */
  gldJumpStart(q, to, o = {}) {
    const G = this.G, P = G.player, W = G.world;
    const start = P.pos.clone(), dir = _d.set(to.x - start.x, 0, to.z - start.z); let d = dir.length();
    if (d < 0.05) { dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); d = 0; } else dir.divideScalar(d);
    d = Math.min(d, q.leap || 7);
    const end = start.clone();
    for (let s = 0.25; s <= d + 1e-6; s += 0.25) { // (the landing: the furthest open floor along the way, short of a wall or an edge)
      const x = start.x + dir.x * s, z = start.z + dir.z * s;
      if (W.collision?.solidAt?.(x, z, P.radius * 0.8) || (W.walkable && !W.walkable(x, z))) break;
      end.x = x; end.z = z;
    }
    end.y = W.heightAt(end.x, end.z);
    P.faceTarget = P.facing = Math.atan2(dir.x, dir.z);
    this.gldMelee = null; this.melee = null;
    const J = this.gldJump = { q, o, start, end, h: 2.8 * (o.high || 1), mark: null, landed: false, glint: false }; // (2.8 m: high, and still in the picture at the game camera (22-27 m) and closer)
    P.leap = { own: true, start, end, t: 0 }; // (skillRunner leaves an own leap alone; Player.update stands aside while it's set)
    P.anim.play('sunfallJump', { speed: o.speed || 1, onEvent: ev => this.gldJumpEvent(J, ev) });
    if (P.anim.action?.name === 'sunfallJump') P.anim.action.h = J.h;
    sfx('lance_whoosh', { pitch: 0.7, vol: 0.45 });
  },
  gldJumpEvent(J, ev) {
    if (this.gldJump !== J) return;
    const G = this.G, P = G.player, fx = this.gldFx();
    if (ev === 'launch') {
      fx.dust(P.pos, 6); fx.leaves(P.pos, 6, { speed: 1.6, up: 3 });
      G.vfx.ring(P.pos, { color: '#fff2c8', r0: 0.2, r1: 1.1, life: 0.3, opacity: 0.35 });
      sfx('gld_jump');
      J.mark = fx.ring(J.end, Math.min(J.q.radius, 4.5), { life: 0, color: GLD_COL.gold, alpha: 0.3, pulse: 0.15 }); // (where he'll land)
    } else if (ev === 'dive') sfx('gld_dive');
    else if (ev === 'impact') this.gldJumpLand(J);
  },
  gldJumpLand(J) {
    if (J.landed) return;
    J.landed = true;
    const G = this.G, P = G.player, q = J.q, fx = this.gldFx();
    P.pos.x = J.end.x; P.pos.z = J.end.z; P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    P.leap = null; P.invuln = false;
    J.mark?.end(); J.mark = null;
    fx.crash(P.pos, q.radius, { big: !!J.o.big });
    sfx('gld_crash', { pitch: J.o.big ? 0.85 : 1 }); G.engine.rig.shake(J.o.big ? 0.7 : 0.55); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.06);
    const at = P.pos.clone();
    this.nova(at, q.radius, e => {
      const dmg = this.gldHit(e, { dmgPct: q.dmgPct, element: q.element || 'phys', knock: q.knockback ?? 1.2, stun: q.stun || 0, from: at }, true);
      if (q.stun && e.alive && !e.def?.boss) this.fx?.()?.dizzy?.(e, q.stun);
      if (q.burnPct) this.gldBurn(e, dmg, q.dmgPct, q.burnPct, q.burnDur || 3);
    });
    const emb = J.o.embers; // (Embers Below: the crater smoulders)
    if (emb) this.gldSmoulder(at, q.radius * 0.8, emb.pct, emb.t);
    J.o.onLand?.(at);
  },
  updateGldJump(dt) {
    const J = this.gldJump; if (!J) return;
    const G = this.G, P = G.player, a = P.anim.action;
    if (!a || a.name !== 'sunfallJump') { if (!J.landed) this.gldJumpLand(J); P.leap = null; P.invuln = false; this.gldJump = null; return; }
    if (J.landed) return;
    const u = a.t / a.dur, s = clamp((u - JUMP_U.launch) / (JUMP_U.impact - JUMP_U.launch)), k = ease.inOutQuad(s);
    P.pos.x = J.start.x + (J.end.x - J.start.x) * k; P.pos.z = J.start.z + (J.end.z - J.start.z) * k;
    P.invuln = u > 0.12;
    if (!J.glint && u > 0.44) { J.glint = true; this.gldFx().glint(_v.set(P.pos.x, P.pos.y + J.h + 1.25, P.pos.z)); }
    if (u > 0.2 && u < 0.6 && Math.random() < dt * 30) this.gldFx().embers(_v.set(P.pos.x, P.pos.y + jumpY(u) * J.h + 0.5, P.pos.z), 1, { r: 0.2, up: -0.5, size: 0.16, life: 0.35 });
  },
  /** a smouldering patch (Embers Below, Starfall's crater): foes in it burn pct% a second while they stay */
  gldSmoulder(at, r, pct, life) {
    const fx = this.gldFx();
    this.combat.addZone({ pos: at.clone(), radius: r, life, tick: 0.5, onTick: z => {
      this.nova(z.pos, z.radius, e => this.gldBurn(e, 0, 0, pct, 1.2));
      fx.embers(z.pos, 3, { r: z.radius * 0.7, up: 0.9, size: 0.2, life: 0.7 });
    } });
    this.G.vfx.decal(at, { r: r * 0.9, color: '#3a2010', life, opacity: 0.3 }); // (a scorch, not a glow: the embers rising off it say it's hot)
  },

  // ================================================================== LANCE ARTS · Pinwheel Sweep
  cast_pinwheelSweep(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, turns = Math.max(1, o.turns || 1);
    this.gldMelee = null; this.melee = null;
    this.gldSpin = { p, o, turns, f0: P.facing, done: 0 };
    sfx('lance_whoosh', { pitch: 0.8, vol: 0.5 });
    P.anim.play('pinwheel', { speed: this.animSpeed(0.62) / (1 + 0.55 * (turns - 1)) });
  },
  updateGldSpin() {
    const S = this.gldSpin; if (!S) return;
    const P = this.G.player, a = P.anim.action;
    if (!a || a.name !== 'pinwheel') { while (S.done < S.turns) this.gldSpinHit(S, S.done++); P.facing = P.faceTarget = S.f0; this.gldSpin = null; return; }
    const u = a.t / a.dur, k = ease.inOutQuad(clamp((u - 0.3) / 0.42));
    P.facing = P.faceTarget = S.f0 + TAU * S.turns * k; // (a whole turn to his left: the lance out on his right leads round through his front)
    while (S.done < S.turns && k * S.turns >= S.done + 0.5) this.gldSpinHit(S, S.done++);
  },
  gldSpinHit(S, i) {
    const G = this.G, P = G.player, p = S.p, fx = this.gldFx(), last = i === S.turns - 1, r = p.radius;
    bladeFx(G).arc(P.pos, P.facing, { arc: 6.1, r: Math.min(r, 3.6) * 0.96, rev: true, y: 0.55, width: 0.5, life: 0.3, sweep: 0.14, edge: EDGE, core: CORE });
    fx.leaves(P.pos, 6, { r: r * 0.55, speed: 2.6, up: 1.2 }); fx.dust(P.pos, 3);
    sfx('gld_spin', { pitch: 1 + i * 0.07 });
    let hit = 0;
    const dm = p.dmgPct * (i > 0 ? (S.o.turnPct || 100) / 100 : 1); // (a charged sweep's second turn: turnPct)
    this.nova(P.pos, r, e => { this.gldHit(e, { dmgPct: dm, knock: last ? p.knockback : 0.25, from: P.pos }, true); hit++; });
    if (hit) { sfx('lance_poke', { pitch: 0.85 }); G.engine.rig.shake(last ? 0.2 : 0.1); }
    const g = last && S.o.gust; // (Leaf Gust: a ring of leaves blows out past the lance)
    if (g) {
      fx.gust(P.pos, r + g.r); fx.leaves(P.pos, 14, { r: r * 0.8, speed: 5, up: 1.4 });
      this.nova(P.pos, r + g.r, e => this.gldHit(e, { dmgPct: p.dmgPct * g.pct / 100, knock: 2.2, from: P.pos }, true));
    }
  },

  // ================================================================== LANCE ARTS · Gallant Charge
  cast_gallantCharge(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const dir = new THREE.Vector3(aim.x - P.pos.x, 0, aim.z - P.pos.z);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); dir.normalize();
    P.faceTarget = P.facing = Math.atan2(dir.x, dir.z);
    this.gldMelee = null; this.melee = null;
    const run = p.distance / p.speed;
    this.gldDash = { p, o, dir, left: p.distance, hit: new Set(), carry: [], go: false, trail: 0, start: P.pos.clone() };
    P.dash = { own: true, dir }; P.invuln = true; // (untouchable while charging; Player.update stands aside)
    P.anim.play('gallantCharge', { speed: 0.85 / (0.14 + run + 0.32), onEvent: ev => { if (ev === 'go' && this.gldDash) { this.gldDash.go = true; sfx('gld_charge'); this.gldFx().dust(P.pos, 6); } } });
  },
  updateGldDash(dt) {
    const S = this.gldDash; if (!S) return;
    const G = this.G, P = G.player, fx = this.gldFx();
    if (!S.go) { if (P.anim.action?.name !== 'gallantCharge') S.go = true; else return; }
    const step = Math.min(S.left, S.p.speed * dt), bx = P.pos.x, bz = P.pos.z;
    this.slideHero(S.dir, step); S.left -= step;
    const moved = Math.hypot(P.pos.x - bx, P.pos.z - bz);
    // the lance's point leads him by ~1 m: everything in the path (its width) is poked and flung aside (or carried along)
    const fx0 = P.pos.x + S.dir.x * 0.9, fz0 = P.pos.z + S.dir.z * 0.9, half = S.p.width / 2;
    this.combat.inRadius(fx0, fz0, half + 0.9, 'ally', e => {
      if (S.hit.has(e) || !isFoe(e)) return;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, along = dx * S.dir.x + dz * S.dir.z, side = dx * S.dir.z - dz * S.dir.x;
      if (along < -0.4 || Math.abs(side) > half + (e.radius || 0.3)) return;
      S.hit.add(e);
      const carry = S.o.carry && !e.def?.boss && !e.big;
      // flung aside: knocked from a point on his path a little behind it (mostly sideways, a little on)
      _h.set(e.pos.x - S.dir.x * 0.6 - S.dir.z * Math.sign(side || 1) * 0.8, e.pos.y, e.pos.z - S.dir.z * 0.6 + S.dir.x * Math.sign(side || 1) * 0.8);
      this.gldHit(e, { dmgPct: S.p.dmgPct, knock: carry ? 0 : S.p.knockback, from: _h.clone() }, true);
      fx.bonk(_v.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), true); sfx('lance_poke', { pitch: rand(0.9, 1.05) });
      if (carry && e.alive) S.carry.push(e);
    });
    for (const e of S.carry) if (e.alive) this.pullFoe(e, P.pos.x + S.dir.x * 1.1, P.pos.z + S.dir.z * 1.1, S.p.speed * dt * 1.2, 0.2);
    if ((S.trail += dt) > 0.045) { // dust kicked up and a faint streak of sunlight behind him
      S.trail = 0; fx.dust(_v.set(P.pos.x - S.dir.x * 0.3, P.pos.y, P.pos.z - S.dir.z * 0.3), 2);
      fx.streak(_w.set(P.pos.x - S.dir.x * 1.6, P.pos.y + 0.62, P.pos.z - S.dir.z * 1.6), S.dir, 1.4, { width: 0.32, life: 0.16, core: false });
    }
    if (S.left <= 0.001 || moved < step * 0.3) this.gldDashEnd(S);
  },
  gldDashEnd(S) {
    const G = this.G, P = G.player, fx = this.gldFx();
    this.gldDash = null; P.dash = null; P.invuln = false;
    fx.dust(P.pos, 8); sfx('gld_skid');
    for (const e of S.carry) if (e.alive) { this.combat.hitMonster(e, { dmgPct: 0.01, knock: S.p.knockback, stun: 0.4, from: P.pos, silent: true, noCrit: true }); if (!e.def?.boss) this.fx?.()?.dizzy?.(e, 0.5); }
    const sk = S.o.skid; // (Grand Skid: the stop bonks everything round him)
    if (sk) { fx.crash(P.pos, sk.r); this.nova(P.pos, sk.r, e => this.gldHit(e, { dmgPct: S.p.dmgPct * sk.pct / 100, knock: 1.4, from: P.pos }, true)); G.engine.rig.shake(0.3); }
  },

  // ================================================================== LANCE ARTS · Starfall Lance
  cast_starfallLance(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const at = this.clampAim(target?.alive && !target.breakable ? target.pos : aim, p.range);
    this.gldMelee = null; this.melee = null;
    this.gldStar = { p, o, at, state: 'wind', t: 0, L: null, ring: null, stars: 0 };
    P.anim.play('starfallThrow', { speed: G.derived?.castMul || 1, onEvent: ev => { if (ev === 'throw') this.gldStarThrow(); } });
  },
  /** the flying lance (one per world: the GoldenFX keeps it), dressed as the one in his paw */
  gldFlyLance() {
    const fx = this.gldFx();
    if (!fx.flyLance) { const L = lanceObject(); fx.adopt(L.holder); L.holder.visible = false; fx.flyLance = L; }
    setLanceLook(fx.flyLance, this.G.player?.equippedLook?.());
    return fx.flyLance;
  },
  gldStarThrow() {
    const S = this.gldStar; if (!S || S.state !== 'wind') return;
    const G = this.G, P = G.player, fx = this.gldFx(), L = this.gldFlyLance();
    if (P.lance) lancePoint(P.lance, 0.2, _v); else _v.set(P.pos.x, P.pos.y + 1.4, P.pos.z);
    P.lanceThrown = true;
    S.L = L; S.state = 'up'; S.t = 0; S.pos = _v.clone(); S.vel = new THREE.Vector3(Math.sin(P.facing) * 1.2, 24, Math.cos(P.facing) * 1.2);
    L.holder.visible = true; L.holder.position.copy(S.pos); L.holder.quaternion.identity();
    S.ring = fx.ring(S.at, Math.min(S.p.radius, 4.5), { life: 0, color: GLD_COL.ember, alpha: 0.32, pulse: 0.2 }); // (where the star will fall)
    sfx('star_throw'); fx.leaves(S.pos, 6, { speed: 1.5, up: 4 });
  },
  updateGldStar(dt) {
    const S = this.gldStar; if (!S) return;
    const G = this.G, P = G.player, fx = this.gldFx(), p = S.p, L = S.L;
    if (S.state === 'wind') { if (P.anim.action?.name !== 'starfallThrow') this.gldStarThrow(); return; }
    S.t += dt;
    const h = L.holder;
    if (S.state === 'up') { // straight up out of sight, turning on its long axis
      S.pos.addScaledVector(S.vel, dt); h.position.copy(S.pos); h.rotateY(dt * 9);
      if (S.t > 0.42) { S.state = 'sky'; h.visible = false; }
      return;
    }
    const fall = 0.42, tFall = Math.max(0.5, p.delay) - fall; // (lands p.delay s after the throw; from ~7.5 m: most of its fall is in the picture)
    if (S.state === 'sky') {
      const k = S.o.constellation; // (Constellation: two small stars first, either side of the spot)
      if (k && S.stars < k.n && S.t > tFall - 0.25 + S.stars * 0.08) this.gldMiniStar(S, S.stars++);
      if (S.t >= tFall) { S.state = 'fall'; S.t0 = S.t; const f = P.facing; S.from = new THREE.Vector3(S.at.x - Math.sin(f) * 1.2, S.at.y + 7.5, S.at.z - Math.cos(f) * 1.2); h.visible = true; sfx('star_fall'); }
      return;
    }
    if (S.state === 'fall') { // the falling star: point first, wreathed in embers and leaves
      const k = clamp((S.t - S.t0) / fall), e2 = k * (0.35 + 0.65 * k);
      _v.lerpVectors(S.from, S.at, e2); h.position.copy(_v);
      _d.subVectors(S.at, S.from).normalize(); h.quaternion.setFromUnitVectors(_up, _d.negate()); h.rotateY(S.t * 14); // (the tip (+Y) leads, down)
      lancePoint(L, 1.2, _w);
      G.vfx.glow.spawn({ x: _w.x, y: _w.y, z: _w.z, life: 0.24, size: 0.8, size1: 0.25, color: '#ffe6a0', alpha: 0.45, alpha1: 0 }); // (the falling star's head and its trail: a line of fading glows)
      fx.embers(_w, 2, { r: 0.15, up: 1.5, size: 0.22, life: 0.45 }); if (Math.random() < 0.5) fx.leaves(_w, 1, { speed: 1, up: 1.5 });
      if (k >= 1) this.gldStarImpact(S);
      return;
    }
    if (S.state === 'stuck') { if (S.t - S.t0 > 0.28) { S.state = 'home'; S.t0 = S.t; S.from = h.position.clone(); sfx('lance_whoosh', { pitch: 1.2, vol: 0.5 }); } return; }
    if (S.state === 'home') { // it bounces up and arcs home into his paw, end over end
      const T = 0.55, k = clamp((S.t - S.t0) / T);
      const tx = P.pos.x + Math.sin(P.facing) * 0.25, ty = P.pos.y + 1.3, tz = P.pos.z + Math.cos(P.facing) * 0.25;
      h.position.set(S.from.x + (tx - S.from.x) * k, S.from.y + (ty - S.from.y) * k + Math.sin(k * Math.PI) * 2.6, S.from.z + (tz - S.from.z) * k);
      h.quaternion.setFromAxisAngle(_v.set(Math.cos(P.facing), 0, -Math.sin(P.facing)), k * TAU * 1.5);
      if (k >= 1) this.gldStarCatch(S);
    }
  },
  gldMiniStar(S, i) {
    const G = this.G, fx = this.gldFx(), k = S.o.constellation, f = this.G.player.facing + (i ? 1 : -1) * Math.PI / 2;
    const at = new THREE.Vector3(S.at.x + Math.sin(f) * k.r, S.at.y, S.at.z + Math.cos(f) * k.r);
    at.y = G.world.heightAt(at.x, at.z);
    const from = new THREE.Vector3(at.x, at.y + 9, at.z), T = 0.22;
    fx.run((dt, t) => {
      const u = clamp(t / T); _v.lerpVectors(from, at, u * u);
      G.vfx.glow.spawn({ x: _v.x, y: _v.y, z: _v.z, life: 0.18, size: 0.5, size1: 0.2, color: '#fff2c8', alpha: 0.45, alpha1: 0 });
      if (u < 1) return true;
      fx.crash(at, k.r); sfx('jav_bonk', { pitch: 0.7 });
      this.nova(at, k.r, e => this.gldHit(e, { dmgPct: S.p.dmgPct * k.pct / 100, knock: 0.6, from: at }, true));
      return false;
    });
  },
  gldStarImpact(S) {
    const G = this.G, fx = this.gldFx(), p = S.p, at = S.at;
    S.state = 'stuck'; S.t0 = S.t;
    S.ring?.end(); S.ring = null;
    fx.crash(at, p.radius, { big: true });
    sfx('star_crash'); G.engine.rig.shake(0.75); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.07);
    this.nova(at, p.radius, e => {
      const dmg = this.gldHit(e, { dmgPct: p.dmgPct, knock: 1, stun: p.stun, from: at }, true);
      if (e.alive && !e.def?.boss) this.fx?.()?.dizzy?.(e, p.stun);
      this.gldBurn(e, dmg, p.dmgPct, p.burnPct, 1.5);
    });
    this.gldSmoulder(at, p.radius * 0.8, p.burnPct, p.burnDur);
  },
  gldStarCatch(S) {
    const G = this.G, P = G.player;
    S.L.holder.visible = false; this.gldStar = null;
    P.lanceThrown = false;
    if (!P.anim.busy()) P.anim.play('lanceCatch');
    sfx('lance_catch'); sfx('golden_boof', { vol: 0.6 });
    this.gldFx().leaves(_v.set(P.pos.x, P.pos.y + 1.4, P.pos.z), 4, { speed: 1, up: 1 });
  },

  // ================================================================== JAVELINS · Tailwag Volley
  cast_tailwagVolley(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('jav_draw', { vol: 0.7 });
    P.anim.play('javVolley', { speed: G.derived?.castMul || 1, onEvent: ev => { if (ev === 'release') this.gldVolley(R, p, aim, target, o, 1); } });
  },
  gldVolley(R, p, aim, target, o, mul) {
    const P = this.G.player, from = this.gldHand(_v);
    const to = target?.alive && !target.breakable ? target.pos : aim;
    const base = Math.atan2(to.x - from.x, to.z - from.z), D = clamp(Math.hypot(to.x - from.x, to.z - from.z), 4, p.range), n = p.count, sp = p.spread * Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * sp);
      this.gldThrow(R, _w.set(P.pos.x + Math.sin(a) * D, 0, P.pos.z + Math.cos(a) * D), { dmgPct: p.dmgPct * mul, speed: p.speed, range: p.range, quiet: i > 0 });
    }
    sfx('jav_volley');
    const ec = o.echo; // (Second Wag: the fan again a moment later)
    if (ec && mul === 1) this.after(ec.delay, () => { if (!this.G.playerDead) this.gldVolley(R, p, aim, target, o, ec.pct / 100); });
  },

  // ================================================================== JAVELINS · True Flight
  cast_trueFlight(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('jav_draw', { vol: 0.7 });
    P.anim.play('javTrue', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.gldTrue(R, p, aim, 1);
      const tw = o.twin; // (Twin Flight)
      if (tw) this.after(tw.delay, () => { if (!this.G.playerDead) this.gldTrue(R, p, aim, tw.pct / 100); });
    } });
  },
  gldTrue(R, p, aim, mul) {
    const P = this.G.player, from = this.gldHand(_v);
    _d.set(aim.x - from.x, 0, aim.z - from.z); if (_d.lengthSq() < 0.01) _d.set(Math.sin(P.facing), 0, Math.cos(P.facing)); _d.normalize();
    this.gldThrow(R, _w.set(from.x + _d.x * p.range, 0, from.z + _d.z * p.range), { dmgPct: p.dmgPct * mul, speed: p.speed, range: p.range, flat: true, pierce: 99, width: p.width, big: true, trail: 2 });
    this.gldFx().streak(_h.set(from.x, from.y, from.z), _d, Math.min(p.range * 0.55, 9), { width: 0.24, life: 0.22, core: true, y: from.y });
    sfx('jav_true');
  },

  // ================================================================== JAVELINS · Emberleaf Javelin
  cast_emberleafJavelin(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    sfx('jav_draw', { vol: 0.7 }); sfx('ember_fizz', { vol: 0.5 });
    this.gldEmberHand = 0.5;
    P.anim.play('javToss', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.gldEmberHand = 0;
      const to = target?.alive && !target.breakable ? target.pos : aim;
      this.gldThrow(R, to, { dmgPct: p.dmgPct, speed: p.speed, range: p.range, stick: true, fuse: p.fuse, radius: p.radius, burnPct: p.burnPct, burnDur: p.burnDur, kindling: o.kindling, element: 'fire', trail: 1 });
    } });
  },
  /** an Emberleaf javelin finds a foe (or the ground): it sticks there and glows brighter until its fuse runs out */
  gldEmberStick(J, e) {
    J.state = 'ember'; J.foe = e; J.fuse = J.o.fuse; J.fuse0 = J.o.fuse; J.glowT = 0;
    J.dir = _d.copy(J.vel).normalize().clone(); if (J.dir.y > -0.2) { J.dir.y = -0.3; J.dir.normalize(); }
    if (e) J.off = new THREE.Vector3(J.pos.x - e.pos.x, Math.max(0.3, Math.min(J.pos.y - e.pos.y, (e.height || 1) * 0.8)), J.pos.z - e.pos.z).multiplyScalar(0.7);
    else J.pos.y = (this.G.world.heightAt?.(J.pos.x, J.pos.z) ?? J.pos.y) + 0.12;
    sfx(e ? 'jav_bonk' : 'jav_stick', { pos: J.pos, pitch: 0.85 }); sfx('ember_fizz', { pos: J.pos });
    this.gldFx().embers(J.pos, 5, { r: 0.15, up: 1, size: 0.2 });
  },
  gldEmberBurst(J) {
    const G = this.G, fx = this.gldFx(), o = J.o, at = _v.copy(J.pos);
    at.y = G.world.heightAt?.(at.x, at.z) ?? at.y;
    const c = at.clone();
    fx.emberBurst(c, o.radius); sfx('ember_burst', { pos: c }); G.engine.rig.shake(0.18);
    this.nova(c, o.radius, e => { const dmg = this.gldHit(e, { dmgPct: o.dmgPct, element: 'fire', knock: 0.6, from: c }); this.gldBurn(e, dmg, o.dmgPct, o.burnPct, o.burnDur); });
    const k = o.kindling; // (Kindling: two little embers hop onto foes nearby)
    if (k) {
      const near = this.foesNear(c.x, c.z, 4.5).filter(e => isFoe(e)).sort((a, b) => dist(a.pos.x, a.pos.z, c.x, c.z) - dist(b.pos.x, b.pos.z, c.x, c.z)).slice(0, k.n);
      near.forEach((e, i) => { const t0 = e.pos.clone(); fx.run((dt, t) => {
        const u = clamp(t / 0.32); _w.lerpVectors(c, t0, u); _w.y += Math.sin(u * Math.PI) * 1.4 + 0.4;
        G.vfx.glow.spawn({ x: _w.x, y: _w.y, z: _w.z, life: 0.2, size: 0.32, size1: 0.1, color: '#ffc060', alpha: 0.5, alpha1: 0 });
        if (u < 1) return true;
        fx.emberBurst(t0, k.r, { leaves: 3, embers: 6 });
        this.nova(t0, k.r, x => { const dmg = this.gldHit(x, { dmgPct: o.dmgPct * k.pct / 100, element: 'fire', knock: 0.2, from: t0 }); this.gldBurn(x, dmg, o.dmgPct * k.pct / 100, o.burnPct * 0.5, o.burnDur); });
        return false;
      }); void i; });
    }
  },

  // ================================================================== JAVELINS · Sunshower
  cast_sunshower(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const at = this.clampAim(target?.alive && !target.breakable ? target.pos : aim, p.range);
    P.anim.play('sunshowerThrow', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'fling') return;
      const fx = this.gldFx(), from = this.gldHand(_v).clone();
      for (let i = 0; i < 8; i++) this.gldRise(from, i); // (the whole quiver, straight up)
      sfx('sun_fling');
      this.gldRain = { p, o, at: at.clone(), t: -0.5, dropped: 0, n: p.count, every: p.duration / p.count, ring: fx.ring(at, Math.min(p.radius, 5), { life: 0, color: GLD_COL.gold, alpha: 0.26 }), glit: 0, bow: false };
    } });
  },
  /** one javelin of the fling, rising out of sight */
  gldRise(from, i) {
    const B = this.gldFx().javelins(), a = i / 8 * TAU;
    (this.gldJav ||= []).push({ o: { rise: true }, slot: B.add(), pos: from.clone(), vel: new THREE.Vector3(Math.cos(a) * 1.2, rand(20, 26), Math.sin(a) * 1.2), g: 0, t: 0, left: 99, state: 'fly', hit: new Set(), pierce: 0, trail: 0, spin: 0 });
  },
  /** one javelin of the rain: from high above, steeply down onto `pt` */
  gldDrop(pt, o) {
    const G = this.G, B = this.gldFx().javelins(), gy = G.world.heightAt?.(pt.x, pt.z) ?? 0, f = G.player.facing;
    const pos = new THREE.Vector3(pt.x - Math.sin(f) * 1.2 + rand(-0.4, 0.4), gy + 9, pt.z - Math.cos(f) * 1.2 + rand(-0.4, 0.4)), T = 0.4;
    (this.gldJav ||= []).push({ o, slot: B.add(), pos, vel: new THREE.Vector3((pt.x - pos.x) / T, (gy + 0.05 - pos.y) / T, (pt.z - pos.z) / T), g: 0, t: 0, left: 99, state: 'fly', hit: new Set(), pierce: 0, trail: 0, spin: 0 });
  },
  updateGldRain(dt) {
    const S = this.gldRain; if (!S) return;
    const G = this.G, p = S.p, fx = this.gldFx();
    S.t += dt;
    if (S.t > -0.1 && (S.glit += dt) > 0.05) { // glittering as it falls: a few gold motes drifting down over the spot
      S.glit = 0; const a = rand(0, TAU), r = Math.sqrt(Math.random()) * p.radius;
      G.vfx.spark.spawn({ x: S.at.x + Math.cos(a) * r, y: S.at.y + rand(2.5, 4), z: S.at.z + Math.sin(a) * r, vy: -5, life: 0.55, size: 0.2, size1: 0.05, color: '#ffe6a0', alpha: 0.6, alpha1: 0, spin: 4 });
    }
    const o = { rain: true, dmgPct: p.dmgPct, impactRadius: p.impactRadius };
    while (S.t >= S.dropped * S.every && S.dropped < S.n) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * p.radius;
      this.gldDrop(_v.set(S.at.x + Math.cos(a) * r, S.at.y, S.at.z + Math.sin(a) * r), o);
      S.dropped++;
    }
    if (S.dropped >= S.n) {
      const rb = S.o.rainbow; // (Rainbow: the last volley lands together on the middle)
      if (rb && !S.bow) { S.bow = true; const ob = { rain: true, dmgPct: p.dmgPct * rb.pct / 100, impactRadius: rb.r * 0.6 }; for (let i = 0; i < rb.n; i++) { const a = i / rb.n * TAU; this.gldDrop(_v.set(S.at.x + Math.cos(a) * rb.r * 0.5, S.at.y, S.at.z + Math.sin(a) * rb.r * 0.5), ob); } }
      S.ring?.end(); this.gldRain = null;
    }
  },
  /** a rain javelin lands: everything within its impact radius is bonked */
  gldRainHit(J) {
    const o = J.o, fx = this.gldFx();
    fx.bonk(_h.set(J.pos.x, J.pos.y + 0.15, J.pos.z)); fx.dust(J.pos, 1);
    sfx('jav_stick', { pos: J.pos, vol: 0.35, pitch: rand(0.95, 1.15) });
    this.nova(J.pos, o.impactRadius, e => this.gldHit(e, { dmgPct: o.dmgPct, knock: 0.25, from: J.pos }));
  },

  // ================================================================== Steady Paws (combat.hitPlayer → goldenGuard)
  /** a blow on the dragoon: the Wing Shield soaks it first (goldenWhelp.js), then a foe that hit him up close may run
   *  onto the braced lance (Steady Paws) → the damage left */
  goldenGuard(dmg, src) {
    const G = this.G, P = G.player;
    if (P?.hero !== 'golden') return dmg;
    if (this.gldShieldSoak) dmg = this.gldShieldSoak(dmg, src);
    const b = G.derived?.brace, now = G.engine.time || 0;
    if (b && src && isFoe(src) && P.weaponType === 'lance' && !P.lanceThrown && now - (this.gldBraceT ?? -9) >= b.every
      && dist(src.pos.x, src.pos.z, P.pos.x, P.pos.z) < 2.4 + (src.radius || 0.3) && Math.random() * 100 < b.chance) {
      this.gldBraceT = now;
      const e = src, f = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (!P.anim.busy() && !this.charge?.charging) { P.faceTarget = P.facing = f; P.anim.play('lanceThrust1', { speed: 1.8 }); }
      _d.set(Math.sin(f), 0, Math.cos(f));
      this.gldFx().streak(_v.set(P.pos.x + _d.x * 0.3, P.pos.y + 0.62, P.pos.z + _d.z * 0.3), _d, Math.max(0.8, dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z)), { width: 0.4, life: 0.18 });
      this.gldFx().bonk(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), true);
      this.gldHit(e, { dmgPct: b.dmgPct, knock: 0.9, from: P.pos }, true);
      sfx('lance_poke', { pitch: 0.8 });
      G.ui?.float?.(_v.set(P.pos.x, P.pos.y + 1.7, P.pos.z).clone(), 'Braced!', { kind: 'status', color: '#bfe8c8' });
    }
    return dmg;
  },

  // ================================================================== Good Retriever
  /** a javelin came down: with Good Retriever it stays a while to be scooped up (not the rain or the fling) */
  gldJavLand(J) {
    const r = this.G.derived?.retrieve;
    if (!r || J.o.rain || J.o.rise || J.o.stick) return;
    let n = 0; for (const x of this.gldJav || []) if (x.fetch && x.state === 'stuck') n++;
    if (n < 12) { J.life = r.stick; J.fetch = true; } // (up to 12 lying about at once: the rest fade as ever)
  },
  /** a javelin bonked a foe: with Good Retriever, it's marked for the lance */
  gldMark(e) {
    const r = this.G.derived?.retrieve; if (!r || !isFoe(e)) return;
    e.gldMark = { until: (this.G.engine.time || 0) + r.markDur, pct: r.markPct };
    (this.gldMarked ||= new Set()).add(e);
  },
  /** he trots over a landed javelin and scoops it up: zoom and pep */
  gldScoop(J) {
    const G = this.G, P = G.player, r = G.derived?.retrieve; if (!r) return;
    G.actions.restoreZoom?.(r.zoom);
    G.combat.buffs.retrieve = { t: r.aspdDur, aspd: r.aspd };
    G.vfx.sparkle(_v.set(J.pos.x, J.pos.y + 0.3, J.pos.z), { n: 6, color: '#ffe6a0', r: 0.3, size: 0.22 });
    G.ui?.float?.(_w.set(P.pos.x, P.pos.y + 1.6, P.pos.z).clone(), `+${r.zoom}`, { kind: 'status', color: '#9fd0ff' });
    sfx('jav_scoop');
  },
  updateGldMarks(dt) {
    const S = this.gldMarked; if (!S?.size) return;
    if ((this._markT = (this._markT || 0) + dt) < 0.32) return;
    this._markT = 0;
    const now = this.G.engine.time || 0;
    let n = 0;
    for (const e of S) {
      if (!e.alive || !e.gldMark || e.gldMark.until <= now) { S.delete(e); continue; }
      if (n++ < 12) this.G.vfx.spark.spawn({ x: e.pos.x + rand(-0.1, 0.1), y: e.pos.y + (e.height || 1) + 0.35, z: e.pos.z + rand(-0.1, 0.1), vy: 0.5, life: 0.4, size: 0.26, size1: 0.05, color: '#ffd27a', alpha: 0.75, alpha1: 0, spin: 5 });
    }
  },

  // ================================================================== per frame / clear
  updateGoldenArts(dt) {
    this.updateGldJump(dt); this.updateGldSpin(dt); this.updateGldDash(dt); this.updateGldStar(dt); this.updateGldRain(dt); this.updateGldMarks(dt);
    if (this.gldEmberHand > 0) { // (the Emberleaf javelin in his paw, catching)
      const P = this.G.player;
      if ((P.anim.A?.javW || 0) > 0.5 && Math.random() < dt * 25) this.gldFx().embers(this.gldHand(_v), 1, { r: 0.05, up: 0.8, size: 0.18, life: 0.4 });
    }
  },
  clearGoldenArts() {
    const P = this.G.player;
    this.gldJump?.mark?.end(); this.gldJump = null; this.gldSpin = null; this.gldDash = null; this.gldRain?.ring?.end(); this.gldRain = null;
    const S = this.gldStar; if (S) { S.ring?.end(); if (S.L) S.L.holder.visible = false; } this.gldStar = null;
    if (P) { P.lanceThrown = false; if (P.leap?.own) P.leap = null; if (P.dash?.own) P.dash = null; }
    this.gldMarked?.clear(); this.gldEmberHand = 0;
  },
};

export function installGoldenArts(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
