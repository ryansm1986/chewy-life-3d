// Toybox kit: the procedural cast (villagers, random townsfolk, humanoid monsters) in the "Toybox Chibi" style of the
// baked Toybox heroes (Chewy, Moka, Rosie, Shadow): about 2.4 heads tall, a big rounded squircle head, a stubby bean
// body, chunky short limbs with mitten paws and broad feet, big glossy eyes set mid-face above a short toy muzzle, and
// smooth matte vinyl with clean colour blocks.
//
// How it is built (all sizes in metres, sculpted at true size: the head bone is NOT scaled):
//  - every volume (skull, ears, mittens, feet, tails, hats) is a smooth signed-distance form meshed with surface nets
//    (gfx/sdf.js) and cached per species / kind, like disneyKit.js;
//  - colour blocks (calico, panda patches, tanuki mask, muzzle, inner ears, ear tips, tail stripes, clothes) are CUT
//    into the mesh along their border (cutLayers): every triangle the border crosses is split and the vertices on the
//    border are doubled, one copy per side, so a painted edge is perfectly crisp at any mesh density. The cut meshes are
//    cached too; a new character only repaints its copy;
//  - the face: eyes are shallow glossy lenses (an ellipsoid set into a socket: warm sclera, a big iris tucked toward the
//    nose, a large pupil, two catchlights) with a thick lash line and soft arched brows as little tubes; lids are hidden
//    shells inside the head that rotate down to blink (the Animator's lid contract); the mouth is the skull slit along
//    the lip line with a jaw bone and two-bone weights (disneyKit's jaw), and the closed smile is a dark tube on the
//    upper lip; the nose is a small rounded bean.
import * as THREE from 'three';
import { surfaceNets, ellipsoid, roundCone, sphere, tube, smin, smax, smoothstep, clamp01, capsule } from '../gfx/sdf.js';
import { makeToon } from '../gfx/materials.js';
import { paintFn, solid, copy, mergeIndexed, tubeGeo, mirrored, jawParts, jawWeight, lipY } from './disneyKit.js';

