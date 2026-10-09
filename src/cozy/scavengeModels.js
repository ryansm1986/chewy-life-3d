// The scavenging props (docs/COZY.md §7.2 "Art"; ROADMAP CZ-6): every gather node in a full and a taken look, and
// Shadow's dig spot (the pawed mound, the dug hole) per ground. Built with the buildings kit (Builder: warp + painted
// ground AO) in the toy style of the zone kits, then flattened to one attribute set (position, normal, colour) so a
// whole area's nodes, full or taken, and its dig spots go into ONE BatchedMesh with one material (scavengeWorld.js):
// one draw call an area (plus its sparkles), no lights.
//
//   nodeGeos(model) → { full, taken }      (cached per model: the geometry is reused across visits)
//   digGeos(ground) → { mound, dug }       ground: 'loam' | 'leafy' | 'sand' | 'snow'
//   scavMaterial()                         the session-long toon material (vegToon: BatchedMesh-aware)
//
// Local frame: ground at y = 0, about a metre across, so a node reads at the game camera (~22 m out) beside a hero.
import * as THREE from 'three';
import { Builder, G, V, PI } from '../world/buildings/kit.js';
import { puff, tube, paint, mergeVertices } from '../gfx/geom.js';
import { blossomGeo, leafGeo, mossyStone, leafScatter } from '../world/buildings/props.js';
import { vegToon } from '../world/vegetation.js';
import { mulberry32, TAU, clamp, Noise } from '../core/util.js';

const _nz = new Noise(9161);
const nz = (x, y) => _nz.n2(x, y);
const col = h => new THREE.Color(h);
const lerpC = (a, b, t) => col(a).lerp(col(b), clamp(t));

let _mat = null;
/** one toon material for every scavenge node (never disposed: scavengeWorld takes its meshes out of a region's scene
 *  before the region's teardown, so the program stays compiled between visits) */
export function scavMaterial() {
  return (_mat ||= vegToon({ vertexColors: true, brush: 0.18, brushScale: 0.7, rim: 0.42, term: [-0.08, 0.36], shadowSat: 0.4 }));
}

/** one BatchedMesh holding these geometries (one draw call), room for `instances` → { bm, ids (geometry ids) } */
export function scavBatch(geos, instances) {
  const verts = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const bm = new THREE.BatchedMesh(Math.max(1, instances), Math.max(1, verts), Math.max(1, verts), scavMaterial());
  const ids = geos.map(g => bm.addGeometry(g));
  bm.castShadow = true; bm.receiveShadow = true; bm.perObjectFrustumCulled = true; bm.sortObjects = false;
  if (scavMaterial().userData?.depthMat) bm.customDepthMaterial = scavMaterial().userData.depthMat;
  return { bm, ids };
}
/** QA's look review (tools/qa/scavenge-shots.mjs): a flat ground disc to stand the props on, and its colour */
export function studioGround() { const m = new THREE.Mesh(new THREE.CircleGeometry(11, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8cc060', roughness: 1 })); m.receiveShadow = true; m.name = 'scavenge:studio'; return m; }
export function studioTint(m, hex) { m?.material?.color?.set(hex); }
/** a placement matrix (QA's lineup) */
export const placeAt = (x, y, z, rot = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));

// ------------------------------------------------------------------ geometry hygiene
/** one attribute set for the batch: non-indexed position, normal, colour */
export function prep(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) paint(g, (p, n, o) => o.set('#ffffff'));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
function build(seed, fn) {
  const B = new Builder(seed); B.warpAmt = 0.018; B.jitter = 0.035;
  fn(B, mulberry32(seed * 7919 + 13));
  const t = B.finish(), parts = Object.values(t.geos).filter(Boolean);
  if (!parts.length) return prep(new THREE.BufferGeometry());
  const out = parts.length === 1 ? parts[0] : mergeAll(parts);
  return prep(out);
}
function mergeAll(list) {
  const geos = list.map(g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; });
  const n = geos.reduce((a, g) => a + g.attributes.position.count, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}

// ------------------------------------------------------------------ pieces
/** a log / culm / branch from a to b (a soft bend), its cut ends painted as end grain */
function log(B, a, b, r, { bark = '#b8a588', hi = '#d8c8a8', end = '#e8d8b8', ring = '#a08868', bend = 0.04, seed = 0, rad = 8, taper = 0.88 } = {}) {
  const d = b.clone().sub(a), L = d.length(), side = V(-d.z, 0, d.x).normalize().multiplyScalar(bend * L);
  const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push({ p: a.clone().lerp(b, t).addScaledVector(side, Math.sin(t * PI)).add(V(0, Math.sin(t * PI) * bend * 0.3 * L, 0)), r: r * (1 - (1 - taper) * t) }); }
  const g = tube(pts, rad, false), dir = d.clone().normalize();
  B.add(g, (p, n, o) => { o.copy(lerpC(bark, hi, n.y * 0.6 + 0.35)).multiplyScalar(0.92 + 0.14 * nz(p.x * 9 + seed, (p.y + p.z) * 9)); if (nz(p.x * 22 + seed, p.z * 22 + p.y * 18) > 0.62) o.multiplyScalar(0.78); });
  for (const [q, s, rr] of [[a, -1, r], [b, 1, r * taper]]) { // end-grain caps
    const cap = G.disc(rr * 1.0, rad); cap.lookAt(dir.clone().multiplyScalar(s)); cap.translate(q.x, q.y, q.z);
    B.add(cap, (p, n, o) => { const k = p.distanceTo(q) / rr; o.copy(lerpC(end, ring, Math.abs(Math.sin(k * 7.5)) * 0.5 + k * 0.4)); });
  }
}
function pebble(B, p, r, { sq = 0.55, color = '#a8b4c4', hi = '#d8dce4', seed = 0, noise = 0.12, detail = 2 } = {}) {
  const g = puff(V(0, 0, 0), r, { detail, noise, squash: sq, seed });
  g.deleteAttribute('normal'); if (g.attributes.uv) g.deleteAttribute('uv');
  const w = mergeVertices(g, 1e-4); w.computeVertexNormals(); w.translate(p.x, p.y + r * sq * 0.62, p.z);
  B.add(w, (pp, n, o) => o.copy(lerpC(color, hi, n.y * 0.55 + 0.25)).multiplyScalar(0.95 + 0.08 * nz(pp.x * 14 + seed, pp.z * 14)));
  return w;
}
/** a soft ground mound (the bed a drift or a pile sits on) */
/** a soft ground mound: a smooth dome (rings × spokes) whose rim wobbles a little, its foot tucked into the ground, so
 *  its outline is round and cozy at any distance (a drift, a heap, a snow bank, a dig spot) */
function mound(B, r, h, colors, { seed = 0, x = 0, y = 0, z = 0, sx = 1, sz = 1, noise = 0.12, bumps = 0.12 } = {}) {
  const RINGS = 9, SEG = 36, P = [], idx = [];
  const rim = a => 1 + noise * (Math.sin(a * 3 + seed * 1.7) * 0.6 + Math.sin(a * 5 + seed * 3.1) * 0.4);
  P.push(0, h, 0);
  for (let i = 1; i <= RINGS; i++) {
    const u = i / RINGS;
    for (let k = 0; k < SEG; k++) {
      const a = k / SEG * TAU, rr = r * u * rim(a), hh = h * Math.pow(Math.max(0, 1 - u * u), 0.75) * (1 + bumps * nz(Math.cos(a) * u * 3 + seed, Math.sin(a) * u * 3) * u) - (i === RINGS ? 0.02 : 0);
      P.push(Math.cos(a) * rr * sx, hh, Math.sin(a) * rr * sz);
    }
  }
  for (let k = 0; k < SEG; k++) idx.push(0, 1 + (k + 1) % SEG, 1 + k);
  for (let i = 1; i < RINGS; i++) for (let k = 0; k < SEG; k++) { const a = 1 + (i - 1) * SEG + k, b = 1 + (i - 1) * SEG + (k + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, d, a, d, c); }
  const w = new THREE.BufferGeometry(); w.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); w.setIndex(idx); w.computeVertexNormals();
  w.translate(x, y - 0.004, z);
  B.add(w, (pp, n, o) => { o.copy(lerpC(colors[0], colors[1], n.y * 0.7 + 0.1 * nz(pp.x * 8 + seed, pp.z * 8))); if (colors[2] && nz(pp.x * 15 + seed, pp.z * 15) > 0.5) o.lerp(col(colors[2]), 0.45); });
  return w;
}
/** a petal (a little rounded ellipse) lying on / tilted over the ground */
function petal(B, p, a, s, color, tilt = 0.25, r = Math.random) {
  const g = new THREE.CircleGeometry(s, 7); g.scale(1, 0.62, 1);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); P.setZ(i, (x * x + y * y) / (s * s) * s * 0.35); } // (cupped)
  g.computeVertexNormals(); g.rotateX(-PI / 2 + (r() - 0.5) * tilt); g.rotateZ((r() - 0.5) * tilt); g.rotateY(a); g.translate(p.x, p.y, p.z);
  const c = col(color); B.add(g, (pp, n, o) => o.copy(c).multiplyScalar(0.92 + 0.12 * clamp(n.y)));
}
/** a maple leaf: five pointed lobes, a stalk, a little cup */
function mapleLeaf(B, p, a, s, color, r, tilt = 0.4) {
  const g = blossomGeo(s, 5, 0.42, true);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, (x * x + z * z) / (s * s) * s * 0.28); }
  g.computeVertexNormals(); g.rotateX((r() - 0.5) * tilt); g.rotateZ((r() - 0.5) * tilt); g.rotateY(a); g.translate(p.x, p.y, p.z);
  const c = col(color), v = col('#ffe0a0');
  B.add(g, (pp, n, o) => { o.copy(c).multiplyScalar(0.9 + 0.16 * clamp(n.y)); const d = Math.hypot(pp.x - p.x, pp.z - p.z) / s; o.lerp(v, clamp(0.25 - d) * 0.8); });
}
function cocoon(B, p, s, { tilt = 0, yaw = 0, thread = 0 } = {}) {
  const g = G.sph(s, 10, 8); g.scale(0.62, 1, 0.62);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); const k = 1 + 0.06 * Math.sin(y / s * 9); P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); }
  g.computeVertexNormals(); g.rotateZ(tilt); g.rotateY(yaw); g.translate(p.x, p.y, p.z);
  B.add(g, (pp, n, o) => o.copy(lerpC('#ece4d4', '#fffdf6', n.y * 0.5 + 0.5)).multiplyScalar(0.96 + 0.05 * Math.sin((pp.y - p.y) / s * 18)));
  if (thread > 0) { const t = G.cyl(0.004, 0.004, thread, 3); t.translate(p.x, p.y + s * 0.95 + thread / 2, p.z); B.add(t, '#f4eee0'); }
}
function mushroom(B, p, s, { cap = '#9a6040', spot = '#f0dcc0', stem = '#f2e6d0', tilt = 0, yaw = 0 } = {}) {
  B.at([p.x, p.y, p.z], yaw, () => {
    const st = G.cyl(s * 0.26, s * 0.34, s * 0.7, 8); st.translate(0, s * 0.35, 0); B.add(st, (pp, n, o) => o.set(stem).multiplyScalar(0.9 + 0.1 * clamp(n.y + 0.5)));
    const c = G.sph(s * 0.62, 12, 7, 0); c.scale(1, 0.62, 1);
    const P = c.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < 0) P.setY(i, P.getY(i) * 0.25);
    c.computeVertexNormals(); c.translate(0, s * 0.7, 0);
    B.add(c, (pp, n, o) => { o.copy(lerpC(cap, '#c08a60', n.y * 0.4)).multiplyScalar(n.y < -0.2 ? 0.75 : 1); if (n.y < -0.2) o.set('#e8d4b8'); else if (nz(pp.x * 40, pp.z * 40) > 0.55) o.set(spot); });
  }, 1, tilt, 0);
}
// ------------------------------------------------------------------ the node models
// Sizes: about a metre across and 0.45–0.9 m tall (Shadow's size), so they stand clear of the grass at the game camera;
// a taken node leaves a small low remnant (a stub, a pebble, a few petals) so the spot still reads as "there was something".
const WOOD_PALE = { bark: '#d2bd98', hi: '#f2e6cc', end: '#f6ead2', ring: '#c0a27c', rad: 9 };
const BAMBOO = { bark: '#9cc552', hi: '#d6e886', end: '#f6eebc', ring: '#c8b878', rad: 10, taper: 0.98, bend: 0.0 };
const BAMBOO_DRY = { ...BAMBOO, bark: '#d2b862', hi: '#f4e4a4', end: '#fbf0c8', ring: '#c0a060' }; // (fallen culms dry to straw gold: they read against the grove's green)
const MAPLE_BARK = { bark: '#6e4834', hi: '#9c6c4e', end: '#eccb9c', ring: '#ac7c58', rad: 8 };
const SEA_WOOD = { bark: '#c4c0b8', hi: '#f4f0e8', end: '#ece4d6', ring: '#b0a898', rad: 9 };
const PINE_BARK = { bark: '#6a4836', hi: '#8e6a50', end: '#eccb9c', ring: '#ac7c58', rad: 8 };
const MAPLE_COLS = ['#e8483a', '#f0703a', '#ff9a4a', '#d8383a', '#ffc04a', '#f05a3a'];

