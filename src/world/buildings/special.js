// Story landmarks: Blossom Hall, Chewy's cottage (levels 1-3, style-aware), Rosie's Treats, Bonesmith forge, the Burrow gate, notice board.
import * as THREE from 'three';
import { puff, tube, RoundedBox } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col, mixc, bar } from './kit.js';
import { roof } from './roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, door, noren, engawa, posts, chimney, steps, stepStones, flowerBox, hood, fence, STONES, FLOWERS, doorway, latticeWindow, norenMark, bunting } from './parts.js';
import { chochin, toro, pot, barrel, crate, bush, tree, flowerPatch, signboard, mailbox, bell, torii, rock, logPile, woodStack, bamboo, leafGeo, blossomGeo } from './props.js';
import { nobori, awning, bow, cake, cupcake, donut, anvil, bucket, shimenawa, stoneDog, cafeTable, laundry, firewood, wateringCan, hedge, parasol } from './props2.js';
import { symbol, flatSymbol } from './symbols.js';
import { LAMP } from './homes.js';
import { charm, rainChain, kadomatsu, toolRack, eaveCharm, grille, glassFloats } from './trim.js';
import { styleOf, FENCE_COLORS } from './styles.js';
import { clamp, TAU, mulberry32 } from '../../core/util.js';

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

// ------------------------------------------------------------------ Chewy's cottage (3x3, levels 1-3)
// L1: the cottage every save starts with: a front-gable house, Chewy's doghouse-shaped entry porch with the bone sign,
//     a picket fence, laundry, a mailbox. With no exterior style set it is built exactly as it always was.
// L2: the same cottage grown cosier: a dormer in the roof and a veranda on the front-right corner (a plank deck on
//     posts under a lean-to roof, zabuton cushions, a tea tray and Chewy's own dog bed).
// L3: a second storey: a pent roof round the ground floor, a smaller upper floor with a big round window over the
//     doghouse, a drying balcony on the right, its own roof with the bone on the gable and a bone weathervane.
// The footprint stays 3x3 and the door (the doghouse arch) stays at (0.1, 0, 1.45) on every level.
// Exterior styles (styles.js, docs/HOUSING.md §6) thread through every level: roof colour and shape (gable, hip,
// irimoya), walls, trim, the door inside the arch (style + colour), windows, a noren across the arch, the fence and
// festival bunting. B.add's colour jitter draws from the main random stream, so a part whose shape a style changes is
// first run as a "ghost" of its unstyled self and then built on a private stream: a remodel keeps every random choice
// (stones, flowers, yard props) and the unstyled cottage is untouched.
const EMPTY = () => ({ body: [], glow: [], hot: [], cloth: [], leaf: [], water: [], jet: [] });
/** run fn only for the random numbers it draws: its geometry, lights, smoke and animated parts are dropped */
function ghost(B, fn) {
  const cur = B.cur, nl = B.lights.length, ns = B.smoke.length, na = B.anims.length;
  B.cur = { buckets: EMPTY() };
  try { fn(); } finally { B.cur = cur; B.lights.length = nl; B.smoke.length = ns; B.anims.length = na; }
}
/** run fn on private random streams (salted by part), leaving the Builder's own streams where they were */
function aside(B, salt, fn) {
  const r = B.r, dr = B._dr;
  B.r = mulberry32((B.seed * 7919 + salt * 104729 + 1) >>> 0); B._dr = mulberry32((B.seed * 6271 + salt * 15485863 + 11) >>> 0);
  try { fn(); } finally { B.r = r; B._dr = dr; }
}
/** a part with an unstyled look (orig) and a styled one (alt) */
function part(B, styled, salt, orig, alt) { if (!styled) return orig(); ghost(B, orig); aside(B, salt, alt); }

/** a window in a chosen style for a ~w x h opening (local face frame, centred). kind: shoji | round | lattice
 *  (lattice = the village's koshi window, parts.latticeWindow, the same one the remodelled homes get) */
