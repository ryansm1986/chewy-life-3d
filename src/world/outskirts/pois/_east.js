// The east group's shared kit (ROADMAP HP-1: the Sea Arch Lookout, the Bee Meadow, Driftwood Cove): a place's local
// frame (turned to the game camera), its candy-smooth mossy boulders, timber posts with rope wraps and round-railed
// fences, the squat stone lantern, sea-pink and grass tufts, and the pulsing foam collars round anything standing in
// the sea. Everything here builds into a kit Builder (buildings/kit.js) or is one small mesh of its own.
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { mossyStone, leafGeo, nz } from '../../buildings/props.js';
import { puff, tube } from '../../../gfx/geom.js';
import { U, makeToon, POOL_GLSL } from '../../../gfx/materials.js';
import { distToRamble } from '../../outskirtsPlan.js';
import { WORLD } from '../../layout.js';
import { clamp, TAU } from '../../../core/util.js';

export const CAM_YAW = PI / 4; // the game camera looks from +x / +z: a frame turned by this has local +x = screen right
export const STONE = ['#8f8a9e', '#c8c1cf'], MOSS = '#8cb23a', MOSS_HI = '#c6de5e';
export const TIMBER = '#b07a3c', TIMBER_D = '#7d5432', TIMBER_HI = '#d39a52', ROPE = '#d8bd84';

/** a place's local frame: origin (x, z) on the ground, turned by yaw (local +z faces (sin yaw, cos yaw)). With the
 *  default yaw local +x runs to the screen's right and local +z toward the camera. */
export function frame(ctx, { x = ctx.poi.x, z = ctx.poi.z, yaw = CAM_YAW } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw), y0 = ctx.H(x, z);
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const F = {
    x, z, yaw, y0, W,
    /** world → local */
    L: (wx, wz) => [(wx - x) * c - (wz - z) * s, (wx - x) * s + (wz - z) * c],
    /** the ground under a local point, relative to the frame's origin */
    h: (lx, lz) => { const [wx, wz] = W(lx, lz); return ctx.H(wx, wz) - y0; },
    /** the ground in world y */
    wy: (lx, lz) => { const [wx, wz] = W(lx, lz); return ctx.H(wx, wz); },
    trail: (lx, lz) => distToRamble(...W(lx, lz)),
    /** a solid thing of radius r at a local point: a collider (and a warning if it crowds the trail) */
    solid(lx, lz, r, what = '') {
      const [wx, wz] = W(lx, lz), t = distToRamble(wx, wz);
      if (t - r < 1.3) console.warn(`[outskirts] ${ctx.poi.id}: ${what || 'a solid'} at ${t.toFixed(2)} m from the trail`);
      ctx.collide(wx, wz, r);
    },
    /** a local facing (yaw in the frame) → a world yaw */
    face: a => a + yaw,
    /** the local yaw that looks from (ax, az) toward (bx, bz) */
    look: (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az),
  };
  return F;
}

/** a candy-smooth boulder with a plump moss cushion grown out of its top (props.mossyStone), centred at (x, y, z) */
//  tilt: its long (stretched, x) axis tipped by this about z.  flip: the flat side up (a puff's underside is flattened): a level mossy top, a round belly (an arch's span)
export function boulder(B, x, y, z, r, { sq = 0.8, moss = 0.5, stretch = 1.1, yaw = 0, seed = 0, detail = r > 0.7 ? 3 : 2, noise = 0.09, stone = STONE, flip = false, tilt = 0 } = {}) {
  const g = puff(V(0, 0, 0), r, { detail, noise, squash: sq, seed });
  if (flip) g.rotateX(PI);
  g.scale(stretch, 1, 1 / Math.sqrt(stretch)); if (tilt) g.rotateZ(tilt); g.rotateY(yaw); g.translate(x, y, z);
  const out = B.add(mossyStone(g, { amt: moss, sc: 0.75 / r, seed, lift: r * 0.07, stone, moss: MOSS, hi: MOSS_HI }), null);
  return { x, y, z, r, sq, stretch, yaw, flip, geo: out, top: y + r * (flip ? 0.525 : sq) };
}
/** the waterline radius of a boulder whose centre sits below the sea (y < 0) → a foam collar's r (or 0 if it's dry) */
export function waterline(b) {
  const up = b.flip ? 0.525 : b.sq, down = b.flip ? b.sq : 0.525;
  const e = b.y < 0 ? -b.y / (b.r * up) : b.y / (b.r * down);
  if (b.y - b.r * down > 0 || e >= 1) return 0;
  return b.r * Math.sqrt(1 - e * e);
}
/** the top surface y of built geometry (geos, in the Builder's frame) under (x, z), by a ray from above → y or null */
const _ray = new THREE.Raycaster(), _rm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
export function dropOnto(geos, x, z, from = 40) {
  _ray.set(V(x, from, z), V(0, -1, 0));
  let best = null;
  for (const g of geos) { const m = new THREE.Mesh(g, _rm); const hit = _ray.intersectObject(m, false)[0]; if (hit && (best == null || hit.point.y > best)) best = hit.point.y; }
  return best;
}

