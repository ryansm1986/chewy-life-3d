// Poe's Shadow Step tree (docs/POE.md §3): Afterimage Dash, Vanish, Caltrop Flip, Bullseye Mark, Phantom Barrage (Shadow
// Step itself lives in poeSkills.js). Fragile but evasive: the dashes and blinks are untouchable, Vanish makes foes lose
// her and sets up a double crit, the marks and caltrops pay off over time. Mixed into SkillRunner by poeSkills.js.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { rand, TAU, clamp, dist } from '../core/util.js';
import '../gfx/poeFxArts.js';
import { POE_COL } from '../gfx/poeFx.js';
import { smokeCopy } from '../actors/poeProps.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3();
const sfx = (n, o) => Events.emit('sfx', n, o);
const isFoe = e => e.alive && e.team === 'enemy' && !e.breakable;

export const M = {
  // ================================================================== Afterimage Dash
  cast_afterimageDash(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const dir = _v.set(aim.x - P.pos.x, 0, aim.z - P.pos.z); if (dir.lengthSq() < 0.01) dir.copy(this.forward()); dir.normalize();
    this.poeBreakStealth();
    this.faceTo(_w.copy(P.pos).add(dir));
    this.poeDash = { dir: dir.clone(), left: p.distance, len: p.distance, speed: p.speed, hit: new Set(), R, o, start: P.pos.clone(), next: 0, images: 0, back: false };
    P.invuln = true; P.moveTarget = null;
    P.anim.play('dashRun', { speed: 0.3 / Math.max(0.12, p.distance / p.speed) });
    sfx('dash'); sfx('shadow_step', { pitch: 1.3, vol: 0.6 }); this.pfx().flipDust(P.pos);
  },
  updatePoeDash(dt) {
    const d = this.poeDash; if (!d) return;
    const G = this.G, P = G.player, p = d.R.params, fx = this.pfx();
    if (G.playerDead) { this.poeDash = null; return; }
    const step = Math.min(d.left, d.speed * dt), before = _h.copy(P.pos);
    this.slideHero(d.dir, step); d.left -= step;
    const moved = P.pos.distanceTo(before);
    // the afterimages: evenly along the path, each a frozen smoke copy of her mid-stride
    const done = d.len - d.left;
    while (d.images < p.images && done >= (d.images + 0.5) * (d.len / p.images)) { d.images++; this.poeAfterimage(P.pos, d.R, d.o); }
    if (Math.random() < 0.7) fx.pn.spawn({ frame: 8, x: P.pos.x + rand(-0.15, 0.15), y: P.pos.y + rand(0.2, 0.7), z: P.pos.z + rand(-0.15, 0.15), vx: -d.dir.x * 2, vy: 0.4, vz: -d.dir.z * 2, life: 0.3, size: 0.22, size1: 0.4, color: POE_COL.ink2, alpha: 0.5, alpha1: 0 });
    this.combat.inRadius(P.pos.x, P.pos.z, p.width, 'ally', e => { if (d.hit.has(e)) return; d.hit.add(e); this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.5, from: P.pos }); fx.flecks(_t.set(e.pos.x, e.pos.y + 0.5, e.pos.z), 3); });
    if (d.left <= 0.001 || moved < step * 0.3) {
      // Rewind (a charged dash's perk): straight back through the line, hitting everything again
      if (d.o.rewind && !d.back) { d.back = true; d.dir.negate(); d.left = d.len - d.left; d.len = d.left; d.hit.clear(); d.images = p.images; P.anim.play('dashRun', { speed: 0.3 / Math.max(0.12, d.len / d.speed) }); sfx('dash', { pitch: 1.2 }); return; }
      this.poeDash = null; P.invuln = !!G.heroSwitching;
      if (P.anim.action?.name === 'dashRun') P.anim.stop('dashRun');
      fx.flipDust(P.pos); sfx('shadow_pop', { pitch: 1.3, vol: 0.6 });
    }
  },
  /** a frozen smoke copy of her at pos that bursts into blinding smoke a moment later (Mirage: it lures foes first) */
  poeAfterimage(pos, R, o = {}) {
    const G = this.G, P = G.player, p = R.params, fx = this.pfx();
    const img = this.poeImage(); if (!img) return;
    img.mirror(); img.root.position.set(pos.x, pos.y + (P.rig.root.position.y - P.pos.y), pos.z); img.root.quaternion.copy(P.rig.root.quaternion); img.root.visible = true;
    const at = pos.clone(), wait = o.mirage ? o.mirage.t : 0.45;
    const lure = o.mirage ? { team: 'ally', alive: true, pos: at, radius: 0.3, height: 1, res: {}, kind: 'poeImage', tauntFor: m => (Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < 5 ? 99 : 0), takeDamage() {}, heal() {} } : null;
    if (lure) this.combat.add(lure);
    this.poeZone({ life: wait, update: (dt, z) => { img.tick(G.engine.time || 0); img.set(0.75 * (1 - 0.4 * clamp((z.t - wait + 0.15) / 0.15)) * (0.85 + 0.15 * Math.sin(z.t * 30))); },
      end: (z, cleared) => {
        img.root.visible = false; img.root.parent?.remove(img.root); (this.poeImgFree ||= []).push(img); // (a free copy waits outside the scene graph: no matrix walk; poeImage puts it back)
        if (lure) { lure.alive = false; this.combat.remove(lure); }
        if (cleared) return;
        fx.imageBurst(at, p.burstRadius); sfx('smoke_bomb', { pos: at, vol: 0.45, pitch: 1.3 });
        this.poeNova(at.x, at.z, p.burstRadius, e => { this.poeHit(e, { dmgPct: p.burstPct, knock: 0.3, from: at }); if (e.alive && !e.breakable) this.poeBlind(e, p.blind, 50); });
      } });
  },
  /** build one more smoke copy into the free pool (idle frames: poeSkills.updatePoe keeps four ready) */
  poeImageWarm() {
    const P = this.G.player; if (!P?.rig) return;
    if (this.poeImgRig !== P.rig) { for (const c of this.poeImgAll || []) c.dispose(); this.poeImgAll = []; this.poeImgFree = []; this.poeImgRig = P.rig; }
    if (this.poeImgAll.length >= 10) return;
    const img = smokeCopy(P.rig, { col: '#3a3058', rim: '#e8e0ff' }); img.root.visible = false; // (kept out of the scene until poeImage hands it out)
    this.poeImgAll.push(img); this.poeImgFree.push(img);
  },
  /** a pooled afterimage copy of her current rig (rebuilt when her rig changes) */
  poeImage() {
    const P = this.G.player; if (!P?.rig) return null;
    if (this.poeImgRig !== P.rig) { for (const c of this.poeImgAll || []) c.dispose(); this.poeImgAll = []; this.poeImgFree = []; this.poeImgRig = P.rig; }
    let img = this.poeImgFree.pop();
    if (!img) { if (this.poeImgAll.length >= 10) return null; img = smokeCopy(P.rig, { col: '#3a3058', rim: '#e8e0ff' }); this.G.world.scene.add(img.root); this.poeImgAll.push(img); }
    if (img.root.parent !== this.G.world.scene) this.G.world.scene.add(img.root);
    return img;
  },

  // ================================================================== Vanish
  cast_vanish(R, aim, target, o = {}) {
    const P = this.G.player, p = R.params;
    this.poeBreakStealth(true);
    sfx('poe_seal', { pitch: 0.9 });
    P.anim.play('vanishSeal', { speed: this.castRate?.() || 1, onEvent: ev => {
      if (ev !== 'vanish') return;
      const fx = this.pfx();
      fx.wisps(P.pos, 10, false); fx.puff(P.pos, { r: 0.6, n: 7, low: true });
      this.poeHide(p.duration, 'vanish', { critX: (o.triple ? 3 : p.critX), bonusPct: p.bonusPct, move: 1 + p.moveBuff / 100, smokeExit: o.smokeExit || null, aoe: o.triple ? 1.8 : 0 });
    } });
  },

  // ================================================================== Caltrop Flip
  cast_caltropFlip(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const away = _v.set(P.pos.x - aim.x, 0, P.pos.z - aim.z); if (away.lengthSq() < 0.01) away.copy(this.forward()).negate(); away.normalize();
    this.poeBreakStealth();
    this.faceTo(_w.copy(P.pos).sub(away)); // (she faces the trouble and flips backward away from it)
    const start = P.pos.clone();
    this.poeFlip = { dir: away.clone(), left: p.flip, speed: p.flip / 0.36, t: 0 };
    P.invuln = true; P.moveTarget = null;
    sfx('poe_leap', { pitch: 1.2 });
    P.anim.play('backflip', { speed: 1, onEvent: ev => {
      if (ev === 'scatter') this.poeCaltrops(R, start, o);
      else if (ev === 'land') { this.pfx().flipDust(P.pos); sfx('poe_land'); }
    } });
  },
  updatePoeFlip(dt) {
    const f = this.poeFlip; if (!f) return;
    const G = this.G, P = G.player; f.t += dt;
    if (f.t > 0.08 && f.left > 0) { const st = Math.min(f.left, f.speed * dt); this.slideHero(f.dir, st); f.left -= st; }
    if (f.t > 0.55 || G.playerDead) { this.poeFlip = null; P.invuln = !!G.heroSwitching; }
  },
  poeCaltrops(R, at, o = {}) {
    const G = this.G, p = R.params, fx = this.pfx(), n = Math.round(8 + p.radius * 2.5), from = at.clone(); from.y += 0.7;
    const spots = [], props = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rand(-0.3, 0.3), r = p.radius * Math.sqrt(rand(0.05, 1)); spots.push(this.ground(new THREE.Vector3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r))); }
    for (const s of spots) { const m = fx.prop('caltrop'); m.scale.setScalar(1.3); m.position.copy(from); m.rotation.y = rand(0, TAU); props.push({ m, from: from.clone(), to: s, t: 0, land: rand(0.18, 0.3) }); }
    fx.zoneRing(at, p.radius, p.duration, POE_COL.cream, 0.32);
    sfx('caltrop_scatter', { pos: at });
    let tick = 0.15; const tripped = new Set();
    this.poeZone({ life: p.duration, update: (dt, z) => {
      for (const c of props) { if (c.t >= c.land) continue; c.t += dt; const k = clamp(c.t / c.land); c.m.position.lerpVectors(c.from, c.to, k); c.m.position.y += Math.sin(k * Math.PI) * 0.5; c.m.rotation.x += dt * 12; if (k >= 1) c.m.rotation.x = 0; }
      if (z.t > p.duration - 0.4) for (const c of props) { const k = clamp((z.t - (p.duration - 0.4)) / 0.4); c.m.scale.setScalar(1.3 * (1 - k)); }
      tick -= dt; if (tick > 0) return;
      tick = p.tick; let any = false;
      this.poeNova(at.x, at.z, p.radius, e => {
        this.poeHit(e, { dmgPct: p.dmgPct, knock: 0, from: at, silent: false }); any = true;
        if (!e.alive || e.breakable) return;
        e.applyStatus?.('slow', p.tick + 0.25, p.slow);
        if (o.spiky && !tripped.has(e) && !e.def?.boss) { tripped.add(e); e.status.stun = Math.max(e.status.stun || 0, o.spiky.stun); e.cancelAttack?.(); this.fx?.().dizzy?.(e, o.spiky.stun); }
      });
      if (any && Math.random() < 0.6) sfx('caltrop_ow', { pos: at, vol: 0.5, pitch: rand(0.9, 1.3) });
    }, end: () => { for (const c of props) fx.give('caltrop', c.m); } });
  },

  // ================================================================== Bullseye Mark
  cast_bullseyeMark(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const foe = this.pickFoe(aim, target, p.range);
    if (!foe) { G.actions.restoreZoom?.(R.cost); this.cds.bullseyeMark = 0; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), 'Nothing to aim at!', { kind: 'status', color: '#ff9a8a' }); sfx('ui_error'); return; }
    const list = [foe];
    for (let i = 1; i < (o.marks || 1); i++) { const n = this.combat.nearest(foe.pos, 'ally', 7, e => !e.breakable && !list.includes(e)); if (n) list.push(n); }
    this.faceTo(foe.pos);
    P.anim.play('brushFlick', { speed: 1.1, onEvent: ev => {
      if (ev !== 'flick') return;
      const hand = this.poeHand(_h).clone();
      for (const e of list) if (e.alive) { this.pfx().paintFlick(hand, _w.set(e.pos.x, e.pos.y + (e.height || 1) * 0.6, e.pos.z)); this.poeMark(e, R, o, 0); }
      sfx('brush_flick');
    } });
  },
  /** paint a mark on e (stacks: where it starts — Spreading Paint starts the next one at 3) */
  poeMark(e, R, o, stacks = 0) {
    const marks = (this.poeMarks ||= new Map());
    const old = marks.get(e); if (old) { old.t = R.params.duration; return old; }
    const m = { e, R, o, t: R.params.duration, stacks, h: this.pfx().bullseye(e) };
    m.h.set(stacks); marks.set(e, m);
    G_emote(this.G, e);
    return m;
  },
  /** a hit of hers on a marked foe: +vuln% damage, and a stack (→ poeHit) */
  poeMarkHit(e, o) {
    const m = this.poeMarks?.get(e); if (!m || o.noMark) return 1;
    m.stacks = Math.min(m.R.params.maxStacks, m.stacks + 1); m.h.set(m.stacks);
    if (m.stacks >= m.R.params.maxStacks) this.after(0, () => this.poeMarkBurst(m));
    return 1 + m.R.params.vuln / 100;
  },
  poeMarkBurst(m) {
    if (!this.poeMarks?.has(m.e)) return;
    this.poeMarks.delete(m.e); m.h.end();
    const G = this.G, p = m.R.params, e = m.e, fx = this.pfx();
    if (!m.stacks) return;
    const at = this.ground(e.pos.clone()), big = m.o.jackpot && m.stacks >= p.maxStacks, pct = p.stackPct * m.stacks * (big ? m.o.jackpot.k : 1);
    fx.paintBurst(at, p.burstRadius, big); sfx('paint_burst', { pos: at, pitch: big ? 0.85 : 1 }); G.engine.rig.shake(big ? 0.4 : 0.22);
    this.poeNova(at.x, at.z, p.burstRadius, x => this.poeHit(x, { dmgPct: pct, knock: 0.7, from: at, noMark: true }));
    // Spreading Paint (perk): the nearest unmarked foe gets a fresh mark at 3 stacks
    if (m.o.spread) { const n = this.combat.nearest(at, 'ally', 6, x => !x.breakable && x !== e && !this.poeMarks.has(x)); if (n) { fx.paintFlick(_h.set(at.x, at.y + 0.6, at.z), _w.set(n.pos.x, n.pos.y + 0.6, n.pos.z)); this.poeMark(n, m.R, { ...m.o, spread: null }, m.o.spread.stacks); } }
  },
  updatePoeMarks(dt) {
    const M2 = this.poeMarks; if (!M2?.size) return;
    for (const m of [...M2.values()]) { m.t -= dt; if (!m.e.alive) { M2.delete(m.e); m.h.end(); continue; } if (m.t <= 0) this.poeMarkBurst(m); }
  },

  // ================================================================== Phantom Barrage
  cast_phantomBarrage(R, aim, target, o = {}) {
    const G = this.G, P = G.player, p = R.params;
    const list = [...this.combat.entities].filter(e => isFoe(e) && dist(e.pos.x, e.pos.z, P.pos.x, P.pos.z) < p.range + (e.radius || 0.3)).sort((a, b) => dist(a.pos.x, a.pos.z, aim.x, aim.z) - dist(b.pos.x, b.pos.z, aim.x, aim.z)).slice(0, p.targets);
    if (!list.length) { G.actions.restoreZoom?.(R.cost); this.cds.phantomBarrage = 0; G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.7), 'Nobody to sneak up on!', { kind: 'status', color: '#c8bce8' }); sfx('ui_error'); return; }
    this.poeBreakStealth();
    P.invuln = true; P.moveTarget = null;
    this.poeBarrage = { list, i: 0, t: 0.12, R, o, start: P.pos.clone(), prev: P.pos.clone(), hit: [] };
    this.pfx().puddle(P.pos, { r: 0.85, life: 0.9 }); this.pfx().wisps(P.pos, 8);
    sfx('shadow_step');
    P.anim.play('shadowStepOut', { speed: 1.6 });
  },
  updatePoeBarrage(dt) {
    const B = this.poeBarrage; if (!B) return;
    const G = this.G, P = G.player, p = B.R.params, fx = this.pfx();
    if (G.playerDead) { this.poeBarrage = null; return; }
    B.t -= dt; if (B.t > 0) return;
    B.t = p.interval;
    while (B.i < B.list.length && !B.list[B.i].alive) B.i++;
    if (B.i < B.list.length) {
      const e = B.list[B.i++], spot = this.poeBehind(e);
      fx.streak(B.prev, spot); fx.puddle(spot, { r: 0.7, life: 0.5 });
      P.setPos(spot.x, spot.z); P.pos.y = G.world.heightAt(spot.x, spot.z); this.faceTo(e.pos); P.sync?.();
      B.prev.copy(P.pos);
      P.anim.play('shadowStrike', { speed: 2.4 });
      G.vfx.slash(P.pos, P.facing, { arc: 2.4, r: 1.4, width: 0.75, color: '#fff8ec', life: 0.16, tilt: -0.5, glow: false });
      sfx('shadow_pop', { pitch: 1 + B.i * 0.05, vol: 0.6 }); sfx('fuma_slash', { pitch: 1.1, vol: 0.6 });
      this.poeHit(e, { dmgPct: p.dmgPct, knock: 0.3, from: P.pos, critAdd: p.critBonus });
      if (!e.breakable) fx.flecks(_t.set(e.pos.x, e.pos.y + 0.6, e.pos.z), 4);
      B.hit.push(e);
      return;
    }
    // done: back where she started, and (perfectly stealthy as ever) a sneeze
    fx.streak(B.prev, B.start); fx.puddle(B.start, { r: 0.8, life: 0.7 });
    P.setPos(B.start.x, B.start.z); P.pos.y = G.world.heightAt(B.start.x, B.start.z); P.sync?.();
    this.poeBarrage = null; P.invuln = !!G.heroSwitching;
    sfx('shadow_pop');
    // Grand Finale (Stage Ⅲ capstone): every foe she struck takes one last cut at once
    if (B.o.finale) {
      G.vfx.slash(P.pos, P.facing, { arc: 6.2, r: 2.2, width: 1, color: '#e8e0ff', life: 0.3, glow: false }); G.engine.rig.shake(0.4); sfx('swing_heavy');
      for (const e of B.hit) if (e.alive) { fx.streak(P.pos, e.pos); this.poeHit(e, { dmgPct: p.dmgPct * B.o.finale.pct / 100, knock: 0.6, from: P.pos }); }
    }
    if (!B.o.finale) this.after(0.25, () => this.poeSneeze());
  },
};
function G_emote(G, e) { if (!e.breakable) G.vfx.emote?.(e, '!', 0.7); }
