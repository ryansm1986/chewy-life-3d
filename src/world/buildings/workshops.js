// Workshops (zone W): farm field, lumber workshop, pottery kiln, fishing hut. Level 2 adds props / structures.
import * as THREE from 'three';
import { puff } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, ROOF_LIST, shade, col } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, door, noren, posts, chimney, stepStones, fence, engawa, STONES, FLOWERS } from './parts.js';
import { chochin, barrel, crate, produce, bush, logPile, woodStack, signboard, rock, pot, lanternPost } from './props.js';
import { cabbage, carrot, pumpkin, scarecrow, net, fishRack, boat, bucket, pottery, wheel } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { clamp, TAU } from '../../core/util.js';

// small open shed on 4 posts with a shed roof (local, centred, front +z)
function openShed(B, { w = 1.4, d = 1.0, h = 1.55, color = ROOFS.slate, wood = C.woodMid } = {}) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hh = h + (sz < 0 ? 0.25 : 0);
    const p = G.box(0.09, hh, 0.09, 0.02); p.translate(sx * (w / 2 - 0.05), hh / 2, sz * (d / 2 - 0.05)); B.add(p, wood);
  }
  for (const sz of [-1, 1]) { const b = G.box(w, 0.09, 0.1, 0.02); b.translate(0, h + (sz < 0 ? 0.25 : 0) - 0.03, sz * (d / 2 - 0.05)); B.add(b, wood); }
  return roof(B, { type: 'shed', w: w - 0.1, d: d - 0.1, y0: h + 0.02, over: 0.22, gOver: 0.18, H: 0.34, curve: 0.2, lift: 0.14, liftW: 0.35, thick: 0.1, ribW: 0.24, ribAmp: 0.03, course: 0, color });
}

// ------------------------------------------------------------------ farm field
export function farm(B, L) {
  // tilled soil bed
  const bed = G.box(2.7, 0.08, 2.1, 0.04); bed.translate(0, 0.04, 0.2); B.add(bed, '#8a6048');
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const z = -0.65 + r * 0.44;
    const ridge = G.cyl(0.13, 0.15, 2.45, 8); ridge.rotateZ(PI / 2); ridge.scale(1, 0.55, 1); ridge.translate(0, 0.1, z); B.add(ridge, (p, n, o) => o.set('#9a6a4e').lerp(col('#b88a64'), clamp(n.y)));
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = -1.05 + i * 2.1 / (n - 1);
      B.at([x + B.wob(0.04), 0.14, z + B.wob(0.03)], B.rand(0, TAU), () => {
        if (r === 1 || r === 3) carrot(B, 1.3);
        else if (r === 4 && L >= 2 && i % 2 === 0) pumpkin(B, 1.0);
        else cabbage(B, B.rand(0.9, 1.15));
      });
    }
  }
  // back fence + scarecrow + tools
  fence(B, [-1.4, -1.35], [1.4, -1.35], { style: 'rail', h: 0.5 });
  B.at([0.95, 0.08, -0.9], -0.4, () => scarecrow(B));
  B.at([-1.2, 0, 1.3], 0.4, () => bucket(B, { r: 0.12, h: 0.2, water: true }));
  B.at([1.25, 0, 1.3], 0, () => produce(B, { kind: 'veg', s: 0.34 }));
  if (L >= 2) {
    // little tool shed + harvest baskets
    B.at([-1.05, 0, -0.95], 0.1, () => {
      const w = 0.7, d = 0.55, h = 0.9;
      walls(B, { w, d, h, y0: 0.05, planks: '#b08a64', frame: C.woodMid });
      onFace(B, { w, d }, 'f', 0, 0.05, () => door(B, { w: 0.4, h: 0.7, style: 'wood' }));
      roof(B, { type: 'gable', w, d, y0: 0.95, over: 0.14, gOver: 0.12, H: 0.36, curve: 0.2, lift: 0.1, liftW: 0.25, thick: 0.08, ribW: 0.2, ribAmp: 0.025, course: 0, color: ROOFS.terracotta, vent: false, oni: false });
    });
    B.at([0.2, 0, 1.3], 0, () => produce(B, { kind: 'apple', s: 0.3 }));
    B.at([-0.5, 0, 1.32], 0, () => { pumpkin(B, 1.2); });
  }
  B.door.set(0, 0, 1.45);
  B.height = 2.0;
}

