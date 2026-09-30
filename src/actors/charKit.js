// Procedural chibi character kit: humanoid animals (dog, cat, bunny, bear, fox, panda, tanuki, frog, duck),
// a human girl (Rosie) and a quadruped Boston terrier (Shadow). Parts are separate groups for procedural
// animation; each part is one merged vertex-coloured mesh + an inverted-hull outline.
import * as THREE from 'three';
import { makeToon, makeOutline, STENCIL_OCCLUDER } from '../gfx/materials.js';
import { merge, paint, tube, xf, mergeGeometries } from '../gfx/geom.js';
import { tennisBallTexture } from '../gfx/textures.js';
import { mulberry32, TAU, clamp } from '../core/util.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyRefined, patchSkinMaterial } from './refinedRigs.js';
import { chewyStyle } from './disneyChewy.js';
import { furMaterial, buildDisneyHead, headKind, speciesColors, disneyHand, disneyFoot, handKindFor, footKindFor, tag, paintFn, mergeIndexed, tubeGeo, disneyWizardHat } from './disneyKit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const INK = '#3a2230';
// 'disney' (default): sculpted Disney-style cast (disneyKit.js), no ink outline; 'classic': the Pokopia-style chibi kit
export const kitStyle = () => { const k = new URLSearchParams(location.search).get('kit'); return k || (chewyStyle() === 'classic' ? 'classic' : 'disney'); };
// tessellation multiplier: 1 in game; the Blender refine export (tools/blender) builds at 3 so painted colour edges are crisp
let DETAIL = 1;
const headDetail = () => DETAIL * (DETAIL > 1 ? 2 : 1); // faces are where the atlas has the most texels
export function setKitDetail(k) { DETAIL = k; }

// ------------------------------------------------------------------ primitive builders (vertex coloured)
function ell(rx, ry, rz, color, p = [0, 0, 0], r = [0, 0, 0], seg = 20, fn = null) {
  const g = new THREE.SphereGeometry(1, seg * DETAIL, Math.max(8, Math.round(seg * 0.7)) * DETAIL);
  g.scale(rx, ry, rz);
  if (r[0] || r[1] || r[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  g.translate(...p);
  const c = C(color);
  return paint(g, fn ? (pp, n, o) => fn(pp, n, o, c) : (pp, n, o) => o.copy(c));
}
function cap(r, len, color, p = [0, 0, 0], rot = [0, 0, 0], fn = null) {
  const g = new THREE.CapsuleGeometry(r, len, 6 * DETAIL, 14 * DETAIL, DETAIL > 1 ? 8 * DETAIL : 1);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  const c = C(color);
  return paint(g, fn ? (pp, n, o) => fn(pp, n, o, c) : (pp, n, o) => o.copy(c));
}
function cone(r, h, color, p, rot = [0, 0, 0], seg = 12, sx = 1, sz = 1) {
  const g = new THREE.ConeGeometry(r, h, seg * DETAIL, 2 * DETAIL);
  g.scale(sx, 1, sz);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  return paint(g, (pp, n, o) => o.copy(C(color)));
}
function torus(R, r, color, p, rot = [Math.PI / 2, 0, 0], arc = TAU) {
  const g = new THREE.TorusGeometry(R, r, 8 * DETAIL, 24 * DETAIL, arc);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p);
  return paint(g, (pp, n, o) => o.copy(C(color)));
}
function curve(pts, r, color) {
  return paint(tube(pts.map(p => ({ p: V(...p), r })), 5, true), (pp, n, o) => o.copy(C(color)));
}
const shade = (amt = 0.12) => (p, n, o, c) => { o.copy(c).multiplyScalar(1 - amt * clamp(0.5 - n.y * 0.5)); };

// ------------------------------------------------------------------ species tables
// Pokémon-style shape language: heads are sculpted (fuller cheeks, flatter crown, an integrated snout) rather than
// balls with a bulb stuck on; eyes are tall glossy ovals; ears are crisp flat triangles.
//   head: ellipsoid scale · cheek: low-side fullness · snout: [length, width, height, centre height] on the unit head
//   tufts: cheek fur points · eye: [spacing, height] on the unit head
export const SPECIES = {
  dog: { hs: 0.76, body: [1.0, 1.06], square: 0.08, head: [1.02, 0.94, 0.98], cheek: 0.12, snout: [0.52, 0.4, 0.33, -0.3], nose: [0.056, 0.04, 0.038], ears: 'rose', tail: 'dog', tufts: 0.05, eye: [0.4, 0.1] },
  cat: { hs: 0.76, body: [0.94, 1.02], square: 0.12, taper: -0.1, head: [1.12, 0.92, 0.96], cheek: 0.14, snout: [0.14, 0.3, 0.22, -0.32], nose: [0.03, 0.022, 0.022], ears: 'cat', tail: 'cat', whiskers: true, tufts: 0.05, eye: [0.42, 0.06] },
  bunny: { foot: 'long', hs: 0.72, body: [0.96, 1.08], taper: 0.1, longFace: 0.16, head: [0.94, 1.08, 0.96], cheek: 0.13, snout: [0.16, 0.28, 0.22, -0.32], nose: [0.028, 0.02, 0.02], ears: 'bunny', tail: 'puff', eye: [0.42, 0.06] },
  bear: { foot: 'bear', hand: 'bear', hs: 0.72, body: [1.2, 1.1], square: 0.4, limb: 1.18, head: [1.1, 0.96, 0.98], cheek: 0.1, snout: [0.3, 0.36, 0.28, -0.34], nose: [0.046, 0.034, 0.032], ears: 'bear', tail: 'stub', eye: [0.38, 0.08] },
  fox: { foot: 'fox', hand: 'fox', hs: 0.74, body: [0.9, 1.1], taper: -0.12, head: [1.06, 0.9, 0.98], cheek: 0.18, snout: [0.6, 0.28, 0.24, -0.3], nose: [0.036, 0.028, 0.028], ears: 'fox', tail: 'fox', tufts: 0.08, eye: [0.4, 0.1] },
  panda: { foot: 'bear', hand: 'bear', hs: 0.74, body: [1.28, 1.02], square: 0.22, taper: 0.14, belly: true, limb: 1.12, head: [1.12, 0.96, 0.98], cheek: 0.1, snout: [0.24, 0.34, 0.26, -0.34], nose: [0.044, 0.032, 0.03], ears: 'bear', tail: 'stub', patches: true, eye: [0.4, 0.06] },
  tanuki: { hs: 0.75, body: [1.2, 1.0], square: 0.15, belly: true, head: [1.1, 0.94, 0.98], cheek: 0.16, snout: [0.4, 0.3, 0.26, -0.3], nose: [0.042, 0.03, 0.03], ears: 'tanuki', tail: 'tanuki', mask: true, tufts: 0.07, eye: [0.4, 0.08] },
  frog: { foot: 'web', hand: 'web', legs: 0.02, hs: 0.84, body: [1.18, 0.92], square: 0.3, neckless: 0.07, belly: true, head: [1.42, 0.74, 1.02], cheek: 0.06, snout: null, nose: null, ears: 'none', tail: 'none', frogEyes: true, eye: [0.45, 0.62] },
  duck: { foot: 'web', hs: 0.76, body: [1.12, 1.0], taper: 0.08, belly: true, head: [1.0, 1.0, 0.98], cheek: 0.05, snout: null, beak: true, nose: null, ears: 'none', tail: 'duck', eye: [0.4, 0.12] },
  human: { hs: 0.84, body: [1.0, 1.0], head: [1.0, 0.98, 0.95], cheek: 0.07, chin: 0.07, snout: null, nose: [0.028, 0.022, 0.022], ears: 'human', tail: 'none', human: true, eye: [0.38, 0.04] },
};
const RH = 0.27; // head radius before the species scale
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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
  constructor(spec, disney = kitStyle() === 'disney') {
    this.spec = spec;
    this.root = new THREE.Group(); this.root.name = spec.name || 'char';
    this.disney = disney;
    this.mat = disney ? furMaterial() : makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }); // clean colour blocks
    // props held or worn (tools, nightcaps, swords) keep plain vertex colours: the fur shader reads uv as fur amount
    this.propMat = disney ? makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 }) : this.mat;
    this.defaultFur = 0;
    this.skinData = new Map(); // mesh -> { bones: [a, b], w: Float32Array } two-bone blend per vertex (sculpted jaws)
    this.outMat = makeOutline(spec.outline || INK, spec.outlineW ?? 0.012);
    this.parts = {};
    this.meshes = [];
  }
  add(parent, geo, name, { outline = true, shadow = true, fur } = {}) {
    if (this.disney) { outline = false; if (fur !== undefined || !geo.userData.kit) tag(geo, fur ?? this.defaultFur); }
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
    // each part is transformed into root space once (shared by the body and the outline bake); skin attributes are
    // written in one pass over the merged result instead of per part (baking a villager went from ~12 ms to a few)
    const inRoot = new Map(), m4 = new THREE.Matrix4();
    const partGeo = m => {
      let g = inRoot.get(m);
      if (!g) {
        g = m.geometry.clone().applyMatrix4(m4.multiplyMatrices(rootInv, m.matrixWorld));
        if (this.disney) { /* kept indexed: mergeIndexed below */ }
        else if (g.index || !g.attributes.uv || !g.attributes.color || Object.keys(g.attributes).length !== 4) g = merge([g]);
        inRoot.set(m, g);
      }
      return g;
    };
    const bakeList = list => {
      const geos = list.map(partGeo);
      const out = this.disney ? mergeIndexed(geos) : mergeGeometries(geos, false);
      const n = out.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      let o = 0;
      list.forEach((m, j) => {
        const bi = boneOf(m === mouth ? this.parts.mouth : m.parent), c = geos[j].attributes.position.count;
        const sd = this.skinData.get(m);
        if (sd) { // blended: bone a gets 1 - w, bone b gets w
          const b0 = boneOf(sd.bones[0]), b1 = boneOf(sd.bones[1]);
          for (let i = 0; i < c; i++) { const k = (o + i) * 4, w = sd.w[i]; si[k] = b0; sw[k] = 1 - w; si[k + 1] = b1; sw[k + 1] = w; }
        } else for (let i = o; i < o + c; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
        o += c;
      });
      out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      return out;
    };
    const bodyGeo = bakeList(toon);
    const outlined = toon.filter(m => m.userData.outline);
    const olGeo = outlined.length ? bakeList(outlined) : null;
    // remove the original part meshes (and their outline shells)
    for (const m of toon) { m.userData.outline?.parent?.remove(m.userData.outline); m.parent?.remove(m); }
    // bones must be real Bone-like objects for the skeleton: groups work since only matrixWorld is used
    const skeleton = new THREE.Skeleton(bones);
    const mk = (geo, mat, name) => {
      const sm = new THREE.SkinnedMesh(geo, mat); sm.name = name;
      root.add(sm); root.updateMatrixWorld(true);
      sm.bind(skeleton, sm.matrixWorld);
      // bind-pose bounds with headroom for animation (SkinnedMesh.computeBoundingSphere skins every vertex on the CPU)
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      sm.boundingSphere = geo.boundingSphere.clone(); sm.boundingSphere.radius *= 1.4;
      return sm;
    };
    const body = mk(bodyGeo, this.mat, 'body_skin'); body.castShadow = true; body.receiveShadow = true;
    const ol = olGeo ? mk(olGeo, this.outMat, 'outline_skin') : null; if (ol) ol.castShadow = false;
    this.meshes = [body]; this.skeleton = skeleton; this.skin = body; this.outline = ol;
    return this;
  }
  // free the GPU side of a throwaway rig (spirit pups, monsters, portrait renders). Attached props such as the
  // player's weapons use shared cached geometry and are left alone.
  dispose() {
    if (!this.sharedGeo) { this.skin?.geometry.dispose(); this.outline?.geometry.dispose(); }
    this.skeleton?.dispose(); this.mat.dispose(); this.outMat.dispose(); if (this.propMat !== this.mat) this.propMat.dispose();
  }
}

