// Akane Hamlet (茜の里), the maple zone's harvest hamlet: red-brown sekishu tiles and smoked-silver ibushi tiles,
// bengara red-ochre lattices, dark-stained cedar, cream plaster, a cypress-bark tea house, and the autumn harvest
// everywhere (persimmon curtains, rice racks and straw tawara, chestnuts, red maples and ginkgo) (docs/ZONES.md §2).
// The contract is artBamboo.js's: each building builder draws its static model into a kit Builder (local frame:
// front = +z, the footprint round the origin, ground at y = 0) and returns
//   { fp: [x0, z0, x1, z1], door: [x, z], keeper: [x, z, yaw], seat?: [x, z, yaw], lamps: [[x, y, z]...],
//     siege(B), saved(B) (the overlays, same frame) }
// The siege overlay boards the openings, smears soot, tears the persimmon curtains down and topples the tanuki; the
// saved one hangs noren, fills the racks and the roasting pan, opens the parasols and sets the goods out.
import * as THREE from 'three';
import { Builder, G, V, C, PI, shade } from '../../world/buildings/kit.js';
import { MODELS } from '../../world/buildings/models.js';
import * as F from '../assets/mapleFlora.js';
import * as Pr from '../assets/mapleProps.js';
import { slotAt, slotOf, screenAt, screenYaw } from './data.js';
import { roof } from '../../world/buildings/roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, latticeWindow, door, engawa, posts, noren as norenPart, STONES } from '../../world/buildings/parts.js';
import { barrel, crate, toro } from '../../world/buildings/props.js';
import { teaBench, sack, firewood, parasol, wheel } from '../../world/buildings/props2.js';
import { sudare, broom, stoopStone } from '../../world/buildings/trim.js';
import { symbol as kitSymbol } from '../../world/buildings/symbols.js';
import { tube, puff, merge } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, Noise } from '../../core/util.js';
import { boards, soot, debris, warBanner, waystone } from './art.js';

/** minimap roof colours per building kind */
export const MAP = { elder: '#8a3a2a', inn: '#5e646c', shop: '#8a3a2a', teaHouse: '#704a34', waypoint: '#c8402e' };
// the palette: glazed red-brown sekishu tiles, smoked ibushi tiles, cypress bark, bengara red ochre, dark cedar
export const T = {
  tile: '#8a3a2a', tileEdge: '#cf8e6c', tileUnder: '#5a3a2e',
  ibushi: '#5e646c', ibushiEdge: '#b4bac2', ibushiUnder: '#54443a',
  bark: '#704a34', barkEdge: '#d29a6a', barkUnder: '#8a6448',
  wood: '#3e2c24', woodMid: '#6a4a38', log: '#a8805e', bengara: '#9a3626', lacquer: '#cc3a2a',
  plaster: '#f4eada', clay: '#e6cfa6', deck: '#b8865c', stone: '#a89c90', paper: '#fff6e6', gold: '#e8b84a', straw: '#e2c070',
};
const KAKI = ['#ec7a2c', '#f48c38', '#dc6a28', '#f69c46'];
const KIKU = ['#ffd23a', '#fff4e0', '#ffb43a', '#c87ad8'];
const NUT = ['#6a3a22', '#7a4628', '#5e3220', '#8a5230'];

// ------------------------------------------------------------------ crests (flat, unit size, facing +z)
const SH = () => new THREE.Shape();
const ellS = (x, y, rx, ry, rot = 0) => { const s = SH(); s.absellipse(x, y, rx, ry, 0, TAU, false, rot); return s; };
function momijiShapes() { // a seven-lobed maple leaf with a little stem
  const L = [0.25, 0.35, 0.43, 0.48, 0.43, 0.35, 0.25], st = 37 * PI / 180, at = (a, r) => [Math.sin(a) * r, 0.02 + Math.cos(a) * r];
  const pts = [];
  for (let k = 0; k < 7; k++) { const a = (k - 3) * st, l = L[k]; pts.push(at(a - st / 2, 0.13), at(a - 0.17, l * 0.56), at(a, l), at(a + 0.17, l * 0.56)); }
  pts.push(at(3.5 * st, 0.13));
  const s = SH(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]); s.closePath();
  const stem = SH(); stem.moveTo(-0.025, -0.08); stem.lineTo(0.025, -0.08); stem.lineTo(0.05, -0.44); stem.lineTo(0.005, -0.44); stem.closePath();
  return [s, stem];
}
function kuriBody() { const b = SH(); b.moveTo(0, 0.42); b.quadraticCurveTo(0.12, 0.32, 0.32, 0.1); b.quadraticCurveTo(0.46, -0.14, 0.3, -0.36); b.lineTo(-0.3, -0.36); b.quadraticCurveTo(-0.46, -0.14, -0.32, 0.1); b.quadraticCurveTo(-0.12, 0.32, 0, 0.42); return b; }
function kuriBase() { const b = SH(); b.moveTo(-0.37, -0.1); b.quadraticCurveTo(0, -0.19, 0.37, -0.1); b.quadraticCurveTo(0.35, -0.3, 0.28, -0.37); b.lineTo(-0.28, -0.37); b.quadraticCurveTo(-0.35, -0.3, -0.37, -0.1); return b; }
const CRESTS = {
  momiji: c => [{ shapes: momijiShapes(), color: c || T.lacquer }],
  kuri: () => [{ shapes: [kuriBody()], color: '#7a4428' }, { shapes: [kuriBase()], color: '#ecd09a', z: 0.012 }, { shapes: [ellS(-0.13, 0.08, 0.05, 0.12, -0.35)], color: '#b4804e', z: 0.012 }],
};
/** an extruded crest (back at z = 0) */
function crest(B, name, size, { depth = 0.025, color } = {}) {
  CRESTS[name](color).forEach((L, i) => {
    const g = new THREE.ExtrudeGeometry(L.shapes, { depth, bevelEnabled: false, curveSegments: 5 }); g.deleteAttribute('uv');
    g.scale(size, size, 1); g.translate(0, 0, (L.z ?? 0) * size + i * 0.003); B.add(g, L.color);
  });
}
/** the first layer of a crest as a flat shape (noren / flag prints) */
function flatCrest(name) { const g = new THREE.ShapeGeometry(CRESTS[name]()[0].shapes, 5); return g.index ? g.toNonIndexed() : g; }

// ------------------------------------------------------------------ small helpers
/** a cached kit piece (mapleProps: { body, glow, leaf, cloth }) built into this Builder */
function inject(B, pc, p = [0, 0, 0], yaw = 0, s = 1, rx = 0, rz = 0) {
  B.at(p, yaw, () => { for (const k of ['body', 'glow', 'leaf', 'cloth']) if (pc[k]) B.add(pc[k].clone(), null, k); }, s, rx, rz);
}
/** Draw-call thrift: the static village shares the region's merged prop chunks, one mesh per material per 24 m chunk,
 *  and this daytime region's window glow is all but unlit (emissive ≈ 0.06), so a static model's glow, leaf and cloth
 *  parts are folded into its body bucket: each chunk the hamlet touches then costs one material, not four. */
function flatten(B, keys = ['glow', 'leaf', 'cloth']) { for (const k of keys) { const l = B.buckets[k]; if (l?.length) { B.buckets.body.push(...l); l.length = 0; } } }
/** a cached kit piece reduced to one body geometry (its glow folded in), for the village placer's single d:body batch */
const _bo = new Map();
function bodyOnly(key, make) {
  if (!_bo.has(key)) { const pc = make(), list = ['body', 'glow', 'leaf', 'cloth'].filter(k => pc[k]).map(k => pc[k].clone()); const g = merge(list); g.computeBoundingSphere(); _bo.set(key, { body: g }); }
  return _bo.get(key);
}
const roofTile = (B, o) => roof(B, { color: T.tile, pastel: 0.03, edge: T.tileEdge, under: T.tileUnder, timber: T.wood, moss: 0, lichen: 0.01, ...o });
const roofGrey = (B, o) => roof(B, { color: T.ibushi, pastel: 0.04, edge: T.ibushiEdge, under: T.ibushiUnder, timber: T.wood, moss: 0, lichen: 0.02, ...o });
/** a string of hoshigaki (dried persimmons) hanging from the origin */
function kakiString(B, n, { r = 0.06, gap = 0.105, seed = 0 } = {}) {
  const rr = mulberry32(seed * 977 + 13), top = 0.05, L = top + n * gap;
  const cord = G.box(0.012, L, 0.012, 0); cord.translate(0, -L / 2, 0); B.add(cord, '#b89860');
  for (let i = 0; i < n; i++) {
    const y = -top - i * gap - r * 0.7, k = 0.9 + rr() * 0.2, g = G.ico(r * k, 0); g.scale(1, 0.84, 1); g.rotateY(rr() * TAU); g.translate((rr() - 0.5) * 0.014, y, 0);
    B.add(g, KAKI[Math.floor(rr() * KAKI.length)]);
    const cap = G.box(r * 0.75, 0.016, r * 0.75, 0); cap.rotateY(rr()); cap.translate(0, y + r * 0.8, 0); B.add(cap, '#5a4a26');
  }
}
/** a heap of little round things (chestnuts, persimmons, rice) on a disc of radius R, top at y */
function heap(B, R, y, colors, { n = 14, r = 0.035, seed = 0, dome = 0.5 } = {}) {
  const rr = mulberry32(seed * 131 + 3);
  for (let i = 0; i < n; i++) { const a = rr() * TAU, d = R * Math.sqrt(rr()), g = G.ico(r * (0.85 + rr() * 0.3), 0); g.scale(1, 0.8, 1); g.translate(Math.cos(a) * d, y + r * 0.6 + (1 - d / R) * R * dome * 0.6, Math.sin(a) * d); B.add(g, colors[Math.floor(rr() * colors.length)]); }
}
/** a woven basket (open, top at h) filled with a heap */
function basket(B, { r = 0.16, h = 0.16, fill = NUT, n = 12, seed = 0, fr = 0.035 } = {}) {
  const bk = G.cyl(r, r * 0.78, h, 12, true); bk.translate(0, h / 2, 0); B.add(bk, (p, n2, o) => o.set(Math.sin(p.y * 80) > 0 ? '#c8a060' : '#b08848').multiplyScalar(0.9 + 0.1 * clamp(n2.y + 0.5)));
  const bot = G.cyl(r * 0.78, r * 0.78, 0.02, 10); bot.translate(0, 0.01, 0); B.add(bot, '#9a7a48');
  const rim = G.torus(r * 0.98, 0.014, 3, 12); rim.rotateX(PI / 2); rim.translate(0, h, 0); B.add(rim, '#8a6a3a');
  if (fill) heap(B, r * 0.82, h - 0.03, fill, { n, r: fr, seed });
}
/** a straw rice bale (tawara) lying along local x */
function tawara(B, { L = 0.56, r = 0.17 } = {}) {
  const g = G.cyl(r, r, L, 12); g.rotateZ(PI / 2); g.translate(0, r, 0);
  B.add(g, (p, n, o) => { const side = Math.abs(n.x) > 0.8; o.set(side ? '#c89850' : T.straw).multiplyScalar(side ? 0.9 + 0.1 * Math.sin(Math.hypot(p.y - r, p.z) * 60) : 0.84 + 0.16 * clamp(n.y + 0.3) + 0.05 * Math.sin(p.x * 70)); });
  for (const x of [-L * 0.3, 0, L * 0.3]) { const b = G.torus(r * 1.01, 0.014, 3, 12); b.rotateY(PI / 2); b.translate(x, r, 0); B.add(b, '#8a6a3a'); }
}
/** a tumbled-down daruma (or upright one): a red round figure with a white face */
function daruma(B, { r = 0.09, color = '#d8322a' } = {}) {
  const b = G.sph(r, 10, 8); b.scale(1, 1.08, 0.95); b.translate(0, r, 0); B.add(b, color);
  const f = G.sph(r * 0.62, 8, 6); f.scale(1, 0.85, 0.5); f.translate(0, r * 1.15, r * 0.6); B.add(f, '#fff4e6');
  for (const s of [-1, 1]) { const e = G.sph(r * 0.11, 5, 4); e.translate(s * r * 0.24, r * 1.2, r * 0.9); B.add(e, '#2a2226'); }
  const belly = G.box(r * 0.5, r * 0.3, 0.01, 0); belly.translate(0, r * 0.62, r * 0.93); B.add(belly, C.gold);
}
/** a cloth shop flag on a pole with a crest (nobori), base at the origin, cloth toward +x */
function flag(B, { h = 2.3, w = 0.4, color = '#f6efe0', crestName = 'momiji', crestColor = T.lacquer, hem = T.lacquer } = {}) {
  const pole = G.cyl(0.028, 0.034, h, 6); pole.translate(0, h / 2, 0); B.add(pole, T.wood);
  const bar = G.cyl(0.016, 0.016, w + 0.08, 5); bar.rotateZ(PI / 2); bar.translate(w / 2, h - 0.08, 0); B.add(bar, T.wood);
  const knob = G.sph(0.045, 6, 4); knob.translate(0, h + 0.03, 0); B.add(knob, C.gold);
  const fh = h * 0.7, yTop = h - 0.1, cl = { x0: 0.02, x1: w + 0.02, yTop, yBot: yTop - fh };
  const g = G.plane(w, fh - 0.1, 2, 6); g.translate(0.02 + w / 2, yTop - (fh - 0.1) / 2, 0); B.cloth(g, color, cl);
  const hg = G.plane(w, 0.1, 2, 1); hg.translate(0.02 + w / 2, yTop - fh + 0.05, 0); B.cloth(hg, hem, cl);
  const sd = G.plane(0.05, fh, 1, 6); sd.translate(0.045, yTop - fh / 2, 0.003); B.cloth(sd, hem, cl);
  for (const s of [1, -1]) { const sg = flatCrest(crestName); sg.scale(w * 0.7, w * 0.7, 1); if (s < 0) sg.rotateY(PI); sg.translate(0.02 + w / 2, yTop - fh * 0.32, s * 0.006); B.cloth(sg, crestColor, cl); }
  const base = G.cyl(0.1, 0.13, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, STONES[1]);
}
/** a double-sided hanging sign perpendicular to a wall (local face frame: bracket at the origin, the board along +z) */
function sideSign(B, name, { w = 0.46, h = 0.5, board = '#f4e4c4', size = 0.34 } = {}) {
  const arm = G.box(0.04, 0.04, w + 0.22, 0); arm.translate(0, 0, (w + 0.22) / 2); B.add(arm, T.wood);
  const br = G.box(0.03, 0.03, 0.36, 0); br.rotateX(0.75); br.translate(0, -0.12, 0.13); B.add(br, T.wood);
  for (const s of [-1, 1]) { const ch = G.box(0.01, 0.08, 0.01, 0); ch.translate(0, -0.05, 0.14 + w / 2 + s * w * 0.36); B.add(ch, C.iron); }
  B.at([0, -0.09 - h / 2, 0.14 + w / 2], PI / 2, () => {
    const bd = G.box(w, h, 0.05, 0.015); B.add(bd, board); const fr = G.box(w + 0.06, h + 0.06, 0.035, 0.012); B.add(fr, T.wood);
    const cap = G.box(w + 0.12, 0.05, 0.1, 0.015); cap.translate(0, h / 2 + 0.05, 0); B.add(cap, T.tile);
    for (const yaw of [0, PI]) B.at([0, 0, 0], yaw, () => B.at([0, 0, 0.026], 0, () => crest(B, name, size)));
  });
}
/** a big standing signboard (yane-kanban style): posts, a framed board facing +z (both sides), crests laid out by fn */
function kanban(B, { w = 1.4, h = 0.5, postH = 0.3, board = '#f2e2c0', both = true, fn } = {}) {
  for (const s of [-1, 1]) { const p = G.beam(0.07, postH + h * 0.6, 0.07, 0.012); p.translate(s * (w / 2 - 0.12), (postH + h * 0.6) / 2, -0.03); B.add(p, T.wood); }
  B.at([0, postH + h / 2, 0], 0, () => {
    const bd = G.box(w, h, 0.06, 0.02); B.add(bd, board); const fr = G.box(w + 0.08, h + 0.08, 0.044, 0.015); B.add(fr, T.wood);
    const top = G.box(w + 0.2, 0.06, 0.16, 0.02); top.translate(0, h / 2 + 0.06, 0); B.add(top, T.tile);
    for (const s of [-1, 1]) { const g = G.box(0.05, h + 0.02, 0.07, 0); g.translate(s * (w / 2 + 0.02), 0, 0.005); B.add(g, C.gold); }
    B.at([0, 0, 0.031], 0, fn);
    if (both) B.at([0, 0, -0.031], PI, fn);
  });
}
/** a chrysanthemum (kiku) pot */
function kikuPot(B, seed, r = 0.16) {
  const rr = mulberry32(seed * 43 + 7), cs = [KIKU[seed % 4], KIKU[(seed + 1) % 4], KIKU[(seed + 2) % 4]];
  const pot = G.lathe([[0.001, 0], [r * 0.7, 0], [r * 0.82, r * 0.2], [r, r * 1.05], [r * 1.08, r * 1.15], [r * 0.9, r * 1.15], [0.001, r * 1.05]], 10);
  B.add(pot, (p, n, o) => o.set(p.y > r * 0.95 ? '#5a6a7a' : '#3e4e5e').multiplyScalar(0.86 + 0.18 * clamp(n.y + 0.3)));
  const bush = puff(V(0, r * 1.35, 0), r * 0.95, { detail: 1, noise: 0.2, squash: 0.72, seed: seed + 3 }); B.add(bush, (p, n, o) => o.set('#4e7a3a').lerp(new THREE.Color('#7aa04a'), clamp(n.y)));
  for (let i = 0; i < 12; i++) { // pompon chrysanthemum heads crowding the top
    const a = rr() * TAU, d = r * 0.78 * Math.sqrt(rr()), f = G.ico(r * 0.36 + rr() * 0.015, 0); f.scale(1, 0.72, 1);
    f.translate(Math.cos(a) * d, r * 1.72 + (1 - d / r) * r * 0.35, Math.sin(a) * d); B.add(f, cs[i % 3]);
  }
}

