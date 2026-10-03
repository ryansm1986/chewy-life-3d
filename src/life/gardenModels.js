// Garden models (docs/HOMESTEAD.md §2): every crop at each growth stage, the soil mound, Chewy's raised bed, the
// Seed Stall, the Sprinkler (a Build-mode decoration) and the player's tools. Toybox-chunky: fat rounded leaves,
// glossy round veg, soft ink-free shapes, vertex colours, through the building kit's Builder (one merged geometry per
// bucket). Origins: a crop sits on its tile centre at the soil top (y = 0), the tile spans ±0.5.
import * as THREE from 'three';
import { Builder, G, C, V, PI, col, shade } from '../world/buildings/kit.js';
import { awning, wheel, bucket } from '../world/buildings/props2.js';
import { produce, pot, signboard } from '../world/buildings/props.js';
import { puff, tube, merge, paint } from '../gfx/geom.js';
import { clamp, TAU } from '../core/util.js';
import { CROPS, CROP_IDS } from './pantry.js';

export const STAGES = ['seed', 'sprout', 'young', 'ripe'];
/** The model stage for a crop at growth stage s (0 = just planted .. days = ripe). */
export function vstage(crop, s) {
  const d = CROPS[crop]?.days || 3;
  if (s >= d) return 'ripe';
  if (s <= 0) return 'seed';
  return s / d < 0.5 ? 'sprout' : 'young';
}

// ------------------------------------------------------------------ shape helpers
const lerpC = (a, b) => { const A = col(a), Bc = col(b); return (t, o) => o.copy(A).lerp(Bc, clamp(t)); };
/** A fat, rounded leaf lying along +x from the origin (L long, W wide), drooping by `bend`, tapering to the tip. */
function leafBlob(L, W, { bend = 0.25, thick = 0.22, taper = 0.55, seg = 10 } = {}) {
  const g = new THREE.SphereGeometry(0.5, seg, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, y = p.getY(i), z = p.getZ(i); // u: 0 base .. 1 tip
    const w = 1 - taper * u * u;
    p.setXYZ(i, u * L, y * W * thick * 2 * w - bend * L * u * u, z * W * 2 * w);
  }
  g.computeVertexNormals();
  return g;
}
/** n leaves round a centre (rosette), lifted by `lift` (rad), each L × W, coloured base → tip. */
function rosette(B, { n = 5, L = 0.2, W = 0.07, lift = 0.6, bend = 0.3, at = [0, 0, 0], twist = 0, base = '#5aa84a', tip = '#9ad870', jitter = 0.15, bucket = 'leaf' } = {}) {
  const c = lerpC(base, tip);
  for (let i = 0; i < n; i++) {
    const a = twist + (i / n) * TAU + B.wob(jitter), l = L * (0.85 + B.r() * 0.3);
    const g = leafBlob(l, W, { bend });
    g.rotateZ(lift + B.wob(0.12)); g.rotateY(-a); g.translate(at[0], at[1], at[2]);
    B.add(g, (p, n2, o) => c(Math.hypot(p.x - at[0], p.z - at[2]) / l, o).multiplyScalar(0.92 + 0.14 * clamp(n2.y)), bucket);
  }
}
function stem(B, x, z, h, r = 0.014, color = '#6ab04e', bucket = 'leaf') { const s = G.cyl(r * 0.8, r, h, 5); s.translate(x, h / 2, z); B.add(s, color, bucket); }
/** The tiny garden marker stake with a flag painted in the crop's colour (back-left corner, away from the camera). */
function stake(B, crop) {
  const C0 = CROPS[crop], x = -0.38, z = -0.36;
  const post = G.cyl(0.011, 0.014, 0.3, 5); post.translate(x, 0.12, z); B.add(post, C.woodLight);
  const flag = G.box(0.13, 0.09, 0.016, 0.006); flag.translate(x + 0.05, 0.26, z); B.add(flag, '#fffaf0');
  const dot = G.sph(0.028, 8, 5); dot.scale(1, 1, 0.45); dot.translate(x + 0.05, 0.26, z + 0.01); B.add(dot, crop === 'turnip' || crop === 'daikon' ? C0.accent : C0.color);
}
const SPOTS = { 1: [[0, 0]], 2: [[-0.18, 0.13], [0.19, -0.12]], 3: [[-0.24, 0.22], [0, 0], [0.24, -0.22]], 4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] };
const COUNT = { turnip: 2, carrot: 3, cabbage: 1, daikon: 2, strawberry: 1, rice: 4, pumpkin: 1, melon: 1 };

