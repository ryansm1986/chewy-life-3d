// Story landmarks: Blossom Hall, Chewy's cottage, Rosie's Treats, Bonesmith forge, the Burrow gate, notice board.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col, mixc } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, chimney, steps, stepStones, flowerBox, hood, fence, STONES, FLOWERS } from './parts.js';
import { chochin, toro, pot, barrel, crate, bush, tree, flowerPatch, signboard, mailbox, bell, torii, rock, logPile, woodStack, bamboo } from './props.js';
import { nobori, awning, bow, cake, cupcake, donut, anvil, bucket, shimenawa, stoneDog, cafeTable, laundry, firewood, wateringCan } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { charm, rainChain, kadomatsu, toolRack, eaveCharm } from './trim.js';
import { clamp, TAU } from '../../core/util.js';

// ------------------------------------------------------------------ Blossom Hall (6x4)
export function townHall(B) {
  const roofCol = ROOFS.slate;
  const zc = -0.5, w = 4.2, d = 2.2, h = 1.7, y0 = 0.44;
  // stone platform + stairs
  foundation(B, { w: 5.3, d: 3.2, h: y0, cz: -0.25, pad: 0.1 });
  B.at([0, 0, 2.0], 0, () => steps(B, { w: 1.9, n: 3, rise: y0 / 3, run: 0.2, color: STONES[3] }));
  engawa(B, { x0: -2.55, x1: 2.55, z: zc + d / 2, depth: 1.28 - (zc + d / 2) + 0.05, y: y0 + 0.02, step: false });
  B.push([0, 0, zc]);
  walls(B, { w, d, h, y0, plaster: '#fff6ea', koshi: '#c9a27a', koshiSkip: ['f'], posts: { f: [-1.25, 1.25] } });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => {
    door(B, { w: 1.3, h: 1.45, style: 'lattice' });
    noren(B, { w: 1.3, h: 0.55, y: 1.5, z: 0.18, color: C.indigo, strips: 3, symbol: () => flatSymbol('sakura'), symScale: 0.3 });
  });
  for (const u of [-1.75, -0.95, 0.95, 1.75]) onFace(B, blk, 'f', u, y0 + 0.95, () => shoji(B, { w: 0.58, h: 0.62, box: Math.abs(u) > 1.5, flowers: ['#ff9ec0', '#ffffff'] }));
  for (const u of [-0.5, 0.5]) { onFace(B, blk, 'r', u, y0 + 0.95, () => shoji(B, { w: 0.7, h: 0.6 })); onFace(B, blk, 'l', u, y0 + 0.95, () => shoji(B, { w: 0.7, h: 0.6 })); }
  for (const u of [-1.2, 0, 1.2]) onFace(B, blk, 'b', u, y0 + 0.95, () => shoji(B, { w: 0.7, h: 0.6 }));
  // lower tier: pent roof on veranda posts
  const low = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.62, H: 0.95, curve: 0.38, lift: 0.34, liftW: 0.9, thick: 0.16, ribW: 0.3, color: roofCol, tTop: 0.5, pastel: 0.2, moss: 0.15 });
  // chidori-hafu entrance gable jutting from the lower roof over the stairs
  B.at([0, 0, d / 2 + 0.2], 0, () => roof(B, { type: 'gable', ridge: 'z', w: 1.5, d: 1.3, y0: y0 + h + 0.02, over: 0.3, gOver: 0.24, H: 0.62, curve: 0.45, lift: 0.22, liftW: 0.45, thick: 0.13, ribW: 0.26, color: roofCol, gable: 'ornate', pastel: 0.2 }));
  posts(B, [-2.4, -1.25, 1.25, 2.4], d / 2 + 0.5, y0 + h - 0.1, C.vermilion, 0.075);
  const beam = G.box(4.9, 0.12, 0.1, 0.02); beam.translate(0, y0 + h - 0.12, d / 2 + 0.5); B.add(beam, C.vermilion);
  for (const x of [-1.85, -0.62, 0.62, 1.85]) B.at([x, y0 + h - 0.2, d / 2 + 0.5], 0, () => chochin(B, { r: 0.13, h: 0.26, cord: 0.02 }));
  // upper storey
  const y2 = low.topY, w2 = Math.max(3.0, low.openW + 0.12), d2 = Math.max(1.3, low.openD + 0.1), h2 = 1.25;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, plaster: '#fff6ea', rail: false });
  const blk2 = { w: w2, d: d2 };
  for (const u of [-1.0, 1.0]) onFace(B, blk2, 'f', u, y2 + 0.66, () => shoji(B, { w: 0.56, h: 0.5 }));
  onFace(B, blk2, 'f', 0, y2 + 0.68, () => signboard(B, { sym: 'sakura', w: 1.0, h: 0.46, color: '#3a2a30', frame: C.gold, symSize: 0.38 }));
  onFace(B, blk2, 'r', 0, y2 + 0.66, () => roundWindow(B, { r: 0.26 }));
  onFace(B, blk2, 'l', 0, y2 + 0.66, () => roundWindow(B, { r: 0.26 }));
  onFace(B, blk2, 'b', 0, y2 + 0.66, () => shoji(B, { w: 1.0, h: 0.5 }));
  // railing balcony ring on the pent roof top
  const top = roof(B, { type: 'irimoya', w: w2, d: d2, y0: y2 + h2, over: 0.55, H: 1.05, curve: 0.46, lift: 0.4, liftW: 0.9, thick: 0.17, ribW: 0.3, color: roofCol, gable: 'ornate', tg: 0.46, shachi: true, pastel: 0.2 });
  // bell cupola on the ridge
  const ry = top.ridgeY;
  B.push([0, ry + 0.12, 0]);
  const plat = G.box(0.8, 0.1, 0.7, 0.03); plat.translate(0, 0.02, 0); B.add(plat, C.vermilion);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.07, 0.62, 0.07, 0.015); p.translate(sx * 0.3, 0.35, sz * 0.26); B.add(p, C.vermilion); }
  const cu = roof(B, { type: 'hip', w: 0.62, d: 0.56, y0: 0.68, over: 0.2, H: 0.42, curve: 0.5, lift: 0.14, liftW: 0.25, thick: 0.08, ribW: 0.2, ribAmp: 0.025, course: 0, color: roofCol, finial: 'gold' });
  B.anim({ p: [0, 0.62, 0], kind: 'swing', axis: [1, 0, 0], speed: 1.6, amp: 0.18 }, () => bell(B, { r: 0.13, color: C.gold }));
  B.pop();
  B.pop();
  // hall dressing: rain chains down the outer veranda posts onto the deck, wind chimes between the lanterns,
  // kadomatsu flanking the stairs
  for (const sx of [-1, 1]) {
    const cx = sx * 2.5, cz = zc + d / 2 + 0.45;
    rainChain(B, cx, low.underAt(cx, cz - zc), cz, y0 + 0.02, { color: C.bronze });
    B.at([sx * 2.12, y0 + h - 0.2, zc + d / 2 + 0.5], 0, () => charm(B, 'furin', { color: sx > 0 ? '#bfe6ff' : '#ffd0e0' }));
    B.at([sx * 0.98, y0 + 0.02, zc + d / 2 + 0.55], 0, () => kadomatsu(B, 0.8));
  }
  // banners, stone lanterns, planters
  for (const [x, c, s] of [[-2.7, '#ff8fb0', 'sakura'], [2.7, C.indigo, 'bell']]) B.at([x, 0, 1.55], x < 0 ? 0 : PI, () => nobori(B, { h: 2.5, w: 0.44, color: c, sym: s }));
  for (const x of [-1.35, 1.35]) B.at([x, 0, 1.72], 0, () => toro(B, { s: 0.8 }));
  for (const x of [-2.2, 2.2]) B.at([x, 0, 1.75], 0, () => bush(B, { r: 0.28, flowers: ['#ff9ec0', '#ffffff'] }));
  B.light([-1.3, 2.0, 1.7], { ...LAMP, intensity: 3.6, radius: 7 });
  B.light([1.3, 2.0, 1.7], { ...LAMP, intensity: 3.6, radius: 7 });
  B.door.set(0, 0, 2.15);
  B.height = top.ridgeY + zc * 0 + 1.3;
}

