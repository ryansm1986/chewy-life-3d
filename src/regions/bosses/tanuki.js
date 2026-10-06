// Boss: Danzaburō the Leaf-Shifter (Momiji Hollow) — docs/REGIONS.md §2 / §3.4. Owned by the Bosses A agent.
// A great round tanuki: a drum of a cream belly, dark "bandit" eye patches, a straw sugegasa pushed back with a bright
// green transformation leaf on top, a sake tokkuri in one paw and a huge ringed tail. He sits in his harvest clearing
// sipping sake until you walk in. Fight (scripted in def.ai / def.update, state in m.tk):
//   BELLY DRUM      "PON! PON! PON!" — every beat sends a shock ring rolling out across the clearing. Each ring has a gap
//                   (a safe wedge that moves from ring to ring): stand in the gap or roll through the band.
//   DORON! BOULDER  he slaps the leaf on his head and turns into a mossy boulder (ears, tail and eyes still peeking out),
//                   rocks back and forth over a lane telegraph and rolls down it (phase 2: twice, phase 3: three times),
//                   crashes and pops back out dizzy. Stone takes little damage: dodge, then punish the dizzy tanuki.
//   DORON! KETTLE   he turns into a bunbuku chagama, hops closer, the lid rattles and the spout whistles over a cone
//                   telegraph, then spews scalding steam (phase 2+: two or three blasts, sweeping).
//   BELLY BUMP      up close he winds back and bumps you away with his belly (cone).
//   Tanuki gang     at 70% and 40% he whistles on his leaf and his gang (tanuki bandits, kuri) pop out of leaf swirls.
//   IN HIS HALL     (the Maple Roots' round arena, r ≥ 15 m: docs/ZONES.md §8.2) the fight is retuned for the bigger ring
//                   (ARENA_TUNE): three gang waves (70 / 45 / 20%, the later ones with kakashi, momiji wisps and a tesso),
//                   drum rings and the flop's ring rolling further, a longer boulder run, the flop kept inside the ring.
//   PHASE 3 (< 33%) he chugs his sake, goes red in the cheeks and DORON! grows into a giant: slower, bigger rolls, faster
//                   drums and a telegraphed belly-FLOP that lands with its own shock ring.
// After every big move he takes a breather (dizzy stars or a sweat drop, fanning himself with his hat): hit him then.
// Exports MONSTERS / BUILD. Sounds in ./tanuki.sfx.js (pure data); effects in ./fx_tanuki.js (shared with the hollow's
// monsters); fight helpers from ./kitA.js.
import * as THREE from 'three';
import { LUM_CAP, EDGE_OUT } from '../../dungeon/monsters.js';
import { V, col, ell, cone, shell, paint, merge, xf, lathe, tubeC, blob, eyesCute, smile } from '../monsters/bamboo.js';
import { mapleLeaf } from '../monsters/maple.js';
import { mergeVertices } from '../../gfx/geom.js';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { dampAngle, angleDiff } from '../../core/util.js';
import { mapleFx, MCOL } from './fx_tanuki.js';
import { roll, hitWhere, pushPlayer, summonAdds, pickId, sfx, arenaOf, clearRun, clamp, rand, TAU, ease, F } from './kitA.js';

const PAL = {
  fur: '#a4774e', furLight: '#c0936a', dark: '#5a3c2c', darker: '#3e2a22', cream: '#fbe8c6', belly: '#f8e2b8', nose: '#2a1a1c',
  straw: '#e8c46a', strawDark: '#c49a48', band: '#c83a2e', leaf: '#62c844', leafVein: '#c4f09a', leafDark: '#3e9a34',
  flask: '#f6efe2', glaze: '#3a5aa8', cord: '#d8403a', blush: '#ff8aa8', stone: '#a8947e', stoneDark: '#7e6c5a', moss: '#7aa048',
  iron: '#4a4a58', ironHi: '#6a6a7c', copper: '#c07a3e',
};
const SCALE = 2.4, GIANT = 1.38;
const TELE = MCOL.tele;
const _v = new THREE.Vector3(), _p = new THREE.Vector3();