// ------------------------------------------------------------------ stages shared by every crop
function seedStage(B, crop) {
  for (const [x, z] of SPOTS[COUNT[crop]]) {
    const h = G.sph(0.07, 9, 5); h.scale(1, 0.35, 1); h.translate(x, 0.005, z); B.add(h, '#7a5038');
    for (const s of [-1, 1]) { const sd = G.sph(0.016, 6, 4); sd.scale(1.3, 0.8, 1); sd.translate(x + s * 0.025, 0.03, z + s * 0.012); B.add(sd, '#efd9a6'); }
  }
  stake(B, crop);
}
function sproutStage(B, crop) {
  const big = COUNT[crop] === 1, s = big ? 1.4 : 1;
  for (const [x, z] of SPOTS[COUNT[crop]]) {
    stem(B, x, z, 0.08 * s, 0.014 * s);
    for (const sx of [-1, 1]) {
      const l = leafBlob(0.085 * s, 0.045 * s, { bend: -0.25, thick: 0.3, taper: 0.2 });
      l.rotateZ(0.55); l.rotateY(sx > 0 ? 0.3 : PI + 0.3); l.translate(x, 0.075 * s, z);
      B.add(l, (p, n, o) => o.set('#8fd068').lerp(col('#c8f0a0'), clamp(n.y * 0.6)), 'leaf');
    }
  }
  stake(B, crop);
}

/** A big lobed squash leaf resting on the soil at (x, z), stalk toward the centre, tilted up a little. */
function bigLeaf(B, x, z, a, s, base = '#4f9a40') {
  const g = new THREE.SphereGeometry(0.5, 14, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), ang = Math.atan2(vz, vx), lobe = 1 + 0.16 * Math.cos(ang * 5) - 0.12 * Math.max(0, Math.cos(ang + PI)) ** 6; // five lobes, a notch at the stalk
    p.setXYZ(i, vx * lobe * 0.4 * s, vy * 0.04 * s - (vx * vx + vz * vz) * 0.12 * s, vz * lobe * 0.36 * s);
  }
  g.computeVertexNormals(); g.rotateZ(0.22); g.rotateY(-a); g.translate(x, 0.035 + 0.01 * s, z);
  const c0 = col(base), c1 = col('#8fd068');
  B.add(g, (pp, n, o) => o.copy(c0).lerp(c1, clamp(n.y * 0.55)).multiplyScalar(0.94 + 0.1 * Math.cos(Math.atan2(pp.z - z, pp.x - x) * 10)), 'leaf');
  const st = tube([{ p: V(x * 0.25, 0.01, z * 0.25), r: 0.01 }, { p: V(x * 0.7, 0.03, z * 0.7), r: 0.009 }], 4, false); B.add(st, '#6a9a3a', 'leaf');
}

