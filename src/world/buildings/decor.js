// Decor: bench, flower bed, fountain, sakura planter, mini torii, koi statue, lantern string, fence,
// arched vermilion bridge (+ bridgeDeckHeight), golden bone statue.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col } from './kit.js';
import { STONES, FLOWERS, fence as fenceRun } from './parts.js';
import { chochin, toro, pot, bush, tree, flowerPatch, bench as benchProp, torii, rock } from './props.js';
import { symbol } from './symbols.js';
import { clamp, TAU } from '../../core/util.js';

export const BRIDGE = { half: 4.5, end: 0.9, peak: 1.42 };
// Walkable deck height (top surface, local space) of the arched bridge at local z (bridge spans z ∈ [-4.5, 4.5]).
export function bridgeDeckHeight(z) {
  const u = Math.min(1, Math.abs(z) / BRIDGE.half);
  return BRIDGE.end + (BRIDGE.peak - BRIDGE.end) * (1 - u * u);
}

export function bench(B) {
  B.at([0, 0, -0.05], 0, () => benchProp(B, { w: 0.95 }));
  B.at([0.4, 0, 0.32], 0, () => pot(B, { r: 0.1, h: 0.14, plant: 'flowers', flowers: [B.pick(FLOWERS)] }));
  B.door.set(0, 0, 0.45);
  B.height = 1.0;
}

export function flowerBed(B) {
  const v = B.variant;
  const stone = v % 2 === 0;
  const pal = [['#ff8fb0', '#ffffff', '#ffd24a'], ['#c8a8ff', '#8fc8ff', '#ffffff'], ['#ff6f7f', '#ffb86a', '#ffd24a'], ['#ffbcd6', '#ff8fb0', '#fff0f6']][v % 4];
  if (stone) {
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; const st = puff(V(0, 0, 0), 0.11, { detail: 1, noise: 0.25, squash: 0.7, seed: i + v * 20 }); st.translate(Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4); B.add(st, B.pick(STONES)); }
  } else {
    for (const [x, z, w, d] of [[0, 0.4, 0.9, 0.08], [0, -0.4, 0.9, 0.08], [0.4, 0, 0.08, 0.72], [-0.4, 0, 0.08, 0.72]]) { const b = G.box(w, 0.16, d, 0.02); b.translate(x, 0.08, z); B.add(b, C.woodLight); }
  }
  const soil = G.cyl(0.38, 0.4, 0.1, 14); if (!stone) soil.scale(1.02, 1, 1.02); soil.translate(0, 0.07, 0); B.add(soil, '#8a6048');
  B.at([0, 0.08, 0], 0, () => flowerPatch(B, { w: 0.7, d: 0.7, n: 16, colors: pal }));
  B.door.set(0, 0, 0.55);
  B.height = 0.6;
}

