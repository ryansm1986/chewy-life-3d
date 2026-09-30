// Blender-refined character skins (pipeline in tools/blender/README.md).
// A refined rig keeps the procedural skeleton (the part groups the Animator drives) but swaps the merged primitive
// parts for one Blender-remeshed, UV-unwrapped skin with a baked colour + AO texture and smooth weights where the
// fused parts meet (ears into the head, hands into the arms, feet into the legs, tail and scarf into the body).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ export (dev page /?test=rigexport)
// Every toon part mesh of an unbaked rig, in root space, tagged with its bone: the index of the part's group in
// root.traverse() order (the mouth is its own bone, as in Rig.bake).
export function exportRawRig(R) {
  const root = R.root; root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert(), m4 = new THREE.Matrix4();
  const objs = []; root.traverse(o => objs.push(o));
  const mouth = R.parts.mouth, parts = [];
  for (const m of objs) {
    if (!m.isMesh || m.material !== R.mat || !(m.visible || m === mouth)) continue;
    const g = mergeVertices(m.geometry.clone().applyMatrix4(m4.multiplyMatrices(rootInv, m.matrixWorld)), 1e-6);
    const pos = g.attributes.position, n = pos.count;
    const col = g.attributes.color, nrm = g.attributes.normal;
    parts.push({
      name: m.name || m.parent.name, bone: objs.indexOf(m === mouth ? m : m.parent), outline: !!m.userData.outline, mouth: m === mouth,
      pos: Array.from(pos.array, v => +v.toFixed(6)),
      nrm: Array.from(nrm.array, v => +v.toFixed(4)),
      col: col ? Array.from({ length: n * 3 }, (_, i) => +col.getComponent(i / 3 | 0, i % 3).toFixed(4)) : null,
      idx: g.index ? Array.from(g.index.array) : null,
    });
  }
  return {
    name: R.spec.name, spec: specKey(R.spec), signature: rigSignature(R),
    bones: objs.map(o => ({ name: o.name, type: o.type, parent: objs.indexOf(o.parent), world: Array.from(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld).elements) })),
    parts,
  };
}

