// The touch device (docs/CONTROLS.md §6 and §12, ROADMAP CT-5): the action layer's third device, beside the keyboard and
// mouse (core/input.js) and the gamepad. It holds what the on-screen controls (ui/touch.js) are doing, in the action
// layer's own terms, and core/actions.js reads it:
//  - buttons: the actions the touch buttons hold down (`down`), with edges worked out once a frame by poll() (`pressed`,
//    `released`) and hold times, exactly like the pad's buttons. pulse(a) holds an action for one frame only (a tap
//    decided on release: drag-to-aim's cast, the belt, the prompt).
//  - analogue: `stick` (the floating stick: x right, y up, mag 0..1, sprint at the edge) and `aim` (a drag off a skill
//    button or the hero button: x right, y up, mag 0..1).
//  - taps on the world (`taps`: screen points, consumed by game.js: target a foe, talk, walk there).
//  - lastT: the last touch, so the compatibility mouse events a browser sends after a tap don't count as the mouse.
// Nothing here touches the DOM.
export const Touch = {
  down: new Set(), // actions held by the touch buttons right now
  cur: new Set(), prev: new Set(), pressed: new Set(), released: new Set(), holdT: new Map(),
  _pulse: new Set(), // held for exactly one poll
  stick: { on: false, x: 0, y: 0, mag: 0, sprint: false },
  aim: { on: false, x: 0, y: 0, mag: 0 },
  taps: [],
  lastT: -1e9,
  opts: { haptics: true },

  hold(a) { this.down.add(a); },
  release(a) { this.down.delete(a); },
  /** a press that lasts one frame (pressed and held this frame, released the next) */
  pulse(a) { this._pulse.add(a); },
  releaseAll() { this.down.clear(); this._pulse.clear(); this.stick.on = false; this.stick.mag = 0; this.stick.sprint = false; this.aim.on = false; this.aim.mag = 0; },
  /** once a frame from Actions.poll: edges and hold times (real time) */
  poll(dt) {
    const prev = this.prev; this.prev = this.cur; this.cur = prev; this.cur.clear();
    this.pressed.clear(); this.released.clear();
    for (const a of this.down) this.cur.add(a);
    for (const a of this._pulse) this.cur.add(a);
    this._pulse.clear();
    for (const a of this.cur) { if (!this.prev.has(a)) this.pressed.add(a); this.holdT.set(a, (this.holdT.get(a) || 0) + dt); }
    for (const a of this.prev) if (!this.cur.has(a)) { this.released.add(a); this.holdT.delete(a); }
  },
  /** the world taps since the last call (game.js handleInput) */
  takeTaps() { if (!this.taps.length) return null; const t = this.taps; this.taps = []; return t; },
  /** a short buzz on phones that have one (Settings › Controls › Touch › Haptics; iOS Safari has none) */
  buzz(ms = 8) {
    if (!this.opts.haptics) return false;
    try { return !!navigator.vibrate?.(Math.max(1, Math.round(ms))); } catch (e) { return false; }
  },
  /** was this mouse event sent by the browser for a touch (a tap's compatibility mousedown / mousemove / click)? */
  fromTouch(e) { return !!e?.sourceCapabilities?.firesTouchEvents || performance.now() - this.lastT < 600; },
};

export default Touch;
