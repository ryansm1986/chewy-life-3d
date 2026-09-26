// Shops (zone C). L1 food stall 2x2 (tea / onigiri / taiyaki), L2 machiya shop 3x3 (bakery / café / flowers / toys),
// L3 two-storey 3x3 (teahouse / department store). Variant = seed mod 8.
import * as THREE from 'three';
import { C, G, V, PI, ROOFS, ROOF_LIST, WALL_TINTS, shade, col } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, chimney, stepStones, flowerBox, hood, fence, STONES, FLOWERS } from './parts.js';
import { chochin, pot, barrel, crate, produce, bush, tree, flowerPatch, signboard, lanternPost } from './props.js';
import { nobori, awning, parasol, teaBench, stool, cafeTable, cake, cupcake, donut, wheel, bucket, pinwheel, pottery } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { TAU } from '../../core/util.js';

// ------------------------------------------------------------------ L1: food stall cart
const STALLS = [
  { name: 'tea', sym: 'teacup', noren: '#4f8a5a', roof: ROOFS.moss },
  { name: 'onigiri', sym: 'onigiri', noren: '#f4efe6', symCol: '#2a3a30', roof: ROOFS.slate },
  { name: 'taiyaki', sym: 'taiyaki', noren: C.indigo, roof: ROOFS.terracotta },
];
export function shopL1(B) {
  const v = B.variant, S = STALLS[v % 3];
  const cz = -0.25, cw = 1.3, cd = 0.6, ch = 0.8;
  B.push([0, 0, cz], B.wob(0.04));
  // counter cart
  const body = G.box(cw, ch - 0.25, cd, 0.04); body.translate(0, 0.25 + (ch - 0.25) / 2, 0); B.add(body, C.woodLight);
  for (let i = 1; i < 6; i++) { const pl = G.box(0.02, ch - 0.3, 0.01, 0); pl.translate(-cw / 2 + i * cw / 6, 0.25 + (ch - 0.25) / 2, cd / 2 + 0.005); B.add(pl, shade(C.woodLight, 0.8)); }
  const top = G.box(cw + 0.14, 0.06, cd + 0.16, 0.02); top.translate(0, ch, 0.02); B.add(top, C.woodMid);
  const sk = G.box(cw + 0.04, 0.08, cd + 0.04, 0.02); sk.translate(0, 0.27, 0); B.add(sk, C.woodMid);
  for (const sx of [-1, 1]) B.at([sx * (cw / 2 + 0.05), 0.3, 0], PI / 2, () => wheel(B, { r: 0.28 }));
  const handle = G.box(0.05, 0.05, 0.7, 0); handle.rotateX(-0.25); handle.translate(cw / 2 - 0.05, 0.55, -0.55); B.add(handle, C.woodMid);
  // posts + roof
  const pT = 1.78;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.06, pT - ch, 0.06, 0); p.translate(sx * (cw / 2 - 0.04), ch + (pT - ch) / 2, sz * (cd / 2 - 0.04)); B.add(p, C.woodMid); }
  const info = roof(B, { type: 'gable', w: cw - 0.05, d: cd, y0: pT, over: 0.24, gOver: 0.16, H: 0.42, curve: 0.25, lift: 0.12, liftW: 0.35, thick: 0.1, ribW: 0.2, ribAmp: 0.03, course: 0, color: S.roof, vent: false, oni: false });
  // short noren along the front eave
  B.at([0, 0, cd / 2 + 0.2], 0, () => noren(B, { w: cw + 0.2, h: 0.3, y: pT - 0.06, z: 0.02, color: S.noren, strips: 4, hem: 0.05, hemColor: S.name === 'onigiri' ? '#c83a3a' : '#f4efe6', symbol: () => flatSymbol(S.sym), symScale: 0.2, symColor: S.symCol || '#fff6ea' }));
  // kanban on the ridge
  B.at([0, info.ridgeY + 0.2, 0], 0, () => {
    const p = G.box(0.05, 0.25, 0.05, 0); p.translate(0, -0.12, 0); B.add(p, C.woodDark);
    signboard(B, { sym: S.sym, w: 0.56, h: 0.36, symSize: 0.3, symColors: S.name === 'onigiri' ? ['#ffffff', '#2a3a30'] : undefined });
  });
  for (const sx of [-1, 1]) B.at([sx * (cw / 2 + 0.08), pT - 0.02, cd / 2 + 0.12], 0, () => chochin(B, { r: 0.09, h: 0.18, cord: 0.06, color: S.name === 'tea' ? '#e8e0c8' : C.red }));
  // wares on the counter
  B.push([0, ch + 0.03, 0.05]);
  if (S.name === 'tea') {
    const pot2 = G.sph(0.11, 10, 8); pot2.scale(1, 0.85, 1); pot2.translate(-0.3, 0.09, 0); B.add(pot2, '#6a8a6a');
    const sp = G.cyl(0.015, 0.03, 0.12, 5); sp.rotateZ(-0.9); sp.translate(-0.18, 0.12, 0); B.add(sp, '#6a8a6a');
    const hd = G.torus(0.07, 0.012, 3, 10, PI); hd.translate(-0.3, 0.2, 0); B.add(hd, C.woodDark);
    for (let i = 0; i < 4; i++) { const c = G.cyl(0.035, 0.028, 0.05, 8); c.translate(0.05 + i * 0.11, 0.025, 0.08 * (i % 2)); B.add(c, '#fff6ea'); const tea = G.cyl(0.03, 0.03, 0.005, 8); tea.translate(0.05 + i * 0.11, 0.05, 0.08 * (i % 2)); B.add(tea, '#8fc070'); }
    const tray = G.box(0.5, 0.02, 0.26, 0.005); tray.translate(0.2, 0, 0.04); B.add(tray, '#c83a3a');
  } else if (S.name === 'onigiri') {
    const plate = G.cyl(0.24, 0.22, 0.03, 12); plate.translate(-0.15, 0.015, 0); B.add(plate, '#e8f0f4');
    const ball = (x, y, z, r) => {
      const g = G.sph(r, 8, 6); g.scale(1, 0.95, 0.6);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); p.setX(i, p.getX(i) * (1 - (yy / r + 1) * 0.28)); }
      g.computeVertexNormals(); g.translate(x, y, z); B.add(g, '#ffffff');
      const nori = G.box(r * 0.9, r * 0.8, r * 1.25, 0); nori.translate(x, y - r * 0.45, z); B.add(nori, '#2a3a30');
    };
    ball(-0.26, 0.1, 0, 0.08); ball(-0.08, 0.1, 0, 0.08); ball(-0.17, 0.23, 0, 0.075); ball(0.2, 0.08, 0.05, 0.07); ball(0.36, 0.08, -0.02, 0.07);
  } else {
    const grill = G.box(0.62, 0.1, 0.34, 0.02); grill.translate(-0.05, 0.05, 0); B.add(grill, C.iron);
    for (let i = 0; i < 4; i++) B.at([-0.28 + i * 0.15, 0.11, 0.02], 0, () => symbol(B, 'taiyaki', 0.16, { depth: 0.03 }), 1, -PI / 2);
    const glowC = G.box(0.56, 0.02, 0.28, 0); glowC.translate(-0.05, 0.004, 0); B.glow(glowC, '#ff8a3a', { hot: true, tint: 1, flicker: 1 });
    for (let i = 0; i < 3; i++) B.at([0.38, 0.02 + i * 0.03, 0.05], 0.3 * i, () => symbol(B, 'taiyaki', 0.14, { depth: 0.03 }), 1, -PI / 2);
  }
  B.pop();
  B.pop();
  // customer side props
  if (S.name === 'tea') {
    B.at([-0.25, 0, 0.72], 0, () => teaBench(B, { w: 0.95 }));
    B.at([0.72, 0, 0.62], 0, () => parasol(B, { r: 0.46, h: 1.35, color: '#e8604a' }));
  } else {
    for (const x of [-0.4, 0.3]) B.at([x, 0, 0.5], B.rand(0, 1), () => stool(B, S.name === 'onigiri' ? '#e8c898' : '#c86a4a'));
    B.at([0.75, 0, 0.72], 0, () => (S.name === 'onigiri' ? crate(B, { s: 0.28 }) : barrel(B, { r: 0.15, h: 0.32 })));
  }
  B.at([-0.8, 0, -0.75], 0, () => crate(B, { s: 0.26 }));
  B.light([0, 1.4, 0.6], { ...LAMP, intensity: 2.8, radius: 5 });
  B.door.set(0, 0, 0.95);
  B.height = 2.5;
}

