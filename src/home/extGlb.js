// Blender models for two home kit templates (ROADMAP Z-D6 "Blender everything"; tools/blender/work/codex/hollow-ext): Tanu's
// trinket stall (stallModel.js) and the home mailbox (exteriorModels.js). withExtGlb(key, tpl) hands back the kit template
// with its geometry swapped for the model's (sorted into the kit's material keys by material name), keeping its lights and
// moving parts; a null url, or a model not loaded yet (loadExtGlbs, awaited at boot), keeps the kit.
import { loadGlb, glbBucketGeos } from '../gfx/glbAssets.js';

export const EXT_GLB = { trinketStall: '/models/ext-trinketStall.glb', mailbox: '/models/ext-mailbox.glb' };
const GEOS = {}, SWAPPED = new WeakMap();
export function loadExtGlbs() {
  return Promise.all(Object.entries(EXT_GLB).filter(([, u]) => u).map(([k, u]) => loadGlb(u).then(t => { GEOS[k] = glbBucketGeos(t); }).catch(e => console.warn('[home] model', u, e))));
}
export function withExtGlb(key, tpl) {
  const g = GEOS[key]; if (!g || !tpl) return tpl;
  let t = SWAPPED.get(tpl);
  if (!t) { t = { ...tpl, geos: { ...g } }; SWAPPED.set(tpl, t); }
  return t;
}
