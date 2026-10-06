// Takemori Village (竹守村), the bamboo keepers' village: thatched minka, dark timber, paper screens, bamboo everything
// (docs/ZONES.md §2). Each building builder draws its static model into a kit Builder (local frame: front = +z, the
// footprint round the origin, ground at y = 0) and returns what the village runtime needs:
//   { fp: [x0, z0, x1, z1] (the solid footprint, local), door: [x, z] (the doorstep), keeper: [x, z, yaw] (where its
//     villager works), seat?: [x, z, yaw], lamps: [[x, y, z]...] (lantern hooks), siege(B) / saved(B) (the overlays,
//     same frame), sign?: [x, y, z] }
// The siege overlay boards the openings, smears soot and hangs torn lanterns; the saved one hangs noren and lit
// lanterns, airs futons, sets out goods. village.js places, turns and lists them.
import * as THREE from 'three';
import { G, V, C, PI, shade, mixc } from '../../world/buildings/kit.js';
import { MODELS } from '../../world/buildings/models.js';
import { M as KM } from '../assets/bambooKit.js';
import * as F from '../assets/bambooFlora.js';
import * as Pr from '../assets/bambooProps.js';
import { Events } from '../../core/events.js';
import { slotAt, slotOf, screenAt, screenYaw } from './data.js';
import { roof } from '../../world/buildings/roofs.js';
import { foundation, walls, onFace, shoji, roundWindow, latticeWindow, door, engawa, posts, steps, fence as kitFence, STONES } from '../../world/buildings/parts.js';
import { chochin, pot, barrel, crate, bush, flowerPatch, signboard, torii, toro, woodStack, rock, produce } from '../../world/buildings/props.js';
import { nobori, awning, teaBench, sack, firewood, shimenawa, parasol, laundry, wheel, scarecrow, veggieBed, wateringCan, choppingBlock } from '../../world/buildings/props2.js';
import { charm, sudare, futon, broom, toolRack, stoopStone } from '../../world/buildings/trim.js';
import { tube, puff } from '../../gfx/geom.js';
import { mulberry32, clamp, TAU, Noise } from '../../core/util.js';
import { boards, soot, tornLantern, litLantern, noren, symbolGeo, flowerPot, debris, warBanner, waystone } from './art.js';

/** minimap roof colours per building kind */
export const MAP = { elder: '#c8ac78', inn: '#b8a074', shop: '#c8ac78', dojo: '#6a6a7a', craft: '#c8ac78', waypoint: '#d86a4a' };
// the palette: sun-bleached thatch, dark-stained cedar, warm plaster, bamboo greens
export const T = {
  thatch: '#b39a6c', thatchEdge: '#d8c294', thatchUnder: '#6e5038', ridge: '#55402f', ridgeDark: '#3e3026',
  plaster: '#f2e8d4', frame: '#5b4232', koshi: '#86664a', deck: '#c99f6e', stone: '#aa9e92',
  tile: '#565a6a', tileDojo: '#4c4c5a', bamboo: '#a8b860', bambooDark: '#7a8a48', paper: '#fffaf0',
};
/** A thatched roof (kayabuki) over a w × d wall block (wall top at y0), built as 3–4 stacked straw tiers: each tier's
 *  cut edge stands proud of the one below, with a dark shadowed band under it; the eave is a thick cut edge with a
 *  ragged fringe of short straw wedges; the ridge is a dark beam under a bound bamboo bundle with crossed chigi at the
 *  ends; soft moss grows only on the lower tiers' north-facing (world −z) slopes. type 'hip' | 'irimoya' (a small
 *  gable with a lattice vent at each end of the top) | 'gable' (vertical ends with a wooden gable board).
 *  B.yaw0 (set by the village's populate) is the building's world yaw, for the moss.
 *  → { ridgeY, yb (eave underside), yAt(x, z), underAt(x, z) } in the caller's frame */
