// Couch co-op's pads (docs/COOP.md §3): one PadReader per extra controller (players 2-4), polled once a frame like
// core/actions.js polls player 1's. A PadView answers the same questions Actions does (held / pressed / released /
// heldTime / consume, move / aim, the raw tokens, the menu nav, rumble) for that pad alone; coop.js swaps it in as
// Actions.view while that player's hero runs, so every system that reads Actions reads the right controller.
import { Actions, PAD_BUTTONS, STICK } from '../core/actions.js';

const { MOVE_DZ, AIM_DZ, OUTER, MOVE_POW, MOVE_MIN, TRIG_ON, TRIG_OFF } = STICK;

export function listPads() { try { return [...(navigator.getGamepads?.() || [])].filter(g => g && g.connected); } catch (e) { return []; } }
export function padAt(index) { try { const g = navigator.getGamepads?.()?.[index]; return g && g.connected ? g : null; } catch (e) { return null; } }

export class PadReader {
  constructor(index) {
    this.index = index; this.id = '';
    this.cur = new Set(); this.prev = new Set(); this.pPressed = new Set(); this.pReleased = new Set(); this.holdT = new Map();
    this.axes = [0, 0, 0, 0]; this._trig = [false, false];
    this.nav = null; this.dnav = null; this._nav = null; this._navT = 0; this._dnav = null; this._dnavT = 0;
    this.lsPush = false; this._lsM = 0; this.connected = false; this.lostT = 0; this.idleT = 0;
    this._rumbleT = 0; this._rumbleK = 0;
    this.view = new PadView(this);
  }
  get gp() { return padAt(this.index); }
  poll(dt) {
    const gp = this.gp;
    const prev = this.prev; this.prev = this.cur; this.cur = prev; this.cur.clear();
    this.pPressed.clear(); this.pReleased.clear();
    this.connected = !!gp;
    if (gp) {
      this.id = gp.id; this.lostT = 0;
      const b = gp.buttons || [];
      for (let i = 0; i < PAD_BUTTONS.length && i < b.length; i++) {
        const btn = b[i]; if (!btn) continue;
        let on = typeof btn === 'object' ? !!btn.pressed || (btn.value || 0) > 0.5 : btn > 0.5;
        if (i === 6 || i === 7) { const v = typeof btn === 'object' ? (btn.value || (btn.pressed ? 1 : 0)) : +btn || 0; on = v > (this._trig[i - 6] ? TRIG_OFF : TRIG_ON); this._trig[i - 6] = on; }
        if (on) this.cur.add(PAD_BUTTONS[i]);
      }
      const ax = gp.axes || [];
      for (let i = 0; i < 4; i++) { const v = +ax[i] || 0; this.axes[i] = Math.abs(v) < 0.02 ? 0 : Math.max(-1, Math.min(1, v)); }
    } else { this.axes.fill(0); this.lostT += dt; }
    if (this.cur.has('L3') && this.cur.has('R3')) this.cur.add('L3+R3');
    for (const t of this.cur) { if (!this.prev.has(t)) this.pPressed.add(t); this.holdT.set(t, (this.holdT.get(t) || 0) + dt); }
    for (const t of this.prev) if (!this.cur.has(t)) { this.pReleased.add(t); this.holdT.delete(t); }
    const [lx, ly, rx, ry] = this.axes, lm = Math.hypot(lx, ly);
    this.lsPush = lm > 0.6 && this._lsM <= 0.6; this._lsM = lm;
    const C = this.cur;
    let nd = C.has('DUp') ? 'up' : C.has('DDown') ? 'down' : C.has('DLeft') ? 'left' : C.has('DRight') ? 'right' : null;
    if (!nd && lm > 0.55) nd = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
    this.nav = null;
    if (nd !== this._nav) { this._nav = nd; this._navT = 0.38; this.nav = nd; }
    else if (nd && (this._navT -= dt) <= 0) { this._navT = 0.11; this.nav = nd; }
    const dd = C.has('DUp') ? 'up' : C.has('DDown') ? 'down' : C.has('DLeft') ? 'left' : C.has('DRight') ? 'right' : null;
    this.dnav = null;
    if (dd !== this._dnav) { this._dnav = dd; this._dnavT = 0.38; this.dnav = dd; }
    else if (dd && (this._dnavT -= dt) <= 0) { this._dnavT = 0.11; this.dnav = dd; }
    const busy = this.cur.size || lm > 0.35 || Math.hypot(rx, ry) > 0.35;
    this.idleT = busy ? 0 : this.idleT + dt;
    this._rumbleT = Math.max(0, this._rumbleT - dt);
  }
  /** any button pressed this frame (the join prompt) */
  anyPressed() { return this.pPressed.size > 0; }
  clear() { this.cur.clear(); this.prev.clear(); this.pPressed.clear(); this.pReleased.clear(); this.holdT.clear(); this.axes.fill(0); this.nav = this.dnav = null; }
}