// ------------------------------------------------------------------ young + ripe, per crop
const CROPMODELS = {
  turnip(B, ripe) {
    for (const [x, z] of SPOTS[2]) {
      if (ripe) {
        const b = G.sph(0.12, 14, 10); b.scale(1, 0.92, 1); b.translate(x, 0.04, z);
        B.add(b, (p, n, o) => o.set('#fffaf4').lerp(col('#d070b4'), clamp((p.y - 0.06) / 0.07)).lerp(col('#f2c2e2'), clamp((p.y - 0.02) / 0.04) * 0.35));
        rosette(B, { n: 5, L: 0.24, W: 0.07, lift: 0.95, bend: 0.4, at: [x, 0.13, z], base: '#4f9a40', tip: '#8fd068' });
      } else {
        const b = G.sph(0.06, 10, 6); b.translate(x, 0.01, z); B.add(b, (p, n, o) => o.set('#fffaf4').lerp(col('#e08ac4'), clamp(p.y / 0.06)));
        rosette(B, { n: 4, L: 0.17, W: 0.055, lift: 0.85, bend: 0.3, at: [x, 0.05, z], base: '#5aa84a', tip: '#9ad870' });
      }
    }
    if (!ripe) stake(B, 'turnip');
  },
  carrot(B, ripe) {
    for (const [x, z] of SPOTS[3]) {
      if (ripe) {
        const top = G.cyl(0.07, 0.055, 0.1, 10); top.translate(x, 0.02, z); B.add(top, (p, n, o) => o.set('#ff8a3a').multiplyScalar(n.y > 0.7 ? 1.08 : 0.95));
        const cap = G.sph(0.07, 10, 5, 0); cap.scale(1, 0.35, 1); cap.translate(x, 0.07, z); B.add(cap, '#ffa050');
      }
      const n = ripe ? 6 : 4, L = ripe ? 0.3 : 0.18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + B.wob(0.3), g = leafBlob(L * (0.85 + B.r() * 0.3), 0.035, { bend: 0.15, thick: 0.4, taper: 0.4, seg: 6 });
        g.rotateZ(1.15 + B.wob(0.15)); g.rotateY(-a); g.translate(x, ripe ? 0.08 : 0.02, z);
        B.add(g, (p, nn, o) => o.set('#4f9a40').lerp(col('#8fd068'), clamp((p.y - 0.05) / L)), 'leaf');
        // frilly leaflets along the frond
        for (const t of [0.45, 0.75]) {
          const lf = G.sph(0.03, 5, 3); lf.scale(1, 0.4, 0.7);
          const d = L * t; lf.translate(x + Math.cos(a) * d * Math.cos(1.15), (ripe ? 0.08 : 0.02) + d * Math.sin(1.15), z + Math.sin(a) * d * Math.cos(1.15));
          B.add(lf, '#7cc45a', 'leaf');
        }
      }
    }
    if (!ripe) stake(B, 'carrot');
  },
  cabbage(B, ripe) {
    if (ripe) {
      const head = puff(V(0, 0.15, 0), 0.2, { detail: 2, noise: 0.08, squash: 0.85, seed: 3 });
      B.add(head, (p, n, o) => o.set('#8fd068').lerp(col('#d2f0a0'), clamp(n.y * 0.7)));
      for (let i = 0; i < 6; i++) { // wrapping leaves cup the head
        const a = (i / 6) * TAU + 0.3, g = leafBlob(0.3, 0.17, { bend: -0.15, thick: 0.12, taper: 0.3, seg: 12 });
        g.rotateZ(0.75 + B.wob(0.1)); g.rotateY(-a); g.translate(Math.cos(a) * 0.04, 0.02, Math.sin(a) * 0.04);
        B.add(g, (p, n, o) => o.set('#5aa84a').lerp(col('#9ad872'), clamp(p.y / 0.22)), 'leaf');
      }
      rosette(B, { n: 5, L: 0.3, W: 0.13, lift: 0.18, bend: 0.25, at: [0, 0.01, 0], twist: 0.6, base: '#4f9a40', tip: '#7cc45a', bucket: 'body' });
    } else {
      const head = G.sph(0.08, 10, 7); head.scale(1, 0.85, 1); head.translate(0, 0.07, 0); B.add(head, '#c0ea90');
      rosette(B, { n: 6, L: 0.22, W: 0.1, lift: 0.5, bend: 0.2, at: [0, 0.02, 0], base: '#5aa84a', tip: '#9ad872' });
      stake(B, 'cabbage');
    }
  },
  daikon(B, ripe) {
    for (const [x, z] of SPOTS[2]) {
      if (ripe) {
        const r = G.cyl(0.085, 0.08, 0.22, 12); r.translate(x, 0.05, z);
        B.add(r, (p, n, o) => o.set('#fffcf6').lerp(col('#b8e08a'), clamp((p.y - 0.06) / 0.1)));
        const cap = G.sph(0.085, 12, 5); cap.scale(1, 0.3, 1); cap.translate(x, 0.16, z); B.add(cap, '#a8d878');
        rosette(B, { n: 6, L: 0.38, W: 0.08, lift: 1.05, bend: 0.55, at: [x, 0.17, z], base: '#4f9a40', tip: '#8fd068' });
      } else {
        const r = G.cyl(0.04, 0.04, 0.06, 8); r.translate(x, 0.01, z); B.add(r, '#e8f4d4');
        rosette(B, { n: 5, L: 0.22, W: 0.06, lift: 0.95, bend: 0.4, at: [x, 0.04, z], base: '#5aa84a', tip: '#9ad870' });
      }
    }
    if (!ripe) stake(B, 'daikon');
  },
  strawberry(B, ripe) {
    // trifoliate leaves on short stalks, a low bushy clump
    const n = ripe ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + B.wob(0.2), d = 0.12 + B.r() * 0.06, h = 0.1 + B.r() * 0.06;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const st = tube([{ p: V(0, 0, 0), r: 0.008 }, { p: V(x * 0.6, h * 0.8, z * 0.6), r: 0.008 }, { p: V(x, h, z), r: 0.007 }], 4, false); B.add(st, '#6aa84a', 'leaf');
      for (const k of [-0.6, 0, 0.6]) {
        const lf = leafBlob(0.1, 0.055, { bend: 0.1, thick: 0.25, taper: 0.15, seg: 7 });
        lf.rotateZ(0.25); lf.rotateY(-(a + k)); lf.translate(x, h, z);
        B.add(lf, (p, nn, o) => o.set('#4f9a40').lerp(col('#8ccf6a'), clamp(nn.y * 0.7)).multiplyScalar(0.95 + 0.1 * Math.sin(p.x * 60)), 'leaf');
      }
    }
    const flower = (x, y, z) => {
      for (let k = 0; k < 5; k++) { const pt = G.sph(0.022, 6, 4); pt.scale(1, 0.4, 1); const a = k / 5 * TAU; pt.translate(x + Math.cos(a) * 0.022, y, z + Math.sin(a) * 0.022); B.add(pt, '#fffaf4', 'leaf'); }
      const c = G.sph(0.014, 6, 4); c.translate(x, y + 0.008, z); B.add(c, '#ffd24a', 'leaf');
    };
    if (ripe) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.4, x = Math.cos(a) * 0.22, z = Math.sin(a) * 0.22;
        const b = G.sph(0.055, 10, 8); const p = b.attributes.position;
        for (let j = 0; j < p.count; j++) { const y = p.getY(j); const k = 1 - clamp(-y / 0.055) * 0.45; p.setX(j, p.getX(j) * k); p.setZ(j, p.getZ(j) * k); p.setY(j, y * 1.2); }
        b.computeVertexNormals(); b.translate(x, 0.07, z);
        B.add(b, (pp, nn, o) => { o.set('#ff3a52').multiplyScalar(0.95 + 0.1 * clamp(nn.y)); if (Math.sin(pp.x * 140) * Math.sin(pp.y * 140) * Math.sin(pp.z * 140) > 0.5) o.set('#ffe070'); });
        const cal = G.cone(0.035, 0.02, 5); cal.translate(x, 0.135, z); B.add(cal, '#4f9a40', 'leaf');
      }
      flower(0.05, 0.19, -0.06);
    } else {
      flower(0.08, 0.18, 0.05); flower(-0.09, 0.17, -0.02); flower(0.0, 0.2, -0.1);
      stake(B, 'strawberry');
    }
  },
  rice(B, ripe) {
    for (const [x, z] of SPOTS[4]) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + B.wob(0.3), lean = 0.12 + B.r() * 0.18, h = (ripe ? 0.42 : 0.3) * (0.85 + B.r() * 0.25);
        const tx = Math.cos(a) * lean * h, tz = Math.sin(a) * lean * h;
        const bl = tube([{ p: V(x, 0, z), r: 0.012 }, { p: V(x + tx * 0.4, h * 0.55, z + tz * 0.4), r: 0.01 }, { p: V(x + tx, h, z + tz), r: 0.002 }], 4, false);
        B.add(bl, (p, nn, o) => o.set(ripe ? '#b8b858' : '#5aa84a').lerp(col(ripe ? '#f2d27a' : '#a8e07a'), clamp(p.y / h)), 'leaf');
        if (ripe && i % 2 === 0) { // drooping golden heads of grain
          const dx = Math.cos(a), dz = Math.sin(a);
          for (let k = 0; k < 4; k++) { const t = k / 3, gr = G.sph(0.02, 5, 3); gr.scale(1.3, 0.9, 0.9); gr.translate(x + tx + dx * (0.02 + t * 0.06), h - t * t * 0.1, z + tz + dz * (0.02 + t * 0.06)); B.add(gr, '#f4d27a', 'leaf'); }
        }
      }
    }
    if (!ripe) stake(B, 'rice');
  },
  pumpkin(B, ripe) {
    const vine = [{ p: V(-0.3, -0.01, 0.28), r: 0.016 }, { p: V(-0.12, 0.01, 0.08), r: 0.018 }, { p: V(0.05, 0.01, -0.12), r: 0.016 }, { p: V(0.3, -0.01, -0.28), r: 0.012 }];
    B.add(tube(vine, 5, false), '#6a9a3a', 'leaf');
    bigLeaf(B, -0.26, 0.2, 2.4, 1); bigLeaf(B, 0.22, -0.28, -0.6, 0.9); bigLeaf(B, -0.28, -0.2, -2.3, 0.85); if (ripe) bigLeaf(B, 0.27, 0.22, 0.75, 0.75);
    const curl = []; for (let k = 0; k <= 12; k++) { const t = k / 12; curl.push({ p: V(0.3 + Math.cos(t * 9) * 0.05 * (1 - t), 0.06 + t * 0.08, 0.15 + Math.sin(t * 9) * 0.05 * (1 - t)), r: 0.006 }); }
    B.add(tube(curl, 4, false), '#8fbf4a', 'leaf');
    const r = ripe ? 0.24 : 0.09, g = G.sph(r, 22, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rib = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 4)), 0.6);
      let ny = y * 0.74; if (y > r * 0.75) ny -= (y - r * 0.75) * 0.9; // a dimple round the stem
      p.setXYZ(i, x * rib, ny, z * rib);
    }
    g.computeVertexNormals(); g.translate(0.04, r * 0.62, 0.02);
    const c0 = col(ripe ? '#ff9a3a' : '#6aa84a'), c1 = col(ripe ? '#ffc070' : '#a8d878');
    B.add(g, (pp, n, o) => { const a = Math.atan2(pp.z - 0.02, pp.x - 0.04); o.copy(c0).lerp(c1, clamp(n.y * 0.5)).multiplyScalar(0.86 + 0.14 * Math.pow(Math.abs(Math.cos(a * 4)), 0.5)); });
    const st = G.cyl(0.018, 0.03, 0.08, 6); st.rotateZ(0.25); st.translate(0.03, r * 1.2 + 0.02, 0.02); B.add(st, '#6a8a3a');
    if (!ripe) stake(B, 'pumpkin');
  },
  melon(B, ripe) {
    bigLeaf(B, -0.26, 0.22, 2.3, 1, '#4a9040'); bigLeaf(B, 0.25, -0.26, -0.7, 0.9, '#4a9040'); bigLeaf(B, 0.28, 0.24, 0.8, 0.75, '#4a9040'); bigLeaf(B, -0.3, -0.18, -2.4, 0.8, '#4a9040');
    const vine = [{ p: V(-0.32, -0.01, -0.2), r: 0.014 }, { p: V(-0.1, 0.01, 0.0), r: 0.016 }, { p: V(0.32, -0.01, 0.2), r: 0.012 }];
    B.add(tube(vine, 5, false), '#6a9a3a', 'leaf');
    const r = ripe ? 0.21 : 0.085, g = G.sph(r, 28, 18); g.translate(0, r * 0.88, 0);
    const base = col(ripe ? '#b8de7a' : '#7cbf5a'), net = col(ripe ? '#f2f8dc' : '#b8e098');
    B.add(g, (p, n, o) => {
      const a = Math.atan2(p.z, p.x), v = (p.y - r * 0.88) / r;
      const w1 = Math.abs(Math.sin(a * 5 + v * 3.2)), w2 = Math.abs(Math.sin(a * 5 - v * 3.2 + 1.3)), w3 = Math.abs(Math.sin(v * 9));
      const k = Math.min(w1, w2, w3) < 0.18 ? 0.75 : 0;
      o.copy(base).multiplyScalar(0.9 + 0.12 * clamp(n.y)).lerp(net, ripe ? k : k * 0.5);
    });
    if (ripe) { const t1 = G.cyl(0.014, 0.018, 0.07, 6); t1.translate(0, r * 1.86 + 0.02, 0); B.add(t1, '#8a7a3a'); const t2 = G.cyl(0.012, 0.012, 0.12, 6); t2.rotateZ(PI / 2); t2.translate(0, r * 1.86 + 0.055, 0); B.add(t2, '#8a7a3a'); }
    else stake(B, 'melon');
  },
};

