// Japanese-garden vegetation: sakura, momiji, niwaki pines, round trees, bamboo, hydrangea, susuki,
// flowers and a GPU grass field. Everything sways with the shared wind and bends around actors.
import * as THREE from 'three';
import { makeToon, applyDepth, POOL_GLSL } from '../gfx/materials.js';
import { leafCardTexture, floretTexture, makeCanvas } from '../gfx/textures.js';
import { branch, puff, cards, paint, merge, xf, tube } from '../gfx/geom.js';
import { mulberry32, TAU, clamp, Noise } from '../core/util.js';
import { T, WORLD, OVERLAY_GLSL } from './terrain.js';
import { treeKeepOut, inTown, PLATEAU, NORTH, HILL, BAMBOO, GREEN_BELTS, STREET_TREES } from './layout.js';
import { mossCap, mossLine, mossyStone } from './buildings/props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = h => new THREE.Color(h);
const cols = (...h) => h.map(col);
const UP = V(0, 1, 0);
// Crowns are leaf and blossom cards only (the owner's call: "one or the other", 2026-10-02). The smooth foliage masses
// are still built (they shape where the cards go) but render only into the sun's shadow map, on this layer, so trees
// keep a soft, solid shadow without showing a smooth blob through the leaves. The sun's shadow camera enables it.
export const SHADOW_ONLY_LAYER = 1;
// inner leaf layer: darker cards set inside the shell so crowns read full and deep, not see-through
const INNER = 0.78;
const _N = new Noise(311);

// ------------------------------------------------------------------ trees
// Species silhouettes, designed to read from the ~22 m isometric camera:
//  pine   niwaki black pine: gnarly leaning S-trunk, a few near-horizontal branches ending in flat cloud-pruned pads
//         (wide shallow domes, dark undersides) with needle fringes on the rims and needle tufts on top.
//  sakura wide umbrella of soft blossom masses on dark spreading limbs; weeping blossom strands curtain the rim.
//  momiji slender multi-stem maple with airy horizontal tiers of star-leaf cards, crimson below to orange on top.
//  round / ginkgo  a few large lumpy (not spherical) masses with leaf-card fringes; the ginkgo stacks them into a column.
// Each tree = bark tubes + foliage masses (LEAF_EDGE shader) + atlas cards (clusters on the masses, hanging sprays).
export const TREE_SPECIES = {
  sakura: { radius: 0.45, bark: ['#46303a', '#735260'] },
  momiji: { radius: 0.4, bark: ['#4e4046', '#7c6a66'] },
  pine: { radius: 0.4, bark: ['#463a3e', '#7a665c'] },
  round: { radius: 0.4, bark: ['#6e5444', '#8c6a54'] },
  ginkgo: { radius: 0.35, bark: ['#66564a', '#907c66'] },
};

