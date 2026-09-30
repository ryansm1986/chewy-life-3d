// Momiji Hollow flora (docs/REGIONS.md §2): autumn trees and ground cover, cached per (kind, seed), local space with the
// ground at y = 0, drawn through the Placer's batches (bambooKit.js). Trees return { bark, foliage, 'cards:<atlas>' }.
//  maple(style, seed, dye)  style 'tier' (the village's airy momiji, re-dyed), 'dome' (a broad, full autumn crown),
//                           'weep' (a low cascading shidare-momiji); dye 'crimson' | 'scarlet' | 'orange' | 'gold' |
//                           'turning' (yellow-green inside, red at the crown)
//  ginkgo(seed)             the village ginkgo column, a touch brighter
//  persimmon(seed)          an open, crooked crown with sparse rusty leaves and dozens of glowing orange kaki
//  chestnut(seed)           a broad yellow-green crown; burrs(seed) = spiky burrs + nuts on the ground
//  susuki(seed)             autumn pampas: tan stems, silver plumes
//  higanbana(seed)          a clump of red spider lilies (curled petals, long stamens)
//  leafPile(seed)           a heaped mound of fallen leaves (the burst-able POI and the arena dressing)
//  mushrooms(seed, kind)    'shiitake' | 'amanita' | 'shimeji' clusters
import * as THREE from 'three';
import { VEG_BUILD } from '../../world/vegetation.js';
import { tube, puff, merge, paint, branch } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { CardSet, mass, paintMass, cullBuried, recolor, V, col, cols, UP, PI, pick, dirAt, nz } from './bambooKit.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const clone = g => { const c = g.clone(); c.computeBoundingSphere(); return c; };

// ------------------------------------------------------------------ dyes
// hue offsets applied to the village's red-orange maple ramp
const DYE = {
  crimson: (o) => o.offsetHSL(-0.012, 0.04, -0.05),
  scarlet: () => {},
  orange: (o) => o.offsetHSL(0.035, 0.02, 0.03),
  gold: (o) => o.offsetHSL(0.085, -0.02, 0.07),
};
const dyeFn = (dye, H = 4.2) => dye === 'turning'
  ? (o, p) => { const k = clamp(1 - (p.y - 1.6) / (H - 1.6)); o.offsetHSL(0.16 * k * k, -0.1 * k, 0.05 * k); }
  : DYE[dye] || DYE.scarlet;

// ------------------------------------------------------------------ bark
function barkPaint(g, c0 = '#5a4640', c1 = '#8a7064') {
  const a = col(c0), b = col(c1);
  return paint(g, (p, n, o) => o.copy(a).lerp(b, clamp(n.y * 0.3 + 0.5 + nz(p.x * 3.1 + p.y * 1.3, p.z * 3.1 - p.y * 2.2) * 0.22)));
}
const roots = (list, r, len, n, h = 0.3, k = 1) => {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.9, L = len * (1.1 + r() * 0.8), d = dirAt(a), sd = V(-d.z, 0, d.x), w = (r() - 0.5) * 0.35 * L, t = 0.8 + r() * 0.45;
    const p0 = V(0, h + 0.4, 0).addScaledVector(d, 0.04), p1 = d.clone().multiplyScalar(L * 0.34).add(V(0, h * 0.8 + 0.1, 0)).addScaledVector(sd, w * 0.4);
    const p2 = d.clone().multiplyScalar(L * 0.7).add(V(0, 0.08, 0)).addScaledVector(sd, w), p3 = d.clone().multiplyScalar(L).add(V(0, -0.14, 0)).addScaledVector(sd, w * 1.4);
    list.push(tube([{ p: p0, r: 0.16 * k * t }, { p: p1, r: 0.13 * k * t }, { p: p2, r: 0.08 * k * t }, { p: p3, r: 0.03 * k * t }], 6, true));
  }
};