export function thatch(B, o) {
  const type = o.type || 'hip', over = o.over ?? 0.5, A = o.w / 2 + over, Bz = o.d / 2 + over, H = o.H ?? 1.5, lip = o.lip ?? 0.3;
  const yb = o.y0 - lip * 0.5, yl = yb + lip, yTop = yl + H, tg = type === 'irimoya' ? (o.tg ?? 0.58) : type === 'gable' ? 0 : 1;
  const R = type === 'gable' ? A : Math.max(0.12, A - Bz * (o.hip ?? 0.85));
  const axG = type === 'gable' ? A : R + (A - R) * Math.pow(1 - tg, 0.9);
  const NS = 128;
  const azAt = t => Math.max(0.12, Bz * Math.pow(1 - t, 0.92) * (1 + 0.07 * Math.sin(Math.PI * t)));
  const flat = t => type === 'gable' || (type === 'irimoya' && t >= tg); // (the gable ends stay flush: boards, not straw)
  const axAt = t => (type === 'gable' ? A : flat(t) ? axG : (R + (A - R) * Math.pow(1 - t, 0.9)) * (1 + 0.03 * Math.sin(Math.PI * t)));
  const nAt = t => (type === 'hip' ? 5 - 2.2 * t : t >= tg ? 14 : 6.5 - 1.5 * t);
  const ringAt = (t, y, out) => ({ y, ax: axAt(t) + (flat(t) ? 0 : out), az: azAt(t) + out, n: nAt(t) });
  const sec = (r, f) => { const a = f * TAU, c = Math.cos(a), s = Math.sin(a), e = 2 / r.n; return [r.ax * Math.sign(c) * Math.pow(Math.abs(c), e), r.az * Math.sign(s) * Math.pow(Math.abs(s), e)]; };
  const seed0 = (B.seed % 97) * 1.7, grooveAt = (i, y) => 0.6 * Math.sin(i * 2.399 + seed0) + 0.4 * nzB(i * 0.71 + seed0, y * 2.2); // (a straw bundle's bulge per column)
  const loft = (rings, capTop = null, capBot = null, groove = 0) => {
    const pos = [], idx = [], rows = [];
    for (const r of rings) { const row = []; for (let i = 0; i < NS; i++) { let [x, z] = sec(r, i / NS); if (groove) { const l = Math.hypot(x, z) || 1, gv = groove * grooveAt(i, r.y) * (r.g ?? 1); x += x / l * gv; z += z / l * gv; } pos.push(x, r.y, z); row.push(pos.length / 3 - 1); } rows.push(row); }
    for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < NS; i++) { const a = rows[j][i], b = rows[j][(i + 1) % NS], c = rows[j + 1][i], d = rows[j + 1][(i + 1) % NS]; idx.push(a, c, b, b, c, d); }
    if (capTop != null) { const top = rows[rows.length - 1]; pos.push(0, capTop, 0); const ct = pos.length / 3 - 1; for (let i = 0; i < NS; i++) idx.push(top[i], ct, top[(i + 1) % NS]); }
    if (capBot != null) { const bot = rows[0]; pos.push(0, capBot, 0); const cb = pos.length / 3 - 1; for (let i = 0; i < NS; i++) idx.push(bot[(i + 1) % NS], cb, bot[i]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const seed = (B.seed % 97) * 1.7, hz = k => { const v = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
  const straw = new THREE.Color(o.color || T.thatch), pale = new THREE.Color(o.edge || T.thatchEdge), dark = new THREE.Color(T.thatchUnder);
  const old = new THREE.Color('#a8957a'), deep = new THREE.Color('#8a6e4a'), moss = new THREE.Color(o.mossColor || '#8aa25a');
  const mossAmt = o.moss ?? 0.4, yaw = B.yaw0 || 0, cy = Math.cos(yaw), sy = Math.sin(yaw), m3 = new THREE.Matrix3().getNormalMatrix(B.m), wn = new THREE.Vector3();
  const northOf = n => { wn.copy(n).applyMatrix3(m3); return clamp((-(-wn.x * sy + wn.z * cy) - 0.2) / 0.5); }; // (world −z: up the minimap)
  const angOf = p => Math.atan2(p.z / Bz, p.x / A);
  // the tiers: boundaries up the roof, each upper tier's cut edge and how far it stands proud
  const NT = o.tiers ?? (H >= 1.45 ? 4 : 3);
  const tAt = i => (i <= 0 ? 0 : i >= NT ? 1 : 1 - Math.pow(1 - i / NT, 1.18));
  const lipH = clamp(0.09 + H * 0.035, 0.12, 0.16), dl = lipH / H, outOf = i => 0.15 - 0.018 * i;
  // the eave: a thick cut edge (a slight bulge) over the dark soffit
  const eave = []; for (let k = 0; k <= 3; k++) { const u = k / 3, bl = 1 + 0.035 * Math.sin(Math.PI * u); eave.push({ y: yb + lip * u, ax: A * bl - (1 - u) * 0.04, az: Bz * bl - (1 - u) * 0.04, n: nAt(0) }); }
  B.add(loft(eave, null, yb, 0.012), (p, n, out) => {
    if (n.y < -0.5 && p.y < yb + 0.01) return out.copy(dark);
    const u = (p.y - yb) / lip, nz2 = nzB(angOf(p) * 22 + seed, p.y * 9);
    return out.copy(pale).lerp(deep, (1 - u) * 0.45).multiplyScalar(0.88 + 0.12 * nz2);
  });
  const edges = [{ r: eave[0], y: yb + 0.04, wd: 0.17, h: [0.07, 0.16], push: 0.004, phase: 0 }, { r: eave[0], y: yb + 0.075, wd: 0.15, h: [0.05, 0.1], push: 0.02, phase: 0.5 }];
  for (let i = 0; i < NT; i++) {
    const t0 = tAt(i), t1 = tAt(i + 1), last = i === NT - 1, out = i ? outOf(i) : 0, y0 = yl + H * t0;
    const tEnd = last ? 1 : Math.min(1, t1 + 0.6 * dl), yShade = last ? 1e9 : yl + H * t1 - lipH * 0.35; // (the next tier's edge bottom)
    let tS = t0, outS = 0;
    const lower = i < Math.max(1, Math.round(NT / 2)), tint = (NT - 1 - i) / Math.max(1, NT - 1) * 0.22;
    if (i) {
      // the tier's cut edge: a dark underside tucked into the tier below, then the pale straw ends
      const yE = y0 - lipH * 0.35, under = [ringAt(t0, y0 - 0.03, -0.03), ringAt(t0, yE, out)];
      const cut = [ringAt(t0, yE, out), ringAt(t0 + dl * 0.55, y0 + lipH * 0.55, out * 0.98), ringAt(t0 + dl * 0.65, y0 + lipH * 0.65, out * 0.86)];
      B.add(loft(under), dark);
      B.add(loft(cut, null, null, 0.01), (p, n, o2) => { const u = clamp((p.y - yE) / (lipH), 0, 1), nz2 = nzB(angOf(p) * 26 + seed + i * 7, p.y * 11); return o2.copy(pale).lerp(deep, (1 - u) * 0.5).multiplyScalar(0.86 + 0.14 * nz2); });
      tS = t0 + dl * 0.65; outS = out * 0.86;
    }
    const nb = Math.max(4, Math.round(22 * (tEnd - tS))), band = [];
    for (let k = 0; k <= nb; k++) { const s = k / nb, t = tS + (tEnd - tS) * s; band.push(ringAt(t, yl + H * t, outS * Math.pow(1 - s, 1.25) + 0.03 * Math.sin(Math.PI * s) * (1 - t))); }
    const yS = yl + H * tS;
    band[0].g = 0.5;
    B.add(loft(band, last ? yTop + 0.02 : null, null, 0.022), (p, n, o2) => {
      const ang = angOf(p), hk = clamp((p.y - yl) / H);
      const streak = 1 + 0.12 * nzB(ang * 18 + seed + i * 3.1, p.y * 1.4) + 0.1 * nzB(ang * 64 + i, p.y * 4);
      const fresh = 1 - clamp((p.y - yS) / 0.12); // (sun-bleached just above the cut edge)
      o2.copy(straw).lerp(old, tint).lerp(pale, fresh * 0.14).lerp(deep, hk * hk * 0.2).multiplyScalar(streak);
      const sh = clamp((p.y - (yShade - 0.1)) / 0.04); // (a crisp shadow line under the next tier's edge)
      if (sh > 0) o2.lerp(dark, sh * 0.6);
      if (lower && mossAmt > 0) {
        const cov = northOf(n) * (0.55 + 0.45 * nzB(p.x * 0.55 + seed, p.z * 0.55 - seed)) * clamp(n.y * 2) * (1 - sh) * Math.min(1, mossAmt * 2.2);
        const mk = smooth(0.32, 0.8, cov); if (mk > 0) o2.lerp(moss, mk * 0.55);
      }
      return o2;
    });
  }
  // the ragged fringe: short tapered straw wedges round each cut edge (the eave's in two staggered rows)
  const fp = [];
  for (const e of edges) {
    const M = NS * 4, pts = []; let L = 0;
    for (let i = 0; i <= M; i++) { const [x, z] = sec(e.r, i / M); if (i) L += Math.hypot(x - pts[pts.length - 1][0], z - pts[pts.length - 1][1]); pts.push([x, z, L]); }
    const step = e.wd * 0.74;
    let j = 1, k = 0;
    for (let s = e.phase * step; s < L - step * 0.3; s += step, k++) {
      while (j < M && pts[j][2] < s) j++;
      const a = pts[j - 1], b = pts[j], f = (s - a[2]) / Math.max(1e-6, b[2] - a[2]);
      const px = a[0] + (b[0] - a[0]) * f, pz = a[1] + (b[1] - a[1]) * f, tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / tl, tz = (b[1] - a[1]) / tl, nx = tz, nzz = -tx;
      const h = e.h[0] + (e.h[1] - e.h[0]) * hz(k * 1.7 + e.phase * 31 + e.y * 13), w0 = e.wd / 2 * (0.85 + 0.3 * hz(k + 91)), w1 = w0 * (0.45 + 0.25 * hz(k + 41)), d0 = 0.06, d1 = 0.03, lean = 0.02 + 0.03 * hz(k + 7), jt = (hz(k + 17) - 0.5) * 0.04;
      const P = (tw, dn, y) => [px + tx * (tw + jt) + nx * dn, y, pz + tz * (tw + jt) + nzz * dn];
      const yT = e.y, yB = e.y - h, q = e.push;
      const TFL = P(-w0, q, yT), TFR = P(w0, q, yT), TBL = P(-w0, q - d0, yT), TBR = P(w0, q - d0, yT);
      const BFL = P(-w1, q + lean, yB), BFR = P(w1, q + lean, yB), BBL = P(-w1, q + lean - d1, yB), BBR = P(w1, q + lean - d1, yB);
      const quad = (a2, b2, c2, d2) => fp.push(...a2, ...b2, ...c2, ...a2, ...c2, ...d2);
      quad(TFL, TFR, BFR, BFL); quad(TBR, TBL, BBL, BBR); quad(TBL, TFL, BFL, BBL); quad(TFR, TBR, BBR, BFR); quad(BFL, BFR, BBR, BBL);
    }
  }
  if (fp.length) {
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.computeVertexNormals();
    B.add(fg, (p, n, o2) => { const k2 = nzB(p.x * 9 + seed, p.z * 9), tip = clamp((yb + 0.02 - p.y) / 0.14); return o2.copy(pale).lerp(deep, 0.42 + 0.15 * k2 + tip * 0.3).multiplyScalar(n.y < -0.5 ? 0.7 : 0.9 + 0.1 * k2); });
  }
  // the ridge: a dark beam under a bound bamboo bundle, rope bindings, crossed chigi at both ends
  const L = 2 * (type === 'gable' ? A : type === 'irimoya' ? axG : R) + 0.12;
  const rr0 = clamp(0.07 + H * 0.045, 0.1, 0.145), cap = G.cyl(rr0, rr0, L, 12); cap.rotateZ(PI / 2); cap.scale(1, 0.72, 1.1); cap.translate(0, yTop + 0.01, 0); B.add(cap, T.ridgeDark);
  const pr = rr0 * 0.42;
  for (const [dz, dy] of [[-pr * 1.05, 0], [pr * 1.05, 0], [0, pr * 0.85]]) { const p2 = G.cyl(pr, pr, L - 0.06, 8); p2.rotateZ(PI / 2); p2.translate(0, yTop + rr0 * 0.62 + dy, dz); B.add(p2, (q, n, o2) => o2.set('#a09a62').lerp(dark, 0.3).multiplyScalar(0.84 + 0.2 * clamp(n.y + 0.4))); }
  const nr = Math.max(2, Math.round(L / 0.55));
  for (let i = 0; i <= nr; i++) { const x = -L / 2 + 0.1 + i * (L - 0.2) / nr, ring = G.torus(rr0 * 0.95, 0.02, 4, 12); ring.rotateY(PI / 2); ring.scale(1, 1.05, 1.15); ring.translate(x, yTop + rr0 * 0.5, 0); B.add(ring, '#c8b088'); }
  for (const s2 of [-1, 1]) {
    const x = s2 * (L / 2 - 0.05);
    for (const k2 of [-1, 1]) { const ch = G.box(0.035, 0.66, 0.065, 0.01); ch.rotateX(k2 * 0.6); ch.translate(x, yTop + 0.16, 0); B.add(ch, '#5e4634'); }
    const tie = G.torus(0.045, 0.014, 4, 8); tie.rotateY(PI / 2); tie.translate(x, yTop + 0.16, 0); B.add(tie, '#c8b088');
  }
  // the gable boards of an irimoya / gable thatch: a dark timber triangle with a lattice vent
  if (type !== 'hip') for (const s of [-1, 1]) {
    const t0 = type === 'gable' ? 0 : tg, y0g = yl + H * t0 + 0.02, hw = azAt(t0) * 0.92, hg = yTop - y0g;
    const tri = new THREE.Shape(); tri.moveTo(-hw, 0); tri.lineTo(hw, 0); tri.lineTo(0, hg); tri.closePath();
    const tg2 = new THREE.ShapeGeometry(tri); tg2.rotateY(s * PI / 2); tg2.translate(s * (axG + 0.012), y0g, 0); B.add(tg2.index ? tg2.toNonIndexed() : tg2, '#5e4634');
    for (let k = -2; k <= 2; k++) { const zk = k * hw * 0.32, hk2 = hg * (1 - Math.abs(zk) / hw) * 0.82; if (hk2 < 0.1) continue; const sl = G.box(0.03, hk2, 0.035, 0); sl.translate(s * (axG + 0.02), y0g + hk2 / 2 + 0.03, zk); B.add(sl, '#8a6a4c'); }
    const beam = G.box(0.05, 0.06, hw * 2.05, 0); beam.translate(s * (axG + 0.025), y0g + 0.02, 0); B.add(beam, '#3e3026');
  }
  const yAt = (x, z) => { const zz = Math.abs(z) / Bz; return yl + H * clamp(1 - zz); };
  return { ridgeY: yTop, yb, yl, H, A, Bz, yAt, underAt: (x, z) => yb + 0.02 * Math.min(1, Math.abs(z) / Bz) };
}
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const _nzB = new Noise(4711);
const nzB = (x, y) => _nzB.n2(x, y);
const blkF = (zc, d) => zc + d / 2;
/** a lantern on a short cord from (x, y, z) — besieged: torn; saved: lit (the overlays pick) */
const lampAt = (x, y, z) => [x, y, z];

// ------------------------------------------------------------------ Grandma Sasa's house (the elder's minka)
export function elder(B) {
  const w = 3.9, d = 2.6, h = 1.66, y0 = 0.36, zc = -0.42, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.frame, koshi: T.koshi, koshiSkip: ['f'], weather: true });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 1.5, h: 1.34, style: 'shoji', frame: T.frame, wood: T.deck }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.4, y0 + 0.8, () => shoji(B, { w: 0.74, h: 0.56, frame: T.frame, dress: s < 0 ? 'sudare' : 'none' }));
  onFace(B, blk, 'r', 0.1, y0 + 0.84, () => roundWindow(B, { r: 0.3, frame: T.frame }));
  onFace(B, blk, 'l', -0.2, y0 + 0.82, () => latticeWindow(B, { w: 0.72, h: 0.52, frame: T.frame }));
  onFace(B, blk, 'b', 0.7, y0 + 0.84, () => shoji(B, { w: 0.62, h: 0.5, frame: T.frame }));
  onFace(B, blk, 'b', -0.8, y0 + 0.84, () => shoji(B, { w: 0.62, h: 0.5, frame: T.frame }));
  const R = thatch(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.56, H: 1.6, tg: 0.6, lip: 0.32 });
  const ez = d / 2 + 0.74;
  engawa(B, { x0: -w / 2 - 0.05, x1: w / 2 + 0.05, z: d / 2, depth: 0.78, y: y0 + 0.02, wood: T.deck, beam: T.frame, step: false });
  const pTop = R.underAt(w / 2, ez) - 0.04;
  posts(B, [-w / 2 + 0.04, w / 2 - 0.04], ez, pTop, T.frame, 0.065);
  const eb = G.beam(w + 0.1, 0.1, 0.1, 0.02); eb.translate(0, pTop - 0.02, ez); B.add(eb, T.frame);
  // porch life: dried persimmons, a wind chime, a cushion, a tea tray, potted pines, geta on the stoop stone
  for (let i = 0; i < 4; i++) B.at([-1.15 + i * 0.12, pTop - 0.08, ez - 0.02], 0, () => charm(B, 'persimmon'));
  B.at([0.95, pTop - 0.1, ez - 0.02], 0, () => charm(B, 'furin', { color: '#bfe6ff' }));
  for (const s of [-1, 1]) B.at([s * 1.65, y0 + 0.02, d / 2 + 0.28], 0, () => pot(B, { plant: 'pine', r: 0.14, color: '#8a7a9a' }));
  B.at([0, 0, d / 2 + 0.98], 0, () => stoopStone(B, 0, 0.1, 0, 0.62));
  B.pop();
  // the yard: a rain barrel and firewood at the side, a stone lantern, bamboo clumps planted by the village
  B.at([-2.35, 0, -0.9], PI / 2, () => firewood(B, { w: 0.9, h: 0.5, d: 0.26 }));
  B.at([2.3, 0, -1.15], 0, () => barrel(B, { r: 0.18, h: 0.4 }));
  B.at([2.45, 0, 0.7], 0, () => toro(B, { s: 0.8 }));
  const door0 = [0, F + 0.95];
  return {
    fp: [-w / 2 - 0.12, zc - d / 2 - 0.12, w / 2 + 0.12, F + 0.8], door: [0, F + 1.4], keeper: [0.95, F + 1.25, 0], seat: [-1.2, F + 0.55, 0],
    lamps: [lampAt(-1.55, pTopW(R, w, ez, zc), zc + ez), lampAt(1.55, pTopW(R, w, ez, zc), zc + ez)],
    siege(B) {
      B.at([0, y0 + 0.67, F], 0, () => boards(B, 1.55, 1.4, { seed: 1 }));
      for (const s of [-1, 1]) B.at([s * 1.4, y0 + 0.8, F], 0, () => boards(B, 0.8, 0.62, { seed: 2 + s }));
      B.at([1.85, y0, F + 0.01], 0, () => soot(B, 0.9, 1.4, T.plaster, 3));
      B.at([-2.1, 0, F + 1.5], 0, () => debris(B, 0.9, { seed: 11, n: 5 }));
      void door0;
    },
    saved(B) {
      B.at([0, y0, F], 0, () => noren(B, { w: 1.3, h: 0.46, y: y0 + 1.34 - 0.02, z: 0.18, color: '#3f6f5a', sym: 'bamboo', strips: 3 }));
      B.at([-0.55, y0 + 0.02, F + 0.4], 0.2, () => { const c = G.box(0.32, 0.06, 0.32, 0.02); c.translate(0, 0.03, 0); B.add(c, '#e86a6a'); });
      for (const s of [-1, 1]) B.at([s * 2.3, 0, F + 1.0], 0, () => flowerPot(B, { r: 0.16, seed: 4 + s, colors: ['#ff8fb0', '#ffffff', '#ffd24a'] }));
    },
  };
}
// the porch-beam height in the building's frame
function pTopW(R, w, ez, zc) { void zc; return R.underAt(w / 2 - 0.4, ez) - 0.06; }

