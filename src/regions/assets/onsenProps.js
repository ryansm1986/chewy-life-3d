// Yukimi Onsen props (docs/REGIONS.md §2), built with the buildings kit (Builder) as kit pieces
// { body, glow, cloth, … , lights } and drawn through the Placer (bambooKit.js). Local space, ground at y = 0, front = +z.
//  yukimiLantern(seed, { s })   the snow-viewing lantern: three curved legs, a hexagonal firebox, a wide snow-capped kasa
//  snowTorii(seed, { w, h })    a vermilion torii with snow on the kasagi and drifts at the feet
//  inn(seed)                    the ruined ryokan: a two-storey timber front, glowing shoji, a noren doorway, chochin,
//                               a snow-heavy roof with one broken corner and icicles along the eaves
//  springRim(seed, R)           the rock ring of a hot spring (dark wet rocks inside, snowy outside) + a bamboo spout
//  bathhouse(seed)              the village's Hot Spring building (a changing hut, fence, towels), snowed on
//  frozenFall(seed, { W, H })   a frozen waterfall: bulging ice columns and icicle fringes (static)
//  bench(seed), oke(seed), fenceRun(seed, { L }), signpost(seed), stoneStep(seed)
import * as THREE from 'three';
import { G, C, PI, bar } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { foundation, walls, onFace, door, noren, shoji, engawa, fence } from '../../world/buildings/parts.js';
import { chochin, bench as kitBench } from '../../world/buildings/props.js';
import { bucket, firewood, choppingBlock } from '../../world/buildings/props2.js';
import { logPile } from '../../world/buildings/props.js';
import { getTemplate } from '../../world/buildings/index.js';
import { tube, puff, paint, merge } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { V, col, nz } from './bambooKit.js';
import { kit } from './bambooProps.js';
import { SNOW, SNOW_SH, SNOW_BLUE, snowOn } from './onsenFlora.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const STONE = ['#8e94a6', '#a0a6b8', '#7c8294'];
const snowPaint = (p, n, o) => o.copy(SNOW).lerp(SNOW_SH, clamp(0.4 - n.y) * 0.9).lerp(SNOW_BLUE, clamp(-n.y) * 0.5);
/** a soft snow pillow (flattened puff) at p, radius r, squash sq */
function pillow(B, p, r, sq = 0.4, seed = 0) { const g = puff(V(0, 0, 0), r, { detail: 1, noise: 0.22, squash: sq, seed }); g.translate(p[0], p[1], p[2]); B.add(g, snowPaint); }