// A new rig that shares a baked rig's geometry (cheap: no procedural build, no GPU upload) but has its own
// bones, skeleton and materials, so it animates and flashes independently. Used for summons such as spirit pups.
export function cloneRig(src) {
  const R = new Rig(src.spec, !!src.disney);
  const root = cloneSkinned(src.root);
  const a = [], b = [];
  src.root.traverse(o => a.push(o)); root.traverse(o => b.push(o));
  const map = new Map(a.map((o, i) => [o, b[i]]));
  for (const k of ['height', 'quadruped', 'offsetY', 'earGain']) if (k in src) R[k] = src[k];
  R.root = root;
  for (const [k, o] of Object.entries(src.parts)) R.parts[k] = Array.isArray(o) ? o.map(x => map.get(x)) : map.get(o);
  R.skin = map.get(src.skin); R.outline = src.outline ? map.get(src.outline) : null; R.meshes = [R.skin]; R.skeleton = R.skin.skeleton;
  R.outline?.bind(R.skeleton, R.outline.bindMatrix); // one skeleton (one bone texture) for body + outline
  R.mat.emissive.copy(src.mat.emissive); R.mat.emissiveIntensity = src.mat.emissiveIntensity;
  R.mat.transparent = src.mat.transparent; R.mat.opacity = src.mat.opacity;
  if (src.skinTex) { patchSkinMaterial(R.mat, src.skinTex); R.skinTex = src.skinTex; }
  R.skin.material = R.mat; if (R.outline) R.outline.material = R.outMat;
  R.sharedGeo = true;
  return R;
}

/**
 * spec: { name, species, scale, fur, fur2, fur3, earColor, nose, eye, eyeStyle, blush,
 *   patterns:{chestBlaze, blaze, socks, tailTip}, outfit:{ top, topColor, topColor2, bottom, bottomColor, scarf, sash, apron, hat, hatColor, bow, glasses, bag },
 *   hair:{ style:'curly', color, color2 }, skin }
 */
