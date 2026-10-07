// Procedural geometry helpers: tapered tubes, noisy puffs, foliage cards, merging, vertex painting.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise, mulberry32 } from '../core/util.js';

const _n = new Noise(42);
export { mergeGeometries, mergeVertices };

// Tube along points [{p:Vector3, r}] with radial segs
export function tube(points, radial = 7, capEnd = true) {
  const pos = [], nor = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  let prevN = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i].p, r = points[i].r;
    const t = new THREE.Vector3();
    if (i < points.length - 1) t.subVectors(points[i + 1].p, p); else t.subVectors(p, points[i - 1].p);
    t.normalize();
    let n = prevN ? prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize() : new THREE.Vector3().crossVectors(t, Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    prevN = n;
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const dir = n.clone().multiplyScalar(Math.cos(a)).add(b.clone().multiplyScalar(Math.sin(a)));
      pos.push(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
      nor.push(dir.x, dir.y, dir.z);
      uv.push(k / radial, i / (points.length - 1));
    }
  }
  const row = radial + 1;
  for (let i = 0; i < points.length - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * row + k, b = a + row, c = b + 1, d = a + 1;
    idx.push(a, d, b, b, d, c); // counter-clockwise seen from outside (face normals agree with the vertex normals)
  }
  if (capEnd) { // pointed cap
    const last = points[points.length - 1];
    const tip = pos.length / 3;
    const t = new THREE.Vector3().subVectors(last.p, points[points.length - 2].p).normalize();
    pos.push(last.p.x + t.x * last.r, last.p.y + t.y * last.r, last.p.z + t.z * last.r); nor.push(t.x, t.y, t.z); uv.push(0.5, 1);
    const base = (points.length - 1) * row;
    for (let k = 0; k < radial; k++) idx.push(base + k, base + k + 1, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A curved branch from a to b bending by `bend` vector; radius r0->r1
export function branch(a, b, r0, r1, bend = new THREE.Vector3(), segs = 6, radial = 7) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t).addScaledVector(bend, Math.sin(t * Math.PI));
    pts.push({ p, r: r0 + (r1 - r0) * t });
  }
  return tube(pts, radial, true);
}

