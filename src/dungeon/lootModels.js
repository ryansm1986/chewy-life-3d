// Chest and pot models for the Burrow (DungeonMode.makeChest / makePot). Each look is assembled once from the
// dungeon's low-poly templates into one vertex-coloured geometry (Batch, dungeonWorld.js) and cached; every chest /
// pot gets its own clone, so a floor's teardown (or a pot breaking) disposes only its own buffers.
//  - chest: planked box on a dark core, iron corner brackets, top / bottom rims and straps with rivets, a brass lock
//    plate with a keyhole, ring handles; a barrel lid of planks with strap bands, end plates, trims and a hasp. The
//    lid is its own geometry with the hinge at its origin (makeChest pivots it). A treasure heap waits inside.
//    Golden chests: wine-red lacquer, gold fittings and gems.
//  - pot: a lathe-turned body with a foot, belly, shoulder, neck and a rolled rim, dressed per biome: an acorn-capped
//    terracotta pot with leaf sprigs and twine (burrow), a porcelain ginger jar with indigo flowers and a red cord
//    (shrine / moon), a drip-glazed crock under a tied cloth cover with a paper label (kitchen), a frost-iced jar with
//    stars and a crystal knob (grotto).
import * as THREE from 'three';
import { Batch, SH, M, MD, col, tplOf } from './dungeonWorld.js';
import { clamp, TAU } from '../core/util.js';

