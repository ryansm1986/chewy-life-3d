// Yukimi Spa Village (雪見の湯), the onsen zone's snowy spa village (docs/ZONES.md §2): a hot-spring town under deep
// snow. Dark Ginzan-style timber and warm cream plaster, slate tiles buried under thick rounded snow blankets with
// icicles at every eave, warm amber windows, red chōchin and camellias, steam rising from the bathhouse vents, its
// chimney and the foot bath. The contract is artBamboo.js's: each building builder draws its static model into a kit
// Builder (local frame: front = +z toward the square, the footprint round the origin, ground at y = 0) and returns
//   { fp, door, keeper, seat?, lamps, siege(B), saved(B), steam?: [{ p: [x, y, z], k: 'vent' | 'smoke' | 'pot', saved? }] }
// (steam: this theme's own emitters, puffed by decor().update). village.js places, turns and lists them.
import * as THREE from 'three';
import { G, V, C, PI, shade } from '../../world/buildings/kit.js';
import { roof } from '../../world/buildings/roofs.js';
import { foundation, walls, onFace, shoji, latticeWindow, roundWindow, door, noren as norenPart, STONES } from '../../world/buildings/parts.js';
import { barrel, crate, logPile } from '../../world/buildings/props.js';
import { nobori, parasol, teaBench, bucket, firewood, anvil, choppingBlock } from '../../world/buildings/props2.js';
import { charm, toolRack, towelRack, stoopStone, hangSign } from '../../world/buildings/trim.js';
import { shapeGeo } from '../../world/buildings/symbols.js';
import { tube, puff } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, Noise } from '../../core/util.js';
import * as FL from '../assets/onsenFlora.js';
import { boards, soot, debris, warBanner, waystone } from './art.js';
import { slotAt, slotOf, screenAt, screenYaw } from './data.js';

/** minimap roof colours per building kind (the roofs are all snow, so the map uses each building's own accent) */
export const MAP = { elder: '#b4a07a', inn: '#a8485a', shop: '#e8903a', bathhouse: '#4a5a96', smith: '#5e5a66', waypoint: '#6a7ac8' };
// the palette: Ginzan-dark timber, warm cream plaster, slate tiles, blue-white snow; camellia red, indigo, mikan orange
export const T = {
  timber: '#3a2a24', timberMid: '#5a4032', wood: '#8a6448', woodLight: '#b48c66', deck: '#9c7a5a', bengara: '#6a2e28',
  plaster: '#f2eadc', koshi: '#4e3a30', stone: '#8e94a6', stoneLight: '#a8aebe', stoneDark: '#6c7284',
  tile: '#4c546c', tileEdge: '#363a4c', soffit: '#4a3830', paper: '#fff0d4', paperDim: '#d6d0c4',
  snow: '#f6f9ff', snowSh: '#c6d2ee', snowBlue: '#a2b6e2', ice: '#9fd2ff',
  thatch: '#9a8466', thatchCut: '#c8b088', camellia: '#c8283a', indigo: '#2e3e74', crimson: '#b02a3e', mikan: '#f08a2a', brick: '#7a4436',
};

// ------------------------------------------------------------------ helpers: colour, noise, snow
const _N = new Noise(5113), nz = (x, y) => _N.n2(x, y);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const prof = (t, c) => (1 - c) * t + c * t * t;
const cSnow = new THREE.Color(T.snow), cSnowSh = new THREE.Color(T.snowSh), cSnowB = new THREE.Color(T.snowBlue), cIce = new THREE.Color(T.ice), cIceHi = new THREE.Color('#f0fbff');
/** soft snow by normal: white on top, periwinkle on the sides, deep blue underneath, a little sparkle noise */
const snowCol = (p, n, o) => o.copy(cSnowSh).lerp(cSnow, clamp(n.y * 1.35 - 0.05)).lerp(cSnowB, clamp(-n.y - 0.1) * 0.75)
  .lerp(cSnowSh, 0.22 * clamp(nz(p.x * 0.8 + p.y * 0.5, p.z * 0.8) * 0.9 + 0.1) * clamp(n.y)).multiplyScalar(0.97 + 0.04 * nz(p.x * 6.1 + p.y * 2.3, p.z * 6.1));
/** a soft snow pillow (flattened puff) at p */
function pillow(B, p, r, sq = 0.42, seed = 0, sx = 1, sz = 1) { const g = puff(V(0, 0, 0), r, { detail: 1, noise: 0.22, squash: sq, seed }); g.scale(sx, 1, sz); g.translate(p[0], p[1], p[2]); B.add(g, snowCol); }
/** a rounded snow slab on a flat top (a beam, a post cap, a lantern roof): w × d at height y, thickness t */
function snowSlab(B, x, y, z, w, d, t = 0.08, seed = 0) {
  const g = G.box(w, t, d, Math.min(t * 0.48, w * 0.3, d * 0.3)); g.translate(x, y + t / 2, z); B.add(g, snowCol);
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.5)), along = w >= d;
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; pillow(B, [x + (along ? u * w * 0.9 : 0), y + t * 0.75, z + (along ? 0 : u * d * 0.9)], Math.min(w, d) * 0.42 + 0.03, 0.38, seed + i * 7, along ? 1.2 : 0.9, along ? 0.9 : 1.2); }
}

// ------------------------------------------------------------------ the rounded-rectangle skin (snow blankets)
/** a point on a rounded rectangle (half extents ax × az, corner radius rc) at perimeter fraction f, starting on +x
 *  and running toward +z → [x, z, nx, nz] (evenly spaced by arc length; f = 0.25 is always the +z middle) */
