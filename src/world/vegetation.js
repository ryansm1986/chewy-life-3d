// Japanese-garden vegetation: sakura, momiji, niwaki pines, round trees, bamboo, hydrangea, susuki,
// flowers and a GPU grass field. Everything sways with the shared wind and bends around actors.
import * as THREE from 'three';
import { makeToon, applyDepth } from '../gfx/materials.js';
import { leafCardTexture, floretTexture } from '../gfx/textures.js';
import { branch, puff, cards, paint, merge, xf, tube } from '../gfx/geom.js';
import { mulberry32, TAU, clamp, Noise } from '../core/util.js';
import { T, WORLD, OVERLAY_GLSL } from './terrain.js';
import { treeKeepOut } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = h => new THREE.Color(h);

// ------------------------------------------------------------------ tree species
export const TREE_SPECIES = {
  sakura: { leaf: 'blossom', palette: ['#ffbcd6', '#f792ba', '#d66a9c', '#fff0f6'], bark: ['#6e4a52', '#8a6068'], radius: 0.45 },
  momiji: { leaf: 'maple', palette: ['#ff8a5a', '#f0604a', '#ffac5a', '#ffd488'], bark: ['#5a4038', '#7a5648'], radius: 0.4 },
  pine: { leaf: 'needle', palette: ['#3f8f5e', '#2f7a52', '#5aa870', '#6ab87a'], bark: ['#6a5048', '#8a6a58'], radius: 0.4 },
  round: { leaf: 'leaf', palette: ['#6ab04c', '#4a9446', '#8cc860', '#c4e07a'], bark: ['#6e5444', '#8c6a54'], radius: 0.4 },
  ginkgo: { leaf: 'leaf', palette: ['#ffd24a', '#ffc030', '#ffe070', '#f4b830'], bark: ['#6e5444', '#8c6a54'], radius: 0.35 },
};

function paintFoliage(g, palette, r, crownY, h0) {
  const cA = col(palette[0]), cB = col(palette[1]), cC = col(palette[2]), cHi = col(palette[3]);
  const tmp = new THREE.Color();
  return paint(g, (p, n, o) => {
    const t = clamp((p.y - h0) / Math.max(0.5, crownY - h0 + 1.2));
    o.copy(cC).lerp(cB, clamp(t * 1.4)).lerp(cA, clamp(t * 1.2 - 0.2));
    o.lerp(cHi, clamp((n.y - 0.35) * 0.9) * 0.55);
    tmp.set(0.86, 0.8, 0.95); if (n.y < -0.2) o.multiply(tmp);
  });
}