// ------------------------------------------------------------------ Chewy's cottage (3x3)
export function chewyHouse(B) {
  const roofCol = '#d8604a';
  const w = 2.2, d = 1.65, h = 1.45, y0 = 0.28, zc = -0.55;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: '#fff4e2', koshi: '#c9a27a', koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', -0.62, y0 + 0.82, () => roundWindow(B, { r: 0.26, lattice: 'fine', box: true, flowers: ['#ffd24a', '#ff8fb0'] }));
  onFace(B, blk, 'f', 0.7, y0 + 0.82, () => shoji(B, { w: 0.46, h: 0.44 }));
  onFace(B, blk, 'r', 0, y0 + 0.84, () => shoji(B, { w: 0.62, h: 0.48, box: true }));
  onFace(B, blk, 'l', 0, y0 + 0.84, () => roundWindow(B, { r: 0.24 }));
  onFace(B, blk, 'b', 0, y0 + 0.84, () => shoji(B, { w: 0.6, h: 0.46 }));
  const info = roof(B, { type: 'gable', ridge: 'z', w, d, y0: y0 + h, over: 0.36, gOver: 0.3, H: 1.05, curve: 0.3, lift: 0.16, liftW: 0.5, thick: 0.15, ribW: 0.26, color: roofCol, gableColor: '#fff4e2' });
  chimney(B, -0.6, -0.3, info.yAt(-0.6, -0.3) - 0.3, info.ridgeY + 0.05, 0.95);
  // doghouse-shaped entry porch: little gable box with an arched opening
  const pw = 1.0, pd = 0.62, ph = 1.3, pz = d / 2 + pd / 2 - 0.02, px = 0.1;
  B.push([px, 0, pz]);
  const base = G.box(pw + 0.12, y0, pd + 0.1, 0.05); base.translate(0, y0 / 2, 0); B.add(base, STONES[2]);
  const shp = new THREE.Shape();
  const hw = pw / 2, ar = 0.3;
  shp.moveTo(-hw, 0); shp.lineTo(hw, 0); shp.lineTo(hw, ph); shp.lineTo(-hw, ph); shp.lineTo(-hw, 0);
  const hole = new THREE.Path(); hole.moveTo(-ar, 0.001); hole.lineTo(-ar, ph * 0.55); hole.absarc(0, ph * 0.55, ar, PI, 0, true); hole.lineTo(ar, 0.001); hole.lineTo(-ar, 0.001);
  shp.holes.push(hole);
  const front = new THREE.ExtrudeGeometry(shp, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 });
  front.translate(0, y0, pd / 2 - 0.1); B.add(front, '#ffe6c8');
  for (const sx of [-1, 1]) { const sw = G.box(0.1, ph, pd, 0.03); sw.translate(sx * (hw - 0.05), y0 + ph / 2, 0); B.add(sw, '#ffe6c8'); }
  const arch = G.torus(ar + 0.03, 0.045, 6, 14, PI); arch.translate(0, y0 + ph * 0.55, pd / 2 + 0.03); B.add(arch, C.woodMid);
  for (const sx of [-1, 1]) { const jamb = G.box(0.08, ph * 0.55, 0.08, 0.02); jamb.translate(sx * (ar + 0.03), y0 + ph * 0.275, pd / 2 + 0.03); B.add(jamb, C.woodMid); }
  const floor = G.box(pw - 0.1, 0.04, pd, 0); floor.translate(0, y0 + 0.02, 0); B.add(floor, C.woodLight);
  const inner = G.box(0.62, 1.0, 0.04, 0); inner.translate(0, y0 + 0.5, -pd / 2 + 0.05); B.add(inner, '#7a5240');
  const knob = G.sph(0.035, 6, 4); knob.translate(0.18, y0 + 0.5, -pd / 2 + 0.08); B.add(knob, C.gold);
  const pr = roof(B, { type: 'gable', ridge: 'z', w: pw, d: pd, y0: y0 + ph, over: 0.16, gOver: 0.14, H: 0.55, curve: 0.2, lift: 0.1, liftW: 0.3, thick: 0.1, ribW: 0.2, ribAmp: 0.03, course: 0, color: roofCol, vent: false, gableColor: '#ffe6c8', oni: false });
  // bone sign on the porch gable + bone ornament on the ridge
  B.at([0, y0 + ph + 0.2, pd / 2 + 0.2], 0, () => symbol(B, 'bone', 0.46, { depth: 0.07 }));
  B.at([0, pr.ridgeY + 0.1, pd / 2 - 0.02], 0, () => symbol(B, 'paw', 0.16, { colors: ['#8a4a2c'] }));
  B.at([0.22, y0 + ph - 0.04, pd / 2 + 0.08], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.05, color: C.red }));
  // Chewy's own rain charm (with floppy ears) on the other side of the arch
  B.at([-0.26, y0 + ph - 0.02, pd / 2 + 0.08], 0, () => charm(B, 'teruDog'));
  B.pop();
  B.light([px + 0.2, 1.3, pz + 0.7], LAMP);
  B.at([0, info.ridgeY + 0.14, d / 2 + 0.28], 0, () => symbol(B, 'bone', 0.36, { depth: 0.06 }));
  // a rain chain off the left eave, a wind chime at the right, a bone-shaped name plate by the side window
  { const cx = -(w / 2 + 0.2), cz = d / 2 - 0.12; rainChain(B, cx, info.underAt(cx, cz), cz, 0, { color: '#c8a060' }); }
  eaveCharm(B, info, w / 2 + 0.2, d / 2 - 0.3, 'furin', { color: '#ffd0e0' });
  B.pop();
  // yard: mailbox, dog bowl, tennis ball, picket fence, flowers
  B.at([1.05, 0, 1.2], -0.3, () => mailbox(B));
  B.at([-0.7, 0, 0.62], 0, () => {
    const bowl = G.lathe([[0.001, 0], [0.14, 0], [0.17, 0.08], [0.13, 0.08], [0.001, 0.03]], 12); B.add(bowl, C.red);
    B.at([0, 0.08, 0], 0.4, () => symbol(B, 'bone', 0.18, { depth: 0.04 }), 1, -PI / 2);
  });
  const ball = G.sph(0.08, 10, 8); ball.translate(-1.1, 0.08, 1.2); B.add(ball, (p, n, o) => o.set(Math.abs(p.y - 0.08 + Math.sin(p.x * 30) * 0.02) < 0.012 ? '#fff6ea' : '#e8322c'));
  fence(B, [-1.45, 1.42], [-0.5, 1.42], { style: 'picket', h: 0.45 });
  fence(B, [0.7, 1.42], [1.45, 1.42], { style: 'picket', h: 0.45 });
  B.at([-1.15, 0, 0.9], 0, () => flowerPatch(B, { w: 0.5, d: 0.45, n: 7, colors: ['#ffd24a', '#ff8fb0', '#ffffff'] }));
  B.at([1.2, 0, -1.2], 0, () => bush(B, { r: 0.3, flowers: ['#ff9ec0'] }));
  B.at([-1.2, 0, -1.2], 0, () => barrel(B, { r: 0.16, h: 0.34 }));
  // Chewy's gi and red scarf drying on the line, firewood under the chimney, a watering can by the flowers
  B.at([1.33, 0, -0.2], PI / 2, () => laundry(B, { L: 1.2, h: 1.15, colors: ['#2c3a6a', '#e8403a', '#ffffff', '#2c3a6a'] }));
  B.at([-1.26, 0, -0.35], -PI / 2, () => firewood(B, { w: 0.7, h: 0.42, d: 0.2 }));
  B.at([-0.72, 0, 1.12], 2.2, () => wateringCan(B, '#e8807a'));
  stepStones(B, 0.1, 0.55, 0.1, 1.35, 3);
  B.door.set(0.1, 0, 1.45);
  B.height = 3.6;
}

