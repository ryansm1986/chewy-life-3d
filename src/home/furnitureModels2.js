// Furniture models, part two (docs/HOUSING.md §3-4, phase 2): the villagers' own pieces and the finds. Same contract
// as furnitureModels.js (local frame, buckets, vertex colours); the shared helpers come from there as KIT.
//  - The figures (the inari fox, the tanuki, the lucky cat, the panda plush, the fountain frog) are sculpted as signed
//    distance fields and meshed with surface nets (src/gfx/sdf.js), so their parts melt into one smooth form. Faces,
//    bibs and collars are then laid onto that surface (drape / dot / ringPts below). Built once per id, cached by
//    furnitureMesh.js.
import * as THREE from 'three';
import { G, V, PI, shade, mixc, col } from '../world/buildings/kit.js';
import { KIT } from './furnitureModels.js';
import { tube, paint } from '../gfx/geom.js';
import { blossomGeo, nz, mossStone } from '../world/buildings/props.js';
import { bow } from '../world/buildings/props2.js';
import * as SDF from '../gfx/sdf.js';
import { clamp, TAU } from '../core/util.js';

const {
  put, box, sbox, cyl, ball, lathe, pipe, curve, alignY, ell, ellD, mergeG, twoSided, geoOf, triP, ribbon, profR, wrapLathe, bladeGeo,
  frondGeo, roundRect, extrude, stroke, quadPaint, cushion, bambooPole, decal, tomoeGeo, INK, GOLD, IRON, BLACK_LAC,
} = KIT;
const UP = V(0, 1, 0);

// ------------------------------------------------------------------ painters
/** carved / weathered stone: lighter where it faces up, a cool shade underneath, two scales of soft mottling */
function stoneP(base, { hi = '#f6f0e8', lo = '#8e8698', sc = 10, amt = 0.07 } = {}) {
  const b = col(base), H = col(hi), L = col(lo);
  return (p, n, o) => {
    o.copy(b).lerp(H, clamp(n.y * 0.55 + 0.05) * 0.45).lerp(L, clamp(-n.y - 0.15) * 0.4);
    o.multiplyScalar(1 + amt * nz(p.x * sc + p.y * 3.1, p.z * sc - p.y * 2.7) + amt * 0.5 * nz(p.x * sc * 5 + 11, p.y * sc * 5 - p.z * sc * 3));
  };
}
/** planed wood: soft grain lines across `along`, a little top light */
function grainP(c, { along = 'x', f = 70, amt = 0.045 } = {}) {
  const C0 = col(c);
  return (p, n, o) => {
    const u = along === 'x' ? p.x : along === 'y' ? p.y : p.z, v = along === 'x' ? p.y * 0.6 + p.z : along === 'y' ? p.x + p.z * 0.6 : p.x + p.y * 0.6;
    o.copy(C0).multiplyScalar(1 + amt * Math.sin(v * f + Math.sin(u * 11) * 1.8 + nz(u * 6, v * 6) * 1.5)).multiplyScalar(0.93 + 0.09 * clamp(n.y * 0.5 + 0.5));
  };
}
/** soft fabric / plush: a gentle top light and a fine fuzz mottle */
function fuzzP(c, amt = 0.04) {
  const C0 = col(c);
  return (p, n, o) => o.copy(C0).multiplyScalar(0.9 + 0.12 * clamp(n.y * 0.6 + 0.45) + amt * nz(p.x * 90 + p.z * 40, p.y * 90 - p.z * 50));
}
/** cast metal (bronze, brass): a bright top sheen, dark underneath, patina in the hollows */
function metalP(c, { hi = '#ffe6a8', lo = '#6a4a2a', patina = null, sc = 50 } = {}) {
  const C0 = col(c), H = col(hi), L = col(lo), P = patina ? col(patina) : null;
  return (p, n, o) => {
    o.copy(C0).lerp(H, clamp(n.y * 0.7 + n.x * 0.25 - 0.1) * 0.55).lerp(L, clamp(-n.y * 0.8) * 0.5);
    if (P) { const v = nz(p.x * sc + p.z * 0.5 * sc, p.y * sc); if (v > 0.3) o.lerp(P, clamp((v - 0.3) * 2.5) * 0.5 * clamp(1 - n.y)); }
  };
}

// ------------------------------------------------------------------ sculpting (SDF) helpers
const { ellipsoid: sE, roundCone: sRC, sphere: sS } = SDF;
const sU = (k, ...fs) => SDF.union(k, ...fs);
/** squash f along z by k about z = cz (ears, flat lobes) */
const flatZ = (f, cz, k) => (x, y, z) => f(x, y, cz + (z - cz) / k) * k;
/** flat-bottomed: cut f at y = y0 */
const cutY = (f, y0 = 0) => (x, y, z) => Math.max(f(x, y, z), y0 - y);
/** mesh an SDF over the box [lo, hi] with cell size h */
const sculpt = (f, lo, hi, h) => SDF.surfaceNets(f, lo, hi, h);
function sdfN(f, x, y, z, e = 0.0012) {
  return V(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)).normalize();
}
/** the first surface seen from the front (+z) at (x, y), sphere-traced; null when the ray misses */
function frontZ(f, x, y, z0 = 0.6) {
  let z = z0;
  for (let i = 0; i < 220; i++) {
    const d = f(x, y, z);
    if (d < 0.0003) return z;
    z -= Math.max(d * 0.85, 0.0005);
    if (z < -z0) return null;
  }
  return null;
}
/** a tangent frame whose z is n (x stays horizontal) */
function basis(n) {
  const t = new THREE.Vector3().crossVectors(UP, n); if (t.lengthSq() < 1e-6) t.set(1, 0, 0); t.normalize();
  return new THREE.Matrix4().makeBasis(t, new THREE.Vector3().crossVectors(n, t), n);
}
/** the front surface point of f at (x, y) and its normal */
function frameOn(f, x, y, z0) { const z = frontZ(f, x, y, z0) ?? 0; return { p: V(x, y, z), n: sdfN(f, x, y, z) }; }
/** a soft dome (ellipsoid rx × ry, rz deep, `out` of it showing) sitting on a surface frame, turned rot in its plane */
function dome(B, fr, rx, ry, rz, c, { rot = 0, lift = 0, out = 0.55, seg = 10, k = 'body' } = {}) {
  const cap = Math.max(rx, ry) < 0.045 && out < 0.75, g = cap ? new THREE.SphereGeometry(1, seg, Math.max(3, Math.round(seg / 3)), 0, TAU, 0, PI / 2).rotateX(PI / 2) : G.sph(1, seg, Math.max(5, Math.round(seg * 0.65)));
  g.scale(rx, ry, rz); g.rotateZ(rot); g.applyMatrix4(basis(fr.n));
  const at = fr.p.clone().addScaledVector(fr.n, (out - 1) * rz + lift);
  g.translate(at.x, at.y, at.z);
  return B.add(g, c, k);
}
const dot = (B, f, x, y, rx, ry, rz, c, o) => dome(B, frameOn(f, x, y), rx, ry, rz, c, o);
/** split every triangle in four, `times` times (so a flat decal can bend onto a curved surface) */
function subdivide(g, times = 1) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (let t = 0; t < times; t++) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, op = [], on = [];
    const mid = (A, i, j) => [(A[i] + A[j]) / 2, (A[i + 1] + A[j + 1]) / 2, (A[i + 2] + A[j + 2]) / 2];
    for (let i = 0; i < P.length; i += 9) {
      const a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], c = [P[i + 6], P[i + 7], P[i + 8]];
      const ab = mid(P, i, i + 3), bc = mid(P, i + 3, i + 6), ca = mid(P, i + 6, i);
      const na = [N[i], N[i + 1], N[i + 2]], nb = [N[i + 3], N[i + 4], N[i + 5]], nc = [N[i + 6], N[i + 7], N[i + 8]];
      const nab = mid(N, i, i + 3), nbc = mid(N, i + 3, i + 6), nca = mid(N, i + 6, i);
      op.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
      on.push(...na, ...nab, ...nca, ...nab, ...nb, ...nbc, ...nca, ...nbc, ...nc, ...nab, ...nbc, ...nca);
    }
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(op, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(on, 3));
  }
  return g;
}
/** lay a flat XY geometry onto f's front surface: each vertex goes to the surface at its (x, y), lifted by off + its z */
function drape(g, f, off = 0.0012, z0 = 0.6) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, nn = g.attributes.normal, memo = new Map(), q = new THREE.Quaternion(), Z = V(0, 0, 1), v = V();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), key = Math.round(x * 2e4) + ',' + Math.round(y * 2e4);
    let s = memo.get(key);
    if (!s) { const z = frontZ(f, x, y, z0) ?? 0; s = { z, n: sdfN(f, x, y, z) }; memo.set(key, s); }
    const o = off + p.getZ(i);
    p.setXYZ(i, x + s.n.x * o, y + s.n.y * o, s.z + s.n.z * o);
    q.setFromUnitVectors(Z, s.n); v.fromBufferAttribute(nn, i).applyQuaternion(q); nn.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
/** points round f's cross-section at height y (marched outward from (cx, cz)), pushed out by off */
function ringPts(f, y, cx, cz, n = 24, off = 0) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, dx = Math.sin(a), dz = Math.cos(a);
    let r = 0;
    for (let i = 0; i < 300; i++) { const d = f(cx + dx * r, y, cz + dz * r); if (d >= 0) break; r += Math.max(-d * 0.9, 0.0006); }
    pts.push(V(cx + dx * (r + off), y, cz + dz * (r + off)));
  }
  return pts;
}
/**
 * Quadric-error edge collapse (Garland-Heckbert) of an indexed mesh down to ~target triangles, keeping it manifold (link
 * condition) and unfolded. With f, the surviving vertices are pulled back onto f's surface and take its gradient as their
 * normal, so a light mesh still shades as smoothly as the field.
 */
function simplify(g, target, f = null) {
  const P = Float64Array.from(g.attributes.position.array), F = Int32Array.from(g.index.array), nv = P.length / 3, nf0 = F.length / 3;
  const alive = new Uint8Array(nf0).fill(1), dead = new Uint8Array(nv), ver = new Uint32Array(nv), Q = new Float64Array(nv * 10);
  const vf = Array.from({ length: nv }, () => []);
  for (let i = 0; i < nf0; i++) for (let k = 0; k < 3; k++) vf[F[i * 3 + k]].push(i);
  for (let i = 0; i < nf0; i++) {
    const a = F[i * 3] * 3, b = F[i * 3 + 1] * 3, c = F[i * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz2 = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz2); if (l < 1e-14) continue;
    const w = l * 0.5; nx /= l; ny /= l; nz2 /= l; const d = -(nx * P[a] + ny * P[a + 1] + nz2 * P[a + 2]);
    for (let k = 0; k < 3; k++) { const q = F[i * 3 + k] * 10; Q[q] += w * nx * nx; Q[q + 1] += w * nx * ny; Q[q + 2] += w * nx * nz2; Q[q + 3] += w * nx * d; Q[q + 4] += w * ny * ny; Q[q + 5] += w * ny * nz2; Q[q + 6] += w * ny * d; Q[q + 7] += w * nz2 * nz2; Q[q + 8] += w * nz2 * d; Q[q + 9] += w * d * d; }
  }
  const qe = (v, x, y, z) => { const q = v * 10; return Q[q] * x * x + 2 * Q[q + 1] * x * y + 2 * Q[q + 2] * x * z + 2 * Q[q + 3] * x + Q[q + 4] * y * y + 2 * Q[q + 5] * y * z + 2 * Q[q + 6] * y + Q[q + 7] * z * z + 2 * Q[q + 8] * z + Q[q + 9]; };
  // a binary min-heap of collapse candidates, kept in typed arrays (no per-candidate allocations)
  let cap = 1 << 15, n = 0, E = 0, ec = new Float64Array(cap), ea = new Int32Array(cap), eb = new Int32Array(cap), eva = new Uint32Array(cap), evb = new Uint32Array(cap), ep = new Float64Array(cap * 3), heap = new Int32Array(cap);
  const grow = () => {
    cap *= 2;
    const g2 = (A, k = 1) => { const B2 = new A.constructor(cap * k); B2.set(A); return B2; };
    ec = g2(ec); ea = g2(ea); eb = g2(eb); eva = g2(eva); evb = g2(evb); ep = g2(ep, 3); heap = g2(heap);
  };
  const push = (c, a, b, x, y, z) => {
    if (E >= cap || n >= cap) grow();
    const e = E++; ec[e] = c; ea[e] = a; eb[e] = b; eva[e] = ver[a]; evb[e] = ver[b]; ep[e * 3] = x; ep[e * 3 + 1] = y; ep[e * 3 + 2] = z;
    let i = n++; heap[i] = e;
    while (i > 0) { const pI = (i - 1) >> 1; if (ec[heap[pI]] <= ec[heap[i]]) break; const t = heap[pI]; heap[pI] = heap[i]; heap[i] = t; i = pI; }
  };
  const pop = () => {
    const top = heap[0]; heap[0] = heap[--n];
    let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && ec[heap[l]] < ec[heap[m]]) m = l; if (r < n && ec[heap[r]] < ec[heap[m]]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; }
    return top;
  };
  const edge = (a, b) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    const c0 = qe(a, ax, ay, az) + qe(b, ax, ay, az), c1 = qe(a, bx, by, bz) + qe(b, bx, by, bz), c2 = qe(a, mx, my, mz) + qe(b, mx, my, mz);
    if (c2 <= c0 && c2 <= c1) push(c2, a, b, mx, my, mz); else if (c0 <= c1) push(c0, a, b, ax, ay, az); else push(c1, a, b, bx, by, bz);
  };
  const seen = new Set();
  for (let i = 0; i < nf0; i++) for (let k = 0; k < 3; k++) { let a = F[i * 3 + k], b = F[i * 3 + (k + 1) % 3]; if (a > b) { const t = a; a = b; b = t; } const key = a * nv + b; if (!seen.has(key)) { seen.add(key); edge(a, b); } }
  // neighbour rings by stamping (no Sets)
  const markA = new Uint32Array(nv), markB = new Uint32Array(nv), ring = [];
  let stamp = 0;
  const stampRing = (v, M) => { for (const fi of vf[v]) if (alive[fi]) for (let k = 0; k < 3; k++) { const u = F[fi * 3 + k]; if (u !== v) M[u] = stamp; } };
  // does moving vertex v to (x, y, z) keep every face it shares (not with o) facing the same way?
  const keeps = (v, o, x, y, z) => {
    for (const fi of vf[v]) {
      if (!alive[fi]) continue;
      const i0 = F[fi * 3], i1 = F[fi * 3 + 1], i2 = F[fi * 3 + 2];
      if (i0 === o || i1 === o || i2 === o) continue;
      const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
      let ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      const n0x = uy * wz - uz * wy, n0y = uz * wx - ux * wz, n0z = ux * wy - uy * wx;
      const Ax = i0 === v ? x : ax, Ay = i0 === v ? y : ay, Az = i0 === v ? z : az, Bx = i1 === v ? x : bx, By = i1 === v ? y : by, Bz = i1 === v ? z : bz, Cx = i2 === v ? x : cx, Cy = i2 === v ? y : cy, Cz = i2 === v ? z : cz;
      ux = Bx - Ax; uy = By - Ay; uz = Bz - Az; wx = Cx - Ax; wy = Cy - Ay; wz = Cz - Az;
      const n1x = uy * wz - uz * wy, n1y = uz * wx - ux * wz, n1z = ux * wy - uy * wx;
      const l0 = Math.hypot(n0x, n0y, n0z), l1 = Math.hypot(n1x, n1y, n1z);
      if (l1 < 1e-16 || n0x * n1x + n0y * n1y + n0z * n1z < 0.3 * l0 * l1) return false;
    }
    return true;
  };
  let nf = nf0;
  while (nf > target && n > 0) {
    const e = pop(), a = ea[e], b = eb[e];
    if (dead[a] || dead[b] || ver[a] !== eva[e] || ver[b] !== evb[e]) continue;
    const x = ep[e * 3], y = ep[e * 3 + 1], z = ep[e * 3 + 2];
    // link condition: a and b share exactly the two vertices opposite their edge
    stamp++; stampRing(a, markA); stampRing(b, markB);
    if (markA[b] !== stamp) continue;
    let common = 0;
    for (const fi of vf[a]) if (alive[fi]) for (let k = 0; k < 3; k++) { const u = F[fi * 3 + k]; if (u !== a && markA[u] === stamp && markB[u] === stamp) { common++; markA[u] = 0; } }
    if (common !== 2) continue;
    if (!keeps(a, b, x, y, z) || !keeps(b, a, x, y, z)) continue;
    P[a * 3] = x; P[a * 3 + 1] = y; P[a * 3 + 2] = z;
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
    for (const fi of vf[b]) {
      if (!alive[fi]) continue;
      if (F[fi * 3] === a || F[fi * 3 + 1] === a || F[fi * 3 + 2] === a) { alive[fi] = 0; nf--; continue; }
      for (let k = 0; k < 3; k++) if (F[fi * 3 + k] === b) F[fi * 3 + k] = a;
      vf[a].push(fi);
    }
    dead[b] = 1; ver[a]++;
    vf[a] = vf[a].filter(fi => alive[fi]);
    stamp++; ring.length = 0;
    for (const fi of vf[a]) for (let k = 0; k < 3; k++) { const u = F[fi * 3 + k]; if (u !== a && markA[u] !== stamp) { markA[u] = stamp; ring.push(u); } }
    for (const u of ring) edge(Math.min(a, u), Math.max(a, u));
  }
  const map = new Int32Array(nv).fill(-1), out = [], oi = [];
  for (let i = 0; i < nf0; i++) if (alive[i]) for (let k = 0; k < 3; k++) { const v = F[i * 3 + k]; if (map[v] < 0) { map[v] = out.length / 3; out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } oi.push(map[v]); }
  const ng = new THREE.BufferGeometry(), pos = new Float32Array(out);
  if (f) {
    const nr = new Float32Array(pos.length), e = 0.0008;
    for (let v = 0; v < pos.length; v += 3) {
      let x = pos[v], y = pos[v + 1], z = pos[v + 2];
      for (let it = 0; it < 2; it++) {
        const d = f(x, y, z), gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e), g2 = gx * gx + gy * gy + gz * gz || 1;
        if (it === 0) { const s = Math.max(-0.004, Math.min(0.004, d / g2)); x -= gx * s; y -= gy * s; z -= gz * s; }
        else { const l = Math.sqrt(g2); nr[v] = gx / l; nr[v + 1] = gy / l; nr[v + 2] = gz / l; }
      }
      pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    }
    ng.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  }
  ng.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ng.setIndex(oi);
  if (!f) ng.computeVertexNormals();
  return ng;
}
/** sculpt f finely, then simplify it to ~target triangles (smooth gradient normals) */
const mold = (f, lo, hi, h, target) => simplify(sculpt(f, lo, hi, h), target, f);
/** a closed rope through ring points */
const loopTube = (pts, r, radial = 6) => tube([...pts, pts[0], pts[1]].map(p => ({ p, r })), radial, false);