/** a standing andon sign (the inn's): a stone foot, a paper box in a dark frame with the chestnut crest, a little tiled
 *  cap; lit = its paper glows (the saved inn) */
function andon(B, { lit = false, crestName = 'kuri' } = {}) {
  const base = G.box(0.36, 0.1, 0.36, 0.02); base.translate(0, 0.05, 0); B.add(base, STONES[2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.box(0.045, 1.18, 0.045, 0); l.translate(sx * 0.15, 0.69, sz * 0.15); B.add(l, T.wood); }
  for (const y of [0.34, 1.24]) { const r = G.box(0.34, 0.05, 0.34, 0.01); r.translate(0, y, 0); B.add(r, T.wood); }
  const paper = G.box(0.27, 0.84, 0.27, 0); paper.translate(0, 0.79, 0);
  if (lit) B.glow(paper, '#ffe2a8', { hot: true, flicker: 0.4, tint: 0.7 }); else B.add(paper, T.paper);
  const cap = G.cone(0.3, 0.16, 4); cap.rotateY(PI / 4); cap.translate(0, 1.35, 0); B.add(cap, T.tile);
  const knob = G.sph(0.03, 6, 4); knob.translate(0, 1.44, 0); B.add(knob, C.gold);
  for (const yaw of [0, PI / 2, PI, -PI / 2]) B.at([0, 0.86, 0], yaw, () => B.at([0, 0, 0.137], 0, () => crest(B, yaw % PI ? 'momiji' : crestName, 0.2, { depth: 0.008, color: '#9a3a26' })));
}

// ------------------------------------------------------------------ Elder Kaede's House (楓の家): the old farmhouse
export function elder(B) {
  const w = 4.3, d = 2.7, h = 1.68, y0 = 0.4, zc = -0.5, F = zc + d / 2;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.wood, koshi: T.wood, koshiSkip: ['f'], koshiH: 0.5, weather: false });
  const blk = { w, d };
  // the front: the shoji room behind the engawa (left), the doma entrance (right), a bengara lattice at the right end
  onFace(B, blk, 'f', -1.15, y0, () => door(B, { w: 1.5, h: 1.34, style: 'shoji', frame: T.wood, wood: T.deck }));
  onFace(B, blk, 'f', 0.76, y0, () => door(B, { w: 1.08, h: 1.36, style: 'wood', frame: T.wood, wood: T.woodMid }));
  onFace(B, blk, 'f', 1.8, y0 + 0.84, () => latticeWindow(B, { w: 0.46, h: 0.6, frame: T.bengara, slat: T.bengara }));
  onFace(B, blk, 'r', 0, y0 + 0.86, () => latticeWindow(B, { w: 1.0, h: 0.56, frame: T.bengara, slat: T.bengara, bay: true, roof: T.tile, wood: T.wood }));
  onFace(B, blk, 'l', 0.1, y0 + 0.86, () => latticeWindow(B, { w: 0.8, h: 0.56, frame: T.bengara, slat: T.bengara }));
  for (const u of [-0.9, 0.9]) onFace(B, blk, 'b', u, y0 + 0.86, () => shoji(B, { w: 0.7, h: 0.5, frame: T.wood, dress: 'none' }));
  // the big red-brown irimoya: white plaster gables, gold-rimmed oni tiles
  const R = roofTile(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.62, gOver: 0.3, H: 1.55, tg: 0.5, curve: 0.38, lift: 0.26, liftW: 0.9, thick: 0.16, ribW: 0.24, gable: 'plaster', gableColor: T.plaster, rich: 2, oniFace: T.gold });
  engawa(B, { x0: -w / 2 - 0.04, x1: -0.3, z: d / 2, depth: 0.64, y: 0.38, wood: T.deck, beam: T.wood, step: true });
  // the porch line: two posts, a beam and the bamboo pole the persimmon curtain hangs from
  const ez = d / 2 + 0.5, pTop = R.underAt(w / 2 - 0.1, ez) - 0.03;
  posts(B, [-w / 2 + 0.06, w / 2 - 0.06], ez, pTop, T.wood, 0.065);
  { const eb = G.beam(w + 0.1, 0.11, 0.1, 0.02); eb.translate(0, pTop - 0.02, ez); B.add(eb, T.wood); }
  B.add(tube([{ p: V(-w / 2 + 0.08, pTop - 0.13, ez - 0.03), r: 0.024 }, { p: V(w / 2 - 0.08, pTop - 0.13, ez - 0.03), r: 0.024 }], 6, false), '#c8b070');
  B.at([0.76, 0, d / 2 + 0.3], 0, () => stoopStone(B, 0, 0.1, 0, 0.6));
  B.pop();
  // the yard: Inaho's rice rack along the left side, straw stooks, a water jar and a stone lantern by the door
  inject(B, Pr.hasa(2, { L: 2.4, h: 1.3 }), [-w / 2 - 0.8, 0, 0.85], PI / 2);
  inject(B, Pr.sheaf(3), [-w / 2 - 1.55, 0, 0.55]);
  inject(B, Pr.sheaf(4), [-w / 2 - 1.5, 0, -0.55], 0, 0.92);
  B.at([w / 2 + 0.34, 0, F - 0.45], 0, () => {
    const jar = G.lathe([[0.001, 0], [0.16, 0], [0.24, 0.18], [0.25, 0.32], [0.2, 0.44], [0.19, 0.48], [0.001, 0.47]], 12); B.add(jar, (p, n, o) => o.set('#7a5a46').lerp(new THREE.Color('#a8806a'), clamp(n.y * 0.5 + 0.2)));
    const lid = G.cyl(0.21, 0.21, 0.03, 12); lid.translate(0, 0.49, 0); B.add(lid, T.woodMid);
    const lad = G.box(0.32, 0.02, 0.05, 0); lad.translate(0.02, 0.515, 0); B.add(lad, '#c8a878');
  });
  B.at([w / 2 + 0.5, 0, F + 1.05], 0, () => toro(B, { s: 0.78, moss: false }));
  B.at([-w / 2 + 0.12, 0, F + 0.18], 0.3, () => broom(B));
  const lampY = pTop - 0.06;
  // hoshigaki strings (local x) along the porch pole, leaving the entrance clear
  const strings = []; for (let x = -w / 2 + 0.24; x < -0.25; x += 0.15) strings.push(x); for (let x = 1.6; x < w / 2 - 0.1; x += 0.15) strings.push(x);
  const poleY = pTop - 0.13, poleZ = F + 0.47;
  flatten(B);
  return {
    fp: [-w / 2 - 1.1, zc - d / 2 - 0.12, w / 2 + 0.12, F + 0.6], door: [0.76, F + 1.35], keeper: [-0.25, F + 1.15, 0], seat: [-1.35, F + 0.36, 0],
    lamps: [[0.05, lampY, F + 0.5], [1.46, lampY, F + 0.5]],
    siege(B) {
      B.at([0.76, y0 + 0.68, F + 0.02], 0, () => boards(B, 1.2, 1.36, { seed: 1 }));
      B.at([-1.15, y0 + 0.67, F + 0.02], 0, () => boards(B, 1.55, 1.3, { seed: 2 }));
      B.at([1.8, y0 + 0.84, F + 0.12], 0, () => boards(B, 0.6, 0.66, { seed: 3 }));
      B.at([0.76, y0 + 1.3, F + 0.015], 0, () => soot(B, 0.9, 0.55, T.plaster, 4));
      // the curtain torn down: a few strings left dangling, the fruit trampled into the yard, the rice thrown down
      for (const [x, n, t] of [[-1.62, 2, 0.25], [-0.9, 1, -0.3], [1.9, 2, 0.2]]) B.at([x, poleY, poleZ], 0, () => kakiString(B, n, { seed: x * 10 | 0 }), 1, 0, t);
      const rr = mulberry32(17);
      for (let i = 0; i < 12; i++) { const g = G.ico(0.06, 0); g.scale(1.25, 0.34, 1.15); g.translate(-1.8 + rr() * 3.6, 0.02, F + 0.7 + rr() * 0.9); B.add(g, rr() < 0.5 ? '#a8482a' : '#c4602c'); }
      for (let i = 0; i < 4; i++) B.at([-w / 2 - 0.5 - rr() * 0.8, 0.07, 1.4 + rr() * 0.6], rr() * PI, () => { const s = G.cyl(0.07, 0.09, 0.5, 8); s.rotateZ(PI / 2); B.add(s, '#d8b468'); });
      B.at([-1.9, 0, F + 1.5], 0, () => debris(B, 0.8, { seed: 11, n: 4 }));
    },
    saved(B) {
      for (const x of strings) B.at([x, poleY, poleZ], 0, () => kakiString(B, 6 + (Math.round(x * 7) & 1), { seed: Math.round(x * 50) }));
      B.at([0.76, 0, F], 0, () => norenPart(B, { w: 1.0, h: 0.52, y: y0 + 1.34, z: 0.16, color: '#8a2c24', strips: 3, symbol: () => flatCrest('momiji'), symScale: 0.26, symColor: '#fff4e4' }));
      B.at([-1.4, 0.39, F + 0.32], 0.2, () => { const c = G.box(0.34, 0.06, 0.34, 0.02); c.translate(0, 0.03, 0); B.add(c, '#d8483a'); const t = G.box(0.3, 0.03, 0.2, 0.01); t.translate(0.42, 0.015, 0); B.add(t, T.woodMid); const cup = G.cyl(0.035, 0.028, 0.05, 8); cup.translate(0.4, 0.06, 0); B.add(cup, '#f4ece0'); });
      // the harvest is in: rice bales stacked by the rack, chrysanthemums by the door
      B.at([-w / 2 - 1.3, 0, -1.35], 0, () => { for (const [z, y] of [[-0.18, 0], [0.18, 0], [0, 0.31]]) B.at([0, y, z], 0, () => tawara(B)); });
      for (const [x, k] of [[0.02, 1], [1.5, 2]]) B.at([x, 0, F + 0.78], 0, () => kikuPot(B, k));
    },
  };
}