function rrPoint(ax, az, rc, f) {
  rc = Math.max(1e-4, Math.min(rc, ax, az));
  const sx = ax - rc, sz = az - rc, q = PI / 2 * rc, L = 4 * sx + 4 * sz + 4 * q;
  let s = ((f % 1) + 1) % 1 * L;
  const arc = (cx, cz, a0) => { const a = a0 + s / rc; return [cx + Math.cos(a) * rc, cz + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; };
  if (s < sz) return [ax, s, 1, 0]; s -= sz;
  if (s < q) return arc(sx, sz, 0); s -= q;
  if (s < 2 * sx) return [sx - s, az, 0, 1]; s -= 2 * sx;
  if (s < q) return arc(-sx, sz, PI / 2); s -= q;
  if (s < 2 * sz) return [-ax, sz - s, -1, 0]; s -= 2 * sz;
  if (s < q) return arc(-sx, -sz, PI); s -= q;
  if (s < 2 * sx) return [-sx + s, -az, 0, -1]; s -= 2 * sx;
  if (s < q) return arc(sx, -sz, PI * 1.5); s -= q;
  return [ax, -sz + s, 1, 0];
}
/** rings [{ ax, az, rc, y, out }] stacked bottom to top → a closed skin (NS columns); lump(i, k) → [dOut, dY] */
function skin(rings, NS, lump = null, yFn = null) {
  const pos = [], idx = [], rows = [];
  rings.forEach((r, k) => {
    const row = [];
    for (let i = 0; i < NS; i++) {
      const [x, z, nx, nzz] = rrPoint(r.ax, r.az, r.rc, i / NS);
      const l = lump ? lump(i, k, r) : null, out = (r.out || 0) + (l ? l[0] : 0);
      const px = x + nx * out, pz = z + nzz * out, y0 = yFn && r.dy != null ? Math.max(r.y, yFn(px, pz) + r.dy) : r.y;
      pos.push(px, y0 + (l ? l[1] : 0), pz); row.push(pos.length / 3 - 1);
    }
    rows.push(row);
  });
  for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < NS; i++) {
    const a = rows[k][i], b = rows[k][(i + 1) % NS], c = rows[k + 1][i], d = rows[k + 1][(i + 1) % NS];
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return { g, rows, pos };
}
// a roof built turned by +90° (ridge along the caller's z): its local sides as the caller sees them
const ROTMAP = { f: 'r', r: 'b', b: 'l', l: 'f' };
/** one icicle hanging from (x, y, z); keep(side) decides by the caller's side ('f' | 'b' | 'l' | 'r') */
function icicle(B, x, y, z, L) {
  const g = G.cone(0.022 + L * 0.09, L, 5); g.rotateX(PI); g.translate(x, y - L / 2 + 0.015, z);
  B.add(g, (p, nn, out) => out.copy(cIceHi).lerp(cIce, clamp((y + 0.015 - p.y) / L) * 0.8).multiplyScalar(0.92 + 0.12 * clamp(nn.y + 0.6)));
}
const iceKeep = (side, o, rr) => { const s = o.map ? o.map[side] : side; if (o.faces && !o.faces.includes(s)) return false; if (s === 'b' && rr() > (o.back ?? 0.3)) return false; return rr() >= 0.32; };
const iceLen = (o, rr) => (o.len?.[0] ?? 0.07) + ((o.len?.[1] ?? 0.32) - (o.len?.[0] ?? 0.07)) * Math.pow(rr(), 1.6);
/** A snow sheet over a gable roof (ridge along local x): from the front eave over the ridge to the back eave, rolled
 *  lips at both eaves, drooping lips over both gable ends (the gable triangles stay open). X: half length to the barge
 *  edge; az(t): the eave's distance from the ridge at t; t0: where the sheet starts (an irimoya's upper roof: ~tg) */
function snowSheet(B, { X, az, ySurf, t0 = 0, th = 0.15, lip = 0.09, droop = 0.05, endLip = 0.07, seed = 0, ice = null, map = null, faces = null, ridge = 0.06, NX = 30 }) {
  const ph = (seed % 89) * 1.7, rows = [];
  const lipP = (e, k) => [[-0.12, -0.035], [e * 0.5, -droop], [e, th * 0.38], [e * 0.72, th * 0.86], [e * 0.22, th]][k];
  for (let k = 0; k < 5; k++) { const [out, h] = lipP(lip, k); rows.push({ t: t0 + [0, 0, 0, 0.012, 0.045][k], out, h, s: 1, k }); }
  for (const t of [0.1, 0.2, 0.32, 0.45, 0.58, 0.7, 0.8, 0.88, 0.94, 0.98]) if (t > t0 + 0.07) rows.push({ t, out: 0, h: th * (1 + 0.1 * Math.sin(PI * t)) + (t > 0.93 ? ridge * (t - 0.93) / 0.07 : 0), s: 1, k: 9 });
  const n0 = rows.length;
  rows.push({ t: 1, out: 0, h: th + ridge, s: 0, k: 9 });
  for (let i = n0 - 1; i >= 0; i--) rows.push({ ...rows[i], s: -1 });
  // columns across x: the drooping end lip, the flat run, the other end lip; h = Infinity: the row decides
  const cols = [];
  for (let k = 0; k < 5; k++) { const [out, h] = lipP(endLip, k); cols.push({ x: -X - out, h }); }
  for (let i = 1; i < NX; i++) cols.push({ x: -X + 0.06 + (2 * X - 0.12) * i / NX, h: Infinity });
  for (let k = 4; k >= 0; k--) { const [out, h] = lipP(endLip, k); cols.push({ x: X + out, h }); }
  const pos = [], idx = [], NC = cols.length;
  rows.forEach((r, ri) => cols.forEach((c, ci) => {
    const lumpy = r.k >= 4 && c.h === Infinity ? 0.026 * nz(c.x * 1.9 + ph, ri * 0.61) + 0.01 * nz(c.x * 5.3, ri * 1.7 + ph) : 0;
    const dr = r.k === 1 ? -0.04 * Math.max(0, nz(c.x * 2.6 + ph, r.s * 3.1)) : 0, de = c.h !== Infinity && ci % (NC - 1) !== 0 ? -0.03 * Math.max(0, nz(r.t * 9 + ph, c.x)) : 0;
    const y = ySurf(r.t) + Math.min(r.h, c.h) + lumpy + dr + de;
    pos.push(c.x, y, r.s * (az(r.t) + r.out + (r.k <= 3 ? 0.012 * nz(c.x * 3 + ph, ri) : 0)));
  }));
  for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < NC - 1; c++) { const a = r * NC + c, b = a + 1, c2 = a + NC, d = c2 + 1; idx.push(a, b, c2, b, d, c2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  B.add(g, snowCol);
  if (ice) { const rr = mulberry32(seed * 977 + 17), n = Math.round(2 * X / (ice.every ?? 0.15)); for (const s of [1, -1]) for (let i = 0; i < n; i++) { if (!iceKeep(s > 0 ? 'f' : 'b', { ...ice, map, faces }, rr)) continue; const x = -X + 0.05 + (2 * X - 0.1) * (i + rr() * 0.7) / n; icicle(B, x, ySurf(t0) - droop, s * (az(t0) + lip * 0.5 + 0.005), iceLen(ice, rr)); } }
  return { yAt: t => ySurf(t) + th };
}
/** A thick snow blanket over a roof: contour half extents ax(t) × az(t) (t: 0 at the eave → 1 at the ridge), the roof
 *  surface height ySurf(t); a rolled cornice lip that overhangs the eave (lip) and droops over the tile edge (droop),
 *  lumps, a rounded ridge roll; icicles under the lip (ice: { every, len, back }). tTop < 1: an open ring (a skirt
 *  roof's snow) whose inner edge tucks in by inner. → { lip: ring info, yAt(t) } */
function snowBlanket(B, { ax, az, round = 0.5, ySurf, yAt = null, th = 0.16, lip = 0.09, droop = 0.05, seed = 0, NS = 112, tTop = 1, inner = 0.04, ridge = 0.08, ice = null, faces = null, map = null }) {
  const ph = (seed % 89) * 1.31;
  const ring = (t, out, dy) => { const a = ax(t), b = az(t); return { t, ax: a, az: b, rc: Math.min(a, b) * round, y: ySurf(t) + dy, out, dy }; };
  const rings = [ring(0, -0.14, -0.035), ring(0, lip * 0.5, -droop), ring(0, lip, th * 0.38), ring(0.012, lip * 0.72, th * 0.86), ring(0.045, lip * 0.22, th)];
  const mids = [0.1, 0.18, 0.27, 0.37, 0.48, 0.59, 0.7, 0.8, 0.88, 0.94];
  if (tTop >= 1) { for (const t of mids) rings.push(ring(t, 0, th * (1 + 0.12 * Math.sin(PI * t)))); rings.push(ring(0.975, 0, th + ridge * 0.55)); rings.push({ ...ring(0.9995, 0, th + ridge), rc: 1e-4, ax: Math.max(0.01, ax(1) - 0.06), az: 1e-3 }); }
  else { for (const t of mids) if (t < tTop - 0.05) rings.push(ring(t, 0, th)); rings.push(ring(tTop, -inner * 0.4, th * 0.85)); rings.push(ring(tTop, -inner, th * 0.25)); }
  const lump = (i, k) => {
    const u = i / NS * 23 + ph;
    if (k === 1) return [0.012 * nz(u, 1.7), -0.045 * Math.max(0, nz(u * 1.6, 4.1)) - 0.02 * Math.max(0, nz(u * 4.3, 7.7))];
    if (k >= 2 && k <= 3) return [0.02 * nz(u, 2.9 + k), 0.012 * nz(u * 2.1, k)];
    if (k >= 4 && k < rings.length - 1) { const f = Math.pow(clamp(1 - rings[k].t), 0.7); return [0, f * (0.028 * nz(u * 0.9, k * 0.73 + ph) + 0.012 * nz(u * 3.1, k))]; }
    return [0, 0];
  };
  const { g } = skin(rings, NS, lump, yAt);
  B.add(g, snowCol);
  const lr = rings[1];
  if (ice) {
    const rr = mulberry32(seed * 977 + 31), per = 4 * (lr.ax + lr.az), n = Math.round(per / (ice.every ?? 0.15)), o = { ...ice, map, faces };
    for (let i = 0; i < n; i++) {
      const [x, z, nx, nzz] = rrPoint(lr.ax, lr.az, lr.rc, (i + rr() * 0.6) / n);
      if (!iceKeep(Math.abs(nzz) > Math.abs(nx) ? (nzz > 0 ? 'f' : 'b') : nx > 0 ? 'r' : 'l', o, rr)) continue;
      icicle(B, x + nx * (lr.out + 0.005), lr.y, z + nzz * (lr.out + 0.005), iceLen(ice, rr));
    }
  }
  return { lip: lr, yAt: t => ySurf(t) + th };
}
/** A kit tile roof (roofs.js) buried under a snow blanket, icicles under the cornice. type hip | irimoya | gable | skirt.
 *  o: the roof() options (w, d, y0, over, gOver, H, curve, tg, tTop, ridge) + tile, snow { th, lip, droop, ice } →
 *  the roof info (+ snow) */
function snowRoof(B, o) {
  const type = o.type || 'hip', curve = o.curve ?? 0.3, over = o.over ?? 0.5;
  const R = roof(B, {
    type, w: o.w, d: o.d, y0: o.y0, over, gOver: o.gOver, H: o.H, curve, lift: o.lift ?? 0.05, liftW: 0.5, thick: o.thick ?? 0.14,
    ribW: o.ribW ?? 0.3, ribAmp: 0.03, course: 0.42, courseAmp: 0.025, color: o.tile || T.tile, edge: o.edge || T.tileEdge, under: o.under || T.soffit,
    cap: o.cap || T.tileEdge, moss: 0, lichen: 0, tg: o.tg, tTop: o.tTop, ridge: o.ridge, gable: o.gable || 'wood', gableWood: o.gableWood || T.timberMid, gableColor: o.gableColor || T.plaster,
    timber: T.timber, oni: false, rich: 1, ends: o.ends ?? true, vent: o.vent, k: 0.38,
  });
  const rot = type === 'gable' ? o.ridge === 'z' : o.d > o.w + 1e-3, Wl = rot ? o.d : o.w, Dl = rot ? o.w : o.d;
  const A = Wl / 2 + over, Bz = Dl / 2 + over, sn = o.snow || {};
  const ySurf = t => R.yb + R.H * prof(t, curve) + 0.035, ax = t => A - Bz * t, az = t => Bz * (1 - t);
  // the roof's own surface under a point (the snow frame): the rounded snow corners ride up the hips instead of sinking into them
  const yAt = (x, z) => R.yb + R.H * prof(clamp(Math.min(A - Math.abs(x), Bz - Math.abs(z)) / Bz), curve) + 0.035;
  const c = { ySurf, th: sn.th ?? 0.16, lip: sn.lip ?? 0.09, droop: sn.droop ?? 0.05, seed: (B.seed % 97) + (o.seed || 0), map: rot ? ROTMAP : null, faces: sn.faces || null,
    ice: sn.ice === false ? null : { every: 0.15, len: [0.07, 0.32], back: 0.3, ...(sn.ice || {}) } };
  if (rot) B.push([0, 0, 0], PI / 2);
  let S;
  if (type === 'hip') S = snowBlanket(B, { ...c, ax, az, yAt, round: sn.round ?? 0.55, ridge: sn.ridge ?? 0.08 });
  else if (type === 'skirt') S = snowBlanket(B, { ...c, ax, az, yAt, round: 0.55, tTop: o.tTop ?? 0.45, inner: sn.inner ?? 0.06 });
  else if (type === 'irimoya') {
    const tg = o.tg ?? 0.5, X = A - Bz * tg + (o.gOver ?? 0.22);
    S = snowBlanket(B, { ...c, ax, az, yAt, round: 0.55, tTop: tg + 0.02, inner: 0.02 });
    S.yAt = snowSheet(B, { ...c, X: X + 0.02, az, t0: tg - 0.04, endLip: 0.07, ridge: sn.ridge ?? 0.07, ice: c.ice && { ...c.ice, back: 0.15, len: [0.05, 0.2] } }).yAt;
  } else S = snowSheet(B, { ...c, X: Wl / 2 + (o.gOver ?? 0.35) + 0.02, az, t0: 0, endLip: 0.07, ridge: sn.ridge ?? 0.06 });
  // the ridge ends: dark onigawara standing proud of the snow roll, each under a little snow cap
  if (o.oni !== false && type !== 'skirt') {
    const X = type === 'hip' ? Math.max(0.05, A - Bz) : type === 'irimoya' ? A - Bz * (o.tg ?? 0.5) + (o.gOver ?? 0.22) + 0.05 : Wl / 2 + (o.gOver ?? 0.35) + 0.05, y = S.yAt(1) - 0.04, k = clamp(Bz / 1.4, 0.55, 1.1);
    for (const s2 of [-1, 1]) B.at([s2 * X, y, 0], 0, () => {
      const g = G.box(0.14 * k, 0.3 * k, 0.34 * k, 0.05 * k); g.translate(0, 0.12 * k, 0); B.add(g, T.tileEdge);
      const face = G.cyl(0.085 * k, 0.085 * k, 0.04, 12); face.rotateZ(PI / 2); face.translate(s2 * 0.07 * k, 0.13 * k, 0); B.add(face, '#5a6078');
      for (const sz of [-1, 1]) { const hn = G.sph(0.06 * k, 7, 5); hn.scale(0.8, 1.2, 0.8); hn.translate(0, 0.28 * k, sz * 0.12 * k); B.add(hn, T.tileEdge); }
      pillow(B, [0, 0.3 * k, 0], 0.13 * k, 0.5, (o.seed || 0) + s2 * 5, 0.8, 1.2);
    });
  }
  if (rot) B.pop();
  return { ...R, snow: S };
}

// ------------------------------------------------------------------ the karahafu (the bathhouse's cusped-gable porch)
/** A karahafu porch roof projecting from a wall (local: x across, z = 0 at the wall → D at the front): an ogee bell
 *  that humps up in the middle and flares out at the ends, a thick dark bargeboard with a silver edge, a bronze gegyo
 *  pendant, the whole thing under a rounded snow blanket with icicles. y0: the bell ends' eave height, H: the hump. */
function karahafu(B, { W = 2.1, D = 1.05, y0 = 1.8, H = 0.5, th = 0.11, rise = 0.18, seed = 0 } = {}) {
  const bell = u => { const a = Math.abs(u); return H * Math.pow((1 + Math.cos(PI * Math.min(1, a))) / 2, 0.85) + 0.07 * smooth(0.8, 1, a); };
  const NX = 30, NZ = 5, yTop = (u, k) => y0 + bell(u) + (1 - k) * rise;
  const grid = (fy, dz = 0, xs = 1) => {
    const pos = [], idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) { const u = i / NX * 2 - 1, k = j / NZ; pos.push(u * W / 2 * xs, fy(u, k), k * D + dz); }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // tiles on top (ribbed by colour), the soffit under, the bargeboard along the front
  B.add(grid((u, k) => yTop(u, k)), (p, n, o) => o.set(T.tile).multiplyScalar(0.8 + 0.25 * Math.pow(Math.abs(Math.sin(p.x * 14)), 0.6)));
  { const g = grid((u, k) => yTop(u, k) - th); const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); B.add(g, T.soffit); }
  const band = (y0f, y1f, z, color, zt = 0.05) => {
    const pos = [];
    for (let i = 0; i < NX; i++) {
      const u0 = i / NX * 2 - 1, u1 = (i + 1) / NX * 2 - 1, x0 = u0 * W / 2, x1 = u1 * W / 2;
      const a = [x0, y0f(u0), z + zt], b = [x1, y0f(u1), z + zt], c = [x1, y1f(u1), z + zt], d = [x0, y1f(u0), z + zt];
      pos.push(...a, ...d, ...c, ...a, ...c, ...b);
      const a2 = [x0, y1f(u0), z], b2 = [x1, y1f(u1), z]; pos.push(...d, ...a2, ...b2, ...d, ...b2, ...c); // (the bottom face)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); B.add(g, color);
  };
  band(u => yTop(u, 1) + 0.03, u => yTop(u, 1) - th - 0.1, D, T.timber, 0.06);
  band(u => yTop(u, 1) + 0.045, u => yTop(u, 1) + 0.005, D + 0.03, '#d8d4cc', 0.06);
  // the gegyo: a bronze pendant at the hump, two scrolls either side
  B.at([0, y0 + H + rise * 0 - th - 0.06, D + 0.1], 0, () => {
    const disc = G.cyl(0.12, 0.12, 0.04, 14); disc.rotateX(PI / 2); B.add(disc, C.bronze);
    const drop = G.cone(0.09, 0.2, 8); drop.rotateZ(PI); drop.translate(0, -0.15, 0); B.add(drop, C.bronze);
    for (const s of [-1, 1]) { const sc = G.torus(0.08, 0.022, 4, 10, PI * 1.3); sc.rotateZ(s > 0 ? -0.6 : PI + 0.6); sc.translate(s * 0.2, 0.02, 0); B.add(sc, C.bronze); }
    const boss = G.sph(0.045, 8, 6); boss.translate(0, 0, 0.03); B.add(boss, C.gold);
  });
  // snow: a blanket following the bell, a rolled lip along the front, thinning to nothing at the flared ends
  const sth = u => 0.13 * (1 - smooth(0.82, 1, Math.abs(u)));
  {
    const pos = [], idx = [], cols = NX * 2, rows = [];
    const L = [{ k: 1, out: 0.08, dy: () => -0.05 }, { k: 1, out: 0.12, dy: u => sth(u) * 0.4 }, { k: 1, out: 0.08, dy: u => sth(u) * 0.9 }];
    for (let j = NZ; j >= 0; j--) L.push({ k: j / NZ, out: 0, dy: u => sth(u) * (1 + 0.1 * Math.sin(PI * j / NZ)) });
    L.push({ k: 0, out: -0.1, dy: () => 0.0 });
    L.forEach((r, ri) => {
      const row = [];
      for (let i = 0; i <= cols; i++) {
        const u = i / cols * 2 - 1, ph = nz(u * 6 + seed, ri * 0.7);
        const y = yTop(u, r.k) + r.dy(u) + (ri === 0 ? -0.04 * Math.max(0, ph) : ri > 2 ? 0.018 * ph : 0);
        pos.push(u * W / 2 * 1.01, y, r.k * D + r.out + (ri <= 2 ? 0.01 * ph : 0)); row.push(pos.length / 3 - 1);
      }
      rows.push(row);
    });
    for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < cols; i++) { const a = rows[k][i], b = rows[k][i + 1], c = rows[k + 1][i], d = rows[k + 1][i + 1]; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    B.add(g, snowCol);
    // icicles along the front lip
    const rr = mulberry32(seed * 131 + 7);
    for (let i = 0; i < 16; i++) {
      const u = -0.85 + i / 15 * 1.7 + (rr() - 0.5) * 0.05; if (rr() < 0.3) continue;
      const Lc = 0.08 + Math.pow(rr(), 1.5) * 0.26, x = u * W / 2, y = yTop(u, 1) - 0.07 - 0.04;
      const ic = G.cone(0.025 + Lc * 0.08, Lc, 5); ic.rotateX(PI); ic.translate(x, y - Lc / 2, D + 0.1);
      B.add(ic, (p, n, o) => o.copy(cIceHi).lerp(cIce, clamp((y - p.y) / Lc) * 0.8));
    }
  }
  return { yAt: u => yTop(u, 1), top: y0 + H + rise };
}

// ------------------------------------------------------------------ brush glyphs (flat, unit size, facing +z)
/** brush strokes through control points (centripetal Catmull-Rom), each a tapered ribbon with a round start → flat geo */
function strokeGeo(paths, w = 0.085) {
  const pos = [];
  const disc = (x, y, r) => { for (let k = 0; k < 10; k++) { const a0 = k / 10 * TAU, a1 = (k + 1) / 10 * TAU; pos.push(x, y, 0, x + Math.cos(a0) * r, y + Math.sin(a0) * r, 0, x + Math.cos(a1) * r, y + Math.sin(a1) * r, 0); } };
  for (const P of paths) {
    const cv = new THREE.CatmullRomCurve3(P.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal'), N = Math.max(8, P.length * 7), pts = cv.getSpacedPoints(N);
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
      const f = i / N, hw = w / 2 * (1.08 - 0.45 * f * f) * (0.92 + 0.16 * Math.sin(PI * Math.min(1, f * 1.4)));
      L.push([pts[i].x + nx * hw, pts[i].y + ny * hw]); R.push([pts[i].x - nx * hw, pts[i].y - ny * hw]);
    }
    for (let i = 0; i < N; i++) pos.push(L[i][0], L[i][1], 0, R[i][0], R[i][1], 0, L[i + 1][0], L[i + 1][1], 0, R[i][0], R[i][1], 0, R[i + 1][0], R[i + 1][1], 0, L[i + 1][0], L[i + 1][1], 0);
    disc(pts[0].x, pts[0].y, w * 0.56);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
const GLYPHS = {
  // ゆ: the hot-water sign (a left stroke that turns up into a big loop, a hooked stroke down through it)
  yu: () => strokeGeo([[[-0.3, 0.32], [-0.315, 0.06], [-0.31, -0.15], [-0.27, -0.22], [-0.2, -0.11], [-0.07, 0.08], [0.1, 0.19], [0.27, 0.14], [0.34, -0.02], [0.26, -0.15], [0.09, -0.19]],
    [[0.05, 0.43], [0.075, 0.16], [0.075, -0.14], [0.035, -0.33], [-0.09, -0.43]]], 0.095),
  // a six-armed snow crystal
  snow: () => { const P = []; for (let k = 0; k < 3; k++) { const a = PI / 2 + k * PI / 3, c = Math.cos(a), s = Math.sin(a); P.push([[-c * 0.42, -s * 0.42], [c * 0.42, s * 0.42]]); for (const e of [-1, 1]) { const ex = e * c * 0.27, ey = e * s * 0.27; for (const b of [-1, 1]) { const ba = a + (e > 0 ? 0 : PI) + b * 0.75; P.push([[ex, ey], [ex + Math.cos(ba) * 0.14, ey + Math.sin(ba) * 0.14]]); } } } return strokeGeo(P, 0.07); },
};
const flatOf = g => (g.index ? g.toNonIndexed() : g);
function circleShape(x, y, r) { const s = new THREE.Shape(); s.absarc(x, y, r, 0, TAU, false); return s; }
/** camellia crest shapes: five round petals and the gold heart (two layers) */
const camelliaShapes = () => { const pet = []; for (let i = 0; i < 5; i++) { const a = PI / 2 + i * TAU / 5; pet.push(circleShape(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.2)); } return [pet, [circleShape(0, 0, 0.11)]]; };
/** a mikan: the fruit, a leaf, a stem */
const mikanShapes = () => { const lf = new THREE.Shape(); lf.moveTo(0.02, 0.3); lf.quadraticCurveTo(0.24, 0.48, 0.42, 0.36); lf.quadraticCurveTo(0.22, 0.24, 0.02, 0.3); return [[circleShape(0, -0.04, 0.34)], [lf]]; };
/** a raised crest on a board: layers [[shapes, colour]...] extruded (local z out) */
function crest(B, layers, s, depth = 0.025) { layers.forEach(([sh, c], i) => { const g = shapeGeo(sh, depth, 0.01, 10); g.scale(s, s, 1); g.translate(0, 0, i * 0.008); B.add(g, c); }); }
/** a flat glyph laid on a board (B.add) or a cloth (cloth bounds) */
function glyph(B, name, s, color, z = 0.03, cl = null) { const g = GLYPHS[name](); g.scale(s, s, 1); g.translate(0, 0, z); if (cl) B.cloth(g, color, cl); else B.add(g, color); }
/** a noren across a doorway: parts.noren with a glyph / crest print */
function norenSign(B, { w = 1, h = 0.55, y = 1.4, z = 0.16, color = T.indigo, strips = 2, mark = 'yu', markColor = '#fff6ea', markScale } = {}) {
  const sym = mark === 'yu' || mark === 'snow' ? () => flatOf(GLYPHS[mark]()) : mark === 'camellia' ? () => flatOf(new THREE.ShapeGeometry(camelliaShapes()[0], 8)) : mark === 'mikan' ? () => flatOf(new THREE.ShapeGeometry(mikanShapes()[0], 10)) : null;
  norenPart(B, { w, h, y, z, color, strips, symbol: sym, symScale: markScale ?? h * 0.62, symColor: markColor });
}
/** a framed wooden signboard (local face frame, centred), with a crest or glyph on it */
function board(B, { w = 0.7, h = 0.4, wood = '#e8dcc2', frame = T.timber, mark = null, markColor = T.timber, s = 0.3, layers = null }) {
  const bd = G.box(w, h, 0.05, 0.02); B.add(bd, wood); const fr = G.box(w + 0.07, h + 0.07, 0.035, 0.015); fr.translate(0, 0, -0.012); B.add(fr, frame);
  if (layers) B.at([0, 0, 0.026], 0, () => crest(B, layers, s));
  else if (mark) glyph(B, mark, s, markColor, 0.028);
}

// ------------------------------------------------------------------ small kit props (all merged into the static chunks)
/** the snow-viewing lantern (yukimi-dōrō) from the kit: three splayed legs, a hex firebox with paper windows (unlit:
 *  the saved village lights them, yukimiPanes), a wide kasa under a snow cap → the firebox centre height */
function yukimi(B, s = 1, seed = 0) {
  const stone = T.stoneLight, dark = '#5e6478';
  B.push([0, 0, 0], 0, s);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5, d = V(Math.cos(a), 0, Math.sin(a)); B.add(tube([{ p: d.clone().multiplyScalar(0.46), r: 0.07 }, { p: d.clone().multiplyScalar(0.4).add(V(0, 0.34, 0)), r: 0.06 }, { p: d.clone().multiplyScalar(0.18).add(V(0, 0.6, 0)), r: 0.055 }], 6, true), stone); pillow(B, [d.x * 0.47, 0.02, d.z * 0.47], 0.13, 0.45, seed + i); }
  const plate = G.cyl(0.34, 0.29, 0.1, 6); plate.translate(0, 0.65, 0); B.add(plate, stone);
  const box = G.cyl(0.23, 0.23, 0.34, 6, true); box.translate(0, 0.88, 0); B.add(box, dark);
  for (let i = 0; i < 6; i += 2) { const a = i / 6 * TAU + PI / 6; B.at([0, 0.88, 0], -a + PI / 2, () => { const w = G.box(0.19, 0.22, 0.02, 0); w.translate(0, 0, 0.196); B.add(w, T.paperDim); const fr = G.box(0.025, 0.24, 0.03, 0); fr.translate(0, 0, 0.2); B.add(fr, dark); }); }
  const kasa = G.lathe([[0.001, 0.26], [0.2, 0.24], [0.55, 0.1], [0.7, 0.02], [0.72, 0.0], [0.6, -0.02], [0.2, 0.04], [0.001, 0.04]], 6); kasa.translate(0, 1.07, 0); B.add(kasa, stone);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, t = G.sph(0.05, 6, 4); t.translate(Math.cos(a) * 0.7, 1.11, Math.sin(a) * 0.7); B.add(t, stone); }
  const cap = puff(V(0, 1.2, 0), 0.6, { detail: 2, noise: 0.16, squash: 0.36, seed: seed + 7 }); B.add(cap, snowCol);
  const hoju = G.sph(0.09, 8, 6); hoju.scale(1, 1.2, 1); hoju.translate(0, 1.46, 0); B.add(hoju, stone); pillow(B, [0, 1.55, 0], 0.09, 0.6, seed + 9);
  B.pop();
  return 0.88 * s;
}
/** the lit paper panes for a yukimi lantern at the current frame (the saved village) */
function yukimiPanes(B, s = 1) {
  B.push([0, 0, 0], 0, s);
  for (let i = 0; i < 6; i += 2) { const a = i / 6 * TAU + PI / 6; B.at([0, 0.88, 0], -a + PI / 2, () => { const w = G.box(0.17, 0.2, 0.012, 0); w.translate(0, 0, 0.228); B.glow(w, '#ffd890', { flicker: 0.6 }); }); }
  const core = G.cyl(0.17, 0.17, 0.28, 6); core.translate(0, 0.88, 0); B.glow(core, '#ffb860', { flicker: 0.5 });
  B.pop();
}
/** a cloud-pruned pine (niwaki) from the kit: a leaning trunk, flat needle pads under snow cushions */
function niwaki(B, { s = 1, seed = 0 } = {}) {
  const rr = mulberry32(seed * 71 + 3);
  B.push([0, 0, 0], 0, s);
  const pts = [{ p: V(0, 0, 0), r: 0.13 }, { p: V(0.12, 0.6, 0.05), r: 0.1 }, { p: V(-0.05, 1.15, -0.04), r: 0.08 }, { p: V(0.08, 1.6, 0.02), r: 0.06 }];
  B.add(tube(pts, 7, false), (p, n, o) => o.set('#5a4438').lerp(new THREE.Color('#7a6050'), clamp(nz(p.y * 6, p.x * 9) * 0.5 + 0.5) * 0.6));
  const pads = [[0.45, 0.75, 0.15, 0.5], [-0.42, 1.0, -0.1, 0.46], [0.25, 1.35, -0.2, 0.42], [0, 1.72, 0.02, 0.4], [-0.3, 0.55, 0.25, 0.36]];
  for (const [x, y, z, r] of pads) {
    const arm = tube([{ p: V(x * 0.15, y - 0.1, z * 0.15), r: 0.05 }, { p: V(x, y - 0.05, z), r: 0.03 }], 5, false); B.add(arm, '#5a4438');
    const g = puff(V(x, y, z), r, { detail: 2, noise: 0.25, squash: 0.42, seed: seed + Math.round(r * 100) }); B.add(g, (p, n, o) => { o.set('#1e4a3a').lerp(new THREE.Color('#3a6a4c'), clamp(n.y + 0.3) * 0.7); FL.snowOn(o, V(0, n.y + nz(p.x * 5, p.z * 5) * 0.2 - 0.05, 0), 1, 0.3, 0.6); });
    pillow(B, [x + (rr() - 0.5) * 0.06, y + r * 0.34, z], r * 0.82, 0.3, seed + Math.round(y * 50));
  }
  B.pop();
}
/** yukitsuri: snow-hanging ropes fanned from a tall pole down to the pine's pads (Kanazawa's winter umbrella) */
function yukitsuri(B, { h = 2.5, r = 0.95, n = 14, y1 = 0.85, seed = 0 } = {}) {
  const pole = G.cyl(0.035, 0.045, h, 6); pole.translate(0, h / 2, 0); B.add(pole, '#7a6248');
  const top = G.cone(0.08, 0.16, 6); top.translate(0, h + 0.08, 0); B.add(top, '#c8b088'); pillow(B, [0, h + 0.16, 0], 0.07, 0.6, seed);
  for (let i = 0; i < n; i++) { const a = i / n * TAU, e = V(Math.cos(a) * r, y1 + 0.12 * Math.sin(i * 1.7), Math.sin(a) * r), m = V(0, h - 0.04, 0).lerp(e, 0.5); m.y -= 0.05; B.add(tube([{ p: V(0, h - 0.04, 0), r: 0.009 }, { p: m, r: 0.009 }, { p: e, r: 0.009 }], 3, false), '#e8d8a8'); }
}
/** a yellow bath bucket (the sento classic), open top up; r its radius */
function yellowBucket(B, r = 0.13, color = '#f2c230') {
  const g = G.cyl(r, r * 0.82, r * 1.15, 14, true); g.translate(0, r * 0.575, 0); B.add(g, (p, n, o) => o.set(color).multiplyScalar(0.86 + 0.16 * clamp(n.x * 0.5 + 0.6)));
  const inner = G.cyl(r * 0.94, r * 0.78, r * 1.1, 12, true); inner.scale(-1, 1, 1); inner.translate(0, r * 0.6, 0); B.add(inner, shade(color, 0.75));
  const bot = G.cyl(r * 0.8, r * 0.8, 0.012, 12); bot.translate(0, 0.01, 0); B.add(bot, shade(color, 0.7));
  const rim = G.torus(r, 0.012, 4, 16); rim.rotateX(PI / 2); rim.translate(0, r * 1.15, 0); B.add(rim, shade(color, 1.08));
  const lab = G.box(r * 0.9, r * 0.28, 0.012, 0); lab.translate(0, r * 0.62, r * 0.93); lab.rotateX(-0.08); B.add(lab, '#d8343a');
}
/** a snowman: two (or three) snowballs, charcoal eyes and buttons, a carrot nose, twig arms, a scarf, a bucket hat */
function snowman(B, { s = 1, scarf = '#d8343a', hat = 'bucket', seed = 0 } = {}) {
  B.push([0, 0, 0], 0, s);
  const ball = (r, y, sd) => { const g = puff(V(0, y, 0), r, { detail: 2, noise: 0.06, squash: 0.95, seed: seed + sd }); B.add(g, snowCol); };
  ball(0.42, 0.36, 1); ball(0.3, 0.92, 2); ball(0.22, 1.36, 3);
  for (const s2 of [-1, 1]) { const e = G.sph(0.03, 6, 4); e.translate(s2 * 0.075, 1.42, 0.2); B.add(e, '#2a2630'); }
  const nose = G.cone(0.035, 0.2, 6); nose.rotateX(PI / 2); nose.translate(0, 1.35, 0.3); B.add(nose, '#f08a2a');
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32, m = G.sph(0.018, 5, 3); m.translate(Math.sin(a) * 0.16, 1.3 - Math.cos(a) * 0.04 - 0.04, 0.17 + Math.cos(a) * 0.02); B.add(m, '#2a2630'); }
  for (let i = 0; i < 3; i++) { const b = G.sph(0.035, 6, 4); b.translate(0, 0.98 - i * 0.14, 0.29 - i * 0.012); B.add(b, '#2a2630'); }
  for (const s2 of [-1, 1]) { B.add(tube([{ p: V(s2 * 0.25, 1.0, 0), r: 0.022 }, { p: V(s2 * 0.5, 1.18, 0.05), r: 0.016 }, { p: V(s2 * 0.66, 1.34, 0.02), r: 0.01 }], 4, false), '#5a4030'); B.add(tube([{ p: V(s2 * 0.52, 1.2, 0.05), r: 0.01 }, { p: V(s2 * 0.6, 1.14, 0.12), r: 0.006 }], 3, false), '#5a4030'); }
  const sc = G.torus(0.21, 0.05, 6, 14); sc.rotateX(PI / 2); sc.translate(0, 1.16, 0); B.add(sc, scarf);
  const tail = G.box(0.1, 0.32, 0.04, 0.015); tail.rotateZ(0.25); tail.translate(0.14, 1.0, 0.18); B.add(tail, scarf);
  if (hat === 'bucket') B.at([0, 1.52, -0.01], 0, () => { bucket(B, { r: 0.13, h: 0.18, color: '#a8784e' }); }, 1, -0.22, 0.12);
  else { const h = G.cone(0.2, 0.14, 10); h.translate(0, 1.6, 0); B.add(h, hat); }
  B.pop();
}
/** a snow bunny (yuki-usagi): a mound of snow, two leaf ears, red berry eyes */
function snowBunny(B, s = 1, seed = 0) {
  B.push([0, 0, 0], 0, s);
  const g = puff(V(0, 0.07, 0), 0.15, { detail: 2, noise: 0.06, squash: 0.62, seed }); g.scale(1, 1, 1.35); B.add(g, snowCol);
  for (const e of [-1, 1]) { const l = G.sph(0.045, 7, 5); l.scale(0.5, 0.25, 1.6); l.rotateX(-0.5); l.translate(e * 0.045, 0.16, -0.06); B.add(l, '#3a7a3a'); const b = G.sph(0.018, 6, 4); b.translate(e * 0.05, 0.12, 0.12); B.add(b, '#d82a3a'); }
  B.pop();
}
/** a kamakura snow hut: a dome with a dark arched mouth and a candle glowing inside */
function kamakura(B, { r = 0.85, seed = 0 } = {}) {
  const g = new THREE.SphereGeometry(r, 18, 9, 0, TAU, 0, PI / 2); g.scale(1, 0.92, 1);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + 0.035 * nz(x * 3 + seed, z * 3 + y); P.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); B.add(g, snowCol);
  const sh = new THREE.Shape(); sh.moveTo(-0.26, 0); sh.lineTo(-0.26, 0.3); sh.absarc(0, 0.3, 0.26, PI, 0, true); sh.lineTo(0.26, 0); sh.closePath();
  const m = new THREE.ShapeGeometry(sh, 8); m.translate(0, 0, r * 0.97); B.glow(flatOf(m), '#ffb860', { hot: true, flicker: 0.8, tint: 1 });
  const arch = G.torus(0.27, 0.06, 5, 12, PI); arch.translate(0, 0.3, r * 0.95); B.add(arch, snowCol);
  pillow(B, [0, r * 0.88, 0], 0.3, 0.4, seed + 3);
}
/** a stacked pyramid of yellow buckets (the saved south camp) */
function bucketStack(B, n = 3) { for (let row = 0; row < n; row++) for (let i = 0; i < n - row; i++) B.at([(i - (n - row - 1) / 2) * 0.3, row * 0.15, 0], 0, () => yellowBucket(B, 0.13), 1, PI, 0); }
/** a wooden bath stool (sento: low, dished) */
function bathStool(B, color = '#d8b888') { const top = G.cyl(0.15, 0.15, 0.05, 12); top.translate(0, 0.22, 0); B.add(top, color); for (const s of [-1, 1]) { const l = G.box(0.24, 0.2, 0.04, 0.01); l.translate(0, 0.1, s * 0.09); B.add(l, shade(color, 0.85)); } }
/** daikon radishes drying on a bamboo rack (hoshi-daikon), along local x */
function daikonRack(B, { w = 1.3, h = 1.45, rows = 2, seed = 0 } = {}) {
  const rr = mulberry32(seed * 13 + 5);
  for (const s of [-1, 1]) { B.add(tube([{ p: V(s * w / 2, 0, 0), r: 0.035 }, { p: V(s * w / 2, h, 0), r: 0.03 }], 6, false), '#a8b060'); }
  for (let r = 0; r < rows; r++) {
    const y = h - 0.05 - r * 0.62; const bar = G.cyl(0.026, 0.026, w + 0.1, 6); bar.rotateZ(PI / 2); bar.translate(0, y, 0); B.add(bar, '#9aa858');
    for (let i = 0; i < 6; i++) {
      const x = -w / 2 + 0.14 + i * (w - 0.28) / 5, L = 0.42 + rr() * 0.12;
      const g = G.cyl(0.045, 0.012, L, 7); g.translate(x, y - 0.06 - L / 2, 0.02 * (i % 2)); B.add(g, (p, n, o) => o.set('#f4f0e6').lerp(new THREE.Color('#e0d8c8'), clamp((y - p.y) / L) * 0.5));
      const lf = G.cone(0.06, 0.14, 5); lf.translate(x, y + 0.02, 0.02 * (i % 2)); B.add(lf, '#6a9a4a');
    }
    snowSlab(B, 0, y + 0.02, 0, w + 0.06, 0.07, 0.04, seed + r);
  }
}
/** snow banked along a wall foot: a row of drifts along local x from x0 to x1 at z */
function bank(B, x0, x1, z, { r = 0.32, seed = 0, sq = 0.42 } = {}) { const n = Math.max(1, Math.round((x1 - x0) / (r * 1.3))); for (let i = 0; i < n; i++) pillow(B, [x0 + (i + 0.5) * (x1 - x0) / n + nz(i + seed, 1) * 0.06, 0.02, z + nz(i * 1.3, seed) * 0.05], r * (0.85 + 0.3 * Math.abs(nz(i * 0.7, seed + 3))), sq, seed + i * 5, 1.25, 0.8); }
/** a static flora geometry set (onsenFlora: { material: geo }) merged into the kit buckets (no extra draw calls) */
function flora(B, parts, x, y, z, rot = 0, s = 1) {
  B.at([x, y, z], rot, () => { for (const k in parts) { const g = parts[k]; if (!g || k.startsWith('cards')) continue; B.add(g.clone(), null, k === 'bushFoliage' || k === 'foliage' ? 'leaf' : 'body'); } }, s);
}
const blkF = (zc, d) => zc + d / 2;