// identity of a spec (a recoloured Shadow or a re-dressed villager must not pick up another rig's skin)
export function specKey(spec) {
  const s = JSON.stringify(spec, Object.keys(flatKeys(spec)).sort());
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function flatKeys(o, acc = {}) { if (o && typeof o === 'object') for (const k in o) { acc[k] = 1; flatKeys(o[k], acc); } return acc; }
// structure check: the skin's bone indices are only valid for the same part hierarchy
export function rigSignature(R) {
  const names = []; R.root.traverse(o => names.push((o.isMesh ? 'm:' : 'g:') + o.name));
  return specKey({ n: names.join('|') });
}

// ------------------------------------------------------------------ runtime
const CACHE = new Map(); // spec key -> { meta, buf, tex, geo, olGeo }
const warned = new Set();
const BASE = import.meta.env?.BASE_URL ?? '/';

// Fetch the refined skins once at boot ({ file name: spec it was exported from }, see REFINED_CAST in charKit.js).
// A missing file or one exported from a different spec just leaves that character procedural (with a warning).
export function loadRefinedRigs(specs) {
  const P = new URLSearchParams(location.search);
  if (P.has('procrigs')) return Promise.resolve();
  const dir = `${BASE}${P.get('rigdir') || 'rigs'}/`; // &rigdir=… (dev): compare against another pipeline output
  return Promise.all(Object.entries(specs).map(async ([n, spec]) => {
    try {
      const meta = await (await fetch(`${dir}${n}.json`)).json();
      if (meta.spec !== specKey(spec)) { console.warn(`[rigs] refined skin ${n} was exported from a different spec: re-run node tools/blender/build.mjs ${n}`); return; }
      const [buf, tex] = await Promise.all([
        fetch(`${dir}${meta.bin}`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
        new THREE.TextureLoader().loadAsync(`${dir}${meta.tex}`),
      ]);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      CACHE.set(meta.spec, { meta, buf, tex });
    } catch (e) { console.warn('[rigs] no refined skin for', n, e.message); }
  }));
}

const TYPES = { f4: Float32Array, i2: Int16Array, u1: Uint8Array, u2: Uint16Array, u4: Uint32Array };
function geometryOf(E) {
  if (E.geo) return E;
  const g = new THREE.BufferGeometry();
  for (const L of E.meta.layout) {
    const a = new TYPES[L.type](E.buf, L.offset, L.count);
    if (L.name === 'index') g.setIndex(new THREE.BufferAttribute(a, 1));
    else g.setAttribute(L.name, new THREE.BufferAttribute(a, L.itemSize, L.normalized));
  }
  g.computeBoundingSphere();
  // the ink hull covers the fused surfaces only (they come first in the index), like Rig.bake's outlined parts
  const ol = new THREE.BufferGeometry();
  for (const k in g.attributes) ol.setAttribute(k, g.attributes[k]);
  ol.setIndex(g.index); ol.setDrawRange(0, E.meta.shellIndexCount); ol.boundingSphere = g.boundingSphere;
  E.geo = g; E.olGeo = ol;
  return E;
}

// The skin samples its atlas through its own `skinUv` attribute. skinUv = -1 means "no atlas, vertex colour only":
// the pass-through parts (eyes, nose, mouth) carry it, and props that share rig.mat (swords, tools, nightcaps,
// instanced tails) have no such attribute and read it as the default, so they keep their colours without any change
// at their call sites.
export function patchSkinMaterial(mat, tex) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.defaultAttributeValues = { skinUv: [-1, -1] };
  mat.customProgramCacheKey = () => key + '|skinUv';
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.skinMap = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 skinUv; varying vec2 vSkinUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vSkinUv = skinUv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D skinMap; varying vec2 vSkinUv;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 skinTex = texture2D(skinMap, vSkinUv).rgb; // sampled unconditionally (derivatives stay defined)
        diffuseColor.rgb *= vSkinUv.x < -0.5 ? vec3(1.0) : skinTex;`);
  };
}

// Rig.bake() for a character with a refined skin: same skeleton (the part groups), same mouth bone, one skinned body
// + one outline, but the geometry and texture come from Blender. Returns false (caller bakes procedurally) when there
// is no skin for this exact spec or the part hierarchy changed since it was exported.
export function applyRefined(R) {
  const E = CACHE.get(specKey(R.spec));
  if (!E) return false;
  if (E.meta.signature !== rigSignature(R)) {
    if (!warned.has(E)) { warned.add(E); console.warn(`[rigs] refined skin for ${R.spec.name} is stale (part hierarchy changed): re-run tools/blender`); }
    return false;
  }
  const { geo, olGeo, tex, meta } = geometryOf(E);
  const root = R.root; root.updateMatrixWorld(true);
  const objs = []; root.traverse(o => objs.push(o));
  const mouth = R.parts.mouth;
  let mb = null;
  if (mouth?.isMesh) {
    mb = new THREE.Object3D(); mb.name = 'mouthBone';
    mb.position.copy(mouth.position); mb.rotation.copy(mouth.rotation); mb.scale.copy(mouth.scale);
    mouth.parent.add(mb); mb.updateMatrixWorld(true); R.parts.mouth = mb;
  }
  const bones = meta.bones.map(i => (objs[i] === mouth ? mb : objs[i]));
  for (const m of objs) if (m.isMesh && m.material === R.mat && (m.visible || m === mouth)) { m.userData.outline?.parent?.remove(m.userData.outline); m.parent?.remove(m); }
  const skeleton = new THREE.Skeleton(bones);
  const mk = (g, mat, name) => {
    const sm = new THREE.SkinnedMesh(g, mat); sm.name = name;
    root.add(sm); root.updateMatrixWorld(true);
    sm.bind(skeleton, sm.matrixWorld);
    sm.boundingSphere = g.boundingSphere.clone(); sm.boundingSphere.radius *= 1.4;
    return sm;
  };
  patchSkinMaterial(R.mat, tex); R.skinTex = tex;
  const body = mk(geo, R.mat, 'body_skin'); body.castShadow = true; body.receiveShadow = true;
  const ol = mk(olGeo, R.outMat, 'outline_skin'); ol.castShadow = false;
  R.meshes = [body]; R.skeleton = skeleton; R.skin = body; R.outline = ol;
  R.sharedGeo = true; R.refined = true;
  return true;
}