function buildTree(kind, seed) {
  const S = TREE_SPECIES[kind];
  const r = mulberry32(seed * 131 + kind.length);
  const trunk = [], puffs = [], cardList = [];
  let crownCenter;
  const bark = (g) => paint(g, (p, n, o) => { o.copy(col(S.bark[0])).lerp(col(S.bark[1]), clamp(n.y * 0.5 + 0.5 + (p.y % 0.7) * 0.2)); });
  if (kind === 'sakura' || kind === 'round' || kind === 'momiji' || kind === 'ginkgo') {
    const H = kind === 'sakura' ? 1.7 : kind === 'ginkgo' ? 2.2 : 1.9;
    const lean = V((r() - 0.5) * 0.7, H, (r() - 0.5) * 0.7);
    trunk.push(branch(V(0, -0.2, 0), lean, 0.32, 0.2, V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), 6, 8));
    // root flare
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r(); trunk.push(branch(V(0, 0.35, 0), V(Math.cos(a) * 0.55, -0.1, Math.sin(a) * 0.55), 0.14, 0.05, V(0, 0.08, 0), 3, 5)); }
    const nb = kind === 'sakura' ? 4 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
    const spread = kind === 'sakura' ? 1.9 : kind === 'ginkgo' ? 1.1 : 1.3;
    for (let i = 0; i < nb; i++) {
      const a = i / nb * TAU + r() * 0.7, d = spread * (0.7 + r() * 0.5), h = H + 0.9 + r() * (kind === 'ginkgo' ? 1.8 : 1.0);
      const end = V(lean.x + Math.cos(a) * d, h, lean.z + Math.sin(a) * d);
      trunk.push(branch(lean, end, 0.17, 0.06, V(0, 0.35, 0), 5, 6));
      puffs.push({ c: end.clone().add(V(0, 0.35, 0)), r: (kind === 'sakura' ? 1.15 : 1.0) + r() * 0.45 });
    }
    puffs.push({ c: V(lean.x, H + 2.0 + (kind === 'ginkgo' ? 1.2 : 0), lean.z), r: kind === 'sakura' ? 1.45 : 1.35 });
    if (kind === 'ginkgo') puffs.push({ c: V(lean.x, H + 3.4, lean.z), r: 1.0 });
    crownCenter = puffs.reduce((a, p) => a.add(p.c), V(0, 0, 0)).multiplyScalar(1 / puffs.length);
  } else if (kind === 'pine') {
    // twisting trunk with flat cloud pads (niwaki)
    const pts = []; let p = V(0, -0.2, 0); const segs = 7;
    for (let i = 0; i <= segs; i++) { pts.push({ p: p.clone(), r: 0.3 - i * 0.025 }); p = p.clone().add(V((r() - 0.5) * 0.6 + Math.sin(i) * 0.25, 0.62, (r() - 0.5) * 0.6)); }
    trunk.push(tube(pts, 8, true));
    const top = pts[pts.length - 1].p;
    for (let i = 0; i < 5; i++) {
      const src = pts[2 + Math.floor(r() * (segs - 2))].p;
      const a = r() * TAU, d = 1.1 + r() * 0.9;
      const end = V(src.x + Math.cos(a) * d, src.y + 0.3 + r() * 0.5, src.z + Math.sin(a) * d);
      trunk.push(branch(src, end, 0.1, 0.05, V(0, 0.25, 0), 4, 5));
      puffs.push({ c: end.clone().add(V(0, 0.2, 0)), r: 0.75 + r() * 0.35, squash: 0.45 });
    }
    puffs.push({ c: top.clone().add(V(0, 0.2, 0)), r: 1.0, squash: 0.5 });
    crownCenter = puffs.reduce((a, q) => a.add(q.c), V(0, 0, 0)).multiplyScalar(1 / puffs.length);
  }
  const trunkGeo = bark(merge(trunk));
  // break each big puff into a cluster of small round clumps (cauliflower canopy)
  const small = [];
  for (const q of puffs) {
    const sq = q.squash || 0.85;
    const nSub = kind === 'pine' ? 5 : 7;
    small.push({ c: q.c.clone(), r: q.r * 0.72, sq });
    for (let k = 0; k < nSub; k++) {
      const u = r() * 1.3 - 0.3, th = r() * TAU;
      const dir = V(Math.sqrt(Math.max(0, 1 - u * u)) * Math.cos(th), u * sq, Math.sqrt(Math.max(0, 1 - u * u)) * Math.sin(th)).normalize();
      small.push({ c: q.c.clone().addScaledVector(dir, q.r * (0.55 + r() * 0.2)), r: q.r * (0.42 + r() * 0.16), sq });
    }
  }
  const pal = S.palette.map(h => col(h));
  const foliageParts = small.map((q, i) => {
    const g = cullBuried(puff(q.c, q.r, { detail: 2, noise: 0.12, squash: q.sq, crown: crownCenter, crownMix: 0.42, seed: seed * 3 + i }), q, small);
    const t = clamp((q.c.y - (crownCenter.y - 1.4)) / 2.6);
    const base = pal[2].clone().lerp(pal[1], clamp(t * 1.3)).lerp(pal[0], clamp(t * 1.6 - 0.4));
    base.offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.08, (r() - 0.5) * 0.06);
    const hi = pal[3];
    return paint(g, (p, n, o) => { o.copy(base).lerp(hi, clamp((n.y - 0.3) * 0.8) * 0.5); if (n.y < -0.3) o.multiplyScalar(0.9); });
  });
  const foliage = merge(foliageParts);
  const nc = kind === 'sakura' ? 26 : kind === 'pine' ? 10 : 14;
  const cardGeo = merge(puffs.map((q, i) => cards(q.c, q.r * 1.05, nc, { size: kind === 'sakura' ? 0.9 : 0.7, crown: crownCenter, seed: seed * 10 + i, squash: q.squash || 0.85, upBias: 0.2 })));
  const minY = Math.min(...puffs.map(q => q.c.y - q.r));
  paintFoliage(cardGeo, S.palette, r, crownCenter.y, minY);
  return { trunkGeo, foliage, cardGeo, height: crownCenter.y + 1.5 };
}

// Drop canopy triangles buried inside neighbouring clumps (never visible, ~40% of a cauliflower crown).
// Conservative: a vertex counts as buried only well inside another clump (noise margin) and above its flattened belly.
function cullBuried(g, self, all) {
  const pos = g.attributes.position, n = pos.count;
  const buried = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    for (const q of all) {
      if (q === self || y < q.c.y - q.r * q.sq * 0.25) continue;
      const dx = x - q.c.x, dy = (y - q.c.y) / q.sq, dz = z - q.c.z, rr = q.r * 0.84;
      if (dx * dx + dy * dy + dz * dz < rr * rr) { buried[i] = 1; break; }
    }
  }
  const keep = [];
  for (let t = 0; t < n; t += 3) if (!(buried[t] && buried[t + 1] && buried[t + 2])) keep.push(t);
  if (keep.length * 3 === n) return g;
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const w = attr.itemSize, src = attr.array, dst = new src.constructor(keep.length * 3 * w);
    let o = 0;
    for (const t of keep) for (let k = 0; k < 3 * w; k++) dst[o++] = src[t * w + k];
    out.setAttribute(name, new THREE.BufferAttribute(dst, w));
  }
  g.dispose();
  return out;
}