// ------------------------------------------------------------------ Kurikaze Inn (栗風亭): two storeys, smoked tiles
export function inn(B) {
  const w = 3.7, d = 2.6, h = 1.5, y0 = 0.3, zc = -0.35, F = zc + d / 2;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.wood, koshi: T.bengara, koshiSkip: ['f'], koshiH: 0.46, weather: false });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 1.0, h: 1.3, style: 'lattice', frame: T.wood, wood: T.bengara }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.2, y0 + 0.66, () => latticeWindow(B, { w: 0.94, h: 0.84, frame: T.bengara, slat: T.bengara, bay: true, roof: T.ibushi, wood: T.wood }));
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, y0 + 0.86, () => latticeWindow(B, { w: 0.8, h: 0.5, frame: T.bengara, slat: T.bengara }));
  onFace(B, blk, 'b', 0, y0 + 0.86, () => shoji(B, { w: 0.9, h: 0.5, frame: T.wood, dress: 'none' }));
  const R1 = roofGrey(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.46, H: 0.95, tTop: 0.44, ribW: 0.22, curve: 0.32, lift: 0.18, liftW: 0.6, thick: 0.13 });
  const uw = Math.min(2.9, R1.openW - 0.12), ud = Math.min(1.85, R1.openD - 0.08), uh = 1.1, uy = R1.topY;
  walls(B, { w: uw, d: ud, h: uh, y0: uy, plaster: T.plaster, frame: T.bengara, rail: false, weather: false });
  const ub = { w: uw, d: ud };
  for (const u of [-0.85, 0.85]) onFace(B, ub, 'f', u, uy + 0.6, () => latticeWindow(B, { w: 0.62, h: 0.5, frame: T.bengara, slat: T.bengara }));
  onFace(B, ub, 'f', 0, uy + 0.6, () => shoji(B, { w: 0.56, h: 0.5, frame: T.bengara, dress: 'sudare' }));
  onFace(B, ub, 'r', 0, uy + 0.6, () => roundWindow(B, { r: 0.22, frame: T.wood }));
  onFace(B, ub, 'l', 0, uy + 0.56, () => { const bd = G.box(1.0, 0.5, 0.05, 0.015); bd.translate(0, 0, 0.04); B.add(bd, '#f2e2c0'); const fr = G.box(1.08, 0.58, 0.035, 0.012); fr.translate(0, 0, 0.025); B.add(fr, T.wood); B.at([0, 0, 0.066], 0, () => { crest(B, 'kuri', 0.36); for (const k of [-1, 1]) B.at([k * 0.33, -0.02, 0], 0, () => crest(B, 'kuri', 0.2)); }); });
  onFace(B, ub, 'b', 0, uy + 0.6, () => shoji(B, { w: 0.8, h: 0.46, frame: T.bengara, dress: 'none' }));
  const R2 = roofGrey(B, { type: 'irimoya', w: uw, d: ud, y0: uy + uh, over: 0.5, gOver: 0.24, H: 1.15, tg: 0.56, curve: 0.4, lift: 0.28, liftW: 0.7, thick: 0.14, ribW: 0.22, gable: 'plaster', gableColor: T.plaster, rich: 2, oniFace: T.gold });
  // the inn's board stands on the skirt roof: a big chestnut between two small ones
  { const kz = ud / 2 + 0.3; B.at([0, R1.yAt(0, kz) - 0.04, kz], 0, () => kanban(B, { w: 1.5, h: 0.46, postH: 0.08, both: false, fn: () => { crest(B, 'kuri', 0.36); for (const s of [-1, 1]) B.at([s * 0.5, -0.02, 0], 0, () => crest(B, 'kuri', 0.22)); } }), 1, -0.18, 0); }
  B.pop();
  // a hanging chestnut sign at the left corner (it reads along the front), the roasting brazier, the sake barrels
  B.at([-w / 2 + 0.1, y0 + h - 0.1, F + 0.02], 0, () => sideSign(B, 'kuri', { w: 0.42, h: 0.46, size: 0.32 }));
  B.at([-1.55, 0, F + 0.95], 0, () => {
    const br = G.cyl(0.28, 0.32, 0.42, 8); br.translate(0, 0.21, 0); B.add(br, (p, n, o) => o.set(STONES[2]).multiplyScalar(0.86 + 0.14 * clamp(n.y + 0.4)));
    const mouth = G.box(0.16, 0.12, 0.02, 0); mouth.translate(0, 0.14, 0.29); B.add(mouth, '#2a2020');
    const pan = G.lathe([[0.001, 0.0], [0.3, 0.02], [0.37, 0.09], [0.38, 0.11], [0.34, 0.1], [0.001, 0.04]], 14); pan.translate(0, 0.43, 0); B.add(pan, '#3a3436');
    const hd = G.cyl(0.02, 0.02, 0.36, 5); hd.rotateZ(PI / 2); hd.translate(0.52, 0.53, 0); B.add(hd, T.woodMid);
    B.at([0.42, 0, -0.18], 0.4, () => firewood(B, { w: 0.4, h: 0.28, d: 0.22, roofed: false }));
  });
  for (const [x, y, z, k] of [[w / 2 + 0.42, 0, F - 0.3, 1], [w / 2 + 0.42, 0, F - 0.88, 2], [w / 2 + 0.42, 0.52, F - 0.59, 3]]) inject(B, Pr.komodaru(k), [x, y, z], -PI / 2);
  B.at([-w / 2 - 0.4, 0, -0.9], PI / 2, () => firewood(B, { w: 0.9, h: 0.5, d: 0.26 }));
  flatten(B);
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.7, F + 0.15], door: [0, F + 0.95], keeper: [-1.0, F + 1.0, -0.7], seat: [1.3, F + 0.8, 0],
    lamps: [[-0.74, y0 + h - 0.04, F + 0.36], [0.74, y0 + h - 0.04, F + 0.36], [-uw / 2 + 0.12, R2.underAt(-uw / 2 + 0.12, ud / 2 + 0.44) - 0.04, zc + ud / 2 + 0.44], [uw / 2 - 0.12, R2.underAt(uw / 2 - 0.12, ud / 2 + 0.44) - 0.04, zc + ud / 2 + 0.44]],
    siege(B) {
      B.at([0, y0 + 0.65, F + 0.02], 0, () => boards(B, 1.05, 1.32, { seed: 5 }));
      for (const s of [-1, 1]) B.at([s * 1.2, y0 + 0.66, F + 0.16], 0, () => boards(B, 0.98, 0.84, { seed: 6 + s }));
      for (const u of [-0.85, 0.85]) B.at([u, uy + 0.6, zc + ud / 2 + 0.02], 0, () => boards(B, 0.66, 0.56, { seed: 9 + u * 4 }));
      B.at([1.25, y0 + 1.15, F + 0.06], 0, () => soot(B, 0.7, 0.6, T.plaster, 7));
      // the roasting pan kicked off its brazier, the chestnuts spilt; a torn yokai banner over the inn's board
      B.at([-1.15, 0.2, F + 1.45], 0.6, () => { const pan = G.lathe([[0.001, 0.0], [0.3, 0.02], [0.37, 0.09], [0.38, 0.11], [0.34, 0.1], [0.001, 0.04]], 14); B.add(pan, '#3a3436'); }, 1, 1.25, 0);
      B.at([-1.6, 0, F + 1.6], 0, () => heap(B, 0.5, -0.02, NUT, { n: 12, r: 0.035, seed: 4, dome: 0 }));
      B.at([0.95, 0.18, F + 0.75], 0.4, () => andon(B), 1, 0, PI / 2 - 0.08);
      B.at([1.7, 0, F + 1.3], 0, () => debris(B, 0.7, { seed: 23, n: 4 }));
    },
    saved(B) {
      B.at([0, 0, F], 0, () => norenPart(B, { w: 0.96, h: 0.5, y: y0 + 1.28, z: 0.16, color: '#5a3a2a', strips: 2, symbol: () => flatCrest('kuri'), symScale: 0.22, symColor: '#f4dca0' }));
      // the pan roasting again: glowing coals under a heap of chestnuts
      B.at([-1.55, 0, F + 0.95], 0, () => {
        const coal = G.cyl(0.27, 0.27, 0.03, 10); coal.translate(0, 0.44, 0); B.glow(coal, '#ff7a2a', { hot: true, flicker: 1, tint: 1 });
        heap(B, 0.28, 0.47, NUT, { n: 26, r: 0.034, seed: 7, dome: 0.4 });
        const glowM = G.box(0.14, 0.1, 0.02, 0); glowM.translate(0, 0.14, 0.3); B.glow(glowM, '#ff8a3a', { hot: true, flicker: 1, tint: 1 });
      });
      B.at([1.3, 0, F + 0.95], PI, () => teaBench(B, { w: 1.0, felt: '#c8342a' }));
      B.at([1.3, 0.45, F + 0.95], 0, () => basket(B, { r: 0.12, h: 0.1, n: 10, seed: 2 }));
      for (const s of [-1, 1]) B.at([s * 2.05, 0, F + 0.55], 0, () => kikuPot(B, 3 + s, 0.15));
      B.at([0.74, 0, F + 0.5], 0.15, () => andon(B, { lit: true }));
    },
  };
}

// ------------------------------------------------------------------ Benji's Sundries (紅葉堂): an open machiya shopfront
export function shop(B) {
  const w = 3.4, d = 2.3, h = 1.55, y0 = 0.24, zc = -0.3, F = zc + d / 2;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.wood, koshi: T.wood, koshiSkip: ['f'], weather: false });
  const blk = { w, d };
  // the open front: a dark shop with shelves of jars, charms and boxes, bengara posts, a deep lintel, the counter
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.36, h - 0.16, 0.03, 0); back.translate(0, (h - 0.16) / 2 + 0.02, 0.005); B.add(back, '#3a2a24');
    for (const y of [0.46, 0.82, 1.16]) {
      const sh = G.box(w - 0.5, 0.04, 0.2, 0.01); sh.translate(0, y, 0.1); B.add(sh, '#8a6448');
      const rr = mulberry32(Math.round(y * 100) + 5);
      for (let x = -(w - 0.62) / 2; x < (w - 0.62) / 2; x += 0.15 + rr() * 0.06) {
        const k = rr(), c = ['#d8402e', '#e8b84a', '#5a8a4a', '#f2e6d0', '#7a4a8a', '#2e5a8a'][Math.floor(rr() * 6)];
        if (k < 0.4) { const j = G.lathe([[0.001, 0], [0.05, 0], [0.06, 0.07], [0.035, 0.13], [0.04, 0.15], [0.001, 0.15]], 7); j.translate(x, y + 0.02, 0.1); B.add(j, c); }
        else if (k < 0.7) { const b = G.box(0.12, 0.08 + rr() * 0.08, 0.1, 0); b.translate(x, y + 0.07, 0.1); B.add(b, c); }
        else B.at([x, y + 0.02, 0.1], 0, () => daruma(B, { r: 0.05 }));
      }
    }
    for (const s of [-1, 1]) { const p = G.beam(0.12, h, 0.12, 0.02); p.translate(s * (w / 2 - 0.12), h / 2, 0.06); B.add(p, T.bengara); }
    const lin = G.beam(w + 0.04, 0.18, 0.14, 0.02); lin.translate(0, h - 0.07, 0.07); B.add(lin, T.wood);
    const ct = G.box(w - 0.6, 0.56, 0.4, 0.03); ct.translate(0, 0.28, 0.28); B.add(ct, T.woodMid);
    const top = G.box(w - 0.5, 0.06, 0.48, 0.02); top.translate(0, 0.59, 0.28); B.add(top, '#b07a52');
    for (let i = 0; i < 7; i++) { const pl = G.box(0.02, 0.46, 0.01, 0); pl.translate(-(w - 0.6) / 2 + (i + 0.5) * (w - 0.6) / 7, 0.28, 0.485); B.add(pl, T.wood); }
  });
  onFace(B, blk, 'r', 0.55, y0 + 0.84, () => latticeWindow(B, { w: 0.7, h: 0.52, frame: T.bengara, slat: T.bengara, bay: true, roof: T.tile, wood: T.wood }));
  onFace(B, blk, 'l', 0, y0 + 0.84, () => shoji(B, { w: 0.7, h: 0.5, frame: T.wood, dress: 'none' }));
  for (const u of [-0.8, 0.8]) onFace(B, blk, 'b', u, y0 + 0.84, () => latticeWindow(B, { w: 0.62, h: 0.5, frame: T.bengara, slat: T.bengara }));
  const R = roofTile(B, { type: 'gable', w, d, y0: y0 + h, over: 0.52, gOver: 0.34, H: 1.2, curve: 0.36, lift: 0.14, liftW: 0.7, thick: 0.15, ribW: 0.22, gable: 'plaster', gableColor: T.plaster, vent: false, rich: 1, oniFace: T.gold });
  // a big board on each gable: the leaf of 紅葉堂 between two coins (the side the camera sees first)
  for (const s of [-1, 1]) B.at([s * (w / 2 + 0.05), y0 + h + 0.36, 0], s * PI / 2, () => {
    const bd = G.box(1.2, 0.48, 0.05, 0.015); B.add(bd, '#f2e2c0'); const fr = G.box(1.28, 0.56, 0.035, 0.012); fr.translate(0, 0, -0.012); B.add(fr, T.wood);
    B.at([0, 0, 0.026], 0, () => { crest(B, 'momiji', 0.4); for (const k of [-1, 1]) B.at([k * 0.4, 0, 0], 0, () => kitSymbol(B, 'coin', 0.2, { depth: 0.02 })); });
  });
  // the roof sign: 紅葉堂's red maple leaf between two gold coins, readable from the square and from behind
  B.at([0, R.ridgeY + 0.12, 0], 0, () => kanban(B, { w: 1.55, h: 0.6, postH: 0.22, fn: () => { crest(B, 'momiji', 0.5); for (const s of [-1, 1]) B.at([s * 0.55, 0, 0], 0, () => kitSymbol(B, 'coin', 0.24, { depth: 0.02 })); } }));
  B.pop();
  // a hanging sign at the right corner (it reads along the front) and the stock round the back
  B.at([w / 2 - 0.1, y0 + h - 0.1, F + 0.02], 0, () => sideSign(B, 'momiji', { w: 0.44, h: 0.5, size: 0.38 }));
  B.at([-w / 2 - 0.35, 0, -0.6], 0, () => { crate(B, { s: 0.34 }); B.at([0.04, 0.29, 0.02], 0.3, () => crate(B, { s: 0.28 })); });
  B.at([-w / 2 - 0.35, 0, 0.1], 0, () => sack(B, { r: 0.17, color: '#e8d8b0' }));
  B.at([0.6, 0, -0.3 - d / 2 - 0.35], 0, () => barrel(B, { r: 0.18, h: 0.4, wood: '#a87a52' }));
  for (const [x, k] of [[-0.6, 4], [-1.0, 5]]) inject(B, Pr.komodaru(k), [x, 0, zc - d / 2 - 0.36], PI);
  const tx = w / 2 + 0.5, tz = F + 0.45;
  flatten(B);
  return {
    fp: [-w / 2 - 0.6, zc - d / 2 - 0.6, w / 2 + 0.55, F + 0.42], door: [0, F + 1.25], keeper: [0, F + 0.06, 0], counter: true,
    lamps: [[-1.25, y0 + h - 0.02, F + 0.5], [1.25, y0 + h - 0.02, F + 0.5]],
    siege(B) {
      // amado storm shutters across the open front, boarded; the lucky tanuki knocked flat; charms torn and trampled
      B.at([0, y0, F + 0.55], 0, () => {
        const n = 7;
        for (let i = 0; i < n; i++) { const p = G.box((w - 0.3) / n - 0.02, h - 0.14, 0.05, 0.01); p.translate(-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.14) / 2, 0); p.rotateZ((i - 3) * 0.006); B.add(p, ['#5a4232', '#4e3a2c', '#64493a'][i % 3]); }
        B.at([0, h * 0.5, 0], 0, () => boards(B, w - 0.4, h - 0.3, { seed: 13 }));
      });
      inject(B, Pr.tanuki(1, { s: 1 }), [tx + 0.1, 0.32, tz + 0.15], 0.5, 1, -1.45, 0);
      B.at([-1.5, 0, F + 1.25], 0.3, () => { const bk = G.cyl(0.16, 0.12, 0.16, 10, true); bk.rotateZ(PI / 2); bk.translate(0, 0.14, 0); B.add(bk, '#b08848'); heap(B, 0.4, -0.01, NUT, { n: 9, seed: 5, dome: 0 }); });
      for (let i = 0; i < 3; i++) B.at([-0.5 + i * 0.45, 0.07, F + 1.0 + (i % 2) * 0.35], i * 1.3, () => daruma(B, { r: 0.07 }), 1, PI / 2, 0);
      B.at([1.0, 0, F + 1.5], 0, () => debris(B, 0.7, { seed: 31, n: 4 }));
      B.at([w / 2 + 0.5, 0, zc + 0.4], 0, () => { debris(B, 0.6, { seed: 37, n: 4 }); for (let i = 0; i < 2; i++) B.at([0.1 + i * 0.3, 0.07, 0.2 - i * 0.4], i * 2, () => daruma(B, { r: 0.07 }), 1, PI / 2, 0); });
    },
    saved(B) {
      inject(B, Pr.tanuki(1, { s: 1 }), [tx, 0, tz], -0.35);
      B.at([0, 0, F + 0.02], 0, () => norenPart(B, { w: w - 0.4, h: 0.4, y: y0 + h - 0.12, z: 0.16, color: '#c8642a', strips: 6, symbol: () => flatCrest('momiji'), symScale: 0.22, symColor: '#fff4e4' }));
      // the side stand against the right wall: tiers of daruma, chestnuts, persimmons and charms
      B.at([w / 2 + 0.32, 0, zc + 0.5], PI / 2, () => {
        for (const [y, dz] of [[0, 0], [0.32, -0.16], [0.64, -0.3]]) { const st = G.box(1.0, 0.05, 0.26, 0.012); st.translate(0, y + 0.3, dz); B.add(st, '#a87a52'); }
        for (const sx of [-1, 1]) { const l = G.beam(0.05, 1.05, 0.05, 0.01); l.rotateX(0.42); l.translate(sx * 0.47, 0.5, -0.15); B.add(l, T.woodMid); }
        for (const [x, y, dz, k] of [[-0.3, 0.33, 0, 'b'], [0.05, 0.33, 0, 'k'], [0.36, 0.33, 0, 'b'], [-0.25, 0.65, -0.16, 'd'], [0.05, 0.65, -0.16, 'd'], [0.32, 0.65, -0.16, 'd'], [0, 0.97, -0.3, 'k']]) B.at([x, y, dz], 0, () => (k === 'd' ? daruma(B, { r: 0.08 }) : basket(B, { r: 0.12, h: 0.1, fill: k === 'k' ? KAKI : NUT, fr: k === 'k' ? 0.045 : 0.03, n: k === 'k' ? 6 : 10, seed: x * 20 + y * 7 | 0 })));
      });
      // goods out front: a display bench of chestnuts, persimmons and mushrooms; daruma and a charm rack; a shop flag
      B.at([-1.05, 0, F + 0.95], 0, () => {
        const top = G.box(1.1, 0.05, 0.46, 0.015); top.translate(0, 0.42, 0); B.add(top, '#b8865c');
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.box(0.05, 0.4, 0.05, 0); l.translate(sx * 0.48, 0.2, sz * 0.17); B.add(l, T.woodMid); }
        for (const [x, fill, fr] of [[-0.34, NUT, 0.033], [0.02, KAKI, 0.05], [0.36, ['#7a4a2a', '#8a5a34', '#f0dcc0'], 0.04]]) B.at([x, 0.445, 0], 0, () => basket(B, { r: 0.14, h: 0.12, fill, n: fill === KAKI ? 7 : 12, fr, seed: x * 9 | 0 }));
      });
      B.at([1.05, 0, F + 0.9], 0, () => {
        const st = G.box(0.7, 0.36, 0.4, 0.02); st.translate(0, 0.18, 0); B.add(st, T.woodMid);
        for (const [x, z, r] of [[-0.2, 0.05, 0.1], [0.06, -0.06, 0.12], [0.28, 0.06, 0.09]]) B.at([x, 0.36, z], 0, () => daruma(B, { r }));
        B.at([0.0, 0, -0.32], 0, () => { for (const s of [-1, 1]) { const p = G.box(0.04, 1.0, 0.04, 0); p.translate(s * 0.3, 0.5, 0); B.add(p, T.wood); } const bar = G.box(0.68, 0.035, 0.035, 0); bar.translate(0, 0.96, 0); B.add(bar, T.wood); for (let i = 0; i < 6; i++) { const c = G.box(0.06, 0.1, 0.015, 0); c.translate(-0.25 + i * 0.1, 0.86, 0.02); B.add(c, ['#d8402e', '#2e5a8a', '#e8b84a', '#5a8a4a', '#f2e6d0', '#7a4a8a'][i]); } });
      });
      B.at([-w / 2 - 0.05, 0, F + 0.75], 0, () => flag(B, { h: 2.3, w: 0.4 }));
    },
  };
}

