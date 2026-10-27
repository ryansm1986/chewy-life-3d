// The Ramble's footbridges (ROADMAP HP-1): a gently arched timber footbridge in the chunky toy style of the red bridge
// (buildings/decor.js bridge): broad honey planks over two rounded side beams, stout posts lashed with rope at the
// ends and the middle, a sagging rope rail each side, a round paper lantern on one end post. The deck runs along local
// z (−L/2 … L/2), its top footbridgeDeckY(z) above the ends' ground.
import { Builder, G, V, PI } from '../buildings/kit.js';
import { tube } from '../../gfx/geom.js';
import { chochin } from '../buildings/props.js';

const PLANK = ['#e6ab61', '#d89a56', '#eab46c'], BEAM = '#a0643e', POST = '#8f5a3a', ROPE = '#cba96b';
const END = 0.14; // the deck's top at its ends (it laps onto the bank)
/** the deck top at local z along a bridge of length L that rises `rise` m in the middle */
export function footbridgeDeckY(z, L, rise) { const u = Math.min(1, Math.abs(z) / (L / 2)); return END + rise * (1 - u * u); }

export function footbridge(seed, { L = 10, w = 1.8, rise = 0.55 } = {}) {
  const B = new Builder(seed); B.warpAmt = 0.015; B.jitter = 0.03;
  const half = L / 2, n = Math.max(10, Math.round(L / 0.42));
  // planks across the deck, each laid on the arch
  for (let i = 0; i < n; i++) {
    const z0 = -half + i * L / n, z1 = z0 + L / n, y0 = footbridgeDeckY(z0, L, rise), y1 = footbridgeDeckY(z1, L, rise);
    const len = Math.hypot(z1 - z0, y1 - y0) - 0.03, ang = Math.atan2(y1 - y0, z1 - z0);
    const p = G.box(w, 0.08, len, 0.025); p.rotateX(-ang); p.translate(0, (y0 + y1) / 2 - 0.04, (z0 + z1) / 2);
    const c = PLANK[(i * 7 + seed) % 3];
    B.add(p, (pp, nn, o) => o.set(c).multiplyScalar(nn.y > 0.5 ? 1 : 0.8));
  }
  // two rounded side beams under the planks, following the arch
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 14; i++) { const z = -half + i * L / 14; pts.push({ p: V(sx * (w / 2 - 0.12), footbridgeDeckY(z, L, rise) - 0.15, z), r: 0.08 }); }
    B.add(tube(pts, 7, true), BEAM);
  }
  // legs into the water at the quarter points, on round stone feet
  for (const z of [-half * 0.45, half * 0.45]) for (const sx of [-1, 1]) {
    const top = footbridgeDeckY(z, L, rise) - 0.2, h = top + 1.4;
    const leg = G.cyl(0.08, 0.09, h, 8); leg.translate(sx * (w / 2 - 0.12), top - h / 2, z); B.add(leg, POST);
  }
  // posts: the four ends and the middle each side, rope wraps, round caps
  const postAt = (sx, z, tall) => {
    const y = footbridgeDeckY(z, L, rise), h = tall ? 0.95 : 0.75;
    const p = G.box(0.14, h, 0.14, 0.035); p.translate(sx * (w / 2 + 0.05), y + h / 2 - 0.12, z); B.add(p, POST);
    const cap = G.sph(0.095, 8, 6); cap.scale(1, 0.8, 1); cap.translate(sx * (w / 2 + 0.05), y + h - 0.1, z); B.add(cap, '#7a4a30');
    for (let k = 0; k < 3; k++) { const r = G.torus(0.1, 0.028, 5, 10); r.rotateX(PI / 2); r.translate(sx * (w / 2 + 0.05), y + 0.32 + k * 0.06, z); B.add(r, ROPE); }
    return V(sx * (w / 2 + 0.05), y + h - 0.2, z);
  };
  for (const sx of [-1, 1]) {
    const a = postAt(sx, -half + 0.12, true), m = postAt(sx, 0, false), b = postAt(sx, half - 0.12, true);
    // the sagging rope rail: end → middle → end
    for (const [p, q] of [[a, m], [m, b]]) {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8, P = p.clone().lerp(q, t); P.y -= Math.sin(t * PI) * 0.12; pts.push({ p: P, r: 0.03 }); }
      B.add(tube(pts, 5, false), ROPE);
    }
  }
  // a round paper lantern hung from one end post, lit at night
  B.at([w / 2 + 0.05, footbridgeDeckY(half - 0.12, L, rise) + 0.86, half - 0.12], 0, () => chochin(B, { r: 0.12, h: 0.22, color: '#fff0c8', cord: 0.06 }));
  B.light([w / 2 + 0.05, footbridgeDeckY(half, L, rise) + 0.9, half - 0.12], { color: '#ffc078', intensity: 1.6, radius: 4.5, flicker: 0.5 });
  return B.finish();
}
