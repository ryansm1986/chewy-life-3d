// Building kit core: shared painterly materials, the geometry Builder (transform stack + material
// buckets merged into a handful of meshes), colour helpers, primitives and the hand-made warp.
import * as THREE from 'three';
import { makeToon, applyDepth } from '../../gfx/materials.js';
import { merge, paint, RoundedBox } from '../../gfx/geom.js';
import { mulberry32, clamp } from '../../core/util.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const PI = Math.PI;

// ------------------------------------------------------------------ palette
export const C = {
  woodDark: '#6b4a3a', timber: '#8f6a52', woodMid: '#9c7458', woodLight: '#c98f5e', woodPale: '#e2b988', woodRed: '#a0523a',
  plaster: '#fff3e0', stone: '#d9d0c8', stoneDark: '#a89ca8', stoneMid: '#c2b8c0', paper: '#fffaf0',
  red: '#e8503a', vermilion: '#e2573a', gold: '#f4c04a', indigo: '#2f4a7a', sakura: '#ffbcd6', pink: '#ff8fb0',
  ink: '#3a2a30', white: '#fffaf2', cream: '#fff6e8', mint: '#8fe0c0', sky: '#8fd0ff', moss: '#7cae5a',
  leaf: '#5aa14e', leafLight: '#8ccf6a', soil: '#8a5e44', straw: '#e6c46a', water: '#5ab8d8', iron: '#4a4650',
  terracotta: '#d4774e', bronze: '#b58a4a',
};
export const ROOFS = { slate: '#5d6f9e', teal: '#3f8f8a', terracotta: '#d86a4a', moss: '#6e9a5a', plum: '#8a5a8a' };
export const ROOF_LIST = [ROOFS.slate, ROOFS.teal, ROOFS.terracotta, ROOFS.moss, ROOFS.plum];
export const WALL_TINTS = ['#fff3e0', '#fff0e4', '#fdf2ea', '#f6f1ff', '#fff7e6', '#f1f7ea', '#ffece6'];
export const FLOWER_COLS = ['#ff8fb0', '#ffd24a', '#ffffff', '#c8a8ff', '#ff6f7f', '#ffb86a', '#8fc8ff'];

// ------------------------------------------------------------------ shared materials
// One material per kind for ALL buildings: shared shader programs, cheap state changes.
let _M = null;
const GLOW_FRAG = /* glsl */`
  totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb * 1.6, vGl.y)
    * (1.0 + vGl.x * (sin(uTime * 8.3 + vCWorld.x * 2.1 + vCWorld.z * 1.7) * 0.09 + sin(uTime * 19.0 + vCWorld.y * 7.0) * 0.05));
`;
function glowMat(emissive, intensity) {
  return makeToon({
    vertexColors: true, emissive, emissiveIntensity: intensity, brush: 0.06, rim: 0.12, term: [-0.2, 0.4],
    vertexPars: 'varying vec2 vGl;', vertexWorld: 'vGl = uv;', fragPars: 'varying vec2 vGl;', fragColor: GLOW_FRAG,
  });
}
export function MATS() {
  if (_M) return _M;
  _M = {
    body: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35 }),
    // windows / lanterns: emissive tracks night (setNight)
    glow: glowMat('#ffcf7a', 0.06),
    // fires, forge, cave mouth: always glowing
    hot: glowMat('#ffffff', 1.5),
    cloth: makeToon({ vertexColors: true, wind: 'cloth', windAmt: 0.5, side: THREE.DoubleSide, brush: 0.12, rim: 0.3 }),
    leaf: makeToon({ vertexColors: true, wind: 'leaf', windAmt: 0.45, brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }),
    water: makeToon({
      vertexColors: true, rim: 0.55, brush: 0.04, term: [-0.3, 0.5], shadowSat: 0.2,
      fragColor: /* glsl */`{
        vec2 q = vCWorld.xz;
        float w1 = sin(q.x * 2.3 + q.y * 1.1 + uTime * 1.6) * sin(q.y * 2.9 - q.x * 0.7 - uTime * 1.2);
        float n = texture2D(uBrush, q * 0.3 + vec2(uTime * 0.035, uTime * 0.021)).r;
        float n2 = texture2D(uBrush, q * 0.22 - vec2(uTime * 0.02, uTime * 0.03)).r;
        float spark = smoothstep(0.64, 0.8, n * 0.5 + n2 * 0.5 + w1 * 0.18);
        diffuseColor.rgb *= 0.9 + w1 * 0.1;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), spark * 0.55);
      }`,
    }),
    // fountain jets: scrolling bright bands along uv.y
    jet: makeToon({
      vertexColors: true, transparent: true, opacity: 0.82, emissive: '#7fd0f0', emissiveIntensity: 0.25, rim: 0.7, brush: 0.02,
      vertexPars: 'varying vec2 vJ;', vertexWorld: 'vJ = uv;', fragPars: 'varying vec2 vJ;',
      fragColor: /* glsl */`{
        float b = sin(vJ.y * 26.0 - uTime * 9.0 + vJ.x * 6.2831) * 0.5 + 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(0.55, 0.95, b) * 0.6);
      }`,
    }),
  };
  _M.jet.depthWrite = false;
  _M.glow.userData.dayI = 0.06; _M.glow.userData.nightI = 2.1;
  _M.hot.userData.dayI = 1.5; _M.hot.userData.nightI = 2.2;
  return _M;
}

