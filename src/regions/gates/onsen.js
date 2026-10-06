// The Onsen Caverns' gate look (regions/dungeonGate.js; docs/ZONES.md §8.2; the format: ./bamboo.js): an ice-cave mouth
// in a snowy cliff. Dark slate boulders under deep snow, the throat glazed with blue ice, frozen flows down the jambs,
// a fringe of icicles round the arch, a vermilion snow torii before it, yukimi lanterns, and a little hot spring
// steaming at its foot (the warm pocket the caverns below are full of). Snow firs crowd the cliff.
import * as THREE from 'three';
import * as F from '../assets/onsenFlora.js';
import * as Pr from '../assets/onsenProps.js';
import { kit } from '../assets/bambooProps.js';
import { G as BG } from '../../world/buildings/kit.js';
import { puff, tube } from '../../gfx/geom.js';
import { clamp, mulberry32 } from '../../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const SNOW = C('#f4f8ff'), _c = new THREE.Color(), _d = new THREE.Color();
const cache = new Map();
/** dark slate rock with the snow lying thick on everything that faces up */
const rockSnow = (amt = 1) => (p, n, o) => { o.set('#4a5468').lerp(_c.set('#7a869e'), clamp(n.y * 0.5 + 0.45 + Math.sin(p.x * 3.1 + p.z * 2.3) * 0.1)); if (Math.sin(p.y * 6.5 + p.x * 0.8) > 0.6) o.multiplyScalar(0.86); F.snowOn(o, V(0, n.y + Math.sin(p.x * 4.7 + p.z * 3.9) * 0.14, 0), amt, 0.36, 0.66); }; // (strata bands, snow only on what really faces up)
const iceP = (y0, h) => (p, n, o) => { const t = clamp((p.y - y0) / h); o.set('#6a9ed8').lerp(_c.set('#d8eeff'), t * 0.55 + clamp(n.z * 0.4 + 0.2) * 0.35).multiplyScalar(0.88 + 0.16 * clamp(n.y * 0.4 + 0.6)); };
const pillow = (B, p, r, sq = 0.4, seed = 0) => { const g = puff(V(0, 0, 0), r, { detail: 1, noise: 0.22, squash: sq, seed }); g.translate(p[0], p[1], p[2]); B.add(g, (q, n, o) => o.copy(SNOW).lerp(_d.set('#b8c8e4'), clamp(0.45 - n.y) * 0.8)); };
/** the cave mouth (local: +z faces out) */
function iceMouth(seed = 0) {
  if (cache.has(seed)) return cache.get(seed);
  const pc = kit(seed * 17 + 5, B => {
    const r = mulberry32(seed * 7 + 3);
    const rock = (c, R, o = {}) => { const g = puff(V(0, 0, 0), R, { detail: 2, noise: 0.3, squash: o.sq ?? 0.9, seed: seed + (o.s || 0) }); if (o.sc) g.scale(...o.sc); g.translate(...c); B.add(g, rockSnow(o.snow ?? 1)); };
    rock([0, 1.7, -2.7], 3.2, { sq: 0.74, s: 1, sc: [1.3, 1, 0.8] });       // the cliff mass behind
    rock([-2.4, 1.15, -0.55], 1.45, { sq: 1.15, s: 2, snow: 0.8 });          // the left jamb
    rock([2.35, 1.05, -0.5], 1.4, { sq: 1.1, s: 3, snow: 0.8 });             // the right jamb
    rock([0, 3.2, -0.7], 1.55, { sq: 0.62, s: 4, sc: [1.55, 1, 0.9] });      // the lintel boulder
    rock([-1.35, 3.05, -1.2], 1.0, { sq: 0.8, s: 5 }); rock([1.45, 2.95, -1.3], 0.95, { sq: 0.8, s: 6 });
    for (const [x, z, R, s] of [[-3.35, 0.6, 0.62, 7], [3.25, 0.7, 0.55, 8], [-1.65, 0.9, 0.36, 9], [1.75, 1.0, 0.32, 10], [-3.95, -0.6, 0.78, 11], [3.85, -0.5, 0.72, 12]]) rock([x, R * 0.4, z], R, { sq: 0.75, s });
    // the throat: a hollow going back into the rock, glazed with ice that glows faintly blue far inside
    let th = BG.sph(1, 14, 10); if (th.index) th = th.toNonIndexed(); th.scale(1.22, 1.5, 1.7); th.translate(0, 1.15, -1.25);
    { const p = th.attributes.position; for (let i = 0; i < p.count; i += 3) { const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az); } th.computeVertexNormals(); }
    B.add(th, (p, n, o) => o.set('#0e1626').lerp(_c.set('#3a5a86'), clamp((p.z + 0.2) * 0.9 + 0.3) * (0.7 + 0.3 * Math.sin(p.y * 5 + p.x * 3))));
    // the mouth: a dark arch (deepest in the middle), a thick rim of blue ice round it
    const w = 1.05, h = 1.55;
    { const sh = new THREE.Shape(); sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.absarc(0, h, w, Math.PI, 0, true); sh.lineTo(w, 0); sh.lineTo(-w, 0);
      const mg = new THREE.ShapeGeometry(sh, 16); mg.translate(0, 0.02, 0.06);
      B.add(mg, (p, n, o) => { const k = clamp(Math.hypot(p.x / w, (p.y - 1.1) / 1.6)); o.set('#081020').lerp(_c.set('#34507a'), k * k * 0.9); });
      const lip = new THREE.TorusGeometry(1.1, 0.13, 7, 22, Math.PI); lip.translate(0, 1.57, 0.08); B.add(lip, (p, n, o) => o.set('#7fb2e6').lerp(_c.set('#e4f4ff'), clamp(n.y * 0.6 + n.z * 0.3 + 0.2)));
      for (const sx of [-1, 1]) { const jl = BG.cyl(0.12, 0.15, 1.6, 7); jl.translate(sx * 1.1, 0.8, 0.08); B.add(jl, iceP(0, 1.6)); }
      // the icicle fringe hanging from the arch: longest at the crown
      for (let i = 0; i < 17; i++) { const a = Math.PI * (0.06 + 0.88 * i / 16), x = Math.cos(a) * 1.12, y = 1.57 + Math.sin(a) * 1.12, L = (0.18 + Math.sin(a) * 0.45) * (0.6 + r() * 0.6), ic = BG.cone(0.045 + L * 0.04, L, 5); ic.rotateX(Math.PI); ic.translate(x, y - 0.08 - L / 2, 0.16); B.add(ic, iceP(y - L, L)); }
    }
    // frozen flows down the jambs' faces
    for (const [x0, top] of [[-1.7, 2.3], [-2.05, 1.9], [1.75, 2.2], [2.15, 1.7], [-0.6, 2.6], [0.75, 2.55]]) {
      const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(x0 + Math.sin(t * 4 + x0) * 0.05, top - t * top * 0.95, 0.42 + Math.abs(x0) * 0.05 + Math.sin(t * Math.PI) * 0.1 - (Math.abs(x0) < 1 ? 0.25 : 0)), r: 0.1 * (1 - t * 0.55) }); }
      if (Math.abs(x0) < 1) { pts.length = 3; } // (over the arch: short drips)
      B.add(tube(pts, 6, true), iceP(0, top));
    }
    // worn steps up to the mouth, snow on them; snow heaped on the lintel and drifted against the jambs
    for (let k = 0; k < 3; k++) { const s = BG.box(2.2 - k * 0.3, 0.14, 0.55, 0.05); s.translate(0, 0.07 + k * 0.1, 0.9 - k * 0.45); B.add(s, (p, n, o) => { o.set('#8a92a6').multiplyScalar(n.y > 0.5 ? 1 : 0.8); if (n.y > 0.5 && Math.sin(p.x * 5 + k) > -0.2) o.lerp(SNOW, 0.75); }); }
    for (let k = 0; k < 9; k++) { const x = -1.8 + k * 0.45; pillow(B, [x, 3.62 - Math.abs(x) * 0.25, 0.28 + (k % 2) * 0.12], 0.3 + (k % 3) * 0.07, 0.42, seed + k); }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) pillow(B, [sx * (1.7 + k * 0.7), 0.06, 0.85 - k * 0.3], 0.5 - k * 0.08, 0.38, seed + 20 + k + sx * 3);
  }, 0.012);
  cache.set(seed, pc);
  return pc;
}
/** a little hot spring for the gate's foot: the rock ring and a disc of milky-blue water (local, y = 0 at the rim) */
function gateSpring(seed = 0, R = 1.15) {
  const k = 'spring:' + seed + ':' + R; if (cache.has(k)) return cache.get(k);
  const water = kit(seed + 41, B => {
    const g = BG.disc(R + 0.08, 22); g.rotateX(-Math.PI / 2); g.translate(0, 0.07, 0);
    B.add(g, (p, n, o) => { const d = Math.hypot(p.x, p.z) / R; o.set('#205a78').lerp(_c.set('#78c0d4'), clamp(d * d)); }, 'water');
  }, 0);
  const out = { rim: Pr.springRim(seed, R, { spout: true }), water };
  cache.set(k, out);
  return out;
}