// Noisy icosphere "puff" with normals blended toward a crown centre for soft volumetric shading.
export function puff(center, radius, { detail = 2, noise = 0.18, squash = 1, crown = null, crownMix = 0.55, seed = 0 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const nrm = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = _n.n2(v.x * 2.1 + seed * 7.3, v.y * 2.3 + v.z * 1.7 + seed) * 0.6 + _n.n2(v.z * 4.1 + seed, v.x * 3.7) * 0.4;
    const s = radius * (1 + n * noise);
    const p = v.clone().multiplyScalar(s);
    p.y *= squash;
    if (p.y < -radius * 0.35) p.y = -radius * 0.35 + (p.y + radius * 0.35) * 0.35; // flatter underside
    p.add(center);
    pos.setXYZ(i, p.x, p.y, p.z);
    const own = v.clone().normalize();
    const n2 = crown ? p.clone().sub(crown).normalize().lerp(own, 1 - crownMix).normalize() : own;
    nrm[i * 3] = n2.x; nrm[i * 3 + 1] = n2.y; nrm[i * 3 + 2] = n2.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// Foliage cards scattered over a sphere shell; normals point out from `crown` (shared) for unified lighting.
export function cards(center, radius, count, { size = 0.9, crown = null, seed = 1, squash = 1, upBias = 0.2 } = {}) {
  const r = mulberry32(seed * 977 + 13);
  const pos = [], nor = [], uv = [], idx = [];
  const cn = crown || center;
  for (let c = 0; c < count; c++) {
    // point on shell, biased upward/outward
    const u = r() * 2 - 1 + upBias, th = r() * Math.PI * 2;
    const uu = Math.max(-1, Math.min(1, u));
    const sr = Math.sqrt(1 - uu * uu);
    const dir = new THREE.Vector3(sr * Math.cos(th), uu * squash, sr * Math.sin(th)).normalize();
    const p = center.clone().addScaledVector(dir, radius * (0.75 + r() * 0.35));
    const n = p.clone().sub(cn).normalize();
    // card plane roughly facing outward, random roll
    const tangent = new THREE.Vector3().crossVectors(n, new THREE.Vector3(r() - 0.5, 1, r() - 0.5).normalize()).normalize();
    const bit = new THREE.Vector3().crossVectors(n, tangent).normalize();
    const rot = r() * Math.PI;
    const ax = tangent.clone().multiplyScalar(Math.cos(rot)).add(bit.clone().multiplyScalar(Math.sin(rot)));
    const ay = new THREE.Vector3().crossVectors(n, ax).normalize();
    // tilt the card a little away from the normal so it reads from many angles
    const s = size * (0.75 + r() * 0.5);
    const base = pos.length / 3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [cx, cy] of corners) {
      const q = p.clone().addScaledVector(ax, cx * s * 0.5).addScaledVector(ay, cy * s * 0.5).addScaledVector(n, (cx * cy) * 0.08 * s);
      pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); uv.push((cx + 1) / 2, (cy + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Paint vertex colours with a function(pos, normal) -> THREE.Color
export function paint(g, fn) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    fn(p, n, c, i);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export function solid(g, hex) { const c = new THREE.Color(hex); return paint(g, (p, n, o) => o.copy(c)); }

/**
 * Zero or non-finite vertex normals (a fin whose front and back faces share a vertex, a zero-area sliver, a pole) →
 * the vertex's own face normal (area-weighted over its triangles), else straight up. A zero normal shades wrong, and
 * an unguarded normalize() in a shader makes it NaN, which the bloom turns into a black block (ROADMAP R-7).
 * → the number of normals repaired.
 */
export function repairNormals(g) {
  const N = g?.attributes?.normal, P = g?.attributes?.position; if (!N || !P) return 0;
  let acc = null;
  for (let i = 0; i < N.count; i++) { const x = N.getX(i), y = N.getY(i), z = N.getZ(i), l = x * x + y * y + z * z; if (!(l > 1e-12) || !Number.isFinite(l)) (acc ||= new Map()).set(i, new THREE.Vector3()); }
  if (!acc) return 0;
  const I = g.index, T = I ? I.count / 3 : P.count / 3, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < T; t++) {
    const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;
    const v0 = acc.get(i0), v1 = acc.get(i1), v2 = acc.get(i2); if (!v0 && !v1 && !v2) continue;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1).sub(a); c.fromBufferAttribute(P, i2).sub(a); b.cross(c);
    if (!Number.isFinite(b.x + b.y + b.z)) continue;
    v0?.add(b); v1?.add(b); v2?.add(b);
  }
  for (const [i, v] of acc) { if (v.lengthSq() > 1e-30) v.normalize(); else v.set(0, 1, 0); N.setXYZ(i, v.x, v.y, v.z); }
  N.needsUpdate = true;
  return acc.size;
}

// A normal matrix that never breaks (ROADMAP R-7; the Horde's per-instance normals, dungeon/horde.js): the cofactor
// matrix of a world 3×3 (e: Matrix4 elements), signed by the determinant and scaled
// to unit size. That is the inverse-transpose times |det|, and normals are normalised in the shader, so it turns them
// exactly like three's normal matrix wherever that exists, and stays finite and right where it doesn't: a part squashed
// flat (a dying monster: det 0, getNormalMatrix gives all zeros → NaN normals → black blocks in the bloom) keeps the
// limit, its normals along the squashed axis. → false when the 3×3 has rank ≤ 1 or isn't finite (nothing to draw).
export function normalMatrixInto(e, A, o) {
  const a0 = e[0], a1 = e[1], a2 = e[2], b0 = e[4], b1 = e[5], b2 = e[6], c0 = e[8], c1 = e[9], c2 = e[10];
  // columns: b × c, c × a, a × b (a, b, c: the 3×3's columns)
  const x0 = b1 * c2 - b2 * c1, x1 = b2 * c0 - b0 * c2, x2 = b0 * c1 - b1 * c0;
  const y0 = c1 * a2 - c2 * a1, y1 = c2 * a0 - c0 * a2, y2 = c0 * a1 - c1 * a0;
  const z0 = a1 * b2 - a2 * b1, z1 = a2 * b0 - a0 * b2, z2 = a0 * b1 - a1 * b0;
  const det = a0 * x0 + a1 * x1 + a2 * x2;
  const m = Math.max(Math.abs(x0), Math.abs(x1), Math.abs(x2), Math.abs(y0), Math.abs(y1), Math.abs(y2), Math.abs(z0), Math.abs(z1), Math.abs(z2));
  if (!(m > 1e-30) || !Number.isFinite(m + det)) { A[o] = 1; A[o + 1] = 0; A[o + 2] = 0; A[o + 3] = 0; A[o + 4] = 1; A[o + 5] = 0; A[o + 6] = 0; A[o + 7] = 0; A[o + 8] = 1; return false; }
  const k = (det < 0 ? -1 : 1) / m;
  A[o] = x0 * k; A[o + 1] = x1 * k; A[o + 2] = x2 * k; A[o + 3] = y0 * k; A[o + 4] = y1 * k; A[o + 5] = y2 * k; A[o + 6] = z0 * k; A[o + 7] = z1 * k; A[o + 8] = z2 * k;
  return true;
}

// Merge geometries after normalising attribute sets (position, normal, uv, color)
export function merge(list) {
  const norm = list.map(g => {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.color) solid(g, '#ffffff');
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const out = mergeGeometries(norm, false);
  repairNormals(out);
  return out;
}

export function rounded(w, h, d, r = 0.1, seg = 3) {
  // rounded box via RoundedBoxGeometry
  return new RoundedBox(w, h, d, seg, r);
}
import { RoundedBoxGeometry as RoundedBox } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { RoundedBox };

// transform helper
export function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  g.applyMatrix4(m);
  return g;
}
