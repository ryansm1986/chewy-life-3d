// Shiokaze Port (潮風港), the tidepool zone's fishing port (docs/ZONES.md §2): weathered grey-blue board houses, stone-
// weighted plank roofs (ishioki-yane) and blue-teal tiles, stilts over the bay, nets, buoys and glass floats, a pier with
// Funaki's boat moored at it. Each building builder draws its static model into a kit Builder (local frame: front = +z,
// toward the square; the footprint round the origin; ground at y = 0) and returns what the village runtime needs:
//   { fp: [x0, z0, x1, z1] (the solid footprint, local), door: [x, z] (the doorstep), keeper: [x, z, yaw] (where its
//     villager works), seat?: [x, z, yaw], lamps: [[x, y, z]...] (lantern hooks), siege(B) / saved(B) (the overlays) }
// The siege overlay boards the openings, smears soot, throws a tarp over the fish and hangs war banners; the saved one
// hangs noren and the big-catch flags, lays the catch out on ice and sets out goods. village.js places, turns and lists
// them. The bay lies screen-left (up-left) of the square: the stilted inn and the boatyard stand at the waterline, so
// their posts run down past local y = 0 (the beach falls away under them).
import * as THREE from 'three';
import { G, V, C, PI, shade, bar } from '../../world/buildings/kit.js';
import * as A from '../assets/tidepoolAssets.js';
import { slotAt, slotOf, screenAt, screenYaw } from './data.js';
import { TP_SITES } from '../assets/tidepoolTerrain.js';
import { roof } from '../../world/buildings/roofs.js';
import { foundation, walls, onFace, shoji, latticeWindow, door, STONES, noren as norenPart, norenMark } from '../../world/buildings/parts.js';
import { barrel, crate, bell } from '../../world/buildings/props.js';
import { nobori, awning, net, boat as dinghy, bucket, shimenawa, sack, wheel, parasol, teaBench } from '../../world/buildings/props2.js';
import { glassFloats, toolRack } from '../../world/buildings/trim.js';
import { shapeGeo } from '../../world/buildings/symbols.js';
import { tube, puff, merge } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, Noise } from '../../core/util.js';
import { boards, soot, debris, warBanner, flowerPot, waystone } from './art.js';

/** minimap roof colours per building kind */
export const MAP = { elder: '#5a7088', inn: '#3a8ab8', shop: '#7a868e', fishmonger: '#7a868e', boatwright: '#7a868e', waypoint: '#3a8ab8' };
// the palette: salt-silvered grey-blue boards, tarred timber, sun-bleached driftwood, blue-teal tiles, rope and nets,
// coral-red buoys and sea-glass
export const T = {
  board: '#a2b2bc', boardLt: '#d2dcde', boardDk: '#7f909e', boardTeal: '#74b4c4', boardWarm: '#a8988a',
  tar: '#54494a', frame: '#625858', drift: '#d6cec0', driftDk: '#b0a798', pile: '#7a6c60',
  tile: '#5a7090', tileTeal: '#3f8cb4', roofBoard: '#a4acb0', stone: '#a09ea6', stoneLt: '#c4c2c6',
  plaster: '#f4f0e6', innFrame: '#4e6074', innKoshi: '#6a98a8',
  rope: '#e0c890', net: '#d4c29c', teal: '#3aa6b8', coral: '#ee6a40', red: '#de4a3e', navy: '#2c4868', gold: '#e8b84a',
  ice: '#e4f4fa', iceDk: '#a8d4e4', brass: '#c89a50',
};
const WET = new THREE.Color('#5e6a66'), LT = new THREE.Color(T.boardLt);
const hz = k => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const _nz = new Noise(5301);
const nz = (x, y) => _nz.n2(x, y);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ symbols (flat, unit size, facing +z)
const shp = () => new THREE.Shape();
const circ = (x, y, r, hole = 0) => { const s = shp(); s.absarc(x, y, r, 0, TAU, false); if (hole) { const h = new THREE.Path(); h.absarc(x, y, hole, 0, TAU, true); s.holes.push(h); } return s; };
const poly = pts => { const s = shp(); s.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) s.lineTo(...pts[i]); s.closePath(); return s; };
function symShapes(name) {
  if (name === 'anchor') {
    const arms = shp(); arms.absarc(0, 0.04, 0.34, PI * 1.12, PI * 1.88, false); arms.absarc(0, 0.04, 0.25, PI * 1.88, PI * 1.12, true); arms.closePath();
    return [circ(0, 0.36, 0.1, 0.05), poly([[-0.04, 0.27], [0.04, 0.27], [0.04, -0.3], [-0.04, -0.3]]), poly([[-0.22, 0.17], [0.22, 0.17], [0.22, 0.23], [-0.22, 0.23]]), arms,
      poly([[-0.42, -0.02], [-0.25, -0.13], [-0.3, -0.04]]), poly([[0.42, -0.02], [0.25, -0.13], [0.3, -0.04]])];
  }
  if (name === 'shell') { // a scallop fan with its little hinge ears
    const s = shp(), n = 9; s.moveTo(0, -0.32);
    for (let i = 0; i <= n; i++) { const a = PI * (0.14 + 0.72 * i / n), r = 0.42 + (i % 2 ? 0 : 0.03); s.lineTo(Math.cos(a) * r, -0.32 + Math.sin(a) * r * 1.02); }
    s.closePath();
    return [s, poly([[-0.17, -0.38], [0.17, -0.38], [0.11, -0.27], [-0.11, -0.27]])];
  }
  if (name === 'pearl') { // an open shell cradling a pearl
    const s = shp(); s.moveTo(-0.42, -0.05); s.quadraticCurveTo(-0.38, -0.38, 0, -0.4); s.quadraticCurveTo(0.38, -0.38, 0.42, -0.05); s.quadraticCurveTo(0, -0.18, -0.42, -0.05);
    const u = shp(); u.moveTo(-0.4, 0.02); u.quadraticCurveTo(-0.3, 0.4, 0, 0.42); u.quadraticCurveTo(0.3, 0.4, 0.4, 0.02); u.quadraticCurveTo(0, 0.2, -0.4, 0.02);
    return [s, u, circ(0, 0.0, 0.13)];
  }
  if (name === 'boat') {
    const h = shp(); h.moveTo(-0.44, -0.08); h.lineTo(0.46, -0.04); h.quadraticCurveTo(0.34, -0.3, 0.1, -0.32); h.lineTo(-0.36, -0.3); h.closePath();
    return [h, poly([[-0.03, -0.06], [0.03, -0.06], [0.03, 0.44], [-0.03, 0.44]]), poly([[0.06, -0.02], [0.06, 0.4], [0.36, 0.0]])];
  }
  if (name === 'fish') { const s = shp(); s.absellipse(-0.06, 0, 0.3, 0.16, 0, TAU); return [s, poly([[0.16, 0], [0.42, 0.18], [0.36, 0], [0.42, -0.18]])]; }
  if (name === 'wave') return null;
  return [circ(0, 0, 0.4)];
}
function symGeo(name) {
  if (name === 'wave') return norenMark('wave');
  const g = new THREE.ShapeGeometry(symShapes(name), 8); return g.index ? g.toNonIndexed() : g;
}
/** a chunky raised symbol (extruded) on a signboard, local z out */
function sym3(B, name, size, color, depth = 0.025) {
  const sh = name === 'wave' ? null : symShapes(name);
  const g = sh ? shapeGeo(sh, depth, 0.008, 6) : symGeo('wave');
  g.scale(size, size, 1); B.add(g, color);
}

// ------------------------------------------------------------------ shared pieces
/** Weathered board cladding round a w × d block (wall foot at y0): vertical boards, each its own salt-bleached tone,
 *  darker and green-grey at the wet foot, battens over every other seam, a tarred sill and head rail, corner boards.
 *  skip: faces left open (the core block is skipped too when any face is open). */
function boardWalls(B, { w, d, h, y0 = 0, cx = 0, cz = 0, color = T.board, trim = T.tar, skip = [], pitch = 0.21, seed = 0 }) {
  if (!skip.length) { const g = G.box(w - 0.05, h, d - 0.05, 0); g.translate(cx, y0 + h / 2, cz); B.add(g, shade(color, 0.55)); }
  const blk = { w, d, cx, cz }, base = new THREE.Color(color);
  for (const side of ['f', 'r', 'b', 'l']) {
    if (skip.includes(side)) continue;
    const L = side === 'f' || side === 'b' ? w : d;
    onFace(B, blk, side, 0, y0, () => boardPanel(B, L, h, { base, trim, seed: seed + side.charCodeAt(0) }));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.beam(0.11, h + 0.04, 0.11, 0.02); p.translate(cx + sx * (w / 2 - 0.01), y0 + h / 2, cz + sz * (d / 2 - 0.01)); B.add(p, trim); }
}
/** one board panel in a face frame (centred on x, foot at y = 0, face at z = 0) */
function boardPanel(B, L, h, { base = new THREE.Color(T.board), trim = T.tar, seed = 0, pitch = 0.21, back = false } = {}) {
  const n = Math.max(2, Math.round(L / pitch)), bw = L / n;
  if (back) { const g = G.box(L, h, 0.03, 0); g.translate(0, h / 2, -0.02); B.add(g, shade(base.getHexString ? '#' + base.getHexString() : T.board, 0.55)); }
  for (let i = 0; i < n; i++) {
    const k = hz(i * 7.1 + L * 3.3 + seed), tone = base.clone().lerp(LT, k * 0.38).multiplyScalar(0.88 + 0.16 * hz(i * 3.3 + seed + 1)), hh = h - 0.01 - hz(i + seed) * 0.03;
    const g = G.box(bw - 0.012, hh, 0.03, 0); g.translate(-L / 2 + (i + 0.5) * bw, hh / 2, 0.015 + (i % 2) * 0.005);
    B.add(g, (p, nn, o) => o.copy(tone).lerp(WET, clamp(1 - p.y / 0.45) * 0.42).multiplyScalar(0.93 + 0.09 * clamp(p.y / h)));
  }
  for (let i = 1; i < n; i += 2) { const bt = G.box(0.04, h - 0.05, 0.025, 0); bt.translate(-L / 2 + i * bw, h / 2, 0.044); B.add(bt, shade(trim, 1.35)); }
  const sill = G.beam(L + 0.04, 0.09, 0.07, 0.012); sill.translate(0, 0.045, 0.035); B.add(sill, trim);
  const head = G.beam(L + 0.04, 0.1, 0.07, 0.012); head.translate(0, h - 0.05, 0.035); B.add(head, trim);
}
/** A stone-weighted plank roof (ishioki-yane, the windswept coast's roof) over a w × d block, wall top at y0, gable ends
 *  at ±x (ridge 'z' turns it: the gables face front and back): boards laid down each slope, battens across them with
 *  round beach stones resting on the battens, a boarded ridge under a log, dark bargeboards with a fish-tail gegyo, rafter
 *  ends under the eaves, boarded gable infill. → { ridgeY, yE (the eave edge), Z (the eave's reach from the ridge) } */
function plankRoof(B, o) {
  if (o.ridge !== 'z') return plankRoofCore(B, o);
  B.push([0, 0, 0], PI / 2); const r = plankRoofCore(B, { ...o, w: o.d, d: o.w }); B.pop(); return r;
}
function plankRoofCore(B, { w, d, y0, over = 0.42, gOver = 0.3, H = 1.1, color = T.roofBoard, stones = 3, gable = true, gegyo = true, seed = 0, gableColor = T.board }) {
  const A = w / 2 + gOver, Z = d / 2 + over, slope = H / (d / 2), yE = y0 - over * slope, yR = y0 + H;
  const L = Math.hypot(Z, yR - yE), ang = Math.atan2(yR - yE, Z), n = Math.max(6, Math.round(2 * A / 0.19)), pw = 2 * A / n;
  const base = new THREE.Color(color), silver = new THREE.Color('#c2c8c8'), brown = new THREE.Color('#9a8e80'), cedar = new THREE.Color('#b8906a'), dk = new THREE.Color('#6a7274'), lichen = new THREE.Color('#c8cc90');
  // a point on the slope's top surface: t 0 (ridge) .. 1 (eave), o along the slope's up-normal
  const at = (s, t, o = 0) => [s * Z * t + s * Math.sin(ang) * o, yR + (yE - yR) * t + Math.cos(ang) * o];
  for (const s of [-1, 1]) {
    // the boards laid down the slope, each its own weathering: silver, grey-brown, a few newer cedar ones
    for (let i = 0; i < n; i++) {
      const k = hz(i * 5.3 + s * 11 + seed), k2 = hz(i * 2.7 + s * 3 + seed * 1.3);
      const tone = (k > 0.9 ? cedar.clone() : base.clone().lerp(k > 0.55 ? silver : k < 0.2 ? dk : brown, k > 0.55 ? (k - 0.55) * 1.4 : k < 0.2 ? (0.2 - k) * 2.5 : 0.35)).multiplyScalar(0.94 + 0.1 * k2);
      const Lb = L + 0.05 + (hz(i * 1.7 + seed) - 0.5) * 0.1, [zc, yc] = at(s, 0.5 + (Lb - L) / (2 * L), 0.022 + (i % 2) * 0.012);
      const g = G.box(pw - 0.014, 0.044, Lb, 0); g.rotateX(s * ang); g.translate(-A + (i + 0.5) * pw, yc, zc);
      B.add(g, (p, nn, o) => { o.copy(tone); if (nn.y < -0.3) return o.multiplyScalar(0.6); const lk = nz(p.x * 3.1 + seed, p.z * 3.1 + p.y * 2); if (lk > 0.42) o.lerp(lichen, (lk - 0.42) * 1.2); return o; });
    }
    // the eave's fascia board, battens across the boards, each holding a row of round beach stones
    { const [zz, yy] = at(s, 1.0, -0.02); const fb = G.box(2 * A + 0.04, 0.13, 0.05, 0); fb.rotateX(s * ang * 0.25); fb.translate(0, yy - 0.04, zz + s * 0.02); B.add(fb, T.tar); }
    for (let r = 0; r < stones; r++) {
      const t = 0.18 + r * (0.66 / Math.max(1, stones - 1)), [zz, yy] = at(s, t, 0.085);
      const bt = G.beam(2 * A + 0.08, 0.06, 0.09, 0.012); bt.rotateX(s * ang); bt.translate(0, yy, zz); B.add(bt, '#5a5458');
      for (let x = -A + 0.16 + hz(r + s + seed) * 0.12; x < A - 0.12; x += 0.27 + hz(x * 3 + r) * 0.12) {
        const rr = 0.095 + hz(x * 7 + r * 3 + s) * 0.06, [z2, y2] = at(s, t - (0.06 + rr * 0.4) / L, 0.03 + rr * 0.55);
        const st = puff(V(0, 0, 0), rr, { detail: 1, noise: 0.32, squash: 0.66, seed: Math.round(x * 31 + r * 7 + s * 3 + seed) }); st.rotateX(s * ang * 0.6); st.translate(x, y2, z2);
        B.add(st, STONES[Math.floor(hz(x * 13 + r) * STONES.length)]);
      }
    }
    // rafter ends poking out under the eave
    for (let x = -A + 0.25; x < A - 0.1; x += 0.46) { const [zz, yy] = at(s, 0.94, -0.07); const rf = G.beam(0.06, 0.07, 0.3, 0.01); rf.rotateX(s * ang); rf.translate(x, yy, zz); B.add(rf, T.tar); }
  }
  // the ridge: two boards meeting over it, a log on top, rope lashings
  for (const s of [-1, 1]) { const rb = G.box(2 * A + 0.08, 0.035, 0.3, 0); rb.rotateX(s * ang); rb.translate(0, yR + 0.07, s * 0.12); B.add(rb, '#6a6c6e'); }
  { const lg = G.cyl(0.075, 0.075, 2 * A + 0.14, 8); lg.rotateZ(PI / 2); lg.translate(0, yR + 0.14, 0); B.add(lg, T.driftDk); }
  for (let i = 0; i < 4; i++) { const x = -A + 0.3 + i * (2 * A - 0.6) / 3, rp = G.torus(0.085, 0.016, 4, 10); rp.rotateY(PI / 2); rp.translate(x, yR + 0.14, 0); B.add(rp, T.rope); }
  if (gable) for (const sx of [-1, 1]) {
    // boarded gable infill (vertical boards to the roof line)
    const hw = d / 2, nb = Math.max(4, Math.round(d / 0.2)), gb = d / nb;
    for (let k = 0; k < nb; k++) {
      const z = -hw + (k + 0.5) * gb, hk = H * (1 - Math.abs(z) / hw) - 0.02; if (hk < 0.06) continue;
      const g = G.box(0.03, hk, gb - 0.01, 0); g.translate(sx * (w / 2 + 0.005), y0 + hk / 2, z);
      B.add(g, shade(gableColor, 0.9 + 0.15 * hz(k + sx * 5 + seed)));
    }
    // bargeboards along both slopes, the gegyo hanging at the apex
    for (const s of [-1, 1]) B.add(bar(V(sx * (A + 0.01), yE - 0.02, s * (Z + 0.02)), V(sx * (A + 0.01), yR + 0.06, 0), 0.085, 0.015), T.tar);
    if (gegyo) B.at([sx * (A + 0.04), yR - 0.12, 0], sx * PI / 2, () => {
      const sh = shp(); sh.moveTo(0, 0.1); sh.lineTo(0.13, 0.04); sh.quadraticCurveTo(0.09, -0.12, 0.2, -0.3); sh.lineTo(0, -0.2); sh.lineTo(-0.2, -0.3); sh.quadraticCurveTo(-0.09, -0.12, -0.13, 0.04); sh.closePath();
      const g = shapeGeo([sh], 0.035, 0.008, 4); B.add(g, T.tar);
      const eye = G.sph(0.03, 6, 4); eye.translate(0, -0.02, 0.05); B.add(eye, T.gold);
    });
  }
  return { ridgeY: yR + 0.2, yE, Z, A };
}
/** a brass-rimmed porthole window (local face frame, centred) */
function porthole(B, r = 0.24) {
  const back = G.disc(r * 0.98, 16); back.translate(0, 0, 0.05); B.glow(back, '#bfe4ee', { tint: 0.35 });
  const hl = G.disc(r * 0.35, 8); hl.scale(1, 0.6, 1); hl.translate(-r * 0.35, r * 0.35, 0.052); B.add(hl, '#f4fcff');
  const ring = G.torus(r, 0.055, 6, 18); ring.translate(0, 0, 0.06); B.add(ring, T.brass);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rv = G.sph(0.018, 5, 3); rv.translate(Math.cos(a) * r, Math.sin(a) * r, 0.11); B.add(rv, '#8a6a34'); }
}
/** a ship's wheel on the wall (local face frame, centred) */
function shipWheel(B, r = 0.34) {
  const rim = G.torus(r, 0.03, 5, 20); rim.translate(0, 0, 0.08); B.add(rim, '#9a6a44');
  const rim2 = G.torus(r * 0.55, 0.02, 4, 14); rim2.translate(0, 0, 0.08); B.add(rim2, '#9a6a44');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, sp = G.box(0.03, r * 1.32, 0.03, 0); sp.translate(0, r * 0.66, 0); sp.rotateZ(a); sp.translate(0, 0, 0.08); B.add(sp, '#b07a4c');
    const hd = G.cyl(0.028, 0.02, 0.12, 6); hd.translate(0, r + 0.1, 0); hd.rotateZ(a); hd.translate(0, 0, 0.08); B.add(hd, '#b07a4c');
  }
  const hub = G.cyl(0.07, 0.07, 0.08, 10); hub.rotateX(PI / 2); hub.translate(0, 0, 0.1); B.add(hub, T.brass);
}
/** a red-and-white life ring (local face frame) */
function lifeRing(B, r = 0.22) {
  const g = G.torus(r, r * 0.3, 8, 20); g.translate(0, 0, r * 0.32);
  B.add(g, (p, n, o) => o.set(Math.floor(((Math.atan2(p.y, p.x) / TAU + 1.125) % 1) * 4) % 2 ? '#fff6ea' : T.red));
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4, t = G.torus(r * 0.33, 0.012, 3, 8); t.rotateY(PI / 2); t.rotateZ(a); t.translate(Math.cos(a) * r, Math.sin(a) * r, r * 0.32); B.add(t, T.rope); }
}
/** round floats / buoys hanging on a wall by a cord (local face frame, cord top at the origin) */
function buoys(B, n = 3, { colors = [T.red, '#fff6ea', T.coral] } = {}) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.24, y = -0.22 - (i % 2) * 0.12, r = 0.1 + (i % 2) * 0.02;
    const b = G.sph(r, 10, 7); b.scale(1, 1.15, 1); b.translate(x, y, r + 0.03); const c = colors[i % colors.length];
    B.add(b, (p, nn, o) => o.set(Math.abs(p.y - y) < r * 0.28 ? '#fff6ea' : c));
    const cd = G.box(0.01, -y - r, 0.01, 0); cd.translate(x, (y + r) / 2 - 0.02, r + 0.03); B.add(cd, T.rope);
  }
}
/** a coil of rope lying on the ground (centre at the origin) */
function ropeCoil(B, r = 0.24, n = 4) { for (let k = 0; k < n; k++) { const t = G.torus(r - k * 0.035, 0.028, 5, 14); t.rotateX(PI / 2); t.translate(0, 0.03 + k * 0.042, 0); B.add(t, k % 2 ? T.rope : shade(T.rope, 0.9)); } }
/** a domed bamboo crab / octopus pot */
function crabPot(B, r = 0.22) {
  const cage = G.cyl(r * 0.85, r, r * 1.1, 10, true); cage.translate(0, r * 0.55, 0);
  B.add(cage, (p, n, o) => o.set('#b89a5a').multiplyScalar(Math.abs(Math.sin(Math.atan2(p.z, p.x) * 6)) < 0.3 || Math.abs(Math.sin(p.y * 40)) < 0.25 ? 0.62 : 1));
  const top = G.sph(r * 0.86, 10, 5, 0); top.scale(1, 0.55, 1); top.translate(0, r * 1.1, 0); B.add(top, (p, n, o) => o.set('#a8884a').multiplyScalar(Math.abs(Math.sin(Math.atan2(p.z, p.x) * 6)) < 0.3 ? 0.65 : 1));
  const mouth = G.torus(r * 0.3, 0.02, 4, 10); mouth.rotateX(PI / 2); mouth.translate(0, r * 1.52, 0); B.add(mouth, '#7a5e34');
}
/** a shallow fish box (tro-bako), optionally stacked */
function fishBox(B, { w = 0.56, d = 0.36, h = 0.13, wood = '#c8a878', n = 1, fill = null } = {}) {
  for (let k = 0; k < n; k++) B.at([0, k * h, 0], (k % 2) * 0.08 - 0.04, () => {
    const bt = G.box(w, 0.02, d, 0); bt.translate(0, 0.01, 0); B.add(bt, shade(wood, 0.8));
    for (const s of [-1, 1]) { const a = G.box(w, h, 0.022, 0); a.translate(0, h / 2, s * (d / 2 - 0.011)); B.add(a, wood); const b2 = G.box(0.022, h, d - 0.04, 0); b2.translate(s * (w / 2 - 0.011), h / 2, 0); B.add(b2, shade(wood, 0.92)); }
    const st = G.box(0.12, 0.04, 0.005, 0); st.translate(0, h * 0.55, d / 2 + 0.002); B.add(st, T.red);
  });
  if (fill) B.at([0, (n - 1) * h + 0.03, 0], 0, () => fill(B));
}
const FISH = {
  saba: { L: 0.34, back: '#2e6a7a', belly: '#e8eef0', stripe: '#1c3644', deep: 0.18 },
  aji: { L: 0.26, back: '#7e98a4', belly: '#f0f2f0', stripe: null, deep: 0.2, gold: true },
  tai: { L: 0.32, back: '#e8606a', belly: '#f8d0c8', stripe: null, deep: 0.3 },
  hirame: { L: 0.36, back: '#8a7258', belly: '#f4ecdc', stripe: null, deep: 0.42 },
  sanma: { L: 0.36, back: '#3a5a78', belly: '#e8eef4', stripe: null, deep: 0.11 },
};
/** a fish lying on its side along local x (head at +x), resting on y = 0 */
function fish(B, kind = 'saba', s = 1) {
  const F = FISH[kind] || FISH.saba, L = F.L * s, R = L * F.deep;
  const body = G.sph(0.5, 9, 6); body.scale(L * 0.82, R * 0.42, R); body.translate(L * 0.04, R * 0.38, 0);
  const back = new THREE.Color(F.back), belly = new THREE.Color(F.belly), str = F.stripe && new THREE.Color(F.stripe);
  B.add(body, (p, n, o) => {
    const k = clamp(0.5 + p.z / (R * 0.9)); o.copy(belly).lerp(back, k * k);
    if (str && k > 0.55 && Math.sin(p.x * 70 + Math.sin(p.z * 60) * 2) > 0.55) o.lerp(str, 0.7);
    if (F.gold && Math.abs(p.z) < R * 0.12) o.lerp(new THREE.Color('#e8c860'), 0.5);
    if (n.y > 0.6) o.lerp(new THREE.Color('#ffffff'), 0.18);
  });
  const tail = new THREE.ShapeGeometry(poly([[0, 0], [-R * 1.3, R * 1.1], [-R * 0.95, 0], [-R * 1.3, -R * 1.1]]));
  tail.rotateX(-PI / 2); tail.translate(-L * 0.36, R * 0.3, 0); B.add(tail.index ? tail.toNonIndexed() : tail, F.back);
  const fin = new THREE.ShapeGeometry(poly([[0, 0], [-L * 0.3, 0], [-L * 0.2, R * 0.55]])); fin.rotateX(-PI / 2); fin.translate(L * 0.12, R * 0.2, R * 0.75); B.add(fin.index ? fin.toNonIndexed() : fin, shade(F.back, 0.8));
  const eye = G.sph(R * 0.17, 6, 4); eye.translate(L * 0.34, R * 0.62, R * 0.18); B.add(eye, '#1a1a22');
}
/** a squid (ika) lying flat, mantle along +x */
function squid(B, s = 1) {
  const m = G.sph(0.5, 8, 6); m.scale(0.3 * s, 0.05 * s, 0.09 * s); m.translate(0.04 * s, 0.05 * s, 0); B.add(m, (p, n, o) => o.set('#f4e8ec').lerp(new THREE.Color('#e8a8b4'), clamp(nz(p.x * 40, p.z * 40) + 0.2) * 0.5));
  const fin = G.cyl(0.07 * s, 0.07 * s, 0.01, 3); fin.rotateY(PI / 6); fin.scale(1, 1, 1.3); fin.translate(0.17 * s, 0.05 * s, 0); B.add(fin, '#f0dce2');
  for (let k = 0; k < 6; k++) { const t = G.cyl(0.008 * s, 0.004 * s, 0.14 * s, 3); t.rotateZ(PI / 2); t.rotateY((k - 2.5) * 0.12); t.translate(-0.17 * s, 0.03 * s, (k - 2.5) * 0.018 * s); B.add(t, '#f0d8de'); }
  const eye = G.sph(0.012 * s, 4, 3); eye.translate(-0.08 * s, 0.07 * s, 0.03 * s); B.add(eye, '#2a2a30');
}
/** an octopus (tako) heaped on the ice, legs curling out */
function octopus(B, s = 1) {
  const h = G.sph(0.08 * s, 9, 6); h.scale(1.1, 0.85, 1); h.translate(0, 0.085 * s, 0); B.add(h, (p, n, o) => o.set('#c83a4a').lerp(new THREE.Color('#f08a8a'), clamp(n.y) * 0.35));
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU, pts = [];
    for (let j = 0; j <= 5; j++) { const t = j / 5, r = (0.05 + t * 0.15) * s, aa = a + t * 0.9; pts.push({ p: V(Math.cos(aa) * r, 0.025 * s * (1 - t * 0.6), Math.sin(aa) * r), r: 0.022 * s * (1 - t * 0.75) }); }
    B.add(tube(pts, 4, false), (p, n, o) => o.set('#d04a58').lerp(new THREE.Color('#f8c8c8'), n.y < 0 ? 0.6 : 0));
  }
  for (const s2 of [-1, 1]) { const e = G.sph(0.014 * s, 5, 3); e.translate(0.07 * s, 0.11 * s, s2 * 0.03 * s); B.add(e, '#ffe8a0'); }
}
/** a red crab */
function crab(B, s = 1) {
  const sh = G.sph(0.07 * s, 8, 5); sh.scale(1.3, 0.5, 1); sh.translate(0, 0.04 * s, 0); B.add(sh, (p, n, o) => o.set('#e85a3a').lerp(new THREE.Color('#ffb070'), clamp(n.y) * 0.3));
  for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) { const l = G.cyl(0.008 * s, 0.006 * s, 0.1 * s, 3); l.rotateX(sz * 1.1); l.rotateY((k - 1) * 0.5); l.translate((k - 1) * 0.04 * s, 0.02 * s, sz * 0.08 * s); B.add(l, '#d84a2a'); }
  for (const sz of [-1, 1]) { const cl = G.sph(0.025 * s, 6, 4); cl.scale(1.4, 0.8, 1); cl.translate(0.1 * s, 0.035 * s, sz * 0.05 * s); B.add(cl, '#f06a40'); }
}
/** a bed of crushed ice in a w × d tray (top at y ≈ 0.05) */
function iceBed(B, w, d) {
  const g = G.box(w, 0.05, d, 0); g.translate(0, 0.025, 0); B.add(g, (p, n, o) => o.set(T.ice).lerp(new THREE.Color(T.iceDk), clamp(0.5 - n.y)));
  const rr = mulberry32(Math.round(w * 97 + d * 31));
  for (let i = 0; i < Math.round(w * d * 60); i++) { const c = G.ico(0.03 + rr() * 0.025, 0); c.translate((rr() - 0.5) * (w - 0.06), 0.05, (rr() - 0.5) * (d - 0.06)); B.add(c, rr() < 0.5 ? '#f4fcff' : '#cfeaf4'); }
}
/** a little price tag (fuda) on a stick */
function priceTag(B, color = '#fff8ee') {
  const st = G.box(0.012, 0.16, 0.012, 0); st.translate(0, 0.08, 0); B.add(st, '#c8a878');
  const tg = G.box(0.1, 0.07, 0.012, 0); tg.translate(0, 0.17, 0); B.add(tg, color);
  const ink = G.box(0.012, 0.045, 0.004, 0); ink.translate(0.012, 0.17, 0.008); B.add(ink, '#2a2028');
  const ink2 = G.box(0.03, 0.012, 0.004, 0); ink2.translate(-0.025, 0.185, 0.008); B.add(ink2, T.red);
}
/** the "big catch" flag (tairyō-bata): a bold banner on a bamboo pole (base at the origin) */
function tairyoFlag(B, { h = 3.0, w = 1.0, fh = 0.62, seed = 0 } = {}) {
  const p = G.cyl(0.03, 0.04, h, 6); p.translate(0, h / 2, 0); B.add(p, '#c8b070');
  const tip = G.sph(0.05, 6, 4); tip.translate(0, h + 0.02, 0); B.add(tip, T.gold);
  const top = h - 0.06, bot = top - fh, cl = { x0: 0, x1: w, yTop: top, yBot: bot };
  const bands = seed % 2 ? ['#e8403a', '#fff6ea', '#2c6ab8', '#fff6ea', '#f4c040'] : ['#2c6ab8', '#fff6ea', '#e8403a', '#f4c040', '#3aa66a'];
  for (let i = 0; i < 5; i++) { const g = G.plane(w, fh / 5 + 0.002, 4, 1); g.translate(0.03 + w / 2, top - (i + 0.5) * fh / 5, 0); B.cloth(g, bands[i], cl); }
  const sun = G.disc(fh * 0.28, 16); sun.translate(0.03 + w * 0.32, top - fh * 0.5, 0.006); B.cloth(sun, '#e8403a', cl);
  const sun2 = G.disc(fh * 0.28, 16); sun2.rotateY(PI); sun2.translate(0.03 + w * 0.32, top - fh * 0.5, -0.006); B.cloth(sun2, '#e8403a', cl);
  const crane = new THREE.ShapeGeometry(poly([[0, 0], [0.18, 0.05], [0.34, 0.12], [0.2, 0.0], [0.34, -0.1], [0.16, -0.04]]), 2); crane.scale(fh * 0.9, fh * 0.9, 1); crane.translate(0.03 + w * 0.6, top - fh * 0.5, 0.008); B.cloth(crane.index ? crane.toNonIndexed() : crane, '#fff6ea', cl);
  const base = G.cyl(0.12, 0.15, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, STONES[1]);
}