// ------------------------------------------------------------------ model
/** the transformation leaf: a plump pointed leaf with a midrib and veins, gently cupped; stem at the origin, tip +y */
function bigLeaf(size) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(size * 0.52, size * 0.14, size * 0.48, size * 0.72, 0, size);
  sh.bezierCurveTo(-size * 0.48, size * 0.72, -size * 0.52, size * 0.14, 0, 0);
  const t = size * 0.06;
  let g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -t / 2); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); P.setZ(i, P.getZ(i) + 0.9 * x * x / size - 0.12 * y * y / size); } // cupped, tip curling back
  g.computeVertexNormals();
  const c = col(PAL.leaf), d = col(PAL.leafDark);
  paint(g, (p, n, o) => o.copy(c).lerp(d, clamp(Math.abs(p.x) / (size * 0.45))));
  const vz = (x, y) => 0.9 * x * x / size - 0.12 * y * y / size + t / 2 + 0.004;
  const parts = [g, tubeC([[0, -size * 0.2, 0, size * 0.035], [0, 0.02, vz(0, 0), size * 0.03], [0, size * 0.5, vz(0, size * 0.5), size * 0.022], [0, size * 0.92, vz(0, size * 0.92), size * 0.01]], PAL.leafVein, 4)];
  for (const k of [-1, 1]) for (const y0 of [0.22, 0.42, 0.62]) { const y = size * y0, x1 = k * size * (0.34 - y0 * 0.22), y1 = y + size * 0.16; parts.push(tubeC([[0, y, vz(0, y), size * 0.014], [x1, y1, vz(x1, y1), size * 0.008]], PAL.leafVein, 3)); }
  return merge(parts);
}
function tokkuri() { // a sake flask: white glazed bottle with a blue band and a red cord round the neck (origin at the neck)
  const g = lathe([[0.001, -0.25], [0.06, -0.245], [0.088, -0.2], [0.094, -0.14], [0.075, -0.08], [0.04, -0.04], [0.03, 0], [0.042, 0.022], [0.001, 0.028]], 14,
    (p, n, o) => { o.set(PAL.flask); if (p.y > -0.19 && p.y < -0.15) o.set(PAL.glaze); if (Math.abs(p.y + 0.12) < 0.012) o.set(PAL.glaze); });
  return [g, xf(new THREE.TorusGeometry(0.036, 0.011, 5, 12), { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0] }), tubeC([[0.03, -0.02, 0.02, 0.008], [0.05, -0.08, 0.04, 0.007], [0.04, -0.12, 0.05, 0.006]], PAL.cord, 3)].map((q, i) => (i === 1 ? paint(q, (p, n, o) => o.set(PAL.cord)) : q));
}
/** the tanuki face on the front of an ellipsoid head E = [a, b, c] centred at the origin (the man, the kettle, the boulder) */
function faceParts(E, { eyes = true, mouth = true, s = 1, q = 10 } = {}) {
  const [a, b, c] = E, zs = (x, y) => c * Math.sqrt(Math.max(0.02, 1 - (x / a) ** 2 - (y / b) ** 2));
  const P = [], dark = PAL.dark;
  for (const k of [-1, 1]) {
    const px = k * 0.1 * s, py = 0.03 * s;
    P.push(ell(0.095 * s, 0.07 * s, 0.035 * s, dark, [px, py, zs(px, py) - 0.012 * s], [0, k * 0.42, k * -0.4], q)); // drooping bandit patch
    const cx = k * 0.155 * s, cy = -0.07 * s;
    P.push(ell(0.1 * s, 0.07 * s, 0.075 * s, PAL.cream, [cx, cy, zs(cx, cy) - 0.035 * s], [0, k * 0.5, 0], q)); // cheek fluff
    if (eyes) {
      const z = zs(px, py) + 0.012 * s;
      P.push(ell(0.048 * s, 0.054 * s, 0.022 * s, '#fffaf0', [px, py, z], [0, k * 0.42, 0], q));
      P.push(ell(0.036 * s, 0.043 * s, 0.02 * s, '#1a1014', [px + k * 0.004 * s, py - 0.004 * s, z + 0.012 * s], [0, k * 0.42, 0], q));
      P.push(ell(0.014 * s, 0.015 * s, 0.01 * s, '#ffffff', [px - 0.012 * s, py + 0.016 * s, z + 0.03 * s], [0, 0, 0], 6));
    }
    const bx = k * 0.175 * s, by = -0.035 * s;
    P.push(ell(0.045 * s, 0.024 * s, 0.012 * s, PAL.blush, [bx, by, zs(bx, by) - 0.002], [0, k * 0.6, 0], 8));
  }
  const mz = zs(0, -0.055 * s) - 0.03 * s;
  P.push(ell(0.115 * s, 0.075 * s, 0.085 * s, PAL.cream, [0, -0.055 * s, mz], [0, 0, 0], q + 2)); // muzzle
  P.push(ell(0.04 * s, 0.03 * s, 0.028 * s, PAL.nose, [0, -0.02 * s, mz + 0.08 * s], [0, 0, 0], 8));
  P.push(ell(0.012 * s, 0.008 * s, 0.006 * s, '#ffffff', [-0.012 * s, -0.008 * s, mz + 0.106 * s], [0, 0, 0], 6));
  if (mouth) P.push(smile(-0.085 * s, mz + 0.066 * s, 0.045 * s, 0.018 * s, 0.009 * s, '#3a2024'));
  return P;
}
function ears(r, s = 1) {
  const P = [];
  for (const k of [-1, 1]) {
    const x = k * r * 0.62, y = r * 0.78;
    P.push(ell(0.075 * s, 0.07 * s, 0.04 * s, PAL.darker, [x, y, -0.01], [0, 0, k * -0.35], 10), ell(0.045 * s, 0.042 * s, 0.02 * s, PAL.cream, [x * 0.98, y - 0.005, 0.02 * s], [0, 0, k * -0.35], 8));
  }
  return P;
}
function tailGeo(s = 1) { // big fluffy tail with dark rings, from the rump out and up
  const path = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.02, -0.16), V(0, 0.06, -0.3), V(0, 0.22, -0.37), V(0, 0.36, -0.33), V(0, 0.44, -0.24)]);
  const N = 14, pts = [];
  for (let i = 0; i <= N; i++) { const u = i / N, q = path.getPoint(u), rr = (0.07 + Math.sin(Math.min(1, u * 1.1) * Math.PI) * 0.1 + (u < 0.15 ? 0 : 0.02)) * s; pts.push([q.x * s, q.y * s, q.z * s, Math.max(0.025 * s, u > 0.93 ? rr * 0.5 : rr)]); }
  const g = tubeC(pts, '#ffffff', 10, true);
  paint(g, (p, n, o) => { o.set(PAL.fur); const y = p.y / s, z = p.z / s; const along = Math.atan2(y - 0.1, -z - 0.2); if (Math.sin(along * 7.5 + 0.6) > 0.35) o.set(PAL.dark); if (y > 0.4) o.set(PAL.darker); if (n.y < -0.5) o.lerp(col(PAL.cream), 0.25); });
  return g;
}
function hatParts() { // straw sugegasa (weave + red band), with its chin cords; origin at the crown's rim centre
  const hat = new THREE.LatheGeometry([[0.37, 0], [0.345, 0.012], [0.3, 0.045], [0.26, 0.068], [0.235, 0.082], [0.21, 0.097], [0.17, 0.115], [0.11, 0.14], [0.06, 0.16], [0.001, 0.172]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  paint(hat, (p, n, o) => { const a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z); o.set(PAL.straw); if (Math.cos(a * 12) > 0.6 || Math.abs(r - 0.3) < 0.01 || Math.abs(r - 0.11) < 0.01) o.set(PAL.strawDark); if (r > 0.225 && r < 0.265) o.set(PAL.band); if (r > 0.36) o.set(PAL.strawDark); });
  return [...shell(hat, 0.94, '#b08a44'), ell(0.03, 0.03, 0.03, PAL.band, [0, 0.172, 0], [0, 0, 0], 8)];
}
function buildDanzaburo() {
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], fragOut: EDGE_OUT + LUM_CAP });
  const ol = makeOutline('#2a1622', 0.014);
  const root = new THREE.Group(), pivot = new THREE.Group(), hover = new THREE.Group();
  root.add(pivot); pivot.add(hover);
  const add = (parent, geo, shadow = true) => { const me = new THREE.Mesh(geo, mat); me.castShadow = shadow; me.receiveShadow = true; parent.add(me, new THREE.Mesh(geo, ol)); return me; };
  const grp = (parent, p) => { const g = new THREE.Group(); if (p) g.position.set(...p); parent.add(g); return g; };
  // ============ the tanuki
  const tanu = grp(hover);
  const B = [];
  for (const k of [-1, 1]) { B.push(ell(0.1, 0.065, 0.13, PAL.dark, [k * 0.15, 0.055, 0.06], [0, k * 0.2, 0], 12), ell(0.1, 0.1, 0.1, PAL.dark, [k * 0.15, 0.13, 0.0], [0, 0, 0], 12)); }
  B.push(blob(22, 14, q => { const y = q.y, w = 1 + 0.14 * (0.2 - y); return q.set(q.x * 0.37 * w, 0.4 + y * 0.35, q.z * 0.33 * w); }, (p, n, o) => { o.set(PAL.fur); if (n.y > 0.55) o.lerp(col(PAL.furLight), (n.y - 0.55) * 1.2); if (p.y < 0.14) o.set(PAL.dark); }));
  // straw rope sash under the belly, knotted at the side
  B.push(paint(xf(new THREE.TorusGeometry(0.335, 0.03, 5, 20), { p: [0, 0.2, 0], r: [Math.PI / 2 + 0.08, 0, 0], s: [1, 0.95, 1] }), (p, n, o) => o.set(Math.sin(Math.atan2(p.x, p.z) * 22) > 0 ? PAL.straw : PAL.strawDark)));
  B.push(ell(0.05, 0.04, 0.04, PAL.straw, [0.3, 0.2, 0.16], [0, 0, 0], 8), cone(0.03, 0.12, PAL.strawDark, [0.32, 0.13, 0.17], [0, 0, 0.3], 5), cone(0.03, 0.12, PAL.strawDark, [0.28, 0.13, 0.19], [0, 0, -0.2], 5));
  const body = add(tanu, merge(B));
  // the drum: a big cream belly (its own group: it puffs up and wobbles when drummed)
  const belly = grp(tanu, [0, 0.36, 0.165]);
  add(belly, merge([paint(ell(0.28, 0.28, 0.215, PAL.belly, [0, 0, 0], [0, 0, 0], 20), (p, n, o) => o.set(PAL.belly).lerp(col('#ffffff'), clamp(n.z * n.y * 0.6))), tubeC([[-0.012, 0.012, 0.212, 0.008], [0.01, 0.01, 0.214, 0.008], [0.008, -0.012, 0.213, 0.008], [-0.01, -0.006, 0.212, 0.007]], PAL.strawDark, 4)]));
  // tail
  const tail = grp(tanu, [0, 0.2, -0.26]); add(tail, tailGeo(1));
  // arms: left holds the tokkuri, right is the drumming paw
  const armL = grp(tanu, [-0.31, 0.5, 0.03]), armR = grp(tanu, [0.31, 0.5, 0.03]);
  for (const [g, k] of [[armL, -1], [armR, 1]]) {
    const A = [ell(0.1, 0.1, 0.1, PAL.fur, [k * 0.02, -0.01, 0], [0, 0, 0], 12), ell(0.085, 0.14, 0.085, PAL.fur, [k * 0.075, -0.12, 0.065], [0.55, 0, k * 0.45], 12), ell(0.085, 0.078, 0.085, PAL.dark, [k * 0.105, -0.235, 0.14], [0, 0, 0], 12)];
    if (k < 0) A.push(...tokkuri().map(q => q.translate(k * 0.1, -0.265, 0.17)));
    add(g, merge(A));
  }
  // head (pivot at the neck): face, ears, hat with the leaf on top, an open mouth for laughs, blush for the sake
  const head = grp(tanu, [0, 0.74, 0.03]);
  const HR = 0.235, H = [];
  H.push(paint(ell(0.25, 0.215, 0.225, PAL.fur, [0, 0.12, 0], [0, 0, 0], 20), (p, n, o) => { o.set(PAL.fur); if (n.y > 0.5) o.lerp(col(PAL.furLight), (n.y - 0.5)); }));
  H.push(...faceParts([0.25, 0.215, 0.225]).map(g => g.translate(0, 0.12, 0)), ...ears(HR).map(g => g.translate(0, 0.12, 0)));
  add(head, merge(H));
  const jaw = grp(head, [0, 0.03, 0.245]); // an open laughing mouth (scaled in)
  add(jaw, merge([ell(0.05, 0.036, 0.02, '#8a2a30', [0, 0, 0], [0, 0, 0], 12), ell(0.03, 0.016, 0.012, '#ff8a9a', [0, -0.014, 0.008], [0, 0, 0], 8)]), false);
  jaw.scale.setScalar(0.001);
  const blush = grp(head, [0, 0.085, 0]); // drunk cheeks (scaled in for the giant)
  add(blush, merge([-1, 1].map(k => ell(0.07, 0.04, 0.02, '#ff5a7a', [k * 0.17, 0, 0.19], [0, k * 0.6, 0], 10))), false);
  blush.scale.setScalar(0.001);
  const hat = grp(head, [0, 0.27, -0.06]); hat.rotation.set(-0.42, 0, 0.1);
  add(hat, merge(hatParts()));
  const leaf = grp(hat, [0, 0.16, 0]); leaf.rotation.set(0.35, 0, -0.25);
  add(leaf, bigLeaf(0.26));
  // ============ the boulder (DORON!): a mossy rock with his ears, eyes, leaf and tail poking out
  const rock = grp(hover, [0, 0.47, 0]); const rockSpin = grp(rock);
  const RR = 0.47, RK = [];
  RK.push(blob(22, 16, q => { const k = 1 + 0.07 * Math.sin(q.x * 4.3 + q.y * 2.1) + 0.05 * Math.sin(q.z * 5.7 - q.y * 3) + 0.03 * Math.sin(q.x * 11 + q.z * 9); return q.multiplyScalar(RR * k); },
    (p, n, o) => { o.set(PAL.stone); if (n.y > 0.35 && Math.sin(p.x * 21) * Math.sin(p.z * 19 + p.y * 7) > -0.3) o.set(PAL.moss); if (n.y < -0.3) o.set(PAL.stoneDark); if (Math.abs(Math.sin(p.x * 13 + p.y * 9)) < 0.05 && n.y < 0.3) o.set('#5e5044'); }));
  RK.push(...faceParts([RR * 0.95, RR * 0.95, RR * 0.95], { mouth: false, s: 1.05 }).map(g => g.translate(0, 0.04, 0)), ...ears(RR, 1.15));
  for (const [x, y, z, a] of [[0.3, 0.26, 0.24, 0.5]]) RK.push(xf(mapleLeaf(0.12, x > 0 ? '#e2482e' : '#f47034'), { p: [x, y, z], r: [a * 0.3, a, a * 0.5] }));
  const rtail = tailGeo(0.8); rtail.translate(0, -0.05, -RR * 0.92); RK.push(rtail);
  add(rockSpin, merge(RK));
  const rockLeaf = grp(rockSpin, [0, RR * 0.95, -0.05]); rockLeaf.rotation.set(0.2, 0, 0.3); add(rockLeaf, bigLeaf(0.22));
  rock.visible = false;
  // ============ the teakettle (bunbuku chagama): iron kettle, copper rim, bronze handle, spout; his head, legs and tail
  const kettle = grp(hover);
  const KB = [];
  KB.push(lathe([[0.001, 0.085], [0.2, 0.09], [0.3, 0.15], [0.335, 0.25], [0.315, 0.35], [0.24, 0.43], [0.19, 0.455]], 20, (p, n, o) => { o.set(PAL.iron); if (Math.abs(p.y - 0.25) < 0.028) o.set(PAL.copper); if (n.y > 0.5) o.lerp(col(PAL.ironHi), 0.5); if ((Math.sin(Math.atan2(p.x, p.z) * 14) > 0.8) && p.y > 0.3 && p.y < 0.42) o.set('#5a5a6a'); }));
  KB.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), { p: [0, 0.462, 0] }), (p, n, o) => o.set(PAL.copper)));
  KB.push(tubeC([[0, 0.29, 0.29, 0.065], [0, 0.32, 0.4, 0.05], [0, 0.37, 0.48, 0.04], [0, 0.4, 0.52, 0.036]], PAL.iron, 9, false));
  KB.push(paint(xf(new THREE.TorusGeometry(0.29, 0.024, 6, 18, Math.PI), { p: [0, 0.42, -0.06] }), (p, n, o) => o.set(PAL.copper)));
  for (const k of [-1, 1]) KB.push(ell(0.035, 0.035, 0.035, PAL.copper, [k * 0.29, 0.42, -0.06], [0, 0, 0], 8));
  for (const [x, z] of [[-0.19, 0.14], [0.19, 0.14], [-0.19, -0.14], [0.19, -0.14]]) KB.push(ell(0.075, 0.09, 0.08, PAL.dark, [x, 0.07, z], [0, 0, 0], 10));
  const ktail = tailGeo(0.75); ktail.translate(0, 0.2, -0.3); KB.push(ktail);
  add(kettle, merge(KB));
  const lid = grp(kettle, [0, 0.48, 0]);
  add(lid, merge([paint(xf(new THREE.SphereGeometry(0.19, 14, 5, 0, TAU, 0, Math.PI * 0.4), { s: [1, 0.55, 1] }), (p, n, o) => o.set(PAL.iron).lerp(col(PAL.ironHi), clamp(n.y - 0.5))), ell(0.04, 0.035, 0.04, PAL.copper, [0, 0.105, 0], [0, 0, 0], 10)]));
  const khead = grp(kettle, [0, 0.52, 0.2]); // his head pops out of the kettle's front shoulder
  const KH = [ell(0.2, 0.175, 0.18, PAL.fur, [0, 0.07, 0], [0, 0, 0], 16), ...faceParts([0.2, 0.175, 0.18], { s: 0.82, q: 8 }).map(g => g.translate(0, 0.07, 0)), ...ears(0.19, 0.85).map(g => g.translate(0, 0.07, 0))];
  add(khead, merge(KH));
  const kLeaf = grp(khead, [0.02, 0.24, -0.02]); kLeaf.rotation.set(0.3, 0, -0.3); add(kLeaf, bigLeaf(0.2));
  const spout = new THREE.Object3D(); spout.position.set(0, 0.41, 0.56); kettle.add(spout);
  kettle.visible = false;
  // helpers for effects: world positions of the belly, the leaf and the spout
  const bellyTip = new THREE.Object3D(); bellyTip.position.set(0, 0, 0.24); belly.add(bellyTip);
  const pose = { form: 'tanuki', hop: 0, crouch: 0, lean: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, head: 0, tilt: 0, jaw: 0, belly: 1, blush: 0, rock: 0, spin: 0, lid: 0, laugh: 0, drink: 0, waddle: 0, rate: 9, hopRate: 12, direct: -1, sit: 0 };
  const cur = { hop: 0, crouch: 0, lean: 0, armLx: 0, armLz: 0, armRx: 0, armRz: 0, head: 0, tilt: 0, jaw: 0, belly: 1, blush: 0, rock: 0, spinA: 0, sit: 0, walk: 0 };
  const SM = ['crouch', 'lean', 'armLx', 'armLz', 'armRx', 'armRz', 'head', 'tilt', 'jaw', 'belly', 'blush', 'rock', 'sit'];
  let form = 'tanuki', bellyWob = 0;
  const animate = (dt, t, moving) => {
    const k = 1 - Math.exp(-pose.rate * dt);
    for (const n of SM) cur[n] += (pose[n] - cur[n]) * k;
    if (pose.direct >= 0) cur.hop = pose.direct; else cur.hop += (pose.hop - cur.hop) * (1 - Math.exp(-pose.hopRate * dt));
    cur.walk += ((moving ? 1 : 0) - cur.walk) * Math.min(1, dt * 6);
    if (pose.form !== form) { form = pose.form; tanu.visible = form === 'tanuki'; rock.visible = form === 'rock'; kettle.visible = form === 'kettle'; }
    const w = cur.walk, step = Math.sin(t * 7.5);
    const breathe = Math.sin(t * 2.1) * 0.02;
    hover.position.y = cur.hop + Math.abs(step) * 0.035 * w - cur.sit * 0.05;
    const sq = cur.crouch + cur.sit * 0.12;
    hover.scale.set(1 + sq * 0.12 + breathe * 0.4, 1 - sq * 0.18 + breathe, 1 + sq * 0.12 + breathe * 0.4);
    hover.rotation.set(cur.lean - cur.sit * 0.1, 0, step * 0.07 * w + cur.rock);
    if (form === 'tanuki') {
      const lg = pose.laugh ? Math.abs(Math.sin(t * 15)) * pose.laugh : 0;
      bellyWob = Math.max(0, bellyWob - dt * 3);
      const bs = cur.belly * (1 + Math.sin(t * 30) * 0.05 * bellyWob + lg * 0.04);
      belly.scale.set(bs, bs, bs);
      armL.rotation.set(cur.armLx - step * 0.25 * w, 0, cur.armLz + Math.sin(t * 1.7) * 0.03);
      armR.rotation.set(cur.armRx + step * 0.25 * w, 0, cur.armRz - Math.sin(t * 1.7) * 0.03);
      head.rotation.set(cur.head - lg * 0.12, Math.sin(t * 0.7) * 0.06, cur.tilt + Math.sin(t * 1.3) * 0.03);
      jaw.scale.setScalar(Math.max(0.001, cur.jaw + lg * 0.9));
      blush.scale.setScalar(Math.max(0.001, cur.blush));
      tail.rotation.set(Math.sin(t * 2.4) * 0.06, Math.sin(t * 1.6) * 0.3 * (1 + w), 0);
      leaf.rotation.z = -0.25 + Math.sin(t * 2.2) * 0.08;
    } else if (form === 'rock') {
      if (pose.spin) cur.spinA += pose.spin * dt; else cur.spinA += (Math.round(cur.spinA / TAU) * TAU - cur.spinA) * Math.min(1, dt * 8);
      rockSpin.rotation.x = cur.spinA;
    } else {
      lid.position.y = 0.48 + (pose.lid ? Math.abs(Math.sin(t * 34)) * 0.035 * pose.lid : 0); lid.rotation.z = pose.lid ? Math.sin(t * 29) * 0.12 * pose.lid : 0;
      khead.rotation.set(Math.sin(t * 2) * 0.05, Math.sin(t * 0.9) * 0.15, 0);
    }
  };
  animate(0, 0, false);
  const M = { root, pivot, body, mat, outline: null, animate, pose, cur, parts: { hover, tanu, belly, bellyTip, head, jaw, blush, hat, leaf, armL, armR, tail, rock, rockSpin, rockLeaf, kettle, lid, khead, kLeaf, spout } };
  M.drum = () => { bellyWob = 1; };
  M.mats = [mat, ol];
  return M;
}

