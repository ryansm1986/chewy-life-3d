// Monster rendering for big fights (docs/ZONES.md §7, ROADMAP Z-B1 / Z-B2; ARCHITECTURE.md "Hordes").
//
// One Horde per combat world (DungeonMode / RegionMode: hordeOf(mode)). It owns:
//  - INSTANCED BATCHES. A rigid-part monster's model is built as before (groups the Animator / MonsterAnim / the region
//    animate() hooks drive, meshes with per-monster materials), but on cached geometry, and its root is never added to
//    the scene: adopt() lists its meshes as slots, and every frame (scene.onBeforeRender) each visible slot's world
//    matrix and per-instance looks are copied into one InstancedMesh per (geometry, program, render state). Toon bodies
//    carry the hit flash (the material's emissive) and an exact normal matrix (gfx/geom.js normalMatrixInto: finite for
//    a part squashed flat, a dying monster; a collapsed instance is hidden); ink hulls carry their colour and width
//    (elite contours); transparent parts their opacity and are sorted back to front; per-instance GPU-deform uniforms
//    (tidepool's vhook `vhU`, `userData.instU`) become attributes. Everything code writes to a model keeps working.
//    Batches that would draw alike share one material (no uniform re-upload between them), shadows one depth material;
//    models outside both the view and the sun's shadow frustum are skipped, and a model whose monster didn't update
//    (asleep: dungeon/crowd.js) keeps last frame's matrices. The main pass syncs; N8AO's re-renders reuse it.
//  - CONTACT RINGS: one instanced, depth-sorted quad batch fed by light ring proxies (position / scale / visible /
//    material, like the old per-monster plane).
//  - THE RIG POOL: skinned humanoid monsters (tanuki, fox) stay individual meshes; a despawned one is reset to its
//    first-build pose and handed to the next spawn of that kind and variant.
//  - warm(ids): builds the cached geometry and the batches of a roster at floor load (the batches draw one hidden
//    instance for a few frames so the driver finishes their shaders behind the transition).
// `?noinst` keeps every monster an individual mesh (still on the cached geometry) for A/B comparisons; `?hordecheck`
// reports instance materials whose shared uniforms differ from their batch's; `?nocull` draws every instance.
// Proof of identical looks: tools/qa/horde-shots.mjs (frozen lineups, before / after pixel diffs).
import * as THREE from 'three';
import { buildMonster, MONSTERS } from './monsters.js';
import { normalMatrixInto } from '../gfx/geom.js';

const QS = typeof location !== 'undefined' ? location.search : '';
export const INSTANCED = !/[?&]noinst\b/.test(QS);
const CHECK = /[?&]hordecheck\b/.test(QS), NOCULL = /[?&]nocull\b/.test(QS);
const _n3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4(), _v = new THREE.Vector3(), _cam = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _frC = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const HIDE = new THREE.Matrix4().makeTranslation(0, -80, 0);

/** the Horde of a combat world (created on first use) */
export function hordeOf(mode) { return mode._horde ||= new Horde(mode); }
/**
 * A pooled effect look (a monster's projectile, a swooping crow, a snowball, an icicle: meshes on cached geometry with
 * toon / ink materials) drawn instanced with the monsters instead of one draw call per mesh: its root leaves the scene
 * and the Horde copies its matrices every frame (visibility is honoured: a pooled look hides itself when given back).
 * Call it whenever the look is taken from its pool: it re-binds a look that outlived its world's Horde, and puts it
 * back in `scene` when there is no Horde (or it can't be adopted: sprites, textured or additive materials).
 * The look's geometry must be cached (it is flagged shared here: never freed per object).
 */
export function lookIn(mode, root, scene) {
  const ud = root.userData, H = INSTANCED && mode?._horde && !mode._horde.disposed ? mode._horde : null;
  if (ud.lookH && ud.lookH === H) return true;
  if (ud.lookH && !ud.lookH.disposed && ud.lookModel?.slots) ud.lookH.release(ud.lookModel);
  ud.lookH = null;
  if (H && ud.lookOk !== false) {
    root.traverse(o => { if (o.isMesh && o.geometry) o.geometry.userData.shared = true; });
    const M = ud.lookModel ||= { root };
    if (H.adopt(M)) { ud.lookH = H; return true; }
    ud.lookOk = false; // (not adoptable: stays a scene object)
  }
  if (scene && root.parent !== scene) scene.add(root);
  return false;
}

