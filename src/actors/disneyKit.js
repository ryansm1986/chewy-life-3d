// Disney-style character kit: the procedural cast (villagers, Rosie, Shadow, humanoid monsters) sculpted the same way
// as the Blender-built Disney Chewy — smoothly blended signed-distance forms (gfx/sdf.js) — but at runtime, so every
// random villager still gets its own colours and outfit. Shapes are cached per species (built once, ~30-60 ms);
// each character only repaints its copy.
//
// Head anatomy (all species): a sculpted skull + muzzle with eye sockets; a separate lower JAW cut from the same
// shape along the lip line and a cylinder round the hinge, so it swings open with no gap at the cheeks and the cut
// faces become the mouth's roof and floor (plus a tongue, and teeth for some species); eyeballs with iris and pupil
// caps and highlights; upper and lower LIDS that rotate to blink; a nose leather; ears as cupped plates (the dog's
// rose ear folds, with its flap on its own bone). Hands have fingers and a thumb, feet have toes. No ink outline:
// the fur shader streaks the coat instead.
import * as THREE from 'three';
import { surfaceNets, ellipsoid, roundCone, sphere, tube, smin, smax, mirrorX, scaled, smoothstep, clamp01 } from '../gfx/sdf.js';
import { makeToon } from '../gfx/materials.js';

const TAU = Math.PI * 2;
const C = h => new THREE.Color(h);
const hypot = Math.hypot;