// Rigs built ahead of time (prebuildHumanoid) are handed out by buildHumanoid for the same spec object, so a villager
// can be constructed mid-play without the ~20 ms build.
const PREBUILT = new WeakMap();
export function prebuildHumanoid(spec) { if (!PREBUILT.has(spec)) PREBUILT.set(spec, makeAny(spec)); return spec; }
export const rawHumanoid = spec => makeHumanoid(spec, true, false); // unbaked part meshes (Blender refine export, classic)
export const rawDisneyHumanoid = spec => makeDisneyHumanoid(spec, true); // unbaked (tests)
export function buildHumanoid(spec) {
  const r = PREBUILT.get(spec);
  if (r) { PREBUILT.delete(spec); return r; }
  return makeAny(spec);
}
const makeAny = spec => (kitStyle() === 'disney' ? makeDisneyHumanoid(spec) : makeHumanoid(spec));
function makeHumanoid(spec, raw = false, disney = false) {
  const R = new Rig(spec, disney);
  const sp = SPECIES[spec.species] || SPECIES.dog;
  const fur = spec.fur || '#c98f5e', fur2 = spec.fur2 || '#fff2e0', fur3 = spec.fur3 || (sp.patches ? '#2a2630' : fur);
  const limbC = sp.patches ? fur3 : null; // pandas: black arms and legs
  const skin = sp.human ? (spec.skin || '#ffe2cf') : fur;
  const of = spec.outfit || {};
  const topC = of.topColor || '#6ea8ff', topC2 = of.topColor2 || '#ffffff', botC = of.bottomColor || '#4a4a6a';

  // --- hierarchy (hip height 0.27 and part names are a contract with the animator and the NPC poses)
  const [bw, bh0] = sp.body || [1, 1], lk = sp.limb || 1;   // species body plan: torso width/height, limb thickness
  // Pokopia proportions: longer legs (dL) and arms (dA), a taller torso (TS) and a smaller head than the old chibi
  const dL = sp.legs ?? 0.05, dA = 0.035, TS = 1.12, bh = bh0 * TS, HIP = 0.27 + dL;
  const body = R.group(R.root, 'body', [0, HIP, 0]);
  const legL = R.group(R.root, 'legL', [0.08 * Math.min(bw, 1.15), HIP, 0]);
  const legR = R.group(R.root, 'legR', [-0.08 * Math.min(bw, 1.15), HIP, 0]);
  const head = R.group(body, 'head', [0, 0.415 * bh - (sp.neckless || 0), 0.012]);
  head.scale.setScalar((sp.hs || 0.8) * 0.9);
  const armL = R.group(body, 'armL', [0.146 * bw, 0.282 * bh, 0]);
  const armR = R.group(body, 'armR', [-0.146 * bw, 0.282 * bh, 0]);
  const handL = R.group(armL, 'handL', [0, -0.235 - dA, 0.02]);
  const handR = R.group(armR, 'handR', [0, -0.235 - dA, 0.02]);
  const back = R.group(body, 'back', [0, 0.17 * bh, -0.17 * bw]);

  // --- torso: a bean, narrow at the shoulders and fuller at the belly, a little flatter front-to-back (no more ball)
  // dense profile (spline through the key points) so painted necklines and belly patches have crisp edges
  const key = [[0.001, -0.02], [0.13, 0.0], [0.163, 0.055], [0.165, 0.125], [0.148, 0.2], [0.115, 0.262], [0.078, 0.305], [0.001, 0.33]].map(([r, y]) => new THREE.Vector2(r, y));
  const prof = new THREE.SplineCurve(key).getPoints(44 * DETAIL); prof[0].set(0.001, -0.02); prof[prof.length - 1].set(0.001, 0.33);
  const torso = new THREE.LatheGeometry(prof, 56 * DETAIL);
  torso.scale(bw, 1.06 * bh, 0.86 * (0.5 + bw * 0.5));
  const top = of.top || 'shirt';
  const bare = top === 'none' && !of.bottom; // Pokopia-style: just fur plus a signature accessory, no trousers
  paint(torso, (p, n, o) => {
    const front = p.z > 0;
    let c = C(topC);
    if (top === 'none') c = C(fur);
    if (top === 'dress' && p.y < 0.12) c = C(topC).lerp(C('#ffffff'), 0.05);
    if (p.y < 0.055 && top !== 'dress' && !bare) c = C(botC);
    if (top === 'overalls' && p.y < 0.18) c = C(botC);
    if (top === 'overalls' && front && Math.abs(p.x) < 0.055 && p.y < 0.24) c = C(botC);
    // V-neck opening shows fur / chest blaze
    if ((top === 'gi' || top === 'kimono') && front && p.y > 0.17 && Math.abs(p.x) < (p.y - 0.17) * 0.75 * bw) c = spec.patterns?.chestBlaze ? C('#fffaf2') : C(sp.human ? skin : fur2);
    if ((top === 'gi' || top === 'kimono') && front && p.y > 0.17 && Math.abs(Math.abs(p.x) - (p.y - 0.17) * 0.75 * bw) < 0.012) c = C(topC2 === '#ffffff' ? topC : topC2).multiplyScalar(0.8); // lapel edge
    if (top === 'none' && spec.patterns?.chestBlaze && front && Math.abs(p.x) < 0.045 + (p.y - 0.1) * 0.1 && p.y > 0.06) c = C('#fffaf2');
    // belly patch: a soft-edged oval (a hard vertex-colour cut stair-steps on the lathe grid)
    if ((top === 'none' || (sp.belly && top === 'overalls')) && front) {
      const e = sp.belly ? (p.x * p.x) / (0.012 * bw * bw) + ((p.y - 0.13) ** 2) / 0.0095 : (p.x * p.x) / 0.01 + ((p.y - 0.14) ** 2) / 0.011;
      const k = smooth(1.25, 0.8, e) * smooth(-0.02, 0.05, p.z);
      if (k > 0) c = c.clone().lerp(C(fur2), k);
    }
    if (of.apron && front && p.y > 0.02 && p.y < 0.24 && Math.abs(p.x) < 0.12) c = C(of.apron);
    o.copy(c).multiplyScalar(1 - 0.1 * clamp(0.5 - n.y));
  });
  const torsoParts = [torso];
  if (of.sash) { torsoParts.push(xf(torus(0.168, 0.022, of.sash, [0, 0.08, 0]), { s: [bw, 1, 0.87 * (0.5 + bw * 0.5)] })); torsoParts.push(ell(0.042, 0.032, 0.028, of.sash, [0.09, 0.08, 0.15])); torsoParts.push(cap(0.016, 0.06, of.sash, [0.11, 0.025, 0.15], [0, 0, 0.3])); }
  if (top === 'dress') { // A-line skirt and collar
    const sk = new THREE.LatheGeometry([[0.001, -0.05], [0.25, -0.05], [0.25, -0.035], [0.205, 0.05], [0.168, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
    sk.scale(1, 1, 0.9);
    torsoParts.push(paint(sk, (p, n, o) => { o.set(topC); if (p.y < -0.025) o.set(topC2); }));
    torsoParts.push(torus(0.078, 0.026, topC2, [0, 0.3, 0]));
  }
  if (of.bag) { torsoParts.push(ell(0.08, 0.09, 0.045, of.bag, [0, 0.15, -0.17])); torsoParts.push(xf(torus(0.165, 0.011, of.bag, [0, 0.2, 0], [Math.PI / 2 - 0.5, 0, 0]), { s: [1, 1, 0.87] })); }
  R.add(body, merge(torsoParts).scale(1, TS, 1), 'torso');

  // tail
  const tailKind = spec.tail || sp.tail; // (Moka: a Boykin's docked stub)
  if (tailKind !== 'none') buildTail(R, body, tailKind, fur, fur2, spec);

  // scarf (with trailing tails as a separate swinging group)
  if (of.scarf) {
    R.add(body, merge([xf(torus(0.098, 0.04, of.scarf, [0, 0.305 * bh, 0.005], [Math.PI / 2 + 0.12, 0, 0]), { s: [bw, 1, 0.9] }), ell(0.045, 0.036, 0.028, of.scarf, [-0.05 * bw, 0.28 * bh, 0.11])]), 'scarf');
    const tails = R.group(body, 'scarfTail', [0.02, 0.3 * TS, -0.085]);
    R.add(tails, merge([cap(0.032, 0.1, of.scarf, [0.02, -0.07, -0.03], [0.5, 0, 0.15], null), cap(0.027, 0.08, of.scarf, [-0.04, -0.06, -0.02], [0.4, 0, -0.2])]), 'scarfTails');
  }

  // --- legs & feet: a tapered leg and a proper foot (longer, flatter, soft pads) — reads as a creature, not a peg
  for (const [g, s] of [[legL, 1], [legR, -1]]) {
    const pants = top === 'dress' ? (of.socks || '#ffffff') : (of.bottom === 'shorts' || bare ? (limbC || skin) : botC);
    const parts = [xf(cap(0.058 * lk, 0.1 + dL, pants, [0, -0.095 - dL / 2, 0]), { s: [1, 1, 0.92] })];
    if (of.bottom === 'shorts' && top !== 'dress') parts.push(cap(0.068, 0.03, botC, [0, -0.045, 0]));
    const legN = parts.length;
    const footC = sp.human ? (of.shoes || '#d8443a') : (spec.patterns?.socks ? '#fffaf2' : fur3);
    const foot = sp.foot || 'paw';
    if (foot === 'long') { // bunny: long flat hind feet
      parts.push(ell(0.062, 0.042, 0.15, footC, [0, -0.232, 0.07], [0, 0, 0], 18, shade(0.12)));
      parts.push(ell(0.034, 0.008, 0.08, spec.pads || '#f6c4c8', [0, -0.272, 0.08]));
    } else if (foot === 'web') { // frog / duck: splayed webbed feet with round toe tips
      const wc = sp === SPECIES.duck ? '#ff9a3a' : footC;
      parts.push(ell(0.085, 0.022, 0.09, wc, [0, -0.255, 0.06], [0, 0, 0], 18, shade(0.1)));
      for (const t of [-1, 0, 1]) parts.push(ell(0.026, 0.02, 0.026, wc, [t * 0.055, -0.25, 0.13 - Math.abs(t) * 0.02]));
    } else if (foot === 'bear') { // big round paws with claws
      parts.push(ell(0.085, 0.06, 0.11, footC, [0, -0.218, 0.03], [0, 0, 0], 18, shade(0.15)));
      for (const t of [-1, -0.33, 0.33, 1]) parts.push(xf(cone(0.01, 0.03, '#fff6e8', [0, 0, 0], [Math.PI / 2, 0, 0], 6), { p: [t * 0.045, -0.228, 0.138] }));
      parts.push(ell(0.048, 0.008, 0.06, spec.pads || '#6a4a44', [0, -0.276, 0.03]));
    } else if (foot === 'fox') { // slim legs ending in small dark 'socks' and pointed paws
      parts.push(ell(0.06, 0.05, 0.1, spec.sock || fur3, [0, -0.225, 0.04], [0, 0, 0], 18, shade(0.15)));
      parts.push(xf(cap(0.05, 0.05, spec.sock || fur3, [0, -0.17, 0]), { s: [1, 1, 0.92] }));
    } else {
      parts.push(ell(0.07, 0.052, 0.112, footC, [0, -0.222, 0.035], [0, 0, 0], 18, shade(0.15)));
      if (!sp.human) {
        for (const t of [-1, 0, 1]) parts.push(ell(0.018, 0.013, 0.011, INK, [t * 0.03, -0.232, 0.142]));
        parts.push(ell(0.04, 0.008, 0.05, spec.pads || '#f2b8b0', [0, -0.272, 0.04])); // paw pad peeking under the foot
      }
    }
    for (let i = legN; i < parts.length; i++) parts[i].translate(0, -dL, 0); // feet at the new hip height
    R.add(g, merge(parts), 'leg');
  }
  // --- arms: slimmer, longer, with a mitten paw and a little thumb
  for (const [g, s] of [[armL, 1], [armR, -1]]) {
    const sleeve = top === 'none' ? (limbC || fur) : (top === 'overalls' ? of.shirt || '#ffffff' : topC);
    const r = (sp.human ? 0.042 : 0.047) * lk;
    const parts = [cap(r, 0.14 + dA, sleeve, [0, -0.095 - dA / 2, 0])];
    if (top === 'gi' || top === 'kimono') parts.push(paint(new THREE.CylinderGeometry(r + 0.014, r + 0.024, 0.07, 14).translate(0, -0.12, 0), (p, n, o) => o.set(sleeve)));
    if (top === 'dress') parts.push(ell(0.064, 0.052, 0.064, topC, [0, -0.03, 0]));
    // bandage bands sit just proud of the sleeve all the way round (flush bands z-fought with the arm into white noise)
    if (of.wraps) { for (const [y, rr] of [[-0.18, r + 0.005], [-0.155, r + 0.007]]) parts.push(paint(xf(new THREE.CylinderGeometry(rr, rr, 0.028, 12 * DETAIL), { p: [0, y, 0.004], r: [0.1, 0, 0.12] }), (p, n, o) => o.set(of.wraps))); }
    const handC = sp.human ? skin : (sp.hand === 'fox' ? (spec.sock || fur3) : (limbC || fur));
    if (sp.hand === 'web') { // frog: slim fingers with round pads
      parts.push(ell(0.036, 0.04, 0.03, handC, [0, -0.222, 0.01], [0, 0, 0], 14, shade(0.1)));
      for (const t of [-1, 0, 1]) parts.push(ell(0.016, 0.016, 0.016, handC, [t * 0.026, -0.262, 0.018]));
    } else if (sp.hand === 'bear') { // big paw with a pale pad
      parts.push(ell(0.058, 0.062, 0.05, handC, [0, -0.232, 0.01], [0, 0, 0], 16, shade(0.1)));
      parts.push(ell(0.03, 0.03, 0.01, spec.pads || '#6a4a44', [0, -0.238, 0.056]));
    } else {
      parts.push(ell(0.048, 0.056, 0.042, handC, [0, -0.228, 0.01], [0, 0, 0], 16, shade(0.1)));
      parts.push(ell(0.018, 0.026, 0.018, handC, [-s * 0.038, -0.212, 0.026], [0, 0, s * 0.5]));
    }
    for (let i = 1; i < parts.length; i++) { parts[i].computeBoundingBox(); if (parts[i].boundingBox.max.y < -0.12) parts[i].translate(0, -dA, 0); } // hands, wraps
    R.add(g, merge(parts), 'arm');
  }
  // --- head
  const face = buildHead(R, head, sp, spec, { fur, fur2, fur3, skin });
  // bow / hats
  const hatAnchor = R.group(head, 'hatAnchor', [0, face.top - 0.02, 0]);
  if (of.hat) buildHat(R, hatAnchor, of.hat, of.hatColor || '#f4c04a', sp);
  if (of.bow) { const b = face.at(0.42, 0.72, 0.01); R.add(head, merge([ell(0.08, 0.055, 0.036, of.bow, [b.x - 0.065, b.y + 0.02, b.z], [0.5, 0, 0.45]), ell(0.08, 0.055, 0.036, of.bow, [b.x + 0.065, b.y - 0.01, b.z - 0.01], [0.5, 0, -0.35]), ell(0.036, 0.036, 0.036, of.bow, [b.x, b.y + 0.005, b.z + 0.01])]), 'bow'); }

  R.root.scale.setScalar(spec.scale || 1);
  R.height = 1.22 * (spec.scale || 1); // longer legs + torso
  return raw ? R : !R.disney && applyRefined(R) ? R : R.bake();
}

// ------------------------------------------------------------------ Disney-style humanoid (sculpted parts: disneyKit.js)
// Same skeleton, part names and body plans as the classic kit (the Animator, poses, props and seats keep working);
// the head is sculpted per species with a hinged jaw, lidded eyes and cupped ears, hands have fingers, feet have toes,
// and clothes are layers with collar bands, cuffs, hems, folds and a knotted sash. No ink outline.
function flatBand(R0, hh, t, seg = 44) { // a ring of cloth with a rounded-rectangle section, round the y axis
  const r = Math.min(hh, t / 2) * 0.9, a = R0 - t / 2, b = R0 + t / 2, pts = [];
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 3; i++) { const q = a0 + (i / 3) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(q) * r, cy + Math.sin(q) * r)); } };
  arc(a + r, -hh + r, Math.PI); arc(b - r, -hh + r, -Math.PI / 2); arc(b - r, hh - r, 0); arc(a + r, hh - r, Math.PI / 2);
  pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, seg);
}
function clothStrip(len, w0, w1, t) { // a flat tapering strip hanging down from y = 0
  const g = new THREE.BoxGeometry(1, len, t, 1, 5, 1), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) { const u = 0.5 - P.getY(i) / len; P.setX(i, P.getX(i) * (w0 + (w1 - w0) * u)); }
  g.translate(0, -len / 2, 0); g.computeVertexNormals();
  return g;
}
const kitGeo = g => { g.userData.kit = true; return g; };
const tinted = (g, hex, fur = 0) => paintFn(g, (x, y, z, nx, ny, nz, o) => { o.set(hex).multiplyScalar(1 - 0.08 * clamp(0.4 - ny)); return fur; });

