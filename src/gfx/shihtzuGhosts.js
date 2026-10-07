// The Shih Tzu's ghosts (docs/SHIHTZU.md §3, the Ghostlight Tome): the ghost pups, Grandpaw's Ghost and Bone Ward's
// spectral chew-bones. Friendly and readable: a translucent ghostlight fill (pale mint, more opaque toward the edges, as a
// ghost should be), solid features (ink eyes and nose, a pink blep, Grandpaw's spectacles and the plum topknot band) and
// a solid dark-teal outline hull, so a ghost never melts into grass or snow. No additive glow on the bodies (nothing
// here can wash the screen): the only glow is Grandpaw's small lantern flame, made by the caller.
//
// Cheap: one geometry per kind, built once at module level (shared by every scene); the pups and the bones are
// instanced (one fill + one outline draw for all of them, capped per batch); Grandpaw is one mesh + its outline. The
// little motions (the hem rippling, the ears flopping, a nod for a nip, the tail wagging, Grandpaw's lantern swinging)
// run in the vertex shader from a per-instance vec4: (phase, nod, alpha, wag).
//
// API (gfx/shihtzuFxArts.js and combat/shihtzuAllies.js are the callers):
//   new GhostBatch(scene, 'pup' | 'bone', max)  .add() → slot · .set(slot, s) · .remove(slot) · .count · .dispose()
//      s: { x, y, z, yaw, pitch, roll, scale, sx, sy, phase, nod, alpha, wag }
//   grandpawModel() → { root, fill, line, set(s) } (s as above, plus the lantern's swing in `wag`); lanternTip(model, out)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// parts (the vertex shader's aPart): what moves how
const BODY = 0, HEAD = 1, EAR_L = 2, EAR_R = 3, HEM = 4, TAIL = 5, LANTERN = 6;
// the palette: a Shih Tzu in ghostlight (his black-and-white coat as teal and pale mint); features solid
const PAL = {
  ghost: '#86dcc8', dark: '#4fb5a2', pale: '#dcfff5', ink: '#1d2a33', plum: '#7a3f7a', silver: '#eef2f8', tongue: '#ff97a8',
  glint: '#ffffff', frame: '#4a2a4a', glass: '#c8fff0', blush: '#ffb0c0',
};
const LINE = '#1f6a5e'; // the outline: a dark teal that reads on grass, sand, stone and snow
const _c = new THREE.Color();

// ------------------------------------------------------------------ geometry builders (pup units: a pup is ~0.66 m tall)
function tag(g, part, hex, solid = 0, shade = null) {
  g = g.index ? g : g; if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count, col = new Float32Array(n * 4), pa = new Float32Array(n), p = new THREE.Vector3(), nn = new THREE.Vector3();
  const base = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    _c.copy(base);
    if (shade) { p.fromBufferAttribute(g.attributes.position, i); nn.fromBufferAttribute(g.attributes.normal, i); shade(p, nn, _c); }
    col[i * 4] = _c.r; col[i * 4 + 1] = _c.g; col[i * 4 + 2] = _c.b; col[i * 4 + 3] = solid; pa[i] = part;
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  return g;
}
function ell(r, p, rot = null, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(r[0], r[1], r[2]);
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(p[0], p[1], p[2]);
  return g;
}
function torus(R, r, p, rot = [Math.PI / 2, 0, 0], seg = 20) {
  const g = new THREE.TorusGeometry(R, r, 8, seg);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(p[0], p[1], p[2]);
  return g;
}
function cyl(r0, r1, h, p, rot = null, seg = 12) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(p[0], p[1], p[2]);
  return g;
}
const join = list => { const g = mergeGeometries(list.map(x => (x.index ? x : x)), false); g.computeBoundingSphere(); return g; };