// ------------------------------------------------------------------ Granny Shirayuki's Cottage 白雪庵 (a gasshō farmhouse)
/** a straight prism: a 2D polygon (local x, y) swept along z from z0 to z1, every face wound outward; fn(role, p, out)
 *  colours it (role: the polygon edge index i (edge i → i + 1), or 'z' for the two end caps) */
function prism(B, poly, z0, z1, fn) {
  const pos = [], roles = [], n = poly.length, cx = poly.reduce((a, q) => a + q[0], 0) / n, cy = poly.reduce((a, q) => a + q[1], 0) / n, cz = (z0 + z1) / 2;
  const tri = (a, b, c, role) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzz = ux * vy - uy * vx, mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    if (nx * mx + ny * my + nzz * mz < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
    roles.push(role, role, role);
  };
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n], a = [p[0], p[1], z0], b = [q[0], q[1], z0], c = [q[0], q[1], z1], d = [p[0], p[1], z1]; tri(a, b, c, i); tri(a, c, d, i); }
  for (let i = 1; i < n - 1; i++) for (const z of [z0, z1]) tri([poly[0][0], poly[0][1], z], [poly[i][0], poly[i][1], z], [poly[i + 1][0], poly[i + 1][1], z], 'z');
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const col = new Float32Array(pos.length), o = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < pos.length / 3; i++) { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); fn(roles[i], v, o); col[i * 3] = o.r; col[i * 3 + 1] = o.g; col[i * 3 + 2] = o.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  B.add(g, null);
}
/** the gasshō roof: two steep thatch slabs meeting at a ridge along z, their cut ends pale straw, buried in snow */
function gassho(B, { w, d, y0, k = 1.5, over = 0.42, gOver = 0.42, th = 0.36, seed = 0 }) {
  const A = w / 2 + over, Z = d / 2 + gOver, cs = 1 / Math.sqrt(1 + k * k), sn = k * cs; // (slope: cos, sin)
  const yU = x => y0 + (w / 2 - Math.abs(x)) * k, yR = yU(0);
  const cut = new THREE.Color(T.thatchCut), old = new THREE.Color(T.thatch), dark = new THREE.Color('#5a4a3a');
  for (const s of [-1, 1]) {
    const ue = [s * A, yU(A)], ur = [s * -0.02, yR + 0.02], te = [ue[0] + s * sn * th, ue[1] + cs * th], tr = [ur[0] + s * sn * th, ur[1] + cs * th];
    const across = p => clamp(((p.x - ue[0]) * s * sn + (p.y - ue[1]) * cs) / th), along = p => (ue[0] - p.x) * s * cs + (p.y - ue[1]) * sn;
    // roles: 0 the eave end (ue→te), 1 the top (under the snow), 2 the ridge end, 3 the underside; 'z' the gable cuts
    prism(B, [ue, te, tr, ur], -Z, Z, (role, p, o) => {
      if (role === 'z') { // the gable cut: three layers of straw parallel to the slope, combed streaks, a dark seam between
        const a = across(p), L = along(p), band = Math.abs(Math.sin(a * PI * 3)), streak = 0.5 + 0.5 * Math.sin(L * 38 + nz(L * 2 + seed, a * 3) * 4);
        return o.copy(cut).lerp(old, 0.25 + 0.3 * streak).lerp(dark, (1 - band) * 0.55 + (a < 0.12 ? 0.35 : 0)).multiplyScalar(0.94 + 0.08 * nz(L * 9, a * 7));
      }
      if (role === 0) { const st = Math.abs(Math.sin(p.z * 24 + nz(p.z * 3, seed) * 2)); return o.copy(cut).lerp(dark, 0.18 + 0.32 * st + 0.25 * (1 - across(p))).multiplyScalar(0.95 + 0.08 * nz(p.z * 11, p.y * 5)); }
      if (role === 3) return o.copy(dark).lerp(old, 0.15 * clamp(nz(p.z * 2, p.x * 2) + 0.5));
      return o.copy(old).multiplyScalar(0.9 + 0.12 * nz(p.z * 3, p.y * 2));
    });
  }
  // snow: thick on both slopes, a deep cornice at the eaves, a ragged lip over the gable ends (the sheet runs along z)
  const ySurf = t => yU(A * (1 - t)) + th / cs;
  B.push([0, 0, 0], PI / 2);
  const S = snowSheet(B, { X: Z + 0.03, az: t => (A + 0.02) * (1 - t), ySurf, th: 0.3, lip: 0.1, droop: 0.06, endLip: 0.09, seed, ridge: 0.14, map: ROTMAP, ice: { every: 0.13, len: [0.1, 0.42], back: 0.3 } });
  B.pop();
  return { yU, yR, A, Z, snow: S, ridgeY: ySurf(1) + 0.44 };
}
export function elder(B) {
  const w = 3.0, d = 3.2, h = 1.35, y0 = 0.3, zc = -0.15, F = blkF(zc, d), k = 1.5;
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.timber, koshi: T.koshi, koshiSkip: ['f'], koshiH: 0.42 });
  const blk = { w, d }, yw = y0 + h;
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 0.92, h: 1.12, style: 'wood', frame: T.timber, wood: '#8a6a4e' }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.0, y0 + 0.72, () => shoji(B, { w: 0.56, h: 0.5, frame: T.timber, dress: 'none' }));
  for (const side of ['l', 'r']) onFace(B, blk, side, 0.5, y0 + 0.72, () => latticeWindow(B, { w: 0.6, h: 0.44, frame: T.timber }));
  onFace(B, blk, 'b', 0, y0 + 0.72, () => shoji(B, { w: 0.7, h: 0.46, frame: T.timber, dress: 'none' }));
  // the gable faces (front and back): plaster between dark timbers, two tiers of glowing windows, a little vent
  for (const [zf, dir] of [[d / 2, 0], [-d / 2, PI]]) B.at([0, 0, zf], dir, () => {
    const tri = new THREE.Shape(); tri.moveTo(-w / 2, yw); tri.lineTo(w / 2, yw); tri.lineTo(0, yw + w / 2 * k); tri.closePath();
    const tg = new THREE.ShapeGeometry(tri); tg.translate(0, 0, 0.012); B.add(flatOf(tg), { grad: [shade(T.plaster, 0.94), T.plaster] });
    for (const yb of [yw, yw + 0.78, yw + 1.55]) { const hw = (w / 2 - (yb - yw) / k) - 0.02; if (hw < 0.2) continue; const bm = G.beam(hw * 2, 0.08, 0.07, 0.015); bm.translate(0, yb, 0.04); B.add(bm, T.timber); }
    for (const x of [-0.62, 0, 0.62]) { const top = yw + (w / 2 - Math.abs(x)) * k - 0.04; const p = G.beam(0.07, top - yw, 0.06, 0.012); p.translate(x, (top + yw) / 2, 0.035); B.add(p, T.timber); }
    for (const s of [-1, 1]) { const rb = G.beam(Math.hypot(w / 2, w / 2 * k) + 0.05, 0.09, 0.08, 0.015); rb.rotateZ(-s * Math.atan(k)); rb.translate(s * w / 4, yw + w / 4 * k - 0.03, 0.05); B.add(rb, T.timber); }
    if (!dir) {
      for (const s of [-1, 1]) B.at([s * 0.31, yw + 0.4, 0.02], 0, () => shoji(B, { w: 0.42, h: 0.4, frame: T.timber, dress: 'none', trim: false }));
      B.at([0, yw + 1.16, 0.02], 0, () => shoji(B, { w: 0.36, h: 0.34, frame: T.timber, dress: 'none', trim: false }));
    } else B.at([0, yw + 0.45, 0.02], 0, () => shoji(B, { w: 0.5, h: 0.38, frame: T.timber, dress: 'none', trim: false }));
    const vent = G.box(0.22, 0.14, 0.03, 0); vent.translate(0, yw + 1.86, 0.03); B.add(vent, '#2a2224');
  });
  const R = gassho(B, { w, d, y0: yw, k, seed: B.seed % 89 });
  // the pent roof over the front door (a snowy hisashi on two brackets), hoshigaki strings under it, a stoop stone
  B.at([0, yw - 0.04, d / 2], 0, () => {
    const sl = G.box(w * 0.78, 0.06, 0.62, 0.02); sl.rotateX(0.36); sl.translate(0, 0.06, 0.3); B.add(sl, '#5a4a44');
    const ed = G.box(w * 0.78 + 0.04, 0.05, 0.06, 0.015); ed.translate(0, -0.05, 0.6); B.add(ed, T.timber);
    for (const s of [-1, 1]) { const br = G.beam(0.06, 0.06, 0.55, 0.01); br.rotateX(-0.75); br.translate(s * 0.9, -0.2, 0.2); B.add(br, T.timber); }
    const sn = G.box(w * 0.8, 0.12, 0.62, 0.055); sn.rotateX(0.36); sn.translate(0, 0.16, 0.32); B.add(sn, snowCol);
    for (let i = 0; i < 5; i++) pillow(B, [(i - 2) * 0.48, 0.2 - 0.06 * (i % 2), 0.36], 0.22, 0.4, B.seed + i * 3, 1.2, 1);
    const rr = mulberry32(B.seed + 41);
    for (let i = 0; i < 12; i++) { if (rr() < 0.3) continue; const L = 0.07 + rr() * 0.2, ic = G.cone(0.02 + L * 0.08, L, 5); ic.rotateX(PI); ic.translate(-1.1 + i * 0.2, -0.09 - L / 2, 0.64); B.add(ic, (p, n, o) => o.copy(cIceHi).lerp(cIce, 0.5)); }
    for (const x of [-0.95, -0.82, 0.82, 0.95]) B.at([x, -0.08, 0.5], 0, () => charm(B, 'persimmon'));
  });
  B.at([0, 0, d / 2 + 0.55], 0, () => stoopStone(B, 0, 0.1, 0, 0.6));
  // porch life: a wooden snow shovel against the wall, kanjiki snowshoes hung by the door, straw snow boots on the step
  B.at([0.78, 0, d / 2 + 0.12], -0.15, () => { const bl = G.box(0.32, 0.4, 0.025, 0.01); bl.rotateX(-0.12); bl.translate(0, 0.22, 0.04); B.add(bl, '#c8a070'); const hd = G.cyl(0.018, 0.018, 0.95, 5); hd.rotateX(-0.12); hd.translate(0, 0.86, -0.04); B.add(hd, '#8a6448'); const gr = G.box(0.14, 0.03, 0.03, 0); gr.translate(0, 1.32, -0.09); B.add(gr, '#8a6448'); pillow(B, [0, 0.43, 0.06], 0.06, 0.5, 3, 2, 0.6); }, 1, 0.1, 0);
  for (const [x, y] of [[-0.78, y0 + 0.92], [-0.64, y0 + 0.78]]) B.at([x, y, d / 2 + 0.035], 0, () => { const r = G.torus(0.12, 0.016, 4, 12); r.scale(0.8, 1.2, 1); B.add(r, '#8a6a42'); for (let k = -1; k <= 1; k++) { const s2 = G.box(0.012, 0.24, 0.012, 0); s2.translate(k * 0.04, 0, 0); B.add(s2, '#c8b088'); } });
  for (const s of [-1, 1]) B.at([s * 0.1 - 0.42, y0 * 0.35, d / 2 + 0.5], s * 0.2, () => { const b = G.cyl(0.055, 0.07, 0.2, 7); b.translate(0, 0.1, 0); B.add(b, (p, n, o) => o.set('#c8a868').multiplyScalar(0.85 + 0.2 * Math.abs(Math.sin(p.y * 60)))); const toe = G.sph(0.06, 7, 5); toe.scale(1, 0.6, 1.4); toe.translate(0, 0.03, 0.05); B.add(toe, '#b89858'); });
  // snow banked on the stone base, lit by the windows
  bank(B, -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.12, { seed: 3, r: 0.36 });
  for (const s of [-1, 1]) B.at([s * (w / 2 + 0.12), 0, 0], PI / 2, () => bank(B, -d / 2, d / 2 - 0.3, 0, { seed: 9 + s, r: 0.34 }));
  B.pop();
  // the yard: a yukitsuri pine at the left, a daikon drying rack and the woodpile at the right, camellias
  B.at([-w / 2 - 0.95, 0, 0.55], 0.4, () => { niwaki(B, { s: 0.9, seed: 5 }); yukitsuri(B, { h: 2.25, r: 0.78, y1: 0.95, seed: 2 }); pillow(B, [0, 0.02, 0], 0.55, 0.3, 11, 1.2, 1.1); });
  B.at([w / 2 + 0.75, 0, -0.65], -PI / 2, () => daikonRack(B, { w: 1.2, h: 1.35, seed: 4 }));
  B.at([w / 2 + 0.55, 0, 0.75], PI / 2, () => { firewood(B, { w: 0.9, h: 0.55, d: 0.3 }); snowSlab(B, 0, 0.66, 0.02, 1.06, 0.46, 0.06, 7); });
  B.at([-w / 2 - 0.3, 0, F + 0.65], 0, () => flora(B, FL.snowBush(1, 'camellia'), 0, -0.05, 0, 0.6, 0.7));
  const lampY = yw - 0.2;
  return {
    fp: [-w / 2 - 1.6, zc - d / 2 - 0.15, w / 2 + 1.0, F + 0.55], door: [0, F + 1.0], keeper: [0.85, F + 0.95, 0], seat: [-0.95, F + 0.6, 0],
    lamps: [[-0.62, lampY, F + 0.62], [0.62, lampY, F + 0.62]],
    siege(B) {
      B.at([0, y0 + 0.56, F], 0, () => boards(B, 0.98, 1.1, { seed: 1 }));
      for (const s of [-1, 1]) B.at([s * 1.0, y0 + 0.72, F + 0.04], 0, () => boards(B, 0.64, 0.56, { seed: 2 + s }));
      for (const s of [-1, 1]) B.at([s * 0.31, yw + 0.4, F + 0.04], 0, () => boards(B, 0.5, 0.46, { seed: 5 + s }));
      B.at([1.25, y0, F + 0.01], 0, () => soot(B, 0.7, 1.2, T.plaster, 3));
      B.at([-0.4, 0, F + 1.7], 0, () => debris(B, 0.9, { seed: 11, n: 5 }));
      B.at([-w / 2 - 0.4, 0, F + 1.2], 0, () => warBanner(B, { h: 2.3, w: 0.5, seed: 13 }));
    },
    saved(B) {
      B.at([0, y0, F], 0, () => norenSign(B, { w: 0.86, h: 0.42, y: 1.1, z: 0.14, color: '#5a6aa8', mark: 'snow', strips: 2, markScale: 0.3 }));
      for (const [x, sd] of [[-0.55, 1], [-0.38, 2], [0.5, 3]]) B.at([x, 0.14, F + 0.62], 0.3 * sd, () => snowBunny(B, 0.85, sd));
      B.at([1.35, 0, F + 0.9], 0, () => snowman(B, { s: 0.5, scarf: '#5a6aa8', seed: 4 }));
    },
  };
}