const MODELS = {
  // ---- Blossom Hollow
  driftwood: {
    full: () => build(101, (B, r) => {
      log(B, V(-0.56, 0.12, -0.12), V(0.5, 0.12, -0.2), 0.12, { ...WOOD_PALE, seed: 1, bend: 0.05 });
      log(B, V(-0.5, 0.12, 0.13), V(0.54, 0.13, 0.08), 0.115, { ...WOOD_PALE, bark: '#c8b08a', seed: 2, bend: -0.04 });
      log(B, V(-0.36, 0.33, -0.04), V(0.4, 0.34, -0.06), 0.1, { ...WOOD_PALE, bark: '#dcc8a6', seed: 3, bend: 0.06 });
      knots(B, r, [[-0.2, 0.2, -0.27], [0.3, 0.22, 0.2], [0.1, 0.43, -0.04]]);
      bow(B, V(0.0, 0.34, -0.05), 0.105, '#ee4a3c');
      shell(B, V(-0.5, 0, 0.36), 0.12, 0.6, '#ffd6dc'); spiral(B, V(0.5, 0, 0.34), 0.09);
    }),
    taken: () => build(102, (B) => { log(B, V(-0.22, 0.07, 0.02), V(0.2, 0.07, -0.05), 0.065, { ...WOOD_PALE, seed: 5 }); shell(B, V(0.26, 0, 0.22), 0.09, 1.2, '#ffd6dc'); }),
  },
  riverStone: {
    full: () => build(111, (B) => cairn(B, [['#9db0c6', '#dae4ee'], ['#d8cebc', '#f6f0e4'], ['#8a9ab0', '#c8d4e2'], ['#c8b8a2', '#eee4d4']], { moss: false })),
    taken: () => build(112, (B) => { pebble(B, V(0.04, 0, 0), 0.15, { color: '#9db0c6', hi: '#dae4ee', seed: 8, sq: 0.5 }); pebble(B, V(-0.2, 0, 0.14), 0.08, { color: '#c8b8a2', seed: 9 }); }),
  },
  petalDrift: {
    full: () => build(121, (B, r) => {
      // a soft drift of petals: a pale bed, then layers of petals heaped on it and spilling round its foot
      mound(B, 0.5, 0.2, ['#ffcfe2', '#fff2f7'], { seed: 1, sx: 1.2, noise: 0.16 });
      const cs = ['#ffc4dc', '#ffb0cc', '#ffe6f0', '#f79cc0', '#ffffff', '#ff9ec0', '#ffd6e6'];
      const hAt = d => Math.max(0, 0.2 * Math.pow(Math.max(0, 1 - (d / 0.5) ** 2), 0.75));
      for (let i = 0; i < 110; i++) { const a = r() * TAU, d = Math.pow(r(), 0.7) * 0.78, x = Math.cos(a) * d * 1.2, z = Math.sin(a) * d, y = hAt(d) + 0.012 + r() * 0.012; petal(B, V(x, y, z), r() * TAU, 0.06 + r() * 0.03, cs[i % cs.length], d < 0.45 ? 0.7 : 0.3, r); }
      sakuraSprig(B, V(-0.34, 0.12, 0.1), V(0.28, 0.5, -0.08), r);
      sakuraSprig(B, V(0.12, 0.16, 0.22), V(0.42, 0.3, 0.3), r, 0.7);
    }),
    taken: () => build(122, (B, r) => { const cs = ['#ffc4dc', '#ffb0cc', '#f79cc0']; for (let i = 0; i < 12; i++) { const a = r() * TAU, d = 0.08 + r() * 0.42; petal(B, V(Math.cos(a) * d, 0.014, Math.sin(a) * d), r() * TAU, 0.055, cs[i % 3], 0.2, r); } }),
  },
  mulberry: {
    full: () => build(131, (B, r) => mulberryBush(B, r, true)),
    taken: () => build(131, (B, r) => mulberryBush(B, r, false)),
  },
  // ---- the Whispering Bamboo Grove
  culms: {
    full: () => build(201, (B, r) => {
      const a0 = V(-0.6, 0.1, -0.11), a1 = V(0.56, 0.1, -0.14), b0 = V(-0.58, 0.1, 0.11), b1 = V(0.58, 0.1, 0.09), c0 = V(-0.46, 0.27, -0.01), c1 = V(0.48, 0.27, -0.03);
      log(B, a0, a1, 0.1, { ...BAMBOO_DRY, seed: 1 }); culmRings(B, a0, a1, 0.1, '#a88a48');
      log(B, b0, b1, 0.1, { ...BAMBOO_DRY, bark: '#c8bc5c', hi: '#eee6a0', seed: 2 }); culmRings(B, b0, b1, 0.1, '#a88a48');
      log(B, c0, c1, 0.09, { ...BAMBOO_DRY, bark: '#dcc272', seed: 3 }); culmRings(B, c0, c1, 0.09, '#a88a48');
      for (const x of [-0.26, 0.28]) { const t = G.torus(0.205, 0.024, 5, 18); t.rotateY(PI / 2); t.scale(1, 0.92, 1.12); t.translate(x, 0.17, -0.02); B.add(t, (p, n, o) => o.set('#e2c272').multiplyScalar(0.86 + 0.18 * clamp(n.y + 0.5))); } // straw lashings, snug
      // a short upright culm with a slanted cut, for height
      const u0 = V(0.72, 0, -0.32), u1 = V(0.74, 0.56, -0.3); log(B, u0, u1, 0.085, { ...BAMBOO, bark: '#a8c858', seed: 4 }); culmRings(B, u0, u1, 0.085);
      for (const [x, z, a] of [[0.56, 0.36, 0.4], [-0.5, 0.34, -0.9], [0.1, 0.4, 2.2], [-0.66, -0.3, 1.4]]) { const l = leafGeo(0.26, 0.06, 0.25); l.rotateY(a); l.translate(x, 0.02, z); B.add(l, '#c8b468'); }
    }),
    taken: () => build(202, (B) => { const a = V(-0.2, 0.07, 0), b = V(0.22, 0.07, 0.04); log(B, a, b, 0.065, { ...BAMBOO_DRY, seed: 4 }); culmRings(B, a, b, 0.065, '#a88a48'); }),
  },
  mossRubble: {
    full: () => build(211, (B, r) => {
      const st = { stone: ['#9898a8', '#cacad4'] };
      for (const [x, y, z, R, sq, s] of [[-0.2, 0, 0.02, 0.32, 0.66, 1], [0.24, 0, -0.12, 0.27, 0.72, 2], [0.06, 0, 0.3, 0.2, 0.62, 3], [0.0, 0.22, -0.02, 0.2, 0.7, 5], [0.42, 0, 0.24, 0.12, 0.6, 4]]) {
        const g = puff(V(0, R * 0.3, 0), R, { detail: 2, noise: 0.3, squash: sq, seed: s * 3 });
        const m = mossyStone(g, { amt: 0.6, sc: 2.4 / R, seed: s, lift: R * 0.1, ...st }); m.translate(x, y, z); B.add(m, null);
      }
      for (const [x, z] of [[-0.52, -0.2], [0.5, -0.36], [-0.14, -0.4]]) pebble(B, V(x, 0, z), 0.07, { color: '#a4a2ae', seed: x * 10 });
      fern(B, V(-0.46, 0, 0.3), 0.38, r); fern(B, V(0.46, 0, -0.1), 0.3, r);
    }),
    taken: () => build(212, (B) => { const g = puff(V(0, 0.05, 0), 0.15, { detail: 2, noise: 0.3, squash: 0.6, seed: 9 }); B.add(mossyStone(g, { amt: 0.5, sc: 16, seed: 5, lift: 0.015, stone: ['#9898a8', '#cacad4'] }), null); }),
  },
  cocoons: {
    full: () => build(221, (B, r) => culmStump(B, r, true)),
    taken: () => build(221, (B, r) => culmStump(B, r, false)),
  },
  shoots: {
    full: () => build(231, (B, r) => {
      for (const [x, z, h, s] of [[-0.14, 0.0, 0.66, 1], [0.18, -0.1, 0.5, 2], [0.02, 0.24, 0.38, 3]]) bambooShoot(B, V(x, 0, z), h, s, 0.15);
      mushroom(B, V(0.38, 0, 0.2), 0.17, { tilt: 0.15, yaw: 1 }); mushroom(B, V(0.48, 0, 0.0), 0.12, { tilt: -0.2, yaw: 2 }); mushroom(B, V(-0.4, 0, 0.26), 0.14, { yaw: 3 });
      for (const [x, z, a] of [[-0.46, -0.24, 0.6], [0.36, -0.4, 2.4], [-0.1, 0.46, 1.6]]) { const l = leafGeo(0.26, 0.06, 0.2); l.rotateY(a); l.translate(x, 0.02, z); B.add(l, '#b0b858'); }
    }),
    taken: () => build(232, (B) => { for (const [x, z] of [[-0.12, 0], [0.16, -0.08]]) { const g = G.cyl(0.08, 0.11, 0.07, 9); g.translate(x, 0.035, z); B.add(g, (p, n, o) => o.set(n.y > 0.5 ? '#f4ecc8' : '#c89a5a')); } }),
  },
  // ---- Momiji Hollow
  branches: {
    full: () => build(301, (B, r) => {
      // a little heap: two branches crossed on the ground, one propped up on them, red leaves still clinging
      log(B, V(-0.58, 0.08, 0.06), V(0.56, 0.09, -0.12), 0.08, { ...MAPLE_BARK, seed: 1, bend: 0.08 });
      log(B, V(-0.44, 0.08, -0.3), V(0.46, 0.08, 0.28), 0.07, { ...MAPLE_BARK, seed: 2, bend: -0.07 });
      log(B, V(-0.5, 0.05, 0.3), V(0.36, 0.42, -0.06), 0.06, { ...MAPLE_BARK, seed: 3, bend: 0.05 });
      log(B, V(0.0, 0.24, 0.12), V(0.22, 0.5, 0.3), 0.03, { ...MAPLE_BARK, seed: 4 }); // a forked twig off the propped one
      log(B, V(0.2, 0.36, 0.0), V(0.42, 0.56, -0.14), 0.026, { ...MAPLE_BARK, seed: 5 });
      for (const [x, y, z, s] of [[0.22, 0.52, 0.32, 0.11], [0.42, 0.57, -0.12, 0.12], [0.3, 0.58, 0.06, 0.1], [0.12, 0.47, 0.22, 0.09], [-0.5, 0.06, -0.38, 0.1], [0.5, 0.05, 0.36, 0.11], [-0.2, 0.03, 0.46, 0.1]]) mapleLeaf(B, V(x, y, z), r() * TAU, s, MAPLE_COLS[Math.floor(r() * 5)], r, 0.7);
    }),
    taken: () => build(302, (B, r) => { log(B, V(-0.22, 0.05, 0), V(0.2, 0.05, 0.06), 0.04, { ...MAPLE_BARK, seed: 6 }); mapleLeaf(B, V(0.26, 0.02, -0.12), 1, 0.1, '#f0703a', r); }),
  },
  terrace: {
    full: () => build(311, (B, r) => {
      const cs = ['#dcb88e', '#c9a27a', '#e8caa2', '#b8916c'];
      const slab = (x, y, z, w, h, d, a, c) => { const g = G.box(w, h, d, Math.min(h * 0.45, 0.04)); g.rotateY(a); g.translate(x, y + h / 2, z); B.add(g, (p, n, o) => o.copy(lerpC(c, '#f6e6cc', n.y * 0.45)).multiplyScalar(0.92 + 0.1 * nz(p.x * 12, p.z * 12 + p.y * 9))); };
      slab(-0.2, 0, 0.04, 0.58, 0.15, 0.4, 0.2, cs[0]); slab(0.28, 0, -0.08, 0.48, 0.14, 0.36, -0.3, cs[1]); slab(0.08, 0, 0.36, 0.4, 0.12, 0.28, 0.5, cs[3]);
      slab(-0.06, 0.15, -0.02, 0.52, 0.13, 0.36, -0.15, cs[2]); slab(0.08, 0.28, 0.0, 0.38, 0.11, 0.28, 0.35, cs[1]); slab(0.02, 0.39, -0.02, 0.24, 0.09, 0.2, -0.4, cs[0]);
      for (const [x, z] of [[-0.56, 0.3], [0.56, 0.26]]) pebble(B, V(x, 0, z), 0.08, { color: '#c9a27a', seed: x * 7 });
      mapleLeaf(B, V(0.04, 0.49, -0.02), 0.7, 0.11, '#e8483a', r, 0.1);
      mapleLeaf(B, V(-0.5, 0.02, -0.3), 2.1, 0.1, '#ff9a4a', r);
      // a tuft of grass growing out of the joints
      for (let i = 0; i < 5; i++) { const l = leafGeo(0.18, 0.025, 0.4); l.rotateZ(1.0 + r() * 0.4); l.rotateY(i * 1.3); l.translate(-0.42, 0.04, -0.12); B.add(l, '#7ca848'); }
    }),
    taken: () => build(312, (B) => { const g = G.box(0.38, 0.09, 0.28, 0.03); g.rotateY(0.3); g.translate(0, 0.045, 0); B.add(g, (p, n, o) => o.copy(lerpC('#c9a27a', '#f6e6cc', n.y * 0.45))); }),
  },
  mapleLeaves: {
    full: () => build(321, (B, r) => {
      mound(B, 0.48, 0.2, ['#a8402a', '#d86a34'], { seed: 1, sx: 1.15, noise: 0.16 });
      const hAt = d => Math.max(0, 0.22 * Math.pow(Math.max(0, 1 - (d / 0.5) ** 2), 0.75));
      for (let i = 0; i < 96; i++) { const a = r() * TAU, d = Math.pow(r(), 0.65) * 0.74, x = Math.cos(a) * d * 1.15, z = Math.sin(a) * d, y = hAt(d) + 0.014 + r() * 0.015; mapleLeaf(B, V(x, y, z), r() * TAU, 0.095 + r() * 0.04, MAPLE_COLS[i % MAPLE_COLS.length], r, d < 0.45 ? 0.8 : 0.3); }
      // a few leaves standing up out of the heap, and a twig
      for (const [x, z, a] of [[0.06, 0.02, 0.4], [-0.16, 0.1, 1.9], [0.2, -0.1, 3.1]]) { const g = blossomGeo(0.1, 5, 0.42, true); g.rotateX(-1.1); g.rotateY(a); g.translate(x, 0.3, z); B.add(g, MAPLE_COLS[Math.floor(r() * 4)]); }
      log(B, V(-0.3, 0.22, 0.0), V(0.22, 0.34, -0.12), 0.022, { ...MAPLE_BARK, seed: 7, rad: 5 });
    }),
    taken: () => build(322, (B, r) => { for (let i = 0; i < 7; i++) { const a = r() * TAU, d = 0.1 + r() * 0.36; mapleLeaf(B, V(Math.cos(a) * d, 0.016, Math.sin(a) * d), r() * TAU, 0.09, MAPLE_COLS[i % 3], r, 0.2); } }),
  },
  honeyLog: {
    full: () => build(331, (B, r) => hollowLog(B, r, true)),
    taken: () => build(331, (B, r) => hollowLog(B, r, false)),
  },
  // ---- Tidepool Point
  seaDrift: {
    full: () => build(401, (B, r) => {
      log(B, V(-0.6, 0.12, 0.1), V(0.56, 0.13, -0.1), 0.12, { ...SEA_WOOD, seed: 1, bend: 0.12 });
      log(B, V(-0.2, 0.1, -0.4), V(0.32, 0.36, 0.3), 0.085, { ...SEA_WOOD, bark: '#b6b2aa', seed: 2, bend: -0.1 });
      log(B, V(0.34, 0.1, -0.32), V(0.62, 0.08, -0.48), 0.05, { ...SEA_WOOD, seed: 3 });
      knots(B, r, [[-0.3, 0.22, 0.13], [0.2, 0.24, -0.02]], '#a49c90');
      seaweedStrand(B, V(-0.04, 0.24, 0.0), 0.62, r); seaweedStrand(B, V(0.2, 0.25, -0.04), 0.4, r);
      starfish(B, V(-0.46, 0, -0.3), 0.12, '#ff8a5a');
    }),
    taken: () => build(402, (B) => { log(B, V(-0.22, 0.06, 0.02), V(0.2, 0.07, -0.05), 0.06, { ...SEA_WOOD, seed: 4 }); }),
  },
  seaStones: {
    full: () => build(411, (B, r) => { cairn(B, [['#566a84', '#9cb0c8'], ['#7c8ca4', '#c2d0de'], ['#46566c', '#8494aa'], ['#8a96a8', '#d4dce8']], { moss: false }); starfish(B, V(0.42, 0, 0.3), 0.11, '#ffb04a'); shell(B, V(-0.44, 0, 0.34), 0.11, 2.1, '#fff0e0'); }),
    taken: () => build(412, (B) => { pebble(B, V(0, 0, 0), 0.15, { color: '#566a84', hi: '#9cb0c8', seed: 7, sq: 0.5 }); }),
  },
  netScraps: {
    full: () => build(421, (B, r) => fishNet(B, r, true)),
    taken: () => build(422, (B, r) => fishNet(B, r, false)),
  },
  seaGlass: {
    full: () => build(431, (B, r) => tidePool(B, r, true)),
    taken: () => build(431, (B, r) => tidePool(B, r, false)),
  },
  seaweed: {
    full: () => build(441, (B, r) => {
      pebble(B, V(-0.02, 0, -0.04), 0.22, { color: '#6a7484', hi: '#a8b0bc', seed: 3, sq: 0.55 });
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + r() * 0.3; seaweedStrand(B, V(Math.cos(a) * 0.16, 0.02, Math.sin(a) * 0.14 - 0.04), 0.48 + r() * 0.24, r, true, a); }
      shell(B, V(0.38, 0, 0.26), 0.13, 0.6); shell(B, V(0.46, 0, -0.12), 0.1, 2.1, '#ffd8e8'); spiral(B, V(-0.42, 0, 0.3), 0.1);
    }),
    taken: () => build(442, (B, r) => { seaweedStrand(B, V(0, 0.02, 0), 0.3, r, true, 0.4); shell(B, V(0.18, 0, 0.12), 0.09, 1.0); }),
  },
  // ---- the Onsen
  pine: {
    full: () => build(501, (B, r) => {
      mound(B, 0.56, 0.08, ['#dce6f4', '#ffffff'], { seed: 1, sx: 1.1 });
      pineBranch(B, V(-0.56, 0.1, -0.04), V(0.52, 0.12, -0.16), r);
      pineBranch(B, V(-0.36, 0.1, 0.32), V(0.42, 0.18, 0.12), r);
      pineBranch(B, V(-0.2, 0.08, -0.36), V(0.24, 0.5, 0.0), r, 0.8); // one propped up
      for (const [x, z] of [[0.5, 0.36], [-0.5, -0.34], [0.58, 0.22]]) { const c = G.sph(0.055, 7, 6); c.scale(1, 1.35, 1); c.translate(x, 0.07, z); B.add(c, (p, n, o) => o.set('#8e5e3e').lerp(col('#c08a5a'), Math.abs(Math.sin(p.y * 90)) * 0.5)); } // pine cones
    }),
    taken: () => build(502, (B) => { mound(B, 0.32, 0.04, ['#dce6f4', '#ffffff'], { seed: 2 }); log(B, V(-0.2, 0.06, 0), V(0.2, 0.06, 0.03), 0.04, { ...PINE_BARK, seed: 3 }); }),
  },
  sinter: {
    full: () => build(511, (B, r) => {
      // rimstone terraces: cream sinter basins cascading down to one side like a little hot-spring hillside, each lip
      // wobbly and splashed rust-orange where the water spills, each holding a turquoise pool
      for (const [k, [cx, cz, R, y0, hgt]] of [[0.12, 0.14, 0.5, 0, 0.12], [-0.08, -0.06, 0.36, 0.1, 0.14], [-0.22, -0.22, 0.22, 0.22, 0.14]].entries()) {
        const ring = 26, P = [], I = [], wob = a => 1 + 0.12 * Math.sin(a * 4 + k * 2) + 0.06 * Math.sin(a * 7 + k);
        for (let i = 0; i < ring; i++) { const a = i / ring * TAU, w = wob(a); P.push(cx + Math.cos(a) * R * w * 1.18, y0 - 0.01, cz + Math.sin(a) * R * w * 1.18, cx + Math.cos(a) * R * w, y0 + hgt, cz + Math.sin(a) * R * w); }
        for (let i = 0; i < ring; i++) { const a = i * 2, b = ((i + 1) % ring) * 2; I.push(a, b + 1, b, a, a + 1, b + 1); }
        const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); side.setIndex(I); side.computeVertexNormals();
        B.add(side, (p, n, o) => { o.copy(lerpC('#ecd8b8', '#fffaf0', clamp((p.y - y0) / hgt) * 0.7 + 0.2)); const a = Math.atan2(p.z - cz, p.x - cx); if (Math.sin(a * 6 + k * 1.3) > 0.45) o.lerp(col('#e08a4a'), 0.6 * clamp((y0 + hgt - p.y) / hgt + 0.15)); });
        const top = new THREE.CircleGeometry(1, ring); top.rotateX(-PI / 2); const T = top.attributes.position;
        for (let i = 1; i < T.count; i++) { const a = Math.atan2(T.getZ(i), T.getX(i)), w = wob(a); T.setXYZ(i, Math.cos(a) * R * w, 0, Math.sin(a) * R * w); }
        top.translate(cx, y0 + hgt, cz); B.add(top, '#fbf2e2');
        const water = new THREE.CircleGeometry(1, ring); water.rotateX(-PI / 2); const Wp = water.attributes.position;
        for (let i = 1; i < Wp.count; i++) { const a = Math.atan2(Wp.getZ(i), Wp.getX(i)), w = wob(a) * 0.82; Wp.setXYZ(i, Math.cos(a) * R * w, 0, Math.sin(a) * R * w); }
        water.translate(cx, y0 + hgt + 0.006, cz); B.add(water, (p, n, o) => o.copy(lerpC('#46bcd6', '#bff0f8', clamp(Math.hypot(p.x - cx, p.z - cz) / (R * 0.82)))));
      }
      for (const [x, z, R] of [[0.52, 0.34, 0.08], [-0.54, 0.2, 0.07], [0.3, -0.5, 0.06]]) pebble(B, V(x, 0, z), R, { color: '#ece0cc', hi: '#fffaf0', seed: x * 9 });
    }),
    taken: () => build(512, (B) => { const lip = G.cyl(0.3, 0.33, 0.08, 20); lip.translate(0, 0.04, 0); B.add(lip, (p, n, o) => o.copy(lerpC('#f2e2c6', '#fffaf0', clamp(n.y) * 0.6 + 0.3))); const w = G.disc(0.26, 20); w.rotateX(-PI / 2); w.translate(0, 0.075, 0); B.add(w, '#9adce8'); }),
  },
  iceCrystal: {
    full: () => build(521, (B, r) => {
      mound(B, 0.46, 0.12, ['#d4e2f6', '#ffffff'], { seed: 1 });
      for (const [x, z, h, rr, tx, tz] of [[0, 0, 0.78, 0.1, 0, 0], [0.16, 0.08, 0.52, 0.08, 0.35, 0.15], [-0.16, 0.1, 0.48, 0.075, -0.3, 0.25], [0.05, -0.17, 0.42, 0.07, 0.1, -0.4], [-0.11, -0.11, 0.3, 0.055, -0.3, -0.3], [0.27, -0.1, 0.28, 0.055, 0.5, -0.2], [-0.3, -0.02, 0.24, 0.05, -0.6, 0.0]]) crystal(B, V(x, 0.08, z), h, rr, tx, tz);
    }),
    taken: () => build(522, (B) => { mound(B, 0.34, 0.1, ['#d4e2f6', '#ffffff'], { seed: 2 }); crystal(B, V(0.02, 0.07, 0), 0.18, 0.045, 0.2, 0.1); }),
  },
  snowForage: {
    full: () => build(531, (B, r) => snowStump(B, r, true)),
    taken: () => build(531, (B, r) => snowStump(B, r, false)),
  },
};

