// Signed-distance sculpting at runtime: shapes are functions f(x, y, z) -> distance (negative inside) combined with
// smooth unions, then meshed with surface nets. The same method as the Blender-built Disney Chewy
// (tools/blender/disney/sdf.py), sized for building characters while the game runs: a coarse pass finds the surface
// and only the cells near it are sampled finely, and every result is meant to be cached (see disneyKit.js).
import * as THREE from 'three';

const sq = x => x * x;
export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ rotations (row-major 3x3, world -> local)
export function rotXYZ(rx = 0, ry = 0, rz = 0) {
  const e = new THREE.Euler(rx, ry, rz, 'XYZ'), m = new THREE.Matrix4().makeRotationFromEuler(e).invert(); // world -> local
  const a = m.elements; // column-major
  return [a[0], a[4], a[8], a[1], a[5], a[9], a[2], a[6], a[10]];
}
const R = (M, x, y, z, o) => { o[0] = M[0] * x + M[1] * y + M[2] * z; o[1] = M[3] * x + M[4] * y + M[5] * z; o[2] = M[6] * x + M[7] * y + M[8] * z; return o; };

// ------------------------------------------------------------------ primitives
export const sphere = ([cx, cy, cz], r) => (x, y, z) => Math.sqrt(sq(x - cx) + sq(y - cy) + sq(z - cz)) - r;

export function ellipsoid([cx, cy, cz], [rx, ry, rz], M = null) {
  const t = [0, 0, 0];
  return (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (M) { R(M, px, py, pz, t); px = t[0]; py = t[1]; pz = t[2]; }
    const k0 = Math.sqrt(sq(px / rx) + sq(py / ry) + sq(pz / rz));
    const k1 = Math.sqrt(sq(px / (rx * rx)) + sq(py / (ry * ry)) + sq(pz / (rz * rz)));
    return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
  };
}

export function capsule([ax, ay, az], [bx, by, bz], r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, dd = dx * dx + dy * dy + dz * dz;
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const h = clamp01((px * dx + py * dy + pz * dz) / dd);
    return Math.sqrt(sq(px - dx * h) + sq(py - dy * h) + sq(pz - dz * h)) - r;
  };
}

// capsule whose radius goes r1 (at a) -> r2 (at b) (IQ sdRoundCone)
export function roundCone([ax, ay, az], [bx, by, bz], r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
    const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(Math.max(x2 * a2 * il2, 0)) + yv * rr) * il2 - r1;
  };
}

export function roundBox([cx, cy, cz], [bx, by, bz], r, M = null) {
  const t = [0, 0, 0];
  return (x, y, z) => {
    let px = x - cx, py = y - cy, pz = z - cz;
    if (M) { R(M, px, py, pz, t); px = t[0]; py = t[1]; pz = t[2]; }
    const qx = Math.abs(px) - bx, qy = Math.abs(py) - by, qz = Math.abs(pz) - bz;
    return Math.sqrt(sq(Math.max(qx, 0)) + sq(Math.max(qy, 0)) + sq(Math.max(qz, 0))) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

// chain of round cones through points [[x,y,z], ...] with radii (a limb, a tail, a tuft)
export function tube(pts, radii) {
  const fs = [];
  for (let i = 0; i < pts.length - 1; i++) fs.push(roundCone(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return (x, y, z) => { let d = Infinity; for (const f of fs) { const v = f(x, y, z); if (v < d) d = v; } return d; };
}

// ------------------------------------------------------------------ operators
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);
export function union(k, ...fs) {
  return (x, y, z) => { let d = fs[0](x, y, z); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k); return d; };
}
export const subtract = (a, b, k = 0) => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);
export const intersect = (a, b, k = 0) => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);
export const mirrorX = f => (x, y, z) => f(Math.abs(x), y, z);
export const moved = (f, [dx, dy, dz]) => (x, y, z) => f(x - dx, y - dy, z - dz);
// evaluate f in a space scaled by s around c (squash / stretch a form)
export function scaled(f, [cx, cy, cz], [sx, sy, sz]) {
  const m = Math.min(sx, sy, sz);
  return (x, y, z) => f(cx + (x - cx) / sx, cy + (y - cy) / sy, cz + (z - cz) / sz) * m;
}

// ------------------------------------------------------------------ meshing
/**
 * Surface nets over the box [lo, hi] with cell size h: one vertex per sign-changing cell (mean of its edge crossings),
 * one quad per sign-changing grid edge, then one Newton step onto the true surface and normals from the gradient.
 * Only coarse blocks near the surface are sampled finely. Returns an indexed BufferGeometry (position, normal).
 */
