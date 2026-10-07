// The Shih Tzu's gear (docs/SHIHTZU.md §8): the toy flail (a chew-bone handle, a plum braided rope, a rubber-nub ball
// with a ghostlight paw) with real secondary motion: the rope and ball ride a small verlet chain driven by his paw.
//
//  - the Blender prop public/models/shihtzu-flail.glb (FLAIL_MODEL): nodes flail_handle → flail_link_0..5 → flail_head, the
//    pivots at prop_mount.json's chain_rest_pivots (the handle's grip centre at the origin, the rope knotted on at +0.12,
//    a link every 0.095, the head's pivot at 0.69, the ball's centre at 0.79, all along the prop's +Y); until it loads (or
//    if it's missing) a procedural flail of the same layout stands in, swapped in place;
//  - flailObject(): a flail as the game places it: a holder (the prop's frame) → the handle → its links and head, all
//    children of the handle, each posed every frame from the chain (FlailChain) in the handle's frame;
//  - FlailChain: eight particles (the knot on the handle, pinned; the six link joints; the ball's centre) under gravity
//    and air drag, with the link lengths held, a little bending stiffness, a ground clamp with friction, pushed out of
//    his body (spheres on the hips, chest and head), optionally guided toward a direction (a swing pose's A.flailDir and
//    A.flailW: the ball follows it with the rope's own lag, so a swing whips and a recovery trails), and on his back with
//    the ball hooked on his belt as well. Fixed 1/120 s steps, the anchor interpolated through each frame's sub-steps;
//    no allocation per frame;
//  - dressShihtzu(rig): the flail on his back (the baked rig's flailMount, else the kit rig's `back`), settled once (a
//    villager's flail hangs still); installShihtzuGear(Player.prototype): holdFlail / dropFlail / carryFlail — in his paw
//    in a fight (drawn by any swing, put away after a few quiet seconds in town), on his back otherwise, simulated live.
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { loadGlb, glbInstance } from '../gfx/glbAssets.js';
import { WHITE_CAP } from './heroModels.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const C = h => new THREE.Color(h);
export const FLAIL_MODEL = { file: 'models/shihtzu-flail.glb' };
// the chain's layout along the prop's +Y (m): the rope's knot on the handle, the link joints, the head's pivot, the ball's centre
const KNOT = 0.12, PIV = [0.12, 0.215, 0.31, 0.405, 0.5, 0.595, 0.69], BALL_Y = 0.79, BALL_R = 0.11, ROPE_R = 0.026;
const N = 8; // particles: 0 the knot (pinned), 1..6 the link joints (6 = the head's pivot), 7 the ball's centre
const SEG = [0.095, 0.095, 0.095, 0.095, 0.095, 0.095, 0.1]; // rest lengths between neighbours (×the holder's world scale)
const CUM = [0, 0.095, 0.19, 0.285, 0.38, 0.475, 0.57, 0.67]; // each particle's distance down the chain from the knot
const INV_MASS = [0, 1, 1, 1, 1, 1, 0.6, 0.22]; // the ball is heavy (the knot is pinned)
// the grips (prop_mount.json): the one-handed hold in the right mitten (the prop's orientation in the paw's frame: the
// handle passes forward through the closed mitten) — the palm group sits at the grip centre (HERO_MODELS palm)
export const GRIP = { quat: [0.633417, -0.26237, -0.278584, 0.67256] };
// on his back, like a baldric: the holder sits at the rig's flailMount (HERO_MODELS.shihtzuToy, model space: the handle up his
// right shoulder blade, the pommel between the ears, the rope's knot at its lower end) and the ball hooks at his left hip,
// behind the tome, at BACK_HOOK (model space, game axes): the rope runs down across the cape like a sash, sagging a little,
// and bobs as he walks (his ears drape over everything above y 0.64 past |x| 0.18; his tail sits at the right hip)
export const BACK_HOOK = { pos: [0.25, 0.35, -0.34], bone: 'hips' };
// the kit rig (no flailMount): on rig.parts.back
const KIT_BACK = { pos: [-0.04, 0.05, -0.04], rot: [0, 0, 0.6], scale: 0.85 };

