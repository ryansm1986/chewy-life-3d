// Cooking models (docs/HOMESTEAD.md §4): the campfire camp (a stone ring, a log teepee, a tripod with a bubbling pot,
// a log seat and a crate of supplies) that sits by the Burrow and region arrival points, the little cooking pot on a
// stand that appears in front of the player when cooking at home or at Rosie's, and the ladle. Toybox-chunky, vertex
// colours, one merged geometry each (the flames and the pot's broth are separate meshes so they can glow and move).
import * as THREE from 'three';
import { Builder, G, PI, col } from '../world/buildings/kit.js';
import { merge, paint } from '../gfx/geom.js';
import { clamp, TAU } from '../core/util.js';

const CACHE = new Map();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function build(key, fn, warp = 0.012) {
  let g = CACHE.get(key); if (g) return g;
  let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const B = new Builder(h >>> 0); B.warpAmt = warp; B.jitter = 0.01;
  fn(B);
  const t = B.finish();
  g = merge([t.geos.body, t.geos.leaf].filter(Boolean));
  CACHE.set(key, g);
  return g;
}

/** a round-bellied iron pot (origin at its base), with a rim, two ears and a wooden lid pushed to one side */
function pot(B, r = 0.2, h = 0.22, lid = true) {
  const body = G.lathe([[0.001, 0], [r * 0.7, 0.005], [r * 0.98, h * 0.3], [r, h * 0.62], [r * 0.9, h * 0.94], [r * 0.93, h]], 14);
  B.add(body, (p, n, o) => o.set('#3a3440').lerp(col('#6a6274'), clamp(n.y * 0.5 + 0.35)));
  const rim = G.torus(r * 0.92, 0.018, 5, 18); rim.rotateX(PI / 2); rim.translate(0, h, 0); B.add(rim, '#5a5464');
  for (const s of [-1, 1]) { const e = G.torus(0.035, 0.012, 4, 8); e.translate(s * r * 0.98, h * 0.8, 0); B.add(e, '#4a4452'); }
  if (lid) { const l = G.cyl(r * 0.78, r * 0.82, 0.03, 12); l.rotateZ(0.5); l.translate(r * 0.55, h + 0.08, -r * 0.2); B.add(l, '#b07a4a'); const k = G.sph(0.03, 6, 4); k.translate(r * 0.62, h + 0.13, -r * 0.2); B.add(k, '#8a5a3a'); }
}
/** the broth surface (a separate glowing-ish disc so it can bubble): radius r at height y */
export function brothGeo(r = 0.17, color = '#f2b45a') {
  const g = new THREE.CircleGeometry(r, 16); g.rotateX(-PI / 2);
  paint(g, (p, n, o) => o.set(color).lerp(col('#fff2c0'), clamp(1 - Math.hypot(p.x, p.z) / r) * 0.5));
  return g;
}