/** a stout round timber post from the ground (y0) up h, a rounded cap; wraps: rope rings at these heights above y0 */
export function post(B, x, y0, z, h, { r = 0.1, wraps = [], wood = TIMBER, cap = true, turns = 3, seg = 9 } = {}) {
  const p = G.cyl(r * 0.94, r, h + 0.15, seg); p.translate(x, y0 + (h - 0.15) / 2, z);
  B.add(p, (pp, n, o) => o.set(wood).multiplyScalar(0.9 + 0.1 * nz(pp.y * 5 + x, Math.atan2(n.z, n.x) * 1.5) + (n.y > 0.5 ? 0.06 : 0)));
  if (cap) { const c = G.sph(r * 0.98, 8, 4); c.scale(1, 0.55, 1); c.translate(x, y0 + h, z); B.add(c, (pp, n, o) => o.set(TIMBER_HI).multiplyScalar(0.92 + 0.1 * n.y)); }
  for (const y of wraps) ropeWrap(B, x, y0 + y, z, r, turns);
}
/** two or three turns of rope round a post of radius r at height y */
export function ropeWrap(B, x, y, z, r, n = 3) {
  for (let k = 0; k < n; k++) { const t = G.torus(r + 0.012, 0.022, 3, 9); t.rotateX(PI / 2 + (k - 1) * 0.12); t.translate(x, y + (k - (n - 1) / 2) * 0.045, z); B.add(t, ROPE); }
}
/** a low fence of thick round rails on stout posts along a local polyline pts [[x, z], ...]; gy(x, z) is the ground's
 *  y there. Rope lashings where the rails meet each post. */
export function fence(B, pts, gy, { h = 0.78, rails = [0.66, 0.36], every = 1.7, postR = 0.1, railR = 0.055, wood = TIMBER } = {}) {
  const P = [];
  for (let i = 0; i < pts.length; i++) {
    P.push(pts[i]);
    if (i < pts.length - 1) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / every);
      for (let k = 1; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
  }
  const tops = P.map(([x, z]) => ({ x, z, y: gy(x, z) }));
  for (const t of tops) post(B, t.x, t.y, t.z, h, { r: postR, wraps: rails.map(r => r), wood });
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    for (const ry of rails) {
      const pa = V(a.x, a.y + ry, a.z), pb = V(b.x, b.y + ry, b.z), pts2 = [];
      for (let k = 0; k <= 4; k++) pts2.push({ p: pa.clone().lerp(pb, k / 4).add(V(0, -Math.sin(k / 4 * PI) * 0.015, 0)), r: railR });
      B.add(tube(pts2, 7, false), (pp, n, o) => o.set(wood).multiplyScalar(0.94 + 0.12 * clamp(n.y) + 0.05 * nz(pp.x * 3, pp.z * 3)));
    }
  }
  return tops;
}

/** the squat toy stone lantern (as the falls garden's): a fat round base on stubby legs, a boxy chamber with warm paper
 *  windows, a broad mossy roof with an upturned rim and a ball finial; at (x, y, z), s scales it */
