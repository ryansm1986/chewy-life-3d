// Procedural chibi character kit: humanoid animals (dog, cat, bunny, bear, fox, panda, tanuki, frog, duck),
// a human girl (Rosie) and a quadruped Boston terrier (Shadow). Parts are separate groups for procedural
// animation; each part is one merged vertex-coloured mesh + an inverted-hull outline.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { merge, paint, tube, xf, mergeGeometries } from '../gfx/geom.js';
import { tennisBallTexture } from '../gfx/textures.js';
import { mulberry32, TAU, clamp } from '../core/util.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const INK = '#3a2230';

// ------------------------------------------------------------------ primitive builders (vertex coloured)
function ell(rx, ry, rz, color, p = [0, 0, 0], r = [0, 0, 0], seg = 20, fn = null) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(rx, ry, rz);
  if (r[0] || r[1] || r[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  g.translate(...p);
  const c = C(color);
  return paint(g, fn ? (pp, n, o) => fn(pp, n, o, c) : (pp, n, o) => o.copy(c));
}
function cap(r, len, color, p = [0, 0, 0], rot = [0, 0, 0], fn = null) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 14);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  const c = C(color);
  return paint(g, fn ? (pp, n, o) => fn(pp, n, o, c) : (pp, n, o) => o.copy(c));
}
function cone(r, h, color, p, rot = [0, 0, 0], seg = 12, sx = 1, sz = 1) {
  const g = new THREE.ConeGeometry(r, h, seg, 2);
  g.scale(sx, 1, sz);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  return paint(g, (pp, n, o) => o.copy(C(color)));
}
function torus(R, r, color, p, rot = [Math.PI / 2, 0, 0], arc = TAU) {
  const g = new THREE.TorusGeometry(R, r, 8, 24, arc);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  return paint(g, (pp, n, o) => o.copy(C(color)));
}
function curve(pts, r, color) {
  return paint(tube(pts.map(p => ({ p: V(...p), r })), 5, true), (pp, n, o) => o.copy(C(color)));
}
const shade = (amt = 0.12) => (p, n, o, c) => { o.copy(c).multiplyScalar(1 - amt * clamp(0.5 - n.y * 0.5)); };

// ------------------------------------------------------------------ species tables
export const SPECIES = {
  dog: { head: [1.08, 0.96, 1.0], muzzle: [0.14, 0.105, 0.13, -0.07, 0.2], nose: [0.05, 0.036, 0.036], ears: 'rose', tail: 'dog' },
  cat: { head: [1.12, 0.94, 0.98], muzzle: [0.09, 0.065, 0.07, -0.085, 0.24], nose: [0.028, 0.02, 0.02], ears: 'cat', tail: 'cat', whiskers: true },
  bunny: { head: [1.02, 1.0, 0.98], muzzle: [0.085, 0.065, 0.07, -0.085, 0.24], nose: [0.026, 0.02, 0.02], ears: 'bunny', tail: 'puff' },
  bear: { head: [1.12, 0.98, 1.0], muzzle: [0.12, 0.09, 0.1, -0.08, 0.21], nose: [0.045, 0.032, 0.03], ears: 'bear', tail: 'stub' },
  fox: { head: [1.1, 0.92, 1.0], muzzle: [0.1, 0.075, 0.13, -0.08, 0.21], nose: [0.034, 0.026, 0.026], ears: 'fox', tail: 'fox' },
  panda: { head: [1.14, 0.98, 1.0], muzzle: [0.11, 0.08, 0.09, -0.085, 0.22], nose: [0.04, 0.03, 0.028], ears: 'bear', tail: 'stub', patches: true },
  tanuki: { head: [1.12, 0.96, 1.0], muzzle: [0.11, 0.08, 0.1, -0.08, 0.22], nose: [0.04, 0.03, 0.028], ears: 'tanuki', tail: 'tanuki', mask: true },
  frog: { head: [1.22, 0.86, 1.0], muzzle: null, nose: null, ears: 'none', tail: 'none', frogEyes: true },
  duck: { head: [1.0, 1.0, 1.0], muzzle: null, beak: true, nose: null, ears: 'none', tail: 'duck' },
  human: { head: [1.0, 1.0, 0.98], muzzle: null, nose: [0.03, 0.025, 0.025], ears: 'human', tail: 'none', human: true },
};

