// Tanu's Trinkets: the market stall's model (docs/HOUSING.md §3), a cached kit Builder template like the Seed Stall's
// (life/gardenModels.js seedStallTemplate): front +z, base at the origin, about 2.6 m wide x 1.6 m deep x 2.4 m tall
// (home/sources.js sizes the stall's colliders and the F prompt from its bounding box, so nothing sticks out of that).
//  - a plank deck, four posts with knee braces, and a sloped awning in Tanu's leaf green and cream that billows between
//    bamboo rafters, with a scalloped valance (every other flap carries Tanu's leaf);
//  - a hanging sign reading たぬき屋 (brush strokes on a cream board in a leaf-green frame);
//  - a back shelf of tiny furniture for sale (a chair, an andon, a tea set, cushions, a tansu, daruma, kokeshi, a bonsai,
//    a folding screen, a clock, books...) with paper price tags;
//  - the counter with Tanu's leaf crest, a lucky cat (furnitureModels2.js luckyCat, light), a cushion stack and a tray
//    of daruma; two red paper lanterns (glow, a night light at each), a glass wind chime, crates of rolled rugs and
//    little potted plants at the front corners.
import * as THREE from 'three';
import { Builder, G, V, PI, shade, col, bar } from '../world/buildings/kit.js';
import { tube, paint } from '../gfx/geom.js';
import { crate, nz, leafGeo, blossomGeo } from '../world/buildings/props.js';
import { symbol } from '../world/buildings/symbols.js';
import { KIT } from './furnitureModels.js';
import { BUILDERS2 } from './furnitureModels2.js';
import { FURNITURE } from './furniture.js';
import { clamp, TAU } from '../core/util.js';

const { put, box, sbox, cyl, ball, lathe, pipe, curve, stroke, ribbon, roundRect, extrude, pillowGeo, pillowY, quadPaint, wrapLathe, ellD, bladeGeo, heartPath, bambooPole, alignY, INK, GOLD } = KIT;

const LEAF = '#8cc674', LEAF_D = '#5e9e50', CREAM = '#fff2da', BROWN = '#8a5a3a', WOOD = '#c98f5e', WOOD_D = '#8a5c3c', WOOD_L = '#e2b988', DECK = '#bf8a5a', RED = '#e2483c';
/** planed wood: grain across `along`, a soft top light */
function grain(c, along = 'y', f = 60, amt = 0.05) {
  const C0 = col(c);
  return (p, n, o) => {
    const u = along === 'x' ? p.x : along === 'y' ? p.y : p.z, v = along === 'x' ? p.z + p.y * 0.5 : along === 'y' ? p.x + p.z : p.x + p.y * 0.5;
    o.copy(C0).multiplyScalar(1 + amt * Math.sin(v * f + Math.sin(u * 7) * 1.5 + nz(u * 4, v * 4) * 1.4)).multiplyScalar(0.92 + 0.1 * clamp(n.y * 0.5 + 0.5));
  };
}
/** a bevelled beam (G.beam) from a to b, t thick */
function beamAB(a, b, t) { const d = b.clone().sub(a), g = G.beam(t, t, d.length(), t * 0.22); g.applyMatrix4(new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * d.length() ? V(1, 0, 0) : V(0, 1, 0))); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; }
const soft = c => { const C0 = col(c); return (p, n, o) => o.copy(C0).multiplyScalar(0.9 + 0.12 * clamp(n.y * 0.6 + 0.45)); };

// たぬき屋 as brush strokes: per glyph, strokes of [points (a unit box, x right, y up), width, spline samples]
const SIGN = [
  [[[[-0.36, 0.25], [-0.12, 0.28], [0.06, 0.31]], 0.1, 8], [[[-0.08, 0.46], [-0.16, 0.14], [-0.26, -0.14], [-0.37, -0.42]], 0.105, 10],
    [[[0.1, 0.07], [0.26, 0.1], [0.4, 0.13]], 0.09, 8], [[[0.09, -0.14], [0.06, -0.28], [0.16, -0.37], [0.44, -0.36]], 0.095, 12]],
  [[[[-0.3, 0.32], [-0.27, 0.06], [-0.16, -0.26]], 0.095, 8],
    [[[0.1, 0.44], [0.02, 0.18], [-0.1, -0.06], [-0.26, -0.3], [-0.36, -0.34], [-0.36, -0.18], [-0.24, 0.02], [-0.04, 0.17], [0.18, 0.22], [0.37, 0.12], [0.43, -0.08], [0.37, -0.28], [0.22, -0.38], [0.08, -0.36], [0.12, -0.25], [0.28, -0.25], [0.4, -0.36], [0.46, -0.45]], 0.085, 48]],
  [[[[-0.3, 0.27], [0.0, 0.3], [0.3, 0.33]], 0.09, 6], [[[-0.36, 0.07], [0.0, 0.1], [0.38, 0.14]], 0.09, 6],
    [[[-0.12, 0.46], [0.06, 0.14], [0.2, -0.06], [0.06, -0.1]], 0.1, 10], [[[-0.24, -0.22], [-0.16, -0.36], [0.06, -0.39], [0.32, -0.37]], 0.095, 10]],
  [[[[-0.36, 0.44], [-0.36, 0.24]], 0.07, 0], [[[-0.36, 0.44], [0.36, 0.44], [0.36, 0.26]], 0.07, 0], [[[-0.36, 0.25], [0.36, 0.25]], 0.065, 0],
    [[[-0.36, 0.25], [-0.37, 0.0], [-0.42, -0.24], [-0.5, -0.44]], 0.075, 10], [[[-0.2, 0.1], [0.42, 0.1]], 0.065, 0],
    [[[0.06, 0.09], [-0.12, -0.08], [0.32, -0.1]], 0.065, 0], [[[0.22, 0.0], [0.34, -0.12]], 0.06, 0], [[[0.1, -0.09], [0.1, -0.38]], 0.065, 0],
    [[[-0.08, -0.23], [0.3, -0.23]], 0.06, 0], [[[-0.26, -0.41], [0.46, -0.41]], 0.07, 0]],
];
/** Tanu's leaf (the shape the leaf-hat tanuki wears): a broad leaf with a curled stalk, flat in XY facing +z */
function tanuLeaf(s) {
  const S = new THREE.Shape();
  S.moveTo(0, -0.5 * s); S.bezierCurveTo(0.42 * s, -0.36 * s, 0.46 * s, 0.18 * s, 0, 0.5 * s); S.bezierCurveTo(-0.46 * s, 0.18 * s, -0.42 * s, -0.36 * s, 0, -0.5 * s);
  return S;
}