const TPL = new Map();
const tpl = (k, make, flat) => { let t = TPL.get(k); if (!t) TPL.set(k, t = tplOf(make(), flat)); return t; };
const T = {
  // half cylinder, axis along x (-0.5..0.5), arc over +y: (y, z) = (sin t, cos t), t 0..PI; closed half-disc ends
  halfCyl: () => tpl('halfCyl', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)),
  blob: () => tpl('blob', () => new THREE.SphereGeometry(1, 6, 4)),
  // a pot body: foot, belly, shoulder, neck and a rolled rim (dense rows where the glaze / bands are painted)
  pot: () => tpl('potLathe', () => new THREE.LatheGeometry([[0.001, 0], [0.15, 0], [0.19, 0.015], [0.225, 0.05], [0.255, 0.1], [0.28, 0.15], [0.295, 0.2], [0.3, 0.25], [0.298, 0.29], [0.29, 0.33], [0.275, 0.37],
    [0.255, 0.41], [0.225, 0.45], [0.19, 0.485], [0.155, 0.51], [0.138, 0.53], [0.135, 0.55], [0.15, 0.568], [0.172, 0.58], [0.176, 0.597], [0.158, 0.612], [0.12, 0.604], [0.001, 0.6]].map(([r, y]) => new THREE.Vector2(r, y)), 18)),
  ring: () => tpl('ringPot', () => new THREE.TorusGeometry(1, 0.2, 5, 18).rotateX(Math.PI / 2)),
  cord: () => tpl('cordPot', () => new THREE.TorusGeometry(1, 0.1, 4, 20).rotateX(Math.PI / 2)),
};
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ chests
const CHEST = {
  wood: { plank: ['#b47846', '#a46a3c', '#c08650'], core: '#3a261c', iron: '#57526a', ironHi: '#8a86a0', brass: '#e8b848', brassHi: '#fff0b0', rivet: '#3e3a4c', inner: '#ffd24a' },
  gold: { plank: ['#a8323c', '#9a2c38', '#b83c46'], core: '#40161c', iron: '#e8aa30', ironHi: '#fff0a0', brass: '#ffd24a', brassHi: '#fffae0', rivet: '#fff0a0', inner: '#ffe070' },
};
const woodP = (c, seed) => (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
  o.copy(col(c)).multiplyScalar(0.9 + 0.08 * Math.sin(px * 31 + py * 7 + seed) + 0.05 * Math.sin(px * 83 + seed * 3));
  if (ny > 0.5) o.multiplyScalar(1.08); else if (ny < -0.5) o.multiplyScalar(0.7);
};
const metalP = (c, hi) => (px, py, pz, nx, ny, nz, o) => o.copy(col(c)).lerp(col(hi), clamp(ny * 0.55 + 0.15));
export function chestGeometry(gold) {
  const k = gold ? 'gold' : 'wood';
  let t = TPL.get('chest:' + k);
  if (!t) TPL.set('chest:' + k, t = buildChest(CHEST[k], gold));
  return { body: t.body.clone(), lid: t.lid.clone() };
}
function buildChest(P, gold) {
  const B = new Batch(), iron = metalP(P.iron, P.ironHi), brass = metalP(P.brass, P.brassHi);
  // ---- body (x -0.45..0.45, y 0..0.5, z -0.3..0.3; +z is the front)
  B.add(SH.box(), M(0, 0.03, 0, 0.8, 0.44, 0.5), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.5 ? '#1e120e' : P.core));
  for (let i = 0; i < 3; i++) {
    const y0 = 0.034 + i * 0.148, h = 0.138;
    for (const s of [-1, 1]) {
      B.add(SH.box(), M(0, y0, s * 0.2775, 0.84, h, 0.045), null, woodP(P.plank[(i + (s > 0 ? 0 : 1)) % 3], i * 3 + s));
      B.add(SH.box(), M(s * 0.4175, y0, 0, 0.045, h, 0.52), null, woodP(P.plank[(i + 2) % 3], i * 5 + s));
    }
  }
  B.add(SH.box(), M(0, 0, 0, 0.9, 0.05, 0.62), null, iron); // bottom rim
  B.add(SH.box(), M(0, 0.452, 0, 0.9, 0.048, 0.62), null, iron); // top rim
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(SH.box(), M(sx * 0.42, 0, sz * 0.28, 0.09, 0.5, 0.09), null, iron); // corner brackets
  for (const sx of [-1, 1]) B.add(SH.box(), M(sx * 0.23, 0, 0, 0.075, 0.5, 0.628), null, iron); // straps over front, bottom and back
  const rivet = (x, y, z, rx, ry, s = 0.018) => B.add(SH.hemiLo(), M(x, y, z, s, s * 0.8, s, rx, ry, 0), null, metalP(P.rivet, P.ironHi));
  for (const sx of [-1, 1]) {
    for (const y of [0.1, 0.25, 0.4]) rivet(sx * 0.23, y, 0.313, Math.PI / 2, 0);
    for (const y of [0.1, 0.4]) { rivet(sx * 0.43, y, 0.324, Math.PI / 2, 0); rivet(sx * 0.464, y, 0.25, Math.PI / 2, sx * Math.PI / 2); }
  }
  // lock plate: a brass shield with a keyhole (golden chests: a heart-cut gem above it)
  B.add(SH.box(), M(0, 0.33, 0.312, 0.17, 0.13, 0.024), null, brass);
  B.add(SH.disc(), M(0, 0.33, 0.3, 0.085, 0.024, 0.085, Math.PI / 2), null, brass);
  B.add(SH.disc(), M(0, 0.36, 0.322, 0.024, 0.008, 0.024, Math.PI / 2), col('#1a1016'));
  B.add(SH.box(), M(0, 0.3, 0.322, 0.016, 0.05, 0.008), col('#1a1016'));
  for (const sx of [-1, 1]) for (const y of [0.29, 0.43]) rivet(sx * 0.062, y, 0.324, Math.PI / 2, 0, 0.012);
  // ring handles on the ends
  for (const sx of [-1, 1]) {
    B.add(SH.box(), M(sx * 0.462, 0.27, 0, 0.014, 0.1, 0.16), null, iron);
    B.add(T.ring(), M(sx * 0.478, 0.25, 0, 0.075, 0.075, 0.075, 0, 0, Math.PI / 2), null, iron);
  }
  // the treasure inside (only seen once the lid swings up)
  B.add(SH.hemi(), M(0, 0.4, 0, 0.36, 0.085, 0.2), null, (px, py, pz, nx, ny, nz, o) => o.copy(col(P.inner)).multiplyScalar(0.85 + 0.25 * clamp(ny)));
  for (let i = 0; i < 5; i++) B.add(SH.cyl6(), M(-0.2 + i * 0.1, 0.46 + (i % 2) * 0.012, (i % 3 - 1) * 0.07, 0.045, 0.012, 0.045, 0.3 * (i % 2 ? 1 : -1), 0, 0.2), col('#fff0a0'));
  if (gold) for (const [x, c] of [[-0.15, '#ff6aa8'], [0.12, '#6ae8ff']]) B.add(SH.crys(), MD(x, 0.44, 0.02, _v.set(0.2, 1, 0.3).normalize(), 0.035, 0.08, 0.035, 1), col(c));
  const body = B.geometry();
  // ---- lid (hinge at the origin, z 0..0.62 toward the front, y up)
  const Ld = new Batch(), RY = 0.2, RZ = 0.31, Y0 = 0.02, CZ = 0.31;
  const onArc = (t, grow) => [Y0 + (RY + grow) * Math.sin(t), CZ + (RZ + grow) * Math.cos(t)];
  const nrm = t => _v.set(0, RZ * Math.sin(t), RY * Math.cos(t)).normalize(); // outward normal of the ellipse (y, z)
  Ld.add(SH.box(), M(0, 0, CZ, 0.88, 0.03, 0.6), col(P.core));
  Ld.add(T.halfCyl(), M(0, Y0, CZ, 0.84, RY, RZ), col(P.core));
  const NP = 5;
  for (let i = 0; i < NP; i++) {
    const t = (i + 0.5) / NP * Math.PI, [y, z] = onArc(t, 0), n = nrm(t), w = Math.hypot(RZ * Math.sin(t), RY * Math.cos(t)) * Math.PI / NP * 0.93;
    Ld.add(SH.box(), MD(0, y - n.y * 0.004, z - n.z * 0.004, n, 0.86, 0.045, w), null, woodP(P.plank[i % 3], 20 + i));
  }
  for (const sx of [-1, 1]) {
    Ld.add(T.halfCyl(), M(sx * 0.23, Y0, CZ, 0.075, RY + 0.055, RZ + 0.055), null, iron); // strap bands
    Ld.add(T.halfCyl(), M(sx * 0.438, Y0, CZ, 0.034, RY + 0.05, RZ + 0.05), null, iron); // end plates
    for (const t of [0.35, Math.PI / 2, Math.PI - 0.35]) { const [y, z] = onArc(t, 0.055), n = nrm(t); Ld.add(SH.hemiLo(), MD(sx * 0.23, y, z, n, 0.017, 0.014, 0.017), null, metalP(P.rivet, P.ironHi)); }
  }
  Ld.add(SH.box(), M(0, -0.01, 0.6, 0.9, 0.05, 0.04), null, iron); // front trim
  Ld.add(SH.box(), M(0, -0.01, 0.0, 0.9, 0.05, 0.04), null, iron); // back trim
  Ld.add(SH.box(), M(0, -0.12, 0.645, 0.09, 0.16, 0.02), null, brass); // hasp over the lock
  Ld.add(SH.box(), M(0, -0.1, 0.656, 0.036, 0.03, 0.006), col('#1a1016'));
  if (gold) { // a gold crest with a big pink gem on top, little gems on the straps
    const t = Math.PI / 2 - 0.25, [y, z] = onArc(t, 0.045), n = nrm(t);
    Ld.add(SH.disc(), MD(0, y, z, n, 0.1, 0.03, 0.1), null, brass);
    Ld.add(SH.crys(), MD(0, y + n.y * 0.02, z + n.z * 0.02, n, 0.065, 0.09, 0.065, 0.5), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#ff5a9a')).lerp(col('#ffe0f0'), clamp(ly * 0.8)));
    for (const sx of [-1, 1]) { const [y2, z2] = onArc(Math.PI / 2, 0.06), n2 = nrm(Math.PI / 2); Ld.add(SH.crys(), MD(sx * 0.23, y2, z2, n2, 0.028, 0.04, 0.028), col(sx < 0 ? '#6ae8ff' : '#7ae070')); }
    Ld.add(SH.crys(), MD(0, -0.1, 0.656, _v.set(0, 0, 1), 0.03, 0.035, 0.03), col('#ff5a9a'));
  }
  return { body, lid: Ld.geometry() };
}

