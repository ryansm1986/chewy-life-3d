// Poe's procedural fallback in the Toybox kit (docs/POE.md §1; the approved sheet:
// tools/blender/work/codex/pug-concept/concepts/option-D.png): the costume pieces the kit's gi / shorts / sash don't
// cover, built into the same rig before it is scaled and baked (toyKit.js calls spec.toy.extras(R, K)):
//  - the cream cowl (her lowered face mask) bunched round the neck, and the moss hood lowered behind it;
//  - moss forearm sleeves with a cream and a dark-moss guard stripe, puffy dark-moss shorts, cream shin wraps;
//  - the jutsu scroll at her left hip, the shuriken pouch (a bone poking out) at her right hip;
//  - the fox festival mask on the left of her head, a mustard tassel hanging from it.
// The fūma on her back is NOT baked in: it's a prop (actors/poeGear.js dressPoe) the game hides while it's thrown.
// Sizes: the kit's sheet metres (K.* helpers from toyKit.js TOY_KIT), +x = her left, +z = forward.
import * as THREE from 'three';
import { paintFn, mergeIndexed, tubeGeo } from './disneyKit.js';

const C = h => new THREE.Color(h);
export const POE_PAL = { fur: '#33322c', sheen: '#605f5c', mask: '#1e1d1a', eye: '#c88a3a', moss: '#5a8a4a', cream: '#f4ead2', mustard: '#d8b040', darkMoss: '#3d6038' };
const P = POE_PAL;
// dev: ?poefur=rrggbb&poemask=rrggbb&poesheen=rrggbb try coat colours in the real light (calibrating the coat)
if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search); for (const k of ['fur', 'mask', 'sheen']) if (/^[0-9a-f]{6}$/i.test(q.get('poe' + k) || '')) POE_PAL[k] = '#' + q.get('poe' + k); }
// her black coat in the toon light: the sheet's #2E2A30 (a cool near-black) reads as a violet blob through the kit's grade
// and the post lift, so the coat is a warm charcoal (on screen: a neutral black) and its vertex colours carry a painted sheen
// (lighter where it faces the sky and the key light, the sheet's soft highlights)
const SHEEN = { lift: 0.62, side: 0.18, face: 0.7 };

const shade = (base, amt = 0.1) => (x, y, z, nx, ny, nz, o) => { o.set(base).multiplyScalar(1 - amt * Math.max(0, Math.min(1, 0.4 - ny))); return 0; };
const ellG = (r, p, rot = [0, 0, 0], seg = 18) => { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(...r); if (rot[0] || rot[1] || rot[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))); g.translate(...p); return g; };