// ------------------------------------------------------------------ contact rings
// soft painted shadow + a thin footprint ring; one instanced batch, colour / ring strength per instance (from the proxy's
// material uniforms, so a ring that borrows another's material — Yuki-onna's mirror copies — follows it)
const RING_GEO = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); g.userData.shared = true; return g; })();
const RING_FS = /* glsl */`varying vec2 vQ; varying vec3 vCol; varying float vRA;
  void main() {
    float r = length(vQ);
    float sh = (1.0 - smoothstep(0.05, 0.95, r)) * 0.42;
    float ring = smoothstep(0.075, 0.02, abs(r - 0.84)) * vRA;
    vec3 c = mix(vec3(0.16, 0.08, 0.24), vCol, ring / max(ring + sh, 1e-3));
    gl_FragColor = vec4(c, clamp(sh + ring, 0.0, 0.85));
  }`;
function ringBatchMat() {
  return new THREE.ShaderMaterial({
    vertexShader: 'attribute vec3 iCol; attribute float iRA; varying vec2 vQ; varying vec3 vCol; varying float vRA; void main() { vQ = uv * 2.0 - 1.0; vCol = iCol; vRA = iRA; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: RING_FS, transparent: true, depthWrite: false,
  });
}
/** A monster's contact ring when rings are instanced: positioned / scaled / hidden like the old plane mesh. */
export class RingProxy extends THREE.Object3D {
  constructor(r, material) { super(); this.r = r; this.material = material; this.renderOrder = 1; this.isRingProxy = true; }
}
const RING_GEOS = new Map(); // (?noinst) one shared plane per radius
function ringGeo(r) {
  const k = Math.round(r * 1e4);
  let g = RING_GEOS.get(k);
  if (!g) { g = new THREE.PlaneGeometry(r * 2, r * 2); g.rotateX(-Math.PI / 2); g.userData.shared = true; RING_GEOS.set(k, g); }
  return g;
}