// ------------------------------------------------------------------ lumber workshop
export function lumber(B, L) {
  // work shed with sawhorse and a log being cut
  B.at([-0.35, 0, -0.45], 0, () => {
    openShed(B, { w: 1.6, d: 1.2, h: 1.55, color: ROOFS.moss });
    for (const sx of [-0.45, 0.45]) {
      for (const s of [-1, 1]) { const l = G.box(0.05, 0.62, 0.05, 0); l.rotateX(s * 0.3); l.translate(sx, 0.3, s * 0.08); B.add(l, C.woodDark); }
    }
    const log = G.cyl(0.14, 0.15, 1.3, 10); log.rotateZ(PI / 2); log.translate(0, 0.68, 0);
    B.add(log, (p, n, o) => { if (Math.abs(n.x) > 0.9) o.set('#f0cc98'); else o.set('#8a5e44'); });
    const saw = G.box(0.02, 0.28, 0.7, 0); saw.rotateX(0.3); saw.translate(0.2, 0.86, 0); B.add(saw, '#c8c8d0');
    for (const s of [-1, 1]) { const hd = G.cyl(0.02, 0.02, 0.18, 5); hd.translate(0.2, 0.95 + s * 0.05, s * 0.38); B.add(hd, C.woodLight); }
    // sawdust heap
    const dust = G.sph(0.3, 10, 5); dust.scale(1, 0.25, 0.8); dust.translate(0.1, 0.02, 0.3); B.add(dust, '#f0d8a8');
  });
  B.at([0.9, 0, -0.4], PI / 2, () => logPile(B, { n: 3, L: 1.3, r: 0.14 }));
  B.at([-1.0, 0, 0.9], 0, () => woodStack(B, { w: 0.7, h: 0.45, d: 0.4 }));
  B.at([0.35, 0, 0.85], 0, () => {
    const st = G.cyl(0.2, 0.24, 0.32, 10); st.translate(0, 0.16, 0); B.add(st, (p, n, o) => o.set(n.y > 0.8 ? '#f0cc98' : '#7a5040'));
    const ax = G.box(0.03, 0.4, 0.03, 0); ax.rotateZ(0.5); ax.translate(0.08, 0.45, 0); B.add(ax, C.woodLight);
    const head = G.box(0.14, 0.08, 0.02, 0); head.rotateZ(0.5); head.translate(-0.02, 0.62, 0); B.add(head, '#8a8a98');
  });
  // planks leaning
  for (let i = 0; i < 4; i++) { const p = G.box(0.14, 1.1, 0.03, 0); p.rotateX(-0.25); p.translate(1.1 - i * 0.16, 0.52, 0.55 + i * 0.02); B.add(p, B.pick(['#e2b988', '#d8a878', '#ecc898'])); }
  B.at([0.85, 1.2, 0.2], 0, () => {});
  if (L >= 2) {
    // water-driven circular saw on a frame (spinning blade) + cart
    B.at([0.05, 0, 0.35], 0, () => {
      const bench = G.box(1.0, 0.1, 0.4, 0.02); bench.translate(0, 0.62, 0); B.add(bench, C.woodMid);
      for (const x of [-0.42, 0.42]) for (const z of [-0.14, 0.14]) { const l = G.box(0.06, 0.62, 0.06, 0); l.translate(x, 0.31, z); B.add(l, C.woodDark); }
      B.anim({ p: [0, 0.72, 0], kind: 'spin', axis: [0, 0, 1], speed: 6 }, () => {
        const blade = G.cyl(0.24, 0.24, 0.015, 16); blade.rotateX(PI / 2); B.add(blade, '#d0d0d8');
        for (let k = 0; k < 8; k++) { const t = G.cone(0.03, 0.05, 3); t.rotateZ(-k / 8 * TAU); t.translate(Math.sin(k / 8 * TAU) * 0.25, Math.cos(k / 8 * TAU) * 0.25, 0); B.add(t, '#b0b0b8'); }
        const hub = G.cyl(0.05, 0.05, 0.04, 8); hub.rotateX(PI / 2); B.add(hub, C.gold);
      });
    });
    B.at([-1.1, 0, 0.2], PI / 2, () => {
      const bed = G.box(0.9, 0.08, 0.5, 0.02); bed.translate(0, 0.42, 0); B.add(bed, C.woodLight);
      for (const s of [-1, 1]) B.at([0, 0.3, s * 0.3], 0, () => wheel(B, { r: 0.24 }));
      B.at([0, 0.46, 0], 0, () => logPile(B, { n: 2, L: 0.8, r: 0.1 }), 1, 0, 0);
    });
  }
  B.at([-1.2, 1.3, -0.95], 0, () => {});
  B.at([-1.25, 0, -1.25], 0, () => signboard(B, { sym: 'log', w: 0.4, h: 0.4, style: 'stand', symSize: 0.32 }));
  B.door.set(0, 0, 1.45);
  B.height = 2.4;
}

