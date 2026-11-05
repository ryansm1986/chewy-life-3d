// Blender-made assets (.glb in public/models, from the codex-blender skill) drawn in the game's own style.
// glTF materials are swapped for the game's toon material, so a model sits with the procedural art:
//   base colour + map + vertex colours → makeToon (brush, rim and toon ramp from the shared lighting)
//   emissive → emissive (bloom picks up bright glows); alphaMode MASK → alphaTest; BLEND → transparent
//   material name containing 'glow' → makeGlow (additive, unlit): lantern paper, magic cores
//   `outline: true` adds an ink-outline shell per mesh (makeOutline, like the monsters)
//
//   const tpl = await loadGlb('/models/snow_lantern.glb');   // cached per url
//   const obj = glbInstance(tpl, { outline: true });          // a clone sharing geometry and materials
//   scene.add(obj);
// Geometry and materials are shared between instances and live for the session (the cache owns them);
// disposeGlb(url) frees one asset when it is truly no longer used.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeToon, makeGlow, makeOutline } from './materials.js';
import { merge } from './geom.js';

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<template>
const ready = new Map(); // url -> template, once loaded (glbReady: placed in the same frame, not a promise tick later)

function toonOf(m, geo) {
  const glowy = /glow/i.test(m.name || '');
  if (glowy) { const g = makeGlow({ map: m.map || null, color: m.emissive?.getHex?.() ? m.emissive : m.color, opacity: m.opacity ?? 1 }); g.name = m.name; return g; } // (the name kept: the buildings' window_glow, the furniture / region buckets sort by it)
  const mask = m.alphaTest > 0, blend = m.transparent && !mask;
  const t = makeToon({
    color: m.color, map: m.map || null, vertexColors: !!geo.attributes.color,
    emissive: m.emissive || '#000000', emissiveIntensity: m.emissiveIntensity ?? 1,
    alphaTest: mask ? m.alphaTest : 0, transparent: blend, opacity: m.opacity ?? 1,
    side: m.side ?? THREE.FrontSide, rim: 0.35, brush: 0.12,
  });
  if (m.emissiveMap) { t.emissiveMap = m.emissiveMap; }
  t.name = m.name;
  return t;
}

/** load (once) and convert a .glb → a template Group (don't add the template itself to a scene: use glbInstance) */
export function loadGlb(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => loader.load(url, gltf => {
    const root = gltf.scene, conv = new Map();
    root.traverse(o => {
      if (!o.isMesh) return;
      const one = src => { const k = src.uuid + (o.geometry.attributes.color ? ':vc' : ''); if (!conv.has(k)) conv.set(k, toonOf(src, o.geometry)); return conv.get(k); };
      const old = o.material;
      o.material = Array.isArray(old) ? old.map(one) : one(old);
      (Array.isArray(old) ? old : [old]).forEach(m => m.dispose());
      o.castShadow = true; o.receiveShadow = true;
    });
    root.userData.glb = { url, materials: [...conv.values()], animations: gltf.animations };
    ready.set(url, root);
    resolve(root);
  }, undefined, reject));
  cache.set(url, p);
  return p;
}

/** the template of an already-loaded url, or null (then loadGlb) */
export const glbReady = url => ready.get(url) || null;

/** a placeable copy of a loaded template (shares geometry / materials); outline: ink shell like the monsters */
export function glbInstance(tpl, { outline = false, outlineColor = '#3a2230', outlineWidth = 0.02 } = {}) {
  // (Object3D.clone deep-copies userData through JSON: the template's materials there would serialise their textures to
  //  data URLs on every clone, ~100 ms each; so they step off the template while it clones, and the copy shares them)
  const { glb, glbInk } = tpl.userData;
  delete tpl.userData.glb; delete tpl.userData.glbInk;
  let obj;
  try { obj = tpl.clone(true); } finally { if (glb) tpl.userData.glb = glb; if (glbInk) tpl.userData.glbInk = glbInk; }
  if (glb) obj.userData.glb = glb;
  if (outline) {
    const ink = tpl.userData.glbInk || (tpl.userData.glbInk = makeOutline(outlineColor, outlineWidth));
    const meshes = []; obj.traverse(o => { if (o.isMesh && !o.userData.isInk) meshes.push(o); });
    for (const m of meshes) { const s = new THREE.Mesh(m.geometry, ink); s.userData.isInk = true; s.castShadow = false; m.add(s); }
  }
  return obj;
}

const bucketOf = name => (/^rock/i.test(name) ? 'rock' : /^reed/i.test(name) ? 'reed' : /glow/i.test(name) ? 'glow' : /hot/i.test(name) ? 'hot' : /leaf/i.test(name) ? 'leaf' : /cloth/i.test(name) ? 'cloth' : /water/i.test(name) ? 'water' : /stone/i.test(name) ? 'stone' : 'body');
/** a loaded template → merged geometry per kit material key, laid out like the kit Builder's (non-indexed; position,
 *  normal, uv, rgb colour), keyed by material name (body, glow, hot, leaf, cloth, water, stone): for a model that drops
 *  into a kit template or a region piece instead of standing as its own object (home/extGlb.js, regions/assets/glbPieces.js) */
export function glbBucketGeos(tpl) {
  const lists = {};
  tpl.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert(), m = new THREE.Matrix4();
  tpl.traverse(o => {
    if (!o.isMesh || o.userData.isInk) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    const c = g.attributes.color, n = g.attributes.position.count, rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { rgb[i * 3] = c ? c.getX(i) : 1; rgb[i * 3 + 1] = c ? c.getY(i) : 1; rgb[i * 3 + 2] = c ? c.getZ(i) : 1; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    (lists[bucketOf(o.material?.name || '')] ||= []).push(g);
  });
  const out = {};
  for (const k in lists) { out[k] = merge(lists[k]); out[k].computeBoundingSphere(); out[k].computeBoundingBox(); out[k].userData.shared = true; }
  return out;
}

/** free a cached asset's GPU resources (only when nothing uses it any more) */
export async function disposeGlb(url) {
  const p = cache.get(url); if (!p) return;
  cache.delete(url); ready.delete(url);
  const tpl = await p;
  tpl.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const m of tpl.userData.glb.materials) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
  tpl.userData.glbInk?.dispose();
}