// ------------------------------------------------------------------ hulls
/** A wooden fishing-boat hull (wasen) along local x, bow at +x, keel at y = 0: lofted U sections under a sheer that sweeps
 *  up to a tall bow, a flat transom at the stern. frac (0..1) keeps only the lower strakes (a hull still being planked).
 *  Adds the hull to B (outer paint: antifouling red under the waterline wl, then `color`, a `trim` band at the sheer);
 *  → { sheerAt(t) → [x, y, halfBeam] } */
function hull(B, { L = 3.2, beam = 1.1, depth = 0.5, rise = 0.34, color = '#f2ece0', trim = '#2c6ab8', wl = 0.17, frac = 1, wood = '#c99f6e', inner = true } = {}) {
  const N = 22, M = 10, phiMax = PI / 2 * frac;
  const bAt = t => beam / 2 * (t < 0.42 ? 0.66 + 0.34 * Math.sin(t / 0.42 * PI / 2) : Math.pow(Math.max(0, Math.cos((t - 0.42) / 0.58 * PI / 2)), 0.75));
  const kAt = t => (t > 0.72 ? Math.pow((t - 0.72) / 0.28, 2) * depth * 0.7 : 0);
  const sAt = t => depth + rise * Math.pow(t, 2.6) + 0.07 * Math.pow(1 - t, 2);
  const P = (t, phi, k = 1) => { const b = bAt(t) * k, ky = kAt(t) + (1 - k) * 0.04, sy = sAt(t); return V((t - 0.5) * L, ky + (sy - ky) * (1 - Math.cos(phi)), b * Math.sin(phi)); };
  const loft = (k, flip) => {
    const pos = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) { const p = P(i / N, -phiMax + 2 * phiMax * j / M, k); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const cw = new THREE.Color(color), ct = new THREE.Color(trim), cr = new THREE.Color('#b8423a');
  B.add(loft(1, false), (p, n, o) => {
    const t = p.x / L + 0.5, sy = sAt(clamp(t)), strake = Math.floor((p.y + 0.02) / 0.1);
    if (p.y < wl) o.copy(cr); else if (p.y > sy - 0.1) o.copy(ct); else o.copy(cw);
    if (Math.abs(p.y - wl) < 0.014) o.set('#fff6ea');
    o.multiplyScalar(0.9 + 0.1 * (strake % 2));
    if (p.y > wl && nz(p.x * 6, p.y * 9) > 0.45) o.lerp(new THREE.Color('#c8c4bc'), 0.3);
  });
  if (inner) B.add(loft(0.93, true), (p, n, o) => o.set(wood).multiplyScalar(Math.abs(Math.sin(p.x * 24 / L)) < 0.1 ? 0.72 : 0.94 + 0.06 * Math.sin(p.y * 40)));
  // the transom, the gunwale caps, the stem post and the keel
  if (frac >= 1) {
    const tp = []; for (let j = 0; j <= M; j++) { const p = P(0, -phiMax + 2 * phiMax * j / M); tp.push(p); }
    const pos = []; const c = V(-L / 2, (kAt(0) + sAt(0)) / 2 + 0.05, 0);
    for (let j = 0; j < M; j++) pos.push(c.x, c.y, c.z, tp[j + 1].x, tp[j + 1].y, tp[j + 1].z, tp[j].x, tp[j].y, tp[j].z);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.computeVertexNormals();
    B.add(tg, (p, n, o) => o.set(p.y < wl ? '#b8423a' : p.y > sAt(0) - 0.1 ? trim : color));
    const tpb = tg.clone(); tpb.translate(0.03, 0, 0); const pa = tpb.attributes.position; for (let i = 0; i < pa.count; i += 3) { const x = pa.getX(i + 1), y = pa.getY(i + 1), z = pa.getZ(i + 1); pa.setXYZ(i + 1, pa.getX(i + 2), pa.getY(i + 2), pa.getZ(i + 2)); pa.setXYZ(i + 2, x, y, z); } tpb.computeVertexNormals(); B.add(tpb, wood);
    for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, p = P(t, s * phiMax, 0.985); pts.push({ p: p.add(V(0, 0.015, 0)), r: 0.032 }); } B.add(tube(pts, 5, false), '#8a6a4a'); }
    const st = []; for (let i = 0; i <= 6; i++) { const t = 0.72 + 0.28 * i / 6, p = P(t, 0); st.push({ p: p.clone().add(V(0.02, 0, 0)), r: 0.04 }); } st.push({ p: V(L / 2 + 0.06, sAt(1) + 0.16, 0), r: 0.032 }); B.add(tube(st, 5, false), '#8a6a4a');
  }
  const kl = []; for (let i = 0; i <= 8; i++) { const t = i / 8 * 0.74; kl.push({ p: P(t, 0).add(V(0, -0.025, 0)), r: 0.04 }); } B.add(tube(kl, 5, false), '#6a4e3a');
  return { sheerAt: t => { const p = P(t, phiMax); return [p.x, p.y, Math.abs(p.z)]; }, P, sAt, bAt };
}
/** the ribs of a hull being built, from the planking up to the sheer (frac: where the planks stop) */
function hullRibs(B, H, { L = 3.2, from = 0.2, to = 1, n = 9, frac = 0.55, color = '#d8b088' } = {}) {
  for (let k = 0; k < n; k++) {
    const t = from + (to - from) * k / (n - 1), pts = [];
    for (let j = 0; j <= 10; j++) { const phi = -PI / 2 + PI * j / 10; pts.push({ p: H.P(t, phi, 0.995), r: 0.022 }); }
    B.add(tube(pts, 4, false), color);
  }
  void L; void frac;
}

// ------------------------------------------------------------------ stilts
/** Piles under a raised floor: round posts from the sea bed (yBot) up to the floor beams (yTop), green-black and
 *  barnacled below the tide line (tide), X braces lashed between neighbours round the outside of the xs × zs grid. */
function stilts(B, xs, zs, yTop, { yBot = -1.9, tide = -0.6, r = 0.085 } = {}) {
  const wet = new THREE.Color('#2e3a36'), barn = new THREE.Color('#e8e2d4'), wood = new THREE.Color(T.pile);
  for (const x of xs) for (const z of zs) {
    const g = G.cyl(r, r * 1.12, yTop - yBot, 7); g.translate(x, (yTop + yBot) / 2, z);
    B.add(g, (p, n, o) => { o.copy(wood).multiplyScalar(0.86 + 0.14 * Math.sin(p.y * 9 + x * 5) ** 2); const k = clamp((tide - p.y) * 3); if (k > 0) { o.lerp(wet, k * 0.85); if (p.y > tide - 0.35 && nz(p.y * 14 + x * 3, Math.atan2(p.z - z, p.x - x) * 2) > 0.2) o.lerp(barn, 0.75); } });
  }
  const brace = (a, b) => B.add(bar(a, b, 0.055, 0.008), T.pile);
  const ya = Math.max(yBot + 0.5, tide - 0.2), yb = yTop - 0.15;
  for (let i = 0; i < xs.length - 1; i++) for (const z of [zs[0], zs[zs.length - 1]]) { const x0 = xs[i], x1 = xs[i + 1]; brace(V(x0, ya, z), V(x1, yb, z)); brace(V(x1, ya, z), V(x0, yb, z)); }
  for (let j = 0; j < zs.length - 1; j++) for (const x of [xs[0], xs[xs.length - 1]]) { const z0 = zs[j], z1 = zs[j + 1]; brace(V(x, ya, z0), V(x, yb, z1)); brace(V(x, ya, z1), V(x, yb, z0)); }
  // beams on top of the piles
  for (const z of zs) { const bm = G.beam(Math.abs(xs[xs.length - 1] - xs[0]) + 0.3, 0.12, 0.12, 0.02); bm.translate((xs[0] + xs[xs.length - 1]) / 2, yTop - 0.06, z); B.add(bm, T.tar); }
}
/** a plank deck (local x × z rect, top at y): boards across x, edge beams */
function deck(B, x0, x1, z0, z1, y, { wood = '#a89480', along = 'x' } = {}) {
  const w = x1 - x0, d = z1 - z0, n = Math.max(2, Math.round((along === 'x' ? d : w) / 0.17));
  for (let i = 0; i < n; i++) {
    const k = hz(i * 3.1 + x0 * 7), c = shade(wood, 0.88 + 0.18 * k);
    const g = along === 'x' ? G.box(w + (hz(i) - 0.5) * 0.04, 0.05, d / n - 0.014, 0) : G.box(w / n - 0.014, 0.05, d + (hz(i) - 0.5) * 0.04, 0);
    if (along === 'x') g.translate((x0 + x1) / 2, y - 0.025, z0 + (i + 0.5) * d / n); else g.translate(x0 + (i + 0.5) * w / n, y - 0.025, (z0 + z1) / 2);
    B.add(g, c);
  }
  for (const z of [z0, z1]) { const e = G.beam(w + 0.04, 0.1, 0.07, 0.012); e.translate((x0 + x1) / 2, y - 0.09, z); B.add(e, T.tar); }
  for (const x of [x0, x1]) { const e = G.beam(0.07, 0.1, d, 0.012); e.translate(x, y - 0.09, (z0 + z1) / 2); B.add(e, T.tar); }
}
/** a railing from a to b ([x, z]) at deck height y: posts, a top rail and a rope below */
function railing(B, a, b, y, { h = 0.62, color = T.innFrame, every = 0.62 } = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / every));
  for (let i = 0; i <= n; i++) { const t = i / n, x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), p = G.beam(0.06, h, 0.06, 0.01); p.translate(x, y + h / 2, z); B.add(p, color); }
  B.add(bar(V(a[0], y + h, a[1]), V(b[0], y + h, b[1]), 0.07, 0.012), color);
  B.add(bar(V(a[0], y + h * 0.45, a[1]), V(b[0], y + h * 0.45, b[1]), 0.035, 0.008), shade(color, 1.2));
}

// ------------------------------------------------------------------ Captain Kaizo's Lookout (望楼)
/** the old captain's board house under blue tiles, portholes and a ship's wheel on the front, a deck with his bench;
 *  behind its right side the watchtower (a boarded store at its foot, a ladder, the railed platform with the brass
 *  telescope and the alarm bell under a little tiled hip, a pennant streaming in the sea wind) rises over the roof */