// ------------------------------------------------------------------ pots
// colA: the body colour (shards when it breaks)
const POTS = {
  burrow: { colA: '#c87a4c' }, shrine: { colA: '#f4f0ea' }, moon: { colA: '#eef0ff' }, kitchen: { colA: '#7a4228' }, crystal: { colA: '#8a7ec8' },
};
export function potLook(theme) { return POTS[theme] ? theme : 'burrow'; }
export function potColor(theme) { return POTS[potLook(theme)].colA; }
export function potGeometry(theme) {
  const k = potLook(theme);
  let g = TPL.get('pot:' + k);
  if (!g) TPL.set('pot:' + k, g = buildPot(k));
  return g.clone();
}
// a point on the belly (lathe radius at height y) and its outward direction, at angle a
const BELLY = [[0, 0.15], [0.05, 0.225], [0.1, 0.255], [0.15, 0.28], [0.2, 0.295], [0.25, 0.3], [0.29, 0.298], [0.33, 0.29], [0.37, 0.275], [0.41, 0.255], [0.45, 0.225], [0.485, 0.19], [0.51, 0.155]];
const bellyR = y => { for (let i = 1; i < BELLY.length; i++) if (y <= BELLY[i][0]) { const [y0, r0] = BELLY[i - 1], [y1, r1] = BELLY[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.15; };
function onBelly(a, y, lift = 0) {
  const r = bellyR(y) + lift, dr = (bellyR(y + 0.01) - bellyR(y - 0.01)) / 0.02; // slope -> the normal tilts up / down
  const n = new THREE.Vector3(Math.sin(a), -dr, Math.cos(a)).normalize();
  return { x: Math.sin(a) * r, y, z: Math.cos(a) * r, n };
}
function buildPot(k) {
  const B = new Batch(), shade = (o, ny) => o.multiplyScalar(0.84 + 0.2 * clamp(ny * 0.5 + 0.5));
  const FRONT = Math.PI / 4; // the (fixed-yaw) camera looks at the pot's +x +z side
  if (k === 'burrow') { // terracotta with a cream belly band of leaf sprigs & berries, twine at the neck, an acorn-cap lid
    B.add(T.pot(), M(0, 0, 0, 1), null, (px, py, pz, nx, ny, nz, o, lx, ly) => {
      o.set(ly < 0.035 ? '#8a4a2e' : ly > 0.56 ? '#d88c5c' : '#c87a4c');
      if (ly > 0.2 && ly < 0.33) o.set(ly < 0.215 || ly > 0.315 ? '#8a4a2e' : '#f4dcb0');
      shade(o, ny);
    });
    for (let i = 0; i < 6; i++) {
      const a = FRONT + i / 6 * TAU, p = onBelly(a, 0.265, -0.004), t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      for (const e of [-1, 1]) B.add(T.blob(), MD(p.x + t.x * e * 0.03, p.y + 0.008 * e, p.z + t.z * e * 0.03, p.n, 0.034, 0.012, 0.018, e * 0.6), col(e > 0 ? '#5e9a44' : '#78b050'));
      B.add(T.blob(), MD(p.x, p.y - 0.012, p.z, p.n, 0.02, 0.018, 0.02), col(i % 2 ? '#e0463a' : '#f0a030'));
    }
    B.add(T.ring(), M(0, 0.535, 0, 0.148, 0.12, 0.148), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#d8b474')).multiplyScalar(0.85 + 0.15 * Math.sin(Math.atan2(px, pz) * 20)));
    const kx = Math.sin(FRONT) * 0.15, kz = Math.cos(FRONT) * 0.15; // a twine bow at the front
    for (const e of [-1, 1]) B.add(T.blob(), M(kx + Math.cos(FRONT) * e * 0.035, 0.535, kz - Math.sin(FRONT) * e * 0.035, 0.035, 0.022, 0.018, 0, FRONT, e * 0.5), col('#e0c080'));
    B.add(SH.hemi(), M(0, 0.585, 0, 0.19, 0.12, 0.19), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { // acorn cap: scaly crosshatch
      o.set('#7a5230'); if (Math.sin(lx * 22 + lz * 13) * Math.sin(lz * 22 - lx * 13) > 0.25) o.set('#9a6c40'); if (ly < 0.12) o.set('#6a4428'); shade(o, ny);
    });
    B.add(SH.cyl6(), M(0.01, 0.69, 0, 0.022, 0.08, 0.022, 0, 0, -0.35), col('#6a4428'));
  } else if (k === 'shrine' || k === 'moon') { // porcelain ginger jar: indigo bands and flowers, a red cord, a domed cap
    const moon = k === 'moon', ind = moon ? '#4a56a8' : '#2e4a8a', wht = moon ? '#eef0fa' : '#f6f2ec';
    B.add(T.pot(), M(0, 0, 0, 1), null, (px, py, pz, nx, ny, nz, o, lx, ly) => {
      o.set(wht);
      if (ly < 0.045 || (ly > 0.455 && ly < 0.5) || ly > 0.575) o.set(ind);
      if ((ly > 0.12 && ly < 0.135) || (ly > 0.385 && ly < 0.4)) o.set(ind);
      shade(o, ny);
    });
    for (let i = 0; i < 5; i++) { // five-petal flowers round the belly, dots between
      const a = FRONT + i / 5 * TAU, p = onBelly(a, 0.255, -0.006);
      for (let q = 0; q < 5; q++) { const b = q / 5 * TAU, u = Math.cos(b) * 0.034, v = Math.sin(b) * 0.034; const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)); B.add(T.blob(), MD(p.x + t.x * u, p.y + v, p.z + t.z * u, p.n, 0.024, 0.01, 0.024), col(ind)); }
      B.add(T.blob(), MD(p.x + p.n.x * 0.004, p.y, p.z + p.n.z * 0.004, p.n, 0.014, 0.01, 0.014), col(moon ? '#c8d0ff' : '#f0c040'));
      const q = onBelly(a + TAU / 10, 0.27, -0.004); B.add(T.blob(), MD(q.x, q.y, q.z, q.n, 0.014, 0.008, 0.014), col(ind));
    }
    B.add(T.cord(), M(0, 0.44, 0, 0.236, 0.2, 0.236), col('#d8323a')); // red cord round the shoulder, a knot and tassel at the front
    const f = onBelly(FRONT, 0.43, 0.012);
    B.add(T.blob(), M(f.x, 0.43, f.z, 0.03, 0.03, 0.03), col('#e8403a'));
    B.add(SH.cone(), M(f.x + f.n.x * 0.01, 0.3, f.z + f.n.z * 0.01, 0.03, 0.12, 0.03), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.set(ly > 0.8 ? '#e8b848' : '#d8323a'));
    B.add(SH.cyl(), M(0, 0.575, 0, 0.19, 0.028, 0.19), col(wht));
    B.add(SH.hemi(), M(0, 0.6, 0, 0.18, 0.09, 0.18), null, (px, py, pz, nx, ny, nz, o) => shade(o.set(ind), ny));
    B.add(SH.sphLo(), M(0, 0.7, 0, 0.038), col(moon ? '#d8d8f0' : '#e8b848'));
  } else if (k === 'kitchen') { // drip-glazed crock under a tied cloth cover, with a paper label
    B.add(T.pot(), M(0, 0, 0, 1), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      const a = Math.atan2(lx, lz), drip = 0.3 - 0.07 * Math.pow(Math.abs(Math.sin(a * 3)), 3) - 0.02 * Math.sin(a * 7);
      o.set(ly > drip ? '#7a4228' : '#f0dcb8'); if (ly > drip && ly < drip + 0.03) o.set('#8a4e30');
      if (ly < 0.03) o.set('#c8a888');
      shade(o, ny); if (ly > drip && ny > 0.3) o.lerp(col('#c88a5a'), 0.25); // a glint on the glaze
    });
    const lp = onBelly(FRONT, 0.22, 0.004);
    B.add(SH.box(), M(lp.x, 0.13, lp.z, 0.13, 0.15, 0.01, 0, FRONT, 0), col('#fff4e0'));
    B.add(SH.disc(), MD(lp.x + lp.n.x * 0.004, 0.235, lp.z + lp.n.z * 0.004, lp.n, 0.034, 0.006, 0.034), col('#d83a32')); // a red seal stamp
    for (let i = 0; i < 3; i++) B.add(SH.box(), M(lp.x + lp.n.x * 0.006 + Math.cos(FRONT) * (i - 1) * 0.03, 0.145, lp.z + lp.n.z * 0.006 - Math.sin(FRONT) * (i - 1) * 0.03, 0.012, 0.06 - (i % 2) * 0.015, 0.004, 0, FRONT, 0), col('#3a2a2a')); // brushed lines
    B.add(SH.hemi(), M(0, 0.555, 0, 0.215, 0.09, 0.215), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(ly < 0.3 ? '#fff0e4' : '#e0503e'); shade(o, ny); });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; B.add(T.blob(), MD(Math.sin(a) * 0.13, 0.62, Math.cos(a) * 0.13, _v.set(Math.sin(a) * 0.8, 1, Math.cos(a) * 0.8).normalize(), 0.028, 0.008, 0.028), col('#fff0e4')); } // polka dots
    B.add(SH.cone(), M(0, 0.47, 0, 0.225, 0.1, 0.225), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(Math.sin(Math.atan2(lx, lz) * 9) > 0 ? '#e0503e' : '#c8402e'); shade(o, ny); }); // the cloth skirt
    B.add(T.ring(), M(0, 0.54, 0, 0.15, 0.12, 0.15), col('#5a3a2a'));
    const kx = Math.sin(FRONT) * 0.152, kz = Math.cos(FRONT) * 0.152;
    for (const e of [-1, 1]) B.add(T.blob(), M(kx + Math.cos(FRONT) * e * 0.04, 0.545, kz - Math.sin(FRONT) * e * 0.04, 0.042, 0.024, 0.02, 0, FRONT, e * 0.5), col('#6a4430'));
    for (const e of [-1, 1]) B.add(SH.cyl6(), M(kx + Math.cos(FRONT) * e * 0.02, 0.44, kz - Math.sin(FRONT) * e * 0.02, 0.01, 0.1, 0.01, 0, 0, e * 0.25), col('#6a4430'));
  } else { // crystal grotto: lavender jar iced with frost drips, star motifs, a frosted cap with a crystal knob
    B.add(T.pot(), M(0, 0, 0, 1), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      const a = Math.atan2(lx, lz), ice = 0.43 - 0.06 * Math.pow(Math.abs(Math.sin(a * 2.5)), 4);
      o.copy(col('#6a5ea8')).lerp(col('#9a8ed4'), clamp(ly * 2.4));
      if (ly > ice) o.set('#eef4ff'); if (ly < 0.035) o.set('#dfe6ff');
      shade(o, ny);
    });
    for (let i = 0; i < 5; i++) { const a = FRONT + i / 5 * TAU, p = onBelly(a, 0.24 + (i % 2) * 0.06, -0.004); B.add(SH.star(), MD(p.x, p.y, p.z, p.n, 0.045, 0.045, 0.045, i), col(i % 2 ? '#bff4ff' : '#ffd0f0')); }
    B.add(T.ring(), M(0, 0.53, 0, 0.145, 0.14, 0.145), col('#f4f8ff'));
    B.add(SH.hemi(), M(0, 0.59, 0, 0.18, 0.08, 0.18), null, (px, py, pz, nx, ny, nz, o) => shade(o.set('#e8eeff'), ny));
    B.add(SH.crys(), MD(0, 0.64, 0, _v.set(0.1, 1, 0.05).normalize(), 0.045, 0.16, 0.045, 0.4), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#7ae8ff')).lerp(col('#ffffff'), clamp(ly * 0.7)));
    B.add(SH.crys(), MD(0.04, 0.63, 0.02, _v.set(0.6, 1, 0.3).normalize(), 0.025, 0.09, 0.025, 1), col('#ff9ae8'));
  }
  const g = B.geometry(); g.scale(0.92, 0.92, 0.92); g.computeBoundingSphere(); // ~0.7 m to the knob: the old pot's height
  return g;
}