// ------------------------------------------------------------------ weapons
export function boneSwordGeo({ blade = '#fbf1e0', edge = '#ffffff', grip = '#c9a27a', glow = null } = {}) {
  const parts = [];
  // grip: bone shaft with knobby pommel
  parts.push(cap(0.028, 0.14, grip, [0, 0.07, 0]));
  parts.push(ell(0.034, 0.03, 0.03, blade, [-0.022, -0.02, 0])); parts.push(ell(0.034, 0.03, 0.03, blade, [0.022, -0.02, 0]));
  // guard: crosswise bone with knobs
  parts.push(cap(0.03, 0.16, blade, [0, 0.17, 0], [0, 0, Math.PI / 2]));
  for (const s of [-1, 1]) { parts.push(ell(0.038, 0.034, 0.034, blade, [s * 0.11, 0.19, 0])); parts.push(ell(0.038, 0.034, 0.034, blade, [s * 0.11, 0.15, 0])); }
  // blade: a long flattened bone that tapers to a rounded point
  const bl = new THREE.CapsuleGeometry(0.05, 0.46, 6, 14); bl.scale(1, 1, 0.42); bl.translate(0, 0.46, 0);
  const pos = bl.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const t = clamp((y - 0.25) / 0.48); pos.setX(i, pos.getX(i) * (1.05 - t * 0.35)); }
  bl.computeVertexNormals();
  parts.push(paint(bl, (p, n, o) => { o.set(blade); if (Math.abs(p.x) > 0.035) o.lerp(C(edge), 0.6); }));
  // tip knobs like a bone end
  parts.push(ell(0.036, 0.034, 0.024, blade, [-0.02, 0.73, 0])); parts.push(ell(0.036, 0.034, 0.024, blade, [0.02, 0.73, 0]));
  return merge(parts);
}
export function tennisBall(r = 0.1) {
  const g = new THREE.SphereGeometry(r, 20, 14);
  const m = makeToon({ map: tennisBallTexture(), rim: 0.5, brush: 0.05 });
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ character assembly
class Rig {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group(); this.root.name = spec.name || 'char';
    this.mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.55, term: [-0.02, 0.28], shadowSat: 0.4 });
    this.outMat = makeOutline(spec.outline || INK, spec.outlineW ?? 0.012);
    this.parts = {};
    this.meshes = [];
  }
  add(parent, geo, name, { outline = true, shadow = true } = {}) {
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = shadow; m.receiveShadow = true; m.name = name;
    parent.add(m); this.meshes.push(m);
    if (outline) { const o = new THREE.Mesh(geo, this.outMat); o.name = name + '_ol'; parent.add(o); m.userData.outline = o; }
    return m;
  }
  group(parent, name, p = [0, 0, 0]) { const g = new THREE.Group(); g.name = name; g.position.set(...p); parent.add(g); this.parts[name] = g; return g; }
  // Bake every part mesh into ONE rigidly-skinned mesh (+ one outline) whose bones are the animated groups.
  // ~20 part meshes x (main + outline + shadow) draw calls per character become ~3. Animation is unchanged:
  // the animator keeps driving the same groups, which are now the skeleton's bones.
  bake() {
    const root = this.root;
    root.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert();
    // the mouth animates its own transform: swap the mesh for a plain bone object in the same place
    const mouth = this.parts.mouth;
    if (mouth?.isMesh) {
      const mb = new THREE.Object3D(); mb.name = 'mouthBone';
      mb.position.copy(mouth.position); mb.rotation.copy(mouth.rotation); mb.scale.copy(mouth.scale);
      mouth.parent.add(mb); mb.updateMatrixWorld(true); this.parts.mouth = mb;
    }
    const bones = [], index = new Map();
    const boneOf = o => { if (!index.has(o)) { index.set(o, bones.length); bones.push(o); } return index.get(o); };
    boneOf(root);
    const toon = [];
    root.traverse(o => { if (o.isMesh && o.material === this.mat && (o.visible || o === mouth)) toon.push(o); });
    const bakeList = list => {
      const geos = list.map(m => {
        const bone = m === mouth ? this.parts.mouth : m.parent;
        const g = merge([m.geometry.clone().applyMatrix4(rootInv.clone().multiply(m.matrixWorld))]);
        const n = g.attributes.position.count, bi = boneOf(bone);
        const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        return g;
      });
      return mergeGeometries(geos, false);
    };
    const bodyGeo = bakeList(toon);
    const olGeo = bakeList(toon.filter(m => m.userData.outline));
    // remove the original part meshes (and their outline shells)
    for (const m of toon) { m.userData.outline?.parent?.remove(m.userData.outline); m.parent?.remove(m); }
    // bones must be real Bone-like objects for the skeleton: groups work since only matrixWorld is used
    const skeleton = new THREE.Skeleton(bones);
    const mk = (geo, mat, name) => {
      const sm = new THREE.SkinnedMesh(geo, mat); sm.name = name;
      root.add(sm); root.updateMatrixWorld(true);
      sm.bind(skeleton, sm.matrixWorld);
      sm.computeBoundingSphere(); if (sm.boundingSphere) sm.boundingSphere.radius *= 1.4;
      return sm;
    };
    const body = mk(bodyGeo, this.mat, 'body_skin'); body.castShadow = true; body.receiveShadow = true;
    const ol = mk(olGeo, this.outMat, 'outline_skin'); ol.castShadow = false;
    this.meshes = [body]; this.skeleton = skeleton; this.skin = body; this.outline = ol;
    return this;
  }
  // free the GPU side of a throwaway rig (spirit pups, monsters, portrait renders). Attached props such as the
  // player's weapons use shared cached geometry and are left alone.
  dispose() {
    if (!this.sharedGeo) { this.skin?.geometry.dispose(); this.outline?.geometry.dispose(); }
    this.skeleton?.dispose(); this.mat.dispose(); this.outMat.dispose();
  }
}

// A new rig that shares a baked rig's geometry (cheap: no procedural build, no GPU upload) but has its own
// bones, skeleton and materials, so it animates and flashes independently. Used for summons such as spirit pups.
export function cloneRig(src) {
  const R = new Rig(src.spec);
  const root = cloneSkinned(src.root);
  const a = [], b = [];
  src.root.traverse(o => a.push(o)); root.traverse(o => b.push(o));
  const map = new Map(a.map((o, i) => [o, b[i]]));
  for (const k of ['height', 'quadruped', 'offsetY']) if (k in src) R[k] = src[k];
  R.root = root;
  for (const [k, o] of Object.entries(src.parts)) R.parts[k] = Array.isArray(o) ? o.map(x => map.get(x)) : map.get(o);
  R.skin = map.get(src.skin); R.outline = map.get(src.outline); R.meshes = [R.skin]; R.skeleton = R.skin.skeleton;
  R.outline.bind(R.skeleton, R.outline.bindMatrix); // one skeleton (one bone texture) for body + outline
  R.mat.emissive.copy(src.mat.emissive); R.mat.emissiveIntensity = src.mat.emissiveIntensity;
  R.mat.transparent = src.mat.transparent; R.mat.opacity = src.mat.opacity;
  R.skin.material = R.mat; R.outline.material = R.outMat;
  R.sharedGeo = true;
  return R;
}