// ------------------------------------------------------------------ geometry helpers
/** a tube with an elliptical section along a smooth path: width w(t) along `side`, thickness th(t) (tongues, straps) */
function flatTube(pts, w, th, { n = 16, radial = 12, side = V(1, 0, 0) } = {}) {
  const P = new THREE.CatmullRomCurve3(pts.map(p => V(...p))).getPoints(n - 1), pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], T = b.clone().sub(a).normalize();
    const S = side.clone().addScaledVector(T, -side.dot(T)).normalize(), N = new THREE.Vector3().crossVectors(T, S);
    const W = (typeof w === 'function' ? w(t) : w) / 2, H = (typeof th === 'function' ? th(t) : th) / 2;
    for (let k = 0; k < radial; k++) { const q = k / radial * TAU, p = P[i].clone().addScaledVector(S, Math.cos(q) * W).addScaledVector(N, Math.sin(q) * H); pos.push(p.x, p.y, p.z); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) { const a = i * radial + k, b = i * radial + (k + 1) % radial; idx.push(a, b, b + radial, a, b + radial, a + radial); }
  for (const [i, s] of [[0, -1], [n - 1, 1]]) { // flat end caps
    const c = pos.length / 3, e = P[i]; pos.push(e.x, e.y, e.z);
    for (let k = 0; k < radial; k++) { const a = i * radial + k, b = i * radial + (k + 1) % radial; if (s > 0) idx.push(c, a, b); else idx.push(c, b, a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** a flat strip that twists along a smooth path (smoke curls): width w(t), turning `twist` radians end to end */
function curlStrip(pts, w, { n = 30, twist = 2.4, side = V(1, 0, 0) } = {}) {
  const P = new THREE.CatmullRomCurve3(pts.map(p => V(...p))).getPoints(n - 1), pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], T = b.clone().sub(a).normalize();
    const S0 = side.clone().addScaledVector(T, -side.dot(T)).normalize(), N0 = new THREE.Vector3().crossVectors(T, S0), q = twist * t;
    const S = S0.multiplyScalar(Math.cos(q)).addScaledVector(N0, Math.sin(q)), W = w(t) / 2;
    for (const s of [-1, 1]) { const p = P[i].clone().addScaledVector(S, s * W); pos.push(p.x, p.y, p.z); }
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const uv = []; for (let i = 0; i < n; i++) uv.push(0, i / (n - 1), 1, i / (n - 1));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** a rounded polygon shape (corners cut by quadratic arcs of radius rad) */
function roundPoly(pts, rad, P = new THREE.Shape()) {
  const n = pts.length, at = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(d, l / 2) / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  for (let i = 0; i < n; i++) {
    const c = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n], a = at(c, prev, rad), b = at(c, next, rad);
    if (i === 0) P.moveTo(...a); else P.lineTo(...a);
    P.quadraticCurveTo(c[0], c[1], ...b);
  }
  P.closePath();
  return P;
}
/** a plump ivy leaf (two rounded basal lobes, a broad pointed tip): stalk at the origin, tip along +y, facing +z */
function ivyLeafGeo(s) {
  const S = new THREE.Shape();
  S.moveTo(0, 0.05 * s);
  S.bezierCurveTo(-0.14 * s, -0.07 * s, -0.48 * s, -0.04 * s, -0.46 * s, 0.17 * s);
  S.bezierCurveTo(-0.45 * s, 0.32 * s, -0.33 * s, 0.38 * s, -0.27 * s, 0.44 * s);
  S.bezierCurveTo(-0.24 * s, 0.64 * s, -0.1 * s, 0.82 * s, 0, 0.95 * s);
  S.bezierCurveTo(0.1 * s, 0.82 * s, 0.24 * s, 0.64 * s, 0.27 * s, 0.44 * s);
  S.bezierCurveTo(0.33 * s, 0.38 * s, 0.45 * s, 0.32 * s, 0.46 * s, 0.17 * s);
  S.bezierCurveTo(0.48 * s, -0.04 * s, 0.14 * s, -0.07 * s, 0, 0.05 * s);
  const g = new THREE.ShapeGeometry(S, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.25 - (p.getY(i) / s) ** 2 * 0.06 * s);
  g.computeVertexNormals();
  return twoSided(g);
}
/** a small rounded pebble (squashed sphere with a little lumpiness) */
function pebble(B, r, x, y, z, c, { sq = 0.55, seg = 8, ry = 0 } = {}) {
  const g = G.sph(1, seg, Math.max(5, seg - 2)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * nz(p.getX(i) * 2 + x * 40, p.getZ(i) * 2 + p.getY(i) + z * 40); p.setXYZ(i, p.getX(i) * r * k, p.getY(i) * r * sq * k, p.getZ(i) * r * 0.85 * k); }
  g.computeVertexNormals(); g.rotateY(ry);
  return put(B, g, x, y + r * sq * 0.8, z, (pp, n, o) => o.set(c).multiplyScalar(0.9 + 0.14 * clamp(n.y)));
}

/** a fallen maple leaf lying on the floor: five pointed, finely toothed lobes, cupped, veined, with its stalk */
function mapleLeaf(B, R, c) {
  const lobes = [[0, 1, 0.66], [1.0, 0.88, 0.62], [-1.0, 0.88, 0.62], [1.98, 0.58, 0.54], [-1.98, 0.58, 0.54]];
  const rad = th => { let r = 0.4; for (const [a, L, w] of lobes) { let u = Math.abs(th - a); u = Math.min(u, TAU - u) / w; if (u < 1) r = Math.max(r, L * (1 - u ** 1.3)); } return r * (1 + 0.05 * Math.abs(Math.sin(th * 15))); };
  const pts = []; for (let i = 0; i < 64; i++) { const th = i / 64 * TAU - PI, r = rad(th) * R; pts.push(new THREE.Vector2(Math.sin(th) * r, Math.cos(th) * r)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, ((p.getX(i) ** 2 + p.getY(i) ** 2) / (R * R)) * R * 0.3);
  g.computeVertexNormals(); g.rotateX(-PI / 2);
  const C0 = col(c), C1 = col('#ffd27a'), Vn = col('#ffe2a0');
  B.add(g, (q, n, o) => {
    const r = Math.hypot(q.x, q.z) / R, th = Math.atan2(q.x, -q.z);
    o.copy(C0).lerp(C1, clamp(1 - r * 1.6) * 0.55).multiplyScalar(0.92 + 0.1 * clamp(n.y));
    for (const [a] of lobes) { let u = Math.abs(th - a); u = Math.min(u, TAU - u); if (u < 0.06 && r > 0.08) o.lerp(Vn, 0.45); }
  });
  curve(B, [[0, 0.004, 0.0], [0.004, 0.008, R * 0.45], [0.0, 0.005, R * 0.75]], 0.0028, shade(c, 0.7), { radial: 4, n: 5 });
}

// =================================================================== Tea House: Kitsune's shrine corner
const TEA2 = {
  kamidana(B) {
    const hin = '#f4dcb0', hinD = '#dcb47e', hinS = '#b88a56', roofC = '#74b4a2', roofD = '#4e8a7e', brass = '#e8b850';
    const sy = 0.13, sd = 0.18, top = sy + 0.04;
    // the shelf: a thick hinoki board on two scrolled brackets
    sbox(B, 0.94, 0.04, sd, 0.014, 0, sy, sd / 2, grainP(hin));
    const br = new THREE.Shape(); br.moveTo(0, 0); br.lineTo(0.15, 0); br.quadraticCurveTo(0.13, -0.05, 0.07, -0.07); br.quadraticCurveTo(0.03, -0.09, 0.025, -0.13); br.lineTo(0, -0.13); br.lineTo(0, 0);
    for (const sx of [-1, 1]) { const g = extrude(br, 0.026, 0.006, 5); g.rotateY(-PI / 2); put(B, g, sx * 0.33 + 0.019, sy, 0.0, grainP(hinD, { along: 'z' })); }
    // a stepped plinth and the miniature shrine (miyagata): pillars, double doors, brass fittings
    const pz = 0.072;
    sbox(B, 0.36, 0.024, 0.136, 0.008, 0, top, pz, grainP(hinD));
    sbox(B, 0.3, 0.03, 0.118, 0.008, 0, top + 0.024, pz - 0.004, grainP(hin));
    const by = top + 0.054, bh = 0.13, bz = 0.068, bw = 0.24, bd = 0.1, fz = bz + bd / 2;
    box(B, bw, bh, bd, 0, 0, by, bz, grainP(hin, { along: 'y' }));
    for (const sx of [-1, 1]) for (const zz of [fz, bz - bd / 2 + 0.012]) cyl(B, 0.013, 0.013, bh, 8, sx * (bw / 2), by, zz, grainP(hinS, { along: 'y' }));
    for (const sx of [-1, 1]) {
      box(B, 0.086, 0.1, 0.008, 0, sx * 0.046, by + 0.012, fz + 0.001, grainP('#fae8c6', { along: 'y' }));
      for (const y of [by + 0.028, by + 0.092]) box(B, 0.022, 0.009, 0.004, 0, sx * 0.075, y, fz + 0.007, brass);
      const ring = G.torus(0.0085, 0.0022, 4, 10); put(B, ring, sx * 0.009, by + 0.062, fz + 0.008, brass);
      ball(B, 0.0035, sx * 0.009, by + 0.07, fz + 0.007, brass, 1, 5);
    }
    box(B, bw + 0.03, 0.016, 0.014, 0, 0, by + bh - 0.016, fz + 0.004, grainP(hinS)); // lintel
    box(B, bw + 0.03, 0.012, 0.016, 0, 0, by, fz + 0.004, grainP(hinS)); // sill
    // a little brass crest on the lintel
    put(B, G.disc(0.017, 16), 0, by + bh - 0.008, fz + 0.0115, brass);
    put(B, tomoeGeo(0.013), 0, by + bh - 0.008, fz + 0.0125, '#b07a2a');
    // the curved (sori) copper roof, its ridge along x; gable fill under it
    const ry0 = by + bh, rz = bz + 0.002, R = new THREE.Shape();
    R.moveTo(0.192, ry0 + 0.004);
    R.quadraticCurveTo(0.13, ry0 + 0.018, rz, ry0 + 0.086);
    R.quadraticCurveTo(0.035, ry0 + 0.052, 0.008, ry0 + 0.03);
    R.lineTo(0.008, ry0 + 0.008);
    R.quadraticCurveTo(0.036, ry0 + 0.03, rz, ry0 + 0.062);
    R.quadraticCurveTo(0.128, ry0 - 0.004, 0.19, ry0 - 0.016);
    R.quadraticCurveTo(0.2, ry0 - 0.008, 0.192, ry0 + 0.004);
    const L = 0.4, rg = extrude(R, L, 0.005, 6); rg.rotateY(-PI / 2); rg.translate(L / 2 + 0.005, 0, 0);
    B.add(rg, (p, n, o) => {
      if (Math.abs(n.x) > 0.75) { o.set(roofD); return; }
      if (n.y < -0.1) { o.set('#9a7050'); return; }
      o.set(roofC).lerp(col('#b4e4d4'), clamp(n.y) * 0.3);
      if (Math.abs(((p.x + 1) * 28) % 1 - 0.5) > 0.4) o.multiplyScalar(0.86);
    });
    const gab = new THREE.Shape(); gab.moveTo(bz - bd / 2, ry0 - 0.001); gab.lineTo(bz + bd / 2, ry0 - 0.001); gab.lineTo(rz, ry0 + 0.066); gab.lineTo(bz - bd / 2, ry0 - 0.001);
    const gg = extrude(gab, bw - 0.012, 0, 4); gg.rotateY(-PI / 2); gg.translate((bw - 0.012) / 2, 0, 0); B.add(gg, '#e8c898');
    // the ridge with three katsuogi logs and a pair of crossed chigi at each gable
    const ridgeY = ry0 + 0.09;
    const rd = new THREE.CapsuleGeometry(0.013, L + 0.01, 3, 10); rd.rotateZ(PI / 2); put(B, rd, 0, ridgeY, rz, '#6a4a3a');
    for (const x of [-0.11, 0, 0.11]) {
      const k = G.cyl(0.011, 0.011, 0.062, 10); k.rotateX(PI / 2); put(B, k, x, ridgeY + 0.017, rz, grainP(hin, { along: 'z' }));
      for (const s of [-1, 1]) { const dsc = G.disc(0.0112, 10); if (s < 0) dsc.rotateY(PI); put(B, dsc, x, ridgeY + 0.017, rz + s * 0.0312, GOLD); }
    }
    for (const sx of [-1, 1]) for (const s of [-1, 1]) {
      const c = G.box(0.012, 0.1, 0.016, 0); c.rotateX(s * 0.62); put(B, c, sx * (L / 2 + 0.002), ridgeY + 0.02, rz, grainP(hinS, { along: 'y' }));
      ball(B, 0.007, sx * (L / 2 + 0.002), ridgeY + 0.02 + 0.05 * Math.cos(0.62), rz - s * 0.05 * Math.sin(0.62), GOLD, 1, 6);
    }
    // the mirror (shinkyo) on its little stand, in front of the doors
    B.at([0, top, 0.163], 0, () => {
      sbox(B, 0.082, 0.014, 0.032, 0.005, 0, 0, 0, '#a8643a');
      for (const sx of [-1, 1]) pipe(B, [sx * 0.022, 0.012, 0], [sx * 0.03, 0.044, -0.004], 0.0055, '#a8643a');
      const my = 0.058, mr = 0.036;
      const back = G.cyl(mr + 0.004, mr + 0.004, 0.008, 22); back.rotateX(PI / 2); put(B, back, 0, my, -0.006, '#c89a40');
      put(B, G.torus(mr + 0.002, 0.0042, 3, 20), 0, my, -0.001, GOLD);
      put(B, G.disc(mr, 26), 0, my, -0.0012, (p, n, o) => o.set('#c4dbe8').lerp(col('#ffffff'), clamp(((p.y - my) - p.x) / mr * 0.55 + 0.25)));
      put(B, ribbon([[-0.016, 0.004], [0.008, 0.026]], 0.006), 0, my, -0.0006, '#ffffff');
    });
    // two white vases of sakaki, two sake flasks with paper bands
    const vase = [[0.001, 0], [0.022, 0], [0.025, 0.006], [0.024, 0.05], [0.021, 0.06], [0.026, 0.068], [0.028, 0.073], [0.022, 0.073], [0.001, 0.066]];
    const leafC = ['#2f7a4a', '#3a8a52', '#2a6e44', '#468e58'];
    for (const sx of [-1, 1]) B.at([sx * 0.36, top, 0.088], 0, () => {
      lathe(B, vase, 8, 0, 0, 0, (p, n, o) => { o.set('#fbf8f2').lerp(col('#dde2ec'), clamp(0.25 - n.y * 0.5)); if (Math.abs(p.y - 0.04) < 0.005 && n.y < 0.5) o.set('#5a86c8'); });
      // a sakaki sprig: a main stem and two side twigs, thick with glossy oval leaves in pairs
      const twigs = [[[0, 0.055, 0], [sx * 0.004, 0.12, 0.004], [sx * 0.01, 0.205, 0.0]], [[sx * 0.002, 0.09, 0.002], [sx * 0.03, 0.13, 0.012], [sx * 0.05, 0.165, 0.018]], [[0, 0.1, 0.002], [-sx * 0.022, 0.14, -0.004], [-sx * 0.034, 0.175, -0.006]]];
      twigs.forEach((tw, ti) => {
        curve(B, tw, t => (ti ? 0.0028 : 0.0042) - t * 0.0012, '#6a5a3a', { radial: 4, n: 5, k: 'leaf' });
        const C3 = new THREE.CatmullRomCurve3(tw.map(p => V(...p))), nL = ti ? 4 : 7;
        for (let i = 0; i < nL; i++) {
          const t = (ti ? 0.3 : 0.18) + i / nL * (ti ? 0.75 : 0.84), q = C3.getPoint(Math.min(1, t)), side = i % 2 ? 1 : -1, Lf = 0.044 + 0.008 * Math.sin(i * 1.7 + ti);
          const g = bladeGeo(Lf, Lf * 0.56, { bend: 0.4, seg: 3, fold: 0.3, base: 0.22 });
          const c0 = col(leafC[(i + ti) % 4]), c1 = col('#86cc90');
          paint(g, (p, n, o) => o.copy(c0).lerp(c1, clamp(p.y / Lf) * 0.3).multiplyScalar(0.88 + 0.24 * clamp(n.y * 0.5 + n.z * 0.5)));
          g.rotateZ(side * (0.55 + 0.4 * (1 - t))); g.rotateY(i * 2.39 + sx + ti); g.translate(q.x, q.y, q.z);
          B.add(g, null, 'leaf');
        }
      });
    });
    const hp = [[0.001, 0], [0.017, 0], [0.023, 0.012], [0.025, 0.03], [0.021, 0.046], [0.01, 0.058], [0.008, 0.066], [0.011, 0.07], [0.001, 0.072]];
    for (const sx of [-1, 1]) B.at([sx * 0.235, top, 0.1], 0, () => {
      lathe(B, hp, 8, 0, 0, 0, (p, n, o) => o.set('#fffaf4').lerp(col('#e2dfea'), clamp(0.3 - n.y * 0.5)));
      lathe(B, [[0.001, 0.066], [0.013, 0.066], [0.0145, 0.075], [0.009, 0.083], [0.001, 0.085]], 10, 0, 0, 0, '#fffaf4');
      ball(B, 0.0045, 0, 0.088, 0, GOLD, 1, 6);
      put(B, G.cyl(0.0256, 0.0256, 0.01, 14, true), 0, 0.026, 0, '#e8503a');
      put(B, G.cyl(0.0259, 0.0259, 0.003, 14, true), 0, 0.026, 0, '#fffaf2');
    });
    // the shimenawa: a fat twisted straw rope along the shelf edge, with straw tufts and zigzag shide papers
    const ropeY = t => top - 0.016 - Math.sin(t * PI) * 0.042, ropeR = t => 0.01 + 0.014 * Math.sin(t * PI) ** 0.8, rz2 = sd + 0.01;
    // two fat straw strands twisted round each other (a sinister-twist rope, thicker in the middle)
    for (const ph of [0, PI]) {
      const st = []; for (let k = 0; k <= 24; k++) { const t = k / 24, a = t * 9 * PI + ph, R = ropeR(t) * 0.48; st.push({ p: V(-0.44 + 0.88 * t, ropeY(t) + Math.sin(a) * R, rz2 + Math.cos(a) * R), r: ropeR(t) * 0.62 }); }
      B.add(tube(st, 5, false), (p, n, o) => o.set(ph ? '#e6c884' : '#f0d698').multiplyScalar(0.84 + 0.16 * (0.5 + 0.5 * Math.sin(p.x * 260 + Math.atan2(n.y, n.z) * 3))));
    }
    for (const sx of [-1, 1]) { ball(B, 0.011, sx * 0.44, ropeY(0), rz2, '#e2c886', 1, 8); ball(B, 0.005, sx * 0.452, ropeY(0) + 0.004, rz2 - 0.004, brass, 1, 5); }
    for (const x of [-0.22, 0, 0.22]) {
      const t = (x + 0.44) / 0.88, yr = ropeY(t) - ropeR(t) * 0.55;
      const tuft = quadPaint(G.lathe([[0.001, 0], [0.011, 0.004], [0.014, 0.028], [0.01, 0.05], [0.001, 0.056]], 8), 5, (i, j, o) => o.set(i % 2 ? '#e8cc88' : '#d4b46c'));
      tuft.rotateX(PI); tuft.translate(x, yr, rz2); B.add(tuft, null);
      const tie = G.torus(0.0125, 0.003, 3, 10); tie.rotateX(PI / 2); put(B, tie, x, yr - 0.008, rz2, '#c8323a');
    }
    for (const x of [-0.33, -0.11, 0.11, 0.33]) {
      const t = (x + 0.44) / 0.88, yr = ropeY(t) - ropeR(t) * 0.7;
      const parts = [];
      for (let k = 0; k < 4; k++) { const s = roundRect(0.017, 0.022, 0.002, x + (k % 2 ? 0.008 : -0.004) - 0.002, yr - 0.011 - k * 0.019); const g = new THREE.ShapeGeometry(s, 2); g.translate(0, 0, k * 0.0006); parts.push(g); }
      const g = mergeG(parts); g.translate(0, 0, rz2 + 0.012);
      B.cloth(g, '#ffffff', { x0: x - 0.02, x1: x + 0.02, yTop: yr, yBot: yr - 0.085 });
    }
  },

  foxStatue(B) {
    // a two-step plinth: a mossy base, a block with a raised panel and a gilded jewel, a soft top slab
    sbox(B, 0.46, 0.085, 0.42, 0.03, 0, 0, 0, mossStone('#bcb4ae', 0.3, 9));
    sbox(B, 0.37, 0.125, 0.33, 0.035, 0, 0.08, 0, stoneP('#cdc6be'));
    // a carved cartouche on the front: a raised frame round a sunk panel, a gilded flaming jewel (hoju) in it
    const frame = roundRect(0.27, 0.085, 0.014); frame.holes.push(roundRect(0.234, 0.06, 0.008, 0, 0, new THREE.Path()));
    put(B, extrude(frame, 0.006, 0.003, 2), 0, 0.1425, 0.163, stoneP('#d6cfc6'));
    box(B, 0.236, 0.062, 0.004, 0, 0, 0.1115, 0.165, stoneP('#b4aca4'));
    const hj = new THREE.Shape(); hj.moveTo(0, -0.026); hj.bezierCurveTo(0.033, -0.026, 0.036, 0.008, 0.013, 0.021); hj.quadraticCurveTo(0.004, 0.028, 0, 0.04); hj.quadraticCurveTo(-0.004, 0.028, -0.013, 0.021); hj.bezierCurveTo(-0.036, 0.008, -0.033, -0.026, 0, -0.026);
    const gild = (p, n, o) => o.set('#e8c060').lerp(col('#fff0b0'), clamp(n.y * 0.5 + n.z * 0.3 - 0.2));
    put(B, extrude(hj, 0.004, 0.003, 8), 0, 0.14, 0.167, gild);
    for (const sx of [-1, 1]) { // little flame tongues licking up either side of the jewel
      const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.quadraticCurveTo(sx * 0.016, 0.004, sx * 0.022, 0.024); fl.quadraticCurveTo(sx * 0.008, 0.016, 0, 0.012); fl.quadraticCurveTo(-sx * 0.004, 0.006, 0, 0);
      put(B, extrude(fl, 0.003, 0.002, 5), sx * 0.03, 0.124, 0.167, gild);
    }
    sbox(B, 0.34, 0.03, 0.3, 0.012, 0, 0.2, 0, stoneP('#d8d2ca'));
    const PT = 0.228;
    // the fox, sculpted: seated torso, chest ruff, haunches, straight forelegs, a snouty head, tall ears, a flame tail
    const ear = s => flatZ(sRC([s * 0.046, 0.408, 0.012], [s * 0.074, 0.53, -0.004], 0.037, 0.006), 0.005, 0.45);
    const fox = cutY(sU(0.012,
      sU(0.034,
        sE([0, 0.15, -0.02], [0.1, 0.152, 0.095]),
        sE([0, 0.208, 0.046], [0.078, 0.094, 0.068]),
        sE([0.07, 0.075, -0.03], [0.066, 0.076, 0.096]), sE([-0.07, 0.075, -0.03], [0.066, 0.076, 0.096]),
        sRC([0, 0.25, 0.005], [0, 0.335, 0.025], 0.062, 0.058),
        sE([0, 0.372, 0.026], [0.082, 0.072, 0.078]),
        sE([0.05, 0.346, 0.046], [0.046, 0.036, 0.046]), sE([-0.05, 0.346, 0.046], [0.046, 0.036, 0.046]),
        sRC([0, 0.366, 0.06], [0, 0.352, 0.152], 0.044, 0.02)),
      sU(0.018,
        sRC([0.042, 0.215, 0.06], [0.047, 0.03, 0.086], 0.03, 0.026), sRC([-0.042, 0.215, 0.06], [-0.047, 0.03, 0.086], 0.03, 0.026),
        sE([0.047, 0.02, 0.1], [0.031, 0.022, 0.04]), sE([-0.047, 0.02, 0.1], [0.031, 0.022, 0.04]),
        sE([0.09, 0.018, 0.052], [0.034, 0.02, 0.05]), sE([-0.09, 0.018, 0.052], [0.034, 0.02, 0.05])),
      ear(1), ear(-1),
      SDF.tube([[0, 0.06, -0.1], [0.05, 0.1, -0.168], [0.074, 0.2, -0.19], [0.064, 0.32, -0.162], [0.034, 0.42, -0.112]], [0.04, 0.058, 0.064, 0.05, 0.012])), 0);
    const tipP = V(0.04, 0.4, -0.12), chestP = V(0, 0.2, 0.08), white = col('#f6f2ec');
    const fs = stoneP('#cbc3b9', { sc: 14, amt: 0.09 });
    B.at([0, PT, -0.012], 0, () => {
      B.add(mold(fox, [-0.17, -0.004, -0.27], [0.17, 0.555, 0.2], 0.0145, 2450), (p, n, o) => {
        fs(p, n, o);
        o.lerp(white, clamp(1 - p.distanceTo(tipP) / 0.075) * 0.85).lerp(white, clamp(1 - p.distanceTo(chestP) / 0.07) * 0.35);
      });
      // inner ears, slit eyes with red kitsune liner, red maro brows, the nose
      for (const s of [-1, 1]) {
        dot(B, fox, s * 0.058, 0.462, 0.0145, 0.04, 0.006, '#e8806e', { rot: -s * 0.2, out: 0.5 });
        dot(B, fox, s * 0.033, 0.386, 0.018, 0.0062, 0.005, INK, { rot: s * 0.38, out: 0.6 });
        B.add(drape(stroke([[s * 0.014, 0.394], [s * 0.034, 0.4], [s * 0.056, 0.414]], t => 0.0068 - t * 0.0042, 1, 0, 0, 8), fox, 0.0016), '#d8382e');
        dot(B, fox, s * 0.028, 0.424, 0.009, 0.006, 0.004, '#d8382e', { rot: s * 0.2, out: 0.6 });
      }
      ball(B, 0.0135, 0, 0.358, 0.168, INK, [1.15, 0.85, 0.95], 10);
      // the red bib (yodarekake) laid on the chest, with a pale hem, and its red cord round the neck
      const bib = new THREE.Shape(); bib.moveTo(-0.074, 0.304); bib.quadraticCurveTo(0, 0.286, 0.074, 0.304); bib.quadraticCurveTo(0.068, 0.238, 0.012, 0.2); bib.quadraticCurveTo(0, 0.192, -0.012, 0.2); bib.quadraticCurveTo(-0.068, 0.238, -0.074, 0.304);
      const bibC = (p, n, o) => o.set('#e2483c').lerp(col('#ff7a62'), clamp(n.y * 0.5 + 0.1) * 0.4).multiplyScalar(0.94 + 0.06 * Math.sin(p.x * 160));
      B.add(drape(subdivide(new THREE.ShapeGeometry(bib, 5), 2), fox, 0.0042), bibC);
      const edgeP = bib.getPoints(5).map(v => { const fr = frameOn(fox, v.x, v.y); return fr.p.addScaledVector(fr.n, 0.0028); });
      B.add(loopTube(edgeP.slice(0, -1), 0.0032, 5), (p, n, o) => o.set('#c8343a').multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.4)));
      const hem = stroke(bib.getPoints(5).map(v => [v.x * 0.84, 0.254 + (v.y - 0.254) * 0.84]), 0.0034, 1, 0, 0);
      B.add(drape(subdivide(hem, 1), fox, 0.0052), '#fff0d8');
      B.add(loopTube(ringPts(fox, 0.304, 0, 0.012, 24, 0.004), 0.0075, 5), (p, n, o) => o.set('#c8323a').multiplyScalar(0.85 + 0.15 * Math.sin(Math.atan2(p.x, p.z) * 18 + p.y * 300)));
      // the granary key held crossways in its mouth
      B.at([0, 0.343, 0.132], 0, () => {
        const sh = G.cyl(0.0058, 0.0058, 0.15, 8); sh.rotateZ(PI / 2); B.add(sh, metalP(GOLD));
        put(B, G.torus(0.02, 0.0065, 6, 16), -0.097, 0, 0, metalP(GOLD));
        for (const [x, h] of [[0.058, 0.022], [0.071, 0.015]]) sbox(B, 0.009, h, 0.011, 0.002, x, -h, 0, metalP(GOLD));
        ball(B, 0.009, -0.071, 0, 0, '#ffd870', [1.3, 1, 1], 8);
      });
    });
  },

  incenseBurner(B) {
    // antique bronze: a warm brown with soft gold where the light catches, dark underneath, verdigris in the hollows
    const bronze = (p, n, o) => {
      o.set('#7a5230').lerp(col('#d4a462'), clamp(n.y * 0.5 + n.x * 0.2 + 0.05) * 0.45).lerp(col('#3a2414'), clamp(-n.y * 0.7) * 0.55);
      const v = nz(p.x * 70 + p.z * 35, p.y * 70); if (v > 0.25) o.lerp(col('#5f9a84'), clamp((v - 0.25) * 2) * 0.45 * clamp(0.8 - n.y));
    };
    const brass = (p, n, o) => o.set('#c89a50').lerp(col('#f4d48c'), clamp(n.y * 0.6 + 0.2) * 0.6);
    // a round black-lacquer stand with a gold line
    lathe(B, [[0.001, 0], [0.098, 0], [0.108, 0.006], [0.11, 0.018], [0.104, 0.026], [0.09, 0.028], [0.001, 0.028]], 26, 0, 0, 0, (p, n, o) => o.set(n.y > 0.8 ? '#5a3428' : '#3e241c').lerp(col('#9a6454'), clamp(n.y) * 0.18));
    { const r = G.torus(0.111, 0.0025, 3, 34); r.rotateX(PI / 2); put(B, r, 0, 0.013, 0, GOLD); }
    // the burner: a round belly with a beaded band, three bowed legs on round paws, two loop ears on the rim
    const prof = [[0.001, 0.048], [0.04, 0.048], [0.062, 0.06], [0.076, 0.082], [0.079, 0.1], [0.072, 0.116], [0.064, 0.124], [0.066, 0.13], [0.075, 0.134], [0.075, 0.141], [0.062, 0.141]];
    lathe(B, prof, 28, 0, 0, 0, bronze);
    { const r = G.torus(0.0795, 0.0035, 4, 30); r.rotateX(PI / 2); put(B, r, 0, 0.093, 0, brass); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + 0.26; ball(B, 0.0042, Math.sin(a) * 0.08, 0.1, Math.cos(a) * 0.08, brass, 1, 6); }
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU, dx = Math.sin(a), dz = Math.cos(a);
      curve(B, [[dx * 0.045, 0.06, dz * 0.045], [dx * 0.068, 0.05, dz * 0.068], [dx * 0.078, 0.036, dz * 0.078]], t => 0.014 - t * 0.003, bronze, { radial: 8, n: 6, cap: false });
      ball(B, 0.015, dx * 0.08, 0.04, dz * 0.08, bronze, [1, 0.8, 1], 10);
      for (const s of [-1, 1]) ball(B, 0.0055, dx * 0.091 + dz * s * 0.006, 0.033, dz * 0.091 - dx * s * 0.006, bronze, 1, 6);
    }
    for (const sx of [-1, 1]) {
      const ear = G.torus(0.02, 0.0062, 6, 14, PI); put(B, ear, sx * 0.068, 0.141, 0, bronze);
      for (const s of [-1, 1]) ball(B, 0.007, sx * 0.068 + s * 0.02, 0.141, 0, bronze, 1, 6);
    }
    // the domed lid: a brass band, two rings of round piercings, a lotus-bud finial
    const lid = [[0.072, 0.138], [0.073, 0.147], [0.067, 0.16], [0.054, 0.176], [0.034, 0.187], [0.012, 0.192], [0.001, 0.193]];
    lathe(B, [[0.001, 0.139], ...lid], 28, 0, 0, 0, bronze);
    { const r = G.torus(0.074, 0.0035, 4, 30); r.rotateX(PI / 2); put(B, r, 0, 0.145, 0, brass); }
    const Rf = profR(lid);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU;
      B.add(wrapLathe(ellD(0.0046, 0.0046, 10, 1).translate(0, 0.164, 0), Rf, a, 0.0012), '#3a2618');
      B.add(wrapLathe(ellD(0.003, 0.003, 8, 1).translate(0, 0.179, 0), Rf, a + PI / 9, 0.0012), '#3a2618');
    }
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, g = G.sph(1, 8, 5); g.scale(0.008, 0.004, 0.014); g.translate(0, 0, 0.011); g.rotateX(-0.5); g.rotateY(a); put(B, g, 0, 0.194, 0, brass); }
    lathe(B, [[0.001, 0.19], [0.011, 0.193], [0.014, 0.2], [0.011, 0.209], [0.005, 0.217], [0.001, 0.221]], 12, 0, 0, 0, brass);
    // the incense smoke: two translucent curls drifting up (the fountain-jet material: see-through, slowly flowing)
    const smoke = (p, n, o) => o.set('#bdb6cc').lerp(col('#f4f2fa'), clamp((p.y - 0.2) / 0.14) ** 0.7);
    B.add(curlStrip([[0, 0.219, 0], [0.004, 0.238, 0.003], [0.017, 0.262, 0.0], [0.014, 0.288, -0.011], [-0.012, 0.306, -0.006], [-0.022, 0.328, 0.01], [0.0, 0.348, 0.018], [0.018, 0.36, 0.01]], t => 0.002 + 0.017 * Math.sin(PI * Math.min(1, t * 1.1)) ** 1.1 * (1 - 0.3 * t), { twist: 3.6 }), smoke, 'jet');
    B.add(curlStrip([[0.044, 0.17, 0.04], [0.05, 0.19, 0.046], [0.066, 0.214, 0.04], [0.062, 0.238, 0.026], [0.048, 0.256, 0.03]], t => 0.0015 + 0.011 * Math.sin(PI * t) * (1 - 0.3 * t), { twist: 2.6, n: 18 }), smoke, 'jet');
  },

};

