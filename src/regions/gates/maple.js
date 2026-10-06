// The Maple Roots' gate look (regions/dungeonGate.js; docs/ZONES.md §8.2; format: ./bamboo.js): a hollow in the
// hillside under a great crimson maple, its roots spilling down the bank and arching over the dark mouth (a shimenawa
// with shide strung across them), a vermilion torii before it, red paper lanterns on posts, two jizō in red bibs, leaf
// drifts and mushrooms round the foot.
import * as THREE from 'three';
import * as F from '../assets/mapleFlora.js';
import * as Pr from '../assets/mapleProps.js';
import * as BF from '../assets/bambooFlora.js';
import * as BP from '../assets/bambooProps.js';
import { G as BG } from '../../world/buildings/kit.js';
import { mossyStone, lanternPost } from '../../world/buildings/props.js';
import { shimenawa } from '../../world/buildings/props2.js';
import { puff, tube, paint } from '../../gfx/geom.js';
import { clamp, TAU, mulberry32 } from '../../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const cache = new Map();
const len = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].p.distanceTo(pts[i - 1].p); return L; };
/** a root tube with bark furrows along it, a lit crown, leaves caught on its top (as the dungeon kit's roots) */
function bark(pts, { radial = 8, cap = true, leafy = 0.1, seed = 0 } = {}) {
  const g = tube(pts, radial, cap), uv = g.attributes.uv, L = len(pts), a = C('#4a3424'), b = C('#9a7656'), l0 = C('#c8402c'), l1 = C('#f0a03a'), mc = C('#525e2c');
  return paint(g, (p, n, o, i) => {
    const fur = Math.sin(uv.getX(i) * TAU * 4 + Math.sin(uv.getY(i) * L * 1.7 + seed) * 1.6 + seed);
    o.copy(a).lerp(b, clamp(0.42 + 0.3 * fur + n.y * 0.24));
    const top = n.y + Math.sin(p.x * 3.3 + p.z * 2.9 + seed) * 0.25;
    if (top > 0.72) o.lerp(mc, 0.45);
    if (top > 0.7 && Math.sin(p.x * 23 + p.z * 19 + p.y * 7 + seed) > 1 - leafy) o.copy(l0).lerp(l1, Math.sin(p.x * 41 + p.z * 13) * 0.5 + 0.5);
  });
}
/** the hollow under the roots (local: +z faces out) */
function rootHollow(seed = 0) {
  if (cache.has(seed)) return cache.get(seed);
  const pc = BP.kit(seed * 17 + 5, B => {
    const r = mulberry32(seed * 31 + 7);
    // the bank: earth and stone heaped behind and round the mouth, fallen leaves drifted over its tops
    const stone = ['#7e706a', '#aa9c90'], mound = (c, rr, o = {}) => { const g = puff(V(0, 0, 0), rr, { detail: 2, noise: 0.3, squash: o.sq ?? 0.9, seed: seed + (o.s || 0) }); if (o.sc) g.scale(...o.sc); g.translate(...c); B.add(mossyStone(g, { amt: o.leaf ?? 0.62, sc: 1.6 / rr, seed: seed + (o.s || 0), lift: rr * 0.05, stone, moss: '#9a3a26', hi: '#c8642e' }), null); };
    mound([0, 1.5, -2.7], 3.2, { sq: 0.72, s: 1, sc: [1.3, 1, 0.8], leaf: 0.5 });       // the hill behind
    mound([-2.4, 1.05, -0.6], 1.45, { sq: 1.1, s: 2, leaf: 0.5 });          // the left jamb
    mound([2.35, 0.98, -0.55], 1.38, { sq: 1.05, s: 3, leaf: 0.5 });        // the right jamb
    mound([0, 2.95, -0.95], 1.3, { sq: 0.6, s: 4, sc: [1.5, 1, 0.9], leaf: 0.5 }); // the lintel
    for (const [x, z, rr, s] of [[-3.4, 0.6, 0.6, 7], [3.3, 0.7, 0.55, 8], [-1.7, 0.9, 0.36, 9], [1.8, 1.0, 0.32, 10], [-4.0, -0.6, 0.75, 11], [3.9, -0.5, 0.7, 12]]) mound([x, rr * 0.4, z], rr, { sq: 0.75, s, leaf: 0.55 });
    // the throat: a dark hollow going back under the roots (inside faces, darkening with depth)
    let th = BG.sph(1, 14, 10); if (th.index) th = th.toNonIndexed(); th.scale(1.22, 1.5, 1.7); th.translate(0, 1.15, -1.25);
    { const p = th.attributes.position; for (let i = 0; i < p.count; i += 3) { const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az); } th.computeVertexNormals(); }
    B.add(th, (p, n, o) => o.set('#1a120e').lerp(C('#4a3628'), clamp((p.z + 0.2) * 0.9 + 0.3)));
    { const sh = new THREE.Shape(); const w = 1.05, h = 1.55; sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.absarc(0, h, w, Math.PI, 0, true); sh.lineTo(w, 0); sh.lineTo(-w, 0);
      const mg = new THREE.ShapeGeometry(sh, 16); mg.translate(0, 0.02, 0.06);
      B.add(mg, (p, n, o) => { const k = clamp(Math.hypot(p.x / w, (p.y - 1.1) / 1.6)); o.set('#0e0a08').lerp(C('#4a3626'), k * k * 0.9); }); }
    // the great roots: two pour down the bank from the tree above and arch over the mouth, crossing at its crown
    for (const e of [-1, 1]) {
      const pts = [], N = 12;
      for (let k = 0; k <= N; k++) {
        const t = k / N, a = t * Math.PI;
        const x = -e * Math.cos(a) * 1.55 + e * Math.sin(t * Math.PI * 2) * 0.12, y = t < 0.5 ? 0.02 + Math.sin(a) * 2.75 : Math.sin(a) * 2.75 + (t - 0.5) * 2.2;
        pts.push({ p: V(x * 1.08, y - 0.12, 0.3 + Math.sin(a) * 0.14 - (t > 0.55 ? (t - 0.55) * 2.6 : 0)), r: 0.3 - 0.07 * Math.sin(a) + (t > 0.85 ? (t - 0.85) * 0.5 : 0) });
      }
      pts.push({ p: V(e * 1.6, 4.0, -2.0), r: 0.34 }); // up the bank to the trunk
      B.add(bark(pts, { radial: 9, leafy: 0.12, seed: seed + e }), null);
      for (let k = 0; k < 3; k++) { const a = (r() - 0.5) * 1.3 + (e > 0 ? 0 : Math.PI), x0 = -e * 1.55; B.add(bark([{ p: V(x0, 0.12, 0.25), r: 0.1 }, { p: V(x0 + Math.cos(a) * 0.55, 0.05, 0.25 + Math.sin(a) * 0.55), r: 0.06 }, { p: V(x0 + Math.cos(a) * 1.0, -0.05, 0.25 + Math.sin(a) * 1.0), r: 0.016 }], { radial: 5, seed: k }), null); }
      for (let k = 0; k < 3; k++) { const x = e * (2.0 + k * 0.6), pts2 = [{ p: V(x, 3.4 - k * 0.5, -1.4 - k * 0.2), r: 0.14 }, { p: V(x + e * 0.4, 1.8 - k * 0.3, -0.7), r: 0.1 }, { p: V(x + e * 0.6, 0.15, -0.1 + k * 0.2), r: 0.07 }, { p: V(x + e * 0.75, -0.1, 0.2 + k * 0.2), r: 0.02 }]; B.add(bark(pts2, { radial: 6, seed: k + 5 }), null); }
    }
    for (let k = 0; k < 9; k++) { // hair roots dangling from the crown of the arch, over the mouth
      const x = (k / 8 - 0.5) * 2.0, y0 = 2.62 - Math.abs(x) * 0.35, L = 0.3 + r() * 0.55;
      B.add(bark([{ p: V(x, y0, 0.32), r: 0.028 }, { p: V(x + (r() - 0.5) * 0.12, y0 - L * 0.6, 0.36), r: 0.016 }, { p: V(x + (r() - 0.5) * 0.18, y0 - L, 0.38), r: 0.005 }], { radial: 3, leafy: 0 }), null);
    }
    // a shimenawa strung across the roots under the crown, hung with shide; worn steps up to the mouth
    shimenawa(B, { w: 2.5, y: 2.3, sag: 0.3, z: 0.4, r: 0.07 });
    for (let k = 0; k < 4; k++) { const x = (k / 3 - 0.5) * 1.8; B.at([x, 2.12 - Math.abs(x) * 0.1, 0.44], 0, () => { for (let j = 0; j < 3; j++) { const pl = BG.plane(0.09, 0.11); pl.translate(j % 2 ? 0.028 : -0.028, -0.06 - j * 0.1, 0.01); B.cloth(pl, '#ffffff', { x0: -0.07, x1: 0.07, yTop: 0, yBot: -0.34 }); } }); }
    for (let k = 0; k < 3; k++) { const s = BG.box(2.2 - k * 0.3, 0.14, 0.55, 0.05); s.translate(0, 0.07 + k * 0.1, 0.95 - k * 0.45); B.add(s, (p, n, o) => { o.set('#b0a090').multiplyScalar(n.y > 0.5 ? 1 : 0.82); if (n.y > 0.5 && Math.sin(p.x * 6 + k) > 0.45) o.lerp(C('#c8502c'), 0.55); }); }
  }, 0.015);
  cache.set(seed, pc);
  return pc;
}
const lampPost = seed => { const k = 'post:' + seed; if (!cache.has(k)) cache.set(k, BP.kit(seed * 7 + 3, B => lanternPost(B, { h: 1.85, color: '#d8402e' }), 0.008)); return cache.get(k); };