// ------------------------------------------------------------------ cached geometries
const CACHE = new Map();
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function build(key, fn, warp = 0.03) {
  let g = CACHE.get(key); if (g) return g;
  const B = new Builder(hashStr(key)); B.warpAmt = warp; B.jitter = 0.02;
  fn(B);
  const t = B.finish();
  g = { body: t.geos.body || null, leaf: t.geos.leaf || null };
  CACHE.set(key, g);
  return g;
}
/** { body, leaf } geometries (either may be null) for a crop at a model stage ('seed'|'sprout'|'young'|'ripe'). */
export function cropGeo(crop, stage) {
  return build(`crop:${crop}:${stage}`, B => {
    if (stage === 'seed') seedStage(B, crop);
    else if (stage === 'sprout') sproutStage(B, crop);
    else CROPMODELS[crop](B, stage === 'ripe');
  });
}
export function allCropGeos() { const out = []; for (const c of CROP_IDS) for (const s of STAGES) out.push({ crop: c, stage: s, ...cropGeo(c, s) }); return out; }

/** One tilled tile: a soft mound with furrows (y = 0 at the ground; the top sits at ~0.07, the rim tucks under). */
export function soilGeo() {
  let g = CACHE.get('soil'); if (g) return g;
  const pl = new THREE.PlaneGeometry(0.94, 0.94, 13, 13); pl.rotateX(-PI / 2);
  const p = pl.attributes.position, RID = 2 / 0.94; // two ridges across the tile (along x)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const sq = Math.pow(Math.pow(Math.abs(x) / 0.47, 4) + Math.pow(Math.abs(z) / 0.47, 4), 0.25); // rounded-square radius 0..1
    const k = Math.pow(clamp((1 - sq) / 0.42), 0.55), ridge = Math.cos((z + 0.235) * TAU * RID);
    p.setXYZ(i, x * (0.93 + 0.07 * k), -0.035 + k * (0.1 + 0.045 * ridge), z * (0.93 + 0.07 * k));
  }
  pl.computeVertexNormals();
  const lo = col('#6a4432'), mid = col('#8a5e44'), hi = col('#b88a66');
  paint(pl, (pp, n, o) => { const f = Math.cos((pp.z + 0.235) * TAU * RID) * 0.5 + 0.5; o.copy(lo).lerp(mid, clamp((pp.y + 0.03) / 0.07)).lerp(hi, f * f * clamp(pp.y / 0.1) * 0.8); });
  g = merge([pl]);
  CACHE.set('soil', g);
  return g;
}