// =================================================================== Bamboo Grove: Usagi's planter and Pan's plush
const BAMBOO2 = {
  hangingPlanter(B, d) {
    const top = d.h, rope = '#efe0bc';
    const ropeP = (p, n, o) => o.set(rope).multiplyScalar(0.84 + 0.16 * (0.5 + 0.5 * Math.sin(p.y * 260 + Math.atan2(n.x, n.z) * 2)));
    // the ceiling mount: a turned wooden plate with two brass screws, a brass screw-eye
    lathe(B, [[0.001, top - 0.026], [0.05, top - 0.026], [0.062, top - 0.021], [0.068, top - 0.01], [0.07, top], [0.001, top]], 22, 0, 0, 0, (p, n, o) => { const r = Math.hypot(p.x, p.z); o.set(n.y < -0.8 ? (Math.sin(r * 260) > 0.4 ? '#d49a62' : '#e0aa70') : '#b87a48'); });
    for (const s of [-1, 1]) ball(B, 0.0065, s * 0.042, top - 0.027, 0, '#e8c060', [1, 0.45, 1], 8);
    cyl(B, 0.0055, 0.0055, 0.02, 6, 0, top - 0.046, 0, '#d8a840');
    put(B, G.torus(0.014, 0.0045, 6, 14), 0, top - 0.059, 0, '#d8a840');
    // a rope loop through the eye, a wrapped gathering knot, three knotted strands down to the basket
    const lp = G.torus(0.012, 0.0055, 6, 12); lp.rotateY(PI / 2); put(B, lp, 0, top - 0.078, 0, ropeP);
    const kY = top - 0.13;
    B.add(quadPaint(G.lathe([[0.001, kY - 0.026], [0.012, kY - 0.026], [0.019, kY - 0.016], [0.02, kY + 0.016], [0.013, kY + 0.03], [0.006, kY + 0.04], [0.001, kY + 0.042]], 12), 7, (i, j, o) => o.set(j % 2 ? '#e6d4ac' : rope)), null);
    const yR = 0.34, Rr = 0.152, yB = 0.2, ang = [PI / 3, PI, 5 * PI / 3];
    for (const a of ang) {
      const dx = Math.sin(a), dz = Math.cos(a), A = V(dx * 0.012, kY - 0.026, dz * 0.012), Bp = V(dx * (Rr + 0.006), yR + 0.004, dz * (Rr + 0.006));
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(A.clone().lerp(Bp, t)); }
      // the strand continues round the basket's belly to a gather under it
      pts.push(V(dx * 0.162, 0.3, dz * 0.162), V(dx * 0.148, 0.25, dz * 0.148), V(dx * 0.115, 0.214, dz * 0.115), V(dx * 0.05, 0.19, dz * 0.05), V(dx * 0.012, 0.175, dz * 0.012));
      B.add(tube(new THREE.CatmullRomCurve3(pts).getPoints(15).map(p => ({ p, r: 0.0058 })), 5, false), ropeP);
      for (const t of [0.42, 0.68]) { const q = A.clone().lerp(Bp, t); ball(B, 0.0115, q.x, q.y, q.z, ropeP, [1, 1.25, 1], 7); }
    }
    // the tassel under the basket: a wrapped gather and a soft fringe
    cyl(B, 0.017, 0.015, 0.03, 12, 0, 0.152, 0, (p, n, o) => o.set(Math.sin(p.y * 600) > 0 ? '#e6d4ac' : rope));
    B.add(quadPaint(G.lathe([[0.012, 0.153], [0.024, 0.13], [0.03, 0.08], [0.032, 0.035], [0.026, 0.018], [0.012, 0.01], [0.001, 0.009]], 14), 7, (i, j, o) => o.set(i % 2 ? '#f4e8cc' : '#e2cfa4').multiplyScalar(j > 4 ? 0.94 : 1)), null);
    // the woven basket: a checker weave, darker inside, a fat braided rim
    const bp = [[0.001, yB], [0.07, yB], [0.096, yB + 0.005], [0.12, yB + 0.02], [0.138, yB + 0.05], [0.148, yB + 0.09], [0.152, yB + 0.13], [0.152, yR], [0.14, yR], [0.14, yB + 0.11], [0.001, yB + 0.11]];
    B.add(quadPaint(G.lathe(bp, 24), bp.length, (i, j, o) => { if (j >= 7) { o.set('#9a7448'); return; } o.set((i + j) % 2 ? '#e8c890' : '#c9a066').multiplyScalar(0.92 + 0.08 * (j / 6)); }), null);
    const rim = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; rim.push({ p: V(Math.sin(a) * 0.15, yR + 0.003, Math.cos(a) * 0.15), r: 0.0115 }); }
    B.add(tube(rim, 5, false), (p, n, o) => o.set(Math.floor(((Math.atan2(p.x, p.z) / TAU + 1) % 1) * 56 + (n.y > 0 ? 0.5 : 0)) % 2 ? '#f0d8a0' : '#d4b070'));
    put(B, G.disc(0.142, 22).rotateX(-PI / 2), 0, yR - 0.008, 0, '#5a3e30');
    // the ivy: a leafy mound in the pot and six vines spilling over the rim
    const greens = ['#3f8a44', '#4f9a4c', '#5aa856', '#3a7a40', '#68b45e'], tipC = col('#a8d888');
    const leaf = (s, ci) => { const g = ivyLeafGeo(s), c0 = col(greens[ci % greens.length]); paint(g, (p, n, o) => o.copy(c0).lerp(tipC, clamp(p.length() / s - 0.55) * 0.35).multiplyScalar(0.9 + 0.16 * clamp(n.y * 0.5 + 0.5))); return g; };
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996, rr = 0.012 + (i % 3) * 0.042, s = 0.074 + (i % 4) * 0.01, g = leaf(s, i);
      g.rotateX(0.45 + rr * 9.5); g.rotateY(a); g.translate(Math.sin(a) * rr, yR - 0.006 + (0.02 - rr * 0.1), Math.cos(a) * rr);
      B.add(g, null, 'leaf');
    }
    for (let v = 0; v < 7; v++) {
      const a = v / 7 * TAU + 0.35, dx = Math.sin(a), dz = Math.cos(a), yEnd = [0.03, 0.15, 0.06, 0.2, 0.09, 0.12, 0.05][v], sw = (v % 2 ? 1 : -1) * 0.02;
      const P0 = [[dx * 0.09, yR, dz * 0.09], [dx * 0.15, yR + 0.025, dz * 0.15], [dx * 0.178, yR - 0.01, dz * 0.178], [dx * 0.186 + dz * sw, (yR + yEnd) / 2, dz * 0.186 - dx * sw], [dx * 0.19 - dz * sw * 0.5, yEnd, dz * 0.19 + dx * sw * 0.5]];
      curve(B, P0, 0.0034, '#4a7a34', { radial: 3, n: 12, k: 'leaf' });
      const C3 = new THREE.CatmullRomCurve3(P0.map(p => V(...p))), nL = Math.round(5 + (yR - yEnd) * 21);
      for (let i = 1; i <= nL; i++) {
        const t = 0.16 + 0.84 * i / nL, q = C3.getPoint(t), s = 0.062 - t * 0.016, g = leaf(s, i + v), side = i % 2 ? 1 : -1;
        g.rotateZ(PI + side * 0.75); g.rotateX(0.25); g.rotateY(a + side * 0.25); g.translate(q.x + dx * 0.006, q.y, q.z + dz * 0.006);
        B.add(g, null, 'leaf');
      }
    }
  },

  pandaPlush(B) {
    const W = '#fbf6ee', K = '#3c3644', pink = '#ffb0c4';
    // the plush, sculpted soft: a pear body and a big head (white), arms with a shoulder band and legs (black)
    const body = cutY(sU(0.022,
      sE([0, 0.088, -0.008], [0.094, 0.09, 0.084]),
      sE([0, 0.208, 0.006], [0.09, 0.076, 0.08]),
      sE([0, 0.186, 0.07], [0.036, 0.026, 0.024])), 0);
    B.add(mold(body, [-0.11, -0.004, -0.1], [0.11, 0.29, 0.104], 0.0095, 1450), fuzzP(W));
    const arms = sU(0.024,
      SDF.tube([[0.066, 0.152, -0.012], [0.088, 0.11, 0.05], [0.018, 0.076, 0.1]], [0.033, 0.031, 0.03]),
      SDF.tube([[-0.066, 0.152, -0.012], [-0.088, 0.13, 0.05], [-0.058, 0.124, 0.096]], [0.033, 0.031, 0.029]),
      sE([0, 0.152, -0.014], [0.074, 0.027, 0.07]));
    B.add(mold(arms, [-0.128, 0.03, -0.095], [0.128, 0.19, 0.138], 0.0095, 700), fuzzP(K, 0.06));
    const legs = cutY(sU(0.01, sE([0.056, 0.034, 0.06], [0.04, 0.034, 0.05]), sE([-0.056, 0.034, 0.06], [0.04, 0.034, 0.05])), 0);
    B.add(mold(legs, [-0.1, -0.004, 0.0], [0.1, 0.072, 0.115], 0.008, 380), fuzzP(K, 0.06));
    for (const s of [-1, 1]) {
      ball(B, 0.031, s * 0.064, 0.272, -0.01, fuzzP(K, 0.06), [1, 1, 0.72], 11);
      dot(B, legs, s * 0.056, 0.03, 0.019, 0.016, 0.005, pink, { out: 0.6 });
      for (const k of [-1, 0, 1]) dot(B, legs, s * 0.056 + k * 0.016, 0.054 - Math.abs(k) * 0.004, 0.0065, 0.0058, 0.004, pink, { out: 0.6, seg: 7 });
      // eye patches, shiny bead eyes, blush
      dot(B, body, s * 0.034, 0.211, 0.025, 0.018, 0.006, fuzzP(K, 0.05), { rot: -s * 0.55, out: 0.6, seg: 14 });
      dot(B, body, s * 0.032, 0.214, 0.0095, 0.0105, 0.006, '#141018', { lift: 0.0035, out: 0.7 });
      dot(B, body, s * 0.029, 0.218, 0.0032, 0.0032, 0.002, '#ffffff', { lift: 0.0085, out: 0.8, seg: 6 });
      dot(B, body, s * 0.06, 0.186, 0.013, 0.008, 0.003, '#ffaabd', { out: 0.6 });
    }
    dot(B, body, 0, 0.194, 0.011, 0.0075, 0.006, K, { out: 0.7 });
    B.add(drape(subdivide(stroke([[-0.012, 0.183], [-0.006, 0.178], [0, 0.182], [0.006, 0.178], [0.012, 0.183]], 0.0028, 1, 0, 0, 10), 1), body, 0.0012), INK);
    // the bamboo shoot it hugs: a chubby stalk with a leafy top
    // (held slantwise in the hug, so its leafy top sits by the cheek and leaves the face clear)
    B.at([0.03, 0.012, 0.11], 0, () => {
      const bam = bambooPole(0.2, 0.018, { node: 0.067, c: '#8ccf68', nodeC: '#5aa048', cut: '#e8f4b0', seg: 10 });
      B.add(bam, null);
      for (const [a, L] of [[-0.9, 0.072], [0.2, 0.066], [1.3, 0.058]]) {
        const g = bladeGeo(L, 0.026, { bend: 0.9, seg: 4, base: 0.3 }); g.rotateY(a); g.translate(0, 0.198, 0);
        B.add(g, (p, n, o) => o.set('#5aae4a').lerp(col('#a8dc78'), clamp((p.y - 0.2) / 0.05) * 0.5), 'leaf');
      }
    }, 1, 0.08, 0.6);
    // a pink bow on one ear and a sewn-in tag
    B.at([0.075, 0.26, 0.012], -0.35, () => bow(B, { s: 0.055, color: '#ff8fb0' }), 1, 0, -0.5);
    B.at([-0.088, 0.03, -0.028], -PI / 2 + 0.5, () => { sbox(B, 0.032, 0.022, 0.004, 0.0015, 0.014, 0, 0, '#fffaf2'); decal(B, 'heart', 0.014, 0.016, 0.011, 0.0025, { colors: ['#ff7aa0'] }); });
  },
};