// ------------------------------------------------------------------ tuning (index = phase: 0 above 66%, 1 above 33%, 2 giant)
const TUNE = {
  keep: [4.4, 4.2, 4.0],
  drum: { cd: [7.5, 6.5, 6], beats: [3, 4, 5], gap: [0.62, 0.56, 0.5], wind: [0.95, 0.85, 0.8], speed: [5.4, 6.2, 7.2], r1: 10.5, w: [0.8, 0.85, 1.05], gapW: [0.52, 0.46, 0.42], dmg: 0.75 },
  rock: { cd: [11, 9.5, 8.5], n: [1, 2, 3], wind: [1.05, 0.9, 0.8], windN: 0.62, speed: [12, 13.5, 14.5], half: 1.05, dmg: 1.25, dizzy: [1.8, 1.55, 1.4] },
  kettle: { cd: [12.5, 10.5, 9.5], n: [1, 2, 3], wind: [0.95, 0.8, 0.72], windN: 0.6, blast: [1.15, 1.05, 1.0], R: [6.6, 7.2, 7.8], half: 0.42, sweep: [0, 0.55, 0.75], tick: 0.3, dmg: 0.42 },
  bump: { cd: 4.8, wind: 0.6, R: 2.7, half: 0.95, dmg: 0.9 },
  flop: { cd: 8, crouch: 0.4, track: 1.0, lock: 0.45, r: 3.1, dmg: 1.5 },
  summonAt: [0.7, 0.4],
  phaseAt: [0.66, 0.33],
  rest: [1.4, 1.25, 1.1],
};
// the arena retune: Danzaburō's hall under the great root crown in the Maple Roots (an authored round hall, r ≥ 15 m,
// instead of the 11 m outdoor clearing; docs/ZONES.md §8.2). His drum rings roll on across the bigger hall, the boulder
// runs further, the belly-flop's ring goes wider (and the flop never lands him off the ring), and his gang comes in three
// waves (70 / 45 / 20%), the later ones bringing the hollow's yokai and the root halls' tesso.
const ARENA_TUNE = {
  summonAt: [0.7, 0.45, 0.2],
  waves: [['tanuki', 'kuri', 'kuri', 'kuri'], ['tanuki', 'tanuki', 'kakashi', 'momijiWisp', 'tesso'], ['tanuki', 'tanuki', 'kuri', 'kuri', 'kakashi', 'momijiWisp']],
  drumR1: 14, rockMax: 19, flopR1: 12.5, rim: 2.4,
};
const inHollow = S => (S.arena?.r || 0) >= 15;
const set = (S, st) => { S.st = st; S.t = 0; S.flag = 0; };
// timelines that keep running while he is stunned (the default AI skips def.ai during stuns)
const TIMED = new Set(['intro', 'drum', 'leafUp', 'rockRoll', 'rockCrash', 'kettleHop', 'steam', 'bump', 'summon', 'giant', 'flopUp', 'flopTrack', 'flopLock', 'flopLand', 'rest', 'poofBack']);
const ph = S => S.ph;

