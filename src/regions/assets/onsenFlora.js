// Yukimi Onsen flora (docs/REGIONS.md §2): snow-laden winter trees and ground cover, cached per (kind, seed), local
// space with the ground at y = 0, drawn through the Placer's batches (bambooKit.js).
//  snowFir(seed, { H })     a cute tiered conifer: stacked lumpy skirts, deep blue-green under, fat snow pillows on top
//  snowPine(seed)           the village's cloud-pruned niwaki pine with a snow cushion on every pad
//  birch(seed, { H })       a bare white birch: ink-dashed bark, fine upswept twigs, snow lines along the limbs
//  snowBush(seed, flowers)  a round shrub under a snow blanket; flowers = 'camellia' dots the sides with red blooms
//  snowRock(seed, { R })    a grey-blue boulder with a snow cap (wet and bare when `wet`)
//  drift(seed, { R })       a soft snowdrift mound
//  frostGrass(seed)         a tuft of pale frosted grass blades poking out of the snow
//  icicles(seed, { L, n })  a row of hanging icicles along local x (for eaves, cave lips, the frozen fall)
import * as THREE from 'three';
import { VEG_BUILD } from '../../world/vegetation.js';
import { tube, puff, merge, paint, branch, cards } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { mass, recolor, V, col, cols, PI, pick, dirAt, nz } from './bambooKit.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const bound = t => { for (const k in t) t[k]?.computeBoundingSphere?.(); return t; };

export const SNOW = col('#f6f9ff'), SNOW_SH = col('#c4d2ee'), SNOW_BLUE = col('#a8bce6');
/** blend a painted colour toward snow by how much the surface faces up (n.y) */
export function snowOn(o, n, amt = 1, from = 0.28, to = 0.62) {
  const k = clamp((n.y - from) / (to - from)) * amt;
  if (k <= 0) return o;
  return o.lerp(SNOW_SH, Math.min(1, k * 1.6) * 0.6).lerp(SNOW, k);
}
function barkPaint(g, c0, c1) {
  const a = col(c0), b = col(c1);
  return paint(g, (p, n, o) => o.copy(a).lerp(b, clamp(n.y * 0.3 + 0.5 + nz(p.x * 3.1 + p.y * 1.3, p.z * 3.1 - p.y * 2.2) * 0.22)));
}

// ------------------------------------------------------------------ snow fir (sugi / momi)
const FIR_GREEN = cols('#123a3a', '#1c4c46', '#2a5e52', '#3a7060');
export function snowFir(seed = 0, { H = 5.2, snow = 1 } = {}) {
  return cached(`fir:${seed}:${H}:${snow}`, () => {
    const r = mulberry32(seed * 811 + 5), trunk = [], skirts = [], needles = [];
    trunk.push(branch(V(0, -0.2, 0), V((r() - 0.5) * 0.1, H * 0.92, (r() - 0.5) * 0.1), 0.2, 0.05, V(0, 0, 0), 5, 7));
    const tiers = 5 + (r() < 0.4 ? 1 : 0), base = 0.75, crown = V(0, H * 0.55, 0);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1), y = base + t * (H - base - 0.55), R = (1.55 - t * 1.15) * (0.92 + r() * 0.16);
      const c = V((r() - 0.5) * 0.12, y, (r() - 0.5) * 0.12);
      const g = mass(c, R, { detail: 2, sy: 0.6 + t * 0.12, lumps: 0.38, rough: 0.09, seed: seed * 13 + i, crown, crownMix: 0.25, belly: 0.5 });
      const dark = FIR_GREEN[0], mid = FIR_GREEN[1 + (i % 2)], lit = FIR_GREEN[3];
      skirts.push(paint(g, (p, n, o) => {
        o.copy(dark).lerp(mid, clamp(n.y + 0.6)).lerp(lit, clamp(n.y - 0.1) * 0.5);
        // a fat snow pillow over the top of each tier, a drooping lip at the rim
        const cap = n.y + nz(p.x * 2.4 + i, p.z * 2.4 - i) * 0.25 + (p.y - c.y) * 0.4;
        snowOn(o, V(0, cap, 0), snow, 0.32, 0.64);
      }));
      // needle cards round the rim for texture (sparse: the masses carry the shape)
      const cg = cards(c.clone().add(V(0, -0.08, 0)), R * 0.95, Math.round(16 + R * 12), { size: 0.66 + R * 0.14, crown, seed: seed * 7 + i, squash: 0.45, upBias: -0.2 });
      paint(cg, (p, n, o) => o.copy(pick(r, FIR_GREEN.slice(1))).multiplyScalar(1.15).lerp(SNOW, clamp(n.y - 0.55) * 0.8 * snow));
      needles.push(cg);
    }
    // a snow tuft on the tip
    const tip = puff(V(0, H - 0.2, 0), 0.26, { detail: 1, noise: 0.2, squash: 0.9, seed: seed + 3 });
    skirts.push(paint(tip, (p, n, o) => o.copy(SNOW).lerp(SNOW_BLUE, clamp(-n.y) * 0.5)));
    return bound({ bark: barkPaint(merge(trunk), '#3a2a26', '#6a4e40'), foliage: merge(skirts), 'cards:pine': merge(needles) });
  });
}