// ------------------------------------------------------------------ bamboo
function buildBamboo(seed) {
  const r = mulberry32(seed + 900);
  const parts = [], leaves = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 1.6, z = (r() - 0.5) * 1.6, h = 4.5 + r() * 2.5, lean = V((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    const pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push({ p: V(x + lean.x * t * t * h * 0.2, t * h, z + lean.z * t * t * h * 0.2), r: 0.09 - t * 0.03 }); }
    const g = tube(pts, 6, false);
    paint(g, (p, nn, o) => { const seg = (p.y % 0.6) / 0.6; o.set('#8fd06a').lerp(col('#c8e890'), clamp(nn.x * 0.3 + 0.3)); if (seg < 0.06) o.set('#5a9a48'); });
    parts.push(g);
    // node rings
    for (let y = 0.6; y < h - 0.3; y += 0.6) { const t = y / h; const ring = new THREE.TorusGeometry(0.075 - t * 0.02, 0.018, 4, 8); xf(ring, { p: [x + lean.x * t * t * h * 0.2, y, z + lean.z * t * t * h * 0.2], r: [Math.PI / 2, 0, 0] }); paint(ring, (p, nn, o) => o.set('#6aae50')); parts.push(ring); }
    const top = pts[pts.length - 1].p;
    leaves.push(cards(top.clone().add(V(0, -0.8, 0)), 0.9, 7, { size: 1.3, crown: top.clone().add(V(0, -1.5, 0)), seed: seed * 7 + i, squash: 0.6 }));
    leaves.push(cards(V(x, h * 0.62, z), 0.6, 4, { size: 1.1, crown: V(x, h * 0.5, z), seed: seed * 13 + i, squash: 0.6 }));
  }
  const leafGeo = paint(merge(leaves), (p, nn, o) => o.set('#7cc85a').lerp(col('#b0e27a'), clamp(nn.y)));
  return { stalks: merge(parts), leaves: leafGeo };
}

// ------------------------------------------------------------------ bushes
function buildBush(kind, seed) {
  const r = mulberry32(seed + 77);
  const puffs = [], flowers = [];
  const n = 3 + Math.floor(r() * 3);
  const crown = V(0, 0.45, 0);
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * 0.45; puffs.push({ c: V(Math.cos(a) * d, 0.35 + r() * 0.25, Math.sin(a) * d), r: 0.38 + r() * 0.2 }); }
  const g = merge(puffs.map((q, i) => puff(q.c, q.r, { detail: 2, noise: 0.25, crown, crownMix: 0.5, seed: seed + i })));
  paint(g, (p, nn, o) => { o.set(kind === 'azalea' ? '#5a9a4a' : '#4f9a58').lerp(col('#8ccf6a'), clamp(nn.y * 0.6 + 0.2)); });
  if (kind === 'hydrangea' || kind === 'azalea') {
    const pal = kind === 'hydrangea' ? (r() < 0.5 ? ['#8aa8ff', '#b8a0ff', '#d6c8ff'] : ['#ff9ec8', '#e8a0ff', '#ffd0ec']) : ['#ff7aa8', '#ff9ec0', '#ffc8dc'];
    for (let i = 0; i < (kind === 'azalea' ? 14 : 8); i++) {
      const q = puffs[Math.floor(r() * puffs.length)];
      const dir = V(r() - 0.5, 0.4 + r() * 0.6, r() - 0.5).normalize();
      const c = q.c.clone().addScaledVector(dir, q.r * 0.95);
      const fr = kind === 'azalea' ? 0.1 + r() * 0.05 : 0.17 + r() * 0.07;
      const f = puff(c, fr, { detail: 1, noise: 0.35, crown, crownMix: 0.3, seed: i + seed });
      const cc = col(pal[Math.floor(r() * pal.length)]);
      paint(f, (p, nn, o) => o.copy(cc).lerp(col('#ffffff'), clamp(nn.y * 0.3)));
      flowers.push(f);
    }
  }
  return merge([g, ...flowers]);
}