// ------------------------------------------------------------------ yukimi-dōrō
export function yukimiLantern(seed = 0, { s = 1 } = {}) {
  return cached(`yukimi:${seed}:${s}`, () => kit(seed * 5 + 3, B => {
    B.push([0, 0, 0], 0, s);
    const stone = B.pick(STONE), dark = '#6a7084';
    for (let i = 0; i < 3; i++) { // three splayed, curved legs
      const a = i / 3 * TAU + 0.5, d = V(Math.cos(a), 0, Math.sin(a));
      B.add(tube([{ p: d.clone().multiplyScalar(0.5).add(V(0, 0, 0)), r: 0.07 }, { p: d.clone().multiplyScalar(0.42).add(V(0, 0.35, 0)), r: 0.06 }, { p: d.clone().multiplyScalar(0.2).add(V(0, 0.62, 0)), r: 0.055 }], 6, true), stone);
      pillow(B, [d.x * 0.5, 0.02, d.z * 0.5], 0.14, 0.45, seed + i);
    }
    const plate = G.cyl(0.36, 0.3, 0.1, 6); plate.translate(0, 0.66, 0); B.add(plate, stone);
    // hexagonal firebox with glowing paper windows on three sides
    const box = G.cyl(0.24, 0.24, 0.36, 6, true); box.translate(0, 0.9, 0); B.add(box, dark);
    for (let i = 0; i < 6; i += 2) { const a = i / 6 * TAU + PI / 6, w = G.box(0.2, 0.24, 0.02, 0); w.translate(0, 0.9, 0.205); w.applyMatrix4(new THREE.Matrix4().makeRotationY(-a + PI / 2)); B.glow(w, '#ffd890', { flicker: 0.6 }); }
    const core = G.cyl(0.19, 0.19, 0.3, 6); core.translate(0, 0.9, 0); B.glow(core, '#ffb860', { flicker: 0.6 });
    // the wide kasa (umbrella roof) with upturned warabi tips, piled with snow
    const kasa = G.lathe([[0.001, 0.26], [0.2, 0.24], [0.55, 0.1], [0.7, 0.02], [0.72, 0.0], [0.6, -0.02], [0.2, 0.04], [0.001, 0.04]], 6); kasa.translate(0, 1.1, 0); B.add(kasa, stone);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, t = G.sph(0.05, 6, 4); t.translate(Math.cos(a) * 0.7, 1.14, Math.sin(a) * 0.7); B.add(t, stone); }
    const cap = puff(V(0, 1.24, 0), 0.62, { detail: 2, noise: 0.16, squash: 0.36, seed: seed + 7 }); B.add(cap, snowPaint);
    const hoju = G.sph(0.09, 8, 6); hoju.scale(1, 1.2, 1); hoju.translate(0, 1.5, 0); B.add(hoju, stone);
    pillow(B, [0, 1.58, 0], 0.1, 0.6, seed + 9);
    B.light([0, 0.9, 0], { color: '#ffb868', intensity: 3.2, radius: 6.5, flicker: 0.5, nightOnly: false });
    B.pop();
  }, 0.015));
}

// ------------------------------------------------------------------ torii
export function snowTorii(seed = 0, { w = 2.8, h = 3.1 } = {}) {
  return cached(`storii:${seed}:${w}:${h}`, () => kit(seed * 7 + 1, B => {
    const red = '#d8402e', black = '#2a2228';
    for (const sx of [-1, 1]) {
      const p = G.cyl(0.13, 0.15, h, 12); p.translate(sx * w / 2, h / 2, 0); B.add(p, (pp, n, o) => o.set(pp.y < 0.35 ? black : red));
      pillow(B, [sx * w / 2, 0.05, 0.05], 0.36, 0.4, seed + sx);
    }
    const nuki = G.box(w + 0.5, 0.16, 0.14, 0.03); nuki.translate(0, h * 0.72, 0); B.add(nuki, red);
    const kasagi = G.box(w + 1.1, 0.2, 0.3, 0.04); kasagi.translate(0, h + 0.05, 0); B.add(kasagi, red);
    const shimaki = G.box(w + 1.2, 0.12, 0.34, 0.03); shimaki.translate(0, h + 0.2, 0); B.add(shimaki, black);
    for (const sx of [-1, 1]) { const tip = G.box(0.4, 0.12, 0.34, 0.03); tip.rotateZ(sx * 0.2); tip.translate(sx * (w / 2 + 0.72), h + 0.26, 0); B.add(tip, black); }
    const gaku = G.box(0.36, 0.44, 0.06, 0.02); gaku.translate(0, h * 0.86, 0.08); B.add(gaku, black);
    const snow = G.box(w + 1.0, 0.14, 0.3, 0.06); snow.translate(0, h + 0.33, 0); B.add(snow, snowPaint);
    for (let i = 0; i < 5; i++) pillow(B, [(i - 2) * (w + 0.8) / 5, h + 0.38, 0], 0.26, 0.35, seed + i * 3);
    const n2 = G.box(w + 0.3, 0.07, 0.12, 0.03); n2.translate(0, h * 0.72 + 0.12, 0); B.add(n2, snowPaint);
  }, 0.012));
}

