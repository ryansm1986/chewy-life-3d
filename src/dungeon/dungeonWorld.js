// Renders a generated burrow floor as a hand-painted diorama:
//  - one shader-painted floor plane per floor (per-biome patterns driven by an info texture: mask / room id / corridor axis / wall distance)
//  - continuous wall ribbons traced around every room outline (marching squares -> Chaikin) with a per-biome profile,
//    face shader (strata / crystal veins / planks + shoji / bricks) and near-side cutaway (camera yaw is fixed in the Burrow)
//  - per-biome wall dressing, floor clutter, light fixtures, centrepieces and boss-arena dressing
//  - all static geometry is appended into chunked typed-array batches (few draw calls, fast build); glow halos are one billboard batch
import * as THREE from 'three';
import { CELL, THEMES } from './gen.js';
import { makeToon, U } from '../gfx/materials.js';
import { tube, RoundedBox } from '../gfx/geom.js';
import { LightPool } from '../core/engine.js';
import { Collision } from '../world/collision.js';
import { Noise, mulberry32, clamp, rand, TAU } from '../core/util.js';

const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CAMX = Math.SQRT1_2, CAMZ = Math.SQRT1_2; // horizontal direction towards the (fixed-yaw) dungeon camera
const glc = h => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; }; // linear GLSL literal
const _colCache = new Map();
const col = h => { let c = _colCache.get(h); if (!c) _colCache.set(h, c = new THREE.Color(h)); return c; };

// ------------------------------------------------------------------ fast geometry batching
const _nm = new THREE.Matrix3(), _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3(), _c = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0), IDM = new THREE.Matrix4();
function tplOf(g, flat = false) {
  let ng = g.index ? g.toNonIndexed() : g;
  if (flat || !ng.attributes.normal) ng.computeVertexNormals();
  return { p: ng.attributes.position.array, n: ng.attributes.normal.array, count: ng.attributes.position.count };
}
const TPL = new Map();
const tpl = (key, make, flat) => { let t = TPL.get(key); if (!t) TPL.set(key, t = tplOf(make(), flat)); return t; };
const SH = {
  sph: () => tpl('sph', () => new THREE.SphereGeometry(1, 12, 8)),
  sphLo: () => tpl('sphLo', () => new THREE.SphereGeometry(1, 8, 6)),
  hemi: () => tpl('hemi', () => new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, Math.PI / 2)),
  cyl: () => tpl('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0)),
  cyl6: () => tpl('cyl6', () => new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0)),
  taper: () => tpl('taper', () => new THREE.CylinderGeometry(0.7, 1, 1, 10).translate(0, 0.5, 0)),
  barrel: () => tpl('barrel', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 14, 6).translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + Math.sin(y * Math.PI) * 0.14; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); return g; }),
  cone: () => tpl('cone', () => new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)),
  cone4: () => tpl('cone4', () => new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0), true),
  box: () => tpl('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  rbox: () => tpl('rbox', () => new RoundedBox(1, 1, 1, 2, 0.14).translate(0, 0.5, 0)),
  torus: () => tpl('torus', () => new THREE.TorusGeometry(1, 0.22, 6, 16).rotateX(Math.PI / 2)),
  ico: () => tpl('ico', () => new THREE.IcosahedronGeometry(1, 1)),
  rock: () => tpl('rock', () => new THREE.IcosahedronGeometry(1, 0), true),
  crys: () => tpl('crys', () => new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.05), new THREE.Vector2(0.85, 0), new THREE.Vector2(1, 0.12), new THREE.Vector2(1, 0.7), new THREE.Vector2(0.001, 1)], 6), true),
  disc: () => tpl('disc', () => new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)),
  plane: () => tpl('plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  // ---- set-dressing templates (low poly: they are scattered by the hundred)
  tuft: k => tpl('tuft' + k, () => tuftGeo(k * 7919 + 11, 11)),
  leaf: () => tpl('leaf', () => fanGeo(8, (a) => [Math.cos(a), Math.sin(a) * 0.46], 0.22)),
  star: () => tpl('star', () => fanGeo(10, (a, i) => { const r = i % 2 ? 0.42 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }, 0.12)),
  stem: () => tpl('stem', () => new THREE.CylinderGeometry(0.6, 1, 1, 3, 1, true).translate(0, 0.5, 0), true),
  hemiLo: () => tpl('hemiLo', () => new THREE.SphereGeometry(1, 8, 3, 0, TAU, 0, Math.PI / 2)),
  cylLo: () => tpl('cylLo', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0)),
};
// bent, fanned grass blades (local y 0..~1 = root..tip)
function tuftGeo(seed, n) {
  const r = mulberry32(seed), P = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(0, 1, 1, 3, 2, true).translate(0, 0.5, 0).toNonIndexed(), p = g.attributes.position;
    const a = i / n * TAU + r() * 0.7, lean = 0.2 + r() * 0.45, h = 0.5 + r() * 0.5, w = 0.08 + r() * 0.05, off = 0.02 + r() * 0.12, tw = r() * TAU;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) * w, y = p.getY(k), z = p.getZ(k) * w * 0.4;
      const cx = x * Math.cos(tw) - z * Math.sin(tw), cz = x * Math.sin(tw) + z * Math.cos(tw), bend = off + lean * y * y;
      P.push(Math.cos(a) * bend + cx, y * h, Math.sin(a) * bend + cz);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  return g;
}
// flat upward-facing fan (leaf / petal star) with a raised centre fold; outline(a, i) -> [x, z]
function fanGeo(n, outline, lift) {
  const P = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, [x0, z0] = outline(a0, i), [x1, z1] = outline(a1, i + 1);
    P.push(0, lift, 0, x1, 0, z1, x0, 0, z0); // counter-clockwise seen from above
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  return g;
}

class Batch {
  constructor() { this.n = 0; this.cap = 0; this.P = null; this.N = null; this.C = null; this.reserve(4096); }
  reserve(k) {
    if (this.n + k <= this.cap) return;
    const cap = Math.max(this.cap * 2, this.n + k, 4096);
    const P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), Cc = new Float32Array(cap * 3);
    if (this.P) { P.set(this.P.subarray(0, this.n * 3)); N.set(this.N.subarray(0, this.n * 3)); Cc.set(this.C.subarray(0, this.n * 3)); }
    this.P = P; this.N = N; this.C = Cc; this.cap = cap;
  }
  // append template t transformed by matrix m; colour = THREE.Color or painter fn(x,y,z,nx,ny,nz,out,lx,ly,lz)
  add(t, m, color, fn) {
    const cnt = t.count; this.reserve(cnt);
    const e = m.elements; _nm.getNormalMatrix(m); const q = _nm.elements;
    const P = this.P, N = this.N, Cc = this.C, tp = t.p, tn = t.n;
    let o = this.n * 3;
    for (let i = 0, j = 0; i < cnt; i++, j += 3, o += 3) {
      const x = tp[j], y = tp[j + 1], z = tp[j + 2];
      const px = e[0] * x + e[4] * y + e[8] * z + e[12], py = e[1] * x + e[5] * y + e[9] * z + e[13], pz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = tn[j], b = tn[j + 1], c = tn[j + 2];
      let nx = q[0] * a + q[3] * b + q[6] * c, ny = q[1] * a + q[4] * b + q[7] * c, nz = q[2] * a + q[5] * b + q[8] * c;
      const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= l; ny *= l; nz *= l;
      P[o] = px; P[o + 1] = py; P[o + 2] = pz; N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
      if (fn) { fn(px, py, pz, nx, ny, nz, _c, x, y, z); Cc[o] = _c.r; Cc[o + 1] = _c.g; Cc[o + 2] = _c.b; }
      else { Cc[o] = color.r; Cc[o + 1] = color.g; Cc[o + 2] = color.b; }
    }
    this.n += cnt;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, this.n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, this.n * 3), 3));
    g.computeBoundingSphere();
    return g;
  }
}
// spatially chunked batches -> per-chunk meshes (frustum culling keeps draw work proportional to what is on screen)
class Chunks {
  constructor(size = 28) { this.size = size; this.map = new Map(); }
  at(x, z) { const k = Math.floor(x / this.size) * 4096 + Math.floor(z / this.size); let b = this.map.get(k); if (!b) this.map.set(k, b = new Batch()); return b; }
  add(t, m, color, fn) { this.at(m.elements[12], m.elements[14]).add(t, m, color, fn); }
  addGeo(g, x, z, color, fn) { this.at(x, z).add(tplOf(g), IDM, color, fn); }
  build(scene, mat, cast = true, receive = true) {
    const out = [];
    for (const b of this.map.values()) { if (!b.n) continue; const m = new THREE.Mesh(b.geometry(), mat); m.castShadow = cast; m.receiveShadow = receive; scene.add(m); out.push(m); }
    return out;
  }
}
const M = (x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => { _E.set(rx, ry, rz, 'YXZ'); _Q.setFromEuler(_E); return _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz)); };
// local +Y along unit direction d (spin around it first)
const MD = (x, y, z, d, sx, sy, sz, spin = 0) => { _Q.setFromUnitVectors(UPV, d); if (spin) { _Q2.setFromAxisAngle(UPV, spin); _Q.multiply(_Q2); } return _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz)); };

// Additive glow that leaves the destination ALPHA untouched. The post chain blends every effect with
// mix(dst, src, src.a): any quad that bumps the scene buffer's alpha above 1 gets its whole footprint
// re-graded (that was the rectangular "box" around every halo, which wrote alpha = 1 over its full quad).
export function keepAlphaAdd(m) {
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true; m.depthWrite = false; m.toneMapped = false;
  return m;
}
// analytic soft falloff (no texture -> no mip bleed to the quad edge); r = 0 centre .. 1 rim, exactly 0 at and beyond the rim
const FALLOFF_GLSL = /* glsl */`float glowFall(float r) { float k = clamp(1.0 - r, 0.0, 1.0); return k * k * (0.55 + 0.45 * k) + 0.35 * exp(-r * r * 30.0) * k; }`;

