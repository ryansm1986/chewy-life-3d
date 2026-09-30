// Shiokaze Tidepools: asset builders (docs/REGIONS.md §2). Every builder returns bucket geometries keyed by the
// Placer's material keys ({ body, rock, grass, reed, bark, foliage, 'cards:pine', ... , lights }) in local space
// (ground at y = 0), so populate() just drops them into the batches. Built once per world, cached per variant.
import * as THREE from 'three';
import { VEG_BUILD } from '../../world/vegetation.js';
import { G, C, shade, bar } from '../../world/buildings/kit.js';
import { torii, lanternPost, chochin, crate } from '../../world/buildings/props.js';
import { boat, net, shimenawa, bucket } from '../../world/buildings/props2.js';
import { glassFloats } from '../../world/buildings/trim.js';
import { tube, puff } from '../../gfx/geom.js';
import { V, col, PI, TAU, clamp, mulberry32, nz, kitPiece, blobDisc, lump, ribbon, lean, merge, paint } from './tidepoolKit.js';

const UP = V(0, 1, 0);
const pick = (r, a) => a[Math.floor(r() * a.length)];
const upNormals = (g, k = 0.7) => { // soften blade / leaf normals toward up (uniform, bright lighting on thin cards)
  const n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) { v.set(n.getX(i), n.getY(i), n.getZ(i)); if (v.y < 0) v.negate(); v.lerp(UP, k).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
};

