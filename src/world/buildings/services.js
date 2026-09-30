// Services (coverage buildings): well, water tower, stone lantern, lantern post, park, shrine, onsen, clinic, school.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col, mixc } from './kit.js';
import { roof, roundRoof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, chimney, steps, stepStones, fence, flowerBox, STONES, FLOWERS } from './parts.js';
import { chochin, toro, pot, barrel, crate, bush, tree, flowerPatch, signboard, bench, bell, torii, rock, bamboo, offeringBox } from './props.js';
import { nobori, bucket, stoneDog, shimenawa, pinwheel } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { charm, rainChain, emaRack, omikuji, tanabata, towelRack, namePlate, eaveCharm } from './trim.js';
import { clamp, TAU } from '../../core/util.js';

// ------------------------------------------------------------------ well (1x1)
export function well(B) {
  const ring = G.lathe([[0.3, 0], [0.36, 0], [0.37, 0.45], [0.4, 0.5], [0.4, 0.56], [0.3, 0.56], [0.29, 0.1]], 16);
  B.add(ring, (p, n, o) => { o.set(B.pick(STONES)); const band = Math.floor(p.y / 0.13) + Math.floor(Math.atan2(p.z, p.x) * 2.5 + (Math.floor(p.y / 0.13) % 2) * 0.5); o.set(STONES[Math.abs(band) % STONES.length]); if (n.y > 0.7) o.lerp(col(C.moss), 0.35); });
  const water = G.disc(0.3, 14); water.rotateX(-PI / 2); water.translate(0, 0.36, 0); B.add(water, '#4aa8d0', 'water');
  for (const s of [-1, 1]) { const p = G.box(0.08, 1.35, 0.08, 0.02); p.translate(s * 0.38, 0.68, 0); B.add(p, C.woodMid); }
  const bar = G.box(0.9, 0.07, 0.07, 0.02); bar.translate(0, 1.22, 0); B.add(bar, C.woodMid);
  roof(B, { type: 'gable', w: 0.78, d: 0.36, y0: 1.36, over: 0.18, gOver: 0.14, H: 0.34, curve: 0.25, lift: 0.1, liftW: 0.25, thick: 0.07, ribW: 0.18, ribAmp: 0.025, course: 0, color: ROOFS.teal, vent: false, oni: false });
  const pulley = G.torus(0.08, 0.025, 5, 12); pulley.translate(0, 1.12, 0); B.add(pulley, C.woodDark);
  B.anim({ p: [0, 1.08, 0], kind: 'swing', axis: [1, 0, 0], speed: 1.3, amp: 0.06 }, () => {
    const rope = G.cyl(0.008, 0.008, 0.5, 3, true); rope.translate(0, -0.25, 0); B.add(rope, '#e8d8a8');
    B.at([0, -0.66, 0], 0, () => bucket(B, { r: 0.09, h: 0.14 }));
  });
  B.at([0.28, 0.56, 0.28], 0.4, () => bucket(B, { r: 0.08, h: 0.12, water: true }));
  B.door.set(0, 0, 0.6);
  B.height = 1.9;
}