// ------------------------------------------------------------------ grass blade + flower + susuki meshes
function bladeGeo() {
  const segs = 4, pos = [], idx = [], uv = [];
  for (let i = 0; i <= segs; i++) {
    const y = i / segs, w = 0.5 * Math.pow(1 - y, 0.9), z = y * y * 0.25;
    if (i < segs) { pos.push(-w, y, z, w, y, z); uv.push(0, y, 1, y); } else { pos.push(0, y, z); uv.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function flowerGeo(kind) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.02, 0.025, 1, 3, 1, true); xf(stem, { p: [0, 0.5, 0] });
  paint(stem, (p, n, o) => o.set('#3a7a3a')); parts.push(stem);
  if (kind === 'daisy') {
    for (let i = 0; i < 6; i++) { const pe = new THREE.SphereGeometry(0.1, 5, 3); xf(pe, { p: [Math.cos(i / 6 * TAU) * 0.12, 1, Math.sin(i / 6 * TAU) * 0.12], s: [1.4, 0.35, 0.8], r: [0, -i / 6 * TAU, 0] }); paint(pe, (p, n, o) => o.set('#ffffff')); parts.push(pe); }
    const c = new THREE.SphereGeometry(0.07, 6, 4); xf(c, { p: [0, 1.03, 0], s: [1, 0.6, 1] }); paint(c, (p, n, o) => o.set('#ffd23a')); parts.push(c);
  } else if (kind === 'bell') {
    for (let i = 0; i < 3; i++) { const b = new THREE.ConeGeometry(0.1, 0.16, 6, 1, true); xf(b, { p: [Math.cos(i * 2.1) * 0.08, 0.92 + i * 0.06, Math.sin(i * 2.1) * 0.08], r: [Math.PI, 0, 0.3] }); paint(b, (p, n, o) => o.set('#ffffff')); parts.push(b); }
  } else { // tulip-ish cup
    const cup = new THREE.SphereGeometry(0.13, 7, 5, 0, TAU, 0, Math.PI * 0.62); xf(cup, { p: [0, 1.06, 0], s: [1, 1.3, 1], r: [Math.PI, 0, 0] }); paint(cup, (p, n, o) => o.set('#ffffff')); parts.push(cup);
  }
  const g = merge(parts); g.computeBoundingSphere(); return g;
}
function susukiGeo(seed) {
  const r = mulberry32(seed + 5), parts = [];
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, h = 1.1 + r() * 0.6, lean = 0.25 + r() * 0.3;
    const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(Math.cos(a) * lean * t * t, t * h, Math.sin(a) * lean * t * t), r: 0.025 * (1 - t * 0.7) }); }
    const g = tube(pts, 3, true); paint(g, (p, n, o) => o.set('#6a9a4a').lerp(col('#b8c878'), p.y / h)); parts.push(g);
    if (i < 6) { // plume
      const top = pts[5].p, pl = [];
      for (let k = 0; k <= 4; k++) { const t = k / 4; pl.push({ p: top.clone().add(V(Math.cos(a) * 0.22 * t, 0.35 * t - 0.05, Math.sin(a) * 0.22 * t)), r: 0.07 * Math.sin(t * Math.PI) + 0.01 }); }
      const pg = tube(pl, 5, true); paint(pg, (p, n, o) => o.set('#f4e4c8').lerp(col('#fff8ec'), clamp(n.y))); parts.push(pg);
    }
  }
  // long leaves
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU; const pts = [];
    for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push({ p: V(Math.cos(a) * 0.6 * t, Math.sin(t * 2.2) * 0.7, Math.sin(a) * 0.6 * t), r: 0.03 * (1 - t) + 0.005 }); }
    const g = tube(pts, 3, true); paint(g, (p, n, o) => o.set('#5a9048').lerp(col('#9ac068'), clamp(p.y))); parts.push(g);
  }
  return merge(parts);
}
function rockGeo(seed) {
  const g = puff(V(0, 0.15, 0), 0.6, { detail: 1, noise: 0.35, squash: 0.62, seed });
  g.computeVertexNormals();
  return paint(g, (p, n, o) => { o.set('#a8a0b4').lerp(col('#d4ccd4'), clamp(n.y * 0.5 + 0.3)); if (n.y > 0.72) o.lerp(col('#7cb05a'), 0.75); });
}

