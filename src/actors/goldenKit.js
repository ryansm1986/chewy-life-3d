// The Golden Retriever dragoon's procedural fallback in the Toybox kit (docs/GOLDEN.md §8; ?chewy=classic, and while his
// baked model loads): the pieces that make the kit's red-gold dog read as him, built into the same rig before it is scaled
// and baked (toyKit.js calls spec.toy.extras(R, K)). Small on purpose:
//  - the long feathered ear drapes (red-gold, a lighter fringe at the bottom), from the top of the head down past the jaw;
//  - the emerald crest helm: a cap on the crown, a brass rim, two brass horns and a chunky little dragon head on top;
//  - the cream chest ruff; the emerald javelin quiver on his spine with three brass caps.
// Sizes: the kit's sheet metres (K.* helpers from toyKit.js TOY_KIT), +x = his left, +z = forward. The fur is the sheet's
// red-gold a little desaturated (fur / light): the kits' toon and the grade push it to a flat orange otherwise (the
// baked model gets heroModels.js warmGrade instead).
import * as THREE from 'three';
import { paintFn, mergeIndexed } from './disneyKit.js';

export const GOLDEN_PAL = { fur: '#bd7c45', light: '#dcaa76', sheetFur: '#c47a3a', sheetLight: '#e0a868', emerald: '#3a9a6a', brass: '#c8a050', cream: '#f4e8d0', eye: '#603b27', blush: '#d97a68' };
const P = GOLDEN_PAL;
const shade = (base, amt = 0.12) => (x, y, z, nx, ny, nz, o) => { o.set(base).multiplyScalar(1 - amt * Math.max(0, Math.min(1, 0.4 - ny))); return 0; };
const fringe = (base, light, y0) => (x, y, z, nx, ny, nz, o) => { o.set(y < y0 ? light : base).multiplyScalar(1 - 0.14 * Math.max(0, Math.min(1, 0.4 - ny))); return 0; };
const ellG = (r, p, rot = [0, 0, 0], seg = 18) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(...r);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); g.deleteAttribute('uv'); return g;
};
const coneG = (r, h, p, rot = [0, 0, 0], seg = 10) => {
  const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); g.deleteAttribute('uv'); return g;
};

/** spec.toy.extras for CAST.golden (toyKit.js buildToyBody) */
export function goldenToyExtras(R, K) {
  const { body, head, H, bw, dz, torsoZ, band, tinted, kit } = K;
  const top = H.cy + H.H * 0.96, hw = H.W, hair = [], helm = [];
  // --- the feathered ear drapes: big rounded masses hanging past the jaw, a lighter fringe at the bottom
  for (const s of [1, -1]) {
    hair.push(paintFn(ellG([0.07, 0.17, 0.075], [s * (hw + 0.02), H.cy - 0.03, -0.02], [0.06, 0, s * 0.14], 20), fringe(P.fur, P.light, H.cy - 0.15)));
    hair.push(paintFn(ellG([0.056, 0.05, 0.06], [s * (hw + 0.04), H.cy - 0.18, -0.01], [0, 0, s * 0.22], 16), shade(P.light, 0.14)));
  }
  // --- the crest helm: an emerald cap on the crown with a brass rim, two brass horns, a little dragon head on top
  helm.push(tinted(ellG([hw * 0.78, 0.07, H.D * 0.7], [0, top - 0.02, -0.01]), P.emerald, 0.12));
  helm.push(tinted(band(hw * 0.74, 0.012, 0.014, 26).translate(0, top - 0.045, -0.01), P.brass, 0.08));
  for (const s of [1, -1]) helm.push(tinted(coneG(0.018, 0.06, [s * hw * 0.42, top + 0.01, 0.01], [-0.25, 0, -s * 0.35]), P.brass, 0.06));
  helm.push(tinted(ellG([0.05, 0.036, 0.075], [0, top + 0.06, 0.0]), P.emerald, 0.1)); // the dragon's body
  helm.push(tinted(ellG([0.036, 0.032, 0.042], [0, top + 0.085, 0.06]), P.emerald, 0.1)); // its head
  for (const s of [1, -1]) helm.push(tinted(ellG([0.007, 0.007, 0.006], [s * 0.022, top + 0.095, 0.092], [0, 0, 0], 8), '#1e2a22', 0.02)); // its eyes
  for (let i = 0; i < 3; i++) helm.push(tinted(coneG(0.01, 0.022, [0, top + 0.09 - i * 0.01, 0.02 - i * 0.03], [-0.4, 0, 0], 8), P.brass, 0.05)); // its spines
  R.add(head, kit(mergeIndexed(hair)), 'gldEars');
  R.add(head, kit(mergeIndexed(helm)), 'gldHelm');
  // --- the cream chest ruff, and the quiver on his spine (emerald, three brass javelin caps)
  const back = [], z0 = torsoZ(0.1, 0.0, bw, dz, 0.02) * 0.55;
  back.push(paintFn(ellG([0.1 * bw, 0.06, 0.05], [0, 0.11, z0 + 0.03]), shade(P.cream, 0.1)));
  const qz = -z0 - 0.03;
  back.push(tinted(ellG([0.03, 0.12, 0.03], [0, 0.06, qz], [-0.12, 0, 0]), P.emerald, 0.12));
  for (let i = -1; i <= 1; i++) back.push(tinted(ellG([0.016, 0.016, 0.016], [i * 0.018, 0.19, qz - 0.01], [0, 0, 0], 10), P.brass, 0.06));
  R.add(body, kit(mergeIndexed(back)), 'gldRuff');
}