// ------------------------------------------------------------------ material: toon + procedural fur streaks
// uv.x of every kit vertex is its fur amount (0 cloth, eyes, nose; 1 coat). The streak noise lives in bind-pose
// space (the `position` attribute), so it sticks to the skin when the bones move, and fades out with distance.
const FUR_PARS = /* glsl */`
varying float vFur; varying vec3 vFurP;
float fHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fHash(i), fHash(i + vec3(1, 0, 0)), f.x), mix(fHash(i + vec3(0, 1, 0)), fHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fHash(i + vec3(0, 0, 1)), fHash(i + vec3(1, 0, 1)), f.x), mix(fHash(i + vec3(0, 1, 1)), fHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
export function furMaterial() {
  return makeToon({
    vertexColors: true, objectBrush: true, brush: 0.015, rim: 0.55, term: [-0.04, 0.34], shadowSat: 0.36,
    vertexPars: 'varying float vFur; varying vec3 vFurP;',
    vertexWorld: 'vFur = uv.x; vFurP = position;',
    fragPars: FUR_PARS,
    fragColor: /* glsl */`
      if (vFur > 0.01) {
        vec3 q = vFurP * vec3(210.0, 52.0, 210.0);             // strands run mostly up/down the body
        float n = fNoise(q) * 0.62 + fNoise(q * 2.7 + 7.1) * 0.38;
        float fade = 1.0 - smoothstep(0.45, 1.4, length(fwidth(q)));
        diffuseColor.rgb *= mix(1.0, 0.8 + 0.4 * n, fade * vFur);
      }`,
  });
}

// ------------------------------------------------------------------ geometry helpers
function tag(g, fur = 0) { // uv = (fur, 0) on every vertex
  const n = g.attributes.position.count, uv = new Float32Array(n * 2);
  if (fur) for (let i = 0; i < n; i++) uv[i * 2] = fur;
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function paintFn(g, fn) { // fn(x, y, z, nx, ny, nz, out THREE.Color) -> fur amount (or undefined)
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const col = new Float32Array(n * 3), uv = new Float32Array(n * 2), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const f = fn(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; uv[i * 2] = f ?? 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const solid = (g, hex, fur = 0) => { const c = C(hex); return paintFn(g, (x, y, z, a, b, d, o) => { o.copy(c); return fur; }); };
// indexed copy (the cache keeps the original)
const copy = g => { const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position.clone()); o.setAttribute('normal', g.attributes.normal.clone()); if (g.index) o.setIndex(g.index.clone()); return o; };
const indexed = g => { if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); } return g; };
export function mergeIndexed(list) {
  let nv = 0, ni = 0;
  for (const g of list) { indexed(g); nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const A = g.attributes, n = A.position.count;
    pos.set(A.position.array.subarray(0, n * 3), vo * 3); nor.set(A.normal.array.subarray(0, n * 3), vo * 3);
    if (A.color) { if (A.color.itemSize === 3) col.set(A.color.array.subarray(0, n * 3), vo * 3); else for (let i = 0; i < n; i++) { col[(vo + i) * 3] = A.color.getX(i); col[(vo + i) * 3 + 1] = A.color.getY(i); col[(vo + i) * 3 + 2] = A.color.getZ(i); } }
    if (A.uv) for (let i = 0; i < n; i++) uv[(vo + i) * 2] = A.uv.getX(i);
    const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    vo += n; io += I.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
const xform = (g, m) => { g.applyMatrix4(m); return g; };
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const S3 = s => new THREE.Matrix4().makeScale(s, s, s);
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
function mirrored(g) { // reflect in x, fixing the winding
  const o = copy(g); o.applyMatrix4(MIRROR);
  if (o.index) { const I = o.index.array; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
  return o;
}

const CACHE = new Map();
function cached(key, build) { let g = CACHE.get(key); if (!g) { g = build(); CACHE.set(key, g); } return g; }
export const kitCacheSize = () => CACHE.size;

// ------------------------------------------------------------------ species heads (sculpt space: metres, +x = the
// character's left, +y up, +z forward; origin at the head bone). Numbers for the dog are the Disney Chewy's.
const E = (c, r, k = 0, mir = false) => ({ f: ellipsoid(c, r), k, mir });
const RC = (a, b, r1, r2, k = 0, mir = false, sc = null) => ({ f: sc ? scaled(roundCone(a, b, r1, r2), sc.c, sc.s) : roundCone(a, b, r1, r2), k, mir });
const TU = (pts, radii, k = 0, mir = false) => ({ f: tube(pts, radii), k, mir });
function blend(list) { // left fold of smooth unions (k < 0: smooth subtraction)
  const fs = list.map(b => (b.mir ? mirrorX(b.f) : b.f));
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) { const k = list[i].k, v = fs[i](x, y, z); d = k < 0 ? smax(d, -v, -k) : smin(d, v, k); }
    return d;
  };
}

// every species: blobs (skull), eye, nose (leather or null), mouth (lip line x/y, hinge [y, z], radius), ears, colours
const HEADS = {
  dog: {
    K: 1.28, top: 0.14,
    blobs: [E([0, 0.03, -0.02], [0.12, 0.118, 0.122]), E([0, 0.01, 0.056], [0.084, 0.085, 0.08], 0.03), E([0.06, -0.045, 0.068], [0.043, 0.037, 0.04], 0.065, true),
      E([0.054, 0.018, 0.072], [0.05, 0.047, 0.043], 0.04, true), RC([0, 0.02, 0.08], [0, -0.012, 0.205], 0.036, 0.024, 0.045),
      RC([0, -0.025, 0.085], [0, -0.033, 0.2], 0.05, 0.031, 0.045, false, { c: [0, -0.028, 0.14], s: [1, 0.85, 1] }),
      E([0.025, -0.054, 0.175], [0.027, 0.021, 0.045], 0.028, true), E([0, -0.075, 0.142], [0.029, 0.019, 0.048], 0.028)],
    eye: { c: [0.06, 0.018, 0.09], r: 0.044, yaw: 0.26, pitch: 0.05, iris: 0.86, pupil: 0.4, lidD: -0.62, irisC: '#c8862e' },
    nose: { a: [[0, -0.013, 0.226], [0.03, 0.018, 0.021]], b: [[0, -0.027, 0.227], [0.018, 0.013, 0.017]], nost: [[0.007, -0.019, 0.246], [0.017, -0.018, 0.243], [0.025, -0.024, 0.233]], nr: 0.0036, color: '#3a1d1a' },
    mouth: { x: [0, 0.02, 0.037, 0.05, 0.056, 0.07], y: [-0.062, -0.059, -0.052, -0.039, -0.027, 0.0], hinge: [-0.05, 0.045], tongue: [[0, -0.068, 0.17], [0.024, 0.0045, 0.035]] },
    ears: 'rose', muzzleZ: 0.12,
  },
  cat: {
    K: 1.25, top: 0.135,
    blobs: [E([0, 0.03, -0.015], [0.125, 0.113, 0.118]), E([0, 0.0, 0.05], [0.09, 0.08, 0.075], 0.03), E([0.062, -0.04, 0.05], [0.05, 0.042, 0.045], 0.06, true),
      E([0.052, 0.022, 0.066], [0.05, 0.045, 0.04], 0.04, true), RC([0, -0.02, 0.07], [0, -0.034, 0.112], 0.036, 0.028, 0.04),
      E([0.02, -0.042, 0.106], [0.026, 0.021, 0.024], 0.02, true), E([0, -0.064, 0.096], [0.022, 0.014, 0.026], 0.02),
      RC([0.09, -0.03, 0.03], [0.135, -0.062, 0.0], 0.024, 0.004, 0.02, true), RC([0.085, -0.055, 0.035], [0.12, -0.085, 0.005], 0.02, 0.003, 0.018, true)],
    eye: { c: [0.056, 0.024, 0.08], r: 0.047, yaw: 0.22, pitch: 0.06, iris: 0.92, pupil: 0.36, lidD: -0.6, irisC: '#7fb04a' },
    nose: { a: [[0, -0.011, 0.126], [0.013, 0.008, 0.009]], b: [[0, -0.018, 0.124], [0.007, 0.007, 0.007]], nost: null, color: '#e8909c' },
    mouth: { x: [0, 0.012, 0.022, 0.03, 0.045], y: [-0.049, -0.054, -0.05, -0.043, -0.02], hinge: [-0.045, 0.03], tongue: [[0, -0.058, 0.09], [0.016, 0.0035, 0.022]] },
    ears: 'cat', muzzleZ: 0.08,
  },
  fox: {
    K: 1.26, top: 0.13,
    blobs: [E([0, 0.03, -0.02], [0.115, 0.11, 0.118]), E([0, 0.005, 0.05], [0.08, 0.075, 0.075], 0.03), E([0.066, -0.04, 0.045], [0.05, 0.042, 0.045], 0.06, true),
      E([0.05, 0.018, 0.07], [0.046, 0.042, 0.04], 0.04, true), RC([0, 0.018, 0.075], [0, -0.012, 0.2], 0.03, 0.016, 0.04),
      RC([0, -0.022, 0.08], [0, -0.03, 0.212], 0.04, 0.018, 0.04, false, { c: [0, -0.026, 0.14], s: [1, 0.85, 1] }),
      E([0, -0.058, 0.13], [0.022, 0.014, 0.045], 0.025),
      RC([0.09, -0.035, 0.03], [0.15, -0.075, -0.01], 0.027, 0.004, 0.02, true), RC([0.08, -0.06, 0.035], [0.13, -0.1, 0.0], 0.022, 0.003, 0.018, true)],
    eye: { c: [0.055, 0.02, 0.088], r: 0.042, yaw: 0.26, pitch: 0.05, iris: 0.86, pupil: 0.36, lidD: -0.6, irisC: '#d9902a' },
    nose: { a: [[0, -0.012, 0.222], [0.017, 0.011, 0.014]], b: [[0, -0.02, 0.221], [0.01, 0.008, 0.01]], nost: [[0.004, -0.015, 0.234], [0.01, -0.014, 0.232]], nr: 0.0024, color: '#241816' },
    mouth: { x: [0, 0.012, 0.022, 0.032, 0.045], y: [-0.046, -0.047, -0.043, -0.034, -0.012], hinge: [-0.045, 0.04], tongue: [[0, -0.052, 0.15], [0.016, 0.0035, 0.035]] },
    ears: 'fox', muzzleZ: 0.12,
  },
  bear: {
    K: 1.24, top: 0.145,
    blobs: [E([0, 0.03, -0.02], [0.13, 0.122, 0.125]), E([0, 0.0, 0.05], [0.095, 0.085, 0.08], 0.03), E([0.07, -0.04, 0.055], [0.05, 0.045, 0.045], 0.06, true),
      E([0.055, 0.022, 0.075], [0.045, 0.042, 0.038], 0.04, true),
      RC([0, -0.03, 0.075], [0, -0.04, 0.16], 0.056, 0.046, 0.045, false, { c: [0, -0.035, 0.12], s: [1, 0.8, 1] }), E([0, -0.075, 0.12], [0.035, 0.02, 0.04], 0.03)],
    eye: { c: [0.062, 0.024, 0.09], r: 0.036, yaw: 0.24, pitch: 0.05, iris: 0.86, pupil: 0.42, lidD: -0.6, irisC: '#6a3d22' },
    nose: { a: [[0, -0.018, 0.2], [0.032, 0.02, 0.022]], b: [[0, -0.032, 0.198], [0.02, 0.014, 0.016]], nost: [[0.008, -0.023, 0.219], [0.02, -0.022, 0.214]], nr: 0.004, color: '#2a1c1c' },
    mouth: { x: [0, 0.016, 0.03, 0.042, 0.06], y: [-0.07, -0.068, -0.062, -0.052, -0.02], hinge: [-0.06, 0.04], tongue: [[0, -0.075, 0.14], [0.026, 0.005, 0.03]] },
    ears: 'round', muzzleZ: 0.1,
  },
  tanuki: {
    K: 1.26, top: 0.135,
    blobs: [E([0, 0.03, -0.02], [0.122, 0.115, 0.12]), E([0, 0.005, 0.05], [0.086, 0.08, 0.078], 0.03), E([0.075, -0.045, 0.04], [0.055, 0.048, 0.05], 0.06, true),
      E([0.054, 0.02, 0.07], [0.048, 0.045, 0.042], 0.04, true), RC([0, 0.015, 0.078], [0, -0.012, 0.18], 0.032, 0.022, 0.04),
      RC([0, -0.025, 0.08], [0, -0.034, 0.18], 0.046, 0.03, 0.045, false, { c: [0, -0.03, 0.13], s: [1, 0.85, 1] }),
      E([0, -0.066, 0.13], [0.026, 0.016, 0.04], 0.028),
      RC([0.1, -0.04, 0.03], [0.155, -0.075, 0.0], 0.03, 0.005, 0.02, true), RC([0.09, -0.07, 0.035], [0.14, -0.105, 0.005], 0.024, 0.004, 0.018, true)],
    eye: { c: [0.058, 0.022, 0.088], r: 0.042, yaw: 0.26, pitch: 0.05, iris: 0.86, pupil: 0.4, lidD: -0.6, irisC: '#a0642a' },
    nose: { a: [[0, -0.016, 0.204], [0.024, 0.015, 0.017]], b: [[0, -0.027, 0.203], [0.015, 0.011, 0.013]], nost: [[0.006, -0.02, 0.219], [0.015, -0.019, 0.216]], nr: 0.003, color: '#2a1e1c' },
    mouth: { x: [0, 0.016, 0.03, 0.042, 0.06], y: [-0.058, -0.056, -0.05, -0.04, -0.012], hinge: [-0.05, 0.045], tongue: [[0, -0.064, 0.15], [0.02, 0.004, 0.03]] },
    ears: 'tanuki', muzzleZ: 0.11,
  },
  bunny: {
    K: 1.24, top: 0.155,
    blobs: [E([0, 0.035, -0.015], [0.112, 0.125, 0.118]), E([0, 0.005, 0.05], [0.085, 0.085, 0.075], 0.03), E([0.058, -0.045, 0.055], [0.048, 0.043, 0.045], 0.06, true),
      E([0.05, 0.024, 0.066], [0.048, 0.046, 0.04], 0.04, true), E([0.017, -0.04, 0.1], [0.025, 0.021, 0.023], 0.022, true), E([0, -0.064, 0.09], [0.02, 0.013, 0.022], 0.02)],
    eye: { c: [0.056, 0.026, 0.08], r: 0.05, yaw: 0.26, pitch: 0.06, iris: 0.9, pupil: 0.4, lidD: -0.6, irisC: '#8a4a3a' },
    nose: { a: [[0, -0.02, 0.118], [0.011, 0.007, 0.008]], b: [[0, -0.024, 0.117], [0.006, 0.006, 0.006]], nost: null, color: '#f09aa6' },
    mouth: { x: [0, 0.01, 0.02, 0.028, 0.045], y: [-0.056, -0.059, -0.055, -0.047, -0.02], hinge: [-0.05, 0.03], tongue: [[0, -0.062, 0.085], [0.014, 0.0035, 0.02]] },
    teeth: [[0.0055, -0.058, 0.108], [0.005, 0.006, 0.002]],
    ears: 'bunny', muzzleZ: 0.08,
  },
  frog: {
    K: 1.22, top: 0.13,
    blobs: [E([0, 0.0, 0.0], [0.15, 0.09, 0.13]), E([0.068, 0.068, 0.035], [0.052, 0.05, 0.05], 0.04, true), E([0, -0.055, 0.02], [0.105, 0.045, 0.1], 0.05)],
    eye: { c: [0.068, 0.082, 0.052], r: 0.045, yaw: 0.35, pitch: 0.3, iris: 0.75, pupil: 0.38, lidD: -0.5, irisC: '#e0b030' },
    nose: null, nostrils: [[0.018, 0.022, 0.126], 0.005],
    mouth: { x: [0, 0.04, 0.08, 0.11, 0.128, 0.15], y: [-0.022, -0.023, -0.02, -0.012, 0.0, 0.03], hinge: [-0.03, -0.045], tongue: [[0, -0.035, 0.08], [0.04, 0.006, 0.05]] },
    ears: 'none', muzzleZ: 0.09,
  },
  duck: {
    K: 1.24, top: 0.145,
    blobs: [E([0, 0.03, -0.01], [0.12, 0.12, 0.118]), E([0.06, -0.035, 0.04], [0.05, 0.045, 0.045], 0.06, true),
      RC([0, -0.02, 0.07], [0, -0.028, 0.205], 0.05, 0.036, 0.03, false, { c: [0, -0.028, 0.14], s: [1.3, 0.38, 1] }),
      RC([0, -0.048, 0.07], [0, -0.054, 0.19], 0.045, 0.032, 0.03, false, { c: [0, -0.052, 0.13], s: [1.22, 0.33, 1] })],
    eye: { c: [0.062, 0.035, 0.07], r: 0.036, yaw: 0.32, pitch: 0.05, iris: 0.92, pupil: 0.5, lidD: -0.6, irisC: '#3a2418' },
    nose: null, nostrils: [[0.012, -0.017, 0.16], 0.003],
    mouth: { x: [0, 0.03, 0.05, 0.062, 0.08], y: [-0.041, -0.04, -0.037, -0.032, -0.01], hinge: [-0.04, 0.035], tongue: [[0, -0.048, 0.12], [0.02, 0.004, 0.03]] },
    beak: { z: 0.083, color: '#ff9a3a' },
    ears: 'none', muzzleZ: 0.08,
  },
  human: {
    K: 1.2, top: 0.16,
    blobs: [E([0, 0.035, -0.01], [0.118, 0.132, 0.122]), E([0, -0.012, 0.035], [0.1, 0.1, 0.09], 0.04), E([0.052, -0.045, 0.068], [0.042, 0.036, 0.035], 0.05, true),
      E([0, -0.09, 0.065], [0.035, 0.03, 0.035], 0.04), RC([0, 0.0, 0.1], [0, -0.024, 0.12], 0.011, 0.016, 0.012),
      E([0, -0.054, 0.102], [0.021, 0.007, 0.01], 0.006), E([0, -0.067, 0.099], [0.019, 0.008, 0.01], 0.006)],
    eye: { c: [0.042, 0.006, 0.086], r: 0.034, yaw: 0.18, pitch: 0.0, iris: 0.56, pupil: 0.24, lidD: -0.52, irisC: '#7a4424', sclera: '#fbf8f4' },
    nose: null,
    mouth: { x: [0, 0.01, 0.018, 0.023, 0.035], y: [-0.0605, -0.0615, -0.0585, -0.054, -0.03], hinge: [-0.035, -0.02], tongue: [[0, -0.068, 0.08], [0.014, 0.004, 0.018]] },
    teeth: [[0.0, -0.063, 0.098], [0.013, 0.004, 0.003]],
    ears: 'human', muzzleZ: 0.1, human: true,
  },
  boston: {
    K: 1.22, top: 0.14,
    blobs: [E([0, 0.03, -0.02], [0.128, 0.118, 0.12]), E([0, 0.0, 0.05], [0.095, 0.085, 0.075], 0.03), E([0.066, -0.04, 0.055], [0.05, 0.045, 0.045], 0.06, true),
      E([0.062, 0.022, 0.07], [0.052, 0.05, 0.045], 0.04, true),
      RC([0, -0.025, 0.08], [0, -0.035, 0.14], 0.052, 0.046, 0.045, false, { c: [0, -0.03, 0.11], s: [1.15, 0.8, 1] }),
      E([0.03, -0.055, 0.12], [0.03, 0.022, 0.03], 0.025, true), E([0, -0.07, 0.1], [0.03, 0.018, 0.03], 0.025)],
    eye: { c: [0.066, 0.024, 0.085], r: 0.05, yaw: 0.38, pitch: 0.05, iris: 0.88, pupil: 0.42, lidD: -0.62, irisC: '#7a4a30' },
    nose: { a: [[0, -0.012, 0.16], [0.034, 0.02, 0.02]], b: [[0, -0.026, 0.158], [0.02, 0.014, 0.014]], nost: [[0.009, -0.017, 0.18], [0.022, -0.016, 0.175]], nr: 0.0042, color: '#141018' },
    mouth: { x: [0, 0.02, 0.035, 0.045, 0.062], y: [-0.052, -0.05, -0.044, -0.036, -0.01], hinge: [-0.05, 0.03], tongue: [[0, -0.058, 0.12], [0.022, 0.0045, 0.028]] },
    ears: 'bat', muzzleZ: 0.09,
  },
};
HEADS.panda = { ...HEADS.bear, eye: { ...HEADS.bear.eye, irisC: '#3a2a22' } };
// Moka (Boykin spaniel): the Blender Moka's head (tools/blender/disney/moka.py) — a rounder, domed skull, a shorter,
// broader muzzle, bigger golden eyes with lashes and long pendant ears. Picked for dogs with earKind 'spaniel'.
HEADS.spaniel = {
  K: 1.28, top: 0.15,
  blobs: [E([0, 0.033, -0.016], [0.122, 0.124, 0.12]), E([0, 0.01, 0.054], [0.086, 0.086, 0.08], 0.03), E([0.062, -0.044, 0.07], [0.046, 0.04, 0.042], 0.065, true),
    E([0.055, 0.021, 0.07], [0.052, 0.049, 0.045], 0.04, true), E([0, 0.066, 0.056], [0.08, 0.058, 0.062], 0.04),
    RC([0, 0.026, 0.08], [0, -0.008, 0.172], 0.037, 0.028, 0.045),
    RC([0, -0.027, 0.085], [0, -0.035, 0.162], 0.058, 0.044, 0.045, false, { c: [0, -0.03, 0.125], s: [1.16, 0.95, 1] }),
    E([0.03, -0.056, 0.152], [0.034, 0.025, 0.036], 0.028, true), E([0, -0.075, 0.128], [0.03, 0.019, 0.04], 0.028)],
  eye: { c: [0.0595, 0.021, 0.087], r: 0.0475, yaw: 0.23, pitch: 0.05, iris: 0.87, pupil: 0.42, lidD: -0.66, lidU: 0.9, irisC: '#e8a93a' },
  nose: { a: [[0, -0.012, 0.2], [0.031, 0.019, 0.021]], b: [[0, -0.027, 0.2], [0.019, 0.013, 0.016]], nost: [[0.007, -0.018, 0.221], [0.017, -0.017, 0.218], [0.025, -0.023, 0.207]], nr: 0.0034, color: '#4a2418' },
  mouth: { x: [0, 0.016, 0.029, 0.039, 0.045, 0.058], y: [-0.062, -0.06, -0.055, -0.047, -0.036, 0.0], hinge: [-0.05, 0.045], tongue: [[0, -0.068, 0.15], [0.019, 0.0042, 0.026]] },
  ears: 'spaniel', muzzleZ: 0.105, lashes: true,
};
export const HEAD_KINDS = Object.keys(HEADS);

// the lip line: y of the parting across the mouth, up to the corner (the last-but-one point)
function lipY(m, ax) {
  const X = m.x, Y = m.y, n = X.length - 1; // the last point only marks where the parting stops sideways
  if (ax >= X[n - 1]) return Y[n - 1];
  for (let i = 1; i < n; i++) if (ax <= X[i]) { const t = (ax - X[i - 1]) / (X[i] - X[i - 1]); return Y[i - 1] + (Y[i] - Y[i - 1]) * t; }
  return Y[0];
}
// The mouth: the head is ONE smooth surface, slit only along the lip line between the corners (the slit's edge is
// snapped onto the smile curve). The jaw bone pulls everything below the lips with a smooth weight: the lower lip and
// chin fully, fading toward the hinge and past the mouth corners, so the lips part and the corners and cheeks stretch
// like skin; there is no other seam to open. Behind the lips a dark mouth pocket (and the tongue) stretch with it.
function jawParts(H) {
  if (H._jaw) return H._jaw;
  const m = H.mouth;
  const ci = m.x.length - 2; // the last point only marks where the parting stops sideways
  const cornerY = m.y[ci], skin0 = skull(H);
  let cz = 0.3; for (let z = 0.3; z > -0.05; z -= 0.002) if (skin0(m.x[ci], cornerY, z) < 0) { cz = z; break; }
  let fz = 0.3; for (let z = 0.3; z > -0.05; z -= 0.002) if (skin0(0, m.y[0] - 0.004, z) < 0) { fz = z; break; } // lips, middle
  const hy = cornerY + 0.008, hz = cz - 0.07, zBack = hz - 0.012;
  const lip = (x, y) => y - lipY(m, Math.abs(x)); // > 0 above the parting
  return (H._jaw = { lip, hy, hz, zBack, cz, fz, cx: m.x[ci] });
}
// jaw bone influence (0..1); `below` forces the lower side of the slit
function jawWeight(H, x, y, z, below = false) {
  const J = jawParts(H), ax = Math.abs(x), l = below ? Math.min(J.lip(x, y), -1e-6) : J.lip(x, y);
  if (l >= 0) return 0;
  const wz = smoothstep(J.zBack, J.zBack + 0.06, z);                                  // the chin leads; fades toward the hinge
  const side = smoothstep(J.cx + 0.04, J.cx, ax);                                     // and past the mouth corners
  const ramp = 1 - smoothstep(J.cx - 0.012, J.cx + 0.004, ax) * (1 - smoothstep(0, -0.014, l)); // beyond the corner: eases in under the lip line
  return wz * side * ramp;
}

function skull(H) {
  if (H._skull) return H._skull;
  const e = H.eye, sock = sphere(e.c, e.r + 0.003);
  let f = blend(H.blobs);
  const g = (x, y, z) => smax(f(x, y, z), -sock(Math.abs(x), y, z), 0.013); // soft socket rims (a hard cut meshed crumbly)
  let out = g;
  if (H.nostrils) { const [c, r] = H.nostrils, n = sphere(c, r); out = (x, y, z) => smax(g(x, y, z), -n(Math.abs(x), y, z), 0.003); }
  return (H._skull = out);
}

const BOX = { lo: [-0.2, -0.16, -0.17], hi: [0.2, 0.2, 0.26] };
const skullGeo = kind => cached(`head:${kind}`, () => surfaceNets(skull(HEADS[kind]), BOX.lo, BOX.hi, 0.0078));
// the skull mesh with the lips slit open: triangles below the lip line between the corners get their own copies of
// the vertices they share with the rest (those copies are snapped onto the lip curve, so the closed mouth is seamless)
function slitHead(kind) {
  return cached(`slit:${kind}`, () => {
    const H = HEADS[kind], g = skullGeo(kind);
    if (!H.mouth) return { g, below: null };
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
    const pos = Array.from(P.array), nor = Array.from(g.attributes.normal.array), below = [];
    const dup = new Int32Array(n).fill(-1);
    for (let v = 0; v < n; v++) below[v] = touchJ[v] && !touchH[v] ? 1 : 0;
    for (let v = 0; v < n; v++) {
      if (!(touchJ[v] && touchH[v])) continue;
      // only the parting splits (elsewhere the weights are continuous, so the shared vertex stays one vertex)
      const x = P.getX(v); if (Math.abs(x) > J.cx - 0.002 || Math.abs(J.lip(x, P.getY(v))) > 0.009) { below[v] = 0; continue; }
      pos[v * 3 + 1] = lipY(H.mouth, Math.abs(x)); // on the slit: snap onto the lip curve, then split
      dup[v] = pos.length / 3; below.push(1);
      pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); nor.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
    }
    const idx = Array.from(I);
    for (let t = 0; t < idx.length; t += 3) if (isJaw[t / 3]) for (let q = 0; q < 3; q++) { const d = dup[idx[t + q]]; if (d >= 0) idx[t + q] = d; }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setIndex(idx);
    return { g: o, below: Uint8Array.from(below) };
  });
}

// ------------------------------------------------------------------ colours
const JAWDBG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('jawdbg');
const lerpC = (o, c, t) => (t > 0 ? o.lerp(c, Math.min(1, t)) : o);
export function speciesColors(spec, sp) {
  const human = sp.human;
  const fur = C(human ? spec.skin || '#ffe2cf' : spec.fur || '#c98f5e');
  const fur2 = C(spec.fur2 || '#fff2e0');
  const fur3 = C(spec.fur3 || spec.earColor || (sp.patches ? '#2a2630' : spec.fur || '#c98f5e'));
  return { fur, fur2, fur3, ear: C(spec.earColor || spec.fur3 || spec.fur || '#c98f5e'), inner: C(spec.earInner || '#ffb0b8'), white: C('#fbf6ee'),
    nose: C(spec.nose || null), mouth: C('#5a1e26'), gum: C('#8a3040'), blush: C(spec.blush && spec.blush !== 'none' ? spec.blush : '#ff9ab0') };
}

function paintHead(g, kind, part, spec, cols) {
  const H = HEADS[kind], S = skull(H), m = H.mouth, human = H.human;
  const pat = spec.patterns || {}, e = H.eye;
  const cheekTone = C(cols.fur.getStyle()).lerp(cols.blush, 0.18);
  return paintFn(g, (x, y, z, nx, ny, nz, o) => {
    const ax = Math.abs(x), depth = -S(x, y, z);
    o.copy(cols.fur);
    let fur = human ? 0 : 1;
    // light muzzle / chin / throat (fur2)
    const muz = smoothstep(H.muzzleZ - 0.02, H.muzzleZ + 0.03, z) * smoothstep(0.02, -0.02, y);
    const lowFace = smoothstep(-0.02, -0.07, y) * smoothstep(0.0, 0.06, z);
    if (!human && kind !== 'frog' && kind !== 'duck') lerpC(o, cols.fur2, Math.max(muz * 0.85, lowFace * 0.9));
    if (kind === 'fox') lerpC(o, cols.fur2, smoothstep(-0.02, -0.045, y + 0.25 * (ax - 0.05)) * smoothstep(0.01, 0.05, z)); // white cheeks
    if (kind === 'cat' && pat.cheeks) lerpC(o, cols.fur2, smoothstep(0.0, -0.035, y) * smoothstep(0.03, 0.07, z));
    if (kind === 'frog') lerpC(o, cols.fur2, smoothstep(-0.02, -0.06, y));
    if (kind === 'panda') { // black eye patches, tilted teardrops
      const px = ax - e.c[0] - 0.004, py = y - e.c[1] + 0.012 + 0.35 * (ax - e.c[0]);
      lerpC(o, cols.fur3, smoothstep(1.15, 0.9, hypot(px / 0.045, py / 0.058)) * smoothstep(0.02, 0.05, z));
    }
    if (kind === 'tanuki') { // bandit mask across the eyes
      const band = smoothstep(0.035, 0.022, Math.abs(y - e.c[1] + 0.012 + 0.2 * ax)) * smoothstep(0.012, 0.03, ax) * smoothstep(0.02, 0.05, z);
      lerpC(o, cols.fur3, band);
    }
    if (kind === 'boston') {
      lerpC(o, cols.white, smoothstep(0.018, 0.01, ax - Math.max(0, 0.03 - y) * 0.25) * smoothstep(0.02, 0.06, z)); // blaze
      lerpC(o, cols.white, smoothstep(0.075, 0.1, z) * smoothstep(0.01, -0.02, y));                                 // muzzle
    }
    if (pat.blaze) lerpC(o, cols.white, smoothstep(0.017, 0.009, ax - Math.max(0, -y) * 0.3) * smoothstep(0.03, 0.07, z));
    if (pat.faceWhite) lerpC(o, cols.white, smoothstep(0.0, -0.03, y) * smoothstep(0.03, 0.07, z));
    if (pat.chin) lerpC(o, C(pat.chin), smoothstep(-0.055, -0.075, y) * smoothstep(0.06, 0.1, z));
    if (human) { lerpC(o, cheekTone, smoothstep(0.03, 0.0, hypot(ax - 0.052, y + 0.035, z - 0.09)) * 0.9); } // rosy cheeks
    else if (spec.blush !== 'none') lerpC(o, cheekTone, smoothstep(0.028, 0.0, hypot(ax - 0.065, y + 0.03, z - 0.07)) * 0.5);
    if (human) { // lips
      const lip = smoothstep(0.009, 0.004, hypot(ax * 0.55, y + 0.061, (z - 0.1) * 0.8));
      lerpC(o, C('#e88a8a'), lip * 0.85);
    }
    if (H.beak && z > H.beak.z - 0.004 && y < 0.0) { o.copy(C(H.beak.color)).multiplyScalar(0.92 + 0.08 * clamp01(ny)); fur = 0; }
    // the closed parting reads as a dark line
    if (m) {
      const J = jawParts(H);
      if (ax < J.cx + 0.004 && z > J.zBack + 0.03) {
        const d = Math.abs(J.lip(x, y));
        if (d < 0.0055) { lerpC(o, C('#2a1418'), smoothstep(0.0055, 0.0025, d)); fur = 0; }
      }
    }
    // soft shading: darker under the chin, and the socket walls in soft shadow (a lit wall read as a pale ring)
    o.multiplyScalar(1 - 0.08 * clamp01(0.3 - ny));
    const de = hypot(ax - e.c[0], y - e.c[1], z - e.c[2]);
    if (de < e.r + 0.012) o.multiplyScalar(1 - 0.4 * smoothstep(e.r + 0.012, e.r + 0.004, de));
    if (JAWDBG && m) { const w = jawWeight(H, x, y, z); if (w > 0.01) { o.setRGB(w, 0.2, 1 - w); fur = 0; } }
    return fur;
  });
}

// ------------------------------------------------------------------ eyes and lids (eye frame: gaze +z, up +y)
function eyeGeos(r, iris, pupil) {
  return cached(`eye:${r}:${iris}:${pupil}`, () => {
    const ball = new THREE.SphereGeometry(r, 20, 14);
    const cap = (rr, ang) => { const g = new THREE.SphereGeometry(rr, 26, 4, 0, TAU, 0, ang); g.rotateX(Math.PI / 2); return g; };
    return { ball, iris: cap(r * 1.004, iris), pupil: cap(r * 1.008, pupil), hi: new THREE.SphereGeometry(r * 0.2, 10, 8), hi2: new THREE.SphereGeometry(r * 0.09, 8, 6) };
  });
}
function lidGeo(r, from, to, rim) { // spherical band (polar angles from +y), spanning the front, plus a rim tube along `rim`
  const shell = new THREE.SphereGeometry(r, 22, 8, Math.PI / 2 - 1.2, 2.4, from, to - from); // front 140 deg only: wider poked through the temples
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const ph = Math.PI / 2 - 1.18 + (2.36 * i) / 18, st = Math.sin(rim), ct = Math.cos(rim);
    pts.push([-r * Math.cos(ph) * st, r * ct, r * Math.sin(ph) * st]);
  }
  const rimG = tubeGeo(pts, 0.0022, 6);
  return { shell, rim: rimG };
}
function tubeGeo(pts, r, radial = 6) { // simple tube mesh along points (closed ends not needed: it is always embedded); r: radius or radii
  const pos = [], nor = [], idx = [];
  const v = pts.map(p => new THREE.Vector3(...p));
  let prevN = null;
  for (let i = 0; i < v.length; i++) {
    const t = (i < v.length - 1 ? v[i + 1].clone().sub(v[i]) : v[i].clone().sub(v[i - 1])).normalize();
    let n = prevN ? prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize() : new THREE.Vector3().crossVectors(t, Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    prevN = n; const b = new THREE.Vector3().crossVectors(t, n);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU, d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      const rr = Array.isArray(r) ? r[i] : r;
      pos.push(v[i].x + d.x * rr, v[i].y + d.y * rr, v[i].z + d.z * rr); nor.push(d.x, d.y, d.z);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < v.length - 1; i++) for (let k = 0; k < radial; k++) { const a = i * row + k, b2 = a + row; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ ears (ear frame: +y up the ear, +z out of the inner face, +x across)
function leaf2d(u, v, R0, R1, L) {
  const b = (R0 - R1) / L, a = Math.sqrt(1 - b * b), av = Math.abs(v), k = u * a - av * b;
  if (k < 0) return hypot(av, u) - R0;
  if (k > a * L) return hypot(av, u - L) - R1;
  return av * a + u * b - R0;
}
function slab(d2, w, t, r) { const dz = Math.abs(w) - t; return hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0) - r; }
function earPlate({ L, R0, R1, t0, t1, cup, r = 0.004 }) {
  return (x, y, z) => slab(leaf2d(y, x, R0, R1, L), z + cup * x * x / R0, t0 + (t1 - t0) * clamp01(y / L), r);
}
const EARS = {
  //         plate                                                                          base (left ear)         splay lean  face   extra
  rose: { plate: { L: 0.07, R0: 0.052, R1: 0.044, t0: 0.011, t1: 0.009, cup: 0.3, r: 0.005 }, flap: { L: 0.085, R0: 0.044, R1: 0.026, t0: 0.009, t1: 0.007, cup: 0.3, r: 0.005 }, fold: 2.7,
    base: [0.086, 0.098, -0.028], splay: 0.42, lean: 0.1, face: 0.45, inner: true },
  cat: { plate: { L: 0.085, R0: 0.048, R1: 0.01, t0: 0.009, t1: 0.004, cup: 0.35 }, base: [0.072, 0.1, -0.01], splay: 0.36, lean: 0.08, face: 0.35, inner: true },
  fox: { plate: { L: 0.12, R0: 0.056, R1: 0.01, t0: 0.01, t1: 0.004, cup: 0.4 }, base: [0.066, 0.098, -0.015], splay: 0.3, lean: 0.1, face: 0.3, inner: true, tip: true },
  bunny: { plate: { L: 0.19, R0: 0.031, R1: 0.028, t0: 0.009, t1: 0.007, cup: 0.3 }, base: [0.036, 0.13, -0.015], splay: 0.16, lean: 0.14, face: 0.2, inner: true, soft: true },
  round: { plate: { L: 0.032, R0: 0.042, R1: 0.037, t0: 0.012, t1: 0.011, cup: 0.3 }, base: [0.082, 0.105, -0.02], splay: 0.5, lean: 0.1, face: 0.3, inner: true },
  tanuki: { plate: { L: 0.05, R0: 0.045, R1: 0.024, t0: 0.011, t1: 0.008, cup: 0.3 }, base: [0.08, 0.1, -0.02], splay: 0.45, lean: 0.1, face: 0.35, inner: true },
  bat: { plate: { L: 0.105, R0: 0.054, R1: 0.017, t0: 0.009, t1: 0.004, cup: 0.45 }, base: [0.074, 0.096, -0.02], splay: 0.38, lean: 0.12, face: 0.42, inner: true },
  human: { plate: { L: 0.045, R0: 0.022, R1: 0.02, t0: 0.006, t1: 0.006, cup: 0.5 }, base: [0.116, 0.004, -0.004], splay: 0.0, lean: 0.12, face: 1.35, inner: false },
};
function earFrame(E, side) { // rotation (as a quaternion) whose +y is up the ear and +z the inner face
  const s = side, up = new THREE.Vector3(s * Math.sin(E.splay), Math.cos(E.splay) * Math.cos(E.lean), -Math.cos(E.splay) * Math.sin(E.lean)).normalize();
  const face = new THREE.Vector3(s * Math.sin(E.face), 0, Math.cos(E.face));
  face.addScaledVector(up, -face.dot(up)).normalize();
  const x = new THREE.Vector3().crossVectors(up, face);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, face));
}
function earGeo(kind, which) {
  return cached(`ear:${kind}:${which}`, () => {
    const E = EARS[kind], p = which === 'flap' ? E.flap : E.plate;
    const f = which === 'base' && E.flap ? (x, y, z) => smax(earPlate(p)(x, y, z), y - p.L, 0.004) : earPlate(p);
    const w = p.R0 + 0.012, L = p.L + p.R1 + 0.012;
    return surfaceNets(f, [-w, -p.R0 - 0.01, -0.03], [w, L, 0.03], 0.0062);
  });
}
function paintEar(g, E, p, cols, dark) {
  return paintFn(g, (x, y, z, nx, ny, nz, o) => {
    o.copy(cols.ear);
    if (E.inner && nz > 0.2) { // inner face, inside the rim
      const d = leaf2d(y, x, p.R0 * 0.72, p.R1 * 0.6, p.L * 0.9);
      lerpC(o, cols.inner, smoothstep(0.0, -0.008, d) * 0.9);
    }
    if (dark) lerpC(o, C('#241816'), smoothstep(p.L * 0.55, p.L * 0.95, y) * 0.9);
    return 1;
  });
}

// ---- the spaniel's pendant ear (Moka; the Blender Moka's ear, moka.py): a long, thick, wavy leaf hanging from the
// side of the skull, draping in toward the cheek and ending in curly locks round the hem. Sculpted in head space
// relative to its set (left ear) as ONE mesh blended between the ear bone and a tip bone (its lower two thirds
// swing). The ear bone sits in a mount turned half round, so the Animator's spring drive (tuned on perked flaps)
// swings a hanging ear back when running and out on a flick.
const SPANIEL = (() => {
  const nrm = v => { const l = hypot(...v); return v.map(c => c / l); };
  const U = nrm([0.3, -1, -0.05]);                                 // down the ear: splaying out, a little back
  let W = nrm([1, 0.2, 0.08]); const k = W[0] * U[0] + W[1] * U[1] + W[2] * U[2];
  W = nrm(W.map((c, i) => c - U[i] * k));                           // out of the ear's outer face
  const A = [U[1] * W[2] - U[2] * W[1], U[2] * W[0] - U[0] * W[2], U[0] * W[1] - U[1] * W[0]]; // across
  return { U, W, A, base: [0.104, 0.072, -0.004], L: 0.152, R0: 0.033, R1: 0.06, fold: 0.055 };
})();
const spanielCentre = u => { const uu = Math.max(u, 0); return 0.006 - 0.55 * uu * uu + 0.9 * uu * uu * uu; };
function spanielUVW(x, y, z) {
  const { U, W, A } = SPANIEL;
  return [x * U[0] + y * U[1] + z * U[2], x * A[0] + y * A[1] + z * A[2], x * W[0] + y * W[1] + z * W[2]];
}
function spanielEar(x, y, z) {
  const S = SPANIEL, [u, v, w] = spanielUVW(x, y, z);
  const t = clamp01(u / (S.L + S.R1));
  let d2 = leaf2d(u, v, S.R0, S.R1, S.L);
  d2 += 0.0068 * Math.cos(Math.atan2(v, u - 0.62 * S.L) * 8 + 0.6) * smoothstep(0.35 * S.L, 0.95 * S.L, u); // curly locks
  const wave = 0.0032 * Math.sin(u * 110 + 2.6 * Math.sin(v * 52)) * smoothstep(0.015, 0.05, u);             // waves across
  return slab(d2, w - spanielCentre(u) + wave + 0.22 * v * v / S.R1, 0.006 + 0.0105 * t * t, 0.0065);
}
const spanielBase = () => cached('ear:spaniel', () => surfaceNets(spanielEar, [-0.06, -0.27, -0.1], [0.13, 0.05, 0.1], 0.005));
/** the ear mesh for side s, in its ear bone's (half-turned) frame, painted; w = the tip bone's share per vertex */
function spanielEarGeo(s, cols) {
  const g = s > 0 ? copy(spanielBase()) : mirrored(spanielBase());
  const P = g.attributes.position, w = new Float32Array(P.count), S = SPANIEL;
  const base = cols.fur.clone().lerp(cols.ear, 0.25), deep = base.clone().multiplyScalar(0.78), lite = base.clone().lerp(C('#c89066'), 0.38);
  const inner = base.clone().lerp(cols.inner, 0.35);
  paintFn(g, (x, y, z, nx, ny, nz, o) => {
    const [u, v, ww] = spanielUVW(x * s, y, z);
    const wave = 0.5 + 0.5 * Math.sin(u * 110 + 2.6 * Math.sin(v * 52));
    o.copy(base); lerpC(o, deep, 0.45 * (1 - wave) * smoothstep(0.0, 0.03, u)); lerpC(o, lite, 0.5 * wave * smoothstep(0.02, 0.1, u));
    lerpC(o, lite, 0.45 * smoothstep(0.1, 0.17, u));                              // sun-warmed curly hem
    if (ww < spanielCentre(u) - 0.006) lerpC(o, inner, 0.6);
    return 1;
  });
  for (let i = 0; i < P.count; i++) w[i] = smoothstep(S.fold - 0.015, S.fold + 0.03, spanielUVW(P.getX(i) * s, P.getY(i), P.getZ(i))[0]);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)); // into the half-turned mount frame
  return { g, w };
}

// ------------------------------------------------------------------ noses
function noseGeo(kind) {
  return cached(`nose:${kind}`, () => {
    const n = HEADS[kind].nose;
    const body = (x, y, z) => smin(ellipsoid(...n.a)(x, y, z), ellipsoid(...n.b)(x, y, z), 0.012);
    const f = n.nost ? ((t) => (x, y, z) => smax(body(x, y, z), -t(Math.abs(x), y, z), 0.002))(tube(n.nost, n.nost.map(() => n.nr))) : body;
    const c = n.a[0], r = n.a[1];
    return surfaceNets(f, [c[0] - r[0] - 0.01, c[1] - r[1] - 0.02, c[2] - r[2] - 0.012], [c[0] + r[0] + 0.01, c[1] + r[1] + 0.01, c[2] + r[2] + 0.014], 0.003);
  });
}

// ------------------------------------------------------------------ hands and feet (world metres)
const HANDS = {
  paw: { palm: [[0, -0.045, 0.01], [0.042, 0.048, 0.037]], fingers: 4, flen: 0.034, fr: 0.0155, spread: 0.019, thumb: 0.013 },
  bear: { palm: [[0, -0.048, 0.01], [0.05, 0.052, 0.042]], fingers: 4, flen: 0.022, fr: 0.018, spread: 0.022, thumb: 0.015, claws: true },
  web: { palm: [[0, -0.038, 0.008], [0.032, 0.036, 0.026]], fingers: 3, flen: 0.05, fr: 0.009, spread: 0.022, thumb: 0, pads: true },
  human: { palm: [[0, -0.04, 0.008], [0.034, 0.04, 0.02]], fingers: 4, flen: 0.04, fr: 0.0085, spread: 0.0145, thumb: 0.009 },
  fox: { palm: [[0, -0.043, 0.01], [0.038, 0.045, 0.034]], fingers: 4, flen: 0.03, fr: 0.014, spread: 0.017, thumb: 0.012 },
};
function handSdf(h) {
  const parts = [ellipsoid(...h.palm)];
  const [pc, pr] = h.palm, y0 = pc[1] - pr[1] * 0.55;
  for (let i = 0; i < h.fingers; i++) {
    const t = h.fingers === 1 ? 0 : i / (h.fingers - 1) - 0.5, x = t * h.spread * (h.fingers - 1) * 0.9;
    const a = [x, y0, pc[2] + 0.004], b = [x * 1.2, y0 - h.flen, pc[2] + 0.014 - Math.abs(t) * 0.006];
    parts.push(roundCone(a, b, h.fr, h.fr * (h.pads ? 0.9 : 0.85)));
    if (h.pads) parts.push(sphere(b, h.fr * 1.35));
  }
  if (h.thumb) parts.push(roundCone([pr[0] * 0.55, pc[1] + 0.005, pc[2] + pr[2] * 0.55], [pr[0] * 0.55, pc[1] - 0.022, pc[2] + pr[2] * 0.95], h.thumb, h.thumb * 0.85));
  return (x, y, z) => { let d = parts[0](x, y, z); for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.008); return d; };
}
function handGeo(kind, side) {
  return cached(`hand:${kind}:${side}`, () => {
    if (side < 0) return mirrored(handGeo(kind, 1));
    const g = surfaceNets(handSdf(HANDS[kind]), [-0.07, -0.13, -0.06], [0.07, 0.03, 0.07], 0.0072);
    return g;
  });
}
const FEET = {
  paw: { body: [[0, 0.032, 0.035], [0.058, 0.04, 0.086]], toes: 4, toe: [0.018, 0.02, 0.022], toeZ: 0.104 },
  bear: { body: [[0, 0.036, 0.03], [0.07, 0.045, 0.095]], toes: 4, toe: [0.021, 0.022, 0.024], toeZ: 0.112, claws: true },
  long: { body: [[0, 0.03, 0.06], [0.05, 0.034, 0.13]], toes: 3, toe: [0.018, 0.018, 0.02], toeZ: 0.175 },
  web: { body: [[0, 0.02, 0.05], [0.07, 0.022, 0.08]], toes: 3, toe: [0.02, 0.016, 0.022], toeZ: 0.115, spread: 1.6 },
  shoe: { body: [[0, 0.03, 0.03], [0.05, 0.035, 0.075]], toes: 0 },
};
function footGeo(kind) {
  return cached(`foot:${kind}`, () => {
    const F = FEET[kind], parts = [ellipsoid(...F.body)];
    for (let i = 0; i < F.toes; i++) {
      const t = F.toes === 1 ? 0 : i / (F.toes - 1) - 0.5, x = t * F.toe[0] * 2.05 * (F.toes - 1) * 0.5 * (F.spread || 1) * 2 / (F.toes - 1 || 1);
      parts.push(ellipsoid([x, F.toe[1], F.toeZ - Math.abs(t) * 0.02], F.toe));
    }
    const f = (x, y, z) => { let d = parts[0](x, y, z); for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), 0.01); return Math.max(d, -y); }; // flat sole
    return surfaceNets(f, [-0.09, -0.01, -0.07], [0.09, 0.09, 0.2], 0.0088);
  });
}

// ------------------------------------------------------------------ public builders (used by charKit in Disney style)
export function headKind(spec, sp) {
  if (sp.human) return 'human';
  const s = spec.species;
  if (s === 'dog' && (spec.head === 'spaniel' || spec.earKind === 'spaniel')) return 'spaniel';
  return HEADS[s] ? s : sp.patches ? 'panda' : 'dog';
}

/**
 * Build the Disney-style head into `head` (a Group, the head bone). Returns { geos: [[parent, geometry, name]],
 * parts: {...}, top, K } — charKit adds the geometries to its rig (so they bake into the skinned mesh).
 */
export function buildDisneyHead(head, spec, sp, cols, kind) {
  const H = HEADS[kind], out = [];
  const add = (parent, g, name) => out.push([parent, g, name]);
  head.scale.setScalar(H.K * (spec.headScale || 1));
  // skull (one surface, slit along the lips) with the jaw blended in by weight
  const { g: sg, below } = slitHead(kind);
  const headG = paintHead(copy(sg), kind, 'head', spec, cols);
  let jaw = null;
  if (H.mouth) {
    const J = jawParts(H), P = headG.attributes.position, w = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i);
      // upper-lip skin that dips just under the lip curve (triangles straddling the slit) stays with the head
      const upperLip = below[i] !== 1 && Math.abs(x) < J.cx + 0.004 && J.lip(x, y) > -0.016;
      w[i] = upperLip ? 0 : jawWeight(H, x, y, P.getZ(i), below[i] === 1);
    }
    jaw = new THREE.Group(); jaw.name = 'jaw'; jaw.position.set(0, J.hy, J.hz); head.add(jaw);
    out.push([head, headG, 'headMesh', { bones: [head, jaw], w }]);
    // the mouth pocket behind the lips (upper half stays, lower half goes with the jaw) and the tongue on its floor
    const [tc, tr] = H.mouth.tongue, y0 = H.mouth.y[0];
    const pz = Math.min(tc[2], J.fz - 0.02) - 0.004;
    const pc = [0, (y0 + tc[1]) / 2, pz], pr = [Math.max(tr[0] * 1.25, J.cx * 0.85), (y0 - tc[1]) / 2 + 0.01, Math.max(tr[2], 0.018)];
    const pocket = paintFn(new THREE.SphereGeometry(1, 18, 12).scale(...pr).translate(...pc), (x, y, z, a, b, c, o) => { o.set('#5a1a24').multiplyScalar(0.7 + 0.3 * clamp01((z - pc[2]) / pr[2] + 0.5)); return 0; });
    const PP = pocket.attributes.position, pw = new Float32Array(PP.count);
    for (let i = 0; i < PP.count; i++) pw[i] = smoothstep(pc[1] + 0.004, pc[1] - 0.004, PP.getY(i)) * smoothstep(J.zBack - 0.01, J.zBack + 0.025, PP.getZ(i)); // keeps up with the lower lip
    out.push([head, pocket, 'mouth', { bones: [head, jaw], w: pw }]);
    const tongue = solid(new THREE.SphereGeometry(1, 16, 10).scale(...tr).translate(tc[0], tc[1], Math.min(tc[2], J.fz - 0.025)), '#e0707e');
    const TP = tongue.attributes.position, tw = new Float32Array(TP.count);
    for (let i = 0; i < TP.count; i++) tw[i] = smoothstep(J.zBack - 0.01, J.zBack + 0.025, TP.getZ(i));
    out.push([head, tongue, 'tongue', { bones: [head, jaw], w: tw }]);
    if (H.teeth) {
      const [c, r] = H.teeth, teeth = [];
      for (const sx of kind === 'bunny' ? [-1, 1] : [0]) teeth.push(solid(new THREE.BoxGeometry(r[0] * 2, r[1] * 2, r[2] * 2).translate(c[0] * sx, c[1], c[2]), '#fffdf6'));
      add(head, mergeIndexed(teeth), 'teeth');
    }
  } else add(head, headG, 'headMesh');
  // nose leather
  if (H.nose) add(head, solid(copy(noseGeo(kind)), spec.nose || H.nose.color), 'nose');
  // eyes + lids
  const e = H.eye, irisC = C(spec.iris || (spec.eye && spec.eye !== '#2a1a14' ? spec.eye : e.irisC)), eg = eyeGeos(e.r, e.iris, e.pupil);
  const lids = [], lidsLow = [];
  const lidC = cols.fur, rimC = C('#2a1a14');
  for (const s of [1, -1]) {
    const frame = new THREE.Group(); frame.name = 'eyeFrame';
    frame.position.set(e.c[0] * s, e.c[1], e.c[2]);
    const gaze = new THREE.Vector3(s * Math.sin(e.yaw) * Math.cos(e.pitch), Math.sin(e.pitch), Math.cos(e.yaw) * Math.cos(e.pitch));
    frame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), gaze);
    head.add(frame);
    const irisG = paintFn(eg.iris.clone(), (x, y, z, a, b, c, o) => {
      const ang = Math.acos(clamp01(z / e.r)) / e.iris;
      o.copy(irisC).multiplyScalar(1.12 - 0.5 * ang * ang); if (ang > 0.9) o.multiplyScalar(0.45);
      return 0;
    });
    const hiPos = [-s * e.r * 0.34, e.r * 0.4, e.r * 0.86], hi2Pos = [s * e.r * 0.36, -e.r * 0.36, e.r * 0.9];
    const eyeball = mergeIndexed([solid(eg.ball.clone(), H.eye.sclera || '#f4efe8'), irisG, solid(eg.pupil.clone(), '#0b0706'),
      solid(eg.hi.clone().scale(1, 1, 0.5).translate(...hiPos), '#ffffff'), solid(eg.hi2.clone().translate(...hi2Pos), '#ffffff')]);
    add(frame, eyeball, 'eyeball');
    const lu = new THREE.Group(); lu.name = s > 0 ? 'lidU_L' : 'lidU_R'; frame.add(lu); lids.push(lu);
    const ld = new THREE.Group(); ld.name = s > 0 ? 'lidD_L' : 'lidD_R'; frame.add(ld); lidsLow.push(ld);
    const rl = e.r + 0.0036;
    const lu0 = e.lidU ?? Math.min(e.iris * 0.84, 0.78); // the lid rests on the top of the iris
    const up = lidGeo(rl, Math.max(0, Math.PI / 2 - lu0 - 1.45), Math.PI / 2 - lu0, Math.PI / 2 - lu0);
    add(lu, mergeIndexed([solid(up.shell, lidC.getStyle(), sp.human ? 0 : 1), solid(up.rim, rimC.getStyle())]), 'lidU');
    const dn = lidGeo(rl - 0.0006, Math.PI / 2 - e.lidD, Math.PI * 0.97, Math.PI / 2 - e.lidD);
    add(ld, mergeIndexed([solid(dn.shell, lidC.getStyle(), sp.human ? 0 : 1), solid(dn.rim, (sp.human ? C('#c48a7a') : rimC).getStyle())]), 'lidD');
    if (sp.human || H.lashes) { // lashes: three little flicks at the outer corner of the upper lid
      const lash = [];
      for (let i = 0; i < 3; i++) {
        const ph = Math.PI / 2 + s * (0.72 + i * 0.16), th = Math.PI / 2 - lu0, rr = rl + 0.001;
        const p0 = [-rr * Math.cos(ph) * Math.sin(th), rr * Math.cos(th), rr * Math.sin(ph) * Math.sin(th)];
        lash.push(tubeGeo([p0, [p0[0] * 1.25, p0[1] + 0.008, p0[2] * 1.02]], 0.0016, 4));
      }
      add(lu, solid(mergeIndexed(lash), '#241410'), 'lashes');
    }
  }
  // ears
  const ears = {};
  const EK = { cat: 'cat', fox: 'fox', bunny: 'bunny', bear: 'round', panda: 'round', tanuki: 'tanuki', dog: 'rose', boston: 'bat', human: 'human' };
  const ek = spec.earKind || (kind === 'dog' && spec.ears ? spec.ears : EK[kind] || H.ears);
  if (ek === 'spaniel') { // pendant ears: mount (half turn) → ear bone → tip bone; one mesh blended between the two
    const S = SPANIEL;
    for (const s of [1, -1]) {
      const mount = new THREE.Group(); mount.name = s > 0 ? 'earMountL' : 'earMountR';
      mount.position.set(S.base[0] * s, S.base[1], S.base[2]); mount.rotation.y = Math.PI; head.add(mount);
      const g = new THREE.Group(); g.name = s > 0 ? 'earL' : 'earR'; mount.add(g); ears[g.name] = g;
      const c = spanielCentre(S.fold), f = [0, 1, 2].map(i => S.U[i] * S.fold + S.W[i] * c); // the fold, head-relative
      const tip = new THREE.Group(); tip.name = 'earTip'; tip.position.set(-f[0] * s, f[1], -f[2]); g.add(tip);
      g.userData.tip = tip;
      const { g: eg, w } = spanielEarGeo(s, cols);
      out.push([g, eg, 'ear', { bones: [g, tip], w }]);
    }
  } else if (ek && EARS[ek]) {
    const Ed = EARS[ek];
    for (const s of [1, -1]) {
      const g = new THREE.Group(); g.name = s > 0 ? 'earL' : 'earR';
      g.position.set(Ed.base[0] * s, Ed.base[1], Ed.base[2]); g.quaternion.copy(earFrame(Ed, s));
      head.add(g); ears[g.name] = g;
      if (Ed.soft) g.userData.soft = true;
      const eColsDark = kind === 'fox';
      add(g, paintEar(copy(earGeo(ek, 'base')), Ed, Ed.plate, sp.human ? { ...cols, ear: cols.fur } : cols, eColsDark), 'ear');
      if (Ed.flap) {
        const tip = new THREE.Group(); tip.name = 'earTip'; tip.position.set(0, Ed.plate.L, 0); tip.rotation.x = Ed.fold; g.add(tip);
        add(tip, paintEar(copy(earGeo(ek, 'flap')), Ed, Ed.flap, { ...cols, ear: cols.ear.clone().multiplyScalar(0.92) }, false), 'earTip');
        g.userData.tip = tip;
      }
    }
  }
  // cat whiskers: three fine strands from each whisker pad
  if (kind === 'cat') {
    const wk = [];
    for (const sx of [1, -1]) for (let i = 0; i < 3; i++) {
      const y0 = -0.036 - i * 0.007, a = [sx * 0.038, y0, 0.116], b = [sx * 0.125, y0 + 0.01 - i * 0.014, 0.092 - i * 0.008];
      wk.push(tubeGeo([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.004, (a[2] + b[2]) / 2], b], 0.0014, 4));
    }
    add(head, solid(mergeIndexed(wk), C(spec.fur || '#ffffff').getHSL({}).l > 0.6 ? '#6a5a58' : '#f4efe8'), 'whiskers');
  }
  // human brows (hair coloured)
  if (sp.human) {
    const hc = C(spec.hair?.color || '#5a3020'), br = [];
    for (const s of [1, -1]) br.push(tubeGeo([[s * 0.022, 0.05, 0.112], [s * 0.042, 0.058, 0.108], [s * 0.062, 0.054, 0.094]], 0.0042, 5));
    add(head, solid(mergeIndexed(br), hc.getStyle()), 'brows');
  }
  return { geos: out, parts: { jaw, lids, lidsLow, ...ears }, top: H.top, K: H.K };
}

/**
 * Moka's floppy wizard hat (the Blender Moka's hat, scaled to the kit head): a wavy drooping brim, a crown that bends
 * back into a floppy tip, a band, and a cream patch with a paw print on the front. Head space (the head bone's frame
 * before its K scale: +y up, +z forward, skull top ~0.157), tipped back and a little to her left, sitting high enough
 * that the pendant ears splay out below the brim. Add it to the head: R.add(head, kitGeo(disneyWizardHat(...)), 'hat').
 * size scales the whole hat (1 = Moka).
 */
export function disneyWizardHat({ color = '#3fb0a0', band = '#8a6ad8', patch = '#fff0d8', paw = '#7a50c8', size = 1 } = {}) {
  const felt = C(color), parts = [];
  // brim: a lathed ring with a rounded lip, drooping and waving at the rim
  const prof = [];
  for (let i = 0; i <= 8; i++) prof.push(new THREE.Vector2(0.08 + 0.066 * (i / 8), 0.0045));
  for (let i = 1; i < 8; i++) { const a = Math.PI / 2 - (i / 8) * Math.PI; prof.push(new THREE.Vector2(0.146 + 0.0045 * Math.cos(a), 0.0045 * Math.sin(a))); }
  for (let i = 8; i >= 0; i--) prof.push(new THREE.Vector2(0.08 + 0.066 * (i / 8), -0.0045));
  const brim = new THREE.LatheGeometry(prof, 40);
  const bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z);
    const out = clamp01((r - 0.085) / 0.061);
    bp.setY(i, bp.getY(i) - 0.03 * out * out + 0.008 * Math.sin(a * 3 + 0.6) * out + 0.004 * Math.sin(a * 7 + 2) * out);
  }
  brim.computeVertexNormals();
  parts.push(paintFn(brim, (x, y, z, nx, ny, nz, o) => { o.copy(felt).multiplyScalar(ny < -0.3 ? 0.8 : 1); return 0; }));
  // crown: up, then bending back and down into a floppy tip
  const P = [[0, -0.004, 0], [0, 0.045, -0.003], [0.002, 0.086, -0.01], [0.007, 0.119, -0.026], [0.015, 0.14, -0.05], [0.024, 0.139, -0.077], [0.031, 0.124, -0.095], [0.034, 0.108, -0.104]];
  const R = [0.084, 0.068, 0.05, 0.034, 0.023, 0.016, 0.011, 0.006];
  parts.push(solid(tubeGeo(P, R, 20), color));
  parts.push(solid(new THREE.SphereGeometry(0.0062, 8, 6).translate(...P[P.length - 1]), color));
  // band and the paw-print patch
  parts.push(solid(new THREE.CylinderGeometry(0.078, 0.086, 0.024, 28, 1, true).translate(0, 0.016, 0), band));
  const pc = [0, 0.058, 0.066];
  const ptc = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 18); ptc.rotateX(Math.PI / 2 - 0.26); ptc.translate(...pc);
  parts.push(solid(ptc, patch));
  const pawG = [new THREE.SphereGeometry(0.0078, 10, 6).scale(1.15, 0.9, 0.35).translate(0, -0.005, 0)];
  for (const [tx, ty] of [[-0.0105, 0.006], [-0.0038, 0.0115], [0.0038, 0.0115], [0.0105, 0.006]]) pawG.push(new THREE.SphereGeometry(0.0038, 8, 5).scale(1, 1, 0.4).translate(tx, ty, 0));
  const pawM = mergeIndexed(pawG); pawM.rotateX(-0.26); pawM.translate(pc[0], pc[1] + 0.001, pc[2] + 0.0032);
  parts.push(solid(pawM, paw));
  const g = mergeIndexed(parts);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.3, 0, -0.08)));
  g.scale(size, size, size);
  g.translate(0, 0.122, -0.022);
  return g;
}

export function disneyHand(kind, side, color, fur) { return solid(copy(handGeo(kind, side)), color, fur); }
export function disneyFoot(kind, color, fur, pads) {
  const g = copy(footGeo(kind));
  const c = C(color), pc = C(pads || '#3a2320');
  return paintFn(g, (x, y, z, nx, ny, nz, o) => { o.copy(c); if (pads && ny < -0.6) o.copy(pc); return fur; });
}
export const handKindFor = sp => (sp.human ? 'human' : sp.hand === 'bear' ? 'bear' : sp.hand === 'web' ? 'web' : sp.hand === 'fox' ? 'fox' : 'paw');
export const footKindFor = sp => (sp.human ? 'shoe' : sp.foot === 'bear' ? 'bear' : sp.foot === 'long' ? 'long' : sp.foot === 'web' ? 'web' : 'paw');
export { tag, paintFn, solid, copy, tubeGeo };

// dev: slit size per species (tools and tests)
export function debugJaw(kind) {
  const H = HEADS[kind]; if (!H.mouth) return null;
  const J = jawParts(H), { g, below } = slitHead(kind);
  let lower = 0; for (let k = 0; k < below.length; k++) if (below[k]) lower++;
  return { hinge: [+J.hy.toFixed(3), +J.hz.toFixed(3)], corner: [+J.cx.toFixed(3), +J.cz.toFixed(3)], verts: g.attributes.position.count, jawSide: lower };
}
