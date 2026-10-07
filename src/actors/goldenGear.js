// The Golden Retriever dragoon's gear (docs/GOLDEN.md §8): the toy lance (a braided-rope shaft, a tennis-ball pommel, an
// emerald rubber dragon-flame head behind a felt wing guard) and the blunt toy javelins from the quiver on his spine.
//
//  - the Blender props public/models/golden-lance.glb (LANCE: 1.6 m, the pivot at the main / rear grip, the shaft along
//    the prop's +Y, the off-hand grip at +0.44, the tip at +1.24, the pommel's end at −0.36) and golden-javelin.glb
//    (JAVELIN: 0.72 m, the pivot at the throwing grip, the gold rubber tip at +0.39): prop_mount.json in
//    tools/blender/codex/assets/golden-toy. Until they load (or if they're missing) procedural stand-ins of the same
//    layout show, swapped in place;
//  - lanceObject(): a lance as the game places it (a holder group: the prop's frame);
//  - dressGolden(rig): the lance on his back (the baked rig's lanceMount, else the kit rig's `back`), the javelin for
//    his paw (hidden until a throw shows it);
//  - installGoldenGear(Player.prototype): holdLance / dropLance / carryLance. Drawn, the holder sits at the right palm and
//    points where the pose says (A.lanceDir in his frame: x forward, y up, z his left; A.lanceW its weight, else the
//    guard: upright at his side), and in the moves the left paw is drawn onto the shaft (armIK reach, A.lanceTwo: the
//    two-handed thrusts and swats) at the point nearest where the pose put it; on a javelin throw the lance goes to his left paw, upright like a standard; put
//    away in town ~3 s after the last poke;
//  - javelinGeo() / javelinMat(): the javelin's geometry and material for the flying and stuck javelins (instanced:
//    gfx/goldenFx.js). No allocation per frame.
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { loadGlb } from '../gfx/glbAssets.js';
import { WHITE_CAP } from './heroModels.js';
import { reach } from './armIK.js';
import { clamp } from '../core/util.js';
import { LANCE_GUARD, GLD_JAV_STYLES } from './goldenPoses.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const C = h => new THREE.Color(h);
export const LANCE = { file: 'models/golden-lance.glb', off: 0.44, tip: 1.24, pommel: -0.36, r: 0.022, len: 1.6 };
export const JAVELIN = { file: 'models/golden-javelin.glb', tip: 0.39, tail: -0.31, r: 0.018, len: 0.72 };
// the kit rig (no lanceMount): on rig.parts.back, up past his right shoulder
const KIT_BACK = { pos: [-0.06, -0.02, -0.06], rot: [-0.12, 0, 0.32], scale: 0.85 };
// in his left paw while the right throws a javelin: upright like a standard, a touch back and out
const LEFT_HOLD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, -0.18));

// ------------------------------------------------------------------ the procedural stand-ins (same layout as the props)
function cyl(r0, r1, y0, y1, col, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1); g.translate(0, (y0 + y1) / 2, 0);
  const c = C(col), d = c.clone().multiplyScalar(0.8);
  return paint(g, (p, n, o) => o.copy(c).lerp(d, Math.max(0, -n.x) * 0.5));
}
function ball(r, y, col, seg = 14, sx = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)); g.scale(sx, 1, sz); g.translate(0, y, 0);
  const c = C(col), d = c.clone().multiplyScalar(0.72), l = c.clone().lerp(C('#ffffff'), 0.25);
  return paint(g, (p, n, o) => { o.copy(c); if (n.y > 0.4) o.lerp(l, (n.y - 0.4) * 0.8); else if (n.y < -0.2) o.lerp(d, -n.y * 0.7); });
}
let PROC = null;
function procGeos() {
  if (PROC) return PROC;
  const rope = '#f4e8d0', band = '#e0a868', emer = '#3a9a6a', brass = '#c8a050', yel = '#d6c85c';
  const shaft = [cyl(LANCE.r, LANCE.r, LANCE.pommel + 0.05, 0.9, rope)];
  for (let y = -0.2; y < 0.85; y += 0.16) shaft.push(cyl(LANCE.r * 1.12, LANCE.r * 1.12, y, y + 0.045, band));
  const lance = merge([...shaft, ball(0.052, LANCE.pommel + 0.02, yel), cyl(0.034, 0.034, 0.9, 0.95, brass), ball(0.1, 0.99, emer, 12, 1, 0.35),
    cyl(0.05, 0.002, 1.0, LANCE.tip, emer, 10)]);
  const jav = merge([cyl(JAVELIN.r, JAVELIN.r, JAVELIN.tail + 0.06, 0.32, rope, 10), ball(0.045, 0.34, brass, 12), ball(0.07, JAVELIN.tail + 0.08, emer, 10, 1, 0.25)]);
  lance.computeBoundingSphere(); jav.computeBoundingSphere();
  return (PROC = { lance, jav });
}
let PROC_MAT = null;
const procMat = () => PROC_MAT || (PROC_MAT = makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }));

