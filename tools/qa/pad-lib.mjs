// A virtual gamepad for the QA (docs/CONTROLS.md): stubs navigator.getGamepads with one standard-mapping pad the test
// drives from Node. The game polls it once a frame (core/actions.js poll), so every press waits for a poll to see it.
//   await installPad(page, { id })   → the stub (window.__pad; vibration calls land in window.__pad.rumbles)
//   await padDown(page, 'A') / padUp(page, 'A') / padTap(page, 'B', ms) / padHold(page, 'Y', ms)
//   await padAxes(page, [lx, ly, rx, ry]) / padStick(page, 'left' | 'right', x, y)   (y: −1 = up, as the Gamepad API)
//   await padReset(page)
export const PAD_INDEX = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9, L3: 10, R3: 11, DUp: 12, DDown: 13, DLeft: 14, DRight: 15, Home: 16 };

export async function installPad(page, { id = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' } = {}) {
  await page.evaluate(([id]) => {
    const btn = () => ({ pressed: false, touched: false, value: 0 });
    const pad = window.__pad = { id, index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn), rumbles: [] };
    pad.vibrationActuator = { type: 'dual-rumble', playEffect(type, o) { pad.rumbles.push({ type, ...o, t: performance.now() | 0 }); return Promise.resolve('complete'); } };
    navigator.getGamepads = () => [pad, null, null, null];
  }, [id]);
}
// wait until the game's poll has seen the pad's current state for this button (held or not)
const seen = (page, name, down) => page.waitForFunction(([n, d]) => !!window.G?.controls?.cur?.has(n) === d, [name, down], { timeout: 5000, polling: 'raf' });
export async function padDown(page, name) {
  await page.evaluate(([i]) => { const b = window.__pad.buttons[i]; b.pressed = true; b.touched = true; b.value = 1; window.__pad.timestamp = performance.now(); }, [PAD_INDEX[name]]);
  await seen(page, name, true);
}
export async function padUp(page, name) {
  await page.evaluate(([i]) => { const b = window.__pad.buttons[i]; b.pressed = false; b.touched = false; b.value = 0; window.__pad.timestamp = performance.now(); }, [PAD_INDEX[name]]);
  await seen(page, name, false);
}
export async function padTap(page, name, ms = 50) { await padDown(page, name); if (ms) await page.waitForTimeout(ms); await padUp(page, name); }
export async function padHold(page, name, ms) { await padDown(page, name); await page.waitForTimeout(ms); await padUp(page, name); }
export async function padAxes(page, ax) {
  await page.evaluate(([a]) => { for (let i = 0; i < 4; i++) if (a[i] != null) window.__pad.axes[i] = a[i]; window.__pad.timestamp = performance.now(); }, [ax]);
  await page.waitForFunction(([a]) => a.every((v, i) => v == null || Math.abs((window.G.controls.axes[i] || 0) - (Math.abs(v) < 0.02 ? 0 : v)) < 1e-6), [ax], { timeout: 5000, polling: 'raf' });
}
export const padStick = (page, side, x, y) => padAxes(page, side === 'left' ? [x, y, null, null] : [null, null, x, y]);
export async function padReset(page) {
  await page.evaluate(() => { const p = window.__pad; for (const b of p.buttons) { b.pressed = false; b.touched = false; b.value = 0; } p.axes.fill(0); });
  await page.waitForFunction(() => window.G.controls.cur.size === 0 && window.G.controls.axes.every(v => v === 0), null, { timeout: 5000, polling: 'raf' });
}