function styledWin(B, kind, { w, h, box = false, flowers, frame, trim }) {
  if (kind === 'round') return roundWindow(B, { r: Math.min(w, h) / 2 + 0.03, lattice: 'fine', box, flowers, frame, trim });
  if (kind === 'lattice') return latticeWindow(B, { w, h, box, flowers, frame, trim });
  return shoji(B, { w, h, box, flowers, frame, trim, dress: B._dress === 'grille' ? 'sudare' : undefined });
}
/** a picket fence run in a chosen colour (posts, two rails, pointed pickets), along a -> b ([x, z]) */
function colourPicket(B, a, b, color, h = 0.45) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), post = shade(color, 0.84), rail = shade(color, 0.93);
  B.at([a[0], 0, a[1]], Math.atan2(dx, dz), () => {
    const np = Math.max(1, Math.round(L / 0.9));
    for (let i = 0; i <= np; i++) {
      const p = G.box(0.1, h + 0.12, 0.1, 0.025); p.rotateY(B.wob(0.1)); p.translate(0, (h + 0.12) / 2, i * L / np); B.add(p, post);
      const c = G.cone(0.08, 0.1, 4); c.rotateY(PI / 4); c.translate(0, h + 0.17, i * L / np); B.add(c, post);
    }
    for (const y of [h * 0.3, h * 0.72]) { const r = G.box(0.05, 0.07, L, 0.015); r.translate(0.04, y, L / 2); B.add(r, rail); }
    const n = Math.max(2, Math.round(L / 0.16));
    for (let i = 0; i < n; i++) {
      const hh = h * B.rand(0.85, 1.0);
      const p = G.box(0.035, hh, 0.1, 0.012); p.translate(0.08, hh / 2, (i + 0.5) * L / n); B.add(p, B.pick([color, shade(color, 0.96), mixc(color, '#ffffff', 0.25)]));
      const tip = G.cone(0.05, 0.07, 4); tip.scale(0.5, 1, 1); tip.translate(0.08, hh + 0.03, (i + 0.5) * L / n); B.add(tip, color);
    }
  });
}
/** the front fence (two runs either side of the path) in a style: picket | bamboo | rail | rope | hedge */
function chewyFence(B, style, color) {
  const runs = [[[-1.45, 1.42], [-0.5, 1.42]], [[0.7, 1.42], [1.45, 1.42]]];
  for (const [a, b] of runs) {
    if (style === 'hedge') B.at([0, 0, a[1]], 0, () => hedge(B, a[0], b[0], { h: 0.36, d: 0.24, color: '#5aa04e', flowers: color && color !== FENCE_COLORS.natural.c ? [color, '#ffffff'] : ['#ffb0d0', '#ffffff'] }));
    else if (style === 'picket') colourPicket(B, a, b, color || '#fff6ea');
    else fence(B, a, b, { style, h: style === 'bamboo' ? 0.5 : 0.45, color: style === 'bamboo' && (!color || color === FENCE_COLORS.natural.c) ? undefined : color });
  }
}
/** zabuton cushion (local, sits on y = 0): a plump squashed pillow with a tuft */
function zabuton(B, x, z, c, s = 1) {
  const g = G.sph(0.15 * s, 12, 7); g.scale(1, 0.26, 1); g.translate(x, 0.04 * s, z); B.add(g, (p, n, o) => o.set(c).multiplyScalar(0.86 + 0.16 * clamp(n.y)));
  const t = G.sph(0.022 * s, 6, 4); t.scale(1, 0.6, 1); t.translate(x, 0.078 * s, z); B.add(t, shade(c, 0.75));
}
/** Chewy's dog bed (local, on y = 0): a round wicker basket, a fat red cushion, a bone toy */
function dogBed(B, r = 0.2) {
  const rim = G.torus(r, 0.055, 7, 16); rim.rotateX(PI / 2); rim.translate(0, 0.1, 0); B.add(rim, (p, n, o) => o.set('#d8a868').multiplyScalar(0.88 + 0.14 * Math.sin(Math.atan2(p.z, p.x) * 18)));
  const base = G.cyl(r + 0.02, r + 0.03, 0.08, 16); base.translate(0, 0.04, 0); B.add(base, '#c89858');
  const cush = G.sph(r * 0.92, 14, 7); cush.scale(1, 0.32, 1); cush.translate(0, 0.1, 0); B.add(cush, (p, n, o) => o.set('#e8503a').multiplyScalar(0.84 + 0.18 * clamp(n.y)));
  B.at([0.03, 0.17, 0.02], 0.6, () => symbol(B, 'bone', 0.2, { depth: 0.04 }), 1, -PI / 2);
}
/** a little tea tray: lacquer tray, a round teapot, two cups (local, on y = 0) */
function teaTray(B) {
  const tray = G.box(0.26, 0.03, 0.18, 0.012); tray.translate(0, 0.015, 0); B.add(tray, '#7a3a30');
  const pot = G.sph(0.055, 9, 6); pot.scale(1, 0.85, 1); pot.translate(-0.05, 0.075, 0); B.add(pot, '#8aa88a');
  const lid = G.sph(0.02, 6, 4); lid.translate(-0.05, 0.125, 0); B.add(lid, '#6a886a');
  const sp = G.cyl(0.008, 0.013, 0.05, 5); sp.rotateZ(-1.0); sp.translate(0.008, 0.08, 0); B.add(sp, '#8aa88a');
  for (const [x, z] of [[0.07, -0.04], [0.08, 0.05]]) { const c = G.cyl(0.024, 0.018, 0.04, 8); c.translate(x, 0.05, z); B.add(c, '#fff6ea'); }
}
/** a small dormer on a roof slope: front wall at (fx, fz) in the roof's frame facing yaw (0 = +z, PI/2 = +x), its
 *  cheeks sunk into the slope, a window and its own little gable roof running back until it meets the main roof */
