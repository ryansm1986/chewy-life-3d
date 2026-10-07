// Charged abilities: the hold-to-charge state machine (docs/CHARGE.md §1). One per SkillRunner (G.skills.charge).
//
//   idle ──press──▶ pressed ──held ≥ GRACE (and the skill is ready)──▶ charging ──release──▶ charged cast (stage ≥ Ⅰ)
//                     └──released first──▶ tap (the normal cast)            └──released before Ⅰ──▶ the normal cast
//   charging ──roll / a menu / a hotbar or weapon change / death──▶ cancelled (nothing cast, nothing spent)
//
// game.js feeds every hotbar press through feed(slot, id, aim, target) (skills with no charge table, the basic
// attack and Settings > Charge on hold: Off keep today's hold-to-repeat); update(dt) runs from SkillRunner.update.
// While charging: the hero plays the 'charge' wind-up pose (actors/chargePoses.js), walks at SLOW speed facing the
// cursor, hits don't interrupt; cooldowns tick; zoom is only spent on release (+25% per stage). The ring caps at the
// highest stage the hero can afford. Toggle mode: one press starts charging, the next press releases.
// Channels (Whirlwind Stance, Moonbeam): the charge is a wind-up; at Stage Ⅰ the charged channel starts and runs while held
// (launch / tickChannel / letGo).
// Events: 'charge:start' {id, slot}, 'charge:stage' {id, stage}, 'charge:release' {id, stage, ok}, 'charge:cancel' {id, reason}.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { Actions } from '../core/actions.js';
import { CHARGE, GRACE, SLOW, stageTimes, stageAt, maxStage, chargeCost, perksOf, chargeable, chargeRuntime } from '../rpg/charge.js';
import { getSkill, usable, skillRuntime } from '../rpg/skills.js';
import { chargeFx } from '../gfx/chargeFx.js';

export const CHARGE_MODE = { ON: 0, OFF: 1, TOGGLE: 2 };
const SLOTS = 6;
const _v = new THREE.Vector3(), _nv = new THREE.Vector2();
const STAGE_PITCH = [1, 1, 1.26, 1.5];

export class ChargeController {
  constructor(runner) {
    this.runner = runner; this.G = runner.G;
    this.active = null; this.press = null; this.free = null; this.last = null;
    this.prev = new Array(SLOTS).fill(false); this.fed = new Array(SLOTS).fill(false);
    this.downFn = null; this.forceHeld = null; this.aimOverride = null; this.modeOverride = null;
    this.aim = new THREE.Vector3(); this.target = null; this.clock = 0;
    this.focus = new THREE.Vector3(); this.color = new THREE.Color();
    // what the ring / hotbar draw (read by gfx/chargeFx.js and ui/chargeHud.js; never reallocated)
    this.view = { on: false, slot: -1, id: null, pos: new THREE.Vector3(), focus: this.focus, color: this.color, k: 0, stage: 0, max: 1, pips: [1, -1, -1], lit: [0, 0, 0], aff: [1, 1, 1], full: false, r: 1.25 };
    Events.on('player:roll', () => this.cancel('roll'));
  }
  /** 0 On (hold to charge) · 1 Off (hold repeats, as before) · 2 Toggle (press to start, press again to release) */
  get mode() { return this.modeOverride ?? this.G.ui?.settings?.chargeMode ?? CHARGE_MODE.ON; }
  bindKeys(fn) { this.downFn = fn; }
  down(slot) { if (this.forceHeld != null) return this.forceHeld === slot; return !!(this.downFn && this.downFn(slot)); }
  /** is this slot's press being handled as a (possible) charge? (game.js keeps feeding LMB while it is) */
  owns(slot) { return (this.press?.slot === slot) || (this.active?.slot === slot); }
  get charging() { return !!this.active; }