// ------------------------------------------------------------------ batched rendering
// Every vegetation material is ONE BatchedMesh holding all variant geometries of all species that share it.
// BatchedMesh frustum-culls per instance — for the main camera AND the sun's shadow camera — so off-screen trees
// cost nothing, and the whole island is ~13 draw calls instead of one call per species × variant × part.
// makeToon's vertex injection only knows InstancedMesh, so vegToon() re-derives the world position and the wind
// origin from batchingMatrix inside the vertexWorld hook (shared by the colour and the shadow-depth programs).
const WIND_ID = { grass: 1, tree: 2, leaf: 3, cloth: 4, reed: 5 };
function vegToon(o) {
  const mode = WIND_ID[o.wind] || 0;
  const vw = /* glsl */`
    #ifdef USE_BATCHING
      cOrigin = (modelMatrix * batchingMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      cWorld = modelMatrix * batchingMatrix * vec4(transformed, 1.0);
      ${mode ? `cWorld.xyz += windOffset(cWorld.xyz, transformed, cOrigin, ${mode}, uv);` : ''}
      #ifdef TOON
        vCWN = normalize(mat3(modelMatrix) * mat3(batchingMatrix) * objectNormal);
      #endif
    #endif
  `;
  return makeToon({ ...o, wind: undefined, vertexWorld: vw });
}
// Leafy silhouettes for canopy clumps: where a clump turns away from the camera, bite noise-shaped leaf lobes
// out of it so crowns read as masses of foliage instead of smooth balls. Interior (camera-facing) pixels skip it.
const LEAF_EDGE = {
  uniforms: { uFloret: { value: null } },
  fragPars: /* glsl */`
    uniform sampler2D uFloret;
    float gFloretH = 0.0;
    vec3 floretSample(vec3 p, vec3 n) {
      vec3 w = abs(n); w = pow(w, vec3(6.0)); w /= (w.x + w.y + w.z + 1e-4);
      return texture2D(uFloret, p.zy).rgb * w.x + texture2D(uFloret, p.xz).rgb * w.y + texture2D(uFloret, p.xy).rgb * w.z;
    }
    float lfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float lfNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(lfHash(i), lfHash(i + vec3(1, 0, 0)), f.x), mix(lfHash(i + vec3(0, 1, 0)), lfHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(lfHash(i + vec3(0, 0, 1)), lfHash(i + vec3(1, 0, 1)), f.x), mix(lfHash(i + vec3(0, 1, 1)), lfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }`,
  fragColor: /* glsl */`
    {
      float ndv = dot(normalize(vCWN), normalize(cameraPosition - vCWorld));
      if (ndv < 0.55) {
        float lf = lfNoise(vCWorld * 5.5) * 0.65 + lfNoise(vCWorld * 13.0 + 7.1) * 0.35;
        if (ndv < 0.08 + lf * 0.42) discard;
        // leaf lobes near the edge catch a little more light, like painted highlights on leaf tips
        diffuseColor.rgb *= 1.0 + smoothstep(0.55, 0.2, ndv) * (lf - 0.4) * 0.35;
      }
      // painted florets / leaf clusters: darker, more saturated gaps; domed, slightly varied clusters
      vec3 fl = floretSample(vCWorld * 0.2, normalize(vCWN));
      float f1 = clamp(fl.b * 1.1, 0.0, 1.0);
      gFloretH = sqrt(max(0.0, 1.0 - f1 * f1));            // hemispherical dome per cluster
      float gap = 1.0 - smoothstep(0.0, 0.4, fl.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 1.15, gap * gap * 0.14);
      diffuseColor.rgb *= 0.93 + 0.14 * fl.g;
    }`,
  // bump the lighting normal with the cluster domes (screen-space derivative bump, as three's perturbNormalArb)
  fragNormal: /* glsl */`
    {
      vec3 sp = -vViewPosition;
      vec3 dpx = dFdx(sp), dpy = dFdy(sp);
      float dhx = dFdx(gFloretH), dhy = dFdy(gFloretH);
      vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
      float det = dot(dpx, r1);
      vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
      normal = normalize(abs(det) * normal - grad * 0.035);
    }`,
};
const WHITE = new THREE.Color(1, 1, 1);
class Batch {
  constructor(name, mat, { castShadow = true, receiveShadow = true, sort = true } = {}) {
    this.name = name; this.mat = mat; this.castShadow = castShadow; this.receiveShadow = receiveShadow; this.sort = sort;
    this.geos = []; this.items = [];
  }
  add(geo, m4, color, rec) {
    let gi = this.geos.indexOf(geo);
    if (gi < 0) { gi = this.geos.length; this.geos.push(geo); }
    this.items.push({ gi, m: m4.clone(), c: color ? color.clone() : WHITE, rec });
  }
  build(group) {
    if (!this.items?.length) return null;
    const verts = this.geos.reduce((a, g) => a + g.attributes.position.count, 0);
    const idx = this.geos.reduce((a, g) => a + (g.index ? g.index.count : 0), 0);
    const bm = new THREE.BatchedMesh(this.items.length, verts, Math.max(1, idx), this.mat);
    bm.name = 'veg:' + this.name;
    const ids = this.geos.map(g => bm.addGeometry(g));
    for (const it of this.items) {
      const id = bm.addInstance(ids[it.gi]);
      bm.setMatrixAt(id, it.m); bm.setColorAt(id, it.c);
      it.rec.parts.push({ bm, id });
    }
    bm.castShadow = this.castShadow && !this.mat.userData.noCast; bm.receiveShadow = this.receiveShadow;
    bm.sortObjects = this.sort; bm.perObjectFrustumCulled = true;
    applyDepth(bm);
    bm.computeBoundingBox(); bm.computeBoundingSphere();
    group.add(bm);
    this.items = null; // free the staging copies
    this.mesh = bm;
    return bm;
  }
}

