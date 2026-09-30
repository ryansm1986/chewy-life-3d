// Biomes B shared kit (Shiokaze Tidepools + Yukimi Onsen): batching-aware materials, a placement batcher that draws
// every placed geometry through one BatchedMesh per material (per-instance frustum culling for the camera AND the sun's
// shadow camera, one draw call per material), kit pieces (the building Builder: warp + painted ground AO) and small
// geometry helpers (blob discs, welded rocks, snow / wet paint). Owned by Biomes B; onsen*.js imports it too.
import * as THREE from 'three';
import { vegToon, VEG_MATS, Batch } from '../../world/vegetation.js';
import { U } from '../../gfx/materials.js';
import { detailMats } from '../../world/details.js';
import { Builder } from '../../world/buildings/kit.js';
import { puff, paint, merge, mergeVertices } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp, Noise } from '../../core/util.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const col = h => new THREE.Color(h);
export const PI = Math.PI;
export { TAU, clamp, mulberry32 };
const _nz = new Noise(8123);
export const nz = (x, y) => _nz.n2(x, y);
export const fbm = (x, y, o = 3) => _nz.fbm(x, y, o);

// ------------------------------------------------------------------ materials
// same painted look as the building kit (glow: uv.x = flicker, uv.y = tint, see Builder.glow)
const GLOW_FRAG = /* glsl */`
  totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb * 1.6, vGl.y)
    * (1.0 + vGl.x * (sin(uTime * 8.3 + vCWorld.x * 2.1 + vCWorld.z * 1.7) * 0.09 + sin(uTime * 19.0 + vCWorld.y * 7.0) * 0.05));
`;
const glowToon = (emissive, intensity) => vegToon({
  vertexColors: true, emissive, emissiveIntensity: intensity, brush: 0.06, rim: 0.12, term: [-0.2, 0.4],
  vertexPars: 'varying vec2 vGl;', vertexWorld: 'vGl = uv;', fragPars: 'varying vec2 vGl;', fragColor: GLOW_FRAG,
});
// Glossy ice: pale vertex colour, a cool fresnel sheen of the sky, a sun streak and sparkling glints that crawl as the
// camera moves (world-space hash cells), faint inner glow so ice reads bright at dusk.
const ICE = {
  uniforms: { uSunDir: U.uSunDir }, fragPars: 'uniform vec3 uSunDir;',
  fragOut: /* glsl */`{
    vec3 Vd = normalize(cameraPosition - vCWorld);
    vec3 Nw = normalize(vCWN);
    float fr = pow(1.0 - clamp(dot(Vd, Nw), 0.0, 1.0), 2.5);
    outgoingLight = mix(outgoingLight, vec3(0.86, 0.94, 1.0) * (0.75 + 0.25 * (1.0 - uNight)), fr * 0.55);
    vec3 H = normalize(Vd + normalize(uSunDir));
    float sp = pow(max(dot(Nw, H), 0.0), 60.0);
    vec3 cell = floor(vCWorld * 14.0);
    float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float tw = step(0.985, h) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 40.0 + dot(cameraPosition, vec3(1.3))));
    outgoingLight += vec3(1.0, 0.98, 0.94) * (sp * 0.5 + tw * 1.4 * (0.4 + fr));
    outgoingLight += diffuseColor.rgb * vec3(0.10, 0.16, 0.22) * (0.4 + uNight);
  }`,
};
// Shallow water in a basin: a flat disc whose uv.x is the normalised distance from the centre (0) to the rim (1)
// (blobDisc), coloured deeper toward the middle, with drifting ripples, caustic webs, a foam lip against the rocks
// and sun glints. `warm` > 0 turns it into a milky hot spring (steamy pale turquoise with a golden rim sheen);
// `glowAmt` > 0 lights it from within (the sea grotto's plankton pools).
function basinWater({ deep, shallow, foam = '#ffffff', alpha = [0.55, 0.9], warm = 0, glowAmt = 0, glowCol = '#6ff8ff' }) {
  const m = vegToon({
    transparent: true, vertexColors: false, rim: 0, brush: 0.04, shadowSat: 0.2, term: [-1.0, -0.5],
    uniforms: {
      uDeep: { value: col(deep) }, uShallow: { value: col(shallow) }, uFoamCol: { value: col(foam) },
      uAlpha: { value: new THREE.Vector2(...alpha) }, uWarm: { value: warm }, uGlow: { value: glowAmt }, uGlowCol: { value: col(glowCol) }, uSunDir: U.uSunDir,
    },
    vertexPars: 'varying vec2 vBw;', vertexWorld: 'vBw = uv;',
    fragPars: /* glsl */`
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoamCol; uniform vec2 uAlpha; uniform float uWarm; uniform float uGlow; uniform vec3 uGlowCol; uniform vec3 uSunDir;
      varying vec2 vBw; float bwFoam; float bwRip;
      float bwn(vec2 p) { return texture2D(uBrush, p).r; }`,
    fragColor: /* glsl */`{
      float r = clamp(vBw.x, 0.0, 1.0);
      vec2 flow = uTime * vec2(0.013, 0.021);
      float r1 = bwn(vCWorld.xz * 0.16 + flow), r2 = bwn(vCWorld.xz * 0.23 - flow * 1.4 + 0.5);
      bwRip = r1 * 0.5 + r2 * 0.5;
      float d = smoothstep(0.95, 0.15, r + (bwRip - 0.5) * 0.25);
      vec3 c = mix(uShallow, uDeep, d);
      c *= 0.92 + bwRip * 0.16;
      float ca = abs(sin(r1 * 19.0 + uTime * 1.3) * sin(r2 * 17.0 - uTime * 0.95));
      c += vec3(0.75, 1.0, 0.95) * smoothstep(0.78, 1.0, ca) * (0.18 + 0.1 * (1.0 - d)) * (1.0 - uWarm * 0.6);
      float band = sin(r * 26.0 - uTime * 1.6 + bwRip * 6.0);
      float f = smoothstep(0.86, 0.99, r + (bwRip - 0.5) * 0.06) + smoothstep(0.7, 0.95, band) * smoothstep(0.72, 0.92, r) * 0.45;
      bwFoam = clamp(f, 0.0, 1.0);
      c = mix(c, uFoamCol, bwFoam * 0.8);
      // hot spring: milky swirls of mineral colour
      float sw = bwn(vCWorld.xz * 0.09 + vec2(uTime * 0.01, -uTime * 0.006));
      c = mix(c, c * vec3(1.05, 1.02, 0.96) + vec3(0.08, 0.07, 0.04), uWarm * smoothstep(0.4, 0.7, sw));
      diffuseColor.rgb = c;
      diffuseColor.a = clamp(mix(uAlpha.x, uAlpha.y, d) + bwFoam * 0.4, 0.0, 1.0);
    }`,
    fragOut: /* glsl */`{
      vec3 Vd = normalize(cameraPosition - vCWorld);
      float r1 = bwn(vCWorld.xz * 0.31 + uTime * vec2(0.03, 0.05)), r2 = bwn(vCWorld.xz * 0.37 - uTime * vec2(0.04, 0.02) + 0.3);
      vec3 N = normalize(vec3((r1 - 0.5) * 0.9, 1.0, (r2 - 0.5) * 0.9));
      float fres = pow(1.0 - clamp(dot(Vd, N), 0.0, 1.0), 3.0);
      outgoingLight = mix(outgoingLight, vec3(0.85, 0.95, 1.0) * (0.6 + 0.4 * (1.0 - uNight)), fres * 0.3 * (1.0 - bwFoam));
      float spec = pow(max(dot(reflect(-Vd, N), normalize(uSunDir)), 0.0), 160.0);
      float glint = step(0.62, r1 * r2 * 2.2) * spec;
      outgoingLight += vec3(1.0, 0.95, 0.85) * (spec * 0.7 + glint * 3.0) * (1.0 - uNight * 0.7);
      outgoingLight += uGlowCol * uGlow * (0.55 + 0.45 * smoothstep(0.9, 0.1, vBw.x)) * (0.85 + 0.3 * r1);
      outgoingLight += vec3(1.0, 0.8, 0.5) * uWarm * uNight * 0.08;
    }`,
  });
  m.depthWrite = false;
  return m;
}
// scrolling bright bands for poured water (bamboo spout, grotto drips); uv.y runs along the stream
const JET = {
  vertexPars: 'varying vec2 vJ;', vertexWorld: 'vJ = uv;', fragPars: 'varying vec2 vJ;',
  fragColor: /* glsl */`{
    float b = sin(vJ.y * 30.0 - uTime * 10.0 + vJ.x * 6.2831) * 0.5 + 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(0.55, 0.95, b) * 0.6);
  }`,
};