/**
 * spec: { name, species, scale, fur, fur2, fur3, earColor, nose, eye, eyeStyle, blush,
 *   patterns:{chestBlaze, blaze, socks, tailTip}, outfit:{ top, topColor, topColor2, bottom, bottomColor, scarf, sash, apron, hat, hatColor, bow, glasses, bag },
 *   hair:{ style:'curly', color, color2 }, skin }
 */
export function buildHumanoid(spec) {
  const R = new Rig(spec);
  const sp = SPECIES[spec.species] || SPECIES.dog;
  const fur = spec.fur || '#c98f5e', fur2 = spec.fur2 || '#fff2e0', fur3 = spec.fur3 || fur;
  const skin = sp.human ? (spec.skin || '#ffe2cf') : fur;
  const of = spec.outfit || {};
  const topC = of.topColor || '#6ea8ff', topC2 = of.topColor2 || '#ffffff', botC = of.bottomColor || '#4a4a6a';
  const rnd = mulberry32(spec.seed || 7);

  // --- hierarchy
  const body = R.group(R.root, 'body', [0, 0.27, 0]);
  const legL = R.group(R.root, 'legL', [0.085, 0.27, 0]);
  const legR = R.group(R.root, 'legR', [-0.085, 0.27, 0]);
  const head = R.group(body, 'head', [0, 0.35, 0]);
  head.scale.setScalar(0.88);
  const armL = R.group(body, 'armL', [0.175, 0.29, 0]);
  const armR = R.group(body, 'armR', [-0.175, 0.29, 0]);
  const handL = R.group(armL, 'handL', [0, -0.22, 0.02]);
  const handR = R.group(armR, 'handR', [0, -0.22, 0.02]);
  const back = R.group(body, 'back', [0, 0.18, -0.2]);

  // --- torso (lathe) with outfit regions painted in
  const prof = [[0.001, -0.02], [0.17, 0.0], [0.205, 0.07], [0.205, 0.15], [0.185, 0.24], [0.14, 0.31], [0.08, 0.355], [0.001, 0.37]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.LatheGeometry(prof, 22);
  const top = of.top || 'shirt';
  paint(torso, (p, n, o) => {
    const front = p.z > 0;
    let c = C(topC);
    if (top === 'none') c = C(fur);
    if (top === 'dress' && p.y < 0.13) c = C(topC).lerp(C('#ffffff'), 0.05);
    if (p.y < 0.06 && top !== 'dress') c = C(botC);
    if (top === 'overalls' && p.y < 0.2) c = C(botC);
    if (top === 'overalls' && front && Math.abs(p.x) < 0.06 && p.y < 0.26) c = C(botC);
    // V-neck opening shows fur / chest blaze
    if ((top === 'gi' || top === 'kimono') && front && p.y > 0.14 && Math.abs(p.x) < (p.y - 0.14) * 0.75) c = spec.patterns?.chestBlaze ? C('#fffaf2') : C(sp.human ? skin : fur2);
    if (top === 'none' && spec.patterns?.chestBlaze && front && Math.abs(p.x) < 0.05 + (p.y - 0.1) * 0.1 && p.y > 0.06) c = C('#fffaf2');
    if ((top === 'none' || spec.patterns?.belly) && front && p.y > 0.04 && p.y < 0.28 && (p.x * p.x) / 0.012 + ((p.y - 0.15) ** 2) / 0.012 < 1 && top === 'none') c = C(fur2);
    if (top === 'kimono' && front && p.x > -0.02 && p.x < 0.02 + (p.y - 0.14) * 0.75 && p.y > 0.14) c.lerp(C(topC2), 0.0);
    if (of.apron && front && p.y > 0.02 && p.y < 0.26 && Math.abs(p.x) < 0.14) c = C(of.apron);
    o.copy(c).multiplyScalar(1 - 0.1 * clamp(0.5 - n.y));
  });
  const torsoParts = [torso];
  if (of.sash) { torsoParts.push(torus(0.198, 0.024, of.sash, [0, 0.085, 0])); torsoParts.push(ell(0.045, 0.035, 0.03, of.sash, [0.1, 0.085, 0.17])); torsoParts.push(cap(0.018, 0.06, of.sash, [0.12, 0.03, 0.17], [0, 0, 0.3])); }
  if (top === 'dress') { // skirt flare
    const sk = new THREE.LatheGeometry([[0.001, -0.045], [0.27, -0.045], [0.27, -0.03], [0.235, 0.06], [0.2, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
    torsoParts.push(paint(sk, (p, n, o) => { o.set(topC); if (p.y < -0.02) o.set(topC2); }));
    torsoParts.push(torus(0.1, 0.03, topC2, [0, 0.33, 0])); // collar
  }
  if (of.bag) { torsoParts.push(ell(0.09, 0.1, 0.05, of.bag, [0, 0.16, -0.2])); torsoParts.push(torus(0.19, 0.012, of.bag, [0, 0.22, 0], [Math.PI / 2 - 0.5, 0, 0])); }
  R.add(body, merge(torsoParts), 'torso');

  // tail
  if (sp.tail !== 'none') buildTail(R, body, sp.tail, fur, fur2, spec);

  // scarf (with trailing tails as a separate swinging group)
  if (of.scarf) {
    R.add(body, merge([torus(0.12, 0.045, of.scarf, [0, 0.335, 0.005], [Math.PI / 2 + 0.12, 0, 0]), ell(0.05, 0.04, 0.03, of.scarf, [-0.06, 0.31, 0.13])]), 'scarf');
    const tails = R.group(body, 'scarfTail', [0.02, 0.33, -0.1]);
    R.add(tails, merge([cap(0.035, 0.1, of.scarf, [0.02, -0.07, -0.03], [0.5, 0, 0.15], null), cap(0.03, 0.08, of.scarf, [-0.04, -0.06, -0.02], [0.4, 0, -0.2])]), 'scarfTails');
  }

  // --- legs & feet
  for (const [g, s] of [[legL, 1], [legR, -1]]) {
    const pants = top === 'dress' ? (of.socks || '#ffffff') : (of.bottom === 'shorts' ? skin : botC);
    const parts = [cap(0.066, 0.11, pants, [0, -0.1, 0])];
    if (of.bottom === 'shorts' && top !== 'dress') parts.push(cap(0.075, 0.03, botC, [0, -0.05, 0]));
    const footC = sp.human ? (of.shoes || '#d8443a') : (spec.patterns?.socks ? '#fffaf2' : fur3);
    parts.push(ell(0.078, 0.058, 0.1, footC, [0, -0.225, 0.03], [0, 0, 0], 16, shade(0.15)));
    if (!sp.human && sp !== SPECIES.duck) for (const t of [-1, 0, 1]) parts.push(ell(0.02, 0.014, 0.012, INK, [t * 0.032, -0.235, 0.125]));
    R.add(g, merge(parts), 'leg');
  }
  // --- arms
  for (const [g, s] of [[armL, 1], [armR, -1]]) {
    const sleeve = top === 'none' ? fur : (top === 'overalls' ? of.shirt || '#ffffff' : topC);
    const parts = [cap(0.056, 0.13, sleeve, [0, -0.09, 0])];
    if (top === 'gi' || top === 'kimono') parts.push(ell(0.085, 0.07, 0.085, sleeve, [0, -0.13, 0]));
    if (top === 'dress') parts.push(ell(0.075, 0.06, 0.075, topC, [0, -0.03, 0]));
    if (of.wraps) { for (const [y, r] of [[-0.17, 0.05], [-0.145, 0.052]]) parts.push(paint(xf(new THREE.CylinderGeometry(r, r, 0.03, 12), { p: [0, y, 0.005], r: [0.1, 0, 0.12] }), (p, n, o) => o.set(of.wraps))); }
    parts.push(ell(0.066, 0.064, 0.066, sp.human ? skin : fur, [0, -0.215, 0.01], [0, 0, 0], 16, shade(0.1)));
    R.add(g, merge(parts), 'arm');
  }
  // --- head
  buildHead(R, head, sp, spec, { fur, fur2, fur3, skin });
  // bow / hats
  const hatAnchor = R.group(head, 'hatAnchor', [0, 0.25, 0]);
  if (of.hat) buildHat(R, hatAnchor, of.hat, of.hatColor || '#f4c04a', sp);
  if (of.bow) R.add(head, merge([ell(0.09, 0.06, 0.04, of.bow, [0.07, 0.36, 0.1], [0.5, 0, 0.45]), ell(0.09, 0.06, 0.04, of.bow, [0.22, 0.32, 0.08], [0.5, 0, -0.35]), ell(0.04, 0.04, 0.04, of.bow, [0.145, 0.34, 0.11])]), 'bow');

  R.root.scale.setScalar(spec.scale || 1);
  R.height = 1.15 * (spec.scale || 1);
  return R.bake();
}

function buildHead(R, head, sp, spec, { fur, fur2, fur3, skin }) {
  const [hx, hy, hz] = sp.head;
  const eyeC = spec.eye || '#2a1a14';
  const parts = [];
  const pat = spec.patterns || {};
  // skull with gentle top-light, optional pattern painting
  const headG = new THREE.SphereGeometry(0.3, 28, 20); headG.scale(hx, hy, hz);
  paint(headG, (p, n, o) => {
    let c = C(sp.human ? skin : fur);
    if (pat.blaze && p.z > 0.05 && Math.abs(p.x) < 0.035 + Math.max(0, -p.y) * 0.25 && p.y < 0.28) c = C('#fffaf2');
    if (pat.faceWhite && p.z > 0.12 && p.y < -0.02) c = C(fur2);
    if (spec.species === 'fox' && p.z > 0.1 && p.y < -0.04 && Math.abs(p.x) > 0.06) c = C(fur2);
    if (spec.species === 'cat' && pat.cheeks && p.z > 0.12 && p.y < -0.05) c = C(fur2);
    o.copy(c).multiplyScalar(1 - 0.1 * clamp(0.4 - n.y * 0.6));
  });
  parts.push(headG);
  // muzzle
  if (sp.muzzle) {
    let [mx, my, mz, oy, oz] = sp.muzzle;
    const ms = spec.muzzleScale || 1; mx *= ms; my *= ms; mz *= ms; oz += (ms - 1) * 0.08;
    const chin = spec.patterns?.chin;
    const mg = ell(mx, my, mz, spec.muzzleColor || fur2, [0, oy, oz], [0, 0, 0], 18);
    if (chin) paint(mg, (pp, n, o) => { o.set(spec.muzzleColor || fur2); if (pp.y < oy - my * 0.25) o.set(chin); });
    parts.push(mg);
    if (sp.nose) { const [nx, ny, nz] = sp.nose; parts.push(ell(nx, ny, nz, spec.nose || '#3a1e1a', [0, oy + my * 0.55, oz + mz * 0.92], [0.2, 0, 0], 14)); parts.push(ell(nx * 0.35, ny * 0.25, nz * 0.3, '#ffffff', [-nx * 0.3, oy + my * 0.55 + ny * 0.55, oz + mz * 0.92 + nz * 0.6])); }
    // smile  ω
    const y0 = oy - my * 0.25, z0 = oz + mz * 0.88;
    parts.push(curve([[-0.05, y0 + 0.012, z0 - 0.012], [-0.025, y0 - 0.012, z0], [0, y0 + 0.002, z0 + 0.004]], 0.007, INK));
    parts.push(curve([[0, y0 + 0.002, z0 + 0.004], [0.025, y0 - 0.012, z0], [0.05, y0 + 0.012, z0 - 0.012]], 0.007, INK));
    if (sp.nose) parts.push(curve([[0, oy + my * 0.4, oz + mz * 0.95], [0, y0 + 0.004, z0 + 0.005]], 0.006, INK));
  } else if (sp.human) {
    parts.push(ell(0.028, 0.022, 0.02, '#ffcdb8', [0, -0.05, 0.29]));
    parts.push(curve([[-0.035, -0.1, 0.272], [0, -0.115, 0.28], [0.035, -0.1, 0.272]], 0.007, '#b8505a'));
  } else if (sp.beak) {
    parts.push(ell(0.1, 0.035, 0.1, '#ffb040', [0, -0.07, 0.27], [0.1, 0, 0])); parts.push(ell(0.09, 0.03, 0.09, '#f09030', [0, -0.1, 0.25], [0.15, 0, 0]));
  } else if (sp.frogEyes) {
    parts.push(curve([[-0.12, -0.08, 0.26], [0, -0.11, 0.3], [0.12, -0.08, 0.26]], 0.008, INK));
  }
  // crisp face markings (panda eye patches, tanuki mask)
  if (sp.patches) for (const s of [-1, 1]) parts.push(ell(0.075, 0.09, 0.03, '#2a2630', [s * 0.118, 0.035, 0.26], [0, s * 0.42, s * -0.5]));
  if (sp.mask) for (const s of [-1, 1]) parts.push(ell(0.1, 0.065, 0.03, spec.fur3 || '#3a2c28', [s * 0.13, 0.02, 0.255], [0, s * 0.45, s * 0.25]));
  // blush
  const blush = spec.blush || '#ff9ab0';
  if (blush !== 'none') for (const s of [-1, 1]) parts.push(ell(0.048, 0.028, 0.02, blush, [s * 0.185, -0.06, 0.225], [0, s * 0.62, 0]));
  if (sp.whiskers) for (const s of [-1, 1]) for (const k of [0, 1]) parts.push(curve([[s * 0.1, -0.075 - k * 0.02, 0.28], [s * 0.2, -0.06 - k * 0.035, 0.26]], 0.004, INK));
  // human ears
  if (sp.ears === 'human') for (const s of [-1, 1]) parts.push(ell(0.035, 0.05, 0.03, skin, [s * 0.29, -0.02, 0.0]));
  if (sp.frogEyes) for (const s of [-1, 1]) parts.push(ell(0.095, 0.09, 0.09, fur, [s * 0.14, 0.2, 0.12]));
  R.add(head, merge(parts), 'headMesh');

  // eyes (separate for blinking)
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.name = 'eye';
    const ex = sp.frogEyes ? s * 0.14 : s * (sp.human ? 0.118 : 0.125);
    const ey = sp.frogEyes ? 0.21 : (sp.human ? 0.0 : 0.045);
    const ez = sp.frogEyes ? 0.2 : (sp.human ? 0.262 : 0.255);
    eg.position.set(ex, ey, ez);
    eg.rotation.y = s * (sp.frogEyes ? 0.3 : 0.42);
    eg.rotation.x = -0.22; // look up a little toward the isometric camera
    const big = spec.eyeSize || (sp.human ? 1.3 : 1.22);
    const ep = [];
    if (sp.human || spec.eyeWhite) ep.push(ell(0.058 * big, 0.07 * big, 0.02, '#ffffff', [0, 0, -0.004]));
    ep.push(ell(0.05 * big, 0.064 * big, 0.024, spec.iris ? spec.iris : eyeC, [0, -0.004, 0]));
    if (spec.iris) ep.push(ell(0.036 * big, 0.047 * big, 0.022, '#1a0e0a', [0, 0.004, 0.008]));
    ep.push(ell(0.021 * big, 0.021 * big, 0.012, '#ffffff', [-s * 0.012 - 0.008, 0.026 * big, 0.024]));
    ep.push(ell(0.009 * big, 0.009 * big, 0.008, '#ffffff', [s * 0.016, -0.026 * big, 0.022]));
    if (sp.human) ep.push(curve([[-0.055, 0.055, 0.012], [0, 0.078, 0.02], [0.06, 0.06, 0.012], [0.075, 0.075, 0.005]].map(([x, y, z]) => [x * -s * -1 * (s < 0 ? -1 : 1), y, z]), 0.008, '#2a1418'));
    const m = new THREE.Mesh(merge(ep), R.mat); m.castShadow = false;
    eg.add(m); head.add(eg); eyes.push(eg);
  }
  R.parts.eyes = eyes;
  // brows (tiny, expressive)
  const brows = [];
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(merge([cap(0.012, 0.045, sp.human ? (spec.hair?.color || '#5a3020') : INK, [0, 0, 0], [0, 0, Math.PI / 2])]), R.mat);
    b.position.set(s * 0.115, sp.frogEyes ? 0.3 : 0.1, sp.frogEyes ? 0.22 : 0.265); b.rotation.y = s * 0.42; b.visible = !!spec.brows || sp.human;
    head.add(b); brows.push(b);
  }
  R.parts.brows = brows;
  // open mouth (bark / talk) — toggled by animator
  const mo = sp.muzzle ? [0, sp.muzzle[3] - sp.muzzle[1] * 0.45, sp.muzzle[4] + sp.muzzle[2] * 0.82] : [0, -0.11, 0.27];
  const mouth = new THREE.Mesh(merge([ell(0.045, 0.034, 0.02, '#8a2a3a', [0, 0, 0]), ell(0.03, 0.016, 0.012, '#ff7a90', [0, -0.012, 0.01])]), R.mat);
  mouth.position.set(...mo); mouth.scale.set(1, 0.01, 1); mouth.visible = false;
  head.add(mouth); R.parts.mouth = mouth;

  // ears
  buildEars(R, head, sp.ears, spec, fur, fur2, fur3);
  // hair for humans
  if (spec.hair) buildHair(R, head, spec.hair);
}

function buildEars(R, head, kind, spec, fur, fur2, fur3) {
  const earC = spec.earColor || fur3;
  const inner = spec.earInner || '#ffb0b8';
  const mk = (s) => { const g = new THREE.Group(); g.name = s > 0 ? 'earL' : 'earR'; head.add(g); R.parts[g.name] = g; return g; };
  for (const s of [1, -1]) {
    if (kind === 'none' || kind === 'human') continue;
    const g = mk(s);
    if (kind === 'rose') { // Chewy: perky base, big soft flop falling outward (like his photo + art)
      g.position.set(s * 0.2, 0.2, -0.03); g.rotation.set(0, 0, -s * 0.25);
      R.add(g, merge([ell(0.07, 0.07, 0.045, earC, [0, 0.03, 0], [0, 0, 0], 16, shade(0.2))]), 'earBase');
      const tip = new THREE.Group(); tip.name = 'earTip'; tip.position.set(s * 0.03, 0.07, 0.0); tip.rotation.set(0.3, 0, -s * 2.0); g.add(tip);
      R.add(tip, merge([ell(0.085, 0.14, 0.04, earC, [0, 0.11, 0], [0, 0, 0], 18, shade(0.25)), ell(0.05, 0.09, 0.02, spec.earInner || '#5a2a1a', [0, 0.1, -0.028])]), 'earTip');
      g.userData.tip = tip;
    } else if (kind === 'floppy') {
      g.position.set(s * 0.24, 0.12, 0); g.rotation.z = s * 0.35;
      R.add(g, ell(0.08, 0.17, 0.04, earC, [0, -0.13, 0]), 'ear');
    } else if (kind === 'bat') {
      g.position.set(s * 0.15, 0.2, -0.02); g.rotation.set(-0.15, 0, -s * 0.38);
      R.add(g, merge([cone(0.1, 0.26, earC, [0, 0.13, 0], [0, 0, 0], 14, 1, 0.45), cone(0.062, 0.18, inner, [0, 0.1, 0.03], [0, 0, 0], 12, 1, 0.3)]), 'ear');
    } else if (kind === 'cat' || kind === 'fox' || kind === 'tanuki') {
      const big = kind === 'fox' ? 1.35 : kind === 'tanuki' ? 0.85 : 1;
      g.position.set(s * 0.16, 0.2, 0); g.rotation.set(-0.05, 0, -s * 0.35);
      R.add(g, merge([cone(0.075 * big, 0.15 * big, earC, [0, 0.07 * big, 0], [0, 0, 0], 12, 1, 0.55), cone(0.045 * big, 0.1 * big, kind === 'fox' ? '#fff4e8' : inner, [0, 0.06 * big, 0.028], [0, 0, 0], 10, 1, 0.3)]), 'ear');
    } else if (kind === 'bunny') {
      g.position.set(s * 0.09, 0.24, -0.02); g.rotation.set(-0.15, 0, -s * 0.18);
      R.add(g, merge([cap(0.055, 0.26, earC, [0, 0.17, 0], [0, 0, 0], shade(0.1)), ell(0.03, 0.14, 0.02, inner, [0, 0.17, 0.042])]), 'ear');
      g.userData.soft = true;
    } else if (kind === 'bear') {
      g.position.set(s * 0.2, 0.19, -0.02);
      R.add(g, merge([ell(0.075, 0.07, 0.04, spec.species === 'panda' ? '#2a2630' : earC, [0, 0.02, 0]), ell(0.04, 0.04, 0.02, spec.species === 'panda' ? '#4a4450' : inner, [0, 0.02, 0.03])]), 'ear');
    }
  }
}

function buildTail(R, body, kind, fur, fur2, spec) {
  const g = new THREE.Group(); g.name = 'tail'; g.position.set(0, 0.08, -0.17); body.add(g); R.parts.tail = g;
  if (kind === 'dog' && spec.patterns?.tailFluff) {
    g.rotation.x = -0.8;
    R.add(g, merge([ell(0.05, 0.09, 0.05, fur, [0, 0.06, 0]), ell(0.065, 0.1, 0.06, fur, [0, 0.16, 0.03], [0.35, 0, 0]), ell(0.055, 0.075, 0.05, fur2, [0, 0.25, 0.07], [0.5, 0, 0])]), 'tailMesh');
  } else if (kind === 'dog') {
    g.rotation.x = -0.9;
    R.add(g, merge([cap(0.042, 0.1, fur, [0, 0.06, 0]), cap(0.036, 0.08, fur, [0, 0.16, 0.025], [0.35, 0, 0]), ell(0.04, 0.05, 0.04, spec.patterns?.tailTip ? '#fffaf2' : fur, [0, 0.22, 0.05])]), 'tailMesh');
  } else if (kind === 'cat') {
    g.rotation.x = -1.2;
    R.add(g, curve([[0, 0, 0], [0, 0.12, -0.02], [0, 0.24, 0.04], [0.05, 0.32, 0.1]], 0.028, fur), 'tailMesh');
  } else if (kind === 'fox' || kind === 'tanuki') {
    g.rotation.x = -1.0;
    const parts = [ell(0.08, 0.16, 0.08, fur, [0, 0.12, 0]), ell(0.07, 0.07, 0.07, kind === 'fox' ? '#fffaf2' : '#3a3030', [0, 0.26, 0.01])];
    if (kind === 'tanuki') parts.push(torus(0.076, 0.012, '#3a3030', [0, 0.1, 0]));
    R.add(g, merge(parts), 'tailMesh');
  } else if (kind === 'puff') {
    R.add(g, ell(0.07, 0.07, 0.06, '#ffffff', [0, 0, -0.02]), 'tailMesh');
  } else if (kind === 'stub') {
    R.add(g, ell(0.05, 0.05, 0.04, fur, [0, 0, -0.01]), 'tailMesh');
  } else if (kind === 'duck') {
    g.rotation.x = -0.6; R.add(g, cone(0.06, 0.1, fur, [0, 0.04, 0], [0, 0, 0], 8, 1, 0.5), 'tailMesh');
  }
}

function buildHat(R, a, kind, color, sp) {
  let g;
  if (kind === 'straw') g = merge([paint(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 22), (p, n, o) => o.set('#f2d27a')), xf(paint(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 18), (p, n, o) => o.set('#f2d27a')), { p: [0, 0.07, 0] }), xf(paint(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 18), (p, n, o) => o.set(color)), { p: [0, 0.03, 0] })]);
  else if (kind === 'bandana') g = merge([ell(0.31, 0.16, 0.31, color, [0, -0.03, -0.01]), ell(0.05, 0.035, 0.03, color, [0.02, -0.07, -0.3])]);
  else if (kind === 'beret') g = merge([ell(0.27, 0.08, 0.27, color, [0.03, 0.0, 0], [0, 0, -0.15]), ell(0.025, 0.04, 0.025, color, [0.02, 0.08, 0])]);
  else if (kind === 'chef') g = merge([paint(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 18), (p, n, o) => o.set('#ffffff')), ell(0.25, 0.14, 0.25, '#ffffff', [0, 0.13, 0])]);
  else if (kind === 'flower') g = merge([...[0, 1, 2, 3, 4].map(i => ell(0.05, 0.02, 0.035, color, [0.12 + Math.cos(i * 1.256) * 0.05, 0.0, 0.1 + Math.sin(i * 1.256) * 0.05], [0, -i * 1.256, 0])), ell(0.025, 0.02, 0.025, '#ffd23a', [0.12, 0.012, 0.1])]);
  else if (kind === 'kabuto') g = merge([ell(0.32, 0.2, 0.32, color, [0, -0.02, 0]), cone(0.05, 0.18, '#f4c04a', [0.09, 0.14, 0.18], [0.3, 0, -0.5], 8, 1, 0.3), cone(0.05, 0.18, '#f4c04a', [-0.09, 0.14, 0.18], [0.3, 0, 0.5], 8, 1, 0.3)]);
  else if (kind === 'wizard') g = merge([cone(0.26, 0.42, color, [0, 0.16, 0], [-0.2, 0, 0.1], 18), paint(new THREE.CylinderGeometry(0.32, 0.33, 0.03, 20), (p, n, o) => o.set(color))]);
  else if (kind === 'leaf') g = merge([ell(0.1, 0.02, 0.05, '#6ab04c', [0, 0.02, 0], [0, 0.5, 0.2]), cap(0.008, 0.05, '#4a7a3a', [0, 0.03, 0])]);
  if (!g) return;
  R.add(a, g, 'hat');
}