// ------------------------------------------------------------------ vegetation
/** Wind-bent coastal black pine: the village niwaki pine, sheared downwind and "flagged" (windward pads pulled in). */
export function coastPine(seed, dir = V(0.95, 0, -0.3).normalize(), k = 0.085) {
  const t = VEG_BUILD.tree('pine', seed);
  const w = new THREE.Vector3();
  for (const g of [t.trunkGeo, t.foliage, t.cardGeo]) {
    lean(g, dir, k, 1.55);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < 1.6) continue;
      const ax = dir.x * k * Math.pow(y, 1.55), az = dir.z * k * Math.pow(y, 1.55);
      w.set(p.getX(i) - ax, 0, p.getZ(i) - az);
      const wind = -(w.x * dir.x + w.z * dir.z), f = clamp((y - 1.6) / 2) * 0.5;
      if (wind > 0) { p.setX(i, p.getX(i) + dir.x * wind * f); p.setZ(i, p.getZ(i) + dir.z * wind * f); }
      else { p.setX(i, p.getX(i) - dir.x * wind * f * 0.35); p.setZ(i, p.getZ(i) - dir.z * wind * f * 0.35); }
    }
    p.needsUpdate = true; g.computeBoundingSphere();
  }
  return { bark: t.trunkGeo, foliage: t.foliage, 'cards:pine': t.cardGeo };
}
/** Dune grass (kōbōmugi): a fountain of long sun-bleached blades. Material 'reed' (sways with the wind). */
export function duneGrass(seed) {
  const r = mulberry32(seed * 71 + 5), parts = [];
  const n = 16 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.22, h = 0.5 + r() * 0.45, out = 0.18 + r() * 0.4;
    const b = V(Math.cos(a) * d, 0, Math.sin(a) * d), dir = V(Math.cos(a + (r() - 0.5) * 0.8), 0, Math.sin(a + (r() - 0.5) * 0.8));
    const side = V(-dir.z, 0, dir.x), pts = [], w0 = 0.045 + r() * 0.02;
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: b.clone().addScaledVector(dir, out * h * t * t).add(V(0, h * Math.sin(t * PI * 0.48) * 1.02, 0)), w: w0 * (1 - t * 0.92) }); }
    const g = upNormals(ribbon(pts, side));
    const base = col(pick(r, ['#7c8e4a', '#8a9c50', '#6e8448'])), tip = col(pick(r, ['#ecdc9a', '#e2d28a', '#f2e6b0', '#c8cc7a']));
    parts.push(paint(g, (p, nn, o) => o.copy(base).lerp(tip, clamp(p.y / h * 1.1))));
  }
  // a few seed heads
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU, h = 0.75 + r() * 0.3, top = V(Math.cos(a) * 0.12, h, Math.sin(a) * 0.12);
    const st = tube([{ p: V(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04), r: 0.008 }, { p: top, r: 0.006 }], 3, false); paint(st, (p, nn, o) => o.set('#c8b878'));
    const hd = tube([{ p: top, r: 0.012 }, { p: top.clone().add(V(0.02, 0.14, 0.01)), r: 0.018 }, { p: top.clone().add(V(0.03, 0.24, 0.02)), r: 0.004 }], 4, true); paint(hd, (p, nn, o) => o.set('#e8d8a0'));
    parts.push(st, hd);
  }
  return { reed: merge(parts) };
}
/** Beach morning glory (hamahirugao): creeping runners with glossy kidney leaves and pale pink trumpets. Low ground cover. */
export function morningGlory(seed) {
  const r = mulberry32(seed * 53 + 9), parts = [];
  const runners = 3 + Math.floor(r() * 2);
  const leafC = ['#3f8a4a', '#4a9a50', '#357a44', '#58a858'].map(col);
  for (let k = 0; k < runners; k++) {
    const a0 = r() * TAU, L = 0.6 + r() * 0.6, pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, a = a0 + Math.sin(t * 3 + k) * 0.5; pts.push(V(Math.cos(a) * L * t, 0.02, Math.sin(a) * L * t)); }
    const vine = tube(pts.map(p => ({ p, r: 0.008 })), 3, false); paint(vine, (p, nn, o) => o.set('#6a8a3a')); parts.push(vine);
    for (let i = 1; i <= 8; i++) { // kidney leaves along the runner, lying on the sand, tilted up a touch
      const p = pts[i], s = 0.05 + r() * 0.035;
      const lf = new THREE.CircleGeometry(1, 10, 0.5, TAU - 1.0); lf.scale(s * 1.15, s, 1); lf.rotateX(-PI / 2 + 0.35 + r() * 0.3); lf.rotateY(r() * TAU); lf.translate(p.x + (r() - 0.5) * 0.06, 0.03 + r() * 0.02, p.z + (r() - 0.5) * 0.06);
      const c = pick(r, leafC); paint(lf, (pp, nn, o) => o.copy(c).lerp(col('#9ad07a'), clamp(nn.y - 0.6) * 0.8)); parts.push(lf);
    }
    for (let i = 3; i <= 8; i += 2 + Math.floor(r() * 2)) { // trumpet flowers facing up / toward the camera
      const p = pts[i], R = 0.07 + r() * 0.025;
      const fl = new THREE.LatheGeometry([[0.006, 0], [0.018, 0.02], [0.04, 0.05], [R * 0.9, 0.075], [R, 0.085]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
      const pk = col(pick(r, ['#ffb2cf', '#ffa6c8', '#ffc4da', '#f8a0c4']));
      paint(fl, (pp, nn, o) => { const rr = Math.hypot(pp.x, pp.z) / R, a = Math.atan2(pp.z, pp.x); o.set('#fffaf6').lerp(pk, clamp(rr * 1.5 - 0.35)); if (rr > 0.45 && Math.abs(Math.sin(a * 2.5)) < 0.16) o.lerp(col('#ff7aa8'), 0.5); });
      fl.rotateX(0.4); fl.rotateY(r() * 0.6 - 0.3 + PI / 4); fl.translate(p.x, 0.035, p.z); parts.push(fl);
      const eye = new THREE.CircleGeometry(0.012, 5); eye.rotateX(-PI / 2); eye.translate(p.x, 0.05, p.z); paint(eye, (pp, nn, o) => o.set('#ffe890')); parts.push(eye);
    }
  }
  return { grass: merge(parts) };
}

// ------------------------------------------------------------------ rock
const STRATA = ['#b4a698', '#c8baa8', '#a2968e', '#bcae9e', '#d4c6b2'].map(col);
const WET = col('#5a5660'), WET2 = col('#6e6a70'), BARN = col('#f2ece0'), LICHEN = col('#e8b04a'), WEED = col('#6a7a3a');
/** paint a coastal rock: warm banded strata, sun-bleached tops with lichen, a dark wet foot with barnacles + weed */
function paintCoastRock(g, { wetTo = 0.55, seed = 0, tilt = 0.12, top = 99, grass = false } = {}) {
  return paint(g, (p, n, o) => {
    const band = Math.floor((p.y + p.x * tilt + nz(p.x * 0.8 + seed, p.z * 0.8) * 0.25) * 2.6);
    o.copy(STRATA[((band % 5) + 5) % 5]).multiplyScalar(0.92 + 0.12 * clamp(n.y + 0.4));
    if (Math.abs(((p.y + p.x * tilt) * 2.6) % 1) < 0.1) o.multiplyScalar(0.84); // groove between strata
    if (n.y > 0.55) { o.lerp(col('#e2d8c8'), 0.35); if (nz(p.x * 2.4 + seed, p.z * 2.4) > 0.45) o.lerp(LICHEN, 0.55); }
    if (grass && n.y > 0.7 && p.y > top - 0.4) o.lerp(col('#7aa84e'), clamp((n.y - 0.7) * 5) * clamp((p.y - top + 0.4) * 3));
    const w = clamp((wetTo - p.y) * 3 + nz(p.x * 3, p.z * 3) * 0.2);
    if (w > 0) {
      o.lerp(p.y < wetTo * 0.45 ? WET : WET2, w * 0.85);
      if (p.y > 0.05 && p.y < wetTo && nz(p.x * 9 + seed, p.y * 9 + p.z * 9) > 0.25) o.lerp(BARN, 0.7); // barnacle band
      if (p.y < wetTo * 0.5 && nz(p.x * 5 - seed, p.z * 5 + p.y * 4) > 0.3) o.lerp(WEED, 0.6);
    }
  });
}
/** Sea stack: a tall banded rock pillar with a grassy crown. H tall (m), R base radius. */
export function seaStack(seed, H = 6, R = 1.6) {
  const r = mulberry32(seed * 97 + 3), segs = 22, rows = 26;
  const g = new THREE.CylinderGeometry(1, 1, 1, segs, rows, false); g.translate(0, 0.5, 0);
  const p = g.attributes.position, ph = [r() * TAU, r() * TAU], tiltA = r() * TAU;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rr = Math.hypot(x, z), a = Math.atan2(z, x);
    const prof = 1.08 - 0.34 * y + 0.12 * Math.sin(y * 7 + ph[0]) - (y > 0.93 ? (y - 0.93) * 3 : 0); // flared foot, necked waist, rounded top
    const strata = Math.abs(Math.sin((y * H + Math.cos(a - tiltA) * 0.3) * 1.7)) < 0.25 ? -0.07 : 0;
    const k = prof * (1 + 0.16 * nz(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6 + y * 2.2) + 0.08 * Math.sin(a * 3 + ph[1]) + strata);
    const cap = y > 0.999 ? rr : 1;
    p.setXYZ(i, Math.cos(a) * R * k * cap * (rr > 0 ? 1 : 0), y * H + (y > 0.999 ? 0.15 * (1 - rr * rr) : 0), Math.sin(a) * R * k * cap * (rr > 0 ? 1 : 0));
  }
  g.deleteAttribute('uv');
  const gg = mergeWeld(g);
  paintCoastRock(gg, { wetTo: 0.8, seed, tilt: 0.1, top: H, grass: true });
  // guano streaks running down from the crown
  const c = gg.attributes.color, pp = gg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const a = Math.atan2(pp.getZ(i), pp.getX(i)), y = pp.getY(i);
    if (y > H * 0.55 && y < H - 0.25 && Math.sin(a * 5 + seed) > 0.8 && nz(a * 3, y * 0.6) > -0.1) { const k = clamp((y - H * 0.55) / (H * 0.4)) * 0.6; c.setXYZ(i, c.getX(i) + (0.97 - c.getX(i)) * k, c.getY(i) + (0.96 - c.getY(i)) * k, c.getZ(i) + (0.92 - c.getZ(i)) * k); }
  }
  const tufts = [];
  for (let k = 0; k < 5; k++) { const a = r() * TAU, d = r() * R * 0.45; const t = duneGrass(seed * 5 + k).reed; t.scale(0.7, 0.7, 0.7); t.translate(Math.cos(a) * d, H + 0.1, Math.sin(a) * d); tufts.push(t); }
  return { rock: gg, reed: merge(tufts), top: H + 0.12 };
}
function mergeWeld(g) { // weld a displaced primitive so it shades round
  const t = g.index ? g : g;
  if (t.attributes.normal) t.deleteAttribute('normal');
  const m = new THREE.BufferGeometry(); m.setAttribute('position', t.attributes.position); m.setIndex(t.index);
  const out = m.toNonIndexed(); out.computeVertexNormals();
  // smooth normals by welding positions
  const pos = out.attributes.position, nor = out.attributes.normal, map = new Map(), key = i => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i); const a = map.get(k) || [0, 0, 0]; a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); map.set(k, a); }
  for (let i = 0; i < pos.count; i++) { const a = map.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  g.dispose();
  return out;
}
/** An extruded blob slab (terraced rock layer): top at y = h with a rounded lip, wall down to y = -0.3 */
function slab(R, h, { seed = 0, sx = 1, sz = 1, wob = 0.22, segs = 26, lip = 0.1 } = {}) {
  const r = mulberry32(seed * 131 + 7), ph = [r() * TAU, r() * TAU, r() * TAU];
  const rim = a => R * (1 + wob * (0.55 * Math.sin(2 * a + ph[0]) + 0.3 * Math.sin(3 * a + ph[1]) + 0.18 * Math.sin(5 * a + ph[2])) + 0.05 * nz(Math.cos(a) * 3 + seed, Math.sin(a) * 3));
  const rings = [[0, h + 0.02, 0], [0.55, h + 0.01, 0], [0.86, h - 0.005, 0], [1 - lip * 0.35 / R, h - lip * 0.25, 0.3], [1, h - lip, 1], [1.02, h * 0.5, 1], [1.06, -0.3, 1]];
  const pos = [], idx = [], row = segs;
  for (const [f, y, n] of rings) for (let k = 0; k < segs; k++) {
    const a = k / segs * TAU, rr = rim(a) * f + (n ? nz(a * 4 + seed, y * 3) * 0.06 * R * n : 0);
    pos.push(Math.cos(a) * rr * sx, y + (f < 0.9 ? nz(Math.cos(a) * rr * 0.7 + seed, Math.sin(a) * rr * 0.7) * 0.05 : 0), Math.sin(a) * rr * sz);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++) {
    const a = i * row + k, b = i * row + (k + 1) % segs, c = a + row, d = b + row;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose();
  // centre ring collapses to a point: flip any faces pointing down (winding around the ring 0 fan)
  return weldNormals(ng);
}
function weldNormals(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, map = new Map(), key = i => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i); const a = map.get(k) || [0, 0, 0]; a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); map.set(k, a); }
  for (let i = 0; i < pos.count; i++) { const a = map.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return g;
}
/** barnacle cluster geometry (little white volcano cones) scattered on points pts */
function barnacles(pts, r) {
  const parts = [];
  for (const [p, n, s] of pts) {
    const k = 3 + Math.floor(r() * 4);
    for (let i = 0; i < k; i++) {
      const b = new THREE.CylinderGeometry(0.012 * s, 0.03 * s, 0.035 * s, 6, 1, true);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, n);
      b.applyQuaternion(q); b.translate(p.x + (r() - 0.5) * 0.12 * s, p.y + (r() - 0.5) * 0.08 * s, p.z + (r() - 0.5) * 0.12 * s);
      paint(b, (pp, nn, o) => o.set('#f4eee2').multiplyScalar(0.86 + 0.14 * r()));
      parts.push(b);
    }
  }
  return parts;
}
/** Weathered rock shelf: 2-3 terraced slabs, wet dark foot with barnacles, mussels and a weed fringe. ~L x D m. */
export function rockShelf(seed, L = 4, D = 2.4, Hh = 0.9) {
  const r = mulberry32(seed * 61 + 11), parts = [];
  const n = 2 + (r() < 0.6 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const f = 1 - i * 0.26, h = Hh * (0.45 + i * 0.3) * (0.85 + r() * 0.3);
    const g = slab(L * 0.5 * f, h, { seed: seed * 7 + i, sx: 1, sz: D / L, wob: 0.24 });
    g.translate((r() - 0.5) * L * 0.18 * i, 0, (r() - 0.5) * D * 0.2 * i);
    parts.push(g);
  }
  const g = merge(parts);
  paintCoastRock(g, { wetTo: 0.42, seed, tilt: 0.06 });
  const extra = [];
  // barnacles + mussels on the wet foot (sampled from the outer wall)
  const pos = g.attributes.position, nor = g.attributes.normal, spots = [];
  for (let i = 0; i < pos.count; i += 7) { const y = pos.getY(i); if (y > 0.04 && y < 0.4 && nor.getY(i) < 0.4 && r() < 0.35) spots.push([V(pos.getX(i), y, pos.getZ(i)), V(nor.getX(i), nor.getY(i), nor.getZ(i)).normalize(), 0.8 + r() * 0.6]); }
  extra.push(...barnacles(spots.slice(0, 26), r));
  for (const [p, nn] of spots.slice(26, 40)) { // mussels: dark blue ovals in clumps
    for (let k = 0; k < 3; k++) { const m = new THREE.SphereGeometry(0.04, 6, 4); m.scale(1.6, 0.6, 0.8); m.rotateY(r() * TAU); m.translate(p.x + nn.x * 0.02 + (r() - 0.5) * 0.08, Math.max(0.02, p.y - 0.05 + (r() - 0.5) * 0.06), p.z + nn.z * 0.02 + (r() - 0.5) * 0.08); paint(m, (pp, q, o) => o.set('#2e3450').lerp(col('#6a78a8'), clamp(q.y) * 0.5)); extra.push(m); }
  }
  return { rock: merge([g, ...extra]) };
}
/** loose shore boulder (rounded, banded, wet foot) */
export function boulder(seed, R = 0.7, sq = 0.62) {
  const g = lump(V(0, R * 0.25, 0), R, { detail: 2, noise: 0.28, squash: sq, seed });
  paintCoastRock(g, { wetTo: 0.3, seed, tilt: 0.2 });
  return { rock: g };
}

