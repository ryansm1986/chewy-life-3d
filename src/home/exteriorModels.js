// House exteriors (docs/HOUSING.md §5): the mailbox every home and Chewy's cottage get (the upgrade / remodel
// interactable) and the construction scaffold the upgrade animation pops up round a house. Cached kit Builder
// templates like the Seed Stall's (life/gardenModels.js seedStallTemplate): front +z, base at the origin, made into
// meshes by instantiate(tpl) (world/buildings/kit.js).
//  - mailboxTemplate(): a chunky little post mailbox: a mossy stone foot, a planed post with knee braces, a
//    house-shaped box with its own tiled roof and a red 〒 on the gable, a brass-lipped slot, a red flag that is up on
//    the right side, a name plate on the post and three tufts of flowers at the foot. About 0.36 x 0.4 m in plan and
//    1.12 m tall (flag tip), ~1.2k triangles, body + leaf buckets only (it is meant to be drawn instanced).
//  - scaffoldTemplate(w, d, h): lashed bamboo scaffolding round a w x d m footprint (centred on the origin), tall
//    enough to cover a house h m high: fat bamboo poles a little outside the footprint with rope lashings at every
//    crossing, plank walkways at two levels on bamboo putlogs, guard ledgers, cross braces on the back and left faces,
//    a leaning ladder at the front-left, a striped safety banner on the front, a blue tarp billowing on the right, a
//    bucket swinging on a rope from a jib (an animated part: swing it like a building template's), a red toolbox on the
//    lower walkway, a coil of rope on the corner pole, a green-cross safety flag on top, and at the foot a sawhorse with
//    a saw, a tied stack of planks, a yellow hard hat and a little "under construction" A-frame sign with a hammer.
//    Cached per (w, d, h); tpl.levels = { y1, y2, top } (the walkway heights and the pole tops), tpl.tris.
import * as THREE from 'three';
import { Builder, G, V, PI, C, shade, col, mixc } from '../world/buildings/kit.js';
import { paint } from '../gfx/geom.js';
import { leafGeo, blossomGeo, nz, mossStone } from '../world/buildings/props.js';
import { symbol } from '../world/buildings/symbols.js';
import { KIT } from './furnitureModels.js';
import { clamp, TAU } from '../core/util.js';

const { put, sbox, pipe, curve, alignY, roundRect, extrude, INK, GOLD } = KIT;

/** planed wood: a fine grain across `along` and a soft top light */
function grain(c, along = 'y', f = 60, amt = 0.05) {
  const C0 = col(c);
  return (p, n, o) => {
    const u = along === 'x' ? p.x : along === 'y' ? p.y : p.z, v = along === 'x' ? p.z + p.y * 0.5 : along === 'y' ? p.x + p.z : p.x + p.y * 0.5;
    o.copy(C0).multiplyScalar(1 + amt * Math.sin(v * f + Math.sin(u * 7) * 1.5 + nz(u * 4, v * 4) * 1.4)).multiplyScalar(0.9 + 0.12 * clamp(n.y * 0.5 + 0.5));
  };
}
const soft = (c, k = 0.12) => { const C0 = col(c); return (p, n, o) => o.copy(C0).multiplyScalar(0.9 + k * clamp(n.y * 0.6 + 0.45)); };

// =================================================================== the mailbox
let MAILBOX = null;
const MB = { body: '#fff0da', band: '#e8b888', roof: '#c45a4a', flag: '#f0443a', post: '#9c7458' };
/** a tiled roof slab: an extruded wavy kawara profile (tile columns along z), `sl` long down the slope from the
 *  ridge, laid on side s (+1 right / -1 left) of a ridge at height y, pitched by `slope` */
