import { open } from './lib.mjs';
// Worst frame when the player zooms all the way out with the wheel (first time), then back in, then out again.
const s = await open('/?fresh&nointro&hour=17.6', { wait: 3500 });
await s.ev(() => { window.__mx = (n = 120) => new Promise(res => { let mx = 0, last = performance.now(), k = 0; const long = []; function f(t) { const d = t - last; if (d > 25) long.push(+d.toFixed(1)); mx = Math.max(mx, d); last = t; if (++k < n) requestAnimationFrame(f); else res({ mx: +mx.toFixed(1), long }); } requestAnimationFrame(f); }); });
await s.page.mouse.move(800, 400);
for (const [label, dy] of [['out#1', 400], ['in', -400], ['out#2', 400]]) {
  const p = s.ev(() => __mx(150));
  for (let i = 0; i < 12; i++) { await s.page.mouse.wheel(0, dy / 4); await s.sleep(40); }
  console.log(label, JSON.stringify(await p), 'dist', await s.ev(() => G.engine.rig.distTarget));
}
await s.snap('09_zoomed_out_max');
console.log(JSON.stringify(await s.stats()));
await s.close();