// ------------------------------------------------------------------ L2: machiya shop with noren
const SHOPS2 = [
  { name: 'bakery', sym: 'bread', noren: '#b0603a', roof: ROOFS.terracotta, wall: '#fff3e0' },
  { name: 'cafe', sym: 'teacup', noren: '#4a6a8a', roof: ROOFS.teal, wall: '#f6f1ff' },
  { name: 'flower', sym: 'flower', noren: '#5a9a5a', roof: ROOFS.moss, wall: '#fff0e8' },
  { name: 'toy', sym: 'toy', noren: '#c84a6a', roof: ROOFS.plum, wall: '#fff7e6' },
];
export function shopL2(B) {
  const v = B.variant, S = SHOPS2[v % 4];
  const w = 2.4, d = 1.55, h = 1.55, y0 = 0.26, zc = -0.62;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: S.wall, koshi: '#c9a27a', koshiSkip: ['f'] });
  const blk = { w, d };
  // wide shop front: lattice doors + big noren
  onFace(B, blk, 'f', -0.2, y0, () => {
    door(B, { w: 1.5, h: 1.3, style: 'lattice' });
    noren(B, { w: 1.44, h: 0.48, y: 1.36, z: 0.17, color: S.noren, strips: 4, symbol: () => flatSymbol(S.sym), symScale: 0.26 });
  });
  onFace(B, blk, 'f', 0.88, y0 + 0.78, () => shoji(B, { w: 0.42, h: 0.6 }));
  onFace(B, blk, 'r', 0, y0 + 0.84, () => shoji(B, { w: 0.7, h: 0.5, box: true }));
  onFace(B, blk, 'l', 0, y0 + 0.84, () => roundWindow(B, { r: 0.26, lattice: 'fine' }));
  onFace(B, blk, 'b', 0, y0 + 0.84, () => shoji(B, { w: 0.8, h: 0.5 }));
  const info = roof(B, { type: v % 2 ? 'irimoya' : 'gable', w, d, y0: y0 + h, over: 0.4, gOver: 0.3, H: 0.9, curve: 0.4, lift: 0.26, liftW: 0.7, thick: 0.15, ribW: 0.27, color: S.roof, gable: 'plaster', gableColor: S.wall, tg: 0.5 });
  // front hood roof over the display
  onFace(B, blk, 'f', 0, y0 + h - 0.12, () => B.at([0, 0, 0.27], 0, () => roof(B, { type: 'shed', w: w + 0.1, d: 0.52, y0: -0.06, over: 0.12, gOver: 0.1, H: 0.2, curve: 0.2, lift: 0.1, liftW: 0.35, thick: 0.08, ribW: 0.24, ribAmp: 0.03, course: 0, color: S.roof })));
  // standing kanban on the roof front
  B.at([0.1, info.ridgeY - 0.3, d / 2 + 0.28], 0, () => {
    const p = G.box(0.06, 0.4, 0.06, 0); p.translate(0, -0.22, -0.1); B.add(p, C.woodDark);
    signboard(B, { sym: S.sym, w: 0.74, h: 0.5, symSize: 0.42, color: '#fff6e8' });
  });
  for (const sx of [-1, 1]) B.at([sx * (w / 2 - 0.12), y0 + h - 0.2, d / 2 + 0.52], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.02, color: S.name === 'cafe' ? '#fff0d0' : C.red }));
  if (S.name === 'bakery') chimney(B, 0.7, -0.3, info.yAt(0.7, -0.3) - 0.2, info.ridgeY + 0.1, 0.9);
  B.pop();
  const fz = zc + d / 2;
  // outside displays per shop
  if (S.name === 'bakery') {
    B.at([-0.3, 0, fz + 0.5], 0, () => {
      const t = G.box(1.3, 0.06, 0.4, 0.02); t.translate(0, 0.55, 0); B.add(t, C.woodLight);
      for (const x of [-0.58, 0.58]) for (const z of [-0.15, 0.15]) { const l = G.box(0.05, 0.55, 0.05, 0); l.translate(x, 0.27, z); B.add(l, C.woodMid); }
      for (let i = 0; i < 3; i++) {
        const bk = G.cyl(0.17, 0.13, 0.1, 10, true); bk.translate(-0.4 + i * 0.4, 0.63, 0); B.add(bk, '#c8a070');
        for (let k = 0; k < 3; k++) { const br = G.sph(0.07, 8, 5); br.scale(1.4, 0.7, 0.9); br.rotateY(k); br.translate(-0.4 + i * 0.4 + B.wob(0.05), 0.69 + k * 0.02, B.wob(0.05)); B.add(br, B.pick(['#d89050', '#e8b070', '#c87a3a'])); }
      }
    });
    B.at([1.1, 0, fz + 0.5], 0, () => { const sack = G.sph(0.18, 8, 6); sack.scale(1, 1.3, 0.9); sack.translate(0, 0.22, 0); B.add(sack, '#f4ead8'); const sack2 = G.sph(0.15, 8, 6); sack2.scale(1, 1.2, 0.9); sack2.translate(0.22, 0.18, 0.1); B.add(sack2, '#ece0c8'); });
  } else if (S.name === 'cafe') {
    B.at([-0.75, 0, fz + 0.72], 0, () => cafeTable(B, { cloth: '#fff6ea', umbrella: '#6aa8d8' }));
    B.at([0.65, 0, fz + 0.72], 0, () => cafeTable(B, { cloth: '#e8f4ff' }));
    B.at([1.25, 0, fz + 0.3], -0.4, () => signboard(B, { sym: 'cake', w: 0.36, h: 0.44, style: 'aframe', color: '#3a4a44', frame: C.woodLight, symSize: 0.26 }));
  } else if (S.name === 'flower') {
    B.at([-0.35, 0, fz + 0.42], 0, () => {
      for (let t = 0; t < 3; t++) { const s2 = G.box(1.3, 0.05, 0.22, 0.01); s2.translate(0, 0.2 + t * 0.2, -t * 0.16 + 0.16); B.add(s2, C.woodLight); }
      for (const x of [-0.62, 0.62]) { const l = G.box(0.05, 0.62, 0.52, 0); l.translate(x, 0.31, 0); B.add(l, C.woodMid); }
      for (let t = 0; t < 3; t++) for (let i = 0; i < 4; i++) B.at([-0.45 + i * 0.3, 0.225 + t * 0.2, -t * 0.16 + 0.16], 0, () => pot(B, { r: 0.08, h: 0.11, color: B.pick(['#d4774e', '#e8e0d0', '#7a9ac8']), plant: 'flowers', flowers: [B.pick(FLOWERS), B.pick(FLOWERS)] }));
    });
    for (const [x, c] of [[0.75, '#ff8fb0'], [1.1, '#ffd24a']]) B.at([x, 0, fz + 0.55], 0, () => { bucket(B, { r: 0.13, h: 0.24, color: '#8aa0b8' }); B.at([0, 0.2, 0], 0, () => bush(B, { r: 0.14, color: '#5aa84a', flowers: [c, '#ffffff'], n: 2 })); });
  } else {
    for (const [x, z] of [[-0.9, fz + 0.45], [-0.6, fz + 0.75], [1.15, fz + 0.5]]) B.at([x, 0, z], 0, () => pinwheel(B, { h: B.rand(0.8, 1.05) }));
    B.at([0.3, 0, fz + 0.5], 0, () => {
      const t = G.box(1.0, 0.5, 0.36, 0.03); t.translate(0, 0.25, 0); B.add(t, '#ffd8a8');
      const balls = [['#ff6f7f', 0.1], ['#6ab0ff', 0.08], ['#ffd24a', 0.09], ['#8fe0c0', 0.07]];
      balls.forEach(([c, r], i) => { const b = G.sph(r, 10, 8); b.translate(-0.35 + i * 0.23, 0.5 + r, B.wob(0.06)); B.add(b, (p, n, o) => o.set(c).lerp(col('#ffffff'), Math.abs(p.y - 0.5 - r) < r * 0.2 ? 0.7 : 0)); });
      for (let i = 0; i < 3; i++) { const bl = G.box(0.1, 0.1, 0.1, 0.02); bl.translate(0.3 + B.wob(0.04), 0.1 + i * 0.1, 0.2); B.add(bl, B.pick(['#ff8fb0', '#6ab0ff', '#ffd24a'])); }
    });
  }
  stepStones(B, -0.2, fz + 0.2, -0.2, 1.4, 2);
  B.light([0, 1.4, fz + 0.8], LAMP);
  B.door.set(-0.2, 0, 1.4);
  B.height = 3.8;
}