// ------------------------------------------------------------------ colour helpers
const _c = new THREE.Color();
export function col(h) { return new THREE.Color(h); }
export function shade(hex, k) { return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString(); }
export function mixc(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }

// colour spec: hex | THREE.Color | fn(p, n, out) | {grad:[bottomHex, topHex], y0, y1}
function colorize(g, color, B) {
  if (typeof color === 'function') return paint(g, color);
  if (color && color.grad) {
    const a = col(color.grad[0]), b = col(color.grad[1]);
    g.computeBoundingBox();
    const y0 = color.y0 ?? g.boundingBox.min.y, y1 = color.y1 ?? g.boundingBox.max.y;
    return paint(g, (p, n, o) => o.copy(a).lerp(b, clamp((p.y - y0) / Math.max(1e-4, y1 - y0))));
  }
  const base = color instanceof THREE.Color ? color.clone() : col(color);
  if (B && B.jitter) { base.offsetHSL((B.r() - 0.5) * 0.012, (B.r() - 0.5) * 0.05, (B.r() - 0.5) * B.jitter); }
  return paint(g, (p, n, o) => o.copy(base));
}

// ------------------------------------------------------------------ primitives (all centred)
export const G = {
  box(w, h, d, r = 0.04) {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    // tiny parts stay plain boxes (invisible rounding, 12 tris instead of 108)
    return r >= 0.015 && Math.min(w, h, d) >= 0.075 ? new RoundedBox(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
  },
  cyl(rt, rb, h, seg = 10, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); },
  sph(r, ws = 10, hs = 7) { return new THREE.SphereGeometry(r, ws, hs); },
  cone(r, h, seg = 8) { return new THREE.ConeGeometry(r, h, seg); },
  torus(r, t, rs = 6, ts = 16, arc = Math.PI * 2) { return new THREE.TorusGeometry(r, t, rs, ts, arc); },
  disc(r, seg = 16) { return new THREE.CircleGeometry(r, seg); },
  plane(w, h, sx = 1, sy = 1) { return new THREE.PlaneGeometry(w, h, sx, sy); },
  lathe(pts, seg = 10) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); },
  ico(r, detail = 1) { return new THREE.IcosahedronGeometry(r, detail); },
};

// Axis-aligned bar between two points (for beams, posts, rails)
export function bar(a, b, t = 0.08, r = 0.02) {
  const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
  const g = G.box(t, t, L, r);
  const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) > 0.99 * L ? V(1, 0, 0) : V(0, 1, 0));
  g.applyMatrix4(m); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// ------------------------------------------------------------------ Builder
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function emptyBuckets() { return { body: [], glow: [], hot: [], cloth: [], leaf: [], water: [], jet: [] }; }