/**
 * The Biomes B material set, created per world build (dispose with disposeMats). Keys are the Placer's batch keys.
 * night: 0 (tidepool day) .. ~0.45 (onsen dusk): drives how bright the night-glow lanterns / windows burn.
 */
export function makeMats({ night = 0 } = {}) {
  const dm = detailMats();
  const lamp = 0.08 + 2.1 * clamp(night * 1.9);
  dm.glow.emissiveIntensity = lamp;
  const M = {
    ...dm,
    bark: VEG_MATS.bark(), foliage: VEG_MATS.foliage(), bushFol: VEG_MATS.foliage({ occluder: false }),
    'cards:pine': VEG_MATS.cards('pine'), 'cards:round': VEG_MATS.cards('round', { occluder: false }),
    'cards:bloom': VEG_MATS.cards('sakura', { occluder: false }), 'cards:pineLow': VEG_MATS.cards('pine', { occluder: false }),
    rock: VEG_MATS.rock(),
    hot: glowToon('#ffffff', 1.6),
    ice: vegToon({ ...ICE, vertexColors: true, brush: 0.08, rim: 0.5, term: [-0.25, 0.3], shadowSat: 0.2 }),
    jet: vegToon({ ...JET, vertexColors: true, transparent: true, opacity: 0.8, emissive: '#9fe0ff', emissiveIntensity: 0.3, rim: 0.7, brush: 0.02 }),
    poolWater: basinWater({ deep: '#1f9fb8', shallow: '#6fe6dc', alpha: [0.45, 0.88] }),
    springWater: basinWater({ deep: '#5fc8c4', shallow: '#a8ece0', foam: '#fffaf0', alpha: [0.82, 0.96], warm: 1 }),
    glowWater: basinWater({ deep: '#0c5a78', shallow: '#2fb8c8', foam: '#c8fff8', alpha: [0.75, 0.95], glowAmt: 0.55, glowCol: '#5ff4ff' }),
  };
  M.jet.depthWrite = false;
  M.lamp = lamp;
  return M;
}
export function disposeMats(M) {
  const seen = new Set();
  for (const m of Object.values(M)) {
    if (!m || !m.isMaterial || seen.has(m)) continue; seen.add(m);
    m.userData?.depthMat?.dispose?.(); m.dispose();
  }
}