export function fountain(B) {
  // outer basin
  const basin = G.lathe([[0.001, 0], [0.9, 0], [0.95, 0.06], [0.95, 0.34], [0.84, 0.38], [0.78, 0.38], [0.78, 0.12], [0.001, 0.12]], 24);
  B.add(basin, (p, n, o) => { o.set(STONES[0]).lerp(col(STONES[2]), clamp(-n.y + 0.3)); if (n.y > 0.8 && Math.hypot(p.x, p.z) > 0.8) o.set('#e8e0dc'); });
  const water = G.disc(0.8, 24); water.rotateX(-PI / 2); water.translate(0, 0.3, 0); B.add(water, '#6ac4e4', 'water');
  // pedestal + upper bowl
  const ped = G.lathe([[0.001, 0.28], [0.16, 0.28], [0.12, 0.5], [0.09, 0.8], [0.14, 0.9], [0.001, 0.9]], 12); B.add(ped, STONES[1]);
  const bowl = G.lathe([[0.001, 0.86], [0.12, 0.86], [0.38, 0.98], [0.42, 1.06], [0.36, 1.06], [0.001, 0.96]], 18); B.add(bowl, STONES[0]);
  const w2 = G.disc(0.36, 18); w2.rotateX(-PI / 2); w2.translate(0, 1.03, 0); B.add(w2, '#6ac4e4', 'water');
  // top sakura finial
  const tip = G.lathe([[0.001, 1.02], [0.07, 1.02], [0.05, 1.18], [0.001, 1.22]], 8); B.add(tip, STONES[2]);
  B.at([0, 1.24, 0], 0, () => symbol(B, 'sakura', 0.2, { depth: 0.04 }), 1, -PI / 2);
  // falling water arcs from the upper bowl + central jet (scrolling jet material)
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; const r = 0.4 + t * 0.28, y = 1.04 + 0.04 * Math.sin(t * PI) - t * t * 0.74; pts.push({ p: V(Math.cos(a) * r, y, Math.sin(a) * r), r: 0.03 + t * 0.015 }); }
    B.add(tube(pts, 5, false), '#c8f0ff', 'jet');
  }
  const jp = []; for (let i = 0; i <= 4; i++) { const t = i / 4; jp.push({ p: V(0, 1.2 + t * 0.34, 0), r: 0.035 * (1 - t * 0.6) }); }
  B.add(tube(jp, 6, false), '#e0f8ff', 'jet');
  B.anim({ p: [0, 1.56, 0], kind: 'pulse', speed: 5, amp: 0.25 }, () => { const cap = G.sph(0.07, 8, 6); B.add(cap, '#e8faff', 'jet'); });
  B.anim({ p: [0, 0.31, 0], kind: 'spin', axis: [0, 1, 0], speed: 0.4 }, () => {
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const ring = G.torus(0.08, 0.012, 3, 10); ring.rotateX(PI / 2); ring.translate(Math.cos(a) * 0.68, 0, Math.sin(a) * 0.68); B.add(ring, '#e8faff', 'jet'); }
  });
  // koi in the basin + lily pads + flower pots
  for (let i = 0; i < 3; i++) { const k = G.sph(0.05, 6, 4); k.scale(2.2, 0.5, 1); k.rotateY(i * 2.1); k.translate(Math.cos(i * 2.1 + 1) * 0.55, 0.28, Math.sin(i * 2.1 + 1) * 0.55); B.add(k, ['#ff8a3a', '#fff6ea', '#ff6a4a'][i]); }
  for (let i = 0; i < 2; i++) { const lp = G.cyl(0.09, 0.09, 0.01, 10); lp.translate(Math.cos(i * 3 + 0.5) * 0.6, 0.31, Math.sin(i * 3 + 0.5) * 0.6); B.add(lp, '#6ab84c'); }
  for (const [x, z] of [[-0.85, 0.85], [0.85, -0.85]]) B.at([x, 0, z], 0, () => pot(B, { r: 0.12, plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
  B.door.set(0, 0, 1.1);
  B.height = 1.9;
}

export function sakuraPlanter(B) {
  const box = G.box(0.78, 0.36, 0.78, 0.06); box.translate(0, 0.18, 0); B.add(box, (p, n, o) => { o.set(STONES[0]); if (n.y > 0.7) o.set('#e8e0dc'); });
  const band = G.box(0.82, 0.06, 0.82, 0.02); band.translate(0, 0.3, 0); B.add(band, STONES[2]);
  const soil = G.box(0.66, 0.04, 0.66, 0); soil.translate(0, 0.35, 0); B.add(soil, '#8a6048');
  B.at([0, 0.34, 0], 0, () => tree(B, { kind: 'sakura', s: 0.58 }));
  for (let i = 0; i < 8; i++) { const pet = G.disc(0.03, 5); pet.rotateX(-PI / 2); pet.translate(B.rand(-0.5, 0.5), 0.01 + (i % 2) * 0.35, B.rand(-0.5, 0.5)); B.add(pet, '#ffc4dc'); }
  B.door.set(0, 0, 0.55);
  B.height = 2.0;
}

export function miniTorii(B) {
  const base = G.box(0.9, 0.06, 0.7, 0.03); base.translate(0, 0.03, 0); B.add(base, STONES[1]);
  B.at([0, 0.06, 0.05], 0, () => torii(B, { w: 0.62, h: 0.85, bases: true }));
  for (const x of [-0.3, 0.3]) { const st = puff(V(x, 0.1, -0.25), 0.07, { detail: 1, noise: 0.2, squash: 0.8, seed: x > 0 ? 1 : 2 }); B.add(st, STONES[3]); }
  const fox = G.sph(0.06, 6, 5); fox.scale(0.8, 1, 0.8); fox.translate(-0.3, 0.2, -0.25); B.add(fox, '#fff6ea');
  const fox2 = G.sph(0.06, 6, 5); fox2.scale(0.8, 1, 0.8); fox2.translate(0.3, 0.2, -0.25); B.add(fox2, '#fff6ea');
  for (const x of [-0.3, 0.3]) for (const s of [-1, 1]) { const ear = G.cone(0.02, 0.05, 4); ear.translate(x + s * 0.025, 0.28, -0.25); B.add(ear, '#fff6ea'); }
  for (const x of [-0.3, 0.3]) { const bib = G.torus(0.04, 0.012, 3, 8); bib.rotateX(PI / 2); bib.translate(x, 0.17, -0.25); B.add(bib, C.red); }
  B.door.set(0, 0, 0.55);
  B.height = 1.3;
}

export function koiStatue(B) {
  const ped = G.lathe([[0.001, 0], [0.38, 0], [0.4, 0.08], [0.3, 0.14], [0.27, 0.46], [0.34, 0.52], [0.001, 0.52]], 12);
  B.add(ped, (p, n, o) => { o.set(STONES[1]); if (n.y > 0.8) o.set('#e0d8d4'); });
  // splash of stylised water around the koi
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; const w = puff(V(Math.cos(a) * 0.18, 0.6 + (i % 2) * 0.05, Math.sin(a) * 0.18), 0.11, { detail: 1, noise: 0.2, squash: 0.8, seed: i + 30 }); B.add(w, i % 2 ? '#8fd0f0' : '#b8e4fa'); }
  for (let i = 0; i < 5; i++) { const f = G.sph(0.045, 6, 5); f.translate(B.rand(-0.24, 0.24), 0.72 + B.rand(0, 0.06), B.rand(-0.24, 0.24)); B.add(f, '#f4fbff'); }
  // leaping koi: plump arched body, calico patches, fins and a fan tail
  const R = [0.035, 0.06, 0.085, 0.105, 0.115, 0.118, 0.112, 0.1, 0.08, 0.05];
  const pts = R.map((r, i) => { const t = i / (R.length - 1); return { p: V(0, 0.62 + t * 0.72, -0.14 + Math.sin(t * PI * 0.9) * 0.2 - t * 0.02), r }; });
  B.add(tube(pts, 10, true), (p, n, o) => {
    o.set('#fff8ee');
    const patch = Math.sin(p.y * 13 + 1.2) * Math.cos(p.z * 9 - 0.5) + (n.x > 0 ? 0.25 : -0.1);
    if (patch > 0.2) o.set('#ff7a3a');
    if (p.y > 1.22 && n.z < 0.3) o.set('#ff5a2a');
  });
  const head = pts[R.length - 2].p, tailP = pts[0].p;
  for (const sx of [-1, 1]) {
    const e = G.sph(0.028, 6, 5); e.translate(sx * 0.075, head.y + 0.03, head.z + 0.06); B.add(e, '#2a2230');
    const hl = G.sph(0.01, 4, 3); hl.translate(sx * 0.082, head.y + 0.045, head.z + 0.08); B.add(hl, '#ffffff');
    const fin = G.sph(0.08, 8, 5); fin.scale(0.2, 0.55, 1); fin.rotateX(0.6); fin.rotateZ(sx * 0.5); fin.translate(sx * 0.12, pts[6].p.y - 0.05, pts[6].p.z + 0.02); B.add(fin, '#ffb080');
  }
  const mouth = G.torus(0.028, 0.012, 4, 8); mouth.rotateX(-0.4); mouth.translate(0, head.y + 0.1, head.z + 0.05); B.add(mouth, '#ff9a80');
  const dorsal = G.sph(0.12, 8, 5); dorsal.scale(0.12, 0.6, 1); dorsal.rotateX(-0.9); dorsal.translate(0, pts[5].p.y, pts[5].p.z - 0.11); B.add(dorsal, '#ff8a5a');
  for (const sx of [-1, 1]) { const lobe = G.sph(0.12, 8, 5); lobe.scale(0.12, 1, 0.55); lobe.rotateX(sx * 0.5 + 0.2); lobe.translate(0, tailP.y - 0.08, tailP.z + sx * 0.07); B.add(lobe, '#ff7a3a'); }
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; B.at([Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 0, () => bush(B, { r: 0.1, n: 1, color: '#5aa84a', flowers: i % 2 ? ['#ff8fb0'] : null })); }
  B.door.set(0, 0, 0.55);
  B.height = 1.6;
}

export function lanternString(B) {
  const hP = 1.9;
  for (const x of [-0.9, 0.9]) {
    const p = G.cyl(0.04, 0.05, hP, 6); p.translate(x, hP / 2, 0); B.add(p, C.woodDark);
    const b = G.cyl(0.1, 0.12, 0.12, 6); b.translate(x, 0.06, 0); B.add(b, STONES[1]);
    const cap = G.sph(0.05, 6, 4); cap.translate(x, hP + 0.02, 0); B.add(cap, C.gold);
  }
  const rope = []; for (let k = 0; k <= 12; k++) { const t = k / 12; rope.push({ p: V(-0.9 + 1.8 * t, hP - 0.08 - Math.sin(t * PI) * 0.22, 0), r: 0.012 }); }
  B.add(tube(rope, 4, false), '#4a3a3a');
  B.anim({ p: [0, hP - 0.1, 0], kind: 'swing', axis: [1, 0, 0], speed: 1.2, amp: 0.06 }, () => {
    const cols = [C.red, C.pink, '#ffd24a', C.red, '#fff0d0'];
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; B.at([-0.9 + 1.8 * t, 0.02 - Math.sin(t * PI) * 0.22, 0], 0, () => chochin(B, { r: 0.09, h: 0.18, cord: 0.05, color: cols[i] })); }
  });
  B.light([0, 1.4, 0.1], { color: '#ffb070', intensity: 2.4, radius: 4.5, flicker: 0.7 });
  B.door.set(0, 0, 0.5);
  B.height = 2.2;
}