// ------------------------------------------------------------------ the Blender props
// One mesh each, one textured material. The cream rope and the tennis ball took the warm key light's bloom like the
// Shih Tzu's bone handle did: the prop's toon gets the hero's white cap (heroModels.js WHITE_CAP).
const PROPS = { lance: { file: LANCE.file, state: 'idle', geo: null, mat: null, live: [] }, javelin: { file: JAVELIN.file, state: 'idle', geo: null, mat: null, live: [] } };
function loadProp(k) {
  const P = PROPS[k]; if (P.state !== 'idle') return;
  P.state = 'loading';
  loadGlb(BASE + P.file).then(tpl => {
    let mesh = null; tpl.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    if (!mesh) throw new Error('no mesh');
    tpl.updateMatrixWorld(true);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geo.computeBoundingSphere();
    const m = mesh.material;
    P.mat = makeToon({ map: m.map || null, side: m.side, rim: 0.35, brush: 0.08, objectBrush: true, fragPars: 'uniform float uWhiteCap;', fragOut: WHITE_CAP, uniforms: { uWhiteCap: { value: 0.95 } } });
    P.mat.name = `golden_${k}`; P.geo = geo; P.state = 'ready';
    for (const w of P.live.splice(0)) { const h = w.deref?.() ?? w; if (h?.userData?.prop) fill(h.userData.prop); }
    for (const fn of P.wait || []) fn(); P.wait = null;
  }).catch(err => { P.state = 'missing'; console.warn(`[golden] the ${k} model did not load; the procedural one stays`, err?.message || err); });
}
export function loadGoldenProps() { loadProp('lance'); loadProp('javelin'); }
export const lanceModelReady = () => PROPS.lance.state === 'ready';
/** call fn once the javelin prop is in (or now) */
export function whenJavelin(fn) { const P = PROPS.javelin; loadProp('javelin'); if (P.state === 'ready' || P.state === 'missing') fn(); else (P.wait ||= []).push(fn); }
/** the javelin's geometry and material (the prop, or the stand-in while it loads): the instanced javelins share them */
export const javelinGeo = () => (PROPS.javelin.state === 'ready' ? PROPS.javelin.geo : procGeos().jav);
export const javelinMat = () => (PROPS.javelin.state === 'ready' ? PROPS.javelin.mat : procMat());
function fill(R) {
  const P = PROPS[R.kind], ready = P.state === 'ready';
  const geo = ready ? P.geo : procGeos()[R.kind === 'lance' ? 'lance' : 'jav'], mat = ready ? (R.look ? tintMat(R.look) : P.mat) : procMat(); // (a lance base's tint: setLanceLook)
  if (R.mesh && R.mesh.geometry === geo && R.mesh.material === mat) return;
  if (!R.mesh) { R.mesh = new THREE.Mesh(geo, mat); R.mesh.name = `${R.kind}_mesh`; R.mesh.castShadow = R.shadow !== false; R.holder.add(R.mesh); }
  else { R.mesh.geometry = geo; R.mesh.material = mat; }
  R.glb = ready;
}
function propObject(kind) {
  loadProp(kind);
  const holder = new THREE.Group(); holder.name = kind;
  const R = { kind, holder, mesh: null, glb: false };
  holder.userData.prop = R;
  fill(R);
  if (PROPS[kind].state === 'loading') PROPS[kind].live.push(typeof WeakRef !== 'undefined' ? new WeakRef(holder) : holder);
  return R;
}
/** a lance as placed in the game → { holder, mesh, kind: 'lance' } (holder.userData.prop = it): the prop's frame, the
 *  main grip at the origin, the shaft along +Y */