/** the ghost body: a round chest tapering into a wispy hem below (a classic ghost: no legs), lathed about +y */
function hemBody(sx = 1) {
  const pts = [[0.001, 0.37], [0.07, 0.36], [0.115, 0.32], [0.14, 0.25], [0.135, 0.18], [0.11, 0.115], [0.078, 0.06], [0.045, 0.02], [0.018, -0.01], [0.001, -0.03]]
    .map(([r, y]) => new THREE.Vector2(r * sx, y)).reverse(); // (bottom to top: the lathe's faces then point outward)
  const g = new THREE.LatheGeometry(pts, 22);
  g.computeVertexNormals();
  return g;
}
/** the pup (and, with elder: true, Grandpaw: spectacles, bushy brows, a droopy moustache and beard, a lantern) */
function ghostDog({ elder = false } = {}) {
  const L = [];
  const headY = 0.47, headZ = 0.02;
  // body: the hem (it ripples and trails), a pale chest blaze, two little front paws
  L.push(tag(hemBody(elder ? 1.12 : 1), HEM, PAL.ghost, 0, (p, n, o) => { if (n.z > 0.35 && p.y > 0.14 && Math.abs(p.x) < 0.07) o.set(PAL.pale); }));
  if (!elder) for (const s of [1, -1]) L.push(tag(ell([0.042, 0.036, 0.048], [s * 0.07, 0.205, 0.105]), BODY, PAL.pale)); // (Grandpaw's paws: below)
  // head: the dark teal coat with a pale blaze up the brow, the pale muzzle puff
  L.push(tag(ell([0.168, 0.152, 0.158], [0, headY, headZ], null, 24), HEAD, PAL.ghost, 0, (p, n, o) => {
    if (n.z > 0.2 && Math.abs(p.x) < 0.04 + Math.max(0, 0.5 - p.y) * 0.4) o.set(PAL.pale);
    else if (p.y < headY - 0.06 && n.z > 0.1) o.lerp(_tmp.set(PAL.pale), 0.6);
  }));
  L.push(tag(ell([0.098, 0.068, 0.072], [0, headY - 0.05, headZ + 0.118]), HEAD, PAL.pale, 0.3)); // (the muzzle half-solid: the face reads first)
  L.push(tag(ell([0.03, 0.023, 0.021], [0, headY - 0.022, headZ + 0.188]), HEAD, PAL.ink, 1)); // the nose
  if (!elder) {
    for (const s of [1, -1]) {
      L.push(tag(ell([0.031, 0.037, 0.018], [s * 0.068, headY + 0.018, headZ + 0.128], [0, s * 0.38, 0]), HEAD, PAL.ink, 1));
      L.push(tag(ell([0.01, 0.011, 0.006], [s * 0.059, headY + 0.034, headZ + 0.146], null, 8), HEAD, PAL.glint, 1));
      L.push(tag(ell([0.026, 0.014, 0.006], [s * 0.1, headY - 0.03, headZ + 0.118], [0, s * 0.6, 0], 10), HEAD, PAL.blush, 1)); // (a blush)
    }
    L.push(tag(ell([0.022, 0.011, 0.026], [0, headY - 0.085, headZ + 0.168]), HEAD, PAL.tongue, 1)); // a blep
  } else {
    // kindly squinting eyes under bushy brows, round spectacles, a droopy moustache and a long beard
    for (const s of [1, -1]) {
      L.push(tag(ell([0.03, 0.012, 0.014], [s * 0.066, headY + 0.016, headZ + 0.13], [0, s * 0.38, s * 0.12]), HEAD, PAL.ink, 1));
      L.push(tag(ell([0.048, 0.024, 0.032], [s * 0.07, headY + 0.062, headZ + 0.12], [0.2, s * 0.3, -s * 0.35]), HEAD, PAL.pale, 0.6));
      L.push(tag(torus(0.04, 0.0065, [s * 0.066, headY + 0.016, headZ + 0.152], [0, s * 0.3, 0]), HEAD, PAL.silver, 1));
      // the moustache: from the muzzle's sides, drooping down and out past the chin
      // (slim, droopy strands swept out to the sides: fat lobes under the nose read as two paws over his mouth)
      L.push(tag(ell([0.019, 0.072, 0.017], [s * 0.058, headY - 0.075, headZ + 0.168], [0.3, 0, s * 0.95]), HEAD, PAL.pale, 0.7));
      L.push(tag(ell([0.014, 0.05, 0.013], [s * 0.118, headY - 0.112, headZ + 0.152], [0.3, 0, s * 0.35]), HEAD, PAL.pale, 0.7));
    }
    L.push(tag(cyl(0.005, 0.005, 0.03, [0, headY + 0.022, headZ + 0.17], [0, 0, Math.PI / 2], 6), HEAD, PAL.silver, 1)); // the bridge
    L.push(tag(ell([0.05, 0.1, 0.034], [0, headY - 0.16, headZ + 0.115], [0.18, 0, 0]), HEAD, PAL.pale, 0.55)); // the beard: a long tuft
    L.push(tag(ell([0.026, 0.045, 0.022], [0, headY - 0.25, headZ + 0.095], [0.2, 0, 0]), HEAD, PAL.pale, 0.55));
  }
  // ears: long drooping locks, darker teal (his black ears in ghostlight); they flop in the shader
  for (const s of [1, -1]) L.push(tag(ell([0.058, 0.15, 0.068], [s * 0.162, headY - 0.07, headZ - 0.01], [0.05, 0, s * 0.16]), s > 0 ? EAR_L : EAR_R, PAL.dark));
  // the topknot: a pale tuft tied with a plum band
  L.push(tag(ell([0.05, 0.045, 0.05], [0, headY + 0.168, headZ - 0.01]), HEAD, PAL.pale, 0.25));
  L.push(tag(ell([0.036, 0.034, 0.036], [0.008, headY + 0.205, headZ - 0.012]), HEAD, PAL.pale, 0.25));
  L.push(tag(torus(0.032, 0.011, [0, headY + 0.138, headZ - 0.01]), HEAD, PAL.plum, 1));
  // the tail: a pale plume curled up over his back (it wags)
  L.push(tag(ell([0.05, 0.075, 0.05], [0, 0.3, -0.15], [-0.7, 0, 0]), TAIL, PAL.pale));
  if (elder) {
    // his right paw (−x) holds the lantern out at his side: an arm reaching out and down, the paw, the lantern hanging from
    // it (it swings in the shader about the bail's top, LANTERN_PIVOT); his left paw rests on his belly over a little plum
    // tome. (Both paws up at the muzzle read as covering his mouth: the owner's CP2 review.)
    const [lx, ly, lz] = LANTERN_PIVOT;
    L.push(tag(ell([0.075, 0.034, 0.036], [-0.16, 0.245, 0.06], [0, 0.45, 0.55]), BODY, PAL.ghost)); // the arm
    L.push(tag(ell([0.042, 0.036, 0.044], [lx, ly + 0.012, lz]), BODY, PAL.pale)); // the paw
    L.push(tag(cyl(0.004, 0.004, 0.05, [lx, ly - 0.025, lz], null, 5), LANTERN, PAL.frame, 1)); // the bail
    L.push(tag(cyl(0.035, 0.05, 0.022, [lx, ly - 0.06, lz], null, 10), LANTERN, PAL.frame, 1)); // the cap
    L.push(tag(cyl(0.045, 0.045, 0.075, [lx, ly - 0.11, lz], null, 10), LANTERN, PAL.glass, 1)); // the glass
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; L.push(tag(cyl(0.005, 0.005, 0.08, [lx + Math.cos(a) * 0.046, ly - 0.11, lz + Math.sin(a) * 0.046], null, 4), LANTERN, PAL.frame, 1)); }
    L.push(tag(cyl(0.05, 0.04, 0.018, [lx, ly - 0.155, lz], null, 10), LANTERN, PAL.frame, 1)); // the base
    // the tome on his belly, his left paw over it
    const book = (w, h, d, p, col) => { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.25, 0.15, -0.3))); g.translate(...p); return tag(g, BODY, col, 1); };
    L.push(book(0.085, 0.105, 0.03, [0.03, 0.135, 0.13], PAL.plum));
    L.push(book(0.074, 0.094, 0.032, [0.033, 0.135, 0.134], '#efe6d6'));
    L.push(tag(ell([0.046, 0.034, 0.04], [0.06, 0.165, 0.155], [0.3, 0, 0]), BODY, PAL.pale)); // the paw resting on it
  }
  return join(L);
}
const _tmp = new THREE.Color();
/** Bone Ward's bone: a chew-bone, pale ghostlight (0.24 long, along x) */
function ghostBone() {
  const L = [tag(cyl(0.026, 0.026, 0.16, [0, 0, 0], [0, 0, Math.PI / 2], 10), BODY, PAL.pale)];
  for (const [x, y] of [[-0.085, 0.024], [-0.085, -0.024], [0.085, 0.024], [0.085, -0.024]]) L.push(tag(ell([0.036, 0.036, 0.036], [x, y, 0], null, 12), BODY, PAL.pale));
  return join(L);
}
const GEO = {};
const geo = kind => GEO[kind] || (GEO[kind] = kind === 'bone' ? ghostBone() : ghostDog({ elder: kind === 'grandpaw' }));
/** Grandpaw's lantern (pup units, before his scale): the bail's top in his paw (the swing's pivot) and the glass's centre */
const LANTERN_PIVOT = [-0.235, 0.2, 0.085];
export const LANTERN_AT = new THREE.Vector3(LANTERN_PIVOT[0], LANTERN_PIVOT[1] - 0.11, LANTERN_PIVOT[2]);