// ------------------------------------------------------------------ tide pool life
/** Kelp: tall wavy olive-brown fronds with bladders ('reed' sways them). h = frond length */
export function kelp(seed, h = 0.8) {
  const r = mulberry32(seed * 37 + 1), parts = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, b = V(Math.cos(a) * r() * 0.1, 0, Math.sin(a) * r() * 0.1), L = h * (0.7 + r() * 0.5), dir = V(Math.cos(a), 0, Math.sin(a));
    const side = V(-dir.z, 0, dir.x), pts = [], ph = r() * TAU;
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ p: b.clone().addScaledVector(dir, Math.sin(t * 4 + ph) * 0.05 + t * 0.15).add(V(0, L * t, 0)), w: 0.07 * Math.sin(Math.min(1, t * 1.3 + 0.12) * PI) + 0.012 }); }
    const g = ribbon(pts, side);
    const c0 = col(pick(r, ['#5a6a2a', '#6a6a28', '#4e6a34'])), c1 = col(pick(r, ['#a8a848', '#b8a850', '#8aa848']));
    parts.push(paint(upNormals(g, 0.4), (p, nn, o) => o.copy(c0).lerp(c1, clamp(p.y / L))));
    const bl = new THREE.SphereGeometry(0.022, 5, 4); bl.translate(pts[5].p.x, pts[5].p.y, pts[5].p.z); paint(bl, (p, nn, o) => o.set('#c8b050')); parts.push(bl);
  }
  return { reed: merge(parts) };
}
/** Branching coral cluster (pink / coral / lilac), ~0.35 m */
export function coral(seed, hue = null) {
  const r = mulberry32(seed * 43 + 7), parts = [];
  const c = col(hue || pick(r, ['#ff7a8a', '#ff9a6a', '#c88ae8', '#ff8ab8', '#ffb04a']));
  const grow = (p, d, len, rad, depth) => {
    const end = p.clone().addScaledVector(d, len);
    parts.push(paint(tube([{ p, r: rad }, { p: p.clone().lerp(end, 0.5).add(V((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.02)), r: rad * 0.85 }, { p: end, r: rad * 0.7 }], 5, true), (pp, nn, o) => o.copy(c).lerp(col('#fff0e8'), clamp((pp.y - 0.15) * 1.5) * 0.4)));
    if (depth <= 0) { const tip = new THREE.SphereGeometry(rad * 1.05, 5, 4); tip.translate(end.x, end.y, end.z); paint(tip, (pp, nn, o) => o.copy(c).lerp(col('#ffffff'), 0.35)); parts.push(tip); return; }
    const nb = 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < nb; k++) { const nd = d.clone().add(V((r() - 0.5) * 1.1, 0.25 + r() * 0.4, (r() - 0.5) * 1.1)).normalize(); grow(end, nd, len * (0.7 + r() * 0.2), rad * 0.75, depth - 1); }
  };
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + r(); grow(V(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04), V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize(), 0.1 + r() * 0.04, 0.028, 2); }
  return { body: merge(parts) };
}
/** Sea anemone: a squat column with a ring of fat, curling tentacles and a dark mouth */
export function anemone(seed) {
  const r = mulberry32(seed * 29 + 3), parts = [];
  const c = col(pick(r, ['#ff8ab0', '#8ae0a0', '#b890ff', '#ffa060', '#ff6a8a']));
  const R = 0.07 + r() * 0.04, H = 0.08 + r() * 0.05;
  const col0 = new THREE.CylinderGeometry(R, R * 1.25, H, 10, 1, true); col0.translate(0, H / 2, 0); paint(col0, (p, n, o) => o.copy(c).multiplyScalar(0.7)); parts.push(col0);
  const disc = new THREE.CircleGeometry(R, 10); disc.rotateX(-PI / 2); disc.translate(0, H, 0); paint(disc, (p, n, o) => o.copy(c).lerp(col('#fff4f0'), 0.3).lerp(col('#4a2030'), clamp(1 - Math.hypot(p.x, p.z) / (R * 0.35)))); parts.push(disc);
  const nt = 14;
  for (let k = 0; k < nt; k++) {
    const a = k / nt * TAU, rr = R * (0.7 + (k % 2) * 0.25), L = 0.07 + r() * 0.04;
    const p0 = V(Math.cos(a) * rr, H, Math.sin(a) * rr), p1 = p0.clone().add(V(Math.cos(a) * L * 0.5, L * 0.6, Math.sin(a) * L * 0.5)), p2 = p1.clone().add(V(Math.cos(a + 0.4) * L * 0.4, L * 0.2, Math.sin(a + 0.4) * L * 0.4));
    parts.push(paint(tube([{ p: p0, r: 0.012 }, { p: p1, r: 0.01 }, { p: p2, r: 0.007 }], 4, true), (p, n, o) => o.copy(c).lerp(col('#ffffff'), clamp((p.y - H) / 0.1) * 0.45)));
  }
  return { reed: merge(parts) };
}
/** Starfish: five chunky arms with a bumpy top, orange / red / purple */
export function starfish(seed) {
  const r = mulberry32(seed * 19 + 5);
  const s = new THREE.Shape(), R = 0.1 + r() * 0.04;
  for (let k = 0; k < 10; k++) { const t = k / 10 * TAU + PI / 2, rr = k % 2 ? R * 0.38 : R; const x = Math.cos(t) * rr, y = Math.sin(t) * rr; k ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.016, bevelSegments: 2 });
  g.rotateX(-PI / 2); g.translate(0, 0.012, 0);
  const c = col(pick(r, ['#ff7a3a', '#ff5a4a', '#b86ae0', '#ff9a4a', '#e84a6a']));
  paint(g, (p, n, o) => { o.copy(c).multiplyScalar(0.85 + 0.2 * clamp(n.y)); if (n.y > 0.7 && nz(p.x * 60, p.z * 60) > 0.35) o.lerp(col('#fff0d8'), 0.6); });
  return { body: g };
}
/** Sea urchin: a dark purple ball bristling with spines */
export function urchin(seed) {
  const r = mulberry32(seed * 23 + 1), parts = [];
  const R = 0.055 + r() * 0.02;
  const b = new THREE.IcosahedronGeometry(R, 1); b.scale(1, 0.75, 1); b.translate(0, R * 0.6, 0); paint(b, (p, n, o) => o.set('#3a2250')); parts.push(b);
  const ico = new THREE.IcosahedronGeometry(1, 1), pp = ico.attributes.position, seen = new Set();
  for (let i = 0; i < pp.count; i++) {
    const d = V(pp.getX(i), pp.getY(i), pp.getZ(i)).normalize(); if (d.y < -0.3) continue;
    const k = d.toArray().map(v => v.toFixed(2)).join(); if (seen.has(k)) continue; seen.add(k);
    const sp = new THREE.ConeGeometry(0.009, 0.09 + r() * 0.03, 3); sp.translate(0, 0.045, 0);
    sp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d)); sp.translate(d.x * R, R * 0.6 + d.y * R * 0.75, d.z * R);
    paint(sp, (q, n, o) => o.set('#5a3478').lerp(col('#c8a0e8'), 0.25)); parts.push(sp);
  }
  ico.dispose();
  return { body: merge(parts) };
}
/** shells on the sand: scallop / spiral / cowrie */
export function shell(seed, kind = 'scallop') {
  const r = mulberry32(seed * 19 + kind.length), c = col(pick(r, ['#fff0e0', '#ffd8c8', '#ffe8b8', '#ffc4c8', '#f8f0f8', '#ffb8a0']));
  let g;
  if (kind === 'scallop') {
    g = new THREE.CircleGeometry(0.1, 12, 0.15, PI - 0.3); g.translate(0, -0.045, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.03 * (1 - (p.getX(i) ** 2 + (p.getY(i) + 0.045) ** 2) / 0.011));
    g.computeVertexNormals(); g.rotateX(-PI / 2); g.translate(0, 0.01, 0);
    paint(g, (pp, nn, o) => { const a = Math.atan2(pp.z + 0.045, pp.x); o.copy(c).multiplyScalar(0.8 + 0.2 * Math.abs(Math.sin(a * 6))); });
  } else if (kind === 'spiral') {
    g = new THREE.ConeGeometry(0.045, 0.13, 8); g.rotateZ(PI / 2 - 0.25); g.translate(0, 0.035, 0);
    paint(g, (p, nn, o) => o.copy(c).lerp(col('#e89a6a'), Math.sin(p.x * 90) > 0.3 ? 0.5 : 0));
  } else {
    g = new THREE.SphereGeometry(0.045, 8, 6); g.scale(1.4, 0.7, 1); g.translate(0, 0.02, 0);
    paint(g, (p, nn, o) => { o.copy(c).lerp(col('#c87a4a'), nz(p.x * 90, p.z * 90) > 0.3 ? 0.55 : 0); if (Math.abs(p.z) < 0.006 && p.y > 0.03) o.set('#6a4030'); });
  }
  return { body: g };
}
/** A tide-pool rim: a ring of wet, barnacled boulders around a blob outline of radius R (the pool itself is terrain) */
export function poolRim(seed, R = 2.2, { sx = 1, sz = 1, gap = -1 } = {}) {
  const r = mulberry32(seed * 7 + 3), parts = [], outline = blobDisc(R, { seed, segs: 24, rings: 1 }), rim = outline.userData.rim;
  outline.dispose();
  const n = Math.round(R * 5.2);
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + (r() - 0.5) * 0.2;
    if (gap >= 0 && Math.abs(((a - gap + PI) % TAU + TAU) % TAU - PI) < 0.45) continue; // a gap where the path steps in
    const rr = rim(a) * (1.02 + r() * 0.08), s = 0.28 + r() * 0.3;
    const g = lump(V(Math.cos(a) * rr * sx, s * 0.15, Math.sin(a) * rr * sz), s, { detail: 1, noise: 0.35, squash: 0.55 + r() * 0.2, seed: seed * 31 + k });
    parts.push(g);
  }
  const g = merge(parts);
  paintCoastRock(g, { wetTo: 0.28, seed, tilt: 0.3 });
  return { rock: g, rim: a => rim(a) };
}
/** a glittering giant clam holding a pearl (the treasure pool's centrepiece) */
export function giantClam(seed = 1) {
  return kitPiece(seed, B => {
    const shellHalf = (up) => {
      const g = new THREE.SphereGeometry(0.42, 16, 6, 0, PI, 0, PI / 2); g.scale(1, 0.4, 0.85);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.08 * Math.abs(Math.sin(a * 5)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      g.computeVertexNormals();
      if (!up) g.rotateX(PI);
      return g;
    };
    const lo = shellHalf(false); lo.translate(0, 0.16, 0); B.add(lo, (p, n, o) => o.set('#c8b8d8').lerp(col('#f4e8ff'), clamp(-n.y)).multiplyScalar(0.9 + 0.1 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 5))));
    const mantle = G.disc(0.36, 16); mantle.rotateX(-PI / 2); mantle.scale(1, 1, 0.8); mantle.translate(0, 0.17, 0.02); B.add(mantle, (p, n, o) => o.set('#3aa8c8').lerp(col('#8af0e0'), clamp(nz(p.x * 20, p.z * 20) + 0.3)));
    B.push([0, 0.17, -0.3], 0, 1, -0.9);
    const up = shellHalf(true); up.translate(0, 0, 0.3); B.add(up, (p, n, o) => o.set('#d8c8e8').lerp(col('#fff4ff'), clamp(n.y)).multiplyScalar(0.9 + 0.1 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 5))));
    B.pop();
    const pearl = G.sph(0.09, 12, 9); pearl.translate(0, 0.26, 0.02); B.glow(pearl, '#fff8ff', { tint: 0.4 }, true);
    B.light([0, 0.4, 0.05], { color: '#c8f0ff', intensity: 2.2, radius: 4, flicker: 0, nightOnly: false });
  });
}