// ------------------------------------------------------------------ Ryokan Tsubaki 椿旅館 (the grand two-storey inn)
export function inn(B) {
  const w = 4.2, d = 2.8, h = 1.5, y0 = 0.3, zc = -0.3, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.timber, koshi: T.koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 1.1, h: 1.32, style: 'lattice', frame: T.timber, wood: '#9a7656' }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.42, y0 + 0.78, () => latticeWindow(B, { w: 0.86, h: 0.56, frame: T.timber, slat: T.bengara, bay: true, roof: T.tile }));
  for (const side of ['l', 'r']) for (const u of [-0.6, 0.6]) onFace(B, blk, side, u, y0 + 0.8, () => shoji(B, { w: 0.58, h: 0.5, frame: T.timber, dress: 'none' }));
  onFace(B, blk, 'b', 0, y0 + 0.8, () => shoji(B, { w: 1.0, h: 0.5, frame: T.timber, dress: 'none' }));
  const R1 = snowRoof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.42, H: 0.92, tTop: 0.46, curve: 0.3, snow: { th: 0.13, lip: 0.08, inner: 0.1 } });
  const uw = Math.min(3.6, R1.openW - 0.14), ud = Math.min(2.0, R1.openD - 0.12), uh = 1.22, uy = R1.topY;
  walls(B, { w: uw, d: ud, h: uh, y0: uy, plaster: T.plaster, frame: T.timber, rail: false });
  const ub = { w: uw, d: ud };
  // the upper floor's front: a run of glowing shoji behind a bengara-red balcony (the Ginzan look)
  for (let i = 0; i < 4; i++) onFace(B, ub, 'f', -uw / 2 + (i + 0.5) * uw / 4, uy + 0.62, () => shoji(B, { w: uw / 4 - 0.12, h: 0.66, frame: T.timber, dress: 'none', trim: false, sill: false }));
  for (const side of ['l', 'r']) onFace(B, ub, side, 0, uy + 0.62, () => roundWindow(B, { r: 0.24, frame: T.timber }));
  onFace(B, ub, 'b', 0, uy + 0.62, () => shoji(B, { w: 0.9, h: 0.5, frame: T.timber, dress: 'none' }));
  const bz = ud / 2, bd = 0.42;
  { const fl = G.box(uw + 0.2, 0.06, bd, 0.015); fl.translate(0, uy + 0.03, bz + bd / 2); B.add(fl, T.deck); }
  for (let i = 0; i <= 3; i++) { const x = -uw / 2 - 0.05 + i * (uw + 0.1) / 3, br = G.beam(0.06, 0.06, bd + 0.1, 0.01); br.rotateX(0.5); br.translate(x, uy - 0.12, bz + bd * 0.4); B.add(br, T.bengara); }
  for (let i = 0; i <= 14; i++) { const x = -uw / 2 - 0.08 + i * (uw + 0.16) / 14, p = G.box(i % 7 ? 0.03 : 0.06, 0.5, i % 7 ? 0.03 : 0.06, 0); p.translate(x, uy + 0.3, bz + bd - 0.03); B.add(p, T.bengara); }
  for (const y of [uy + 0.12, uy + 0.56]) { const r = G.beam(uw + 0.24, 0.05, 0.07, 0.012); r.translate(0, y, bz + bd - 0.03); B.add(r, T.bengara); }
  snowSlab(B, 0, uy + 0.585, bz + bd - 0.03, uw + 0.22, 0.12, 0.045, 3);
  const R2 = snowRoof(B, { type: 'irimoya', w: uw, d: ud, y0: uy + uh, over: 0.55, H: 1.25, tg: 0.55, curve: 0.3, gOver: 0.2, snow: { th: 0.17, lip: 0.1 } });
  // the entrance porch: a little gable (its gable to the square) on two posts, the camellia crest in it
  const py = y0 + 1.55, pz = F + 0.42;
  for (const s of [-1, 1]) { const p = G.beam(0.12, py, 0.12, 0.02); p.translate(s * 0.74, py / 2, F + 0.74); B.add(p, T.timber); const base = G.cyl(0.12, 0.14, 0.12, 8); base.translate(s * 0.74, 0.06, F + 0.74); B.add(base, STONES[2]); }
  { const bm = G.beam(1.7, 0.12, 0.12, 0.02); bm.translate(0, py - 0.05, F + 0.74); B.add(bm, T.timber); }
  B.at([0, 0, pz], 0, () => {
    const Rp = snowRoof(B, { type: 'gable', ridge: 'z', w: 1.58, d: 0.92, y0: py, over: 0.16, gOver: 0.2, H: 0.55, curve: 0.25, oni: true, gable: 'wood', snow: { th: 0.12, lip: 0.07, ice: { back: 0 } }, seed: 3 });
    B.at([0, py + 0.22, 0.5], 0, () => board(B, { w: 0.42, h: 0.32, wood: '#3a2a24', frame: '#2a1e1a', layers: [[camelliaShapes()[0], T.camellia], [camelliaShapes()[1], '#f4c84a']], s: 0.36 }));
    void Rp;
  });
  // tall kanban boards on both side walls (the camellia crest reads from any side of the square)
  for (const side of ['l', 'r']) onFace(B, blk, side, (side === 'l' ? 1 : -1) * (d / 2 - 0.42), y0 + 0.95, () => { board(B, { w: 0.34, h: 0.9, wood: '#3a2a24', frame: '#2a1e1a', layers: [[camelliaShapes()[0], T.camellia], [camelliaShapes()[1], '#f4c84a']], s: 0.28 }); snowSlab(B, 0, 0.47, 0.03, 0.42, 0.1, 0.04, 5); });
  // a stone lantern by the door, camellia bushes, snow banked against the walls
  B.at([-w / 2 + 0.05, 0, F + 0.85], 0.3, () => yukimi(B, 0.62, 31));
  for (const s of [-1, 1]) B.at([s * 1.65, 0, F + 0.55], 0, () => flora(B, FL.snowBush(2 + s, 'camellia'), 0, -0.05, 0, s, 0.62));
  bank(B, -w / 2, w / 2, zc - d / 2 - 0.12, { seed: 7, r: 0.36 });
  for (const s of [-1, 1]) B.at([s * (w / 2 + 0.12), 0, zc], PI / 2, () => bank(B, -d / 2, d / 2, 0, { seed: 11 + s, r: 0.33 }));
  B.pop();
  B.at([w / 2 + 0.35, 0, -0.7], 0, () => { barrel(B, { r: 0.17, h: 0.38, wood: '#8a6448' }); pillow(B, [0, 0.4, 0], 0.16, 0.5, 4); });
  void R2;
  return {
    fp: [-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.12, F + 0.86], door: [0, F + 1.25], keeper: [-0.95, F + 1.15, 0], seat: [1.3, F + 1.1, 0],
    lamps: [[-0.55, py - 0.12, F + 0.86], [0.55, py - 0.12, F + 0.86]],
    siege(B) {
      B.at([0, y0 + 0.66, F], 0, () => boards(B, 1.15, 1.32, { seed: 5 }));
      for (const s of [-1, 1]) B.at([s * 1.42, y0 + 0.78, F + 0.13], 0, () => boards(B, 0.9, 0.6, { seed: 6 + s }));
      for (const u of [-1.35, 0.45]) B.at([u, uy + 0.62, zc + ud / 2], 0, () => boards(B, 0.82, 0.62, { seed: 9 + Math.round(u * 4) }));
      B.at([-1.95, y0, F + 0.01], 0, () => soot(B, 0.6, 1.25, T.plaster, 7));
      B.at([1.7, 0, F + 1.5], 0, () => debris(B, 0.8, { seed: 23, n: 5 }));
      B.at([1.9, 0, F + 1.05], 0, () => warBanner(B, { h: 2.5, w: 0.52, seed: 27 }));
    },
    saved(B) {
      B.at([0, y0, F], 0, () => norenSign(B, { w: 1.06, h: 0.5, y: 1.32 - 0.02, z: 0.16, color: T.crimson, mark: 'camellia', strips: 3, markScale: 0.32 }));
      // towels drying over the balcony rail, a red-felt bench and a parasol out front, geta by the step
      for (const [x, c] of [[-1.2, '#ffffff'], [-0.35, '#8fd0ff'], [0.55, '#ffd0d8'], [1.3, '#ffffff']]) B.at([x, uy + 0.585, zc + bz + bd], 0, () => { const t = G.box(0.32, 0.36, 0.02, 0.008); t.translate(0, -0.17, 0.03); B.add(t, c); const t2 = G.box(0.32, 0.12, 0.02, 0.008); t2.translate(0, -0.04, -0.03); B.add(t2, shade(c, 0.92)); });
      B.at([1.3, 0, F + 1.25], PI, () => teaBench(B, { w: 1.0, felt: T.camellia }));
      B.at([2.0, 0, F + 1.5], 0, () => parasol(B, { r: 0.72, h: 1.7, color: T.camellia }));
      for (const s of [-1, 1]) B.at([s * 0.22, 0.02, F + 0.98], 0, () => { const g = G.box(0.1, 0.04, 0.22, 0.012); g.translate(0, 0.04, 0); B.add(g, '#c8a070'); const st = G.box(0.012, 0.02, 0.1, 0); st.translate(0, 0.07, 0.03); B.add(st, T.camellia); });
    },
  };
}

