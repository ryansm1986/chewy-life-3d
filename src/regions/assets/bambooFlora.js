// Whispering Bamboo Grove flora (docs/REGIONS.md §2): geometry builders, cached per (kind, seed). Everything is local
// space with the ground at y = 0 and is drawn through the Placer's batches (bambooKit.js):
//  stand(kind, seed)  thick clumps of culms: mixed heights and greens (fresh, mature, golden kinmei with green stripes,
//                     old grey-lichened), swollen nodes with a waxy white band under each, gentle leans, branch twigs
//                     in the upper half carrying hand-shaped leaf clusters (read from the high camera) and drooping
//                     sprays (read from the side), a crown of arching sprays, a root mound and fallen culm sheaths.
//                     kinds: grove (7-11 tall culms), clump (4-6), wall (12-16, the dense edges), young (short, bright),
//                     arch (culms bowing out over the trail).  → { culm, culmLeaf }
//  shoot(seed)        takenoko: a stack of speckled overlapping sheaths with a green-gold tip.      → { 'd:body' }
//  fern(seed)         arching fronds (painted pinnae) + a top-view rosette card.                     → { fern }
//  hosta(seed, kind)  a rosette of broad cupped leaves (blue-green, or variegated with cream margins) and a lilac
//                     flower spike.                                                                   → { plant }
//  mossMound(seed)    a low velvet cushion.                                                          → { moss }
//  mossBoulder(seed)  a round stone wearing a thick moss cap, pebbles at its foot.                   → { rock }
//  litter(seed, kind) flat fallen-leaf decals ('bamboo' | 'maple' | 'mixed').                        → { litter }
import * as THREE from 'three';
import { tube, puff, merge, paint } from '../../gfx/geom.js';
import { mossyStone } from '../../world/buildings/props.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { CardSet, V, col, cols, UP, PI, pick, dirAt, nz } from './bambooKit.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };

// ------------------------------------------------------------------ culms
const GREENS = {
  fresh: cols('#6cbf4a', '#7ccb56', '#5eb244'), mature: cols('#4f9a44', '#5aa64a', '#468e40'),
  pale: cols('#9ccc5c', '#a8d266', '#b4d470'), gold: cols('#e0cc54', '#d8c44a', '#ead86a'), old: cols('#7e9a5a', '#8aa466', '#6e8c52'),
};
const LEAF = {
  fresh: cols('#6fbe4c', '#82c856', '#96d262', '#5eae46', '#a8da6c'),
  mature: cols('#4e9a44', '#5eaa4a', '#72b852', '#468c40', '#86c258'),
  young: cols('#8cd05c', '#9ed866', '#b0e072', '#7cc452', '#c0e67e'),
  gold: cols('#a8cc58', '#b8d462', '#98c050', '#c4da6e', '#8cba4c'),
};
// one culm: returns { g (culm tube + twigs), cards added to C }
function culm(r, C, o) {
  const { H, R, lean, la, tone, leaf, x0, z0, crown = 1, twigK = 1 } = o;
  const ld = dirAt(la), side = V(-ld.z, 0, ld.x), wob = r() * TAU;
  const at = y => { const t = Math.max(0, y / H); return V(x0, y, z0).addScaledVector(ld, lean * Math.pow(t, 1.9) * H * 0.16).addScaledVector(side, Math.sin(t * 4.1 + wob) * 0.06 * t); };
  const rad = y => R * (1 - 0.5 * Math.pow(Math.max(0, y / H), 1.25));
  const radial = R > 0.075 ? 7 : R > 0.05 ? 6 : 5;
  // rings: ground, then for each node a waxy band just under it and the swollen node ridge
  const pts = [{ p: at(-0.15), r: R * 1.3, k: 0 }, { p: at(0.03), r: R * 1.22, k: 0 }, { p: at(0.13), r: R * 1.03, k: 0 }], nodes = [];
  let y = 0.28 + r() * 0.1, i = 0;
  while (y < H - 0.3) {
    const t = y / H, L = (0.26 + Math.min(1, t * 2.4) * 0.34 - Math.max(0, t - 0.7) * 0.4) * (0.92 + r() * 0.16) * Math.max(1, H / 8);
    pts.push({ p: at(y - 0.05), r: rad(y) * 0.99, k: 1 }, { p: at(y), r: rad(y) * 1.13, k: 2 });
    nodes.push(y); y += L; i++;
  }
  pts.push({ p: at(H - 0.05), r: rad(H - 0.05) * 0.8, k: 0 }, { p: at(H + 0.2), r: R * 0.18, k: 0 });
  const g = tube(pts, radial, true);
  const base = pick(r, GREENS[tone]).clone().offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.06, (r() - 0.5) * 0.05), dark = base.clone().multiplyScalar(0.58).offsetHSL(0, 0.05, 0);
  const powder = base.clone().lerp(col('#eef4dc'), 0.42), stripe = col('#5aa848'), lichen = col('#d8dcc8'), row = radial + 1;
  paint(g, (p, n, out, vi) => {
    const ri = Math.min(pts.length - 1, Math.floor(vi / row)), kind = vi >= pts.length * row ? 0 : pts[ri].k;
    const t = clamp(p.y / H), a = Math.atan2(n.z, n.x);
    out.copy(base).multiplyScalar(0.84 + 0.22 * t + 0.05 * Math.sin(a * 3 + wob));
    if (tone === 'gold' && Math.abs(Math.sin(a * 0.5 + wob + p.y * 0.08)) < 0.22) out.lerp(stripe, 0.8); // kinmei stripe
    if (tone === 'old' && p.y < H * 0.4 && nz(p.y * 3 + wob, a * 2) > 0.25) out.lerp(lichen, 0.45);
    if (kind === 1) out.lerp(powder, 0.6);
    else if (kind === 2) out.copy(dark);
    if (p.y < 0.05) out.multiplyScalar(0.7);
  });
  const parts = [g];
  // branch twigs from the upper nodes, alternating sides, each carrying leaf clusters and a drooping spray
  const tw = base.clone().multiplyScalar(0.8), lc = LEAF[leaf];
  let side0 = r() * TAU;
  for (let k = 0; k < nodes.length; k++) {
    const ny = nodes[k], t = ny / H;
    if (t < 0.5 - (1 - twigK) * 0.2 || r() > 0.85 * twigK + 0.1) continue;
    side0 += PI + (r() - 0.5) * 1.1;
    const P = at(ny + 0.02), d = dirAt(side0), L = (0.95 - t * 0.55) * (0.8 + r() * 0.45) * Math.max(0.7, R / 0.09) * crown;
    const mid = P.clone().addScaledVector(d, L * 0.5).add(V(0, L * 0.28, 0)), end = P.clone().addScaledVector(d, L).add(V(0, L * 0.18, 0));
    parts.push(paint(tube([{ p: P, r: R * 0.22 }, { p: mid, r: R * 0.13 }, { p: end, r: R * 0.06 }], 3, true), (pp, nn, out) => out.copy(tw)));
    // clusters seen from above (tilted a little out), a spray hanging off the tip, sometimes a second cluster at mid
    const up = V(0, 1, 0).addScaledVector(d, 0.35).normalize();
    C.cluster(r, end.clone().add(V(0, 0.05, 0)), up, (1.05 + r() * 0.45) * crown, r() < 0.5 ? 'C1' : 'C2', pick(r, lc), 0.4, UP);
    if (r() < 0.6) C.cluster(r, mid.clone().add(V(0, 0.06, 0)), up, (0.8 + r() * 0.3) * crown, r() < 0.5 ? 'C1' : 'C2', pick(r, lc), 0.45, UP);
    const sl = (0.75 + r() * 0.35) * crown, s1 = end.clone().addScaledVector(d, sl * 0.3).add(V(0, -sl * 0.35, 0)), s2 = s1.clone().addScaledVector(d, sl * 0.12).add(V(0, -sl * 0.55, 0));
    C.spray([end, s1, s2], V(-d.z, 0, d.x).applyAxisAngle(d, (r() - 0.5) * 0.8), 0.5 * crown, V(0, 1, 0).addScaledVector(d, 0.5).normalize(), r() < 0.5 ? 'S1' : 'S2', pick(r, lc), pick(r, lc).clone().multiplyScalar(1.08));
  }
  // crown: sprays arching out and down round the tip, a couple of top clusters
  const top = at(H - 0.1), ns = 4 + Math.floor(r() * 3);
  for (let k = 0; k < ns; k++) {
    const a = k / ns * TAU + r() * 0.6, d = dirAt(a), sl = (0.9 + r() * 0.4) * crown;
    const p0 = top.clone().add(V(0, -r() * 0.4, 0)), p1 = p0.clone().addScaledVector(d, sl * 0.45).add(V(0, 0.12, 0)), p2 = p1.clone().addScaledVector(d, sl * 0.3).add(V(0, -sl * 0.5, 0));
    C.spray([p0, p1, p2], V(-d.z, 0, d.x), 0.55 * crown, V(0, 1, 0).addScaledVector(d, 0.4).normalize(), k % 2 ? 'S1' : 'S2', pick(r, lc), pick(r, lc));
  }
  for (let k = 0; k < 2; k++) C.cluster(r, top.clone().add(V((r() - 0.5) * 0.4, -0.2 - k * 0.5, (r() - 0.5) * 0.4)), UP, (1.1 + r() * 0.4) * crown, k ? 'C1' : 'C2', pick(r, lc), 0.5, UP);
  return parts;
}
// fallen culm sheaths: curled tan paper husks at a stand's foot
function husk(r, x, z) {
  const a = r() * TAU, L = 0.22 + r() * 0.14, W = 0.1 + r() * 0.05, pos = [], idx = [];
  const S = 5;
  for (let i = 0; i <= S; i++) {
    const t = i / S, w = W * (1 - t * 0.8), lift = Math.sin(t * PI) * 0.04;
    for (const s of [-1, 1]) pos.push(t * L, 0.02 + lift + w * 0.45 * (1 - Math.abs(s)) + (s > 0 ? w * 0.3 : w * 0.3), s * w);
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.rotateY(a); g.translate(x, 0, z);
  const c = col(pick(r, ['#c8a070', '#b88c5c', '#d8b484']));
  return paint(g.toNonIndexed(), (p, n, o) => o.copy(c).multiplyScalar(0.85 + 0.2 * clamp(Math.abs(n.y))));
}
// the clump's root mound: a low, lumpy knoll (earth showing between the culms, moss and litter toward the rim)
function mound(r, R, seed) {
  const g = puff(V(0, -0.04, 0), R, { detail: 2, noise: 0.42, squash: 0.1, seed });
  return paint(g, (p, n, o) => {
    const d = Math.hypot(p.x, p.z) / R, k = nz(p.x * 5 + seed, p.z * 5) * 0.5 + 0.5;
    o.set('#6a5a3c').lerp(col('#7c8c46'), clamp(d * 1.3 - 0.2 + k * 0.4)).lerp(col('#8fb058'), clamp(d - 0.7) * 1.5);
  });
}
const STAND = {
  grove: { n: [7, 11], R: [0.085, 0.12], H: [6.2, 8.8], spread: 1.05, tones: ['fresh', 'fresh', 'mature', 'mature', 'pale', 'old', 'gold'], leaf: ['fresh', 'mature'] },
  clump: { n: [4, 6], R: [0.07, 0.1], H: [4.4, 6.4], spread: 0.7, tones: ['fresh', 'fresh', 'mature', 'pale'], leaf: ['fresh', 'young'] },
  wall: { n: [12, 16], R: [0.09, 0.13], H: [7.2, 10], spread: 1.55, tones: ['mature', 'mature', 'fresh', 'old', 'pale'], leaf: ['mature', 'fresh'] },
  young: { n: [3, 5], R: [0.045, 0.065], H: [2.2, 3.6], spread: 0.45, tones: ['fresh', 'pale'], leaf: ['young'] },
  arch: { n: [5, 8], R: [0.08, 0.11], H: [6.5, 8.5], spread: 0.8, tones: ['fresh', 'mature', 'gold', 'pale'], leaf: ['fresh', 'gold'], lean: [2.2, 3.2] },
};
export const STAND_KINDS = Object.keys(STAND);
export function stand(kind = 'grove', seed = 0) {
  return cached(`stand:${kind}:${seed}`, () => {
    const S = STAND[kind], r = mulberry32(seed * 7919 + kind.length * 131 + 1), C = new CardSet(), parts = [];
    const n = S.n[0] + Math.floor(r() * (S.n[1] - S.n[0] + 1)), la0 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * S.spread * (i ? 1 : 0.25), x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
      const out = d / Math.max(0.01, S.spread); // outer culms: shorter, lean out
      const H = (S.H[0] + (S.H[1] - S.H[0]) * r()) * (1 - out * 0.22);
      const R = (S.R[0] + (S.R[1] - S.R[0]) * r()) * (1 - out * 0.15);
      const lean = S.lean ? (S.lean[0] + r() * (S.lean[1] - S.lean[0])) * (0.6 + out * 0.5) : 0.3 + r() * 0.9 + out * 0.8;
      const la = S.lean ? la0 + (r() - 0.5) * 0.9 : Math.atan2(z0, x0) + (r() - 0.5) * 1.2;
      parts.push(...culm(r, C, { H, R, lean, la, tone: pick(r, S.tones), leaf: pick(r, S.leaf), x0, z0 }));
    }
    // a young culm or two in the big stands, wrapped low in tan sheaths
    if (kind === 'grove' || kind === 'wall') for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
      const a = r() * TAU, d = S.spread * (0.7 + r() * 0.4);
      parts.push(...culm(r, C, { H: 2.4 + r() * 1.4, R: 0.05 + r() * 0.015, lean: 0.4, la: a, tone: 'pale', leaf: 'young', x0: Math.cos(a) * d, z0: Math.sin(a) * d, crown: 0.8, twigK: 1.2 }));
    }
    const nh = kind === 'young' ? 1 : 2 + Math.floor(r() * 3);
    for (let k = 0; k < nh; k++) { const a = r() * TAU, d = S.spread * (0.5 + r() * 0.8); parts.push(husk(r, Math.cos(a) * d, Math.sin(a) * d)); }
    // rhizome knuckles: a few bumps of root between the culms (the terrain paints the earth under the clump)
    for (let k = 0; k < 3 + Math.floor(r() * 3); k++) { const a = r() * TAU, d = Math.sqrt(r()) * S.spread; parts.push(paint(puff(V(Math.cos(a) * d, 0, Math.sin(a) * d), 0.12 + r() * 0.08, { detail: 1, noise: 0.3, squash: 0.45, seed: seed + k }), (p, n, o) => o.set('#8a7a4a').lerp(col('#a89858'), clamp(n.y)))); }
    const culmGeo = merge(parts); culmGeo.computeBoundingSphere();
    const leafGeo = C.geo(); leafGeo.computeBoundingSphere();
    return { culm: culmGeo, culmLeaf: leafGeo };
  });
}

