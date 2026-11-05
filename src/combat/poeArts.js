// Poe's Shuriken Arts (docs/POE.md §3): Fūma Flurry, Kunai Fan, Shadow Stitch, Whirling Fūma, Shuriken Rain, Thousand Star Flurry —
// and the little machinery her other trees share: her own thrown things (kunai, shards, fireballs: `poeShoot`, cheaper
// than combat projectiles and never spun about), lobbed props, and her zones (traps and fields that tick in updatePoe).
// Mixed into SkillRunner by poeSkills.js installPoeSkills; R.params are the skill's numbers (or the charged ones:
// combat/chargedPoe.js calls these same casts with o.charged extras). Looks: gfx/poeFxArts.js; poses: actors/poePoses.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import '../gfx/poeFxArts.js';
import { POE_COL, PF, streakFn } from '../gfx/poeFx.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const hits = e => e.alive && e.team === 'enemy'; // (pots too)
const FLURRY_CUTS = ['cut1', 'cut2', 'cut3']; // (actors/poePoses.js fumaFlurry's hit frames)
// vfx.slash(p, dir, { arc }) centres its crescent on dir + arc − π (its ring starts at the yaw it's given), so a cut aimed
// at facing f passes f + π − arc: the crescent then sits square on her facing whatever its arc
const cutDir = (f, arc) => f + Math.PI - arc;
const DIRT = '#ccb48c', CLOD = new THREE.Color('#5a3c24'); // (the groove's kicked-up earth and its clods)
export const FLURRY_SPEED = 0.62; // (the action's speed per attack a second: one flurry takes one attack's time, 1 / aspd)

