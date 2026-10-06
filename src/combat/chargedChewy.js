// Chewy's charged releases (docs/CHARGE.md §7) beyond the phase-1 showcase (chargedSkills.js has Crescent Chomp and
// Power Throw). Each `charged_<id>(R, aim, target)` gets the charged runtime: R.params are already the charged numbers
// (src/rpg/charge.js apply()), R.charge = { stage, perks, color, base }. Most reuse the skill's own cast_ through
// fromFrame() (the action starts from the wind-up frame the charge pose held, and its events can be hooked), then add
// the signature payoff and the perks on top. Looks stay readable: big area effects are see-through, nothing parks a
// bright opaque sheet over the foes.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, dist, angleDiff } from '../core/util.js';
import { chargeFx } from '../gfx/chargeFx.js';
import { perkAt } from '../rpg/charge.js';
import { Decoy } from './allies.js';
import { bladeFx } from '../gfx/bladeFx.js';
import { SAMURAI, BONE_WHITE } from '../gfx/samuraiPalette.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff'), INK = new THREE.Color('#3a2230');
const UP = new THREE.Vector3(0, 1, 0);
const C = h => new THREE.Color(h);
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const by = (arr, s) => (Array.isArray(arr) ? arr[Math.max(0, Math.min(arr.length - 1, s - 1))] : arr);
const perkOf = perkAt; // (its pct scaled to the release's stage)