// ------------------------------------------------------------------ takenoko (bamboo shoot)
export function shoot(seed = 0) {
  return cached('shoot:' + seed, () => {
    const r = mulberry32(seed * 313 + 5), parts = [], H = 0.34 + r() * 0.34, R = 0.11 + r() * 0.05, lean = V((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1);
    const ns = 6;
    for (let i = 0; i < ns; i++) { // overlapping sheaths: each a cone ring, flared at its lower lip
      const t0 = i / ns, t1 = Math.min(1, t0 + 0.34), r0 = R * (1 - t0 * 0.85) * 1.12, r1 = R * (1 - t1 * 0.9);
      const pts = [[r0 * 0.8, 0], [r0, 0.02], [r0 * 0.92, (t1 - t0) * H * 0.5], [Math.max(0.004, r1), (t1 - t0) * H]];
      const g = new THREE.LatheGeometry(pts.map(([u, v]) => new THREE.Vector2(u, v)), 9);
      g.rotateY(r() * TAU); g.translate(lean.x * t0, t0 * H - 0.03, lean.z * t0);
      const c = col(pick(r, ['#a8784a', '#b88a58', '#9a6c44'])), tipC = col('#c8c068'), spot = col('#5a3a2a');
      paint(g, (p, n, o) => {
        const t = clamp(p.y / H);
        o.copy(c).lerp(tipC, clamp((t - 0.55) * 2.2)).multiplyScalar(0.86 + 0.2 * clamp(n.y + 0.4));
        if (t < 0.7 && nz(p.x * 40 + i, p.z * 40 + p.y * 30) > 0.42) o.lerp(spot, 0.6); // speckles
      });
      parts.push(g);
    }
    // green-gold leafy tip and a crumb of soil
    const tip = new THREE.ConeGeometry(0.03, 0.12, 5); tip.translate(lean.x, H + 0.03, lean.z); paint(tip, (p, n, o) => o.set('#b8d060')); parts.push(tip);
    const soil = puff(V(0, 0, 0), R * 1.6, { detail: 1, noise: 0.4, squash: 0.25, seed }); paint(soil, (p, n, o) => o.set('#6a5238').lerp(col('#8a6a48'), clamp(n.y))); parts.push(soil);
    return { 'd:body': merge(parts) };
  });
}

// ------------------------------------------------------------------ fern
export function fern(seed = 0, { big = 1 } = {}) {
  return cached(`fern:${seed}:${big}`, () => {
    const r = mulberry32(seed * 97 + 13), C = new CardSet();
    const pal = cols('#3e8a3c', '#4e9a44', '#62aa4c', '#78b856', '#5a9e48'), tipP = cols('#86c25c', '#9ccc66', '#74b454');
    const n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.5, d = dirAt(a), L = (0.55 + r() * 0.3) * big, rise = (0.32 + r() * 0.16) * big;
      const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(d.clone().multiplyScalar(L * t).add(V(0, rise * Math.sin(t * PI * 0.85) + 0.03, 0))); }
      C.spray(pts, V(-d.z, 0, d.x).applyAxisAngle(d, (r() - 0.5) * 0.5), (0.3 + r() * 0.06) * big, V(0, 1, 0).addScaledVector(d, 0.3).normalize(), i % 2 ? 'S1' : 'S2', pick(r, pal), pick(r, tipP));
    }
    C.cluster(r, V(0, 0.2 * big, 0), UP, 1.15 * big, r() < 0.5 ? 'C1' : 'C2', pick(r, pal), 0.15, UP);
    const g = C.geo(); g.computeBoundingSphere();
    return { fern: g };
  });
}