function tileSlab(depth, sl, th, s, slope, y, cols = 6) {
  const sh = new THREE.Shape(), cw = depth / cols, amp = th * 0.42;
  sh.moveTo(-depth / 2, 0); sh.lineTo(depth / 2, 0);
  for (let i = cols * 4; i >= 0; i--) { const u = -depth / 2 + i * cw / 4, k = Math.pow(Math.abs(Math.sin((i / 4) * PI)), 0.7); sh.lineTo(u, th + amp * k); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: sl, bevelEnabled: false, curveSegments: 1 }); g.deleteAttribute('uv');
  g.rotateY(s * PI / 2); g.rotateZ(-s * slope); g.translate(0, y, 0);
  return g;
}
/** the house mailbox (cached): front +z, base at the origin */
export function mailboxTemplate() {
  if (MAILBOX) return MAILBOX;
  const B = new Builder(5150);
  B.warpAmt = 0.01; B.jitter = 0.02;
  // ---------------------------------------------------------------- a mossy stone foot
  const foot = G.lathe([[0.001, 0], [0.16, 0], [0.175, 0.03], [0.162, 0.068], [0.114, 0.094], [0.06, 0.104], [0.001, 0.106]], 10);
  foot.scale(1, 1, 0.92); B.add(foot, mossStone('#cbc1c8', 0.5, 9));
  // ---------------------------------------------------------------- the post, a cap block and two knee braces
  const yP = 0.09, yS = 0.76;
  put(B, G.beam(0.105, yS - yP, 0.105, 0.026), 0, (yP + yS) / 2, -0.01, grain(MB.post, 'y', 46));
  put(B, G.beam(0.15, 0.045, 0.27, 0.014), 0, yS + 0.022, 0, grain(shade(MB.post, 0.9), 'z', 40));
  for (const s of [-1, 1]) pipe(B, [0, yS - 0.17, -0.01 + s * 0.045], [0, yS + 0.005, s * 0.12], 0.022, shade(MB.post, 0.86), { seg: 5 });
  // ---------------------------------------------------------------- the box: a little house, extruded along z
  const W = 0.28, Hw = 0.18, Hp = 0.095, D = 0.28, bv = 0.02, yB = yS + 0.045;
  const prof = new THREE.Shape(), hw = W / 2 - bv;
  prof.moveTo(-hw, 0); prof.lineTo(hw, 0); prof.lineTo(hw, Hw - bv); prof.lineTo(0, Hw + Hp - bv * 1.6); prof.lineTo(-hw, Hw - bv); prof.closePath();
  const box = extrude([prof], D - 2 * bv, bv, 1, 2); box.translate(0, yB + bv, -D / 2);
  B.add(box, (p, n, o) => { o.set(MB.body).multiplyScalar(0.88 + 0.14 * clamp(n.y * 0.5 + 0.6)); if (p.y < yB + 0.04) o.set(MB.band).multiplyScalar(0.92 + 0.08 * clamp(n.y + 0.5)); });
  // the roof: two tiled slabs (tile columns + scalloped eave ends), an overhang all round, a ridge roll
  const slope = Math.atan2(Hp, W / 2), sl = Math.hypot(W / 2, Hp) + 0.06, yR = yB + Hw, yTop = yR + Hp - 0.006;
  for (const s of [-1, 1]) {
    const g = tileSlab(D + 0.07, sl, 0.026, s, slope, yTop);
    const c0 = col(MB.roof), hi = col('#ec9a82');
    B.add(g, (p, n, o) => {
      const dn = Math.hypot(p.x, yTop - p.y) / sl; // 0 at the ridge .. 1 at the eave
      o.copy(c0).lerp(hi, clamp(n.y) * 0.14).multiplyScalar(0.9 + 0.12 * (1 - dn));
      if (n.y < -0.2) o.copy(c0).multiplyScalar(0.62);
    });
  }
  const ridge = G.cyl(0.026, 0.026, D + 0.08, 8); ridge.rotateX(PI / 2); ridge.translate(0, yTop + 0.034, 0); B.add(ridge, shade(MB.roof, 0.8));
  for (const z of [-1, 1]) { const e = G.cyl(0.034, 0.034, 0.018, 8); e.rotateX(PI / 2); e.translate(0, yTop + 0.034, z * (D / 2 + 0.045)); B.add(e, mixc(MB.roof, '#fff0e0', 0.18)); }
  // the gable: a red post mark on the front
  const zF = D / 2 + 0.002, gy = yR + 0.014;
  B.add(G.box(0.07, 0.012, 0.006, 0).translate(0, gy + 0.034, zF), '#e8403a');
  B.add(G.box(0.07, 0.012, 0.006, 0).translate(0, gy + 0.013, zF), '#e8403a');
  B.add(G.box(0.014, 0.044, 0.006, 0).translate(0, gy - 0.008, zF), '#e8403a');
  // the slot: a dark mouth with a brass lip and a hinged flap
  const yL = yB + 0.108;
  put(B, extrude([roundRect(0.16, 0.032, 0.014)], 0.006, 0.003, 3), 0, yL, zF - 0.004, INK);
  put(B, G.box(0.18, 0.022, 0.016, 0), 0, yL + 0.028, zF + 0.002, '#e2aa50');
  put(B, G.box(0.18, 0.008, 0.012, 0), 0, yL - 0.023, zF + 0.002, '#c89038');
  // a soft painted heart on the lower front
  { const g = new THREE.ShapeGeometry(KIT.heartPath(0.075, 0, 0), 5); put(B, g, 0, yB + 0.058, zF + 0.001, '#ff8fa8'); }
  // ---------------------------------------------------------------- the flag (up), on the right side
  const fx = W / 2 + 0.012, pz = -0.06, py = yB + 0.06;
  const piv = G.cyl(0.026, 0.026, 0.016, 8); piv.rotateZ(PI / 2); put(B, piv, fx + 0.004, py, pz, GOLD);
  put(B, G.box(0.016, 0.26, 0.024, 0), fx + 0.012, py + 0.13, pz, '#c83a30');
  { const g = extrude([roundRect(0.12, 0.08, 0.02)], 0.012, 0.004, 3); g.rotateY(PI / 2); put(B, g, fx + 0.008, py + 0.22, pz - 0.055, soft(MB.flag, 0.16)); }
  // ---------------------------------------------------------------- a name plate on the post: cream board, ink strokes
  put(B, extrude([roundRect(0.15, 0.07, 0.02)], 0.01, 0.004, 3), 0, 0.56, 0.042, grain('#f4e0bc', 'x', 80, 0.04));
  put(B, KIT.stroke([[-0.05, 0.004], [-0.02, 0.01], [0.012, 0.002]], 0.013), 0, 0.565, 0.0605, INK);
  put(B, KIT.stroke([[0.025, 0.018], [0.03, -0.004], [0.05, -0.018]], 0.012), 0, 0.563, 0.0605, INK);
  for (const x of [-0.06, 0.06]) put(B, G.box(0.012, 0.012, 0.006, 0), x, 0.56, 0.058, GOLD);
  // ---------------------------------------------------------------- three tufts of flowers at the foot (leaf bucket)
  const tufts = [[0.14, 0.1, ['#ff8fb0', '#ffffff']], [-0.13, 0.12, ['#ffd24a', '#ff8fb0']], [-0.11, -0.14, ['#c8a8ff', '#ffffff']]];
  const greens = ['#5aa04a', '#6cb452', '#4f9444'];
  tufts.forEach(([x, z, fc], i) => {
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * TAU + i, lf = leafGeo(0.095 + (k % 2) * 0.02, 0.034, 0.4);
      lf.rotateZ(0.5 + (k % 3) * 0.15); lf.rotateY(-a); lf.translate(x, 0.012, z);
      B.add(lf, soft(greens[(k + i) % 3], 0.2), 'leaf');
    }
    for (let k = 0; k < 2; k++) {
      const R = 0.036 - k * 0.006, a = i * 2 + k * 2.4, fx2 = x + Math.cos(a) * 0.028, fz = z + Math.sin(a) * 0.028, fy = 0.075 + k * 0.035;
      const f = blossomGeo(R, 5, 0.42, false, 3); f.rotateX(0.35); f.rotateY(-a); f.translate(fx2, fy, fz);
      const c0 = col(fc[k]); B.add(f, (p, n, o) => o.copy(c0).lerp(col('#ffffff'), clamp(Math.hypot(p.x - fx2, p.z - fz) / R - 0.4) * 0.3), 'leaf');
      const eye = G.ico(R * 0.32, 0); eye.scale(1, 0.6, 1); eye.translate(fx2, fy + 0.006, fz); B.add(eye, fc[k] === '#ffd24a' ? '#ff9a3a' : '#ffd24a', 'leaf');
    }
  });
  B.door.set(0, 0, 0.45); B.height = 1.13; B.footprint = [1, 1];
  MAILBOX = B.finish();
  MAILBOX.tris = Object.values(MAILBOX.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0);
  return MAILBOX;
}