// ------------------------------------------------------------------ Sasanoha Inn (two storeys: tiled skirt, thatched top)
export function inn(B) {
  const w = 3.4, d = 2.5, h = 1.52, y0 = 0.32, zc = -0.3, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.frame, koshi: T.koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  onFace(B, blk, 'f', 0, y0, () => door(B, { w: 1.0, h: 1.34, style: 'lattice', frame: T.frame, wood: T.deck }));
  for (const s of [-1, 1]) onFace(B, blk, 'f', s * 1.12, y0 + 0.8, () => latticeWindow(B, { w: 0.66, h: 0.52, frame: T.frame, bay: true, roof: T.tile }));
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, y0 + 0.82, () => shoji(B, { w: 0.7, h: 0.5, frame: T.frame }));
  onFace(B, blk, 'b', 0, y0 + 0.82, () => shoji(B, { w: 0.9, h: 0.5, frame: T.frame }));
  const R1 = roof(B, { type: 'skirt', w, d, y0: y0 + h, over: 0.46, H: 0.95, tTop: 0.44, color: T.tile, ribW: 0.24, curve: 0.34, lift: 0.18, liftW: 0.6, moss: 0.12, thick: 0.13 });
  const uw = Math.min(2.6, R1.openW - 0.12), ud = Math.min(1.8, R1.openD - 0.1), uh = 1.1, uy = R1.topY;
  walls(B, { w: uw, d: ud, h: uh, y0: uy, plaster: T.plaster, frame: T.frame, rail: true });
  const ub = { w: uw, d: ud };
  for (const u of [-0.75, 0, 0.75]) onFace(B, ub, 'f', u, uy + 0.56, () => shoji(B, { w: 0.6, h: 0.5, frame: T.frame, dress: u === 0 ? 'sudare' : 'none' }));
  for (const side of ['l', 'r']) onFace(B, ub, side, 0, uy + 0.58, () => roundWindow(B, { r: 0.22, frame: T.frame }));
  // a little balcony rail along the upper front, over the skirt
  const rz = ud / 2 + 0.2;
  for (let i = 0; i <= 8; i++) { const x = -uw / 2 + i * uw / 8, p = G.box(0.035, 0.32, 0.035, 0); p.translate(x, uy + 0.16, rz); B.add(p, T.frame); }
  { const r = G.beam(uw + 0.06, 0.05, 0.06, 0.012); r.translate(0, uy + 0.33, rz); B.add(r, T.frame); }
  const R2 = thatch(B, { type: 'irimoya', w: uw, d: ud, y0: uy + uh, over: 0.5, H: 1.3, tg: 0.6, lip: 0.28 });
  B.pop();
  // a hanging sign by the door (a futon stack: rooms for the night), a bench and parasol go out when the inn opens
  B.at([w / 2 - 0.15, y0 + 1.32, F + 0.02], 0, () => {
    const arm = G.box(0.04, 0.04, 0.46, 0); arm.translate(0, 0, 0.23); B.add(arm, T.frame);
    B.at([0, -0.28, 0.4], PI / 2, () => {
      const bd = G.box(0.42, 0.36, 0.05, 0.02); B.add(bd, '#f6ead2'); const fr = G.box(0.47, 0.41, 0.035, 0.015); B.add(fr, T.frame);
      for (const s of [0, PI]) B.at([0, 0, 0], s, () => { const g = symbolGeo('futon'); g.scale(0.3, 0.3, 1); g.translate(0, 0, 0.03); B.add(g, '#3a5a8a'); });
    });
  });
  B.at([-2.05, 0, -0.6], PI / 2, () => woodStack(B, { w: 0.8, h: 0.5, d: 0.36 }));
  B.at([2.05, 0, -0.9], 0, () => barrel(B, { r: 0.17, h: 0.38 }));
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, F + 0.12], door: [0, F + 0.9], keeper: [-0.85, F + 0.85, 0], seat: [1.25, F + 0.75, 0],
    lamps: [[-0.72, y0 + h - 0.08 + 0.04, F + 0.36], [0.72, y0 + h - 0.08 + 0.04, F + 0.36]],
    siege(B) {
      B.at([0, y0 + 0.67, F], 0, () => boards(B, 1.05, 1.36, { seed: 5 }));
      for (const s of [-1, 1]) B.at([s * 1.12, y0 + 0.8, F + 0.1], 0, () => boards(B, 0.74, 0.6, { seed: 6 + s }));
      for (const u of [-0.75, 0.75]) B.at([u, R1.topY + 0.56, zc + ud / 2], 0, () => boards(B, 0.66, 0.56, { seed: 9 + u * 4 }));
      B.at([-1.3, y0, F + 0.01], 0, () => soot(B, 0.8, 1.3, T.plaster, 7));
      B.at([1.7, 0, F + 1.4], 0, () => debris(B, 0.8, { seed: 23, n: 4 }));
      void R2;
    },
    saved(B) {
      B.at([0, y0, F], 0, () => noren(B, { w: 0.96, h: 0.5, y: y0 + 1.34 - 0.02, z: 0.16, color: '#2f4a7a', sym: 'futon', strips: 2 }));
      // futons airing over the balcony rail
      for (const [x, c] of [[-0.7, '#ff9ec0'], [0.15, '#8fd0ff'], [0.85, '#fff0b0']]) B.at([x, R1.topY + 0.33, zc + rz + 0.02], 0, () => {
        const f = G.box(0.56, 0.06, 0.5, 0.025); f.translate(0, -0.02, 0.06); f.rotateX(0.95); B.add(f, c);
        const f2 = G.box(0.56, 0.05, 0.44, 0.02); f2.translate(0, -0.03, -0.12); f2.rotateX(-0.9); B.add(f2, shade(c, 0.92));
      });
      B.at([1.25, 0, F + 1.0], PI, () => teaBench(B, { w: 1.0, felt: '#d84848' }));
      B.at([1.95, 0, F + 1.25], 0, () => parasol(B, { r: 0.75, h: 1.75, color: '#d84848' }));
      for (const s of [-1, 1]) B.at([s * 2.0, 0, F + 0.6], 0, () => flowerPot(B, { r: 0.15, seed: 9 + s }));
    },
  };
}

