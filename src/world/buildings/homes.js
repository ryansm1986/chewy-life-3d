// Homes (zone R): L1 tiny cottage 2x2, L2 porch house 3x3, L3 two-storey blossom villa 3x3.
// Variant (seed mod 8) picks roof style/colour, wall tint, door, windows and yard props.
import { C, G, PI, ROOF_LIST, WALL_TINTS, ROOFS } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, chimney, stepStones, flowerBox, hood, fence, FLOWERS } from './parts.js';
import { chochin, pot, barrel, crate, bush, tree, flowerPatch } from './props.js';
import { flatSymbol } from './symbols.js';

export const LAMP = { color: '#ffb468', intensity: 3.2, radius: 5.5, flicker: 0.6, nightOnly: true };
const mossOf = c => (c === ROOFS.slate || c === ROOFS.teal || c === ROOFS.moss ? 0.35 : 0.05);

// small yard props at [x,z] spots
export function yardProps(B, spots) {
  for (const [x, z] of spots) {
    const k = B.int(0, 5);
    B.at([x, 0, z], B.rand(0, PI * 2), () => {
      if (k === 0) pot(B, { plant: 'flowers', flowers: [B.pick(FLOWERS), B.pick(FLOWERS)] });
      else if (k === 1) barrel(B, { r: 0.16, h: 0.34 });
      else if (k === 2) crate(B, { s: 0.3 });
      else if (k === 3) bush(B, { r: 0.26, flowers: B.chance(0.6) ? [B.pick(FLOWERS)] : null });
      else if (k === 4) pot(B, { plant: 'pine', r: 0.15, color: '#7a8aa8' });
      else flowerPatch(B, { w: 0.5, d: 0.4, n: 6 });
    });
  }
}

export function homeL1(B) {
  const v = B.variant;
  const roofCol = ROOF_LIST[(v * 3 + 1) % 5], wall = WALL_TINTS[(v * 5 + 2) % WALL_TINTS.length];
  const w = 1.42, d = 1.2, h = 1.4, y0 = 0.24, zc = -0.14;
  const style = v % 3; // 0 hip, 1 gable facing front, 2 gable along x
  const side = v & 1 ? 1 : -1;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  const koshi = v % 4 < 2 ? B.pick(['#c9a27a', '#b88e6a', '#d8b48a']) : null;
  walls(B, { w, d, h, y0, plaster: wall, koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.3;
  const dstyle = ['shoji', 'round', 'wood'][(v >> 1) % 3];
  onFace(B, blk, 'f', dx, y0, () => {
    door(B, { w: 0.62, h: 1.12, style: dstyle });
    if (style !== 1) hood(B, 0.95, 1.28, roofCol);
  });
  onFace(B, blk, 'f', -side * 0.36, y0 + 0.84, () => shoji(B, { w: 0.44, h: 0.42, box: true }));
  onFace(B, blk, 'r', 0, y0 + 0.84, () => (v % 2 ? roundWindow(B, { r: 0.24, lattice: 'fine', box: true }) : shoji(B, { w: 0.56, h: 0.44, box: true })));
  onFace(B, blk, 'l', 0.1, y0 + 0.84, () => shoji(B, { w: 0.5, h: 0.42 }));
  onFace(B, blk, 'b', 0, y0 + 0.84, () => shoji(B, { w: 0.5, h: 0.42 }));
  const info = roof(B, {
    type: style === 0 ? 'hip' : 'gable', ridge: style === 1 ? 'z' : 'x', w, d, y0: y0 + h,
    over: 0.34, gOver: 0.24, H: style === 0 ? 0.72 : 0.7, curve: 0.4, lift: 0.18, liftW: 0.5, thick: 0.13,
    ribW: 0.24, ribAmp: 0.035, course: 0.28, courseAmp: 0.028, color: roofCol, moss: mossOf(roofCol),
  });
  if (v % 2 === 0) chimney(B, -side * 0.35, -0.26, info.yAt(-side * 0.35, -0.26) - 0.25, info.ridgeY + 0.02, 0.85);
  B.at([dx + side * 0.48, y0 + h + 0.02, d / 2 + 0.22], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.08, color: v % 4 === 3 ? C.pink : C.red }));
  B.light([dx + side * 0.48, 1.25, d / 2 + 0.3], LAMP);
  B.pop();
  stepStones(B, dx, zc + d / 2 + 0.3, dx + 0.1, 0.98, 2);
  yardProps(B, [[-side * 0.72, 0.72], [side * 0.8, -0.8]]);
  if (v % 3 === 1) B.at([-side * 0.2, 0, 0.78], 0, () => flowerPatch(B, { w: 0.5, d: 0.3, n: 6 }));
  B.door.set(dx, 0, 0.95);
  B.height = info.ridgeY + 0.35;
}

