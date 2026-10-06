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
import { installPoeSkills } from './poeSkills.js';
import { bladeFx } from '../gfx/bladeFx.js';
import { spectralBladeGeo, stormBladeMaterial } from '../gfx/samuraiProps.js';
import { SAMURAI_CUTS } from '../actors/samuraiPoses.js';

const UP = new THREE.Vector3(0, 1, 0);
const ELEM_COL = { phys: '#fffaf0', fire: '#ffae5a', frost: '#9fe0ff', zap: '#fff27a', stink: '#b8e880', holy: '#fff0b0' };
// Melee reach assist: a swing aimed at a monster that is just out of reach (≤ LUNGE) commits with a quick, collision-safe
// lunge that tracks the target through the wind-up; one that is further away walks up first and swings on arrival.
const LUNGE = 1.2, LUNGE_SPEED = 10;
const _d = new THREE.Vector3();
const _o1 = new THREE.Vector3(), _o2 = new THREE.Vector3(), _o3 = new THREE.Vector3(), _om = new THREE.Matrix4(); // (the storm's blades: no garbage per frame)
// Chewy's samurai combo: each cut's action and trail (tilt: how much higher the trail's right end is, m; rev: the cut
// runs right to left) — a kesa down from high right, a rising backhand up to high right, a level two-handed sweep
const CUTS = [
  { act: 'cut1', arc: 2.3, tilt: 0.7, rev: true, y: 0.7, w: 0.48, pitch: 1 },
  { act: 'cut2', arc: 2.1, tilt: 0.65, rev: false, y: 0.72, w: 0.42, pitch: 1.12 },
  { act: 'cut3', arc: 2.8, tilt: 0, rev: true, y: 0.6, w: 0.56, pitch: 0.9 },
];
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
        if (!this._noWepT || G.engine.time - this._noWepT > 1.5) { this._noWepT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(1.6), def.wep === 'ball' ? 'No ball equipped!' : def.wep === 'staff' ? 'No staff equipped!' : 'No bone katana equipped!', { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); }
        return false;
      }
    }
    const u = usable(id, G.state, G.derived);
    if (!u.ok) { if (!this._warnT || G.engine.time - this._warnT > 1) { this._warnT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(1.6), u.why, { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); } return false; }
    if ((this.cds[id] || 0) > 0) return false;
    if (this.castBlocked?.(id, aim, target, charge)) return false; // (Poe: Fūma Throw waits for the fūma to come home — poeSkills.js)
    if (this.channel && this.channel.id === id) return true; // already channelling (Whirlwind Stance, Moonbeam)
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
    this.flourish = null; // (any cast cuts a pending sheathing flourish short)
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
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !(act === 'swing' || act === 'swing2' || SAMURAI_CUTS.has(act))) { this.melee = null; return; }
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
    if (p.fuma) return this.cast_fumaSlash(R, aim, target); // Poe's fūma: the one-paw slash combo (poeSkills.js)
    if (p.projectile) {
      P.anim.play('throw', { speed: this.animSpeed(0.5), onEvent: ev => { if (ev === 'release') this.throwBall({ dmgPct: p.dmgPct, speed: p.speed, range: p.range, pierce: p.pierce, returns: true }, aim); } });
      return;
    }
    // the samurai combo (actors/samuraiPoses.js): kesa, rising backhand, big two-handed sweep — one cut per attack, the
    // same speed, hit frame and arc as ever; a pause of more than ~1.3 s starts it over, and its end gets a flourish
    const now = G.engine.time;
    if (now - (this._cutT ?? -9) > 1.3) this.combo = 0;
    this._cutT = now;
    const i = this.combo++ % 3, cut = CUTS[i];
    if (P.sheathedNow) Events.emit('sfx', 'katana_draw', { vol: 0.7 });
    P.draw?.();
    P.anim.play(cut.act, { speed: this.animSpeed(0.46), onEvent: ev => {
      if (ev === 'end') { this.queueFlourish(); return; }
      if (ev !== 'hit') return;
      this.snapIn(target, p.radius);
      const f = P.facing;
      bladeFx(G).arc(P.pos, f, { arc: cut.arc, r: 1.32, tilt: cut.tilt, rev: cut.rev, y: cut.y, width: cut.w, life: 0.28 });
      Events.emit('sfx', 'swing', { pitch: cut.pitch });
      let hit = 0;
      this.arcHit(P.pos, f, p.radius, p.arc, (e) => { this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }); hit++; }, target);
      if (hit) G.engine.rig.shake(i === 2 ? 0.16 : 0.12);
      this.melee = null;
    } });
  }
  /** Unbending Stance: a block catches the blow on the blade (combat.hitPlayer calls this when a block lands) */
  onBlock() {
    const G = this.G, P = G.player;
    if (P?.hero !== 'chewy' || P.weaponType !== 'sword' || !(P.sword?.scale.x > 0.5) || P.anim.busy() || P.leap || P.dash || this.channel) return;
    P.anim.play('parry');
    P.sword.localToWorld(_d.set(0, 0.35, 0)); bladeFx(G).glint(_d, 0.55);
    G.vfx.sparks(_d, { n: 8, color: '#fff2c8', speed: 4, size: 0.24 }); Events.emit('sfx', 'katana_clang', { vol: 0.7 });
  }
  /** a combo's end: once Chewy has been idle a moment with the katana out, he sheathes it (a model with a saya: the
   *  katana goes into it) or flicks it clean (chiburi); then = what happens at the flourish's beat */
  queueFlourish(delay = 0.32, then = null) { this.flourish = { t: delay, then }; }
  updateFlourish(dt) {
    const f = this.flourish, G = this.G, P = G.player; if (!f) return;
    f.t -= dt; if (f.t > 0) return;
    if (P.hero !== 'chewy' || G.playerDead || P.leap || P.dash || this.channel || this.charge.charging) { this.flourish = null; f.then?.(); return; }
    if (P.anim.action) { if (f.t < -1.5) { this.flourish = null; f.then?.(); } return; } // (wait for the paw to be free)
    this.flourish = null;
    const sword = P.weaponType === 'sword' && P.sword?.scale.x > 0.5, fx = bladeFx(G);
    if (!sword) { f.then?.(); return; }
    if (P.saya) P.anim.play('noto', { onEvent: ev => { if (ev !== 'click') return; P.sheathe(); f.then?.(); P.rig.parts.saya?.getWorldPosition(_d); fx.glint(_d, 0.55); Events.emit('sfx', 'katana_sheath'); } });
    else P.anim.play('chiburi', { onEvent: ev => { if (ev !== 'flick') return; f.then?.(); P.sword.localToWorld(_d.set(0, 0.55, 0)); fx.flick(_d, this.forward().applyAxisAngle(UP, -1.2)); Events.emit('sfx', 'swing', { vol: 0.35, pitch: 1.5 }); } });
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
  // ---------------------------------------------------------------- Bone Blade (the samurai: actors/samuraiPoses.js, gfx/bladeFx.js)
  // Crescent Chomp: an iai draw-cut out of the left hip, the free paw joining on the hilt as it sweeps across, leaving a
  // bone-white crescent (same hit frame, arc and reach as ever)
  cast_chomp(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('iaiCut', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev === 'draw') { this.drawFromHip(); return; }
      if (ev === 'end') { this.queueFlourish(); return; }
      if (ev !== 'hit') return;
      this.snapIn(target, p.radius);
      this.crescentChomp(P.pos, P.facing, p, 1);
      Events.emit('sfx', 'swing_heavy'); Events.emit('sfx', 'bark', { pitch: 0.8, vol: 0.6 });
      this.arcHit(P.pos, P.facing, p.radius, p.arc, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }), target);
      G.engine.rig.shake(0.25);
      this.melee = null;
    } });
  }
  /** the crescent a Crescent Chomp leaves: the moon-shaped cut and the blade's own trail inside it (k: a charged one's size) */
  crescentChomp(at, f, p, k = 1) {
    const fx = bladeFx(this.G), arc = p.arc * Math.PI / 180;
    fx.arc(at, f, { arc, r: p.radius * 1.08, rev: false, y: 0.55, width: 0.5 + 0.12 * (k - 1), life: 0.4, sweep: 0.08, mode: 1, grow: 0.14 });
    fx.arc(at, f, { arc: arc * 0.92, r: p.radius * 0.8, rev: false, y: 0.68, width: 0.24, life: 0.26, sweep: 0.07, tilt: 0.25 });
    this.G.vfx.decal(_d.copy(at).addScaledVector(this.forward(), p.radius * 0.45), { r: p.radius * 0.7, color: '#3a2418', opacity: 0.22, life: 1.6, grow: 0.2 });
  }
  /** the iai's draw: if the katana is in the saya it comes out now, with a glint at the hip */
  drawFromHip() {
    const P = this.G.player, fx = bladeFx(this.G);
    if (P.sheathedNow) { P.draw(); P.rig.parts.saya?.getWorldPosition(_d); if (P.rig.parts.saya) fx.glint(_d, 0.6); }
    else { P.sword?.localToWorld(_d.set(0, 0.1, 0)); fx.glint(_d, 0.45); }
    Events.emit('sfx', 'katana_draw');
  }
  // Whirlwind Stance: planted wide, both paws on the hilt, the blade sweeping round him (samuraiPoses.js 'spin'), cherry
  // petals swirling with it; the hits, rate and reach as ever
  cast_whirl(R, aim) {
    const P = this.G.player;
    if (this.channel?.id === 'whirl') return;
    this.channel = { id: 'whirl', R, acc: 1 / Math.max(1, R.params.hitsPerSec), t: 0 }; // first hit lands immediately
    P.draw?.(); P.anim.play('spin'); P.canMoveWhileActing = true;
    Events.emit('sfx', 'swing_heavy'); Events.emit('sfx', 'katana_draw', { vol: 0.6 });
  }
  /** one turn of the whirlwind: a near-full bone-white ring at blade height and petals swept round with it */
  whirlFx(p, ch) {
    const G = this.G, P = G.player, fx = bladeFx(G), r = Math.min(p.radius, 2.6);
    fx.arc(P.pos, rand(0, TAU), { arc: 3.8, r: r * 0.78, rev: true, y: 0.6, width: ch ? 0.5 : 0.42, life: 0.24, sweep: 0.1, tilt: rand(-0.12, 0.12) });
    if (ch) fx.arc(P.pos, rand(0, TAU), { arc: 3, r: r * 0.95, rev: true, y: 0.5, width: 0.26, life: 0.22, sweep: 0.1, mode: 1, edge: new THREE.Color(ch.color) });
    fx.petalSwirl(P.pos, { n: ch ? 7 : 4, r: r * 0.85, y: 0.5, spin: -1, speed: 4.5, rise: 0.5 });
  }
  // Helmet Splitter: a leap into an overhead two-pawed cut (samuraiPoses.js 'slam') that splits the ground and stuns
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
    P.draw?.();
    P.anim.play('slam', { speed: 0.8, onEvent: ev => {
      if (ev !== 'impact') return;
      P.leap = null;
      this.splitFx(P.pos, P.facing, p.radius, 1);
      Events.emit('sfx', 'explosion_small'); Events.emit('sfx', 'swing_heavy', { pitch: 0.75 }); Events.emit('sfx', 'katana_clang', { pitch: 0.8 });
      G.engine.rig.shake(0.7); G.engine.hitStop = 0.06;
      this.nova(P.pos, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, stun: p.stun, from: P.pos }));
    } });
  }
  /** the split: the overhead cut's vertical trail, the crack running ahead, a dust ring and flung earth (k: a charged one) */
  splitFx(at, f, r, k = 1) {
    const G = this.G, fx = bladeFx(G);
    fx.arc(at, f, { arc: 2.3, r: 1.25, roll: Math.PI / 2, rev: true, y: 0.75, width: 0.5, life: 0.3, sweep: 0.05, grow: 0.05 });
    fx.crack(at, f, { len: r * 1.5 * k, r: r * 0.9, life: 3.5 + k });
    G.vfx.ring(at, { color: '#fff0d8', r0: 0.3, r1: Math.min(r * 1.1, 4.5), life: 0.4, opacity: 0.5 }); G.vfx.dustRing(at, r * 0.9);
    G.vfx.flash(_d.copy(at).setY(at.y + 0.4), '#fff0d0', 1.5, 0.18, 0.55);
    for (let i = 0; i < 12; i++) { const a = f + rand(-0.6, 0.6), v = rand(2, 4.5); G.vfx.dot.spawn({ x: at.x + Math.sin(a) * 0.6, y: at.y + 0.2, z: at.z + Math.cos(a) * 0.6, vx: Math.sin(a) * v, vy: rand(3, 6), vz: Math.cos(a) * v, life: rand(0.6, 0.9), size: rand(0.12, 0.22), size1: 0.1, color: i % 2 ? '#8a6a4a' : '#b08a64', alpha: 1, alpha1: 1, grav: 16 }); }
  }
  // Sakura Storm: spectral bone blades orbit him in a flurry of cherry petals (the blades, their reach and hits as ever)
  cast_bonestorm(R) {
    const G = this.G, P = G.player, p = R.params;
    const bones = [], geo = spectralBladeGeo(), mat = stormBladeMaterial();
    for (let i = 0; i < p.count; i++) {
      const m = new THREE.Mesh(geo, mat); m.scale.setScalar(0.85); m.renderOrder = 12;
      G.world.scene.add(m); bones.push({ m, a: i / p.count * TAU, hit: new Map() });
    }
    const rune = G.vfx.decal(P.pos, { r: p.radius * 1.15, color: '#ffd6e4', additive: true, opacity: 0.4, life: p.duration, spin: 1.5, tex: ringTexture() });
    this.orbits.push({ bones, t: 0, p, rune });
    P.anim.play('stormCall'); Events.emit('sfx', 'buff'); Events.emit('sfx', 'katana_draw', { pitch: 1.2, vol: 0.7 });
    G.vfx.ring(P.pos, { color: '#ffe0ea', r0: 0.3, r1: p.radius, life: 0.5 });
    bladeFx(G).petalSwirl(P.pos, { n: 18, r: p.radius * 0.7, y: 0.6, spin: 1, speed: 3.5, rise: 0.9 });
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
  // Kiai!: the battle cry (samuraiPoses.js 'kiai'): a zigzag shout ring out to the knockback's reach and a comic burst
  cast_woof(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('kiai', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'bark', { pitch: 0.86 }); Events.emit('sfx', 'swing_heavy', { vol: 0.5, pitch: 0.7 });
      bladeFx(G).shout(P.pos, { r: p.radius, life: 0.42 });
      G.vfx.ring(P.pos, { color: '#fff2dc', r0: 0.3, r1: p.radius * 0.75, life: 0.32, opacity: 0.55 });
      G.engine.rig.shake(0.3);
      this.nova(P.pos, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, stun: p.stun, from: P.pos }));
    } });
  }
  // Flash Draw: a draw-dash through the foes (the hits land as he passes, as ever); at the end he sheathes (or flicks the
  // blade clean) and, on that beat, the cut flashes along the path behind him
  cast_zoom(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    const dir = aim.clone().sub(P.pos).setY(0).normalize(), start = P.pos.clone();
    P.dash = { dir, left: p.distance, speed: p.speed, hit: new Set(), p, onEnd: () => this.flashEnd(start) };
    P.anim.play('flashDraw', { speed: 0.3 / Math.max(0.12, p.distance / p.speed) }); P.invuln = true;
    this.drawFromHip();
    Events.emit('sfx', 'dash'); Events.emit('sfx', 'swing', { pitch: 1.3, vol: 0.7 }); G.vfx.dust(P.pos, { n: 4 });
  }
  /** the end of a Flash Draw: the flourish, and the cut line from start to here on its beat */
  flashEnd(start, then = null) {
    const G = this.G, P = G.player, end = P.pos.clone();
    if (P.anim.action?.name === 'flashDraw') P.anim.stop('flashDraw');
    this.queueFlourish(0.06, () => { bladeFx(G).cutLine(start, end); Events.emit('sfx', 'swing_heavy', { pitch: 1.4, vol: 0.6 }); then?.(); });
  }
  // Pack Call: "Go!" — the katana thrust forward (samuraiPoses.js 'command'); the spirit pups come in tiny kabuto (allies.js)
  cast_packcall(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('command', { onEvent: ev => {
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
      this.combat.spawn({ team: 'ally', kind: 'onigiri', pos: this.handPos(), lob: { to, h: 2.2, time: 0.5 }, onEnd: () => {
        G.vfx.heal(to); this.riceCrumbs(to, 14); Events.emit('sfx', 'heal');
        const D = G.derived;
        if (dist(P.pos.x, P.pos.z, to.x, to.z) < p.radius + 0.5) { const h = G.actions.heal(D.lifeMax * p.healPct / 100 + p.healFlat); if (h > 0) G.ui?.float?.(P.pos.clone().setY(1.5), `+${Math.round(h)}`, { kind: 'heal' }); }
        for (const e of G.combat.entities) if (e.alive && e.team === 'ally' && dist(e.pos.x, e.pos.z, to.x, to.z) < p.radius + 0.5) e.heal?.(e.lifeMax * p.healPct / 100 + p.healFlat);
        this.nova(to, p.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, element: 'holy', from: to }));
      } });
    } });
  }
  /** Onigiri Toss's healing crumbs: rice grains bursting from where it lands, with a few petals */
  riceCrumbs(at, n = 14, k = 1) {
    const sp = bladeFx(this.G).spell;
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), v = rand(1.2, 3.2) * k; sp.pn.spawn({ frame: i % 4 ? 10 : 6, x: at.x, y: (at.y || 0) + 0.35, z: at.z, vx: Math.cos(a) * v, vy: rand(2, 4), vz: Math.sin(a) * v, life: rand(0.55, 0.8), size: rand(0.1, 0.16) * k, size1: 0.08, color: '#fffaf0', alpha: 1, alpha1: 0.9, grav: 10, spin: rand(-6, 6) }); }
    this.G.vfx.petals(at, 4);
  }
  // War Banner Howl: he plants the paw-crest nobori (gfx/bladeFx.js banner) and howls; it flies while the rally lasts
  cast_howl(R) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('warCry', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'howl');
      this.combat.buffs.howl = { t: p.duration, dmg: p.dmgBuff, move: p.moveBuff };
      // the banner goes in at his left side, a little behind (he plants it with his free paw)
      const f = this.forward(), at = _d.copy(P.pos).addScaledVector(f, -0.22).add(new THREE.Vector3(f.z, 0, -f.x).multiplyScalar(0.5));
      this.banner?.end(); this.banner = bladeFx(G).banner(at, { life: p.duration, scale: R.charge ? 1.1 + 0.08 * R.charge.stage : 1 });
      G.vfx.ring(P.pos, { color: '#ffd780', r0: 0.5, r1: p.radius, life: 0.6, y: 0.4, opacity: 0.7 });
      this.nova(P.pos, p.radius, e => { e.applyStatus?.('fear', p.fear); G.vfx.emote(e, 'sweat', 1.2); });
      G.ui?.toast?.(`War Banner! +${p.dmgBuff}% damage`, { color: '#e8b84a' });
    } });
  }
  // Moonlit Blades: he howls to the moon and blades of moonlight fall on the foes (the strikes as ever)
  cast_moonhowl(R, aim) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('moonCall', { onEvent: ev => {
      if (ev !== 'bark') return;
      Events.emit('sfx', 'howl');
      G.engine.post.pulse('#c8d8ff', 0.14);
      let n = 0;
      const center = P.pos.clone();
      this.combat.addZone({ pos: center, life: p.strikes * p.interval + 0.5, tick: p.interval, onTick: () => {
        if (n++ >= p.strikes) return;
        const tgt = [...this.combat.hostile('ally')].filter(e => dist(e.pos.x, e.pos.z, center.x, center.z) < p.radius);
        const spot = tgt.length ? tgt[Math.floor(Math.random() * tgt.length)].pos.clone() : center.clone().add(new THREE.Vector3(rand(-p.radius, p.radius) * 0.6, 0, rand(-p.radius, p.radius) * 0.6));
        bladeFx(G).moonBlade(spot, { scale: 3 + 0.3 * Math.min(2, p.strikeRadius - 1.4) });
        G.vfx.pillar(spot, { color: '#dfe8ff', life: 0.45, r: p.strikeRadius * 0.4, h: 9, opacity: 0.35 }); // (a faint shaft: where the blade fell from)
        G.vfx.ring(spot, { color: '#e8f0ff', r0: 0.2, r1: p.strikeRadius * 1.3, life: 0.35 });
        G.vfx.light(spot, '#c8d8ff', 4, 4, 0.25);
        G.engine.rig.shake(0.3); Events.emit('sfx', 'katana_clang', { pitch: 1.3, vol: 0.6 }); Events.emit('sfx', 'zap', { vol: 0.5 });
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
    // channels (Whirlwind Stance; Moka's Moonbeam) — each needs its weapon
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
          if (Math.random() < dt * 30) { const a = rand(0, TAU), r = p.radius + rand(0.5, 2.2); G.vfx.smoke.spawn({ x: P.pos.x + Math.cos(a) * r, y: 0.15, z: P.pos.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6 + Math.sin(a) * 3, vy: rand(0.2, 0.6), vz: -Math.sin(a) * r * 1.6 - Math.cos(a) * 3, life: 0.5, size: 0.3, size1: 0.6, color: '#efe2c8', alpha: 0.5, alpha1: 0, drag: 2 }); G.vfx.petal.spawn({ x: P.pos.x + Math.cos(a) * r, y: 0.5, z: P.pos.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.4 + Math.sin(a) * 3, vy: rand(0.2, 0.6), vz: -Math.sin(a) * r * 1.4 - Math.cos(a) * 3, life: 0.55, size: rand(0.13, 0.18), color: '#ffffff', alpha: 1, alpha1: 0, drag: 1.5, spin: rand(-6, 6), stretch: 0.8 }); } // (and petals: the gale draws them in)
        }
        if (c.acc >= 1 / p.hitsPerSec) {
          c.acc = 0;
          if (!out && !G.actions.spendZoom(c.R.cost)) { this.endChannel(); G.ui?.float?.(P.pos.clone().setY(1.6), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); }
          else {
            this.whirlFx(p, ch);
            Events.emit('sfx', 'swing', { vol: 0.5 });
            // (a charged spin also catches what it pulled in: big bodies park a little past its blades)
            this.nova(P.pos, p.radius + (p.pull ? 0.35 : 0), e => this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos }));
          }
        }
      }
    }
    // Helmet Splitter's leap arc
    if (P.leap && P.anim.action?.name !== 'slam') P.leap = null;
    if (P.leap) { P.leap.t += dt; const k = clamp(P.leap.t / P.leap.dur); P.pos.lerpVectors(P.leap.start, P.leap.end, k); G.world.collision?.resolve(P.pos, P.radius, P.leap.start); }
    // Flash Draw's dash (a bone-white blur behind him; d.onEnd: the flourish and the cut line)
    if (P.dash) {
      const d = P.dash, step = Math.min(d.left, d.speed * dt);
      const before = P.pos.clone();
      this.slideHero(d.dir, step); d.left -= step;
      G.vfx.glow.spawn({ x: P.pos.x + rand(-0.15, 0.15), y: 0.55, z: P.pos.z + rand(-0.15, 0.15), life: 0.22, size: 0.42, size1: 0.08, color: '#fff2e0', alpha: 0.28, alpha1: 0 }); // (a faint afterimage: the cut itself shows at the end)
      if (Math.random() < 0.5) G.vfx.smoke.spawn({ x: P.pos.x, y: 0.12, z: P.pos.z, vx: -d.dir.x * 1.5, vy: rand(0.2, 0.6), vz: -d.dir.z * 1.5, life: 0.35, size: 0.22, size1: 0.6, color: '#efe2c8', alpha: 0.45, alpha1: 0, drag: 3 });
      this.combat.inRadius(P.pos.x, P.pos.z, d.p.width, 'ally', e => { if (!d.hit.has(e)) { d.hit.add(e); this.combat.hitMonster(e, { dmgPct: d.p.dmgPct, knock: 0.6, from: P.pos }); } });
      if (d.left <= 0.001 || P.pos.distanceTo(before) < step * 0.3) { P.dash = null; P.invuln = false; d.onEnd?.(); }
    }
    this.updateFlourish(dt);
    // Flowing Water: the stacks show as water running at his feet
    const fr = this.combat.buffs.frenzy;
    if (fr?.stacks > 0 && P.hero === 'chewy' && P.anim.speed > 0.4) bladeFx(G).flow(P, fr.stacks, dt);
    // a whirlwind keeps petals swirling round him between its cuts
    if (this.channel?.id === 'whirl' && P.anim.action?.name === 'spin') bladeFx(G).petalTrail(_d.copy(P.pos).setY(P.pos.y + 0.6), dt, 10);
    // Sakura Storm orbits: spectral blades flying edge-out along the orbit, shedding petals
    for (let i = this.orbits.length - 1; i >= 0; i--) {
      const o = this.orbits[i]; o.t += dt;
      if (o.rune?.obj) o.rune.obj.position.set(P.pos.x, P.pos.y + 0.05, P.pos.z);
      for (const b of o.bones) {
        b.a += o.p.orbitSpeed * dt;
        const r = o.p.radius * (0.85 + Math.sin(o.t * 3 + b.a) * 0.1);
        b.m.position.set(P.pos.x + Math.cos(b.a) * r, P.pos.y + 0.7 + Math.sin(o.t * 4 + b.a * 2) * 0.15, P.pos.z + Math.sin(b.a) * r);
        const ca = Math.cos(b.a), sa = Math.sin(b.a), tilt = Math.sin(o.t * 4 + b.a * 2) * 0.25;
        _o1.set(-sa, tilt, ca).normalize(); _o2.set(-ca, 0, -sa); _o3.crossVectors(_o2, _o1); // (+Y along the motion, the edge (−X) outward)
        _om.makeBasis(_o2, _o1, _o3); b.m.quaternion.setFromRotationMatrix(_om);
        this.combat.inRadius(b.m.position.x, b.m.position.z, 0.45, 'ally', e => {
          const last = b.hit.get(e) || -9;
          if (o.t - last >= o.p.hitInterval) { b.hit.set(e, o.t); this.combat.hitMonster(e, { dmgPct: o.p.dmgPct, knock: 0.2, from: P.pos }); }
        });
        if (Math.random() < 0.35) G.vfx.glow.spawn({ x: b.m.position.x, y: b.m.position.y, z: b.m.position.z, life: 0.24, size: 0.45, size1: 0.1, color: '#ffc8dc', alpha: 0.3, alpha1: 0 });
        if (Math.random() < dt * 9) G.vfx.petal.spawn({ x: b.m.position.x, y: b.m.position.y, z: b.m.position.z, vx: -sa * 1.5, vy: rand(0.2, 0.8), vz: ca * 1.5, life: rand(0.6, 1), size: rand(0.13, 0.18), color: '#ffffff', alpha: 1, alpha1: 0, drag: 1.5, grav: 0.5, spin: rand(-6, 6), stretch: 0.8 });
      }
      if (o.t >= o.p.duration) { if (o.volley) this.boneVolley(o); for (const b of o.bones) { bladeFx(G).petalSwirl(b.m.position, { n: 5, r: 0.15, y: 0, speed: 1.5, rise: 0.8 }); G.vfx.sparkle(b.m.position, { n: 3, color: '#fff0f4', r: 0.2 }); b.m.parent?.remove(b.m); } this.orbits.splice(i, 1); }
    }
    for (const x of this.pups || []) x.update(dt);
    for (const x of this.decoys || []) x.update(dt);
    this.updateMoka(dt);
    this.updatePoe(dt);
    this.keepOutOfBigBodies();
  }
  /** a charged Whirlwind Stance winds down: one last full turn of the blade, a ring of petals, the dizzy burst */
  spinFinish(c) {
    const G = this.G, P = G.player, p = c.R.params, fx = bladeFx(G);
    fx.arc(P.pos, P.facing, { arc: 6.1, r: Math.min(p.radius, 3) * 0.85, rev: true, y: 0.55, width: 0.55, life: 0.32, sweep: 0.12 });
    fx.petalSwirl(P.pos, { n: 16, r: p.radius * 0.7, y: 0.5, spin: -1, speed: 6, rise: 0.8 });
    G.vfx.charge?.burst?.(P.pos, { r: p.radius * 1.15, life: 0.36, color: c.R.charge.colorC || (c.R.charge.colorC = new THREE.Color(c.R.charge.color)), w: 0.12 });
    Events.emit('sfx', 'swing_heavy'); G.engine.rig.shake(0.25);
    const fin = perkAt(c.R, 'finale'); // (Dizzy Finale: a big fling)
    if (fin) { fx.wave(P.pos, P.facing, { arc: 6.2, r0: p.radius * 0.6, r1: p.radius + 2.2, life: 0.4, width: 0.8, edge: new THREE.Color(c.R.charge.color) }); fx.petalSwirl(P.pos, { n: 20, r: p.radius, y: 0.5, spin: -1, speed: 8, rise: 1 }); G.engine.rig.shake(0.45); }
    const dz = fin ? fin.dizzy : p.dizzy || 0.4;
    this.nova(P.pos, p.radius + (fin ? 0.8 : 0), e => { this.combat.hitMonster(e, { dmgPct: fin ? p.dmgPct * fin.pct / 100 : p.dmgPct, knock: fin ? 2.6 : 1.2, stun: dz, from: P.pos }); if (!e.def?.boss && !e.breakable) this.fx().dizzy(e, dz); });
  }
  endChannel() {
    const P = this.G.player, c = this.channel; this.channel = null;
    if (!c || c.id === 'whirl') P?.anim.stop('spin'); else { c.end?.(); P?.anim.stop('beam'); }
    if (P) P.canMoveWhileActing = false;
  }
  clearAll() {
    this.melee = null; this.approach = null; this.flourish = null; this.banner?.end(); this.banner = null;
    this.charge?.cancel('clear', true);
    if (this.channel) this.endChannel();
    const P = this.G.player; if (P) { P.leap = null; P.dash = null; P.invuln = false; P.canMoveWhileActing = false; if (P.anim.action?.name === 'spin') P.anim.stop('spin'); }
    for (const o of this.orbits) for (const b of o.bones) b.m.parent?.remove(b.m);
    this.orbits.length = 0; this.channel = null;
    for (const x of this.pups || []) x.expire(true); this.pups = [];
    for (const x of this.decoys || []) x.expire(true); this.decoys = [];
    this.clearMoka();
    this.clearPoe();
  }
}
installMokaSpells(SkillRunner.prototype);
installChargedSkills(SkillRunner.prototype);
installPoeSkills(SkillRunner.prototype);