function dormer(B, info, { fx, fz, yaw, w = 0.58, hw = 0.46, rise = 0.24, yBase, roofCol, wall, frame, kind = 'round' }) {
  const sx = Math.sin(yaw), sz = Math.cos(yaw), Y = s => info.yAt(fx + sx * s, fz + sz * s);
  const yF = Y(0), yT = yF + hw;
  let sb = -0.05; while (sb > -1.6 && Y(sb) < yT + rise + 0.1) sb -= 0.02;
  const depth = -sb;
  B.push([fx, 0, fz], yaw);
  const body = G.box(w, yT - yBase, depth, 0.03); body.translate(0, (yT + yBase) / 2, -depth / 2); B.add(body, { grad: [shade(wall, 0.9), wall], y0: yF, y1: yT });
  for (const s of [-1, 1]) { const p = G.beam(0.075, hw + 0.04, 0.075, 0.014); p.translate(s * (w / 2 - 0.025), yF + hw / 2, 0.006); B.add(p, frame); }
  const hb = G.beam(w + 0.04, 0.07, 0.08, 0.014); hb.translate(0, yT - 0.04, 0.012); B.add(hb, frame);
  const sill = G.beam(w + 0.08, 0.06, 0.1, 0.014); sill.translate(0, yF + 0.035, 0.02); B.add(sill, shade(frame, 0.88));
  B.at([0, yF + hw * 0.5 + 0.015, 0], 0, () => {
    if (kind === 'round') { // a porthole: a big glowing pane in a slim ring (roundWindow's ring is too fat this small)
      const pane = G.disc(0.13, 16); pane.translate(0, 0, 0.026); B.glow(pane, C.paper);
      const ring = G.torus(0.135, 0.026, 6, 18); ring.translate(0, 0, 0.034); B.add(ring, frame);
      for (const r of [0, PI / 2]) { const b = G.box(0.018, 0.25, 0.016, 0); b.rotateZ(r); b.translate(0, 0, 0.034); B.add(b, frame); }
    } else { shoji(B, { w: 0.3, h: 0.26, frame, trim: false, sill: false, cell: kind === 'lattice' ? 0.1 : 0.15, cellY: 0.13 }); if (kind === 'lattice') grille(B, 0.26, 0.22, { color: shade(frame, 1.05), z: 0.085 }); }
  });
  const r = B.at([0, 0, -depth / 2], 0, () => roof(B, { type: 'gable', ridge: 'z', w, d: depth, y0: yT, over: 0.1, gOver: 0.13, H: rise, curve: 0.25, lift: 0.08, liftW: 0.18, thick: 0.08, ribW: 0.2, ribAmp: 0.025, course: 0, color: roofCol, gableColor: wall, vent: false, oni: false }));
  B.pop();
  void r;
}
/** the L2/L3 veranda on the front-right corner, in the main block's frame (front wall at z = zf) */
function chewyPorch(B, { zf, y0, roofCol, frame, wall, cushion }) {
  const deckY = y0 + 0.02, depth = 0.64, x0 = 0.67, x1 = 1.42, zp = zf + depth - 0.07, postTop = 1.1;
  engawa(B, { x0, x1, z: zf, depth, y: deckY, step: false });
  const wood = frame || C.timber;
  posts(B, [0.81, 1.37], zp, postTop, wood, 0.055);
  posts(B, [1.37], zf + 0.02, postTop, wood, 0.055);
  const fb = G.beam(x1 - 0.72 + 0.12, 0.1, 0.1, 0.02); fb.translate((0.75 + x1) / 2, postTop - 0.03, zp); B.add(fb, wood);
  const sb = G.beam(0.1, 0.1, zp - zf + 0.1, 0.02); sb.translate(1.37, postTop - 0.03, (zp + zf) / 2); B.add(sb, wood);
  // knee braces at the posts
  for (const [x, z, s] of [[0.81, zp, 1], [1.37, zp, -1]]) B.add(bar(V(x, postTop - 0.3, z), V(x + s * 0.2, postTop - 0.06, z), 0.05, 0.012), wood);
  // the lean-to: high side on the front wall, low eave past the posts
  const over = 0.14, dS = zp - zf - 0.11, zcS = zf + 0.11 + dS / 2, xs0 = 0.8, xs1 = 1.45, gO = 0.06;
  let pr;
  B.at([(xs0 + xs1) / 2, 0, zcS], 0, () => { pr = roof(B, { type: 'shed', w: xs1 - xs0 - 2 * gO, d: dS, y0: postTop + 0.04, over, gOver: gO, H: 0.3, curve: 0.32, lift: 0.12, liftW: 0.22, thick: 0.08, ribW: 0.2, ribAmp: 0.03, course: 0.17, courseAmp: 0.022, ends: true, color: roofCol }); });
  // a beam under the lean-to's back edge where it runs past the house corner
  const yBack = pr.underAt(0, -(dS / 2 + over) + 0.06) - 0.05;
  const bb = G.beam(xs1 - 1.08, 0.08, 0.08, 0.015); bb.translate((1.08 + xs1) / 2, yBack, zf - 0.01); B.add(bb, wood);
  // porch life: cushions and the tea tray, Chewy's dog bed, a lantern and a wind chime on the beam
  B.at([0, deckY, 0], 0, () => {
    zabuton(B, 0.92, zf + 0.28, cushion || '#6a8ac8'); zabuton(B, 0.98, zf + 0.5, '#e8a04a', 0.9);
    B.at([1.16, 0, zf + 0.42], 0.2, () => teaTray(B));
    B.at([1.18, 0, zf + 0.17], 0, () => dogBed(B, 0.17));
  });
  B.at([0.86, postTop - 0.1, zp + 0.02], 0, () => chochin(B, { r: 0.09, h: 0.18, cord: 0.03, color: C.red }));
  B.at([1.2, postTop - 0.08, zp + 0.02], 0, () => charm(B, 'furin', { color: '#bfe6ff' }));
  B.light([1.05, 1.0, zp + 0.25], { ...LAMP, intensity: 2.4, radius: 4.5 });
  const st = puff(V(0, 0, 0), 0.24, { detail: 1, noise: 0.2, squash: 0.35, seed: B.seed + 21 }); st.scale(1.3, 1, 0.85); st.translate(1.06, 0.07, zf + depth + 0.2); B.add(st, STONES[0]);
  void wall;
}
/** a style set's flourish, in the main block's frame (front wall at z = zf, the block centred at world z = zc):
 *  machiya = an inuyarai curved bamboo screen under the right window, cottage = a white rose arch over the gate,
 *  teaHouse = a stone lantern by the gate + a red parasol, seaside = glass floats under the eave + a life ring */