// ------------------------------------------------------------------ beach dressing
/** Big bleached driftwood log with a root ball and a snapped branch (~L m) */
export function driftwood(seed, L = 2.2) {
  const r = mulberry32(seed * 11 + 7), parts = [];
  const bend = (r() - 0.5) * 0.4, pts = [];
  for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V((t - 0.5) * L, 0.13 + Math.sin(t * PI) * 0.05, Math.sin(t * PI) * bend), r: (0.16 - t * 0.08) * (1 + 0.1 * Math.sin(t * 17)) }); }
  parts.push(tube(pts, 7, true));
  for (let k = 0; k < 6; k++) { // root ball at the thick end
    const a = k / 6 * TAU + r() * 0.5, d = V(-1, Math.cos(a) * 0.9, Math.sin(a) * 0.9).normalize(), p0 = V(-L / 2 + 0.05, 0.16, 0);
    const p1 = p0.clone().addScaledVector(d, 0.35 + r() * 0.25), p2 = p1.clone().addScaledVector(d.add(V(-0.2, -0.2, 0)).normalize(), 0.25 + r() * 0.2);
    p1.y = Math.max(0.03, p1.y); p2.y = Math.max(0.02, p2.y);
    parts.push(tube([{ p: p0, r: 0.07 }, { p: p1, r: 0.04 }, { p: p2, r: 0.015 }], 5, true));
  }
  const bp = pts[3].p, bd = V(0.3, 0.6, (r() - 0.5)).normalize();
  parts.push(tube([{ p: bp, r: 0.06 }, { p: bp.clone().addScaledVector(bd, 0.45), r: 0.035 }, { p: bp.clone().addScaledVector(bd, 0.7).add(V(0.1, 0, 0)), r: 0.015 }], 5, true));
  const g = merge(parts);
  paint(g, (p, n, o) => { o.set('#d8d0c4').lerp(col('#f0ebe2'), clamp(n.y)).multiplyScalar(0.84 + 0.16 * Math.abs(Math.sin(p.x * 26 + p.z * 9))); if (nz(p.x * 7, p.z * 7 + p.y * 5) > 0.5) o.multiplyScalar(0.72); if (p.y < 0.05) o.multiplyScalar(0.85); });
  return { body: g };
}
/** The wrecked fishing boat: a broken hull heeled over in the sand, ribs bare where planks are gone, snapped mast with
 *  a torn sail, a draped net, barnacles, an old lantern. ~4 m. */