export const lanceObject = () => propObject('lance');
/** one javelin (the paw's, the joining scene's) */
export const javelinObject = () => propObject('javelin');
export function propShadow(R, on) { if (!R) return; R.shadow = on; if (R.mesh) R.mesh.castShadow = on; }

// ------------------------------------------------------------------ per-base tints (the item's icon colours: [head, shaft, pommel])
// The Toy Lance's colours are the texture's own. The other bases recolour the texture by hue before lighting (the toon's
// fragColor hook, so the light, the brush and the white cap still apply): the emerald rubber head and felt wing guard
// take the head colour, the cream rope the shaft colour, its tan bands a darker head colour, the tennis-ball pommel the
// pommel colour; the brass stays brass. Each keeps its own shading (the texel's lightness over the texture colour's).
// One material per look (cached: a few), one shader program for all of them.
const TEX_COL = { head: '#3a9a6a', rope: '#f4e8d0', band: '#e0a868', ball: '#d6c85c' };
const srgb = h => { const c = new THREE.Color(h), o = { r: 0, g: 0, b: 0 }; c.getRGB(o, THREE.SRGBColorSpace); return o; };
const sLum = o => 0.2126 * o.r + 0.7152 * o.g + 0.0722 * o.b;
const LANCE_TINT = /* glsl */`
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
    float mx = max(sc.r, max(sc.g, sc.b)), mn = min(sc.r, min(sc.g, sc.b)), ch = mx - mn, sat = ch / max(mx, 1e-3), h = -99.0;
    if (ch > 1e-3) { if (mx == sc.r) h = 60.0 * mod((sc.g - sc.b) / ch, 6.0); else if (mx == sc.g) h = 60.0 * ((sc.b - sc.r) / ch + 2.0); else h = 60.0 * ((sc.r - sc.g) / ch + 4.0); }
    float L = dot(sc, vec3(0.2126, 0.7152, 0.0722));
    float wHead = smoothstep(0.16, 0.28, sat) * smoothstep(92.0, 108.0, h) * (1.0 - smoothstep(196.0, 210.0, h));
    float wBall = smoothstep(0.3, 0.42, sat) * smoothstep(46.0, 49.5, h) * (1.0 - smoothstep(80.0, 88.0, h));
    float wBand = smoothstep(0.24, 0.34, sat) * smoothstep(14.0, 19.0, h) * (1.0 - smoothstep(34.5, 37.0, h));
    float wRope = (1.0 - smoothstep(0.12, 0.22, sat)) * smoothstep(0.48, 0.62, L);
    vec3 o = sc;
    o = mix(o, uLHead.rgb * (L / uLHead.a), wHead);
    o = mix(o, uLBall.rgb * (L / uLBall.a), wBall);
    o = mix(o, uLBand.rgb * (L / uLBand.a), wBand);
    o = mix(o, uLRope.rgb * (L / uLRope.a), wRope);
    diffuseColor.rgb = pow(clamp(o, 0.0, 1.0), vec3(2.2));
  }`;