function buildHair(R, head, hair) {
  const rnd = mulberry32(99);
  const parts = [];
  const c1 = C(hair.color || '#6b3e26'), c2 = C(hair.color2 || '#8a5634');
  const curl = (p, r) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(...p);
    return paint(g, (pp, n, o) => o.copy(c1).lerp(c2, clamp(n.y * 0.6 + 0.2 + (rnd() - 0.5) * 0.2)));
  };
  // big curly cloud over the scalp
  for (let i = 0; i < 10; i++) { const th = i / 10 * TAU; parts.push(curl([Math.cos(th) * 0.12, 0.28, Math.sin(th) * 0.12 - 0.02], 0.085)); }
  parts.push(curl([0, 0.31, -0.02], 0.09));
  for (let i = 0; i < 46; i++) {
    const u = rnd() * 0.95 - 0.1, th = rnd() * TAU;
    const sr = Math.sqrt(1 - u * u);
    const d = V(sr * Math.cos(th), u, sr * Math.sin(th));
    if (d.z > 0.35 && d.y < 0.55) continue; // keep the face clear
    parts.push(curl([d.x * 0.3, d.y * 0.3 + 0.02, d.z * 0.3 - 0.01], 0.075 + rnd() * 0.03));
  }
  // bangs
  for (let i = 0; i < 6; i++) { const x = -0.16 + i * 0.064; parts.push(curl([x, 0.17 - Math.abs(x) * 0.3, 0.24 - Math.abs(x) * 0.25], 0.062)); }
  // curls falling to the shoulders
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) parts.push(curl([s * (0.25 + (k % 2) * 0.03), -0.06 - k * 0.07, -0.12 - k * 0.03], 0.07 - k * 0.006));
  for (let k = 0; k < 5; k++) parts.push(curl([-0.16 + k * 0.08, -0.14 - (k % 2) * 0.05, -0.2], 0.075));
  R.add(head, merge(parts), 'hair');
}