function makeDisneyHumanoid(spec, raw = false) {
  const R = new Rig(spec, true);
  const sp = SPECIES[spec.species] || SPECIES.dog;
  const kind = headKind(spec, sp), cols = speciesColors(spec, sp);
  const fur = spec.fur || '#c98f5e', fur2 = spec.fur2 || '#fff2e0', fur3 = spec.fur3 || (sp.patches ? '#2a2630' : fur);
  const limbC = sp.patches ? fur3 : null;
  const skin = sp.human ? (spec.skin || '#ffe2cf') : fur;
  const of = spec.outfit || {};
  const topC = of.topColor || '#6ea8ff', topC2 = of.topColor2 || '#ffffff', botC = of.bottomColor || '#4a4a6a';
  const trimC = topC2 !== '#ffffff' ? topC2 : C(topC).multiplyScalar(0.72).getStyle();
  const FUR = sp.human ? 0 : 1;

  // --- hierarchy: the classic kit's bones and part names (the Animator and the NPC poses depend on them), with
  // leaner Disney proportions: a narrower, shallower torso with a waist, a neck, longer legs, slimmer limbs, smaller
  // paws. Species body plans still differ (bears and pandas stay the burliest), just less.
  const [bw0, bh0] = sp.body || [1, 1], lk0 = sp.limb || 1;
  const bw = 0.8 * (1 + (bw0 - 1) * 0.55), lk = 1 + (lk0 - 1) * 0.6;
  const dL = (sp.legs ?? 0.05) + 0.045, dA = 0.045, TS = 1.12, bh = bh0 * TS, HIP = 0.27 + dL, NECK = 0.03 - (sp.neckless || 0);
  const body = R.group(R.root, 'body', [0, HIP, 0]);
  const legX = 0.078 * bw;
  const legL = R.group(R.root, 'legL', [legX, HIP, 0]);
  const legR = R.group(R.root, 'legR', [-legX, HIP, 0]);
  const head = R.group(body, 'head', [0, 0.415 * bh + NECK + 0.02, 0.012]);

  // --- torso: a lean bean (chest over a gentle waist), with cloth folds and fur where the fur shows
  const key = [[0.001, -0.02], [0.128, 0.0], [0.15, 0.05], [0.136, 0.118], [0.148, 0.198], [0.132, 0.262], [0.086, 0.306], [0.001, 0.33]].map(([r, y]) => new THREE.Vector2(r, y));
  const prof = new THREE.SplineCurve(key).getPoints(40); prof[0].set(0.001, -0.02); prof[prof.length - 1].set(0.001, 0.33);
  const top = of.top || 'shirt', bare = top === 'none' && !of.bottom, wrap = top === 'gi' || top === 'kimono';
  const dz = 0.74 * (0.6 + 0.4 * bw0), sy = 1.06 * bh;
  const radiusAt = y => { // the torso's radius at a (scaled) height
    const u = y / sy; for (let i = 1; i < prof.length; i++) if (prof[i].y >= u) { const a = prof[i - 1], b = prof[i], t = (u - a.y) / (b.y - a.y || 1); return a.x + (b.x - a.x) * t; }
    return 0.001;
  };
  const armR0 = (sp.human ? 0.033 : 0.037) * lk;                       // arm radius
  const armX = radiusAt(0.282 * bh / TS) * bw + armR0 * 0.5;           // shoulders sit on the torso's side
  const armL = R.group(body, 'armL', [armX, 0.282 * bh, 0]);
  const armR = R.group(body, 'armR', [-armX, 0.282 * bh, 0]);
  R.group(armL, 'handL', [0, -0.235 - dA, 0.02]); R.group(armR, 'handR', [0, -0.235 - dA, 0.02]);
  R.group(body, 'back', [0, 0.17 * bh, -radiusAt(0.16) * dz - 0.02]);
  const torso = new THREE.LatheGeometry(prof, 44);
  torso.scale(bw, sy, dz);
  if (wrap || top === 'shirt') { // the skirt of the gi / kimono / shirt hangs in soft folds below the belt
    const P = torso.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = smooth(0.075, 0.02, y) * smooth(-0.02, 0.01, y) * (wrap ? 0.022 : 0.012);
      if (k > 0) { const a = Math.atan2(x, z), f = 1 + k * Math.sin(a * 13 + y * 30) + k * 0.6; P.setX(i, x * f); P.setZ(i, z * f); }
    }
    torso.computeVertexNormals();
  }
  const skinC = C(sp.human ? skin : fur), fur2C = C(fur2), blazeC = C('#fffaf2');
  paintFn(torso, (x, y, z, nx, ny, nz, o) => {
    const front = z > 0; let c = C(topC), f = 0;
    if (top === 'none') { c = C(fur); f = FUR; }
    if (top === 'dress' && y < 0.12) c = C(topC).lerp(C('#ffffff'), 0.05);
    if (y < 0.055 && top !== 'dress' && !bare) { c = C(botC); f = 0; }
    if (top === 'overalls' && y < 0.18) c = C(botC);
    if (top === 'overalls' && front && Math.abs(x) < 0.055 && y < 0.24) c = C(botC);
    if (wrap && front && y > 0.17 && Math.abs(x) < (y - 0.17) * 0.75 * bw) { c = spec.patterns?.chestBlaze ? blazeC.clone() : (sp.human ? skinC.clone() : fur2C.clone()); f = FUR; }
    if (top === 'none' && spec.patterns?.chestBlaze && front && Math.abs(x) < 0.045 + (y - 0.1) * 0.1 && y > 0.06) c = blazeC.clone();
    if ((top === 'none' || (sp.belly && top === 'overalls')) && front) {
      const e = sp.belly ? (x * x) / (0.012 * bw * bw) + ((y - 0.13) ** 2) / 0.0095 : (x * x) / 0.01 + ((y - 0.14) ** 2) / 0.011;
      const k = smooth(1.25, 0.8, e) * smooth(-0.02, 0.05, z);
      if (k > 0) c = c.clone().lerp(fur2C, k);
    }
    if (of.apron && front && y > 0.02 && y < 0.24 && Math.abs(x) < 0.12) { c = C(of.apron); f = 0; }
    o.copy(c).multiplyScalar(1 - 0.1 * clamp(0.5 - ny));
    return f;
  });
  const torsoParts = [torso];
  { // neck: from inside the shoulders up into the head
    const n0 = 0.3 * sy, n1 = (0.415 * bh + NECK + 0.02) / TS, nr = (sp.human ? 0.03 : 0.036) * (0.8 + 0.2 * bw0);
    const neck = new THREE.CylinderGeometry(nr, nr * 1.15, n1 - n0, 16, 1, true).translate(0, (n0 + n1) / 2, 0);
    const nc = sp.human ? skin : (spec.patterns?.chestBlaze || wrap ? fur2 : fur);
    torsoParts.push(tinted(neck, nc, FUR));
  }
  const ellipse = (y, lift, a0 = 0, a1 = TAU, n = 40) => { // points round the torso at height y, `lift` off the surface
    const r = radiusAt(y), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([Math.sin(a) * (r * bw + lift), y, Math.cos(a) * (r * dz + lift)]); }
    return pts;
  };
  if (wrap) { // collar bands along the V and round the back of the neck
    const side = s => { const pts = []; for (let y = 0.172; y <= 0.335; y += 0.012) { const r = radiusAt(y), x = Math.min(s * (y - 0.17) * 0.75 * bw, r * bw * 0.92), xx = s > 0 ? x : Math.max(s * (y - 0.17) * 0.75 * bw, -r * bw * 0.92); const zz = dz * r * Math.sqrt(Math.max(0, 1 - (xx / (r * bw)) ** 2)); pts.push([xx, y, zz + 0.004]); } return pts; };
    const L = side(1), Rr = side(-1), yb = 0.34, ang = p => Math.atan2(p[0], p[2]);
    const back = ellipse(yb, 0.004, ang(L[L.length - 1]), TAU + ang(Rr[Rr.length - 1]), 24);
    torsoParts.push(tinted(tubeGeo([...L.reverse(), ...back, ...Rr], 0.0115, 7), trimC));
  }
  if (wrap || top === 'shirt') torsoParts.push(tinted(tubeGeo(ellipse(0.062, 0.018 + (wrap ? 0.018 : 0.009), 0, TAU, 56), 0.009, 6), wrap ? trimC : C(topC).multiplyScalar(0.85).getStyle())); // rolled hem
  if (top === 'shirt') torsoParts.push(tinted(flatBand(0.075, 0.012, 0.018).translate(0, 0.335, 0).scale(bw, 1, dz), C(topC).multiplyScalar(0.88).getStyle())); // collar
  if (of.sash) { // wrapped sash, knot and two tails
    torsoParts.push(tinted(flatBand(radiusAt(0.085) + 0.024, 0.024, 0.016).translate(0, 0.085, 0).scale(bw, 1, dz), of.sash));
    const kz = radiusAt(0.085) * dz + 0.03, kx = 0.055 * bw;
    torsoParts.push(tinted(new THREE.SphereGeometry(1, 14, 10).scale(0.026, 0.024, 0.016).translate(kx, 0.085, kz), of.sash));
    torsoParts.push(tinted(clothStrip(0.1, 0.034, 0.042, 0.006).rotateZ(0.1).translate(kx - 0.008, 0.075, kz + 0.002), C(of.sash).multiplyScalar(0.93).getStyle()));
    torsoParts.push(tinted(clothStrip(0.085, 0.03, 0.038, 0.006).rotateZ(-0.35).translate(kx + 0.01, 0.075, kz - 0.002), C(of.sash).multiplyScalar(0.88).getStyle()));
  }
  if (top === 'overalls') { // straps over the shoulders and two buttons
    for (const s of [1, -1]) {
      torsoParts.push(tinted(tubeGeo([[s * 0.04, 0.2, radiusAt(0.2) * dz + 0.004], [s * 0.052, 0.3, radiusAt(0.3) * dz + 0.004], [s * 0.06, 0.34, 0.0], [s * 0.052, 0.25, -radiusAt(0.25) * dz - 0.004]], 0.008, 5), botC));
      torsoParts.push(tinted(new THREE.SphereGeometry(0.011, 10, 8).scale(1, 1, 0.5).translate(s * 0.045, 0.205, radiusAt(0.205) * dz + 0.008), '#f4d06a'));
    }
  }
  if (top === 'dress') { // A-line skirt with folds, a white hem and a collar
    const sk = new THREE.LatheGeometry([[0.001, -0.05], [0.215, -0.05], [0.215, -0.035], [0.172, 0.05], [0.136, 0.12]].map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const P = sk.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 0.035 * smooth(0.1, -0.04, y), f = 1 + k * Math.sin(Math.atan2(x, z) * 11); P.setX(i, x * f); P.setZ(i, z * f * 0.9); }
    sk.computeVertexNormals();
    torsoParts.push(tinted(sk, topC));
    torsoParts.push(tinted(tubeGeo(Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * TAU; return [Math.sin(a) * 0.22 * (1 + 0.035 * Math.sin(a * 11)), -0.045, Math.cos(a) * 0.22 * 0.9 * (1 + 0.035 * Math.sin(a * 11))]; }), 0.01, 6), topC2));
    torsoParts.push(tinted(flatBand(0.064, 0.014, 0.026).translate(0, 0.3, 0), topC2));
  }
  if (of.bag) { const bz = radiusAt(0.15) * dz + 0.03; torsoParts.push(tinted(new THREE.SphereGeometry(1, 16, 12).scale(0.07, 0.08, 0.04).translate(0, 0.15, -bz), of.bag)); torsoParts.push(tinted(xf(new THREE.TorusGeometry(0.14, 0.01, 8, 32), { p: [0, 0.2, 0], r: [Math.PI / 2 - 0.5, 0, 0], s: [bw / 0.85, 1, dz / 0.85] }), of.bag)); }
  R.add(body, kitGeo(mergeIndexed(torsoParts).scale(1, TS, 1)), 'torso');

  // --- tail (fur)
  R.defaultFur = FUR;
  const tailKind = spec.tail || sp.tail; // (Moka: a Boykin's docked stub)
  if (tailKind !== 'none') buildTail(R, body, tailKind, fur, fur2, spec);
  R.defaultFur = 0;

  // --- neckerchief: a band, a knot and two points (+ the swinging tails behind)
  if (of.scarf) {
    const yN = 0.305 * bh;
    const nz = 0.08;
    const band = flatBand(0.075, 0.024, 0.018, 40).rotateX(0.12).scale(1, 1, 0.92).translate(0, yN, 0.004);
    const knot = new THREE.SphereGeometry(1, 12, 10).scale(0.025, 0.022, 0.018).translate(0, yN - 0.02, nz);
    const pts = [1, -1].map(s => clothStrip(0.065, 0.045, 0.004, 0.006).rotateZ(s * 0.35).rotateX(-0.25).translate(s * 0.011, yN - 0.03, nz + 0.004));
    R.add(body, kitGeo(mergeIndexed([tinted(band, of.scarf), tinted(knot, of.scarf), ...pts.map(p => tinted(p, C(of.scarf).multiplyScalar(0.92).getStyle()))])), 'scarf');
    const tails = R.group(body, 'scarfTail', [0.02, 0.3 * TS, -0.085]);
    R.add(tails, kitGeo(mergeIndexed([tinted(clothStrip(0.11, 0.045, 0.03, 0.007).rotateX(0.5).rotateZ(0.15).translate(0.02, -0.02, -0.03), of.scarf), tinted(clothStrip(0.09, 0.04, 0.026, 0.007).rotateX(0.4).rotateZ(-0.2).translate(-0.04, -0.02, -0.02), of.scarf)])), 'scarfTails');
  }

  // --- legs (pants gathered into a cuff, or fur) and sculpted feet with toes
  for (const [g] of [[legL], [legR]]) {
    const inPants = top !== 'dress' && !(of.bottom === 'shorts' || bare);
    const legC = top === 'dress' ? (of.socks || '#ffffff') : (inPants ? botC : (limbC || skin));
    const lr = 0.045 * lk + (inPants ? 0.009 : 0), yTop = -0.045, yBot = -(HIP - 0.045) + lr; // hip to inside the foot
    const leg = new THREE.CapsuleGeometry(lr, yTop - yBot, 6, 16, 8);
    leg.translate(0, (yTop + yBot) / 2, 0); leg.scale(1, 1, 0.92);
    if (inPants) { const P = leg.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), f = 1 + 0.06 * Math.sin(Math.atan2(x, z) * 7 + y * 60) * smooth(-0.05, -0.1, y); P.setX(i, x * f); P.setZ(i, z * f); } leg.computeVertexNormals(); }
    const parts = [tinted(leg, legC, inPants || top === 'dress' ? 0 : FUR)];
    if (inPants) parts.push(tinted(flatBand(0.047 * lk + 0.006, 0.012, 0.014).translate(0, -(HIP - 0.1), 0), C(botC).multiplyScalar(0.85).getStyle()));
    if (of.bottom === 'shorts' && top !== 'dress') parts.push(tinted(new THREE.CapsuleGeometry(0.057, 0.04, 4, 16).translate(0, -0.05, 0), botC));
    const fk = footKindFor(sp), footC = sp.human ? (of.shoes || '#d8443a') : fk === 'web' && sp === SPECIES.duck ? '#ff9a3a' : (spec.patterns?.socks ? '#fffaf2' : sp.foot === 'fox' ? (spec.sock || fur3) : (limbC || fur3));
    parts.push(disneyFoot(fk, footC, sp.human || fk === 'web' ? 0 : FUR, sp.human ? null : spec.pads || (fk === 'web' ? null : '#3a2320')).scale(0.84, 0.86, 0.86).translate(0, -HIP, -0.026));
    R.add(g, kitGeo(mergeIndexed(parts)), 'leg');
  }
  // --- arms: sleeve (or fur) and a sculpted hand with fingers and a thumb
  for (const [g, s] of [[armL, 1], [armR, -1]]) {
    const sleeve = top === 'none' ? (limbC || fur) : (top === 'overalls' ? of.shirt || '#ffffff' : topC);
    const bareArm = top === 'none';
    const r = armR0;
    const arm = new THREE.CapsuleGeometry(r, 0.14 + dA, 6, 16, 6).translate(0, -0.095 - dA / 2, 0);
    { const P = arm.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = 1 - 0.14 * smooth(-0.1, -0.2, y); P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); } arm.computeVertexNormals(); } // tapers to the wrist
    const parts = [tinted(arm, sleeve, bareArm ? FUR : 0)];
    if (wrap) { // wide sleeve with a rolled cuff
      parts.push(tinted(new THREE.CylinderGeometry(r + 0.012, r + 0.02, 0.07, 18, 1, true).translate(0, -0.12, 0), sleeve));
      parts.push(tinted(flatBand(r + 0.02, 0.008, 0.011, 24).translate(0, -0.155, 0), trimC));
    } else if (top === 'shirt' || top === 'overalls') parts.push(tinted(flatBand(r + 0.006, 0.007, 0.01, 20).translate(0, -0.1, 0), C(sleeve).multiplyScalar(0.85).getStyle()));
    if (top === 'dress') parts.push(tinted(new THREE.SphereGeometry(1, 16, 12).scale(0.052, 0.046, 0.052).translate(0, -0.03, 0), topC));
    if (of.wraps) for (const [y, rr] of [[-0.18 - dA, r + 0.005], [-0.155 - dA, r + 0.007]]) parts.push(tinted(xf(new THREE.CylinderGeometry(rr, rr, 0.028, 16), { p: [0, y, 0.004], r: [0.1, 0, 0.12] }), of.wraps));
    const handC = sp.human ? skin : (sp.hand === 'fox' ? (spec.sock || fur3) : (limbC || fur));
    parts.push(disneyHand(handKindFor(sp), s, handC, sp.human ? 0 : FUR).scale(0.84, 0.84, 0.84).translate(0, -0.185 - dA, 0.004));
    R.add(g, kitGeo(mergeIndexed(parts)), 'arm');
  }

  // --- head
  const H = buildDisneyHead(head, spec, sp, cols, kind);
  for (const [parent, g, name, skin] of H.geos) { const m = R.add(parent, kitGeo(g), name); if (skin) R.skinData.set(m, skin); }
  Object.assign(R.parts, H.parts); R.parts.eyes = []; R.parts.brows = [];
  // hats and bows were designed for the classic head: they sit on an anchor scaled to the sculpted skull
  const hatS = 0.544 / H.K;
  const hatAnchor = R.group(head, 'hatAnchor', [0, H.top - 0.012, -0.005]);
  hatAnchor.scale.setScalar(hatS); hatAnchor.userData.hatScale = hatS;
  // Moka's floppy wizard hat is sculpted for the Disney head (disneyKit), in head space; the rest sit on the hat anchor
  if (of.hat === 'wizard') R.add(R.group(head, 'hatBone', [0, 0, 0]), kitGeo(disneyWizardHat({ color: of.hatColor || '#3fb0a0', band: of.sash || '#8a6ad8' })), 'hat'); // (own bone: a nightcap can scale it away)
  else if (of.hat) buildHat(R, hatAnchor, of.hat, of.hatColor || '#f4c04a', sp);
  if (of.bow) {
    const bowG = R.group(head, 'bowAnchor', [0.07, 0.118, 0.02]); bowG.scale.setScalar(hatS); bowG.rotation.set(0.3, 0, -0.35);
    R.add(bowG, merge([ell(0.08, 0.055, 0.036, of.bow, [-0.065, 0.02, 0], [0.5, 0, 0.45]), ell(0.08, 0.055, 0.036, of.bow, [0.065, -0.01, -0.01], [0.5, 0, -0.35]), ell(0.036, 0.036, 0.036, of.bow, [0, 0.005, 0.01])]), 'bow');
  }
  if (spec.hair) { // classic curls, scaled to the sculpted skull (the curls get the fur shader's strands too)
    const hg = R.group(head, 'hairAnchor', [0, 0.035, -0.012]); hg.scale.setScalar(hatS * 1.06);
    R.defaultFur = 1; buildHair(R, hg, spec.hair, sp); R.defaultFur = 0;
  }
  if (kind === 'dog' || kind === 'spaniel') R.earGain = kind === 'spaniel' ? 1.6 : 2.2; // (long hanging ears want less spring gain)
  R.root.scale.setScalar(spec.scale || 1);
  R.height = (1.22 + 0.045 + NECK) * (spec.scale || 1);
  return raw ? R : R.bake();
}