const _mv = { x: 0, y: 0, mag: 0, pad: true }, _aim = { x: 0, y: 0, mag: 0 }, _zero = { x: 0, y: 0, mag: 0 };

/** Actions' questions, answered for one pad (dev 'kbm' / 'touch' never hold anything here) */
export class PadView {
  constructor(r) { this.r = r; this.device = 'pad'; this.locked = false; }
  get nav() { return this.locked ? null : this.r.nav; }
  get dnav() { return this.locked ? null : this.r.dnav; }
  toks(a) { return Actions.binds(a, 'pad'); }
  held(a, dev) { if (this.locked || (dev && dev !== 'pad')) return false; for (const t of this.toks(a)) if (this.r.cur.has(t)) return true; return false; }
  pressed(a, dev) { if (this.locked || (dev && dev !== 'pad')) return false; for (const t of this.toks(a)) if (this.r.pPressed.has(t)) return true; return false; }
  released(a, dev) { if (dev && dev !== 'pad') return false; for (const t of this.toks(a)) if (this.r.pReleased.has(t)) return true; return false; }
  heldTime(a) { let m = 0; for (const t of this.toks(a)) m = Math.max(m, this.r.holdT.get(t) || 0); return m; }
  consume(a, dev) {
    if (dev && dev !== 'pad') return;
    for (const t of this.toks(a)) this.r.pPressed.delete(t);
    if (a === 'interact') for (const t of this.toks('attack')) this.r.pPressed.delete(t); // (on the pad A is the context interact)
  }
  padHit(t) { return !this.locked && this.r.pPressed.has(t); }
  padDown(t) { return !this.locked && this.r.cur.has(t); }
  padConsume(t) { this.r.pPressed.delete(t); }
  move() {
    const o = _mv; o.x = 0; o.y = 0; o.mag = 0; o.pad = true;
    if (this.locked) return o;
    const x = this.r.axes[0], y = -this.r.axes[1], m = Math.hypot(x, y);
    if (m < MOVE_DZ) return o;
    const s = Math.min(1, (m - MOVE_DZ) / (OUTER - MOVE_DZ)), k = MOVE_MIN + (1 - MOVE_MIN) * Math.pow(s, MOVE_POW);
    o.x = x / m; o.y = y / m; o.mag = k;
    return o;
  }
  moving() { return this.move().mag > 0; }
  moveHit() { return !this.locked && this.r.lsPush; }
  aim() {
    if (this.locked) return _zero;
    const x = this.r.axes[2], y = -this.r.axes[3], m = Math.hypot(x, y);
    if (m < AIM_DZ) return _zero;
    const s = Math.min(1, (m - AIM_DZ) / (OUTER - AIM_DZ));
    _aim.x = x / m; _aim.y = y / m; _aim.mag = s;
    return _aim;
  }
  rumble(strong = 0.25, weak = 0.45, ms = 80) {
    const r = this.r; if (!Actions.opts.rumble) return false;
    const k = Math.max(strong, weak);
    if (r._rumbleT > 0 && k <= r._rumbleK) return false;
    r._rumbleT = ms / 1000; r._rumbleK = k;
    const gp = r.gp, va = gp?.vibrationActuator;
    try {
      if (va?.playEffect) va.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong })?.catch?.(() => {});
      else gp?.hapticActuators?.[0]?.pulse?.(k, ms);
    } catch (e) { return false; }
    return true;
  }
}