function poseIdle(p) { Object.assign(p, { hop: 0, crouch: 0, lean: 0.04, armLx: -0.15, armLz: -0.12, armRx: -0.1, armRz: 0.14, head: 0, tilt: 0, jaw: 0, belly: 1, rock: 0, spin: 0, lid: 0, laugh: 0, rate: 9, hopRate: 12, direct: -1, sit: 0 }); }
const worldOf = (o, v) => { o.getWorldPosition(v); return v; };
const foeOf = (m, tgt) => (m.G.player && !m.G.playerDead ? m.G.player : tgt);
/** a clear straight run from his belly to p (walkable ground, no solid props), ignoring his own footprint — the layout's
 *  cell LOS can fail from the arena's centre cell where he sits */
function clearTo(m, p) {
  const W = m.world, dx = p.x - m.pos.x, dz = p.z - m.pos.z, L = Math.hypot(dx, dz);
  for (let s = Math.min(1.4 * sc(m), L); s < L - 0.3; s += 0.7) { const x = m.pos.x + dx / L * s, z = m.pos.z + dz / L * s; if (!W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.25)) return false; }
  return true;
}
const fxOf = m => m.tk.fx;
const sc = m => m.anim.def.scale / SCALE; // 1, or GIANT once he has grown

// ------------------------------------------------------------------ the fight
function tick(m, dt, tgt, d, slowMul) {
  const S = m.tk; S.t += dt;
  switch (S.st) {
    case 'sit': startIntro(m); return false;
    case 'intro': return introTick(m, dt);
    case 'idle': return idleTick(m, dt, tgt, d, slowMul);
    case 'drumWind': case 'drum': return drumTick(m, dt, tgt);
    case 'leafUp': return leafUpTick(m, dt, foeOf(m, tgt));
    case 'rockAim': case 'rockRoll': case 'rockCrash': return rockTick(m, dt, foeOf(m, tgt));
    case 'kettleHop': case 'steamAim': case 'steam': return kettleTick(m, dt, foeOf(m, tgt));
    case 'poofBack': return poofBackTick(m, dt);
    case 'bumpWind': case 'bump': return bumpTick(m, dt, tgt);
    case 'summon': return summonTick(m, dt);
    case 'giant': return giantTick(m, dt);
    case 'flopUp': case 'flopTrack': case 'flopLock': case 'flopLand': return flopTick(m, dt, tgt);
    case 'rest': m.faceTo(tgt.pos.x, tgt.pos.z, dt * 0.35); if (S.t >= S.restDur) { set(S, 'idle'); poseIdle(m.model.pose); } return false;
  }
  return false;
}
function startIntro(m) {
  const S = m.tk, p = m.model.pose; set(S, 'intro');
  Object.assign(p, { sit: 0, hop: 0.9, hopRate: 10, crouch: 0, armLx: -0.6, armLz: -0.9, armRx: -0.4, armRz: 1.1, head: -0.2, jaw: 0.8, rate: 12 });
  m.emote('!', 0.9);
  S.fx.leaves(m.pos.x, m.pos.y + 1.2, m.pos.z, { n: 18, speed: 4, up: 3.5 });
  sfx('danza_hic', m.pos);
}
function introTick(m) {
  const S = m.tk, p = m.model.pose, fx = S.fx;
  if (S.t > 0.3 && !(S.flag & 1)) { S.flag |= 1; Object.assign(p, { hop: 0, crouch: 0.4, jaw: 0 }); fx.puffs(m.pos.x, m.pos.y + 0.1, m.pos.z, { n: 10, color: MCOL.dust, size: 0.8, speed: 3, up: 0.6, r: 0.8 }); m.G.engine.rig.shake(0.25); sfx('danza_land', m.pos); }
  if (S.t > 0.55 && !(S.flag & 2)) { S.flag |= 2; Object.assign(p, { crouch: 0, armRx: -2.3, armRz: 0.5, head: -0.25, laugh: 1 }); sfx('danza_laugh', m.pos); } // pats the leaf on his head, laughing
  if (S.t > 0.8 && !(S.flag & 4)) { S.flag |= 4; fx.twinkles(...leafPos(m), { n: 10, r: 0.5, size: 0.4, color: MCOL.twinkle }); }
  if (S.t > 1.25 && !(S.flag & 8)) { S.flag |= 8; Object.assign(p, { laugh: 0, armLx: -1.3, armLz: -0.3, armRx: -1.3, armRz: 0.3, belly: 1.15, lean: -0.12 }); }
  if (S.t > 1.55 && !(S.flag & 16)) { // one showy drum beat (harmless)
    S.flag |= 16; Object.assign(p, { armLx: -0.35, armLz: 0.35, armRx: -0.35, armRz: -0.35, belly: 1, lean: 0.06, rate: 22 }); m.model.drum();
    worldOf(m.model.parts.bellyTip, _v); fx.pon(_v.x, _v.y, _v.z, sc(m) * 1.3); fx.word('PON!', m.lift(3.6), { a: '#fff4c8', b: '#ffae5a', size: 2.1 });
    fx.shockRing(m.pos.x, m.pos.z, 0.6, 6, { life: 0.6, color: '#fff0c8', width: 0.08 });
    m.G.engine.rig.shake(0.35); sfx('danza_pon', m.pos);
  }
  if (S.t > 2.1) { set(S, 'idle'); poseIdle(p); S.gcd = 0.4; m._prof = null; } // framing re-measures him standing
  return false;
}
function leafPos(m) { worldOf(m.model.parts.leaf, _v); return [_v.x, _v.y, _v.z]; }

function idleTick(m, dt, tgt, d, slowMul) {
  const S = m.tk, frac = m.life / m.lifeMax, C = S.cds, P = ph(S);
  if (P < 2 && frac < TUNE.phaseAt[1]) { startGiant(m); return false; }
  if (P < 1 && frac < TUNE.phaseAt[0]) { S.ph = 1; m.emote('anger', 1.4); sfx('danza_laugh', m.pos, { pitch: 0.9 }); m.G.ui?.toast?.(`${m.name} stops holding back!`, { color: '#ffb070', icon: 'oni' }); }
  const sAt = inHollow(S) ? ARENA_TUNE.summonAt : TUNE.summonAt;
  if (S.summoned < sAt.length && frac < sAt[S.summoned]) { startSummon(m); return false; }
  S.gcd -= dt;
  if (S.gcd <= 0) {
    // the big moves are aimed at Chewy even while the pup is the one nipping at his ankles (the nearest target)
    const G = m.G, foe = G.player && !G.playerDead ? G.player : tgt, dp = Math.hypot(foe.pos.x - m.pos.x, foe.pos.z - m.pos.z), los = clearTo(m, foe.pos);
    if (C.bump <= 0 && d < TUNE.bump.R * sc(m) + 0.3) { startBump(m, tgt); if (tgt !== G.player) C.bump *= 1.6; return false; }
    if (P === 2 && C.flop <= 0 && (dp > 3.5 || Math.random() < 0.35)) { startFlop(m, foe); return false; }
    // weighted pick among the ready moves (never the same one twice running when there's a choice)
    const opts = S.opts; opts.length = 0;
    if (C.drum <= 0) { opts.push('drum'); if (dp < 7) opts.push('drum'); }
    if (C.rock <= 0 && los) { opts.push('rock'); if (dp > 5) opts.push('rock'); }
    if (C.kettle <= 0 && los) { opts.push('kettle'); if (dp > 3 && dp < 8.5) opts.push('kettle'); }
    let pick = null, other = false;
    for (const o of opts) if (o !== S.last) other = true;
    for (let i = 0; i < 8 && opts.length; i++) { const o = opts[(Math.random() * opts.length) | 0]; if (o !== S.last || !other) { pick = o; break; } }
    if (pick === 'drum') { startDrum(m, foe); return false; }
    if (pick === 'rock') { startLeaf(m, foe, 'rock'); return false; }
    if (pick === 'kettle') { startLeaf(m, foe, 'kettle'); return false; }
  }
  return reposition(m, dt, tgt, d, slowMul);
}
function reposition(m, dt, tgt, d, slowMul) {
  const S = m.tk, want = TUNE.keep[ph(S)] * sc(m);
  S.strafeT -= dt; if (S.strafeT <= 0) { S.strafe = -S.strafe; S.strafeT = rand(1.8, 3.4); }
  if (d > 3 && !clearTo(m, tgt.pos) && !m.mode.los(m.pos, tgt.pos)) { m.chase(tgt, dt, slowMul); return true; }
  let dx = tgt.pos.x - m.pos.x, dz = tgt.pos.z - m.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const radial = clamp((d - want) / 2, -1, 1);
  let mx = dx * radial - dz * S.strafe * 0.5, mz = dz * radial + dx * S.strafe * 0.5;
  const A = S.arena, ox = m.pos.x - A.x, oz = m.pos.z - A.z, od = Math.hypot(ox, oz) || 1;
  if (od > A.r - 2.5) { const k = clamp((od - (A.r - 2.5)) / 2) * 1.6; mx -= ox / od * k; mz -= oz / od * k; }
  const ml = Math.hypot(mx, mz), face = m.facing;
  if (ml < 0.15) { m.faceTo(tgt.pos.x, tgt.pos.z, dt); return false; }
  _v.set(mx / ml, 0, mz / ml);
  m.move(_v, dt, slowMul * (d > want + 3 ? 1.2 : 0.75) / sc(m));
  m.facing = dampAngle(face, Math.atan2(dx, dz), 6, dt);
  return true;
}
function startRest(m, dur, kind = 'sweat') {
  const S = m.tk, p = m.model.pose; set(S, 'rest'); S.restDur = dur;
  poseIdle(p);
  if (kind === 'dizzy') { Object.assign(p, { crouch: 0.25, head: 0.15, tilt: 0.2, armLz: -0.5, armRz: 0.5 }); S.fx.dizzy(m.pos, m.pos.y + 2.9 * sc(m), dur * 0.95, { r: 0.6 * sc(m), n: 5, size: 0.36 }); }
  else { Object.assign(p, { crouch: 0.15, head: 0.1, armRx: -2.2, armRz: 0.6, lean: -0.05 }); m.emote('sweat', dur); }
  m.G.vfx.decal(m.pos, { r: m.bodyR * 1.3, color: '#ffe0b0', additive: true, opacity: 0.3, life: dur, spin: -0.8 });
}