// ------------------------------------------------------------------ water tower (2x2)
export function waterTower(B) {
  const legH = 1.7, s = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = G.box(0.11, legH, 0.11, 0.02); l.rotateZ(-sx * 0.05); l.rotateX(sz * 0.05); l.translate(sx * s, legH / 2, sz * s); B.add(l, C.woodMid);
    const f = G.cyl(0.1, 0.13, 0.14, 6); f.translate(sx * (s + 0.04), 0.07, sz * (s + 0.04)); B.add(f, STONES[1]);
  }
  for (const [a, b] of [[[-s, -s], [s, -s]], [[s, -s], [s, s]], [[s, s], [-s, s]], [[-s, s], [-s, -s]]]) {
    for (const [y0, y1] of [[0.25, 1.3], [1.3, 0.25]]) {
      const p0 = V(a[0], y0, a[1]), p1 = V(b[0], y1, b[1]);
      const d = new THREE.Vector3().subVectors(p1, p0), L = d.length();
      const g = G.box(0.05, 0.05, L, 0); g.applyMatrix4(new THREE.Matrix4().lookAt(p0, p1, V(0, 1, 0))); g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2); B.add(g, C.woodDark);
    }
  }
  const plat = G.box(1.5, 0.1, 1.5, 0.03); plat.translate(0, legH + 0.05, 0); B.add(plat, C.woodLight);
  // tank
  const R = 0.64, H = 0.95, y0 = legH + 0.1;
  const tank = G.lathe([[0.001, 0], [R, 0], [R * 1.03, H * 0.5], [R, H], [0.001, H]], 18); tank.translate(0, y0, 0);
  B.add(tank, (p, n, o) => { const a = Math.atan2(p.z, p.x); o.set('#c9965e').multiplyScalar(0.88 + 0.12 * Math.sin(a * 16)); });
  for (const t of [0.15, 0.5, 0.85]) { const b = G.torus(R * (1 + 0.03 * Math.sin(t * PI)) + 0.012, 0.022, 4, 18); b.rotateX(PI / 2); b.translate(0, y0 + H * t, 0); B.add(b, C.iron); }
  roundRoof(B, { r: 0.85, rw: R, y0: y0 + H + 0.02, H: 0.5, sides: 8, rot: PI / 8, lift: 0.12, thick: 0.08, ribW: 0.2, ribAmp: 0.03, color: ROOFS.slate });
  // ladder
  B.at([s + 0.08, 0, 0.1], 0, () => {
    for (const z of [-0.14, 0.14]) { const r = G.box(0.04, legH + 0.1, 0.04, 0); r.translate(0, (legH + 0.1) / 2, z); B.add(r, C.woodLight); }
    for (let y = 0.25; y < legH; y += 0.25) { const rg = G.box(0.03, 0.03, 0.28, 0); rg.translate(0, y, 0); B.add(rg, C.woodLight); }
  });
  // pipe to a trough with a little spout
  const pipe = G.cyl(0.04, 0.04, legH, 6); pipe.translate(-0.15, legH / 2 + 0.1, -0.15); B.add(pipe, '#8a8a98');
  const tr = G.box(0.7, 0.26, 0.34, 0.04); tr.translate(-0.15, 0.13, 0.62); B.add(tr, C.woodMid);
  const tw = G.box(0.6, 0.02, 0.26, 0); tw.translate(-0.15, 0.24, 0.62); B.add(tw, '#5ab8d8', 'water');
  const sp = G.cyl(0.03, 0.03, 0.62, 6); sp.rotateX(PI / 2); sp.translate(-0.15, 0.55, 0.16); B.add(sp, '#8a8a98');
  const jet = tube([{ p: V(-0.15, 0.55, 0.47), r: 0.025 }, { p: V(-0.15, 0.48, 0.56), r: 0.022 }, { p: V(-0.15, 0.3, 0.62), r: 0.02 }], 6, false);
  B.add(jet, '#bfe8ff', 'jet');
  B.at([0.75, 0, 0.75], 0, () => bucket(B, { r: 0.1, h: 0.16, water: true }));
  B.door.set(0, 0, 1.2);
  B.height = y0 + H + 0.9;
}

// ------------------------------------------------------------------ stone lantern (1x1)
export function stoneLantern(B) {
  const base = puff(V(0, 0.04, 0), 0.42, { detail: 1, noise: 0.2, squash: 0.2, seed: 5 }); B.add(base, STONES[1]);
  toro(B, { s: 1.15 });
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; B.at([Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36], 0, () => (i === 2 ? rock(B, { r: 0.12 }) : bush(B, { r: 0.12, n: 1, color: '#5aa84a' }))); }
  B.light([0, 1.15, 0.05], { color: '#ffc070', intensity: 2.6, radius: 5, flicker: 0.8, nightOnly: true });
  B.door.set(0, 0, 0.6);
  B.height = 1.7;
}