export function elder(B) {
  const w = 3.4, d = 2.5, h = 1.6, y0 = 0.3, zc = -0.35, F = zc + d / 2;
  const tw = 1.3, p2 = tw / 2, tx = 1.25, tz = zc - d / 2 - p2 - 0.06, Ht = 3.55, Hr = Ht + 1.0; // the watchtower: centre, platform, roof plate
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  boardWalls(B, { w, d, h, y0, color: T.board, seed: 3 });
  const blk = { w, d };
  onFace(B, blk, 'f', 0.3, y0, () => door(B, { w: 0.95, h: 1.34, style: 'wood', frame: T.tar, wood: '#a07e5e' }));
  onFace(B, blk, 'f', 1.25, y0 + 0.92, () => porthole(B, 0.24));
  onFace(B, blk, 'f', -1.05, y0 + 0.88, () => shipWheel(B, 0.38));
  onFace(B, blk, 'l', 0.15, y0 + 0.92, () => porthole(B, 0.24));
  onFace(B, blk, 'l', -0.65, y0 + 1.32, () => buoys(B, 3));
  onFace(B, blk, 'r', 0.55, y0 + 1.2, () => lifeRing(B, 0.2));
  onFace(B, blk, 'b', -0.6, y0 + 0.92, () => porthole(B, 0.22));
  // the captain's name board by the door: a tall plank with the anchor crest and two ink strokes
  onFace(B, blk, 'f', -0.43, y0 + 0.86, () => {
    const bd = G.box(0.27, 0.82, 0.04, 0.012); bd.translate(0, 0, 0.06); B.add(bd, '#efe6d2'); const fr = G.box(0.32, 0.87, 0.03, 0.01); fr.translate(0, 0, 0.045); B.add(fr, T.tar);
    B.at([0, 0.2, 0.085], 0, () => sym3(B, 'anchor', 0.24, T.navy, 0.012));
    for (const [y, hh] of [[-0.08, 0.14], [-0.27, 0.16]]) { const ink = G.box(0.035, hh, 0.006, 0); ink.translate(0, y, 0.083); B.add(ink, '#2a2028'); const cr = G.box(0.12, 0.025, 0.006, 0); cr.translate(0, y + hh * 0.3, 0.084); B.add(cr, '#2a2028'); }
  });
  const R = roof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.5, gOver: 0.28, H: 1.3, tg: 0.56, curve: 0.38, lift: 0.24, liftW: 0.8, thick: 0.15, ribW: 0.25, color: T.tile, moss: 0.04, gable: 'wood', gableWood: T.board, timber: T.tar, rich: 1, oni: true });
  const lampY = x => R.underAt(x, d / 2 + 0.34) - 0.03;
  B.pop();
  // the front deck (planks on short posts) with a stoop stone, the captain's bench and his tea things
  deck(B, -w / 2 - 0.05, w / 2 + 0.05, F, F + 0.7, y0 + 0.02, { wood: '#a8947c' });
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) { const l = G.beam(0.09, y0, 0.09, 0.01); l.translate(x, y0 / 2 - 0.02, F + 0.62); B.add(l, T.tar); }
  { const st = puff(V(0, 0, 0), 0.3, { detail: 1, noise: 0.2, squash: 0.35, seed: 5 }); st.scale(1.5, 1, 0.9); st.translate(0.3, 0.08, F + 0.95); B.add(st, STONES[0]); }
  B.at([-1.15, y0 + 0.02, F + 0.36], 0, () => { const bn = G.box(0.9, 0.06, 0.32, 0.02); bn.translate(0, 0.32, 0); B.add(bn, T.drift); for (const s of [-1, 1]) { const l = G.box(0.06, 0.32, 0.28, 0.01); l.translate(s * 0.36, 0.16, 0); B.add(l, T.driftDk); } });
  // the watchtower behind the house's right side (its front, with the ladder and the store's door, faces +x)
  B.at([tx, 0, tz], PI / 2, () => {
    const ft = G.box(tw + 0.2, 0.22, tw + 0.2, 0.04); ft.translate(0, 0.11, 0); B.add(ft, { grad: [shade(T.stone, 0.85), T.stone] });
    boardWalls(B, { w: tw, d: tw, h: 1.45, y0: 0.22, color: T.boardDk, seed: 9 });
    onFace(B, { w: tw, d: tw }, 'f', 0, 0.22, () => door(B, { w: 0.6, h: 1.16, style: 'wood', frame: T.tar, wood: '#8a7058' }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.cyl(0.07, 0.08, Hr - 0.1, 7); p.translate(sx * p2, (Hr - 0.1) / 2 + 0.1, sz * p2); B.add(p, T.pile); }
    const brace = (a, b) => B.add(bar(a, b, 0.05, 0.008), '#7a6a5c');
    for (const [ax, az, bx, bz] of [[-p2, p2, p2, p2], [-p2, -p2, p2, -p2], [p2, -p2, p2, p2], [-p2, -p2, -p2, p2]]) { brace(V(ax, 1.72, az), V(bx, Ht - 0.12, bz)); brace(V(bx, 1.72, bz), V(ax, Ht - 0.12, az)); }
    for (const y of [1.7, Ht - 0.1]) { for (const sz of [-1, 1]) { const g = G.box(tw + 0.12, 0.08, 0.08, 0); g.translate(0, y, sz * p2); B.add(g, T.tar); } for (const sx of [-1, 1]) { const g = G.box(0.08, 0.08, tw, 0); g.translate(sx * p2, y, 0); B.add(g, T.tar); } }
    // the ladder up its front
    for (const sx of [-1, 1]) B.add(bar(V(sx * 0.2, 0.0, p2 + 0.42), V(sx * 0.2, Ht + 0.5, p2 + 0.08), 0.045, 0.008), '#9a8068');
    for (let k = 1; k < 14; k++) { const t = k / 14, r = G.cyl(0.018, 0.018, 0.42, 5); r.rotateZ(PI / 2); r.translate(0, t * (Ht + 0.5), p2 + 0.42 - t * 0.34); B.add(r, '#b09478'); }
    // the platform, its railing (open at the ladder), the bell
    deck(B, -p2 - 0.28, p2 + 0.28, -p2 - 0.28, p2 + 0.28, Ht, { wood: '#a89070' });
    const e = p2 + 0.25;
    for (const [a, b] of [[[-e, -e], [e, -e]], [[-e, -e], [-e, e]], [[e, -e], [e, e]], [[-e, e], [-0.26, e]], [[0.26, e], [e, e]]]) railing(B, a, b, Ht, { h: 0.55, color: '#6a5a50', every: 0.5 });
    B.at([-0.32, Hr - 0.26, -0.3], 0, () => { const cb = G.box(0.05, 0.22, 0.05, 0); cb.translate(0, 0.11, 0); B.add(cb, C.iron); bell(B, { r: 0.13, color: T.brass }); });
    roof(B, { type: 'hip', w: tw + 0.1, d: tw + 0.1, y0: Hr, over: 0.42, H: 0.72, curve: 0.36, lift: 0.22, liftW: 0.5, thick: 0.12, ribW: 0.24, color: T.tile, rich: 1, oni: false });
    // the flagpole and a long pennant streaming in the sea wind
    const fp = G.cyl(0.025, 0.03, 1.3, 6); fp.translate(0, Hr + 1.35, 0); B.add(fp, '#e8e0d0');
    const pn = new THREE.ShapeGeometry(poly([[0, 0], [1.1, -0.1], [0, -0.28]]), 1); pn.translate(0.03, Hr + 1.95, 0);
    B.cloth(pn.index ? pn.toNonIndexed() : pn, (p, n, o) => o.set(p.y > Hr + 1.95 - 0.14 ? T.red : '#fff6ea'), { x0: 0, x1: 1.15, yTop: Hr + 1.95, yBot: Hr + 1.65 });
    // a net hung on the back braces, crab pots at its foot
    B.at([-p2 - 0.01, 0, 0], -PI / 2, () => net(B, { w: 1.1, h: 0.8, yTop: 2.7, color: T.net }));
    B.at([p2 + 0.35, 0, -0.55], 0.3, () => { crabPot(B, 0.2); B.at([0, 0.33, 0], 0.4, () => crabPot(B, 0.17)); });
  });
  // the brass telescope on the platform, trained on the bay (local −x, out to sea)
  B.at([tx - 0.15, Ht, tz - 0.1], -2.1, () => {
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.add(bar(V(0, 0.82, 0), V(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28), 0.025, 0), '#4a3a30'); }
    const sc = G.cyl(0.045, 0.07, 0.85, 10); sc.rotateX(PI / 2 - 0.2); sc.translate(0, 0.92, 0.1); B.add(sc, T.brass);
    const ln = G.cyl(0.078, 0.078, 0.05, 10); ln.rotateX(PI / 2 - 0.2); ln.translate(0, 1.0, 0.5); B.add(ln, '#e8c86a');
  });
  B.at([w / 2 + 0.2, 0, F + 0.45], 0.4, () => crabPot(B, 0.2));
  B.at([w / 2 + 0.22, 0, zc - 0.35], 0, () => ropeCoil(B, 0.22));
  return {
    fp: [-w / 2 - 0.15, tz - p2 - 0.18, tx + p2 + 0.55, F + 0.72], door: [0.3, F + 1.25], keeper: [1.0, F + 1.2, 0], seat: [-1.15, F + 0.36, 0],
    lamps: [[-1.5, lampY(-1.5), F + 0.34], [1.5, lampY(1.5), F + 0.34]],
    siege(B) {
      onFaceAt(B, [0.3, y0 + 0.67, F], () => boards(B, 1.05, 1.36, { seed: 1 }));
      onFaceAt(B, [1.25, y0 + 0.92, F + 0.06], () => boards(B, 0.6, 0.6, { seed: 2 }));
      onFaceAt(B, [-1.0, y0, F + 0.04], () => soot(B, 1.0, 1.3, T.board, 3));
      B.at([tx + p2 + 0.01, 0.9, tz], PI / 2, () => boards(B, 0.7, 1.1, { seed: 4 }));
      B.at([tx + 0.25, Ht + 0.02, tz + 0.3], 0, () => warBanner(B, { h: 1.7, w: 0.42, seed: 61 }));
      B.at([-2.0, 0, F + 1.5], 0, () => debris(B, 0.8, { seed: 11, n: 5 }));
      B.at([1.6, 0, F + 1.4], 0.5, () => { const p = G.beam(0.9, 0.05, 0.1, 0.01); p.rotateZ(0.2); p.translate(0, 0.08, 0); B.add(p, '#6a5a50'); });
    },
    saved(B) {
      B.at([0.3, y0, F], 0, () => norenPart(B, { w: 0.92, h: 0.48, y: 1.32, z: 0.16, color: T.navy, strips: 2, symbol: () => symGeo('anchor'), symScale: 0.22 }));
      // signal flags strung from the tower's flagpole down to the house's eave corner
      signalFlags(B, [[tx, Hr + 1.9, tz], [0.2, y0 + h + 1.25, zc], [-w / 2 - 0.3, y0 + h - 0.15, F + 0.4]]);
      for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) B.at([x, y0 + 0.02, F + 0.45], 0, () => buoyPlanter(B, 0.15, x * 3));
      B.at([1.7, 0, F + 0.95], 0, () => { const t = G.box(0.4, 0.05, 0.28, 0.01); t.translate(0, 0.42, 0); B.add(t, '#a8845e'); for (const sx of [-1, 1]) { const l = G.box(0.04, 0.42, 0.24, 0); l.translate(sx * 0.17, 0.21, 0); B.add(l, '#7a5a42'); } const cup = G.cyl(0.04, 0.035, 0.06, 8); cup.translate(-0.08, 0.48, 0); B.add(cup, '#e8e0d0'); const pt = G.sph(0.06, 8, 6); pt.translate(0.08, 0.5, 0); B.add(pt, '#5a6a7a'); });
    },
  };
}
/** a face-frame helper for overlays that only need a position (no onFace block) */
function onFaceAt(B, p, fn) { B.at(p, 0, fn); }
/** a driftwood plank bench on two stones (seat top ≈ 0.42), along local x */
function driftBench(B, w = 1.0) {
  for (const s of [-1, 1]) { const st = puff(V(0, 0, 0), 0.2, { detail: 1, noise: 0.25, squash: 0.85, seed: 17 + s }); st.scale(0.9, 1.0, 0.8); st.translate(s * (w / 2 - 0.15), 0.17, 0); B.add(st, STONES[s > 0 ? 2 : 4]); }
  const top = G.box(w, 0.07, 0.34, 0.02); top.translate(0, 0.39, 0); B.add(top, (p, n, o) => o.set(T.drift).multiplyScalar(0.86 + 0.14 * Math.abs(Math.sin(p.x * 22 + p.z * 6))));
}
/** a cut-down buoy planted with flowers (saved village) */
function buoyPlanter(B, r = 0.16, seed = 0) {
  const b = G.sph(r, 10, 6, 0); b.scale(1, 0.9, 1); b.translate(0, r * 0.75, 0); B.add(b, (p, n, o) => o.set(Math.abs(p.y - r * 0.75) < r * 0.25 ? '#fff6ea' : T.red));
  flowerPot(B, { r: r * 0.8, seed: Math.round(seed) + 7, colors: ['#ff8fb0', '#ffffff', '#ffd24a'] });
}
/** nautical signal flags (square pennants) strung through points */
function signalFlags(B, pts) {
  const cols = [['#e8403a', '#fff6ea'], ['#2c6ab8', '#fff6ea'], ['#f4c040', '#2c6ab8'], ['#fff6ea', '#e8403a'], ['#2c6ab8', '#f4c040'], ['#3aa66a', '#fff6ea']];
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(...pts[i]), b = V(...pts[i + 1]), L = a.distanceTo(b), sag = 0.18 * Math.min(1, L / 2);
    const P = t => V(lerp(a.x, b.x, t), lerp(a.y, b.y, t) - sag * 4 * t * (1 - t), lerp(a.z, b.z, t));
    const cp = []; for (let j = 0; j <= 10; j++) cp.push({ p: P(j / 10), r: 0.01 }); B.add(tube(cp, 3, false), '#4a3a36');
    const n = Math.max(2, Math.round(L / 0.3));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, p = P(t), tn = P(Math.min(1, t + 0.04)).sub(P(Math.max(0, t - 0.04))).normalize(), s = 0.13;
      const l = p.clone().addScaledVector(tn, -s * 0.5), r = p.clone().addScaledVector(tn, s * 0.5), bl = l.clone(), br = r.clone(); bl.y -= s * 1.2; br.y -= s * 1.2;
      const [c1, c2] = cols[k++ % cols.length], m = l.clone().lerp(bl, 0.5), mr = r.clone().lerp(br, 0.5);
      for (const [q, cc] of [[[l, m, r, m, mr, r], c1], [[m, bl, mr, bl, br, mr], c2]]) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(q.flatMap(v => [v.x, v.y, v.z]), 3)); g.computeVertexNormals();
        B.cloth(g, cc, { x0: -2, x1: 2, yTop: p.y, yBot: p.y - s * 1.2 });
      }
    }
  }
}

// ------------------------------------------------------------------ Shinju Inn (真珠屋): raised on stilts at the water's edge
export function inn(B) {
  const Y = 0.95, w = 3.3, d = 2.3, h = 1.42, zc = -0.62, F = zc + d / 2; // the floor on its stilts; the wall block
  const dx = w / 2 + 0.4, dz0 = zc - d / 2 - 0.32, dz1 = F + 0.82; // the veranda deck round the walls
  stilts(B, [-dx + 0.08, -0.62, 0.62, dx - 0.08], [dz1 - 0.08, (dz0 + dz1) / 2, dz0 + 0.08], Y - 0.06, { yBot: -2.2, tide: -0.76 });
  deck(B, -dx, dx, dz0, dz1, Y, { wood: '#b09c84' });
  railing(B, [-dx + 0.04, dz1 - 0.04], [-0.58, dz1 - 0.04], Y, { color: T.innFrame });
  railing(B, [0.58, dz1 - 0.04], [dx - 0.04, dz1 - 0.04], Y, { color: T.innFrame });
  for (const sx of [-1, 1]) railing(B, [sx * (dx - 0.04), dz1 - 0.04], [sx * (dx - 0.04), dz0 + 0.04], Y, { color: T.innFrame });
  railing(B, [-dx + 0.04, dz0 + 0.04], [dx - 0.04, dz0 + 0.04], Y, { color: T.innFrame });
  B.push([0, 0, zc]);
  walls(B, { w, d, h, y0: Y, plaster: T.plaster, frame: T.innFrame, koshi: T.innKoshi, koshiSkip: ['f'], koshiH: 0.4 });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, Y, () => door(B, { w: 1.0, h: 1.3, style: 'lattice', frame: T.innFrame, wood: '#b8a080' }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.14, Y + 0.78, () => shoji(B, { w: 0.66, h: 0.5, frame: T.innFrame, dress: 'sudare' }));
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, Y + 0.8, () => latticeWindow(B, { w: 0.72, h: 0.48, frame: T.innFrame }));
  onFace(B, blk, 'b', 0, Y + 0.8, () => shoji(B, { w: 0.9, h: 0.48, frame: T.innFrame }));
  const R1 = roof(B, { type: 'skirt', w, d, y0: Y + h, over: 0.5, H: 0.86, tTop: 0.44, color: T.tileTeal, ribW: 0.22, curve: 0.3, lift: 0.2, liftW: 0.6, moss: 0, thick: 0.12 });
  const uw = Math.min(2.45, R1.openW - 0.12), ud = Math.min(1.6, R1.openD - 0.1), uh = 1.02, uy = R1.topY;
  walls(B, { w: uw, d: ud, h: uh, y0: uy, plaster: T.plaster, frame: T.innFrame, rail: true });
  const ub = { w: uw, d: ud };
  for (const u of [-0.72, 0, 0.72]) onFace(B, ub, 'f', u, uy + 0.55, () => shoji(B, { w: 0.56, h: 0.46, frame: T.innFrame, dress: 'none' }));
  for (const side of ['l', 'r']) onFace(B, ub, side, 0, uy + 0.56, () => porthole(B, 0.19));
  const R2 = roof(B, { type: 'irimoya', w: uw, d: ud, y0: uy + uh, over: 0.48, gOver: 0.26, H: 1.08, tg: 0.55, curve: 0.42, lift: 0.3, liftW: 0.7, thick: 0.14, ribW: 0.24, color: T.tileTeal, gable: 'plaster', gableColor: T.plaster, timber: T.innFrame, rich: 2, oni: true });
  B.pop();
  // the stairs down from the veranda to the beach (they end below y = 0: the shore falls away here), a stone at the foot
  const sw = 1.06, nS = 8, run = 0.25, yF = -0.28, rise = (Y - yF) / nS;
  for (let i = 0; i < nS; i++) { const y = Y - (i + 1) * rise, z = dz1 + (i + 0.5) * run; const st = G.box(sw, 0.05, run + 0.02, 0); st.translate(0, y + 0.025 + rise * 0.0, z); B.add(st, shade('#b09c84', 0.92 + 0.08 * (i % 2))); }
  for (const sx of [-1, 1]) {
    B.add(bar(V(sx * (sw / 2 + 0.02), Y - 0.05, dz1), V(sx * (sw / 2 + 0.02), -0.6, dz1 + nS * run), 0.08, 0.012), T.tar);
    const pz = dz1 + nS * run - 0.05, py = Y - nS * rise; const p = G.beam(0.07, 0.95 - py * 0, 0.07, 0.01); p.translate(sx * (sw / 2 + 0.06), py + 0.47, pz); B.add(p, T.innFrame);
    B.add(tube([{ p: V(sx * (sw / 2 + 0.06), Y + 0.6, dz1), r: 0.018 }, { p: V(sx * (sw / 2 + 0.06), (Y + py) / 2 + 0.66, (dz1 + pz) / 2), r: 0.018 }, { p: V(sx * (sw / 2 + 0.06), py + 0.92, pz), r: 0.018 }], 4, false), T.rope);
  }
  { const st = puff(V(0, 0, 0), 0.34, { detail: 1, noise: 0.2, squash: 0.4, seed: 7 }); st.scale(1.7, 1, 1.0); st.translate(0, yF - 0.02, dz1 + nS * run + 0.28); B.add(st, STONES[0]); }
  // Okami Shinju's driftwood bench at the stair foot, where the beach comes up level with the square (her seat)
  B.at([1.45, 0, dz1 + nS * run + 0.65], 0, () => driftBench(B, 1.05));
  // the pearl sign hanging off the veranda corner, a rowboat tied under the back, a ladder down to it
  B.at([dx - 0.05, Y + 0.62, dz1 - 0.05], PI / 4, () => {
    const arm = G.box(0.04, 0.04, 0.6, 0); arm.translate(0, 0.62, 0.26); B.add(arm, T.innFrame);
    const ps = G.beam(0.06, 0.66, 0.06, 0.01); ps.translate(0, 0.31, 0); B.add(ps, T.innFrame);
    B.at([0, 0.3, 0.5], PI / 2, () => {
      const bd = G.cyl(0.27, 0.27, 0.05, 18); bd.rotateX(PI / 2); B.add(bd, '#f4ecdc'); const fr = G.torus(0.27, 0.03, 4, 18); B.add(fr, T.innFrame);
      for (const s of [0, PI]) B.at([0, 0, 0], s, () => B.at([0, 0, 0.03], 0, () => { sym3(B, 'pearl', 0.44, '#e8a8b8', 0.02); const pr = G.sph(0.06, 10, 7); pr.scale(1, 1, 0.6); pr.translate(0, 0, 0.05); B.glow(pr, '#fff8ff', { tint: 0.3 }); }));
      for (const s of [-1, 1]) { const ch = G.box(0.01, 0.1, 0.01, 0); ch.translate(0, 0.32, s * 0.15); B.add(ch, C.iron); }
    });
  });
  B.at([-1.3, -0.92, dz0 - 0.95], 0.12, () => dinghy(B, { L: 1.9, color: '#f0e8d8', trim: T.teal }));
  B.add(tube([{ p: V(-dx + 0.1, -0.35, dz0 + 0.1), r: 0.014 }, { p: V(-1.6, -0.72, dz0 - 0.5), r: 0.014 }, { p: V(-2.0, -0.78, dz0 - 0.9), r: 0.014 }], 3, false), T.rope);
  for (const sx of [-1, 1]) B.add(bar(V(-0.4 + sx * 0.18, Y, dz0 - 0.02), V(-0.4 + sx * 0.18, -1.0, dz0 - 0.32), 0.04, 0.006), '#9a8068');
  for (let k = 1; k < 8; k++) { const t = k / 8, y = Y - t * (Y + 1.0), z = dz0 - 0.02 - t * 0.3; const r = G.cyl(0.015, 0.015, 0.36, 4); r.rotateZ(PI / 2); r.translate(-0.4, y, z); B.add(r, '#b09478'); }
  // floats and a towel on the veranda rail, a water barrel
  B.at([-dx + 0.04, Y + 0.6, (dz0 + dz1) / 2], -PI / 2, () => glassFloats(B, { n: 3 }));
  B.at([dx - 0.35, Y, dz0 + 0.4], 0, () => barrel(B, { r: 0.17, h: 0.38, wood: '#8a7a68' }));
  void R2;
  const lampY = Y + h + 0.0;
  return {
    fp: [-dx - 0.1, dz0 - 0.1, dx + 0.1, dz1 + 0.9], door: [0, dz1 + nS * run + 0.35], keeper: [-1.0, dz1 + nS * run + 0.25, 0], seat: [1.45, dz1 + nS * run + 0.65, 0, 0.42],
    lamps: [[-0.95, lampY - 0.22, F + 0.4], [0.95, lampY - 0.22, F + 0.4]],
    siege(B) {
      B.at([0, Y + 0.65, F], 0, () => boards(B, 1.05, 1.3, { seed: 5 }));
      for (const s of [-1, 1]) B.at([s * 1.14, Y + 0.78, F + 0.1], 0, () => boards(B, 0.74, 0.58, { seed: 6 + s }));
      for (const u of [-0.72, 0.72]) B.at([u, uy + 0.55, zc + ud / 2], 0, () => boards(B, 0.6, 0.52, { seed: 9 + u * 4 }));
      B.at([-1.4, Y, F + 0.01], 0, () => soot(B, 0.7, 1.2, T.plaster, 7));
      // the stairs barred with a plank and a broken rail
      B.at([0, Y - 0.35, dz1 + 0.75], 0, () => { const p = G.beam(1.4, 0.12, 0.05, 0.01); p.rotateZ(0.18); B.add(p, '#8a6a4e'); const p2 = G.beam(1.3, 0.1, 0.05, 0.01); p2.rotateZ(-0.22); p2.translate(0, 0.2, 0.04); B.add(p2, '#7e604a'); });
      B.at([2.0, 0, dz1 + 2.6], 0, () => debris(B, 0.6, { seed: 23, n: 4 }));
    },
    saved(B) {
      B.at([0, Y, F], 0, () => norenPart(B, { w: 0.98, h: 0.5, y: 1.3 - 0.02, z: 0.16, color: '#2f5a8a', strips: 2, symbol: () => symGeo('pearl'), symScale: 0.22 }));
      // futons and towels airing over the veranda rail
      for (const [x, c] of [[-1.35, '#ff9ec0'], [-0.95, '#fff0b0'], [1.0, '#8fd0ff'], [1.4, '#ffffff']]) B.at([x, Y + 0.62, dz1 - 0.02], 0, () => {
        const f = G.box(0.36, 0.05, 0.42, 0.02); f.translate(0, -0.02, 0.05); f.rotateX(1.0); B.add(f, c);
        const f2 = G.box(0.36, 0.04, 0.34, 0.015); f2.translate(0, -0.03, -0.1); f2.rotateX(-0.95); B.add(f2, shade(c, 0.92));
      });
      for (const s of [-1, 1]) B.at([s * (dx - 0.3), Y, dz1 - 0.3], 0, () => flowerPot(B, { r: 0.14, seed: 9 + s, colors: ['#ff8fb0', '#ffffff', '#8fd0ff'] }));
      B.at([1.0, Y, dz0 + 0.55], 0, () => teaBench(B, { w: 0.9, felt: '#3a7ab0' }));
      B.at([2.25, 0, dz1 + nS * run + 0.35], 0, () => parasol(B, { r: 0.7, h: 1.75, color: '#3a8ab8' }));
    },
  };
}