export function surfaceNets(f, lo, hi, h, { coarse = 4, band = 2.6 } = {}) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const N = nx * ny * nz, F = new Float32Array(N), done = new Uint8Array(N);
  const id = (i, j, k) => (i * ny + j) * nz + k;
  const at = (i, j, k) => f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  // coarse pass
  const C = coarse, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const ci = i => Math.min(i * C, nx - 1), cj = j => Math.min(j * C, ny - 1), ck = k => Math.min(k * C, nz - 1);
  const D = new Float32Array(cx * cy * cz), cid = (i, j, k) => (i * cy + j) * cz + k;
  for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
    const v = at(ci(i), cj(j), ck(k)); D[cid(i, j, k)] = v;
    const p = id(ci(i), cj(j), ck(k)); F[p] = v; done[p] = 1;
  }
  const margin = band * C * h;
  // fine pass inside the blocks that the surface may cross; far blocks get their corners' mean (the sign is all that matters)
  for (let i = 0; i < cx - 1; i++) for (let j = 0; j < cy - 1; j++) for (let k = 0; k < cz - 1; k++) {
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
      const v = D[cid(i + a, j + b, k + c)]; if (v < mn) mn = v; if (v > mx) mx = v; sum += v;
    }
    const near = mn < margin && mx > -margin;
    const i0 = ci(i), i1 = ci(i + 1), j0 = cj(j), j1 = cj(j + 1), k0 = ck(k), k1 = ck(k + 1);
    for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) for (let c = k0; c <= k1; c++) {
      const p = id(a, b, c);
      if (done[p] === 1) continue;
      if (near) { F[p] = at(a, b, c); done[p] = 1; }
      else if (done[p] === 0) { F[p] = sum / 8; done[p] = 2; }
    }
  }
  // vertices
  const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellId = (i, j, k) => (i * (ny - 1) + j) * (nz - 1) + k;
  const pos = [];
  const OFF = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v8 = new Float32Array(8);
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) {
    let neg = 0;
    for (let q = 0; q < 8; q++) { const o = OFF[q]; const v = F[id(i + o[0], j + o[1], k + o[2])]; v8[q] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = v8[a], vb = v8[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb), oa = OFF[a], ob = OFF[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cell[cellId(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  // quads round every sign-changing grid edge
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); // counter-clockwise seen from outside
  };
  for (let i = 0; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) for (let k = 1; k < nz - 1; k++) { // x edges
    const v0 = F[id(i, j, k)], v1 = F[id(i + 1, j, k)]; if ((v0 < 0) === (v1 < 0)) continue;
    quad(cell[cellId(i, j - 1, k - 1)], cell[cellId(i, j, k - 1)], cell[cellId(i, j, k)], cell[cellId(i, j - 1, k)], v0 < 0);
  }
  for (let i = 1; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) for (let k = 1; k < nz - 1; k++) { // y edges
    const v0 = F[id(i, j, k)], v1 = F[id(i, j + 1, k)]; if ((v0 < 0) === (v1 < 0)) continue;
    quad(cell[cellId(i - 1, j, k - 1)], cell[cellId(i - 1, j, k)], cell[cellId(i, j, k)], cell[cellId(i, j, k - 1)], v0 < 0);
  }
  for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) { // z edges
    const v0 = F[id(i, j, k)], v1 = F[id(i, j, k + 1)]; if ((v0 < 0) === (v1 < 0)) continue;
    quad(cell[cellId(i - 1, j - 1, k)], cell[cellId(i, j - 1, k)], cell[cellId(i, j, k)], cell[cellId(i - 1, j, k)], v0 < 0);
  }
  // project onto the surface, normals from the gradient
  const P = new Float32Array(pos), NR = new Float32Array(P.length), e = h * 0.25;
  for (let v = 0; v < P.length; v += 3) {
    let x = P[v], y = P[v + 1], z = P[v + 2];
    for (let it = 0; it < 2; it++) {
      const d = f(x, y, z);
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      if (it === 0) { const s = Math.max(-h, Math.min(h, d / g2)); x -= gx * s; y -= gy * s; z -= gz * s; } // never jump more than a cell
      else { const l = Math.sqrt(g2); NR[v] = gx / l; NR[v + 1] = gy / l; NR[v + 2] = gz / l; }
    }
    P[v] = x; P[v + 1] = y; P[v + 2] = z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(NR, 3));
  g.setIndex(idx);
  return g;
}