// ------------------------------------------------------------------ Shadow: quadruped Boston terrier
export function buildBoston(spec = {}) {
  const R = new Rig({ name: 'Shadow', ...spec });
  const black = spec.fur || '#34303f', white = '#fbf6f0', collar = spec.collar || '#4aa8f0';
  if (!spec.fur) R.mat.userData.u.uRimStr.value = 1.25; // slate rim keeps the little black dog readable at night
  const body = R.group(R.root, 'body', [0, 0.3, 0]);
  // barrel body, white chest
  const bg = new THREE.CapsuleGeometry(0.135, 0.22, 8, 18); bg.rotateX(Math.PI / 2);
  paint(bg, (p, n, o) => { o.set(black); if (p.z > 0.12 && p.y < 0.05) o.set(white); if (n.y < -0.6 && p.z > -0.05) o.set(white); o.multiplyScalar(1 - 0.08 * clamp(0.4 - n.y)); });
  R.add(body, merge([bg, torus(0.1, 0.022, collar, [0, 0.07, 0.17], [Math.PI / 2 - 0.9, 0, 0]), ell(0.028, 0.034, 0.012, '#ffd24a', [0, -0.02, 0.26])]), 'torso');
  const head = R.group(body, 'head', [0, 0.15, 0.2]);
  const hg = new THREE.SphereGeometry(0.17, 26, 18); hg.scale(1.08, 0.95, 0.95);
  paint(hg, (p, n, o) => { o.set(black); if (p.z > 0.05 && Math.abs(p.x) < 0.025 + Math.max(0, -p.y + 0.05) * 0.35) o.set(white); o.multiplyScalar(1 - 0.08 * clamp(0.4 - n.y)); });
  const hp = [hg, ell(0.1, 0.07, 0.07, white, [0, -0.06, 0.13]), ell(0.045, 0.03, 0.03, '#141018', [0, -0.03, 0.2], [0.2, 0, 0]), ell(0.015, 0.008, 0.01, '#ffffff', [-0.015, -0.015, 0.225])];
  hp.push(curve([[-0.04, -0.085, 0.19], [-0.02, -0.095, 0.197], [0, -0.087, 0.2]], 0.005, INK), curve([[0, -0.087, 0.2], [0.02, -0.095, 0.197], [0.04, -0.085, 0.19]], 0.005, INK));
  for (const s of [-1, 1]) hp.push(ell(0.035, 0.02, 0.012, '#ff9ab0', [s * 0.11, -0.05, 0.12], [0, s * 0.6, 0]));
  R.add(head, merge(hp), 'headMesh');
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.078, 0.02, 0.135); eg.rotation.y = s * 0.55;
    const m = new THREE.Mesh(merge([ell(0.045, 0.048, 0.02, '#2a1810'), ell(0.017, 0.017, 0.01, '#ffffff', [-s * 0.01 - 0.006, 0.018, 0.018]), ell(0.008, 0.008, 0.008, '#ffffff', [s * 0.012, -0.018, 0.018])]), R.mat);
    eg.add(m); head.add(eg); eyes.push(eg);
  }
  R.parts.eyes = eyes;
  const mouth = new THREE.Mesh(merge([ell(0.035, 0.025, 0.015, '#8a2a3a'), ell(0.022, 0.012, 0.01, '#ff7a90', [0, -0.008, 0.008])]), R.mat);
  mouth.position.set(0, -0.1, 0.18); mouth.scale.set(1, 0.01, 1); mouth.visible = false; head.add(mouth); R.parts.mouth = mouth;
  R.parts.brows = [];
  buildEars(R, head, 'bat', { earColor: black, earInner: '#f0a0a8' }, black, white, black);
  // legs
  const legs = [];
  for (const [x, z, n] of [[0.085, 0.13, 'legFL'], [-0.085, 0.13, 'legFR'], [0.085, -0.13, 'legBL'], [-0.085, -0.13, 'legBR']]) {
    const g = R.group(R.root, n, [x, 0.27, z]);
    R.add(g, merge([cap(0.045, 0.14, black, [0, -0.1, 0]), ell(0.052, 0.04, 0.065, white, [0, -0.235, 0.02])]), 'leg');
    legs.push(g);
  }
  R.parts.legs = legs;
  const tail = R.group(body, 'tail', [0, 0.06, -0.24]);
  R.add(tail, ell(0.035, 0.035, 0.06, black, [0, 0.01, -0.03], [-0.5, 0, 0]), 'tailMesh');
  R.quadruped = true;
  R.height = 0.62;
  return R.bake();
}