// ---- the composite pieces
function knots(B, r, at, c = '#9a8466') { for (const [x, y, z] of at) { const k = G.sph(0.03, 6, 5); k.scale(1, 0.7, 1); k.translate(x, y, z); B.add(k, c); } }
function bow(B, p, r, color) { // a ribbon tied round a log: the band, two loops, two tails, the knot
  const band = G.torus(r, r * 0.17, 5, 16); band.rotateY(PI / 2); band.translate(p.x, p.y, p.z); B.add(band, color);
  for (const s of [-1, 1]) {
    const lp = G.torus(0.075, 0.022, 5, 12); lp.scale(1, 0.65, 1); lp.rotateZ(s * 0.5); lp.rotateX(-0.3); lp.translate(p.x + s * 0.075, p.y + r + 0.05, p.z + 0.02); B.add(lp, color);
    const tl = G.box(0.035, 0.14, 0.014, 0); tl.rotateZ(s * 0.35); tl.rotateX(0.5); tl.translate(p.x + s * 0.05, p.y + r - 0.02, p.z + 0.08); B.add(tl, color);
  }
  const k = G.sph(0.032, 8, 6); k.translate(p.x, p.y + r + 0.03, p.z + 0.02); B.add(k, '#c8302a');
}
function cairn(B, cols, { moss = false } = {}) {
  let y = 0;
  for (const [i, [x, z, R, sq]] of [[0, 0, 0.3, 0.52], [0.02, -0.02, 0.23, 0.58], [-0.01, 0.01, 0.17, 0.62], [0.01, 0, 0.11, 0.66]].entries()) {
    const c = cols[i % cols.length], w = pebble(B, V(x, y, z), R, { color: c[0], hi: c[1], seed: i + 1, sq, noise: 0.1 });
    w.computeBoundingBox(); y = w.boundingBox.max.y - R * sq * 0.42;
  }
  for (const [x, z, R, k] of [[0.42, 0.18, 0.11, 1], [-0.44, -0.2, 0.09, 2], [0.2, 0.4, 0.08, 3], [-0.34, 0.3, 0.07, 0]]) pebble(B, V(x, 0, z), R, { color: cols[k % cols.length][0], hi: cols[k % cols.length][1], seed: 9 + k });
  void moss;
}
function sakuraSprig(B, a, b, r, k = 1) {
  log(B, a, b, 0.02, { bark: '#5a3a42', hi: '#7a5262', end: '#8a6a60', ring: '#6a4a48', rad: 5, bend: 0.1 });
  const d = b.clone().sub(a);
  for (const [t, s0] of [[1, 0.1], [0.78, 0.09], [0.55, 0.085], [0.9, 0.07], [0.66, 0.075], [0.4, 0.07]]) {
    const s = s0 * k, q = a.clone().addScaledVector(d, t).add(V((r() - 0.5) * 0.08, 0.03 + (r() - 0.5) * 0.04, (r() - 0.5) * 0.1));
    const f = blossomGeo(s, 5, 0.5); f.rotateX((r() - 0.5) * 0.8); f.rotateZ((r() - 0.5) * 0.8); f.translate(q.x, q.y, q.z);
    B.add(f, (p, n, o) => { const k = p.distanceTo(q) / s; o.copy(lerpC('#ffffff', '#ff94bc', k * 0.95)); });
    const c = G.sph(0.018, 6, 4); c.translate(q.x, q.y + 0.01, q.z); B.add(c, '#ffd84a');
  }
  for (const t of [0.4, 0.7]) { const q = a.clone().addScaledVector(d, t), l = leafGeo(0.1, 0.035, 0.3); l.rotateZ(0.3); l.rotateY(r() * TAU); l.translate(q.x, q.y, q.z); B.add(l, '#8ccf6a'); }
}
function mulberryBush(B, r, full) {
  const greens = ['#5a9444', '#6eaa50', '#82bc5a'];
  for (const [x, y, z, R, s] of [[0, 0.36, 0, 0.4, 1], [0.3, 0.26, 0.12, 0.28, 2], [-0.3, 0.26, 0.08, 0.3, 3], [0.06, 0.58, -0.04, 0.27, 4], [-0.08, 0.24, 0.27, 0.24, 5], [0.12, 0.22, -0.3, 0.24, 6]]) {
    const g = puff(V(x, y, z), R, { detail: 2, noise: 0.26, squash: 0.85, seed: s, crown: V(0, 0.24, 0) });
    B.add(g, (p, n, o) => { o.copy(lerpC(greens[s % 3], '#a8d470', n.y * 0.5 + 0.1)).multiplyScalar(0.86 + 0.18 * nz(p.x * 9 + s, p.z * 9 + p.y * 7)); });
  }
  // mulberries: dark purple and red, little bumpy ovals over the crown
  for (let i = 0; i < 12; i++) { const a = r() * TAU, u = 0.2 + r() * 0.8, x = Math.cos(a) * 0.36 * u, z = Math.sin(a) * 0.36 * u + 0.06, y = 0.44 + 0.26 * (1 - u); const b = G.sph(0.038, 7, 5); b.scale(1, 1.35, 1); b.translate(x, y, z + 0.22 * (1 - u)); B.add(b, i % 3 ? '#4a2440' : '#c8304e'); }
  leafScatter(B, r, V(0, 0.36, 0.02), 0.46, 70, ['#5a9a44', '#78b454', '#8cc860', '#4e8a3e'], { sq: 0.8, size: 1.15 }); // (leaves over the crown: a bush, not a blob)
  if (full) for (const [x, y, z, t] of [[0.26, 0.6, 0.3, 0.3], [-0.2, 0.52, 0.36, -0.4], [0.04, 0.84, 0.14, 0.1], [0.42, 0.42, 0.04, 0.6]]) cocoon(B, V(x, y, z), 0.085, { tilt: t });
  const tr = G.cyl(0.05, 0.07, 0.18, 7); tr.translate(0, 0.07, 0); B.add(tr, '#6a4a3a');
}
function culmRings(B, a, b, r, color = '#86a046') {
  const d = b.clone().sub(a), L = d.length(), n = Math.max(1, Math.round(L / 0.3));
  for (let k = 1; k < n; k++) { const q = a.clone().lerp(b, k / n), g = G.torus(r * 1.02, r * 0.16, 4, 12); g.lookAt(d); g.translate(q.x, q.y, q.z); B.add(g, color); }
}
function culmStump(B, r, full) {
  const k = { ...BAMBOO, bark: '#9cc050', hi: '#cce07a' };
  const a = V(0, 0, 0), b = V(0.08, 0.96, 0.04); log(B, a, b, 0.09, { ...k, seed: 1 }); culmRings(B, a, b, 0.09);
  const c = V(0.24, 0, 0.14), d = V(0.26, 0.5, 0.16); log(B, c, d, 0.07, { ...k, seed: 2, bark: '#b0c858' }); culmRings(B, c, d, 0.07);
  // a leafy twig from the top
  log(B, V(0.07, 0.8, 0.04), V(-0.3, 0.96, 0.12), 0.014, { bark: '#7a9a40', hi: '#a8c060', end: '#d8e0a0', ring: '#a0b060', rad: 4 });
  for (const [x, y, z, a2] of [[-0.24, 0.96, 0.14, 2.6], [-0.14, 0.92, 0.06, 2.0], [-0.32, 0.94, 0.06, 3.0], [-0.2, 0.98, 0.18, 2.2]]) { const l = leafGeo(0.24, 0.055, 0.25); l.rotateZ(-0.5); l.rotateY(a2); l.translate(x, y, z); B.add(l, '#78b048'); }
  if (full) {
    for (const [x, y, z, th] of [[0.12, 0.7, 0.12, 0.06], [-0.1, 0.56, 0.04, 0.09], [0.07, 0.4, -0.12, 0.07], [-0.27, 0.74, 0.14, 0.12], [0.3, 0.36, 0.2, 0.05]]) cocoon(B, V(x, y, z), 0.072, { thread: th });
    // a fluffy white silk moth on the short culm's rim
    const m = G.sph(0.035, 7, 5); m.scale(1, 0.8, 1.4); m.translate(0.26, 0.53, 0.16); B.add(m, '#fffaf0');
    for (const s of [-1, 1]) { const w = new THREE.CircleGeometry(0.075, 9); w.scale(1, 0.7, 1); w.rotateX(-PI / 2 + 0.5); w.rotateY(s * 0.9); w.translate(0.26 + s * 0.06, 0.55, 0.16); B.add(w, '#fff4dc'); }
  }
  for (const [x, z, a2] of [[0.3, -0.24, 0.4], [-0.3, 0.26, 2.2]]) { const l = leafGeo(0.24, 0.06, 0.2); l.rotateY(a2); l.translate(x, 0.02, z); B.add(l, '#c8b468'); }
}
function bambooShoot(B, p, h, seed, R = 0.12) {
  const n = 6;
  for (let i = 0; i < n; i++) { // overlapping sheaths, wide at the foot, a green tip
    const t0 = i / n, rr = R * (1 - t0 * 0.78), hh = h * (1 - t0) * 0.6;
    const g = G.cone(rr, hh, 10); g.rotateY(i * 0.7); g.translate(p.x + (i % 2 ? 0.008 : -0.008), p.y + h * t0 * 0.55 + hh / 2, p.z);
    const c0 = i < n - 1 ? (i % 2 ? '#a87444' : '#c49058') : '#9cc050';
    B.add(g, (pp, nn, o) => { o.copy(lerpC(c0, i < n - 1 ? '#ecca92' : '#c8e080', clamp((pp.y - p.y - h * t0 * 0.55) / hh))); if (nz(pp.x * 50 + seed, pp.y * 50) > 0.5) o.multiplyScalar(0.86); });
  }
}
function fern(B, p, s, r) {
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * 0.4, l = leafGeo(s, s * 0.22, 0.3); l.rotateZ(0.55 + r() * 0.3); l.rotateY(-a); l.translate(p.x, p.y + 0.02, p.z); B.add(l, i % 2 ? '#5a9a48' : '#78b858'); }
}
function hollowLog(B, r, full) {
  // a fat hollow log, its open end toward the camera side (+x +z)
  const a = V(-0.52, 0.22, -0.24), b = V(0.44, 0.22, 0.24), d = b.clone().sub(a).normalize(), R = 0.22;
  const outer = []; for (let i = 0; i <= 6; i++) { const t = i / 6; outer.push({ p: a.clone().lerp(b, t), r: R * (1 - 0.06 * t) }); }
  B.add(tube(outer, 14, false), (p, n, o) => { o.copy(lerpC('#6a4632', '#a07252', n.y * 0.5 + 0.3)).multiplyScalar(0.86 + 0.2 * nz(p.x * 14, (p.y + p.z) * 14)); if (Math.abs(Math.sin((p.x - p.z) * 26)) > 0.92) o.multiplyScalar(0.8); });
  const endCap = G.disc(R, 14); endCap.lookAt(d.clone().negate()); endCap.translate(a.x, a.y, a.z); B.add(endCap, (p, n, o) => o.copy(lerpC('#eccb9c', '#ac7c58', Math.abs(Math.sin(p.distanceTo(a) / R * 7)) * 0.5)));
  const inner = G.cyl(R * 0.78, R * 0.78, 0.34, 14, true); inner.rotateX(PI / 2); inner.lookAt(d); inner.translate(b.x - d.x * 0.16, b.y, b.z - d.z * 0.16);
  const ii = inner.index ? inner.toNonIndexed() : inner; const N = ii.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  const IP = ii.attributes.position; for (let i = 0; i < IP.count; i += 3) { const x = IP.getX(i + 1), y = IP.getY(i + 1), z = IP.getZ(i + 1); IP.setXYZ(i + 1, IP.getX(i + 2), IP.getY(i + 2), IP.getZ(i + 2)); IP.setXYZ(i + 2, x, y, z); } // (we see the inside)
  B.add(ii, '#3e261c');
  const rim = G.torus(R * 0.89, R * 0.13, 6, 18); rim.lookAt(d); rim.translate(b.x, b.y, b.z); B.add(rim, '#dcb484');
  for (let i = 0; i < 4; i++) { const t = 0.12 + i * 0.22, q = a.clone().lerp(b, t), m = puff(V(q.x, q.y + R * 0.92, q.z), 0.09, { detail: 1, noise: 0.4, squash: 0.45, seed: i }); B.add(m, (p, n, o) => o.copy(lerpC('#6ea050', '#a8cc68', n.y))); }
  if (full) {
    // the honeycomb spilling out of the hollow: gold, with hex cells
    const hc = puff(V(b.x + d.x * 0.02, 0.2, b.z + d.z * 0.02), 0.15, { detail: 2, noise: 0.18, squash: 0.85, seed: 5 });
    B.add(hc, (p, n, o) => { const k = Math.abs(Math.sin(p.x * 60) * Math.sin(p.y * 60 + p.z * 45)); o.copy(lerpC('#e8941c', '#ffdc64', n.y * 0.5 + 0.5)).multiplyScalar(k > 0.72 ? 0.8 : 1.0); });
    const drip = G.sph(0.045, 7, 6); drip.scale(1, 1.45, 1); drip.translate(b.x + 0.07, 0.06, b.z + 0.1); B.add(drip, '#ffc838');
    const bee = G.sph(0.035, 7, 6); bee.scale(1.3, 1, 1); bee.translate(b.x + 0.1, 0.5, b.z + 0.04); B.add(bee, (p, n, o) => o.set(Math.sin((p.x - b.x) * 120) > 0 ? '#ffd040' : '#3a2a20'));
    for (const s of [-1, 1]) { const w = new THREE.CircleGeometry(0.035, 8); w.rotateX(-PI / 2 + 0.6); w.rotateY(s * 0.6); w.translate(b.x + 0.1, 0.54, b.z + 0.04 + s * 0.03); B.add(w, '#eaf6ff'); }
    mushroom(B, V(-0.22, 0.4, -0.08), 0.13, { tilt: 0.2, yaw: 0.5 }); mushroom(B, V(-0.04, 0.42, 0.06), 0.1, { tilt: -0.15, yaw: 1.4 });
    mushroom(B, V(0.54, 0, -0.12), 0.15, { yaw: 2 }); mushroom(B, V(0.62, 0, 0.06), 0.1, { yaw: 2.6 });
  }
}
function seaweedStrand(B, p, L, r, upright = false, a0 = null) {
  const pts = [], a = a0 ?? r() * TAU, w = 0.035 + r() * 0.015;
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(V(p.x + Math.cos(a) * L * t * (upright ? 0.3 : 1) + Math.sin(t * 5 + a) * 0.04, p.y + (upright ? Math.sin(t * PI * 0.55) * L * 0.75 : 0.012 + Math.sin(t * PI) * 0.04), p.z + Math.sin(a) * L * t * (upright ? 0.3 : 1))); }
  const P = [], N = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const q0 = pts[i], q1 = pts[i + 1], d = q1.clone().sub(q0).normalize(), s = V(-d.z, 0, d.x); if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize().multiplyScalar(w * (1 - i / 8 * 0.6) * (1 + 0.25 * Math.sin(i * 1.7)));
    const v = [q0.clone().add(s), q0.clone().sub(s), q1.clone().add(s), q1.clone().sub(s)];
    P.push(...v[0].toArray(), ...v[1].toArray(), ...v[2].toArray(), ...v[1].toArray(), ...v[3].toArray(), ...v[2].toArray());
    const nn = V().crossVectors(s, d).normalize(); for (let k = 0; k < 6; k++) N.push(nn.x, nn.y, nn.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const g2 = g.clone(); const p2 = g2.attributes.position, n2 = g2.attributes.normal;
  for (let i = 0; i < p2.count; i += 3) { const x = p2.getX(i + 1), y = p2.getY(i + 1), z = p2.getZ(i + 1); p2.setXYZ(i + 1, p2.getX(i + 2), p2.getY(i + 2), p2.getZ(i + 2)); p2.setXYZ(i + 2, x, y, z); }
  for (let i = 0; i < n2.count; i++) n2.setXYZ(i, -n2.getX(i), -n2.getY(i), -n2.getZ(i));
  const hy = y => clamp((y - p.y) / Math.max(0.1, L * (upright ? 0.75 : 0.1)));
  B.add(g, (pp, n, o) => o.copy(lerpC('#3e7034', '#9ab850', hy(pp.y))));
  B.add(g2, (pp, n, o) => o.copy(lerpC('#34602c', '#7a9a44', hy(pp.y))));
}
function starfish(B, p, s, color) {
  const g = blossomGeo(s, 5, 0.3, true);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const d = Math.hypot(P.getX(i), P.getZ(i)) / s; P.setY(i, (1 - d) * s * 0.35); }
  g.computeVertexNormals(); g.rotateY(p.x * 7); g.translate(p.x, p.y + 0.012, p.z);
  B.add(g, (pp, n, o) => { const d = Math.hypot(pp.x - p.x, pp.z - p.z) / s; o.set(color).lerp(col('#ffe0b0'), clamp(1 - d * 1.6) * 0.6); if (nz(pp.x * 90, pp.z * 90) > 0.5) o.multiplyScalar(1.12); });
}
function shell(B, p, s, yaw, color = '#fff0e0') {
  const g = new THREE.CircleGeometry(s, 16, 0, PI);
  const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), d = Math.hypot(x, y) / s, a = Math.atan2(y, x); P.setZ(i, (1 - d * d) * s * 0.5 + Math.abs(Math.sin(a * 7)) * s * 0.06 * d); }
  g.computeVertexNormals(); g.rotateX(-PI / 2); g.rotateY(yaw); g.translate(p.x, p.y + 0.012, p.z);
  B.add(g, (pp, n, o) => { const a = Math.atan2(pp.z - p.z, pp.x - p.x); o.set(color).lerp(col('#e8a088'), Math.abs(Math.sin(a * 7)) * 0.38); });
}
function spiral(B, p, s) {
  const g = G.cone(s * 0.55, s * 1.5, 12); g.rotateZ(PI / 2 - 0.3); g.translate(p.x, p.y + s * 0.42, p.z);
  B.add(g, (pp, n, o) => o.set('#f6dcbc').lerp(col('#c88868'), Math.abs(Math.sin((pp.x - p.x) * 60)) * 0.5));
}
function fishNet(B, r, full) {
  if (full) {
    // the net draped over a rock: a dome of crossing cords, teal, sagging between knots, floats tied on
    pebble(B, V(0, 0, 0), 0.38, { color: '#7a8494', hi: '#aab2be', seed: 3, sq: 0.62 });
    // the net hugs the rock (a dome a touch bigger than it), its cords crossing into diamonds, a knot at each crossing,
    // a thick hem rope round its foot
    const R = 0.44, H = 0.33, dome = (a, u) => V(Math.cos(a) * R * Math.sin(u * PI / 2) * 1.02, 0.02 + H * Math.cos(u * PI / 2), Math.sin(a) * R * Math.sin(u * PI / 2));
    const NC = 12, TW = 0.9;
    for (let k = 0; k < NC; k++) for (const sgn of [1, -1]) {
      const pts = []; for (let i = 0; i <= 14; i++) { const u = 0.08 + i / 14 * 0.92, a = k / NC * TAU + sgn * u * TW; pts.push({ p: dome(a, u), r: 0.012 }); }
      B.add(tube(pts, 4, false), sgn > 0 ? '#3cb0a6' : '#2c9a90');
    }
    for (let k = 0; k < NC; k++) for (let m = 1; m <= 3; m++) { const u = m * TAU / (NC * 2 * TW); if (u > 1) continue; const q = dome(k / NC * TAU + u * TW, u); const kn = G.sph(0.019, 6, 5); kn.translate(q.x, q.y, q.z); B.add(kn, '#1e7a72'); } // (where a cord crosses its neighbours)
    const hem = G.torus(R * 1.02, 0.026, 6, 32); hem.rotateX(PI / 2); hem.translate(0, 0.03, 0); B.add(hem, '#dcbc7c');
    for (const [x, z, c] of [[0.36, 0.28, '#ff8a3a'], [-0.32, 0.34, '#ffcc4a'], [0.46, -0.2, '#ff6a6a']]) { const f = G.sph(0.08, 12, 9); f.scale(1, 0.85, 1); f.translate(x, 0.08, z); B.add(f, (p, n, o) => o.set(c).lerp(col('#ffffff'), clamp(n.y - 0.55) * 0.9)); }
  }
  // a coil of rope (both looks)
  const pts = []; for (let i = 0; i <= 48; i++) { const t = i / 48, a = t * TAU * 2.4, rr = 0.13 - t * 0.05; pts.push({ p: V((full ? -0.44 : 0) + Math.cos(a) * rr, 0.025 + t * 0.04, (full ? -0.3 : 0) + Math.sin(a) * rr), r: 0.022 }); }
  B.add(tube(pts, 6, true), (p, n, o) => o.set('#dcbc7c').multiplyScalar(0.84 + 0.22 * clamp(n.y)));
}
function tidePool(B, r, full) {
  // a little rock-rimmed pool with sea glass glinting in it, and a pink coral sprig on the rim
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + r() * 0.3, d = 0.4 + r() * 0.06; pebble(B, V(Math.cos(a) * d * 1.15, 0, Math.sin(a) * d), 0.1 + r() * 0.06, { color: i % 2 ? '#667080' : '#8a94a4', hi: '#c4ccd8', seed: i, sq: 0.62 }); }
  const sand = G.disc(0.42, 18); sand.scale(1.12, 1, 1); sand.rotateX(-PI / 2); sand.translate(0, 0.012, 0); B.add(sand, '#c8b890');
  const w = G.disc(0.42, 22); w.scale(1.12, 1, 1); w.rotateX(-PI / 2); w.translate(0, 0.05, 0); B.add(w, (p, n, o) => o.copy(lerpC('#46b0c8', '#9ae6ec', clamp(Math.hypot(p.x / 1.12, p.z) / 0.42))));
  const cr = (x, z, h) => { log(B, V(x, 0.02, z), V(x + 0.02, h, z - 0.02), 0.03, { bark: '#ff8aa8', hi: '#ffc4d4', end: '#ffd8e0', ring: '#ff9ab4', rad: 6 }); for (const s of [-1, 1]) log(B, V(x, h * 0.5, z), V(x + s * 0.09, h * 0.85, z + 0.02), 0.022, { bark: '#ff8aa8', hi: '#ffc4d4', end: '#ffd8e0', ring: '#ff9ab4', rad: 5 }); };
  cr(-0.46, -0.24, 0.32);
  if (full) for (const [x, z, c, s] of [[0.06, 0.02, '#6af0d4', 0.07], [-0.14, 0.12, '#a8ff96', 0.06], [0.18, -0.12, '#ffd078', 0.055], [-0.06, -0.15, '#ffffff', 0.055], [0.22, 0.17, '#86d6ff', 0.05], [-0.22, -0.02, '#6af0d4', 0.05], [0.0, 0.2, '#ffb0e0', 0.045]]) {
    const g = G.ico(s, 0); g.scale(1, 0.62, 0.85); g.rotateY(x * 20); g.rotateX(0.3); g.translate(x, 0.07, z); B.add(g, (p, n, o) => o.set(c).lerp(col('#ffffff'), clamp(n.y) * 0.5));
  }
}
function pineBranch(B, a, b, r, lift = 1) {
  log(B, a, b, 0.045, { ...PINE_BARK, seed: a.x * 10, bend: 0.05 });
  const d = b.clone().sub(a), L = d.length();
  for (let i = 1; i <= 6; i++) {
    const t = i / 7, q = a.clone().addScaledVector(d, t), s = (0.17 - t * 0.05) * lift;
    for (const side of [-1, 1]) {
      const c = V(q.x - d.z / L * side * 0.09, q.y + 0.04, q.z + d.x / L * side * 0.09);
      const g = puff(c, s, { detail: 1, noise: 0.35, squash: 0.5, seed: i * 2 + side });
      B.add(g, (p, n, o) => { o.copy(lerpC('#2c6646', '#4a8a5a', n.y * 0.5 + 0.2)); if (n.y > 0.42) o.lerp(col('#ffffff'), clamp((n.y - 0.42) * 3) * 0.95); }); // snow on top
    }
  }
}
function crystal(B, p, h, r, tx, tz) {
  const g = G.cyl(r, r * 1.05, h * 0.78, 6); g.translate(0, h * 0.39, 0);
  const tip = G.cone(r, h * 0.22, 6); tip.translate(0, h * 0.78 + h * 0.11, 0);
  for (const piece of [g, tip]) {
    piece.rotateX(tz * 0.6); piece.rotateZ(-tx * 0.6); piece.translate(p.x, p.y, p.z);
    B.add(piece, (pp, n, o) => o.copy(lerpC('#78bcec', '#eef9ff', n.y * 0.5 + 0.32 + 0.3 * Math.abs(n.x))));
  }
}
function snowStump(B, r, full) {
  mound(B, 0.5, 0.07, ['#dce6f4', '#ffffff'], { seed: 6 });
  const st = G.cyl(0.24, 0.3, 0.38, 14); st.translate(0, 0.19, 0); B.add(st, (p, n, o) => n.y > 0.7 ? o.copy(lerpC('#eccb9c', '#ac7c58', Math.abs(Math.sin(Math.hypot(p.x, p.z) * 55)) * 0.5)) : o.copy(lerpC('#a07450', '#c89a6c', 0.35 + 0.35 * nz(p.x * 20, p.y * 20))).multiplyScalar(Math.abs(Math.sin(Math.atan2(p.z, p.x) * 9)) > 0.85 ? 0.82 : 1));
  const cap = puff(V(0.02, 0.39, 0), 0.23, { detail: 2, noise: 0.15, squash: 0.35, seed: 3 }); B.add(cap, (p, n, o) => o.copy(lerpC('#dce8f8', '#ffffff', n.y)));
  if (full) {
    mushroom(B, V(0.3, 0, 0.18), 0.16, { yaw: 1 }); mushroom(B, V(0.2, 0.1, 0.26), 0.11, { tilt: 0.3, yaw: 2 }); mushroom(B, V(-0.32, 0, 0.16), 0.13, { yaw: 3 });
    const hj = G.cyl(0.085, 0.075, 0.15, 12); hj.translate(-0.16, 0.075, -0.32); B.add(hj, (p, n, o) => o.set(p.y > 0.12 ? '#f4e4c8' : '#ffb830')); // a little honey pot someone left
    const lid = G.cyl(0.09, 0.09, 0.025, 12); lid.translate(-0.16, 0.16, -0.32); B.add(lid, '#c86a3a');
  }
}