export function squatLantern(B, x, y, z, s = 1) {
  B.push([x, y, z], 0.3, s);
  const st = (p, n, o) => o.set('#b6afb4').multiplyScalar(0.9 + 0.12 * clamp(n.y) + 0.06 * nz(p.x * 9, p.y * 9));
  const mossy = (p, n, o) => { st(p, n, o); const m = n.y - 0.55 + nz(p.x * 7, p.z * 7) * 0.4; if (m > 0) o.lerp(new THREE.Color(MOSS), clamp(m * 4)).lerp(new THREE.Color(MOSS_HI), clamp(m * 3 - 0.6) * 0.5); };
  const at = (g, dy) => { g.translate(0, dy, 0); return g; };
  B.add(at(G.cyl(0.3, 0.34, 0.1, 12), 0.05), st);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4, l = G.cyl(0.07, 0.085, 0.2, 7); l.translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17); B.add(at(l, 0.2), st); }
  B.add(at(G.cyl(0.27, 0.24, 0.08, 12), 0.33), st);
  B.add(at(G.box(0.36, 0.3, 0.36, 0.05), 0.52), st);
  for (const [dx, dz, ry] of [[0, 0.181, 0], [0.181, 0, PI / 2], [0, -0.181, PI], [-0.181, 0, -PI / 2]]) {
    const w = G.plane(0.2, 0.17); w.rotateY(ry); w.translate(dx, 0.53, dz); B.glow(w, '#ffd890', { flicker: 0.5 });
  }
  const roof = G.lathe([[0.001, 0.0], [0.2, 0.0], [0.42, 0.0], [0.46, 0.07], [0.43, 0.04], [0.33, 0.13], [0.16, 0.24], [0.001, 0.26]], 14);
  B.add(at(roof, 0.67), mossy);
  B.add(at(G.sph(0.08, 8, 6), 0.98), st);
  B.add(at(G.cyl(0.04, 0.05, 0.08, 8), 0.92), st);
  B.pop();
}

/** a clump of sea pinks (thrift): grassy leaves and round pink pom-poms on wiry stalks (the leaf bucket: it sways) */
export function seaPink(B, x, y, z, rnd, { n = 5, color = '#eba6ba', s = 1 } = {}) {
  for (let k = 0; k < 7; k++) { const lf = leafGeo(0.2 * s, 0.022 * s, 0.25); lf.rotateZ(0.55 + rnd() * 0.4); lf.rotateY(k / 7 * TAU + rnd()); lf.translate(x, y, z); B.add(lf, k % 2 ? '#5e9c3c' : '#77b048', 'leaf'); }
  const c0 = new THREE.Color(color), c1 = c0.clone().lerp(new THREE.Color('#ffffff'), 0.4), c2 = c0.clone().multiplyScalar(0.78);
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, d = rnd() * 0.12 * s, hh = (0.16 + rnd() * 0.16) * s, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const st = G.cyl(0.007, 0.009, hh, 3, true); st.translate(px, y + hh / 2, pz); B.add(st, '#5a8a3a', 'leaf');
    const hd = G.sph(0.045 * s, 5, 3); hd.scale(1, 0.85, 1); hd.translate(px, y + hh + 0.02, pz);
    B.add(hd, (p, nn, o) => o.copy(c2).lerp(c0, clamp(nn.y + 0.6)).lerp(c1, clamp(nn.y - 0.4) * 0.8), 'leaf');
  }
}
/** a tuft of grass blades */
export function grassTuft(B, x, y, z, rnd, { n = 6, h = 0.3, color = '#6fae46' } = {}) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const bl = leafGeo(h * (0.7 + rnd() * 0.5), 0.028, 0.2); bl.rotateZ(PI / 2 - 0.25 - rnd() * 0.45); bl.rotateY(rnd() * TAU); bl.translate(x + (rnd() - 0.5) * 0.12, y, z + (rnd() - 0.5) * 0.12);
    const k2 = c.clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08);
    B.add(bl, (p, nn, o) => o.copy(k2).multiplyScalar(0.75 + 0.45 * clamp((p.y - y) / h)), 'leaf');
  }
}

