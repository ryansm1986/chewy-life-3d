// Keepsake models (docs/COZY.md §4.6, ROADMAP CZ-9): the trophies a crew brings home from a story fight, as furniture
// (home/furniture.js set 'trophy'). Same contract as furnitureModels.js: one builder per id, the item's local frame
// (x right, y up, +z its front; floor items centred with y = 0 at the base, wall items growing up and out from their
// bottom centre on the wall), vertex colours, glow for paper and glass, cloth for hanging fabric. The shared helpers come
// from furnitureModels.js as KIT. Each piece is a toy-cozy keepsake of its boss: never scary, a little proud.
import * as THREE from 'three';
import { G, V, PI, shade, col } from '../world/buildings/kit.js';
import { KIT } from './furnitureModels.js';
import { nz } from '../world/buildings/props.js';
import * as SDF from '../gfx/sdf.js';
import { clamp, TAU } from '../core/util.js';

const {
  put, box, sbox, cyl, ball, lathe, pipe, curve, ellD, mergeG, twoSided, ribbon, profR, wrapLathe, onProfile, roundRect, extrude,
  stroke, quadPaint, pillowGeo, pillowY, INK, GOLD, BLACK_LAC, LAC_RED, CREAM,
} = KIT;
const UP = V(0, 1, 0);

// ------------------------------------------------------------------ painters
const grainP = (c, { along = 'x', f = 70, amt = 0.05 } = {}) => { const C0 = col(c); return (p, n, o) => { const u = along === 'x' ? p.x : along === 'y' ? p.y : p.z, v = along === 'x' ? p.y * 0.6 + p.z : along === 'y' ? p.x + p.z * 0.6 : p.x + p.y * 0.6; o.copy(C0).multiplyScalar(1 + amt * Math.sin(v * f + Math.sin(u * 11) * 1.8 + nz(u * 6, v * 6) * 1.5)).multiplyScalar(0.93 + 0.09 * clamp(n.y * 0.5 + 0.5)); }; };
const lacP = c => { const C0 = col(c), H = col('#ffffff'); return (p, n, o) => o.copy(C0).lerp(H, clamp(n.y * 0.5 + n.z * 0.25 - 0.35) * 0.32); };
const metalP = (c, k = 0.45) => { const C0 = col(c), H = col('#fffaf0'), L = col(shade(c, 0.6)); return (p, n, o) => o.copy(C0).lerp(H, clamp(n.y * 0.6 + n.z * 0.3 - 0.2) * k).lerp(L, clamp(-n.y - 0.2) * 0.5); };
const softP = (c, amt = 0.04) => { const C0 = col(c); return (p, n, o) => o.copy(C0).multiplyScalar(0.92 + 0.1 * clamp(n.y * 0.5 + 0.5) + amt * nz(p.x * 40, p.y * 40 + p.z * 30)); };
const glazeP = (a, b) => { const A = col(a), Bc = col(b); return (p, n, o) => o.copy(A).lerp(Bc, clamp(n.y * 0.5 + 0.2)).lerp(col('#ffffff'), clamp(n.y * 0.7 + n.z * 0.3 - 0.45) * 0.4); };
/** a shape's outline as points (for edge cords) */
const outline = (shape, n = 6) => shape.getPoints(n).map(v => [v.x, v.y]);
/** a dome bump on a surface frame { p, n } (an eye, a gem, a knob): radii rx (around), ry (up), height h */
function bump(B, fr, rx, ry, h, c, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1), 0, TAU, 0, PI / 2); g.scale(rx, h, ry); g.rotateX(PI / 2);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), fr.n)); g.translate(fr.p.x, fr.p.y, fr.p.z);
  return B.add(g, c);
}
/** a twisted two-colour cord along 3D points (a shimenawa / a tassel cord) */
function cord(B, pts, r, c1, c2, n = 24) {
  const P = new THREE.CatmullRomCurve3(pts.map(p => V(...p))).getPoints(n);
  const g = KIT.mergeG([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), n * 2, r, 6, false)]);
  return B.add(g, (p, nn, o) => o.set(Math.sin((p.x + p.y + p.z) * 260) > 0 ? c1 : c2).multiplyScalar(0.88 + 0.14 * clamp(nn.y + 0.5)));
}
/** a tassel hanging down from (x, y, z) */
function tassel(B, x, y, z, c, L = 0.07) {
  ball(B, 0.013, x, y, z, shade(c, 0.85), 1, 8);
  lathe(B, [[0.001, 0], [0.012, -0.004], [0.016, -L * 0.45], [0.019, -L], [0.001, -L - 0.002]], 10, x, y - 0.008, z, (p, n, o) => o.set(c).multiplyScalar(0.84 + 0.18 * (0.5 + 0.5 * Math.sin(Math.atan2(p.x - x, p.z - z) * 9))));
  put(B, G.torus(0.0135, 0.0035, 4, 12).rotateX(PI / 2), x, y - 0.016, z, GOLD);
}
/** the victory rosette pinned on every banner: a pleated ring, two tails, a paw in the middle */
function rosette(B, x, y, z, c = '#e8403a') {
  const R = 0.055;
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, g = new THREE.CircleGeometry(0.024, 6); g.scale(1, 1.5, 1); g.rotateZ(-a); g.translate(x + Math.sin(a) * R * 0.62, y + Math.cos(a) * R * 0.62, z + 0.002 + (k % 2) * 0.002); B.add(g, k % 2 ? c : shade(c, 0.82)); }
  put(B, new THREE.CircleGeometry(R * 0.62, 20), x, y, z + 0.006, CREAM);
  for (const s of [-1, 1]) { const t = new THREE.Shape(); t.moveTo(s * 0.012, 0); t.lineTo(s * 0.034, -0.11); t.lineTo(s * 0.02, -0.096); t.lineTo(s * 0.008, -0.112); t.lineTo(s * -0.006, 0); B.add(new THREE.ShapeGeometry(t).translate(x, y - 0.02, z - 0.001), shade(c, s > 0 ? 0.9 : 0.78)); }
  // the paw: a pad and four toes
  B.add(new THREE.CircleGeometry(0.014, 12).scale(1.15, 1, 1).translate(x, y - 0.007, z + 0.008), '#8a4a2c');
  for (const [dx, dy] of [[-0.016, 0.01], [-0.006, 0.018], [0.006, 0.018], [0.016, 0.01]]) B.add(new THREE.CircleGeometry(0.0055, 8).translate(x + dx, y + dy, z + 0.008), '#8a4a2c');
}
/** move the geometry's centre to (x, y, z) after building it round the origin */
const at = (g, x, y, z) => g.translate(x, y, z);

