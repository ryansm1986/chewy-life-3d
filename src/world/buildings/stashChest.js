// The Stash Chest (2 × 1; ROADMAP R-18, docs/HOUSING.md "The stash"): the cottage's gold-banded, paw-locked treasure
// chest, grown up for the village, under its own little tiled roof on four posts, with a paper lantern on a bracket and
// a paw sign under the eave. The lid is its own part (kind 'lid', buildings/index.js): it pops open and settles shut
// with a bounce when the stash opens here (model.kick()). Front / the door faces +z.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col } from './kit.js';
import { roof } from './roofs.js';
import { STONES } from './parts.js';
import { chochin, pot, rock, bush } from './props.js';
import { symbol } from './symbols.js';

const GOLD = '#f6c443', GOLD_HI = '#fff2b8', WOOD = '#a65f36', WOOD_D = '#62361f', WOOD_L = '#bb7042';

// the chest's measures (local to the chest, y = 0 at its feet)
const W = 1.12, D = 0.5, Y0 = 0.07, HB = 0.42, R = D / 2 + 0.014, TOP = Y0 + HB;

/** the chest body (static): feet, planked box, gold straps, the seam band and the lock plate */
function chestBody(B) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = G.sph(0.062, 9, 6); f.scale(1, 0.8, 1); f.translate(sx * 0.48, 0.055, sz * 0.17); B.add(f, GOLD); }
  const body = G.box(W, HB, D, 0.045); body.translate(0, Y0 + HB / 2, 0);
  // planks: three courses, each a touch different, with a dark groove between them
  B.add(body, (p, n, o) => {
    const k = Math.floor((p.y - Y0) / (HB / 3));
    o.set(k === 1 ? shade(WOOD, 1.05) : k === 2 ? shade(WOOD, 0.95) : WOOD);
    const g = ((p.y - Y0) / (HB / 3)) % 1; if (g < 0.06 || g > 0.94) o.set(WOOD_D);
    if (n.y > 0.7) o.set(shade(WOOD, 0.88));
  });
  // the gold straps down the front, back and sides, with rivets
  for (const sx of [-0.34, 0.34]) {
    const s = G.box(0.085, HB + 0.01, D + 0.018, 0.012); s.translate(sx, Y0 + HB / 2, 0); B.add(s, GOLD);
    for (const y of [Y0 + 0.08, Y0 + HB - 0.08]) { const r = G.sph(0.016, 6, 4); r.scale(1, 1, 0.5); r.translate(sx, y, D / 2 + 0.012); B.add(r, GOLD_HI); }
  }
  for (const sx of [-1, 1]) { const s = G.box(0.02, HB + 0.01, 0.07, 0); s.translate(sx * (W / 2 + 0.006), Y0 + HB / 2, 0); B.add(s, GOLD); }
  // corner caps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const cc = G.box(0.075, 0.075, 0.075, 0.02); cc.translate(sx * (W / 2 - 0.02), Y0 + 0.035, sz * (D / 2 - 0.02)); B.add(cc, GOLD); }
  // the seam band and the lock plate (the hasp rides on the lid)
  const band = G.box(W + 0.022, 0.034, D + 0.022, 0.01); band.translate(0, TOP - 0.017, 0); B.add(band, GOLD);
  const plate = G.box(0.22, 0.2, 0.04, 0.03); plate.translate(0, TOP - 0.13, D / 2 + 0.012); B.add(plate, GOLD);
  // inside (seen only while the lid is up): a dark hollow with a glint of treasure
  const hole = G.box(W - 0.09, 0.006, D - 0.09, 0); hole.translate(0, TOP + 0.002, 0); B.add(hole, '#3a2218');
  for (const [x, z, a] of [[-0.3, 0.05, 0.3], [-0.22, -0.08, 1.1], [-0.12, 0.08, 0.7], [0.14, -0.06, 0.2], [0.24, 0.07, 1.4], [0.33, -0.04, 0.9]]) { const c = G.cyl(0.042, 0.042, 0.014, 10); c.rotateX(0.25); c.rotateY(a); c.translate(x, TOP + 0.012, z); B.add(c, (p, n, o) => o.set(n.y > 0.6 ? GOLD_HI : GOLD)); }
  const gem = G.ico(0.045, 0); gem.translate(0.03, TOP + 0.03, 0.02); B.add(gem, '#ff6a8a');
  const key = G.box(0.026, 0.06, 0.02, 0); key.translate(0, TOP - 0.16, D / 2 + 0.033); B.add(key, '#5a3a24');
  const kh = G.sph(0.024, 8, 5); kh.scale(1, 1, 0.5); kh.translate(0, TOP - 0.125, D / 2 + 0.033); B.add(kh, '#5a3a24');
  // ring handles on the ends
  for (const sx of [-1, 1]) {
    const m = G.box(0.02, 0.06, 0.07, 0); m.translate(sx * (W / 2 + 0.014), Y0 + HB * 0.66, 0); B.add(m, GOLD);
    const r = G.torus(0.055, 0.013, 5, 12); r.rotateY(PI / 2); r.translate(sx * (W / 2 + 0.026), Y0 + HB * 0.6, 0); B.add(r, GOLD);
  }
}