// ---- foam: white collars on the sea round rocks and legs, their lacy edges breathing in and out, a thin wash ring
// swelling outward and fading. One unlit mesh (it dims with the sky like the waterfall's water).
const FOAM_VS = /* glsl */`
attribute float aPh; varying vec2 vUv; varying vec3 vW; varying float vPh;
void main() { vUv = uv; vPh = aPh; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FOAM_FS = /* glsl */`
uniform float uTime; uniform sampler2D uBrush; uniform float uNight; uniform vec3 uSkyHor;
varying vec2 vUv; varying vec3 vW; varying float vPh;
vec3 lit(vec3 c) {
  float L = dot(uSkyHor, vec3(0.3, 0.59, 0.11));
  vec3 t = mix(vec3(1.0), uSkyHor / max(L, 0.15), 0.35);
  return c * t * mix(1.0, 0.6, clamp((0.85 - L) * 1.8, 0.0, 1.0)) * mix(1.0, 0.42, uNight);
}
void main() {
  float r = vUv.y; // 0 tucked under the rock, 1 at the outer edge
  float n = texture2D(uBrush, vW.xz * 0.32 + vec2(uTime * 0.03, -uTime * 0.02)).r;
  float n2 = texture2D(uBrush, vW.xz * 0.85 - vec2(uTime * 0.05, uTime * 0.01)).g;
  float pulse = 0.5 + 0.5 * sin(uTime * 1.15 + vPh);
  float edge = 0.3 + 0.28 * pulse + (n - 0.5) * 0.4;
  float collar = 1.0 - smoothstep(edge - 0.1, edge, r);
  float lace = smoothstep(0.32, 0.5, n2 + (1.0 - r) * 0.55 - pulse * 0.08);
  float wave = fract(uTime * 0.16 + vPh * 0.159);
  float rr = 0.32 + wave * 0.66;
  float ring = smoothstep(0.07, 0.0, abs(r - rr)) * (1.0 - wave) * smoothstep(0.3, 0.55, n2);
  float a = max(collar * lace * 0.95, ring * 0.75) * smoothstep(1.0, 0.85, r);
  if (a < 0.01) discard;
  gl_FragColor = vec4(lit(vec3(0.96, 0.99, 0.98)), a);
}`;
/** foam collars on the sea: rings [{ x, z, r (the rock's waterline radius), w (how far the foam reaches), sx, sz
 *  (stretch), yaw, ph }] in world xz → the mesh */
export function foamRings(ctx, rings, { y = 0.018 } = {}) {
  const pos = [], uv = [], ph = [], idx = [];
  rings.forEach((R, ri) => {
    const N = Math.max(18, Math.round(R.r * 22)), base = pos.length / 3, c = Math.cos(R.yaw || 0), s = Math.sin(R.yaw || 0);
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU, wob = 1 + 0.1 * Math.sin(a * 3 + ri) + 0.06 * Math.sin(a * 5 + ri * 2.3);
      const ex = Math.cos(a) * (R.sx || 1), ez = Math.sin(a) * (R.sz || 1);
      for (const k of [0, 1]) {
        const rad = k ? R.r * wob + R.w * (1 + 0.25 * Math.sin(a * 4 + ri * 1.7)) : R.r * 0.82 * wob;
        const lx = ex * rad, lz = ez * rad;
        pos.push(R.x + lx * c + lz * s, y, R.z - lx * s + lz * c); uv.push(i / N * Math.round(R.r * 3 + 2), k); ph.push(R.ph ?? ri * 1.9);
      }
    }
    for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1)); g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({
    vertexShader: FOAM_VS, fragmentShader: FOAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uBrush: U.uBrush, uNight: U.uNight, uSkyHor: U.uSkyHor },
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; mesh.name = `${ctx.poi.id}-foam`; // (after the sea: it lies on it)
  ctx.add(mesh);
  return mesh;
}

/** a little coastal pine in the bonsai style (the concepts' pines): a leaning, curving trunk and a few flat cloud pads
 *  of dense needle cards (leaves only: no smooth masses), darker underneath, sunny on top. ~1.6 m × s tall. */
//  pad: the pads' scale (default s), padFrom: how far up the trunk the lowest pad grows (0..1)
export function cloudPine(B, rnd, { s = 1, lean = 0.35, pads = 4, dir = rnd() * TAU, pad = s, padFrom = 0.5 } = {}) {
  const ld = V(Math.cos(dir), 0, Math.sin(dir)), H = 1.25 * s;
  const tp = t => V(0, t * H, 0).addScaledVector(ld, Math.sin(t * 1.4) * lean * s).add(V(Math.sin(t * 5 + dir) * 0.06 * s, 0, Math.cos(t * 4 + dir) * 0.06 * s));
  const bA = new THREE.Color('#4a3830'), bB = new THREE.Color('#7c6454');
  const bark = (p, n, o) => o.copy(bA).lerp(bB, clamp(0.4 + 0.3 * n.y + 0.3 * Math.sin(Math.atan2(n.z, n.x) * 3 + p.y * 6 / s) + nz(p.y * 9 / s, p.x * 9 / s) * 0.2));
  const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ p: tp(t), r: s * (0.11 - t * 0.065) }); }
  B.add(tube(pts, 7, true), bark);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + dir, f = G.cyl(0.02 * s, 0.075 * s, 0.22 * s, 5); f.rotateZ(1.1); f.rotateY(-a); f.translate(Math.cos(a) * 0.09 * s, 0.04 * s, Math.sin(a) * 0.09 * s); B.add(f, bark); } // (root flare)
  const pal = ['#2c6444', '#3a7c50', '#4f945a', '#7cbc6a'].map(c => new THREE.Color(c));
  const centres = [];
  for (let i = 0; i < pads; i++) {
    const top = i === pads - 1, t = top ? 1 : padFrom + i * ((0.92 - padFrom) / Math.max(1, pads - 2)), a = dir + PI + (i % 2 ? 1 : -1) * (0.9 + rnd() * 0.6) + i * 0.4;
    const o = tp(Math.min(1, t)), c = top ? o.clone().add(V(0, 0.12 * pad, 0)) : o.clone().add(V(Math.cos(a) * 0.55 * pad, 0.12 * pad, Math.sin(a) * 0.55 * pad));
    if (!top) { const bp = [0, 1, 2, 3].map(k => ({ p: o.clone().lerp(c, k / 3).add(V(0, Math.sin(k / 3 * PI) * 0.08 * pad, 0)), r: Math.min(s, pad * 1.3) * (0.045 - k * 0.008) })); B.add(tube(bp, 5, false), bark); }
    centres.push({ c, R: (top ? 0.42 : 0.46 + rnd() * 0.1) * pad });
  }
  // each pad: a dark underside of broad flat cards, then tufts of short needles (a starburst of cards from a point)
  // packed over its flattened top, sunny on top, deeper green round the rim
  const X = V(1, 0, 0), q = new THREE.Quaternion(), dv = V();
  const trunkAt = t => tp(t);
  for (const { c, R } of centres) {
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + rnd() * 0.3, f = leafGeo(R * 0.8, R * 0.3, 0.1); f.rotateZ(-0.1); f.rotateY(-a); f.translate(c.x, c.y - R * 0.1, c.z);
      B.add(f, pal[0].clone().multiplyScalar(0.85), 'leaf');
    }
    const sn = Math.min(pad, 1.15), nT = Math.round(44 * (R / (0.45 * sn)) ** 2 * (pad > 1.2 ? 0.72 : 1));
    for (let i = 0; i < nT; i++) {
      const u = i < nT * 0.3 ? rnd() * 0.25 : 0.2 + rnd() * 0.8, th = rnd() * TAU, sr = Math.sqrt(1 - u * u);
      const nrm = V(sr * Math.cos(th), u * 2.2, sr * Math.sin(th)).normalize();
      const p = c.clone().add(V(sr * Math.cos(th) * R * 0.92, u * R * 0.36, sr * Math.sin(th) * R * 0.92));
      const base = pal[u > 0.62 ? (rnd() < 0.5 ? 3 : 2) : u > 0.25 ? 2 : 1].clone().offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.05);
      for (let k = 0; k < 5; k++) {
        dv.set(nrm.x + (rnd() - 0.5) * 1.1, nrm.y + (rnd() - 0.5) * 0.7, nrm.z + (rnd() - 0.5) * 1.1).normalize();
        const f = leafGeo((0.13 + rnd() * 0.06) * sn, 0.017 * sn, 0.25); f.rotateX(rnd() * PI); f.applyQuaternion(q.setFromUnitVectors(X, dv)); f.translate(p.x, p.y, p.z);
        B.add(f, base, 'leaf');
      }
    }
  }
  return { trunkAt };
}

// ---- sand: a patch of beach laid over the terrain (a draped grid a hair above it), its colour the terrain's own sand
// and grass/packed-earth formulas so its feathered edge melts into the ground round it; the grass blades are worn away
// under its heart (Terrain.wear, as the garden beds do). weight(lx, lz) → 0..1 in the frame F.
const SAND_FS = /* glsl */`{
  vec3 wp = vCWorld; float h = wp.y;
  vec4 tl = texture2D(uTiles, wp.xz / uWorld);
  float n1 = texture2D(uBrush, wp.xz * 0.021).g, n2 = texture2D(uBrush, wp.xz * 0.0071 + 0.31).g, n3 = texture2D(uBrush, wp.xz * 0.09).r;
  vec3 g1 = vec3(0.50, 0.80, 0.30), g2 = vec3(0.33, 0.64, 0.30), g3 = vec3(0.70, 0.84, 0.36), g4 = vec3(0.40, 0.72, 0.42);
  vec3 grass = mix(g2, g1, smoothstep(0.38, 0.62, n1));
  grass = mix(grass, g3, smoothstep(0.52, 0.72, n2) * 0.7);
  grass = mix(grass, g4, smoothstep(0.55, 0.75, 1.0 - n2) * 0.5);
  float wornA = clamp((1.0 - tl.a) * 1.6 - (tl.r + tl.g + tl.b) * 4.0, 0.0, 1.0) * smoothstep(0.12, 0.32, h);
  float wornN = smoothstep(0.3, 0.8, wornA + (n1 - 0.5) * 0.55 + (n3 - 0.5) * 0.4);
  vec3 earth = mix(vec3(0.62, 0.53, 0.40), vec3(0.72, 0.62, 0.46), n3);
  grass = mix(grass, mix(grass * 0.86, earth * vec3(1.06, 1.0, 0.9), 0.7 + 0.25 * smoothstep(0.7, 1.0, wornA)), wornN * 0.92);
  vec3 sand = mix(vec3(0.97, 0.88, 0.68), vec3(0.93, 0.80, 0.62), n3);
  float sandAmt = 1.0 - smoothstep(0.3, 0.75, h + (n1 - 0.5) * 0.5);
  float w = smoothstep(0.0, 1.0, vColor.r + (n3 - 0.5) * 0.35 * (1.0 - vColor.r) * vColor.r * 4.0);
  diffuseColor.rgb = mix(grass, sand, max(sandAmt, w));
}`;
export function sandPatch(ctx, F, weight, { x0, x1, z0, z1, step = 0.4, lift = 0.03 } = {}) {
  const T = ctx.world.terrain, nx = Math.ceil((x1 - x0) / step), nz2 = Math.ceil((z1 - z0) / step);
  const pos = [], col = [], idx = [], id = new Int32Array((nx + 1) * (nz2 + 1)).fill(-1);
  for (let j = 0; j <= nz2; j++) for (let i = 0; i <= nx; i++) {
    const lx = x0 + i * step, lz = z0 + j * step, w = weight(lx, lz), [wx, wz] = F.W(lx, lz), h = ctx.H(wx, wz);
    if (w <= 0 && weight(lx + step, lz) <= 0 && weight(lx - step, lz) <= 0 && weight(lx, lz + step) <= 0 && weight(lx, lz - step) <= 0) continue;
    if (h < 0.04) continue;
    id[j * (nx + 1) + i] = pos.length / 3; pos.push(wx, h + lift, wz); col.push(clamp(w), 0, 0);
  }
  for (let j = 0; j < nz2; j++) for (let i = 0; i < nx; i++) {
    const a = id[j * (nx + 1) + i], b = id[j * (nx + 1) + i + 1], c = id[(j + 1) * (nx + 1) + i], d = id[(j + 1) * (nx + 1) + i + 1];
    if (a >= 0 && b >= 0 && c >= 0) idx.push(a, c, b); if (b >= 0 && c >= 0 && d >= 0) idx.push(b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  // (the winding above faces down in world space for some turns: make every face look up)
  const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  const m = makeToon({
    vertexColors: true, brush: 0.16, brushScale: 0.22, rim: 0.0, shadowSat: 0.45,
    uniforms: { uTiles: { value: T?.tileTex || null }, uWorld: { value: WORLD } },
    fragPars: 'uniform sampler2D uTiles; uniform float uWorld;\n' + POOL_GLSL, fragColor: SAND_FS,
    fragOut: 'outgoingLight += lightPools(vCWorld) * diffuseColor.rgb;',
  });
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = `${ctx.poi.id}-sand`;
  ctx.add(mesh);
  // wear the grass away under the patch's heart (whole tiles only: the blades thin out across its feathered edge)
  if (T?.wear) {
    const c0 = F.W(x0, z0), c1 = F.W(x1, z0), c2 = F.W(x0, z1), c3 = F.W(x1, z1);
    const X0 = Math.floor(Math.min(c0[0], c1[0], c2[0], c3[0])), X1 = Math.ceil(Math.max(c0[0], c1[0], c2[0], c3[0])), Z0 = Math.floor(Math.min(c0[1], c1[1], c2[1], c3[1])), Z1 = Math.ceil(Math.max(c0[1], c1[1], c2[1], c3[1]));
    let n2 = 0;
    for (let tz = Z0; tz <= Z1; tz++) for (let tx = X0; tx <= X1; tx++) {
      if (tx < 0 || tz < 0 || tx >= WORLD || tz >= WORLD) continue;
      let ok = true; for (const [ox, oz] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) { const [lx, lz] = F.L(tx + ox, tz + oz); if (weight(lx, lz) < 0.85) { ok = false; break; } }
      if (ok) { T.wear[tz * WORLD + tx] = 255; n2++; }
    }
    if (n2) T.syncTiles?.();
  }
  return mesh;
}
