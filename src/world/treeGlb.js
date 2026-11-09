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
// Small Blender props with the same parts-by-material contract (ROADMAP Z-D6): /models/prop-<key>.glb. Scavenge nodes
// (scav-<model>-full|taken), crops (crop-<crop>-young|ripe), fish (fish-<id>), the rods, tools and the campfire.
export const PROP_GLB = ['scav-driftwood-full', 'scav-driftwood-taken', 'scav-riverStone-full', 'scav-riverStone-taken', 'scav-petalDrift-full', 'scav-petalDrift-taken', 'scav-mulberry-full', 'scav-mulberry-taken', 'scav-culms-full', 'scav-culms-taken', 'scav-mossRubble-full', 'scav-mossRubble-taken', 'scav-cocoons-full', 'scav-cocoons-taken', 'scav-shoots-full', 'scav-shoots-taken', 'scav-branches-full', 'scav-branches-taken', 'scav-terrace-full', 'scav-terrace-taken', 'scav-mapleLeaves-full', 'scav-mapleLeaves-taken', 'scav-honeyLog-full', 'scav-honeyLog-taken', 'scav-seaDrift-full', 'scav-seaDrift-taken', 'scav-seaStones-full', 'scav-seaStones-taken', 'scav-netScraps-full', 'scav-netScraps-taken', 'scav-seaGlass-full', 'scav-seaGlass-taken', 'scav-seaweed-full', 'scav-seaweed-taken', 'scav-pine-full', 'scav-pine-taken', 'scav-sinter-full', 'scav-sinter-taken', 'scav-iceCrystal-full', 'scav-iceCrystal-taken', 'scav-snowForage-full', 'scav-snowForage-taken', 'crop-turnip-young', 'crop-turnip-ripe', 'crop-carrot-young', 'crop-carrot-ripe', 'crop-cabbage-young', 'crop-cabbage-ripe', 'crop-daikon-young', 'crop-daikon-ripe', 'crop-strawberry-young', 'crop-strawberry-ripe', 'crop-rice-young', 'crop-rice-ripe', 'crop-pumpkin-young', 'crop-pumpkin-ripe', 'crop-melon-young', 'crop-melon-ripe', 'fish-crucian', 'fish-koi', 'fish-goldKoi', 'fish-moonKoi', 'fish-ayu', 'fish-trout', 'fish-char', 'fish-loach', 'fish-rainbowTrout', 'fish-salmon', 'fish-seaBream', 'fish-mackerel', 'fish-flounder', 'fish-octopus', 'fish-pufferfish', 'rod-1', 'rod-2', 'tool-hoe', 'tool-seedBag', 'campfire', 'siege-tent-v0', 'siege-tent-v1', 'siege-tent-v2', 'siege-spikes-v0', 'siege-spikes-v1', 'siege-campfire-v0', 'siege-campfire-v1', 'siege-cage-v0', 'siege-cage-v1']; // the listed keys
const PROPS = new Map(); // key → { partKey: BufferGeometry } (templates, shared: the kits cache and batch them)

function toParts(tpl) {
  const lists = {};
  tpl.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(tpl.matrixWorld).invert(), m = new THREE.Matrix4();
  tpl.traverse(o => {
    if (!o.isMesh || o.userData.isInk) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); // (a BatchedMesh takes one attribute set)
    const c = g.attributes.color, n = g.attributes.position.count, rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { rgb[i * 3] = c ? c.getX(i) : 1; rgb[i * 3 + 1] = c ? c.getY(i) : 1; rgb[i * 3 + 2] = c ? c.getZ(i) : 1; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    (lists[(o.material?.name || 'body').replace(/_/g, ':')] ||= []).push(g);
  });
  const out = {};
  for (const k in lists) { out[k] = merge(lists[k]); out[k].computeBoundingSphere(); out[k].computeBoundingBox(); out[k].userData.shared = true; }
  return out;
}
export const treeGlbUrls = () => [...Object.entries(TREE_GLB).flatMap(([key, n]) => Array.from({ length: n }, (_, k) => `/models/tree-${key}-v${k}.glb`)), ...PROP_GLB.map(k => `/models/prop-${k}.glb`)];
/** load every listed tree model (awaited at boot, before the village and the regions build their trees) */
export function loadTreeGlbs() {
  return Promise.all([...Object.entries(TREE_GLB).flatMap(([key, n]) => Array.from({ length: n }, (_, k) => {
    const url = `/models/tree-${key}-v${k}.glb`;
    return loadGlb(url).then(t => { PARTS.set(`${key}:v${k}`, toParts(t)); }).catch(e => console.warn('[trees] model', url, e));
  })), ...PROP_GLB.map(key => { const url = `/models/prop-${key}.glb`; return loadGlb(url).then(t => { PROPS.set(key, toParts(t)); }).catch(e => console.warn('[props] model', url, e)); })]);
}
/** a prop's Blender parts by material ({ body, leaf, ... }, shared templates), or null for the kit */
export const propParts = key => PROPS.get(key) || null;
/** a prop's Blender model as one geometry (shared, cached), or null for the kit */
export function propGeo(key) {
  const p = PROPS.get(key); if (!p) return null;
  if (!p._one) { const l = Object.values(p).filter(g => g?.isBufferGeometry); Object.defineProperty(p, '_one', { value: l.length === 1 ? l[0] : merge(l), enumerable: false }); p._one.userData.shared = true; }
  return p._one;
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