// ------------------------------------------------------------------ L3: teahouse / department store (two storeys)
export function shopL3(B) {
  const v = B.variant, tea = v % 2 === 0;
  const roofCol = tea ? ROOFS.slate : ROOFS.teal, wall = tea ? '#fff3e0' : '#f6f1ff';
  const w = 2.5, d = 1.9, h = 1.5, y0 = 0.3, zc = -0.45;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, koshi: tea ? '#b88e6a' : null, koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => {
    door(B, { w: 1.3, h: 1.3, style: tea ? 'lattice' : 'shoji' });
    noren(B, { w: 1.24, h: 0.5, y: 1.36, z: 0.18, color: tea ? '#c83a3a' : C.indigo, strips: 4, symbol: () => flatSymbol(tea ? 'dango' : 'coin'), symScale: 0.3, symColor: tea ? '#fff6ea' : C.gold });
  });
  for (const u of [-0.95, 0.95]) onFace(B, blk, 'f', u, y0 + 0.82, () => shoji(B, { w: 0.4, h: 0.6 }));
  onFace(B, blk, 'r', 0, y0 + 0.84, () => shoji(B, { w: 1.0, h: 0.52 }));
  onFace(B, blk, 'l', 0, y0 + 0.84, () => shoji(B, { w: 1.0, h: 0.52 }));
  onFace(B, blk, 'b', 0, y0 + 0.84, () => shoji(B, { w: 1.0, h: 0.52 }));
  const low = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.38, H: 0.7, curve: 0.35, lift: 0.24, liftW: 0.6, thick: 0.13, ribW: 0.27, color: roofCol, tTop: 0.48, skip: tea ? ['f'] : [] });
  const y2 = low.topY, w2 = 2.1, d2 = 1.35, h2 = 1.3, z2 = -0.1;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, cz: z2, plaster: wall });
  const blk2 = { w: w2, d: d2, cz: z2 };
  if (tea) onFace(B, blk2, 'f', 0, y2 + 0.04, () => door(B, { w: 1.5, h: 1.05, style: 'shoji' }));
  else for (const u of [-0.6, 0, 0.6]) onFace(B, blk2, 'f', u, y2 + 0.68, () => shoji(B, { w: 0.44, h: 0.62, cell: 0.15 }));
  onFace(B, blk2, 'r', 0, y2 + 0.68, () => shoji(B, { w: 0.8, h: 0.52 }));
  onFace(B, blk2, 'l', 0, y2 + 0.68, () => shoji(B, { w: 0.8, h: 0.52 }));
  onFace(B, blk2, 'b', 0, y2 + 0.68, () => shoji(B, { w: 0.8, h: 0.52 }));
  B.push([0, 0, z2]);
  const top = roof(B, { type: 'irimoya', w: w2, d: d2, y0: y2 + h2, over: 0.46, H: 1.0, curve: 0.45, lift: 0.34, liftW: 0.8, thick: 0.16, ribW: 0.28, color: roofCol, gable: 'ornate', tg: 0.48 });
  B.pop();
  if (tea) {
    // balcony with lantern string and red rail
    const zb0 = z2 + d2 / 2, zb1 = d / 2 + 0.45, bw = w + 0.16, by = y2;
    const fr = G.box(w + 0.04, by - (y0 + h) + 0.08, 0.12, 0.02); fr.translate(0, (by + y0 + h) / 2 - 0.04, d / 2 - 0.04); B.add(fr, C.timber);
    const deck = G.box(bw, 0.12, zb1 - zb0, 0.03); deck.translate(0, by - 0.06, (zb0 + zb1) / 2); B.add(deck, C.woodLight);
    const fa = G.box(bw + 0.04, 0.16, 0.1, 0.03); fa.translate(0, by - 0.1, zb1); B.add(fa, C.vermilion);
    posts(B, [-bw / 2 + 0.08, bw / 2 - 0.08], zb1 - 0.08, by - 0.12, C.vermilion, 0.065);
    const rail = G.box(bw + 0.04, 0.06, 0.07, 0.02); rail.translate(0, by + 0.46, zb1); B.add(rail, C.vermilion);
    for (const sx of [-1, 1]) { const r2 = G.box(0.07, 0.06, zb1 - zb0, 0.02); r2.translate(sx * bw / 2, by + 0.46, (zb0 + zb1) / 2); B.add(r2, C.vermilion); }
    for (let i = 0; i <= 10; i++) { const b = G.box(0.035, 0.46, 0.035, 0); b.translate(-bw / 2 + i * bw / 10, by + 0.23, zb1); B.add(b, C.vermilion); }
    for (let i = 0; i < 5; i++) { const x = -bw / 2 + 0.25 + i * (bw - 0.5) / 4; B.at([x, by + 1.05 - Math.sin((i / 4) * PI) * 0.12, zb1 - 0.02], 0, () => chochin(B, { r: 0.08, h: 0.16, cord: 0.02, color: i % 2 ? C.pink : C.red })); }
    const ropePts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; ropePts.push(new THREE.Vector3(-bw / 2 + 0.1 + t * (bw - 0.2), by + 1.08 - Math.sin(t * PI) * 0.12, zb1 - 0.02)); }
    for (let k = 0; k < 10; k++) { const b = G.box(0.012, 0.012, ropePts[k].distanceTo(ropePts[k + 1]), 0); const m = new THREE.Matrix4().lookAt(ropePts[k], ropePts[k + 1], V(0, 1, 0)); b.applyMatrix4(m); b.translate((ropePts[k].x + ropePts[k + 1].x) / 2, (ropePts[k].y + ropePts[k + 1].y) / 2, ropePts[k].z); B.add(b, C.ink); }
    B.at([0, top.ridgeY - 0.35, z2 + d2 / 2 + 0.45], 0, () => signboard(B, { sym: 'dango', w: 0.46, h: 0.66, symSize: 0.54, color: '#fff6e8', frame: C.vermilion }));
  } else {
    // department store: striped awnings, corner vertical sign, banners, flags
    onFace(B, blk, 'f', 0, y0 + h - 0.05, () => awning(B, { w: w + 0.06, d: 0.46, y: 0, drop: 0.26, colors: ['#4a78c8', '#fff6f0'], n: 12 }));
    B.at([w / 2 + 0.08, y0 + h + 0.5, d / 2 - 0.1], PI / 2, () => {
      const bd = G.box(0.42, 1.3, 0.08, 0.03); B.add(bd, '#fff6e8');
      const fr = G.box(0.48, 1.36, 0.05, 0.03); fr.translate(0, 0, -0.03); B.add(fr, C.indigo);
      for (const [y, sym] of [[0.38, 'coin'], [-0.05, 'star'], [-0.42, 'heart']]) B.at([0, y, 0.04], 0, () => symbol(B, sym, 0.3));
    });
    B.at([0, top.ridgeY + 0.25, z2], 0, () => {
      const p = G.cyl(0.02, 0.02, 0.8, 5); p.translate(0, 0.2, 0); B.add(p, C.woodDark);
      const fl = G.plane(0.4, 0.26, 3, 2); fl.translate(0.21, 0.46, 0); B.cloth(fl, '#ff8fb0', { x0: 0, x1: 0.42, yTop: 0.59, yBot: 0.33 });
    });
  }
  B.pop();
  // street-side
  if (tea) {
    B.at([-0.9, 0, 1.05], 0, () => teaBench(B, { w: 0.9 }));
    B.at([-1.2, 0, 0.55], 0, () => parasol(B, { r: 0.7, h: 1.6, color: '#e84a4a' }));
    B.at([1.1, 0, 1.1], 0, () => lanternPost(B, { h: 1.3, color: C.red }));
  } else {
    B.at([-1.25, 0, 1.15], 0, () => nobori(B, { h: 2.1, w: 0.36, color: '#ff8fb0', sym: 'star' }));
    B.at([1.25, 0, 1.15], PI, () => nobori(B, { h: 2.1, w: 0.36, color: C.indigo, sym: 'coin' }));
    B.at([0.8, 0, 1.0], 0, () => produce(B, { kind: 'apple', s: 0.3 }));
    B.at([-0.8, 0, 1.0], 0, () => produce(B, { kind: 'flower', s: 0.3 }));
  }
  stepStones(B, 0, zc + d / 2 + 0.55, 0, 1.45, 2);
  B.light([0, 1.3, 1.0], { ...LAMP, intensity: 3.4, radius: 6 });
  B.door.set(0, 0, 1.45);
  B.height = 4.6;
}