/** Chewy's garden bed: a low, chunky plank edging (w × d, centred; ankle-high, so walking in reads as stepping over
 *  it), stumpy corner posts (solid: garden.js gives them colliders) and a little sign (body bucket). */
export const BED_EDGE = 0.2; // the edging's thickness (corner posts sit on its centre line)
export function bedFrameGeo(w = 4, d = 3) {
  return build(`bed:${w}x${d}`, B => {
    const h = 0.12, t = BED_EDGE, plank = '#c98f5e', dark = '#9c7458';
    const side = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const g = G.beam(L - 0.02, h, t, 0.045); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, h / 2 - 0.045, (z0 + z1) / 2);
      B.add(g, (p, n, o) => o.set(plank).multiplyScalar(n.y > 0.7 ? 1.12 : 0.9 + 0.08 * Math.sin((p.x + p.z) * 9)));
      for (let k = 1; k < Math.round(L / 0.9); k++) { // nail heads where the boards meet
        const t2 = k / Math.round(L / 0.9), nl = G.sph(0.018, 5, 3); nl.translate(x0 + (x1 - x0) * t2, h - 0.04, z0 + (z1 - z0) * t2); B.add(nl, '#8a8494');
      }
    };
    const hw = w / 2 - t / 2, hd = d / 2 - t / 2;
    side(-hw, -hd, hw, -hd); side(-hw, hd, hw, hd); side(-hw, -hd, -hw, hd); side(hw, -hd, hw, hd);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = G.box(0.24, 0.24, 0.24, 0.06); post.translate(sx * hw, 0.08, sz * hd); B.add(post, dark);
      const cap = G.sph(0.13, 10, 6); cap.scale(1, 0.5, 1); cap.translate(sx * hw, 0.2, sz * hd); B.add(cap, '#e2b988');
    }
    // the sign: "Chewy's Garden", a bone and a carrot painted on (front-left corner, leaning a little)
    B.at([-hw - 0.05, 0, hd + 0.3], 0.55, () => {
      for (const sx of [-1, 1]) { const st = G.cyl(0.02, 0.024, 0.5, 5); st.translate(sx * 0.17, 0.25, 0); B.add(st, C.woodMid); }
      const board = G.box(0.5, 0.26, 0.05, 0.03); board.translate(0, 0.44, 0.01); B.add(board, '#f6d8a8');
      const rim = G.box(0.54, 0.3, 0.035, 0.03); rim.translate(0, 0.44, -0.012); B.add(rim, C.woodDark);
      B.at([-0.08, 0.44, 0.04], 0, () => { const bn = G.cyl(0.014, 0.014, 0.16, 5); bn.rotateZ(PI / 2); B.add(bn, '#fff6e0'); for (const s of [-1, 1]) for (const u of [-1, 1]) { const k = G.sph(0.022, 6, 4); k.translate(s * 0.08, u * 0.015, 0); B.add(k, '#fff6e0'); } });
      B.at([0.12, 0.44, 0.04], -0.6, () => { const c = G.cone(0.028, 0.12, 7); c.rotateZ(PI); B.add(c, '#ff8a3a'); for (const k of [-0.5, 0, 0.5]) { const l = G.sph(0.018, 5, 4); l.scale(0.6, 1.6, 0.5); l.rotateZ(k); l.translate(Math.sin(k) * 0.02, 0.075, 0); B.add(l, '#5ab04a'); } });
    });
  }, 0.02);
}