// =================================================================== Maple Hollow: the pumpkin lamp
const NL = 9;
const lobe = a => 1 - 0.075 * (1 - Math.abs(Math.cos(NL * a / 2))) ** 2.2;
const MAPLE2 = {
  pumpkinLamp(B) {
    const raw = [[0.001, 0.024], [0.06, 0.004], [0.12, 0.012], [0.165, 0.045], [0.192, 0.095], [0.202, 0.15], [0.196, 0.205], [0.172, 0.255], [0.128, 0.292], [0.07, 0.31], [0.03, 0.312], [0.001, 0.298]];
    const prof = KIT.spline2(raw, 16), r0 = profR(prof.slice(0, 14));
    // the pumpkin: a ribbed lathe (nine lobes), its seam at the back
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), 48, PI, TAU);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), k = lobe(Math.atan2(x, z)); pp.setX(i, x * k); pp.setZ(i, z * k); }
    g.computeVertexNormals();
    B.add(g, (p, n, o) => {
      const a = Math.atan2(p.x, p.z), u = Math.abs(Math.cos(NL * a / 2));
      o.set('#f0862a').lerp(col('#ffb454'), clamp(n.y * 0.7 + 0.1) * 0.55).lerp(col('#c4561a'), clamp(0.35 - u) * 1.6).lerp(col('#b8541c'), clamp(-n.y - 0.3) * 0.5);
      o.multiplyScalar(0.96 + 0.05 * Math.sin(a * NL * 3 + p.y * 30));
    });
    // the face, carved: a pale cut rim, deep-orange walls and a bright candle heart (glow) in every hole
    const wrapP = (geo, off, sub = 1) => {
      geo = subdivide(geo, sub);
      const p = geo.attributes.position, nn = geo.attributes.normal, e = 0.002;
      const S = (x, y) => { const r = r0(y), a = x / r, R = r * lobe(a); return V(R * Math.sin(a), y, R * Math.cos(a)); };
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), P0 = S(x, y), n = S(x + e, y).sub(S(x - e, y)).cross(S(x, y + e).sub(S(x, y - e))).normalize();
        const o = off + p.getZ(i);
        p.setXYZ(i, P0.x + n.x * o, P0.y + n.y * o, P0.z + n.z * o); nn.setXYZ(i, n.x, n.y, n.z);
      }
      return geo;
    };
    const eyeS = (sx, e) => roundPoly([[sx * 0.064, 0.254 - e * 1.6], [sx * 0.064 - 0.036 + e * 1.3, 0.184 + e * 0.8], [sx * 0.064 + 0.036 - e * 1.3, 0.184 + e * 0.8]], 0.015 - e * 0.4);
    const noseS = e => roundPoly([[0, 0.168 - e * 1.4], [-0.018 + e, 0.142 + e * 0.6], [0.018 - e, 0.142 + e * 0.6]], 0.005);
    // a wide grin: the lower lip a deep curve, the upper one shallower with two square teeth left uncut
    const mouthS = e => {
      const w = 0.122 - e * 1.8, pts = [], N = 14, lo = x => 0.128 - 0.118 * (1 - (x / 0.122) ** 2) + e, up = x => 0.128 - 0.03 * (1 - (x / 0.122) ** 2) - e;
      for (let i = 0; i <= N; i++) { const x = -w + 2 * w * i / N; pts.push([x, lo(x)]); }
      // the upper lip, right to left: arc points, stepping down round each tooth (the teeth stay uncut skin)
      const tw = 0.014 + e, tb = up(0.042) - 0.021 - e * 0.4, inT = x => [-0.042, 0.042].some(tx => Math.abs(x - tx) <= tw);
      const ev = [];
      for (let i = N; i >= 0; i--) ev.push({ x: -w + 2 * w * i / N, k: 0 });
      for (const tx of [0.042, -0.042]) ev.push({ x: tx + tw, k: 1 }, { x: tx - tw, k: 2 });
      ev.sort((a, b) => b.x - a.x);
      for (const { x, k } of ev) {
        if (k === 0) { if (!inT(x)) pts.push([x, up(x)]); }
        else if (k === 1) pts.push([x, up(x)], [x, tb]);
        else pts.push([x, tb], [x, up(x)]);
      }
      return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    };
    const holes = [e => eyeS(-1, e), e => eyeS(1, e), noseS, mouthS];
    // each hole as three non-overlapping bands at one depth (stacked decals shadow-flicker): a pale cut rim, deep-orange
    // walls and the bright candle heart
    const band = (h, e0, e1) => { const s = h(e0); if (e1 != null) s.holes.push(h(e1)); return new THREE.ShapeGeometry(s, 3); };
    for (const h of holes) {
      const big = h === mouthS;
      B.add(wrapP(band(h, -0.0065, 0), 0.0016, 1), '#ffcf7c');
      B.glow(wrapP(band(h, 0, 0.011), 0.0016, 1), '#e8661a', { flicker: 1, tint: 1 });
      B.glow(wrapP(band(h, 0.011, null), 0.0016, big ? 2 : 1), '#ffe07a', { flicker: 1, tint: 1 });
    }
    // the lid seam: a zigzag cut ring round the stem
    const zz = []; for (let k = 0; k <= 36; k++) { const a = k / 36 * TAU, y = 0.288 + (k % 2 ? 0.007 : -0.007), r = r0(y) * lobe(a) + 0.0008; zz.push({ p: V(r * Math.sin(a), y, r * Math.cos(a)), r: 0.0032 }); }
    B.add(tube(zz, 4, false), '#9a3a12');
    // a chunky ridged stem bending over, a curly vine and a broad leaf
    const st = G.lathe([[0.001, 0], [0.036, 0], [0.032, 0.02], [0.025, 0.05], [0.022, 0.08], [0.027, 0.094], [0.001, 0.096]], 12), sp = st.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), k = 1 + 0.14 * Math.cos(5 * Math.atan2(x, z)); sp.setXYZ(i, x * k + 0.32 * y * y, y, z * k); }
    st.computeVertexNormals();
    put(B, st, 0, 0.296, 0, (p, n, o) => { o.set('#6a8a3a').lerp(col('#a8844a'), clamp((p.y - 0.31) / 0.07)); if (n.y > 0.8 && p.y > 0.38) o.set('#d8c890'); o.multiplyScalar(0.9 + 0.12 * clamp(n.x * 0.5 + 0.5)); });
    const vine = []; for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * 3.4 * PI, r = 0.05 * (1 - 0.68 * t); vine.push([0.035 + Math.cos(a) * r - 0.05 * (1 - t) * 0, 0.312 + t * 0.07 + Math.sin(t * PI) * 0.01, 0.03 + Math.sin(a) * r]); }
    vine.unshift([0.015, 0.3, 0.005]);
    curve(B, vine, t => 0.0062 - t * 0.0028, (p, n, o) => o.set('#5a9a38').lerp(col('#9ad064'), clamp(n.y) * 0.35), { radial: 5, n: 0, k: 'leaf' });
    const lf = blossomGeo(0.085, 5, 0.72, true, 3), lp = lf.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), r = Math.hypot(x, z); lp.setY(i, -r * r * 2.2); }
    lf.computeVertexNormals();
    const lg = twoSided(lf); paint(lg, (p, n, o) => { const r = Math.hypot(p.x, p.z), a = Math.atan2(p.x, p.z); o.set('#4f9a3c').lerp(col('#8cc864'), clamp(1 - r / 0.07) * 0.45); if (Math.abs(Math.sin(a * 2.5)) < 0.12 && r > 0.01) o.lerp(col('#b8e090'), 0.5); });
    lg.rotateZ(0.32); lg.rotateX(-0.18); lg.translate(-0.07, 0.3, -0.045); B.add(lg, null, 'leaf');
    // a little cream pumpkin and two fallen maple leaves at its feet
    B.at([0.17, 0, 0.165], 0.4, () => {
      const m = G.lathe(KIT.spline2([[0.001, 0.008], [0.04, 0.0], [0.058, 0.022], [0.06, 0.042], [0.045, 0.064], [0.02, 0.07], [0.001, 0.064]], 9), 21), mp = m.attributes.position;
      for (let i = 0; i < mp.count; i++) { const k = 1 - 0.09 * (1 - Math.abs(Math.cos(3 * Math.atan2(mp.getX(i), mp.getZ(i))))) ** 2; mp.setX(i, mp.getX(i) * k); mp.setZ(i, mp.getZ(i) * k); }
      m.computeVertexNormals();
      B.add(m, (p, n, o) => o.set('#f6e8c8').lerp(col('#d8c49a'), clamp(0.4 - Math.abs(Math.cos(3 * Math.atan2(p.x, p.z)))) * 1.2).multiplyScalar(0.92 + 0.1 * clamp(n.y)));
      curve(B, [[0, 0.062, 0], [0.004, 0.08, 0.002], [0.012, 0.088, 0.0]], 0.006, '#7a8a48', { radial: 6, n: 5 });
    });
    for (const [x, z, R, c, ry] of [[-0.16, 0.165, 0.062, '#e2502a', 0.7], [0.19, -0.15, 0.054, '#f0a030', 2.4]]) B.at([x, 0.002, z], ry, () => mapleLeaf(B, R, c));
  },
};