// ------------------------------------------------------------------ maples
const MAPLE_LEAF = {
  crimson: cols('#b8222c', '#c82a2e', '#a81e2a', '#d4362e', '#e04a34'),
  scarlet: cols('#d8362c', '#e2482e', '#ee5a30', '#c42e2a', '#f47034'),
  orange: cols('#f06a32', '#ff8238', '#f25a30', '#ff9a3c', '#ffae48'),
  gold: cols('#ffb43c', '#ffc848', '#f4a030', '#ffd860', '#ffe070'),
};
function domeMaple(seed, dye) {
  const r = mulberry32(seed * 131 + 21), trunk = [], masses = [], C = new CardSet();
  const H0 = 1.6 + r() * 0.3, top = V((r() - 0.5) * 0.4, H0, (r() - 0.5) * 0.4);
  trunk.push(branch(V(0, -0.2, 0), top, 0.3, 0.22, V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), 6, 8));
  roots(trunk, r, 0.55, 5);
  const crown = V(top.x, 3.6, top.z), M = [], nl = 4 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < nl; i++) { // limbs fanning up and out into the lobes of a broad crown
    const a = i / nl * TAU + r() * 0.6, d = dirAt(a), sp = 1.35 + r() * 0.4;
    const end = top.clone().addScaledVector(d, sp).add(V(0, 1.25 + r() * 0.5, 0));
    trunk.push(branch(top, end, 0.17, 0.06, V(0, 0.3, 0), 5, 6));
    M.push({ c: end.clone().add(V(0, 0.35, 0)).addScaledVector(d, 0.25), r: 1.15 + r() * 0.2, sy: 0.72, d });
  }
  M.push({ c: V(top.x, 4.4, top.z), r: 1.5, sy: 0.7, detail: 3 });
  const pal = dye === 'turning' ? MAPLE_LEAF.orange : MAPLE_LEAF[dye] || MAPLE_LEAF.scarlet;
  const deep = pal.map(c => c.clone().multiplyScalar(0.42).offsetHSL(-0.015, 0.05, 0)), hi = pal[3].clone().multiplyScalar(0.8);
  const y0 = Math.min(...M.map(m => m.c.y - m.r)), y1 = Math.max(...M.map(m => m.c.y + m.r));
  const geos = M.map((m, i) => mass(m.c, m.r, { detail: m.detail || 3, sy: m.sy, lumps: 0.38, rough: 0.07, seed: seed * 29 + i + 7, crown, crownMix: 0.55, belly: 0.3 }));
  geos.forEach((g, i) => masses.push(paintMass(cullBuried(g, g.userData.m, geos.map(q => q.userData.m)), [deep[0], deep[2], deep[1].clone().lerp(pal[0], 0.35), pal[0].clone().multiplyScalar(0.8)], { y0, y1, hi, hiAmt: 0.2, under: 0.7, patch: 0.16, seed: i })));
  M.forEach((m, mi) => {
    const kAt = geos[mi].userData.m.k, nc = Math.round(40 + m.r * 26);
    for (let k = 0; k < nc; k++) { // star-leaf clusters, top-heavy (the camera looks down on crowns)
      const dir = V(r() - 0.5, -0.3 + r() * 1.5, r() - 0.5).normalize();
      const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * m.sy, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * (1.0 + r() * 0.2)));
      C.cluster(r, p, dir, 1.05 + r() * 0.45, k % 2 ? 'C1' : 'C2', pick(r, pal), 0.5, dir.clone().lerp(p.clone().sub(crown).normalize(), 0.5).normalize());
    }
    for (let k = 0; k < 3; k++) {
      const a = r() * TAU, rd = dirAt(a), t0 = m.c.clone().addScaledVector(rd, m.r * 0.8).add(V(0, -m.r * m.sy * 0.3, 0)), len = 0.6 + r() * 0.3;
      const p1 = t0.clone().addScaledVector(rd, 0.2).add(V(0, -len * 0.5, 0)), p2 = p1.clone().add(V(0, -len * 0.5, 0));
      C.spray([t0, p1, p2], V(-rd.z, 0, rd.x), 0.45, rd.clone().add(V(0, 0.3, 0)).normalize(), k % 2 ? 'S1' : 'S2', pal[0], pal[3]);
    }
  });
  return { bark: barkPaint(merge(trunk)), foliage: merge(masses), 'cards:maple': C.geo() };
}
function weepMaple(seed, dye) {
  const r = mulberry32(seed * 131 + 33), trunk = [], masses = [], C = new CardSet();
  // a short gnarled trunk splitting into arching limbs that droop back to the ground: a mounded umbrella
  const top = V((r() - 0.5) * 0.2, 0.8, (r() - 0.5) * 0.2);
  trunk.push(branch(V(0, -0.2, 0), top, 0.2, 0.15, V(0.12, 0, 0.05), 5, 7));
  roots(trunk, r, 0.35, 4, 0.2, 0.7);
  const pal = MAPLE_LEAF[dye === 'turning' ? 'scarlet' : dye] || MAPLE_LEAF.crimson;
  const nl = 6, crown = V(0, 1.3, 0);
  for (let i = 0; i < nl; i++) {
    const a = i / nl * TAU + r() * 0.4, d = dirAt(a), R = 1.3 + r() * 0.35;
    const peak = top.clone().addScaledVector(d, R * 0.45).add(V(0, 0.75 + r() * 0.2, 0)), tip = top.clone().addScaledVector(d, R).add(V(0, 0.35, 0));
    trunk.push(branch(top, peak, 0.1, 0.05, V(0, 0.1, 0), 4, 5), branch(peak, tip, 0.05, 0.025, V(0, 0.15, 0), 4, 4));
    const g = mass(peak.clone().addScaledVector(d, 0.25).add(V(0, 0.05, 0)), 0.62 + r() * 0.1, { sx: 1.25, sz: 1.25, sy: 0.55, lumps: 0.4, seed: seed * 17 + i, crown, crownMix: 0.5, belly: 0.4 });
    masses.push(paintMass(g, [pal[2].clone().multiplyScalar(0.35), pal[0].clone().multiplyScalar(0.5), pal[0].clone().multiplyScalar(0.72)], { y0: 0.9, y1: 1.9, hi: pal[3].clone().multiplyScalar(0.8), hiAmt: 0.2, under: 0.7, patch: 0.15, seed: i }));
    // curtain of sprays falling off the rim almost to the ground
    for (let k = 0; k < 5; k++) {
      const aa = a + (k - 2) * 0.28 + (r() - 0.5) * 0.15, rd = dirAt(aa), p0 = top.clone().addScaledVector(rd, R * (0.72 + r() * 0.2)).add(V(0, 0.7 + r() * 0.15, 0));
      const len = 0.75 + r() * 0.35, p1 = p0.clone().addScaledVector(rd, 0.22).add(V(0, -len * 0.4, 0)), p2 = p1.clone().addScaledVector(rd, 0.06).add(V(0, -len * 0.6, 0));
      C.spray([p0, p1, p2], V(-rd.z, 0, rd.x), 0.5, rd.clone().multiplyScalar(0.6).add(V(0, 0.6, 0)).normalize(), k % 2 ? 'S1' : 'S2', pick(r, pal), pick(r, pal));
    }
    for (let k = 0; k < 18; k++) {
      const dir = V(r() - 0.5, 0.1 + r() * 0.9, r() - 0.5).addScaledVector(d, 0.4).normalize(), p = peak.clone().addScaledVector(d, 0.25).add(V(dir.x * 0.8, dir.y * 0.38, dir.z * 0.8));
      C.cluster(r, p, dir, 0.85 + r() * 0.35, k % 2 ? 'C1' : 'C2', pick(r, pal), 0.45, UP);
    }
  }
  return { bark: barkPaint(merge(trunk), '#4a3a3a', '#7a645e'), foliage: merge(masses), 'cards:maple': C.geo() };
}
export const MAPLE_STYLES = ['tier', 'dome', 'weep'];
export const DYES = ['crimson', 'scarlet', 'orange', 'gold', 'turning'];
export function maple(style = 'tier', seed = 1, dye = 'scarlet') {
  return cached(`maple:${style}:${seed}:${dye}`, () => {
    let t;
    if (style === 'tier') {
      const v = VEG_BUILD.tree('momiji', seed);
      const f = dyeFn(dye);
      t = { bark: v.trunkGeo, foliage: recolor(v.foliage, f), 'cards:momiji': recolor(v.cardGeo, f) };
    } else t = style === 'dome' ? domeMaple(seed, dye) : weepMaple(seed, dye);
    for (const k in t) t[k].computeBoundingSphere();
    return t;
  });
}
export function ginkgo(seed = 1) {
  return cached('ginkgo:' + seed, () => {
    const v = VEG_BUILD.tree('ginkgo', seed), f = o => o.offsetHSL(0.005, 0.05, 0.03);
    const t = { bark: v.trunkGeo, foliage: recolor(v.foliage, f), 'cards:ginkgo': recolor(v.cardGeo, f) };
    for (const k in t) t[k].computeBoundingSphere();
    return t;
  });
}