// ------------------------------------------------------------------ Chiku's General Store (an open shopfront)
export function shop(B) {
  const w = 3.2, d = 2.2, h = 1.5, y0 = 0.28, zc = -0.28, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: T.stone });
  walls(B, { w, d, h, y0, plaster: T.plaster, frame: T.frame, koshi: T.koshi, koshiSkip: ['f'] });
  const blk = { w, d };
  // the open front: a dark interior recess with goods on shelves, posts and a deep lintel
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.36, h - 0.18, 0.03, 0); back.translate(0, (h - 0.18) / 2 + 0.02, 0.005); B.add(back, '#4a3830');
    for (const y of [0.42, 0.78, 1.12]) {
      const sh = G.box(w - 0.5, 0.04, 0.2, 0.01); sh.translate(0, y, 0.1); B.add(sh, '#a8845e');
      const rr = mulberry32(Math.round(y * 100));
      for (let x = -(w - 0.62) / 2; x < (w - 0.62) / 2; x += 0.16 + rr() * 0.06) {
        const k = rr(), c = ['#d86a4a', '#e8c86a', '#7ab06a', '#8fb8e0', '#f0e6d0', '#b07ad0'][Math.floor(rr() * 6)];
        if (k < 0.45) { const j = G.cyl(0.05, 0.055, 0.14, 7); j.translate(x, y + 0.09, 0.1); B.add(j, c); const l = G.cyl(0.035, 0.035, 0.03, 6); l.translate(x, y + 0.175, 0.1); B.add(l, '#5a4434'); }
        else if (k < 0.8) { const b = G.box(0.12, 0.1 + rr() * 0.08, 0.12, 0.015); b.translate(x, y + 0.08, 0.1); B.add(b, c); }
        else { const s = G.sph(0.06, 7, 5); s.scale(1, 0.8, 1); s.translate(x, y + 0.07, 0.1); B.add(s, c); }
      }
    }
    for (const s of [-1, 1]) { const p = G.beam(0.12, h, 0.12, 0.02); p.translate(s * (w / 2 - 0.12), h / 2, 0.06); B.add(p, T.frame); }
    const lin = G.beam(w + 0.04, 0.16, 0.14, 0.02); lin.translate(0, h - 0.06, 0.07); B.add(lin, T.frame);
    // the counter
    const ct = G.box(w - 0.6, 0.6, 0.4, 0.03); ct.translate(0, 0.3, 0.28); B.add(ct, '#9a7656');
    const top = G.box(w - 0.5, 0.06, 0.48, 0.02); top.translate(0, 0.62, 0.28); B.add(top, '#c99f6e');
    for (let i = 0; i < 6; i++) { const pl = G.box(0.015, 0.5, 0.01, 0); pl.translate(-(w - 0.6) / 2 + (i + 0.5) * (w - 0.6) / 6, 0.29, 0.485); B.add(pl, '#7a5a42'); }
  });
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, y0 + 0.82, () => shoji(B, { w: 0.62, h: 0.5, frame: T.frame }));
  onFace(B, blk, 'b', 0, y0 + 0.82, () => shoji(B, { w: 0.8, h: 0.5, frame: T.frame }));
  const R = thatch(B, { type: 'hip', w, d, y0: y0 + h, over: 0.6, H: 1.3, lip: 0.3, hip: 0.55 });
  // the shop sign under the front eave
  B.at([0, y0 + h + 0.2, d / 2 + 0.12], 0, () => {
    const bd = G.box(1.2, 0.36, 0.06, 0.03); B.add(bd, '#f0dcb4'); const fr = G.box(1.27, 0.43, 0.04, 0.02); fr.translate(0, 0, -0.02); B.add(fr, T.frame);
    const g = symbolGeo('bamboo'); g.scale(0.3, 0.3, 1); g.translate(-0.35, 0, 0.035); B.add(g, '#4a7a3a');
    for (let i = 0; i < 3; i++) { const c = G.cyl(0.07, 0.07, 0.025, 12); c.rotateX(PI / 2); c.translate(0.05 + i * 0.2, 0, 0.04); B.add(c, '#e8b84a'); const hole = G.box(0.03, 0.03, 0.01, 0); hole.translate(0.05 + i * 0.2, 0, 0.055); B.add(hole, '#7a5a2a'); }
  });
  B.pop();
  B.at([-2.0, 0, 0.0], 0, () => { crate(B, { s: 0.34 }); B.at([0.05, 0.34, 0.02], 0.3, () => crate(B, { s: 0.28 })); });
  B.at([2.0, 0, -0.4], 0, () => sack(B, { r: 0.18 }));
  B.at([2.05, 0, 0.15], 0.6, () => sack(B, { r: 0.16, color: '#e8dcc0' }));
  void R;
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, F + 0.52], door: [0, F + 1.15], keeper: [0, F + 0.05, 0], counter: true,
    lamps: [[-1.25, y0 + h + 0.0, F + 0.55], [1.25, y0 + h + 0.0, F + 0.55]],
    siege(B) {
      // amado storm shutters dragged across the open front, then boarded
      B.at([0, y0, F + 0.55], 0, () => {
        const n = 7;
        for (let i = 0; i < n; i++) { const p = G.box((w - 0.3) / n - 0.02, h - 0.12, 0.05, 0.01); p.translate(-(w - 0.3) / 2 + (i + 0.5) * (w - 0.3) / n, (h - 0.12) / 2, 0); p.rotateZ((i - 3) * 0.006); B.add(p, ['#8a6a4e', '#7e604a', '#94745a'][i % 3]); }
        B.at([0, h * 0.5, 0], 0, () => boards(B, w - 0.4, h - 0.3, { seed: 13 }));
      });
      B.at([-1.9, 0, F + 1.4], 0, () => debris(B, 0.8, { seed: 31, n: 5 }));
    },
    saved(B) {
      // goods on the counter, baskets of bamboo shoots out front, a green-and-cream awning and a shop flag
      B.at([0, y0, F + 0.28], 0, () => {
        for (let i = 0; i < 5; i++) {
          const x = -1.0 + i * 0.5;
          const bk = G.cyl(0.13, 0.1, 0.1, 10); bk.translate(x, 0.67, 0); B.add(bk, '#c8a060');
          for (let k = 0; k < 4; k++) { const sh = G.cone(0.035, 0.16, 6); sh.translate(x + (k % 2 - 0.5) * 0.08, 0.78, (Math.floor(k / 2) - 0.5) * 0.07); sh.rotateZ((k - 1.5) * 0.15); B.add(sh, i % 2 ? '#c8a050' : '#b8c870'); }
        }
      });
      B.at([0, y0 + h + 0.02, F + 0.5], 0, () => awning(B, { w: w - 0.2, d: 0.62, y: 0, drop: 0.3, colors: ['#5a9a6a', '#f6eedc'], n: 10 }));
      B.at([-1.85, 0, F + 1.0], 0, () => nobori(B, { h: 2.3, w: 0.4, color: '#5a9a6a', sym: 'leaf' }));
      B.at([1.5, 0, F + 1.1], 0, () => { for (let i = 0; i < 3; i++) B.at([i * 0.32 - 0.32, 0, (i % 2) * 0.12], i, () => { const bk = G.cyl(0.15, 0.12, 0.2, 10); bk.translate(0, 0.1, 0); B.add(bk, '#c8a060'); const fill = G.sph(0.13, 8, 5); fill.scale(1, 0.4, 1); fill.translate(0, 0.21, 0); B.add(fill, ['#e86a4a', '#7ab06a', '#f0c84a'][i]); }); });
    },
  };
}

