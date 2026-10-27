// The outskirts plan's check (ROADMAP HP-1, world/outskirtsPlan.js), in Node against the real island heightfield: the
// Ramble stays on walkable land (not water, not cliffs, not the lots), each footbridge spans water with dry ends, each
// place's clearing is dry and the trail passes beside it (not through its middle).   node tools/qa/outskirts-check.mjs
import { Noise } from '../../src/core/util.js';
import * as Lay from '../../src/world/layout.js';
import { islandHeight } from '../../src/world/islandShape.js';
import { PLOTS } from '../../src/world/plots.js';
import { RAMBLE, FOOTBRIDGES, POIS, distToRamble } from '../../src/world/outskirtsPlan.js';
const n = new Noise(3), H = (x, z) => islandHeight(n, x, z);
const slope = (x, z) => { const e = 0.5, hx = H(x + e, z) - H(x - e, z), hz = H(x, z + e) - H(x, z - e); return 1 - 2 * e / Math.hypot(hx, 2 * e, hz); };
const onPlot = (x, z) => PLOTS.some(p => x > p.x - 0.5 && x < p.x + p.w + 0.5 && z > p.z - 0.5 && z < p.z + p.d + 0.5);
const bad = [];
for (const R of RAMBLE) for (let i = 0; i < R.pts.length - 1; i++) {
  const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
  for (let u = 0; u <= L; u += 0.5) {
    const x = ax + (bx - ax) * u / L, z = az + (bz - az) * u / L, h = H(x, z), s = slope(x, z);
    const endOfBridge = FOOTBRIDGES.some(F => Math.hypot(x - F.a[0], z - F.a[1]) < 2 || Math.hypot(x - F.b[0], z - F.b[1]) < 2);
    if ((h < 0.12 && !endOfBridge) || s > 0.3 || onPlot(x, z)) bad.push(`${R.id}[${i}] (${x.toFixed(1)}, ${z.toFixed(1)}) h ${h.toFixed(2)} slope ${s.toFixed(2)}${onPlot(x, z) ? ' ON A PLOT' : ''}`);
  }
}
for (const F of FOOTBRIDGES) {
  const ha = H(...F.a), hb = H(...F.b), L = Math.hypot(F.b[0] - F.a[0], F.b[1] - F.a[1]);
  let wet = 0; for (let u = 0; u <= 1; u += 0.05) if (H(F.a[0] + (F.b[0] - F.a[0]) * u, F.a[1] + (F.b[1] - F.a[1]) * u) < 0) wet++;
  console.log(`${F.id}: ends h ${ha.toFixed(2)} / ${hb.toFixed(2)}, ${L.toFixed(1)} m, ${wet}/21 samples over water`);
  if (ha < 0.2 || hb < 0.2 || wet < 4) bad.push(`${F.id} ends ${ha.toFixed(2)} ${hb.toFixed(2)} wet ${wet}`);
}
const SHORE = new Set(['lighthouse', 'tidepools', 'pier', 'seaarch', 'cove']); // (half on the sand or over the water)
for (const p of POIS) {
  let dry = 0, tot = 0, hmin = 9, hmax = -9;
  for (let a = 0; a < 24; a++) for (const k of [0.3, 0.6, 0.9]) { const x = p.x + Math.cos(a / 24 * 6.283) * p.r * k, z = p.z + Math.sin(a / 24 * 6.283) * p.r * k, h = H(x, z); tot++; if (h > (SHORE.has(p.id) ? 0.05 : 0.3)) { dry++; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); } }
  const dt = distToRamble(p.x, p.z), st = Lay.distToPaths(p.x, p.z);
  console.log(`${p.id.padEnd(11)} centre h ${H(p.x, p.z).toFixed(2)}, dry ${Math.round(dry / tot * 100)}% (h ${hmin.toFixed(1)}–${hmax.toFixed(1)}), trail ${dt.toFixed(1)} m, street ${st.toFixed(1)} m${onPlot(p.x, p.z) ? ' ON A PLOT' : ''}`);
  if (dry / tot < (SHORE.has(p.id) ? 0.45 : 0.95)) bad.push(`${p.id}: only ${Math.round(dry / tot * 100)}% of its clearing is dry`);
  if (dt > p.r + 3 || dt < p.r * 0.45) bad.push(`${p.id}: the trail is ${dt.toFixed(1)} m from its centre (want ${(p.r * 0.45).toFixed(1)}–${p.r + 3})`);
}
console.log(bad.length ? `${bad.length} problems:\n  ` + bad.slice(0, 60).join('\n  ') : 'all clear');
process.exit(bad.length ? 1 : 0);