// ------------------------------------------------------------------ Nami's Port Store (浜屋)
export function shop(B) {
  const w = 3.3, d = 2.3, h = 1.55, y0 = 0.26, zc = -0.35, F = zc + d / 2;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  boardWalls(B, { w, d, h, y0, color: T.boardTeal, skip: ['f'], seed: 21 });
  { const core = G.box(w - 0.1, h, d - 0.2, 0); core.translate(0, y0 + h / 2, -0.06); B.add(core, '#3e4a52'); }
  const blk = { w, d };
  // the open front: a dark interior with shelves of sea glass, floats, jars and rope, the counter in front
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.3, h - 0.16, 0.03, 0); back.translate(0, (h - 0.16) / 2 + 0.02, -0.06); B.add(back, '#3e3438');
    const rr = mulberry32(77);
    for (const y of [0.45, 0.8, 1.14]) {
      const sh = G.box(w - 0.46, 0.04, 0.22, 0.01); sh.translate(0, y, 0.02); B.add(sh, '#a8906e');
      for (let x = -(w - 0.6) / 2; x < (w - 0.6) / 2; x += 0.15 + rr() * 0.07) {
        const k = rr(), c = ['#7ad8c8', '#8fc8f0', '#a8e8b8', '#5ab0d8', '#c8f0ff', '#78c8a8'][Math.floor(rr() * 6)];
        if (k < 0.4) { const b = G.cyl(0.04, 0.05, 0.15, 7); b.translate(x, y + 0.095, 0.02); B.glow(b, c, { tint: 0.7 }); const nk = G.cyl(0.018, 0.022, 0.06, 5); nk.translate(x, y + 0.2, 0.02); B.glow(nk, c, { tint: 0.7 }); const ck = G.cyl(0.02, 0.02, 0.025, 5); ck.translate(x, y + 0.24, 0.02); B.add(ck, '#a8845e'); }
        else if (k < 0.65) { const s = G.sph(0.065, 8, 6); s.translate(x, y + 0.085, 0.02); B.glow(s, c, { tint: 0.65 }); const nt = G.torus(0.066, 0.006, 3, 8); nt.translate(x, y + 0.085, 0.02); B.add(nt, T.rope); }
        else if (k < 0.85) { const t = G.torus(0.06, 0.022, 4, 10); t.rotateX(PI / 2); t.translate(x, y + 0.04, 0.02); B.add(t, T.rope); const t2 = t.clone(); t2.translate(0, 0.04, 0); B.add(t2, T.rope); }
        else { const j = G.cyl(0.05, 0.055, 0.13, 7); j.translate(x, y + 0.085, 0.02); B.add(j, ['#e8d8b8', '#c8a878', '#d8806a'][Math.floor(rr() * 3)]); }
      }
    }
    for (const s of [-1, 1]) { const p = G.beam(0.12, h, 0.12, 0.02); p.translate(s * (w / 2 - 0.1), h / 2, 0.06); B.add(p, T.tar); }
    const lin = G.beam(w + 0.06, 0.16, 0.14, 0.02); lin.translate(0, h - 0.06, 0.07); B.add(lin, T.tar);
    const ct = G.box(w - 0.55, 0.62, 0.4, 0.02); ct.translate(0, 0.31, 0.3); B.add(ct, (p, n, o) => o.set(T.boardTeal).multiplyScalar(Math.abs(Math.sin(p.x * 15)) < 0.12 ? 0.75 : 0.95));
    const top = G.box(w - 0.45, 0.06, 0.5, 0.02); top.translate(0, 0.64, 0.3); B.add(top, '#c8a878');
  });
  onFace(B, blk, 'r', -0.72, y0 + 0.62, () => { // the tall side kanban: a shell, a wave and two ink marks under a little cap
    const bd = G.box(0.34, 1.05, 0.05, 0.015); bd.translate(0, 0.25, 0.07); B.add(bd, '#f4ead4'); const fr = G.box(0.4, 1.11, 0.035, 0.012); fr.translate(0, 0.25, 0.05); B.add(fr, T.tar);
    const cp = G.box(0.5, 0.06, 0.16, 0.015); cp.translate(0, 0.83, 0.1); B.add(cp, T.tile);
    B.at([0, 0.55, 0.1], 0, () => sym3(B, 'shell', 0.27, '#e8806a', 0.014)); B.at([0, 0.24, 0.1], 0, () => sym3(B, 'wave', 0.22, '#3a8ab8', 0.012));
    for (const [y, hh] of [[0.02, 0.12], [-0.17, 0.14]]) { const ink = G.box(0.04, hh, 0.006, 0); ink.translate(0, y, 0.098); B.add(ink, '#2a2028'); const cr = G.box(0.13, 0.026, 0.006, 0); cr.translate(0, y + hh * 0.25, 0.099); B.add(cr, '#2a2028'); }
  });
  onFace(B, blk, 'r', 0.42, y0 + 0.8, () => { // a side display window full of sea glass
    const rc = G.box(0.9, 0.6, 0.04, 0); rc.translate(0, 0, 0.03); B.add(rc, '#2e2a30');
    for (let i = 0; i < 6; i++) { const b = G.cyl(0.035, 0.045, 0.16, 6); b.translate(-0.33 + i * 0.13, -0.18, 0.08); B.glow(b, ['#7ad8c8', '#8fc8f0', '#a8e8b8'][i % 3], { tint: 0.7 }); }
    for (let i = 0; i < 4; i++) { const s = G.sph(0.06, 8, 6); s.translate(-0.25 + i * 0.17, 0.1, 0.08); B.glow(s, ['#5ab0d8', '#c8f0ff', '#78c8a8', '#8fd0ff'][i], { tint: 0.65 }); }
    const fr = G.box(1.0, 0.07, 0.1, 0); for (const y of [-0.33, 0.33]) { const g = fr.clone(); g.translate(0, y, 0.05); B.add(g, T.tar); }
    for (const x of [-0.5, 0, 0.5]) { const g = G.box(0.06, 0.72, 0.08, 0); g.translate(x, 0, 0.06); B.add(g, T.tar); }
  });
  onFace(B, blk, 'b', 0, y0 + 0.55, () => { // the painted sign on the back wall (the road sees it)
    const bd = G.box(1.5, 0.6, 0.05, 0.02); bd.translate(0, 0.35, 0.06); B.add(bd, '#f0e6d0');
    B.at([-0.42, 0.35, 0.09], 0, () => sym3(B, 'shell', 0.5, '#e88a6a'));
    for (let i = 0; i < 2; i++) B.at([0.25 + i * 0.36, 0.35, 0.09], 0, () => sym3(B, 'wave', 0.34, '#3a8ab8'));
  });
  plankRoof(B, { w, d, y0: y0 + h, over: 0.45, gOver: 0.32, H: 1.05, seed: 4 });
  B.pop();
  // the lean-to over the counter on two posts: plank slats you can see the sky through
  const aw = F + 0.95, ay = y0 + h + 0.04, ay2 = 1.85;
  for (const s of [-1, 1]) { const p = G.cyl(0.06, 0.065, ay2, 7); p.translate(s * (w / 2 - 0.05), ay2 / 2, aw); B.add(p, T.pile); }
  B.add(bar(V(-w / 2 - 0.15, ay2, aw), V(w / 2 + 0.15, ay2, aw), 0.09, 0.012), T.tar);
  for (let i = 0; i < 9; i++) { const x = -w / 2 + 0.1 + i * (w - 0.2) / 8; B.add(bar(V(x, ay, F + 0.02), V(x, ay2 + 0.05, aw + 0.12), 0.05, 0.008), '#8a7a6a'); }
  // the shop sign over the lean-to, goods out front: floats in a barrel, rods, baskets of shells and kelp
  B.at([0, ay2 + 0.32, aw + 0.02], 0, () => {
    const bd = G.box(1.3, 0.38, 0.06, 0.02); B.add(bd, '#f4ead4'); const fr = G.box(1.38, 0.46, 0.04, 0.02); fr.translate(0, 0, -0.02); B.add(fr, T.tar);
    B.at([-0.38, 0, 0.035], 0, () => sym3(B, 'shell', 0.3, '#e8806a'));
    for (let i = 0; i < 3; i++) { const g = G.sph(0.07, 10, 7); g.scale(1, 1, 0.5); g.translate(0.05 + i * 0.2, 0, 0.05); B.glow(g, ['#7ad8c8', '#8fc8f0', '#a8e8b8'][i], { tint: 0.7 }); }
    for (const s of [-1, 1]) { const ch = G.box(0.012, 0.22, 0.012, 0); ch.translate(s * 0.5, 0.3, 0); B.add(ch, C.iron); }
  });
  B.at([-w / 2 - 0.35, 0, F + 0.3], 0, () => { barrel(B, { r: 0.2, h: 0.46, wood: '#8a7a68', lid: false }); for (let i = 0; i < 4; i++) { const g = G.sph(0.09, 10, 7); g.translate(Math.cos(i * 1.7) * 0.08, 0.5 + (i % 2) * 0.06, Math.sin(i * 1.7) * 0.08); B.glow(g, ['#7ad8c8', '#8fc8f0', '#c8f0ff', '#78c8a8'][i], { tint: 0.65 }); } });
  B.at([w / 2 + 0.28, 0, zc - 1.25], 0, () => { for (let i = 0; i < 4; i++) B.add(bar(V(-0.12 + i * 0.08, 0, -0.1), V(-0.2 + i * 0.1, 2.1 - i * 0.12, -0.32), 0.022, 0), '#c8b070'); const lean = G.beam(0.08, 0.06, 0.6, 0.01); lean.translate(-0.05, 0.9, -0.28); B.add(lean, T.tar); });
  B.at([w / 2 + 0.45, 0, zc + 0.15], 0, () => { crate(B, { s: 0.36, wood: '#6a9ac8' }); B.at([0.02, 0.36, 0], 0.3, () => crate(B, { s: 0.3, wood: C.woodPale })); });
  B.at([w / 2 + 0.4, 0, zc - 0.75], 0.5, () => ropeCoil(B, 0.22));
  return {
    fp: [-w / 2 - 0.15, zc - d / 2 - 0.12, w / 2 + 0.15, F + 0.5], door: [0, F + 1.2], keeper: [0, F + 0.05, 0], counter: true,
    lamps: [[-1.3, ay2 - 0.04, aw + 0.04], [1.3, ay2 - 0.04, aw + 0.04]],
    siege(B) {
      B.at([0, y0, F + 0.52], 0, () => {
        const n = 7;
        for (let i = 0; i < n; i++) { const p = G.box((w - 0.3) / n - 0.02, h - 0.1, 0.05, 0.01); p.translate(-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.1) / 2, 0); p.rotateZ((i - 3) * 0.006); B.add(p, ['#6a7a82', '#5e6e78', '#74848c'][i % 3]); }
        B.at([0, h * 0.5, 0], 0, () => boards(B, w - 0.4, h - 0.3, { seed: 13 }));
      });
      B.at([w / 2 + 0.01, y0 + 0.8, zc - 0.42], PI / 2, () => boards(B, 1.0, 0.7, { seed: 14 }));
      B.at([-1.9, 0, F + 1.4], 0, () => debris(B, 0.8, { seed: 31, n: 5 }));
      B.at([0.9, 0.17, F + 1.5], 0, () => { barrel(B, { r: 0.16, h: 0.34, wood: '#8a7a68', lid: false }); }, 1, PI / 2, 0);
    },
    saved(B) {
      B.at([0, ay2 + 0.07, aw + 0.1], 0, () => awning(B, { w: w + 0.2, d: 0.12, y: 0, drop: 0.02, colors: [T.teal, '#f6f0e4'], n: 11 }));
      B.at([0, ay, F + 0.02], 0, () => { const pts = []; for (let i = 0; i < 11; i++) { const x = -w / 2 - 0.05 + i * (w + 0.1) / 10; const g = G.box((w + 0.1) / 10 + 0.004, 0.025, Math.hypot(aw - F, ay2 - ay) + 0.1, 0); g.rotateX(Math.atan2(ay - ay2, aw - F)); g.translate(x, (ay2 - ay) / 2 + 0.06, (aw - F) / 2 + 0.04); B.cloth(g, i % 2 ? '#f6f0e4' : T.teal, { x0: -2, x1: 2, yTop: ay2 - ay + 0.1, yBot: -0.1 }); void pts; } });
      B.at([-w / 2 - 0.2, 0, F + 1.0], 0, () => nobori(B, { h: 2.3, w: 0.4, color: T.teal, sym: 'fish' }));
      B.at([0, y0 + 0.66, F + 0.3], 0, () => { for (let i = 0; i < 5; i++) { const x = -1.0 + i * 0.5, bk = G.cyl(0.13, 0.1, 0.1, 10); bk.translate(x, 0.05, 0); B.add(bk, '#c8a060'); for (let k = 0; k < 4; k++) { const s = i % 2 ? G.sph(0.045, 6, 4) : G.cone(0.04, 0.09, 5); s.translate(x + (k % 2 - 0.5) * 0.08, 0.13, (Math.floor(k / 2) - 0.5) * 0.07); i % 2 ? B.glow(s, ['#7ad8c8', '#8fc8f0', '#a8e8b8', '#c8f0ff'][k], { tint: 0.6 }) : B.add(s, ['#f4d8c8', '#ffe8d8', '#e8a888', '#f8e0c0'][k]); } } });
      B.at([1.5, 0, F + 1.25], 0, () => { for (let i = 0; i < 3; i++) B.at([i * 0.34 - 0.34, 0, (i % 2) * 0.12], i, () => { const bk = G.cyl(0.15, 0.12, 0.2, 10); bk.translate(0, 0.1, 0); B.add(bk, '#c8a060'); const fill = G.sph(0.13, 8, 5); fill.scale(1, 0.4, 1); fill.translate(0, 0.21, 0); B.add(fill, ['#4a6a3a', '#f4d8c8', '#e8806a'][i]); }); });
      B.at([-1.2, 0, F + 1.45], 0.3, () => { const bd = G.box(0.42, 0.55, 0.04, 0.01); bd.rotateX(-0.2); bd.translate(0, 0.42, 0); B.add(bd, '#2e3a36'); const fr = G.box(0.46, 0.6, 0.03, 0.01); fr.rotateX(-0.2); fr.translate(0, 0.42, -0.012); B.add(fr, '#a8845e'); for (let k = 0; k < 3; k++) { const ln = G.box(0.26 - k * 0.04, 0.025, 0.005, 0); ln.rotateX(-0.2); ln.translate(0, 0.55 - k * 0.11, 0.03 - k * 0.022); B.add(ln, k ? '#f4ecdc' : '#ffd24a'); } for (const s of [-1, 1]) { const l = G.beam(0.03, 0.75, 0.03, 0); l.rotateX(0.25 * s); l.translate(s * 0.18, 0.36, s * 0.08); B.add(l, '#a8845e'); } });
    },
  };
}