// ------------------------------------------------------------------ batch materials
// The batch material is a copy of the first instance's material that keeps its shader hooks (the same onBeforeCompile
// and program key closures: makeToon / vhook / capLuminance), plus the instancing patch. The instance materials are
// never drawn: they only hold the per-instance values the batch reads every frame.
const SIZES = ['', 'float', 'vec2', 'vec3', 'vec4'];
function uniformSize(v) { return typeof v === 'number' ? 1 : v?.isVector2 ? 2 : (v?.isVector3 || v?.isColor) ? 3 : v?.isVector4 ? 4 : 0; }
function instNames(m) {
  const out = [], ud = m.userData || {};
  const add = (n, u) => { if (!u || out.some(x => x.n === n)) return; const s = uniformSize(u.value); if (s) out.push({ n, size: s, type: SIZES[s] }); };
  for (const n in ud.vhU || {}) add(n, ud.vhU[n]);
  for (const n of ud.instU || []) add(n, ud.u?.[n]);
  return out.sort((a, b) => (a.n < b.n ? -1 : 1));
}
const isLine = m => m?.isMeshBasicMaterial && m.side === THREE.BackSide && !!m.userData?.width;
function adoptable(m) { return !!m && !Array.isArray(m) && (m.isMeshToonMaterial || isLine(m)) && !m.map && !m.alphaMap && !m.wireframe; }
function programKey(m) { const f = m.userData?._pk0 || m.customProgramCacheKey; return f ? f.call(m) : ''; }
function batchKey(mesh) {
  const m = mesh.material;
  return `${mesh.geometry.uuid}|${m.type}|${programKey(m)}|${m.side}${+m.transparent}${+m.depthWrite}${+m.depthTest}${+m.vertexColors}${+m.fog}${m.blending}${+m.toneMapped}|${mesh.renderOrder}${+mesh.castShadow}${+mesh.receiveShadow}|${instNames(m).map(x => x.n).join(',')}`;
}
function patchShader(sh, line, names, transparent) {
  let vs = sh.vertexShader, fs = sh.fragmentShader;
  const vDecl = [], vMain = [], fDecl = [];
  if (!line) {
    vDecl.push('attribute vec3 iFlash; attribute mat3 iNM; varying vec3 vIFlash;'); vMain.push('vIFlash = iFlash;'); fDecl.push('varying vec3 vIFlash;');
    // the exact per-instance normal matrix (three's instancing normal transform drops shear: squash × turn)
    vs = vs.replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * ( iNM * objectNormal );\n#ifdef FLIP_SIDED\n transformedNormal = - transformedNormal;\n#endif');
    fs = fs.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vIFlash;');
  } else {
    vDecl.push('attribute vec3 iCol; varying vec3 vICol;'); vMain.push('vICol = iCol;'); fDecl.push('varying vec3 vICol;');
    vs = vs.replace(/uniform\s+float\s+uOutW\s*;/, 'attribute float iW;\n#define uOutW iW');
    fs = fs.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vICol, opacity );');
  }
  if (transparent) {
    vDecl.push('attribute float iOp; varying float vIOp;'); vMain.push('vIOp = iOp;'); fDecl.push('varying float vIOp;');
    fs = fs.replace(/vec4 diffuseColor = vec4\( (\w+), opacity \);/, 'vec4 diffuseColor = vec4( $1, opacity * vIOp );');
  }
  for (const { n, type } of names) {
    const re = new RegExp(`uniform\\s+${type}\\s+${n}\\s*;`);
    if (re.test(vs)) vs = vs.replace(re, `attribute ${type} ${n};`); else vDecl.push(`attribute ${type} ${n};`);
    if (re.test(fs)) { fs = fs.replace(re, `varying ${type} vU_${n};\n#define ${n} vU_${n}`); vDecl.push(`varying ${type} vU_${n};`); vMain.push(`vU_${n} = ${n};`); }
  }
  vs = vs.replace('#include <common>', '#include <common>\n' + vDecl.join('\n')).replace('void main() {', 'void main() {\n' + vMain.join('\n'));
  fs = fs.replace('#include <common>', '#include <common>\n' + fDecl.join('\n'));
  sh.vertexShader = vs; sh.fragmentShader = fs;
}
function batchMaterial(src, line, names) {
  const ud = src.userData; src.userData = {};
  let b;
  try { b = new src.constructor(); b.copy(src); } finally { src.userData = ud; }
  b.userData = { ...ud, _pk0: src.customProgramCacheKey };
  const pre = src.onBeforeCompile, pk = src.customProgramCacheKey, sig = (line ? 'l' : 't') + (src.transparent ? 'o' : '') + names.map(x => x.n + x.size).join('');
  b.onBeforeCompile = (sh, r) => { pre?.call(src, sh, r); patchShader(sh, line, names, src.transparent); };
  b.customProgramCacheKey = () => (pk ? pk.call(src) : '') + '|hinst:' + sig;
  return b;
}
const VAL = (m, n) => (m.userData.vhU?.[n] || m.userData.u?.[n])?.value;
// Batches whose materials would draw alike share ONE batch material: three sorts opaque draws by material, so they go
// out back to back without re-uploading the toon uniforms (the light-pool arrays) between them. The signature holds
// everything that reaches the shader except the per-instance values: the program key, the render state and every
// shared uniform value (two kinds on one program may still differ in rim / brush / terminator).
function valStr(v) {
  if (v == null) return '-';
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return String(v);
  if (v.isColor) return `${v.r},${v.g},${v.b}`;
  if (v.isVector2) return `${v.x},${v.y}`;
  if (v.isVector3) return `${v.x},${v.y},${v.z}`;
  if (v.isVector4 || v.isQuaternion) return `${v.x},${v.y},${v.z},${v.w}`;
  if (v.isTexture) return v.uuid;
  if (Array.isArray(v)) return v.map(valStr).join(';');
  return typeof v;
}
function matSig(m, line, names) {
  const inst = new Set(names.map(x => x.n)), u = m.userData?.u;
  const out = [programKey(m), m.type, line ? 'l' : 't', m.side, +m.transparent, +m.depthWrite, +m.depthTest, +m.vertexColors, +m.fog, m.blending, +m.toneMapped, m.alphaTest, m.opacity, line ? '' : valStr(m.color), names.map(x => x.n + x.size).join(',')];
  if (u) for (const k of Object.keys(u).sort()) if (!inst.has(k)) out.push(k + '=' + valStr(u[k]?.value));
  return out.join('|');
}