// ------------------------------------------------------------------ Kaze Ninja Dojo (raised hall, charcoal tiles, a training yard)
export function dojo(B) {
  const w = 4.0, d = 2.9, h = 1.72, y0 = 0.52, zc = -0.35, F = blkF(zc, d);
  B.push([0, 0, zc]);
  foundation(B, { w, d, h: y0, color: '#9a9088' });
  walls(B, { w, d, h, y0, plaster: '#f6f0e6', frame: '#3e3028', koshi: '#4a3a30', koshiSkip: ['f'], koshiH: 0.5 });
  const blk = { w, d };
  // the open hall front: three bays of dark interior between posts; a scroll with a shuriken hangs inside
  onFace(B, blk, 'f', 0, y0, () => {
    const back = G.box(w - 0.3, h - 0.16, 0.03, 0); back.translate(0, (h - 0.16) / 2 + 0.02, 0.005); B.add(back, '#3a2e28');
    const floor = G.box(w - 0.3, 0.05, 0.3, 0); floor.translate(0, 0.02, 0.15); B.add(floor, '#b8946a');
    for (const x of [-(w / 2 - 0.1), -0.66, 0.66, w / 2 - 0.1]) { const p = G.beam(0.13, h, 0.13, 0.02); p.translate(x, h / 2, 0.07); B.add(p, '#3e3028'); }
    const lin = G.beam(w + 0.06, 0.18, 0.15, 0.02); lin.translate(0, h - 0.06, 0.08); B.add(lin, '#3e3028');
    const scr = G.box(0.4, 0.9, 0.02, 0); scr.translate(0, 0.86, 0.03); B.add(scr, '#f4ecd8');
    const sr = G.cyl(0.02, 0.02, 0.5, 5); sr.rotateZ(PI / 2); sr.translate(0, 1.32, 0.035); B.add(sr, '#5a4434');
    const sym = symbolGeo('shuriken'); sym.scale(0.28, 0.28, 1); sym.translate(0, 0.9, 0.045); B.add(sym, '#2a2630');
    // a weapon rack with bo staffs in the left bay, a drum in the right bay
    for (let i = 0; i < 4; i++) { const s = G.cyl(0.02, 0.02, 1.2, 5); s.rotateZ(0.12); s.translate(-1.3 + i * 0.12, 0.62, 0.08); B.add(s, '#a8845e'); }
    const rack = G.beam(0.6, 0.06, 0.08, 0.01); rack.translate(-1.15, 0.9, 0.1); B.add(rack, '#5a4434');
    const drum = G.cyl(0.22, 0.22, 0.32, 14); drum.rotateX(PI / 2); drum.translate(1.25, 0.5, 0.12); B.add(drum, (p, n, o) => o.set(Math.abs(n.z) > 0.7 ? '#efe2c8' : '#a83a2a'));
  });
  for (const side of ['l', 'r']) onFace(B, blk, side, 0, y0 + 0.9, () => latticeWindow(B, { w: 0.9, h: 0.5, frame: '#3e3028' }));
  onFace(B, blk, 'b', 0, y0 + 0.9, () => latticeWindow(B, { w: 1.2, h: 0.5, frame: '#3e3028' }));
  roof(B, { type: 'irimoya', w, d, y0: y0 + h, over: 0.62, gOver: 0.3, H: 1.62, tg: 0.52, curve: 0.42, lift: 0.3, liftW: 0.9, thick: 0.17, ribW: 0.28, color: T.tileDojo, moss: 0.1, gable: 'plaster', gableColor: '#f6f0e6', timber: '#3e3028', rich: 2, oni: true });
  // the wide front steps up to the hall
  B.at([0, 0, d / 2 + 0.64], 0, () => steps(B, { w: 1.5, n: 3, rise: y0 / 3, run: 0.22, color: '#b8ae9e' }));
  B.pop();
  // the kanban: a tall plank sign on posts beside the steps
  B.at([-1.55, 0, F + 0.82], 0, () => {
    for (const s of [-1, 1]) { const p = G.beam(0.07, 1.55, 0.07, 0.015); p.translate(s * 0.2, 0.78, 0); B.add(p, '#3e3028'); }
    const bd = G.box(0.36, 1.05, 0.05, 0.02); bd.translate(0, 0.95, 0.03); B.add(bd, '#e8d8b8');
    const fr = G.box(0.42, 1.11, 0.03, 0.015); fr.translate(0, 0.95, 0.0); B.add(fr, '#3e3028');
    const cap = G.box(0.5, 0.06, 0.16, 0.02); cap.translate(0, 1.58, 0.02); B.add(cap, '#3e3028');
    for (const [y, s] of [[1.25, 0.26], [0.8, 0.18], [0.58, 0.18]]) { const g = symbolGeo(y > 1 ? 'shuriken' : 'leaf'); g.scale(s, s, 1); g.translate(0, y, 0.06); B.add(g, '#2a2630'); }
  });
  // the training yard: two makiwara posts and a target stuck with shuriken
  const yard = [[-2.7, 0.6], [-2.85, -0.45]];
  for (const [x, z] of yard) B.at([x, 0, z], 0, () => {
    const p = G.cyl(0.07, 0.08, 1.15, 8); p.translate(0, 0.58, 0); B.add(p, '#9a7a5a');
    const wrap = G.cyl(0.1, 0.1, 0.36, 10); wrap.translate(0, 0.86, 0); B.add(wrap, '#d8c088');
    for (let k = 0; k < 4; k++) { const r = G.torus(0.1, 0.012, 3, 10); r.rotateX(PI / 2); r.translate(0, 0.72 + k * 0.09, 0); B.add(r, '#8a6a3a'); }
    const base = G.cyl(0.16, 0.2, 0.08, 8); base.translate(0, 0.04, 0); B.add(base, STONES[1]);
  });
  B.at([-2.9, 0, 1.6], 0.5, () => {
    for (const s of [-1, 1]) { const l = G.beam(0.06, 1.0, 0.06, 0.01); l.rotateZ(s * 0.12); l.translate(s * 0.25, 0.5, -0.1); B.add(l, '#6a4a36'); }
    const tg = G.cyl(0.32, 0.32, 0.08, 18); tg.rotateX(PI / 2 - 0.15); tg.translate(0, 0.78, 0); B.add(tg, (p, n, o) => { const r = Math.hypot(p.x, (p.y - 0.78)); o.set(r < 0.1 ? '#d84a3a' : r < 0.2 ? '#f4ecd8' : '#d84a3a'); if (Math.abs(n.z) < 0.5) o.set('#d8c088'); });
    for (const [x, y] of [[0.08, 0.86], [-0.12, 0.72], [0.15, 0.66]]) { const g = symbolGeo('shuriken'); g.scale(0.12, 0.12, 1); g.rotateY(0.3); g.translate(x, y, 0.06); B.add(g, '#4a4656'); }
  });
  return {
    fp: [-w / 2 - 0.1, zc - d / 2 - 0.1, w / 2 + 0.1, F + 0.2], door: [0, F + 1.25], keeper: [0.75, F + 1.15, 0], yard: [-2.3, 0.1],
    lamps: [[-1.05, y0 + h + 0.0, F + 0.58], [1.05, y0 + h + 0.0, F + 0.58]],
    siege(B) {
      // the hall shuttered: plank doors across the bays, boarded; a war banner planted in the yard
      B.at([0, y0, F + 0.14], 0, () => {
        for (let i = 0; i < 9; i++) { const p = G.box((w - 0.4) / 9 - 0.02, h - 0.2, 0.05, 0.01); p.translate(-(w - 0.4) / 2 + (i + 0.5) * (w - 0.4) / 9, (h - 0.2) / 2, 0); B.add(p, ['#6a5040', '#5e4838', '#745646'][i % 3]); }
        for (const x of [-1.2, 1.2]) B.at([x, h * 0.48, 0], 0, () => boards(B, 1.0, 1.1, { seed: 17 + x }));
      });
      B.at([-2.5, 0, 1.05], 0, () => warBanner(B, { h: 2.4, w: 0.55, seed: 41 }));
      B.at([1.9, 0, F + 1.3], 0, () => debris(B, 0.7, { seed: 43, n: 4 }));
    },
    saved(B) {
      B.at([1.6, 0, F + 0.95], 0, () => nobori(B, { h: 2.5, w: 0.42, color: '#34405e', sym: 'star' }));
      B.at([-1.0, y0, F + 0.05], 0, () => { const c = G.box(0.34, 0.05, 0.34, 0.02); c.translate(0, 0.03, 0.2); B.add(c, '#34405e'); });
    },
  };
}