function setAccent(B, set, { zf, zc, y0, info, frame, blk, L }) {
  if (set === 'machiya') { // under the right side window (the doghouse hides the front-left wall from the game camera)
    onFace(B, blk, 'r', 0, 0, () => {
      const x0 = -0.45, x1 = 0.15, n = 8, D = 0.14, Hs = 0.5, z0 = 0.09;
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * (x1 - x0) / n, pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(x, 0.03 + t * Hs, z0 + D * (1 - Math.sin(t * PI / 2))), r: 0.02 }); }
        B.add(tube(pts, 5, true), B.dpick(['#7a5a3a', '#6a4a30', '#86643e']));
      }
      for (const [y, dz] of [[0.14, 0.085], [0.36, 0.035]]) { const r = G.cyl(0.017, 0.017, x1 - x0 + 0.06, 5); r.rotateZ(PI / 2); r.translate((x0 + x1) / 2, y, z0 + dz + 0.022); B.add(r, '#4a3424'); }
    });
  } else if (set === 'cottage') { // a white rose arch over the garden gate (Chewy walks through it to his door)
    const gx0 = -0.43, gx1 = 0.63, gz = 1.42 - zc, cx = (gx0 + gx1) / 2, R = (gx1 - gx0) / 2, yP = 0.92, WH = '#fff4e6';
    for (const x of [gx0, gx1]) {
      B.add(G.beam(0.075, yP + 0.04, 0.075, 0.016).translate(x, (yP + 0.04) / 2, gz), WH);
      B.add(G.box(0.13, 0.05, 0.13, 0.016).translate(x, 0.025, gz), '#e2d6c6');
    }
    for (const dz of [-0.055, 0.055]) { const g = G.torus(R, 0.028, 6, 20, PI); g.translate(cx, yP, gz + dz); B.add(g, WH); }
    for (let k = 0; k <= 6; k++) { const an = k / 6 * PI, r = G.box(0.026, 0.026, 0.13, 0); r.translate(cx + Math.cos(an) * R, yP + Math.sin(an) * R, gz); B.add(r, '#f0e4d4'); }
    // the rose vine: leaves all the way up both posts and over the top, roses clustered toward the crown
    const vine = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      if (t < 0.28) vine.push([gx0 + 0.02, 0.08 + t / 0.28 * (yP - 0.08)]);
      else if (t > 0.72) vine.push([gx1 - 0.02, 0.08 + (1 - t) / 0.28 * (yP - 0.08)]);
      else { const an = PI - (t - 0.28) / 0.44 * PI; vine.push([cx + Math.cos(an) * (R + 0.01), yP + Math.sin(an) * (R + 0.01)]); }
    }
    vine.forEach(([x, y], k) => {
      for (const side of [-1, 1]) {
        if ((k + (side > 0 ? 1 : 0)) % 2) continue;
        const lf = leafGeo(0.075 + (k % 3) * 0.012, 0.032, 0.25); lf.rotateX(PI / 2); lf.rotateZ(k * 2.3 + side); lf.rotateY(B.dwob(0.5));
        lf.translate(x + B.dwob(0.03), y + B.dwob(0.03), gz + side * 0.085); B.add(lf, B.dpick(['#4f9444', '#5ea84c', '#6cb452']), 'leaf');
      }
      const top = y > yP + R * 0.35, roseHere = top ? k % 2 === 0 : k % 5 === 2;
      if (!roseHere) return;
      for (const side of [-1, 1]) {
        if (!top && side < 0) continue;
        const rose = blossomGeo(0.05, 5, 0.5, false, 3); rose.rotateX(PI / 2.3 * side); rose.translate(x, y + 0.01, gz + side * 0.1);
        const c0 = col(B.dpick(['#ff8fb0', '#ff6f8f', '#ffb0c8', '#fff0f4'])); B.add(rose, (q, n, o) => o.copy(c0).lerp(col('#ffffff'), clamp(Math.hypot(q.x - x, q.y - y - 0.01) / 0.05 - 0.5) * 0.3), 'leaf');
        const bud = G.ico(0.022, 0); bud.translate(x, y + 0.015, gz + side * 0.11); B.add(bud, '#' + c0.clone().multiplyScalar(0.8).getHexString(), 'leaf');
      }
    });
  } else if (set === 'teaHouse') { // a stone lantern by the gate and a red nodate parasol over the flower bed
    B.at([-0.3, 0, 1.2 - zc], 0.3, () => toro(B, { s: 0.42 }));
    B.at([-1.08, 0, 1.05 - zc], 0, () => parasol(B, { r: 0.4, h: 1.12, color: '#d8483a', ribs: 10 }));
  } else if (set === 'seaside') { // glass fishing floats under the front eave, a life ring on the gate post
    const x = -1.0, z = zf + 0.16;
    B.at([x, info.underAt(x, z) - 0.01, z], 0.1, () => glassFloats(B, { n: 3 }));
    B.at([0.7, 0.36, 1.42 - zc + 0.08], 0.15, () => {
      const ring = G.torus(0.12, 0.042, 8, 20); B.add(ring, (p, n, o) => o.set(Math.floor((Math.atan2(p.y, p.x) / PI + 1) * 4 + 0.5) % 2 ? '#fff6ea' : '#f0644a').multiplyScalar(0.9 + 0.12 * clamp(n.z * 0.5 + 0.5)));
      const rope = G.torus(0.12, 0.012, 4, 20); rope.translate(0, 0, 0.035); B.add(rope, '#e8d8a8');
      const peg = G.box(0.04, 0.04, 0.06, 0); peg.translate(0, 0.13, -0.03); B.add(peg, C.woodDark);
    });
  }
  void frame;
}
/** a quilted futon airing over a rail (local: the rail runs along x at y = 0, z = 0): a soft rolled fold over the
 *  rail, a long drop outside (+z) and a short one inside, polka dots, a white sheet edge, tie tufts */