// ------------------------------------------------------------------ Rosie's Treats (4x3)
export function rosieShop(B) {
  const roofCol = '#e07a98', wall = '#fff0f2';
  const w = 3.3, d = 1.85, h = 1.6, y0 = 0.26, zc = -0.4;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: '#c8b8c4' });
  walls(B, { w, d, h, y0, plaster: wall, frame: '#b86a7a', koshi: '#f4c8d4', koshiSkip: ['f'] });
  const blk = { w, d };
  // display window with cakes
  onFace(B, blk, 'f', -0.62, y0, () => {
    const ww = 1.5, wh = 0.72, wy = 0.78;
    const pane = G.box(ww, wh, 0.04, 0); pane.translate(0, wy, 0.02); B.glow(pane, '#fff4e8');
    const fr = [[0, wy + wh / 2, ww + 0.14, 0.08], [0, wy - wh / 2, ww + 0.14, 0.08]];
    for (const [x, y, fw, fh] of fr) { const g = G.box(fw, fh, 0.1, 0.02); g.translate(x, y, 0.05); B.add(g, C.white); }
    for (const x of [-ww / 2, 0, ww / 2]) { const g = G.box(0.07, wh, 0.1, 0.02); g.translate(x, wy, 0.05); B.add(g, C.white); }
    const shelf = G.box(ww + 0.1, 0.05, 0.3, 0.015); shelf.translate(0, wy - wh / 2 + 0.06, 0.18); B.add(shelf, C.woodLight);
    const sill = G.box(ww + 0.2, 0.3, 0.12, 0.03); sill.translate(0, wy - wh / 2 - 0.15, 0.06); B.add(sill, '#f4c8d4');
    B.at([-0.48, wy - wh / 2 + 0.085, 0.2], 0, () => cake(B, { r: 0.13, layers: 2, colors: ['#fff0d8', '#ff9ec0'] }));
    B.at([0.05, wy - wh / 2 + 0.085, 0.2], 0, () => cake(B, { r: 0.11, layers: 3, colors: ['#8a5a44', '#fff0d8', '#ffd0a0'] }));
    for (const [x, c] of [[0.36, '#ff9ec0'], [0.55, '#c8a8ff']]) B.at([x, wy - wh / 2 + 0.085, 0.22], 0, () => cupcake(B, { r: 0.055, color: c }));
  });
  onFace(B, blk, 'f', 0.95, y0, () => {
    door(B, { w: 0.82, h: 1.35, style: 'round', wood: '#f4a8b8', frame: '#b86a7a' });
  });
  onFace(B, blk, 'r', 0, y0 + 0.85, () => roundWindow(B, { r: 0.28, lattice: 'fine', frame: '#b86a7a', box: true, flowers: ['#ff8fb0', '#ffffff'] }));
  onFace(B, blk, 'l', 0, y0 + 0.85, () => roundWindow(B, { r: 0.28, frame: '#b86a7a' }));
  for (const u of [-0.8, 0.8]) onFace(B, blk, 'b', u, y0 + 0.85, () => shoji(B, { w: 0.6, h: 0.46, frame: '#b86a7a' }));
  const info = roof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.42, H: 1.0, curve: 0.42, lift: 0.3, liftW: 0.8, thick: 0.15, ribW: 0.28, color: roofCol, gable: 'plaster', gableColor: wall, tg: 0.5, pastel: 0.22 });
  // candy-striped awning across the front
  onFace(B, blk, 'f', 0, y0 + h - 0.02, () => awning(B, { w: w + 0.1, d: 0.42, y: 0, drop: 0.24, colors: ['#ff8fb0', '#fff8f4'], n: 14 }));
  // pastry table in front of the display window
  B.at([-0.42, 0, d / 2 + 0.62], 0, () => {
    const t = G.box(1.1, 0.06, 0.42, 0.02); t.translate(0, 0.62, 0); B.add(t, C.woodLight);
    const cl = G.box(1.14, 0.3, 0.46, 0.02); cl.translate(0, 0.46, 0); B.add(cl, { grad: ['#ff9ec0', '#fff0f4'] });
    for (const x of [-0.5, 0.5]) for (const z of [-0.16, 0.16]) { const l = G.box(0.05, 0.32, 0.05, 0); l.translate(x, 0.16, z); B.add(l, C.woodMid); }
    B.at([-0.32, 0.65, 0], 0, () => cake(B, { r: 0.13, layers: 2, colors: ['#fff0d8', '#ff9ec0'] }));
    const stand = G.cyl(0.02, 0.02, 0.26, 5); stand.translate(0.12, 0.78, 0); B.add(stand, C.gold);
    for (const [y, r] of [[0.68, 0.16], [0.86, 0.11]]) { const pl = G.cyl(r, r, 0.02, 12); pl.translate(0.12, y, 0); B.add(pl, '#fff6ea'); }
    for (let i = 0; i < 4; i++) B.at([0.12 + Math.cos(i * 1.57) * 0.1, 0.69, Math.sin(i * 1.57) * 0.1], 0, () => cupcake(B, { r: 0.035, color: ['#ff9ec0', '#c8a8ff', '#fff0a0', '#a8e0c8'][i] }));
    B.at([0.12, 0.87, 0], 0, () => donut(B, { r: 0.045, color: '#ff8fb0' }));
    B.at([0.42, 0.65, 0.02], 0, () => { for (let i = 0; i < 3; i++) B.at([B.wob(0.05), 0, B.wob(0.06)], 0, () => donut(B, { r: 0.04, color: B.pick(['#ffffff', '#8a5a44', '#ff8fb0']) })); });
  });
  // cake sign on the roof front + big bow
  B.at([0, info.ridgeY - 0.55, d / 2 + 0.5], 0, () => {
    const post = G.box(0.07, 0.45, 0.07, 0.02); post.translate(0, -0.25, -0.12); B.add(post, '#b86a7a');
    signboard(B, { sym: 'cake', w: 0.7, h: 0.5, color: '#fff8f0', frame: '#e07a98', symSize: 0.46 });
    B.at([0.32, 0.24, 0.07], 0, () => bow(B, { s: 0.26 }));
  });
  B.at([0, info.ridgeY + 0.05, 0], 0, () => cupcake(B, { r: 0.12, color: '#ff9ec0' }));
  chimney(B, 1.0, -0.4, info.yAt(1.0, -0.4) - 0.2, info.ridgeY - 0.1, 0.8);
  // a shop bell under the awning by the door, a pink wind chime at the far end, a rain chain at the right corner
  B.at([1.42, y0 + h - 0.28, d / 2 + 0.34], 0, () => charm(B, 'bell'));
  B.at([-1.5, y0 + h - 0.28, d / 2 + 0.34], 0, () => charm(B, 'furin', { color: '#ffc0d8' }));
  { const cx = w / 2 + 0.12, cz = d / 2 - 0.1; rainChain(B, cx, info.underAt(cx, cz), cz, 0, { color: '#e8a0b0' }); }
  B.pop();
  // outdoor café bits + chalkboard + flowers
  B.at([-1.55, 0, 1.05], 0, () => cafeTable(B, { cloth: '#fff0f4', umbrella: '#ff8fb0' }));
  B.at([0.42, 0, 1.22], -0.3, () => signboard(B, { sym: 'heart', w: 0.42, h: 0.5, style: 'aframe', color: '#3a4a44', frame: C.woodLight, symSize: 0.3 }));
  B.at([1.62, 0, 0.9], 0, () => pot(B, { plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
  B.at([1.62, 0, -1.25], 0, () => crate(B, { s: 0.3, wood: '#f4d8b8' }));
  for (const x of [0.55, 1.35]) B.at([x, 0, 0.72], 0, () => flowerPatch(B, { w: 0.4, d: 0.22, n: 4, colors: ['#ff8fb0', '#ffffff', '#ffd24a'] }));
  B.light([0.2, 1.6, 1.0], { ...LAMP, color: '#ffc0b0', intensity: 3.4, radius: 6 });
  B.door.set(0.95, 0, 1.2);
  B.height = 4.0;
}

// ------------------------------------------------------------------ Bonesmith forge (3x3)
export function boneSmith(B) {
  const roofCol = ROOFS.slate;
  // workshop block (right-back) with a gable roof
  const w = 1.9, d = 1.3, h = 1.45, y0 = 0.22, cx = 0.45, cz = -0.75;
  B.push([cx, 0, cz]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, planks: '#9a7a62', frame: '#6a4a3a' });
  const blk = { w, d };
  onFace(B, blk, 'f', 0.35, y0, () => {
    door(B, { w: 0.72, h: 1.2, style: 'wood', wood: '#b08a64', frame: '#6a4a3a' });
    B.at([0, 1.34, 0.1], 0, () => signboard(B, { sym: 'hammer', w: 0.62, h: 0.3, color: '#f4e0c0', frame: '#6a4a3a', symSize: 0.26 }));
  });
  onFace(B, blk, 'f', -0.5, y0 + 0.8, () => shoji(B, { w: 0.42, h: 0.4, frame: '#6a4a3a' }));
  onFace(B, blk, 'r', 0, y0 + 0.8, () => shoji(B, { w: 0.55, h: 0.42, frame: '#6a4a3a' }));
  const info = roof(B, { type: 'gable', w, d, y0: y0 + h, over: 0.36, gOver: 0.28, H: 0.78, curve: 0.35, lift: 0.2, liftW: 0.5, thick: 0.14, ribW: 0.26, color: roofCol, gable: 'wood', moss: 0.3 });
  // smith's tools hung on the planks under the windows, a straw hat and tongs on the side wall
  onFace(B, blk, 'f', -0.5, y0 + 0.52, () => toolRack(B, 0.52, 0, { tools: ['tongs', 'hammer', 'tongs'] }));
  onFace(B, blk, 'r', 0.05, y0 + 0.5, () => toolRack(B, 0.55, 0, { tools: ['hat', 'saw', 'hammer'] }));
  B.pop();
  // forge: stone hearth with glowing mouth + coal bed, hood and tall chimney (left)
  const fx = -0.85, fz = -0.55;
  B.push([fx, 0, fz]);
  const hearth = G.box(0.95, 0.62, 0.8, 0.07); hearth.translate(0, 0.31, 0); B.add(hearth, STONES[2]);
  for (let i = 0; i < 8; i++) { const st = puff(V(0, 0, 0), 0.11, { detail: 1, noise: 0.3, squash: 0.7, seed: i + 3 }); st.translate(-0.4 + (i % 4) * 0.27, 0.13 + Math.floor(i / 4) * 0.34, 0.41); B.add(st, B.pick(STONES)); }
  const rim = G.box(1.0, 0.08, 0.85, 0.03); rim.translate(0, 0.64, 0); B.add(rim, STONES[4]);
  const pit = G.box(0.6, 0.04, 0.46, 0); pit.translate(0, 0.67, 0.06); B.add(pit, '#3a3036');
  for (let i = 0; i < 12; i++) { const c = G.ico(0.065, 0); c.translate(B.rand(-0.24, 0.24), 0.7, B.rand(-0.14, 0.24)); B.glow(c, B.pick(['#ff7a2a', '#ffb040', '#ff5a20', '#ffd060']), { flicker: 1, tint: 1, hot: true }); }
  const mouth = new THREE.Shape(); mouth.moveTo(-0.2, 0); mouth.lineTo(0.2, 0); mouth.lineTo(0.2, 0.14); mouth.absarc(0, 0.14, 0.2, 0, PI, false); mouth.lineTo(-0.2, 0);
  const mg = new THREE.ShapeGeometry(mouth, 8); mg.translate(0, 0.1, 0.405); B.glow(mg, '#ff9a3a', { flicker: 1, tint: 1, hot: true });
  const arch = G.torus(0.22, 0.05, 5, 12, PI); arch.translate(0, 0.24, 0.42); B.add(arch, STONES[1]);
  const hoodG = G.cyl(0.14, 0.4, 0.42, 4); hoodG.rotateY(PI / 4); hoodG.translate(0, 1.2, -0.12); B.add(hoodG, '#8a8290');
  for (const sx of [-1, 1]) { const leg = G.box(0.06, 0.5, 0.06, 0); leg.translate(sx * 0.3, 0.9, -0.3); B.add(leg, C.iron); }
  chimney(B, 0, -0.14, 1.38, 2.9, 0.95);
  // bellows beside the hearth
  B.at([0.62, 0.36, 0.1], 0, () => { const bl = G.sph(0.2, 8, 6); bl.scale(0.8, 0.5, 1.1); B.add(bl, '#8a5a3a'); const nz = G.cyl(0.03, 0.05, 0.3, 6); nz.rotateZ(PI / 2); nz.translate(-0.24, 0.02, 0); B.add(nz, C.iron); const hd = G.box(0.05, 0.05, 0.3, 0); hd.translate(0.12, 0.1, 0); B.add(hd, C.woodLight); });
  B.pop();
  B.light([fx, 1.0, fz + 0.6], { color: '#ff8a3a', intensity: 4.5, radius: 5.5, flicker: 1, nightOnly: true });
  // yard: anvil, quench tub, weapon rack with bone swords, charcoal & logs
  B.at([-0.25, 0, 0.45], 0.35, () => anvil(B));
  B.at([-1.05, 0, 0.5], 0, () => bucket(B, { r: 0.2, h: 0.3, water: true }));
  B.at([0.95, 0, 0.55], -0.2, () => {
    for (const sx of [-1, 1]) { const p = G.box(0.06, 0.95, 0.06, 0); p.translate(sx * 0.36, 0.47, 0); B.add(p, C.woodMid); }
    for (const y of [0.25, 0.85]) { const r = G.box(0.82, 0.05, 0.08, 0); r.translate(0, y, 0); B.add(r, C.woodMid); }
    for (let i = 0; i < 3; i++) B.at([-0.22 + i * 0.22, 0.56, 0.06], 0, () => symbol(B, 'bone', 0.52, { depth: 0.04 }), 1, 0, PI / 2);
  });
  B.at([1.25, 0, -0.05], 0, () => woodStack(B, { w: 0.45, h: 0.36, d: 0.3 }));
  B.at([-1.3, 0, -1.25], 0, () => barrel(B, { r: 0.16, h: 0.34 }));
  B.at([-0.55, 0, 1.2], 0, () => crate(B, { s: 0.3 }));
  B.door.set(cx + 0.35, 0, 0.3);
  B.height = Math.max(info.ridgeY, 2.9) + 0.4;
}

// ------------------------------------------------------------------ The Burrow (dungeon gate, 4x4)
export function dungeonGate(B) {
  // mossy boulder mound (back) with a round cave mouth facing +z
  const rocks = [[0, 0.75, -0.95, 1.15], [-1.15, 0.5, -0.85, 0.82], [1.15, 0.48, -0.9, 0.8], [-0.62, 1.3, -1.25, 0.7], [0.62, 1.28, -1.25, 0.68],
    [0, 1.72, -1.4, 0.55], [-1.6, 0.3, -0.25, 0.46], [1.62, 0.28, -0.3, 0.46], [0.5, 0.35, -1.7, 0.7], [-0.5, 0.3, -1.7, 0.7]];
  rocks.forEach(([x, y, z, r], i) => {
    const g = puff(V(x, y, z), r, { detail: 2, noise: 0.14, squash: 0.8, seed: 40 + i });
    B.add(g, (p, n, o) => {
      o.set('#a8a0b4').lerp(col('#d0c8d4'), clamp(n.y * 0.5 + 0.35));
      const m = clamp((n.y - 0.35) * 2.4);
      if (m > 0) o.lerp(col(n.y > 0.8 ? '#a8d888' : '#88c070'), m * 0.9);
    });
  });
  for (let i = 0; i < 7; i++) {
    const a = B.rand(0.3, PI - 0.3), rr = B.rand(0.4, 1.1);
    const g = puff(V(Math.cos(a) * rr * 1.2, 1.25 - rr * 0.45 + 0.35, -1.0 - Math.sin(a) * 0.3), 0.2, { detail: 1, noise: 0.35, squash: 0.55, seed: i });
    B.add(g, '#78b85a', 'leaf');
  }
  // cave mouth: chunky stone ring + purple glowing void
  const cy = 0.72, cz = 0.2, cr = 0.62;
  for (let k = 0; k < 11; k++) {
    const a = -0.2 + k / 10 * (PI + 0.4);
    const st = puff(V(0, 0, 0), 0.2, { detail: 1, noise: 0.25, squash: 0.8, seed: 70 + k });
    st.translate(Math.cos(a) * (cr + 0.1), cy + Math.sin(a) * (cr + 0.1), cz + 0.02);
    B.add(st, B.pick(['#b8b0c0', '#a8a0b0', '#c8c0cc']));
  }
  const floor = G.cyl(cr * 0.95, cr, 0.08, 16); floor.scale(1, 1, 0.8); floor.translate(0, 0.04, cz - 0.1); B.add(floor, '#5a4a6a');
  const back = G.disc(cr * 0.98, 24); back.translate(0, cy, cz - 0.32);
  B.glow(back, (p, n, o) => o.set('#c890ff').lerp(col('#2a1050'), clamp(Math.hypot(p.x, p.y - cy) / cr)), { tint: 1, hot: true });
  const tunnel = new THREE.CylinderGeometry(cr * 1.0, cr * 0.9, 0.34, 24, 1, true); tunnel.rotateX(PI / 2); tunnel.translate(0, cy, cz - 0.15);
  const tn = tunnel.toNonIndexed(); const tp = tn.attributes.position;
  for (let i = 0; i < tp.count; i += 3) { const x = tp.getX(i + 1), y = tp.getY(i + 1), z = tp.getZ(i + 1); tp.setXYZ(i + 1, tp.getX(i + 2), tp.getY(i + 2), tp.getZ(i + 2)); tp.setXYZ(i + 2, x, y, z); }
  tn.computeVertexNormals(); B.glow(tn, '#3a1a6a', { tint: 1, hot: true });
  B.anim({ p: [0, cy, cz - 0.26], kind: 'spin', axis: [0, 0, 1], speed: 0.9 }, () => {
    for (let k = 0; k < 3; k++) {
      const arc = G.torus(0.14 + k * 0.14, 0.035, 4, 14, PI * 1.25); arc.rotateZ(k * 2.1);
      B.glow(arc, ['#f0b0ff', '#c080ff', '#a060f0'][k], { tint: 1, hot: true, flicker: 0.5 });
    }
    const core = G.sph(0.08, 8, 6); B.glow(core, '#ffe0ff', { tint: 1, hot: true });
  });
  shimenawa(B, { w: 1.55, y: cy + cr + 0.22, sag: 0.16, z: cz + 0.2 });
  // paper ofuda talismans pasted on the ring stones, a little offering stand with kagami mochi beside the mouth
  for (const a of [0.35, 1.25, PI - 0.4]) B.at([Math.cos(a) * (cr + 0.12), cy + Math.sin(a) * (cr + 0.12), cz + 0.2], 0, () => {
    const slip = G.box(0.09, 0.2, 0.012, 0); B.add(slip, '#fff8ea');
    const band = G.box(0.07, 0.035, 0.016, 0); band.translate(0, 0.05, 0); B.add(band, '#e8403a');
    const ink = G.box(0.02, 0.1, 0.016, 0); ink.translate(0, -0.03, 0); B.add(ink, C.ink);
  }, 1, -0.25, a - PI / 2 + B.dwob(0.2));
  B.at([-1.05, 0, 0.3], 0.35, () => {
    for (const s of [-1, 1]) { const l = G.box(0.05, 0.4, 0.05, 0); l.translate(s * 0.14, 0.2, 0); B.add(l, C.woodPale); }
    const top = G.box(0.38, 0.05, 0.3, 0); top.translate(0, 0.42, 0); B.add(top, C.woodPale);
    const tray = G.box(0.26, 0.05, 0.22, 0); tray.translate(0, 0.47, 0); B.add(tray, '#f0dcb0');
    const m1 = G.sph(0.09, 8, 5); m1.scale(1, 0.5, 1); m1.translate(0, 0.53, 0); B.add(m1, '#fffaf2');
    const m2 = G.sph(0.065, 8, 5); m2.scale(1, 0.55, 1); m2.translate(0, 0.585, 0); B.add(m2, '#fffaf2');
    const mk = G.sph(0.03, 6, 4); mk.translate(0, 0.625, 0); B.add(mk, '#ffa040');
    const leaf = G.box(0.16, 0.008, 0.05, 0); leaf.rotateY(0.4); leaf.translate(0, 0.505, 0.02); B.add(leaf, '#5a9a48');
  });
  // vermilion torii in front
  B.at([0, 0, 1.55], 0, () => torii(B, { w: 1.8, h: 1.85 }));
  for (const x of [-1.55, 1.55]) B.at([x, 0, 1.35], 0, () => toro(B, { s: 0.72 }));
  B.at([-0.75, 0, 0.8], 0.3, () => stoneDog(B, { s: 0.62, ball: 1 }));
  B.at([0.75, 0, 0.8], -0.3, () => stoneDog(B, { s: 0.62, ball: -1 }));
  stepStones(B, 0, 0.6, 0, 1.9, 4);
  B.at([-1.65, 0, 0.55], 0, () => bush(B, { r: 0.24, color: '#5a9a4a', flowers: ['#c8a8ff'] }));
  B.at([1.7, 0, 0.55], 0, () => bamboo(B, { n: 3, h: 1.7, spread: 0.18 }));
  B.at([1.3, 0, -1.85], 0, () => rock(B, { r: 0.28 }));
  B.light([0, 0.9, 0.75], { color: '#b070ff', intensity: 3.2, radius: 6.5, flicker: 0.4, nightOnly: false });
  B.light([0, 1.1, 1.5], { ...LAMP, intensity: 2.6, radius: 5 });
  B.door.set(0, 0, 0.85);
  B.height = 2.6;
}

// ------------------------------------------------------------------ notice board (1x1)
export function bulletinBoard(B) {
  for (const s of [-1, 1]) { const p = G.box(0.09, 1.45, 0.09, 0.02); p.translate(s * 0.4, 0.72, 0); B.add(p, C.woodMid); }
  const board = G.box(0.86, 0.66, 0.06, 0.02); board.translate(0, 0.95, 0); B.add(board, '#c9a27a');
  const frame = G.box(0.94, 0.74, 0.04, 0.02); frame.translate(0, 0.95, -0.02); B.add(frame, C.woodDark);
  B.push([0, 0, 0]);
  const rf = roof(B, { type: 'gable', w: 0.9, d: 0.2, y0: 1.36, over: 0.12, gOver: 0.1, H: 0.22, curve: 0.2, lift: 0.08, liftW: 0.2, thick: 0.06, ribW: 0.16, ribAmp: 0.02, course: 0, color: ROOFS.teal, vent: false, oni: false });
  B.pop();
  const papers = [[-0.22, 1.08, 0.24, 0.3, '#fffaf0'], [0.14, 1.12, 0.26, 0.2, '#fff0c8'], [0.22, 0.86, 0.22, 0.24, '#e8f4ff'], [-0.2, 0.8, 0.26, 0.2, '#ffe8f0'], [0.0, 0.95, 0.16, 0.18, '#f0ffe8']];
  papers.forEach(([x, y, pw, ph, c], i) => {
    if (i === 1) {
      const g = G.plane(pw, ph, 2, 3); g.translate(x, y, 0.04);
      B.cloth(g, c, { x0: x - pw / 2, x1: x + pw / 2, yTop: y + ph / 2, yBot: y - ph / 2 });
    } else { const g = G.box(pw, ph, 0.006, 0); g.rotateZ(B.wob(0.12)); g.translate(x, y, 0.035); B.add(g, c); }
    const pin = G.sph(0.02, 5, 4); pin.translate(x, y + ph / 2 - 0.03, 0.05); B.add(pin, B.pick([C.red, '#6ab0ff', C.gold]));
    for (let k = 0; k < 3; k++) { const ln = G.box(pw * 0.7, 0.01, 0.004, 0); ln.translate(x, y + ph * 0.2 - k * ph * 0.2, 0.042); B.add(ln, '#9a8a9a'); }
  });
  B.at([0, 1.18, 0.05], 0, () => symbol(B, 'star', 0.12));
  const base = G.box(1.0, 0.1, 0.3, 0.03); base.translate(0, 0.05, 0); B.add(base, STONES[1]);
  void rf;
  B.door.set(0, 0, 0.55);
  B.height = 1.7;
}