// ------------------------------------------------------------------ lantern post / street lamp (1x1)
export function streetLamp(B) {
  const h = 1.75;
  const base = G.cyl(0.16, 0.2, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, STONES[1]);
  const p = G.box(0.1, h, 0.1, 0.02); p.translate(0, h / 2, 0); B.add(p, C.woodDark);
  // andon box lantern on top
  B.push([0, h, 0]);
  const plat = G.box(0.36, 0.05, 0.36, 0.01); B.add(plat, C.woodDark);
  const paper = G.box(0.28, 0.34, 0.28, 0); paper.translate(0, 0.2, 0); B.glow(paper, '#fff4dc', { flicker: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = G.box(0.035, 0.36, 0.035, 0); q.translate(sx * 0.14, 0.2, sz * 0.14); B.add(q, C.woodDark); }
  for (const y of [0.03, 0.37]) for (const [w, d] of [[0.3, 0.035], [0.035, 0.3]]) for (const s of [-1, 1]) { const q = G.box(w, 0.03, d, 0); q.translate(w > 0.1 ? 0 : s * 0.14, y, w > 0.1 ? s * 0.14 : 0); B.add(q, C.woodDark); }
  for (const sd of [0, PI / 2, PI, -PI / 2]) B.at([0, 0.2, 0], sd, () => { const b = G.box(0.02, 0.3, 0.005, 0); b.translate(0, 0, 0.142); B.add(b, C.woodDark); const b2 = G.box(0.24, 0.02, 0.005, 0); b2.translate(0, 0, 0.142); B.add(b2, C.woodDark); });
  roof(B, { type: 'hip', w: 0.3, d: 0.3, y0: 0.4, over: 0.13, H: 0.24, curve: 0.45, lift: 0.1, liftW: 0.14, thick: 0.07, ribW: 0, course: 0, color: '#4a4a5a', edge: '#8a8a9a', under: C.woodDark, finial: 'stone' });
  B.pop();
  for (const sy of [0.45, 1.05]) { const band = G.box(0.13, 0.05, 0.13, 0); band.translate(0, sy, 0); B.add(band, C.iron); }
  const plant = G.sph(0.14, 7, 5); plant.scale(1, 0.7, 1); plant.translate(0.2, 0.12, 0.15); B.add(plant, '#5aa84a', 'leaf');
  B.light([0, h + 0.2, 0], { color: '#ffc27a', intensity: 3.2, radius: 6, flicker: 0.5, nightOnly: true });
  B.door.set(0, 0, 0.55);
  B.height = h + 0.8;
}

// ------------------------------------------------------------------ park (3x3)
export function park(B) {
  const lawn = G.box(2.8, 0.06, 2.8, 0.03); lawn.translate(0, 0.03, 0); B.add(lawn, '#8fd070');
  // pond (front-right)
  const px = 0.55, pz = 0.5;
  const pond = G.cyl(0.62, 0.62, 0.04, 20); pond.scale(1.2, 1, 0.9); pond.translate(px, 0.07, pz); B.add(pond, '#5ab8d8', 'water');
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; const st = puff(V(0, 0, 0), 0.12, { detail: 1, noise: 0.3, squash: 0.6, seed: i + 20 }); st.translate(px + Math.cos(a) * 0.76, 0.08, pz + Math.sin(a) * 0.58); B.add(st, B.pick(STONES)); }
  for (let i = 0; i < 3; i++) { const lp = G.cyl(0.1, 0.1, 0.01, 10, false); lp.translate(px + B.wob(0.35), 0.1, pz + B.wob(0.25)); B.add(lp, '#6ab84c'); }
  const lotus = G.sph(0.05, 6, 4); lotus.translate(px + 0.2, 0.13, pz - 0.1); B.add(lotus, '#ff9ec0');
  // koi (tiny orange shapes under the surface-look)
  for (let i = 0; i < 2; i++) { const k = G.sph(0.05, 6, 4); k.scale(2, 0.5, 1); k.rotateY(i * 2); k.translate(px + B.wob(0.3), 0.075, pz + B.wob(0.2)); B.add(k, i ? '#ff8a3a' : '#fff6ea'); }
  // sakura tree back-left
  B.at([-0.75, 0.05, -0.7], 0, () => tree(B, { kind: 'sakura', s: 0.7 }));
  // benches
  B.at([0.55, 0.05, -0.85], 0, () => bench(B, { w: 1.0 }));
  B.at([-1.0, 0.05, 0.55], PI / 2, () => bench(B, { w: 0.9 }));
  // flower beds + path
  B.at([-0.2, 0.05, 1.0], 0, () => flowerPatch(B, { w: 0.7, d: 0.35, n: 8 }));
  B.at([1.15, 0.05, -0.2], 0, () => flowerPatch(B, { w: 0.35, d: 0.7, n: 7, colors: ['#ffbcd6', '#ffffff', '#c8a8ff'] }));
  stepStones(B, -0.3, 1.3, -0.2, -0.3, 4);
  B.at([-1.15, 0.05, -0.15], 0, () => toro(B, { s: 0.55 }));
  B.at([1.2, 0.05, 1.2], 0, () => bush(B, { r: 0.22, flowers: ['#ff8fb0'] }));
  B.light([-1.15, 0.7, -0.15], { color: '#ffc070', intensity: 2.2, radius: 5, flicker: 0.8 });
  B.door.set(-0.25, 0, 1.45);
  B.height = 2.6;
}