// ------------------------------------------------------------------ placement batcher
const BUCKET_KEY = { body: 'body', glow: 'glow', hot: 'hot', leaf: 'leaf', cloth: 'cloth', water: 'body', jet: 'jet' };
const BATCH_OPTS = {
  flat: { castShadow: false, sort: false }, grass: { castShadow: false, sort: false }, reed: { castShadow: false, sort: false },
  cloth: { castShadow: false, sort: false }, glow: { castShadow: false, sort: false }, hot: { castShadow: false, sort: false },
  'cards:pine': { castShadow: false }, 'cards:pineLow': { castShadow: false, sort: false }, 'cards:round': { castShadow: false, sort: false }, 'cards:bloom': { castShadow: false, sort: false },
  bushFol: { sort: false }, stone: { sort: false }, rock: { sort: false }, ice: { sort: false },
  jet: { castShadow: false }, poolWater: { castShadow: false }, springWater: { castShadow: false }, glowWater: { castShadow: false },
};
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export class Placer {
  constructor(mats) {
    this.mats = mats; this.batches = new Map(); this.group = new THREE.Group(); this.group.name = 'biomeB';
    this.lights = []; this.colliders = []; this.count = 0; this.tris = 0;
    this.geos = new Set(); // source geometries (disposed after the batches copy them)
  }
  batch(key) {
    let b = this.batches.get(key);
    if (!b) { const m = this.mats[key]; if (!m) throw new Error('Placer: no material ' + key); b = new Batch('b:' + key, m, BATCH_OPTS[key] || {}); this.batches.set(key, b); }
    return b;
  }
  /** one instance of geo in batch `key` at (x, y, z). rot = yaw; s = scale (number | [x, y, z]); tilt = [rx, rz] */
  put(key, geo, x, y, z, { rot = 0, s = 1, tilt = null, color = null } = {}) {
    if (!geo) return;
    _e.set(tilt ? tilt[0] : 0, rot, tilt ? tilt[1] : 0, 'YXZ'); _q.setFromEuler(_e);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.setScalar(s);
    _m4.compose(_p.set(x, y, z), _q, _s);
    this.putM(key, geo, _m4, color);
  }
  putM(key, geo, m4, color = null) {
    // a batch needs one attribute layout: cards stay indexed (CardSet), everything else is non-indexed
    // position / normal / uv / color (geom.merge's layout); normalised copies are cached per source geometry
    const g = key.startsWith('cards:') ? geo : this._norm(geo);
    if (!g.boundingSphere) g.computeBoundingSphere();
    this.batch(key).add(g, m4, color, { parts: [] });
    this.geos.add(geo); this.geos.add(g); this.count++;
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  _norm(geo) {
    const c = (this._nc ||= new Map()).get(geo); if (c) return c;
    const a = geo.attributes;
    let g = geo;
    if (geo.index || !a.uv || !a.color || !a.normal || Object.keys(a).length !== 4) {
      g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.color) { const cc = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    this._nc.set(geo, g);
    return g;
  }
  /** a kit piece ({body, glow, hot, leaf, cloth, water, jet, lights}) at (x, y, z) facing yaw rot */
  piece(pc, x, y, z, rot = 0, s = 1, { lights = true } = {}) {
    _q.setFromAxisAngle(V(0, 1, 0), rot); _m4.compose(_p.set(x, y, z), _q, _s.setScalar(s));
    const m = _m4.clone();
    for (const k of Object.keys(BUCKET_KEY)) if (pc[k]) this.putM(BUCKET_KEY[k], pc[k], m);
    if (lights) for (const l of pc.lights || []) this.lights.push({ ...l, pos: l.pos.clone().applyMatrix4(m) });
  }
  collider(x, z, r) { this.colliders.push({ x, z, r }); }
  build() {
    for (const b of this.batches.values()) { const bm = b.build(this.group); if (bm) bm.userData.biomeB = true; }
    for (const g of this.geos) g.dispose();
    this.geos.clear(); this._nc = null;
    return this.group;
  }
  dispose() {
    for (const b of this.batches.values()) if (b.mesh) { b.mesh.parent?.remove(b.mesh); b.mesh.dispose(); }
    this.batches.clear();
  }
}

// ------------------------------------------------------------------ host adapter
/** Normalise the engine's populate / effects ctx (docs/REGIONS.md §3.6) into the few calls Biomes B uses. */
export function hostOf(ctx = {}) {
  const W = ctx.world || {}, T = ctx.terrain || W.T || W.rt || W.L?.terrain || ctx.layout?.terrain;
  const plan = ctx.plan || T?.plan || ctx.layout?.plan || W.L?.plan;
  const disposers = [];
  const h = {
    ctx, world: W, terrain: T, plan, G: ctx.G || W.G || globalThis.G,
    heightAt: (x, z) => (ctx.heightAt ? ctx.heightAt(x, z) : T ? T.heightAt(x, z) : W.heightAt ? W.heightAt(x, z) : 0),
    waterAt: (x, z) => T?.waterAt?.(x, z) ?? 0,
    slopeAt: (x, z) => T?.slopeAt?.(x, z) ?? 0,
    openDist: (x, z) => T?.openDist?.(x, z) ?? 99,
    trailDist: (x, z) => T?.trailDist?.(x, z) ?? 99,
    add: obj => { if (ctx.add) ctx.add(obj); else (ctx.scene || W.scene).add(obj); return obj; },
    remove: obj => { obj.parent?.remove(obj); },
    light: src => (ctx.addLight ? ctx.addLight(src) : (ctx.lightPool || W.lightPool)?.addSource(src)),
    collider: (x, z, r) => { if (ctx.addCollider) ctx.addCollider(x, z, r); else W.collision?.addCircle?.(x, z, r); },
    block: (x, z, r) => { ctx.blockCells?.(x, z, r); },
    pool: p => { if (ctx.addPool) ctx.addPool(p); else T?.pools?.push(p); },
    paint: (layer, x, z, r, v, soft) => T?.paint?.(layer, x, z, r, v, soft),
    onDispose: fn => { if (ctx.onDispose) ctx.onDispose(fn); else disposers.push(fn); },
    disposeAll: () => { for (const f of disposers.splice(0)) f(); },
    vfx: () => ctx.vfx || h.G?.vfx,
    quality: ctx.quality ?? W.engine?.quality ?? 2,
  };
  return h;
}
/** 1 m occupancy grid over the map, so scattered props keep their distance from each other */
export class Occ {
  constructor(N = 112) { this.N = N; this.g = new Uint8Array(N * N); }
  free(x, z, r) {
    const N = this.N, x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.floor(x + r)), z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(N - 1, Math.floor(z + r));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) if (this.g[j * N + i] && Math.hypot(i + 0.5 - x, j + 0.5 - z) < r + 0.5) return false;
    return true;
  }
  mark(x, z, r) {
    const N = this.N, x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.floor(x + r)), z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(N - 1, Math.floor(z + r));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) if (Math.hypot(i + 0.5 - x, j + 0.5 - z) < r) this.g[j * N + i] = 1;
  }
}