// ------------------------------------------------------------------ the miniatures on the shelves (base at the origin)
const knob = (B, x, y, z, c = '#3e3a44', r = 0.006) => ball(B, r, x, y, z, c, 1, 4);
const MINI = {
  chair(B) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(B, 0.009, 0.011, 0.09, 5, sx * 0.05, 0, sz * 0.045, WOOD);
    box(B, 0.13, 0.018, 0.12, 0, 0, 0.09, 0, WOOD_L);
    for (const sx of [-1, 1]) cyl(B, 0.009, 0.009, 0.13, 5, sx * 0.052, 0.1, -0.05, WOOD);
    const bk = new THREE.Shape(); bk.moveTo(-0.06, 0); bk.lineTo(0.06, 0); bk.lineTo(0.06, 0.05); bk.quadraticCurveTo(0.06, 0.08, 0, 0.085); bk.quadraticCurveTo(-0.06, 0.08, -0.06, 0.05); bk.lineTo(-0.06, 0);
    bk.holes.push(heartPath(0.045, 0, 0.042, new THREE.Path()));
    put(B, extrude(bk, 0.008, 0.002, 3), 0, 0.145, -0.058, WOOD_L);
    B.add(pillowGeo(0.11, 0.022, 0.1, { ws: 8, hs: 4 }).translate(0, 0.107, 0.005), soft('#ffb0c8'));
  },
  tansu(B) {
    box(B, 0.17, 0.13, 0.085, 0, 0, 0, 0, grain('#c47c48', 'x', 90));
    box(B, 0.18, 0.012, 0.092, 0, 0, 0.13, 0, '#a8643a');
    for (const [x, y, w, h] of [[-0.042, 0.088, 0.075, 0.032], [0.042, 0.088, 0.075, 0.032], [0, 0.048, 0.16, 0.034], [0, 0.008, 0.16, 0.034]]) { box(B, w, h, 0.006, 0, x, y, 0.045, '#d8955c'); knob(B, x, y + h / 2, 0.05); }
  },
  cushions(B) {
    [['#ffaac4', 0], ['#34528a', 0.034], ['#8fd8b8', 0.068]].forEach(([c, y], i) => {
      B.at([0.004 * (i % 2 ? 1 : -1), y, 0], i * 0.25, () => { B.add(pillowGeo(0.15, 0.036, 0.15, { sq: 0.28, edge: 0.4, bot: 0.32, ws: 10, hs: 5 }), soft(c)); knob(B, 0, pillowY(0.036, 0.32, 0.4, 0) - 0.002, 0, shade(c, 0.75), 0.008); });
    });
  },
  daruma(B, c = '#e2382e') {
    const prof = [[0.001, 0], [0.03, 0], [0.042, 0.012], [0.047, 0.04], [0.042, 0.068], [0.028, 0.088], [0.001, 0.096]];
    lathe(B, prof, 10, 0, 0, 0, (p, n, o) => o.set(c).lerp(col('#ffffff'), clamp(n.y - 0.4) * 0.3));
    const Rf = KIT.profR(prof);
    B.add(wrapLathe(new THREE.CircleGeometry(1, 10).scale(0.024, 0.02, 1).translate(0, 0.055, 0), Rf, 0, 0.0012), '#fff6ea');
    for (const s of [-1, 1]) B.add(wrapLathe(new THREE.CircleGeometry(0.0055, 6).translate(s * 0.01, 0.057, 0), Rf, 0, 0.0022), INK);
    B.add(wrapLathe(ribbon([[-0.018, 0.026], [0, 0.021], [0.018, 0.026]], 0.006, { caps: false }), Rf, 0, 0.0012), GOLD);
  },
  kokeshi(B, band = '#e2483c') {
    lathe(B, [[0.001, 0], [0.024, 0], [0.026, 0.01], [0.02, 0.07], [0.016, 0.085], [0.001, 0.086]], 9, 0, 0, 0, (p, n, o) => { o.set('#f8e6c4'); if (p.y > 0.02 && p.y < 0.03 || p.y > 0.05 && p.y < 0.058) o.set(band); else if (p.y > 0.035 && p.y < 0.045) o.set('#5aa84a'); });
    ball(B, 0.026, 0, 0.106, 0, '#fff0dc', 1, 8);
    ball(B, 0.027, 0, 0.114, -0.004, '#2e2a30', [1, 0.8, 1], 8);
    for (const s of [-1, 1]) { knob(B, s * 0.009, 0.104, 0.024, INK, 0.0035); knob(B, s * 0.015, 0.096, 0.021, '#ff9eb0', 0.0045); }
  },
  andon(B) {
    box(B, 0.1, 0.012, 0.1, 0, 0, 0, 0, '#7a4e36');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(B, G.beam(0.012, 0.2, 0.012, 0.003), sx * 0.042, 0.1, sz * 0.042, '#7a4e36');
    B.glow(new THREE.BoxGeometry(0.074, 0.13, 0.074).translate(0, 0.09, 0), '#fff3d6', { flicker: 0.5, tint: 0.3 });
    box(B, 0.11, 0.012, 0.11, 0, 0, 0.196, 0, '#9a6a48');
    for (const y of [0.05, 0.13]) for (let k = 0; k < 4; k++) B.at([0, 0, 0], k * PI / 2, () => box(B, 0.084, 0.008, 0.006, 0, 0, y, 0.039, '#7a4e36'));
  },
  teaSet(B) {
    box(B, 0.17, 0.01, 0.11, 0, 0, 0, 0, '#b8382e');
    lathe(B, [[0.001, 0], [0.024, 0], [0.036, 0.012], [0.04, 0.03], [0.034, 0.046], [0.016, 0.054], [0.001, 0.054]], 10, -0.03, 0.01, 0, (p, n, o) => o.set('#9fd8c0').lerp(col('#e0fff4'), clamp(n.y) * 0.3));
    knob(B, -0.03, 0.067, 0, '#ff9eb8', 0.007);
    curve(B, [[0.004, 0.028, 0], [0.022, 0.04, 0.0], [0.032, 0.056, 0]], t => 0.007 - t * 0.003, '#9fd8c0', { radial: 5, n: 4, cap: false });
    const hd = G.torus(0.028, 0.004, 3, 8, PI); hd.rotateY(PI / 2); put(B, hd, -0.03, 0.054, 0, '#d8b878');
    for (const [x, z] of [[0.045, 0.025], [0.05, -0.03]]) lathe(B, [[0.001, 0], [0.014, 0], [0.018, 0.028], [0.016, 0.028], [0.012, 0.006], [0.001, 0.006]], 8, x, 0.01, z, (p, n, o) => o.set(p.y > 0.03 ? '#fff6ea' : '#ff9eb8'));
  },
  vase(B) {
    lathe(B, [[0.001, 0], [0.026, 0], [0.034, 0.03], [0.03, 0.06], [0.018, 0.08], [0.022, 0.09], [0.001, 0.085]], 9, 0, 0, 0, (p, n, o) => o.set(Math.abs(p.y - 0.045) < 0.006 ? '#ffffff' : '#8fd0ff').lerp(col('#d8f0ff'), clamp(p.y / 0.09) * 0.3));
    for (const [x, z, h, c] of [[0, 0, 0.17, '#ff8fb0'], [0.02, 0.012, 0.15, '#ffd24a'], [-0.018, 0.01, 0.145, '#ff6f9a']]) {
      curve(B, [[x * 0.3, 0.08, z * 0.3], [x, h - 0.02, z]], 0.0032, '#5a9a40', { radial: 3, cap: false, k: 'leaf' });
      lathe(B, [[0.001, -0.004], [0.01, 0], [0.014, 0.012], [0.012, 0.022], [0.006, 0.026]], 6, x, h - 0.022, z, c, 'leaf');
    }
    for (const a of [0.4, 2.5]) { const g = bladeGeo(0.07, 0.016, { bend: 0.8, seg: 3 }); g.rotateY(a); g.translate(0, 0.08, 0); B.add(g, '#5aa84a', 'leaf'); }
  },
  bonsai(B) {
    box(B, 0.12, 0.032, 0.08, 0, 0, 0, 0, '#3f6a9a');
    box(B, 0.11, 0.006, 0.07, 0, 0, 0.032, 0, '#7cae5a');
    curve(B, [[-0.02, 0.034, 0], [0.0, 0.07, 0.006], [-0.022, 0.1, 0.0], [0.004, 0.13, -0.004]], t => 0.011 - t * 0.006, '#6e4a3a', { radial: 5, n: 7 });
    for (const [x, y, z, R] of [[-0.04, 0.1, 0.006, 0.034], [0.03, 0.12, 0.0, 0.03], [-0.005, 0.15, -0.004, 0.03]]) {
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, g = KIT.twoSided(leafGeo(R, 0.008, 0.3)); g.rotateZ(0.25 + (k % 3) * 0.15); g.rotateY(a); g.translate(x, y, z); B.add(g, k % 2 ? '#3a7f52' : '#4f9a58', 'leaf'); }
    }
  },
  lantern(B) {
    const prof = []; for (let k = 0; k <= 6; k++) { const t = k / 6; prof.push([0.034 * (0.6 + 0.4 * Math.sin(t * PI)) * (k % 2 ? 1 : 0.95), 0.02 + t * 0.08]); }
    B.glow(G.lathe(prof, 10), (p, n, o) => o.set(Math.abs(p.y - 0.06) < 0.009 ? '#fff0d8' : '#e8503a'), { flicker: 0.8, tint: 0.55 });
    cyl(B, 0.024, 0.026, 0.02, 8, 0, 0, 0, '#2a2226'); cyl(B, 0.024, 0.022, 0.014, 8, 0, 0.1, 0, '#2a2226');
  },
  screen(B) {
    for (let i = 0; i < 4; i++) B.at([-0.075 + i * 0.05, 0, (i % 2) * 0.016], (i % 2 ? -1 : 1) * 0.35, () => {
      box(B, 0.052, 0.15, 0.008, 0, 0, 0.004, 0, '#a8303a');
      box(B, 0.042, 0.13, 0.009, 0, 0, 0.014, 0, (p, n, o) => o.set(n.z > 0.5 ? (p.y > 0.09 ? '#f8e2a0' : '#fff4dc') : '#a8303a'));
      knob(B, 0.006, 0.11, 0.006, '#ffbcd6', 0.007);
    });
  },
  clock(B) {
    box(B, 0.08, 0.08, 0.04, 0, 0, 0, 0, '#d9a066');
    const roof = new THREE.Shape(); roof.moveTo(-0.054, 0); roof.lineTo(0.054, 0); roof.lineTo(0, 0.04); roof.lineTo(-0.054, 0);
    put(B, extrude(roof, 0.04, 0.004, 1), 0, 0.08, -0.024, '#9a6038');
    const f = G.cyl(0.026, 0.026, 0.006, 12); f.rotateX(PI / 2); put(B, f, 0, 0.045, 0.022, '#fff8ec');
    put(B, G.torus(0.027, 0.004, 3, 12), 0, 0.045, 0.024, GOLD);
    for (const [L, a] of [[0.015, -1.1], [0.021, 0.35]]) { const h = G.box(0.004, L, 0.002, 0); h.translate(0, L / 2, 0); h.rotateZ(a); put(B, h, 0, 0.045, 0.026, INK); }
  },
  books(B) {
    [[0.11, 0.022, 0.08, '#e8706a'], [0.1, 0.02, 0.075, '#6a9ad8'], [0.09, 0.02, 0.07, '#f4c04a']].reduce((y, [w, h, d, c], i) => { B.at([0.004 * i, y, 0], i * 0.2 - 0.2, () => { box(B, w, h, d, 0, 0, 0, 0, (p, n, o) => o.set(Math.abs(n.x) > 0.7 && p.x > 0 ? '#fff4e0' : c)); }); return y + h; }, 0);
    for (const [x, h, c] of [[0.075, 0.1, '#8fcf8a'], [0.095, 0.09, '#c890d8']]) box(B, 0.018, h, 0.07, 0, x, 0, 0, (p, n, o) => o.set(n.y > 0.5 ? '#fff4e0' : c));
  },
  rug(B, c0, c1) {
    const g = G.cyl(0.045, 0.045, 0.36, 9); g.rotateZ(PI / 2);
    put(B, g, 0, 0.045, 0, (p, n, o) => { if (Math.abs(n.x) > 0.7) { const r = Math.hypot(p.y - 0.045, p.z); o.set(Math.sin(r * 260) > 0 ? c0 : c1); return; } o.set(Math.sin(p.x * 60) > 0.2 ? c0 : c1).multiplyScalar(0.92 + 0.1 * clamp(n.y)); });
    for (const x of [-0.12, 0.12]) { const t = G.torus(0.047, 0.006, 3, 9); t.rotateY(PI / 2); put(B, t, x, 0.045, 0, '#e8d4a0'); }
  },
};
/** a paper price tag on a red string hung from (x, y, z) */
function tag(B, x, y, z, c = '#fffaf0') {
  pipe(B, [x, y, z], [x, y - 0.03, z + 0.004], 0.0022, '#d8382e', { seg: 3 });
  const g = new THREE.ShapeGeometry(roundRect(0.034, 0.046, 0.006), 2); g.translate(x, y - 0.054, z + 0.006);
  B.cloth(g, (p, n, o) => o.set(c).multiplyScalar(Math.abs(p.y - (y - 0.05)) < 0.004 ? 0.75 : 1), { x0: x - 0.02, x1: x + 0.02, yTop: y, yBot: y - 0.08 });
}