/** the domed lid, built around its hinge (the back of the seam): local origin at (0, TOP, -D / 2) */
function chestLid(B) {
  const cz = D / 2; // (the dome's axis sits over the middle of the box)
  const lid = new THREE.CylinderGeometry(R, R, W + 0.024, 20, 1, false, 0, PI); lid.rotateZ(PI / 2); lid.translate(0, 0, cz);
  B.add(lid, (p, n, o) => {
    if (Math.abs(n.x) > 0.7) { o.set(WOOD_D); return; }
    const a = Math.floor(Math.atan2(p.y, p.z - cz) / (PI / 7)); o.set(a % 2 ? WOOD_L : shade(WOOD_L, 0.86));
  });
  for (const sx of [-0.34, 0.34]) {
    const s = new THREE.CylinderGeometry(R + 0.009, R + 0.009, 0.085, 20, 1, true, 0, PI); s.rotateZ(PI / 2); s.translate(sx, 0, cz); B.add(s, GOLD);
    for (const a of [0.45, 1.25, 2.1]) { const r = G.sph(0.015, 6, 4); r.translate(sx, Math.sin(a) * (R + 0.012), cz + Math.cos(a) * (R + 0.012)); B.add(r, GOLD_HI); }
  }
  // the hasp down over the lock plate, with the paw on it
  const hasp = G.box(0.16, 0.13, 0.03, 0.025); hasp.translate(0, -0.02, D + 0.03); B.add(hasp, GOLD);
  B.at([0, -0.02, D + 0.046], 0, () => symbol(B, 'paw', 0.13, { depth: 0.12, colors: ['#8a4a2c'] }));
  // a red ribbon bow tied round the right strap: the pack's own chest
  B.at([0.34, R * 0.72, cz + R * 0.66], 0, () => {
    for (const s of [-1, 1]) { const l = G.sph(0.05, 8, 6); l.scale(1.15, 0.7, 0.45); l.rotateZ(s * 0.5); l.translate(s * 0.05, 0.01, 0); B.add(l, '#e8403a'); }
    const k = G.sph(0.026, 7, 5); B.add(k, '#c8302a');
    for (const s of [-1, 1]) { const t = G.box(0.03, 0.09, 0.012, 0); t.rotateZ(s * 0.35); t.translate(s * 0.03, -0.06, 0.005); B.add(t, '#e8403a'); }
  });
}