export function fence(B) {
  const v = B.variant;
  const style = ['picket', 'bamboo', 'rail', 'picket'][v % 4];
  fenceRun(B, [-0.5, 0], [0.5, 0], { style, h: style === 'bamboo' ? 0.8 : 0.55 });
  if (v % 4 === 3) B.at([0.2, 0, 0.2], 0, () => bush(B, { r: 0.14, n: 1, flowers: ['#ff8fb0'] }));
  B.door.set(0, 0, 0.5);
  B.height = 0.9;
}

// Arched vermilion taiko bridge spanning z ∈ [-4.5, 4.5]; deck top = bridgeDeckHeight(z)
export function bridge(B) {
  const W = 2.0, half = BRIDGE.half, n = 36;
  const verm = C.vermilion;
  // deck planks following the arch
  for (let i = 0; i < n; i++) {
    const z0 = -half + i * (2 * half / n), z1 = z0 + 2 * half / n, zm = (z0 + z1) / 2;
    const y0 = bridgeDeckHeight(z0), y1 = bridgeDeckHeight(z1);
    const L = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0);
    const pl = G.box(W, 0.08, L - 0.015, 0); pl.rotateX(-ang); pl.translate(0, (y0 + y1) / 2 - 0.04, zm); B.add(pl, B.pick([C.woodLight, '#d8a070', '#c8905e']));
  }
  // side beams (curved) under the deck
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 18; i++) { const z = -half + i * (2 * half / 18); pts.push({ p: V(sx * (W / 2 - 0.02), bridgeDeckHeight(z) - 0.16, z), r: 0.09 }); }
    B.add(tube(pts, 6, false), verm);
  }
  // railings with giboshi posts
  const posts = 7;
  for (const sx of [-1, 1]) {
    const rail = [], rail2 = [];
    for (let i = 0; i <= 18; i++) { const z = -half + 0.15 + i * ((2 * half - 0.3) / 18); rail.push({ p: V(sx * (W / 2 + 0.02), bridgeDeckHeight(z) + 0.62, z), r: 0.045 }); rail2.push({ p: V(sx * (W / 2 + 0.02), bridgeDeckHeight(z) + 0.3, z), r: 0.03 }); }
    B.add(tube(rail, 6, false), verm); B.add(tube(rail2, 5, false), verm);
    for (let i = 0; i < posts; i++) {
      const z = -half + 0.15 + i * ((2 * half - 0.3) / (posts - 1)), y = bridgeDeckHeight(z);
      const p = G.box(0.1, 0.72, 0.1, 0.02); p.translate(sx * (W / 2 + 0.02), y + 0.32, z); B.add(p, verm);
      const gib = G.lathe([[0.001, 0], [0.07, 0], [0.08, 0.06], [0.05, 0.12], [0.001, 0.2]], 8); gib.translate(sx * (W / 2 + 0.02), y + 0.68, z); B.add(gib, C.gold);
    }
  }
  // pillars into the river + cross beams
  for (const z of [-2.6, -0.9, 0.9, 2.6]) {
    const y = bridgeDeckHeight(z) - 0.2;
    for (const sx of [-1, 1]) { const p = G.cyl(0.09, 0.11, y + 1.3, 8); p.translate(sx * (W / 2 - 0.15), (y - 1.3) / 2, z); B.add(p, (pp, nn, o) => o.set(pp.y < 0.05 ? '#5a4a44' : verm)); }
    const cb = G.box(W - 0.1, 0.1, 0.12, 0.02); cb.translate(0, y - 0.05, z); B.add(cb, verm);
  }
  // stone abutments + end steps down to ground
  for (const s of [-1, 1]) {
    const zE = s * (half - 0.3);
    const ab = G.box(W + 0.5, BRIDGE.end + 0.9, 0.9, 0.08); ab.translate(0, (BRIDGE.end - 0.9) / 2 - 0.02, zE); B.add(ab, (p, n, o) => { o.set(STONES[1]); if (n.y > 0.7) o.lerp(col(C.moss), 0.3); });
    for (const sx of [-1, 1]) {
      const cap = G.cyl(0.14, 0.17, 0.95, 8); cap.translate(sx * (W / 2 + 0.2), BRIDGE.end + 0.2, zE); B.add(cap, verm);
      const top = G.lathe([[0.001, 0], [0.13, 0], [0.15, 0.08], [0.08, 0.18], [0.001, 0.28]], 8); top.translate(sx * (W / 2 + 0.2), BRIDGE.end + 0.67, zE); B.add(top, C.gold);
    }
    B.at([s * 0.0, 0, 0], 0, () => {});
  }
  // lanterns on the end posts
  for (const s of [-1, 1]) B.at([s * (W / 2 + 0.2), BRIDGE.end + 0.66, s * (half - 0.3) - s * 0.0], 0, () => {});
  B.light([W / 2 + 0.2, BRIDGE.peak + 0.8, 0], { color: '#ffb070', intensity: 2.4, radius: 5, flicker: 0.6 });
  B.at([W / 2 + 0.02, bridgeDeckHeight(0) + 0.66, 0], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.02 }));
  B.at([-W / 2 - 0.02, bridgeDeckHeight(0) + 0.66, 0], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.02 }));
  B.warpAmt = 0.02;
  B.door.set(0, 0, half + 0.3);
  B.height = BRIDGE.peak + 1.0;
}