// --- belly drum: shock rings with a moving gap
function startDrum(m, tgt) {
  const S = m.tk, T = TUNE.drum, P = ph(S), p = m.model.pose; set(S, 'drumWind'); S.last = 'drum';
  S.cds.drum = T.cd[P] * rand(0.9, 1.15); S.gcd = rand(0.5, 0.9);
  S.beat = 0; S.beats = T.beats[P]; S.wind = T.wind[P];
  S.gapA = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z) + (Math.random() < 0.5 ? 1 : -1) * rand(0.7, 1.2);
  S.tele = S.fx.tele({ shape: 'disc', x: m.pos.x, z: m.pos.z, r: 2.2 * sc(m), time: S.wind, color: TELE, hold: 0.2 });
  Object.assign(p, { armLx: -1.5, armLz: -0.35, armRx: -1.5, armRz: 0.35, belly: 1.2, lean: -0.16, crouch: 0.15, head: -0.15, rate: 10 });
  m.mode.bossTelegraph?.(S.wind + 0.3); m.mode.bossEngaged?.(m);
  sfx('danza_drumwind', m.pos);
}
function drumTick(m, dt, tgt) {
  const S = m.tk, T = TUNE.drum, P = ph(S), p = m.model.pose;
  m.faceTo(tgt.pos.x, tgt.pos.z, dt * 0.5);
  if (S.st === 'drumWind') { if (S.t >= S.wind) { S.tele.fire(); set(S, 'drum'); S.t = T.gap[P]; } return false; }
  const g = T.gap[P];
  if (S.t >= g) {
    S.t -= g;
    if (S.beat >= S.beats) { startRest(m, TUNE.rest[P]); return false; }
    // PON! both paws slap the belly, a shock ring rolls out
    const alt = S.beat % 2;
    Object.assign(p, { armLx: -0.3, armLz: 0.4, armRx: -0.3, armRz: -0.4, belly: 1.0, lean: 0.07, crouch: 0.2, rate: 26 });
    setTimeout(() => { if (m.alive && S.st === 'drum') Object.assign(p, { armLx: -1.4, armLz: -0.35, armRx: -1.4, armRz: 0.35, belly: 1.15, lean: -0.1, crouch: 0.1, rate: 12 }); }, g * 450);
    m.model.drum();
    worldOf(m.model.parts.bellyTip, _v); S.fx.pon(_v.x, _v.y, _v.z, sc(m) * 1.2);
    S.fx.word(alt ? 'POKO!' : 'PON!', m.lift(3.3 * sc(m) + 0.3 * alt), { a: '#fff4c8', b: alt ? '#ff8a5a' : '#ffae5a', size: 1.7 + 0.3 * sc(m) });
    const ring = S.fx.shock({ x: m.pos.x, z: m.pos.z, r0: 0.9 * sc(m), r1: inHollow(S) ? ARENA_TUNE.drumR1 : T.r1, speed: T.speed[P], w: T.w[P], h: 0.5 + 0.15 * P, gapA: S.gapA, gapW: T.gapW[P], color: '#ffa54a', hot: '#fffbe8' });
    ring.hits = []; S.rings.push(ring);
    S.gapA += (Math.random() < 0.5 ? 1 : -1) * rand(0.9, 1.5);
    S.beat++;
    m.G.engine.rig.shake(0.18 + 0.08 * P); sfx('danza_pon', m.pos, { pitch: alt ? 1.12 : 1 });
  }
  return false;
}
function inBand(R, x, z, pr) {
  const dx = x - R.x, dz = z - R.z, dd = Math.hypot(dx, dz), w = R.w * (1 + R.r / R.r1 * 0.25);
  if (Math.abs(dd - R.r) > w * 0.5 + pr) return false;
  return !(R.gapW > 0 && Math.abs(angleDiff(R.gapA, Math.atan2(dx, dz))) < R.gapW - pr / Math.max(dd, 0.5)); // standing in the gap
}
function updateRings(m) {
  const S = m.tk, G = m.G, P = G.player, Cb = m.mode.combat;
  for (let i = S.rings.length - 1; i >= 0; i--) {
    const R = S.rings[i];
    if (R.done) { S.rings.splice(i, 1); continue; }
    if (P && !G.playerDead && !R.hits.includes(P) && inBand(R, P.pos.x, P.pos.z, P.radius || 0.3)) {
      R.hits.push(P);
      if (!P.invuln) {
        Cb.hitPlayer(roll(m, TUNE.drum.dmg), { element: 'phys', level: m.level, from: m.pos, knock: 0, src: m });
        const dx = P.pos.x - R.x, dz = P.pos.z - R.z, L = Math.hypot(dx, dz) || 1;
        S.push = { x: dx / L, z: dz / L, v: 6, t: 0.22, T: 0.22 };
        S.fx.leaves(P.pos.x, P.pos.y + 0.6, P.pos.z, { n: 6, speed: 3, up: 2 });
      } else R.hits.pop(); // rolled through it: the band can still catch you if you stop inside it
    }
    for (const e of Cb.entities) if (e.team === 'ally' && e.alive && e !== P && !e.untargetable && e.pos && !R.hits.includes(e) && inBand(R, e.pos.x, e.pos.z, e.radius || 0.3)) { R.hits.push(e); Cb.hitAlly(e, roll(m, TUNE.drum.dmg * 0.8), { from: m.pos }); }
  }
}