export function homeL2(B) {
  const v = B.variant;
  const roofCol = ROOF_LIST[(v * 2 + 3) % 5], wall = WALL_TINTS[(v * 3 + 1) % WALL_TINTS.length];
  const w = 2.3, d = 1.7, h = 1.5, y0 = 0.3, zc = -0.52;
  const side = v & 1 ? 1 : -1;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, koshi: v % 3 === 0 ? '#c9a27a' : null, koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.42;
  onFace(B, blk, 'f', dx, y0, () => {
    door(B, { w: 0.9, h: 1.28, style: v % 2 ? 'lattice' : 'shoji' });
    if (v % 3 !== 1) noren(B, { w: 0.84, h: 0.42, y: 1.34, z: 0.16, color: [C.indigo, '#7a4a6a', '#3f6f5a', '#8a5040'][v % 4], strips: 2, symbol: () => flatSymbol(['sakura', 'leaf', 'flower', 'heart'][v % 4]), symScale: 0.18 });
  });
  onFace(B, blk, 'f', -side * 0.55, y0 + 0.8, () => shoji(B, { w: 0.78, h: 0.55 }));
  onFace(B, blk, 'r', -0.1, y0 + 0.84, () => shoji(B, { w: 0.62, h: 0.5, box: true }));
  onFace(B, blk, 'l', 0, y0 + 0.88, () => roundWindow(B, { r: 0.28, lattice: 'fine' }));
  onFace(B, blk, 'b', 0.4, y0 + 0.84, () => shoji(B, { w: 0.6, h: 0.5 }));
  onFace(B, blk, 'b', -0.5, y0 + 0.84, () => shoji(B, { w: 0.5, h: 0.5 }));
  const type = ['hip', 'irimoya', 'gable', 'irimoya'][v % 4];
  const info = roof(B, {
    type, w, d, y0: y0 + h, over: 0.42, gOver: 0.3, H: 0.95, curve: 0.42, lift: 0.26, liftW: 0.8, thick: 0.15,
    ribW: 0.27, color: roofCol, moss: mossOf(roofCol), gable: v % 4 === 1 ? 'wood' : 'plaster',
  });
  // porch (engawa) + lean-to roof on posts
  const pd = 0.72;
  engawa(B, { x0: -w / 2 - 0.05, x1: w / 2 + 0.05, z: d / 2, depth: pd, y: y0 + 0.02, step: false });
  const postTop = y0 + h - 0.24;
  posts(B, [-w / 2 + 0.02, w / 2 - 0.02], d / 2 + pd - 0.06, postTop, C.timber, 0.06);
  const beam = G.box(w + 0.1, 0.11, 0.1, 0.02); beam.translate(0, postTop - 0.02, d / 2 + pd - 0.06); B.add(beam, C.timber);
  B.at([0, 0, d / 2 + pd / 2 - 0.04], 0, () => roof(B, {
    type: 'shed', w: w + 0.05, d: pd, y0: postTop + 0.04, over: 0.18, gOver: 0.12, H: 0.3, curve: 0.3, lift: 0.14, liftW: 0.4,
    thick: 0.1, ribW: 0.27, ribAmp: 0.035, course: 0, color: roofCol,
  }));
  for (const sx of [-1, 1]) B.at([sx * (w / 2 - 0.3), postTop - 0.06, d / 2 + pd - 0.02], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.04, color: v % 3 === 2 ? C.pink : C.red }));
  B.light([0, 1.35, d / 2 + pd + 0.2], LAMP);
  B.at([side * -0.75, y0 + 0.02, d / 2 + 0.3], 0, () => pot(B, { plant: v % 2 ? 'pine' : 'flowers', r: 0.13, flowers: [B.pick(FLOWERS)] }));
  if (v % 3 === 0) B.at([-side * 0.2, y0 + 0.02, d / 2 + 0.22], PI, () => crate(B, { s: 0.24 }));
  if (v % 3 !== 2) chimney(B, side * -0.6, -0.35, info.yAt(side * -0.6, -0.35) - 0.3, info.ridgeY - 0.02);
  B.pop();
  const sz = zc + d / 2 + pd;
  stepStones(B, dx, sz + 0.15, dx + side * 0.1, 1.4, 2);
  yardProps(B, [[side * 1.2, 1.15], [-side * 1.25, 1.2], [-side * 1.25, -1.2]]);
  B.at([-side * 0.55, 0, 1.15], 0, () => flowerPatch(B, { w: 0.7, d: 0.4, n: 8 }));
  if (v % 4 === 1) B.at([side * 1.2, 0, -0.2], PI / 2, () => fence(B, [-0.8, 0], [0.8, 0], { style: 'bamboo', h: 0.55 }));
  B.door.set(dx, 0, 1.4);
  B.height = info.ridgeY + 0.3;
}