const TINTS = new Map();
function tintMat(colors) {
  const key = colors.join(','), P = PROPS.lance;
  if (TINTS.has(key)) return TINTS.get(key);
  const [head, shaft, pommel] = colors, u = (target, ref) => { const t = srgb(target), r = sLum(srgb(ref)); return { value: new THREE.Vector4(t.r, t.g, t.b, r) }; };
  const band = (() => { const t = srgb(head); return `rgb(${Math.round(t.r * 0.78 * 255)},${Math.round(t.g * 0.78 * 255)},${Math.round(t.b * 0.78 * 255)})`; })();
  const m = makeToon({ map: P.mat.map || null, side: P.mat.side, rim: 0.35, brush: 0.08, objectBrush: true,
    fragPars: 'uniform float uWhiteCap; uniform vec4 uLHead; uniform vec4 uLRope; uniform vec4 uLBand; uniform vec4 uLBall;', fragColor: LANCE_TINT, fragOut: WHITE_CAP,
    uniforms: { uWhiteCap: { value: 0.95 }, uLHead: u(head, TEX_COL.head), uLRope: u(shaft, TEX_COL.rope), uLBand: u(band, TEX_COL.band), uLBall: u(pommel, TEX_COL.ball) } });
  m.name = `golden_lance_${key}`;
  TINTS.set(key, m);
  return m;
}
/** an equipped lance's look (the item's colours): the Toy Lance (and a look that matches the texture) keeps the prop's own
 *  material; any other base gets its tinted copy, now if the prop is in, else when it lands (fill) */
export function setLanceLook(R, look) {
  const k = look?.colors?.length ? look.colors.join(',') : '';
  if (R.lookKey === k) return;
  R.lookKey = k; R.look = k && k !== OWN_LOOK ? look.colors.slice() : null;
  if (R.mesh) fill(R);
}
const OWN_LOOK = [TEX_COL.head, TEX_COL.rope, TEX_COL.ball].join(',');