// --- DORON! the leaf on his head: into a boulder or a teakettle
function startLeaf(m, tgt, into) {
  const S = m.tk, p = m.model.pose; set(S, 'leafUp'); S.into = into; S.last = into;
  const T = TUNE[into === 'rock' ? 'rock' : 'kettle']; S.cds[into === 'rock' ? 'rock' : 'kettle'] = T.cd[ph(S)] * rand(0.9, 1.12); S.gcd = rand(0.6, 1.0);
  Object.assign(p, { armRx: -2.5, armRz: 0.45, armLx: -0.9, armLz: 0.6, head: -0.1, crouch: 0.1, rate: 12 }); // paw on the leaf, other paw in a "doron" sign
  S.fx.gather(v => worldOf(m.model.parts.leaf, v), 0.55, MCOL.twinkle);
  m.mode.bossEngaged?.(m);
  sfx('danza_leaf', m.pos);
}
function leafUpTick(m, dt, tgt) {
  const S = m.tk;
  m.faceTo(tgt.pos.x, tgt.pos.z, dt);
  if (S.t >= 0.6) {
    doron(m, S.into === 'rock' ? 'rock' : 'kettle');
    if (S.into === 'rock') { S.rolls = TUNE.rock.n[ph(S)]; startRockAim(m, tgt, TUNE.rock.wind[ph(S)]); }
    else { S.blasts = TUNE.kettle.n[ph(S)]; set(S, 'kettleHop'); S.hops = m.pos.distanceTo(tgt.pos) > 4.5 ? 2 : m.pos.distanceTo(tgt.pos) > 3.2 ? 1 : 0; S.hopT = 0; }
  }
  return false;
}
function doron(m, form) {
  const S = m.tk, p = m.model.pose, s = sc(m);
  S.fx.doron(m.pos.x, m.pos.y + 0.6 * s, m.pos.z, 1.5 * s);
  S.fx.word('DORON!', m.lift(3.2 * s), { a: '#f0ffe0', b: '#7ad04a', size: 2 });
  poseIdle(p); p.form = form; m.model.cur.hop = 0;
  S.form = form; m._prof = null;
  m.G.engine.rig.shake(0.3); sfx('danza_doron', m.pos);
}
// the boulder
function startRockAim(m, tgt, wind) {
  const S = m.tk, T = TUNE.rock, p = m.model.pose; set(S, 'rockAim');
  S.wind = wind; S.aim = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  S.half = T.half * sc(m); S.len = rockLen(m, S.aim);
  S.tele = S.fx.tele({ shape: 'line', x: m.pos.x, z: m.pos.z, yaw: S.aim, w: S.half * 2, len: S.len + S.half, time: wind, color: TELE, hold: 0.25 });
  Object.assign(p, { spin: -4, rate: 10 });
  m.mode.bossTelegraph?.(wind + 0.2);
  sfx('danza_rev', m.pos);
}
function rockLen(m, aim) {
  const S = m.tk, A = S.arena, dx = Math.sin(aim), dz = Math.cos(aim);
  let len = clearRun(m.world, m.pos.x, m.pos.z, dx, dz, inHollow(S) ? ARENA_TUNE.rockMax : 15, S.half * 0.7);
  // stay inside the clearing (the bales ring it)
  const ox = m.pos.x - A.x, oz = m.pos.z - A.z, b = ox * dx + oz * dz, c = ox * ox + oz * oz - (A.r - 1.2) ** 2, disc = b * b - c;
  if (disc > 0) len = Math.min(len, Math.max(0, -b + Math.sqrt(disc)));
  return Math.max(2.5, len);
}
function rockTick(m, dt, tgt) {
  const S = m.tk, T = TUNE.rock, p = m.model.pose, G = m.G, P = ph(S);
  if (S.st === 'rockAim') {
    if (S.t < S.wind * 0.6) { // tracks you for most of the wind-up, then locks
      const want = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); S.aim += clamp(angleDiff(S.aim, want), -2 * dt, 2 * dt);
      S.len = rockLen(m, S.aim); S.tele.place(m.pos.x, m.pos.z, S.aim);
    }
    m.facing = dampAngle(m.facing, S.aim, 14, dt);
    p.rock = Math.sin(S.t * 22) * 0.08; // rocking on the spot, grinding
    if (Math.random() < dt * 20) S.fx.p('n', F.PUFF, m.pos.x + rand(-0.8, 0.8), m.pos.y + 0.1, m.pos.z + rand(-0.8, 0.8), { vy: 0.6, vx: -Math.sin(S.aim) * 1.5, vz: -Math.cos(S.aim) * 1.5, life: 0.5, size: 0.5, size1: 1, color: MCOL.dust, alpha: 0.6, alpha1: 0, drag: 2 });
    if (S.t >= S.wind) {
      S.tele.fire(); set(S, 'rockRoll'); S.trav = 0; S.hit = false; S.dx = Math.sin(S.aim); S.dz = Math.cos(S.aim);
      Object.assign(p, { rock: 0, spin: T.speed[P] / (0.47 * SCALE * sc(m)) });
      sfx('danza_roll', m.pos);
    }
    return false;
  }
  if (S.st === 'rockRoll') {
    const spd = T.speed[P], step = spd * dt;
    _p.copy(m.pos); m.pos.x += S.dx * step; m.pos.z += S.dz * step;
    m.world.collision?.resolve(m.pos, m.radius * 0.8, _p);
    const moved = Math.hypot(m.pos.x - _p.x, m.pos.z - _p.z); S.trav += moved;
    m.facing = Math.atan2(S.dx, S.dz);
    S.fx.rollDust(m.pos.x, m.pos.z, S.dx, S.dz, 'dz-roll', dt, 1.3 * sc(m));
    const Pl = G.player, hitR = S.half;
    if (!S.hit && Pl && !G.playerDead && !Pl.invuln && Math.hypot(Pl.pos.x - m.pos.x, Pl.pos.z - m.pos.z) < hitR + (Pl.radius || 0.3)) {
      S.hit = true;
      m.mode.combat.hitPlayer(roll(m, T.dmg), { element: 'phys', level: m.level, from: m.pos, knock: 0, src: m });
      const sx = -S.dz, sz = S.dx, side = (Pl.pos.x - m.pos.x) * sx + (Pl.pos.z - m.pos.z) * sz >= 0 ? 1 : -1; // flung aside, out of the lane
      S.push = { x: sx * side + S.dx * 0.4, z: sz * side + S.dz * 0.4, v: 10, t: 0.3, T: 0.3 };
      G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.05);
      sfx('danza_crash', Pl.pos, { vol: 0.7 });
    }
    for (const e of m.mode.combat.entities) if (e.team === 'ally' && e.alive && e !== Pl && !e.untargetable && e.pos && Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) < hitR + 0.3 && (e._dzRoll || 0) < S.rollId) { e._dzRoll = S.rollId; m.mode.combat.hitAlly(e, roll(m, T.dmg * 0.8), { from: m.pos }); }
    const blocked = moved < step * 0.3;
    if (S.trav >= S.len || blocked || S.t > 2.2) {
      S.rollId++;
      const x = m.pos.x + S.dx * S.half * 0.8, z = m.pos.z + S.dz * S.half * 0.8;
      S.fx.crash(x, z, 2.2 * sc(m));
      G.engine.rig.shake(0.5); sfx('danza_crash', m.pos);
      p.spin = 0;
      if (--S.rolls > 0) { startRockAim(m, tgt, TUNE.rock.windN * (P === 2 ? 0.9 : 1)); return false; }
      set(S, 'rockCrash'); p.rock = 0;
    }
    return true;
  }
  // rockCrash: a wobble, then out he pops, dizzy
  p.rock = Math.sin(S.t * 18) * 0.12 * (1 - S.t / 0.5);
  if (S.t >= 0.5) { doron(m, 'tanuki'); startRest(m, T.dizzy[P], 'dizzy'); }
  return false;
}
// the teakettle
function kettleTick(m, dt, tgt) {
  const S = m.tk, T = TUNE.kettle, p = m.model.pose, P = ph(S);
  if (S.st === 'kettleHop') {
    if (S.hops <= 0) { startSteamAim(m, tgt, T.wind[P]); return false; }
    const HT = 0.46;
    if (S.hopT === 0) { S.hx0 = m.pos.x; S.hz0 = m.pos.z; const a = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z), L = Math.min(1.8, Math.max(0, m.pos.distanceTo(tgt.pos) - 3)); S.hx1 = m.pos.x + Math.sin(a) * L; S.hz1 = m.pos.z + Math.cos(a) * L; m.facing = a; sfx('danza_hop', m.pos); }
    S.hopT += dt; const k = clamp(S.hopT / HT);
    _p.copy(m.pos); m.pos.x = S.hx0 + (S.hx1 - S.hx0) * k; m.pos.z = S.hz0 + (S.hz1 - S.hz0) * k; m.world.collision?.resolve(m.pos, m.radius * 0.8, _p);
    p.direct = Math.sin(k * Math.PI) * 0.45; p.crouch = k > 0.85 ? 0.3 : -0.1; p.lid = 1;
    if (k >= 1) { S.hopT = 0; S.hops--; p.direct = -1; m.model.cur.hop = 0; S.fx.puffs(m.pos.x, m.pos.y + 0.1, m.pos.z, { n: 6, color: MCOL.dust, size: 0.6, speed: 2, up: 0.4, r: 0.6 }); sfx('danza_clank', m.pos); }
    return true;
  }
  if (S.st === 'steamAim') {
    if (S.t < S.wind * 0.55) { const want = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); S.aim += clamp(angleDiff(S.aim, want), -2.4 * dt, 2.4 * dt); placeSteamTele(m); }
    m.facing = dampAngle(m.facing, S.aim, 14, dt);
    p.lid = 0.4 + 0.6 * S.t / S.wind; p.crouch = -0.05 * S.t / S.wind;
    if (Math.random() < dt * 12) { worldOf(m.model.parts.spout, _v); S.fx.wisps(_v.x, _v.y, _v.z, { n: 1, size: 0.25 }); }
    if (S.t >= S.wind) {
      S.tele.fire(); set(S, 'steam'); S.tickT = 0; S.dur = T.blast[P];
      worldOf(m.model.parts.spout, _v);
      S.jet = { x: _v.x, y: _v.y, z: _v.z, yaw: S.aim - S.sweep * 0.5 * S.sweepDir, half: T.half, R: T.R[P] * Math.sqrt(sc(m)), on: true };
      S.fx.steam(S.jet);
      p.lid = 1.5; sfx('danza_steam', m.pos);
    }
    return false;
  }
  // steam: the jet (sweeping in phase 2+), scalding everything in the cone every tick
  const J = S.jet, k = clamp(S.t / S.dur);
  J.yaw = S.aim + (k - 0.5) * S.sweep * S.sweepDir;
  m.facing = J.yaw; worldOf(m.model.parts.spout, _v); J.x = _v.x; J.y = _v.y; J.z = _v.z;
  S.tickT -= dt;
  if (S.tickT <= 0) {
    S.tickT = T.tick;
    const ox = m.pos.x, oz = m.pos.z;
    const inCone = (x, z, r) => { const dx = x - ox, dz = z - oz, dd = Math.hypot(dx, dz); if (dd > J.R + r + 0.4 || dd < 0.05) return dd < 0.05; return Math.abs(angleDiff(J.yaw, Math.atan2(dx, dz))) <= J.half + Math.atan2(r, dd); };
    if (hitWhere(m, inCone, roll(m, T.dmg), { element: 'fire', knock: 0.15, from: m.pos })) { const P0 = m.G.player; S.fx.wisps(P0.pos.x, P0.pos.y + 0.6, P0.pos.z, { n: 3, size: 0.4 }); }
  }
  if (S.t >= S.dur) {
    J.on = false;
    if (--S.blasts > 0) { startSteamAim(m, tgt, T.windN); return false; }
    set(S, 'poofBack'); p.lid = 0;
  }
  return false;
}
function startSteamAim(m, tgt, wind) {
  const S = m.tk, T = TUNE.kettle, P = ph(S); set(S, 'steamAim');
  S.wind = wind; S.aim = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  S.sweep = T.sweep[P]; S.sweepDir = Math.random() < 0.5 ? 1 : -1;
  S.tele = S.fx.tele({ shape: 'cone', x: m.pos.x, z: m.pos.z, yaw: S.aim, r: T.R[P] * Math.sqrt(sc(m)), half: T.half + S.sweep * 0.5, time: wind, color: TELE, hold: 0.3 });
  m.mode.bossTelegraph?.(wind + 0.2);
  sfx('danza_whistle', m.pos);
}
function placeSteamTele(m) { const S = m.tk; S.tele.place(m.pos.x, m.pos.z, S.aim); }
function poofBackTick(m) {
  const S = m.tk;
  if (S.t >= 0.35) { doron(m, 'tanuki'); startRest(m, TUNE.rest[ph(S)], 'sweat'); }
  return false;
}