// ------------------------------------------------------------------ the ryokan
export function inn(seed = 0) {
  return cached('inn:' + seed, () => kit(seed * 11 + 5, B => {
    const w = 5.6, d = 3.2, h1 = 1.7, h2 = 1.45, y0 = 0.3, wood = '#8a5a3e', plank = '#a8764e', white = '#f4ece0';
    foundation(B, { w, d, h: y0, stones: true, color: '#6e7486' });
    walls(B, { w, d, h: h1, y0, plaster: white, frame: '#4a3226' });
    // ground floor front: sliding shoji doors, lit, a noren doorway in the middle
    onFace(B, { w, d }, 'f', 0, y0, () => {
      door(B, { w: 1.1, h: 1.45, style: 'shoji' });
      noren(B, { w: 1.1, h: 0.6, y: 1.5, z: 0.18, color: '#2e4a8a', strips: 3, symColor: '#fff6ea' });
    });
    for (const u of [-1.8, 1.8]) onFace(B, { w, d }, 'f', u, y0 + 0.95, () => shoji(B, { w: 1.2, h: 0.8, frame: '#4a3226', trim: false }));
    engawa(B, { x0: -w / 2 + 0.1, x1: w / 2 - 0.1, z: d / 2, depth: 0.7, y: y0 + 0.02, wood: '#b08660' });
    // a small eave between the floors (hisashi), snowed on
    B.at([0, y0 + h1 + 0.05, 0], 0, () => {
      const hs = G.box(w + 0.6, 0.08, 0.9, 0.03); hs.rotateX(0.32); hs.translate(0, 0.02, d / 2 + 0.35); B.add(hs, '#4a5064');
      const sn = G.box(w + 0.4, 0.12, 0.78, 0.05); sn.rotateX(0.32); sn.translate(0, 0.1, d / 2 + 0.33); B.add(sn, snowPaint);
    });
    // upper floor, set back a little, plank walls with a row of lit shoji
    B.at([0, y0 + h1 + 0.1, -0.15], 0, () => {
      walls(B, { w: w - 0.4, d: d - 0.5, h: h2, y0: 0, planks: plank, frame: wood });
      for (const u of [-1.6, 0, 1.6]) onFace(B, { w: w - 0.4, d: d - 0.5 }, 'f', u, 0.75, () => shoji(B, { w: 1.1, h: 0.75, frame: '#4a3226', trim: false }));
      // a heavy irimoya roof under deep snow (the roof colour is the snow itself), one corner broken open
      const r = roof(B, { type: 'irimoya', w: w - 0.4, d: d - 0.5, y0: h2, over: 0.55, gOver: 0.35, H: 1.25, curve: 0.3, lift: 0.18, liftW: 0.4, thick: 0.16, ribW: 0, color: '#eef3fc', edge: '#4a5064', under: '#3a3440', cap: '#dfe8f8', moss: 0, gable: 'wood' });
      for (let i = 0; i < 7; i++) pillow(B, [(i - 3) * 0.75, r.ridgeY - 0.05, 0], 0.42, 0.35, seed + i);
      // broken corner: a dark hole with a couple of splintered rafters
      B.at([w / 2 - 1.0, h2 + 0.55, (d - 0.5) / 2 - 0.1], 0.2, () => {
        const hole = G.box(0.9, 0.06, 0.7, 0.02); hole.rotateX(0.55); B.add(hole, '#2a2230');
        for (let k = 0; k < 3; k++) { const rf = bar(V(-0.3 + k * 0.3, -0.1, 0.35), V(-0.2 + k * 0.32, 0.25, -0.3), 0.06, 0.01); B.add(rf, '#6a4a36'); }
      });
      // icicles along the eave
      for (let i = 0; i < 18; i++) { const x = -w / 2 - 0.1 + (i + 0.5) * (w + 0.2) / 18, L = 0.15 + ((i * 7) % 5) * 0.07; const g = G.cone(0.04, L, 5); g.rotateX(PI); g.translate(x, h2 - 0.05 - L / 2, (d - 0.5) / 2 + 0.52); B.add(g, (p, n, o) => o.set('#e6f4ff').lerp(col('#9ccfff'), 0.3)); }
    });
    // hanging chochin either side of the door, a sign board over it
    for (const sx of [-1, 1]) B.at([sx * 0.95, y0 + 1.72, d / 2 + 0.45], 0, () => chochin(B, { r: 0.16, h: 0.34, cord: 0.08, color: sx > 0 ? '#fff0d0' : '#e04a3a' }));
    const sign = G.box(1.3, 0.34, 0.06, 0.02); sign.translate(0, y0 + h1 - 0.08, d / 2 + 0.08); B.add(sign, '#5a3a28');
    const txt = G.box(1.1, 0.2, 0.02, 0); txt.translate(0, y0 + h1 - 0.08, d / 2 + 0.12); B.add(txt, '#e8d4a8');
    for (const sx of [-1, 1]) B.light([sx * 0.95, y0 + 1.5, d / 2 + 0.55], { color: '#ffb060', intensity: 3.6, radius: 7, flicker: 0.5, nightOnly: false });
    B.light([0, y0 + 1.0, d / 2 + 0.4], { color: '#ffd8a0', intensity: 2.4, radius: 6, flicker: 0.2, nightOnly: false });
    // snow banked against the walls and on the engawa ends
    for (let i = 0; i < 6; i++) pillow(B, [-w / 2 + 0.2 + i * (w - 0.4) / 5, 0.05, -d / 2 - 0.1], 0.45, 0.45, seed + 20 + i);
    for (const sx of [-1, 1]) pillow(B, [sx * (w / 2 + 0.1), 0.05, 0.4], 0.5, 0.5, seed + 30 + sx);
  }, 0.02));
}