// ------------------------------------------------------------------ Mikan's Warm Goods 蜜柑屋 (hand warmers, hot buns, mittens)
function steamer(B, tiers = 3, r = 0.17) {
  for (let i = 0; i < tiers; i++) { const g = G.cyl(r, r, 0.085, 14); g.translate(0, 0.045 + i * 0.09, 0); B.add(g, (p, n, o) => o.set(Math.abs(n.y) > 0.8 ? '#d8c088' : Math.sin(p.y * 260) > 0.7 ? '#a8884e' : '#c8a868')); }
  const lid = G.cyl(r * 0.96, r, 0.07, 14); lid.translate(0, 0.045 + tiers * 0.09 + 0.01, 0); B.add(lid, '#c8a868'); const kn = G.box(0.12, 0.03, 0.03, 0); kn.translate(0, 0.08 + tiers * 0.09 + 0.03, 0); B.add(kn, '#8a6a42');
}
function mikanPile(B, w = 0.6, d = 0.34, rows = 3) {
  const cr = G.box(w + 0.06, 0.1, d + 0.06, 0.02); cr.translate(0, 0.05, 0); B.add(cr, '#a8845e');
  const rr = mulberry32(Math.round(w * 100 + d * 13));
  for (let k = 0; k < rows; k++) { const nx = Math.round(w / 0.1) - k, nzz = Math.round(d / 0.1) - k; for (let i = 0; i < nx; i++) for (let j = 0; j < nzz; j++) { const m = G.sph(0.052, 7, 5); m.scale(1, 0.88, 1); m.translate(-((nx - 1) * 0.1) / 2 + i * 0.1, 0.14 + k * 0.075, -((nzz - 1) * 0.1) / 2 + j * 0.1); B.add(m, rr() < 0.85 ? '#f08a2a' : '#f4a040'); } }
}
export function shop(B) {
  const w = 3.0, d = 2.2, h = 1.45, y0 = 0.25, zc = -0.2, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.timber, koshi: T.koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.3, h - 0.18, 0.03, 0); back.translate(0, (h - 0.18) / 2 + 0.02, 0.005); B.add(back, '#3e302a');
    // shelves: mittens in pairs, folded scarves, boxes of hand warmers
    const rr = mulberry32(77);
    for (const y of [0.78, 1.1]) {
      const sh = G.box(w - 0.5, 0.04, 0.2, 0.01); sh.translate(0, y, 0.1); B.add(sh, '#a8845e');
      for (let x = -(w - 0.66) / 2; x < (w - 0.66) / 2; x += 0.2) {
        const c = ['#e8503a', '#f4c040', '#5a9ad8', '#ffffff', '#8ac06a', '#ff8fb0'][Math.floor(rr() * 6)];
        if (y < 1) { for (const s of [-1, 1]) { const m = G.box(0.065, 0.11, 0.05, 0.02); m.translate(x + s * 0.04, y + 0.075, 0.1); B.add(m, c); const th = G.box(0.03, 0.05, 0.04, 0.012); th.translate(x + s * 0.075, y + 0.06, 0.1); B.add(th, c); } }
        else if (rr() < 0.5) { for (let k = 0; k < 3; k++) { const s = G.box(0.15, 0.04, 0.13, 0.015); s.translate(x, y + 0.04 + k * 0.042, 0.1); B.add(s, k % 2 ? shade(c, 0.88) : c); } }
        else { const b = G.box(0.13, 0.12, 0.1, 0.015); b.translate(x, y + 0.08, 0.1); B.add(b, '#f6f0e4'); const lab = G.box(0.08, 0.05, 0.005, 0); lab.translate(x, y + 0.09, 0.152); B.add(lab, '#d8343a'); }
      }
    }
    for (const s of [-1, 1]) { const p = G.beam(0.12, h, 0.12, 0.02); p.translate(s * (w / 2 - 0.12), h / 2, 0.06); B.add(p, T.timber); }
    const lin = G.beam(w + 0.04, 0.16, 0.14, 0.02); lin.translate(0, h - 0.06, 0.07); B.add(lin, T.timber);
    // the counter: steamer stacks of hot buns, a pyramid of mikan, roasted sweet potatoes in a basket
    const ct = G.box(w - 0.5, 0.58, 0.42, 0.03); ct.translate(0, 0.29, 0.3); B.add(ct, '#8a6448');
    const top = G.box(w - 0.4, 0.06, 0.5, 0.02); top.translate(0, 0.61, 0.3); B.add(top, '#c49a6c');
    for (let i = 0; i < 6; i++) { const pl = G.box(0.015, 0.5, 0.01, 0); pl.translate(-(w - 0.5) / 2 + (i + 0.5) * (w - 0.5) / 6, 0.28, 0.512); B.add(pl, '#6a4a36'); }
    B.at([-0.95, 0.64, 0.3], 0, () => steamer(B, 4)); B.at([-0.55, 0.64, 0.33], 0, () => steamer(B, 3, 0.15));
    B.at([0.42, 0.64, 0.3], 0, () => mikanPile(B, 0.62, 0.32, 3));
    B.at([1.0, 0.64, 0.3], 0, () => { const bk = G.cyl(0.16, 0.12, 0.12, 12, true); bk.translate(0, 0.06, 0); B.add(bk, '#c8a060'); for (let k = 0; k < 4; k++) { const sp = G.sph(0.06, 6, 4); sp.scale(1.8, 0.8, 0.9); sp.rotateY(k * 0.8); sp.translate((k % 2 - 0.5) * 0.1, 0.12, (Math.floor(k / 2) - 0.5) * 0.08); B.add(sp, '#8a3a4a'); } });
  });
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, y0 + 0.82, () => shoji(B, { w: 0.6, h: 0.48, frame: T.timber, dress: 'none' }));
  onFace(B, blk, 'b', 0, y0 + 0.82, () => shoji(B, { w: 0.8, h: 0.48, frame: T.timber, dress: 'none' }));
  const R = snowRoof(B, { type: 'hip', w, d, y0: y0 + h, over: 0.55, H: 0.92, curve: 0.3, snow: { th: 0.16, lip: 0.09 } });
  // the giant mikan on the ridge: an orange ball with a leaf, a snow cap, on a short post
  B.at([0, R.ridgeY + 0.08, 0], 0, () => {
    const post = G.cyl(0.05, 0.06, 0.5, 6); post.translate(0, 0.25, 0); B.add(post, T.timber);
    const m = G.sph(0.42, 16, 12); m.scale(1, 0.86, 1); m.translate(0, 0.78, 0); B.add(m, (p, n, o) => o.set('#f08a2a').lerp(new THREE.Color('#ffb050'), clamp(n.y * 0.5 + n.z * 0.3)).multiplyScalar(0.94 + 0.08 * nz(p.x * 30, p.y * 30)));
    const st = G.cyl(0.03, 0.04, 0.08, 6); st.translate(0, 1.15, 0); B.add(st, '#5a4a2a');
    const lf = G.sph(0.14, 8, 5); lf.scale(1.6, 0.25, 0.8); lf.rotateZ(-0.3); lf.translate(0.2, 1.15, 0.05); B.add(lf, '#4a8a3a');
    const cap = puff(V(-0.04, 1.08, 0), 0.24, { detail: 1, noise: 0.2, squash: 0.35, seed: 5 }); B.add(cap, snowCol);
  });
  B.at([-w / 2 - 0.02, 1.5, d / 2 - 0.3], -PI / 2, () => {
    const arm = G.box(0.035, 0.035, 0.42, 0); arm.translate(0, 0, 0.21); B.add(arm, C.iron);
    B.at([0, -0.28, 0.36], PI / 2, () => { board(B, { w: 0.42, h: 0.42, wood: '#f4e8d0', layers: [[mikanShapes()[0], T.mikan], [mikanShapes()[1], '#4a8a3a']], s: 0.36 }); B.at([0, 0, 0], PI, () => B.at([0, 0, 0.026], 0, () => crest(B, [[mikanShapes()[0], T.mikan], [mikanShapes()[1], '#4a8a3a']], 0.36))); });
  });
  B.pop();
  // the brazier out front (hibachi: cold coals until the village is saved) and crates of mikan
  B.at([0.95, 0, F + 0.95], 0, () => {
    const pot = G.cyl(0.26, 0.2, 0.36, 14); pot.translate(0, 0.32, 0); B.add(pot, (p, n, o) => o.set('#6a5a7a').lerp(new THREE.Color('#8a7aa0'), clamp(n.y + 0.3) * 0.4));
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, l = G.box(0.05, 0.16, 0.05, 0); l.translate(Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17); B.add(l, T.timber); }
    const ash = G.cyl(0.22, 0.22, 0.03, 12); ash.translate(0, 0.49, 0); B.add(ash, '#3a3232');
    const grill = G.box(0.4, 0.015, 0.4, 0); grill.translate(0, 0.52, 0); B.add(grill, C.iron);
  });
  B.at([-1.15, 0, F + 0.7], 0.3, () => { crate(B, { s: 0.34, wood: '#c8a070' }); B.at([0, 0.34, 0], 0, () => mikanPile(B, 0.26, 0.26, 1)); pillow(B, [-0.25, 0.02, 0.1], 0.2, 0.4, 3); });
  bank(B, -w / 2, w / 2, zc - d / 2 - 0.12, { seed: 17, r: 0.34 });
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, F + 0.52], door: [0, F + 1.15], keeper: [0, F + 0.05, 0], counter: true,
    lamps: [[-1.2, y0 + h + 0.0, F + 0.5], [1.2, y0 + h + 0.0, F + 0.5]],
    steam: [{ p: [-0.95, y0 + 1.15, F + 0.3], k: 'pot', saved: true }, { p: [-0.55, y0 + 1.05, F + 0.33], k: 'pot', saved: true }, { p: [0.95, 0.6, F + 0.95], k: 'pot', saved: true }],
    siege(B) {
      // amado storm shutters across the open front, boarded; mikan spilled on the snow
      B.at([0, y0, F + 0.55], 0, () => {
        const n = 7;
        for (let i = 0; i < n; i++) { const p = G.box((w - 0.3) / n - 0.02, h - 0.12, 0.05, 0.01); p.translate(-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.12) / 2, 0); p.rotateZ((i - 3) * 0.006); B.add(p, ['#7a5e48', '#6e5442', '#86684e'][i % 3]); }
        B.at([0, h * 0.5, 0], 0, () => boards(B, w - 0.4, h - 0.3, { seed: 13 }));
      });
      const rr = mulberry32(5);
      for (let i = 0; i < 9; i++) { const m = G.sph(0.052, 7, 5); m.translate(-1.5 + rr() * 1.6, 0.05, F + 0.9 + rr() * 1.0); B.add(m, '#f08a2a'); }
      B.at([-1.2, 0.12, F + 1.4], 0.4, () => { const s = G.cyl(0.17, 0.17, 0.085, 12); s.rotateZ(1.3); B.add(s, '#c8a868'); });
      B.at([1.7, 0, F + 1.2], 0, () => debris(B, 0.7, { seed: 31, n: 4 }));
    },
    saved(B) {
      // the brazier lit, sweet potatoes on the grill; mittens pegged along a cord under the eave; an orange nobori
      B.at([0.95, 0, F + 0.95], 0, () => { const coal = G.ico(0.17, 1); coal.scale(1, 0.32, 1); coal.translate(0, 0.51, 0); B.glow(coal, '#ff7a2a', { hot: true, flicker: 1, tint: 1 }); for (let k = 0; k < 3; k++) { const sp = G.sph(0.055, 6, 4); sp.scale(1.9, 0.8, 0.9); sp.translate(-0.1 + k * 0.1, 0.56, (k - 1) * 0.06); B.add(sp, '#8a3a4a'); } });
      const cord = []; for (let k = 0; k <= 10; k++) { const t = k / 10; cord.push({ p: V(-1.35 + 2.7 * t, y0 + h - 0.1 - Math.sin(t * PI) * 0.08, F + 0.62), r: 0.008 }); } B.add(tube(cord, 3, false), '#f4f0e8');
      const cs = ['#e8503a', '#f4c040', '#5a9ad8', '#ff8fb0', '#8ac06a', '#ffffff'];
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, x = -1.35 + 2.7 * t, y = y0 + h - 0.1 - Math.sin(t * PI) * 0.08; B.at([x, y, F + 0.62], 0, () => { const m = G.box(0.12, 0.16, 0.04, 0.03); m.translate(0, -0.1, 0); B.add(m, cs[i]); const th = G.box(0.05, 0.07, 0.035, 0.015); th.translate(0.075, -0.07, 0); B.add(th, cs[i]); const cf = G.box(0.13, 0.04, 0.045, 0.012); cf.translate(0, -0.02, 0); B.add(cf, '#ffffff'); }); }
      B.at([-1.85, 0, F + 0.8], 0, () => nobori(B, { h: 2.3, w: 0.4, color: T.mikan, sym: 'star', symColor: '#fff6ea' }));
    },
  };
}

// ------------------------------------------------------------------ Yukimi Bathhouse 雪見湯 (the public bath: ゆ, chimney, steam)
export function bathhouse(B) {
  const w = 4.4, d = 2.6, h = 1.9, y0 = 0.36, zc = -0.2, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.timber, koshi: T.koshi, koshiSkip: ['f'], koshiH: 0.62 });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 1.3, h: 1.42, style: 'wood', frame: T.timber, wood: '#8a6448' }));
  for (const s of [-1, 1]) {
    onFace(B, blk, 'f', s * 1.6, y0 + 0.78, () => latticeWindow(B, { w: 0.72, h: 0.6, frame: T.timber, slat: T.timberMid }));
    onFace(B, blk, 'f', s * 1.6, y0 + h - 0.3, () => shoji(B, { w: 0.62, h: 0.26, frame: T.timber, dress: 'none', trim: false, cell: 0.16 }));
  }
  // the bath halls' high windows down both sides (steamy, glowing) and the back
  for (const side of ['l', 'r']) for (const u of [-0.75, 0.75]) onFace(B, blk, side, u, y0 + h - 0.42, () => latticeWindow(B, { w: 0.62, h: 0.36, frame: T.timber }));
  for (const u of [-1.2, 0, 1.2]) onFace(B, blk, 'b', u, y0 + h - 0.42, () => latticeWindow(B, { w: 0.62, h: 0.34, frame: T.timber }));
  const R = snowRoof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.56, H: 1.5, tg: 0.5, curve: 0.32, gOver: 0.22, snow: { th: 0.17, lip: 0.1 } });
  // the yagura: a raised steam vent on the ridge, slatted sides under its own little snowy roof
  const vy = R.snow.yAt(1) - 0.12;
  B.at([0, vy, 0], 0, () => {
    const bx = G.box(1.3, 0.42, 0.66, 0.02); bx.translate(0, 0.21, 0); B.add(bx, T.timberMid);
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { const sl = G.box(0.035, 0.32, 0.02, 0); sl.translate(-0.56 + i * 0.14, 0.24, s * 0.34); B.add(sl, '#2a2020'); }
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const sl = G.box(0.02, 0.32, 0.035, 0); sl.translate(s * 0.66, 0.24, -0.24 + i * 0.16); B.add(sl, '#2a2020'); }
    snowRoof(B, { type: 'gable', w: 1.3, d: 0.66, y0: 0.44, over: 0.2, gOver: 0.16, H: 0.34, curve: 0.2, oni: true, ribW: 0.18, snow: { th: 0.1, lip: 0.06, ridge: 0.05, ice: { every: 0.12, len: [0.05, 0.16] } }, seed: 9 });
  });
  // the karahafu entrance porch on two posts out past the main eave, the ゆ plaque hung under its bell, a stone step
  const ky = y0 + 1.6, PD = 1.3, pz = d / 2 + PD - 0.12;
  for (const s of [-1, 1]) { const p = G.beam(0.14, ky, 0.14, 0.02); p.translate(s * 0.98, ky / 2, pz); B.add(p, T.timber); const base = G.cyl(0.14, 0.16, 0.14, 8); base.translate(s * 0.98, 0.07, pz); B.add(base, STONES[2]); }
  { const bm = G.beam(2.2, 0.14, 0.14, 0.02); bm.translate(0, ky - 0.07, pz); B.add(bm, T.timber); for (const s of [-1, 1]) { const tb = G.beam(0.1, 0.1, PD, 0.015); tb.translate(s * 0.98, ky - 0.1, d / 2 + PD / 2); B.add(tb, T.timber); } }
  { const fill = G.box(1.84, 0.34, 0.05, 0.01); fill.translate(0, ky + 0.17, pz); B.add(fill, T.timberMid); }
  { const st = G.box(2.1, 0.12, PD - 0.1, 0.03); st.translate(0, 0.06, d / 2 + PD / 2 - 0.05); B.add(st, T.stoneLight); }
  B.at([0, 0, d / 2], 0, () => karahafu(B, { W: 2.3, D: PD, y0: ky + 0.03, H: 0.46, rise: 0.1, seed: B.seed % 53 }));
  B.at([0, ky + 0.19, pz + 0.04], 0, () => board(B, { w: 0.5, h: 0.4, wood: '#2e2420', frame: '#1e1614', mark: 'yu', markColor: '#f6f0e4', s: 0.36 }));
  // the ゆ board on the left side wall too (the yaw that sees the bathhouse side-on)
  onFace(B, blk, 'l', d / 2 - 0.5, y0 + 1.0, () => { board(B, { w: 0.46, h: 0.4, wood: '#2e2420', frame: '#1e1614', mark: 'yu', markColor: '#f6f0e4', s: 0.32 }); snowSlab(B, 0, 0.21, 0.03, 0.52, 0.1, 0.04, 7); });
  // the boiler's chimney behind the back-left corner: a tall tapered brick stack with iron bands and a painted ゆ
  const cx = -w / 2 + 0.2, cz = -d / 2 - 0.42, cyTop = 5.6;
  {
    const g = G.cyl(0.3, 0.42, cyTop, 4); g.rotateY(PI / 4); g.translate(cx, cyTop / 2, cz);
    B.add(g, (p, n, o) => { o.set(T.brick).multiplyScalar(0.86 + 0.14 * (Math.sin(p.y * 22) > 0.85 ? 0.6 : 1) + 0.05 * nz(p.y * 4, p.x * 9)); if (p.y > cyTop - 0.5) o.lerp(new THREE.Color('#3a2a2a'), 0.55); });
    for (const y of [1.2, 2.3, 3.4, 4.5]) { const r = 0.42 - (0.12 * y / cyTop), b = G.cyl(r * 1.01 + 0.02, r * 1.01 + 0.02, 0.05, 4, true); b.rotateY(PI / 4); b.translate(cx, y, cz); B.add(b, '#3a3a44'); }
    const lip = G.cyl(0.36, 0.33, 0.12, 4); lip.rotateY(PI / 4); lip.translate(cx, cyTop + 0.06, cz); B.add(lip, '#5a4a48');
    pillow(B, [cx + 0.12, cyTop + 0.12, cz], 0.12, 0.5, 31);
    B.at([cx, 4.1, cz + 0.27], 0, () => { const g2 = GLYPHS.yu(); g2.scale(0.42, 0.42, 1); g2.rotateX(-0.03); B.add(g2, '#f6f0e4'); });
    // the boiler shed against the back wall, its firewood
    B.at([cx + 0.6, 0, cz + 0.05], 0, () => {
      const sh = G.box(1.2, 1.15, 0.7, 0.03); sh.translate(0, 0.575, 0); B.add(sh, { grad: [shade(T.timberMid, 0.8), T.timberMid] });
      for (let i = 1; i < 6; i++) { const s = G.box(0.012, 1.1, 0.71, 0); s.translate(-0.6 + i * 0.2, 0.57, 0); B.add(s, T.timber); }
      const rf = G.box(1.4, 0.06, 0.95, 0.02); rf.rotateX(-0.3); rf.translate(0, 1.27, -0.05); B.add(rf, '#4a4a56');
      const snr = G.box(1.42, 0.1, 0.92, 0.045); snr.rotateX(-0.3); snr.translate(0, 1.35, -0.05); B.add(snr, snowCol);
      const fb = G.box(0.2, 0.2, 0.02, 0.01); fb.translate(0.35, 0.35, -0.36); B.glow(fb, '#ff8a3a', { hot: true, flicker: 1, tint: 1 });
    });
    B.at([cx - 0.62, 0, cz + 0.75], PI / 2, () => { firewood(B, { w: 0.9, h: 0.6, d: 0.32 }); snowSlab(B, 0, 0.72, 0.02, 1.06, 0.48, 0.06, 5); });
  }
  // the outdoor bath's bamboo screen down the right side (the big spring steams behind it); stepping stones out to it
  B.at([w / 2 + 0.55, 0, -d / 2 + 0.35], 0, () => {
    const L = d + 0.1;
    for (let i = 0; i < Math.round(L / 0.075); i++) { const z = i * 0.075, hh = 1.45 + 0.05 * Math.sin(i * 1.7); const p = G.cyl(0.034, 0.036, hh, 5); p.translate(0, hh / 2, z); B.add(p, i % 3 ? '#b8b070' : '#a8a060'); }
    for (const y of [0.45, 1.05]) { const r = G.cyl(0.03, 0.03, L, 5); r.rotateX(PI / 2); r.translate(0.05, y, L / 2); B.add(r, T.timber); }
    for (let k = 0; k <= 3; k++) { const p = G.cyl(0.06, 0.07, 1.58, 7); p.translate(0, 0.79, k * L / 3); B.add(p, '#6a5a3a'); }
    snowSlab(B, 0, 1.5, L / 2, 0.14, L + 0.05, 0.06, 13);
    bank(B, 0, L, 0.2, { seed: 21, r: 0.3 });
  });
  for (let i = 0; i < 4; i++) { const st = puff(V(0, 0, 0), 0.24, { detail: 1, noise: 0.2, squash: 0.3, seed: i + 61 }); st.scale(1.3, 1, 1); st.translate(w / 2 + 0.25 + i * 0.32, 0.04, -d / 2 + 0.1 - i * 0.28); B.add(st, (p, n, o) => { o.set(T.stoneLight); FL.snowOn(o, V(0, n.y - 0.25, 0), 0.6, 0.4, 0.8); }); }
  bank(B, -w / 2 + 0.6, w / 2, -d / 2 - 0.12, { seed: 27, r: 0.34 });
  B.at([-w / 2 - 0.12, 0, 0], PI / 2, () => bank(B, -d / 2 + 0.2, d / 2, 0, { seed: 29, r: 0.32 }));
  B.pop();
  // the forecourt: an oke bucket stack by the door, a bench for the towel rack (saved), a stone lantern
  B.at([-2.15, 0, F + 0.65], 0.2, () => { for (let i = 0; i < 3; i++) B.at([0, i * 0.12, 0], i * 0.4, () => bucket(B, { r: 0.13 - i * 0.012, h: 0.16 })); pillow(B, [0, 0.42, 0], 0.11, 0.5, 6); });
  B.at([2.25, 0, F + 0.75], -0.4, () => eggBasin(B));
  return {
    fp: [-w / 2 - 0.15, zc - d / 2 - 0.7, w / 2 + 0.65, F + PD], door: [0, F + PD + 0.45], keeper: [1.3, F + PD + 0.25, 0], seat: [-1.35, F + PD + 0.2, 0],
    lamps: [[-0.68, ky - 0.15, zc + pz + 0.02], [0.68, ky - 0.15, zc + pz + 0.02]],
    steam: [{ p: [2.25, 0.55, F + 0.75], k: 'bath' }, { p: [0, vy + 0.3, zc + 0.36], k: 'vent' }, { p: [0, vy + 0.3, zc - 0.36], k: 'vent' }, { p: [cx, cyTop + 0.25, zc + cz], k: 'smoke' }, { p: [w / 2 + 0.7, 1.0, zc - d / 2 - 0.4], k: 'vent' }],
    siege(B) {
      B.at([0, y0 + 0.72, F], 0, () => boards(B, 1.35, 1.42, { seed: 3 }));
      for (const s of [-1, 1]) B.at([s * 1.6, y0 + 0.78, F + 0.04], 0, () => boards(B, 0.78, 0.64, { seed: 4 + s }));
      B.at([-1.25, y0, F + 0.01], 0, () => soot(B, 0.7, 1.4, T.plaster, 9));
      // planks nailed across the porch between its posts
      for (const [y, a] of [[0.55, 0.12], [0.95, -0.1], [1.3, 0.06]]) B.at([0, y, zc + pz + 0.1], 0, () => { const p = G.beam(2.15, 0.13, 0.04, 0.01); p.rotateZ(a); B.add(p, ['#a8845e', '#9a7656', '#b8946a'][Math.round(y * 3) % 3]); for (const s of [-1, 1]) { const n = G.cyl(0.02, 0.02, 0.02, 5); n.rotateX(PI / 2); n.translate(s * 0.98, s * a * 0.98, 0.03); B.add(n, C.iron); } });
      // the ゆ plaque knocked askew, wooden buckets kicked across the snow
      B.at([0.3, 0.06, F + 1.6], 0.8, () => { bucket(B, { r: 0.13, h: 0.16 }); }, 1, PI / 2, 0);
      B.at([-0.7, 0.06, F + 1.9], -0.4, () => { bucket(B, { r: 0.12, h: 0.15 }); }, 1, PI / 2, 0);
      B.at([1.5, 0, F + 1.6], 0, () => debris(B, 0.8, { seed: 41, n: 4 }));
      B.at([-1.9, 0, F + 1.3], 0, () => warBanner(B, { h: 2.6, w: 0.55, seed: 43 }));
    },
    saved(B) {
      // the two noren (indigo for the men's bath, crimson for the women's), each with a white ゆ
      // the two big noren across the porch front (indigo: the men's bath, crimson: the women's), each with a white ゆ
      for (const s of [-1, 1]) B.at([s * 0.47, 0, zc + pz + 0.02], 0, () => norenSign(B, { w: 0.86, h: 0.78, y: ky - 0.15, z: 0.1, color: s < 0 ? T.indigo : T.crimson, mark: 'yu', strips: 2, markScale: 0.52 }));
      B.at([1.45, 0, F + 0.85], -0.3, () => towelRack(B, { colors: ['#ffffff', '#8fd0ff'] }));
      // a crate of bottled milk by the door (a bath-house classic), the open sign
      B.at([-1.3, 0, F + 0.8], 0.25, () => { crate(B, { s: 0.36, wood: '#c8a070', stencil: false }); for (let i = 0; i < 6; i++) { const b = G.cyl(0.035, 0.04, 0.16, 8); b.translate(-0.1 + (i % 3) * 0.1, 0.42, (Math.floor(i / 3) - 0.5) * 0.12); B.add(b, i % 2 ? '#c89058' : '#fff8ee'); const c = G.cyl(0.036, 0.036, 0.02, 8); c.translate(-0.1 + (i % 3) * 0.1, 0.51, (Math.floor(i / 3) - 0.5) * 0.12); B.add(c, '#e8503a'); } });
      B.at([0.95, ky + 0.0, F + 1.0], 0, () => { const ch = G.box(0.01, 0.12, 0.01, 0); ch.translate(0, -0.06, 0); B.add(ch, C.iron); B.at([0, -0.28, 0], 0, () => board(B, { w: 0.24, h: 0.3, wood: '#f4ead4', mark: 'yu', markColor: T.crimson, s: 0.22 })); });
    },
  };
}