// camera-facing glow halos / flames in one draw call (billboarded in view space, per-quad flicker)
class Halos {
  constructor() { this.list = []; }
  add(x, y, z, size, color, alpha = 0.55, flicker = 0) { this.list.push([x, y, z, size, col(color), alpha, flicker]); }
  build(scene) {
    const n = this.list.length; if (!n) return null;
    const pos = new Float32Array(n * 12), info = new Float32Array(n * 16), cl = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    const cr = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    this.list.forEach(([x, y, z, s, c, a, f], i) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k; pos.set([x, y, z], v * 3); info.set([cr[k][0], cr[k][1], s * 0.5, f], v * 4); cl.set([c.r * a, c.g * a, c.b * a], v * 3);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = keepAlphaAdd(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: /* glsl */`
        attribute vec4 aInfo; attribute vec3 color; uniform float uTime; varying vec2 vQ; varying vec3 vCol;
        void main() {
          vQ = aInfo.xy; vCol = color;
          float fl = 1.0 + aInfo.w * (sin(uTime * 11.0 + position.x * 3.1) * 0.08 + sin(uTime * 23.0 + position.z * 1.7) * 0.05);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xy += aInfo.xy * aInfo.z * fl;
          mv.z += aInfo.z * 0.85; // pull the card toward the camera so it floats in front of the wall/prop it lights instead of slicing through it
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying vec3 vCol; ${FALLOFF_GLSL}
        void main() { gl_FragColor = vec4(vCol * glowFall(length(vQ)), 0.0); }`,
    }));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 8; scene.add(m);
    return m;
  }
}
// flat glow pools on the floor (shaft spots, spring ponds) in one draw call; pulse = slow breathing
class FloorGlows {
  constructor() { this.list = []; }
  add(x, y, z, r, color, alpha = 0.35, pulse = 0) { this.list.push([x, y, z, r, col(color), alpha, pulse]); }
  build(scene) {
    const n = this.list.length; if (!n) return null;
    const pos = new Float32Array(n * 12), info = new Float32Array(n * 12), cl = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    const cr = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    this.list.forEach(([x, y, z, r, c, a, p], i) => {
      for (let k = 0; k < 4; k++) { const v = i * 4 + k; pos.set([x + cr[k][0] * r, y, z + cr[k][1] * r], v * 3); info.set([cr[k][0], cr[k][1], p], v * 3); cl.set([c.r * a, c.g * a, c.b * a], v * 3); }
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = keepAlphaAdd(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime },
      vertexShader: /* glsl */`
        attribute vec3 aInfo; attribute vec3 color; uniform float uTime; varying vec2 vQ; varying vec3 vCol;
        void main() { vQ = aInfo.xy; vCol = color * (1.0 - aInfo.z * (0.25 - 0.25 * sin(uTime * 1.6 + position.x))); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`varying vec2 vQ; varying vec3 vCol; ${FALLOFF_GLSL}
        void main() { gl_FragColor = vec4(vCol * glowFall(length(vQ)), 0.0); }`,
      side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
    return m;
  }
}
// god-ray planes (slanted, double sided) in one draw call; analytic side/top falloff, per-plane shimmer phase
class Shafts {
  constructor() { this.list = []; }
  add(x, z, w, h, rx, ry, rz, base, ph) { this.list.push([x, z, w, h, rx, ry, rz, base, ph]); }
  build(scene, color) {
    const n = this.list.length; if (!n) return null;
    const pos = new Float32Array(n * 12), info = new Float32Array(n * 16), idx = new Uint32Array(n * 6);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
    this.list.forEach(([x, z, w, h, rx, ry, rz, base, ph], i) => {
      m4.compose(v.set(x, 0, z), q.setFromEuler(e.set(rx, ry, rz)), _S.set(1, 1, 1));
      [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]].forEach(([cx, cy, u, t], k) => {
        v.set(cx * w, cy * h, 0).applyMatrix4(m4); pos.set([v.x, v.y, v.z], (i * 4 + k) * 3); info.set([u, t, base, ph], (i * 4 + k) * 4);
      });
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = keepAlphaAdd(new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCol: { value: color } },
      vertexShader: /* glsl */`
        attribute vec4 aInfo; uniform float uTime; varying vec2 vUv; varying float vA;
        void main() { vUv = aInfo.xy; vA = aInfo.z * (0.75 + 0.25 * sin(uTime * 0.7 + aInfo.w)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uCol; varying vec2 vUv; varying float vA;
        void main() {
          float side = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159), 2.2);
          float fade = pow(1.0 - vUv.y, 1.3) * smoothstep(0.0, 0.16, vUv.y);
          gl_FragColor = vec4(uCol * side * fade * vA, 0.0);
        }`,
      side: THREE.DoubleSide,
    }));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 11; scene.add(m);
    return m;
  }
}

// ------------------------------------------------------------------ shared GLSL helpers
const NOISE_GLSL = /* glsl */`
float h1(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { return vn(p) * 0.5 + vn(p * 2.07 + 13.1) * 0.3 + vn(p * 4.31 + 7.7) * 0.2; }
float twinkle(vec2 p, float sc, float thr) {
  vec2 cc = floor(p * sc); vec2 o = fract(p * sc) - 0.5 - (h2(cc) - 0.5) * 0.6; float hh = h1(cc + 5.3);
  float tw = pow(max(0.0, sin(uTime * 2.2 + hh * 50.0)), 10.0);
  return step(thr, hh) * smoothstep(0.1, 0.0, length(o)) * tw;
}
`;
const FLOOR_PARS = /* glsl */`
uniform sampler2D uInfo, uDeco; uniform float uSize, uSigDim; uniform vec3 uF0, uF1, uF2, uVoid, uSig;
uniform vec4 uRoom[16]; uniform vec4 uRoomK[16]; uniform vec4 uBoss;
vec3 fG;
${NOISE_GLSL}
vec3 vor(vec2 x, out vec2 toC) {
  vec2 n = floor(x), f = fract(x); float m1 = 8.0, m2 = 8.0; vec2 mr = vec2(0.0), mc = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)); vec2 r = g + h2(n + g) * 0.8 + 0.1 - f; float d = dot(r, r);
    if (d < m1) { m2 = m1; m1 = d; mr = r; mc = n + g; } else if (d < m2) m2 = d;
  }
  toC = mr; return vec3(sqrt(m1), sqrt(m2) - sqrt(m1), h1(mc));
}
float sdRBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// wooden boards: a.x runs along the board, a.y across
vec3 planks(vec2 a, vec3 base) {
  float w = 0.36; float row = floor(a.y / w); float fy = fract(a.y / w);
  float len = 2.4 + h1(vec2(row, 3.0)) * 1.8; float s = (a.x + h1(vec2(row, 9.0)) * len) / len;
  float cl = floor(s); float fx = fract(s); float bh = h1(vec2(row, cl));
  vec3 c = base * (0.84 + bh * 0.26);
  c *= 0.95 + 0.05 * sin(a.y * 55.0 + vn(vec2(a.x * 1.2, row * 3.1)) * 9.0);
  c *= mix(0.62, 1.0, smoothstep(0.0, 0.07, min(fy, 1.0 - fy)));
  c *= mix(0.7, 1.0, smoothstep(0.0, 0.025, min(fx, 1.0 - fx) * len));
  return c;
}
`;
const FLOOR_THEME = {
  burrow: /* glsl */`
    // broad painted soil variation: warm clay swirls and cool dark loam, so big rooms never read as one flat tan
    float bigS = fbm(p * 0.05 + 11.0), bigT = vn(p * 0.021 + 3.0);
    c = mix(c, c * vec3(1.12, 0.94, 0.8), smoothstep(0.56, 0.76, bigS) * 0.6);
    c = mix(c, c * vec3(0.8, 0.8, 0.8), smoothstep(0.44, 0.22, bigS) * 0.5);
    c = mix(c, c * vec3(0.95, 1.02, 0.93), smoothstep(0.55, 0.8, bigT) * 0.45);
    float trail = smoothstep(1.2, 2.4, wd) * (rid == 0 ? 0.9 : 0.35);
    c = mix(c, c * vec3(1.14, 1.08, 1.0), trail * smoothstep(0.35, 0.65, vn(p * 0.35)));
    // worn trails (decor g): compacted pale soil, a trodden darker margin and scattered grit
    float tr = smoothstep(0.24, 0.66, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    c = mix(c, c * vec3(1.14, 1.08, 0.98), tr * 0.75);
    c *= 1.0 - smoothstep(0.08, 0.3, dc.g) * (1.0 - smoothstep(0.3, 0.55, dc.g)) * 0.16;
    // dry cracked earth (decor b): raised plates split by dark crazing
    if (dc.b > 0.02) {
      float ck = smoothstep(0.1, 0.55, dc.b + (vn(p * 1.7) - 0.5) * 0.35);
      vec2 wq = p + vec2(vn(p * 0.9), vn(p * 0.9 + 5.0)) * 0.8;
      float l1 = abs(vn(wq * 1.1 + 3.0) - 0.5), l2 = abs(vn(wq * 2.4 + 11.0) - 0.5);
      float crk = max(smoothstep(0.022, 0.004, l1), smoothstep(0.016, 0.003, l2) * step(0.45, vn(wq * 0.8 + 2.0)));
      c = mix(c, c * vec3(1.07, 1.03, 0.96), smoothstep(0.02, 0.12, min(l1, l2 + 0.04)) * ck * 0.5);
      c = mix(c, c * 0.55, crk * ck);
    }
    // moss patches (thicker towards walls) with tiny clover flowers
    float mn = fbm(p * 0.13 + 3.0) + smoothstep(1.7, 0.6, wd) * 0.2 + (nB - 0.5) * 0.12;
    float moss = smoothstep(0.615, 0.64, mn), mossHi = smoothstep(0.67, 0.76, mn);
    vec3 mcol = mix(${glc('#7e9a5e')}, ${glc('#98b070')}, smoothstep(0.3, 0.75, vn(p * 1.1)));
    mcol = mix(mcol, ${glc('#b4c88c')}, mossHi * 0.45);
    c = mix(c, c * 0.84, smoothstep(0.57, 0.615, mn) * (1.0 - moss) * 0.7);
    c = mix(c, mcol, moss);
    vec2 fcc = floor(p * 2.6); vec2 fo = fract(p * 2.6) - 0.5 - (h2(fcc) - 0.5) * 0.5; float fh = h1(fcc + 7.0);
    float flw = step(0.88, fh) * smoothstep(0.13, 0.07, length(fo)) * mossHi;
    c = mix(c, c * 0.72, step(0.88, fh) * smoothstep(0.19, 0.12, length(fo - vec2(0.03))) * mossHi * 0.6);
    c = mix(c, fh > 0.95 ? ${glc('#ffc2d8')} : ${glc('#fff2a0')}, flw);
    // roots creeping out from the walls
    vec2 rw = p * 0.3 + vec2(vn(p * 0.13), vn(p * 0.13 + 9.0)) * 2.4;
    float rn = abs(vn(rw) - 0.5), nearW = smoothstep(2.2, 0.6, wd), rwid = 0.006 + 0.016 * nearW;
    float root = smoothstep(rwid, rwid * 0.45, rn) * nearW * (1.0 - moss * 0.7);
    c = mix(c, ${glc('#6a4a32')}, root * 0.6);
    c = mix(c, ${glc('#8a6444')}, smoothstep(rwid * 0.45, 0.0, rn) * root * 0.6);
    // pebble clusters
    float pc = smoothstep(0.68, 0.8, vn(p * 0.21 + 17.0)) + nearW * 0.12;
    if (pc > 0.02) {
      vec2 tc; vec3 v = vor(p * 2.4, tc);
      float has = step(0.7, v.z) * clamp(pc, 0.0, 1.0) * (1.0 - moss * 0.8), rr = 0.12 + v.z * 0.1;
      // small, soft contact shadow offset away from the light, then a clearly lighter stone with a lit crown
      c *= 1.0 - smoothstep(rr + 0.05, rr - 0.02, length(tc - vec2(0.05, 0.07))) * 0.28 * has;
      float peb = smoothstep(rr, rr - 0.04, v.x) * has;
      float lit = clamp(dot(normalize(-tc + 1e-4), vec2(0.54, 0.84)) * 0.5 + 0.5, 0.0, 1.0);
      vec3 pcol = mix(${glc('#c4b4a2')}, ${glc('#9c8c80')}, h1(vec2(v.z * 91.0, 2.0)) * 0.6) * (0.86 + 0.34 * lit * smoothstep(0.0, rr, v.x));
      c = mix(c, pcol, peb);
    }
    // little puddles with sparkles
    float pn = vn(p * 0.11 + 41.0) + (vn(p * 0.8 + 3.0) - 0.5) * 0.035, away = smoothstep(1.6, 2.6, wd) * (1.0 - smoothstep(0.15, 0.45, dc.r)) * (1.0 - tr * 0.7);
    float wet = smoothstep(0.7, 0.765, pn) * away, pud = smoothstep(0.765, 0.78, pn) * away;
    c = mix(c, c * 0.68, wet * 0.7);
    vec3 wat = mix(${glc('#4a78a0')}, ${glc('#a8d8f0')}, smoothstep(0.78, 0.9, pn) * 0.5 + vn(p * 0.8 + uTime * 0.05) * 0.35);
    c = mix(c, wat, pud);
    float pfw = fwidth(pn) * 1.5;
    c = mix(c, ${glc('#e8f8ff')}, smoothstep(0.765 - pfw, 0.765, pn) * (1.0 - smoothstep(0.765 + pfw, 0.765 + pfw * 2.5, pn)) * away * 0.7);
    fG += ${glc('#c8f0ff')} * (twinkle(p, 3.2, 0.7) * pud * 2.2 + pud * 0.06);
    // leaf litter & fallen petals drifting toward the walls (small painted leaves with a soft drop shadow and a vein)
    {
      vec2 lc; vec3 lv = vor(p * 1.6 + 31.0, lc);
      float lp = step(0.9 - smoothstep(2.6, 0.9, wd) * 0.1, lv.z) * (1.0 - pud) * step(0.9, wd);
      if (lp > 0.0) {
        float la = lv.z * 71.0, cs = cos(la), sn = sin(la); vec2 q = vec2(cs * lc.x - sn * lc.y, sn * lc.x + cs * lc.y);
        float hh = h1(vec2(lv.z * 37.0, 5.0));
        vec3 lcol = hh < 0.4 ? ${glc('#c8a458')} : hh < 0.68 ? ${glc('#9cb06a')} : hh < 0.88 ? ${glc('#d68e5c')} : ${glc('#ffc4d8')};
        c = mix(c, c * 0.8, smoothstep(1.25, 0.85, length((q - vec2(0.025, -0.03)) / vec2(0.19, 0.085))) * lp * 0.45);
        float leaf = smoothstep(1.0, 0.8, length(q / vec2(0.17, 0.075)));
        c = mix(c, lcol * (0.88 + 0.22 * smoothstep(-0.12, 0.12, q.x)), leaf * lp);
        c = mix(c, lcol * 0.72, leaf * lp * smoothstep(0.01, 0.0, abs(q.y)) * 0.55);
      }
    }
    // lush meadows (decor r): a painted shade ring, then dappled clumps of grass-moss; flower sprinkles where accent (a)
    float lu = smoothstep(0.28, 0.62, dc.r + (fbm(p * 0.7 + 4.0) - 0.5) * 0.5);
    if (lu > 0.001) {
      // painterly grass-moss: smooth two-tone base, then soft rotated brush dabs (no cell edges) and a fine grain
      float g1 = fbm(p * 0.9 + 9.0);
      vec3 gcol = mix(${glc('#557e3e')}, ${glc('#80aa58')}, smoothstep(0.25, 0.75, g1));
      vec2 gc; vec3 gv = vor(p * 4.2 + 9.0, gc);
      float ga = gv.z * 31.0, gcs = cos(ga), gsn = sin(ga); vec2 gq = vec2(gcs * gc.x - gsn * gc.y, gsn * gc.x + gcs * gc.y);
      float dab = smoothstep(1.0, 0.25, length(gq / vec2(0.38, 0.15)));
      gcol = mix(gcol, gv.z > 0.55 ? ${glc('#a4c878')} : ${glc('#4a7236')}, dab * 0.4);
      gcol = mix(gcol, ${glc('#b4cc84')}, smoothstep(0.55, 0.85, vn(p * 0.8 + 2.0)) * 0.3);
      gcol *= 0.92 + 0.14 * vn(p * 13.0);
      c = mix(c, c * 0.7, smoothstep(0.0, 0.2, lu) * (1.0 - smoothstep(0.2, 0.45, lu)) * 0.7);
      c = mix(c, gcol, smoothstep(0.18, 0.5, lu));
      float fa = smoothstep(0.2, 0.6, dc.a) * smoothstep(0.35, 0.7, lu);
      if (fa > 0.01) {
        vec2 fc = floor(p * 3.4); vec2 fo2 = fract(p * 3.4) - 0.5 - (h2(fc + 3.0) - 0.5) * 0.55; float fh2 = h1(fc + 17.0);
        float has = step(0.5, fh2) * fa;
        vec3 fcol = fh2 > 0.9 ? ${glc('#fff6f0')} : fh2 > 0.78 ? ${glc('#ffb8d4')} : fh2 > 0.64 ? ${glc('#ffe27a')} : ${glc('#c8b4ff')};
        float fr = length(fo2), pet = smoothstep(0.13, 0.09, fr * (1.0 + 0.35 * cos(atan(fo2.y, fo2.x) * 5.0)));
        c = mix(c, c * 0.7, smoothstep(0.17, 0.1, length(fo2 - vec2(0.03, -0.03))) * has * 0.6);
        c = mix(c, fcol, pet * has);
        c = mix(c, ${glc('#ffc83a')}, smoothstep(0.04, 0.02, fr) * has);
      }
    }
  `,
  crystal: /* glsl */`
    // broad mineral colour drift: amethyst-stained and cold slate regions
    float bigS = fbm(p * 0.05 + 11.0);
    c = mix(c, c * vec3(1.06, 0.9, 1.14), smoothstep(0.55, 0.75, bigS) * 0.6);
    c = mix(c, c * vec3(0.84, 0.92, 0.98), smoothstep(0.45, 0.25, bigS) * 0.5);
    vec2 tc; vec3 v = vor(p * 0.6, tc);
    float tr = smoothstep(0.24, 0.66, dc.g + (vn(p * 1.1) - 0.5) * 0.3); // worn, polished run
    float gap = mix(smoothstep(0.015, 0.06, v.y), 1.0, tr * 0.55);
    c *= 0.86 + v.z * 0.22;
    c *= 1.0 + smoothstep(0.16, 0.04, v.y) * gap * 0.12 * clamp(dot(normalize(-tc + 1e-4), vec2(0.54, 0.84)), -1.0, 1.0);
    c = mix(c * 0.55, c, gap);
    c = mix(c, c * vec3(1.1, 1.1, 1.14), tr * 0.5);
    float cr = abs(vn(p * 1.4 + v.z * 13.0) - 0.5);
    c = mix(c, c * 0.7, smoothstep(0.018, 0.0, cr) * step(0.6, v.z) * 0.8);
    // rime: crisp crystalline frost in drifts along the walls and on the accent patches (was a soft white cloud that
    // read as fog lying on the floor): hard edge, low cover, faceted sparkle
    float fn = fbm(p * 0.12 + 5.0) * 0.85 + dc.a * 0.4 + smoothstep(1.4, 0.6, wd) * 0.14 + (nB - 0.5) * 0.08;
    float fr = smoothstep(0.64, 0.665, fn);
    if (fr > 0.001) {
      vec2 rc; vec3 rv = vor(p * 3.1 + 2.0, rc);
      vec3 frost = mix(${glc('#b8c4f4')}, ${glc('#e8eeff')}, smoothstep(0.2, 0.9, rv.z)) * (0.9 + 0.12 * vn(p * 2.5));
      c = mix(c, mix(c * 1.18, frost, 0.55), fr * 0.7);
      c = mix(c, ${glc('#f4f8ff')}, fr * smoothstep(0.035, 0.0, rv.y) * 0.45);
      fG += ${glc('#dff4ff')} * twinkle(p, 4.0, 0.8) * fr * 1.4;
    }
    // glowing lichen (decor r): teal speckle mats
    float lu = smoothstep(0.3, 0.62, dc.r + (fbm(p * 0.8 + 4.0) - 0.5) * 0.45);
    if (lu > 0.001) {
      float mt = smoothstep(0.42, 0.6, fbm(p * 1.9 + 3.0) + lu * 0.25) * lu; // clumpy mats, not an even coat
      c = mix(c, c * vec3(0.6, 0.84, 0.88), mt * 0.6);
      c = mix(c, c * vec3(0.8, 1.05, 1.02), mt * smoothstep(0.55, 0.8, vn(p * 6.0)) * 0.5);
      vec2 lc2; vec3 lv = vor(p * 5.0 + 1.0, lc2);
      float sp = smoothstep(0.11, 0.04, lv.x * (0.8 + 0.5 * h1(vec2(lv.z * 31.0, 1.0)))) * step(0.7, lv.z) * mt;
      vec3 lcol = lv.z > 0.94 ? ${glc('#ff9ae8')} : ${glc('#6af0e0')};
      c = mix(c, lcol, sp * 0.8);
      fG += lcol * sp * (0.45 + 0.25 * sin(uTime * 2.0 + lv.z * 40.0));
    }
    // glowing fissures (decor b)
    if (dc.b > 0.02) {
      float ck = smoothstep(0.1, 0.55, dc.b + (vn(p * 1.7) - 0.5) * 0.35);
      vec2 wq = p + vec2(vn(p * 0.7), vn(p * 0.7 + 5.0)) * 1.2;
      float l1 = abs(vn(wq * 0.8 + 3.0) - 0.5), l2 = abs(vn(wq * 1.9 + 11.0) - 0.5) + 0.004;
      float e = max(smoothstep(0.02, 0.004, l1), smoothstep(0.012, 0.003, l2) * step(0.5, vn(wq * 0.6))) * ck;
      vec3 ec = mix(${glc('#8af4ff')}, ${glc('#ff8ae0')}, step(0.55, vn(p * 0.2 + 7.0)));
      c = mix(c, c * 0.6, smoothstep(0.07, 0.0, min(l1, l2)) * ck * 0.6);
      c = mix(c, ec, e * 0.85);
      fG += ec * e * (0.9 + 0.3 * sin(uTime * 1.5 + p.x * 0.7));
    }
    // glowing cracks around embedded crystal shards
    vec2 gp = p * 0.5; vec2 gi = floor(gp); float gh = h1(gi + 11.0);
    if (gh > 0.83 && wd > 0.9) {
      vec2 gf = fract(gp) - 0.5 - (h2(gi + 3.0) - 0.5) * 0.4;
      float ang = gh * 40.0, cs = cos(ang), sn = sin(ang);
      vec2 d = vec2(cs * gf.x - sn * gf.y, sn * gf.x + cs * gf.y);
      float s1 = abs(d.x) / 0.055 + abs(d.y) / 0.22, s2 = abs(d.x - 0.1) / 0.04 + abs(d.y + 0.06) / 0.13, s3 = abs(d.x + 0.08) / 0.03 + abs(d.y - 0.07) / 0.1;
      float sm = min(s1, min(s2, s3)), s = smoothstep(1.0, 0.82, sm);
      vec3 cc = gh > 0.925 ? ${glc('#ff8ae0')} : ${glc('#7af0ff')};
      float halo = smoothstep(0.5, 0.0, length(d * vec2(1.2, 0.8)));
      c = mix(c, mix(c, cc, 0.35), halo * 0.7);
      c = mix(c, mix(cc, vec3(1.0), smoothstep(0.7, 0.0, sm) * 0.6), s);
      fG += cc * (s * 1.3 + halo * halo * 0.4);
    }
  `,
  shrine: /* glsl */`
    vec3 plankBase = mix(${glc('#a8704a')}, ${glc('#c48a58')}, nA);
    if (rid > 0) {
      vec4 R = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      vec2 lo = R.xy + 1.3, hi = R.zw - 1.3, ctr = (R.xy + R.zw) * 0.5;
      if (p.x > lo.x && p.x < hi.x && p.y > lo.y && p.y < hi.y) { // tatami mats in alternating 2-mat blocks
        vec2 area = hi - lo; vec2 nb = max(vec2(1.0), floor(area / 1.8 + 0.5)); vec2 bs = area / nb;
        vec2 t = (p - lo) / bs; vec2 bi = floor(t), bf = fract(t);
        bool hor = mod(bi.x + bi.y, 2.0) < 0.5;
        float along = hor ? bf.x : bf.y, across = hor ? bf.y : bf.x, span = hor ? bs.y : bs.x;
        float hlf = step(0.5, across), af = fract(across * 2.0);
        float mh = h1(bi * 2.0 + hlf + K.y * 7.0);
        vec3 tcol = mix(${glc('#c2c07a')}, ${glc('#d9c98a')}, mh);
        tcol *= 0.965 + 0.035 * sin(af * span * 0.5 * 150.0);
        tcol *= 0.92 + 0.08 * sin(af * 3.14159);
        float ew = 0.075 / (span * 0.5);
        float heri = 1.0 - smoothstep(ew, ew + 0.03, min(af, 1.0 - af));
        tcol = mix(tcol, ${glc('#2f3d34')}, heri);
        tcol = mix(tcol, ${glc('#c8a860')}, heri * smoothstep(0.35, 0.0, abs(min(af, 1.0 - af) / ew - 0.5)) * 0.35);
        tcol *= mix(0.72, 1.0, smoothstep(0.0, 0.025, min(along, 1.0 - along)));
        c = tcol;
      } else {
        vec2 dE = min(p - R.xy, R.zw - p);
        c = dE.y < dE.x ? planks(p, plankBase) : planks(p.yx, plankBase);
      }
      // carpet runner along the room's long axis
      if (K.x < 4.5) {
        bool ax = (R.z - R.x) >= (R.w - R.y);
        float dc = ax ? abs(p.y - ctr.y) : abs(p.x - ctr.x), lc = ax ? p.x : p.y;
        float l0 = (ax ? lo.x : lo.y) - 0.4, l1 = (ax ? hi.x : hi.y) + 0.4;
        float inR = smoothstep(0.86, 0.82, dc) * step(l0, lc) * step(lc, l1);
        #ifdef MOON
        vec3 rc = K.x > 3.5 ? ${glc('#c8a040')} : ${glc('#2e3470')};
        #else
        vec3 rc = K.x > 3.5 ? ${glc('#e0a832')} : ${glc('#c42e34')};
        #endif
        float trim = smoothstep(0.6, 0.63, dc) * smoothstep(0.74, 0.71, dc);
        vec2 mm = vec2(fract(lc * 0.7) - 0.5, dc);
        float dia = smoothstep(0.02, 0.0, abs(mm.x) * 0.8 + mm.y * 0.9 - 0.28) * (1.0 - smoothstep(0.02, 0.0, abs(mm.x) * 0.8 + mm.y * 0.9 - 0.2));
        #ifdef MOON
        rc = mix(rc, ${glc('#d8e4ff')}, clamp(trim + dia, 0.0, 1.0));
        #else
        rc = mix(rc, ${glc('#ffd36a')}, clamp(trim + dia, 0.0, 1.0));
        #endif
        rc *= 0.95 + 0.05 * vn(p * 7.0);
        float fringe = step(abs(lc - clamp(lc, l0, l1)), 0.16) * (1.0 - step(l0, lc) * step(lc, l1)) * smoothstep(0.8, 0.76, dc) * step(0.5, fract(dc * 9.0));
        c = mix(c, c * 0.7, smoothstep(0.98, 0.86, dc) * step(l0 - 0.08, lc) * step(lc, l1 + 0.08) * (1.0 - inR) * 0.6);
        c = mix(c, rc, inR);
        c = mix(c, ${glc('#ffe8b0')}, fringe);
      }
    } else {
      c = ori > 120.0 ? planks(p.yx, plankBase) : planks(p, plankBase);
    }
    // wear: trodden runs go a little dull and grassy-grey, big soft sun-bleach / age patches
    float tr = smoothstep(0.24, 0.66, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    c = mix(c, c * vec3(0.9, 0.92, 0.86), tr * 0.45);
    float bigS = fbm(p * 0.05 + 11.0);
    c = mix(c, c * vec3(1.06, 1.02, 0.94), smoothstep(0.58, 0.78, bigS) * 0.5);
    c = mix(c, c * vec3(0.88, 0.86, 0.86), smoothstep(0.42, 0.22, bigS) * 0.4);
    // drifts of fallen sakura petals (decor a) with soft contact shade
    float pa = smoothstep(0.15, 0.55, dc.a + (vn(p * 1.4) - 0.5) * 0.3);
    if (pa > 0.01) {
      vec2 pc2; vec3 pv = vor(p * 2.3 + 13.0, pc2);
      float ang = pv.z * 40.0, cs2 = cos(ang), sn2 = sin(ang); vec2 q = vec2(cs2 * pc2.x - sn2 * pc2.y, sn2 * pc2.x + cs2 * pc2.y);
      float has = step(1.0 - pa * 0.8, pv.z);
      float pet = smoothstep(1.0, 0.75, length(q / vec2(0.24, 0.14)) + 0.35 * smoothstep(0.0, -0.18, q.x) * (1.0 - smoothstep(0.03, 0.0, abs(q.y))));
      c = mix(c, c * 0.8, smoothstep(1.2, 0.8, length((q + vec2(0.03, 0.05)) / vec2(0.26, 0.16))) * has * 0.5);
      c = mix(c, mix(${glc('#ffc4da')}, ${glc('#fff0f4')}, h1(vec2(pv.z * 17.0, 3.0))), pet * has);
    }
    #ifdef MOON
    c = mix(c, c * vec3(0.8, 0.9, 1.16), 0.55); // moon-washed timber & tatami
    #endif
  `,
  kitchen: /* glsl */`
    if (rid > 0) {
      vec4 R = uRoom[rid - 1]; vec4 K = uRoomK[rid - 1];
      vec2 t = p - R.xy; vec2 ti = floor(t), tf = fract(t);
      float chk = mod(ti.x + ti.y, 2.0), th = h1(ti + K.y * 3.0);
      vec3 tile = chk < 0.5 ? mix(${glc('#c46a46')}, ${glc('#d88458')}, th) : mix(${glc('#f0e2c6')}, ${glc('#e2d0ae')}, th);
      tile *= 0.92 + 0.08 * smoothstep(0.55, 0.0, length(tf - 0.32));
      float gr = smoothstep(0.0, 0.04, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
      c = mix(${glc('#806052')}, tile, gr);
      c = mix(c, c * 0.8, step(0.93, th) * smoothstep(0.02, 0.0, abs(vn(t * 3.0 + th * 9.0) - 0.5)));  // the odd cracked tile
      vec2 ctr = (R.xy + R.zw) * 0.5, hs = clamp((R.zw - R.xy) * 0.5 - 2.4, vec2(1.2), vec2(4.2));
      if (K.x != 3.0) { // woven rug (not in the boss arena)
        vec2 q = p - ctr; float rd = sdRBox(q, hs, 0.35);
        if (rd < 0.3) {
          vec3 field = K.z < 0.5 ? ${glc('#a8363c')} : ${glc('#34568a')}, cream = ${glc('#f4e4c2')};
          float inside = smoothstep(0.02, -0.02, rd);
          float band = smoothstep(-0.44, -0.4, rd) * smoothstep(-0.14, -0.18, rd);
          float line = smoothstep(0.03, 0.0, abs(rd + 0.62) - 0.03);
          float med = smoothstep(0.04, 0.0, abs(length(q / hs) - 0.42) - 0.035) + smoothstep(0.22, 0.18, length(q / hs));
          float bd = abs(fract((q.x + q.y) * 1.6) - 0.5) + abs(fract((q.x - q.y) * 1.6) - 0.5);
          vec3 rug = field * (0.9 + 0.1 * sin((q.x + q.y) * 11.0));
          rug = mix(rug, cream, clamp(line + med * 0.9, 0.0, 1.0));
          rug = mix(rug, mix(cream, field, step(0.55, bd)), band);
          bool lx = hs.x >= hs.y; float fc = lx ? q.x : q.y, fo2 = lx ? q.y : q.x, hl = lx ? hs.x : hs.y, hw = lx ? hs.y : hs.x;
          float fringe = step(hl - 0.02, abs(fc)) * step(abs(fc), hl + 0.24) * step(abs(fo2), hw - 0.3) * step(0.45, fract(fo2 * 7.0));
          c = mix(c, c * 0.72, smoothstep(0.3, 0.0, rd) * (1.0 - inside) * 0.6);
          c = mix(c, rug, inside);
          c = mix(c, cream, fringe);
        }
      }
    } else { // corridors: warm stone flags with the odd ember crack
      vec2 tc; vec3 v = vor(p * 0.75, tc);
      c *= 0.84 + v.z * 0.24;
      c = mix(c * 0.55, c, smoothstep(0.02, 0.07, v.y));
      float em = smoothstep(0.03, 0.0, v.y) * smoothstep(0.64, 0.76, vn(p * 0.2 + 3.0));
      fG += ${glc('#ff7a2a')} * em * 1.5;
    }
    // spilled flour and sauce splats
    float fl = smoothstep(0.66, 0.69, fbm(p * 0.35 + 21.0) + (vn(p * 3.0) - 0.5) * 0.04) * smoothstep(0.64, 0.72, vn(p * 0.07 + 5.0));
    c = mix(c, ${glc('#fbf6ee')}, fl * (0.42 + 0.22 * step(0.55, vn(p * 11.0)))); // crisp-edged dusting, not a soft cloud
    float sn = vn(p * 0.5 + 77.0) * 0.72 + vn(p * 2.1 + 3.0) * 0.28, zone = smoothstep(0.62, 0.7, vn(p * 0.06 + 9.0));
    float sauce = smoothstep(0.7, 0.72, sn) * zone;
    vec2 dcc = floor(p * 3.0); float dh = h1(dcc + 1.7);
    float drop = step(0.93, dh) * smoothstep(0.16, 0.1, length(fract(p * 3.0) - 0.5 - (h2(dcc) - 0.5) * 0.5)) * smoothstep(0.62, 0.7, sn) * zone;
    c = mix(c, ${glc('#f0c060')} * (0.95 + 0.1 * vn(p * 5.0)), clamp(sauce + drop, 0.0, 1.0) * 0.55);
    c = mix(c, ${glc('#fff0b0')}, smoothstep(0.73, 0.76, sn) * zone * 0.3);
    // wear & grime: trodden runs dull and warm, sooty corners (decor r), cracked tiles (b), flour drifts (a)
    float tr = smoothstep(0.24, 0.66, dc.g + (vn(p * 1.1) - 0.5) * 0.3);
    c = mix(c, c * vec3(0.9, 0.86, 0.8), tr * 0.4);
    float gr2 = smoothstep(0.3, 0.7, dc.r + (fbm(p * 0.7) - 0.5) * 0.5);
    c = mix(c, c * vec3(0.66, 0.6, 0.58), gr2 * 0.55);
    if (dc.b > 0.02) {
      float ck = smoothstep(0.15, 0.6, dc.b + (vn(p * 1.7) - 0.5) * 0.3);
      vec2 kc; vec3 kv = vor(p * 1.6 + 5.0, kc);
      float ln = abs(vn(p * 2.3 + kv.z * 9.0) - 0.5);
      c = mix(c, c * 0.55, (smoothstep(0.03, 0.0, kv.y) * 0.8 + smoothstep(0.02, 0.0, ln) * step(0.5, kv.z)) * ck);
    }
    float fa = smoothstep(0.25, 0.75, dc.a + (vn(p * 1.3) - 0.5) * 0.3);
    c = mix(c, ${glc('#fbf4e8')}, fa * (0.22 + 0.2 * smoothstep(0.3, 0.8, vn(p * 3.5))));
  `,
};
const FLOOR_BOSS = /* glsl */`
  if (uBoss.w > 0.5) { // painted arena sigil: rings, a six-petal rose and a dotted rune band, slowly pulsing
    vec2 d = p - uBoss.xy; float r = length(d), R = uBoss.z, a = atan(d.y, d.x);
    float ring1 = smoothstep(0.08, 0.0, abs(r - R) - 0.22);
    float ring2 = smoothstep(0.05, 0.0, abs(r - R * 0.88) - 0.05);
    float ring3 = smoothstep(0.05, 0.0, abs(r - R * 0.36) - 0.08);
    float rose = R * 0.36 + R * 0.46 * pow(abs(cos(a * 3.0)), 0.7);
    float petal = smoothstep(0.06, 0.0, abs(r - rose) - 0.05) * step(R * 0.36, r);
    float pfill = step(R * 0.36, r) * step(r, rose);
    float seg = a / 6.28318 * 40.0;
    float dots = smoothstep(0.16, 0.1, length(vec2((fract(seg) - 0.5) * r * 6.28318 / 40.0, r - R * 0.94)));
    float star = smoothstep(0.05, 0.0, abs(r - R * 0.2 * (1.0 + 0.35 * cos(a * 5.0))) - 0.05);
    float sig = max(max(ring1, ring2), max(max(ring3, petal), max(dots, star)));
    float pulse = 0.6 + 0.4 * sin(uTime * 1.8 - r * 0.35);
    // uSigDim < 1 while the boss winds up: the sigil sinks into a muted, darker wash so the telegraph owns the floor
    vec3 sigC = mix(c * 0.8, uSig, 0.25 + 0.75 * uSigDim);
    c = mix(c, mix(c, sigC, 0.3), (pfill * 0.55 + smoothstep(R * 0.36, R * 0.34, r) * 0.25) * uSigDim);
    c = mix(c, c * 0.72, smoothstep(R + 0.9, R + 0.2, r) * (1.0 - ring1) * step(R, r) * 0.6);
    c = mix(c, sigC, sig * (0.35 + 0.57 * uSigDim));
    c *= 1.0 - (1.0 - uSigDim) * 0.22 * smoothstep(R + 0.6, R - 0.4, r);
    fG += uSig * sig * 0.5 * pulse * uSigDim * uSigDim;
  }
`;

// ------------------------------------------------------------------ wall kits
// profile point: [offset into the wall (negative = over the floor), y, colour role, pattern kind]
// pattern kinds: 0 plain (vertex colour), 1 face pattern, 2 roof / cap pattern.  h = height, D = cap depth
const PROFILES = {
  burrow: (h, D, j) => [[-0.3, -0.02, 'dirt', 1], [-0.16 + j[0], 0.3 * h, 'dirt', 1], [-0.1 + j[1], 0.6 * h, 'dirt', 1], [-0.24 + j[2], 0.83 * h, 'lip', 0], [-0.1, 0.96 * h, 'moss', 0],
    [0.3, 1.04 * h, 'grass', 0], [D * 0.6 + 0.3, 1.02 * h + j[3], 'grass', 0], [D + 0.15, 0.8 * h, 'grassBack', 0], [D * 1.15 + 0.2, 0.3 * h, 'back', 0], [D * 1.25 + 0.3, -0.02, 'void', 0]],
  crystal: (h, D, j) => [[-0.3, -0.02, 'rockBase', 1], [-0.22 + j[0], 0.34 * h, 'rock', 1], [-0.06 + j[1], 0.7 * h + j[3] * 0.5, 'rock', 1], [0.1 + j[2], 0.95 * h, 'rockTop', 0],
    [0.5, 1.03 * h + j[3], 'frost', 0], [D * 0.65, 1.06 * h - j[3], 'frost', 0], [D + 0.1, 0.7 * h, 'rockBack', 0], [D * 1.25 + 0.3, -0.02, 'void', 0]],
  shrine: (h, D) => [[-0.16, -0.02, 'stone', 0], [-0.16, 0.34, 'stone', 0], [-0.04, 0.38, 'stoneTop', 0], [-0.04, 0.38, 'face', 1], [-0.04, h - 0.3, 'face', 1],
    [-0.04, h - 0.3, 'rail', 0], [-0.12, h - 0.28, 'rail', 0], [-0.12, h - 0.1, 'rail', 0], [-0.12, h - 0.1, 'roof', 2], [-0.5, h + 0.02, 'roof', 2], [0.45, h + 0.46, 'roof', 2],
    [0.45, h + 0.46, 'ridge', 0], [0.6, h + 0.56, 'ridge', 0], [0.75, h + 0.44, 'ridge', 0], [0.75, h + 0.44, 'roofBack', 2], [Math.max(1.2, D * 0.6), h + 0.02, 'roofBack', 2], [Math.max(1.25, D * 0.6), h - 0.05, 'fill', 0], [D, h - 0.3, 'fill', 0], [D * 1.2 + 0.3, -0.02, 'void', 0]],
  kitchen: (h, D) => [[-0.12, -0.02, 'base', 0], [-0.12, 0.22, 'base', 0], [-0.02, 0.25, 'base', 0], [-0.02, 0.25, 'brick', 1], [-0.02, h - 0.24, 'brick', 1],
    [-0.02, h - 0.24, 'ledge', 0], [-0.18, h - 0.2, 'ledge', 0], [-0.18, h - 0.02, 'ledge', 0], [0.05, h + 0.08, 'cap', 2], [0.95, h + 0.08, 'cap', 2], [0.95, h + 0.08, 'fill', 0], [D, h - 0.2, 'fill', 0], [D * 1.2 + 0.3, -0.02, 'void', 0]],
};
const WALL_ROLES = {
  burrow: { dirt: ['#9c7a5e', '#ac8a6c'], lip: ['#62804e', '#6c8a56'], moss: ['#72925c', '#7e9c66'], grass: ['#809e70', '#8eaa7c'], grassBack: ['#5a7250', '#627a56'], back: ['#3a2c2c', '#403232'] },
  crystal: { rockBase: ['#3c3068', '#463a74'], rock: ['#5a4a8e', '#6c5ca4'], rockTop: ['#8a7cc4', '#9a8ed0'], frost: ['#d2dcfa', '#eef2ff'], rockBack: ['#2c2450', '#342a5c'] },
  shrine: { stone: ['#8e8894', '#a09aa4'], stoneTop: ['#b6aeb4', '#c4bcc2'], face: ['#ffffff', '#f4f0ee'], rail: ['#c8362c', '#d4402e'], roof: ['#56688a', '#5e7294'], ridge: ['#343c52', '#3a4258'], roofBack: ['#48587a', '#506284'], fill: ['#2e2226', '#34262a'] },
  kitchen: { base: ['#4a3028', '#523630'], brick: ['#ffffff', '#f4ece8'], ledge: ['#6a5048', '#76584e'], cap: ['#8a7c74', '#9a8a80'], fill: ['#2a1c18', '#302018'] },
  moon: { stone: ['#7c7e9c', '#8c8caa'], stoneTop: ['#a6a8c6', '#b2b4d2'], face: ['#ffffff', '#f2f2fa'], rail: ['#c8362c', '#d4402e'], roof: ['#3c4474', '#444c7e'], ridge: ['#22264a', '#282c52'], roofBack: ['#343c68', '#3c4470'], fill: ['#14162e', '#181a34'] },
};
const WALL_H = { burrow: [2.5, 1.3, 0.55], crystal: [2.9, 1.2, 0.55], shrine: [2.45, 0.1, 0.62], kitchen: [2.7, 0.12, 0.6] }; // base, variation, near-side factor
const WALL_GLSL = {
  burrow: /* glsl */`
    if (vWall.z > 0.5) {
      float u = vWall.x, v = vWall.y, lip = vWall.w * 0.715; // the face pattern hands over to the mossy lip colour here
      // painted strata: wavy bands of red clay, dark loam and pale sand with a thin seam between them
      float wv = v * 1.35 + (vn(vec2(u * 0.16, 3.0)) - 0.5) * 0.9 + sin(u * 0.4 + uSeed) * 0.12;
      float bi = floor(wv), bf = fract(wv), bh = h1(vec2(bi, uSeed + 7.0));
      vec3 st = bh < 0.34 ? vec3(1.12, 0.9, 0.78) : bh < 0.67 ? vec3(0.84, 0.8, 0.78) : vec3(1.12, 1.07, 0.94);
      diffuseColor.rgb *= mix(vec3(1.0), st, 0.8);
      diffuseColor.rgb *= 1.0 - smoothstep(0.07, 0.0, min(bf, 1.0 - bf)) * 0.22;
      diffuseColor.rgb *= 0.92 + 0.08 * sin(v * 17.0 + vn(vec2(u * 0.9, v * 2.0)) * 5.0); // fine sediment lines
      // large colour drift along the face
      diffuseColor.rgb *= mix(vec3(0.94, 0.97, 1.0), vec3(1.06, 1.0, 0.92), smoothstep(0.3, 0.7, vn(vec2(u * 0.07, 1.0))));
      // embedded stones with a lit top and a dark underside
      vec2 q = vec2(u, v) * 3.0; vec2 qi = floor(q); vec2 qf = fract(q) - 0.5 - (h2(qi) - 0.5) * 0.5; float ph = h1(qi + 9.0);
      float pd = length(qf * vec2(1.0, 1.4)), pb = step(0.78, ph) * smoothstep(0.2, 0.14, pd);
      diffuseColor.rgb *= 1.0 - step(0.78, ph) * smoothstep(0.26, 0.18, length((qf + vec2(0.0, 0.06)) * vec2(1.0, 1.4))) * (1.0 - pb) * 0.35;
      diffuseColor.rgb = mix(diffuseColor.rgb, ${glc('#c4b4a4')} * (0.78 + 0.3 * ph) * (0.85 + 0.3 * smoothstep(-0.1, 0.12, qf.y)), pb);
      // thin roots threading down from the lip
      float ru = u * 1.1 + sin(v * 2.6 + h1(vec2(floor(u * 1.1), 4.0)) * 6.0) * 0.18, rcol = floor(ru);
      float rlen = 0.4 + h1(vec2(rcol, 8.0)) * 1.2, root = step(0.72, h1(vec2(rcol, 2.0))) * step(lip - v, rlen) * step(v, lip);
      root *= smoothstep(0.05, 0.015, abs(fract(ru) - 0.5)) * smoothstep(rlen, rlen * 0.6, lip - v);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${glc('#5a3a26')}, root * 0.85);
      // moss drips hanging from the grassy lip: a solid band right under it, then rounded tongues of varied length
      float dv = lip - v;
      if (dv < 1.0) {
        float cu = u / 0.23, ci = floor(cu), fx = fract(cu) - 0.5;
        float len = (0.08 + 0.62 * h1(vec2(ci, 5.0) + uSeed)) * step(0.3, h1(vec2(ci, 11.0)));
        float t = clamp(dv / max(len, 1e-3), 0.0, 1.0), wdt = mix(0.5, 0.16, t * t);
        float drip = step(dv, len) * smoothstep(wdt, wdt - 0.09, abs(fx));
        drip = max(drip, smoothstep(0.1 + 0.06 * sin(u * 3.0), 0.02, dv));
        vec3 mc = mix(${glc('#4e7a3c')}, ${glc('#86ac5c')}, smoothstep(0.0, 0.35, 1.0 - dv / max(len, 0.1)) * 0.7 + h1(vec2(ci, 2.0)) * 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.72, smoothstep(0.0, 0.06, dv - len) * (1.0 - smoothstep(0.06, 0.14, dv - len)) * step(0.3, h1(vec2(ci, 11.0))) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, mc, drip * step(dv, 0.95));
      }
      diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.35, v)); // damp, darker foot
    }`,
  crystal: /* glsl */`
    if (vWall.z > 0.5) {
      float u = vWall.x, v = vWall.y;
      // layered rock: tilted bands of violet, slate and pale amethyst + colour drift along the face
      float wv = v * 1.1 + u * 0.12 + (vn(vec2(u * 0.2, 5.0)) - 0.5) * 0.8;
      float bh = h1(vec2(floor(wv), uSeed + 3.0)), bf = fract(wv);
      diffuseColor.rgb *= mix(vec3(1.0), bh < 0.34 ? vec3(1.1, 0.92, 1.16) : bh < 0.67 ? vec3(0.82, 0.88, 0.98) : vec3(1.16, 1.12, 1.2), 0.75);
      diffuseColor.rgb *= 1.0 - smoothstep(0.06, 0.0, min(bf, 1.0 - bf)) * 0.25;
      diffuseColor.rgb *= mix(vec3(0.92, 0.96, 1.04), vec3(1.06, 0.96, 1.02), smoothstep(0.3, 0.7, vn(vec2(u * 0.07, 2.0))));
      // frost-rimmed ledges on the upper face
      diffuseColor.rgb = mix(diffuseColor.rgb, ${glc('#dfe6ff')}, smoothstep(0.035, 0.0, min(bf, 1.0 - bf)) * step(0.55, h1(vec2(floor(wv), 9.0))) * smoothstep(0.8, 1.6, v) * 0.7);
      float vein = abs(vn(vec2(u * 0.8, v * 1.1) + 3.0) - 0.5);
      float ve = smoothstep(0.035, 0.0, vein) * step(0.52, vn(vec2(u * 0.17, 7.0)));
      vec3 vc = mix(${glc('#ff9ae8')}, ${glc('#8af4ff')}, step(0.5, vn(vec2(u * 0.05, 3.0))));
      diffuseColor.rgb = mix(diffuseColor.rgb, vc, ve);
      wG += vc * ve * 1.1;
    }
    wG += ${glc('#e8f4ff')} * twinkle(vec2(vWall.x, vWall.y * 1.3), 2.5, 0.9) * 1.4;`,
  shrine: /* glsl */`
    if (vWall.z > 0.5 && vWall.z < 1.5) {
      float u = vWall.x, v = vWall.y, pw = 2.4, pf = fract(u / pw) * pw;
      if (h1(vec2(floor(u / pw), uSeed)) < 0.4) { // shoji panel glowing warm from behind
        vec2 ff = abs(fract(vec2(pf / 0.4, (v - 0.38) / 0.42)) - 0.5) * vec2(0.4, 0.42);
        float lat = 1.0 - smoothstep(0.016, 0.028, min(0.2 - ff.x, 0.21 - ff.y));
        float frame = 1.0 - smoothstep(0.07, 0.1, min(pf, pw - pf));
        float wood = max(max(lat, frame), step(v, 0.8));
        diffuseColor.rgb *= mix(${glc('#fff1d8')}, ${glc('#7a4e32')}, wood);
        wG += ${glc('#ffc880')} * (1.0 - wood) * (0.28 + 0.06 * sin(uTime * 2.0 + u));
      } else { // vertical boards
        float bi = floor(u / 0.3), bf = fract(u / 0.3), bh = h1(vec2(bi, 3.0));
        vec3 wc = mix(${glc('#94643e')}, ${glc('#b88450')}, bh) * (0.93 + 0.07 * sin(v * 8.0 + bh * 30.0 + sin(v * 2.0 + bi) * 2.0));
        wc *= mix(0.6, 1.0, smoothstep(0.0, 0.08, min(bf, 1.0 - bf)));
        diffuseColor.rgb *= wc;
      }
    } else if (vWall.z > 1.5) { // kawara roof tiles
      float tf = fract(vWall.x / 0.28), row = fract(vWall.y / 0.2);
      diffuseColor.rgb *= (0.72 + 0.28 * sin(tf * 3.14159)) * mix(0.7, 1.0, smoothstep(0.0, 0.18, row));
    }`,
  kitchen: /* glsl */`
    if (vWall.z > 0.5 && vWall.z < 1.5) {
      float u = vWall.x, v = vWall.y, row = floor(v / 0.22), off = mod(row, 2.0) * 0.25;
      float bi = floor((u + off) / 0.5); vec2 bf = vec2(fract((u + off) / 0.5) * 0.5, fract(v / 0.22) * 0.22);
      float bh = h1(vec2(bi, row));
      vec3 bc = mix(${glc('#b45a3e')}, ${glc('#d27a50')}, bh);
      bc = mix(bc, ${glc('#8a4636')}, step(0.86, h1(vec2(bi + 3.0, row))) * 0.7);
      float mort = smoothstep(0.012, 0.03, min(min(bf.x, 0.5 - bf.x), min(bf.y, 0.22 - bf.y)));
      bc = mix(${glc('#d8c6ac')}, bc * (0.9 + 0.1 * vn(vec2(u, v) * 8.0)), mort);
      bc *= mix(1.0, 0.68, smoothstep(1.3, 2.7, v));
      diffuseColor.rgb *= bc;
    } else if (vWall.z > 1.5) {
      float sf = fract(vWall.x / 0.62);
      diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.05, min(sf, 1.0 - sf))) * (0.92 + 0.16 * h1(vec2(floor(vWall.x / 0.62), 1.0)));
    }`,
};

// ------------------------------------------------------------------ world
export class DungeonWorld {
  constructor(engine, layout) {
    this.engine = engine; this.L = layout;
    const T = this.theme = THEMES[layout.theme];
    this.variant = layout.theme; // palette (e.g. 'moon')
    this.th = T.kit || layout.theme; // geometry / shader kit
    const scene = this.scene = new THREE.Scene();
    scene.background = C(T.fog);
    scene.fog = new THREE.Fog(T.fog, 38, 70);
    this.hemi = new THREE.HemisphereLight(T.ambient[0], T.ambient[1], T.ambientI ?? 1.35); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(T.sun || '#d8d0ff', T.sunI ?? 1.25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sunDir = V(0.35, 1, 0.55).normalize();
    this.lightPool = new LightPool(scene, 8);
    this.collision = new Collision(4);
    this.collision.blockFn = (x, z) => !this.walkable(x, z);
    this.interactables = [];
    this.rng = mulberry32(layout.floor * 31 + 7);
    this.noise = new Noise(layout.floor + 5);
    this.flames = []; this.steam = [];
    // static batches: props, wall dressing (fades with the player cut-away), and emissive bits
    this.solid = new Chunks(); this.wallDeco = new Chunks(); this.glow = new Chunks(); this.wallGlow = new Chunks(); this.halos = new Halos();
    this.clutter = new Chunks(40); // small ground dressing (tufts, leaves, pebbles, petals): no shadow casting
    this.floorGlows = new FloorGlows(); this.shaftBatch = new Shafts();
    // set dressing has its own random stream so the older passes keep their exact placement
    this.drng = mulberry32(layout.floor * 7717 + (layout.rooms[0]?.x || 0) * 131 + (layout.rooms[0]?.y || 0) * 17 + 3);
    this.buildInfo(); this.buildDecoMap(); this.buildFloor(); this.buildWalls(); this.buildProps(); this.buildLights(); this.buildShafts(); this.buildCenterpieces(); this.buildArena();
    this.buildDressing();
    this.shaftBatch.build(scene, C(T.accent).lerp(C('#ffffff'), 0.55)); this.floorGlows.build(scene);
    const matSolid = makeToon({ vertexColors: true, brush: 0.18, rim: 0.35 });
    const matSolidOcc = makeToon({ vertexColors: true, brush: 0.18, rim: 0.35, occluder: true });
    const glowOut = 'outgoingLight += diffuseColor.rgb * 1.35;';
    const matGlow = makeToon({ vertexColors: true, rim: 0.5, fragOut: glowOut });
    const matGlowOcc = makeToon({ vertexColors: true, rim: 0.5, fragOut: glowOut, occluder: true });
    this.solid.build(scene, matSolid); this.wallDeco.build(scene, matSolidOcc);
    this.clutterMeshes = this.clutter.build(scene, matSolid, false, true);
    this.glow.build(scene, matGlow, false); this.wallGlow.build(scene, matGlowOcc, false);
    this.halos.build(scene);
  }
  cellToWorld(x, y) { return V((x + 0.5) * CELL, 0, (y + 0.5) * CELL); }
  worldToCell(x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; }
  heightAt() { return 0; }
  walkable(x, z) {
    const [cx, cy] = this.worldToCell(x, z);
    if (!this.L.at(cx, cy)) return false;
    // keep a margin from wall cells so bodies don't clip into rocks
    const fx = x / CELL - cx, fy = z / CELL - cy, m = 0.22;
    if (fx < m && !this.L.at(cx - 1, cy)) return false;
    if (fx > 1 - m && !this.L.at(cx + 1, cy)) return false;
    if (fy < m && !this.L.at(cx, cy - 1)) return false;
    if (fy > 1 - m && !this.L.at(cx, cy + 1)) return false;
    return true;
  }
  solidAtCell(x, z) { return !this.L.at(Math.floor(x / CELL), Math.floor(z / CELL)); }
  // ------------------------------------------------------------------ info texture: r mask, g room id, b corridor axis, a wall distance
  buildInfo() {
    const { W, H, grid, at } = this.L;
    const roomId = this.L.roomId || new Uint8Array(W * H);
    const dist = new Uint8Array(W * H).fill(255), q = new Int32Array(W * H); let qh = 0, qt = 0;
    for (let i = 0; i < W * H; i++) if (!grid[i]) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, d = dist[i];
      if (d >= 6) continue;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (dist[j] > d + 1) { dist[j] = d + 1; q[qt++] = j; }
      }
    }
    this.wallDist = dist;
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let ori = 0;
      if (grid[i] && !roomId[i]) { // corridor axis: longest straight run through the cell
        let lx = 0, lz = 0;
        for (let k = 1; k <= 3; k++) { lx += at(x + k, y) + at(x - k, y); lz += at(x, y + k) + at(x, y - k); }
        ori = lx >= lz ? 80 : 160;
      }
      data[i * 4] = grid[i] ? 255 : 0; data[i * 4 + 1] = roomId[i]; data[i * 4 + 2] = ori; data[i * 4 + 3] = Math.min(6, dist[i]) * 40;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    this.info = tex; this.mask = tex;
  }
  // arrival / stairs / waypoint / boss ring stay clear of 3D dressing (world coords)
  keepClear(x, z, pad = 0) {
    const L = this.L, c = (cx, cy, r) => Math.hypot(x - (cx + 0.5) * CELL, z - (cy + 0.5) * CELL) < r * CELL + pad;
    if (c(L.start.x, L.start.y, 3.2)) return true;
    if (L.stairs && c(L.stairs.x, L.stairs.y, 1.8)) return true;
    if (L.waypoint && c(L.waypoint.x, L.waypoint.y, 2)) return true;
    for (const o of L.chests) if (c(o.x, o.y, 0.75)) return true;
    for (const o of L.shrines) if (c(o.x, o.y, 0.8)) return true;
    for (const o of L.pots) if (c(o.x, o.y, 0.55)) return true;
    if (this.arena && Math.hypot(x - this.arena.x, z - this.arena.z) < this.arena.R + 1.2 + pad) return true;
    return false;
  }
  // ------------------------------------------------------------------ painted decor map (2 texels per cell, linear filtered)
  // r lush (moss meadow / lichen), g worn path, b cracks, a accent (flowers / petals / rime / flour). The floor shader paints
  // patches from it and buildDressing() puts matching 3D set dressing on the same spots, so paint and props agree.
  buildDecoMap() {
    const L = this.L, { W, H, at, rooms } = L, K = 2, TW = W * K, TH = H * K, N = this.noise, r = this.drng, th = this.th;
    const roomId = L.roomId || new Uint8Array(W * H), dist = this.wallDist;
    const D = this.deco = new Float32Array(TW * TH * 4);
    this.decoK = K; this.decoW = TW; this.decoH = TH;
    const b = L.bossRoom;
    if (b) { const c = this.cellToWorld(b.cx, b.cy); this.arena = { x: c.x, z: c.z, R: Math.min(b.w, b.h) * CELL * 0.5 - 2.4 }; }
    // soft blob in world units (1 in the middle, 0 at rad, noisy rim)
    const disc = (x, z, rad, ch, amt = 1, wob = 0.3) => {
      const tx0 = Math.max(0, Math.floor((x - rad) * K / CELL)), tx1 = Math.min(TW - 1, Math.ceil((x + rad) * K / CELL));
      const tz0 = Math.max(0, Math.floor((z - rad) * K / CELL)), tz1 = Math.min(TH - 1, Math.ceil((z + rad) * K / CELL));
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        const wx = (tx + 0.5) * CELL / K, wz = (tz + 0.5) * CELL / K;
        const d = Math.hypot(wx - x, wz - z) / rad + N.n2(wx * 0.55 + ch * 7, wz * 0.55) * wob;
        const v = clamp((1 - d) / 0.5) * amt, k = (tz * TW + tx) * 4 + ch;
        if (v > D[k]) D[k] = v;
      }
    };
    const curve = (ax, az, bx, bz, w, ch, amt) => { // gently bowed stroke (quadratic bezier)
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) return;
      const bow = (r() - 0.5) * len * 0.35, mx = (ax + bx) / 2 - (bz - az) / len * bow, mz = (az + bz) / 2 + (bx - ax) / len * bow;
      const n = Math.ceil(len / (w * 0.45));
      for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; disc(u * u * ax + 2 * u * t * mx + t * t * bx, u * u * az + 2 * u * t * mz + t * t * bz, w * (1 - 0.25 * t), ch, amt, 0.12); }
    };
    const P = { // per-biome recipe: [lush blobs, crack blobs, accent blobs] per ~50 m² of room, and whether rooms get trails
      burrow: { lush: 1.3, crack: 0.5, acc: 0.9, path: 1 }, crystal: { lush: 0.7, crack: 0.8, acc: 1.0, path: 1 },
      shrine: { lush: 0, crack: 0, acc: 1.1, path: 1 }, kitchen: { lush: 0.5, crack: 0.8, acc: 0.8, path: 1 },
    }[th];
    const cellsOf = rm => { const out = []; for (let y = rm.y - 1; y <= rm.y + rm.h; y++) for (let x = rm.x - 1; x <= rm.x + rm.w; x++) if (at(x, y) && roomId[y * W + x] === rm.id) out.push([x, y]); return out; };
    for (const rm of rooms) {
      const cells = cellsOf(rm); if (!cells.length) continue;
      const area = cells.length * CELL * CELL, boss = rm.kind === 'boss';
      const pickCell = (dMin, dMax) => { for (let t = 0; t < 30; t++) { const c = cells[Math.floor(r() * cells.length)], d = dist[c[1] * W + c[0]]; if (d >= dMin && d <= dMax) return c; } return null; };
      const toW = c => [(c[0] + 0.5 + (r() - 0.5) * 0.8) * CELL, (c[1] + 0.5 + (r() - 0.5) * 0.8) * CELL];
      const count = k => { const f = k * area / 50; return Math.floor(f) + (r() < f % 1 ? 1 : 0); };
      // trails: every corridor mouth wanders in toward the room's heart
      if (P.path && !boss) {
        const mouths = [];
        for (const [x, y] of cells) {
          let m = false; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + ox, y + oy) && !roomId[(y + oy) * W + x + ox]) m = true;
          if (!m) continue;
          const near = mouths.find(q => Math.abs(q.x / q.n - x) + Math.abs(q.y / q.n - y) < 3);
          if (near) { near.x += x; near.y += y; near.n++; } else mouths.push({ x, y, n: 1 });
        }
        const cx = (rm.cx + 0.5) * CELL, cz = (rm.cy + 0.5) * CELL;
        for (const q of mouths) curve((q.x / q.n + 0.5) * CELL, (q.y / q.n + 0.5) * CELL, cx + (r() - 0.5) * 2, cz + (r() - 0.5) * 2, th === 'shrine' || th === 'kitchen' ? 1.0 : 0.9, 1, 0.9);
      }
      // lush patches hug the walls (moss grows where it's damp and nobody treads)
      for (let i = count(P.lush); i-- > 0;) { const c = pickCell(1, boss ? 1 : 3); if (c) { const [x, z] = toW(c); disc(x, z, 1.6 + r() * 2.0, 0, 1, 0.35); } }
      for (let i = count(P.crack); i-- > 0;) { const c = pickCell(boss ? 1 : 2, boss ? 1 : 9); if (c) { const [x, z] = toW(c); disc(x, z, 1.3 + r() * 1.3, 2, 0.6 + r() * 0.4, 0.3); } }
      for (let i = count(P.acc); i-- > 0;) { const c = pickCell(1, boss ? 1 : th === 'shrine' ? 3 : 4); if (c) { const [x, z] = toW(c); disc(x, z, 0.9 + r() * 1.4, 3, 0.7 + r() * 0.3, 0.35); } }
    }
    // corridors read as trodden runs too
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !roomId[y * W + x] && r() < 0.5) disc((x + 0.5) * CELL, (y + 0.5) * CELL, 1.3, 1, 0.55, 0.2);
    const data = new Uint8Array(TW * TH * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(clamp(D[i]) * 255);
    const tex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    this.decoTex = tex;
  }
  decoAt(x, z) { // bilinear-free lookup (nearest texel) of the decor map at a world position -> [lush, path, crack, accent]
    const K = this.decoK, tx = clamp(Math.floor(x * K / CELL), 0, this.decoW - 1), tz = clamp(Math.floor(z * K / CELL), 0, this.decoH - 1), k = (tz * this.decoW + tx) * 4, D = this.deco;
    return [D[k], D[k + 1], D[k + 2], D[k + 3]];
  }
  buildFloor() {
    const { W, rooms } = this.L, T = this.theme;
    const size = W * CELL;
    const g = new THREE.PlaneGeometry(size, size, 1, 1); g.rotateX(-Math.PI / 2); g.translate(size / 2, 0, size / 2);
    const KIND = { normal: 0, start: 1, stairs: 2, boss: 3, treasure: 4, shrine: 5 };
    const uRoom = Array.from({ length: 16 }, () => new THREE.Vector4(-999, -999, -999, -999)), uRoomK = Array.from({ length: 16 }, () => new THREE.Vector4());
    rooms.slice(0, 16).forEach((r, i) => { uRoom[i].set(r.x * CELL, r.y * CELL, (r.x + r.w) * CELL, (r.y + r.h) * CELL); uRoomK[i].set(KIND[r.kind] ?? 0, (i * 0.618) % 1 * 10, (r.x * 7 + r.y * 13) % 2, 0); });
    const b = this.L.bossRoom;
    const uBoss = new THREE.Vector4(0, 0, 0, 0);
    if (b) { const c = this.cellToWorld(b.cx, b.cy); uBoss.set(c.x, c.z, Math.min(b.w, b.h) * CELL * 0.5 - 2.4, 1); this.arena = { x: c.x, z: c.z, R: uBoss.z }; }
    const SIG = { burrow: '#ffc2dc', crystal: '#8af0ff', shrine: '#ffd24a', kitchen: '#ff8a3a', moon: '#7c9cff' };
    const mat = makeToon({
      brush: 0.2, brushScale: 0.25, rim: 0, shadowSat: 0.5,
      uniforms: { uInfo: { value: this.info }, uDeco: { value: this.decoTex }, uSigDim: { value: 1 }, uSize: { value: size }, uF0: { value: C(T.floor[0]) }, uF1: { value: C(T.floor[1]) }, uF2: { value: C(T.floor[2]) }, uVoid: { value: C(T.fog) }, uSig: { value: C(SIG[this.variant] || SIG[this.th]) }, uRoom: { value: uRoom }, uRoomK: { value: uRoomK }, uBoss: { value: uBoss } },
      fragPars: (this.variant === 'moon' ? '#define MOON\n' : '') + FLOOR_PARS,
      fragColor: /* glsl */`
        {
          vec2 p = vCWorld.xz;
          vec4 inf = texture2D(uInfo, p / uSize);
          float m = inf.r, wd = inf.a * 255.0 / 40.0;
          vec4 cin = texelFetch(uInfo, ivec2(floor(p / ${CELL.toFixed(1)})), 0);
          int rid = int(cin.g * 255.0 + 0.5); float ori = cin.b * 255.0;
          float nA = texture2D(uBrush, p * 0.045).g, nB = texture2D(uBrush, p * 0.11).r;
          vec4 dc = texture2D(uDeco, p / uSize);
          vec3 c = mix(uF1, uF0, smoothstep(0.38, 0.62, nA));
          c = mix(c, uF2, smoothstep(0.55, 0.75, nB) * 0.5);
          fG = vec3(0.0);
          ${FLOOR_THEME[this.th]}
          ${FLOOR_BOSS}
          c *= mix(0.58, 1.0, smoothstep(0.45, 1.3, wd));   // painted contact shade along the wall base
          c *= mix(0.88, 1.0, smoothstep(1.0, 3.6, wd));    // and a broad room vignette: rooms read as volumes, not flat plates
          c = mix(uVoid * 0.6, c, smoothstep(0.2, 0.62, m));
          fG *= smoothstep(0.4, 0.7, m);
          diffuseColor.rgb = c;
        }
      `,
      fragOut: 'outgoingLight += fG;',
    });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.scene.add(m);
    this.floorMesh = m;
  }
  // ------------------------------------------------------------------ walls: contour ribbons
  traceLoops() {
    const { W, H, at } = this.L;
    // marching squares on the cell-centre lattice (doubled integer coords); segments oriented with floor on the left
    const E = [[1, 0], [2, 1], [1, 2], [0, 1]]; // bottom, right, top, left edge midpoints (doubled, relative)
    const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];
    const next = new Map(), key = (x, y) => x * 8192 + y;
    for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const cs = a | (b << 1) | (c << 2) | (d << 3);
      for (const [e0, e1] of CASES[cs]) {
        let x0 = 2 * i + E[e0][0], y0 = 2 * j + E[e0][1], x1 = 2 * i + E[e1][0], y1 = 2 * j + E[e1][1];
        // bilinear floor value on either side of the segment midpoint decides orientation
        const mx = (x0 + x1) / 4 - i, my = (y0 + y1) / 4 - j, dx = (x1 - x0) / 2, dy = (y1 - y0) / 2, l = Math.hypot(dx, dy);
        const nx = -dy / l * 0.3, ny = dx / l * 0.3;
        const f = (u, v) => a * (1 - u) * (1 - v) + b * u * (1 - v) + c * u * v + d * (1 - u) * v;
        if (f(mx + nx, my + ny) < f(mx - nx, my - ny)) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
        next.set(key(x0, y0), [x1, y1]);
      }
    }
    const loops = [], seen = new Set();
    for (const [k0] of next) {
      if (seen.has(k0)) continue;
      const loop = []; let k = k0, guard = 0;
      while (!seen.has(k) && guard++ < 100000) {
        seen.add(k); const x = Math.floor(k / 8192), y = k % 8192;
        loop.push([(x / 2 + 0.5) * CELL, (y / 2 + 0.5) * CELL]);
        const n = next.get(k); if (!n) break; k = key(n[0], n[1]);
      }
      if (loop.length >= 4) loops.push(loop);
    }
    return loops;
  }
  static smoothLoop(pts, iters, ds) {
    for (let it = 0; it < iters; it++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      pts = out;
    }
    let L = 0; const cum = [0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(L); }
    const n = Math.max(6, Math.round(L / ds)), step = L / n, out = [];
    let seg = 0;
    for (let k = 0; k < n; k++) {
      const s = k * step; while (cum[seg + 1] < s && seg < pts.length - 1) seg++;
      const a = pts[seg], b = pts[(seg + 1) % pts.length], t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return { pts: out, len: L };
  }
  buildWalls() {
    const th = this.th, T = this.theme, N = this.noise, r = this.rng;
    const built = !!T.built, ds = built ? 0.55 : th === 'crystal' ? 0.7 : 0.5;
    const prof = PROFILES[th], roles = WALL_ROLES[this.variant] || WALL_ROLES[th], [H0, HV, NEAR] = WALL_H[th];
    const voidC = C(T.fog).multiplyScalar(0.55);
    const roleCols = {}; for (const k in roles) roleCols[k] = roles[k].map(C);
    const loops = this.traceLoops();
    this.wallSamples = [];
    const pos = [], nor = [], colA = [], wallA = [], idx = [];
    let vbase = 0, loopSeed = 0;
    for (const raw of loops) {
      loopSeed++;
      const { pts, len } = DungeonWorld.smoothLoop(raw, 2, ds);
      const n = pts.length;
      const S = pts.map((p, i) => {
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const nx = tz, nz = -tx; // into the wall
        let thick = 7;
        for (let s = 0.3; s < 7; s += 0.35) if (!this.solidAtCell(p[0] + nx * s, p[1] + nz * s)) { thick = s; break; }
        const f = -(nx * CAMX + nz * CAMZ); // >0: face looks at the camera (far wall)
        return { x: p[0], z: p[1], tx, tz, nx, nz, thick, f, u: (i / n) * len };
      });
      // smoothed cap depth (min-filter then blur) and height (camera-facing walls full height, near side cut down)
      const dRaw = S.map(s => clamp(s.thick * 0.5, 0.45, 3.0));
      const dMin = dRaw.map((_, i) => { let m = 9; for (let k = -3; k <= 3; k++) m = Math.min(m, dRaw[(i + k + n) % n]); return m; });
      const hRaw = S.map(s => {
        const nn = N.n2(s.x * 0.09 + loopSeed, s.z * 0.09) * 0.5 + 0.5, n2 = N.n2(s.x * 0.31, s.z * 0.31 + 7) * 0.5 + 0.5;
        const base = H0 + (nn * 0.75 + n2 * 0.25 - 0.5) * HV * 2;
        return base * (NEAR + (1 - NEAR) * clamp((s.f + 0.55) / 0.8));
      });
      for (let i = 0; i < n; i++) {
        let d = 0, h = 0; for (let k = -2; k <= 2; k++) { d += dMin[(i + k + n) % n]; h += hRaw[(i + k + n) % n]; }
        S[i].D = d / 5; S[i].h = h / 5;
      }
      this.wallSamples.push({ S, len, seed: loopSeed });
      // ribbon vertices: n + 1 columns (last duplicates the first with u = len) so face patterns never smear over the seam
      const K = prof(1, 1, [0, 0, 0, 0]).length;
      for (let i = 0; i <= n; i++) {
        const s = S[i % n], u = i === n ? len : s.u;
        const j = built ? [0, 0, 0, 0] : [N.n2(s.x * 0.7, s.z * 0.7) * 0.1, N.n2(s.z * 0.8 + 3, s.x * 0.8) * 0.12, N.n2(s.x * 0.5 + 9, s.z * 0.5) * 0.14, N.n2(s.x * 0.4, s.z * 0.4 + 5) * 0.25];
        if (th === 'crystal') { const q = mulberry32(Math.floor(s.x * 13.1) * 7919 + Math.floor(s.z * 17.3)); j[0] += (q() - 0.5) * 0.3; j[1] += (q() - 0.5) * 0.34; j[2] += (q() - 0.5) * 0.3; j[3] += (q() - 0.5) * 0.4; }
        const P = prof(s.h, s.D, j);
        let v = 0;
        for (let k = 0; k < K; k++) {
          const [o, y, role, kind] = P[k];
          if (k) v += Math.hypot(o - P[k - 1][0], y - P[k - 1][1]);
          pos.push(s.x + s.nx * o, y, s.z + s.nz * o);
          nor.push(0, 1, 0);
          if (role === 'void') colA.push(voidC.r, voidC.g, voidC.b);
          else {
            const rc = roleCols[role], t = clamp(N.n2(s.x * 0.45 + k, s.z * 0.45) * 0.5 + 0.5);
            _c.copy(rc[0]).lerp(rc[1], t);
            if (role === 'dirt' || role === 'rock' || role === 'rockBase') _c.multiplyScalar((th === 'burrow' ? 0.82 : 0.72) + (th === 'burrow' ? 0.18 : 0.28) * clamp(y / s.h + 0.1));
            if (role === 'grass' && N.n2(s.x * 0.22, s.z * 0.22) > 0.45) _c.lerp(C(th === 'burrow' ? '#b4c490' : '#a8c860'), 0.35);
            if ((role === 'face' || role === 'brick') && y < 0.5) _c.multiplyScalar(0.8);
            colA.push(_c.r, _c.g, _c.b);
          }
          wallA.push(u, kind === 2 ? v : y, kind, s.h);
        }
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < K - 1; k++) {
        const a = vbase + i * K + k, b = vbase + (i + 1) * K + k;
        idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
      vbase += (n + 1) * K;
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
    g.setAttribute('aWall', new THREE.Float32BufferAttribute(wallA, 4));
    g.setIndex(vbase > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mat = makeToon({
      vertexColors: true, brush: th === 'crystal' ? 0.18 : 0.26, brushScale: 0.5, rim: 0.28, occluder: true, term: [-0.05, 0.35],
      uniforms: { uSeed: { value: (this.L.floor * 3.7) % 11 } },
      vertexPars: 'attribute vec4 aWall; varying vec4 vWall;', vertexWorld: 'vWall = aWall;',
      fragPars: `varying vec4 vWall; uniform float uSeed; vec3 wG; ${NOISE_GLSL}`,
      fragColor: `wG = vec3(0.0); ${WALL_GLSL[th]}`,
      fragOut: 'outgoingLight += wG;',
    });
    if (th === 'crystal') mat.flatShading = true;
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
    this.wallMesh = mesh;
    // collision stays per wall cell
    const { W, H, at } = this.L;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (at(x, y)) continue;
      if (!(at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1) || at(x + 1, y + 1) || at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1))) continue;
      const wp = this.cellToWorld(x, y);
      this.collision.addRect(wp.x - CELL / 2, wp.z - CELL / 2, wp.x + CELL / 2, wp.z + CELL / 2, 'wall');
    }
    this.dressWalls();
  }
  // ------------------------------------------------------------------ wall dressing per biome
  dressWalls() {
    const th = this.th, r = this.rng, WD = this.wallDeco, WG = this.wallGlow, HA = this.halos;
    const lightBudget = { n: 0 };
    const addLight = (x, y, z, c, i = 5, rad = 6, fl = 0.4) => { if (lightBudget.n++ > 40) return; this.lightPool.addSource({ pos: V(x, y, z), color: C(c), intensity: i, radius: rad, flicker: fl }); };
    for (const { S, len, seed } of this.wallSamples) {
      const n = S.length;
      if (th === 'shrine' || th === 'kitchen') {
        const pw = th === 'shrine' ? 2.4 : 3.2;
        let lastPanel = -1;
        for (let i = 0; i < n; i++) {
          const s = S[i], panel = Math.floor(s.u / pw);
          if (panel === lastPanel) continue;
          lastPanel = panel;
          if (panel * pw > len - pw * 0.5 && i > 0) continue;
          const face = Math.atan2(-s.nx, -s.nz), hash = mulberry32(panel * 7919 + seed * 104729)();
          const mid = S[Math.min(n - 1, i + Math.round(pw * 0.5 / (len / n)))] || s;
          if (th === 'shrine') this.shrinePost(s, face, hash, mid, addLight);
          else this.kitchenPost(s, face, hash, mid, addLight);
        }
        continue;
      }
      if (th === 'burrow') { // cosy burrow architecture: timber props every few metres and the odd critter door
        let lastSeg = -1;
        const k = Math.max(1, Math.round(0.62 / (len / n)));
        for (let i = 0; i < n; i++) {
          const s = S[i], seg = Math.floor(s.u / 6.5);
          if (seg === lastSeg || s.f < 0.35 || s.u > len - 3) continue;
          const A = S[(i - k + n) % n], B = S[(i + k) % n];
          if (A.f < 0.25 || B.f < 0.25 || Math.abs(A.h - B.h) > 0.5) continue; // straight-ish, camera-facing run only
          lastSeg = seg;
          const hsh = mulberry32(seg * 7919 + seed * 104729)();
          if (hsh < 0.2) this.critterDoor(s, addLight);
          else if (hsh < 0.7) this.timberFrame(A, B);
        }
      }
      for (let i = 0; i < n; i++) {
        const s = S[i];
        if (r() > (th === 'burrow' ? 0.3 : 0.26)) continue;
        const face = Math.atan2(-s.nx, -s.nz), far = s.f > 0.15;
        const fx = s.x - s.nx * 0.12, fz = s.z - s.nz * 0.12; // just in front of the face
        if (th === 'burrow') {
          const k = r();
          if (far && k < 0.26) { // hanging roots from the mossy lip
            const m = 2 + Math.floor(r() * 3);
            for (let q = 0; q < m; q++) {
              const o = (r() - 0.5) * 0.9, bx = fx + s.tx * o, bz = fz + s.tz * o, y0 = s.h * 0.86, y1 = s.h * (0.15 + r() * 0.35), out = 0.12 + r() * 0.12;
              const g = tube([{ p: V(bx + s.nx * 0.1, y0, bz + s.nz * 0.1), r: 0.055 }, { p: V(bx - s.nx * out, (y0 + y1) * 0.55, bz - s.nz * out), r: 0.04 }, { p: V(bx - s.nx * out * 0.6 + s.tx * (r() - 0.5) * 0.3, y1 + 0.12, bz - s.nz * out * 0.6), r: 0.022 }, { p: V(bx - s.nx * out * 0.3, y1, bz - s.nz * out * 0.3), r: 0.008 }], 5);
              WD.addGeo(g, bx, bz, null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#6a4630')).lerp(col('#a07a58'), clamp((y0 - y) / (y0 - y1 + 0.01)) * 0.6));
            }
          } else if (far && k < 0.5) { // moss drapes
            const m = 3 + Math.floor(r() * 3);
            for (let q = 0; q < m; q++) {
              const o = (q / (m - 1) - 0.5) * 1.1, len2 = 0.25 + r() * 0.45;
              WD.add(SH.sphLo(), M(fx + s.tx * o - s.nx * 0.08, s.h * 0.84 - len2 * 0.5, fz + s.tz * o - s.nz * 0.08, 0.14 + r() * 0.06, len2 * 0.6, 0.09, 0, face, 0), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#5e8444')).lerp(col('#94b068'), clamp(ny * 0.5 + 0.5)));
            }
          } else if (far && k < 0.66) { // shelf fungus
            const y0 = s.h * (0.3 + r() * 0.35), cc = r() < 0.5 ? '#f4d8a8' : '#e89a5a';
            for (let q = 0; q < 3; q++) WD.add(SH.hemi(), M(fx + s.tx * (q - 1) * 0.16 - s.nx * 0.06, y0 + q * 0.13 - Math.abs(q - 1) * 0.08, fz + s.tz * (q - 1) * 0.16 - s.nz * 0.06, 0.2 - Math.abs(q - 1) * 0.05, 0.08, 0.15, 0, face, 0), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col(cc)).multiplyScalar(ny > 0.2 ? 1 : 0.75));
          } else if (k < 0.8) { // grass tuft + flowers along the top edge
            const tx = s.x + s.nx * 0.25, tz = s.z + s.nz * 0.25, ty = s.h * 1.03;
            this.tuft(WD, tx, ty, tz, 0.9 + r() * 0.5);
            if (r() < 0.6) this.flower(WD, tx + s.tx * 0.25, ty, tz + s.tz * 0.25, r() < 0.5 ? '#ffb8d0' : '#fff0a0', 0.9);
          } else if (far && k < 0.9) { // glowing mushrooms near the base
            this.mushrooms(WG, fx - s.nx * 0.1, 0, fz - s.nz * 0.1, r() < 0.6 ? '#8ad8ff' : '#ff9ad0', 0.8 + r() * 0.4, HA);
          } else if (far) { // mossy boulder at the base
            WD.add(SH.ico(), M(fx - s.nx * 0.25, 0.12, fz - s.nz * 0.25, 0.32 + r() * 0.2, 0.26 + r() * 0.1, 0.3 + r() * 0.2, r(), r() * TAU, 0), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#9a8a7e')).lerp(col('#7c9a5a'), clamp(ny * 1.6 - 0.3)));
          }
        } else { // crystal grotto
          const k = r();
          if (far && k < 0.36) { // glowing crystals bursting out of the rock face
            const cc = r() < 0.5 ? '#ff8ae0' : r() < 0.6 ? '#7af0ff' : '#c8a8ff', y0 = s.h * (0.25 + r() * 0.5), m = 2 + Math.floor(r() * 3);
            for (let q = 0; q < m; q++) {
              const d = V(-s.nx * (0.8 + r() * 0.4) + s.tx * (r() - 0.5) * 0.8, 0.5 + r() * 0.9, -s.nz * (0.8 + r() * 0.4) + s.tz * (r() - 0.5) * 0.8).normalize(), sz = 0.12 + r() * 0.1, L2 = 0.5 + r() * 0.6;
              WG.add(SH.crys(), MD(fx + s.nx * 0.1, y0 + (r() - 0.5) * 0.3, fz + s.nz * 0.1, d, sz, L2, sz, r() * TAU), null, (x, y, z, nx, ny, nz, o2, lx, ly) => o2.copy(col(cc)).lerp(col('#ffffff'), clamp(ly * 0.5 + ny * 0.2)));
            }
            HA.add(fx - s.nx * 0.3, y0 + 0.3, fz - s.nz * 0.3, 1.6, cc, 0.45);
            if (r() < 0.35) addLight(fx - s.nx * 0.6, y0 + 0.5, fz - s.nz * 0.6, cc, 4, 5, 0.2);
          } else if (k < 0.58) { // crystal cluster on top
            const cc = r() < 0.5 ? '#b8f4ff' : '#ffc0ee', m = 3 + Math.floor(r() * 3), bx = s.x + s.nx * (0.4 + r() * 0.6), bz = s.z + s.nz * (0.4 + r() * 0.6), by = s.h * 1.0;
            for (let q = 0; q < m; q++) {
              const d = V((r() - 0.5) * 0.7 - s.nx * 0.2, 1, (r() - 0.5) * 0.7 - s.nz * 0.2).normalize(), sz = 0.14 + r() * 0.12;
              WG.add(SH.crys(), MD(bx + (r() - 0.5) * 0.4, by - 0.1, bz + (r() - 0.5) * 0.4, d, sz, 0.5 + r() * 0.9, sz, r() * TAU), null, (x, y, z, nx, ny, nz, o2, lx, ly) => o2.copy(col(cc)).lerp(col('#ffffff'), clamp(ly * 0.6)));
            }
            HA.add(bx, by + 0.5, bz, 1.8, cc, 0.35);
          } else if (far && k < 0.8) { // icicles under the rim
            const m = 2 + Math.floor(r() * 4);
            for (let q = 0; q < m; q++) {
              const o = (r() - 0.5) * 1.0, L2 = 0.25 + r() * 0.5;
              WD.add(SH.cone(), M(fx + s.tx * o - s.nx * 0.12, s.h * 0.93, fz + s.tz * o - s.nz * 0.12, 0.05 + r() * 0.04, L2, 0.05 + r() * 0.04, Math.PI, 0, 0), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#dff0ff')).lerp(col('#9ab8f0'), clamp((s.h * 0.93 - y) / L2)));
            }
          } else if (far) { // frosty boulder
            WD.add(SH.rock(), M(fx - s.nx * 0.3, 0.15, fz - s.nz * 0.3, 0.35 + r() * 0.25, 0.3 + r() * 0.2, 0.35 + r() * 0.2, r(), r() * TAU, r()), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#6a5c9c')).lerp(col('#e4ecff'), clamp(ny * 1.4 - 0.4)));
          }
        }
      }
    }
  }
  timberFrame(A, B) { // two rough posts and a lintel propping up the mossy lip
    const WD = this.wallDeco, r = this.rng;
    const wood = (y0, y1) => (x, y, z, nx, ny, nz, o) => o.copy(col('#7a5034')).lerp(col('#a8744a'), clamp(0.5 + 0.5 * Math.sin(y * 9 + x * 3 + z * 2)) * 0.45 + clamp((y - y0) / Math.max(0.01, y1 - y0)) * 0.2);
    const hh = Math.min(A.h, B.h) * 0.78;
    const pts = [A, B].map(s => ({ x: s.x - s.nx * 0.42, z: s.z - s.nz * 0.42 }));
    for (const p of pts) {
      WD.add(SH.cyl6(), M(p.x, 0, p.z, 0.11, hh, 0.11, (r() - 0.5) * 0.05, r() * TAU, (r() - 0.5) * 0.05), null, wood(0, hh));
      WD.add(SH.cyl6(), M(p.x, 0, p.z, 0.15, 0.1, 0.15, 0, r() * TAU, 0), col('#5a3c28'));
    }
    const dx = pts[1].x - pts[0].x, dz = pts[1].z - pts[0].z, L = Math.hypot(dx, dz) || 1, d = V(dx / L, 0, dz / L);
    WD.add(SH.box(), MD(pts[0].x - d.x * 0.3, hh - 0.02, pts[0].z - d.z * 0.3, d, 0.24, L + 0.6, 0.2, Math.atan2(A.nx, A.nz)), null, wood(hh - 0.1, hh + 0.2));
    for (const p of pts) WD.add(SH.sphLo(), M(p.x - A.nx * 0.12, hh + 0.1, p.z - A.nz * 0.12, 0.05), col('#4a3a3a')); // iron pegs
    if (r() < 0.5) { // a lantern hooked on the lintel
      const mx = (pts[0].x + pts[1].x) / 2 - A.nx * 0.14, mz = (pts[0].z + pts[1].z) / 2 - A.nz * 0.14;
      WD.add(SH.cyl(), M(mx, hh - 0.3, mz, 0.01, 0.3, 0.01), col('#3a2a2a'));
      this.wallGlow.add(SH.sph(), M(mx, hh - 0.4, mz, 0.1, 0.12, 0.1), col('#ffd890'));
      WD.add(SH.cone(), M(mx, hh - 0.3, mz, 0.12, 0.08, 0.12), col('#4a3a3a'));
      this.halos.add(mx, hh - 0.4, mz, 1.2, '#ffc47a', 0.5, 1);
    }
  }
  critterDoor(s, addLight) { // round hobbit-style door of some burrow critter, with a lamp and a doormat
    const WD = this.wallDeco, WG = this.wallGlow, HA = this.halos, r = this.rng;
    const d = V(-s.nx, 0.12, -s.nz).normalize(), bx = s.x - s.nx * 0.3, bz = s.z - s.nz * 0.3, cy = 0.44;
    const dc = ['#5a8a6a', '#c8644a', '#4a6a9a', '#d8a040', '#8a5aa0'][Math.floor(r() * 5)];
    WD.add(SH.disc(), MD(bx - d.x * 0.02, cy, bz - d.z * 0.02, d, 0.42, 0.08, 0.42), null, (x, y, z, nx, ny, nz, o, lx, ly, lz) => { o.set(dc); if (Math.abs(Math.sin(lx * 10)) < 0.14) o.multiplyScalar(0.72); if (ly > 0.9 && Math.hypot(lx, lz) < 0.25) o.lerp(col('#ffffff'), 0.08); });
    WD.add(SH.torus(), MD(bx + d.x * 0.03, cy, bz + d.z * 0.03, d, 0.46, 0.46, 0.46), null, (x, y, z, nx, ny, nz, o) => o.copy(col('#7a5034')).lerp(col('#b07a4e'), clamp(ny * 0.5 + 0.5)));
    const tx = -d.z, tz = d.x;
    WD.add(SH.sphLo(), M(bx + d.x * 0.1 + tx * 0.22, cy - 0.02, bz + d.z * 0.1 + tz * 0.22, 0.045), col('#f4c04a'));
    WD.add(SH.box(), M(bx + d.x * 0.5, 0.005, bz + d.z * 0.5, 0.62, 0.025, 0.36, 0, Math.atan2(d.x, d.z), 0), null, (x, y, z, nx, ny, nz, o, lx) => o.set(Math.abs(Math.sin(lx * 18)) > 0.6 ? '#c8a060' : '#a8744a'));
    // tiny lamp on a bracket beside the door
    const lx = bx + d.x * 0.22 - tx * 0.55, lz = bz + d.z * 0.22 - tz * 0.55;
    WD.add(SH.cyl(), M(lx, 0.95, lz, 0.015, 0.14, 0.015), col('#3a2a2a'));
    WG.add(SH.sph(), M(lx, 0.88, lz, 0.08, 0.1, 0.08), col('#ffd890'));
    HA.add(lx, 0.88, lz, 1.1, '#ffc47a', 0.55, 1);
    if (r() < 0.6) addLight(lx + d.x * 0.5, 1.0, lz + d.z * 0.5, '#ffc47a', 4, 5, 0.6);
    this.flower(WD, bx + d.x * 0.35 + tx * 0.6, 0, bz + d.z * 0.35 + tz * 0.6, '#ffb8d0', 0.9);
  }
  shrinePost(s, face, hash, mid, addLight) {
    const WD = this.wallDeco, WG = this.wallGlow, HA = this.halos, r = this.rng;
    const px = s.x - s.nx * 0.14, pz = s.z - s.nz * 0.14, h = s.h;
    // red lacquered pillar with black foot and brass cap
    WD.add(SH.cyl(), M(px, 0, pz, 0.15, 0.3, 0.15), col('#2a2024'));
    WD.add(SH.cyl(), M(px, 0.3, pz, 0.12, h - 0.25, 0.12), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#d0382c')).multiplyScalar(0.85 + 0.15 * clamp(y / h)));
    WD.add(SH.cyl(), M(px, h + 0.02, pz, 0.14, 0.1, 0.14), col('#e8b848'));
    if (s.f < 0.15) return; // dressing only where the face is visible
    const mx = mid.x - mid.nx * 0.2, mz = mid.z - mid.nz * 0.2;
    if (hash < 0.3) { // hanging paper lantern (chochin) under the eave
      const ly = h - 0.75;
      WD.add(SH.cyl(), M(mx, ly + 0.28, mz, 0.008, 0.32, 0.008), col('#2a2020'));
      WG.add(SH.sph(), M(mx, ly, mz, 0.2, 0.27, 0.2, 0, face, 0), null, (x, y, z, nx, ny, nz, o2) => { o2.set('#ff6a48'); if (Math.abs(y - ly) > 0.2) o2.set('#2a1a1a'); else if (Math.abs(Math.sin((y - ly) * 60)) > 0.92) o2.multiplyScalar(0.7); });
      HA.add(mx, ly, mz, 1.5, '#ff9a5a', 0.6, 1);
      if (hash < 0.12) addLight(mx - mid.nx * 0.5, ly, mz - mid.nz * 0.5, '#ffae6a', 5, 6, 0.8);
    } else if (hash < 0.5) { // shimenawa rope with zigzag shide papers
      const n2 = 9, y0 = h - 0.55;
      const pts = [];
      for (let k = 0; k <= n2; k++) { const t = k / n2, o = (t - 0.5) * 2.1; pts.push({ p: V(mx + mid.tx * o, y0 - Math.sin(t * Math.PI) * 0.22, mz + mid.tz * o), r: 0.06 - Math.sin(t * Math.PI) * -0.02 }); }
      WD.addGeo(tube(pts, 6, false), mx, mz, null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#e8d49a')).multiplyScalar(0.85 + 0.15 * Math.sin(x * 40 + z * 40)));
      for (const t of [0.25, 0.5, 0.75]) {
        const o = (t - 0.5) * 2.1, bx = mx + mid.tx * o - mid.nx * 0.03, bz = mz + mid.tz * o - mid.nz * 0.03, by = y0 - Math.sin(t * Math.PI) * 0.22 - 0.08;
        for (let q = 0; q < 3; q++) WD.add(SH.box(), M(bx + mid.tx * (q % 2 ? 0.04 : -0.04), by - 0.08 - q * 0.1, bz + mid.tz * (q % 2 ? 0.04 : -0.04), 0.1, 0.11, 0.015, 0, face, (q % 2 ? 0.5 : -0.5)), col('#fffaf0'));
      }
    } else if (hash < 0.7) { // ofuda talismans
      for (let q = 0; q < 2; q++) WD.add(SH.box(), M(mx + mid.tx * (q - 0.5) * 0.35, h * 0.55 + q * 0.1, mz + mid.tz * (q - 0.5) * 0.35, 0.13, 0.36, 0.015, 0, face, (r() - 0.5) * 0.2), null, (x, y, z, nx, ny, nz, o2, lx, ly) => { o2.set('#fff4d8'); if (Math.abs(ly - 0.5) < 0.18 && Math.abs(Math.sin(ly * 40)) > 0.6) o2.set('#c83a2e'); });
    } else if (hash < 0.82) { // small stone lantern at the base
      this.toro(WD, WG, mx - mid.nx * 0.25, mz - mid.nz * 0.25, face, 0.7, true);
    }
  }
  kitchenPost(s, face, hash, mid, addLight) {
    const WD = this.wallDeco, WG = this.wallGlow, HA = this.halos, r = this.rng;
    const px = s.x - s.nx * 0.12, pz = s.z - s.nz * 0.12, h = s.h;
    WD.add(SH.box(), M(px, 0, pz, 0.22, h - 0.2, 0.2, 0, face, 0), null, (x, y, z, nx, ny, nz, o2) => o2.copy(col('#5a3a2a')).lerp(col('#7a5238'), clamp(Math.sin(y * 7 + x) * 0.5 + 0.5) * 0.4));
    if (s.f < 0.15) return;
    const mx = mid.x - mid.nx * 0.14, mz = mid.z - mid.nz * 0.14, tx = mid.tx, tz = mid.tz, ox = -mid.nx, oz = -mid.nz;
    if (hash < 0.38) { // shelf with jars, pots and bottles
      const sy = 1.2 + r() * 0.2;
      WD.add(SH.box(), M(mx + ox * 0.14, sy, mz + oz * 0.14, 1.9, 0.07, 0.36, 0, face, 0), col('#8a5a3a'));
      for (const o of [-0.7, 0.7]) WD.add(SH.box(), M(mx + tx * o + ox * 0.06, sy - 0.2, mz + tz * o + oz * 0.06, 0.05, 0.2, 0.16, 0, face, 0), col('#6a4a30'));
      let o = -0.8;
      while (o < 0.75) {
        const k = r(), x = mx + tx * o + ox * 0.16, z = mz + tz * o + oz * 0.16;
        if (k < 0.45) { const c2 = ['#e8a838', '#8ac05a', '#d04a4a', '#f0e0c0'][Math.floor(r() * 4)], hh = 0.22 + r() * 0.12; this.jar(WD, x, sy + 0.035, z, hh, c2); o += 0.26; }
        else if (k < 0.7) { const c2 = ['#5aa878', '#7a5ac8', '#c86a3a'][Math.floor(r() * 3)]; WD.add(SH.cyl(), M(x, sy + 0.035, z, 0.055, 0.22, 0.055), col(c2)); WD.add(SH.cyl(), M(x, sy + 0.25, z, 0.022, 0.1, 0.022), col(c2)); WD.add(SH.cyl(), M(x, sy + 0.34, z, 0.028, 0.04, 0.028), col('#8a5a3a')); o += 0.18; }
        else { WD.add(SH.sph(), M(x, sy + 0.14, z, 0.14, 0.12, 0.14), col('#b0643e')); WD.add(SH.cyl(), M(x, sy + 0.2, z, 0.09, 0.05, 0.09), col('#8a4a2e')); o += 0.32; }
      }
    } else if (hash < 0.75) { // hanging kitchen things from a rail
      const ry = h - 0.45;
      const rail = tube([{ p: V(mx - tx * 1.0 + ox * 0.14, ry, mz - tz * 1.0 + oz * 0.14), r: 0.025 }, { p: V(mx + tx * 1.0 + ox * 0.14, ry, mz + tz * 1.0 + oz * 0.14), r: 0.025 }], 5, false);
      WD.addGeo(rail, mx, mz, col('#4a4040'));
      let o = -0.8;
      while (o < 0.8) {
        const k = r(), x = mx + tx * o + ox * 0.16, z = mz + tz * o + oz * 0.16;
        if (k < 0.28) { // ladle / spoon
          WD.add(SH.cyl(), M(x, ry - 0.55, z, 0.018, 0.55, 0.018), col('#8a6a4a'));
          WD.add(SH.hemi(), M(x, ry - 0.55, z, 0.09, -0.07, 0.09), col(r() < 0.5 ? '#b8b0a8' : '#9a6a44'));
          o += 0.22;
        } else if (k < 0.5) { // garlic braid
          for (let q = 0; q < 5; q++) WD.add(SH.sph(), M(x + (q % 2 ? 0.05 : -0.05), ry - 0.1 - q * 0.11, z, 0.075, 0.07, 0.075), null, (px2, py, pz2, nx, ny, nz, o2) => o2.copy(col('#fff6ec')).lerp(col('#d8b8d8'), clamp(-ny * 0.5 + 0.3)));
          o += 0.25;
        } else if (k < 0.75) { // sausage string sagging to the next hook
          const m2 = 4, pts = [];
          for (let q = 0; q < m2; q++) { const t = q / (m2 - 1), oo = o + t * 0.5; pts.push([mx + tx * oo + ox * 0.18, ry - 0.08 - Math.sin(t * Math.PI) * 0.22, mz + tz * oo + oz * 0.18]); }
          for (const [x2, y2, z2] of pts) WD.add(SH.sph(), M(x2, y2, z2, 0.085, 0.07, 0.07, 0, face + Math.PI / 2, 0), null, (a, b, c, nx, ny, nz, o2) => o2.copy(col('#c8645a')).lerp(col('#e89078'), clamp(ny * 0.5 + 0.5)));
          o += 0.62;
        } else { // chili string
          for (let q = 0; q < 5; q++) WD.add(SH.cone(), M(x + (q % 2 ? 0.04 : -0.04), ry - 0.12 - q * 0.1, z, 0.04, 0.14, 0.04, Math.PI, 0, (q % 2 ? 0.3 : -0.3)), col('#e0302a'));
          o += 0.2;
        }
      }
    } else if (hash < 0.87) { // little stove niche glowing from inside
      WD.add(SH.rbox(), M(mx + ox * 0.18, 0, mz + oz * 0.18, 1.0, 0.9, 0.4, 0, face, 0), col('#3a302e'));
      WG.add(SH.hemi(), M(mx + ox * 0.36, 0.28, mz + oz * 0.36, 0.3, 0.26, 0.05, Math.PI / 2, face, 0), col('#ff8a3a'));
      HA.add(mx + ox * 0.5, 0.35, mz + oz * 0.5, 1.6, '#ff8a3a', 0.6, 1);
      if (hash < 0.8) addLight(mx + ox * 0.9, 0.6, mz + oz * 0.9, '#ff9a4a', 5, 6, 1.2);
    }
  }
  // ------------------------------------------------------------------ small prop kit (all append into batches)
  tuft(b, x, y, z, s = 1, c0 = '#6a9448', c1 = '#aac47c') {
    const r = this.rng, m = 5 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + r() * 0.5, lean = 0.25 + r() * 0.35, hh = (0.22 + r() * 0.18) * s;
      b.add(SH.cone(), M(x + Math.cos(a) * 0.05 * s, y, z + Math.sin(a) * 0.05 * s, 0.035 * s, hh, 0.02 * s, Math.cos(a) * lean, 0, -Math.sin(a) * lean), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col(c0)).lerp(col(c1), clamp(ly)));
    }
  }
  flower(b, x, y, z, c, s = 1) {
    b.add(SH.cyl(), M(x, y, z, 0.012 * s, 0.22 * s, 0.012 * s), col('#5a9a40'));
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; b.add(SH.sphLo(), M(x + Math.cos(a) * 0.045 * s, y + 0.23 * s, z + Math.sin(a) * 0.045 * s, 0.04 * s, 0.018 * s, 0.04 * s), col(c)); }
    b.add(SH.sphLo(), M(x, y + 0.235 * s, z, 0.025 * s), col('#ffd84a'));
  }
  mushrooms(b, x, y, z, cap, s, halos) {
    const r = this.rng, m = 2 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const k = i ? 0.55 + r() * 0.35 : 1, a = r() * TAU, d = i ? 0.12 + r() * 0.12 : 0, px = x + Math.cos(a) * d * s, pz = z + Math.sin(a) * d * s, hh = 0.3 * s * k;
      b.add(SH.taper(), M(px, y, pz, 0.05 * s * k, hh, 0.05 * s * k), col('#fff4e0'));
      b.add(SH.hemi(), M(px, y + hh * 0.92, pz, 0.17 * s * k, 0.13 * s * k, 0.17 * s * k), null, (qx, qy, qz, nx, ny, nz, o) => { o.copy(col(cap)); if (Math.sin(qx * 70) * Math.sin(qz * 70) > 0.55 && ny > 0.4) o.set('#ffffff'); });
    }
    halos?.add(x, y + 0.35 * s, z, 1.3 * s, cap, 0.5);
  }
  jar(b, x, y, z, h, c) {
    b.add(SH.cyl(), M(x, y, z, 0.085, h, 0.085), null, (px, py, pz, nx, ny, nz, o) => { o.copy(col(c)); if (Math.abs(py - y - h * 0.45) < h * 0.16) o.set('#fff4e0'); });
    b.add(SH.cyl(), M(x, y + h, z, 0.095, 0.05, 0.095), col('#8a5a3a'));
    b.add(SH.sphLo(), M(x, y + h + 0.05, z, 0.05, 0.03, 0.05), col('#e8d0a0'));
  }
  toro(b, g, x, z, face, s = 1, lightUp = false, fire = '#ffb85a') { // stone lantern
    const st = '#a8a2a6', dk = '#8a8488';
    b.add(SH.cyl6(), M(x, 0, z, 0.22 * s, 0.1 * s, 0.22 * s, 0, face, 0), col(dk));
    b.add(SH.cyl6(), M(x, 0.1 * s, z, 0.07 * s, 0.5 * s, 0.07 * s, 0, face, 0), col(st));
    b.add(SH.cyl6(), M(x, 0.6 * s, z, 0.2 * s, 0.07 * s, 0.2 * s, 0, face, 0), col(dk));
    g.add(SH.box(), M(x, 0.67 * s, z, 0.24 * s, 0.22 * s, 0.24 * s, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(Math.abs(ny) > 0.5 ? '#6a5a50' : fire));
    b.add(SH.cone4(), M(x, 0.89 * s, z, 0.3 * s, 0.22 * s, 0.3 * s, 0, face + Math.PI / 4, 0), col(dk));
    b.add(SH.sphLo(), M(x, 1.12 * s, z, 0.05 * s), col(st));
    if (lightUp) this.halos.add(x, 0.78 * s, z, 1.2 * s, '#ffb060', 0.5, 1);
  }
  // ------------------------------------------------------------------ floor clutter
  buildProps() {
    const th = this.th, r = this.rng, B = this.solid, GL = this.glow, HA = this.halos;
    for (const p of this.L.props) {
      const wp = this.cellToWorld(p.x, p.y);
      const wl = Math.hypot(p.wx, p.wy) || 1, dx = p.wx / wl, dz = p.wy / wl; // toward the wall
      const hug = p.kind === 'floor' ? 0 : p.kind === 'corner' ? 0.45 : 0.4;
      const x = wp.x + dx * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6), z = wp.z + dz * hug * CELL * 0.5 + (r() - 0.5) * (p.kind === 'floor' ? 1.0 : 0.6);
      const face = p.kind === 'floor' ? r() * TAU : Math.atan2(-dx, -dz) + (r() - 0.5) * 0.6;
      const big = p.big, k = p.r;
      const collide = (rad, ox = 0, oz = 0) => this.collision.addCircle(x + ox, z + oz, rad);
      if (th === 'burrow') {
        if (p.kind === 'corner') {
          if (k < 0.4) { this.mushrooms(GL, x, 0, z, k < 0.2 ? '#8ad8ff' : '#ff9ad0', 1.6, HA); this.mossRock(B, x + 0.4, z - 0.3, 0.35); this.tuft(B, x - 0.35, 0, z + 0.3, 1.1); }
          else if (k < 0.7 && big) { this.log(B, x, z, face + Math.PI / 2); collide(0.5); }
          else { this.mossRock(B, x, z, 0.55); this.mossRock(B, x + 0.45, z + 0.2, 0.3); this.flower(B, x - 0.4, 0, z + 0.2, '#ffb8d0'); if (big) collide(0.5); }
        } else if (p.kind === 'edge') {
          if (k < 0.22) this.mushrooms(GL, x, 0, z, r() < 0.6 ? '#8ad8ff' : '#ffb0e0', 1 + r() * 0.5, HA);
          else if (k < 0.42) { this.tuft(B, x, 0, z, 1 + r() * 0.4); if (r() < 0.7) this.flower(B, x + 0.2, 0, z + 0.1, ['#ffb8d0', '#fff0a0', '#ffffff', '#c8b0ff'][Math.floor(r() * 4)]); }
          else if (k < 0.56) this.pebbles(B, x, z, '#a89a90');
          else if (k < 0.68) this.bone(B, x, z, face);
          else if (k < 0.8) { this.acorns(B, x, z); }
          else if (k < 0.9 && big) { this.mossRock(B, x, z, 0.4 + r() * 0.2); collide(0.35); }
          else this.sprout(B, x, z);
        } else {
          if (k < 0.35) { this.tuft(B, x, 0, z, 1.2); this.flower(B, x + 0.15, 0, z - 0.1, '#fff0a0'); this.flower(B, x - 0.1, 0, z + 0.15, '#ffb8d0', 0.8); }
          else if (k < 0.6) this.pebbles(B, x, z, '#a89a90');
          else if (k < 0.8) this.sprout(B, x, z);
          else this.mushrooms(GL, x, 0, z, '#8ad8ff', 0.9, HA);
        }
      } else if (th === 'crystal') {
        if (p.kind === 'corner') {
          this.crystalCluster(GL, x, z, k < 0.5 ? '#ff8ae0' : '#7af0ff', 1.4 + r() * 0.6); this.frostRock(B, x + 0.5, z - 0.3, 0.35);
          if (big) collide(0.55);
        } else if (p.kind === 'edge') {
          if (k < 0.35) this.crystalCluster(GL, x, z, ['#ff8ae0', '#7af0ff', '#c8a8ff'][Math.floor(r() * 3)], 0.8 + r() * 0.5);
          else if (k < 0.55) { this.frostRock(B, x, z, 0.3 + r() * 0.25); if (big) collide(0.35); }
          else if (k < 0.7) this.geode(B, GL, x, z, face);
          else if (k < 0.85) this.snowMound(B, x, z);
          else this.pebbles(B, x, z, '#8a80b8');
        } else {
          if (k < 0.5) this.crystalCluster(GL, x, z, '#b8f4ff', 0.7);
          else this.pebbles(B, x, z, '#9a90c8');
        }
      } else if (th === 'shrine') {
        if (p.kind === 'corner') {
          if (k < 0.35 && big) { this.sakeStack(B, x, z, face); collide(0.6); }
          else if (k < 0.6) { this.offering(B, x, z, face); if (big) collide(0.35); }
          else if (k < 0.8) { this.toro(B, GL, x, z, face, 1, true); if (big) collide(0.3); }
          else { this.foxStatue(B, x, z, face); if (big) collide(0.3); }
        } else if (p.kind === 'edge') {
          if (k < 0.2) this.scrolls(B, x, z, face);
          else if (k < 0.38) this.cushion(B, x, z, face);
          else if (k < 0.52 && big) { this.sakeBarrel(B, x, 0, z, face, 0.9); collide(0.35); }
          else if (k < 0.66) this.vase(B, x, z);
          else if (k < 0.8 && big) { this.lanternStand(B, GL, x, z); collide(0.2); }
          else this.scrolls(B, x, z, face);
        } else {
          if (k < 0.5) this.cushion(B, x, z, face); else this.scrolls(B, x, z, face);
        }
      } else { // kitchen
        if (p.kind === 'corner') {
          if (k < 0.4 && big) { this.barrel(B, x, 0, z, face); this.barrel(B, x - dz * 0.72, 0, z + dx * 0.72, face + 1); this.sack(B, x + dz * 0.6 - dx * 0.35, z - dx * 0.6 - dz * 0.35, face); collide(0.7); }
          else if (k < 0.7 && big) { this.crate(B, x, 0, z, face, 0.7); this.crate(B, x + (r() - 0.5) * 0.1, 0.7, z, face + 0.3, 0.55); this.sack(B, x - dz * 0.7, z + dx * 0.7, face); collide(0.6); }
          else { this.sack(B, x, z, face); this.sack(B, x + dz * 0.55, z - dx * 0.55, face + 0.7); this.veggieBasket(B, x - dz * 0.5 - dx * 0.2, z + dx * 0.5 - dz * 0.2); if (big) collide(0.5); }
        } else if (p.kind === 'edge') {
          if (k < 0.18 && big) { this.barrel(B, x, 0, z, face); collide(0.4); }
          else if (k < 0.33) this.sack(B, x, z, face);
          else if (k < 0.46 && big) { this.crate(B, x, 0, z, face, 0.6); collide(0.4); }
          else if (k < 0.58) this.potStack(B, x, z);
          else if (k < 0.7) { this.stool(B, x, z); }
          else if (k < 0.82) this.veggieBasket(B, x, z);
          else if (k < 0.92) this.bottles(B, x, z);
          else this.cheese(B, x, z);
        } else {
          if (k < 0.4) this.stool(B, x, z); else if (k < 0.7) this.veggieBasket(B, x, z); else this.potStack(B, x, z);
        }
      }
    }
  }
  mossRock(b, x, z, s) { const r = this.rng; b.add(SH.ico(), M(x, s * 0.25, z, s, s * (0.6 + r() * 0.3), s * (0.8 + r() * 0.3), r(), r() * TAU, r() * 0.3), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#a09084')).lerp(col('#7c9a5a'), clamp(ny * 1.8 - 0.5)).lerp(col('#a8bc80'), clamp(ny * 2 - 1.4))); }
  pebbles(b, x, z, c) { const r = this.rng; for (let i = 0; i < 4 + r() * 3; i++) { const s = 0.06 + r() * 0.08; b.add(SH.sphLo(), M(x + (r() - 0.5) * 0.7, s * 0.3, z + (r() - 0.5) * 0.7, s, s * 0.6, s * 0.85, 0, r() * 3, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col(c)).multiplyScalar(0.8 + ny * 0.3)); } }
  bone(b, x, z, face) {
    const ca = Math.cos(face), sa = Math.sin(face), L2 = 0.26;
    b.add(SH.cyl(), M(x, 0.06, z, 0.045, L2 * 2, 0.045, 0, face, Math.PI / 2), col('#fff4e4'));
    for (const e of [-1, 1]) for (const s2 of [-1, 1]) b.add(SH.sphLo(), M(x + ca * e * L2 + sa * s2 * 0.05, 0.07, z - sa * e * L2 + ca * s2 * 0.05, 0.07), col('#fff8ee'));
  }
  acorns(b, x, z) { const r = this.rng; for (let i = 0; i < 3 + r() * 3; i++) { const ax = x + (r() - 0.5) * 0.5, az = z + (r() - 0.5) * 0.5, ry = r() * 3; b.add(SH.sphLo(), M(ax, 0.07, az, 0.06, 0.08, 0.06, 0.4, ry, 0), col('#b07038')); b.add(SH.hemi(), M(ax, 0.1, az, 0.068, 0.05, 0.068, 0.4, ry, 0), col('#6a4a2a')); } }
  sprout(b, x, z) { b.add(SH.cyl(), M(x, 0, z, 0.015, 0.16, 0.015), col('#6ab04c')); for (const s of [-1, 1]) b.add(SH.sphLo(), M(x + s * 0.07, 0.17, z, 0.07, 0.02, 0.04, 0, 0, s * 0.4), col('#8ad060')); }
  log(b, x, z, ang) {
    const r = this.rng, L2 = 1.3 + r() * 0.4;
    b.add(SH.cyl(), M(x, 0.25, z, 0.24, L2, 0.24, 0, ang, Math.PI / 2), null, (px, py, pz, nx, ny, nz, o) => { o.copy(col('#7a5236')).multiplyScalar(0.85 + 0.15 * Math.sin((px + pz) * 22)); if (ny > 0.6) o.lerp(col('#6aa04e'), 0.7); if (Math.abs(nx * Math.cos(ang) - nz * Math.sin(ang)) > 0.95) o.set('#d8b080'); });
    this.mushrooms(this.glow, x + Math.cos(ang) * 0.3, 0.4, z - Math.sin(ang) * 0.3, '#ffb0d8', 0.6, this.halos);
  }
  crystalCluster(b, x, z, c, s) {
    const r = this.rng, m = 3 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const d = V((r() - 0.5) * (i ? 0.9 : 0.2), 1, (r() - 0.5) * (i ? 0.9 : 0.2)).normalize(), sz = (i ? 0.08 + r() * 0.06 : 0.14) * s;
      b.add(SH.crys(), MD(x + (r() - 0.5) * 0.25 * s, -0.05, z + (r() - 0.5) * 0.25 * s, d, sz, (i ? 0.35 + r() * 0.35 : 0.8) * s, sz, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col(c)).lerp(col('#ffffff'), clamp(ly * 0.55 + ny * 0.15)));
    }
    this.halos.add(x, 0.45 * s, z, 1.5 * s, c, 0.45);
  }
  frostRock(b, x, z, s) { const r = this.rng; b.add(SH.rock(), M(x, s * 0.35, z, s, s * (0.7 + r() * 0.4), s * (0.8 + r() * 0.3), r(), r() * TAU, r() * 0.4), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#6a5a9c')).lerp(col('#eef4ff'), clamp(ny * 1.5 - 0.5))); }
  geode(b, g, x, z, face) { b.add(SH.hemi(), M(x, 0, z, 0.36, 0.3, 0.36, -0.6, face, 0), col('#5a4a7a')); for (let i = 0; i < 4; i++) g.add(SH.crys(), MD(x + Math.sin(face) * 0.12 + (this.rng() - 0.5) * 0.2, 0.08, z + Math.cos(face) * 0.12 + (this.rng() - 0.5) * 0.2, V(Math.sin(face) * 0.6, 1, Math.cos(face) * 0.6).normalize(), 0.06, 0.28, 0.06, i), col('#c8a8ff')); this.halos.add(x, 0.3, z, 1, '#c8a8ff', 0.4); }
  snowMound(b, x, z) { const r = this.rng; for (let i = 0; i < 3; i++) b.add(SH.sphLo(), M(x + (r() - 0.5) * 0.5, 0, z + (r() - 0.5) * 0.5, 0.25 + r() * 0.15, 0.14 + r() * 0.06, 0.25 + r() * 0.15), col('#eef4ff')); }
  sakeBarrel(b, x, y, z, face, s = 1) {
    b.add(SH.barrel(), M(x, y, z, 0.32 * s, 0.62 * s, 0.32 * s, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      o.set('#e8d8a8'); if (Math.abs(ly - 0.14) < 0.05 || Math.abs(ly - 0.86) < 0.05) o.set('#3a2a3a');
      const a = Math.atan2(lx, lz); if (Math.abs(a) < 0.55 && ly > 0.3 && ly < 0.7) { o.set('#c8323a'); if (Math.abs(a) < 0.3 && Math.abs(ly - 0.5) < 0.12) o.set('#fff4d8'); }
      if (ny > 0.9) o.set('#c89868');
    });
  }
  sakeStack(b, x, z, face) { const ca = Math.cos(face), sa = Math.sin(face); this.sakeBarrel(b, x + ca * 0.34, 0, z - sa * 0.34, face); this.sakeBarrel(b, x - ca * 0.34, 0, z + sa * 0.34, face); this.sakeBarrel(b, x, 0.62, z, face); }
  offering(b, x, z, face) {
    b.add(SH.box(), M(x, 0, z, 0.42, 0.22, 0.42, 0, face, 0), col('#d8b888'));
    b.add(SH.box(), M(x, 0.22, z, 0.5, 0.05, 0.5, 0, face, 0), col('#e8c898'));
    b.add(SH.sph(), M(x, 0.33, z, 0.17, 0.08, 0.17), col('#fffaf4'));
    b.add(SH.sph(), M(x, 0.43, z, 0.13, 0.07, 0.13), col('#fffaf4'));
    b.add(SH.sph(), M(x, 0.53, z, 0.07), col('#ff9a2a'));
    b.add(SH.sphLo(), M(x + 0.03, 0.6, z, 0.04, 0.015, 0.025), col('#5aa040'));
  }
  foxStatue(b, x, z, face) {
    const ca = Math.sin(face), sa = Math.cos(face);
    b.add(SH.box(), M(x, 0, z, 0.4, 0.26, 0.4, 0, face, 0), col('#9a949c'));
    b.add(SH.sph(), M(x, 0.46, z, 0.17, 0.22, 0.15), col('#fff8f0'));
    b.add(SH.sph(), M(x + ca * 0.05, 0.74, z + sa * 0.05, 0.13, 0.12, 0.13), col('#fff8f0'));
    b.add(SH.cone(), M(x + ca * 0.16, 0.7, z + sa * 0.16, 0.05, 0.1, 0.05, Math.PI / 2, face, 0), col('#fff8f0'));
    for (const e of [-1, 1]) b.add(SH.cone(), M(x + Math.cos(face) * e * 0.08, 0.82, z - Math.sin(face) * e * 0.08, 0.045, 0.14, 0.045), col('#fff8f0'));
    b.add(SH.cone(), M(x + ca * 0.1, 0.52, z + sa * 0.1, 0.13, 0.14, 0.1, Math.PI, face, 0), col('#d8322e'));
    b.add(SH.sph(), M(x - ca * 0.16, 0.44, z - sa * 0.16, 0.08, 0.22, 0.08, 0.5, face, 0), col('#fff8f0'));
  }
  scrolls(b, x, z, face) {
    const r = this.rng, m = 1 + Math.floor(r() * 3);
    for (let i = 0; i < m; i++) {
      const a = face + Math.PI / 2 + (r() - 0.5) * 0.8, sx = x + (r() - 0.5) * 0.4, sz = z + (r() - 0.5) * 0.4, y = i === 2 ? 0.14 : 0.07, cc = r() < 0.5 ? '#fff0d0' : '#e8d8b0';
      b.add(SH.cyl(), M(sx, y, sz, 0.065, 0.5, 0.065, 0, a, Math.PI / 2), null, (px, py, pz, nx, ny, nz, o, lx, ly) => { o.set(cc); if (Math.abs(ly - 0.5) < 0.06) o.set('#c8323a'); if (ly < 0.04 || ly > 0.96) o.set('#6a4a30'); });
    }
  }
  cushion(b, x, z, face) { const cc = ['#8a4ac0', '#d8425a', '#3a6aa8'][Math.floor(this.rng() * 3)]; b.add(SH.rbox(), M(x, 0, z, 0.62, 0.12, 0.62, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col(cc)).multiplyScalar(ny > 0.5 ? 1 : 0.8)); b.add(SH.sphLo(), M(x, 0.12, z, 0.04), col('#ffd24a')); }
  vase(b, x, z) { b.add(SH.barrel(), M(x, 0, z, 0.14, 0.34, 0.14), col('#3a6a8a')); for (let i = 0; i < 4; i++) { const a = i * 1.7; b.add(SH.cyl(), M(x + Math.cos(a) * 0.03, 0.3, z + Math.sin(a) * 0.03, 0.012, 0.35 + i * 0.06, 0.012, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), col('#5a9a40')); b.add(SH.sphLo(), M(x + Math.cos(a) * 0.1, 0.66 + i * 0.05, z + Math.sin(a) * 0.1, 0.05), col(i % 2 ? '#ffb8d0' : '#ffffff')); } }
  lanternStand(b, g, x, z) {
    b.add(SH.cyl(), M(x, 0, z, 0.04, 1.2, 0.04), col('#3a2828'));
    b.add(SH.box(), M(x, 0, z, 0.3, 0.06, 0.3), col('#3a2828'));
    g.add(SH.sph(), M(x, 1.25, z, 0.19, 0.24, 0.19), null, (px, py, pz, nx, ny, nz, o) => { o.set('#ff6a48'); if (Math.abs(py - 1.25) > 0.19) o.set('#2a1a1a'); });
    this.halos.add(x, 1.25, z, 1.6, '#ff9a5a', 0.6, 1);
  }
  barrel(b, x, y, z, face) {
    b.add(SH.barrel(), M(x, y, z, 0.33, 0.8, 0.33, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      o.copy(col('#a06a40')).multiplyScalar(0.85 + 0.15 * (Math.sin(Math.atan2(lx, lz) * 7) > 0.8 ? 0.4 : 1));
      if (Math.abs(ly - 0.2) < 0.04 || Math.abs(ly - 0.8) < 0.04) o.set('#5a5058');
      if (ny > 0.9) o.set('#c09060');
    });
  }
  crate(b, x, y, z, face, s) {
    b.add(SH.box(), M(x, y, z, s, s, s, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      const e = Math.max(Math.abs(lx), Math.abs(lz)) > 0.42 && (Math.abs(ly - 0.5) > 0.42 || Math.min(Math.abs(Math.abs(lx) - 0.5), Math.abs(Math.abs(lz) - 0.5)) < 0.08);
      o.set(e ? '#8a5a36' : '#c8925a'); if (Math.abs(ly - 0.5) < 0.05) o.set('#8a5a36');
    });
  }
  sack(b, x, z, face) {
    const r = this.rng, s = 0.9 + r() * 0.2;
    b.add(SH.sph(), M(x, 0.26 * s, z, 0.3 * s, 0.3 * s, 0.26 * s, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set('#e8dcc0'); if (ly < -0.6) o.multiplyScalar(0.85); if (Math.abs(lx) < 0.35 && Math.abs(ly) < 0.3 && lz > 0.6) o.set('#c8a878'); });
    b.add(SH.cone(), M(x, 0.5 * s, z, 0.12 * s, 0.16 * s, 0.12 * s, Math.PI, face, 0), col('#e0d2b4'));
    b.add(SH.torus(), M(x, 0.52 * s, z, 0.07 * s, 0.1, 0.07 * s), col('#a0643a'));
    b.add(SH.sphLo(), M(x, 0.62 * s, z, 0.1 * s, 0.05 * s, 0.1 * s), col('#e8dcc0'));
  }
  potStack(b, x, z) {
    b.add(SH.cyl(), M(x, 0, z, 0.28, 0.28, 0.28), col('#5a5660')); b.add(SH.torus(), M(x, 0.28, z, 0.27, 0.12, 0.27), col('#6a6670'));
    b.add(SH.cyl(), M(x + 0.04, 0.3, z, 0.22, 0.05, 0.22), col('#7a7680'));
    b.add(SH.cyl(), M(x + 0.3, 0, z + 0.2, 0.2, 0.04, 0.2), col('#3a3640'));
    b.add(SH.cyl(), M(x + 0.55, 0.03, z + 0.3, 0.025, 0.3, 0.025, 0, 0, Math.PI / 2), col('#6a4a30'));
  }
  stool(b, x, z) { b.add(SH.disc(), M(x, 0.42, z, 0.24, 0.07, 0.24), col('#b07a48')); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; b.add(SH.cyl(), M(x + Math.cos(a) * 0.15, 0, z + Math.sin(a) * 0.15, 0.03, 0.43, 0.03, -Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12), col('#8a5a36')); } }
  veggieBasket(b, x, z) {
    const r = this.rng;
    b.add(SH.cyl(), M(x, 0, z, 0.28, 0.24, 0.28), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#c89858')).multiplyScalar(Math.sin(py * 60) > 0 ? 1 : 0.8));
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = r() * 0.14, vx = x + Math.cos(a) * d, vz = z + Math.sin(a) * d, k = r();
      if (k < 0.35) { b.add(SH.cone(), M(vx, 0.18, vz, 0.05, 0.3, 0.05, 0.9 * Math.cos(a), 0, 0.9 * Math.sin(a)), col('#ff8a2a')); }
      else if (k < 0.7) b.add(SH.sph(), M(vx, 0.26, vz, 0.09), col(r() < 0.5 ? '#c8528a' : '#f4e8c8'));
      else { b.add(SH.cyl(), M(vx, 0.14, vz, 0.05, 0.34, 0.05, 0.6 * Math.cos(a), 0, 0.6 * Math.sin(a)), col('#fffaf0')); }
    }
    b.add(SH.sphLo(), M(x, 0.3, z, 0.08, 0.04, 0.08), col('#6ab04c'));
  }
  bottles(b, x, z) { const r = this.rng; for (let i = 0; i < 3; i++) { const bx = x + (r() - 0.5) * 0.4, bz = z + (r() - 0.5) * 0.4, c2 = ['#4a8a5a', '#8a3a5a', '#3a6a9a'][i]; b.add(SH.cyl(), M(bx, 0, bz, 0.07, 0.28, 0.07), col(c2)); b.add(SH.cyl(), M(bx, 0.28, bz, 0.025, 0.12, 0.025), col(c2)); b.add(SH.cyl(), M(bx, 0.4, bz, 0.03, 0.04, 0.03), col('#c89868')); } }
  cheese(b, x, z) { b.add(SH.disc(), M(x, 0, z, 0.3, 0.18, 0.3), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.5 ? '#ffd86a' : '#f4c040')); b.add(SH.disc(), M(x + 0.35, 0, z + 0.1, 0.18, 0.12, 0.18), col('#ffd86a')); }
  // ------------------------------------------------------------------ light fixtures
  buildLights() {
    const T = this.theme, th = this.th, B = this.solid, GL = this.glow, HA = this.halos, at = this.L.at;
    for (const l of this.L.lights) {
      const wp = this.cellToWorld(l.x, l.y);
      let dx = (at(l.x + 1, l.y) ? 0 : 1) - (at(l.x - 1, l.y) ? 0 : 1), dz = (at(l.x, l.y + 1) ? 0 : 1) - (at(l.x, l.y - 1) ? 0 : 1);
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const x = wp.x + dx * 0.45, z = wp.z + dz * 0.45, face = Math.atan2(-dx, -dz);
      let fy = 1.25, flame = true;
      if (th === 'burrow') { // lantern hung from a crooked branch post
        B.add(SH.cyl(), M(x, 0, z, 0.07, 1.5, 0.07, 0.05, 0, 0.05), col('#6a4a34'));
        B.add(SH.cyl(), M(x, 1.45, z, 0.04, 0.45, 0.04, 0, face, 1.3), col('#6a4a34'));
        const lx = x - dx * 0.36, lz = z - dz * 0.36;
        B.add(SH.cyl(), M(lx, 1.02, lz, 0.13, 0.05, 0.13), col('#4a3a3a'));
        GL.add(SH.sph(), M(lx, 1.15, lz, 0.13, 0.16, 0.13), col('#ffd890'));
        B.add(SH.cone(), M(lx, 1.27, lz, 0.16, 0.12, 0.16), col('#4a3a3a'));
        fy = 1.15; flame = false; HA.add(lx, fy, lz, 1.8, T.light, 0.65, 1);
        this.lightPool.addSource({ pos: V(lx, 1.5, lz), color: C(T.light), intensity: T.lightI ?? 12, radius: 11, flicker: 1 });
        this.collision.addCircle(x, z, 0.25);
        this.tuft(B, x + 0.15, 0, z + 0.1, 0.9);
        continue;
      } else if (th === 'crystal') { // glowing crystal on a rock pedestal
        B.add(SH.rock(), M(x, 0.2, z, 0.35, 0.35, 0.3, 0.3, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#5a4a8a')).lerp(col('#e4ecff'), clamp(ny * 1.4 - 0.5)));
        GL.add(SH.crys(), MD(x, 0.35, z, V(0, 1, 0), 0.16, 1.0, 0.16, 0.3), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col('#7ae8ff')).lerp(col('#ffffff'), clamp(ly * 0.6)));
        GL.add(SH.crys(), MD(x + 0.12, 0.3, z - 0.05, V(0.4, 1, -0.1).normalize(), 0.09, 0.55, 0.09, 1), col('#b8f4ff'));
        fy = 1.0; flame = false; HA.add(x, fy, z, 2.2, T.light, 0.6);
      } else if (th === 'shrine') { this.toro(B, GL, x, z, face, 1.25); fy = 0.95; flame = false; HA.add(x, fy, z, 1.8, T.light, 0.6, 1); }
      else { // iron brazier with coals
        for (let i = 0; i < 3; i++) { const a = face + i / 3 * TAU; B.add(SH.cyl(), M(x + Math.cos(a) * 0.2, 0, z + Math.sin(a) * 0.2, 0.03, 0.85, 0.03, -Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2), col('#3a3438')); }
        B.add(SH.hemi(), M(x, 0.95, z, 0.3, -0.2, 0.3), col('#4a4448'));
        B.add(SH.torus(), M(x, 0.95, z, 0.3, 0.3, 0.3), col('#5a5458'));
        GL.add(SH.sphLo(), M(x, 0.92, z, 0.24, 0.08, 0.24), col('#ff7a2a'));
        fy = 1.12;
      }
      this.lightPool.addSource({ pos: V(x, 1.5, z), color: C(T.light), intensity: T.lightI ?? 12, radius: 11, flicker: 1 });
      this.collision.addCircle(x, z, 0.3);
      if (flame) { HA.add(x, fy, z, 1.4, T.light, 1, 1.5); this.flames.push({ p: V(x, fy, z) }); }
    }
  }
  buildShafts() {
    const { rooms } = this.L, r = this.rng, SB = this.shaftBatch;
    const col2 = C(this.theme.accent).lerp(C('#ffffff'), 0.55).getHexString();
    const beam = (x, z, n, w0, w1, base0, base1, poolR, poolA) => {
      for (let i = 0; i < n; i++) SB.add(x + (r() - 0.5) * 1.5, z + (r() - 0.5) * 1.5, w0 + r() * w1, 11, 0.28, r() * TAU, 0.18, base0 + r() * base1, r() * 10);
      this.floorGlows.add(x, 0.04, z, poolR, '#' + col2, poolA);
    };
    for (const rm of rooms) {
      if (r() < 0.45 || rm.kind === 'boss') continue;
      const wp = this.cellToWorld(rm.cx + Math.floor((r() - 0.5) * rm.w * 0.5), rm.cy + Math.floor((r() - 0.5) * rm.h * 0.5));
      beam(wp.x, wp.z, 3, 1.6, 1.4, 0.08, 0.06, 1.6, 0.35);
      (this.shaftSpots ||= []).push(wp);
    }
    // Tamamo's sanctum: a broad moonbeam falls on the middle of the arena
    if (this.variant === 'moon' && this.arena) beam(this.arena.x, this.arena.z, 5, 2.2, 1.6, 0.1, 0.06, 3.2, 0.16);
  }
  buildCenterpieces() {
    const th = this.th, r = this.rng, T = this.theme, solid = this.solid, glow = this.glow;
    for (const c of this.L.centers || []) {
      const p = this.cellToWorld(c.x, c.y);
      if (th === 'burrow') { // glowing spring pond with lily pads and mossy rocks
        const pond = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ad0e8').multiplyScalar(1.2), toneMapped: false }));
        pond.rotation.x = -Math.PI / 2; pond.position.set(p.x, 0.05, p.z); this.scene.add(pond);
        this.floorGlows.add(p.x, 0.07, p.z, 1.3, '#bff8ff', 0.75, 1);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + r() * 0.3; this.mossRock(solid, p.x + Math.cos(a) * 2.1, p.z + Math.sin(a) * 2.1, 0.3 + r() * 0.25); }
        for (let i = 0; i < 5; i++) { const a = r() * TAU, d = r() * 1.3; solid.add(SH.disc(), M(p.x + Math.cos(a) * d, 0.07, p.z + Math.sin(a) * d, 0.22 + r() * 0.1, 0.03, 0.22), col('#6ac05a')); }
        for (let i = 0; i < 4; i++) { const a = r() * TAU; this.flower(solid, p.x + Math.cos(a) * 2.4, 0, p.z + Math.sin(a) * 2.4, '#ffb8d0'); this.tuft(solid, p.x + Math.cos(a + 0.4) * 2.5, 0, p.z + Math.sin(a + 0.4) * 2.5, 1.1); }
        this.lightPool.addSource({ pos: V(p.x, 1.2, p.z), color: C('#7ae0ff'), intensity: 8, radius: 8, flicker: 0.2 });
        this.collision.addCircle(p.x, p.z, 2.0);
      } else if (th === 'crystal') { // crystal heart
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU + r() * 0.4, d = i === 0 ? 0 : 0.5 + r() * 0.5, hgt = i === 0 ? 3.2 : 1.2 + r() * 1.4;
          const dir = i === 0 ? V(0, 1, 0) : V(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(), cc = i % 2 ? '#ff8ae0' : '#7af0ff';
          glow.add(SH.crys(), MD(p.x + Math.cos(a) * d, -0.1, p.z + Math.sin(a) * d, dir, 0.32, hgt, 0.32, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col(cc)).lerp(col('#ffffff'), clamp(ly * 0.6)));
        }
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; this.frostRock(solid, p.x + Math.cos(a) * 1.5, p.z + Math.sin(a) * 1.5, 0.35); }
        this.halos.add(p.x, 1.6, p.z, 4.5, '#c8a8ff', 0.45);
        this.lightPool.addSource({ pos: V(p.x, 2, p.z), color: C('#c8a8ff'), intensity: 10, radius: 9, flicker: 0.3 });
        this.collision.addCircle(p.x, p.z, 1.1);
      } else if (th === 'shrine') { // little fox shrine: torii, fox statues, lanterns
        const post = (x, z) => solid.add(SH.cyl(), M(x, 0, z, 0.1, 1.9, 0.1), col('#e0442e'));
        post(p.x - 0.9, p.z); post(p.x + 0.9, p.z);
        solid.add(SH.box(), M(p.x, 1.88, p.z, 2.6, 0.14, 0.22), col('#2a2020'));
        solid.add(SH.box(), M(p.x, 1.55, p.z, 2.1, 0.1, 0.14), col('#e0442e'));
        for (const s of [-1, 1]) { this.foxStatue(solid, p.x + s * 1.4, p.z + 0.8, 0); this.toro(solid, glow, p.x + s * 1.5, p.z - 0.9, 0, 0.8, true); }
        this.offering(solid, p.x, p.z - 0.2, 0);
        this.lightPool.addSource({ pos: V(p.x, 1.4, p.z + 0.8), color: C('#ffae6a'), intensity: 9, radius: 8, flicker: 0.8 });
        for (const [x, z, rr] of [[-0.9, 0, 0.2], [0.9, 0, 0.2], [-1.4, 0.8, 0.3], [1.4, 0.8, 0.3], [0, -0.2, 0.35], [-1.5, -0.9, 0.25], [1.5, -0.9, 0.25]]) this.collision.addCircle(p.x + x, p.z + z, rr);
      } else { // kitchen: bubbling cauldron over a fire
        solid.add(tplOf(new THREE.SphereGeometry(0.85, 20, 14, 0, TAU, Math.PI * 0.25, Math.PI * 0.75)), M(p.x, 0.9, p.z, 1), col('#3a3438'));
        solid.add(SH.torus(), M(p.x, 1.5, p.z, 0.62, 0.4, 0.62), col('#5a5058'));
        glow.add(SH.disc(), M(p.x, 1.38, p.z, 0.6, 0.04, 0.6), col('#ffa040'));
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; solid.add(SH.cyl(), M(p.x + Math.cos(a) * 0.55, 0.1, p.z + Math.sin(a) * 0.55, 0.08, 1.1, 0.08, 0, -a, Math.PI / 2), col('#6a4a30')); }
        this.halos.add(p.x, 0.3, p.z, 2.4, '#ff8a3a', 0.8, 1.5);
        this.lightPool.addSource({ pos: V(p.x, 0.8, p.z), color: C('#ff8a3a'), intensity: 12, radius: 9, flicker: 1.5 });
        this.collision.addCircle(p.x, p.z, 1.0);
        this.steam.push(V(p.x, 1.5, p.z));
      }
    }
  }
  // ------------------------------------------------------------------ boss arena dressing (floor sigil lives in the floor shader)
  buildArena() {
    const A = this.arena; if (!A) return;
    const th = this.th, B = this.solid, GL = this.glow, HA = this.halos, r = this.rng;
    const spots = [], n = 12;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.PI / 4;
      for (let d = A.R + 2.4; d > A.R + 0.2; d -= 0.4) {
        const x = A.x + Math.cos(a) * d, z = A.z + Math.sin(a) * d;
        const [cx, cy] = this.worldToCell(x, z);
        if (!this.walkable(x, z)) continue;
        let ok = true; // never block a corridor mouth
        for (let oy = -2; oy <= 2 && ok; oy++) for (let ox = -2; ox <= 2; ox++) { const k = (cy + oy) * this.L.W + cx + ox; if (this.L.at(cx + ox, cy + oy) && this.L.roomId && this.L.roomId[k] !== this.L.bossRoom.id) { ok = false; break; } }
        if (ok) { spots.push({ x, z, a, i }); break; }
      }
    }
    const boss = this.L.boss, moon = this.variant === 'moon';
    for (const s of spots) {
      const face = Math.atan2(A.x - s.x, A.z - s.z), alt = s.i % 2 === 0;
      if (moon) { // Tamamo: vermilion torii with blue foxfire lanterns, and stone lanterns burning foxfire between
        if (alt) {
          const tx = Math.cos(face), tz = -Math.sin(face);
          for (const e of [-1, 1]) { B.add(SH.cyl(), M(s.x + tx * e * 0.75, 0, s.z + tz * e * 0.75, 0.12, 2.5, 0.12), col('#d8382c')); B.add(SH.cyl(), M(s.x + tx * e * 0.75, 0, s.z + tz * e * 0.75, 0.16, 0.22, 0.16), col('#22222e')); }
          B.add(SH.box(), M(s.x, 2.46, s.z, 2.3, 0.16, 0.26, 0, face, 0), col('#22222e'));
          B.add(SH.box(), M(s.x, 2.34, s.z, 2.0, 0.08, 0.2, 0, face, 0), col('#d8382c'));
          B.add(SH.box(), M(s.x, 2.02, s.z, 1.8, 0.1, 0.14, 0, face, 0), col('#d8382c'));
          B.add(SH.cyl(), M(s.x, 1.72, s.z, 0.01, 0.3, 0.01), col('#2a2020'));
          GL.add(SH.sph(), M(s.x, 1.55, s.z, 0.22, 0.26, 0.22), null, (x, y, z, nx, ny, nz, o) => o.copy(col('#9ac4ff')).lerp(col('#ffffff'), clamp(ny * 0.5 + 0.3)));
          HA.add(s.x, 1.55, s.z, 2.4, '#7aa8ff', 0.6, 1);
          for (const e of [-1, 1]) this.collision.addCircle(s.x + tx * e * 0.75, s.z + tz * e * 0.75, 0.2);
        } else {
          this.toro(B, GL, s.x, s.z, face, 1.2, false, '#9ac4ff');
          HA.add(s.x, 0.8 * 1.2, s.z, 1.8, '#8ab8ff', 0.7, 1);
          this.collision.addCircle(s.x, s.z, 0.3);
        }
        continue;
      }
      if (boss === 'kasaLord' && th === 'shrine') { // Lord Karakasa's court: vermilion gates and his planted parasols
        if (alt) {
          const tx = Math.cos(face), tz = -Math.sin(face);
          for (const e of [-1, 1]) B.add(SH.cyl(), M(s.x + tx * e * 0.7, 0, s.z + tz * e * 0.7, 0.13, 2.4, 0.13), col('#d8382c'));
          B.add(SH.box(), M(s.x, 2.35, s.z, 2.0, 0.14, 0.24, 0, face, 0), col('#2a2020'));
          B.add(SH.box(), M(s.x, 2.05, s.z, 1.6, 0.1, 0.16, 0, face, 0), col('#d8382c'));
          GL.add(SH.sph(), M(s.x, 1.55, s.z, 0.26, 0.34, 0.26), null, (x, y, z, nx, ny, nz, o) => { o.set('#ff6a48'); if (Math.abs(y - 1.55) > 0.26) o.set('#2a1a1a'); });
          HA.add(s.x, 1.55, s.z, 2, '#ff9a5a', 0.6, 1);
          for (const e of [-1, 1]) this.collision.addCircle(s.x + tx * e * 0.7, s.z + tz * e * 0.7, 0.2);
        } else this.parasol(s.x, s.z, face);
        continue;
      }
      if (th === 'burrow') {
        if (alt) { // giant glowing mushroom
          B.add(SH.taper(), M(s.x, 0, s.z, 0.26, 2.0, 0.26), col('#fff4e0'));
          GL.add(SH.hemi(), M(s.x, 1.9, s.z, 0.95, 0.6, 0.95), null, (x, y, z, nx, ny, nz, o) => { o.set('#ffa8d8'); if (Math.sin(x * 9) * Math.sin(z * 9) > 0.5 && ny > 0.3) o.set('#ffffff'); });
          HA.add(s.x, 2.1, s.z, 3.2, '#ff9ad0', 0.45);
          this.collision.addCircle(s.x, s.z, 0.4);
        } else this.banner(s.x, s.z, face, '#ffc2dc', '#fffaf4', 'mochi');
      } else if (th === 'crystal') {
        if (alt) { // tall crystal spire + ring of shards
          GL.add(SH.crys(), MD(s.x, -0.1, s.z, V(0, 1, 0), 0.38, 3.2, 0.38, r()), null, (x, y, z, nx, ny, nz, o, lx, ly) => o.copy(col('#7af0ff')).lerp(col('#ffffff'), clamp(ly * 0.6)));
          for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + r(); GL.add(SH.crys(), MD(s.x + Math.cos(a) * 0.35, -0.05, s.z + Math.sin(a) * 0.35, V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize(), 0.16, 1.1, 0.16, r()), col('#ff9ae8')); }
          HA.add(s.x, 1.6, s.z, 3.4, '#8af0ff', 0.4);
          this.collision.addCircle(s.x, s.z, 0.45);
        } else this.parasol(s.x, s.z, face);
      } else if (th === 'shrine') {
        if (alt) { // pair of red pillars with a hanging lantern (mini gate)
          const tx = Math.cos(face), tz = -Math.sin(face);
          for (const e of [-1, 1]) B.add(SH.cyl(), M(s.x + tx * e * 0.7, 0, s.z + tz * e * 0.7, 0.13, 2.4, 0.13), col('#d8382c'));
          B.add(SH.box(), M(s.x, 2.35, s.z, 2.0, 0.14, 0.24, 0, face, 0), col('#2a2020'));
          B.add(SH.box(), M(s.x, 2.05, s.z, 1.6, 0.1, 0.16, 0, face, 0), col('#d8382c'));
          GL.add(SH.sph(), M(s.x, 1.55, s.z, 0.26, 0.34, 0.26), null, (x, y, z, nx, ny, nz, o) => { o.set('#ff6a48'); if (Math.abs(y - 1.55) > 0.26) o.set('#2a1a1a'); });
          HA.add(s.x, 1.55, s.z, 2, '#ff9a5a', 0.6, 1);
          for (const e of [-1, 1]) this.collision.addCircle(s.x + tx * e * 0.7, s.z + tz * e * 0.7, 0.2);
        } else this.banner(s.x, s.z, face, '#d8322e', '#fff4e0', 'fox');
      } else {
        if (alt) { // big cauldron on a fire
          B.add(tplOf(new THREE.SphereGeometry(0.55, 16, 10, 0, TAU, Math.PI * 0.3, Math.PI * 0.7)), M(s.x, 0.6, s.z, 1), col('#3a3438'));
          B.add(SH.torus(), M(s.x, 1.0, s.z, 0.42, 0.4, 0.42), col('#5a5058'));
          GL.add(SH.disc(), M(s.x, 0.92, s.z, 0.4, 0.04, 0.4), col('#ff9a3a'));
          HA.add(s.x, 0.4, s.z, 1.8, '#ff8a3a', 0.8, 1.5); this.steam.push(V(s.x, 1.0, s.z));
          this.collision.addCircle(s.x, s.z, 0.6);
        } else this.banner(s.x, s.z, face, '#2a2226', '#ff5a3a', 'oni');
      }
    }
    // a few braziers/lights on the ring so the arena reads at a glance
    for (let i = 0; i < spots.length; i += 3) { const s = spots[i]; this.lightPool.addSource({ pos: V(s.x, 1.8, s.z), color: C(moon ? '#8ab0ff' : this.theme.light), intensity: 9, radius: 9, flicker: 0.8 }); }
    if (moon) this.lightPool.addSource({ pos: V(A.x, 7, A.z), color: C('#b8c8ff'), intensity: 5, radius: 16, flicker: 0.05 });
  }
  // ------------------------------------------------------------------ set dressing (decor-map driven, all batched)
  // Small ground clutter goes into the non-shadow-casting `clutter` chunks; the few bigger pieces (lanterns, tables,
  // bonsai, roots) into `solid` / `glow`. Only wall-hugging pieces get colliders, so the fighting space stays open.
  buildDressing() {
    const th = this.th, r = this.drng, L = this.L, K = this.decoK, TW = this.decoW, TH = this.decoH, D = this.deco, dist = this.wallDist;
    const CL = this.clutter, B = this.solid, GL = this.glow;
    const roomId = L.roomId || new Uint8Array(L.W * L.H);
    const free = (x, z, pad = 0.25) => this.walkable(x, z) && !this.keepClear(x, z) && !this.collision.solidAt(x, z, pad);
    // a wall-hugging spot that is not a corridor mouth (a collider there could plug the way through)
    const quiet = (x, z) => { const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL), rid = roomId[cy * L.W + cx]; if (!rid) return false; for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (L.at(cx + ox, cy + oy) && roomId[(cy + oy) * L.W + cx + ox] !== rid) return false; return true; };
    const jit = (c, a = 0.08) => col(c).clone().offsetHSL((r() - 0.5) * a * 0.3, (r() - 0.5) * a, (r() - 0.5) * a);
    const n = { tuft: 0, flower: 0, leaf: 0, pebble: 0, mush: 0, prop: 0 };
    for (let tz = 0; tz < TH; tz++) for (let tx = 0; tx < TW; tx++) {
      const k = (tz * TW + tx) * 4, lush = D[k], path = D[k + 1], crack = D[k + 2], acc = D[k + 3];
      const x = (tx + 0.1 + r() * 0.8) * CELL / K, z = (tz + 0.1 + r() * 0.8) * CELL / K;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      if (!L.at(cx, cz)) continue;
      const wd = dist[cz * L.W + cx]; // 1 = right next to a wall
      const roll = r();
      if (th === 'burrow') {
        if (lush > 0.42 && roll < 0.62 * lush) { // grass clumps on the meadows
          if (!free(x, z, 0.05)) continue;
          const m = 1 + Math.floor(r() * 2.4);
          for (let i = 0; i < m; i++) this.ddTuft(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.9 + r() * 0.7, '#3c6a2c', '#aad076'), n.tuft++;
          if (acc > 0.3 && r() < 0.7) for (let i = 0, f = 1 + Math.floor(r() * 3); i < f; i++) this.ddFlower(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.8 + r() * 0.5, ['#ffb8d4', '#fff0a0', '#ffffff', '#c8b0ff', '#ff9a7a'][Math.floor(r() * 5)]), n.flower++;
        } else if (lush > 0.12 && lush <= 0.42 && roll < 0.22) { // clover at the meadow rim
          if (!free(x, z, 0.05)) continue;
          for (let i = 0; i < 3; i++) this.ddLeaf(CL, x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, 0.55 + r() * 0.3, jit('#6aa04a'));
          n.leaf += 3;
        } else if (wd === 1 && roll < 0.34) { // leaf litter, pebbles and toadstools gather along the wall foot
          if (!free(x, z, 0.02)) continue;
          const kk = r();
          if (kk < 0.55) { for (let i = 0, m = 3 + Math.floor(r() * 5); i < m; i++) this.ddLeaf(CL, x + (r() - 0.5) * 0.9, z + (r() - 0.5) * 0.9, 0.8 + r() * 0.5, jit(['#c89a50', '#d67a48', '#9cae62', '#b8643e', '#e0b060'][Math.floor(r() * 5)], 0.12)), n.leaf++; }
          else if (kk < 0.82) { for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) this.ddPebble(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.06 + r() * 0.09, jit('#a89888', 0.1)), n.pebble++; }
          else { this.ddMushrooms(CL, x, z, 0.7 + r() * 0.5, r() < 0.5 ? '#d8563e' : '#c89a64'); n.mush++; }
        } else if (path > 0.2 && path < 0.55 && roll < 0.1) { // grit along the trail edges
          if (!free(x, z, 0.02)) continue;
          for (let i = 0; i < 2; i++) this.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.04 + r() * 0.05, jit('#b8a898', 0.1));
          n.pebble += 2;
        } else if (crack > 0.4 && roll < 0.05) { // a dry, straw-coloured tuft in the cracked patches
          if (free(x, z, 0.05)) { this.ddTuft(CL, x, z, 0.7 + r() * 0.3, '#8a7a44', '#d8c47a'); n.tuft++; }
        } else if (wd >= 2 && lush < 0.1 && path < 0.2 && roll < 0.035) { // the odd fallen leaf / stone out in the open
          if (!free(x, z, 0.02)) continue;
          if (r() < 0.7) this.ddLeaf(CL, x, z, 0.9 + r() * 0.4, jit(['#c89a50', '#d67a48', '#9cae62'][Math.floor(r() * 3)], 0.12)); else this.ddPebble(CL, x, z, 0.07 + r() * 0.07, jit('#a89888', 0.1));
          n.leaf++;
        }
      } else if (th === 'crystal') {
        if (lush > 0.4 && roll < 0.4 * lush) { // lichen mats sprout tiny glowing crystals and pale crystal-grass
          if (!free(x, z, 0.05)) continue;
          if (r() < 0.5) { this.ddSprouts(GL, x, z, 0.6 + r() * 0.6, r() < 0.7 ? '#7af0e8' : '#ff9ae8'); n.prop++; }
          else { this.ddTuft(CL, x, z, 0.8 + r() * 0.5, '#6a70b8', '#dfe8ff'); n.tuft++; }
        } else if (acc > 0.35 && roll < 0.2) { // frost-capped rubble on the rime
          if (!free(x, z, 0.02)) continue;
          for (let i = 0, m = 1 + Math.floor(r() * 3); i < m; i++) this.ddPebble(CL, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, 0.06 + r() * 0.1, jit('#7a70b0', 0.1), '#eef4ff'), n.pebble++;
        } else if (wd === 1 && roll < 0.22) {
          if (!free(x, z, 0.02)) continue;
          if (r() < 0.75) { for (let i = 0, m = 2 + Math.floor(r() * 4); i < m; i++) this.ddPebble(CL, x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, 0.05 + r() * 0.12, jit('#6a5c9c', 0.1), '#c8d0ff'), n.pebble++; }
          else { this.ddSprouts(GL, x, z, 0.8 + r() * 0.7, ['#ff8ae0', '#7af0ff', '#c8a8ff'][Math.floor(r() * 3)]); n.prop++; }
        } else if (crack > 0.45 && roll < 0.06) {
          if (free(x, z, 0.05)) { this.ddSprouts(GL, x, z, 0.5 + r() * 0.4, '#8af4ff'); n.prop++; }
        } else if (wd >= 2 && roll < 0.025 && free(x, z, 0.02)) { this.ddPebble(CL, x, z, 0.06 + r() * 0.08, jit('#7a70b0', 0.1), '#dfe6ff'); n.pebble++; }
      } else if (th === 'shrine') {
        if (acc > 0.3 && roll < 0.45 * acc) { // a few loose petals lie on top of the painted drift
          if (!free(x, z, 0.02)) continue;
          for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) this.ddLeaf(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.6 + r() * 0.3, jit(r() < 0.7 ? '#ffc0d8' : '#fff0f4', 0.06)), n.leaf++;
        } else if (wd === 1 && roll < 0.13 && free(x, z, 0.3)) {
          const face = this.wallFace(cx, cz), kk = r();
          if (kk < 0.22) { this.ddCandles(x, z); n.prop++; }
          else if (kk < 0.4 && quiet(x, z) && free(x, z, 0.5)) { this.ddAndon(x, z, face, (this.andons = (this.andons || 0) + 1) % 3 === 1); this.collision.addCircle(x, z, 0.24); n.prop++; }
          else if (kk < 0.5) { this.scrolls(CL, x, z, face); n.prop++; }
          else if (kk < 0.62 && quiet(x, z)) { this.ddBonsai(x, z); this.collision.addCircle(x, z, 0.3); n.prop++; }
          else if (kk < 0.74 && quiet(x, z) && free(x, z, 0.6)) { this.ddLowTable(x, z, face); this.collision.addCircle(x, z, 0.45); n.prop++; }
          else if (kk < 0.86) { for (const e of [-1, 1]) this.cushion(CL, x + Math.cos(face) * e * 0.38, z - Math.sin(face) * e * 0.38, face + (r() - 0.5) * 0.3); n.prop++; }
          else { this.ddBooks(x, z, face); n.prop++; }
        } else if (wd >= 2 && roll < 0.004 && free(x, z, 0.4)) { this.cushion(CL, x, z, r() * TAU); n.prop++; }
      } else { // kitchen
        if (acc > 0.35 && roll < 0.14) { // flour heaps and crumbs on the flour drifts
          if (!free(x, z, 0.02)) continue;
          CL.add(SH.sphLo(), M(x, 0, z, 0.16 + r() * 0.14, 0.05 + r() * 0.04, 0.14 + r() * 0.12, 0, r() * TAU, 0), null, (a, b, c, nx, ny, nz, o) => o.copy(col('#fbf4ea')).multiplyScalar(0.9 + 0.1 * ny));
          n.prop++;
        } else if (lush > 0.4 && roll < 0.1) { // crumbs in the greasy corners
          if (!free(x, z, 0.02)) continue;
          for (let i = 0; i < 3; i++) this.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.03 + r() * 0.03, jit('#c8904e', 0.12));
          n.pebble += 3;
        } else if (crack > 0.45 && roll < 0.08) { // broken tile shards
          if (!free(x, z, 0.02)) continue;
          for (let i = 0; i < 3; i++) CL.add(SH.box(), M(x + (r() - 0.5) * 0.5, 0, z + (r() - 0.5) * 0.5, 0.08 + r() * 0.08, 0.025, 0.06 + r() * 0.06, (r() - 0.5) * 0.3, r() * TAU, 0), col(r() < 0.5 ? '#d88458' : '#f0e2c6'));
          n.prop++;
        } else if (wd === 1 && roll < 0.08 && free(x, z, 0.3)) {
          const face = this.wallFace(cx, cz), kk = r();
          if (kk < 0.4) { this.ddVeggies(x, z); n.prop++; }
          else if (kk < 0.6) { this.ddPlates(x, z); n.prop++; }
          else if (kk < 0.78 && quiet(x, z)) { this.ddBucket(x, z, face); this.collision.addCircle(x, z, 0.28); n.prop++; }
          else { this.ddEggs(x, z); n.prop++; }
        } else if (wd >= 2 && roll < 0.01 && free(x, z, 0.1)) { this.ddVeggies(x, z, 1); n.prop++; }
      }
    }
    if (th === 'burrow') { this.ddRoots(); this.ddPathLanterns(); this.ddFairyRings(); }
    if (th === 'crystal') this.ddPathLanterns('#8af0ff');
    this.dressCount = n;
  }
  wallFace(cx, cz) { const at = this.L.at; const dx = (at(cx + 1, cz) ? 0 : 1) - (at(cx - 1, cz) ? 0 : 1), dz = (at(cx, cz + 1) ? 0 : 1) - (at(cx, cz - 1) ? 0 : 1); return Math.atan2(-dx, -dz); }
  ddTuft(b, x, z, s, c0, c1) {
    const r = this.drng, a = col(c0).clone().offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06), t = col(c1).clone().offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.08);
    b.add(SH.tuft(Math.floor(r() * 3)), M(x, 0, z, 0.3 * s, (0.26 + r() * 0.1) * s, 0.3 * s, 0, r() * TAU, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(a).lerp(t, clamp(ly * 1.15)));
  }
  ddFlower(b, x, z, s, c) {
    const r = this.drng, tx = (r() - 0.5) * 0.3, tz = (r() - 0.5) * 0.3, h = (0.16 + r() * 0.1) * s, pc = col(c);
    b.add(SH.stem(), M(x, 0, z, 0.012 * s, h, 0.012 * s, tx, 0, tz), col('#4e8a38'));
    _E.set(tx, 0, tz, 'YXZ'); _Q.setFromEuler(_E); const tip = V(0, h, 0).applyQuaternion(_Q); // head sits on the tilted stem's tip
    b.add(SH.star(), M(x + tip.x, tip.y, z + tip.z, 0.07 * s, 0.07 * s, 0.07 * s, tx * 1.5, r() * TAU, tz * 1.5), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { if (Math.hypot(lx, lz) < 0.2) o.set('#ffc83a'); else o.copy(pc).multiplyScalar(0.92 + 0.08 * Math.hypot(lx, lz)); });
  }
  ddLeaf(b, x, z, s, c) {
    const r = this.drng, lc = c.isColor ? c : col(c), dk = lc.clone().multiplyScalar(0.8);
    b.add(SH.leaf(), M(x, 0.008, z, 0.1 * s, 0.05 * s, 0.1 * s, (r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.25), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(ly > 0.1 ? lc : dk));
  }
  ddPebble(b, x, z, s, c, top = null) {
    const r = this.drng, pc = c.isColor ? c : col(c), tc = top ? col(top) : null;
    b.add(SH.rock(), M(x, s * 0.2, z, s, s * (0.5 + r() * 0.3), s * (0.7 + r() * 0.4), r() * 0.4, r() * TAU, r() * 0.4), null, (px, py, pz, nx, ny, nz, o) => { o.copy(pc).multiplyScalar(0.8 + 0.3 * clamp(ny * 0.5 + 0.5)); if (tc && ny > 0.55) o.lerp(tc, 0.75); });
  }
  ddMushrooms(b, x, z, s, cap) {
    const r = this.drng, cc = col(cap);
    for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) {
      const k = i ? 0.5 + r() * 0.4 : 1, a = r() * TAU, d = i ? 0.1 + r() * 0.14 : 0, px = x + Math.cos(a) * d * s, pz = z + Math.sin(a) * d * s, hh = 0.2 * s * k;
      b.add(SH.cylLo(), M(px, 0, pz, 0.035 * s * k, hh, 0.035 * s * k), col('#f4e8d4'));
      b.add(SH.hemiLo(), M(px, hh * 0.9, pz, 0.12 * s * k, 0.09 * s * k, 0.12 * s * k, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => { o.copy(cc); if (ly > 0.5 && Math.sin(lx * 9) * Math.sin(lz * 9) > 0.35) o.set('#fff8ee'); if (ly < 0.1) o.set('#f0dcc0'); });
    }
  }
  ddSprouts(b, x, z, s, c) { // a knot of little glowing crystal points
    const r = this.drng, cc = col(c);
    for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) {
      const d = V((r() - 0.5) * 0.8, 1, (r() - 0.5) * 0.8).normalize(), sz = (0.035 + r() * 0.03) * s;
      b.add(SH.crys(), MD(x + (r() - 0.5) * 0.2 * s, -0.02, z + (r() - 0.5) * 0.2 * s, d, sz, (0.14 + r() * 0.22) * s, sz, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(cc).lerp(col('#ffffff'), clamp(ly * 0.6)));
    }
    if (r() < 0.4) this.halos.add(x, 0.2 * s, z, 0.7 * s, c, 0.28);
  }
  ddRoots() { // gnarled roots arching out of the wall foot and diving back into the soil
    const r = this.drng, B = this.solid;
    for (const { S } of this.wallSamples) {
      let next = 2 + r() * 5;
      for (const s of S) {
        if (s.u < next) continue;
        next = s.u + 4 + r() * 6;
        if (r() < 0.35) continue;
        const out = 0.9 + r() * 1.3, side = (r() - 0.5) * 1.2;
        const ex = s.x - s.nx * out + s.tx * side, ez = s.z - s.nz * out + s.tz * side;
        if (!this.walkable(ex, ez) || this.keepClear(ex, ez) || this.collision.solidAt(ex, ez, 0.2)) continue;
        const R0 = 0.07 + r() * 0.05, mx = (s.x + ex) / 2 - s.nx * 0.1, mz = (s.z + ez) / 2 - s.nz * 0.1, arch = 0.14 + r() * 0.2;
        const g = tube([{ p: V(s.x + s.nx * 0.2, 0.34, s.z + s.nz * 0.2), r: R0 * 1.3 }, { p: V(s.x - s.nx * 0.2, 0.16, s.z - s.nz * 0.2), r: R0 }, { p: V(mx, arch, mz), r: R0 * 0.8 }, { p: V(ex + (s.x - ex) * 0.2, 0.05, ez + (s.z - ez) * 0.2), r: R0 * 0.55 }, { p: V(ex, -0.06, ez), r: R0 * 0.35 }], 5, false);
        B.addGeo(g, s.x, s.z, null, (x, y, z, nx, ny, nz, o) => o.copy(col('#6a4630')).lerp(col('#a07a58'), clamp(ny * 0.5 + 0.3)).lerp(col('#7c9a5a'), clamp(ny * 2 - 1.5) * 0.6));
        if (r() < 0.5) this.ddTuft(this.clutter, mx - s.nx * 0.3 + s.tx * 0.2, mz - s.nz * 0.3 + s.tz * 0.2, 0.8, '#4a7434', '#a4c870');
      }
    }
  }
  ddPathLanterns(light = '#ffc47a') { // one little lantern on a stake beside a trail in most rooms
    const r = this.drng, L = this.L, B = this.solid, GL = this.glow, HA = this.halos, crystal = this.th === 'crystal';
    let placed = 0;
    for (const rm of L.rooms) {
      if (rm.kind === 'boss' || rm.kind === 'start' || r() < 0.3 || placed >= 9) continue;
      for (let t = 0; t < 40; t++) {
        const x = (rm.x + r() * rm.w) * CELL, z = (rm.y + r() * rm.h) * CELL, [, path] = this.decoAt(x, z);
        if (path < 0.25 || path > 0.5 || !this.walkable(x, z) || this.keepClear(x, z, 0.5) || this.collision.solidAt(x, z, 0.7)) continue;
        if (crystal) { // crystal lamp: a pale shard on a rock
          this.ddPebble(B, x, z, 0.22, col('#5a4c8c'), '#dfe6ff');
          GL.add(SH.crys(), MD(x, 0.1, z, V(0, 1, 0), 0.08, 0.55, 0.08, r()), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col(light)).lerp(col('#ffffff'), clamp(ly * 0.6)));
          HA.add(x, 0.45, z, 1.3, light, 0.45);
        } else {
          B.add(SH.cyl6(), M(x, 0, z, 0.035, 1.0, 0.035, (r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08), col('#6a4a34'));
          B.add(SH.cyl6(), M(x, 0.96, z, 0.022, 0.3, 0.022, 0, r() * TAU, Math.PI / 2), col('#6a4a34'));
          B.add(SH.cyl(), M(x, 0.62, z, 0.006, 0.3, 0.006), col('#3a2a2a'));
          GL.add(SH.sph(), M(x, 0.56, z, 0.1, 0.13, 0.1), null, (px, py, pz, nx, ny, nz, o) => { o.set('#ffd28a'); if (Math.abs(py - 0.56) > 0.1) o.set('#b8583a'); });
          B.add(SH.cone(), M(x, 0.66, z, 0.12, 0.07, 0.12), col('#4a3a3a'));
          HA.add(x, 0.56, z, 1.2, light, 0.55, 1);
        }
        this.lightPool.addSource({ pos: V(x, 0.8, z), color: C(light), intensity: 3.5, radius: 5, flicker: crystal ? 0.15 : 0.7 });
        this.collision.addCircle(x, z, 0.14);
        placed++;
        break;
      }
    }
  }
  ddFairyRings() { // a ring of little toadstools on an open patch of floor in some rooms
    const r = this.drng, L = this.L;
    for (const rm of L.rooms) {
      if (rm.kind === 'boss' || r() < 0.55) continue;
      for (let t = 0; t < 20; t++) {
        const x = (rm.x + 1.5 + r() * (rm.w - 3)) * CELL, z = (rm.y + 1.5 + r() * (rm.h - 3)) * CELL, R = 0.7 + r() * 0.5;
        let ok = true; for (let a = 0; a < 8 && ok; a++) { const px = x + Math.cos(a / 8 * TAU) * R, pz = z + Math.sin(a / 8 * TAU) * R; ok = this.walkable(px, pz) && !this.keepClear(px, pz) && !this.collision.solidAt(px, pz, 0.1); }
        if (!ok) continue;
        const cap = r() < 0.5 ? '#e8604a' : '#f0e4d0', m = 9 + Math.floor(r() * 5);
        for (let i = 0; i < m; i++) { const a = i / m * TAU + r() * 0.3, rr = R * (0.9 + r() * 0.2), px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, s = 0.45 + r() * 0.35;
          this.clutter.add(SH.cylLo(), M(px, 0, pz, 0.03 * s, 0.17 * s, 0.03 * s), col('#f4e8d4'));
          this.clutter.add(SH.hemiLo(), M(px, 0.15 * s, pz, 0.1 * s, 0.075 * s, 0.1 * s), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => { o.set(cap); if (ly > 0.5 && Math.sin(lx * 9) * Math.sin(lz * 9) > 0.35) o.set('#fff8ee'); if (ly < 0.1) o.set('#f0dcc0'); });
        }
        break;
      }
    }
  }
  ddCandles(x, z) { // a cluster of stubby candles with little flames
    const r = this.drng, B = this.clutter, GL = this.glow;
    for (let i = 0, m = 2 + Math.floor(r() * 3); i < m; i++) {
      const px = x + (r() - 0.5) * 0.35, pz = z + (r() - 0.5) * 0.35, h = 0.1 + r() * 0.16;
      B.add(SH.cylLo(), M(px, 0, pz, 0.035, h, 0.035), null, (a, b, c, nx, ny, nz, o) => o.set(ny > 0.5 ? '#fff4e4' : '#f4e8d8'));
      GL.add(SH.sphLo(), M(px, h + 0.035, pz, 0.018, 0.04, 0.018), col('#ffc860'));
    }
    this.halos.add(x, 0.3, z, 0.9, '#ffb060', 0.45, 1);
  }
  ddAndon(x, z, face, lit) { // paper floor lamp: square lattice shade on four legs, glowing warm
    const B = this.solid, GL = this.glow;
    for (let i = 0; i < 4; i++) { const a = face + Math.PI / 4 + i * Math.PI / 2; B.add(SH.cyl6(), M(x + Math.cos(a) * 0.19, 0, z + Math.sin(a) * 0.19, 0.022, 0.95, 0.022), col('#4a2e22')); }
    GL.add(SH.box(), M(x, 0.3, z, 0.3, 0.5, 0.3, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(Math.abs(ny) > 0.5 ? '#5a3a2a' : '#f0c888'); if (Math.abs(ny) < 0.5 && (Math.abs(Math.sin(ly * 18)) > 0.93 || Math.abs(Math.sin((lx + lz) * 14)) > 0.95)) o.set('#6a4230'); });
    B.add(SH.box(), M(x, 0.8, z, 0.36, 0.04, 0.36, 0, face, 0), col('#4a2e22'));
    B.add(SH.box(), M(x, 0.26, z, 0.36, 0.04, 0.36, 0, face, 0), col('#4a2e22'));
    this.halos.add(x, 0.55, z, 1.5, '#ffc070', 0.5, 0.6);
    if (lit) this.lightPool.addSource({ pos: V(x, 0.9, z), color: C('#ffb870'), intensity: 3, radius: 4.5, flicker: 0.4 });
  }
  ddBonsai(x, z) {
    const r = this.drng, B = this.solid;
    B.add(SH.rbox(), M(x, 0, z, 0.42, 0.16, 0.3, 0, r() * TAU, 0), col('#3a5a7a'));
    B.addGeo(tube([{ p: V(x, 0.14, z), r: 0.045 }, { p: V(x + 0.06, 0.3, z + 0.02), r: 0.035 }, { p: V(x - 0.04, 0.44, z - 0.02), r: 0.025 }], 5, false), x, z, col('#6a4a34'));
    for (const [ox, oy, oz, s] of [[-0.1, 0.44, 0, 0.16], [0.1, 0.36, 0.04, 0.13], [0, 0.52, -0.04, 0.12]]) B.add(SH.ico(), M(x + ox, oy, z + oz, s, s * 0.6, s * 0.9, 0, r() * TAU, 0), null, (a, b, c, nx, ny, nz, o) => o.copy(col('#4e7e3c')).lerp(col('#8ab85a'), clamp(ny * 0.8)));
  }
  ddLowTable(x, z, face) { // chabudai with a teapot and two cups, a cushion beside it
    const B = this.solid, r = this.drng;
    B.add(SH.disc(), M(x, 0.26, z, 0.42, 0.05, 0.42), null, (a, b, c, nx, ny, nz, o) => o.set(ny > 0.5 ? '#9a5a36' : '#6a3a24'));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; B.add(SH.cyl6(), M(x + Math.cos(a) * 0.28, 0, z + Math.sin(a) * 0.28, 0.03, 0.27, 0.03), col('#5a3420')); }
    B.add(SH.sph(), M(x, 0.36, z, 0.09, 0.07, 0.09), col('#e8e4dc')); B.add(SH.cyl(), M(x + 0.1, 0.36, z, 0.012, 0.08, 0.012, 0, 0, -0.9), col('#e8e4dc'));
    B.add(SH.sphLo(), M(x, 0.44, z, 0.03), col('#3a6a8a'));
    for (const a of [1.2, 2.6]) B.add(SH.cylLo(), M(x + Math.cos(a) * 0.22, 0.31, z + Math.sin(a) * 0.22, 0.03, 0.045, 0.03), col('#6a9a7a'));
    this.cushion(this.clutter, x - Math.sin(face) * 0.7, z - Math.cos(face) * 0.7, face + (r() - 0.5) * 0.4);
  }
  ddBooks(x, z, face) { const r = this.drng; for (let i = 0; i < 3 + Math.floor(r() * 3); i++) this.clutter.add(SH.box(), M(x + (r() - 0.5) * 0.04, i * 0.05, z + (r() - 0.5) * 0.04, 0.3, 0.05, 0.22, 0, face + (r() - 0.5) * 0.5, 0), null, (a, b, c, nx, ny, nz, o) => o.set(ny > 0.5 ? '#fff4e0' : ['#8a3a4a', '#3a5a8a', '#5a7a4a', '#c89a3a'][i % 4])); }
  ddVeggies(x, z, n0 = 0) {
    const r = this.drng, B = this.clutter;
    for (let i = 0, m = n0 || 2 + Math.floor(r() * 3); i < m; i++) {
      const px = x + (r() - 0.5) * 0.6, pz = z + (r() - 0.5) * 0.6, k = r(), a = r() * TAU;
      if (k < 0.35) { B.add(SH.cone(), M(px, 0.05, pz, 0.045, 0.24, 0.045, Math.PI / 2, a, 0), col('#ff8a2a')); B.add(SH.sphLo(), M(px - Math.sin(a) * 0.02, 0.05, pz - Math.cos(a) * 0.02, 0.03, 0.03, 0.05), col('#6ab04c')); }
      else if (k < 0.65) B.add(SH.sph(), M(px, 0.07, pz, 0.075, 0.07, 0.075), col(r() < 0.5 ? '#e0423a' : '#c8528a'));
      else { B.add(SH.sph(), M(px, 0.07, pz, 0.08, 0.075, 0.08), col('#f4e8c8')); B.add(SH.cone(), M(px, 0.13, pz, 0.025, 0.06, 0.025), col('#c8b890')); }
    }
  }
  ddPlates(x, z) { const r = this.drng; for (let i = 0; i < 3 + Math.floor(r() * 4); i++) this.clutter.add(SH.disc(), M(x + (r() - 0.5) * 0.03, i * 0.03, z + (r() - 0.5) * 0.03, 0.17, 0.028, 0.17), null, (a, b, c, nx, ny, nz, o, lx, ly, lz) => o.set(Math.hypot(lx, lz) > 0.8 && ny > 0.5 ? '#4a7ac8' : '#f8f4ee')); }
  ddBucket(x, z, face) {
    const B = this.solid;
    B.add(SH.taper(), M(x, 0.34, z, 0.2, 0.34, 0.2, Math.PI, 0, 0), null, (a, b, c, nx, ny, nz, o, lx, ly) => o.set(Math.abs(ly - 0.2) < 0.05 || Math.abs(ly - 0.8) < 0.05 ? '#5a5058' : '#b07a48'));
    B.add(SH.torus(), M(x, 0.36, z, 0.17, 0.2, 0.17, 0, face, 1.3), col('#5a5058'));
    B.add(SH.cyl6(), M(x + 0.1, 0.05, z, 0.02, 1.1, 0.02, 0.25, face, 0.3), col('#c89868'));
  }
  ddEggs(x, z) { const r = this.drng, B = this.clutter; B.add(SH.cyl(), M(x, 0, z, 0.22, 0.12, 0.22), null, (a, b, c, nx, ny, nz, o) => o.copy(col('#c89858')).multiplyScalar(Math.sin(b * 90) > 0 ? 1 : 0.82)); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r(); B.add(SH.sph(), M(x + Math.cos(a) * 0.09, 0.14, z + Math.sin(a) * 0.09, 0.05, 0.065, 0.05), col(i % 2 ? '#fff8ee' : '#f0d8b8')); } }
  banner(x, z, face, c1, c2, motif) { // nobori flag on a pole, emblem painted in vertex colours
    const B = this.solid;
    B.add(SH.cyl(), M(x, 0, z, 0.05, 3.1, 0.05), col('#4a3430'));
    B.add(SH.sphLo(), M(x, 3.12, z, 0.07), col('#e8b848'));
    const ca = Math.cos(face), sa = -Math.sin(face); // tangent (flag hangs beside the pole)
    const cx = x + ca * 0.36, cz = z + sa * 0.36;
    B.add(SH.box(), M(cx, 2.95, cz, 0.78, 0.05, 0.05, 0, face, 0), col('#4a3430'));
    B.add(SH.box(), M(cx, 1.05, cz, 0.7, 1.9, 0.03, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly) => {
      o.set(c1);
      const u = lx, v = ly - 0.5; // -0.5..0.5 across, -0.5..0.5 up
      if (Math.abs(u) > 0.4 || v > 0.44) o.set(c2);
      const ex = u * 0.7, ey = (v - 0.18) * 1.9;
      if (motif === 'mochi' && Math.hypot(ex, ey) < 0.28) o.set(c2);
      if (motif === 'fox' && Math.abs(ex) + Math.max(0, ey) * 0.8 < 0.26 && ey > -0.3) o.set(c2);
      if (motif === 'oni' && Math.hypot(ex, ey) < 0.26 && !(ey > 0.05 && Math.abs(ex) < 0.08)) o.set(c2);
    });
    this.collision.addCircle(x, z, 0.15);
  }
  parasol(x, z, face) { // open red wagasa planted for Lord Karakasa
    const B = this.solid, GL = this.glow;
    const tilt = 0.28;
    B.add(SH.cyl(), M(x, 0, z, 0.04, 2.4, 0.04, tilt, face, 0), col('#6a4a34'));
    const top = V(x + Math.sin(face) * Math.sin(tilt) * 2.3, Math.cos(tilt) * 2.3, z + Math.cos(face) * Math.sin(tilt) * 2.3);
    const g = new THREE.ConeGeometry(1.25, 0.55, 16, 1, true); g.translate(0, -0.27, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < -0.5) { const a = Math.atan2(p.getX(i), p.getZ(i)); p.setY(i, p.getY(i) + Math.abs(Math.sin(a * 8)) * 0.08); } }
    g.computeVertexNormals();
    const dir = V(Math.sin(face) * Math.sin(tilt), Math.cos(tilt), Math.cos(face) * Math.sin(tilt));
    const t = tplOf(g);
    B.add(t, MD(top.x, top.y, top.z, dir, 1, 1, 1), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { const a = Math.atan2(lx, lz); o.set(Math.cos(a * 8) > 0.9 ? '#6a2020' : '#e0343a'); if (ly < -0.42) o.set('#fff0e0'); if (Math.hypot(lx, lz) < 0.3) o.set('#fff0e0'); });
    B.add(SH.sphLo(), M(top.x, top.y + 0.05, top.z, 0.08), col('#e8b848'));
    this.collision.addCircle(x, z, 0.2);
  }
  onSky() {}
  updateSun(focus) {
    const s = this.sun;
    s.target.position.copy(focus); s.position.copy(focus).addScaledVector(this.sunDir, 50); s.target.updateMatrixWorld();
    U.uSunDir.value.copy(this.sunDir);
  }
  update(dt, t, vfx, focus) {
    if (vfx) for (const f of this.flames) {
      if (focus && (f.p.x - focus.x) ** 2 + (f.p.z - focus.z) ** 2 > 26 * 26) continue;
      if (Math.random() < dt * 6) vfx.glow.spawn({ x: f.p.x + rand(-0.1, 0.1), y: f.p.y, z: f.p.z + rand(-0.1, 0.1), vy: rand(0.6, 1.2), life: 0.6, size: 0.25, size1: 0.02, color: this.theme.light, alpha: 0.9, alpha1: 0 });
    }
    if (vfx) for (const sp of this.steam) {
      if (focus && sp.distanceTo(focus) > 30) continue;
      if (Math.random() < dt * 6) vfx.smoke.spawn({ x: sp.x + rand(-0.3, 0.3), y: sp.y, z: sp.z + rand(-0.3, 0.3), vy: rand(0.6, 1.1), life: rand(1.5, 2.5), size: 0.4, size1: 1.3, color: '#fff0e8', alpha: 0.5, alpha1: 0, fadeIn: 0.3 });
      if (Math.random() < dt * 4) vfx.glow.spawn({ x: sp.x + rand(-0.4, 0.4), y: sp.y - 0.05, z: sp.z + rand(-0.4, 0.4), vy: 0.3, life: 0.5, size: 0.25, size1: 0.05, color: '#ffc060', alpha: 0.9, alpha1: 0 });
    }
    if (vfx && focus) { // floating dust motes / spores around the player
      this.moteAcc = (this.moteAcc || 0) + dt * 10;
      while (this.moteAcc > 1) { this.moteAcc--; const x = focus.x + rand(-12, 12), z = focus.z + rand(-10, 10); if (!this.walkable(x, z)) continue; vfx.glow.spawn({ x, y: rand(0.3, 3), z, vx: rand(-0.1, 0.1), vy: rand(0.02, 0.12), vz: rand(-0.1, 0.1), life: rand(3, 5), size: rand(0.06, 0.12), color: this.theme.accent, alpha: 0.7, alpha1: 0, fadeIn: 1, flicker: rand(2, 5) }); }
    }
  }
}