// ------------------------------------------------------------------ pottery kiln (noborigama)
export function kiln(B, L) {
  const clay = '#d8a282', clayD = '#b07a60';
  // stepped climbing chambers (rounded humps) rising toward -z up a grassy slope
  const slope = puff(V(-0.45, -0.25, -0.45), 1.25, { detail: 2, noise: 0.08, squash: 0.45, seed: 9 }); slope.scale(0.75, 1, 1.25); slope.translate(-0.11, 0, 0.1);
  B.add(slope, (p, n, o) => o.set('#8cc070').lerp(col('#a8a0b0'), clamp(0.8 - n.y)));
  for (let i = 0; i < 3; i++) {
    const z = 0.5 - i * 0.62, y = 0.02 + i * 0.26, r = 0.5;
    const hump = G.sph(r, 14, 9, 0, TAU, 0, PI / 2); hump.scale(1, 0.95, 0.78); hump.translate(-0.45, y, z);
    B.add(hump, (p, n, o) => { o.set(clay).lerp(col('#e8b894'), clamp(n.y * 0.6)); const row = Math.floor((p.y - y) / 0.09); if (((p.y - y) % 0.09) < 0.012) o.multiplyScalar(0.82); void row; });
    const hole = G.disc(0.065, 8); hole.rotateY(PI / 2); hole.translate(0.06, y + 0.18, z); B.glow(hole, '#ff9a3a', { hot: true, tint: 1, flicker: 1 });
    const hr = G.torus(0.07, 0.022, 4, 10); hr.rotateY(PI / 2); hr.translate(0.055, y + 0.18, z); B.add(hr, clayD);
  }
  // firebox mouth at the front with glowing arch
  B.push([-0.45, 0.02, 0.98]);
  const fb = G.box(0.8, 0.55, 0.4, 0.08); fb.translate(0, 0.27, 0); B.add(fb, clayD);
  const arch = new THREE.Shape(); arch.moveTo(-0.18, 0); arch.lineTo(0.18, 0); arch.lineTo(0.18, 0.12); arch.absarc(0, 0.12, 0.18, 0, PI, false); arch.lineTo(-0.18, 0);
  const ag = new THREE.ShapeGeometry(arch, 8); ag.translate(0, 0.04, 0.205); B.glow(ag, '#ff8a2a', { hot: true, tint: 1, flicker: 1 });
  for (let i = 0; i < 5; i++) { const lg = G.cyl(0.035, 0.035, 0.3, 5); lg.rotateZ(PI / 2); lg.rotateY(B.wob(0.4)); lg.translate(B.wob(0.1), 0.06 + (i % 2) * 0.06, 0.32 + i * 0.03); B.add(lg, '#8a5e44'); }
  B.pop();
  // chimney at the top/back
  chimney(B, -0.45, -1.3, 0.5, 2.3, 1.0);
  B.light([-0.45, 0.6, 1.4], { color: '#ff8a3a', intensity: 3.8, radius: 5, flicker: 1, nightOnly: false });
  // pottery shed at the side with shelves
  B.at([0.85, 0, -0.35], 0, () => {
    openShed(B, { w: 1.1, d: 1.1, h: 1.45, color: ROOFS.terracotta });
    for (let t = 0; t < 2; t++) { const sh = G.box(0.9, 0.04, 0.3, 0); sh.translate(0, 0.45 + t * 0.4, -0.3); B.add(sh, C.woodLight); B.at([0, 0.47 + t * 0.4, -0.3], 0, () => pottery(B, { n: 4, spread: 0.3 })); }
    for (const x of [-0.42, 0.42]) { const l = G.box(0.04, 0.9, 0.3, 0); l.translate(x, 0.45, -0.3); B.add(l, C.woodMid); }
    const wheelT = G.cyl(0.2, 0.2, 0.05, 12); wheelT.translate(0, 0.55, 0.2); B.add(wheelT, C.woodDark);
    const legT = G.cyl(0.08, 0.14, 0.52, 8); legT.translate(0, 0.26, 0.2); B.add(legT, C.woodMid);
    const clayLump = G.lathe([[0.001, 0], [0.1, 0], [0.12, 0.08], [0.08, 0.16], [0.001, 0.16]], 10); clayLump.translate(0, 0.58, 0.2); B.add(clayLump, clay);
  });
  B.at([0.85, 0, 0.9], 0, () => pottery(B, { n: L >= 2 ? 6 : 3, spread: 0.3 }));
  B.at([1.25, 0, 1.25], 0, () => woodStack(B, { w: 0.4, h: 0.3, d: 0.25 }));
  if (L >= 2) {
    B.at([0.3, 0, 1.2], 0, () => { const t = G.box(0.7, 0.05, 0.36, 0.01); t.translate(0, 0.5, 0); B.add(t, C.woodLight); for (const x of [-0.3, 0.3]) { const l = G.box(0.04, 0.5, 0.3, 0); l.translate(x, 0.25, 0); B.add(l, C.woodMid); } B.at([0, 0.52, 0], 0, () => pottery(B, { n: 4, spread: 0.2 })); });
    B.at([-1.2, 0, 0.8], 0, () => barrel(B, { r: 0.16, h: 0.34 }));
    B.at([-1.25, 0, 0.3], 0, () => lanternPost(B, { h: 1.3, color: C.red }));
  }
  B.at([1.3, 0, 0.35], -PI / 2, () => signboard(B, { sym: 'vase', w: 0.36, h: 0.4, style: 'stand', symSize: 0.3 }));
  B.smokeAt([-0.45, 2.6, -1.3]);
  B.door.set(0.4, 0, 1.45);
  B.height = 2.8;
}