// ------------------------------------------------------------------ hot spring rim
export function springRim(seed = 0, R = 2.2, { sx = 1, sz = 1, spout = true } = {}) {
  return cached(`srim:${seed}:${R}:${sx}:${sz}:${spout}`, () => kit(seed * 13 + 7, B => {
    const n = Math.round(R * 7.5);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + B.wob(0.08), r = B.rand(0.22, 0.36) * (R > 2.5 ? 1.2 : 1), x = Math.cos(a) * (R + 0.1) * sx, z = Math.sin(a) * (R + 0.1) * sz;
      const st = puff(V(0, 0, 0), r, { detail: 1, noise: 0.3, squash: 0.62, seed: seed * 31 + i }); st.translate(x, r * 0.25, z);
      // wet and dark on the water side, snow on the outer shoulder
      B.add(st, (p, nn, o) => { o.set(B.pick(STONE)).multiplyScalar(0.78); const out = (nn.x * x + nn.z * z) / Math.hypot(x, z); snowOn(o, V(0, nn.y + out * 0.35 - 0.1, 0), 1, 0.3, 0.7); });
    }
    if (spout) B.at([Math.cos(-0.7) * (R + 0.5) * sx, 0, Math.sin(-0.7) * (R + 0.5) * sz], 0.7 + PI, () => { // bamboo kakei pouring in
      const post = G.cyl(0.05, 0.06, 0.8, 6); post.translate(0, 0.4, 0); B.add(post, '#8fb86a');
      const pipe = G.cyl(0.04, 0.04, 0.7, 6); pipe.rotateX(PI / 2 - 0.15); pipe.translate(0, 0.74, 0.3); B.add(pipe, '#9ac874');
      B.add(tube([{ p: V(0, 0.7, 0.66), r: 0.03 }, { p: V(0, 0.55, 0.74), r: 0.028 }, { p: V(0, 0.1, 0.78), r: 0.03 }], 6, false), '#d0f4ff', 'water');
      pillow(B, [0, 0.82, 0], 0.08, 0.6, seed);
    });
  }, 0.01));
}
export function bathhouse(seed = 0) {
  return cached('bath:' + seed, () => {
    const tpl = getTemplate('onsen', 1, seed), out = { lights: tpl.lights.map(l => ({ ...l, pos: l.pos.clone(), nightOnly: false })) };
    for (const [k, g] of Object.entries(tpl.geos)) {
      if (k === 'jet' || k === 'hot') continue;
      const c = g.clone(), nn = c.attributes.normal, cc = c.attributes.color;
      if (cc && nn && k === 'body') { const o = new THREE.Color(); for (let i = 0; i < cc.count; i++) { if (nn.getY(i) < 0.6) continue; o.setRGB(cc.getX(i), cc.getY(i), cc.getZ(i)).lerp(SNOW, clamp((nn.getY(i) - 0.6) * 3) * 0.85); cc.setXYZ(i, o.r, o.g, o.b); } }
      out[k] = c;
    }
    return out;
  });
}