// ---- foliage card atlases
// 512² greyscale + alpha, tinted by vertex colour. Canvas layout: two round clusters on the left (C1 top, C2 bottom)
// and two tall hanging sprays on the right (S1, S2) attached at the top edge. UVs are inset so the wind shader can tell
// sprays apart by uv.x > 0.5; uv.y = 0 at a spray's attachment and 1 at its tip (DataTexture rows = canvas rows).
const AT = 512;
const RECTS = { C1: [0, 0, 256, 256], C2: [0, 256, 256, 512], S1: [256, 0, 384, 512], S2: [384, 0, 512, 512] };
const UVR = {};
for (const [k, [x0, y0, x1, y1]] of Object.entries(RECTS)) UVR[k] = [(x0 + 2) / AT, (y0 + 2) / AT, (x1 - 2) / AT, (y1 - 2) / AT];
const CARD_ALPHA = 0.42;
const atlasCache = new Map();
function cardAtlas(kind) {
  if (!atlasCache.has(kind)) atlasCache.set(kind, finishAtlas(paintAtlas(kind)));
  return atlasCache.get(kind);
}
function paintAtlas(kind) {
  const { c, g } = makeCanvas(AT);
  const r = mulberry32(kind.length * 977 + 3);
  g.clearRect(0, 0, AT, AT); g.lineCap = 'round'; g.lineJoin = 'round';
  const gv = v => { v = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${v},${v},${v})`; };
  const leaf = (x, y, len, wid, a, v) => { // pointed leaf from (x, y) toward angle a
    g.save(); g.translate(x, y); g.rotate(a);
    const grd = g.createLinearGradient(0, -wid, 0, wid);
    grd.addColorStop(0, gv(v + 22)); grd.addColorStop(1, gv(v - 26));
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.42, -wid, len, 0); g.quadraticCurveTo(len * 0.42, wid, 0, 0); g.fill();
    g.globalAlpha = 0.35; g.strokeStyle = gv(v - 70); g.lineWidth = 1.2; g.beginPath(); g.moveTo(len * 0.08, 0); g.lineTo(len * 0.8, 0); g.stroke(); g.globalAlpha = 1;
    g.restore();
  };
  const star = (x, y, R, a, v) => { // Japanese maple leaf: seven slender lobes fanned around the stalk
    for (let i = 0; i < 7; i++) { const k = i - 3; leaf(x, y, R * (1 - Math.abs(k) * 0.13), R * 0.2, a + k * 0.66, v - Math.abs(k) * 7); }
    g.fillStyle = gv(v - 12); g.beginPath(); g.arc(x, y, R * 0.16, 0, TAU); g.fill();
    g.strokeStyle = gv(v - 90); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * R * 0.32, y - Math.sin(a) * R * 0.32); g.stroke();
  };
  const blossom = (x, y, rad, v, rot) => { // five notched petals, dark eye, stamens
    for (let p = 0; p < 5; p++) {
      g.save(); g.translate(x, y); g.rotate(rot + p / 5 * TAU);
      const grd = g.createLinearGradient(0, 0, rad, 0); grd.addColorStop(0, gv(v - 34)); grd.addColorStop(0.55, gv(v)); grd.addColorStop(1, gv(v + 12));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(rad * 0.3, -rad * 0.62, rad * 0.98, -rad * 0.56, rad, -rad * 0.14);
      g.lineTo(rad * 0.84, 0); g.lineTo(rad, rad * 0.14);
      g.bezierCurveTo(rad * 0.98, rad * 0.56, rad * 0.3, rad * 0.62, 0, 0);
      g.fill(); g.restore();
    }
    g.fillStyle = gv(v - 110); g.beginPath(); g.arc(x, y, rad * 0.17, 0, TAU); g.fill();
    g.fillStyle = gv(v - 70); for (let k = 0; k < 5; k++) { const a = rot + k / 5 * TAU + 0.6; g.beginPath(); g.arc(x + Math.cos(a) * rad * 0.34, y + Math.sin(a) * rad * 0.34, rad * 0.06, 0, TAU); g.fill(); }
  };
  const needle = (x, y, a, len, v, w = 3) => { g.strokeStyle = gv(v); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); };
  const fan = (x, y, R, a, v) => { // ginkgo: stalk + scalloped fan with a centre notch
    g.save(); g.translate(x, y); g.rotate(a);
    g.strokeStyle = gv(v - 80); g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.38, 0); g.stroke();
    const grd = g.createRadialGradient(R * 0.38, 0, 2, R * 0.38, 0, R * 0.64); grd.addColorStop(0, gv(v - 40)); grd.addColorStop(1, gv(v + 8));
    g.fillStyle = grd; g.beginPath(); g.moveTo(R * 0.38, 0);
    for (let i = 0; i <= 12; i++) { const t = -0.9 + 1.8 * i / 12, rr = R * 0.62 * (i === 6 ? 0.72 : 1 + 0.05 * Math.sin(i * 2.7)); g.lineTo(R * 0.38 + Math.cos(t) * rr, Math.sin(t) * rr); }
    g.closePath(); g.fill();
    g.globalAlpha = 0.25; g.strokeStyle = gv(v - 60); g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const t = -0.8 + 1.6 * i / 8; g.beginPath(); g.moveTo(R * 0.4, 0); g.lineTo(R * 0.38 + Math.cos(t) * R * 0.55, Math.sin(t) * R * 0.55); g.stroke(); }
    g.globalAlpha = 1; g.restore();
  };
  // a twig hanging from the top of a spray rect; returns points along it (x, y, t) for the leaves / blossoms
  const twig = ([x0, y0, x1, y1], frac, w0, v) => {
    const cx = (x0 + x1) / 2, L = (y1 - y0 - 14) * frac, ph = r() * TAU, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([cx + Math.sin(t * 4.2 + ph) * 7 * t, y0 + 6 + t * L, t]); }
    g.strokeStyle = gv(v);
    for (let i = 1; i < pts.length; i++) { g.lineWidth = w0 * (1 - pts[i][2] * 0.7) + 1; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
    return pts;
  };
  const inCircle = (cx, cy, R) => { const a = r() * TAU, d = Math.sqrt(r()) * R; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d, a, d / R]; };
  for (const key of ['C1', 'C2', 'S1', 'S2']) {
    const rc = RECTS[key], [x0, y0, x1, y1] = rc, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const spray = key[0] === 'S';
    if (kind === 'sakura') {
      if (!spray) {
        for (let i = 0; i < 64; i++) { const [x, y] = inCircle(cx, cy, 96); blossom(x, y, 13 + r() * 9, i < 22 ? 178 + r() * 28 : 214 + r() * 38, r() * TAU); }
      } else {
        const P = twig(rc, 0.97, 6, 70);
        for (let i = 1; i < P.length; i++) {
          const [x, y, t] = P[i], n = t < 0.5 ? 2 : 1;
          for (let k = 0; k < n; k++) { const side = (i + k) % 2 ? 1 : -1; blossom(x + side * (5 + r() * 17 * (1 - t * 0.4)), y + (r() - 0.5) * 10, 19 - t * 9 + r() * 3, 200 + r() * 50, r() * TAU); }
        }
      }
    } else if (kind === 'pine') {
      g.lineCap = 'round';
      if (!spray) {
        for (let k = 0; k < 7; k++) {
          const [sx, sy] = k ? inCircle(cx, cy, 52) : [cx, cy];
          for (let i = 0; i < 34; i++) { const a = r() * TAU, len = 34 + r() * 40; needle(sx + Math.cos(a) * 6, sy + Math.sin(a) * 6, a + (r() - 0.5) * 0.3, len, 150 + r() * 90 * (k ? 1 : 0.7), 3.2); }
        }
      } else {
        const P = twig(rc, 0.72, 4, 90);
        for (let i = 1; i < P.length; i++) {
          const [x, y, t] = P[i];
          for (let k = 0; k < 4; k++) { const side = k % 2 ? 1 : -1, a = Math.PI / 2 - side * (0.45 + r() * 0.75); needle(x, y, a, 30 + r() * 20 + t * 8, 140 + t * 70 + r() * 30, 3); }
        }
        const [ex, ey] = P[P.length - 1];
        for (let i = 0; i < 26; i++) { const a = Math.PI / 2 + (r() - 0.5) * 2.4; needle(ex, ey, a, 34 + r() * 26, 190 + r() * 55, 3); }
      }
    } else if (kind === 'momiji') {
      if (!spray) {
        for (let i = 0; i < 9; i++) { const [x, y, a] = inCircle(cx, cy, 58); star(x, y, 40 + r() * 16, a + (r() - 0.5) * 1.2, i < 3 ? 185 + r() * 20 : 212 + r() * 38); }
      } else {
        const P = twig(rc, 0.78, 4, 80);
        for (let k = 0; k < 6; k++) {
          const [x, y, t] = P[Math.min(P.length - 1, 3 + k * 4)], side = k % 2 ? 1 : -1;
          star(x + side * 12, y + 14, 34 - t * 8, Math.PI / 2 - side * 0.5, 205 + r() * 45);
        }
      }
    } else if (kind === 'ginkgo') {
      if (!spray) {
        for (let i = 0; i < 22; i++) { const [x, y, a] = inCircle(cx, cy, 58); fan(x, y, 50 + r() * 16, a + (r() - 0.5) * 0.8, i < 9 ? 130 + r() * 30 : 212 + r() * 40); }
      } else {
        const P = twig(rc, 0.85, 4, 90);
        for (let k = 0; k < 8; k++) { const [x, y, t] = P[Math.min(P.length - 1, 2 + k * 3)], side = k % 2 ? 1 : -1; fan(x, y, 42 - t * 8, Math.PI / 2 - side * (0.7 + r() * 0.4), 205 + r() * 45); }
      }
    } else { // round: broadleaf
      if (!spray) {
        for (let i = 0; i < 78; i++) { const [x, y, a, d] = inCircle(cx, cy, 84); leaf(x, y, 30 + r() * 16, 11 + r() * 5, a + (r() - 0.5) * 1.3, (i < 34 ? 120 + r() * 35 : 205 + r() * 40) + d * 10); }
      } else {
        const P = twig(rc, 0.9, 4, 90);
        for (let i = 2; i < P.length; i += 2) { const [x, y, t] = P[i], side = (i / 2) % 2 ? 1 : -1; leaf(x, y, 40 - t * 10 + r() * 6, 14 - t * 3, Math.PI / 2 - side * (0.7 + r() * 0.5), 200 + r() * 45); }
      }
    }
  }
  return g;
}
// Canvas -> DataTexture with hand-built mips: colour bled under transparent texels (no dark fringes at the cut-out edge)
// and each level's alpha rescaled so the alpha-tested coverage matches the full-size card, so foliage cards keep their
// density when zoomed out instead of thinning out and vanishing in the mips.
function finishAtlas(g) {
  const S = AT, d0 = new Uint8Array(g.getImageData(0, 0, S, S).data.buffer.slice(0));
  let known = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) known[i] = d0[i * 4 + 3] >= 16 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) { // (the atlas keeps a transparent margin, so the border rows can be skipped)
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
    // scale so the same fraction of texels passes the alpha test as at full size: alpha quantile from a histogram
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

// ---- geometry helpers
// Foliage card soup: flat cards (clusters on the masses) and bent hanging sprays, with per-vertex colour and normal.
class CardSet {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  _v(p, n, u, v, c) { this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v); this.C.push(c.r, c.g, c.b); }
  quad(p, ax, ay, n, rect, c) {
    const [u0, v0, u1, v1] = UVR[rect], b = this.P.length / 3, q = new THREE.Vector3();
    this._v(q.copy(p).sub(ax).sub(ay), n, u0, v0, c);
    this._v(q.copy(p).add(ax).sub(ay), n, u1, v0, c);
    this._v(q.copy(p).add(ax).add(ay), n, u1, v1, c);
    this._v(q.copy(p).sub(ax).add(ay), n, u0, v1, c);
    this.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // a leaf-cluster card at surface point p (outward normal n): roughly tangent, randomly rolled, tilted out a little
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
// A foliage mass: lumpy icosphere (a few random lobes push it out of round), flattened belly, normals blended toward a
// shared crown centre (the tree reads as one soft volume, not a pile of balls) and optionally toward up (flat tiers).
function mass(c, r, { detail = 2, sx = 1, sy = 1, sz = 1, lumps = 0.3, rough = 0.06, seed = 0, crown = null, crownMix = 0.5, up = 0, belly = 0.3 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position, nrm = new Float32Array(pos.count * 3);
  const rr = mulberry32(seed * 7919 + 101), L = [];
  for (let i = 0; i < 5; i++) { const u = rr() * 1.6 - 0.6, th = rr() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u)); L.push([s * Math.cos(th), u, s * Math.sin(th), 0.4 + rr() * 0.6]); }
  const kAt = (x, y, z) => { // surface radius factor along unit direction (x, y, z), before the squash
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
// Cloud-pruned pine pad: a wide, shallow, lobed dome with a rounded lip and a flat underside (surface of revolution
// around a wavy outline). Returns the geometry and rim(a) -> outline radius.
const PAD_PROFILE = [[0, 1, 0, 1], [0.3, 0.95, 0.12, 1], [0.55, 0.82, 0.3, 0.95], [0.74, 0.62, 0.55, 0.83], [0.88, 0.36, 0.82, 0.57], [0.97, 0.07, 1, 0.12], [0.95, -0.55, 0.72, -0.7], [0.78, -0.95, 0.22, -1], [0.42, -1.02, 0, -1], [0, -1.05, 0, -1]];
function pad(c, R, { h = 0.5, hb = 0.16, lobes = 4, seed = 0, segs = 20, crown = null } = {}) {
  const r = mulberry32(seed * 131 + 7), ph = [r() * TAU, r() * TAU, r() * TAU], a1 = 0.13 + r() * 0.08, a2 = 0.06 + r() * 0.05;
  const rim = a => R * (1 + a1 * Math.sin(lobes * a + ph[0]) + a2 * Math.sin((lobes + 3) * a + ph[1]) + 0.035 * Math.sin(11 * a + ph[2]));
  const pos = [], nor = [], idx = [], n = new THREE.Vector3(), cn = new THREE.Vector3(), row = segs + 1;
  for (const [f, yy, nx, ny] of PAD_PROFILE) {
    for (let k = 0; k <= segs; k++) {
      const a = k / segs * TAU, ca = Math.cos(a), sa = Math.sin(a), o = rim(a) * f;
      const y = yy > 0 ? yy * h + 0.12 * h * f * (1 - f) * 4 * _N.n2(ca * 1.7 + seed * 1.3, sa * 1.7 - seed) : yy * hb;
      pos.push(c.x + ca * o, c.y + y, c.z + sa * o);
      n.set(ca * nx, ny, sa * nx).normalize();
      if (crown) n.lerp(cn.set(c.x + ca * o - crown.x, c.y + y - crown.y, c.z + sa * o - crown.z).normalize(), 0.2).normalize();
      nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < PAD_PROFILE.length - 1; i++) for (let k = 0; k < segs; k++) {
    const a = i * row + k, b = a + row;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return { g, rim };
}
// colour a foliage mass: a ramp by height through the crown, sunny tops, darker cooler undersides, soft patches
const COOL = new THREE.Color(0.8, 0.85, 1.0);
function paintMass(g, stops, { y0, y1, hi = null, hiAmt = 0.4, under = 0.72, patch = 0.12, seed = 0 }) {
  const tmp = new THREE.Color();
  return paint(g, (p, n, o) => {
    let t = (p.y - y0) / Math.max(0.3, y1 - y0) + _N.n2(p.x * 0.8 + seed, p.z * 0.8 - seed) * patch + n.y * 0.1;
    t = clamp(t) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t));
    o.copy(stops[i]).lerp(stops[i + 1], t - i);
    if (hi) o.lerp(hi, clamp((n.y - 0.45) * 1.5) * hiAmt);
    if (n.y < 0) { const k = clamp(-n.y * 1.6); o.multiplyScalar(1 - (1 - under) * k); o.lerp(tmp.copy(o).multiply(COOL), k); }
  });
}
function paintBark(g, kind) {
  const [c0, c1] = TREE_SPECIES[kind].bark.map(col);
  return paint(g, (p, n, o) => {
    let t = n.y * 0.3 + 0.5 + _N.n2(p.x * 3.1 + p.y * 1.3, p.z * 3.1 - p.y * 2.2) * 0.22;
    if (kind === 'sakura' && Math.sin(p.y * 21 + p.x * 3) > 0.72) t += 0.3; // horizontal lenticel bands
    if (kind === 'pine' && _N.n2(p.x * 7 + p.z * 2, p.y * 5 + p.z * 7) > 0.3) t -= 0.28; // plated bark
    o.copy(c0).lerp(c1, clamp(t));
  });
}
// Root flare: chunky roots that leave the trunk well above the lawn blades (0.3-0.5 m) and arch down into the
// ground, so the base reads as gripping the earth instead of a post stuck in the grass.
const roots = (B, r, len, n, h = 0.35, k = 1) => {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.9, L = len * (1.1 + r() * 0.8), d = V(Math.cos(a), 0, Math.sin(a)), sd = V(-d.z, 0, d.x), w = (r() - 0.5) * 0.35 * L;
    const t = 0.8 + r() * 0.45; // thickness varies root to root
    const p0 = V(0, h + 0.45, 0).addScaledVector(d, 0.04), p1 = d.clone().multiplyScalar(L * 0.34).add(V(0, h * 0.8 + 0.12, 0)).addScaledVector(sd, w * 0.4);
    const p2 = d.clone().multiplyScalar(L * 0.7).add(V(0, 0.1, 0)).addScaledVector(sd, w), p3 = d.clone().multiplyScalar(L).add(V(0, -0.14, 0)).addScaledVector(sd, w * 1.4);
    B.trunk.push(tube([{ p: p0, r: 0.17 * k * t }, { p: p1, r: 0.14 * k * t }, { p: p2, r: 0.085 * k * t }, { p: p3, r: 0.035 * k * t }], 6, true));
  }
};
const pick = (r, a) => a[Math.floor(r() * a.length)];
const dirAt = a => V(Math.cos(a), 0, Math.sin(a));

// ---- species
function buildPine(B, seed) {
  const r = mulberry32(seed * 131 + 4);
  const leanA = r() * TAU, lean = 0.75 + r() * 0.55, d = dirAt(leanA), side = V(-d.z, 0, d.x);
  const H = 4.3 + r() * 0.7, segs = 9, pts = [], wob = r() * TAU;
  for (let i = 0; i <= segs; i++) { // gnarly S-trunk: leans out, the top turns back over the base
    const t = i / segs, out = lean * (Math.sin(t * Math.PI * 0.85) * 0.95 + t * 0.35 - 0.55 * t * t);
    const p = V(0, -0.2 + t * (H + 0.2), 0).addScaledVector(d, out).addScaledVector(side, 0.3 * Math.sin(t * 5.5 + wob) * t);
    pts.push({ p, r: (0.27 * Math.pow(1 - t, 0.9) + 0.07) * (1 + 0.12 * Math.sin(t * 19 + wob)) });
  }
  B.trunk.push(tube(pts, 8, true));
  roots(B, r, 0.5, 4);
  const at = t => { const f = t * segs, i = Math.min(segs - 1, Math.floor(f)); return pts[i].p.clone().lerp(pts[i + 1].p, f - i); };
  const top = pts[segs].p, crown = at(0.62).add(V(0, 0.3, 0)), pads = [];
  const nb = 3 + (r() < 0.6 ? 1 : 0), a0 = leanA + Math.PI * (0.7 + r() * 0.6);
  for (let i = 0; i < nb; i++) { // near-horizontal limbs: dip, then rise into the pad
    const t = 0.36 + i * (0.4 / nb) + r() * 0.05, P = at(t), a = a0 + i * 2.35 + (r() - 0.5) * 0.5, dd = dirAt(a);
    const L = (1.75 - i * 0.22) * (0.9 + r() * 0.25), R = (1.12 - i * 0.1) * (0.9 + r() * 0.2);
    const mid = P.clone().addScaledVector(dd, L * 0.5).add(V(0, -0.1 + r() * 0.1, 0)).addScaledVector(V(-dd.z, 0, dd.x), (r() - 0.5) * 0.5);
    const end = P.clone().addScaledVector(dd, L).add(V(0, 0.18 + r() * 0.2, 0));
    const r0 = pts[Math.round(t * segs)].r * 0.6;
    B.trunk.push(branch(P, mid, r0, 0.07, V(0, 0.06, 0), 4, 6), branch(mid, end, 0.07, 0.04, V(0, -0.06, 0), 4, 5));
    pads.push({ c: end.clone().add(V(0, 0.06, 0)), R: R * 1.08, h: 0.32 + r() * 0.08, hb: 0.12 });
    if (r() < 0.55) { const a2 = a + (r() < 0.5 ? 1 : -1) * (0.8 + r() * 0.4); pads.push({ c: end.clone().add(V(Math.cos(a2) * R * 0.8, -0.1 - r() * 0.12, Math.sin(a2) * R * 0.8)), R: R * 0.58, h: 0.26, hb: 0.09 }); }
  }
  pads.push({ c: top.clone().add(V(0, 0.02, 0)), R: 1.05 + r() * 0.2, h: 0.46, hb: 0.14 });
  if (r() < 0.65) pads.push({ c: top.clone().add(V((r() - 0.5) * 0.5, 0.42, (r() - 0.5) * 0.5)), R: 0.55 + r() * 0.1, h: 0.3, hb: 0.1 });
  const stops = cols('#12302a', '#1c4838', '#2c6844', '#468650'), hi = col('#78b266');
  const fr0 = col('#1e4a36'), fr1 = col('#58985a'), tuft = cols('#58985a', '#66a660', '#74b268', '#84be70');
  pads.forEach((q, i) => {
    const { g, rim } = pad(q.c, q.R, { h: q.h, hb: q.hb, lobes: 3 + (i % 3), seed: seed * 17 + i, segs: q.R > 0.8 ? 20 : 14, crown });
    B.masses.push(paintMass(g, stops, { y0: q.c.y - q.hb, y1: q.c.y + q.h * 0.9, hi, hiAmt: 0.35, under: 0.6, patch: 0.1, seed: i }));
    // bristly needle fringe all round the rim: sprays pointing out and down, tips lighter
    const nf = Math.round(9 + q.R * 13);
    for (let k = 0; k < nf; k++) {
      const a = (k + r() * 0.7) / nf * TAU, rd = dirAt(a), ro = rim(a);
      const att = q.c.clone().addScaledVector(rd, ro * 0.66).add(V(0, q.h * 0.3, 0));
      const dir = rd.clone().multiplyScalar(0.8).add(V(0, -0.2 - r() * 0.4, 0)).normalize(), len = 0.62 + r() * 0.3;
      const mid = att.clone().addScaledVector(dir, len * 0.5), tip = mid.clone().addScaledVector(dir.add(V(0, -0.3, 0)).normalize(), len * 0.5);
      const side = V(-rd.z, 0, rd.x).applyAxisAngle(rd, (r() - 0.5) * 0.9);
      B.cards.spray([att, mid, tip], side, 0.46 + r() * 0.14, rd.clone().multiplyScalar(0.5).add(V(0, 0.85, 0)).normalize(), k % 2 ? 'S1' : 'S2', fr0, fr1.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08));
    }
    // needle tufts covering the top
    const nt = Math.round(9 + q.R * 20), nu = Math.round(4 + q.R * 7);
    for (let k = 0; k < nt + nu; k++) {
      const under = k >= nt; // a darker layer through the pad's middle and belly, so a pad never reads hollow from the side
      const a = r() * TAU, f = Math.sqrt(r()) * (under ? 0.8 : 0.92), rd = dirAt(a), ro = rim(a) * f;
      const p = q.c.clone().addScaledVector(rd, ro).add(V(0, under ? q.h * 0.15 - q.hb * 0.4 * r() : q.h * (1 - f * f * 0.85) + 0.02, 0));
      const nn = V(0, under ? 0.4 : 1, 0).addScaledVector(rd, 0.3 + f * 0.6).normalize();
      B.cards.cluster(r, p, nn, (under ? 0.75 : 0.62) + r() * 0.34, k % 2 ? 'C1' : 'C2', under ? pick(r, stops).clone().lerp(pick(r, tuft), 0.45) : pick(r, tuft), 0.6);
    }
  });
}
function buildSakura(B, seed) {
  const r = mulberry32(seed * 131 + 6);
  const H0 = 1.3 + r() * 0.3, base = V((r() - 0.5) * 0.4, H0, (r() - 0.5) * 0.4);
  B.trunk.push(branch(V(0, -0.2, 0), base, 0.36, 0.27, V((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25), 5, 8));
  roots(B, r, 0.6, 5);
  const crown = V(base.x, 3.1, base.z), nl = 4 + (r() < 0.5 ? 1 : 0), tips = [];
  for (let i = 0; i < nl; i++) { // spreading limbs, each forking toward the umbrella rim
    const a = i / nl * TAU + r() * 0.6, d = dirAt(a);
    const L1 = base.clone().addScaledVector(d, 0.85 + r() * 0.3).add(V(0, 0.85 + r() * 0.35, 0));
    B.trunk.push(branch(base, L1, 0.2, 0.12, V(0, 0.1, 0), 4, 7));
    const ns = r() < 0.55 ? 2 : 1;
    for (let j = 0; j < ns; j++) {
      const a2 = a + (ns === 2 ? (j ? 0.4 : -0.4) : 0) + (r() - 0.5) * 0.2, d2 = dirAt(a2);
      const tip = V(base.x, 0, base.z).addScaledVector(d2, 1.75 + r() * 0.4); tip.y = 2.95 + r() * 0.35;
      B.trunk.push(branch(L1, tip, 0.11, 0.045, V(0, 0.22, 0), 4, 5));
      tips.push({ p: tip, d: d2, a: a2 });
    }
  }
  const stops = cols('#b85a88', '#d67aa4', '#eb98bb', '#f7b6cf'), hi = col('#ffd6e6');
  const bloom = cols('#ffb6d0', '#ffc2d9', '#ffcede', '#f9a6c6', '#ffe0eb', '#ffaacb'), strandTop = col('#e27aa8'), strandTip = [col('#ffd2e4'), col('#fff0f6'), col('#ffbcd4')];
  const M = tips.map((t, i) => ({ c: t.p.clone().add(V(0, 0.32, 0)).addScaledVector(t.d, 0.12), r: 0.84 + r() * 0.2, d: t.d, a: t.a, rim: true }));
  M.push({ c: V(base.x + (r() - 0.5) * 0.3, 3.7, base.z + (r() - 0.5) * 0.3), r: 1.2, top: true });
  const geos = M.map((m, i) => mass(m.c, m.r, { detail: m.top ? 4 : 3, sx: 1.18, sz: 1.18, sy: m.top ? 0.5 : 0.6, lumps: 0.34, seed: seed * 23 + i, crown, crownMix: 0.45, belly: 0.25 }));
  geos.forEach((g, i) => B.masses.push(paintMass(cullBuried(g, g.userData.m, geos.map(q => q.userData.m)), stops, { y0: 2.6, y1: 4.4, hi, hiAmt: 0.45, under: 0.78, patch: 0.14, seed: i })));
  M.forEach((m, mi) => {
    const rx = m.r * 1.18, ry = m.r * (m.top ? 0.5 : 0.6), kAt = geos[mi].userData.m.k;
    // a shell of blossom clusters over the upper / outer surface, sticking out past the mass for a frothy silhouette
    const nc = m.top ? 60 : 42, ni = m.top ? 18 : 12;
    for (let k = 0; k < nc + ni; k++) {
      const inner = k >= nc;
      const dir = V(r() - 0.5, (inner ? -0.1 : -0.3) + r() * 1.25, r() - 0.5); if (m.d) dir.addScaledVector(m.d, 0.45);
      dir.normalize();
      const p = m.c.clone().add(V(dir.x * rx, dir.y * ry, dir.z * rx).multiplyScalar(kAt(dir.x, dir.y, dir.z) * (inner ? INNER + r() * 0.12 : 0.98 + r() * 0.16)));
      B.cards.cluster(r, p, dir.clone().lerp(UP, 0.25).normalize(), (inner ? 1.25 : 1.05) + r() * 0.45, k % 2 ? 'C1' : 'C2', inner ? pick(r, stops).clone().lerp(pick(r, bloom), 0.35) : pick(r, bloom), 0.6);
    }
    if (!m.rim) return;
    // weeping strands curtaining the outer rim: arc out, then fall
    const ns = 6 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < ns; k++) {
      const a = m.a + (k / (ns - 1) - 0.5) * 2.6 + (r() - 0.5) * 0.3, rd = dirAt(a);
      const top = m.c.clone().addScaledVector(rd, rx * (0.86 + r() * 0.16)).add(V(0, -ry * 0.2, 0));
      const len = 1.0 + r() * 1.05;
      const p1 = top.clone().addScaledVector(rd, 0.25).add(V(0, -0.18, 0)), p2 = p1.clone().addScaledVector(rd, 0.1).add(V(0, -len * 0.45, 0)), p3 = p2.clone().add(V(0, -len * 0.55, 0));
      const side = V(-rd.z, 0, rd.x).applyAxisAngle(UP, (r() - 0.5) * 0.8);
      B.cards.spray([top, p1, p2, p3], side, 0.5 + r() * 0.14, rd.clone().multiplyScalar(0.75).add(V(0, 0.5, 0)).normalize(), k % 2 ? 'S1' : 'S2', strandTop, pick(r, strandTip));
    }
  });
}
function buildMomiji(B, seed) {
  const r = mulberry32(seed * 131 + 9);
  const ns = 2 + (r() < 0.5 ? 1 : 0), a0 = r() * TAU, stems = [];
  for (let i = 0; i < ns; i++) { // slender, splaying stems
    const d = dirAt(a0 + i / ns * TAU + (r() - 0.5) * 0.5), h = 3.6 + r() * 0.4 - i * 0.3, pts = [], k0 = i ? 1 : 0.55;
    for (let k = 0; k <= 7; k++) { const t = k / 7; pts.push({ p: V(0, -0.2 + t * (h + 0.2), 0).addScaledVector(d, (0.12 + t * 0.6 + Math.sin(t * 3.2 + i) * 0.12) * k0), r: 0.16 * (1 - t) + 0.04 }); }
    B.trunk.push(tube(pts, 7, true)); stems.push(pts);
  }
  roots(B, r, 0.4, 4, 0.3, 0.6);
  const stemAt = (pts, y) => { for (let i = 1; i < pts.length; i++) if (pts[i].p.y >= y) { const a = pts[i - 1].p, b = pts[i].p; return a.clone().lerp(b, clamp((y - a.y) / Math.max(1e-3, b.y - a.y))); } return pts[pts.length - 1].p.clone(); };
  const crown = V(0, 3.0, 0);
  const TIERS = [[1.95, 2.05, 3], [2.7, 1.75, 2], [3.4, 1.35, 2], [4.0, 0.8, 1]];
  const coreCols = cols('#4a1420', '#661a24', '#842628');
  const leafCols = [cols('#c42e2a', '#d8362c', '#b82632', '#e2482e'), cols('#e0442c', '#ee5a30', '#d63a30', '#f47034'), cols('#f06a32', '#ff8238', '#f25a30', '#ff9a3c'), cols('#ff8c3a', '#ffa444', '#ffb84e', '#f67a34')];
  TIERS.forEach(([y, R, n], ti) => {
    y += (r() - 0.5) * 0.12; R *= 0.9 + r() * 0.2;
    const ta = a0 + ti * 2.4;
    for (let j = 0; j < n; j++) { // horizontal branches; the lower tiers get a thin, shadowy foliage core
      const a = ta + j / n * TAU + (r() - 0.5) * 0.6, d = dirAt(a), f = n === 1 ? 0.15 : 0.5 + r() * 0.2;
      const src = stemAt(stems[(j + ti) % ns], y - 0.45), end = V(0, y - 0.06, 0).addScaledVector(d, R * f);
      B.trunk.push(branch(src, end, 0.065, 0.03, V(0, 0.14, 0), 4, 5));
      if (ti > 0) continue; // only a small shadowy core under the lowest tier; the rest is leaves: airy, see-through
      const g = mass(V(0, y - 0.1, 0).addScaledVector(d, R * 0.32), 0.4 + r() * 0.08, { sx: 1.3, sz: 1.3, sy: 0.36, lumps: 0.4, seed: seed * 31 + ti * 5 + j, crown, crownMix: 0.25, up: 0.3, belly: 0.45 });
      B.masses.push(paintMass(g, coreCols, { y0: y - 0.25, y1: y + 0.25, hi: col('#d85a3a'), hiAmt: 0.2, under: 0.7, patch: 0.15, seed: ti * 3 + j }));
    }
    // airy layer of star-leaf cards, denser toward the rim, nearly horizontal and overlapping like shingles
    const nc = Math.round(18 + R * 13);
    for (let k = 0; k < nc; k++) {
      const a = r() * TAU, f = Math.sqrt(0.1 + r() * 0.9), rd = dirAt(a);
      const p = V(0, y + (r() - 0.35) * 0.36 - f * f * 0.12, 0).addScaledVector(rd, R * f * 1.08);
      const nn = V(0, 1, 0).addScaledVector(rd, 0.2 + f * 0.35).add(V(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.5)).normalize();
      B.cards.cluster(r, p, nn, 0.8 + r() * 0.35, k % 2 ? 'C1' : 'C2', pick(r, leafCols[ti]), 0.35, V(0, 1, 0).addScaledVector(rd, 0.35).normalize());
    }
    // a few sprays dipping at the tier rim
    const nsp = ti < 3 ? 4 : 2;
    for (let k = 0; k < nsp; k++) {
      const a = ta + (k + r() * 0.7) / nsp * TAU, rd = dirAt(a);
      const top = V(0, y + 0.05, 0).addScaledVector(rd, R * 0.85), len = 0.55 + r() * 0.3;
      const p1 = top.clone().addScaledVector(rd, len * 0.45).add(V(0, -len * 0.25, 0)), p2 = p1.clone().addScaledVector(rd, len * 0.25).add(V(0, -len * 0.45, 0));
      B.cards.spray([top, p1, p2], V(-rd.z, 0, rd.x), 0.4 + r() * 0.1, V(0, 1, 0).addScaledVector(rd, 0.5).normalize(), k % 2 ? 'S1' : 'S2', leafCols[ti][0], leafCols[Math.min(3, ti + 1)][1]);
    }
  });
}
function buildRound(B, seed, ginkgo) {
  const r = mulberry32(seed * 131 + (ginkgo ? 11 : 5));
  const H = ginkgo ? 2.2 : 1.9, lean = V((r() - 0.5) * 0.6, H, (r() - 0.5) * 0.6);
  B.trunk.push(branch(V(0, -0.2, 0), lean, 0.32, 0.2, V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), 6, 8));
  roots(B, r, 0.55, 4);
  const M = [];
  if (!ginkgo) {
    const nb = 3, a0 = r() * TAU;
    for (let i = 0; i < nb; i++) {
      const a = a0 + i / nb * TAU + (r() - 0.5) * 0.6, d = dirAt(a), sp = 1.05 * (0.85 + r() * 0.3);
      const end = lean.clone().addScaledVector(d, sp).add(V(0, 0.75 + r() * 0.7, 0));
      B.trunk.push(branch(lean, end, 0.17, 0.07, V(0, 0.3, 0), 5, 6));
      M.push({ c: end.clone().add(V(0, 0.3, 0)).addScaledVector(d, 0.2), r: 1.0 + r() * 0.22, sy: 0.8, d });
    }
    M.push({ c: V(lean.x, H + 2.1, lean.z), r: 1.3, sy: 0.84, detail: 4 });
  } else { // columnar: masses stacked up a leader, a couple of side lobes
    const top = lean.clone().add(V((r() - 0.5) * 0.4, 3.0, (r() - 0.5) * 0.4));
    B.trunk.push(branch(lean, top, 0.2, 0.07, V(0.1, 0, 0.1), 6, 7));
    const a0 = r() * TAU;
    [[0.75, 1.15, 0.45], [1.75, 1.05, 0.35], [2.75, 0.85, 0.2], [3.5, 0.55, 0.05]].forEach(([h, rr, off], i) => {
      const d = dirAt(a0 + i * 2.1), c = lean.clone().lerp(top, h / 3.5).addScaledVector(d, off);
      if (off > 0.2) B.trunk.push(branch(lean.clone().lerp(top, (h - 0.5) / 3.5), c, 0.1, 0.05, V(0, 0.2, 0), 4, 5));
      M.push({ c, r: rr * (0.92 + r() * 0.16), sy: 0.8, d, detail: i < 2 ? 4 : 3 });
    });
  }
  const crown = M.reduce((a, m) => a.add(m.c), V(0, 0, 0)).multiplyScalar(1 / M.length);
  const stops = ginkgo ? cols('#b08414', '#c89a1c', '#dcb02a', '#e8c23a') : cols('#245a36', '#347a3e', '#488f44', '#5a9e48');
  const hi = col(ginkgo ? '#ffe070' : '#9ccc62');
  const leafC = ginkgo ? cols('#ffd84e', '#ffe274', '#ffcc40', '#fff094') : cols('#74bc56', '#86c85e', '#9ad466', '#68b050');
  const y0 = Math.min(...M.map(m => m.c.y - m.r)), y1 = Math.max(...M.map(m => m.c.y + m.r));
  const geos = M.map((m, i) => mass(m.c, m.r, { detail: m.detail || 3, sy: m.sy, lumps: 0.36, rough: 0.07, seed: seed * 29 + i + (ginkgo ? 50 : 0), crown, crownMix: 0.6, belly: 0.32 }));
  geos.forEach((g, i) => B.masses.push(paintMass(cullBuried(g, g.userData.m, geos.map(q => q.userData.m)), stops, { y0, y1, hi, hiAmt: 0.12, under: 0.74, patch: 0.14, seed: i })));
  M.forEach((m, mi) => { // leaf-card shell (top-heavy) + a few sprays under the lower rim
    const kAt = geos[mi].userData.m.k;
    const nc = Math.round(30 + m.r * 22), ni = Math.round(9 + m.r * 9);
    for (let k = 0; k < nc + ni; k++) {
      const inner = k >= nc;
      const dir = V(r() - 0.5, -0.35 + r() * 1.55, r() - 0.5).normalize(); // top-heavy: the camera looks down on crowns
      const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * m.sy, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * (inner ? INNER + r() * 0.12 : 0.98 + r() * 0.16)));
      B.cards.cluster(r, p, dir, (inner ? 1.15 : 0.95) + r() * 0.4, k % 2 ? 'C1' : 'C2', inner ? pick(r, stops).clone().lerp(pick(r, leafC), 0.3) : pick(r, leafC), 0.6, dir.clone().lerp(p.clone().sub(crown).normalize(), 0.5).normalize());
    }
    const nsp = 3;
    for (let k = 0; k < nsp; k++) {
      const a = r() * TAU, rd = dirAt(a), top = m.c.clone().addScaledVector(rd, m.r * 0.78).add(V(0, -m.r * m.sy * 0.3, 0)), len = 0.6 + r() * 0.3;
      const p1 = top.clone().addScaledVector(rd, 0.18).add(V(0, -len * 0.5, 0)), p2 = p1.clone().add(V(0, -len * 0.5, 0));
      B.cards.spray([top, p1, p2], V(-rd.z, 0, rd.x), 0.42, rd.clone().add(V(0, 0.3, 0)).normalize(), k % 2 ? 'S1' : 'S2', leafC[0], leafC[2]);
    }
  });
}
const BUILDERS = { pine: buildPine, sakura: buildSakura, momiji: buildMomiji, round: (B, s) => buildRound(B, s, false), ginkgo: (B, s) => buildRound(B, s, true) };
function buildTree(kind, seed) {
  const B = { trunk: [], masses: [], cards: new CardSet() };
  BUILDERS[kind](B, seed);
  return { trunkGeo: paintBark(merge(B.trunk), kind), foliage: merge(B.masses), cardGeo: B.cards.geo() };
}

// Drop canopy triangles buried inside neighbouring masses (never visible). Conservative: a vertex counts as buried only
// well inside another mass's ellipsoid (lump margin) and above its flattened belly.
function cullBuried(g, self, all) {
  const pos = g.attributes.position, n = pos.count;
  const buried = new Uint8Array(n);
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

// ------------------------------------------------------------------ bamboo
function buildBamboo(seed) {
  const r = mulberry32(seed + 900);
  const parts = [], leaves = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 1.6, z = (r() - 0.5) * 1.6, h = 4.5 + r() * 2.5, lean = V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    const pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push({ p: V(x + lean.x * t * t * h * 0.2, t * h, z + lean.z * t * t * h * 0.2), r: 0.09 - t * 0.03 }); }
    const g = tube(pts, 6, false);
    paint(g, (p, nn, o) => { const seg = (p.y % 0.6) / 0.6; o.set('#8fd06a').lerp(col('#c8e890'), clamp(nn.x * 0.3 + 0.3)); if (seg < 0.06) o.set('#5a9a48'); });
    parts.push(g);
    // node rings
    for (let y = 0.6; y < h - 0.3; y += 0.6) { const t = y / h; const ring = new THREE.TorusGeometry(0.075 - t * 0.02, 0.018, 4, 8); xf(ring, { p: [x + lean.x * t * t * h * 0.2, y, z + lean.z * t * t * h * 0.2], r: [Math.PI / 2, 0, 0] }); paint(ring, (p, nn, o) => o.set('#6aae50')); parts.push(ring); }
    const top = pts[pts.length - 1].p;
    leaves.push(cards(top.clone().add(V(0, -0.8, 0)), 0.9, 7, { size: 1.3, crown: top.clone().add(V(0, -1.5, 0)), seed: seed * 7 + i, squash: 0.6 }));
    leaves.push(cards(V(x, h * 0.62, z), 0.6, 4, { size: 1.1, crown: V(x, h * 0.5, z), seed: seed * 13 + i, squash: 0.6 }));
  }
  const leafGeo = paint(merge(leaves), (p, nn, o) => o.set('#7cc85a').lerp(col('#b0e27a'), clamp(nn.y)));
  return { stalks: merge(parts), leaves: leafGeo };
}

// ------------------------------------------------------------------ bushes
// Bushes are small trees: lumpy foliage masses (the canopy material: leaf-lobe silhouettes, floret bumps) under a
// shell of broadleaf cards, plus blooms from the sakura atlas tinted per species -- mophead hydrangea heads (blue or
// pink, one colour per bush), clusters of azalea flowers -- or, on the box bushes, glossy red berries.
function buildBush(kind, seed) {
  const r = mulberry32(seed + 77);
  const n = 3 + Math.floor(r() * 2), crown = V(0, 0.5, 0), M = [];
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = i ? 0.26 + r() * 0.2 : 0; M.push({ c: V(Math.cos(a) * d, 0.42 + r() * 0.18 - d * 0.2, Math.sin(a) * d), r: (i ? 0.34 : 0.44) + r() * 0.12 }); }
  const geos = M.map((m, i) => mass(m.c, m.r, { detail: 2, sy: 0.82, lumps: 0.35, rough: 0.08, seed: seed * 13 + i, crown, crownMix: 0.5, belly: 0.45 }));
  const green = kind === 'azalea' ? cols('#2a5230', '#3c7240', '#52904a', '#6aa854') : kind === 'box' ? cols('#1f4a2c', '#2e6436', '#427e46', '#58964e') : cols('#28563a', '#387640', '#4c904a', '#62a652');
  const masses = geos.map((g, i) => paintMass(cullBuried(g, g.userData.m, geos.map(q => q.userData.m)), green, { y0: 0.05, y1: 1.05, hi: col('#9ccc62'), hiAmt: 0.18, under: 0.72, patch: 0.14, seed: i }));
  const leaves = new CardSet(), blooms = new CardSet(), berries = [];
  const leafC = kind === 'box' ? cols('#4f9a50', '#5aa656', '#46904a', '#68b05c') : cols('#6cb452', '#7cc05a', '#8ccc62', '#5ea84c');
  M.forEach((m, mi) => {
    const kAt = geos[mi].userData.m.k, nc = Math.round(15 + m.r * 26), ni = Math.round(4 + m.r * 8);
    for (let k = 0; k < nc + ni; k++) {
      const inner = k >= nc;
      const dir = V(r() - 0.5, -0.25 + r() * 1.3, r() - 0.5).normalize();
      const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * 0.82, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * (inner ? INNER + r() * 0.12 : 0.97 + r() * 0.12)));
      leaves.cluster(r, p, dir, (inner ? 0.6 : 0.5) + r() * 0.22, k % 2 ? 'C1' : 'C2', inner ? pick(r, green).clone().lerp(pick(r, leafC), 0.35) : pick(r, leafC), 0.6, dir.clone().lerp(p.clone().sub(crown).normalize(), 0.5).normalize());
    }
  });
  if (kind === 'box') { // berries: little glossy red spheres tucked into the upper surface (smooth-normal icosahedra)
    for (let i = 0; i < 12; i++) {
      const m = pick(r, M), dir = V(r() - 0.5, 0.2 + r() * 0.9, r() - 0.5).normalize(), kAt = geos[M.indexOf(m)].userData.m.k;
      const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * 0.82, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * 1.02));
      const b = new THREE.IcosahedronGeometry(0.042 + r() * 0.012, 0), bp = b.attributes.position, bn = new Float32Array(bp.count * 3);
      for (let j = 0; j < bp.count; j++) { const v = V(bp.getX(j), bp.getY(j), bp.getZ(j)).normalize(); bn[j * 3] = v.x; bn[j * 3 + 1] = v.y; bn[j * 3 + 2] = v.z; }
      b.setAttribute('normal', new THREE.BufferAttribute(bn, 3)); b.translate(p.x, p.y, p.z);
      paint(b, (pp, nn, o) => o.set('#e83a3a').lerp(col('#ffb0a0'), clamp(nn.y * 0.8 - 0.3)));
      berries.push(b);
    }
  } else {
    const pal = kind === 'hydrangea' ? (r() < 0.5 ? cols('#8aa8ff', '#a6b4ff', '#b8a0ff', '#c8d4ff') : cols('#ff9ec8', '#f0a8e8', '#ffb8d8', '#e890d0')) : cols('#ff5a98', '#ff7aa8', '#ff9ec0', '#f86890');
    const nf = kind === 'hydrangea' ? 7 : 14;
    for (let i = 0; i < nf; i++) {
      const mi = Math.floor(r() * M.length), m = M[mi], dir = V(r() - 0.5, 0.25 + r() * 0.8, r() - 0.5).normalize(), kAt = geos[mi].userData.m.k;
      const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * 0.82, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * 1.04));
      blooms.cluster(r, p, dir.clone().lerp(UP, 0.3).normalize(), kind === 'hydrangea' ? 0.5 + r() * 0.14 : 0.3 + r() * 0.08, i % 2 ? 'C1' : 'C2', pick(r, pal), 0.4);
    }
  }
  return { mass: merge(masses), leaves: leaves.geo(), blooms: kind === 'box' ? null : blooms.geo(), berries: berries.length ? merge(berries) : null };
}

// ------------------------------------------------------------------ grass blade + flower + susuki meshes
function bladeGeo() {
  const segs = 4, pos = [], idx = [], uv = [];
  for (let i = 0; i <= segs; i++) {
    const y = i / segs, w = 0.5 * Math.pow(1 - y, 0.9), z = y * y * 0.25;
    if (i < segs) { pos.push(-w, y, z, w, y, z); uv.push(0, y, 1, y); } else { pos.push(0, y, z); uv.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function flowerGeo(kind) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.02, 0.025, 1, 3, 1, true); xf(stem, { p: [0, 0.5, 0] });
  paint(stem, (p, n, o) => o.set('#3a7a3a')); parts.push(stem);
  if (kind === 'daisy') {
    for (let i = 0; i < 6; i++) { const pe = new THREE.SphereGeometry(0.1, 5, 3); xf(pe, { p: [Math.cos(i / 6 * TAU) * 0.12, 1, Math.sin(i / 6 * TAU) * 0.12], s: [1.4, 0.35, 0.8], r: [0, -i / 6 * TAU, 0] }); paint(pe, (p, n, o) => o.set('#ffffff')); parts.push(pe); }
    const c = new THREE.SphereGeometry(0.07, 6, 4); xf(c, { p: [0, 1.03, 0], s: [1, 0.6, 1] }); paint(c, (p, n, o) => o.set('#ffd23a')); parts.push(c);
  } else if (kind === 'bell') {
    for (let i = 0; i < 3; i++) { const b = new THREE.ConeGeometry(0.1, 0.16, 6, 1, true); xf(b, { p: [Math.cos(i * 2.1) * 0.08, 0.92 + i * 0.06, Math.sin(i * 2.1) * 0.08], r: [Math.PI, 0, 0.3] }); paint(b, (p, n, o) => o.set('#ffffff')); parts.push(b); }
  } else { // tulip-ish cup
    const cup = new THREE.SphereGeometry(0.13, 7, 5, 0, TAU, 0, Math.PI * 0.62); xf(cup, { p: [0, 1.06, 0], s: [1, 1.3, 1], r: [Math.PI, 0, 0] }); paint(cup, (p, n, o) => o.set('#ffffff')); parts.push(cup);
  }
  const g = merge(parts); g.computeBoundingSphere(); return g;
}
function susukiGeo(seed) {
  const r = mulberry32(seed + 5), parts = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, h = 1.1 + r() * 0.6, lean = 0.25 + r() * 0.3;
    const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(Math.cos(a) * lean * t * t, t * h, Math.sin(a) * lean * t * t), r: 0.025 * (1 - t * 0.7) }); }
    const g = tube(pts, 3, true); paint(g, (p, n, o) => o.set('#6a9a4a').lerp(col('#b8c878'), p.y / h)); parts.push(g);
    if (i < 6) { // plume
      const top = pts[5].p, pl = [];
      for (let k = 0; k <= 4; k++) { const t = k / 4; pl.push({ p: top.clone().add(V(Math.cos(a) * 0.22 * t, 0.35 * t - 0.05, Math.sin(a) * 0.22 * t)), r: 0.07 * Math.sin(t * Math.PI) + 0.01 }); }
      const pg = tube(pl, 5, true); paint(pg, (p, n, o) => o.set('#f4e4c8').lerp(col('#fff8ec'), clamp(n.y))); parts.push(pg);
    }
  }
  // long leaves
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU; const pts = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(Math.cos(a) * 0.6 * t, Math.sin(t * 2.2) * 0.7, Math.sin(a) * 0.6 * t), r: 0.03 * (1 - t) + 0.005 }); }
    const g = tube(pts, 3, true); paint(g, (p, n, o) => o.set('#5a9048').lerp(col('#9ac068'), clamp(p.y))); parts.push(g);
  }
  return merge(parts);
}
// Rock: lumpy stone with a raised moss cap draped over its top (ragged noise edge) and a few pebbles at its foot
function rockGeo(seed) {
  // welded, round-shaded stone with a moss cushion growing out of its top (no flat facets, no saw-tooth cap edge)
  const g = mossyStone(puff(V(0, 0.15, 0), 0.6, { detail: 2, noise: 0.35, squash: 0.62, seed }), { amt: 0.4, sc: 3.2, seed, lift: 0.055, stone: ['#a8a0b4', '#d4ccd4'], moss: '#74a854', hi: '#a4cc68' });
  const r = mulberry32(seed * 3 + 1), parts = [g];
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU, d = 0.62 + r() * 0.3, pb = new THREE.IcosahedronGeometry(0.07 + r() * 0.06, 0); pb.scale(1.2, 0.6, 1); pb.translate(Math.cos(a) * d, 0.1, Math.sin(a) * d);
    const c = col(['#b8b0bc', '#cfc6c8', '#a8a0ac'][i % 3]); paint(pb, (p, n, o) => o.copy(c).multiplyScalar(0.85 + 0.2 * clamp(n.y)));
    parts.push(pb);
  }
  return merge(parts);
}

// ------------------------------------------------------------------ batched rendering
// Every vegetation material is ONE BatchedMesh holding all variant geometries of all species that share it.
// BatchedMesh frustum-culls per instance — for the main camera AND the sun's shadow camera — so off-screen trees
// cost nothing, and the whole island is ~13 draw calls instead of one call per species × variant × part.
// makeToon's vertex injection only knows InstancedMesh, so vegToon() re-derives the world position and the wind
// origin from batchingMatrix inside the vertexWorld hook (shared by the colour and the shadow-depth programs).
const WIND_ID = { grass: 1, tree: 2, leaf: 3, cloth: 4, reed: 5 };
const GRASS_FAR = 152; // camera distance beyond which a grass chunk is fully fogged (fog far 140 + the chunk's radius)
// Trees (sway: 1 = bark / masses, 2 = cards): outer limbs, pads and sprays sway more than the core. The extra offset grows
// with distance from the trunk axis in local space (the same function for bark and foliage, so pads stay on their
// branches) with a phase per limb; hanging sprays (card atlas right half: uv.x > 0.5, uv.y = 0 at the attachment) swing
// on top of that with a wave running down the strand.
const SWAY_GLSL = /* glsl */`
  vec3 limbSway(vec3 lp, vec3 org, vec2 uvv, float sprays) {
    vec3 wd = vec3(uWindDir.x, 0.0, uWindDir.y), sd = vec3(-wd.z, 0.0, wd.x);
    float k = smoothstep(0.45, 2.6, length(lp.xz)) * smoothstep(0.8, 2.6, lp.y);
    float ph = uTime * 1.55 + dot(org.xz, vec2(0.41, 0.27)) + dot(lp.xz, vec2(0.9, 0.6));
    float gust = sin(dot(org.xz, uWindDir) * 0.12 - uTime * 0.9) * 0.5 + 0.5;
    vec3 off = (wd * (sin(ph) * 0.5 + 0.2 + gust * 0.5) * 0.12 + sd * sin(ph * 0.83 + 1.7) * 0.05) * k;
    off.y += sin(ph * 1.31 + 0.6) * 0.045 * k;
    if (sprays > 0.5 && uvv.x > 0.5) {
      float hg = uvv.y * uvv.y, p2 = ph * 1.7 - lp.y * 1.2;
      off += (wd * (0.45 + 0.55 * sin(p2)) * (0.55 + gust * 0.7) + sd * sin(p2 * 0.71 + 1.1) * 0.4) * 0.2 * hg;
    }
    return off * uWindStr * uWindAmt;
  }`;
export function vegToon(o) {
  const mode = WIND_ID[o.wind] || 0;
  const vw = /* glsl */`
    #ifdef USE_BATCHING
      cOrigin = (modelMatrix * batchingMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      cWorld = modelMatrix * batchingMatrix * vec4(transformed, 1.0);
      ${mode ? `cWorld.xyz += windOffset(cWorld.xyz, transformed, cOrigin, ${mode}, uv);` : ''}
      ${o.sway ? `cWorld.xyz += limbSway(transformed, cOrigin, uv, ${o.sway > 1 ? '1.0' : '0.0'});` : ''}
      #ifdef TOON
        vCWN = normalize(mat3(modelMatrix) * mat3(batchingMatrix) * objectNormal);
      #endif
    #endif
  `;
  return makeToon({ ...o, wind: undefined, sway: undefined, vertexPars: (o.sway ? SWAY_GLSL : '') + (o.vertexPars || ''), vertexWorld: vw + (o.vertexWorld || '') });
}
// Leafy silhouettes for canopy clumps: where a clump turns away from the camera, bite noise-shaped leaf lobes
// out of it so crowns read as masses of foliage instead of smooth balls. Interior (camera-facing) pixels skip it.
const LEAF_EDGE = {
  uniforms: { uFloret: { value: null } },
  fragPars: /* glsl */`
    uniform sampler2D uFloret;
    float gFloretH = 0.0;
    vec3 floretSample(vec3 p, vec3 n) {
      vec3 w = abs(n); w = pow(w, vec3(6.0)); w /= (w.x + w.y + w.z + 1e-4);
      return texture2D(uFloret, p.zy).rgb * w.x + texture2D(uFloret, p.xz).rgb * w.y + texture2D(uFloret, p.xy).rgb * w.z;
    }
    float lfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float lfNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(lfHash(i), lfHash(i + vec3(1, 0, 0)), f.x), mix(lfHash(i + vec3(0, 1, 0)), lfHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(lfHash(i + vec3(0, 0, 1)), lfHash(i + vec3(1, 0, 1)), f.x), mix(lfHash(i + vec3(0, 1, 1)), lfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }`,
  fragColor: /* glsl */`
    {
      float ndv = dot(normalize(vCWN), normalize(cameraPosition - vCWorld));
      if (ndv < 0.55) {
        float lf = lfNoise(vCWorld * 3.2) * 0.75 + lfNoise(vCWorld * 7.5 + 7.1) * 0.25;
        if (ndv < 0.04 + lf * 0.3) discard;
        // leaf lobes near the edge catch a little more light, like painted highlights on leaf tips
        diffuseColor.rgb *= 1.0 + smoothstep(0.45, 0.15, ndv) * lf * 0.22;
      }
      // painted florets / leaf clusters: darker, more saturated gaps; domed, slightly varied clusters
      vec3 fl = floretSample(vCWorld * 0.2, normalize(vCWN));
      float f1 = clamp(fl.b * 1.1, 0.0, 1.0);
      gFloretH = sqrt(max(0.0, 1.0 - f1 * f1));            // hemispherical dome per cluster
      float gap = 1.0 - smoothstep(0.0, 0.4, fl.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 1.15, gap * gap * 0.14);
      diffuseColor.rgb *= 0.93 + 0.14 * fl.g;
    }`,
  // bump the lighting normal with the cluster domes (screen-space derivative bump, as three's perturbNormalArb)
  fragNormal: /* glsl */`
    {
      vec3 sp = -vViewPosition;
      vec3 dpx = dFdx(sp), dpy = dFdy(sp);
      float dhx = dFdx(gFloretH), dhy = dFdy(gFloretH);
      vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
      float det = dot(dpx, r1);
      vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
      normal = normalize(abs(det) * normal - grad * 0.035);
    }`,
};
// Night readability for canopies / leaf cards: the moon-side of a crown is lit, but the side facing the camera mostly
// gets the dark ground-hemisphere fill, so crowns near the camera went almost black (spiky alpha cards on top). Keep a
// cool moonlit floor under the lighting, stronger for foliage well in front of Chewy (uOccl.w = his view depth), plus a
// soft silver rim on those foreground crowns so they read as leaves, not black cut-outs.
const MOONLIT = /* glsl */`
  if (uNight > 0.01) {
    // foreground = nearer the camera than Chewy on the ground plane (height-independent, unlike view depth);
    // uOccl.w is Chewy's view depth, ~ the camera distance, and the rig pitch is 0.62 rad (cos = 0.81)
    float fgK = smoothstep(1.5, 6.0, uOccl.w * 0.81 - length(cameraPosition.xz - vCWorld.xz));
    float mLum = dot(outgoingLight, vec3(0.3, 0.59, 0.11));
    vec3 mHue = mix(vec3(1.0), diffuseColor.rgb / max(0.03, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), 0.55) * vec3(0.72, 0.82, 1.2);
    float mFloor = uNight * (0.032 + 0.045 * fgK);
    outgoingLight += mHue * max(0.0, mFloor - mLum);
    float mRim = smoothstep(0.5, 1.0, 1.0 - abs(dot(normal, normalize(vViewPosition))));
    outgoingLight += mHue * uNight * fgK * mRim * 0.05;
  }
`;
// Painted bark: wavy vertical fissures and paler ridges from the brush texture, wrapped around the tree's own axis
// (object space, so every instance keeps its pattern; the angle mapping repeats a whole number of times: no seam).
const BARK = {
  vertexPars: 'varying vec3 vBarkP;',
  vertexWorld: 'vBarkP = transformed;',
  fragPars: 'varying vec3 vBarkP;',
  fragColor: /* glsl */`{
    float ang = atan(vBarkP.z, vBarkP.x) / 6.2831853;
    vec2 bq = vec2(ang * 3.0, vBarkP.y * 0.16);
    float f = texture2D(uBrush, bq).r, f2 = texture2D(uBrush, vec2(ang * 5.0, vBarkP.y * 0.4) + 0.37).g;
    float fiss = smoothstep(0.46, 0.3, f * 0.65 + f2 * 0.35);
    diffuseColor.rgb *= (1.0 - fiss * 0.38) * (1.0 + smoothstep(0.58, 0.74, f2) * 0.14);
  }`,
};
// Material factories (a fresh material per call; the village builds one set, the prop showcase test page another)
export const VEG_MATS = {
  bark: () => vegToon({ ...BARK, vertexColors: true, wind: 'tree', sway: 1, brush: 0.3, brushScale: 1.2, rim: 0.2, occluder: true }),
  // shadowOnly: the masses only cast the crown's shadow (SHADOW_ONLY_LAYER); the leaf cards are what you see
  foliage: ({ occluder = true, shadowOnly = false } = {}) => {
    LEAF_EDGE.uniforms.uFloret.value = floretTexture();
    const m = vegToon({ ...LEAF_EDGE, fragOut: MOONLIT, occluder, vertexColors: true, wind: 'leaf', sway: 1, brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] });
    if (shadowOnly) m.userData.shadowOnly = true;
    return m;
  },
  // the maple is mostly cards (airy tiers), so its cards cast the dappled shadow; elsewhere the masses do
  cards: (kind, { occluder = true } = {}) => vegToon({ fragOut: MOONLIT, occluder, noShadowCast: kind !== 'momiji', vertexColors: true, wind: 'leaf', sway: 2, map: cardAtlas(kind), alphaTest: CARD_ALPHA, side: THREE.DoubleSide, noFlip: true, brush: 0.12, rim: 0.55, shadowSat: 0.3, term: [-0.45, 0.35] }),
  bamboo: () => vegToon({ occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.6, brush: 0.15, rim: 0.4 }),
  bambooLeaf: () => vegToon({ fragOut: MOONLIT, occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.6, map: leafCardTexture('bamboo'), alphaTest: 0.4, side: THREE.DoubleSide, noFlip: true, rim: 0.5 }),
  bush: () => vegToon({ vertexColors: true, wind: 'leaf', windAmt: 0.5, brush: 0.2, rim: 0.45, term: [-0.1, 0.4] }),
  susuki: () => vegToon({ vertexColors: true, wind: 'reed', windAmt: 1.6, brush: 0.1, rim: 0.6 }),
  rock: () => vegToon({ vertexColors: true, brush: 0.3, brushScale: 0.8, rim: 0.3, term: [0.0, 0.35] }),
  flower: () => vegToon({ vertexColors: true, wind: 'grass', brush: 0.05, rim: 0.5, term: [-0.3, 0.3] }),
};
// builders, for the prop showcase (/?test=props)
export const VEG_BUILD = { tree: buildTree, bush: buildBush, rock: v => rockGeo(v * 11 + 3), susuki: susukiGeo, bamboo: buildBamboo };

const WHITE = new THREE.Color(1, 1, 1);
// bin: cell size (m) for spatial bins. A batch with many instances of small geometries (flowers, curb stones, reeds...)
// is split into one BatchedMesh per cell, so a whole off-screen cell is culled by its bounding sphere and the
// per-instance frustum test (main + shadow pass) only runs for the cells in view. Big geometries (trees, buildings'
// props) stay in one mesh: a copy per cell would cost too much memory, and they have few instances anyway.
const BIN_MIN_ITEMS = 600, BIN_MAX_VERTS = 16000;
// Static batches (the village's vegetation and land details never move): each instance's world bounding sphere is
// baked once, so the per-pass frustum test (main + shadow camera) is six plane checks per instance instead of three's
// matrix fetch + sphere transform per instance. The draw-list logic mirrors THREE.BatchedMesh.onBeforeRender (r186);
// anything unusual (wireframe, array cameras, a custom sort) falls back to it.
const _fr = new THREE.Frustum(), _fm = new THREE.Matrix4(), _fi = new THREE.Matrix4(), _fv = new THREE.Vector3(), _ff = new THREE.Vector3();
const FPL = new Float32Array(24), FLIST = [], FPOOL = [];
const byNear = (a, b) => a.z - b.z, byFar = (a, b) => b.z - a.z;
class StaticBatchedMesh extends THREE.BatchedMesh {
  bakeSpheres() {
    const info = this._instanceInfo, n = info.length, S = this._sph = new Float32Array(n * 4), m = new THREE.Matrix4(), sp = new THREE.Sphere();
    for (let i = 0; i < n; i++) {
      if (!info[i].active) continue;
      this.getMatrixAt(i, m);
      const r = this.getBoundingSphereAt(info[i].geometryIndex, sp);
      if (!r) { S[i * 4 + 3] = 1e6; continue; } // (no bounds: never culled)
      sp.applyMatrix4(m); S[i * 4] = sp.center.x; S[i * 4 + 1] = sp.center.y; S[i * 4 + 2] = sp.center.z; S[i * 4 + 3] = sp.radius;
    }
  }
  onBeforeRender(renderer, scene, camera, geometry, material) {
    if (!this._sph || material.wireframe || camera.isArrayCamera || this.customSort) { this._drawHash = -1; return super.onBeforeRender(renderer, scene, camera, geometry, material); }
    if (!this._visibilityChanged && !this.perObjectFrustumCulled && !this.sortObjects) return;
    const index = geometry.getIndex(), bpe = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
    const info = this._instanceInfo, starts = this._multiDrawStarts, counts = this._multiDrawCounts, geos = this._geometryInfo, S = this._sph;
    const indirect = this._indirectTexture.image.data, cull = this.perObjectFrustumCulled;
    if (cull) {
      _fm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.matrixWorld);
      _fr.setFromProjectionMatrix(_fm, camera.coordinateSystem, camera.reversedDepth);
      for (let k = 0; k < 6; k++) { const pl = _fr.planes[k]; FPL[k * 4] = pl.normal.x; FPL[k * 4 + 1] = pl.normal.y; FPL[k * 4 + 2] = pl.normal.z; FPL[k * 4 + 3] = pl.constant; }
    }
    const inside = (k) => {
      const x = S[k], y = S[k + 1], z = S[k + 2], nr = -S[k + 3];
      for (let p = 0; p < 24; p += 4) if (FPL[p] * x + FPL[p + 1] * y + FPL[p + 2] * z + FPL[p + 3] < nr) return false;
      return true;
    };
    let n = 0;
    if (this.sortObjects) {
      _fi.copy(this.matrixWorld).invert();
      _fv.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_fi);
      _ff.set(0, 0, -1).transformDirection(camera.matrixWorld).transformDirection(_fi);
      let L = 0;
      for (let i = 0, l = info.length; i < l; i++) {
        const it0 = info[i]; if (!it0.visible || !it0.active) continue;
        const k = i * 4; if (cull && !inside(k)) continue;
        const g = geos[it0.geometryIndex];
        let it = FPOOL[L]; if (!it) FPOOL[L] = it = { start: 0, count: 0, z: 0, index: 0 };
        it.start = g.start; it.count = g.count; it.index = i;
        it.z = (S[k] - _fv.x) * _ff.x + (S[k + 1] - _fv.y) * _ff.y + (S[k + 2] - _fv.z) * _ff.z;
        FLIST[L++] = it;
      }
      FLIST.length = L;
      FLIST.sort(material.transparent ? byFar : byNear);
      for (let j = 0; j < L; j++) { const it = FLIST[j]; starts[n] = it.start * bpe; counts[n] = it.count; indirect[n] = it.index; n++; }
    } else {
      for (let i = 0, l = info.length; i < l; i++) {
        const it0 = info[i]; if (!it0.visible || !it0.active) continue;
        if (cull && !inside(i * 4)) continue;
        const g = geos[it0.geometryIndex];
        starts[n] = g.start * bpe; counts[n] = g.count; indirect[n] = i; n++;
      }
    }
    // the indirect texture only needs re-uploading when the draw list changed since the last pass (a bin fully in view
    // draws the same list in the main and the shadow pass, frame after frame)
    let h = Math.imul(n, 2654435761) >>> 0;
    for (let i = 0; i < n; i++) h = (Math.imul(h ^ indirect[i], 16777619) + i) >>> 0;
    if (h !== this._drawHash || n !== this._drawN) { this._indirectTexture.needsUpdate = true; this._drawHash = h; this._drawN = n; }
    this._multiDrawCount = n;
    this._multiDrawBytesPerElement = bpe;
    this._visibilityChanged = false;
  }
}
export class Batch {
  constructor(name, mat, { castShadow = true, receiveShadow = true, sort = true, bin = 0 } = {}) {
    this.name = name; this.mat = mat; this.castShadow = castShadow; this.receiveShadow = receiveShadow; this.sort = sort; this.bin = bin;
    this.geos = []; this.items = [];
  }
  add(geo, m4, color, rec) {
    let gi = this.geos.indexOf(geo);
    if (gi < 0) { gi = this.geos.length; this.geos.push(geo); }
    this.items.push({ gi, m: m4.clone(), c: color ? color.clone() : WHITE, rec });
  }
  // one BatchedMesh holding these items (and only the geometries they use)
  _mesh(items, group) {
    const gis = [...new Set(items.map(it => it.gi))];
    const verts = gis.reduce((a, gi) => a + this.geos[gi].attributes.position.count, 0);
    const idx = gis.reduce((a, gi) => a + (this.geos[gi].index ? this.geos[gi].index.count : 0), 0);
    // (the village's batches are static: baked culling spheres, see StaticBatchedMesh)
    const bm = new (this.bin ? StaticBatchedMesh : THREE.BatchedMesh)(items.length, verts, Math.max(1, idx), this.mat);
    bm.name = 'veg:' + this.name;
    const ids = new Map(gis.map(gi => [gi, bm.addGeometry(this.geos[gi])]));
    for (const it of items) {
      const id = bm.addInstance(ids.get(it.gi));
      bm.setMatrixAt(id, it.m); bm.setColorAt(id, it.c);
      it.rec.parts.push({ bm, id });
    }
    bm.castShadow = this.castShadow && !this.mat.userData.noCast; bm.receiveShadow = this.receiveShadow;
    if (this.mat.userData.shadowOnly) { bm.layers.set(SHADOW_ONLY_LAYER); bm.castShadow = true; }
    bm.sortObjects = this.sort; bm.perObjectFrustumCulled = true;
    applyDepth(bm);
    bm.computeBoundingBox(); bm.computeBoundingSphere();
    bm.bakeSpheres?.();
    group.add(bm);
    return bm;
  }
  build(group) {
    if (!this.items?.length) return null;
    const verts = this.geos.reduce((a, g) => a + g.attributes.position.count, 0);
    if (this.bin && this.items.length >= BIN_MIN_ITEMS && verts <= BIN_MAX_VERTS) {
      const cells = new Map(), B = this.bin;
      for (const it of this.items) { const k = Math.floor(it.m.elements[12] / B) * 1024 + Math.floor(it.m.elements[14] / B); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(it); }
      this.meshes = [...cells.values()].map(items => this._mesh(items, group));
    } else this.meshes = [this._mesh(this.items, group)];
    this.items = null; // free the staging copies
    this.mesh = this.meshes[0];
    return this.mesh;
  }
}

// ------------------------------------------------------------------ Vegetation manager
export class Vegetation {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.group = new THREE.Group(); this.group.name = 'vegetation';
    this.instances = []; // {kind, x, z, y, s, big, parts:[{bm, id}], alive, col?}
    this.recBins = new Map(); // 8 m cells -> records (local clearing: a building only looks at its neighbourhood)
    this.colliders = [];
    this.batches = [];
    this.noise = new Noise(77);
    this.bin = 0; // spatial bin size for batches (the village sets it; regions keep one mesh per batch)
  }
  batch(name, mat, opts) { const b = new Batch(name, mat, { bin: this.bin, ...opts }); this.batches.push(b); return b; }
  addRecord(rec) {
    this.instances.push(rec);
    const k = Math.floor(rec.x / 8) * 1024 + Math.floor(rec.z / 8);
    let a = this.recBins.get(k); if (!a) this.recBins.set(k, a = []); a.push(rec);
    return rec;
  }
  // records whose position is inside the rectangle (8 m cells)
  recordsIn(x0, z0, x1, z1, fn) {
    for (let i = Math.floor(x0 / 8); i <= Math.floor(x1 / 8); i++) for (let j = Math.floor(z0 / 8); j <= Math.floor(z1 / 8); j++) {
      const a = this.recBins.get(i * 1024 + j); if (a) for (const r of a) fn(r);
    }
  }
  // Queue instances: variants = [[geoPart0, geoPart1...], ...]; batches = [Batch per part]
  _place(variants, batches, placements, { kind = 'x', collide = 0 } = {}) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = V(0, 1, 0);
    const big = !!TREE_SPECIES[kind] || kind === 'bamboo';
    for (const pl of placements) {
      p.set(pl.x, pl.y, pl.z); q.setFromAxisAngle(up, pl.rot); s.setScalar(pl.s); if (pl.sy) s.y *= pl.sy;
      m4.compose(p, q, s);
      if (pl.tint) c.set(pl.tint); else if (pl.hue) c.setRGB(...pl.hue); else c.setRGB(1, 1, 1);
      const rec = { kind, x: pl.x, z: pl.z, y: pl.y, s: pl.s, big, parts: [], alive: true, keep: !!pl.keep };
      variants[pl.v % variants.length].forEach((g, pi) => batches[pi].add(g, m4, c, rec));
      if (collide) { rec.col = { x: pl.x, z: pl.z, r: collide * pl.s }; this.colliders.push(rec.col); }
      this.addRecord(rec);
    }
  }
  _kill(rec) {
    rec.alive = false;
    for (const { bm, id } of rec.parts) bm.setVisibleAt(id, false);
    if (rec.col) { const k = this.colliders.indexOf(rec.col); if (k >= 0) this.colliders.splice(k, 1); }
    this.world.onVegRemoved?.(rec);
    // ground details that belong to this one (mushrooms and fallen petals under a tree, the strings of a bunting pole)
    if (rec.sat) for (const s of rec.sat) if (s.alive) this._kill(s);
  }
  // Remove vegetation (not grass) inside a rectangle; returns count
  clearRect(x0, z0, x1, z1, pad = 0.3) {
    let n = 0;
    this.recordsIn(x0 - pad, z0 - pad, x1 + pad, z1 + pad, rec => {
      if (!rec.alive || rec.keep) return; // keep: landmark details that reserve their own tiles (details.js)
      if (rec.x > x0 - pad && rec.x < x1 + pad && rec.z > z0 - pad && rec.z < z1 + pad) { this._kill(rec); n++; }
    });
    return n;
  }
  // Clear around a building: small plants within `pad`, big trees whose canopy would overlap the roof (`canopy`),
  // and — on the camera side (+x/+z) — far enough that no crown hides the facade (`front`).
  clearAround(x0, z0, x1, z1, { pad = 0.6, canopy = 2.3, front = 3.6 } = {}) {
    let n = 0;
    const m = Math.max(pad, canopy * 1.2, front);
    this.recordsIn(x0 - m, z0 - m, x1 + m, z1 + m, rec => {
      if (!rec.alive || rec.keep) return;
      const r = rec.big ? canopy * Math.min(1.2, rec.s) : pad, f = rec.big ? front : pad;
      if (rec.x > x0 - r && rec.x < x1 + f && rec.z > z0 - r && rec.z < z1 + f) {
        // trim the far corner of the camera-side band so it is a diagonal wedge, not a square
        if (rec.big && rec.x > x1 + r && rec.z > z1 + r && (rec.x - x1) + (rec.z - z1) > f + r) return;
        this._kill(rec); n++;
      }
    });
    return n;
  }
  // Build-mode view: 0 = normal lawn, 1 = short, overlay-tinted grass so painted zones read clearly
  setBuildView(k) { const u = this.grassMat?.userData?.u; if (u) u.uBuild.value = k; }
  build(canPlace, quality = 2) {
    const t0 = performance.now();
    const tr = this.terrain, rnd = mulberry32(2024), N = this.noise;
    const H = (x, z) => tr.heightAt(x, z);
    const okGround = (x, z, pad = 0) => {
      for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
        const t = tr.tile(x + dx, z + dz); if (t !== T.GRASS && t !== T.ROCK) return false;
        if (!canPlace(x + dx, z + dz)) return false;
      }
      return H(x, z) > 0.5;
    };
    // ---- trees
    const treeSpots = { sakura: [], momiji: [], pine: [], round: [], ginkgo: [] };
    // taken spots [x, z, r] in a 4 m spatial hash (the spacing test is local, not a scan of every tree so far)
    const taken = [], SH = new Map(), SC = 4, RMAX = 2.8;
    const take = (x, z, r) => { taken.push([x, z, r]); const k = Math.floor(x / SC) * 1024 + Math.floor(z / SC); let a = SH.get(k); if (!a) SH.set(k, a = []); a.push([x, z, r]); };
    const farFromTrees = (x, z, d) => {
      const R = d + RMAX;
      for (let i = Math.floor((x - R) / SC); i <= Math.floor((x + R) / SC); i++) for (let j = Math.floor((z - R) / SC); j <= Math.floor((z + R) / SC); j++) {
        const a = SH.get(i * 1024 + j); if (a) for (const [tx, tz, td] of a) if ((tx - x) ** 2 + (tz - z) ** 2 <= (d + td) ** 2) return false;
      }
      return true;
    };
    const tryTree = (kind, x, z, spacing = 2.4) => {
      if (treeKeepOut(x, z) || !okGround(x, z, 1.2) || !farFromTrees(x, z, spacing)) return false;
      treeSpots[kind].push({ x, z }); take(x, z, spacing); return true;
    };
    // street trees first (layout.STREET_TREES: already clear of every lot, square and door sightline; small, and kept
    // when a building goes up next to them)
    for (const t of STREET_TREES) {
      if (!okGround(t.x, t.z, 0.25) || !farFromTrees(t.x, t.z, 2.2)) continue; // (a trunk 0.85 m off the paving)
      const f = (t.x * 7.31 + t.z * 3.17) % 1; // (street trees are young: about 0.6x a park cherry, 0.75x a park maple)
      treeSpots[t.kind].push({ x: t.x, z: t.z, keep: true, s: (t.kind === 'sakura' ? 0.56 : 0.72) + f * 0.1 }); take(t.x, t.z, 2.2);
    }
    // the green belts: a tree line along each belt (jittered), so the districts read as neighbourhoods
    const brnd = mulberry32(4711);
    for (const B of GREEN_BELTS) for (let i = 0; i < B.pts.length - 1; i++) {
      const [ax, az] = B.pts[i], [bx, bz] = B.pts[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let u = brnd() * B.step * 0.5; u < L; u += B.step * (0.85 + brnd() * 0.3)) {
        const off = (brnd() * 2 - 1) * B.r * 0.7, x = ax + dx * u - dz * off, z = az + dz * u + dx * off;
        const k = B.kind === 'sakura' ? (brnd() < 0.82 ? 'sakura' : 'round') : (brnd() < 0.45 ? 'sakura' : brnd() < 0.65 ? 'round' : 'pine');
        tryTree(k, x, z, k === 'sakura' ? 2.6 : 2.2);
      }
    }
    // biomes from the plan (layout.js): pines on the northern cliffs, maples on the shrine hill, forest patches round
    // the town, the odd park tree in town, pines on the coast
    const TREE_TRIES = 2600 * 4; // the old count, scaled to the 4x area
    for (let i = 0; i < TREE_TRIES; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      const h = H(x, z), vd = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
      const forest = N.fbm(x * 0.03, z * 0.03, 3);
      let kind = null;
      if (h > 2.6 && z < NORTH.foot + 6) kind = rnd() < 0.7 ? 'pine' : 'round';
      else if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.foot + 2) kind = rnd() < 0.72 ? 'momiji' : 'ginkgo';
      else if (vd > PLATEAU.flat - 6 && forest > 0.05) kind = rnd() < 0.45 ? 'sakura' : rnd() < 0.6 ? 'round' : 'pine';
      else if (vd < PLATEAU.flat && rnd() < 0.07) kind = rnd() < 0.8 ? 'sakura' : 'round';
      else if (h < 1.0 && h > 0.5 && rnd() < 0.08) kind = 'pine';
      if (kind) tryTree(kind, x, z, kind === 'sakura' ? 2.8 : 2.3);
    }
    this.extraTrees?.(tryTree);
    const barkB = this.batch('bark', VEG_MATS.bark());
    const folB = this.batch('foliage', VEG_MATS.foliage({ shadowOnly: true }));
    for (const kind of Object.keys(treeSpots)) {
      const spots = treeSpots[kind]; if (!spots.length) continue;
      const S = TREE_SPECIES[kind];
      const variants = [0, 1, 2].map(v => { const t = buildTree(kind, v + 1); return [t.trunkGeo, t.foliage, t.cardGeo]; });
      // the maple is mostly cards (airy tiers), so its cards cast the dappled shadow; elsewhere the masses do
      const cast = kind === 'momiji';
      const cardB = this.batch('cards:' + kind, VEG_MATS.cards(kind), { castShadow: cast });
      const pl = spots.map(sp => ({ x: sp.x, z: sp.z, y: H(sp.x, sp.z), rot: rnd() * TAU, s: sp.s ?? 0.85 + rnd() * 0.4, keep: sp.keep, v: Math.floor(rnd() * 3), hue: [0.92 + rnd() * 0.16, 0.92 + rnd() * 0.12, 0.92 + rnd() * 0.12] }));
      this._place(variants, [barkB, folB, cardB], pl, { kind, collide: S.radius });
    }
    this.treeSpots = treeSpots;
    // ---- bamboo groves (west)
    const bambooPl = [];
    for (let i = 0; i < 1200; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * BAMBOO.r * 0.88; const x = BAMBOO.x + Math.cos(a) * d, z = BAMBOO.z + Math.sin(a) * d * 1.3;
      if (okGround(x, z, 0.8) && farFromTrees(x, z, 1.1) && !treeKeepOut(x, z, 1)) { bambooPl.push({ x, z, y: H(x, z), rot: rnd() * TAU, s: 0.9 + rnd() * 0.3, v: Math.floor(rnd() * 3) }); take(x, z, 1.1); }
    }
    const bv = [0, 1, 2].map(v => { const b = buildBamboo(v); return [b.stalks, b.leaves]; });
    this._place(bv, [this.batch('bamboo', VEG_MATS.bamboo()), this.batch('bambooLeaf', VEG_MATS.bambooLeaf())], bambooPl, { kind: 'bamboo', collide: 0.6 });
    // ---- bushes
    const bushPl = { hydrangea: [], azalea: [], box: [] };
    for (let i = 0; i < 1400 * 3; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      if (!okGround(x, z, 0.5) || !farFromTrees(x, z, 0.7)) continue;
      const nearPath = this.world.nearPath?.(x, z, 2.2);
      const k = nearPath ? (rnd() < 0.6 ? 'hydrangea' : 'azalea') : rnd() < 0.08 ? 'box' : rnd() < 0.05 ? 'azalea' : null;
      if (!k) continue;
      bushPl[k].push({ x, z, y: H(x, z), rot: rnd() * TAU, s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 3) }); take(x, z, 0.7);
    }
    // bushes: canopy-style masses + leaf cards + bloom cards (not x-ray occluders: they are knee-high)
    const bushB = this.batch('bushFoliage', VEG_MATS.foliage({ occluder: false, shadowOnly: true }), { sort: false });
    const bushLeafB = this.batch('bushLeaves', VEG_MATS.cards('round', { occluder: false }), { castShadow: false, sort: false });
    const bushBloomB = this.batch('bushBlooms', VEG_MATS.cards('sakura', { occluder: false }), { castShadow: false, sort: false });
    const bushBerryB = this.batch('bushBerries', VEG_MATS.bush(), { castShadow: false, sort: false });
    for (const k of Object.keys(bushPl)) {
      if (!bushPl[k].length) continue;
      const vars = [0, 1, 2].map(v => { const b = buildBush(k, v * 3 + k.length); return [b.mass, b.leaves, b.blooms || b.berries]; });
      this._place(vars, [bushB, bushLeafB, k === 'box' ? bushBerryB : bushBloomB], bushPl[k], { kind: 'bush', collide: 0.35 });
    }
    // ---- susuki fields (the southern meadows and the coast, outside the town)
    const suPl = [];
    for (let i = 0; i < 2400; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = PLATEAU.z + rnd() * (WORLD - 4 - PLATEAU.z); const h = H(x, z);
      if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < PLATEAU.flat + 4) continue;
      if (h < 0.55 || h > 1.6 || !okGround(x, z, 0.3)) continue;
      if (N.fbm(x * 0.08 + 40, z * 0.08, 2) < 0.12) continue;
      if (!farFromTrees(x, z, 0.5)) continue;
      suPl.push({ x, z, y: h, rot: rnd() * TAU, s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 3) });
    }
    this._place([0, 1, 2].map(v => [susukiGeo(v)]), [this.batch('susuki', VEG_MATS.susuki(), { sort: false })], suPl, { kind: 'susuki' });
    // ---- rocks
    const rockPl = [];
    for (let i = 0; i < 1500; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      const t = tr.tile(x, z); if (!canPlace(x, z)) continue;
      const shore = H(x, z) > -0.4 && H(x, z) < 0.6;
      if (!(t === T.ROCK || (shore && rnd() < 0.2) || (t === T.GRASS && rnd() < 0.04))) continue;
      rockPl.push({ x, z, y: H(x, z) - 0.1, rot: rnd() * TAU, s: 0.5 + rnd() * (t === T.ROCK ? 1.4 : 0.7), sy: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 4) });
    }
    this._place([0, 1, 2, 3].map(v => [rockGeo(v * 11 + 3)]), [this.batch('rock', VEG_MATS.rock(), { sort: false })], rockPl, { kind: 'rock', collide: 0.45 });
    this.buildFlowers(canPlace, rnd, quality);
    for (const b of this.batches) b.build(this.group);
    this.buildGrass(quality);
    this.taken = taken;
    this.ms = +(performance.now() - t0).toFixed(1);
  }
  buildFlowers(canPlace, rnd, quality) {
    const tr = this.terrain, N = this.noise;
    const kinds = ['daisy', 'bell', 'cup'];
    const pal = ['#ffffff', '#fff2a8', '#ffb0d0', '#ff8fb8', '#c8b0ff', '#ffd27a', '#ff6f7f', '#a8d8ff'];
    const pls = { daisy: [], bell: [], cup: [] };
    // the town (the plateau and its rim) gets the old density; beyond it the meadows thin out (VILLAGE_PLAN.md §8)
    const count = quality >= 2 ? 9000 : 4000, R0 = PLATEAU.blend + 8, outside = Math.round(count / 3);
    for (let i = 0; i < count + outside; i++) {
      let x, z;
      if (i < count) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R0; x = PLATEAU.x + Math.cos(a) * d; z = PLATEAU.z + Math.sin(a) * d; }
      else { x = 3 + rnd() * (WORLD - 6); z = 3 + rnd() * (WORLD - 6); if (inTown(x, z, 8)) continue; }
      if (x < 3 || z < 3 || x > WORLD - 3 || z > WORLD - 3) continue;
      if (tr.tile(x, z) !== T.GRASS || !canPlace(x, z)) continue;
      const f = N.fbm(x * 0.07 + 9, z * 0.07 - 3, 3);
      if (f < 0.08 && rnd() > 0.06) continue;
      const k = kinds[Math.floor((N.n2(x * 0.05, z * 0.05) * 0.5 + 0.5) * 2.99)];
      const c = pal[Math.floor((N.n2(x * 0.11 + 5, z * 0.11) * 0.5 + 0.5) * 7.99)];
      pls[k].push({ x, z, y: tr.heightAt(x, z) - 0.02, rot: rnd() * TAU, s: 0.32 + rnd() * 0.18, v: 0, tint: c });
    }
    const fb = this.batch('flower', VEG_MATS.flower(), { castShadow: false, sort: false });
    for (const k of kinds) if (pls[k].length) this._place([[flowerGeo(k)]], [fb], pls[k], { kind: 'flower' });
  }
  // GPU grass field. The village calls buildGrass(quality) (tile-driven, its original look); outdoor regions pass
  // options (docs/REGIONS.md §3.6): { colors: [g1, g2, g3, g4] (hex), tipMul: [r, g, b], tipAdd: [r, g, b], frost (0..1,
  // whitened tips), density (blades / m² at full allow), height: [min, range], width: [min, range], allow(x, z) → 0..1
  // (probability per blade, e.g. the region's grass mask), heightAt(x, z), tex (RGBA texture whose alpha collapses blades
  // below 0.55 in the vertex shader), world (the texture's span in metres), minH (lowest ground that grows grass),
  // bounds [x0, z0, x1, z1], seed }. Each call adds its own material and chunk meshes (mixed grasses: call it twice).
  buildGrass(quality, opts = null) {
    const tr = this.terrain, o = opts || {};
    const density = o.density != null ? Math.round(o.density * (quality >= 2 ? 1 : quality === 1 ? 0.6 : 0.3)) : quality >= 2 ? 44 : quality === 1 ? 24 : 12;
    const blade = bladeGeo();
    const rnd = mulberry32(o.seed ?? 99);
    const ov = tr.overlayUniforms?.() || { uOverlay: { value: null }, uOverlayAmt: { value: 0 }, uOverlayMode: { value: 1 }, uGrid: { value: 0 }, uCursor: { value: new THREE.Vector4(-99, -99, 0, 0) }, uCursorCol: { value: new THREE.Vector4(1, 1, 1, 0) } };
    const gc = (o.colors || ['#80cc4d', '#54a34d', '#b3d65c', '#66b86b']).map(h => new THREE.Color(h));
    if (!o.colors) { gc[0].setRGB(0.50, 0.80, 0.30); gc[1].setRGB(0.33, 0.64, 0.30); gc[2].setRGB(0.70, 0.84, 0.36); gc[3].setRGB(0.40, 0.72, 0.42); }
    const mat = this.grassMat = makeToon({
      wind: 'grass', fixedNormal: [0, 1, 0], noFlip: true, brush: 0.12, rim: 0.0, shadowSat: 0.45, side: THREE.DoubleSide,
      uniforms: {
        uTiles: { value: o.tex || tr.tileTex }, uWorld: { value: o.world ?? WORLD }, uBuild: { value: 0 }, ...ov,
        uGPal: { value: gc }, uGTip: { value: new THREE.Vector4(...(o.tipMul || [1.18, 1.14, 0.9]), o.frost || 0) }, uGTipAdd: { value: new THREE.Vector3(...(o.tipAdd || [0.06, 0.05, 0.0])) },
      },
      vertexPars: 'uniform sampler2D uTiles; uniform float uWorld; uniform float uBuild; varying float vGH;',
      vertexWorld: `
        vGH = position.y;
        float allow = texture2D(uTiles, cOrigin.xz / uWorld).a;
        if (allow < 0.55) cWorld.xyz = cOrigin;
        // build view: blades crouch so painted zones, coverage and the drag rectangle read clearly
        cWorld.xyz = cOrigin + (cWorld.xyz - cOrigin) * vec3(1.0 - uBuild * 0.3, 1.0 - uBuild * 0.68, 1.0 - uBuild * 0.3);
      `,
      fragPars: 'varying float vGH; uniform float uWorld; uniform vec3 uGPal[4]; uniform vec4 uGTip; uniform vec3 uGTipAdd;\n' + OVERLAY_GLSL + POOL_GLSL,
      fragColor: /* glsl */`
        {
          vec3 wp = vCWorld;
          float n1 = texture2D(uBrush, wp.xz * 0.021).g;
          float n2 = texture2D(uBrush, wp.xz * 0.0071 + 0.31).g;
          vec3 grass = mix(uGPal[1], uGPal[0], smoothstep(0.38, 0.62, n1));
          grass = mix(grass, uGPal[2], smoothstep(0.52, 0.72, n2) * 0.7);
          grass = mix(grass, uGPal[3], smoothstep(0.55, 0.75, 1.0 - n2) * 0.5);
          vec3 tip = grass * uGTip.xyz + uGTipAdd;
          tip = mix(tip, vec3(0.95, 0.97, 1.0), uGTip.w * smoothstep(0.55, 1.0, vGH));
          diffuseColor.rgb = mix(grass * 0.8, tip, smoothstep(0.0, 1.0, vGH));
        }
      `,
      fragOut: 'outgoingLight += lightPools(vCWorld) * diffuseColor.rgb * (0.7 + 0.5 * vGH); outgoingLight = applyBuildOverlay(outgoingLight, vCWorld, 1.0);',
    });
    const CH = 16, village = !opts;
    const [bx0, bz0, bx1, bz1] = o.bounds || [0, 0, WORLD, WORLD];
    const cx0 = Math.floor(bx0 / CH), cz0 = Math.floor(bz0 / CH), cx1 = Math.ceil(bx1 / CH), cz1 = Math.ceil(bz1 / CH);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const tiles = tr.tiles, H = o.heightAt || ((x, z) => tr.heightAt(x, z)), minH = o.minH ?? 0.35;
    const [h0, hr] = o.height || [0.26, 0.28], [w0, wr] = o.width || [0.12, 0.1];
    const grassMeshes = this.grassMeshes ||= [];
    for (let cz = cz0; cz < cz1; cz++) for (let cx = cx0; cx < cx1; cx++) {
      const list = [];
      // the village: full density in town, thinner on its rim and much thinner beyond (only seen from afar, through
      // the haze); the blades are the biggest cost of the 2x island (VILLAGE_PLAN.md §8)
      const dc = village ? Math.hypot((cx + 0.5) * CH - PLATEAU.x, (cz + 0.5) * CH - PLATEAU.z) : 0;
      const dens = dc < PLATEAU.flat + 8 ? density : dc < PLATEAU.blend + 14 ? Math.round(density * 0.55) : Math.round(density * 0.3);
      for (let z = Math.max(bz0, cz * CH); z < Math.min(bz1, (cz + 1) * CH); z++) for (let x = Math.max(bx0, cx * CH); x < Math.min(bx1, (cx + 1) * CH); x++) {
        if (o.allow) {
          for (let k = 0; k < density; k++) {
            const px = x + rnd(), pz = z + rnd();
            if (rnd() >= o.allow(px, pz)) continue;
            const h = H(px, pz); if (h < minH) continue;
            list.push(px, h - 0.02, pz);
          }
          continue;
        }
        const t = tiles[z * WORLD + x];
        if (t !== T.GRASS && t !== T.PATH && t !== T.PLAZA && t !== T.FIELD) continue; // path tiles get grass back if removed
        for (let k = 0; k < dens; k++) {
          const px = x + rnd(), pz = z + rnd();
          const h = tr.heightAt(px, pz); if (h < 0.35) continue;
          list.push(px, h - 0.02, pz);
        }
      }
      if (!list.length) continue;
      const n = list.length / 3;
      const im = new THREE.InstancedMesh(blade, mat, n);
      for (let i = 0; i < n; i++) {
        const tall = h0 + rnd() * hr;
        p.set(list[i * 3], list[i * 3 + 1], list[i * 3 + 2]); q.setFromAxisAngle(V(0, 1, 0), rnd() * TAU); s.set(w0 + rnd() * wr, tall, 0.1);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
      }
      im.receiveShadow = true; im.castShadow = false;
      im.computeBoundingSphere();
      if (village) {
        // static blades: the CPU copy of the matrices is dropped once uploaded (the GPU keeps them)
        im.instanceMatrix.onUpload(function () { this.array = null; });
        im.userData.cx = (cx + 0.5) * CH; im.userData.cz = (cz + 0.5) * CH;
        (this.grassChunks ||= []).push(im);
      }
      this.group.add(im); grassMeshes.push(im);
    }
    return mat;
  }
  // village: hide grass chunks the fog has swallowed (camera-distance cull; frustum culling does the rest)
  updateGrass(cam) {
    const ms = this.grassChunks; if (!ms || !cam) return;
    if (this._gcx !== undefined && Math.abs(cam.x - this._gcx) + Math.abs(cam.z - this._gcz) < 2) return;
    this._gcx = cam.x; this._gcz = cam.z;
    const R2 = GRASS_FAR * GRASS_FAR;
    for (const m of ms) { const dx = m.userData.cx - cam.x, dz = m.userData.cz - cam.z; m.visible = dx * dx + dz * dz < R2; }
  }
}

// Builders and helpers for outdoor regions (docs/REGIONS.md §3.6; src/regions/biomeKit.js wraps them)
export { buildTree, buildBamboo, buildBush, susukiGeo, rockGeo, flowerGeo, bladeGeo, cardAtlas, mass, paintMass, pad, CardSet, cullBuried, LEAF_EDGE, MOONLIT, BARK, CARD_ALPHA };