/** A ring cursor for the targeted tile (flat, y = 0). */
export function tileCursorGeo() {
  let g = CACHE.get('cursor'); if (g) return g;
  const s = new THREE.Shape(), r = 0.16, a = 0.48;
  s.moveTo(-a + r, -a); s.lineTo(a - r, -a); s.quadraticCurveTo(a, -a, a, -a + r); s.lineTo(a, a - r); s.quadraticCurveTo(a, a, a - r, a); s.lineTo(-a + r, a); s.quadraticCurveTo(-a, a, -a, a - r); s.lineTo(-a, -a + r); s.quadraticCurveTo(-a, -a, -a + r, -a);
  const h = new THREE.Path(), b = 0.4, rb = 0.11;
  h.moveTo(-b + rb, -b); h.lineTo(b - rb, -b); h.quadraticCurveTo(b, -b, b, -b + rb); h.lineTo(b, b - rb); h.quadraticCurveTo(b, b, b - rb, b); h.lineTo(-b + rb, b); h.quadraticCurveTo(-b, b, -b, b - rb); h.lineTo(-b, -b + rb); h.quadraticCurveTo(-b, -b, -b + rb, -b);
  s.holes.push(h);
  g = new THREE.ShapeGeometry(s, 6); g.rotateX(-PI / 2);
  CACHE.set('cursor', g);
  return g;
}