// ------------------------------------------------------------------ frozen waterfall
export function frozenFall(seed = 0, { W = 3, H = 3.6 } = {}) {
  return cached(`ffall:${seed}:${W}:${H}`, () => kit(seed * 17 + 3, B => {
    const r = mulberry32(seed * 41 + 3), ice = (p, n, o) => o.set('#cfeaff').lerp(col('#f4fbff'), clamp(n.y * 0.6 + 0.4)).lerp(col('#7ab4f0'), clamp(-n.z) * 0.4 + clamp(0.3 - p.y / H) * 0.25);
    // a dark rock face behind the ice (so the frozen fall reads against the snow), snow on its shoulders
    for (let i = 0; i < 5; i++) {
      const u = (i - 2) / 2, rk = puff(V(u * W * 0.62, H * (0.5 - Math.abs(u) * 0.16), -0.35 - Math.abs(u) * 0.3), H * (0.42 - Math.abs(u) * 0.08), { detail: 2, noise: 0.28, squash: 1.1, seed: seed * 9 + i });
      rk.scale(1.15, 1, 0.55); B.add(rk, (p, n, o) => { o.set('#5a6078').lerp(col('#7a809a'), clamp(n.y * 0.5 + 0.4 + nz(p.x * 2.2, p.y * 2.2) * 0.3)); snowOn(o, V(0, n.y + nz(p.x * 3, p.z * 3) * 0.2, 0), 1, 0.45, 0.75); });
    }
    const cols = Math.round(W / 0.38);
    for (let i = 0; i < cols; i++) { // bulging ice columns hanging from the lip, frozen mid-fall
      const x = -W / 2 + (i + 0.5) * W / cols + (r() - 0.5) * 0.1, len = H * (0.55 + r() * 0.45), rad = 0.17 + r() * 0.08;
      const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(x + Math.sin(t * 5 + i) * 0.04, H - t * len, 0.2 + Math.sin(t * PI) * 0.18 + r() * 0.04), r: rad * (1 - t * 0.55) * (0.85 + Math.sin(t * 9 + i * 2) * 0.15) }); }
      B.add(tube(pts, 7, true), ice);
    }
    // the frozen boil at the foot: a lumpy apron of ice
    const ap = puff(V(0, 0, 0.6), W * 0.55, { detail: 2, noise: 0.25, squash: 0.28, seed: seed + 5 }); ap.scale(1, 1, 0.6); B.add(ap, ice);
    // icicle fringe along the lip and snow on top
    for (let i = 0; i < 14; i++) { const x = -W / 2 - 0.3 + (i + 0.5) * (W + 0.6) / 14, L = 0.25 + r() * 0.35, g = G.cone(0.05, L, 5); g.rotateX(PI); g.translate(x, H + 0.05 - L / 2, 0.42); B.add(g, ice); }
    const lip = G.box(W + 0.8, 0.22, 0.6, 0.08); lip.translate(0, H + 0.12, 0.15); B.add(lip, snowPaint);
    for (let i = 0; i < 4; i++) pillow(B, [(i - 1.5) * W / 3.5, H + 0.25, 0.1], 0.4, 0.4, seed + i);
  }, 0.008));
}

