// Shared kit for the Biomes A regions (Whispering Bamboo Grove, Momiji Hollow; docs/REGIONS.md §2):
//  - CardSet / mass / paintMass / cullBuried: the village's foliage-building blocks (vegetation.js keeps them private),
//    re-used here so region trees share the village's canopy look and card atlases (C1/C2 clusters, S1/S2 sprays);
//  - paintAtlas(kind): extra painted card atlases in the same layout (bamboo sprays, fern fronds, fallen-leaf decals);
//  - M(key): memoised, batching-aware materials (created once per session and never disposed, so their shader programs
//    stay compiled between visits; only geometry is freed on dispose);
//  - Placer: queues instances of cached geometries into BatchedMesh batches (one draw call per material), kit pieces
//    (Builder buckets + lamp lights), colliders and nav blockers, then builds / disposes them as one unit.
import * as THREE from 'three';
import { vegToon, VEG_MATS, Batch } from '../../world/vegetation.js';
import { makeToon } from '../../gfx/materials.js';
import { detailMats } from '../../world/details.js';
import { makeCanvas } from '../../gfx/textures.js';
import { paint } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp, Noise } from '../../core/util.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const col = h => new THREE.Color(h);
export const cols = (...h) => h.map(col);
export const UP = V(0, 1, 0);
export const PI = Math.PI;
export const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
export const dirAt = a => V(Math.cos(a), 0, Math.sin(a));
const _N = new Noise(6151);
export const nz = (x, y) => _N.n2(x, y);

// ------------------------------------------------------------------ card atlases (512², vegetation.js layout)
const AT = 512;
export const RECTS = { C1: [0, 0, 256, 256], C2: [0, 256, 256, 512], S1: [256, 0, 384, 512], S2: [384, 0, 512, 512] };
export const UVR = {};
for (const [k, [x0, y0, x1, y1]] of Object.entries(RECTS)) UVR[k] = [(x0 + 2) / AT, (y0 + 2) / AT, (x1 - 2) / AT, (y1 - 2) / AT];
export const CARD_ALPHA = 0.42;

// Foliage card soup: flat cards and bent hanging sprays with per-vertex colour and normal (as vegetation.js)
export class CardSet {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  get count() { return this.I.length / 3; }
  _v(p, n, u, v, c) { this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v); this.C.push(c.r, c.g, c.b); }
  quad(p, ax, ay, n, rect, c) {
    const [u0, v0, u1, v1] = UVR[rect], b = this.P.length / 3, q = new THREE.Vector3();
    this._v(q.copy(p).sub(ax).sub(ay), n, u0, v0, c);
    this._v(q.copy(p).add(ax).sub(ay), n, u1, v0, c);
    this._v(q.copy(p).add(ax).add(ay), n, u1, v1, c);
    this._v(q.copy(p).sub(ax).add(ay), n, u0, v1, c);
    this.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  cluster(r, p, n, size, rect, c, tilt = 0.35, light = n) {
    const t = new THREE.Vector3().crossVectors(n, V(r() - 0.5, 1, r() - 0.5).normalize());
    if (t.lengthSq() < 1e-4) t.set(1, 0, 0);
    t.normalize();
    const bt = new THREE.Vector3().crossVectors(n, t).normalize(), rot = r() * TAU;
    const ax = t.clone().multiplyScalar(Math.cos(rot)).addScaledVector(bt, Math.sin(rot));
    const ay = new THREE.Vector3().crossVectors(n, ax).normalize().addScaledVector(n, (r() - 0.5) * 2 * tilt).normalize();
    this.quad(p, ax.multiplyScalar(size / 2), ay.multiplyScalar(size / 2), light, rect, c);
  }
  // hanging spray through pts (pts[0] = attachment), `w` wide across `side`; v runs 0 at the top to 1 at the tip
  spray(pts, side, w, n, rect, cTop, cTip) {
    const [u0, v0, u1, v1] = UVR[rect], b = this.P.length / 3, q = new THREE.Vector3(), c = new THREE.Color();
    const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = acc[acc.length - 1];
    pts.forEach((p, i) => {
      const t = acc[i] / L, v = v0 + (v1 - v0) * t; c.copy(cTop).lerp(cTip, t);
      this._v(q.copy(p).addScaledVector(side, -w / 2), n, u0, v, c);
      this._v(q.copy(p).addScaledVector(side, w / 2), n, u1, v, c);
      if (i) { const a = b + (i - 1) * 2; this.I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    });
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I);
    return g;
  }
}