// ------------------------------------------------------------------ the tea house's cypress-bark roof
const _nzM = new Noise(5151);
/** A cypress-bark (hiwada-buki) hip-and-gable roof over a w × d wall block whose top is at y0: a smooth, deeply curved
 *  bark surface laid in courses, a thick layered cut edge (koba) round the eave and the gable overhangs, eave corners
 *  sweeping up, a dark box ridge capped in green copper with gold-dotted end caps, and gable triangles of vertical
 *  slats under black barge boards with a bronze gegyo pendant at the apex. Moss creeps over the lower courses.
 *  → { ridgeY, yb (eave underside), underAt(x, z) (the soffit height near the front / back eave) } */
function barkRoof(B, o) {
  const { w, d, y0 } = o, over = o.over ?? 0.66, gOver = o.gOver ?? 0.28, H = o.H ?? 1.4, tg = o.tg ?? 0.5, cv = o.curve ?? 0.45;
  const lift = o.lift ?? 0.2, LW = o.liftW ?? 0.85, thick = o.thick ?? 0.3, thickU = o.thickU ?? 0.17, rc = 0.07;
  const A = w / 2 + over, Bz = d / 2 + over, axG = A - Bz * tg, X = axG + gOver;
  const tWall = over / Bz, prof = t => (1 - cv) * t + cv * t * t;
  const yb = (y0 + 0.15) - H * prof(tWall); // (the bark surface clears the wall plate and the front's blinds)
  const yAt = t => yb + H * prof(t), azAt = t => Math.max(0.06, Bz * (1 - t)), axAt = t => (t < tg ? A - Bz * t : axG);
  const upAt = (t, dc) => lift * (1 - t) * (1 - t) * Math.exp(-(dc * dc) / (LW * LW));
  const nF = 26, nS = 16, nc = 3;
  // a rounded-rectangle ring with fixed vertex counts per side (no twist between rings): [x, z, dc (distance to corner along the edge), outward nx, nz]
  const ring = (ax, az) => {
    const pts = [], ex = Math.max(0.001, ax - rc), ez = Math.max(0.001, az - rc);
    const side = (x0, z0, x1, z1, n, nx, nz) => { for (let i = 0; i < n; i++) { const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f; pts.push([x, z, nx ? ez - Math.abs(z) : ex - Math.abs(x), nx, nz]); } };
    const arc = (cx, cz, a0) => { for (let i = 0; i < nc; i++) { const a = a0 + i / nc * PI / 2; pts.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc, 0, Math.cos(a), Math.sin(a)]); } };
    side(ax, 0, ax, ez, nS / 2, 1, 0); arc(ex, ez, 0);
    side(ex, az, -ex, az, nF, 0, 1); arc(-ex, ez, PI / 2);
    side(-ax, ez, -ax, -ez, nS, -1, 0); arc(-ex, -ez, PI);
    side(-ex, -az, ex, -az, nF, 0, -1); arc(ex, -ez, 1.5 * PI);
    side(ax, -ez, ax, 0, nS / 2, 1, 0);
    return pts;
  };
  /** loft rows of equal-length point lists into a surface; `want(p)` = the side it should face (the winding is flipped to match) */
  const loft = (rows, closed, want) => {
    const N = rows[0].length, pos = [], idx = [];
    for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
    const M = closed ? N : N - 1;
    for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < M; i++) { const a = j * N + i, b = j * N + (i + 1) % N, c = (j + 1) * N + i, e = (j + 1) * N + (i + 1) % N; idx.push(a, c, b, b, c, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const k = Math.floor(idx.length / 6 / 2) * 6, P = i => V(pos[idx[k + i] * 3], pos[idx[k + i] * 3 + 1], pos[idx[k + i] * 3 + 2]);
    const p0 = P(0), nrm = P(1).sub(p0).cross(P(2).sub(p0));
    if (nrm.dot(want(p0)) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const out = p => V(p.x, 0, p.z), up = () => V(0, 1, 0), down = () => V(0, -1, 0);
  const bark = new THREE.Color(o.color || '#74482f'), barkHi = new THREE.Color('#9a6440'), barkOld = new THREE.Color('#5e4636'), moss = new THREE.Color('#7f8c44');
  const seed = (B.seed % 89) * 1.3;
  const CS = 0.034, courseTone = t => { const f = (t / CS) % 2; return f < 1 ? 1.04 - 0.05 * f : 0.99 - 0.15 * (f - 1) * (f - 1); }; // (bark laid in courses: a pale butt line, darkening up each course)
  const tOfY = y => { const v = (y - yb) / H; if (v <= 0) return 0; return clamp((-(1 - cv) + Math.sqrt((1 - cv) * (1 - cv) + 4 * cv * v)) / (2 * cv)); }; // (prof⁻¹)
  const barkPaint = (p, n, oc) => {
    const t = clamp((p.y - yb) / H), mk = clamp((1 - t * 2.6)) * clamp(n.y * 1.6) * clamp(_nzM.n2(p.x * 1.3 + seed, p.z * 1.3) * 1.6 + 0.2);
    oc.copy(bark).lerp(barkOld, (1 - t) * 0.3).lerp(barkHi, clamp(n.y - 0.55) * 0.5).multiplyScalar(courseTone(tOfY(p.y)));
    if (mk > 0) oc.lerp(moss, mk * (o.moss ?? 0.6));
  };
  // 1. the lower hipped skirt (t 0 → tg)
  const ts = []; for (let t = 0; t < tg - 1e-4; t += CS / 2) ts.push(t); ts.push(tg);
  const rows = ts.map(t => ring(axAt(t), azAt(t)).map(([x, z, dc, nx, nz]) => { const u = upAt(t, dc); return [x + nx * u * 0.3, yAt(t) + u, z + nz * u * 0.3]; }));
  B.add(loft(rows, true, up), barkPaint);
  // 2. the thick layered cut edge round the eave (koba): four stacked bands, the top one standing proud
  const eave = ring(A, Bz), KO = ['#8a5e40', '#b67e52', '#cc9462', '#dcab76'], L = KO.length;
  for (let k = 0; k < L; k++) {
    const yA = -thick + k * thick / L, yB = yA + thick / L, sh = -0.012 * (L - 1 - k);
    const band = [yA, yB].map(dy => eave.map(([x, z, dc, nx, nz]) => { const u = upAt(0, dc); return [x + nx * (u * 0.3 + sh), yb + u + dy, z + nz * (u * 0.3 + sh)]; }));
    const c0 = new THREE.Color(KO[k]);
    B.add(loft(band, true, out), (p, n, oc) => oc.copy(c0).multiplyScalar(0.93 + 0.07 * Math.sin(Math.atan2(p.z, p.x) * 40 + k)));
  }
  // 3. the soffit: from the eave's underside up to the wall plate
  { const inner = ring(w / 2 + 0.02, d / 2 + 0.02).map(([x, z]) => [x, y0 - 0.02, z]);
    const outer = eave.map(([x, z, dc, nx, nz]) => { const u = upAt(0, dc); return [x + nx * (u * 0.3 - 0.03), yb + u - thick, z + nz * (u * 0.3 - 0.03)]; });
    B.add(loft([outer, inner], true, down), (p, n, oc) => oc.set('#4a3426').multiplyScalar(0.85 + 0.15 * clamp(Math.hypot(p.x / A, p.z / Bz))));
  }
  // 4. the upper gable slabs (t tg → 1, front and back), running out past the gable faces by gOver
  const tu = [tg - 0.035]; for (let t = Math.ceil(tg / (CS / 2)) * CS / 2; t < 1 - 1e-4; t += CS / 2) tu.push(t); tu.push(1); const NX = 30;
  const slab = (s, dy, ext = 0) => tu.map(t => { const r = []; for (let i = 0; i <= NX; i++) { const x = -X - ext + (2 * (X + ext)) * i / NX, dc = Math.max(0, (axG - rc) - Math.abs(x)), u = upAt(t, dc); r.push([x, yAt(t) + u + dy + (t < tg ? 0.012 : 0.008), s * azAt(t) + s * u * 0.12]); } return r; });
  for (const s of [-1, 1]) {
    const top = slab(s, 0), bot = slab(s, -thickU);
    B.add(loft(top, false, up), barkPaint);
    B.add(loft(bot, false, down), '#4a3426');
    // the barge ends: the same layered cut edge running up the gable overhang
    const mix = (a, b, f) => a.map((r, j) => [r[0] + (b[j][0] - r[0]) * f, r[1] + (b[j][1] - r[1]) * f, r[2] + (b[j][2] - r[2]) * f]);
    for (const e of [0, NX]) { const T0 = top.map(r => r[e]), B0 = bot.map(r => r[e]); for (let k = 0; k < L; k++) B.add(loft([mix(B0, T0, k / L), mix(B0, T0, (k + 1) / L)], false, () => V(e ? 1 : -1, 0, 0)), KO[k]); }
  }
  // 5. the box ridge, green copper on top, end caps with a gold dot
  const yR = yAt(1) + 0.02, RL = 2 * X + 0.18, RW = 2 * azAt(1) + 0.26;
  { const r = G.beam(RL, 0.2, RW, 0.04); r.translate(0, yR + 0.05, 0); B.add(r, (p, n, oc) => oc.set(Math.abs(n.y) < 0.5 ? '#4a3226' : '#3e2a20').multiplyScalar(0.92 + 0.08 * Math.sin(p.x * 9))); }
  for (const dz of [-1, 1]) { const ln = G.box(RL - 0.04, 0.03, 0.02, 0); ln.translate(0, yR + 0.02, dz * (RW / 2 + 0.005)); B.add(ln, '#c08a5a'); } // (a pale bark line along each side)
  { const c = G.beam(RL + 0.04, 0.05, RW * 0.7, 0.015); c.translate(0, yR + 0.17, 0); B.add(c, (p, n, oc) => oc.set('#55806e').lerp(new THREE.Color('#8ab8a2'), clamp(n.y) * 0.15)); }
  for (const s of [-1, 1]) {
    const cap = G.box(0.07, 0.27, RW + 0.06, 0.025); cap.translate(s * (RL / 2 + 0.015), yR + 0.06, 0); B.add(cap, '#55806e');
    const dot = G.cyl(0.055, 0.055, 0.025, 12); dot.rotateZ(PI / 2); dot.translate(s * (RL / 2 + 0.06), yR + 0.06, 0); B.add(dot, C.gold);
  }
  // 6. the gable triangles: vertical slats under black barge boards, a bronze gegyo pendant at the apex
  const yG0 = yAt(tg) + upAt(tg, 0) * 0.2;
  for (const s of [-1, 1]) {
    const x = s * (axG + 0.005), edge = []; for (let k = 0; k <= 10; k++) { const t = tg + (1 - tg) * k / 10; edge.push([azAt(t), yAt(t) - thickU - 0.01]); }
    const sh = new THREE.Shape(); sh.moveTo(-azAt(tg), yG0); for (let k = 0; k <= 10; k++) sh.lineTo(-edge[k][0], Math.max(yG0, edge[k][1])); for (let k = 10; k >= 0; k--) sh.lineTo(edge[k][0], Math.max(yG0, edge[k][1])); sh.closePath();
    const tri = new THREE.ShapeGeometry(sh, 2); tri.rotateY(s * PI / 2); tri.translate(x, 0, 0);
    B.add(tri.index ? tri.toNonIndexed() : tri, (p, n, oc) => oc.set('#8a6448').multiplyScalar(Math.abs(Math.sin(p.z * 26)) < 0.22 ? 0.72 : 1));
    const beam = G.beam(0.07, 0.08, 2 * azAt(tg) - 0.16, 0.012); beam.translate(x + s * 0.02, yG0 + 0.03, 0); B.add(beam, '#3e2c24'); // (short of the skirt's corners, or its ends poke through the bark)
    for (const zs of [-1, 1]) { // the barge boards (hafu) following the slab's underside down each slope
      const pts = edge.map(([az, y]) => ({ p: V(s * (axG + 0.07), y + 0.02, zs * (az + 0.02)), r: 0.055 })); B.add(tube(pts, 6, false), '#2e2420');
    }
    B.at([s * (axG + 0.12), yAt(1) - thickU - 0.12, 0], s * PI / 2, () => { // gegyo: a scalloped pendant with a round boss
      const gs = new THREE.Shape(); gs.moveTo(0, 0.06); gs.quadraticCurveTo(0.16, 0.04, 0.13, -0.08); gs.quadraticCurveTo(0.07, -0.05, 0.05, -0.12); gs.quadraticCurveTo(0, -0.08, -0.05, -0.12); gs.quadraticCurveTo(-0.07, -0.05, -0.13, -0.08); gs.quadraticCurveTo(-0.16, 0.04, 0, 0.06);
      const gg = new THREE.ExtrudeGeometry(gs, { depth: 0.025, bevelEnabled: false, curveSegments: 4 }); gg.deleteAttribute('uv'); gg.scale(1.4, 1.4, 1); B.add(gg, '#c89a48');
      const boss = G.sph(0.045, 8, 6); boss.scale(1, 1, 0.5); boss.translate(0, -0.02, 0.03); B.add(boss, C.gold);
    });
  }
  // moss cushions on the lower courses
  for (let i = 0; i < 4; i++) { const t = 0.08 + B.drand(0, 0.14), ang = B.drand(0, TAU), [x, z] = [Math.cos(ang) * axAt(t) * 0.8, Math.sin(ang) > 0 ? azAt(t) : -azAt(t)], g = puff(V(0, 0, 0), 0.09 + B.drand(0, 0.05), { detail: 0, noise: 0.3, squash: 0.4, seed: i + 5 }); g.translate(x, yAt(t) + 0.03, z * 0.98); B.add(g, '#7a8c42'); }
  const underAt = (x, z) => { const f = clamp((Math.abs(z) - d / 2) / over), dc = Math.max(0, (A - rc) - Math.abs(x)); return y0 - 0.02 + (yb + upAt(0, dc) - thick - (y0 - 0.02)) * f; };
  return { ridgeY: yR + 0.2, yb: yb - thick, underAt };
}

// ------------------------------------------------------------------ Momiji Tea House (紅葉茶屋): a sukiya chaya
export function teaHouse(B) {
  const w = 3.1, d = 2.2, h = 1.42, y0 = 0.3, zc = -0.35, F = zc + d / 2;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone, stones: true, pad: 0.1 });
  walls(B, { w, d, h, y0, plaster: T.clay, frame: T.log, koshi: '#8a6448', koshiSkip: ['f'], koshiH: 0.4, weather: false });
  const blk = { w, d };
  // the open front: a raised tatami floor with red felt at its edge, the kettle on its brazier, a scroll and a vase
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.3, h - 0.14, 0.03, 0); back.translate(0, (h - 0.14) / 2 + 0.02, 0.005); B.add(back, '#4a382c');
    const tat = G.box(w - 0.32, 0.12, 0.62, 0.01); tat.translate(0, 0.08, 0.32); B.add(tat, (p, n, o) => o.set(n.y > 0.5 ? (Math.abs(p.x % 0.9) < 0.03 ? '#4a5a3a' : '#c8c088') : '#8a7a58'));
    const felt = G.box(w - 0.34, 0.025, 0.26, 0); felt.translate(0, 0.152, 0.5); B.add(felt, '#c8342a');
    const scr = G.box(0.36, 0.78, 0.02, 0); scr.translate(-0.55, 0.78, 0.03); B.add(scr, '#f2e8d2');
    const scrR = G.cyl(0.018, 0.018, 0.44, 5); scrR.rotateZ(PI / 2); scrR.translate(-0.55, 1.18, 0.035); B.add(scrR, T.wood);
    B.at([-0.55, 0.82, 0.045], 0, () => crest(B, 'momiji', 0.22, { depth: 0.008 }));
    B.at([0.55, 0.14, 0.26], 0, () => {
      const hib = G.cyl(0.17, 0.15, 0.2, 10); hib.translate(0, 0.1, 0); B.add(hib, '#5a4a40');
      const ash = G.cyl(0.14, 0.14, 0.02, 10); ash.translate(0, 0.2, 0); B.add(ash, '#c8b8a0');
      const kama = G.sph(0.12, 10, 7); kama.scale(1, 0.85, 1); kama.translate(0, 0.32, 0); B.add(kama, '#2e2a2c');
      const lid = G.cyl(0.06, 0.07, 0.03, 8); lid.translate(0, 0.42, 0); B.add(lid, '#4a4446');
    });
    B.at([0.05, 0.14, 0.12], 0, () => { const v = G.lathe([[0.001, 0], [0.05, 0], [0.07, 0.08], [0.03, 0.2], [0.035, 0.24], [0.001, 0.24]], 8); B.add(v, '#5a7a8a'); for (let k = 0; k < 6; k++) { const lf = G.cone(0.04, 0.02, 7); lf.translate(Math.cos(k) * 0.07, 0.34 + (k % 3) * 0.05, Math.sin(k) * 0.05); B.add(lf, k % 2 ? '#e0402a' : '#f06a2a', 'leaf'); } const st = G.cyl(0.006, 0.006, 0.2, 3); st.translate(0, 0.32, 0); B.add(st, '#5a3a2a'); });
    for (const s of [-1, 1]) { const p = G.cyl(0.07, 0.08, h, 8); p.translate(s * (w / 2 - 0.08), h / 2, 0.07); B.add(p, (q, n, o) => o.set(T.log).multiplyScalar(0.88 + 0.14 * Math.sin(q.y * 9 + s))); }
    const lin = G.beam(w + 0.06, 0.12, 0.12, 0.02); lin.translate(0, h - 0.06, 0.07); B.add(lin, T.log);
    sudare(B, w - 0.3, h - 0.3, { drop: 0.3, z: 0.1, color: '#d8bc84' });
  });
  onFace(B, blk, 'r', -0.1, y0 + 0.78, () => roundWindow(B, { r: 0.36, frame: T.wood, lattice: 'fine' }));
  onFace(B, blk, 'l', 0, y0 + 0.8, () => latticeWindow(B, { w: 0.7, h: 0.5, frame: T.woodMid }));
  onFace(B, blk, 'b', 0.5, y0 + 0.8, () => roundWindow(B, { r: 0.3, frame: T.wood }));
  onFace(B, blk, 'b', -0.7, y0 + 0.8, () => shoji(B, { w: 0.6, h: 0.5, frame: T.woodMid, dress: 'none' }));
  // the cypress-bark roof: deep layered eaves, a copper-capped ridge, ornamented gables
  const R = barkRoof(B, { w, d, y0: y0 + h, over: 0.68, gOver: 0.3, H: 1.3, tg: 0.52, curve: 0.42, lift: 0.22, liftW: 0.85, thick: 0.3, moss: 0.35 });
  // the deep front eave on two log posts; a stone step
  const ez = d / 2 + 0.56, pTop = R.underAt(w / 2 - 0.1, ez) - 0.02;
  for (const s of [-1, 1]) { const p = G.cyl(0.06, 0.07, pTop, 8); p.translate(s * (w / 2 - 0.05), pTop / 2, ez); B.add(p, (q, n, o) => o.set(T.log).multiplyScalar(0.88 + 0.14 * Math.sin(q.y * 7 + s))); const st = G.cyl(0.12, 0.14, 0.1, 7); st.translate(s * (w / 2 - 0.05), 0.05, ez); B.add(st, STONES[2]); }
  { const eb = G.beam(w + 0.06, 0.1, 0.1, 0.02); eb.translate(0, pTop - 0.02, ez); B.add(eb, T.log); }
  B.at([0, 0, d / 2 + 0.3], 0, () => stoopStone(B, 0, 0.11, 0, 0.9));
  B.pop();
  // the roadside board: a teacup and a maple leaf (茶 · 紅葉), readable from the square
  B.at([1.2, 0, F + 0.95], -0.25, () => kanban(B, { w: 0.78, h: 0.46, postH: 0.5, fn: () => { B.at([-0.17, 0, 0], 0, () => kitSymbol(B, 'teacup', 0.3, { depth: 0.02 })); B.at([0.2, 0, 0], 0, () => crest(B, 'momiji', 0.26)); } }));
  // the tea garden on the right: a stone basin fed by a bamboo spout, a lantern, stepping stones, a small maple, a fence
  const gx = w / 2 + 0.85;
  B.at([gx, 0, zc + 0.15], 0, () => {
    const bs = puff(V(0, 0, 0), 0.26, { detail: 1, noise: 0.18, squash: 0.62, seed: 9 }); bs.translate(0, 0.16, 0); B.add(bs, (p, n, o) => o.set(STONES[1]).multiplyScalar(0.86 + 0.16 * clamp(n.y)));
    const wat = G.cyl(0.13, 0.13, 0.02, 10); wat.translate(0, 0.3, 0); B.add(wat, '#5a9ab8');
    B.add(tube([{ p: V(0.5, 0.62, -0.1), r: 0.03 }, { p: V(0.12, 0.42, -0.02), r: 0.026 }], 6, false), '#a8b060');
    const kp = G.cyl(0.04, 0.045, 0.62, 6); kp.translate(0.52, 0.31, -0.1); B.add(kp, '#9aa058');
    const hs = G.cyl(0.035, 0.03, 0.05, 8); hs.translate(-0.05, 0.36, 0.06); B.add(hs, '#c8a878');
    const hh = G.box(0.24, 0.012, 0.012, 0); hh.rotateY(0.6); hh.translate(-0.12, 0.38, 0.13); B.add(hh, '#c8a878');
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4, s = puff(V(0, 0, 0), 0.08 + (i % 2) * 0.03, { detail: 0, noise: 0.3, squash: 0.6, seed: i + 30 }); s.translate(Math.cos(a) * 0.36, 0.04, Math.sin(a) * 0.36); B.add(s, STONES[i % STONES.length]); }
  });
  B.at([gx + 0.35, 0, zc - 0.85], 0.3, () => toro(B, { s: 0.7, moss: true }));
  for (const [x, z] of [[w / 2 + 0.3, F + 0.55], [w / 2 + 0.55, F + 0.05], [gx - 0.1, zc + 0.68]]) B.at([x, 0, z], x * 7, () => stoopStone(B, 0, 0.07, 0, 0.42));
  { // a low yotsume-gaki fence round the garden's outer edge
    const fx = w / 2 + 1.55, z0 = zc - d / 2 - 0.1, z1 = F + 0.45, n = 4;
    for (let i = 0; i <= n; i++) { const p = G.cyl(0.035, 0.04, 0.72, 6); p.translate(fx, 0.36, z0 + (z1 - z0) * i / n); B.add(p, T.woodMid); }
    for (const y of [0.24, 0.46, 0.66]) B.add(tube([{ p: V(fx + 0.04, y, z0), r: 0.02 }, { p: V(fx + 0.04, y, z1), r: 0.02 }], 5, false), '#a8a060');
    for (let i = 0; i < 9; i++) { const z = z0 + (z1 - z0) * (i + 0.5) / 9; B.add(tube([{ p: V(fx - 0.02, 0.0, z), r: 0.016 }, { p: V(fx - 0.02, 0.62, z), r: 0.016 }], 4, false), '#b0a868'); }
  }
  flatten(B);
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 1.6, F + 0.1], door: [0, F + 1.0], keeper: [-0.72, F + 0.28, 0], seat: [-1.25, F + 1.2, 0.35],
    lamps: [[-0.9, pTop - 0.06, F + 0.56], [0.9, pTop - 0.06, F + 0.56]],
    siege(B) {
      // the front boarded; a parasol smashed on the ground, a bench overturned, the tea things broken
      B.at([0, y0 + 0.62, F + 0.2], 0, () => boards(B, w - 0.4, 1.1, { seed: 17 }));
      B.at([-1.9, 0.22, F + 0.5], 1.9, () => parasol(B, { r: 0.9, h: 1.7, color: '#a83a2e', ribs: 8 }), 1, 1.35, 0.2);
      B.at([-1.1, 0.22, F + 1.3], 0.4, () => teaBench(B, { w: 1.0, felt: '#8a3a30' }), 1, 0, PI / 2);
      for (let i = 0; i < 6; i++) { const g = G.cyl(0.035, 0.028, 0.04, 6); g.rotateZ(1.4); g.translate(0.2 + (i % 3) * 0.2, 0.02, F + 0.9 + Math.floor(i / 3) * 0.25); B.add(g, '#efe4d2'); }
      B.at([-1.4, 0, F + 1.9], 0, () => debris(B, 0.6, { seed: 19, n: 3 }));
      B.at([w / 2 + 1.0, 0, F + 1.0], 0, () => warBanner(B, { h: 2.2, w: 0.5, seed: 21 }));
    },
    saved(B) {
      // outdoor nodate seating: red-felt benches under big red parasols, trays of tea and wagashi, the tea flag
      for (const [x, z, yaw, px, pz] of [[-1.25, F + 1.2, 0.35, -1.6, F + 0.82], [-2.5, F + 0.3, 0.95, -2.85, F - 0.08]]) {
        B.at([x, 0, z], yaw, () => {
          teaBench(B, { w: 1.1, felt: '#cc3a2a' });
          const tray = G.box(0.26, 0.02, 0.18, 0.005); tray.translate(0.25, 0.445, 0); B.add(tray, '#2a2224');
          for (const s of [-1, 1]) { const cup = G.cyl(0.03, 0.022, 0.05, 8); cup.translate(0.25 + s * 0.06, 0.48, 0.02); B.add(cup, '#7aa070'); }
          const wg = G.sph(0.028, 6, 4); wg.translate(-0.25, 0.46, 0); B.add(wg, '#ff9ec0');
        });
        B.at([px, 0, pz], 0, () => parasol(B, { r: 1.0, h: 1.95, color: '#d83a2c', ribs: 12 }));
      }
      B.at([w / 2 + 1.45, 0, F + 0.75], 0, () => flag(B, { h: 2.1, w: 0.38, color: '#f6efe0', crestName: 'momiji', crestColor: '#3a7a5a', hem: '#3a7a5a' }));
      B.at([0, 0, F], 0, () => norenPart(B, { w: 1.3, h: 0.34, y: y0 + h - 0.16, z: 0.2, color: '#3a6a52', strips: 3, symbol: () => flatCrest('momiji'), symScale: 0.18, symColor: '#fff4e4' }));
      for (const s of [-1, 1]) B.at([s * 1.62, 0, F + 0.7], 0, () => kikuPot(B, 5 + s, 0.14));
    },
  };
}