/** the onsen-tamago basin: a steaming stone basin of spring water, a bamboo basket of eggs hung in it from a little frame */
function eggBasin(B) {
  const rim = G.cyl(0.42, 0.46, 0.4, 12); rim.translate(0, 0.2, 0); B.add(rim, (p, n, o) => { o.set(T.stone).lerp(new THREE.Color(T.stoneLight), clamp(nz(p.x * 6, p.y * 6 + p.z * 4) * 0.5 + 0.5) * 0.55); if (n.y > 0.6) FL.snowOn(o, V(0, n.y + nz(p.x * 8, p.z * 8) * 0.3 - 0.35, 0), 1, 0.3, 0.7); });
  const w = G.disc(0.34, 14); w.rotateX(-PI / 2); w.translate(0, 0.37, 0); B.add(w, '#4ac8c4', 'water');
  for (const s of [-1, 1]) { const p = G.beam(0.05, 0.85, 0.05, 0.01); p.translate(s * 0.36, 0.43, 0); B.add(p, T.wood); }
  const bar = G.cyl(0.022, 0.022, 0.8, 5); bar.rotateZ(PI / 2); bar.translate(0, 0.84, 0); B.add(bar, T.wood);
  for (const x of [-0.13, 0.13]) {
    const cord = G.cyl(0.006, 0.006, 0.42, 3); cord.translate(x, 0.63, 0); B.add(cord, '#c8b088');
    const bk = G.cyl(0.11, 0.08, 0.1, 10, true); bk.translate(x, 0.4, 0); B.add(bk, (p, n, o) => o.set(Math.sin(p.y * 160) > 0 ? '#c8a060' : '#a88848'));
    for (let k = 0; k < 4; k++) { const e = G.sph(0.035, 7, 5); e.scale(1, 1.25, 1); e.translate(x + (k % 2 - 0.5) * 0.06, 0.44, (Math.floor(k / 2) - 0.5) * 0.06); B.add(e, k % 3 ? '#f4ecd8' : '#e8d8b8'); }
  }
  pillow(B, [0, 0.87, 0], 0.07, 0.6, 3, 4, 0.7);
  const sign = G.box(0.26, 0.16, 0.025, 0.008); sign.translate(0.46, 0.66, 0.02); sign.rotateY(-0.2); B.add(sign, '#2e2420');
  B.at([0.46, 0.66, 0.035], -0.2, () => glyph(B, 'yu', 0.11, '#f6f0e4', 0));
}
// ------------------------------------------------------------------ Tetsu's Snow Forge 雪鉄の鍛冶 (hearth, anvil, bellows, snow ore)
function oreCluster(B, { n = 9, r = 0.28, seed = 0, glow = true } = {}) {
  const rr = mulberry32(seed * 37 + 1);
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, d = Math.sqrt(rr()) * r, L = 0.14 + rr() * 0.22, g = G.cone(0.04 + rr() * 0.035, L, 6);
    g.translate(0, L / 2, 0); g.rotateZ((rr() - 0.5) * 0.9); g.rotateY(rr() * TAU); g.translate(Math.cos(a) * d, 0.02, Math.sin(a) * d);
    if (glow) B.glow(g, rr() < 0.5 ? '#cfefff' : '#a8dcff', { flicker: 0.15, tint: 1 }); else B.add(g, (p, nn, o) => o.set('#cfefff').lerp(new THREE.Color('#7ab8e8'), clamp(-nn.y + 0.3) * 0.6));
  }
}
export function smith(B) {
  const w = 3.5, d = 2.5, h = 1.75, y0 = 0.14, zc = -0.15, F = blkF(zc, d);
  B.push([0, 0, zc]);
  // a flagstone floor, a rough stone back wall, half-height plank sides, heavy posts
  const fl = G.box(w + 0.2, y0, d + 0.2, 0.04); fl.translate(0, y0 / 2, 0); B.add(fl, { grad: [T.stoneDark, T.stone] });
  { const bw = G.box(w, h, 0.32, 0.05); bw.translate(0, y0 + h / 2, -d / 2 + 0.16); B.add(bw, (p, n, o) => { const k = nz(p.x * 3.2, p.y * 4.4), c = Math.abs(Math.sin(p.x * 5.1 + Math.floor(p.y * 3.6) * 1.7)) < 0.08 || Math.abs(Math.sin(p.y * 11.3)) < 0.1; o.set(T.stone).lerp(new THREE.Color(T.stoneLight), clamp(k * 0.5 + 0.5) * 0.5).multiplyScalar(c ? 0.72 : 1); }); }
  for (const s of [-1, 1]) {
    const sw = G.box(0.08, 0.9, d - 0.3, 0.02); sw.translate(s * (w / 2 - 0.04), y0 + 0.45, 0.1); B.add(sw, T.timberMid);
    for (let i = 1; i < 6; i++) { const ln = G.box(0.085, 0.012, d - 0.32, 0); ln.translate(s * (w / 2 - 0.04), y0 + i * 0.15, 0.1); B.add(ln, T.timber); }
  }
  for (const [x, z] of [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2 + 0.3], [w / 2, -d / 2 + 0.3], [-0.6, d / 2], [0.6, d / 2]]) { const p = G.beam(0.15, h + 0.12, 0.15, 0.025); p.translate(x, y0 + (h + 0.12) / 2, z); B.add(p, T.timber); }
  { const fb = G.beam(w + 0.2, 0.18, 0.16, 0.025); fb.translate(0, y0 + h + 0.06, d / 2); B.add(fb, T.timber); }
  const R = snowRoof(B, { type: 'gable', ridge: 'z', w: w + 0.1, d: d + 0.05, y0: y0 + h + 0.14, over: 0.42, gOver: 0.42, H: 1.25, curve: 0.18, tile: '#4e4a52', edge: '#2e2c34', oni: true, gable: 'wood', gableWood: T.timberMid, vent: false, snow: { th: 0.15, lip: 0.09 } });
  // the front gable: a slatted smoke vent, the forge's hammer crest on a board
  B.at([0, y0 + h + 0.14, d / 2 + 0.05], 0, () => { for (let i = 0; i < 7; i++) { const sl = G.box(0.035, 0.42, 0.03, 0); sl.translate(-0.3 + i * 0.1, 0.62, 0.02); B.add(sl, '#2a2020'); } const fr = G.beam(0.74, 0.06, 0.05, 0.01); fr.translate(0, 0.86, 0.03); B.add(fr, T.timber); const fr2 = G.beam(0.74, 0.06, 0.05, 0.01); fr2.translate(0, 0.39, 0.03); B.add(fr2, T.timber); });
  // the hearth (back left): a stone forge with a dark mouth, its hood and the chimney up through the roof
  const hx = -0.85, hz = 0.55;
  B.at([hx, y0, hz], 0, () => {
    const body = G.box(1.05, 0.82, 0.85, 0.06); body.translate(0, 0.41, 0); B.add(body, (p, n, o) => o.set(T.stoneDark).lerp(new THREE.Color(T.stone), clamp(nz(p.x * 6, p.y * 6) * 0.5 + 0.5) * 0.5));
    const mouth = new THREE.Shape(); mouth.moveTo(-0.24, 0); mouth.lineTo(-0.24, 0.16); mouth.absarc(0, 0.16, 0.24, PI, 0, true); mouth.lineTo(0.24, 0); mouth.closePath();
    const mg = new THREE.ShapeGeometry(mouth, 8); mg.translate(0, 0.36, 0.43); B.add(flatOf(mg), '#1a1416');
    const lipS = G.box(1.12, 0.08, 0.92, 0.03); lipS.translate(0, 0.84, 0); B.add(lipS, T.stone);
    const coal = G.box(0.7, 0.06, 0.5, 0.02); coal.translate(0, 0.87, -0.05); B.add(coal, '#2a2424');
    const hood = G.cyl(0.26, 0.5, 0.5, 4); hood.rotateY(PI / 4); hood.translate(0, 1.15, -0.1); B.add(hood, { grad: [T.stoneDark, '#4a4a52'] });
    const ch = G.box(0.46, 2.5, 0.46, 0.04); ch.translate(0, 1.4 + 1.25, -0.1); B.add(ch, (p, n, o) => { o.set(T.stone).multiplyScalar(0.84 + 0.16 * (Math.abs(Math.sin(p.y * 8.3)) > 0.12 ? 1 : 0.6) + 0.06 * nz(p.y * 5, p.x * 7)); if (p.y > 3.6) o.lerp(new THREE.Color('#2e2a2e'), 0.6); });
    const cap = G.box(0.58, 0.08, 0.58, 0.03); cap.translate(0, 3.92, -0.1); B.add(cap, T.stoneDark); pillow(B, [0.1, 3.98, -0.05], 0.12, 0.5, 21);
    // the box bellows (fuigo) beside it, with its push handle
    B.at([0.85, 0, 0.1], 0, () => { const bx = G.box(0.32, 0.36, 0.7, 0.03); bx.translate(0, 0.2, 0); B.add(bx, T.wood); for (const zz of [-0.36, 0.36]) { const hd = G.box(0.33, 0.37, 0.03, 0.01); hd.translate(0, 0.2, zz); B.add(hd, T.timber); } const rod = G.cyl(0.018, 0.018, 0.4, 5); rod.rotateX(PI / 2); rod.translate(0, 0.26, 0.55); B.add(rod, C.woodLight); const hd2 = G.cyl(0.025, 0.025, 0.3, 5); hd2.rotateZ(PI / 2); hd2.translate(0, 0.26, 0.75); B.add(hd2, C.woodLight); });
  });
  B.at([0.9, y0 + 1.35, -d / 2 + 0.33], 0, () => toolRack(B, 1.1, 0, { tools: ['tongs', 'hammer', 'tongs', 'saw', 'hammer'] }));
  B.at([1.05, y0, 0.1], 0, () => { barrel(B, { r: 0.24, h: 0.34, wood: '#7a5a42', lid: false }); const wt = G.disc(0.21, 14); wt.rotateX(-PI / 2); wt.translate(0, 0.31, 0); B.add(wt, '#5a8aa8', 'water'); });
  B.pop();
  // out front: the anvil on its stump, the snow ore crate glowing blue-white, a grindstone, the hammer sign
  B.at([0.25, 0, F + 0.5], -0.2, () => anvil(B));
  B.at([-1.3, 0, F + 0.45], 0.25, () => { const cr = G.box(0.7, 0.28, 0.5, 0.03); cr.translate(0, 0.14, 0); B.add(cr, T.wood); for (const s of [-1, 1]) { const sl = G.box(0.72, 0.04, 0.02, 0); sl.translate(0, 0.2, s * 0.25); B.add(sl, T.timber); } B.at([0, 0.24, 0], 0, () => oreCluster(B, { n: 11, r: 0.26, seed: 3 })); pillow(B, [0.28, 0.3, -0.18], 0.1, 0.5, 2); });
  B.at([w / 2 + 0.4, 0, 0.25], PI / 2, () => {
    for (const s of [-1, 1]) { const l = G.box(0.06, 0.62, 0.06, 0); l.translate(s * 0.18, 0.31, 0); B.add(l, T.timber); }
    B.at([0, 0.62, 0], 0, () => { const g = G.cyl(0.3, 0.3, 0.12, 16); g.rotateX(PI / 2); g.rotateY(PI / 2); B.add(g, (p, n, o) => o.set(Math.abs(n.x) > 0.7 ? '#a8a4a0' : '#8a8680')); });
    const tr = G.box(0.5, 0.12, 0.3, 0.02); tr.translate(0, 0.32, 0); B.add(tr, T.wood);
  });
  B.at([w / 2 + 0.02, 1.62, F - 0.05], PI / 2, () => hangSign(B, 'hammer', { w: 0.36, h: 0.32, color: '#e8dcc4', frame: T.timber }));
  bank(B, -w / 2, w / 2, zc - d / 2 - 0.15, { seed: 33, r: 0.34 });
  for (const s of [-1, 1]) B.at([s * (w / 2 + 0.15), 0, zc], PI / 2, () => bank(B, -d / 2, d / 2 - 0.4, 0, { seed: 35 + s, r: 0.3 }));
  void R;
  return {
    fp: [-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.75, F + 0.78], door: [0.15, F + 1.3], keeper: [0.25, F + 0.02, 0], open: true,
    lamps: [[-1.25, y0 + h - 0.02, F + 0.12], [1.25, y0 + h - 0.02, F + 0.12]],
    steam: [{ p: [hx, 4.15, zc + hz - 0.1], k: 'smoke', saved: true }, { p: [1.05, 0.55, zc + 0.1], k: 'pot', saved: true }],
    siege(B) {
      // the forge cold and wrecked: the ore crate tipped and empty, tools strewn, a banner on the roof post
      B.at([0, 0, F + 0.6], 0, () => debris(B, 1.1, { seed: 51, n: 7 }));
      B.at([-1.5, 0.2, F + 1.0], 0.6, () => { const cr = G.box(0.7, 0.28, 0.5, 0.03); B.add(cr, T.wood); }, 1, 0, 1.2);
      for (let i = 0; i < 3; i++) B.at([-0.8 + i * 0.6, 0.03, F + 1.3 + (i % 2) * 0.3], i * 1.3, () => { const t = G.box(0.05, 0.03, 0.4, 0); B.add(t, C.iron); const hd = G.box(0.1, 0.05, 0.06, 0); hd.translate(0, 0, 0.2); B.add(hd, '#5a5664'); });
      B.at([w / 2 + 0.3, 0, F + 0.3], 0, () => warBanner(B, { h: 2.4, w: 0.5, seed: 52 }));
      B.at([-0.8, y0 + 1.3, zc - d / 2 + 0.33], 0, () => soot(B, 0.9, 0.9, T.stone, 5));
    },
    saved(B) {
      // the hearth glowing, sparks of heat on the coals; a rack of finished blades; fresh ore heaped high
      B.at([hx, y0, zc + hz], 0, () => { const mg = new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-0.2, 0); s.lineTo(-0.2, 0.15); s.absarc(0, 0.15, 0.2, PI, 0, true); s.lineTo(0.2, 0); s.closePath(); return s; })(), 8); mg.translate(0, 0.38, 0.475); B.glow(flatOf(mg), '#ff8a3a', { hot: true, flicker: 1, tint: 1 }); const c = G.ico(0.3, 1); c.scale(1.1, 0.12, 0.8); c.translate(0, 0.9, -0.05); B.glow(c, '#ff6a2a', { hot: true, flicker: 1, tint: 1 }); });
      B.at([-0.15, 0, F + 0.2], 0, () => { for (const s of [-1, 1]) { const p = G.box(0.05, 0.9, 0.05, 0); p.translate(s * 0.35, 0.45, 0); B.add(p, T.timber); } const bar = G.box(0.8, 0.04, 0.05, 0); bar.translate(0, 0.86, 0); B.add(bar, T.timber); for (let i = 0; i < 4; i++) { const bl = G.box(0.03, 0.72, 0.012, 0); bl.translate(-0.24 + i * 0.16, 0.48, 0.03); B.add(bl, '#d8dce8'); const hd = G.box(0.04, 0.16, 0.03, 0); hd.translate(-0.24 + i * 0.16, 0.86, 0.03); B.add(hd, '#2a2630'); } });
      B.at([-1.3, 0.24, F + 0.45], 0.25, () => oreCluster(B, { n: 9, r: 0.2, seed: 9 }));
      B.at([1.7, 0, F + 0.95], 0, () => nobori(B, { h: 2.3, w: 0.4, color: '#4a4a5a', sym: 'star', symColor: '#cfefff' }));
    },
  };
}