// lumpy foliage mass (vegetation.js mass): icosphere with random lobes, flattened belly, crown-blended normals
export function mass(c, r, { detail = 2, sx = 1, sy = 1, sz = 1, lumps = 0.3, rough = 0.06, seed = 0, crown = null, crownMix = 0.5, up = 0, belly = 0.3 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position, nrm = new Float32Array(pos.count * 3);
  const rr = mulberry32(seed * 7919 + 101), L = [];
  for (let i = 0; i < 5; i++) { const u = rr() * 1.6 - 0.6, th = rr() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u)); L.push([s * Math.cos(th), u, s * Math.sin(th), 0.4 + rr() * 0.6]); }
  const kAt = (x, y, z) => {
    let k = 1 - lumps * 0.3;
    for (const [dx, dy, dz, a] of L) { const d = Math.max(0, x * dx + y * dy + z * dz); k += lumps * a * d * d * d; }
    return k + rough * _N.n2(x * 2.3 + seed * 3.1, y * 2.1 + z * 1.9 - seed);
  };
  const v = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), cn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const k = kAt(v.x, v.y, v.z);
    p.set(v.x * sx, v.y * sy, v.z * sz).multiplyScalar(r * k);
    const bl = -r * sy * belly; if (p.y < bl) p.y = bl + (p.y - bl) * 0.3;
    p.add(c); pos.setXYZ(i, p.x, p.y, p.z);
    n.set(v.x / sx, v.y / sy, v.z / sz).normalize();
    if (crown) n.lerp(cn.subVectors(p, crown).normalize(), crownMix).normalize();
    if (up) n.lerp(UP, up).normalize();
    nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.userData.m = { c: c.clone(), rx: r * sx, ry: r * sy, rz: r * sz, k: kAt };
  return g;
}
const COOL = new THREE.Color(0.8, 0.85, 1.0);
export function paintMass(g, stops, { y0, y1, hi = null, hiAmt = 0.4, under = 0.72, patch = 0.12, seed = 0 }) {
  const tmp = new THREE.Color();
  return paint(g, (p, n, o) => {
    let t = (p.y - y0) / Math.max(0.3, y1 - y0) + _N.n2(p.x * 0.8 + seed, p.z * 0.8 - seed) * patch + n.y * 0.1;
    t = clamp(t) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t));
    o.copy(stops[i]).lerp(stops[i + 1], t - i);
    if (hi) o.lerp(hi, clamp((n.y - 0.45) * 1.5) * hiAmt);
    if (n.y < 0) { const k = clamp(-n.y * 1.6); o.multiplyScalar(1 - (1 - under) * k); o.lerp(tmp.copy(o).multiply(COOL), k); }
  });
}
// drop canopy triangles buried inside neighbouring masses
export function cullBuried(g, self, all) {
  const pos = g.attributes.position, n = pos.count, buried = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    for (const q of all) {
      if (q === self || y < q.c.y - q.ry * 0.25) continue;
      const dx = (x - q.c.x) / q.rx, dy = (y - q.c.y) / q.ry, dz = (z - q.c.z) / q.rz;
      if (dx * dx + dy * dy + dz * dz < 0.72 * 0.72) { buried[i] = 1; break; }
    }
  }
  const keep = [];
  for (let t = 0; t < n; t += 3) if (!(buried[t] && buried[t + 1] && buried[t + 2])) keep.push(t);
  if (keep.length * 3 === n) return g;
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const w = attr.itemSize, src = attr.array, dst = new src.constructor(keep.length * 3 * w);
    let o = 0;
    for (const t of keep) for (let k = 0; k < 3 * w; k++) dst[o++] = src[t * w + k];
    out.setAttribute(name, new THREE.BufferAttribute(dst, w));
  }
  g.dispose();
  return out;
}
// recolour a painted geometry in place: fn(color, pos, i) mutates color
export function recolor(g, fn) {
  const c = g.attributes.color, p = g.attributes.position, o = new THREE.Color(), q = new THREE.Vector3();
  for (let i = 0; i < c.count; i++) { o.setRGB(c.getX(i), c.getY(i), c.getZ(i)); q.fromBufferAttribute(p, i); fn(o, q, i); c.setXYZ(i, o.r, o.g, o.b); }
  c.needsUpdate = true;
  return g;
}
// a hue/sat/lightness shift, for re-dyeing a tree's leaves
export const hsl = (dh, ds = 0, dl = 0) => o => o.offsetHSL(dh, ds, dl);