// ------------------------------------------------------------------ shrine (3x3)
export function shrine(B) {
  // stone platform + honden
  const pw = 2.0, pd = 1.6, ph = 0.28, zc = -0.55;
  B.push([0, 0, zc]);
  foundation(B, { w: pw, d: pd, h: ph, pad: 0.08 });
  const w = 1.4, d = 1.05, h = 1.05, y0 = ph;
  B.push([0, 0, -0.1]);
  walls(B, { w, d, h, y0, plaster: '#fff8f0', frame: C.vermilion, rail: true, railAt: 0.3 });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 0.8, h: 0.95, style: 'lattice', frame: C.vermilion, wood: '#e8c89a' }));
  onFace(B, blk, 'r', 0, y0 + 0.6, () => shoji(B, { w: 0.5, h: 0.4, frame: C.vermilion }));
  onFace(B, blk, 'l', 0, y0 + 0.6, () => shoji(B, { w: 0.5, h: 0.4, frame: C.vermilion }));
  const info = roof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.42, H: 0.95, curve: 0.5, lift: 0.34, liftW: 0.7, thick: 0.13, ribW: 0.24, color: ROOFS.moss, gable: 'ornate', tg: 0.45, moss: 0.3 });
  // front eave extension (kohai) over the offering area on vermilion posts
  posts(B, [-0.55, 0.55], d / 2 + 0.55, y0 + h - 0.1, C.vermilion, 0.05);
  B.at([0, 0, d / 2 + 0.32], 0, () => roof(B, { type: 'shed', w: 1.2, d: 0.52, y0: y0 + h - 0.05, over: 0.14, gOver: 0.14, H: 0.26, curve: 0.3, lift: 0.14, liftW: 0.35, thick: 0.08, ribW: 0.22, ribAmp: 0.03, course: 0, color: ROOFS.moss }));
  shimenawa(B, { w: 1.1, y: y0 + h - 0.12, sag: 0.1, z: d / 2 + 0.58, r: 0.04 });
  // bell + rope (cloth)
  B.at([0, y0 + h - 0.18, d / 2 + 0.42], 0, () => bell(B, { r: 0.1, color: C.gold }));
  const cl = { x0: -0.1, x1: 0.1, yTop: y0 + h - 0.4, yBot: y0 + 0.05 };
  for (let i = 0; i < 3; i++) { const r = G.plane(0.045, cl.yTop - cl.yBot, 1, 5); r.translate(-0.05 + i * 0.05, (cl.yTop + cl.yBot) / 2, d / 2 + 0.42); B.cloth(r, i === 1 ? '#fff6ea' : C.red, cl); }
  B.at([0, y0, d / 2 + 0.28], 0, () => offeringBox(B, 0.5));
  B.pop();
  B.at([0, 0, pd / 2 + 0.2], 0, () => steps(B, { w: 0.8, n: 2, rise: ph / 2, run: 0.18 }));
  B.pop();
  // approach: mini torii, guardian dogs, lanterns, sakura
  B.at([0, 0, 1.2], 0, () => torii(B, { w: 1.1, h: 1.35 }));
  B.at([-0.72, 0, 0.55], 0.3, () => stoneDog(B, { s: 0.55, ball: 1 }));
  B.at([0.72, 0, 0.55], -0.3, () => stoneDog(B, { s: 0.55, ball: -1 }));
  for (const x of [-1.2, 1.2]) B.at([x, 0, 1.0], 0, () => toro(B, { s: 0.6 }));
  B.at([-1.1, 0, -1.1], 0, () => tree(B, { kind: 'sakura', s: 0.6 }));
  B.at([1.2, 0, -1.2], 0, () => bamboo(B, { n: 3, h: 1.6, spread: 0.2 }));
  // wishes: an ema rack on one side of the approach, an omikuji line tied full of fortunes on the other
  B.at([-1.3, 0, -0.1], PI / 2, () => emaRack(B, { w: 0.7, h: 0.9 }));
  B.at([1.32, 0, -0.1], -PI / 2, () => omikuji(B, { w: 0.75, h: 0.85 }));
  stepStones(B, 0, 0.35, 0, 1.45, 3);
  B.light([0, 1.2, 0.3], { color: '#ffc070', intensity: 3, radius: 6, flicker: 0.6 });
  B.door.set(0, 0, 1.5);
  B.height = 3.2;
}