// Sculpt a head from a dense unit sphere. deform() is analytic, so face features can be placed exactly on the
// surface with at(u, v): u = side (-1..1), v = height (-1..1) on the front of the unit head.
function sculptor(sp, rh = RH) {
  const [hx, hy, hz] = sp.head, sn = sp.snout;
  const deform = (u, v, w) => {
    if (sp.square) { // push toward a superellipsoid (rounded box): corners fill out, the skull stops being a ball
      const n = 2 + sp.square * 5, r = Math.pow(Math.abs(u) ** n + Math.abs(v) ** n + Math.abs(w) ** n, 1 / n) || 1;
      const k = 1 + sp.square * (1 / r - 1) * 0.85; u *= k; v *= k; w *= k;
    }
    let x = u * hx, y = v * hy, z = w * hz;
    if (sp.taper) x *= 1 - sp.taper * v;                              // >0 pear (narrow crown), <0 wide crown / pointed chin
    if (sp.longFace && v < 0.2) y -= sp.longFace * (0.2 - v) * hy * 0.6; // longer lower face
    x *= 1 + sp.cheek * smooth(0.25, -0.55, v);                       // fuller cheeks low on the face
    if (v > 0.45) y -= (v - 0.45) * 0.16 * hy;                         // flatter crown
    if (w < 0) z *= 1 - 0.12 * -w;                                    // flatter back of the head
    if (sp.chin) { const c = sp.chin * smooth(-0.15, -0.95, v); x *= 1 - c; z *= 1 - c * 0.5; y -= c * 0.1; }
    let m = 0;
    if (sn) {                                                         // snout grows out of the face (no seam)
      const [L, sw, sh, cv] = sn;
      m = Math.exp(-((u / sw) ** 2) - ((v - cv) / sh) ** 2) * smooth(0.05, 0.65, w);
      z += L * m * hz; y -= L * m * 0.1 * hy; x *= 1 - m * 0.25;
    }
    if (sp.tufts && w > -0.5) {                                       // two soft fur points on each cheek
      const band = smooth(0.6, 0.95, Math.abs(u)) * smooth(0.1, -0.1, v) * smooth(-0.85, -0.6, v);
      const t = Math.max(0, Math.sin((v + 0.85) * Math.PI * 2.6));
      x += Math.sign(u) * sp.tufts * band * t * t;
    }
    return [x * rh, y * rh, z * rh, m];
  };
  const at = (u, v, lift = 0) => {
    const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const [x, y, z] = deform(u, v, w), e = 0.01;
    const [x2, y2, z2] = deform(u + e, v, Math.sqrt(Math.max(0, 1 - (u + e) ** 2 - v * v)));
    const [x3, y3, z3] = deform(u, v + e, Math.sqrt(Math.max(0, 1 - u * u - (v + e) ** 2)));
    const n = new THREE.Vector3(x2 - x, y2 - y, z2 - z).cross(new THREE.Vector3(x3 - x, y3 - y, z3 - z)).normalize();
    const p = new THREE.Vector3(x, y, z).addScaledVector(n, lift); p.n = n;
    return p;
  };
  return { deform, at };
}