// ------------------------------------------------------------------ painted atlases
// Greyscale + alpha, tinted by vertex colour; C1/C2 flat clusters (seen from above), S1/S2 hanging sprays (uv.y = 0 at
// the attachment). Mips keep their alpha-tested coverage (same trick as vegetation.js finishAtlas).
const atlasCache = new Map();
export function atlas(kind) {
  if (!atlasCache.has(kind)) atlasCache.set(kind, finishAtlas(paintAtlas(kind)));
  return atlasCache.get(kind);
}
function paintAtlas(kind) {
  const { g } = makeCanvas(AT);
  const r = mulberry32(kind.length * 1013 + 7);
  g.clearRect(0, 0, AT, AT); g.lineCap = 'round'; g.lineJoin = 'round';
  const gv = v => { v = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${v},${v},${v})`; };
  // slender lanceolate bamboo leaf from (x, y) toward angle a: short stalk, widest a third along, long drawn tip
  const blade = (x, y, len, wid, a, v, curl = 0) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const grd = g.createLinearGradient(0, -wid, 0, wid);
    grd.addColorStop(0, gv(v + 26)); grd.addColorStop(0.5, gv(v + 6)); grd.addColorStop(1, gv(v - 34));
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.12, -wid * 0.9, len * 0.45, -wid * 1.05 + curl, len, curl * 2);
    g.bezierCurveTo(len * 0.5, wid * 0.95 + curl, len * 0.14, wid * 0.8, 0, 0);
    g.fill();
    g.globalAlpha = 0.4; g.strokeStyle = gv(v - 75); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(len * 0.05, 0); g.quadraticCurveTo(len * 0.5, curl * 0.6, len * 0.92, curl * 1.8); g.stroke();
    g.globalAlpha = 1; g.restore();
  };
  const twig = ([x0, y0, x1, y1], frac, w0, v) => {
    const cx = (x0 + x1) / 2, L = (y1 - y0 - 14) * frac, ph = r() * TAU, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([cx + Math.sin(t * 3.4 + ph) * 8 * t, y0 + 6 + t * L, t]); }
    g.strokeStyle = gv(v);
    for (let i = 1; i < pts.length; i++) { g.lineWidth = w0 * (1 - pts[i][2] * 0.7) + 1; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
    return pts;
  };
  for (const key of ['C1', 'C2', 'S1', 'S2']) {
    const rc = RECTS[key], [x0, y0, x1, y1] = rc, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, spray = key[0] === 'S';
    if (kind === 'bamboo') {
      if (!spray) {
        // a hand of leaves seen from above: 3-4 twig tips, each fanning 4-6 blades outward, overlapping
        // (each hub a fan of 4-6 blades splayed ~15 degrees apart, like a painted bamboo hand)
        const hubs = key === 'C1' ? 3 : 4;
        for (let h = 0; h < hubs; h++) {
          const ha = h / hubs * TAU + r() * 0.8, hd = 10 + r() * 22, hx = cx + Math.cos(ha) * hd, hy = cy + Math.sin(ha) * hd;
          const nb = 4 + Math.floor(r() * 3), bend = (r() - 0.5) * 10;
          for (let k = 0; k < nb; k++) {
            const a = ha + (k - (nb - 1) / 2) * 0.27 + (r() - 0.5) * 0.12;
            blade(hx, hy, 78 + r() * 30 - Math.abs(k - (nb - 1) / 2) * 8, 10 + r() * 3, a, (k % 2 ? 170 : 212) + r() * 40, bend);
          }
        }
      } else {
        // a drooping spray: alternate blades hang from a thin twig, the lowest ones longest
        const P = twig(rc, 0.62, 3.5, 95);
        for (let i = 3; i < P.length; i += 3) {
          const [x, y, t] = P[i], side = (i / 3) % 2 ? 1 : -1;
          blade(x, y, 58 + t * 44 + r() * 14, 8 + r() * 2.5, Math.PI / 2 - side * (0.55 - t * 0.3) + (r() - 0.5) * 0.2, 180 + r() * 60, side * 3);
        }
        const [ex, ey] = P[P.length - 1];
        for (let k = 0; k < 3; k++) blade(ex, ey, 80 + r() * 30, 9, Math.PI / 2 + (k - 1) * 0.28, 205 + r() * 40, 0);
      }
    } else if (kind === 'maple') {
      // dense maple clusters: overlapping seven-lobed stars (darker ones underneath), and twigs hung with stars
      const star = (x, y, R, a, v) => {
        for (let i = 0; i < 7; i++) { const k = i - 3; blade(x, y, R * (1 - Math.abs(k) * 0.12), R * 0.24, a + k * 0.62, v - Math.abs(k) * 6); }
        g.fillStyle = gv(v - 14); g.beginPath(); g.arc(x, y, R * 0.18, 0, TAU); g.fill();
      };
      if (!spray) {
        for (let i = 0; i < 30; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 84; star(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 30 + r() * 12, r() * TAU, i < 12 ? 160 + r() * 30 : 205 + r() * 45); }
      } else {
        const P = twig(rc, 0.85, 4, 80);
        for (let k = 0; k < 9; k++) { const [x, y, t] = P[Math.min(P.length - 1, 2 + k * 2)], side = k % 2 ? 1 : -1; star(x + side * 14, y + 10, 30 - t * 6, Math.PI / 2 - side * 0.5, 195 + r() * 55); }
      }
    } else if (kind === 'fern') {
      // fronds: a rachis with paired pinnae that shorten toward the tip (C = seen from above, S = arching side view)
      const frond = (x, y, len, a, v, w) => {
        g.save(); g.translate(x, y); g.rotate(a);
        g.strokeStyle = gv(v - 60); g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
        const n = 13;
        for (let k = 1; k < n; k++) {
          const t = k / n, pl = w * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) * (1 - t * 0.35);
          for (const s of [-1, 1]) {
            g.save(); g.translate(len * t, 0); g.rotate(s * (1.05 - t * 0.35));
            const grd = g.createLinearGradient(0, 0, pl, 0); grd.addColorStop(0, gv(v - 18)); grd.addColorStop(1, gv(v + 22));
            g.fillStyle = grd; g.beginPath(); g.moveTo(0, 0);
            g.quadraticCurveTo(pl * 0.5, -pl * 0.22, pl, 0); g.quadraticCurveTo(pl * 0.5, pl * 0.22, 0, 0); g.fill();
            g.restore();
          }
        }
        g.restore();
      };
      if (!spray) { for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + r() * 0.3; frond(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 104 + r() * 16, a, 170 + r() * 60, 26 + r() * 6); } }
      else frond(cx, y0 + 8, (y1 - y0) - 24, Math.PI / 2, 190 + r() * 40, 50);
    } else if (kind === 'litter') {
      // ground litter (flat decals): C1 bamboo leaves, C2 maple stars, S1 ginkgo fans + oval leaves, S2 twigs + husks
      if (key === 'C1') { for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 96; blade(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 40 + r() * 22, 5 + r() * 2, r() * TAU, 150 + r() * 100, (r() - 0.5) * 5); } }
      else if (key === 'C2') {
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, d = Math.sqrt(r()) * 92, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, R = 20 + r() * 9, rot = r() * TAU, v = 160 + r() * 90;
          for (let k = 0; k < 7; k++) { const kk = k - 3; blade(x, y, R * (1 - Math.abs(kk) * 0.13), R * 0.2, rot + kk * 0.66, v - Math.abs(kk) * 7); }
        }
      } else if (key === 'S1') {
        for (let i = 0; i < 18; i++) {
          const x = x0 + 16 + r() * 96, y = y0 + 16 + r() * 480, R = 22 + r() * 8, a = r() * TAU, v = 170 + r() * 80;
          if (i % 2) blade(x, y, R * 1.4, R * 0.42, a, v);
          else { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = gv(v); g.beginPath(); g.moveTo(0, 0); for (let k = 0; k <= 10; k++) { const t = -0.9 + 1.8 * k / 10, rr = R * (k === 5 ? 0.72 : 1); g.lineTo(R * 0.3 + Math.cos(t) * rr, Math.sin(t) * rr); } g.closePath(); g.fill(); g.restore(); }
        }
      } else {
        for (let i = 0; i < 9; i++) { const x = x0 + 14 + r() * 100, y = y0 + 20 + r() * 460, L = 40 + r() * 60, a = r() * TAU; g.strokeStyle = gv(120 + r() * 60); g.lineWidth = 3 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
        for (let i = 0; i < 6; i++) blade(x0 + 20 + r() * 90, y0 + 30 + r() * 440, 50 + r() * 20, 12 + r() * 4, r() * TAU, 200 + r() * 50, (r() - 0.5) * 8);
      }
    }
  }
  return g;
}
function finishAtlas(g) {
  const S = AT, d0 = new Uint8Array(g.getImageData(0, 0, S, S).data.buffer.slice(0));
  let known = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) known[i] = d0[i * 4 + 3] >= 16 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = known.slice();
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = y * S + x; if (known[i]) continue;
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let dy = -S; dy <= S; dy += S) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dy + dx; if (!known[j]) continue; rr += d0[j * 4]; gg += d0[j * 4 + 1]; bb += d0[j * 4 + 2]; n++;
      }
      if (n) { d0[i * 4] = rr / n; d0[i * 4 + 1] = gg / n; d0[i * 4 + 2] = bb / n; next[i] = 1; }
    }
    known = next;
  }
  const thr = CARD_ALPHA * 255;
  let cov0 = 0; for (let i = 3; i < d0.length; i += 4) if (d0[i] > thr) cov0++; cov0 /= S * S;
  const levels = [d0];
  for (let w = S, prev = d0; w > 1; w >>= 1) {
    const w2 = w >> 1, d = new Uint8Array(w2 * w2 * 4), A = new Float32Array(w2 * w2);
    for (let y = 0; y < w2; y++) for (let x = 0; x < w2; x++) {
      let rr = 0, gg = 0, bb = 0, a = 0, r2 = 0, g2 = 0, b2 = 0;
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2 + (k >> 1)) * w + x * 2 + (k & 1)) * 4, al = prev[i + 3];
        rr += prev[i] * al; gg += prev[i + 1] * al; bb += prev[i + 2] * al; a += al; r2 += prev[i]; g2 += prev[i + 1]; b2 += prev[i + 2];
      }
      const o = (y * w2 + x) * 4;
      if (a > 0) { d[o] = rr / a; d[o + 1] = gg / a; d[o + 2] = bb / a; } else { d[o] = r2 / 4; d[o + 1] = g2 / 4; d[o + 2] = b2 / 4; }
      A[y * w2 + x] = a / 4;
    }
    const H = new Uint32Array(1024); for (let i = 0; i < A.length; i++) H[Math.min(1023, A[i] * 4) | 0]++;
    let need = cov0 * A.length, b = 1023; while (b > 0 && (need -= H[b]) > 0) b--;
    const s = clamp(thr / Math.max(1, b / 4), 0.5, 6);
    for (let i = 0; i < A.length; i++) d[i * 4 + 3] = Math.min(255, A[i] * s);
    levels.push(d); prev = d;
  }
  const tex = new THREE.DataTexture(d0, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = levels.map((data, i) => ({ data, width: S >> i, height: S >> i }));
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ materials (memoised; never disposed)
// Leaf flutter for hanging sprays (uv.x > 0.5 = the atlas's spray half; uv.y = 0 at the twig): a small wave down the
// strand on top of the whole-plant wind, so leaves shimmer while the culms sway.
const FLUTTER = /* glsl */`
  {
    float fk = (uv.x > 0.5 ? uv.y * uv.y : 0.35) * uWindStr;
    float fph = uTime * 3.3 + cWorld.x * 1.7 + cWorld.z * 1.3 + cWorld.y * 0.9;
    cWorld.xyz += vec3(uWindDir.x, 0.0, uWindDir.y) * (sin(fph) * 0.5 + 0.35) * 0.09 * fk + vec3(0.0, sin(fph * 1.37) * 0.03 * fk, 0.0);
  }`;
const MOONLESS = ''; // the regions are daytime: no moonlit floor needed on the cards
const _M = new Map();
const memo = (k, fn) => { if (!_M.has(k)) _M.set(k, fn()); return _M.get(k); };
export function M(key) {
  switch (key) {
    case 'bark': return memo(key, () => VEG_MATS.bark());
    case 'foliage': return memo(key, () => VEG_MATS.foliage());
    case 'bushFoliage': return memo(key, () => VEG_MATS.foliage({ occluder: false }));
    case 'rock': return memo(key, () => VEG_MATS.rock());
    case 'susuki': return memo(key, () => VEG_MATS.susuki());
    case 'cards:momiji': case 'cards:round': case 'cards:ginkgo': case 'cards:sakura': case 'cards:pine':
      return memo(key, () => VEG_MATS.cards(key.slice(6)));
    case 'bushCards': return memo(key, () => VEG_MATS.cards('round', { occluder: false }));
    // dense autumn-maple clusters (the village momiji atlas is airy, for its see-through tiers)
    case 'cards:maple': return memo(key, () => vegToon({ occluder: true, vertexColors: true, wind: 'leaf', sway: 2, map: atlas('maple'), alphaTest: CARD_ALPHA, side: THREE.DoubleSide, noFlip: true, brush: 0.12, rim: 0.55, shadowSat: 0.3, term: [-0.45, 0.35] }));
    // tall culms: reed wind (sway grows with height), toned down for 6-9 m stalks
    case 'culm': return memo(key, () => vegToon({ occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.32, brush: 0.14, rim: 0.42, term: [-0.1, 0.36] }));
    case 'culmLeaf': return memo(key, () => vegToon({ fragOut: MOONLESS, occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.32, vertexWorld: FLUTTER, map: atlas('bamboo'), alphaTest: CARD_ALPHA, side: THREE.DoubleSide, noFlip: true, brush: 0.1, rim: 0.5, shadowSat: 0.35, term: [-0.4, 0.35] }));
    // knee-high plants: ferns, hostas, shoots (no x-ray: they never hide the hero)
    case 'fern': return memo(key, () => vegToon({ vertexColors: true, wind: 'grass', windAmt: 0.35, vertexWorld: FLUTTER, map: atlas('fern'), alphaTest: CARD_ALPHA, side: THREE.DoubleSide, noFlip: true, brush: 0.1, rim: 0.45, term: [-0.35, 0.35] }));
    case 'plant': return memo(key, () => vegToon({ vertexColors: true, wind: 'leaf', windAmt: 0.3, side: THREE.DoubleSide, noFlip: true, brush: 0.14, rim: 0.45, term: [-0.25, 0.4] }));
    case 'litter': return memo(key, () => { const m = vegToon({ vertexColors: true, map: atlas('litter'), alphaTest: CARD_ALPHA, brush: 0.12, rim: 0.1, term: [-0.3, 0.3], shadowSat: 0.3 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; return m; });
    case 'moss': return memo(key, () => vegToon({ vertexColors: true, brush: 0.3, brushScale: 1.4, rim: 0.28, term: [-0.2, 0.42], shadowSat: 0.4 }));
    // falling water sheet (mapleProps.waterfallGeo): scrolling foam streaks, soft side edges, a bright boil at the foot
    case 'fall': return memo(key, () => {
      const m = makeToon({
        vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, noFlip: true, emissive: '#8fd4ec', emissiveIntensity: 0.28, rim: 0.5, brush: 0.02, term: [-0.4, 0.5], shadowSat: 0.1,
        vertexPars: 'varying vec2 vF;', vertexWorld: 'vF = uv;', fragPars: 'varying vec2 vF;',
        fragColor: /* glsl */`{
          float s1 = texture2D(uBrush, vec2(vF.x * 2.3, vF.y * 0.7 - uTime * 0.85)).b;
          float s2 = texture2D(uBrush, vec2(vF.x * 4.7 + 0.31, vF.y * 1.5 - uTime * 1.6)).r;
          float k = smoothstep(0.48, 0.78, s1 * 0.6 + s2 * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), k * 0.75);
          diffuseColor.a *= (0.62 + 0.38 * k) * smoothstep(0.0, 0.1, vF.x) * smoothstep(1.0, 0.9, vF.x) * smoothstep(1.0, 0.9, vF.y);
        }`,
      });
      m.depthWrite = false;
      return m;
    });
    default: {
      const dm = memo('detailMats', () => detailMats());
      const k = key.startsWith('d:') ? key.slice(2) : key;
      if (dm[k]) return dm[k];
      throw new Error('biome kit: unknown material ' + key);
    }
  }
}
export const detailGlow = () => M('d:glow');
// batches that should not cast shadows (flat or tiny things)
const NO_CAST = new Set(['litter', 'd:flat', 'd:grass', 'd:reed', 'd:glow', 'd:cloth', 'fern', 'moss', 'bushCards']);
const NO_SORT = new Set(['litter', 'd:flat', 'd:grass', 'd:reed', 'd:stone', 'rock', 'moss', 'fern', 'plant']);

// ------------------------------------------------------------------ Placer
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export class Placer {
  /** heightAt(x, z) for ground placement */
  constructor({ heightAt = () => 0, name = 'biome' } = {}) {
    this.H = heightAt; this.name = name;
    this.batches = new Map(); this.sink = { parts: [] };
    this.colliders = []; this.lights = []; this.blockers = []; this.meshes = [];
    this.group = new THREE.Group(); this.group.name = name + ':props';
    this.counts = {};
  }
  batch(key) {
    let b = this.batches.get(key);
    if (!b) { b = new Batch(key, M(key), { castShadow: !NO_CAST.has(key), sort: !NO_SORT.has(key) }); this.batches.set(key, b); }
    return b;
  }
  count(k, n = 1) { this.counts[k] = (this.counts[k] || 0) + n; }
  /** one instance of `geo` in material batch `key` */
  put(key, geo, x, y, z, { rot = 0, s = 1, tiltX = 0, tiltZ = 0, color = null } = {}) {
    if (!geo) return;
    _e.set(tiltX, rot, tiltZ, 'YXZ'); _q.setFromEuler(_e);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.setScalar(s);
    _m4.compose(_p.set(x, y ?? this.H(x, z), z), _q, _s);
    this.batch(key).add(geo, _m4, color, this.sink);
  }
  /** a multi-part plant/prop: parts = { materialKey: geo, ... } */
  multi(parts, x, y, z, opts) { for (const k in parts) this.put(k, parts[k], x, y, z, opts); }
  /** a kit piece (Builder.finish() geos: body / glow / leaf / cloth / water + lights) at (x, z) facing yaw rot */
  piece(pc, x, z, rot = 0, { y, s = 1, tiltX = 0, tiltZ = 0, lights = true } = {}) {
    y ??= this.H(x, z);
    for (const k of ['body', 'glow', 'leaf', 'cloth', 'water', 'stone', 'flat']) if (pc[k]) this.put('d:' + (k === 'water' ? 'body' : k), pc[k], x, y, z, { rot, s, tiltX, tiltZ });
    if (lights) for (const l of pc.lights || []) {
      _e.set(tiltX, rot, tiltZ, 'YXZ'); _q.setFromEuler(_e); _m4.compose(_p.set(x, y, z), _q, _s.setScalar(s));
      this.lights.push({ ...l, pos: l.pos.clone().applyMatrix4(_m4) });
    }
  }
  collide(x, z, r) { this.colliders.push({ x, z, r }); }
  /** nav blocker (monsters path around it): circle */
  block(x, z, r) { this.blockers.push({ x, z, r }); }
  light(l) { this.lights.push(l); }
  /** a loose mesh (animated parts); disposed with the placer (its geometry only) */
  mesh(m) { this.group.add(m); this.meshes.push(m); return m; }
  build() {
    for (const b of this.batches.values()) b.build(this.group);
    this.sink.parts.length = 0;
    return this.group;
  }
  stats() {
    let tris = 0, inst = 0, calls = 0;
    for (const b of this.batches.values()) if (b.mesh) { calls++; inst += b.mesh.instanceCount ?? 0; }
    return { calls, inst, counts: this.counts, colliders: this.colliders.length, lights: this.lights.length, tris };
  }
  dispose() {
    for (const b of this.batches.values()) b.mesh?.dispose();
    for (const m of this.meshes) m.geometry?.dispose();
    this.group.removeFromParent();
    this.batches.clear(); this.meshes.length = 0;
  }
}