/** The campfire camp. Origin: the fire's centre on the ground. Front (+z) is where the cook stands. */
export function campfireGeo() {
  return build('campfire', B => {
    // ash bed + a ring of chunky stones
    const ash = G.disc(0.5, 18); ash.rotateX(-PI / 2); ash.translate(0, 0.006, 0);
    B.add(ash, (p, n, o) => o.set('#3e3236').lerp(col('#7a6a62'), clamp(Math.hypot(p.x, p.z) / 0.5)));
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + B.wob(0.12), s = G.ico(0.13, 1); s.scale(1.15 + B.wob(0.2), 0.75 + B.wob(0.15), 1);
      s.rotateY(a); s.translate(Math.cos(a) * 0.6, 0.07, Math.sin(a) * 0.6);
      B.add(s, (p, n, o) => o.set('#8a8290').lerp(col('#d6d0d4'), clamp(n.y * 0.6 + 0.2)));
    }
    // the log teepee and two charred logs in the embers
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3, bx = Math.cos(a) * 0.36, bz = Math.sin(a) * 0.36, d = V(-bx, 0.55, -bz).normalize();
      const l = G.cyl(0.045, 0.055, 0.6, 7); l.translate(0, 0.3, 0); l.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)); l.translate(bx, 0.02, bz);
      B.add(l, (p, n, o) => o.set('#7a4e30').lerp(col('#2a1a18'), clamp(1 - p.y / 0.45)));
    }
    for (const [a, L] of [[0.4, 0.62], [2.2, 0.55]]) { const l = G.cyl(0.06, 0.06, L, 7); l.rotateZ(PI / 2); l.rotateY(a); l.translate(0, 0.06, 0); B.add(l, (p, n, o) => o.set('#5a3a28').lerp(col('#1e1414'), clamp(0.6 - n.y))); }
    // tripod over the fire with the pot hanging from a chain
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.5, bx = Math.cos(a) * 0.72, bz = Math.sin(a) * 0.72, top = V(0, 1.32, 0), d = top.clone().sub(V(bx, 0, bz)), L = d.length();
      const s = G.cyl(0.026, 0.032, L, 6); s.translate(0, L / 2, 0); s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); s.translate(bx, 0, bz);
      B.add(s, '#8a5a36');
    }
    const tie = G.torus(0.05, 0.02, 4, 8); tie.rotateX(PI / 2); tie.translate(0, 1.3, 0); B.add(tie, '#d8b878');
    const chain = G.cyl(0.008, 0.008, 0.4, 4); chain.translate(0, 1.1, 0); B.add(chain, '#3a3440');
    B.at([0, 0.62, 0], 0, () => pot(B, 0.22, 0.26, false));
    const ladle = G.cyl(0.012, 0.012, 0.42, 5); ladle.rotateZ(0.45); ladle.translate(0.12, 0.98, 0.04); B.add(ladle, '#c8905a');
    // a log seat in front, a little crate with veg and a fish on the side, a skewer stand
    const seat = G.cyl(0.17, 0.17, 0.9, 10); seat.rotateZ(PI / 2); seat.rotateY(0.25); seat.translate(-0.1, 0.17, 1.35);
    B.add(seat, (p, n, o) => (Math.abs(n.y) < 0.3 && Math.abs(n.x) > 0.8 ? o.set('#e8c898') : o.set('#8a5a3a').multiplyScalar(0.9 + 0.15 * clamp(n.y))));
    B.at([1.0, 0, 0.55], -0.5, () => {
      const c = G.box(0.46, 0.26, 0.34, 0.03); c.translate(0, 0.13, 0);
      B.add(c, (p, n, o) => o.set('#d8a868').multiplyScalar(Math.abs(n.y) < 0.5 && Math.abs(Math.sin(p.y * 40)) < 0.15 ? 0.78 : 1));
      for (const [x, z, k] of [[-0.12, 0.02, '#ff8a3a'], [0.0, -0.05, '#9ad872'], [0.12, 0.04, '#f4e4f0']]) { const v = G.sph(0.07, 8, 6); v.translate(x, 0.29, z); B.add(v, k); }
      const f = G.sph(0.08, 8, 6); f.scale(1.6, 0.6, 0.7); f.rotateY(0.4); f.translate(0.05, 0.33, 0.1); B.add(f, (p, n, o) => o.set(n.y > 0.2 ? '#6a8a9a' : '#e8eef0'));
    });
    for (const s of [-1, 1]) { const st = G.cyl(0.018, 0.022, 0.5, 5); st.translate(s * 0.28, 0.25, 0.78); B.add(st, '#8a5a36'); }
    const sk = G.cyl(0.01, 0.01, 0.7, 4); sk.rotateZ(PI / 2); sk.translate(0, 0.46, 0.78); B.add(sk, '#c8a070');
    const fish = G.sph(0.07, 8, 6); fish.scale(1.9, 0.75, 0.7); fish.translate(0.02, 0.46, 0.78); B.add(fish, (p, n, o) => o.set(n.y > 0.1 ? '#c8783a' : '#f0d0a0'));
  });
}
/** the flames: an outer and an inner tongue (animated by the kitchen) */
export function flameGeos() {
  let g = CACHE.get('flames'); if (g) return g;
  const outer = new THREE.ConeGeometry(0.2, 0.62, 9, 3); outer.translate(0, 0.31, 0);
  const inner = new THREE.ConeGeometry(0.11, 0.38, 8, 2); inner.translate(0, 0.19, 0);
  const wob = (geo, a) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), ang = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + a * Math.sin(ang * 3 + y * 9); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } geo.computeVertexNormals(); };
  wob(outer, 0.18); wob(inner, 0.12);
  g = { outer, inner }; CACHE.set('flames', g); return g;
}
/** the cook-anywhere pot: a little round pot on a three-legged iron stand with a tea-light burner under it */
export function stovePotGeo() {
  return build('stovePot', B => {
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, l = G.cyl(0.012, 0.016, 0.24, 5); l.rotateZ(-0.25); l.rotateY(-a); l.translate(Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17); B.add(l, '#3a3440'); }
    const ring = G.torus(0.17, 0.014, 4, 14); ring.rotateX(PI / 2); ring.translate(0, 0.23, 0); B.add(ring, '#4a4452');
    const burner = G.cyl(0.07, 0.08, 0.05, 10); burner.translate(0, 0.025, 0); B.add(burner, '#c8c0b8');
    B.at([0, 0.21, 0], 0, () => pot(B, 0.16, 0.17, true));
  });
}
/** the ladle (grip at the origin, along +z, bowl at the tip) */
export function ladleGeo() {
  return build('ladle', B => {
    const h = G.cyl(0.013, 0.016, 0.42, 6); h.rotateX(PI / 2); h.translate(0, 0, 0.17); B.add(h, '#c8905a');
    const bowl = G.sph(0.06, 10, 6, ); bowl.scale(1, 0.6, 1); bowl.translate(0, -0.03, 0.4); B.add(bowl, (p, n, o) => o.set(n.y > 0.5 ? '#f2b45a' : '#d8a060'));
  }, 0.004);
}
