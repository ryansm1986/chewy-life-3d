// Keyboard + mouse state with edge detection. Mouse events over UI elements are flagged.
// A press released before the next frame (touchpad tap, sub-frame click) still reads as held for the one frame that
// sees it: the release is latched and applied at endFrame, so down()/mouseDown() pollers never miss a tap.
export const Input = {
  keys: new Set(), pressed: new Set(), released: new Set(),
  mouse: { x: 0, y: 0, nx: 0, ny: 0, buttons: 0, overUI: false, wheel: 0 },
  mDown: new Set(), mPressed: new Set(), mReleased: new Set(),
  upLatch: new Set(), mUpLatch: new Set(), // releases of presses no frame has seen yet (applied at endFrame)
  enabled: true,
  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = normKey(e);
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k); this.upLatch.delete(k);
      if (['Tab', 'Space', 'AltLeft', 'AltRight', 'F1'].includes(e.code) || (e.code.startsWith('Digit') && !e.ctrlKey)) e.preventDefault();
    });
    addEventListener('keyup', e => { const k = normKey(e); if (this.pressed.has(k)) this.upLatch.add(k); else this.keys.delete(k); this.released.add(k); });
    addEventListener('blur', () => { this.keys.clear(); this.mDown.clear(); this.upLatch.clear(); this.mUpLatch.clear(); });
    addEventListener('mousemove', e => this._move(e));
    addEventListener('mousedown', e => {
      this._move(e);
      this.mouse.overUI = e.target !== canvas;
      if (this.mouse.overUI) return;
      this.mDown.add(e.button); this.mPressed.add(e.button); this.mUpLatch.delete(e.button);
    });
    addEventListener('mouseup', e => {
      if (!this.mDown.has(e.button)) return;
      this.mReleased.add(e.button);
      if (this.mPressed.has(e.button)) this.mUpLatch.add(e.button); else this.mDown.delete(e.button);
    });
    addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  },
  _move(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    this.mouse.nx = (e.clientX / innerWidth) * 2 - 1;
    this.mouse.ny = -(e.clientY / innerHeight) * 2 + 1;
    this.mouse.overUI = e.target !== this.canvas;
  },
  down(k) { return this.enabled && this.keys.has(k); },
  hit(k) { return this.enabled && this.pressed.has(k); },
  mouseDown(b = 0) { return this.enabled && this.mDown.has(b); },
  mouseHit(b = 0) { return this.enabled && this.mPressed.has(b); },
  consume(k) { this.pressed.delete(k); },
  consumeMouse(b) { this.mPressed.delete(b); },
  endFrame() {
    for (const k of this.upLatch) this.keys.delete(k);
    for (const b of this.mUpLatch) this.mDown.delete(b);
    this.upLatch.clear(); this.mUpLatch.clear();
    this.pressed.clear(); this.released.clear(); this.mPressed.clear(); this.mReleased.clear(); this.mouse.wheel = 0;
  },
};
function normKey(e) {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  const m = { Space: 'space', ShiftLeft: 'shift', ShiftRight: 'shift', Escape: 'escape', Tab: 'tab', AltLeft: 'alt', AltRight: 'alt', ControlLeft: 'ctrl', ControlRight: 'ctrl', Enter: 'enter', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Backquote: '`', Delete: 'delete', Backspace: 'backspace' };
  return m[e.code] || e.code.toLowerCase();
}
