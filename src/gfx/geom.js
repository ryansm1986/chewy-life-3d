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
    idx.push(a, b, d, b, c, d);
  }
  if (capEnd) { // pointed cap
    const last = points[points.length - 1];
    const tip = pos.length / 3;
    const t = new THREE.Vector3().subVectors(last.p, points[points.length - 2].p).normalize();
    pos.push(last.p.x + t.x * last.r, last.p.y + t.y * last.r, last.p.z + t.z * last.r); nor.push(t.x, t.y, t.z); uv.push(0.5, 1);
    const base = (points.length - 1) * row;
    for (let k = 0; k < radial; k++) idx.push(base + k, tip, base + k + 1);
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
  return mergeGeometries(norm, false);
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
