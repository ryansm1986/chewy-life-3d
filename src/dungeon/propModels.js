// The dungeon floors' Blender props (ROADMAP Z-D6; public/models, built by tools/blender/work/codex/dungeon-props): the
// chests (body + lid, the lid's node at its hinge, the kit's frame), the biome pots and the shrines' stone bases. Each
// is plain vertex-coloured geometry, so it drops into the kit's own meshes (lootModels.js chestGeometry / potGeometry,
// dungeonMode.js makeShrine). Loaded once at boot; a piece not yet loaded (or not built) keeps its kit model.
import { loadGlb } from '../gfx/glbAssets.js';

/** the props that exist (a missing file would log a 404 in the console: list only what's built) */
export const PROP_GLBS = ['chest-wood', 'chest-gold', 'pot-burrow', 'pot-shrine', 'pot-moon', 'pot-kitchen', 'pot-crystal', 'shrine-zoomies', 'shrine-goodboy', 'shrine-lucky', 'shrine-sparkle', 'shrine-snack'];
const GEO = new Map(); // 'chest-wood:body' → BufferGeometry (the template: callers clone it)

export function loadDungeonProps() {
  return Promise.all(PROP_GLBS.map(name => loadGlb(`/models/${name}.glb`).then(tpl => {
    tpl.traverse(o => { if (o.isMesh) GEO.set(`${name}:${o.name}`, o.geometry); }); // (one material per node: the mesh is named as its node)
  }).catch(e => console.warn('[props]', name, e))));
}

/** a clone of a loaded prop's node geometry (vertex colours as `color`), or null (not loaded: the kit model) */
export function propGeo(name, node) {
  const g = GEO.get(`${name}:${node}`);
  return g ? g.clone() : null;
}
