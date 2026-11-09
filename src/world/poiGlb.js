// Blender models for the outskirts' places and the Seed Stall (ROADMAP Z-D6): /models/poi-<id>-<k>.glb, k = the place's
// k-th ctx.kit() call (world/outskirts/index.js), in that kit model's local frame. It stands in for the kit's meshes
// (buildings/index.js glbStandIn); the kit's moving parts, lights, colliders and decks stay. Not listed: the kit.
import { loadGlb } from '../gfx/glbAssets.js';

export const POI_GLB = { lighthouse: [0], tea: [0, 1], tidepools: [0, 1, 2, 3], wishtree: [0, 1, 2], seaarch: [0, 1], bees: [0], cove: [0, 1],windmill: [0], moonpond: [0], pier: [0, 1],seedStall: [0] }; // id → the kit calls with a model, e.g. windmill: [0]
const TPL = new Map();
export const poiGlbUrls = () => Object.entries(POI_GLB).flatMap(([id, ks]) => ks.map(k => `/models/poi-${id}-${k}.glb`));
/** load every listed model (awaited at boot, before the outskirts build) */
export function loadPoiGlbs() {
  return Promise.all(Object.entries(POI_GLB).flatMap(([id, ks]) => ks.map(k => { const url = `/models/poi-${id}-${k}.glb`; return loadGlb(url).then(t => TPL.set(`${id}:${k}`, t)).catch(e => console.warn('[outskirts] model', url, e)); })));
}
export const poiGlb = (id, k = 0) => TPL.get(`${id}:${k}`) || null;