// X-ray silhouette: when a character is hidden behind scenery, draw a soft coloured silhouette through it.
// The character writes stencil=1 where it is visible; the x-ray pass draws only where depth is GREATER and stencil != 1,
// so it never tints the character's own body.
export function enableXray(rig, color = '#ffd9a0', opacity = 0.55) {
  for (const m of [rig.mat, rig.outMat]) {
    m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.AlwaysStencilFunc;
    m.stencilZPass = THREE.ReplaceStencilOp; m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp;
  }
  const xm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false, toneMapped: false });
  xm.stencilWrite = true; xm.stencilRef = 1; xm.stencilFunc = THREE.NotEqualStencilFunc;
  xm.stencilFail = THREE.KeepStencilOp; xm.stencilZFail = THREE.KeepStencilOp; xm.stencilZPass = THREE.KeepStencilOp;
  for (const mesh of rig.meshes) {
    const x = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, xm) : new THREE.Mesh(mesh.geometry, xm);
    x.renderOrder = 30; x.castShadow = false; x.receiveShadow = false; x.name = mesh.name + '_xray';
    if (mesh.isSkinnedMesh) { mesh.parent.add(x); x.bind(mesh.skeleton, mesh.bindMatrix); x.boundingSphere = mesh.boundingSphere; }
    else mesh.add(x);
  }
  rig.xrayMat = xm;
  return xm;
}