// ------------------------------------------------------------------ persimmon
export function persimmon(seed = 0) {
  return cached('kaki:' + seed, () => {
    const r = mulberry32(seed * 977 + 41), trunk = [], masses = [], fruit = [], C = new CardSet();
    const lean = V((r() - 0.5) * 0.7, 1.5, (r() - 0.5) * 0.7);
    trunk.push(branch(V(0, -0.2, 0), lean, 0.26, 0.18, V((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4), 6, 8));
    roots(trunk, r, 0.45, 4, 0.25, 0.8);
    const M = [], nb = 4;
    for (let i = 0; i < nb; i++) { // crooked, zig-zag limbs (kaki wood is famously twisty)
      const a = i / nb * TAU + r() * 0.7, d = dirAt(a), mid = lean.clone().addScaledVector(d, 0.6).add(V(0, 0.6 + r() * 0.3, 0)).addScaledVector(V(-d.z, 0, d.x), (r() - 0.5) * 0.4);
      const end = mid.clone().addScaledVector(d, 0.7 + r() * 0.3).add(V(0, 0.55 + r() * 0.4, 0));
      trunk.push(branch(lean, mid, 0.14, 0.09, V(0, 0.08, 0), 4, 6), branch(mid, end, 0.09, 0.04, V(0, 0.12, 0), 4, 5));
      M.push({ c: end.clone().add(V(0, 0.15, 0)), r: 0.82 + r() * 0.18, d, mid });
    }
    M.push({ c: V(lean.x, 3.7, lean.z), r: 0.95 });
    const crown = V(lean.x, 3.1, lean.z);
    const leafC = cols('#c47a32', '#d8923a', '#a8682c', '#b89a3a', '#8a8a38', '#e0a040');
    const geos = M.map((m, i) => mass(m.c, m.r * 0.72, { detail: 2, sy: 0.75, lumps: 0.45, rough: 0.08, seed: seed * 31 + i, crown, crownMix: 0.5, belly: 0.35 }));
    geos.forEach((g, i) => masses.push(paintMass(g, cols('#3a2c18', '#50381c', '#684620', '#805428'), { y0: 2, y1: 4.4, hi: col('#a87434'), hiAmt: 0.15, under: 0.7, patch: 0.2, seed: i })));
    const orange = cols('#ff8a26', '#ff7a1e', '#ff9a32', '#f06a1a');
    M.forEach((m, mi) => {
      const kAt = geos[mi].userData.m.k;
      for (let k = 0; k < 14; k++) { // sparse, rusty leaf clusters: the tree is half bare, the fruit shows through
        const dir = V(r() - 0.5, -0.2 + r() * 1.3, r() - 0.5).normalize();
        const p = m.c.clone().add(V(dir.x, dir.y * 0.75, dir.z).multiplyScalar(m.r * 0.72 * kAt(dir.x, dir.y, dir.z) * (1 + r() * 0.2)));
        C.cluster(r, p, dir, 0.8 + r() * 0.3, k % 2 ? 'C1' : 'C2', pick(r, leafC), 0.6, UP);
      }
      const nf = 7 + Math.floor(r() * 4);
      for (let k = 0; k < nf; k++) { // kaki: squat glossy spheres with a four-leaf calyx, on the outside of the crown
        const dir = V(r() - 0.5, -0.5 + r() * 1.1, r() - 0.5).normalize();
        const p = m.c.clone().add(V(dir.x, dir.y * 0.75, dir.z).multiplyScalar(m.r * (0.78 + r() * 0.2)));
        const R = 0.085 + r() * 0.025, g = new THREE.SphereGeometry(R, 9, 6); g.scale(1, 0.82, 1); g.translate(p.x, p.y, p.z);
        const oc = pick(r, orange);
        paint(g, (pp, nn, o) => o.copy(oc).lerp(col('#ffd090'), clamp(nn.y * 0.8 - 0.3) * 0.5).multiplyScalar(0.9 + 0.12 * clamp(nn.y + 0.5)));
        fruit.push(g);
        const cx = new THREE.CylinderGeometry(R * 0.55, R * 0.45, 0.02, 4); cx.translate(p.x, p.y + R * 0.8, p.z);
        paint(cx, (pp, nn, o) => o.set('#6a5a2a')); fruit.push(cx);
        trunk.push(tube([{ p: p.clone().add(V(0, R * 0.8, 0)), r: 0.008 }, { p: p.clone().lerp(m.mid || crown, 0.18).add(V(0, R + 0.1, 0)), r: 0.012 }], 3, false));
      }
    });
    const t = { bark: barkPaint(merge(trunk), '#3e3230', '#6a564c'), foliage: merge(masses), 'cards:round': C.geo(), 'd:body': merge(fruit) };
    for (const k in t) t[k].computeBoundingSphere();
    return t;
  });
}

// ------------------------------------------------------------------ chestnut
export function chestnut(seed = 0) {
  return cached('kuri:' + seed, () => {
    const r = mulberry32(seed * 733 + 9), trunk = [], masses = [], C = new CardSet();
    const top = V((r() - 0.5) * 0.3, 1.9, (r() - 0.5) * 0.3);
    trunk.push(branch(V(0, -0.2, 0), top, 0.34, 0.24, V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), 6, 8));
    roots(trunk, r, 0.6, 5, 0.3, 1.1);
    const M = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r() * 0.6, d = dirAt(a), end = top.clone().addScaledVector(d, 1.3 + r() * 0.3).add(V(0, 1.0 + r() * 0.5, 0)); trunk.push(branch(top, end, 0.18, 0.07, V(0, 0.3, 0), 5, 6)); M.push({ c: end.clone().add(V(0, 0.3, 0)), r: 1.2 + r() * 0.2 }); }
    M.push({ c: V(top.x, 4.3, top.z), r: 1.45, detail: 3 });
    const crown = V(top.x, 3.5, top.z);
    const y0 = Math.min(...M.map(m => m.c.y - m.r)), y1 = Math.max(...M.map(m => m.c.y + m.r));
    const geos = M.map((m, i) => mass(m.c, m.r, { detail: m.detail || 3, sy: 0.78, lumps: 0.34, rough: 0.07, seed: seed * 41 + i, crown, crownMix: 0.6, belly: 0.32 }));
    geos.forEach((g, i) => masses.push(paintMass(cullBuried(g, g.userData.m, geos.map(q => q.userData.m)), cols('#3e4a1c', '#56621f', '#6e7626', '#86842c'), { y0, y1, hi: col('#e8d060'), hiAmt: 0.25, under: 0.72, patch: 0.18, seed: i })));
    const leafC = cols('#b8b440', '#c8c04a', '#d8c450', '#a0a83c', '#e0c858');
    M.forEach((m, mi) => {
      const kAt = geos[mi].userData.m.k, nc = Math.round(18 + m.r * 12);
      for (let k = 0; k < nc; k++) {
        const dir = V(r() - 0.5, -0.35 + r() * 1.55, r() - 0.5).normalize();
        const p = m.c.clone().add(V(dir.x * m.r, dir.y * m.r * 0.78, dir.z * m.r).multiplyScalar(kAt(dir.x, dir.y, dir.z) * (0.98 + r() * 0.16)));
        C.cluster(r, p, dir, 0.95 + r() * 0.4, k % 2 ? 'C1' : 'C2', pick(r, leafC), 0.6, dir.clone().lerp(p.clone().sub(crown).normalize(), 0.5).normalize());
      }
    });
    const t = { bark: barkPaint(merge(trunk), '#4a3a30', '#7a6452'), foliage: merge(masses), 'cards:round': C.geo() };
    for (const k in t) t[k].computeBoundingSphere();
    return t;
  });
}
export function burrs(seed = 0) {
  return cached('burrs:' + seed, () => {
    const r = mulberry32(seed * 19 + 3), parts = [];
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.7, x = Math.cos(a) * d, z = Math.sin(a) * d, R = 0.07 + r() * 0.03;
      const g = new THREE.IcosahedronGeometry(R, 1), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const v = V(p.getX(k), p.getY(k), p.getZ(k)).normalize(); const s = 1 + (k % 3 === 0 ? 0.55 : 0); p.setXYZ(k, v.x * R * s, v.y * R * s * 0.85, v.z * R * s); }
      g.computeVertexNormals(); g.translate(x, R * 0.7, z);
      const open = r() < 0.5;
      paint(g, (pp, nn, o) => o.set(open ? '#a8883a' : '#8a9a3a').multiplyScalar(0.8 + 0.3 * clamp(nn.y + 0.3)));
      parts.push(g);
      if (open) for (let k = 0; k < 2; k++) { const nut = new THREE.SphereGeometry(0.035, 7, 5); nut.scale(1, 0.8, 0.7); nut.translate(x + (k - 0.5) * 0.05, R * 0.9 + 0.02, z); paint(nut, (pp, nn, o) => o.set('#6a3a22').lerp(col('#c89a6a'), clamp(-nn.y))); parts.push(nut); }
    }
    return { 'd:body': merge(parts) };
  });
}