export function homeL3(B) {
  const v = B.variant;
  const roofCol = ROOF_LIST[(v * 4 + 2) % 5], wall = WALL_TINTS[(v * 2 + 3) % WALL_TINTS.length];
  const w = 2.3, d = 1.8, h = 1.4, y0 = 0.3, zc = -0.45;
  const side = v & 1 ? 1 : -1;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, koshi: '#c9a27a', koshiSkip: ['f'] });
  const blk = { w, d };
  const dx = side * 0.45;
  onFace(B, blk, 'f', dx, y0, () => {
    door(B, { w: 0.86, h: 1.2, style: 'lattice' });
    noren(B, { w: 0.8, h: 0.38, y: 1.24, z: 0.16, color: ['#b0406a', C.indigo, '#6a4a8a', '#3f6f5a'][v % 4], strips: 2, symbol: () => flatSymbol('sakura'), symScale: 0.2 });
  });
  onFace(B, blk, 'f', -side * 0.52, y0 + 0.78, () => shoji(B, { w: 0.78, h: 0.5, box: true, flowers: ['#ff9ec0', '#ffffff'] }));
  onFace(B, blk, 'r', 0, y0 + 0.8, () => shoji(B, { w: 0.9, h: 0.5 }));
  onFace(B, blk, 'l', 0, y0 + 0.8, () => shoji(B, { w: 0.9, h: 0.5 }));
  onFace(B, blk, 'b', 0, y0 + 0.8, () => shoji(B, { w: 0.9, h: 0.5 }));
  // pent roof on back + sides; the front becomes a balcony over a porch
  const low = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.34, H: 0.7, curve: 0.35, lift: 0.2, liftW: 0.6, thick: 0.12, ribW: 0.26, color: roofCol, tTop: 0.46, skip: ['f'] });
  const y2 = low.topY;
  const w2 = 1.9, d2 = 1.3, h2 = 1.2, z2 = -0.12;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, cz: z2, plaster: wall });
  const blk2 = { w: w2, d: d2, cz: z2 };
  onFace(B, blk2, 'f', 0, y2 + 0.05, () => door(B, { w: 1.0, h: 1.0, style: 'shoji' }));
  onFace(B, blk2, 'r', 0, y2 + 0.66, () => roundWindow(B, { r: 0.25, lattice: 'fine' }));
  onFace(B, blk2, 'l', 0, y2 + 0.66, () => roundWindow(B, { r: 0.25, lattice: 'fine' }));
  onFace(B, blk2, 'b', 0, y2 + 0.62, () => shoji(B, { w: 0.8, h: 0.5 }));
  B.push([0, 0, z2]);
  const top = roof(B, {
    type: v % 2 ? 'irimoya' : 'hip', w: w2, d: d2, y0: y2 + h2, over: 0.4, H: 0.9, curve: 0.45, lift: 0.3, liftW: 0.7,
    thick: 0.15, ribW: 0.27, color: roofCol, gable: 'ornate', tg: 0.5, moss: mossOf(roofCol) * 0.5,
  });
  B.pop();
  // balcony deck spanning from the upper wall to past the ground-floor front, on posts
  const zb0 = z2 + d2 / 2, zb1 = d / 2 + 0.5, bw = w + 0.2, by = y2;
  const fr = G.box(w + 0.04, by - (y0 + h) + 0.08, 0.12, 0.02); fr.translate(0, (by + y0 + h) / 2 - 0.04, d / 2 - 0.04); B.add(fr, C.timber);
  const deck = G.box(bw, 0.12, zb1 - zb0, 0.03); deck.translate(0, by - 0.06, (zb0 + zb1) / 2); B.add(deck, C.woodLight);
  const fascia = G.box(bw + 0.04, 0.16, 0.1, 0.03); fascia.translate(0, by - 0.1, zb1); B.add(fascia, C.timber);
  for (const sx of [-1, 1]) { const f2 = G.box(0.1, 0.16, zb1 - zb0, 0.03); f2.translate(sx * bw / 2, by - 0.1, (zb0 + zb1) / 2); B.add(f2, C.timber); }
  posts(B, [-bw / 2 + 0.08, bw / 2 - 0.08], zb1 - 0.08, by - 0.12, C.timber, 0.065);
  engawa(B, { x0: -w / 2, x1: w / 2, z: d / 2, depth: 0.5, y: y0 + 0.02, step: false });
  // railing
  const rh = 0.46;
  const rail = G.box(bw + 0.04, 0.06, 0.07, 0.02); rail.translate(0, by + rh, zb1); B.add(rail, C.timber);
  for (const sx of [-1, 1]) { const r2 = G.box(0.07, 0.06, zb1 - zb0, 0.02); r2.translate(sx * bw / 2, by + rh, (zb0 + zb1) / 2); B.add(r2, C.timber); }
  const nb = 12;
  for (let i = 0; i <= nb; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(-bw / 2 + i * bw / nb, by + rh / 2, zb1); B.add(b, C.timber); }
  for (const sx of [-1, 1]) for (let i = 1; i < 4; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(sx * bw / 2, by + rh / 2, zb0 + i * (zb1 - zb0) / 4); B.add(b, C.timber); }
  B.at([-side * 0.55, by + rh + 0.03, zb1], 0, () => flowerBox(B, { w: 0.62, d: 0.14, h: 0.12, colors: ['#ff8fb0', '#ffffff'] }));
  B.at([side * 0.7, by + rh + 0.03, zb1], 0, () => flowerBox(B, { w: 0.5, d: 0.14, h: 0.12, colors: ['#ffd24a', '#ff8fb0'] }));
  B.at([side * 0.75, by, zb0 + 0.25], 0, () => pot(B, { plant: 'flowers', r: 0.1, flowers: ['#ff9ec0', '#ffd24a'] }));
  // lanterns: under the balcony + at the upper eave
  for (const sx of [-1, 1]) B.at([sx * (w / 2 - 0.25), by - 0.14, zb1 - 0.12], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.02, color: C.pink }));
  B.light([0, 1.3, zb1 + 0.3], { ...LAMP, color: '#ffb0a0' });
  B.at([side * (w2 / 2 + 0.05), y2 + h2 + 0.02, z2 + d2 / 2 + 0.3], 0, () => chochin(B, { r: 0.11, h: 0.22, cord: 0.05, color: C.red }));
  if (v % 2 === 0) chimney(B, -side * 0.5, z2 - 0.25, top.yAt(-side * 0.5, -0.25) - 0.2, top.ridgeY, 0.9);
  B.pop();
  // blossom tree + garden
  B.at([-side * 1.12, 0, 1.08], 0, () => tree(B, { kind: 'sakura', s: 0.62 }));
  stepStones(B, dx, zc + d / 2 + 0.6, dx, 1.45, 2);
  yardProps(B, [[side * 1.22, 1.22], [side * 1.25, -1.2]]);
  B.at([-side * 0.1, 0, 1.28], 0, () => flowerPatch(B, { w: 0.45, d: 0.3, n: 5, colors: ['#ff9ec0', '#ffffff', '#ffbcd6'] }));
  B.door.set(dx, 0, 1.45);
  B.height = top.ridgeY + 0.3;
}