function softFuton(B, { w = 0.56, color = '#ff9ec0', dot = '#ffffff' } = {}) {
  const c0 = col(color), lo = col(shade(color, 0.8));
  const fold = G.cyl(0.05, 0.05, w, 12); fold.rotateZ(PI / 2); fold.scale(1, 0.85, 1.2); fold.translate(0, 0.035, 0);
  B.add(fold, (p, n, o) => o.copy(lo).lerp(c0, clamp(n.y * 0.6 + 0.6)));
  for (const [s, L] of [[1, 0.4], [-1, 0.26]]) {
    const place = g => { g.rotateX(-s * 0.1); g.translate(0, 0.035 - L / 2, s * 0.055); return g; };
    const slab = place(new RoundedBox(w, L, 0.055, 2, 0.024));
    B.add(slab, (p, n, o) => o.copy(lo).lerp(c0, clamp(0.55 + (p.y - 0.035) / L * 0.9 + n.y * 0.2)));
    if (s < 0) continue;
    B.add(place(new RoundedBox(w + 0.012, 0.05, 0.064, 1, 0.022).translate(0, -L / 2 + 0.03, 0)), '#fff6ea');
    for (let i = 0; i < 5; i++) B.add(place(G.disc(0.024, 8).translate(-w * 0.36 + i * w * 0.18, L / 2 - 0.1 - (i % 2) * 0.11, 0.0285)), dot);
  }
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) { const t = G.sph(0.02, 6, 4); t.translate(x, 0.08, 0); B.add(t, shade(color, 0.7)); }
}
/** a bone weathervane on a ridge (local, foot at y = 0): saddle, post, gold ball, compass arms, a swinging bone vane */
function weathervane(B) {
  const saddle = G.box(0.16, 0.08, 0.16, 0.03); saddle.translate(0, 0.04, 0); B.add(saddle, '#6a5a64');
  const post = G.cyl(0.026, 0.032, 0.62, 7); post.translate(0, 0.38, 0); B.add(post, '#4a4650');
  const ball = G.sph(0.05, 9, 6); ball.translate(0, 0.32, 0); B.add(ball, C.gold);
  for (const a of [0, PI / 2]) { const arm = G.cyl(0.016, 0.016, 0.34, 5); arm.rotateZ(PI / 2); arm.rotateY(a); arm.translate(0, 0.42, 0); B.add(arm, '#4a4650'); }
  for (let k = 0; k < 4; k++) { const e = G.sph(0.03, 6, 4); e.translate(Math.cos(k * PI / 2) * 0.17, 0.42, Math.sin(k * PI / 2) * 0.17); B.add(e, C.gold); }
  const cap = G.sph(0.04, 8, 6); cap.translate(0, 0.7, 0); B.add(cap, C.gold);
  B.anim({ p: [0, 0.6, 0], kind: 'swing', axis: [0, 1, 0], speed: 0.45, amp: 0.55 }, () => {
    B.at([0.02, 0, -0.03], 0, () => symbol(B, 'bone', 0.36, { depth: 0.035 }));
    const head = G.cone(0.07, 0.15, 6); head.rotateZ(-PI / 2); head.scale(1, 1, 0.45); head.translate(0.24, 0, 0); B.add(head, C.red);
    const tail = G.box(0.13, 0.16, 0.03, 0.012); tail.rotateZ(0.2); tail.translate(-0.24, 0.02, 0); B.add(tail, C.gold);
  });
}

