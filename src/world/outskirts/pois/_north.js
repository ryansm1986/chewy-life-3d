// Shared pieces for the northern shelf's places (ROADMAP HP-1, group "north": windmill.js, moonpond.js, pier.js), in
// the chunky toy style of fallsGarden.js and the red bridge: candy-smooth mossy boulders, ferns, cattails, pink toy
// flowers, lily pads with a lotus, rope-wrapped round posts, wooden lantern posts with round paper lanterns, rounded
// post-and-rail fences, woven baskets. Every helper builds into a kit Builder (buildings/kit.js) in its local frame.
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { mossLine, nz, leafGeo, blossomGeo, chochin } from '../../buildings/props.js';
import { puff, tube, paint, mergeVertices } from '../../../gfx/geom.js';
import { TAU, clamp } from '../../../core/util.js';
import { distToRamble } from '../../outskirtsPlan.js';

export const WOOD = '#c98f5e', WOOD_D = '#8f6a52', WOOD_DD = '#6e4a36', ROPE = '#d8b878', PLANKS = ['#d99c5c', '#c88b4e', '#e3ac6a'];
const STONE = ['#8f8796', '#d2cad2'], MOSS = '#6aa236', MOSS_HI = '#abd252', MOSS_EDGE = '#467a2c';

/** building one kit at the place's centre in world coordinates: local = world − (X, Y, Z); gy(x, z) the ground there */
export function frame(ctx) {
  const X = ctx.poi.x, Z = ctx.poi.z, Y = ctx.H(X, Z);
  return { X, Z, Y, gy: (x, z) => ctx.H(X + x, Z + z) - Y };
}
/** is a solid of radius r at world (x, z) clear of the Ramble (1.3 m from its centre line)? (warns when not) */
export function trailClear(x, z, r = 0, what = '') {
  const d = distToRamble(x, z) - r;
  if (d < 1.3) console.warn(`[outskirts] ${what} at (${x.toFixed(1)}, ${z.toFixed(1)}) is ${d.toFixed(2)} m from the trail`);
  return d >= 1.3;
}

// a candy-smooth stone with a plump moss cushion grown out of its top (as fallsGarden.js): welded so it shades round,
// the moss lifted along the normal, a darker band where the cushion meets the stone and a sunny crown
export function mossyStone(g0, { amt = 0.45, sc = 1, seed = 0, lift = 0.05, stone = STONE } = {}) {
  g0.deleteAttribute('normal'); if (g0.attributes.uv) g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const m = amt > 0 ? clamp((mossLine(n.getY(i), p.getX(i), p.getZ(i), amt, sc, seed) + 0.03) * 9) : 0;
    w[i] = m; const k = m * m * (3 - 2 * m) * lift;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  g.computeVertexNormals();
  const s0 = new THREE.Color(stone[0]), s1 = new THREE.Color(stone[1]), mo = new THREE.Color(MOSS), hi = new THREE.Color(MOSS_HI), ed = new THREE.Color(MOSS_EDGE), t = new THREE.Color();
  return paint(g, (pp, nn, o, i) => {
    o.copy(s0).lerp(s1, clamp(nn.y * 0.55 + 0.4)).multiplyScalar(0.95 + 0.08 * nz(pp.x * 2.3 + seed, pp.y * 2.3));
    const m = w[i], up = clamp(nn.y * 1.25 - 0.2);
    t.copy(ed).lerp(mo, clamp(up * 2.2)).lerp(hi, clamp(up * 1.8 - 0.75)).multiplyScalar(0.93 + 0.12 * nz(pp.x * 4.1, pp.z * 4.1));
    t.lerp(ed, clamp(1 - m * 1.6) * 0.6);
    o.lerp(t, clamp(m * 1.4));
  });
}
/** a rounded mossy boulder of radius r sitting at local (x, y, z) (y: its ground), sunk a little → { top } */
export function boulder(B, x, y, z, r, { sq = 0.72, moss = 0.5, stretch = 1.15, yaw = 0, seed = 1, sink = 0.28 } = {}) {
  const g = puff(V(0, 0, 0), r, { detail: 2, noise: 0.08, squash: sq, seed });
  g.scale(stretch, 1, 1 / Math.sqrt(stretch)); g.rotateY(yaw); g.translate(x, y + r * sq * (0.62 - sink), z);
  B.add(mossyStone(g, { amt: moss * 0.8, sc: 0.6 / r, seed, lift: r * 0.08 }), null);
  return { top: y + r * sq * (1.62 - sink) };
}