export function wreck(seed = 3) {
  return kitPiece(seed, B => {
    const L = 3.8, Wd = 1.5, Hh = 1.05;
    B.push([0, 0.25, 0], 0, 1, 0, 0.42); // heeled over onto its port side, half buried
    // hull: half ellipsoid, planked strakes, a missing-plank hole on the upper (starboard) side showing ribs
    const hull = new THREE.SphereGeometry(0.5, 22, 8, 0, TAU, PI / 2, PI / 2); hull.scale(L, Hh * 2, Wd); hull.translate(0, Hh * 0.95, 0);
    const hp = hull.index ? hull.toNonIndexed() : hull, pos = hp.attributes.position, keep = [];
    for (let i = 0; i < pos.count; i += 3) {
      let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += pos.getX(i + k) / 3; cy += pos.getY(i + k) / 3; cz += pos.getZ(i + k) / 3; }
      const hole = cz > 0.2 && Math.abs(cx - 0.35) < 0.75 && cy > 0.35;
      if (!hole) keep.push(i);
    }
    const hg = new THREE.BufferGeometry(); const arr = new Float32Array(keep.length * 9);
    keep.forEach((t, j) => { for (let k = 0; k < 9; k++) arr[j * 9 + k] = pos.array[t * 3 + k]; });
    hg.setAttribute('position', new THREE.BufferAttribute(arr, 3)); hg.computeVertexNormals();
    B.add(hg, (p, n, o) => {
      const strake = Math.floor((p.y + 0.05) / 0.16);
      o.set(strake >= 5 ? '#e8e0cc' : strake === 4 ? '#d8503a' : '#4a8aa8').multiplyScalar(0.84 + 0.16 * ((strake * 37) % 5) / 4);
      if (Math.abs(((p.y + 0.05) / 0.16) % 1) < 0.08) o.multiplyScalar(0.7);
      if (nz(p.x * 3, p.y * 4) > 0.35) o.lerp(col('#c8c0b0'), 0.45); // flaked paint
      if (p.y < 0.35 && nz(p.x * 12, p.z * 12) > 0.2) o.lerp(col('#f0eadc'), 0.6); // barnacles low on the hull
    });
    const inner = hull.clone(); inner.scale(0.95, 0.95, 0.93); inner.translate(0, Hh * 0.05, 0);
    const iv = inner.index ? inner.toNonIndexed() : inner, ip = iv.attributes.position;
    for (let i = 0; i < ip.count; i += 3) { const x = ip.getX(i + 1), y = ip.getY(i + 1), z = ip.getZ(i + 1); ip.setXYZ(i + 1, ip.getX(i + 2), ip.getY(i + 2), ip.getZ(i + 2)); ip.setXYZ(i + 2, x, y, z); }
    iv.computeVertexNormals(); B.add(iv, (p, n, o) => o.set('#8a6a4e').multiplyScalar(Math.abs(Math.sin(p.x * 9)) < 0.1 ? 0.75 : 1));
    for (let i = -3; i <= 3; i++) { // ribs (visible through the hole)
      const k = Math.sqrt(Math.max(0, 1 - (0.27 * i) ** 2)), rib = G.torus(0.47, 0.03, 4, 12, PI); rib.rotateZ(PI); rib.rotateY(PI / 2);
      rib.scale(1, Hh * 1.9 * k, Wd * 0.95 * k); rib.translate(i * 0.26 * L / 2, Hh * 0.95, 0); B.add(rib, '#6a4e3a');
    }
    const gun = G.torus(0.5, 0.045, 4, 22); gun.rotateX(PI / 2); gun.scale(L, 1, Wd); gun.translate(0, Hh * 0.95, 0); B.add(gun, '#7a5a42');
    const keel = G.box(L * 0.92, 0.08, 0.08, 0.02); keel.translate(0, 0.02, 0); B.add(keel, '#5a4232');
    // thwart + a snapped mast with a torn sail hanging
    const th = G.box(0.14, 0.05, Wd * 0.9, 0.01); th.translate(0.4, Hh * 0.8, 0); B.add(th, C.woodLight);
    const mast = G.cyl(0.06, 0.07, 1.5, 7); mast.translate(0.4, Hh * 0.8 + 0.7, 0); B.add(mast, C.woodMid);
    const snap = G.cone(0.06, 0.18, 5); snap.translate(0.4, Hh * 0.8 + 1.53, 0); B.add(snap, '#e8c890');
    const sail = G.plane(0.9, 1.0, 3, 4); const sp = sail.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); if (y < -0.2 && x > 0.1) sp.setY(i, y + (x - 0.1) * 0.8); sp.setZ(i, Math.sin(x * 4) * 0.08); }
    sail.translate(0.45, 0, 0); sail.rotateY(PI / 2 + 0.3); sail.translate(0.4, Hh * 0.8 + 0.85, 0.02);
    B.cloth(sail, { grad: ['#d8ccb4', '#f0e8d4'] }, { x0: -0.1, x1: 0.9, yTop: Hh * 0.8 + 1.35, yBot: Hh * 0.8 + 0.3 });
    B.pop();
    // net draped over the side into the sand, glass floats, a lantern, an oar and a crab trap
    B.at([0.2, 0, -1.05], 0.1, () => net(B, { w: 1.6, h: 0.9, yTop: 0.95, color: '#c8b890' }));
    B.at([-0.9, 0.9, -0.95], 0, () => glassFloats(B, { n: 3 }));
    const oar = tube([{ p: V(-1.4, 0.05, 1.0), r: 0.025 }, { p: V(-0.3, 0.1, 1.35), r: 0.022 }], 5, true); B.add(oar, C.woodLight);
    const blade = G.box(0.32, 0.02, 0.12, 0.008); blade.rotateY(-0.35); blade.translate(-1.55, 0.05, 0.95); B.add(blade, C.woodLight);
    B.at([1.6, 0, 0.9], 0.4, () => { // crab trap basket
      const cage = G.cyl(0.26, 0.3, 0.3, 10, true); cage.translate(0, 0.15, 0); B.add(cage, (p, n, o) => o.set('#b89a5a').multiplyScalar(Math.abs(Math.sin(Math.atan2(p.z, p.x) * 7)) < 0.25 ? 0.6 : 1));
      const lid = G.cyl(0.24, 0.26, 0.04, 10); lid.translate(0, 0.31, 0); B.add(lid, '#a08850');
    });
    B.at([-1.2, 0.0, -0.2], 0, () => { const L2 = G.cyl(0.1, 0.12, 0.08, 8); L2.translate(0, 0.04, 0); B.add(L2, C.iron); chochin(B, { r: 0.12, h: 0.24, color: '#e8a040' }); });
    B.light([-1.2, 0.35, -0.2], { color: '#ffc080', intensity: 1.6, radius: 4, flicker: 0.6 });
  }, 0.03);
}
/** Net-drying rack with hanging glass floats, stacked buoys, crates and a coil of rope */
export function netRack(seed = 5) {
  return kitPiece(seed, B => {
    const w = 2.6;
    for (const sx of [-1, 1]) { const p = G.cyl(0.06, 0.075, 1.9, 7); p.rotateZ(sx * 0.05); p.translate(sx * w / 2, 0.95, 0); B.add(p, (pp, n, o) => o.set('#8a6e56').multiplyScalar(0.85 + 0.2 * clamp(nz(pp.y * 5, pp.x * 20)))); }
    const pole = G.cyl(0.04, 0.04, w + 0.4, 7); pole.rotateZ(PI / 2); pole.translate(0, 1.85, 0); B.add(pole, '#a08466');
    B.at([0, 0, 0.02], 0, () => net(B, { w: w - 0.2, h: 1.25, yTop: 1.82, color: '#d4c49a' }));
    B.at([0.55, 1.82, 0.08], 0, () => glassFloats(B, { n: 3 }));
    B.at([-0.7, 1.82, 0.08], 0, () => glassFloats(B, { n: 2 }));
    // buoys: red / white fenders and cork floats on the sand
    for (let i = 0; i < 4; i++) {
      const x = 1.7 + (i % 2) * 0.32, z = 0.4 - Math.floor(i / 2) * 0.35, y = i >= 2 ? 0.2 : 0.16;
      const b = G.sph(0.17, 12, 9); b.scale(1, 1.15, 1); b.translate(x, y, z); B.add(b, (p, n, o) => o.set(Math.abs(p.y - y) < 0.06 ? '#fff6ea' : '#e8503a'));
    }
    for (let i = 0; i < 5; i++) { const c = G.cyl(0.08, 0.08, 0.16, 8); c.rotateZ(PI / 2); c.translate(-1.8 + (i % 3) * 0.17, 0.08 + Math.floor(i / 3) * 0.15, 0.5); B.add(c, '#c89a5a'); }
    B.at([-1.9, 0, -0.3], 0.3, () => crate(B, { s: 0.36, wood: '#6a9ac8' }));
    B.at([-1.5, 0, -0.45], -0.2, () => crate(B, { s: 0.3, wood: C.woodPale }));
    B.at([1.3, 0, -0.5], 0, () => bucket(B, { r: 0.14, h: 0.2, color: '#8aa0b8' }));
    const coil = []; for (let k = 0; k < 4; k++) { const t = G.torus(0.24 - k * 0.035, 0.03, 5, 14); t.rotateX(PI / 2); t.translate(0.2, 0.03 + k * 0.045, 0.75); coil.push(t); }
    for (const t of coil) B.add(t, '#e0cc98');
  });
}
/** Rope-and-plank walkway along a polyline pts [[x, z]...] (local), deck at height y; posts, sagging rope rails */
export function walkway(seed, pts, y = 0.35, w = 1.25) {
  return kitPiece(seed, B => {
    const P = pts.map(([x, z]) => V(x, 0, z));
    let acc = 0; const segs = [];
    for (let i = 0; i < P.length - 1; i++) { const L = P[i].distanceTo(P[i + 1]); segs.push([P[i], P[i + 1], acc, L]); acc += L; }
    const at = s => { for (const [a, b, s0, L] of segs) if (s <= s0 + L) return [a.clone().lerp(b, (s - s0) / L), b.clone().sub(a).normalize()]; const [a, b] = segs[segs.length - 1]; return [b.clone(), b.clone().sub(a).normalize()]; };
    const n = Math.floor(acc / 0.24);
    for (let i = 0; i < n; i++) {
      const [p, d] = at((i + 0.5) * acc / n), yaw = Math.atan2(d.x, d.z);
      const pl = G.box(w + B.wob(0.06), 0.06, acc / n - 0.035, 0.012);
      B.at([p.x + B.wob(0.02), y - 0.03 + B.wob(0.012), p.z], yaw + B.wob(0.04), () => B.add(pl, B.pick(['#c89868', '#d8aa78', '#b88a60', '#dcb488'])));
    }
    const postS = [], rails = [[], []];
    for (let s = 0; s <= acc + 0.01; s += 1.3) postS.push(Math.min(s, acc));
    for (const s of postS) {
      const [p, d] = at(s), sd = V(-d.z, 0, d.x);
      for (const [j, sx] of [[0, -1], [1, 1]]) {
        const q = p.clone().addScaledVector(sd, sx * (w / 2 + 0.02));
        const post = G.cyl(0.055, 0.065, y + 1.05, 6); post.translate(q.x, (y + 1.05) / 2 - 0.25, q.z); B.add(post, (pp, n, o) => { o.set('#7a5e48'); if (pp.y < y * 0.5) o.lerp(col('#4a5a48'), 0.5); });
        const cap = G.cyl(0.07, 0.07, 0.04, 6); cap.translate(q.x, y + 0.8, q.z); B.add(cap, '#5a4434');
        rails[j].push(V(q.x, y + 0.72, q.z));
      }
    }
    for (const r of rails) for (let i = 0; i < r.length - 1; i++) { // sagging ropes between posts
      const a = r[i], b = r[i + 1], pp = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6; pp.push({ p: a.clone().lerp(b, t).add(V(0, -Math.sin(t * PI) * 0.14, 0)), r: 0.018 }); }
      B.add(tube(pp, 4, false), '#e2cc94');
    }
    // stringers under the planks
    for (const sx of [-1, 1]) for (const [a, b] of segs) { const sd = V(-(b.z - a.z), 0, b.x - a.x).normalize(); B.add(bar(a.clone().addScaledVector(sd, sx * w * 0.35).setY(y - 0.1), b.clone().addScaledVector(sd, sx * w * 0.35).setY(y - 0.1), 0.08, 0.01), '#6a5040'); }
  }, 0.01);
}
/** Tiny seaside torii standing in the shallows on a rock plinth, with a shimenawa and a pair of stone lanterns */
export function seaTorii(seed = 2) {
  return kitPiece(seed, B => {
    const base = G.cyl(1.35, 1.6, 0.5, 12); base.translate(0, 0.0, 0);
    B.add(base, (p, n, o) => { o.set('#8a8290').multiplyScalar(0.9 + 0.1 * clamp(n.y)); if (p.y < 0.1) o.lerp(col('#4e5260'), 0.6); if (n.y > 0.5) o.lerp(col('#b8b0a8'), 0.5); });
    B.at([0, 0.25, 0], 0, () => torii(B, { w: 2.1, h: 2.5, color: '#e8543a' }));
    B.at([0, 0, 0], 0, () => shimenawa(B, { w: 1.9, y: 1.95, sag: 0.16, z: 0.02, r: 0.05 }));
    for (const sx of [-1, 1]) B.at([sx * 1.05, 0.25, 0.75], 0, () => { const b = G.box(0.22, 0.4, 0.22, 0.03); b.translate(0, 0.2, 0); B.add(b, '#b8b0b4'); const top = G.cone(0.2, 0.18, 4); top.rotateY(PI / 4); top.translate(0, 0.49, 0); B.add(top, '#a8a0a8'); const lamp = G.box(0.12, 0.12, 0.12, 0.01); lamp.translate(0, 0.33, 0.06); B.glow(lamp, '#fff0c8', { flicker: 0.6 }); });
  }, 0.015);
}
/** The boss arena's gateway: two weathered driftwood posts on stone footings, a sagging shimenawa between them with
 *  paper streamers, and old glass fishing floats in rope nets hanging from each post. ~3.4 m wide, opening along local z. */