export const ONSEN_GATE = {
  seal: '#bfe8ff',
  lanternI: 1.6, // (dungeonGate's lantern lights when it opens: soft, the snow would blow out under the full 4.5)
  glb: { url: null, scale: 1, yaw: 0, y: 0 },
  build({ main, dress, lp, gx, gz, yaw, rim, W }) {
    main.piece(iceMouth(0), gx, gz, yaw, { y: rim - 0.15 });
    { const [x, z] = lp(0, 1.75); dress.piece(Pr.snowTorii(4, { w: 3.0, h: 3.1 }), x, z, yaw, { y: rim }); for (const e of [-1, 1]) { const [px, pz] = lp(e * 1.5, 1.75); W.collision.addCircle(px, pz, 0.22); } }
    const lanterns = [];
    for (const e of [-1, 1]) { const [x, z] = lp(e * 2.6, 1.6); dress.piece(Pr.yukimiLantern(26 + e, { s: 0.92 }), x, z, yaw, { y: rim, lights: false }); W.collision.addCircle(x, z, 0.5); lanterns.push(V(x, rim + 1.2, z)); }
    // the hot spring steaming at the gate's foot, off to the right, a bench and oke by it
    const [sx, sz] = lp(3.6, 2.9), sp = gateSpring(0, 1.15), sy = W.heightAt(sx, sz);
    dress.piece(sp.rim, sx, sz, yaw + 0.6, { y: sy }); dress.piece(sp.water, sx, sz, 0, { y: sy });
    W.collision.addCircle(sx, sz, 1.35);
    W.weather?.steam?.([{ x: sx, z: sz, y: sy + 0.12, r: 0.75 }], { puffs: 9, size: 1.2, alpha: 0.3 });
    { const [x, z] = lp(2.3, 3.5); dress.piece(Pr.oke(1), x, z, yaw + 0.8, { y: W.heightAt(x, z) }); }
    // snow firs crowding the cliff behind, camellia bushes and frost grass at its foot
    for (const [lx, lz, H, s] of [[-4.2, -2.4, 5.4, 1], [-2.6, -3.6, 6.2, 1.1], [3.3, -3.0, 5.8, 1], [4.7, -1.6, 4.6, 0.9], [-5.0, -0.4, 4.2, 0.85]]) { const [x, z] = lp(lx, lz); dress.multi(F.snowFir(Math.abs(Math.round(lx * 3)) % 4, { H }), x, W.heightAt(x, z) + 0.6, z, { rot: lx, s }); }
    for (const [lx, lz, fl] of [[-3.1, 1.2, 'camellia'], [-4.0, 0.3, ''], [2.6, 0.6, 'camellia']]) { const [x, z] = lp(lx, lz); dress.multi(F.snowBush(Math.abs(Math.round(lx * 5)) % 3, fl), x, W.heightAt(x, z), z, { rot: lz, s: 0.9 }); W.collision.addCircle(x, z, 0.45); }
    for (const [lx, lz] of [[-1.3, 1.4], [1.2, 1.3], [-2.4, 2.2], [4.9, 2.2], [1.6, 2.8]]) { const [x, z] = lp(lx, lz); dress.multi(F.frostGrass(Math.abs(Math.round(lx * 7)) % 4), x, W.heightAt(x, z), z, { rot: lx }); }
    return { lanterns, colliders: [[-2.4, -0.55, 1.3], [2.35, -0.5, 1.25], [0, -2.2, 2.6], [-3.35, 0.6, 0.55], [3.25, 0.7, 0.5], [0, -0.6, 1.0]], mouth: { lz: 0.2, w: 2.5, h: 2.7 } };
  },
};