// ------------------------------------------------------------------ the procedural stand-in (same layout as the prop)
function capsuleY(r, y0, y1, col, seg = 12) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, y1 - y0), 5, seg); g.translate(0, (y0 + y1) / 2, 0);
  const c = C(col), d = c.clone().multiplyScalar(0.8);
  return paint(g, (p, n, o) => o.copy(c).lerp(d, Math.max(0, -n.x) * 0.5));
}
function sphere(r, p, col, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))); g.translate(...p);
  const c = C(col), d = c.clone().multiplyScalar(0.7), l = c.clone().lerp(C('#ffffff'), 0.25);
  return paint(g, (pp, n, o) => { o.copy(c); if (n.y > 0.4) o.lerp(l, (n.y - 0.4) * 0.8); else if (n.y < -0.2) o.lerp(d, -n.y * 0.7); });
}
let PROC = null;
function procGeos() {
  if (PROC) return PROC;
  const bone = '#f4f0ea', rope = '#6a3a6a', ball = '#2c2a30', glow = '#5ce0c0';
  const handle = merge([capsuleY(0.026, -0.1, 0.1, bone), sphere(0.034, [0.024, -0.125, 0], bone), sphere(0.034, [-0.024, -0.125, 0], bone), sphere(0.034, [0.024, 0.125, 0], bone), sphere(0.034, [-0.024, 0.125, 0], bone)]);
  const link = merge([capsuleY(ROPE_R * 0.85, 0, 0.1, rope, 10)]);
  const parts = [sphere(BALL_R, [0, BALL_Y - 0.69, 0], ball, 18)];
  for (let i = 0; i < 14; i++) { const a = i * 2.39996, y = 1 - (i + 0.5) / 7, r = Math.sqrt(Math.max(0, 1 - y * y)); parts.push(sphere(0.026, [Math.cos(a) * r * BALL_R, BALL_Y - 0.69 + y * BALL_R, Math.sin(a) * r * BALL_R], ball, 8)); }
  const head = merge(parts);
  const paw = merge([sphere(0.03, [0, BALL_Y - 0.69, BALL_R + 0.004], glow, 10)]);
  for (const g of [handle, link, head, paw]) g.computeBoundingSphere();
  return (PROC = { handle, link, head, paw });
}
let PROC_MAT = null, PAW_MAT = null;
const procMat = () => PROC_MAT || (PROC_MAT = makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }));
const pawMat = () => PAW_MAT || (PAW_MAT = new THREE.MeshBasicMaterial({ color: '#5ce0c0', toneMapped: false }));

