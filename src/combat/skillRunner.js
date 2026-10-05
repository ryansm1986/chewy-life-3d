// Executes the heroes' skills: animation timing, zoom costs, cooldowns, hit shapes, projectiles and VFX.
// Chewy's casts are below; Moka's (cast_splash … cast_mallards, the staff bolt, Moonbeam's channel) are mixed in from mokaSpells.js.
import * as THREE from 'three';
import { skillRuntime, usable, getSkill } from '../rpg/skills.js';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, angleDiff } from '../core/util.js';
import { SpiritPup, Decoy } from './allies.js';
import { ringTexture } from '../gfx/textures.js';
import { installMokaSpells, setSpellGame } from './mokaSpells.js';
import { chargeRuntime, perkAt } from '../rpg/charge.js';
import { ChargeController } from './charge.js';
import { installChargedSkills } from './chargedSkills.js';

const UP = new THREE.Vector3(0, 1, 0);
const ELEM_COL = { phys: '#fffaf0', fire: '#ffae5a', frost: '#9fe0ff', zap: '#fff27a', stink: '#b8e880', holy: '#fff0b0' };
// Melee reach assist: a swing aimed at a monster that is just out of reach (≤ LUNGE) commits with a quick, collision-safe
// lunge that tracks the target through the wind-up; one that is further away walks up first and swings on arrival.
const LUNGE = 1.2, LUNGE_SPEED = 10;
const _d = new THREE.Vector3();
const _slide = new THREE.Vector3();