class Batch {
  constructor(H, key, mesh) {
    const src = mesh.material;
    this.H = H; this.key = key; this.line = isLine(src); this.transparent = !!src.transparent;
    this.names = instNames(src);
    const sig = matSig(src, this.line, this.names);
    this.src = src; this.mat = H.mats.get(sig) || H.mats.set(sig, batchMaterial(src, this.line, this.names)).get(sig);
    this.master = mesh.geometry; this.order = mesh.renderOrder; this.cast = mesh.castShadow; this.recv = mesh.receiveShadow;
    this.cap = 0; this.n = 0; this.items = []; this.im = null; this.warmT = 3; this.slots = 0;
    this.grow(16);
  }
  grow(cap) {
    const H = this.H, g = new THREE.BufferGeometry(), M = this.master;
    g.setIndex(M.index);
    for (const k in M.attributes) g.setAttribute(k, M.attributes[k]);
    if (!M.boundingSphere) M.computeBoundingSphere();
    g.boundingSphere = M.boundingSphere.clone();
    const old = this.attrs, A = this.attrs = [];
    const add = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); A.push(a); return a; };
    if (this.line) { this.aCol = add('iCol', 3); this.aW = add('iW', 1); } else { this.aFlash = add('iFlash', 3); this.aNM = add('iNM', 9); }
    this.aOp = this.transparent ? add('iOp', 1) : null;
    this.aU = this.names.map(x => add(x.n, x.size));
    const im = new THREE.InstancedMesh(g, this.mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.castShadow = this.cast; im.receiveShadow = this.recv; im.renderOrder = this.order;
    im.matrixAutoUpdate = false; im.count = 0; im.name = 'horde';
    im.customDepthMaterial = H.depthMat; // (one shared instanced depth program: no program switch per batch in the shadow pass)
    if (this.im) { // (grown mid-write: keep what this frame wrote so far)
      im.instanceMatrix.array.set(this.im.instanceMatrix.array);
      old.forEach((a, i) => A[i].array.set(a.array));
      this.im.removeFromParent(); this.im.dispose(); H.graveyard.push(this.im.geometry);
    }
    this.im = im; this.cap = cap;
    H.root.add(im);
  }
  write(i, mesh) {
    const e = mesh.matrixWorld.elements, M = this.im.instanceMatrix.array, o = i * 16, m = mesh.material;
    for (let k = 0; k < 16; k++) M[o + k] = e[k];
    if (this.line) {
      const c = m.color, C = this.aCol.array; C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
      this.aW.array[i] = m.userData.width ? m.userData.width.value : 0.02;
    } else {
      const em = m.emissive, k = m.emissiveIntensity ?? 1, F = this.aFlash.array;
      F[i * 3] = em.r * k; F[i * 3 + 1] = em.g * k; F[i * 3 + 2] = em.b * k;
      if (!normalMatrixInto(e, this.aNM.array, i * 9)) HIDE.toArray(M, o); // (collapsed to a line or a point: drawn nowhere)
    }
    if (this.aOp) this.aOp.array[i] = m.opacity;
    for (let j = 0; j < this.names.length; j++) {
      const { n, size } = this.names[j], v = VAL(m, n), a = this.aU[j].array, q = i * size;
      if (size === 1) a[q] = v ?? 0;
      else if (v?.isColor) { a[q] = v.r; a[q + 1] = v.g; a[q + 2] = v.b; }
      else if (v) { a[q] = v.x; a[q + 1] = v.y; if (size > 2) a[q + 2] = v.z; if (size > 3) a[q + 3] = v.w; }
    }
  }
  hide(i) { // the warm-up instance: far below the floor, nothing lit
    const M = this.im.instanceMatrix.array; HIDE.toArray(M, i * 16);
    if (this.line) { this.aCol.array.fill(0, 0, 3); this.aW.array[0] = 0; } else { this.aFlash.array.fill(0, 0, 3); _n3.identity(); this.aNM.array.set(_n3.elements, 0); }
    if (this.aOp) this.aOp.array[0] = 1;
  }
  push(mesh) {
    if (this.transparent) { this.items.push(mesh); return; }
    if (this.n >= this.cap) this.grow(this.cap * 2);
    this.write(this.n++, mesh);
  }
  flush(cam) {
    if (this.transparent && this.items.length) { // back to front, as three sorts separate transparent meshes
      const it = this.items;
      for (const me of it) { _v.setFromMatrixPosition(me.matrixWorld); me._hz = _v.sub(_cam).dot(_fwd); }
      it.sort((a, b) => b._hz - a._hz);
      while (this.cap < it.length) this.grow(this.cap * 2);
      for (let i = 0; i < it.length; i++) this.write(i, it[i]);
      this.n = it.length; it.length = 0;
    }
    let n = this.n;
    if (!n && this.warmT > 0) { this.warmT--; this.hide(0); n = 1; }
    const im = this.im; im.count = n; im.visible = n > 0;
    if (!n) return;
    const up = (a) => { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; };
    up(im.instanceMatrix); for (const a of this.attrs) up(a);
  }
}

