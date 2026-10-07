// The action layer (docs/CONTROLS.md §1) over core/input.js: gameplay reads actions, not raw keys.
//  - Buttons: Actions.held(a, dev?) / pressed(a, dev?) / released(a, dev?) / heldTime(a, dev?) / consume(a), where dev is
//    'kbm' | 'pad', or omitted for any device. A hold-to-charge reads the same on every device.
//  - Analogue: Actions.move() = { x, y, mag } (x right, y forward: WASD / arrows as a unit vector, or the left stick
//    through its dead zone and response curve), Actions.aim() = the right stick (same frame), and Actions.padAim, the
//    gamepad's world aim point (written every frame by combat/padAim.js; null while the mouse and keyboard play).
//  - Devices: keyboard + mouse through Input (the default bindings are exactly the old raw keys), and the gamepad through
//    the Gamepad API (standard mapping), polled once a frame by poll(). The last device used is Actions.device: a switch
//    emits 'input:device' { device, style } and toggles body.pad-active (the cursor hides; ui/padGlyphs.js swaps glyphs).
//  - Bindings: ACTIONS' defaults plus the player's overrides (Settings › Controls, saved in the UI settings: setOverrides).
//  - Rumble: Actions.rumble(strong, weak, ms) on the active pad (Settings › Controls › Rumble).
//  - Touch (CT-5, docs/CONTROLS.md §12): the third device. The on-screen controls (ui/touch.js) hold actions down through
//    core/touch.js, and dev 'touch' reads them; move() and aim() take its stick and drag-to-aim. A touch makes it the
//    device (body.touch-active); the mouse events a browser sends after a tap don't count as the mouse.
import { Input } from './input.js';
import { Events } from './events.js';
import { Touch } from './touch.js';

// the standard mapping's buttons, by index
export const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'DUp', 'DDown', 'DLeft', 'DRight', 'Home'];
// the buttons a binding may use (Home belongs to the OS / Steam)
export const PAD_BINDABLE = PAD_BUTTONS.slice(0, 16);

