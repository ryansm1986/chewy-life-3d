// Sprint (docs/ZONES.md §9): hold Shift while moving (WASD or click-to-move) for +40% speed, free. It drops while
// attacking, casting, charging or rolling, and comes back on its own while Shift is still held. Settings › Sprint:
// Hold (default) or Toggle (tap Shift to start; tap again, or stand still for a moment, to stop).
// One per Player (player.sprint). Player.update folds mul() into speedMul and hands k to the Animator (anim.sprint: the
// lean, the longer stride and the arm pump); Shadow paces himself on the hero's measured speed (companion.js); the
// start puff, the heel kicks and the whoosh live here.
import { Actions } from '../core/actions.js';
import { Events } from '../core/events.js';
import { rand } from '../core/util.js';

export const SPRINT_MUL = 1.4;
export const SPRINT_MODE = { HOLD: 0, TOGGLE: 1 };
const UP = 7, DOWN = 16; // easing rates (/s): a short ramp into the sprint, a quick drop out of it
const STILL = 0.6; // Toggle: standing still this long ends the sprint

export class Sprint {
  constructor(player) {
    this.P = player;
    this.k = 0; // 0..1, eased: how much of the sprint is applied this frame
    this.on = false; // sprinting right now (wanted, moving and not blocked)
    this.latched = false; // Toggle mode: Shift tapped on
    this.why = null; // what's holding it back (debug / QA): 'roll' | 'dash' | 'charge' | 'cast' | 'attack' | null
    this.stillT = 0; this.puffCd = 0; this.starts = 0;
  }
  get mode() { return this.P.G?.ui?.settings?.sprintMode ?? SPRINT_MODE.HOLD; }
  /** Is Shift asking for a sprint? Hold: Shift is down. Toggle: a tap latched it (taps inside menus don't count).
   *  The pad's L3 is always a click: on, and it stays on while the hero keeps moving (docs/CONTROLS.md §2); L3 + R3
   *  together swap weapons instead, so a click that turns into that chord gives its toggle back. */
  wanted() {
    const P = this.P, G = P.G, free = !P.controlLocked && !G?.ui?.anyModal?.();
    const chord = (Actions.binds('swap', 'pad')[0] || '').split('+'), inChord = chord.length > 1 && Actions.binds('sprint', 'pad').some(t => chord.includes(t));
    if (free && Actions.pressed('sprint', 'pad') && !(inChord && Actions.held('swap', 'pad'))) { this.padLatched = !this.padLatched; this.padT = 0; }
    if (inChord && Actions.pressed('swap', 'pad') && this.padT < 0.5) this.padLatched = !this.padLatched;
    if (free && Actions.held('sprint', 'touch')) return true; // (touch: the stick pushed out to its sprint ring, ui/touch.js)
    if (this.mode !== SPRINT_MODE.TOGGLE) { this.latched = false; return free && (Actions.held('sprint', 'kbm') || !!this.padLatched); }
    if (free && Actions.pressed('sprint', 'kbm')) this.latched = !this.latched;
    return free && (this.latched || !!this.padLatched);
  }
  /** why the hero can't sprint this frame (null: free to) */
  blocked() {
    const P = this.P, G = P.G;
    if (P.rollT > 0) return 'roll';
    if (P.leap || P.dash) return 'dash';
    if ((P.chargeSlow ?? 1) < 1 || G?.skills?.charge?.charging) return 'charge';
    if (G?.skills?.channel || P.canMoveWhileActing) return 'cast';
    if (P.anim.action && P.anim.busy()) return 'attack'; // (swings, casts, throws; a drink, a flinch or a flourish keep it)
    return null;
  }
  /** Once a frame from Player.update, before it walks. moving: WASD is held or a click-to-move route is live. */
  update(dt, moving) {
    this.padT = (this.padT || 0) + dt;
    const want = this.wanted();
    this.stillT = moving ? 0 : this.stillT + dt;
    if (this.latched && this.stillT > STILL) this.latched = false;
    if (this.padLatched && this.stillT > STILL) this.padLatched = false;
    this.why = want ? this.blocked() : null;
    const was = this.on;
    this.on = want && moving && !this.why;
    const tgt = this.on ? 1 : 0;
    this.k += (tgt - this.k) * (1 - Math.exp(-(tgt > this.k ? UP : DOWN) * dt));
    if (this.k < 0.002) this.k = 0;
    this.puffCd = Math.max(0, this.puffCd - dt);
    if (this.on && !was) this.start();
    return this.mul();
  }
  mul() { return 1 + (SPRINT_MUL - 1) * this.k; }
  /** the push-off: a small dust puff behind the heels and a soft whoosh (not when it only flickered off for a swing) */
  start() {
    this.starts++;
    if (this.puffCd > 0) return;
    this.puffCd = 0.9;
    const P = this.P, G = P.G, f = P.facing, x = P.pos.x - Math.sin(f) * 0.25, z = P.pos.z - Math.cos(f) * 0.25;
    if (G?.vfx?.smoke) for (let i = 0; i < 6; i++) G.vfx.smoke.spawn({ x: x + rand(-0.12, 0.12), y: P.pos.y + 0.06, z: z + rand(-0.12, 0.12), vx: -Math.sin(f) * rand(0.6, 1.4) + rand(-0.5, 0.5), vy: rand(0.25, 0.7), vz: -Math.cos(f) * rand(0.6, 1.4) + rand(-0.5, 0.5), life: rand(0.35, 0.6), size: 0.22, size1: 0.55, color: '#eadcc6', alpha: 0.5, alpha1: 0, drag: 3.5 });
    Events.emit('sfx', 'sprint_start', { vol: 0.8 });
  }
  /** a footfall while sprinting: a little kick of dust off the heel (game.js already pats the step sound) */
  step() {
    if (this.k < 0.6) return;
    const P = this.P, G = P.G, f = P.facing;
    if (Math.random() < 0.7) G?.vfx?.dust?.({ x: P.pos.x - Math.sin(f) * 0.2, y: P.pos.y, z: P.pos.z - Math.cos(f) * 0.2 }, { n: 1, size: 0.2, color: '#eadcc6' });
  }
  /** a new world, a hero switch, a knock-out: start from a walk (Toggle's latch is kept across a stairs hop) */
  reset(keepLatch = true) { this.k = 0; this.on = false; this.why = null; if (!keepLatch) { this.latched = false; this.padLatched = false; } }
}