/** spec.toy.extras for CAST.poe (toyKit.js buildToyBody) */
export function poeToyExtras(R, K) {
  const dg = R.spec?.toy?.darkGrade; if (dg) R.mat.userData.u?.uDarkGrade?.value.set(dg[0], dg[1] / 255, dg[2] / 255, dg[3] / 255);
  const { body, head, legL, legR, armL, armR, bw, dz, lk, torsoR, torsoZ, band, lathe, tinted, kit, H } = K;
  const torso = [];
  // --- the cowl: a fat cream wrap round the neck with a soft droop at the front, mustard ties at the back
  const yC = 0.284;
  torso.push(tinted(band(torsoR(yC) + 0.028, 0.038, 0.074, 44).scale(bw, 1, dz).translate(0, yC, 0), P.cream, 0.14));
  torso.push(tinted(band(torsoR(yC - 0.034) + 0.018, 0.022, 0.05, 40).scale(bw * 1.02, 1, dz * 1.04).translate(0, yC - 0.034, 0.004), P.cream, 0.18));
  const zF = torsoR(yC - 0.03) * dz + 0.028;
  torso.push(paintFn(ellG([0.07 * bw, 0.04, 0.03], [0, yC - 0.035, zF]), shade(P.cream, 0.16)));
  for (const s of [1, -1]) torso.push(tinted(tubeGeo([[s * 0.016, yC - 0.005, -torsoR(yC) * dz - 0.05], [s * 0.04, yC - 0.06, -torsoR(yC) * dz - 0.05]], [0.011, 0.008], 6), P.mustard, 0.1));
  // --- the moss hood, lowered and bunched behind the neck (flat enough that the fūma mounts clear of it)
  const zB = -torsoR(0.3) * dz;
  torso.push(paintFn(ellG([0.1 * bw, 0.052, 0.036], [0, 0.302, zB - 0.006], [0.25, 0, 0]), shade(P.moss, 0.14)));
  torso.push(paintFn(ellG([0.075 * bw, 0.03, 0.026], [0, 0.272, zB - 0.012], [0.4, 0, 0]), shade(C(P.moss).multiplyScalar(0.86).getStyle(), 0.1)));
  // --- the jutsu scroll at her LEFT hip (+x): cream, dark wooden caps, tied to the sash with a mustard cord
  { const sx = 0.168 * bw, sy = 0.012, sz = torsoZ(0.12, 0.0, bw, dz, 0.02) * 0.62 + 0.03, rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.12, 0, -0.32));
    const roll = new THREE.CylinderGeometry(0.024, 0.024, 0.108, 16); roll.applyMatrix4(rot); roll.translate(sx, sy, sz);
    torso.push(paintFn(roll, (x, y, z, nx, ny, nz, o) => { o.set(P.cream); if (Math.abs(nx * 0.3 + nz) < 0.12) o.multiplyScalar(0.9); return 0; }));
    for (const e of [-1, 1]) { const cap = new THREE.CylinderGeometry(0.028, 0.028, 0.016, 16); cap.translate(0, e * 0.058, 0); cap.applyMatrix4(rot); cap.translate(sx, sy, sz); torso.push(tinted(cap, '#6b4a3a', 0.12));
      const knob = ellG([0.012, 0.01, 0.012], [0, e * 0.07, 0]); knob.applyMatrix4(rot); knob.translate(sx, sy, sz); torso.push(tinted(knob, '#6b4a3a', 0.1)); }
    const tie = band(0.027, 0.006, 0.008, 16); tie.applyMatrix4(rot); tie.translate(sx, sy, sz); torso.push(tinted(tie, P.mustard, 0.1));
    torso.push(tinted(tubeGeo([[sx - 0.01, sy + 0.022, sz + 0.012], [sx - 0.03, sy + 0.05, sz + 0.004], [sx - 0.045, sy + 0.068, sz - 0.004]], [0.006, 0.006, 0.005], 5), P.mustard, 0.1)); }
  // --- the shuriken pouch at her RIGHT hip (−x): dark moss, a flap and a stud, a little bone poking out of it
  { const px = -0.17 * bw, py = 0.006, pz = 0.05;
    const pg = new THREE.SphereGeometry(1, 18, 14), Q = pg.attributes.position;
    for (let i = 0; i < Q.count; i++) { const y = Q.getY(i), k = y > 0.5 ? 0.62 + (y - 0.5) * 0.3 : 1 - 0.08 * Math.max(0, -y); Q.setX(i, Q.getX(i) * k); Q.setZ(i, Q.getZ(i) * k); }
    pg.deleteAttribute('uv'); pg.computeVertexNormals(); pg.scale(0.044, 0.046, 0.036); pg.rotateY(-0.5); pg.translate(px, py, pz);
    torso.push(tinted(pg, P.darkMoss, 0.16));
    const flap = ellG([0.042, 0.016, 0.034], [px, py + 0.034, pz + 0.004], [0.2, -0.5, 0]); torso.push(tinted(flap, C(P.darkMoss).multiplyScalar(0.85).getStyle(), 0.1));
    torso.push(tinted(ellG([0.009, 0.009, 0.006], [px + 0.012, py + 0.024, pz + 0.032], [0, -0.5, 0], 10), P.mustard, 0.05));
    // the bone (a mini fūma arm) sticking up out of the pouch
    const bx = px - 0.012, by = py + 0.06, bz = pz - 0.004;
    torso.push(tinted(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10).rotateZ(0.35).translate(bx, by, bz), P.cream, 0.08));
    for (const s of [-1, 1]) torso.push(tinted(ellG([0.012, 0.012, 0.01], [bx - 0.01 + s * 0.011, by + 0.03 + s * 0.004, bz], [0, 0, 0], 10), P.cream, 0.06)); }
  R.add(body, kit(mergeIndexed(torso)), 'poeCostume');

  // --- forearm sleeves with the guard stripes (cream, then dark moss) above the mitten paws
  for (const arm of [armL, armR]) {
    const ar = 0.058 * lk, parts = [];
    const sl = new THREE.CylinderGeometry(ar + 0.008, ar + 0.004, 0.062, 20, 1, true); sl.translate(0, -0.112, 0); parts.push(tinted(sl, P.moss, 0.1));
    parts.push(tinted(band(ar + 0.01, 0.009, 0.01, 22).translate(0, -0.104, 0), P.cream, 0.08));
    parts.push(tinted(band(ar + 0.009, 0.011, 0.01, 22).translate(0, -0.128, 0), P.darkMoss, 0.08));
    R.add(arm, kit(mergeIndexed(parts)), 'poeSleeve');
  }
  // --- puffy shorts and the cream shin wraps (crossed binding), a mustard tie at the ankle
  for (const leg of [legL, legR]) {
    const parts = [], s = leg === legL ? 1 : -1;
    const puff = lathe([[0.072, 0.012], [0.094, -0.012], [0.104, -0.04], [0.097, -0.064], [0.08, -0.078], [0.072, -0.08]], 26); puff.scale(1, 1, 0.94);
    parts.push(paintFn(puff, (x, y, z, nx, ny, nz, o) => { o.set(P.darkMoss); const fold = 0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 5 + s); o.multiplyScalar(0.9 + 0.1 * fold - 0.08 * Math.max(0, 0.3 - ny)); return 0; }));
    const yA = -0.09, yB = -0.152, wr = new THREE.CylinderGeometry(0.086, 0.082, yA - yB, 22, 4, true); wr.translate(0, (yA + yB) / 2, 0); wr.scale(1, 1, 0.94);
    parts.push(paintFn(wr, (x, y, z, nx, ny, nz, o) => { o.set(P.cream); const a = Math.atan2(x, z), u = (a / (Math.PI * 2)) * 6, w = (y - yB) / (yA - yB) * 3; const d1 = Math.abs(((u + w) % 1 + 1) % 1 - 0.5), d2 = Math.abs(((u - w) % 1 + 1) % 1 - 0.5); if (d1 < 0.06 || d2 < 0.06) o.multiplyScalar(0.8); return 0; }));
    parts.push(tinted(band(0.088, 0.006, 0.01, 22).translate(0, yA + 0.002, 0), C(P.cream).multiplyScalar(0.92).getStyle(), 0.05));
    parts.push(tinted(band(0.086, 0.007, 0.011, 22).translate(0, yB - 0.004, 0), P.mustard, 0.08));
    R.add(leg, kit(mergeIndexed(parts)), 'poeLeg');
  }
  // --- the fox festival mask, worn on the LEFT of her head (+x) above the eye, tilted out; a mustard tassel
  { const dir = new THREE.Vector3(0.8, 0.46, 0.4).normalize(); let t = 0.05; // (on the skull: march out from its centre)
    while (t < 0.5 && H.face(dir.x * t, H.cy + dir.y * t, dir.z * t) < 0) t += 0.003;
    const nrm = new THREE.Vector3(0.72, 0.3, 0.62).normalize(); // (its face looks out, up and forward)
    const ax = dir.x * t + nrm.x * 0.008, ay = H.cy + dir.y * t + nrm.y * 0.008, az = dir.z * t + nrm.z * 0.008;
    const frame = new THREE.Matrix4().lookAt(nrm, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationZ(-0.4));
    const m = [];
    // the face plate: a rounded mask, deeper in the middle, with a little muzzle
    const plate = new THREE.SphereGeometry(1, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), Q = plate.attributes.position;
    for (let i = 0; i < Q.count; i++) { const x = Q.getX(i), y = Q.getY(i), z = Q.getZ(i); Q.setXYZ(i, x * 0.07, -z * 0.078 + 0.004, y * 0.03); } // (pole → +z; a proper rotation, so the winding stays outward)
    plate.computeVertexNormals();
    m.push(paintFn(plate, (x, y, z, nx, ny, nz, o) => {
      o.set('#fbf6ec');
      const eL = Math.hypot((Math.abs(x) - 0.03) / 0.017, (y - 0.016) / 0.008); // slanted eye slits
      if (eL < 1 && z > 0.01) o.set('#2a2226');
      if (Math.hypot((Math.abs(x) - 0.036) / 0.012, (y + 0.006) / 0.007) < 1 && z > 0.008) o.set('#e8783a'); // cheek flames
      if (Math.abs(x) < 0.008 && y > 0.03 && y < 0.07 && z > 0.01) o.set(P.darkMoss); // the brow stripe
      o.multiplyScalar(1 - 0.08 * Math.max(0, -ny));
      return 0;
    }));
    m.push(paintFn(ellG([0.022, 0.017, 0.022], [0, -0.03, 0.026]), (x, y, z, nx, ny, nz, o) => { o.set('#fbf6ec'); if (z > 0.044) o.set('#2a2226'); return 0; })); // the snout tip
    for (const s of [1, -1]) { // pointed fox ears with a dark-moss inner
      const ear = new THREE.ConeGeometry(0.022, 0.05, 10); ear.scale(1, 1, 0.45); ear.rotateZ(s * -0.32); ear.translate(s * 0.04, 0.074, 0.006);
      m.push(paintFn(ear, (x, y, z, nx, ny, nz, o) => { o.set('#fbf6ec'); if (nz > 0.5 && y < 0.09) o.set(P.darkMoss); return 0; }));
    }
    const gm = mergeIndexed(m); gm.applyMatrix4(frame); gm.translate(ax, ay, az);
    const tassel = [];
    const tp = new THREE.Vector3(-0.04, -0.06, 0.0).applyMatrix4(frame).add(new THREE.Vector3(ax, ay, az));
    tassel.push(tinted(tubeGeo([[tp.x, tp.y + 0.03, tp.z], [tp.x + 0.004, tp.y + 0.01, tp.z + 0.004], [tp.x + 0.006, tp.y - 0.012, tp.z + 0.006]], [0.005, 0.005, 0.005], 5), P.mustard, 0.05));
    tassel.push(tinted(ellG([0.012, 0.011, 0.012], [tp.x + 0.006, tp.y - 0.018, tp.z + 0.006], [0, 0, 0], 12), P.mustard, 0.08));
    tassel.push(tinted(new THREE.ConeGeometry(0.013, 0.04, 12).translate(tp.x + 0.006, tp.y - 0.046, tp.z + 0.006), P.mustard, 0.12));
    R.add(head, kit(mergeIndexed([gm, ...tassel])), 'festivalMask');
  }
  // --- the coat's sheen (see SHEEN): every vertex painted the coat or mask colour gets lighter toward the sky / key light
  const coat = [C(R.spec.fur), C(R.spec.fur2)], sheen = C(P.sheen), c = new THREE.Color();
  for (const m of R.meshes) {
    if (!/^(headMesh|ear|tailMesh|arm|leg)$/.test(m.name)) continue;
    const A = m.geometry.attributes, col = A.color, N = A.normal; if (!col || !N) continue;
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      const which = coat.findIndex(k => Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 0.03); if (which < 0) continue;
      let k = Math.max(0, Math.min(1, SHEEN.lift * (0.5 + 0.5 * N.getY(i)) + SHEEN.side * (0.5 * N.getX(i) + 0.5 * N.getZ(i)) - 0.22));
      // the face: the brow and cheeks catch a soft front sheen, the muzzle mask (fur2) doesn't — so the bun muzzle reads
      if (m.name === 'headMesh' && which === 0) k = Math.max(k, SHEEN.face * Math.max(0, N.getZ(i) - 0.25));
      c.lerp(sheen, Math.min(1, k * k * 0.85 + (m.name === 'headMesh' && which === 0 ? SHEEN.face * 0.5 * Math.max(0, N.getZ(i) - 0.4) : 0))); col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}