// id → { label, group, kbm: [tokens], pad: [tokens], fixed? (shown, not rebindable), lock? ('kbm' | 'pad': that side fixed) }
// kbm tokens: Input key names ('f', 'space', 'shift', 'tab', '1'…), 'mouse0' / 'mouse1' / 'mouse2', 'ctrl+z'.
// pad tokens: PAD_BUTTONS names, 'L3+R3' (both sticks clicked), 'LS' / 'RS' (the sticks themselves: display only).
export const ACTIONS = {
  move: { label: 'Move', group: 'play', kbm: ['wasd'], pad: ['LS'], fixed: true },
  aim: { label: 'Aim', group: 'play', kbm: ['mouse'], pad: ['RS'], fixed: true },
  attack: { label: 'Attack · interact (A)', kbmLabel: 'Move · attack · talk', group: 'play', kbm: ['mouse0'], pad: ['A'], lock: 'kbm' },
  attackInPlace: { label: 'Attack in place (with LMB)', group: 'play', kbm: ['alt'], pad: [], lock: 'pad' },
  skillAlt: { label: 'Right-click skill', group: 'play', kbm: ['mouse2'], pad: ['X'], lock: 'kbm' },
  skill1: { label: 'Skill 1', group: 'play', kbm: ['1'], pad: ['Y'] },
  skill2: { label: 'Skill 2', group: 'play', kbm: ['2'], pad: ['RB'] },
  skill3: { label: 'Skill 3', group: 'play', kbm: ['3'], pad: ['RT'] },
  skill4: { label: 'Skill 4', group: 'play', kbm: ['4'], pad: ['LT'] },
  roll: { label: 'Dodge roll', group: 'play', kbm: ['space'], pad: ['B'] },
  sprint: { label: 'Sprint', group: 'play', kbm: ['shift'], pad: ['L3'] },
  interact: { label: 'Interact', group: 'play', kbm: ['f'], pad: ['DDown'] },
  potionHeart: { label: 'Heart potion', group: 'play', kbm: ['q'], pad: ['DLeft'] },
  potionZoom: { label: 'Zoom potion', group: 'play', kbm: ['e'], pad: ['DRight'] },
  potionR: { label: 'Rejuv potion', group: 'play', kbm: ['r'], pad: [] },
  meal: { label: 'Quick meal', group: 'play', kbm: ['g'], pad: ['DUp'] },
  swap: { label: 'Swap weapons', group: 'play', kbm: ['x'], pad: ['L3+R3'] },
  hero: { label: 'Next hero · hold: the hero wheel', group: 'play', kbm: ['tab'], pad: ['LB'] },
  lootLabels: { label: 'Loot labels (hold)', group: 'play', kbm: ['z'], pad: ['DDown'] },
  home: { label: 'Go home (from a dungeon)', group: 'play', kbm: ['t'], pad: [] },
  reel: { label: 'Reel in (fishing)', group: 'play', kbm: [], pad: ['RT'], lock: 'kbm', kbmLabel: 'Reel in (fishing: F or LMB)' },
  inventory: { label: 'Bag', group: 'menus', kbm: ['i'], pad: [] },
  pantry: { label: 'Pantry', group: 'menus', kbm: ['p'], pad: [] },
  character: { label: 'Character', group: 'menus', kbm: ['c'], pad: [] },
  skills: { label: 'Skills', group: 'menus', kbm: ['k'], pad: [] },
  quests: { label: 'Journal', group: 'menus', kbm: ['j'], pad: [] },
  map: { label: 'Map', group: 'menus', kbm: ['m'], pad: ['View'] },
  build: { label: 'Build (village) · decorate (indoors)', group: 'menus', kbm: ['b'], pad: [] },
  menu: { label: 'Close · game menu', group: 'menus', kbm: ['escape'], pad: ['Menu'], fixed: true },
  place: { label: 'Place · paint · pick up (build, decorate)', group: 'build', kbm: ['mouse0'], pad: ['A'], fixed: true },
  rotate: { label: 'Rotate (build, decorate)', group: 'build', kbm: ['r'], pad: ['Y', 'RB'], fixed: true },
  remove: { label: 'Remove (build) · store (decorate)', group: 'build', kbm: ['delete'], pad: ['X'], fixed: true },
  camTurn: { label: 'Turn the camera (build) · zoom (decorate)', group: 'build', kbm: ['q', 'e'], pad: ['LT', 'RT'], fixed: true },
  undo: { label: 'Undo (decorate)', group: 'build', kbm: ['ctrl+z'], pad: ['LB'], fixed: true },
};
export const ACTION_GROUPS = [['play', 'Play'], ['menus', 'Menus'], ['build', 'Build and decorate']];
// actions that may share a button with each other (D-pad down: a tap interacts, a hold shows the loot labels)
const SHARE = [['interact', 'lootLabels'], ['reel', 'skill3']];

