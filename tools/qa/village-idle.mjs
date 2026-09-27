// Village idle frame-time check: boot, let it settle, record long frames for N seconds (default 45) while the sim grows.
import { open } from '../review2/lib.mjs';
const secs = +(process.argv[2] || 45);
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
const r = await s.ev(async secs => {
  const f = []; let last = performance.now(); const t0 = last;
  await new Promise(res => { (function tick() { const n = performance.now(); f.push(n - last); last = n; if (n - t0 < secs * 1000) requestAnimationFrame(tick); else res(); })(); });
  f.sort((a, b) => b - a);
  return { frames: f.length, over16: f.filter(x => x > 16.7).length, over33: f.filter(x => x > 33).length, worst: f.slice(0, 5).map(x => +x.toFixed(1)), buildings: window.G.sim.S.buildings.length };
}, secs);
console.log(JSON.stringify(r));
await s.close();