// ------------------------------------------------------------------ dig spots
const GROUNDS = {
  loam: { soil: ['#8a5634', '#bc8656'], dark: '#4a2c1c', clod: '#9a6842' },
  leafy: { soil: ['#8a5634', '#bc8656'], dark: '#4a3020', clod: '#8a6040', leaves: ['#e8483a', '#ff9a4a', '#f0703a'] },
  sand: { soil: ['#d8c088', '#f0dcaa'], dark: '#a88c58', clod: '#c8b07a' },
  snow: { soil: ['#dce6f4', '#ffffff'], dark: '#7a5a46', clod: '#c8d4e4', specks: '#8a6a52' },
};
function digMound(B, r, gnd) {
  const Gd = GROUNDS[gnd] || GROUNDS.loam;
  mound(B, 0.44, 0.17, [Gd.soil[0], Gd.soil[1], Gd.specks], { seed: 3, sx: 1.12 });
  // a paw print pressed into the top: the big pad and four toes, darker, sitting just proud of the mound
  const top = 0.17 - 0.004;
  const pad = (x, z, sx, sz, y) => { const g = G.disc(0.06, 12); g.scale(sx, sz, 1); g.rotateX(-PI / 2); g.translate(x, y, z); B.add(g, Gd.dark); };
  pad(0, 0.03, 1.2, 1.0, top); for (const [x, z] of [[-0.09, -0.08], [-0.034, -0.122], [0.034, -0.122], [0.09, -0.08]]) pad(x, z, 0.45, 0.55, top - 0.01);
  for (let i = 0; i < 9; i++) { const a = r(i) * TAU, d = 0.46 + r(i + 9) * 0.14; const c = G.ico(0.04 + r(i + 3) * 0.025, 0); c.translate(Math.cos(a) * d, 0.025, Math.sin(a) * d); B.add(c, Gd.clod); }
  if (Gd.leaves) for (let i = 0; i < 3; i++) { const g = blossomGeo(0.085, 5, 0.42, true); g.rotateY(i * 2); g.translate(-0.36 + i * 0.32, 0.03, 0.36 - i * 0.12); B.add(g, Gd.leaves[i]); }
}
function digHole(B, r, gnd) {
  const Gd = GROUNDS[gnd] || GROUNDS.loam;
  const rim = G.torus(0.27, 0.085, 7, 20); rim.rotateX(-PI / 2); rim.scale(1.1, 1, 0.55); rim.translate(0, 0.035, 0);
  B.add(rim, (p, n, o) => o.copy(lerpC(Gd.soil[0], Gd.soil[1], n.y * 0.6 + 0.2)));
  const hole = G.disc(0.24, 18); hole.scale(1.1, 1, 1); hole.rotateX(-PI / 2); hole.translate(0, 0.014, 0); B.add(hole, Gd.dark);
  mound(B, 0.22, 0.15, [Gd.soil[0], Gd.soil[1]], { seed: 8, x: 0.42, z: -0.14 }); // the dug-out pile
  for (let i = 0; i < 7; i++) { const a = r(i) * TAU, d = 0.4 + r(i + 4) * 0.18; const c = G.ico(0.035 + r(i + 7) * 0.025, 0); c.translate(Math.cos(a) * d, 0.025, Math.sin(a) * d); B.add(c, Gd.clod); }
}
const fixedR = seed => i => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------ the caches
const NODE_CACHE = new Map(), DIG_CACHE = new Map();
export const MODEL_KEYS = Object.keys(MODELS);
export function nodeGeos(model) {
  let c = NODE_CACHE.get(model);
  if (!c) { const M = MODELS[model] || MODELS.riverStone; c = { full: M.full(), taken: M.taken() }; NODE_CACHE.set(model, c); }
  return c;
}
export function digGeos(ground = 'loam') {
  let c = DIG_CACHE.get(ground);
  if (!c) { c = { mound: build(901, B => digMound(B, fixedR(1), ground)), dug: build(902, B => digHole(B, fixedR(2), ground)) }; DIG_CACHE.set(ground, c); }
  return c;
}
