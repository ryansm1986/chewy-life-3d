// Stella's gear (docs/STELLA.md §8): her parasol. Since the owner's Sun Oracle direction (2026-10-13) it is a **sun
// wagasa**: a sunburst canopy, a gold sun-disc finial, chunky tassels; about the jellyfish parasol's size and grip, so the
// rig, the mounts and the poses carry over. Until the builder's new GLB lands, the installed file is the jellyfish one.
//
//  - the Blender prop public/models/stella-parasol.glb: the grip at the origin, the shaft along the prop's +Y. Read from
//    the file, not hard-coded, so a new export drops in:
//      · every mesh becomes a part of the prop (baked into the prop's frame), each with its own material: a textured toon
//        with the hero's white cap for the canopy and shaft, a lit toon with a soft emission for a part whose mesh or
//        material is named glow / finial (or carries an emissive colour): the sun disc, the jellyfish's pearls;
//      · the finial: a node (an empty or a mesh) named finial → `PROP.finial`, where her light leaves the parasol (the
//        beams, the flares); else the top of the canopy;
//      · tassels: meshes or nodes named tassel* keep their own pivot (a group at the node's origin), so they can sway;
//      · `PARASOL.top` / `across` / `hook`: the measured extents.
//    A procedural stand-in of the same layout shows until it loads (or if it's missing), swapped in place;
//  - parasolObject(): a parasol as the game places it (a holder group: the prop's frame);
//  - dressStella(rig): the parasol over her right shoulder on the baked rig's parasolMount (the carry while her arm swings
//    free); else (the kit rig) on parts.back;
//  - mountParasol(rig, R, how): 'carry' (the shoulder mount), 'hand' (upright in her right paw, the arm at rest), 'shoulder'
//    (in her paw, over the shoulder: the arm held in POSES.shoulder) or 'cast' (in her paw, raised upright over her head:
//    the arm in POSES.cast). The grips are the builder's prop_mount.rig.json (tools/blender/work/codex/stella-toy): copy
//    the new file's quaternions into GRIP when the sun wagasa's export lands, if they change.
// No allocation per frame.
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { loadGlb } from '../gfx/glbAssets.js';
import { WHITE_CAP } from './heroModels.js';
import { PARASOL_HOLD } from './stellaPoses.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const C = h => new THREE.Color(h);
/** the prop's layout (metres, the prop's frame); the extents are re-measured from the file when it loads */
export const PARASOL = { file: 'models/stella-parasol.glb', top: 0.688, hook: -0.2116, r: 0.021, across: 0.78 };
const Q = (x, y, z, w) => new THREE.Quaternion(x, y, z, w).normalize();
/** the grips in her right paw (prop_mount.rig.json parasol.in_right_paw / carry_over_shoulder.in_hand_R): each maps the
 *  prop's axes into the hand bone's frame (the bones carry no rest rotation); the left paw mirrors them */
export const GRIP = {
  upright: Q(0, 0, 0, 1),
  cast: Q(0.831517, -0.078793, 0.117034, 0.537283),
  shoulder: Q(0.264693, -0.141442, 0.392361, 0.869474),
};
/** the arm poses those grips were made for (Animator key offsets, radians: armR the upper arm, foreR the forearm) */
export const POSES = {
  shoulder: { armR: [-0.55, 0, -0.1], foreR: [-1.0, 0, 0] },
  cast: { armR: [-2.4, 0, -0.12] },
};
// the kit rig (no parasolMount): on parts.back, the shaft up past her right shoulder
const KIT_BACK = { pos: [-0.08, 0.02, -0.04], rot: [-0.3, 0, 0.42], scale: 0.85 };
const GLOWY = /glow|finial/i, TASSEL = /tassel/i, FINIAL = /finial/i; // (the builder's names: a glow material, the finial's node, the tassels)

// ------------------------------------------------------------------ the procedural stand-in (the sun wagasa's layout)
let PROC = null;
function procGeo() {
  if (PROC) return PROC;
  const shaftC = C('#8a5a3a'), canopy = C('#fff1c8'), ray = C('#ffd36a'), gold = C('#f2b84a');
  const shaft = new THREE.CylinderGeometry(PARASOL.r, PARASOL.r, 0.72, 10, 1); shaft.translate(0, 0.2, 0);
  const hook = new THREE.TorusGeometry(0.05, PARASOL.r, 6, 12, Math.PI); hook.rotateZ(Math.PI); hook.translate(0.05, -0.16, 0);
  const bell = new THREE.SphereGeometry(0.38, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.32); bell.scale(1, 0.5, 1); bell.translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16); disc.rotateX(Math.PI / 2); disc.translate(0, PARASOL.top - 0.02, 0);
  const col = (g, c) => paint(g, (p, n, o) => o.copy(c));
  // the sunburst: alternating cream and gold panels round the canopy
  const rays = paint(bell, (p, n, o) => o.copy(Math.cos(Math.atan2(p.x, p.z) * 12) > 0 ? ray : canopy));
  PROC = merge([col(shaft, shaftC), col(hook, shaftC), rays, col(disc, gold)]);
  PROC.computeBoundingSphere();
  return PROC;
}
let PROC_MAT = null;
const procMat = () => PROC_MAT || (PROC_MAT = makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }));