export function chewyStatue(B) {
  // stepped plinth with a paw plaque
  const s1 = G.box(1.6, 0.2, 1.6, 0.05); s1.translate(0, 0.1, 0); B.add(s1, STONES[2]);
  const s2 = G.box(1.2, 0.28, 1.2, 0.05); s2.translate(0, 0.34, 0); B.add(s2, STONES[0]);
  const s3 = G.box(0.86, 0.36, 0.86, 0.05); s3.translate(0, 0.66, 0); B.add(s3, STONES[1]);
  B.at([0, 0.64, 0.435], 0, () => { const pl = G.box(0.5, 0.22, 0.03, 0.01); B.add(pl, C.gold); B.at([0, 0, 0.02], 0, () => symbol(B, 'paw', 0.17, { colors: ['#8a5a2c'] })); });
  // sitting dog sculpture (Chewy) in pale stone with a red scarf and a golden bone in its mouth
  const stone = '#e4dcd6', stoneS = '#cfc4c8';
  B.push([0, 0.84, 0.02]);
  const body = G.sph(0.3, 14, 10); body.scale(1, 1.15, 0.95); body.translate(0, 0.32, -0.04); B.add(body, stone);
  const chest = G.sph(0.2, 12, 8); chest.scale(1, 1.2, 0.8); chest.translate(0, 0.36, 0.14); B.add(chest, '#f4eee8');
  for (const sx of [-1, 1]) {
    const leg = G.sph(0.11, 10, 7); leg.scale(0.9, 1.5, 1); leg.translate(sx * 0.12, 0.12, 0.2); B.add(leg, stone);
    const paw = G.sph(0.09, 10, 7); paw.scale(1.1, 0.7, 1.3); paw.translate(sx * 0.13, 0.05, 0.28); B.add(paw, '#f4eee8');
    const hip = G.sph(0.15, 10, 7); hip.scale(1, 0.8, 1.2); hip.translate(sx * 0.2, 0.1, -0.1); B.add(hip, stone);
  }
  const head = G.sph(0.27, 16, 12); head.scale(1.05, 0.95, 1); head.translate(0, 0.78, 0.08); B.add(head, stone);
  const muzzle = G.sph(0.14, 12, 9); muzzle.scale(1.1, 0.8, 1); muzzle.translate(0, 0.7, 0.3); B.add(muzzle, '#f4eee8');
  const nose = G.sph(0.045, 8, 6); nose.scale(1.3, 0.9, 1); nose.translate(0, 0.76, 0.43); B.add(nose, '#5a4a4e');
  for (const sx of [-1, 1]) {
    const eye = G.sph(0.035, 8, 6); eye.scale(1, 1.2, 0.6); eye.translate(sx * 0.1, 0.85, 0.3); B.add(eye, '#5a4a4e');
    const ear = G.sph(0.13, 10, 7); ear.scale(0.55, 1.1, 0.35); ear.rotateZ(sx * 0.5); ear.translate(sx * 0.25, 0.82, 0.02); B.add(ear, stoneS);
    const cheek = G.sph(0.03, 6, 4); cheek.translate(sx * 0.16, 0.74, 0.3); B.add(cheek, '#ffb0b8');
  }
  const tail = tube([{ p: V(0, 0.12, -0.3), r: 0.06 }, { p: V(0.12, 0.2, -0.42), r: 0.055 }, { p: V(0.16, 0.36, -0.4), r: 0.045 }, { p: V(0.1, 0.46, -0.32), r: 0.03 }], 7, true); B.add(tail, stone);
  const scarf = G.torus(0.2, 0.05, 6, 16); scarf.rotateX(PI / 2 - 0.2); scarf.translate(0, 0.58, 0.07); B.add(scarf, C.red);
  const knot = G.box(0.1, 0.16, 0.05, 0.02); knot.rotateZ(0.3); knot.translate(0.12, 0.5, 0.24); B.add(knot, C.red);
  // golden bone held across the mouth
  B.at([0, 0.66, 0.36], 0, () => {
    const shaft = G.cyl(0.05, 0.05, 0.52, 10); shaft.rotateZ(PI / 2); B.add(shaft, (p, n, o) => o.set('#f4c04a').lerp(col('#fff0b0'), clamp(n.y * 0.6)));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const k = G.sph(0.075, 10, 8); k.translate(sx * 0.28, sy * 0.055, 0); B.add(k, (p, n, o) => o.set('#f4c04a').lerp(col('#fff4c0'), clamp(n.y * 0.5 + 0.2))); }
  });
  B.pop();
  // flower ring + corner shrubs
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const f = G.sph(0.055, 6, 4); f.translate(Math.cos(a) * 0.55, 0.51, Math.sin(a) * 0.55); B.add(f, B.pick(['#ff8fb0', '#ffffff', '#ffd24a'])); }
  for (const [x, z] of [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]]) B.at([x, 0.2, z], 0, () => bush(B, { r: 0.13, n: 1, color: '#5aa84a', flowers: ['#ff8fb0'] }));
  B.light([0, 1.9, 0.7], { color: '#ffd080', intensity: 2.2, radius: 5, flicker: 0.2 });
  B.door.set(0, 0, 1.1);
  B.height = 2.3;
}
