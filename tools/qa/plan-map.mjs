// Plan preview (docs/VILLAGE_PLAN.md): evaluates the real island heightfield and tile layout in Node (no browser),
// then draws the town plan — terrain, streets, squares, plots by district, green belts, landmarks — to a PNG with
// tools/qa/plan-map.py.   node tools/qa/plan-map.mjs [out.png] [rank=1] [crop x0,z0,x1,z1]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Noise } from '../../src/core/util.js';
import * as Lay from '../../src/world/layout.js';
import { islandHeight } from '../../src/world/islandShape.js';
import * as Plots from '../../src/world/plots.js';
import { sizeOf } from '../../src/world/buildings/catalog.js';

const out = process.argv[2] || path.join(os.tmpdir(), 'plan-map.png');
const rank = +(process.argv[3] || 1);
const W = Lay.WORLD, R = 2, S = W * R + 1, n = new Noise(3);
const h = new Float32Array(S * S);
const t0 = Date.now();
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) h[j * S + i] = islandHeight(n, i / R, j / R);
const H = (x, z) => { const fx = Math.max(0, Math.min(S - 1.001, x * R)), fz = Math.max(0, Math.min(S - 1.001, z * R)), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; const a = h[j * S + i], b = h[j * S + i + 1], c = h[(j + 1) * S + i], d = h[(j + 1) * S + i + 1]; return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz; };
const slope = (x, z) => { const e = 0.5, hx = H(x + e, z) - H(x - e, z), hz = H(x, z + e) - H(x, z - e); return 1 - 2 * e / Math.hypot(hx, 2 * e, hz); };
const tiles = new Uint8Array(W * W), th = new Float32Array(W * W), sl = new Float32Array(W * W);
for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
  const hc = H(x + 0.5, z + 0.5), s = slope(x + 0.5, z + 0.5); th[z * W + x] = hc; sl[z * W + x] = s;
  tiles[z * W + x] = hc < 0.02 ? Lay.T.WATER : hc < 0.45 ? Lay.T.SAND : s > 0.55 ? Lay.T.ROCK : Lay.T.GRASS;
}
Lay.applyLayout({ tiles, syncTiles() {} }, rank);
const ms = Date.now() - t0;
// where big trees may not grow (layout.treeKeepOut: squares, landmarks, plots and their camera-side sweeps)
const keep = new Uint8Array(W * W);
for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) keep[z * W + x] = Lay.treeKeepOut(x + 0.5, z + 0.5) ? 1 : 0;
// plot checks (the same rules as the in-game validation, when plots.js provides it)
const report = Plots.validatePlots ? Plots.validatePlots({ tile: (x, z) => tiles[Math.floor(z) * W + Math.floor(x)], heightAt: H, slopeAt: slope }, Lay, sizeOf) : null;
const data = {
  W, ms, rank, tiles: Buffer.from(tiles).toString('base64'), keep: Buffer.from(keep).toString('base64'), h: Buffer.from(th.buffer).toString('base64'), slope: Buffer.from(sl.buffer).toString('base64'),
  streets: Lay.PATHS.map(p => ({ id: p.id, name: p.name, w: p.w, rank: p.rank, pts: p.pts })),
  squares: Lay.SQUARES, landmarks: Lay.LANDMARKS, belts: Lay.GREEN_BELTS, anchors: Lay.ANCHORS,
  plots: Plots.PLOTS, districts: Plots.DISTRICTS, report,
};
const tmp = path.join(os.tmpdir(), 'plan-map.json');
fs.writeFileSync(tmp, JSON.stringify(data));
execFileSync('python', [new URL('./plan-map.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), tmp, out, ...(process.argv[4] ? [process.argv[4]] : [])], { stdio: 'inherit' });
console.log(`heightfield + layout ${ms} ms; ${Plots.PLOTS.length} plots; saved ${out}`);
if (report) { console.log(`plot check: ${report.ok}/${report.total} ok`); for (const e of report.errors.slice(0, 40)) console.log('  ' + e); }
