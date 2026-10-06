// Instanced ground telegraphs for flat floors (the Burrow, the zone dungeons; docs/ZONES.md §8.2 perf). A dense zone fight
// has dozens of warnings in flight at once (each monster's slam ring, lob circle, roll lane); as separate double-sided
// meshes they cost two draw calls each. A TeleBatch draws every telegraph of one look in a single call: a unit quad,
// instanced, its per-instance attributes (where, which way, the shape's box and size, the colour, the progress) filled
// each frame from plain records. Outdoors (hills) the callers keep their own terrain-draped meshes.
//
//   const B = teleBatchFor(G.vfx, 'kit', FS)        // one batch per vfx scene and look (re-made when the world changes)
//   const rec = B.add({ x, z, dir, shape: 0|1|2, r, len, arc, color, time })   // timed: k = t / time, ends at time + 0.05
//   rec.t = 999                                      // ends it now (a stagger: as a vfx.add record)
//   B.add({ ..., driven: true }) → set rec.k / rec.t / rec.a / rec.fire / rec.x / rec.z / rec.dir yourself, rec.done = true ends it
//
// `fs` is the look's telegraph fragment shader written for uniforms (`uniform float uK, uT, uShape, uR, uLen, uArc[, uA,
// uFire]; uniform vec3 uC; varying vec2 vM;` on its first line); batchFS() turns those into per-instance varyings.
import * as THREE from 'three';

const VS = /* glsl */`attribute vec4 iPD; attribute vec4 iBox; attribute vec4 iShape; attribute vec3 iCol; attribute vec4 iKT;
  varying vec2 vM; varying vec4 vS; varying vec3 vC; varying vec4 vKT;
  void main() {
    vec2 l = vec2(mix(iBox.x, iBox.y, position.x), mix(iBox.z, iBox.w, position.z)); vM = l; vS = iShape; vC = iCol; vKT = iKT;
    float c = cos(iPD.z), s = sin(iPD.z);
    vec3 wp = vec3(iPD.x + l.x * c + l.y * s, iPD.w, iPD.y - l.x * s + l.y * c);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
/** a uniform-driven telegraph fragment shader → the instanced one (its first line's uniforms become varyings) */
export function batchFS(fs) {
  const nl = fs.indexOf('\n'), head = fs.slice(0, nl);
  if (!/uniform float uK/.test(head) || !/varying vec2 vM;/.test(head)) throw new Error('teleBatch: unexpected telegraph shader head');
  return 'varying vec2 vM; varying vec4 vS; varying vec3 vC; varying vec4 vKT;\n#define uK vKT.x\n#define uT vKT.y\n#define uA vKT.z\n#define uFire vKT.w\n#define uShape vS.x\n#define uR vS.y\n#define uLen vS.z\n#define uArc vS.w\n#define uC vC\n' + fs.slice(nl + 1);
}
let QUAD = null;
const MATS = new Map(); // fs → material (one program per look)
const CAP = 192;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export class TeleBatch {
  constructor(vfx, fs, heightAt) {
    let mat = MATS.get(fs);
    if (!mat) { mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: batchFS(fs), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); mat.forceSinglePass = true; MATS.set(fs, mat); } // (flat quads seen from above: one pass)
    if (!QUAD) { QUAD = new THREE.BufferGeometry(); QUAD.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1], 3)); QUAD.setIndex([0, 2, 1, 1, 2, 3]); }
    const g = new THREE.InstancedBufferGeometry(); g.index = QUAD.index; g.setAttribute('position', QUAD.attributes.position);
    const A = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.attrs = [this.aPD = A('iPD', 4), this.aBox = A('iBox', 4), this.aShape = A('iShape', 4), this.aCol = A('iCol', 3), this.aKT = A('iKT', 4)];
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    this.recs = []; this.vfx = vfx; this.scene = vfx.scene; this.heightAt = heightAt;
    this.fx = vfx.add(this.mesh, dt => { for (const r of this.recs) if (!r.driven) r.t += dt; this.flush(); return !this.dead; }, 0);
  }
  /** a telegraph: { x, z, dir, shape (0 circle, 1 lane, 2 cone), r, len, arc, color, time | driven } → its record */
  add(o) {
    const r = o.r ?? 1, len = o.len ?? 4, arc = o.arc ?? 0.6, shape = o.shape | 0;
    let box;
    if (shape === 0) box = [-r, r, -r, r];
    else if (shape === 1) box = [-r, r, 0, len];
    else { const s = arc < Math.PI / 2 ? Math.sin(arc) * r : r; box = [-s, s, arc < Math.PI / 2 ? 0 : -r, r]; }
    const rec = { x: o.x, z: o.z, dir: o.dir || 0, shape, r, len, arc, box, c: new THREE.Color(o.color || '#ff5a5a'), t: 0, k: 0, a: 1, fire: 0, time: Math.max(0.05, o.time ?? 0.8), driven: !!o.driven, done: false };
    rec.life = rec.time + 0.05;
    this.recs.push(rec); this.flush();
    return rec;
  }
  flush() {
    const R = this.recs; let n = 0;
    for (let i = 0; i < R.length; i++) {
      const q = R[i]; if (q.done || (!q.driven && q.t >= q.life) || n >= CAP) continue;
      if (!q.driven) q.k = clamp01(q.t / q.time);
      this.aPD.setXYZW(n, q.x, q.z, q.dir, (this.heightAt?.(q.x, q.z) || 0) + 0.075);
      this.aBox.setXYZW(n, q.box[0], q.box[1], q.box[2], q.box[3]);
      this.aShape.setXYZW(n, q.shape, q.r, q.len, q.arc);
      this.aCol.setXYZ(n, q.c.r, q.c.g, q.c.b);
      this.aKT.setXYZW(n, q.k, q.t, q.a, q.fire);
      R[n++] = q;
    }
    R.length = n;
    this.mesh.geometry.instanceCount = n;
    for (const a of this.attrs) a.needsUpdate = true;
  }
}
const BATCHES = new WeakMap(); // vfx → Map(key → batch)
/** the batch of one telegraph look in the current fx scene (a new one after a world change: vfx.clear drops the old) */
export function teleBatchFor(vfx, key, fs, heightAt = null) {
  let M = BATCHES.get(vfx); if (!M) BATCHES.set(vfx, M = new Map());
  let b = M.get(key);
  if (!b || b.scene !== vfx.scene || !vfx.fx.includes(b.fx)) { if (b) b.dead = true; b = new TeleBatch(vfx, fs, heightAt); M.set(key, b); }
  return b;
}
