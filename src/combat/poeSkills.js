// Poe's skills (docs/POE.md): SkillRunner cast implementations (`cast_<id>(R, aim, target)`) plus the per-frame state they
// need: the thrown fūma's flight (out and back, hitting on both passes), stealth (Smoke Bomb's vanish and, in phase 2,
// Vanish), blinding smoke, Shadow Step's melt-and-strike, the slash combo's lunge, her dodge. installPoeSkills(proto)
// mixes these into SkillRunner; skillRunner.js routes the fūma basic attack here (cast_fumaSlash), asks castBlocked()
// before a cast (Fūma Throw waits for the fūma to come home) and calls updatePoe(dt) / clearPoe(); combat.js asks
// poeDodge() before a monster's hit lands; monsters skip a hidden player (dungeon/monster.js) and miss when blinded.
// Looks: gfx/poeFx.js; poses: actors/poePoses.js; the fūma props and the ghost: actors/poeGear.js; sounds: audio/poe.sfx.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist, angleDiff } from '../core/util.js';
import { poeFx, POE_COL } from '../gfx/poeFx.js';
import { ghost, tickGhost } from '../actors/poeGear.js';
import { M as ARTS } from './poeArts.js';
import { M as JUTSU } from './poeJutsu.js';
import { M as SHADOW } from './poeShadow.js';
import { installChargedPoe } from './chargedPoe.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;
const SLASHES = ['fumaSlash', 'fumaSlash2', 'fumaTwirl'];
const SLASH_SET = new Set(SLASHES);
const LUNGE = 1.2, LUNGE_SPEED = 10;