// =================================================================== the Burrow's bosses
export const TROPHY_BUILDERS = {
  // King Mochi's crown cushion: a squat red lacquer stand with gold corners and tassels, a big plump mochi cushion with
  // a sleepy happy face and pink cheeks, and the king's little crown sitting a bit askew on top
  trophyMochiCrown(B) {
    const W = 0.7, H = 0.15, lac = lacP(LAC_RED);
    sbox(B, W, 0.05, W, 0.02, 0, H - 0.05, 0, lac);
    sbox(B, W - 0.06, 0.02, W - 0.06, 0.008, 0, H - 0.058, 0, lacP(BLACK_LAC));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.05), z = sz * (W / 2 - 0.05);
      lathe(B, [[0.001, 0], [0.036, 0], [0.04, 0.012], [0.03, 0.03], [0.034, 0.07], [0.042, H - 0.05], [0.001, H - 0.05]], 12, x, 0, z, lac);
      put(B, G.torus(0.036, 0.006, 4, 14).rotateX(PI / 2), x, 0.03, z, metalP(GOLD));
      // the gold corner caps over the top board
      const cap = new THREE.Shape(); cap.moveTo(0, 0); cap.lineTo(0.09, 0); cap.lineTo(0, 0.09); cap.lineTo(0, 0);
      const g = extrude(cap, 0.004, 0.003, 2); g.rotateX(-PI / 2); g.scale(-sx, 1, sz); put(B, g, sx * (W / 2 - 0.004), H + 0.0005, sz * (W / 2 - 0.004), metalP(GOLD));
      tassel(B, sx * (W / 2 + 0.006), H - 0.03, sz * (W / 2 + 0.006), '#ffd24a', 0.09);
    }
    // the mochi: a big squashy white-pink pillow, sagging a little over the stand's edge
    const MW = 0.6, MH = 0.27, y0 = H;
    const MD = MW * 0.92, PO = { sq: 1, edge: 0.15, bot: 0.25, ws: 32, hs: 18 };
    B.add(at(pillowGeo(MW, MH, MD, PO), 0, y0 - 0.005, 0), (p, n, o) => o.set('#fff6f4').lerp(col('#ffe0e6'), clamp(-n.y * 0.6 + 0.15)).lerp(col('#ffffff'), clamp(n.y - 0.6) * 0.5).multiplyScalar(0.97 + 0.03 * nz(p.x * 30, p.z * 30)));
    const top = (x, z) => y0 - 0.005 + pillowY(MH, 0.25, 0.15, Math.min(1, Math.hypot(x / (MW / 2), z / (MD / 2))));
    /** the front surface's z at (x, y) (the pillow's upper half falls off toward its rim): a bisection along z */
    const frontZ = (x, y) => { let a = 0, b = MD / 2 * Math.sqrt(Math.max(0, 1 - (x / (MW / 2)) ** 2)); for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (top(x, m) > y) a = m; else b = m; } return (a + b) / 2; };
    // the face on the front slope: two happy closed eyes (^ ^), blush, a tiny "w" mouth
    const fy = y0 + MH * 0.52;
    const face = (g, c, dz = 0) => { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x, y, frontZ(x, y) + 0.004 + dz); } g.computeVertexNormals(); B.add(g, c); };
    for (const s of [-1, 1]) {
      face(stroke([[s * 0.145, fy + 0.008], [s * 0.108, fy + 0.042], [s * 0.07, fy + 0.008]], t => 0.017 - Math.abs(t - 0.5) * 0.008, 1, 0, 0, 12), INK);
      face(ellD(0.042, 0.022, 16, 2).translate(s * 0.17, fy - 0.03, 0), '#ffa0b4', -0.001);
    }
    face(stroke([[-0.03, fy - 0.026], [-0.015, fy - 0.04], [0, fy - 0.028], [0.015, fy - 0.04], [0.03, fy - 0.026]], 0.011, 1, 0, 0, 12), INK);
    // a dusting of starch on top, three little flour spots
    for (const [x, z] of [[-0.12, -0.08], [0.1, -0.13], [0.05, 0.06]]) put(B, ellD(0.03, 0.022, 12, 2).rotateX(-PI / 2), x, top(x, z) + 0.002, z, '#ffffff');
    // the crown: a gold band with five points, red and teal jewels, a pearl on each point, sitting askew
    const cy = top(-0.04, -0.04) - 0.012;
    B.at([-0.04, cy, -0.04], 0.5, () => {
      const N = 5, R = 0.085, Hc = 0.11, prof = [];
      const band = []; for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU, pt = 0.5 + 0.5 * Math.cos(a * N); band.push([a, 0.045 + Hc * 0.55 * pt ** 3]); }
      // the crown wall as a strip round a ring, its top edge zig-zagging up to the points
      const pos = [], cols = [];
      for (let k = 0; k < 40; k++) {
        const [a0, h0] = band[k], [a1, h1] = band[k + 1], r0 = R, r1 = R * 1.08;
        const P = (a, r, y) => V(Math.sin(a) * (r + (r1 - r0) * y / Hc), y, Math.cos(a) * (r + (r1 - r0) * y / Hc));
        pos.push(P(a0, R, 0), P(a1, R, 0), P(a1, R, h1), P(a0, R, 0), P(a1, R, h1), P(a0, R, h0));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pos); g.computeVertexNormals();
      B.add(twoSided(g), metalP('#f4c04a', 0.6));
      for (const y of [0.004, 0.04]) put(B, G.torus(R * (1 + 0.08 * y / Hc) + 0.002, 0.006, 4, 32).rotateX(PI / 2), 0, y, 0, metalP('#e8b030', 0.6));
      for (let k = 0; k < N; k++) {
        const a = k / N * TAU;
        ball(B, 0.011, Math.sin(a) * R * 1.07, 0.045 + Hc * 0.55 + 0.008, Math.cos(a) * R * 1.07, '#fff8f0', 1, 8);
        ball(B, 0.013, Math.sin(a + PI / N) * (R + 0.006), 0.022, Math.cos(a + PI / N) * (R + 0.006), k % 2 ? '#e8384a' : '#3ac0b0', [1, 1.2, 0.6], 8);
      }
      ball(B, R * 0.92, 0, 0.012, 0, '#c8304a', [1, 0.32, 1], 16); // (the velvet cap inside)
    }, 1, 0.12, -0.18);
  },

  // Karakasa's umbrella stand: a glazed blue-and-white barrel holding Lord Karakasa's folded red paper umbrella, upside
  // down as umbrellas stand: its one big eye winks above the cord, a long pink tongue lolls out between the folds
  trophyKasaStand(B) {
    // the stand: a stout glazed pot with a rolled lip, seigaiha waves in cobalt round the belly
    const pot = [[0.001, 0], [0.13, 0], [0.142, 0.012], [0.15, 0.06], [0.152, 0.2], [0.146, 0.33], [0.14, 0.36], [0.152, 0.372], [0.15, 0.388], [0.126, 0.39], [0.122, 0.36], [0.001, 0.34]];
    lathe(B, pot, 32, 0, 0, 0, glazeP('#e8eef6', '#fafcff'));
    const Rf = profR(pot.slice(0, 8));
    for (let row = 0; row < 3; row++) for (let k = 0; k < 14; k++) {
      const a = (k + row * 0.5) / 14 * TAU, y = 0.11 + row * 0.07;
      const arcs = [];
      for (const rr of [0.03, 0.021, 0.012]) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * PI; pts.push([Math.cos(t) * rr, y + Math.sin(t) * rr]); } arcs.push(stroke(pts, 0.0042, 1)); }
      B.add(wrapLathe(mergeG(arcs), Rf, a, 0.0018), row === 1 ? '#2a5ab0' : '#3a6ac8');
    }
    put(B, G.torus(0.151, 0.006, 4, 40).rotateX(PI / 2), 0, 0.05, 0, '#2a5ab0');
    put(B, G.torus(0.149, 0.005, 4, 40).rotateX(PI / 2), 0, 0.34, 0, '#2a5ab0');
    // the umbrella: closed, tip down in the pot; the folded canopy a fluted cone, the shaft and its bamboo handle on top
    const yb = 0.3, yt = 0.86, prof = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push([0.016 + 0.15 * Math.sin(Math.min(1, t * 1.8) * PI / 2) * (1 - 0.48 * t * t), yb + t * (yt - yb)]); }
    prof.push([0.035, yt + 0.012], [0.012, yt + 0.024]);
    const rf = profR(prof);
    // the paper: 12 folds (each fold a light and a shade face), red with a white band near the rim
    const NF = 12, fl = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), NF * 4);
    const pp = fl.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), y = pp.getY(i), a = Math.atan2(x, z), f = 0.5 + 0.5 * Math.cos(a * NF), k = 1 - 0.13 * (1 - f) * clamp((y - yb) / 0.12); pp.setX(i, x * k); pp.setZ(i, z * k); }
    fl.computeVertexNormals();
    B.add(fl, (p, n, o) => { const t = (p.y - yb) / (yt - yb), a = Math.atan2(p.x, p.z); o.set(t > 0.78 && t < 0.86 ? '#fff4e6' : '#e2423a').lerp(col('#ff8a70'), clamp(Math.cos(a * NF) * 0.5) * 0.35).multiplyScalar(0.86 + 0.16 * clamp(n.y * 0.4 + n.z * 0.4 + 0.5)); });
    pipe(B, [0, yt, 0], [0, yt + 0.19, 0], 0.012, '#c8a070', { seg: 8 });
    for (let k = 1; k <= 4; k++) put(B, G.torus(0.0128, 0.0026, 4, 10).rotateX(PI / 2), 0, yt + k * 0.038, 0, '#8a6a3a'); // (the bamboo nodes)
    ball(B, 0.018, 0, yt + 0.2, 0, BLACK_LAC, [1, 0.8, 1], 10);
    put(B, G.torus(0.02, 0.0045, 5, 14), 0, yt + 0.225, 0, '#e8403a'); // (a hanging loop on the handle)
    // the tie cord round the folds, with a little bell
    const cy = yb + 0.82 * (yt - yb), cr = rf(cy);
    put(B, G.torus(cr + 0.004, 0.0055, 5, 32).rotateX(PI / 2), 0, cy, 0, '#ffd24a');
    ball(B, 0.016, cr * 0.4, cy - 0.024, cr + 0.01, metalP(GOLD, 0.7), 1, 10);
    // the face: one big eye with a lid (winking a little), lashes, and the long tongue out of a fold
    const ey = yb + 0.6 * (yt - yb), er = rf(ey);
    const fr = { p: V(0, ey, er - 0.004), n: V(0, 0.1, 1).normalize() };
    bump(B, fr, 0.062, 0.056, 0.03, (p, n, o) => o.set('#fffdf8').lerp(col('#e8e0e8'), clamp(-n.y * 0.6)), 16);
    bump(B, { p: fr.p.clone().add(V(0.006, -0.006, 0.02)), n: fr.n }, 0.032, 0.034, 0.014, '#ffb83a', 14);
    bump(B, { p: fr.p.clone().add(V(0.007, -0.007, 0.028)), n: fr.n }, 0.018, 0.02, 0.01, '#2a1a18', 12);
    bump(B, { p: fr.p.clone().add(V(-0.006, 0.006, 0.034)), n: fr.n }, 0.008, 0.008, 0.004, '#ffffff', 8);
    const lid = []; for (let i = 0; i <= 12; i++) { const t = i / 12, a = PI * (0.06 + 0.88 * t); lid.push([Math.cos(a) * 0.068, ey + Math.sin(a) * 0.058 - 0.006]); }
    B.add(wrapLathe(stroke(lid, t => 0.009 + 0.008 * Math.sin(PI * t), 1, 0, 0), rf, 0, 0.03), '#2a1a20');
    for (const [x, ax] of [[-0.056, -0.7], [-0.024, -0.2], [0.012, 0.15], [0.048, 0.6]]) B.add(wrapLathe(stroke([[x, ey + 0.05], [x + Math.sin(ax) * 0.026, ey + 0.05 + Math.cos(ax) * 0.026]], t => 0.007 - t * 0.004, 1), rf, 0, 0.028), '#2a1a20');
    // a wide grin across the folds, and the long tongue lolling out of it
    const my = yb + 0.36 * (yt - yb), mz = rf(my);
    const mo = new THREE.Shape(); mo.moveTo(-0.06, my + 0.012); mo.quadraticCurveTo(0, my - 0.05, 0.06, my + 0.012); mo.quadraticCurveTo(0, my - 0.016, -0.06, my + 0.012);
    B.add(wrapLathe(new THREE.ShapeGeometry(mo, 10), rf, 0, 0.003), '#4a1820');
    curve(B, [[0.008, my - 0.012, mz - 0.006], [0.014, my - 0.03, mz + 0.03], [0.02, my - 0.09, mz + 0.05], [0.004, my - 0.15, mz + 0.05], [-0.014, my - 0.18, mz + 0.03], [-0.006, my - 0.19, mz + 0.01]], t => 0.024 - 0.008 * t, (p, n, o) => o.set('#ff6a7c').lerp(col('#ffa8b4'), clamp(n.y * 0.5 + n.z * 0.3)), { radial: 10, n: 18 });
  },

  // Gorobei's cleaver plaque: a walnut board with a rope trim; the oni chef's big toy cleaver and his ladle crossed on it,
  // a dumpling emblem where they cross and two little horns carved at the top corners
  trophyOniCleaver(B) {
    const W = 0.84, H = 0.4, D = 0.035, wd = grainP('#7a4e34', { along: 'x' });
    const board = roundRect(W, H, 0.06, 0, H / 2 + 0.03);
    put(B, extrude(board, D - 0.012, 0.006, 6), 0, 0, 0, wd);
    const inner = roundRect(W - 0.08, H - 0.08, 0.04, 0, H / 2 + 0.03);
    put(B, extrude(inner, 0.003, 0.003, 4), 0, 0, D - 0.006, grainP('#9a6a48', { along: 'x' }));
    cord(B, outline(roundRect(W - 0.026, H - 0.026, 0.05, 0, H / 2 + 0.03), 4).map(([x, y]) => [x, y, D + 0.002]), 0.007, '#e8d0a0', '#c8a070', 80);
    // two carved oni horns at the top corners
    for (const s of [-1, 1]) {
      const hp = []; for (let i = 0; i <= 6; i++) { const t = i / 6; hp.push([s * (0.3 + 0.04 * t), H + 0.02 + t * 0.07, D / 2]); }
      curve(B, hp, t => 0.024 * (1 - t) + 0.004, (p, n, o) => o.set('#f2603a').lerp(col('#fff0d8'), clamp((p.y - H - 0.05) * 22)).multiplyScalar(0.92 + 0.1 * clamp(n.z + n.y)), { radial: 8, n: 8 });
    }
    // the cleaver: a broad steel blade with a hanging hole and a blunt toy edge, a wooden handle with a red wrap
    B.at([0, H / 2 + 0.03, D + 0.012], 0, () => {
      const bl = new THREE.Shape(); bl.moveTo(-0.08, -0.08); bl.lineTo(0.09, -0.08); bl.quadraticCurveTo(0.1, -0.08, 0.1, -0.07); bl.lineTo(0.1, 0.07); bl.quadraticCurveTo(0.1, 0.085, 0.085, 0.085); bl.lineTo(-0.07, 0.085); bl.quadraticCurveTo(-0.085, 0.085, -0.085, 0.07); bl.lineTo(-0.08, -0.08);
      const hole = new THREE.Path(); hole.absarc(0.055, 0.045, 0.016, 0, TAU, true); bl.holes.push(hole);
      put(B, extrude(bl, 0.006, 0.004, 8), 0.04, 0, 0, (p, n, o) => o.set('#c8d0dc').lerp(col('#ffffff'), clamp(p.y * 4 + 0.2) * 0.4 * clamp(n.z)).lerp(col('#8a94a4'), clamp(-p.y * 8 - 0.4) * 0.5));
      box(B, 0.19, 0.016, 0.016, 0.004, 0.045, -0.088, 0.007, '#9aa4b4'); // (the blunt edge)
      // the handle out to the left
      const hd = G.cyl(0.02, 0.022, 0.2, 10); hd.rotateZ(PI / 2); put(B, hd, -0.14, 0.0, 0.008, grainP('#c98f5e', { along: 'x' }));
      for (const x of [-0.08, -0.1, -0.12]) { const w = G.torus(0.023, 0.005, 4, 12); w.rotateY(PI / 2); put(B, w, x, 0, 0.008, '#d8383a'); }
      ball(B, 0.024, -0.245, 0, 0.008, BLACK_LAC, [0.8, 1, 1], 10);
    }, 1, 0, PI - 0.62);
    // the ladle: a long wooden handle and a round bowl, crossed the other way
    B.at([0, H / 2 + 0.03, D + 0.01], 0, () => {
      const hd = G.cyl(0.011, 0.013, 0.42, 8); hd.rotateZ(PI / 2); put(B, hd, -0.03, 0, 0.006, grainP('#d8a870', { along: 'x' }));
      const bowl = new THREE.SphereGeometry(0.06, 16, 10, 0, TAU, PI / 2, PI / 2); bowl.scale(1, 0.75, 0.55); bowl.rotateX(-PI / 2); put(B, twoSided(bowl), 0.22, 0, 0.004, grainP('#c88a58'));
      put(B, G.torus(0.06, 0.006, 5, 20), 0.22, 0, 0.004, grainP('#b07a4a'));
      ball(B, 0.016, -0.245, 0, 0.006, '#d8383a', 1, 8);
    }, 1, 0, 0.62);
    // the emblem: three dumplings on a round lacquer medallion where they cross
    put(B, G.cyl(0.058, 0.06, 0.016, 24).rotateX(PI / 2), 0, H / 2 + 0.03, D + 0.03, lacP(LAC_RED));
    put(B, G.torus(0.058, 0.004, 4, 24), 0, H / 2 + 0.03, D + 0.039, metalP(GOLD));
    for (const [dx, dy, c] of [[-0.022, -0.012, '#fff6ea'], [0.022, -0.012, '#ffd8e0'], [0, 0.018, '#d8f0c8']]) {
      ball(B, 0.022, dx, H / 2 + 0.03 + dy, D + 0.044, (p, n, o) => o.set(c).multiplyScalar(0.92 + 0.1 * clamp(n.y + n.z)), [1, 0.85, 0.55], 12);
      for (let k = -1; k <= 1; k++) pipe(B, [dx + k * 0.006, H / 2 + 0.03 + dy + 0.014, D + 0.054], [dx + k * 0.009, H / 2 + 0.03 + dy + 0.02, D + 0.052], 0.0018, shade(c, 0.82), { seg: 4 });
    }
    // two hanging pegs on top (it hangs from the wall)
    for (const s of [-1, 1]) cyl(B, 0.008, 0.008, 0.02, 6, s * 0.2, H + 0.024, 0.01, '#5a4030');
  },

  // Tamamo's moon lantern: a stand of nine silver fox tails curling up from a lacquer base into a crook, a round paper
  // moon hanging from it (soft craters, a fox-mask face in white and vermilion), a tassel underneath
  trophyMoonLantern(B) {
    lathe(B, [[0.001, 0], [0.19, 0], [0.2, 0.014], [0.18, 0.04], [0.11, 0.06], [0.001, 0.064]], 28, 0, 0, 0, lacP('#2a2438'));
    put(B, G.torus(0.19, 0.006, 4, 36).rotateX(PI / 2), 0, 0.016, 0, metalP('#c8c8e0', 0.6));
    // the nine tails: fat, fluffy fox tails fanned out behind the post like a peacock's train, each sweeping up and
    // curling out at a white tip (sculpted as one smooth form: an SDF of round-cone chains, meshed with surface nets)
    const tails = [];
    for (let k = 0; k < 9; k++) {
      const a = PI + (k - 4) / 4 * 1.2, ca = Math.cos(a), sa = Math.sin(a), up = 1 + 0.12 * Math.cos((k - 4) * 0.9), sw = (k - 4) * 0.012;
      const prof = [[0.03, 0.07], [0.08, 0.1], [0.13, 0.15], [0.165, 0.23], [0.185, 0.31], [0.215, 0.38], [0.26, 0.42]]; // (out, up, and a flick outward at the tip)
      tails.push(prof.map(([u, y], i) => [sa * u + ca * sw * i, 0.0 + y * up, ca * u - sa * sw * i]));
    }
    const TR = [0.026, 0.046, 0.06, 0.066, 0.062, 0.05, 0.03];
    const tf = SDF.union(0.035, ...tails.map(P => SDF.tube(P, TR)));
    const tg = SDF.surfaceNets(tf, [-0.4, 0.01, -0.4], [0.4, 0.54, 0.3], 0.0125);
    const tipT = (p) => { let best = 1e9, t = 0; for (const P of tails) for (let i = 0; i < P.length; i++) { const d = (p.x - P[i][0]) ** 2 + (p.y - P[i][1]) ** 2 + (p.z - P[i][2]) ** 2; if (d < best) { best = d; t = i / (P.length - 1); } } return t; };
    B.add(tg, (p, n, o) => { const t = tipT(p), f = nz(p.x * 70 + p.y * 30, p.z * 70 - p.y * 40); o.set('#e8b45a').lerp(col('#f8dca0'), clamp(t * 1.4 - 0.1)).lerp(col('#fffdf6'), clamp((t - 0.7) * 6)).multiplyScalar(0.9 + 0.08 * clamp(n.y * 0.5 + 0.5) + 0.05 * f); });
    // the post: a slim silver-lacquer pole rising from the tails, a crook arm and an iron hook
    const pz = -0.06;
    pipe(B, [0, 0.06, pz], [0, 1.04, pz], 0.017, lacP('#3a3450'), { seg: 10 });
    for (const y of [0.4, 0.7]) put(B, G.torus(0.019, 0.004, 4, 12).rotateX(PI / 2), 0, y, pz, metalP('#c8c8e0', 0.6));
    curve(B, [[0, 1.03, pz], [0, 1.1, pz + 0.04], [0, 1.1, pz + 0.12], [0, 1.06, pz + 0.17]], 0.014, lacP('#3a3450'), { radial: 8, n: 10 });
    ball(B, 0.022, 0, 1.115, pz, metalP('#d8d0f0', 0.7), 1, 10);
    const hx = pz + 0.17;
    put(B, G.torus(0.014, 0.0035, 4, 12).rotateY(PI / 2), 0, 1.04, hx, '#4a4458');
    // the moon: a round paper lantern (glow) with faint maria, dark caps and lilac cords
    const R = 0.17, cy = 0.82;
    cyl(B, 0.004, 0.004, 0.05, 5, 0, cy + R + 0.005, hx, '#4a4458');
    B.glow(at(G.sph(R, 28, 18), 0, cy, hx), (p, n, o) => { const m = nz(p.x * 9 + 3, p.y * 9 + p.z * 7), m2 = nz(p.x * 22 - 1, p.y * 22 + p.z * 18); o.set('#fff6dc').lerp(col('#f0dcb0'), clamp(m * 1.2 - 0.3) * 0.5 + clamp(m2 - 0.5) * 0.25); }, { flicker: 0.25, tint: 0.4 });
    for (const s of [-1, 1]) lathe(B, s > 0 ? [[0.001, 0], [0.05, 0], [0.052, 0.012], [0.04, 0.022], [0.001, 0.024]] : [[0.001, 0.024], [0.04, 0.022], [0.052, 0.012], [0.05, 0], [0.001, 0]], 16, 0, s > 0 ? cy + R - 0.012 : cy - R - 0.012, hx, lacP('#2a2438'));
    for (let k = 1; k < 6; k++) { const y = cy - R + (2 * R) * k / 6, rr = Math.sqrt(Math.max(0, R * R - (y - cy) ** 2)) + 0.002; const r = G.torus(rr, 0.0024, 3, 40); r.rotateX(PI / 2); B.glow(r.translate(0, y, hx), '#d8c8a8', { tint: 0.2, flicker: 0.25 }); }
    // the fox mask on its front: a white face with pointed ears, vermilion markings, closed smiling eyes
    const mk = new THREE.Shape(); mk.moveTo(0, -0.06); mk.quadraticCurveTo(0.03, -0.055, 0.05, -0.02); mk.lineTo(0.066, 0.062); mk.lineTo(0.032, 0.036); mk.quadraticCurveTo(0, 0.046, -0.032, 0.036); mk.lineTo(-0.066, 0.062); mk.lineTo(-0.05, -0.02); mk.quadraticCurveTo(-0.03, -0.055, 0, -0.06);
    const onMoon = (g, dz = 0) => { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z0 = Math.sqrt(Math.max(0, R * R - x * x - y * y)); p.setXYZ(i, x, cy + y, hx + z0 + 0.006 + dz); } g.computeVertexNormals(); return g; };
    B.add(onMoon(new THREE.ShapeGeometry(mk, 6)), (p, n, o) => o.set('#ffffff').multiplyScalar(0.95 + 0.05 * n.z));
    for (const s of [-1, 1]) {
      B.add(onMoon(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(s * 0.04, 0.034), new THREE.Vector2(s * 0.058, 0.052), new THREE.Vector2(s * 0.05, 0.03)])), 0.001), '#e8503a');
      B.add(onMoon(stroke([[s * 0.036, 0.004], [s * 0.022, 0.014], [s * 0.008, 0.006]], 0.0055, 1, 0, 0, 8), 0.001), INK);
      B.add(onMoon(stroke([[s * 0.012, 0.026], [s * 0.03, 0.03]], 0.006, 1), 0.001), '#e8503a');
    }
    B.add(onMoon(new THREE.CircleGeometry(0.006, 8).translate(0, -0.03, 0), 0.001), INK);
    B.add(onMoon(stroke([[-0.012, -0.044], [0, -0.04], [0.012, -0.044]], 0.004, 1, 0, 0, 6), 0.001), '#e8503a');
    tassel(B, 0, cy - R - 0.014, hx, '#b8a0e8', 0.1);
  },

  // =================================================================== the zone dungeons' bosses
  // Tengu's fan stand: a black lacquer display stand (two curved uprights on a base) holding Master Tengu's great feather
  // fan upright: nine long feathers, chestnut with cream tips, a lacquer grip and a red cord with a tassel
  trophyTenguFan(B) {
    const lac = lacP(BLACK_LAC);
    sbox(B, 0.66, 0.05, 0.26, 0.02, 0, 0, 0, lac);
    sbox(B, 0.6, 0.02, 0.2, 0.008, 0, 0.05, 0, lacP('#5a2a20'));
    for (const s of [-1, 1]) {
      curve(B, [[s * 0.2, 0.05, -0.02], [s * 0.22, 0.2, -0.04], [s * 0.18, 0.34, -0.03], [s * 0.12, 0.42, 0.0]], 0.02, lac, { radial: 8, n: 10 });
      ball(B, 0.024, s * 0.12, 0.42, 0.0, metalP(GOLD), 1, 10);
    }
    put(B, G.torus(0.035, 0.008, 6, 16), 0, 0.42, 0.0, metalP(GOLD)); // (the ring the grip rests in)
    // the fan: rising from the grip, tilted back a touch
    B.at([0, 0.4, 0.0], 0, () => {
      pipe(B, [0, -0.02, 0], [0, 0.26, 0], 0.022, lacP(LAC_RED), { r1: 0.026, seg: 10 });
      for (const y of [0.02, 0.22]) put(B, G.torus(0.024, 0.005, 4, 14).rotateX(PI / 2), 0, y, 0, metalP(GOLD));
      ball(B, 0.03, 0, 0.27, 0, metalP(GOLD), [1, 0.6, 1], 12);
      // the feathers: tapered leaf blades fanning from the top of the grip, each with a quill, barbs painted in
      const NFe = 13;
      for (let k = 0; k < NFe; k++) {
        const a = (k - (NFe - 1) / 2) / NFe * 2.1, L = 0.56 - Math.abs(k - (NFe - 1) / 2) * 0.022, Wd = 0.13;
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(Wd * 0.7, L * 0.18, Wd * 0.62, L * 0.78, 0.004, L); sh.bezierCurveTo(-Wd * 0.55, L * 0.8, -Wd * 0.6, L * 0.2, 0, 0);
        const g = new THREE.ShapeGeometry(sh, 12), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.02 * Math.cos(x / Wd * PI) + 0.006 * Math.sin(y * 30) * (x / Wd)); }
        g.computeVertexNormals(); g.rotateZ(-a); g.translate(0, 0.27, 0.003 * Math.abs(k - (NFe - 1) / 2) + (k % 2) * 0.004); g.rotateX(-0.18);
        B.add(twoSided(g), (pp, n, o) => { const d = Math.hypot(pp.x, pp.y - 0.27) / L, side = Math.sin((pp.x * Math.cos(a) + (pp.y - 0.27) * Math.sin(a)) * 220); o.set('#5a321e').lerp(col('#8a5432'), clamp(0.5 + 0.5 * side) * 0.35).lerp(col('#fff4e0'), clamp((d - 0.76) * 6)).lerp(col('#2a1810'), clamp(0.15 - d) * 3); });
        const q = []; for (let i = 0; i <= 5; i++) { const t = i / 5 * 0.92; q.push([Math.sin(a) * t * L, 0.27 + Math.cos(a) * t * L - 0.018 * t, 0.006 - 0.05 * t * Math.cos(a) * 0.36]); }
        curve(B, q, t => 0.004 * (1 - t) + 0.0012, '#f4e8d0', { radial: 4 });
      }
      // the red cord looped round the grip, its tassel hanging free
      cord(B, [[0.02, 0.06, 0.02], [0.05, 0.0, 0.05], [0.06, -0.1, 0.05], [0.05, -0.16, 0.04]], 0.0045, '#e8403a', '#ff7a5a', 16);
      tassel(B, 0.05, -0.165, 0.04, '#e8403a', 0.09);
    }, 1, -0.12);
  },

  // Danzaburō's leaf sake jar: a round tokkuri in amber glaze with a cream drip over the shoulder, a straw rope tied
  // round its neck with a paper tag, a big red maple leaf on its stopper, a tiny straw hat hung on the cord
  trophyLeafJar(B) {
    // a little woven straw mat under it
    B.add(at(pillowGeo(0.4, 0.03, 0.4, { sq: 1, edge: 0.6, bot: 0.4, ws: 24, hs: 6 }), 0, 0, 0), (p, n, o) => o.set('#d8b878').multiplyScalar(0.88 + 0.12 * (0.5 + 0.5 * Math.sin(Math.atan2(p.x, p.z) * 24 + Math.hypot(p.x, p.z) * 60))));
    const prof = [[0.001, 0.02], [0.1, 0.02], [0.13, 0.04], [0.19, 0.13], [0.205, 0.22], [0.19, 0.32], [0.14, 0.4], [0.075, 0.46], [0.052, 0.52], [0.05, 0.56], [0.062, 0.58], [0.055, 0.6], [0.001, 0.6]];
    const Rf = profR(prof);
    lathe(B, prof, 32, 0, 0, 0, (p, n, o) => { const a = Math.atan2(p.x, p.z), drip = 0.42 - 0.07 * (0.5 + 0.5 * Math.sin(a * 7)) - 0.04 * (0.5 + 0.5 * Math.sin(a * 13 + 1)); o.set('#a8582a').lerp(col('#d8884a'), clamp(n.y * 0.6 + n.z * 0.3) * 0.5).lerp(col('#7a3a1a'), clamp(-n.y) * 0.5); if (p.y > drip) o.set('#f4e8d0').lerp(col('#e8d4b0'), clamp(-n.y + 0.2) * 0.5); o.multiplyScalar(0.96 + 0.04 * nz(p.x * 50, p.y * 50 + p.z * 40)); });
    // the tanuki's belly mark painted on the front: a round cream belly patch and the character-like leaf crest
    B.add(wrapLathe(ellD(0.1, 0.08, 24, 4).translate(0, 0.2, 0), Rf, 0, 0.0016), '#f4e2c0');
    const lf = new THREE.Shape(); lf.moveTo(0, -0.045); lf.quadraticCurveTo(0.05, -0.01, 0, 0.05); lf.quadraticCurveTo(-0.05, -0.01, 0, -0.045);
    B.add(wrapLathe(new THREE.ShapeGeometry(lf, 8).rotateZ(-0.5).translate(0, 0.205, 0), Rf, 0, 0.0028), '#4a8a3a');
    B.add(wrapLathe(stroke([[0.02, 0.17], [-0.018, 0.236]], 0.004, 1), Rf, 0, 0.0034), '#2a5a2a');
    // the straw rope round the neck, tied in a bow with a paper tag
    const ny = 0.47, nr = Rf(ny);
    cord(B, Array.from({ length: 25 }, (_, i) => { const a = i / 24 * TAU; return [Math.sin(a) * (nr + 0.008), ny + 0.004 * Math.sin(a * 3), Math.cos(a) * (nr + 0.008)]; }), 0.008, '#e0c070', '#c8a050', 48);
    for (const s of [-1, 1]) curve(B, [[0.01 * s, ny, nr + 0.01], [0.04 * s, ny + 0.01, nr + 0.03], [0.05 * s, ny - 0.03, nr + 0.03], [0.02 * s, ny - 0.01, nr + 0.015]], 0.006, '#d8b860', { radial: 5, n: 8 });
    curve(B, [[0.01, ny - 0.01, nr + 0.016], [0.03, ny - 0.07, nr + 0.03], [0.04, ny - 0.11, nr + 0.03]], 0.004, '#c8a050', { radial: 4, n: 6 });
    const tag = roundRect(0.05, 0.07, 0.006); const tg = new THREE.ShapeGeometry(tag); tg.rotateZ(0.12);
    put(B, tg, 0.045, ny - 0.145, nr + 0.034, '#fff8e8');
    put(B, stroke([[0, 0.02], [0.003, 0], [-0.002, -0.022]], 0.008, 1, 0, 0, 6).rotateZ(0.12), 0.046, ny - 0.145, nr + 0.0355, '#c82a2a');
    // the stopper and its big red maple leaf
    lathe(B, [[0.001, 0.56], [0.044, 0.56], [0.048, 0.6], [0.04, 0.63], [0.001, 0.632]], 14, 0, 0, 0, grainP('#c89060'));
    const leaf = new THREE.Shape(); for (let i = 0; i <= 160; i++) { const th = i / 160 * TAU - PI, r = KIT.mapleR(th); const x = Math.sin(th) * r, y = Math.cos(th) * r; i ? leaf.lineTo(x, y) : leaf.moveTo(x, y); }
    const lg = new THREE.ShapeGeometry(leaf, 2); lg.scale(0.17, 0.17, 1);
    { const p = lg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 * Math.hypot(p.getX(i), p.getY(i)) * 10 * 0.2 - 0.02 * Math.abs(p.getX(i)) * 3); lg.computeVertexNormals(); }
    lg.rotateX(-0.75); lg.rotateY(0.35);
    B.add(twoSided(lg.translate(0, 0.645, 0.01)), (p, n, o) => o.set('#e8402a').lerp(col('#ff9a3a'), clamp(1 - Math.hypot(p.x, p.z - 0.01) * 12) * 0.45).multiplyScalar(0.9 + 0.12 * clamp(n.y)));
    pipe(B, [0, 0.63, 0], [-0.012, 0.66, -0.03], 0.004, '#8a3a1a', { seg: 4 });
    // its veins, from the stem to each lobe's point
    for (const th of [0, 0.93, -0.93, 1.83, -1.83]) { const r = KIT.mapleR(th) * 0.17 * 0.85; const v = stroke([[0, 0], [Math.sin(th) * r, Math.cos(th) * r]], t => 0.005 - t * 0.003, 1); v.translate(0, 0, 0.003); v.rotateX(-0.75); v.rotateY(0.35); B.add(v.translate(0, 0.645, 0.01), '#b82a1a'); }
    // the tiny straw hat hung on the cord's loop at the side
    B.at([0.13, 0.035, 0.15], 0.4, () => {
      // a little sugegasa: a wide woven cone with a turned-down brim, a blue band and a knot on top
      const hat = [[0.001, 0.0], [0.09, 0.0], [0.094, 0.008], [0.088, 0.014], [0.06, 0.032], [0.032, 0.056], [0.012, 0.074], [0.001, 0.078]];
      lathe(B, hat, 28, 0, 0, 0, (p, n, o) => { const r = Math.hypot(p.x, p.z), a = Math.atan2(p.x, p.z); o.set('#e6c070').lerp(col('#f4dc98'), clamp(n.y * 0.5)).multiplyScalar(0.86 + 0.12 * (0.5 + 0.5 * Math.sin(r * 320)) + 0.05 * Math.sin(a * 28)); });
      lathe(B, [[0.001, 0.0], [0.088, 0.0], [0.088, -0.004], [0.001, -0.004]], 24, 0, 0, 0, '#c89a50');
      put(B, G.torus(0.05, 0.0045, 4, 20).rotateX(PI / 2), 0, 0.03, 0, '#3a6ac8');
      ball(B, 0.009, 0, 0.078, 0, '#c8a050', 1, 6);
    }, 1, -0.12, 0.1); // (set down on the mat beside the jar)
  },

  // Umibōzu's sea lantern: a bleached driftwood post on a sea-smoothed stone, a crooked arm with a rope; an aqua glass
  // float glowing in a knotted net, a starfish and two shells by its foot, a tuft of seaweed
  trophySeaLantern(B) {
    B.add(at(pillowGeo(0.42, 0.1, 0.36, { sq: 0.8, edge: 0.3, bot: 0.4, ws: 18, hs: 8 }), 0, 0, 0), (p, n, o) => o.set('#a8aeb4').lerp(col('#d8dcd8'), clamp(n.y * 0.7)).multiplyScalar(0.94 + 0.08 * nz(p.x * 18, p.z * 18)));
    const dw = (p, n, o) => o.set('#d8d0c4').lerp(col('#b8ac9c'), clamp(0.5 + 0.5 * Math.sin(p.y * 90 + Math.sin(p.x * 40) * 2)) * 0.5).multiplyScalar(0.9 + 0.12 * clamp(n.y * 0.4 + 0.6));
    const px = -0.1;
    curve(B, [[px, 0.06, -0.04], [px + 0.02, 0.35, -0.05], [px - 0.015, 0.7, -0.03], [px + 0.01, 0.98, -0.05], [px + 0.03, 1.1, -0.04]], t => 0.04 - 0.012 * t + 0.006 * Math.sin(t * 17), dw, { radial: 9, n: 14 });
    curve(B, [[px + 0.02, 1.02, -0.045], [px + 0.1, 1.08, -0.02], [px + 0.2, 1.06, 0.0], [px + 0.26, 1.02, 0.01]], t => 0.024 - 0.01 * t, dw, { radial: 8, n: 10 });
    curve(B, [[px - 0.01, 0.5, -0.03], [px - 0.07, 0.6, -0.02], [px - 0.1, 0.62, 0.0]], t => 0.016 - 0.01 * t, dw, { radial: 6, n: 6 }); // (a stub of a branch)
    const hx = px + 0.25;
    cord(B, [[hx, 1.02, 0.01], [hx, 0.98, 0.012], [hx, 0.95, 0.01]], 0.006, '#c8b088', '#a89068', 8);
    // the float: aqua glass (glow), a highlight, a knotted rope net, a cork plug and a hanging loop
    const R = 0.13, cy = 0.8, cz = 0.01;
    B.glow(at(G.sph(R, 26, 18), hx, cy, cz), (p, n, o) => o.set('#7ad8e8').lerp(col('#d8fbff'), clamp(n.y * 0.4 + n.z * 0.3)).lerp(col('#4ab0c8'), clamp(-n.y * 0.6)), { tint: 0.65, flicker: 0.15 });
    ball(B, R * 0.2, hx - R * 0.4, cy + R * 0.45, cz + R * 0.76, '#ffffff', [1, 1, 0.4], 8);
    for (let k = 0; k < 6; k++) { const m = G.torus(R * 1.02, 0.0055, 3, 32); m.rotateY(k / 6 * PI); put(B, m, hx, cy, cz, '#c8a878'); }
    for (const y of [-0.5, 0, 0.5]) { const rr = R * Math.sqrt(1 - y * y) * 1.02; const m = G.torus(rr, 0.0055, 3, 30); m.rotateX(PI / 2); put(B, m, hx, cy + y * R, cz, '#c8a878'); }
    for (let k = 0; k < 6; k++) for (const y of [-0.5, 0, 0.5]) { const a = k / 6 * PI, rr = R * Math.sqrt(1 - y * y) * 1.03; for (const s of [1, -1]) ball(B, 0.008, hx + Math.sin(a) * rr * s, cy + y * R, cz + Math.cos(a) * rr * s, '#b89868', 1, 5); }
    cyl(B, 0.022, 0.026, 0.03, 10, hx, cy + R - 0.006, cz, '#c89060');
    // the starfish, two shells and a seaweed tuft on the stone
    B.at([0.09, 0.095, 0.08], 0.4, () => {
      const st = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = i / 10 * TAU, r = i % 2 ? 0.022 : 0.058; const x = Math.sin(a) * r, y = Math.cos(a) * r; i ? st.lineTo(x, y) : st.moveTo(x, y); }
      const g = extrude(st, 0.008, 0.008, 4); g.rotateX(-PI / 2); B.add(g, (p, n, o) => o.set('#ff8a5a').lerp(col('#ffc08a'), clamp(n.y) * 0.4));
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ball(B, 0.005, Math.sin(a) * 0.03, 0.018, -Math.cos(a) * 0.03, '#fff0d8', 1, 5); }
    }, 1, 0.2);
    for (const [x, z, r, c] of [[0.13, -0.06, 0.4, '#ffd8e0'], [-0.02, 0.12, -0.8, '#fff0d8']]) B.at([x, 0.08, z], r, () => { const sh = new THREE.SphereGeometry(0.032, 14, 8, 0, TAU, 0, PI / 2); sh.scale(1, 0.55, 1.1); B.add(sh, (p, n, o) => o.set(c).multiplyScalar(0.86 + 0.16 * (0.5 + 0.5 * Math.cos(Math.atan2(p.x, p.z) * 9)))); }, 1, -0.2);
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; curve(B, [[-0.14, 0.07, 0.06], [-0.14 + Math.sin(a) * 0.03, 0.14, 0.06 + Math.cos(a) * 0.03], [-0.14 + Math.sin(a) * 0.05, 0.2 + k * 0.01, 0.06 + Math.cos(a) * 0.05]], t => 0.008 * (1 - t) + 0.002, '#4a9a5a', { radial: 4, n: 6 }); }
  },

  // Yuki-onna's frost mirror: a round mirror on a pale birch stand, its frame a ring of frost points and six snowflake
  // tips, a soft blue sheen across the glass, a snowdrift on the foot
  trophyFrostMirror(B) {
    const birch = (p, n, o) => o.set('#f2ece4').lerp(col('#d8ccc0'), clamp(0.5 + 0.5 * Math.sin(p.y * 70 + Math.sin(p.x * 30))) * 0.25).multiplyScalar(0.92 + 0.1 * clamp(n.y * 0.4 + 0.6));
    sbox(B, 0.44, 0.05, 0.24, 0.022, 0, 0, 0, birch);
    for (const s of [-1, 1]) {
      curve(B, [[s * 0.17, 0.05, 0.0], [s * 0.19, 0.3, -0.01], [s * 0.2, 0.58, -0.01], [s * 0.19, 0.72, 0.0]], 0.018, birch, { radial: 8, n: 10 });
      ball(B, 0.03, s * 0.19, 0.74, 0.0, metalP('#c8d8f0', 0.7), 1, 12);
      for (const y of [0.2, 0.42]) { const b = G.torus(0.02, 0.0035, 4, 10); b.rotateX(PI / 2); put(B, b, s * 0.185, y, -0.005, '#7a8aa8'); }
    }
    // the mirror, between the uprights, tilted back a touch
    B.at([0, 0.7, 0.0], 0, () => {
      const R = 0.17;
      B.add(new THREE.CylinderGeometry(R, R, 0.012, 40).rotateX(PI / 2), (p, n, o) => { const t = clamp(0.5 + (p.x * 0.6 + p.y) / (2 * R)); o.set('#a8c8e8').lerp(col('#f0f8ff'), clamp(1 - Math.abs(t - 0.62) * 5) * 0.8).lerp(col('#e8f4ff'), clamp(n.z) * 0.2); });
      B.add(new THREE.RingGeometry(0.0001, R * 0.99, 40, 3).translate(0, 0, 0.0065), (p, n, o) => { const t = clamp(0.5 + (p.x * 0.55 + p.y) / (2 * R)); o.set('#b8d4f0').lerp(col('#ffffff'), clamp(1 - Math.abs(t - 0.66) * 6)).lerp(col('#90b0d8'), clamp(0.3 - t) * 1.5); }); // (glass, not a lamp: it doesn't light up at night)
      put(B, G.torus(R + 0.012, 0.016, 8, 48), 0, 0, 0, metalP('#d8e4f4', 0.7));
      // frost points round the frame and six snowflake tips
      for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, L = k % 4 === 0 ? 0.05 : 0.026; const g = G.cone(0.011, L, 5); g.translate(0, L / 2, 0); g.rotateZ(-a); put(B, g, Math.sin(a) * (R + 0.022), Math.cos(a) * (R + 0.022), 0, (p, n, o) => o.set('#e8f4ff').lerp(col('#a8c8f0'), clamp(-n.z * 0.6 + 0.2))); }
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU, cx = Math.sin(a) * (R + 0.075), cy = Math.cos(a) * (R + 0.075);
        for (let j = 0; j < 6; j++) { const b = j / 6 * TAU; pipe(B, [cx, cy, 0.004], [cx + Math.sin(b) * 0.024, cy + Math.cos(b) * 0.024, 0.004], 0.0035, '#d8ecff', { seg: 4 }); }
        ball(B, 0.007, cx, cy, 0.006, '#ffffff', 1, 6);
      }
      // the pivots it hangs on
      for (const s of [-1, 1]) { const g = G.cyl(0.012, 0.012, 0.04, 8); g.rotateZ(PI / 2); put(B, g, s * (R + 0.012), 0, 0, '#7a8aa8'); }
    }, 1, -0.12);
    // snow on the foot
    for (const [x, z, r] of [[-0.12, 0.04, 0.07], [0.02, 0.07, 0.055], [0.14, 0.02, 0.06]]) ball(B, r, x, 0.05, z, '#ffffff', [1, 0.36, 0.8], 12);
  },
};