// ------------------------------------------------------------------ the Waypoint Shrine (art.js waystone: one design, Akane's tint)
export function waypoint(B) {
  const info = waystone(B, { roof: '#c8402e', cap: 'leaves', seed: 79 });
  flatten(B);
  // local dressing: a jizo in a red bib keeping it company, fallen maple leaves drifted on the plinth
  inject(B, Pr.jizo(3), [1.42, 0, 0.2], -0.35);
  const rr = mulberry32(79);
  for (let i = 0; i < 16; i++) { const g = new THREE.ShapeGeometry(momijiShapes()[0], 2); g.scale(0.09, 0.09, 1); g.rotateX(-PI / 2); g.rotateY(rr() * TAU); g.translate(-0.9 + rr() * 2.4, i < 9 ? 0.145 : 0.01, -0.85 + rr() * 1.5); B.add(g.index ? g.toNonIndexed() : g, ['#d8402a', '#ec6a2e', '#f4a036', '#c8302a'][i % 4]); }
  return { ...info, fp: [-1.0, -0.95, 1.75, 0.75] };
}

// ------------------------------------------------------------------ the hamlet gate (on the trail where it crosses the rim)
/** a red-lacquered gate with a little tiled roof, a maple plaque and two lantern hooks → the hooks (local) */
export function gate(B, { w = 3.4, h = 2.45, sign = true } = {}) {
  for (const s of [-1, 1]) {
    const base = G.cyl(0.2, 0.24, 0.22, 8); base.translate(s * w / 2, 0.11, 0); B.add(base, STONES[2]);
    const p = G.cyl(0.1, 0.115, h, 10); p.translate(s * w / 2, h / 2, 0); B.add(p, T.lacquer);
    const band = G.cyl(0.118, 0.118, 0.16, 10); band.translate(s * w / 2, 0.3, 0); B.add(band, T.wood);
    for (const k of [-1, 1]) { const st = G.beam(0.07, 0.95, 0.07, 0.01); st.rotateX(k * 0.5); st.translate(s * w / 2, 0.42, -k * 0.24); B.add(st, T.wood); }
  }
  const nuki = G.beam(w + 0.36, 0.12, 0.1, 0.02); nuki.translate(0, h - 0.5, 0); B.add(nuki, T.lacquer);
  const beam = G.beam(w + 0.5, 0.16, 0.16, 0.025); beam.translate(0, h - 0.04, 0); B.add(beam, T.wood);
  roofTile(B, { type: 'gable', w: w + 0.42, d: 0.26, y0: h + 0.04, over: 0.2, gOver: 0.16, H: 0.34, curve: 0.3, lift: 0.1, liftW: 0.4, thick: 0.08, ribW: 0.16, gable: 'wood', gableWood: T.wood, k: 0.42, rich: 1, oniFace: T.gold });
  if (sign) B.at([0, h - 0.27, 0.07], 0, () => {
    const bd = G.box(0.62, 0.36, 0.05, 0.02); B.add(bd, '#2e2420'); const fr = G.box(0.68, 0.42, 0.035, 0.015); fr.translate(0, 0, -0.012); B.add(fr, C.gold);
    for (const yaw of [0, PI]) B.at([0, 0, yaw ? -0.027 : 0.027], yaw, () => { crest(B, 'momiji', 0.3); });
  });
  return [[-(w / 2 - 0.42), h - 0.56, 0.06], [w / 2 - 0.42, h - 0.56, 0.06]];
}

