// Charged releases (docs/CHARGE.md §2): SkillRunner methods `charged_<id>(R, aim, target)`, mixed in like Moka's
// spells. tryCast(id, aim, target, { stage }) routes here when R.charge is set (chargeRuntime: R.params are already
// the charged numbers, R.charge = { stage, perks, color, base }); a skill without a charged_ method falls back to its
// normal cast_ with the charged params. Each release starts its action from the wound-back frame the 'charge' pose
// was holding (playFrom), so the strike lands quickly and reads as one motion.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, angleDiff } from '../core/util.js';
import { chargeFx } from '../gfx/chargeFx.js';
import { perkAt } from '../rpg/charge.js';
import { PAL } from '../gfx/spellFx.js';
import { installChargedChewy } from './chargedChewy.js';
import { installChargedMoka } from './chargedMoka.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const sfx = (n, o) => Events.emit('sfx', n, o);
const by = (arr, s) => (Array.isArray(arr) ? arr[Math.max(0, Math.min(arr.length - 1, s - 1))] : arr);

const M = {
  /** play an action from u0 (0..1) instead of its start: the wind-up already happened while charging */
  playFrom(name, { speed = 1, onEvent = null } = {}, u0 = 0) {
    const P = this.G.player;
    P.anim.play(name, { speed, onEvent });
    const a = P.anim.action;
    if (a && u0 > 0) a.t = a.dur * u0;
  },
  /** run a skill's own cast_ (fn) so that the first action it plays starts from u0 (the wind-up the charge pose held),
   *  with hook(ev) called after each of that action's events — the charged release's extras ride on the real cast */
  fromFrame(u0, fn, hook = null) {
    const A = this.G.player.anim, raw = A.play, tame = this.tame.bind(this);
    A.play = function (name, o = {}) {
      A.play = raw;
      const ev0 = o.onEvent;
      raw.call(A, name, { ...o, onEvent: e => { if (ev0) tame(() => ev0(e)); if (hook) try { hook(e); } catch (err) { console.warn('[charge]', err); } } });
      if (A.action && u0 > 0) A.action.t = A.action.dur * u0;
    };
    try { tame(fn); } finally { A.play = raw; }
  },
  /** run a base cast with its screen flashes capped: the charged radii would otherwise blow its glow sprite up over
   *  the whole fight (the enemies must stay readable through every release) */
  tame(fn) {
    const V = this.G.vfx, f0 = V.flash, g0 = V.ring, S = this.G.vfx.spell, c0 = S?.splash;
    if (V._tamed) return fn();
    V._tamed = true; V.flash = (p, c, size = 1.4, life) => f0.call(V, p, c, Math.min(size, 2.6), life);
    V.ring = (p, o) => g0.call(V, p, o && o.r1 > 7 ? { ...o, r1: 7 } : o); // (and its rings: a 12 m howl ring bands the whole island)
    if (c0) { S.splash = (p, o = {}) => c0.call(S, p, { ...o, maxH: Math.min(o.maxH ?? 99, 1.6), alpha: Math.min(o.alpha ?? 0.95, 0.68) }); S._soft = true; } // (and Moka's water crowns: ≤ 1.6 m, see-through; flocks made now dive soft)
    try { return fn(); } finally { V.flash = f0; V.ring = g0; if (c0) { S.splash = c0; S._soft = false; } V._tamed = false; }
  },
  /** Twister: a charged Tail Spin's spin-out drifts after the cursor */
  spinDrift(dt) {
    const G = this.G, P = G.player, tw = this.channel?.R?.def?.charge?.perks?.twister, a = this.charge.cursorGround(_v);
    if (!tw || !a) return;
    const dx = a.x - P.pos.x, dz = a.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return;
    this.slideHero(_w.set(dx / d, 0, dz / d), Math.min(d, tw.speed * dt));
  },

  // ================================================================== Chomp Slash → Heavy Cleave
  charged_chomp(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, col = R.charge.color;
    this.playFrom('swing', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'hit') return;
      this.snapIn(target, p.radius);
      const f = P.facing, arc = p.arc * Math.PI / 180, o = P.pos.clone();
      // the cleave: a fat cream sweep, a gold counter-sweep, and at Ⅱ+ a bright outer edge
      G.vfx.slash(o, f, { arc, r: p.radius * 1.08, width: 1.25 + 0.15 * s, color: '#fff4d8', life: 0.34 });
      G.vfx.slash(o, f, { arc: arc * 0.92, r: p.radius * 0.78, width: 0.85, color: col, life: 0.3, reverse: true });
      if (s >= 2) G.vfx.slash(o, f, { arc: arc * 0.84, r: p.radius * 1.24, width: 0.45, color: '#ffe8a8', life: 0.26, tilt: 0.1 });
      G.vfx.decal(_v.copy(o).add(this.forward().multiplyScalar(p.radius * 0.45)), { r: p.radius * 0.8, color: '#ffc870', additive: true, opacity: 0.22, life: 0.45, grow: 0.3 });
      G.vfx.decal(_v.copy(o).add(this.forward().multiplyScalar(p.radius * 0.6)), { r: p.radius * 0.7, color: '#3a2418', opacity: 0.35, life: 2.2 });
      G.vfx.dustRing(o, p.radius * 0.7, 10 + 4 * s);
      sfx('swing_heavy'); sfx('bark', { pitch: 0.72 }); sfx('charge_slam', { stage: s, pitch: 1.05 - 0.08 * s });
      const hit = new Set();
      this.arcHit(o, f, p.radius, p.arc, e => { hit.add(e); this.combat.hitMonster(e, { dmgPct: p.dmgPct, knock: p.knockback, stun: p.stun, from: o }); }, target);
      // the shockwave crescent rolls on from the cleave's edge and hits whatever it passes
      const cArc = Math.min(arc, (120 + 12 * s) * Math.PI / 180), wavePct = p.wavePct / 100;
      chargeFx(G).crescent(o, f, { arc: cArc, r0: p.radius * 0.85, r1: p.radius + p.wave, life: 0.36 + 0.05 * s, color: col, width: p.waveWidth, onStep: (r0, r1) => {
        this.combat.inRadius(o.x, o.z, r1, 'ally', (e, d) => {
          if (hit.has(e) || d + (e.radius || 0.3) < r0) return;
          if (d > 0.6 && Math.abs(angleDiff(f, Math.atan2(e.pos.x - o.x, e.pos.z - o.z))) > cArc / 2 + 0.12) return;
          hit.add(e); this.combat.hitMonster(e, { dmgPct: p.dmgPct * wavePct, knock: p.knockback * 0.7, stun: p.stun * 0.5, from: o });
        });
      } });
      G.engine.rig.shake(0.32 + 0.12 * s); G.engine.hitStop = Math.max(G.engine.hitStop, 0.045 + 0.015 * s);
      this.melee = null;
    } }, 0.3);
  },

  // ================================================================== Power Throw → Fastball
  charged_throw(R, aim) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, k = R.charge.perks, C = R.def.charge;
    this.playFrom('throw', { speed: this.animSpeed(0.5), onEvent: ev => {
      if (ev !== 'release') return;
      const from = this.handPos(), base = _v.copy(aim).sub(P.pos).setY(0);
      if (base.lengthSq() < 0.01) base.copy(this.forward()); base.normalize();
      const n = 1 + (k.split || 0), spread = (C.perks.split.spread * Math.PI) / 180, back = k.boomerang ? perkAt(R, 'boomerang').pct / 100 : 0, splitPct = perkAt(R, 'split')?.pct ?? 70;
      for (let i = 0; i < n; i++) {
        // rank 1: two balls either side of the aim; rank 2: one straight down the middle and one each side
        const a = n === 1 ? 0 : n === 2 ? (i - 0.5) * spread : (i - 1) * spread, main = n === 1 || (n === 3 && i === 1) || (n === 2);
        const dmg = p.dmgPct * (main && n !== 2 ? 1 : n === 2 ? 0.85 * Math.min(1, 0.5 + splitPct / 140) : splitPct / 100); // (rank 1's pair: 85% each at Ⅲ, less at lower stages)
        const dir = base.clone().applyAxisAngle(UP, a);
        this.combat.spawn({ team: 'ally', kind: 'fastball', pos: from.clone(), dir, speed: p.speed, range: p.range, radius: 0.34 + 0.04 * s, pierce: 99, returns: true, hitOnReturn: back > 0, bounces: 0, size: p.size,
          onHit: (e, pr) => {
            const ret = pr.returning;
            this.combat.hitMonster(e, { dmgPct: ret ? dmg * back : dmg, knock: ret ? 0.3 : p.knock, from: ret ? pr.pos : P.pos });
            G.vfx.sparks(_w.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), { n: 8, color: '#efff8a', speed: 6, size: 0.3 });
            sfx('ball_bounce', { vol: 0.5, pitch: 1.3 });
          } });
      }
      chargeFx(G).sonic(from, base, R.charge.color);
      sfx('throw', { pitch: 0.85 }); sfx('charge_whoosh', { stage: s });
      G.engine.rig.shake(0.12 + 0.06 * s);
    } }, 0.36);
  },

  // ================================================================== Splash Bolt → Big Splash
  charged_splash(R, aim, target) {
    const G = this.G, P = G.player, p = R.params, s = R.charge.stage, k = R.charge.perks, C = R.def.charge;
    this.playFrom('staffCast', { speed: this.castRate(), onEvent: ev => {
      if (ev !== 'cast') return;
      const from = this.launchPoint(), to = target?.alive ? target.pos : aim;
      const base = _v.set(to.x - from.x, 0, to.z - from.z); if (base.lengthSq() < 0.01) base.copy(this.forward()); base.normalize();
      this.tipFlash(PAL.aqua, 1.2 + 0.2 * s); sfx('splash_cast', { pitch: 0.8 }); sfx('charge_whoosh', { stage: s, pitch: 1.15 });
      const rain = perkAt(R, 'rain');
      const burst = (pos, primary, kk, lead) => {
        const g = this.ground(pos.clone()), r = p.splashRadius * kk;
        const fx = this.fx();
        // the payoff is the wide ring on the ground (the slow): a modest crown, a big ripple and a ring of foam out to r
        fx.splash(g, { r: Math.min(1.25, 0.6 + 0.2 * s) * (kk < 1 ? 0.8 : 1), big: kk >= 1, maxH: 1.6, alpha: 0.62 }); // (≤ 1.6 m and see-through: the foes behind stay readable)
        fx.ripple(g, { r: r * 1.08, life: 0.9, color: PAL.sea, alpha: 0.85 });
        chargeFx(G).burst(g, { r, life: 0.42, color: PAL.aqua, w: 0.1, a: 0.8 });
        fx.droplets(_w.set(g.x, g.y + 0.2, g.z), { n: 10 + 5 * s, speed: 2.1 * r, up: 4.2, size: 0.18, spread: r * 0.25 });
        sfx('water_splash', { pos: g, vol: 1, pitch: 0.8 }); G.engine.rig.shake(0.18 + 0.06 * s);
        this.nova2(g.x, g.z, r, e => { if (e !== primary) this.mokaHit(e, { dmgPct: p.dmgPct * kk * p.splashPct / 100, element: 'frost', knock: 0.5, from: g, chill: p.chill, chillDur: p.chillDur }); });
        if (rain && lead) this.rainShower(g, p, s, rain); // (one shower per cast: on the lead orb's splash)
      };
      const n = 1 + (k.split || 0), spread = (C.perks.split.spread * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : n === 2 ? (i - 0.5) * spread : (i - 1) * spread, main = n !== 3 || i === 1, lead = n === 3 ? i === 1 : i === 0;
        const sp = perkAt(R, 'split')?.pct ?? 70, kk = main ? (n === 2 ? 0.85 * Math.min(1, 0.5 + sp / 140) : 1) : sp / 100;
        const dir = base.clone().applyAxisAngle(UP, a);
        const pr = this.combat.spawn({ team: 'ally', kind: 'bigorb', pos: from.clone(), dir, speed: p.speed, range: p.range, radius: 0.3 + 0.1 * p.size, size: p.size * (main ? 1 : 0.75),
          onHit: e => { pr._hitE = e; this.mokaHit(e, { dmgPct: p.dmgPct * kk, element: 'frost', knock: 0.7, from: P.pos, chill: p.chill, chillDur: p.chillDur }); burst(e.pos, e, kk, lead); },
          onEnd: pr2 => { if (!pr2._hitE) burst(pr2.pos, null, kk, lead); } });
      }
    } }, 0.45);
  },
  /** Rain Shower: mini water bolts fall over the splash (Splash Bolt's unique perk) */
  rainShower(at, p, s, perk) {
    const G = this.G, n = by(perk.n, s), R = perk.r, cx = at.x, cz = at.z, pct = perk.pct / 100;
    for (let i = 0; i < n; i++) {
      this.after(0.12 + i * 0.07 + rand(0, 0.04), () => {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R;
        const to = this.ground(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
        const pr = this.combat.spawn({ team: 'ally', kind: 'waterorb', pos: to.clone().add(_w.set(rand(-0.8, 0.8), 6.5, rand(-0.8, 0.8))), lob: { to, h: 0.4, time: 0.32 }, onEnd: () => {
          this.fx().splash(to, { r: 0.6 }); sfx('water_splash', { pos: to, vol: 0.35, pitch: 1.4 });
          this.nova2(to.x, to.z, 0.75, e => this.mokaHit(e, { dmgPct: p.dmgPct * pct, element: 'frost', knock: 0.15, from: to, chill: p.chill * 0.6, chillDur: 1 }));
        } });
        pr.mesh.scale.setScalar(0.55);
      });
    }
  },
};

/** Mix the charged releases into SkillRunner.prototype (skillRunner.js does this at import). */
export function installChargedSkills(proto) { Object.assign(proto, M); installChargedChewy(proto); installChargedMoka(proto); }