// ------------------------------------------------------------------ Vegetation manager
export class Vegetation {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.group = new THREE.Group(); this.group.name = 'vegetation';
    this.instances = []; // {kind, x, z, y, s, big, parts:[{bm, id}], alive, col?}
    this.colliders = [];
    this.batches = [];
    this.noise = new Noise(77);
  }
  batch(name, mat, opts) { const b = new Batch(name, mat, opts); this.batches.push(b); return b; }
  // Queue instances: variants = [[geoPart0, geoPart1...], ...]; batches = [Batch per part]
  _place(variants, batches, placements, { kind = 'x', collide = 0 } = {}) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = V(0, 1, 0);
    const big = !!TREE_SPECIES[kind] || kind === 'bamboo';
    for (const pl of placements) {
      p.set(pl.x, pl.y, pl.z); q.setFromAxisAngle(up, pl.rot); s.setScalar(pl.s); if (pl.sy) s.y *= pl.sy;
      m4.compose(p, q, s);
      if (pl.tint) c.set(pl.tint); else if (pl.hue) c.setRGB(...pl.hue); else c.setRGB(1, 1, 1);
      const rec = { kind, x: pl.x, z: pl.z, y: pl.y, s: pl.s, big, parts: [], alive: true };
      variants[pl.v % variants.length].forEach((g, pi) => batches[pi].add(g, m4, c, rec));
      if (collide) { rec.col = { x: pl.x, z: pl.z, r: collide * pl.s }; this.colliders.push(rec.col); }
      this.instances.push(rec);
    }
  }
  _kill(rec) {
    rec.alive = false;
    for (const { bm, id } of rec.parts) bm.setVisibleAt(id, false);
    if (rec.col) { const k = this.colliders.indexOf(rec.col); if (k >= 0) this.colliders.splice(k, 1); }
    this.world.onVegRemoved?.(rec);
  }
  // Remove vegetation (not grass) inside a rectangle; returns count
  clearRect(x0, z0, x1, z1, pad = 0.3) {
    let n = 0;
    for (const rec of this.instances) {
      if (!rec.alive) continue;
      if (rec.x > x0 - pad && rec.x < x1 + pad && rec.z > z0 - pad && rec.z < z1 + pad) { this._kill(rec); n++; }
    }
    return n;
  }
  // Clear around a building: small plants within `pad`, big trees whose canopy would overlap the roof (`canopy`),
  // and — on the camera side (+x/+z) — far enough that no crown hides the facade (`front`).
  clearAround(x0, z0, x1, z1, { pad = 0.6, canopy = 2.3, front = 3.6 } = {}) {
    let n = 0;
    for (const rec of this.instances) {
      if (!rec.alive) continue;
      const r = rec.big ? canopy * Math.min(1.2, rec.s) : pad, f = rec.big ? front : pad;
      if (rec.x > x0 - r && rec.x < x1 + f && rec.z > z0 - r && rec.z < z1 + f) {
        // trim the far corner of the camera-side band so it is a diagonal wedge, not a square
        if (rec.big && rec.x > x1 + r && rec.z > z1 + r && (rec.x - x1) + (rec.z - z1) > f + r) continue;
        this._kill(rec); n++;
      }
    }
    return n;
  }
  // Build-mode view: 0 = normal lawn, 1 = short, overlay-tinted grass so painted zones read clearly
  setBuildView(k) { const u = this.grassMat?.userData?.u; if (u) u.uBuild.value = k; }
  build(canPlace, quality = 2) {
    const tr = this.terrain, rnd = mulberry32(2024), N = this.noise;
    const H = (x, z) => tr.heightAt(x, z);
    const okGround = (x, z, pad = 0) => {
      for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
        const t = tr.tile(x + dx, z + dz); if (t !== T.GRASS && t !== T.ROCK) return false;
        if (!canPlace(x + dx, z + dz)) return false;
      }
      return H(x, z) > 0.5;
    };
    // ---- trees
    const treeSpots = { sakura: [], momiji: [], pine: [], round: [], ginkgo: [] };
    const taken = [];
    const farFromTrees = (x, z, d) => taken.every(([tx, tz, td]) => (tx - x) ** 2 + (tz - z) ** 2 > (d + td) ** 2);
    const tryTree = (kind, x, z, spacing = 2.4) => {
      if (treeKeepOut(x, z) || !okGround(x, z, 1.2) || !farFromTrees(x, z, spacing)) return false;
      treeSpots[kind].push({ x, z }); taken.push([x, z, spacing]); return true;
    };
    for (let i = 0; i < 2600; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      const h = H(x, z), vd = Math.hypot(x - 56, z - 60);
      const forest = N.fbm(x * 0.045, z * 0.045, 3);
      let kind = null;
      if (h > 2.6 && z < 30) kind = rnd() < 0.7 ? 'pine' : 'round';
      else if (Math.hypot(x - 88, z - 42) < 14) kind = rnd() < 0.72 ? 'momiji' : 'ginkgo';
      else if (vd > 17 && forest > 0.05) kind = rnd() < 0.45 ? 'sakura' : rnd() < 0.6 ? 'round' : 'pine';
      else if (vd > 11 && vd < 26 && rnd() < 0.18) kind = 'sakura';
      else if (h < 1.0 && h > 0.5 && rnd() < 0.08) kind = 'pine';
      if (kind) tryTree(kind, x, z, kind === 'sakura' ? 2.8 : 2.3);
    }
    this.extraTrees?.(tryTree);
    const barkB = this.batch('bark', vegToon({ vertexColors: true, wind: 'tree', brush: 0.3, brushScale: 1.2, rim: 0.2, occluder: true }));
    LEAF_EDGE.uniforms.uFloret.value = floretTexture();
    const folB = this.batch('foliage', vegToon({ ...LEAF_EDGE, occluder: true, vertexColors: true, wind: 'leaf', brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }));
    for (const kind of Object.keys(treeSpots)) {
      const spots = treeSpots[kind]; if (!spots.length) continue;
      const S = TREE_SPECIES[kind];
      const variants = [0, 1, 2].map(v => { const t = buildTree(kind, v + 1); return [t.trunkGeo, t.foliage, t.cardGeo]; });
      const cardB = this.batch('cards:' + kind, vegToon({ occluder: true, noShadowCast: true, vertexColors: true, wind: 'leaf', map: leafCardTexture(S.leaf), alphaTest: 0.42, side: THREE.DoubleSide, noFlip: true, brush: 0.12, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }), { castShadow: false });
      const pl = spots.map(sp => ({ x: sp.x, z: sp.z, y: H(sp.x, sp.z), rot: rnd() * TAU, s: 0.85 + rnd() * 0.4, v: Math.floor(rnd() * 3), hue: [0.92 + rnd() * 0.16, 0.92 + rnd() * 0.12, 0.92 + rnd() * 0.12] }));
      this._place(variants, [barkB, folB, cardB], pl, { kind, collide: S.radius });
    }
    this.treeSpots = treeSpots;
    // ---- bamboo groves (west)
    const bambooPl = [];
    for (let i = 0; i < 400; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * 14; const x = 17 + Math.cos(a) * d, z = 52 + Math.sin(a) * d * 1.3;
      if (okGround(x, z, 0.8) && farFromTrees(x, z, 1.1) && !treeKeepOut(x, z, 1)) { bambooPl.push({ x, z, y: H(x, z), rot: rnd() * TAU, s: 0.9 + rnd() * 0.3, v: Math.floor(rnd() * 3) }); taken.push([x, z, 1.1]); }
    }
    const bv = [0, 1, 2].map(v => { const b = buildBamboo(v); return [b.stalks, b.leaves]; });
    this._place(bv, [
      this.batch('bamboo', vegToon({ occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.6, brush: 0.15, rim: 0.4 })),
      this.batch('bambooLeaf', vegToon({ occluder: true, vertexColors: true, wind: 'reed', windAmt: 0.6, map: leafCardTexture('bamboo'), alphaTest: 0.4, side: THREE.DoubleSide, noFlip: true, rim: 0.5 })),
    ], bambooPl, { kind: 'bamboo', collide: 0.6 });
    // ---- bushes
    const bushPl = { hydrangea: [], azalea: [], box: [] };
    for (let i = 0; i < 1400; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      if (!okGround(x, z, 0.5) || !farFromTrees(x, z, 0.7)) continue;
      const nearPath = this.world.nearPath?.(x, z, 2.2);
      const k = nearPath ? (rnd() < 0.6 ? 'hydrangea' : 'azalea') : rnd() < 0.08 ? 'box' : rnd() < 0.05 ? 'azalea' : null;
      if (!k) continue;
      bushPl[k].push({ x, z, y: H(x, z), rot: rnd() * TAU, s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 3) }); taken.push([x, z, 0.7]);
    }
    const bushB = this.batch('bush', vegToon({ vertexColors: true, wind: 'leaf', windAmt: 0.5, brush: 0.2, rim: 0.45, term: [-0.1, 0.4] }), { sort: false });
    for (const k of Object.keys(bushPl)) {
      if (!bushPl[k].length) continue;
      const vars = [0, 1, 2].map(v => [buildBush(k, v * 3 + k.length)]);
      this._place(vars, [bushB], bushPl[k], { kind: 'bush', collide: 0.35 });
    }
    // ---- susuki fields (south / coast)
    const suPl = [];
    for (let i = 0; i < 900; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 60 + rnd() * 48; const h = H(x, z);
      if (h < 0.55 || h > 1.6 || !okGround(x, z, 0.3)) continue;
      if (N.fbm(x * 0.08 + 40, z * 0.08, 2) < 0.12) continue;
      if (!farFromTrees(x, z, 0.5)) continue;
      suPl.push({ x, z, y: h, rot: rnd() * TAU, s: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 3) });
    }
    this._place([0, 1, 2].map(v => [susukiGeo(v)]), [this.batch('susuki', vegToon({ vertexColors: true, wind: 'reed', windAmt: 1.6, brush: 0.1, rim: 0.6 }), { sort: false })], suPl, { kind: 'susuki' });
    // ---- rocks
    const rockPl = [];
    for (let i = 0; i < 500; i++) {
      const x = 4 + rnd() * (WORLD - 8), z = 4 + rnd() * (WORLD - 8);
      const t = tr.tile(x, z); if (!canPlace(x, z)) continue;
      const shore = H(x, z) > -0.4 && H(x, z) < 0.6;
      if (!(t === T.ROCK || (shore && rnd() < 0.2) || (t === T.GRASS && rnd() < 0.04))) continue;
      rockPl.push({ x, z, y: H(x, z) - 0.1, rot: rnd() * TAU, s: 0.5 + rnd() * (t === T.ROCK ? 1.4 : 0.7), sy: 0.8 + rnd() * 0.5, v: Math.floor(rnd() * 4) });
    }
    this._place([0, 1, 2, 3].map(v => [rockGeo(v * 11 + 3)]), [this.batch('rock', vegToon({ vertexColors: true, brush: 0.3, brushScale: 0.8, rim: 0.3, term: [0.0, 0.35] }), { sort: false })], rockPl, { kind: 'rock', collide: 0.45 });
    this.buildFlowers(canPlace, rnd, quality);
    for (const b of this.batches) b.build(this.group);
    this.buildGrass(quality);
    this.taken = taken;
  }
  buildFlowers(canPlace, rnd, quality) {
    const tr = this.terrain, N = this.noise;
    const kinds = ['daisy', 'bell', 'cup'];
    const pal = ['#ffffff', '#fff2a8', '#ffb0d0', '#ff8fb8', '#c8b0ff', '#ffd27a', '#ff6f7f', '#a8d8ff'];
    const pls = { daisy: [], bell: [], cup: [] };
    const count = quality >= 2 ? 9000 : 4000;
    for (let i = 0; i < count; i++) {
      const x = 3 + rnd() * (WORLD - 6), z = 3 + rnd() * (WORLD - 6);
      if (tr.tile(x, z) !== T.GRASS || !canPlace(x, z)) continue;
      const f = N.fbm(x * 0.07 + 9, z * 0.07 - 3, 3);
      if (f < 0.08 && rnd() > 0.06) continue;
      const k = kinds[Math.floor((N.n2(x * 0.05, z * 0.05) * 0.5 + 0.5) * 2.99)];
      const c = pal[Math.floor((N.n2(x * 0.11 + 5, z * 0.11) * 0.5 + 0.5) * 7.99)];
      pls[k].push({ x, z, y: tr.heightAt(x, z) - 0.02, rot: rnd() * TAU, s: 0.32 + rnd() * 0.18, v: 0, tint: c });
    }
    const fb = this.batch('flower', vegToon({ vertexColors: true, wind: 'grass', brush: 0.05, rim: 0.5, term: [-0.3, 0.3] }), { castShadow: false, sort: false });
    for (const k of kinds) if (pls[k].length) this._place([[flowerGeo(k)]], [fb], pls[k], { kind: 'flower' });
  }
  buildGrass(quality) {
    const tr = this.terrain;
    const density = quality >= 2 ? 44 : quality === 1 ? 24 : 12;
    const blade = bladeGeo();
    const rnd = mulberry32(99);
    const ov = tr.overlayUniforms?.() || { uOverlay: { value: null }, uOverlayAmt: { value: 0 }, uOverlayMode: { value: 1 }, uGrid: { value: 0 }, uCursor: { value: new THREE.Vector4(-99, -99, 0, 0) }, uCursorCol: { value: new THREE.Vector4(1, 1, 1, 0) } };
    const mat = this.grassMat = makeToon({
      wind: 'grass', fixedNormal: [0, 1, 0], noFlip: true, brush: 0.12, rim: 0.0, shadowSat: 0.45, side: THREE.DoubleSide,
      uniforms: { uTiles: { value: tr.tileTex }, uWorld: { value: WORLD }, uBuild: { value: 0 }, ...ov },
      vertexPars: 'uniform sampler2D uTiles; uniform float uWorld; uniform float uBuild; varying float vGH;',
      vertexWorld: `
        vGH = position.y;
        float allow = texture2D(uTiles, cOrigin.xz / uWorld).a;
        if (allow < 0.55) cWorld.xyz = cOrigin;
        // build view: blades crouch so painted zones, coverage and the drag rectangle read clearly
        cWorld.xyz = cOrigin + (cWorld.xyz - cOrigin) * vec3(1.0 - uBuild * 0.3, 1.0 - uBuild * 0.68, 1.0 - uBuild * 0.3);
      `,
      fragPars: 'varying float vGH; uniform float uWorld;\n' + OVERLAY_GLSL,
      fragColor: /* glsl */`
        {
          vec3 wp = vCWorld;
          float n1 = texture2D(uBrush, wp.xz * 0.021).g;
          float n2 = texture2D(uBrush, wp.xz * 0.0071 + 0.31).g;
          vec3 g1 = vec3(0.50, 0.80, 0.30), g2 = vec3(0.33, 0.64, 0.30), g3 = vec3(0.70, 0.84, 0.36), g4 = vec3(0.40, 0.72, 0.42);
          vec3 grass = mix(g2, g1, smoothstep(0.38, 0.62, n1));
          grass = mix(grass, g3, smoothstep(0.52, 0.72, n2) * 0.7);
          grass = mix(grass, g4, smoothstep(0.55, 0.75, 1.0 - n2) * 0.5);
          vec3 tip = grass * vec3(1.18, 1.14, 0.9) + vec3(0.06, 0.05, 0.0);
          diffuseColor.rgb = mix(grass * 0.8, tip, smoothstep(0.0, 1.0, vGH));
        }
      `,
      fragOut: 'outgoingLight = applyBuildOverlay(outgoingLight, vCWorld, 1.0);',
    });
    const CH = 16, chunks = Math.ceil(WORLD / CH);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const tiles = tr.tiles;
    this.grassMeshes = [];
    for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
      const list = [];
      for (let z = cz * CH; z < Math.min(WORLD, (cz + 1) * CH); z++) for (let x = cx * CH; x < Math.min(WORLD, (cx + 1) * CH); x++) {
        const t = tiles[z * WORLD + x];
        if (t !== T.GRASS && t !== T.PATH && t !== T.PLAZA && t !== T.FIELD) continue; // path tiles get grass back if removed
        for (let k = 0; k < density; k++) {
          const px = x + rnd(), pz = z + rnd();
          const h = tr.heightAt(px, pz); if (h < 0.35) continue;
          list.push(px, h - 0.02, pz);
        }
      }
      if (!list.length) continue;
      const n = list.length / 3;
      const im = new THREE.InstancedMesh(blade, mat, n);
      for (let i = 0; i < n; i++) {
        const tall = 0.26 + rnd() * 0.28;
        p.set(list[i * 3], list[i * 3 + 1], list[i * 3 + 2]); q.setFromAxisAngle(V(0, 1, 0), rnd() * TAU); s.set(0.12 + rnd() * 0.1, tall, 0.1);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
      }
      im.receiveShadow = true; im.castShadow = false;
      im.computeBoundingSphere();
      this.group.add(im); this.grassMeshes.push(im);
    }
  }
}