let CACHE = null;
export function trinketStallTemplate() {
  if (CACHE) return CACHE;
  const B = new Builder(7310);
  B.warpAmt = 0.022;
  const DY = 0.08;
  // ---------------------------------------------------------------- the deck (planks on a dark sole)
  box(B, 2.54, 0.02, 1.5, 0, 0, 0, 0, '#5a3e2e');
  for (let i = 0; i < 6; i++) put(B, G.beam(2.58, 0.062, 0.252, 0.012), 0, 0.049, -0.635 + i * 0.254, grain(shade(DECK, 0.9 + 0.12 * B.r()), 'x', 40));
  // ---------------------------------------------------------------- posts, beams, knee braces, bamboo rafters
  const PX = 1.22, PZF = 0.64, PZB = -0.66, YF = 2.0, YK = 2.3;
  for (const sx of [-1, 1]) {
    for (const [z, top] of [[PZF, YF], [PZB, YK]]) {
      put(B, G.beam(0.11, top - DY, 0.11, 0.02), sx * PX, (DY + top) / 2, z, grain(WOOD_D, 'y'));
      put(B, G.beam(0.16, 0.05, 0.16, 0.012), sx * PX, DY + 0.025, z, '#5e3e2c');
    }
    B.add(beamAB(V(sx * PX, YF - 0.02, PZF), V(sx * PX, YK - 0.02, PZB), 0.08), grain(WOOD_D, 'z'));
    B.add(beamAB(V(sx * (PX - 0.03), YF - 0.36, PZF), V(sx * (PX - 0.32), YF - 0.05, PZF), 0.06), grain(WOOD_D, 'x'));
  }
  put(B, G.beam(2.62, 0.09, 0.09, 0.016), 0, YF - 0.02, PZF, grain(WOOD_D, 'x'));
  put(B, G.beam(2.62, 0.09, 0.09, 0.016), 0, YK - 0.02, PZB, grain(WOOD_D, 'x'));
  const RAF = [-PX, -0.61, 0, 0.61, PX], rA = V(0, YF + 0.04, PZF + 0.12), rB = V(0, YK + 0.04, PZB - 0.08), rL = rA.distanceTo(rB);
  for (const x of RAF.slice(1, -1)) { const g = bambooPole(rL, 0.024, { node: 0.42, c: '#c8c070', nodeC: '#9a9248', cut: '#f0e2b0', seg: 5 }); alignY(g, rB.clone().sub(rA)); put(B, g, x, rA.y, rA.z, null); }
  // ---------------------------------------------------------------- the striped awning, billowing between the rafters
  const AX = 1.33, AZF = 0.79, AZB = -0.78, AYF = YF + 0.075, AYB = YK + 0.075, vBeam = (PZF - AZB) / (AZF - AZB);
  const sagX = x => { for (let i = 0; i < RAF.length - 1; i++) if (x >= RAF[i] && x <= RAF[i + 1]) return 0.032 * Math.sin(PI * (x - RAF[i]) / (RAF[i + 1] - RAF[i])); return 0; };
  const aw = (x, v) => { const sv = v < vBeam ? Math.sin(PI * v / vBeam) ** 0.6 : 0; return V(x, AYB + (AYF - AYB) * v - sagX(x) * sv - (v > vBeam ? (v - vBeam) * 0.12 : 0), AZB + (AZF - AZB) * v); };
  const NS = 12, PC = 2, NR = 6, sw = 2 * AX / NS;
  for (let s = 0; s < NS; s++) {
    const pos = [], idx = [], cc = [], c0 = col(s % 2 ? CREAM : LEAF), cu = c0.clone().multiplyScalar(0.8);
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= PC; i++) {
      const x = -AX + sw * (s + i / PC), v = j / NR, p = aw(x, v);
      pos.push(p.x, p.y, p.z);
      const k = 0.94 + 0.06 * Math.sin(v * 9 + s) + 0.03 * nz(x * 6, v * 8);
      cc.push(c0.r * k, c0.g * k, c0.b * k);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < PC; i++) { const a = j * (PC + 1) + i, b = a + 1, c = a + PC + 1, d = c + 1; idx.push(a, c, d, a, d, b); }
    const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); top.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); top.setIndex(idx); top.computeVertexNormals();
    B.add(top, null);
    // the underside (seen from the street): the same panel a little lower, facing down, in shade
    const und = top.clone(), up = und.attributes.position, uc = und.attributes.color, ui = und.index.array;
    for (let i = 0; i < up.count; i++) { up.setY(i, up.getY(i) - 0.014); uc.setXYZ(i, cu.r, cu.g, cu.b); }
    for (let i = 0; i < ui.length; i += 3) { const t = ui[i + 1]; ui[i + 1] = ui[i + 2]; ui[i + 2] = t; }
    und.computeVertexNormals(); B.add(und, null);
  }
  // piped hems round the edges
  const hem = (pts, r, c) => B.add(tube(pts.map(p => ({ p, r })), 4, false), c);
  hem(Array.from({ length: 29 }, (_, i) => aw(-AX + 2 * AX * i / 28, 1).add(V(0, -0.007, 0.004))), 0.022, grain(BROWN, 'x', 90));
  hem(Array.from({ length: 13 }, (_, i) => aw(-AX + 2 * AX * i / 12, 0).add(V(0, -0.007, -0.004))), 0.016, BROWN);
  for (const sx of [-1, 1]) hem(Array.from({ length: 9 }, (_, i) => aw(sx * AX, i / 8).add(V(sx * 0.004, -0.007, 0))), 0.014, BROWN);
  // the scalloped valance, every other (cream) flap with Tanu's green leaf
  const yV = aw(0, 1).y - 0.012;
  for (let s = 0; s < NS; s++) {
    const xc = -AX + sw * (s + 0.5), fl = new THREE.Shape(), r = sw / 2;
    fl.moveTo(-r, 0); fl.lineTo(-r, -0.09); fl.absarc(0, -0.09, r, PI, 0, false); fl.lineTo(r, 0); fl.lineTo(-r, 0);
    const g = new THREE.ShapeGeometry(fl, 6); g.translate(xc, yV, AZF + 0.006);
    const cl = { x0: -AX, x1: AX, yTop: yV, yBot: yV - 0.2 };
    B.cloth(g, (p, n, o) => o.set(s % 2 ? CREAM : LEAF).multiplyScalar(p.y < yV - 0.15 ? 0.92 : 1), cl);
    if (s % 2) {
      const lg = new THREE.ShapeGeometry(tanuLeaf(0.085), 4); lg.rotateZ(0.5); lg.translate(xc, yV - 0.105, AZF + 0.009);
      B.cloth(lg, (p, n, o) => o.set(LEAF_D).lerp(col('#8ad06a'), clamp((p.y - (yV - 0.15)) / 0.09) * 0.4), cl);
      const vn = ribbon([[0, -0.034], [0, 0.034]], 0.004); vn.rotateZ(0.5); vn.translate(xc, yV - 0.105, AZF + 0.0105);
      B.cloth(vn, '#c8f0a0', cl);
    }
  }
  // ---------------------------------------------------------------- the back shelf of tiny furniture
  const SX = 1.07, SZ = -0.45, SD = 0.34, SH = [0.52, 0.94, 1.36], STOP = 1.8, zM = SZ + 0.03;
  for (const sx of [-1, 1]) put(B, G.beam(0.07, STOP - DY, SD, 0.015), sx * SX, (STOP + DY) / 2, SZ, grain(WOOD, 'y'));
  box(B, 2 * SX, STOP - DY - 0.04, 0.025, 0, 0, DY + 0.02, SZ - SD / 2 + 0.0125, (p, n, o) => o.set('#f6e6c4').multiplyScalar(Math.abs(((p.x + 3) * 4.2) % 1 - 0.5) > 0.47 ? 0.86 : 0.97 + 0.03 * Math.sin(p.y * 40)));
  for (const y of SH) { put(B, G.beam(2 * SX - 0.04, 0.036, SD, 0.01), 0, y - 0.018, SZ, grain(WOOD_L, 'x')); box(B, 2 * SX - 0.06, 0.016, 0.006, 0, 0, y - 0.03, SZ + SD / 2 + 0.002, LEAF_D); }
  put(B, G.beam(2 * SX + 0.1, 0.05, SD + 0.06, 0.014), 0, STOP + 0.015, SZ, grain(WOOD_D, 'x'));
  box(B, 2 * SX + 0.06, 0.02, 0.008, 0, 0, STOP + 0.005, SZ + SD / 2 + 0.032, LEAF);
  put(B, G.beam(2 * SX, 0.06, SD, 0.012), 0, DY + 0.03, SZ, grain(WOOD_D, 'x'));
  const place = (fn, x, y, ry = 0, s = 1) => B.at([x, y, zM], ry, () => fn(B), s * 1.3);
  place(MINI.chair, -0.78, SH[0], 0.3); place(MINI.tansu, -0.38, SH[0], -0.1); place(MINI.cushions, 0.04, SH[0]);
  place(B2 => MINI.daruma(B2), 0.42, SH[0], -0.2);
  place(B2 => MINI.kokeshi(B2), 0.8, SH[0], 0.2);
  place(MINI.andon, -0.8, SH[1], 0.4); place(MINI.teaSet, -0.36, SH[1], 0.2); place(MINI.vase, 0.06, SH[1]);
  place(MINI.bonsai, 0.44, SH[1], -0.3); place(MINI.lantern, 0.82, SH[1]);
  place(MINI.screen, -0.76, SH[2], 0.2); place(MINI.books, -0.5, SH[2], 0.15); place(MINI.clock, 0.56, SH[2], -0.2); place(B2 => MINI.kokeshi(B2, '#6a9ad8'), 0.84, SH[2], -0.3, 0.9);
  B.at([-0.5, STOP + 0.04, SZ + 0.02], 0.1, () => MINI.rug(B, '#e2483c', '#fff4de'));
  B.at([0.52, STOP + 0.04, SZ + 0.03], -0.15, () => MINI.rug(B, '#34528a', '#8fd0ff'));
  for (const [x, i] of [[-0.66, 0], [-0.2, 1], [0.24, 1], [0.66, 0], [-0.62, 2], [0.68, 2]]) tag(B, x, SH[i] - 0.03, SZ + SD / 2 + 0.006, i === 1 ? '#fff6c8' : '#fffaf0');
  // ---------------------------------------------------------------- the counter: planks, Tanu's leaf crest, a thick top
  const CW = 0.86, CZ0 = 0.22, CZ1 = 0.58, CT = 0.8;
  box(B, 2 * CW - 0.02, CT - DY - 0.06, CZ1 - CZ0 - 0.03, 0, 0, DY + 0.02, (CZ0 + CZ1) / 2 - 0.015, '#6a4430');
  for (let i = 0; i < 10; i++) put(B, G.beam(0.17, CT - DY - 0.1, 0.03, 0.008), -CW + (i + 0.5) * (2 * CW / 10), DY + 0.06 + (CT - DY - 0.1) / 2, CZ1 - 0.015, grain(shade(WOOD, 0.9 + 0.14 * B.r()), 'y'));
  for (const sx of [-1, 1]) put(B, G.beam(0.03, CT - DY - 0.1, CZ1 - CZ0, 0.008), sx * (CW - 0.015), DY + 0.06 + (CT - DY - 0.1) / 2, (CZ0 + CZ1) / 2, grain(WOOD, 'y'));
  box(B, 2 * CW + 0.04, 0.07, CZ1 - CZ0 + 0.04, 0, 0, DY, (CZ0 + CZ1) / 2, '#5e3e2c');
  put(B, G.beam(2 * CW + 0.12, 0.06, CZ1 - CZ0 + 0.14, 0.016), 0, CT - 0.03, (CZ0 + CZ1) / 2 + 0.03, grain(WOOD_L, 'x'));
  box(B, 2 * CW + 0.1, 0.018, 0.006, 0, 0, CT - 0.075, CZ1 + 0.095, LEAF_D);
  B.at([0, DY + 0.38, CZ1 + 0.004], 0, () => {
    const d = G.cyl(0.15, 0.15, 0.014, 22); d.rotateX(PI / 2); put(B, d, 0, 0, 0.007, (p, n, o) => o.set(n.z > 0.5 ? CREAM : '#e8d4ac'));
    put(B, G.torus(0.15, 0.012, 3, 20), 0, 0, 0.012, grain(BROWN, 'x', 120));
    B.at([0, 0, 0.016], 0.0, () => B.add(extrude(tanuLeaf(0.2), 0.008, 0.004, 6).rotateZ(0.5), (p, n, o) => o.set(n.z > 0.7 ? LEAF : LEAF_D).lerp(col('#a8e080'), n.z > 0.7 ? clamp(p.y * 4 + 0.3) * 0.3 : 0)));
    const vn = ribbon([[0, -0.078], [0, 0.07]], 0.007); vn.rotateZ(0.5); put(B, vn, 0, 0, 0.0325, '#d4f2b0');
    for (const [a, l] of [[0.6, 0.04], [-0.5, 0.036], [0.7, 0.03], [-0.6, 0.028]]) { const t = ribbon([[0, 0], [Math.sin(a) * l, Math.cos(a) * l]], 0.004); t.translate(0, -0.03 + Math.abs(a) * 0.02, 0); t.rotateZ(0.5); put(B, t, 0, 0, 0.0326, '#d4f2b0'); }
    curve(B, [[0.04, -0.09, 0.02], [0.06, -0.115, 0.02], [0.045, -0.13, 0.02]], 0.007, LEAF_D, { radial: 5, n: 5 });
  });
  // on the counter: the lucky cat (light), a cushion stack for sale, a tray of daruma, a brass call bell
  B.lod = 0.5; B.at([0.52, CT, 0.42], -0.35, () => BUILDERS2.luckyCat(B, FURNITURE.luckyCat), 1.35); B.lod = 1;
  B.at([-0.5, CT, 0.42], 0.2, () => MINI.cushions(B), 1.25);
  B.at([0.0, CT, 0.46], -0.1, () => {
    box(B, 0.2, 0.02, 0.12, 0, 0, 0, 0, grain('#a86e42', 'x'));
    for (const [x, c, s] of [[-0.05, '#e2382e', 1.05], [0.055, '#f4c04a', 0.9]]) B.at([x, 0.02, 0], 0, () => MINI.daruma(B, c), s);
  });
  B.at([-0.18, CT, 0.32], 0, () => { cyl(B, 0.04, 0.045, 0.014, 10, 0, 0, 0, '#5a3428'); lathe(B, [[0.001, 0.014], [0.034, 0.014], [0.032, 0.03], [0.022, 0.044], [0.001, 0.048]], 10, 0, 0, 0, (p, n, o) => o.set('#e8b850').lerp(col('#fff0b0'), clamp(n.y) * 0.5)); ball(B, 0.007, 0, 0.052, 0, '#c89a40', 1, 6); });
  // ---------------------------------------------------------------- the hanging sign: たぬき屋
  const sy = 1.62, sz = PZF + 0.02;
  for (const sx of [-1, 1]) { pipe(B, [sx * 0.36, YF - 0.065, sz], [sx * 0.36, sy + 0.16, sz], 0.0065, '#e6d4a0', { seg: 5 }); put(B, G.torus(0.014, 0.004, 4, 10), sx * 0.36, sy + 0.16, sz, '#c89a40'); }
  sbox(B, 0.98, 0.3, 0.05, 0.02, 0, sy - 0.15, sz, grain(WOOD_D, 'x', 70));
  sbox(B, 0.9, 0.235, 0.018, 0.006, 0, sy - 0.1175, sz + 0.024, grain('#fbf0d6', 'x', 40, 0.025));
  { const fr = roundRect(0.92, 0.252, 0.02); fr.holes.push(roundRect(0.884, 0.218, 0.012, 0, 0, new THREE.Path())); put(B, extrude(fr, 0.004, 0.002, 3), 0, sy, sz + 0.03, LEAF_D); }
  B.at([0.47, sy + 0.13, sz + 0.042], 0, () => { B.add(extrude(tanuLeaf(0.12), 0.006, 0.003, 4).rotateZ(-0.7), (p, n, o) => o.set(n.z > 0.7 ? LEAF : LEAF_D)); const vn = ribbon([[0, -0.046], [0, 0.044]], 0.005); vn.rotateZ(-0.7); put(B, vn, 0, 0, 0.0125, '#d4f2b0'); curve(B, [[-0.04, -0.045, 0.006], [-0.055, -0.06, 0.006], [-0.05, -0.072, 0.006]], 0.005, LEAF_D, { radial: 4, n: 4 }); });
  SIGN.forEach((glyph, gi) => {
    const ox = -0.315 + gi * 0.21;
    for (const [pts, w, n] of glyph) {
      const g = stroke(pts, t => w * (0.82 + 0.3 * Math.sin(PI * t)), 0.19, ox, sy, n);
      g.translate(0, 0, sz + 0.0345); B.add(g, '#3a2420');
    }
  });
  // ---------------------------------------------------------------- two red paper lanterns (a night light each)
  for (const sx of [-1, 1]) {
    const x = sx * 1.0, top = YF - 0.07, R = 0.135, H = 0.3, yb = top - 0.08 - H;
    pipe(B, [x, YF - 0.065, PZF], [x, top - 0.035, PZF], 0.005, INK, { seg: 4 });
    const prof = []; for (let k = 0; k <= 8; k++) { const t = k / 8; prof.push([R * (0.6 + 0.4 * Math.sin(t * PI)) * (k % 2 ? 1 : 0.965), yb + t * H]); }
    B.at([x, 0, PZF], sx * 0.15, () => {
      B.glow(G.lathe(prof, 12), (p, n, o) => { const t = (p.y - yb) / H; o.set(Math.abs(t - 0.5) < 0.09 ? '#fff0d8' : '#e2483c').lerp(col('#b8302a'), clamp(Math.abs(t - 0.5) * 2.4 - 0.7)); }, { flicker: 1, tint: 0.55 });
      const Rf = y => R * (0.6 + 0.4 * Math.sin(clamp((y - yb) / H) * PI));
      B.glow(wrapLathe(subdivide1(new THREE.ShapeGeometry(tanuLeaf(0.075), 4)).rotateZ(0.5).translate(0, yb + H / 2, 0), Rf, 0, 0.004), LEAF_D, { flicker: 1, tint: 0.3 });
      const cR = R * 0.6 + 0.006;
      lathe(B, [[0.001, top - 0.08], [cR, top - 0.08], [cR, top - 0.05], [cR - 0.01, top - 0.035], [0.001, top - 0.035]], 10, 0, 0, 0, '#2a2226');
      lathe(B, [[0.001, yb - 0.03], [cR - 0.01, yb - 0.03], [cR, yb - 0.015], [cR, yb + 0.004], [0.001, yb + 0.004]], 10, 0, 0, 0, '#2a2226');
      B.add(quadPaint(G.lathe([[0.001, yb - 0.12], [0.022, yb - 0.116], [0.017, yb - 0.08], [0.01, yb - 0.04], [0.001, yb - 0.035]], 8), 5, (i, j, o) => o.set(i % 2 ? '#e2483c' : '#ff6a5a')), null);
      cyl(B, 0.011, 0.011, 0.012, 6, 0, yb - 0.046, 0, GOLD);
    });
    B.light([x, yb + H / 2, PZF + 0.05], { color: '#ffb060', intensity: 2.6, radius: 6, flicker: 0.6 });
  }
  B.light([0, CT + 0.55, 0.3], { color: '#ffc880', intensity: 1.6, radius: 4.5, flicker: 0.2 });
  // ---------------------------------------------------------------- a glass wind chime (furin) with its paper strip
  B.at([-0.66, YF - 0.065, PZF + 0.02], 0, () => {
    pipe(B, [0, 0, 0], [0, -0.07, 0], 0.003, '#d8382e', { seg: 3 });
    lathe(B, [[0.001, -0.07], [0.02, -0.075], [0.034, -0.095], [0.04, -0.125], [0.038, -0.128], [0.03, -0.1], [0.001, -0.085]], 14, 0, 0, 0, (p, n, o) => o.set('#d8f2fa').lerp(col('#ffffff'), clamp(n.y + 0.2) * 0.5));
    for (const a of [0.3, 2.4, 4.4]) B.add(wrapLathe(ellD(0.008, 0.006, 8, 1).translate(0, -0.108, 0), () => 0.037, a, 0.002), '#ff7a8a');
    pipe(B, [0, -0.085, 0], [0, -0.14, 0], 0.002, '#d8382e', { seg: 3 });
    const g = new THREE.ShapeGeometry(roundRect(0.036, 0.11, 0.004), 2); g.translate(0, -0.2, 0.0);
    B.cloth(g, (p, n, o) => o.set('#fff2a8').lerp(col('#ffd84a'), clamp((-0.2 - p.y) * 8)), { x0: -0.02, x1: 0.02, yTop: -0.14, yBot: -0.26 });
  });
  // ---------------------------------------------------------------- crates at the front corners: rolled rugs, potted plants
  B.at([-1.03, DY, 0.4], 0.12, () => {
    crate(B, { s: 0.32, wood: '#e2b988', lid: false });
    for (const [x, z, h, c0, c1] of [[-0.06, -0.04, 0.5, '#e2483c', '#fff4de'], [0.06, -0.03, 0.44, '#34528a', '#8fd0ff'], [0.0, 0.07, 0.38, '#6cbf58', '#fff4de']]) {
      cyl(B, 0.046, 0.046, h, 8, x, 0.06, z, (p, n, o) => { if (n.y > 0.7) { const r = Math.hypot(p.x - x, p.z - z); o.set(Math.sin(r * 280) > 0 ? c0 : c1); return; } o.set(Math.abs(p.y - 0.06 - h * 0.7) < 0.01 ? '#e8d4a0' : Math.sin(p.y * 50) > 0.3 ? c0 : c1).multiplyScalar(0.92 + 0.1 * clamp(n.x)); });
    }
  });
  B.at([1.03, DY, 0.4], -0.1, () => {
    crate(B, { s: 0.32, wood: '#d9a066', lid: false });
    // three little potted plants for sale (leaves only): a fern, a heart-leaf trailer, a spiky aloe
    const pot = (c) => lathe(B, [[0.001, 0], [0.04, 0], [0.05, 0.07], [0.056, 0.078], [0.05, 0.082], [0.001, 0.078]], 8, 0, 0, 0, (p, n, o) => o.set(p.y > 0.068 ? shade(c, 1.15) : c).multiplyScalar(0.9 + 0.1 * clamp(n.y + 0.5)));
    const greens = ['#4f9a48', '#5aa84c', '#6ab854'];
    B.at([-0.07, 0.19, 0.04], 0.3, () => { pot('#d4774e'); for (let k = 0; k < 7; k++) { const g = bladeGeo(0.17, 0.034, { bend: 1.1, seg: 3, base: 0.3 }); g.rotateY(k / 7 * TAU); g.translate(0, 0.075, 0); B.add(g, greens[k % 3], 'leaf'); } });
    B.at([0.07, 0.19, 0.05], -0.4, () => { pot('#8fd0e8'); for (let k = 0; k < 7; k++) { const g = KIT.heartLeafGeo(0.06); g.rotateX(-0.4 - (k % 2) * 0.5); g.rotateY(k / 7 * TAU); g.translate(0, 0.08, 0); B.add(g, greens[(k + 1) % 3], 'leaf'); } });
    B.at([0.0, 0.19, -0.075], 0.9, () => { pot('#f4e6c8'); for (let k = 0; k < 6; k++) { const g = bladeGeo(0.1, 0.03, { bend: 0.5, seg: 2, base: 0.6, fold: 0.4 }); g.rotateY(k / 6 * TAU); g.translate(0, 0.075, 0); B.add(g, (p, n, o) => o.set('#7cb87a').lerp(col('#c8e4a0'), clamp((p.y - 0.08) / 0.1) * 0.5), 'leaf'); } });
  });
  B.height = 2.4; B.footprint = [2.6, 1.6]; B.door.set(0, 0, 1.1);
  CACHE = B.finish();
  return CACHE;
}
/** split every triangle in four once (a flat decal bending onto a lantern) */
function subdivide1(g) {
  g = g.index ? g.toNonIndexed() : g;
  const P = g.attributes.position.array, out = [];
  for (let i = 0; i < P.length; i += 9) {
    const a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], c = [P[i + 6], P[i + 7], P[i + 8]], m = (u, v) => u.map((x, k) => (x + v[k]) / 2);
    const ab = m(a, b), bc = m(b, c), ca = m(c, a);
    out.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); o.computeVertexNormals();
  return o;
}