// ------------------------------------------------------------------ snowy niwaki pine (the village pine, snowed on)
export function snowPine(seed = 1) {
  return cached('spine:' + seed, () => {
    // (non-indexed copies: the batches mix these with merged, non-indexed firs)
    const v = VEG_BUILD.tree('pine', seed), flat = g => (g.index ? g.toNonIndexed() : g.clone()), f = flat(v.foliage), c = flat(v.cardGeo);
    const nf = f.attributes.normal;
    recolor(f, (o, p, i) => { o.offsetHSL(0.03, -0.12, -0.04); snowOn(o, V(0, nf.getY(i) + nz(p.x * 3, p.z * 3) * 0.2, 0), 1, 0.22, 0.55); });
    const nc = c.attributes.normal;
    recolor(c, (o, p, i) => { o.offsetHSL(0.03, -0.1, -0.02); o.lerp(SNOW, clamp(nc.getY(i) - 0.35) * 0.55); });
    return bound({ bark: flat(v.trunkGeo), foliage: f, 'cards:pine': c });
  });
}

// ------------------------------------------------------------------ birch
export function birch(seed = 0, { H = 4.6 } = {}) {
  return cached(`birch:${seed}:${H}`, () => {
    const r = mulberry32(seed * 419 + 77), wood = [], snowy = [];
    const lean = V((r() - 0.5) * 0.5, H, (r() - 0.5) * 0.5);
    wood.push(branch(V(0, -0.15, 0), lean, 0.13, 0.04, V((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2), 7, 7));
    const limb = (a, b, r0, r1, depth) => {
      wood.push(branch(a, b, r0, r1, V(0, 0.08, 0), 4, 5));
      // a thin snow line along the top of the thicker limbs
      if (r0 > 0.03) { const s = branch(a.clone().add(V(0, r0 * 0.9, 0)), b.clone().add(V(0, r1 * 0.9, 0)), r0 * 0.55, r1 * 0.4, V(0, 0.08, 0), 4, 4); s.scale(1, 0.6, 1); snowy.push(s); }
      if (depth <= 0) return;
      const d = b.clone().sub(a), L = d.length(); d.normalize();
      for (let k = 0; k < 2 + (r() < 0.5 ? 1 : 0); k++) {
        const t = 0.45 + r() * 0.5, o = a.clone().lerp(b, t), side = V(r() - 0.5, 0, r() - 0.5).normalize();
        const e = o.clone().addScaledVector(d, L * (0.35 + r() * 0.2)).addScaledVector(side, L * 0.3).add(V(0, L * 0.18, 0));
        limb(o, e, r1 * 1.1, r1 * 0.45, depth - 1);
      }
    };
    for (let i = 0; i < 5; i++) {
      const t = 0.35 + i * 0.13, o = V(0, 0, 0).lerp(lean, t), a = i * 2.4 + r() * 0.6, d = dirAt(a);
      const e = o.clone().addScaledVector(d, 0.9 + r() * 0.6).add(V(0, 0.9 + r() * 0.6, 0));
      limb(o, e, 0.06 - i * 0.006, 0.022, 2);
    }
    const g = paint(merge(wood), (p, n, o) => {
      // chalk-white bark with black lenticel dashes, darker at the foot
      const dash = Math.sin(p.y * 17 + nz(p.x * 9, p.z * 9) * 4) > 0.82 && Math.abs(nz(p.y * 3 + p.x * 12, p.z * 12)) > 0.25;
      o.set(dash ? '#2a2a32' : '#f2eee8').multiplyScalar(0.84 + 0.16 * clamp(n.y + 0.6));
      if (p.y < 0.35) o.lerp(col('#4a3e3a'), clamp(1 - p.y / 0.35) * 0.7);
    });
    const s = paint(merge(snowy), (p, n, o) => o.copy(SNOW).lerp(SNOW_BLUE, clamp(-n.y) * 0.6));
    return bound({ bark: g, 'd:body': s });
  });
}

// ------------------------------------------------------------------ bushes, camellias
export function snowBush(seed = 0, flowers = 'camellia') {
  return cached(`sbush:${seed}:${flowers}`, () => {
    const r = mulberry32(seed * 97 + 3), parts = [], bloom = [], n = 3 + Math.floor(r() * 2), crown = V(0, 0.4, 0);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r(), c = V(Math.cos(a) * 0.32, 0.36 + r() * 0.12, Math.sin(a) * 0.32);
      const g = mass(c, 0.42 + r() * 0.12, { detail: 2, sy: 0.8, lumps: 0.35, seed: seed * 11 + i, crown, crownMix: 0.5, belly: 0.4 });
      parts.push(paint(g, (p, nn, o) => { o.set('#1e4a36').lerp(col('#3a7048'), clamp(nn.y + 0.4)); snowOn(o, V(0, nn.y + nz(p.x * 4 + i, p.z * 4) * 0.3, 0), 1, 0.25, 0.6); }));
      if (flowers === 'camellia') for (let k = 0; k < 6; k++) { // red tsubaki blooms on the shaded sides (the tops are snowed over)
        const dir = V(r() - 0.5, -0.1 + r() * 0.45, r() - 0.5).normalize(), p = c.clone().addScaledVector(dir, 0.44 + r() * 0.08);
        const b = new THREE.SphereGeometry(0.07, 7, 5); b.scale(1, 0.7, 1); b.lookAt(dir); b.translate(p.x, p.y, p.z);
        paint(b, (pp, nn, o) => o.set(k % 3 ? '#d8283a' : '#f04a5a').lerp(col('#ffe070'), clamp(nn.dot(dir) - 0.8) * 3));
        bloom.push(b);
      }
    }
    const t = { bushFoliage: merge(parts) };
    if (bloom.length) t['d:body'] = merge(bloom);
    // a few fallen petals on the snow
    if (flowers === 'camellia') { const pet = []; for (let k = 0; k < 5; k++) { const a = r() * TAU, d = 0.6 + r() * 0.35, g = new THREE.CircleGeometry(0.05, 6); g.rotateX(-PI / 2); g.translate(Math.cos(a) * d, 0.03, Math.sin(a) * d); paint(g, (p, nn, o) => o.set('#d8283a')); pet.push(g); } t['d:flat'] = merge(pet); }
    return bound(t);
  });
}