// ------------------------------------------------------------------ Saba's Fish Market (魚市): an open market hall
export function fishmonger(B) {
  const w = 3.6, d = 2.5, h = 2.12, zc = -0.35, F = zc + d / 2, Bk = zc - d / 2;
  // a wet stone floor slab with a gutter at the front
  { const fl = G.box(w + 0.3, 0.12, d + 0.3, 0.04); fl.translate(0, 0.06, zc); B.add(fl, (p, n, o) => o.set('#a8a8ac').lerp(new THREE.Color('#7a8288'), clamp(nz(p.x * 1.5, p.z * 1.5) + 0.3) * 0.5)); }
  { const gt = G.box(w + 0.2, 0.02, 0.12, 0); gt.translate(0, 0.125, F + 0.05); B.add(gt, '#5a6a72'); }
  // posts on stone bases: the front row, the back row, the middle of each side
  for (const [x, z] of [[-w / 2, F], [0, F], [w / 2, F], [-w / 2, Bk], [0, Bk], [w / 2, Bk], [-w / 2, zc], [w / 2, zc]]) {
    const p = G.cyl(0.075, 0.085, h, 8); p.translate(x, h / 2 + 0.1, z); B.add(p, T.tar);
    const b = G.cyl(0.13, 0.15, 0.12, 8); b.translate(x, 0.12, z); B.add(b, STONES[2]);
  }
  for (const z of [F, Bk]) { const bm = G.beam(w + 0.2, 0.14, 0.13, 0.02); bm.translate(0, h + 0.05, z); B.add(bm, T.tar); }
  for (const x of [-w / 2, w / 2]) { const bm = G.beam(0.13, 0.14, d + 0.12, 0.02); bm.translate(x, h + 0.05, zc); B.add(bm, T.tar); }
  // the boarded back wall and a low boarded side on the left
  B.at([0, 0.12, Bk + 0.02], 0, () => boardPanel(B, w - 0.1, h - 0.06, { base: new THREE.Color(T.board), seed: 31, back: true }));
  B.at([-w / 2 + 0.02, 0.12, zc], -PI / 2, () => boardPanel(B, d - 0.12, 0.85, { base: new THREE.Color(T.board), seed: 33, back: true }));
  B.push([0, 0, zc]);
  const R = plankRoof(B, { w, d, y0: h + 0.12, over: 0.38, gOver: 0.42, H: 0.95, seed: 9 });
  B.pop();
  // the display counter along the front: a slanted trestle table with shallow trays
  B.at([0, 0.12, F - 0.42], 0, () => {
    for (const sx of [-1.35, 0, 1.35]) { const l = G.beam(0.07, 0.68, 0.5, 0.01); l.translate(sx, 0.34, 0); B.add(l, '#7a6a5a'); }
    const tb = G.box(3.0, 0.06, 0.72, 0.01); tb.rotateX(0.22); tb.translate(0, 0.72, 0); B.add(tb, '#9a8670');
    const lip = G.box(3.04, 0.1, 0.04, 0); lip.translate(0, 0.66, 0.37); B.add(lip, T.tar);
  });
  // the side table on the open right side, the ice chest, a water tub, the hanging scale, a chopping block
  B.at([w / 2 - 0.42, 0.12, zc - 0.1], PI / 2, () => {
    for (const sx of [-0.7, 0.7]) { const l = G.beam(0.07, 0.62, 0.42, 0.01); l.translate(sx, 0.31, 0); B.add(l, '#7a6a5a'); }
    const tb = G.box(1.6, 0.06, 0.56, 0.01); tb.translate(0, 0.64, 0); B.add(tb, '#9a8670');
  });
  B.at([-0.9, 0.12, Bk + 0.42], 0, () => { const ch = G.box(1.0, 0.55, 0.5, 0.03); ch.translate(0, 0.275, 0); B.add(ch, (p, n, o) => o.set('#e8eef0').multiplyScalar(n.y > 0.5 ? 1 : 0.88)); const lid = G.box(1.04, 0.05, 0.54, 0.02); lid.translate(0, 0.57, 0); B.add(lid, T.teal); for (const sx of [-1, 1]) { const hd = G.box(0.14, 0.04, 0.04, 0); hd.translate(sx * 0.3, 0.45, 0.27); B.add(hd, '#5a6a72'); } });
  B.at([0.5, 0.12, Bk + 0.38], 0, () => { const tub = G.cyl(0.3, 0.26, 0.34, 14, true); tub.translate(0, 0.17, 0); B.add(tub, (p, n, o) => o.set('#8a7058').multiplyScalar(Math.abs(Math.sin(Math.atan2(p.z, p.x) * 7)) < 0.15 ? 0.7 : 1)); const wt = G.disc(0.28, 14); wt.rotateX(-PI / 2); wt.translate(0, 0.3, 0); B.add(wt, '#4a9ab8', 'water'); for (const y of [0.08, 0.27]) { const hp = G.torus(0.29, 0.012, 3, 14); hp.rotateX(PI / 2); hp.translate(0, y, 0); B.add(hp, C.iron); } });
  B.at([1.2, h - 0.02, zc - 0.2], 0, () => { // the hanging balance
    const ch = G.box(0.01, 0.4, 0.01, 0); ch.translate(0, -0.2, 0); B.add(ch, C.iron);
    const bm = G.box(0.5, 0.025, 0.025, 0); bm.translate(0, -0.4, 0); B.add(bm, T.brass);
    const pan = G.cyl(0.13, 0.1, 0.04, 10); pan.translate(-0.2, -0.72, 0); B.add(pan, T.brass); for (const a of [0, 2.1, 4.2]) { const c = G.box(0.006, 0.3, 0.006, 0); c.rotateZ(Math.cos(a) * 0.15); c.translate(-0.2 + Math.cos(a) * 0.05, -0.56, Math.sin(a) * 0.05); B.add(c, C.iron); }
    const wtt = G.cyl(0.04, 0.05, 0.08, 8); wtt.translate(0.22, -0.6, 0); B.add(wtt, C.iron);
  });
  // the hanging dried fish (himono) on a pole along the left side
  B.at([-w / 2 + 0.12, h - 0.18, zc], 0, () => {
    const pl = G.cyl(0.02, 0.02, d - 0.2, 5); pl.rotateX(PI / 2); B.add(pl, '#c8b070');
    for (let i = 0; i < 6; i++) B.at([0.04, -0.03, -d / 2 + 0.3 + i * (d - 0.6) / 5], 0, () => { const cd = G.box(0.008, 0.08, 0.008, 0); cd.translate(0, -0.04, 0); B.add(cd, T.rope); B.at([0, -0.08, 0], 0, () => fish(B, i % 2 ? 'aji' : 'sanma', 0.95), 1, 0, -PI / 2); });
  });
  // the big carved fish standing on the front slope of the roof (a roof kanban on two posts), the 魚 board on the post
  const kz = R.Z * 0.5, ky = h + 0.5; // (the front slope halfway down, in the block's frame)
  B.at([0, ky + 0.5, zc + kz + 0.02], 0, () => {
    for (const s of [-1, 1]) { const ch = G.beam(0.05, 0.62, 0.05, 0.01); ch.translate(s * 0.3, -0.34, -0.03); B.add(ch, T.tar); }
    const sh = symShapes('fish'); const g = shapeGeo(sh, 0.08, 0.02, 10); g.scale(1.45, 1.45, 1); g.translate(0, 0, -0.06);
    B.add(g, (p, n, o) => { const k = clamp(0.5 + p.y / 0.4); o.set('#e8eef2').lerp(new THREE.Color('#2e6a8a'), k * k); if (k > 0.55 && Math.sin(p.x * 26 + Math.sin(p.y * 20) * 2) > 0.55) o.lerp(new THREE.Color('#1a3448'), 0.6); if (Math.abs(n.z) < 0.5) o.set('#4a5a68'); });
    for (const sz of [-1, 1]) { const e = G.sph(0.05, 8, 6); e.scale(1, 1, 0.4); e.translate(-0.4, 0.05, sz * 0.09); B.add(e, '#f8f4e8'); const pu = G.sph(0.026, 6, 4); pu.translate(-0.41, 0.05, sz * 0.11); B.add(pu, '#1a1a22'); }
  });
  B.at([w / 2 + 0.05, h - 0.35, F - 0.2], PI / 2, () => { const bd = G.box(0.42, 0.9, 0.05, 0.02); bd.translate(0, -0.15, 0); B.add(bd, '#f4ecdc'); const fr = G.box(0.48, 0.96, 0.03, 0.01); fr.translate(0, -0.15, -0.02); B.add(fr, T.tar); B.at([0, 0.1, 0.035], 0, () => sym3(B, 'fish', 0.36, '#2e6a8a')); B.at([0, -0.32, 0.035], 0, () => sym3(B, 'wave', 0.3, T.teal)); });
  // fish boxes stacked by the side, a cart of empty boxes, buckets
  B.at([w / 2 + 0.45, 0, Bk + 1.05], 0.2, () => fishBox(B, { n: 4 }));
  B.at([w / 2 + 0.6, 0, Bk + 0.5], -0.3, () => fishBox(B, { n: 3, wood: '#b8986c' }));
  B.at([-w / 2 - 0.4, 0, F + 0.2], 0, () => bucket(B, { r: 0.13, h: 0.2, color: '#8aa0b8', water: true }));
  B.at([-w / 2 - 0.35, 0, Bk + 0.4], 0, () => barrel(B, { r: 0.2, h: 0.46, wood: '#7a6a5a' }));
  return {
    fp: [-w / 2 - 0.2, Bk - 0.15, w / 2 + 0.15, F + 0.25], door: [0, F + 1.15], keeper: [-0.35, F + 0.08, 0], counter: true,
    lamps: [[-1.0, h - 0.03, F + 0.02], [1.0, h - 0.03, F + 0.02]],
    siege(B) {
      // a stained tarp thrown over the counter, its trays kicked over, planks nailed across the front posts
      B.at([0, 0.12, F - 0.42], 0, () => {
        const tp = G.plane(3.2, 1.1, 8, 3); tp.rotateX(-PI / 2 + 0.22); const pa = tp.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, pa.getY(i) + 0.04 * Math.sin(x * 4) + (Math.abs(z) > 0.4 ? -0.18 * (Math.abs(z) - 0.4) : 0)); } tp.computeVertexNormals(); tp.translate(0, 0.8, 0.02);
        B.add(tp, (p, n, o) => o.set('#6a6450').lerp(new THREE.Color('#3e3a30'), clamp(nz(p.x * 2, p.z * 3) + 0.2) * 0.6));
      });
      B.at([0, 0.85, F + 0.1], 0, () => { for (const s of [-1, 1]) { const p = G.beam(1.9, 0.12, 0.05, 0.01); p.rotateZ(s * 0.32); p.translate(s * 0.92, 0, 0); B.add(p, '#8a6a4e'); } const p3 = G.beam(3.7, 0.11, 0.05, 0.01); p3.translate(0, 0.32, 0.03); B.add(p3, '#7e604a'); });
      for (const [x, z, a] of [[-0.8, F + 0.9, 0.5], [0.6, F + 1.3, 2.0], [1.6, F + 0.7, 1.1]]) B.at([x, 0.06, z], a, () => fishBox(B, { wood: '#a88a64' }), 1, 0, 0.9);
      B.at([-1.9, 0, F + 1.0], 0, () => warBanner(B, { h: 2.2, w: 0.48, seed: 71 }));
    },
    saved(B) {
      // the catch on crushed ice: mackerel, sea bream, flounder, squid, octopus, crabs, every tray with its price tag
      B.at([0, 0.12 + 0.72 + 0.04, F - 0.42], 0, () => B.at([0, 0, 0], 0, () => {
        const trays = [[-1.1, ['saba', 'saba', 'saba', 'saba']], [-0.37, ['tai', 'tai', 'tai']], [0.37, ['squid', 'squid', 'aji', 'aji']], [1.1, ['octo', 'crab', 'crab', 'hirame']]];
        for (const [x, kinds] of trays) B.at([x, 0, 0], 0, () => {
          iceBed(B, 0.68, 0.62);
          kinds.forEach((k, i) => B.at([(i % 2 - 0.5) * 0.3 * (kinds.length > 2 ? 1 : 0), 0.06, (Math.floor(i / 2) - 0.5) * 0.24 + (kinds.length === 3 && i === 2 ? 0.12 : 0)], (i % 2 ? 0.25 : -0.2) + (k === 'tai' ? i * 0.4 : 0), () => {
            if (k === 'squid') squid(B, 1.1); else if (k === 'octo') octopus(B, 1.1); else if (k === 'crab') crab(B, 1.2); else fish(B, k, 1.05);
          }));
          B.at([0.24, 0.04, 0.27], 0, () => priceTag(B));
        });
      }, 1, 0.22, 0));
      B.at([w / 2 - 0.42, 0.12 + 0.67, zc - 0.1], PI / 2, () => { for (let i = 0; i < 2; i++) B.at([(i - 0.5) * 0.75, 0, 0], 0, () => { iceBed(B, 0.66, 0.48); for (let k = 0; k < 3; k++) B.at([(k - 1) * 0.18, 0.06, (k % 2 - 0.5) * 0.1], PI / 2, () => fish(B, i ? 'sanma' : 'aji', 1)); B.at([0.24, 0.04, 0.2], 0, () => priceTag(B)); }); });
      B.at([0, h - 0.15, F + 0.02], 0, () => { const pl = G.cyl(0.018, 0.018, w - 0.3, 5); pl.rotateZ(PI / 2); B.add(pl, '#c8b070'); for (let i = 0; i < 7; i++) B.at([-w / 2 + 0.4 + i * (w - 0.8) / 6, -0.02, 0], 0, () => { const cd = G.box(0.008, 0.07, 0.008, 0); cd.translate(0, -0.035, 0); B.add(cd, T.rope); B.at([0, -0.07, 0], PI / 2, () => fish(B, ['saba', 'tai', 'aji'][i % 3], 0.9), 1, 0, -PI / 2); }); });
      B.at([-w / 2 - 0.3, 0, F + 0.9], 0, () => nobori(B, { h: 2.4, w: 0.42, color: '#2e6a8a', sym: 'fish' }));
      B.at([w / 2 - 0.15, 0, F + 0.75], 0, () => nobori(B, { h: 2.2, w: 0.38, color: T.red, sym: 'fish' }));
      B.at([w / 2 + 0.45, 4 * 0.13, Bk + 1.05], 0.2, () => iceBed(B, 0.5, 0.32));
    },
  };
}

// ------------------------------------------------------------------ Funaki Boatyard (船大工): the boatyard on the beach
/** a plank platform on posts (the beach falls away under its back) in three strips across local x: on the open side
 *  (−x, toward the camera) a new hull on keel blocks on the slipway, planked to the turn of the bilge with bare ribs
 *  above, under shear legs with a block and tackle; in the middle the walkway to the pier (decor lays it and the pier
 *  out from BOATYARD); along the closed side (+x) the workshop under a stone-weighted plank roof — tool racks, a bench,
 *  timber on a rack, the tar pot. The slipway runs out of the back into the bay. */
const BOATYARD = { d: 4.2, zc: -0.6, floor: 0.0, walkX: 0.3, hx: -1.2, x0: -2.2, x1: 2.35, sx0: -0.2 };
{ const B0 = BOATYARD, Bk = B0.zc - B0.d / 2, dir = [Math.sin(PI * 5 / 6), Math.cos(PI * 5 / 6)], q1 = [B0.walkX, Bk - 1.0], q2 = [q1[0] + dir[0] * 2.6, q1[1] + dir[1] * 2.6];
  B0.pier = { pts: [[B0.walkX, Bk - 0.15], q1, q2, [q2[0] + dir[0] * 1.8, q2[1] + dir[1] * 1.8]], dir, n: [-dir[1], dir[0]], w: 1.4, hw: 2.2 }; }
export function boatwright(B) {
  const { d, zc, floor: Y, hx, walkX, x0, x1, sx0 } = BOATYARD, h = 2.0, F = zc + d / 2, Bk = zc - d / 2, sw = x1 - sx0, scx = (x1 + sx0) / 2;
  // the platform on posts, the front step onto the walkway
  for (const x of [x0 + 0.1, hx, sx0, walkX + 0.5, x1 - 0.1]) for (const z of [F - 0.1, zc, Bk + 0.1]) { const p = G.cyl(0.07, 0.08, 1.4, 6); p.translate(x, Y - 0.72, z); B.add(p, T.pile); }
  deck(B, x0, x1, Bk, F, Y, { wood: '#a89480', along: 'z' });
  { const st = G.box(1.0, 0.05, 0.3, 0.01); st.translate(walkX, Y - 0.16, F + 0.2); B.add(st, '#9a8670'); for (const s of [-1, 1]) { const l = G.beam(0.06, 0.3, 0.06, 0.01); l.translate(walkX + s * 0.42, Y - 0.32, F + 0.2); B.add(l, T.tar); } }
  // the workshop: posts on its open (walkway) side, the boarded closed side with its tools, the roof over it and the walkway
  for (const x of [sx0, x1]) for (const z of [F, zc, Bk]) { const p = G.cyl(0.085, 0.095, h, 8); p.translate(x, Y + h / 2, z); B.add(p, T.tar); }
  for (const x of [sx0, x1]) { const pl = G.beam(0.13, 0.14, d + 0.14, 0.02); pl.translate(x, Y + h + 0.05, zc); B.add(pl, T.tar); }
  for (const z of [F, Bk]) { const tb = G.beam(sw + 0.16, 0.13, 0.12, 0.02); tb.translate(scx, Y + h + 0.05, z); B.add(tb, T.tar); }
  B.at([x1 - 0.02, Y, zc], PI / 2, () => boardPanel(B, d - 0.12, h - 0.02, { base: new THREE.Color(T.board), seed: 41, back: true }));
  B.at([x1 - 0.06, Y + 1.55, zc + 0.8], -PI / 2, () => toolRack(B, 1.3, 0, { tools: ['saw', 'hammer', 'saw', 'tongs', 'hammer'] }));
  B.at([x1 - 0.06, Y + 1.5, zc - 1.1], -PI / 2, () => toolRack(B, 0.9, 0, { tools: ['hammer', 'saw', 'hammer'] }));
  B.at([x1 - 0.22, Y, zc + 0.75], PI / 2, () => {
    const tb = G.box(1.4, 0.06, 0.34, 0.01); tb.translate(0, 0.74, 0); B.add(tb, '#b89870'); for (const sx of [-0.6, 0.6]) { const l = G.beam(0.05, 0.72, 0.3, 0.01); l.translate(sx, 0.36, 0); B.add(l, '#6a5240'); }
    const pl = G.box(0.7, 0.035, 0.12, 0); pl.translate(-0.15, 0.79, 0.02); B.add(pl, '#e0c090'); const pn = G.box(0.2, 0.06, 0.07, 0.01); pn.translate(0.25, 0.8, 0.0); B.add(pn, '#8a5a3a');
    const ml = G.cyl(0.05, 0.05, 0.14, 7); ml.rotateZ(PI / 2); ml.translate(0.45, 0.82, -0.05); B.add(ml, '#a8845e');
  });
  // timber for the boat on a low rack in the workshop, the tar pot on its brazier at the back
  for (const z of [zc - 1.2, zc - 0.2]) { const be = G.beam(0.7, 0.3, 0.1, 0.01); be.translate(1.35, Y + 0.15, z); B.add(be, '#5a4a3e'); }
  for (let k = 0; k < 7; k++) { const pl = G.box(0.16, 0.04, 1.6, 0); pl.translate(1.1 + (k % 4) * 0.17, Y + 0.32 + Math.floor(k / 4) * 0.045, zc - 0.7 + (hz(k) - 0.5) * 0.12); B.add(pl, shade('#d8b888', 0.9 + 0.15 * hz(k + 3))); }
  B.at([x1 - 0.42, Y, Bk + 0.45], 0, () => { const br = G.cyl(0.16, 0.2, 0.24, 8); br.translate(0, 0.12, 0); B.add(br, '#3a3438'); const coals = G.ico(0.13, 1); coals.scale(1, 0.35, 1); coals.translate(0, 0.25, 0); B.glow(coals, '#ff8a3a', { hot: true, flicker: 1, tint: 1 }); const pt = G.cyl(0.13, 0.11, 0.18, 10); pt.translate(0, 0.36, 0); B.add(pt, '#2a2628'); const tar = G.disc(0.12, 10); tar.rotateX(-PI / 2); tar.translate(0, 0.452, 0); B.add(tar, '#141012'); const brsh = G.cyl(0.012, 0.012, 0.4, 4); brsh.rotateZ(0.5); brsh.translate(0.08, 0.55, 0); B.add(brsh, '#a8845e'); });
  B.push([scx, 0, zc]);
  plankRoof(B, { w: sw, d, y0: Y + h + 0.12, over: 0.3, gOver: 0.3, H: 1.15, ridge: 'z', seed: 17 });
  B.pop();
  // the hull on its blocks: a new boat, planked to the turn of the bilge, bare ribs above, bow toward the slip
  const HL = 3.1;
  B.at([hx, Y + 0.38, zc - 0.05], PI / 2, () => {
    const H = hull(B, { L: HL, beam: 1.1, depth: 0.52, rise: 0.38, frac: 0.6, color: '#e8d8b8', trim: '#c8a878', wl: -1, wood: '#d8b88a' });
    hullRibs(B, H, { L: HL, from: 0.08, to: 0.9, n: 10 });
    for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, p = H.P(t, s * PI / 2, 1); pts.push({ p: p.add(V(0, 0.01, 0)), r: 0.03 }); } B.add(tube(pts, 4, false), '#b08a62'); } // (the sheer clamps)
    const st = []; for (let i = 0; i <= 6; i++) { const t = 0.72 + 0.28 * i / 6, p = H.P(t, 0); st.push({ p: p.clone().add(V(0.02, 0, 0)), r: 0.04 }); } st.push({ p: V(HL / 2 + 0.06, H.sAt(1) + 0.16, 0), r: 0.032 }); B.add(tube(st, 5, false), '#b08a62');
  });
  for (const z of [zc - 1.05, zc - 0.05, zc + 0.95]) { // keel blocks (cribs) and shores
    for (let k = 0; k < 3; k++) { const bl = G.box(0.5 - k * 0.06, 0.12, 0.2, 0.01); bl.rotateY(k % 2 ? PI / 2 : 0); bl.translate(hx, Y + 0.06 + k * 0.12, z); B.add(bl, k % 2 ? '#7a6250' : '#8a7058'); }
    for (const s of [-1, 1]) B.add(bar(V(hx + s * 0.88, Y, z), V(hx + s * 0.5, Y + 0.62, z), 0.06, 0.01), '#9a8068');
  }
  // the shear legs over the hull with a block and tackle and a sling under the bilge, guyed forward to a stake
  { const top = V(hx, Y + 3.05, zc - 0.15);
    for (const s of [-1, 1]) B.add(tube([{ p: V(hx + s * 0.86, Y, zc - 0.15), r: 0.07 }, { p: top.clone().add(V(s * 0.04, 0, 0)), r: 0.055 }], 6, false), '#a8906e');
    const lash = G.torus(0.09, 0.025, 4, 10); lash.rotateY(PI / 2); lash.translate(top.x, top.y - 0.08, top.z); B.add(lash, T.rope);
    const blk = G.box(0.14, 0.2, 0.1, 0.03); blk.translate(hx, Y + 2.62, zc - 0.15); B.add(blk, '#6a5242');
    const blk2 = G.box(0.12, 0.17, 0.1, 0.03); blk2.translate(hx, Y + 1.95, zc - 0.15); B.add(blk2, '#6a5242');
    for (const dx of [-0.03, 0.03]) B.add(tube([{ p: V(hx + dx, Y + 2.55, zc - 0.15), r: 0.012 }, { p: V(hx + dx, Y + 2.02, zc - 0.15), r: 0.012 }], 3, false), T.rope);
    B.add(tube([{ p: V(hx + 0.05, Y + 2.6, zc - 0.15), r: 0.012 }, { p: V(hx + 0.45, Y + 1.4, zc + 0.4), r: 0.012 }, { p: V(hx + 0.62, Y + 0.25, zc + 0.75), r: 0.012 }], 3, false), T.rope); // (the fall, made fast low on a shore)
    const sl = []; for (let k = 0; k <= 8; k++) { const a = PI * k / 8; sl.push({ p: V(hx + Math.cos(a) * 0.62, Y + 1.85 - Math.sin(a) * 1.25, zc - 0.15), r: 0.02 }); } B.add(tube(sl, 4, false), '#c8a870');
    B.add(tube([{ p: top.clone(), r: 0.012 }, { p: V(hx - 0.2, Y + 1.5, zc + 2.0), r: 0.012 }, { p: V(hx - 0.3, Y, zc + 2.55), r: 0.012 }], 3, false), T.rope);
    const stk = G.cyl(0.04, 0.03, 0.3, 5); stk.translate(hx - 0.3, Y + 0.1, zc + 2.55); B.add(stk, '#7a5a42');
  }
  // the winch at the yard's front, shavings round the hull, a ladder against it
  B.at([hx, Y, F - 0.3], 0, () => { const ws = G.cyl(0.13, 0.13, 0.5, 10); ws.translate(0, 0.45, 0); B.add(ws, '#8a6e56'); const cap = G.cyl(0.18, 0.15, 0.08, 10); cap.translate(0, 0.74, 0); B.add(cap, T.tar); for (let k = 0; k < 4; k++) { const b2 = G.cyl(0.02, 0.02, 0.7, 4); b2.rotateZ(PI / 2); b2.rotateY(k * PI / 4); b2.translate(0, 0.66, 0); B.add(b2, '#a8845e'); } for (let k = 0; k < 3; k++) { const t = G.torus(0.14, 0.022, 4, 12); t.rotateX(PI / 2); t.translate(0, 0.3 + k * 0.05, 0); B.add(t, T.rope); } });
  for (let i = 0; i < 30; i++) { const r = mulberry32(i * 31 + 5), x = hx + (r() - 0.5) * 2.0, z = zc + (r() - 0.5) * (d - 0.8), sh = G.torus(0.03 + r() * 0.02, 0.008, 3, 6, PI * 1.4); sh.rotateX(PI / 2 - 0.3); sh.rotateY(r() * TAU); sh.translate(x, Y + 0.01, z); B.add(sh, '#ecd4a8'); }
  for (const sz of [-1, 1]) B.add(bar(V(hx - 0.98, Y, zc + 0.5 + sz * 0.17), V(hx - 0.56, Y + 1.25, zc + 0.5 + sz * 0.17), 0.04, 0.006), '#b09478');
  for (let k = 1; k < 6; k++) { const t = k / 6, r = G.cyl(0.015, 0.015, 0.34, 4); r.rotateX(PI / 2); r.translate(lerp(hx - 0.98, hx - 0.56, t), Y + 1.25 * t, zc + 0.5); B.add(r, '#c8a888'); }
  // the slipway: two greased timbers on sleepers with rollers, running from the platform down into the bay
  for (const sx of [-1, 1]) B.add(bar(V(hx + sx * 0.42, Y - 0.04, Bk), V(hx + sx * 0.42, Y - 1.7, Bk - 3.3), 0.12, 0.015), '#7a6a5a');
  for (let k = 0; k < 6; k++) { const t = k / 5, sl = G.beam(1.2, 0.08, 0.14, 0.01); sl.translate(hx, lerp(Y - 0.14, Y - 1.8, t), lerp(Bk - 0.2, Bk - 3.2, t)); B.add(sl, '#8a7866'); }
  for (let k = 0; k < 5; k++) { const t = (k + 0.5) / 5, sl = G.cyl(0.07, 0.07, 1.0, 7); sl.rotateZ(PI / 2); sl.translate(hx, lerp(Y + 0.0, Y - 1.62, t), lerp(Bk - 0.3, Bk - 3.1, t)); B.add(sl, '#a8987e'); }
  // the workshop's front gable sign: a carved boat and crossed oars on the yard's name board
  B.at([scx, Y + h + 0.5, F + 0.36], 0, () => {
    const bd = G.box(1.1, 0.4, 0.05, 0.02); bd.translate(0, -0.25, 0); B.add(bd, '#f0e4cc'); const fr = G.box(1.16, 0.46, 0.035, 0.015); fr.translate(0, -0.25, -0.02); B.add(fr, T.tar);
    B.at([-0.28, -0.25, 0.03], 0, () => sym3(B, 'boat', 0.34, '#2c5a88'));
    B.at([0.24, -0.25, 0.03], 0, () => { for (const s of [-1, 1]) { const o = G.box(0.045, 0.32, 0.02, 0); o.rotateZ(s * 0.6); B.add(o, '#8a5a3a'); const bl = G.box(0.08, 0.12, 0.02, 0.01); bl.translate(0, -0.15, 0); bl.rotateZ(s * 0.6); B.add(bl, '#8a5a3a'); } });
  });
  // oars leaning on the front corner post, a crab pot by the yard
  B.at([x1 + 0.16, -0.25, F - 0.15], 0, () => { for (let i = 0; i < 2; i++) { B.add(bar(V(i * 0.12, 0, 0.12), V(i * 0.1 - 0.04, 1.9, -0.04), 0.035, 0), '#c8a070'); const bl = G.box(0.13, 0.5, 0.025, 0.006); bl.translate(i * 0.12, 0.25, 0.12); B.add(bl, '#c8a070'); } });
  B.at([x0 - 0.15, -0.25, F - 0.25], 0.3, () => crabPot(B, 0.2));
  return {
    fp: [x0 - 0.1, Bk - 0.1, sx0, F + 0.2], door: [walkX, F + 1.1], keeper: [hx + 0.75, F + 0.25, 0],
    lamps: [[sx0, Y + h - 0.02, F + 0.12], [x1, Y + h - 0.02, F + 0.12]],
    siege(B) {
      B.at([walkX, Y + 0.85, F + 0.12], 0, () => { for (const s of [-1, 1]) { const p = G.beam(1.3, 0.13, 0.05, 0.01); p.rotateZ(s * 0.7); B.add(p, '#8a6a4e'); } const p3 = G.beam(1.2, 0.12, 0.05, 0.01); p3.translate(0, 0.42, 0.04); B.add(p3, '#7e604a'); });
      B.at([hx, Y + 0.95, zc + 0.3], 0, () => warBanner(B, { h: 1.9, w: 0.45, seed: 81 }));
      B.at([hx + 0.3, 0, F + 1.2], 0, () => debris(B, 0.9, { seed: 83, n: 6 }));
      B.at([hx, Y + 0.95, zc - 0.6], 0.3, () => { const tp = G.plane(1.5, 1.6, 4, 4); tp.rotateX(-PI / 2); const pa = tp.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, -Math.abs(x) * 0.6 + 0.04 * Math.sin(z * 5)); } tp.computeVertexNormals(); B.add(tp, '#5e5848'); });
    },
    saved(B) {
      // the big-catch flag by the yard, the new boat's red strake painted on, the yard's name board, a box of pegs
      B.at([x0 - 0.35, -0.15, F + 0.45], PI * 0.85, () => tairyoFlag(B, { h: 3.3, w: 1.0, seed: 1 }));
      B.at([hx, Y + 0.38, zc - 0.05], PI / 2, () => { for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 12; i++) { const t = 0.03 + i / 12 * 0.62, x = (t - 0.5) * HL, b = 1.1 / 2 * (t < 0.42 ? 0.66 + 0.34 * Math.sin(t / 0.42 * PI / 2) : Math.pow(Math.cos((t - 0.42) / 0.58 * PI / 2), 0.75)); pts.push({ p: V(x, 0.2, s * (b * 0.93 + 0.012)), r: 0.028 }); } B.add(tube(pts, 4, false), T.red); } });
      B.at([hx - 0.95, Y + 0.02, F - 0.25], 0, () => { const bd = G.box(0.7, 0.22, 0.04, 0.01); bd.rotateX(-0.25); bd.translate(0, 0.16, 0); B.add(bd, '#f4ecdc'); B.at([-0.2, 0.16, 0.03], 0, () => sym3(B, 'boat', 0.17, '#2c5a88')); for (let k = 0; k < 3; k++) { const ln = G.box(0.07, 0.09, 0.005, 0); ln.translate(0.05 + k * 0.11, 0.16, 0.03); B.add(ln, '#2a2028'); } const lg = G.box(0.05, 0.3, 0.05, 0); lg.rotateX(0.3); lg.translate(0, 0.12, -0.08); B.add(lg, '#7a5a42'); });
      B.at([walkX + 0.1, 0, F + 1.25], 0.2, () => fishBox(B, { n: 1, fill: B2 => { for (let k = 0; k < 3; k++) { const g = G.box(0.12, 0.05, 0.3, 0); g.translate(-0.15 + k * 0.15, 0.03, 0); B2.add(g, '#e0c090'); } } }));
    },
  };
}