export function chewyHouse(B, level = B.level ?? 1) {
  const L = clamp(level | 0, 1, 3), S = styleOf(B), st = S.raw;
  const roofCol = S.roof('#d8604a'), wall = S.wall('#fff4e2');
  const frame = st.trim ? S.trim(C.timber) : undefined; // (undefined: the parts' own timber)
  const koshi = st.trim ? mixc(S.trim(C.timber), '#f2dcc0', 0.42) : '#c9a27a';
  const dogCol = st.wall ? mixc(wall, '#ffd2a8', 0.26) : '#ffe6c8', archCol = st.trim ? S.trim(C.woodMid) : C.woodMid;
  const winKind = st.window || null, roofType = S.roofType('gable'), norenCol = S.noren(null);
  const w = 2.2, d = 1.65, h = 1.45, y0 = 0.28, zc = -0.55;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0 });
  walls(B, { w, d, h, y0, plaster: wall, koshi, koshiSkip: ['f'], frame });
  const blk = { w, d };
  // windows (from L2 the front-right one sits a little lower, under the veranda's lean-to)
  const fy = L >= 2 ? 0.74 : 0.82, fh = L >= 2 ? 0.4 : 0.44;
  const WINS = [
    ['f', -0.62, 0.82, { w: 0.52, h: 0.52, box: true, flowers: ['#ffd24a', '#ff8fb0'] }, () => roundWindow(B, { r: 0.26, lattice: 'fine', box: true, flowers: ['#ffd24a', '#ff8fb0'], frame })],
    ['f', 0.7, fy, { w: 0.46, h: fh }, () => shoji(B, { w: 0.46, h: fh, frame })],
    ['r', 0, 0.84, { w: 0.62, h: 0.48, box: true }, () => shoji(B, { w: 0.62, h: 0.48, box: true, frame })],
    ['l', 0, 0.84, { w: 0.48, h: 0.48 }, () => roundWindow(B, { r: 0.24, frame })],
    ['b', 0, 0.84, { w: 0.6, h: 0.46 }, () => shoji(B, { w: 0.6, h: 0.46, frame })],
  ];
  part(B, !!winKind, 1, () => { for (const [f, u, y, , fn] of WINS) onFace(B, blk, f, u, y0 + y, fn); },
    () => { for (const [f, u, y, o] of WINS) onFace(B, blk, f, u, y0 + y, () => styledWin(B, winKind, { ...o, frame })); });
  // roofs: L1/L2 the cottage roof (+ chimney), L3 a pent roof, the upper storey and its own roof
  let info, top = null, low = null, dogRoof = null;
  const y2Info = {};
  if (L < 3) {
    const opts = { w, d, y0: y0 + h, thick: 0.15, ribW: 0.26, color: roofCol };
    part(B, roofType !== 'gable', 2, () => {
      info = roof(B, { ...opts, type: 'gable', ridge: 'z', over: 0.36, gOver: 0.3, H: 1.05, curve: 0.3, lift: 0.16, liftW: 0.5, gableColor: wall });
      chimney(B, -0.6, -0.3, info.yAt(-0.6, -0.3) - 0.3, info.ridgeY + 0.05, 0.95);
    }, () => {
      info = roofType === 'hip'
        ? roof(B, { ...opts, type: 'hip', over: 0.36, H: 0.98, curve: 0.3, lift: 0.22, liftW: 0.6 })
        : roof(B, { ...opts, type: 'irimoya', over: 0.36, gOver: 0.22, H: 1.02, curve: 0.34, lift: 0.26, liftW: 0.7, tg: 0.5, gable: 'plaster', gableColor: wall });
      chimney(B, -0.6, -0.3, info.yAt(-0.6, -0.3) - 0.3, info.ridgeY + 0.05, 0.95);
    });
    top = info;
  } else {
    low = info = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.32, H: 0.66, curve: 0.35, lift: 0.2, liftW: 0.6, thick: 0.12, ribW: 0.26, color: roofCol, tTop: 0.46 });
    top = chewyUpper(B, { low, wall, frame, roofCol, roofType, winKind, w, d, S, st, out: y2Info });
  }
  // L2: a dormer on the slope the camera sees (the right slope / hip end; the front-left on an irimoya roof)
  if (L === 2) {
    const dk = winKind || 'round', yBase = y0 + h - 0.02, fr = frame || C.timber;
    if (roofType === 'gable') dormer(B, info, { fx: 0.9, fz: 0, yaw: PI / 2, w: 0.62, roofCol, wall, frame: fr, kind: dk, yBase });
    else if (roofType === 'hip') dormer(B, info, { fx: 1.02, fz: 0, yaw: PI / 2, w: 0.5, hw: 0.4, rise: 0.2, roofCol, wall, frame: fr, kind: dk, yBase });
    else dormer(B, info, { fx: -0.66, fz: 0.68, yaw: 0, w: 0.54, hw: 0.42, rise: 0.22, roofCol, wall, frame: fr, kind: dk, yBase });
  }
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
  front.translate(0, y0, pd / 2 - 0.1); B.add(front, dogCol);
  for (const sx of [-1, 1]) { const sw = G.box(0.1, ph, pd, 0.03); sw.translate(sx * (hw - 0.05), y0 + ph / 2, 0); B.add(sw, dogCol); }
  const arch = G.torus(ar + 0.03, 0.045, 6, 14, PI); arch.translate(0, y0 + ph * 0.55, pd / 2 + 0.03); B.add(arch, archCol);
  for (const sx of [-1, 1]) { const jamb = G.box(0.08, ph * 0.55, 0.08, 0.02); jamb.translate(sx * (ar + 0.03), y0 + ph * 0.275, pd / 2 + 0.03); B.add(jamb, archCol); }
  const floor = G.box(pw - 0.1, 0.04, pd, 0); floor.translate(0, y0 + 0.02, 0); B.add(floor, C.woodLight);
  // the door inside the arch: Chewy's plain panel, or the style's door
  part(B, !!st.door, 3, () => {
    const inner = G.box(0.62, 1.0, 0.04, 0); inner.translate(0, y0 + 0.5, -pd / 2 + 0.05); B.add(inner, S.doorColor('#7a5240'));
    const knob = G.sph(0.035, 6, 4); knob.translate(0.18, y0 + 0.5, -pd / 2 + 0.08); B.add(knob, C.gold);
  }, () => B.at([0, y0 + 0.04, -pd / 2 + 0.035], 0, () => doorway(B, { w: 0.56, h: 0.94, style: st.door, wood: S.doorColor(C.woodLight), frame: frame || C.timber })));
  // (under a hip or irimoya roof the doghouse gable runs further back, so its ridge dives into the main front slope
  // like a chidori gable instead of stopping in mid-air; under the cottage's own gable the front gable wall hides it)
  const ext = L < 3 && roofType !== 'gable' ? 0.36 : 0;
  const dogOpts = { type: 'gable', ridge: 'z', w: pw, d: pd, y0: y0 + ph, over: 0.16, gOver: 0.14, H: 0.55, curve: 0.2, lift: 0.1, liftW: 0.3, thick: 0.1, ribW: 0.2, ribAmp: 0.03, course: 0, color: roofCol, vent: false, gableColor: dogCol, oni: false };
  let pr;
  if (ext) { B.push([0, 0, -ext / 2]); pr = roof(B, { ...dogOpts, d: pd + ext }); B.pop(); } else pr = roof(B, dogOpts);
  dogRoof = pr;
  // bone sign on the porch gable + bone ornament on the ridge
  B.at([0, y0 + ph + 0.2, pd / 2 + 0.2], 0, () => symbol(B, 'bone', 0.46, { depth: 0.07 }));
  B.at([0, pr.ridgeY + 0.1, pd / 2 - 0.02], 0, () => symbol(B, 'paw', 0.16, { colors: ['#8a4a2c'] }));
  B.at([0.22, y0 + ph - 0.04, pd / 2 + 0.08], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.05, color: C.red }));
  // Chewy's own rain charm (with floppy ears) on the other side of the arch
  B.at([-0.26, y0 + ph - 0.02, pd / 2 + 0.08], 0, () => charm(B, 'teruDog'));
  // a noren across the arch (when the style has one): a paw on it unless the style picks a mark
  part(B, !!norenCol, 4, () => {}, () => noren(B, { w: 0.5, h: 0.34, y: y0 + 0.84, z: pd / 2 + 0.13, color: norenCol, strips: 2, symbol: () => norenMark(S.norenSym('paw')), symScale: 0.15 }));
  B.pop();
  B.light([px + 0.2, 1.3, pz + 0.7], LAMP);
  // the bone on the top roof: on the front gable peak, or standing on the ridge of a hip / irimoya roof
  const tz = L === 3 ? y2Info.gz : d / 2 + 0.28;
  if (roofType === 'gable') B.at([0, top.ridgeY + 0.14, tz], 0, () => symbol(B, 'bone', L === 3 ? 0.32 : 0.36, { depth: 0.06 }));
  else B.at([0, top.ridgeY + (L === 3 ? 0.24 : 0.28), (L === 3 ? y2Info.z2 : 0) + 0.02], 0, () => symbol(B, 'bone', L === 3 ? 0.32 : 0.36, { depth: 0.06 }));
  // a rain chain off the left eave, a wind chime at the right, a bone-shaped name plate by the side window
  { const cx = -(w / 2 + 0.2), cz = d / 2 - 0.12; rainChain(B, cx, info.underAt(cx, cz), cz, 0, { color: '#c8a060' }); }
  eaveCharm(B, info, w / 2 + 0.2, d / 2 - 0.3, 'furin', { color: '#ffd0e0' });
  if (L >= 2) chewyPorch(B, { zf: d / 2, y0, roofCol, frame, wall, cushion: norenCol });
  // a complete style set adds its own small flourish (on a private random stream: nothing else moves)
  if (S.set) aside(B, 9, () => setAccent(B, S.set, { zf: d / 2, zc, y0, info, frame, blk, L }));
  B.pop();
  // yard: mailbox, dog bowl, tennis ball, picket fence, flowers
  B.at([1.05, 0, 1.2], -0.3, () => mailbox(B, S.doorColor('#e8403a')));
  B.at([-0.7, 0, 0.62], 0, () => {
    const bowl = G.lathe([[0.001, 0], [0.14, 0], [0.17, 0.08], [0.13, 0.08], [0.001, 0.03]], 12); B.add(bowl, C.red);
    B.at([0, 0.08, 0], 0.4, () => symbol(B, 'bone', 0.18, { depth: 0.04 }), 1, -PI / 2);
  });
  const ball = G.sph(0.08, 10, 8); ball.translate(-1.1, 0.08, 1.2); B.add(ball, (p, n, o) => o.set(Math.abs(p.y - 0.08 + Math.sin(p.x * 30) * 0.02) < 0.012 ? '#fff6ea' : '#e8322c'));
  part(B, !!(st.fence || st.fenceColor), 5, () => {
    fence(B, [-1.45, 1.42], [-0.5, 1.42], { style: 'picket', h: 0.45 });
    fence(B, [0.7, 1.42], [1.45, 1.42], { style: 'picket', h: 0.45 });
  }, () => chewyFence(B, S.fence('picket'), st.fenceColor ? S.fenceColor() : null));
  B.at([-1.15, 0, 0.9], 0, () => flowerPatch(B, { w: 0.5, d: 0.45, n: 7, colors: ['#ffd24a', '#ff8fb0', '#ffffff'] }));
  B.at(L >= 2 ? [1.24, 0, -1.26] : [1.2, 0, -1.2], 0, () => bush(B, { r: 0.3, flowers: ['#ff9ec0'] }));
  B.at([-1.2, 0, -1.2], 0, () => barrel(B, { r: 0.16, h: 0.34 }));
  // Chewy's gi and red scarf drying on the line, firewood under the chimney, a watering can by the flowers
  if (L >= 2) B.at([1.33, 0, -0.46], PI / 2, () => laundry(B, { L: 1.0, h: 1.15, colors: ['#2c3a6a', '#e8403a', '#ffffff', '#2c3a6a'] }));
  else B.at([1.33, 0, -0.2], PI / 2, () => laundry(B, { L: 1.2, h: 1.15, colors: ['#2c3a6a', '#e8403a', '#ffffff', '#2c3a6a'] }));
  B.at([-1.26, 0, -0.35], -PI / 2, () => firewood(B, { w: 0.7, h: 0.42, d: 0.2 }));
  B.at([-0.72, 0, 1.12], 2.2, () => wateringCan(B, '#e8807a'));
  stepStones(B, 0.1, 0.55, 0.1, 1.35, 3);
  // festival bunting: from the doghouse gable peak out to the front corners of the roof above
  if (S.bunting) {
    const peak = [px, dogRoof.ridgeY + 0.08, zc + pz + pd / 2 + 0.22], ez = d / 2 + (L === 3 ? 0.26 : 0.28);
    const corner = sx => [sx * 1.38, info.underAt(sx * 1.38, ez) + 0.02, zc + ez];
    aside(B, 10, () => {
      bunting(B, [corner(-1), peak, corner(1)], { sag: 0.14, size: 0.13, gap: 0.16 });
      // from L2 a third garland swags along the veranda's front beam
      if (L >= 2) bunting(B, [[0.76, 1.08, zc + d / 2 + 0.6], [1.47, 1.08, zc + d / 2 + 0.6]], { sag: 0.08, size: 0.12, gap: 0.15, phase: 2 });
    });
  }
  B.door.set(0.1, 0, 1.45);
  B.height = L === 3 ? top.ridgeY + 0.85 : 3.6;
}