// ------------------------------------------------------------------ the Bamboo Craftshop (an open workshop shed)
export function craft(B) {
  const w = 3.7, d = 2.4, h = 1.72, zc = -0.3, F = blkF(zc, d), y0 = 0.16;
  const pole = (a, b, r = 0.035, c = T.bamboo) => B.add(tube([{ p: a, r }, { p: b, r: r * 0.92 }], 6, false), (p, n, o) => o.set(c).multiplyScalar(0.84 + 0.2 * clamp(n.y + 0.5)));
  B.push([0, 0, zc]);
  // a low stone plinth and a plank floor; the back wall of vertical boards, the sides half-height boards under bamboo lattice
  foundation(B, { w, d, h: y0, color: T.stone, stones: true, pad: 0.1 });
  for (let i = 0; i < 9; i++) { const pl = G.box(w - 0.04, 0.04, d / 9 - 0.015, 0.008); pl.translate(0, y0 + 0.02, -d / 2 + (i + 0.5) * d / 9); B.add(pl, i % 3 === 1 ? '#b08a62' : i % 2 ? '#c09a6e' : '#b8946a'); }
  const bw = G.box(w, h, 0.1, 0.02); bw.translate(0, y0 + h / 2, -d / 2 + 0.05); B.add(bw, '#8a6a4e');
  for (let i = 1; i < 12; i++) { const s = G.box(0.02, h - 0.06, 0.012, 0); s.translate(-w / 2 + i * w / 12, y0 + h / 2, -d / 2 + 0.106); B.add(s, '#6a4e3a'); }
  for (const sx of [-1, 1]) {
    const sw = G.box(0.08, h * 0.5, d - 0.1, 0.02); sw.translate(sx * (w / 2 - 0.04), y0 + h * 0.25, 0); B.add(sw, '#8a6a4e');
    for (let i = 0; i < 7; i++) pole(V(sx * (w / 2 - 0.04), y0 + h * 0.5, -d / 2 + 0.2 + i * (d - 0.4) / 6), V(sx * (w / 2 - 0.04), y0 + h - 0.02, -d / 2 + 0.2 + i * (d - 0.4) / 6), 0.024);
    for (const y of [y0 + h * 0.5, y0 + h * 0.78]) pole(V(sx * (w / 2 - 0.04), y, -d / 2 + 0.1), V(sx * (w / 2 - 0.04), y, d / 2 - 0.1), 0.022, T.bambooDark);
  }
  for (const [x, z] of [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]]) { const p = G.cyl(0.075, 0.085, h + 0.1, 8); p.translate(x, y0 + (h + 0.1) / 2, z); B.add(p, T.frame); }
  const fb = G.beam(w + 0.12, 0.14, 0.13, 0.02); fb.translate(0, y0 + h + 0.04, d / 2); B.add(fb, T.frame);
  thatch(B, { type: 'hip', w, d, y0: y0 + h + 0.12, over: 0.5, H: 1.15, lip: 0.28, hip: 0.6, moss: 0.5 });
  // inside: the workbench with a half-woven basket and tools, poles leaning on the back wall, a rack of drying strips
  const wb = G.box(1.7, 0.08, 0.6, 0.02); wb.translate(-0.45, y0 + 0.74, -d / 2 + 0.55); B.add(wb, '#c99f6e');
  for (const [x, z] of [[-1.2, -0.42], [0.3, -0.42], [-1.2, 0.08], [0.3, 0.08]]) { const l = G.beam(0.06, 0.72, 0.06, 0.01); l.translate(x, y0 + 0.37, -d / 2 + 0.55 + z); B.add(l, '#6a4e3a'); }
  B.at([-0.75, y0 + 0.78, -d / 2 + 0.52], 0, () => { const bk = G.cyl(0.2, 0.15, 0.18, 14, true); bk.translate(0, 0.09, 0); B.add(bk, '#c8a060'); for (let k = 0; k < 9; k++) { const s = G.cyl(0.006, 0.006, 0.36, 3); s.rotateZ(1.1); s.rotateY(k * 0.7); s.translate(0.22 + Math.cos(k) * 0.05, 0.22, Math.sin(k) * 0.05); B.add(s, '#d8c890'); } });
  B.at([0.05, y0 + 0.78, -d / 2 + 0.6], 0, () => { const k = G.box(0.3, 0.02, 0.06, 0); B.add(k, '#e8d8a8'); const kn = G.box(0.12, 0.03, 0.04, 0); kn.translate(-0.2, 0.01, 0); B.add(kn, '#5a4434'); });
  for (let i = 0; i < 10; i++) { const x = 0.75 + i * 0.1; pole(V(x, y0, -d / 2 + 0.16), V(x + 0.06, y0 + 2.05, -d / 2 + 0.34), 0.035, i % 3 === 1 ? T.bambooDark : i % 3 ? '#c8c070' : T.bamboo); }
  for (let k = 0; k < 7; k++) { const s = G.box(0.035, 0.64, 0.008, 0); s.translate(-1.25 + k * 0.11, y0 + 1.18, -0.05); B.add(s, '#dcd490'); }
  pole(V(-1.45, y0 + 1.52, -0.05), V(-0.45, y0 + 1.52, -0.05), 0.02, T.frame);
  B.pop();
  // the shop front (what the square sees): bamboo bundles roped to the front posts, a tiered stand of baskets and a
  // lantern frame, a trestle of long poles to the side, a chopping block, the hanging sign
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) { const x = sx * (w / 2 + 0.18) + (i - 2) * 0.07, z = F + 0.12 + (i % 2) * 0.06; pole(V(x, 0, z), V(x - sx * 0.12, 2.0 + (i % 3) * 0.12, z - 0.12), 0.034, i % 2 ? '#b8c070' : T.bamboo); }
    const rope = G.torus(0.2, 0.025, 4, 10); rope.rotateX(PI / 2); rope.translate(sx * (w / 2 + 0.12), 1.0, F + 0.06); B.add(rope, '#c8b088');
  }
  B.at([0.9, 0, F + 0.95], -0.25, () => {
    for (const [y, dz] of [[0, 0], [0.36, -0.2], [0.72, -0.4]]) { const st = G.box(1.2, 0.05, 0.3, 0.015); st.translate(0, y + 0.3, dz); B.add(st, '#a8845e'); }
    for (const sx of [-1, 1]) { const l = G.beam(0.05, 1.1, 0.05, 0.01); l.rotateX(0.5); l.translate(sx * 0.56, 0.52, -0.18); B.add(l, '#6a4e3a'); }
    for (const [x, y, dz, r] of [[-0.35, 0.33, 0, 0.15], [0.05, 0.33, 0, 0.13], [0.4, 0.33, 0, 0.14], [-0.2, 0.69, -0.2, 0.12], [0.25, 0.69, -0.2, 0.13], [0, 1.05, -0.4, 0.11]]) {
      const bk = G.cyl(r, r * 0.75, r * 1.1, 12); bk.translate(x, y + r * 0.55, dz); B.add(bk, (p, n, o) => o.set(Math.sin(p.y * 70) > 0 ? '#c8a060' : '#b08848'));
      const rim = G.torus(r * 0.98, 0.012, 3, 12); rim.rotateX(PI / 2); rim.translate(x, y + r * 1.1, dz); B.add(rim, '#8a6a3a');
    }
  });
  B.at([2.45, 0, -0.1], PI / 2, () => {
    for (const s of [-1, 1]) for (const k of [-1, 1]) { const tr = G.beam(0.05, 0.66, 0.05, 0.01); tr.rotateZ(k * 0.32); tr.translate(s * 0.7 + k * 0.1, 0.31, 0); B.add(tr, '#6a4e3a'); }
    for (let i = 0; i < 6; i++) { const p = G.cyl(0.035, 0.035, 2.5, 6); p.rotateZ(PI / 2); p.translate(0, 0.62 + (i % 2) * 0.06, -0.15 + i * 0.06); B.add(p, i % 2 ? T.bamboo : '#c8c070'); }
  });
  B.at([1.75, 0, F + 2.0], 0, () => { const b = G.cyl(0.2, 0.22, 0.36, 9); b.translate(0, 0.18, 0); B.add(b, '#8a6a4a'); const top = G.cyl(0.2, 0.2, 0.02, 9); top.translate(0, 0.37, 0); B.add(top, '#d8b88a'); const ax = G.box(0.04, 0.32, 0.04, 0); ax.rotateZ(0.5); ax.translate(0.06, 0.52, 0); B.add(ax, '#7a5a3a'); const hd = G.box(0.14, 0.08, 0.03, 0.01); hd.translate(0.13, 0.65, 0); B.add(hd, C.iron); });
  B.at([-w / 2 - 0.1, 1.5, F - 0.2], -PI / 2, () => {
    const arm = G.box(0.04, 0.04, 0.4, 0); arm.translate(0, 0, 0.2); B.add(arm, T.frame);
    B.at([0, -0.26, 0.34], PI / 2, () => { const bd = G.box(0.42, 0.36, 0.05, 0.02); B.add(bd, '#f0dcb4'); const fr = G.box(0.47, 0.41, 0.035, 0.015); B.add(fr, T.frame); for (const s of [0, PI]) B.at([0, 0, 0], s, () => { const g = symbolGeo('basket'); g.scale(0.28, 0.28, 1); g.translate(0, -0.02, 0.03); B.add(g, '#8a5a2a'); }); });
  });
  return {
    fp: [-w / 2 - 0.15, zc - d / 2 - 0.12, w / 2 + 0.15, zc + 0.1], door: [0, F + 0.75], keeper: [-0.45, zc - 0.25, PI], open: true,
    lamps: [[-1.1, y0 + h + 0.0, F + 0.3], [1.1, y0 + h + 0.0, F + 0.3]],
    siege(B) {
      // the workshop wrecked: the baskets kicked over, the bundles snapped, a banner on the roof post
      B.at([0, 0, F + 0.5], 0, () => debris(B, 1.2, { seed: 51, n: 8 }));
      for (let i = 0; i < 5; i++) { const p = G.cyl(0.035, 0.035, 1.1, 6); p.rotateZ(PI / 2 + (i - 2) * 0.4); p.rotateY(i * 0.7); p.translate(-0.6 + i * 0.3, 0.06, F + 0.9); B.add(p, i % 2 ? T.bamboo : '#c8c070'); }
      for (const [x, z, r] of [[0.5, F + 1.2, 0.14], [1.1, F + 0.7, 0.12], [-0.9, F + 1.4, 0.13]]) B.at([x, r, z], x * 3, () => { const bk = G.cyl(r, r * 0.75, r * 1.1, 10); bk.rotateZ(PI / 2); B.add(bk, '#b08848'); });
      B.at([w / 2 + 0.3, 0, F + 0.3], 0, () => warBanner(B, { h: 2.3, w: 0.5, seed: 52 }));
    },
    saved(B) {
      // finished bamboo lanterns and baskets for sale along the front beam
      for (let i = 0; i < 4; i++) B.at([-1.3 + i * 0.85, 1.72, F + 0.05], 0, () => {
        if (i % 2) { const cord = G.cyl(0.006, 0.006, 0.1, 3); cord.translate(0, -0.05, 0); B.add(cord, C.ink); const bk = G.cyl(0.12, 0.09, 0.16, 10); bk.translate(0, -0.18, 0); B.add(bk, '#c8a060'); }
        else litLantern(B, { r: 0.1, h: 0.26, color: '#f0d890', cord: 0.08 });
      });
      B.at([-1.1, 0, F + 1.0], 0.3, () => { const bk = G.cyl(0.22, 0.17, 0.3, 12); bk.translate(0, 0.15, 0); B.add(bk, '#c8a060'); for (let k = 0; k < 5; k++) { const s = G.cone(0.035, 0.18, 6); s.translate((k - 2) * 0.07, 0.36, (k % 2) * 0.05); B.add(s, '#b8c870'); } });
    },
  };
}

