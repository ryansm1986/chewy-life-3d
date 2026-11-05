// Blender trees (ROADMAP Z-D6 "Blender everything": the owner picked trees 2026-11-04; tools/blender/work/codex/trees-*).
// A tree builder (vegetation.js buildTree / buildBamboo, the region flora's maple / ginkgo / persimmon / chestnut /
// snowFir / snowPine / birch / coastPine / stand) asks treeGlb(key, seed) for its Blender variant: the GLB
// /models/tree-<key>-v<k>.glb (k = seed % n) as the kit's own parts, keyed by material name with '_' for ':' (bark,
// foliage, cards_sakura → 'cards:sakura', culmLeaf, d_body → 'd:body'). Cards keep the game's atlas UVs (the kit layout:
// clusters C1 / C2, sprays S1 / S2), so the leaf-card look the owner tuned stays; the masses stay shadow-only. Not loaded:
// null, and the kit builds the tree.
import * as THREE from 'three';
import { loadGlb } from '../gfx/glbAssets.js';
import { merge } from '../gfx/geom.js';

export const TREE_GLB = { // key → n variants (tools/blender/work/codex/trees-<village|maple|snow|bamboo>)
  'village-sakura': 3, 'village-momiji': 3, 'village-pine': 3, 'village-round': 3, 'village-ginkgo': 3,
  'maple-dome': 2, 'maple-weep': 2, persimmon: 2, chestnut: 2, snowFir: 2, birch: 2,
  'stand-grove': 2, 'stand-clump': 2, 'stand-wall': 2, 'stand-young': 2, 'stand-arch': 2,
  'village-bush-hydrangea': 3, 'village-bush-azalea': 3, 'village-bush-box': 3,
  'village-rock': 4,
};
const PARTS = new Map(); // `${key}:v${k}` → { partKey: BufferGeometry }

function toParts(tpl) {
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
    (lists[(o.material?.name || 'body').replace(/_/g, ':')] ||= []).push(g);
  });
  const out = {};
  for (const k in lists) { out[k] = merge(lists[k]); out[k].computeBoundingSphere(); out[k].computeBoundingBox(); out[k].userData.shared = true; }
  return out;
}
export const treeGlbUrls = () => Object.entries(TREE_GLB).flatMap(([key, n]) => Array.from({ length: n }, (_, k) => `/models/tree-${key}-v${k}.glb`));
/** load every listed tree model (awaited at boot, before the village and the regions build their trees) */
export function loadTreeGlbs() {
  return Promise.all(Object.entries(TREE_GLB).flatMap(([key, n]) => Array.from({ length: n }, (_, k) => {
    const url = `/models/tree-${key}-v${k}.glb`;
    return loadGlb(url).then(t => { PARTS.set(`${key}:v${k}`, toParts(t)); }).catch(e => console.warn('[trees] model', url, e));
  })));
}
/** a tree's Blender parts for this seed (fresh geometry, the caller's to keep), or null for the kit */
export function treeGlb(key, seed = 0, { scale = 1 } = {}) {
  const n = TREE_GLB[key]; if (!n) return null;
  const base = PARTS.get(`${key}:v${((seed % n) + n) % n}`); if (!base) return null;
  // (always fresh copies: the kit builders' callers recolour, lean and snow them in place, as they do a fresh kit tree;
  //  not `shared` like the templates, so a region's dispose frees them as it does a kit tree: a copied flag leaked them)
  const out = {};
  for (const k in base) { out[k] = base[k].clone(); delete out[k].userData.shared; if (Math.abs(scale - 1) > 1e-4) out[k].scale(scale, scale, scale); out[k].computeBoundingSphere(); out[k].computeBoundingBox(); }
  // the regions draw a kit tree's masses (bambooKit M 'foliage'); a Blender tree's are rough shadow shapes under its cards, so
  // they go to the shadow-only bucket there (the village's buildTree takes .foliage into its own shadow-only batch)
  if (out.foliage && !key.startsWith('village-')) { out['foliage:shadow'] = out.foliage; delete out.foliage; }
  return out;
}