class RingBatch {
  constructor(H) { this.H = H; this.mat = ringBatchMat(); this.cap = 0; this.im = null; this.n = 0; this.grow(64); }
  grow(cap) {
    const g = new THREE.BufferGeometry();
    g.setIndex(RING_GEO.index); for (const k in RING_GEO.attributes) g.setAttribute(k, RING_GEO.attributes[k]);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aRA = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCol', this.aCol); g.setAttribute('iRA', this.aRA);
    const im = new THREE.InstancedMesh(g, this.mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.renderOrder = 1; im.matrixAutoUpdate = false; im.count = 0; im.name = 'horde-rings';
    if (this.im) { this.im.removeFromParent(); this.im.dispose(); this.H.graveyard.push(this.im.geometry); }
    this.im = im; this.cap = cap; this.H.root.add(im);
  }
  flush(rings, fr) {
    const vis = this._vis ||= [];
    vis.length = 0;
    for (const r of rings) {
      if (!r.visible) continue;
      if (fr) { _sph.center.copy(r.position); _sph.radius = r.r * Math.max(r.scale.x, r.scale.z) * 1.5 + 0.2; if (!fr.intersectsSphere(_sph)) continue; } // (rings cast no shadow)
      r._hz = (r.position.x - _cam.x) * _fwd.x + (r.position.y - _cam.y) * _fwd.y + (r.position.z - _cam.z) * _fwd.z;
      vis.push(r);
    }
    vis.sort((a, b) => b._hz - a._hz);
    while (this.cap < vis.length) this.grow(this.cap * 2);
    const M = this.im.instanceMatrix.array, C = this.aCol.array, R = this.aRA.array;
    for (let i = 0; i < vis.length; i++) {
      const r = vis[i], s = r.scale, k = r.r;
      _m4.makeScale(s.x * k, s.y * k, s.z * k); _m4.setPosition(r.position); _m4.toArray(M, i * 16);
      const u = r.material.uniforms, c = u.uCol.value; C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; R[i] = u.uRingA.value;
    }
    const n = vis.length; this.im.count = n; this.im.visible = n > 0;
    if (!n) return;
    for (const a of [this.im.instanceMatrix, this.aCol, this.aRA]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
}

// ------------------------------------------------------------------ the horde
const snapshot = root => { const s = []; root.traverse(o => s.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.visible])); return s; };
const restore = s => { for (const [o, p, q, sc, v] of s) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); o.visible = v; } };