// ------------------------------------------------------------------ small things
export function bench(seed = 0) {
  return cached('sbench:' + seed, () => kit(seed + 2, B => { kitBench(B, { w: 1.3, wood: '#a8784e', legs: '#5a3e30' }); for (let i = 0; i < 3; i++) pillow(B, [(i - 1) * 0.4, 0.5, 0], 0.2, 0.3, seed + i); }, 0.01));
}
export function oke(seed = 0) {
  return cached('oke:' + seed, () => kit(seed + 4, B => { bucket(B, { r: 0.13, h: 0.18, water: true }); B.at([0.26, 0, 0.1], 0.5, () => { bucket(B, { r: 0.11, h: 0.16 }); B.at([0, 0.16, 0], 0.2, () => bucket(B, { r: 0.1, h: 0.14 })); }); }, 0.01));
}
export function fenceRun(seed = 0, { L = 3 } = {}) {
  return cached(`sfence:${seed}:${L}`, () => kit(seed + 6, B => {
    fence(B, [-L / 2, 0], [L / 2, 0], { style: 'bamboo', h: 1.1 });
    const s = G.box(L, 0.08, 0.14, 0.03); s.translate(0, 1.16, 0); B.add(s, snowPaint);
    for (let i = 0; i < Math.round(L); i++) pillow(B, [-L / 2 + (i + 0.5) * L / Math.round(L), 0.04, 0.12], 0.3, 0.45, seed + i);
  }, 0.01));
}
export function signpost(seed = 0) {
  return cached('ssign:' + seed, () => kit(seed + 8, B => {
    const p = G.cyl(0.06, 0.07, 1.5, 7); p.translate(0, 0.75, 0); B.add(p, '#6a4a36');
    for (const [y, a] of [[1.25, 0.3], [1.0, -0.4]]) B.at([0, y, 0], a, () => { const b = G.box(0.7, 0.18, 0.05, 0.02); b.translate(0.3, 0, 0); B.add(b, '#b08660'); const s = G.box(0.68, 0.05, 0.08, 0.02); s.translate(0.3, 0.11, 0); B.add(s, snowPaint); });
    pillow(B, [0, 1.52, 0], 0.1, 0.6, seed);
  }, 0.01));
}
export function stoneStep(seed = 0, { R = 0.36 } = {}) {
  return cached(`sstep:${seed}:${R}`, () => kit(seed + 10, B => {
    const g = puff(V(0, 0, 0), R, { detail: 1, noise: 0.18, squash: 0.25, seed }); g.translate(0, 0.02, 0); B.add(g, (p, n, o) => { o.set(B.pick(STONE)); snowOn(o, V(0, n.y - 0.2 + nz(p.x * 6, p.z * 6) * 0.3, 0), 0.7, 0.4, 0.8); });
  }, 0.005));
}
/** a woodcutter's rest at a camp's edge: a roofed firewood stack, a chopping block, a log pile, all snowed on */
export function campRest(seed = 0) {
  return cached('crest:' + seed, () => kit(seed + 12, B => {
    B.at([0, 0, 0], 0, () => firewood(B, { w: 1.1, h: 0.62, d: 0.34, roofed: true }));
    for (let i = 0; i < 3; i++) pillow(B, [(i - 1) * 0.38, 0.86, 0], 0.22, 0.3, seed + i);
    B.at([1.05, 0, 0.45], 0.6, () => choppingBlock(B));
    pillow(B, [1.05, 0.42, 0.45], 0.14, 0.4, seed + 5);
    B.at([-1.1, 0, 0.5], -0.4, () => logPile(B, { n: 3, L: 1.0, r: 0.12 }));
    pillow(B, [-1.1, 0.32, 0.5], 0.3, 0.3, seed + 7);
    for (let i = 0; i < 3; i++) pillow(B, [(i - 1) * 0.9, 0.02, -0.35], 0.4, 0.35, seed + 9 + i);
  }, 0.01));
}
export const _unused = { merge, paint, C, SNOW_BLUE };