// ------------------------------------------------------------------ materials
const VS = /* glsl */`
uniform float uT, uOut;
attribute float aPart; attribute vec4 aCol;
#ifdef USE_INSTANCING
attribute vec4 iAnim;
#else
uniform vec4 uAnim;
#endif
varying vec3 vN, vV; varying vec4 vC; varying float vA;
vec3 rotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c) + o; }
vec3 rotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z) + o; }
void main() {
#ifdef USE_INSTANCING
  vec4 an = iAnim;
#else
  vec4 an = uAnim;
#endif
  vec3 p = position, n = normal;
  float ph = an.x;
  if (aPart > 3.5 && aPart < 4.5) { // the hem: trails back behind him and ripples
    float k = clamp((0.2 - p.y) / 0.23, 0.0, 1.0);
    p.z -= k * k * 0.13; p.x += sin(uT * 5.0 + ph + p.y * 16.0) * 0.03 * k; p.z += cos(uT * 4.0 + ph + p.y * 12.0) * 0.018 * k;
  }
  if (aPart > 0.5 && aPart < 3.5) { // the head and ears: a nod (a nip) or a tilt back (a howl)
    p = rotX(p, vec3(0.0, 0.36, 0.02), an.y); n = rotX(n, vec3(0.0), an.y);
    if (aPart > 1.5) { float s = aPart < 2.5 ? 1.0 : -1.0, k = clamp((0.47 - p.y) / 0.2, 0.0, 1.0); p.x += s * (sin(uT * 4.5 + ph) * 0.02 + 0.012) * k; }
  }
  if (aPart > 4.5 && aPart < 5.5) p.x += sin(uT * 13.0 + ph) * 0.05 * an.w; // the tail wags
  if (aPart > 5.5) { vec3 o = vec3(${LANTERN_PIVOT.join(', ')}); float a = sin(uT * 2.1 + ph) * 0.14 + an.w * 0.35; p = rotX(p, o, a); n = rotX(n, vec3(0.0), a); } // the lantern swings
  p += n * uOut;
  vec4 wp = vec4(p, 1.0); vec3 wn = n;
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * n;
#endif
  vec4 mv = modelViewMatrix * wp;
  vN = normalize(normalMatrix * wn); vV = -mv.xyz; vC = aCol; vA = an.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS_FILL = /* glsl */`