// =================================================================== the construction scaffold
const SCAF = new Map();
const BAMBOO = [['#d6c38a', '#a08a52'], ['#cbb87c', '#968048'], ['#dccb98', '#ab9a62'], ['#c4b87e', '#908a4e']];
const ROPE = '#e6d29a', ROPE_D = '#c8b070', PLANK = '#cba57e';
/** a fat bamboo pole from a to b ([x, y, z]): swollen node rings, pale cut ends, a weathered, mottled culm */
function pole(B, a, b, r, node = 0.42, seg = 7) {
  const A = V(...a), dir = V(...b).sub(A), L = dir.length(), [c, nc] = B.pick(BAMBOO), sd = B.rand(0, 50);
  const pts = [[0.001, 0], [r * 0.9, 0], [r, 0.01]], nN = Math.max(1, Math.round(L / node)), nodes = [];
  for (let i = 1; i < nN; i++) { const y = i * L / nN + B.wob(0.04); nodes.push(y); pts.push([r, y - 0.014], [r * 1.13, y], [r, y + 0.014]); }
  pts.push([r, L - 0.01], [r * 0.9, L], [0.001, L]);
  const C0 = col(c), NC = col(nc), CUT = col('#f2e4b8'), DARK = col(shade(c, 0.8));
  const g = paint(G.lathe(pts, seg), (p, n, o) => {
    if (Math.abs(n.y) > 0.7) { o.copy(CUT).lerp(NC, clamp((Math.hypot(p.x, p.z) / r - 0.55) * 2)); return; }
    const t = p.y / L, a = Math.atan2(p.z, p.x);
    o.copy(DARK).lerp(C0, 0.55 + 0.45 * t).multiplyScalar(0.92 + 0.1 * nz(p.y * 2.4 + sd, a * 0.9) + 0.06 * clamp(n.x * 0.5 + n.z * 0.3));
    for (const y of nodes) if (Math.abs(p.y - y) < 0.004) o.copy(NC);
  });
  alignY(g, dir); put(B, g, A.x, A.y, A.z, null);
}
/** a rope lashing round a vertical pole of radius r at (x, y, z): a fat wrapped band with a knot */
function lash(B, x, y, z, r) {
  const g = G.torus(r + 0.012, 0.019, 4, 10); g.rotateX(PI / 2); g.scale(1, 1.9, 1); g.translate(x, y, z);
  B.add(g, (p, n, o) => o.set(ROPE).multiplyScalar(0.84 + 0.2 * Math.abs(Math.sin((p.y - y) * 90 + Math.atan2(p.z - z, p.x - x) * 2))));
}
/** corner + intermediate positions from -X to X, spaced at most `gap` apart */
const spread = (X, gap = 1.06) => { const n = Math.max(1, Math.ceil(2 * X / gap)); return Array.from({ length: n + 1 }, (_, i) => -X + i * 2 * X / n); };
/** clip a convex polygon [[x, y]...] to x0 <= x <= x1, y0 <= y <= y1 */
function clipRect(poly, x0, x1, y0, y1) {
  const cut = (P, inside, inter) => { const o = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b); if (ia) o.push(a); if (ia !== ib) o.push(inter(a, b)); } return o; };
  const ix = x => (a, b) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])], iy = y => (a, b) => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];
  let P = poly;
  P = cut(P, q => q[0] >= x0, ix(x0)); if (P.length < 3) return P;
  P = cut(P, q => q[0] <= x1, ix(x1)); if (P.length < 3) return P;
  P = cut(P, q => q[1] >= y0, iy(y0)); if (P.length < 3) return P;
  return cut(P, q => q[1] <= y1, iy(y1));
}
/** a striped safety banner (cloth): L long, H tall, top edge at y = 0 along local x from 0..L, sagging a little */
function banner(B, L, H, { sag = 0.035, cols = ['#ff8a3a', '#fff4e2'], sw = 0.11 } = {}) {
  const k = 0.8, n = Math.ceil((L + H * k) / sw) + 1;
  for (let i = 0; i < n; i++) {
    const a = -H * k + i * sw, poly = clipRect([[a, -H], [a + sw, -H], [a + sw + H * k, 0], [a + H * k, 0]], 0, L, -H, 0);
    if (poly.length < 3) continue;
    const pos = [];
    for (let t = 1; t + 1 < poly.length; t++) for (const q of [poly[0], poly[t], poly[t + 1]]) pos.push(q[0], q[1] - Math.sin(clamp(q[0] / L) * PI) * sag, 0);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    B.cloth(g, cols[i % 2], { x0: 0, x1: L, yTop: 0, yBot: -H });
  }
  // a hem along the top and the tie cords at the ends
  for (const x of [0, L]) { const t = G.torus(0.03, 0.012, 4, 8); t.translate(x, -0.02, 0.0); B.add(t, ROPE_D); }
}
/** a billowing blue tarp (cloth): W wide, H tall, top edge at y = 0 along local x (0..W), bulging toward +z */
function tarp(B, W, H) {
  const nx = 6, ny = 5, pos = [], P = (u, v) => [u * W, -v * H * (1 - 0.06 * Math.sin(u * PI)), Math.sin(u * PI) * Math.sin(v * PI * 0.9) * 0.09 + v * v * 0.05];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = P(i / nx, j / ny), b = P((i + 1) / nx, j / ny), c = P((i + 1) / nx, (j + 1) / ny), d = P(i / nx, (j + 1) / ny);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const c0 = col('#4a8ad0'), c1 = col('#7ab4ec');
  B.cloth(g, (p, n, o) => o.copy(c0).lerp(c1, clamp(0.5 + p.z * 4) * 0.6).multiplyScalar(0.92 + 0.08 * Math.sin(p.x * 9)), { x0: 0, x1: W, yTop: 0, yBot: -H });
  for (const x of [0.04, W - 0.04]) { const gr = G.torus(0.022, 0.009, 4, 8); gr.translate(x, -0.04, 0.012); B.add(gr, '#f4f4f4'); const t = G.torus(0.035, 0.013, 4, 8); t.rotateY(PI / 2); t.translate(x, 0.02, 0); B.add(t, ROPE_D); }
}
/** a wooden bucket of mortar (local, base at y = 0) with iron bands and a bail handle */
function mortarBucket(B, r = 0.11, h = 0.15) {
  const g = G.lathe([[0.001, 0], [r * 0.82, 0], [r * 0.86, 0.01], [r, h], [r * 0.9, h], [r * 0.82, 0.02], [0.001, 0.02]], 12);
  B.add(g, (p, n, o) => o.set('#c98f5e').multiplyScalar(0.86 + 0.16 * Math.abs(Math.sin(Math.atan2(p.z, p.x) * 6))));
  for (const y of [0.035, h - 0.03]) { const b = G.torus(r * (0.86 + 0.14 * y / h) + 0.004, 0.009, 4, 14); b.rotateX(PI / 2); b.translate(0, y, 0); B.add(b, C.iron); }
  const m = G.cyl(r * 0.88, r * 0.88, 0.02, 12); m.translate(0, h - 0.035, 0); B.add(m, '#b8b0b8');
  const bail = G.torus(r * 0.95, 0.011, 4, 12, PI); bail.translate(0, h, 0); B.add(bail, C.iron);
}
/** the "under construction" A-frame sign: a yellow board with a striped border and a hammer (local, foot at 0) */
function constructionSign(B) {
  for (const s of [-1, 1]) B.at([0, 0, s * 0.07], 0, () => {
    B.push([0, 0.32, 0], s > 0 ? 0 : PI, 1, -0.2);
    const bw = 0.42, bh = 0.34;
    sbox(B, bw + 0.05, bh + 0.05, 0.03, 0.012, 0, -bh / 2 - 0.025, -0.005, '#ff8a3a');
    // striped border: little cream blocks along the edge
    for (let i = 0; i < 7; i++) sbox(B, 0.03, 0.022, 0.006, 0.004, -bw / 2 + 0.02 + i * (bw - 0.04) / 6, bh / 2 + 0.006 - 0.025 - 0.0, 0.012, '#fff4e2');
    sbox(B, bw - 0.03, bh - 0.05, 0.012, 0.005, 0, -bh / 2, 0.011, '#ffd24a');
    B.at([0, -0.02, 0.02], 0, () => symbol(B, 'hammer', 0.26, { depth: 0.022, colors: ['#8a5a3a', '#4a4650'] }));
    for (const x of [-bw / 2 + 0.02, bw / 2 - 0.02]) put(B, G.beam(0.05, 0.46, 0.04, 0.01), x, -0.12, -0.03, '#9c7458');
    B.pop();
  });
  const hinge = G.cyl(0.018, 0.018, 0.46, 6); hinge.rotateZ(PI / 2); hinge.translate(0, 0.34, 0); B.add(hinge, '#7a5240');
}
/** a sawhorse with a plank and a saw on it, a stack of tied planks and a hard hat (local, ground at 0) */
function lumberCorner(B) {
  // sawhorse: a beam on splayed legs
  put(B, G.beam(0.7, 0.07, 0.08, 0.014), 0, 0.42, 0, grain('#b07a50', 'x'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(KIT.rbar([sx * 0.27, 0.41, sz * 0.02], [sx * 0.31, 0, sz * 0.17], 0.045, 0.045, 0.01), grain('#9c7458', 'y'));
  for (const sx of [-1, 1]) put(B, G.box(0.04, 0.04, 0.3, 0.008), sx * 0.29, 0.16, 0, '#9c7458');
  put(B, G.beam(0.9, 0.04, 0.17, 0.012).rotateY(0.18), 0.05, 0.475, 0.02, grain(PLANK, 'x'));
  // a saw resting across the plank
  B.at([-0.12, 0.5, 0.06], -0.5, () => {
    const blade = new THREE.Shape(); blade.moveTo(0, 0); blade.lineTo(0.3, 0.02); blade.lineTo(0.3, 0.08); blade.lineTo(0, 0.1); blade.closePath();
    const bg = extrude([blade], 0.004, 0.002, 2); bg.rotateX(-PI / 2); put(B, bg, -0.05, 0, 0, '#c8ccd4');
    put(B, G.box(0.1, 0.022, 0.05, 0.008), -0.09, 0.012, -0.05, '#c86a3a');
  });
  // a stack of planks tied with rope, beside it
  B.at([0, 0, -0.42], 0.08, () => {
    for (let i = 0; i < 5; i++) put(B, G.beam(0.95, 0.045, 0.16, 0.012).rotateY((i % 2 ? 1 : -1) * 0.03), (i % 3 - 1) * 0.025, 0.03 + i * 0.047, (i % 2) * 0.02, grain(shade(PLANK, 0.92 + (i % 3) * 0.05), 'x'));
    for (const x of [-0.3, 0.3]) { const r = G.torus(0.12, 0.014, 4, 10); r.scale(0.55, 1.35, 1); r.rotateY(PI / 2); r.translate(x, 0.14, 0.01); B.add(r, ROPE_D); }
    // the hard hat on top
    B.at([0.18, 0.27, 0.01], 0.4, () => {
      const dome = new THREE.SphereGeometry(0.1, 12, 6, 0, TAU, 0, PI / 2); B.add(dome, soft('#ffd24a', 0.2));
      const brim = G.cyl(0.13, 0.135, 0.016, 14); brim.translate(0.02, 0.006, 0); B.add(brim, '#f4c040');
      const ridge = G.box(0.03, 0.03, 0.17, 0.01); ridge.translate(0, 0.09, 0); B.add(ridge, '#f4c040');
    });
  });
}

/** the construction scaffold round a w x d m footprint, tall enough to cover a house h m high (cached per size) */
export function scaffoldTemplate(w = 3, d = 3, h = 3.6) {
  const key = `${(+w).toFixed(2)}x${(+d).toFixed(2)}x${(+h).toFixed(2)}`;
  let t = SCAF.get(key); if (t) return t;
  let hs = 2166136261; for (const ch of key) { hs ^= ch.charCodeAt(0); hs = Math.imul(hs, 16777619); }
  const B = new Builder(hs >>> 0);
  B.warpAmt = 0.025;
  const o = 0.1, X = w / 2 + o, Z = d / 2 + o, H = h + 0.45, rP = 0.055, rL = 0.045;
  const snap = v => Math.round(v * 20) / 20;
  const y1 = snap(clamp(h * 0.36, 0.9, 1.5)), y2 = snap(Math.max(y1 + 0.95, h * 0.72)), GUARD = 0.5;
  const xs = spread(X), zs = spread(Z);
  // ---------------------------------------------------------------- standards: the vertical poles, on little pads
  const P = [];
  for (const x of xs) P.push([x, -Z, 'b'], [x, Z, 'f']);
  for (const z of zs.slice(1, -1)) P.push([-X, z, 'l'], [X, z, 'r']);
  for (const [x, z] of P) {
    pole(B, [x, 0.02, z], [x + B.wob(0.02), H + B.wob(0.08), z + B.wob(0.02)], rP, 0.44);
    const pad = G.box(0.2, 0.05, 0.2, 0.02); pad.rotateY(B.wob(0.3)); pad.translate(x, 0.025, z); B.add(pad, grain('#9c7458', 'x'));
  }
  // ---------------------------------------------------------------- ledgers (outside the poles) + lashings
  const levels = [y1, y1 + GUARD, y2, y2 + GUARD];
  if (H - (y2 + GUARD) > 0.5) levels.push(H - 0.18);
  levels.forEach((y, li) => {
    const lift = 0.1; // the side ledgers sit a hand above the front / back ones, so they cross at the corners
    for (const sz of [-1, 1]) pole(B, [-X - 0.22, y, sz * (Z + rP + rL - 0.01)], [X + 0.22, y + B.wob(0.02), sz * (Z + rP + rL - 0.01)], rL);
    for (const sx of [-1, 1]) pole(B, [sx * (X + rP + rL - 0.01), y + lift, -Z - 0.22], [sx * (X + rP + rL - 0.01), y + lift + B.wob(0.02), Z + 0.22], rL);
    for (const [x, z, f] of P) {
      const corner = Math.abs(Math.abs(x) - X) < 1e-3 && Math.abs(Math.abs(z) - Z) < 1e-3;
      if (f === 'f' || f === 'b' || corner) lash(B, x, y, z, rP);
      if (f === 'l' || f === 'r' || corner) lash(B, x, y + lift, z, rP);
    }
    void li;
  });
  // ---------------------------------------------------------------- walkways: putlogs out from the poles, two planks
  const OUT = 0.32;
  for (const y of [y1, y2]) {
    const yc = y + rL + 0.03; // putlog centre: resting on the ledger
    for (const [x, z, f] of P) {
      const nx = f === 'r' ? 1 : f === 'l' ? -1 : 0, nzz = f === 'f' ? 1 : f === 'b' ? -1 : 0;
      const corner = Math.abs(Math.abs(x) - X) < 1e-3 && Math.abs(Math.abs(z) - Z) < 1e-3;
      const dirs = corner ? [[Math.sign(x), 0], [0, Math.sign(z)]] : [[nx, nzz]];
      for (const [dx, dz] of dirs) pole(B, [x - dx * 0.08, yc + (dx ? 0.1 : 0), z - dz * 0.08], [x + dx * (OUT + 0.02), yc + (dx ? 0.1 : 0), z + dz * (OUT + 0.02)], 0.035, 0.6);
    }
    const yb = yc + 0.035 + 0.02;
    for (const sz of [-1, 1]) for (const k of [0, 1]) put(B, G.beam(2 * X + 0.62, 0.044, 0.135, 0.012).rotateY(B.wob(0.01)), B.wob(0.04), yb, sz * (Z + 0.1 + k * 0.15), grain(shade(PLANK, B.rand(0.88, 1.04)), 'x', 50, 0.07));
    for (const sx of [-1, 1]) for (const k of [0, 1]) put(B, G.beam(0.135, 0.044, 2 * Z + 0.62, 0.012).rotateY(B.wob(0.01)), sx * (X + 0.1 + k * 0.15), yb + 0.1, B.wob(0.04), grain(shade(PLANK, B.rand(0.88, 1.04)), 'z', 50, 0.07));
  }
  // ---------------------------------------------------------------- cross braces on the back and left faces
  for (const [a, b] of [[[-X + 0.06, 0.2, -Z - 0.1], [X - 0.06, y2 + GUARD, -Z - 0.1]], [[X - 0.06, 0.2, -Z - 0.1], [-X + 0.06, y2 + GUARD, -Z - 0.1]],
    [[-X - 0.1, 0.25, -Z + 0.06], [-X - 0.1, y2 + GUARD, Z - 0.06]], [[-X - 0.1, 0.25, Z - 0.06], [-X - 0.1, y2 + GUARD, -Z + 0.06]]]) pole(B, a, b, 0.038, 0.55);
  // ---------------------------------------------------------------- a ladder leaning on the front-left walkway
  {
    const lx = xs[0] + Math.min(0.55, (xs[1] - xs[0]) * 0.5), top = V(lx, y1 + 0.75, Z + 0.22), foot = V(lx, 0, Z + 0.95), up = top.clone().sub(foot), L = up.length();
    B.push([foot.x, 0, foot.z], 0);
    for (const s of [-1, 1]) { const r = G.beam(0.055, L, 0.06, 0.014); r.translate(0, L / 2, 0); alignY(r, up); r.translate(s * 0.17, 0, 0); B.add(r, grain('#b07a50', 'y')); }
    const n = Math.floor(L / 0.27);
    for (let i = 1; i <= n; i++) { const p = up.clone().multiplyScalar(i / (n + 0.6)); const rg = G.cyl(0.024, 0.024, 0.36, 6); rg.rotateZ(PI / 2); rg.translate(0, p.y, p.z); B.add(rg, '#c8945e'); }
    B.pop();
    lash(B, lx + 0.17, top.y - 0.06, top.z - 0.01, 0.03); lash(B, lx - 0.17, top.y - 0.06, top.z - 0.01, 0.03);
  }
  // ---------------------------------------------------------------- a striped safety banner along the front guard
  {
    const xa = xs.length > 2 ? xs[1] : xs[0], xb = xs[xs.length - 1], yb = y1 + GUARD + 0.02;
    B.at([xa + 0.08, yb, Z + rP + 2 * rL + 0.02], 0, () => banner(B, xb - xa - 0.16, 0.26));
  }
  // ---------------------------------------------------------------- a blue tarp on the right face's upper back bay
  {
    const za = zs[0], zb = zs.length > 2 ? zs[1] : zs[zs.length - 1];
    B.at([X + rP + 2 * rL + 0.03, y2 + GUARD + 0.1 + 0.03, zb - 0.06], PI / 2, () => tarp(B, zb - za - 0.12, Math.min(1.0, GUARD + 0.75)));
  }
  // ---------------------------------------------------------------- a bucket on a rope from a jib at the front-right
  {
    const cx = X, cz = Z, yJ = Math.min(H - 0.15, y2 + GUARD + 0.45);
    const tip = V(cx + 0.36, yJ + 0.06, cz + 0.36);
    pole(B, [cx, yJ - 0.02, cz], [tip.x, tip.y, tip.z], 0.035, 0.6);
    lash(B, cx, yJ - 0.02, cz, rP);
    const wheel = G.torus(0.05, 0.018, 5, 12); wheel.rotateY(-PI / 4); wheel.translate(tip.x, tip.y - 0.06, tip.z); B.add(wheel, '#8a6a4a');
    // the hauling rope's tail runs back to a cleat on the corner pole
    curve(B, [[tip.x + 0.03, tip.y - 0.1, tip.z + 0.03], [cx + 0.2, y1 + 1.0, cz + 0.2], [cx + 0.05, y1 + 0.75, cz + 0.06]], 0.011, ROPE_D, { n: 8, radial: 5 });
    const hang = tip.y - 0.11, by = Math.max(y1 + 0.25, 0.9);
    B.anim({ p: [tip.x - 0.035, hang, tip.z - 0.035], kind: 'swing', axis: [1, 0, -1], speed: 1.3, amp: 0.09 }, () => {
      const rope = G.cyl(0.015, 0.015, hang - by - 0.15, 5); rope.translate(0, -(hang - by - 0.15) / 2, 0); B.add(rope, ROPE_D);
      B.at([0, -(hang - by), 0], 0.4, () => mortarBucket(B));
    });
  }
  // ---------------------------------------------------------------- on the walkways: a red toolbox, a coil of rope on a pole
  {
    const yb = y1 + rL + 0.03 + 0.035 + 0.04;
    B.at([X - 0.55, yb, Z + 0.18], 0.12, () => {
      sbox(B, 0.3, 0.12, 0.14, 0.02, 0, 0, 0, soft('#d8483a', 0.14));
      sbox(B, 0.31, 0.02, 0.15, 0.008, 0, 0.12, 0, '#b83a30');
      const hd = G.torus(0.06, 0.012, 4, 10, PI); hd.translate(0, 0.135, 0); B.add(hd, C.iron);
      put(B, G.box(0.06, 0.03, 0.012, 0), 0, 0.07, 0.072, '#e8c050');
      const hm = G.box(0.035, 0.035, 0.11, 0.01); hm.translate(0.08, 0.16, 0.0); hm.rotateY(0.3); B.add(hm, '#5a5a66');
    });
    const cx = -X, cy = y1 + GUARD - 0.22, cz = Z + rP + 0.035;
    const coil = G.torus(0.1, 0.024, 6, 14); coil.scale(1, 1.25, 1); coil.translate(cx, cy, cz);
    B.add(coil, (p, n, o) => o.set(ROPE).multiplyScalar(0.84 + 0.16 * Math.abs(Math.sin(Math.atan2(p.y - cy, p.x - cx) * 9))));
    lash(B, -X, cy + 0.15, Z, rP);
  }
  // ---------------------------------------------------------------- at the foot: lumber corner, the sign
  B.at([X - 0.55, 0, Z + 0.78], -0.25, () => lumberCorner(B));
  B.at([xs[0] + Math.min(1.05, X * 0.85), 0, Z + 0.72], 0.2, () => constructionSign(B), 1.15);
  // a green-cross safety flag (anzen daiichi, "safety first") on top of the front-left corner pole
  B.at([-X, H - 0.02, Z], 0, () => {
    const p = G.cyl(0.02, 0.024, 0.42, 6); p.translate(0, 0.21, 0); B.add(p, '#8a6a4a');
    const knob = G.sph(0.03, 7, 5); knob.translate(0, 0.43, 0); B.add(knob, GOLD);
    const fw = 0.34, fh = 0.24, cl = { x0: 0, x1: fw, yTop: 0.4, yBot: 0.4 - fh };
    const flag = G.plane(fw, fh, 3, 2); flag.translate(fw / 2 + 0.02, 0.4 - fh / 2, 0); B.cloth(flag, '#fffaf0', cl);
    for (const [w, h] of [[0.15, 0.045], [0.045, 0.15]]) { const g = G.plane(w, h, 1, 1); g.translate(fw / 2 + 0.02, 0.4 - fh / 2, 0.004); B.cloth(g, '#3aa860', cl); }
  });
  B.height = H; B.footprint = [Math.ceil(w), Math.ceil(d)];
  t = B.finish();
  t.tris = Object.values(t.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0) + t.anims.reduce((a, an) => a + Object.values(an.geos).reduce((b, g) => b + g.attributes.position.count / 3, 0), 0);
  t.key = key; t.levels = { y1, y2, top: H };
  SCAF.set(key, t);
  return t;
}