// ------------------------------------------------------------------ dressing a rig
/** Mount the lance on a dragoon rig's back and make his paw's javelin (idempotent) → the lance record (rig.parts.lance). */
export function dressGolden(rig) {
  if (!rig?.parts) return null;
  if (rig.parts.lance) return rig.parts.lance;
  if (!rig.bakedDisney && !rig.toy) { kitHelm(rig); if (!rig.disney) kitCoat(rig); } // (the classic / Storybook kits: no hook for the crest helm; the Toybox kit has its own, goldenKit.js)
  const L = lanceObject(); L.holder.name = 'lance_back';
  rig.parts.lance = L;
  L.drawn = null; mountLance(rig, L, 'back');
  const J = javelinObject(); J.holder.name = 'javelin_paw'; J.holder.visible = false;
  (rig.parts.handR || rig.root).add(J.holder);
  rig.parts.javelin = J;
  return L;
}
// ------------------------------------------------------------------ the kit fallback's crest helm and coat (?chewy=classic,
// the Storybook kit; docs/GOLDEN.md §8): the emerald cap with its brass rim, two brass horns and the little dragon on top,
// fitted to the skull (the head bone's own vertices of the baked kit mesh, in the head's frame); and the classic kit's
// coat: its toon and the grade pushed the red-gold to a flat orange-red (#B96304 for #BD7C45), so its vertex colours lean
// greyer and bluer and render the sheet's #C47A3A, the muzzle and feathering #E0A868 (measured in the village light:
// tools/qa/tmp/golden-kit.mjs)
const KIT_COAT = { fur: '#ce926c', light: '#f2cc96' };
function kitHelm(rig) {
  const head = rig.parts.head; if (!head) return;
  rig.root.updateMatrixWorld(true);
  let skin = null; rig.root.traverse(o => { if (!skin && o.isSkinnedMesh && o.material === rig.mat) skin = o; });
  const box = new THREE.Box3(), v = new THREE.Vector3(), pts = [];
  if (skin) {
    const bi = skin.skeleton.bones.indexOf(head), pos = skin.geometry.attributes.position, si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight;
    if (bi >= 0) for (let i = 0; i < pos.count; i++) {
      if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
      v.fromBufferAttribute(pos, i); skin.applyBoneTransform(i, v); v.applyMatrix4(skin.matrixWorld); head.worldToLocal(v); box.expandByPoint(v); pts.push(v.x, v.y, v.z);
    }
  } else head.traverse(o => { if (o.isMesh && o.material === rig.mat) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); for (const p of [b.min, b.max]) box.expandByPoint(head.worldToLocal(p.clone())); } });
  if (box.isEmpty()) return;
  // a shallow cap as wide as the skull, centred over the crown (its top half's middle: the muzzle pushes the box forward)
  const top = box.max.y, y0 = top - (box.max.y - box.min.y) * 0.45, cr = new THREE.Box3();
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] > y0) cr.expandByPoint(v.set(pts[i], pts[i + 1], pts[i + 2]));
  if (cr.isEmpty()) cr.copy(box);
  const R = Math.max(cr.max.x - cr.min.x, box.max.x - box.min.x) / 2 * 1.06, cz = (cr.min.z + cr.max.z) / 2;
  const col = h => { const c = C(h); return (p, n, o) => o.copy(c).multiplyScalar(0.86 + 0.14 * Math.max(0, n.y)); };
  const parts = [];
  const TH = Math.PI * 0.3, SY = 0.7; const cap = new THREE.SphereGeometry(R, 26, 12, 0, Math.PI * 2, 0, TH); cap.scale(1, SY, 1.04); cap.translate(0, top + R * 0.04 - R * SY, cz); parts.push(paint(cap, col('#3a9a6a')));
  const rimY = top + R * 0.04 - R * SY + R * SY * Math.cos(TH), rimR = R * Math.sin(TH);
  const rim = new THREE.TorusGeometry(rimR, R * 0.07, 8, 30); rim.rotateX(Math.PI / 2); rim.scale(1, 1, 1.04); rim.translate(0, rimY, cz); parts.push(paint(rim, col('#c8a050')));
  for (const s of [1, -1]) { const h = new THREE.ConeGeometry(R * 0.09, R * 0.34, 10); h.translate(0, R * 0.17, 0); h.rotateZ(-s * 0.55); h.rotateX(-0.3); h.translate(s * R * 0.5, top - R * 0.12, cz - R * 0.05); parts.push(paint(h, col('#c8a050'))); }
  const ell = (r, p, c) => { const g = new THREE.SphereGeometry(1, 14, 10); g.scale(...r); g.translate(...p); return paint(g, col(c)); };
  parts.push(ell([R * 0.2, R * 0.15, R * 0.32], [0, top + R * 0.08, cz - R * 0.02], '#3a9a6a')); // the little dragon's body
  parts.push(ell([R * 0.15, R * 0.13, R * 0.17], [0, top + R * 0.2, cz + R * 0.28], '#3a9a6a')); // its head
  for (const s of [1, -1]) parts.push(ell([R * 0.035, R * 0.035, R * 0.03], [s * R * 0.08, top + R * 0.25, cz + R * 0.42], '#1e2a22'));
  for (let i = 0; i < 3; i++) { const sp = new THREE.ConeGeometry(R * 0.045, R * 0.12, 8); sp.translate(0, R * 0.06, 0); sp.rotateX(-0.45); sp.translate(0, top + R * 0.2 - i * R * 0.03, cz + R * 0.1 - i * R * 0.13); parts.push(paint(sp, col('#c8a050'))); }
  const mesh = new THREE.Mesh(merge(parts), rig.propMat || rig.mat); mesh.name = 'gldHelmKit'; mesh.castShadow = true;
  head.add(mesh);
  if (!rig.disney && rig.outMat) { const o = new THREE.Mesh(mesh.geometry, rig.outMat); o.name = 'gldHelmKit_ol'; head.add(o); } // (the classic kit's ink)
}
function kitCoat(rig) {
  const from = [C(rig.spec.fur), C(rig.spec.fur2 || rig.spec.fur)], to = [C(KIT_COAT.fur), C(KIT_COAT.light)];
  rig.root.traverse(o => {
    const c = o.isMesh && o.material === rig.mat && o.geometry?.attributes.color; if (!c) return;
    for (let i = 0; i < c.count; i++) for (let k = 0; k < 2; k++) if (Math.abs(c.getX(i) - from[k].r) + Math.abs(c.getY(i) - from[k].g) + Math.abs(c.getZ(i) - from[k].b) < 0.004) { c.setXYZ(i, to[k].r, to[k].g, to[k].b); break; }
    c.needsUpdate = true;
  });
}
/** put a rig's lance on its back, in its right paw ('hand': the pose aims it) or upright in its left ('left') */
export function mountLance(rig, L, mode) {
  if (!L || L.mode === mode) return;
  L.mode = mode;
  const h = L.holder;
  if (mode === 'hand') { rig.parts.handR.add(h); h.position.set(0, 0, 0); h.quaternion.identity(); h.scale.setScalar(1); }
  else if (mode === 'left') { (rig.parts.handL || rig.parts.handR).add(h); h.position.set(0, -0.12, 0); h.quaternion.copy(LEFT_HOLD); h.scale.setScalar(1); } // (carryLance aims it upright each frame)
  else {
    const mount = rig.parts.lanceMount, back = mount || rig.parts.back || rig.parts.body;
    back.add(h);
    if (mount) { h.position.set(0, 0, 0); h.quaternion.identity(); h.scale.setScalar(mount.userData.scale || 1); }
    else { h.position.set(...KIT_BACK.pos); h.rotation.set(...KIT_BACK.rot); h.scale.setScalar(KIT_BACK.scale); }
  }
}

