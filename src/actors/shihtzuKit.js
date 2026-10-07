// The Shih Tzu's procedural fallback in the Toybox kit (docs/SHIHTZU.md §8; ?chewy=classic, and while his baked model
// loads): the pieces that make the kit's black-and-white dog read as him, built into the same rig before it is scaled and
// baked (toyKit.js calls spec.toy.extras(R, K)). Small on purpose:
//  - the white topknot (three puffs) tied with a plum band, on the crown;
//  - the long drooping black ear locks, from the top of the head down past the jaw;
//  - the white blaze down his brow; a little plum tome on his left hip.
// Sizes: the kit's sheet metres (K.* helpers from toyKit.js TOY_KIT), +x = his left, +z = forward.
import * as THREE from 'three';
import { paintFn, mergeIndexed } from './disneyKit.js';

const BLACK = '#36352f', WHITE = '#f4f0ea', PLUM = '#4a2a4a', SILVER = '#c8ccd8';
const shade = (base, amt = 0.12) => (x, y, z, nx, ny, nz, o) => { o.set(base).multiplyScalar(1 - amt * Math.max(0, Math.min(1, 0.4 - ny))); return 0; };
const ellG = (r, p, rot = [0, 0, 0], seg = 18) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(...r);
  if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
  g.translate(...p); g.deleteAttribute('uv'); return g;
};

/** spec.toy.extras for CAST.shihtzu (toyKit.js buildToyBody) */
export function shihtzuToyExtras(R, K) {
  const dg = R.spec?.toy?.darkGrade; if (dg) R.mat.userData.u?.uDarkGrade?.value.set(dg[0], dg[1] / 255, dg[2] / 255, dg[3] / 255); // (his black, neutral under the kit's grade)
  const { body, head, H, bw, dz, torsoZ, band, tinted, kit } = K;
  const top = H.cy + H.H * 0.98, hw = H.W, parts = [];
  // --- the topknot: three white puffs on the crown, a plum band with a silver bead round its base
  parts.push(paintFn(ellG([0.052, 0.044, 0.05], [0, top + 0.03, -0.01]), shade(WHITE, 0.14)));
  parts.push(paintFn(ellG([0.04, 0.036, 0.04], [0.012, top + 0.07, -0.004]), shade(WHITE, 0.12)));
  parts.push(paintFn(ellG([0.03, 0.028, 0.03], [-0.008, top + 0.1, 0.002]), shade(WHITE, 0.1)));
  parts.push(tinted(band(0.04, 0.012, 0.014, 22).translate(0, top + 0.012, -0.01), PLUM, 0.1));
  parts.push(tinted(ellG([0.009, 0.009, 0.007], [0, top + 0.012, 0.03], [0, 0, 0], 10), SILVER, 0.05));
  // --- the white blaze: a soft stripe from the crown down between the eyes
  parts.push(paintFn(ellG([0.032, 0.1, 0.03], [0, H.cy + H.H * 0.42, H.D * 0.78], [-0.45, 0, 0]), shade(WHITE, 0.06)));
  // --- the ear locks: long rounded drapes from the top of the head down past the jaw, a little splayed
  for (const s of [1, -1]) {
    parts.push(paintFn(ellG([0.062, 0.17, 0.07], [s * (hw + 0.012), H.cy - 0.02, -0.02], [0.08, 0, s * 0.16], 20), shade(BLACK, 0.18)));
    parts.push(paintFn(ellG([0.05, 0.06, 0.06], [s * (hw + 0.03), H.cy - 0.17, -0.005], [0, 0, s * 0.25], 16), shade(BLACK, 0.2)));
  }
  R.add(head, kit(mergeIndexed(parts)), 'stzHair');
  // --- the tome on his LEFT hip (+x): a chunky plum book, silver corners, a pale paw on its cover
  const sx = 0.17 * bw, sy = 0.0, sz = torsoZ(0.1, 0.0, bw, dz, 0.02) * 0.55 + 0.02, rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.05, 0.25, -0.12));
  const book = [];
  const cover = new THREE.BoxGeometry(0.035, 0.11, 0.085); cover.deleteAttribute('uv'); cover.applyMatrix4(rot); cover.translate(sx, sy, sz); book.push(tinted(cover, PLUM, 0.1));
  const pages = new THREE.BoxGeometry(0.028, 0.1, 0.078); pages.deleteAttribute('uv'); pages.translate(0.006, 0, 0); pages.applyMatrix4(rot); pages.translate(sx, sy, sz); book.push(tinted(pages, '#efe6d6', 0.05));
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const c = ellG([0.006, 0.01, 0.01], [0.019, a * 0.05, b * 0.038], [0, 0, 0], 8); c.applyMatrix4(rot); c.translate(sx, sy, sz); book.push(tinted(c, SILVER, 0.05)); }
  const paw = ellG([0.004, 0.018, 0.018], [0.02, 0, 0], [0, 0, 0], 10); paw.applyMatrix4(rot); paw.translate(sx, sy, sz); book.push(tinted(paw, '#bff6e6', 0.02));
  R.add(body, kit(mergeIndexed(book)), 'stzTome');
}