// --- belly bump (close range)
function startBump(m, tgt) {
  const S = m.tk, T = TUNE.bump, p = m.model.pose; set(S, 'bumpWind');
  S.cds.bump = T.cd * rand(0.9, 1.2); S.gcd = rand(0.4, 0.7);
  S.aim = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z);
  S.tele = S.fx.tele({ shape: 'cone', x: m.pos.x, z: m.pos.z, yaw: S.aim, r: T.R * sc(m), half: T.half, time: T.wind, color: TELE, hold: 0.2 });
  Object.assign(p, { lean: -0.3, belly: 1.25, armLx: 0.3, armLz: -0.7, armRx: 0.3, armRz: 0.7, crouch: 0.2, rate: 10 });
  m.mode.bossTelegraph?.(T.wind); m.mode.bossEngaged?.(m);
  sfx('danza_inhale', m.pos);
}
function bumpTick(m, dt, tgt) {
  const S = m.tk, T = TUNE.bump, p = m.model.pose;
  if (S.st === 'bumpWind') {
    if (S.t < T.wind * 0.5) { const want = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); S.aim += clamp(angleDiff(S.aim, want), -3 * dt, 3 * dt); S.tele.place(m.pos.x, m.pos.z, S.aim); }
    m.facing = dampAngle(m.facing, S.aim, 14, dt);
    if (S.t >= T.wind) {
      S.tele.fire(); set(S, 'bump');
      Object.assign(p, { lean: 0.35, belly: 1.3, armLz: -1.1, armRz: 1.1, crouch: -0.1, rate: 30 });
      m.model.drum();
      const x = m.pos.x, z = m.pos.z, R = T.R * sc(m);
      const inCone = (px, pz, r) => { const dx = px - x, dz = pz - z, dd = Math.hypot(dx, dz); return dd < R + r && (dd < 0.8 || Math.abs(angleDiff(S.aim, Math.atan2(dx, dz))) <= T.half + Math.atan2(r, dd)); };
      if (hitWhere(m, inCone, roll(m, T.dmg), { knock: 0, from: m.pos })) { const P0 = m.G.player, dx = P0.pos.x - x, dz = P0.pos.z - z, L = Math.hypot(dx, dz) || 1; S.push = { x: dx / L, z: dz / L, v: 11, t: 0.32, T: 0.32 }; }
      worldOf(m.model.parts.bellyTip, _v); S.fx.pon(_v.x, _v.y, _v.z, sc(m) * 1.4);
      S.fx.word('BOING!', m.lift(3.2 * sc(m)), { a: '#fff4c8', b: '#ff9a6a', size: 1.9 });
      m.G.engine.rig.shake(0.3); sfx('danza_bump', m.pos);
    }
    return false;
  }
  if (S.t > 0.25 && !(S.flag & 1)) { S.flag |= 1; Object.assign(p, { lean: 0.05, belly: 1, rate: 9 }); }
  if (S.t > 0.55) { set(S, 'idle'); poseIdle(p); }
  return false;
}

// --- his tanuki gang
function startSummon(m) {
  const S = m.tk, p = m.model.pose; set(S, 'summon');
  S.summoned++; m.summoned = S.summoned;
  Object.assign(p, { armRx: -2.4, armRz: 0.2, head: -0.3, tilt: -0.1, armLx: -0.6, armLz: -0.5, rate: 10 }); // leaf to his lips: a leaf whistle
  const hollow = inHollow(S);
  const ids = hollow ? (ARENA_TUNE.waves[S.summoned - 1] || ARENA_TUNE.waves[0]).map(id => pickId([id], 'kuri'))
    : S.summoned === 1 ? [pickId(['tanuki'], 'kuri'), pickId(['kuri'], 'tanuki'), pickId(['kuri'], 'tanuki')] : [pickId(['tanuki'], 'kuri'), pickId(['tanuki'], 'kuri'), pickId(['kuri'], 'tanuki'), pickId(['kakashi', 'kuri'], 'tanuki')];
  S.pending = ids.filter(Boolean); S.spots = [];
  const A = S.arena, W = m.world, rimIn = hollow ? ARENA_TUNE.rim : 1.2;
  for (let i = 0; i < S.pending.length; i++) {
    let x = m.pos.x, z = m.pos.z, ok = false;
    for (let k = 0; k < 14 && !ok; k++) { const a = i / S.pending.length * TAU + rand(-0.4, 0.4), r = hollow ? rand(3.2, 6) : rand(3, 5); x = m.pos.x + Math.sin(a) * r; z = m.pos.z + Math.cos(a) * r; ok = W.walkable(x, z) && Math.hypot(x - A.x, z - A.z) < A.r - rimIn; }
    if (!ok) { const a = rand(0, TAU), r = rand(2, 5); x = A.x + Math.sin(a) * r; z = A.z + Math.cos(a) * r; } // (never out past the ring: pop up in the middle)
    S.spots.push({ x, z }); S.fx.swirl(x, z, 0.85);
  }
  m.G.ui?.toast?.(S.summoned === 1 ? `${m.name} whistles up his tanuki gang!` : S.summoned === 2 && hollow ? `${m.name} calls the root halls' yokai!` : `${m.name} calls the whole hollow!`, { color: '#ffb070', icon: 'oni' });
  m.mode.bossEngaged?.(m);
  sfx('danza_whistleleaf', m.pos);
}
function summonTick(m) {
  const S = m.tk;
  if (S.t > 0.9 && !(S.flag & 1)) {
    S.flag |= 1;
    S.pending.forEach((id, i) => {
      const sp = S.spots[i];
      summonAdds(m, [id], sp.x, sp.z, { r0: 0, r1: 0.6, onEach: (a, x, z) => { const y = m.world.heightAt(x, z); S.fx.doron(x, y + 0.3, z, 0.8); } });
    });
    sfx('danza_doron', m.pos, { pitch: 1.2 });
    Object.assign(m.model.pose, { armRx: -0.4, head: 0, tilt: 0, laugh: 1 });
  }
  if (S.t > 1.5) { set(S, 'idle'); poseIdle(m.model.pose); S.gcd = 0.6; }
  return false;
}

// --- phase 3: the giant
function startGiant(m) {
  const S = m.tk, p = m.model.pose; set(S, 'giant');
  S.ph = 2; m.enraged = true;
  Object.assign(p, { armLx: -2.6, armLz: 0.25, head: -0.55, lean: -0.15, rate: 8 }); // chugs the sake
  m.G.ui?.toast?.(`${m.name} drains his sake… and starts to swell!`, { color: '#ff9a6a', icon: 'oni' });
  m.mode.bossEngaged?.(m);
  sfx('danza_gulp', m.pos);
}
function giantTick(m, dt) {
  const S = m.tk, p = m.model.pose, G = m.G;
  if (S.t > 0.9 && !(S.flag & 1)) { S.flag |= 1; Object.assign(p, { armLx: -0.3, head: 0.1, blush: 1, jaw: 0.5 }); sfx('danza_hic', m.pos); m.emote('anger', 1.2); }
  if (S.t > 1.3 && !(S.flag & 2)) { S.flag |= 2; S.fx.doron(m.pos.x, m.pos.y + 1, m.pos.z, 2.6); S.fx.word('DORON!!', m.lift(4.2), { a: '#fff0e0', b: '#ff7a4a', size: 2.6 }); G.engine.rig.shake(0.7); sfx('danza_grow', m.pos); S.grow0 = m.anim.def.scale; }
  if (S.flag & 2) { // swell up over 0.9 s
    const k = ease.outBack(clamp((S.t - 1.3) / 0.9)), s = S.grow0 + (SCALE * GIANT - S.grow0) * k;
    m.anim.def.scale = s; const f = s / SCALE;
    m.radius = S.baseR * f; m.bodyR = S.baseBR * f; m.height = S.baseH * f; m.shadow.scale.setScalar(f);
  }
  if (S.t > 2.4 && !(S.flag & 4)) { S.flag |= 4; p.laugh = 1; p.jaw = 0; sfx('danza_laugh', m.pos, { pitch: 0.8 }); S.fx.shockRing(m.pos.x, m.pos.z, 1, 8, { life: 0.7, color: '#fff0c8', width: 0.1 }); }
  if (S.t > 3.2) { set(S, 'idle'); poseIdle(p); p.blush = 1; S.gcd = 0.5; S.cds.flop = Math.min(S.cds.flop, 1.5); m._prof = null; }
  return false;
}
// the giant's belly-flop: a leap, a shadow that tracks you, a heavy landing with a shock ring
function startFlop(m, tgt) {
  const S = m.tk, T = TUNE.flop, p = m.model.pose; set(S, 'flopUp');
  S.cds.flop = T.cd * rand(0.9, 1.15); S.gcd = rand(0.6, 0.9); S.last = 'flop'; S.flopTgt = tgt;
  Object.assign(p, { crouch: 0.6, armLx: 0.5, armLz: -0.9, armRx: 0.5, armRz: 0.9, lean: 0.1, rate: 10 });
  m.mode.bossEngaged?.(m);
  sfx('danza_inhale', m.pos, { pitch: 0.8 });
}
function flopTick(m, dt, tgtIn) {
  const S = m.tk, T = TUNE.flop, p = m.model.pose, G = m.G, M = m.mode;
  const tgt = S.flopTgt?.alive !== false && S.flopTgt?.pos ? S.flopTgt : G.player;
  switch (S.st) {
    case 'flopUp':
      if (S.t >= T.crouch) {
        set(S, 'flopTrack'); S.air = true; M.combat.remove(m); m.untargetable = true;
        S.fx.crash(m.pos.x, m.pos.z, 2, { leaves: true, light: false }); G.engine.rig.shake(0.3); sfx('danza_hop', m.pos, { pitch: 0.7 });
        Object.assign(p, { crouch: -0.15, armLz: -1.6, armRz: 1.6, lean: 0.25, direct: 0 });
        S.fx0 = m.pos.x; S.fz0 = m.pos.z; S.shx = tgt.pos.x; S.shz = tgt.pos.z;
        S.tele = S.fx.tele({ shape: 'disc', x: S.shx, z: S.shz, r: T.r, time: T.track + T.lock, color: TELE, blob: 0.2, hold: 0.3 });
        M.bossTelegraph?.(T.track + T.lock);
      }
      return false;
    case 'flopTrack': case 'flopLock': {
      const tot = T.track + T.lock, k = clamp(S.t / tot);
      if (S.st === 'flopTrack') {
        const f = 1 - Math.exp(-4 * dt); S.shx += (tgt.pos.x - S.shx) * f; S.shz += (tgt.pos.z - S.shz) * f;
        if (inHollow(S)) { const A = S.arena, ox = S.shx - A.x, oz = S.shz - A.z, od = Math.hypot(ox, oz), lim = A.r - ARENA_TUNE.rim; if (od > lim) { S.shx = A.x + ox / od * lim; S.shz = A.z + oz / od * lim; } } // (never lands him off the ring)
        S.tele.place(S.shx, S.shz);
        if (S.t >= T.track) { S.st = 'flopLock'; sfx('danza_fall', m.pos); }
      }
      S.tele.m.material.uniforms.uBlob.value = 0.2 + 0.7 * k;
      // he sails over in a high arc toward the shadow
      const e = ease.inOutQuad(k);
      _p.copy(m.pos); m.pos.x = S.fx0 + (S.shx - S.fx0) * e; m.pos.z = S.fz0 + (S.shz - S.fz0) * e;
      p.direct = Math.sin(k * Math.PI) * 1.25; // (model units: ~4 m up at giant scale)
      m.facing = dampAngle(m.facing, Math.atan2(S.shx - S.fx0 + 1e-4, S.shz - S.fz0), 6, dt);
      if (S.t >= tot) flopLand(m);
      return false;
    }
    case 'flopLand':
      if (S.t > 0.3 && !(S.flag & 1)) { S.flag |= 1; Object.assign(p, { crouch: 0.2, lean: 0.1 }); }
      if (S.t >= 0.6) startRest(m, TUNE.rest[2] + 0.3, 'dizzy');
      return false;
  }
  return false;
}
function flopLand(m) {
  const S = m.tk, T = TUNE.flop, p = m.model.pose, G = m.G, M = m.mode;
  S.air = false; m.untargetable = false; M.combat.add(m);
  set(S, 'flopLand'); p.direct = -1; m.model.cur.hop = 0;
  Object.assign(p, { crouch: 0.75, lean: 0.35, armLz: -1.2, armRz: 1.2, rate: 30 });
  S.tele.fire();
  const x = m.pos.x, z = m.pos.z, P0 = G.player;
  if (hitWhere(m, (px, pz, r) => Math.hypot(px - x, pz - z) < T.r + r, roll(m, T.dmg), { knock: 0, from: m.pos }) && P0) { const dx = P0.pos.x - x, dz = P0.pos.z - z, L = Math.hypot(dx, dz); S.push = { x: L > 0.05 ? dx / L : 1, z: L > 0.05 ? dz / L : 0, v: 11, t: 0.3, T: 0.3 }; }
  S.fx.crash(x, z, T.r);
  const ring = S.fx.shock({ x, z, r0: T.r * 0.8, r1: inHollow(S) ? ARENA_TUNE.flopR1 : 9, speed: 7.5, w: 1.0, h: 0.7, gapA: Math.atan2(P0 ? P0.pos.x - x : 0, P0 ? P0.pos.z - z : 1) + rand(-2.4, 2.4), gapW: 0.5, color: '#ff9a44', hot: '#fffbe8' });
  ring.hits = []; S.rings.push(ring);
  S.fx.word('DOSUN!', m.lift(4), { a: '#fff4c8', b: '#ff8a4a', size: 2.4 });
  G.engine.rig.shake(1.0); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.07);
  sfx('danza_slam', m.pos);
}