// ------------------------------------------------------------------ the Waypoint Shrine (a hokora, a waystone and a little torii)
export function waypoint(B) { return waystone(B, { roof: '#5a9a88', cap: 'moss', seed: 77 }); } // (art.js: the shared design, Takemori's tint)

// ------------------------------------------------------------------ the village gate (on the trail where it enters the clearing)
export function gate(B, { w = 3.4, h = 2.35, sign = true } = {}) {
  for (const s of [-1, 1]) {
    const base = G.cyl(0.2, 0.24, 0.24, 8); base.translate(s * w / 2, 0.12, 0); B.add(base, STONES[2]);
    const p = G.cyl(0.1, 0.11, h, 9); p.translate(s * w / 2, h / 2, 0); B.add(p, T.frame);
    const strut = G.beam(0.06, 0.8, 0.06, 0.01); strut.rotateX(0.5); strut.translate(s * w / 2, 0.4, -0.22); B.add(strut, T.frame);
  }
  const beam = G.beam(w + 0.7, 0.16, 0.16, 0.025); beam.translate(0, h - 0.1, 0); B.add(beam, T.frame);
  const nuki = G.beam(w + 0.3, 0.1, 0.1, 0.02); nuki.translate(0, h - 0.55, 0); B.add(nuki, T.frame);
  // a little thatched cap over the beam
  const cap = G.box(w + 1.0, 0.16, 0.6, 0.07); cap.translate(0, h + 0.06, 0); B.add(cap, T.thatch);
  const cap2 = G.box(w + 0.7, 0.14, 0.4, 0.06); cap2.translate(0, h + 0.18, 0); B.add(cap2, shade(T.thatch, 0.92));
  const rid = G.cyl(0.07, 0.07, w + 0.8, 8); rid.rotateZ(PI / 2); rid.translate(0, h + 0.27, 0); B.add(rid, T.ridge);
  if (sign) B.at([0, h - 0.33, 0.1], 0, () => {
    const bd = G.box(0.9, 0.34, 0.05, 0.02); B.add(bd, '#f0dcb4'); const fr = G.box(0.96, 0.4, 0.035, 0.015); fr.translate(0, 0, -0.01); B.add(fr, T.frame);
    for (const k of [-1, 1]) { const g = symbolGeo('bamboo'); g.scale(0.24, 0.24, 1); g.translate(k * 0.24, 0, 0.03); B.add(g, '#4a7a3a'); }
    const dot = G.cyl(0.06, 0.06, 0.02, 10); dot.rotateX(PI / 2); dot.translate(0, 0, 0.035); B.add(dot, '#c8503a');
  });
}

// ------------------------------------------------------------------ a lantern post along the village road (hook at the arm's end)
export function lanternPost(B) {
  const p = tube([{ p: V(0, 0, 0), r: 0.05 }, { p: V(0, 1.85, 0), r: 0.045 }], 7, false); B.add(p, T.bamboo);
  for (let k = 1; k < 5; k++) { const n = G.torus(0.051, 0.01, 3, 8); n.rotateX(PI / 2); n.translate(0, k * 0.4, 0); B.add(n, T.bambooDark); }
  const arm = tube([{ p: V(0, 1.75, 0), r: 0.03 }, { p: V(0.42, 1.82, 0), r: 0.026 }], 5, false); B.add(arm, T.bamboo);
  const base = G.cyl(0.13, 0.16, 0.1, 8); base.translate(0, 0.05, 0); B.add(base, STONES[0]);
  return [0.4, 1.8, 0];
}

// ------------------------------------------------------------------ the square, the road, the gates, the fences, the greenery
/** Takemori's static dressing (populate time): the shishi-odoshi basin, benches, stone lanterns, the notice board, lantern
 *  posts along the road, the two gates where the trail enters and leaves, bamboo fences round the camera side and the
 *  village's own bamboo and understorey. → { lamps, spots, update, gates } for the runtime */