// ------------------------------------------------------------------ kit pieces
/** build with the building kit (warp + painted ground AO); returns bucket geometries + lamp lights (local space) */
export function kitPiece(seed, fn, warp = 0.02) {
  const B = new Builder(seed); B.warpAmt = warp; B.jitter = 0.04;
  fn(B);
  const t = B.finish();
  return { ...t.geos, lights: t.lights };
}

// ------------------------------------------------------------------ geometry helpers
/** Flat irregular disc facing +y: rim radius R * (1 + wobble noise), uv.x = normalised radius (0 centre, 1 rim) */
export function blobDisc(R, { seed = 0, segs = 28, rings = 4, wob = 0.18, sx = 1, sz = 1 } = {}) {
  const r = mulberry32(seed * 131 + 17), ph = [r() * TAU, r() * TAU, r() * TAU];
  const rim = a => R * (1 + wob * (0.55 * Math.sin(2 * a + ph[0]) + 0.3 * Math.sin(3 * a + ph[1]) + 0.15 * Math.sin(5 * a + ph[2])));
  const pos = [0, 0, 0], uv = [0, 0], idx = [];
  for (let i = 1; i <= rings; i++) for (let k = 0; k < segs; k++) {
    const t = i / rings, a = k / segs * TAU, rr = rim(a) * t;
    pos.push(Math.cos(a) * rr * sx, 0, Math.sin(a) * rr * sz); uv.push(t, k / segs);
  }
  for (let k = 0; k < segs; k++) idx.push(0, 1 + (k + 1) % segs, 1 + k);
  for (let i = 1; i < rings; i++) for (let k = 0; k < segs; k++) {
    const a = 1 + (i - 1) * segs + k, b = 1 + (i - 1) * segs + (k + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.rim = a => rim(a);
  return g;
}
/** welded, round-shaded lumpy stone (puff), indexed; painted later */
export function lump(c, r, { detail = 2, noise = 0.3, squash = 0.6, seed = 0, sx = 1, sz = 1 } = {}) {
  const g0 = puff(c, r, { detail, noise, squash, seed });
  if (sx !== 1 || sz !== 1) { g0.translate(-c.x, 0, -c.z); g0.scale(sx, 1, sz); g0.translate(c.x, 0, c.z); }
  g0.deleteAttribute('normal'); if (g0.attributes.uv) g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4); g.computeVertexNormals();
  return g;
}
/** Raised cushion over the up-facing part of a (welded) geometry: snow on rocks / roofs / branches. amt 0..1 */
export function capOf(g, { amt = 0.5, lift = 0.04, sc = 3, seed = 0, color = '#f6f9ff', shade = '#c8d4f0', thick = 1 } = {}) {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position, n = src.attributes.normal, P = [], N = [];
  const line = (ny, x, z) => ny - (0.98 - amt * 0.75) + nz(x * sc + seed, z * sc - seed * 1.7) * 0.22;
  for (let f = 0; f < p.count; f += 3) {
    let ny = 0, cx = 0, cz = 0;
    for (let k = 0; k < 3; k++) { ny += n.getY(f + k) / 3; cx += p.getX(f + k) / 3; cz += p.getZ(f + k) / 3; }
    if (line(ny, cx, cz) <= 0) continue;
    for (let k = 0; k < 3; k++) {
      const nx = n.getX(f + k), nyy = n.getY(f + k), nzz = n.getZ(f + k);
      const up = lift * (0.6 + 0.4 * clamp(nyy)) * thick;
      P.push(p.getX(f + k) + nx * lift * 0.5, p.getY(f + k) + up, p.getZ(f + k) + nzz * lift * 0.5);
      N.push(nx * 0.5, nyy + 0.6, nzz * 0.5);
    }
  }
  if (src !== g) src.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.normalizeNormals();
  const c = col(color), s = col(shade);
  return paint(out, (pp, nn, o) => o.copy(s).lerp(c, clamp(nn.y * 1.3 - 0.2)).multiplyScalar(0.96 + 0.06 * nz(pp.x * 9, pp.z * 9)));
}
/** paint snow onto up-facing vertices (in place): k = 0..1 how much; keeps the underlying colour on steep faces */
export function snowPaint(g, { k = 0.6, sc = 2.5, seed = 0, snow = '#f4f8ff', shade = '#cdd8f2' } = {}) {
  const c = g.attributes.color, p = g.attributes.position, n = g.attributes.normal; if (!c) return g;
  const sn = col(snow), sh = col(shade), o = new THREE.Color(), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i), x = p.getX(i), z = p.getZ(i);
    const m = clamp((ny - (0.95 - k * 0.8) + nz(x * sc + seed, z * sc + p.getY(i) * 1.3) * 0.25) * 5);
    if (m <= 0) continue;
    o.setRGB(c.getX(i), c.getY(i), c.getZ(i));
    t.copy(sh).lerp(sn, clamp(ny * 1.2 - 0.1));
    o.lerp(t, m);
    c.setXYZ(i, o.r, o.g, o.b);
  }
  c.needsUpdate = true;
  return g;
}
/** Tapered strip (ribbon) along points [{p, w}], facing `side` → a double-sided blade / kelp frond / noren strip. */
export function ribbon(pts, side, { uvY = true } = {}) {
  const pos = [], uv = [], idx = [];
  const L = pts.length - 1;
  pts.forEach((q, i) => {
    const hw = q.w / 2, s = q.side || side;
    pos.push(q.p.x - s.x * hw, q.p.y - s.y * hw, q.p.z - s.z * hw, q.p.x + s.x * hw, q.p.y + s.y * hw, q.p.z + s.z * hw);
    uv.push(0, uvY ? i / L : 0, 1, uvY ? i / L : 0);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** shear a geometry's vertices by lean * y^pow along dir (wind-bent trees), in place */
export function lean(g, dir, k, pw = 2, h0 = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i) - h0), s = k * Math.pow(y, pw); p.setX(i, p.getX(i) + dir.x * s); p.setZ(i, p.getZ(i) + dir.z * s); }
  p.needsUpdate = true;
  return g;
}
export { merge, paint };