export function arenaGate(seed = 8) {
  return kitPiece(seed, B => {
    for (const sx of [-1, 1]) B.at([sx * 1.65, 0, 0], sx * 0.06, () => {
      const foot = G.cyl(0.46, 0.6, 0.34, 10); foot.translate(0, 0.12, 0);
      B.add(foot, (p, n, o) => { o.set('#8a8290').multiplyScalar(0.86 + 0.14 * clamp(n.y)); if (n.y > 0.6) o.lerp(col('#6f8a5a'), 0.35); });
      const post = G.cyl(0.15, 0.21, 3.2, 10); post.translate(0, 1.72, 0);
      B.add(post, (p, n, o) => { o.set('#b09a80').multiplyScalar(0.78 + 0.26 * Math.sin(p.y * 11 + Math.atan2(p.z, p.x) * 3) ** 2); if (p.y < 0.6) o.lerp(col('#5e6a58'), 0.5 * (1 - p.y / 0.6)); });
      const cap = G.cone(0.23, 0.26, 8); cap.translate(0, 3.44, 0); B.add(cap, '#7a6452');
      // two glass floats in rope nets, sea-green and amber, tied under the rope
      for (const [dy, dz, c] of [[2.25, 0.2, '#8fe0c8'], [1.85, 0.16, '#f0c070']]) {
        const f = G.sph(0.17, 12, 9); f.translate(sx * 0.02, dy, dz); B.add(f, (p, n, o) => o.set(c).multiplyScalar(0.8 + 0.35 * clamp(n.y * 0.6 + n.z * 0.5)));
        const netR = G.torus(0.17, 0.018, 5, 14); netR.rotateX(PI / 2); netR.translate(sx * 0.02, dy, dz); B.add(netR, '#d8c8a0');
      }
    });
    B.at([0, 0, 0], 0, () => shimenawa(B, { w: 3.2, y: 2.82, sag: 0.32, z: 0.05, r: 0.085 }));
  }, 0.015);
}
/** Meoto-iwa: the wedded rocks, two sea stacks joined by a great shimenawa rope with paper streamers. local x span. */
export function weddedRocks(seed = 4) {
  const a = seaStack(seed * 3 + 1, 4.6, 1.5), b = seaStack(seed * 3 + 2, 3.2, 1.15);
  a.rock.translate(-2.1, 0, 0); b.rock.translate(2.0, 0, 0.2); a.reed.translate(-2.1, 0, 0); b.reed.translate(2.0, 0, 0.2);
  const rope = kitPiece(seed, B => {
    const p0 = V(-1.05, 3.4, 0.05), p1 = V(1.05, 2.55, 0.25), pts = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; pts.push({ p: p0.clone().lerp(p1, t).add(V(0, -Math.sin(t * PI) * 0.55, 0)), r: 0.09 * (0.8 + Math.sin(t * PI) * 0.4) }); }
    B.add(tube(pts, 7, false), (p, n, o) => o.set('#ecd8a0').multiplyScalar(0.84 + 0.16 * Math.sin(p.x * 30 + p.y * 20)));
    for (let k = 1; k < 6; k++) {
      const t = k / 6, q = p0.clone().lerp(p1, t).add(V(0, -Math.sin(t * PI) * 0.55 - 0.1, 0));
      for (let j = 0; j < 3; j++) { const g = G.plane(0.1, 0.14, 1, 1); g.translate(q.x + (j % 2 ? 0.03 : -0.03), q.y - 0.07 - j * 0.12, q.z + 0.1); B.cloth(g, '#ffffff', { x0: q.x - 0.06, x1: q.x + 0.06, yTop: q.y, yBot: q.y - 0.4 }); }
    }
  }, 0);
  return { rock: merge([a.rock, b.rock]), reed: merge([a.reed, b.reed]), ...rope, tops: [V(-2.1, a.top, 0), V(2.0, b.top, 0.2)] };
}
/** The sea grotto mouth: a massive banded rock arch around a dark cave throat with stalactites, glowing moss and
 *  crystals; open toward local +z. ~9 m wide, 5.5 m tall. */