export function stashChest(B) {
  // a mossy stone plinth with two flat steps of stone into it
  const plinth = G.box(1.86, 0.12, 0.86, 0.05); plinth.translate(0, 0.06, -0.04);
  B.add(plinth, (p, n, o) => {
    const cell = Math.floor((p.x + 2) / 0.46) + Math.floor((p.z + 2) / 0.43) * 3;
    o.set(STONES[(cell * 7 + 3) % STONES.length]);
    if (n.y > 0.7 && Math.sin(p.x * 9.1 + p.z * 13.7) > 0.72) o.lerp(col(C.moss), 0.55);
    if (n.y < 0.5) o.multiplyScalar(0.9);
  });
  const step = puff(V(0, 0.03, 0.5), 0.2, { detail: 1, noise: 0.15, squash: 0.25, seed: B.seed + 5 }); step.scale(1.5, 1, 0.75); step.translate(0, 0, 0.12); B.add(step, STONES[3]);
  // four posts, beams and braces
  const PX = 0.82, PZ = 0.34, PH = 1.28;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = G.beam(0.1, PH, 0.1, 0.02); post.translate(sx * PX, 0.12 + PH / 2, sz * PZ); B.add(post, C.woodMid);
    const foot = G.box(0.16, 0.06, 0.16, 0.02); foot.translate(sx * PX, 0.15, sz * PZ); B.add(foot, C.woodDark);
  }
  for (const sz of [-1, 1]) { const be = G.beam(1.86, 0.1, 0.1, 0.02); be.translate(0, 0.12 + PH - 0.05, sz * PZ); B.add(be, C.woodDark); }
  for (const sx of [-1, 1]) { const be = G.beam(0.08, 0.08, 0.84, 0.015); be.translate(sx * PX, 0.12 + PH - 0.05, 0); B.add(be, C.woodDark); }
  for (const sx of [-1, 1]) { // little corner braces at the front
    const br = G.beam(0.05, 0.05, 0.3, 0.01); br.rotateZ(sx * PI / 4); br.translate(sx * (PX - 0.1), 0.12 + PH - 0.2, PZ); B.add(br, C.woodMid);
  }
  // the roof: a small tiled gable, ridge along x, onigawara at the ends
  roof(B, { type: 'gable', w: 1.66, d: 0.68, y0: 0.12 + PH, over: 0.2, gOver: 0.16, H: 0.36, curve: 0.3, lift: 0.1, liftW: 0.24, thick: 0.08, ribW: 0.17, ribAmp: 0.026, color: ROOFS.slate, vent: false, oni: true, gable: 'wood', moss: 0.15 });
  // the pack's crest on both gable ends: a gold paw on a round cream plaque (seen from either side of the camera)
  for (const sx of [-1, 1]) B.at([sx * (PX + 0.09), 0.12 + PH + 0.17, 0], sx * PI / 2, () => {
    const d = G.cyl(0.13, 0.13, 0.03, 18); d.rotateX(PI / 2); B.add(d, '#fff6e8');
    const r = G.torus(0.13, 0.02, 5, 20); B.add(r, GOLD);
    B.at([0, 0, 0.016], 0, () => symbol(B, 'paw', 0.17, { depth: 0.02, colors: [shade(WOOD, 0.9)] }));
  });
  // a straw rope along the front beam, its short paper streamers out at the ends (past the chest, so its gold bands and
  // the paw lock read clean from either side): the pack's treasure is a little bit sacred
  {
    const y = 0.12 + PH - 0.11, sag = 0.07, w = 1.56, z = PZ + 0.075, r = 0.032, pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push({ p: V(-w / 2 + w * t, y - Math.sin(t * PI) * sag, z), r: r * (0.75 + Math.sin(t * PI) * 0.45) }); }
    B.add(tube(pts, 6, false), (p, n, o) => o.set('#e8cf92').multiplyScalar(0.86 + 0.14 * Math.sin(p.x * 60)));
    for (const t of [0.06, 0.94]) {
      const x = -w / 2 + w * t, yy = y - Math.sin(t * PI) * sag - r, cl = { x0: x - 0.05, x1: x + 0.05, yTop: yy, yBot: yy - 0.18 };
      for (let j = 0; j < 2; j++) { const g = G.plane(0.065, 0.085, 1, 1); g.translate(x + (j ? 0.018 : -0.018), yy - 0.042 - j * 0.075, z + r + 0.01); B.cloth(g, '#fff1d8', cl); }
    }
  }
  // the chest itself, on the plinth
  B.push([0, 0.12, -0.02]);
  chestBody(B);
  B.anim({ p: [0, TOP, -D / 2], kind: 'lid', axis: [1, 0, 0], speed: 1, amp: 0.52 }, () => chestLid(B));
  B.pop();
  // a paper lantern on a bracket from the right front post
  B.push([PX + 0.04, 0.12 + PH - 0.26, PZ + 0.02]);
  const arm = G.box(0.32, 0.03, 0.03, 0); arm.translate(0.14, 0, 0); B.add(arm, C.iron);
  const brace = G.box(0.22, 0.022, 0.022, 0); brace.rotateZ(0.7); brace.translate(0.07, -0.08, 0); B.add(brace, C.iron);
  B.at([0.27, -0.015, 0], 0, () => chochin(B, { r: 0.1, h: 0.2, color: '#e8503a', cord: 0.04 }));
  B.pop();
  B.light([PX + 0.31, 0.12 + PH - 0.42, PZ + 0.04], { color: '#ffb466', intensity: 2.2, radius: 4.2, flicker: 0.5, nightOnly: true });
  // dressing: a potted flower at the left, a tuft and a pebble at the right
  B.at([-0.66, 0.12, 0.22], 0, () => pot(B, { r: 0.1, h: 0.16, color: C.terracotta, plant: 'flowers', flowers: ['#ff8fb0', '#fff6ea'] }));
  B.at([0.98, 0, 0.3], 0, () => bush(B, { r: 0.13, n: 1, color: '#5aa84a' }));
  B.at([-0.98, 0, -0.32], 0, () => rock(B, { r: 0.09 }));
  B.door.set(0, 0, 0.82);
  B.height = 0.12 + PH + 0.5;
}