export class SkillRunner {
  constructor(G) {
    this.G = G; this.cds = {}; this.channel = null; this.combo = 0; this.orbits = [];
    this.queued = null;
    this.charge = new ChargeController(this); // hold-to-charge (docs/CHARGE.md)
    setSpellGame(G);
  }
  get combat() { return this.G.combat; }
  rt(id) { return skillRuntime(id, this.G.state, this.G.derived); }
  cooldown(id) { return this.cds[id] || 0; }
  cooldownFrac(id) { const r = this.rt(id); if (!r || !r.cd) return 0; return clamp((this.cds[id] || 0) / r.cd); }
  attacksPerSec() { const D = this.G.derived; return (D.aspd || 1.4) * this.combat.atkMul() * (this.combat.buffs.shrineZoom ? 1.35 : 1); }
  // aim: world point; returns true if cast started. charge = { stage, t, free } casts the charged version (docs/CHARGE.md)
  tryCast(id, aim, target = null, charge = null) {
    const G = this.G, P = G.player;
    if (!id || !P || G.playerDead) return false;
    if (P.anim.busy() && id !== 'whirl') { this.queued = { id, aim: aim.clone(), target, t: 0.25, charge }; return false; }
    const def = getSkill(id); if (!def) return false;
    // auto-swap to the right weapon for weapon skills
    if (def.wep && G.derived.weaponType !== def.wep) {
      const E = G.state.equipment, alt = G.state.player.activeWeapon === 1 ? E.weapon : E.weaponAlt; // the weapon NOT in hand
      if (alt && alt.wtype === def.wep) { G.actions.swapWeapons(); this.syncWeapon(); Events.emit('sfx', 'ui_equip'); }
      else {
        if (!this._noWepT || G.engine.time - this._noWepT > 1.5) { this._noWepT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(1.6), def.wep === 'ball' ? 'No ball equipped!' : def.wep === 'staff' ? 'No staff equipped!' : 'No bone sword equipped!', { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); }
        return false;
      }
    }
    const u = usable(id, G.state, G.derived);
    if (!u.ok) { if (!this._warnT || G.engine.time - this._warnT > 1) { this._warnT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(1.6), u.why, { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); } return false; }
    if ((this.cds[id] || 0) > 0) return false;
    if (this.channel && this.channel.id === id) return true; // already channelling (Tail Spin, Moonbeam)
    const R = charge ? chargeRuntime(id, G.state, G.derived, charge.stage, charge) : this.rt(id); if (!R) return false;
    // melee: never swing at thin air when a monster was clicked — walk up (too far) or lunge (just out of reach)
    let melee = null;
    if (this.isMelee(id, R)) {
      if (!target || !target.alive || target.team !== 'enemy') target = this.softTarget(R, aim);
      if (target) {
        const reach = this.reach(R, target), d = dist(target.pos.x, target.pos.z, P.pos.x, P.pos.z);
        if (d > reach + LUNGE && !target.breakable && !R.charge) { this.approachTo(id, target); return false; }
        if (d <= reach + LUNGE || target.breakable) melee = { target, reach, budget: LUNGE, cost: def.kind !== 'channel' ? R.cost : 0, charged: !!R.charge }; // (a charged swing that's far off just swings: its shockwave reaches)
        aim = target.pos;
      }
    }
    if (def.kind !== 'channel' && R.cost > 0 && !G.actions.spendZoom(R.cost)) return false;
    this.cds[id] = R.cd;
    P.moveTarget = null; this.approach = null;
    P.faceTarget = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z); P.facing = P.faceTarget;
    this.melee = melee;
    const fn = (R.charge && this[`charged_${id}`]) || this[`cast_${id}`] || this.castGeneric;
    fn.call(this, R, aim.clone(), target);
    G.state.player.lastCast = id;
    return true;
  }
  // ---------------------------------------------------------------- melee reach assist
  isMelee(id, R) { return id === 'chomp' || (id === 'attack' && !R.params?.projectile); }
  // centre-to-centre distance at which the swing's arc (radius + body) still lands with a little margin
  reach(R, target) { return (R.params?.radius || 1.8) + (target?.radius || 0.3) - 0.15; }
  // no monster under the cursor: a monster within lunge reach roughly where Chewy is aiming
  softTarget(R, aim) {
    const P = this.G.player, fa = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
    let best = null, bs = 1e9;
    // the cursor's ground point is right on a monster (the screen pick just missed it): that's the one
    for (const e of this.combat.entities) {
      if (!e.alive || e.team !== 'enemy' || e.breakable) continue;
      const d = dist(e.pos.x, e.pos.z, aim.x, aim.z);
      if (d < (e.bodyR || e.radius || 0.3) + 0.5 && d < bs) { bs = d; best = e; }
    }
    if (best) return best;
    bs = 1e9;
    for (const e of this.combat.entities) {
      if (!e.alive || e.team !== 'enemy' || e.breakable) continue;
      const d = dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z);
      if (d > this.reach(R, e) + LUNGE) continue;
      const off = Math.abs(angleDiff(fa, Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z)));
      if (off > 0.9 && d > (e.radius || 0.3) + 0.8) continue;
      const s = d + off * 2;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  // D2-style: clicked a monster out of reach → walk up to it and swing once in range (cancelled by any other move order)
  approachTo(id, target) {
    const P = this.G.player;
    const a = this.approach && this.approach.target === target && this.approach.id === id ? this.approach : (this.approach = { id, target, mt: new THREE.Vector3() });
    a.t = 3;
    a.mt.copy(target.pos); P.moveTarget = a.mt; P.interactTarget = null;
  }
  updateApproach(dt) {
    const a = this.approach, G = this.G, P = G.player;
    if (!a) return;
    a.t -= dt;
    if (!a.target.alive || a.t <= 0 || G.playerDead || P.moveTarget !== a.mt) { if (P.moveTarget === a.mt) P.moveTarget = null; this.approach = null; return; }
    const R = this.rt(a.id);
    if (!R) { this.approach = null; return; }
    const d = dist(a.target.pos.x, a.target.pos.z, P.pos.x, P.pos.z);
    if (d <= this.reach(R, a.target) + LUNGE * 0.5) {
      if (P.anim.busy()) return;
      this.approach = null; P.moveTarget = null;
      this.tryCast(a.id, a.target.pos.clone(), a.target);
    } else a.mt.copy(a.target.pos); // follow a moving target
  }
  // during the wind-up: turn to the target and lunge (≤ LUNGE total, quick, collision-safe) if it drifted out of reach
  updateMelee(dt) {
    const m = this.melee, G = this.G, P = G.player;
    if (!m) return;
    const act = P.anim.action?.name;
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !(act === 'swing' || act === 'swing2')) { this.melee = null; return; }
    const t = m.target, dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = Math.atan2(dx, dz); P.facing = P.faceTarget;
    // the target blinked / was flung out of reach mid-wind-up: pull the swing instead of slashing thin air (zoom refunded)
    if (d > m.reach + m.budget + 0.35) { if (m.charged) { this.melee = null; return; } P.anim.stop(act); this.melee = null; if (m.cost) G.actions.restoreZoom?.(m.cost); return; } // (a charged swing still lands: its shockwave rolls on)
    const want = d - (m.reach - 0.3);
    if (want <= 0 || m.budget <= 0) return;
    const step = Math.min(want, m.budget, LUNGE_SPEED * dt);
    const before = P.pos.clone();
    P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, before);
    P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    const moved = Math.hypot(P.pos.x - before.x, P.pos.z - before.z);
    m.budget = moved < step * 0.3 ? 0 : m.budget - moved; // blocked by a wall: stop lunging
    if (moved > 0.02 && Math.random() < 0.5) G.vfx.dust(P.pos, { n: 1 });
  }
  // at the hit frame: if the aimed-at monster slipped just out of reach (a hop, a knockback), close the gap with what's
  // left of the lunge budget so the blow still connects
  snapIn(target, radius) {
    const m = this.melee, G = this.G, P = G.player;
    if (!m || !target || m.target !== target || !target.alive) return;
    const dx = target.pos.x - P.pos.x, dz = target.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    const step = Math.min(d - (radius + (target.radius || 0.3) - 0.25), m.budget);
    if (step <= 0.02) return;
    const before = P.pos.clone();
    P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, before);
    P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    m.budget = 0;
  }
  // big bodies (bosses) aren't pushed by Chewy and don't push him: keep him from ending up inside one
  keepOutOfBigBodies() {
    const G = this.G, P = G.player;
    if (P.leap || G.mode !== 'dungeon') return;
    for (const e of this.combat.entities) {
      if (!e.alive || e.team !== 'enemy' || !e.def?.boss) continue;
      const mn = (e.bodyR || e.radius) + 0.36, dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, d2 = dx * dx + dz * dz;
      if (d2 >= mn * mn) continue;
      const d = Math.sqrt(d2) || 1e-3, before = P.pos.clone(), k = Math.min(mn - d, 0.25);
      P.pos.x += (d2 > 1e-6 ? dx / d : 1) * k; P.pos.z += (d2 > 1e-6 ? dz / d : 0) * k;
      G.world.collision?.resolve(P.pos, P.radius, before);
    }
  }
  syncWeapon() { this.G.player.setWeapon(this.G.derived.weaponType || 'sword'); }
  animSpeed(base = 0.46) { return this.attacksPerSec() * base; }
  // ---------------------------------------------------------------- hit helpers
  // primary: the monster the swing was aimed at — it's hit if it's anywhere within reach (+ a little forgiveness),
  // even if it slid out of the arc during the wind-up
  arcHit(origin, facing, radius, arcDeg, fn, primary = null) {
    const half = (arcDeg * Math.PI / 180) / 2;
    let got = false;
    this.combat.inRadius(origin.x, origin.z, radius, 'ally', (e, d) => {
      const a = Math.atan2(e.pos.x - origin.x, e.pos.z - origin.z);
      if (d < 0.8 || Math.abs(angleDiff(facing, a)) <= half + 0.15) { if (e === primary) got = true; fn(e, d); }
    });
    if (primary && !got && primary.alive && dist(primary.pos.x, primary.pos.z, origin.x, origin.z) < radius + (primary.radius || 0.3) + 0.35) fn(primary, 0);
  }
  nova(center, radius, fn) { this.combat.inRadius(center.x, center.z, radius, 'ally', fn); }
  forward() { const P = this.G.player; return new THREE.Vector3(Math.sin(P.facing), 0, Math.cos(P.facing)); }
  handPos() { const P = this.G.player; return P.pos.clone().add(this.forward().multiplyScalar(0.4)).setY(P.pos.y + 0.75); }
  // ---------------------------------------------------------------- basic attack
  cast_attack(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    if (p.bolt) return this.cast_staffBolt(R, aim, target); // Moka's staff: a free sparkle bolt
    if (p.projectile) {
      P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => { if (ev === 'release') this.throwBall({ dmgPct: p.dmgPct, speed: p.speed, range: p.range, pierce: p.pierce, returns: true }, aim); } });
      return;
    }
    const alt = (this.combo++ % 2) === 1;
    P.anim.play(alt ? 'swing2' : 'swing', { speed: this.animSpeed(0.46), onEvent: ev => {
      if (ev !== 'hit') return;
      this.snapIn(target, p.radius);
      const f = P.facing;
      G.vfx.slash(P.pos, f, { arc: 2.1, r: p.radius * 0.95, reverse: alt, color: '#fffaf0', life: 0.2 });
      Events.emit('sfx', 'swing');
      let hit = 0;
      this.arcHit(P.pos, f, p.radius, p.arc, (e) => { this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }); hit++; }, target);
      if (hit) G.engine.rig.shake(0.12);
      this.melee = null;
    } });
  }
  /** move the hero along dir by dist through the walls, cliffs, doors and region bounds: in sub-steps of at most
   *  0.25 m through the same collision as walking (a fast dash on a slow frame can't step past a thin wall), and never
   *  ending off the walkable floor (the nav grid) — docs/CHARGE.md (dashes, drifts) */
  slideHero(dir, dist) {
    const G = this.G, P = G.player, W = G.world, n = Math.max(1, Math.ceil(dist / 0.25)), st = dist / n;
    for (let i = 0; i < n; i++) {
      _slide.copy(P.pos);
      P.pos.x += dir.x * st; P.pos.z += dir.z * st;
      W.collision?.resolve(P.pos, P.radius, _slide);
      if (W.walkable && !W.walkable(P.pos.x, P.pos.z)) { P.pos.copy(_slide); break; }
      if (Math.abs(P.pos.x - _slide.x) + Math.abs(P.pos.z - _slide.z) < st * 0.2) break; // (stopped by a wall)
    }
    P.pos.y = W.heightAt(P.pos.x, P.pos.z);
  }
  /** is the straight line from a to b open floor (no wall, closed door, cliff or region edge)? */
  lineClear(a, b, pad = 0.25) {
    const W = this.G.world, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(d / 0.25));
    for (let i = 1; i <= n; i++) { const x = a.x + dx * i / n, z = a.z + dz * i / n; if (W.collision?.solidAt?.(x, z, pad) || (W.walkable && !W.walkable(x, z))) return false; }
    return true;
  }
  throwBall(o, aim, kind = 'ball') {
    const G = this.G, P = G.player;
    const from = this.handPos();
    const dir = aim.clone().sub(P.pos).setY(0); if (dir.lengthSq() < 0.01) dir.copy(this.forward()); dir.normalize();
    Events.emit('sfx', 'throw');
    return this.combat.spawn({
      team: 'ally', kind, pos: from, dir, speed: o.speed || 15, range: o.range || 11, radius: 0.32, pierce: o.pierce || 0, returns: o.returns !== false,
      ricochet: o.ricochet || 0, bounceRange: o.bounceRange, bounces: o.wallBounces ?? 1,
      onHit: o.onHit || ((e) => this.combat.hitMonster(e, { dmgPct: o.dmgPct, element: o.element || 'phys', knock: 0.3, from: P.pos })),
      onEnd: o.onEnd,
    });
  }
  // ---------------------------------------------------------------- Bone Arts
  cast_chomp(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('swing', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'hit') return;
      this.snapIn(target, p.radius);
      const f = P.facing, arc = p.arc * Math.PI / 180;
      G.vfx.slash(P.pos, f, { arc, r: p.radius * 1.1, width: 1.1, color: '#fff4d8', life: 0.3 });
      G.vfx.slash(P.pos, f, { arc: arc * 0.9, r: p.radius * 0.75, width: 0.7, color: '#ffd070', life: 0.24, reverse: true });
      G.vfx.decal(P.pos.clone().add(this.forward().multiplyScalar(p.radius * 0.5)), { r: p.radius * 0.8, color: '#ffe0a0', additive: true, opacity: 0.35, life: 0.5, grow: 0.4 });
      Events.emit('sfx', 'swing_heavy'); Events.emit('sfx', 'bark', { pitch: 0.8 });
      this.arcHit(P.pos, f, p.radius, p.arc, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }), target);
      G.engine.rig.shake(0.25);
      this.melee = null;
    } });
  }
  cast_whirl(R, aim) {
    const P = this.G.player;
    if (this.channel?.id === 'whirl') return;
    this.channel = { id: 'whirl', R, acc: 1 / Math.max(1, R.params.hitsPerSec), t: 0 }; // first hit lands immediately
    P.anim.play('spin'); P.canMoveWhileActing = true;
    Events.emit('sfx', 'swing_heavy');
  }
  cast_dig(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const d = Math.min(p.leap, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const dir = aim.clone().sub(P.pos).setY(0).normalize();
    const start = P.pos.clone(), end = P.pos.clone();
    for (let t = 0.25; t <= d + 1e-6; t += 0.25) {
      const x = start.x + dir.x * t, z = start.z + dir.z * t;
      if (G.world.collision?.solidAt?.(x, z, P.radius * 0.8)) break;
      end.set(x, start.y, z);
    }
    P.leap = { start, end, t: 0, dur: 0.5 / 0.8 * 0.62 };
    P.anim.play('slam', { speed: 0.8, onEvent: ev => {
      if (ev !== 'impact') return;
      P.leap = null;
      G.vfx.shockwave(P.pos, p.radius * 1.2, '#ffe0b0'); G.vfx.dustRing(P.pos, p.radius);
      G.vfx.decal(P.pos, { r: p.radius * 0.9, color: '#3a2418', opacity: 0.55, life: 3.5 });
      G.vfx.flash(P.pos.clone().setY(0.6), '#ffe0a0', p.radius * 1.5, 0.22);
      for (let i = 0; i < 10; i++) G.vfx.smoke.spawn({ x: P.pos.x, y: 0.2, z: P.pos.z, vx: rand(-3, 3), vy: rand(3, 6), vz: rand(-3, 3), life: 0.8, size: 0.25, size1: 0.1, color: '#8a6a4a', alpha: 1, alpha1: 0, grav: 12 });
      Events.emit('sfx', 'dig'); Events.emit('sfx', 'explosion_small');
      G.engine.rig.shake(0.7); G.engine.hitStop = 0.06;
      this.nova(P.pos, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, stun: p.stun, from: P.pos }));
    } });
  }
  cast_bonestorm(R) {
    const G = this.G, P = G.player, p = R.params;
    const bones = [];
    for (let i = 0; i < p.count; i++) {
      const m = new THREE.Mesh(this.G.player.sword.geometry, this.G.player.rig.propMat || this.G.player.rig.mat); m.scale.setScalar(0.9); m.castShadow = true;
      G.world.scene.add(m); bones.push({ m, a: i / p.count * TAU, hit: new Map() });
    }
    const rune = G.vfx.decal(P.pos, { r: p.radius * 1.15, color: '#ffe6a8', additive: true, opacity: 0.5, life: p.duration, spin: 1.5, tex: ringTexture() });
    this.orbits.push({ bones, t: 0, p, rune });
    P.anim.play('cast'); Events.emit('sfx', 'buff');
    G.vfx.ring(P.pos, { color: '#fff4d8', r0: 0.3, r1: p.radius, life: 0.5 });
  }
  // ---------------------------------------------------------------- Fetch Mastery
  cast_throw(R, aim) {
    const P = this.G.player, p = R.params;
    P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => { if (ev === 'release') this.throwBall({ dmgPct: p.dmgPct, speed: p.speed, range: p.range, pierce: p.pierce, returns: true }, aim); } });
  }
  cast_ricochet(R, aim) {
    const P = this.G.player, p = R.params;
    P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      this.throwBall({ speed: p.speed, range: 10, ricochet: p.bounces, bounceRange: p.bounceRange, returns: false, onHit: e => { this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'zap', from: P.pos }); this.G.vfx.sparks(e.pos.clone().setY(0.6), { n: 6, color: '#fff27a', speed: 5 }); } }, aim);
    } });
  }
  cast_multi(R, aim) {
    const P = this.G.player, p = R.params;
    P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      const base = aim.clone().sub(P.pos).setY(0).normalize();
      for (let i = 0; i < p.count; i++) {
        const a = p.count > 1 ? (i / (p.count - 1) - 0.5) * p.spread * Math.PI / 180 : 0;
        const dir = base.clone().applyAxisAngle(UP, a);
        this.throwBall({ dmgPct: p.dmgPct, speed: p.speed, range: p.range, pierce: p.pierce, returns: false }, P.pos.clone().add(dir));
      }
    } });
  }
  cast_blaze(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      const boom = (pos) => {
        G.vfx.fire(pos, 30, { spread: p.radius * 0.6, size: 0.85 }); G.vfx.ring(pos, { color: '#ff9a3c', r0: 0.2, r1: p.radius * 1.4, life: 0.45, opacity: 1 }); G.vfx.ring(pos, { color: '#ffe070', r0: 0.1, r1: p.radius * 0.9, life: 0.3 }); G.vfx.flash(pos.clone().setY(0.6), '#ff9a4a', 3.2, 0.24);
        G.vfx.decal(pos, { r: p.radius * 1.0, color: '#2a140c', opacity: 0.6, life: p.burnDuration + 1.5 });
        G.vfx.decal(pos, { r: p.radius * 0.9, color: '#ff7a2a', additive: true, opacity: 0.3, life: p.burnDuration });
        G.vfx.poof(pos.clone().setY(0.3), { color: '#6a4a44', n: 10, size: 0.8 });
        G.vfx.light(pos, '#ff8a3a', 16, 8, 0.4); G.engine.rig.shake(0.35); Events.emit('sfx', 'explosion_small'); Events.emit('sfx', 'fire_whoosh');
        this.nova(pos, p.radius, e => { const dmg = this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'fire', from: pos, knock: 0.4 }); e.applyStatus?.('burn', p.burnDuration, dmg * p.burnPct / 100); });
        // lingering burning ground
        this.combat.addZone({ pos: pos.clone(), radius: p.radius * 0.8, life: p.burnDuration, tick: 0.5, update: () => { if (Math.random() < 0.5) G.vfx.fire(pos.clone().add(new THREE.Vector3(rand(-1, 1) * p.radius * 0.6, 0, rand(-1, 1) * p.radius * 0.6)), 1, { size: 0.5 }); }, onTick: z => this.nova(z.pos, z.radius, e => e.applyStatus?.('burn', 1.5, Math.max(2, this.G.derived.dmgMax * 0.2))) });
      };
      this.throwBall({ speed: p.speed, range: p.range, returns: false, wallBounces: 0, onHit: e => boom(e.pos.clone()), onEnd: (pr) => boom(pr.pos.clone().setY(0)) }, aim, 'blaze');
    } });
  }
  cast_fetchstorm(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const d = Math.min(p.range, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const center = P.pos.clone().add(aim.clone().sub(P.pos).setY(0).normalize().multiplyScalar(d));
    P.anim.play('cast'); Events.emit('sfx', 'bark');
    G.vfx.ring(center, { color: '#ffe08a', r0: p.radius * 0.3, r1: p.radius, life: 0.5 });
    G.vfx.decal(center, { r: p.radius, color: '#ffe08a', additive: true, opacity: 0.22, life: p.duration + 0.4, spin: 0.6 });
    let spawned = 0;
    this.combat.addZone({ pos: center, life: p.duration + 0.8, tick: p.duration / p.count, onTick: () => {
      if (spawned++ >= p.count) return;
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * p.radius;
      const to = center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      this.combat.spawn({ team: 'ally', kind: 'moonball', pos: to.clone().add(new THREE.Vector3(-2, 9, -2)), lob: { to, h: 0.5, time: 0.45 }, onEnd: () => {
        G.vfx.impact(to, { color: '#ffe08a', r: p.impactRadius * 1.1 }); G.vfx.dust(to, { n: 3 });
        Events.emit('sfx', 'ball_bounce', { vol: 0.4 });
        this.nova(to, p.impactRadius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, from: to, knock: 0.2, silent: false }));
      } });
    } });
  }
  cast_decoy(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const d = Math.min(p.throwRange, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const to = P.pos.clone().add(aim.clone().sub(P.pos).setY(0).normalize().multiplyScalar(d));
    P.anim.play('throw', { speed: 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.combat.spawn({ team: 'ally', kind: 'ball', pos: this.handPos(), lob: { to, h: 2.5, time: 0.6 }, onEnd: () => {
        // limit active decoys
        this.decoys = (this.decoys || []).filter(x => x.alive);
        while (this.decoys.length >= p.maxDecoys) this.decoys.shift().expire();
        this.decoys.push(new Decoy(G, to, p));
      } });
    } });
  }
  // ---------------------------------------------------------------- Pack Spirit
  cast_woof(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('bark', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'bark');
      G.vfx.ring(P.pos, { color: '#ffffff', r0: 0.3, r1: p.radius * 1.1, life: 0.45, y: 0.6, opacity: 1 }); G.vfx.ring(P.pos, { color: '#9fd8ff', r0: 0.2, r1: p.radius * 0.8, life: 0.35 }); G.vfx.ring(P.pos, { color: '#cfe8ff', r0: 0.2, r1: p.radius, life: 0.5, flat: false });
      G.vfx.decal(P.pos, { r: p.radius * 0.8, color: '#bfe6ff', additive: true, opacity: 0.35, life: 0.6, grow: 0.3 });
      G.engine.rig.shake(0.3);
      this.nova(P.pos, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, stun: p.stun, from: P.pos }));
    } });
  }
  cast_zoom(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const dir = aim.clone().sub(P.pos).setY(0).normalize();
    P.dash = { dir, left: p.distance, speed: p.speed, hit: new Set(), p };
    P.anim.play('roll', { speed: 1.4 }); P.invuln = true;
    Events.emit('sfx', 'dash'); G.vfx.dust(P.pos, { n: 4 });
  }
  cast_packcall(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('bark', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'howl');
      this.pups = (this.pups || []).filter(x => x.alive);
      while (this.pups.length >= p.pups) this.pups.shift().expire();
      for (let i = this.pups.length; i < p.pups; i++) {
        const a = i / p.pups * TAU;
        this.pups.push(new SpiritPup(G, P.pos.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))), p));
      }
      G.combat.buffs.shadowPower = { dmg: p.shadowDmg, life: p.shadowLife, t: p.duration };
      G.companion?.empower?.(p);
    } });
  }
  cast_treat(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const d = Math.min(p.range, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const to = P.pos.clone().add(aim.clone().sub(P.pos).setY(0).normalize().multiplyScalar(d || 0.01));
    P.anim.play('throw', { speed: 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.combat.spawn({ team: 'ally', kind: 'bone', pos: this.handPos(), lob: { to, h: 2.2, time: 0.5 }, onEnd: () => {
        G.vfx.heal(to); G.vfx.petals(to, 10); Events.emit('sfx', 'heal');
        const D = G.derived;
        if (dist(P.pos.x, P.pos.z, to.x, to.z) < p.radius + 0.5) { const h = G.actions.heal(D.lifeMax * p.healPct / 100 + p.healFlat); if (h > 0) G.ui?.float?.(P.pos.clone().setY(1.5), `+${Math.round(h)}`, { kind: 'heal' }); }
        for (const e of G.combat.entities) if (e.alive && e.team === 'ally' && dist(e.pos.x, e.pos.z, to.x, to.z) < p.radius + 0.5) e.heal?.(e.lifeMax * p.healPct / 100 + p.healFlat);
        this.nova(to, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'holy', from: to }));
      } });
    } });
  }
  cast_howl(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('bark', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'howl');
      this.combat.buffs.howl = { t: p.duration, dmg: p.dmgBuff, move: p.moveBuff };
      G.vfx.ring(P.pos, { color: '#ff9a6a', r0: 0.5, r1: p.radius, life: 0.6, y: 0.4 });
      G.vfx.pillar(P.pos, { color: '#ffb080', life: 0.8, r: 0.9, h: 4 });
      this.nova(P.pos, p.radius, e => { e.applyStatus?.('fear', p.fear); G.vfx.emote(e, 'sweat', 1.2); });
      G.ui?.toast?.(`Howl! +${p.dmgBuff}% damage`, { color: '#ffb080' });
    } });
  }
  cast_moonhowl(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('bark', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'howl');
      G.engine.post.pulse('#c8d8ff', 0.25);
      let n = 0;
      const center = P.pos.clone();
      this.combat.addZone({ pos: center, life: p.strikes * p.interval + 0.5, tick: p.interval, onTick: () => {
        if (n++ >= p.strikes) return;
        const tgt = [...this.combat.hostile('ally')].filter(e => dist(e.pos.x, e.pos.z, center.x, center.z) < p.radius);
        const spot = tgt.length ? tgt[Math.floor(Math.random() * tgt.length)].pos.clone() : center.clone().add(new THREE.Vector3(rand(-p.radius, p.radius) * 0.6, 0, rand(-p.radius, p.radius) * 0.6));
        G.vfx.pillar(spot, { color: '#dfe8ff', life: 0.6, r: p.strikeRadius * 0.6, h: 12, opacity: 1 });
        G.vfx.lightning(spot.clone().setY(12), spot.clone().setY(0.2), { color: '#e8f0ff', width: 0.15, life: 0.25, jag: 0.4 });
        G.vfx.ring(spot, { color: '#e8f0ff', r0: 0.2, r1: p.strikeRadius * 1.3, life: 0.35 });
        G.engine.rig.shake(0.3); Events.emit('sfx', 'zap');
        this.nova(spot, p.strikeRadius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'holy', from: spot, stun: 0.3 }));
      } });
    } });
  }
  castGeneric(R, aim) { this.G.player.anim.play('cast'); }
  // ---------------------------------------------------------------- per-frame
  update(dt, input) {
    const G = this.G, P = G.player;
    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.queued) { this.queued.t -= dt; if (this.queued.t <= 0) this.queued = null; else if (!P.anim.busy()) { const q = this.queued; this.queued = null; this.tryCast(q.id, q.target?.alive ? q.target.pos.clone() : q.aim, q.target, q.charge); } }
    this.charge.update(dt);
    this.updateApproach(dt);
    this.updateMelee(dt);
    // channels (Tail Spin; Moka's Moonbeam) — each needs its weapon
    if (this.channel) { const cw = getSkill(this.channel.id)?.wep; if (cw && G.derived.weaponType !== cw) this.endChannel(); }
    if (this.channel && this.channel.id !== 'whirl') this.updateMoonbeam(dt, input);
    else if (this.channel) {
      const c = this.channel, p = c.R.params, ch = c.R.charge;
      c.t += dt; c.acc += dt;
      // held (or Toggle-held); a charged spin let go keeps spinning on its own for p.spinOut s (docs/CHARGE.md)
      const held = input.holding('whirl') || c.toggleHeld, out = !held && c.spinOut > 0 && P.anim.action?.name === 'spin'; // (another skill ends a spin-out)
      if (out) { c.spinOut -= dt; if (ch?.perks?.twister) this.spinDrift(dt); }
      if ((!held && !out) || G.playerDead) { if (ch && c.spinOut !== undefined && !G.playerDead) this.spinFinish(c); this.endChannel(); }
      else {
        if (p.pull) { // a charged spin draws foes in
          for (const e of this.foesNear(P.pos.x, P.pos.z, p.radius + 2.5)) this.pullFoe(e, P.pos.x, P.pos.z, p.pull * dt, p.radius * 0.45);
          if (Math.random() < dt * 30) { const a = rand(0, TAU), r = p.radius + rand(0.5, 2.2); G.vfx.smoke.spawn({ x: P.pos.x + Math.cos(a) * r, y: 0.15, z: P.pos.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6 + Math.sin(a) * 3, vy: rand(0.2, 0.6), vz: -Math.sin(a) * r * 1.6 - Math.cos(a) * 3, life: 0.5, size: 0.3, size1: 0.6, color: '#efe2c8', alpha: 0.5, alpha1: 0, drag: 2 }); }
        }
        if (c.acc >= 1 / p.hitsPerSec) {
          c.acc = 0;
          if (!out && !G.actions.spendZoom(c.R.cost)) { this.endChannel(); G.ui?.float?.(P.pos.clone().setY(1.6), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); }
          else {
            G.vfx.slash(P.pos, rand(0, TAU), { arc: 3.4, r: p.radius, width: ch ? 0.8 : 0.6, color: ch ? '#ffe8a8' : '#fff4d8', life: 0.22 });
            if (ch) G.vfx.slash(P.pos, rand(0, TAU), { arc: 2.6, r: p.radius * 0.7, width: 0.45, color: ch.color, life: 0.2, reverse: true });
            Events.emit('sfx', 'swing', { vol: 0.5 });
            // (a charged spin also catches what it pulled in: big bodies park a little past its blades)
            this.nova(P.pos, p.radius + (p.pull ? 0.35 : 0), e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }));
          }
        }
      }
    }
    // Dig Slam leap arc
    if (P.leap && P.anim.action?.name !== 'slam') P.leap = null;
    if (P.leap) { P.leap.t += dt; const k = clamp(P.leap.t / P.leap.dur); P.pos.lerpVectors(P.leap.start, P.leap.end, k); G.world.collision?.resolve(P.pos, P.radius, P.leap.start); }
    // Zoomies dash
    if (P.dash) {
      const d = P.dash, step = Math.min(d.left, d.speed * dt);
      const before = P.pos.clone();
      this.slideHero(d.dir, step); d.left -= step;
      for (let i = 0; i < 2; i++) G.vfx.glow.spawn({ x: P.pos.x + rand(-0.2, 0.2), y: 0.5, z: P.pos.z + rand(-0.2, 0.2), life: 0.35, size: 0.6, size1: 0.1, color: '#ffd8a0', alpha: 0.6, alpha1: 0 });
      this.combat.inRadius(P.pos.x, P.pos.z, d.p.width, 'ally', e => { if (!d.hit.has(e)) { d.hit.add(e); this.combat.hitMonster(e, { dmgPct: d.p.dmgPct, knock: 0.6, from: P.pos }); } });
      if (d.left <= 0.001 || P.pos.distanceTo(before) < step * 0.3) { P.dash = null; P.invuln = false; }
    }
    // Bone Storm orbits
    for (let i = this.orbits.length - 1; i >= 0; i--) {
      const o = this.orbits[i]; o.t += dt;
      if (o.rune?.obj) o.rune.obj.position.set(P.pos.x, P.pos.y + 0.05, P.pos.z);
      for (const b of o.bones) {
        b.a += o.p.orbitSpeed * dt;
        const r = o.p.radius * (0.85 + Math.sin(o.t * 3 + b.a) * 0.1);
        b.m.position.set(P.pos.x + Math.cos(b.a) * r, P.pos.y + 0.7 + Math.sin(o.t * 4 + b.a * 2) * 0.15, P.pos.z + Math.sin(b.a) * r);
        b.m.rotation.set(Math.PI / 2, 0, -b.a + o.t * 10);
        this.combat.inRadius(b.m.position.x, b.m.position.z, 0.45, 'ally', e => {
          const last = b.hit.get(e) || -9;
          if (o.t - last >= o.p.hitInterval) { b.hit.set(e, o.t); this.combat.hitMonster(e, { dmgPct: o.p.dmgPct, knock: 0.2, from: P.pos }); }
        });
        if (Math.random() < 0.5) G.vfx.glow.spawn({ x: b.m.position.x, y: b.m.position.y, z: b.m.position.z, life: 0.28, size: 0.55, size1: 0.1, color: '#ffd890', alpha: 0.45, alpha1: 0 });
      }
      if (o.t >= o.p.duration) { if (o.volley) this.boneVolley(o); for (const b of o.bones) { G.vfx.poof(b.m.position, { n: 4, size: 0.3 }); b.m.parent?.remove(b.m); } this.orbits.splice(i, 1); }
    }
    for (const x of this.pups || []) x.update(dt);
    for (const x of this.decoys || []) x.update(dt);
    this.updateMoka(dt);
    this.keepOutOfBigBodies();
  }
  /** a charged Tail Spin winds down: one last dizzy burst around Chewy */
  spinFinish(c) {
    const G = this.G, P = G.player, p = c.R.params;
    G.vfx.slash(P.pos, rand(0, TAU), { arc: 6.2, r: p.radius * 1.1, width: 0.9, color: '#ffe8a8', life: 0.3 });
    G.vfx.charge?.burst?.(P.pos, { r: p.radius * 1.15, life: 0.36, color: c.R.charge.colorC || (c.R.charge.colorC = new THREE.Color(c.R.charge.color)), w: 0.12 });
    Events.emit('sfx', 'swing_heavy'); G.engine.rig.shake(0.25);
    const fin = perkAt(c.R, 'finale'); // (Dizzy Finale: a big fling)
    if (fin) { G.vfx.charge?.crescent?.(P.pos, P.facing, { arc: 6.2, r0: p.radius * 0.6, r1: p.radius + 2.2, life: 0.4, color: c.R.charge.color, width: 0.9 }); G.engine.rig.shake(0.45); }
    const dz = fin ? fin.dizzy : p.dizzy || 0.4;
    this.nova(P.pos, p.radius + (fin ? 0.8 : 0), e => { this.combat.hitMonster(e, { dmgPct: fin ? p.dmgPct * fin.pct / 100 : p.dmgPct, knock: fin ? 2.6 : 1.2, stun: dz, from: P.pos }); if (!e.def?.boss && !e.breakable) this.fx().dizzy(e, dz); });
  }
  endChannel() {
    const P = this.G.player, c = this.channel; this.channel = null;
    if (!c || c.id === 'whirl') P?.anim.stop('spin'); else { c.end?.(); P?.anim.stop('beam'); }
    if (P) P.canMoveWhileActing = false;
  }
  clearAll() {
    this.melee = null; this.approach = null;
    this.charge?.cancel('clear', true);
    if (this.channel) this.endChannel();
    const P = this.G.player; if (P) { P.leap = null; P.dash = null; P.invuln = false; P.canMoveWhileActing = false; if (P.anim.action?.name === 'spin') P.anim.stop('spin'); }
    for (const o of this.orbits) for (const b of o.bones) b.m.parent?.remove(b.m);
    this.orbits.length = 0; this.channel = null;
    for (const x of this.pups || []) x.expire(true); this.pups = [];
    for (const x of this.decoys || []) x.expire(true); this.decoys = [];
    this.clearMoka();
  }
}
installMokaSpells(SkillRunner.prototype);
installChargedSkills(SkillRunner.prototype);