// ------------------------------------------------------------------ onsen (4x4)
export function onsen(B) {
  const px = -0.2, pz = 0.35;
  // rock-rimmed hot pool
  const basin = G.cyl(1.25, 1.2, 0.2, 24); basin.scale(1.1, 1, 0.85); basin.translate(px, 0.1, pz); B.add(basin, '#8a8290');
  const water = G.cyl(1.2, 1.2, 0.02, 24); water.scale(1.1, 1, 0.85); water.translate(px, 0.2, pz); B.add(water, '#8fe0d8', 'water');
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * TAU, r = B.rand(0.17, 0.26);
    const st = puff(V(0, 0, 0), r, { detail: 1, noise: 0.28, squash: 0.65, seed: 80 + i });
    st.translate(px + Math.cos(a) * 1.4, 0.14, pz + Math.sin(a) * 1.1); B.add(st, (p, n, o) => { o.set(B.pick(STONES)); if (n.y > 0.75) o.lerp(col(C.moss), 0.3); });
  }
  const bigRock = puff(V(px - 1.0, 0.35, pz - 0.7), 0.42, { detail: 1, noise: 0.25, squash: 0.8, seed: 3 }); B.add(bigRock, (p, n, o) => o.set('#a8a0b4').lerp(col(C.moss), clamp(n.y - 0.5)));
  // steam emitters
  for (const [x, z] of [[px - 0.4, pz], [px + 0.45, pz + 0.2], [px, pz - 0.4]]) B.smokeAt([x, 0.3, z]);
  // bamboo spout (kakei) pouring into the pool
  B.at([px + 1.25, 0, pz - 0.75], 0, () => {
    const post = G.cyl(0.05, 0.06, 0.8, 6); post.translate(0, 0.4, 0); B.add(post, '#8fd06a');
    const pipe = G.cyl(0.04, 0.04, 0.6, 6); pipe.rotateZ(PI / 2 - 0.2); pipe.rotateY(-0.6); pipe.translate(-0.24, 0.75, 0.16); B.add(pipe, '#9ad874');
    const jet = tube([{ p: V(-0.48, 0.69, 0.33), r: 0.03 }, { p: V(-0.55, 0.55, 0.38), r: 0.028 }, { p: V(-0.58, 0.25, 0.4), r: 0.03 }], 6, false);
    B.add(jet, '#d0f4ff', 'jet');
  });
  // bamboo fence back + left
  fence(B, [-1.9, -1.85], [1.9, -1.85], { style: 'bamboo', h: 1.3 });
  fence(B, [-1.85, -1.8], [-1.85, 0.6], { style: 'bamboo', h: 1.3 });
  // changing hut (back-right)
  B.at([1.25, 0, -1.0], 0, () => {
    const w = 1.1, d = 0.9, h = 1.3, y0 = 0.15;
    foundation(B, { w, d, h: y0, stones: false });
    walls(B, { w, d, h, y0, planks: '#c9a27a', frame: C.woodMid });
    onFace(B, { w, d }, 'f', 0, y0, () => {
      door(B, { w: 0.7, h: 1.05, style: 'shoji' });
      noren(B, { w: 0.34, h: 0.5, y: 1.1, z: 0.15, color: '#d84848', strips: 1, symbol: () => flatSymbol('heart'), symScale: 0.14 });
      B.at([0.36, 0, 0], 0, () => noren(B, { w: 0.34, h: 0.5, y: 1.1, z: 0.15, color: C.indigo, strips: 1, symbol: () => flatSymbol('star'), symScale: 0.14 }));
    });
    roof(B, { type: 'gable', w, d, y0: y0 + h, over: 0.26, gOver: 0.2, H: 0.55, curve: 0.3, lift: 0.14, liftW: 0.35, thick: 0.1, ribW: 0.22, ribAmp: 0.03, color: ROOFS.teal, vent: false });
    B.at([0, y0 + h + 0.05, d / 2 + 0.3], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.05, color: '#fff0d0' }));
    B.at([-0.42, y0 + h + 0.02, d / 2 + 0.2], 0, () => charm(B, 'furin', { color: '#bfe6ff' }));
  });
  // towels drying on a rack behind the pool
  B.at([0.2, 0, -1.45], 0, () => towelRack(B, { colors: ['#ffffff', '#8fd0ff'] }));
  // wooden buckets + stools + towel
  B.at([0.95, 0, 0.9], 0, () => { bucket(B, { r: 0.12, h: 0.16 }); B.at([0, 0.16, 0], 0.3, () => bucket(B, { r: 0.11, h: 0.15 })); });
  B.at([1.35, 0, 0.55], 0, () => bucket(B, { r: 0.12, h: 0.16, water: true }));
  const towel = G.box(0.3, 0.04, 0.22, 0.02); towel.rotateY(0.4); towel.translate(px - 1.0, 0.72, pz - 0.7); B.add(towel, '#ffffff');
  const duck = G.sph(0.07, 8, 6); duck.translate(px + 0.3, 0.26, pz - 0.2); B.add(duck, '#ffd24a');
  const beak = G.cone(0.025, 0.05, 5); beak.rotateZ(-PI / 2); beak.translate(px + 0.38, 0.27, pz - 0.2); B.add(beak, '#ff8a3a');
  B.at([-1.55, 0, 1.4], 0, () => toro(B, { s: 0.65 }));
  B.at([1.6, 0, 1.55], 0, () => bamboo(B, { n: 3, h: 1.4, spread: 0.15 }));
  B.at([-1.6, 0, 1.0], 0, () => bush(B, { r: 0.22, flowers: ['#ffbcd6'] }));
  B.light([-1.55, 0.9, 1.3], { color: '#ffc070', intensity: 2.6, radius: 5, flicker: 0.7 });
  B.light([px, 0.8, pz], { color: '#a8f0e8', intensity: 1.6, radius: 4, flicker: 0.2, nightOnly: true });
  B.door.set(0.2, 0, 1.9);
  B.height = 2.4;
}