const KEY_NAMES = { space: 'Space', shift: 'Shift', escape: 'Esc', tab: 'Tab', alt: 'Alt', ctrl: 'Ctrl', enter: 'Enter', up: '↑', down: '↓', left: '←', right: '→', '`': '`', delete: 'Del', backspace: 'Bksp', mouse0: 'LMB', mouse1: 'MMB', mouse2: 'RMB', mouse3: 'Mouse 4', mouse4: 'Mouse 5', wasd: 'WASD', mouse: 'Mouse' };
const PAD_NAMES = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', View: 'View', Menu: 'Menu', L3: 'L3', R3: 'R3', DUp: 'D-pad ▲', DDown: 'D-pad ▼', DLeft: 'D-pad ◀', DRight: 'D-pad ▶', 'L3+R3': 'L3 + R3', LS: 'Left stick', RS: 'Right stick', Home: 'Home' },
  ps: { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Create', Menu: 'Options', L3: 'L3', R3: 'R3', DUp: 'D-pad ▲', DDown: 'D-pad ▼', DLeft: 'D-pad ◀', DRight: 'D-pad ▶', 'L3+R3': 'L3 + R3', LS: 'Left stick', RS: 'Right stick', Home: 'PS' },
};
// panels (and Home) the pad reaches through the game menu: their text names the Menu button
const VIA_MENU = new Set(['inventory', 'pantry', 'character', 'skills', 'quests', 'map', 'home']);
// what text calls an action's on-screen control while touch plays (ui/touch.js); the panels are in the menu
const TOUCH_NAMES = { move: 'the stick', aim: 'a drag off a skill', attack: 'the attack button', skillAlt: 'the skill button', skill1: 'skill button 1', skill2: 'skill button 2', skill3: 'skill button 3', skill4: 'skill button 4', roll: 'the roll button', sprint: 'the stick out to its edge', interact: 'the attack button', potionHeart: 'the heart potion', potionZoom: 'the zoom potion', potionR: 'the rejuv potion', meal: 'the meal button', swap: 'the swap badge', hero: 'the hero button', menu: 'the menu button', inventory: 'the bag button', build: 'Build in the menu', pantry: 'Pantry in the bag', character: 'Character in the menu', skills: 'Skills in the menu', quests: 'Journal in the menu', map: 'the minimap', home: 'Home in the menu' };
// key names as old text writes them → actions (resolve(), ui/padGlyphs.js keyHint)
const TEXT_KEYS = { wasd: 'move', 'w a s d': 'move', click: 'attack', lmb: 'attack', 'left-click': 'attack', 'right-click': 'skillAlt', rmb: 'skillAlt', esc: 'menu', escape: 'menu' };
export const keyName = t => KEY_NAMES[t] || (t.includes('+') ? t.split('+').map(keyName).join('+') : t.length === 1 ? t.toUpperCase() : t.replace(/^key/, '').replace(/^digit/, '').replace(/^numpad/, 'Num ').toUpperCase());

// sticks: a radial dead zone, the outer edge treated as full tilt, then the response curve
const MOVE_DZ = 0.2, AIM_DZ = 0.24, OUTER = 0.94, MOVE_POW = 1.4, MOVE_MIN = 0.16;
const TRIG_ON = 0.35, TRIG_OFF = 0.22; // the triggers as buttons, with a little hysteresis
const ACT_STICK = 0.35; // a stick pushed this far counts as using the pad
const _mv = { x: 0, y: 0, mag: 0, pad: false }, _aim = { x: 0, y: 0, mag: 0 }, _zero = { x: 0, y: 0, mag: 0 };