// ------------------------------------------------------------------ rocks, drifts
export function snowRock(seed = 0, { R = 0.7, sq = 0.66, wet = false } = {}) {
  return cached(`srock:${seed}:${R}:${sq}:${wet}`, () => {
    const g = puff(V(0, R * sq * 0.35, 0), R, { detail: 2, noise: 0.3, squash: sq, seed: seed * 5 + 1 });
    const base = wet ? cols('#4a4e5a', '#5e6270') : cols('#7a8298', '#98a0b4');
    paint(g, (p, n, o) => { o.copy(base[0]).lerp(base[1], clamp(n.y * 0.5 + 0.5 + nz(p.x * 2, p.z * 2) * 0.3)); if (!wet) snowOn(o, V(0, n.y + nz(p.x * 3.3, p.z * 3.3) * 0.25, 0), 1, 0.35, 0.65); else if (n.y > 0.55) o.lerp(col('#5a7a52'), 0.35); });
    return bound({ 'd:body': g });
  });
}
export function drift(seed = 0, { R = 1.2, h = 0.4 } = {}) {
  return cached(`drift:${seed}:${R}:${h}`, () => {
    const g = puff(V(0, 0, 0), R, { detail: 2, noise: 0.22, squash: h / R, seed: seed * 3 + 2 });
    paint(g, (p, n, o) => o.copy(SNOW).lerp(SNOW_SH, clamp(0.5 - n.y) * 0.8).lerp(SNOW_BLUE, clamp(-n.y) * 0.4));
    return bound({ 'd:body': g });
  });
}
export function frostGrass(seed = 0) {
  return cached('fgrass:' + seed, () => {
    const r = mulberry32(seed * 37 + 9), parts = [];
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = r() * 0.12, b = V(Math.cos(a) * d, 0, Math.sin(a) * d), h = 0.22 + r() * 0.22, lean = V(Math.cos(a) * h * 0.35, h, Math.sin(a) * h * 0.35);
      parts.push(paint(tube([{ p: b, r: 0.014 }, { p: b.clone().addScaledVector(lean, 0.55), r: 0.01 }, { p: b.clone().add(lean), r: 0.002 }], 3, false), (p, n, o) => o.set('#8a9a7a').lerp(col('#eef4ff'), clamp(p.y / 0.35))));
    }
    return bound({ 'd:grass': merge(parts) });
  });
}
export function icicles(seed = 0, { L = 2, n = 8, len = 0.5 } = {}) {
  return cached(`ice:${seed}:${L}:${n}:${len}`, () => {
    const r = mulberry32(seed * 53 + 1), parts = [];
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n + (r() - 0.5) * L / n * 0.5, h = len * (0.4 + r() * 0.8), w = 0.035 + h * 0.06;
      const g = new THREE.ConeGeometry(w, h, 6, 1, true); g.rotateX(PI); g.translate(x, -h / 2, (r() - 0.5) * 0.06);
      parts.push(paint(g, (p, nn, o) => o.set('#dff2ff').lerp(col('#8ec8ff'), clamp(-p.y / h) * 0.6)));
    }
    return bound({ 'd:body': merge(parts) });
  });
}
export const _unused = { pick };