const M = {
  pfx() { return poeFx(this.G); },
  /** a hit from Poe: hitMonster + her crit extras (a Vanish double crit window, a strike from behind) */
  poeHit(e, o) {
    if (!e.alive) return 0;
    const cw = this.poeCrit;
    if (cw && !o.clone && !o.noMark) {
      o.forceCrit = true; o.critX = cw.critX || 2; o.mult = (o.mult || 1) * (1 + (cw.bonusPct || 0) / 100); cw.used = true;
      // (Assassin: a charged Vanish's opening strike hits everything round its target too)
      if (cw.aoe && !cw.aoeDone) { cw.aoeDone = true; const o2 = { ...o, noMark: true }; this.combat.inRadius(e.pos.x, e.pos.z, cw.aoe, 'ally', x => { if (x !== e) this.combat.hitMonster(x, { ...o2 }); }); this.pfx().ring(e.pos, cw.aoe, 0.3, POE_COL.violet, 0.5); }
    }
    if (this.poeMarks?.size) o.mult = (o.mult || 1) * this.poeMarkHit(e, o); // (Bullseye Mark: +damage, a stack)
    return this.combat.hitMonster(e, o);
  },
  // ------------------------------------------------------------------ hooks (skillRunner.js / combat.js)
  /** tryCast asks first: true = not now (queued). Fūma Throw waits for the fūma to come home. */
  castBlocked(id, aim, target, charge) {
    if (id === 'fumaThrow' && this.poeFuma) { this.queued = { id, aim: aim.clone(), target, t: Math.min(2, this.poeFuma.eta + 0.3), charge }; return true; }
    return false;
  },
  /** combat.hitPlayer asks this before a monster's hit lands: true = dodged (Swift as Wind, her class dodge) */
  poeDodge(src, from) {
    const G = this.G, P = G.player, d = G.derived?.dodge || 0;
    if (!(d > 0) || Math.random() * 100 >= d) return false;
    G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.45), 'Dodge!', { kind: 'status', color: '#bff0c0' });
    const s = from || src?.pos; _d.set(s ? P.pos.x - s.x : Math.sin(P.facing), 0, s ? P.pos.z - s.z : Math.cos(P.facing)); if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0); _d.normalize();
    this.pfx().dodge(P.pos, _d.set(-_d.z, 0, _d.x));
    sfx('poe_dodge', { vol: 0.7 });
    return true;
  },

  // ================================================================== basic attack: the fūma slash combo
  cast_fumaSlash(R, aim, target) {
    const G = this.G, P = G.player, p = R.params;
    this.poeBreakStealth();
    const now = G.engine.time || 0;
    if (now - (this.poeComboT || -9) > 1.1) this.poeCombo = 0;
    const k = (this.poeCombo || 0) % 3; this.poeCombo = (this.poeCombo || 0) + 1; this.poeComboT = now;
    const m = this.melee; this.melee = null; // (her own lunge below: skillRunner's tracks only Chewy's swings)
    this.poeMelee = m ? { target: m.target, reach: m.reach, budget: m.budget } : null;
    const twirl = k === 2, act = SLASHES[k], paws = !!this.poeFuma; // (the fūma is out: a paw strike instead)
    P.anim.play(act, { speed: this.attacksPerSec() * (twirl ? 0.42 : 0.45), onEvent: ev => {
      if (ev !== 'hit') return;
      this.poeSnapIn(target, p.radius);
      const f = P.facing, arc = twirl ? 330 : p.arc, fx = this.pfx();
      const slashC = paws ? '#fff4e8' : '#fff8e8';
      if (twirl) {
        G.vfx.slash(P.pos, f, { arc: 6.0, r: p.radius * 0.98, width: 0.85, color: slashC, life: 0.24 });
        G.vfx.slash(P.pos, f + 1.4, { arc: 5.0, r: p.radius * 0.72, width: 0.5, color: '#ffe08a', life: 0.2, reverse: true });
      } else {
        G.vfx.slash(P.pos, f, { arc: arc * Math.PI / 180, r: p.radius * 0.96, width: paws ? 0.55 : 0.85, color: slashC, life: 0.2, reverse: k === 1 });
        G.vfx.slash(P.pos, f, { arc: arc * Math.PI / 180 * 0.85, r: p.radius * 0.7, width: 0.42, color: '#ffe08a', life: 0.16, reverse: k === 1 });
      }
      sfx(paws ? 'swing' : 'fuma_slash', { pitch: 1 + k * 0.08 });
      let hit = 0;
      this.arcHit(P.pos, f, p.radius, arc, e => {
        this.poeHit(e, { dmgPct: p.dmgPct * (twirl ? 1.15 : 1) * (paws ? 0.85 : 1), knock: p.knockback * (twirl ? 2 : 1), from: P.pos });
        if (!e.breakable) fx.flecks(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.5, e.pos.z), 3);
        hit++;
      }, target);
      if (hit) G.engine.rig.shake(twirl ? 0.18 : 0.1);
      this.poeMelee = null;
      this.poeCloneEcho?.('slash', { arc, radius: p.radius, dmgPct: p.dmgPct * (twirl ? 1.15 : 1) }); // (her shadow clones slash with her)
    } });
  },
  /** at the hit frame: close a small gap to the aimed-at foe (what's left of the lunge budget) */
  poeSnapIn(target, radius) {
    const m = this.poeMelee, G = this.G, P = G.player;
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
  /** during the slash wind-up: keep facing the target and lunge (≤ LUNGE, collision-safe) if it drifted away */
  poeTrackMelee(dt) {
    const m = this.poeMelee, G = this.G, P = G.player;
    if (!m) return;
    const act = P.anim.action?.name;
    if (!m.target.alive || G.playerDead || P.leap || P.dash || !SLASH_SET.has(act)) { this.poeMelee = null; return; }
    const t = m.target, dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    P.faceTarget = P.facing = Math.atan2(dx, dz);
    if (d > m.reach + m.budget + 0.35) { this.poeMelee = null; return; }
    const want = d - (m.reach - 0.3);
    if (want <= 0 || m.budget <= 0) return;
    const step = Math.min(want, m.budget, LUNGE_SPEED * dt);
    _t.copy(P.pos); P.pos.x += dx / d * step; P.pos.z += dz / d * step;
    G.world.collision?.resolve(P.pos, P.radius, _t); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    const moved = Math.hypot(P.pos.x - _t.x, P.pos.z - _t.z);
    m.budget = moved < step * 0.3 ? 0 : m.budget - moved;
  },

  // ================================================================== SHURIKEN ARTS · Fūma Throw
  cast_fumaThrow(R, aim, target, o = {}) {
    const P = this.G.player;
    this.poeBreakStealth();
    P.anim.play('fumaThrow', { speed: this.animSpeed(0.55), onEvent: ev => { if (ev === 'release') { this.poeLaunchFuma(R, aim, target, o); if (o.twin) this.poeTwinFuma(R, aim, target, o); } } });
  },
  /** Twin Fūma (a charged throw's perk): smoky copies of the fūma on wider curves either side, out and back (o.twin.pct each) */
  poeTwinFuma(R, aim, target, o) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx(), look = P.equippedLook?.() || {};
    const to = target?.alive && !target.breakable ? target.pos : aim, base = Math.atan2(to.x - P.pos.x, to.z - P.pos.z);
    for (let i = 0; i < o.twin.n; i++) {
      const side = o.twin.n === 1 ? (Math.random() < 0.5 ? -1 : 1) : (i ? 1 : -1), a0 = base + side * 0.5, h = fx.fumaFly(look, this.fumaScale() * 0.8 * (o.size || 1));
      const pos = this.poeHand(_h).clone(), dir = new THREE.Vector3(Math.sin(a0), 0, Math.cos(a0)), hitO = new Set(), hitB = new Set();
      let trav = 0, back = false, spin = 0, bt = 0;
      this.poeZone({ life: 3, update: (dt, z) => {
        spin += dt * 30;
        const home = _w.set(P.pos.x, P.pos.y + 0.85, P.pos.z);
        if (!back) { dir.applyAxisAngle(_d.set(0, 1, 0), -side * 1.6 * dt); const v = p.speed * 0.95; pos.addScaledVector(dir, v * dt); trav += v * dt; if (trav >= p.range * 0.85) back = true; }
        else { bt += dt; const L = Math.hypot(home.x - pos.x, home.z - pos.z); if (L < 0.7) return false; const v = Math.min(p.speed * (0.5 + bt * 2.2), p.speed * 1.3); pos.x += (home.x - pos.x) / L * Math.min(L, v * dt); pos.z += (home.z - pos.z) / L * Math.min(L, v * dt); }
        h.set(pos, spin, 0, p.speed, G.world.heightAt(pos.x, pos.z));
        const set = back ? hitB : hitO;
        for (const e of this.combat.entities) if (e.alive && e.team === 'enemy' && !set.has(e) && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < p.radius * 0.8 + (e.radius || 0.3)) { set.add(e); this.poeHit(e, { dmgPct: p.dmgPct * o.twin.pct / 100, knock: 0.2, from: pos.clone() }); }
      }, end: () => h.end() });
    }
  },
  /** the fūma leaves her paw: it whirls out along a gentle curve, swings round at the end of its range and homes back */
  poeLaunchFuma(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const hand = P.rig?.parts?.handR;
    if (hand) hand.getWorldPosition(_h); else _h.copy(P.pos);
    const y = P.pos.y + 0.85;
    const to = target?.alive && !target.breakable ? target.pos : aim;
    const dir = new THREE.Vector3(to.x - P.pos.x, 0, to.z - P.pos.z); if (dir.lengthSq() < 0.01) dir.set(Math.sin(P.facing), 0, Math.cos(P.facing)); dir.normalize();
    const look = P.equippedLook?.() || {};
    const f = this.poeFuma = {
      pos: new THREE.Vector3(_h.x, y, _h.z), dir, p, out: true, traveled: 0, t: 0, spin: 0, speed: p.speed, range: p.range,
      curve: (o.curve ?? p.curve) * (o.side || 1), hitOut: new Set(), hitBack: new Set(), h: this.pfx().fumaFly(look, this.fumaScale() * (o.size || 1)), whirr: 0, eta: (p.range * 2) / p.speed, y,
      orbit: o.orbit || null, // (Orbiting Fūma: it circles at the far end before it comes home)
    };
    f.h.set(f.pos, 0, 0, f.speed, P.pos.y);
    P.setFumaOut?.(true);
    if (!o.noEcho) this.poeCloneEcho?.('throw', { dir, range: p.range, speed: p.speed, dmgPct: p.dmgPct }); // (and throw with her)
    sfx('fuma_throw');
    G.engine.rig.shake(0.08);
    return f;
  },
  updateFuma(dt) {
    const f = this.poeFuma; if (!f) return;
    const G = this.G, P = G.player, W = G.world, p = f.p, fx = this.pfx();
    f.t += dt;
    // where she'll catch it: her paw at chest height
    _w.set(P.pos.x, P.pos.y + 0.85, P.pos.z);
    const home = Math.hypot(_w.x - f.pos.x, _w.z - f.pos.z);
    // a boomerang's teardrop: out along the aim with a gentle bend, bleeding speed toward the end of its range; then a
    // tight swing round (slow, so the turn is small) and an accelerating run home to her paw
    if (f.out) {
      const k = clamp(f.traveled / f.range), v = f.speed * (1 - 0.62 * k * k);
      f.dir.applyAxisAngle(_d.set(0, 1, 0), f.curve * dt * (0.5 + 2.2 * k * k));
      const nx = f.pos.x + f.dir.x * v * dt, nz = f.pos.z + f.dir.z * v * dt;
      if (W.collision?.solidAt?.(nx, nz, 0.12)) { this.turnFuma(f); G.vfx.sparks(f.pos, { n: 6, color: '#fff6e0', speed: 3, size: 0.22 }); sfx('fuma_clank', { pos: f.pos }); }
      else { f.pos.x = nx; f.pos.z = nz; f.traveled += v * dt; }
      if (f.traveled >= f.range) { if (f.orbit && !f.orb) { f.orb = { t: 0, c: f.pos.clone(), a: 0, cut: 0 }; f.out = false; } else this.turnFuma(f); }
      f.vel = v; f.eta = (f.range - f.traveled) / Math.max(4, v) + (f.range + 1) / (f.speed * 1.1);
    } else if (f.orb && f.orb.t < f.orbit.t) {
      // circling the far end, cutting everything round it every so often
      const O = f.orb; O.t += dt; O.a += dt * 9;
      f.pos.set(O.c.x + Math.cos(O.a) * 0.7, f.y, O.c.z + Math.sin(O.a) * 0.7); f.vel = 14;
      O.cut -= dt; if (O.cut <= 0) { O.cut = f.orbit.every; this.poeNova(O.c.x, O.c.z, f.orbit.r, e => this.poeHit(e, { dmgPct: p.dmgPct * f.orbit.pct / 100, knock: 0.15, from: O.c })); sfx('fuma_whirr', { pos: f.pos, vol: 0.6, pitch: 1.2 }); }
      if (O.t >= f.orbit.t) { this.turnFuma(f); f.t = Math.min(f.t, 1.2); }
      f.eta = (f.orbit.t - O.t) + (f.range + 1) / (f.speed * 1.1);
    } else {
      const L = home;
      if (L < 0.62 || f.t > 4.5) return this.catchFuma(f.t > 4.5);
      f.back += dt;
      _d.set((_w.x - f.pos.x) / L, 0, (_w.z - f.pos.z) / L);
      const want = Math.atan2(_d.x, _d.z), cur = Math.atan2(f.dir.x, f.dir.z), turn = clamp(angleDiff(cur, want), -13 * dt, 13 * dt);
      f.dir.applyAxisAngle(_v.set(0, 1, 0), turn); f.dir.normalize();
      const v = f.speed * Math.min(0.38 + f.back * 2.2, 1.3); // (the run home scales with the throw's speed: the same teardrop at every level)
      f.pos.addScaledVector(f.dir, Math.min(L, v * dt)); f.vel = v;
      f.eta = L / Math.max(4, v);
    }
    f.pos.y = f.out ? f.y : f.y + (_w.y - f.y) * clamp(1 - home / 3); // (eases to her paw's height for the catch)
    // hits: each foe once per pass (pots too)
    const set = f.out ? f.hitOut : f.hitBack, pct = f.out ? 1 : p.backPct / 100;
    for (const e of this.combat.entities) {
      if (!e.alive || e.team !== 'enemy' || set.has(e)) continue;
      if (Math.hypot(e.pos.x - f.pos.x, e.pos.z - f.pos.z) > p.radius + (e.radius || 0.3)) continue;
      set.add(e);
      this.poeHit(e, { dmgPct: p.dmgPct * pct, knock: p.knockback, from: f.pos });
      if (!e.breakable) { fx.flecks(_h.set(e.pos.x, f.pos.y, e.pos.z), 4); sfx('fuma_hit', { pos: e.pos }); }
    }
    f.spin += dt * (24 + f.vel * 0.6);
    f.h.set(f.pos, f.spin, f.out ? -f.curve * 0.25 : 0.12, f.vel, W.heightAt(f.pos.x, f.pos.z));
    fx.trail(f.pos, f.dir, dt, clamp(f.vel / 15, 0.3, 1.2));
    f.whirr -= dt; if (f.whirr <= 0) { f.whirr = 0.15; sfx('fuma_whirr', { pos: f.pos, vol: 0.55, pitch: 0.9 + f.vel / 60 }); }
  },
  /** the size the fūma is on her back (world scale of `fuma_back`), so a thrown one doesn't shrink as it leaves her */
  fumaScale() { const b = this.G.player?.rig?.parts?.fumaBack; return b ? Math.max(1.2, b.getWorldScale(_t).x) : 1.43; },
  /** the far end of the throw (or a wall): it swings round for home */
  turnFuma(f) { f.out = false; f.back = 0; },
  catchFuma(late = false) {
    const f = this.poeFuma; if (!f) return;
    const G = this.G, P = G.player;
    f.h.end(); this.poeFuma = null;
    P.setFumaOut?.(false);
    if (late) return;
    const hand = P.rig?.parts?.handR; if (hand) hand.getWorldPosition(_h); else _h.copy(P.pos).setY(P.pos.y + 0.9);
    this.pfx().catchGlint(_h);
    sfx('fuma_catch');
    if (!P.anim.action && !P.leap && !P.dash) P.anim.play('fumaCatch');
  },

  // ================================================================== NINJUTSU · Smoke Bomb
  cast_smokeBomb(R, aim, target, o = {}) {
    const G = this.G, P = G.player;
    this.poeBreakStealth(true);
    P.anim.play('handSeal', { speed: this.castRate?.() || 1, onEvent: ev => {
      if (ev === 'seal') { _h.set(P.pos.x, P.pos.y + 0.95, P.pos.z).addScaledVector(this.forward(), 0.32); this.pfx().pa.spawn({ frame: 14, x: _h.x, y: _h.y, z: _h.z, life: 0.32, size: 0.35, size1: 0.6, color: POE_COL.violet, alpha: 0.9, alpha1: 0, spin: 3 }); sfx('poe_seal'); }
      else if (ev === 'poof') this.poeSmokeBurst(R, o);
    } });
  },
  poeSmokeBurst(R, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    const at = P.pos.clone();
    fx.puff(at, { r: p.radius * 0.72 });
    fx.smokeCloud(at, p.radius, 1.7);
    fx.word('POOF!', _h.set(at.x, at.y + 1.6, at.z), { a: '#ffffff', b: '#cfc4ec', size: 1.0, life: 0.7 });
    sfx('smoke_bomb'); G.engine.rig.shake(0.16);
    this.nova(at, p.radius, e => {
      this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.8, from: at });
      if (e.alive && !e.breakable) this.poeBlind(e, p.blind, p.miss);
    });
    this.poeHide(p.vanish, 'smoke', o.perfect ? { critX: o.perfect.critX, noSneeze: true } : null);
    // Extra Pepper (a charged bomb's perk): the cloud keeps them coughing
    if (o.pepper) { let tk = 1; this.poeZone({ life: o.pepper.t, update: dt => { tk -= dt; if (tk > 0) return; tk = 1; this.poeNova(at.x, at.z, p.radius, e => { this.poeHit(e, { dmgPct: p.dmgPct * o.pepper.pct / 100, element: 'stink', from: at }); if (!e.breakable && Math.random() < 0.4) G.vfx.emote(e, 'sweat', 0.8); }); } }); fx.smokeCloud(at, p.radius, o.pepper.t); }
  },
  /** blind a foe: its attacks miss `miss`% of the time for dur s (dungeon/monster.js dealTo), and it loses its swing */
  poeBlind(e, dur, miss) {
    e.applyStatus?.('blind', dur);
    if (e.status) e.status.blindMiss = Math.max(e.status.blindMiss || 0, miss / 100);
    if (e.state === 'windup' && !e.def?.boss) e.cancelAttack?.();
    this.pfx().blindSwirl(e);
  },
  /** go unseen for dur s: monsters drop her (dungeon/monster.js pickTarget skips a hidden player), she turns to a shimmer */
  poeHide(dur, kind, extra = null) {
    const G = this.G, P = G.player;
    P.hidden = true; P._ghost = 1; P._fumaDrawn = -1;
    ghost(P.rig, true, 1);
    this.poeStealth = { t: dur, max: dur, kind, ...extra };
    let n = 0;
    for (const e of this.combat.entities) {
      if (!isFoe(e) || !e.aggro) continue;
      if (e.atkTarget === P && (e.state === 'windup' || e.state === 'attack') && !e.def?.boss) e.cancelAttack?.();
      if (n < 6 && dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) < 14) { n++; G.vfx.emote(e, '?', 1.1); }
    }
    sfx('poe_vanish');
  },
  /** seen again (why: 'time' — it wore off, 'attack' — she struck from it, 'clear' — a switch / a floor change) */
  poeReveal(why = 'time') {
    const G = this.G, P = G.player, s = this.poeStealth;
    this.poeStealth = null;
    if (P) { P.hidden = false; P._ghost = 0; P._fumaDrawn = -1; ghost(P.rig, false); }
    if (!P || !s || why === 'clear') return;
    if (why === 'time' && s.kind === 'smoke' && !s.noSneeze && Math.random() < 0.35) this.poeSneeze(); // (perfectly stealthy. mostly.)
  },
  /** attacking from stealth breaks it; from Vanish the strike that breaks it is a double crit (phase 2: s.critX) */
  poeBreakStealth(quiet = false) {
    const s = this.poeStealth; if (!s) return;
    if (s.critX) this.poeCrit = { t: 0.35, critX: s.critX, bonusPct: s.bonusPct || 0, aoe: s.aoe || 0 };
    // Smoke Exit (a charged Vanish's perk): she leaves it in a puff of pepper smoke
    if (s.smokeExit) { const P = this.G.player, fx = this.pfx(); fx.puff(P.pos, { r: s.smokeExit.r * 0.7, n: 12 }); sfx('smoke_bomb', { vol: 0.6 }); this.nova(P.pos, s.smokeExit.r, e => { if (e.alive && !e.breakable) this.poeBlind(e, s.smokeExit.blind, 50); }); }
    this.poeReveal(quiet ? 'clear' : 'attack');
  },
  /** ah-ah-ACHOO: every foe nearby looks round */
  poeSneeze() {
    const G = this.G, P = G.player;
    const go = () => {
      const fwd = this.forward(); _h.set(P.pos.x, P.pos.y + 0.95, P.pos.z).addScaledVector(fwd, 0.38);
      this.pfx().sneeze(_h, fwd); sfx('poe_sneeze');
      for (const e of this.combat.entities) if (isFoe(e) && dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) < 8) { G.vfx.emote(e, '!', 0.9); e.alert?.(); }
    };
    if (!P.anim.action && !P.leap && !P.dash) P.anim.play('sneeze', { onEvent: ev => { if (ev === 'achoo') go(); } });
    else go();
  },

  // ================================================================== SHADOW STEP · Shadow Step
  cast_shadowStep(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const foe = this.pickFoe(aim, target, p.range);
    if (!foe) { G.actions.restoreZoom?.(R.cost); this.cds.shadowStep = 0; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), 'Nobody to sneak up on!', { kind: 'status', color: '#c8bce8' }); sfx('ui_error'); return; }
    this.poeBreakStealth();
    const spot = this.poeBehind(foe);
    const fx = this.pfx(), from = P.pos.clone();
    this.poeStep = { foe, spot, from, R, t: 0, o };
    P.invuln = true; P.moveTarget = null;
    this.faceTo(foe.pos);
    fx.puddle(from, { r: 0.75, life: 0.7 }); fx.wisps(from, 7);
    sfx('shadow_step');
    P.anim.play('shadowStepOut', { speed: 1, onEvent: ev => { if (ev === 'step') this.poeStepArrive(); } });
  },
  /** the open spot right behind a foe (its back to her), else beside it, else the near side */
  poeBehind(foe) {
    const G = this.G, P = G.player, W = G.world, f = foe.facing ?? Math.atan2(P.pos.x - foe.pos.x, P.pos.z - foe.pos.z) + Math.PI;
    const d = (foe.bodyR || foe.radius || 0.3) + 0.55;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const a = f + Math.PI + off, x = foe.pos.x + Math.sin(a) * d, z = foe.pos.z + Math.cos(a) * d;
      if ((W.walkable && !W.walkable(x, z)) || W.collision?.solidAt?.(x, z, 0.3)) continue;
      return new THREE.Vector3(x, W.heightAt(x, z), z);
    }
    const dx = P.pos.x - foe.pos.x, dz = P.pos.z - foe.pos.z, L = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(foe.pos.x + dx / L * d, P.pos.y, foe.pos.z + dz / L * d);
  },
  poeStepArrive() {
    const S = this.poeStep; if (!S) return;
    const G = this.G, P = G.player, fx = this.pfx(), p = S.R.params, foe = S.foe;
    if (foe.alive) { const sp = this.poeBehind(foe); S.spot.copy(sp); } // (it moved during the melt)
    P.setPos(S.spot.x, S.spot.z); P.pos.y = G.world.heightAt(P.pos.x, P.pos.z);
    if (foe.alive) this.faceTo(foe.pos);
    P.sync?.();
    fx.streak(S.from, S.spot); fx.puddle(S.spot, { r: 0.8, life: 0.75 }); fx.wisps(S.spot, 9);
    sfx('shadow_pop');
    S.phase = 'strike';
    P.anim.play('shadowStrike', { speed: 1.05, onEvent: ev => {
      if (ev === 'hit') {
        const f = P.facing;
        G.vfx.slash(P.pos, f, { arc: p.arc * Math.PI / 180, r: p.radius * 1.05, width: 0.9, color: '#fff8ec', life: 0.22, tilt: -0.5 });
        G.vfx.slash(P.pos, f, { arc: p.arc * Math.PI / 180 * 0.8, r: p.radius * 0.72, width: 0.5, color: '#9a86d8', life: 0.2, reverse: true, tilt: -0.5 });
        sfx('fuma_slash', { pitch: 0.9 }); sfx('swing_heavy', { vol: 0.5 });
        this.arcHit(P.pos, f, p.radius, p.arc, e => {
          this.poeHit(e, { dmgPct: p.dmgPct, knock: p.knockback, from: P.pos, critAdd: e === foe ? p.critBonus : 0, forceCrit: e === foe && !!S.o?.sure }); // (from behind: the crit bonus; Sure Kill: a sure crit)
          if (!e.breakable) fx.flecks(_h.set(e.pos.x, e.pos.y + (e.height || 1) * 0.55, e.pos.z), 5);
        }, foe.alive ? foe : null);
        G.engine.rig.shake(0.2);
        // Second Shadow (a charged step's perk): her shadow cuts the same foe again a moment later
        const ec = S.o?.echo;
        if (ec && foe.alive) this.after(ec.delay || 0.45, () => { if (!foe.alive) return; G.vfx.slash(foe.pos, P.facing + Math.PI, { arc: 2.2, r: 1.2, width: 0.7, color: '#b8a8e8', life: 0.2, tilt: -0.5, glow: false }); fx.wisps(foe.pos, 5); sfx('fuma_slash', { pitch: 0.8, vol: 0.6 }); this.poeHit(foe, { dmgPct: p.dmgPct * ec.pct / 100, knock: 0.2, from: P.pos, critAdd: p.critBonus }); });
      } else if (ev === 'end') { P.invuln = false; this.poeStep = null; }
    } });
  },

  // ================================================================== per frame
  updatePoe(dt) {
    const G = this.G, P = G.player;
    if (!P) return;
    tickGhost(G.engine.time || 0);
    if (this.poeFuma) this.updateFuma(dt);
    if (this.poeMelee) this.poeTrackMelee(dt);
    // stealth: wears off; the shimmer pulses a little as it runs out
    const S = this.poeStealth;
    if (S) {
      S.t -= dt;
      if (P.rig && !P.rig._ghostOn) ghost(P.rig, true, 1); // (a rig swap mid-stealth)
      ghost(P.rig, true, clamp(S.t / Math.max(0.01, S.max)) * 0.6 + 0.4 + 0.15 * Math.sin((G.engine.time || 0) * 9) * (S.t < 0.6 ? 1 : 0));
      if (S.t <= 0 || G.playerDead) this.poeReveal(G.playerDead ? 'clear' : 'time');
    }
    if (this.poeCrit) { this.poeCrit.t -= dt; if (this.poeCrit.t <= 0) this.poeCrit = null; }
    P.poeSpeed = S?.move || 1; // (Vanish: +move speed while unseen — player.js speedMul)
    // phase 2: her thrown things, traps and fields, dashes, flips, marks, clones, logs
    this.updatePoeShots(dt); this.updatePoeZones(dt); this.updatePoeDash(dt); this.updatePoeFlip(dt); this.updatePoeMarks(dt); this.updatePoeBarrage(dt);
    if (this.poeClones?.length) { for (const c of this.poeClones) c.update(dt); if (this.poeClones.some(c => !c.alive)) this.poeClones = this.poeClones.filter(c => c.alive); }
    if (this.poeLogs?.length) { for (const l of this.poeLogs) l.update(dt); if (this.poeLogs.some(l => !l.alive)) this.poeLogs = this.poeLogs.filter(l => l.alive); }
    // keep a few smoke copies of her rig ready (Shadow Clone, Afterimage Dash): one built every half second while idle
    if (P.hero === 'poe' && G.mode === 'dungeon' && !this.poeDash && !this.poeBarrage && (this._imgWarm = (this._imgWarm || 0) - dt) <= 0) { this._imgWarm = 0.5; if (this.poeImgRig !== P.rig || (this.poeImgAll?.length || 0) < 4) this.poeImageWarm(); }
    if (this._subT > 0) { this._subT -= dt; if (this._subT <= 0 && !G.heroSwitching && !this.poeStep && !this.poeDash && !this.poeBarrage && !this.poeFlip) P.invuln = false; }
    // Thunder Paw's raised paw crackles; a charging wind-up gathers its element on her
    if (this.poeCrackleT > 0) { this.poeCrackleT -= dt; this.pfx().crackle(this.poeHand(_h), dt, 40); }
    const ch = this.charge?.active;
    if (ch && P.hero === 'poe' && !ch.chan) this.pfx().gather(this.charge.focusPoint(_h), ch.c.pose, dt, ch.tMax ? ch.t / ch.tMax : 0);
    // Shadow Step safety: never stuck invulnerable (an interrupted strike)
    const st = this.poeStep;
    if (st) { st.t += dt; const a = P.anim.action?.name; if (st.t > 1.2 || (a !== 'shadowStepOut' && a !== 'shadowStrike' && st.t > 0.1)) { P.invuln = !!G.heroSwitching; this.poeStep = null; } }
    // blinded foes squint and cough a little (rate-limited)
    this.poeBlindT = (this.poeBlindT || 0) - dt;
    if (this.poeBlindT <= 0) {
      this.poeBlindT = 0.45;
      const fx = this.pfx();
      for (const e of this.combat.entities) if (e.alive && e.status?.blind > 0 && !e.breakable) fx.blindSwirl(e);
    }
  },
  /** end every Poe effect (floor change, hero switch, death): the player's rig may be replaced right after */
  clearPoe() {
    const P = this.G.player;
    if (this.poeFuma) { this.poeFuma.h.end(); this.poeFuma = null; P?.setFumaOut?.(false); }
    if (this.poeStealth) this.poeReveal('clear'); else if (P?._ghost) { P._ghost = 0; P.hidden = false; ghost(P.rig, false); }
    if (this.poeStep) { this.poeStep = null; if (P) P.invuln = false; }
    this.poeMelee = null; this.poeCrit = null; this.poeCombo = 0;
    this.clearPoeArts?.();
    for (const c of this.poeClones || []) c.expire(true); this.poeClones = [];
    for (const l of this.poeLogs || []) l.pop(true); this.poeLogs = [];
    for (const m of this.poeMarks?.values() || []) m.h.end(); this.poeMarks?.clear();
    for (const c of this.poeImgAll || []) c.dispose(); this.poeImgAll = []; this.poeImgFree = []; this.poeImgRig = null;
    if (this.poeDash || this.poeFlip || this.poeBarrage || this._subT > 0) { this.poeDash = this.poeFlip = this.poeBarrage = null; this._subT = 0; if (P) P.invuln = false; }
    this.poeCrackleT = 0; if (P) P.poeSpeed = 1;
  },
};

/** Mix Poe's cast implementations into SkillRunner.prototype (skillRunner.js does this at import). */
export function installPoeSkills(proto) {
  for (const part of [M, ARTS, JUTSU, SHADOW]) for (const k in part) if (!(k in proto)) proto[k] = part[k];
  installChargedPoe(proto); // (her charged releases: combat/chargedPoe.js)
}