// ------------------------------------------------------------------ aiming the lance in the paw
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _w = new THREE.Vector3();
/** the guard (no pose aiming it): upright at his right side, a touch forward and out (goldenPoses.js GUARD) */
export const GUARD_DIR = { x: 0.22, y: 0.95, z: -0.22 };
const GUARD_UP = { x: 1, y: 0, z: 0 };
/** hero frame (x forward, y up, z his left) → world, for a yaw f */
function toWorld(v, f, out) { const sf = Math.sin(f), cf = Math.cos(f); return out.set(v.x * sf + v.z * cf, v.y, v.x * cf - v.z * sf); }
/** turn a holder (under the paw) so its +Y points along `dir` (world), its +Z toward `up` (world) */
function aimHolder(h, dir, up) {
  _x.crossVectors(dir, up); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).cross(dir); _x.normalize();
  _z.crossVectors(_x, dir).normalize();
  _m.makeBasis(_x, dir, _z); _q.setFromRotationMatrix(_m);
  h.parent.getWorldQuaternion(_pq); h.quaternion.copy(_pq.invert().multiply(_q));
}
/** point a drawn lance (A.lanceDir / A.lanceUp at weight A.lanceW, blended over the guard) and draw the left paw onto
 *  the shaft (A.lanceTwo; `still`: how far it holds on when no pose drives the lance) at the point nearest where the
 *  pose put that paw */
export function aimLance(rig, L, facing, A, still = 1) {
  const w = clamp(A?.lanceW || 0);
  _d.set(GUARD_DIR.x, GUARD_DIR.y, GUARD_DIR.z);
  _u.set(GUARD_UP.x, GUARD_UP.y, GUARD_UP.z);
  if (w > 0.001 && A.lanceDir) {
    const ld = A.lanceDir, lu = A.lanceUp;
    _d.multiplyScalar(1 - w).add(_a.set(ld.x, ld.y, ld.z));
    if (lu && (lu.x || lu.y || lu.z)) _u.multiplyScalar(1 - w).add(_b.set(lu.x, lu.y, lu.z));
  }
  if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0);
  toWorld(_d.normalize(), facing, _a); toWorld(_u, facing, _b);
  rig.root.updateMatrixWorld(true);
  aimHolder(L.holder, _a, _b);
  // a thrust slides the lance through the paws along its own axis (A.lanceSlide, m: + toward the tip): short chibi arms
  // can't push it far, so the shaft runs out through the grip instead (the paw stays on the rope between the guard and
  // the pommel within ±0.3)
  const slide = w > 0.001 ? clamp((A.lanceSlide || 0) / Math.max(w, 1e-3), -0.3, 0.3) * w : 0;
  L.holder.position.set(0, slide, 0).applyQuaternion(L.holder.quaternion);
  L.holder.updateMatrixWorld(true);
  // the left paw onto the shaft
  const two = w > 0.001 ? clamp(A.lanceTwo || 0) * w + still * (1 - w) : still;
  const P = rig.parts;
  if (two > 0.01 && P.armL && P.handL) {
    L.holder.getWorldPosition(_p); P.handL.getWorldPosition(_w);
    const s = clamp(_w.sub(_p).dot(_a), 0.2 - slide, 0.62 - slide); // (how far up the shaft that paw is, from the right paw: kept between the hands' natural span)
    _w.copy(_p).addScaledVector(_a, s);
    reach(P.armL, P.foreL, P.handL, _w, two);
  }
}