export function decor(VL, ctx, PL, h0) {
  const S = VL.site, sq = VL.def.square.r, at = (a, d) => slotAt(S, a, d), out = { lamps: [], spots: [] };
  const face = p => Math.atan2(S.x - p.x, S.z - p.z);
  const solid = (x, z, r) => { ctx.addCollider(x, z, r); ctx.blockCells(x, z, r * 0.8); };
  const inBuilding = (x, z, pad = 0.4) => VL.buildings.some(b => { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; return lx > f[0] - pad && lx < f[2] + pad && lz > f[1] - pad && lz < f[3] + pad; });
  // the shishi-odoshi basin at the top of the square, in front of Grandma Sasa's house (it clacks)
  {
    const p = at(0, sq + 1.15), rot = face(p) + PI * 0.5, so = Pr.shishiOdoshi(3);
    PL.piece(so.pc, p.x, p.z, rot, { y: h0, lights: false });
    const m = PL.mesh(new THREE.Mesh(so.rocker.geo, KM('d:body'))); m.castShadow = true; m.receiveShadow = true;
    const q = new THREE.Vector3(so.rocker.pivot.x, so.rocker.pivot.y, so.rocker.pivot.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.position.set(p.x + q.x, h0 + q.y, p.z + q.z); m.rotation.y = rot;
    solid(p.x, p.z, 0.55);
    const f = face(p);
    out.spots.push({ x: p.x + Math.sin(f) * 1.0, z: p.z + Math.cos(f) * 1.0, face: f + PI, pose: 'admire', w: 1, dur: [8, 14], emote: ['sparkle', 'note'] });
    let clacked = false;
    out.update = (dt, t) => { const c = Pr.shishiCycle(t + 2.3); m.rotation.z = c.a; if (c.clackWindow && !clacked) { clacked = true; Events.emit('sfx', 'env_shishi_odoshi', { pos: m.position }); } else if (!c.clackWindow) clacked = false; };
  }
  // benches facing the square (villagers sit on them), stone lanterns at its corners, the notice board
  for (const a of [-64, 64]) { const p = at(a, sq + 1.25), r = face(p); PL.piece(Pr.bambooBench(a > 0 ? 2 : 1), p.x, p.z, r, { y: h0 }); solid(p.x, p.z, 0.55); out.spots.push({ x: p.x, z: p.z, face: r, seat: true, seatY: h0 + 0.47, w: 1.2, dur: [16, 30], emote: ['note', 'heart', 'zzz'] }); }
  for (const a of [-24, 24, -150, 150]) { const p = at(a, sq + 0.95); PL.piece(Pr.lantern(30 + a), p.x, p.z, face(p), { y: h0, lights: false }); solid(p.x, p.z, 0.32); out.lamps.push({ x: p.x, y: h0 + 0.98, z: p.z, light: '#ffc27a', stone: true }); }
  {
    const p = at(-21, sq + 2.6);
    ctx.prop(B => { B.footprint = [1, 1]; B.detail = 1; B.variant = 1; MODELS.bulletinBoard(B, 1, 1); }, { x: p.x, z: p.z, y: h0, rot: face(p), seed: 41 });
    solid(p.x, p.z, 0.45);
    out.spots.push({ x: p.x + Math.sin(face(p)) * 0.9, z: p.z + Math.cos(face(p)) * 0.9, face: face(p) + PI, pose: 'read', w: 0.9, dur: [6, 11], fidget: ['scratchHead', 'nod'], emote: ['note', 'sparkle'] });
  }
  // the road through the village: lantern posts on its far side, a gate where it crosses the clearing's rim
  const tr = ctx.plan.trail, R = S.r - 2.4, cross = []; // (the gates stand inside the clearing, clear of the wild bamboo)
  for (let i = 1; i < tr.length; i++) {
    const d0 = Math.hypot(tr[i - 1][0] - S.x, tr[i - 1][1] - S.z), d1 = Math.hypot(tr[i][0] - S.x, tr[i][1] - S.z);
    if ((d0 - R) * (d1 - R) < 0) { const k = (R - d0) / (d1 - d0), x = tr[i - 1][0] + (tr[i][0] - tr[i - 1][0]) * k, z = tr[i - 1][1] + (tr[i][1] - tr[i - 1][1]) * k; cross.push({ x, z, tx: tr[i][0] - tr[i - 1][0], tz: tr[i][1] - tr[i - 1][1] }); }
  }
  for (const c of cross) {
    const L = Math.hypot(c.tx, c.tz) || 1, tx = c.tx / L, tz = c.tz / L, rot = Math.atan2(tx, tz);
    ctx.prop(B => gate(B, { w: 3.6 }), { x: c.x, z: c.z, y: ctx.heightAt(c.x, c.z), rot, seed: 51 });
    for (const s of [-1, 1]) solid(c.x + tz * s * 1.8, c.z - tx * s * 1.8, 0.24);
  }
  out.gates = cross;
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i], seg = Math.hypot(x1 - x0, z1 - z0); acc += seg;
    if (acc < 4.6) continue;
    const dS = Math.hypot(x1 - S.x, z1 - S.z); if (dS > R - 0.6 || dS < sq + 1.4) continue;
    acc = 0;
    // the far side of the road (screen-up: away from the camera)
    const tx = (x1 - x0) / (seg || 1), tz = (z1 - z0) / (seg || 1); let nx = -tz, nz = tx; if (nx + nz > 0) { nx = -nx; nz = -nz; }
    const x = x1 + nx * (ctx.plan.trailW + 1.0), z = z1 + nz * (ctx.plan.trailW + 1.0);
    if (inBuilding(x, z, 0.6)) continue;
    const rot = Math.atan2(-nx, -nz) + PI / 2;
    let hook = null; ctx.prop(B => { hook = lanternPost(B); }, { x, z, y: ctx.heightAt(x, z), rot, seed: 61 + i });
    solid(x, z, 0.16);
    const c = Math.cos(rot), s = Math.sin(rot);
    out.lamps.push({ x: x + hook[0] * c + hook[2] * s, y: ctx.heightAt(x, z) + hook[1], z: z - hook[0] * s + hook[2] * c, color: '#f0c860' });
  }
  // bamboo fences round the camera side of the rim (low: they never hide the hero), between the two gates
  const ga = cross.map(c => slotOf(S, c.x, c.z).a).sort((a, b) => a - b);
  if (ga.length === 2) {
    const fr = S.r - 1.0, a0 = ga[1] + 9, a1 = ga[0] + 360 - 9, n = Math.max(2, Math.round((a1 - a0) / 360 * TAU * fr / 2.6));
    for (let i = 0; i < n; i++) {
      const aa = a0 + (a1 - a0) * i / n, ab = a0 + (a1 - a0) * (i + 1) / n, p = at(aa, fr), q = at(ab, fr), L = Math.hypot(q.x - p.x, q.z - p.z);
      if (VL.camps.some(c => Math.hypot((p.x + q.x) / 2 - c.x, (p.z + q.z) / 2 - c.z) < c.r + 1)) continue;
      const rot = Math.atan2(q.x - p.x, q.z - p.z) - PI / 2;
      PL.piece(Pr.fence(5 + (i % 3), { L: L * 0.98, h: 0.82 }), p.x, p.z, rot, { y: ctx.heightAt(p.x, p.z) });
      for (let k = 0; k <= 2; k++) ctx.addCollider(p.x + (q.x - p.x) * k / 2, p.z + (q.z - p.z) * k / 2, 0.16);
    }
  }
  // the village's own bamboo: groves behind the buildings and clumps between them; ferns, hostas and moss by the walls
  let seed = 913; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stand = (kind, x, z, r) => { PL.multi(F.stand(kind, Math.floor(rr() * 2)), x, ctx.heightAt(x, z) - 0.05, z, { rot: rr() * TAU, s: 0.9 + rr() * 0.2 }); ctx.addCollider(x, z, r * 0.55); ctx.blockCells(x, z, r * 0.6); ctx.paint('litter', x, z, r * 1.5, 0.8); ctx.paintFx('canopy', x, z, r * 2, 1); ctx.paintFx('shade', x, z, r * 2.6, 0.8); };
  for (let i = 0; i < 18; i++) { // (behind the buildings: the wild's own bamboo walls stand just outside the clearing)
    const a = -98 + i / 17 * 196 + (rr() - 0.5) * 8, d = S.r - 0.8 + rr() * 1.6, p = at(a, d);
    if (inBuilding(p.x, p.z, 0.9) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 2.4 || ctx.waterAt(p.x, p.z) > 0.02) continue;
    stand(Math.abs(a) < 45 && i % 2 ? 'grove' : 'clump', p.x, p.z, Math.abs(a) < 45 ? 1.9 : 1.4);
  }
  for (const a of [-58, -18, 18, 58]) { const p = at(a + (rr() - 0.5) * 6, 11.2 + rr() * 0.8); if (!inBuilding(p.x, p.z, 0.5)) stand('young', p.x, p.z, 1.0); }
  for (let i = 0; i < 120; i++) {
    const a = rr() * 360 - 180, d = 6.2 + rr() * (S.r - 5.5), p = at(a, d);
    if (inBuilding(p.x, p.z, 0.15) || ctx.pathDist(p.x, p.z) < ctx.plan.trailW + 0.5 || VL.camps.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.4)) continue;
    const near = VL.buildings.some(b => Math.hypot(p.x - b.x, p.z - b.z) < 4.2), cam = Math.abs(a) > 100, y = ctx.heightAt(p.x, p.z), k = rr(), rot = rr() * TAU;
    if (!near && !cam && rr() < 0.5) continue;
    if (k < 0.32) PL.multi(F.fern(Math.floor(rr() * 4), { big: 0.8 + rr() * 0.4 }), p.x, y, p.z, { rot });
    else if (k < 0.58) PL.multi(F.hosta(Math.floor(rr() * 3), ['blue', 'variegated', 'gold'][Math.floor(rr() * 3)]), p.x, y, p.z, { rot, s: 0.8 + rr() * 0.3 });
    else if (k < 0.78) PL.multi(F.mossMound(Math.floor(rr() * 4)), p.x, y - 0.02, p.z, { rot, s: 0.7 + rr() * 0.5 });
    else if (k < 0.9) { for (let j = 0; j < 3; j++) PL.multi(F.shoot(Math.floor(rr() * 6)), p.x + (rr() - 0.5), y, p.z + (rr() - 0.5), { rot: rr() * TAU, s: 0.7 + rr() * 0.4 }); }
    else PL.multi(F.litter(Math.floor(rr() * 4), 'bamboo'), p.x, y + 0.01, p.z, { rot, s: 1 + rr() * 0.5 });
  }
  return out;
}
/** saved-only dressing: flower tubs round the square; where the siege camps stood, what the villagers put back — a
 *  vegetable cart, a woodyard with laundry, the kitchen garden with its scarecrow (data.js camps[].saved) */
export function savedDecor(VL, B, h0) {
  const S = VL.site, sq = VL.def.square.r;
  for (const c of VL.camps) {
    const f = screenAt(S, c.at[0], c.at[1]), yaw = screenYaw(0);
    B.at([f.x, h0, f.z], yaw, () => {
      if (c.saved === 'cart') { // a vegetable cart: two wheels, a bed of crates, a little awning on poles
        const bed = G.box(1.4, 0.1, 0.8, 0.03); bed.translate(0, 0.52, 0); B.add(bed, '#a8845e');
        for (const sz of [-1, 1]) B.at([0, 0.34, sz * 0.46], 0, () => wheel(B, { r: 0.3 }));
        for (const [x, k] of [[-0.42, 'veg'], [0.05, 'apple'], [0.5, 'veg']]) B.at([x, 0.57, 0], 0, () => produce(B, { kind: k, s: 0.34 }));
        for (const sx of [-1, 1]) { const p = G.cyl(0.025, 0.025, 1.2, 5); p.translate(sx * 0.66, 1.1, -0.35); B.add(p, '#7a5a42'); }
        const aw = G.box(1.5, 0.04, 0.6, 0.02); aw.rotateX(-0.25); aw.translate(0, 1.72, -0.2); B.add(aw, '#e8503a');
        const pole = G.box(0.06, 0.06, 1.2, 0.01); pole.translate(0.6, 0.5, 0.95); pole.rotateY(0.2); B.add(pole, '#7a5a42');
        B.at([-1.3, 0, 0.6], 0.4, () => crate(B, { s: 0.32 }));
      } else if (c.saved === 'yard') { // the woodyard: a firewood rack, a chopping block, a laundry line
        B.at([-0.6, 0, -0.4], 0, () => firewood(B, { w: 1.2, h: 0.6, d: 0.32 }));
        B.at([0.7, 0, 0.3], 0, () => choppingBlock(B));
        B.at([0.2, 0, 1.2], 0, () => laundry(B, { L: 1.8, h: 1.25, colors: ['#ffffff', '#8fd0ff', '#ffd0e0', '#fff0b0'] }));
      } else if (c.saved === 'garden') { // the kitchen garden again: tidy beds, a scarecrow, a watering can
        for (let i = 0; i < 3; i++) B.at([-1.3 + i * 1.3, 0, 0], 0, () => veggieBed(B, { w: 1.1, d: 0.7 }));
        for (let i = 0; i < 3; i++) B.at([-1.3 + i * 1.3, 0, 1.0], 0, () => veggieBed(B, { w: 1.1, d: 0.6 }));
        B.at([2.2, 0, 0.4], 0, () => scarecrow(B));
        B.at([-2.2, 0, 0.6], 0.6, () => wateringCan(B));
      }
    });
  }
  for (const a of [-120, -96, 96, 120, 165, -165]) { const p = slotAt(S, a, sq + 0.6); B.at([p.x, h0, p.z], 0, () => flowerPot(B, { r: 0.18, seed: a + 200, colors: a > 0 ? ['#ff8fb0', '#ffffff', '#ffb0d0'] : ['#ffd24a', '#ff9a6a', '#ffffff'] })); }
}