// ------------------------------------------------------------------ the Waypoint Shrine (the shared design, Shiokaze's tint)
export function waypoint(B) {
  const info = waystone(B, { roof: '#3a8ab8', cap: 'salt', seed: 79 });
  // its local dressing: glass floats and shells left as offerings, a coil of rope at the plinth
  B.at([-0.45, 0.14 + 0.46, 0.05], 0, () => { for (let i = 0; i < 3; i++) { const g = G.sph(0.06, 8, 6); g.translate(-0.15 + i * 0.15, 0.06, 0.06); B.glow(g, ['#7ad8c8', '#8fc8f0', '#c8f0ff'][i], { tint: 0.6 }); } });
  B.at([0.95, 0, 0.2], 0, () => ropeCoil(B, 0.18, 3));
  for (let i = 0; i < 5; i++) B.at([-0.8 + i * 0.4, 0.15, 0.62], i * 1.3, () => { const g = new THREE.CircleGeometry(0.06, 9, 0.15, PI - 0.3); g.rotateX(-PI / 2); g.translate(0, 0.005, 0); B.add(g.index ? g.toNonIndexed() : g, ['#fff0e0', '#ffd8c8', '#ffe8b8', '#ffc4c8', '#f8f0f8'][i]); });
  return info;
}

// ------------------------------------------------------------------ the port gate (on the trail where it enters the clearing)
export function gate(B, { w = 3.4, h = 2.5 } = {}) {
  for (const s of [-1, 1]) {
    const ft = puff(V(0, 0, 0), 0.32, { detail: 1, noise: 0.25, squash: 0.6, seed: 31 + s }); ft.translate(s * w / 2, 0.1, 0); B.add(ft, STONES[2]);
    const p = G.cyl(0.13, 0.17, h + 0.25, 9); p.translate(s * w / 2, (h + 0.25) / 2, 0);
    B.add(p, (q, n, o) => { o.set(T.drift).multiplyScalar(0.8 + 0.22 * Math.sin(q.y * 11 + Math.atan2(q.z, q.x - s * w / 2) * 3) ** 2); if (q.y < 0.5) o.lerp(new THREE.Color('#6a7262'), 0.45 * (1 - q.y / 0.5)); });
    const cap = G.cone(0.19, 0.2, 8); cap.translate(s * w / 2, h + 0.35, 0); B.add(cap, T.tar);
    // glass floats in rope nets and a red buoy tied to each post
    for (const [dy, dz, c] of [[h - 0.55, 0.18, '#8fe0c8'], [h - 0.92, 0.15, '#f0c070']]) { const f = G.sph(0.15, 12, 9); f.translate(s * w / 2 + s * 0.02, dy, dz); B.glow(f, c, { tint: 0.55 }); const nr = G.torus(0.15, 0.016, 4, 12); nr.rotateX(PI / 2); nr.translate(s * w / 2 + s * 0.02, dy, dz); B.add(nr, T.rope); }
    B.at([s * (w / 2 - 0.05), 1.0, 0.16], 0, () => buoys(B, 1, { colors: [T.red] }));
  }
  // the beam: a bleached log, a rope with paper streamers and floats along it, the sign hanging in the middle
  const beam = G.cyl(0.11, 0.12, w + 0.9, 9); beam.rotateZ(PI / 2); beam.translate(0, h + 0.06, 0); B.add(beam, (q, n, o) => o.set(T.drift).multiplyScalar(0.85 + 0.15 * Math.sin(q.x * 9) ** 2));
  const tie = G.beam(w + 0.3, 0.1, 0.1, 0.02); tie.translate(0, h - 0.45, 0); B.add(tie, T.tar);
  B.at([0, 0, 0.12], 0, () => shimenawa(B, { w: w - 0.2, y: h - 0.08, sag: 0.24, z: 0, r: 0.05 }));
  for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, x = -w / 2 + 0.2 + t * (w - 0.4), y = h - 0.12 - 0.24 * 4 * t * (1 - t) - 0.12, f = G.sph(0.07, 8, 6); f.translate(x, y, 0.14); B.glow(f, ['#8fe0c8', '#8fc8f0', '#c8f0ff', '#78c8a8', '#a8e8ff'][i], { tint: 0.55 }); }
  B.at([0, h - 0.73, 0.06], 0, () => {
    const bd = G.box(1.0, 0.42, 0.05, 0.02); B.add(bd, '#f0e6d0'); const fr = G.box(1.06, 0.48, 0.035, 0.015); fr.translate(0, 0, -0.015); B.add(fr, T.tar);
    for (const sd of [0, PI]) B.at([0, 0, 0], sd, () => { B.at([-0.24, 0, 0.03], 0, () => sym3(B, 'wave', 0.36, '#3a8ab8')); B.at([0.24, 0, 0.03], 0, () => sym3(B, 'fish', 0.34, '#e8603a')); });
  });
}

// ------------------------------------------------------------------ a harbour lamp post (the hook at the arm's end)
export function lanternPost(B) {
  const p = G.cyl(0.06, 0.075, 2.0, 7); p.translate(0, 1.0, 0); B.add(p, (q, n, o) => o.set(T.drift).multiplyScalar(0.8 + 0.2 * Math.sin(q.y * 13) ** 2));
  for (const y of [0.55, 1.25]) { const r = G.torus(0.07, 0.018, 4, 10); r.rotateX(PI / 2); r.translate(0, y, 0); B.add(r, T.rope); }
  const arm = G.beam(0.55, 0.07, 0.07, 0.01); arm.translate(0.24, 1.88, 0); B.add(arm, T.tar);
  B.add(bar(V(0, 1.55, 0), V(0.32, 1.86, 0), 0.04, 0.006), T.tar);
  const base = puff(V(0, 0, 0), 0.18, { detail: 1, noise: 0.25, squash: 0.6, seed: 3 }); base.translate(0, 0.05, 0); B.add(base, STONES[1]);
  B.at([-0.02, 1.35, 0.06], 0, () => { const f = G.sph(0.08, 8, 6); f.translate(0, -0.12, 0.05); B.glow(f, '#8fe0c8', { tint: 0.55 }); const nt = G.torus(0.08, 0.008, 3, 8); nt.translate(0, -0.12, 0.05); B.add(nt, T.rope); const cd = G.box(0.008, 0.06, 0.008, 0); cd.translate(0, -0.03, 0.05); B.add(cd, T.rope); });
  return [0.48, 1.84, 0];
}

// ------------------------------------------------------------------ Funaki's fishing boat (moored at the pier)
/** a small wooden fishing boat along local x (bow +x), keel at y = 0: the hull, thwarts, a stubby mast with its sail
 *  furled, a sculling oar at the stern, a squid-lamp pole with three big bulbs, nets and floats heaped amidships */
function fishingBoat(B, { L = 3.5, beam = 1.2, color = '#f4eee2', trim = '#2c6ab8', name = '#e8403a' } = {}) {
  const H = hull(B, { L, beam, depth: 0.52, rise: 0.38, color, trim, wl: 0.2 });
  for (const t of [0.3, 0.55]) { const [x, y, b] = H.sheerAt(t); const th = G.box(0.16, 0.05, b * 1.9, 0.01); th.translate(x, y - 0.12, 0); B.add(th, '#c8a070'); }
  const fl = G.box(L * 0.7, 0.03, beam * 0.55, 0); fl.translate(-0.05, 0.1, 0); B.add(fl, (p, n, o) => o.set('#b8946a').multiplyScalar(Math.abs(Math.sin(p.z * 30)) < 0.12 ? 0.75 : 1));
  // the mast and its furled sail, the stays
  const [mx, my] = H.sheerAt(0.62);
  const ms = G.cyl(0.04, 0.05, 2.1, 7); ms.translate(mx, my + 0.85, 0); B.add(ms, '#b89a72');
  const sl = G.cyl(0.075, 0.06, 1.2, 8); sl.translate(mx - 0.05, my + 1.0, 0.06); B.add(sl, (p, n, o) => o.set('#f0e6d0').multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 30) ** 2));
  const yd = G.cyl(0.025, 0.025, 1.5, 5); yd.rotateZ(PI / 2 - 0.15); yd.translate(mx - 0.1, my + 1.62, 0.07); B.add(yd, '#a8845e');
  for (const sx of [1, -1]) { const [ax, ay] = H.sheerAt(sx > 0 ? 0.98 : 0.05); B.add(tube([{ p: V(mx, my + 1.85, 0), r: 0.008 }, { p: V(ax, ay + 0.05, 0), r: 0.008 }], 3, false), '#3a3436'); }
  // the squid-lamp pole across the bow, with three big bulbs
  const [lx, ly] = H.sheerAt(0.86);
  const lp = G.cyl(0.03, 0.03, 1.2, 6); lp.translate(lx, ly + 0.6, 0); B.add(lp, '#d8d0c8');
  const lw = G.cyl(0.02, 0.02, 1.1, 5); lw.rotateX(PI / 2); lw.translate(lx, ly + 1.15, 0); B.add(lw, '#5a5458');
  for (const z of [-0.4, 0, 0.4]) { const bb = G.sph(0.09, 10, 8); bb.scale(1, 1.25, 1); bb.translate(lx, ly + 0.98, z); B.glow(bb, '#fff4d8', { tint: 0.3 }); const cp = G.cyl(0.05, 0.06, 0.08, 7); cp.translate(lx, ly + 1.1, z); B.add(cp, '#3a3640'); }
  // the sculling oar (ro) over the stern, nets and floats heaped amidships, a name board on the bow
  const [sx0, sy0] = H.sheerAt(0.04);
  B.add(tube([{ p: V(sx0 + 0.2, sy0 + 0.35, 0.1), r: 0.025 }, { p: V(sx0 - 1.0, sy0 - 0.25, 0.3), r: 0.025 }], 5, false), '#c8a070');
  { const bl = G.box(0.5, 0.025, 0.14, 0.008); bl.rotateZ(0.45); bl.translate(sx0 - 1.15, sy0 - 0.32, 0.31); B.add(bl, '#c8a070'); }
  const np = puff(V(0, 0, 0), 0.32, { detail: 1, noise: 0.35, squash: 0.45, seed: 9 }); np.scale(1.4, 1, 1); np.translate(-0.25, 0.32, 0); B.add(np, (p, n, o) => o.set(T.net).multiplyScalar(0.8 + 0.25 * Math.abs(Math.sin(p.x * 40) * Math.sin(p.z * 40))));
  for (let i = 0; i < 4; i++) { const f = G.sph(0.08, 8, 6); f.translate(-0.55 + i * 0.22, 0.48 + (i % 2) * 0.06, (i % 2 - 0.5) * 0.3); B.add(f, i % 2 ? '#fff6ea' : T.coral); }
  for (const s of [-1, 1]) { const [bx, by, bb] = H.sheerAt(0.78); const nb = G.box(0.42, 0.13, 0.02, 0); nb.rotateY(s * 0.32); nb.translate(bx, by - 0.12, s * (bb + 0.02)); B.add(nb, '#fff6ea'); const sw = G.box(0.08, 0.08, 0.005, 0); sw.rotateY(s * 0.32); sw.translate(bx - 0.08, by - 0.12, s * (bb + 0.035)); B.add(sw, name); }
  return H;
}

// ------------------------------------------------------------------ the pier (built in the boatyard's frame)
/** The pier along a centreline polyline pts [[x, z]...] (deck top at y = 0; the last segment is the wide head): pairs of
 *  piles into the sea bed (wet and barnacled below the tide line `tide`), stringers, cross planks each its own tone, the
 *  head's tall bollard piles with rope turns, a ladder down its outer side, a lamp post, the fishermen's gear; Funaki's
 *  boat moored along the head's outer side (normal n) with its bow and stern lines. → { lamp: [x, y, z] } */
