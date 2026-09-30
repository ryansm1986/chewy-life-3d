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

const loader = new GLTFLoader();
const cache = new Map(); // url -> Promise<template>

function toonOf(m, geo) {
  const glowy = /glow/i.test(m.name || '');
  if (glowy) return makeGlow({ map: m.map || null, color: m.emissive?.getHex?.() ? m.emissive : m.color, opacity: m.opacity ?? 1 });
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
    resolve(root);
  }, undefined, reject));
  cache.set(url, p);
  return p;
}

/** a placeable copy of a loaded template (shares geometry / materials); outline: ink shell like the monsters */
export function glbInstance(tpl, { outline = false, outlineColor = '#3a2230', outlineWidth = 0.02 } = {}) {
  const obj = tpl.clone(true);
  if (outline) {
    const ink = tpl.userData.glbInk || (tpl.userData.glbInk = makeOutline(outlineColor, outlineWidth));
    const meshes = []; obj.traverse(o => { if (o.isMesh && !o.userData.isInk) meshes.push(o); });
    for (const m of meshes) { const s = new THREE.Mesh(m.geometry, ink); s.userData.isInk = true; s.castShadow = false; m.add(s); }
  }
  return obj;
}

/** free a cached asset's GPU resources (only when nothing uses it any more) */
export async function disposeGlb(url) {
  const p = cache.get(url); if (!p) return;
  cache.delete(url);
  const tpl = await p;
  tpl.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const m of tpl.userData.glb.materials) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
  tpl.userData.glbInk?.dispose();
}