// ------------------------------------------------------------------ the Blender prop
// The canopy and shaft take a toon with the hero's white cap (heroModels.js WHITE_CAP): a pale canopy under the Burrow's
// warm key light blooms to a glowing peach, as the Shih Tzu's cream fur did. A glowing part (the sun disc) is lit, so it
// reads round, with a soft emission of its own colour, normal blended: an additive glow summed on the bloom washes out.
const PROP = { state: 'idle', parts: [], finial: null, live: [], wait: null };
function partMaterial(m, glowy) {
  if (glowy) {
    const col = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05 ? m.emissive : (m.color || C('#ffe9a8'));
    const mat = makeToon({ color: m.color || '#ffffff', map: m.map || null, emissive: col, emissiveIntensity: 0.55, rim: 0.6, brush: 0, objectBrush: true });
    mat.name = `stella_parasol_glow:${m.name || ''}`;
    return mat;
  }
  const mat = makeToon({ map: m.map || null, color: m.map ? '#ffffff' : (m.color || '#ffffff'), side: THREE.DoubleSide, rim: 0.4, brush: 0.06, objectBrush: true, fragPars: 'uniform float uWhiteCap;', fragOut: WHITE_CAP, uniforms: { uWhiteCap: { value: 0.98 } } });
  mat.name = `stella_parasol:${m.name || ''}`;
  return mat;
}
function loadProp() {
  if (PROP.state !== 'idle') return;
  PROP.state = 'loading';
  loadGlb(BASE + PARASOL.file).then(tpl => {
    tpl.updateMatrixWorld(true);
    const box = new THREE.Box3(), mats = new Map(), parts = [];
    const tasselOf = o => { for (let p = o; p && p !== tpl; p = p.parent) if (TASSEL.test(p.name || '')) return p; return null; };
    tpl.traverse(o => {
      if (FINIAL.test(o.name || '') && !PROP.finial) PROP.finial = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      if (!o.isMesh) return;
      const m = o.material, glowy = GLOWY.test(o.name || '') || GLOWY.test(m?.name || '') || (m?.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3);
      const key = `${m?.uuid}|${glowy}`;
      if (!mats.has(key)) mats.set(key, partMaterial(m || {}, glowy));
      // a tassel keeps its pivot: the geometry relative to its node's origin, the group placed there
      const t = tasselOf(o), pivot = t ? new THREE.Vector3().setFromMatrixPosition(t.matrixWorld) : null;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (pivot) geo.translate(-pivot.x, -pivot.y, -pivot.z);
      geo.computeBoundingSphere(); box.union(new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(o.matrixWorld));
      parts.push({ geo, mat: mats.get(key), glowy, pivot, name: o.name });
    });
    if (!parts.length) throw new Error('no mesh');
    PROP.parts = parts;
    PARASOL.top = +box.max.y.toFixed(3); PARASOL.hook = +box.min.y.toFixed(3); PARASOL.across = +Math.max(box.max.x - box.min.x, box.max.z - box.min.z).toFixed(3);
    PROP.finial ||= new THREE.Vector3(0, PARASOL.top, 0);
    PROP.state = 'ready';
    for (const w of PROP.live.splice(0)) { const h = w.deref?.() ?? w; if (h?.userData?.prop) fill(h.userData.prop); }
    for (const fn of PROP.wait || []) fn(); PROP.wait = null;
  }).catch(err => { PROP.state = 'missing'; console.warn('[stella] the parasol model did not load; the procedural one stays', err?.message || err); });
}
export function loadStellaProps() { loadProp(); return new Promise(res => whenParasol(res)); }
export const parasolModelReady = () => PROP.state === 'ready';
/** where her light leaves the parasol, in the prop's frame (the finial's sun disc; the canopy's top until the file says) */
export const finialPoint = (out = new THREE.Vector3()) => (PROP.finial ? out.copy(PROP.finial) : out.set(0, PARASOL.top, 0));
/** call fn once the parasol is in (or now) */
export function whenParasol(fn) { loadProp(); if (PROP.state === 'ready' || PROP.state === 'missing') fn(); else (PROP.wait ||= []).push(fn); }
function fill(R) {
  const ready = PROP.state === 'ready';
  for (const o of R.objs) o.parent?.remove(o);
  R.objs.length = 0; R.tassels.length = 0; R.mesh = null; R.glow = null;
  const add = (geo, mat, name, pivot, glowy) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.castShadow = R.shadow !== false && !glowy;
    let obj = mesh;
    if (pivot) { obj = new THREE.Group(); obj.name = `${name}_pivot`; obj.position.copy(pivot); obj.add(mesh); R.tassels.push(obj); }
    R.holder.add(obj); R.objs.push(obj);
    if (glowy) R.glow ||= mesh; else R.mesh ||= mesh;
  };
  if (ready) for (const p of PROP.parts) add(p.geo, p.mat, p.name || 'parasol_part', p.pivot, p.glowy);
  else add(procGeo(), procMat(), 'parasol_mesh', null, false);
  R.glb = ready;
}
/** a parasol as placed in the game → { holder, mesh, glow, tassels, glb } (holder.userData.prop = it): the prop's frame,
 *  the grip at the origin, the shaft along +Y */