// ------------------------------------------------------------------ clinic (3x3)
export function clinic(B) {
  const roofCol = '#6aaea4', wall = '#fbfbff';
  const w = 2.35, d = 1.65, h = 1.55, y0 = 0.28, zc = -0.55;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, frame: '#8aa0a8', koshi: '#d8e8e4', koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', 0.2, y0, () => {
    door(B, { w: 0.95, h: 1.3, style: 'shoji', frame: '#8aa0a8', wood: '#e8d8c8' });
    noren(B, { w: 0.9, h: 0.46, y: 1.36, z: 0.17, color: '#fff6f6', hemColor: '#ff7a8a', strips: 2, symbol: () => flatSymbol('heart'), symScale: 0.2, symColor: '#ff6f7f' });
  });
  onFace(B, blk, 'f', -0.75, y0 + 0.86, () => roundWindow(B, { r: 0.26, lattice: 'fine', frame: '#8aa0a8', box: true, flowers: ['#ff8fb0', '#ffffff'] }));
  onFace(B, blk, 'r', 0, y0 + 0.86, () => shoji(B, { w: 0.8, h: 0.5, frame: '#8aa0a8', box: true, flowers: ['#ff8fb0', '#ffd24a'] }));
  onFace(B, blk, 'l', 0, y0 + 0.86, () => shoji(B, { w: 0.8, h: 0.5, frame: '#8aa0a8' }));
  onFace(B, blk, 'b', 0, y0 + 0.86, () => shoji(B, { w: 0.8, h: 0.5, frame: '#8aa0a8' }));
  const info = roof(B, { type: 'hip', w, d, y0: y0 + h, over: 0.4, H: 0.85, curve: 0.4, lift: 0.26, liftW: 0.7, thick: 0.14, ribW: 0.27, color: roofCol });
  // big paw+heart sign on the roof front
  B.at([0, info.ridgeY - 0.35, d / 2 + 0.25], 0, () => {
    const p = G.box(0.06, 0.5, 0.06, 0); p.translate(0, -0.25, -0.12); B.add(p, '#8aa0a8');
    const disc = G.cyl(0.36, 0.36, 0.08, 20); disc.rotateX(PI / 2); B.add(disc, '#ffffff');
    const ring = G.torus(0.36, 0.04, 5, 20); B.add(ring, '#ff7a8a');
    B.at([0, 0, 0.04], 0, () => symbol(B, 'pawHeart', 0.52));
  });
  // opening-hours plaque by the door, a bell, a wind chime and a rain chain at the right corner
  onFace(B, blk, 'f', 0.93, y0 + 0.92, () => namePlate(B, { w: 0.14, h: 0.28, wood: '#fff6f0' }));
  eaveCharm(B, info, 0.8, d / 2 + 0.22, 'bell');
  eaveCharm(B, info, -0.35, d / 2 + 0.22, 'furin', { color: '#ffd0d8' });
  { const cx = w / 2 + 0.14, cz = d / 2 - 0.05; rainChain(B, cx, info.underAt(cx, cz), cz, 0, { color: '#9ab0b8' }); }
  B.pop();
  B.at([-0.85, 0, 1.05], 0, () => bench(B, { w: 0.9, wood: '#e8f0ee', legs: '#8aa0a8' }));
  B.at([1.2, 0, 1.2], 0, () => pot(B, { plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
  B.at([1.2, 0, 0.75], 0, () => pot(B, { plant: 'bush', r: 0.15 }));
  B.at([-1.15, 0, 1.2], 0, () => nobori(B, { h: 1.9, w: 0.34, color: '#ff8fa0', sym: 'pawHeart', symColor: '#ffffff' }));
  stepStones(B, 0.2, zc + d / 2 + 0.25, 0.2, 1.4, 3);
  B.light([0.2, 1.4, 0.8], { ...LAMP, color: '#ffd8d0' });
  B.door.set(0.2, 0, 1.45);
  B.height = 3.6;
}

// ------------------------------------------------------------------ school (4x3)
export function school(B) {
  const roofCol = ROOFS.terracotta, wall = '#fff7e6';
  const w = 3.0, d = 1.6, h = 1.6, y0 = 0.3, zc = -0.55, cx = -0.35;
  B.push([cx, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, koshi: '#c9a27a', koshiSkip: ['f'], posts: { f: [-0.5, 0.5] } });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 0.85, h: 1.3, style: 'lattice' }));
  for (const u of [-1.05, 1.05]) onFace(B, blk, 'f', u, y0 + 0.85, () => shoji(B, { w: 0.78, h: 0.62, box: true, flowers: [B.pick(FLOWERS), B.pick(FLOWERS)] }));
  for (const u of [-1.0, 0, 1.0]) onFace(B, blk, 'b', u, y0 + 0.85, () => shoji(B, { w: 0.7, h: 0.6 }));
  onFace(B, blk, 'l', 0, y0 + 0.85, () => roundWindow(B, { r: 0.28 }));
  const info = roof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.4, H: 0.9, curve: 0.4, lift: 0.26, liftW: 0.7, thick: 0.14, ribW: 0.28, color: roofCol, gable: 'plaster', tg: 0.52 });
  onFace(B, blk, 'f', 0, y0 + h - 0.02, () => B.at([0, 0, 0.26], 0, () => roof(B, { type: 'shed', w: 1.2, d: 0.46, y0: -0.04, over: 0.1, gOver: 0.12, H: 0.18, curve: 0.2, lift: 0.1, liftW: 0.3, thick: 0.07, ribW: 0.22, ribAmp: 0.03, course: 0, color: roofCol })));
  B.at([0, y0 + h + 0.35, d / 2 + 0.12], 0, () => signboard(B, { sym: 'book', w: 0.7, h: 0.36, symSize: 0.3 }));
  // children's touches: teru teru bozu in a row under the front eave, a rain chain at the left corner
  for (let i = 0; i < 3; i++) eaveCharm(B, info, -1.35 + i * 0.16, d / 2 + 0.2, 'teru', { color: ['#ff7a8a', '#6ab0ff', '#ffd24a'][i] });
  { const cx = -(w / 2 + 0.14), cz = d / 2 - 0.05; rainChain(B, cx, info.underAt(cx, cz), cz, 0); }
  B.pop();
  // tanabata bamboo full of wishes beside the entrance
  B.at([-1.0, 0, 0.62], 0, () => tanabata(B, { h: 2.0 }));
  // bell tower (right)
  const tx = 1.45, tz = -0.55, tH = 2.6;
  B.push([tx, 0, tz]);
  const tb = G.box(0.9, 0.3, 0.9, 0.06); tb.translate(0, 0.15, 0); B.add(tb, STONES[2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.1, tH, 0.1, 0.02); p.translate(sx * 0.32, 0.3 + tH / 2, sz * 0.32); B.add(p, C.woodMid); }
  for (const y of [0.9, 1.7]) for (const [a, b] of [[[-0.32, -0.32], [0.32, -0.32]], [[0.32, -0.32], [0.32, 0.32]], [[0.32, 0.32], [-0.32, 0.32]], [[-0.32, 0.32], [-0.32, -0.32]]]) {
    const g = G.box(Math.abs(b[0] - a[0]) + 0.06, 0.07, Math.abs(b[1] - a[1]) + 0.06, 0); g.translate((a[0] + b[0]) / 2, 0.3 + y, (a[1] + b[1]) / 2); B.add(g, C.woodMid);
  }
  const room = G.box(0.74, 0.08, 0.74, 0.02); room.translate(0, 0.3 + tH - 0.62, 0); B.add(room, C.woodLight);
  for (const sd of [0, PI / 2, PI, -PI / 2]) B.at([0, 0.3 + tH - 0.4, 0], sd, () => { const r = G.box(0.7, 0.05, 0.04, 0); r.translate(0, 0, 0.36); B.add(r, C.vermilion); });
  roof(B, { type: 'hip', w: 0.72, d: 0.72, y0: 0.3 + tH + 0.02, over: 0.26, H: 0.55, curve: 0.5, lift: 0.18, liftW: 0.3, thick: 0.09, ribW: 0.22, ribAmp: 0.03, course: 0, color: roofCol, finial: 'gold' });
  B.anim({ p: [0, 0.3 + tH - 0.1, 0], kind: 'swing', axis: [1, 0, 0], speed: 1.4, amp: 0.2 }, () => bell(B, { r: 0.16, color: C.gold }));
  B.pop();
  // flag pole + playground bits
  B.at([1.45, 0, 0.9], 0, () => {
    const p = G.cyl(0.03, 0.035, 2.3, 6); p.translate(0, 1.15, 0); B.add(p, '#e8e0d8');
    const ball = G.sph(0.05, 6, 4); ball.translate(0, 2.32, 0); B.add(ball, C.gold);
    const fl = G.plane(0.56, 0.36, 4, 3); fl.translate(0.3, 2.05, 0); B.cloth(fl, '#7cc4f4', { x0: 0.02, x1: 0.58, yTop: 2.23, yBot: 1.87 });
    const st = flatSymbol('book'); st.scale(0.26, 0.26, 1); st.translate(0.3, 2.05, 0.005); B.cloth(st, '#fff6ea', { x0: 0.02, x1: 0.58, yTop: 2.23, yBot: 1.87 });
    const hem = G.plane(0.56, 0.05, 4, 1); hem.translate(0.3, 1.895, 0.004); B.cloth(hem, '#ffd24a', { x0: 0.02, x1: 0.58, yTop: 2.23, yBot: 1.87 });
  });
  B.at([-1.35, 0, 0.95], 0, () => { const sb = G.box(0.9, 0.12, 0.7, 0.03); sb.translate(0, 0.06, 0); B.add(sb, C.woodLight); const sand = G.box(0.8, 0.04, 0.6, 0); sand.translate(0, 0.12, 0); B.add(sand, '#f4e0b0'); const bk = G.cyl(0.07, 0.06, 0.1, 8); bk.translate(0.2, 0.19, 0.1); B.add(bk, '#6ab0ff'); });
  B.at([0.35, 0, 0.95], -0.3, () => signboard(B, { sym: 'star', w: 0.4, h: 0.4, style: 'aframe', color: '#3a4a44', frame: C.woodLight, symSize: 0.28 }));
  B.at([0.75, 0, 0.9], 0, () => pinwheel(B, { h: 0.8 }));
  stepStones(B, cx, zc + d / 2 + 0.2, cx, 1.4, 3);
  B.light([cx, 1.4, 0.7], LAMP);
  B.door.set(cx, 0, 1.45);
  B.height = 4.0;
}