// ------------------------------------------------------------------ a lantern post along the road (hook at the arm's end)
export function lanternPost(B) {
  const base = G.box(0.28, 0.14, 0.28, 0.03); base.translate(0, 0.07, 0); B.add(base, STONES[2]);
  const p = G.beam(0.1, 1.92, 0.1, 0.02); p.translate(0, 1.04, 0); B.add(p, T.wood);
  const capB = G.box(0.2, 0.05, 0.2, 0.01); capB.translate(0, 2.02, 0); B.add(capB, T.wood);
  const cap = G.cone(0.2, 0.15, 4); cap.rotateY(PI / 4); cap.translate(0, 2.12, 0); B.add(cap, T.tile);
  const arm = G.beam(0.52, 0.06, 0.06, 0.01); arm.translate(0.24, 1.8, 0); B.add(arm, T.bengara);
  B.add(tube([{ p: V(0.02, 1.52, 0), r: 0.022 }, { p: V(0.3, 1.78, 0), r: 0.02 }], 5, false), T.bengara);
  const tip = G.cyl(0.03, 0.03, 0.06, 6); tip.rotateZ(PI / 2); tip.translate(0.52, 1.8, 0); B.add(tip, C.gold);
  return [0.44, 1.76, 0];
}

// ------------------------------------------------------------------ cached decor pieces (Placer kit pieces)
const _pc = new Map();
const piece = (k, fn) => { if (!_pc.has(k)) _pc.set(k, fn()); return _pc.get(k); };
function kitOf(fn, seed = 7) { const B = new Builder(seed); B.warpAmt = 0.02; B.jitter = 0.03; fn(B); flatten(B); const t = B.finish(); return { ...t.geos, lights: t.lights }; }
/** a low earthen wall (dobei) with a red-brown tile cap, along local x from 0 to L */
function dobei(L) {
  return piece('dobei:' + L.toFixed(2), () => kitOf(B => {
    const base = G.box(L + 0.04, 0.18, 0.36, 0.03); base.translate(L / 2, 0.09, 0); B.add(base, { grad: [shade(T.stone, 0.82), T.stone] });
    const body = G.box(L, 0.46, 0.27, 0.02); body.translate(L / 2, 0.41, 0); B.add(body, { grad: [shade(T.plaster, 0.9), T.plaster] });
    const band = G.box(L + 0.01, 0.05, 0.285, 0); band.translate(L / 2, 0.21, 0); B.add(band, T.wood);
    for (const s of [-1, 1]) { const sl = G.box(L + 0.12, 0.05, 0.3, 0.012); sl.rotateX(s * 0.42); sl.translate(L / 2, 0.69, s * 0.12); B.add(sl, T.tile); }
    const rid = G.cyl(0.055, 0.055, L + 0.14, 7); rid.rotateZ(PI / 2); rid.translate(L / 2, 0.76, 0); B.add(rid, shade(T.tile, 0.78));
    const n = Math.round(L / 0.16);
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) { const r = G.box(0.035, 0.03, 0.27, 0); r.rotateX(s * 0.42); r.translate(-0.04 + i * (L + 0.08) / n, 0.71, s * 0.125); B.add(r, shade(T.tile, 1.12)); }
    const post = G.box(0.16, 0.86, 0.36, 0.02); post.translate(0, 0.43, 0); B.add(post, T.wood);
  }, 11 + Math.round(L * 10)));
}
/** a stone lantern with fallen maple leaves on its roof and round its foot (not a lamp: its fire box glows at night) */
function stoneLantern(seed) {
  return piece('mtoro:' + seed, () => kitOf(B => {
    const pad = G.cyl(0.4, 0.46, 0.08, 8); pad.translate(0, 0.03, 0); B.add(pad, STONES[2]);
    B.at([0, 0.07, 0], seed * 0.7, () => toro(B, { s: 0.88, moss: false }));
    const rr = mulberry32(seed * 7 + 3), lv = ['#d8402a', '#ec6a2e', '#f4a036', '#c8302a'];
    for (let i = 0; i < 14; i++) { const g = new THREE.ShapeGeometry(momijiShapes()[0], 1); g.scale(0.08, 0.08, 1); g.rotateX(-PI / 2); g.rotateY(rr() * TAU); const top = i < 6, a = rr() * TAU, d = top ? 0.08 + rr() * 0.18 : 0.3 + rr() * 0.25; g.translate(Math.cos(a) * d, top ? 0.082 + 0.88 * (1.03 + 0.21 * Math.pow(Math.max(0, 1 - d / 0.88 / 0.36), 1.2)) : 0.075, Math.sin(a) * d); B.add(g.index ? g.toNonIndexed() : g, lv[i % 4]); }
  }, seed));
}
/** the village well (tsurube-ido): a stone curb, two posts under a little tiled gable, a pulley and a bucket */
function well(B) {
  const curb = G.cyl(0.5, 0.54, 0.56, 12, true); curb.translate(0, 0.28, 0); B.add(curb, (p, n, o) => o.set(STONES[Math.floor((Math.atan2(p.z, p.x) + PI) * 2) % 4]).multiplyScalar(0.88 + 0.12 * Math.sin(p.y * 20)));
  const inner = G.cyl(0.43, 0.43, 0.5, 12, true); inner.scale(-1, 1, 1); inner.translate(0, 0.3, 0); B.add(inner, '#4a4040');
  const water = G.cyl(0.42, 0.42, 0.02, 12); water.translate(0, 0.16, 0); B.add(water, '#3a5a6a');
  const rim = G.torus(0.48, 0.05, 4, 16); rim.rotateX(PI / 2); rim.translate(0, 0.57, 0); B.add(rim, T.woodMid);
  for (const s of [-1, 1]) { const p = G.beam(0.09, 1.9, 0.09, 0.015); p.translate(s * 0.62, 0.95, 0); B.add(p, T.wood); }
  const bar = G.beam(1.36, 0.08, 0.08, 0.012); bar.translate(0, 1.72, 0); B.add(bar, T.wood);
  roofTile(B, { type: 'gable', w: 1.3, d: 0.7, y0: 1.86, over: 0.2, gOver: 0.14, H: 0.42, curve: 0.3, lift: 0.1, liftW: 0.4, thick: 0.08, ribW: 0.16, gable: 'wood', gableWood: T.wood, k: 0.45, rich: 1, oniFace: T.gold });
  const pul = G.cyl(0.09, 0.09, 0.05, 10); pul.rotateX(PI / 2); pul.translate(0, 1.6, 0); B.add(pul, T.woodMid);
  const hook = G.box(0.03, 0.12, 0.03, 0); hook.translate(0, 1.67, 0); B.add(hook, C.iron);
  for (const s of [-1, 1]) { const r = G.box(0.01, 0.9, 0.01, 0); r.translate(s * 0.09, 1.15, 0); B.add(r, '#c8b088'); }
  B.at([0.09, 0.66, 0], 0, () => { const bk = G.cyl(0.1, 0.085, 0.16, 9); bk.translate(0, 0, 0); B.add(bk, '#a8784e'); const hp = G.torus(0.096, 0.01, 3, 10); hp.rotateX(PI / 2); hp.translate(0, 0.04, 0); B.add(hp, C.iron); });
  B.at([-0.72, 0, 0.32], 0.5, () => { const bk = G.cyl(0.11, 0.09, 0.16, 9); bk.translate(0, 0.08, 0); B.add(bk, '#a8784e'); const w = G.cyl(0.095, 0.095, 0.01, 9); w.translate(0, 0.14, 0); B.add(w, '#5a8aa8'); });
}

