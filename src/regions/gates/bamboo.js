// The Bamboo Depths' gate look (regions/dungeonGate.js; docs/ZONES.md §8.2): a mossy cave mouth in a rock outcrop with
// bamboo on top, a weathered torii, a shimenawa across the mouth, two stone lanterns, ferns.
// A gate look = { build(ctx) → { lanterns, colliders, mouth }, seal, glb }:
//   ctx: { main (Placer: the gate's own mass, hidden when its Blender model arrives), dress (Placer: torii, lanterns,
//          flora), lp(lx, lz) → [x, z] (gate-local → world; local +z faces out of the gate, toward the camera), gx, gz,
//          yaw, rim (ground height at the mouth), W (the RegionWorld), V }
//   → lanterns: world points of the lantern fires (lit when the gate opens); colliders: [[lx, lz, r], …] in gate-local
//     metres (also closed in the monsters' grid); mouth: { lz, w, h } the opening the seal curtain fills.
//   seal: the seal curtain's colour. glb: { url, scale, yaw, y } — the Blender gate (ROADMAP Z-D6) that replaces `main`
//   when it is set (url null: the kit gate stays).
import * as THREE from 'three';
import * as F from '../assets/bambooFlora.js';
import * as Pr from '../assets/bambooProps.js';
import { G as BG } from '../../world/buildings/kit.js';
import { mossyStone } from '../../world/buildings/props.js';
import { shimenawa } from '../../world/buildings/props2.js';
import { puff } from '../../gfx/geom.js';
import { clamp } from '../../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cache = new Map();
/** the cave mouth (local: +z faces out) */
function caveMouth(seed = 0) {
  if (cache.has(seed)) return cache.get(seed);
  const pc = Pr.kit(seed * 17 + 3, B => {
    const stone = ['#8e9284', '#c4c2b2'], rock = (c, r, o = {}) => { const g = puff(V(0, 0, 0), r, { detail: 2, noise: 0.3, squash: o.sq ?? 0.9, seed: seed + (o.s || 0) }); if (o.sc) g.scale(...o.sc); g.translate(...c); B.add(mossyStone(g, { amt: o.moss ?? 0.6, sc: 1.6 / r, seed: seed + (o.s || 0), lift: r * 0.05, stone, moss: '#6a9e48', hi: '#a8d06a' }), null); };
    rock([0, 1.6, -2.6], 3.1, { sq: 0.72, s: 1, sc: [1.25, 1, 0.8] });       // the hill mass behind
    rock([-2.35, 1.15, -0.55], 1.45, { sq: 1.15, s: 2, moss: 0.55 });         // the left jamb
    rock([2.3, 1.05, -0.5], 1.38, { sq: 1.1, s: 3, moss: 0.55 });             // the right jamb
    rock([0, 3.15, -0.7], 1.5, { sq: 0.62, s: 4, sc: [1.55, 1, 0.9], moss: 0.75 }); // the lintel boulder
    rock([-1.3, 3.0, -1.2], 1.0, { sq: 0.8, s: 5 }); rock([1.4, 2.9, -1.3], 0.95, { sq: 0.8, s: 6 });
    for (const [x, z, r, s] of [[-3.3, 0.6, 0.62, 7], [3.2, 0.7, 0.55, 8], [-1.6, 0.9, 0.38, 9], [1.7, 1.0, 0.34, 10], [-3.9, -0.6, 0.75, 11], [3.8, -0.5, 0.7, 12]]) rock([x, r * 0.4, z], r, { sq: 0.75, s });
    // the throat: a dark hollow going back into the rock (inside faces, darkening with depth)
    let th = BG.sph(1, 14, 10); if (th.index) th = th.toNonIndexed(); th.scale(1.22, 1.5, 1.7); th.translate(0, 1.15, -1.25);
    { const p = th.attributes.position; for (let i = 0; i < p.count; i += 3) { /* flip the winding: we see the inside */ const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az); } th.computeVertexNormals(); }
    B.add(th, (p, n, o) => o.set('#1a2420').lerp(new THREE.Color('#3e4a40'), clamp((p.z + 0.2) * 0.9 + 0.3)));
    // the mouth itself: a dark arch in front of the hill mass (darkest deep in the middle, a lit rim of wet stone)
    { const sh = new THREE.Shape(); const w = 1.05, h = 1.55; sh.moveTo(-w, 0); sh.lineTo(-w, h); sh.absarc(0, h, w, Math.PI, 0, true); sh.lineTo(w, 0); sh.lineTo(-w, 0);
      const mg = new THREE.ShapeGeometry(sh, 16); mg.translate(0, 0.02, 0.06);
      B.add(mg, (p, n, o) => { const k = clamp(Math.hypot(p.x / w, (p.y - 1.1) / 1.6)); o.set('#0c1210').lerp(new THREE.Color('#3c4a40'), k * k * 0.9); });
      const lip = new THREE.TorusGeometry(1.08, 0.09, 6, 20, Math.PI); lip.translate(0, 1.57, 0.08); B.add(lip, (p, n, o) => o.set('#6e7466').lerp(new THREE.Color('#7ca856'), clamp(n.y) * 0.6)); }
    // worn steps up to the mouth, a shimenawa across it hung with shide, moss spilling over the lintel
    for (let k = 0; k < 3; k++) { const s = BG.box(2.2 - k * 0.3, 0.14, 0.55, 0.05); s.translate(0, 0.07 + k * 0.1, 0.9 - k * 0.45); B.add(s, (p, n, o) => { o.set('#b4b0a2').multiplyScalar(n.y > 0.5 ? 1 : 0.82); if (n.y > 0.5 && Math.sin(p.x * 6 + k) > 0.35) o.lerp(new THREE.Color('#78ac52'), 0.6); }); }
    shimenawa(B, { w: 2.7, y: 2.45, sag: 0.32, z: 0.35, r: 0.075 });
    for (let k = 0; k < 9; k++) { const x = -1.8 + k * 0.45, m = puff(V(x, 3.55 - Math.abs(x) * 0.25, 0.25 + (k % 2) * 0.15), 0.2 + (k % 3) * 0.06, { detail: 1, noise: 0.35, squash: 0.55, seed: seed + k }); B.add(m, (p, n, o) => o.set('#5e9644').lerp(new THREE.Color('#a8d06a'), clamp(n.y) * 0.5)); }
  }, 0.015);
  cache.set(seed, pc);
  return pc;
}