// ------------------------------------------------------------------ hosta
function hostaLeaf(r, a, L, W, cMid, cEdge, variegated) {
  const U = 7, Vn = 5, pos = [], idx = [], clr = [];
  const d = dirAt(a), s = V(-d.z, 0, d.x), c = new THREE.Color();
  for (let i = 0; i <= U; i++) {
    const u = i / U, w = W * Math.pow(Math.sin(PI * Math.min(1, u * 0.95 + 0.05)), 0.8) * (1 - u * 0.25);
    const along = L * u, h = Math.sin(u * PI * 0.75) * L * 0.42 - u * u * L * 0.18 + 0.03; // arch up then droop
    for (let j = 0; j <= Vn; j++) {
      const v = j / Vn * 2 - 1, cup = v * v * w * 0.45;
      const p = d.clone().multiplyScalar(along).addScaledVector(s, v * w).add(V(0, h + cup, 0));
      pos.push(p.x, p.y, p.z);
      const e = Math.abs(v), vein = Math.abs(Math.sin(v * 4.5)) < 0.18 ? 0.08 : 0;
      c.copy(cMid).lerp(cEdge, variegated ? clamp((e - 0.62) * 4) : clamp(u * 0.6) * 0.35).multiplyScalar(0.92 + vein + 0.1 * u);
      clr.push(c.r, c.g, c.b);
      if (i && j) { const q = i * (Vn + 1) + j; idx.push(q - Vn - 2, q - Vn - 1, q - 1, q - 1, q - Vn - 1, q); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export function hosta(seed = 0, kind = 'blue') {
  return cached(`hosta:${seed}:${kind}`, () => {
    const r = mulberry32(seed * 131 + kind.length), parts = [];
    const [mid, edge] = kind === 'variegated' ? [col('#4e8a58'), col('#eef0c0')] : kind === 'gold' ? [col('#9cc452'), col('#c8dc6a')] : [col('#5a9478'), col('#86b49a')];
    const n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.4, L = 0.5 + r() * 0.16, W = L * (0.36 + r() * 0.06);
      parts.push(hostaLeaf(r, a, L, W, mid.clone().offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.05), edge, kind === 'variegated'));
    }
    // inner, upright leaves
    for (let i = 0; i < 3; i++) { const g = hostaLeaf(r, r() * TAU, 0.36, 0.13, mid.clone().multiplyScalar(1.08), edge, kind === 'variegated'); g.scale(0.8, 1.3, 0.8); parts.push(g); }
    if (r() < 0.75) { // flower scape with nodding lilac bells
      const a = r() * TAU, top = V(Math.cos(a) * 0.06, 0.62 + r() * 0.16, Math.sin(a) * 0.06);
      parts.push(paint(tube([{ p: V(0, 0.05, 0), r: 0.012 }, { p: top.clone().multiplyScalar(0.6), r: 0.01 }, { p: top, r: 0.006 }], 3, true), (p, n, o) => o.set('#5a8a4a')));
      for (let k = 0; k < 6; k++) {
        const t = 0.55 + k * 0.08, q = top.clone().multiplyScalar(t), ba = k * 2.2;
        const b = new THREE.ConeGeometry(0.028, 0.07, 6, 1, true); b.rotateX(PI); b.rotateZ(0.6); b.rotateY(ba); b.translate(q.x + Math.cos(ba) * 0.03, q.y - 0.02, q.z + Math.sin(ba) * 0.03);
        paint(b, (p, n, o) => o.set(k % 2 ? '#c8b0f0' : '#b89ce8').lerp(col('#f4ecff'), 0.2)); parts.push(b);
      }
    }
    const g = merge(parts); g.computeBoundingSphere();
    return { plant: g };
  });
}

// ------------------------------------------------------------------ moss & stones
export function mossMound(seed = 0) {
  return cached('moss:' + seed, () => {
    const r = mulberry32(seed * 53 + 9), parts = [];
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = i ? 0.3 + r() * 0.35 : 0, R = (i ? 0.32 : 0.5) + r() * 0.2;
      const g = puff(V(Math.cos(a) * d, 0.0, Math.sin(a) * d), R, { detail: 2, noise: 0.28, squash: 0.28, seed: seed * 7 + i });
      paint(g, (p, nn, o) => {
        const k = nz(p.x * 5 + seed, p.z * 5 - seed) * 0.5 + 0.5;
        o.set('#5f9444').lerp(col('#86b654'), k).lerp(col('#b4d670'), clamp(nn.y - 0.55) * 0.9 * k);
        if (p.y < 0.03) o.multiplyScalar(0.75);
      });
      parts.push(g);
    }
    const g = merge(parts); g.computeBoundingSphere();
    return { moss: g };
  });
}
export function mossBoulder(seed = 0, { moss = 0.62, sq = 0.62 } = {}) {
  return cached(`boulder:${seed}:${moss}:${sq}`, () => {
    const r = mulberry32(seed * 17 + 3);
    const g0 = puff(V(0, 0.18, 0), 0.62, { detail: 2, noise: 0.34, squash: sq, seed: seed + 40 });
    const parts = [mossyStone(g0, { amt: moss, sc: 2.6, seed, lift: 0.06, stone: ['#9c98ac', '#cfcad4'], moss: '#6a9e48', hi: '#a8d06a' })];
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = 0.66 + r() * 0.26, pb = new THREE.IcosahedronGeometry(0.06 + r() * 0.06, 0); pb.scale(1.2, 0.6, 1); pb.translate(Math.cos(a) * d, 0.03, Math.sin(a) * d);
      const c = col(pick(r, ['#b0aabc', '#c8c0c8', '#a8a0ac'])); paint(pb, (p, n, o) => o.copy(c).multiplyScalar(0.85 + 0.2 * clamp(n.y))); parts.push(pb);
    }
    const g = merge(parts); g.computeBoundingSphere();
    return { rock: g };
  });
}
// flat leaf-litter decal patch (lies on the ground; polygon offset in the material)
export function litter(seed = 0, kind = 'bamboo') {
  return cached(`litter:${kind}:${seed}`, () => {
    const r = mulberry32(seed * 71 + kind.length * 3), C = new CardSet();
    const PAL = {
      bamboo: cols('#c8b474', '#d8c890', '#b0a060', '#a8b464', '#e0d4a0', '#9aa85a'),
      maple: cols('#e0483a', '#f06a36', '#ff9a40', '#d8383a', '#ffb84a', '#c83a30'),
      ginkgo: cols('#ffd84a', '#f4c43a', '#ffe680', '#e8b030'),
      mixed: cols('#e0483a', '#ff9a40', '#ffd84a', '#c8a060', '#b86a3a', '#f06a36'),
    }[kind];
    const rects = kind === 'bamboo' ? ['C1', 'C1', 'S2'] : kind === 'ginkgo' ? ['S1'] : ['C2', 'C2', 'S1'];
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.9, rect = pick(r, rects), sz = rect[0] === 'S' ? 0.26 + r() * 0.1 : 0.8 + r() * 0.5;
      const p = V(Math.cos(a) * d, 0.015 + i * 0.002, Math.sin(a) * d), rot = r() * TAU;
      const ax = V(Math.cos(rot), 0, Math.sin(rot)).multiplyScalar(sz / 2), ay = V(Math.sin(rot), 0, -Math.cos(rot)).multiplyScalar(sz / 2 * (rect[0] === 'S' ? 4 : 1));
      C.quad(p, ax, ay, UP, rect, pick(r, PAL));
    }
    const g = C.geo(); g.computeBoundingSphere();
    return { litter: g };
  });
}