// ---- plants
/** a clump of cattails: thick blades and brown seed heads on stalks */
export function cattails(B, x, y, z, rnd, { n = 6, h = 0.85 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = rnd() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, hh = h + rnd() * 0.4;
    const bl = leafGeo(hh, 0.055, 0.3); bl.rotateZ(PI / 2 - 0.12 - rnd() * 0.3); bl.rotateY(rnd() * TAU); bl.translate(px, y, pz); B.add(bl, i % 2 ? '#5f9e44' : '#72b04e', 'leaf');
    if (i % 2 === 0) {
      const st = G.cyl(0.013, 0.017, hh, 4); st.translate(px, y + hh / 2, pz); B.add(st, '#6a9a48', 'leaf');
      const hd = G.cyl(0.045, 0.045, 0.22, 7); hd.translate(px, y + hh + 0.07, pz); B.add(hd, '#8a5a3a', 'leaf');
      const tip = G.cyl(0.006, 0.01, 0.08, 3); tip.translate(px, y + hh + 0.22, pz); B.add(tip, '#6a9a48', 'leaf');
    }
  }
}
/** a fern: arching fronds of leaf cards round a centre */
export function fern(B, x, y, z, rnd, s = 1) {
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + rnd() * 0.4, L = (0.5 + rnd() * 0.2) * s;
    const f = leafGeo(L, 0.1 * s, 0.2); f.rotateZ(0.55 + rnd() * 0.2); f.rotateY(-a); f.translate(x, y + 0.05, z);
    B.add(f, i % 2 ? '#4c9b43' : '#62b04a', 'leaf');
  }
}
/** a little tuft of pink / white toy flowers on leaf rosettes, on the ground at (x, y, z) */
export function flowers(B, x, y, z, rnd, { n = 3, r = 0.35, colors = ['#ff9dc1', '#ff9dc1', '#ffffff', '#ffc2da'] } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = r * Math.sqrt(rnd()), fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d, hh = 0.1 + rnd() * 0.12;
    for (let k = 0; k < 3; k++) { const lf = leafGeo(0.17, 0.06, 0.3); lf.rotateZ(0.35); lf.rotateY(k * 2.1 + a); lf.translate(fx, y, fz); B.add(lf, '#4c9b43', 'leaf'); }
    const st = G.cyl(0.008, 0.01, hh, 3, true); st.translate(fx, y + hh / 2, fz); B.add(st, '#4a8a3a', 'leaf');
    const f = blossomGeo(0.085 + rnd() * 0.03); f.rotateX(0.3); f.translate(fx, y + hh, fz); B.add(f, colors[Math.floor(rnd() * colors.length)], 'leaf');
    const c = G.sph(0.03, 5, 3); c.scale(1, 0.6, 1); c.translate(fx, y + hh + 0.015, fz); B.add(c, '#ffd24a', 'leaf');
  }
}
/** a big thick lily pad with a notch (its rim turned up a touch) at water height y, optionally with a pink lotus */
export function lilyPad(B, x, y, z, r, rot, lotus = false) {
  const n = 18, notch = 0.35, pos = [];
  const pt = (a, k) => [Math.cos(a) * r * k, 0.05 * k * k, Math.sin(a) * r * k];
  for (let i = 0; i < n; i++) {
    const a0 = notch / 2 + (i / n) * (TAU - notch), a1 = notch / 2 + ((i + 1) / n) * (TAU - notch);
    pos.push(0, 0.04, 0, ...pt(a1, 1), ...pt(a0, 1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.rotateY(rot); g.translate(x, y, z);
  B.add(g, (p, nn, o) => o.set('#5aa83c').lerp(new THREE.Color('#8fd05a'), clamp(Math.hypot(p.x - x, p.z - z) / r) * 0.6));
  const rim = G.torus(r * 0.985, 0.022, 4, 22, TAU - notch); rim.rotateX(PI / 2); rim.rotateY(-notch / 2 + rot); rim.translate(x, y + 0.045, z);
  B.add(rim, '#4a8f34');
  if (lotus) {
    const lx = x + r * 0.12, lz = z - r * 0.1;
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + ring * 0.45, pl = G.sph(0.09 - ring * 0.018, 6, 4); pl.scale(0.55, 0.35, 1.4); pl.translate(0, 0, 0.1);
      pl.rotateX(-0.6 - ring * 0.5); pl.rotateY(a); pl.translate(lx, y + 0.1 + ring * 0.035, lz);
      B.add(pl, (p, nn, o) => o.set('#ff9cc4').lerp(new THREE.Color('#ffeef4'), clamp((p.y - y - 0.07) * 6)));
    }
    const c = G.sph(0.05, 8, 5); c.scale(1, 0.6, 1); c.translate(lx, y + 0.16, lz); B.add(c, '#ffd24a');
  }
}

// ---- timber
/** rope wrapped round a post (radius r) at local (x, y, z): n turns stacked up */
export function ropeWrap(B, x, y, z, r, n = 3) {
  for (let k = 0; k < n; k++) { const t = G.torus(r + 0.012, 0.026, 4, 10); t.rotateX(PI / 2); t.translate(x, y + k * 0.055, z); B.add(t, (p, nn, o) => o.set(ROPE).multiplyScalar(0.86 + 0.18 * clamp(nn.y + 0.5))); }
}
/** a chunky round timber post from y0 up to y1 at (x, z): a darker rounded cap, an optional rope wrap below it */
export function roundPost(B, x, z, y0, y1, { r = 0.09, color = WOOD_D, rope = 0, cap = true } = {}) {
  const p = G.cyl(r * 0.96, r, y1 - y0, 10); p.translate(x, (y0 + y1) / 2, z);
  B.add(p, (pp, nn, o) => o.set(color).multiplyScalar(0.9 + 0.12 * nz(pp.y * 5, Math.atan2(nn.z, nn.x) * 1.5)));
  if (cap) { const c = G.sph(r * 1.0, 10, 5); c.scale(1, 0.45, 1); c.translate(x, y1, z); B.add(c, (pp, nn, o) => o.set(color).lerp(new THREE.Color('#e8b884'), clamp(nn.y) * 0.45)); }
  if (rope) ropeWrap(B, x, y1 - 0.12 - rope * 0.055, z, r, rope);
}
/** a wooden lantern post: a round post with rope at its foot and top, an arm toward `face` (a yaw) with a round cream
 *  paper lantern hanging from it → the lantern's centre (local, for B.light) */
export function lanternPost(B, x, y, z, { h = 1.5, face = 0, color = '#fff1d2' } = {}) {
  roundPost(B, x, z, y - 0.15, y + h, { r: 0.075, cap: false });
  return lanternOn(B, x, y, z, { h, face, color });
}
function lanternOn(B, x, y, z, { h, face, color }) {
  const r = 0.075;
  ropeWrap(B, x, y + 0.08, z, r, 2);
  ropeWrap(B, x, y + h - 0.32, z, r, 2);
  const cap = G.cyl(0.05, 0.095, 0.07, 10); cap.translate(x, y + h + 0.03, z); B.add(cap, WOOD_DD);
  const dx = Math.sin(face), dz = Math.cos(face), L = 0.46;
  const arm = G.beam(0.075, 0.075, L + 0.08); arm.rotateY(face); arm.translate(x + dx * L / 2, y + h - 0.1, z + dz * L / 2); B.add(arm, WOOD_D);
  const knob = G.sph(0.045, 8, 5); knob.translate(x + dx * (L + 0.04), y + h - 0.1, z + dz * (L + 0.04)); B.add(knob, WOOD_DD);
  const lx = x + dx * (L - 0.06), lz = z + dz * (L - 0.06), ly = y + h - 0.15;
  let cy = 0; B.at([lx, ly, lz], 0, () => { cy = chochin(B, { r: 0.16, h: 0.28, color, band: false, cord: 0.07 }); });
  return [lx, ly + cy, lz];
}
export { lanternOn };
/** a rounded post-and-rail fence along local points [[x, z], …] (y from gy): round posts with caps, two chunky rails,
 *  rope lashed at every post → the posts' points (for colliders) */
export function fence(B, pts, gy, { h = 0.78, r = 0.075, rails = 2 } = {}) {
  const out = [];
  pts.forEach(([x, z], i) => {
    const y = gy(x, z);
    roundPost(B, x, z, y - 0.15, y + h, { r, rope: 0 });
    ropeWrap(B, x, y + h * 0.62, z, r, 2);
    out.push([x, z]);
    if (i === 0) return;
    const [px, pz] = pts[i - 1], py = gy(px, pz);
    for (let k = 0; k < rails; k++) {
      const yy = (k === 0 ? 0.68 : 0.36) * h;
      const a = V(px, py + yy, pz), b = V(x, y + yy, z);
      const rail = tube([0, 1, 2, 3].map(j => ({ p: a.clone().lerp(b, j / 3).add(V(0, -Math.sin(j / 3 * PI) * 0.015, 0)), r: 0.045 })), 7, false);
      B.add(rail, (pp, nn, o) => o.set(WOOD).multiplyScalar(0.86 + 0.18 * clamp(nn.y + 0.4)));
    }
  });
  return out;
}
/** a woven basket (straw bands) at local (x, y, z) of radius r, heaped with fruit (fruit(B, x, y, z) draws one) */
export function basket(B, x, y, z, r, { h = r * 0.9, fill = null, handle = false, n = 6, color = '#d9a85c' } = {}) {
  const g = G.lathe([[0.001, 0], [r * 0.78, 0], [r * 0.86, h * 0.1], [r * 0.98, h * 0.7], [r, h], [r * 0.92, h], [r * 0.9, h * 0.75], [0.001, h * 0.7]], 14);
  g.translate(x, y, z);
  const cA = new THREE.Color(color), cB = new THREE.Color(color).multiplyScalar(0.78);
  B.add(g, (p, nn, o) => { const band = Math.sin((p.y - y) / h * PI * 5) > 0.2; o.copy(band ? cA : cB).multiplyScalar(0.9 + 0.12 * Math.abs(Math.sin(Math.atan2(p.z - z, p.x - x) * 7 + (p.y - y) * 20))); });
  const rim = G.torus(r * 0.98, 0.035, 5, 16); rim.rotateX(PI / 2); rim.translate(x, y + h, z); B.add(rim, '#b8823e');
  if (handle) { const hd = G.torus(r * 0.85, 0.025, 4, 14, PI); hd.translate(x, y + h, z); B.add(hd, '#b8823e'); }
  if (fill) {
    const rr = mulb(Math.round((x * 31 + z * 17) * 100));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rr() * 0.5, d = i === 0 ? 0 : r * 0.5;
      fill(B, x + Math.cos(a) * d, y + h * 0.82 + (i === 0 ? 0.07 : 0), z + Math.sin(a) * d, i);
    }
  }
}
function mulb(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