export const BAMBOO_GATE = {
  seal: '#d6ff9a',
  glb: { url: null, scale: 1, yaw: 0, y: 0 },
  build({ main, dress, lp, gx, gz, yaw, rim, W }) {
    main.piece(caveMouth(0), gx, gz, yaw, { y: rim - 0.15 });
    { const [x, z] = lp(0, 1.75); dress.piece(Pr.torii(4, { w: 3.0, h: 3.1 }), x, z, yaw, { y: rim }); for (const e of [-1, 1]) { const [px, pz] = lp(e * 1.5, 1.75); W.collision.addCircle(px, pz, 0.22); } }
    const lanterns = [];
    for (const e of [-1, 1]) { const [x, z] = lp(e * 2.55, 1.55); dress.piece(Pr.lantern(26 + e, { s: 0.9 }), x, z, yaw, { y: rim, lights: false }); W.collision.addCircle(x, z, 0.32); lanterns.push(V(x, rim + 0.85, z)); }
    for (const [lx, lz, kind, s] of [[-1.3, -2.6, 'clump', 0.85], [1.6, -3.0, 'grove', 0.7], [-3.6, -1.6, 'young', 1], [3.7, -1.4, 'young', 0.9]]) { const [x, z] = lp(lx, lz); dress.multi(F.stand(kind, kind.length % 2), x, W.heightAt(x, z) + 0.4, z, { rot: lx, s }); }
    for (const [lx, lz] of [[-2.8, 0.9], [2.9, 1.0], [-1.2, 1.3], [3.4, 0.2]]) { const [x, z] = lp(lx, lz); dress.multi(F.fern(Math.abs(lx * 3) % 4 | 0, { big: 0.9 }), x, W.heightAt(x, z), z, { rot: lz }); }
    return { lanterns, colliders: [[-2.35, -0.55, 1.3], [2.3, -0.5, 1.25], [0, -2.2, 2.6], [-3.3, 0.6, 0.55], [3.2, 0.7, 0.5], [0, -0.6, 1.0]], mouth: { lz: 0.2, w: 2.5, h: 2.7 } };
  },
};