function pierAlong(B, { pts, w = 1.4, hw = 2.2, n, dir, tide = -0.7, bed = -2.6, skip = 0.6 }) {
  const wet = new THREE.Color('#2e3a36'), wood = new THREE.Color(T.pile), barn = new THREE.Color('#e8e2d4');
  const pile = (x, z, top, r = 0.09) => { const g = G.cyl(r, r * 1.1, top - bed, 7); g.translate(x, (top + bed) / 2, z); B.add(g, (p, nn, o) => { o.copy(wood).multiplyScalar(0.85 + 0.15 * Math.sin(p.y * 8 + x * 9) ** 2); const k = clamp((tide + 0.05 - p.y) * 3); if (k > 0) o.lerp(wet, k * 0.85); if (p.y < tide + 0.12 && p.y > tide - 0.3 && nz(p.y * 15 + z * 3, x * 9) > 0.15) o.lerp(barn, 0.7); }); };
  const segs = []; let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); segs.push({ a: pts[i], b: pts[i + 1], L, s0: acc, ux: (bx - ax) / L, uz: (bz - az) / L, head: i === pts.length - 2 }); acc += L; }
  for (const S of segs) {
    const W = S.head ? hw : w, px = -S.uz, pz = S.ux; // (px, pz: the segment's left normal)
    const P = (s, o) => [S.a[0] + S.ux * s + px * o, S.a[1] + S.uz * s + pz * o];
    // cross planks
    for (let s = 0.1, i = 0; s < S.L - 0.02; s += 0.2, i++) {
      const k = hz(i * 3.7 + S.s0 * 5), [x, z] = P(s, (hz(i * 2.1 + S.s0) - 0.5) * 0.04);
      if (!S.head && S.s0 + s > 2 && k > 0.95) continue; // (a plank gone)
      const g = G.box(W + (hz(i * 1.3) - 0.5) * 0.06, 0.05, 0.17, 0); g.rotateY(Math.atan2(S.ux, S.uz)); g.translate(x, -0.025, z);
      B.add(g, shade('#a8967e', 0.84 + 0.22 * k));
    }
    // stringers and the edge beams
    for (const o of S.head ? [-hw * 0.42, -hw * 0.14, hw * 0.14, hw * 0.42] : [-w * 0.36, w * 0.36]) { const [x0, z0] = P(0, o), [x1, z1] = P(S.L, o); B.add(bar(V(x0, -0.11, z0), V(x1, -0.11, z1), 0.1, 0.012), '#4e4238'); }
    for (const o of [-W / 2, W / 2]) { const [x0, z0] = P(0, o), [x1, z1] = P(S.L, o); B.add(bar(V(x0, -0.08, z0), V(x1, -0.08, z1), 0.07, 0.01), T.tar); }
    // piles in pairs (none inside the shed)
    if (!S.head) for (let s = S.s0 < skip ? skip : 0.0; s <= S.L - 0.3; s += 1.3) for (const o of [-1, 1]) { const [x, z] = P(s, o * (w / 2 + 0.04)); pile(x, z, -0.06); }
  }
  // the head: four tall bollard piles with rope turns, a ladder down its outer side, the lamp post on its inner side
  const H = segs[segs.length - 1], hp = (s, o) => [H.a[0] + H.ux * s + n[0] * o, H.a[1] + H.uz * s + n[1] * o];
  const bol = [];
  for (const [s, o] of [[0.1, hw / 2], [H.L - 0.1, hw / 2], [0.1, -hw / 2], [H.L - 0.1, -hw / 2]]) { const [x, z] = hp(s, o); pile(x, z, 0.55, 0.1); bol.push([x, 0.45, z]); for (const y of [0.25, 0.4]) { const r = G.torus(0.108, 0.02, 4, 10); r.rotateX(PI / 2); r.translate(x, y, z); B.add(r, T.rope); } }
  { const [lx, lz] = hp(H.L * 0.5, hw / 2 + 0.05), [lx2, lz2] = hp(H.L * 0.5, hw / 2 + 0.12); for (const k of [-1, 1]) { const ox = H.ux * k * 0.18, oz = H.uz * k * 0.18; B.add(bar(V(lx + ox, 0.3, lz + oz), V(lx2 + ox, -1.1, lz2 + oz), 0.04, 0.006), '#8a7a68'); } for (let k = 1; k < 5; k++) { const t = k / 5, r = G.cyl(0.015, 0.015, 0.36, 4); r.rotateZ(PI / 2); r.rotateY(Math.atan2(H.ux, H.uz) + PI / 2); r.translate(lerp(lx, lx2, t), 0.3 - t * 1.3, lerp(lz, lz2, t)); B.add(r, '#a8987e'); } }
  // the gear on the head: a coil, fish boxes, a bucket, a crab pot
  { const [x, z] = hp(H.L - 0.45, -hw / 2 + 0.45); B.at([x, 0, z], 0, () => ropeCoil(B, 0.22)); }
  { const [x, z] = hp(0.5, -hw / 2 + 0.45); B.at([x, 0, z], 0.3, () => fishBox(B, { n: 2 })); }
  { const [x, z] = hp(H.L * 0.55, -0.1); B.at([x, 0, z], 0, () => bucket(B, { r: 0.12, h: 0.18, color: '#8aa0b8' })); }
  { const [x, z] = hp(0.45, 0.35); B.at([x, 0, z], 0.5, () => crabPot(B, 0.2)); }
  // Funaki's boat alongside the head, its bow out to sea, its lines made fast to the outer bollards
  const by = tide - 0.13, [bcx, bcz] = hp(H.L * 0.5 - 1.25, hw / 2 + 0.62), byaw = Math.atan2(dir[0], dir[1]) - PI / 2;
  B.at([bcx, by, bcz], byaw, () => fishingBoat(B, { L: 3.5 }));
  const onBoat = (x) => V(bcx + dir[0] * x, by + 0.66, bcz + dir[1] * x);
  for (const [bi, x] of [[1, 1.3], [0, -1.35]]) { const a = V(...bol[bi]), e = onBoat(x), m = a.clone().lerp(e, 0.5); m.y -= 0.22; B.add(tube([{ p: a, r: 0.016 }, { p: m, r: 0.016 }, { p: e, r: 0.016 }], 3, false), T.rope); }
  const [lx, lz] = hp(H.L - 0.3, -hw / 2 + 0.12);
  return { lamp: [lx, lz] };
}

// ------------------------------------------------------------------ the square, the pier, the gates, fences, the shore
const KEYMAP = { rock: 'rock', reed: 'd:reed', grass: 'd:grass', body: 'd:body', stone: 'd:stone', bark: 'bark', foliage: 'foliage', 'cards:pine': 'cards:pine' };
/** a tidepool asset's buckets in the village placer's batch layout (non-indexed position / normal / uv / colour; the
 *  card soups stay as they are) */
function normAsset(pc) {
  const out = {};
  for (const k of Object.keys(pc)) { const g = pc[k]; if (!g?.isBufferGeometry || !KEYMAP[k]) continue; out[k] = k.startsWith('cards:') ? g : merge([g.index ? g.toNonIndexed() : g]); }
  return out;
}
// small ground dressing goes into the region's merged prop chunks (no draw calls of its own): its bucket there
const STATIC = { rock: 'body', body: 'body', stone: 'body', reed: 'leaf', grass: 'leaf' };
/** Shiokaze's static dressing (populate time): the anchor at the top of the square, benches, harbour lamps, the tide
 *  board, the pier out of the boatyard with Funaki's boat at it (walkable decks through the shed and along the pier),
 *  the port gates where the trail crosses the rim, lamp posts along the road, rope fences round the camera side,
 *  drying racks and gear, and the shore: wind-bent black pines behind the houses (the village placer's only batches),
 *  dune grass, beach morning glory, rocks, driftwood, shells and pebbles (merged into the region's prop chunks).
 *  → { lamps, spots, gates } for the runtime */
export function decor(VL, ctx, PL, h0) {
  const S = VL.site, sq = VL.def.square.r, at = (a, d) => slotAt(S, a, d), out = { lamps: [], spots: [], gates: [] };
  const face = p => Math.atan2(S.x - p.x, S.z - p.z);
  const H = (x, z) => ctx.heightAt(x, z), Wd = (x, z) => ctx.waterAt(x, z);
  const solid = (x, z, r) => { ctx.addCollider(x, z, r); ctx.blockCells(x, z, r * 0.8); };
  const inBuilding = (x, z, pad = 0.4) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; return lx > f[0] - pad && lx < f[2] + pad && lz > f[1] - pad && lz < f[3] + pad; });
  const inCamp = (x, z, pad = 0.4) => VL.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad);
  const memo = (k, fn) => (ctx.memo ? ctx.memo('village:' + k, fn) : fn());
  const asset = (k, fn) => memo(k, () => normAsset(fn()));
  const prop = (fn, x, z, rot = 0, o = {}) => ctx.prop(fn, { x, z, y: o.y ?? H(x, z), rot, seed: o.seed ?? ((x * 131 + z * 17) | 0), warp: o.warp ?? 0.02 });
  // the biome's landmarks in and by the clearing (the wreck, the net rack, the tide pools) keep their room
  const taken = [[TP_SITES.wreck[0], TP_SITES.wreck[1], 2.4], [TP_SITES.wreck[0] + 1.2, TP_SITES.wreck[1] - 0.9, 1.6], ...TP_SITES.nets.map(([x, z]) => [x, z, 2.2]), ...TP_SITES.pools.map(([x, z, r]) => [x, z, r + 0.6])];
  const free = (x, z, r) => taken.every(t => Math.hypot(t[0] - x, t[1] - z) > t[2] + r), take = (x, z, r) => taken.push([x, z, r]);
  let seed = 7301; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the scattered ground dressing, gathered into one merged prop at the site
  const scatter = [], strew = (pc, x, z, { rot = 0, s = 1, y } = {}) => scatter.push({ pc, x, z, y: y ?? H(x, z), rot, s });

  // the port's ground: sand between the houses (the region's meadow grass thins out in the clearing; dune grass keeps
  // a band round the rim), damp sand toward the water
  ctx.paint('grass', S.x, S.z, S.r - 1.0, 0.12, 0.35); ctx.paint('sand', S.x, S.z, S.r - 0.6, 0.6, 0.4); ctx.paint('moss', S.x, S.z, S.r, 0, 0.4);
  ctx.paint('grass', S.x, S.z, sq + 0.6, 0, 0.3); // (the paved square keeps none)
  if (!VL.saved) for (const c of VL.camps) ctx.paint('sand', c.x, c.z, c.r + 0.9, 0, 0.5); // (the siege camps keep their trampled earth: sand draws over dirt)
  // the old anchor at the top-left of the square, on a stone with its chain, rope and glass floats
  { const p = at(-14, sq + 1.0), rot = face(p); prop(B => anchorMonument(B), p.x, p.z, rot, { y: h0, seed: 41 }); solid(p.x, p.z, 0.75); take(p.x, p.z, 1.2);
    out.spots.push({ x: p.x + Math.sin(rot) * 1.15, z: p.z + Math.cos(rot) * 1.15, face: rot + PI, pose: 'admire', w: 1, dur: [8, 14], emote: ['sparkle', 'note'] }); }
  // benches facing the square (villagers sit on them), the tide board
  for (const a of [18, 74]) { const p = at(a, sq + 1.35), r = face(p); if (!free(p.x, p.z, 0.6)) continue; prop(B => driftBench(B, 1.1), p.x, p.z, r, { y: h0, seed: 43 + a }); solid(p.x, p.z, 0.5); take(p.x, p.z, 0.9); out.spots.push({ x: p.x, z: p.z, face: r, seat: true, seatY: h0 + 0.42, w: 1.2, dur: [16, 30], emote: ['note', 'heart', 'zzz'] }); }
  { const p = at(102, sq + 1.6), r = face(p); prop(B => tideBoard(B), p.x, p.z, r, { y: h0, seed: 47 }); solid(p.x, p.z, 0.4); take(p.x, p.z, 0.8);
    out.spots.push({ x: p.x + Math.sin(r) * 0.9, z: p.z + Math.cos(r) * 0.9, face: r + PI, pose: 'read', w: 0.9, dur: [6, 11], fidget: ['scratchHead', 'nod'], emote: ['note', 'sparkle'] }); }
  // harbour lamps round the square
  for (const a of [-40, 30, 172]) {
    const p = at(a, sq + 0.9); if (inBuilding(p.x, p.z, 0.3) || inCamp(p.x, p.z, 0) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 0.5 || !free(p.x, p.z, 0.3)) continue;
    const rot = face(p) + PI / 2; let hook = null;
    prop(B => { hook = lanternPost(B); }, p.x, p.z, rot, { y: h0, seed: 51 + a });
    solid(p.x, p.z, 0.18); take(p.x, p.z, 0.5);
    const c = Math.cos(rot), s = Math.sin(rot);
    out.lamps.push({ x: p.x + hook[0] * c + hook[2] * s, y: h0 + hook[1], z: p.z - hook[0] * s + hook[2] * c, color: '#f0a050' });
  }
  // ---- the pier: through the boatyard's shed (a walkway deck along its closed side) and out into the bay
  const yard = VL.buildings.find(b => b.kind === 'boatwright');
  if (yard) {
    const BY = BOATYARD, P = BY.pier, Fz = BY.zc + BY.d / 2, Bk = BY.zc - BY.d / 2, W = (x, z) => { const q = VL.local(yard, x, z); return [q.x, q.z]; };
    let info = null;
    prop(B => { info = pierAlong(B, { pts: P.pts, w: P.w, hw: P.hw, n: P.n, dir: P.dir, tide: -0.3 - h0 - 0.05 }); }, yard.x, yard.z, yard.rot, { y: h0, seed: 61, warp: 0.008 });
    const y = h0 + BY.floor;
    ctx.addDeck({ pts: [W(BY.walkX, Fz + 0.45), W(BY.walkX, Bk - 0.15)], y: [y, y], w: 0.9 });
    ctx.addDeck({ pts: P.pts.slice(0, 3).map(([x, z]) => W(x, z)), y: [y, y, y], w: P.w });
    ctx.addDeck({ pts: P.pts.slice(2).map(([x, z]) => W(x, z)), y: [y, y], w: P.hw });
    // the workshop strip beside the walkway is solid too (the yard's footprint covers the hull side only)
    for (let z = Fz - 0.1; z >= Bk + 0.1; z -= 0.45) for (const x of [BY.walkX + 0.68, BY.walkX + 1.2, BY.x1 - 0.25]) { const [cx, cz] = W(x, z); ctx.addCollider(cx, cz, 0.22); }
    // the lamp post at the head (its hook joins the village lamps)
    { const [lx, lz] = W(info.lamp[0], info.lamp[1]), r2 = yard.rot + Math.atan2(P.dir[0], P.dir[1]) + PI / 2; let hook = null; prop(B => { hook = lanternPost(B); }, lx, lz, r2, { y, seed: 67 }); const c = Math.cos(r2), s = Math.sin(r2); out.lamps.push({ x: lx + hook[0] * c + hook[2] * s, y: y + hook[1], z: lz - hook[0] * s + hook[2] * c, color: '#f0a050' }); ctx.addCollider(lx, lz, 0.16); }
    // kelp swaying round the piles
    const kv = [0, 1, 2].map(v => asset('kelp' + v, () => A.kelp(v, 0.6)));
    for (let i = 0; i < 30; i++) {
      const t = rr(), k = Math.min(P.pts.length - 2, Math.floor(t * (P.pts.length - 1))), f = t * (P.pts.length - 1) - k, a = P.pts[k], b = P.pts[k + 1], o = (rr() - 0.5) * 4.5;
      const [kx, kz] = W(lerp(a[0], b[0], f) + P.n[0] * o, lerp(a[1], b[1], f) + P.n[1] * o), wd = Wd(kx, kz); if (wd < 0.2 || wd > 1.6) continue;
      strew(kv[i % 3], kx, kz, { rot: rr() * TAU, s: 0.7 + wd * 0.7, y: ctx.groundAt ? ctx.groundAt(kx, kz) : H(kx, kz) });
    }
  }
  // ---- the road: port gates where it crosses the rim, lamp posts on its far side
  // (each gate stands where the trail crosses a ring inside the rim: the first ring whose posts clear the buildings)
  const tr = ctx.plan.trail, R = S.r - 2.4, cross = [], crossAt = Rr => { const o = []; for (let i = 1; i < tr.length; i++) {
    const d0 = Math.hypot(tr[i - 1][0] - S.x, tr[i - 1][1] - S.z), d1 = Math.hypot(tr[i][0] - S.x, tr[i][1] - S.z);
    if ((d0 - Rr) * (d1 - Rr) < 0) { const k = (Rr - d0) / (d1 - d0), x = tr[i - 1][0] + (tr[i][0] - tr[i - 1][0]) * k, z = tr[i - 1][1] + (tr[i][1] - tr[i - 1][1]) * k; o.push({ x, z, tx: tr[i][0] - tr[i - 1][0], tz: tr[i][1] - tr[i - 1][1] }); }
  } return o; };
  const postsClear = c => { const L = Math.hypot(c.tx, c.tz) || 1, tx = c.tx / L, tz = c.tz / L; return [-1, 1].every(s => !inBuilding(c.x + tz * s * 1.8, c.z - tx * s * 1.8, 1.0)); };
  const rings = [R, R + 0.6, R + 1.2, R + 1.7].map(crossAt);
  for (let k = 0; k < rings[0].length; k++) cross.push(rings.map(r => r[k]).find(c => c && postsClear(c)) || rings[0][k]);
  for (const c of cross) {
    const L = Math.hypot(c.tx, c.tz) || 1, tx = c.tx / L, tz = c.tz / L, rot = Math.atan2(tx, tz);
    prop(B => gate(B, { w: 3.6 }), c.x, c.z, rot, { seed: 51 });
    for (const s of [-1, 1]) solid(c.x + tz * s * 1.8, c.z - tx * s * 1.8, 0.24);
    take(c.x, c.z, 2.2);
  }
  out.gates = cross;
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i], seg = Math.hypot(x1 - x0, z1 - z0); acc += seg;
    if (acc < 4.4) continue;
    const dS = Math.hypot(x1 - S.x, z1 - S.z); if (dS > R - 0.6 || dS < sq + 1.4) continue;
    acc = 0;
    const tx = (x1 - x0) / (seg || 1), tz = (z1 - z0) / (seg || 1); let nx = -tz, nz2 = tx; if (nx + nz2 > 0) { nx = -nx; nz2 = -nz2; }
    const x = x1 + nx * (ctx.plan.trailW + 1.0), z = z1 + nz2 * (ctx.plan.trailW + 1.0);
    if (inBuilding(x, z, 0.6) || inCamp(x, z, 0) || !free(x, z, 0.5)) continue;
    const rot = Math.atan2(-nx, -nz2) + PI / 2; let hook = null;
    prop(B => { hook = lanternPost(B); }, x, z, rot, { seed: 61 + i });
    solid(x, z, 0.16); take(x, z, 0.5);
    const c = Math.cos(rot), s = Math.sin(rot);
    out.lamps.push({ x: x + hook[0] * c + hook[2] * s, y: H(x, z) + hook[1], z: z - hook[0] * s + hook[2] * c, color: '#f0c860' });
  }
  // rope fences of driftwood posts round the camera side of the rim, between the two gates (low: they never hide the hero)
  const ga = cross.map(c => slotOf(S, c.x, c.z).a).sort((a, b) => a - b);
  if (ga.length === 2) {
    const fr = S.r - 1.0, a0 = ga[1] + 9, a1 = ga[0] + 360 - 9, n = Math.max(2, Math.round((a1 - a0) / 360 * TAU * fr / 2.4));
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n, p = at(aa, fr), q = at(ab, fr), L = Math.hypot(q.x - p.x, q.z - p.z), mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      if (inCamp(mx, mz, 1) || inBuilding(mx, mz, 0.5) || !free(mx, mz, 0.6) || Wd(p.x, p.z) > 0.05 || Wd(q.x, q.z) > 0.05) continue;
      prop(B => ropeFence(B, L * 0.98, i), p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z), { seed: 81 + i });
      for (let k = 0; k <= 2; k++) ctx.addCollider(p.x + (q.x - p.x) * k / 2, p.z + (q.z - p.z) * k / 2, 0.16);
    }
  }
  // ---- port gear in the gaps: fish-drying racks, a squid line, crab pots, floats, upturned dinghies
  const gear = [[64, 10.6, 'himono'], [-18, 12.6, 'pots'], [16, 14.2, 'floats'], [112, 11.2, 'dinghy'], [-128, 11.4, 'squid'], [138, 11.5, 'pots'], [-170, 11.2, 'dinghy'], [96, 13.4, 'himono']];
  for (const [a, d, kind] of gear) {
    const p = at(a, d); if (inBuilding(p.x, p.z, 0.4) || inCamp(p.x, p.z, 0.2) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 0.6 || Wd(p.x, p.z) > 0.05 || !free(p.x, p.z, 0.8)) continue;
    const rot = face(p) + (kind === 'himono' || kind === 'squid' ? PI / 2 : rr() * 0.6);
    prop(B => portGear(B, kind), p.x, p.z, rot, { seed: 91 + a });
    solid(p.x, p.z, kind === 'pots' || kind === 'floats' ? 0.35 : 0.55); take(p.x, p.z, 1.0);
    if (kind === 'himono') out.spots.push({ x: p.x + Math.sin(face(p)) * 0.9, z: p.z + Math.cos(face(p)) * 0.9, face: face(p) + PI, pose: 'admire', w: 0.7, dur: [6, 12], emote: ['note'] });
  }
  // ---- the shore: wind-bent black pines behind the houses (the placer: bark, foliage, cards), the low dressing strewn
  const pines = [0, 1, 2].map(v => asset('pine' + v, () => A.coastPine(31 + v)));
  for (let i = 0; i < 24; i++) {
    const a = -26 + i / 23 * 106 + (rr() - 0.5) * 8, d = S.r - 0.2 + rr() * 2.4, p = at(a, d);
    if (inBuilding(p.x, p.z, 1.1) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 2.0 || Wd(p.x, p.z) > 0.01 || H(p.x, p.z) < 0.2 || !free(p.x, p.z, 1.3)) continue;
    const pc = pines[i % 3], y = H(p.x, p.z) - 0.05, rot = rr() * 0.5 - 0.25, s = 0.62 + rr() * 0.3;
    for (const k in pc) PL.put(KEYMAP[k], pc[k], p.x, y, p.z, { rot, s });
    ctx.addCollider(p.x, p.z, 0.4); ctx.blockCells(p.x, p.z, 0.5); take(p.x, p.z, 1.6);
    ctx.paintFx('shade', p.x, p.z, 3.2, 0.7);
  }
  const grassV = [1, 2, 3].map(v => asset('dune' + v, () => A.duneGrass(v))), gloryV = [1, 2, 3].map(v => asset('glory' + v, () => A.morningGlory(v)));
  const boulV = [0, 1, 2, 3].map(v => asset('boul' + v, () => A.boulder(50 + v, 0.7, 0.55 + v * 0.08))), driftV = [1, 2].map(v => asset('drift' + v, () => A.driftwood(v, 1.5 + v * 0.4)));
  const shellV = [['scallop', 1], ['spiral', 2], ['cowrie', 3]].map(([k, s]) => asset('shell' + s, () => A.shell(s, k))), starV = [5, 6].map(s => asset('star' + s, () => A.starfish(s))), pebV = [1, 2].map(s => asset('peb' + s, () => A.pebbles(s)));
  for (let i = 0; i < 300; i++) {
    const a = rr() * 360 - 180, d = 5.6 + rr() * (S.r - 4.2), p = at(a, d), x = p.x, z = p.z, y = H(x, z), wd = Wd(x, z), k = rr();
    if (inBuilding(x, z, 0.7) || ctx.pathDist(x, z) < ctx.plan.trailW + 0.4 || inCamp(x, z, 0.3) || !free(x, z, 0.35)) continue;
    const cam = Math.abs(a) > 100, beach = y < h0 - 0.2;
    if (wd > 0.03) { if (wd < 0.4 && k < 0.3) strew(pebV[i % 2], x, z, { rot: rr() * TAU, s: 1 + rr() * 0.6, y: y + 0.01 }); continue; }
    if (beach) {
      if (k < 0.3) strew(shellV[i % 3], x, z, { rot: rr() * TAU, s: 1.3 + rr() * 0.7, y: y + 0.005 });
      else if (k < 0.42) strew(starV[i % 2], x, z, { rot: rr() * TAU, s: 1.2 + rr() * 0.4, y: y + 0.005 });
      else if (k < 0.58) strew(pebV[i % 2], x, z, { rot: rr() * TAU, s: 0.9 + rr() * 0.6, y: y - 0.01 });
      else if (k < 0.68 && free(x, z, 1.2)) { strew(driftV[i % 2], x, z, { rot: rr() * TAU, s: 0.7 + rr() * 0.4, y: y - 0.04 }); take(x, z, 1.1); }
      else if (k < 0.8) { strew(boulV[i % 4], x, z, { rot: rr() * TAU, s: 0.35 + rr() * 0.4, y: y - 0.06 }); take(x, z, 0.5); }
      else strew(grassV[i % 3], x, z, { rot: rr() * TAU, s: 0.7 + rr() * 0.4, y: y - 0.03 });
      continue;
    }
    if (!cam && d < 8.5 && rr() < 0.6) continue;
    if (k < 0.46) { strew(grassV[i % 3], x, z, { rot: rr() * TAU, s: 0.75 + rr() * 0.55, y: y - 0.03 }); take(x, z, 0.35); }
    else if (k < 0.7) { strew(gloryV[i % 3], x, z, { rot: rr() * TAU, s: 1 + rr() * 0.5, y: y - 0.005 }); take(x, z, 0.6); }
    else if (k < 0.8 && free(x, z, 0.7)) { strew(boulV[i % 4], x, z, { rot: rr() * TAU, s: 0.3 + rr() * 0.35, y: y - 0.05 }); take(x, z, 0.5); }
    else if (k < 0.92) strew(shellV[i % 3], x, z, { rot: rr() * TAU, s: 1.2 + rr() * 0.6, y: y + 0.005 });
    else strew(pebV[i % 2], x, z, { rot: rr() * TAU, s: 0.8 + rr() * 0.5, y: y - 0.01 });
  }
  ctx.prop(B => { for (const it of scatter) B.at([it.x - S.x, it.y - h0, it.z - S.z], it.rot, () => { for (const k in it.pc) if (STATIC[k]) B.add(it.pc[k].clone(), null, STATIC[k]); }, it.s); }, { x: S.x, z: S.z, y: h0, rot: 0, seed: 97, warp: 0 });
  return out;
}

