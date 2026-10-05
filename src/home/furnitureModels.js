// Furniture models (docs/HOUSING.md §2): one builder per catalog id (src/home/furniture.js), in the Toybox-cozy
// style, built with the building kit's Builder (src/world/buildings/kit.js). See furnitureMesh.js for the local frame.
//  - x right, y up, +z = the item's front. Floor / rug / table items are centred on their footprint with y = 0 at their
//    base; ceiling items hang from y = def.h (the cord's top, a little ceiling plate) down to y = 0; wall items grow up
//    (+y) and out (+z, at most 0.22 m) from their bottom centre on the wall.
//  - Vertex colours only. Lamp shades / paper / glass floats go through B.glow (dim by day, bright at night; hot = fire),
//    water surfaces through the 'water' bucket, leaves / petals through 'leaf', hanging fabric through B.cloth.
//  - No B.anim / B.light: furnitureMesh ignores them (lights come from the catalog's `light` data).
import * as THREE from 'three';
import { G, V, PI, shade, mixc, col, bar } from '../world/buildings/kit.js';
import { tube, paint, mergeVertices, mergeGeometries, RoundedBox } from '../gfx/geom.js';
import { leafGeo, blossomGeo, faceColors, nz, mossStone } from '../world/buildings/props.js';
import { bow, bucket } from '../world/buildings/props2.js';
import { symbol, SYMBOLS } from '../world/buildings/symbols.js';
import { clamp, TAU } from '../core/util.js';
import { CELL } from './furniture.js';

// ------------------------------------------------------------------ palette (docs/ARCHITECTURE.md visual style guide)
const INK = '#3a2a30', GOLD = '#f4c04a', CREAM = '#fff6e8', PAPER = '#fffaf0', IRON = '#3e3a44', BLACK_LAC = '#40291f', LAC_RED = '#7a2e26';
const HONEY = '#d9a066', WOOD = '#c98f5e', WOOD_D = '#6b4a3a', WOOD_R = '#a86e42';
const SAKURA = '#ffbcd6', MINT = '#8fe0c0', SKY = '#8fd0ff', BUTTER = '#ffe08a', PEACH = '#ffc8a0';
const UP = V(0, 1, 0);

// ------------------------------------------------------------------ placement helpers (y = the part's BOTTOM)
const put = (B, g, x, y, z, c, k = 'body') => { g.translate(x, y, z); return B.add(g, c, k); };
const box = (B, w, h, d, r, x, y, z, c, k) => put(B, G.box(w, h, d, r), x, y + h / 2, z, c, k);
/** a rounded box that stays rounded even when thin (G.box drops the radius under 7.5 cm) */
function rbox(w, h, d, r) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return r > 0.002 ? new RoundedBox(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
}
const sbox = (B, w, h, d, r, x, y, z, c, k) => put(B, rbox(w, h, d, r), x, y + h / 2, z, c, k);
const cyl = (B, rt, rb, h, seg, x, y, z, c, k) => put(B, G.cyl(rt, rb, h, seg), x, y + h / 2, z, c, k);
/** sphere centred at (x, y, z), scaled by s (number | [sx, sy, sz]) */
function ball(B, r, x, y, z, c, s = 1, seg = 10, k) {
  const g = G.sph(r, seg, Math.max(4, Math.round(seg * 0.7)));
  if (s !== 1) g.scale(...(Array.isArray(s) ? s : [s, s, s]));
  return put(B, g, x, y, z, c, k);
}
const lathe = (B, pts, seg, x, y, z, c, k) => put(B, G.lathe(pts, seg), x, y, z, c, k);
/** a round rod from a to b (radius r0 at a, r1 at b) */
function pipe(B, a, b, r0, c, { r1 = r0, seg = 6, k } = {}) {
  const A = V(...a), d = V(...b).sub(A), L = d.length(), g = G.cyl(r1, r0, L, seg);
  g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); g.translate(A.x, A.y, A.z);
  return B.add(g, c, k);
}
/** a smooth tube through points (Catmull-Rom resampled to n points when n > 0); r: number | fn(t) */
function curve(B, pts, r, c, { radial = 6, cap = true, k, n = 0 } = {}) {
  let P = pts.map(p => V(...p));
  if (n) P = new THREE.CatmullRomCurve3(P).getPoints(n - 1);
  return B.add(tube(P.map((p, i) => ({ p, r: typeof r === 'function' ? r(i / (P.length - 1)) : r })), radial, cap), c, k);
}
const alignY = (g, dir) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
/** a flat shape geometry (XY plane, facing +z) translated to (x, y, z) */
const flat = (B, g, x, y, z, c, k) => put(B, g, x, y, z, c, k);
const ell = (rx, ry, seg = 16) => new THREE.CircleGeometry(1, seg).scale(rx, ry, 1);
/** a finely subdivided disc / ellipse (for decals bent onto curved surfaces) */
const ellD = (rx, ry, seg = 24, rings = 5) => new THREE.RingGeometry(0.0001, 1, seg, rings).scale(rx, ry, 1);

// ------------------------------------------------------------------ geometry helpers
function mergeG(list) {
  return mergeGeometries(list.map(g => {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }), false);
}
/** a two-sided copy (leaves and blades seen from both sides with back-face culling) */
function twoSided(g) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  const b = g.clone();
  for (const name of Object.keys(b.attributes)) {
    const a = b.attributes[name].array, s = b.attributes[name].itemSize;
    for (let i = 0; i < b.attributes[name].count; i += 3) for (let c = 0; c < s; c++) { const t = a[(i + 1) * s + c]; a[(i + 1) * s + c] = a[(i + 2) * s + c]; a[(i + 2) * s + c] = t; }
  }
  const n = b.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return mergeGeometries([g, b], false);
}
function geoOf(pos) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; }
const triP = (pos, a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

// height of a pillowGeo's top surface at planar "radius" e (0 centre .. 1 rim)
function pillowY(h, bot, edge, e) { const ht = h / (1 + bot), hb = h - ht; return hb + ht * Math.sqrt(Math.max(0, 1 - e ** 4)) * (1 - edge * e * e); }
/**
 * A puffy cushion / pillow / mattress: a squircle in plan (sq < 1 squarer, 1 round), domed top that thins toward the
 * rolled rim (edge), a flatter underside (bot = underside share). y from 0 to h, centred in x/z. Smooth (welded) normals.
 */
function pillowGeo(w, h, d, { sq = 0.32, edge = 0.45, bot = 0.3, ws = 16, hs = 10, dimple = 0 } = {}) {
  const g0 = new THREE.SphereGeometry(1, ws, hs); g0.deleteAttribute('uv'); g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-4), p = g.attributes.position;
  const ht = h / (1 + bot), hb = h - ht;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), e = Math.min(1, Math.hypot(x, z));
    let dx = 0, dz = 0;
    if (e > 1e-6) { const cx = x / e, cz = z / e; dx = Math.sign(cx) * Math.abs(cx) ** sq; dz = Math.sign(cz) * Math.abs(cz) ** sq; }
    const yy = y >= 0 ? ht * Math.sqrt(Math.max(0, 1 - e ** 4)) * (1 - edge * e * e) - dimple * Math.exp(-e * e / 0.03) : -hb * Math.sqrt(Math.max(0, 1 - e ** 6));
    p.setXYZ(i, dx * e * w / 2, yy + hb, dz * e * d / 2);
  }
  g.computeVertexNormals();
  return g;
}
/** planar point of a pillowGeo outline (squircle) at angle th and radius e, in metres */
function squircle(w, d, sq, th, e) {
  const cx = Math.cos(th), cz = Math.sin(th);
  return [Math.sign(cx) * Math.abs(cx) ** sq * e * w / 2, Math.sign(cz) * Math.abs(cz) ** sq * e * d / 2];
}
/**
 * A soft fabric sheet (duvet, cushion cover, mattress top): a W x D top whose edges roll over a rounded hem and hang
 * `drop` (cloth length past the edge). Optional quilting puffs (px x pz patches) and an overall bulge. Open underneath;
 * the top sits at y = 0. color(X, Z, top) per quad, with X/Z "unwrapped" (the skirt continues the top's coordinates).
 */
function softSheet(W, D, { drop = 0.08, nx = 8, nz = 6, sk = 3, puff = 0, px = 4, pz = 3, bulge = 0, roll = 0.55, color = () => '#ffffff' } = {}) {
  const R = drop * roll, arc = PI / 2 * R;
  const fold = (u, half) => {
    const s = Math.abs(u) - half; if (s <= 0) return [u, 0];
    const g = Math.sign(u);
    if (s <= arc) { const a = s / R; return [g * (half + R * Math.sin(a)), -R * (1 - Math.cos(a))]; }
    return [g * (half + R), -R - (s - arc)];
  };
  const axis = (n, half) => {
    const a = [];
    for (let i = 0; i <= sk; i++) a.push(-(half + drop) + drop * i / sk);
    for (let i = 1; i <= n; i++) a.push(-half + 2 * half * i / n);
    for (let i = 1; i <= sk; i++) a.push(half + drop * i / sk);
    return a;
  };
  const us = axis(nx, W / 2), vs = axis(nz, D / 2), nu = us.length, nv = vs.length, pos = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const [x, dyx] = fold(us[i], W / 2), [z, dyz] = fold(vs[j], D / 2);
    const fx = clamp((us[i] + W / 2) / W), fz = clamp((vs[j] + D / 2) / D);
    pos.push(x, dyx + dyz + puff * Math.sin(PI * fx * px) ** 2 * Math.sin(PI * fz * pz) ** 2 + bulge * (1 - (2 * fx - 1) ** 2) * (1 - (2 * fz - 1) ** 2), z);
  }
  const idx = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, c, b, b, c, d); }
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g = g.toNonIndexed();
  const cols = new Float32Array(g.attributes.position.count * 3), cc = new THREE.Color();
  let q = 0;
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++, q++) {
    const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
    cc.set(color(uc, vc, Math.abs(uc) < W / 2 && Math.abs(vc) < D / 2));
    for (let k = 0; k < 6; k++) cols.set([cc.r, cc.g, cc.b], (q * 6 + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
/** a glazed tile: flat top, bevelled edges (c), straight sides; y from 0 to h, no bottom. Flat normals (crisp bevels). */
function tileGeo(w, d, h, c) {
  const O = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]], I = O.map(([x, z]) => [x - Math.sign(x) * c, z - Math.sign(z) * c]);
  const pos = [], q = (a, b, cc, dd) => { triP(pos, a, b, cc); triP(pos, a, cc, dd); };
  const P = (xz, y) => V(xz[0], y, xz[1]);
  q(P(I[0], h), P(I[1], h), P(I[2], h), P(I[3], h));
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    q(P(O[k], h - c), P(O[k1], h - c), P(I[k1], h), P(I[k], h));
    q(P(O[k], 0), P(O[k1], 0), P(O[k1], h - c), P(O[k], h - c));
  }
  return geoOf(pos);
}
/** a strip along 2D points (XY plane, facing +z), width w (number | fn(t)), round caps */
function ribbon(pts, w, { caps = true, seg = 6 } = {}) {
  const n = pts.length, L = [], R = [], pos = [], ws = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const hw = (typeof w === 'function' ? w(i / (n - 1)) : w) / 2; ws.push(hw);
    L.push([pts[i][0] - ty * hw, pts[i][1] + tx * hw]); R.push([pts[i][0] + ty * hw, pts[i][1] - tx * hw]);
  }
  for (let i = 0; i < n - 1; i++) pos.push(...L[i], 0, ...R[i], 0, ...R[i + 1], 0, ...L[i], 0, ...R[i + 1], 0, ...L[i + 1], 0);
  const parts = [geoOf(pos)];
  if (caps) for (const i of [0, n - 1]) if (ws[i] > 0.0015) parts.push(new THREE.CircleGeometry(ws[i], seg).translate(pts[i][0], pts[i][1], 0));
  return mergeG(parts);
}
const spline2 = (pts, n) => new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(n - 1).map(v => [v.x, v.y]);
/** r(y) along a lathe profile's outer contour [[r, y], ...] (y increasing) */
const profR = prof => y => {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (y1 !== y0 && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return y < prof[0][1] ? prof[0][0] : prof[prof.length - 1][0];
};
/** bend a flat decal (XY plane: x = arc length around, y = height, z = layer offset) onto a lathe surface r = Rf(y),
 *  centred at azimuth ang (0 = +z, the front) */
function wrapLathe(g, Rf, ang = 0, off = 0.0015) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), r0 = Math.max(0.01, Rf(y)), R = r0 + off + p.getZ(i), a = ang + p.getX(i) / r0;
    p.setXYZ(i, R * Math.sin(a), y, R * Math.cos(a)); n.set([Math.sin(a), 0, Math.cos(a)], i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}
/** surface point + normal of a lathe profile at parameter t (0..1 along the points) and azimuth a (0 = +z) */
function onProfile(prof, t, a) {
  const f = clamp(t) * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), u = f - i;
  const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], r = r0 + (r1 - r0) * u, y = y0 + (y1 - y0) * u;
  const tr = r1 - r0, ty = y1 - y0, l = Math.hypot(tr, ty) || 1; // outward normal of the profile edge: (ty, -tr)
  const nr = ty / l, ny = -tr / l;
  return { p: V(r * Math.sin(a), y, r * Math.cos(a)), n: V(nr * Math.sin(a), ny, nr * Math.cos(a)).normalize() };
}
/** an arching fern frond along +z (spine in the y-z plane rising at el0 and drooping to el1), leaflets along ±x */
function frondGeo(L, { el0 = 1.35, el1 = 0.1, W = 0.065, n = 9, seg = 8 } = {}) {
  const sp = [V()]; let y = 0, z = 0;
  for (let i = 0; i < seg; i++) { const t = (i + 0.5) / seg, el = el0 + (el1 - el0) * t ** 1.4; y += Math.sin(el) * L / seg; z += Math.cos(el) * L / seg; sp.push(V(0, y, z)); }
  const at = t => { const f = clamp(t) * seg, i = Math.min(seg - 1, Math.floor(f)); return sp[i].clone().lerp(sp[i + 1], f - i); };
  const pos = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2;
    const w = W * Math.sin(PI * Math.min(1, 0.12 + tm * 0.9)) ** 0.65, p0 = at(t0), p1 = at(t1);
    const dir = p1.clone().sub(p0).normalize();
    for (const s of [-1, 1]) {
      const tip = at(tm + 0.55 / n).add(V(s * w, w * 0.22, 0)).addScaledVector(dir, w * 0.2);
      const mid = at(tm).add(V(s * w * 0.5, w * 0.18, 0));
      triP(pos, p0, mid, tip); triP(pos, p0, tip, p1);
    }
  }
  const e = at(1), b = at(1 - 0.6 / n); triP(pos, b, e.clone().add(V(0.012, 0, 0)), e.clone().addScaledVector(e.clone().sub(b).normalize(), 0.03));
  return twoSided(geoOf(pos));
}
/** a strap leaf rising along +y and curling toward +z by `bend` radians, width along x, pointed tip, folded midrib */
function bladeGeo(L, W, { bend = 0.6, seg = 5, fold = 0.22, base = 0.45 } = {}) {
  const rows = []; let y = 0, z = 0;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = bend * t ** 1.5;
    if (i > 0) { const am = bend * ((i - 0.5) / seg) ** 1.5; y += Math.cos(am) * L / seg; z += Math.sin(am) * L / seg; }
    const w = W * (base + (1 - base) * Math.sin(Math.min(1, t * 1.6) * PI / 2)) * (1 - t ** 2.2);
    const c = V(0, y, z), nrm = V(0, -Math.sin(a), Math.cos(a));
    rows.push([c.clone().add(V(-w / 2, 0, 0)), c.clone().addScaledVector(nrm, fold * w), c.clone().add(V(w / 2, 0, 0))]);
  }
  const pos = [];
  for (let i = 0; i < seg; i++) {
    const [l0, m0, r0] = rows[i], [l1, m1, r1] = rows[i + 1];
    triP(pos, l0, m0, l1); triP(pos, m0, m1, l1); triP(pos, m0, r0, m1); triP(pos, r0, r1, m1);
  }
  return twoSided(geoOf(pos));
}
/** a plump succulent leaf from the origin along +z (width W, thickness T), tip curling up */
function fatLeafGeo(L, W, T, curl = 0.18) {
  const g = G.sph(1, 6, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (y + 1) / 2;
    const k = u < 0.5 ? 0.72 + 0.56 * u : 1 - ((u - 0.5) / 0.5) ** 1.8 * 0.85;
    p.setXYZ(i, x * W / 2 * k, u * L, z * T / 2 * k - curl * u * u * L);
  }
  g.computeVertexNormals(); g.rotateX(PI / 2);
  return g;
}
function heartPath(sc = 1, ox = 0, oy = 0, P = new THREE.Shape()) {
  const Q = (x, y) => [ox + x * sc, oy + y * sc];
  P.moveTo(...Q(0, -0.36));
  P.bezierCurveTo(...Q(-0.12, -0.24), ...Q(-0.46, -0.04), ...Q(-0.46, 0.13));
  P.bezierCurveTo(...Q(-0.46, 0.36), ...Q(-0.2, 0.44), ...Q(0, 0.22));
  P.bezierCurveTo(...Q(0.2, 0.44), ...Q(0.46, 0.36), ...Q(0.46, 0.13));
  P.bezierCurveTo(...Q(0.46, -0.04), ...Q(0.12, -0.24), ...Q(0, -0.36));
  return P;
}
function roundRect(w, h, r, cx = 0, cy = 0, P = new THREE.Shape()) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  P.moveTo(x0 + r, y0); P.lineTo(x1 - r, y0); P.quadraticCurveTo(x1, y0, x1, y0 + r); P.lineTo(x1, y1 - r);
  P.quadraticCurveTo(x1, y1, x1 - r, y1); P.lineTo(x0 + r, y1); P.quadraticCurveTo(x0, y1, x0, y1 - r); P.lineTo(x0, y0 + r);
  P.quadraticCurveTo(x0, y0, x0 + r, y0);
  return P;
}
function archShape(w, h) { const s = new THREE.Shape(), r = w / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, PI, false); s.lineTo(-r, 0); return s; }
/** extrude shapes (XY plane) along +z with a soft bevel; z from 0 to depth + 2*bevel (the outline grows by bevel) */
function extrude(shapes, depth, bevel = 0.006, curve = 6, bevelSeg = 1) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: curve });
  g.translate(0, 0, bevel); g.deleteAttribute('uv');
  return g;
}
/** clip a flat triangle soup (any orientation) to x0 <= x <= x1 (Sutherland-Hodgman per triangle); null when empty */
function clipGeoX(g, x0, x1) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, out = [];
  const cut = (pts, inside, x) => {
    const o = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
      if (ia) o.push(a);
      if (ia !== ib) { const t = (x - a[0]) / (b[0] - a[0]); o.push([x, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    return o;
  };
  for (let i = 0; i < p.count; i += 3) {
    let poly = [0, 1, 2].map(k => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]);
    poly = cut(poly, q => q[0] >= x0, x0); if (poly.length < 3) continue;
    poly = cut(poly, q => q[0] <= x1, x1);
    for (let k = 1; k + 1 < poly.length; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
  }
  return out.length ? geoOf(out) : null;
}
/** mitsudomoe crest (three swirling commas), flat in XY facing +z, radius R */
function tomoeGeo(R) {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const a0 = k * TAU / 3 + 0.4, rh = 0.25 * R, rc = 0.36 * R;
    parts.push(new THREE.CircleGeometry(rh, 14).translate(Math.cos(a0) * rc, Math.sin(a0) * rc, 0));
    const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = a0 - t * 2.25, r = rc + (0.8 * R - rc) * Math.sqrt(t); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    parts.push(ribbon(pts, t => 2 * rh * (1 - t) ** 1.15 + 0.002, { caps: false }));
  }
  return mergeG(parts);
}
/** a stroke (ribbon) through smoothed points, scaled by s and offset (for painted characters / pictures) */
const stroke = (pts, w, s = 1, ox = 0, oy = 0, n = 0) => ribbon((n ? spline2(pts, n) : pts).map(([x, y]) => [ox + x * s, oy + y * s]), typeof w === 'function' ? t => w(t) * s : w * s);
/** colour a LatheGeometry per quad: fn(i = segment around, j = profile step, out, centroid) (keeps smooth normals) */
function quadPaint(g, np, fn) {
  const ng = g.toNonIndexed(), p = ng.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), ctr = new THREE.Vector3();
  for (let t = 0; t < p.count / 3; t++) {
    const q = t >> 1, i = Math.floor(q / (np - 1)), j = q % (np - 1);
    ctr.set(0, 0, 0); for (let k = 0; k < 3; k++) { ctr.x += p.getX(t * 3 + k) / 3; ctr.y += p.getY(t * 3 + k) / 3; ctr.z += p.getZ(t * 3 + k) / 3; }
    fn(i, j, c, ctr);
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (t * 3 + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return ng;
}
const tone = (c, k) => shade(c, k);

// ------------------------------------------------------------------ shared small pieces
/** a flat painted symbol (all its layers as flat shapes, facing +z; cheaper than an extruded symbol) */
function decal(B, name, size, x, y, z, { colors, k = 'body' } = {}) {
  (SYMBOLS[name] || SYMBOLS.star)().forEach((L, i) => {
    const g = new THREE.ShapeGeometry(L.shapes, 4); g.scale(size, size, 1); g.translate(x, y, z + i * 0.0008 + (L.z ?? 0) * 0.002);
    B.add(g, colors?.[i] || L.color, k);
  });
}
/** a flat (extruded) symbol lying on a surface facing +y, its top toward -z */
function symbolUp(B, name, size, x, y, z, { depth = 0.12, colors, ry = 0 } = {}) {
  B.at([x, y, z], ry, () => symbol(B, name, size, { depth, colors }), 1, -PI / 2);
}
/** zabuton-style square cushion: puffy, tufted button, corner tassels, optional stitching */
function cushion(B, color, { w = 0.44, h = 0.13, button = shade(color, 0.8), tassel = null, stitch = null } = {}) {
  const sq = 0.28, edge = 0.4, bot = 0.32, dim = 0.016;
  B.add(pillowGeo(w, h, w, { sq, edge, bot, dimple: dim, ws: 20, hs: 10 }), (p, n, o) => o.set(color).multiplyScalar(0.9 + 0.13 * clamp(n.y)));
  ball(B, 0.024, 0, pillowY(h, bot, edge, 0) - dim + 0.004, 0, button, [1, 0.5, 1], 10);
  if (stitch) {
    const e = 0.76, N = 36;
    for (let k = 0; k < N; k += 2) {
      const [x0, z0] = squircle(w, w, sq, k / N * TAU, e), [x1, z1] = squircle(w, w, sq, (k + 1) / N * TAU, e);
      const L = Math.hypot(x1 - x0, z1 - z0), g = G.box(L * 0.8, 0.005, 0.006, 0);
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      put(B, g, (x0 + x1) / 2, pillowY(h, bot, edge, e) + 0.0015, (z0 + z1) / 2, stitch);
    }
  }
  if (tassel) for (let k = 0; k < 4; k++) {
    const th = PI / 4 + k * PI / 2, [x, z] = squircle(w, w, sq, th, 1), dx = Math.cos(th), dz = Math.sin(th);
    ball(B, 0.016, x + dx * 0.004, h * bot / (1 + bot), z + dz * 0.004, tassel, 1, 6);
    const t = G.cone(0.014, 0.045, 5); alignY(t, V(-dx * 0.6, 1, -dz * 0.6)); put(B, t, x + dx * 0.022, h * bot / (1 + bot) - 0.012, z + dz * 0.022, tassel);
  }
}
/** a book lying flat (length w along x, thickness h, depth d), spine along +z: covers, cream pages, gold bands */
function bookFlat(B, w, h, d, c, { band = GOLD } = {}) {
  box(B, w, 0.007, d, 0, 0, 0, 0, c); box(B, w, 0.007, d, 0, 0, h - 0.007, 0, c);
  box(B, w - 0.012, h - 0.012, d - 0.012, 0, -0.002, 0.006, -0.004, '#fff4e0');
  const sp = new THREE.CylinderGeometry(h / 2, h / 2, w, 8, 1, false, 0, PI); sp.rotateZ(PI / 2); sp.rotateX(-PI / 2);
  put(B, sp, 0, h / 2, d / 2 - 0.006, c);
  for (const s of [-0.3, 0.3]) { const b = new THREE.CylinderGeometry(h / 2 + 0.0015, h / 2 + 0.0015, 0.01, 8, 1, true, 0, PI); b.rotateZ(PI / 2); b.rotateX(-PI / 2); put(B, b, s * w, h / 2, d / 2 - 0.006, band); }
}
/** a book standing in a shelf: spine (+z) colour with a band, cream top edges */
function bookStand(B, t, h, d, c, x, y, z, { lean = 0, band = null } = {}) {
  B.at([x, y, z], 0, () => {
    const g = faceColors(G.box(t, h, d, 0), (p, n, o) => o.set(n.y > 0.5 ? '#fff4e0' : Math.abs(n.x) > 0.5 ? shade(c, 0.86) : c));
    put(B, g, 0, h / 2, 0, null);
    if (band) { box(B, t + 0.002, 0.012, 0.004, 0, 0, h * 0.74, d / 2, band); box(B, t + 0.002, 0.008, 0.004, 0, 0, h * 0.18, d / 2, band); }
  }, 1, 0, lean);
}
/** jam jar with a gingham cloth cap tied with string (local, base at origin) */
function jamJar(B, jam, gingham, s = 1) {
  B.push([0, 0, 0], 0, s);
  const prof = [[0.001, 0], [0.044, 0], [0.05, 0.01], [0.05, 0.085], [0.043, 0.095], [0.04, 0.104], [0.001, 0.104]];
  lathe(B, prof, 14, 0, 0, 0, (p, n, o) => { o.set(p.y < 0.08 ? jam : '#e6f2f2'); if (p.y > 0.06 && p.y < 0.085) o.lerp(col('#ffffff'), 0.25); });
  put(B, G.cyl(0.0508, 0.0508, 0.03, 14, true), 0, 0.048, 0, CREAM);
  ball(B, 0.009, 0, 0.048, 0.052, jam, [1, 1, 0.4], 6);
  const capP = [[0.066, 0.078], [0.063, 0.09], [0.056, 0.104], [0.044, 0.116], [0.026, 0.124], [0.001, 0.126]];
  B.add(quadPaint(G.lathe(capP, 16), capP.length, (i, j, o) => o.set((i + j) % 2 ? gingham : '#fffaf2')), null);
  const tie = G.torus(0.047, 0.004, 3, 14); tie.rotateX(PI / 2); put(B, tie, 0, 0.1, 0, '#f0e0c0');
  B.pop();
}
/** heart-shaped leaf (flat, two-sided) for trailing plants; tip at the origin pointing -y, blade toward +y */
function heartLeafGeo(s) { const g = new THREE.ShapeGeometry(heartPath(s, 0, 0.36 * s), 3); g.rotateZ(PI); return twoSided(g); }
/** a tulip head (cup with three pointed petals and three inner petals), base at the origin, along +y */
function tulipHead(B, c, k = 'leaf') {
  for (const [s, rot, cc, seg] of [[1, 0, c, 9], [0.82, PI / 3, shade(c, 0.86), 6]]) {
    const g = G.lathe([[0.001, -0.004], [0.016 * s, 0], [0.024 * s, 0.016], [0.025 * s, 0.032], [0.018 * s, 0.047]], seg);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y <= 0.02) continue;
      const a = Math.atan2(p.getX(i), p.getZ(i)) + rot, t = (y - 0.02) / 0.027, l = Math.cos(3 * a);
      p.setX(i, p.getX(i) * (1 + 0.14 * t * l)); p.setZ(i, p.getZ(i) * (1 + 0.14 * t * l)); p.setY(i, y + 0.012 * t * l);
    }
    g.computeVertexNormals();
    const c0 = col(cc), c1 = col(cc).lerp(col('#fff4f8'), 0.45);
    B.add(g, (pp, n, o) => o.copy(c0).lerp(c1, clamp(pp.y / 0.05)), k);
  }
  ball(B, 0.008, 0, 0.03, 0, '#ffd84a', 1, 6, k);
}
/** spotted toadstool lamp body (stem + cap glow), scale s; base at the origin */
function toadstool(B, s, capCol, nSpots = 11) {
  B.push([0, 0, 0], 0, s);
  const big = s > 0.6, stem = G.lathe([[0.001, 0], [0.06, 0], [0.066, 0.022], [0.058, 0.08], [0.05, 0.14], [0.046, 0.185], [0.001, 0.185]], big ? 12 : 8);
  B.glow(stem, (p, n, o) => o.set('#fff1dc').multiplyScalar(0.94 + 0.08 * clamp(n.y + 0.5)), { flicker: 0.15, tint: 0.35 });
  const prof = [[0.001, 0.172], [0.07, 0.177], [0.14, 0.187], [0.165, 0.204], [0.168, 0.222], [0.155, 0.257], [0.12, 0.297], [0.07, 0.324], [0.001, 0.334]];
  const cap0 = col(capCol), cap1 = col(capCol).lerp(col('#ffd0b8'), 0.35);
  B.glow(G.lathe(prof, big ? 18 : 10), (p, n, o) => { if (p.y < 0.2 && n.y < 0.2) o.set('#ffe2d4'); else o.copy(cap0).lerp(cap1, clamp((p.y - 0.2) / 0.13)); }, { flicker: 0.15, tint: 0.55 });
  const spots = [[0.45, 0.2], [0.5, 1.4], [0.42, 2.6], [0.55, 3.7], [0.48, 4.9], [0.72, 0.8], [0.7, 2.0], [0.75, 3.2], [0.68, 4.3], [0.74, 5.6], [0.92, 1.5]];
  for (const [t, a] of spots.slice(0, nSpots)) {
    const { p, n } = onProfile(prof.slice(4), t, a), r = 0.019 + 0.006 * Math.sin(a * 3);
    const g = G.sph(1, 6, 3); g.scale(r, r * 0.28, r); alignY(g, n); g.translate(p.x, p.y, p.z);
    B.glow(g, '#fff8f0', { tint: 0.35 });
  }
  B.pop();
}
/** a pine cone weight / ornament: scaled lathe with scale rows, base at the origin, along +y */
function pineCone(B, h, r) {
  const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([Math.max(0.001, r * Math.sin(PI * (0.08 + 0.92 * t)) ** 0.8 * (1 - 0.4 * t) * (k % 2 ? 1.12 : 1)), t * h]); }
  B.add(faceColors(G.lathe(pts, 10), (p, n, o, c) => { const a = Math.floor(((Math.atan2(c.z, c.x) / TAU + 1) % 1) * 10), row = Math.floor(c.y / h * 8); o.set((a + row) % 2 ? '#b8804a' : '#8a5a36').multiplyScalar(0.9 + 0.15 * clamp(n.y + 0.4)); }), null);
}

// ------------------------------------------------------------------ shared pieces, phase 2
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** weld a lathe / sphere (no seam crease after a deformation): drops uv + normal, merges coincident vertices */
function weld(g) { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return mergeVertices(g, 1e-5); }
/** a rounded beam between two points (w across, t deep; stays rounded when thin, unlike kit bar()) */
function rbar(a, b, w, t, r = 0.01) {
  const A = V(...a), Bv = V(...b), dl = Bv.clone().sub(A), L = dl.length(), g = G.beam(w, t, Math.max(L, w * 1.01, t * 1.01), r);
  g.applyMatrix4(new THREE.Matrix4().lookAt(A, Bv, Math.abs(dl.y) > 0.99 * L ? V(1, 0, 0) : V(0, 1, 0)));
  return g.translate((A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
}
/** a short two-ply twisted cord hanging straight down at (x, z) from yTop to yBot (helix stripes of c1 / c2) */
function twistCord(B, x, z, yTop, yBot, r, c1, c2) {
  const L = yTop - yBot, g = new THREE.CylinderGeometry(r, r, L, 6, Math.max(1, Math.round(L / 0.008)), true);
  g.translate(x, yBot + L / 2, z);
  B.add(faceColors(g, (p, n, o, c) => o.set((((Math.floor(c.y / 0.009 + Math.atan2(c.x - x, c.z - z) / PI * 2) % 2) + 2) % 2) ? c1 : c2)), null);
}
/**
 * A ceiling rose for a hanging lamp (its top at y = top): a turned wooden plate with a bead and a boss, a screw eye,
 * the cord looped through the eye and tied off in a fat knot with a short tail. Returns the y where the cord continues.
 */
function ceilingRose(B, top, { wood = '#b8804e', cord = '#e8403a', cord2 = '#fff6ea', metal = GOLD } = {}) {
  const prof = [[0.001, top - 0.052], [0.013, top - 0.051], [0.024, top - 0.047], [0.032, top - 0.04], [0.035, top - 0.033], [0.041, top - 0.03], [0.05, top - 0.028], [0.055, top - 0.022], [0.056, top - 0.012], [0.053, top - 0.004], [0.046, top], [0.001, top]];
  const w0 = col(wood), wL = col(wood).lerp(col('#ffe6c0'), 0.3), wD = col(wood).multiplyScalar(0.62);
  lathe(B, prof, 20, 0, 0, 0, (p, n, o) => {
    o.copy(w0).lerp(wL, clamp(Math.abs(n.x) + Math.abs(n.z) - 0.55) * 0.55).multiplyScalar(n.y < -0.5 ? 0.86 : 1);
    if (p.y > top - 0.001 && n.y > 0.8) o.copy(w0).multiplyScalar(0.8);
    if (p.y > top - 0.031 && p.y < top - 0.027) o.copy(wD);
  });
  { const r = G.torus(0.0545, 0.0028, 3, 20); r.rotateX(PI / 2); put(B, r, 0, top - 0.017, 0, metal); }
  const yE = top - 0.07, yK = top - 0.108;
  cyl(B, 0.0035, 0.0035, 0.01, 5, 0, top - 0.06, 0, metal);
  put(B, G.torus(0.0115, 0.0035, 4, 12), 0, yE, 0, metal);
  for (const s of [-1, 1]) curve(B, [[s * 0.003, yE - 0.0105, 0], [s * 0.0075, yE - 0.024, s * 0.002], [s * 0.0045, yK + 0.007, 0]], 0.0042, cord, { radial: 5, n: 5 });
  ball(B, 0.0118, 0, yK, 0, cord, [1.15, 0.85, 1.05], 8);
  const wrap = G.torus(0.0098, 0.0042, 4, 10); wrap.rotateX(PI / 2 - 0.45); put(B, wrap, 0, yK + 0.002, 0, cord2);
  curve(B, [[0.006, yK - 0.004, 0.006], [0.013, yK - 0.018, 0.01], [0.015, yK - 0.033, 0.012]], t => 0.0042 - t * 0.0014, cord, { radial: 5, n: 4 });
  return yK - 0.006;
}
/** maple leaf outline radius (unit leaf: the top lobe's tip at r = 1; th = 0 toward the tip, polar origin at the base) */
const MAPLE_LOBES = [[0, 1.0, 0.43], [0.93, 0.92, 0.41], [-0.93, 0.92, 0.41], [1.83, 0.64, 0.37], [-1.83, 0.64, 0.37], [2.52, 0.33, 0.28], [-2.52, 0.33, 0.28]];
function mapleR(th, lobes = MAPLE_LOBES, r0 = 0.34, k1 = 1.3, k2 = 1.05) {
  let r = r0;
  for (const [a, L, w] of lobes) { let u = Math.abs(th - a); u = Math.min(u, TAU - u) / w; if (u < 1) r = Math.max(r, L * (1 - u ** k1) ** k2); }
  return r;
}
/** a chubbier maple leaf for felt cut-outs (fat lobes, softly rounded tips) */
const MAPLE_FAT = [[0, 1.0, 0.54], [0.98, 0.9, 0.52], [-0.98, 0.9, 0.52], [1.9, 0.68, 0.48], [-1.9, 0.68, 0.48], [2.56, 0.44, 0.38], [-2.56, 0.44, 0.38]];
const mapleFat = th => mapleR(th, MAPLE_FAT, 0.4, 1.6, 0.75);
/**
 * A soft felt slab cut to a star-shaped outline Rf(th) (metres; th = 0 toward the leaf tip, polar origin at the base),
 * laid out by place(u, v) -> [x, z]: a flat top at h with a rolled, rounded edge, raised by lift(x, z) (to drape over
 * another slab). color(s, x, z, out): s = 0 at the origin .. 1 at the top's edge, 1..2 down the roll. Smooth normals.
 */
function feltSlab(Rf, place, { N = 128, K = 4, M = 3, h = 0.02, lift = () => 0, color }) {
  const P = [];
  for (let i = 0; i < N; i++) { const t = i / N * TAU - PI, r = Rf(t); P.push(place(Math.sin(t) * r, Math.cos(t) * r)); }
  let area = 0; for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = Math.sign(area), O = place(0, 0), rho = h / 2, pos = [], cols = [], c = new THREE.Color();
  const vert = (x, z, y, s) => { pos.push(x, y + lift(x, z), z); color(s, x, z, c); cols.push(c.r, c.g, c.b); };
  vert(O[0], O[1], h, 0);
  for (let i = 0; i < N; i++) {
    const a = P[(i + N - 1) % N], b = P[(i + 1) % N], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const nx = sg * tz / l, nzz = -sg * tx / l, q = [P[i][0] - nx * rho, P[i][1] - nzz * rho];
    for (let k = 1; k <= K; k++) { const s = k / K; vert(O[0] + (q[0] - O[0]) * s, O[1] + (q[1] - O[1]) * s, h, s); }
    for (let m = 1; m <= M; m++) { const f = m / M * PI * 0.94; vert(q[0] + nx * rho * Math.sin(f), q[1] + nzz * rho * Math.sin(f), rho + rho * Math.cos(f), 1 + m / M); }
  }
  const R = K + M, idx = [];
  for (let i = 0; i < N; i++) {
    const a = 1 + i * R, b = 1 + ((i + 1) % N) * R;
    idx.push(0, a, b);
    for (let k = 0; k < R - 1; k++) idx.push(a + k, a + k + 1, b + k, b + k, a + k + 1, b + k + 1);
  }
  const v = i => V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), f0 = v(idx[1]).sub(v(0)).cross(v(idx[2]).sub(v(0)));
  if (f0.y < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** push a triangle wound so its normal points up (+y) */
function upTri(pos, a, b, c) { if (b.clone().sub(a).cross(c.clone().sub(a)).y >= 0) triP(pos, a, b, c); else triP(pos, a, c, b); }
/** raised running stitches (low four-facet lozenges) along a 2D path [[x, z], ...] on a surface of height yf(x, z) */
function stitchRun(out, pts, yf, { dash = 0.026, gap = 0.015, w = 0.009, t = 0.0035, skip = null } = {}) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = s => { let i = 1; while (i < pts.length - 1 && L[i] < s) i++; const u = clamp((s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1])); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; };
  const tot = L[L.length - 1], n = Math.max(1, Math.floor((tot + gap) / (dash + gap))), off = Math.max(0, (tot - (n * (dash + gap) - gap)) / 2);
  for (let k = 0; k < n; k++) {
    const s0 = off + k * (dash + gap), a = at(s0), b = at(s0 + dash), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (skip && skip(m[0], m[1])) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nzz = dx / l * w / 2, y = yf(m[0], m[1]);
    const A = V(a[0], y, a[1]), Bv = V(b[0], y, b[1]), Lp = V(m[0] + nx, y, m[1] + nzz), Rp = V(m[0] - nx, y, m[1] - nzz), T = V(m[0], y + t, m[1]);
    upTri(out, A, Lp, T); upTri(out, A, T, Rp); upTri(out, T, Lp, Bv); upTri(out, T, Bv, Rp);
  }
}
/** a lucky-bamboo stalk along +y: plump internodes, swollen node rings (dark band, a waxy pale ring under each node), a
 *  domed tip; painted, smooth */
function bambooStalkGeo(L, r, nodes, { c0 = '#6eb04c', c1 = '#a8d468', node = '#4f8a3a', wax = '#d8eebc', seg = 9 } = {}) {
  const dy = L / nodes, pts = [[0.001, 0], [r * 0.96, 0]];
  for (let i = 0; i < nodes; i++) { const y = i * dy; pts.push([r, y + 0.012], [r * 0.955, y + dy * 0.5], [r * 1.0, y + dy - 0.016], [r * 1.15, y + dy - 0.003], [r * 1.07, y + dy + 0.007]); }
  pts.push([r * 0.86, L + 0.02], [r * 0.45, L + 0.03], [0.001, L + 0.032]);
  const g = G.lathe(pts, seg), C0 = col(c0), C1 = col(c1), CN = col(node), CW = col(wax);
  return paint(g, (p, n, o) => {
    const rr = Math.hypot(p.x, p.z), f = (p.y % dy) / dy, a = Math.atan2(p.x, p.z);
    o.copy(C0).lerp(C1, clamp(p.y / L) * 0.55 + (1 - f) * 0.15).multiplyScalar(0.92 + 0.07 * Math.sin(a * 3 + p.y * 9) + 0.06 * clamp(n.x * 0.5 + n.z * 0.5));
    if (f > 0.84 && f < 0.94 && rr < r * 1.02) o.lerp(CW, 0.55);
    if (rr > r * 1.06) o.copy(CN).lerp(C1, 0.15);
  });
}
/** a slender strap leaf (cheap: no midrib fold) rising along +y and curling toward +z by bend, width W, two-sided */
function strapLeafGeo(L, W, bend = 0.9, seg = 3) {
  const pos = [], rows = []; let y = 0, z = 0;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    if (i > 0) { const am = bend * ((i - 0.5) / seg) ** 1.5; y += Math.cos(am) * L / seg; z += Math.sin(am) * L / seg; }
    const w = W * (0.25 + 0.75 * Math.sin(Math.min(1, t * 1.7) * PI / 2)) * (1 - t ** 2.2) / 2;
    rows.push([V(-w, y, z), V(w, y, z)]);
  }
  for (let i = 0; i < seg; i++) { const [a, b] = rows[i], [c, d] = rows[i + 1]; triP(pos, a, b, c); triP(pos, b, d, c); }
  return twoSided(geoOf(pos));
}
/** a spray of slender bamboo leaves: a twig from base along azimuth az, leaves fanned (spread) and arching down */
function bambooSpray(B, base, az, { n = 6, L = 0.2, W = 0.05, up = 0.05, out = 0.08, spread = 1.0, tilt = [0.8, 1.3], seg = 3, cols = ['#4f9e44', '#5aae4a', '#68b850', '#46923e'] } = {}) {
  const tip = [base[0] + Math.sin(az) * out, base[1] + up, base[2] + Math.cos(az) * out];
  if (out > 0.045) curve(B, [base, [base[0] + Math.sin(az) * out * 0.5, base[1] + up * 0.8, base[2] + Math.cos(az) * out * 0.5], tip], t => 0.0065 - t * 0.0025, '#5c9a3c', { radial: 3, n: 4, k: 'leaf' });
  for (let j = 0; j < n; j++) {
    const ll = L * B.rand(0.8, 1.08), g = strapLeafGeo(ll, W * B.rand(0.85, 1.12), B.rand(0.7, 1.15), seg);
    const c0 = col(B.pick(cols)), c1 = c0.clone().lerp(col('#dcf2a0'), 0.45);
    paint(g, (p, nn, o) => o.copy(c0).lerp(c1, clamp(p.y / ll) * 0.75).multiplyScalar(0.9 + 0.12 * clamp(nn.y * 0.5 + 0.5)));
    g.rotateX(B.rand(tilt[0], tilt[1])); g.rotateY(az + (n > 1 ? (j / (n - 1) - 0.5) * 2 * spread : 0) + B.wob(0.14));
    g.translate(tip[0], tip[1], tip[2]);
    B.add(g, null, 'leaf');
  }
}
/** an oval leaf from the origin along +z (length L, width W), cupped (edges dip by cup * half-width), two-sided */
function ovalLeafGeo(L, W, cup = 0.3, curl = 0.1, lite = false) {
  const rows = lite ? [[0, 0], [0.42, 0.5], [1, 0]] : [[0, 0], [0.2, 0.42], [0.48, 0.5], [0.76, 0.34], [1, 0]], pos = [], R = [];
  for (const [t, hw] of rows) { const y = curl * L * t * t, z = t * L, h = hw * W; R.push([V(-h, y - cup * h, z), V(0, y, z), V(h, y - cup * h, z)]); }
  for (let i = 0; i < R.length - 1; i++) { const [l0, m0, r0] = R[i], [l1, m1, r1] = R[i + 1]; triP(pos, l0, m0, l1); triP(pos, m0, m1, l1); triP(pos, m0, r0, m1); triP(pos, r0, r1, m1); }
  return twoSided(geoOf(pos));
}
/** a curly wood shaving: a thin ribbon wound in a shrinking curl, lying on its flat tail (radius r, width w), two-sided */
function shavingGeo(r, turns = 1.5, w = 0.016, drift = 0.008) {
  const rows = [], N = Math.round(turns * 14);
  for (let i = -3; i <= N; i++) {
    let x = 0, y = 0.001, z = i / 3 * r * 1.6;
    if (i >= 0) { const t = i / N, a = t * turns * TAU, rh = r * (1 - 0.45 * t); x = t * drift; y = r - rh * Math.cos(a) + 0.001; z = rh * Math.sin(a); }
    rows.push([V(x - w / 2, y, z), V(x + w / 2, y, z)]);
  }
  const pos = []; for (let i = 0; i < rows.length - 1; i++) { const [a, b] = rows[i], [c, d] = rows[i + 1]; triP(pos, a, c, b); triP(pos, b, c, d); }
  return twoSided(geoOf(pos));
}
/** a little terracotta pot with a rolled painted rim (radius r, height h); returns the soil level */
function clayPot(B, r, h, { c = '#d8845a', band = '#fff1de', dot = '#ff9eb8', soil = '#6a4a3a', seg = 14, dots = 5 } = {}) {
  const prof = [[0.001, 0], [r * 0.7, 0], [r * 0.76, h * 0.05], [r * 0.9, h * 0.7], [r * 1.05, h * 0.74], [r * 1.09, h * 0.84], [r * 1.07, h * 0.97], [r * 0.99, h], [r * 0.93, h * 0.92], [0.001, h * 0.88]];
  const C = col(c), CL = col(c).lerp(col('#ffd8b8'), 0.35);
  lathe(B, prof, seg, 0, 0, 0, (p, n, o) => {
    const rr = Math.hypot(p.x, p.z);
    if (p.y > h * 0.86 && rr < r * 0.95 && n.y > 0.4) { o.set(soil).multiplyScalar(0.9 + 0.1 * nz(p.x * 90, p.z * 90)); return; }
    if (p.y > h * 0.73) { o.set(band).multiplyScalar(0.94 + 0.08 * clamp(n.y + 0.4)); return; }
    o.copy(C).lerp(CL, clamp(p.y / h) * 0.6).multiplyScalar(0.92 + 0.1 * clamp(n.x * 0.5 + n.z * 0.5 + 0.3));
  });
  for (let k = 0; k < dots; k++) { const a = k / dots * TAU + 0.2, y = h * 0.86, rr = r * 1.085; const g = G.sph(r * 0.08, 5, 3); g.scale(1, 1, 0.4); g.rotateY(a); put(B, g, Math.sin(a) * rr, y, Math.cos(a) * rr, dot); }
  return h * 0.88;
}

// =================================================================== Cottage Basics
const BASICS = {
  futonBed(B, d) {
    const W = d.size[0] * CELL - 0.04, D = d.size[1] * CELL - 0.04, hz = D / 2; // 1.96 x 1.46
    const wood = HONEY, woodD = WOOD_R;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(B, 0.07, 0.058, 0.09, 10, sx * (W / 2 - 0.14), 0, sz * (hz - 0.14), woodD);
    box(B, W - 0.08, 0.2, D - 0.12, 0.05, 0, 0.07, 0.01, wood); // platform 0.07..0.27
    // headboard: an arched board with a heart on the crest, between two chunky posts with ball finials
    const hbz = -hz + 0.075, hb = new THREE.Shape(), hw = W / 2 - 0.13;
    hb.moveTo(-hw, 0); hb.lineTo(hw, 0); hb.lineTo(hw, 0.27); hb.quadraticCurveTo(hw * 0.55, 0.3, 0.16, 0.38);
    hb.quadraticCurveTo(0, 0.45, -0.16, 0.38); hb.quadraticCurveTo(-hw * 0.55, 0.3, -hw, 0.27); hb.lineTo(-hw, 0);
    put(B, extrude(hb, 0.06, 0.016, 10), 0, 0.18, hbz - 0.046, wood);
    B.at([0, 0.54, hbz + 0.045], 0, () => symbol(B, 'heart', 0.15, { depth: 0.12, colors: ['#ff8fb0'] }));
    for (const sx of [-1, 1]) {
      box(B, 0.13, 0.56, 0.13, 0.045, sx * (W / 2 - 0.065), 0.04, hbz, woodD);
      ball(B, 0.058, sx * (W / 2 - 0.065), 0.63, hbz, wood, 1, 10);
      box(B, 0.12, 0.36, 0.12, 0.04, sx * (W / 2 - 0.06), 0.04, hz - 0.06, woodD);
      ball(B, 0.05, sx * (W / 2 - 0.06), 0.43, hz - 0.06, wood, 1, 10);
    }
    box(B, W - 0.2, 0.15, 0.07, 0.03, 0, 0.21, hz - 0.06, wood); // footboard 0.21..0.36
    // the futon mattress
    B.add(pillowGeo(1.8, 0.13, 1.28, { sq: 0.14, edge: 0.15, bot: 0.4, ws: 24, hs: 10 }).translate(0, 0.25, -0.02), '#fff3e6');
    // a thick, puffy patchwork quilt with rolled edges and a pink binding
    const pal = ['#ffbcd6', '#a8e8cc', '#ffe08a', '#a8d8ff', '#fff3e0', '#ffc8a0'];
    const qW = 1.72, qD = 0.8, qz = 0.15, qy = 0.415;
    put(B, softSheet(qW, qD, {
      drop: 0.15, roll: 0.75, nx: 12, nz: 6, sk: 3, puff: 0.03, px: 6, pz: 3, bulge: 0.03,
      color: (X, Z, top) => top ? pal[((Math.floor((X + qW / 2) / (qW / 6)) * 7 + Math.floor((Z + qD / 2) / (qD / 3)) * 3) % 6 + 6) % 6] : '#ff9eb8',
    }), 0, qy, qz, null);
    // turned down at the pillow end: the folded-back band shows the cream reverse, a crease roll behind it
    put(B, softSheet(qW + 0.02, 0.14, { drop: 0.06, roll: 0.8, nx: 10, nz: 2, sk: 2, bulge: 0.012, color: (X, Z) => Z > 0.045 ? '#ffc4d4' : '#fff8f0' }), 0, qy + 0.04, qz - qD / 2 + 0.09, null);
    const roll = new THREE.CapsuleGeometry(0.052, qW - 0.04, 4, 12); roll.rotateZ(PI / 2);
    put(B, roll, 0, qy + 0.005, qz - qD / 2 + 0.005, (p, n, o) => o.set('#fff8f0').lerp(col('#ffd8e2'), clamp(-n.z) * 0.6));
    // two pillows leaning on the headboard: a pink one with a heart, a blue one with a bone (Chewy's and Shadow's)
    for (const [sx, c, sym, sc] of [[-1, '#ffd6e2', 'heart', '#ff7aa0'], [1, '#dcecff', 'bone', '#ffffff']]) {
      B.at([sx * 0.42, 0.355, -0.47], 0, () => {
        B.add(pillowGeo(0.6, 0.15, 0.34, { sq: 0.3, edge: 0.45, bot: 0.4, ws: 18, hs: 10 }), (p, n, o) => o.set(c).multiplyScalar(0.92 + 0.1 * clamp(n.y)));
        symbolUp(B, sym, 0.1, 0, pillowY(0.15, 0.4, 0.45, 0) - 0.003, 0.0, { depth: 0.1, colors: [sc] });
      }, 1, 0.32);
    }
  },

  pupBasket(B) {
    const H = 0.34, Hf = 0.2, rimY = a => H - (H - Hf) * Math.max(0, Math.cos(a)) ** 2;
    const lift = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.1) p.setY(i, 0.1 + (y - 0.1) * (rimY(Math.atan2(p.getX(i), p.getZ(i))) - 0.1) / (H - 0.1)); } g.computeVertexNormals(); return g; };
    // woven wall (checker weave; darker inside)
    const wp = [[0.001, 0], [0.33, 0], [0.375, 0.025], [0.402, 0.07]];
    for (let y = 0.115; y < H - 0.01; y += 0.045) wp.push([0.42, y]);
    wp.push([0.42, H], [0.385, H], [0.38, 0.2], [0.37, 0.1], [0.33, 0.07], [0.001, 0.07]);
    const nOut = wp.findIndex(p => p[0] === 0.385); // profile steps before this are the outside
    const wall = lift(G.lathe(wp, 28));
    B.add(quadPaint(wall, wp.length, (i, j, o) => { if (j >= nOut) { o.set(j === nOut - 1 + 1 ? '#d8b070' : '#b8925e'); if (j === wp.length - 2) o.set('#c89a64'); return; } o.set((i + j) % 2 ? '#ecca8c' : '#cfa262'); }), null);
    // a fat braided rim that dips at the front
    const rim = []; for (let k = 0; k <= 36; k++) { const a = k / 36 * TAU; rim.push(V(0.405 * Math.sin(a), rimY(a) + 0.008, 0.405 * Math.cos(a))); }
    B.add(faceColors(tube(rim.map(p => ({ p, r: 0.04 })), 6, false), (p, n, o, c) => o.set(Math.floor(((Math.atan2(c.z, c.x) / TAU + 1) % 1) * 54) % 2 ? '#f2d698' : '#d8b074')), null);
    // the cushion with white polka dots
    const cw = 0.72, ch = 0.13;
    B.add(pillowGeo(cw, ch, cw, { sq: 1, edge: 0.3, bot: 0.3, ws: 20, hs: 7, dimple: 0.015 }).translate(0, 0.06, 0), (p, n, o) => o.set('#ffc4d6').multiplyScalar(0.92 + 0.1 * clamp(n.y)));
    for (let k = 0; k < 9; k++) {
      const e = k < 3 ? 0.32 : 0.62, a = k < 3 ? k / 3 * TAU + 0.5 : (k - 3) / 6 * TAU;
      ball(B, 0.022, Math.cos(a) * e * cw / 2, 0.06 + pillowY(ch, 0.3, 0.3, e) - 0.003, Math.sin(a) * e * cw / 2, '#fffaf4', [1, 0.3, 1], 6);
    }
    // the bone-shaped pillow resting against the back
    B.at([0.02, 0.22, -0.19], 0.12, () => {
      const sh = new THREE.CapsuleGeometry(0.052, 0.26, 4, 10); sh.rotateZ(PI / 2); B.add(sh, '#fff4e2');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ball(B, 0.06, sx * 0.17, 0, sz * 0.045, '#fff4e2', [1, 0.9, 1], 8);
    }, 1, 0, 0.06);
    // a gold bone name tag with a little red bow on the front
    B.at([0, Hf - 0.075, 0.425], 0, () => symbol(B, 'bone', 0.13, { depth: 0.14, colors: [GOLD] }));
    ball(B, 0.016, 0, Hf - 0.03, 0.43, '#e8403a', 1, 8);
  },

  treasureChest(B) {
    const W = 0.9, D = 0.37, y0 = 0.05, Hb = 0.34, R = D / 2 + 0.012, wood = '#b8743e', woodD = '#7a4a2c', top = y0 + Hb;
    B.push([0, 0, -0.012]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ball(B, 0.045, sx * 0.39, 0.042, sz * 0.13, GOLD, [1, 0.85, 1], 8);
    box(B, W, Hb, D, 0.035, 0, y0, 0, wood);
    for (const y of [0.155, 0.265]) { box(B, W - 0.07, 0.008, 0.004, 0, 0, y, D / 2 + 0.0005, woodD); box(B, 0.004, 0.008, D - 0.07, 0, W / 2 + 0.0005, y, 0, woodD); }
    // a domed planked lid
    const lid = new THREE.CylinderGeometry(R, R, W + 0.02, 18, 1, false, 0, PI); lid.rotateZ(PI / 2);
    put(B, faceColors(lid, (p, n, o, c) => { if (Math.abs(n.x) > 0.7) { o.set(woodD); return; } const a = Math.floor(Math.atan2(c.y, c.z) / (PI / 6)); o.set(a % 2 ? wood : shade(wood, 0.88)); }), 0, top, 0, null);
    // gold straps, the seam band and the paw lock
    for (const sx of [-0.3, 0.3]) {
      const s = new THREE.CylinderGeometry(R + 0.007, R + 0.007, 0.06, 18, 1, true, 0, PI); s.rotateZ(PI / 2); put(B, s, sx, top, 0, GOLD);
      box(B, 0.06, Hb, D + 0.012, 0, sx, y0 + 0.002, 0, GOLD);
      for (const y of [0.12, 0.3]) ball(B, 0.011, sx, y, D / 2 + 0.007, '#fff0b0', [1, 1, 0.5], 6);
    }
    box(B, W + 0.016, 0.026, D + 0.016, 0, 0, top - 0.02, 0, GOLD);
    sbox(B, 0.17, 0.19, 0.032, 0.02, 0, top - 0.115, D / 2 + 0.012, GOLD);
    B.at([0, top - 0.012, D / 2 + 0.028], 0, () => symbol(B, 'paw', 0.12, { depth: 0.12, colors: ['#8a4a2c'] }));
    for (const sx of [-1, 1]) for (const y of [top - 0.1, top + 0.06]) ball(B, 0.009, sx * 0.065, y, D / 2 + 0.029, '#fff0b0', [1, 1, 0.5], 6);
    // ring handles on the sides
    for (const sx of [-1, 1]) {
      box(B, 0.012, 0.05, 0.05, 0, sx * (W / 2 + 0.006), 0.27, 0, GOLD);
      const r = G.torus(0.045, 0.011, 5, 12); r.rotateY(PI / 2); put(B, r, sx * (W / 2 + 0.016), 0.245, 0, GOLD);
    }
    B.pop();
  },

  kitchenStove(B) {
    const plaster = '#fff0dc', brick = '#d0704e';
    box(B, 0.94, 0.1, 0.9, 0.04, 0, 0, 0, brick);
    box(B, 0.9, 0.56, 0.84, 0.14, 0, 0.08, -0.01, plaster); // chubby: y 0.08..0.64, front z 0.41
    box(B, 0.94, 0.06, 0.88, 0.03, 0, 0.62, -0.01, '#c8664a'); // tiled top 0.62..0.68
    // a band of little blue-and-white tiles under the top (front and right)
    for (let i = 0; i < 7; i++) { const x = -0.27 + i * 0.09; sbox(B, 0.075, 0.05, 0.012, 0.004, x, 0.555, 0.405, i % 2 ? '#8fc0e8' : '#fffaf2'); }
    for (let i = 0; i < 6; i++) { const z = -0.3 + i * 0.09; sbox(B, 0.012, 0.05, 0.075, 0.004, 0.445, 0.555, z, i % 2 ? '#fffaf2' : '#8fc0e8'); }
    for (let i = -1; i <= 1; i += 2) box(B, 0.004, 0.003, 0.86, 0, i * 0.16, 0.68, -0.01, '#a8543a');
    for (const z of [-0.2, 0.08]) box(B, 0.92, 0.003, 0.004, 0, 0, 0.68, z, '#a8543a');
    // bricks peeking through the plaster
    for (const [x, y] of [[-0.31, 0.17], [-0.24, 0.225], [0.3, 0.16]]) sbox(B, 0.11, 0.05, 0.02, 0.008, x, y, 0.41, brick);
    for (const [y, z] of [[0.24, 0.12], [0.44, -0.2], [0.49, -0.08]]) sbox(B, 0.02, 0.05, 0.11, 0.008, 0.45, y, z, brick);
    // the fire mouth: dark arch, glowing back, logs and flames, a brick arch around it and an iron sill
    put(B, extrude(archShape(0.34, 0.3), 0.008, 0.004), 0, 0.12, 0.404, '#2a1e22');
    const back = new THREE.ShapeGeometry(archShape(0.27, 0.24), 6); back.translate(0, 0.14, 0.421);
    B.glow(back, (p, n, o) => o.set('#ff6a2a').lerp(col('#ffc860'), clamp((0.32 - p.y) / 0.18)), { hot: true, flicker: 0.8, tint: 1 });
    for (const s of [-1, 1]) pipe(B, [s * 0.11, 0.14, 0.4], [-s * 0.06, 0.155, 0.44], 0.026, '#6a4030', { seg: 7 });
    for (const [x, hh, r, c0, c1] of [[-0.05, 0.13, 0.042, '#ff7a2a', '#ffd070'], [0.045, 0.11, 0.038, '#ff8a3a', '#ffe08a'], [0, 0.17, 0.05, '#ff6a2a', '#ffcc60'], [0, 0.1, 0.028, '#ffd860', '#fff4c0']]) {
      const f = G.cone(r, hh, 7); f.scale(1, 1, 0.55); f.translate(x, 0.165 + hh / 2, 0.432 + (r < 0.03 ? 0.012 : 0));
      B.glow(f, (p, n, o) => o.set(c0).lerp(col(c1), clamp((p.y - 0.165) / hh)), { hot: true, flicker: 1, tint: 1 });
    }
    for (let i = 0; i < 6; i++) { const e = G.ico(0.016, 0); e.translate(-0.1 + i * 0.04, 0.15, 0.425 + (i % 2) * 0.012); B.glow(e, i % 2 ? '#ff8a3a' : '#ffb050', { hot: true, flicker: 1, tint: 1 }); }
    const arch = G.torus(0.19, 0.036, 6, 12, PI); put(B, arch, 0, 0.25, 0.414, brick);
    for (const s of [-1, 1]) box(B, 0.07, 0.13, 0.07, 0.015, s * 0.19, 0.12, 0.414, brick);
    sbox(B, 0.06, 0.07, 0.05, 0.01, 0, 0.42, 0.43, '#e8906a');
    box(B, 0.44, 0.025, 0.07, 0, 0, 0.1, 0.43, IRON);
    // stew pot (red enamel) bubbling, a wooden ladle in it
    B.at([-0.2, 0.68, -0.08], 0, () => {
      lathe(B, [[0.001, 0], [0.13, 0], [0.155, 0.02], [0.16, 0.13], [0.172, 0.142], [0.168, 0.158], [0.148, 0.152], [0.148, 0.04], [0.001, 0.04]], 20, 0, 0, 0, (p, n, o) => o.set(Math.hypot(p.x, p.z) < 0.15 && p.y > 0.03 && n.y < 0.9 ? '#a83a2e' : '#e8503a').multiplyScalar(p.y > 0.14 ? 1.08 : 1));
      cyl(B, 0.149, 0.149, 0.01, 16, 0, 0.115, 0, '#e8943a');
      for (const [x, z, r] of [[0.05, 0.03, 0.022], [-0.06, -0.04, 0.018], [-0.02, 0.07, 0.014], [0.07, -0.06, 0.016], [-0.08, 0.04, 0.012]]) ball(B, r, x, 0.125, z, '#ffd09a', [1, 0.65, 1], 8);
      ball(B, 0.016, 0.02, 0.127, -0.07, '#8fcf6a', [1, 0.6, 1], 6); ball(B, 0.018, -0.07, 0.127, 0.0, '#ff9a4a', [1, 0.6, 1], 6);
      pipe(B, [0.03, 0.11, 0.02], [0.2, 0.3, 0.1], 0.012, '#d8a868', { seg: 5 });
      for (const sx of [-1, 1]) { const h = G.torus(0.03, 0.009, 4, 8, PI); h.rotateY(PI / 2); put(B, h, sx * 0.168, 0.12, 0, IRON); }
    });
    // mint kettle with its spout toward the camera side
    B.at([0.2, 0.68, 0.14], 0, () => {
      lathe(B, [[0.001, 0], [0.1, 0], [0.12, 0.03], [0.125, 0.065], [0.11, 0.105], [0.07, 0.13], [0.04, 0.135], [0.001, 0.135]], 18, 0, 0, 0, (p, n, o) => o.set('#8fd8c0').lerp(col('#d8fff0'), clamp(n.y) * 0.3));
      lathe(B, [[0.042, 0.133], [0.04, 0.145], [0.025, 0.152], [0.001, 0.154]], 12, 0, 0, 0, '#7cc8b0');
      ball(B, 0.02, 0, 0.165, 0, '#fff6ea', 1, 8);
      curve(B, [[0.09, 0.05, 0], [0.15, 0.08, 0.01], [0.18, 0.13, 0.02]], t => 0.022 - t * 0.008, '#8fd8c0', { radial: 7, n: 6, cap: false });
      const hd = G.torus(0.085, 0.012, 5, 12, PI); hd.rotateY(PI / 2); put(B, hd, 0, 0.11, 0, BLACK_LAC);
      ball(B, 0.02, 0, 0.11 + 0.085, 0, WOOD, [1.8, 0.9, 0.9], 6);
    });
    // flue pipe with a little hat
    cyl(B, 0.065, 0.065, 0.4, 12, 0.3, 0.66, -0.32, '#9a8e98');
    for (const y of [0.8, 0.98]) cyl(B, 0.072, 0.072, 0.025, 12, 0.3, y, -0.32, '#d08a52');
    lathe(B, [[0.001, 0], [0.11, 0], [0.112, 0.018], [0.065, 0.065], [0.001, 0.075]], 12, 0.3, 1.06, -0.32, '#d08a52');
    // utensil rail with a ladle, a spatula and a gingham towel
    pipe(B, [-0.4, 0.525, 0.445], [0.4, 0.525, 0.445], 0.011, '#c8a050', { seg: 6 });
    for (const s of [-1, 1]) box(B, 0.03, 0.03, 0.04, 0, s * 0.4, 0.51, 0.425, '#c8a050');
    box(B, 0.018, 0.17, 0.012, 0, -0.34, 0.36, 0.452, WOOD); ball(B, 0.035, -0.34, 0.35, 0.46, '#c8c4cc', [1, 0.6, 0.6], 8);
    box(B, 0.016, 0.12, 0.01, 0, -0.27, 0.4, 0.452, WOOD); sbox(B, 0.05, 0.06, 0.01, 0.004, -0.27, 0.34, 0.452, '#c8c4cc');
    const tw = faceColors(G.plane(0.13, 0.2, 4, 6), (p, n, o, c) => o.set((Math.floor((c.x + 1) / 0.0325) + Math.floor((c.y + 1) / 0.0333)) % 2 ? '#e8504a' : '#fffaf2'));
    tw.translate(0.3, 0.415, 0.452); B.cloth(tw, null, { x0: 0.23, x1: 0.37, yTop: 0.52, yBot: 0.31 });
  },

  kitchenCounter(B, d) {
    const top = d.surface, body = '#fff1de', door = '#a8dcc8';
    box(B, 0.86, 0.08, 0.34, 0.02, 0, 0, -0.04, '#8a5e44');
    box(B, 0.92, 0.72, 0.4, 0.04, 0, 0.06, -0.02, body); // y 0.06..0.78, z -0.22..0.18
    box(B, 0.96, 0.08, 0.46, 0.025, 0, top - 0.08, 0, HONEY); // worktop, flat at `surface`
    for (const sx of [-1, 1]) {
      sbox(B, 0.42, 0.44, 0.024, 0.012, sx * 0.222, 0.12, 0.19, door);
      const ht = new THREE.ShapeGeometry(heartPath(0.1), 6); put(B, ht, sx * 0.222, 0.47, 0.2025, '#6b4a3a');
      ball(B, 0.03, sx * 0.04, 0.38, 0.215, WOOD, [1, 1, 0.8], 10);
      sbox(B, 0.42, 0.13, 0.024, 0.012, sx * 0.222, 0.6, 0.19, door);
      ball(B, 0.026, sx * 0.222, 0.665, 0.212, WOOD, [1, 1, 0.8], 10);
    }
    // chopping board with a carrot at the right end (the rest of the top stays clear)
    sbox(B, 0.28, 0.024, 0.2, 0.01, 0.29, top, 0.0, '#f0d0a0');
    cyl(B, 0.02, 0.02, 0.025, 10, 0.44, top, 0.0, '#f0d0a0');
    B.at([0.28, top + 0.045, 0.02], 0.3, () => {
      const c = G.cone(0.024, 0.15, 8); c.rotateZ(PI / 2); B.add(c, '#ff8a3a');
      for (const a of [-0.4, 0, 0.4]) { const l = bladeGeo(0.07, 0.016, { bend: 0.3, seg: 3 }); l.rotateZ(-PI / 2 + a); l.translate(-0.075, 0, 0); B.add(l, '#5aae4a', 'leaf'); }
    });
    // a gingham dish towel on a rail on the right side
    pipe(B, [0.468, 0.67, -0.12], [0.468, 0.67, 0.12], 0.009, '#c8a050');
    for (const z of [-0.12, 0.12]) box(B, 0.012, 0.03, 0.03, 0, 0.462, 0.655, z, '#c8a050');
    const tw = faceColors(G.plane(0.2, 0.3, 6, 8), (p, n, o, c) => o.set((Math.floor((c.x + 1) / 0.0333) + Math.floor((c.y + 1) / 0.0375)) % 2 ? '#6a9ad8' : '#fffaf2'));
    tw.rotateY(PI / 2); tw.translate(0.473, 0.52, 0); B.cloth(tw, null, { x0: 0.46, x1: 0.48, yTop: 0.67, yBot: 0.37 });
  },

  chabudai(B, d) {
    const R = 0.465, top = d.surface;
    // a thick round top with a rolled lacquer rim band, an inlaid line and concentric grain rings
    lathe(B, [[R - 0.075, top - 0.065], [R - 0.03, top - 0.066], [R - 0.008, top - 0.055], [R, top - 0.036], [R - 0.002, top - 0.017], [R - 0.014, top - 0.004], [R - 0.034, top], [R - 0.07, top]], 44, 0, 0, 0,
      (p, n, o) => o.set('#9a4a30').lerp(col('#c86a44'), clamp(n.y) * 0.5));
    put(B, G.cyl(R - 0.074, R - 0.074, 0.063, 40), 0, top - 0.0335, 0, '#8a4228');
    const rings = [[0, 0.035, '#d0904e'], [0.035, 0.1, '#dfa268'], [0.1, 0.16, '#da9c62'], [0.16, 0.23, '#e0a46a'], [0.23, 0.3, '#da9c62'], [0.3, R - 0.078, '#dfa268'], [R - 0.078, R - 0.068, '#7a3a24']];
    for (const [r0, r1, c] of rings) { const g = r0 ? new THREE.RingGeometry(r0, r1, 44, 1) : new THREE.CircleGeometry(r1, 16); g.rotateX(-PI / 2); put(B, g, 0, top + 0.0005, 0, c); }
    // a deep apron ring and four stout turned legs with flared feet
    lathe(B, [[0.32, top - 0.135], [0.352, top - 0.135], [0.358, top - 0.12], [0.358, top - 0.075], [0.35, top - 0.066], [0.32, top - 0.066], [0.32, top - 0.135]], 36, 0, 0, 0, (p, n, o) => o.set('#8a4a30').multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.3)));
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + k * PI / 2;
      lathe(B, [[0.001, 0], [0.058, 0], [0.062, 0.014], [0.048, 0.036], [0.04, 0.07], [0.044, 0.16], [0.05, top - 0.13], [0.001, top - 0.12]], 12, Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32,
        (p, n, o) => o.set('#8a4a30').lerp(col('#b86a44'), clamp(n.y) * 0.4));
    }
  },

  zabutonPink(B) { cushion(B, '#ffaac4', { button: '#ff7aa0', tassel: GOLD }); },
  zabutonBlue(B) { cushion(B, '#34528a', { button: '#fff6ea', tassel: '#fffaf2', stitch: '#fffaf2' }); },

  andonLamp(B) {
    const s = 0.17, H = 0.84, wd = '#7a4e36', wl = '#9a6a48';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(B, G.beam(0.05, H, 0.05, 0.014), sx * s, H / 2, sz * s, wd);
    sbox(B, 0.4, 0.035, 0.4, 0.012, 0, 0.12, 0, wl);
    B.glow(rbox(0.3, 0.56, 0.3, 0.02).translate(0, 0.5, 0), '#fff3d6', { flicker: 0.6, tint: 0.25 });
    for (const y of [0.2, 0.5, 0.785]) for (let k = 0; k < 4; k++) B.at([0, 0, 0], k * PI / 2, () => put(B, G.beam(0.32, y === 0.5 ? 0.022 : 0.034, 0.022, 0.006), 0, y, 0.16, wd));
    for (let k = 0; k < 4; k++) B.at([0, 0, 0], k * PI / 2, () => {
      put(B, G.beam(0.02, 0.28, 0.018, 0.005), 0, 0.355, 0.158, wd);
      if (k < 2) { // the little moon windows on the front and right faces
        const ring = G.torus(0.075, 0.01, 5, 18); put(B, ring, 0, 0.645, 0.162, wd);
        B.glow(G.disc(0.066, 18).translate(0, 0.645, 0.1515), '#ffe9a0', { flicker: 0.5, tint: 0.65 });
      } else put(B, G.beam(0.02, 0.26, 0.018, 0.005), 0, 0.645, 0.158, wd);
    });
    sbox(B, 0.42, 0.032, 0.42, 0.012, 0, 0.82, 0, wl);
    const hd = G.torus(0.09, 0.013, 5, 12, PI); put(B, hd, 0, 0.852, 0, wd);
    for (const sx of [-1, 1]) ball(B, 0.02, sx * 0.09, 0.856, 0, GOLD, 1, 6);
  },

  paperPendant(B, d) {
    const top = d.h, R = 0.185, y0 = 0.1, H = 0.36, N = 18; // the washi globe spans y0 .. y0 + H
    const prof = []; for (let k = 0; k <= N; k++) { const a = k / N * PI; prof.push([Math.max(0.045, R * Math.sin(a)) * (k % 2 ? 1 : 0.975), y0 + H / 2 - H / 2 * Math.cos(a)]); }
    B.glow(G.lathe(prof, 20), (p, n, o) => {
      const t = (p.y - y0) / H; o.set('#fff4de');
      if (Math.abs(t - 0.5) < 0.055) o.set('#ffd2dc'); else if (t < 0.1 || t > 0.9) o.set('#ffc8d6');
      o.multiplyScalar(0.94 + 0.06 * Math.abs(n.y));
    }, { flicker: 0.3, tint: 0.3 });
    // bamboo rib rings over the paper
    const Rf = y => R * Math.sin(Math.acos(clamp(1 - 2 * (y - y0) / H, -1, 1)));
    for (let k = 1; k < 9; k++) { const y = y0 + H * (0.5 - 0.5 * Math.cos(k / 9 * PI)), r = Math.max(0.05, Rf(y)) + 0.002; const g = G.torus(r, 0.0048, 3, 22); g.rotateX(PI / 2); g.translate(0, y, 0); B.glow(g, '#d8b48a', { tint: 0.12, flicker: 0.3 }); }
    // wooden caps, a gold ring, a pink tassel underneath
    lathe(B, [[0.001, y0 - 0.026], [0.05, y0 - 0.026], [0.062, y0 - 0.012], [0.06, y0 + 0.01], [0.044, y0 + 0.02], [0.001, y0 + 0.02]], 14, 0, 0, 0, '#b8804e');
    lathe(B, [[0.001, y0 + H - 0.02], [0.052, y0 + H - 0.02], [0.068, y0 + H - 0.004], [0.072, y0 + H + 0.012], [0.054, y0 + H + 0.032], [0.022, y0 + H + 0.046], [0.001, y0 + H + 0.05]], 14, 0, 0, 0, '#b8804e');
    for (const y of [y0 - 0.006, y0 + H + 0.008]) { const r = G.torus(y < y0 ? 0.061 : 0.071, 0.005, 3, 16); r.rotateX(PI / 2); put(B, r, 0, y, 0, GOLD); }
    cyl(B, 0.004, 0.004, y0 - 0.026 - 0.066, 4, 0, 0.066, 0, '#e8708a');
    ball(B, 0.013, 0, 0.066, 0, '#ff9eb8', 1, 8);
    B.add(quadPaint(G.lathe([[0.001, 0], [0.022, 0.002], [0.017, 0.028], [0.009, 0.05], [0.001, 0.054]], 10), 5, (i, j, o) => o.set(i % 2 ? '#ff9eb8' : '#ffb8cc')), null);
    cyl(B, 0.012, 0.012, 0.01, 8, 0, 0.048, 0, GOLD);
    // a turned wooden ceiling rose with a screw eye; a twisted jute cord knotted through it
    const yK = ceilingRose(B, top, { wood: '#c08850', cord: '#dcbc80', cord2: '#b08a54' });
    twistCord(B, 0, 0, yK, y0 + H + 0.044, 0.0048, '#dcbc80', '#b8925c');
  },

  ragRug(B, d) {
    const R = d.size[0] * CELL / 2 - 0.025, h = d.h, N = 13, rim = 0.06, inner = R - rim, cw = inner / N;
    // one profile: the fat rolled rim coil, then rope coils (rounded humps) spiralling in to the centre
    const prof = [[0.001, 0.004], [R - 0.03, 0.004], [R - 0.004, 0.009], [R, 0.018], [R - 0.008, h - 0.002], [R - 0.03, h], [inner + 0.004, h - 0.008]];
    const c0 = prof.length - 1;
    for (let i = 0; i < N; i++) { const r = inner - i * cw; prof.push([r - cw * 0.22, h - 0.002], [r - cw * 0.55, h - 0.0005], [Math.max(0.001, r - cw * 0.9), h - 0.008]); }
    // soft sunset coils, in bands of two or three coils of one colour; each coil is a gently twisted rope: a lighter
    // crest, darker valleys, and slanted twist marks every few segments (low contrast, so it reads as braid, not noise)
    const band = ['#e89a84', '#e89a84', '#f2b48e', '#f4cf94', '#f4cf94', '#f6e6c4', '#e8a4a8', '#e8a4a8', '#f2b48e', '#f4cf94', '#f6e6c4', '#f2b48e', '#f2b48e'];
    B.add(quadPaint(G.lathe(prof, 72), prof.length, (i, j, o) => {
      if (j < c0) { o.set('#d07a66').multiplyScalar((i >> 1) % 2 ? 0.93 : 1); return; }
      const c = Math.min(N - 1, Math.floor((j - c0) / 3)), k = (j - c0) % 3;
      o.set(band[c]).multiplyScalar(k === 1 ? 1.03 : 0.92);
      if ((((i + k + c) % 4) + 4) % 4 === 0) o.lerp(col('#fff8ec'), 0.16);
    }), null);
  },

  tileMat(B, d) {
    const W = d.size[0] * CELL - 0.04, D = d.size[1] * CELL - 0.04, fr = 0.065, nx = 8, nzc = 6;
    sbox(B, W - 0.04, 0.006, D - 0.04, 0.0025, 0, 0.004, 0, '#ddd2bf'); // the grout bed
    const iw = W - 2 * fr, id = D - 2 * fr, px = iw / nx, pz = id / nzc, flowers = new Set([3, 12, 21, 30, 41]);
    for (let j = 0; j < nzc; j++) for (let i = 0; i < nx; i++) {
      const x = -iw / 2 + (i + 0.5) * px, z = -id / 2 + (j + 0.5) * pz, mint = (i + j) % 2 === 0;
      const base = col(mint ? '#9fdcc4' : '#fff6e6').offsetHSL(0, B.wob(0.03), B.wob(0.025)), hi = base.clone().lerp(col('#ffffff'), 0.35);
      const tw = px - 0.014, td = pz - 0.014;
      put(B, tileGeo(tw, td, 0.011, 0.0045), x, 0.0065, z, (p, n, o) => { o.copy(base); if (n.y > 0.9) o.lerp(hi, clamp(0.5 - (p.x - x) / tw - (p.z - z) / td) * 0.6); else if (n.y > 0.2) o.lerp(hi, 0.25); else o.multiplyScalar(0.86); });
      if (!mint && flowers.has(j * nx + i)) {
        const f = blossomGeo(0.042, 4, 0.45); f.rotateY(B.rand(0, 1)); put(B, f, x, 0.018, z, '#ff9eb8');
        put(B, G.disc(0.011, 8).rotateX(-PI / 2), x, 0.0183, z, '#ffd24a');
      }
    }
    // a raised, rounded border
    const fs = roundRect(W, D, 0.05); fs.holes.push(roundRect(iw + 0.006, id + 0.006, 0.02, 0, 0, new THREE.Path()));
    const fg = extrude(fs, 0.01, 0.004, 4); fg.rotateX(-PI / 2);
    put(B, fg, 0, 0.004, 0, (p, n, o) => o.set('#5cb898').lerp(col('#9ae0c8'), clamp(n.y) * 0.45));
  },

  bookshelf(B) {
    const W = 0.96, D = 0.44, H = 1.55, wood = WOOD, woodD = WOOD_R, back = '#bfe6d4', zb = -D / 2 + 0.025;
    box(B, W, 0.08, D, 0.03, 0, 0, 0, woodD);
    for (const sx of [-1, 1]) box(B, 0.065, H - 0.06, D, 0.025, sx * (W / 2 - 0.0325), 0.06, 0, wood);
    box(B, W, 0.06, D, 0.025, 0, H - 0.04, 0, woodD);
    box(B, W - 0.1, H - 0.1, 0.025, 0, 0, 0.07, zb - 0.0125, back);
    for (const y of [0.08, 0.44, 0.8, 1.15]) sbox(B, W - 0.12, 0.035, D - 0.03, 0.01, 0, y, 0.0, wood);
    // crown: an arch with a heart cut out
    const cr = new THREE.Shape(); cr.moveTo(-0.36, 0); cr.lineTo(0.36, 0); cr.quadraticCurveTo(0.2, 0.02, 0.1, 0.06); cr.quadraticCurveTo(0, 0.1, -0.1, 0.06); cr.quadraticCurveTo(-0.2, 0.02, -0.36, 0);
    cr.holes.push(heartPath(0.07, 0, 0.042, new THREE.Path()));
    put(B, extrude(cr, 0.02, 0.008, 10), 0, H + 0.012, 0.12, woodD);
    const BC = ['#e8706a', '#6a9ad8', '#8fcf8a', '#f4c04a', '#c890d8', '#ff9eb0', '#5a7ac8', '#e89a5a', '#a8d8e8', '#7cc0a0'];
    const row = (x0, x1, y, hMax) => {
      let x = x0;
      while (x < x1) {
        const t = B.rand(0.03, 0.058), h = hMax * B.rand(0.72, 0.97), dd = B.rand(0.24, 0.3);
        if (x + t > x1) break;
        bookStand(B, t, h, dd, B.pick(BC), x + t / 2, y, D / 2 - 0.035 - dd / 2 - B.rand(0, 0.015), { band: B.chance(0.55) ? B.pick([GOLD, CREAM]) : null });
        x += t + 0.002;
      }
      return x;
    };
    const X0 = -W / 2 + 0.07;
    // bottom: big books and a lying stack
    row(X0, 0.12, 0.115, 0.3);
    B.at([0.27, 0.115, 0.02], 0.05, () => { bookFlat(B, 0.24, 0.05, 0.2, '#6a9ad8'); B.at([0.01, 0.05, 0], -0.12, () => bookFlat(B, 0.22, 0.045, 0.19, '#e8706a')); B.at([-0.01, 0.095, 0], 0.1, () => bookFlat(B, 0.2, 0.04, 0.17, '#8fcf8a')); });
    // second: books and the globe
    row(X0, 0.02, 0.475, 0.3);
    B.at([0.24, 0.475, 0.0], 0, () => {
      lathe(B, [[0.001, 0], [0.06, 0], [0.062, 0.014], [0.03, 0.026], [0.014, 0.05], [0.014, 0.06], [0.001, 0.06]], 12, 0, 0, 0, WOOD_D);
      const g = G.sph(0.1, 16, 12); g.rotateZ(0.4);
      put(B, g, 0, 0.165, 0, (p, n, o) => { const k = nz(n.x * 2.6 + 3.1, n.y * 2.2 + n.z * 2.4); o.set(k > 0.12 ? (n.y > 0.75 ? '#fffaf2' : '#8fcf6a') : k > 0.04 ? '#f4d890' : '#5ab0e0'); });
      const m = G.torus(0.113, 0.007, 4, 18, PI * 1.25); m.rotateY(PI / 2); m.rotateX(-0.4 - PI * 0.12); put(B, m, 0, 0.165, 0, GOLD);
      ball(B, 0.012, 0, 0.165 + 0.11, 0, GOLD, 1, 6);
    });
    // third: the sleepy plant and books
    row(-0.05, W / 2 - 0.075, 0.835, 0.28);
    B.at([-0.25, 0.835, 0.03], 0, () => {
      const prof = [[0.001, 0], [0.055, 0], [0.065, 0.02], [0.07, 0.09], [0.075, 0.1], [0.066, 0.1], [0.001, 0.095]];
      lathe(B, prof, 16, 0, 0, 0, (p, n, o) => o.set(p.y > 0.06 && p.y < 0.078 ? '#ffb0c8' : '#fff3e6'));
      for (const sx of [-1, 1]) { // closed sleepy eyes and blush
        const e = G.torus(0.011, 0.0035, 3, 8, PI); e.rotateZ(PI); put(B, e, sx * 0.022, 0.046, 0.066, INK);
        ball(B, 0.011, sx * 0.042, 0.033, 0.062, '#ff9eb8', [1, 0.6, 0.3], 6);
      }
      cyl(B, 0.06, 0.06, 0.005, 12, 0, 0.09, 0, '#6a4a3a');
      const leafC = ['#5aa84a', '#6ab854', '#4f9a44'];
      for (const [a, len] of [[0.25, 0.42], [-0.3, 0.36], [0.05, 0.3]]) {
        const pts = [[0, 0.1, 0], [Math.sin(a) * 0.05, 0.13, 0.06], [Math.sin(a) * 0.1, 0.1, 0.14], [Math.sin(a) * 0.13, 0.0, 0.17], [Math.sin(a) * 0.15, 0.1 - len, 0.175]];
        const C3 = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
        curve(B, pts, 0.004, '#4f8a3a', { radial: 3, n: 10, k: 'leaf' });
        for (let i = 2; i < 9; i++) { const q = C3.getPoint(i / 9), lf = heartLeafGeo(0.045 + (i % 3) * 0.006); lf.rotateZ((i % 2 ? 0.5 : -0.5)); lf.rotateY(a + (i % 2 ? 0.4 : -0.3)); lf.translate(q.x, q.y, q.z + 0.01); B.add(lf, leafC[i % 3], 'leaf'); }
      }
      for (let i = 0; i < 5; i++) { const lf = heartLeafGeo(0.05); lf.rotateZ(PI + B.wob(0.5)); lf.rotateX(-0.6); lf.rotateY(i * 1.3); lf.translate(0, 0.1, 0); B.add(lf, leafC[i % 3], 'leaf'); }
    });
    // top: books, a honey jar and Shadow's red ball
    row(X0, 0.08, 1.185, 0.27);
    B.at([0.2, 1.185, 0.04], 0, () => jamJar(B, '#f4a830', '#e8504a', 1.1));
    ball(B, 0.05, 0.34, 1.235, 0.08, (p, n, o) => o.set(Math.abs(n.y - 0.2) < 0.25 ? '#fffaf2' : '#e8403a'), 1, 12);
  },

  tansu(B, d) {
    const top = d.surface, wood = '#c47c48', front = '#d8955c';
    box(B, 0.86, 0.06, 0.38, 0.02, 0, 0, -0.01, '#74503a');
    box(B, 0.92, top - 0.11, 0.42, 0.03, 0, 0.05, -0.022, wood); // front z 0.188
    box(B, 0.96, 0.06, 0.45, 0.02, 0, top - 0.06, -0.005, '#a8643a'); // flat top at `surface`
    const fronts = [[-0.225, 0.69, 0.42, 0.17, 1], [0.225, 0.69, 0.42, 0.17, 1], [0, 0.46, 0.87, 0.2, 2], [0, 0.11, 0.87, 0.32, 2]];
    for (const [x, y, w, h, n] of fronts) {
      put(B, G.beam(w, h, 0.022, 0.008), x, y + h / 2, 0.199, front);
      const yc = y + h / 2 + (h > 0.25 ? 0.05 : 0.01);
      for (let i = 0; i < n; i++) {
        const px = n === 1 ? x : x + (i ? 0.24 : -0.24);
        const pl = G.cyl(0.046, 0.046, 0.008, 6); pl.rotateX(PI / 2); pl.rotateZ(PI / 6); put(B, pl, px, yc, 0.213, IRON);
        const bail = G.torus(0.034, 0.011, 5, 10, PI); bail.rotateZ(PI); put(B, bail, px, yc + 0.006, 0.222, '#4a4450');
        for (const s of [-1, 1]) ball(B, 0.009, px + s * 0.034, yc + 0.006, 0.222, '#5a5460', 1, 6);
      }
    }
    // a round lock plate on the middle drawer and iron corner brackets
    const lk = G.cyl(0.05, 0.05, 0.006, 14); lk.rotateX(PI / 2); put(B, lk, 0, 0.56, 0.213, IRON);
    box(B, 0.012, 0.03, 0.004, 0, 0, 0.545, 0.217, '#c8a050');
    for (const sx of [-1, 1]) for (const y of [0.06, 0.82]) { box(B, 0.07, 0.07, 0.006, 0, sx * 0.43, y, 0.188, IRON); box(B, 0.006, 0.07, 0.07, 0, sx * 0.462, y, 0.153, IRON); }
    const h = G.torus(0.045, 0.01, 4, 12, PI); h.rotateZ(PI); h.rotateY(PI / 2); put(B, h, 0.468, 0.62, -0.01, IRON);
    box(B, 0.006, 0.05, 0.12, 0, 0.462, 0.6, -0.01, IRON);
  },

  wardrobe(B) {
    const W = 0.92, D = 0.34, wood = HONEY, woodL = '#e6b07a', panel = '#fff1de', fz = D / 2;
    // turned bun feet, the body, a cornice ledge with a moulding roll, and the arched crown with a heart window
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(B, [[0.001, 0], [0.04, 0], [0.052, 0.02], [0.046, 0.042], [0.032, 0.062], [0.001, 0.062]], 10, sx * 0.38, 0, sz * 0.11, WOOD_R);
    box(B, W, 1.45, D, 0.07, 0, 0.06, 0, wood); // 0.06..1.51
    sbox(B, W + 0.03, 0.045, D + 0.03, 0.018, 0, 1.49, 0, '#c8884e');
    const mould = new THREE.CapsuleGeometry(0.018, W - 0.03, 3, 8); mould.rotateZ(PI / 2); put(B, mould, 0, 1.49, fz + 0.02, '#e0a466');
    const cr = archShape(W - 0.06, 0.18); cr.holes.push(heartPath(0.07, 0, 0.085, new THREE.Path()));
    const crz = -D / 2 + 0.034, crd = D - 0.1;
    put(B, extrude(cr, crd, 0.016, 8), 0, 1.535, crz, wood);
    put(B, new THREE.ShapeGeometry(heartPath(0.075, 0, 0.085), 6), 0, 1.535, crz + crd / 2, '#ff9eb0');
    // two frame-and-panel doors: honey frames with raised cream panels
    for (const sx of [-1, 1]) {
      sbox(B, 0.41, 0.95, 0.022, 0.012, sx * 0.212, 0.44, fz + 0.006, woodL);
      sbox(B, 0.31, 0.8, 0.02, 0.014, sx * 0.212, 0.515, fz + 0.019, panel);
    }
    for (const sx of [-1, 1]) ball(B, 0.025, sx * 0.045, 0.88, fz + 0.034, GOLD, [1, 1, 0.75], 10);
    // a drawer row under the doors
    for (const sx of [-1, 1]) {
      sbox(B, 0.41, 0.25, 0.022, 0.012, sx * 0.212, 0.14, fz + 0.006, woodL);
      sbox(B, 0.31, 0.15, 0.018, 0.01, sx * 0.212, 0.19, fz + 0.018, panel);
      ball(B, 0.022, sx * 0.212, 0.265, fz + 0.034, GOLD, [1, 1, 0.75], 8);
    }
    // the heart mirror (left door) and a painted flower (right door)
    put(B, extrude(heartPath(0.3, 0, 0), 0.006, 0.005, 6), -0.212, 1.04, fz + 0.026, '#ff9eb0');
    put(B, new THREE.ShapeGeometry(heartPath(0.235, 0, -0.004), 10), -0.212, 1.04, fz + 0.0425, (p, n, o) => o.set('#cfeaff').lerp(col('#f6fcff'), clamp((p.y - 0.96) / 0.15)));
    put(B, ribbon([[-0.055, 0.02], [0.0, 0.075]], 0.015), -0.212, 1.04, fz + 0.043, '#ffffff');
    decal(B, 'flower', 0.16, 0.212, 1.04, fz + 0.0295);
    // a red scarf peeking out of the door seam
    const sc = G.plane(0.05, 0.17, 1, 4); sc.translate(0.0, 0.64, fz + 0.03);
    B.cloth(faceColors(sc, (p, n, o, c) => o.set(Math.sin(c.y * 120) > 0.6 ? '#fffaf2' : '#e8403a')), null, { x0: -0.03, x1: 0.03, yTop: 0.72, yBot: 0.55 });
  },

  woodTable(B, d) {
    const top = d.surface, th = 0.075, W = 1.46, D = 0.96, L = W - 0.12;
    for (let i = 0; i < 4; i++) sbox(B, L, th, 0.233, 0.02, 0, top - th, -D / 2 + 0.12 + i * 0.24, shade(HONEY, 0.92 + 0.14 * B.r()));
    for (const sx of [-1, 1]) sbox(B, 0.058, th, D, 0.02, sx * (W / 2 - 0.029), top - th, 0, shade(HONEY, 0.86));
    for (let i = 0; i < 4; i++) {
      const z = -D / 2 + 0.12 + i * 0.24;
      for (const [x0, L, dz] of [[-0.5 + 0.1 * (i % 2), 0.55, -0.05], [0.1 - 0.12 * (i % 3), 0.45, 0.06]]) box(B, L, 0.0015, 0.006, 0, x0 + L / 2, top, z + dz, shade(HONEY, 0.78));
      for (const sx of [-1, 1]) for (const dz of [-0.06, 0.06]) put(B, G.disc(0.008, 6).rotateX(-PI / 2), sx * (W / 2 - 0.029), top + 0.001, z + dz, '#6a4a3a');
    }
    for (const [x, z, r] of [[-0.32, -0.23, 0.02], [0.41, 0.13, 0.016], [0.08, 0.37, 0.014]]) { put(B, ell(r * 1.6, r, 10).rotateX(-PI / 2), x, top + 0.0012, z, '#b07a46'); put(B, ell(r * 0.7, r * 0.45, 8).rotateX(-PI / 2), x, top + 0.0016, z, '#8a5a36'); }
    box(B, W - 0.3, 0.1, D - 0.3, 0.02, 0, top - th - 0.1, 0, '#b87a46');
    B.at([0, top - th - 0.05, (D - 0.3) / 2 + 0.001], 0, () => symbol(B, 'heart', 0.075, { depth: 0.1, colors: ['#ff8fb0'] }));
    const leg = [[0.001, 0], [0.042, 0], [0.05, 0.02], [0.044, 0.06], [0.062, 0.15], [0.066, 0.22], [0.05, 0.3], [0.04, 0.36], [0.056, 0.41], [0.056, 0.45], [0.044, 0.49], [0.044, top - th - 0.12], [0.001, top - th - 0.12]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      lathe(B, leg, 10, sx * 0.58, 0, sz * 0.33, '#a8703e');
      box(B, 0.1, 0.13, 0.1, 0.02, sx * 0.58, top - th - 0.13, sz * 0.33, '#a8703e');
    }
  },

  sideTable(B, d) {
    // one honey-brown wood throughout: a thick scalloped top with a rolled bullnose edge, a turned pedestal (beads,
    // coves and incised rings), three carved cabriole legs ending in curled scroll toes
    const top = d.surface, R = 0.215, T = 0.058, W0 = col('#c98a52'), WL = col('#e6ae72'), WD = col('#94592f');
    const g = weld(G.lathe([[0.001, top - T], [R - 0.04, top - T], [R - 0.016, top - T + 0.004], [R + 0.002, top - T + 0.014], [R + 0.01, top - T + 0.028], [R + 0.01, top - 0.02], [R + 0.004, top - 0.008], [R - 0.008, top - 0.001], [R - 0.024, top], [0.1, top], [0.001, top]], 44));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)); if (r > 0.17) { const k = 1 + 0.032 * Math.cos(10 * Math.atan2(p.getX(i), p.getZ(i))) * clamp((r - 0.17) / 0.03); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
    g.computeVertexNormals();
    B.add(g, (pp, n, o) => {
      const r = Math.hypot(pp.x, pp.z);
      if (n.y > 0.85 && pp.y > top - 0.004) { o.copy(WL).multiplyScalar(Math.sin(r * 95 + Math.sin(pp.x * 30) * 0.8) > 0.5 ? 0.94 : 1).multiplyScalar(r > 0.168 && r < 0.178 ? 0.86 : 1).lerp(col('#f6cc94'), clamp(0.4 - pp.x * 2.4 - pp.z * 2.4) * 0.4); return; }
      o.copy(W0).lerp(WL, clamp(n.y) * 0.5).multiplyScalar(n.y < -0.5 ? 0.82 : 1);
    });
    // growth rings on the top (slightly off-centre, like real end grain) and a darker heart
    for (const [r0, w, ox, oz, ph] of [[0.0, 0.014, 0.014, -0.01, 0], [0.032, 0.005, 0.012, -0.008, 1.3], [0.062, 0.0065, 0.008, -0.005, 2.9], [0.098, 0.0055, 0.004, -0.002, 4.1], [0.136, 0.006, 0.0, 0.0, 5.2]]) {
      if (!r0) { const c = G.disc(w, 12); c.rotateX(-PI / 2); put(B, c, ox, top + 0.0006, oz, '#d69e62'); continue; }
      const pts = []; for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU, r = r0 * (1 + 0.07 * Math.sin(3 * a + ph) + 0.04 * Math.sin(5 * a + ph * 2)); pts.push([ox + Math.sin(a) * r, -(oz + Math.cos(a) * r)]); }
      const rg = ribbon(pts, w, { caps: false }); rg.rotateX(-PI / 2); put(B, rg, 0, top + 0.0006, 0, '#d8a065');
    }
    // a turned pedestal: hub, beads and coves, a vase bulb, a collar under the top; rings painted per turning
    const ped = [[0.001, 0.06], [0.074, 0.06], [0.082, 0.07], [0.083, 0.084], [0.076, 0.094], [0.072, 0.13], [0.081, 0.14], [0.082, 0.152], [0.07, 0.162], [0.052, 0.178], [0.047, 0.2], [0.056, 0.24], [0.066, 0.28], [0.064, 0.312], [0.054, 0.338], [0.042, 0.37], [0.039, 0.395], [0.052, 0.404], [0.056, 0.416], [0.052, 0.428], [0.04, 0.436], [0.042, 0.452], [0.058, 0.47], [0.074, 0.48], [0.08, top - T - 0.016], [0.076, top - T + 0.002], [0.001, top - T + 0.002]];
    const tone = ped.map((q, j) => { if (j === 0 || j >= ped.length - 2) return W0; const a = ped[j], b = ped[j + 1] || a; const flat = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]) * 0.9; return flat ? WD : (a[0] + b[0]) / 2 > 0.06 ? WL : W0; });
    B.add(quadPaint(G.lathe(ped, 16), ped.length, (i, j, o) => o.copy(tone[j]).multiplyScalar(0.97 + 0.06 * ((i >> 1) % 2))), null);
    for (const y of [0.094, 0.13, 0.404, 0.428]) { const r = G.torus(ped.find(q => Math.abs(q[1] - y) < 0.001)[0] + 0.001, 0.0035, 3, 18); r.rotateX(PI / 2); put(B, r, 0, y, 0, '#7a4626'); }
    // three carved cabriole legs: a knee with a carved leaf, a slim ankle, a curled scroll toe on a bun pad
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + PI / 6, dx = Math.sin(a), dz = Math.cos(a), P = (r, y) => [dx * r, y, dz * r];
      const pts = [P(0.05, 0.12), P(0.095, 0.124), P(0.14, 0.104), P(0.17, 0.07), P(0.186, 0.04), P(0.198, 0.024), P(0.215, 0.022), P(0.232, 0.032), P(0.236, 0.05), P(0.224, 0.06), P(0.212, 0.052), P(0.214, 0.042)];
      curve(B, pts, t => t < 0.5 ? 0.036 - t * 0.032 : 0.02 - (t - 0.5) * 0.022, (pp, n, o) => o.copy(W0).lerp(WL, clamp(n.y) * 0.55).multiplyScalar(0.9 + 0.1 * clamp(n.y + 0.6)), { radial: 8, n: 22 });
      ball(B, 0.03, dx * 0.205, 0.016, dz * 0.205, WD.clone().lerp(W0, 0.4), [1.1, 0.55, 1.1], 10);
      const lf = G.sph(1, 8, 5); lf.scale(0.017, 0.007, 0.036); lf.rotateX(0.42); lf.rotateY(a); put(B, lf, dx * 0.118, 0.141, dz * 0.118, WL);
    }
  },

  woodChair(B) {
    const wood = '#d49a62', seatY = 0.44;
    box(B, 0.42, 0.05, 0.4, 0.02, 0, seatY - 0.05, 0.01, wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pipe(B, [sx * 0.175, 0, sz * 0.16 + 0.01], [sx * 0.16, seatY - 0.05, sz * 0.15 + 0.01], 0.024, wood, { r1: 0.03, seg: 8 });
    for (const sx of [-1, 1]) pipe(B, [sx * 0.17, 0.15, -0.15], [sx * 0.17, 0.15, 0.17], 0.013, WOOD_R);
    pipe(B, [-0.17, 0.12, 0.165], [0.17, 0.12, 0.165], 0.013, WOOD_R);
    for (const sx of [-1, 1]) { pipe(B, [sx * 0.165, seatY - 0.05, -0.145], [sx * 0.17, 0.8, -0.18], 0.026, wood, { seg: 8 }); ball(B, 0.03, sx * 0.17, 0.81, -0.18, wood, 1, 8); }
    const bk = new THREE.Shape(); bk.moveTo(-0.19, 0); bk.lineTo(0.19, 0); bk.lineTo(0.19, 0.17); bk.quadraticCurveTo(0.19, 0.25, 0, 0.26); bk.quadraticCurveTo(-0.19, 0.25, -0.19, 0.17); bk.lineTo(-0.19, 0);
    bk.holes.push(heartPath(0.12, 0, 0.13, new THREE.Path()));
    B.at([0, 0.56, -0.172], 0, () => put(B, extrude(bk, 0.024, 0.008, 10), 0, 0, -0.02, wood), 1, -0.09);
    B.add(pillowGeo(0.36, 0.06, 0.34, { sq: 0.3, edge: 0.3, bot: 0.25, dimple: 0.008, ws: 16, hs: 8 }).translate(0, seatY - 0.004, 0.02), (p, n, o) => o.set('#ffb6c8').multiplyScalar(0.92 + 0.1 * clamp(n.y)));
    ball(B, 0.016, 0, seatY + 0.052, 0.02, '#ff7aa0', [1, 0.5, 1], 8);
    for (const sx of [-1, 1]) B.at([sx * 0.15, seatY + 0.03, -0.14], sx * 0.4, () => bow(B, { s: 0.05, color: '#ff7aa0' }));
  },

  armchair(B) {
    const up = '#f2a690', upD = shade(up, 0.86), legs = '#7a4e36';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(B, 0.045, 0.035, 0.08, 8, sx * 0.36, 0, sz * 0.34, legs);
    box(B, 0.88, 0.26, 0.82, 0.08, 0, 0.07, 0, upD);
    box(B, 0.9, 0.6, 0.2, 0.09, 0, 0.26, -0.33, up); // back shell up to 0.86
    for (const sx of [-1, 1]) {
      box(B, 0.2, 0.3, 0.78, 0.07, sx * 0.355, 0.2, 0.0, up);
      const arm = new THREE.CapsuleGeometry(0.115, 0.56, 5, 14); arm.rotateX(PI / 2); put(B, arm, sx * 0.355, 0.5, 0.0, (p, n, o) => o.set(up).multiplyScalar(0.92 + 0.1 * clamp(n.y)));
      ball(B, 0.032, sx * 0.355, 0.5, 0.392, upD, [1, 1, 0.45], 10);
    }
    B.add(pillowGeo(0.5, 0.17, 0.62, { sq: 0.25, edge: 0.3, bot: 0.35, ws: 18, hs: 10 }).translate(0, 0.3, 0.07), (p, n, o) => o.set(up).multiplyScalar(0.94 + 0.1 * clamp(n.y)));
    B.at([0, 0.6, -0.225], 0, () => {
      const c = pillowGeo(0.52, 0.2, 0.44, { sq: 0.3, edge: 0.4, bot: 0.22, ws: 18, hs: 10 }); c.rotateX(PI / 2);
      B.add(c, (p, n, o) => o.set(up).multiplyScalar(0.94 + 0.08 * clamp(n.z)));
      for (const [x, y] of [[-0.12, 0.07], [0.12, 0.07], [0, -0.05]]) ball(B, 0.02, x, y, 0.2 * 0.82 * Math.sqrt(1 - (Math.hypot(x / 0.26, y / 0.23) ** 4)) * (1 - 0.4 * Math.hypot(x / 0.26, y / 0.23) ** 2) + 0.2 * 0.18 - 0.004, upD, [1, 1, 0.5], 8);
    }, 1, -0.16);
    // a cream throw pillow with a heart in the corner
    B.at([-0.13, 0.56, -0.06], 0.38, () => {
      const c = pillowGeo(0.26, 0.09, 0.26, { sq: 0.3, edge: 0.4, bot: 0.3, ws: 14, hs: 8 }); c.rotateX(PI / 2); c.translate(0, 0, -0.045);
      B.add(c, '#fff3e0');
      B.at([0, 0, 0.05], 0, () => symbol(B, 'heart', 0.09, { depth: 0.1, colors: ['#ff8fb0'] }));
    }, 1, -0.22);
  },

  pottedFern(B) {
    const prof = [[0.001, 0], [0.1, 0], [0.11, 0.015], [0.15, 0.08], [0.165, 0.16], [0.16, 0.22], [0.172, 0.245], [0.175, 0.265], [0.16, 0.272], [0.15, 0.25], [0.001, 0.25]];
    lathe(B, prof, 22, 0, 0, 0, (p, n, o) => {
      const r = Math.hypot(p.x, p.z), a = Math.atan2(p.x, p.z);
      if (p.y < 0.02) o.set('#d49a6a');
      else if (p.y > 0.245 && r < 0.155) o.set('#6a4a3a');
      else o.set(p.y > 0.17 + 0.025 * Math.sin(a * 7) ? '#8fd8e0' : '#3f8fb0').lerp(col('#ffffff'), p.y > 0.255 ? 0.4 : 0);
    });
    const greens = ['#4f9a48', '#5aa84c', '#6ab854', '#4a8c44'];
    for (let i = 0; i < 16; i++) {
      const az = i / 16 * TAU + B.rand(-0.15, 0.15), inner = i % 3 === 0, L = inner ? B.rand(0.44, 0.52) : B.rand(0.27, 0.3);
      const g = frondGeo(L, { el0: inner ? B.rand(1.45, 1.55) : B.rand(1.12, 1.25), el1: inner ? B.rand(0.55, 0.85) : B.rand(-0.55, -0.3), W: inner ? 0.052 : 0.058, n: 11 });
      const c0 = col(B.pick(greens)), c1 = col('#a8dc78');
      paint(g, (p, n, o) => o.copy(c0).lerp(c1, clamp(p.z / 0.3) * 0.55).multiplyScalar(0.88 + 0.16 * clamp(n.y)));
      g.rotateY(az); g.scale(0.8, 1, 0.8); g.translate(Math.sin(az) * 0.015, 0.25, Math.cos(az) * 0.015); B.add(g, null, 'leaf');
    }
    for (const [x, z, h] of [[0.02, -0.01, 0.2], [-0.03, 0.02, 0.15]]) {
      const pts = [[x, 0.25, z], [x, 0.25 + h * 0.6, z], [x + 0.015, 0.25 + h, z], [x + 0.03, 0.25 + h - 0.02, z], [x + 0.02, 0.25 + h - 0.035, z], [x + 0.008, 0.25 + h - 0.02, z]];
      curve(B, pts, t => 0.008 - t * 0.003, '#9ad870', { radial: 5, n: 10, k: 'leaf' });
    }
  },

  wallShelf(B) {
    const sy = 0.24, wood = WOOD;
    sbox(B, 0.9, 0.045, 0.18, 0.015, 0, sy, 0.09, wood);
    const br = new THREE.Shape(); br.moveTo(0, 0); br.lineTo(0.15, 0); br.quadraticCurveTo(0.13, -0.05, 0.07, -0.07); br.quadraticCurveTo(0.03, -0.09, 0.025, -0.14); br.lineTo(0, -0.14); br.lineTo(0, 0);
    for (const sx of [-1, 1]) { const g = extrude(br, 0.025, 0.006, 8); g.rotateY(-PI / 2); put(B, g, sx * 0.32 + 0.0185, sy, 0.0, WOOD_R); }
    B.at([-0.31, sy + 0.045, 0.09], 0, () => jamJar(B, '#e8404a', '#e8504a'));
    B.at([-0.15, sy + 0.045, 0.085], 0.4, () => jamJar(B, '#f4a040', '#7cc06a', 0.92));
    B.at([0.01, sy + 0.045, 0.09], -0.3, () => jamJar(B, '#7a5ac8', '#6a9ad8', 1.05));
    // trailing plant in a little pot at the right end
    B.at([0.28, sy + 0.045, 0.085], 0, () => {
      lathe(B, [[0.001, 0], [0.048, 0], [0.062, 0.075], [0.068, 0.085], [0.06, 0.088], [0.001, 0.082]], 14, 0, 0, 0, (p, n, o) => o.set(p.y > 0.03 && p.y < 0.05 ? MINT : '#fff3e6'));
      cyl(B, 0.056, 0.056, 0.005, 12, 0, 0.08, 0, '#6a4a3a');
      const leafC = ['#5aa84a', '#6ab854', '#4f9a44', '#7cc05a'];
      for (const [dx, len, dz] of [[-0.05, 0.25, 0.0], [0.03, 0.2, 0.01], [0.09, 0.15, -0.01]]) {
        const pts = [[dx * 0.3, 0.085, 0], [dx * 0.6, 0.11, 0.05], [dx, 0.07, 0.1 + dz], [dx * 1.1, 0.02, 0.105 + dz], [dx * 1.2, -len * 0.5, 0.108 + dz], [dx * 1.3, -len, 0.11 + dz]];
        const C3 = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
        curve(B, pts, 0.004, '#4f8a3a', { radial: 3, n: 12, k: 'leaf' });
        for (let i = 2; i < 10; i++) { const q = C3.getPoint(i / 10), lf = heartLeafGeo(0.04 + (i % 3) * 0.006); lf.rotateZ(i % 2 ? 0.55 : -0.55); lf.rotateY(i % 2 ? 0.3 : -0.3); lf.translate(q.x, q.y, q.z + 0.008); B.add(lf, leafC[i % 4], 'leaf'); }
      }
      for (let i = 0; i < 6; i++) { const lf = heartLeafGeo(0.05); lf.rotateZ(PI + B.wob(0.5)); lf.rotateX(-0.5); lf.rotateY(i * 1.1); lf.translate(0, 0.085, 0); B.add(lf, leafC[i % 4], 'leaf'); }
    });
  },

  plateRack(B) {
    const wood = WOOD, woodD = WOOD_R;
    const side = new THREE.Shape(); side.moveTo(0, 0); side.lineTo(0.16, 0); side.lineTo(0.16, 0.2); side.quadraticCurveTo(0.08, 0.24, 0.07, 0.33); side.quadraticCurveTo(0.07, 0.44, 0.0, 0.47); side.lineTo(0, 0);
    for (const sx of [-1, 1]) { const g = extrude(side, 0.022, 0.006, 8); g.rotateY(-PI / 2); put(B, g, sx * 0.465 + 0.017, 0.02, 0, woodD); }
    sbox(B, 0.98, 0.034, 0.1, 0.012, 0, 0.455, 0.05, wood);
    sbox(B, 0.92, 0.03, 0.16, 0.01, 0, 0.19, 0.08, wood);
    sbox(B, 0.9, 0.3, 0.012, 0.005, 0, 0.19, 0.006, '#fff1de');
    pipe(B, [-0.46, 0.27, 0.135], [0.46, 0.27, 0.135], 0.009, woodD);
    const plates = [['#6a9ad8', 'heart', '#ff7a9a'], ['#ff9eb0', 'flower', null], ['#7cc0a0', 'fish', '#6aa8e0'], ['#f4c04a', 'pawHeart', null]];
    plates.forEach(([rim, sym, sc], i) => {
      const x = -0.33 + i * 0.22;
      B.at([x, 0.33, 0.055], 0, () => {
        const g = G.lathe([[0.001, 0], [0.05, 0], [0.065, 0.006], [0.095, 0.014], [0.102, 0.02], [0.098, 0.023], [0.06, 0.013], [0.001, 0.009]], 16);
        g.rotateX(PI / 2);
        B.add(g, (p, n, o) => { const r = Math.hypot(p.x, p.y); o.set(n.z < -0.2 ? '#fffaf2' : r > 0.075 ? rim : r > 0.062 ? '#ffffff' : '#fff6ea'); });
        decal(B, sym, 0.08, 0, 0, 0.0136, { colors: sc ? [sc] : undefined });
      }, 1, -0.16);
    });
    const mugs = ['#ff9eb0', '#8fd0ff', '#ffe08a', '#a8e8cc'];
    mugs.forEach((c, i) => {
      const x = -0.33 + i * 0.22;
      curve(B, [[x + 0.03, 0.19, 0.075], [x + 0.03, 0.165, 0.075], [x + 0.048, 0.155, 0.075]], 0.004, '#c8a050', { radial: 4, n: 5 });
      B.at([x - 0.005, 0.135, 0.075], 0, () => {
        cyl(B, 0.038, 0.034, 0.08, 14, 0, -0.08, 0, c);
        cyl(B, 0.032, 0.032, 0.004, 12, 0, -0.002, 0, shade(c, 0.6));
        const h = G.torus(0.022, 0.0075, 4, 10); put(B, h, 0.044, -0.04, 0, c);
        for (const [dx, dy] of [[-0.016, -0.03], [0.012, -0.055], [0.02, -0.022]]) ball(B, 0.008, dx, dy, 0.035, '#fffaf2', [1, 1, 0.35], 6);
      }, 1, 0, 0.12);
    });
  },

  cuckooClock(B) {
    const wood = HONEY, roof = '#9a6038';
    sbox(B, 0.3, 0.3, 0.13, 0.02, 0, 0.56, 0.065, wood);
    const gab = new THREE.Shape(); gab.moveTo(-0.15, 0); gab.lineTo(0.15, 0); gab.lineTo(0, 0.11); gab.lineTo(-0.15, 0);
    put(B, extrude(gab, 0.11, 0.008, 4), 0, 0.85, 0.008, wood);
    for (const s of [-1, 1]) { const r = rbox(0.24, 0.028, 0.19, 0.01); r.rotateZ(s * -0.62); put(B, r, s * 0.088, 0.918, 0.098, roof); }
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; for (const s of [-1, 1]) ball(B, 0.012, s * (0.18 - t * 0.18), 0.855 + t * 0.12, 0.196, '#fff1de', [1, 1, 0.6], 6); }
    ball(B, 0.018, 0, 0.972, 0.1, '#ff8fb0', 1, 8);
    // clock face
    const face = G.cyl(0.085, 0.085, 0.008, 22); face.rotateX(PI / 2); put(B, face, 0, 0.69, 0.134, '#fff8ec');
    const ring = G.torus(0.088, 0.011, 5, 22); put(B, ring, 0, 0.69, 0.137, GOLD);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; box(B, 0.008, k % 3 ? 0.012 : 0.02, 0.004, 0, Math.sin(a) * 0.066, 0.69 + Math.cos(a) * 0.066 - 0.006, 0.139, INK); }
    for (const [L, a, w] of [[0.045, -1.1, 0.012], [0.065, 0.35, 0.008]]) { const hnd = G.box(w, L, 0.004, 0); hnd.translate(0, L / 2, 0); hnd.rotateZ(a); put(B, hnd, 0, 0.69, 0.142, INK); }
    ball(B, 0.008, 0, 0.69, 0.145, GOLD, 1, 6);
    // the cuckoo peeking out of its little door
    put(B, extrude(archShape(0.064, 0.066), 0.006, 0.003), 0, 0.785, 0.13, WOOD_D);
    ball(B, 0.022, 0, 0.812, 0.15, '#ffd24a', 1, 8);
    const bk = G.cone(0.009, 0.022, 5); bk.rotateX(PI / 2); put(B, bk, 0, 0.808, 0.176, '#ff8a3a');
    for (const s of [-1, 1]) ball(B, 0.0045, s * 0.009, 0.818, 0.17, INK, 1, 5);
    // a flower box under the face
    sbox(B, 0.2, 0.03, 0.04, 0.008, 0, 0.565, 0.15, '#e8503a');
    for (let i = 0; i < 5; i++) { ball(B, 0.015, -0.08 + i * 0.04, 0.6, 0.152, i % 2 ? '#ffffff' : '#ff6f7f', 1, 6); const lf = leafGeo(0.035, 0.012); lf.rotateZ(0.6 + (i % 2) * 1.9); put(B, lf, -0.07 + i * 0.04, 0.597, 0.162, '#5aa84a', 'leaf'); }
    // pendulum and two pine-cone weights
    box(B, 0.008, 0.22, 0.006, 0, 0, 0.34, 0.06, '#c8a050');
    const bob = G.cyl(0.042, 0.042, 0.012, 16); bob.rotateX(PI / 2); put(B, bob, 0, 0.32, 0.066, GOLD);
    put(B, new THREE.ShapeGeometry(heartPath(0.04), 4), 0, 0.318, 0.0735, '#ff8fb0');
    for (const s of [-1, 1]) {
      box(B, 0.006, 0.56 - 0.2, 0.006, 0, s * 0.075, 0.2, 0.06, '#c8b078');
      for (let i = 0; i < 6; i++) ball(B, 0.007, s * 0.075, 0.24 + i * 0.05, 0.06, '#c8a050', 1, 5);
      B.at([s * 0.075, 0.07, 0.06], 0, () => pineCone(B, 0.13, 0.036));
      cyl(B, 0.016, 0.02, 0.012, 8, s * 0.075, 0.198, 0.06, GOLD);
    }
  },

  packPhoto(B) {
    B.push([0, 0.235, 0], 0, 1, 0, 0.05);
    box(B, 0.34, 0.28, 0.006, 0, 0, -0.14, 0.0, '#e8d8b8');
    put(B, G.plane(0.31, 0.25), 0, 0, 0.007, '#fffaf2');
    const z = 0.0078, L = (g, x, y, c, k = 0) => put(B, g, x, y, z + k * 0.0006, c);
    L(ribbon(spline2([[-0.15, -0.09], [-0.07, -0.08], [0.0, -0.095], [0.08, -0.08], [0.15, -0.09]], 9), 0.05, { caps: false }), 0, 0, '#8fd06a');
    L(G.disc(0.028, 14), 0.105, 0.08, '#ffd24a');
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; L(ribbon([[Math.cos(a) * 0.036, Math.sin(a) * 0.036], [Math.cos(a) * 0.05, Math.sin(a) * 0.05]], 0.007), 0.105, 0.08, '#ffc04a'); }
    L(new THREE.ShapeGeometry(heartPath(0.05), 5), -0.005, 0.075, '#ff7aa0');
    // Chewy: chocolate pup with a white blaze and a red scarf
    L(ell(0.046, 0.03), -0.07, -0.05, '#7a4426', 1);
    for (const x of [-0.1, -0.08, -0.06, -0.04]) L(ribbon([[x, -0.065], [x, -0.085]], 0.011), 0, 0, '#7a4426');
    L(G.disc(0.038, 16), -0.065, 0.005, '#7a4426', 2);
    for (const s of [-1, 1]) L(ell(0.014, 0.026), -0.065 + s * 0.035, 0.012, '#4a2616', 3);
    L(ell(0.009, 0.02), -0.065, -0.02, '#fff6ea', 3);
    L(ribbon([[-0.1, -0.027], [-0.065, -0.034], [-0.03, -0.027]], 0.012), 0, 0, '#e8403a', 4);
    for (const s of [-1, 1]) L(G.disc(0.0055, 8), -0.065 + s * 0.014, 0.012, INK, 4);
    L(ell(0.008, 0.006), -0.065, -0.003, '#5a2e1c', 4);
    // Shadow: black and white Boston terrier with bat ears
    L(ell(0.04, 0.028), 0.07, -0.052, '#2a2a32', 1);
    L(ell(0.016, 0.018), 0.07, -0.05, '#fffaf2', 2);
    for (const x of [0.042, 0.06, 0.08, 0.098]) L(ribbon([[x, -0.066], [x, -0.086]], 0.01), 0, 0, '#2a2a32');
    L(G.disc(0.034, 16), 0.07, 0.0, '#2a2a32', 2);
    for (const s of [-1, 1]) { const ear = new THREE.Shape(); ear.moveTo(-0.012, 0); ear.lineTo(0.012, 0); ear.lineTo(s * 0.012, 0.035); ear.lineTo(-0.012, 0); L(new THREE.ShapeGeometry(ear), 0.07 + s * 0.024, 0.018, '#2a2a32', 1); }
    L(ell(0.006, 0.022), 0.07, 0.012, '#fffaf2', 3);
    L(ell(0.016, 0.01), 0.07, -0.016, '#fffaf2', 3);
    for (const s of [-1, 1]) { L(G.disc(0.008, 8), 0.07 + s * 0.014, 0.006, '#fffaf2', 3); L(G.disc(0.0045, 8), 0.07 + s * 0.014, 0.006, INK, 4); }
    L(ell(0.006, 0.004), 0.07, -0.013, INK, 4);
    // the popsicle-stick frame, tied to a nail
    const sticks = [['#ffb0c8', 0, 0.15, 0.42, 0.05, 0.028, 0.02], ['#a8e8cc', 0, -0.15, 0.42, 0.05, 0.028, -0.025], ['#ffe08a', -0.18, 0, 0.05, 0.38, 0.016, 0.03], ['#a8d8ff', 0.18, 0, 0.05, 0.38, 0.016, -0.02]];
    for (const [c, x, y, w, h, zz, rz] of sticks) { const g = rbox(w, h, 0.014, 0.0065); g.rotateZ(rz); put(B, g, x, y, zz, c); }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ball(B, 0.008, sx * 0.18, sy * 0.15, 0.037, '#ff7aa0', [1, 1, 0.5], 6);
    for (const sx of [-1, 1]) { const g = bar(V(sx * 0.13, 0.165, 0.03), V(0, 0.245, 0.012), 0.004, 0); B.add(g, '#c8b078'); }
    ball(B, 0.011, 0, 0.247, 0.012, GOLD, 1, 6);
    B.pop();
  },

  teaSet(B) {
    const tray = extrude(roundRect(0.42, 0.3, 0.06), 0.006, 0.006, 4); tray.rotateX(-PI / 2);
    B.add(tray, (p, n, o) => o.set(n.y > 0.8 ? '#b8382e' : '#5a2420'));
    const rim = roundRect(0.44, 0.32, 0.07); rim.holes.push(roundRect(0.4, 0.28, 0.05, 0, 0, new THREE.Path()));
    const rg = extrude(rim, 0.014, 0, 4); rg.rotateX(-PI / 2); put(B, rg, 0, 0.012, 0, '#5a2420');
    const y0 = 0.018;
    // round teapot with a bamboo bail handle, its spout toward the cups
    B.at([-0.075, y0, -0.02], 0, () => {
      const prof = [[0.001, 0], [0.045, 0], [0.068, 0.015], [0.08, 0.045], [0.076, 0.075], [0.058, 0.095], [0.035, 0.102], [0.001, 0.102]];
      lathe(B, prof, 16, 0, 0, 0, (p, n, o) => o.set('#9fd8c0').lerp(col('#e0fff4'), clamp(n.y) * 0.35));
      for (const a of [0.5, 2.6]) { const f = blossomGeo(0.02, 5, 0.45); f.rotateX(PI / 2); f.translate(0, 0.05, 0); B.add(wrapLathe(f, profR(prof.slice(0, 6)), a), '#ffbcd6'); ball(B, 0.005, 0.08 * Math.sin(a), 0.05, 0.08 * Math.cos(a), '#ff7aa0', 1, 5); }
      lathe(B, [[0.001, 0.1], [0.038, 0.1], [0.032, 0.112], [0.001, 0.117]], 12, 0, 0, 0, '#8ccab0');
      ball(B, 0.013, 0, 0.122, 0, '#ff9eb8', 1, 6);
      curve(B, [[0.07, 0.035, 0.01], [0.105, 0.055, 0.02], [0.122, 0.085, 0.03]], t => 0.015 - t * 0.006, '#9fd8c0', { radial: 7, n: 6, cap: false });
      const hd = G.torus(0.058, 0.0075, 4, 12, PI); hd.rotateY(PI / 2); put(B, hd, 0, 0.095, 0, '#d8b878');
      for (const s of [-1, 1]) ball(B, 0.011, 0, 0.095, s * 0.058, '#c8a868', 1, 6);
    });
    for (const [x, z] of [[0.115, 0.06], [0.1, -0.075]]) {
      cyl(B, 0.043, 0.043, 0.008, 10, x, y0, z, '#a8703e');
      lathe(B, [[0.001, 0], [0.026, 0], [0.03, 0.006], [0.034, 0.055], [0.032, 0.058], [0.029, 0.054], [0.027, 0.012], [0.001, 0.012]], 12, x, y0 + 0.008, z, (p, n, o) => o.set(p.y > y0 + 0.04 && p.y < y0 + 0.052 && n.y < 0.5 ? '#ff9eb8' : '#fff6ea'));
      cyl(B, 0.0285, 0.0285, 0.003, 12, x, y0 + 0.048, z, '#a8c860');
    }
  },

  flowerVase(B) {
    const prof = [[0.001, 0], [0.05, 0], [0.065, 0.02], [0.078, 0.065], [0.07, 0.11], [0.045, 0.145], [0.036, 0.165], [0.044, 0.185], [0.048, 0.19], [0.038, 0.188], [0.001, 0.17]];
    lathe(B, prof, 14, 0, 0, 0, (p, n, o) => o.set(p.y > 0.098 && p.y < 0.118 && n.y < 0.6 ? '#ffffff' : '#8fd0ff').lerp(col('#d8f0ff'), clamp(p.y / 0.19) * 0.35));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3, y = 0.06 + (k % 2) * 0.02, r = profR(prof.slice(0, 6))(y); ball(B, 0.009, Math.sin(a) * r, y, Math.cos(a) * r, '#ffffff', [1, 1, 1], 5); }
    const heads = [[0.0, 0.4, 0.0, '#ff8fb0'], [0.065, 0.355, 0.035, '#ff6f9a'], [-0.06, 0.37, 0.04, '#ffa8c4'], [0.035, 0.34, -0.065, '#ff8fb0'], [-0.05, 0.33, -0.05, '#ffc0d4']];
    for (const [x, y, z, c] of heads) {
      const base = V(x * 0.15, 0.17, z * 0.15), top = V(x, y - 0.04, z), mid = base.clone().lerp(top, 0.5).add(V(x * 0.25, 0, z * 0.25));
      curve(B, [base.toArray(), mid.toArray(), top.toArray()], 0.0055, '#5a9a40', { radial: 4, n: 6, cap: false, k: 'leaf' });
      B.at([x, y - 0.042, z], 0, () => B.at([0, 0, 0], 0, () => tulipHead(B, c), 1, z * 2.5, -x * 2.5));
    }
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4, g = bladeGeo(0.17, 0.034, { bend: 1.0, seg: 5 }); g.rotateY(a); g.translate(Math.sin(a) * 0.025, 0.17, Math.cos(a) * 0.025); B.add(g, (p, n, o) => o.set('#5aa84a').lerp(col('#9ad870'), clamp((p.y - 0.17) / 0.15) * 0.5), 'leaf'); }
  },

  mushroomLamp(B) {
    B.add(G.lathe([[0.001, 0], [0.115, 0], [0.122, 0.012], [0.114, 0.028], [0.08, 0.03], [0.04, 0.03], [0.001, 0.03]], 14), (p, n, o) => { const r = Math.hypot(p.x, p.z); o.set(n.y > 0.8 ? (r > 0.06 ? '#f0cc98' : r > 0.02 ? '#dcae78' : '#f0cc98') : '#8a5e44'); });
    B.at([-0.015, 0.028, -0.01], 0, () => toadstool(B, 1.03, '#ff6a64'));
    B.at([0.085, 0.028, 0.06], 0.6, () => toadstool(B, 0.36, '#ff9a6a', 5));
    for (const [a, x, z] of [[0.3, -0.09, 0.07], [2.8, 0.1, -0.02], [4.4, -0.08, -0.06]]) for (let k = 0; k < 2; k++) { const g = bladeGeo(0.05 + k * 0.012, 0.012, { bend: 0.5, seg: 3 }); g.rotateY(a + k * 0.9); g.translate(x, 0.028, z); B.add(g, '#6ab854', 'leaf'); }
  },

  bookStack(B) {
    const books = [[0.3, 0.05, 0.22, '#e8706a'], [0.27, 0.045, 0.2, '#6a9ad8'], [0.25, 0.05, 0.18, '#f4c04a'], [0.21, 0.04, 0.15, '#8fcf8a']];
    let y = 0;
    books.forEach(([w, h, dd, c], i) => {
      B.at([B.wob(0.012), y, B.wob(0.012)], (i === 2 ? -PI / 2 : 0) + B.wob(0.22), () => bookFlat(B, w, h, dd, c, { band: i % 2 ? CREAM : GOLD }));
      if (i === 1) box(B, 0.014, 0.06, 0.003, 0, 0.06, y - 0.03, dd / 2 + 0.002, '#e8403a');
      y += h;
    });
    // reading glasses on top
    B.at([0.01, y + 0.006, 0.02], 0.3, () => {
      for (const s of [-1, 1]) { const r = G.torus(0.026, 0.005, 4, 14); r.rotateX(PI / 2); put(B, r, s * 0.031, 0, 0, '#8a4a2a'); put(B, G.disc(0.022, 12).rotateX(-PI / 2), s * 0.031, -0.002, 0, '#e8f6ff'); }
      const br = G.torus(0.008, 0.004, 3, 6, PI); put(B, br, 0, 0.0, 0, '#8a4a2a');
      for (const s of [-1, 1]) box(B, 0.006, 0.006, 0.09, 0, s * 0.056, -0.003, -0.045, '#8a4a2a');
    });
  },

  fruitBowl(B) {
    lathe(B, [[0.001, 0], [0.055, 0], [0.06, 0.02], [0.1, 0.035], [0.15, 0.068], [0.17, 0.095], [0.172, 0.101], [0.163, 0.101], [0.14, 0.074], [0.09, 0.047], [0.001, 0.042]], 18, 0, 0, 0,
      (p, n, o) => { const r = Math.hypot(p.x, p.z), outer = n.x * p.x + n.z * p.z > 0; o.set(outer && p.y > 0.072 && p.y < 0.09 ? '#6a9ad8' : '#fff3e0'); if (!outer) o.multiplyScalar(0.96); });
    const apple = (x, y, z, r, c, leaf) => {
      const g = G.sph(r, 10, 7), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const yy = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i)); if (yy > 0) p.setY(i, yy - 0.28 * r * Math.max(0, 1 - rr / (0.55 * r))); }
      g.computeVertexNormals(); g.scale(1, 0.92, 1);
      put(B, g, x, y, z, (pp, n, o) => o.set(c).lerp(col('#ffd060'), clamp(n.x * 0.8 - 0.3) * 0.35).lerp(col('#ffffff'), clamp(n.y - 0.7) * 0.25));
      pipe(B, [x, y + r * 0.6, z], [x + 0.006, y + r * 0.6 + 0.024, z], 0.0035, '#6a4a2a');
      if (leaf) { const l = leafGeo(0.04, 0.016); l.rotateZ(0.4); put(B, l, x + 0.006, y + r * 0.6 + 0.02, z, '#5aa84a', 'leaf'); }
    };
    apple(-0.055, 0.09, 0.035, 0.048, '#e8403a', true);
    apple(0.06, 0.088, -0.035, 0.046, '#f05a3a', false);
    apple(0.0, 0.14, 0.0, 0.045, '#e83a4a', true);
    // persimmon with its four-leaf cap
    ball(B, 0.047, -0.06, 0.082, -0.07, (p, n, o) => o.set('#ff8a2a').lerp(col('#ffc060'), clamp(n.y) * 0.3), [1, 0.76, 1], 10);
    const cal = blossomGeo(0.028, 4, 0.35, true); put(B, cal, -0.06, 0.118, -0.07, '#4a7a3a');
    cyl(B, 0.005, 0.006, 0.014, 5, -0.06, 0.117, -0.07, '#5a4a2a');
    // a bunch of grapes hanging over the rim
    B.at([0.085, 0.13, 0.08], -2.4, () => {
      const pur = ['#7a4ab8', '#8a5ac8', '#6a3aa0', '#9a6ad0'];
      let n = 0;
      for (const [cnt, rr, yy] of [[5, 0.03, 0], [5, 0.024, -0.024], [3, 0.016, -0.046], [1, 0, -0.064]]) for (let k = 0; k < cnt; k++) { const a = k / cnt * TAU + yy * 20; ball(B, 0.017, Math.cos(a) * rr, yy, Math.sin(a) * rr, pur[n++ % 4], 1, 6); }
      pipe(B, [0, 0.01, 0], [0.01, 0.04, 0.0], 0.004, '#6a4a2a');
      const l = blossomGeo(0.035, 5, 0.6, true); l.rotateX(0.5); put(B, l, 0.025, 0.03, 0.0, '#6ab04c', 'leaf');
    }, 1, 0, -0.5);
  },

  succulent(B) {
    const prof = [[0.001, 0], [0.068, 0], [0.074, 0.01], [0.08, 0.078], [0.09, 0.086], [0.092, 0.098], [0.085, 0.103], [0.078, 0.094], [0.001, 0.092]];
    lathe(B, prof, 14, 0, 0, 0, (p, n, o) => o.set(p.y > 0.08 ? '#ffb0c8' : '#fff4ea'));
    const Rf = profR(prof.slice(0, 4));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + (k % 2) * 0.3, y = 0.025 + (k % 2) * 0.03; const r = Rf(y); const g = G.sph(0.011, 5, 3); g.scale(1, 1, 0.4); g.rotateY(a); put(B, g, Math.sin(a) * r, y, Math.cos(a) * r, k % 2 ? MINT : '#ff9eb8'); }
    cyl(B, 0.077, 0.077, 0.004, 14, 0, 0.089, 0, '#6a4a3a');
    const tip = col('#f2a0b0'), base = col('#9cc8a0'), base2 = col('#b4d8b0');
    const layers = [[8, 0.106, 0.05, 0.025, 0.22, 0.02, 0.0], [7, 0.09, 0.044, 0.023, 0.52, 0.014, 0.012], [6, 0.07, 0.035, 0.02, 0.88, 0.008, 0.024], [4, 0.052, 0.028, 0.018, 1.2, 0.0, 0.034]];
    layers.forEach(([n, L, W, T, tilt, r0, dy], li) => {
      for (let i = 0; i < n; i++) {
        const az = i / n * TAU + li * 0.4, g = fatLeafGeo(L, W, T);
        paint(g, (p, nn, o) => o.copy(li % 2 ? base2 : base).lerp(tip, clamp(p.z / L) ** 2.2 * 0.85).multiplyScalar(0.9 + 0.14 * clamp(nn.y)));
        g.rotateX(-tilt); g.rotateY(az); g.translate(Math.sin(az) * r0, 0.092 + dy, Math.cos(az) * r0);
        B.add(g, null, 'leaf');
      }
    });
    // a little arching flower stalk with coral bells
    const pts = [[0.0, 0.13, 0.0], [0.02, 0.19, 0.012], [0.05, 0.228, 0.03], [0.085, 0.232, 0.045]];
    curve(B, pts, 0.0035, '#c88a8a', { radial: 4, n: 8, k: 'leaf' });
    const C3 = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
    for (const t of [0.55, 0.78, 1.0]) { const q = C3.getPoint(t), b = G.cone(0.014, 0.024, 6); b.rotateX(PI); put(B, b, q.x, q.y - 0.012, q.z, '#ff8a6a', 'leaf'); }
  },
};

// =================================================================== Tea House
/** an iris flower at the origin (falls droop, standards rise, gold signal patches) */
function irisFlower(B, c) {
  const c2 = mixc(c, '#ffffff', 0.25);
  for (let k = 0; k < 3; k++) {
    const f = G.sph(1, 5, 3); f.scale(0.022, 0.006, 0.04); f.translate(0, 0, 0.032); f.rotateX(0.75); f.rotateY(k * TAU / 3); B.add(f, c, 'leaf');
    const s = G.box(0.012, 0.004, 0.022, 0); s.translate(0, 0.004, 0.018); s.rotateX(0.75); s.rotateY(k * TAU / 3); B.add(s, '#ffd24a', 'leaf');
    const st = G.sph(1, 5, 3); st.scale(0.016, 0.005, 0.036); st.translate(0, 0, 0.026); st.rotateX(-1.15); st.rotateY(k * TAU / 3 + PI / 3); B.add(st, c2, 'leaf');
  }
}
/** pine needle pad: tufts of needle blades fanning up and out over a flattened disc (centre c, radius R) */
function needlePad(B, c, R, { n = 0, cols = ['#2f7048', '#3a7f52', '#458a58'], dark = '#245a3c', tip = '#78b872' } = {}) {
  n = n || Math.round(R * 125);
  for (let t = 0; t < n; t++) {
    const a = B.rand(0, TAU), rr = Math.sqrt(B.rand(0, 1)) * R * 0.8, low = B.chance(0.3);
    const x = c[0] + Math.cos(a) * rr, z = c[2] + Math.sin(a) * rr, y = c[1] + (low ? -0.01 : B.rand(0, 0.02)) - (rr / R) ** 2 * 0.018;
    const c0 = col(low ? dark : B.pick(cols)), c1 = col(tip);
    for (let k = 0; k < 9; k++) {
      const L = B.rand(0.045, 0.06), g = twoSided(leafGeo(L, 0.0065, 0.3));
      paint(g, (p, nn, o) => o.copy(c0).lerp(c1, clamp(p.x / L) ** 2 * (low ? 0.2 : 0.55)));
      g.rotateZ(B.rand(0.12, 0.6)); g.rotateY(k / 9 * TAU + B.rand(0, 0.6)); g.translate(x, y, z);
      B.add(g, null, 'leaf');
    }
  }
}

const TEA = {
  tatamiMat(B, d) {
    const W = d.size[0] * CELL - 0.04, D = d.size[1] * CELL - 0.04, n = 72, h = d.h;
    // a thick, soft-edged rush mat (4 cm) with fine woven rows, and a cloth heri band along each long edge
    sbox(B, W, h - 0.006, D - 0.06, 0.016, 0, 0.004, 0, (p, nn, o) => o.set('#c8c27c').multiplyScalar(0.86 + 0.14 * clamp(nn.y)));
    const top = faceColors(G.plane(W - 0.03, D - 0.12, n, 2), (p, nn, o, c) => {
      const i = Math.floor((c.x + (W - 0.03) / 2) / ((W - 0.03) / n));
      o.set(i % 2 ? '#d8d28c' : '#c8c27a').lerp(col('#e8e4a8'), 0.22 * (0.5 + 0.5 * Math.sin(c.y * 7 + i * 0.13))).multiplyScalar(0.97 + 0.04 * Math.sin(i * 1.7));
    });
    top.rotateX(-PI / 2); put(B, top, 0, h - 0.0015, 0, null);
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 - 0.0375);
      sbox(B, W + 0.002, h - 0.002, 0.075, 0.018, 0, 0.004, z, (p, nn, o) => o.set('#3a5a44').multiplyScalar(0.88 + 0.16 * clamp(nn.y)));
      box(B, W - 0.04, 0.002, 0.01, 0, 0, h + 0.002, z, '#e8d8a0');
      for (let i = 0; i < 18; i++) { const g = G.box(0.014, 0.002, 0.014, 0); g.rotateY(PI / 4); put(B, g, -W / 2 + 0.06 + i * (W - 0.12) / 17, h + 0.0022, z + sz * 0.022, '#d8c890'); }
    }
  },

  byobu(B) {
    const n = 4, span = 1.44, px = span / n, zig = 0.11, pw = Math.hypot(px, 2 * zig), ang = Math.atan2(2 * zig, px);
    const H = 1.3, y0 = 0.07, iw = pw - 0.06, ih = H - 0.1, UW = n * iw;
    // the painting, in unfolded screen coordinates (U along the four panels, V up)
    const layers = [];
    const hills = (f, c) => { const s = new THREE.Shape(); s.moveTo(0, 0); for (let i = 0; i <= 40; i++) { const u = i / 40 * UW; s.lineTo(u, f(u)); } s.lineTo(UW, 0); s.lineTo(0, 0); layers.push([new THREE.ShapeGeometry(s), c]); };
    hills(u => 0.3 + 0.07 * Math.sin(u * 3.3 + 0.5) + 0.03 * Math.sin(u * 8.1), '#a8cc80');
    hills(u => 0.16 + 0.05 * Math.sin(u * 4.7 + 2.0) + 0.025 * Math.sin(u * 11), '#6aa45e');
    // stylised gold clouds: a long rounded band with puffy circles on top
    for (const [uc, vc, L, h] of [[0.42, 0.68, 0.7, 0.07], [1.12, 0.5, 0.66, 0.065], [1.1, 0.98, 0.75, 0.07], [0.2, 0.4, 0.38, 0.055]]) {
      const parts = [new THREE.ShapeGeometry(roundRect(L, h, h / 2, uc, vc), 4)];
      for (const [dx, r] of [[-0.25, 0.7], [-0.05, 1.0], [0.16, 0.8]]) parts.push(new THREE.CircleGeometry(h * r, 14).translate(uc + dx * L, vc + h * 0.45, 0));
      layers.push([mergeG(parts), '#fbecb8']);
    }
    const bough = [[-0.02, 1.07], [0.2, 1.0], [0.42, 0.95], [0.62, 0.86], [0.78, 0.78], [0.9, 0.69]];
    layers.push([stroke(bough, t => 0.042 - t * 0.03, 1, 0, 0, 24), '#5a3a2a']);
    layers.push([stroke([[0.3, 0.975], [0.33, 1.06], [0.37, 1.12]], t => 0.02 - t * 0.012, 1, 0, 0, 8), '#5a3a2a']);
    layers.push([stroke([[0.56, 0.89], [0.6, 0.96], [0.66, 1.0]], t => 0.016 - t * 0.01, 1, 0, 0, 8), '#5a3a2a']);
    layers.push([stroke([[0.72, 0.81], [0.75, 0.74], [0.74, 0.66]], t => 0.015 - t * 0.009, 1, 0, 0, 8), '#5a3a2a']);
    const bough2 = [[UW + 0.02, 1.12], [1.4, 1.06], [1.28, 1.07], [1.2, 1.12]];
    layers.push([stroke(bough2, t => 0.03 - t * 0.02, 1, 0, 0, 12), '#5a3a2a']);
    const C2 = new THREE.SplineCurve(bough.map(p => new THREE.Vector2(...p))), C3 = new THREE.SplineCurve(bough2.map(p => new THREE.Vector2(...p))), pinks = ['#ffbcd6', '#ffd0e2', '#ffffff', '#ffa8c8'];
    const blossoms = [];
    for (let i = 0; i < 22; i++) { const q = C2.getPoint(0.05 + i / 22 * 0.95); blossoms.push([q.x + B.wob(0.05), q.y + B.wob(0.05), B.rand(0.022, 0.036)]); }
    for (let i = 0; i < 8; i++) { const q = C3.getPoint(0.15 + i / 8 * 0.85); blossoms.push([q.x + B.wob(0.04), q.y + B.wob(0.04), B.rand(0.02, 0.032)]); }
    for (const [u, v] of [[0.95, 0.5], [1.05, 0.38], [0.86, 0.3], [1.2, 0.62], [1.32, 0.86], [1.42, 0.75], [1.25, 0.32]]) blossoms.push([u, v, 0.016]);
    for (const [u, v, r] of blossoms) { const f = blossomGeo(r, 5, 0.42); f.rotateX(PI / 2); f.rotateZ(B.rand(0, 1)); f.translate(u, v, 0); layers.push([f, B.pick(pinks)]); layers.push([new THREE.CircleGeometry(r * 0.25, 6).translate(u, v, 0.0004), '#e8649a']); }
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (i + 0.5) * px, ry = i % 2 ? ang : -ang;
      B.at([x, 0, 0], ry, () => {
        box(B, pw, H, 0.034, 0.012, 0, y0, 0, LAC_RED);
        put(B, G.plane(iw, ih), 0, y0 + H / 2, 0.0175, (p, nn, o) => o.set('#e9c46a').lerp(col('#f2d68a'), clamp((p.y - y0) / H)));
        put(B, G.plane(iw, ih).rotateY(PI), 0, y0 + H / 2, -0.0175, '#f4ead0');
        const u0 = i * iw;
        layers.forEach(([g, c], li) => { const cg = clipGeoX(g.clone(), u0, u0 + iw); if (cg) { cg.translate(-u0 - iw / 2, y0 + 0.05, 0.018 + li * 0.0003); B.add(cg, c); } });
        for (const sx of [-1, 1]) {
          for (const yy of [y0, y0 + H - 0.035]) box(B, 0.035, 0.035, 0.04, 0, sx * (pw / 2 - 0.0175), yy, 0, GOLD);
          sbox(B, 0.05, y0 + 0.01, 0.05, 0.012, sx * (pw / 2 - 0.05), 0, 0, LAC_RED);
        }
      });
    }
    for (let j = 1; j < n; j++) for (const yy of [0.3, 1.05]) cyl(B, 0.012, 0.012, 0.06, 6, -span / 2 + j * px, yy, j % 2 ? zig : -zig, GOLD);
  },

  ikebana(B) {
    sbox(B, 0.42, 0.04, 0.34, 0.015, 0, 0.26, 0, BLACK_LAC);
    box(B, 0.43, 0.006, 0.35, 0, 0, 0.272, 0, '#c8a050');
    sbox(B, 0.36, 0.022, 0.28, 0.008, 0, 0.06, 0, BLACK_LAC);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pipe(B, [sx * 0.17, 0.27, sz * 0.13], [sx * 0.185, 0.02, sz * 0.145], 0.02, BLACK_LAC, { r1: 0.016 });
      ball(B, 0.024, sx * 0.19, 0.018, sz * 0.15, BLACK_LAC, [1, 0.75, 1], 8);
    }
    lathe(B, [[0.001, 0], [0.11, 0], [0.135, 0.02], [0.15, 0.055], [0.156, 0.066], [0.146, 0.066], [0.132, 0.032], [0.001, 0.026]], 18, 0, 0.3, 0, (p, n, o) => o.set('#4a6a8a').lerp(col('#a8c8e0'), p.y > 0.36 ? 0.5 : 0));
    put(B, G.disc(0.138, 20).rotateX(-PI / 2), 0, 0.352, 0, '#7ac8e0', 'water');
    for (const [x, z] of [[0.06, 0.07], [0.08, 0.04], [-0.07, 0.08], [0.1, -0.05]]) { const g = G.ico(0.014, 0); g.scale(1, 0.6, 1); put(B, g, x, 0.353, z, '#f4f0e8'); }
    const bx = -0.03, bz = -0.02, by = 0.352;
    // iris: a fan of sword leaves, four flowers (violet, blue, white) at stepped heights, two buds
    for (const [h, a, tilt] of [[0.44, 0.3, 0.05], [0.38, 2.0, 0.12], [0.32, 3.6, 0.1], [0.28, 5.0, 0.16], [0.36, 1.2, 0.08], [0.3, 2.8, 0.18], [0.4, 4.3, 0.1], [0.24, 0.9, 0.22]]) {
      const g = bladeGeo(h, 0.028, { bend: 0.18, seg: 4, fold: 0.3, base: 0.7 }); g.rotateX(tilt); g.rotateY(a); g.translate(bx, by, bz);
      B.add(g, (p, n, o) => o.set('#3f8a3a').lerp(col('#7cc05a'), clamp((p.y - by) / h) * 0.6), 'leaf');
    }
    for (const [x, z, h, c] of [[0.0, 0.01, 0.43, '#7a5ad8'], [-0.06, -0.04, 0.33, '#5a4ac8'], [0.06, 0.04, 0.27, '#f4f0ff'], [-0.02, 0.06, 0.2, '#8a6ae0']]) {
      pipe(B, [bx, by, bz], [bx + x, by + h, bz + z], 0.008, '#4a8a3a', { k: 'leaf' });
      B.at([bx + x, by + h, bz + z], B.rand(0, 1), () => irisFlower(B, c));
    }
    for (const [x, z, h] of [[-0.02, 0.03, 0.22], [0.04, -0.03, 0.36]]) {
      pipe(B, [bx, by, bz], [bx + x, by + h, bz + z], 0.005, '#4a8a3a', { k: 'leaf' });
      B.at([bx + x, by + h + 0.02, bz + z], 0, () => { const b = G.sph(0.015, 6, 5); b.scale(1, 2.2, 1); B.add(b, '#6a5ab0', 'leaf'); });
    }
    // little yellow kerria sprays low at the front
    for (const [x, z, a] of [[0.06, 0.08, 0.6], [0.1, 0.03, 1.4]]) {
      const tip = [bx + x * 1.6, by + 0.13, bz + z * 1.6];
      pipe(B, [bx, by, bz], tip, 0.004, '#6a8a3a', { k: 'leaf' });
      for (let i = 0; i < 3; i++) { const q = V(bx, by, bz).lerp(V(...tip), 0.55 + i * 0.22), f = blossomGeo(0.018, 5, 0.5); f.rotateX(0.5); f.rotateY(a + i); f.translate(q.x, q.y + 0.004, q.z); B.add(f, '#ffd24a', 'leaf'); ball(B, 0.004, q.x, q.y + 0.008, q.z, '#ff9a3a', 1, 4, 'leaf'); }
    }
    // willow: long branches arching over and weeping, hung with narrow leaves
    const willows = [[[bx, by, bz], [bx + 0.03, 0.55, bz], [bx + 0.08, 0.76, bz + 0.01], [0.13, 0.85, 0.02], [0.19, 0.8, 0.04], [0.21, 0.64, 0.05], [0.2, 0.5, 0.06]],
      [[bx, by, bz], [bx - 0.03, 0.5, bz - 0.02], [-0.1, 0.66, -0.06], [-0.16, 0.7, -0.09], [-0.2, 0.6, -0.1], [-0.2, 0.46, -0.1]],
      [[bx, by, bz], [bx - 0.01, 0.52, bz - 0.06], [-0.04, 0.62, -0.14], [-0.08, 0.6, -0.18], [-0.1, 0.5, -0.19]]];
    for (const pts of willows) {
      curve(B, pts, t => 0.009 - t * 0.004, '#7a5a3a', { radial: 5, n: 14, k: 'leaf' });
      const C3 = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
      for (let i = 4; i < 22; i++) {
        const q = C3.getPoint(i / 22), l = twoSided(leafGeo(0.042, 0.009, 0.2));
        l.rotateZ(-1.0 - B.rand(0, 0.5)); l.rotateY(B.rand(0, TAU)); l.translate(q.x, q.y, q.z);
        B.add(l, B.pick(['#8ccf6a', '#a8dc78', '#7cc05a']), 'leaf');
      }
    }
  },

  bonsaiStand(B) {
    const wd = '#74503a';
    sbox(B, 0.44, 0.045, 0.34, 0.015, 0, 0.33, 0, wd);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(B, 0.05, 0.33, 0.05, 0.012, sx * 0.18, 0, sz * 0.13, wd); ball(B, 0.03, sx * 0.186, 0.02, sz * 0.136, wd, [1, 0.7, 1], 8); }
    for (const sz of [-1, 1]) put(B, G.beam(0.32, 0.05, 0.022, 0.008), 0, 0.3, sz * 0.13, '#6e4a3a');
    sbox(B, 0.32, 0.075, 0.22, 0.02, 0, 0.385, 0, '#3f6a9a');
    box(B, 0.326, 0.012, 0.226, 0, 0, 0.445, 0, '#5a86b8');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B, 0.03, 0.012, 0.03, 0, sx * 0.13, 0.375, sz * 0.08, '#2f5a88');
    sbox(B, 0.29, 0.014, 0.19, 0.005, 0, 0.45, 0, '#7cae5a');
    for (const [x, z] of [[0.08, 0.05], [-0.1, -0.04], [0.11, -0.06]]) ball(B, 0.022, x, 0.464, z, '#8cc06a', [1, 0.35, 1], 6);
    const rk = G.ico(0.035, 0); rk.scale(1.2, 0.7, 1); put(B, rk, 0.09, 0.47, 0.02, '#a8a0a8');
    // a twisty old pine: thick trunk with a bend, roots, branches ending in needle pads
    const trunk = [[-0.05, 0.455, 0.0], [-0.02, 0.52, 0.02], [-0.065, 0.6, 0.0], [-0.005, 0.67, -0.02], [0.05, 0.72, 0.0], [0.02, 0.79, 0.01]];
    const bark = (p, n, o) => o.set('#6e4a3a').lerp(col('#a07a5e'), clamp(0.3 + 0.4 * Math.sin(p.y * 60 + Math.atan2(n.z, n.x) * 2)));
    curve(B, trunk, t => 0.042 - t * 0.03, bark, { radial: 7, n: 14 });
    for (const a of [0.4, 2.4, 4.3]) curve(B, [[-0.05, 0.48, 0], [-0.05 + Math.cos(a) * 0.05, 0.462, Math.sin(a) * 0.05], [-0.05 + Math.cos(a) * 0.08, 0.455, Math.sin(a) * 0.08]], t => 0.022 - t * 0.014, bark, { radial: 5, n: 5 });
    const branches = [[[-0.055, 0.6, 0.0], [-0.1, 0.62, 0.02], [-0.135, 0.635, 0.045], [-0.14, 0.65, 0.045], 0.075], [[0.04, 0.71, -0.005], [0.085, 0.71, 0.01], [0.125, 0.725, 0.03], [0.125, 0.74, 0.03], 0.072],
      [[-0.01, 0.67, -0.02], [-0.03, 0.71, -0.07], [-0.06, 0.745, -0.1], [-0.06, 0.76, -0.1], 0.07]];
    for (const [a, b, c, pad, R] of branches) { curve(B, [a, b, c], t => 0.016 - t * 0.008, bark, { radial: 5, n: 6 }); needlePad(B, pad, R); }
    needlePad(B, [0.02, 0.82, 0.01], 0.085);
  },

  hangingScroll(B) {
    const W = 0.36, top = 0.92, bot = 0.07, pw = 0.27, py0 = 0.25, py1 = 0.8;
    ball(B, 0.012, 0, 0.982, 0.012, GOLD, 1, 6);
    for (const s of [-1, 1]) B.add(bar(V(s * 0.13, top + 0.01, 0.016), V(0, 0.98, 0.012), 0.004, 0), '#c8a060');
    pipe(B, [-W / 2 - 0.012, top, 0.016], [W / 2 + 0.012, top, 0.016], 0.013, '#8a5a3a');
    // two silk tassels hanging from the top rod's ends
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.004);
      cyl(B, 0.0035, 0.0035, 0.07, 4, x, top - 0.08, 0.03, '#7a4ab0');
      ball(B, 0.011, x, top - 0.085, 0.03, '#d8b860', 1, 6);
      B.add(quadPaint(G.lathe([[0.001, 0], [0.016, 0.003], [0.012, 0.03], [0.006, 0.05], [0.001, 0.054]], 8), 5, (i, j, o) => o.set(i % 2 ? '#8a5ac8' : '#a878d8')).translate(x, top - 0.145, 0.03), null);
    }
    box(B, W, top - bot - 0.012, 0.006, 0, 0, bot + 0.006, 0.008, (p, n, o) => o.set('#557a78').multiplyScalar(0.94 + 0.06 * Math.sin(p.y * 90)));
    for (const y of [py1, py0 - 0.03]) box(B, pw + 0.024, 0.03, 0.002, 0, 0, y, 0.0115, '#d8b860');
    box(B, pw, py1 - py0, 0.002, 0, 0, py0, 0.012, '#f6eedc');
    const Z = 0.0135, L = (g, c, k = 0) => put(B, g, 0, 0, Z + k * 0.0004, c);
    L(G.disc(0.075, 24).translate(0.045, 0.645, 0), '#f2d68a');
    L(new THREE.ShapeGeometry(new THREE.Shape([[-0.135, 0.256], [-0.135, 0.3], [-0.08, 0.35], [-0.03, 0.31], [0.03, 0.37], [0.09, 0.32], [0.135, 0.34], [0.135, 0.256]].map(p => new THREE.Vector2(...p)))), '#c8c0b8', 1);
    L(stroke([[-0.13, 0.42], [-0.04, 0.44], [0.05, 0.425], [0.13, 0.44]], 0.014, 1, 0, 0, 10), '#d8d2c8', 1);
    L(stroke([[-0.1, 0.47], [0.0, 0.485], [0.08, 0.47]], 0.01, 1, 0, 0, 8), '#d8d2c8', 1);
    // the crane, wings spread, flying past the moon
    const wing = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(...p))));
    L(wing([[-0.03, 0.56], [-0.07, 0.63], [-0.13, 0.67], [-0.115, 0.63], [-0.09, 0.6], [0.0, 0.565]]), '#ffffff', 2);
    L(wing([[-0.13, 0.67], [-0.155, 0.69], [-0.14, 0.655], [-0.115, 0.63]]), INK, 3);
    L(wing([[-0.02, 0.545], [-0.08, 0.5], [-0.14, 0.49], [-0.12, 0.515], [-0.06, 0.54]]), '#f4f0ea', 2);
    L(wing([[-0.14, 0.49], [-0.165, 0.482], [-0.15, 0.505], [-0.12, 0.515]]), INK, 3);
    L(ell(0.048, 0.017).rotateZ(0.25).translate(-0.02, 0.555, 0), '#ffffff', 3);
    L(stroke([[0.02, 0.566], [0.055, 0.586], [0.09, 0.6]], 0.008, 1, 0, 0, 6), INK, 4);
    L(G.disc(0.009, 10).translate(0.095, 0.602, 0), '#ffffff', 4);
    L(G.disc(0.0045, 8).translate(0.096, 0.609, 0), '#e8403a', 5);
    L(stroke([[0.1, 0.6], [0.125, 0.596]], 0.004, 1), '#8a7a3a', 5);
    L(stroke([[-0.06, 0.548], [-0.12, 0.53], [-0.15, 0.52]], 0.0035, 1), INK, 4);
    L(new THREE.ShapeGeometry(roundRect(0.018, 0.018, 0.003, -0.105, 0.29)), '#d8403a', 2); // the red seal
    for (const s of [-1, 1]) { const g = G.plane(0.02, 0.12, 1, 2); g.translate(s * 0.06, top - 0.065, 0.016); B.cloth(g, '#3e5c5c', { x0: -0.2, x1: 0.2, yTop: top, yBot: top - 0.13 }); }
    // the bottom roller with big turned end knobs (dark wood with ivory caps)
    pipe(B, [-W / 2 - 0.01, bot, 0.02], [W / 2 + 0.01, bot, 0.02], 0.019, '#8a5a3a');
    for (const s of [-1, 1]) {
      const k = G.lathe([[0.001, 0], [0.026, 0], [0.032, 0.012], [0.03, 0.026], [0.022, 0.036], [0.001, 0.04]], 12); k.rotateZ(-s * PI / 2); put(B, k, s * (W / 2 + 0.008), bot, 0.02, (p, n, o) => o.set(Math.abs(p.x) > W / 2 + 0.03 ? '#f0e6d0' : '#6e4630'));
    }
  },

  irori(B) {
    const woodT = '#a06a44', pole = '#9a7a4a';
    for (const sz of [-1, 1]) sbox(B, 0.96, 0.14, 0.12, 0.03, 0, 0, sz * 0.42, woodT);
    for (const sx of [-1, 1]) sbox(B, 0.12, 0.14, 0.72, 0.03, sx * 0.42, 0, 0, woodT);
    // ash raked in rings, a dark charcoal bed, glowing coals and little flames
    B.add(pillowGeo(0.74, 0.125, 0.74, { sq: 0.12, edge: 0.18, bot: 0.1, ws: 20, hs: 8 }), (p, n, o) => { const r = Math.hypot(p.x, p.z); o.set('#d6ccc0').multiplyScalar(0.9 + 0.1 * nz(p.x * 18, p.z * 18) - (Math.sin(r * 70) > 0.6 ? 0.06 : 0)); if (r < 0.12) o.lerp(col('#5a4e4c'), clamp((0.12 - r) / 0.05)); });
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, g = G.box(0.06, 0.04, 0.035, 0); g.rotateY(a + 0.4); g.rotateZ(B.wob(0.3)); put(B, g, Math.cos(a) * 0.06, 0.132, Math.sin(a) * 0.06, i % 3 ? '#3a3036' : '#4a3a38'); }
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + 0.3, rr = B.rand(0.02, 0.1), e = G.ico(B.rand(0.012, 0.02), 0); e.translate(Math.cos(a) * rr, 0.148 + B.rand(0, 0.015), Math.sin(a) * rr); B.glow(e, B.pick(['#ff6a2a', '#ff8a3a', '#ffb050']), { hot: true, flicker: 1, tint: 1 }); }
    // two charred logs crossed in the coals, and a plump teardrop fire on them (an orange flame round a yellow heart)
    for (const [a, c] of [[0.5, '#5a3e30'], [-0.6, '#6a4836']]) { const g = G.cyl(0.03, 0.034, 0.26, 8); g.rotateZ(PI / 2); g.rotateY(a); put(B, g, 0, 0.158, 0, (p, n, o) => o.set(c).lerp(col('#ff7a3a'), clamp(-n.y) * 0.5)); }
    const flame = (x, z, h, r, c0, c1, y = 0.17) => {
      const pts = []; for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([Math.max(0.001, r * Math.sin(PI * Math.min(1, t * 1.25)) ** 0.7 * (1 - t) ** 0.55 + (i === 9 ? 0 : 0.001)), t * h]); }
      const f = G.lathe(pts, 10); f.translate(x, y, z);
      B.glow(f, (p, n, o) => o.set(c0).lerp(col(c1), clamp((p.y - y) / h * 1.1)), { hot: true, flicker: 1, tint: 1 });
    };
    flame(0, 0, 0.25, 0.075, '#e8401a', '#ff9a30'); flame(0.06, 0.03, 0.16, 0.05, '#ee4a1a', '#ffa83a'); flame(-0.055, -0.035, 0.18, 0.05, '#ee4a1a', '#ffa83a'); flame(0.0, 0.035, 0.12, 0.036, '#ffb030', '#ffe080', 0.18);
    // iron fire tongs stuck in the ash, a few split logs on the frame
    for (const s of [-1, 1]) pipe(B, [0.2 + s * 0.012, 0.11, 0.2], [0.27 + s * 0.016, 0.33, 0.27], 0.006, IRON);
    for (const [x, y, ry] of [[0.39, 0.17, 0.05], [0.45, 0.17, -0.06], [0.42, 0.222, 0.02]]) { const g = G.cyl(0.03, 0.03, 0.3, 7); g.rotateX(PI / 2); g.rotateY(ry); put(B, g, x, y, -0.05, (p, n, o) => o.set(Math.abs(n.z) > 0.8 ? '#f0cc98' : '#8a5e44')); }
    // three little fish grilling on skewers stuck in the ash
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + 0.9, A = [Math.cos(a) * 0.27, 0.11, Math.sin(a) * 0.27], Bp = [Math.cos(a) * 0.15, 0.36, Math.sin(a) * 0.15];
      pipe(B, A, Bp, 0.006, '#e8c890');
      const dir = V(...Bp).sub(V(...A)).normalize(), c = V(...A).lerp(V(...Bp), 0.72);
      const body = G.sph(1, 8, 6); body.scale(0.02, 0.055, 0.011); alignY(body, dir); body.translate(c.x, c.y, c.z);
      B.add(body, (p, n, o) => o.set('#c8a888').lerp(col('#7a6a5a'), clamp(n.y * 0.6)));
      const tail = G.cone(0.02, 0.03, 4); tail.scale(1, 1, 0.3); alignY(tail, dir.clone().negate()); const tp = c.clone().addScaledVector(dir, -0.065); tail.translate(tp.x, tp.y, tp.z); B.add(tail, '#a88a6a');
    }
    // a lashed bamboo tripod over the hearth carries the jizai-kagi: bamboo pole, carp lever, iron hook, kettle
    const apex = V(0, 1.12, 0);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42]]) {
      const foot = V(x, 0.14, z), dir = apex.clone().sub(foot).normalize(), L = apex.distanceTo(foot) + 0.09;
      const g = bambooPole(L, 0.034, { node: 0.3, c: '#c8b070', nodeC: '#8a7440', cut: '#f0e2b0', seg: 8 });
      alignY(g, dir); put(B, g, foot.x, foot.y, foot.z, null);
      ball(B, 0.04, foot.x, foot.y + 0.006, foot.z, '#8a7440', [1, 0.5, 1], 8);
    }
    // a fat rope lashing at the apex, with a tied tail
    for (const [y, r] of [[1.07, 0.06], [1.1, 0.064], [1.13, 0.058]]) { const t = G.torus(r, 0.014, 5, 14); t.rotateX(PI / 2); put(B, t, 0, y, 0, '#d8b878'); }
    curve(B, [[0.05, 1.08, 0.03], [0.09, 1.0, 0.05], [0.1, 0.93, 0.05]], t => 0.011 - t * 0.004, '#d8b878', { radial: 5, n: 5 });
    cyl(B, 0.024, 0.024, 0.42, 8, 0, 0.68, 0, '#c8c070');
    for (const y of [0.75, 0.9, 1.0]) { const r = G.torus(0.026, 0.006, 4, 10); r.rotateX(PI / 2); put(B, r, 0, y, 0, '#9a9a48'); }
    B.at([0, 0.86, 0], 0.5, () => {
      const body = G.sph(1, 12, 8); body.scale(0.12, 0.045, 0.028);
      B.add(faceColors(body, (p, n, o, c) => o.set((Math.floor(c.x * 60) + Math.floor(c.y * 60)) % 2 ? '#a8784e' : '#946640')), null);
      const tl = new THREE.Shape(); tl.moveTo(0, 0); tl.lineTo(-0.07, 0.05); tl.quadraticCurveTo(-0.055, 0, -0.07, -0.05); tl.lineTo(0, 0);
      put(B, extrude(tl, 0.012, 0.004), -0.1, 0, -0.01, '#946640');
      for (const s of [-1, 1]) { ball(B, 0.008, 0.085, 0.012, s * 0.024, INK, 1, 5); const f = G.cone(0.016, 0.03, 4); f.scale(1, 1, 0.3); f.rotateZ(PI * 0.7); put(B, f, 0.02, -0.04, s * 0.012, '#946640'); }
      const fin = G.cone(0.02, 0.035, 4); fin.scale(1.6, 1, 0.25); put(B, fin, -0.01, 0.055, 0, '#946640');
    });
    curve(B, [[0, 0.7, 0], [0, 0.69, 0.0], [0.016, 0.68, 0], [0.0, 0.668, 0]], 0.009, IRON, { radial: 5, n: 6 });
    B.at([0, 0.44, 0], 0, () => {
      B.push([0, 0, 0], 0, 1.25); // a plump kettle, sitting high enough over the bigger fire
      const prof = [[0.001, 0], [0.07, 0], [0.105, 0.03], [0.115, 0.07], [0.1, 0.11], [0.06, 0.13], [0.001, 0.13]];
      B.add(quadPaint(G.lathe(prof, 14), prof.length, (i, j, o) => o.set((i + j) % 2 ? '#4a3e3a' : '#5e524c')), null);
      lathe(B, [[0.001, 0.125], [0.05, 0.125], [0.045, 0.138], [0.001, 0.142]], 12, 0, 0, 0, '#54484a');
      ball(B, 0.014, 0, 0.148, 0, '#c8a050', 1, 6);
      curve(B, [[0.09, 0.06, 0], [0.13, 0.08, 0.0], [0.15, 0.11, 0.0]], t => 0.016 - t * 0.007, '#4a3e3a', { radial: 6, n: 5, cap: false });
      const bail = G.torus(0.09, 0.008, 4, 12, PI); bail.rotateY(PI / 2); put(B, bail, 0, 0.11, 0, '#2e2c34');
      B.pop();
    });
  },
};

// =================================================================== Bamboo Grove
/** a bamboo pole along +y (length L, radius r) with node rings, cut ends; returns the geometry, painted */
function bambooPole(L, r, { node = 0.28, c = '#c8c870', nodeC = '#9a9a50', cut = '#f0e6b0', seg = 7 } = {}) {
  const pts = [[0.001, 0], [r * 0.92, 0], [r, 0.008]];
  const nN = Math.max(1, Math.round(L / node));
  for (let i = 1; i < nN; i++) { const y = i * L / nN; pts.push([r, y - 0.012], [r * 1.14, y], [r, y + 0.012]); }
  pts.push([r, L - 0.008], [r * 0.92, L], [0.001, L]);
  const nodes = Array.from({ length: nN - 1 }, (_, i) => (i + 1) * L / nN), base = col(c), nc = col(nodeC), cc = col(cut);
  return paint(G.lathe(pts, seg), (p, n, o) => {
    if (Math.abs(n.y) > 0.7) { o.copy(cc).lerp(nc, clamp((Math.hypot(p.x, p.z) / r - 0.6) * 2)); return; }
    o.copy(base).multiplyScalar(0.94 + 0.08 * clamp(n.x * 0.5 + 0.5));
    for (const y of nodes) if (Math.abs(p.y - y) < 0.004) o.copy(nc);
  });
}

const BAMBOO = {
  bambooPlanter(B) {
    // a plump celadon-glazed pot: the glaze runs in a wavy edge over a bare clay foot, a rolled lip, a gold cord with a
    // red lucky bow round the neck, a bed of smooth river pebbles
    const pot = [[0.001, 0], [0.122, 0], [0.136, 0.006], [0.142, 0.02], [0.15, 0.034], [0.162, 0.05], [0.172, 0.066], [0.186, 0.1], [0.195, 0.14], [0.193, 0.18], [0.182, 0.212], [0.168, 0.232], [0.172, 0.244], [0.184, 0.254], [0.186, 0.266], [0.177, 0.273], [0.163, 0.266], [0.157, 0.25], [0.001, 0.246]];
    const glazeY = a => 0.05 + 0.011 * Math.sin(a * 5) + 0.006 * Math.sin(a * 11 + 1);
    const GZ0 = col('#3f9a8a'), GZ1 = col('#9adcc8'), CLAY = col('#d8a27a');
    lathe(B, pot, 22, 0, 0, 0, (p, n, o) => {
      const a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z), gy = glazeY(a);
      if (p.y > 0.244 && r < 0.158) { o.set('#6a4e3e'); return; }
      if (p.y < gy - 0.004) { o.copy(CLAY).multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.5)); return; }
      o.copy(GZ0).lerp(GZ1, clamp((p.y - 0.05) / 0.2) * 0.75).lerp(col('#effff8'), clamp(n.y) * 0.3 + clamp(n.x * 0.6 + n.z * 0.3 - 0.45) * 0.4);
      if (p.y < gy + 0.016) o.multiplyScalar(0.78);
    });
    const cord = G.torus(0.172, 0.0072, 4, 26); cord.rotateX(PI / 2); put(B, cord, 0, 0.234, 0, GOLD);
    B.at([0.075, 0.222, 0.168], 0.42, () => bow(B, { s: 0.115, color: '#e8403a' }));
    const peb = ['#f4f0e8', '#e2dcd4', '#d0c8c2', '#fffaf2', '#c8c0c8'];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.39996, rr = 0.035 + Math.sqrt((i + 0.5) / 11) * 0.105, x = Math.sin(a) * rr, z = Math.cos(a) * rr, s = B.rand(0.019, 0.027);
      const g = G.sph(1, 6, 4); g.scale(s * 1.25, s * 0.55, s); g.rotateY(B.rand(0, PI)); put(B, g, x, 0.248, z, B.pick(peb));
    }
    // three fat stalks of different heights leaning apart (a little grove), each crowned with layered leaf sprays and
    // with side sprays at its upper nodes
    const stalks = [[-0.058, -0.045, 1.42, 0.058, [-0.05, -0.03], 5], [0.07, -0.035, 1.12, 0.054, [0.06, -0.035], 4], [-0.008, 0.072, 0.82, 0.05, [0.0, 0.07], 3]];
    for (const [x, z, H, r, [lx, lz], nodes] of stalks) {
      const L = H - 0.27, g = bambooStalkGeo(L, r, nodes, { seg: 8 }), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + lx * y); p.setZ(i, p.getZ(i) + lz * y); }
      g.computeVertexNormals(); put(B, g, x, 0.24, z, null);
      const at = y => [x + lx * y, 0.24 + y, z + lz * y], az0 = Math.atan2(lx, lz), tp = at(L + 0.02);
      // the crown: four arching sprays round the tip, a few young leaves standing up in the middle
      // two tiers: long leaves arching out and drooping, shorter ones above them, a tuft standing up in the middle
      for (let k = 0; k < 5; k++) bambooSpray(B, tp, az0 + k * TAU / 5 + 0.3 + B.wob(0.2), { n: 5, L: 0.25, W: 0.06, up: 0.02, out: 0.035, spread: 0.6, tilt: [1.05, 1.55] });
      for (let k = 0; k < 5; k++) bambooSpray(B, [tp[0], tp[1] + 0.025, tp[2]], az0 + (k + 0.5) * TAU / 5 + 0.3 + B.wob(0.2), { n: 4, L: 0.2, W: 0.054, up: 0.02, out: 0.02, spread: 0.55, tilt: [0.55, 0.95] });
      bambooSpray(B, [tp[0], tp[1] + 0.03, tp[2]], az0, { n: 5, L: 0.17, W: 0.048, up: 0, out: 0, spread: PI * 0.8, tilt: [0.12, 0.4] });
      // layered side sprays at the upper nodes, alternating sides
      for (let k = 1; k <= Math.min(3, nodes - 1); k++) { const y = L - k * L / nodes, s = k % 2 ? 1 : -1; bambooSpray(B, at(y), az0 + s * 1.4 + B.wob(0.4), { n: 6, L: 0.21, W: 0.054, up: 0.05, out: 0.09, spread: 0.7, tilt: [0.85, 1.35] }); }
    }
  },

  bambooBench(B) {
    const bam = '#cfc878', node = '#9a9a50', cut = '#f2e8b8', rope = '#c8503a';
    const pole = (L, r, x, y, z, axis, c = bam) => {
      const g = bambooPole(L, r, { node: 0.36, c, nodeC: node, cut, seg: 6 }); g.translate(0, -L / 2, 0);
      if (axis === 'x') g.rotateZ(-PI / 2); else if (axis === 'z') g.rotateX(PI / 2);
      put(B, g, x, y, z, null);
    };
    for (let i = 0; i < 5; i++) pole(1.44, 0.03, 0, 0.33, -0.16 + i * 0.08, 'x', shade(bam, 0.94 + 0.06 * (i % 2)));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) { pole(0.34, 0.034, sx * 0.6, 0.17, sz * 0.17, 'y'); }
      pole(0.44, 0.026, sx * 0.6, 0.29, 0, 'z');
      pole(0.42, 0.022, sx * 0.6, 0.1, 0, 'z');
      for (const sz of [-1, 1]) for (const y of [0.29, 0.1]) { const t = G.torus(0.04, 0.009, 4, 10); t.rotateX(PI / 2); put(B, t, sx * 0.6, y, sz * 0.17, rope); }
    }
    for (const sz of [-1, 1]) pole(1.2, 0.022, 0, 0.1, sz * 0.17, 'x');
    const cols = ['#9fdcc4', '#fff6e6', '#7cc06a', '#fff6e6'];
    put(B, softSheet(1.24, 0.34, { drop: 0.075, nx: 20, nz: 3, sk: 2, bulge: 0.026, color: X => cols[((Math.floor((X + 0.7) / 0.07) % 4) + 4) % 4] }), 0, 0.43, 0, null);
    for (const x of [-0.4, 0, 0.4]) ball(B, 0.016, x, 0.452, 0, '#5aa84a', [1, 0.5, 1], 8);
  },

  bambooLantern(B) {
    // a round wooden plinth with a lighter top and a few river pebbles
    lathe(B, [[0.001, 0], [0.18, 0], [0.19, 0.02], [0.182, 0.048], [0.15, 0.06], [0.12, 0.064], [0.001, 0.064]], 20, 0, 0, 0, (p, n, o) => o.set(n.y > 0.7 ? '#b8845a' : '#8a5a3a'));
    for (const [x, z] of [[0.15, 0.06], [-0.13, 0.09], [0.11, -0.12], [-0.06, 0.15]]) { const g = G.ico(0.02, 0); g.scale(1, 0.6, 1); put(B, g, x, 0.066, z, '#d8d0c8'); }
    const R = 0.105, y0 = 0.06, slant = (g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.94) p.setY(i, 0.9 - 0.06 * p.getZ(i) / R); g.computeVertexNormals(); return g; };
    const outer = slant(G.lathe([[0.001, y0], [R, y0], [R, 0.33], [R * 1.1, 0.35], [R, 0.37], [R, 0.66], [R * 1.1, 0.68], [R, 0.7], [R, 0.96], [R - 0.012, 0.96]], 20));
    B.add(outer, (p, n, o) => { o.set('#80c060').multiplyScalar(0.9 + 0.12 * clamp(n.x * 0.5 + 0.5)); if (Math.hypot(p.x, p.z) > R * 1.04) o.set('#5a9a48'); if (n.y > 0.5 && p.y > 0.8) o.set('#e8f0b0'); });
    B.glow(slant(G.lathe([[R - 0.012, 0.96], [R - 0.012, 0.12], [0.001, 0.12]], 20)), '#ffe6a0', { flicker: 0.6, tint: 0.5 });
    // node rings and a rolled lip around the slanted cut
    for (const y of [0.35, 0.68]) { const r = G.torus(R * 1.08, 0.011, 4, 22); r.rotateX(PI / 2); put(B, r, 0, y, 0, '#4f8a3c'); }
    const lip = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; lip.push(V(Math.sin(a) * (R - 0.004), 0.9 - 0.06 * Math.cos(a), Math.cos(a) * (R - 0.004))); }
    B.add(tube(lip.map(p => ({ p, r: 0.009 })), 5, false), '#d8eca0');
    // little leaf-shaped windows (carved: a dark rim around each) letting the light out
    const leafS = (L, W) => { const s = new THREE.Shape(); s.moveTo(0, -L / 2); s.quadraticCurveTo(W, 0, 0, L / 2); s.quadraticCurveTo(-W, 0, 0, -L / 2); return new THREE.ShapeGeometry(s, 4); };
    const wins = [[-0.5, 0.22, 0.4], [0.2, 0.27, -0.5], [0.9, 0.21, 0.9], [1.6, 0.26, -0.3], [2.3, 0.23, 0.6], [-0.2, 0.47, -0.7], [0.5, 0.52, 0.3], [1.2, 0.45, -0.9], [1.9, 0.5, 0.2], [-0.9, 0.5, 0.8], [0.1, 0.8, 0.5], [0.8, 0.82, -0.4], [1.5, 0.78, 0.7], [-0.6, 0.8, -0.2], [2.4, 0.8, -0.6]];
    for (const [a, y, rot] of wins) {
      const rimG = leafS(0.074, 0.036); rimG.rotateZ(rot); rimG.translate(0, y, 0); B.add(wrapLathe(rimG, () => R, a, 0.001), '#4a7a34');
      const g = leafS(0.062, 0.028); g.rotateZ(rot); g.translate(0, y, 0.0006); B.glow(wrapLathe(g, () => R, a, 0.0015), '#fff0b8', { flicker: 0.6, tint: 0.45 });
    }
    for (const [a, y] of [[0.55, 0.3], [-0.15, 0.6], [1.25, 0.6], [0.45, 0.72], [1.8, 0.3]]) B.glow(wrapLathe(new THREE.CircleGeometry(0.011, 8).translate(0, y, 0), () => R, a, 0.0015), '#fff0b8', { flicker: 0.6, tint: 0.45 });
    const cord = G.torus(R + 0.006, 0.007, 4, 18); cord.rotateX(PI / 2); put(B, cord, 0, 0.75, 0, '#e8403a');
    ball(B, 0.014, 0, 0.75, R + 0.012, '#e8403a', 1, 6);
    B.add(quadPaint(G.lathe([[0.001, 0], [0.02, 0.003], [0.015, 0.035], [0.008, 0.06], [0.001, 0.064]], 8), 5, (i, j, o) => o.set(i % 2 ? '#e8403a' : '#ff6a5a')).translate(0, 0.672, R + 0.016), null);
  },
};

// =================================================================== Maple Hollow
const MAPLE = {
  mapleRug(B) {
    // two felt leaves: a big one fading from an orange heart to red lobes, and a smaller golden one tossed over its
    // lower-right lobe (draped over the felt's edge). Thick felt with a rolled edge; running stitches in contrasting
    // thread trace the veins and a border just inside the edge.
    const hM = 0.024, hY = 0.013;
    const LEAVES = { main: { sc: 0.6, cx: -0.1, cz: 0.08, rot: 0 }, gold: { sc: 0.37, cx: 0.27, cz: 0.27, rot: 1.1 } };
    const placer = L => (u, v) => [L.cx + u * Math.cos(L.rot) + v * Math.sin(L.rot), L.cz + u * Math.sin(L.rot) - v * Math.cos(L.rot)];
    const local = L => (x, z) => { const dx = x - L.cx, dz = z - L.cz; return [dx * Math.cos(L.rot) + dz * Math.sin(L.rot), dx * Math.sin(L.rot) - dz * Math.cos(L.rot)]; };
    const M = LEAVES.main, Y = LEAVES.gold, RfM = t => M.sc * mapleFat(t), RfY = t => Y.sc * mapleFat(t);
    const depth = (L, Rf) => { const lo = local(L); return (x, z) => { const [u, v] = lo(x, z); return Rf(Math.atan2(u, v)) - Math.hypot(u, v); }; };
    const dM = depth(M, RfM), dY = depth(Y, RfY), lift = (x, z) => hM * sstep(-0.006, 0.026, dM(x, z));
    const felt = (x, z) => 0.955 + 0.045 * nz(x * 34, z * 34) + 0.02 * nz(x * 90, z * 90);
    const cO = col('#ffa646'), cM = col('#f46a3c'), cR = col('#dc3e2e'), cE = col('#b42c26');
    B.add(feltSlab(RfM, placer(M), { N: 128, K: 4, M: 3, h: hM, color: (s, x, z, o) => {
      if (s > 1) o.copy(cR).lerp(cE, clamp((s - 1) * 1.4)).multiplyScalar(1.04 - 0.3 * clamp(s - 1.3)); else { const t = s ** 1.15; o.copy(cO).lerp(cM, clamp(t * 1.7)).lerp(cR, clamp(t * 1.7 - 0.75)); }
      o.multiplyScalar(felt(x, z));
    } }), null);
    const gO = col('#ffe48a'), gM = col('#ffc23a'), gE = col('#ee9a2e');
    B.add(feltSlab(RfY, placer(Y), { N: 96, K: 7, M: 3, h: hY, lift, color: (s, x, z, o) => {
      o.copy(gO).lerp(gM, clamp(s * 1.6)).lerp(gE, clamp(s * 1.6 - 0.9) + clamp(s - 1) * 0.6); o.multiplyScalar(felt(x + 3, z) * (1.03 - 0.28 * clamp(s - 1.3)));
    } }), null);
    // felt stems
    for (const [L, h, pts, r, c] of [[M, hM, [[0, -0.12], [0.012, -0.36], [0.05, -0.52]], 0.017, '#b8402c'], [Y, hY, [[0, -0.12], [-0.01, -0.36], [-0.05, -0.5]], 0.015, '#e09030']]) {
      const pl = placer(L), P3 = pts.map(([u, v]) => { const [x, z] = pl(u * L.sc, v * L.sc); return V(x, 0, z); });
      const g = tube(new THREE.CatmullRomCurve3(P3).getPoints(9).map((p, i) => ({ p: p.setY(((L === Y ? lift(p.x, p.z) : 0) + h * 0.55) / 0.6), r: r * (1 - i / 9 * 0.35) })), 7, true);
      g.scale(1, 0.6, 1); B.add(g, (p, n, o) => o.set(c).multiplyScalar(0.9 + 0.12 * clamp(n.y)));
    }
    // stitched veins (midribs to the lobe tips, side veins) and a running border, cream on the red leaf, rust on the gold
    const veinsOf = (L) => {
      const pl = placer(L), out = [];
      for (const [a, len] of MAPLE_FAT) {
        const tip = [Math.sin(a) * len * 0.8, Math.cos(a) * len * 0.8], b0 = [0, -0.03];
        const bend = [-Math.cos(a) * 0.02, Math.sin(a) * 0.02], midp = [tip[0] * 0.5 + bend[0], tip[1] * 0.5 + bend[1] - 0.015];
        out.push(spline2([b0, midp, tip], 8).map(([u, v]) => pl(u * L.sc, v * L.sc)));
        if (len > 0.5) for (const f of [0.42, 0.66]) for (const s of [-1, 1]) {
          const m = [b0[0] + (tip[0] - b0[0]) * f, b0[1] + (tip[1] - b0[1]) * f], da = a + s * 0.78, vl = len * 0.17;
          out.push([pl(m[0] * L.sc, m[1] * L.sc), pl((m[0] + Math.sin(da) * vl) * L.sc, (m[1] + Math.cos(da) * vl) * L.sc)]);
        }
      }
      out.push([[0, -0.04], [0.008, -0.3], [0.03, -0.46]].map(([u, v]) => pl(u * L.sc, v * L.sc)));
      return out;
    };
    const borderOf = (L, Rf, inset) => {
      const pl = placer(L), n = 160, P = [];
      for (let i = 0; i < n; i++) { const t = i / n * TAU - PI, r = Math.max(0.02, Rf(t) - inset * 1.25); P.push(pl(Math.sin(t) * r, Math.cos(t) * r)); }
      for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) { const a = P[(i + n - 1) % n], c = P[(i + 1) % n]; P[i] = [(a[0] + 2 * P[i][0] + c[0]) / 4, (a[1] + 2 * P[i][1] + c[1]) / 4]; }
      P.push(P[0]);
      return P;
    };
    const sm = [], sy = [], underGold = (x, z) => dY(x, z) > -0.016;
    for (const path of [...veinsOf(M), borderOf(M, RfM, 0.034)]) stitchRun(sm, path, () => hM + 0.0004, { skip: underGold, dash: 0.026, gap: 0.016, w: 0.0095 });
    for (const path of [...veinsOf(Y), borderOf(Y, RfY, 0.022)]) stitchRun(sy, path, (x, z) => lift(x, z) + hY + 0.0004, { dash: 0.02, gap: 0.013, w: 0.008, t: 0.003 });
    B.add(geoOf(sm), '#fff2d8');
    B.add(geoOf(sy), '#c0542c');
  },

  acornStool(B) {
    B.push([0, 0, 0], 0, [0.94, 1, 0.94]);
    const nutP = [[0.001, 0], [0.07, 0], [0.12, 0.025], [0.17, 0.08], [0.2, 0.15], [0.21, 0.21], [0.205, 0.26], [0.19, 0.29], [0.001, 0.29]];
    lathe(B, nutP, 26, 0, 0, 0, (p, n, o) => o.set('#b8703a').lerp(col('#e4a464'), clamp(p.y / 0.26) * 0.6).multiplyScalar(0.95 + 0.05 * Math.sin(Math.atan2(p.x, p.z) * 14)));
    const capP = [[0.001, 0.255], [0.2, 0.255], [0.228, 0.268], [0.242, 0.29], [0.24, 0.315], [0.228, 0.338], [0.205, 0.362], [0.17, 0.382], [0.12, 0.398], [0.06, 0.408], [0.001, 0.411]];
    const cap = G.lathe(capP, 26), cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) { const j = i % capP.length; if (j > 2 && j < capP.length - 1 && j % 2) { cp.setX(i, cp.getX(i) * 1.03); cp.setZ(i, cp.getZ(i) * 1.03); cp.setY(i, cp.getY(i) + 0.003); } }
    cap.computeVertexNormals();
    B.add(quadPaint(cap, capP.length, (i, j, o) => { o.set(j === 0 ? '#6a4026' : ((i >> 1) + j) % 2 ? '#9a6638' : '#8a5a33'); }), null);
    curve(B, [[0, 0.405, 0], [0.006, 0.428, 0], [0.024, 0.446, 0.004]], t => 0.02 - t * 0.008, '#7a4c2c', { radial: 6, n: 5 });
    // a tiny happy face on the front of the nut
    const Rf = profR(nutP.slice(0, 8)), zAt = (x, y) => Math.sqrt(Math.max(0, Rf(y) ** 2 - x * x));
    for (const s of [-1, 1]) {
      ball(B, 0.015, s * 0.055, 0.172, zAt(s * 0.055, 0.172), INK, [1, 1.3, 0.45], 8);
      ball(B, 0.005, s * 0.055 + 0.004, 0.18, zAt(s * 0.055, 0.18) + 0.006, '#ffffff', 1, 5);
      ball(B, 0.022, s * 0.1, 0.142, zAt(s * 0.1, 0.142) - 0.004, '#ff9eb0', [1, 0.6, 0.3], 8);
    }
    const sm = G.torus(0.017, 0.0045, 3, 8, PI); sm.rotateZ(PI); put(B, sm, 0, 0.148, zAt(0, 0.148), INK);
    B.pop();
  },

  mapleWreath(B) {
    const cy = 0.25, R = 0.15, z0 = 0.045;
    const ring = faceColors(G.torus(R, 0.03, 6, 24), (p, n, o, c) => o.set(Math.floor(((Math.atan2(c.y, c.x) / TAU + 1) % 1) * 48) % 2 ? '#8a5e44' : '#a8784e'));
    B.add(ring.translate(0, cy, z0), null);
    const cols = ['#e8503a', '#ff7a3a', '#f4b03a', '#c8323a', '#ff9a4a'];
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * TAU + B.wob(0.08), rr = R + B.rand(-0.03, 0.035), s = B.rand(0.045, 0.062);
      const g = twoSided(blossomGeo(s, 5, 0.5, true)); g.rotateX(PI / 2);
      const c0 = col(B.pick(cols)), c1 = c0.clone().lerp(col('#ffe08a'), 0.35);
      paint(g, (p, n, o) => o.copy(c1).lerp(c0, clamp(Math.hypot(p.x, p.y) / s)));
      g.rotateZ(a - PI / 2 + B.wob(0.7)); g.rotateY(B.wob(0.35)); g.rotateX(B.wob(0.3));
      g.translate(Math.cos(a) * rr, cy + Math.sin(a) * rr, z0 + 0.03 + B.rand(0, 0.03));
      B.add(g, null, 'leaf');
    }
    for (const a of [0.35, 2.5, 4.3]) {
      const x = Math.cos(a) * (R + 0.01), y = cy + Math.sin(a) * (R + 0.01), z = z0 + 0.07;
      ball(B, 0.018, x, y, z, '#c07a40', [1, 1.25, 1], 8); ball(B, 0.02, x, y + 0.016, z, '#7a4c2c', [1, 0.6, 1], 8);
    }
    for (const a of [1.0, 1.15, 3.2, 3.35, 5.2, 5.4]) ball(B, 0.012, Math.cos(a) * (R - 0.02), cy + Math.sin(a) * (R - 0.02), z0 + 0.06, '#e8323a', 1, 6);
    B.at([0, cy - R - 0.005, z0 + 0.07], 0, () => bow(B, { s: 0.13, color: '#e8403a' }));
    box(B, 0.016, 0.47 - cy - R - 0.01, 0.004, 0, 0, cy + R + 0.01, 0.012, '#e8403a');
    ball(B, 0.011, 0, 0.47, 0.012, GOLD, 1, 6);
  },
};

// =================================================================== Tidepool
/** a fancy goldfish facing +x, centred at the origin */
function goldfish(B, s = 1) {
  B.push([0, 0, 0], 0, s);
  const body = G.sph(1, 12, 9); body.scale(0.045, 0.034, 0.024);
  B.add(body, (p, n, o) => o.set('#ff7a2a').lerp(col('#ffd8a8'), clamp(-n.y * 0.9)).lerp(col('#ffb070'), clamp(n.y - 0.6)));
  const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.quadraticCurveTo(-0.03, 0.05, -0.075, 0.045); tail.quadraticCurveTo(-0.055, 0.005, -0.08, -0.03); tail.quadraticCurveTo(-0.035, -0.04, 0, 0);
  for (const r of [-0.35, 0.35]) { const t = twoSided(new THREE.ShapeGeometry(tail, 5)); t.rotateX(r); t.translate(-0.035, 0, 0); B.add(t, '#ffa050', 'leaf'); }
  const fin = new THREE.Shape(); fin.moveTo(-0.025, 0.028); fin.lineTo(0.012, 0.03); fin.quadraticCurveTo(-0.015, 0.05, -0.04, 0.058); fin.lineTo(-0.025, 0.028);
  B.add(twoSided(new THREE.ShapeGeometry(fin, 4)), '#ff9a4a', 'leaf');
  for (const sz of [-1, 1]) {
    ball(B, 0.0075, 0.03, 0.008, sz * 0.017, INK, 1, 6); ball(B, 0.0025, 0.033, 0.011, sz * 0.022, '#ffffff', 1, 4);
    const pf = G.sph(1, 5, 4); pf.scale(0.014, 0.004, 0.01); pf.rotateX(sz * 0.6); pf.translate(0.005, -0.018, sz * 0.022); B.add(pf, '#ffa050', 'leaf');
  }
  ball(B, 0.006, 0.045, -0.003, 0, '#ff9ab0', 1, 5);
  B.pop();
}
/** an upright scallop shell (hinge at the origin, fan up +y, convex toward +z) as a glow geometry */
function scallopGeo(R, A, { na = 28, ns = 6, bulge = 0.06, ribs = 7 } = {}) {
  const make = (front) => {
    const pos = [], idx = [];
    for (let j = 0; j <= ns; j++) for (let i = 0; i <= na; i++) {
      const a = -A + 2 * A * i / na, s = Math.max(0.02, j / ns), rr = s * R * (1 + 0.035 * Math.abs(Math.cos(a * ribs)));
      const rib = Math.cos(a * ribs * 2) ** 2;
      const z = (bulge * Math.sin(PI * s ** 0.85 * 0.85) ** 0.8 * (1 - 0.4 * (a / A) ** 2) + 0.008 * s * rib) * (front ? 1 : 0.5) - (front ? 0 : 0.012);
      pos.push(rr * Math.sin(a), rr * Math.cos(a), z);
    }
    for (let j = 0; j < ns; j++) for (let i = 0; i < na; i++) {
      const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
      if (front) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g.toNonIndexed();
  };
  return [make(true), make(false)];
}

const TIDE = {
  fishTank(B) {
    const stand = '#8fc8d8', trim = '#fff3e0', blue = '#5a86b0';
    box(B, 0.94, 0.46, 0.41, 0.04, 0, 0, -0.005, stand);
    for (const sx of [-1, 1]) {
      sbox(B, 0.41, 0.34, 0.02, 0.012, sx * 0.22, 0.06, 0.2, trim);
      ball(B, 0.022, sx * 0.05, 0.26, 0.214, '#ff9eb0', [1, 0.85, 0.5], 8);
    }
    box(B, 0.95, 0.04, 0.44, 0.015, 0, 0.46, 0, trim);
    const tw = 0.92, td = 0.4, y0 = 0.5, y1 = 0.94;
    box(B, tw, 0.035, td, 0.01, 0, y0, 0, blue);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(B, G.beam(0.024, y1 - y0, 0.024, 0.006), sx * (tw / 2 - 0.012), (y0 + y1) / 2, sz * (td / 2 - 0.012), '#cfefff');
    for (const sz of [-1, 1]) put(B, G.beam(tw, 0.024, 0.024, 0.006), 0, y1 - 0.012, sz * (td / 2 - 0.012), blue);
    for (const sx of [-1, 1]) put(B, G.beam(0.024, 0.024, td - 0.048, 0.006), sx * (tw / 2 - 0.012), y1 - 0.012, 0, blue);
    B.glow(G.plane(tw - 0.04, y1 - y0 - 0.04).translate(0, (y0 + y1) / 2, -td / 2 + 0.014), (p, n, o) => o.set('#3a8ac0').lerp(col('#a8e4f4'), clamp((p.y - y0) / (y1 - y0))), { tint: 0.8, flicker: 0.1 });
    sbox(B, tw - 0.03, 0.035, td - 0.03, 0.01, 0, y0 + 0.03, 0, '#f0dca8');
    const gy = y0 + 0.065, peb = ['#ffb0c8', '#fffaf2', '#a8d8ff', '#ffe08a', '#c8e8c0'];
    for (let i = 0; i < 26; i++) { const g = G.ico(B.rand(0.014, 0.022), 0); g.scale(1, 0.6, 1); put(B, g, B.rand(-0.42, 0.42), gy, B.rand(-0.17, 0.17), B.pick(peb)); }
    // a little pink-roofed castle
    B.at([-0.26, gy, -0.08], 0.3, () => {
      cyl(B, 0.05, 0.055, 0.15, 12, 0, 0, 0, '#e8dcf4'); put(B, G.cone(0.066, 0.08, 12), 0, 0.19, 0, '#ff9eb0');
      for (const sx of [-1, 1]) { cyl(B, 0.032, 0.035, 0.1, 10, sx * 0.075, 0, 0.01, '#e0d4ee'); put(B, G.cone(0.044, 0.06, 10), sx * 0.075, 0.13, 0.01, '#ff8fb0'); }
      box(B, 0.14, 0.07, 0.05, 0.01, 0, 0, 0.03, '#e8dcf4');
      put(B, new THREE.ShapeGeometry(archShape(0.04, 0.05), 4), 0, 0.0, 0.0555, '#5a4a6a');
      for (const y of [0.09, 0.115]) ball(B, 0.008, 0, y, 0.05, '#5a4a6a', [1, 1.3, 0.4], 6);
      cyl(B, 0.003, 0.003, 0.05, 4, 0, 0.22, 0, INK); put(B, new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.035, -0.01), new THREE.Vector2(0, -0.02)])), 0.002, 0.27, 0, '#ffd24a');
    });
    // waving vallisneria at the back right
    for (let i = 0; i < 9; i++) {
      const g = bladeGeo(B.rand(0.22, 0.31), 0.022, { bend: B.rand(0.2, 0.7), seg: 6, base: 0.8 });
      g.rotateY(B.rand(0, TAU)); g.translate(0.27 + B.wob(0.06), gy - 0.01, -0.09 + B.wob(0.05));
      B.add(g, (p, n, o) => o.set('#4fa050').lerp(col('#9ad870'), clamp((p.y - gy) / 0.3)), 'leaf');
    }
    B.at([-0.06, 0.76, 0.07], 0.25, () => goldfish(B, 1.05));
    B.at([0.18, 0.67, 0.0], 2.9, () => goldfish(B, 0.85));
    for (let i = 0; i < 7; i++) ball(B, 0.007 + i * 0.0012, -0.16 + B.wob(0.01), gy + 0.05 + i * 0.042, -0.04 + B.wob(0.01), '#e8fbff', 1, 6);
    put(B, G.plane(tw - 0.03, td - 0.03).rotateX(-PI / 2), 0, 0.885, 0, '#9adcf0', 'water');
    for (const [a, b, w] of [[[-0.42, 0.88], [-0.34, 0.78], 0.014], [[-0.37, 0.89], [-0.33, 0.84], 0.008]]) put(B, ribbon([a, b], w), 0, 0, td / 2 - 0.006, '#ffffff');
    sbox(B, 0.4, 0.035, 0.1, 0.012, 0, y1, -td / 2 + 0.04, blue);
    B.glow(G.box(0.36, 0.006, 0.07, 0).translate(0, y1 - 0.004, -td / 2 + 0.04), '#e8fbff', { tint: 0.5 });
  },

  shellLamp(B) {
    lathe(B, [[0.001, 0], [0.13, 0], [0.136, 0.012], [0.11, 0.034], [0.05, 0.045], [0.001, 0.046]], 20, 0, 0, 0, (p, n, o) => o.set('#f4dcb0').multiplyScalar(0.94 + 0.08 * nz(p.x * 30, p.z * 30)));
    B.at([0, 0.03, -0.035], 0, () => {
      const [front, back] = scallopGeo(0.255, 1.08), A = 1.08;
      const paintShell = (dark) => (p, n, o) => { const a = Math.atan2(p.x, p.y), rib = Math.cos(a * 14) ** 2, s = Math.hypot(p.x, p.y) / 0.255; o.set(dark ? '#ff8fb0' : '#ff9ec0').lerp(col('#ffe0ec'), (dark ? 0.15 : 0.55) * rib * s).lerp(col('#ffd0a8'), (1 - s) * 0.4); };
      B.glow(front, paintShell(false), { flicker: 0.2, tint: 0.6 });
      B.glow(back, paintShell(true), { flicker: 0.2, tint: 0.6 });
      for (const sx of [-1, 1]) { const ear = G.box(0.05, 0.035, 0.022, 0); ear.rotateZ(sx * 0.3); put(B, ear, sx * 0.03, 0.012, 0.004, '#ff9ec0'); }
    }, 1, -0.22);
    ball(B, 0.03, 0.035, 0.07, 0.08, (p, n, o) => o.set('#fff2f6').lerp(col('#e8d8f8'), clamp(-n.x * 0.5)), 1, 12);
    const st = blossomGeo(0.04, 5, 0.38, true); st.rotateY(0.3); put(B, st, -0.07, 0.042, 0.075, '#ff9a6a');
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; ball(B, 0.004, -0.07 + Math.sin(a) * 0.018, 0.045, 0.075 + Math.cos(a) * 0.018, '#fff0e0', 1, 4); }
  },

  waveRug(B, d) {
    const W = d.size[0] * CELL - 0.04, D = d.size[1] * CELL - 0.04, fx = 0.82, fz = 0.58, R = 0.25;
    sbox(B, W - 0.04, 0.016, D - 0.04, 0.006, 0, 0.004, 0, '#2a4270');
    const fr = roundRect(W - 0.014, D - 0.014, 0.1); fr.holes.push(roundRect(2 * fx + 0.02, 2 * fz + 0.02, 0.04, 0, 0, new THREE.Path()));
    const bg = extrude(fr, 0.012, 0.006, 4); bg.rotateX(-PI / 2); put(B, bg, 0, 0.004, 0, '#24385e');
    const st = roundRect(W - 0.1, D - 0.1, 0.07); st.holes.push(roundRect(W - 0.116, D - 0.116, 0.062, 0, 0, new THREE.Path()));
    const sg = new THREE.ShapeGeometry(st, 4); sg.rotateX(-PI / 2); put(B, sg, 0, 0.0285, 0, '#f4f8ff');
    // seigaiha: rows of half-disc wave scales, each row overlapping the one behind it
    const rings = [0, 0.4, 0.5, 0.7, 0.8, 1], cols = ['#a8d0f4', '#f4f8ff', '#6a9ad8', '#f4f8ff', '#3f6aa8'].map(c => col(c));
    const pos = [], cl = [], SEG = 6;
    const P = (cx, cz, r, th) => [clamp(cx + r * Math.cos(th), -fx, fx), clamp(cz - r * Math.sin(th), -fz, fz)];
    let j = 0;
    for (let cz = -fz + R * 0.7; cz < fz + R * 0.55; cz += R / 2, j++) {
      const y = 0.02 + j * 0.0006;
      for (let cx = -fx - (j % 2 ? 0 : R); cx < fx + R; cx += 2 * R) for (let k = 0; k < 5; k++) for (let s = 0; s < SEG; s++) {
        const t0 = s / SEG * PI, t1 = (s + 1) / SEG * PI, r0 = rings[k] * R, r1 = rings[k + 1] * R;
        const a = P(cx, cz, r0, t0), b = P(cx, cz, r1, t0), c = P(cx, cz, r1, t1), e = P(cx, cz, r0, t1);
        const quad = k === 0 ? [[a, b, c]] : [[a, b, c], [a, c, e]];
        for (const tri of quad) for (const q of tri) { pos.push(q[0], y, q[1]); cl.push(cols[4 - k].r, cols[4 - k].g, cols[4 - k].b); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    B.add(g, null);
  },

  glassFloats(B) {
    curve(B, [[-0.43, 0.43, 0.035], [-0.2, 0.445, 0.04], [0.05, 0.435, 0.038], [0.3, 0.448, 0.04], [0.43, 0.44, 0.036]], t => 0.022 + 0.006 * Math.sin(t * 9), (p, n, o) => o.set('#b8a890').lerp(col('#e0d4c0'), clamp(n.y)), { radial: 7, n: 12 });
    for (const sx of [-1, 1]) { const t = G.torus(0.03, 0.007, 4, 10); put(B, t, sx * 0.32, 0.44, 0.038, '#d8c8a0'); ball(B, 0.012, sx * 0.32, 0.47, 0.01, WOOD_D, 1, 6); }
    // a diamond-mesh net swagged under the batten
    const yb = x => 0.1 + 0.16 * (x / 0.4) ** 2, cl = { x0: -0.45, x1: 0.45, yTop: 0.44, yBot: 0.08 }, strands = [];
    for (const dir of [1, -1]) for (let c = -0.9; c <= 0.9; c += 0.075) {
      let run = [];
      const flush = () => { if (run.length > 1) strands.push(run); run = []; };
      for (let y = 0.43; y > 0.06; y -= 0.02) { const x = c + dir * (0.43 - y); if (Math.abs(x) <= 0.4 && y >= yb(x)) run.push([x, y]); else flush(); }
      flush();
    }
    for (const run of strands) { const g = ribbon(run, 0.007, { caps: false }); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.018 + 0.03 * (0.44 - p.getY(i))); B.cloth(g, '#d8c8a0', cl); }
    const flt = [[-0.22, 0.25, 0.085, '#8fe0c0'], [0.05, 0.18, 0.095, '#8fd0ff'], [0.27, 0.28, 0.075, '#c8e8a0']];
    for (const [x, y, r, c] of flt) {
      const z = r + 0.028;
      B.glow(G.sph(r, 14, 10).translate(x, y, z), (p, n, o) => o.set(c).lerp(col('#ffffff'), clamp(n.y * 0.4 + n.z * 0.2)), { tint: 0.6, flicker: 0.15 });
      ball(B, r * 0.18, x - r * 0.38, y + r * 0.42, z + r * 0.78, '#ffffff', [1, 1, 0.4], 6);
      for (const ry of [0, PI / 2]) { const m = G.torus(r * 1.01, 0.006, 3, 16); m.rotateY(ry + 0.4); put(B, m, x, y, z, '#c8b078'); }
      const eq = G.torus(r * 1.01, 0.006, 3, 16); eq.rotateX(PI / 2); put(B, eq, x, y, z, '#c8b078');
      ball(B, 0.012, x, y + r + 0.006, z, '#c8b078', 1, 6);
      B.add(bar(V(x, y + r + 0.01, z), V(x * 0.9, 0.44, 0.04), 0.006, 0), '#c8b078');
    }
    const sf = blossomGeo(0.05, 5, 0.38, true); sf.rotateX(PI / 2); sf.rotateZ(0.3); put(B, sf, 0.16, 0.37, 0.03, '#ff8a6a');
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; ball(B, 0.0045, 0.16 + Math.sin(a) * 0.02, 0.37 + Math.cos(a) * 0.02, 0.033, '#fff0e0', 1, 4); }
    const sh = blossomGeo(0.03, 7, 0.82); sh.rotateX(PI / 2); put(B, sh, -0.08, 0.33, 0.03, '#ffc8d8');
  },
};

// =================================================================== Onsen Lodge
const ONSEN = {
  onsenNoren(B) {
    const y1 = 0.92, y0 = 0.05, z = 0.075, cl = { x0: -0.47, x1: 0.47, yTop: y1, yBot: y0 }, gap = 0.009;
    // soft vertical folds, deeper toward the hem (the painted marks follow the same folds)
    const fz = (x, y) => 0.011 * Math.sin(x * 34 + 0.6) * (0.35 + 0.65 * clamp((y1 - 0.08 - y) / (y1 - y0 - 0.08)));
    const fold = g => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + fz(p.getX(i), p.getY(i))); g.computeVertexNormals(); return g; };
    pipe(B, [-0.47, 0.95, 0.07], [0.47, 0.95, 0.07], 0.018, '#c89a62');
    for (const sx of [-1, 1]) { ball(B, 0.026, sx * 0.48, 0.95, 0.07, '#a87a48', 1, 8); box(B, 0.03, 0.05, 0.07, 0, sx * 0.4, 0.925, 0.035, '#a87a48'); }
    for (const sx of [-1, 1]) {
      const x = sx * (0.235 + gap / 2) - sx * 0.0045;
      sbox(B, 0.455, 0.07, 0.05, 0.02, x, y1 - 0.045, 0.07, '#22345a');
      const g = fold(G.plane(0.455, y1 - y0 - 0.02, 28, 10).translate(x, (y0 + y1) / 2 - 0.01, z));
      B.cloth(g, (p, n, o) => o.set('#273c66').lerp(col('#34507e'), clamp((y1 - p.y) / 0.9) * 0.6).multiplyScalar(0.88 + 0.16 * clamp(n.x * sx * 0.8 + 0.6)), cl);
      const hem = fold(G.plane(0.455, 0.035, 28, 1).translate(x, y0 + 0.008, z + 0.0015)); B.cloth(hem, '#22345a', cl);
    }
    // the hot-spring mark: a big white ゆ across the two panels, a little ♨ on the right
    const S = 0.46, cx = 0, cy = 0.5;
    const yu1 = [[-0.3, 0.33], [-0.33, 0.12], [-0.33, -0.1], [-0.28, -0.22], [-0.2, -0.14], [-0.1, 0.06], [0.04, 0.2], [0.2, 0.22], [0.32, 0.12], [0.34, -0.04], [0.26, -0.18], [0.1, -0.24], [-0.01, -0.22]];
    const yu2 = [[0.04, 0.4], [0.06, 0.2], [0.07, 0.0], [0.06, -0.2], [0.0, -0.34], [-0.12, -0.42]];
    const marks = [stroke(yu1, t => 0.07 + 0.02 * Math.sin(PI * t), S, cx, cy, 44), stroke(yu2, t => 0.085 - 0.03 * t, S, cx, cy, 18)];
    const sp = 0.14, sx0 = 0.31, sy0 = 0.2, bowl = []; for (let i = 0; i <= 10; i++) { const a = PI + i / 10 * PI; bowl.push([Math.cos(a) * 0.36, -0.12 + Math.sin(a) * 0.3]); }
    marks.push(stroke(bowl, 0.09, sp, sx0, sy0));
    for (const dx of [-0.18, 0, 0.18]) { const w = []; for (let i = 0; i <= 8; i++) { const y = -0.02 + i / 8 * 0.48; w.push([dx + 0.06 * Math.sin(y * 13), y]); } marks.push(stroke(w, 0.07, sp, sx0, sy0)); }
    for (const g0 of marks) for (const [a, b] of [[-0.47, -gap / 2], [gap / 2, 0.47]]) { const g = clipGeoX(g0, a, b); if (g) { g.translate(0, 0, z + 0.0032); B.cloth(fold(g), '#fffaf2', cl); } }
  },

  cypressBucket(B) {
    const hin = '#f0d4a0', hinD = '#ddb880';
    sbox(B, 0.36, 0.05, 0.26, 0.018, 0, 0.21, 0, hin);
    for (const z of [-0.043, 0.043]) box(B, 0.34, 0.003, 0.004, 0, 0, 0.26, z, shade(hin, 0.8));
    for (const sx of [-1, 1]) sbox(B, 0.045, 0.215, 0.24, 0.015, sx * 0.14, 0, 0, hinD);
    B.at([-0.045, 0.26, 0.0], 0, () => bucket(B, { r: 0.115, h: 0.15, color: '#f2d6a2', water: true }));
    // a rubber duck afloat
    B.at([-0.03, 0.385, 0.01], 0.5, () => {
      ball(B, 0.03, 0, 0, 0, '#ffd84a', [1.3, 0.85, 1], 10); ball(B, 0.021, 0.026, 0.03, 0, '#ffd84a', 1, 10);
      const bk = G.cone(0.01, 0.022, 6); bk.rotateZ(-PI / 2); put(B, bk, 0.055, 0.026, 0, '#ff8a3a');
      for (const s of [-1, 1]) ball(B, 0.0045, 0.04, 0.038, s * 0.012, INK, 1, 5);
      ball(B, 0.012, -0.038, 0.012, 0, '#ffd84a', [1, 1.4, 0.8], 6);
    });
    // a folded towel over the right end, hanging down the front
    sbox(B, 0.13, 0.04, 0.2, 0.015, 0.11, 0.26, 0.0, '#fffaf2');
    sbox(B, 0.13, 0.13, 0.02, 0.008, 0.11, 0.16, 0.13, '#fffaf2');
    for (const z of [-0.05, 0.05]) box(B, 0.132, 0.003, 0.022, 0, 0.11, 0.3, z, '#8fd0ff');
    for (const y of [0.2, 0.24]) box(B, 0.132, 0.016, 0.003, 0, 0.11, y, 0.141, '#8fd0ff');
  },
};

// =================================================================== Festival
const FESTIVAL = {
  festivalLantern(B, d) {
    const top = d.h, R = 0.16, H = 0.32, yb = 0.135, N = 14, mid = yb + H / 2, R0 = R * 0.6;
    const prof = []; for (let k = 0; k <= N; k++) { const t = k / N; prof.push([R * (0.6 + 0.4 * Math.sin(t * PI)) * (k % 2 ? 1 : 0.972), yb + t * H]); }
    B.glow(G.lathe(prof, 20), (p, n, o) => { const t = (p.y - yb) / H; o.set('#e8503a').lerp(col('#b8302a'), clamp(Math.abs(t - 0.5) * 2.4 - 0.6)).multiplyScalar(0.92 + 0.08 * Math.abs(n.y)); }, { flicker: 1, tint: 0.55 });
    const Rf = y => R * (0.6 + 0.4 * Math.sin(clamp((y - yb) / H) * PI));
    for (const a of [0, PI / 2]) {
      B.glow(wrapLathe(ellD(0.072, 0.072, 20, 3).translate(0, mid, 0), Rf, a, 0.004), '#fff4dc', { flicker: 1, tint: 0.5 });
      B.glow(wrapLathe(tomoeGeo(0.062).translate(0, mid, 0.0006), Rf, a, 0.004), '#2a1a1e', { flicker: 1, tint: 0.2 });
    }
    // bamboo rib rings over the paper (they break around the painted crests; the ends hide under the rims)
    for (let k = 2; k < 10; k++) {
      const y = yb + k / 11 * H, r = Rf(y) + 0.003, arcs = Math.abs(y - mid) < 0.078 ? [[0.5, PI / 2 - 1], [PI / 2 + 0.5, 1.5 * PI - 1]] : [[0, TAU]];
      for (const [a0, len] of arcs) { const g = G.torus(r, 0.0044, 3, Math.max(3, Math.round(len * 3.2)), len); g.rotateX(PI / 2); g.rotateY(-a0); g.translate(0, y, 0); B.glow(g, '#9a2a22', { tint: 0.15, flicker: 1 }); }
    }
    // lacquered rims that hug the paper's ends: tucked under the paper, a bead, a band, a rolled lip, a lid; a gold
    // pin-line on the bead (the bottom rim is the top one mirrored)
    const yT = yb + H;
    const rimP = [[Rf(yT - 0.036) - 0.006, yT - 0.036], [Rf(yT - 0.033) + 0.004, yT - 0.034], [Rf(yT - 0.029) + 0.009, yT - 0.028], [Rf(yT - 0.022) + 0.01, yT - 0.021], [Rf(yT - 0.016) + 0.007, yT - 0.016], [R0 + 0.008, yT - 0.006], [R0 + 0.01, yT + 0.005], [R0 + 0.006, yT + 0.013], [R0 - 0.006, yT + 0.018], [0.05, yT + 0.02], [0.001, yT + 0.021]];
    const lac = (p, n, o) => { o.set('#2c1b17').lerp(col('#7c5a4c'), clamp(Math.abs(n.y) - 0.5) * 0.9); if (Math.abs(n.y) < 0.3) o.lerp(col('#5a3c32'), 0.35 * clamp(n.x * 0.7 + n.z * 0.7)); };
    B.add(G.lathe(rimP, 26), lac);
    B.add(G.lathe(rimP.map(([r, y]) => [r, 2 * mid - y]).reverse(), 26), lac);
    for (const y of [yT - 0.026, 2 * mid - (yT - 0.026)]) { const g = G.torus(Rf(yT - 0.026) + 0.0115, 0.0024, 3, 26); g.rotateX(PI / 2); put(B, g, 0, y, 0, GOLD); }
    // a lacquered wire bail over the lid, gold studs, an iron S-hook on the cord
    const yL = yT + 0.02, bail = G.torus(0.046, 0.0045, 5, 16, PI); put(B, bail, 0, yL - 0.004, 0, '#2c1b17');
    for (const s of [-1, 1]) ball(B, 0.0085, s * 0.046, yL, 0, GOLD, 1, 6);
    const yH = yL - 0.004 + 0.046;
    curve(B, [[0, yH - 0.004, 0], [0.008, yH + 0.004, 0.004], [0.004, yH + 0.016, 0.004], [-0.006, yH + 0.022, 0], [0, yH + 0.03, 0]], 0.0032, IRON, { radial: 5, n: 8 });
    // a red cord with a gold bead and a gold-capped fringe tassel under the bottom rim (its tip is y = 0)
    B.add(quadPaint(G.lathe([[0.001, 0], [0.03, 0.004], [0.022, 0.04], [0.012, 0.07], [0.001, 0.075]], 12), 5, (i, j, o) => o.set(i % 2 ? '#ff6a5a' : '#ff8a72')), null);
    cyl(B, 0.014, 0.014, 0.014, 10, 0, 0.066, 0, GOLD);
    ball(B, 0.015, 0, 0.096, 0, GOLD, 1, 8);
    twistCord(B, 0, 0, yb - 0.02, 0.105, 0.0042, '#e8403a', '#ff8a72');
    // the ceiling rose: a lacquered plate with a gold eye; a red-and-white festival cord knotted through it
    const yK = ceilingRose(B, top, { wood: '#4a2c24', cord: '#e8403a', cord2: '#fff4e8', metal: GOLD });
    twistCord(B, 0, 0, yK, yH + 0.026, 0.0046, '#e8403a', '#fff4e8');
  },

  taikoDrum(B) {
    const cy = 0.6, lac = '#4a2e24';
    const prof = [[0.29, -0.25], [0.315, -0.2], [0.335, -0.12], [0.342, 0], [0.335, 0.12], [0.315, 0.2], [0.29, 0.25]];
    const body = G.lathe(prof, 28); body.rotateX(PI / 2); body.translate(0, cy, 0);
    B.add(faceColors(body, (p, n, o, c) => o.set(Math.floor(((Math.atan2(c.y - cy, c.x) / TAU + 1) % 1) * 28) % 2 ? '#a0503a' : '#904634').multiplyScalar(0.92 + 0.12 * clamp(n.y))), null);
    for (const sz of [-1, 1]) {
      const sk = G.lathe([[0.3, 0.0], [0.2, 0.008], [0.001, 0.01]], 28); sk.rotateX(sz * PI / 2); put(B, sk, 0, cy, sz * 0.25, (p, n, o) => o.set('#f4e4c4').lerp(col('#d8c4a0'), clamp(Math.hypot(p.x, p.y - cy) / 0.3) ** 3));
      const rim = G.torus(0.293, 0.017, 5, 28); put(B, rim, 0, cy, sz * 0.25, '#3a2a2a');
      for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; ball(B, 0.015, Math.cos(a) * 0.305, cy + Math.sin(a) * 0.305, sz * 0.222, '#2e2a30', [1, 1, 0.7], 5); }
    }
    put(B, tomoeGeo(0.21), 0, cy, 0.2615, '#c8323a');
    put(B, G.disc(0.035, 12), 0, cy, 0.2612, '#f4c04a');
    for (const sx of [-1, 1]) { box(B, 0.016, 0.05, 0.05, 0, sx * 0.343, cy - 0.025, 0, IRON); const r = G.torus(0.045, 0.01, 4, 12); r.rotateY(PI / 2); put(B, r, sx * 0.352, cy - 0.05, 0, '#4a4450'); }
    // the stand: two cradles with splayed legs, floor rails, gold caps
    for (const sz of [-0.16, 0.16]) {
      const arc = []; for (let i = 0; i <= 10; i++) { const a = PI * 1.2 + i / 10 * PI * 0.6; arc.push([Math.cos(a) * 0.37, cy + Math.sin(a) * 0.37, sz]); }
      curve(B, arc, 0.032, lac, { radial: 7 });
      for (const sx of [-1, 1]) { pipe(B, [sx * 0.3, cy - 0.22, sz], [sx * 0.42, 0.03, sz * 1.15], 0.03, lac, { seg: 7 }); ball(B, 0.034, sx * 0.42, 0.03, sz * 1.15, GOLD, [1, 0.8, 1], 8); }
    }
    for (const sx of [-1, 1]) pipe(B, [sx * 0.42, 0.03, -0.19], [sx * 0.42, 0.03, 0.19], 0.026, lac);
    pipe(B, [-0.36, 0.18, 0.17], [0.36, 0.18, 0.17], 0.02, lac);
    // two bachi resting crossed on the front rail
    pipe(B, [-0.28, 0.195, 0.2], [0.16, 0.235, 0.36], 0.016, '#e8c890', { r1: 0.012, seg: 7 });
    pipe(B, [0.26, 0.195, 0.2], [-0.12, 0.215, 0.38], 0.016, '#e8c890', { r1: 0.012, seg: 7 });
    for (const [x, z] of [[-0.28, 0.2], [0.26, 0.2]]) ball(B, 0.018, x, 0.195, z, '#e8403a', 1, 6);
  },

  daruma(B) {
    const prof = [[0.001, 0], [0.085, 0], [0.115, 0.02], [0.132, 0.07], [0.13, 0.13], [0.115, 0.19], [0.088, 0.235], [0.05, 0.265], [0.001, 0.275]];
    lathe(B, prof, 24, 0, 0, 0, (p, n, o) => o.set('#e2382e').lerp(col('#ff7a6a'), clamp(n.y - 0.3) * 0.5).lerp(col('#c02a24'), clamp(-n.y)));
    const Rf = profR(prof), W = (g, c, k = 0) => B.add(wrapLathe(g, Rf, 0.35, 0.0015 + k * 0.0006), c);
    W(ellD(0.074, 0.064, 28, 6).translate(0, 0.162, 0), '#fff6ea');
    W(new THREE.RingGeometry(0.019, 0.025, 18, 2).translate(-0.03, 0.168, 0), INK, 1); // the blank eye (make a wish)
    W(ellD(0.024, 0.024, 18, 3).translate(0.03, 0.168, 0), INK, 1); W(G.disc(0.006, 8).translate(0.036, 0.176, 0), '#ffffff', 2);
    for (const s of [-1, 1]) {
      W(stroke([[s * 0.052, 0.2], [s * 0.032, 0.209], [s * 0.012, 0.203]], t => 0.012 - t * 0.005, 1, 0, 0, 8), INK, 1);
      W(stroke([[s * 0.004, 0.134], [s * 0.022, 0.14], [s * 0.04, 0.132]], t => 0.009 - t * 0.004, 1, 0, 0, 8), INK, 1);
      W(stroke([[s * 0.09, 0.165], [s * 0.1, 0.135], [s * 0.09, 0.105]], 0.009, 1, 0, 0, 6), GOLD, 1);
    }
    W(ellD(0.012, 0.007, 12, 2).translate(0, 0.12, 0), '#c02a24', 1);
    W(stroke([[-0.07, 0.07], [0, 0.056], [0.07, 0.07]], 0.016, 1, 0, 0, 10), GOLD);
    W(stroke([[-0.05, 0.04], [0, 0.03], [0.05, 0.04]], 0.01, 1, 0, 0, 8), GOLD);
  },

  goldfishBowl(B) {
    const prof = [[0.001, 0], [0.07, 0], [0.115, 0.03], [0.145, 0.09], [0.15, 0.15], [0.135, 0.205], [0.11, 0.24], [0.1, 0.25], [0.093, 0.252], [0.115, 0.215], [0.13, 0.15], [0.115, 0.08], [0.07, 0.035], [0.001, 0.03]];
    lathe(B, prof, 22, 0, 0, 0, (p, n, o) => {
      const r = Math.hypot(p.x, p.z), outer = n.x * p.x + n.z * p.z > 0;
      if (!outer) { o.set('#6ab8de'); return; }
      o.set(p.y < 0.2 ? '#a4dcf0' : '#dff4fa').lerp(col('#ffffff'), clamp(n.y) * 0.25);
    });
    const lip = G.lathe([[0.1, 0.249], [0.122, 0.262], [0.14, 0.281], [0.146, 0.29], [0.136, 0.289], [0.113, 0.27], [0.094, 0.254]], 30), lp = lip.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); if (r > 0.11) { const a = Math.atan2(x, z), k = (r - 0.11) / 0.036; lp.setY(i, lp.getY(i) + 0.012 * Math.sin(10 * a) * k); lp.setX(i, x * (1 + 0.025 * Math.cos(10 * a) * k)); lp.setZ(i, z * (1 + 0.025 * Math.cos(10 * a) * k)); } }
    lip.computeVertexNormals();
    B.add(lip, (p, n, o) => o.set('#e8f8ff').lerp(col('#5aa8e8'), clamp((Math.hypot(p.x, p.z) - 0.115) / 0.03)));
    put(B, G.disc(0.128, 24).rotateX(-PI / 2), 0, 0.205, 0, '#6ac0e0', 'water');
    const pad = new THREE.CircleGeometry(0.035, 12, 0.3, TAU - 0.6); pad.rotateX(-PI / 2); put(B, pad, 0.03, 0.2065, 0.03, '#6ab04c');
    const fl = blossomGeo(0.018, 6, 0.5); put(B, fl, 0.04, 0.209, 0.035, '#ffb0c8'); ball(B, 0.005, 0.04, 0.211, 0.035, '#ffd84a', 1, 5);
    // the proud goldfish, seen through the glass (front right), with a few bubbles, pebbles and a water weed
    const Rf = profR(prof.slice(0, 8)), glass = col('#a4dcf0'), seen = c => '#' + col(c).lerp(glass, 0.18).getHexString();
    const W = (g, c, k = 0, a = 0.5) => B.add(wrapLathe(g, Rf, a, 0.0015 + k * 0.0006), seen(c));
    W(ellD(0.04, 0.024, 18, 3).translate(0.0, 0.12, 0), '#ff6a2a', 1);
    const tl = new THREE.Shape(); tl.moveTo(-0.03, 0.12); tl.quadraticCurveTo(-0.06, 0.16, -0.085, 0.15); tl.quadraticCurveTo(-0.065, 0.12, -0.09, 0.09); tl.quadraticCurveTo(-0.06, 0.085, -0.03, 0.12);
    W(new THREE.ShapeGeometry(tl, 5), '#ffa060', 0);
    W(new THREE.ShapeGeometry(new THREE.Shape([[-0.015, 0.14], [0.012, 0.142], [-0.03, 0.165]].map(p => new THREE.Vector2(...p)))), '#ff8a4a', 0);
    W(G.disc(0.006, 8).translate(0.024, 0.126, 0), INK, 2);
    W(ell(0.006, 0.004).translate(0.04, 0.118, 0), '#ff9ab0', 2);
    for (const [x, y, r] of [[0.05, 0.15, 0.008], [0.06, 0.172, 0.006], [0.052, 0.19, 0.005]]) W(new THREE.RingGeometry(r * 0.6, r, 10).translate(x, y, 0), '#ffffff', 1);
    for (let k = 0; k < 12; k++) W(G.disc(0.011, 8).translate(-0.12 + k * 0.022, 0.04 + (k % 2) * 0.008, 0), ['#ffb0c8', '#fffaf2', '#ffe08a', '#a8d8ff'][k % 4], 0, 0.3);
    for (const dx of [-0.02, 0, 0.02]) W(stroke([[dx, 0.04], [dx + 0.01, 0.1], [dx - 0.005, 0.15]], t => 0.012 - t * 0.008, 1, 0, 0, 6), '#5aae4a', 0, -0.35);
    for (const [a, w] of [[-0.55, 0.03], [-0.4, 0.015]]) W(stroke([[0, 0.17], [0.01, 0.22]], w * 0.5, 1), '#ffffff', 2, a);
  },
};

// =================================================================== Phase 2: the workbench and the villagers' own pieces
/** a soft carpet / felt colour with a fuzzy value noise (cat tower, cushions) */
function fuzz(c, k = 1) { const c0 = col(c); return (p, n, o) => o.copy(c0).multiplyScalar(0.92 + 0.06 * k * nz(p.x * 55 + p.y * 31, p.z * 55 - p.y * 23) + 0.07 * clamp(n.y)); }
/** a domed melon-pan bun with a checkered cookie crust, base at the origin */
function melonPan(B, s = 1) {
  const prof = [[0.001, 0], [0.046, 0], [0.054, 0.008], [0.056, 0.019], [0.051, 0.032], [0.038, 0.043], [0.02, 0.05], [0.001, 0.052]].map(([r, y]) => [r * s, y * s]);
  B.add(quadPaint(G.lathe(prof, 10), prof.length, (i, j, o) => { if (j < 2) { o.set('#d8944a'); return; } o.set((i + j) % 2 ? '#fadc8c' : '#e2a850'); if (j >= 5) o.lerp(col('#fff2bc'), 0.3); }), null);
}
/** a crescent croissant: a fat rolled middle tapering to curled tips, creases between the rolls; sits on y = 0 */
function croissant(B, s = 1) {
  const R = 0.055 * s, n = 13, P = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = -1.3 + t * 2.6, r = 0.027 * s * (0.32 + 0.68 * Math.sin(PI * t) ** 0.65) * (0.88 + 0.12 * Math.cos(t * 5 * TAU)); P.push({ p: V(Math.sin(a) * R, r * 0.78, -Math.cos(a) * R + R * 0.6), r }); }
  const g = tube(P, 6, true); g.scale(1, 0.8, 1);
  const cz = R * 0.6;
  B.add(g, (p, nn, o) => { const t = clamp((Math.atan2(p.x, -(p.z - cz)) + 1.3) / 2.6), cr = Math.cos(t * 5 * TAU); o.set('#e6a04e').lerp(col('#f6c878'), clamp(nn.y) * 0.55).lerp(col('#b0662a'), clamp(-cr - 0.55) * 1.4); });
}
/** a long crusty loaf along x (length L, radius r) with pale slashes on top */
function loaf(B, L, r, slashes = 4, c = '#d8904a') {
  const g = new THREE.CapsuleGeometry(r, L - 2 * r, 3, 9); g.rotateZ(PI / 2); g.scale(1, 0.8, 1); g.translate(0, r * 0.8, 0);
  B.add(g, (p, n, o) => o.set(c).lerp(col('#f2be70'), clamp(n.y) * 0.45).multiplyScalar(n.y < -0.3 ? 0.84 : 1));
  for (let k = 0; k < slashes; k++) { const x = (k - (slashes - 1) / 2) * (L - 2 * r) / slashes, sl = G.sph(1, 5, 3); sl.scale(L / slashes * 0.34, 0.006, r * 0.38); sl.rotateY(0.55); put(B, sl, x, r * 1.6 - 0.002, 0, '#f8dc9c'); }
}
/** an oval wicker basket (half-sizes rx, rz, height h) with a rolled rim, woven checker */
function wicker(B, rx, rz, h, seg = 16) {
  const prof = [[0.001, 0], [0.86, 0], [0.94, h * 0.18], [0.99, h * 0.55], [1.02, h * 0.9], [1.0, h * 1.04], [0.95, h * 1.02], [0.93, h * 0.6], [0.86, h * 0.18], [0.001, h * 0.14]];
  const g = G.lathe(prof, seg); g.scale(rx, 1, rz);
  B.add(quadPaint(g, prof.length, (i, j, o) => { if (j >= 5) { o.set(j === 5 ? '#d8b070' : '#b88c58'); return; } if (j === 4) { o.set((i % 2) ? '#f0d29a' : '#dcb47a'); return; } o.set((i + j) % 2 ? '#ecca8c' : '#cfa262'); }), null);
}

const PHASE2 = {
  workbench(B, d) {
    // a chunky laminated top at `surface` (kept clear: only the back edge carries a plane and shavings), a front vice,
    // a slatted low shelf with planks and a mallet, and a pegboard back with a hammer, a saw, a ruler, a set square and
    // a little ledge holding a jar of nails and a ball of twine
    const top = d.surface, T = 0.075, W = 1.46, D = 0.42, zc = -0.01, yU = top - T, legC = '#a8703e', legL = '#c08752', board = '#f4ddb4';
    B.push([0, 0, zc]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(B, G.beam(0.085, yU, 0.085, 0.016), sx * 0.63, yU / 2, sz * 0.155, legC);
      put(B, G.beam(0.105, 0.024, 0.104, 0.008), sx * 0.63, 0.012, sz * 0.155, WOOD_D);
    }
    for (const sx of [-1, 1]) put(B, G.beam(0.05, 0.06, 0.32, 0.012), sx * 0.63, 0.13, 0, legC);
    for (const sz of [-1, 1]) put(B, G.beam(1.18, 0.06, 0.05, 0.012), 0, 0.13, sz * 0.155, legC);
    for (let i = 0; i < 4; i++) put(B, G.beam(1.2, 0.022, 0.07, 0.008), 0, 0.171, -0.118 + i * 0.079, i % 2 ? '#d8a46c' : '#e4b27c');
    // aprons and a little drawer
    for (const sz of [-1, 1]) put(B, G.beam(1.18, 0.11, 0.028, 0.008), 0, yU - 0.055, sz * 0.178, legL);
    sbox(B, 0.34, 0.082, 0.022, 0.01, 0.16, yU - 0.098, 0.194, '#e8b884');
    ball(B, 0.019, 0.16, yU - 0.057, 0.21, WOOD_D, [1, 1, 0.8], 6);
    // the laminated top: seven strips of slightly different honey woods, darker end grain, two knots
    const tones = ['#e6b47c', '#d8a26a', '#ecbc86', '#dca86e', '#e4b078', '#d49e66', '#e8b880'], dd = D / 7;
    tones.forEach((c, i) => sbox(B, W, T, dd - 0.0015, 0.009, 0, yU, -D / 2 + dd * (i + 0.5), (p, n, o) => o.set(c).multiplyScalar(Math.abs(n.x) > 0.7 ? 0.8 : n.y > 0.7 ? 1.03 : 0.92)));
    for (const [x, z, r] of [[-0.18, 0.05, 0.016], [0.42, 0.11, 0.012]]) { put(B, ell(r * 1.7, r, 10).rotateX(-PI / 2), x, top + 0.0008, z, '#b88050'); put(B, ell(r * 0.8, r * 0.45, 8).rotateX(-PI / 2), x, top + 0.0012, z, '#8a5a36'); }
    // the front vice: a wooden jaw, two iron guide bars, the screw hub and a tommy-bar handle with knob ends
    const vx = -0.44, vz = D / 2;
    sbox(B, 0.27, 0.135, 0.048, 0.014, vx, top - 0.142, vz + 0.025, '#c89058');
    for (const s of [-1, 1]) pipe(B, [vx + s * 0.1, top - 0.1, vz + 0.055], [vx + s * 0.1, top - 0.1, vz - 0.02], 0.009, '#8a8694', { seg: 6 });
    { const hub = G.cyl(0.026, 0.031, 0.036, 12); hub.rotateX(PI / 2); put(B, hub, vx, top - 0.088, vz + 0.066, IRON); }
    pipe(B, [vx, top - 0.032, vz + 0.078], [vx, top - 0.212, vz + 0.078], 0.0105, HONEY, { seg: 8 });
    for (const y of [top - 0.032, top - 0.212]) ball(B, 0.018, vx, y, vz + 0.078, '#c87a46', 1, 6);
    // the low shelf: a stack of planks and a mallet; wood shavings
    [['#ecc490', -0.24, 0.0, 0.03], ['#d49a62', -0.21, 0.024, -0.05], ['#c48a52', -0.25, 0.048, 0.07]].forEach(([c, x, dy, ry]) => B.at([x, 0.182 + dy, 0.0], ry, () => put(B, G.beam(0.62, 0.024, 0.13, 0.006), 0, 0.012, 0, (p, n, o) => o.set(c).multiplyScalar(Math.abs(n.x) > 0.7 ? 0.78 : n.y > 0.5 ? 1.04 : 0.9))));
    B.at([0.34, 0.182, 0.0], 0.45, () => { const h = G.cyl(0.045, 0.045, 0.13, 12); h.rotateZ(PI / 2); put(B, h, 0, 0.045, 0, (p, n, o) => o.set(Math.abs(n.x) > 0.7 ? '#f0cc94' : '#c88c56')); pipe(B, [0, 0.045, 0.04], [0, 0.03, 0.22], 0.012, HONEY, { seg: 7 }); });
    const shaving = (x, y, z, ry, s) => { const g = shavingGeo(0.017 * s, 1.5, 0.019 * s); paint(g, (p, n, o) => o.set('#f6dcac').lerp(col('#e2b47a'), clamp(Math.abs(p.x) / (0.01 * s)) * 0.5)); g.rotateY(ry); put(B, g, x, y, z, null); };
    shaving(0.22, top, -0.16, 0.5, 1.1); shaving(0.62, top, -0.15, 4.0, 1); shaving(0.05, 0.182, 0.06, 1.0, 1.1); shaving(-0.5, 0, 0.12, 2.2, 1.2);
    // a hand plane resting at the back edge of the top
    B.at([0.42, top, -0.14], 0.22, () => {
      sbox(B, 0.2, 0.05, 0.064, 0.016, 0, 0, 0, '#d8a066');
      B.at([0.012, 0.045, 0], 0, () => put(B, G.beam(0.03, 0.05, 0.05, 0.006), 0, 0.025, 0, '#a4aec0'), 1, 0, -0.55);
      const tt = G.torus(0.028, 0.0095, 5, 8, PI); put(B, tt, 0.06, 0.05, 0, '#c8584a');
      ball(B, 0.019, -0.068, 0.064, 0, '#c8584a', 1, 7);
    });
    // the pegboard back on two posts with a capped rail and ball finials
    const pz = -0.195, fz = pz + 0.011;
    for (const sx of [-1, 1]) { put(B, G.beam(0.055, 1.25 - top + 0.02, 0.05, 0.012), sx * 0.69, (top - 0.02 + 1.25) / 2, pz, legC); ball(B, 0.026, sx * 0.69, 1.273, pz, legL, 1, 8); }
    sbox(B, 1.44, 0.035, 0.064, 0.014, 0, 1.24, pz, legC);
    sbox(B, 1.33, 0.33, 0.02, 0.006, 0, top + 0.05, pz, (p, n, o) => o.set(board).multiplyScalar(0.95 + 0.05 * Math.sin(p.x * 70 + Math.sin(p.y * 40))));
    sbox(B, 1.42, 0.05, 0.032, 0.01, 0, top, pz + 0.004, legL);
    const holes = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 22; c++) { const x = -0.6 + c * 0.057, y = top + 0.085 + r * 0.05; if (y < 1.225) holes.push(G.disc(0.006, 5).translate(x, y, fz + 0.0006)); }
    B.add(mergeG(holes), '#9a7656');
    const peg = (x, y, L = 0.042) => { const g = G.cyl(0.0058, 0.0058, L, 6); g.rotateX(PI / 2); put(B, g, x, y, fz + L / 2, '#e8d0a0'); };
    const steel = (p, n, o) => o.set('#a4aec2').lerp(col('#e2e8f2'), clamp(n.y * 0.6 + n.z * 0.4) * 0.6);
    // hammer: the head rests on two pegs, the handle hangs
    peg(-0.5, 1.142); peg(-0.44, 1.142);
    B.at([-0.47, 1.17, fz + 0.03], 0, () => {
      sbox(B, 0.085, 0.036, 0.034, 0.008, -0.004, -0.018, 0, steel);
      const f = G.cyl(0.02, 0.021, 0.024, 10); f.rotateZ(PI / 2); put(B, f, -0.056, 0, 0, steel);
      for (const s of [-1, 1]) curve(B, [[0.035, 0.004, s * 0.0065], [0.062, -0.001, s * 0.008], [0.08, -0.024, s * 0.01]], t => 0.0105 - t * 0.0055, steel, { radial: 5, n: 5 });
      pipe(B, [0, -0.014, 0], [0, -0.23, 0], 0.012, HONEY, { r1: 0.015, seg: 8 });
      cyl(B, 0.018, 0.018, 0.06, 10, 0, -0.245, 0, '#e8604a'); ball(B, 0.018, 0, -0.245, 0, '#e8604a', 1, 8);
    });
    // hand saw: hung on a peg through its handle, teeth down, blade to the right
    peg(-0.15, 1.068);
    B.at([-0.15, 1.05, fz + 0.022], 0, () => {
      const L = 0.34, nT = 18, bl = new THREE.Shape(); bl.moveTo(0, -0.04);
      for (let i = 1; i <= nT; i++) bl.lineTo(i / nT * L, -0.04 - (i % 2 ? 0.009 : 0));
      bl.lineTo(L, -0.004); bl.quadraticCurveTo(L * 0.5, 0.02, 0, 0.045); bl.lineTo(0, -0.04);
      put(B, extrude(bl, 0.003, 0.0012, 4), 0.045, 0, -0.003, (p, n, o) => o.set('#c4ccd8').lerp(col('#f4f8fc'), clamp(n.z) * 0.45 + clamp(p.y + 0.01) * 4).multiplyScalar(p.y < -0.041 ? 0.72 : 1));
      const hs = roundRect(0.11, 0.105, 0.038); hs.holes.push(roundRect(0.05, 0.042, 0.016, -0.004, 0.012, new THREE.Path()));
      put(B, extrude(hs, 0.018, 0.006, 3), 0, 0, -0.012, (p, n, o) => o.set('#e06a58').multiplyScalar(0.9 + 0.12 * clamp(n.z)));
      for (const [x, y] of [[0.038, 0.022], [0.038, -0.024]]) ball(B, 0.0065, x, y, 0.014, GOLD, [1, 1, 0.5], 6);
    });
    // a yellow ruler and a mint set square
    peg(0.24, 1.198, 0.03);
    sbox(B, 0.036, 0.3, 0.007, 0.002, 0.24, 0.915, fz + 0.008, '#ffd24a');
    for (let i = 0; i < 15; i++) put(B, G.plane(i % 5 ? 0.01 : 0.018, 0.0028), 0.24 - 0.018 + (i % 5 ? 0.005 : 0.009), 0.94 + i * 0.018, fz + 0.012, INK);
    { const sq = new THREE.Shape([[0, 0], [0.15, 0], [0, 0.15]].map(q => new THREE.Vector2(...q))); sq.holes.push(new THREE.Path([[0.03, 0.026], [0.09, 0.026], [0.03, 0.086]].map(q => new THREE.Vector2(...q))));
      put(B, extrude(sq, 0.004, 0.002, 2), 0.3, 1.04, fz + 0.002, (p, n, o) => o.set('#8fe0c0').lerp(col('#d8fff0'), clamp(n.z) * 0.3)); peg(0.33, 1.15, 0.03); }
    // a little ledge on the right with the jar of nails and a ball of twine
    sbox(B, 0.3, 0.022, 0.1, 0.008, 0.52, 1.02, fz + 0.05, legL);
    for (const s of [-1, 1]) put(B, G.beam(0.022, 0.05, 0.08, 0.006), 0.52 + s * 0.12, 0.997, fz + 0.04, legC);
    B.at([0.46, 1.042, fz + 0.05], 0, () => {
      const jp = [[0.001, 0], [0.03, 0], [0.034, 0.006], [0.035, 0.062], [0.03, 0.072], [0.026, 0.076], [0.028, 0.084], [0.024, 0.086], [0.022, 0.07], [0.001, 0.066]];
      lathe(B, jp, 14, 0, 0, 0, (p, n, o) => {
        const a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z);
        if (r < 0.023 && p.y > 0.06 && n.y > 0.5) { o.set('#8a96a8'); return; }
        o.set(p.y < 0.052 ? '#a8b4c4' : '#dcf2f2'); if (p.y < 0.052 && Math.sin(a * 9 + p.y * 230) > 0.4) o.set('#7c889a');
        if (Math.abs(a - 0.7) < 0.2 && p.y > 0.01 && p.y < 0.07) o.lerp(col('#ffffff'), 0.65);
      });
      for (let k = 0; k < 5; k++) { const a = k * 1.25, t = 0.25 + (k % 3) * 0.1, dir = V(Math.sin(a) * t, 1, Math.cos(a) * t).normalize(), b = V(Math.sin(a) * 0.01, 0.062, Math.cos(a) * 0.01), e = b.clone().addScaledVector(dir, 0.045);
        pipe(B, b.toArray(), e.toArray(), 0.0024, '#9aa2b0', { seg: 4 }); const hd = G.cyl(0.006, 0.006, 0.0025, 6); alignY(hd, dir); put(B, hd, e.x, e.y, e.z, '#b8c0cc'); }
      const lid = G.cyl(0.037, 0.037, 0.012, 14); lid.rotateZ(1.2); put(B, lid, -0.05, 0.03, 0.004, '#e8403a');
    });
    B.at([0.585, 1.074, fz + 0.05], 0, () => { ball(B, 0.032, 0, 0, 0, (p, n, o) => o.set(Math.sin(p.y * 260 + p.x * 140) > 0 ? '#e0c48c' : '#c8a464'), 1, 10); curve(B, [[0.02, -0.02, 0.02], [0.04, -0.04, 0.03], [0.045, -0.08, 0.035]], 0.003, '#d8b878', { radial: 4, n: 5 }); });
    B.pop();
  },

  melonStool(B) {
    // half a ribbed musk melon (cut side up) as the base, the juicy cut face as a plump seat: rind band, pale flesh
    // fading to green, a peachy seed hollow with a ring of seeds; a sleepy little face, a curly vine and a leaf
    const ribs = 10, prof = [[0.001, 0.0], [0.07, 0.0], [0.11, 0.008], [0.15, 0.03], [0.178, 0.065], [0.196, 0.11], [0.205, 0.16], [0.206, 0.21], [0.2, 0.255], [0.19, 0.29], [0.18, 0.316], [0.172, 0.33]];
    const R = y => profR(prof)(y), rib = a => 1 + 0.034 * Math.cos(ribs * a + PI);
    const g = weld(G.lathe(prof, 60)), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), k = 1 + (rib(Math.atan2(x, z)) - 1) * clamp(y / 0.06); p.setX(i, x * k); p.setZ(i, z * k); }
    g.computeVertexNormals();
    const LT = col('#a6d466'), DK = col('#5e9c44'), SUT = col('#477f38'), NET = col('#eef4c8');
    B.add(g, (q, n, o) => {
      const a = Math.atan2(q.x, q.z), c = Math.cos(ribs * a + PI), t = clamp(q.y / 0.3);
      o.copy(DK).lerp(LT, 0.3 + 0.7 * t).lerp(SUT, clamp(-c - 0.55) * 1.7).lerp(NET, clamp(c - 0.55) * 0.5 * clamp(q.y / 0.08));
      o.multiplyScalar(0.94 + 0.08 * clamp(n.y + 0.3));
    });
    // the cut: a dark rind ring, a pale rind layer, then the seat cushion of flesh
    const sy = 0.326, cw = 0.35, chh = 0.09;
    { const r = G.torus(0.172, 0.011, 6, 40); r.rotateX(PI / 2); put(B, r, 0, sy + 0.003, 0, '#4a8a3c'); }
    B.add(pillowGeo(cw, chh, cw, { sq: 1, edge: 0.32, bot: 0.22, ws: 32, hs: 10, dimple: 0.012 }).translate(0, sy, 0), (q, n, o) => {
      const e = Math.hypot(q.x, q.z) / (cw / 2);
      if (n.y < 0.35 && q.y < sy + 0.03) { o.set('#e8f4c4').multiplyScalar(0.92 + 0.08 * clamp(n.y + 0.5)); return; }
      o.set(e < 0.3 ? '#ffbe7a' : e < 0.36 ? '#f6dc96' : '#bfe886').lerp(col('#eaf8c8'), clamp((e - 0.6) / 0.32));
      if (e < 0.3) o.lerp(col('#ffd89c'), clamp(e / 0.3) * 0.45);
    });
    const topY = e => sy + pillowY(chh, 0.22, 0.32, e) - 0.012 * Math.exp(-e * e / 0.03);
    for (let k = 0; k < 13; k++) { const inner = k < 5, a = (inner ? k / 5 : (k - 5) / 8) * TAU + (inner ? 0.5 : 0.1) + B.wob(0.25), r = inner ? 0.02 : 0.04, s = G.sph(1, 6, 4); s.scale(0.0065, 0.0042, 0.0115); s.rotateY(a + B.wob(0.5)); put(B, s, Math.sin(a) * r, topY(r / (cw / 2)) + 0.001, Math.cos(a) * r, '#f6e2b0'); }
    // a sleepy face on the front lobes
    const surf = (a, y) => { const rr = R(y) * rib(a); return [Math.sin(a) * rr, y, Math.cos(a) * rr]; };
    for (const s of [-1, 1]) {
      const [ex, ey, ez] = surf(s * 0.31, 0.2), e = G.torus(0.014, 0.0042, 3, 8, PI); e.rotateZ(PI); e.rotateY(s * 0.31); put(B, e, ex, ey, ez + 0.002, INK);
      const [bx, by, bz] = surf(s * 0.5, 0.165), bl = G.sph(1, 8, 5); bl.scale(0.024, 0.014, 0.006); bl.rotateY(s * 0.5); put(B, bl, bx, by, bz, '#ff9eb0');
    }
    { const [mx, my, mz] = surf(0, 0.168), m = G.torus(0.012, 0.0038, 3, 8, PI); m.rotateZ(PI); put(B, m, mx, my, mz + 0.003, INK); }
    // a little vine curling off the back-right rim with a lobed leaf
    // a lobed leaf lying against the rind at the back-right, a curly tendril springing up beside it
    const la = 2.0, vb = surf(la, 0.27), on = V(Math.sin(la), 0.9, Math.cos(la)).normalize();
    const lf = twoSided(blossomGeo(0.075, 5, 0.62)); paint(lf, (q, n, o) => o.set('#5aa846').lerp(col('#a8d878'), clamp(Math.hypot(q.x, q.z) / 0.075) * 0.55).multiplyScalar(0.9 + 0.1 * clamp(n.y)));
    alignY(lf, on); put(B, lf, vb[0] + on.x * 0.012, vb[1] + 0.012, vb[2] + on.z * 0.012, null, 'leaf');
    const tb = surf(la + 0.35, 0.31), coil = []; for (let i = 0; i <= 18; i++) { const t = i / 18, ang = t * TAU * 1.6, rr = 0.022 * (1 - 0.6 * t); coil.push([tb[0] + Math.sin(la) * 0.01 + Math.cos(ang) * rr * Math.cos(la), tb[1] + 0.01 + t * 0.07, tb[2] + Math.cos(la) * 0.01 - Math.cos(ang) * rr * Math.sin(la) + Math.sin(ang) * rr * 0.5]); }
    curve(B, coil, t => 0.005 - t * 0.0025, '#5a9a3c', { radial: 4 });
    curve(B, [vb, [tb[0], tb[1] - 0.01, tb[2]], coil[0]], 0.006, '#5a9a3c', { radial: 4, n: 5 });
  },

  artEasel(B) {
    // a wooden A-frame easel (two splayed front legs, a hinged back leg, a cross rail, a tray ledge, a central mast with
    // a clamp) holding Mochi's half-finished purple sunrise; a palette hangs from a hook on the tray, a paint rag drapes
    // over the tray's right end, brushes and a paint tube lie on the tray
    const wood = '#c8915c', woodD = '#a06a40', woodL = '#e2b07c', lean = 0.112;
    for (const sx of [-1, 1]) B.add(rbar([sx * 0.19, 0, 0.12], [sx * 0.05, 1.38, -0.035], 0.06, 0.048, 0.014), wood);
    B.add(rbar([0, 1.33, -0.075], [0, 0, -0.23], 0.052, 0.044, 0.013), woodD);
    for (const [x, z] of [[-0.19, 0.12], [0.19, 0.12], [0, -0.23]]) sbox(B, 0.068, 0.022, 0.068, 0.008, x, 0, z, woodD);
    sbox(B, 0.16, 0.08, 0.064, 0.02, 0, 1.33, -0.04, woodD);
    { const h = G.cyl(0.016, 0.016, 0.2, 10); h.rotateZ(PI / 2); put(B, h, 0, 1.36, -0.08, woodL); }
    for (const sx of [-1, 1]) ball(B, 0.02, sx * 0.1, 1.36, -0.08, woodL, 1, 8);
    ball(B, 0.028, 0, 1.43, -0.04, woodL, 1, 10);
    B.add(rbar([-0.17, 0.28, 0.089], [0.17, 0.28, 0.089], 0.046, 0.036, 0.011), woodD);
    B.add(rbar([0, 0.28, 0.074], [0, 1.31, -0.042], 0.046, 0.032, 0.011), woodD);
    // the tray ledge with a front lip and two brackets
    sbox(B, 0.52, 0.026, 0.086, 0.01, 0, 0.49, 0.095, wood);
    sbox(B, 0.52, 0.04, 0.018, 0.007, 0, 0.5, 0.137, woodL);
    for (const sx of [-1, 1]) sbox(B, 0.04, 0.06, 0.06, 0.01, sx * 0.137, 0.44, 0.072, woodD);
    // the canvas, tilted back with the legs, and its painting
    B.at([0, 0.516, 0.1], 0, () => {
      const cw = 0.48, ch = 0.4;
      sbox(B, cw, ch, 0.03, 0.006, 0, 0, 0, (p, n, o) => o.set('#f4ead8').multiplyScalar(n.z < -0.5 ? 0.9 : 1));
      const Z = 0.0156, L = (g, c, k = 0) => put(B, g, 0, 0, Z + k * 0.0005, c);
      const sky = G.plane(cw - 0.02, ch - 0.02, 1, 12); sky.translate(0, ch / 2, 0);
      L(sky, (p, n, o) => { const t = (p.y - 0.16) / 0.23; o.set('#ffb8b4').lerp(col('#e894c8'), clamp(t * 2.2)).lerp(col('#9a62d0'), clamp(t * 1.7 - 0.55)).lerp(col('#5e3cac'), clamp(t * 2 - 1.3)); });
      const sx0 = 0.07, hy = 0.16;
      L(new THREE.RingGeometry(0.078, 0.108, 28, 1, 0, PI).translate(sx0, hy, 0), '#ffc4cc', 1);
      L(new THREE.CircleGeometry(0.078, 28, 0, PI).translate(sx0, hy, 0), '#ffe2a8', 2);
      L(new THREE.CircleGeometry(0.05, 22, 0, PI).translate(sx0, hy, 0), '#fff4d4', 3);
      for (let k = 0; k < 7; k++) { const a = 0.25 + k / 6 * (PI - 0.5); L(ribbon([[sx0 + Math.cos(a) * 0.118, hy + Math.sin(a) * 0.118], [sx0 + Math.cos(a) * 0.15, hy + Math.sin(a) * 0.15]], 0.007), '#ffd8c0', 1); }
      L(stroke([[-0.2, 0.31], [-0.14, 0.322], [-0.08, 0.316], [-0.03, 0.326]], 0.02, 1, 0, 0, 10), '#f6a8d8', 2);
      L(stroke([[0.1, 0.345], [0.15, 0.354], [0.21, 0.348]], 0.016, 1, 0, 0, 8), '#ffc6e6', 2);
      const hills = (f, y0, c, k) => { const s = new THREE.Shape(); s.moveTo(-0.23, y0); for (let i = 0; i <= 30; i++) { const x = -0.23 + i / 30 * 0.46; s.lineTo(x, f(x)); } s.lineTo(0.23, y0); s.lineTo(-0.23, y0); L(new THREE.ShapeGeometry(s), c, k); };
      hills(x => 0.165 + 0.03 * Math.sin(x * 14 + 0.6) + 0.012 * Math.sin(x * 37), 0.1, '#9a74cc', 4);
      L(new THREE.ShapeGeometry(roundRect(0.46, 0.05, 0.004, 0, 0.085)), '#bc98e4', 6);
      for (const [y, w] of [[0.1, 0.06], [0.09, 0.045], [0.078, 0.03]]) L(ribbon([[sx0 - w / 2, y], [sx0 + w / 2, y]], 0.006), '#ffe4cc', 7);
      hills(x => 0.06 + 0.035 * Math.cos((x + 0.1) * 9) * (x < 0.06 ? 1 : 0.2), 0.01, '#5a4096', 9);
      // the unfinished corner: bare canvas with pencil lines, two fresh strokes running into it
      const un = new THREE.Shape(); un.moveTo(0.06, 0.01); un.lineTo(0.23, 0.01); un.lineTo(0.23, 0.13); un.quadraticCurveTo(0.17, 0.1, 0.15, 0.05); un.quadraticCurveTo(0.12, 0.03, 0.06, 0.01);
      L(new THREE.ShapeGeometry(un, 6), '#f6eedc', 11);
      L(stroke([[0.12, 0.03], [0.16, 0.05], [0.2, 0.07], [0.225, 0.09]], 0.0025, 1, 0, 0, 8), '#9a96a8', 12);
      L(stroke([[0.17, 0.02], [0.175, 0.045], [0.19, 0.06]], 0.0025, 1, 0, 0, 6), '#9a96a8', 12);
      L(stroke([[0.04, 0.075], [0.1, 0.07], [0.14, 0.06]], 0.012, 1, 0, 0, 8), '#7a58b8', 12);
      decal(B, 'paw', 0.028, -0.19, 0.035, Z + 0.008, { colors: ['#ff8fb0'] });
      // a clamp holding the top edge
      sbox(B, 0.08, 0.04, 0.05, 0.012, 0, ch - 0.012, -0.012, woodL);
    }, 1.08, -lean);
    // the palette hanging by its thumb hole from a hook under the tray's left end
    const hx = -0.2, hy = 0.49, hz = 0.12;
    curve(B, [[hx, hy, hz], [hx, hy - 0.022, hz + 0.004], [hx + 0.006, hy - 0.034, hz + 0.012], [hx + 0.01, hy - 0.026, hz + 0.018]], 0.003, GOLD, { radial: 4, n: 6 });
    B.at([hx + 0.008, hy - 0.036, hz + 0.024], -0.3, () => {
      const s = new THREE.Shape(); s.moveTo(-0.11, 0); s.bezierCurveTo(-0.11, 0.09, 0.02, 0.1, 0.09, 0.062); s.bezierCurveTo(0.135, 0.032, 0.125, -0.055, 0.07, -0.072); s.bezierCurveTo(0.03, -0.085, 0.005, -0.05, -0.028, -0.06); s.bezierCurveTo(-0.08, -0.08, -0.11, -0.05, -0.11, 0);
      s.holes.push(new THREE.Path().absarc(-0.07, -0.012, 0.016, 0, TAU, true));
      const pg = extrude(s, 0.006, 0.004, 8); pg.translate(0.07, 0.012, 0); pg.rotateZ(-PI / 2);
      B.add(pg, (p, n, o) => o.set('#e8bc88').multiplyScalar(0.92 + 0.1 * clamp(n.z)));
      for (const [x, y, c] of [[-0.035, -0.04, '#9a62d0'], [0.03, -0.05, '#ff8fb0'], [0.045, -0.1, '#ffd24a'], [0.035, -0.15, '#ffffff'], [-0.01, -0.175, '#6ab8f0'], [-0.045, -0.13, '#8fe0a0']]) ball(B, 0.014, x, y, 0.016, c, [1.1, 1, 0.5], 7);
    }, 1, -0.1);
    // the paint rag draped over the tray's right end
    { const pos = [], rows = [], NW = 4, NS = 9;
      const path = spline2([[0.06, 0.519], [0.112, 0.521], [0.124, 0.546], [0.139, 0.553], [0.153, 0.541], [0.157, 0.47], [0.161, 0.4], [0.165, 0.335]], NS + 1);
      for (let j = 0; j <= NS; j++) { const s = j / NS, [z, y] = path[j]; const row = []; for (let i = 0; i <= NW; i++) { const u = i / NW, x = 0.12 + u * 0.12 + (s > 0.5 ? 0.012 * Math.sin(u * 7 + s * 5) : 0); row.push(V(x, y, z + (s > 0.5 ? 0.008 * Math.sin(u * 9 + 1) * s : 0))); } rows.push(row); }
      for (let j = 0; j < NS; j++) for (let i = 0; i < NW; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], dd = rows[j + 1][i + 1]; triP(pos, a, c, b); triP(pos, b, c, dd); }
      const rg = geoOf(pos);
      paint(rg, (p, n, o) => { o.set('#f6efe4'); const k = nz(p.x * 45, p.y * 45 + p.z * 30); if (k > 0.45) o.set('#a87ad8'); else if (k < -0.55) o.set('#ff9ec4'); else if (Math.abs(k - 0.1) < 0.05) o.set('#ffd24a'); });
      B.cloth(rg, null, { x0: 0.12, x1: 0.24, yTop: 0.55, yBot: 0.3 }); }
    // brushes and a squeezed paint tube on the tray
    for (const [z, c, tip, rot] of [[0.075, '#e85a6a', '#9a62d0', 0.08], [0.1, '#5a8ad8', '#ff8fb0', -0.05]]) B.at([-0.02, 0.522, z], rot, () => {
      pipe(B, [-0.12, 0, 0], [0.05, 0, 0], 0.0048, c, { r1: 0.0058, seg: 6 });
      const ct = G.cyl(0.0062, 0.0062, 0.018, 8); ct.rotateZ(PI / 2); put(B, ct, 0.06, 0, 0, '#c8ccd4');
      const br = G.cone(0.0075, 0.026, 8); br.rotateZ(-PI / 2); put(B, br, 0.082, 0, 0, (p, n, o) => o.set('#f2e2c4').lerp(col(tip), clamp((p.x - 0.075) / 0.015))); });
    B.at([-0.15, 0.53, 0.105], 0.3, () => { const tb = new THREE.CapsuleGeometry(0.011, 0.05, 3, 8); tb.rotateZ(PI / 2); tb.scale(1, 0.7, 1); B.add(tb, '#c8a8f0'); const cap = G.cyl(0.0065, 0.0065, 0.012, 8); cap.rotateZ(PI / 2); put(B, cap, 0.042, 0, 0, '#ffffff'); });
  },

  paintPots(B) {
    // a little wooden tray of glass paint jars (some open with drips, some capped, a lid off), and a mug of brushes
    const tr = extrude(roundRect(0.27, 0.17, 0.04), 0.008, 0.005, 4); tr.rotateX(-PI / 2); B.add(tr, (p, n, o) => o.set(n.y > 0.7 ? '#e2b07a' : '#b87a46'));
    const rim = roundRect(0.285, 0.185, 0.046); rim.holes.push(roundRect(0.255, 0.155, 0.034, 0, 0, new THREE.Path()));
    const rgm = extrude(rim, 0.012, 0.004, 4); rgm.rotateX(-PI / 2); put(B, rgm, 0, 0.012, 0, (p, n, o) => o.set('#c88a52').lerp(col('#e8b07a'), clamp(n.y) * 0.4));
    const y0 = 0.018;
    const jar = (x, z, c, lid, drip) => B.at([x, y0, z], 0, () => {
      const jp = [[0.001, 0], [0.023, 0], [0.027, 0.004], [0.028, 0.038], [0.025, 0.045], [0.022, 0.048], [0.024, 0.051], [0.024, 0.057], [0.02, 0.058], [0.019, 0.05], [0.001, 0.046]];
      const C = col(c), CL = col(c).lerp(col('#ffffff'), 0.3);
      lathe(B, jp, 14, 0, 0, 0, (p, n, o) => {
        const r = Math.hypot(p.x, p.z);
        if (p.y > 0.044 && r < 0.0195 && n.y > 0.5) { o.copy(C).lerp(col('#ffffff'), 0.1); return; }
        if (p.y < 0.04) { o.copy(C).lerp(CL, clamp(n.x * 0.6 + n.z * 0.5) * 0.7); if (Math.abs(Math.atan2(p.x, p.z) - 0.7) < 0.22) o.lerp(col('#ffffff'), 0.45); return; }
        o.set('#e2f2f2').lerp(col('#ffffff'), clamp(n.y) * 0.3);
      });
      if (lid) { lathe(B, [[0.001, 0.048], [0.0265, 0.048], [0.0275, 0.052], [0.0275, 0.062], [0.024, 0.066], [0.001, 0.067]], 14, 0, 0, 0, (p, n, o) => o.set(lid).multiplyScalar(0.92 + 0.1 * clamp(n.y))); }
      if (drip) { const g = G.sph(1, 6, 5); g.scale(0.0065, 0.018, 0.004); g.rotateY(drip); put(B, g, Math.sin(drip) * 0.0282, 0.043, Math.cos(drip) * 0.0282, c); ball(B, 0.008, Math.sin(drip) * 0.024, 0.0475, Math.cos(drip) * 0.024, c, [1, 0.5, 1], 6); }
    });
    jar(-0.095, -0.04, '#9a62d0', null, 0.4); jar(-0.035, -0.045, '#ff8fb0', '#ffd8e4'); jar(0.025, -0.042, '#ffd24a', null, -0.3);
    jar(-0.045, 0.035, '#6ab8f0', null, 0.6); jar(0.016, 0.04, '#8fe0a0', '#e8fff4');
    B.at([-0.103, y0, 0.052], 0, () => lathe(B, [[0.001, 0], [0.024, 0], [0.0275, 0.004], [0.0275, 0.014], [0.0265, 0.018], [0.001, 0.018]], 14, 0, 0, 0, (p, n, o) => o.set('#efe4ff').multiplyScalar(0.92 + 0.08 * clamp(n.y))), 1, 0.12, 0.05);
    // the brush mug: a sky-blue mug with a white band, four brushes with paint on their tips
    B.at([0.085, y0, 0.012], 0, () => {
      const mp = [[0.001, 0], [0.03, 0], [0.034, 0.006], [0.036, 0.07], [0.037, 0.076], [0.033, 0.076], [0.031, 0.012], [0.001, 0.01]];
      lathe(B, mp, 16, 0, 0, 0, (p, n, o) => { const outer = n.x * p.x + n.z * p.z > 0; o.set(!outer ? '#5a7ea0' : p.y > 0.03 && p.y < 0.044 ? '#ffffff' : '#9cd2f2'); if (outer) o.lerp(col('#e8f6ff'), clamp(n.x * 0.5 + n.z * 0.5) * 0.3); });
      const h = G.torus(0.02, 0.0065, 5, 10, PI); h.rotateZ(-PI / 2); put(B, h, 0.034, 0.04, 0, '#9cd2f2');
      [['#e8504a', '#9a62d0', -0.2, 0.3], ['#ffd24a', '#ff8fb0', 0.25, 1.9], ['#5a8ad8', '#ffd24a', 0.18, 3.6], ['#8fd8a0', '#6ab8f0', 0.12, 5.0]].forEach(([c, tip, tl, az]) => {
        const dir = V(Math.sin(az) * Math.sin(Math.abs(tl) + 0.08), 1, Math.cos(az) * Math.sin(Math.abs(tl) + 0.08)).normalize(), b = V(Math.sin(az) * 0.008, 0.012, Math.cos(az) * 0.008);
        const e = b.clone().addScaledVector(dir, 0.122), f = e.clone().addScaledVector(dir, 0.016);
        pipe(B, b.toArray(), e.toArray(), 0.0042, c, { r1: 0.0034, seg: 6 });
        pipe(B, e.toArray(), f.toArray(), 0.005, '#c8ccd4', { seg: 6 });
        const br = G.lathe([[0.001, 0], [0.0062, 0.002], [0.0068, 0.012], [0.004, 0.024], [0.001, 0.03]], 7); paint(br, (p, n, o) => o.set('#f2e2c4').lerp(col(tip), clamp((p.y - 0.008) / 0.014)));
        alignY(br, dir); put(B, br, f.x, f.y, f.z, null);
      });
    });
  },

  catTower(B) {
    // a carpeted base, a cubby house with a round door, a sisal-wrapped post to a round mid platform, a carpeted post up
    // to a cat-eared bowl bed; a pom-pom dangles from the mid platform; paw prints on the base
    const carpet = '#dccaf6', carpetD = '#c2a6ea', carpetB = '#a68ad4', trim = '#fff1de', sisal = '#e2c48e', sisalD = '#c6a066';
    sbox(B, 0.48, 0.07, 0.48, 0.03, 0, 0, 0, fuzz(carpetB, 1.6));
    for (const [x, z, a] of [[0.06, 0.2, 0.3], [0.2, 0.0, -0.4]]) B.at([x, 0.0712, z], 0, () => decal(B, 'paw', 0.07, 0, 0, 0, { colors: ['#ffb6d0'] }), 1, -PI / 2, a);
    // the cubby
    const cx = -0.085, cz = -0.085, cy = 0.07, cs = 0.3;
    sbox(B, cs, cs, cs, 0.05, cx, cy, cz, fuzz(carpetD, 1.6));
    const fz = cz + cs / 2;
    put(B, G.disc(0.085, 24), cx, cy + 0.14, fz + 0.001, (p, n, o) => o.set('#3e3050'));
    put(B, G.disc(0.066, 20), cx + 0.008, cy + 0.132, fz + 0.0015, '#2e2440');
    { const r = G.torus(0.089, 0.016, 6, 24); put(B, r, cx, cy + 0.14, fz + 0.004, (p, n, o) => o.set(trim).multiplyScalar(0.92 + 0.1 * clamp(n.y + n.z))); }
    B.add(pillowGeo(0.36, 0.055, 0.36, { sq: 0.35, edge: 0.25, bot: 0.6, ws: 20, hs: 6 }).translate(cx, cy + cs - 0.006, cz), fuzz(carpet, 1.6));
    // the sisal post (front-right) up to the mid platform: ribbed coils with helical stripes, carpet collars
    const px = 0.11, pzz = 0.11, y0 = 0.07, y1 = 0.8, post = [[0.001, y0]];
    for (let y = y0; y < y1 - 0.02; y += 0.026) post.push([0.05, y], [0.057, y + 0.013]);
    post.push([0.05, y1], [0.001, y1]);
    B.add(quadPaint(G.lathe(post, 10), post.length, (i, j, o) => o.set(((j + (i >> 1)) % 4) < 2 ? sisal : sisalD).multiplyScalar(j % 2 ? 1.04 : 0.94)).translate(px, 0, pzz), null);
    for (const y of [y0, y1 - 0.03]) cyl(B, 0.068, 0.068, 0.03, 14, px, y, pzz, fuzz(carpetD, 1.6));
    // the mid platform and the dangling pom-pom
    const mx = 0.08, mz = 0.08, my = 0.8;
    B.add(pillowGeo(0.38, 0.072, 0.38, { sq: 1, edge: 0.25, bot: 0.7, ws: 26, hs: 6 }).translate(mx, my, mz), fuzz(carpet, 1.6));
    { const t = G.torus(0.19, 0.013, 5, 30); t.rotateX(PI / 2); put(B, t, mx, my + 0.03, mz, trim); }
    const ax = mx - 0.13, az = mz + 0.12, sb = 0.62;
    const str = G.cyl(0.0035, 0.0035, my + 0.012 - sb, 4, true); str.translate(ax, (my + 0.012 + sb) / 2, az); B.cloth(str, '#ff7aa8', { x0: -0.3, x1: 0.3, yTop: my, yBot: 0.52 });
    { const pp = G.ico(0.056, 1), q = pp.attributes.position; for (let i = 0; i < q.count; i++) { const k = 1 + 0.16 * Math.sin(q.getX(i) * 913 + q.getY(i) * 531 + q.getZ(i) * 377) ** 2; q.setXYZ(i, q.getX(i) * k, q.getY(i) * k, q.getZ(i) * k); } pp.computeVertexNormals(); pp.translate(ax, sb - 0.05, az);
      B.cloth(pp, (p, n, o) => o.set('#ff7aa8').lerp(col('#ffd0e0'), clamp(n.y) * 0.45), { x0: -0.3, x1: 0.3, yTop: my, yBot: 0.52 }); }
    // the carpeted post to the top bed
    const qx = -0.1, qz = -0.1;
    const q0 = cy + cs + 0.04, post2 = [[0.001, q0]]; for (let y = q0; y < 1.27; y += 0.03) post2.push([0.05, y], [0.057, y + 0.015]); post2.push([0.05, 1.29], [0.001, 1.29]);
    B.add(quadPaint(G.lathe(post2, 9), post2.length, (i, j, o) => o.set(((j + (i >> 1)) % 4) < 2 ? sisal : sisalD).multiplyScalar(j % 2 ? 1.04 : 0.94)).translate(qx, 0, qz), null);
    cyl(B, 0.066, 0.066, 0.03, 14, qx, q0 - 0.01, qz, fuzz(carpetD, 1.6));
    // the top bed: a puffy bowl with cat ears on its back rim and a pink cushion
    const bx = -0.06, bz = -0.06, by = 1.27;
    const bed = [[0.001, 0], [0.18, 0], [0.198, 0.016], [0.208, 0.05], [0.204, 0.09], [0.19, 0.115], [0.168, 0.12], [0.152, 0.1], [0.148, 0.06], [0.13, 0.045], [0.001, 0.042]];
    lathe(B, bed, 28, bx, by, bz, fuzz(carpetD, 1.6));
    B.add(pillowGeo(0.27, 0.05, 0.27, { sq: 1, edge: 0.3, bot: 0.3, ws: 22, hs: 8, dimple: 0.008 }).translate(bx, by + 0.04, bz), (p, n, o) => o.set('#ffc2d6').multiplyScalar(0.92 + 0.1 * clamp(n.y)));
    for (const s of [-1, 1]) {
      const a = PI + s * 0.62, ex = bx + Math.sin(a) * 0.17, ez = bz + Math.cos(a) * 0.17;
      const ear = G.cone(0.06, 0.09, 10); ear.scale(1, 1, 0.5); ear.rotateY(a); put(B, ear, ex, by + 0.15, ez, fuzz(carpetD));
      const inner = G.cone(0.036, 0.06, 8); inner.scale(1, 1, 0.3); inner.rotateY(a); put(B, inner, ex - Math.sin(a) * 0.016, by + 0.14, ez - Math.cos(a) * 0.016, '#ffb0c8');
    }
  },

  breadShelf(B) {
    // Kuma's bakery rack: ladder sides with ball finials, slatted shelves with a front rail; a long basket of loaves,
    // two baskets of melon-pan on gingham, croissants on a board with a honey jar and dipper, a chalk price sign on top
    const W = 0.98, D = 0.42, woodD = '#a86e42', woodL = '#e4b078', shelves = [0.1, 0.47, 0.84, 1.2];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.03), z = sz * (D / 2 - 0.03);
      put(B, G.beam(0.055, 1.24, 0.055, 0.014), x, 0.62, z, woodD);
      ball(B, 0.036, x, 1.262, z, woodL, 1, 8);
      put(B, G.beam(0.07, 0.02, 0.069, 0.006), x, 0.01, z, '#8a5a3a');
    }
    for (const y of shelves) {
      for (let k = 0; k < 3; k++) put(B, G.beam(W - 0.05, 0.024, 0.116, 0.008), 0, y + 0.012, -0.12 + k * 0.12, (p, n, o) => o.set(k % 2 ? '#dca46a' : '#e6b27a').multiplyScalar(Math.abs(n.x) > 0.7 ? 0.8 : n.y > 0.5 ? 1.03 : 0.9));
      for (const sx of [-1, 1]) put(B, G.beam(0.04, 0.04, D - 0.06, 0.01), sx * (W / 2 - 0.03), y - 0.008, 0, woodD);
      if (y < 1) pipe(B, [-W / 2 + 0.03, y + 0.06, D / 2 - 0.03], [W / 2 - 0.03, y + 0.06, D / 2 - 0.03], 0.011, woodL, { seg: 7 });
    }
    // bottom: a long basket with a baguette and a batard
    B.at([0, 0.124, 0.0], 0, () => {
      wicker(B, 0.37, 0.13, 0.08, 14);
      B.at([0.02, 0.05, 0.04], 0.1, () => loaf(B, 0.68, 0.034, 6), 1, 0, 0.12);
      B.at([-0.06, 0.03, -0.05], -0.06, () => loaf(B, 0.36, 0.05, 3, '#c88040'));
    });
    // middle: two round baskets of melon-pan on gingham napkins
    for (const sx of [-1, 1]) B.at([sx * 0.235, 0.494, 0.01], sx * 0.25, () => {
      wicker(B, 0.17, 0.15, 0.07, 12);
      put(B, softSheet(0.27, 0.23, { drop: 0.05, nx: 4, nz: 4, sk: 2, bulge: 0.012, color: (X, Z) => (((Math.floor((X + 1) / 0.04) % 2) + (Math.floor((Z + 1) / 0.04) % 2)) === 2 ? '#e8504a' : ((Math.floor((X + 1) / 0.04) + Math.floor((Z + 1) / 0.04)) % 2 ? '#f6a8a0' : '#fff6ee')) }), 0, 0.074, 0, null);
      for (const [x, y, z, rx] of [[-0.062, 0.075, 0.03, 0.1], [0.06, 0.075, 0.028, -0.12], [0.0, 0.09, -0.045, 0.22]]) B.at([x, y, z], x * 9, () => melonPan(B, 1.08), 1, rx);
    });
    // upper: croissants on a board, the honey jar and its dipper
    B.at([-0.2, 0.864, 0.0], 0.08, () => {
      sbox(B, 0.4, 0.022, 0.24, 0.01, 0, 0, 0, (p, n, o) => o.set('#f0cc94').multiplyScalar(Math.abs(n.x) > 0.7 || Math.abs(n.z) > 0.7 ? 0.84 : 1));
      for (const [x, z, a] of [[-0.09, 0.045, 0.3], [0.08, 0.05, -0.4], [0.0, -0.06, 2.8]]) B.at([x, 0.022, z], a, () => croissant(B, 1.05));
    });
    B.at([0.2, 0.864, -0.02], 0.3, () => jamJar(B, '#f2a024', '#ffd24a', 1.3));
    B.at([0.34, 0.864, 0.07], 0.7, () => {
      pipe(B, [-0.08, 0.012, 0], [0.06, 0.012, 0], 0.0055, HONEY, { seg: 6 });
      const hd = G.lathe([[0.001, 0], [0.012, 0.002], [0.018, 0.008], [0.013, 0.014], [0.018, 0.02], [0.013, 0.026], [0.018, 0.032], [0.012, 0.038], [0.001, 0.04]], 8); hd.rotateZ(PI / 2); put(B, hd, 0.1, 0.018, 0, (p, n, o) => o.set('#e8b070').lerp(col('#f4a020'), clamp(-n.y) * 0.5));
    });
    // top: a chalk price sign on an A-frame and a round boule
    B.at([0.19, 1.224, 0.03], -0.22, () => {
      for (const s of [-1, 1]) for (const sz of [-1, 1]) pipe(B, [s * 0.085, 0, sz * 0.05], [s * 0.08, 0.165, sz * 0.004], 0.008, woodD, { seg: 5 });
      B.at([0, 0.09, 0.026], 0, () => {
        const fr = roundRect(0.2, 0.14, 0.018); fr.holes.push(roundRect(0.17, 0.11, 0.008, 0, 0, new THREE.Path()));
        put(B, extrude(fr, 0.01, 0.004, 4), 0, 0, -0.009, woodL);
        put(B, G.plane(0.172, 0.112), 0, 0, -0.002, (p, n, o) => o.set('#3c4c46').lerp(col('#4c5e56'), clamp(p.y / 0.06 + 0.5) * 0.4));
        const L = (g, c) => put(B, g, 0, 0, -0.0005, c), ch = '#f4f2e6';
        L(new THREE.RingGeometry(0.019, 0.024, 16).translate(-0.05, 0.008, 0), ch);
        L(stroke([[-0.066, 0.0], [-0.034, 0.016]], 0.003, 1), ch); L(stroke([[-0.062, 0.018], [-0.038, -0.004]], 0.003, 1), ch);
        L(stroke([[0.0, 0.026], [0.0, -0.022]], 0.0045, 1), ch);
        for (const x of [0.026, 0.058]) L(new THREE.RingGeometry(0.011, 0.0155, 14).translate(x, 0.002, 0).scale(1, 1.4, 1), ch);
        L(new THREE.ShapeGeometry(heartPath(0.026, 0.07, -0.038), 5), '#ff9eb8');
        L(stroke([[-0.075, -0.036], [-0.02, -0.04]], 0.003, 1), '#ffd24a');
      }, 1, -0.32);
    });
    B.at([-0.21, 1.224, 0.0], 0, () => {
      ball(B, 0.075, 0, 0.044, 0, (p, n, o) => o.set('#d48a44').lerp(col('#f2be72'), clamp(n.y) * 0.5).multiplyScalar(n.y < -0.2 ? 0.85 : 1), [1, 0.6, 1], 12);
      for (const ry of [0.4, 0.4 + PI / 2]) { const sc = G.sph(1, 6, 4); sc.scale(0.05, 0.006, 0.009); sc.rotateY(ry); put(B, sc, 0, 0.088, 0, '#f8dc9c'); }
    });
  },

  flourSacks(B) {
    // two plump cotton flour sacks (gathered necks tied with twine, a frilled top dusted with flour, blue printed bands
    // and a wheat stamp), the small one slumped against the big one; a wooden scoop of flour and a little spill
    const sack = (seed, mark) => {
      const base = [[0.001, 0], [0.118, 0], [0.148, 0.01], [0.166, 0.035], [0.176, 0.08], [0.178, 0.13], [0.174, 0.18], [0.163, 0.23], [0.144, 0.28], [0.118, 0.325], [0.09, 0.36], [0.066, 0.388], [0.055, 0.404], [0.052, 0.418], [0.058, 0.432], [0.074, 0.447], [0.09, 0.466], [0.099, 0.486], [0.094, 0.498], [0.082, 0.493], [0.06, 0.482], [0.001, 0.474]];
      const body = profR(base.slice(0, 13)), extra = [0.047, 0.052, 0.062, 0.072, 0.077, 0.253, 0.258, 0.266, 0.274, 0.279].map(y => [body(y), y]);
      const prof = [...base.slice(0, 13), ...extra].sort((a, b) => a[1] - b[1]).concat(base.slice(13)), BAND = y => (y > 0.0505 && y < 0.0735) || (y > 0.2565 && y < 0.2755);
      const k = (a, y) => 1 + (y > 0.33 ? Math.cos(a * 9 + seed) * 0.12 * clamp((y - 0.33) / 0.09) : (0.035 * Math.sin(a * 2 + seed) + 0.02 * Math.sin(a * 3 + seed * 2)) * Math.sin(PI * clamp(y / 0.33)));
      const g = weld(G.lathe(prof, 22)), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(x, z), f = k(a, y); p.setXYZ(i, x * f, y + (y > 0.44 ? 0.01 * Math.cos(a * 9 + seed) * clamp((y - 0.44) / 0.04) : 0), z * f); }
      g.computeVertexNormals();
      B.add(g, (q, n, o) => {
        const a = Math.atan2(q.x, q.z), pl = Math.cos(a * 9 + seed);
        o.set('#efdcb6').lerp(col('#f8eedc'), clamp(q.y / 0.4) * 0.6).multiplyScalar(0.88 + 0.12 * clamp(n.y + 0.6) + 0.03 * nz(q.x * 60, q.y * 60));
        if (q.y > 0.33) o.multiplyScalar(1 - 0.14 * clamp(-pl) * clamp((q.y - 0.33) / 0.06));
        if (q.y > 0.43) o.lerp(col('#fffcf4'), 0.7);
        if (BAND(q.y)) o.set('#6c8ad0').multiplyScalar(0.9 + 0.1 * clamp(n.y + 0.5));
      });
      // the printed wheat stamp, bent onto the (slumped) front
      const Rf = profR(base.slice(0, 11)), wrap = (geo, off = 0.0025) => { geo = geo.index ? geo.toNonIndexed() : geo; const q = geo.attributes.position, nn = new Float32Array(q.count * 3); for (let i = 0; i < q.count; i++) { const y = q.getY(i), r0 = Rf(y), a = q.getX(i) / r0, R = r0 * k(a, y) + off + q.getZ(i); q.setXYZ(i, R * Math.sin(a), y, R * Math.cos(a)); nn.set([Math.sin(a), 0, Math.cos(a)], i * 3); } geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); return geo; };
      if (mark) {
        const cy = 0.165, ink = '#c8603a', gold = '#c8903a';
        B.add(wrap(new THREE.RingGeometry(0.056, 0.064, 28, 1).translate(0, cy, 0)), ink);
        B.add(wrap(stroke([[0, cy - 0.045], [0.003, cy], [0, cy + 0.045]], 0.005, 1, 0, 0, 6)), gold);
        for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const e = ellD(0.0065, 0.013, 10, 2); e.rotateZ(s * 0.5); e.translate(s * 0.009, cy - 0.005 + i * 0.013, 0.0005); B.add(wrap(e), gold); }
        B.add(wrap(ellD(0.0065, 0.013, 10, 2).translate(0, cy + 0.05, 0.0005)), gold);
        for (const s of [-1, 1]) B.add(wrap(stroke([[0, cy - 0.03], [s * 0.016, cy - 0.022], [s * 0.026, cy - 0.006]], 0.004, 1, 0, 0, 5)), '#8aa860');
      }
      // twine tie and a bow
      { const t = G.torus(0.058, 0.0085, 5, 18); t.rotateX(PI / 2); put(B, t, 0, 0.414, 0, '#c89a5a'); }
      for (const s of [-1, 1]) { const l = G.torus(0.017, 0.005, 4, 10); l.rotateY(s * 0.5); l.rotateZ(s * 0.6); put(B, l, s * 0.018, 0.42, 0.064, '#d4a868'); curve(B, [[s * 0.006, 0.41, 0.064], [s * 0.012, 0.385, 0.07], [s * 0.022, 0.36, 0.068]], 0.0042, '#d4a868', { radial: 4, n: 4 }); }
      ball(B, 0.009, 0, 0.414, 0.064, '#c89a5a', 1, 6);
    };
    B.at([-0.065, 0, -0.06], 0.25, () => sack(0.7, true));
    B.at([0.135, 0, 0.095], -0.5, () => sack(2.3, true), 0.72, -0.06, 0.2);
    // the scoop and a little drift of spilled flour
    B.at([-0.15, 0.0, 0.165], 0.7, () => {
      B.at([0, 0.03, 0], 0, () => {
        lathe(B, [[0.001, -0.026], [0.03, -0.024], [0.046, -0.012], [0.052, 0.006], [0.054, 0.022], [0.049, 0.024], [0.046, 0.008], [0.04, -0.008], [0.026, -0.016], [0.001, -0.018]], 16, 0, 0, 0, (p, n, o) => o.set('#d8a06a').lerp(col('#f0c890'), clamp(n.y) * 0.4).multiplyScalar(0.92 + 0.05 * Math.sin(p.y * 300)));
        ball(B, 0.046, 0, 0.012, 0, (p, n, o) => o.set('#fffbf2').multiplyScalar(0.94 + 0.06 * clamp(n.y)), [1, 0.42, 1], 12);
        pipe(B, [0.048, 0.012, 0], [0.13, 0.03, 0], 0.012, '#c8905a', { r1: 0.014, seg: 8 }); ball(B, 0.016, 0.132, 0.03, 0, '#b8804a', 1, 8);
      }, 1, 0, -0.35);
    });
    B.add(pillowGeo(0.13, 0.014, 0.09, { sq: 1, edge: 0.5, bot: 0.1, ws: 14, hs: 5 }).translate(-0.1, 0, 0.215), '#fffaf0');
    ball(B, 0.01, -0.05, 0.003, 0.2, '#fffaf0', [1, 0.4, 1], 6); ball(B, 0.008, -0.03, 0.002, 0.23, '#fffaf0', [1, 0.4, 1], 6);
  },

  napPillow(B) {
    // a huge squashy panda floor pillow: a deep nap dent, a green piped seam, black ears on the back edge, a sleepy
    // embroidered face on the front, and a little gingham blanket thrown over the front-left corner
    const w = 0.94, h = 0.36, sq = 0.36, edge = 0.4, bot = 0.36, ht = h / (1 + bot), hb = h - ht;
    const dx = 0.06, dz = -0.05, q2 = (x, z) => (x - dx) ** 2 / 0.06 + (z - dz) ** 2 / 0.04;
    const deform = (x, z, f) => (-0.135 * Math.exp(-q2(x, z)) + 0.02 * Math.exp(-((q2(x, z) - 2.3) ** 2))) * f;
    const g = pillowGeo(w, h, w, { sq, edge, bot, ws: 34, hs: 14 }), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > hb) p.setY(i, y + deform(p.getX(i), p.getZ(i), (y - hb) / ht)); }
    g.computeVertexNormals();
    const cream = col('#fbf3e4'), shadow = col('#d8cab8');
    B.add(g, (q, n, o) => o.copy(cream).lerp(shadow, clamp(Math.exp(-q2(q.x, q.z) * 0.8) * 0.85 + clamp(-n.y) * 0.4)).multiplyScalar(0.93 + 0.08 * clamp(n.y) + 0.02 * nz(q.x * 20, q.z * 20)));
    const eOf = (x, z) => ((Math.abs(x) / (w / 2)) ** (2 / sq) + (Math.abs(z) / (w / 2)) ** (2 / sq)) ** (sq / 2);
    const surfY = (x, z) => { const e = Math.min(1, eOf(x, z)), y = pillowY(h, bot, edge, e); return y + deform(x, z, (y - hb) / ht); };
    // the piping round the seam
    const pip = []; for (let k = 0; k <= 56; k++) { const [x, z] = squircle(w, w, sq, k / 56 * TAU, 1.004); pip.push(V(x, hb, z)); }
    B.add(tube(pip.map(q => ({ p: q, r: 0.012 })), 5, false), (q, n, o) => o.set('#7cc07a').multiplyScalar(0.9 + 0.12 * clamp(n.y)));
    // ears
    for (const s of [-1, 1]) {
      const x = s * 0.27, z = -0.33, y = surfY(x, z);
      const ear = G.sph(1, 12, 8); ear.scale(0.085, 0.075, 0.042); ear.rotateX(0.25); put(B, ear, x, y + 0.035, z, (q, n, o) => o.set('#3a3438').lerp(col('#5a5258'), clamp(n.y) * 0.4));
      const inn = G.sph(1, 10, 6); inn.scale(0.045, 0.04, 0.012); inn.rotateX(0.25); put(B, inn, x, y + 0.038, z + 0.036, '#ffb6c8');
    }
    // the sleepy face on the front: droopy eye patches with closed eyes, a nose, blush
    const front = (x, y) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (pillowY(h, bot, edge, m) > y) lo = m; else hi = m; } const e = (lo + hi) / 2, c = clamp(Math.abs(x) / (e * w / 2)) ** (1 / sq); return V(x, y, (Math.sqrt(Math.max(0, 1 - c * c)) ** sq) * e * w / 2); };
    const onFront = (x, y, geo, c, out = 0.004) => { const P = front(x, y), N = front(x + 0.01, y).sub(front(x - 0.01, y)).cross(front(x, y + 0.01).sub(front(x, y - 0.01))).normalize(); if (N.z < 0) N.negate(); alignY(geo, N); B.add(geo.translate(P.x + N.x * out, P.y + N.y * out, P.z + N.z * out), c); };
    for (const s of [-1, 1]) {
      const fx = 0.07;
      const pt = G.sph(1, 12, 6); pt.scale(0.052, 0.008, 0.038); pt.rotateY(s * 0.55); onFront(fx + s * 0.095, 0.17, pt, '#3a3438', 0.002);
      const ey = G.torus(0.015, 0.0038, 3, 8, PI); ey.rotateZ(PI); ey.rotateX(-PI / 2); onFront(fx + s * 0.098, 0.172, ey, '#fffaf2', 0.008);
      const bl = G.sph(1, 8, 5); bl.scale(0.03, 0.005, 0.017); onFront(fx + s * 0.172, 0.135, bl, '#ffb0c0', 0.001);
    }
    { const ns = G.sph(1, 8, 5); ns.scale(0.024, 0.012, 0.015); onFront(0.07, 0.142, ns, '#3a3438', 0.004); }
    // the blanket over the front-left corner: on top it follows the pillow, over the edge it falls and pools
    const n = 16, S = 0.56, C = [-0.37, 0.27], ca = Math.cos(PI / 4), sa = Math.sin(PI / 4), pos = [], cl = [], cc = new THREE.Color();
    const place = (u, v) => {
      const x = C[0] + u * ca - v * sa, z = C[1] + u * sa + v * ca, e = eOf(x, z), rl = Math.hypot(x, z) || 1;
      if (e <= 0.96) return V(x, surfY(x, z) + 0.014, z);
      const k = 0.96 / e, ox = x * k, oz = z * k, drop = (e - 0.96) * rl / e, y0 = surfY(ox, oz) + 0.014, out = 0.03 + 0.03 * clamp(drop / 0.04);
      let y = y0 - drop, extra = 0; if (y < 0.006) { extra = 0.006 - y; y = 0.006; }
      return V(ox + x / rl * (out + extra), y, oz + z / rl * (out + extra));
    };
    const G2 = []; for (let j = 0; j <= n; j++) { const row = []; for (let i = 0; i <= n; i++) row.push(place((i / n - 0.5) * S, (j / n - 0.5) * S)); G2.push(row); }
    const tone = (i, j) => (i === 0 || j === 0 || i === n - 1 || j === n - 1) ? '#5aa86a' : (((i % 2) + (j % 2)) === 2 ? '#6ab87a' : (i + j) % 2 ? '#b4e0b0' : '#fff8ec');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = G2[j][i], b = G2[j][i + 1], c = G2[j + 1][i], dd = G2[j + 1][i + 1];
      upTri(pos, a, c, b); upTri(pos, b, c, dd);
      cc.set(tone(i, j)); for (let k = 0; k < 6; k++) cl.push(cc.r, cc.g, cc.b);
    }
    const bg = geoOf(pos); bg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    B.add(twoSided(bg), null);
  },

  plantStand(B) {
    // Usagi's three-step ladder stand: a bushy basil and a pot of flowering chives below, a strawberry plant with berries
    // hanging over its rim in the middle, a tiny flowering cactus and a seedling with a carrot marker on top; a mint
    // watering can tucked underneath
    const wood = '#e4b07a', woodD = '#b47a48', zb = -0.19, zf0 = 0.21, zf1 = -0.07, Ht = 1.0, zf = y => zf0 + (zf1 - zf0) * y / Ht;
    for (const sx of [-1, 1]) {
      B.add(rbar([sx * 0.215, 0, zb], [sx * 0.215, Ht, zb], 0.048, 0.048, 0.012), woodD);
      B.add(rbar([sx * 0.215, 0, zf0], [sx * 0.215, Ht - 0.02, zf1], 0.048, 0.042, 0.012), woodD);
      B.add(rbar([sx * 0.215, Ht - 0.025, zf1 + 0.01], [sx * 0.215, Ht - 0.025, zb], 0.04, 0.04, 0.01), woodD);
      ball(B, 0.032, sx * 0.215, Ht + 0.012, zb, wood, 1, 8);
      for (const z of [zb, zf0]) put(B, G.beam(0.062, 0.02, 0.06, 0.006), sx * 0.215, 0.01, z, '#8a5a3a');
    }
    const tiers = [0.28, 0.58, 0.88].map(y => {
      const f = zf(y) + 0.008, d = f - zb + 0.03, c = (f + zb) / 2;
      put(B, G.beam(0.47, 0.026, d, 0.008), 0, y + 0.013, c, (p, n, o) => o.set(wood).multiplyScalar(Math.abs(n.z) > 0.7 || Math.abs(n.x) > 0.7 ? 0.84 : 1.02));
      for (const sx of [-1, 1]) put(B, G.beam(0.03, 0.03, d - 0.02, 0.008), sx * 0.2, y - 0.015, c, woodD);
      return [y + 0.026, c, f];
    });
    const greens = ['#4f9a44', '#5aae4a', '#68b850'];
    // tier 1: basil and chives
    { const [y, c] = tiers[0];
      B.at([-0.095, y, c + 0.035], 0, () => {
        const sy = clayPot(B, 0.08, 0.11, { c: '#d8845a', band: '#fff1de', dot: '#8fd0a0', seg: 12, dots: 4 });
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * TAU + B.wob(0.3), r0 = 0.03, tp = [Math.sin(a) * (r0 + 0.035), sy + B.rand(0.11, 0.15), Math.cos(a) * (r0 + 0.035)];
          const st = [[Math.sin(a) * r0 * 0.4, sy, Math.cos(a) * r0 * 0.4], [tp[0] * 0.6, sy + (tp[1] - sy) * 0.55, tp[2] * 0.6], tp];
          curve(B, st, 0.0045, '#5a9a3a', { radial: 3, n: 4, k: 'leaf' });
          const C3 = new THREE.CatmullRomCurve3(st.map(q => V(...q)));
          for (const [f, L, m, el] of [[0.42, 0.07, 2, 0.2], [0.72, 0.062, 2, 0.45], [1, 0.048, 3, 0.95]]) {
            const q = C3.getPoint(f);
            for (let j = 0; j < m; j++) {
              const lf = ovalLeafGeo(L, L * 0.68, 0.38, 0.18, true), c0 = col(B.pick(greens)), c1 = c0.clone().lerp(col('#b8e888'), 0.45);
              paint(lf, (pp, nn, o) => o.copy(c0).lerp(c1, clamp(pp.z / L)).multiplyScalar(0.88 + 0.16 * clamp(nn.y)));
              lf.rotateX(-el); lf.rotateY(a + f * 2.2 + j * TAU / m); lf.translate(q.x, q.y, q.z); B.add(lf, null, 'leaf');
            }
          }
        }
      });
      B.at([0.115, y, c + 0.02], 0, () => {
        const sy = clayPot(B, 0.058, 0.09, { c: '#e8a070', band: '#ffe8f0', dot: '#c8a0e8', seg: 12, dots: 4 });
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, g2 = bladeGeo(B.rand(0.12, 0.17), 0.013, { bend: B.rand(0.1, 0.45), seg: 3, fold: 0.1, base: 0.8 }); g2.rotateY(a); g2.translate(Math.sin(a) * 0.012, sy, Math.cos(a) * 0.012); B.add(g2, (pp, nn, o) => o.set('#4f9a44').lerp(col('#9ad870'), clamp((pp.y - sy) / 0.15) * 0.6), 'leaf'); }
        for (const [x, z, hh] of [[0.01, 0.0, 0.2], [-0.015, 0.01, 0.17]]) {
          pipe(B, [x, sy, z], [x * 2, sy + hh, z * 2], 0.003, '#5a9a3a', { k: 'leaf' });
          const fl = G.ico(0.019, 1), qq = fl.attributes.position; for (let i = 0; i < qq.count; i++) { const kk = 1 + 0.18 * Math.sin(qq.getX(i) * 1300 + qq.getY(i) * 710 + qq.getZ(i) * 523) ** 2; qq.setXYZ(i, qq.getX(i) * kk, qq.getY(i) * kk, qq.getZ(i) * kk); }
          fl.computeVertexNormals(); put(B, fl, x * 2, sy + hh + 0.014, z * 2, (pp, nn, o) => o.set('#c890e8').lerp(col('#f0d8ff'), clamp(nn.y) * 0.4), 'leaf');
        }
      }, 1.08);
    }
    // tier 2: the strawberry plant, berries hanging over the pot's rim
    { const [y, c] = tiers[1];
      B.at([0.0, y, c + 0.02], 0, () => {
        const pr = 0.074, ph = 0.1, sy = clayPot(B, pr, ph, { c: '#e88a72', band: '#fff1de', dot: '#ff6f7f', seg: 12, dots: 4 });
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU + 0.8, len = B.rand(0.075, 0.1), tp = [Math.sin(a) * len, sy + B.rand(0.07, 0.1), Math.cos(a) * len];
          curve(B, [[0, sy, 0], [tp[0] * 0.4, tp[1] + 0.012, tp[2] * 0.4], tp], 0.003, '#6aa84a', { radial: 3, n: 4, k: 'leaf' });
          for (let j = -1; j <= 1; j++) { const lf = ovalLeafGeo(0.058, 0.042, 0.22, 0.05, true); paint(lf, (pp, nn, o) => o.set('#4a9a40').lerp(col('#8cc860'), clamp(pp.z / 0.058) * 0.45).multiplyScalar(0.88 + 0.16 * clamp(nn.y))); lf.rotateX(-0.25 + Math.abs(j) * 0.15); lf.rotateY(a + j * 0.8); lf.translate(...tp); B.add(lf, null, 'leaf'); }
        }
        const berry = (x, yb, z, ripe) => {
          const bg2 = G.lathe([[0.001, -0.034], [0.009, -0.03], [0.017, -0.018], [0.02, -0.005], [0.017, 0.004], [0.008, 0.009], [0.001, 0.01]], 8);
          B.add(faceColors(bg2, (pp, nn, o, cc2) => { o.set(ripe ? '#e8343a' : '#e8f0b0').lerp(col(ripe ? '#ff6a5a' : '#ffffff'), clamp(nn.y) * 0.3); if ((Math.floor(cc2.y * 220) + Math.floor(Math.atan2(cc2.x, cc2.z) * 4)) % 3 === 0) o.lerp(col('#ffe080'), 0.55); }).translate(x, yb, z), null);
          put(B, blossomGeo(0.016, 5, 0.3, true), x, yb + 0.011, z, '#4f9a44');
        };
        for (const [a, ripe, drop] of [[0.35, true, 0.045], [-0.25, true, 0.03], [0.95, false, 0.055], [-0.85, true, 0.04]]) {
          const S = Math.sin(a), C = Math.cos(a), e = [S * pr * 1.3, ph - drop, C * pr * 1.3];
          curve(B, [[S * 0.02, sy + 0.015, C * 0.02], [S * pr * 0.8, ph + 0.03, C * pr * 0.8], [S * pr * 1.16, ph + 0.012, C * pr * 1.16], [e[0], e[1] + 0.036, e[2]]], 0.0026, '#6aa84a', { radial: 3, n: 6, k: 'leaf' });
          berry(e[0], e[1], e[2], ripe);
        }
        for (const [x, z] of [[0.05, -0.035], [-0.045, -0.04]]) { put(B, blossomGeo(0.021, 5, 0.55), x, sy + 0.085, z, '#fffaf2', 'leaf'); ball(B, 0.0065, x, sy + 0.087, z, '#ffd24a', 1, 5, 'leaf'); }
      }, 1.12);
    }
    // tier 3: the tiny cactus and a seedling with a carrot marker
    { const [y, c] = tiers[2];
      B.at([-0.08, y, c], 0, () => {
        const sy = clayPot(B, 0.052, 0.075, { c: '#ffb0c8', band: '#fff6ea', dot: '#ff7aa0', seg: 12, dots: 4 });
        const cp = [[0.001, 0], [0.038, 0.004], [0.048, 0.026], [0.049, 0.052], [0.042, 0.075], [0.025, 0.09], [0.001, 0.094]];
        const cg = weld(G.lathe(cp, 20)), q = cg.attributes.position;
        for (let i = 0; i < q.count; i++) { const kk = 1 + 0.09 * Math.cos(8 * Math.atan2(q.getX(i), q.getZ(i))) * Math.sin(PI * clamp(q.getY(i) / 0.094)); q.setX(i, q.getX(i) * kk); q.setZ(i, q.getZ(i) * kk); }
        cg.computeVertexNormals(); cg.translate(0, sy - 0.004, 0);
        B.add(cg, (pp, nn, o) => { const rb = Math.cos(8 * Math.atan2(pp.x, pp.z)); o.set('#4f9a50').lerp(col('#8ccf78'), clamp(rb * 0.5 + 0.5) * 0.6 + clamp(nn.y) * 0.2); });
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, yy = k % 2 ? 0.032 : 0.058, rr = profR(cp)(yy) * 1.09, sp = G.ico(0.0045, 0); put(B, sp, Math.sin(a) * rr, sy - 0.004 + yy, Math.cos(a) * rr, '#fffaf2'); }
        for (const [s, r, cl0] of [[0, 0.028, '#ff7aa8'], [0.4, 0.019, '#ffb0cc']]) { const fl = blossomGeo(r, 6, 0.45); fl.rotateY(s); put(B, fl, 0, sy + 0.092 + s * 0.008, 0, cl0, 'leaf'); }
        ball(B, 0.0065, 0, sy + 0.098, 0, '#ffd24a', 1, 5, 'leaf');
      }, 1.1);
      B.at([0.1, y, c + 0.01], 0, () => {
        const sy = clayPot(B, 0.042, 0.065, { c: '#a8d8f0', band: '#fffaf2', dot: '#6ab8f0', seg: 12, dots: 4 });
        pipe(B, [0, sy, 0], [0.002, sy + 0.04, 0], 0.003, '#8ac860', { k: 'leaf' });
        for (const s of [-1, 1]) { const lf = ovalLeafGeo(0.032, 0.024, 0.3, 0.2, true); lf.rotateX(-0.5); lf.rotateY(s * PI / 2); lf.translate(0.002, sy + 0.04, 0); B.add(lf, (pp, nn, o) => o.set('#7cc05a').lerp(col('#b8e888'), clamp(pp.y - sy) * 10), 'leaf'); }
        pipe(B, [-0.022, sy - 0.01, 0.012], [-0.03, sy + 0.07, 0.016], 0.0035, '#e8c890');
        B.at([-0.031, sy + 0.08, 0.017], 0, () => { const ct = G.cone(0.012, 0.04, 8); ct.rotateZ(PI); B.add(ct, '#ff8a3a'); for (const s of [-1, 0, 1]) { const lf = G.cone(0.004, 0.018, 5); lf.rotateZ(s * 0.4); lf.translate(s * 0.004, 0.027, 0); B.add(lf, '#5aae4a'); } });
      }, 1.1);
    }
    // a mint watering can under the bottom step
    B.at([0.06, 0, 0.0], -0.5, () => {
      lathe(B, [[0.001, 0], [0.055, 0], [0.06, 0.008], [0.06, 0.09], [0.052, 0.105], [0.03, 0.112], [0.001, 0.113]], 12, 0, 0, 0, (p, n, o) => o.set('#8fd8c0').lerp(col('#d8fff0'), clamp(n.y) * 0.4 + clamp(n.x * 0.6 + n.z * 0.4) * 0.2));
      curve(B, [[0.05, 0.03, 0], [0.09, 0.07, 0], [0.12, 0.11, 0]], t => 0.012 - t * 0.005, '#8fd8c0', { radial: 6, n: 5, cap: false });
      const rose = G.cone(0.016, 0.022, 8); rose.rotateZ(-PI / 4); put(B, rose, 0.128, 0.118, 0, '#7cc8b0');
      const hd = G.torus(0.04, 0.008, 5, 12, PI); hd.rotateY(PI / 2); hd.rotateX(-0.3); put(B, hd, -0.02, 0.1, 0, '#7cc8b0');
      ball(B, 0.012, 0, 0.115, 0, '#fffaf2', 1, 6);
    });
  },

  curioCabinet(B) {
    // Tanu's curio cabinet: a teal-painted case on turned bun legs, a drawer base with brass pulls, a rose velvet back,
    // glass doors (frames + glints), a cornice and a gold leaf crest; behind the glass: a geode, a stack of mon coins and
    // a seashell; a ship in a bottle and a teacup; a tiny janome umbrella and an hourglass
    const W = 0.96, D = 0.4, body = '#3f6e6a', bodyL = '#56887f', bodyD = '#2f5652', trim = '#e8b84a', shelfC = '#f2e2cc';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lathe(B, [[0.001, 0], [0.03, 0], [0.042, 0.016], [0.044, 0.04], [0.034, 0.066], [0.03, 0.088], [0.04, 0.098], [0.001, 0.1]], 8, sx * 0.42, 0, sz * 0.15, (p, n, o) => o.set(bodyD).lerp(col(bodyL), clamp(n.y) * 0.4));
    sbox(B, W, 0.2, D, 0.03, 0, 0.09, 0, body);
    for (const sx of [-1, 1]) {
      put(B, G.beam(0.43, 0.13, 0.018, 0.006), sx * 0.235, 0.19, D / 2 + 0.006, bodyL);
      const pl = G.torus(0.03, 0.006, 4, 10, PI); pl.rotateZ(PI); put(B, pl, sx * 0.235, 0.205, D / 2 + 0.022, trim);
      for (const s of [-1, 1]) ball(B, 0.009, sx * 0.235 + s * 0.03, 0.205, D / 2 + 0.02, trim, 1, 5);
    }
    const y0 = 0.29, y1 = 1.37;
    for (const sx of [-1, 1]) sbox(B, 0.04, y1 - y0, D - 0.02, 0.012, sx * (W / 2 - 0.02), y0, -0.01, body);
    for (const sx of [-1, 1]) { put(B, G.beam(0.012, 0.86, 0.28, 0.004), sx * (W / 2 + 0.002), 0.83, -0.01, bodyL); put(B, G.beam(0.004, 0.84, 0.006, 0.001), sx * (W / 2 + 0.009), 0.83, 0.125, trim); put(B, G.beam(0.004, 0.84, 0.006, 0.001), sx * (W / 2 + 0.009), 0.83, -0.145, trim); }
    const bk = G.plane(W - 0.06, y1 - y0, 22, 1); bk.translate(0, (y0 + y1) / 2, -D / 2 + 0.022);
    B.add(faceColors(bk, (p, n, o, c) => o.set(Math.floor((c.x + 0.5) / 0.0409) % 2 ? '#d8a0a6' : '#e4b4b6').multiplyScalar(0.86 + 0.14 * clamp((c.y - y0) / 0.6))), null);
    box(B, W - 0.04, y1 - y0, 0.02, 0, 0, y0, -D / 2 + 0.01, bodyD);
    sbox(B, W - 0.06, 0.02, D - 0.04, 0.006, 0, y0, -0.01, shelfC);
    for (const y of [0.62, 0.95]) { put(B, G.beam(W - 0.07, 0.022, D - 0.06, 0.006), 0, y + 0.011, -0.015, shelfC); box(B, W - 0.07, 0.008, 0.006, 0, 0, y + 0.007, D / 2 - 0.044, trim); }
    sbox(B, W + 0.03, 0.045, D + 0.03, 0.016, 0, y1, 0, body);
    { const m = new THREE.CapsuleGeometry(0.016, W - 0.02, 3, 8); m.rotateZ(PI / 2); put(B, m, 0, y1 + 0.045, D / 2 - 0.004, bodyL); }
    // the crest: an arched pediment with a gold tanuki leaf
    const pd = new THREE.Shape(); pd.moveTo(-0.26, 0); pd.lineTo(0.26, 0); pd.quadraticCurveTo(0.2, 0.02, 0.12, 0.05); pd.quadraticCurveTo(0, 0.11, -0.12, 0.05); pd.quadraticCurveTo(-0.2, 0.02, -0.26, 0);
    put(B, extrude(pd, 0.03, 0.008, 8), 0, y1 + 0.045, D / 2 - 0.08, body);
    B.at([0, y1 + 0.105, D / 2 - 0.036], 0, () => {
      const lf = new THREE.Shape(); lf.moveTo(0, -0.045); lf.quadraticCurveTo(0.05, -0.01, 0.006, 0.05); lf.quadraticCurveTo(0, 0.04, -0.006, 0.05); lf.quadraticCurveTo(-0.05, -0.01, 0, -0.045);
      put(B, extrude(lf, 0.006, 0.004, 6), 0, 0, 0, (p, n, o) => o.set(trim).lerp(col('#fff0b0'), clamp(n.z) * 0.4));
      put(B, ribbon([[0, -0.04], [0, 0.035]], 0.004), 0, 0, 0.0152, '#b88a2a');
    });
    // the oddities, shelf by shelf
    const s0 = y0 + 0.02, s1 = 0.642, s2 = 0.972;
    // geode on a little stand
    B.at([-0.265, s0, -0.03], 0.35, () => {
      put(B, G.beam(0.12, 0.022, 0.08, 0.006), 0, 0.011, 0, '#8a5a3a');
      B.at([0, 0.104, 0], 0, () => {
        const sh = new THREE.SphereGeometry(0.066, 12, 6, 0, TAU, 0, PI / 2); sh.rotateX(-PI / 2); const q = sh.attributes.position;
        for (let i = 0; i < q.count; i++) { const kk = 1 + 0.08 * nz(q.getX(i) * 40, q.getY(i) * 40 + q.getZ(i) * 30); q.setXYZ(i, q.getX(i) * kk, q.getY(i) * kk, q.getZ(i) * kk); }
        sh.computeVertexNormals(); B.add(sh, (p, n, o) => o.set('#8a7a72').lerp(col('#b4a69c'), clamp(nz(p.x * 50, p.y * 50) * 0.5 + 0.5)));
        put(B, new THREE.RingGeometry(0.05, 0.068, 20, 1), 0, 0, 0.001, '#f2eaf6');
        put(B, G.disc(0.051, 20), 0, 0, -0.01, '#4a2a6a');
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, rr = 0.036 + 0.01 * (k % 2), cn = G.cone(0.009, 0.024, 5); alignY(cn, V(-Math.cos(a) * 0.7, -Math.sin(a) * 0.7, 1)); put(B, cn, Math.cos(a) * rr, Math.sin(a) * rr, -0.004, (p, n, o) => o.set('#9a68d0').lerp(col('#ead8ff'), clamp(p.z / 0.02 + 0.3))); }
        for (const [x, y] of [[0.0, 0.004], [0.012, -0.012], [-0.012, -0.008]]) { const cn = G.cone(0.008, 0.022, 5); alignY(cn, V(x * 8, y * 8, 1)); put(B, cn, x, y, -0.006, '#b88ae0'); }
      }, 1.25, -0.25);
    });
    // a stack of mon coins and one on its edge
    B.at([0.0, s0, 0.0], 0, () => {
      for (let i = 0; i < 5; i++) { const g = G.cyl(0.032, 0.032, 0.0085, 12); g.translate(B.wob(0.004), 0.0045 + i * 0.0088, B.wob(0.004)); B.add(g, (p, n, o) => o.set(n.y > 0.5 ? '#f4c84a' : '#c89a30')); }
      put(B, G.plane(0.013, 0.013).rotateX(-PI / 2), 0, 0.0444, 0, '#7a5a2a');
      B.at([0.06, 0.033, 0.03], -0.5, () => { const g = G.cyl(0.032, 0.032, 0.0085, 12); g.rotateX(PI / 2 - 0.15); B.add(g, (p, n, o) => o.set(Math.abs(n.z) > 0.5 ? '#f4c84a' : '#c89a30')); const sqh = G.plane(0.013, 0.013); sqh.rotateX(-0.15); put(B, sqh, 0, 0, 0.0047, '#7a5a2a'); });
    });
    // a pink scallop shell on a stand
    B.at([0.27, s0, -0.03], -0.3, () => {
      put(B, G.beam(0.1, 0.02, 0.06, 0.006), 0, 0.01, 0, '#8a5a3a');
      B.at([0, 0.02, 0], 0, () => { const [fr, bkk] = scallopGeo(0.1, 1.05, { na: 16, ns: 4, bulge: 0.035 }); const sp = (p, n, o) => { const a = Math.atan2(p.x, p.y), rib = Math.cos(a * 14) ** 2; o.set('#ff9eb8').lerp(col('#ffe2ec'), 0.5 * rib); }; B.add(fr, sp); B.add(bkk, sp); }, 1, -0.2);
    });
    // a ship in a bottle on a cradle
    B.at([-0.16, s1, -0.02], 0.12, () => {
      for (const x of [-0.09, 0.09]) put(B, G.beam(0.04, 0.034, 0.08, 0.006), x, 0.017, 0, '#8a5a3a');
      B.at([-0.155, 0.078, 0], 0, () => {
        const bp = [[0.001, 0], [0.042, 0], [0.048, 0.008], [0.05, 0.03], [0.05, 0.2], [0.045, 0.225], [0.026, 0.25], [0.018, 0.27], [0.018, 0.296], [0.021, 0.3], [0.016, 0.306], [0.001, 0.304]];
        lathe(B, bp, 14, 0, 0, 0, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.set('#cceeea').lerp(col('#ffffff'), Math.abs(a + 0.75) < 0.16 ? 0.7 : clamp(-n.x) * 0.15); });
        cyl(B, 0.0165, 0.015, 0.03, 10, 0, 0.29, 0, '#c8a070');
        const Rf = profR(bp.slice(0, 6)), D2 = pts => pts.map(([u, v]) => new THREE.Vector2(-v, u)), sh = pts => new THREE.ShapeGeometry(new THREE.Shape(D2(pts)), 4);
        const W2 = (g, c, k) => B.add(wrapLathe(g, Rf, 0, 0.0015 + k * 0.0006), c);
        const sea = [[0.03, -0.046]]; for (let i = 0; i <= 10; i++) { const u = 0.03 + i / 10 * 0.17; sea.push([u, -0.026 + 0.004 * Math.sin(i * 1.9)]); } sea.push([0.2, -0.046]);
        W2(sh(sea), '#5a9ad8', 0);
        W2(sh([[0.066, -0.009], [0.166, -0.009], [0.152, -0.028], [0.08, -0.028]]), '#8a4a2a', 1);
        for (const u of [0.098, 0.132]) W2(stroke([[0, u], [-0.044, u]], 0.003, 1), '#5a3a2a', 1);
        W2(sh([[0.083, -0.002], [0.112, -0.002], [0.11, 0.038], [0.086, 0.038]]), '#fffaf2', 2);
        W2(sh([[0.118, 0.0], [0.146, 0.0], [0.144, 0.03], [0.12, 0.03]]), '#fffaf2', 2);
        W2(sh([[0.15, -0.006], [0.172, -0.007], [0.136, 0.033]]), '#f4ece0', 2);
        W2(sh([[0.098, 0.044], [0.098, 0.054], [0.084, 0.049]]), '#e8403a', 2);
      }, 1.12, 0, -PI / 2);
    });
    // a teacup on its saucer
    B.at([0.25, s1, 0.0], -0.5, () => {
      lathe(B, [[0.001, 0], [0.03, 0], [0.034, 0.004], [0.06, 0.012], [0.064, 0.016], [0.058, 0.016], [0.03, 0.01], [0.001, 0.01]], 14, 0, 0, 0, (p, n, o) => o.set(Math.hypot(p.x, p.z) > 0.056 ? '#6a9ad8' : '#fffaf4'));
      const cp = [[0.001, 0.01], [0.022, 0.01], [0.026, 0.014], [0.038, 0.04], [0.044, 0.062], [0.046, 0.066], [0.041, 0.066], [0.038, 0.044], [0.024, 0.02], [0.001, 0.018]];
      lathe(B, cp, 14, 0, 0, 0, (p, n, o) => { const outer = n.x * p.x + n.z * p.z > 0; o.set(p.y > 0.062 ? trim : outer && p.y > 0.044 && p.y < 0.054 ? '#6a9ad8' : '#fffaf4'); if (!outer && p.y < 0.03) o.set('#c8905a'); });
      const h = G.torus(0.016, 0.005, 4, 10, PI * 1.3); h.rotateZ(-PI * 0.65); put(B, h, 0.046, 0.042, 0, '#fffaf4');
      for (const a of [0.2, 1.4, -1.0]) { const f = blossomGeo(0.009, 5, 0.45); f.rotateX(PI / 2); f.translate(0, 0.034, 0); B.add(wrapLathe(f, profR(cp.slice(0, 6)), a), '#ff9eb8'); }
    }, 1.3);
    // a tiny janome umbrella leaning in the top compartment
    B.at([-0.2, s2, -0.03], 0.25, () => {
      pipe(B, [0, 0, 0], [0, 0.25, 0], 0.0055, '#d8b878', { seg: 6 });
      const up = [[0.118, 0.196], [0.095, 0.218], [0.065, 0.24], [0.03, 0.256], [0.001, 0.262]];
      const cg = weld(G.lathe(up, 24)), q = cg.attributes.position;
      for (let i = 0; i < q.count; i++) { const r = Math.hypot(q.getX(i), q.getZ(i)), a = Math.atan2(q.getX(i), q.getZ(i)); q.setY(i, q.getY(i) - 0.012 * (1 - Math.abs(Math.cos(6 * a))) * (r / 0.118) ** 2); }
      cg.computeVertexNormals();
      B.add(cg, (p, n, o) => { const r = Math.hypot(p.x, p.z); o.set(r > 0.055 && r < 0.072 ? '#fff4ea' : '#e04a3a').multiplyScalar(0.92 + 0.08 * clamp(n.y)); });
      const under = cg.clone(); under.scale(0.985, 1, 0.985); under.translate(0, -0.003, 0); const ui = under.index.array; for (let i = 0; i < ui.length; i += 3) { const t = ui[i + 1]; ui[i + 1] = ui[i + 2]; ui[i + 2] = t; } under.computeVertexNormals();
      B.add(under, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.set(Math.abs(Math.sin(6 * a)) < 0.12 ? '#8a5a3a' : '#f6d8b0'); });
      ball(B, 0.012, 0, 0.266, 0, INK, [1, 0.8, 1], 8);
      ball(B, 0.009, 0, 0.004, 0, '#8a5a3a', 1, 6);
    }, 1.12, 0.12, 0.38);
    // an hourglass
    B.at([0.22, s2, -0.02], 0.3, () => {
      for (const y of [0, 0.168]) lathe(B, [[0.001, 0], [0.048, 0], [0.052, 0.006], [0.048, 0.014], [0.001, 0.014]], 10, 0, y, 0, '#8a5a3a');
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.5; cyl(B, 0.0055, 0.0055, 0.156, 6, Math.sin(a) * 0.04, 0.012, Math.cos(a) * 0.04, '#a8703e'); }
      const gp = [[0.001, 0.014], [0.028, 0.016], [0.034, 0.038], [0.028, 0.066], [0.007, 0.091], [0.028, 0.116], [0.034, 0.144], [0.028, 0.166], [0.001, 0.168]];
      lathe(B, gp, 12, 0, 0, 0, (p, n, o) => { o.set((p.y < 0.044) || (p.y > 0.094 && p.y < 0.106) ? '#f2c878' : '#d4f0f0'); if (Math.abs(Math.atan2(p.x, p.z) - 0.8) < 0.2) o.lerp(col('#ffffff'), 0.55); });
    }, 1.15);
    // the glass doors: chunky frames with brass knobs, a keyhole, and glints on the glass
    const dz = D / 2 + 0.008, dh = y1 - y0 - 0.02;
    for (const sx of [-1, 1]) {
      const cx = sx * 0.232, dw = 0.446;
      for (const yy of [y0 + 0.01, y0 + 0.01 + dh - 0.04]) put(B, G.beam(dw, 0.04, 0.024, 0.008), cx, yy + 0.02, dz, bodyL);
      for (const xx of [-1, 1]) put(B, G.beam(0.04, dh, 0.024, 0.008), cx + xx * (dw / 2 - 0.02), y0 + 0.01 + dh / 2, dz, bodyL);
      for (const [x0, yA, L, wd] of [[-0.17, 1.16, 0.11, 0.007], [-0.15, 1.2, 0.05, 0.005]]) put(B, ribbon([[cx + x0, yA], [cx + x0 + L * 0.55, yA + L]], wd), 0, 0, dz - 0.004, '#e4f2f6');
      ball(B, 0.014, sx * 0.03, 0.81, dz + 0.016, trim, 1, 7);
    }
    sbox(B, 0.022, 0.034, 0.004, 0.002, 0.03, 0.75, dz + 0.012, trim); put(B, G.disc(0.004, 8), 0.03, 0.758, dz + 0.0145, INK);
  },
};

export const BUILDERS = { ...BASICS, ...TEA, ...BAMBOO, ...MAPLE, ...TIDE, ...ONSEN, ...FESTIVAL, ...PHASE2 };

// the shared pieces, for the other model files (furnitureModels2.js)
export const KIT = {
  INK, GOLD, CREAM, PAPER, IRON, BLACK_LAC, LAC_RED, HONEY, WOOD, WOOD_D, WOOD_R, SAKURA, MINT, SKY, BUTTER, PEACH,
  put, box, rbox, sbox, cyl, ball, lathe, pipe, curve, alignY, flat, ell, ellD, mergeG, twoSided, geoOf, triP, pillowY, pillowGeo, squircle,
  softSheet, tileGeo, ribbon, spline2, profR, wrapLathe, onProfile, frondGeo, bladeGeo, fatLeafGeo, heartPath, roundRect, archShape, extrude,
  clipGeoX, tomoeGeo, stroke, quadPaint, tone, decal, symbolUp, cushion, bookFlat, bookStand, jamJar, heartLeafGeo, tulipHead, toadstool,
  pineCone, irisFlower, needlePad, bambooPole, goldfish, scallopGeo,
  sstep, weld, rbar, twistCord, ceilingRose, mapleR, mapleFat, feltSlab, upTri, stitchRun, bambooStalkGeo, strapLeafGeo, bambooSpray,
  ovalLeafGeo, shavingGeo, clayPot, fuzz, melonPan, croissant, loaf, wicker,
};