/** a drift of fallen maple and ginkgo leaves lying flat (for the village placer's d:body batch: no extra draw call) */
const _drift = new Map();
function leafDrift(seed, R = 0.8, n = 16) {
  const k = seed + ':' + R + ':' + n; if (_drift.has(k)) return _drift.get(k);
  const rr = mulberry32(seed * 313 + 9), list = [], cs = ['#d83a28', '#e85a2a', '#f08a30', '#c42e2a', '#f4b03a', '#ffd24a'];
  for (let i = 0; i < n; i++) {
    const g = new THREE.ShapeGeometry(momijiShapes()[0], 1), sz = 0.13 + rr() * 0.07; g.scale(sz, sz, 1); g.rotateZ(rr() * TAU); g.rotateX(-PI / 2 + (rr() - 0.5) * 0.3);
    const a = rr() * TAU, d = R * Math.sqrt(rr()); g.translate(Math.cos(a) * d, 0.012 + rr() * 0.01, Math.sin(a) * d);
    const c = new THREE.Color(cs[Math.floor(rr() * (i % 5 ? 4 : 6))]), ng = g.index ? g.toNonIndexed() : g, P = ng.attributes.position, col = new Float32Array(P.count * 3);
    for (let j = 0; j < P.count; j++) { col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(ng);
  }
  const out = { 'd:body': merge(list) }; out['d:body'].computeBoundingSphere(); _drift.set(k, out); return out;
}

// ------------------------------------------------------------------ the square, the road, the gates, the walls, the greenery
/** Akane's static dressing (populate time): the well, the notice board, benches, leaf-strewn stone lanterns, rice
 *  stooks, lantern posts along the road, the red gates where the trail crosses the rim, low tile-capped walls round the
 *  camera side, and the hamlet's own trees (maples, ginkgo, persimmons, a chestnut) and autumn ground cover.
 *  → { lamps, spots, gates } for the runtime */
export function decor(VL, ctx, PL, h0) {
  const S = VL.site, sq = VL.def.square.r, at = (a, d) => slotAt(S, a, d), out = { lamps: [], spots: [] };
  const face = p => Math.atan2(S.x - p.x, S.z - p.z), tw = ctx.plan.trailW;
  const solid = (x, z, r) => { ctx.addCollider(x, z, r); ctx.blockCells(x, z, r * 0.8); };
  const inBuilding = (x, z, pad = 0.4) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; return lx > f[0] - pad && lx < f[2] + pad && lz > f[1] - pad && lz < f[3] + pad; });
  const inCamp = (x, z, pad = 0.4) => VL.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad);
  const clear = (p, m, pad = 0.3) => p && ctx.pathDist(p.x, p.z) > tw + m && !inBuilding(p.x, p.z, pad);
  /** the first slot near (a, d) that is clear of the trail and the buildings (stepping away from a0 by `step`°) */
  const slot = (a, d, m, step = 4, tries = 8) => { for (let k = 0; k < tries; k++) for (const s of k ? [1, -1] : [1]) { const p = at(a + s * k * step, d); if (clear(p, m)) return p; } return null; };
  // the well at the top of the square, beside the road out
  {
    const p = slot(-4, sq + 1.5, 1.5, 4, 6);
    if (p) {
      const f = face(p); ctx.prop(B => { well(B); flatten(B); }, { x: p.x, z: p.z, y: h0, rot: f, seed: 31, occluder: true }); solid(p.x, p.z, 0.7);
      out.spots.push({ x: p.x + Math.sin(f) * 1.15, z: p.z + Math.cos(f) * 1.15, face: f + PI, pose: 'admire', w: 1, dur: [8, 14], emote: ['sparkle', 'note'] });
    }
  }
  // the notice board where the road leaves (travellers read it), benches facing the square
  {
    const p = slot(-52, sq + 2.7, 1.0);
    if (p) {
      const f = face(p); ctx.prop(B => { B.footprint = [1, 1]; B.detail = 1; B.variant = 1; MODELS.bulletinBoard(B, 1, 1); flatten(B); }, { x: p.x, z: p.z, y: h0, rot: f, seed: 41, occluder: true }); solid(p.x, p.z, 0.45);
      out.spots.push({ x: p.x + Math.sin(f) * 0.9, z: p.z + Math.cos(f) * 0.9, face: f + PI, pose: 'read', w: 0.9, dur: [6, 11], fidget: ['scratchHead', 'nod'], emote: ['note', 'sparkle'] });
    }
  }
  for (const [a, k] of [[-66, 1], [66, 2]]) { const p = slot(a, sq + 1.35, 0.8); if (!p) continue; const r = face(p); PL.piece(bodyOnly('bench' + k, () => Pr.bench(k)), p.x, p.z, r, { y: h0, lights: false }); solid(p.x, p.z, 0.55); out.spots.push({ x: p.x, z: p.z, face: r, seat: true, seatY: h0 + 0.45, w: 1.2, dur: [16, 30], emote: ['note', 'heart', 'zzz'] }); }
  for (const [a, k] of [[-30, 1], [30, 2], [-150, 3], [150, 4]]) { const p = slot(a, sq + 0.95, 0.7, 5); if (!p) continue; PL.piece(stoneLantern(k), p.x, p.z, face(p), { y: h0, lights: false }); solid(p.x, p.z, 0.34); }
  for (const [a, k, s] of [[-122, 1, 1], [-112, 2, 0.85], [124, 3, 0.95]]) { const p = slot(a, sq + 1.25, 0.8, 4); if (p) { PL.piece(Pr.sheaf(k), p.x, p.z, a, { y: h0, s }); solid(p.x, p.z, 0.3); } }
  { const p = slot(-100, sq + 2.0, 1.0, 4); if (p) { const rot = face(p) + PI / 2 + 0.3; ctx.prop(B => { handCart(B); flatten(B); }, { x: p.x, z: p.z, y: h0, rot, seed: 81, occluder: true }); for (const k of [-1.1, -0.3, 0.45]) solid(p.x + Math.cos(rot) * k, p.z - Math.sin(rot) * k, 0.45); } }
  // the road through the hamlet: lantern posts on its far side, a red gate where it crosses the clearing's rim
  const tr = ctx.plan.trail, R = S.r - 2.4, cross = [];
  for (let i = 1; i < tr.length; i++) {
    const d0 = Math.hypot(tr[i - 1][0] - S.x, tr[i - 1][1] - S.z), d1 = Math.hypot(tr[i][0] - S.x, tr[i][1] - S.z);
    if ((d0 - R) * (d1 - R) < 0) { const k = (R - d0) / (d1 - d0), x = tr[i - 1][0] + (tr[i][0] - tr[i - 1][0]) * k, z = tr[i - 1][1] + (tr[i][1] - tr[i - 1][1]) * k; cross.push({ x, z, tx: tr[i][0] - tr[i - 1][0], tz: tr[i][1] - tr[i - 1][1] }); }
  }
  for (const c of cross) {
    const L = Math.hypot(c.tx, c.tz) || 1, tx = c.tx / L, tz = c.tz / L, rot = Math.atan2(tx, tz), y = ctx.heightAt(c.x, c.z);
    let hooks = []; ctx.prop(B => { hooks = gate(B, { w: 3.6 }); flatten(B); }, { x: c.x, z: c.z, y, rot, seed: 51, occluder: true });
    const co = Math.cos(rot), si = Math.sin(rot);
    for (const hk of hooks) out.lamps.push({ x: c.x + hk[0] * co + hk[2] * si, y: y + hk[1], z: c.z - hk[0] * si + hk[2] * co });
    for (const s of [-1, 1]) solid(c.x + tz * s * 1.8, c.z - tx * s * 1.8, 0.26);
  }
  out.gates = cross;
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i], seg = Math.hypot(x1 - x0, z1 - z0); acc += seg;
    if (acc < 4.6) continue;
    const dS = Math.hypot(x1 - S.x, z1 - S.z); if (dS > R - 0.6 || dS < sq + 1.4) continue;
    acc = 0;
    const tx = (x1 - x0) / (seg || 1), tz = (z1 - z0) / (seg || 1); let nx = -tz, nz = tx; if (nx + nz > 0) { nx = -nx; nz = -nz; }
    const x = x1 + nx * (tw + 1.0), z = z1 + nz * (tw + 1.0);
    if (inBuilding(x, z, 0.6)) continue;
    const rot = Math.atan2(-nx, -nz) + PI / 2;
    let hook = null; ctx.prop(B => { hook = lanternPost(B); flatten(B); }, { x, z, y: ctx.heightAt(x, z), rot, seed: 61 + i, occluder: true });
    solid(x, z, 0.16);
    const c = Math.cos(rot), s = Math.sin(rot);
    out.lamps.push({ x: x + hook[0] * c + hook[2] * s, y: ctx.heightAt(x, z) + hook[1], z: z - hook[0] * s + hook[2] * c, color: '#f6e2b0' });
  }
  // low tile-capped earthen walls round the camera side of the rim, between the two gates (they never hide the hero)
  const ga = cross.map(c => slotOf(S, c.x, c.z).a).sort((a, b) => a - b);
  if (ga.length === 2) {
    const fr = S.r - 1.0, a0 = ga[1] + 9, a1 = ga[0] + 360 - 9, n = Math.max(2, Math.round((a1 - a0) / 360 * TAU * fr / 2.6));
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n, p = at(aa, fr), q = at(ab, fr), L = Math.hypot(q.x - p.x, q.z - p.z);
      if (VL.camps.some(c => Math.hypot((p.x + q.x) / 2 - c.x, (p.z + q.z) / 2 - c.z) < c.r + 1) || inBuilding((p.x + q.x) / 2, (p.z + q.z) / 2, 0.4)) continue;
      const rot = Math.atan2(q.x - p.x, q.z - p.z) - PI / 2;
      PL.piece(dobei(Math.round(L * 0.98 * 20) / 20), p.x, p.z, rot, { y: ctx.heightAt(p.x, p.z) });
      for (let k = 0; k <= 3; k++) ctx.addCollider(p.x + (q.x - p.x) * k / 3, p.z + (q.z - p.z) * k / 3, 0.2);
    }
  }
  // the hamlet's own trees: crimson and orange maples and golden ginkgo round the far rim, persimmons toward the
  // orchard, a chestnut behind the inn, Elder Kaede's weeping maple; ground cover of susuki, spider lilies and leaves
  let seed = 1213; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tree = (parts0, x, z, r, s = 1) => { const parts = { ...parts0 }; delete parts.foliage; PL.multi(parts, x, ctx.heightAt(x, z) - 0.05, z, { rot: rr() * TAU, s }); ctx.addCollider(x, z, 0.38 * s); ctx.blockCells(x, z, 0.5 * s); ctx.paint('litter', x, z, r * 1.5 * s, 0.9); ctx.paintFx('canopy', x, z, r * 1.8 * s, 1); ctx.paintFx('shade', x, z, r * 1.5 * s, 0.6); };
  const treeOk = (x, z, pad = 1.0) => !inBuilding(x, z, pad) && ctx.pathDist(x, z) > tw + 2.0 && ctx.waterAt(x, z) < 0.02 && !inCamp(x, z, 0.6);
  const byB = k => VL.buildings.find(b => b.kind === k);
  { const b = byB('elder'); if (b) { const p = VL.local(b, b.info.fp[0] - 0.5, b.info.fp[1] + 0.4); if (treeOk(p.x, p.z, 0.1)) tree(F.maple('weep', 2, 'crimson'), p.x, p.z, 1.6, 1.05); } }
  { const b = byB('teaHouse'); if (b) { const p = VL.local(b, 2.65, 0.8); tree(F.maple('weep', 1, 'scarlet'), p.x, p.z, 1.2, 0.6); } }
  { const b = byB('inn'); if (b) { const p = VL.local(b, -1.2, b.info.fp[1] - 1.4); if (treeOk(p.x, p.z, 0.3)) { tree(F.chestnut(0), p.x, p.z, 2.0, 0.82); PL.multi(F.burrs(1), p.x + 1.1, ctx.heightAt(p.x + 1.1, p.z + 0.6), p.z + 0.6); } } }
  // the rim: species by where they stand (persimmons toward the orchard on the left, ginkgo flanking the road out)
  const exitA = ga.length === 2 ? (Math.abs(ga[0]) < Math.abs(ga[1]) ? ga[0] : ga[1]) : 18;
  const rim = [];
  for (let i = 0; i < 9; i++) rim.push({ a: -98 + i / 8 * 96 + (rr() - 0.5) * 6, d: S.r - 0.5 + rr() * 1.3 });
  rim.push({ a: exitA - 13, d: S.r - 1.4, ginkgo: true });
  for (const t of rim) {
    const p = at(t.a, t.d); if (!treeOk(p.x, p.z)) continue;
    if (t.ginkgo) tree(F.ginkgo(t.a > exitA ? 1 : 2), p.x, p.z, 1.8, 0.82);
    else if (t.a < -45 && t.a > -80) tree(F.persimmon(Math.floor(rr() * 3)), p.x, p.z, 1.9, 0.85);
    else if (rr() < 0.18) tree(F.ginkgo(3), p.x, p.z, 1.8, 0.8);
    else tree(F.maple('dome', 1 + Math.floor(rr() * 3), ['crimson', 'scarlet', 'orange', 'scarlet', 'gold'][Math.floor(rr() * 5)]), p.x, p.z, 2.2, 0.72 + rr() * 0.18);
  }
  const lilies = []; // (spider lilies join the static chunks: no batch of their own)
  const lily = (k, x, y, z, rot, s) => lilies.push([F.higanbana(k).plant, x, y, z, rot, s]);
  for (let i = 0; i < 110; i++) {
    const a = rr() * 360 - 180, d = 6.0 + rr() * (S.r - 5.2), p = at(a, d);
    if (inBuilding(p.x, p.z, 0.15) || ctx.pathDist(p.x, p.z) < tw + 0.5 || inCamp(p.x, p.z, 0.3) || ctx.waterAt(p.x, p.z) > 0.02) continue;
    const near = VL.buildings.some(b => Math.hypot(p.x - b.x, p.z - b.z) < 4.4), cam = Math.abs(a) > 100, y = ctx.heightAt(p.x, p.z), k = rr(), rot = rr() * TAU;
    if (!near && !cam && rr() < 0.5) continue;
    if (k < 0.34) lily(Math.floor(rr() * 3), p.x, y, p.z, rot, 0.9 + rr() * 0.3);
    else if (k < 0.6) PL.multi(F.susuki(Math.floor(rr() * 3)), p.x, y, p.z, { rot, s: 0.7 + rr() * 0.3 });
    else if (k < 0.8) { PL.multi(F.leafPile(Math.floor(rr() * 3), { R: 0.5, h: 0.22 }), p.x, y - 0.03, p.z, { rot }); }
    else if (k < 0.9) PL.multi(F.mushrooms(Math.floor(rr() * 3), rr() < 0.5 ? 'shiitake' : 'shimeji'), p.x, y, p.z, { rot });
    else { const s2 = 0.8 + rr() * 0.3; lily(3, p.x, y, p.z, rot, s2); lily(4, p.x + 0.4, y, p.z + 0.2, rot + 1, s2); }
  }
  for (let i = 0; i < 26; i++) { // fallen leaves drifted against the square's rim and the walls
    const a = -180 + i / 26 * 360 + (rr() - 0.5) * 8, p = at(a, sq + 0.2 + rr() * 1.4);
    if (inBuilding(p.x, p.z, 0.05) || ctx.pathDist(p.x, p.z) < tw * 0.6) continue;
    PL.multi(leafDrift(i % 4, 0.6 + (i % 3) * 0.25, 18 + (i % 3) * 6), p.x, ctx.heightAt(p.x, p.z), p.z, { rot: rr() * TAU });
  }
  if (lilies.length) ctx.prop(B => { for (const [g, x, y, z, rot, s] of lilies) B.at([x - S.x, y - h0, z - S.z], rot, () => B.add(g.clone(), null), s); }, { x: S.x, z: S.z, y: h0, rot: 0, seed: 71, warp: 0, occluder: true });
  return out;
}

/** a daihachi hand cart parked at the rim: a long plank bed on two big wheels, the pull bar, a load of rice bales and
 *  sacks under a straw rope (front = +z; the bar points along -x) */
function handCart(B, { load = true } = {}) {
  const bed = G.box(1.6, 0.07, 0.8, 0.015); bed.translate(0.1, 0.5, 0); B.add(bed, (p, n, o) => o.set('#a8784e').multiplyScalar(n.y > 0.5 ? 0.92 + 0.08 * Math.sin(p.z * 40) : 0.8));
  for (const sz of [-1, 1]) { const rl = G.beam(2.3, 0.07, 0.07, 0.012); rl.translate(-0.25, 0.47, sz * 0.36); B.add(rl, '#6a4a36'); }
  const bar = G.beam(0.07, 0.07, 0.82, 0.012); bar.translate(-1.38, 0.47, 0); B.add(bar, '#6a4a36');
  for (const sz of [-1, 1]) B.at([0.25, 0.42, sz * 0.48], 0, () => wheel(B, { r: 0.42, color: '#7a5a42' }));
  const axle = G.cyl(0.03, 0.03, 1.0, 6); axle.rotateX(PI / 2); axle.translate(0.25, 0.42, 0); B.add(axle, C.iron);
  const prop = G.beam(0.05, 0.5, 0.05, 0.01); prop.translate(-1.3, 0.24, 0); B.add(prop, '#6a4a36');
  if (!load) return;
  for (const [x, y, z] of [[-0.2, 0.54, -0.18], [-0.2, 0.54, 0.18], [0.36, 0.54, -0.18], [0.36, 0.54, 0.18], [0.08, 0.85, 0]]) B.at([x, y, z], 0, () => tawara(B, { L: 0.5, r: 0.16 }));
  B.at([0.65, 0.54, 0.12], 0.4, () => sack(B, { r: 0.14, color: '#efe2c4', band: '#a8784a' }));
  const rope = G.torus(0.42, 0.016, 4, 14, PI); rope.rotateY(PI / 2); rope.scale(1, 0.9, 1); rope.translate(0.08, 0.6, 0); B.add(rope, '#d8c088');
}
/** a daikon drying rack (saved square): two posts and two bamboo rails hung with pairs of white radishes by their
 *  leafy tops (along local x) */