uniform vec3 uRim; uniform float uFill;
varying vec3 vN, vV; varying vec4 vC; varying float vA;
void main() {
  vec3 N = normalize(vN), V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0), fr = pow(1.0 - ndv, 2.0);
  float lit = 0.64 + 0.36 * clamp(dot(N, normalize(vec3(-0.25, 0.85, 0.45))), 0.0, 1.0);
  float solid = vC.a;
  vec3 c = vC.rgb * mix(lit, 0.75 + 0.25 * lit, solid);
  c = mix(c, uRim, fr * 0.65 * (1.0 - solid)); // (a pale rim toward the edges: the ghostlight)
  float a = mix(uFill + (1.0 - uFill) * fr * 0.85, 1.0, solid) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}`;
const FS_LINE = /* glsl */`
uniform vec3 uLine; varying vec3 vN, vV; varying vec4 vC; varying float vA;
void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uLine, 0.92 * vA); }`;
const U_T = { value: 0 }; // (shared clock: ShihtzuFX.update advances it)
export function ghostTick(t) { U_T.value = t; }
const MATS = {};
/** the fill + outline materials ({ fill, line }); instanced or not (Grandpaw: his own, for his uAnim) */
function ghostMats(instanced, own = false) {
  const key = instanced ? 'inst' : 'one';
  if (!own && MATS[key]) return MATS[key];
  const defines = instanced ? { USE_INSTANCING: '' } : {};
  const anim = instanced ? {} : { uAnim: { value: new THREE.Vector4(0, 0, 1, 0) } };
  const fill = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_FILL, defines, transparent: true, depthWrite: true, toneMapped: false, fog: false,
    uniforms: { uT: U_T, uOut: { value: 0 }, uRim: { value: new THREE.Color('#e8fff8') }, uFill: { value: 0.5 }, ...anim } });
  const line = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_LINE, defines, transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.BackSide,
    uniforms: { uT: U_T, uOut: { value: 0.011 }, uLine: { value: new THREE.Color(LINE) }, ...(instanced ? {} : { uAnim: fill.uniforms.uAnim }) } });
  const m = { fill, line };
  if (!own) MATS[key] = m;
  return m;
}

// ------------------------------------------------------------------ the instanced batches (pups, bones)
const _o = new THREE.Object3D();
export class GhostBatch {
  constructor(scene, kind = 'pup', max = 8) {
    const base = geo(kind), g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'aCol', 'aPart']) g.setAttribute(k, base.attributes[k]);
    if (base.index) g.setIndex(base.index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); // (instances roam the floor: never culled)
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAnim', this.anim);
    const M = ghostMats(true);
    this.fill = new THREE.InstancedMesh(g, M.fill, max); this.line = new THREE.InstancedMesh(g, M.line, max);
    this.line.instanceMatrix = this.fill.instanceMatrix; this.fill.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const m of [this.fill, this.line]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; }
    this.fill.renderOrder = 11; this.line.renderOrder = 12;
    this.geo = g; this.max = max; this.slots = []; // slot handles, in instance order
    scene.add(this.fill, this.line);
  }
  get count() { return this.slots.length; }
  /** → a slot handle (null when the batch is full) */
  add() { if (this.slots.length >= this.max) return null; const s = { i: this.slots.length }; this.slots.push(s); this.fill.count = this.line.count = this.slots.length; return s; }
  remove(s) {
    const S = this.slots, i = S.indexOf(s); if (i < 0) return;
    const last = S.length - 1;
    if (i !== last) { // (swap the last instance into the gap)
      const m = this.fill.instanceMatrix.array, a = this.anim.array;
      for (let k = 0; k < 16; k++) m[i * 16 + k] = m[last * 16 + k];
      for (let k = 0; k < 4; k++) a[i * 4 + k] = a[last * 4 + k];
      S[i] = S[last]; S[i].i = i;
    }
    S.pop(); s.i = -1;
    this.fill.count = this.line.count = S.length;
    this.fill.instanceMatrix.needsUpdate = true; this.anim.needsUpdate = true;
  }
  /** s: { x, y, z, yaw, pitch, roll, scale, sx, sy, phase, nod, alpha, wag } */
  set(slot, s) {
    if (!slot || slot.i < 0) return;
    const k = s.scale ?? 1;
    _o.position.set(s.x, s.y, s.z); _o.rotation.set(s.pitch || 0, s.yaw || 0, s.roll || 0, 'YXZ'); _o.scale.set(k * (s.sx ?? 1), k * (s.sy ?? 1), k * (s.sx ?? 1));
    _o.updateMatrix(); this.fill.setMatrixAt(slot.i, _o.matrix);
    const a = this.anim.array, j = slot.i * 4;
    a[j] = s.phase || 0; a[j + 1] = s.nod || 0; a[j + 2] = s.alpha ?? 1; a[j + 3] = s.wag || 0;
    this.fill.instanceMatrix.needsUpdate = true; this.anim.needsUpdate = true;
  }
  dispose() { this.fill.parent?.remove(this.fill); this.line.parent?.remove(this.line); this.geo.dispose(); this.slots.length = 0; }
}

// ------------------------------------------------------------------ Grandpaw
/** a Grandpaw (one mesh + its outline, his own anim uniform): → { root, set(s) }. Pooled by the caller. */
export function grandpawModel() {
  const M = ghostMats(false, true), g = geo('grandpaw');
  const root = new THREE.Group(); root.name = 'grandpaw';
  const fill = new THREE.Mesh(g, M.fill), line = new THREE.Mesh(g, M.line);
  fill.renderOrder = 11; line.renderOrder = 12; line.material.uniforms.uOut.value = 0.008;
  for (const m of [fill, line]) { m.frustumCulled = false; m.castShadow = false; }
  root.add(fill, line);
  const U = M.fill.uniforms.uAnim.value;
  return {
    root, fill, line,
    set(s) {
      root.position.set(s.x, s.y, s.z); root.rotation.set(s.pitch || 0, s.yaw || 0, s.roll || 0, 'YXZ');
      const k = s.scale ?? 2.4; root.scale.set(k * (s.sx ?? 1), k * (s.sy ?? 1), k * (s.sx ?? 1));
      U.set(s.phase || 0, s.nod || 0, s.alpha ?? 1, s.wag || 0);
    },
  };
}
/** the world position of Grandpaw's lantern glass (the CPU twin of the shader's swing), for its flame and light */
export function lanternTip(model, s, out) {
  const a = Math.sin(U_T.value * 2.1 + (s.phase || 0)) * 0.14 + (s.wag || 0) * 0.35, o = { y: LANTERN_PIVOT[1], z: LANTERN_PIVOT[2] };
  const y = LANTERN_AT.y - o.y, z = LANTERN_AT.z - o.z, c = Math.cos(a), sn = Math.sin(a);
  out.set(LANTERN_AT.x, y * c - z * sn + o.y, y * sn + z * c + o.z);
  model.root.updateMatrixWorld(true);
  return out.applyMatrix4(model.root.matrixWorld);
}