export const MAPLE_GATE = {
  seal: '#ffc884',
  glb: { url: null, scale: 1, yaw: 0, y: 0 },
  build({ main, dress, lp: lp0, gx, gz, yaw, rim, W }) {
    // (the hollow stands 1.2 m in from the gate's usual spot: the harvest clearing's far rim — its barrel pyramid and
    // lantern line (regions/biomes/maple.js) and the trees beyond — then sits inside and behind the bank, not in the
    // mouth, and the mouth reads clear under the trees)
    const BACK = 1.2, lp = (lx, lz) => lp0(lx, lz + BACK);
    const [hx, hz] = lp(0, 0), y0 = Math.max(rim, W.heightAt(hx, hz));
    main.piece(rootHollow(0), hx, hz, yaw, { y: y0 - 0.15 });
    { const [x, z] = lp(-3.7, -2.2); dress.multi(F.maple('weep', 1, 'scarlet'), x, W.heightAt(x, z) + 0.5, z, { rot: 1.3, s: 0.85 }); }
    { const [x, z] = lp(0, 1.85); dress.piece(BP.torii(6, { w: 3.0, h: 3.1 }), x, z, yaw, { y: W.heightAt(x, z) }); for (const e of [-1, 1]) { const [px, pz] = lp(e * 1.5, 1.85); W.collision.addCircle(px, pz, 0.22); } }
    const lanterns = [];
    for (const e of [-1, 1]) { // red paper lanterns on posts, their arms reaching in toward the path
      const [x, z] = lp(e * 2.6, 1.5), y = W.heightAt(x, z); dress.piece(lampPost(e + 2), x, z, yaw - e * Math.PI / 2, { y, lights: false }); W.collision.addCircle(x, z, 0.22);
      const [lx, lz] = lp(e * 2.26, 1.5); lanterns.push(V(lx, y + 1.45, lz));
    }
    for (const e of [-1, 1]) { const [x, z] = lp(e * 1.9, 0.9); dress.piece(Pr.jizo(e + 3), x, z, yaw - e * 0.35, { y: W.heightAt(x, z) }); W.collision.addCircle(x, z, 0.28); }
    for (const [lx, lz, R] of [[-3.0, 1.2, 0.8], [3.1, 1.3, 0.7], [-1.0, 1.6, 0.45], [3.6, 0.0, 0.6]]) { const [x, z] = lp(lx, lz); dress.multi(F.leafPile(Math.abs(lx * 3) % 4 | 0, { R, h: R * 0.42, dye: 'mixed' }), x, W.heightAt(x, z) - 0.03, z, { rot: lz }); }
    for (const [lx, lz, kind] of [[-2.3, 1.9, 'shiitake'], [2.5, 2.1, 'amanita'], [1.2, 1.4, 'shimeji']]) { const [x, z] = lp(lx, lz); dress.multi(F.mushrooms(Math.abs(lx * 2) % 4 | 0, kind), x, W.heightAt(x, z), z, { rot: lx }); }
    for (const [lx, lz] of [[-3.4, 2.2], [0.6, 2.5], [3.2, 2.6]]) { const [x, z] = lp(lx, lz); dress.multi(BF.litter(Math.abs(lx * 5) % 4 | 0, 'maple'), x, W.heightAt(x, z) + 0.01, z, { rot: lz * 2, s: 1.3 }); }
    return { lanterns, colliders: [[-2.4, -0.6, 1.3], [2.35, -0.55, 1.25], [0, -2.3, 2.7], [-3.4, 0.6, 0.55], [3.3, 0.7, 0.5], [0, -0.6, 1.0], [-1.55, 0.25, 0.3], [1.55, 0.25, 0.3]].map(([x, z, r]) => [x, z + BACK, r]), mouth: { lz: 0.24 + BACK, w: 2.5, h: 2.7 } };
  },
};
