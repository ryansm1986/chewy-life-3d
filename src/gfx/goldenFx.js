// The Golden Retriever dragoon's effects (docs/GOLDEN.md): the lance's sunbeam streak (a thrust's flash down its line),
// the swat's sweep, the javelins in flight and stuck in the ground (one instanced draw for all of them: the Blender prop's
// geometry), their bonks, dust. One GoldenFX per VFX instance (the village's and each floor's / zone's), created through
// vfx.js' extension hook, so its meshes live in that world's scene and go with it.
//
// Budget rules (as shihtzuFx.js): every mesh comes from a per-kind pool (added once, hidden when idle); geometries and
// canvas textures are module-level and shared; particles go through the VFX's own layers. Readability (docs/POE.md §3d):
// no effect washes the screen: the streak is a narrow warm cream-gold band (normal blend, ≤ 0.7 alpha) with a thin
// additive core capped at 0.35; bonks are small sparks and a ring.
//
// API (combat/goldenSkills.js is the caller):
//   gldFx(G) → GoldenFX     streak(from, dir, len, o)     bonk(pos, big)     dust(pos, n)     javTrail(pos)
//   javelins() → JavelinBatch { add() → slot, set(slot, pos, dir, spin, scale), remove(slot) }
// (the swat's sweep borrows the samurai's blade arc: gfx/bladeFx.js)
import * as THREE from 'three';
import { registerVfxExtension } from './vfx.js';
import { rand, TAU, clamp, ease } from '../core/util.js';
import { javelinGeo, javelinMat, whenJavelin } from '../actors/goldenGear.js';

const C = h => new THREE.Color(h);
export const GLD_COL = { sun: C('#fff2c8'), gold: C('#ffd27a'), ember: C('#ff9a4a'), emerald: C('#3a9a6a'), leaf: C('#7cc45a'), cream: C('#f8f0de'), dust: C('#e8dcc8'), brass: C('#c8a050') };
const K = GLD_COL;
const _qs = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// ================================================================== textures (canvas, drawn once)
const TEX = {};
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }
/** the streak: u along it (0 = the hilt end, 1 = the tip), v across; soft edges, brightest just behind the tip */
function streakTex() {
  if (TEX.streak) return TEX.streak;
  const W = 128, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const u = x / (W - 1), v = Math.abs(y / (H - 1) - 0.5) * 2;
    const along = Math.pow(u, 1.6) * (1 - Math.pow(Math.max(0, u - 0.88) / 0.12, 2)); // (grows to the tip, rounds off at it)
    const across = Math.max(0, 1 - v * v) * (0.55 + 0.45 * (1 - v));
    const a = clamp(along * across), i = (y * W + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return (TEX.streak = canvasTex(c));
}
// a unit strip: x across (−0.5..0.5), y along (0..1)
const G_STRIP = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)); })();