// ------------------------------------------------------------------ the Player mixin
// Drawn: any lance move brings it out; in the Burrow and the zones it stays out; in town it goes back on his back ~3 s
// after the last poke (and while a homestead tool is in his paw). A javelin throw moves a drawn lance to his left paw.
const M = {
  /** the lance for the equipped item: on his back (dressGolden) and drawn into his paws when he fights */
  holdLance(look) {
    const rig = this.rig, L = dressGolden(rig); if (!L) return;
    this.lance = L;
    setLanceLook(L, look?.colors ? look : this.equippedLook?.());
    if (this.sword) { this.sword.scale.setScalar(0.0001); this.sword.castShadow = false; }
    if (this.ball) { this.ball.scale.setScalar(0.0001); this.ball.castShadow = false; }
    if (this.swordBack) this.swordBack.visible = false;
    this.dropStaff?.(); this.dropFuma?.();
    this.carryLance(0);
  },
  dropLance() { this.lance = null; if (this.anim) this.anim.stance = null; },
  /** per frame (Player.update): which mount, the aim, the left paw, the javelin in the right paw */
  carryLance(dt) {
    const L = this.lance, rig = this.rig; if (!L || this.weaponType !== 'lance') return;
    const a = this.anim?.action, def = a?.def, mode = this.G?.mode, town = mode === 'village' || mode === 'interior';
    if (def?.lance) this._lanceT = town ? 3 : 1e9;
    else if (!(this._lanceT > 0) && !town) this._lanceT = 1e9; // (out in a fight)
    this._lanceT = Math.max(0, (this._lanceT || 0) - dt);
    const drawn = this._lanceT > 0 && !this.toolOut && !this.lanceThrown;
    const jav = !!def?.jav || (a?.name === 'charge' && GLD_JAV_STYLES.has(a.style)); // (a javelin's charged wind-up holds one too)
    mountLance(rig, L, !drawn ? 'back' : jav ? 'left' : 'hand');
    L.holder.visible = !this.lanceThrown && !(this._ghost > 0.5);
    this.anim.stance = drawn && !jav ? LANCE_GUARD : null; // (the two-handed guard while it's drawn: goldenPoses.js)
    if (L.mode === 'hand') aimLance(rig, L, this.facing, this.anim.A, 0); // (the left paw joins the shaft only where a move's keys put it: A.lanceTwo)
    else if (L.mode === 'left') { // upright in the left paw like a standard, a little back and out (aimed in his frame: the arm swings, the lance stays up)
      toWorld(_d.set(-0.18, 1, 0.22).normalize(), this.facing, _a); toWorld(_u.set(1, 0, 0), this.facing, _b);
      rig.root.updateMatrixWorld(true); aimHolder(L.holder, _a, _b);
      L.holder.position.set(0, -0.12, 0).applyQuaternion(L.holder.quaternion);
    }
    // the javelin in the right paw: shown by a throw pose (A.javW) from the wind-up to the release
    const J = rig.parts.javelin;
    if (J) {
      const show = (this.anim.A?.javW || 0) > 0.5;
      J.holder.visible = show;
      if (show) {
        const A = this.anim.A, jd = A.javDir;
        if (jd) _d.set(jd.x, jd.y, jd.z); else _d.set(0.3, 0.95, 0); if (_d.lengthSq() < 1e-6) _d.set(0, 1, 0);
        toWorld(_d.normalize(), this.facing, _a); toWorld(_u.set(0, 0, -1), this.facing, _b);
        rig.root.updateMatrixWorld(true); aimHolder(J.holder, _a, _b);
      }
    }
  },
};
export function installGoldenGear(proto) { for (const k in M) if (!proto[k]) proto[k] = M[k]; }
/** a lance's tip / off-hand grip / pommel in world (VFX: the thrust's streak, the dive's impact) */
export function lancePoint(L, along, out) { L.holder.updateWorldMatrix(true, false); return out.set(0, along, 0).applyMatrix4(L.holder.matrixWorld); }