export function parasolObject() {
  loadProp();
  const holder = new THREE.Group(); holder.name = 'parasol';
  const R = { kind: 'parasol', holder, mesh: null, glow: null, objs: [], tassels: [], glb: false };
  holder.userData.prop = R;
  fill(R);
  if (PROP.state === 'loading') PROP.live.push(typeof WeakRef !== 'undefined' ? new WeakRef(holder) : holder);
  return R;
}
export function propShadow(R, on) { if (!R) return; R.shadow = on; for (const o of R.objs) o.traverse(m => { if (m.isMesh && !/glow/.test(m.material?.name || '')) m.castShadow = on; }); }

// ------------------------------------------------------------------ on her
/** put the parasol where `how` says (see the header) */
export function mountParasol(rig, R, how = 'carry') {
  if (!rig || !R) return;
  const h = R.holder, P = rig.parts;
  if (how === 'carry') {
    const m = P.parasolMount;
    if (m) { if (h.parent !== m) m.add(h); h.position.set(0, 0, 0); h.quaternion.identity(); h.scale.setScalar(m.userData.scale ?? 1); }
    else { const b = P.back || P.body; if (h.parent !== b) b.add(h); h.position.set(...KIT_BACK.pos); h.rotation.set(...KIT_BACK.rot); h.scale.setScalar(KIT_BACK.scale); }
  } else {
    const hand = P.handR; if (!hand) return;
    if (h.parent !== hand) hand.add(h);
    h.position.set(0, 0, 0); h.quaternion.copy(GRIP[how === 'hand' ? 'upright' : how] || GRIP.upright); h.scale.setScalar(1);
  }
  R.how = how;
}
/** the parasol on her (the baked rig's shoulder mount, or the kit's back) → the prop record (rig.parts.parasol) */
export function dressStella(rig) {
  if (!rig || rig.quadruped) return null;
  if (rig.parts.parasol) return rig.parts.parasol;
  const R = parasolObject();
  mountParasol(rig, R, 'carry');
  rig.parts.parasol = R;
  return R;
}
/** an Animator stance that holds one of POSES at weight k (the look page and the QA: anim.stance = parasolStance('shoulder')) */
export function parasolStance(name) {
  const k0 = POSES[name]; if (!k0) return null;
  return (A, t, k) => { for (const n in k0) { const v = k0[n], a = A[n]; if (!a) continue; a.x += v[0] * k; a.y += v[1] * k; a.z += v[2] * k; } if (name === 'shoulder') A.armLock = Math.max(A.armLock || 0, k); };
}