// =================================================================== Tidepool: Kero's lily tub and frog fountain
/** a koi just under the water (the water bucket gives it the surface's ripples and glints), heading +x */
function koi(B, s, kind) {
  B.push([0, 0, 0], 0, s);
  const water = col('#5aa8b8'), pat = (p, o) => {
    const x = p.x / 0.07, v = nz(p.x * 40 + (kind ? 9 : 0), p.z * 40);
    if (kind === 0) o.set(v > 0.05 || x > 0.75 ? '#ff5a2e' : '#fffaf2'); // kohaku: white with red patches
    else o.set(v > 0.25 ? '#2a2630' : x > 0.6 ? '#ffd8a0' : '#ff9a2a'); // orange with ink spots
  };
  const g = G.sph(1, 14, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const X = p.getX(i), tp = X < 0 ? 1 - 0.62 * X * X : 1 - 0.18 * X * X; p.setXYZ(i, X * 0.07, p.getY(i) * 0.012 * tp, p.getZ(i) * 0.026 * tp); }
  g.computeVertexNormals();
  B.add(g, (pp, n, o) => { pat(pp, o); o.lerp(water, 0.12); }, 'water');
  const tail = new THREE.Shape(); tail.moveTo(-0.055, 0); tail.quadraticCurveTo(-0.08, 0.028, -0.105, 0.034); tail.quadraticCurveTo(-0.092, 0.0, -0.105, -0.034); tail.quadraticCurveTo(-0.08, -0.028, -0.055, 0);
  const tg = new THREE.ShapeGeometry(tail, 6); tg.rotateX(-PI / 2); tg.translate(0, 0.0045, 0);
  B.add(tg, (pp, n, o) => o.set(kind ? '#ffb060' : '#fff0e6').lerp(water, 0.35), 'water');
  for (const s2 of [-1, 1]) { const f = G.disc(1, 10); f.scale(0.016, 0.009, 1); f.rotateZ(s2 * 0.5); f.rotateX(-PI / 2); f.translate(0.03, 0.0045, s2 * 0.026); B.add(f, (pp, n, o) => o.set(kind ? '#ffb060' : '#fff0e6').lerp(water, 0.35), 'water'); }
  B.pop();
}
const TIDE2 = {
  lilyTub(B) {
    const wy = 0.455;
    // the glazed tub: an unglazed foot, a deep teal glaze fading up to celadon, a cream rim glaze that runs in drips
    const raw = [[0.001, 0.0], [0.27, 0.0], [0.296, 0.012], [0.3, 0.038], [0.292, 0.052], [0.325, 0.078], [0.388, 0.15], [0.43, 0.24], [0.452, 0.33], [0.458, 0.4], [0.464, 0.45], [0.474, 0.478], [0.481, 0.498], [0.476, 0.512], [0.462, 0.517], [0.448, 0.51], [0.442, 0.49], [0.438, 0.46], [0.432, 0.42], [0.001, 0.42]];
    const outer = profR(raw.slice(0, 13));
    lathe(B, raw, 36, 0, 0, 0, (p, n, o) => {
      const a = Math.atan2(p.x, p.z), out = n.x * p.x + n.z * p.z > 0 && p.y < 0.5;
      if (p.y < 0.056 && out) { o.set('#c48a62').multiplyScalar(0.9 + 0.12 * nz(a * 6, p.y * 40)); return; }
      if (!out && p.y < 0.505) { o.set('#2c6a7c').lerp(col('#4f94a2'), clamp((p.y - 0.43) / 0.07)); return; }
      const t = clamp((p.y - 0.056) / 0.42);
      o.set('#2f5f86').lerp(col('#3f8fa8'), clamp(t * 1.5)).lerp(col('#8ccdc8'), clamp(t * 1.7 - 0.8));
      if (p.y > 0.458) o.set('#f4eedc').lerp(col('#ffffff'), clamp(n.y) * 0.3);
      o.multiplyScalar(0.95 + 0.07 * clamp(n.y + 0.3) + 0.03 * nz(p.x * 26 + p.y * 8, p.z * 26));
    });
    // throwing rings and the rim drips
    for (const y of [0.2, 0.31]) { const r = G.torus(outer(y) + 0.001, 0.0045, 3, 36); r.rotateX(PI / 2); put(B, r, 0, y, 0, (p, n, o) => o.set('#5aa4b4').lerp(col('#9ad8d4'), clamp(n.y) * 0.4)); }
    for (let k = 0; k < 13; k++) {
      const a = k / 13 * TAU + 0.16 * Math.sin(k * 3.1), Ld = 0.024 + 0.06 * (0.5 + 0.5 * Math.sin(k * 2.3)) ** 1.5, w = 0.026 + 0.012 * Math.sin(k * 1.7);
      const dg = mergeG([ribbon([[0, 0.464], [0, 0.462 - Ld * 0.5], [0, 0.462 - Ld]], t => w * (1 - 0.52 * Math.min(1, t * 1.7)), { caps: false }), new THREE.CircleGeometry(w * 0.34, 12).translate(0, 0.462 - Ld, 0)]);
      B.add(wrapLathe(dg, outer, a, 0.0012), (p, n, o) => o.set('#f4eedc').lerp(col('#d8e8e0'), clamp((0.46 - p.y) / 0.08) * 0.4));
    }
    put(B, G.disc(0.442, 40).rotateX(-PI / 2), 0, wy, 0, '#4f9cb2', 'water');
    // two koi gliding just under the surface
    B.at([-0.1, wy - 0.0095, 0.17], 0.5, () => koi(B, 1.45, 0));
    B.at([0.11, wy - 0.0095, -0.04], 2.6, () => koi(B, 1.3, 1));
    for (const [x, z, r] of [[-0.02, 0.24, 0.05], [0.25, -0.1, 0.04]]) put(B, new THREE.RingGeometry(r * 0.86, r, 28).rotateX(-PI / 2), x, wy + 0.0007, z, '#cfeef2', 'water');
    // lily pads (thick, notched, veined, a few with upturned rims)
    const pads = [[-0.2, -0.13, 0.115, 0.4, 1], [0.17, 0.18, 0.1, 2.2, 0], [0.26, -0.2, 0.085, 4.0, 1], [-0.06, -0.3, 0.075, 5.1, 0], [-0.3, 0.12, 0.08, 1.2, 1], [0.05, 0.06, 0.06, 3.3, 0]];
    for (const [x, z, r, rot, up] of pads) {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, r, 0.22, TAU - 0.22, false); s.lineTo(0, 0);
      const g = extrude(s, 0.003, 0.0025, 6); g.rotateX(-PI / 2);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const e = Math.hypot(p.getX(i), p.getZ(i)) / r; p.setY(i, p.getY(i) + (up ? 0.012 * e ** 5 : 0) - 0.004 * e * e); }
      g.computeVertexNormals(); g.rotateY(rot);
      put(B, g, x, wy + 0.001, z, (pp, n, o) => {
        if (n.y < 0.3) { o.set('#b86a5a'); return; }
        const dx = pp.x - x, dz = pp.z - z, e = Math.hypot(dx, dz) / r, a = Math.atan2(dx, dz) - rot;
        o.set('#4f9a44').lerp(col('#86c868'), clamp(1 - e) * 0.5);
        if (Math.abs(Math.sin(a * 5.5)) < 0.1 && e > 0.12) o.lerp(col('#a8dc88'), 0.55);
      });
    }
    // a pink water lily on the big pad, and a bud
    B.at([-0.2, wy + 0.004, -0.13], 0.3, () => {
      for (const [n, L, w, el, c0, c1, y0, r0] of [[9, 0.072, 0.034, 0.32, '#ff86ac', '#fff0f4', 0, 0.006], [8, 0.062, 0.03, 0.72, '#ff9cc0', '#fff4f8', 0.005, 0.004], [6, 0.045, 0.024, 1.08, '#ffb4cc', '#ffffff', 0.01, 0.002]]) {
        for (let i = 0; i < n; i++) {
          const az = i / n * TAU + y0 * 60, g = bladeGeo(L, w, { bend: -0.25, seg: 3, fold: 0.32, base: 0.35 });
          const C0 = col(c0), C1 = col(c1); paint(g, (p, nn, o) => o.copy(C0).lerp(C1, clamp(p.y / L) ** 1.2 * 0.85));
          g.rotateX(PI / 2 - el); g.rotateY(az); g.translate(Math.sin(az) * r0, y0, Math.cos(az) * r0); B.add(g, null);
        }
      }
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; pipe(B, [Math.sin(a) * 0.008, 0.01, Math.cos(a) * 0.008], [Math.sin(a) * 0.016, 0.03, Math.cos(a) * 0.016], 0.0025, '#ffd24a', { seg: 4 }); }
      ball(B, 0.011, 0, 0.018, 0, '#f4c43a', [1, 0.5, 1], 10);
    });
    B.at([0.2, wy, 0.04], 0, () => {
      curve(B, [[0, 0, 0], [0.01, 0.04, 0.005], [0.006, 0.075, 0.0]], 0.006, '#5a9a44', { radial: 5, n: 6 });
      lathe(B, [[0.001, 0.07], [0.016, 0.082], [0.018, 0.1], [0.01, 0.12], [0.001, 0.132]], 10, 0.006, 0, 0, (p, n, o) => o.set('#5aa04a').lerp(col('#ff8fb4'), clamp((p.y - 0.085) / 0.03)));
    });
    // a tiny frog on a pad
    B.at([0.17, wy + 0.006, 0.18], -0.5, () => {
      ball(B, 0.026, 0, 0.018, 0, (p, n, o) => o.set('#6cc04a').lerp(col('#d4f0a0'), clamp(-n.z * 0.2 + n.y * -0.6 + 0.2)), [1.2, 0.8, 1], 12);
      for (const s of [-1, 1]) {
        ball(B, 0.011, s * 0.016, 0.036, 0.012, '#7ccc58', 1, 8); ball(B, 0.0058, s * 0.017, 0.039, 0.021, INK, 1, 6); ball(B, 0.002, s * 0.015, 0.042, 0.026, '#ffffff', 1, 4);
        ball(B, 0.008, s * 0.026, 0.004, 0.018, '#6cc04a', [1, 0.5, 1.3], 6); ball(B, 0.006, s * 0.024, 0.02, 0.026, '#ff9eb4', [1, 0.6, 0.4], 6);
      }
    });
    // smooth river pebbles round the foot
    const peb = ['#d8d0c8', '#bcb4b8', '#e8e0d4', '#a8a4b0'];
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.5 + 0.2 * Math.sin(k * 5); pebble(B, 0.032 + 0.012 * Math.sin(k * 2.1), Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36, peb[k % 4], { ry: k, seg: 6 }); }
  },

  frogFountain(B) {
    // a round slate base with a mossy edge
    { const sl = stoneP('#8e98a2', { hi: '#c8d0d8', sc: 12 }), moss = col('#7cae5a'); lathe(B, [[0.001, 0], [0.214, 0], [0.228, 0.008], [0.226, 0.02], [0.214, 0.027], [0.001, 0.027]], 26, 0, 0, 0, (p, n, o) => { sl(p, n, o); const r = Math.hypot(p.x, p.z), m = (r - 0.196) * 60 + nz(p.x * 30, p.z * 30) * 0.8; if (m > 0 && n.y > -0.2) o.lerp(moss, clamp(m) * 0.75); }); }
    // a lumpy, mossy boulder at the back
    const rk = G.sph(1, 14, 10), rp = rk.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 1 + 0.1 * nz(x * 1.7 + 3, y * 1.7 + z * 1.3) + 0.05 * nz(x * 4, z * 4 + y * 3); rp.setXYZ(i, x * k * 0.115, Math.max(-0.75, y) * k * 0.1, z * k * 0.09); }
    rk.computeVertexNormals();
    put(B, rk, 0, 0.098, -0.118, mossStone('#bfb6ae', 0.45, 13));
    // the shell basin: a ribbed, scalloped clam opening up, pearly inside, and its water
    const sz = 0.085, sp = [[0.001, 0], [0.06, 0], [0.1, 0.012], [0.135, 0.035], [0.152, 0.058], [0.158, 0.071], [0.152, 0.077], [0.142, 0.072], [0.128, 0.056], [0.09, 0.04], [0.001, 0.034]];
    const sh = G.lathe(sp, 36), shp = sh.attributes.position;
    for (let i = 0; i < shp.count; i++) { const x = shp.getX(i), z = shp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z), w = Math.cos(a * 13); if (r > 0.05) { const k = (r - 0.05) / 0.11; shp.setX(i, x * (1 + 0.04 * w * k)); shp.setZ(i, z * (1 + 0.04 * w * k)); shp.setY(i, shp.getY(i) + 0.007 * w * k * k); } }
    sh.computeVertexNormals();
    put(B, sh, 0, 0.027, sz, (p, n, o) => {
      const a = Math.atan2(p.x, p.z - sz), w = Math.cos(a * 13), out = n.x * p.x + n.z * (p.z - sz) > 0 && n.y < 0.6;
      if (out) o.set('#f8c8b8').lerp(col('#fff0e4'), clamp(w) * 0.5).lerp(col('#ff9eb0'), clamp((p.y - 0.085) * 40));
      else o.set('#fff0ee').lerp(col('#ffd6e0'), clamp(Math.hypot(p.x, p.z - sz) / 0.15)).lerp(col('#e8f0ff'), clamp(n.y) * 0.25);
    });
    for (const s of [-1, 1]) ball(B, 0.024, s * 0.03, 0.04, sz - 0.15, '#f4c0b0', [1, 0.6, 0.7], 8);
    const wyF = 0.027 + 0.058;
    put(B, G.disc(0.128, 30).rotateX(-PI / 2), 0, wyF, sz, '#6cc0d4', 'water');
    put(B, new THREE.RingGeometry(0.022, 0.03, 20).rotateX(-PI / 2), 0, wyF + 0.0008, sz - 0.01, '#e4f8fc', 'water');
    put(B, new THREE.RingGeometry(0.046, 0.051, 24).rotateX(-PI / 2), 0, wyF + 0.0008, sz - 0.01, '#d4f2f8', 'water');
    // a lily pad with a blossom in the basin
    { const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, 0.034, 0.25, TAU - 0.25, false); s.lineTo(0, 0); const g = extrude(s, 0.002, 0.0015, 8); g.rotateX(-PI / 2); g.rotateY(2.2); put(B, g, 0.06, wyF + 0.001, sz + 0.05, (p, n, o) => o.set(n.y > 0.3 ? '#5aa84a' : '#b86a5a')); }
    { const f = blossomGeo(0.018, 6, 0.5); put(B, f, 0.064, wyF + 0.006, sz + 0.054, '#ffb0c8'); ball(B, 0.005, 0.064, wyF + 0.008, sz + 0.054, '#ffd84a', 1, 5); }
    // the stone frog on the boulder, spouting from a round "o" mouth
    const frog = SDF.subtract(cutY(sU(0.018,
      sE([0, 0.042, -0.008], [0.064, 0.045, 0.058]),
      sE([0, 0.07, 0.03], [0.06, 0.036, 0.047]),
      sS([0.032, 0.098, 0.034], 0.022), sS([-0.032, 0.098, 0.034], 0.022),
      sE([0.058, 0.026, -0.024], [0.029, 0.027, 0.048]), sE([-0.058, 0.026, -0.024], [0.029, 0.027, 0.048]),
      sRC([0.036, 0.046, 0.046], [0.045, 0.008, 0.072], 0.014, 0.012), sRC([-0.036, 0.046, 0.046], [-0.045, 0.008, 0.072], 0.014, 0.012),
      sE([0.047, 0.006, 0.08], [0.018, 0.007, 0.016]), sE([-0.047, 0.006, 0.08], [0.018, 0.007, 0.016])), 0), sS([0, 0.064, 0.082], 0.0115), 0.006);
    const FR = [0, 0.172, -0.122];
    B.at(FR, 0, () => {
      B.add(mold(frog, [-0.1, -0.004, -0.075], [0.1, 0.125, 0.1], 0.0068, 1350), (p, n, o) => {
        o.set('#9cb48a').lerp(col('#d8e0bc'), clamp(-n.y * 0.4 + (0.04 - p.y) * 8 + n.z * 0.3) * 0.5).lerp(col('#7a8c74'), clamp(n.y * 0.8 - 0.3) * 0.4);
        o.multiplyScalar(0.95 + 0.08 * nz(p.x * 90, p.y * 90 + p.z * 60));
        const m = Math.hypot(p.x, p.y - 0.064, Math.max(0, 0.082 - p.z) * 0.6); if (m < 0.016) o.lerp(col('#4a5450'), clamp((0.016 - m) / 0.006));
      });
      for (const s of [-1, 1]) {
        dot(B, frog, s * 0.034, 0.1, 0.0115, 0.0125, 0.007, INK, { out: 0.6 });
        dot(B, frog, s * 0.031, 0.104, 0.0034, 0.0034, 0.002, '#ffffff', { lift: 0.004, out: 0.8, seg: 6 });
        dot(B, frog, s * 0.044, 0.064, 0.011, 0.007, 0.003, '#f4a8b0', { out: 0.6 });
        B.add(drape(subdivide(stroke([[s * 0.014, 0.075], [s * 0.022, 0.072], [s * 0.028, 0.076]], 0.0025, 1, 0, 0, 6), 1), frog, 0.0012), '#5a6458');
      }
    });
    // the spout: an arc of water (jet) from the frog's mouth into the shell, a splash where it lands
    const M = V(FR[0], FR[1] + 0.064, FR[2] + 0.078), E = V(0, wyF + 0.004, sz - 0.01), arc = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18; arc.push({ p: V(0, M.y + (E.y - M.y) * t + 0.05 * Math.sin(t * PI) * (1 - t * 0.4), M.z + (E.z - M.z) * t), r: 0.0055 + 0.004 * t }); }
    B.add(tube(arc, 8, false), (p, n, o) => o.set('#bfeaf6').lerp(col('#ffffff'), clamp(n.y) * 0.4), 'jet');
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; ball(B, 0.0042, E.x + Math.sin(a) * 0.016, wyF + 0.009 + (k % 2) * 0.006, E.z + Math.cos(a) * 0.016, '#e8fbff', 1, 6, 'jet'); }
    // a little fern and two grass blades by the boulder, a few pebbles
    for (const [a, L] of [[0.9, 0.09], [1.6, 0.075], [0.3, 0.07]]) { const g = frondGeo(L, { el0: 1.2, el1: 0.1, W: 0.022, n: 7, seg: 6 }); paint(g, (p, n, o) => o.set('#4f9a48').lerp(col('#9ad070'), clamp(p.z / L) * 0.5)); g.rotateY(a); g.translate(0.09, 0.05, -0.14); B.add(g, null, 'leaf'); }
    for (const [a, L] of [[-0.6, 0.08], [-1.1, 0.065]]) { const g = bladeGeo(L, 0.012, { bend: 0.7, seg: 4 }); g.rotateY(a); g.translate(-0.1, 0.03, -0.1); B.add(g, '#5aa84a', 'leaf'); }
    for (const [x, z, r, c] of [[-0.15, 0.08, 0.018, '#d8d0c8'], [0.16, 0.06, 0.015, '#c4bcc4'], [-0.13, 0.13, 0.012, '#e8e0d4']]) pebble(B, r, x, 0.027, z, c);
  },
};