function daikonRack(B) {
  for (const sx of [-1, 1]) { const p = G.beam(0.08, 1.7, 0.08, 0.015); p.translate(sx * 0.95, 0.85, 0); B.add(p, T.woodMid); const ft = G.box(0.22, 0.06, 0.22, 0.01); ft.translate(sx * 0.95, 0.03, 0); B.add(ft, STONES[2]); }
  const rr = mulberry32(61);
  for (const y of [1.6, 1.08]) {
    const rail = G.cyl(0.028, 0.028, 2.1, 6); rail.rotateZ(PI / 2); rail.translate(0, y, 0); B.add(rail, '#c8b070');
    for (let i = 0; i < 9; i++) for (const sz of [-1, 1]) {
      const x = -0.8 + i * 0.2 + (rr() - 0.5) * 0.04, L = 0.36 + rr() * 0.1, tilt = (rr() - 0.5) * 0.12;
      B.at([x, y - 0.04, sz * 0.05], 0, () => {
        const top = G.cone(0.06, 0.16, 6); top.translate(0, 0.02, 0); B.add(top, '#5a8a3a');
        const root = G.lathe([[0.001, -L], [0.022, -L + 0.05], [0.04, -L * 0.5], [0.045, -0.08], [0.03, -0.03], [0.001, -0.02]], 7); B.add(root, (p, n, o) => o.set('#f6f0e2').lerp(new THREE.Color('#c8d8a0'), clamp((p.y + 0.12) / 0.1)));
      }, 1, sz * 0.25, tilt);
    }
  }
}

/** the harvest offering (saved square): a pyramid of rice bales bound with a shimenawa and paper shide, a sanbō stand
 *  of persimmons and a mochi pair, two sake casks, a pair of red lanterns on posts (front = +z) */
function harvestOffering(B) {
  const mat = G.box(1.7, 0.05, 1.0, 0.02); mat.translate(0, 0.025, 0); B.add(mat, (p, n, o) => o.set(Math.sin(p.x * 50) > 0 ? '#d8bc80' : '#c8ac70'));
  for (const [x, y, z] of [[-0.31, 0.05, -0.15], [0.31, 0.05, -0.15], [0, 0.36, -0.15], [-0.31, 0.05, 0.2], [0.31, 0.05, 0.2]]) B.at([x, y, z], 0, () => tawara(B, { L: 0.58, r: 0.17 }));
  B.at([0, 0.62, 0.05], 0, () => { const rope = G.torus(0.35, 0.035, 5, 14, PI); rope.rotateY(0); rope.scale(1, 0.6, 1.4); B.add(rope, '#ecd8a0'); for (const x of [-0.18, 0.18]) { const sh = G.box(0.05, 0.18, 0.01, 0); sh.translate(x, -0.12, 0.2); B.add(sh, '#ffffff'); } });
  B.at([0.62, 0.05, 0.36], 0, () => { // the sanbō: a pale wooden stand with persimmons heaped on it, a mochi pair
    const st = G.box(0.32, 0.18, 0.32, 0.01); st.translate(0, 0.09, 0); B.add(st, '#e8d2a8'); const tp = G.box(0.38, 0.03, 0.38, 0.01); tp.translate(0, 0.195, 0); B.add(tp, '#f2e2c0');
    heap(B, 0.14, 0.21, KAKI, { n: 6, r: 0.055, seed: 21, dome: 0.8 });
  });
  B.at([-0.62, 0.05, 0.36], 0, () => { const st = G.box(0.32, 0.18, 0.32, 0.01); st.translate(0, 0.09, 0); B.add(st, '#e8d2a8'); for (const [y, r] of [[0.25, 0.11], [0.35, 0.085]]) { const m = G.sph(r, 10, 7); m.scale(1, 0.55, 1); m.translate(0, y, 0); B.add(m, '#fffaf2'); } const dd = G.sph(0.05, 8, 6); dd.translate(0, 0.42, 0); B.add(dd, '#f08a2a'); });
  for (const sx of [-1, 1]) inject(B, Pr.komodaru(sx > 0 ? 7 : 8), [sx * 1.08, 0, -0.15], -sx * 0.3);
}
/** the moon-viewing stand (saved square): a low table with a pyramid of white dango on a stand and susuki in a vase */
function tsukimi(B) {
  const top = G.box(0.9, 0.05, 0.5, 0.015); top.translate(0, 0.5, 0); B.add(top, '#b8865c');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.box(0.05, 0.48, 0.05, 0); l.translate(sx * 0.4, 0.24, sz * 0.2); B.add(l, T.woodMid); }
  const felt = G.box(0.86, 0.015, 0.46, 0); felt.translate(0, 0.53, 0); B.add(felt, '#c8342a');
  B.at([-0.18, 0.54, 0], 0, () => { const st = G.cyl(0.13, 0.15, 0.1, 10); st.translate(0, 0.05, 0); B.add(st, '#e8d2a8'); const pl = G.box(0.28, 0.02, 0.28, 0.005); pl.translate(0, 0.11, 0); B.add(pl, '#fffaf0');
    let k = 0; for (const [n, y] of [[3, 0.15], [2, 0.21], [1, 0.27]]) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const d = G.sph(0.034, 7, 5); d.translate((i - (n - 1) / 2) * 0.066, y, (j - (n - 1) / 2) * 0.066); B.add(d, k++ % 5 ? '#fffaf4' : '#f4ecdc'); } });
  B.at([0.25, 0.54, 0.02], 0, () => {
    const v = G.lathe([[0.001, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.22], [0.05, 0.26], [0.001, 0.26]], 8); B.add(v, '#4a5a6a');
    for (let i = 0; i < 6; i++) { const a = i * 1.05, t = tube([{ p: V(0, 0.24, 0), r: 0.008 }, { p: V(Math.cos(a) * 0.12, 0.62 + (i % 2) * 0.1, Math.sin(a) * 0.08), r: 0.006 }], 3, false); B.add(t, '#a89850'); const pl = G.cone(0.03, 0.16, 5); pl.rotateZ(Math.cos(a) * -0.5); pl.translate(Math.cos(a) * 0.14, 0.72 + (i % 2) * 0.1, Math.sin(a) * 0.09); B.add(pl, '#f4ece0'); }
  });
  for (const sx of [-1, 1]) B.at([sx * 0.62, 0, 0.3], 0, () => kikuPot(B, sx > 0 ? 2 : 7, 0.15));
}

/** saved-only dressing: what the villagers put back where the siege camps stood (data.js camps[].saved) — the
 *  persimmon drying frame, the rice harvest, a roasted-chestnut stall beside the road — and chrysanthemums round the
 *  square */
export function savedDecor(VL, B, h0) {
  const S = VL.site, sq = VL.def.square.r, ctx = VL.ctx, tw = ctx?.plan?.trailW ?? 1.45;
  for (const c of VL.camps) {
    let [u, v] = c.at;
    if (c.saved === 'stall' && ctx) { // beside the road, never on it
      for (const du of [2.4, -2.4, 3.2, -3.2, 4.0, -4.0]) { const q = screenAt(S, c.at[0] + du, c.at[1]); if (ctx.pathDist(q.x, q.z) > tw + 1.1) { u = c.at[0] + du; break; } }
    }
    const f = screenAt(S, u, v), yaw = screenYaw({ persimmons: 35, harvest: -30 }[c.saved] ?? 0); // (turned so neither camera yaw sees a rack edge-on)
    B.at([f.x, h0, f.z], yaw, () => {
      if (c.saved === 'persimmons') { // a hoshigaki drying frame hung with persimmon strings, baskets of fresh fruit
        for (const sx of [-1, 1]) { const p = G.beam(0.08, 1.55, 0.08, 0.015); p.translate(sx * 0.95, 0.78, -0.2); B.add(p, T.woodMid); }
        for (const y of [1.48, 1.0]) { const r = G.cyl(0.03, 0.03, 2.1, 6); r.rotateZ(PI / 2); r.translate(0, y, -0.2); B.add(r, '#c8b070'); }
        const cap = G.box(2.3, 0.05, 0.4, 0.015); cap.rotateX(0.18); cap.translate(0, 1.6, -0.22); B.add(cap, T.tile);
        for (let i = 0; i < 12; i++) B.at([-0.85 + i * 0.155, 1.46, -0.2], 0, () => kakiString(B, 4, { seed: i + 40 }));
        for (let i = 0; i < 11; i++) B.at([-0.78 + i * 0.155, 0.98, -0.2], 0, () => kakiString(B, 3, { seed: i + 60 }));
        const mat = G.box(1.3, 0.025, 0.7, 0.01); mat.translate(-0.2, 0.012, 0.65); B.add(mat, (p, n, o) => o.set(Math.sin(p.x * 60) > 0 ? '#d8bc80' : '#c8ac70'));
        B.at([-0.2, 0, 0.65], 0, () => heap(B, 0.5, 0.0, KAKI, { n: 16, r: 0.05, seed: 9, dome: 0.1 }));
        for (const [x, z] of [[0.85, 0.6], [1.2, 0.2]]) B.at([x, 0, z], x, () => basket(B, { r: 0.18, h: 0.16, fill: KAKI, fr: 0.055, n: 7, seed: x * 10 | 0 }));
        B.at([-1.35, 0, 0.35], 0.4, () => { const l = G.box(0.05, 1.4, 0.05, 0); for (const s of [-1, 1]) { const g = l.clone(); g.translate(s * 0.16, 0.66, 0); g.rotateX(-0.3); B.add(g, T.woodMid); } for (let k = 0; k < 4; k++) { const r = G.box(0.32, 0.03, 0.03, 0); r.translate(0, 0.25 + k * 0.32, -0.08 - k * 0.1); B.add(r, T.woodMid); } });
      } else if (c.saved === 'harvest') { // the rice harvest: a full drying rack, stooks, straw bales, rice bales, a scarecrow
        inject(B, Pr.hasa(5, { L: 2.8, h: 1.35 }), [-1.4, 0, -0.5], 0);
        for (const [x, z, k] of [[-1.5, 0.75, 6], [-0.8, 1.15, 7], [1.65, -0.4, 8]]) inject(B, Pr.sheaf(k), [x, 0, z], x);
        for (const [x, y, z] of [[0.4, 0, 0.55], [0.4, 0, 0.91], [0.4, 0.31, 0.73]]) B.at([x, y, z], 0, () => tawara(B));
        for (const [x, z] of [[1.3, 0.85], [1.55, 0.5]]) B.at([x, 0, z], x * 3, () => sack(B, { r: 0.15, color: '#efe2c4', band: '#a8784a' }));
        inject(B, Pr.kakashi(1), [1.3, 0, -1.0], -0.4);
      } else if (c.saved === 'stall') { // a roasted-chestnut stall: a cart with a glowing pan, a stool, a parasol, a flag
        B.at([0, 0, 0], 0, () => {
          const bed = G.box(1.3, 0.08, 0.7, 0.02); bed.translate(0, 0.6, 0); B.add(bed, '#a8784e');
          for (const s of [-1, 1]) { const sd = G.box(1.3, 0.2, 0.04, 0.01); sd.translate(0, 0.52, s * 0.33); B.add(sd, T.bengara); }
          for (const sz of [-1, 1]) B.at([-0.25, 0.32, sz * 0.4], 0, () => wheel(B, { r: 0.3 }));
          const leg = G.box(0.06, 0.56, 0.06, 0); leg.translate(0.55, 0.28, 0); B.add(leg, T.woodMid);
          const pan = G.lathe([[0.001, 0.0], [0.3, 0.02], [0.36, 0.09], [0.37, 0.11], [0.33, 0.1], [0.001, 0.04]], 14); pan.translate(-0.2, 0.66, 0); B.add(pan, '#3a3436');
          const coal = G.cyl(0.26, 0.26, 0.02, 10); coal.translate(-0.2, 0.69, 0); B.glow(coal, '#ff7a2a', { hot: true, flicker: 1, tint: 1 });
          B.at([-0.2, 0, 0], 0, () => heap(B, 0.27, 0.71, NUT, { n: 22, r: 0.033, seed: 12, dome: 0.4 }));
          B.at([0.4, 0.64, 0.05], 0, () => basket(B, { r: 0.13, h: 0.12, fill: ['#c84a3a', '#a83a3a', '#e8c890'], fr: 0.045, n: 6, seed: 4 }));
          const h1 = G.box(0.06, 0.06, 0.9, 0.01); h1.translate(0.95, 0.62, 0); h1.rotateY(0); B.add(h1, T.woodMid);
          B.at([-0.95, 0, 0.75], 0, () => parasol(B, { r: 0.85, h: 1.85, color: '#d83a2c', ribs: 10 }));
          B.at([0.4, 0, 0.85], 0, () => { const st = G.cyl(0.14, 0.14, 0.05, 8); st.translate(0, 0.38, 0); B.add(st, T.woodMid); for (let k = 0; k < 3; k++) { const l = G.cyl(0.02, 0.02, 0.38, 4); l.translate(Math.cos(k * 2.1) * 0.09, 0.19, Math.sin(k * 2.1) * 0.09); B.add(l, T.wood); } });
          B.at([1.15, 0, -0.45], 0, () => flag(B, { h: 2.0, w: 0.36, color: '#f6efe0', crestName: 'kuri', crestColor: '#7a4428', hem: '#7a4428' }));
        });
      }
    });
  }
  // the square's own festival: the harvest offering at the top (rice bales under a sacred rope, persimmons and mochi
  // on a sanbō, sake casks), and a moon-viewing stand of dango and susuki on the camera side
  const clearOf = (a0, d, m) => { for (let k = 0; k < 8; k++) for (const sg of k ? [1, -1] : [1]) { const p = slotAt(S, a0 + sg * k * 4, d); if (!ctx || ctx.pathDist(p.x, p.z) > tw + m) return p; } return null; };
  { const p = clearOf(48, sq + 1.75, 1.2); if (p) B.at([p.x, h0, p.z], p.rot, () => harvestOffering(B)); }
  { const p = clearOf(142, sq + 0.95, 0.7); if (p) B.at([p.x, h0, p.z], p.rot, () => tsukimi(B)); }
  { const p = clearOf(-84, sq + 2.2, 1.0); if (p) B.at([p.x, h0, p.z], p.rot + 0.25, () => daikonRack(B)); }
  if (ctx) { // a festival lantern line strung over the road where it leaves the square
    let best = null; for (let a2 = -10; a2 <= 46; a2 += 2) { const p = slotAt(S, a2, sq + 2.6), dd = ctx.pathDist(p.x, p.z); if (!best || dd < best.dd) best = { a: a2, dd }; }
    if (best) { const p0 = clearOf(best.a - 16, sq + 2.6, 0.7), p1 = clearOf(best.a + 16, sq + 2.6, 0.7);
      if (p0 && p1) { const L2 = Math.hypot(p1.x - p0.x, p1.z - p0.z); B.at([p0.x, h0, p0.z], Math.atan2(-(p1.z - p0.z), p1.x - p0.x), () => inject(B, Pr.lanternLine(9, { L: Math.round(L2 * 10) / 10, h: 2.5 }))); } }
  }
  for (const a of [-118, -96, 96, 118, 168, -168]) { const p = slotAt(S, a, sq + 0.6); B.at([p.x, h0, p.z], 0, () => kikuPot(B, (a + 400) % 9, 0.18)); }
}
