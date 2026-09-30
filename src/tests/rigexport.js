// Rig export for the Blender refine pipeline: /?test=rigexport&who=chewy[&detail=3]  (driven by tools/blender/export-rigs.mjs)
import { buildBoston, rawHumanoid, setKitDetail, CAST, REFINED_CAST } from '../actors/charKit.js';
import { VILLAGERS } from '../actors/roster.js';
import { exportRawRig, rigSignature } from '../actors/refinedRigs.js';

// everything the pipeline can export (the game loads REFINED_CAST); villagers are here for when they are rolled out
const EXPORTABLE = { ...REFINED_CAST, rosie: CAST.rosie, ...Object.fromEntries(VILLAGERS.map(v => [v.id, v.spec])) };

export default function () {
  const P = new URLSearchParams(location.search);
  const who = P.get('who') || 'chewy';
  const build = () => (who === 'shadow' ? buildBoston({}, true) : rawHumanoid(EXPORTABLE[who]));
  const game = build(); // tessellation as in game: its structure signature is what the runtime checks against
  setKitDetail(+(P.get('detail') || 5));
  const dense = build();
  setKitDetail(1);
  const out = exportRawRig(dense);
  out.signature = rigSignature(game);
  // parts without an ink hull (eyes, nose, mouth, brows) stay as they are: ship them at game tessellation
  const gameParts = exportRawRig(game).parts;
  out.details = gameParts.filter(p => !p.outline);
  out.shellTris = gameParts.filter(p => p.outline).reduce((a, p) => a + (p.idx ? p.idx.length : p.pos.length / 3) / 3, 0); // the refined skin may not cost more
  for (const p of out.parts) delete p.nrm; // dense parts are only bake sources
  window.__export = out;
  window.__ready = true;
}