  // ------------------------------------------------------------------ input
  /** A hotbar key is down this frame (called every frame while held). → true if it was handled. */
  feed(slot, id, aim, target = null) {
    if (!id) return false;
    const R = this.runner, edge = !this.prev[slot], mode = this.mode;
    this.fed[slot] = true;
    if (mode === CHARGE_MODE.OFF || !chargeable(id)) {
      // no charge here: today's behaviour (cast every frame while held). Pressing it switches away from a charge.
      if (edge && this.active && this.active.slot !== slot) this.cancel('switch');
      if (edge && this.press && this.press.slot !== slot) this.tap();
      return R.tryCast(id, aim, target);
    }
    if (aim) this.aim.copy(aim);
    this.target = target || null;
    if (this.active) {
      if (this.active.slot === slot) { if (this.active.toggle && edge) this.release(); return true; }
      if (!edge) return false;
      this.cancel('switch');
    }
    if (this.press) {
      if (this.press.slot === slot) { if (this.press.toggle && edge) this.tap(); return true; }
      if (!edge) return false;
      this.tap(); // a different key: the older press is a tap
    }
    if (!edge) return false; // still holding a key whose press already ended (a roll cancelled it): press again
    // Second Draw (Crescent Chomp): the next press inside the window is a free Stage Ⅰ, no hold
    if (this.free && this.free.id === id && this.clock < this.free.until) { this.free = null; return this.cast(id, { stage: 1, free: true }); }
    this.press = { slot, id, t: 0, toggle: mode === CHARGE_MODE.TOGGLE, warned: false };
    return true;
  }
  tap() { const pr = this.press; this.press = null; if (pr) this.runner.tryCast(pr.id, this.aim, this.target); }
  cast(id, charge) { return this.runner.tryCast(id, this.aim, this.target, charge); }