// Blob contact shadow that sits under characters (sells grounding, especially in shade)
export function contactShadow(r = 0.34) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(40,20,60,0.45)'); grd.addColorStop(1, 'rgba(40,20,60,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

// ------------------------------------------------------------------ the cast
export const CAST = {
  chewy: {
    name: 'Chewy', species: 'dog', fur: '#83482c', fur2: '#a8683f', fur3: '#6e3a22', earColor: '#6a361f', earInner: '#4a2418',
    nose: '#7a3a2c', iris: '#d8962e', eye: '#d8962e', muzzleColor: '#9a5a38', blush: '#ff9a9a', muzzleScale: 1.12,
    patterns: { chestBlaze: true, chin: '#fbf1e4', tailFluff: true }, brows: false,
    outfit: { top: 'gi', topColor: '#2c3a6a', bottomColor: '#35303f', scarf: '#e0443a', sash: '#e0443a', wraps: '#f4ece0' },
  },
  rosie: {
    name: 'Rosie', species: 'human', skin: '#ffe4d2', iris: '#7a4424', eye: '#7a4424', blush: '#ff9ab0', eyeWhite: true,
    hair: { style: 'curly', color: '#6b3a22', color2: '#8e5634' },
    outfit: { top: 'dress', topColor: '#ff8fb0', topColor2: '#ffffff', socks: '#ffffff', shoes: '#d8443a', bow: '#e8364a' },
  },
};
