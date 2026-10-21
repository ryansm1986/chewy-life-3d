// Stella's Corona and Dawn (docs/STELLA.md §3, §5): SkillRunner casts mixed in by stellaSkills.js installStellaSkills, and
// the support plumbing every heal of hers goes through.
//
//  - Heals and shields are a SHARE OF THE TARGET'S OWN LIFE (its body record: stellaAllies.js), × her healing / shield
//    bonus (already in the params: Sunny Disposition). stlHeal(b, n, o): the heal lands (the Zoomies! boost on an ally under
//    35%), healing past full becomes a SUN SHELL (the class trait: up to 20% of that ally's life, 8 s, fading over the last
//    2), the feedback floats ("+N" once per heal per ally, a heal over time's ticks summed every 0.6 s; "Shell +N").
//  - stlSoak(e, dmg, src): a blow on an ally: its halo soaks first (and flares when it gives way), then its shell.
//    stlGuardAlly(e, dmg): Shadow's and the little suns' (companion.js / LittleSun takeDamage): the soak, Sun Dog's catch,
//    Hope Springs.
//  - The Corona: Solar Flare, Skipping Sun, Sunspot, Little Sun (Hinata), Rising Sun.
//  - The Dawn: Morning Light, Kind Light (the ally who needs it most, or a Golden Ray at a foe when nobody does), Halo, Sun
//    Dog (Shadow's own), Daybreak; the Zoomies! passive.
//  - The `ally` aim (combat/autoTarget.js): stlAllyFor(id, aim) is where a heal will go (the ally under the cursor or tapped
//    on touch, else the neediest); the soft rose-gold ring under them while it charges.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import { stlFx } from '../gfx/stellaFx.js';
import { stellaAllies, neediest, bodyOf, fracOf, LittleSun } from './stellaAllies.js';
import { perkAt } from '../rpg/charge.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const FLOAT_EVERY = 0.6, SHELL_FADE = 2;
/** her skills whose heals land on allies (the `ally` aim) */
export const STL_ALLY = new Set(['kindLight', 'halo', 'sunDog']);
const HEAL_COL = '#ffd8c8', SHELL_COL = '#fff1b8';