export class Horde {
  constructor(mode) {
    this.mode = mode; this.scene = mode.world.scene;
    this.batches = new Map(); this.list = []; this.mats = new Map(); // (batch materials by draw signature)
    this.models = []; this.rings = []; this.ringBatch = null;
    this.rigs = new Map(); // key → pooled skinned models
    this.graveyard = [];   // batch geometries outgrown mid-floor (freed with the floor: they share the cached attributes)
    this.warmed = new Set();
    this.dirty = true;
    this.check = CHECK ? { n: 0, bad: 0, log: [] } : null;
    // every batch under one group: the scene walks (and the shadow pass draws) them back to back
    this.root = new THREE.Group(); this.root.name = 'horde'; this.scene.add(this.root);
    this.depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); // (three's own default shadow depth material)
    this.stats = { built: 0, pooled: 0, adopted: 0 };
    const prev = this.scene.onBeforeRender;
    // (N8AO's transparency re-renders of the same frame run with the scene's matrix update off — gfx/post.js — and draw
    //  what the main pass synced: skip them)
    this.scene.onBeforeRender = (renderer, scene, camera, rt) => { prev?.call(scene, renderer, scene, camera, rt); if (scene.matrixWorldAutoUpdate !== false) this.sync(camera); };
    // floor load: the roster (pack kinds + the boss's summons) is built and batched now, behind the transition
    const roster = new Set(mode.theme?.monsters || []), boss = MONSTERS[mode.layout?.boss];
    if (boss?.summon) roster.add(boss.summon);
    this.warm([...roster]);
  }
  // ---- models
  /** a model for a new monster: a pooled rig, or a fresh build on cached geometry */
  build(id, variant) {
    const def = MONSTERS[id], vi = variant % (def.variants?.length || 1), key = id + ':' + vi;
    const pool = this.rigs.get(key);
    if (pool?.length) { const m = pool.pop(); restore(m._rest); m.rig?.mat?.emissive?.copy(m._em); this.stats.pooled++; return m; }
    const m = buildMonster(id, vi);
    if (m.rig) { m._rest = snapshot(m.root); m._em = m.rig.mat?.emissive?.clone(); m._poolKey = key; }
    this.stats.built++;
    return m;
  }
  /** show a model: adopted into the batches, or added to the scene as it is */
  place(model) {
    if (this.adopt(model)) return;
    this.scene.add(model.root);
    // skinned bodies share one skinned depth program in the shadow pass (no program switch per rig among the others)
    model.root.traverse(o => { if (o.isSkinnedMesh && o.castShadow && !o.customDepthMaterial) o.customDepthMaterial = this.skinDepthMat ||= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); });
  }
  /** a despawned monster's model: off the batches / out of the scene; rigs go back to the pool */
  recycle(model) {
    if (model.slots) this.release(model);
    model.root.removeFromParent();
    if (model._poolKey && model.rig) { let p = this.rigs.get(model._poolKey); if (!p) this.rigs.set(model._poolKey, p = []); p.push(model); return true; }
    return false;
  }
  adopt(model) {
    if (!INSTANCED) return false;
    const slots = []; let ok = true;
    model.root.traverse(o => {
      if (!ok) return;
      if (o.isMesh) {
        if (o.isSkinnedMesh || o.isInstancedMesh || !o.geometry?.userData?.shared || !adoptable(o.material)) { ok = false; return; }
        const chain = []; for (let p = o; p; p = p.parent) { chain.push(p); if (p === model.root) break; }
        slots.push({ mesh: o, chain, mat: null, geo: null, cs: null, batch: null });
      } else if (o.isSprite || o.isPoints || o.isLine || o.isLight) ok = false;
    });
    if (!ok || !slots.length) return false;
    model.root.removeFromParent();
    for (const s of slots) this.bind(s);
    // culling sphere round the root (radius incl. the parts' reach, the champion / boss scale and room for hops / squash)
    let br = 0; for (const s of slots) { const g = s.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const b = g.boundingSphere; let o = s.mesh, off = 0; while (o && o !== model.root) { off += o.position.length(); o = o.parent; } br = Math.max(br, off + b.center.length() + b.radius); }
    model._br = (br * 1.5 + 0.5) * Math.max(1, model._sc || 1);
    model.slots = slots; model._hi = this.models.length; this.models.push(model);
    this.stats.adopted++; this.dirty = true;
    return true;
  }
  release(model) {
    const i = model._hi, L = this.models;
    if (L[i] === model) { const last = L.pop(); if (last !== model) { L[i] = last; last._hi = i; } }
    for (const s of model.slots) if (s.batch) s.batch.slots--;
    model.slots = null; model._hi = -1; this.dirty = true;
  }
  bind(s) {
    const me = s.mesh, key = batchKey(me);
    let b = this.batches.get(key);
    if (!b) { b = new Batch(this, key, me); this.batches.set(key, b); this.list.push(b); }
    else if (this.check) this.compare(b, me.material);
    if (s.batch) s.batch.slots--;
    s.batch = b; b.slots++; s.mat = me.material; s.geo = me.geometry; s.cs = me.castShadow;
  }
  // ?hordecheck: the shared (non-instance) uniforms of an instance must match its batch's
  compare(b, m) {
    const C = this.check, a = b.src.userData?.u, u = m.userData?.u; C.n++;
    if (!a || !u || a === u) return;
    const inst = new Set(b.names.map(x => x.n));
    for (const k in a) {
      if (inst.has(k) || !u[k]) continue;
      const x = a[k].value, y = u[k].value;
      const same = typeof x === 'number' ? x === y : x?.equals ? x.equals(y) : x === y;
      if (!same) { C.bad++; if (C.log.length < 8) C.log.push(`${b.key.split('|')[2]}: ${k}`); }
    }
  }
  // ---- contact rings
  ring(r, material) {
    if (!INSTANCED) { const m = new THREE.Mesh(ringGeo(r), material); m.position.y = 0.025; m.renderOrder = 1; this.scene.add(m); return m; }
    const p = new RingProxy(r, material); p.position.y = 0.025;
    p._ri = this.rings.length; this.rings.push(p);
    this.ringBatch ||= new RingBatch(this);
    this.dirty = true;
    return p;
  }
  dropRing(p) {
    if (!p) return;
    if (!p.isRingProxy) { p.removeFromParent(); return; }
    const L = this.rings, i = p._ri;
    if (L[i] === p) { const last = L.pop(); if (last !== p) { L[i] = last; last._ri = i; } }
    p._ri = -1; this.dirty = true;
  }
  // ---- floor load: cached geometry + the batches (and their programs) of the kinds this world can field
  warm(ids) {
    for (const id of ids) {
      const def = MONSTERS[id];
      if (!def || this.warmed.has(id)) continue;
      this.warmed.add(id);
      const nv = def.variants?.length || 1;
      for (let v = 0; v < nv; v++) {
        let m; try { m = buildMonster(id, v); } catch (e) { console.warn('[horde] warm failed', id, e); continue; }
        if (m.rig) { m._rest = snapshot(m.root); m._em = m.rig.mat?.emissive?.clone(); m._poolKey = id + ':' + v; let p = this.rigs.get(m._poolKey); if (!p) this.rigs.set(m._poolKey, p = []); p.push(m); continue; } // (a ready rig in the pool)
        if (!INSTANCED) continue;
        m.root.traverse(o => { if (o.isMesh && o.geometry?.userData?.shared && adoptable(o.material)) { const s = { mesh: o, chain: [], batch: null }; this.bind(s); s.batch.slots--; } });
      }
    }
    if (INSTANCED) this.ringBatch ||= new RingBatch(this);
  }
  // ---- every frame, before the scene draws (the shadow pass included)
  sync(camera) {
    this.dirty = false;
    if (camera) { _cam.setFromMatrixPosition(camera.matrixWorld); camera.getWorldDirection(_fwd); }
    // instances outside both the view and the sun's shadow frustum are left out (three culled each mesh per pass the same
    // way: what's outside both can't show in either)
    let frS = null; const cull = !!camera && !NOCULL;
    if (cull) {
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frC.setFromProjectionMatrix(_pm);
      const sun = this.mode.world?.sun;
      if (sun?.castShadow && sun.shadow?.updateMatrices) { sun.shadow.updateMatrices(sun); frS = sun.shadow.getFrustum(); }
    }
    let culled = 0;
    for (const b of this.list) b.n = 0;
    for (const M of this.models) {
      if (cull && M._br) {
        const p = M.root.position; _sph.center.set(p.x, p.y + M._br * 0.4, p.z); _sph.radius = M._br;
        if (!_frC.intersectsSphere(_sph) && !(frS && frS.intersectsSphere(_sph))) { culled++; continue; }
      }
      // (a model whose monster didn't update since the last look — asleep, crowd.js — keeps last frame's matrices)
      if (M._uf === undefined || M._uf !== M._sf) { M.root.updateMatrixWorld(true); M._sf = M._uf; }
      outer: for (const s of M.slots) {
        const me = s.mesh;
        if (me.material !== s.mat || me.geometry !== s.geo || me.castShadow !== s.cs) this.bind(s);
        for (let i = 0; i < s.chain.length; i++) if (!s.chain[i].visible) continue outer;
        s.batch.push(me);
      }
    }
    for (const b of this.list) b.flush(camera);
    this.ringBatch?.flush(this.rings, cull ? _frC : null);
    this.culled = culled;
  }
  /** the floor is going away (DungeonMode.dispose, before the scene teardown frees what the scene holds) */
  dispose() {
    this.disposed = true;
    for (const p of this.rigs.values()) for (const m of p) this.scene.add(m.root); // (pooled rigs: freed with the scene)
    this.rigs.clear();
    for (const g of this.graveyard) g.dispose();
    this.graveyard.length = 0;
    this.models.length = 0; this.rings.length = 0;
  }
  /** draw calls the monsters cost this frame (perf tools) */
  info() {
    let batches = 0, inst = 0;
    for (const b of this.list) if (b.im.count) { batches++; inst += b.im.count; }
    return { batches, instances: inst, models: this.models.length, culled: this.culled || 0, rings: this.rings.length, ...this.stats, kinds: this.list.length };
  }
}