// =================================================================== Festival: Tanu's tanuki, the lucky cat, the yokai lantern
const FESTIVAL2 = {
  tanukiStatue(B) {
    const BT = 0.034;
    lathe(B, [[0.001, 0], [0.222, 0], [0.234, 0.01], [0.232, 0.025], [0.222, BT], [0.001, BT]], 22, 0, 0, 0, (p, n, o) => o.set(n.y > 0.8 ? '#8a5a3e' : '#6e4632').multiplyScalar(0.94 + 0.08 * nz(p.x * 30, p.z * 30)));
    // the tanuki, sculpted: stubby legs, a huge round belly, a plump chest, a round head with jowls and a muzzle,
    // arms bowed out, and a big fluffy tail behind
    const T = cutY(sU(0.012,
      sU(0.04,
        sE([0.088, 0.075, 0.0], [0.074, 0.08, 0.084]), sE([-0.088, 0.075, 0.0], [0.074, 0.08, 0.084]),
        sE([0, 0.235, 0.048], [0.18, 0.178, 0.17]),
        sE([0, 0.355, -0.018], [0.158, 0.155, 0.14]),
        sE([0, 0.542, 0.008], [0.142, 0.12, 0.126]),
        sE([0.084, 0.502, 0.05], [0.07, 0.054, 0.06]), sE([-0.084, 0.502, 0.05], [0.07, 0.054, 0.06]),
        sE([0, 0.497, 0.104], [0.058, 0.044, 0.046])),
      sE([0.09, 0.024, 0.07], [0.058, 0.026, 0.072]), sE([-0.09, 0.024, 0.07], [0.058, 0.026, 0.072]),
      SDF.tube([[0.146, 0.42, -0.01], [0.212, 0.33, 0.03], [0.2, 0.245, 0.112]], [0.05, 0.045, 0.042]), sS([0.196, 0.228, 0.124], 0.046),
      SDF.tube([[-0.146, 0.42, -0.01], [-0.205, 0.32, 0.02], [-0.19, 0.232, 0.085]], [0.05, 0.045, 0.042]), sS([-0.186, 0.218, 0.096], 0.047),
      SDF.tube([[0, 0.14, -0.13], [0.0, 0.07, -0.23], [0.05, 0.035, -0.282]], [0.07, 0.062, 0.034])), 0);
    const cream = col('#f4dcae'), mask = col('#3e2418'), dark = col('#583420'), headC = col('#c08a58');
    B.at([0, BT, 0], 0, () => {
      B.add(mold(T, [-0.28, -0.004, -0.33], [0.28, 0.68, 0.235], 0.0155, 2400), (p, n, o) => {
        o.set('#8e5636').lerp(col('#c48656'), clamp(n.y * 0.5 + 0.25) * 0.5).lerp(dark, clamp(-n.y * 0.5 - p.z * 2.4 - 0.05) * 0.6);
        o.lerp(headC, clamp((p.y - 0.43) * 14) * clamp(n.z + 0.6) * 0.8);
        o.multiplyScalar(0.95 + 0.07 * nz(p.x * 18 + p.y * 7, p.z * 18 - p.y * 5));
        const bx = p.x / 0.15, by = (p.y - 0.225) / 0.15;
        o.lerp(cream, clamp((1 - bx * bx - by * by) * 3) * clamp(n.z * 3));
        o.lerp(cream, clamp((1 - Math.hypot(p.x / 0.068, (p.y - 0.49) / 0.052)) * 2.5) * clamp(n.z * 2));
        for (const s of [-1, 1]) o.lerp(mask, clamp((1 - Math.hypot((p.x - s * 0.056) / 0.06, (p.y - 0.53) / 0.046)) * 2.4) * clamp(n.z * 2 + 0.3));
        if (p.z < -0.18) o.lerp(col('#4a2c20'), clamp((-0.2 - p.z) * 14) * 0.7);
      });
      // the bandit mask and the cream muzzle (glazed on, so they stay crisp), big round eyes glancing up and aside,
      // cheeky brows, a fat nose and a grin
      ball(B, 1, 0, 0.494, 0.108, (p, n, o) => o.set('#f4dcae').multiplyScalar(0.93 + 0.08 * clamp(n.y + 0.4)), [0.061, 0.046, 0.049], 12);
      for (const s of [-1, 1]) B.add(drape(subdivide(ell(0.05, 0.04, 14).rotateZ(-s * 0.3).translate(s * 0.054, 0.533, 0), 1), T, 0.0022), '#3e2418');
      for (const s of [-1, 1]) {
        dot(B, T, s * 0.05, 0.536, 0.027, 0.029, 0.012, '#fffaf2', { out: 0.6, seg: 14, lift: 0.002 });
        dot(B, T, s * 0.05 + 0.007, 0.541, 0.0145, 0.0158, 0.008, INK, { lift: 0.008, out: 0.6 });
        dot(B, T, s * 0.05 + 0.002, 0.548, 0.0048, 0.0048, 0.003, '#ffffff', { lift: 0.013, out: 0.8, seg: 6 });
        B.add(drape(subdivide(stroke([[s * 0.022, 0.578 + (s > 0 ? 0.006 : 0)], [s * 0.05, 0.59 + (s > 0 ? 0.012 : 0)], [s * 0.078, 0.582 + (s > 0 ? 0.01 : 0)]], t => 0.011 - t * 0.004, 1, 0, 0, 8), 1), T, 0.0015), '#3a2218');
        dot(B, T, s * 0.098, 0.488, 0.022, 0.013, 0.004, '#f4a088', { out: 0.6 });
      }
      dot(B, T, 0, 0.515, 0.021, 0.015, 0.014, '#3a2620', { out: 0.7, lift: 0.002 });
      dot(B, T, -0.006, 0.522, 0.006, 0.004, 0.003, '#8a6a5a', { lift: 0.011, out: 0.8, seg: 6 });
      B.add(drape(subdivide(stroke([[-0.042, 0.488], [-0.022, 0.474], [0, 0.472], [0.022, 0.474], [0.042, 0.488]], 0.0055, 1, 0, 0, 12), 1), T, 0.0042), '#3a2218');
      dot(B, T, 0.008, 0.47, 0.012, 0.009, 0.004, '#ff8a96', { lift: 0.0035, out: 0.6 });
      // the straw hat (a woven sugegasa) worn at a jaunty tilt, with a red chin cord
      B.at([0.004, 0.592, -0.04], 0, () => {
        // underside (apex → rim), the rolled rim, then the top surface in many rings (the weave)
        const hp = [[0.001, 0.112], [0.07, 0.08], [0.15, 0.03], [0.214, -0.006], [0.232, -0.004], [0.237, 0.006]];
        for (let k = 0; k <= 11; k++) { const t = k / 11, r = 0.226 * (1 - t) + 0.001 * t; hp.push([r, 0.017 + (0.153 - 0.017) * (1 - (r / 0.226) ** 1.15)]); }
        B.add(quadPaint(G.lathe(hp, 18), hp.length, (i, j, o) => { if (j < 3) { o.set('#b08a52'); return; } if (j < 6) { o.set('#c89a50'); return; } o.set((j + (i >> 1)) % 2 ? '#f0cc7c' : '#dcb466').multiplyScalar(0.95 + 0.06 * ((i % 3) / 2)); }), null);
        const kn = G.lathe([[0.001, 0.148], [0.016, 0.15], [0.014, 0.164], [0.001, 0.168]], 10); B.add(kn, '#b88a4a');
      }, 0.86, -0.42, 0.1);
      for (const s of [-1, 1]) curve(B, [[s * 0.128, 0.6, -0.03], [s * 0.13, 0.52, 0.03], [s * 0.08, 0.448, 0.085], [0, 0.432, 0.106]], 0.0045, '#d8403a', { radial: 5, n: 10 });
      ball(B, 0.012, 0, 0.432, 0.104, '#d8403a', 1, 8);
      // the sake flask (tokkuri) swinging from its left hand, marked 八; an account book in the right
      const fp = [[0.001, 0], [0.032, 0], [0.045, 0.02], [0.049, 0.045], [0.044, 0.07], [0.03, 0.088], [0.018, 0.1], [0.014, 0.118], [0.016, 0.128], [0.02, 0.134], [0.012, 0.137], [0.001, 0.133]];
      B.at([0.212, 0.078, 0.16], -0.3, () => {
        lathe(B, fp, 12, 0, 0, 0, (p, n, o) => { const drip = 0.08 - 0.018 * Math.abs(Math.sin(Math.atan2(p.x, p.z) * 3)) ** 3; o.set(p.y > drip ? '#7a4a30' : '#f6ecd6').lerp(col('#a8704a'), p.y > drip ? clamp(n.y) * 0.3 : 0).multiplyScalar(0.92 + 0.1 * clamp(n.y + 0.4)); });
        const fr = profR(fp.slice(0, 7));
        B.add(wrapLathe(stroke([[-0.006, 0.062], [-0.011, 0.043], [-0.022, 0.028]], t => 0.0075 - t * 0.003, 1, 0, 0, 6), fr, 0.3, 0.0012), INK);
        B.add(wrapLathe(stroke([[0.006, 0.062], [0.013, 0.043], [0.026, 0.026]], t => 0.007 - t * 0.002, 1, 0, 0, 6), fr, 0.3, 0.0012), INK);
        const tie = G.torus(0.0158, 0.0032, 4, 12); tie.rotateX(PI / 2); put(B, tie, 0, 0.112, 0, '#d8403a');
        curve(B, [[0.012, 0.114, 0.01], [0.004, 0.15, 0.0], [-0.012, 0.16, -0.01]], 0.0035, '#d8403a', { radial: 4, n: 6 });
      });
      B.at([-0.196, 0.15, 0.115], 0.5, () => {
        sbox(B, 0.078, 0.104, 0.024, 0.006, 0, 0, 0, (p, n, o) => o.set(n.z > 0.7 ? '#e8d4a6' : Math.abs(n.x) > 0.7 && p.x < 0 ? '#5a3a2e' : '#fff4dc'));
        box(B, 0.03, 0.07, 0.003, 0, 0.014, 0.018, 0.0125, '#fffaf0');
        for (const y of [0.075, 0.058, 0.04]) box(B, 0.016, 0.004, 0.002, 0, 0.014, y, 0.0142, INK);
        for (const y of [0.02, 0.05, 0.08]) box(B, 0.006, 0.003, 0.027, 0, -0.037, y, 0, '#3a2a30');
      }, 1, 0.1, -0.15);
    });
  },

  // (B.lod < 1: a lighter cat, for Tanu's stall counter seen from the street)
  luckyCat(B) {
    const lite = (B.lod ?? 1) < 1;
    if (lite) { B.add(KIT.pillowGeo(0.26, 0.05, 0.26, { sq: 0.28, edge: 0.4, bot: 0.32, ws: 12, hs: 6 }), '#e2483c'); for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; ball(B, 0.016, Math.cos(a) * 0.15, 0.012, Math.sin(a) * 0.15, GOLD, 1, 4); } }
    else cushion(B, '#e2483c', { w: 0.26, h: 0.05, button: '#b8322a', tassel: GOLD });
    const CY = 0.03;
    // the cat, sculpted: a round seated body, a big head with cheeks, tall ears, the raised left paw, the right paw
    // holding the koban, tucked feet and a curled tail
    const ear = s => flatZ(sRC([s * 0.044, 0.208, 0.004], [s * 0.06, 0.258, -0.004], 0.027, 0.006), 0.0, 0.5);
    const cat = cutY(sU(0.008,
      sU(0.024,
        sE([0, 0.075, -0.004], [0.078, 0.078, 0.07]),
        sE([0, 0.175, 0.012], [0.077, 0.066, 0.068]),
        sE([0.037, 0.158, 0.042], [0.042, 0.032, 0.034]), sE([-0.037, 0.158, 0.042], [0.042, 0.032, 0.034])),
      ear(1), ear(-1),
      sU(0.012, sRC([0.058, 0.098, 0.028], [0.09, 0.168, 0.034], 0.024, 0.021), sS([0.094, 0.188, 0.04], 0.025)),
      sU(0.012, sRC([-0.056, 0.104, 0.03], [-0.034, 0.064, 0.064], 0.022, 0.02), sS([-0.03, 0.058, 0.07], 0.022)),
      sE([0.042, 0.012, 0.056], [0.025, 0.014, 0.028]), sE([-0.042, 0.012, 0.056], [0.025, 0.014, 0.028]),
      SDF.tube([[0.045, 0.02, -0.062], [0.084, 0.026, -0.01], [0.078, 0.03, 0.046]], [0.017, 0.016, 0.013])), 0);
    const orange = col('#f4a04c'), black = col('#3e3640'), spots = [[V(0.05, 0.215, 0.0), 0.05, orange], [V(0.045, 0.1, -0.062), 0.042, orange], [V(-0.052, 0.214, -0.018), 0.04, black], [V(-0.045, 0.05, -0.06), 0.03, black], [V(0.082, 0.03, 0.0), 0.03, orange]];
    B.at([0, CY, 0], 0, () => {
      B.add(mold(cat, [-0.1, -0.004, -0.09], [0.13, 0.275, 0.1], lite ? 0.013 : 0.0085, lite ? 420 : 2150), (p, n, o) => {
        o.set('#fffaf2').multiplyScalar(0.93 + 0.08 * clamp(n.y * 0.6 + 0.4));
        for (const [c, r, cc] of spots) o.lerp(cc, clamp((1 - p.distanceTo(c) / r) * 4 + 0.2 * nz(p.x * 60, p.y * 60 + p.z * 40)));
      });
      for (const s of [-1, 1]) {
        dot(B, cat, s * 0.05, 0.226, 0.011, 0.022, 0.004, '#ffb4c4', { rot: -s * 0.3, out: 0.5, seg: lite ? 6 : 10 });
        dot(B, cat, s * 0.03, 0.182, 0.0125, 0.0145, 0.007, INK, { out: 0.6, seg: lite ? 6 : 10 });
        dot(B, cat, s * 0.027, 0.187, 0.0042, 0.0042, 0.002, '#ffffff', { lift: 0.0045, out: 0.8, seg: lite ? 4 : 6 });
        if (!lite) dot(B, cat, s * 0.034, 0.176, 0.0022, 0.0022, 0.0015, '#ffffff', { lift: 0.0045, out: 0.8, seg: 5 });
        dot(B, cat, s * 0.052, 0.158, 0.012, 0.0075, 0.003, '#ffaabb', { out: 0.6, seg: lite ? 6 : 10 });
        if (!lite) for (const k of [-1, 0, 1]) B.add(drape(subdivide(stroke([[s * 0.046, 0.163 + k * 0.006], [s * 0.066, 0.166 + k * 0.011]], 0.0022, 1), 1), cat, 0.0012), '#8a7a80');
      }
      dot(B, cat, 0, 0.166, 0.0072, 0.0055, 0.004, '#ff8a9c', { out: 0.7 });
      B.add(drape(subdivide(stroke([[-0.014, 0.158], [-0.007, 0.152], [0, 0.157], [0.007, 0.152], [0.014, 0.158]], 0.0026, 1, 0, 0, 10), 1), cat, 0.0012), INK);
      // pink pads on the raised paw
      if (!lite) dot(B, cat, 0.094, 0.186, 0.011, 0.01, 0.003, '#ffb4c4', { out: 0.6, seg: lite ? 6 : 10 });
      // a red collar with a gold bell
      B.add(loopTube(ringPts(cat, 0.126, 0, 0.004, lite ? 14 : 24, 0.003), 0.0068, lite ? 4 : 5), (p, n, o) => o.set('#e2382e').multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.4)));
      B.at([0, 0.112, 0.074], 0, () => {
        ball(B, 0.0135, 0, -0.004, 0, metalP(GOLD), 1, lite ? 7 : 12);
        const band = G.torus(0.0136, 0.0018, lite ? 3 : 4, lite ? 8 : 14); band.rotateX(PI / 2); put(B, band, 0, -0.003, 0, '#c8962a');
        box(B, 0.0025, 0.009, 0.004, 0, 0, -0.016, 0.011, '#7a5a2a'); ball(B, 0.0025, 0, -0.008, 0.0125, '#7a5a2a', 1, 5);
      });
      // the gold koban in its right paw
      if (lite) ball(B, 1, -0.036, 0.07, 0.094, metalP(GOLD), [0.029, 0.043, 0.008], 8);
      else B.at([-0.036, 0.07, 0.092], 0.28, () => {
        const k = new THREE.Shape(); k.absellipse(0, 0, 0.029, 0.043, 0, TAU);
        put(B, extrude(k, 0.005, 0.003, lite ? 10 : 18), 0, 0, -0.004, (p, n, o) => { o.set('#f2c040').lerp(col('#fff0a0'), clamp(n.z * 0.4 + n.y * 0.4)); if (n.z > 0.8 && Math.sin(p.y * 300) > 0.55) o.multiplyScalar(0.88); });
        put(B, new THREE.ShapeGeometry(roundRect(0.02, 0.046, 0.007), 4), 0, 0, 0.0047, '#ffe692');
        if (!lite) put(B, new THREE.RingGeometry(0.0255, 0.0275, 24).scale(1, 1.48, 1), 0, 0, 0.0047, '#c8902a');
        if (!lite) for (const [y, w] of [[0.013, 0.012], [0.0, 0.013], [-0.012, 0.012]]) put(B, ribbon([[-w / 2, y], [w / 2, y + 0.002]], 0.004), 0, 0, 0.0052, '#7a4a12');
        put(B, ribbon([[0, 0.018], [0, -0.017]], 0.0028), 0, 0, 0.0053, '#7a4a12');
        put(B, G.disc(0.006, 12), 0, 0.027, 0.0049, '#d8382e'); put(B, G.disc(0.006, 12), 0, -0.027, 0.0049, '#d8382e');
      }, 1, -0.18);
    });
  },

  yokaiLantern(B) {
    const wd = '#6b4a3a', wdL = '#8a6248';
    // the stand: a stepped base, a post at the back with a ball finial, an arm with a curved brace and an iron hook
    sbox(B, 0.4, 0.06, 0.4, 0.022, 0, 0, -0.04, grainP(wd, { along: 'x' }));
    sbox(B, 0.17, 0.035, 0.17, 0.012, 0, 0.058, -0.17, grainP(wdL));
    const pz = -0.17;
    put(B, G.beam(0.072, 1.1, 0.072, 0.016), 0, 0.06 + 0.55, pz, grainP(wdL, { along: 'y' }));
    lathe(B, [[0.001, 0], [0.05, 0], [0.052, 0.012], [0.036, 0.022], [0.032, 0.03], [0.038, 0.05], [0.026, 0.07], [0.001, 0.076]], 12, 0, 1.152, pz, wd);
    put(B, G.beam(0.056, 0.056, 0.31, 0.012), 0, 1.115, pz + 0.135, grainP(wdL, { along: 'z' }));
    const brc = new THREE.Shape(); brc.moveTo(0, 0); brc.lineTo(0.12, 0); brc.quadraticCurveTo(0.03, -0.01, 0, -0.12); brc.lineTo(0, 0);
    { const g = extrude(brc, 0.03, 0.006, 10); g.rotateY(-PI / 2); put(B, g, 0.021, 1.087, pz + 0.036, wd); }
    const zc = 0.05, H = 0.44, yb = 0.6, R = 0.176, N = 14, mid = yb + H / 2;
    put(B, G.torus(0.016, 0.0042, 5, 12).rotateY(PI / 2), 0, 1.075, zc, IRON);
    cyl(B, 0.0045, 0.0045, 0.03, 5, 0, 1.06, zc, '#2e2a30');
    // the chochin-obake: a ribbed paper lantern (glow) with lacquer caps and gold rings
    const prof = []; for (let k = 0; k <= N; k++) { const t = k / N; prof.push([R * (0.62 + 0.38 * Math.sin(t * PI)) * (k % 2 ? 1 : 0.972), yb + t * H]); }
    const Rf = y => R * (0.62 + 0.38 * Math.sin(clamp((y - yb) / H) * PI));
    B.at([0, 0, zc], 0, () => {
      B.glow(G.lathe(prof, 26), (p, n, o) => { const t = (p.y - yb) / H, v = nz(p.x * 9 + 2, p.y * 9 + p.z * 7); o.set('#fff2d6').lerp(col('#ecd2a6'), clamp(v * 1.4 - 0.2) * 0.5 + clamp(Math.abs(t - 0.5) * 2 - 0.6) * 0.5); }, { flicker: 0.8, tint: 0.35 });
      // ribs over the paper, broken round the face
      for (let k = 1; k < N; k++) {
        const y = yb + k / N * H, r = Rf(y) + 0.003, face = y > yb + 0.08 && y < yb + 0.4, arcs = face ? [[0.86, TAU - 1.72]] : [[0, TAU]];
        for (const [a0, len] of arcs) {
          const g = G.torus(r, 0.0042, 3, Math.max(4, Math.round(len * 2.3)), len); g.rotateX(PI / 2); g.rotateY(a0 + len - PI / 2); g.translate(0, y, 0); B.glow(g, '#c8a070', { tint: 0.12, flicker: 0.8 });
          if (len < TAU) for (const a of [a0, a0 + len]) B.glow(G.sph(0.0046, 4, 3).translate(Math.sin(a) * r, y, Math.cos(a) * r), '#c8a070', { tint: 0.12, flicker: 0.8 }); // round the cut ends
        }
      }
      const capR = R * 0.62 + 0.008;
      lathe(B, [[0.001, yb - 0.035], [capR - 0.006, yb - 0.035], [capR, yb - 0.025], [capR, yb + 0.008], [0.001, yb + 0.008]], 18, 0, 0, 0, BLACK_LAC);
      lathe(B, [[0.001, yb + H - 0.008], [capR, yb + H - 0.008], [capR, yb + H + 0.025], [capR - 0.006, yb + H + 0.035], [0.001, yb + H + 0.035]], 18, 0, 0, 0, BLACK_LAC);
      for (const y of [yb + 0.01, yb + H - 0.01]) { const r = G.torus(capR - 0.003, 0.0045, 3, 20); r.rotateX(PI / 2); put(B, r, 0, y, 0, GOLD); }
      // the one big eye: an eyeball dome, an amber iris, a round pupil with glints, a heavy lid line and lashes
      const latheFrame = (y, a) => { const r = Rf(y), e = 0.002, dr = (Rf(y + e) - Rf(y - e)) / (2 * e); return { p: V(r * Math.sin(a), y, r * Math.cos(a)), n: V(Math.sin(a), -dr, Math.cos(a)).normalize() }; };
      const ey = yb + 0.268, fr = latheFrame(ey, 0.06);
      dome(B, fr, 0.064, 0.056, 0.03, (p, n, o) => o.set('#fffdf6').lerp(col('#e8e0e8'), clamp(-n.y * 0.6)), { out: 0.62, seg: 16 });
      dome(B, fr, 0.034, 0.036, 0.018, '#ffb83a', { out: 0.6, lift: 0.0115, seg: 14 });
      dome(B, fr, 0.019, 0.021, 0.012, '#1e1418', { out: 0.6, lift: 0.0165, seg: 14 });
      dome(B, { p: fr.p.clone().add(V(-0.012, 0.014, 0.004)), n: fr.n }, 0.0075, 0.0075, 0.004, '#ffffff', { out: 0.6, lift: 0.0215, seg: 8 });
      dome(B, { p: fr.p.clone().add(V(0.01, -0.012, 0.004)), n: fr.n }, 0.0035, 0.0035, 0.002, '#ffffff', { out: 0.6, lift: 0.0205, seg: 6 });
      const lid = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = PI * (0.1 + 0.8 * t); lid.push([Math.cos(a) * 0.072 + 0.004, ey + Math.sin(a) * 0.052 - 0.006]); }
      B.add(wrapLathe(subdivide(stroke(lid.reverse(), t => 0.009 + 0.006 * Math.sin(PI * t), 1, 0.0, 0), 1), Rf, 0.06, 0.017), '#2a1a20');
      for (const [x, y, ax] of [[-0.058, ey + 0.032, -0.6], [-0.03, ey + 0.05, -0.25], [0.004, ey + 0.055, 0.05], [0.04, ey + 0.048, 0.35]]) B.add(wrapLathe(stroke([[x, y], [x + Math.sin(ax) * 0.02, y + Math.cos(ax) * 0.02]], t => 0.006 - t * 0.004, 1), Rf, 0.06, 0.0125), '#2a1a20');
      // a wide torn mouth, a dark throat, paper fangs, and a long tongue lolling out
      const my = yb + 0.13, m = new THREE.Shape(); m.moveTo(-0.11, my + 0.024); m.quadraticCurveTo(0, my - 0.09, 0.11, my + 0.024);
      for (let i = 1; i <= 8; i++) { const x = 0.11 - i * 0.0275; m.lineTo(x + 0.01375, my + 0.002 + (i % 2 ? -0.004 : 0.003)); m.lineTo(x, my + 0.016 + (i % 3 === 0 ? 0.006 : 0)); }
      B.add(wrapLathe(subdivide(new THREE.ShapeGeometry(m, 8), 2), Rf, 0, 0.0028), (p, n, o) => o.set('#3a1a22').lerp(col('#7a2a36'), clamp((my - p.y) / 0.05)));
      for (const sx of [-1, 1]) { const f = new THREE.Shape([new THREE.Vector2(sx * 0.072, my + 0.012), new THREE.Vector2(sx * 0.044, my + 0.006), new THREE.Vector2(sx * 0.06, my - 0.024)]); B.glow(wrapLathe(subdivide(new THREE.ShapeGeometry(f), 1), Rf, 0, 0.0034), '#fff6e4', { tint: 0.3, flicker: 0.8 }); }
      const rz = Rf(my), tg = flatTube([[0, my - 0.005, rz - 0.03], [0.004, my - 0.025, rz + 0.025], [0.012, my - 0.08, rz + 0.05], [0.006, my - 0.15, rz + 0.04], [-0.006, my - 0.2, rz + 0.02], [-0.004, my - 0.218, rz - 0.005], [0.004, my - 0.206, rz - 0.02]], t => 0.062 - 0.024 * t ** 2, t => 0.022 - 0.008 * t, { n: 18, radial: 10 });
      B.add(tg, (p, n, o) => { o.set('#ff6a7c').lerp(col('#ffa0ac'), clamp(n.y * 0.5 + n.z * 0.3)).lerp(col('#d84458'), clamp(-n.y * 0.6)); if (Math.abs(p.x - 0.004) < 0.004 && n.z > 0.3) o.multiplyScalar(0.8); });
      // two paper patches (an old lantern) and a brush mark on its side
      for (const [a, y, w, h, r] of [[1.2, yb + 0.3, 0.05, 0.04, 0.2], [-1.4, yb + 0.12, 0.04, 0.05, -0.3]]) B.glow(wrapLathe(subdivide(new THREE.ShapeGeometry(roundRect(w, h, 0.004), 2).rotateZ(r).translate(0, y, 0), 1), Rf, a, 0.0035), '#fff8ec', { tint: 0.35, flicker: 0.8 });
      B.add(wrapLathe(stroke([[0, yb + 0.33], [0.006, yb + 0.26], [-0.004, yb + 0.18], [0.004, yb + 0.12]], t => 0.014 - t * 0.008, 1, 0, 0, 10), Rf, -1.15, 0.0036), '#3a2a30');
      B.add(wrapLathe(stroke([[-0.025, yb + 0.25], [0.02, yb + 0.235]], 0.009, 1), Rf, -1.15, 0.0038), '#3a2a30');
    });
  },
};

export const BUILDERS2 = { ...TEA2, ...BAMBOO2, ...MAPLE2, ...TIDE2, ...FESTIVAL2 };