function buildHead(R, head, sp, spec, { fur, fur2, fur3, skin }) {
  const eyeC = spec.eye || '#2a1a14';
  const parts = [], shell = []; // shell: outlined volumes (skull, beak, ears of humans, frog eye bulbs); parts: face details without ink hulls
  const pat = spec.patterns || {};
  const S = sculptor(sp);
  const muzC = C(spec.muzzleColor || fur2), baseC = C(sp.human ? skin : fur);
  // skull
  let headG = new THREE.SphereGeometry(1, 48 * headDetail(), 34 * headDetail());
  let pa = headG.attributes.position;
  headG.deleteAttribute('uv'); headG.deleteAttribute('normal');
  headG = mergeVertices(headG, 1e-4); // weld the UV seam first: no shading crease after sculpting
  pa = headG.attributes.position;
  const mk = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) { const [x, y, z, m] = S.deform(pa.getX(i), pa.getY(i), pa.getZ(i)); pa.setXYZ(i, x, y, z); mk[i] = m; }
  headG.computeVertexNormals();
  const col = new Float32Array(pa.count * 3), c = new THREE.Color();
  const n = headG.attributes.normal;
  for (let i = 0; i < pa.count; i++) {
    const u = pa.getX(i) / (RH * sp.head[0]), v = pa.getY(i) / (RH * sp.head[1]), w = pa.getZ(i) / (RH * sp.head[2]);
    c.copy(baseC);
    if (pat.blaze && w > 0.2 && Math.abs(u) < 0.13 + Math.max(0, -v) * 0.8 && v < 0.95) c.set('#fffaf2');
    if (pat.faceWhite && w > 0.4 && v < -0.05) c.copy(C(fur2));
    if (spec.species === 'fox' && w > 0.3 && v < -0.12 && Math.abs(u) > 0.2) c.copy(C(fur2));
    if (spec.species === 'cat' && pat.cheeks && w > 0.4 && v < -0.15) c.copy(C(fur2));
    if (mk[i] > 0.3) c.copy(muzC);
    if (pat.chin && mk[i] > 0.12 && v < (sp.snout ? sp.snout[3] - 0.12 : -0.4)) c.set(pat.chin);
    c.multiplyScalar(1 - 0.1 * clamp(0.4 - n.getY(i) * 0.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  headG.setAttribute('color', new THREE.BufferAttribute(col, 3));
  shell.push(headG);

  // nose, mouth
  if (sp.snout) {
    const [, , sh, cv] = sp.snout;
    const tip = S.at(0, cv + sh * 0.28, 0.004);
    if (sp.nose) {
      const [nx, ny, nz] = sp.nose, k = spec.muzzleScale || 1;
      const ng = ell(nx * k, ny * k, nz * k, spec.nose || '#3a1e1a', [0, 0, 0], [0, 0, 0], 16);
      // a rounded triangle: wide on top, narrowing down
      const npos = ng.attributes.position; for (let i = 0; i < npos.count; i++) { const y = npos.getY(i); npos.setX(i, npos.getX(i) * (1 + clamp(y / (ny * k)) * 0.25 - clamp(-y / (ny * k)) * 0.35)); }
      ng.computeVertexNormals();
      parts.push(xf(ng, { p: [tip.x, tip.y, tip.z - nz * 0.35], r: [0.25, 0, 0] }));
      parts.push(ell(nx * 0.32, ny * 0.22, nz * 0.25, '#ffffff', [-nx * 0.35, tip.y + ny * 0.5, tip.z + nz * 0.45]));
    }
    // mouth: a small ω following the snout surface, joined to the nose
    const mv = cv - sh * 0.42, pts = [-0.16, -0.08, 0, 0.08, 0.16].map((u, i) => { const q = S.at(u, mv + (i % 4 === 0 ? 0.06 : i === 2 ? 0.015 : -0.02), 0.006); return [q.x, q.y, q.z]; });
    parts.push(curve(pts.slice(0, 3), 0.0065, INK), curve(pts.slice(2), 0.0065, INK));
    if (sp.nose) { const a = S.at(0, cv + sh * 0.05, 0.006), b = S.at(0, mv + 0.015, 0.006); parts.push(curve([[a.x, a.y, a.z], [b.x, b.y, b.z]], 0.0055, INK)); }
    if (sp.whiskers) for (const s of [-1, 1]) for (const k of [0, 1]) { const q = S.at(s * 0.2, cv - 0.02 - k * 0.09, 0.004); parts.push(curve([[q.x, q.y, q.z], [q.x + s * 0.06, q.y + 0.008 - k * 0.016, q.z - 0.015]], 0.0024, INK)); }
  } else if (sp.human) {
    const q = S.at(0, -0.2, 0.004); parts.push(ell(0.024, 0.018, 0.016, '#ffc8b0', [q.x, q.y, q.z]));
    const m = [-0.13, -0.065, 0, 0.065, 0.13].map(u => { const p = S.at(u, -0.44 - 0.05 * (1 - (u / 0.13) ** 2), 0.004); return [p.x, p.y, p.z]; });
    parts.push(curve(m, 0.0065, '#b8505a'));
  } else if (sp.beak) {
    const q = S.at(0, -0.22, 0);
    shell.push(ell(0.095, 0.032, 0.1, '#ffb040', [q.x, q.y, q.z + 0.02], [0.1, 0, 0])); shell.push(ell(0.085, 0.028, 0.085, '#f09030', [q.x, q.y - 0.03, q.z + 0.005], [0.15, 0, 0]));
  } else if (sp.frogEyes) {
    const m = [-0.42, -0.2, 0, 0.2, 0.42].map(u => { const p = S.at(u, -0.28 - (0.42 - Math.abs(u)) * 0.12, 0.004); return [p.x, p.y, p.z]; });
    parts.push(curve(m, 0.0075, INK));
  }
  // face markings (panda eye patches, tanuki mask) sit behind the eyes
  const [eu, ev] = sp.eye;
  if (sp.patches) for (const s of [-1, 1]) { const q = S.at(s * eu, ev - 0.08, 0.002); parts.push(xf(ell(0.07, 0.088, 0.02, '#2a2630'), { p: [q.x, q.y, q.z], r: [0, s * 0.45, s * -0.5] })); }
  if (sp.mask) for (const s of [-1, 1]) { const q = S.at(s * (eu + 0.05), ev - 0.06, 0.002); parts.push(xf(ell(0.095, 0.06, 0.02, spec.fur3 || '#3a2c28'), { p: [q.x, q.y, q.z], r: [0, s * 0.45, s * 0.25] })); }
  // blush on the cheek bumps
  const blush = spec.blush || '#ff9ab0';
  if (blush !== 'none') for (const s of [-1, 1]) { const q = S.at(s * 0.66, sp.human ? -0.24 : -0.2, 0.002); parts.push(xf(ell(0.044, 0.026, 0.014, blush), { p: [q.x, q.y, q.z], r: [0, s * 0.75, 0] })); }
  // human ears
  if (sp.ears === 'human') for (const s of [-1, 1]) { const q = S.at(s * 0.97, -0.08, -0.004); shell.push(ell(0.03, 0.045, 0.026, skin, [q.x, q.y, q.z - 0.02])); }
  if (sp.frogEyes) for (const s of [-1, 1]) { const q = S.at(s * eu, 0.55, -0.02); shell.push(ell(0.095, 0.09, 0.09, fur, [q.x, q.y + 0.085, q.z - 0.03])); } // eye bulbs on top of the wide flat head
  R.add(head, merge(shell), 'headMesh');
  R.add(head, merge(parts), 'faceDetails', { outline: false });

  // eyes (separate groups so they can blink): tall glossy ovals with an ink rim and a big highlight
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.name = 'eye';
    const q = sp.frogEyes ? (() => { const b = S.at(s * eu, 0.55, 0); return new THREE.Vector3(b.x, b.y + 0.1, b.z + 0.045); })() : S.at(s * eu, ev, -0.006);
    eg.position.copy(q);
    eg.rotation.y = s * (sp.frogEyes ? 0.3 : Math.asin(clamp(eu, 0, 0.9)) * 0.95);
    eg.rotation.x = -0.18;
    const big = spec.eyeSize || (sp.human ? 1.25 : 1.2);
    const W = 0.045 * big, H = 0.062 * big;
    const ep = [];
    if (sp.human || spec.eyeWhite) ep.push(ell(W * 1.02, H * 1.0, 0.018, '#ffffff', [0, 0, -0.001]));
    ep.push(ell(W * (sp.human ? 0.86 : 1), H * (sp.human ? 0.9 : 1), 0.02, spec.iris || eyeC, [0, -0.004, 0.002]));
    if (spec.iris) ep.push(ell(W * 0.56, H * 0.62, 0.02, '#1a0e0a', [0, 0.002, 0.008]));
    ep.push(ell(W * 0.46, W * 0.46, 0.012, '#ffffff', [-s * W * 0.25 - 0.006, H * 0.38, 0.02]));
    ep.push(ell(W * 0.2, W * 0.2, 0.008, '#ffffff', [s * W * 0.35, -H * 0.4, 0.018]));
    if (sp.human) ep.push(curve([[-1.05, 0.5], [-0.6, 0.9], [0, 1.06], [0.6, 0.9], [1.05, 0.5]].map(([x, y]) => [x * W, y * H, 0.014]), 0.0065, '#2a1418')); // soft lid line
    const m = new THREE.Mesh(merge(ep), R.mat); m.castShadow = false;
    eg.add(m); head.add(eg); eyes.push(eg);
  }
  R.parts.eyes = eyes;
  // brows (tiny, expressive)
  const brows = [];
  if (spec.brows || sp.human) for (const s of [-1, 1]) {
    const bv = sp.frogEyes ? 0.9 : ev + (sp.human ? 0.36 : 0.3);
    const pts = [-0.12, -0.04, 0.04, 0.12].map(du => { const u = s * (eu + du), q = S.at(u, bv + 0.03 * (1 - (du / 0.12) ** 2) - du * 0.45, 0.006); return [q.x, q.y, q.z]; });
    const b = new THREE.Mesh(curve(pts, 0.006, sp.human ? (spec.hair?.color || '#5a3020') : INK), R.mat);
    head.add(b); brows.push(b);
  }
  R.parts.brows = brows;
  // open mouth (bark / talk) — toggled by the animator
  const mq = sp.snout ? S.at(0, sp.snout[3] - sp.snout[2] * 0.55, 0.004) : S.at(0, sp.human ? -0.5 : -0.4, 0.004);
  const mouth = new THREE.Mesh(merge([ell(0.04, 0.03, 0.018, '#8a2a3a', [0, 0, 0]), ell(0.027, 0.014, 0.011, '#ff7a90', [0, -0.011, 0.009])]), R.mat);
  mouth.position.copy(mq); mouth.scale.set(1, 0.01, 1); mouth.visible = false;
  head.add(mouth); R.parts.mouth = mouth;

  buildEars(R, head, spec.earKind === 'spaniel' ? 'floppy' : sp.ears, spec, fur, fur2, fur3, S); // classic: long spaniel ears → floppy
  if (spec.hair) buildHair(R, head, spec.hair, sp);
  return { at: S.at, top: RH * sp.head[1] * 0.93 };
}

function buildEars(R, head, kind, spec, fur, fur2, fur3, S) {
  const earC = spec.earColor || fur3;
  const inner = spec.earInner || '#ffb0b8';
  const mk = (s) => { const g = new THREE.Group(); g.name = s > 0 ? 'earL' : 'earR'; head.add(g); R.parts[g.name] = g; return g; };
  const seat = (g, s, u, v) => { const q = S ? S.at(s * u, v, -0.02) : V(s * 0.2 * u, 0.2 * v, 0); g.position.copy(q); };
  for (const s of [1, -1]) {
    if (kind === 'none' || kind === 'human') continue;
    const g = mk(s);
    if (kind === 'rose') { // Chewy: semi-erect ear whose top third folds forward (his photo + the concept art)
      seat(g, s, 0.62, 0.64); g.rotation.set(-0.08, 0, -s * 0.5);
      R.add(g, merge([cone(0.16, 0.2, earC, [0, 0.09, 0], [0, 0, 0], 16, 1, 0.28), cone(0.1, 0.15, spec.earInner || '#5a2a1a', [0, 0.08, 0.02], [0, 0, 0], 12, 1, 0.16)]), 'earBase');
      const tip = new THREE.Group(); tip.name = 'earTip'; tip.position.set(0, 0.15, 0.015); tip.rotation.set(2.2, 0, -s * 0.25); g.add(tip);
      R.add(tip, merge([cone(0.12, 0.15, C(earC).multiplyScalar(0.88).getStyle(), [0, 0.07, 0], [0, 0, 0], 16, 1, 0.28)]), 'earTip');
      g.userData.tip = tip;
    } else if (kind === 'floppy') {
      seat(g, s, 0.8, 0.45); g.rotation.z = s * 0.35;
      R.add(g, xf(ell(0.075, 0.16, 0.035, earC), { p: [0, -0.12, 0] }), 'ear');
    } else if (kind === 'bat') {
      if (S) { seat(g, s, 0.5, 0.62); g.position.z -= 0.01; } else g.position.set(s * 0.12, 0.085, -0.02); // base seated in the skull
      g.rotation.set(-0.15, 0, -s * 0.38);
      const k = S ? 0.8 : 1;
      R.add(g, merge([cone(0.1 * k, 0.26 * k, earC, [0, 0.13 * k, 0], [0, 0, 0], 14, 1, 0.42), cone(0.062 * k, 0.18 * k, inner, [0, 0.1 * k, 0.028 * k], [0, 0, 0], 12, 1, 0.26)]), 'ear');
    } else if (kind === 'cat' || kind === 'fox' || kind === 'tanuki') {
      const big = kind === 'fox' ? 1.45 : kind === 'tanuki' ? 0.9 : 1.1;
      seat(g, s, kind === 'fox' ? 0.5 : 0.52, 0.76); g.rotation.set(-0.08, 0, -s * (kind === 'fox' ? 0.3 : 0.36));
      R.add(g, merge([cone(0.075 * big, 0.16 * big, earC, [0, 0.07 * big, 0], [0, 0, 0], 12, 1, 0.42), cone(0.045 * big, 0.11 * big, kind === 'fox' ? '#fff4e8' : inner, [0, 0.06 * big, 0.022], [0, 0, 0], 10, 1, 0.22)]), 'ear');
    } else if (kind === 'bunny') {
      seat(g, s, 0.3, 0.9); g.rotation.set(-0.15, 0, -s * 0.16);
      R.add(g, merge([xf(cap(0.052, 0.27, earC, [0, 0.17, 0], [0, 0, 0], shade(0.1)), { s: [1, 1, 0.55] }), ell(0.028, 0.14, 0.012, inner, [0, 0.17, 0.024])]), 'ear');
      g.userData.soft = true;
    } else if (kind === 'bear') {
      seat(g, s, 0.66, 0.68); g.rotation.z = -s * 0.3;
      R.add(g, merge([ell(0.07, 0.065, 0.032, spec.species === 'panda' ? '#2a2630' : earC, [0, 0.03, 0]), ell(0.038, 0.036, 0.012, spec.species === 'panda' ? '#4a4450' : inner, [0, 0.03, 0.024])]), 'ear');
    }
  }
}

function buildTail(R, body, kind, fur, fur2, spec) {
  const g = new THREE.Group(); g.name = 'tail'; g.position.set(0, 0.08, -0.14); body.add(g); R.parts.tail = g;
  if (kind === 'dog' && spec.patterns?.tailFluff) { // big bushy plume that curls up, lighter tip
    g.rotation.x = -0.75;
    R.add(g, merge([ell(0.05, 0.09, 0.05, fur, [0, 0.06, 0]), ell(0.085, 0.13, 0.075, fur, [0, 0.18, 0.03], [0.35, 0, 0]), ell(0.075, 0.11, 0.068, fur2, [0, 0.31, 0.09], [0.6, 0, 0]), cone(0.05, 0.09, fur2, [0, 0.4, 0.15], [0.8, 0, 0], 10, 1, 0.8)]), 'tailMesh');
  } else if (kind === 'dog') {
    g.rotation.x = -0.9;
    R.add(g, merge([cap(0.042, 0.1, fur, [0, 0.06, 0]), cap(0.036, 0.08, fur, [0, 0.16, 0.025], [0.35, 0, 0]), ell(0.045, 0.06, 0.045, spec.patterns?.tailTip ? '#fffaf2' : fur, [0, 0.23, 0.05])]), 'tailMesh');
  } else if (kind === 'cat' && R.disney) {
    g.rotation.x = -0.35;
    const pts = [[0, 0, 0, 0.032], [0, 0.02, -0.07, 0.033], [0.01, 0.1, -0.12, 0.032], [0.03, 0.2, -0.11, 0.03], [0.05, 0.28, -0.06, 0.027], [0.07, 0.3, -0.02, 0.02]];
    const t = tube(pts.map(([x, y, z, r]) => ({ p: V(x, y, z), r })), 10, true);
    R.add(g, paint(t, (p, n, o) => o.set(p.y > 0.24 && spec.patterns?.tailTip ? '#fffaf2' : fur)), 'tailMesh', { fur: 1 });
  } else if (kind === 'cat') {
    g.rotation.x = -1.15;
    R.add(g, curve([[0, 0, 0], [0, 0.13, -0.02], [0, 0.26, 0.04], [0.06, 0.35, 0.1], [0.1, 0.38, 0.06]], 0.03, fur), 'tailMesh');
  } else if (kind === 'fox' || kind === 'tanuki') { // Pokémon-sized brush tail
    g.rotation.x = -0.95;
    const tipC = kind === 'fox' ? '#fffaf2' : '#3a3030';
    const parts = [ell(0.07, 0.1, 0.07, fur, [0, 0.07, 0]), ell(0.11, 0.17, 0.1, fur, [0, 0.21, 0.03], [0.2, 0, 0]), ell(0.085, 0.09, 0.08, tipC, [0, 0.37, 0.07], [0.35, 0, 0]), cone(0.055, 0.08, tipC, [0, 0.45, 0.1], [0.4, 0, 0], 10, 1, 0.8)];
    if (kind === 'tanuki') parts.push(xf(torus(0.1, 0.014, '#3a3030', [0, 0.2, 0.03]), { r: [0.2, 0, 0] }));
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

function buildHair(R, head, hair, sp = SPECIES.human) {
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
  for (let i = 0; i < 6; i++) { const x = -0.16 + i * 0.064; parts.push(curl([x, 0.21 - Math.abs(x) * 0.3, 0.235 - Math.abs(x) * 0.25], 0.058)); }
  // curls falling to the shoulders
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) parts.push(curl([s * (0.25 + (k % 2) * 0.03), -0.06 - k * 0.07, -0.12 - k * 0.03], 0.07 - k * 0.006));
  for (let k = 0; k < 5; k++) parts.push(curl([-0.16 + k * 0.08, -0.14 - (k % 2) * 0.05, -0.2], 0.075));
  const k = RH / 0.3;
  R.add(head, xf(merge(parts), { s: [sp.head[0] * k, sp.head[1] * k, sp.head[2] * k] }), 'hair');
}

// ------------------------------------------------------------------ Shadow: quadruped Boston terrier
// Pokémon-style little Boston: sculpted head with a short, wide snout, white blaze and muzzle, big glossy eyes,
// tall bat ears; a trim barrel body on slightly longer legs.
const BOSTON = { head: [1.08, 0.96, 0.96], cheek: 0.12, snout: [0.3, 0.4, 0.3, -0.3], nose: [0.05, 0.034, 0.034], eye: [0.44, 0.08] };
// Disney-style Shadow: the sculpted Boston head (bat ears, short wide muzzle, white blaze and muzzle, big round eyes
// with lids, a hinged jaw), a barrel body with a white chest, a collar and tag, and paws with toes. Same bones as the
// classic quadruped (the Animator's poseQuad and the sit pose depend on them).
function makeDisneyBoston(spec = {}) {
  const R = new Rig({ name: 'Shadow', ...spec }, true);
  const black = spec.fur || '#34303f', white = '#fbf6f0', collar = spec.collar || '#4aa8f0';
  if (!spec.fur) R.mat.userData.u.uRimStr.value = 1.1; // slate rim keeps the little black dog readable at night
  const sp = { human: false }, cols = speciesColors({ fur: black, fur2: white, earColor: black, earInner: '#f0a0a8', blush: 'none' }, sp);
  const body = R.group(R.root, 'body', [0, 0.3, 0]);
  const bg = new THREE.CapsuleGeometry(0.11, 0.23, 10, 24, 8); bg.rotateX(Math.PI / 2); bg.scale(0.88, 1.06, 1); // trim, deep-chested
  paintFn(bg, (x, y, z, nx, ny, nz, o) => {
    o.set(black);
    const chest = smooth(0.06, 0.12, z) * smooth(0.08, 0.02, y), belly = smooth(-0.45, -0.75, ny) * smooth(-0.1, -0.04, z);
    o.lerp(C(white), Math.max(chest, belly));
    o.multiplyScalar(1 - 0.08 * clamp(0.4 - ny));
    return 1;
  });
  const band = new THREE.TorusGeometry(0.092, 0.017, 10, 36); band.rotateX(Math.PI / 2 - 0.9); band.scale(0.95, 1, 1); band.translate(0, 0.07, 0.16);
  const tag = new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16).rotateX(Math.PI / 2).translate(0, -0.02, 0.246);
  R.add(body, kitGeo(mergeIndexed([bg, tinted(band, collar), tinted(tag, '#ffd24a')])), 'torso');
  // head
  const head = R.group(body, 'head', [0, 0.16, 0.2]);
  const Hd = buildDisneyHead(head, { ...spec, species: 'boston', fur: black, fur2: white, nose: '#141018', blush: 'none' }, sp, cols, 'boston');
  for (const [parent, g, name, skin] of Hd.geos) { const m = R.add(parent, kitGeo(g), name); if (skin) R.skinData.set(m, skin); }
  Object.assign(R.parts, Hd.parts); R.parts.eyes = []; R.parts.brows = [];
  // legs with white socks and toed paws
  const legs = [];
  for (const [x, z, n] of [[0.078, 0.13, 'legFL'], [-0.078, 0.13, 'legFR'], [0.078, -0.13, 'legBL'], [-0.078, -0.13, 'legBR']]) {
    const g = R.group(R.root, n, [x, 0.27, z]);
    const leg = new THREE.CapsuleGeometry(0.034, 0.18, 6, 16, 4).translate(0, -0.12, 0).scale(1, 1, 0.9); // reaches into the paw
    const paw = disneyFoot('paw', white, 1, '#3a2a30').scale(0.7, 0.7, 0.62).translate(0, -0.27, -0.012);
    R.add(g, kitGeo(mergeIndexed([tinted(leg, black, 1), paw])), 'leg');
    legs.push(g);
  }
  R.parts.legs = legs;
  const tail = R.group(body, 'tail', [0, 0.06, -0.23]);
  R.add(tail, kitGeo(tinted(new THREE.ConeGeometry(0.03, 0.09, 12, 2).translate(0, 0.04, 0).rotateX(-0.6), black, 1)), 'tailMesh');
  R.quadruped = true; R.height = 0.62; R.earGain = 1.6;
  return R.bake();
}
export function buildBoston(spec = {}, raw = false) {
  if (!raw && kitStyle() === 'disney') return makeDisneyBoston(spec);
  const R = new Rig({ name: 'Shadow', ...spec }, false);
  const black = spec.fur || '#34303f', white = '#fbf6f0', collar = spec.collar || '#4aa8f0';
  if (!spec.fur) R.mat.userData.u.uRimStr.value = 1.25; // slate rim keeps the little black dog readable at night
  const body = R.group(R.root, 'body', [0, 0.3, 0]);
  // barrel body (a touch slimmer and deeper-chested), white chest and belly
  const bg = new THREE.CapsuleGeometry(0.122, 0.22, 8 * DETAIL, 18 * DETAIL, DETAIL > 1 ? 10 * DETAIL : 1); bg.rotateX(Math.PI / 2); bg.scale(0.92, 1.04, 1);
  paint(bg, (p, n, o) => { o.set(black); if (p.z > 0.1 && p.y < 0.06) o.set(white); if (n.y < -0.6 && p.z > -0.06) o.set(white); o.multiplyScalar(1 - 0.08 * clamp(0.4 - n.y)); });
  R.add(body, merge([bg, xf(torus(0.092, 0.02, collar, [0, 0.07, 0.16], [Math.PI / 2 - 0.9, 0, 0]), { s: [0.95, 1, 1] }), ell(0.026, 0.032, 0.012, '#ffd24a', [0, -0.018, 0.245])]), 'torso');
  const head = R.group(body, 'head', [0, 0.16, 0.2]);
  const rh = 0.155, S = sculptor(BOSTON, rh);
  let hg = new THREE.SphereGeometry(1, 40 * headDetail(), 28 * headDetail());
  hg.deleteAttribute('uv'); hg.deleteAttribute('normal');
  hg = mergeVertices(hg, 1e-4);
  const pa = hg.attributes.position, mk = new Float32Array(pa.count);
  for (let i = 0; i < pa.count; i++) { const [x, y, z, m] = S.deform(pa.getX(i), pa.getY(i), pa.getZ(i)); pa.setXYZ(i, x, y, z); mk[i] = m; }
  hg.computeVertexNormals();
  const col = new Float32Array(pa.count * 3), c = new THREE.Color(), nrm = hg.attributes.normal;
  for (let i = 0; i < pa.count; i++) {
    const u = pa.getX(i) / (rh * BOSTON.head[0]), v = pa.getY(i) / (rh * BOSTON.head[1]), w = pa.getZ(i) / (rh * BOSTON.head[2]);
    c.set(black);
    if (w > 0.15 && Math.abs(u) < 0.1 + Math.max(0, 0.55 - v) * 0.12) c.set(white);   // blaze down the middle
    if (mk[i] > 0.28) c.set(white);                                                  // white muzzle
    c.multiplyScalar(1 - 0.08 * clamp(0.4 - nrm.getY(i)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  R.add(head, hg, 'headMesh');
  const [, , sh, cv] = BOSTON.snout;
  const tip = S.at(0, cv + sh * 0.3, 0.004), det = [];
  det.push(xf(ell(0.034, 0.024, 0.024, '#141018'), { p: [tip.x, tip.y, tip.z - 0.008], r: [0.25, 0, 0] }), ell(0.011, 0.006, 0.006, '#ffffff', [-0.012, tip.y + 0.012, tip.z + 0.012]));
  const mv = cv - sh * 0.45, mp = [-0.16, -0.08, 0, 0.08, 0.16].map((u, i) => { const q = S.at(u, mv + (i % 4 === 0 ? 0.06 : i === 2 ? 0.015 : -0.02), 0.004); return [q.x, q.y, q.z]; });
  det.push(curve(mp.slice(0, 3), 0.0045, INK), curve(mp.slice(2), 0.0045, INK));
  for (const sgn of [-1, 1]) { const q = S.at(sgn * 0.62, -0.2, 0.002); det.push(xf(ell(0.03, 0.018, 0.01, '#ff9ab0'), { p: [q.x, q.y, q.z], r: [0, sgn * 0.75, 0] })); }
  R.add(head, merge(det), 'faceDetails', { outline: false });
  const eyes = [];
  for (const sgn of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.copy(S.at(sgn * BOSTON.eye[0], BOSTON.eye[1], -0.004)); eg.rotation.set(-0.18, sgn * 0.5, 0);
    const W = 0.036, H = 0.046;
    // warm brown iris + pupil so the eyes still read against the black fur
    const m = new THREE.Mesh(merge([ell(W, H, 0.016, '#7a4a30'), ell(W * 0.6, H * 0.64, 0.016, '#140c0a', [0, 0.002, 0.006]), ell(W * 0.46, W * 0.46, 0.01, '#ffffff', [-sgn * W * 0.25 - 0.004, H * 0.38, 0.014]), ell(W * 0.2, W * 0.2, 0.007, '#ffffff', [sgn * W * 0.35, -H * 0.4, 0.013])]), R.mat);
    eg.add(m); head.add(eg); eyes.push(eg);
  }
  R.parts.eyes = eyes;
  const mouth = new THREE.Mesh(merge([ell(0.03, 0.022, 0.013, '#8a2a3a'), ell(0.019, 0.01, 0.009, '#ff7a90', [0, -0.007, 0.007])]), R.mat);
  mouth.position.copy(S.at(0, cv - sh * 0.6, 0.004)); mouth.scale.set(1, 0.01, 1); mouth.visible = false; head.add(mouth); R.parts.mouth = mouth;
  R.parts.brows = [];
  buildEars(R, head, 'bat', { earColor: black, earInner: '#f0a0a8' }, black, white, black, S);
  // legs: a little longer and slimmer, white socks
  const legs = [];
  for (const [x, z, n] of [[0.078, 0.13, 'legFL'], [-0.078, 0.13, 'legFR'], [0.078, -0.13, 'legBL'], [-0.078, -0.13, 'legBR']]) {
    const g = R.group(R.root, n, [x, 0.27, z]);
    R.add(g, merge([xf(cap(0.04, 0.15, black, [0, -0.1, 0]), { s: [1, 1, 0.9] }), ell(0.047, 0.036, 0.062, white, [0, -0.238, 0.02])]), 'leg');
    legs.push(g);
  }
  R.parts.legs = legs;
  const tail = R.group(body, 'tail', [0, 0.06, -0.23]);
  R.add(tail, xf(cone(0.03, 0.09, black, [0, 0.04, 0], [0, 0, 0], 10), { r: [-0.6, 0, 0] }), 'tailMesh');
  R.quadruped = true;
  R.height = 0.62;
  return raw ? R : applyRefined(R) ? R : R.bake();
}

// X-ray silhouette: when a character is hidden behind scenery, draw a soft coloured silhouette through it.
// The character writes stencil=1 where it is visible and occluding scenery writes 2 (materials.js markOccluder); the
// x-ray pass draws only where depth is GREATER and stencil == 2, so it never tints the character's own body and never
// fires for grass, terrain or small props.
export function enableXray(rig, color = '#ffd9a0', opacity = 0.55) {
  for (const m of [rig.mat, rig.outMat]) {
    m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.AlwaysStencilFunc;
    m.stencilZPass = THREE.ReplaceStencilOp; m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp;
  }
  const xm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false, toneMapped: false });
  // a soft fresnel silhouette (bright rim, faint fill) rather than a flat pale blob
  xm.onBeforeCompile = sh => {
    const V = `#include <project_vertex>
      #ifdef USE_SKINNING
        vXN = normalize(normalMatrix * objectNormal);
      #else
        vXN = normalize(normalMatrix * normal);
      #endif
      vXV = -mvPosition.xyz;`;
    const F = `float rimX = 1.0 - abs(dot(normalize(vXN), normalize(vXV)));
      diffuseColor.a *= 0.22 + 0.9 * rimX * rimX;
      outgoingLight = mix(outgoingLight, vec3(1.0), rimX * rimX * 0.35);
      #include <opaque_fragment>`;
    const P = `#include <common>
      varying vec3 vXN; varying vec3 vXV;`;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', P).replace('#include <project_vertex>', V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', P).replace('#include <opaque_fragment>', F);
  };
  xm.customProgramCacheKey = () => 'xray-fresnel';
  xm.stencilWrite = true; xm.stencilRef = STENCIL_OCCLUDER; xm.stencilFunc = THREE.EqualStencilFunc;
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
let shadowTex = null; // one soft blob texture shared by every actor (was a new canvas + upload per actor)
export function contactShadow(r = 0.34) {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(40,20,60,0.45)'); grd.addColorStop(1, 'rgba(40,20,60,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

// ------------------------------------------------------------------ the cast
export const CAST = {
  chewy: {
    name: 'Chewy', species: 'dog', fur: '#83482c', fur2: '#a8683f', fur3: '#6e3a22', earColor: '#6a361f', earInner: '#4a2418',
    nose: '#4e2620', iris: '#d8962e', eye: '#d8962e', muzzleColor: '#a86a44', blush: '#ff9a9a', muzzleScale: 1.0,
    patterns: { chestBlaze: true, chin: '#fbf1e4', tailFluff: true }, brows: false,
    outfit: { top: 'gi', topColor: '#2c3a6a', bottomColor: '#35303f', scarf: '#e0443a', sash: '#e0443a', wraps: '#f4ece0' },
  },
  rosie: {
    name: 'Rosie', species: 'human', skin: '#ffe4d2', iris: '#7a4424', eye: '#7a4424', blush: '#ff9ab0', eyeWhite: true,
    hair: { style: 'curly', color: '#6b3a22', color2: '#8e5634' },
    outfit: { top: 'dress', topColor: '#ff8fb0', topColor2: '#ffffff', socks: '#ffffff', shoes: '#d8443a', bow: '#e8364a' },
  },
  // Moka, the Boykin Spaniel mage (docs/HEROES.md): the procedural fallback; the baked film model is heroModels.js
  moka: {
    name: 'Moka', species: 'dog', earKind: 'spaniel', voice: 1.1, fur: '#7a4a34', fur2: '#8c5a40', fur3: '#603a26', earColor: '#7e4e34', earInner: '#48261a', tail: 'stub',
    nose: '#4a2418', iris: '#e8a93a', eye: '#e8a93a', muzzleColor: '#906048', blush: '#ff9aa6', muzzleScale: 0.94,
    patterns: {}, brows: false,
    outfit: { top: 'kimono', topColor: '#b8a4e8', topColor2: '#f4c04a', bottomColor: '#7a68b0', sash: '#8a6ad8', scarf: '#4fc4b4', hat: 'wizard', hatColor: '#3fb0a0' },
  },
};

// characters with a Blender-refined skin in public/rigs (tools/blender/build.mjs exports exactly these specs)
export const REFINED_CAST = { chewy: CAST.chewy, shadow: { name: 'Shadow' } };