export const M = {
  // ================================================================== shared machinery
  /** her paw, a little forward, at throwing height */
  poeHand(out = new THREE.Vector3()) {
    const P = this.G.player, h = P.rig?.parts?.handR;
    if (h) { h.getWorldPosition(out); if (out.distanceToSquared(P.pos) < 4) { out.y = clamp(out.y, P.pos.y + 0.55, P.pos.y + 1.2); return out; } }
    return out.copy(P.pos).addScaledVector(this.forward(), 0.4).setY(P.pos.y + 0.8);
  },
  /** a thrown thing of hers: { kind: 'kunai' | 'shard' | 'fire', pos, dir, speed, range, radius, pierce, hop, onHit(e, s), onEnd(s, wall) } */
  poeShoot(o) {
    const fx = this.pfx(), s = { ...o, t: 0, trav: 0, hit: new Set(), y: o.pos.y, alive: true };
    s.pos = o.pos.clone(); s.dir = o.dir.clone().setY(0).normalize();
    s.m = o.kind === 'fire' ? fx.fireball(o.size || 1) : fx.prop(o.kind === 'shard' ? 'star' : 'kunai');
    if (o.kind === 'kunai') { fx.aimProp(s.m, s.dir); s.m.scale.setScalar(o.scale || 1.25); }
    if (o.kind === 'shard') s.m.scale.setScalar(o.scale || 1.6);
    s.m.position.copy(s.pos);
    (this.poeShots ||= []).push(s);
    return s;
  },
  updatePoeShots(dt) {
    const L = this.poeShots; if (!L?.length) return;
    const G = this.G, W = G.world, fx = this.pfx();
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i]; s.t += dt;
      if (s.lob) { // lobbed: a short arc to s.lob.to (kunai pins, falling shuriken, a planted saw)
        const k = clamp(s.t / s.lob.time); s.pos.lerpVectors(s.lob.from, s.lob.to, k); s.pos.y += Math.sin(k * Math.PI) * s.lob.h;
        s.m.position.copy(s.pos);
        if (s.kind === 'kunai') fx.aimProp(s.m, _v.copy(s.lob.to).sub(s.lob.from).setY(0).normalize(), -0.4 - 1.2 * k);
        else { s.m.rotation.y += dt * 22; if (s.lob.h === 0) fx.starTrail(s.pos, dt); } // (falling shuriken leave a streak)
        if (k >= 1) { this.endShot(i, false); s.onLand?.(s); }
        continue;
      }
      const v = s.speed * dt, nx = s.pos.x + s.dir.x * v, nz = s.pos.z + s.dir.z * v;
      if (W.collision?.solidAt?.(nx, nz, 0.06)) { this.endShot(i, true); continue; }
      s.pos.x = nx; s.pos.z = nz; s.trav += v;
      if (s.hop) { const ph = (s.trav / s.hop.len) % 1; s.pos.y = W.heightAt(s.pos.x, s.pos.z) + 0.3 + Math.sin(ph * Math.PI) * s.hop.h; if (ph < s.prevPh) fx.fireHop(_v.set(s.pos.x, W.heightAt(s.pos.x, s.pos.z), s.pos.z)); s.prevPh = ph; }
      s.m.position.copy(s.pos);
      if (s.kind === 'kunai') fx.kunaiTrail(s.pos, s.dir, dt);
      else if (s.kind === 'fire') fx.fireTrail(s.pos, s.dir, dt, s.size || 1);
      else { s.m.rotation.y += dt * 26; fx.kunaiTrail(s.pos, s.dir, dt * 0.5); }
      // (the enemies near the shot from the crowd grid, in the registry's order: the old scan's hits, without walking the
      //  whole crowd for every kunai every frame — combat.js enemiesNear; ROADMAP Z-B3)
      const C = this.combat, near = C.enemiesNear(s.pos.x, s.pos.z, s.radius + 0.3);
      try {
        for (let k = 0; k < near.length; k++) {
          const e = near[k];
          if (!hits(e) || s.hit.has(e) || !C.entities.has(e)) continue;
          if (Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) > s.radius + (e.radius || 0.3)) continue;
          s.hit.add(e); s.onHit?.(e, s);
          if (s.pierce > 0) { s.pierce--; continue; }
          s.stuck = e; this.endShot(i, false); break;
        }
      } finally { C.doneNear(); }
      if (s.alive && s.trav >= s.range) this.endShot(i, false);
    }
  },
  endShot(i, wall) {
    const s = this.poeShots[i]; this.poeShots.splice(i, 1);
    s.alive = false; s.wall = wall;
    const fx = this.pfx();
    fx.give(s.kind === 'fire' ? 'fireball' : s.kind === 'shard' ? 'star' : 'kunai', s.m);
    if (s.kind === 'kunai' && !s.stuck && !s.lob) { fx.kunaiStick(_v.set(s.pos.x, this.G.world.heightAt(s.pos.x, s.pos.z), s.pos.z), s.dir, 0.7); if (!this._thunkT || this.G.engine.time - this._thunkT > 0.12) { this._thunkT = this.G.engine.time; sfx('kunai_thunk', { pos: s.pos, vol: 0.6 }); } }
    s.onEnd?.(s, wall);
  },
  /** a lobbed prop (kind 'kunai' | 'shard'): flies from → to over time with an arc of h, onLand(s) */
  poeLob(kind, from, to, time, h, onLand, scale) {
    const s = this.poeShoot({ kind, pos: from, dir: _w.copy(to).sub(from).setY(0).lengthSq() > 1e-6 ? _w : _w.set(0, 0, 1), speed: 0, range: 99, radius: 0, scale });
    s.lob = { from: from.clone(), to: to.clone(), time, h }; s.onLand = onLand;
    return s;
  },
  /** a zone of hers: { life, update(dt, z) → false ends it, end(z) } — traps, fields, clouds (all end on clearPoe) */
  poeZone(z) { z.t = 0; (this.poeZones ||= []).push(z); return z; },
  updatePoeZones(dt) {
    const Z = this.poeZones; if (!Z?.length) return;
    for (let i = Z.length - 1; i >= 0; i--) {
      const z = Z[i]; z.t += dt;
      let keep = true;
      try { keep = z.update?.(dt, z) !== false && z.t < z.life; } catch (e) { console.warn('[poe zone]', e); keep = false; }
      if (!keep) { Z.splice(i, 1); try { z.end?.(z, false); } catch (e) { console.warn('[poe zone]', e); } }
    }
  },
  /** foes within r of (x, z) → each hit once per tick (fn) */
  poeNova(x, z, r, fn) { this.combat.inRadius(x, z, r, 'ally', fn); },
  clearPoeArts() {
    const fx = this.pfx();
    for (const s of this.poeShots || []) fx.give(s.kind === 'fire' ? 'fireball' : s.kind === 'shard' ? 'star' : 'kunai', s.m);
    this.poeShots = [];
    for (const z of this.poeZones || []) { try { z.end?.(z, true); } catch (e) { /* ignore */ } }
    this.poeZones = []; this.poeTraps = [];
  },

  // ================================================================== Fūma Flurry
  // The fūma stays in her paw, whirling (actors/poeGear.js: a buzz-saw blur past ~14 rad/s), through three quick close cuts
  // in a short cone: a forehand, a backhand on a skip, and a front flip that lands in a chop (knockback). The melee assist
  // is hers (poeSkills.js poeMelee: a short lunge while she cuts, a snap-in at each hit frame). o (the charged release,
  // combat/chargedPoe.js): { charged, groove: { len, pct }, spin: Spin Cycle's perk }.
  cast_fumaFlurry(R, aim, target, o = {}) {
    const P = this.G.player;
    this.poeBreakStealth();
    const m = this.melee; this.melee = null;
    this.poeMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    sfx('saw_whirr', { vol: o.charged ? 0.7 : 0.45, pitch: 1.3 });
    P.anim.play('fumaFlurry', { speed: this.animSpeed(FLURRY_SPEED), onEvent: ev => {
      const i = FLURRY_CUTS.indexOf(ev);
      if (i >= 0) this.poeFlurryCut(R, i, target, o);
      else if (ev === 'end' && o.spin && !this.G.playerDead) this.poeSpinCycle(R, o.spin);
    } });
  },
  /** one cut of the flurry (i: 0 forehand, 1 backhand, 2 the flip's chop) */
  poeFlurryCut(R, i, target, o) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx(), last = i === FLURRY_CUTS.length - 1;
    this.poeSnapIn(target, p.radius);
    const f = P.facing, arc = p.arc * Math.PI / 180, gold = o.charged ? '#ffd860' : '#ffe08a';
    if (!last) {
      // flat crescents, alternating sides, a touch tilted the way the paw travels
      G.vfx.slash(P.pos, cutDir(f, arc), { arc, r: p.radius * 0.96, width: 0.62, color: '#fff8e8', life: 0.16, reverse: i === 1, tilt: i ? 0.22 : -0.22, y: 0.6 });
      G.vfx.slash(P.pos, cutDir(f, arc * 0.78), { arc: arc * 0.78, r: p.radius * 0.66, width: 0.34, color: gold, life: 0.13, reverse: i === 1, tilt: i ? 0.22 : -0.22, y: 0.6, glow: false });
    } else {
      // the chop off the flip: a narrower, chunkier crescent and a puff of dust where she lands
      G.vfx.slash(P.pos, cutDir(f, arc * 0.85), { arc: arc * 0.85, r: p.radius * 1.02, width: 0.9, color: '#fff8e8', life: 0.2, y: 0.45 });
      G.vfx.slash(P.pos, cutDir(f, arc * 0.6), { arc: arc * 0.6, r: p.radius * 0.7, width: 0.42, color: gold, life: 0.16, y: 0.45, glow: false });
      G.vfx.dust(P.pos, { n: 4 });
    }
    // sawdust: cream streaks spat off the spinning rim, tangent to the cut
    const hand = this.poeHand(_h), side = i === 1 ? -1 : 1;
    for (let n = 0; n < (o.charged ? 7 : 4); n++) {
      const a = f + side * (Math.PI / 2) + rand(-0.5, 0.5), sp = rand(3, 5.5);
      fx.pn.spawn({ frame: PF.STREAK, x: hand.x, y: hand.y + rand(-0.05, 0.05), z: hand.z, vx: Math.sin(a) * sp, vy: rand(0.2, 1.2), vz: Math.cos(a) * sp, life: rand(0.14, 0.22), size: rand(0.22, 0.34), size1: 0.06, color: POE_COL.cream, alpha: 0.8, alpha1: 0, drag: 4, fn: streakFn });
    }
    sfx('fuma_slash', { pitch: 1.1 + i * 0.09, vol: last ? 0.9 : 0.75 });
    let hit = 0;
    this.arcHit(P.pos, f, p.radius, p.arc, e => {
      this.poeHit(e, { dmgPct: p.dmgPct, knock: last ? p.lastKnock : p.knockback, from: P.pos });
      if (!e.breakable) fx.flecks(_t.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), last ? 4 : 2);
      hit++;
    }, target);
    if (hit) { sfx('fuma_hit', { pos: P.pos, vol: 0.5, pitch: 1.15 + i * 0.1 }); G.engine.rig.shake(last ? 0.14 : 0.06); }
    this.poeCloneEcho?.('slash', { arc: p.arc, radius: p.radius, dmgPct: p.dmgPct }); // (her shadow clones cut with her)
    if (last) { this.poeMelee = null; if (o.groove) this.poeGroove(R, o.groove); }
  },
  /** a charged flurry's last chop bites the floor: the revved saw rips a groove out along her facing (len m at 16 m/s),
   *  spitting sawdust, hitting each foe in its path once (pct% of a cut) */
  poeGroove(R, g) {
    const G = this.G, P = G.player, W = G.world, p = R.params, fx = this.pfx();
    const dir = this.forward(), from = P.pos.clone().addScaledVector(dir, 0.55), hit = new Set(), yaw = Math.atan2(dir.x, dir.z);
    let s = 0, mark = 0;
    sfx('saw_plant', { pos: from, vol: 0.8, pitch: 1.1 }); sfx('saw_whirr', { pos: from, vol: 0.7, pitch: 1.5 });
    G.engine.rig.shake(0.16);
    this.poeZone({ life: g.len / 16 + 0.1, update: (dt) => {
      s = Math.min(g.len, s + 16 * dt);
      _v.copy(from).addScaledVector(dir, s);
      if (W.collision?.solidAt?.(_v.x, _v.z, 0.2)) return false;
      _v.y = W.heightAt(_v.x, _v.z);
      for (; mark <= s; mark += 0.2) {
        // the scar: overlapping dark blobs make one strip, a lighter rim of turned-up earth either side every other step
        _w.copy(from).addScaledVector(dir, mark); _w.y = W.heightAt(_w.x, _w.z);
        G.vfx.decal(_w, { r: 0.27, color: '#3a2616', life: 1.6, opacity: 0.62 });
        const odd = Math.round(mark / 0.2) % 2;
        if (odd) for (const sd of [-1, 1]) { _t.set(_w.x + Math.cos(yaw) * sd * 0.26, _w.y, _w.z - Math.sin(yaw) * sd * 0.26); G.vfx.decal(_t, { r: 0.13, color: '#d8c098', life: 1.4, opacity: 0.5 }); }
        // earth dust kicked up, and sawdust spat out sideways off the saw (cream streaks, a bone chip or two)
        G.vfx.dust(_w, { n: odd ? 1 : 2, color: DIRT, size: 0.36 });
        for (const sd of [-1, 1]) { const a = yaw + sd * (Math.PI / 2 + rand(-0.4, 0.2)); fx.pn.spawn({ frame: PF.STREAK, x: _w.x, y: _w.y + 0.12, z: _w.z, vx: Math.sin(a) * 4.5, vy: rand(1, 2.4), vz: Math.cos(a) * 4.5, life: 0.22, size: 0.28, size1: 0.05, color: POE_COL.cream, alpha: 0.8, alpha1: 0, drag: 3, grav: 6, fn: streakFn }); }
        if (odd) fx.flecks(_t.set(_w.x, _w.y + 0.15, _w.z), 1);
        for (let c = 0; c < 3; c++) { const a = rand(0, TAU), sp = rand(0.6, 1.8); fx.pn.spawn({ frame: PF.DOT, x: _w.x, y: _w.y + 0.1, z: _w.z, vx: Math.cos(a) * sp, vy: rand(2, 3.6), vz: Math.sin(a) * sp, life: rand(0.38, 0.5), size: rand(0.1, 0.15), size1: 0.07, color: CLOD, alpha: 1, alpha1: 0.6, grav: 10 }); } // (clods of earth: dark, so the rip reads on grass)
      }
      // the bite at its head: a small cream glint where the saw chews in (additive, small: never a flash)
      fx.pa.spawn({ frame: PF.SPARK, x: _v.x, y: _v.y + 0.15, z: _v.z, life: 0.1, size: 0.34, size1: 0.12, color: POE_COL.cream, alpha: 0.7, alpha1: 0, spin: 9 });
      this.poeNova(_v.x, _v.z, 0.8, e => {
        if (hit.has(e)) return; hit.add(e);
        this.poeHit(e, { dmgPct: p.dmgPct * g.pct / 100, knock: 0.35, from: P.pos });
        if (!e.breakable) { fx.flecks(_t.set(e.pos.x, e.pos.y + 0.4, e.pos.z), 3); sfx('fuma_hit', { pos: e.pos, vol: 0.5, pitch: 0.9 }); }
      });
      if (s >= g.len) return false;
    } });
  },
  /** Spin Cycle (a Stage Ⅲ frenzy's perk): one full twirl of the revved fūma round her (pct% of a cut to all in r m) */
  poeSpinCycle(R, perk) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    P.anim.play('fumaTwirl', { speed: this.attacksPerSec() * 0.55, onEvent: ev => {
      if (ev !== 'hit') return;
      G.vfx.slash(P.pos, P.facing, { arc: 6.0, r: perk.r * 0.95, width: 0.8, color: '#fff8e8', life: 0.24 });
      G.vfx.slash(P.pos, P.facing + 1.4, { arc: 5.0, r: perk.r * 0.7, width: 0.45, color: '#ffd860', life: 0.2, reverse: true, glow: false });
      sfx('fuma_slash', { pitch: 0.95 }); sfx('saw_whirr', { vol: 0.6, pitch: 1.6 });
      let n = 0;
      this.poeNova(P.pos.x, P.pos.z, perk.r, e => { this.poeHit(e, { dmgPct: p.dmgPct * perk.pct / 100, knock: 0.6, from: P.pos }); if (!e.breakable) fx.flecks(_t.set(e.pos.x, e.pos.y + 0.5, e.pos.z), 3); n++; });
      if (n) G.engine.rig.shake(0.16);
    } });
  },

  // ================================================================== Kunai Fan
  cast_kunaiFan(R, aim, target, o = {}) {
    const P = this.G.player;
    this.poeBreakStealth();
    P.anim.play('kunaiFan', { speed: this.attacksPerSec() * 0.6, onEvent: ev => { if (ev === 'release') { this.poeKunaiVolley(R, aim, o); if (o.echo) this.after(o.echo.delay || 0.45, () => this.poeKunaiVolley(R, aim, { ...o, echo: true, power: (o.echo.pct || 50) / 100 })); } } });
  },
  /** the fan of kunai (o: { echo: 0..1 power for a charged Second Flick }) */
  poeKunaiVolley(R, aim, o = {}) {
    const G = this.G, P = G.player, p = R.params, k = o.power ?? 1, tags = o.tags;
    const from = this.poeHand(_h).clone(), base = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z), spread = (p.spread * Math.PI) / 180, n = p.count + (p.extra || 0);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0) + rand(-0.03, 0.03);
      this.poeShoot({ kind: 'kunai', pos: from, dir: _v.set(Math.sin(a), 0, Math.cos(a)), speed: p.speed * rand(0.95, 1.05), range: p.range * rand(0.92, 1.04), radius: 0.24, pierce: p.pierce || 0,
        onHit: (e, s) => {
          this.poeHit(e, { dmgPct: p.dmgPct * k, knock: 0.2, from: P.pos });
          if (!e.breakable) this.pfx().flecks(_t.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), 3, POE_COL.cream);
          sfx('kunai_hit', { pos: e.pos, vol: 0.7 });
          if (tags) this.poeTag(e.pos, tags, p);
        },
        onEnd: (s, wall) => { if (tags && !s.stuck) this.poeTag(s.pos, tags, p); } });
    }
    sfx('kunai_fan', { pitch: o.echo ? 1.15 : 1 });
    G.engine.rig.shake(0.06);
    if (!o.echo) this.poeCloneEcho?.('kunai', { count: n, spread: p.spread, speed: p.speed, range: p.range, dmgPct: p.dmgPct * k, aim }); // (her clones fan theirs too)
  },
  /** Exploding Tags (Kunai Fan's charged perk): a paper tag on the kunai pops a moment later */
  poeTag(at, perk, p) {
    const pos = at.clone();
    this.after(perk.delay || 0.5, () => {
      const fx = this.pfx(), g = this.ground(pos.clone());
      fx.puff(g, { r: perk.r * 0.75, n: 8, low: true }); fx.fireBurst(g, perk.r * 0.8);
      sfx('tag_pop', { pos: g, vol: 0.6 });
      this.poeNova(g.x, g.z, perk.r, e => this.poeHit(e, { dmgPct: p.dmgPct * perk.pct / 100, element: 'fire', knock: 0.4, from: g }));
    });
  },

  // ================================================================== Shadow Stitch
  cast_shadowStitch(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const foe = this.pickFoe(aim, target, p.range);
    if (!foe) { G.actions.restoreZoom?.(R.cost); this.cds.shadowStitch = 0; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), 'No shadow to pin!', { kind: 'status', color: '#c8bce8' }); sfx('ui_error'); return; }
    this.poeBreakStealth();
    this.faceTo(foe.pos);
    P.anim.play('stitchThrow', { speed: this.attacksPerSec() * 0.6, onEvent: ev => { if (ev === 'release') this.poeStitch(R, foe, o); } });
  },
  poeStitch(R, foe, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    const c = this.ground((foe.alive ? foe.pos : P.pos).clone()), from = this.poeHand(_h).clone();
    const pins = [];
    for (let i = 0; i < p.kunai; i++) { const a = (i / p.kunai) * TAU + 0.4, rr = Math.max(0.45, (foe.bodyR || foe.radius || 0.35) * 1.1); pins.push(this.ground(new THREE.Vector3(c.x + Math.cos(a) * rr, 0, c.z + Math.sin(a) * rr))); }
    sfx('kunai_fan', { pitch: 1.25, vol: 0.7 });
    let landed = 0;
    pins.forEach((pin, i) => this.poeLob('kunai', from, pin, 0.2 + i * 0.03, 0.5, () => {
      fx.kunaiStick(pin, _v.copy(pin).sub(from).setY(0).normalize(), p.root + 0.2);
      sfx('kunai_thunk', { pos: pin, vol: 0.55, pitch: 1 + i * 0.1 });
      if (++landed < pins.length) return;
      // all three in: the shadow is stitched — the foe (and its neighbours) can't move
      sfx('stitch_zip', { pos: c });
      G.engine.rig.shake(0.12);
      const rooted = [];
      this.poeNova(c.x, c.z, p.radius, e => {
        this.poeHit(e, { dmgPct: e === foe ? p.dmgPct : p.dmgPct * 0.5, from: P.pos, knock: 0 });
        if (!e.alive || e.breakable) return;
        e.applyStatus?.('slow', p.root, e.def?.boss ? 0.5 : 1); // (rooted: it can still swing, it can't walk; bosses half)
        if (!e.def?.boss) e.knock?.set?.(0, 0, 0);
        fx.stitchMark(e, p.root); rooted.push(e);
        for (const q of pins) fx.thread(q, e.pos);
      });
      if (o.needle && rooted.length > 1) this.poeZone({ life: p.root, update: (dt) => { for (const e of rooted) if (e.alive && !e.def?.boss) this.pullFoe(e, c.x, c.z, o.needle.speed * dt, 0.7); } });
    }));
  },

  // ================================================================== Whirling Fūma
  cast_whirlingFuma(R, aim, target, o = {}) {
    const P = this.G.player, p = R.params, to = this.clampAim(aim, p.range);
    this.poeBreakStealth();
    this.faceTo(to);
    P.anim.play('sawThrow', { speed: this.attacksPerSec() * 0.6, onEvent: ev => { if (ev === 'release') this.poePlantSaw(R, to, o); } });
  },
  poePlantSaw(R, to, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    const from = this.poeHand(_h).clone(), look = P.equippedLook?.() || {}, sc = this.fumaScale() * (o.size || 1);
    sfx('fuma_throw', { pitch: 0.9 });
    // the spare fūma skims out low and bites into the floor
    const fly = fx.fumaFly(look, sc * 0.9); let spin = 0;
    const t0 = 0.28, a = from.clone(), b = to.clone();
    this.poeZone({ life: t0, update: (dt, z) => { const k = clamp(z.t / t0); spin += dt * 30; _v.lerpVectors(a, b, k); _v.y = a.y + (b.y + 0.35 - a.y) * k + Math.sin(k * Math.PI) * 0.4; fly.set(_v, spin, 0, 18, G.world.heightAt(_v.x, _v.z)); },
      end: (z, cleared) => { fly.end(); if (!cleared) this.poeSawTrap(R, to, o, look, sc); } });
  },
  poeSawTrap(R, at, o, look, sc) {
    const G = this.G, fx = this.pfx(), p = R.params, pos = this.ground(at.clone());
    this.poeTraps = (this.poeTraps || []).filter(z => this.poeZones.includes(z));
    while (this.poeTraps.length >= p.maxTraps) { const old = this.poeTraps.shift(); old.life = 0; }
    const h = fx.fumaFly(look, sc), reach = p.radius + 1.5;
    const ring = fx.zoneRing(pos, reach, p.duration + 0.2, POE_COL.cream, 0.35, pos);
    fx.starImpact(pos, 1.4); G.vfx.dust(pos, { n: 6 }); sfx('saw_plant', { pos });
    let spin = 0, tick = 0, whirr = 0;
    const z = this.poeZone({ life: p.duration, pos, update: (dt, zz) => {
      spin += dt * 34;
      // (Wandering Saw: a charged saw drifts toward the nearest foe)
      if (o.drift) { const n = this.combat.nearest(pos, 'ally', 9); if (n) { const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z, d = Math.hypot(dx, dz); if (d > 0.6) { const st = Math.min(d - 0.5, o.drift.speed * dt); _t.copy(pos); pos.x += dx / d * st; pos.z += dz / d * st; G.world.collision?.resolve(pos, 0.3, _t); pos.y = G.world.heightAt(pos.x, pos.z); } } }
      _v.copy(pos); _v.y += 0.36 + Math.sin(zz.t * 9) * 0.03;
      h.set(_v, spin, 0.04 * Math.sin(zz.t * 5), 24, pos.y);
      for (const e of this.foesNear(pos.x, pos.z, reach)) this.pullFoe(e, pos.x, pos.z, p.pull * dt, 0.5);
      if (Math.random() < dt * 16) { const a = rand(0, TAU); fx.pn.spawn({ frame: 0, x: pos.x + Math.cos(a) * 0.5, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 1.8 - Math.sin(a) * 2.5, vy: 0.4, vz: Math.sin(a) * 1.8 + Math.cos(a) * 2.5, life: 0.35, size: 0.16, size1: 0.36, color: POE_COL.smoke2, alpha: 0.5, alpha1: 0, drag: 3 }); }
      tick -= dt; if (tick <= 0) { tick = p.tick; this.poeNova(pos.x, pos.z, p.radius, e => { this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.05, from: pos, silent: false }); if (!e.breakable && Math.random() < 0.5) fx.flecks(_t.set(e.pos.x, e.pos.y + 0.4, e.pos.z), 2); }); }
      whirr -= dt; if (whirr <= 0) { whirr = 0.24; sfx('saw_whirr', { pos, vol: 0.5 }); }
    }, end: (zz, cleared) => {
      h.end(); ring.done = true; ring.t = 1e9;
      if (cleared) return;
      fx.puff(pos, { r: 0.8, n: 8, low: true }); fx.flecks(_t.set(pos.x, pos.y + 0.4, pos.z), 6); sfx('fuma_clank', { pos, vol: 0.6 });
      if (o.shrapnel) this.poeShrapnel(pos, R, o.shrapnel);
    } });
    this.poeTraps.push(z);
  },
  /** Bone Shrapnel: the saw bursts into bone shards that fly out in a ring */
  poeShrapnel(at, R, perk) {
    const p = R.params, n = perk.n || 8, from = at.clone(); from.y += 0.4;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.poeShoot({ kind: 'shard', pos: from, dir: _v.set(Math.cos(a), 0, Math.sin(a)), speed: 14, range: 5, radius: 0.3, pierce: 1, onHit: e => this.poeHit(e, { dmgPct: p.dmgPct * perk.pct / 100 * 3, knock: 0.3, from }) }); } // (perk pct of the saw's per-tick bite ×3)
    sfx('kunai_fan', { pitch: 0.8 });
  },

  // ================================================================== Shuriken Rain
  cast_shurikenRain(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, at = this.clampAim(aim, p.range);
    this.poeBreakStealth();
    this.faceTo(at);
    sfx('poe_leap');
    P.anim.play('rainLeap', { speed: 1, onEvent: ev => {
      if (ev === 'throw') this.poeRain(R, at, o);
      else if (ev === 'land') { G.vfx.dust(P.pos, { n: 5 }); sfx('poe_land'); }
    } });
  },
  poeRain(R, at, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx(), n = p.count, dt = p.duration / n;
    fx.zoneRing(at, p.radius, p.duration + 0.45, POE_COL.mustard, 0.45);
    sfx('kunai_fan', { pitch: 0.9 });
    const cam = G.engine.camera, back = _w.set(cam.position.x - at.x, 0, cam.position.z - at.z).normalize().clone();
    for (let i = 0; i < n; i++) this.after(i * dt + rand(0, dt * 0.6), () => {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * p.radius;
      const to = this.ground(new THREE.Vector3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r));
      const from = to.clone().addScaledVector(back, -1.5).add(_v.set(rand(-0.6, 0.6), 7, rand(-0.6, 0.6)));
      this.poeLob('shard', from, to, 0.32, 0, () => {
        fx.starImpact(to); if (i % 3 === 0) sfx('star_tink', { pos: to, vol: 0.5, pitch: rand(0.9, 1.25) });
        this.poeNova(to.x, to.z, p.impactRadius, e => this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.1, from: to }));
      }, 1.3);
    });
    // Falling Star (a Stage Ⅲ rain's capstone): one giant bone shuriken to finish
    if (o.bigStar) this.after(p.duration + 0.2, () => {
      const from = at.clone().addScaledVector(back, -2).add(_v.set(0, 9, 0));
      this.poeLob('shard', from, at.clone(), 0.42, 0, () => {
        fx.starImpact(at, 3); fx.ring(at, o.bigStar.r, 0.4, POE_COL.mustard, 0.6); G.vfx.dustRing?.(at, o.bigStar.r * 0.8); G.engine.rig.shake(0.5);
        sfx('fuma_clank', { pos: at, pitch: 0.6 }); sfx('swing_heavy', { pitch: 0.7 });
        this.poeNova(at.x, at.z, o.bigStar.r, e => this.poeHit(e, { dmgPct: p.dmgPct * o.bigStar.pct / 100 * 4, knock: 1.4, from: at }));
      }, 6);
    });
  },

  // ================================================================== Thousand Star Flurry
  cast_thousandStars(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    this.poeBreakStealth();
    sfx('star_whirl'); sfx('poe_seal', { pitch: 1.2 });
    const fl = fx.flurry(P.pos, p.radius, p.duration);
    const ring = fx.zoneRing(P.pos, p.radius, p.duration + 0.2, POE_COL.cream, 0.3, P.pos);
    let tick = 0, whirl = 0;
    P.anim.play('starSpin', { speed: 2.1 / p.duration });
    this.poeZone({ life: p.duration, update: (dt) => {
      if (G.playerDead) return false;
      for (const e of this.foesNear(P.pos.x, P.pos.z, p.radius + 1)) this.pullFoe(e, P.pos.x, P.pos.z, p.pull * dt, 1.1);
      tick -= dt; if (tick <= 0) { tick = p.tick; let n = 0; this.poeNova(P.pos.x, P.pos.z, p.radius, e => { this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.05, from: P.pos }); n++; }); if (n) sfx('star_tink', { vol: 0.45, pitch: rand(0.95, 1.3) }); }
      whirl -= dt; if (whirl <= 0) { whirl = 0.32; sfx('star_whirl', { vol: 0.5 }); }
    }, end: (z, cleared) => {
      fl.stop(); ring.t = 1e9;
      if (cleared) return;
      // Supernova (Stage Ⅲ capstone): every star left goes off at once
      if (o.supernova) {
        fx.ring(P.pos, p.radius, 0.45, POE_COL.mustard, 0.6); fx.starImpact(P.pos, 2.5); G.engine.rig.shake(0.45); sfx('swing_heavy', { pitch: 0.8 }); sfx('star_tink', { pitch: 0.7 });
        this.poeNova(P.pos.x, P.pos.z, p.radius, e => this.poeHit(e, { dmgPct: p.dmgPct * o.supernova.pct / 100 * 5, knock: 1, from: P.pos }));
      } else { fx.ring(P.pos, p.radius * 0.8, 0.35, POE_COL.cream, 0.4); sfx('fuma_catch', { pitch: 1.2 }); }
    } });
  },
};