/** L3's upper storey on the pent roof `low` (main block frame): walls, a big round window over the doghouse, a door
 *  out to a drying balcony on the right, its own roof (style shape) with the chimney and the bone weathervane.
 *  Returns the top roof's info; out.gz = the z of its front gable peak, out.z2 = the storey's centre z. */
function chewyUpper(B, { low, wall, frame, roofCol, roofType, winKind, w, d, S, st, out }) {
  const y2 = low.topY, w2 = 1.7, d2 = 1.16, h2 = 1.1, z2 = 0;
  const wall0 = B._wall;
  walls(B, { w: w2, d: d2, h: h2, y0: y2, cz: z2, plaster: wall, frame });
  const blk2 = { w: w2, d: d2, cz: z2 };
  // windows: the big round one above the doghouse, small ones on the left and back
  const UW = [
    ['f', 0.1, 0.64, { w: 0.56, h: 0.56 }, () => roundWindow(B, { r: 0.28, lattice: 'fine', frame })],
    ['l', 0, 0.6, { w: 0.5, h: 0.42 }, () => shoji(B, { w: 0.5, h: 0.42, frame })],
    ['b', 0, 0.6, { w: 0.6, h: 0.42 }, () => shoji(B, { w: 0.6, h: 0.42, frame })],
  ];
  part(B, !!winKind, 6, () => { for (const [f, u, y, , fn] of UW) onFace(B, blk2, f, u, y2 + y, fn); },
    () => { for (const [f, u, y, o] of UW) onFace(B, blk2, f, u, y2 + y, () => styledWin(B, winKind, { ...o, frame })); });
  // the balcony door on the right wall
  const bdoor = (style, fn) => onFace(B, blk2, 'r', 0, y2 + 0.02, () => fn(B, { w: 0.6, h: 0.86, style, wood: S.doorColor(C.woodLight), frame: frame || C.timber }));
  part(B, !!st.door, 8, () => bdoor('shoji', door), () => bdoor(st.door, doorway));
  // drying balcony (monohoshi) on the right: a deck on stilts standing on the pent roof, a railing, a futon airing
  const bx0 = w2 / 2, bx1 = w / 2 + 0.3, bz = 0.46, by = y2 + 0.04, wood = frame || C.timber;
  const deck = G.box(bx1 - bx0 + 0.04, 0.07, 2 * bz, 0.02); deck.translate((bx0 + bx1) / 2, by - 0.035, z2); B.add(deck, C.woodLight);
  for (let i = 0; i < 5; i++) { const sl = G.box(bx1 - bx0, 0.012, 0.012, 0); sl.translate((bx0 + bx1) / 2, by + 0.001, z2 - bz + (i + 0.5) * 2 * bz / 5); B.add(sl, shade(C.woodLight, 0.82)); }
  const fas = G.beam(0.08, 0.1, 2 * bz + 0.06, 0.016); fas.translate(bx1, by - 0.06, z2); B.add(fas, wood);
  for (const sz of [-1, 1]) {
    const fz = G.beam(bx1 - bx0, 0.1, 0.08, 0.016); fz.translate((bx0 + bx1) / 2, by - 0.06, z2 + sz * bz); B.add(fz, wood);
    const x = bx1 - 0.05, z = z2 + sz * (bz - 0.05), yr = low.yAt(x, z);
    const p = G.beam(0.07, by - yr, 0.07, 0.014); p.translate(x, (by + yr) / 2 - 0.03, z); B.add(p, wood);
    const f = G.box(0.13, 0.04, 0.13, 0.015); f.translate(x, yr + 0.01, z); B.add(f, shade(wood, 0.8));
  }
  const rh = 0.4;
  const rail = G.beam(0.07, 0.06, 2 * bz + 0.04, 0.014); rail.translate(bx1, by + rh, z2); B.add(rail, wood);
  for (const sz of [-1, 1]) { const r2 = G.beam(bx1 - bx0, 0.06, 0.07, 0.014); r2.translate((bx0 + bx1) / 2, by + rh, z2 + sz * bz); B.add(r2, wood); }
  for (let i = 0; i <= 6; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(bx1, by + rh / 2, z2 - bz + i * 2 * bz / 6); B.add(b, wood); }
  for (const sz of [-1, 1]) for (let i = 1; i < 3; i++) { const b = G.box(0.035, rh, 0.035, 0.008); b.translate(bx0 + i * (bx1 - bx0) / 3, by + rh / 2, z2 + sz * bz); B.add(b, wood); }
  B.at([bx1, by + rh + 0.03, z2 - 0.08], PI / 2, () => softFuton(B, { w: 0.56, color: { seaside: '#8fc8ff', machiya: '#8f9ce0', teaHouse: '#a8dca0' }[S.set] || '#ff9ec0' }));
  B.at([bx1 - 0.12, by, z2 + bz - 0.14], 0, () => pot(B, { plant: 'flowers', r: 0.08, h: 0.12, flowers: ['#ff9ec0', '#ffd24a'] }));
  B._wall = wall0;
  // the storey's own roof
  B.push([0, 0, z2]);
  const o = { w: w2, d: d2, y0: y2 + h2, thick: 0.14, ribW: 0.26, color: roofCol };
  let top;
  part(B, roofType !== 'gable', 7, () => { top = roof(B, { ...o, type: 'gable', ridge: 'z', over: 0.3, gOver: 0.28, H: 0.88, curve: 0.3, lift: 0.16, liftW: 0.45, gableColor: wall }); },
    () => { top = roofType === 'hip' ? roof(B, { ...o, type: 'hip', over: 0.32, H: 0.8, curve: 0.32, lift: 0.22, liftW: 0.5 })
      : roof(B, { ...o, type: 'irimoya', over: 0.32, gOver: 0.2, H: 0.86, curve: 0.34, lift: 0.24, liftW: 0.6, tg: 0.5, gable: 'plaster', gableColor: wall }); });
  chimney(B, -0.45, -0.22, top.yAt(-0.45, -0.22) - 0.25, top.ridgeY + 0.04, 0.8);
  if (roofType === 'gable') B.at([0, top.ridgeY + 0.06, -d2 / 2 + 0.05], 0, () => weathervane(B));
  else B.at([roofType === 'hip' ? 0.24 : 0.5, top.ridgeY + 0.06, 0], 0, () => weathervane(B));
  // a string of drying persimmons under the upper front eave
  eaveCharm(B, top, -0.42, d2 / 2 + 0.2, 'persimmon');
  B.pop();
  out.gz = z2 + d2 / 2 + 0.26; out.z2 = z2;
  return top;
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