// ------------------------------------------------------------------ the Waypoint Shrine (the shared design, Yukimi's tint)
export function waypoint(B) {
  const info = waystone(B, { roof: '#6a7ac8', cap: 'snow', seed: 79 });
  // local dressing: snow drifted round the plinth
  bank(B, -1.0, 1.0, -1.05, { seed: 81, r: 0.3 });
  for (const s of [-1, 1]) B.at([s * 1.08, 0, -0.1], PI / 2, () => bank(B, -0.8, 0.6, 0, { seed: 83 + s, r: 0.26 }));
  return info;
}

// ------------------------------------------------------------------ the village gate and the road's lamp posts
export function gate(B, { w = 3.4, h = 2.45, sign = true } = {}) {
  for (const s of [-1, 1]) {
    const base = G.cyl(0.22, 0.26, 0.24, 8); base.translate(s * w / 2, 0.12, 0); B.add(base, T.stone);
    const p = G.beam(0.2, h, 0.2, 0.03); p.translate(s * w / 2, h / 2, 0); B.add(p, T.timber);
    for (const k of [-1, 1]) { const st = G.beam(0.08, 0.95, 0.08, 0.012); st.rotateX(k * 0.42); st.translate(s * w / 2, 0.45, k * 0.2); B.add(st, T.timber); }
    pillow(B, [s * w / 2, 0.03, 0.15], 0.42, 0.38, 3 + s, 1, 1.3);
  }
  const nuki = G.beam(w + 0.5, 0.13, 0.12, 0.02); nuki.translate(0, h - 0.62, 0); B.add(nuki, T.timber);
  const beam = G.beam(w + 0.7, 0.2, 0.2, 0.03); beam.translate(0, h - 0.1, 0); B.add(beam, T.timber);
  // a little tiled gable cap on the beam, under snow
  snowRoof(B, { type: 'gable', w: w + 0.2, d: 0.36, y0: h + 0.04, over: 0.2, gOver: 0.12, H: 0.34, curve: 0.2, ribW: 0.18, oni: true, snow: { th: 0.12, lip: 0.07, ridge: 0.06, ice: { every: 0.12, len: [0.06, 0.26], back: 1 } }, seed: 3 });
  if (sign) B.at([0, h - 0.34, 0.12], 0, () => {
    board(B, { w: 1.0, h: 0.34, wood: '#2e2420', frame: '#1e1614' });
    B.at([-0.3, 0, 0.028], 0, () => glyph(B, 'snow', 0.26, '#eaf2ff', 0));
    B.at([0.05, 0, 0.028], 0, () => glyph(B, 'yu', 0.26, '#f6f0e4', 0));
    B.at([0.34, 0, 0.03], 0, () => crest(B, [[camelliaShapes()[0], T.camellia], [camelliaShapes()[1], '#f4c84a']], 0.22));
  });
}
/** a Ginzan-style lamp post: a dark post, a snowy little roof over the lamp hook on its arm → the hook (local) */
export function lanternPost(B) {
  const p = G.beam(0.1, 2.0, 0.1, 0.02); p.translate(0, 1.0, 0); B.add(p, T.timber);
  const base = G.cyl(0.14, 0.17, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, T.stone);
  const arm = G.beam(0.5, 0.07, 0.07, 0.012); arm.translate(0.22, 1.9, 0); B.add(arm, T.timber);
  const br = G.beam(0.05, 0.4, 0.05, 0.01); br.rotateZ(-0.8); br.translate(0.12, 1.75, 0); B.add(br, T.timber);
  const rf = G.box(0.4, 0.05, 0.36, 0.015); rf.translate(0.38, 1.99, 0); B.add(rf, T.tile);
  snowSlab(B, 0.38, 2.01, 0, 0.42, 0.38, 0.06, 7);
  pillow(B, [0, 2.02, 0], 0.08, 0.6, 2);
  pillow(B, [0, 0.03, 0], 0.26, 0.38, 5);
  return [0.42, 1.84, 0];
}

// ------------------------------------------------------------------ the square, the road, the gates, the fences, the trees and snow
/** the square's furniture slots [a (deg), d past the square's rim (m)] (the layout's own: data.js has no fields for them) */
const SPOTS = { footbath: [180, 1.3], board: [-21, 1.25], benches: [-118, 118], lanterns: [-40, 38, -142, 142] };
const LANTERNS = new WeakMap(), WORLD = new WeakMap(); // (WORLD: VL → { heightAt, pathDist } for the saved dressing) // VL → the decor's yukimi lanterns [{ x, y, z, rot, s }] (savedDecor lights them)
/** Yukimi's static dressing (populate time): the steaming foot bath, benches, yukimi lanterns, the notice board, the
 *  road's lamp posts, the gates, the snowy fences round the camera side, the village's birches, firs, camellias and
 *  drifts. → { lamps, spots, update (steam), gates } */
export function decor(VL, ctx, PL, h0) {
  const S = VL.site, sq = VL.def.square.r, at = (a, d) => slotAt(S, a, d), out = { lamps: [], spots: [] };
  const face = p => Math.atan2(S.x - p.x, S.z - p.z);
  const solid = (x, z, r) => { ctx.addCollider(x, z, r); ctx.blockCells(x, z, r * 0.8); };
  const inBuilding = (x, z, pad = 0.4) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; return lx > f[0] - pad && lx < f[2] + pad && lz > f[1] - pad && lz < f[3] + pad; });
  const nearDoor = (x, z, r) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = b.info.door[0], dz = b.info.door[1]; return Math.hypot(b.x + dx * c + dz * s - x, b.z - dx * s + dz * c - z) < r; });
  const prop = (fn, x, z, rot = 0, seed = 1) => ctx.prop(fn, { x, z, y: ctx.heightAt(x, z), rot, seed, warp: 0.02 });
  const lanterns = []; LANTERNS.set(VL, lanterns); WORLD.set(VL, { heightAt: (x, z) => ctx.heightAt(x, z), pathDist: (x, z) => ctx.pathDist(x, z) });
  const steam = [];
  // the buildings' own emitters (bathhouse vents and chimney, the forge, the shop's steamers)
  for (const b of VL.buildings) for (const e of b.info.steam || []) { const c = Math.cos(b.rot), s = Math.sin(b.rot); steam.push({ x: b.x + e.p[0] * c + e.p[2] * s, y: h0 + e.p[1], z: b.z - e.p[0] * s + e.p[2] * c, k: e.k, saved: !!e.saved, acc: Math.random() }); }
  // the foot bath (ashiyu) at the square's edge: a steaming stone trough under a little snowy roof, benches both sides
  {
    const p = at(SPOTS.footbath[0], sq + SPOTS.footbath[1]), rot = face(p);
    prop(B => footbath(B), p.x, p.z, rot, 61);
    const c = Math.cos(rot), s = Math.sin(rot), loc = (x, z) => ({ x: p.x + x * c + z * s, z: p.z - x * s + z * c });
    for (const [x, z] of [[-0.9, 0], [0, 0], [0.9, 0]]) { const q = loc(x, z); solid(q.x, q.z, 0.38); }
    for (const [x, z, f] of [[-0.55, 0.62, PI], [0.55, 0.62, PI], [-0.55, -0.62, 0], [0.55, -0.62, 0]]) { const q = loc(x, z); out.spots.push({ x: q.x, z: q.z, face: rot + f, seat: true, seatY: h0 + 0.4, w: 1.4, dur: [16, 30], emote: ['heart', 'note', 'zzz'] }); }
    for (const x of [-0.6, 0.6]) { const q = loc(x, 0); steam.push({ x: q.x, y: h0 + 0.42, z: q.z, k: 'bath', acc: Math.random() }); }
  }
  // benches facing the square, yukimi lanterns at its corners (their panes lit when saved), the notice board
  for (const a of SPOTS.benches) { const p = at(a, sq + 1.0), r = face(p); prop(B => snowBench(B), p.x, p.z, r, 70 + a); solid(p.x, p.z, 0.5); out.spots.push({ x: p.x, z: p.z, face: r, seat: true, seatY: h0 + 0.46, w: 1.2, dur: [16, 30], emote: ['note', 'heart', 'zzz'] }); }
  for (const a of SPOTS.lanterns) {
    const p = at(a, sq + (Math.abs(a) > 90 ? 1.1 : 0.7)), rot = face(p), s = 0.72, y = ctx.heightAt(p.x, p.z);
    prop(B => yukimi(B, s, 40 + a), p.x, p.z, rot, 80 + a); solid(p.x, p.z, 0.42);
    lanterns.push({ x: p.x, y, z: p.z, rot, s });
    out.lamps.push({ x: p.x, y: y + 0.98 * s + 0.12, z: p.z, light: '#ffc27a', color: '#ffd890' });
  }
  {
    const p = at(SPOTS.board[0], sq + SPOTS.board[1]), r = face(p);
    prop(B => noticeBoard(B), p.x, p.z, r, 91); solid(p.x, p.z, 0.45);
    out.spots.push({ x: p.x + Math.sin(r) * 0.9, z: p.z + Math.cos(r) * 0.9, face: r + PI, pose: 'read', w: 0.9, dur: [6, 11], fidget: ['scratchHead', 'nod'], emote: ['note', 'sparkle'] });
  }
  // the road: lamp posts on its far side, the gates where it crosses the clearing's rim
  const tr = ctx.plan.trail, R = S.r - 2.4, cross = [];
  for (let i = 1; i < tr.length; i++) {
    const d0 = Math.hypot(tr[i - 1][0] - S.x, tr[i - 1][1] - S.z), d1 = Math.hypot(tr[i][0] - S.x, tr[i][1] - S.z);
    if ((d0 - R) * (d1 - R) < 0) { const k = (R - d0) / (d1 - d0), x = tr[i - 1][0] + (tr[i][0] - tr[i - 1][0]) * k, z = tr[i - 1][1] + (tr[i][1] - tr[i - 1][1]) * k; cross.push({ x, z, tx: tr[i][0] - tr[i - 1][0], tz: tr[i][1] - tr[i - 1][1] }); }
  }
  for (const c of cross) {
    const L = Math.hypot(c.tx, c.tz) || 1, tx = c.tx / L, tz = c.tz / L, rot = Math.atan2(tx, tz);
    ctx.prop(B => gate(B, { w: 3.6 }), { x: c.x, z: c.z, y: ctx.heightAt(c.x, c.z), rot, seed: 51, warp: 0.02 });
    for (const s of [-1, 1]) solid(c.x + tz * s * 1.8, c.z - tx * s * 1.8, 0.26);
    for (const s of [-1, 1]) { const x = c.x + tz * s * 1.48, z = c.z - tx * s * 1.48; out.lamps.push({ x, y: ctx.heightAt(x, z) + 2.45 - 0.69, z, color: '#fff0d8', light: '#ffc890' }); }
  }
  out.gates = cross;
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i], seg = Math.hypot(x1 - x0, z1 - z0); acc += seg;
    if (acc < 4.4) continue;
    const dS = Math.hypot(x1 - S.x, z1 - S.z); if (dS > R - 0.6 || dS < sq + 1.2) continue;
    acc = 0;
    const tx = (x1 - x0) / (seg || 1), tz = (z1 - z0) / (seg || 1); let nx = -tz, nzz = tx; if (nx + nzz > 0) { nx = -nx; nzz = -nzz; }
    const x = x1 + nx * (ctx.plan.trailW + 0.9), z = z1 + nzz * (ctx.plan.trailW + 0.9);
    if (inBuilding(x, z, 0.5) || nearDoor(x, z, 2.2)) continue;
    const rot = Math.atan2(-nx, -nzz) + PI / 2;
    let hook = null; ctx.prop(B => { hook = lanternPost(B); }, { x, z, y: ctx.heightAt(x, z), rot, seed: 61 + i, warp: 0.02 });
    solid(x, z, 0.16);
    const c = Math.cos(rot), s = Math.sin(rot);
    out.lamps.push({ x: x + hook[0] * c + hook[2] * s, y: ctx.heightAt(x, z) + hook[1], z: z - hook[0] * s + hook[2] * c, color: '#ffd890' });
  }
  // snowy fences round the camera side of the rim (low), between the two gates, skipping the camps
  const ga = cross.map(c => slotOf(S, c.x, c.z).a).sort((a, b) => a - b);
  if (ga.length === 2) {
    const fr = S.r - 1.0, a0 = ga[1] + 9, a1 = ga[0] + 360 - 9, n = Math.max(2, Math.round((a1 - a0) / 360 * TAU * fr / 2.6));
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n, p = at(aa, fr), q = at(ab, fr), L = Math.hypot(q.x - p.x, q.z - p.z);
      if (VL.camps.some(c => Math.hypot((p.x + q.x) / 2 - c.x, (p.z + q.z) / 2 - c.z) < c.r + 1)) continue;
      if (nearDoor((p.x + q.x) / 2, (p.z + q.z) / 2, 2.6) || nearDoor(p.x, p.z, 1.8) || nearDoor(q.x, q.z, 1.8)) continue;
      if (inBuilding((p.x + q.x) / 2, (p.z + q.z) / 2, 0.6)) continue;
      const rot = Math.atan2(q.x - p.x, q.z - p.z) - PI / 2;
      prop(B => fenceRun(B, L * 0.98, 5 + i), p.x, p.z, rot, 101 + i);
      for (let k = 0; k <= 2; k++) ctx.addCollider(p.x + (q.x - p.x) * k / 2, p.z + (q.z - p.z) * k / 2, 0.16);
    }
  }
  // the village's own trees: birches and snow firs behind the buildings (the wild's firs stand outside the clearing)
  let seed = 7411; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tree = (parts, x, z, r, s) => { PL.multi(parts, x, ctx.heightAt(x, z) - 0.05, z, { rot: rr() * TAU, s }); ctx.addCollider(x, z, r); ctx.blockCells(x, z, r * 0.9); ctx.paintFx('canopy', x, z, r * 3, 0.6); };
  const clear = (x, z, pad) => !inBuilding(x, z, pad) && ctx.pathDist(x, z) > ctx.plan.trailW + 1.6 && ctx.waterAt(x, z) < 0.02 && !VL.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 0.8);
  for (let i = 0; i < 16; i++) {
    const a = -100 + i / 15 * 200 + (rr() - 0.5) * 8, d = S.r - 0.6 + rr() * 1.4, p = at(a, d);
    if (!clear(p.x, p.z, 0.8)) continue;
    if (Math.abs(a) < 75 && i % 3) tree(FL.snowFir(Math.floor(rr() * 4), { H: 4.8 + rr() * 1.2 }), p.x, p.z, 0.45, 0.8 + rr() * 0.25);
    else tree(FL.birch(Math.floor(rr() * 3), { H: 3.8 + rr() * 0.8 }), p.x, p.z, 0.25, 0.85 + rr() * 0.2);
  }
  // camellias, drifts, snowy rocks and frosted grass between the buildings and round the rim
  for (let i = 0; i < 110; i++) {
    const a = rr() * 360 - 180, d = 5.6 + rr() * (S.r - 5.0), p = at(a, d);
    if (inBuilding(p.x, p.z, 0.2) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 0.4 || ctx.waterAt(p.x, p.z) > 0.02 || VL.camps.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.3)) continue;
    const near = VL.buildings.some(b => Math.hypot(p.x - b.x, p.z - b.z) < 4.4), cam = Math.abs(a) > 100, k = rr(), rot = rr() * TAU, y = ctx.heightAt(p.x, p.z);
    if (!near && !cam && rr() < 0.5) continue;
    if (k < 0.18 && !cam) { ctx.prop(B => flora(B, FL.snowBush(Math.floor(rr() * 3), rr() < 0.75 ? 'camellia' : 'none'), 0, -0.05, 0, 0, 0.8 + rr() * 0.35), { x: p.x, z: p.z, y, rot, seed: i, warp: 0 }); solid(p.x, p.z, 0.45); }
    else if (k < 0.4) ctx.prop(B => flora(B, FL.drift(Math.floor(rr() * 3), { R: 0.5 + rr() * 0.45, h: 0.14 + rr() * 0.12 }), 0, -0.06, 0, 0, 1), { x: p.x, z: p.z, y, rot, seed: i, warp: 0 });
    else if (k < 0.62) { ctx.prop(B => flora(B, FL.snowRock(Math.floor(rr() * 3), { R: 0.4 + rr() * 0.3 }), 0, -0.1, 0, 0, 1), { x: p.x, z: p.z, y, rot, seed: i, warp: 0 }); solid(p.x, p.z, 0.4); }
    else ctx.prop(B => flora(B, FL.frostGrass(Math.floor(rr() * 3)), 0, 0, 0, 0, 0.9 + rr() * 0.4), { x: p.x, z: p.z, y, rot, seed: i, warp: 0 });
  }
  // steam: the region's own GPU steam columns (the weather kit's steam(), as over the hot springs: one draw call per
  // group), made on the first frame once the world exists — vents and baths, chimney smoke, and the saved-only forge and
  // steamers (shown only once the village is saved); CPU puffs only if the weather kit is missing
  let fx = null;
  const makeFx = () => {
    const W = VL.world?.weather; fx = { cpu: !W?.steam, groups: [] };
    if (fx.cpu) return;
    const cols = (list, r) => list.map(e => ({ x: e.x, z: e.z, y: e.y, r }));
    const grp = (list, o, saved) => { if (!list.length) return; const h = W.steam(list, o); if (h) fx.groups.push({ h, saved }); };
    for (const saved of [false, true]) {
      const mine = steam.filter(e => !!e.saved === saved);
      grp(cols(mine.filter(e => e.k === 'vent'), 0.35), { puffs: 10, size: 1.35, alpha: 0.42, rise: 3.0, rate: 0.17, color: '#eceef6' }, saved);
      grp(cols(mine.filter(e => e.k === 'bath' || e.k === 'pot'), 0.3), { puffs: 9, size: 1.1, alpha: 0.42, rise: 2.2, rate: 0.2, color: '#eceef6' }, saved);
      grp(cols(mine.filter(e => e.k === 'smoke'), 0.15), { puffs: 8, size: 1.1, alpha: 0.45, rise: 3.6, rate: 0.15, color: '#aaa6b8' }, saved);
    }
  };
  out.update = (dt) => {
    if (!fx) makeFx();
    if (!fx.cpu) { for (const g of fx.groups) if (g.saved) g.h.setVisible(!!VL.saved); return; }
    const vfx = globalThis.G?.vfx, P = globalThis.G?.player; if (!vfx?.smoke || !P) return;
    if (Math.hypot(P.pos.x - S.x, P.pos.z - S.z) > S.r + 26) return;
    for (const e of steam) {
      if (e.saved && !VL.saved) continue;
      const rate = e.k === 'smoke' ? 3.2 : e.k === 'vent' ? 2.6 : e.k === 'bath' ? 2.2 : 1.4;
      e.acc += dt * rate; if (e.acc < 1) continue; e.acc -= 1;
      const sm = e.k === 'smoke', big = e.k === 'vent' || sm, r = Math.random;
      vfx.smoke.spawn({ x: e.x + (r() - 0.5) * 0.2, y: e.y, z: e.z + (r() - 0.5) * 0.2, vx: 0.25 + (r() - 0.5) * 0.15, vy: (big ? 0.55 : 0.32) + r() * 0.3, vz: 0.08 + (r() - 0.5) * 0.15,
        life: (big ? 2.8 : 2.0) + r() * 1.2, size: big ? 0.5 : 0.38, size1: big ? 2.1 : 1.45, color: sm ? '#a8a4b4' : '#d0d8ec', alpha: sm ? 0.5 : e.k === 'bath' ? 0.42 : 0.5, alpha1: 0, spin: (r() - 0.5), drag: 0.35, fadeIn: 0.35 });
    }
  };
  return out;
}
// ------------------------------------------------------------------ decor pieces (kit, merged into the static chunks)
/** the public foot bath: a long stone trough of steaming water under a little hip roof on four posts, benches both sides */
function footbath(B, { roofed = false } = {}) {
  const L = 2.3, W = 0.7;
  const rim = G.box(L + 0.3, 0.34, W + 0.3, 0.06); rim.translate(0, 0.17, 0); B.add(rim, (p, n, o) => o.set(T.stone).lerp(new THREE.Color(T.stoneLight), clamp(nz(p.x * 4, p.z * 4) * 0.5 + 0.5) * 0.5));
  const water = G.box(L, 0.04, W, 0); water.translate(0, 0.33, 0); B.add(water, '#5ac8c8', 'water');
  for (let i = 0; i < 8; i++) { const st = puff(V(0, 0, 0), 0.13, { detail: 1, noise: 0.3, squash: 0.6, seed: i + 3 }); st.translate(-L / 2 + 0.1 + i * (L - 0.2) / 7, 0.36, (i % 2 ? 1 : -1) * (W / 2 + 0.08)); B.add(st, STONES[i % STONES.length]); }
  for (const s of [-1, 1]) {
    const top = G.box(L + 0.2, 0.06, 0.34, 0.02); top.translate(0, 0.42, s * (W / 2 + 0.38)); B.add(top, T.deck);
    for (const x of [-L / 2, 0, L / 2]) { const l = G.box(0.08, 0.4, 0.26, 0.01); l.translate(x, 0.2, s * (W / 2 + 0.38)); B.add(l, T.timberMid); }
  }
  if (roofed) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.beam(0.1, 2.0, 0.1, 0.015); p.translate(sx * (L / 2 + 0.2), 1.0, sz * (W / 2 + 0.6)); B.add(p, T.timber); }
  if (roofed) snowRoof(B, { type: 'hip', w: L + 0.4, d: W + 1.2, y0: 2.0, over: 0.32, H: 0.62, curve: 0.25, ribW: 0.18, oni: false, snow: { th: 0.13, lip: 0.07, ice: { every: 0.13, len: [0.06, 0.24], back: 1 } }, seed: 5 });
  // a little ゆ sign on a post at the trough's end
  B.at([L / 2 + 0.38, 0, 0], 0, () => { const p = G.beam(0.07, 0.95, 0.07, 0.012); p.translate(0, 0.475, 0); B.add(p, T.timber); B.at([0, 0.9, 0.02], 0, () => board(B, { w: 0.34, h: 0.26, wood: '#2e2420', frame: '#1e1614', mark: 'yu', markColor: '#f6f0e4', s: 0.22 })); pillow(B, [0, 1.06, 0.02], 0.1, 0.5, 4, 1.4, 0.8); });
  for (const s of [-1, 1]) bank(B, -L / 2 - 0.2, L / 2 + 0.2, s * (W / 2 + 0.75), { seed: 41 + s, r: 0.22, sq: 0.36 });
}
/** a snowy bench (snow cushions on the ends: a villager sits in the cleared middle) */
function snowBench(B) {
  const top = G.box(1.3, 0.07, 0.4, 0.02); top.translate(0, 0.42, 0); B.add(top, T.deck);
  for (const s of [-1, 1]) { const l = G.box(0.08, 0.42, 0.36, 0.01); l.translate(s * 0.52, 0.21, 0); B.add(l, T.timberMid); }
  for (const s of [-1, 1]) pillow(B, [s * 0.5, 0.47, 0], 0.17, 0.32, 3 + s, 1.1, 1);
  pillow(B, [0, 0.03, -0.3], 0.3, 0.32, 9, 2, 0.8);
}
/** the notice board under its little snowy roof */
function noticeBoard(B) {
  for (const s of [-1, 1]) { const p = G.beam(0.09, 1.7, 0.09, 0.015); p.translate(s * 0.5, 0.85, 0); B.add(p, T.timber); }
  const bd = G.box(1.06, 0.7, 0.05, 0.02); bd.translate(0, 1.15, 0.03); B.add(bd, '#a8845e');
  const rr = mulberry32(19);
  for (let i = 0; i < 5; i++) { const n = G.box(0.2 + rr() * 0.08, 0.24 + rr() * 0.08, 0.01, 0); n.rotateZ((rr() - 0.5) * 0.2); n.translate(-0.36 + i * 0.18, 1.12 + (rr() - 0.5) * 0.2, 0.06); B.add(n, ['#fff6e8', '#ffe8d8', '#e8f0ff'][i % 3]); }
  const rf = G.box(1.3, 0.06, 0.42, 0.02); rf.rotateX(0.18); rf.translate(0, 1.6, 0.04); B.add(rf, T.tile);
  snowSlab(B, 0, 1.62, 0.04, 1.32, 0.42, 0.07, 3);
}
/** a snowy fence run along local z from 0 to L (low wooden rails under a snow line) */
function fenceRun(B, L, seed = 0) {
  const n = Math.max(1, Math.round(L / 1.1));
  B.push([0, 0, 0], PI / 2);
  for (let i = 0; i <= n; i++) { const p = G.beam(0.09, 0.82, 0.09, 0.015); p.translate(-L / 2 + i * L / n, 0.41, 0); B.add(p, T.timberMid); pillow(B, [-L / 2 + i * L / n, 0.86, 0], 0.07, 0.6, seed + i); }
  for (const y of [0.32, 0.66]) { const r = G.beam(L, 0.07, 0.05, 0.012); r.translate(0, y, 0.04); B.add(r, T.wood); }
  snowSlab(B, 0, 0.7, 0.04, L, 0.07, 0.04, seed);
  bank(B, -L / 2, L / 2, 0.1, { seed: seed + 3, r: 0.26, sq: 0.34 });
  B.pop();
}