export function grottoMouth(seed = 9) {
  const r = mulberry32(seed * 13 + 1), parts = [];
  // the arch: a thick tube along a squashed semicircle, heavily lumped
  const pts = [];
  for (let k = 0; k <= 18; k++) { const t = k / 18, a = PI * t; pts.push({ p: V(-Math.cos(a) * 3.6, Math.sin(a) * 4.2 - 0.4, 0), r: 1.35 + 0.35 * Math.sin(t * PI * 3 + 1) + (t < 0.12 || t > 0.88 ? 0.5 : 0) }); }
  const arch = tube(pts, 14, false);
  const ap = arch.attributes.position;
  for (let i = 0; i < ap.count; i++) { const x = ap.getX(i), y = ap.getY(i), z = ap.getZ(i), k = 0.22 * nz(x * 0.9 + seed, y * 0.9 + z * 0.7) + 0.1 * nz(x * 2.3, z * 2.3 + y); ap.setXYZ(i, x * (1 + k * 0.2), y + k * 0.5, z * (1 + k)); }
  arch.computeVertexNormals();
  // flanking masses so the arch reads as part of a cliff, not a ring
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const g = lump(V(sx * (4.4 + k * 1.1), 0.6 + k * 0.4, -0.6 - k * 0.5), 1.7 - k * 0.2, { detail: 2, noise: 0.3, squash: 1.1 - k * 0.15, seed: seed * 11 + k + (sx > 0 ? 5 : 0) });
    parts.push(g);
  }
  const back = lump(V(0, 2.2, -3.2), 3.6, { detail: 2, noise: 0.25, squash: 0.9, seed: seed * 5 + 1, sx: 1.4 }); parts.push(back);
  const g = merge([arch, ...parts]);
  paintCoastRock(g, { wetTo: 0.6, seed, tilt: 0.05, top: 5, grass: true });
  // cave throat: a dark curved backdrop that glows faintly teal deep inside
  const throat = new THREE.SphereGeometry(3.1, 18, 10, 0, PI, 0, PI / 2); throat.rotateX(-PI / 2); throat.scale(1, 1.25, 0.9); throat.rotateX(PI / 2); throat.rotateY(PI);
  throat.translate(0, -0.2, -0.4);
  const tv = throat.index ? throat.toNonIndexed() : throat, tp = tv.attributes.position;
  for (let i = 0; i < tp.count; i += 3) { const x = tp.getX(i + 1), y = tp.getY(i + 1), z = tp.getZ(i + 1); tp.setXYZ(i + 1, tp.getX(i + 2), tp.getY(i + 2), tp.getZ(i + 2)); tp.setXYZ(i + 2, x, y, z); }
  tv.computeVertexNormals();
  const glow = [];
  paint(tv, (p, n, o) => { const d = clamp(Math.hypot(p.x / 3, (p.y - 1) / 3.5)); o.set('#0a2a3a').lerp(col('#1a6a78'), clamp(1 - d) * 0.8).lerp(col('#040c14'), clamp(-p.z / 3) * 0.3); });
  // uv (flicker 0, tint 1) so the hot material glows in the vertex colour
  const tuv = new Float32Array(tv.attributes.position.count * 2); for (let i = 0; i < tuv.length; i += 2) { tuv[i] = 0; tuv[i + 1] = 1; } tv.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  glow.push(tv);
  // stalactites hanging from the arch soffit, glowing moss and crystals at the throat
  const body = [];
  for (let k = 0; k < 11; k++) {
    const t = 0.2 + r() * 0.6, a = PI * t, x = -Math.cos(a) * 3.6 * 0.72, y = Math.sin(a) * 4.2 * 0.72 - 0.3;
    const s = G.cone(0.12 + r() * 0.1, 0.5 + r() * 0.7, 6); s.rotateX(PI); s.translate(x, y - 0.25, 0.3 + (r() - 0.5) * 0.8);
    paint(s, (p, n, o) => o.set('#a89c94').lerp(col('#d8ccc0'), clamp(n.y * 0.5 + 0.4))); body.push(s);
  }
  for (let k = 0; k < 14; k++) {
    const x = (r() - 0.5) * 5.4, z = -0.4 + (r() - 0.5) * 1.8, h = 0.22 + r() * 0.4;
    const cr = G.cone(0.07 + r() * 0.05, h, 5); cr.rotateZ((r() - 0.5) * 0.7); cr.rotateX((r() - 0.5) * 0.5); cr.translate(x, h / 2 - 0.05, z);
    const cc = pick(r, ['#6ff4ff', '#8affd8', '#b8a0ff']);
    paint(cr, (p, n, o) => o.set(cc)); const cu = new Float32Array(cr.index ? cr.index.count * 2 : cr.attributes.position.count * 2).fill(1);
    const crn = cr.index ? cr.toNonIndexed() : cr; const u2 = new Float32Array(crn.attributes.position.count * 2); for (let i = 0; i < u2.length; i += 2) { u2[i] = 0.3; u2[i + 1] = 1; } crn.setAttribute('uv', new THREE.BufferAttribute(u2, 2)); void cu;
    glow.push(crn);
  }
  return { rock: g, hot: merge(glow), body: merge(body), lights: [
    { pos: V(0, 1.2, 0.6), color: col('#6ff0ff'), intensity: 3.5, radius: 7, flicker: 0.2, nightOnly: false },
    { pos: V(-2.2, 0.6, 0.2), color: col('#8affd8'), intensity: 2, radius: 4.5, flicker: 0.3, nightOnly: false },
  ] };
}
/** Headland lookout: a weathered wooden deck-bench with a brass telescope on a tripod and a wind-sock */
export function lookout(seed = 6) {
  return kitPiece(seed, B => {
    const deck = G.box(2.2, 0.12, 1.6, 0.03); deck.translate(0, 0.18, 0); B.add(deck, (p, n, o) => o.set('#c89868').multiplyScalar(Math.abs(Math.sin(p.x * 14)) < 0.12 ? 0.8 : 1));
    for (const [x, z] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) { const l = G.cyl(0.06, 0.07, 0.3, 6); l.translate(x, 0.06, z); B.add(l, '#6a5040'); }
    for (const sx of [-1, 1]) { const rp = G.box(0.06, 0.8, 0.06, 0.01); rp.translate(sx * 1.05, 0.62, -0.75); B.add(rp, '#7a5e48'); }
    const rail = G.box(2.2, 0.06, 0.08, 0.01); rail.translate(0, 1.0, -0.75); B.add(rail, '#8a6a52');
    B.push([0.35, 0.24, -0.25], 0.5);
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.add(bar(V(0, 1.05, 0), V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), 0.03, 0), '#5a4434'); }
    const scope = G.cyl(0.05, 0.075, 0.75, 10); scope.rotateX(PI / 2 - 0.25); scope.translate(0, 1.12, -0.05); B.add(scope, C.bronze);
    const lens = G.cyl(0.08, 0.08, 0.05, 10); lens.rotateX(PI / 2 - 0.25); lens.translate(0, 1.2, -0.42); B.add(lens, '#e8c86a');
    B.pop();
    B.at([-0.6, 0.24, 0.2], 0, () => { const s = G.box(0.9, 0.06, 0.34, 0.02); s.translate(0, 0.38, 0); B.add(s, C.woodLight); for (const sx of [-1, 1]) { const l = G.box(0.06, 0.38, 0.3, 0.01); l.translate(sx * 0.36, 0.19, 0); B.add(l, C.woodDark); } });
    // wind sock on a pole
    B.at([-1.2, 0.24, -0.8], 0, () => {
      const p = G.cyl(0.03, 0.035, 2.4, 6); p.translate(0, 1.2, 0); B.add(p, '#e8e0d0');
      const sock = G.cyl(0.12, 0.05, 0.7, 10, true); sock.rotateZ(PI / 2); sock.translate(0.4, 2.25, 0);
      B.cloth(sock, (pp, n, o) => o.set(Math.floor((pp.x + 0.05) / 0.175) % 2 ? '#fff6ea' : '#e8503a'), { x0: 0.05, x1: 0.75, yTop: 2.4, yBot: 2.1 });
    });
  });
}
/** a lantern post on the trail (warm light, dusk), used sparingly on the coast */
export function shoreLamp(seed = 1) {
  return kitPiece(seed, B => { lanternPost(B, { h: 1.7, color: '#e8a040' }); B.light([0, 1.45, 0.34], { color: '#ffc080', intensity: 3, radius: 6, flicker: 0.6 }); });
}
/** scattered wet pebbles + shell hash for the waterline (flat material) */
export function pebbles(seed, n = 10, R = 0.8) {
  const r = mulberry32(seed * 3 + 2), parts = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R, s = 0.04 + r() * 0.07;
    const g = new THREE.IcosahedronGeometry(s, 0); g.scale(1.3, 0.5, 1); g.rotateY(r() * TAU); g.translate(Math.cos(a) * d, s * 0.2, Math.sin(a) * d);
    const c = col(pick(r, ['#8a8290', '#a8a0a8', '#6e6878', '#c8c0b8', '#b8a898']));
    paint(g, (p, nn, o) => o.copy(c).multiplyScalar(0.85 + 0.25 * clamp(nn.y)));
    parts.push(g);
  }
  return { stone: merge(parts) };
}
export const _unused = { puff, shade };