// ------------------------------------------------------------------ per-frame upkeep (runs every frame while alive)
function update(m, dt) {
  const S = m.tk; if (!S) return;
  const G = m.G, p = m.model.pose;
  if (!m.aggro) { // sitting in his clearing, sipping sake; the default idle wander is undone
    m.pos.x = S.home.x; m.pos.z = S.home.z; m.facing = S.homeFace;
    S.sipT -= dt;
    if (S.sipT <= 0) { S.sipT = rand(3, 4.5); S.sipOn = 1.1; Object.assign(p, { armLx: -2.4, armLz: 0.35, head: -0.35 }); }
    if (S.sipOn > 0 && (S.sipOn -= dt) <= 0) { Object.assign(p, { armLx: -0.2, armLz: -0.2, head: 0.1 }); if (Math.random() < 0.5) { sfx('danza_hic', m.pos, { vol: 0.5 }); S.fx.wisps(m.pos.x, m.pos.y + 2.3, m.pos.z + 0.3, { n: 2, color: MCOL.sake, size: 0.25 }); } }
    if (Math.random() < dt * 1.5) S.fx.p('n', F.MAPLE, m.pos.x + rand(-1.6, 1.6), m.pos.y + rand(2, 3), m.pos.z + rand(-1.6, 1.6), { vx: rand(-0.3, 0.3), vy: -0.45, vz: rand(-0.3, 0.3), life: 3, size: 0.3, color: MCOL.maple[(Math.random() * 4) | 0], alpha: 1, alpha1: 0, spin: 1.5 });
    return;
  }
  if (!S.ranAI && TIMED.has(S.st)) tick(m, dt, S.lastTgt?.alive !== false && S.lastTgt?.pos ? S.lastTgt : G.player, 5, 1);
  S.ranAI = false;
  for (const k in S.cds) S.cds[k] -= dt;
  updateRings(m);
  if (S.push) { const q = S.push; q.t -= dt; if (q.t <= 0) S.push = null; else pushPlayer(G, q.x, q.z, q.v * (0.35 + 0.65 * q.t / q.T)); }
  if (ph(S) === 2 && S.form === 'tanuki' && Math.random() < dt * 2) { worldOf(m.model.parts.head, _v); S.fx.wisps(_v.x + rand(-0.4, 0.4), _v.y + 0.9, _v.z, { n: 1, color: MCOL.sake, size: 0.35, up: 1 }); } // tipsy steam off his head
}

function onSpawn(m) {
  const home = { x: m.pos.x, z: m.pos.z };
  const fx = mapleFx(m.G.vfx, m.world);
  const A = arenaOf(m, home);
  m.tk = { st: 'sit', t: 0, flag: 0, ph: 0, home, homeFace: Math.atan2(A.x - home.x + 0.01, A.z - home.z + 6), arena: A, fx,
    cds: { drum: 1.2, rock: 4.5, kettle: 7.5, bump: 2, flop: 3 }, gcd: 0.5, strafe: 1, strafeT: 2, summoned: 0, rings: [], opts: [], last: null, form: 'tanuki',
    ranAI: false, air: false, push: null, sipT: rand(0.5, 2), sipOn: 0, rollId: 1, baseR: m.radius, baseBR: m.bodyR, baseH: m.height };
  m.facing = m.tk.homeFace;
  Object.assign(m.model.pose, { sit: 1, armLx: -0.2, armLz: -0.2, armRx: -0.2, armRz: 0.3, head: 0.1 });
  fx.warm();
  // the model's own materials go with it (Monster.dispose frees the geometry)
  const base = m.dispose;
  m.dispose = function () { base.call(this); for (const mt of this.model.mats || []) mt.dispose(); };
}
function onDeath(m) {
  const S = m.tk; if (!S) return;
  for (const R of S.rings) R.done = true; S.rings.length = 0;
  if (S.jet) S.jet.on = false;
  if (S.air) { S.air = false; m.untargetable = false; }
  S.tele?.kill?.();
  const p = m.model.pose; poseIdle(p); p.form = 'tanuki'; p.jaw = 0.8; p.direct = -1; m.model.cur.hop = 0;
  const x = m.pos.x, y = m.pos.y, z = m.pos.z, s = sc(m);
  S.fx.doron(x, y + 0.8 * s, z, 1.1 * s); // (kept light: the victory frame must stay readable)
  S.fx.leaves(x, y + 1.5 * s, z, { n: 18, speed: 5, up: 4, life: 2 });
  S.fx.word('POKO…', m.lift(3.4 * s), { a: '#fff4c8', b: '#c8a07a', size: 2 });
  sfx('danza_defeat', m.pos);
}

export const BUILD = { danzaburo: buildDanzaburo };

export const MONSTERS = {
  danzaburo: {
    name: 'Danzaburō the Leaf-Shifter', build: 'danzaburo', boss: true, subtitle: 'A thousand tricks, one very round belly!',
    adds: ['tanuki', 'kuri', 'kakashi', 'momijiWisp', 'tesso'], // (his gang in the Maple Roots' hall: dungeon/zoneRun.js warms them with the floor)
    scale: SCALE, radius: 1.05, vr: 1.2, speed: 2.3, life: 1, dmg: 1, move: 'none', attack: { type: 'melee', range: 1.6, cd: 3, windup: 0.6 },
    variants: [{}], material: 'stone',
    stats: { name: 'Danzaburō', life: 1.05, dmg: 1.0, def: 1.0, speed: 1.0, xp: 1.4, element: 'phys', res: { stink: 20, frost: -10, zap: 10 } },
    ai(m, dt, target, d, slowMul) { const S = m.tk; if (!S) return false; S.ranAI = true; S.lastTgt = target; return tick(m, dt, target, d, slowMul); },
    update, onSpawn, onDeath,
    damageTaken: (m, dmg) => {
      const S = m.tk; if (!S) return dmg;
      if (S.air) return 0;
      if (S.form === 'rock') { const t = m.G.engine?.time || 0; if (t - (S.clunkT || -9) > 0.3) { S.clunkT = t; sfx('danza_clunk', m.pos); } return dmg * 0.35; } // stone
      return dmg;
    },
    // test hooks: force a move right now (window.mons[0].def.debug.drum(window.mons[0]))
    debug: {
      drum: m => { set(m.tk, 'idle'); poseIdle(m.model.pose); startDrum(m, m.G.player); },
      rock: m => { set(m.tk, 'idle'); poseIdle(m.model.pose); startLeaf(m, m.G.player, 'rock'); },
      kettle: m => { set(m.tk, 'idle'); poseIdle(m.model.pose); startLeaf(m, m.G.player, 'kettle'); },
      bump: m => { set(m.tk, 'idle'); startBump(m, m.G.player); },
      summon: m => { set(m.tk, 'idle'); startSummon(m); },
      phase2: m => { m.life = Math.min(m.life, m.lifeMax * 0.6); m.tk.ph = 1; m.tk.summoned = Math.max(m.tk.summoned, 1); },
      giant: m => { m.life = Math.min(m.life, m.lifeMax * 0.3); m.tk.summoned = 2; set(m.tk, 'idle'); startGiant(m); },
      flop: m => { set(m.tk, 'idle'); startFlop(m, m.G.player); },
      state: m => ({ st: m.tk.st, ph: m.tk.ph, form: m.tk.form, cds: { ...m.tk.cds }, rings: m.tk.rings.length, air: m.tk.air, life: Math.round(m.life), lifeMax: m.lifeMax, lvl: m.level, scale: m.anim.def.scale }),
    },
  },
};