// ------------------------------------------------------------------ the Seed Stall (Usagi's, South Meadows)
/** Template for the stall: a little cart with a candy-striped awning, tiers of seed packets and seedlings. Front +z. */
export function seedStallTemplate() {
  let t = CACHE.get('stall'); if (t) return t;
  const B = new Builder(4242);
  // the cart: a plank table on two wheels with a handle
  const top = G.box(1.5, 0.08, 0.72, 0.03); top.translate(0, 0.72, 0); B.add(top, C.woodLight);
  const body = G.box(1.42, 0.36, 0.64, 0.04); body.translate(0, 0.5, 0);
  B.add(body, (p, n, o) => o.set('#e2b988').multiplyScalar(Math.abs(n.z) > 0.7 && Math.abs(Math.sin(p.x * 22)) < 0.12 ? 0.82 : 1));
  for (const sx of [-1, 1]) B.at([sx * 0.62, 0.27, 0.36], 0, () => wheel(B, { r: 0.24 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.box(0.07, 0.36, 0.07, 0.02); l.translate(sx * 0.66, 0.18, sz * 0.26 - 0.04); B.add(l, C.woodMid); }
  // awning posts + striped awning + a signboard with a sprout
  for (const sx of [-1, 1]) { const p = G.cyl(0.035, 0.04, 1.2, 6); p.translate(sx * 0.7, 1.32, -0.3); B.add(p, C.woodMid); }
  B.at([0, 0, -0.3], 0, () => awning(B, { w: 1.6, d: 0.66, y: 1.92, drop: 0.26, colors: ['#8fe0c0', '#fff6f0'], n: 8 }));
  B.at([0, 2.1, -0.32], 0, () => signboard(B, { sym: 'leaf', w: 0.62, h: 0.3, color: '#fff3e0', frame: C.woodDark }));
  // tiered display: two steps of seed packets in crop colours
  const step = (y, z, w) => { const s = G.box(w, 0.1, 0.24, 0.02); s.translate(0, y, z); B.add(s, C.woodPale); };
  step(0.81, -0.12, 1.3); step(0.93, -0.24, 1.2);
  const cols = ['#c86aa8', '#ff8a3a', '#9ad872', '#6ab04e', '#ff4a5e', '#f2d27a', '#ff9a3a', '#b8e07a'];
  cols.forEach((c, i) => {
    const row = i < 4 ? 0 : 1, k = i % 4, x = -0.42 + k * 0.28, y = row ? 0.98 : 0.86, z = row ? -0.25 : -0.12;
    B.at([x, y, z], 0, () => {
      const pk = G.box(0.16, 0.2, 0.025, 0.01); pk.rotateX(-0.25); pk.translate(0, 0.1, 0); B.add(pk, '#fff6e2');
      const band = G.box(0.165, 0.055, 0.028, 0.008); band.rotateX(-0.25); band.translate(0, 0.17, -0.016); B.add(band, c);
      const win = G.sph(0.04, 8, 5); win.scale(1, 1, 0.3); win.rotateX(-0.25); win.translate(0, 0.085, 0.022); B.add(win, c);
    });
  });
  // seedling pots and a basket of veg on the front of the table
  for (const [x, z] of [[-0.55, 0.18], [-0.38, 0.22], [0.48, 0.2]]) B.at([x, 0.76, z], 0, () => pot(B, { r: 0.07, h: 0.1, color: C.terracotta, plant: 'bush' }));
  B.at([0.1, 0.76, 0.16], 0.2, () => produce(B, { kind: 'veg', s: 0.26 }));
  B.at([0.92, 0, 0.25], 0, () => bucket(B, { r: 0.11, h: 0.16, water: true }));
  t = B.finish();
  CACHE.set('stall', t);
  return t;
}

// ------------------------------------------------------------------ the Sprinkler (MODELS.sprinkler, catalog.js)
/** Build-mode model: a mossy stone base, a brass riser and a spinning three-armed head. */
export function sprinkler(B) {
  const base = G.cyl(0.26, 0.3, 0.12, 12); base.translate(0, 0.06, 0); B.add(base, (p, n, o) => o.set(n.y > 0.7 ? '#9ac07a' : '#b8b0c0'));
  const ring = G.torus(0.27, 0.025, 4, 16); ring.rotateX(PI / 2); ring.translate(0, 0.12, 0); B.add(ring, C.stoneDark);
  const riser = G.cyl(0.03, 0.035, 0.42, 8); riser.translate(0, 0.33, 0); B.add(riser, '#d8a048');
  const joint = G.sph(0.05, 8, 6); joint.translate(0, 0.54, 0); B.add(joint, '#c89038');
  B.anim({ p: [0, 0.56, 0], kind: 'spin', axis: [0, 1, 0], speed: 3 }, () => {
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU, arm = G.cyl(0.016, 0.016, 0.22, 5); arm.rotateZ(PI / 2 - 0.25); arm.translate(0.1, 0.03, 0); arm.rotateY(a); B.add(arm, '#e8b858');
      const nz = G.sph(0.03, 6, 5); nz.translate(Math.cos(a) * 0.21, 0.06, -Math.sin(a) * 0.21); B.add(nz, '#5ab8e8');
    }
    const cap = G.sph(0.045, 8, 6); cap.scale(1, 0.7, 1); cap.translate(0, 0.04, 0); B.add(cap, '#ffd84a');
  });
  B.height = 0.7;
  B.door.set(0, 0, 0.6);
}

// ------------------------------------------------------------------ the player's tools (rig.parts.handR, grip at origin)
function solidMerge(parts) { return merge(parts.map(([g, c]) => paint(g.index ? g.toNonIndexed() : g, typeof c === 'function' ? c : ((p, n, o) => o.set(c))))); }
/** The hoe: an ash handle along +z (tipped down), a broad iron blade hanging at its end. */
export function hoeGeo() {
  let g = CACHE.get('hoe'); if (g) return g;
  const h = new THREE.CylinderGeometry(0.018, 0.022, 0.78, 7); h.rotateX(PI / 2); h.translate(0, 0, 0.3);
  const grip = new THREE.CylinderGeometry(0.026, 0.026, 0.12, 7); grip.rotateX(PI / 2); grip.translate(0, 0, -0.04);
  const collar = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8); collar.rotateX(PI / 2); collar.translate(0, 0, 0.67);
  const blade = G.box(0.17, 0.13, 0.03, 0.02); blade.translate(0, -0.075, 0.7);
  const edge = new THREE.BoxGeometry(0.17, 0.02, 0.032); edge.translate(0, -0.14, 0.7);
  g = solidMerge([[h, '#d8a868'], [grip, '#e8503a'], [collar, '#8a8494'], [blade, '#a8a4b4'], [edge, '#e4e4ec']]);
  CACHE.set('hoe', g);
  return g;
}
/** A little burlap seed pouch tied with a red string (grip at the top knot). */
export function seedBagGeo() {
  let g = CACHE.get('seedbag'); if (g) return g;
  const b = new THREE.SphereGeometry(0.08, 10, 8); b.scale(1, 1.1, 0.9); b.translate(0, -0.1, 0.03);
  const neck = new THREE.CylinderGeometry(0.03, 0.05, 0.05, 8); neck.translate(0, -0.02, 0.03);
  const tie = new THREE.TorusGeometry(0.032, 0.01, 4, 10); tie.rotateX(PI / 2); tie.translate(0, -0.03, 0.03);
  const tuft = new THREE.ConeGeometry(0.035, 0.04, 7); tuft.translate(0, 0.015, 0.03);
  g = solidMerge([[b, (p, n, o) => o.set('#d8b880').multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.4))], [neck, '#c8a870'], [tie, '#e8503a'], [tuft, '#d8b880']]);
  CACHE.set('seedbag', g);
  return g;
}