const M = {
  // ================================================================== Bone Blade (the samurai: docs/HEROES.md §8)
  /** Helmet Splitter → Mountain Splitter: a longer leap into a bigger split that stuns longer (+ Aftershock: it cracks again) */
  charged_dig(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, col = C(R.charge.color), after = perkOf(R, 'aftershock');
    this.fromFrame(0.16, () => this.cast_dig(R, aim, target), ev => {
      if (ev !== 'impact') return;
      const at = P.pos.clone(), fx = chargeFx(G);
      fx.burst(at, { r: p.radius * 1.05, life: 0.42, color: col, w: 0.14, a: 0.85 });
      bladeFx(G).crack(at, P.facing + Math.PI, { len: p.radius * 0.9, r: p.radius * 0.8, life: 4.5, star: false }); // (the split runs back behind him too)
      for (let i = 0; i < 10 + 4 * s; i++) { const a = rand(0, TAU), v = rand(2, 5); G.vfx.dot.spawn({ x: at.x, y: 0.3, z: at.z, vx: Math.cos(a) * v, vy: rand(4, 8), vz: Math.sin(a) * v, life: rand(0.6, 0.9), size: rand(0.12, 0.22), size1: 0.1, color: i % 2 ? '#8a6a4a' : '#b08a64', alpha: 1, alpha1: 1, grav: 18 }); }
      G.engine.rig.shake(0.15 * s);
      if (after) this.after(after.delay, () => {
        const r = p.radius * after.r;
        fx.burst(at, { r, life: 0.45, color: col, w: 0.12, a: 0.8 }); G.vfx.dustRing(at, r * 0.8, 20); G.vfx.ring(at, { color: '#fff0d8', r0: 0.3, r1: Math.min(r, 5), life: 0.42, opacity: 0.5 });
        bladeFx(G).crack(at, P.facing + Math.PI / 2, { len: r * 1.2, r: r * 0.8, life: 3, star: false }); bladeFx(G).crack(at, P.facing - Math.PI / 2, { len: r * 1.2, r: r * 0.8, life: 3, star: false });
        sfx('explosion_small', { pitch: 0.8 }); sfx('charge_slam', { pitch: 0.9 }); G.engine.rig.shake(0.45);
        this.nova(at, r, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct * after.pct / 100, knock: 0.9, stun: 0.5, from: at }));
      });
    });
  },
  /** Sakura Storm → Sakura Tempest: more spectral blades in a wider storm (+ Blade Volley, Blade Wall) */
  charged_bonestorm(R) {
    const G = this.G, P = G.player;
    this.fromFrame(0.38, () => this.cast_bonestorm(R));
    const o = this.orbits[this.orbits.length - 1];
    if (!o) return;
    o.volley = perkOf(R, 'volley'); o.wall = !!perkOf(R, 'wall');
    chargeFx(G).burst(P.pos, { r: o.p.radius * 1.2, life: 0.45, color: C(R.charge.color), w: 0.12, a: 0.8 });
    bladeFx(G).petalSwirl(P.pos, { n: 14 + 4 * R.charge.stage, r: o.p.radius, y: 0.7, spin: 1, speed: 5, rise: 1 });
    if (o.wall) for (const b of o.bones) b.m.scale.setScalar(1.0);
  },
  /** Blade Volley: the storm's spectral blades fly at the nearest foes when it ends */
  boneVolley(o) {
    const G = this.G, v = o.volley;
    for (const b of o.bones) {
      const from = b.m.position.clone();
      const e = this.combat.nearest(from, 'ally', v.range, x => isFoe(x));
      if (!e) continue;
      const dir = e.pos.clone().sub(from).setY(0); if (dir.lengthSq() < 1e-4) continue; dir.normalize();
      const pr = this.combat.spawn({ team: 'ally', kind: 'blade', pos: from, dir, speed: 15, range: v.range + 2, radius: 0.32, homing: 6,
        onHit: x => { this.combat.hitMonster(x, { dmgPct: o.p.dmgPct * v.pct / 100, knock: 0.5, from }); G.vfx.sparks(x.pos.clone().setY(0.6), { n: 6, color: '#ffe8f0', speed: 4 }); bladeFx(G).petalSwirl(x.pos, { n: 4, r: 0.3, y: 0.6, speed: 1.5 }); } });
      pr.homeTarget = e;
    }
    sfx('throw', { pitch: 1.3 }); sfx('katana_draw', { pitch: 1.4, vol: 0.6 });
  },
  /** Blade Wall: a charged storm's blade takes a hit for Chewy (combat.hitPlayer asks first) and shatters into petals */
  boneBlock() {
    for (const o of this.orbits) {
      if (!o.wall || !o.bones.length) continue;
      const b = o.bones.pop();
      bladeFx(this.G).petalSwirl(b.m.position, { n: 10, r: 0.2, y: 0, speed: 2.5, rise: 1 }); this.G.vfx.sparks(b.m.position, { n: 10, color: '#ffe8f0', speed: 5 });
      b.m.parent?.remove(b.m); sfx('block'); sfx('katana_clang', { pitch: 1.2, vol: 0.6 });
      return true;
    }
    return false;
  },

  // ================================================================== Fetch Mastery
  /** Ricochet → Static Overload: a crackling ball with extra bounces that arcs a spark to one more foe at each */
  charged_ricochet(R, aim) {
    const G = this.G, P = G.player, p = R.params, cling = perkOf(R, 'cling'), pin = perkOf(R, 'pinball'), fx = chargeFx(G);
    this.playFrom('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      let n = 0;
      const pr = this.throwBall({ speed: p.speed, range: 12, ricochet: p.bounces, bounceRange: p.bounceRange, returns: false, onHit: e => {
        n++;
        const mul = pin ? 1 + pin.dmg * (n - 1) : 1;
        if (pin && pr) pr.speed *= 1 + pin.speed;
        this.combat.hitMonster(e, { dmgPct: p.dmgPct * mul, element: 'zap', from: P.pos });
        G.vfx.sparks(_v.set(e.pos.x, e.pos.y + 0.6, e.pos.z), { n: 8, color: '#fff27a', speed: 6 });
        // the static jumps to one more foe nearby
        const o = this.combat.nearest(e.pos, 'ally', 3, x => x !== e && isFoe(x));
        if (o) { fx.arc(_v.set(e.pos.x, e.pos.y + 0.6, e.pos.z), _w.set(o.pos.x, o.pos.y + 0.6, o.pos.z)); this.combat.hitMonster(o, { dmgPct: p.dmgPct * p.arcPct / 100, element: 'zap', from: e.pos }); }
        if (cling) this.after(cling.delay, () => { if (!e.alive) return; fx.arc(_v.set(e.pos.x, e.pos.y + 1.4, e.pos.z), _w.set(e.pos.x, e.pos.y + 0.4, e.pos.z)); this.combat.hitMonster(e, { dmgPct: p.dmgPct * cling.pct / 100, element: 'zap', from: e.pos }); sfx('zap', { vol: 0.5, pitch: 1.4 }); });
        sfx('zap', { vol: 0.6, pitch: 1 + 0.05 * n });
      } }, aim, 'zapball');
      fx.sonic(this.handPos(), _v.copy(aim).sub(P.pos).setY(0).normalize(), R.charge.color);
      sfx('charge_whoosh', { pitch: 1.2 });
    } }, 0.36);
  },
  /** Multi-Fetch → Ball Pit Barrage: a bigger, tighter fan (+ Encore, Bouncy Castle) */
  charged_multi(R, aim) {
    const G = this.G, P = G.player, p = R.params, echo = perkOf(R, 'echo'), bouncy = perkOf(R, 'bouncy');
    const fan = (k) => {
      const base = _v.copy(aim).sub(P.pos).setY(0); if (base.lengthSq() < 0.01) base.copy(this.forward()); base.normalize();
      for (let i = 0; i < p.count; i++) {
        const a = p.count > 1 ? (i / (p.count - 1) - 0.5) * p.spread * Math.PI / 180 : 0;
        const dir = base.clone().applyAxisAngle(UP, a);
        this.throwBall({ dmgPct: p.dmgPct * k, speed: p.speed * rand(0.95, 1.08), range: p.range, pierce: p.pierce, returns: false, wallBounces: bouncy ? 2 : 0, ricochet: bouncy ? 1 : 0, bounceRange: 5 }, _w.copy(P.pos).add(dir), 'pitball');
      }
    };
    this.playFrom('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      fan(1); chargeFx(G).sonic(this.handPos(), _v.copy(aim).sub(P.pos).setY(0).normalize(), R.charge.color);
      if (echo) this.after(echo.delay, () => { fan(echo.pct / 100); sfx('throw', { pitch: 1.2 }); });
    } }, 0.36);
  },
  /** Squeaky Decoy → Giant Squeaker: a bigger, tougher, louder decoy (+ Double Trouble, Big Squeak Finale) */
  charged_decoy(R, aim) {
    const G = this.G, P = G.player, p = R.params, dbl = perkOf(R, 'double'), fin = perkOf(R, 'finale');
    const d = Math.min(p.throwRange, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const to = P.pos.clone().add(_v.copy(aim).sub(P.pos).setY(0).normalize().multiplyScalar(d));
    const place = (at, life) => {
      this.decoys = (this.decoys || []).filter(x => x.alive);
      while (this.decoys.length >= p.maxDecoys + (dbl ? 1 : 0)) this.decoys.shift().expire();
      const dk = new Decoy(G, at, p); dk.lifeMax = dk.life = life; this.decoys.push(dk);
      if (fin) { const ex = dk.expire.bind(dk); dk.expire = silent => { if (!silent && dk.alive) { G.vfx.stink(dk.pos, 30); chargeFx(G).burst(dk.pos, { r: fin.r, life: 0.42, color: C(R.charge.color), w: 0.14, a: 0.85 }); sfx('squeak', { pitch: 0.7 }); sfx('explosion_small', { pitch: 1.4, vol: 0.6 }); this.combat.inRadius(dk.pos.x, dk.pos.z, fin.r, 'ally', e => { if (!isFoe(e)) return; this.combat.hitMonster(e, { dmgPct: p.dmgPct * fin.pct / 100, element: 'stink', stun: fin.stun, from: dk.pos }); }); } ex(silent); }; }
      chargeFx(G).burst(at, { r: p.lureRadius * 0.5, life: 0.5, color: C(R.charge.color), w: 0.08, a: 0.7 });
      return dk;
    };
    this.playFrom('throw', { speed: 1, onEvent: ev => {
      if (ev !== 'release') return;
      const pr = this.combat.spawn({ team: 'ally', kind: 'ball', pos: this.handPos(), lob: { to, h: 3, time: 0.6 }, onEnd: () => {
        place(to, p.life);
        if (dbl) { const side = _v.set(to.z - P.pos.z, 0, -(to.x - P.pos.x)).normalize().multiplyScalar(1.4); const t2 = to.clone().add(side); if (!G.world.collision?.solidAt?.(t2.x, t2.z, 0.3)) place(t2, Math.round(p.life * dbl.life)); }
      } });
      pr.mesh.scale.setScalar(1.4);
    } }, 0.36);
  },
  /** Blazing Ball → Bonfire Ball: a bigger blast and a longer, larger fire (+ Hot Potato, Campfire) */
  charged_blaze(R, aim) {
    const G = this.G, P = G.player, p = R.params, hot = perkOf(R, 'hotPotato'), camp = perkOf(R, 'campfire');
    const boom = (pos, k, final) => {
      const r = p.radius * k;
      G.vfx.fire(pos, Math.round(30 * k), { spread: r * 0.6, size: 0.85 }); G.vfx.ring(pos, { color: '#ff9a3c', r0: 0.2, r1: r * 1.3, life: 0.45, opacity: 0.85 }); G.vfx.flash(pos.clone().setY(0.6), '#ff9a4a', 2.4 * k, 0.22);
      G.vfx.decal(pos, { r: r, color: '#2a140c', opacity: 0.55, life: (final ? p.burnDuration : 1) + 1.5 });
      G.vfx.poof(pos.clone().setY(0.3), { color: '#6a4a44', n: Math.round(10 * k), size: 0.8 });
      G.vfx.light(pos, '#ff8a3a', 9 * k, 6, 0.35); G.engine.rig.shake(0.25 + 0.2 * k); sfx('explosion_small', { pitch: final ? 0.85 : 1.25 }); sfx('fire_whoosh');
      this.nova(pos, r, e => { const dmg = this.combat.hitMonster(e, { dmgPct: p.dmgPct * k, element: 'fire', from: pos, knock: 0.4 }); e.applyStatus?.('burn', p.burnDuration, dmg * p.burnPct / 100); });
      if (!final) return;
      chargeFx(G).burst(pos, { r: r * 1.15, life: 0.45, color: C(R.charge.color), w: 0.12, a: 0.75 });
      // the bonfire: burning ground that (with Campfire) also warms the pack
      const z = this.combat.addZone({ pos: pos.clone(), radius: r * 0.8, life: p.burnDuration, tick: 0.5,
        update: () => { if (Math.random() < 0.6) G.vfx.fire(_w.set(pos.x + rand(-1, 1) * r * 0.6, pos.y, pos.z + rand(-1, 1) * r * 0.6), 1, { size: 0.55 }); },
        onTick: zz => {
          this.nova(zz.pos, zz.radius, e => e.applyStatus?.('burn', 1.5, Math.max(2, G.derived.dmgMax * p.burnPct / 100 * 0.5)));
          if (camp) {
            const heal = (a, max) => { if (dist(a.pos.x, a.pos.z, zz.pos.x, zz.pos.z) < zz.radius + 0.5) return max * camp.heal / 100 * 0.5; return 0; };
            const h = heal(P, G.derived.lifeMax); if (h > 0 && G.actions.heal(h) > 0) { G.ui?.float?.(_v.set(P.pos.x, P.pos.y + 1.5, P.pos.z), `+${Math.round(h)}`, { kind: 'heal' }); this.fx().pn.spawn({ frame: 7, x: P.pos.x, y: P.pos.y + 1.2, z: P.pos.z, vy: 1, life: 0.8, size: 0.26, size1: 0.1, color: '#ff9ab8', alpha: 1, alpha1: 0 }); }
            for (const a of this.combat.entities) if (a.alive && a.team === 'ally' && a.heal && a !== P) { const hh = heal(a, a.lifeMax || 60); if (hh > 0) a.heal(hh); }
          }
        } });
      if (camp) z.campfire = true;
    };
    this.playFrom('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      sfx('charge_whoosh', { pitch: 0.9 });
      if (hot) { // Hot Potato: the ball skips twice along the ground first
        const dir = _v.copy(aim).sub(P.pos).setY(0); const L = Math.min(p.range, dir.length() || p.range); dir.normalize();
        const pts = [1, 2, 3].map(i => this.ground(P.pos.clone().addScaledVector(dir, L * i / 3)));
        const hop = (i, from) => {
          const pr = this.combat.spawn({ team: 'ally', kind: 'blaze', pos: from, lob: { to: pts[i], h: i ? 1.4 : 2.2, time: i ? 0.32 : 0.42 }, onEnd: () => { if (i < 2) { boom(pts[i], hot.pct / 100, false); hop(i + 1, pts[i].clone().setY(0.3)); } else boom(pts[i], 1, true); } });
          pr.mesh.scale.setScalar(1.3);
        };
        hop(0, this.handPos());
      } else {
        const pr = this.throwBall({ speed: p.speed, range: p.range, returns: false, wallBounces: 0, onHit: e => boom(e.pos.clone().setY(0), 1, true), onEnd: pr2 => boom(pr2.pos.clone().setY(0), 1, true) }, aim, 'blaze');
        pr.mesh.scale.setScalar(1.35);
      }
    } }, 0.36);
  },
  /** Fetch Storm → Monsoon of Balls: far more balls over a wider area (+ The Big One) */
  charged_fetchstorm(R, aim) {
    const G = this.G, P = G.player, p = R.params, big = perkOf(R, 'bigOne');
    this.fromFrame(0.38, () => this.cast_fetchstorm(R, aim));
    const d = Math.min(p.range, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const center = this.ground(P.pos.clone().add(_v.copy(aim).sub(P.pos).setY(0).normalize().multiplyScalar(d)));
    chargeFx(G).burst(center, { r: p.radius, life: 0.6, color: C(R.charge.color), w: 0.08, a: 0.7 });
    if (big) this.after(p.duration + 0.3, () => {
      const to = center.clone();
      const pr = this.combat.spawn({ team: 'ally', kind: 'moonball', pos: to.clone().add(_v.set(-3, 14, -3)), lob: { to, h: 0.5, time: 0.7 }, onEnd: () => {
        G.vfx.impact(to, { color: '#ffe08a', r: big.r, decal: '#3a2418' }); G.vfx.dustRing(to, big.r, 24); chargeFx(G).burst(to, { r: big.r * 1.2, life: 0.5, color: C('#ffe08a'), w: 0.14 });
        this.fx().text('BOING!', _w.set(to.x, to.y + 1.6, to.z), { a: '#fff2a0', b: '#ff8fb0', size: 1.8 });
        sfx('ball_bounce', { pitch: 0.5 }); sfx('explosion_small', { pitch: 0.7 }); G.engine.rig.shake(0.8); G.engine.hitStop = Math.max(G.engine.hitStop, 0.06);
        this.nova(to, big.r, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct * big.pct / 100, knock: 2.6, stun: 0.6, from: to }));
      } });
      pr.mesh.scale.setScalar(4);
    });
  },

  // ================================================================== Pack Spirit
  /** Kiai! → Thunder Kiai: a forward cone of shout that reaches twice as far (+ Echoing Kiai, Big Bad Kiai) */
  charged_woof(R, aim) {
    const G = this.G, P = G.player, p = R.params, echo = perkOf(R, 'echo'), bad = perkOf(R, 'bigBad');
    const f = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z), cone = p.cone * Math.PI / 180, col = C(R.charge.color);
    const wave = (k) => {
      const o = P.pos.clone(), hit = new Set();
      sfx('bark', { pitch: 0.78 }); sfx('charge_whoosh', { pitch: 0.7 }); G.engine.rig.shake(0.3 * k + 0.15);
      bladeFx(G).shout(o, { r: Math.min(p.radius, 3.2) * (0.6 + 0.4 * k), life: 0.36, burst: k >= 1 });
      // three shout fronts rolling out in the cone: zigzag ink edges on white, the first tinted with the charge colour
      for (let i = 0; i < 3; i++) this.after(i * 0.07, () => bladeFx(G).wave(o, f, { arc: cone, r0: 0.7, r1: p.reach * (1 - i * 0.12), life: 0.42, mode: 2, core: i ? WHITE : col, edge: INK, width: 0.55 - i * 0.12, y: 0.5, a: 0.92 - i * 0.12,
        onStep: i ? null : (r0, r1) => this.combat.inRadius(o.x, o.z, r1, 'ally', (e, d) => {
          if (hit.has(e) || d + (e.radius || 0.3) < r0) return;
          if (d > 0.6 && Math.abs(angleDiff(f, Math.atan2(e.pos.x - o.x, e.pos.z - o.z))) > cone / 2 + 0.1) return;
          hit.add(e); this.combat.hitMonster(e, { dmgPct: p.dmgPct * k, knock: p.knockback * k, stun: p.stun * k, from: o });
          if (bad && isFoe(e)) { e.applyStatus?.('fear', bad.fear); this.vuln(e, bad.vuln, bad.fear); G.vfx.emote(e, 'sweat', 1.2); }
        }) }));
    };
    this.playFrom('kiai', { onEvent: ev => { if (ev !== 'bark') return; wave(1); if (echo) this.after(echo.delay, () => wave(echo.pct / 100)); } }, 0.22);
  },
  /** foes take +pct% damage for dur s (Big Bad Woof) */
  vuln(e, pct, dur) {
    const m = 1 + pct / 100; e.cursedMul = Math.max(e.cursedMul || 1, m);
    this.after(dur, () => { if (e.cursedMul === m) e.cursedMul = 1; });
  },
  /** Flash Draw → Lightning Draw: a much longer draw-dash whose cut lingers along the path, still cutting (+ Return
   *  Stroke, Afterimage); the cut line flashes along the whole path when he sheathes at the end */
  charged_zoom(R, aim) {
    const G = this.G, P = G.player, p = R.params, pong = perkOf(R, 'pingpong'), img = perkOf(R, 'afterimage');
    const start = P.pos.clone();
    if (img) this.afterimage(start, img, p);
    this.cast_zoom(R, aim);
    const dir = P.dash?.dir.clone(); if (!dir) return;
    const pts = [P.pos.clone()], fx = chargeFx(G);
    let rebound = !pong, endT = -1, far = null;
    if (pong) P.dash.onEnd = () => { far = P.pos.clone(); }; // (Return Stroke: the flourish waits for the way back)
    const z = this.combat.addZone({ pos: start, life: 30, tick: 0.5,
      update: (dt, zz) => {
        if (P.dash) { const last = pts[pts.length - 1]; if (dist(last.x, last.z, P.pos.x, P.pos.z) > 0.4 && pts.length < 80) pts.push(P.pos.clone()); }
        else if (!rebound) {
          rebound = true; const a = far || P.pos.clone();
          P.dash = { dir: dir.clone().negate(), left: p.distance / 2, speed: p.speed, hit: new Set(), p, onEnd: () => this.flashEnd(a, () => bladeFx(G).cutLine(start, a)) };
          P.anim.play('flashDraw', { speed: 0.3 / Math.max(0.12, p.distance / 2 / p.speed) }); P.invuln = true; sfx('dash', { pitch: 1.2 }); sfx('swing', { pitch: 1.35, vol: 0.6 });
        }
        else if (endT < 0) { endT = zz.t; zz.life = zz.t + p.trail; }
        // the lingering cut: bone-white glints and a red edge along the path, fading out
        const fade = endT < 0 ? 1 : Math.max(0, 1 - (zz.t - endT) / p.trail);
        for (let i = fx.emit('zt', 40 * fade, dt); i > 0; i--) { const q = pts[(Math.random() * pts.length) | 0], red = Math.random() < 0.35; G.vfx.glow.spawn({ x: q.x + rand(-0.15, 0.15), y: 0.3, z: q.z + rand(-0.15, 0.15), vy: 0.4, life: 0.4, size: 0.45, size1: 0.1, color: red ? SAMURAI.trailEdge : BONE_WHITE, alpha: red ? 0.4 : 0.5, alpha1: 0 }); if (Math.random() < 0.3) fx.pa.spawn({ frame: 2, x: q.x, y: 0.4, z: q.z, vy: 0.9, life: 0.4, size: 0.2, size1: 0.03, color: '#fff6e6', alpha: 1, alpha1: 0 }); }
      },
      onTick: () => {
        for (const e of this.combat.entities) {
          if (!isFoe(e)) continue;
          for (let i = 0; i < pts.length; i += 2) if (dist(pts[i].x, pts[i].z, e.pos.x, e.pos.z) < 0.9 + (e.radius || 0.3)) { this.combat.hitMonster(e, { dmgPct: p.dmgPct * p.trailPct / 100, from: pts[i], silent: false }); break; }
        }
      } });
    (this.chargeZones ||= []).push(z);
  },
  /** Afterimage: a frozen golden ghost of Chewy at the dash's start taunts foes, then pops */
  afterimage(at, img, p) {
    const G = this.G, P = G.player, fx = chargeFx(G);
    const H = fx.ghost(P.rig, img.taunt);
    if (H) H.obj.position.copy(P.rig.root.position), H.obj.rotation.copy(P.rig.root.rotation), H.obj.scale.copy(P.rig.root.scale);
    const ghost = { team: 'ally', alive: true, taunt: true, radius: 0.3, height: 1, pos: at.clone(), res: {}, untargetable: false, lifeMax: 1e6, life: 1e6,
      tauntFor: m => (Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < 7 ? 99 : 0), takeDamage() {}, heal() {} };
    this.combat.add(ghost);
    this.after(img.taunt, () => {
      ghost.alive = false; this.combat.remove(ghost); H?.end();
      fx.burst(at, { r: 2, life: 0.4, color: C('#ffe08a'), w: 0.14 }); G.vfx.sparkle(at.clone().setY(0.8), { n: 16, color: '#ffe08a', r: 0.8 }); sfx('confetti_pop', { pos: at });
      this.nova(at, 2, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct * img.pct / 100, knock: 1, from: at }));
    });
  },
  /** Pack Call → Shogun Pup: one of the pups is a big, tough shogun in a grand kabuto (+ Pack Leader, Spirit Wolf) */
  charged_packcall(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, lead = perkOf(R, 'packLeader'), wolf = perkOf(R, 'spiritWolf') && s >= 3;
    this.fromFrame(0.22, () => this.cast_packcall(R), ev => {
      if (ev !== 'bark') return;
      const pups = (this.pups || []).filter(x => x.alive), a = pups[pups.length - 1];
      if (a) {
        a.lifeMax = Math.round(a.lifeMax * p.alpha); a.life = a.lifeMax; a.p = { ...a.p, pupDmgPct: a.p.pupDmgPct * p.alpha };
        a.rig.root.scale.setScalar(0.85 * (wolf ? 1.8 : 1.35)); a.radius = wolf ? 0.36 : 0.28; a.pounce = wolf;
        G.vfx.pillar(a.pos, { color: '#bfe0ff', r: 0.55, h: 4, life: 0.6, opacity: 0.6 }); chargeFx(G).burst(a.pos, { r: 1.6, life: 0.4, color: C(R.charge.color), w: 0.14 });
      }
      if (p.alphaHowl && a) { sfx('howl', { pitch: wolf ? 0.8 : 1.1 }); this.nova(a.pos, 3, e => { if (isFoe(e)) { e.applyStatus?.('slow', 2, 0.4); G.vfx.frost(e.pos.clone().setY(0.5), 6); } }); chargeFx(G).burst(a.pos, { r: 3, life: 0.45, color: C('#bfe6ff'), w: 0.1, a: 0.7 }); }
      if (lead && G.companion) { G.companion.frenzyT = lead.t; G.vfx.emote(G.companion, 'anger', 1.2); G.vfx.sparkle(G.companion.pos.clone().setY(0.5), { n: 10, color: '#9fd8ff' }); }
    });
  },
  /** Onigiri Toss → Giant Onigiri: much more healing in a wider burst (+ Hanami Picnic, Rice Ball Shower) */
  charged_treat(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, pic = perkOf(R, 'picnic'), shower = perkOf(R, 'shower'), fx = chargeFx(G);
    const d = Math.min(p.range, dist(aim.x, aim.z, P.pos.x, P.pos.z));
    const to = this.ground(P.pos.clone().add(_v.copy(aim).sub(P.pos).setY(0).normalize().multiplyScalar(d || 0.01)));
    const healAt = (at, r, k) => {
      const D = G.derived, amt = (D.lifeMax * p.healPct / 100 + p.healFlat) * k;
      if (dist(P.pos.x, P.pos.z, at.x, at.z) < r + 0.5) { const h = G.actions.heal(amt); if (h > 0) G.ui?.float?.(P.pos.clone().setY(1.5), `+${Math.round(h)}`, { kind: 'heal' }); }
      for (const e of this.combat.entities) if (e.alive && e.team === 'ally' && e !== P && dist(e.pos.x, e.pos.z, at.x, at.z) < r + 0.5) e.heal?.((e.lifeMax || 60) * p.healPct / 100 * k + p.healFlat * k);
      this.nova(at, r, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct * k, element: 'holy', from: at }));
    };
    this.playFrom('throw', { speed: 1, onEvent: ev => {
      if (ev !== 'release') return;
      const pr = this.combat.spawn({ team: 'ally', kind: 'onigiri', pos: this.handPos(), lob: { to, h: 2.6, time: 0.55 }, onEnd: () => {
        G.vfx.heal(to); G.vfx.petals(to, 8); fx.burst(to, { r: p.radius, life: 0.5, color: C(R.charge.color), w: 0.12, a: 0.8 }); sfx('heal'); sfx('charge_release', { pitch: 1.3, vol: 0.6 });
        this.riceCrumbs(to, 22, 1.25);
        healAt(to, p.radius, 1);
        if (pic) { const dur = by(pic.dur, s), H = fx.picnic(to, pic.r, dur); const z = this.combat.addZone({ pos: to.clone(), radius: pic.r, life: dur, tick: 0.5, onTick: zz => {
          if (dist(P.pos.x, P.pos.z, zz.pos.x, zz.pos.z) < zz.radius) { const h = G.actions.heal(G.derived.lifeMax * pic.heal / 100 * 0.5); if (h > 0.5) G.ui?.float?.(P.pos.clone().setY(1.5), `+${Math.round(h)}`, { kind: 'heal' }); }
          for (const e of this.combat.entities) if (e.alive && e.team === 'ally' && e !== P && e.heal && dist(e.pos.x, e.pos.z, zz.pos.x, zz.pos.z) < zz.radius) e.heal((e.lifeMax || 60) * pic.heal / 100 * 0.5);
          this.nova(zz.pos, zz.radius, e => this.combat.hitMonster(e, { dmgPct: p.dmgPct * pic.pct / 100 * 0.5, element: 'holy', from: zz.pos, silent: false }));
        }, dispose: () => H.end() }); (this.chargeZones ||= []).push(z); }
        if (shower) for (let i = 0; i < shower.n; i++) {
          const a = i / shower.n * TAU + rand(-0.3, 0.3), r = rand(1.4, 3), at = this.ground(to.clone().add(_w.set(Math.cos(a) * r, 0, Math.sin(a) * r)));
          const m = this.combat.spawn({ team: 'ally', kind: 'onigiri', pos: to.clone().setY(to.y + 0.5), lob: { to: at, h: 1.6, time: 0.45 + i * 0.03 }, onEnd: () => { G.vfx.sparkle(at.clone().setY(0.4), { n: 6, color: '#fff0b0' }); healAt(at, 1.2, shower.pct / 100); sfx('pickup_item', { vol: 0.35, pitch: 1.4 }); } });
          m.mesh.scale.setScalar(0.6);
        }
      } });
      pr.mesh.scale.setScalar(1.7 + 0.2 * s);
    } }, 0.36);
  },
  /** War Banner Howl → Rallying Banner: a longer, stronger rally under a bigger banner, with a wider fear (+ Second Wind, Moonlit Rally) */
  charged_howl(R) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, wind = perkOf(R, 'secondWind'), moon = perkOf(R, 'moonlit');
    this.fromFrame(0.22, () => this.cast_howl(R), ev => {
      if (ev !== 'bark') return;
      chargeFx(G).burst(P.pos, { r: Math.min(p.radius, 5), life: 0.6, color: C(R.charge.color), w: 0.1, a: 0.8 }); // (the buff reaches further than the ring: a huge ring would band the whole screen)
      for (let i = 0; i < 12 + 4 * s; i++) { const a = rand(0, TAU), r = rand(0.4, 1.2); this.fx().pn.spawn({ frame: 1, x: P.pos.x + Math.cos(a) * r, y: P.pos.y + rand(0.8, 1.6), z: P.pos.z + Math.sin(a) * r, vx: Math.cos(a) * 0.8, vy: rand(1, 2), vz: Math.sin(a) * 0.8, life: rand(0.9, 1.4), size: rand(0.24, 0.34), size1: 0.12, color: i % 2 ? '#e8b84a' : '#fff6e0', alpha: 1, alpha1: 0, spin: rand(-2, 2) }); }
      if (wind) {
        const k = by(wind.heal, s) / 100, h = G.actions.heal(G.derived.lifeMax * k);
        if (h > 0) G.ui?.float?.(P.pos.clone().setY(1.6), `+${Math.round(h)}`, { kind: 'heal' }); G.vfx.heal(P.pos.clone());
        for (const e of this.combat.entities) if (e.alive && e.team === 'ally' && e !== P && e.heal) { e.heal((e.lifeMax || 60) * k); G.vfx.heal(e.pos.clone()); }
      }
      if (moon) { this.combat.buffs.moonlit = { t: p.duration, speed: moon.speed }; G.ui?.toast?.(`Moonlit Rally! Charges fill ${Math.round((moon.speed - 1) * 100)}% faster`, { color: '#ffb080' }); }
    });
  },
  /** Moonlit Blades → Moonfall: more moon blades with wider strikes (+ Lunar Eclipse at Stage Ⅲ) */
  charged_moonhowl(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, ecl = perkOf(R, 'eclipse');
    this.fromFrame(0.22, () => this.cast_moonhowl(R, aim), ev => {
      if (ev !== 'bark') return;
      chargeFx(G).burst(P.pos, { r: Math.min(p.radius, 5.5), life: 0.7, color: C(R.charge.color), w: 0.08, a: 0.7 });
      if (!ecl || s < 3) return;
      const at = P.pos.clone();
      chargeFx(G).eclipse(at, p.radius, ecl.dur); G.engine.post.pulse('#20184a', 0.35); sfx('howl', { pitch: 0.7 });
      const z = this.combat.addZone({ pos: at, radius: p.radius, life: ecl.dur, tick: 0.5, onTick: zz => this.nova(zz.pos, zz.radius, e => {
        if (!isFoe(e)) return;
        this.combat.hitMonster(e, { dmgPct: p.dmgPct * ecl.pct / 100, element: 'holy', from: zz.pos, silent: false });
        e.applyStatus?.('fear', 0.55); e.applyStatus?.('slow', 0.6, 0.4); // blinded: they can't attack and stumble about
      }) });
      (this.chargeZones ||= []).push(z);
    });
  },
};

/** Mix Chewy's charged releases into SkillRunner.prototype (chargedSkills.js installs this). */
export function installChargedChewy(proto) { Object.assign(proto, M); }