export class Builder {
  constructor(seed = 0) {
    this.seed = seed;
    this.r = mulberry32(((seed + 1) * 2654435761) >>> 0);
    this.buckets = emptyBuckets();
    this.m = new THREE.Matrix4(); this.stack = [];
    this.lights = []; this.smoke = []; this.anims = [];
    this.door = V(0, 0, 1); this.height = 1; this.footprint = [1, 1];
    this.jitter = 0.05; this.warpAmt = 0.05;
    this.cur = null;
  }
  rand(a = 0, b = 1) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this.r()); }
  pick(a) { return a[Math.floor(this.r() * a.length) % a.length]; }
  chance(p) { return this.r() < p; }
  wob(a = 0.04) { return (this.r() - 0.5) * 2 * a; }
  // transform stack. p:[x,y,z], ry yaw, s scale (number|[x,y,z]), rx/rz tilts
  push(p = [0, 0, 0], ry = 0, s = 1, rx = 0, rz = 0) {
    this.stack.push(this.m.clone());
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
    this.m.multiply(new THREE.Matrix4().compose(_p.set(p[0], p[1], p[2]), _q, _s));
    return this;
  }
  pop() { this.m = this.stack.pop(); return this; }
  at(p, ry, fn, s = 1, rx = 0, rz = 0) { this.push(p, ry, s, rx, rz); fn(); this.pop(); return this; }
  pt(x, y, z) { return V(x, y, z).applyMatrix4(this.m); }
  add(geo, color, bucket = 'body') {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (color != null) colorize(g, color, this);
    g.applyMatrix4(this.m);
    (this.cur ? this.cur.buckets : this.buckets)[bucket].push(g);
    return g;
  }
  // glowing surfaces. flicker 0..1 (candle flicker), tint 0..1 (glow takes the vertex colour instead of warm white)
  glow(geo, color, { flicker = 0, tint = 0, hot = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = flicker; uv[i * 2 + 1] = tint; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return this.add(g, color, hot ? 'hot' : 'glow');
  }
  // cloth: uv recomputed from local x/y so uv.y = 1 at the attached top edge (yTop) and 0 at yBot
  cloth(geo, color, { x0 = -0.5, x1 = 0.5, yTop = 0, yBot = -1 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = (p.getX(i) - x0) / (x1 - x0); uv[i * 2 + 1] = clamp((p.getY(i) - yBot) / (yTop - yBot)); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return this.add(g, color, 'cloth');
  }
  light(p, { color = '#ffb060', intensity = 3, radius = 6, flicker = 0.5, nightOnly = true } = {}) {
    this.lights.push({ pos: this.pt(p[0], p[1], p[2]), color: new THREE.Color(color), intensity, radius, flicker, nightOnly });
  }
  smokeAt(p) { this.smoke.push(this.pt(p[0], p[1], p[2])); }
  // Animated sub-part pivoting at local point p. kind: 'swing' | 'spin' | 'bob'. Geometry built inside fn is
  // relative to the pivot (keeps current rotation).
  anim({ p = [0, 0, 0], kind = 'swing', axis = [1, 0, 0], speed = 1, amp = 0.2, phase = 0 }, fn) {
    const pivot = this.pt(p[0], p[1], p[2]);
    const rot = new THREE.Matrix4().extractRotation(this.m);
    const ax = V(...axis).applyMatrix4(rot).normalize();
    const part = { buckets: emptyBuckets(), pivot, kind, axis: ax, speed, amp, phase: phase + this.r() * 6 };
    const saveM = this.m, saveStack = this.stack, saveCur = this.cur;
    this.m = rot.clone(); this.stack = []; this.cur = part;
    fn();
    this.m = saveM; this.stack = saveStack; this.cur = saveCur;
    this.anims.push(part);
  }
  finish() {
    const geos = {};
    for (const k of Object.keys(this.buckets)) {
      const list = this.buckets[k];
      if (!list.length) continue;
      const g = merge(list);
      if (k !== 'jet') warp(g, this.seed, this.warpAmt);
      if (k === 'body') groundShade(g);
      g.computeBoundingSphere();
      geos[k] = g;
    }
    const anims = this.anims.map(a => {
      const out = { pivot: a.pivot, kind: a.kind, axis: a.axis, speed: a.speed, amp: a.amp, phase: a.phase, geos: {} };
      for (const k of Object.keys(a.buckets)) if (a.buckets[k].length) { const g = merge(a.buckets[k]); g.computeBoundingSphere(); out.geos[k] = g; }
      return out;
    });
    return { geos, anims, lights: this.lights, smoke: this.smoke, door: this.door, height: this.height, footprint: this.footprint };
  }
}

// Smooth low-frequency warp: leans, sags and bulges so nothing is ruler-straight (applied to all buckets
// identically so windows stay glued to walls).
export function warp(g, seed, amt) {
  if (!amt) return;
  const p = g.attributes.position, a = (seed % 97) * 1.37 + 0.7;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.max(0, y), k = amt * (0.35 + h * 0.28);
    const dx = (Math.sin(y * 0.9 + a) * 0.6 + Math.sin(z * 1.3 + a * 2.1) * 0.4) * k;
    const dz = (Math.sin(y * 1.1 + a * 1.7) * 0.6 + Math.sin(x * 1.2 + a * 0.6) * 0.4) * k;
    const dy = Math.sin(x * 0.9 + a) * Math.sin(z * 1.1 + a * 1.3) * amt * 0.9 * clamp(y / 0.4);
    p.setXYZ(i, x + dx, y + dy, z + dz);
  }
  p.needsUpdate = true;
}

// painted ambient occlusion near the ground + warm tops
function groundShade(g) {
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    let k = 0.74 + 0.26 * clamp(y / 0.5);
    if (n.getY(i) > 0.6) k *= 1.04;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

// Turn a finished template into live meshes. Geometries are shared (cached); meshes are per-instance.
export function instantiate(tpl) {
  const M = MATS();
  const group = new THREE.Group();
  const mk = (g, k) => {
    const mesh = new THREE.Mesh(g, M[k]);
    mesh.castShadow = k !== 'water' && k !== 'jet' && k !== 'hot';
    mesh.receiveShadow = k !== 'jet';
    if (k === 'cloth' || k === 'leaf') applyDepth(mesh);
    if (k === 'jet') mesh.renderOrder = 2;
    return mesh;
  };
  for (const k of Object.keys(tpl.geos)) group.add(mk(tpl.geos[k], k));
  const parts = tpl.anims.map(a => {
    const node = new THREE.Group(); node.position.copy(a.pivot);
    for (const k of Object.keys(a.geos)) node.add(mk(a.geos[k], k));
    group.add(node);
    return { node, a };
  });
  const glow = [];
  if (tpl.geos.glow || tpl.anims.some(a => a.geos.glow)) glow.push(M.glow);
  if (tpl.geos.hot || tpl.anims.some(a => a.geos.hot)) glow.push(M.hot);
  return { group, parts, glow };
}