// ================================================================== the javelins (one instanced draw)
const MAX_JAV = 96; // (a charged Sunshower's rain, the fling, a Full Wag and the javelins lying for Good Retriever at once)
export class JavelinBatch {
  constructor(scene) {
    const m = this.mesh = new THREE.InstancedMesh(javelinGeo(), javelinMat(), MAX_JAV);
    m.name = 'golden_javelins'; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.free = []; for (let i = MAX_JAV - 1; i >= 0; i--) this.free.push(i);
    this.top = 0; this.dirty = false;
    _m.makeScale(0, 0, 0); for (let i = 0; i < MAX_JAV; i++) m.setMatrixAt(i, _m);
    scene.add(m);
    whenJavelin(() => { m.geometry = javelinGeo(); m.material = javelinMat(); }); // (the Blender prop replaces the stand-in when it lands)
  }
  /** → a slot (or −1 when all 64 are out) */
  add() { const i = this.free.length ? this.free.pop() : -1; if (i >= 0) this.top = Math.max(this.top, i + 1); return i; }
  /** a javelin at pos, its tip along dir (unit), turned `spin` about its own axis, scaled */
  set(i, pos, dir, spin = 0, scale = 1) {
    if (i < 0) return;
    _q.setFromUnitVectors(_up, dir);
    if (spin) _q.multiply(_qs.setFromAxisAngle(_up, spin)); // (turned about its own axis: a tumbling bonk)
    _s.setScalar(scale); _m.compose(pos, _q, _s);
    this.mesh.setMatrixAt(i, _m); this.dirty = true;
  }
  remove(i) {
    if (i < 0) return;
    _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); this.dirty = true;
    this.free.push(i);
    if (i + 1 === this.top) { const used = new Set(this.free); while (this.top > 0 && used.has(this.top - 1)) this.top--; }
  }
  flush() { if (!this.dirty) return; this.dirty = false; this.mesh.count = this.top; this.mesh.instanceMatrix.needsUpdate = true; }
  clear() { this.free.length = 0; for (let i = MAX_JAV - 1; i >= 0; i--) this.free.push(i); _m.makeScale(0, 0, 0); for (let i = 0; i < MAX_JAV; i++) this.mesh.setMatrixAt(i, _m); this.top = 0; this.mesh.count = 0; this.mesh.instanceMatrix.needsUpdate = true; }
}