const TAU = Math.PI * 2;
const C = h => new THREE.Color(h);
const hypot = Math.hypot;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ material: matte vinyl (the baked heroes' toon set-up, no strands)
// Two additions over the heroes' set-up:
//  - a larger shadow normal offset for these meshes (uToyNB, world metres, added to the sun's own normalBias): the big
//    round sculpted heads self-shadowed in fine stripes (shadow acne) and in a jagged terminator where the eye pads and
//    muzzle shade the face; the baked heroes don't, because their textured skins carry that shading instead;
//  - the heroes' darkGrade (heroModels.js DARK_GRADE) on the vertex colours: the warm grade pulled the mid browns maroon and
//    the near-blacks purple. [desat, r, g, b] (0..255 sRGB bias on the dark texels); portraits.js zeroes it.
const DARK_GRADE = /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    float w = clamp((0.62 - l) / 0.2, 0.0, 1.0); // (a wider window than the heroes': the kit's mid browns are vertex colours)
    sc += w * (uDarkGrade.x * (vec3(l) - sc) + uDarkGrade.yzw);
    diffuseColor.rgb = pow(max(sc, 0.0), vec3(2.2));
  }`;
export const TOY_DARK_GRADE = +(typeof location !== 'undefined' && new URLSearchParams(location.search).has('nograde')) ? [0, 0, 0, 0] : [0.2, 4, 12, 6];
export function toyMaterial(dg = TOY_DARK_GRADE, nb = 0.05) {
  const mat = makeToon({
    vertexColors: true, objectBrush: true, brush: 0, rim: 0.5, term: [-0.04, 0.34], shadowSat: 0.35,
    fragPars: 'uniform vec4 uDarkGrade;', fragColor: DARK_GRADE,
    uniforms: { uDarkGrade: { value: new THREE.Vector4(dg[0], dg[1] / 255, dg[2] / 255, dg[3] / 255) }, uToyNB: { value: nb } },
  });
  const base = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, r) => {
    base(shader, r);
    shader.uniforms.uToyNB = mat.userData.u.uToyNB;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uToyNB;')
      .replace('#include <shadowmap_vertex>', THREE.ShaderChunk.shadowmap_vertex.replaceAll('directionalLightShadows[ i ].shadowNormalBias', '( directionalLightShadows[ i ].shadowNormalBias + uToyNB )'));
  };
  mat.customProgramCacheKey = () => key + ':toy';
  return mat;
}

// ------------------------------------------------------------------ cache
const CACHE = new Map();
function cached(key, build) { let g = CACHE.get(key); if (!g) { g = build(); CACHE.set(key, g); } return g; }
export const toyCacheSize = () => CACHE.size;
const HIDE = new Set(typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('toyhide') || '').split(',') : []); // dev: &toyhide=eyeball,lidU

// ------------------------------------------------------------------ SDF helpers
// superellipsoid ("squircle") with an optional taper (> 0: wider at the bottom); the value is scaled to about metres
// (first-order distance: the implicit value over its gradient's length, so blends and the mesher's Newton step behave)
function squircle([cx, cy, cz], [a, b, c], n = 2.6, taper = 0) {
  const inv = 1 / n;
  return (x, y, z) => {
    const v = (y - cy) / b, k = 1 + taper * -v, ak = a * k;
    const u = Math.abs((x - cx) / ak), w = Math.abs((z - cz) / c), vv = Math.abs(v);
    const un = u ** n, vn = vv ** n, wn = w ** n, G = un + vn + wn;
    if (G < 1e-12) return -Math.min(a, b, c);
    const S = Math.pow(G, inv), q = S / G; // dS/du = S^(1-n) u^(n-1) = q * un / u
    const gx = u > 0 ? q * un / u / ak : 0, gy = vv > 0 ? q * vn / vv / b : 0, gz = w > 0 ? q * wn / w / c : 0;
    return (S - 1) / (Math.hypot(gx, gy, gz) || 1);
  };
}
// a rotated ellipsoid (rot: [rx, ry, rz] euler, world -> local applied as the inverse)
function rotEll(c, r, rot) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)).invert().elements;
  const M = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  return ellipsoid(c, r, M);
}
const U = (fs, k) => (x, y, z) => { let d = fs[0](x, y, z); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), k); return d; };
const mirX = f => (x, y, z) => f(Math.abs(x), y, z);
// first z (from the front) where f < 0 at (x, y): the skin's front surface
function surfZ(f, x, y, z0 = 0.5, z1 = -0.3) {
  let a = z0; if (f(x, y, a) < 0) return a;
  for (let z = z0; z > z1; z -= 0.006) { if (f(x, y, z) < 0) { let lo = z, hi = z + 0.006; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (f(x, y, m) < 0) lo = m; else hi = m; } return (lo + hi) / 2; } }
  return 0;
}
function grad(f, x, y, z, e = 0.002) {
  const g = V3(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e));
  return g.normalize();
}

// ------------------------------------------------------------------ crisp colour blocks: cut a mesh along f = 0
/**
 * Split every triangle that a border crosses (layer i's border is fs[i] = 0, negative inside) and double the border
 * vertices, one copy per side. Returns { g, mask } where mask[v] has bit i set when vertex v is inside layer i.
 * Triangles never straddle a border afterwards, so a per-vertex colour change along it is a perfectly sharp edge.
 */
export function cutLayers(g, fs, extra = null) {
  const P = Array.from(g.attributes.position.array), N = Array.from(g.attributes.normal.array);
  let I = g.index ? Array.from(g.index.array) : [...Array(P.length / 3).keys()];
  const M = new Array(P.length / 3).fill(0), X = extra ? Array.from(extra) : null;
  fs.forEach((f, li) => {
    if (!f) return;
    const bit = 1 << li, nv = P.length / 3, d = new Float64Array(nv);
    for (let v = 0; v < nv; v++) { let val = f(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); if (val === 0) val = 1e-9; d[v] = val; if (val < 0) M[v] |= bit; }
    const edge = new Map(), out = [];
    const push = (x, y, z, nx, ny, nz, m, xv) => { P.push(x, y, z); N.push(nx, ny, nz); M.push(m); if (X) X.push(xv); return M.length - 1; };
    const cut = (a, b) => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      let e = edge.get(key); if (e) return a < b ? e : [e[0], e[1]];
      const t = d[a] / (d[a] - d[b]);
      const x = P[a * 3] + (P[b * 3] - P[a * 3]) * t, y = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t;
      let nx = N[a * 3] + (N[b * 3] - N[a * 3]) * t, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t, nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t;
      const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const base = M[a] & ~bit, xv = X ? (X[a] && X[b] ? 1 : 0) : 0;
      e = [push(x, y, z, nx, ny, nz, base | bit, xv), push(x, y, z, nx, ny, nz, base, xv)];
      edge.set(key, e); return e;
    };
    for (let t = 0; t < I.length; t += 3) {
      const v = [I[t], I[t + 1], I[t + 2]], s = v.map(i => d[i] < 0), n = s[0] + s[1] + s[2];
      if (n === 0 || n === 3) { out.push(v[0], v[1], v[2]); continue; }
      const k = n === 1 ? s.indexOf(true) : s.indexOf(false);
      const p = v[k], q = v[(k + 1) % 3], r = v[(k + 2) % 3];
      const [pqi, pqo] = cut(p, q), [pri, pro] = cut(p, r);
      if (s[k]) { out.push(p, pqi, pri, pqo, q, r, pqo, r, pro); } else { out.push(p, pqo, pro, pqi, q, r, pqi, r, pri); }
    }
    I = out;
  });
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  o.setIndex(I);
  return { g: o, mask: Uint32Array.from(M), extra: X ? Uint8Array.from(X) : null };
}
// paint a cut mesh: base(x, y, z, nx, ny, nz, out) then the colour of the top-most layer the vertex is inside
function paintLayers(g, mask, base, layers) {
  return paintFn(g, (x, y, z, nx, ny, nz, o) => {
    base(x, y, z, nx, ny, nz, o);
    const m = mask[paintLayers.i++];
    for (let li = layers.length - 1; li >= 0; li--) if (layers[li] && (m & (1 << li))) { const c = layers[li]; if (typeof c === 'function') c(x, y, z, nx, ny, nz, o); else o.copy(c); break; }
    return 0;
  });
}
function painted(g, mask, base, layers) { paintLayers.i = 0; return paintLayers(g, mask, base, layers); }
const shadeLow = (o, ny, amt = 0.08) => o.multiplyScalar(1 - amt * clamp01(0.35 - ny));

// ------------------------------------------------------------------ species heads (head-bone space: +x the character's left, +y up, +z forward;
// origin at the neck). W/H/D: half extents of the squircle skull centred at cy; n: squareness; taper: wider at the bottom.
// muzzle: blobs placed on the face (z is relative to the skull's front surface at that x, y); eye: visible half size
// [hw, hh] of the lens, its centre (x, y) on the face; mouth: the lip line (x, dy) from the mouth centre `my`.
const W_MOUTH = { x: [0, 0.008, 0.017, 0.026, 0.032, 0.05], y: [0.003, -0.004, -0.0075, -0.0045, 0.002, 0.02] };
const HEADS = {
  bear: {
    W: 0.25, H: 0.186, D: 0.2, n: 2.25, taper: 0.2, cy: 0.19,
    muzzle: [{ c: [0, 0.104, -0.042], r: [0.086, 0.064, 0.058], k: 0.03 }, { c: [0, 0.076, -0.05], r: [0.06, 0.04, 0.05], k: 0.025 }],
    eye: { x: 0.118, y: 0.184, hw: 0.051, hh: 0.057, iris: '#4b2c20' },
    nose: { y: 0.138, w: 0.03, h: 0.021, d: 0.02, color: '#2d1b16' }, my: 0.098, mouth: W_MOUTH, philtrum: true,
    brow: { dy: 0.064, len: 0.05, color: '#4b2c20' }, ears: 'round', muzzlePatch: true, blush: [0.158, 0.12],
  },
  panda: {
    W: 0.238, H: 0.198, D: 0.2, n: 2.4, taper: 0.02, cy: 0.2,
    muzzle: [{ c: [0, 0.106, -0.03], r: [0.062, 0.046, 0.045], k: 0.03 }],
    eye: { x: 0.112, y: 0.196, hw: 0.045, hh: 0.05, iris: '#c88a37', sleepy: 0.4 },
    nose: { y: 0.135, w: 0.024, h: 0.017, d: 0.017, color: '#211d28' }, my: 0.104, mouth: W_MOUTH, philtrum: true,
    brow: { dy: 0.074, len: 0.042, color: '#211d28' }, ears: 'round', blush: [0.165, 0.105],
  },
  tanuki: {
    W: 0.238, H: 0.196, D: 0.2, n: 2.3, taper: 0.16, cy: 0.2,
    muzzle: [{ c: [0, 0.108, -0.04], r: [0.074, 0.056, 0.055], k: 0.03 }],
    eye: { x: 0.114, y: 0.2, hw: 0.046, hh: 0.052, iris: '#c88a38' },
    nose: { y: 0.143, w: 0.026, h: 0.019, d: 0.019, color: '#302622' }, my: 0.106, mouth: W_MOUTH, philtrum: true,
    brow: { dy: 0.066, len: 0.044, color: '#4a3a34' }, ears: 'round', muzzlePatch: true, blush: [0.152, 0.135],
  },
  cat: {
    W: 0.242, H: 0.19, D: 0.198, n: 2.3, taper: 0.2, cy: 0.19,
    muzzle: [{ c: [0.02, 0.118, -0.03], r: [0.036, 0.028, 0.032], k: 0.035, mir: true }, { c: [0, 0.1, -0.034], r: [0.03, 0.022, 0.03], k: 0.025 }],
    eye: { x: 0.116, y: 0.182, hw: 0.046, hh: 0.054, iris: '#71b86b' },
    nose: { y: 0.137, w: 0.014, h: 0.01, d: 0.01, color: '#cb7f86' }, my: 0.115, mouth: { x: [0, 0.007, 0.014, 0.021, 0.026, 0.04], y: [0.002, -0.0045, -0.007, -0.004, 0.002, 0.016] }, philtrum: true,
    brow: { dy: 0.066, len: 0.04, color: '#6b4a38' }, ears: 'cat', lashes: true, blush: [0.152, 0.122],
  },
  fox: {
    W: 0.236, H: 0.192, D: 0.2, n: 2.3, taper: 0.18, cy: 0.192,
    muzzle: [{ c: [0.02, 0.115, -0.028], r: [0.04, 0.032, 0.034], k: 0.03, mir: true }, { c: [0, 0.128, -0.02], r: [0.034, 0.03, 0.04], k: 0.03 }],
    eye: { x: 0.112, y: 0.196, hw: 0.045, hh: 0.052, iris: '#e6ad3f' },
    nose: { y: 0.144, w: 0.02, h: 0.014, d: 0.015, color: '#493044' }, my: 0.112, mouth: { x: [0, 0.009, 0.018, 0.028, 0.036, 0.05], y: [0.002, -0.005, -0.0085, -0.006, 0.0015, 0.016] }, philtrum: true,
    brow: { dy: 0.064, len: 0.046, color: '#493044' }, ears: 'fox', lashes: true, blush: [0.15, 0.125],
  },
  dog: {
    W: 0.236, H: 0.196, D: 0.2, n: 2.3, taper: 0.12, cy: 0.198,
    muzzle: [{ c: [0, 0.118, -0.036], r: [0.07, 0.052, 0.055], k: 0.035 }, { c: [0, 0.09, -0.04], r: [0.05, 0.034, 0.04], k: 0.02 }],
    eye: { x: 0.112, y: 0.2, hw: 0.046, hh: 0.053, iris: '#e0a040' },
    nose: { y: 0.15, w: 0.032, h: 0.022, d: 0.022, color: '#3a2a2a' }, my: 0.112, mouth: W_MOUTH, philtrum: true,
    brow: { dy: 0.064, len: 0.048, color: '#4a2a20' }, ears: 'dog', muzzlePatch: true, blush: [0.152, 0.13],
  },
  bunny: {
    W: 0.226, H: 0.192, D: 0.196, n: 2.2, taper: 0.14, cy: 0.192,
    muzzle: [{ c: [0.018, 0.112, -0.028], r: [0.032, 0.026, 0.03], k: 0.035, mir: true }],
    eye: { x: 0.108, y: 0.186, hw: 0.046, hh: 0.054, iris: '#7a4424' },
    nose: { y: 0.132, w: 0.013, h: 0.01, d: 0.01, color: '#e88da4' }, my: 0.11, mouth: { x: [0, 0.007, 0.014, 0.021, 0.026, 0.04], y: [0.002, -0.0045, -0.007, -0.004, 0.002, 0.016] }, philtrum: true,
    brow: { dy: 0.066, len: 0.04, color: '#7a4424' }, ears: 'bunny', lashes: true, blush: [0.15, 0.122],
  },
  frog: {
    W: 0.252, H: 0.146, D: 0.2, n: 2.4, taper: 0.08, cy: 0.152,
    domes: { x: 0.12, y: 0.262, r: 0.122, z: 0.05, k: 0.07 },
    eye: { x: 0.12, y: 0.278, hw: 0.047, hh: 0.053, pitch: -0.2, yawOut: 0.0, iris: '#e8a23b', dome: true },
    nose: null, nostrils: { x: 0.026, y: 0.205, r: 0.008, color: '#467c38' }, my: 0.13,
    mouth: { x: [0, 0.03, 0.06, 0.085, 0.1, 0.13], y: [-0.006, -0.0065, -0.004, 0.002, 0.01, 0.03] },
    brow: { dy: 0.07, len: 0.046, color: '#467c38' }, ears: 'none', blush: [0.168, 0.15],
  },
  // Poe the pug (docs/POE.md): a broad, squarer skull; a short bun muzzle (a centre pad under the wide flat nose with two
  // puffy lobes either side) and a soft forehead roll over the nose bridge; big honey eyes set wide; folded button ears
  pug: {
    W: 0.252, H: 0.196, D: 0.198, n: 2.5, taper: 0.06, cy: 0.198,
    muzzle: [{ c: [0, 0.108, -0.03], r: [0.062, 0.042, 0.04], k: 0.03 }, { c: [0.03, 0.104, -0.028], r: [0.04, 0.034, 0.034], k: 0.026, mir: true },
      { c: [0, 0.166, -0.017], r: [0.05, 0.013, 0.022], k: 0.016 }],
    eye: { x: 0.122, y: 0.196, hw: 0.054, hh: 0.058, iris: '#c88a3a' },
    nose: { y: 0.142, w: 0.038, h: 0.024, d: 0.022, color: '#1e1b20' }, my: 0.094, mouth: W_MOUTH, philtrum: true,
    brow: { dy: 0.06, len: 0.05, color: '#4a4450' }, ears: 'pug', muzzlePatch: true, blush: [0.162, 0.122],
  },
  duck: {
    W: 0.226, H: 0.196, D: 0.198, n: 2.2, taper: 0.08, cy: 0.198,
    bill: { y: 0.118, w: 0.074, h: 0.026, l: 0.06 },
    eye: { x: 0.106, y: 0.206, hw: 0.043, hh: 0.05, iris: '#3a2418' },
    nose: null, my: 0.118, mouth: { x: [0, 0.03, 0.05, 0.062, 0.07, 0.09], y: [0.0, 0.0, 0.001, 0.003, 0.006, 0.02] },
    brow: { dy: 0.064, len: 0.04, color: '#5a4030' }, ears: 'none', billColor: '#ff9a3a', blush: [0.15, 0.14],
  },
};
export const TOY_KINDS = Object.keys(HEADS);
const EYE_A = 0.42;      // the lens's visible half-angle (unit-sphere radians): the lids close it with the Animator's 1.22 rad blink
const LID_U = 0.98;      // upper lid edge at rest (polar angle from +y, unit sphere): hidden under the skin above the hole
const BLINK_AT = 1.8;    // where the blink line sits (polar angle at its middle): a little below the middle of the eye
export const TOY_SQUINT = [1.35, -0.69]; // happy lids [upper, lower] (Animator rig.squint): the lower lid's ^ arc ends up mid-eye
const LID_D = 2.26;      // lower lid edge at rest (the Animator holds it 0.1 rad higher)

function headBase(H) {
  const fs = [squircle([0, H.cy, 0], [H.W, H.H, H.D], H.n, H.taper)];
  for (const b of H.cheeks || []) fs.push(b.mir ? mirX(ellipsoid(b.c, b.r)) : ellipsoid(b.c, b.r));
  let f = fs.length > 1 ? (x, y, z) => { let d = fs[0](x, y, z); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y, z), H.cheeks[i - 1].k); return d; } : fs[0];
  if (H.domes) { const D = H.domes, dome = mirX(sphere([D.x, D.y, D.z ?? 0.03], D.r)), f0 = f; f = (x, y, z) => smin(f0(x, y, z), dome(x, y, z), D.k || 0.05); }
  return f;
}
// the whole head definition, resolved once per species: skull SDF (muzzle, bill, sockets), eye frames, face anchors
function toyHead(kind) {
  return cached(`toyhead:${kind}`, () => {
    const D = HEADS[kind], H = { ...D, kind };
    const base = headBase(D);
    // muzzle blobs on the face
    const blobs = [];
    for (const b of D.muzzle || []) {
      const z = surfZ(base, b.c[0], b.c[1]) + b.c[2];
      const e = ellipsoid([b.c[0], b.c[1], z], b.r);
      blobs.push({ f: b.mir ? mirX(e) : e, k: b.k, c: [b.c[0], b.c[1], z], r: b.r });
    }
    let face = blobs.length ? (x, y, z) => { let d = base(x, y, z); for (const b of blobs) d = smin(d, b.f(x, y, z), b.k); return d; } : base;
    H.blobs = blobs;
    if (D.bill) { // the duck's short rounded bill: upper and lower halves (the lower one rides the jaw)
      const B = D.bill, z0 = surfZ(base, 0, B.y) - 0.02;
      const up = ellipsoid([0, B.y + 0.012, z0 + B.l * 0.5], [B.w, B.h, B.l]), lo = ellipsoid([0, B.y - 0.014, z0 + B.l * 0.42], [B.w * 0.9, B.h * 0.8, B.l * 0.9]);
      const f0 = face; face = (x, y, z) => smin(f0(x, y, z), Math.min(up(x, y, z), lo(x, y, z)), 0.014);
      H.billZ = z0 + 0.012;
    }
    // eyes: a lens (an ellipsoid) per side, seen through an oval hole CUT into the smooth skin (headMesh): the hole is
    // the lens's cap EYE_A round its gaze (a cylinder along the gaze), so every outline is a clean oval of half size
    // (hw, hh) at any mesh density, and the skin needs no extra volume round the eye (an eye pad there bent the toon light
    // band into streaks). The lens is sunk until it sits just under the skin all round the hole, which hides the lids at
    // rest; the gaze is turned within a few degrees of the skin's normal to keep that rim step even.
    const e = D.eye, sA = Math.sin(EYE_A), cA = Math.cos(EYE_A);
    const R = [e.hw / sA, e.hh / sA, e.rz ?? 0.07], RV = V3(...R);
    const sz = surfZ(face, e.x, e.y), P = V3(e.x, e.y, sz), nrm = grad(face, e.x, e.y, sz);
    const yaw0 = Math.atan2(nrm.x, nrm.z) + (e.yawOut ?? 0.08), pitch0 = Math.asin(Math.max(-1, Math.min(1, nrm.y))) + (e.pitch ?? 0);
    const tv = V3(0, 0, 0), gz = V3(0, 0, 0);
    // skin height over the lens rim along the gaze, round the outline (n directions), for a lens centred at c
    const steps = (q, c, g, n = 20) => { const out = []; for (let k = 0; k < n; k++) { const psi = (k / n) * TAU; tv.set(sA * Math.sin(psi), sA * Math.cos(psi), cA).multiply(RV).applyQuaternion(q).add(c); let t = 0.12; for (; t > -0.12; t -= 0.002) if (face(tv.x + g.x * t, tv.y + g.y * t, tv.z + g.z * t) < 0) break; out.push(t); } return out; };
    let best = null;
    for (const dy of [-0.12, -0.06, 0, 0.06, 0.12]) for (const dp of [-0.12, -0.06, 0, 0.06, 0.12]) {
      const yaw = yaw0 + dy, pitch = pitch0 + dp, g = V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), g), c = P.clone().addScaledVector(g, -R[2] * cA);
      const st = steps(q, c, g), range = Math.max(...st) - Math.min(...st) + 0.15 * (Math.abs(dy) + Math.abs(dp)) * 0.05;
      if (!best || range < best.range) best = { range, q, g, c, min: Math.min(...st) };
    }
    const q = best.q, gaze = best.g, RIM = 0.0045; // the lens rim sits RIM under the skin at the shallowest point
    const Ec = best.c.addScaledVector(gaze, -(RIM - best.min));
    H.eyeF = { c: Ec, q, R, gaze };
    const inv = q.clone().invert(), tl = V3(0, 0, 0);
    // the hole (both eyes): inside the lens's EYE_A cylinder, on the front of the head
    const hole1 = (x, y, z) => { tl.set(x - Ec.x, y - Ec.y, z - Ec.z).applyQuaternion(inv); if (tl.z < 0) return 1; return (hypot(tl.x / (R[0] * sA), tl.y / (R[1] * sA)) - 1) * Math.min(R[0], R[1]) * sA; };
    H.hole = (x, y, z) => Math.min(hole1(x, y, z), hole1(-x, y, z));
    // a point on the skin round the outline, `sc` times the hole's size (the lash line follows it)
    H.rimPt = (psi, sc = 1) => { tv.set(sA * sc * Math.sin(psi), sA * sc * Math.cos(psi), cA).multiply(RV).applyQuaternion(q).add(Ec); let t = 0.15; for (; t > -0.15; t -= 0.001) if (face(tv.x + gaze.x * t, tv.y + gaze.y * t, tv.z + gaze.z * t) < 0) break; return tv.clone().addScaledVector(gaze, t); };
    const lens = (x, y, z) => { tl.set(Math.abs(x) - Ec.x, y - Ec.y, z - Ec.z).applyQuaternion(inv); return ellipsoid([0, 0, 0], R)(tl.x, tl.y, tl.z); };
    let skull = face;
    if (D.nostrils) { const N = D.nostrils, nz = surfZ(face, N.x, N.y), ns = sphere([N.x, N.y, nz + 0.002], N.r), s0 = skull; skull = (x, y, z) => smax(s0(x, y, z), -ns(Math.abs(x), y, z), 0.004); H.nostrilZ = nz; }
    H.face = face; H._skull = skull; H.lens = lens;
    // the lip line in absolute head space (disneyKit's jaw reads H.mouth.x / .y and the skull)
    if (D.mouth) H.mouth = { x: D.mouth.x, y: D.mouth.y.map(v => v + D.my), tongue: null };
    // nose anchor
    if (D.nose) { const nz = surfZ(face, 0, D.nose.y); H.noseP = V3(0, D.nose.y, nz); H.noseN = grad(face, 0, D.nose.y, nz); }
    H.top = D.cy + D.H; // crown height
    return H;
  });
}

// ---- colour-block layers per head (cut into the mesh; their colours are picked per character in paintToyHead)
function headLayers(kind, variant) {
  const H = toyHead(kind), D = HEADS[kind], e = D.eye, L = [];
  // 0: muzzle patch (light fur): an oval round the muzzle blobs, front only
  if (D.muzzlePatch || kind === 'fox') { // (cats and bunnies: the muzzle is the face's own cream; pandas: white anyway)
    const m = H.blobs[0];
    if (kind === 'fox') { // the sheet's white: the muzzle from just over the nose to the chin, flaring into two cheek patches under the eyes
      const ny = D.nose.y, my = D.my;
      L[0] = (x, y, z) => {
        if (z < 0.03) return 1;
        const ax = Math.abs(x), mz = hypot(x / 0.062, (y - (my + 0.012)) / 0.05) - 1, ck = hypot((ax - 0.088) / 0.056, (y - (my - 0.004)) / 0.04) - 1;
        return Math.max(Math.min(mz, ck), y - (ny + 0.008));
      };
    } else if (m) {
      const rx = kind === 'cat' || kind === 'bunny' ? 0.07 : m.r[0] * 1.06, ry = kind === 'cat' || kind === 'bunny' ? 0.05 : m.r[1] * 1.08;
      const cyM = kind === 'cat' || kind === 'bunny' ? m.c[1] - 0.008 : m.c[1] - 0.004;
      L[0] = (x, y, z) => { if (z < 0.03) return 1; return hypot(x / rx, (y - cyM) / ry) - 1; };
    }
  }
  // 1: species markings
  if (kind === 'panda') { // tilted teardrop eye patches
    L[1] = (x, y, z) => { if (z < 0.02) return 1; const ax = Math.abs(x) - e.x - 0.01, ay = y - e.y + 0.016; const t = -0.6, u = ax * Math.cos(t) - ay * Math.sin(t), v = ax * Math.sin(t) + ay * Math.cos(t); return hypot(u / 0.07, v / 0.088) - 1; };
  } else if (kind === 'tanuki') { // the bandit mask: a band through both eyes, dipping at the nose bridge
    const m = H.blobs[0], mz = (x, y) => hypot(x / (m.r[0] * 1.06), (y - m.c[1] + 0.004) / (m.r[1] * 1.08)) - 1;
    L[1] = (x, y, z) => {
      if (z < 0.0) return 1;
      const ax = Math.abs(x) - e.x - 0.006, ay = y - e.y + 0.006, t = 0.32, u = ax * Math.cos(t) - ay * Math.sin(t), v = ax * Math.sin(t) + ay * Math.cos(t);
      const patch = hypot(u / 0.086, v / 0.064) - 1, bridge = hypot(x / 0.05, (y - e.y + 0.03) / 0.03) - 1;
      return Math.max(Math.min(patch, bridge), -mz(x, y));
    };
  } else if (kind === 'cat' && variant === 'calico') { // one orange patch over the RIGHT eye (-x) to the right ear, a separate bean on the back
    L[1] = (x, y, z) => {
      const a = hypot((x + 0.13) / 0.12, (y - 0.25) / 0.13, (z - 0.06) / 0.2) - 1;
      const b = hypot((x - 0.06) / 0.13, (y - 0.24) / 0.1, (z + 0.17) / 0.09) - 1;
      return Math.min(Math.max(a, x + 0.012 - 0.06 * (y - 0.2)), b);
    };
  } else if (kind === 'dog' && variant === 'chin') { // a white chin and throat under the lip line
    L[1] = (x, y, z) => { if (z < 0.05) return 1; return Math.max(y - (D.my - 0.012 + 0.6 * x * x), Math.abs(x) - 0.07); };
  }
  // 2: blush dabs are soft paint, not cut; the inner mouth slit is not a colour block
  return L;
}

// skull mesh, cut along its colour blocks and slit along the lips (disneyKit's slit, carrying the block mask)
const HEAD_H = 0.013; // skull cell size (a finer 0.007 net was tested: the streaks were not the mesh density)
function headMesh(kind, variant) {
  return cached(`toyskull:${kind}:${variant}`, () => {
    const H = toyHead(kind);
    const W = H.W + 0.06, raw = surfaceNets(H._skull, [-W - (H.cheeks ? 0.03 : 0), -0.04, -H.D - 0.03], [W + (H.cheeks ? 0.03 : 0), H.top + 0.03 + (H.domes ? 0.14 : 0), H.D + 0.14], HEAD_H);
    const L = headLayers(kind, variant); L[7] = H.hole;
    const { g, mask } = cutLayers(raw, L);
    const I = g.index.array, keep = [];
    for (let t = 0; t < I.length; t += 3) if (!(mask[I[t]] & mask[I[t + 1]] & mask[I[t + 2]] & 128)) keep.push(I[t], I[t + 1], I[t + 2]); // open the eye holes
    g.setIndex(keep);
    return slit(H, g, mask);
  });
}
function slit(H, g, mask) {
  if (!H.mouth) return { g, below: null, mask };
  const J = jawParts(H), P = g.attributes.position, I = g.index.array, n = P.count;
  const isJaw = new Uint8Array(I.length / 3), touchJ = new Uint8Array(n), touchH = new Uint8Array(n);
  for (let t = 0; t < I.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let q = 0; q < 3; q++) { cx += P.getX(I[t + q]); cy += P.getY(I[t + q]); cz += P.getZ(I[t + q]); }
    cx /= 3; cy /= 3; cz /= 3;
    const j = J.lip(cx, cy) < 0 && Math.abs(cx) < J.cx && cz > J.zBack + 0.03;
    isJaw[t / 3] = j ? 1 : 0;
    for (let q = 0; q < 3; q++) (j ? touchJ : touchH)[I[t + q]] = 1;
  }
  const pos = Array.from(P.array), nor = Array.from(g.attributes.normal.array), below = [], M = Array.from(mask);
  const dup = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) below[v] = touchJ[v] && !touchH[v] ? 1 : 0;
  for (let v = 0; v < n; v++) {
    if (!(touchJ[v] && touchH[v])) continue;
    const x = P.getX(v); if (Math.abs(x) > J.cx - 0.002 || Math.abs(J.lip(x, P.getY(v))) > 0.009) { below[v] = 0; continue; }
    pos[v * 3 + 1] = lipY(H.mouth, Math.abs(x));
    dup[v] = pos.length / 3; below.push(1); M.push(M[v]);
    pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
  }
  const idx = Array.from(I);
  for (let t = 0; t < idx.length; t += 3) if (isJaw[t / 3]) for (let q = 0; q < 3; q++) { const d = dup[idx[t + q]]; if (d >= 0) idx[t + q] = d; }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setIndex(idx);
  return { g: o, below: Uint8Array.from(below), mask: Uint32Array.from(M) };
}

// ------------------------------------------------------------------ colours
export function toyColors(spec, kind) {
  const D = HEADS[kind];
  const fur = C(spec.fur || '#c98f5e');
  const fur2 = C(spec.fur2 || '#fff2e0');
  const dark = C(spec.fur3 || spec.earColor || (kind === 'panda' ? '#29262d' : spec.fur || '#c98f5e'));
  return {
    fur, fur2, dark, ear: C(spec.earColor || (kind === 'panda' ? spec.fur3 || '#29262d' : spec.fur || '#c98f5e')), inner: C(spec.earInner || (kind === 'panda' ? spec.fur3 || '#29262d' : kind === 'bear' || kind === 'tanuki' ? spec.fur2 || '#e8c49a' : '#ffb0c0')),
    blush: C(spec.blush && spec.blush !== 'none' ? spec.blush : '#f5a0ad'), noBlush: spec.blush === 'none',
    iris: C(spec.iris || (spec.eye && spec.eye !== '#2a1a14' ? spec.eye : D.eye.iris)), brow: C(spec.brow || D.brow.color),
  };
}
function paintToyHead(g, mask, kind, cols, variant) {
  const H = toyHead(kind), D = HEADS[kind];
  const light = kind === 'fox' ? C('#fff4e8') : kind === 'panda' ? cols.fur : cols.fur2;
  const markC = kind === 'cat' ? C(cols.dark.getStyle()) : kind === 'dog' ? C('#f4ece0') : cols.dark;
  const [bx, by] = D.blush, bz = surfZ(H.face, bx, by);
  const blush = cols.blush;
  return painted(g, mask, (x, y, z, nx, ny, nz, o) => {
    o.copy(cols.fur);
    if (kind === 'frog' && y < D.my - 0.02 && z > 0.0) o.copy(cols.fur).lerp(cols.fur2, 0.0);
  }, [
    (x, y, z, nx, ny, nz, o) => o.copy(light),
    (x, y, z, nx, ny, nz, o) => o.copy(markC),
  ]) && finishHead(g, kind, H, D, cols, bx, by, bz, mask);
}
// soft paint on top of the blocks: blush dabs, a darker underside, the bill, the soft socket shadow
function finishHead(g, kind, H, D, cols, bx, by, bz, mask) {
  const col = g.attributes.color, P = g.attributes.position, N = g.attributes.normal, c = new THREE.Color();
  const Ec = H.eyeF.c, er = H.eyeF.R;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = Math.abs(x), ny = N.getY(i);
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    if (!cols.noBlush && !(mask[i] & 2 && (kind === 'panda' || kind === 'tanuki'))) { const d = hypot((ax - bx) / 0.034, (y - by) / 0.022, (z - bz) / 0.03); if (d < 1.25) c.lerp(cols.blush, 0.85 * smoothstep(1.25, 0.75, d)); }
    if (D.bill && z > H.billZ && y < D.bill.y + 0.045 && ax < D.bill.w + 0.01) c.set(D.billColor);
    shadeLow(c, ny, 0.07);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

// ------------------------------------------------------------------ eyes, lids, lashes, brows (eye frame: gaze +z; lens unit sphere)
function eyeParts(kind) {
  return cached(`toyeye:${kind}`, () => {
    const cap = (rr, ang, seg = 30, rings = 5) => { const g = new THREE.SphereGeometry(rr, seg, rings, 0, TAU, 0, ang); g.rotateX(Math.PI / 2); return g; };
    const ball = cap(1, EYE_A + 0.24, 24, 7); // (only the front of the lens: the rest would reach through the skin round the eye)
    const iris = cap(1.004, 0.38, 26, 4), pupil = cap(1.008, 0.225, 22, 3);
    const hi = cap(1.012, 0.13, 14), hi2 = cap(1.012, 0.06, 10);
    // lids: strips of the lens sphere (|x| <= 0.62, between two angles in the y-z plane), so the Animator's rotation
    // about x sweeps a lid down evenly; the upper one reaches back over the top so a blink covers the whole lens
    const sleepy = HEADS[kind].eye.sleepy || 0;
    const lidU = lidStrip(1.024, -0.24 - sleepy, LID_U, 0.48, 12, 12), lidD = lidStrip(1.032, LID_D, LID_D + 0.95, 0.48, 12, 9); // (just wider than the hole: wider poked through the frog's domes)
    // Closed-eye lines, painted on the lids as dark ribbons (lid-local polar angles; the Animator's rotations move them):
    //  - blink (upper lid +1.22, plus Pan's drowsy rest): a soft thick U, convex down, resting along the bottom of the eye
    //    opening (BLINK_AT at its middle), with the open lash line's little wing at the outer corner;
    //  - happy (TOY_SQUINT: upper lid +1.35, lower lid -0.69): a thick ^ arc on the raised lower lid's top edge, convex up.
    //    The lower lid sits in front of the upper one (radius 1.03 vs 1.02), so the blink U is hidden behind it then.
    const gB = BLINK_AT - 1.22 - sleepy, bU = x => gB - 0.28 * (x / 0.42) ** 2;
    const blinkLash = ribbon(1.028, -0.44, 0.44, 22, x => bU(x) - 0.15 * (1 - 0.6 * (x / 0.44) ** 2), bU, { wing: 1 });
    const hU = x => LID_D + 0.34 * (x / 0.42) ** 2;
    const happyArc = ribbon(1.036, -0.44, 0.44, 22, hU, x => hU(x) + 0.15 * (1 - 0.6 * (x / 0.44) ** 2));
    return { ball, iris, pupil, hi, hi2, lidU, lidD, blinkLash, happyArc };
  });
}
// a ribbon on the sphere of radius r between the polar angles top(x)..bot(x) (y-z plane, from +y toward +z), x0..x1;
// wing: a little flick continuing past x1 outward and up (the outer corner of the left eye is +x)
function ribbon(r, x0, x1, n, top, bot, { wing = 0 } = {}) {
  const cols = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; cols.push([x, top(x), bot(x)]); }
  if (wing) for (let i = 1; i <= 4; i++) { const u = i / 4, x = x1 + 0.09 * u, b = bot(x1) - 0.2 * u, t = b - (bot(x1) - top(x1)) * (1 - u) * 0.9 - 0.004; cols.push([Math.min(x, 0.6), t, b]); }
  const pos = [], nor = [], idx = [], R2 = 3;
  for (const [x, t, b] of cols) for (let k = 0; k <= R2; k++) { const psi = t + ((b - t) * k) / R2, c = Math.sqrt(Math.max(0, 1 - x * x)), d = [x, c * Math.cos(psi), c * Math.sin(psi)]; pos.push(d[0] * r, d[1] * r, d[2] * r); nor.push(...d); }
  for (let i = 0; i < cols.length - 1; i++) for (let k = 0; k < R2; k++) { const a = i * (R2 + 1) + k, b2 = a + R2 + 1; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}
// a tube built from mirrored points has its winding inside out: flip it
function flipTube(g) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } return g; }
// a strip of the unit sphere (radius r): |x| <= sMax, between the angles psi0..psi1 in the y-z plane (from +y toward +z)
function lidStrip(r, psi0, psi1, sMax, ns, np) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= np; i++) {
    const psi = psi0 + ((psi1 - psi0) * i) / np;
    for (let j = 0; j <= ns; j++) { const x = -sMax + (2 * sMax * j) / ns, c = Math.sqrt(1 - x * x), n = [x, c * Math.cos(psi), c * Math.sin(psi)]; pos.push(n[0] * r, n[1] * r, n[2] * r); nor.push(...n); }
  }
  for (let i = 0; i < np; i++) for (let j = 0; j < ns; j++) { const a = i * (ns + 1) + j, b = a + ns + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}
// lash line (unit-sphere space, left eye: +x is outward): along the top of the lens, thick, with a small wing outward
function lashGeo(wing = 1) {
  return cached(`toylash:${wing}`, () => {
    const pts = [], rad = [];
    const a0 = EYE_A + 0.03;
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, psi = -1.75 + 3.25 * u; // round the top, from the inner corner (-x) to the outer corner (+x)
      const a = a0 + (u > 0.82 ? (u - 0.82) * 1.0 * wing : 0);
      const d = V3(Math.sin(a) * Math.sin(psi), Math.sin(a) * Math.cos(psi), Math.cos(a));
      if (u > 0.85) d.y += (u - 0.85) * 0.5 * wing;
      pts.push([d.x * 1.0, d.y * 1.0, d.z * 1.0]);
      rad.push(0.035 + 0.07 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.8) * (u < 0.95 ? 1 : 0.6));
    }
    return tubeGeo(pts, rad, 7);
  });
}

// ------------------------------------------------------------------ ears (ear frame: +y up the ear, +z the inner face)
const flatCone = (a, b, r1, r2, flat) => { const f = roundCone(a, b, r1, r2); return (x, y, z) => f(x, y, z / flat) * flat; };
const EARS = {
  round: { f: () => (x, y, z) => smax(ellipsoid([0, 0.035, 0], [0.06, 0.056, 0.032])(x, y, z), -(y + 0.03), 0.01), inner: (x, y, z) => (z < 0.012 ? 1 : hypot(x / 0.036, (y - 0.04) / 0.034) - 1), box: [[-0.075, -0.05, -0.045], [0.075, 0.105, 0.045]], embed: 0.03 },
  cat: { f: () => flatCone([0, 0.0, 0], [0, 0.13, 0], 0.084, 0.018, 0.48), inner: (x, y, z) => (z < 0.012 ? 1 : triD(x, y - 0.012, 0.056, 0.1)), box: [[-0.1, -0.09, -0.05], [0.1, 0.16, 0.05]], embed: 0.03 },
  fox: { f: () => flatCone([0, 0.0, 0], [0, 0.2, 0], 0.102, 0.02, 0.44), inner: (x, y, z) => (z < 0.012 ? 1 : triD(x, y - 0.014, 0.066, 0.155)), tip: (x, y, z) => 0.13 - y + 0.12 * Math.abs(x), box: [[-0.125, -0.1, -0.055], [0.125, 0.245, 0.055]], embed: 0.035 },
  bunny: { f: () => flatCone([0, -0.02, 0], [0, 0.29, 0], 0.064, 0.066, 0.6), inner: (x, y, z) => (z < 0.012 ? 1 : hypot(x / 0.046, (y - 0.175) / 0.14) - 1), box: [[-0.085, -0.08, -0.05], [0.085, 0.38, 0.05]], embed: 0.03 },
  dog: { f: () => dogEar(), inner: (x, y, z) => (z < 0.012 || y > 0.08 ? 1 : triD(x, y - 0.004, 0.046, 0.095)), box: [[-0.095, -0.09, -0.07], [0.095, 0.14, 0.11]], embed: 0.035 },
  pug: { f: () => pugEar(), inner: () => 1, box: [[-0.09, -0.06, -0.05], [0.09, 0.15, 0.06]], embed: 0.026 },
};
function triD(x, y, w, h) { // 2D isoceles triangle (base half-width w at y = 0, apex at y = h): negative inside
  const ax = Math.abs(x), k = w / h;
  return Math.max(-y, (ax - w + k * y) / Math.sqrt(1 + k * k));
}
function dogEar() { // Chewy's folded ear: a thick rounded triangle whose top folds forward
  const base = flatCone([0, -0.02, 0], [0, 0.13, 0], 0.074, 0.018, 0.46);
  return (x, y, z) => {
    if (y > 0.07) { const a = 1.2 * smoothstep(0.07, 0.105, y), yy = y - 0.07, c = Math.cos(a), sn = Math.sin(a); return base(x, 0.07 + yy * c + z * sn, -yy * sn + z * c); }
    return base(x, y, z);
  };
}
function pugEar() { // Poe's folded button ear: the flap that hangs out and down over the top corner of the skull (the seat
  // points the ear's +y outward-down, its broad face outward), with a soft rolled crease along the fold at its root
  const flap = flatCone([0, -0.012, 0], [0, 0.1, 0.006], 0.06, 0.034, 0.46);
  const roll = capsule([-0.048, 0.006, 0.006], [0.048, 0.006, 0.006], 0.026);
  return (x, y, z) => smin(flap(x, y, z), roll(x, y, z), 0.018);
}
function earMesh(ek) {
  return cached(`toyear:${ek}`, () => {
    const E = EARS[ek], f0 = E.f(), cut = -E.embed - 0.012, f = (x, y, z) => Math.max(f0(x, y, z), cut - y); // (only a little of the base is buried)
    const raw = surfaceNets(f, [E.box[0][0], cut - 0.01, E.box[0][2]], E.box[1], 0.0115);
    return cutLayers(raw, [E.inner, E.tip || null]);
  });
}
// where each ear sits on the skull: x, z of its base (left ear; y is found on the skull top), splay (outward lean),
// lean (backward), face (the inner face's turn outward)
const EAR_SEAT = {
  round: { at: [0.165, -0.02], splay: 0.62, lean: 0.12, face: 0.2 },
  cat: { at: [0.135, -0.0], splay: 0.36, lean: 0.06, face: 0.22 },
  fox: { at: [0.14, -0.015], splay: 0.4, lean: 0.06, face: 0.2 },
  bunny: { at: [0.075, -0.02], splay: 0.12, lean: 0.08, face: 0.12 },
  dog: { at: [0.155, -0.005], splay: 0.6, lean: 0.06, face: 0.32 },
  pug: { at: [0.172, 0.004], splay: 2.32, lean: 0.34, face: 1.4 },
};
// y of the skull's top surface at (x, z)
function surfY(f, x, z, y0 = 0.7) { for (let y = y0; y > 0; y -= 0.005) if (f(x, y, z) < 0) { let lo = y, hi = y + 0.005; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (f(x, m, z) < 0) lo = m; else hi = m; } return lo; } return 0.3; }
function earQuat(S, s) {
  const up = V3(s * Math.sin(S.splay), Math.cos(S.splay) * Math.cos(S.lean), -Math.cos(S.splay) * Math.sin(S.lean)).normalize();
  const fc = V3(s * Math.sin(S.face), 0, Math.cos(S.face)); fc.addScaledVector(up, -fc.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, fc);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fc));
}

// ------------------------------------------------------------------ the head: geometry into `head` (the head bone)
export function headKindToy(spec) { const s = spec.toy?.head || spec.species; return HEADS[s] ? s : 'dog'; }
export function headVariant(spec, kind) {
  if (kind === 'cat' && spec.fur3 && spec.fur3 !== spec.fur) return 'calico';
  if (kind === 'dog' && (spec.patterns?.chin || spec.patterns?.chestBlaze)) return 'chin';
  return 'plain';
}
/** Build the Toybox head into `head`. Returns { geos: [[parent, geo, name, skin?]], parts, top, eyeY } */
export function buildToyHead(head, spec, kind) {
  const H = toyHead(kind), D = HEADS[kind], variant = headVariant(spec, kind), cols = toyColors(spec, kind), out = [];
  const add = (parent, g, name, skin) => { if (!HIDE.has(name)) out.push([parent, g, name, skin]); };
  const base = headMesh(kind, variant);
  const headG = paintToyHead(copy(base.g), base.mask, kind, cols, variant);
  // jaw: two-bone weights below the lip line (the lower bill rides it too)
  let jaw = null;
  if (H.mouth) {
    const J = jawParts(H), P = headG.attributes.position, w = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i);
      const upperLip = base.below[i] !== 1 && Math.abs(x) < J.cx + 0.004 && J.lip(x, y) > -0.012;
      w[i] = upperLip ? 0 : jawWeight(H, x, y, P.getZ(i), base.below[i] === 1);
    }
    jaw = new THREE.Group(); jaw.name = 'jaw'; jaw.position.set(0, J.hy, J.hz); head.add(jaw);
    add(head, headG, 'headMesh', { bones: [head, jaw], w });
    // mouth pocket (dark, upper half stays) and a tongue on its floor
    const y0 = H.mouth.y[0], pz = J.fz - 0.03;
    const pc = [0, y0 - 0.008, pz], pr = [J.cx * 0.92, 0.016, 0.02];
    const pocket = paintFn(new THREE.SphereGeometry(1, 16, 10).scale(...pr).translate(...pc), (x, y, z, a, b, c, o) => { o.set('#5a1a24').multiplyScalar(0.7 + 0.3 * clamp01((z - pc[2]) / pr[2] + 0.5)); return 0; });
    const PP = pocket.attributes.position, pw = new Float32Array(PP.count);
    for (let i = 0; i < PP.count; i++) pw[i] = smoothstep(pc[1] + 0.004, pc[1] - 0.004, PP.getY(i)) * smoothstep(J.zBack - 0.01, J.zBack + 0.025, PP.getZ(i));
    add(head, pocket, 'mouth', { bones: [head, jaw], w: pw });
    const tr = [J.cx * 0.62, 0.005, 0.016];
    const tongue = solid(new THREE.SphereGeometry(1, 14, 8).scale(...tr).translate(0, y0 - 0.017, J.fz - 0.034), '#e8707e');
    const TP = tongue.attributes.position, tw = new Float32Array(TP.count);
    for (let i = 0; i < TP.count; i++) tw[i] = smoothstep(J.zBack - 0.01, J.zBack + 0.025, TP.getZ(i));
    add(head, tongue, 'tongue', { bones: [head, jaw], w: tw });
    // the closed smile: a dark line on the upper lip along the parting (+ the philtrum up to the nose)
    const lineC = D.mouthColor || '#2a1a18', pts = [];
    const mx = H.mouth.x, cx = mx[mx.length - 2], ext = cx + (kind === 'frog' ? 0.012 : 0.006);
    for (let i = -14; i <= 14; i++) {
      const xx = (i / 14) * ext, ax = Math.abs(xx);
      let yy = ax <= cx ? lipY(H.mouth, ax) : lipY(H.mouth, cx) + (ax - cx) * 1.2; // the corners curl up a little
      const zz = surfZ(H.face, xx, yy + 0.0015) + 0.0004;
      pts.push([xx, yy + 0.0015, zz]);
    }
    const lw = kind === 'frog' ? 0.0042 : 0.0034;
    const lines = [tubeGeo(pts, pts.map((p, i) => lw * (0.55 + 0.45 * Math.sin((i / (pts.length - 1)) * Math.PI))), 6)];
    if (D.philtrum && H.noseP) {
      const ytop = H.noseP.y - D.nose.h * 0.7, ybot = H.mouth.y[0] + 0.0015, ph = [];
      for (let k = 0; k <= 4; k++) { const yy = ytop + (ybot - ytop) * k / 4; ph.push([0, yy, surfZ(H.face, 0, yy) + 0.0004]); }
      lines.push(tubeGeo(ph, lw * 0.85, 6));
    }
    add(head, solid(mergeIndexed(lines), lineC), 'smile');
  } else add(head, headG, 'headMesh');
  // nose: a small rounded bean, wider on top, with a catchlight
  if (D.nose) {
    const N = D.nose, g = new THREE.SphereGeometry(1, 16, 12), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 + 0.18 * clamp01(y) - 0.32 * clamp01(-y))); }
    g.computeVertexNormals(); g.scale(N.w, N.h, N.d); g.rotateX(-0.2);
    const np = H.noseP.clone().addScaledVector(H.noseN, -N.d * 0.35);
    g.translate(np.x, np.y, np.z);
    const hl = new THREE.SphereGeometry(1, 8, 6).scale(N.w * 0.28, N.h * 0.2, N.d * 0.2).translate(np.x - N.w * 0.35, np.y + N.h * 0.45, np.z + N.d * 0.62);
    add(head, mergeIndexed([solid(g, spec.nose || N.color), solid(hl, '#ffffff')]), 'nose');
  }
  if (D.nostrils) { // the frog's two painted nostrils sit in the little dents
    const N = D.nostrils, ns = [];
    for (const s of [1, -1]) ns.push(new THREE.SphereGeometry(1, 8, 6).scale(N.r * 0.75, N.r * 0.55, 0.002).translate(s * N.x, N.y, H.nostrilZ - 0.0005));
    add(head, solid(mergeIndexed(ns), N.color), 'nostrils');
  }
  // eyes + lids + lashes + brows
  const E = H.eyeF, EP = eyeParts(kind), irisC = cols.iris;
  const lids = [], lidsLow = [], parts = {}, lashBones = [];
  const sleepy = D.eye.sleepy || 0;
  for (const s of [1, -1]) {
    const frame = new THREE.Group(); frame.name = 'eyeFrame';
    frame.position.set(E.c.x * s, E.c.y, E.c.z);
    const q = E.q.clone(); if (s < 0) { q.y = -q.y; q.z = -q.z; } // mirror the gaze in x
    frame.quaternion.copy(q); head.add(frame);
    const lens = new THREE.Group(); lens.name = 'eyeLens'; lens.scale.set(...E.R); frame.add(lens);
    // iris and pupil tucked toward the nose; catchlights up and out
    const tuck = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.04, -s * 0.08, 0));
    const irisG = paintFn(EP.iris.clone().applyMatrix4(tuck), (x, y, z, a, b, c, o) => {
      const t = clamp01(0.5 + y * 2.2);
      o.copy(irisC).multiplyScalar(0.62 + 0.55 * (1 - t)); // darker under the lash, a warm glow below
      return 0;
    });
    const pupG = solid(EP.pupil.clone().applyMatrix4(tuck), '#1a1214');
    const toward = (x, y) => { const d = V3(x, y, Math.sqrt(1 - x * x - y * y)).applyMatrix4(tuck).normalize(); return new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d)); };
    const sclera = paintFn(EP.ball.clone(), (x, y, z, a, b, c, o) => { o.set('#fff8ef').multiplyScalar(1 - 0.12 * clamp01(y * 1.5 + 0.2)); return 0; });
    const eyeball = mergeIndexed([sclera, irisG, pupG, solid(EP.hi.clone().applyMatrix4(toward(-0.13, 0.15)), '#ffffff'), solid(EP.hi2.clone().applyMatrix4(toward(0.1, -0.09)), '#ffffff')]);
    add(lens, eyeball, 'eyeball');
    // lash line: on the head (static), mirrored for the right eye
    { // lash line on the skin along the top of the hole, thick, with a little wing out and up at the outer corner
      const wing = D.lashes ? 1.4 : 1, pts = [], rad = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18, psi = -1.72 + 3.22 * u, sc = 1.04 + (u > 0.84 ? (u - 0.84) * 1.1 * wing : 0);
        const p = H.rimPt(psi, sc); if (u > 0.86) p.y += (u - 0.86) * 0.05 * wing;
        p.addScaledVector(E.gaze, 0.0012); pts.push([p.x * s, p.y, p.z]);
        rad.push((0.0028 + 0.0058 * Math.sin(Math.min(1, u * 1.12) * Math.PI * 0.82)) * (u < 0.95 ? 1 : 0.6));
      }
      // the lash rides its own bone (in rig.parts.eyes: the Animator squashes those in y, to 0.08 on a blink and 0.35 when
      // happy). The bone sits under the eye with its y axis tipped 0.8 rad back into the head, so a squash pulls the
      // lash down AND back behind the lids: a closed or happy eye shows only the lid's U or ^ line, never an outline
      const piv = V3(0, -0.65 * E.R[1], 0.8 * E.R[2]).applyQuaternion(frame.quaternion).add(frame.position); // (below the eye: every bit of the lash, its ends too, is above it)
      const lq = frame.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.8));
      const lb = new THREE.Group(); lb.name = 'lashBone'; lb.position.copy(piv); lb.quaternion.copy(lq); head.add(lb); lashBones.push(lb);
      const qi = lq.clone().invert();
      const lg = tubeGeo(pts.map(p => V3(...p).sub(piv).applyQuaternion(qi).toArray()), rad, 7);
      add(lb, solid(lg, '#241a1c'), 'lash');
    }
    // lids (hidden inside the head at rest): the skin colour round the eye
    // (the skin round the eye: the panda's patches, the tanuki's mask, the calico patch over the right eye)
    const lidC = kind === 'panda' || kind === 'tanuki' || (kind === 'cat' && variant === 'calico' && s < 0) ? cols.dark : cols.fur;
    const lu = new THREE.Group(); lu.name = s > 0 ? 'lidU_L' : 'lidU_R'; lens.add(lu); lids.push(lu);
    if (sleepy) lu.rotation.x = sleepy; // Pan's drowsy half-lids
    const ld = new THREE.Group(); ld.name = s > 0 ? 'lidD_L' : 'lidD_R'; lens.add(ld); lidsLow.push(ld);
    // (the lines are lash dark; on a panda's patch or a tanuki's mask a dark line would vanish, so there it is a soft grey)
    const lineC = kind === 'panda' || kind === 'tanuki' ? C(cols.dark.getStyle()).lerp(C('#d8d0dc'), 0.62).getStyle() : '#241a1c';
    const side = g => (s > 0 ? g.clone() : mirrored(g));
    // lids take the skin colour of the face they cover when closed (the calico patch ends across Mochi's right eye):
    // each lid vertex is turned to its closed place, pushed out to the skin and coloured from the head's markings
    const lidPaint = (g, rot) => {
      const Lh = headLayers(kind, variant), light = kind === 'fox' ? C('#fff4e8') : kind === 'panda' ? cols.fur : cols.fur2;
      const markC = kind === 'cat' ? cols.dark : kind === 'dog' ? C('#f4ece0') : cols.dark;
      const m = new THREE.Matrix4().makeRotationX(rot), v = V3(0, 0, 0);
      return paintFn(g, (x, y, z, nx, ny, nz, o) => {
        v.set(x, y, z).applyMatrix4(m).multiply(V3(...E.R)).multiplyScalar(1.06).applyQuaternion(q).add(frame.position);
        if (Lh[1] && Lh[1](v.x, v.y, v.z) < 0) o.copy(markC); else if (Lh[0] && Lh[0](v.x, v.y, v.z) < 0) o.copy(light); else o.copy(kind === 'panda' || kind === 'tanuki' ? lidC : cols.fur);
        return 0;
      });
    };
    add(lu, mergeIndexed([lidPaint(EP.lidU.clone(), 1.22), solid(side(EP.blinkLash), lineC)]), 'lidU');
    add(ld, mergeIndexed([lidPaint(EP.lidD.clone(), TOY_SQUINT[1]), solid(side(EP.happyArc), lineC)]), 'lidD');
    if (sleepy) { // a lash line on the drowsy lid's edge
      const pts = []; for (let i = 0; i <= 12; i++) { const x = -0.4 + (0.8 * i) / 12, c = Math.sqrt(1 - x * x) * 1.035; pts.push([x * 1.035, c * Math.cos(LID_U), c * Math.sin(LID_U)]); }
      add(lu, solid(tubeGeo(pts, 0.05, 5), '#241a1c'), 'lidLash');
    }
    // brow: a soft arch above the eye, on the skin
    const B = D.brow, by = D.eye.y + D.eye.hh + B.dy * 0.5, bp = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, xx = s * (D.eye.x - B.len * 0.55 + B.len * 1.1 * u - 0.004), yy = by + 0.012 * Math.sin(u * Math.PI) - 0.006 * u;
      bp.push([xx, yy, surfZ(H.face, xx, yy) + 0.0012]);
    }
    add(head, solid(tubeGeo(bp, bp.map((_, i) => 0.0018 + 0.0032 * Math.sin((i / 8) * Math.PI)), 5), cols.brow.getStyle()), 'brow');
  }
  // ears
  const ek = spec.toy?.ears && EARS[spec.toy.ears] ? spec.toy.ears : spec.earKind && EARS[spec.earKind] ? spec.earKind : D.ears;
  if (ek && EARS[ek]) {
    const { g: eg, mask } = earMesh(ek), S = EAR_SEAT[ek];
    const tipC = ek === 'fox' ? C(spec.earTip || '#493044') : null;
    for (const s of [1, -1]) {
      const grp = new THREE.Group(); grp.name = s > 0 ? 'earL' : 'earR';
      grp.position.set(S.at[0] * s, surfY(H.face, S.at[0], S.at[1]) - EARS[ek].embed, S.at[1]); grp.quaternion.copy(earQuat(S, s));
      head.add(grp); parts[grp.name] = grp;
      if (ek === 'bunny') grp.userData.soft = true;
      const g0 = s > 0 ? copy(eg) : mirrored(eg);
      const earC = kind === 'cat' && variant === 'calico' ? cols.dark : cols.ear;
      add(grp, painted(g0, mask, (x, y, z, nx, ny, nz, o) => { o.copy(earC); shadeLow(o, ny, 0.05); }, [cols.inner, tipC]), 'ear');
    }
  }
  return { geos: out, parts: { jaw, lids, lidsLow, eyes: lashBones, ...parts }, top: H.top, eyeY: D.eye.y };
}

// ------------------------------------------------------------------ hands, feet, tails (cached SDF volumes)
export function mittenGeo(lk = 1, side = 1) {
  return cached(`toymit:${lk}:${side}`, () => {
    if (side < 0) return mirrored(mittenGeo(lk, 1));
    const palm = ellipsoid([0, 0, 0.004], [0.056 * lk, 0.062 * lk, 0.05 * lk]);
    const thumb = roundCone([-0.03 * lk, 0.012 * lk, 0.026 * lk], [-0.05 * lk, -0.012 * lk, 0.036 * lk], 0.019 * lk, 0.016 * lk); // inward (-x for the left paw) and forward
    const f = (x, y, z) => smin(palm(x, y, z), thumb(x, y, z), 0.014);
    return surfaceNets(f, [-0.09 * lk, -0.08 * lk, -0.06 * lk], [0.075 * lk, 0.075 * lk, 0.075 * lk], 0.0125);
  });
}
export function footGeo(kind = 'paw', s = 1) {
  return cached(`toyfoot:${kind}:${s}`, () => {
    const F = { paw: [0.074, 0.05, 0.1, 0.03], long: [0.07, 0.046, 0.125, 0.05], web: [0.085, 0.04, 0.1, 0.035], big: [0.085, 0.055, 0.108, 0.03] }[kind] || [0.074, 0.05, 0.1, 0.03];
    const [rx, ry, rz, fz] = F.map(v => v * s);
    const body = ellipsoid([0, ry * 0.92, fz], [rx, ry, rz]);
    const toes = kind === 'web' ? [-1, 0, 1].map(t => ellipsoid([t * rx * 0.62, ry * 0.5, fz + rz * 0.72 - Math.abs(t) * 0.012], [rx * 0.36, ry * 0.62, rz * 0.32])) : [];
    const f = (x, y, z) => { let d = body(x, y, z); for (const t of toes) d = smin(d, t(x, y, z), 0.012); return smax(d, -y, 0.012); }; // flat, soft-edged sole
    const g = surfaceNets(f, [-rx - 0.02, -0.01, fz - rz - 0.02], [rx + 0.02, ry * 2 + 0.02, fz + rz + 0.03], 0.0135);
    return g;
  });
}
// tails in tail space (+y up the tail: the tail group is pitched back by the Animator's rest)
const TAILS = {
  puff: { f: () => sphere([0, 0, -0.01], 0.05), box: [[-0.07, -0.07, -0.08], [0.07, 0.07, 0.06]] },
  stub: { f: () => sphere([0, 0, -0.01], 0.04), box: [[-0.06, -0.06, -0.07], [0.06, 0.06, 0.05]] },
  cat: { f: () => (x, y, z) => smin(tube([[0, 0, 0], [0.02, 0.0, -0.08], [0.1, 0.04, -0.13], [0.17, 0.12, -0.12], [0.19, 0.21, -0.08], [0.15, 0.27, -0.05]], [0.05, 0.05, 0.051, 0.052, 0.054, 0.05])(x, y, z), sphere([0.15, 0.27, -0.05], 0.058)(x, y, z), 0.02), box: [[-0.07, -0.08, -0.22], [0.28, 0.36, 0.06]], tip: (x, y, z) => 0.205 - y },
  dog: { f: () => tube([[0, 0, 0], [0, 0.05, -0.05], [0, 0.11, -0.06], [0, 0.15, -0.03]], [0.034, 0.032, 0.026, 0.02]), box: [[-0.06, -0.06, -0.12], [0.06, 0.2, 0.05]] },
  fox: { f: () => (x, y, z) => smin(ellipsoid([0, 0.13, -0.085], [0.112, 0.16, 0.104])(x, y, z), ellipsoid([0, 0.27, -0.035], [0.09, 0.115, 0.09])(x, y, z), 0.07), box: [[-0.14, -0.05, -0.21], [0.14, 0.41, 0.09]], tip: (x, y, z) => 0.265 - y - 0.15 * (z + 0.03) },
  tanuki: { f: () => (x, y, z) => smin(ellipsoid([0, 0.1, -0.066], [0.092, 0.13, 0.088])(x, y, z), ellipsoid([0.016, 0.235, -0.028], [0.078, 0.104, 0.078])(x, y, z), 0.06), box: [[-0.12, -0.05, -0.18], [0.13, 0.36, 0.08]], stripes: (x, y, z) => (y < 0.06 ? 1 : Math.abs((y % 0.085) - 0.0425) - 0.02), tip: (x, y, z) => 0.3 - y },
  duck: { f: () => roundCone([0, 0, 0], [0, 0.05, -0.04], 0.04, 0.012), box: [[-0.06, -0.05, -0.09], [0.06, 0.08, 0.05]] },
  // Poe's tight pug curl: up off the rump, then one and a quarter turns of a coil lying against the back (drifting to one side)
  curl: { f: () => { const pts = [], rad = []; for (let i = 0; i <= 16; i++) { const u = i / 16, th = -0.6 + u * 5.6, R = 0.052 - 0.022 * u; pts.push([0.006 + 0.03 * u, 0.06 + Math.sin(th) * R, -0.05 - Math.cos(th) * R * 0.92]); rad.push(0.03 - 0.013 * u); } pts.unshift([0, 0, 0], [0.002, 0.03, -0.02]); rad.unshift(0.032, 0.031); return (x, y, z) => smin(tube(pts, rad)(x, y, z), sphere(pts[pts.length - 1], rad[rad.length - 1] * 1.05)(x, y, z), 0.01); }, box: [[-0.05, -0.05, -0.13], [0.09, 0.14, 0.05]] },
};
function tailMesh(kind) {
  return cached(`toytail:${kind}`, () => {
    const T = TAILS[kind], raw = surfaceNets(T.f(), T.box[0], T.box[1], 0.0145);
    return cutLayers(raw, [T.stripes || null, T.tip || null]);
  });
}
export function toyTail(kind, fur, tipC, stripeC) {
  const T = tailMesh(kind);
  return painted(copy(T.g), T.mask, (x, y, z, nx, ny, nz, o) => { o.copy(fur); shadeLow(o, ny, 0.06); }, [stripeC, tipC]);
}
export const TOY_TAILS = TAILS;

// ------------------------------------------------------------------ hats and accessories (head space / body space)
const tinted = (g, hex, amt = 0.08) => paintFn(g, (x, y, z, nx, ny, nz, o) => { o.set(hex).multiplyScalar(1 - amt * clamp01(0.4 - ny)); return 0; });
/** a Toybox hat on the hat anchor (anchor space: y = 0 at the crown, the skull is about 0.47 wide) */
function hatShape(kind, color) {
  return cached(`toyhat:${kind}:${color}`, () => {
    const parts = [];
    if (kind === 'chef') { // Kuma's toque: a thick band and four merged puffs
      const band = new THREE.CylinderGeometry(0.155, 0.165, 0.09, 32, 1, true).translate(0, -0.0, 0);
      parts.push(tinted(band, '#fbfaf6'));
      const puffs = [[0, 0.15, 0, 0.12], [-0.11, 0.11, 0.025, 0.1], [0.11, 0.11, 0.025, 0.1], [0, 0.115, -0.1, 0.1], [0.0, 0.1, 0.1, 0.095], [-0.08, 0.1, -0.08, 0.085], [0.08, 0.1, -0.08, 0.085]];
      const f = U(puffs.map(([x, y, z, r]) => sphere([x, y, z], r)), 0.05);
      const g = surfaceNets((x, y, z) => smax(f(x, y, z), -(y - 0.045), 0.02), [-0.24, 0.0, -0.24], [0.24, 0.3, 0.24], 0.0165);
      parts.push(tinted(g, '#ffffff', 0.12));
    } else if (kind === 'flower') { // Usagi's petal hat: a low dome and five big rounded petals for a brim
      const dome = new THREE.SphereGeometry(0.17, 28, 10, 0, TAU, 0, Math.PI / 2).scale(1.2, 0.6, 1.14).translate(0, -0.02, 0);
      parts.push(tinted(dome, color));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.31, r = 0.2;
        const p = new THREE.SphereGeometry(1, 16, 8).scale(0.125, 0.032, 0.1).rotateX(0.2).rotateY(a).translate(Math.sin(a) * r, -0.03 + 0.008 * Math.cos(a), Math.cos(a) * r * 0.95);
        parts.push(tinted(p, C(color).multiplyScalar(i % 2 ? 0.96 : 1).getStyle(), 0.14));
      }
    } else if (kind === 'leaf') { // Tanu's leaf: a thick pointed oval with a stem and a painted vein
      const g = new THREE.SphereGeometry(1, 28, 12), P = g.attributes.position;
      for (let i = 0; i < P.count; i++) { const z = P.getZ(i); P.setX(i, P.getX(i) * (1 - 0.55 * z * z) * (z > 0 ? 1 - 0.25 * z : 1)); }
      const th = 1.2; // the leaf's long axis points to the character's left and a little forward, its tip up
      g.computeVertexNormals(); g.scale(0.125, 0.042, 0.19);
      const leafC = '#55944a'; // (a leaf is always leaf green, whatever the townsfolk hat colour)
      paintFn(g, (x, y, z, nx, ny, nz, o) => { o.set(leafC); if (Math.abs(x) < 0.0065 && y > 0) o.set('#34733b'); o.multiplyScalar(1 - 0.12 * clamp01(-ny)); return 0; });
      // draped over the crown: bent down toward both ends and both edges, lying on the skull, tipped a little forward
      const drape = gg => { const Q = gg.attributes.position; for (let i = 0; i < Q.count; i++) { const x = Q.getX(i), z = Q.getZ(i); Q.setY(i, Q.getY(i) - 1.5 * x * x - 1.35 * z * z); } gg.computeVertexNormals(); return gg; };
      drape(g);
      const M = new THREE.Matrix4().makeTranslation(0, 0.045, 0.02).multiply(new THREE.Matrix4().makeRotationX(0.12)).multiply(new THREE.Matrix4().makeRotationY(th));
      g.applyMatrix4(M); parts.push(g);
      const stem = tubeGeo([[0, -0.04, -0.17], [0, -0.025, -0.2], [0, 0.0, -0.215]], 0.012, 6).applyMatrix4(M);
      parts.push(tinted(stem, '#4a7a3a'));
    } else if (kind === 'straw') {
      parts.push(tinted(new THREE.CylinderGeometry(0.3, 0.31, 0.022, 40).translate(0, -0.02, 0), '#f2d27a'));
      parts.push(tinted(new THREE.SphereGeometry(0.16, 26, 12, 0, TAU, 0, Math.PI / 2).scale(1.05, 0.7, 1.05).translate(0, -0.01, 0), '#f2d27a'));
      parts.push(tinted(new THREE.CylinderGeometry(0.163, 0.165, 0.035, 32, 1, true).translate(0, 0.012, 0), color));
    } else if (kind === 'beret') {
      parts.push(tinted(new THREE.SphereGeometry(1, 28, 14).scale(0.21, 0.07, 0.2).rotateZ(-0.18).translate(0.03, -0.005, 0), color));
      parts.push(tinted(new THREE.SphereGeometry(0.016, 8, 6).translate(0.04, 0.07, 0), color));
    } else if (kind === 'bandana') {
      parts.push(tinted(new THREE.SphereGeometry(0.2, 28, 12, 0, TAU, 0, Math.PI * 0.55).scale(1.18, 0.75, 1.1).translate(0, -0.06, -0.01), color));
      parts.push(tinted(new THREE.SphereGeometry(1, 10, 8).scale(0.035, 0.028, 0.025).translate(0.03, -0.07, -0.21), color));
      parts.push(tinted(tubeGeo([[0.03, -0.08, -0.215], [0.06, -0.15, -0.21]], [0.022, 0.014], 6), color));
      parts.push(tinted(tubeGeo([[0.02, -0.08, -0.215], [-0.01, -0.14, -0.215]], [0.02, 0.012], 6), color));
    } else if (kind === 'flowerclip') { // a chunky five-petal flower clipped above the left ear
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; parts.push(tinted(new THREE.SphereGeometry(1, 12, 8).scale(0.028, 0.026, 0.012).translate(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0), color, 0.1)); }
      parts.push(tinted(new THREE.SphereGeometry(0.017, 10, 8).scale(1, 1, 0.6).translate(0, 0, 0.008), '#ffd23a'));
    } else if (kind === 'headband') { // a bandana tied round the forehead, the knot and two tails at the back
      const b = band(0.226, 0.026, 0.02, 40); b.scale(1.04, 1, 0.92); b.rotateX(-0.18);
      parts.push(tinted(b, color, 0.12));
      parts.push(tinted(new THREE.SphereGeometry(1, 10, 8).scale(0.03, 0.026, 0.022).translate(0, 0.03, -0.215), color));
      parts.push(tinted(tubeGeo([[0.01, 0.02, -0.225], [0.05, -0.04, -0.23]], [0.02, 0.012], 6), color));
      parts.push(tinted(tubeGeo([[-0.01, 0.02, -0.225], [-0.04, -0.035, -0.235]], [0.018, 0.011], 6), color));
    } else return null;
    return mergeIndexed(parts);
  });
}
// Hats are ear-aware: tall ears (cat, fox) stand clear of any brim, so brimmed or covering hats become a flower clip or a
// headband and a beret sits small and forward on the brow; round ears (bear, panda, tanuki, dog) keep a small hat on the
// crown between them; bunny ears go up through the hat (Usagi's sheet); frogs and ducks wear everything full size.
// Returns the geometry in hat-anchor space (y = 0 near the crown).
const EAR_CLASS = { cat: 'tall', fox: 'tall', bunny: 'bunny', bear: 'round', panda: 'round', tanuki: 'round', dog: 'round', frog: 'frog', duck: 'none' };
const HAT_FIT = {
  tall: { straw: ['flowerclip'], flower: ['flowerclip'], bandana: ['headband'], beret: ['beret', 0.62, [0, 0.025, 0.07], 0.35], chef: ['chef', 0.7, [0, 0.02, 0.05], 0.2] },
  round: { straw: ['straw', 0.52, [0, 0.032, 0.02]], flower: ['flower', 0.56, [0, 0.036, 0.02]], beret: ['beret', 0.7, [0, 0.03, 0.03]], bandana: ['headband'] },
  bunny: { bandana: ['headband'], beret: ['beret', 0.8, [0, 0.02, 0.03]] },
  frog: { beret: ['beret', 0.7, [0, 0.085, -0.02]], flower: ['flower', 0.62, [0, 0.09, -0.02]], bandana: ['beret', 0.7, [0, 0.085, -0.02]], chef: ['chef', 0.72, [0, 0.08, -0.02]], straw: ['straw', 0.85, [0, 0.11, -0.02]], leaf: ['leaf', 0.9, [0, 0.08, -0.02]] },
  none: {},
};
export function toyHat(kind, color, species) {
  const fit = HAT_FIT[EAR_CLASS[species] || 'none'][kind] || [kind], [shape, k = 1, off = [0, 0, 0], tilt = 0] = fit;
  return cached(`toyhatfit:${kind}:${color}:${species}`, () => {
    const g0 = hatShape(shape, color); if (!g0) return null;
    const g = copy2(g0);
    if (shape === 'flowerclip') { g.rotateY(0.9); g.translate(0.17, -0.05, 0.09); return g; } // above the left ear, toward the front
    if (shape === 'headband') { const H = HEADS[species] || HEADS.cat; g.scale(H.W * 0.9 / 0.235, 1, H.D * 0.93 / 0.208); g.translate(0, -0.08, 0); return g; }
    g.scale(k, k, k); if (tilt) g.rotateX(tilt); g.translate(...off);
    return g;
  });
}

// ------------------------------------------------------------------ the body (world metres at spec.scale 1; the classic kit's bones and names)
// species body plans: bw torso width, lk limb thickness, belly (a light oval on the bare tummy), foot kind, tail,
// chest (a light chest patch when bare)
const BODY = {
  bear: { bw: 1.15, lk: 1.14, belly: true, foot: 'big', tail: 'stub' },
  panda: { bw: 1.08, lk: 1.12, foot: 'big', tail: 'puff' },
  tanuki: { bw: 1.06, lk: 1.04, belly: true, foot: 'paw', tail: 'tanuki' },
  cat: { bw: 0.95, lk: 0.95, foot: 'paw', tail: 'cat' },
  fox: { bw: 0.97, lk: 0.97, foot: 'paw', tail: 'fox', chest: true },
  dog: { bw: 1.0, lk: 1.0, foot: 'paw', tail: 'dog', chest: true },
  bunny: { bw: 0.95, lk: 0.95, foot: 'long', tail: 'puff' },
  frog: { bw: 1.06, lk: 1.0, belly: true, foot: 'web', tail: 'none' },
  duck: { bw: 1.04, lk: 0.97, belly: true, foot: 'web', tail: 'duck' },
};
const HIP = 0.225, NECK_Y = 0.302, SHOULDER_Y = 0.25;
const TORSO_KEY = [[0.001, -0.078], [0.114, -0.07], [0.165, -0.032], [0.184, 0.035], [0.182, 0.105], [0.171, 0.168], [0.152, 0.222], [0.126, 0.268], [0.092, 0.304], [0.001, 0.328]]; // a squat pear
const torsoProfile = (() => { const p = new THREE.SplineCurve(TORSO_KEY.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(34); p[0].set(0.001, -0.078); p[p.length - 1].set(0.001, 0.328); return p; })();
function torsoR(y) { const p = torsoProfile; for (let i = 1; i < p.length; i++) if (p[i].y >= y) { const a = p[i - 1], b = p[i], t = (y - a.y) / (b.y - a.y || 1); return a.x + (b.x - a.x) * t; } return 0.001; }
function lathe(prof, seg = 48) { const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.deleteAttribute('uv'); return g; }
// a ring of soft cloth with a rounded section round the y axis (sashes, collars, cuffs, scarves)
function band(R0, hh, t, seg = 40) {
  const r = Math.min(hh, t / 2) * 0.95, a = R0 - t / 2, b = R0 + t / 2, pts = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 3; i++) { const q = a0 + (i / 3) * Math.PI / 2; pts.push([cx + Math.cos(q) * r, cy + Math.sin(q) * r]); } };
  arc(a + r, -hh + r, Math.PI); arc(b - r, -hh + r, -Math.PI / 2); arc(b - r, hh - r, 0); arc(a + r, hh - r, Math.PI / 2);
  pts.push(pts[0]);
  return lathe(pts, seg);
}
// the torso's surface point at height y and angle a (0 = front), `lift` off it
const onTorso = (y, a, bw, dz, lift = 0) => { const r = torsoR(y); return [Math.sin(a) * (r * bw + lift), y, Math.cos(a) * (r * dz + lift)]; };
// z of the torso's front (sgn 1) or back (-1) surface at x, y (+ lift)
const torsoZ = (x, y, bw, dz, lift = 0, sgn = 1) => { const r = torsoR(y) * bw + lift; return sgn * dz / bw * Math.sqrt(Math.max(0, r * r - x * x)); };
const kit = g => { g.userData.kit = true; return g; };
const flipWinding = g => { const I = g.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } return g; };

/**
 * Build a Toybox humanoid into the Rig R (charKit's Rig: group(), add(), skinData, parts). The skeleton and part
 * names are the classic kit's (Animator, npc.js poses, props, seats and portraits depend on them).
 */
export function buildToyBody(R, spec) {
  const kind = headKindToy(spec), B = BODY[kind] || BODY.dog, of = spec.outfit || {};
  const bw = B.bw * (spec.chubby || 1), lk = B.lk * (spec.chubby ? 1 + (spec.chubby - 1) * 0.6 : 1), dz = 0.86;
  const fur = C(spec.fur || '#c98f5e'), fur2 = C(spec.fur2 || '#fff2e0'), dark = C(spec.fur3 || spec.earColor || (kind === 'panda' ? '#29262d' : spec.fur || '#c98f5e'));
  const limbDark = kind === 'panda' ? C(spec.fur3 || '#29262d') : kind === 'tanuki' ? C(spec.fur3 || '#4a3a34') : null;
  const top = of.top || 'shirt', wrap = top === 'gi' || top === 'kimono', bare = top === 'none';
  const topC = C(of.topColor || '#6ea8ff'), botC = C((top === 'overalls' && of.overallColor) || of.bottomColor || '#4a4a6a');
  const trimC = of.topColor2 && of.topColor2 !== '#ffffff' ? C(of.topColor2) : top === 'kimono' ? C('#fff4e8') : C(of.topColor || '#6ea8ff').multiplyScalar(0.78);
  const skirt = top === 'kimono' && of.bottom !== 'pants' && of.bottom !== 'shorts'; // the toy line wears a short bell skirt / hakama with a kimono
  const pants = !bare && top !== 'dress' && !skirt;
  const shorts = pants && of.bottom === 'shorts';
  const innerC = spec.patterns?.chestBlaze ? C('#fffaf2') : kind === 'fox' ? C('#fff4e8') : fur2;

  // --- hierarchy
  const body = R.group(R.root, 'body', [0, HIP, 0]);
  const legX = 0.09 * Math.min(bw, 1.12);
  const legL = R.group(R.root, 'legL', [legX, HIP, 0]);
  const legR = R.group(R.root, 'legR', [-legX, HIP, 0]);
  const head = R.group(body, 'head', [0, NECK_Y, 0.008]);
  const armX = torsoR(SHOULDER_Y) * bw + 0.026 * lk;
  const armL = R.group(body, 'armL', [armX, SHOULDER_Y, 0]);
  const armR = R.group(body, 'armR', [-armX, SHOULDER_Y, 0]);
  armL.rotation.z = 0.36; armR.rotation.z = -0.36; // a toy A-pose: short arms clear of the round tummy
  R.group(armL, 'handL', [0, -0.17 * lk, 0.02]); R.group(armR, 'handR', [0, -0.17 * lk, 0.02]);
  R.group(body, 'back', [0, 0.17, -torsoR(0.17) * dz - 0.03]);

  // --- torso: a stubby bean, colour blocks cut in (clothes, belly, V-neck, lapels)
  const tor = lathe(torsoProfile.map(p => [p.x, p.y]), 46); tor.scale(bw, 1, dz);
  const waist = 0.035, V0 = 0.19, vK = 0.52 * bw;
  const L = [];
  if (!bare && top !== 'dress') L[0] = (x, y, z) => waist - y;                          // the top garment above the waist
  if (wrap) {
    L[1] = (x, y, z) => (z < 0 || y < V0 ? 1 : Math.abs(x) - (y - V0) * vK);            // the V opening
    L[2] = (x, y, z) => (z < 0 || y < V0 ? 1 : Math.abs(Math.abs(x) - (y - V0) * vK) - 0.012); // its lapel
  }
  if (top === 'overalls') L[1] = (x, y, z) => Math.min(y - 0.075, z < 0.04 ? 1 : Math.max(Math.abs(x) - 0.085 * bw, y - 0.215)); // bib + seat
  if (bare && B.belly) { const bx = (kind === 'frog' ? 0.132 : 0.112) * bw, by = kind === 'frog' ? 0.14 : 0.12; L[3] = (x, y, z) => (z < 0 ? 1 : hypot(x / bx, (y - 0.1) / by) - 1); }
  if (bare && B.chest) L[3] = (x, y, z) => (z < 0 ? 1 : hypot(x / (0.062 * bw), (y - 0.25) / 0.085) - 1);
  if (pants) L[4] = (x, y, z) => y - waist;
  const { g: tg, mask: tm } = cutLayers(tor, L);
  const shirtC = top === 'overalls' ? C(of.shirt || '#ffffff') : topC;
  painted(tg, tm, (x, y, z, nx, ny, nz, o) => { o.copy(top === 'dress' ? topC : fur); shadeLow(o, ny, 0.1); }, [
    (x, y, z, nx, ny, nz, o) => { o.copy(shirtC); shadeLow(o, ny, 0.1); },
    (x, y, z, nx, ny, nz, o) => { o.copy(top === 'overalls' ? botC : innerC); shadeLow(o, ny, 0.1); },
    (x, y, z, nx, ny, nz, o) => o.copy(trimC),
    (x, y, z, nx, ny, nz, o) => o.copy(kind === 'fox' ? C('#fff4e8') : fur2),
    (x, y, z, nx, ny, nz, o) => { o.copy(botC); shadeLow(o, ny, 0.1); },
  ]);
  const torsoParts = [tg];
  const ring = (y, lift) => { const pts = []; for (let i = 0; i <= 48; i++) pts.push(onTorso(y, (i / 48) * TAU, bw, dz, lift)); return pts; };
  // sash / obi: a thick soft band round the waist, with a knot (front for a gi and Kitsune's bell, back for Mochi's obi)
  if (of.sash) {
    const sy = waist + 0.035, hh = top === 'kimono' ? 0.04 : 0.028;
    torsoParts.push(tinted(band(torsoR(sy) + 0.014, hh, 0.03, 40).scale(bw, 1, dz).translate(0, sy, 0), of.sash, 0.12));
    const front = top !== 'kimono' || !!of.bell;
    const kz = (torsoR(sy) * dz + 0.03) * (front ? 1 : -1), kx = top === 'gi' ? 0.06 * bw : 0;
    const knot = new THREE.SphereGeometry(1, 16, 12).scale(top === 'kimono' ? 0.062 : 0.032, top === 'kimono' ? 0.038 : 0.03, 0.022).translate(kx, sy, kz);
    torsoParts.push(tinted(knot, C(of.sash).multiplyScalar(0.95).getStyle()));
    if (top === 'gi') for (const [a, l] of [[0.12, 0.075], [-0.25, 0.065]]) torsoParts.push(tinted(tubeGeo([[kx, sy - 0.01, kz + 0.004], [kx + Math.sin(a) * l, sy - 0.012 - Math.cos(a) * l, kz + 0.01]], [0.016, 0.019], 7), C(of.sash).multiplyScalar(0.9).getStyle()));
    if (of.bell) { // the shrine bell on the knot
      const bz = kz + 0.026, by = sy - 0.008;
      const bell = new THREE.SphereGeometry(0.03, 18, 12).translate(0, by, bz);
      torsoParts.push(paintFn(bell, (x, y, z, nx, ny, nz, o) => { o.set(of.bell); if (Math.abs(y - (by - 0.008)) < 0.0035 && z > bz) o.set('#7a5420'); if (y < by - 0.008 && Math.abs(x) < 0.003 && z > bz) o.set('#7a5420'); return 0; }));
    }
    if (of.brush) { // Mochi's paintbrush tucked into the obi at her left hip
      const bx = torsoR(sy) * bw * 0.7, bzz = torsoR(sy) * dz * 0.72 + 0.032;
      torsoParts.push(tinted(new THREE.CylinderGeometry(0.011, 0.012, 0.15, 10).rotateZ(-0.12).translate(bx, sy + 0.02, bzz), '#a87550'));
      torsoParts.push(tinted(new THREE.SphereGeometry(1, 10, 8).scale(0.016, 0.03, 0.016).rotateZ(-0.12).translate(bx - 0.01, sy + 0.105, bzz), '#6b4a38'));
    }
  }
  // kimono / gi: the wrap collar band along the V and round the neck
  if (wrap) {
    const side = sgn => { const pts = []; for (let y = V0 + 0.004; y <= 0.336; y += 0.012) { const r = torsoR(y), xx = sgn * Math.min((y - V0) * vK, r * bw * 0.9); pts.push([xx, y, torsoZ(xx, y, bw, dz, 0.006)]); } return pts; };
    const Lp = side(1), Rp = side(-1);
    torsoParts.push(tinted(tubeGeo([...Lp.reverse(), [0, 0.342, -0.045], ...Rp], 0.0105, 7), trimC.getStyle()));
  }
  if (top === 'shirt') torsoParts.push(tinted(band(torsoR(0.322) * 0.98, 0.012, 0.022, 40).scale(bw, 1, dz).translate(0, 0.322, 0), C(of.topColor || '#6ea8ff').multiplyScalar(0.86).getStyle())); // collar
  if (pants || top === 'shirt' || wrap) torsoParts.push(tinted(tubeGeo(ring(waist + (wrap ? -0.005 : 0.002), 0.004), 0.008, 6), (wrap ? trimC : C(of.topColor || '#6ea8ff').multiplyScalar(0.84)).getStyle())); // hem
  // overalls: straps, buttons and a big front pocket (Usagi's trowel sits in it)
  if (top === 'overalls') {
    const sc = (of.strapColor ? C(of.strapColor) : botC.clone().multiplyScalar(0.84)).getStyle();
    for (const s of [1, -1]) {
      const pts = [[s * 0.06, 0.205, torsoZ(s * 0.06, 0.205, bw, dz, 0.004)], [s * 0.07, 0.27, torsoZ(s * 0.07, 0.27, bw, dz, 0.004)], [s * 0.074, 0.335, 0.03], [s * 0.07, 0.29, torsoZ(s * 0.07, 0.29, bw, dz, 0.004, -1)], [s * 0.06, 0.2, torsoZ(s * 0.06, 0.2, bw, dz, 0.004, -1)]];
      torsoParts.push(tinted(tubeGeo(pts, 0.0125, 7), sc));
      torsoParts.push(tinted(new THREE.SphereGeometry(0.012, 10, 8).scale(1, 1, 0.5).translate(s * 0.06, 0.2, torsoZ(s * 0.06, 0.2, bw, dz, 0.01)), '#f4d06a'));
    }
    const pz = torsoZ(0, 0.12, bw, dz, 0.004);
    torsoParts.push(tinted(new THREE.SphereGeometry(1, 20, 12).scale(0.06 * bw, 0.045, 0.02).translate(0, 0.12, pz), botC.clone().multiplyScalar(1.03).getStyle()));
    torsoParts.push(tinted(tubeGeo([[-0.058 * bw, 0.152, pz + 0.006], [0, 0.158, pz + 0.014], [0.058 * bw, 0.152, pz + 0.006]], 0.005, 5), sc));
    if (of.trowel) {
      torsoParts.push(tinted(new THREE.CylinderGeometry(0.012, 0.013, 0.07, 10).rotateZ(0.12).translate(-0.012, 0.18, pz + 0.006), '#b88659'));
      torsoParts.push(tinted(new THREE.SphereGeometry(0.014, 8, 6).translate(-0.016, 0.218, pz + 0.006), '#b88659'));
    }
  }
  // dress: an A-line skirt with a white hem and a round collar
  if (top === 'dress') {
    const sk = lathe([[0.001, -0.07], [0.215, -0.07], [0.215, -0.05], [0.176, 0.04], [0.15, 0.12]], 48); sk.scale(bw, 1, dz * 1.04);
    torsoParts.push(tinted(sk, of.topColor || '#ff8fb0'));
    torsoParts.push(tinted(tubeGeo(Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * TAU; return [Math.sin(a) * 0.218 * bw, -0.062, Math.cos(a) * 0.218 * dz * 1.04]; }), 0.012, 6), of.topColor2 || '#ffffff'));
    torsoParts.push(tinted(band(0.07, 0.014, 0.03).scale(bw, 1, dz).translate(0, 0.33, 0), of.topColor2 || '#ffffff'));
  }
  // the bell skirt / hakama under a kimono
  if (skirt) {
    const r0 = torsoR(waist + 0.02) + 0.01, hem = of.pleats ? -0.135 : -0.12, flare = of.pleats ? 1.5 : 1.2;
    const sk = lathe([[0.001, hem + 0.004], [r0 * flare - 0.012, hem], [r0 * flare, hem + 0.012], [r0 * (flare - 0.1), hem + 0.07], [r0 + 0.004, waist + 0.03], [r0 - 0.01, waist + 0.06]], of.pleats ? 96 : 56);
    sk.scale(bw, 1, dz * 1.04);
    // hakama pleats: 14 soft box folds round (3-4 across the front), deepest at the hem, fading out at the waist
    const NF = 14, fold = a => { const u = ((a / TAU) * NF % 1 + 1) % 1; return Math.abs(u - 0.5) * 2; }; // 0 in a crease, 1 on a ridge
    if (of.pleats) {
      const P = sk.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = hypot(x, z); if (r < 0.02) continue; const k = 1 + 0.035 * (fold(Math.atan2(x, z)) - 0.5) * smoothstep(waist + 0.04, hem + 0.02, y); P.setX(i, x * k); P.setZ(i, z * k); }
      sk.computeVertexNormals();
    }
    const skC = C(of.skirt || of.bottomColor || '#4a4a6a');
    torsoParts.push(paintFn(sk, (x, y, z, nx, ny, nz, o) => { o.copy(skC); if (of.pleats && y < waist) o.multiplyScalar(0.84 + 0.16 * smoothstep(0.0, 0.18, fold(Math.atan2(x, z)))); o.multiplyScalar(1 - 0.1 * clamp01(0.4 - ny)); return 0; }));
  }
  // Kuma's apron: a broad bib and skirt panel, a thick waistband tied at the back
  if (of.apron) {
    const ac = C(of.apron), g = new THREE.PlaneGeometry(1, 1, 16, 22), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const u = P.getX(i), v = P.getY(i) + 0.5, y = -0.08 + v * 0.31, w = (y > 0.11 ? 0.075 + 0.03 * smoothstep(0.23, 0.11, y) : 0.135 + 0.012 * smoothstep(0.0, -0.08, y)) * bw;
      const x = u * 2 * w;
      P.setXYZ(i, x, y, torsoZ(x, Math.max(-0.05, y), bw, dz, 0.01) + (y < 0 ? -y * 0.12 : 0));
    }
    g.deleteAttribute('uv'); g.computeVertexNormals();
    const flour = (x, y) => { const f = Math.sin(x * 70 + y * 31) * Math.sin(y * 53 - x * 22); return f > 0.72 && y < 0.09 ? 0.45 : 0; };
    torsoParts.push(paintFn(g, (x, y, z, nx, ny, nz, o) => { o.copy(ac).lerp(C('#ffffff'), flour(x, y)); shadeLow(o, ny, 0.06); return 0; }));
    torsoParts.push(paintFn(flipWinding(g.clone()), (x, y, z, nx, ny, nz, o) => { o.copy(ac).multiplyScalar(0.9); return 0; })); // its back face
    torsoParts.push(tinted(band(torsoR(0.06) + 0.006, 0.012, 0.012, 40).scale(bw, 1, dz).translate(0, 0.06, 0), of.apron));
    torsoParts.push(tinted(new THREE.SphereGeometry(1, 12, 8).scale(0.035, 0.02, 0.012).translate(0, 0.06, -torsoR(0.06) * dz * bw - 0.012), of.apron));
  }
  // satchel at the right hip (strap from the left shoulder) and a coin pouch at the left hip (Tanu)
  if (of.bag) {
    const bc = C(of.bag), hx = -0.18 * bw, hz = 0.07, hy = 0.03;
    const box = cached('toyvol:bag', () => surfaceNets((x, y, z) => { const qx = Math.abs(x) - 0.05, qy = Math.abs(y) - 0.034, qz = Math.abs(z) - 0.012; return hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.018; }, [-0.09, -0.08, -0.05], [0.09, 0.08, 0.05], 0.0085));
    const bg = copy(box); bg.rotateY(-0.95); bg.translate(hx, hy, hz);
    torsoParts.push(paintFn(bg, (x, y, z, nx, ny, nz, o) => { o.copy(bc); if (y > hy + 0.004) o.multiplyScalar(0.92); o.multiplyScalar(1 - 0.1 * clamp01(0.4 - ny)); return 0; }));
    const strap = [];
    for (let i = 0; i <= 20; i++) { const u = i / 20, yy = 0.33 - u * 0.27, xx = 0.1 * bw - u * 0.24 * bw; strap.push([xx, yy, torsoZ(xx, yy, bw, dz, 0.008) + 0.002]); }
    for (let i = 0; i <= 14; i++) { const u = i / 14, yy = 0.06 + u * 0.27, xx = -0.14 * bw + u * 0.24 * bw; strap.push([xx, yy, torsoZ(xx, yy, bw, dz, 0.008, -1) - 0.002]); }
    torsoParts.push(tinted(tubeGeo(strap, 0.011, 6), bc.clone().multiplyScalar(0.92).getStyle()));
  }
  if (of.pouch) {
    const px = 0.16 * bw, pz = 0.06;
    const pg = new THREE.SphereGeometry(1, 16, 12), P = pg.attributes.position;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = y > 0.55 ? 0.55 + (y - 0.55) * 0.4 : 1; P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); }
    pg.deleteAttribute('uv'); pg.computeVertexNormals(); pg.scale(0.036, 0.04, 0.032).translate(px, 0.015, pz);
    torsoParts.push(tinted(pg, of.pouch, 0.15));
    torsoParts.push(tinted(band(0.016, 0.006, 0.01, 16).translate(px, 0.041, pz), C(of.pouch).multiplyScalar(0.85).getStyle()));
  }
  R.add(body, kit(mergeIndexed(torsoParts)), 'torso');

  // --- neckerchief / scarf: a thick ring, a knot and two short ends; the swinging tails hang behind
  if (of.scarf) {
    const yN = 0.268, sc = of.scarf, parts = [];
    const style = of.scarfStyle || (kind === 'bear' ? 'kerchief' : 'bow'), chunky = style === 'bow' ? 1.25 : style === 'ends' ? 1.2 : 1;
    parts.push(tinted(band(torsoR(yN) + 0.016 * chunky, 0.026 * chunky, 0.042 * chunky, 34).scale(bw, 1, dz).translate(0, yN, 0.0), sc, 0.12));
    const kz = torsoR(yN) * dz + 0.03 * chunky;
    parts.push(tinted(new THREE.SphereGeometry(1, 14, 10).scale(0.026 * chunky, 0.024 * chunky, 0.02).translate(0, yN - 0.012, kz), sc));
    for (const s of [1, -1]) {
      if (style === 'kerchief') { // triangular ends spreading down
        const g = new THREE.SphereGeometry(1, 12, 8), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setX(i, P.getX(i) * (0.55 + 0.45 * (1 - y) * 0.5 + 0.2)); } g.computeVertexNormals();
        g.scale(0.04, 0.034, 0.012); g.rotateZ(s * 0.7); g.translate(s * 0.034, yN - 0.046, kz - 0.004); parts.push(tinted(g, C(sc).multiplyScalar(0.96).getStyle()));
      } else { // teardrop ends (Pan, Kero) and bow loops (Pan)
        const g = new THREE.SphereGeometry(1, 12, 8).scale(0.026 * chunky, 0.036 * chunky, 0.014); g.rotateZ(s * 0.42); g.translate(s * 0.026 * chunky, yN - 0.05 * chunky, kz - 0.002); parts.push(tinted(g, C(sc).multiplyScalar(0.96).getStyle()));
        if (style === 'bow') { const l = new THREE.SphereGeometry(1, 12, 8).scale(0.034, 0.022, 0.015); l.rotateZ(-s * 0.3); l.translate(s * 0.042, yN - 0.008, kz - 0.006); parts.push(tinted(l, sc)); }
      }
    }
    if (of.badge) { // Kero's lily-pad badge on the knot
      const bdg = new THREE.CylinderGeometry(0.022, 0.022, 0.007, 20).rotateX(Math.PI / 2).translate(0, yN - 0.008, kz + 0.018);
      parts.push(paintFn(bdg, (x, y, z, nx, ny, nz, o) => { o.set(of.badge); const a = Math.atan2(x, y - (yN - 0.008)); if (Math.abs(a) < 0.25 && hypot(x, y - (yN - 0.008)) > 0.006) o.set(sc); if (nz < 0.5) o.multiplyScalar(0.8); return 0; }));
    }
    R.add(body, kit(mergeIndexed(parts)), 'scarf');
    const tails = R.group(body, 'scarfTail', [0, yN - 0.01, -torsoR(yN) * dz - 0.02]);
    R.add(tails, kit(tinted(new THREE.SphereGeometry(1, 10, 8).scale(0.024, 0.018, 0.012), sc)), 'scarfTails');
  }

  // --- tail
  const tk = spec.toy?.tail || spec.tail || B.tail;
  if (tk && tk !== 'none' && TAILS[tk]) {
    const ty = tk === 'curl' ? 0.07 : 0.035; // (a pug's curl sits high on the rump)
    const g = R.group(body, 'tail', [0, ty, -torsoR(ty) * dz + 0.012]);
    g.rotation.x = tk === 'fox' || tk === 'tanuki' ? -0.55 : tk === 'dog' ? -0.5 : tk === 'curl' ? -0.25 : 0;
    const calico = kind === 'cat' && spec.fur3 && spec.fur3 !== spec.fur;
    const tipC = tk === 'fox' ? C('#fff4e8') : tk === 'cat' && calico ? dark : tk === 'tanuki' ? C(spec.fur3 || '#4a3a34') : null;
    const stripeC = tk === 'tanuki' ? C(spec.fur3 || '#4a3a34') : null;
    const tf = tk === 'puff' && kind === 'bunny' ? C('#ffffff') : fur;
    R.add(g, kit(toyTail(tk, tf, tipC, stripeC)), 'tailMesh');
  }

  // --- legs (fur, or pants gathered into a cuff) and broad rounded feet
  const footC = kind === 'duck' ? C(spec.feet || '#ff9a3a') : spec.toy?.feet ? C(spec.toy.feet) : limbDark || (spec.patterns?.socks ? C('#fffaf2') : fur);
  for (const g of [legL, legR]) {
    const lr = 0.07 * lk + (pants ? 0.01 : 0), yTop = -0.01, yBot = -HIP + 0.075;
    const leg = new THREE.CapsuleGeometry(lr, yTop - yBot, 6, 18, 6); leg.deleteAttribute('uv');
    leg.translate(0, (yTop + yBot) / 2, 0); leg.scale(1, 1, 0.94);
    const legC = top === 'dress' ? C(of.socks || '#ffffff') : pants ? botC : kind === 'panda' ? limbDark : fur;
    const cuffY = shorts ? -0.075 : -HIP + 0.105;
    const parts = [paintFn(leg, (x, y, z, nx, ny, nz, o) => { o.copy(pants && y < cuffY ? (limbDark || fur) : legC); if (kind === 'tanuki' && !pants && y < -0.1) o.copy(limbDark); shadeLow(o, ny, 0.08); return 0; })];
    if (pants) parts.push(tinted(band(lr + 0.002, 0.011, 0.014, 22).translate(0, cuffY + 0.006, 0), botC.clone().multiplyScalar(0.86).getStyle()));
    const fg = copy(footGeo(B.foot, lk > 1.05 ? 1.12 : 1.06)).translate(0, -HIP, 0.0);
    parts.push(paintFn(fg, (x, y, z, nx, ny, nz, o) => { o.copy(footC); shadeLow(o, ny, 0.12); return 0; }));
    R.add(g, kit(mergeIndexed(parts)), 'leg');
  }
  // --- arms: chunky capsules (fur or sleeve), mitten paws; kimono / gi: wide short sleeves with a rolled cuff
  for (const [g, s] of [[R.parts.armL, 1], [R.parts.armR, -1]]) {
    const ar = 0.058 * lk, len = 0.105 * lk;
    const arm = new THREE.CapsuleGeometry(ar, len, 6, 16, 6); arm.deleteAttribute('uv'); arm.translate(0, -len / 2 - 0.004, 0);
    const sleeveC = bare ? (kind === 'panda' ? limbDark : fur) : top === 'overalls' ? C(of.shirt || '#ffffff') : top === 'dress' ? C(of.topColor || '#ff8fb0') : topC;
    const sleeveEnd = bare ? 9 : wrap ? -0.07 : -0.045;
    const parts = [paintFn(arm, (x, y, z, nx, ny, nz, o) => { o.copy(y > sleeveEnd ? sleeveC : kind === 'panda' ? limbDark : fur); shadeLow(o, ny, 0.06); return 0; })];
    if (wrap) {
      parts.push(tinted(lathe([[ar + 0.004, -0.075], [ar + 0.028, -0.088], [ar + 0.036, -0.075], [ar + 0.026, -0.03], [ar + 0.004, 0.02]], 22), topC.getStyle(), 0.1));
      parts.push(tinted(band(ar + 0.033, 0.008, 0.012, 22).translate(0, -0.082, 0), trimC.getStyle()));
    } else if (!bare) parts.push(tinted(lathe([[ar + 0.004, -0.05], [ar + 0.014, -0.045], [ar + 0.014, -0.02], [ar + 0.004, 0.02]], 20), sleeveC.getStyle(), 0.08));
    const mc = limbDark || fur;
    parts.push(paintFn(copy(mittenGeo(+(lk * 1.1).toFixed(3), s)).translate(0, -0.172 * lk, 0.008), (x, y, z, nx, ny, nz, o) => { o.copy(mc); shadeLow(o, ny, 0.1); return 0; }));
    if (s > 0 && of.ball) { // Pan's kemari ball in his left mitten
      const bc = [0.03, -0.2 * lk, 0.05], panels = [[1, 0.2, 0.5], [-0.6, 0.6, 0.6], [0.1, -0.8, 0.3], [-0.3, -0.1, -0.9]].map(v => { const l = hypot(...v); return v.map(c => c / l); });
      const bb = new THREE.SphereGeometry(0.062, 22, 16); bb.deleteAttribute('uv');
      const { g: bg, mask } = cutLayers(bb, [(x, y, z) => { const l = hypot(x, y, z) || 1; let m = -9; for (const v of panels) m = Math.max(m, (v[0] * x + v[1] * y + v[2] * z) / l); return 0.84 - m; }]);
      bg.translate(...bc);
      parts.push(painted(bg, mask, (x, y, z, nx, ny, nz, o) => o.set('#f4e8d5'), [C(of.ballColor || '#e87983')]));
    }
    R.add(g, kit(mergeIndexed(parts)), 'arm');
  }

  // --- head
  const Hd = buildToyHead(head, spec, kind);
  for (const [parent, g, name, skin] of Hd.geos) { const m = R.add(parent, kit(g), name); if (skin) R.skinData.set(m, skin); }
  Object.assign(R.parts, Hd.parts); R.parts.brows = [];
  const hatAnchor = R.group(head, 'hatAnchor', [0, Hd.top - 0.035, -0.01]);
  hatAnchor.userData.hatScale = 1;
  if (of.hat) { const hg = toyHat(of.hat, of.hatColor || '#f4c04a', kind); if (hg) R.add(hatAnchor, kit(copy2(hg)), 'hat'); else R.classicHat?.(hatAnchor, of.hat, of.hatColor || '#f4c04a'); }
  spec.toy?.extras?.(R, { body, head, legL, legR, armL: R.parts.armL, armR: R.parts.armR, kind, H: toyHead(kind), Hd, bw, dz, lk, fur, fur2, topC, botC, trimC, waist, ...TOY_KIT });
  R.parts.wave = 'out';            // short arms under a big head wave outward-up (as the Toybox Rosie)
  R.parts.toyArms = true;          // ... and stretch outward-up too (lifePoses stretch / sleepyYawn)
  R.squint = TOY_SQUINT;           // happy: the lower lid rises with its ^ arc, the upper lid tucks in behind it
  R.toy = true;
  toyScale(R, TOY_SCALE);
  R.root.scale.setScalar(spec.scale || 1);
  R.height = (HIP + NECK_Y + Hd.top + 0.04) * TOY_SCALE * (spec.scale || 1);
  return R;
}
// The kit is modelled at the sheets' sizes (a villager about 1 m); the baked Toybox heroes stand at about 1.3 times
// their sheets in the game, so the whole rig is scaled by the same factor before baking: every translation and every
// mesh scales by K (rotations and the lens scales stay), which is the same as scaling the world. The hat anchor
// keeps its contents unscaled and takes the factor as its scale instead (npc.js resets the anchor to
// userData.hatScale when a nightcap comes off).
export const TOY_SCALE = 1.3;
function toyScale(R, K) {
  const anchor = R.parts.hatAnchor;
  const walk = o => {
    for (const c of o.children) {
      c.position.multiplyScalar(K);
      if (c === anchor) { const h = (c.userData.hatScale ?? 1) * K; c.userData.hatScale = h; c.scale.setScalar(h); continue; }
      if (c.isMesh) c.geometry.scale(K, K, K);
      walk(c);
    }
  };
  walk(R.root);
}
/** the body-plan helpers a costume extra builds with (spec.toy.extras; sizes in the kit's sheet metres, before TOY_SCALE) */
export const TOY_KIT = { HIP, NECK_Y, SHOULDER_Y, torsoR, onTorso, torsoZ, band, lathe, tinted, kit, surfZ, surfY, cutLayers, painted, shadeLow, squircle, rotEll, mirX };
// a painted copy of a cached geometry (keeps colour and uv)
function copy2(g) { const o = copy(g); for (const k of ['color', 'uv']) if (g.attributes[k]) o.setAttribute(k, g.attributes[k].clone()); return o; }

// dev: how far the lens shows round its gaze (unit-sphere polar angle where it meets the skin) in 8 directions
export function debugEye(kind) {
  const H = toyHead(kind), E = H.eyeF, out = [];
  for (let k = 0; k < 8; k++) {
    const psi = (k / 8) * TAU; let a = 0;
    for (; a < 1.5; a += 0.01) { const d = V3(Math.sin(a) * Math.sin(psi), Math.sin(a) * Math.cos(psi), Math.cos(a)).multiply(V3(...E.R)).applyQuaternion(E.q).add(E.c); if (H.face(d.x, d.y, d.z) < 0) break; }
    out.push(+a.toFixed(2));
  }
  return { yaw: +Math.atan2(E.gaze.x, E.gaze.z).toFixed(2), pitch: +Math.asin(E.gaze.y).toFixed(2), up: out[0], upOut: out[1], out: out[2], downOut: out[3], down: out[4], downIn: out[5], in: out[6], upIn: out[7], R: E.R.map(v => +v.toFixed(3)), c: E.c.toArray().map(v => +v.toFixed(3)) };
}