  // ------------------------------------------------------------------ per frame (SkillRunner.update)
  update(dt) {
    this.clock += dt;
    const P = this.G.player;
    if (P) {
      const pr = this.press;
      if (pr) {
        pr.t += dt;
        if (!pr.toggle && !this.down(pr.slot)) this.tap();
        else if ((pr.toggle || pr.t >= GRACE) && this.canBegin(pr)) this.begin(pr);
        else if (pr.t > 6) this.press = null; // (waited on a cooldown / busy pose for ages: forget it)
      }
      if (this.active) this.tick(dt);
    }
    for (let i = 0; i < SLOTS; i++) { this.prev[i] = this.fed[i] || (this.owns(i) && this.down(i)); this.fed[i] = false; }
  }
  blocked() {
    const G = this.G, P = G.player;
    return !P || G.playerDead || P.controlLocked || G.heroSwitching || G.mode === 'interior' || G.titleActive || !!G.ui?.anyModal?.();
  }
  canBegin(pr) {
    const G = this.G, P = G.player, R = this.runner;
    if (this.blocked()) { this.press = null; return false; }
    if (P.anim.busy() || P.leap || P.dash || P.rollT > 0 || R.channel || R.hop) return false;
    if ((R.cds[pr.id] || 0) > 0) return false;
    // the right weapon (auto-swap, like tryCast) and enough zoom for the normal cast
    const def = getSkill(pr.id);
    if (def?.wep && G.derived.weaponType !== def.wep) {
      const E = G.state.equipment, alt = G.state.player.activeWeapon === 1 ? E.weapon : E.weaponAlt;
      if (alt && alt.wtype === def.wep && G.actions.swapWeapons) { G.actions.swapWeapons(); R.syncWeapon(); Events.emit('sfx', 'ui_equip'); }
      else { if (!pr.warned) { pr.warned = true; R.tryCast(pr.id, this.aim, null); } this.press = null; return false; }
    }
    const u = usable(pr.id, G.state, G.derived);
    if (!u.ok) { if (!pr.warned) { pr.warned = true; R.tryCast(pr.id, this.aim, null); } this.press = null; return false; }
    return true;
  }
  begin(pr) {
    const G = this.G, P = G.player, c = CHARGE[pr.id];
    this.press = null;
    const k = perksOf(G.state, pr.id), max = maxStage(pr.id, G.state);
    const speed = G.combat?.buffs?.moonlit?.t > 0 ? G.combat.buffs.moonlit.speed || 1.25 : 1; // (Moonlit Rally)
    const times = stageTimes(c, k, speed);
    const base = skillRuntime(pr.id, G.state, G.derived)?.cost || 0; // (level and gear can't change mid-charge: computed once)
    this.active = { id: pr.id, slot: pr.slot, toggle: pr.toggle, t: 0, stage: 0, max, times, tMax: times[max - 1], c, k, base, aff: max, pulse: 0, hum: 0, warned: false };
    this.color.set(c.color);
    this.runner.approach = null; this.runner.queued = null;
    this.pose();
    P.chargeSlow = SLOW; P.aimLock = this.aim;
    Events.emit('sfx', 'charge_start');
    Events.emit('charge:start', { id: pr.id, slot: pr.slot });
  }
  pose() {
    const P = this.G.player, a = this.active;
    if (P.anim.action?.name !== 'charge') P.anim.play('charge');
    const act = P.anim.action;
    if (act?.name === 'charge') { act.style = a.c.pose; act.k = a.tMax ? a.t / a.tMax : 0; act.pulse = a.pulse; act.full = a.stage >= a.max; }
  }
  tick(dt) {
    const G = this.G, P = G.player, a = this.active;
    if (a.chan) return this.tickChannel(dt);
    if (this.blocked()) return this.cancel('modal');
    if ((G.state.player.hotbar?.[a.slot] ?? null) !== a.id) return this.cancel('switch'); // the slot changed (weapon swap, reassign)
    const def = getSkill(a.id);
    if (def?.wep && G.derived.weaponType !== def.wep) return this.cancel('switch');
    if (P.leap || P.dash || P.rollT > 0) return this.cancel('roll');
    this.updateAim();
    if (!a.toggle && !this.down(a.slot)) return this.release();
    // what can the hero afford right now? (zoom regenerates while charging: the cap lifts)
    const zoom = G.actions.zoom ? G.actions.zoom() : 1e9;
    let aff = 0;
    for (let s = 1; s <= a.max; s++) { if (chargeCost(a.base, s, a.k) <= zoom + 1e-6) aff = s; else break; }
    a.aff = aff;
    const cap = aff >= a.max ? a.tMax : aff === 0 ? a.times[0] * 0.97 : a.times[aff - 1];
    const before = a.stage;
    a.t = Math.min(a.t + dt, Math.max(cap, Math.min(a.t, a.tMax)));
    a.stage = Math.min(stageAt(a.t, a.times, a.max), Math.max(aff, before));
    if (a.stage > before) { this.onStage(a.stage); if (a.c.channel) return this.launch(); }
    if (a.c.channel && aff === 0 && a.t >= cap - 1e-4) return this.release(); // (a channel short of Stage I's zoom still starts its normal channel)
    if (aff < a.max && a.t >= cap - 1e-4 && !a.warned) { a.warned = true; G.ui?.float?.(_v.copy(P.pos).setY(P.pos.y + 1.7), 'Not enough zoom!', { kind: 'status', color: '#9fd0ff' }); Events.emit('sfx', 'ui_error'); }
    a.pulse = Math.max(0, a.pulse - dt * 4);
    this.pose();
    // the charge's hum rises with it
    a.hum -= dt;
    if (a.hum <= 0) { a.hum = a.stage >= a.max ? 0.5 : 0.3; Events.emit('sfx', 'charge_hum', { pitch: 0.85 + 0.45 * (a.t / a.tMax) + 0.12 * a.stage, vol: a.stage >= a.max ? 0.5 : 0.8 }); }
    this.draw(dt);
  }
  onStage(s) {
    const G = this.G, P = G.player, a = this.active;
    a.pulse = 1;
    Events.emit('sfx', 'charge_stage', { pitch: STAGE_PITCH[s] || 1, stage: s });
    P.anim.hit?.('#' + this.color.getHexString());
    this.focusPoint(this.focus);
    chargeFx(G).stage(P.pos, this.focus, this.color, s);
    // a little screen-space sparkle at the hero's head
    const ui = G.ui, cam = G.engine?.camera;
    if (ui?.burst && cam) {
      _v.copy(P.pos).setY(P.pos.y + 1.5).project(cam);
      const hex = '#' + this.color.getHexString();
      ui.burst((_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, { n: 5 + 3 * s, kind: 'star', colors: [hex, '#fff6c0', '#ffffff'], spread: 34 + 14 * s, size: 0.62 + 0.12 * s, life: 0.6 });
    }
    Events.emit('charge:stage', { id: a.id, stage: s });
  }
  // ------------------------------------------------------------------ channels (Whirlwind Stance, Moonbeam)
  // The charge is a wind-up: at Stage Ⅰ the charged spin / beam starts by itself and keeps going while the key is held,
  // the later stages rev it up as it runs (bigger, stronger, +25% zoom per second per stage), and letting go leaves a
  // charged channel spinning / lingering on its own for a moment (params.spinOut / linger) before it ends.
  launch() {
    const G = this.G, P = G.player, a = this.active, R = this.runner;
    P.chargeSlow = 1; P.aimLock = null;
    if (P.anim.action?.name === 'charge') P.anim.stop('charge');
    const ok = this.cast(a.id, { stage: a.stage, t: a.t });
    this.focusPoint(this.focus);
    if (!ok || !R.channel) { this.active = null; this.view.on = false; chargeFx(G).fizzle(P.pos, this.focus, this.color); this.last = { id: a.id, stage: a.stage, t: a.t, ok: false }; return; }
    a.chan = true;
    R.channel.toggleHeld = a.toggle; // (Toggle mode: the channel runs until the next press)
    chargeFx(G).release(P.pos, this.focus, this.color, a.stage);
    Events.emit('sfx', 'charge_release', { pitch: 1.05, vol: 0.8, stage: a.stage });
    this.last = { id: a.id, stage: a.stage, t: a.t, ok: true, channel: true };
    Events.emit('charge:release', { id: a.id, stage: a.stage, ok: true, channel: true });
  }
  tickChannel(dt) {
    const G = this.G, a = this.active, ch = this.runner.channel;
    if (!ch || ch.id !== a.id || this.blocked()) { this.active = null; this.view.on = false; chargeFx(G).idle(); return; } // (it ended: no zoom, a swap, a menu)
    this.updateAim();
    if (!a.toggle && !this.down(a.slot)) return this.letGo();
    const zoom = G.actions.zoom ? G.actions.zoom() : 1e9;
    let aff = 0;
    for (let s = 1; s <= a.max; s++) { if (chargeCost(a.base, s, a.k) <= zoom + 1e-6) aff = s; else break; }
    a.aff = Math.max(aff, a.stage);
    const cap = a.aff >= a.max ? a.tMax : a.times[a.aff];
    const before = a.stage;
    a.t = Math.min(a.t + dt, Math.max(Math.min(cap, a.tMax), a.t));
    a.stage = Math.min(stageAt(a.t, a.times, a.max), a.aff);
    if (a.stage > before) {
      this.onStage(a.stage);
      const R2 = chargeRuntime(a.id, G.state, G.derived, a.stage);
      if (R2) { ch.R = R2; if (ch.beam) ch.beam.r = R2.params.radius; }
    }
    a.pulse = Math.max(0, a.pulse - dt * 4);
    a.hum -= dt;
    if (a.hum <= 0) { a.hum = 0.45; Events.emit('sfx', 'charge_hum', { pitch: 0.9 + 0.3 * (a.t / a.tMax) + 0.12 * a.stage, vol: 0.5 }); }
    this.draw(dt);
  }
  /** the key came up (or Toggle's second press) while a charged channel runs: it carries on by itself, then ends */
  letGo() {
    const a = this.active, ch = this.runner.channel;
    this.active = null; this.view.on = false;
    if (ch) { ch.toggleHeld = false; ch.spinOut = ch.R.params.spinOut ?? ch.R.params.linger ?? 0; }
    chargeFx(this.G).idle(true);
    Events.emit('charge:spinout', { id: a.id, stage: a.stage, t: ch?.spinOut || 0 });
    return true;
  }
  release() {
    const a = this.active; if (!a) return false;
    if (a.chan) return this.letGo();
    const G = this.G, P = G.player;
    this.active = null; this.restore();
    const stage = Math.min(a.stage, a.aff);
    this.focusPoint(this.focus);
    const fx = chargeFx(G);
    if (stage <= 0) { fx.idle(); this.last = { id: a.id, stage: 0, t: a.t, ok: this.runner.tryCast(a.id, this.aim, this.target) }; Events.emit('charge:release', { id: a.id, stage: 0, ok: this.last.ok }); return this.last.ok; }
    const ok = this.cast(a.id, { stage, t: a.t });
    if (ok) {
      fx.release(P.pos, this.focus, this.color, stage);
      Events.emit('sfx', 'charge_release', { pitch: 1.1 - 0.08 * stage, vol: 0.75 + 0.12 * stage, stage });
      const seconds = a.k.seconds && a.c.perks.seconds;
      if (seconds) this.free = { id: a.id, until: this.clock + (seconds.window || 2) };
    } else fx.fizzle(P.pos, this.focus, this.color);
    this.last = { id: a.id, stage, t: a.t, ok };
    Events.emit('charge:release', { id: a.id, stage, ok });
    return ok;
  }
  /** drop the charge (and any pending press). silent: no fizzle (floor change, hero switch). */
  cancel(reason = 'cancel', silent = false) {
    this.press = null;
    const a = this.active; if (!a) return false;
    this.active = null; this.restore();
    const G = this.G, fx = G.vfx ? chargeFx(G) : null;
    if (!silent && G.player && fx) { this.focusPoint(this.focus); fx.fizzle(G.player.pos, this.focus, this.color); Events.emit('sfx', 'charge_cancel'); }
    else fx?.idle();
    this.last = { id: a.id, stage: -1, t: a.t, ok: false, reason };
    Events.emit('charge:cancel', { id: a.id, reason });
    return true;
  }
  restore() {
    const P = this.G.player; this.view.on = false;
    if (!P) return;
    P.chargeSlow = 1; P.aimLock = null;
    if (P.anim.action?.name === 'charge') P.anim.stop('charge');
  }

  // ------------------------------------------------------------------ aim + looks
  updateAim() {
    if (this.aimOverride) { this.aim.copy(this.aimOverride); return; }
    if (this.fed[this.active?.slot ?? -1]) return; // game.js fed this frame's aim already
    this.cursorGround(this.aim);
  }
  /** the ground point under the mouse (the gamepad's aim point while it plays: combat/padAim.js), written into out (no
   *  allocations) → out, or null without a camera */
  cursorGround(out) {
    if (this.aimOverride) return out.copy(this.aimOverride);
    if (Actions.device !== 'kbm' && Actions.padAim) return out.copy(Actions.padAim); // (the pad's or touch's aim)
    const E = this.G.engine, W = this.G.world;
    if (!E?.raycaster || !E.camera) return null;
    E.raycaster.setFromCamera(_nv.set(Input.mouse.nx, Input.mouse.ny), E.camera);
    const ro = E.raycaster.ray.origin, rd = E.raycaster.ray.direction;
    if (Math.abs(rd.y) < 1e-4) return null;
    let h = 0;
    for (let i = 0; i < 3; i++) { const t = (h - ro.y) / rd.y; out.copy(ro).addScaledVector(rd, t); if (!W?.heightAt) break; h = W.heightAt(out.x, out.z); }
    return out;
  }
  /** where the energy gathers: Moka's staff orb, else the paw holding the sword / ball */
  focusPoint(out) {
    const P = this.G.player, R = this.runner;
    if (!P) return out;
    if (P.staff && R.staffTip) return R.staffTip(out);
    const h = P.rig?.parts?.handR;
    if (h) { h.getWorldPosition(out); if (out.distanceToSquared(P.pos) < 9) return out; }
    return out.copy(P.pos).setY(P.pos.y + 0.9);
  }
  draw(dt) {
    const a = this.active, V = this.view, P = this.G.player;
    V.on = true; V.slot = a.slot; V.id = a.id; V.k = a.tMax ? Math.min(1, a.t / a.tMax) : 0; V.stage = a.stage; V.max = a.max; V.full = a.stage >= a.max;
    for (let i = 0; i < 3; i++) {
      V.pips[i] = i < a.max ? a.times[i] / a.tMax : -1;
      V.lit[i] = a.stage > i ? 1 : 0;
      V.aff[i] = a.aff > i ? 1 : 0;
    }
    V.pos.copy(P.pos); V.orb = P.staff ? 1 : 0.55; V.style = a.c.pose;
    this.focusPoint(this.focus);
    chargeFx(this.G).charging(V, dt);
  }
}