// =================================================================== the captains' torn banners
// A wall piece (0.5 m × 1 m): a lacquer pole on two pegs, the war banner hanging from it (cloth: it sways a little), its
// lower edge torn in a ragged zig-zag with a loose thread or two, the captain's crest in the middle, a stitched patch, and
// a red victory rosette with a paw pinned on its corner.
const BANNERS = {
  bannerGaleclaw: { cloth: '#2a7a6a', mark: '#f4f0e0', edge: '#1a4a40', crest: 'claws' },
  bannerStrawgrin: { cloth: '#7a2a1e', mark: '#ffd07a', edge: '#4a160e', crest: 'straw' },
  bannerBrineclaw: { cloth: '#1e3a5a', mark: '#e8f4ff', edge: '#0e2236', crest: 'claw' },
  bannerFrostbelly: { cloth: '#3a3a6a', mark: '#e8f0ff', edge: '#1e1e44', crest: 'snow' },
};
function crestShapes(kind, m) {
  const out = [];
  if (kind === 'claws') { // three slashes of a storm-weasel's sickles, under a wind swirl
    for (let k = -1; k <= 1; k++) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([k * 0.05 + 0.04 - t * 0.08 + 0.02 * Math.sin(t * PI), 0.08 - t * 0.17]); } out.push([stroke(pts, t => 0.022 * Math.sin(Math.min(1, t * 1.2 + 0.1) * PI) + 0.002, 1), m]); }
    const sw = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * 4.4, r = 0.012 + t * 0.05; sw.push([Math.cos(a) * r - 0.0, 0.12 + Math.sin(a) * r * 0.6]); }
    out.push([stroke(sw, t => 0.006 + 0.006 * t, 1), m]);
  } else if (kind === 'straw') { // a scarecrow's hat over crossed sheaves
    const h = new THREE.Shape(); h.moveTo(-0.11, 0.04); h.quadraticCurveTo(0, 0.07, 0.11, 0.04); h.quadraticCurveTo(0.06, 0.06, 0.04, 0.12); h.quadraticCurveTo(0, 0.15, -0.04, 0.12); h.quadraticCurveTo(-0.06, 0.06, -0.11, 0.04);
    out.push([new THREE.ShapeGeometry(h, 6), m]);
    for (const s of [-1, 1]) { const pts = [[s * -0.07, -0.12], [s * 0.06, 0.02]]; out.push([stroke(pts, 0.014, 1), m]); for (let j = 0; j < 4; j++) out.push([stroke([[s * 0.05, 0.01], [s * (0.07 + j * 0.008), 0.05 + j * 0.006]], 0.006, 1), m]); }
    out.push([stroke([[-0.04, -0.03], [0.04, -0.03]], 0.01, 1), m]);
  } else if (kind === 'claw') { // one great crab pincer: the palm, the big upper finger and the lower one, a gap between
    out.push([new THREE.CircleGeometry(0.06, 20).scale(1, 1.15, 1).translate(-0.02, -0.03, 0), m]);
    out.push([stroke([[0.0, 0.0], [0.03, 0.06], [0.07, 0.095], [0.1, 0.1]], t => 0.05 * (1 - t) ** 0.7 + 0.006, 1, 0, 0, 12), m]);
    out.push([stroke([[0.02, -0.04], [0.06, -0.025], [0.09, 0.005], [0.1, 0.035]], t => 0.034 * (1 - t) ** 0.7 + 0.005, 1, 0, 0, 12), m]);
    out.push([stroke([[-0.04, -0.08], [-0.06, -0.13]], t => 0.036 - t * 0.01, 1, 0, 0, 4), m]);
    for (const [x, y] of [[0.035, 0.05], [0.06, 0.075], [0.055, -0.012], [0.075, 0.0]]) out.push([new THREE.CircleGeometry(0.006, 8).translate(x, y, 0.001), shade(m, 0.72)]);
  } else { // a snowflake in a ring
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; out.push([stroke([[0, 0], [Math.sin(a) * 0.1, Math.cos(a) * 0.1]], 0.012, 1), m]); for (const s of [-1, 1]) out.push([stroke([[Math.sin(a) * 0.06, Math.cos(a) * 0.06], [Math.sin(a) * 0.06 + Math.sin(a + s * 0.8) * 0.03, Math.cos(a) * 0.06 + Math.cos(a + s * 0.8) * 0.03]], 0.008, 1), m]); }
    out.push([new THREE.RingGeometry(0.115, 0.13, 36), m]);
  }
  return out;
}
for (const [id, P] of Object.entries(BANNERS)) {
  TROPHY_BUILDERS[id] = B => {
    const W = 0.4, top = 0.9, bot = 0.2, z0 = 0.03;
    // the pole and its two pegs
    const pole = G.cyl(0.016, 0.016, 0.5, 10); pole.rotateZ(PI / 2); put(B, pole, 0, top + 0.03, z0, lacP(BLACK_LAC));
    for (const s of [-1, 1]) { ball(B, 0.022, s * 0.26, top + 0.03, z0, metalP(GOLD), [1, 1, 1], 10); const pg = G.cyl(0.01, 0.01, z0 + 0.01, 6); pg.rotateX(PI / 2); put(B, pg, s * 0.17, top + 0.03, z0 / 2, '#5a4030'); }
    // the banner: a cloth sheet with sleeve loops at the top, the ragged torn hem at the bottom
    const rag = x => bot + 0.06 * (0.5 + 0.5 * Math.sin(x * 61 + 1.3)) + 0.04 * (0.5 + 0.5 * Math.sin(x * 23 + 0.4)) - 0.05 * Math.max(0, x / W * 2 - 0.2); // (torn lower on the right)
    const NX = 16, NY = 24, pos = [];
    const pt = (i, j) => { const x = -W / 2 + W * i / NX, yb = rag(x), y = top - (top - yb) * j / NY, t = j / NY; return V(x, y, z0 + 0.012 + 0.012 * Math.sin(x * 14 + t * 3) * t + 0.01 * t * t); };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1); pos.push(a, d, b, b, d, c); }
    const g = new THREE.BufferGeometry().setFromPoints(pos); g.computeVertexNormals();
    const C0 = col(P.cloth), E = col(P.edge);
    B.cloth(twoSided(g), (p, n, o) => { const yb = rag(p.x); o.copy(C0).lerp(E, clamp(1 - (p.y - yb) / 0.05) * 0.6 + clamp(Math.abs(p.x) / (W / 2) - 0.9) * 4 * 0.4).multiplyScalar(0.92 + 0.08 * Math.sin(p.x * 400) * 0.5 + 0.06 * nz(p.x * 30, p.y * 30)); }, { x0: -W / 2, x1: W / 2, yTop: top, yBot: bot });
    // sleeve loops over the pole
    for (let k = 0; k < 4; k++) { const x = -W / 2 + 0.05 + k * (W - 0.1) / 3, lp = G.torus(0.022, 0.009, 5, 12, PI * 1.3); lp.rotateY(PI / 2); lp.rotateX(-PI * 0.15); put(B, lp, x, top + 0.03, z0, P.edge); }
    // loose threads from the torn hem
    for (const [x, L] of [[-0.12, 0.05], [0.04, 0.07], [0.15, 0.04]]) { const yb = rag(x); curve(B, [[x, yb + 0.004, z0 + 0.02], [x + 0.008, yb - L * 0.5, z0 + 0.024], [x - 0.004, yb - L, z0 + 0.02]], 0.0022, P.edge, { radial: 3, n: 5 }); }
    // the crest, laid on the cloth, and a stitched patch
    const cz = (y, x) => z0 + 0.012 + 0.012 * Math.sin(x * 14 + ((top - y) / (top - 0.3)) * 3) * ((top - y) / (top - 0.3)) + 0.01 * ((top - y) / (top - 0.3)) ** 2;
    const onCloth = (geo, x0, y0, c, lift = 0.003) => { const gg = geo.index ? geo.toNonIndexed() : geo; const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + x0, y = p.getY(i) + y0; p.setXYZ(i, x, y, cz(y, x) + lift + p.getZ(i)); } gg.computeVertexNormals(); B.cloth(gg, c, { x0: -W / 2, x1: W / 2, yTop: top, yBot: bot }); };
    onCloth(new THREE.CircleGeometry(0.15, 40), 0, 0.6, shade(P.cloth, 1.2), 0.002);
    for (const [geo, c] of crestShapes(P.crest, P.mark)) onCloth(geo, 0, 0.6, c, 0.004);
    onCloth(new THREE.ShapeGeometry(roundRect(0.08, 0.06, 0.008), 2).rotateZ(0.2), -0.1, 0.36, shade(P.cloth, 0.75), 0.003);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; onCloth(new THREE.PlaneGeometry(0.012, 0.003).rotateZ(a + PI / 2), -0.1 + Math.cos(a) * 0.045, 0.36 + Math.sin(a) * 0.034, '#f0e0c0', 0.005); }
    // the victory rosette on the top right corner
    B.at([0.12, 0.8, 0], 0, () => rosette(B, 0, 0, cz(0.8, 0.12) + 0.008));
  };
}