// ------------------------------------------------------------------ fishing hut (2x3)
export function fishingHut(B, L) {
  const w = 1.5, d = 1.25, h = 1.35, y0 = 0.36, zc = -0.7;
  B.push([0, 0, zc]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = G.cyl(0.06, 0.07, y0, 6); s.translate(sx * (w / 2 - 0.08), y0 / 2, sz * (d / 2 - 0.08)); B.add(s, C.woodDark); }
  const floor = G.box(w + 0.1, 0.08, d + 0.1, 0.02); floor.translate(0, y0 - 0.02, 0); B.add(floor, C.woodMid);
  walls(B, { w, d, h, y0, planks: '#8aa0b0', frame: '#5a6a7a' });
  onFace(B, { w, d }, 'f', -0.25, y0, () => { door(B, { w: 0.62, h: 1.1, style: 'wood', wood: '#b0c0c8', frame: '#5a6a7a' }); noren(B, { w: 0.6, h: 0.36, y: 1.14, z: 0.14, color: '#3a6a9a', strips: 2, symbol: () => flatSymbol('fish'), symScale: 0.16 }); });
  onFace(B, { w, d }, 'r', 0, y0 + 0.75, () => shoji(B, { w: 0.5, h: 0.4, frame: '#5a6a7a' }));
  onFace(B, { w, d }, 'f', 0.45, y0 + 0.8, () => shoji(B, { w: 0.34, h: 0.34, frame: '#5a6a7a' }));
  const info = roof(B, { type: 'gable', ridge: 'z', w, d, y0: y0 + h, over: 0.28, gOver: 0.22, H: 0.72, curve: 0.3, lift: 0.14, liftW: 0.4, thick: 0.12, ribW: 0.24, ribAmp: 0.035, color: ROOFS.teal, moss: 0.3 });
  const step = G.box(0.6, 0.08, 0.3, 0.02); step.translate(-0.25, 0.18, d / 2 + 0.18); B.add(step, C.woodLight);
  B.at([0.5, y0 + h - 0.05, d / 2 + 0.2], 0, () => chochin(B, { r: 0.09, h: 0.18, cord: 0.04, color: '#fff0d0' }));
  B.pop();
  // net drying frame (left) + fish rack + boat + barrels
  B.at([-0.72, 0, 0.4], PI / 2, () => {
    for (const s of [-1, 1]) { const p = G.cyl(0.035, 0.04, 1.5, 5); p.translate(s * 0.5, 0.75, 0); B.add(p, C.woodMid); }
    const bar = G.cyl(0.025, 0.025, 1.12, 5); bar.rotateZ(PI / 2); bar.translate(0, 1.45, 0); B.add(bar, C.woodMid);
    net(B, { w: 0.95, h: 0.95, yTop: 1.42 });
  });
  B.at([0.45, 0, 0.55], 0, () => fishRack(B, { w: 0.8, n: 4 }));
  if (L < 2) B.at([0.05, 0, 1.15], 0.15, () => boat(B, { L: 1.1 }));
  B.at([0.75, 0, -1.3], 0, () => barrel(B, { r: 0.15, h: 0.32, wood: '#a8b8c0' }));
  B.at([-0.75, 0, -1.3], 0, () => bucket(B, { r: 0.12, h: 0.18, water: true }));
  // fishing rods leaning on the hut
  for (let i = 0; i < 2; i++) { const r = G.cyl(0.012, 0.018, 1.8, 4); r.rotateX(-0.25); r.rotateZ(0.08 * i); r.translate(0.82 + i * 0.08, 0.88, -0.15); B.add(r, '#c8a868'); }
  if (L >= 2) {
    // little jetty deck along the front with posts, a lantern and crab pots
    for (let i = 0; i < 13; i++) { const pl = G.box(0.14, 0.06, 0.5, 0.01); pl.translate(-0.9 + i * 0.15, 0.3, 1.2); B.add(pl, B.pick([C.woodLight, '#b88a60', '#d8a878'])); }
    for (const x of [-0.9, 0, 0.9]) { const p = G.cyl(0.05, 0.06, 0.5, 6); p.translate(x, 0.22, 1.42); B.add(p, C.woodDark); }
    B.at([0.8, 0.33, 1.2], 0, () => lanternPost(B, { h: 1.0, color: '#fff0d0', arm: false }));
    B.at([0.8, 1.3, 1.2], 0, () => chochin(B, { r: 0.08, h: 0.16, cord: 0.02, color: '#fff0d0' }));
    for (const x of [-0.6, -0.3]) B.at([x, 0.33, 1.2], 0, () => { const c = G.cyl(0.11, 0.13, 0.16, 8, true); c.translate(0, 0.08, 0); B.add(c, '#c8b078'); const r2 = G.torus(0.12, 0.015, 3, 10); r2.rotateX(PI / 2); r2.translate(0, 0.08, 0); B.add(r2, C.woodDark); });
    B.at([0.1, 0.33, 1.25], 0.3, () => bucket(B, { r: 0.1, h: 0.14, water: true }));
  }
  B.light([0.3, 1.4, 0.2], { ...LAMP, intensity: 2.6, radius: 5 });
  B.door.set(-0.25, 0, 0.1);
  B.height = 2.7;
}