// ------------------------------------------------------------------ aiming the wagasa in her paw (as goldenGear.js aims the lance)
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** the hold with no pose aiming it: leaning out to her right and a touch behind (stellaPoses.js HOLD's dir, normalised) */
export const HOLD_DIR = { x: -0.283, y: 0.774, z: -0.566 };
const HOLD_UP = { x: 1, y: 0, z: 0 };
/** hero frame (x forward, y up, z her left) → world, for a yaw f */
function toWorld(v, f, out) { const sf = Math.sin(f), cf = Math.cos(f); return out.set(v.x * sf + v.z * cf, v.y, v.x * cf - v.z * sf); }
/** turn a holder (under the paw) so its +Y points along `dir` (world), its +Z toward `up` (world) */
function aimHolder(h, dir, up) {
  _x.crossVectors(dir, up); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).cross(dir); _x.normalize();
  _z.crossVectors(_x, dir).normalize();
  _m.makeBasis(_x, dir, _z); _q.setFromRotationMatrix(_m);
  h.parent.getWorldQuaternion(_pq); h.quaternion.copy(_pq.invert().multiply(_q));
}
/** point the wagasa in her paw (A.parasolDir / A.parasolUp at weight A.parasolW, blended over the hold) */
export function aimParasol(rig, R, facing, A) {
  const w = Math.min(1, Math.max(0, A?.parasolW || 0));
  _d.set(HOLD_DIR.x, HOLD_DIR.y, HOLD_DIR.z); _u.set(HOLD_UP.x, HOLD_UP.y, HOLD_UP.z);
  if (w > 0.001 && A.parasolDir) {
    const pd = A.parasolDir, pu = A.parasolUp;
    _d.multiplyScalar(1 - w).add(_a.set(pd.x, pd.y, pd.z));
    if (pu && (pu.x || pu.y || pu.z)) _u.multiplyScalar(1 - w).add(_b.set(pu.x, pu.y, pu.z));
  }
  if (_d.lengthSq() < 1e-6) _d.set(0, 1, 0);
  toWorld(_d.normalize(), facing, _a); toWorld(_u, facing, _b);
  rig.root.updateMatrixWorld(true);
  aimHolder(R.holder, _a, _b);
  R.holder.updateMatrixWorld(true);
}
/** the finial (where her light leaves the wagasa) in world space → out */
export function finialWorld(R, out) { R.holder.updateWorldMatrix(true, false); return finialPoint(out).applyMatrix4(R.holder.matrixWorld); }

// ------------------------------------------------------------------ the Player mixin
// Out: any wagasa move brings it into her paw; in the Burrow and the zones it stays out; in town it goes back to the
// shoulder carry ~3 s after the last move (and while a homestead tool is in her paw). The tassels sway with her.
const M = {
  /** the wagasa for the equipped item: over her shoulder (dressStella) and into her paw when she fights */
  holdParasol() {
    const R = dressStella(this.rig); if (!R) return;
    this.parasol = R;
    if (this.sword) { this.sword.scale.setScalar(0.0001); this.sword.castShadow = false; }
    if (this.ball) { this.ball.scale.setScalar(0.0001); this.ball.castShadow = false; }
    if (this.swordBack) this.swordBack.visible = false;
    this.dropStaff?.(); this.dropFuma?.(); this.dropFlail?.(); this.dropLance?.();
    this.carryParasol(0);
  },
  dropParasol() { this.parasol = null; if (this.anim && this.anim.stance === PARASOL_HOLD) this.anim.stance = null; },
  /** per frame (Player.update): which mount, the aim, the tassels */
  carryParasol(dt) {
    const R = this.parasol, rig = this.rig; if (!R || this.weaponType !== 'parasol') return;
    const a = this.anim?.action, def = a?.def, mode = this.G?.mode, town = mode === 'village' || mode === 'interior';
    if (def?.parasol || a?.name === 'charge' || this.G?.skills?.channel) this._parT = town ? 3 : 1e9;
    else if (!(this._parT > 0) && !town) this._parT = 1e9; // (out in a fight)
    this._parT = Math.max(0, (this._parT || 0) - dt);
    const out = this._parT > 0 && !this.toolOut;
    mountParasol(rig, R, out ? 'hand' : 'carry');
    R.holder.visible = !(this._ghost > 0.5);
    this.anim.stance = out ? PARASOL_HOLD : null;
    if (out) aimParasol(rig, R, this.facing, this.anim.A);
    swayTassels(R, dt, this);
  },
};
export function installStellaGear(proto) { for (const k in M) if (!proto[k]) proto[k] = M[k]; }
/** the tassels swing a little with her movement (their pivots: R.tassels) */
export function swayTassels(R, dt, actor) {
  if (!R?.tassels?.length) return;
  const v = actor?.anim?.vel, sp = v ? Math.min(1, Math.hypot(v.x, v.z) / 4) : 0, t = (R._tt = (R._tt || 0) + dt);
  for (let i = 0; i < R.tassels.length; i++) { const o = R.tassels[i]; o.rotation.x = Math.sin(t * 3.1 + i * 0.9) * (0.06 + 0.22 * sp); o.rotation.z = Math.cos(t * 2.6 + i * 1.3) * (0.05 + 0.12 * sp); }
}