// ------------------------------------------------------------------ ground plants
export function susuki(seed = 0) {
  return cached('susuki:' + seed, () => {
    const g = clone(VEG_BUILD.susuki(seed));
    recolor(g, (o, p) => {
      const plume = o.r > 0.8 && o.g > 0.75; // the village plumes are cream: turn them silver-rose, stems straw
      if (plume) o.set('#f6eee4').lerp(col('#ffd8c8'), clamp(p.y - 1.2) * 0.4);
      else o.offsetHSL(-0.12, -0.18, 0.06).lerp(col('#c8a860'), 0.35);
    });
    return { susuki: g };
  });
}
export function higanbana(seed = 0) {
  return cached('higan:' + seed, () => {
    const r = mulberry32(seed * 57 + 11), parts = [], n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.22, base = V(Math.cos(a) * d, 0, Math.sin(a) * d), h = 0.42 + r() * 0.2;
      const top = base.clone().add(V((r() - 0.5) * 0.06, h, (r() - 0.5) * 0.06));
      parts.push(paint(tube([{ p: base, r: 0.011 }, { p: top, r: 0.009 }], 3, false), (p, nn, o) => o.set('#4a7a36')));
      const np = 6, red = col(pick(r, ['#e8222a', '#f0302c', '#d81e28']));
      for (let k = 0; k < np; k++) { // recurved strap petals
        const pa = k / np * TAU + r() * 0.3, dd = dirAt(pa);
        const p1 = top.clone().addScaledVector(dd, 0.06).add(V(0, 0.03, 0)), p2 = top.clone().addScaledVector(dd, 0.11).add(V(0, -0.02, 0));
        parts.push(paint(tube([{ p: top, r: 0.012 }, { p: p1, r: 0.016 }, { p: p2, r: 0.006 }], 3, true), (p, nn, o) => o.copy(red).multiplyScalar(0.85 + 0.2 * clamp(nn.y + 0.3))));
        // long stamens curving up and out
        const s1 = top.clone().addScaledVector(dd, 0.09).add(V(0, 0.07, 0)), s2 = top.clone().addScaledVector(dd, 0.16).add(V(0, 0.09, 0));
        parts.push(paint(tube([{ p: top, r: 0.003 }, { p: s1, r: 0.003 }, { p: s2, r: 0.002 }], 3, false), (p, nn, o) => o.set('#ff4a3a')));
      }
    }
    return { plant: merge(parts) };
  });
}
export function leafPile(seed = 0, { R = 0.9, h = 0.5, dye = 'mixed' } = {}) {
  return cached(`pile:${seed}:${R}:${h}:${dye}`, () => {
    const r = mulberry32(seed * 91 + 7), C = new CardSet();
    const pal = dye === 'ginkgo' ? cols('#ffd84a', '#f4c43a', '#ffe680') : cols('#e0483a', '#f06a36', '#ff9a40', '#ffc84a', '#d8383a', '#c86a30', '#ffb040');
    const body = puff(V(0, 0, 0), R, { detail: 3, noise: 0.22, squash: h / R, seed: seed + 3 });
    // soft patches of colour (not per-vertex speckle, which reads as faceted gems), darker in the folds
    paint(body, (p, n, o) => { const t = clamp(nz(p.x * 2.6 + seed, p.z * 2.6 - seed) * 0.5 + 0.5) * (pal.length - 1), i = Math.min(pal.length - 2, Math.floor(t)); o.copy(pal[i]).lerp(pal[i + 1], t - i).multiplyScalar(0.6 + 0.28 * clamp(n.y) + nz(p.x * 9, p.z * 9) * 0.06); });
    const n = Math.round(90 * R * R + 24);
    for (let i = 0; i < n; i++) { // a shell of leaf clusters over the heap, the top ones flat and sunny
      const a = r() * TAU, u = Math.sqrt(r()), p = V(Math.cos(a) * u * R * 1.02, h * Math.sqrt(Math.max(0, 1 - u * u)) * 0.95 + 0.02, Math.sin(a) * u * R * 1.02);
      const nn = V(p.x / R, (p.y + 0.1) / h, p.z / R).normalize();
      C.cluster(r, p, nn, 0.5 + r() * 0.32, r() < 0.5 ? 'C1' : 'C2', pick(r, pal), 0.6, UP);
    }
    const cards = C.geo(); cards.computeBoundingSphere(); body.computeBoundingSphere();
    return { 'd:body': body, 'cards:maple': cards };
  });
}
export function mushrooms(seed = 0, kind = 'shiitake') {
  return cached(`shroom:${kind}:${seed}`, () => {
    const r = mulberry32(seed * 29 + kind.length), parts = [];
    const n = kind === 'shimeji' ? 7 + Math.floor(r() * 5) : 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const s = kind === 'shimeji' ? 0.45 + r() * 0.3 : i === 0 ? 1.25 : 0.6 + r() * 0.45, a = r() * TAU, d = i ? (kind === 'shimeji' ? 0.03 + r() * 0.07 : 0.08 + r() * 0.1) : 0;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, hh = (kind === 'amanita' ? 0.16 : kind === 'shimeji' ? 0.13 : 0.1) * s, R = (kind === 'amanita' ? 0.1 : kind === 'shimeji' ? 0.04 : 0.1) * s;
      const tilt = (r() - 0.5) * 0.4;
      const st = new THREE.CylinderGeometry(0.022 * s, 0.03 * s, hh, 6, 1, true); st.translate(x, hh / 2, z); paint(st, (p, nn, o) => o.set('#f4ead6')); parts.push(st);
      const cap = new THREE.SphereGeometry(R, 9, 5, 0, TAU, 0, PI / 2); cap.scale(1, kind === 'shiitake' ? 0.5 : 0.7, 1); cap.rotateZ(tilt); cap.translate(x, hh - 0.004, z);
      const [c0, c1] = kind === 'amanita' ? ['#e03a2e', '#ff6a4a'] : kind === 'shimeji' ? ['#a88a6a', '#d8c0a0'] : ['#7a4a2a', '#a8704a'];
      paint(cap, (p, nn, o) => o.set(c0).lerp(col(c1), clamp(nn.y * 0.8)));
      parts.push(cap);
      const gill = new THREE.CircleGeometry(R * 0.96, 9); gill.rotateX(PI / 2); gill.rotateZ(tilt); gill.translate(x, hh - 0.003, z); paint(gill, (p, nn, o) => o.set('#f0dcc0')); parts.push(gill);
      if (kind !== 'shimeji') for (let k = 0; k < (kind === 'amanita' ? 6 : 4); k++) { // white warts / pale shiitake cracks
        const u = 0.25 + r() * 0.6, t = r() * TAU, sr = Math.sin(u * PI / 2), yk = kind === 'shiitake' ? 0.5 : 0.7;
        const dot = new THREE.CircleGeometry(R * (kind === 'amanita' ? 0.16 : 0.12), 5);
        dot.lookAt(V(Math.cos(t) * sr, Math.cos(u * PI / 2) * yk, Math.sin(t) * sr).normalize()); dot.translate(x + Math.cos(t) * sr * R * 1.01, hh + Math.cos(u * PI / 2) * R * yk * 1.02, z + Math.sin(t) * sr * R * 1.01);
        paint(dot, (p, nn, o) => o.set(kind === 'amanita' ? '#fffaf2' : '#e8d4b4')); parts.push(dot);
      }
    }
    return { 'd:body': merge(parts) };
  });
}