/** the old anchor monument: a big iron anchor leaning on a stone with its chain run out, a rope coil and glass floats */
function anchorMonument(B) {
  const st = puff(V(0, 0, 0), 0.62, { detail: 2, noise: 0.22, squash: 0.55, seed: 13 }); st.scale(1.25, 1, 0.9); st.translate(0, 0.22, -0.15); B.add(st, (p, n, o) => o.set(T.stone).lerp(new THREE.Color('#d8d4cc'), clamp(n.y) * 0.3).lerp(new THREE.Color('#7a8a5a'), n.y > 0.7 && nz(p.x * 4, p.z * 4) > 0.3 ? 0.4 : 0));
  B.at([0, 0.32, 0.12], 0, () => {
    const ir = '#4e4a54', sh = G.cyl(0.07, 0.08, 1.7, 9); sh.translate(0, 0.85, 0); B.add(sh, ir);
    const ring = G.torus(0.16, 0.045, 6, 14); ring.translate(0, 1.85, 0); B.add(ring, ir);
    const stock = G.cyl(0.07, 0.07, 1.1, 8); stock.rotateZ(PI / 2); stock.translate(0, 1.5, 0); B.add(stock, '#7a5a42');
    for (const s of [-1, 1]) { const bn = G.torus(0.075, 0.018, 4, 8); bn.rotateY(PI / 2); bn.translate(s * 0.4, 1.5, 0); B.add(bn, C.iron); }
    const arms = G.torus(0.6, 0.075, 7, 18, PI * 0.78); arms.rotateZ(PI + PI * 0.11); arms.translate(0, 0.62, 0); B.add(arms, ir);
    for (const s of [-1, 1]) { const fl = G.cone(0.17, 0.36, 4); fl.scale(1, 1, 0.35); fl.rotateZ(-s * 0.55); fl.translate(s * 0.58, 0.55, 0); B.add(fl, ir); }
    const cr = G.sph(0.09, 8, 6); cr.translate(0, 0.02, 0); B.add(cr, ir);
    const rs = G.cyl(0.081, 0.081, 0.4, 9, true); rs.translate(0, 0.5, 0); B.add(rs, '#8a5a3a'); // (a rust band)
  }, 1, -0.32, 0);
  // the chain run out over the stone into the sand
  for (let i = 0; i < 13; i++) { const t = i / 12, l = G.torus(0.055, 0.019, 4, 8); l.rotateY(i % 2 ? PI / 2 : 0); l.rotateX(0.9 - t * 0.7); l.translate(0.05 + 0.5 * t, 2.0 * (1 - t) ** 2 + 0.05 + 0.35 * Math.sin(PI * t) * (1 - t), -0.42 + 1.4 * t); B.add(l, '#5a5660'); }
  B.at([0.75, 0, 0.45], 0, () => ropeCoil(B, 0.24));
  B.at([-0.7, 0, 0.5], 0, () => { for (let i = 0; i < 3; i++) { const f = G.sph(0.11, 10, 8); f.translate((i - 1) * 0.2, 0.11 + (i === 1 ? 0.15 : 0), (i % 2) * 0.1); B.glow(f, ['#8fe0c8', '#f0c070', '#8fc8f0'][i], { tint: 0.55 }); const nt = G.torus(0.11, 0.01, 3, 10); nt.translate((i - 1) * 0.2, 0.11 + (i === 1 ? 0.15 : 0), (i % 2) * 0.1); B.add(nt, T.rope); } });
  B.at([0, 0.42, 0.42], -0.25, () => { const pq = G.box(0.4, 0.22, 0.03, 0.01); B.add(pq, T.brass); B.at([0, 0, 0.02], 0, () => sym3(B, 'wave', 0.24, '#5a4a2a', 0.01)); }, 1, -0.5, 0);
}
/** the tide board: a roofed notice board with the tide table, a wave chart and two posted notices */
function tideBoard(B) {
  for (const s of [-1, 1]) { const p = G.beam(0.09, 1.7, 0.09, 0.015); p.translate(s * 0.55, 0.85, 0); B.add(p, T.tar); }
  const bd = G.box(1.1, 0.8, 0.05, 0.02); bd.translate(0, 1.1, 0.02); B.add(bd, T.board);
  const sheet = G.box(0.46, 0.6, 0.012, 0); sheet.translate(-0.24, 1.1, 0.055); B.add(sheet, '#f4ecdc');
  for (let k = 0; k < 6; k++) { const ln = G.box(0.36, 0.022, 0.004, 0); ln.translate(-0.24, 1.32 - k * 0.08, 0.063); B.add(ln, k % 2 ? '#3a5a8a' : '#2a2028'); }
  B.at([0.25, 1.24, 0.06], 0, () => sym3(B, 'wave', 0.34, '#3a8ab8', 0.012));
  for (const [x, y, c] of [[0.17, 0.92, '#fff0c8'], [0.36, 0.95, '#ffd8e0']]) { const n = G.box(0.16, 0.2, 0.01, 0); n.rotateZ((x - 0.25) * 0.6); n.translate(x, y, 0.058); B.add(n, c); const pin = G.sph(0.012, 4, 3); pin.translate(x, y + 0.08, 0.066); B.add(pin, T.red); }
  const cap = G.box(1.35, 0.06, 0.32, 0.02); cap.rotateX(0.15); cap.translate(0, 1.6, 0.02); B.add(cap, T.tile);
  const cap2 = G.box(1.4, 0.05, 0.12, 0.02); cap2.translate(0, 1.66, -0.02); B.add(cap2, shade(T.tile, 0.8));
}
/** a stretch of driftwood-post rope fence along local +z, length L */
function ropeFence(B, L, i = 0) {
  const n = Math.max(1, Math.round(L / 1.2)), hgt = 0.72;
  for (let k = 0; k <= n; k++) { const z = k * L / n, p = G.cyl(0.055, 0.07, hgt + 0.1, 6); p.rotateZ(hz(k + i * 9) * 0.1 - 0.05); p.translate(0, (hgt + 0.1) / 2, z); B.add(p, (q, nn, o) => o.set(T.drift).multiplyScalar(0.8 + 0.22 * Math.sin(q.y * 14) ** 2)); }
  for (const y of [hgt - 0.08, hgt * 0.45]) for (let k = 0; k < n; k++) { const z0 = k * L / n, z1 = (k + 1) * L / n, pts = []; for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push({ p: V(0, y - Math.sin(t * PI) * 0.1, lerp(z0, z1, t)), r: 0.016 }); } B.add(tube(pts, 3, false), T.rope); }
  if ((i % 3) === 1) { const f = G.sph(0.08, 8, 6); f.translate(0.05, hgt - 0.22, L / (2 * n)); B.add(f, (p, nn, o) => o.set(Math.abs(p.y - (hgt - 0.22)) < 0.02 ? '#fff6ea' : T.red)); }
  if ((i % 4) === 2) { const nt = G.plane(0.9, 0.42, 4, 2); nt.rotateY(PI / 2); nt.translate(0.03, hgt - 0.25, L / (2 * n) + 0.2); B.add(nt, (p, nn, o) => o.set(T.net).multiplyScalar(Math.abs(Math.sin(p.z * 45)) < 0.25 || Math.abs(Math.sin(p.y * 45)) < 0.25 ? 1 : 0.6)); }
}
/** port gear set down in the gaps between the houses (local frame, front = +z) */
function portGear(B, kind) {
  if (kind === 'himono') { // a fish-drying rack: a slatted tray on trestles with split fish laid out in rows
    for (const s of [-1, 1]) for (const k of [-1, 1]) B.add(bar(V(s * 0.75, 0, k * 0.28), V(s * 0.75, 0.82, 0), 0.04, 0), '#8a7a68');
    const tr = G.box(1.7, 0.03, 0.75, 0.01); tr.translate(0, 0.84, 0); B.add(tr, (p, n, o) => o.set('#c8b890').multiplyScalar(Math.abs(Math.sin(p.x * 60)) < 0.3 || Math.abs(Math.sin(p.z * 60)) < 0.3 ? 0.7 : 1));
    for (let i = 0; i < 10; i++) B.at([-0.66 + (i % 5) * 0.33, 0.86, (Math.floor(i / 5) - 0.5) * 0.34], PI / 2, () => { const f = G.sph(0.5, 7, 4); f.scale(0.12, 0.02, 0.26); B.add(f, (p, n, o) => o.set(i % 2 ? '#e8b888' : '#d8a07a').lerp(new THREE.Color('#f4e0c8'), clamp(0.5 - Math.abs(p.x) * 8))); const tl = G.box(0.08, 0.01, 0.05, 0); tl.translate(0, 0.005, -0.15); B.add(tl, '#a87858'); });
  } else if (kind === 'squid') { // lines of squid drying in the sun between two posts
    for (const s of [-1, 1]) { const p = G.cyl(0.04, 0.05, 1.7, 6); p.translate(s * 1.0, 0.85, 0); B.add(p, T.drift); }
    for (const y of [1.6, 1.25]) {
      const pts = []; for (let j = 0; j <= 8; j++) { const t = j / 8; pts.push({ p: V(-1 + 2 * t, y - Math.sin(t * PI) * 0.08, 0), r: 0.008 }); } B.add(tube(pts, 3, false), '#5a4a40');
      for (let k = 0; k < 6; k++) { const x = -0.8 + k * 0.32, yy = y - Math.sin((x + 1) / 2 * PI) * 0.08; const m = G.sph(0.5, 7, 5); m.scale(0.1, 0.24, 0.02); m.translate(x, yy - 0.13, 0); B.add(m, (p, n, o) => o.set('#f4e4d8').lerp(new THREE.Color('#e8b8a8'), clamp((p.y - yy + 0.13) * 4 + 0.3) * 0.4)); const fin = G.cyl(0.07, 0.07, 0.008, 3); fin.rotateX(PI / 2); fin.translate(x, yy - 0.01, 0); B.add(fin, '#f0dcd0'); for (let t = 0; t < 4; t++) { const tn = G.box(0.008, 0.1, 0.004, 0); tn.translate(x - 0.03 + t * 0.02, yy - 0.3, 0); B.add(tn, '#e8c8c0'); } }
    }
  } else if (kind === 'dinghy') { // an old dinghy turned turtle on two logs, oars across it
    for (const s of [-1, 1]) { const lg = G.cyl(0.08, 0.08, 1.1, 7); lg.rotateX(PI / 2); lg.translate(s * 0.5, 0.08, 0); B.add(lg, T.driftDk); }
    B.at([0, 0.42, 0], 0, () => dinghy(B, { L: 1.8, color: '#e8e0d0', trim: T.coral }), 1, PI, 0);
    for (const s of [-1, 1]) B.add(bar(V(-0.9, 0.46, s * 0.12), V(0.9, 0.5, s * 0.2), 0.035, 0), '#c8a070');
  } else if (kind === 'pots') { // crab pots stacked by a coil of rope
    crabPot(B, 0.22); B.at([0.42, 0, 0.12], 0.4, () => crabPot(B, 0.2)); B.at([0.2, 0.36, 0.05], 0.8, () => crabPot(B, 0.18)); B.at([-0.45, 0, 0.25], 0, () => ropeCoil(B, 0.2, 3));
  } else if (kind === 'floats') { // glass floats in a net heap and red buoys
    for (let i = 0; i < 6; i++) { const f = G.sph(0.12, 10, 7); f.translate(Math.cos(i * 1.9) * 0.22, 0.12 + (i > 3 ? 0.18 : 0), Math.sin(i * 1.9) * 0.2); B.glow(f, ['#8fe0c8', '#f0c070', '#8fc8f0', '#c8f0ff', '#78c8a8', '#a8e8ff'][i], { tint: 0.55 }); }
    const nt = puff(V(0, 0, 0), 0.34, { detail: 1, noise: 0.3, squash: 0.5, seed: 5 }); nt.translate(0, 0.12, 0); B.add(nt, (p, n, o) => o.set(T.net).multiplyScalar(Math.abs(Math.sin(p.x * 50) * Math.sin(p.z * 50)) > 0.3 ? 0.5 : 1));
    for (let i = 0; i < 3; i++) { const b = G.sph(0.16, 10, 7); b.scale(1, 1.15, 1); b.translate(0.55 + (i % 2) * 0.3, 0.17, -0.2 + i * 0.25); B.add(b, (p, n, o) => o.set(Math.abs(p.y - 0.17) < 0.05 ? '#fff6ea' : T.red)); }
  }
}

// ------------------------------------------------------------------ the saved village's own dressing
/** saved-only dressing: where the siege camps stood, what the port puts back — nets drying on racks by the pier, the
 *  morning's catch on a handcart, the cargo yard's crates — plus big-catch flags and flowers planted in old buoys and a
 *  retired dinghy (data.js camps[].saved: 'nets' | 'catch' | 'crates') */
export function savedDecor(VL, B, h0) {
  const S = VL.site, sq = VL.def.square.r;
  for (const c of VL.camps) {
    const f = screenAt(S, c.at[0], c.at[1]), yaw = screenYaw(0);
    B.at([f.x, h0, f.z], yaw, () => {
      if (c.saved === 'nets') {
        for (const [x, z, r] of [[-0.9, -0.6, 0.15], [1.2, -1.0, -0.2]]) B.at([x, 0, z], r, () => netRackKit(B));
        B.at([0.3, 0, 1.0], 0.3, () => fishBox(B, { n: 2 })); B.at([-0.9, 0, 1.1], 0, () => ropeCoil(B, 0.22)); B.at([1.6, 0, 0.6], 0, () => buoyPlanter(B, 0.17, 3));
      } else if (c.saved === 'catch') {
        B.at([-0.3, 0, 0], 0.2, () => handcart(B));
        B.at([1.3, 0, 0.5], 0, () => { const tub = G.cyl(0.36, 0.32, 0.36, 14, true); tub.translate(0, 0.18, 0); B.add(tub, '#8a7058'); for (const y of [0.08, 0.3]) { const hp = G.torus(0.35, 0.013, 3, 14); hp.rotateX(PI / 2); hp.translate(0, y, 0); B.add(hp, C.iron); } const wt = G.disc(0.33, 14); wt.rotateX(-PI / 2); wt.translate(0, 0.31, 0); B.add(wt, '#3a8ab0', 'water'); for (let k = 0; k < 3; k++) B.at([Math.cos(k * 2.1) * 0.14, 0.31, Math.sin(k * 2.1) * 0.14], k * 2.1, () => fish(B, 'saba', 0.8)); });
        B.at([-1.6, 0, 0.7], 0, () => { for (let i = 0; i < 3; i++) B.at([i * 0.36 - 0.36, 0, (i % 2) * 0.14], i, () => { const bk = G.cyl(0.16, 0.13, 0.2, 10); bk.translate(0, 0.1, 0); B.add(bk, (p, n, o) => o.set(Math.sin(p.y * 70) > 0 ? '#c8a060' : '#b08848')); for (let k = 0; k < 6; k++) { const s2 = G.sph(0.045, 6, 4); s2.scale(1.3, 0.6, 1); s2.translate(Math.cos(k * 1.3) * 0.08, 0.21, Math.sin(k * 1.3) * 0.08); B.add(s2, ['#3a3a4a', '#e8d8c8', '#c89a7a'][i]); } }); });
        B.at([0.4, 0, -1.2], 0, () => tairyoFlag(B, { h: 3.0, w: 0.95, seed: 2 }));
      } else if (c.saved === 'crates') {
        for (const [x, z, n, r, wood] of [[-1.2, -0.4, 3, 0.1, '#6a9ac8'], [-0.6, -0.5, 2, -0.15, C.woodPale], [-0.9, 0.3, 1, 0.3, '#c8a878'], [0.9, -0.7, 2, 0.05, C.woodPale]]) for (let k = 0; k < n; k++) B.at([x, k * 0.4, z], r + k * 0.12, () => crate(B, { s: 0.4, wood }));
        for (const [x, z] of [[0.3, 0.4], [0.75, 0.6]]) B.at([x, 0, z], 0, () => barrel(B, { r: 0.2, h: 0.46, wood: '#8a7a68' }));
        B.at([0.55, 0.2, 1.05], 0.5, () => barrel(B, { r: 0.19, h: 0.44, wood: '#7a6a5a', lid: false }), 1, PI / 2, 0);
        for (const [x, z, r] of [[1.6, -0.2, 0.3], [1.85, 0.25, -0.4]]) B.at([x, 0, z], r, () => sack(B, { r: 0.2, color: '#e8dcc0' }));
        B.at([-1.8, 0, 0.9], 0.2, () => ropeCoil(B, 0.26));
        B.at([1.3, 0, 1.1], 0, () => buoyPlanter(B, 0.17, 7));
      }
    });
  }
  // flowers planted in old buoys round the camera side, a retired dinghy full of flowers by the shrine
  for (const a of [-118, 118, 168, -166, 96, -96]) { const p = slotAt(S, a, sq + 0.7); B.at([p.x, h0, p.z], 0, () => buoyPlanter(B, 0.17, a + 300)); }
  { const p = slotAt(S, 176, sq + 2.2); B.at([p.x, h0, p.z], screenYaw(0), () => { dinghy(B, { L: 1.6, color: '#e8e0d0', trim: T.teal }); for (let i = 0; i < 4; i++) B.at([-0.45 + i * 0.3, 0.16, 0], 0, () => flowerPot(B, { r: 0.13, seed: i + 40, colors: ['#ff8fb0', '#ffffff', '#ffd24a', '#8fd0ff'] })); }); }
}
/** a kit net-drying rack: two poles, a net hung from the bar, glass floats tied along it */
function netRackKit(B) {
  for (const sx of [-1, 1]) { const p = G.cyl(0.05, 0.065, 1.8, 7); p.translate(sx * 1.1, 0.9, 0); B.add(p, T.drift); }
  const pole = G.cyl(0.035, 0.035, 2.5, 6); pole.rotateZ(PI / 2); pole.translate(0, 1.75, 0); B.add(pole, '#a08466');
  B.at([0, 0, 0.02], 0, () => net(B, { w: 2.0, h: 1.2, yTop: 1.72, color: T.net }));
  B.at([0.45, 1.72, 0.08], 0, () => glassFloats(B, { n: 3 }));
}
/** a two-wheeled handcart loaded with fish boxes full of the morning's catch on ice */
function handcart(B) {
  const bed = G.box(1.3, 0.08, 0.8, 0.02); bed.translate(0, 0.5, 0); B.add(bed, '#a8845e');
  for (const sz of [-1, 1]) B.at([0, 0.32, sz * 0.46], 0, () => wheel(B, { r: 0.32 }));
  for (const sz of [-1, 1]) B.add(bar(V(0.6, 0.52, sz * 0.32), V(1.5, 0.78, sz * 0.32), 0.05, 0.01), '#8a6a4a');
  B.add(bar(V(1.48, 0.78, -0.34), V(1.48, 0.78, 0.34), 0.05, 0.01), '#8a6a4a');
  B.add(bar(V(-0.55, 0.0, 0), V(-0.55, 0.5, 0), 0.06, 0.01), '#7a5a42');
  for (const [x, z, k] of [[-0.32, -0.18, 'saba'], [0.3, -0.18, 'tai'], [-0.02, 0.2, 'aji']]) B.at([x, 0.54, z], 0, () => fishBox(B, { w: 0.56, d: 0.36, h: 0.12, fill: B2 => { B2.at([0, -0.02, 0], 0, () => iceBed(B2, 0.5, 0.3)); for (let i = 0; i < 3; i++) B2.at([(i - 1) * 0.15, 0.04, (i % 2 - 0.5) * 0.08], PI / 2 + (i - 1) * 0.2, () => fish(B2, k, 0.85)); } }));
}