// ------------------------------------------------------------------ the Blender prop
const GLB = { state: 'idle', tpl: null, live: [] };
const CHAIN_NODE = /^flail_(handle|head|link_\d)$/;
export function loadFlailModel() {
  if (GLB.state !== 'idle') return;
  GLB.state = 'loading';
  loadGlb(BASE + FLAIL_MODEL.file).then(tpl => {
    // the bone handle and the cream nubs under a warm point light (a Burrow campfire) bloomed orange: the prop's textured
    // toon gets the hero's white cap (heroModels.js WHITE_CAP); the glow material is left as it is
    const capped = new Map();
    tpl.traverse(o => {
      if (!o.isMesh || /glow/i.test(o.material?.name || '')) return;
      const m = o.material; let c = capped.get(m);
      if (!c) { c = makeToon({ map: m.map || null, color: m.color, side: m.side, rim: 0.35, brush: 0.08, objectBrush: true, fragPars: 'uniform float uWhiteCap;', fragOut: WHITE_CAP, uniforms: { uWhiteCap: { value: 0.95 } } }); c.name = m.name; capped.set(m, c); }
      o.material = c;
    });
    GLB.tpl = tpl; GLB.state = 'ready';
    for (const w of GLB.live.splice(0)) { const f = w.deref?.() ?? w; if (f?.userData?.flail) fillFlail(f.userData.flail); }
  }, err => { GLB.state = 'missing'; console.warn('[shihtzu] the flail model did not load; the procedural one stays', err?.message || err); });
}
export const flailModelReady = () => GLB.state === 'ready';
/** the prop's node `name` (from a name → node map of a fresh instance), detached from its chain children and its pivot */
function glbPart(nodes, name) {
  const n = nodes.get(name);
  if (!n) return null;
  for (const c of [...n.children]) if (CHAIN_NODE.test(c.name)) n.remove(c); // (not its own meshes: a two-material head is a group of flail_head_* meshes)
  n.parent?.remove(n); n.position.set(0, 0, 0); n.quaternion.identity(); n.scale.set(1, 1, 1);
  n.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.userData.flailBase = o.material; } });
  return n;
}
// ------------------------------------------------------------------ per-base tints (the item's icon colours: [ball, rope, handle])
// The prop's one texture painted per part; a tint recolours a part's texels by luminance (tint × texel / the part's mean),
// so the painted shading, the braid and the rubber's speckle stay. Only the ball's rubber and the rope take it (the bone
// handle and the ghostlight paw stay as painted). The Toy Flail's colours are the texture's own: no tint. Materials are
// cached per part and colour (12 bases at most: 24 materials), shared by every flail showing that base.
const FLAIL_TINT = /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = pow(clamp(uTint * (0.25 + 0.75 * l / uTintRef), 0.0, 1.0), vec3(2.2));
  }`;
const TINT_REF = { ball: 0.179, rope: 0.229 }; // the texture's median luminance on each part (sampled from the prop)
const PLAIN = { ball: '#2c2a30', rope: '#7a4a7a' }; // (the Toy Flail: the texture as painted)
const TINTS = new Map();
const srgb = hex => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
function tintMat(base, part, hex) {
  const key = `${part}|${hex}`; let m = TINTS.get(key);
  if (!m) {
    m = makeToon({ map: base.map || null, side: base.side, rim: 0.35, brush: 0.08, objectBrush: true, fragPars: 'uniform float uWhiteCap; uniform vec3 uTint; uniform float uTintRef;', fragColor: FLAIL_TINT, fragOut: WHITE_CAP,
      uniforms: { uWhiteCap: { value: 0.95 }, uTint: { value: srgb(hex) }, uTintRef: { value: TINT_REF[part] } } });
    m.name = `${base.name}_${part}_${hex}`; TINTS.set(key, m);
  }
  return m;
}
function tintFlail(F) {
  if (F.kind !== 'glb') return; // (the procedural stand-in shows only while the prop loads)
  const [ball, rope] = F.look || [];
  const set = (root, part, hex) => root.traverse(o => {
    const b = o.isMesh && o.userData.flailBase; if (!b || !b.map) return; // (the ghostlight paw: untextured, kept)
    o.material = hex && hex.toLowerCase() !== PLAIN[part] ? tintMat(b, part, hex.toLowerCase()) : b;
  });
  for (const c of F.head.children) if (c.userData.flailPart) set(c, 'ball', ball);
  for (const l of F.links) for (const c of l.children) if (c.userData.flailPart) set(c, 'rope', rope);
}
/** the flail's look for an item (its icon: { colors: [ball, rope, handle] }); null → the Toy Flail as painted */
export function setFlailLook(F, look) {
  const k = look?.colors?.length ? look.colors.slice(0, 2).join(',') : '';
  if (F.lookKey === k) return;
  F.lookKey = k; F.look = k ? look.colors : null;
  tintFlail(F);
}
function fillFlail(F) {
  const glb = GLB.state === 'ready';
  if (F.kind === (glb ? 'glb' : 'proc')) return;
  F.kind = glb ? 'glb' : 'proc';
  const slots = [F.handle, ...F.links, F.head];
  for (const s of slots) for (const c of [...s.children]) if (c.userData.flailPart) s.remove(c);
  const put = (slot, o) => { if (!o) return; o.userData.flailPart = true; slot.add(o); };
  if (glb) {
    const inst = glbInstance(GLB.tpl), nodes = new Map();
    inst.traverse(o => { if (CHAIN_NODE.test(o.name) && !nodes.has(o.name)) nodes.set(o.name, o); }); // (all of them first: detaching one cuts its chain off)
    put(F.handle, glbPart(nodes, 'flail_handle'));
    F.links.forEach((l, i) => put(l, glbPart(nodes, `flail_link_${i}`)));
    put(F.head, glbPart(nodes, 'flail_head'));
    tintFlail(F);
  } else {
    const G = procGeos(), m = procMat();
    const mk = (g, mat = m) => { const x = new THREE.Mesh(g, mat); x.castShadow = mat === m; return x; };
    put(F.handle, mk(G.handle));
    for (const l of F.links) put(l, mk(G.link));
    const h = new THREE.Group(); h.add(mk(G.head), mk(G.paw, pawMat())); put(F.head, h);
  }
  F.holder.traverse(o => { if (o.isMesh) o.castShadow = F.shadow !== false; });
}

// ------------------------------------------------------------------ a flail as placed in the game
/** → the flail record { holder, handle, links[6], head, chain, kind } (holder.userData.flail = it). The holder is the
 *  prop's frame (its +Y the handle → rope → ball, straightened); every link and the head are the handle's children. */
export function flailObject() {
  if (GLB.state === 'idle') loadFlailModel();
  const holder = new THREE.Group(); holder.name = 'flail';
  const handle = new THREE.Group(); handle.name = 'flail_handle'; holder.add(handle);
  const links = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.Group(); l.name = `flail_link_${i}`; l.position.set(0, PIV[i], 0); handle.add(l); links.push(l); }
  const head = new THREE.Group(); head.name = 'flail_head'; head.position.set(0, PIV[6], 0); handle.add(head);
  const F = { holder, handle, links, head, chain: new FlailChain(), kind: null };
  holder.userData.flail = F;
  fillFlail(F);
  if (GLB.state === 'loading') GLB.live.push(typeof WeakRef !== 'undefined' ? new WeakRef(holder) : holder);
  return F;
}
export function flailShadow(F, on) { if (!F) return; F.shadow = on; F.holder.traverse(o => { if (o.isMesh && o.material !== PAW_MAT) o.castShadow = on; }); }

// ------------------------------------------------------------------ the chain
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _hq = new THREE.Quaternion();
const _inv = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const H = 1 / 120, MAX_STEPS = 5, GRAV = 9.8, DRAG = 1.4, ITER = 5;
export class FlailChain {
  constructor() {
    this.x = new Float32Array(N * 3); this.p = new Float32Array(N * 3);
    this.a0 = new THREE.Vector3(); this.a1 = new THREE.Vector3(); // the knot's world position last frame / now
    this.hook = new THREE.Vector3(); this.hooked = false;         // on his back: the ball's belt hook (world)
    this.guide = new THREE.Vector3(); this.guideW = 0;             // a swing pose's pull: the world direction from the knot, 0..1
    this.ground = -1e9; this.s = 1; this.acc = 0; this.ready = false;
    this.bodies = new Float32Array(4 * 4); this.nb = 0;            // collider spheres (x, y, z, r) in world
    this.speed = 0;                                               // the ball's speed (m/s): the whoosh / trail can read it
  }
  /** lay the chain out straight from the knot along `dir` (world), at rest */
  reset(knot, dir) {
    const x = this.x, p = this.p;
    for (let i = 0; i < N; i++) { const k = i * 3, c = CUM[i] * this.s; x[k] = p[k] = knot.x + dir.x * c; x[k + 1] = p[k + 1] = knot.y + dir.y * c; x[k + 2] = p[k + 2] = knot.z + dir.z * c; }
    this.a0.copy(knot); this.a1.copy(knot); this.acc = 0; this.ready = true;
  }
  /** advance by dt with the knot now at `knot` (world); the colliders, ground, hook and guide set beforehand */
  update(dt, knot) {
    this.a0.copy(this.a1); this.a1.copy(knot);
    this.acc = Math.min(this.acc + dt, H * MAX_STEPS);
    let n = Math.floor(this.acc / H); if (n < 1) { this.pin(this.a1); return; }
    this.acc -= n * H;
    const bx = this.x[21], by = this.x[22], bz = this.x[23];
    for (let k = 1; k <= n; k++) { _a.lerpVectors(this.a0, this.a1, k / n); this.step(_a); }
    this.speed = Math.hypot(this.x[21] - bx, this.x[22] - by, this.x[23] - bz) / (n * H);
  }
  pin(a) { this.x[0] = this.p[0] = a.x; this.x[1] = this.p[1] = a.y; this.x[2] = this.p[2] = a.z; }
  step(a) {
    const x = this.x, p = this.p, s = this.s, damp = 1 - DRAG * H, g = GRAV * H * H;
    // integrate (Verlet): velocity is x − p
    for (let i = 1; i < N; i++) {
      const k = i * 3;
      const vx = (x[k] - p[k]) * damp, vy = (x[k + 1] - p[k + 1]) * damp, vz = (x[k + 2] - p[k + 2]) * damp;
      p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2];
      x[k] += vx; x[k + 1] += vy - g; x[k + 2] += vz;
    }
    // the guide: each particle nudged toward the straight line along the swing's direction (more toward the ball)
    const w = this.guideW;
    if (w > 0.001) {
      const G = this.guide;
      for (let i = 1; i < N; i++) {
        const k = i * 3, f = w * 0.16 * (i / (N - 1)) ** 1.5, c = CUM[i] * s;
        x[k] += (a.x + G.x * c - x[k]) * f; x[k + 1] += (a.y + G.y * c - x[k + 1]) * f; x[k + 2] += (a.z + G.z * c - x[k + 2]) * f;
      }
    }
    this.pin(a);
    for (let it = 0; it < ITER; it++) {
      // the links' lengths
      for (let i = 0; i < N - 1; i++) {
        const k = i * 3, j = k + 3, L = SEG[i] * s;
        const dx = x[j] - x[k], dy = x[j + 1] - x[k + 1], dz = x[j + 2] - x[k + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const wa = INV_MASS[i], wb = INV_MASS[i + 1], sum = wa + wb; if (!sum) continue;
        const e = (d - L) / d / sum;
        x[k] += dx * e * wa; x[k + 1] += dy * e * wa; x[k + 2] += dz * e * wa;
        x[j] -= dx * e * wb; x[j + 1] -= dy * e * wb; x[j + 2] -= dz * e * wb;
      }
      // a braided rope doesn't fold tight: neighbours-but-one keep at least 70% of their straight span
      for (let i = 0; i < N - 2; i++) {
        const k = i * 3, j = k + 6, L = (SEG[i] + SEG[i + 1]) * s * 0.7;
        const dx = x[j] - x[k], dy = x[j + 1] - x[k + 1], dz = x[j + 2] - x[k + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d >= L) continue;
        const wa = INV_MASS[i], wb = INV_MASS[i + 2], sum = wa + wb; if (!sum) continue;
        const e = (d - L) / d / sum * 0.5;
        x[k] += dx * e * wa; x[k + 1] += dy * e * wa; x[k + 2] += dz * e * wa;
        x[j] -= dx * e * wb; x[j + 1] -= dy * e * wb; x[j + 2] -= dz * e * wb;
      }
      // his body: out of the collider spheres
      for (let i = 1; i < N; i++) {
        const k = i * 3, r0 = (i === N - 1 ? BALL_R : ROPE_R) * s;
        for (let b = 0; b < this.nb; b++) {
          const o = b * 4, dx = x[k] - this.bodies[o], dy = x[k + 1] - this.bodies[o + 1], dz = x[k + 2] - this.bodies[o + 2], R = this.bodies[o + 3] + r0;
          const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= R * R || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), e = (R - d) / d;
          x[k] += dx * e; x[k + 1] += dy * e; x[k + 2] += dz * e;
        }
      }
      if (this.hooked) { x[21] = this.hook.x; x[22] = this.hook.y; x[23] = this.hook.z; }
      this.pin(a);
    }
    // inextensible: a last pass out from the knot puts each joint at no more than its link's length from the one before
    // (a fast whip outruns the relaxation above and the links would part)
    for (let i = 1; i < N; i++) {
      const k = i * 3, j = k - 3, L = SEG[i - 1] * s;
      const dx = x[k] - x[j], dy = x[k + 1] - x[j + 1], dz = x[k + 2] - x[j + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L && d > 1e-6) { const e = L / d; x[k] = x[j] + dx * e; x[k + 1] = x[j + 1] + dy * e; x[k + 2] = x[j + 2] + dz * e; }
    }
    // the ground: no sinking, and friction while touching it (the ball drags and hops)
    for (let i = 1; i < N; i++) {
      const k = i * 3, gy = this.ground + (i === N - 1 ? BALL_R : ROPE_R) * s;
      if (x[k + 1] < gy) { x[k + 1] = gy; p[k] += (x[k] - p[k]) * 0.35; p[k + 2] += (x[k + 2] - p[k + 2]) * 0.35; if (p[k + 1] < gy) p[k + 1] = gy + (gy - p[k + 1]) * 0.25; }
    }
    if (this.hooked) { x[21] = p[21] = this.hook.x; x[22] = p[22] = this.hook.y; x[23] = p[23] = this.hook.z; }
  }
  /** pose a flail's links and head from the chain (the handle's world matrix is current). Link i of the prop runs from
   *  pivot i to pivot i+1 (PIV[0] is the knot), so it spans particles i → i+1; the head spans 6 (its pivot) → 7 (the ball) */
  apply(F) {
    const x = this.x, h = F.handle;
    _inv.copy(h.matrixWorld).invert();
    h.matrixWorld.decompose(_p, _hq, _s); _hq.invert();
    for (let i = 0; i < 7; i++) {
      const o = i < 6 ? F.links[i] : F.head, k = i * 3;
      _a.set(x[k], x[k + 1], x[k + 2]); _b.set(x[k + 3], x[k + 4], x[k + 5]);
      _d.subVectors(_b, _a); const L = _d.length(); if (L > 1e-6) _d.multiplyScalar(1 / L); else _d.copy(_up);
      _q.setFromUnitVectors(_up, _d).premultiply(_hq);
      o.position.copy(_a).applyMatrix4(_inv); o.quaternion.copy(_q);
    }
  }
}

// ------------------------------------------------------------------ dressing a rig
const _k = new THREE.Vector3(), _dir = new THREE.Vector3(), _bw = new THREE.Vector3();
/** the knot's world position (the handle's +Y at KNOT) */
const knotOf = (F, out) => out.set(0, KNOT, 0).applyMatrix4(F.handle.matrixWorld);
/** the holder's world scale (the prop's metres → world) */
const scaleOf = F => { F.handle.matrixWorld.decompose(_p, _q, _s); return (_s.x + _s.y + _s.z) / 3; };
/** Mount the flail on a Shih Tzu rig's back (idempotent) → the flail record (rig.parts.flail). The baked rig: at
 *  parts.flailMount (heroModels.js), the ball hooked at BACK_HOOK; the kit rig: on parts.back. Settled once, so a
 *  villager's flail drapes still; the player's is simulated live (carryFlail). */
export function dressShihtzu(rig) {
  if (!rig?.parts) return null;
  if (rig.parts.flail) return rig.parts.flail;
  if (!rig.disney && !rig.bakedDisney && !rig.toy) classicCoat(rig);
  if (!rig.bakedDisney && !rig.toy) topknot(rig); // (the classic and Storybook kits: his white topknot; the Toybox kit has its own, shihtzuKit.js. Before the flail goes on: its unsettled chain would top the crown's box)
  const F = flailObject(); F.holder.name = 'flail_back';
  const mount = rig.parts.flailMount, back = mount || rig.parts.back || rig.parts.body; if (!back) return null;
  if (mount) F.holder.scale.setScalar(mount.userData.scale || 1);
  else { F.holder.position.set(...KIT_BACK.pos); F.holder.rotation.set(...KIT_BACK.rot); F.holder.scale.setScalar(KIT_BACK.scale); }
  back.add(F.holder);
  // the belt hook (the baked rig's hips; the kit's body)
  const hb = findBone(rig, BACK_HOOK.bone) || rig.parts.body;
  const hook = new THREE.Group(); hook.name = 'flailHook';
  if (hb && mount) { rig.root.updateMatrixWorld(true); const w = rig.root.localToWorld(new THREE.Vector3(...BACK_HOOK.pos)); hb.worldToLocal(w); hook.position.copy(w); hb.add(hook); }
  else { (rig.parts.body || back).add(hook); hook.position.set(-0.12, -0.12, -0.12); }
  F.hookObj = hook;
  rig.parts.flail = F;
  F.mode = 'back';
  settle(rig, F);
  return F;
}
/** the white topknot with its plum band on a kit rig's crown (the classic / Storybook kits have no hook for it) */
function topknot(rig) {
  const head = rig.parts.head; if (!head) return;
  rig.root.updateMatrixWorld(true);
  // the crown: the top of the whole figure (his ears droop), above the head bone (each mesh's own box: a kit's skinned
  // parts can't be measured with Box3.setFromObject)
  const box = new THREE.Box3(), b = new THREE.Box3();
  rig.root.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); if (Number.isFinite(b.min.x) && Number.isFinite(b.max.y)) box.union(b); });
  if (box.isEmpty()) return;
  const hp = head.getWorldPosition(new THREE.Vector3()), s = Math.max(0.6, Math.min(1.6, (box.max.y - box.min.y) / 1.1));
  const at = head.worldToLocal(new THREE.Vector3(hp.x, box.max.y - 0.03 * s, hp.z));
  const mat = rig.propMat || rig.mat, white = new THREE.Color('#f4f0ea'), plum = new THREE.Color('#4a2a4a');
  const puff = (r, y, col, x = 0, z = 0) => { const g = new THREE.SphereGeometry(r, 16, 12); g.scale(1, 0.85, 1); g.translate(x, y, z); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const band = new THREE.TorusGeometry(0.034, 0.016, 8, 22); band.rotateX(Math.PI / 2); band.translate(0, 0.03, 0);
  { const n = band.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = plum.r; a[i * 3 + 1] = plum.g; a[i * 3 + 2] = plum.b; } band.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
  const g = new THREE.Group(); g.name = 'stzTopknot'; g.position.copy(at); g.scale.setScalar(s * 1.45); // (the kits' chibi heads are big: a third of the head's width)
  // a tuft gathered in the band and fanning out above it like a little fountain (a cluster of puffs wider than its stem,
  // so it never reads as a cone), the plum band round its narrow base
  const tuft = [puff(0.034, 0.02, white), puff(0.05, 0.1, white), puff(0.04, 0.085, white, 0.046, -0.006), puff(0.04, 0.085, white, -0.046, -0.006),
    puff(0.038, 0.08, white, 0, -0.044), puff(0.034, 0.088, white, 0.004, 0.04), puff(0.028, 0.135, white, -0.008, -0.01)];
  for (const geo of [...tuft, band]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
  head.add(g);
}
/** the classic kit: the grade's violet lift turns his warm charcoal coat plum on that kit's toon (the Toybox kit and the baked
 *  model counter it in the shader: darkGrade); here the coat's vertex colour leans green-gold instead, so it renders a
 *  neutral charcoal at the game's daylight */
function classicCoat(rig) {
  const fur = new THREE.Color(rig.spec?.fur || '#36352f'), to = [0.045, 0.06, 0.015];
  rig.root.traverse(o => {
    const c = o.isMesh && o.material === rig.mat && o.geometry?.attributes.color; if (!c) return;
    for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - fur.r) < 0.003 && Math.abs(c.getY(i) - fur.g) < 0.003 && Math.abs(c.getZ(i) - fur.b) < 0.003) c.setXYZ(i, to[0], to[1], to[2]);
    c.needsUpdate = true;
  });
}
function findBone(rig, name) { let b = null; rig.root.traverse(o => { if (!b && o.name === name) b = o; }); return b; }
/** colliders for his body (world spheres: the hips, the chest, the head) */
function bodies(rig, F, ch) {
  const P = rig.parts, s = scaleOf(F);
  F._bones ||= [findBone(rig, 'hips') || P.body, findBone(rig, 'chest') || P.body, P.head];
  const R = [0.25, 0.25, 0.3], OY = [0, 0.02, 0.22];
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const b = F._bones[i]; if (!b) continue;
    b.getWorldPosition(_bw); const o = n * 4; // (its own temp: _k holds the knot through this)
    ch.bodies[o] = _bw.x; ch.bodies[o + 1] = _bw.y + OY[i] * s; ch.bodies[o + 2] = _bw.z; ch.bodies[o + 3] = R[i] * s; n++;
  }
  ch.nb = n;
}
/** run the chain to rest where it hangs now (a fresh mount, a villager's flail) */
function settle(rig, F, steps = 90) {
  rig.root.updateMatrixWorld(true);
  const ch = F.chain; ch.s = scaleOf(F);
  knotOf(F, _k);
  ch.hooked = F.mode === 'back' && !!F.hookObj; if (ch.hooked) F.hookObj.getWorldPosition(ch.hook);
  bodies(rig, F, ch);
  ch.ground = rig.root.getWorldPosition(_b).y;
  _dir.set(0, -1, 0); if (ch.hooked) _dir.subVectors(ch.hook, _k).normalize();
  ch.reset(_k, _dir); ch.guideW = 0;
  for (let i = 0; i < steps; i++) ch.step(_k);
  ch.apply(F);
}
export const flailSettle = settle;

// ------------------------------------------------------------------ in the paw / on the back (the Player mixin uses these;
// so do the look page and the joining scene's actor)
/** put a rig's flail in its right paw (drawn) or on its back; re-settles the chain on a change */
export function mountFlail(rig, F, drawn) {
  if (!F || F.drawn === drawn) return;
  F.drawn = drawn;
  if (drawn) {
    rig.parts.handR.add(F.holder);
    F.holder.position.set(0, 0, 0); F.holder.quaternion.set(...GRIP.quat); F.holder.scale.setScalar(1);
    F.mode = 'hand';
  } else {
    const mount = rig.parts.flailMount, back = mount || rig.parts.back || rig.parts.body;
    back.add(F.holder);
    if (mount) { F.holder.position.set(0, 0, 0); F.holder.quaternion.identity(); F.holder.scale.setScalar(mount.userData.scale || 1); }
    else { F.holder.position.set(...KIT_BACK.pos); F.holder.rotation.set(...KIT_BACK.rot); F.holder.scale.setScalar(KIT_BACK.scale); }
    F.mode = 'back';
  }
  F.fresh = true;
}
const _gd = new THREE.Vector3();
/** advance a rig's flail chain by dt: the knot follows the paw (or the back mount), the pose's guide pulls the ball
 *  (A.flailDir in the hero's frame, A.flailW), the ground is `ground` (world y), facing the hero's yaw */
export function stepFlail(rig, F, dt, ground, facing, A) {
  const ch = F.chain;
  rig.root.updateMatrixWorld(true);
  ch.s = scaleOf(F);
  knotOf(F, _k);
  ch.hooked = F.mode === 'back' && !!F.hookObj; if (ch.hooked) F.hookObj.getWorldPosition(ch.hook);
  bodies(rig, F, ch);
  ch.ground = ground;
  const w = F.mode === 'hand' ? Math.min(1, A?.flailW || 0) : 0;
  if (w > 0.001 && A.flailDir) {
    const d = A.flailDir, sf = Math.sin(facing), cf = Math.cos(facing);
    _gd.set(d.x * sf + d.z * cf, d.y, d.x * cf - d.z * sf); if (_gd.lengthSq() > 1e-6) { ch.guide.copy(_gd.normalize()); ch.guideW = w; } else ch.guideW = 0;
  } else ch.guideW = 0;
  if (F.fresh || !ch.ready) { F.fresh = false; _dir.set(0, -1, 0); if (ch.hooked) _dir.subVectors(ch.hook, _k).normalize(); ch.reset(_k, _dir); for (let i = 0; i < 30; i++) ch.step(_k); }
  else ch.update(dt, _k);
  ch.apply(F);
}

// Drawn: any swing or Flail Arts skill brings it out; in the Burrow and the zones it stays out (the ball resting on the
// ground beside him when he's still); in town it goes back on his back ~3 s after the last swing.
const DRAWN_ACTS = new Set(['flailSwing1', 'flailSwing2', 'flailSlam', 'wallop', 'flailReady']);
const M = {
  /** the flail for the equipped item: on his back (dressShihtzu) and drawn into his paw when he fights */
  holdFlail(look) {
    const rig = this.rig, F = dressShihtzu(rig); if (!F) return;
    this.flail = F;
    setFlailLook(F, look?.colors ? look : this.equippedLook?.()); // (the base's ball and rope colours)
    // (Chewy's sword / ball, Moka's staff and Poe's fūma stay parked and hidden)
    if (this.sword) { this.sword.scale.setScalar(0.0001); this.sword.castShadow = false; }
    if (this.ball) { this.ball.scale.setScalar(0.0001); this.ball.castShadow = false; }
    if (this.swordBack) this.swordBack.visible = false;
    this.dropStaff?.(); this.dropFuma?.();
    this.carryFlail(0);
  },
  dropFlail() { this.flail = null; },
  /** per frame (Player.update): which mount, then the chain (driven by the knot, guided by a swing pose) */
  carryFlail(dt) {
    const F = this.flail; if (!F || this.weaponType !== 'flail') return;
    const a = this.anim?.action, mode = this.G?.mode, town = mode === 'village' || mode === 'interior';
    if (a && (DRAWN_ACTS.has(a.name) || a.def?.flail)) this._flailT = town ? 3 : 1e9;
    else if (!(this._flailT > 0) && !town) this._flailT = 1e9; // (out in a fight)
    this._flailT = Math.max(0, (this._flailT || 0) - dt);
    mountFlail(this.rig, F, this._flailT > 0 && !this.toolOut);
    F.holder.visible = !(this._ghost > 0.5);
    if (!F.holder.visible) return;
    stepFlail(this.rig, F, dt, this.pos.y, this.facing, this.anim?.A);
  },
};
export function installShihtzuGear(proto) { for (const k in M) if (!proto[k]) proto[k] = M[k]; }
/** the ball's world position (VFX: trails, the slam's impact) */
export function flailBall(F, out) { const x = F.chain.x; return out.set(x[21], x[22], x[23]); }