export const Actions = {
  device: 'kbm', style: 'kbm', padStyle: 'xbox', padId: '', connected: false,
  padAim: null, // the gamepad's world aim point (combat/padAim.js), or null
  vcursor: { on: false, x: 0, y: 0, nx: 0, ny: 0, overUI: false }, // the pad's virtual cursor in build / decorate mode (ui/padCursor.js)
  tcursor: { on: false, x: 0, y: 0, nx: 0, ny: 0, overUI: false }, // touch's cursor in build / decorate mode: the last tap or drag (ui/touch.js)
  opts: { rumble: true, glyphs: 0 }, // glyphs: 0 auto · 1 Xbox · 2 PlayStation
  over: { kbm: {}, pad: {} }, // the player's overrides
  cur: new Set(), prev: new Set(), pPressed: new Set(), pReleased: new Set(), holdT: new Map(),
  axes: [0, 0, 0, 0], padIndex: -1, lastPadPress: null, _trig: [false, false], _rumbleT: 0, _mouseAcc: 0, _mouseT: 0,

  init() {
    if (this._init) return; this._init = true;
    const kbm = () => this.setDevice('kbm');
    addEventListener('keydown', e => { if (!e.repeat) kbm(); }, true);
    addEventListener('mousedown', e => { if (!Touch.fromTouch(e)) kbm(); }, true); // (not the mousedown a tap sends)
    addEventListener('wheel', kbm, { capture: true, passive: true });
    // a touch anywhere makes touch the device (the on-screen controls show); pen and mouse pointers don't
    const touch = e => { if (e.pointerType === 'touch' || e.touches) { Touch.lastT = performance.now(); this.setDevice('touch'); } };
    addEventListener('pointerdown', touch, true);
    addEventListener('touchstart', touch, { capture: true, passive: true });
    addEventListener('touchend', () => { Touch.lastT = performance.now(); }, { capture: true, passive: true });
    // a real mouse move (not a one-pixel jitter, nor the synthetic move a layout change fires) takes the mouse back
    addEventListener('mousemove', e => {
      if (this.device === 'kbm' || Touch.fromTouch(e)) return;
      const now = performance.now(); if (now - this._mouseT > 300) this._mouseAcc = 0; this._mouseT = now;
      this._mouseAcc += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      if (this._mouseAcc > 10) kbm();
    }, true);
    addEventListener('gamepadconnected', e => { this.connected = true; if (this.padIndex < 0) this.padIndex = e.gamepad.index; Events.emit('input:pad', { connected: true, id: e.gamepad.id }); });
    addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === this.padIndex) { this.padIndex = -1; this.cur.clear(); this.axes.fill(0); } Events.emit('input:pad', { connected: false, id: e.gamepad.id }); });
  },
  setDevice(dev) {
    if (dev === this.device) return;
    this.device = dev;
    this.style = dev === 'pad' ? this.padStyle : dev === 'touch' ? 'touch' : 'kbm';
    if (dev === 'kbm') this.padAim = null;
    if (dev !== 'touch') Touch.releaseAll(); // (a button or the stick held when the keyboard or pad took over)
    try { document.body.classList.toggle('pad-active', dev === 'pad'); document.body.classList.toggle('touch-active', dev === 'touch'); document.body.dataset.padStyle = this.padStyle; } catch (e) { /* no DOM */ }
    Events.emit('input:device', { device: dev, style: this.style });
  },
  setOptions(o) {
    Object.assign(this.opts, o || {});
    const st = this.opts.glyphs === 1 ? 'xbox' : this.opts.glyphs === 2 ? 'ps' : this.autoStyle || 'xbox';
    if (st !== this.padStyle) { this.padStyle = st; if (this.device === 'pad') { this.style = st; try { document.body.dataset.padStyle = st; } catch (e) { /* */ } Events.emit('input:device', { device: 'pad', style: st }); } }
  },
  setOverrides(o) { this.over = { kbm: { ...(o?.kbm || {}) }, pad: { ...(o?.pad || {}) } }; Events.emit('input:bindings', {}); },
  /** an action's tokens on a device (the override when there is one) */
  binds(a, dev) { const o = this.over[dev]?.[a]; return o || ACTIONS[a]?.[dev] || []; },
  rebindable(a, dev) { const A = ACTIONS[a]; return !!A && !A.fixed && A.lock !== dev; },
  /** bind `token` to action a on dev; another action of the same groups that had it gets a's old binding (a swap) */
  rebind(a, dev, token) {
    if (!this.rebindable(a, dev)) return null;
    const old = this.binds(a, dev), next = token ? [token] : [];
    let swapped = null;
    if (token) for (const id of Object.keys(ACTIONS)) {
      if (id === a || !this.binds(id, dev).includes(token) || ACTIONS[id].group === 'build' || ACTIONS[a].group === 'build') continue;
      if (SHARE.some(p => p.includes(a) && p.includes(id))) continue;
      if (!this.rebindable(id, dev)) return { blocked: id };
      this.over[dev][id] = old.filter(t => t !== token).slice(0, 1); swapped = id;
    }
    this.over[dev][a] = next;
    this.tidy(dev);
    Events.emit('input:bindings', { a, dev });
    return { swapped };
  },
  /** drop overrides that equal the defaults (the saved settings stay small) */
  tidy(dev) { for (const [id, t] of Object.entries(this.over[dev])) if (JSON.stringify(t) === JSON.stringify(ACTIONS[id]?.[dev] || [])) delete this.over[dev][id]; },
  resetBindings(dev) { if (dev) this.over[dev] = {}; else this.over = { kbm: {}, pad: {} }; Events.emit('input:bindings', {}); },
  /** is this Input key (normKey) bound to action a on the keyboard? (ui.js routes the panel keys through it) */
  isKey(a, k) { return this.binds(a, 'kbm').includes(k); },

  // ------------------------------------------------------------------ the gamepad
  gamepad() {
    let list; try { list = navigator.getGamepads?.() || []; } catch (e) { return null; }
    let gp = this.padIndex >= 0 ? list[this.padIndex] : null;
    if (!gp || !gp.connected) {
      gp = null; this.padIndex = -1;
      for (const g of list) if (g && g.connected && (g.mapping === 'standard' || !gp)) { gp = g; if (g.mapping === 'standard') break; }
      if (gp) { this.padIndex = gp.index; this.connected = true; }
    }
    return gp;
  },
  /** once a frame, before any gameplay reads: the pad's buttons and sticks, edges, hold times, device switches */
  poll() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this._t || now)) / 1000); this._t = now; // (real time: hold times ignore slow motion)
    const gp = this.gamepad();
    const prev = this.prev; this.prev = this.cur; this.cur = prev; this.cur.clear();
    this.pPressed.clear(); this.pReleased.clear();
    if (gp) {
      if (gp.id !== this.padId) { this.padId = gp.id; this.autoStyle = !/xbox|xinput|045e|steam/i.test(gp.id) && /054c|playstation|dualshock|dualsense|ps[345]|wireless controller/i.test(gp.id) ? 'ps' : 'xbox'; this.setOptions({}); } // (Sony's pads: vendor 054c, "Wireless Controller"; the Deck and Xbox pads: Xbox letters)
      const b = gp.buttons || [];
      for (let i = 0; i < PAD_BUTTONS.length && i < b.length; i++) {
        const btn = b[i]; if (!btn) continue;
        let on = typeof btn === 'object' ? !!btn.pressed || (btn.value || 0) > 0.5 : btn > 0.5;
        if (i === 6 || i === 7) { const v = typeof btn === 'object' ? (btn.value || (btn.pressed ? 1 : 0)) : +btn || 0; on = v > (this._trig[i - 6] ? TRIG_OFF : TRIG_ON); this._trig[i - 6] = on; } // (analogue triggers: a light squeeze is not a press)
        if (on) this.cur.add(PAD_BUTTONS[i]);
      }
      const ax = gp.axes || [];
      for (let i = 0; i < 4; i++) { const v = +ax[i] || 0; this.axes[i] = Math.abs(v) < 0.02 ? 0 : Math.max(-1, Math.min(1, v)); }
    } else this.axes.fill(0);
    if (this.cur.has('L3') && this.cur.has('R3')) this.cur.add('L3+R3');
    for (const t of this.cur) { if (!this.prev.has(t)) { this.pPressed.add(t); this.lastPadPress = t; } this.holdT.set(t, (this.holdT.get(t) || 0) + dt); }
    for (const t of this.prev) if (!this.cur.has(t)) { this.pReleased.add(t); this.holdT.delete(t); }
    const [lx, ly, rx, ry] = this.axes, lm = Math.hypot(lx, ly);
    this.lsPush = lm > 0.6 && (this._lsM || 0) <= 0.6; this._lsM = lm; // (the left stick just pushed past half tilt)
    // menu navigation (the dialogue choices; CT-2's focus): the D-pad or the left stick, with a key-repeat
    const C = this.cur;
    let nd = C.has('DUp') ? 'up' : C.has('DDown') ? 'down' : C.has('DLeft') ? 'left' : C.has('DRight') ? 'right' : null;
    if (!nd && lm > 0.55) nd = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : (ly > 0 ? 'down' : 'up');
    this.nav = null;
    if (nd !== this._nav) { this._nav = nd; this._navT = 0.38; this.nav = nd; }
    else if (nd && (this._navT -= dt) <= 0) { this._navT = 0.11; this.nav = nd; }
    if (this.pPressed.size || lm > ACT_STICK || Math.hypot(rx, ry) > ACT_STICK) this.setDevice('pad');
    Touch.poll(dt); // (the touch buttons' edges and hold times: core/touch.js)
    const tm = Touch.stick.on ? Touch.stick.mag : 0; this.tsPush = tm > 0.6 && (this._tsM || 0) <= 0.6; this._tsM = tm;
    this._rumbleT = Math.max(0, this._rumbleT - dt);
  },

  // ------------------------------------------------------------------ buttons
  held(a, dev) {
    if (!Input.enabled) return false;
    if (!dev || dev === 'kbm') for (const t of this.binds(a, 'kbm')) if (kbmHeld(t)) return true;
    if (!dev || dev === 'pad') for (const t of this.binds(a, 'pad')) if (this.cur.has(t)) return true;
    if ((!dev || dev === 'touch') && Touch.cur.has(a)) return true;
    return false;
  },
  pressed(a, dev) {
    if (!Input.enabled) return false;
    if (!dev || dev === 'kbm') for (const t of this.binds(a, 'kbm')) if (kbmHit(t)) return true;
    if (!dev || dev === 'pad') for (const t of this.binds(a, 'pad')) if (this.pPressed.has(t)) return true;
    if ((!dev || dev === 'touch') && Touch.pressed.has(a)) return true;
    return false;
  },
  released(a, dev) {
    if (!dev || dev === 'kbm') for (const t of this.binds(a, 'kbm')) if (t.startsWith('mouse') ? Input.mReleased.has(+t.slice(5)) : Input.released.has(t)) return true;
    if (!dev || dev === 'pad') for (const t of this.binds(a, 'pad')) if (this.pReleased.has(t)) return true;
    if ((!dev || dev === 'touch') && Touch.released.has(a)) return true;
    return false;
  },
  /** how long the pad (or a touch button) has held this action (s; 0 when up). The keyboard's hold times are the callers'. */
  heldTime(a) { let m = Touch.holdT.get(a) || 0; for (const t of this.binds(a, 'pad')) m = Math.max(m, this.holdT.get(t) || 0); return m; },
  /** a press already handled: nobody else this frame sees it (keys, mouse buttons, pad and touch buttons alike) */
  consume(a, dev) {
    if (!dev || dev === 'kbm') for (const t of this.binds(a, 'kbm')) { if (t.startsWith('mouse')) Input.consumeMouse(+t.slice(5)); else Input.consume(t.includes('+') ? t.split('+').pop() : t); }
    if (!dev || dev === 'pad') {
      for (const t of this.binds(a, 'pad')) this.pPressed.delete(t);
      if (a === 'interact') for (const t of this.binds('attack', 'pad')) this.pPressed.delete(t); // (on the pad A is the context interact)
    }
    if (!dev || dev === 'touch') { Touch.pressed.delete(a); if (a === 'interact') Touch.pressed.delete('attack'); } // (the attack button is the touch's context interact)
  },
  /** the pad buttons pressed this frame (raw tokens: the rebinding capture, the CT-2 focus navigation) */
  padHit(t) { return Input.enabled && this.pPressed.has(t); },
  padDown(t) { return Input.enabled && this.cur.has(t); },
  padConsume(t) { this.pPressed.delete(t); },

  // ------------------------------------------------------------------ analogue
  /** the move vector: x right, y forward (camera-relative); mag 0..1 (keys: 1); pad: true when the stick drives it */
  move() {
    const o = _mv; o.x = 0; o.y = 0; o.mag = 0; o.pad = false;
    if (!Input.enabled) return o;
    const kx = (Input.down('d') || Input.down('right') ? 1 : 0) - (Input.down('a') || Input.down('left') ? 1 : 0);
    const ky = (Input.down('w') || Input.down('up') ? 1 : 0) - (Input.down('s') || Input.down('down') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); o.x = kx / l; o.y = ky / l; o.mag = 1; return o; }
    const ts = Touch.stick; // the floating stick (ui/touch.js already applied its dead zone and response)
    if (ts.on && ts.mag > 0) { o.x = ts.x; o.y = ts.y; o.mag = ts.mag; o.pad = true; return o; }
    const x = this.axes[0], y = -this.axes[1], m = Math.hypot(x, y);
    if (m < MOVE_DZ) return o;
    const s = Math.min(1, (m - MOVE_DZ) / (OUTER - MOVE_DZ)), k = MOVE_MIN + (1 - MOVE_MIN) * Math.pow(s, MOVE_POW);
    o.x = x / m; o.y = y / m; o.mag = k; o.pad = true;
    return o;
  },
  /** the screen pointer build and decorate mode aim with: the mouse, the pad's virtual cursor or touch's ({ x, y, nx, ny, overUI }) */
  pointer() { return this.vcursor.on ? this.vcursor : this.tcursor.on ? this.tcursor : Input.mouse; },
  /** any movement input held: a move key, or the left stick past its dead zone */
  moving() { return this.move().mag > 0; },
  /** a move key pressed this frame, or the left stick just pushed past half tilt (ends a fishing session) */
  moveHit() {
    for (const k of ['w', 'a', 's', 'd', 'up', 'down', 'left', 'right']) if (Input.hit(k)) return true;
    return Input.enabled && (this.lsPush || this.tsPush);
  },
  /** the right stick: x right, y up (forward on screen); mag 0..1 past its dead zone (linear) */
  aim() {
    const ta = Touch.aim; // (a drag off a skill or the hero button: ui/touch.js)
    if (ta.on && ta.mag > 0 && Input.enabled) { _aim.x = ta.x; _aim.y = ta.y; _aim.mag = ta.mag; return _aim; }
    const x = this.axes[2], y = -this.axes[3], m = Math.hypot(x, y);
    if (!Input.enabled || m < AIM_DZ) return _zero;
    const s = Math.min(1, (m - AIM_DZ) / (OUTER - AIM_DZ));
    _aim.x = x / m; _aim.y = y / m; _aim.mag = s;
    return _aim;
  },

  // ------------------------------------------------------------------ names, rumble
  /** a binding's display name on a device ('F', 'LMB', 'A', 'D-pad ▼', '✕'…); '' when unbound */
  label(a, dev = this.device) {
    const t = this.binds(a, dev)[0]; if (!t) return '';
    return dev === 'pad' ? PAD_NAMES[this.padStyle]?.[t] || t : a === 'camTurn' ? 'Q / E' : keyName(t);
  },
  tokenName(t, dev) { return dev === 'pad' ? PAD_NAMES[this.padStyle]?.[t] || t : keyName(t); },
  /** the token a prompt shows for an action (on the pad, interact is A: the context button; 'interactAlt' is the
   *  explicit interact button) */
  promptToken(a, dev = this.device) {
    if (a === 'interactAlt') return this.binds('interact', dev)[0] || '';
    if (a === 'interact' && dev === 'pad') return this.binds('attack', 'pad')[0] || this.binds('interact', 'pad')[0] || '';
    return this.binds(a, dev)[0] || '';
  },
  /** plain text for an action's button on a device; a panel with no pad button names the Menu button (it reaches them) */
  text(a, dev = this.device) {
    if (dev === 'touch') return TOUCH_NAMES[a === 'interactAlt' ? 'interact' : a] || '';
    const t = this.promptToken(a, dev);
    if (t) return a === 'camTurn' && dev === 'kbm' ? 'Q / E' : this.tokenName(t, dev);
    if (dev === 'pad' && VIA_MENU.has(a)) return this.text('menu', 'pad');
    return '';
  },
  isBuilding: () => false, // (game.js: build or decorate mode is on, so R names Rotate rather than the Rejuv potion)
  /** the action a keyboard key's name in text stands for ('F' → interact, 'Tab' → hero, 'WASD' → move), or null */
  forKey(label) {
    const L = String(label).trim().toLowerCase(); if (!L) return null;
    if (TEXT_KEYS[L]) return TEXT_KEYS[L];
    const building = this.isBuilding();
    let best = null;
    for (const [id, A] of Object.entries(ACTIONS)) {
      if (A.fixed && id !== 'rotate') continue;
      if (!this.binds(id, 'kbm').some(t => keyName(t).toLowerCase() === L)) continue;
      if (building && A.group === 'build') return id;
      if (!best || (A.group === 'play' && ACTIONS[best].group !== 'play')) best = id;
    }
    return best === 'rotate' && !building ? null : best;
  },
  /** '{action}' tokens → key names for the active device; on the pad also "press F" / "hold Tab" phrases in old text */
  resolve(text) {
    const s = String(text ?? '').replace(/\{([a-zA-Z]+)\}/g, (m, a) => (ACTIONS[a] || a === 'interactAlt' ? this.text(a) || m : m));
    if (this.device === 'touch') { // "Press Q to…" → "Tap the heart potion to…", "Hold Tab" → "Hold the hero button"
      return s.replace(/\b([Pp]ress|[Hh]old|[Tt]ap|[Uu]se|[Cc]lick)( \*?)(WASD|Shift|Space|Tab|Esc|[A-Z0-9])(\*?)(?=[\s.,!—–)]|$)/g, (m, verb, pre, key, post) => {
        const a = this.forKey(key), t = a && TOUCH_NAMES[a];
        return t ? `${/^[Hh]/.test(verb) ? verb : verb[0] === verb[0].toUpperCase() ? 'Tap' : 'tap'}${pre}${t}${post}` : m;
      });
    }
    if (this.device !== 'pad') return s;
    return s.replace(/\b([Pp]ress|[Hh]old|[Tt]ap|[Uu]se)( \*?)(WASD|Shift|Space|Tab|Esc|[A-Z0-9])(\*?)(?=[\s.,!—–)]|$)/g, (m, verb, pre, key, post) => {
      const a = this.forKey(key), t = a && this.text(a, 'pad');
      return t ? `${verb}${pre}${t}${post}` : m;
    });
  },
  /** a light pulse on the active pad (strong / weak motor 0..1, ms); a stronger pulse overrides a weaker one */
  rumble(strong = 0.25, weak = 0.45, ms = 80) {
    if (!this.opts.rumble || this.device !== 'pad') return false; // (touch buzzes on its own events: ui/touch.js)
    const k = Math.max(strong, weak);
    if (this._rumbleT > 0 && k <= this._rumbleK) return false;
    this._rumbleT = ms / 1000; this._rumbleK = k;
    const gp = this.gamepad(), va = gp?.vibrationActuator;
    try {
      if (va?.playEffect) va.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong })?.catch?.(() => {});
      else gp?.hapticActuators?.[0]?.pulse?.(k, ms);
    } catch (e) { return false; }
    Events.emit('input:rumble', { strong, weak, ms });
    return true;
  },
};

function kbmHeld(t) {
  if (t.startsWith('mouse')) return t.length > 5 && Input.mouseDown(+t.slice(5));
  if (t.includes('+')) { const p = t.split('+'); return p.every(k => Input.down(k)); }
  return Input.down(t);
}
function kbmHit(t) {
  if (t.startsWith('mouse')) return t.length > 5 && Input.mouseHit(+t.slice(5));
  if (t.includes('+')) { const p = t.split('+'), k = p.pop(); return p.every(m => Input.down(m)) && Input.hit(k); }
  return Input.hit(t);
}

export default Actions;