// ------------------------------------------------------------------ the saved village's own dressing
/** what the villagers put back where the camps stood (data.js camps[].saved: woodpile / snowman / buckets), the
 *  lanterns' panes lit, camellias in pots round the square */
export function savedDecor(VL, B, h0) {
  const S = VL.site, sq = VL.def.square.r;
  for (const l of LANTERNS.get(VL) || []) B.at([l.x, l.y, l.z], l.rot, () => yukimiPanes(B, l.s));
  for (const c of VL.camps) {
    const f = screenAt(S, c.at[0], c.at[1]), yaw = screenYaw(0);
    B.at([f.x, h0, f.z], yaw, () => {
      if (c.saved === 'woodpile') { // the woodshed again: a roofed firewood rack, a chopping block, a sled of logs
        B.at([-0.4, 0, -0.5], 0, () => { firewood(B, { w: 1.6, h: 0.7, d: 0.34 }); snowSlab(B, 0, 0.82, 0.02, 1.76, 0.5, 0.07, 3); });
        B.at([0.9, 0, 0.35], 0, () => choppingBlock(B));
        B.at([1.25, 0, -0.75], 0.3, () => { logPile(B, { n: 3, L: 1.1, r: 0.13 }); pillow(B, [0, 0.34, 0], 0.3, 0.3, 9, 1.6, 0.8); });
        B.at([-1.6, 0, 0.15], PI / 2, () => { firewood(B, { w: 0.9, h: 0.5, d: 0.3, roofed: false }); snowSlab(B, 0, 0.5, 0, 0.9, 0.32, 0.05, 6); });
        B.at([-0.6, 0, 0.7], 0.3, () => { for (const s of [-1, 1]) { const r = G.box(1.2, 0.05, 0.06, 0.015); r.translate(0, 0.06, s * 0.22); B.add(r, T.wood); const tip = G.torus(0.08, 0.025, 4, 8, PI); tip.rotateY(PI / 2); tip.translate(0.62, 0.14, s * 0.22); B.add(tip, T.wood); } const bed = G.box(0.9, 0.04, 0.5, 0.01); bed.translate(-0.05, 0.2, 0); B.add(bed, T.deck); for (let i = 0; i < 3; i++) { const lg = G.cyl(0.08, 0.08, 0.8, 7); lg.rotateZ(PI / 2); lg.translate(-0.05, 0.3 + (i === 2 ? 0.13 : 0), (i === 2 ? 0 : i - 0.5) * 0.17); B.add(lg, (p, n, o) => o.set(Math.abs(n.x) > 0.8 ? '#e8c890' : '#7a5a42')); } pillow(B, [-0.05, 0.48, 0], 0.18, 0.4, 7, 2.2, 1); });
        bank(B, -1.4, 1.4, -0.95, { seed: 5, r: 0.3 });
      } else if (c.saved === 'snowman') { // the snowman family, snow bunnies and a little kamakura with a candle
        B.at([0.2, 0, 0], 0, () => snowman(B, { s: 1, seed: 1 }));
        B.at([-0.6, 0, 0.35], 0.3, () => snowman(B, { s: 0.6, scarf: '#5a9ad8', hat: '#e8503a', seed: 2 }));
        B.at([1.5, 0, -0.6], -0.3, () => kamakura(B, { r: 0.8, seed: 3 }));
        for (const [x, z, r] of [[-1.1, 0.9, 0.4], [-0.9, 1.1, -0.3], [0.9, 0.9, 0.1]]) B.at([x, 0.02, z], r, () => snowBunny(B, 1, Math.round(x * 10)));
      } else if (c.saved === 'buckets') { // the bath buckets back on their drying rack, a wash trough, the stools, towels
        B.at([-0.4, 0, -0.75], 0, () => bucketShelf(B));
        B.at([1.0, 0, -0.45], 0.4, () => bucketStack(B, 2));
        B.at([-1.55, 0, 0.1], 0.5, () => washTrough(B));
        for (let i = 0; i < 4; i++) B.at([-0.9 + i * 0.5, 0, 0.6 + (i % 2) * 0.12], i * 0.6, () => bathStool(B, i % 2 ? '#d8b888' : '#c8a070'));
        B.at([1.5, 0, 0.3], -0.6, () => towelRack(B, { colors: ['#ffffff', '#ffd0d8'] }));
        for (let i = 0; i < 3; i++) B.at([-1.5 + i * 0.3, 0, -0.9], 0, () => { bucket(B, { r: 0.12, h: 0.16 }); pillow(B, [0, 0.17, 0], 0.08, 0.6, i); });
      }
    });
  }
  // camellias in pots round the square (red blooms in the snow)
  for (const a of [-60, -125, 125, 162, -165]) { const p = slotAt(S, a, sq + 0.45); B.at([p.x, h0, p.z], a, () => camelliaPot(B, a)); }
  // the snow-lantern festival: little candle-lit snow lanterns flank every door and line the camera side's rim
  const W = WORLD.get(VL), hAt = (x, z) => (W ? W.heightAt(x, z) : h0);
  const inB = (x, z, pad) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; return lx > f[0] - pad && lx < f[2] + pad && lz > f[1] - pad && lz < f[3] + pad; });
  let k = 0;
  for (const b of VL.buildings) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), [dx, dz] = b.info.door;
    for (const side of [-1, 1]) { const lx = dx + side * (b.kind === 'waypoint' ? 1.1 : 0.85), lz = dz - 0.15, x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c; if (inB(x, z, 0.05)) continue; B.at([x, hAt(x, z) - 0.03, z], b.rot, () => snowLantern(B, k++)); }
  }
  for (let a = 112; a <= 248; a += 7.5) {
    const p = slotAt(S, a, S.r - 2.6 + 0.4 * Math.sin(a)); if (inB(p.x, p.z, 0.4) || VL.camps.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.2) || (W && W.pathDist(p.x, p.z) < 2.2)) continue;
    B.at([p.x, hAt(p.x, p.z) - 0.03, p.z], p.rot, () => snowLantern(B, k++));
  }
}
/** a snow candle lantern (yuki-dōrō of the snow festivals): a packed-snow dome with an arched window, a candle glowing inside */
function snowLantern(B, seed = 0) {
  const rr = mulberry32(seed * 31 + 7), s = 0.85 + rr() * 0.3;
  B.push([0, 0, 0], (rr() - 0.5) * 0.4, s);
  const g = puff(V(0, 0.1, 0), 0.17, { detail: 1, noise: 0.06, squash: 1.25, seed: seed + 3 }); B.add(g, snowCol);
  const sh = new THREE.Shape(); sh.moveTo(-0.06, 0); sh.lineTo(-0.06, 0.07); sh.absarc(0, 0.07, 0.06, PI, 0, true); sh.lineTo(0.06, 0); sh.closePath();
  const m = new THREE.ShapeGeometry(sh, 6); m.translate(0, 0.05, 0.205); B.glow(flatOf(m), '#ffb860', { hot: true, flicker: 0.9, tint: 1 });
  const cap = puff(V(0, 0.33, 0), 0.07, { detail: 0, noise: 0.2, squash: 0.8, seed: seed + 5 }); B.add(cap, snowCol);
  B.pop();
}
/** the bath buckets' drying rack: two plank shelves on posts, yellow buckets turned upside down along them, under a snow line */
function bucketShelf(B) {
  for (const x of [-0.75, 0.75]) for (const z of [-0.14, 0.14]) { const p = G.beam(0.06, 1.0, 0.06, 0.01); p.translate(x, 0.5, z); B.add(p, T.wood); }
  for (const y of [0.32, 0.72]) { const sh = G.box(1.6, 0.04, 0.38, 0.01); sh.translate(0, y, 0); B.add(sh, T.deck); for (let i = 0; i < 4; i++) B.at([-0.54 + i * 0.36, y + 0.02 + 0.15, 0], 0, () => yellowBucket(B, 0.13), 1, PI, 0); }
  snowSlab(B, 0, 1.0, 0, 1.62, 0.4, 0.06, 4);
}
/** a stone wash trough fed by a bamboo spout, a wooden dipper on its rim */
function washTrough(B) {
  const t = G.box(0.9, 0.36, 0.46, 0.05); t.translate(0, 0.18, 0); B.add(t, (p, n, o) => o.set(T.stone).lerp(new THREE.Color(T.stoneLight), clamp(nz(p.x * 5, p.z * 5) * 0.5 + 0.5) * 0.5));
  const w = G.box(0.78, 0.03, 0.34, 0); w.translate(0, 0.34, 0); B.add(w, '#5ac8c8', 'water');
  B.add(tube([{ p: V(0.55, 0, -0.3), r: 0.035 }, { p: V(0.55, 0.62, -0.3), r: 0.032 }], 6, false), '#a8b060');
  B.add(tube([{ p: V(0.55, 0.58, -0.3), r: 0.026 }, { p: V(0.2, 0.5, -0.05), r: 0.024 }], 6, false), '#b8c070');
  const dp = G.cyl(0.05, 0.045, 0.06, 8); dp.translate(-0.3, 0.4, 0.2); B.add(dp, '#c8a070'); const hd = G.cyl(0.008, 0.008, 0.28, 4); hd.rotateZ(PI / 2 - 0.3); hd.translate(-0.15, 0.44, 0.2); B.add(hd, '#c8a070');
  for (const s of [-1, 1]) pillow(B, [s * 0.38, 0.37, 0], 0.07, 0.5, 2 + s, 1, 1.6);
}
function camelliaPot(B, seed = 0) {
  const pot = G.cyl(0.18, 0.14, 0.24, 10); pot.translate(0, 0.12, 0); B.add(pot, (p, n, o) => o.set('#5a6a8a').multiplyScalar(0.84 + 0.2 * clamp(p.y / 0.24)));
  const rim = G.torus(0.18, 0.025, 4, 12); rim.rotateX(PI / 2); rim.translate(0, 0.24, 0); B.add(rim, '#6a7a9a');
  B.at([0, 0.18, 0], seed, () => flora(B, FL.snowBush(Math.abs(seed) % 3, 'camellia'), 0, 0, 0, 0, 0.45));
}