const M = {
  // ================================================================== the pack's bodies
  stlBody(e) { return bodyOf(this.G, e === 'player' ? this.G.player : e === 'shadow' ? this.G.companion : e); },
  /** the sun shell on an ally ('player' | 'shadow' | an entity) → its amount (0 when none) */
  stlShell(e) { const k = e === 'player' ? this.G.player : e === 'shadow' ? this.G.companion : e; return this.stlShells?.get(k)?.amt || 0; },
  stlShellCap(e) { const b = this.stlBody(e), D = this.G.derived; return b ? b.lifeMax() * ((D.sunTrait?.shell ?? 20) / 100) : 0; },
  /** add to an ally's sun shell (up to the cap) → what it took */
  stlShellAdd(e, n) {
    e = this.stlKey(e);
    const G = this.G, D = G.derived, b = this.stlBody(e); if (!b || !(n > 0)) return 0;
    const S = this.stlShells ||= new Map();
    let s = S.get(e);
    const cap = b.lifeMax() * ((D.sunTrait?.shell ?? 20) / 100);
    if (!s) { s = { amt: 0, cap, t: 0, h: this.stlFx().shell() }; S.set(e, s); sfx('stl_shell', { pos: b.pos, vol: 0.5 }); }
    const before = s.amt; s.cap = cap; s.amt = Math.min(cap, s.amt + n); s.t = D.sunTrait?.shellT ?? 8;
    return s.amt - before;
  },
  stlShellEnd(e, pop = true) { const s = this.stlShells?.get(e); if (!s) return; this.stlShells.delete(e); if (pop && e?.pos) s.h.pop(e.pos); s.h.end(); }, // (its own handle pops: no new mesh taken)
  /** fill every ally's shell to its cap (Daybreak, Clear Morning; the debug menu's "Fill the shells") */
  stlFillShell(e) { e = this.stlKey(e); const cap = this.stlShellCap(e); return this.stlShellAdd(e, cap); },
  /** 'player' / 'shadow' → the entity (the shells and halos are keyed by the entity) */
  stlKey(e) { return e === 'player' ? this.G.player : e === 'shadow' ? this.G.companion : e; },
  stlFillShells() { for (const b of stellaAllies(this.G, null)) this.stlFillShell(b.e); return true; },
  /** QA / the debug menu: every foe round her gilded to full */
  stlGildAll() { let n = 0; for (const e of this.combat?.entities || []) if (isFoe(e)) { this.stlAddGild(e, 3); n++; } return n; },
  /** a manual pick for her heals (a tap on Shadow or his HUD card on touch: STELLA §5.1): e for `secs` */
  stlPickAlly(e, secs = 5) { const k = e === 'shadow' ? this.G.companion : e === 'player' ? this.G.player : e; this.stlPick = k ? { e: k, until: (this.G.engine.time || 0) + secs } : null; return !!k; },

  /** a heal on an ally body: o { src ('pulse' | 'hot' | 'cast'), quiet (no ripple), shell0 (a shell to leave even when
   *  full: Golden Coat) } → the life healed plus the shell gained */
  stlHeal(b, n, o = {}) {
    if (!b || !(n > 0)) return 0;
    const G = this.G, D = G.derived, max = b.lifeMax(), life = b.life();
    if (life <= 0) return 0;
    let a = n;
    const z = D.zoomies;
    if (z && life / max < z.low / 100 && o.src !== 'pulse') { a *= 1 + z.heal / 100; this.stlZoomiesGo(); }
    const healed = b.heal(a) || 0, over = a - healed;
    const sh = (over > 1e-3 ? this.stlShellAdd(b.e, over) : 0) /* (any overflow: a heal over time spills a sliver a frame) */ + (o.shell0 ? this.stlShellAdd(b.e, max * o.shell0 / 100) : 0);
    if (healed + sh <= 0.5) return 0;
    // the feedback: the number (once a heal, or a heal over time's ticks summed), the ripple, Shadow's wag
    const F = (this.stlFloats ||= new Map()), f = F.get(b.e) || { heal: 0, shell: 0, t: 0, h: b.h };
    f.heal += healed; f.shell += sh; f.h = b.h; F.set(b.e, f);
    if (o.src !== 'hot' && o.src !== 'pulse') this.stlFlushFloat(b.e, f);
    if (!o.quiet) this.stlFx().ripple(_v.set(b.pos.x, b.pos.y, b.pos.z), b.kind === 'shadow' ? 0.7 : 1);
    if (b.kind === 'shadow' && healed > 1) this.stlShadowMended(b.e);
    return healed + sh;
  },
  stlFlushFloat(e, f) {
    const G = this.G; f.t = 0;
    if (!e?.pos) return;
    if (f.heal >= 1) G.ui?.float?.(new THREE.Vector3(e.pos.x, e.pos.y + (f.h || 1) + 0.35, e.pos.z), `+${Math.round(f.heal)}`, { kind: 'heal' });
    if (f.shell >= 1) G.ui?.float?.(new THREE.Vector3(e.pos.x + 0.3, e.pos.y + (f.h || 1) + 0.7, e.pos.z), `Shell +${Math.round(f.shell)}`, { kind: 'status', color: SHELL_COL });
    f.heal = 0; f.shell = 0;
  },
  /** Shadow wags and hops when she mends him (a heart, at most every 4 s) */
  stlShadowMended(S) {
    const now = this.G.engine.time || 0;
    if (now - (this._stlWagT ?? -9) < 4) return;
    this._stlWagT = now;
    if (!S.anim?.action || S.anim.action.name === 'sit') S.anim?.play?.('happy');
    this.stlFx().heart(_v.set(S.pos.x, S.pos.y + 0.95, S.pos.z));
  },
  /** a heal over `secs` (its ticks every frame, its number summed every 0.6 s) */
  stlHot(b, total, secs) { if (!b || !(total > 0)) return; (this.stlHots ||= []).push({ e: b.e, per: total / secs, left: secs }); },

  // ================================================================== a blow on an ally: the halo, then the shell
  stlSoak(e, dmg, src = null) {
    if (!(dmg > 0)) return dmg;
    const H = this.stlHalos?.get(e);
    if (H) {
      const take = Math.min(H.amt, dmg); H.amt -= take; dmg -= take;
      if (H.solar && src && isFoe(src) && (this.G.engine.time || 0) - (src._stlSearT ?? -9) > 0.4) { src._stlSearT = this.G.engine.time || 0; this.stlHit(src, { dmgPct: H.solar.pct, tree: 'dawn', from: e.pos }); } // (Solar Halo)
      if (H.amt <= 0.5) this.stlHaloEnd(e, true);
    }
    const S = this.stlShells?.get(e);
    if (S && dmg > 0) { const take = Math.min(S.amt, dmg); S.amt -= take; dmg -= take; if (S.amt <= 0.5) this.stlShellEnd(e, true); }
    return dmg;
  },
  /** Shadow / a little sun takes a blow (their takeDamage calls this) → the damage left */
  stlGuardAlly(e, dmg) {
    const G = this.G; if (G.player?.hero !== 'stella') return dmg;
    e._stlHitT = G.engine.time || 0;
    let src = null;
    if (this.stlHalos?.get(e)?.solar) src = G.combat?.nearest?.(e.pos, 'ally', 2.5, x => isFoe(x)) || null;
    dmg = this.stlSoak(e, dmg, src);
    if (dmg <= 0.5) return 0;
    const life = e.life ?? 0;
    // Sun Dog: the blow that would knock Shadow out leaves him at 1 and mends him instead (once)
    const dog = this.stlDog;
    if (e === G.companion && dog && !dog.caught && dmg >= life) {
      dog.caught = true; e.life = 1; e.heal?.(e.lifeMax * dog.catchPct / 100);
      this.stlCaught(e.pos, 0.8); sfx('stl_catch', { pos: e.pos });
      G.ui?.float?.(new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z), 'Caught!', { kind: 'status', color: SHELL_COL });
      return 0;
    }
    const hope = this.stlDay?.hope;
    if (hope && dmg >= life && !hope.used.has(e) && this.stlInDay(e.pos)) { hope.used.add(e); e.life = Math.max(1, e.lifeMax * hope.pct / 100); this.stlCaught(e.pos, 0.8); return 0; } // (Hope Springs)
    return dmg;
  },
  stlCaught(pos, r) { const fx = this.stlFx(); fx.flare(_h.set(pos.x, pos.y, pos.z), r * 1.6, { small: true, rose: true }); fx.motes(_h.set(pos.x, pos.y + 0.6, pos.z), 10, { r, rise: 1.2, rose: true }); sfx('stl_catch', { pos }); },

  // ================================================================== where an `ally` skill goes (STELLA §5.1)
  /** → the body a heal of `id` will go to (or null: nobody needs it; Kind Light then fires at a foe). aim: the cast's aim
   *  point (an ally under the cursor: them) */
  stlAllyFor(id, aim = null, range = null, target = null) {
    const G = this.G, P = G.player; if (!P) return null;
    const R = this.rt(id), p = R?.params || {}, rng = range ?? p.range ?? 12;
    const list = stellaAllies(G, P.pos, rng), now = G.engine.time || 0, shell = e => this.stlShell(e);
    if (id === 'sunDog') return list.find(b => b.kind === 'shadow') || null;
    // a manual pick: the touch tap (5 s), or the ally right under the aim point
    if (this.stlPick && now < this.stlPick.until) { const b = list.find(x => x.e === this.stlPick.e); if (b) return b; }
    // (not when the cast was aimed at a foe: Shadow biting it stands right there; Kind Light's hand pick is an ally under its full mark)
    if (aim && !(target?.alive && target.team === 'enemy')) { const full = id === 'kindLight' ? (p.full ?? 90) / 100 : 9; let best = null, bd = 0.9; for (const b of list) { const d = dist(b.pos.x, b.pos.z, aim.x, aim.z); if (d < bd && (b.kind !== 'hero' || d < 0.5) && fracOf(b, shell(b.e)) < full) { bd = d; best = b; } } if (best) return best; }
    if (id === 'halo') {
      // an ally without one, the one under attack first (foes within 2.5 m going for them), else her
      let best = null, bs = -1;
      for (const b of list) {
        if (b.kind === 'sun') continue;
        const has = this.stlHalos?.get(b.e), H = has ? has.amt / Math.max(1, has.max) : 0;
        let atk = 0; this.combat?.inRadius?.(b.pos.x, b.pos.z, 2.5, 'ally', x => { if (isFoe(x) && (x.atkTarget === b.e || x.target === b.e)) atk++; });
        const s = atk * 2 + (1 - H) + (b.kind === 'hero' ? 0.5 : 0);
        if (s > bs) { bs = s; best = b; }
      }
      return best || list[0] || null;
    }
    return neediest(G, list, { full: id === 'kindLight' ? (p.full ?? 90) / 100 : 1.01, shell, now });
  },

  // ================================================================== CORONA · Solar Flare
  cast_solarFlare(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, to = this.clampAim(target?.alive && !target.breakable ? target.pos : aim, p.range);
    this.faceTo(to);
    P.anim.play('parasolRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      this.stlFlareAt(to, p, o);
    } });
  },
  stlFlareAt(at, p, o = {}) {
    const G = this.G, fx = this.stlFx(), c = at.clone();
    fx.flare(c, p.radius, { k: 1 });
    sfx('stl_flare', { pos: c });
    G.engine.rig.shake(0.1);
    let n = 0;
    this.combat.inRadius(c.x, c.z, p.radius, 'ally', e => { if (!isFoe(e) && !e.breakable) return; n++; this.stlHit(e, { dmgPct: p.dmgPct, tree: 'flare', from: c, burnPct: p.burnPct, burnDur: p.burnDur, knock: o.coronal ? o.coronal.push * 1.4 : 0.2 }); });
    if (o.coronal) fx.wave(c, p.radius + o.coronal.push);
    if (o.prominence) { // (Prominence: a loop of sunlight to the nearest foe within 5 m of the flare)
      const pr = o.prominence; let best = null, bd = pr.r + p.radius;
      this.combat.inRadius(c.x, c.z, pr.r + p.radius, 'ally', (e, d) => { if (isFoe(e) && d > p.radius * 0.6 && d < bd) { bd = d; best = e; } });
      if (best) { const t = best; fx.loop(_v.set(c.x, c.y + 0.4, c.z), _w.set(t.pos.x, t.pos.y + (t.height || 1) * 0.5, t.pos.z)); this.after(0.22, () => { if (t.alive) this.stlHit(t, { dmgPct: p.dmgPct * pr.pct / 100, tree: 'flare', from: c, burnPct: p.burnPct, burnDur: p.burnDur }); }); }
    }
    return n;
  },

  // ================================================================== CORONA · Skipping Sun
  cast_skippingSun(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, yaw = this.stlAimYaw(aim, target);
    this.stlFace(yaw);
    P.anim.play('skimThrow', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      this.stlFace(yaw);
      sfx('stl_skip', { pitch: 1 });
      this.stlSkimDisc(yaw, p, 1, o);
      for (const s of o.split || []) this.stlSkimDisc(yaw + s.a, p, s.pct / 100, { ...o, split: null }); // (Split Shot)
    } });
  },
  stlSkimDisc(yaw, p, k, o) {
    const G = this.G, P = G.player, from = this.stlFrom(_v).clone();
    from.y = P.pos.y + 0.45;
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), gap = p.length / Math.max(1, p.skips);
    (this.stlDiscs ||= []).push({ pos: from, dir: d, left: p.length, next: Math.min(gap * 0.8, 1.8), gap, skips: p.skips, n: 0, p, k, o, h: this.stlFx().skipper(), t: 0, hit: new Set() });
  },
  updateStlDiscs(dt) {
    const S = this.stlDiscs; if (!S?.length) return;
    const G = this.G, fx = this.stlFx();
    for (let i = S.length - 1; i >= 0; i--) {
      const D = S[i], p = D.p; D.t += dt;
      const step = p.speed * dt; D.pos.addScaledVector(D.dir, step); D.left -= step; D.next -= step;
      const gy = G.world.heightAt?.(D.pos.x, D.pos.z) ?? 0, ph = clamp(1 - D.next / D.gap);
      D.pos.y = gy + 0.12 + Math.sin(ph * Math.PI) * 0.45; // (a low skim: a hop between the skips)
      D.h.set(D.pos, D.t * 18);
      const wall = G.world.collision?.solidAt?.(D.pos.x, D.pos.z, 0.15);
      if (D.next <= 0 || wall) {
        D.next = D.gap; D.n++;
        const at = _h.set(D.pos.x, gy, D.pos.z).clone();
        fx.skip(at, p.radius * (0.8 + 0.2 * D.k));
        sfx('stl_skip', { pos: at, pitch: 1 + D.n * 0.06, vol: 0.6 });
        this.combat.inRadius(at.x, at.z, p.radius, 'ally', e => { if (isFoe(e) || e.breakable) this.stlHit(e, { dmgPct: p.dmgPct * D.k, tree: 'flare', from: at, burnDur: 0 }); });
        if (D.o?.skimmer) this.stlSpot(at, Math.max(0.9, p.radius * 0.9), { duration: D.o.skimmer.t, dmgPct: p.dmgPct * D.o.skimmer.pct / 100 * D.k, tick: 0.5, burnDur: 1 }, { small: true }); // (Sea Skimmer)
        if (D.n >= D.skips || wall) { D.h.end(); S[i] = S[S.length - 1]; S.pop(); continue; }
      }
      if (D.left <= -0.5) { D.h.end(); S[i] = S[S.length - 1]; S.pop(); }
    }
  },

  // ================================================================== CORONA · Sunspot
  cast_sunspot(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, to = this.clampAim(target?.alive && !target.breakable ? target.pos : aim, p.range);
    this.faceTo(to);
    P.anim.play('parasolRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      this.stlSpots = (this.stlSpots || []).filter(s => !s.done && !s.small);
      while (this.stlSpots.length >= p.max) { const old = this.stlSpots.shift(); old.done = true; old.h.end(); }
      this.stlSpot(to, p.radius, p, { wander: o.wander, cycle: o.cycle, target: target?.alive ? target : null });
      sfx('stl_spot', { pos: to });
    } });
  },
  /** a sunspot on the ground: p { duration, dmgPct, tick, burnDur }; o { small, wander, cycle, target } */
  stlSpot(at, r, p, o = {}) {
    const S = { at: at.clone(), r, p, o, t: 0, acc: 0, cyc: 0, h: this.stlFx().spot(at, r), done: false, small: !!o.small, target: o.target || null };
    (this.stlSpotList ||= []).push(S);
    if (!o.small) (this.stlSpots ||= []).push(S);
    return S;
  },
  updateStlSpots(dt) {
    const L = this.stlSpotList; if (!L?.length) return;
    const G = this.G;
    for (let i = L.length - 1; i >= 0; i--) {
      const S = L[i];
      if (S.done || (S.t += dt) >= S.p.duration || G.playerDead) { if (!S.done) S.h.end(); S.done = true; L[i] = L[L.length - 1]; L.pop(); continue; }
      if (S.o.wander) { // (Wandering Spot: it drifts after your target)
        let t = S.target?.alive ? S.target : G.padAim?.lock?.alive ? G.padAim.lock : null;
        if (!t) t = G.combat.nearest(S.at, 'ally', 8, e => isFoe(e)); S.target = t;
        if (t) { const dx = t.pos.x - S.at.x, dz = t.pos.z - S.at.z, d = Math.hypot(dx, dz); if (d > 0.2) { const st = Math.min(d, S.o.wander.speed * dt); S.at.x += dx / d * st; S.at.z += dz / d * st; S.at.y = G.world.heightAt?.(S.at.x, S.at.z) ?? S.at.y; S.h.set(S.at); } }
      }
      S.acc += dt;
      if (S.acc >= S.p.tick) {
        S.acc -= S.p.tick;
        this.combat.inRadius(S.at.x, S.at.z, S.r, 'ally', e => { if (isFoe(e) || e.breakable) this.stlHit(e, { dmgPct: S.p.dmgPct, tree: 'flare', from: S.at, burnPct: S.p.dmgPct * 0.6, burnDur: S.p.burnDur || 1.5, silent: false }); });
      }
      if (S.o.cycle && (S.cyc += dt) >= S.o.cycle.every) { // (Sunspot Cycle: every 2 s it flares)
        S.cyc = 0; S.h.pulse(); this.stlFx().flare(S.at, S.r, { small: true }); sfx('stl_flare', { pos: S.at, vol: 0.5, pitch: 1.1 });
        this.combat.inRadius(S.at.x, S.at.z, S.r, 'ally', e => { if (isFoe(e)) this.stlHit(e, { dmgPct: S.p.dmgPct * S.o.cycle.pct / 100 / 0.5 * S.p.tick, tree: 'flare', from: S.at }); });
      }
    }
  },

  // ================================================================== CORONA · Little Sun (Hinata)
  cast_littleSun(R, aim, target, o = {}) {
    const G = this.G, P = G.player;
    P.anim.play('sunCall', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      const n = o.twin ? 2 : 1;
      this.stlSuns = (this.stlSuns || []).filter(s => s.alive);
      for (let i = 0; i < n; i++) {
        const cur = this.stlSuns.find(s => s.i === i);
        if (cur) { cur.refresh(R, o); cur.fx.motes(cur.pos, 6, { r: 0.3 }); }
        else this.stlSuns.push(new LittleSun(G, this, R, i, o));
      }
      for (const s of this.stlSuns) if (s.i >= n) s.expire();
      this.stlSuns = this.stlSuns.filter(s => s.alive);
    } });
  },

  // ================================================================== CORONA · Rising Sun
  cast_risingSun(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, to = this.clampAim(target?.alive && !target.breakable ? target.pos : aim, p.range);
    this.faceTo(to);
    P.anim.play('parasolRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      const at = to.clone(), rs = this.stlFx().rise(at, p.radius), hang = o.redSky ? o.redSky.t : 0;
      sfx('stl_rise', { pos: at });
      let t = 0, acc = 0;
      const S = { rs, done: false };
      (this.stlRises ||= []).push(S);
      this.stlFx().run(dt => {
        if (S.done) return false;
        t += dt; rs.set(t / p.rise);
        if (t > p.rise && hang) { // (Red Sky: it hangs, scorching everything round it, before it bursts)
          acc += dt;
          if (acc >= 0.5) { acc -= 0.5; this.combat.inRadius(at.x, at.z, p.radius, 'ally', e => { if (isFoe(e)) this.stlHit(e, { dmgPct: o.redSky.pct * 0.5, tree: 'flare', from: at, silent: false }); }); }
        }
        if (t >= p.rise + hang || G.playerDead) {
          S.done = true; if (G.playerDead) { rs.end(); return false; }
          rs.burst(); sfx('stl_flare', { pos: at, pitch: 0.75 }); G.engine.rig.shake(0.3);
          this.combat.inRadius(at.x, at.z, p.radius, 'ally', e => { if (isFoe(e) || e.breakable) this.stlHit(e, { dmgPct: p.dmgPct, tree: 'flare', from: at, knock: p.knockback, burnPct: p.burnPct, burnDur: p.burnDur }); });
          return false;
        }
        return true;
      });
    } });
  },

  // ================================================================== DAWN · Morning Light
  cast_morningLight(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('parasolRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      const at = P.pos.clone(), fx = this.stlFx();
      fx.wash(at, p.radius, { k: o.k || 1 });
      sfx('stl_bell', { pos: at });
      for (const b of stellaAllies(G, at, p.radius)) {
        const total = b.lifeMax() * p.healPct / 100;
        this.stlHeal(b, total * p.now, { src: 'cast' });
        this.stlHot(b, total * (1 - p.now), p.over);
        if (o.clear) { this.stlCleanse(b.e); this.stlFillShell(b.e); } // (Clear Morning)
      }
      if (o.chorus) G.combat.buffs.chorus = { t: o.chorus.t, move: o.chorus.speed }; // (Dawn Chorus)
      if (p.linger > 0) { // (First Light: the light lingers as a warm patch that keeps mending)
        const h = fx.patch(at, p.radius * 0.8), mend = p.healPct * 0.05;
        (this.stlZones ||= []).push(this.combat.addZone({ pos: at, life: p.linger, tick: 0.5, onTick: () => { for (const b of stellaAllies(G, at, p.radius * 0.8)) this.stlHeal(b, b.lifeMax() * mend * 0.5 / 100, { src: 'hot', quiet: true }); }, dispose: () => h.end() }));
      }
    } });
  },
  /** slows, curses and burns lifted from an ally */
  stlCleanse(e) {
    const G = this.G;
    if (e === G.player) { G.player.slowT = 0; delete G.combat?.buffs?.cursed; }
    if (e?.status) { e.status.burn = null; e.status.slow = null; e.status.poison = null; }
  },

  // ================================================================== DAWN · Kind Light
  cast_kindLight(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, first = this.stlAllyFor('kindLight', aim, null, target);
    const look = first ? first.pos : target?.alive && !target.breakable ? target.pos : aim;
    if (dist(look.x, look.z, P.pos.x, P.pos.z) > 0.3) this.faceTo(look);
    const yaw0 = this.stlAimYaw(aim, target);
    P.anim.play('parasolAim', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'release') return;
      sfx('stl_kind');
      const rays = o.rays || 1, used = new Set();
      for (let i = 0; i < rays; i++) {
        const b = i === 0 ? (first && this.stlAllyFor('kindLight', aim, null, target)) : this.stlNextNeedy(used);
        if (b && !used.has(b.e)) { used.add(b.e); this.stlKindHeal(b, p, o); continue; }
        // nobody needs it: a Golden Ray at a foe who deserves it (the `line` rule: the lock's line, or through the most foes)
        const yaw = rays > 1 ? yaw0 + (i - (rays - 1) / 2) * 0.22 : yaw0;
        let foeHit = null;
        this.stlRay(yaw, { dmgPct: p.rayPct, length: p.length, width: p.width, gild: p.gild, tree: 'dawn', rose: true, onHit: e => { foeHit ||= e; } });
        if (o.bright && foeHit) { const nb = this.stlNextNeedy(used, 1.01); if (nb) { used.add(nb.e); this.after(0.15, () => { this.stlFx().kind(_v.set(foeHit.pos.x, foeHit.pos.y + 0.8, foeHit.pos.z), _w.set(nb.pos.x, nb.pos.y + nb.h * 0.6, nb.pos.z)); this.stlHeal(nb, nb.lifeMax() * p.healPct * 0.5 / 100, { src: 'cast' }); }); } } // (Bright Side)
      }
    } });
  },
  stlKindHeal(b, p, o) {
    const from = this.stlFinial(_v).clone();
    this.stlFx().kind(from, _w.set(b.pos.x, b.pos.y + b.h * 0.6, b.pos.z));
    this.stlHeal(b, b.lifeMax() * p.healPct / 100, { src: 'cast', shell0: o.coat ? o.coat.shell : 0 }); // (Golden Coat: a shell even on a full ally)
  },
  /** the next ally who needs a ray (not one already given one) */
  stlNextNeedy(used, full = null) {
    const G = this.G, P = G.player, p = this.rt('kindLight')?.params || {};
    const list = stellaAllies(G, P.pos, p.range ?? 12).filter(b => !used.has(b.e));
    return neediest(G, list, { full: full ?? (p.full ?? 90) / 100, shell: e => this.stlShell(e) });
  },

  // ================================================================== DAWN · Halo
  cast_halo(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, b0 = this.stlAllyFor('halo', aim, null, target) || this.stlBody('player');
    if (b0 && b0.e !== P) this.faceTo(b0.pos);
    P.anim.play('parasolRaise', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      const b = (b0 && this.stlBody(b0.e)) || this.stlBody('player'); // (looked up again: Shadow may have fainted meanwhile)
      sfx('stl_halo', { pos: b?.pos });
      if (b) this.stlHaloOn(b, p, o, 1);
      if (o.ring) for (const x of stellaAllies(G, P.pos, o.ring.r)) if (x.e !== b?.e && x.kind !== 'sun') this.stlHaloOn(x, p, o, o.ring.share / 100); // (Halo Ring)
    } });
  },
  stlHaloOn(b, p, o, share) {
    const H = this.stlHalos ||= new Map(), max = b.lifeMax() * p.absorbPct / 100 * share;
    let h = H.get(b.e);
    if (!h) { h = { amt: 0, max, t: 0, p, h: this.stlFx().halo(), solar: o.solar || null }; H.set(b.e, h); }
    h.max = Math.max(h.max, max); h.amt = Math.max(h.amt, max); h.t = p.duration; h.p = p; if (o.solar) h.solar = o.solar;
    this.stlFx().motes(_v.set(b.pos.x, b.pos.y + b.h + 0.2, b.pos.z), 6, { r: 0.3, rise: 0.6 });
  },
  /** a halo gives way (broken) or runs out: it flares */
  stlHaloEnd(e, broken) {
    const H = this.stlHalos?.get(e); if (!H) return;
    this.stlHalos.delete(e); H.h.end();
    if (!e?.pos) return;
    const p = H.p, at = _h.set(e.pos.x, this.G.world.heightAt?.(e.pos.x, e.pos.z) ?? e.pos.y, e.pos.z).clone();
    this.stlFx().flare(at, p.radius, { small: !broken, rose: true });
    sfx('stl_flare', { pos: at, pitch: 1.2, vol: 0.6 });
    this.combat.inRadius(at.x, at.z, p.radius, 'ally', x => { if (isFoe(x)) this.stlHit(x, { dmgPct: p.flarePct, tree: 'dawn', from: at, burnPct: p.flarePct * 0.2, burnDur: p.burnDur }); });
  },

  // ================================================================== DAWN · Sun Dog (Shadow's own)
  stlCastBlocked(id) {
    const G = this.G, P = G.player;
    if (P?.hero !== 'stella' || id !== 'sunDog') return false;
    const S = G.companion;
    if (S && S.world === G.world && S.pos) return false;
    if (!this._stlNoDogT || G.engine.time - this._stlNoDogT > 1.2) { this._stlNoDogT = G.engine.time; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.6), "Shadow isn't here!", { kind: 'status', color: '#ffe6a0' }); }
    return true;
  },
  cast_sunDog(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params, S = G.companion;
    if (S?.pos) this.faceTo(S.pos);
    P.anim.play('sunCall', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast' || !S) return;
      if (S.fainted > 0) { // (on a fainted Shadow: he wakes at once)
        S.fainted = 0; S.untargetable = false; S.life = Math.round(S.lifeMax * p.wakePct / 100); S.anim.stop('die'); S.anim.play('happy');
        G.ui?.toast?.('Shadow is back on his paws!', { color: '#ffd36a' });
      }
      this.stlDog?.h?.end();
      this.stlDog = { t: p.duration, dur: p.duration, dmgBuff: p.dmgBuff, searPct: p.searPct, catchPct: p.catchPct, caught: false, h: this.stlFx().sunDog(), heel: o.heel || null, twin: o.twinDogs || null, twinT: 0 };
      this.stlFx().flare(_h.set(S.pos.x, S.pos.y, S.pos.z), 1.4, { small: true, rose: false });
      sfx('stl_sundog', { pos: S.pos });
      S.anim.play('happy');
    } });
  },
  /** Shadow's bites while he's a sun dog: the damage boost (%), read by companion.js */
  stlDogBuff() { return this.stlDog?.t > 0 ? this.stlDog.dmgBuff : 0; },
  /** a bite of his lands on e: the sear, Heel!'s taunt */
  stlDogBite(e) {
    const d = this.stlDog; if (!(d?.t > 0) || !e?.alive) return;
    this.stlHit(e, { dmgPct: d.searPct, tree: 'dawn', from: this.G.companion?.pos, source: 'shadow' });
    this.stlFx().motes(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.6, e.pos.z), 3, { r: 0.2 });
    if (d.heel) e._stlHeelT = (this.G.engine.time || 0) + d.heel.t;
  },
  /** Heel!: a foe Shadow bit lately goes for him (companion.tauntFor) */
  stlHeel(m) { return (m._stlHeelT || 0) > (this.G.engine.time || 0); },

  // ================================================================== DAWN · Daybreak
  cast_daybreak(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    P.anim.play('sunCall', { speed: G.derived?.castMul || 1, onEvent: ev => {
      if (ev !== 'cast') return;
      const fx = this.stlFx();
      this.stlDay?.h?.end();
      this.stlDay = { t: p.duration, r: p.radius, at: P.pos.clone(), h: fx.dawn(P.pos, p.radius), acc: 0, miss: p.miss, hope: o.hope ? { pct: o.hope.pct, used: new Set() } : null };
      fx.birds(P.pos, 5);
      sfx('stl_daybreak', { pos: P.pos });
      for (const b of stellaAllies(G, P.pos, p.radius)) { this.stlHeal(b, b.lifeMax() * p.healPct / 100, { src: 'cast' }); this.stlFillShell(b.e); this.stlCleanse(b.e); }
      G.combat.buffs.daybreak = { t: p.duration, dmg: p.dmgBuff, move: p.speed };
      G.ui?.toast?.(`Daybreak! +${p.dmgBuff}% damage`, { color: '#f7b8a8' });
    } });
  },
  stlInDay(pos) { const d = this.stlDay; return !!(d && d.t > 0 && dist(pos.x, pos.z, d.at.x, d.at.z) <= d.r + 0.3); },

  // ================================================================== Zoomies! (a rescue gives her the zoomies)
  stlZoomiesGo() {
    const G = this.G, z = G.derived.zoomies, now = G.engine.time || 0;
    if (!z || now - (this._stlZoomT ?? -99) < z.every) return;
    this._stlZoomT = now;
    this.stlZoom = { t: z.dur, speed: z.speed, dodge: z.dodge, paw: 0, side: 1 };
    sfx('stl_zoomies');
    G.ui?.float?.(G.player.pos.clone().setY(G.player.pos.y + 1.7), 'Zoomies!', { kind: 'status', color: '#ffd36a' });
  },

  // ================================================================== per frame
  updateStellaArts(dt) {
    const G = this.G, P = G.player, fx = this.stlFx(), now = G.engine.time || 0;
    // heals over time
    if (this.stlHots?.length) {
      for (let i = this.stlHots.length - 1; i >= 0; i--) {
        const h = this.stlHots[i], s = Math.min(dt, h.left); h.left -= dt;
        const b = this.stlBody(h.e); if (b) this.stlHeal(b, h.per * s, { src: 'hot', quiet: true });
        if (h.left <= 0 || !b) { this.stlHots[i] = this.stlHots[this.stlHots.length - 1]; this.stlHots.pop(); }
      }
    }
    // the summed numbers (every 0.6 s)
    if (this.stlFloats?.size) for (const [e, f] of this.stlFloats) { f.t += dt; if (f.t >= FLOAT_EVERY && (f.heal >= 1 || f.shell >= 1)) this.stlFlushFloat(e, f); }
    // the sun shells: held up to 8 s, fading over the last 2
    if (this.stlShells?.size) for (const [e, s] of this.stlShells) {
      s.t -= dt;
      if (s.t < SHELL_FADE) s.amt = Math.max(0, s.amt - s.amt * dt / Math.max(dt, s.t + dt));
      const b = this.stlBody(e);
      if (!b || s.t <= 0 || (s.amt <= 0.5 && s.t < SHELL_FADE)) { this.stlShellEnd(e, !!b && s.amt > 0.5); continue; } // (a sliver from a heal over time grows: it ends only once it has faded)
      s.h.set(b.pos, b.h * 1.25, b.kind === 'shadow' ? 0.55 : b.kind === 'sun' ? 0.38 : 0.62, s.amt / Math.max(1, s.cap));
    }
    // the halos
    if (this.stlHalos?.size) for (const [e, h] of this.stlHalos) {
      h.t -= dt; const b = this.stlBody(e);
      if (!b || h.t <= 0) { this.stlHaloEnd(e, false); continue; }
      h.h.set(b.pos, b.h, h.amt / Math.max(1, h.max));
    }
    this.updateStlDiscs(dt);
    this.updateStlSpots(dt);
    // Sun Dog
    const d = this.stlDog;
    if (d) {
      d.t -= dt; const S = G.companion;
      if (d.t <= 0 || !S || S.world !== G.world) { d.h.end(); this.stlDog = null; }
      else {
        d.h.set(S.pos, now);
        if (d.twin && G.mode === 'dungeon' && (d.twinT -= dt) <= 0) { // (Twin Sun Dogs: the mock suns ping his foes)
          d.twinT = d.twin.every;
          const t = G.combat.nearest(S.pos, 'ally', 5, e => isFoe(e));
          if (t) { const a = now * 1.4, from = _v.set(S.pos.x + Math.cos(a) * 0.55, S.pos.y + 0.55, S.pos.z + Math.sin(a) * 0.55); fx.mockSun(from, _w.set(t.pos.x, t.pos.y + (t.height || 1) * 0.5, t.pos.z)); this.stlHit(t, { dmgPct: d.twin.pct, tree: 'dawn', from: S.pos, source: 'shadow' }); }
        }
      }
    }
    // Daybreak: the light round her; foes in it squint
    const day = this.stlDay;
    if (day) {
      day.t -= dt;
      if (day.t <= 0) { day.h.end(); this.stlDay = null; }
      else {
        day.at.copy(P.pos); day.h.set(P.pos, clamp(day.t / 0.8));
        if ((day.acc += dt) >= 0.5) { day.acc = 0; this.combat.inRadius(day.at.x, day.at.z, day.r, 'ally', e => { if (!isFoe(e)) return; e.applyStatus?.('blind', 0.75); e.status.blindMiss = Math.max(e.status.blindMiss || 0, day.miss / 100); }); }
      }
    }
    // the Zoomies: a trail of light motes and sunny paw prints
    const z = this.stlZoom;
    if (z) {
      z.t -= dt;
      if (z.t <= 0) this.stlZoom = null;
      else if ((z.paw -= dt) <= 0 && (P.anim?.speed || 0) > 0.5) { z.paw = 0.16; z.side = -z.side; const f = P.facing; fx.paw(_v.set(P.pos.x + Math.cos(f) * 0.12 * z.side, P.pos.y, P.pos.z - Math.sin(f) * 0.12 * z.side), f); fx.motes(_w.set(P.pos.x, P.pos.y + 0.5, P.pos.z), 2, { r: 0.2, rise: 0.6 }); }
    }
    // the ring under the ally a charging heal will go to
    const a = this.charge?.active;
    if (a && STL_ALLY.has(a.id)) {
      const b = this.stlAllyFor(a.id, this.charge.aim);
      (this.stlRing ||= fx.allyRing()).set(b ? _v.set(b.pos.x, G.world.heightAt?.(b.pos.x, b.pos.z) ?? b.pos.y, b.pos.z) : null, b?.kind === 'shadow' ? 0.5 : 0.7, !!b);
    } else this.stlRing?.set(null, 0.6, false);
  },
  clearStellaArts() {
    for (const [, s] of this.stlShells || []) s.h.end(); this.stlShells?.clear();
    for (const [, h] of this.stlHalos || []) h.h.end(); this.stlHalos?.clear();
    this.stlHots = []; this.stlFloats?.clear();
    for (const D of this.stlDiscs || []) D.h.end(); this.stlDiscs = [];
    for (const S of this.stlSpotList || []) { if (!S.done) S.h.end(); S.done = true; } this.stlSpotList = []; this.stlSpots = [];
    for (const S of this.stlRises || []) { if (!S.done) { S.done = true; S.rs.end(); } } this.stlRises = [];
    this.stlDog?.h?.end(); this.stlDog = null;
    this.stlDay?.h?.end(); this.stlDay = null;
    this.stlZoom = null; this.stlPick = null;
    for (const z of this.stlZones || []) z.life = 0; this.stlZones = []; // (Afterglow, First Light: their zones end with her)
    this.stlRing?.end(); this.stlRing = null;
    if (this.G.combat?.buffs) { delete this.G.combat.buffs.daybreak; delete this.G.combat.buffs.chorus; }
  },
};

export function installStellaArts(proto) { for (const k in M) if (!(k in proto)) proto[k] = M[k]; }
export { perkAt };