// ================================================================== the effect system
export class GoldenFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this._jav = null;
  }
  take(kind, make) { let Pq = this.pools.get(kind); if (!Pq) this.pools.set(kind, Pq = []); const o = Pq.pop() || this.adopt(make()); o.visible = true; return o; }
  adopt(o) { o.frustumCulled = false; this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  run(update, end) { const f = { update, end, t: 0 }; this.active.push(f); return f; }
  update(dt) {
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[gldFx]', e); }
      if (!keep) { try { f.end?.(); } catch (e) { console.warn('[gldFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    this._jav?.flush();
  }
  clear() {
    for (const f of this.active) { try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0; this._jav?.clear();
  }
  prewarm() { try { this.javelins(); this.give('streak', this.take('streak', () => this.streakMesh())); this.give('ring', this.take('ring', () => this.ringMesh())); } catch (e) { /* cosmetic */ } }
  /** the javelins' instanced batch (made on first use in this world) */
  javelins() { return this._jav || (this._jav = new JavelinBatch(this.scene)); }

  // ------------------------------------------------------------------ the lance's sunbeam streak
  streakMesh() {
    const m = new THREE.Mesh(G_STRIP(), new THREE.MeshBasicMaterial({ map: streakTex(), color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    m.matrixAutoUpdate = false; m.renderOrder = 9; m.material.forceSinglePass = true; // (one pass: a flat strip, no back faces to sort)
    return m;
  }
  /** a thrust's flash down its line: from `from` (world) along `dir` (unit, horizontal) for len m, width w; a warm band
   *  that shoots out in ~0.06 s and fades by `life`; core: a thin additive glint on top (capped) */
  streak(from, dir, len, { width = 0.5, life = 0.2, color = K.sun, core = true, y = null, alpha = 0.7 } = {}) {
    const cam = this.engine.camera;
    const mk = (kind, w, c, alpha, add) => {
      const m = this.take(kind, () => { const x = this.streakMesh(); if (add) { x.material.blending = THREE.AdditiveBlending; x.renderOrder = 10; } return x; });
      m.material.color.copy(c);
      _a.copy(dir).normalize(); _b.subVectors(cam.position, from).normalize(); _c.crossVectors(_a, _b); if (_c.lengthSq() < 1e-6) _c.set(-_a.z, 0, _a.x); _c.normalize();
      _b.crossVectors(_c, _a).normalize(); // (the strip faces the camera as far as its axis allows)
      const base = _s.copy(from); if (y != null) base.y = y;
      const M0 = new THREE.Matrix4().makeBasis(_c, _a, _b).setPosition(base), dirW = _a.clone();
      this.run((dt, t) => {
        const k = clamp(t / life), grow = ease.outCubic(clamp(t / 0.07)), L = Math.max(0.05, len * grow);
        m.matrix.copy(M0); m.matrix.multiply(_m.makeScale(w * (1 - 0.4 * k), L, 1)); m.matrixWorldNeedsUpdate = true;
        m.material.opacity = alpha * (1 - ease.inQuad(k));
        return k < 1;
      }, () => this.give(kind, m));
      return dirW;
    };
    mk('streak', width, color, alpha, false);
    if (core) mk('streakCore', width * 0.28, K.gold, 0.35, true);
  }
  // ------------------------------------------------------------------ bonks, dust
  /** a blunt toy tip lands: a few warm sparks, a white star and a small ring (big: a lunge's last poke) */
  bonk(pos, big = false) {
    const V = this.vfx, f = this.engine?.renderer?.info?.render?.frame ?? 0;
    if (f !== this._bonkF) { this._bonkF = f; this._bonkN = 0; }
    const lit = this._bonkN++ < 3, n = lit ? (big ? 9 : 5) : 2; // (the first three in a frame pop; the rest just spark)
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(2, 4.2); V.spark.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s, vy: rand(0.6, 2.4), vz: Math.sin(a) * s, life: rand(0.25, 0.4), size: rand(0.16, 0.26), size1: 0.02, color: i % 2 ? '#fff2c8' : '#ffd27a', alpha: 0.9, alpha1: 0, drag: 3, grav: 6, spin: rand(-8, 8) }); }
    if (!lit) return;
    V.spark.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.16, size: big ? 0.6 : 0.45, size1: big ? 0.8 : 0.6, color: '#fff8e8', alpha: 0.45, alpha1: 0 });
    V.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.2, size: big ? 0.45 : 0.32, size1: big ? 0.9 : 0.65, color: '#fff2c8', alpha: 0.22, alpha1: 0 }); // (the pop: a particle, not a ring mesh per bonk)
  }
  /** a kick of dust at his feet (a lunge's step, a skid) */
  dust(pos, n = 4) {
    const V = this.vfx;
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.6, 1.6); V.smoke.spawn({ x: pos.x + Math.cos(a) * 0.1, y: pos.y + 0.06, z: pos.z + Math.sin(a) * 0.1, vx: Math.cos(a) * s, vy: rand(0.3, 0.8), vz: Math.sin(a) * s, life: rand(0.35, 0.55), size: 0.22, size1: 0.55, color: '#e8dcc8', alpha: 0.5, alpha1: 0, drag: 4 }); }
  }
  /** a few soft cream motes trailing a javelin (called per frame per javelin at a capped rate) */
  javTrail(pos) {
    this.vfx.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.22, size: 0.16, size1: 0.04, color: '#fff2c8', alpha: 0.3, alpha1: 0 });
  }

  // ------------------------------------------------------------------ embers and leaves (the Emberleaf Guard's colours)
  /** n ember motes round pos (r: spread), drifting up: small, warm, capped (additive at ≤ 0.6) */
  embers(pos, n = 6, { r = 0.3, up = 1.4, size = 0.22, speed = 0.6, life = 0.6 } = {}) {
    const V = this.vfx;
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.2, 1) * speed; V.glow.spawn({ x: pos.x + rand(-r, r), y: pos.y + rand(0, r * 0.6), z: pos.z + rand(-r, r), vx: Math.cos(a) * s, vy: rand(0.4, 1) * up, vz: Math.sin(a) * s, life: rand(0.6, 1) * life, size: size * rand(0.6, 1.2), size1: 0.03, color: '#ffd27a', color1: '#ff5a1e', alpha: 0.6, alpha1: 0, drag: 1.2 }); }
  }
  /** n leaves (emerald and gold) thrown from pos: outward at `speed`, a little up, fluttering down */
  leaves(pos, n = 8, { r = 0.3, speed = 3, up = 2.2, size = 0.17 } = {}) {
    const V = this.vfx;
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.4, 1) * speed; V.leaf.spawn({ x: pos.x + Math.cos(a) * r, y: pos.y + rand(0.05, 0.4), z: pos.z + Math.sin(a) * r, vx: Math.cos(a) * s, vy: rand(0.5, 1) * up, vz: Math.sin(a) * s, life: rand(0.8, 1.3), size: size * rand(0.8, 1.2), color: i % 3 === 2 ? '#e0b050' : i % 3 ? '#7cc45a' : '#3a9a6a', alpha: 1, alpha1: 0, drag: 2.2, grav: 2.2, spin: rand(-8, 8), stretch: 0.6 }); }
  }
  /** a soft warm puff of smoke (an ember burst's, the breath's far end): normal blend, never bright */
  smoke(pos, n = 4, { r = 0.3, size = 0.45, color = '#8a7a6a' } = {}) {
    const V = this.vfx;
    for (let i = 0; i < n; i++) V.smoke.spawn({ x: pos.x + rand(-r, r), y: pos.y + rand(0, 0.3), z: pos.z + rand(-r, r), vx: rand(-0.4, 0.4), vy: rand(0.4, 1), vz: rand(-0.4, 0.4), life: rand(0.6, 1), size, size1: size * 2.2, color, alpha: 0.35, alpha1: 0, drag: 2, spin: rand(-1, 1) });
  }
  /** the sun's glint on him at the top of the Jump: a white-gold star, a breath long */
  glint(pos, size = 0.9) {
    const V = this.vfx;
    V.spark.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.32, size, size1: size * 0.2, color: '#fff6dc', alpha: 0.85, alpha1: 0, spin: 4 });
    V.glow.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.3, size: size * 0.9, size1: size * 1.3, color: '#ffe6a0', alpha: 0.3, alpha1: 0 });
  }

  // ------------------------------------------------------------------ a ground ring (a telegraph, the shield's halo)
  ringMesh() {
    const m = new THREE.Mesh(G_FLAT(), new THREE.MeshBasicMaterial({ map: ringTex(), color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 8;
    return m;
  }
  /** a soft ring on the ground at `at` (radius r) that grows in and holds for `life`; o.color, o.alpha, o.follow (an actor
   *  it stays under), o.pulse; → its handle { end() } (it ends by itself at life; life 0: until end()) */
  ring(at, r, { life = 1, color = K.gold, alpha = 0.35, follow = null, pulse = 0, grow = 0.18, fade = 0.2 } = {}) {
    const m = this.take('ring', () => this.ringMesh());
    m.material.color.copy(color); m.position.set(at.x, (at.y || 0) + 0.05, at.z);
    const h = { done: false, endT: null, end() { h.done = true; } };
    this.run((dt, t) => {
      if (follow) m.position.set(follow.pos.x, follow.pos.y + 0.05, follow.pos.z);
      if (h.done && h.endT == null) h.endT = t;
      const out = h.endT != null ? clamp((t - h.endT) / fade) : life ? clamp((t - (life - fade)) / fade) : 0;
      const k = ease.outCubic(clamp(t / grow)), pz = pulse ? 1 + pulse * Math.sin(t * 6) : 1;
      m.scale.setScalar(Math.max(0.01, r * (0.6 + 0.4 * k)));
      m.material.opacity = alpha * k * (1 - out) * pz;
      return out < 1 && (!life || t < life);
    }, () => this.give('ring', m));
    return h;
  }

  // ------------------------------------------------------------------ the crashes (Sunfall Jump, Starfall Lance)
  /** the dragoon lands lance-first (or the star does): a ring rolling out to r (its leading edge: a clear middle, gone in
   *  ~0.4 s), short sunbeams flashing out along the ground, dust, leaves, a little scorch; big: the star's (embers too) */
  crash(at, r, { big = false, color = K.sun } = {}) {
    const V = this.vfx, rr = Math.min(r, 4.5);
    V.ring(at, { color: '#fff2c8', r0: 0.3, r1: rr * 1.05, life: 0.4, opacity: 0.5 });
    if (big) V.ring(at, { color: '#ffb060', r0: 0.2, r1: rr * 0.75, life: 0.32, opacity: 0.4 });
    V.dustRing(at, rr * 0.8, big ? 22 : 16);
    for (let i = 0, n = big ? 8 : 6; i < n; i++) {
      const a = i / n * TAU + rand(-0.15, 0.15), d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), r0 = rr * 0.4; // (streak() uses the module temporaries; from 0.4 r out: the middle stays clear)
      this.streak(new THREE.Vector3(at.x + d.x * r0, at.y + 0.1, at.z + d.z * r0), d, rr * rand(0.45, 0.65), { width: 0.18, life: 0.22, color, core: false, y: at.y + 0.1, alpha: 0.5 });
    }
    this.leaves(at, big ? 14 : 10, { r: 0.4, speed: rr * 1.4, up: 3 });
    if (big) this.embers(at, 12, { r: rr * 0.5, up: 2, size: 0.26, life: 0.8 });
    V.flash(_c.set(at.x, at.y + 0.4, at.z), '#fff0d0', big ? 1.1 : 0.9, 0.14, 0.3);
    V.light(_c, '#ffe0a0', big ? 2.2 : 1.6, 4.5, 0.2);
    V.decal(at, { r: rr * 0.55, color: '#3a2a18', life: big ? 3.5 : 2.2, opacity: 0.3 });
  }
  /** an Emberleaf burst / a swoop's splash: an ember ring out to r, embers and leaves thrown out, a soft smoke */
  emberBurst(at, r, { leaves = 10, embers = 16 } = {}) {
    const V = this.vfx, rr = Math.min(r, 4);
    V.ring(at, { color: '#ffa050', r0: 0.2, r1: rr * 1.05, life: 0.36, opacity: 0.45 });
    this.embers(_c.set(at.x, at.y + 0.3, at.z), embers, { r: rr * 0.45, up: 2.2, speed: rr * 1.2, size: 0.26, life: 0.7 });
    this.leaves(at, leaves, { r: 0.3, speed: rr * 1.6, up: 2.6 });
    this.smoke(_c, 4, { r: rr * 0.3 });
    V.flash(_c, '#ffc070', 0.9, 0.14, 0.4);
    V.light(_c, '#ff9a50', 2.5, 4, 0.2);
    V.decal(at, { r: rr * 0.5, color: '#2a1a10', life: 2, opacity: 0.28 });
  }

  // ------------------------------------------------------------------ Shadow's ember breath
  /** one puff of the breath: embers streaming from `from` along yaw `ang` (radians, atan2(x, z)) out to `range` in a cone
   *  `arc` (°) wide. Small warm motes (additive, ≤ 0.55 alpha), a little smoke at the far end. edge: 0..1 (the charged
   *  breath weights its embers to the cone's rims, so the middle stays readable); n: how many */
  breath(from, ang, range, arc, { n = 14, edge = 0, size = 0.32, life = 0.42 } = {}) {
    const V = this.vfx, half = arc * Math.PI / 360;
    for (let i = 0; i < n; i++) {
      let u = rand(-1, 1); if (edge > 0 && Math.random() < edge) u = (u < 0 ? -1 : 1) * rand(0.75, 1);
      const a = ang + u * half, sp = range / life * rand(0.75, 1.05);
      V.glow.spawn({ x: from.x, y: from.y, z: from.z, vx: Math.sin(a) * sp, vy: rand(-0.5, 0.6), vz: Math.cos(a) * sp, life: life * rand(0.8, 1.05), size: size * 0.4, size1: size * rand(1, 1.4), color: '#ffe08a', color1: '#ff5a1e', alpha: 0.5, alpha1: 0, drag: 0.6 });
      if (i % 3 === 0) V.dot.spawn({ x: from.x, y: from.y, z: from.z, vx: Math.sin(a) * sp * 0.9, vy: rand(0, 1), vz: Math.cos(a) * sp * 0.9, life: life * 0.9, size: 0.12, size1: 0.04, color: '#ff8a3a', alpha: 1, alpha1: 0.6, drag: 0.8, grav: -1 }); // (a few solid sparks: the stream reads on a bright floor too)
    }
    // its body: warm puffs (normal blend: they read on any floor without adding light) rolling down the cone
    for (let i = 0; i < 4; i++) { let u = rand(-0.8, 0.8); if (edge > 0 && Math.random() < edge) u = (u < 0 ? -1 : 1) * rand(0.6, 0.95); const a = ang + u * half, sp = range / life * rand(0.6, 0.85);
      V.smoke.spawn({ x: from.x, y: from.y, z: from.z, vx: Math.sin(a) * sp, vy: rand(0, 0.5), vz: Math.cos(a) * sp, life: life * 1.1, size: 0.25, size1: Math.min(1.1, range * 0.22), color: '#ffb060', color1: '#d0603a', alpha: 0.45, alpha1: 0, drag: 1.2, spin: rand(-2, 2) }); }
    _a.set(from.x + Math.sin(ang) * range * 0.85, from.y - 0.2, from.z + Math.cos(ang) * range * 0.85);
    this.smoke(_a, 2, { r: range * 0.15, size: 0.4, color: '#7a6a5a' });
  }
  /** Mighty Little Roar: rings rolling out of his mouth (camera-facing, staggered) and one on the ground to r */
  roar(pos, r) {
    const V = this.vfx;
    for (let i = 0; i < 3; i++) this.run((dt, t) => { if (t < i * 0.1) return true; V.ring(pos, { color: i === 1 ? '#ffc890' : '#fff2c8', r0: 0.15, r1: 0.9 + i * 0.35, life: 0.4, flat: false, opacity: 0.4, y: 0 }); return false; });
    V.ring(_c.set(pos.x, pos.y - 1, pos.z), { color: '#ffd8a0', r0: 0.4, r1: Math.min(r, 6.5), life: 0.55, opacity: 0.3 });
    V.sparkle(pos, { n: 6, color: '#ffe6a0', r: 0.4, size: 0.24 });
  }
  /** the wing shield gives way: one big flap's gust (a ring of wind, leaves blown out, dust) */
  gust(at, r) {
    const V = this.vfx;
    V.ring(at, { color: '#fff6e8', r0: 0.4, r1: Math.min(r, 4) * 1.15, life: 0.4, opacity: 0.42 });
    V.dustRing(at, r * 0.8, 14);
    this.leaves(at, 12, { r: 0.5, speed: r * 2.2, up: 1.6 });
  }
}

// a soft ring for the ground (the telegraph, the shield's halo)
function ringTex() {
  if (TEX.ring) return TEX.ring;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2), a = Math.exp(-Math.pow((d - 0.86) / 0.07, 2)) + 0.12 * clamp(1 - d) * (d < 0.86 ? 1 : 0), i = (y * S + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = Math.round(clamp(a) * 255);
  }
  g.putImageData(img, 0, 0);
  return (TEX.ring = canvasTex(c));
}
const G_FLAT = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(2, 2)); })();

registerVfxExtension(vfx => (vfx.gld = new GoldenFX(vfx)));
/** the GoldenFX of the current world's VFX (made there if the hook missed it) */
export function gldFx(G) { const v = G.vfx; if (!v.gld) { v.gld = new GoldenFX(v); v.ext?.push(v.gld); } return v.gld; }
