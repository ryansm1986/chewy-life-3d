// Decor: bench, flower bed, fountain, sakura planter, mini torii, koi statue, lantern string, fence,
// arched vermilion bridge (+ bridgeDeckHeight), golden bone statue.
import * as THREE from 'three';
import { puff, tube } from '../../gfx/geom.js';
import { C, G, V, PI, ROOFS, shade, col } from './kit.js';
import { STONES, FLOWERS } from './parts.js';
import { chochin, toro, pot, bush, tree, flowerPatch, bench as benchProp, torii, rock, lrng, faceColors, blossomGeo, leafGeo, mossStone, nz } from './props.js';
import { symbol } from './symbols.js';
import { clamp, TAU } from '../../core/util.js';

export const BRIDGE = { half: 4.5, end: 0.9, peak: 1.42 };
// Walkable deck height (top surface, local space) of the arched bridge at local z (bridge spans z ∈ [-4.5, 4.5]).
export function bridgeDeckHeight(z) {
  const u = Math.min(1, Math.abs(z) / BRIDGE.half);
  return BRIDGE.end + (BRIDGE.peak - BRIDGE.end) * (1 - u * u);
}

export function bench(B) {
  B.at([0, 0, -0.05], 0, () => benchProp(B, { w: 0.95 }));
  B.at([0.4, 0, 0.32], 0, () => pot(B, { r: 0.1, h: 0.14, plant: 'flowers', flowers: [B.pick(FLOWERS)] }));
  B.door.set(0, 0, 0.45);
  B.height = 1.0;
}

// Flower bed: a ring of rounded edging stones (two sizes, some mossy, grass tufts between) or a planked box with
// corner posts and caps; a mounded bed of dark soil, the flowers, and a little wooden plant marker.
export function flowerBed(B) {
  const v = B.variant, rr = lrng(B);
  const stone = v % 2 === 0;
  const pal = [['#ff8fb0', '#ffffff', '#ffd24a'], ['#c8a8ff', '#8fc8ff', '#ffffff'], ['#ff6f7f', '#ffb86a', '#ffd24a'], ['#ffbcd6', '#ff8fb0', '#fff0f6']][v % 4];
  if (stone) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (rr() - 0.5) * 0.08, big = i % 2 === 0, r = big ? 0.1 : 0.075;
      const st = puff(V(0, 0, 0), r, { detail: 1, noise: 0.22, squash: 0.62, seed: i + v * 20 }); st.scale(1.25, 1, 0.95); st.rotateY(-a);
      st.translate(Math.cos(a) * 0.42, r * 0.45, Math.sin(a) * 0.42);
      B.add(st, mossStone(B.pick(STONES), rr() < 0.45 ? 0.45 : 0, 18));
      if (!big && rr() < 0.5) { // grass tuft squeezed between the stones
        for (let k = 0; k < 3; k++) { const bl = leafGeo(0.12, 0.012, 0.2); bl.rotateZ(1.1 + rr() * 0.3); bl.rotateY(rr() * TAU); bl.translate(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); B.add(bl, '#6aae50', 'leaf'); }
      }
    }
  } else {
    const wood = C.woodLight;
    for (let s = 0; s < 4; s++) B.at([0, 0, 0], s * PI / 2, () => {
      for (let row = 0; row < 2; row++) { const b = G.box(0.8, 0.075, 0.06, 0); b.translate(0, 0.04 + row * 0.08, 0.42); B.add(b, (p, n, o) => o.set(wood).multiplyScalar((row ? 1.02 : 0.93) * (n.y > 0.5 ? 1.04 : 1))); }
      const post = G.box(0.09, 0.2, 0.09, 0.02); post.translate(0.42, 0.1, 0.42); B.add(post, C.woodMid);
      const cap = G.cyl(0.02, 0.06, 0.04, 4); cap.rotateY(PI / 4); cap.translate(0.42, 0.22, 0.42); B.add(cap, C.woodDark);
      for (const x of [-0.3, 0.3]) { const nail = G.disc(0.008, 4); nail.translate(x, 0.08, 0.451); B.add(nail, C.iron); }
    });
  }
  // mounded soil (a low dome) with clods
  const soil = G.lathe([[0.001, 0.12], [0.2, 0.115], [0.34, 0.09], [0.4, 0.06], [0.4, 0.02]], 16); if (!stone) soil.scale(1.02, 1, 1.02);
  B.add(soil, (p, n, o) => o.set('#6b5546').multiplyScalar(0.9 + 0.16 * nz(p.x * 16, p.z * 16)));
  B.at([0, 0.1, 0], 0, () => flowerPatch(B, { w: 0.68, d: 0.68, n: 20, colors: pal }));
  // a little painted plant marker stake
  B.at([0.24, 0.1, 0.26], -0.3, () => {
    const st = G.box(0.018, 0.2, 0.012, 0); st.translate(0, 0.1, 0); B.add(st, C.woodLight);
    const bd = G.box(0.1, 0.06, 0.012, 0); bd.translate(0, 0.2, 0.004); B.add(bd, '#fff6e6');
    const dot = blossomGeo(0.018); dot.rotateX(PI / 2); dot.translate(0, 0.2, 0.011); B.add(dot, pal[0]);
  });
  B.door.set(0, 0, 0.55);
  B.height = 0.6;
}

// radial lobes on a lathe: r *= 1 + amt * cos(n * angle) for vertices away from the axis (and optionally only in a
// height band)
function lobes(g, n, amt, y0 = -1e9, y1 = 1e9) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    if (Math.hypot(x, z) < 0.02 || y < y0 || y > y1) continue;
    const k = 1 + amt * Math.cos(n * Math.atan2(z, x));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Plaza fountain: a paved step ring, an eight-lobed basin with a carved bead and a coping of cut stones, a fluted
// pedestal with a lotus capital and a coin-strewn step, a lotus-petal upper bowl spilling six arcs from its petal
// tips, a pink lotus bud spout on top; lily pads, a lotus flower, koi and drifting petals in the pool.
export function fountain(B) {
  const rr = lrng(B), S0 = col(STONES[0]), S3 = col(STONES[3]), pale = col('#f0e8e2'), shadowS = col('#a89aa8');
  // paved step ring (alternating cut stones)
  const step = G.cyl(0.99, 1.0, 0.06, 32); step.translate(0, 0.03, 0);
  B.add(faceColors(step, (p, n, o, c) => { const s = Math.floor(((Math.atan2(c.z, c.x) / TAU) + 1) * 20) % 2; o.copy(s ? S0 : S3).multiplyScalar(n.y > 0.5 ? 1.02 : 0.86); }), null);
  // basin: foot bevel, wall, bead, flared coping with a rounded lip -- lobed into eight scallops
  const R = 0.88; // coping top at 0.37, lip out to ~0.94: villagers sit on it (villageLife RIM_TOP / rim radius)
  const basin = G.lathe([[R - 0.02, 0.06], [R + 0.01, 0.09], [R - 0.02, 0.12], [R - 0.03, 0.22], [R + 0.005, 0.24], [R - 0.02, 0.265], [R + 0.03, 0.29], [R + 0.06, 0.335], [R + 0.04, 0.37], [R - 0.07, 0.37], [R - 0.09, 0.35], [R - 0.09, 0.28]], 40);
  lobes(basin, 8, 0.035);
  B.add(basin, (p, n, o) => {
    const a = Math.atan2(p.z, p.x), lobe = Math.cos(a * 8), rad = Math.hypot(p.x, p.z);
    o.copy(S0).lerp(shadowS, clamp(-n.y * 0.8 + 0.1)).multiplyScalar(0.93 + 0.08 * lobe);
    if (p.y > 0.23 && p.y < 0.25 && rad > R - 0.04) o.copy(pale); // carved bead
    if (p.y > 0.28) { // coping stones with seams
      const u = ((a / TAU + 1) * 16) % 1;
      o.copy(pale).multiplyScalar(n.y > 0.6 ? 1.0 : 0.9);
      if (u < 0.06 || u > 0.94) o.multiplyScalar(0.78);
    }
    if (p.y < 0.1) o.multiplyScalar(0.9);
  });
  const water = G.disc(R - 0.08, 32); water.rotateX(-PI / 2); water.translate(0, 0.31, 0); B.add(water, '#6ac4e4', 'water');
  // pedestal: coin step, fluted column, lotus capital
  const plat = G.cyl(0.3, 0.33, 0.07, 16); plat.translate(0, 0.35, 0); B.add(plat, (p, n, o) => o.copy(S3).multiplyScalar(n.y > 0.5 ? 1 : 0.88));
  const col0 = G.lathe([[0.2, 0.38], [0.2, 0.42], [0.15, 0.46], [0.13, 0.62], [0.12, 0.76], [0.15, 0.8], [0.19, 0.84], [0.001, 0.86]], 16);
  lobes(col0, 8, 0.12, 0.47, 0.75);
  B.add(col0, (p, n, o) => { o.copy(S0).multiplyScalar(0.86 + 0.14 * clamp(n.y + Math.cos(Math.atan2(p.z, p.x) * 8) * 0.5 + 0.5)); });
  for (let i = 0; i < 9; i++) { // tossed coins on the step, a couple stacked
    const a = rr() * TAU, d = 0.22 + rr() * 0.07, c = G.cyl(0.028, 0.028, 0.008, 7); c.rotateX((rr() - 0.5) * 0.3); c.translate(Math.cos(a) * d, 0.39 + (i % 4 === 0 ? 0.008 : 0), Math.sin(a) * d);
    B.add(c, (p, n, o) => o.set(n.y > 0.5 ? '#ffd860' : '#d8a030'));
  }
  // lotus bowl: petals swelling around the outside, their tips lifting the rim into points
  const bowl = G.lathe([[0.001, 0.84], [0.14, 0.84], [0.3, 0.9], [0.4, 0.98], [0.45, 1.05], [0.42, 1.07], [0.36, 1.05], [0.001, 1.0]], 36);
  { const p = bowl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), rad = Math.hypot(x, z); if (rad < 0.1) continue;
      const pet = Math.pow(Math.abs(Math.cos(Math.atan2(z, x) * 6)), 3), t = clamp((y - 0.86) / 0.2) * clamp((rad - 0.36) * 12);
      const k = 1 + 0.06 * pet * t; p.setX(i, x * k); p.setZ(i, z * k); p.setY(i, y + 0.045 * pet * t * t);
    }
    bowl.computeVertexNormals(); }
  B.add(bowl, (p, n, o) => { const pet = Math.abs(Math.cos(Math.atan2(p.z, p.x) * 6)); o.copy(S0).lerp(pale, pet * clamp((p.y - 0.86) * 4)).lerp(shadowS, clamp(-n.y * 0.7)); if (pet < 0.2 && p.y > 0.9 && n.y < 0.6) o.multiplyScalar(0.84); });
  const w2 = G.disc(0.37, 24); w2.rotateX(-PI / 2); w2.translate(0, 1.035, 0); B.add(w2, '#6ac4e4', 'water');
  // lotus bud spout: a ring of opening petals around a pink bud
  const bud = G.lathe([[0.001, 0], [0.05, 0.02], [0.085, 0.07], [0.08, 0.13], [0.045, 0.2], [0.001, 0.25]], 12); lobes(bud, 6, 0.1); bud.translate(0, 1.03, 0);
  B.add(bud, (p, n, o) => o.set('#ffe8f0').lerp(col('#ff8fb8'), clamp((p.y - 1.08) * 5)).multiplyScalar(0.9 + 0.12 * Math.abs(Math.cos(Math.atan2(p.z, p.x) * 3))));
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU + 0.5, pg = G.sph(0.07, 6, 4); pg.scale(0.55, 0.18, 1); pg.translate(0, 0, 0.07); pg.rotateX(-0.55); pg.rotateY(a); pg.translate(0, 1.06, 0);
    B.add(pg, (p, n, o) => o.set('#fff0f6').lerp(col('#ff9cc4'), clamp((Math.hypot(p.x, p.z) - 0.06) * 12)));
  }
  // falling water arcs from the six petal tips + central jet (scrolling jet material)
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; const r = 0.47 + t * 0.24, y = 1.08 + 0.04 * Math.sin(t * PI) - t * t * 0.77; pts.push({ p: V(Math.cos(a) * r, y, Math.sin(a) * r), r: 0.026 + t * 0.016 }); }
    B.add(tube(pts, 5, false), '#c8f0ff', 'jet');
  }
  const jp = []; for (let i = 0; i <= 4; i++) { const t = i / 4; jp.push({ p: V(0, 1.27 + t * 0.34, 0), r: 0.03 * (1 - t * 0.55) }); }
  B.add(tube(jp, 6, false), '#e0f8ff', 'jet');
  B.anim({ p: [0, 1.62, 0], kind: 'pulse', speed: 5, amp: 0.25 }, () => { const cap = G.sph(0.065, 8, 6); B.add(cap, '#e8faff', 'jet'); });
  B.anim({ p: [0, 0.32, 0], kind: 'spin', axis: [0, 1, 0], speed: 0.4 }, () => {
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const ring = G.torus(0.08, 0.012, 3, 10); ring.rotateX(PI / 2); ring.translate(Math.cos(a) * 0.71, 0, Math.sin(a) * 0.71); B.add(ring, '#e8faff', 'jet'); }
  });
  // pool life: koi (body, fan tail, fins, calico patches), notched lily pads, a lotus flower, drifting petals
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 1.1, d = 0.5 + (i % 2) * 0.05, yaw = -a - PI / 2 + (rr() - 0.5) * 0.6;
    B.at([Math.cos(a) * d, 0.305, Math.sin(a) * d], yaw, () => {
      const body = G.sph(0.05, 8, 5); body.scale(0.8, 0.45, 2); B.add(body, (p, n, o) => { o.set('#fff6ea'); if (i !== 1 && Math.sin(p.z * 60 + i) > -0.2) o.set(i ? '#ff6a3a' : '#ff8a3a'); if (i === 1 && p.z > 0.02) o.set('#ff5a3a'); });
      const tail = G.sph(0.045, 6, 3); tail.scale(1.1, 0.12, 0.7); tail.translate(0, 0, -0.12); B.add(tail, i === 1 ? '#fff6ea' : '#ff9a5a');
      for (const sx of [-1, 1]) { const f = G.sph(0.022, 5, 3); f.scale(1.3, 0.15, 0.8); f.translate(sx * 0.05, -0.005, 0.03); B.add(f, '#ffb080'); }
    });
  }
  const pads = [[0.35, 0.58, 0.11], [2.6, 0.62, 0.09], [4.3, 0.55, 0.1], [5.2, 0.63, 0.08]];
  pads.forEach(([a, d, r], i) => {
    const g = new THREE.CircleGeometry(r, 12, 0.3, TAU - 0.6); g.rotateX(-PI / 2); g.rotateY(rr() * TAU); g.translate(Math.cos(a) * d, 0.315, Math.sin(a) * d);
    B.add(g, (p, n, o) => o.set('#5aa84a').lerp(col('#8ccf6a'), clamp(1 - Math.hypot(p.x - Math.cos(a) * d, p.z - Math.sin(a) * d) / r)));
    if (i === 0) {
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      for (let l = 0; l < 2; l++) { const f = blossomGeo(l ? 0.045 : 0.07, 8, 0.4, true); f.rotateY(l * 0.4); f.translate(cx, 0.33 + l * 0.02, cz); B.add(f, (p, n, o) => o.set(l ? '#fff0f6' : '#ff9cc4').lerp(col('#ffffff'), clamp(1 - Math.hypot(p.x - cx, p.z - cz) / 0.07) * 0.4)); }
      const eye = G.cyl(0.015, 0.018, 0.02, 6); eye.translate(cx, 0.355, cz); B.add(eye, '#ffd84a');
    }
  });
  for (let i = 0; i < 10; i++) { const a = rr() * TAU, d = 0.3 + rr() * 0.45, pet = G.disc(0.022, 5); pet.scale(1.4, 1, 1); pet.rotateX(-PI / 2); pet.rotateY(rr() * TAU); pet.translate(Math.cos(a) * d, 0.313, Math.sin(a) * d); B.add(pet, B.pick(['#ffc4dc', '#ffb0cc', '#ffe0ec'])); }
  for (const [x, z] of [[-0.85, 0.85], [0.85, -0.85]]) B.at([x, 0, z], 0, () => pot(B, { r: 0.12, plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
  B.door.set(0, 0, 1.1);
  B.height = 1.9;
}

// Sakura planter: a stone box on a plinth with a recessed carved panel on each face, a capping band with corner
// blocks, moss creeping up from the foot, dark soil with a moss patch; the little sakura and its petals
export function sakuraPlanter(B) {
  const plinth = G.box(0.84, 0.06, 0.84, 0.02); plinth.translate(0, 0.03, 0); B.add(plinth, STONES[2]);
  const box = G.box(0.76, 0.3, 0.76, 0.05); box.translate(0, 0.19, 0);
  B.add(box, (p, n, o) => { o.set(STONES[0]); if (n.y > 0.7) o.set('#e8e0dc'); if (p.y < 0.12 && n.y < 0.5 && nz(p.x * 12 + p.z * 12, p.y * 20) > -0.1) o.lerp(col('#7cae5a'), 0.55); });
  for (let s = 0; s < 4; s++) B.at([0, 0, 0], s * PI / 2, () => { // recessed panel: a darker inset with a pale frame
    const pn = G.box(0.52, 0.16, 0.012, 0); pn.translate(0, 0.19, 0.382); B.add(pn, (p, n, o) => o.set(STONES[2]).multiplyScalar(n.z > 0.5 ? 0.92 : 1.05));
    const fr = G.box(0.58, 0.02, 0.016, 0); fr.translate(0, 0.28, 0.384); B.add(fr, '#ece4de');
    const fb = G.box(0.58, 0.02, 0.016, 0); fb.translate(0, 0.1, 0.384); B.add(fb, '#ece4de');
    const mk = blossomGeo(0.04, 5, 0.45); mk.rotateX(PI / 2); mk.translate(0, 0.19, 0.39); B.add(mk, '#f4e8e8');
  });
  const band = G.box(0.84, 0.06, 0.84, 0.02); band.translate(0, 0.36, 0); B.add(band, STONES[2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const cb = G.box(0.12, 0.08, 0.12, 0.02); cb.translate(sx * 0.39, 0.37, sz * 0.39); B.add(cb, STONES[3]); }
  const soil = G.box(0.68, 0.04, 0.68, 0); soil.translate(0, 0.39, 0); B.add(soil, (p, n, o) => { o.set('#6b5546').multiplyScalar(0.9 + 0.15 * nz(p.x * 16, p.z * 16)); if (nz(p.x * 5 + 3, p.z * 5) > 0.35) o.set('#7cae5a'); });
  B.at([0, 0.4, 0], 0, () => tree(B, { kind: 'sakura', s: 0.58 }));
  for (let i = 0; i < 6; i++) { const pet = G.disc(0.03, 5); pet.rotateX(-PI / 2); pet.translate(B.rand(-0.3, 0.3), 0.415, B.rand(-0.3, 0.3)); B.add(pet, '#ffc4dc'); }
  // fallen petals drifted onto the pavers around the box, thickest downwind
  for (let i = 0; i < 18; i++) {
    const a = B.rand(0, TAU), d = B.rand(0.48, 0.95), pet = G.disc(0.034, 5); pet.scale(1.4, 1, 1); pet.rotateX(-PI / 2); pet.rotateY(B.rand(0, TAU));
    pet.translate(Math.cos(a) * d + 0.12, 0.012, Math.sin(a) * d + 0.1); B.add(pet, B.pick(['#ffc4dc', '#ffb0cc', '#ffe0ec']));
  }
  B.door.set(0, 0, 0.55);
  B.height = 2.0;
}

// Mini torii: flagstone base with moss in the joints, the gate, a pair of kitsune on little plinths (sitting body,
// head with a snout, red-lined ears, bushy tail, red bib), an offering cup and a pinwheel-bright shide
export function miniTorii(B) {
  const base = G.box(0.9, 0.06, 0.7, 0.03); base.translate(0, 0.03, 0);
  B.add(base, (p, n, o) => { o.set(STONES[1]); if (n.y > 0.5) { const u = Math.abs(((p.x + 0.45) / 0.3) % 1 - 0.5), w = Math.abs(((p.z + 0.35) / 0.35) % 1 - 0.5); if (u > 0.46 || w > 0.46) o.lerp(col('#7cae5a'), 0.6); } });
  B.at([0, 0.06, 0.05], 0, () => torii(B, { w: 0.62, h: 0.85, bases: true }));
  for (const sx of [-1, 1]) B.at([sx * 0.3, 0.06, -0.24], sx * 0.35, () => {
    const pl = G.box(0.15, 0.08, 0.15, 0.02); pl.translate(0, 0.04, 0); B.add(pl, STONES[3]);
    const body = G.sph(0.06, 8, 6); body.scale(0.85, 1.15, 0.9); body.translate(0, 0.14, 0); B.add(body, '#fff6ea');
    const head = G.sph(0.045, 8, 6); head.translate(0, 0.24, 0.012); B.add(head, '#fff6ea');
    const snout = G.cone(0.022, 0.05, 6); snout.rotateX(PI / 2); snout.translate(0, 0.232, 0.06); B.add(snout, '#fff6ea');
    const nose = G.sph(0.008, 4, 3); nose.translate(0, 0.232, 0.085); B.add(nose, C.ink);
    for (const s of [-1, 1]) {
      const ear = G.cone(0.018, 0.05, 4); ear.rotateZ(-s * 0.25); ear.translate(s * 0.025, 0.285, 0.005); B.add(ear, (p, n, o) => o.set(n.z > 0.3 ? '#ff8a8a' : '#fff6ea'));
      const eye = G.box(0.018, 0.005, 0.005, 0); eye.rotateZ(s * 0.35); eye.translate(s * 0.02, 0.25, 0.05); B.add(eye, C.red);
    }
    const tail = tube([{ p: V(0, 0.09, -0.05), r: 0.03 }, { p: V(sx * -0.03, 0.15, -0.09), r: 0.035 }, { p: V(sx * -0.02, 0.24, -0.08), r: 0.02 }], 6, true);
    B.add(tail, (p, n, o) => o.set(p.y > 0.22 ? '#ffd8a0' : '#fff6ea'));
    const bib = G.cone(0.05, 0.06, 8); bib.rotateX(PI); bib.scale(1, 1, 0.7); bib.translate(0, 0.18, 0.02); B.add(bib, C.red);
  });
  const cup = G.cyl(0.03, 0.022, 0.035, 8); cup.translate(0, 0.078, -0.2); B.add(cup, '#fff6ea');
  const sake = G.disc(0.026, 8); sake.rotateX(-PI / 2); sake.translate(0, 0.094, -0.2); B.add(sake, '#e8f4ff');
  B.door.set(0, 0, 0.55);
  B.height = 1.3;
}

// Koi statue: a carved octagonal pedestal (base mouldings, a band of wave scallops, moss at the foot), a crest of
// curling wave tongues with foam tips around the leaping koi
export function koiStatue(B) {
  const ped = G.lathe([[0.001, 0], [0.38, 0], [0.4, 0.05], [0.37, 0.08], [0.31, 0.11], [0.3, 0.14], [0.28, 0.2], [0.27, 0.44], [0.3, 0.46], [0.34, 0.5], [0.33, 0.53], [0.001, 0.53]], 8);
  lobes(ped, 8, 0.02, 0.1, 0.5);
  B.add(ped, (p, n, o) => {
    o.set(STONES[1]); if (n.y > 0.8) o.set('#e0d8d4');
    if (p.y > 0.24 && p.y < 0.4) { const a = Math.atan2(p.z, p.x), w = Math.sin(a * 8 + p.y * 30) * 0.5 + 0.5; o.lerp(col('#9ab8c8'), 0.25 * w); } // carved waves, faint blue wash
    if (p.y < 0.1 && nz(p.x * 10, p.z * 10) > 0) o.lerp(col('#7cae5a'), 0.6);
  });
  // splash crown: a thin sheet of water flaring up around the koi into eight points, each flicking a droplet
  const pool = G.cyl(0.3, 0.3, 0.04, 16); pool.translate(0, 0.55, 0); B.add(pool, '#6ac4e4', 'water');
  const crown = G.lathe([[0.2, 0.55], [0.17, 0.6], [0.19, 0.67], [0.26, 0.73], [0.29, 0.75], [0.25, 0.74], [0.17, 0.67], [0.15, 0.6], [0.16, 0.55]], 32);
  { const p = crown.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.66) continue; p.setY(i, y + 0.07 * Math.pow(Math.abs(Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 4)), 4) * clamp((y - 0.66) * 12)); } crown.computeVertexNormals(); }
  B.add(crown, (p, n, o) => o.set('#6ac4e4').lerp(col('#e8f8ff'), clamp((p.y - 0.64) * 7)));
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, d = G.sph(0.022, 5, 4); d.scale(1, 1.3, 1); d.translate(Math.cos(a) * 0.33, 0.87 + (k % 2) * 0.03, Math.sin(a) * 0.33); B.add(d, '#f0faff'); }
  for (let i = 0; i < 5; i++) { const f = G.sph(0.03, 6, 5); f.translate(B.rand(-0.24, 0.24), 0.6 + B.rand(0, 0.03), B.rand(-0.24, 0.24)); B.add(f, '#f4fbff'); }
  // leaping koi: plump arched body, calico patches, fins and a fan tail
  const R = [0.035, 0.06, 0.085, 0.105, 0.115, 0.118, 0.112, 0.1, 0.08, 0.05];
  const pts = R.map((r, i) => { const t = i / (R.length - 1); return { p: V(0, 0.62 + t * 0.72, -0.14 + Math.sin(t * PI * 0.9) * 0.2 - t * 0.02), r }; });
  B.add(tube(pts, 10, true), (p, n, o) => {
    o.set('#fff8ee');
    const patch = Math.sin(p.y * 13 + 1.2) * Math.cos(p.z * 9 - 0.5) + (n.x > 0 ? 0.25 : -0.1);
    if (patch > 0.2) o.set('#ff7a3a');
    if (p.y > 1.22 && n.z < 0.3) o.set('#ff5a2a');
  });
  const head = pts[R.length - 2].p, tailP = pts[0].p;
  for (const sx of [-1, 1]) {
    const e = G.sph(0.028, 6, 5); e.translate(sx * 0.075, head.y + 0.03, head.z + 0.06); B.add(e, '#2a2230');
    const hl = G.sph(0.01, 4, 3); hl.translate(sx * 0.082, head.y + 0.045, head.z + 0.08); B.add(hl, '#ffffff');
    const fin = G.sph(0.08, 8, 5); fin.scale(0.2, 0.55, 1); fin.rotateX(0.6); fin.rotateZ(sx * 0.5); fin.translate(sx * 0.12, pts[6].p.y - 0.05, pts[6].p.z + 0.02); B.add(fin, '#ffb080');
  }
  const mouth = G.torus(0.028, 0.012, 4, 8); mouth.rotateX(-0.4); mouth.translate(0, head.y + 0.1, head.z + 0.05); B.add(mouth, '#ff9a80');
  const dorsal = G.sph(0.12, 8, 5); dorsal.scale(0.12, 0.6, 1); dorsal.rotateX(-0.9); dorsal.translate(0, pts[5].p.y, pts[5].p.z - 0.11); B.add(dorsal, '#ff8a5a');
  for (const sx of [-1, 1]) { const lobe = G.sph(0.12, 8, 5); lobe.scale(0.12, 1, 0.55); lobe.rotateX(sx * 0.5 + 0.2); lobe.translate(0, tailP.y - 0.08, tailP.z + sx * 0.07); B.add(lobe, '#ff7a3a'); }
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; B.at([Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 0, () => bush(B, { r: 0.1, n: 1, color: '#5aa84a', flowers: i % 2 ? ['#ff8fb0'] : null })); }
  B.door.set(0, 0, 0.55);
  B.height = 1.6;
}

export function lanternString(B) {
  const hP = 1.9;
  for (const x of [-0.9, 0.9]) {
    const p = G.cyl(0.04, 0.05, hP, 6); p.translate(x, hP / 2, 0); B.add(p, (pp, n, o) => o.set(C.woodDark).multiplyScalar(0.9 + 0.14 * nz(pp.y * 5, x)));
    const b = G.cyl(0.1, 0.13, 0.12, 6); b.translate(x, 0.06, 0); B.add(b, mossStone(STONES[1], 0.45));
    const b2 = G.cyl(0.065, 0.08, 0.06, 6); b2.translate(x, 0.15, 0); B.add(b2, STONES[0]);
    for (const y of [0.45, hP - 0.25]) { const band = G.cyl(0.052, 0.052, 0.03, 6, true); band.translate(x, y, 0); B.add(band, C.iron); }
    const gib = G.lathe([[0.001, 0], [0.055, 0.01], [0.065, 0.05], [0.035, 0.1], [0.01, 0.14], [0.001, 0.16]], 8); gib.translate(x, hP - 0.01, 0); B.add(gib, C.gold);
    const hook = G.torus(0.025, 0.007, 3, 6); hook.rotateY(PI / 2); hook.translate(x - Math.sign(x) * 0.05, hP - 0.08, 0); B.add(hook, C.iron);
    for (let k = 0; k < 3; k++) { const w = G.cyl(0.046, 0.046, 0.012, 6, true); w.translate(x, hP - 0.12 + k * 0.018, 0); B.add(w, '#d8c090'); } // rope wraps
  }
  const rope = []; for (let k = 0; k <= 12; k++) { const t = k / 12; rope.push({ p: V(-0.87 + 1.74 * t, hP - 0.08 - Math.sin(t * PI) * 0.22, 0), r: 0.012 }); }
  B.add(tube(rope, 4, false), (p, n, o) => o.set('#5a4040').lerp(col('#8a6a5a'), Math.sin(p.x * 90) > 0 ? 0.5 : 0));
  B.anim({ p: [0, hP - 0.1, 0], kind: 'swing', axis: [1, 0, 0], speed: 1.2, amp: 0.06 }, () => {
    const cols = [C.red, C.pink, '#ffd24a', C.red, '#fff0d0'];
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; B.at([-0.9 + 1.8 * t, 0.02 - Math.sin(t * PI) * 0.22, 0], 0, () => chochin(B, { r: 0.09, h: 0.18, cord: 0.05, color: cols[i] })); }
  });
  B.light([0, 1.4, 0.1], { color: '#ffb070', intensity: 2.4, radius: 4.5, flicker: 0.7 });
  B.door.set(0, 0, 0.5);
  B.height = 2.2;
}

// One fence section along x (-0.5..0.5). picket: posts with pyramid caps and gold knobs, back rails, round-topped
// white pickets with nail heads and a grubby foot; bamboo: noded canes lashed to split-bamboo rails with dark cord;
// rail: rustic split rails with bark on stout posts.
function fenceSection(B, style, h) {
  const rr = lrng(B), L = 1;
  const post = (x, color, cap = true) => {
    const p = G.box(0.1, h + 0.1, 0.1, 0.02); p.rotateY((rr() - 0.5) * 0.12); p.translate(x, (h + 0.1) / 2, 0);
    B.add(p, (pp, n, o) => { o.set(color).multiplyScalar(0.9 + 0.12 * nz(pp.y * 7, x * 5)); if (pp.y < 0.08) o.lerp(col('#6e8a4a'), 0.45); });
    if (cap) {
      const c = G.cone(0.085, 0.09, 4); c.rotateY(PI / 4); c.translate(x, h + 0.145, 0); B.add(c, shade(color, 0.85));
      const k = G.sph(0.025, 6, 4); k.translate(x, h + 0.2, 0); B.add(k, C.gold);
    }
  };
  if (style === 'picket') {
    const wood = C.woodMid;
    post(-L / 2, wood); post(L / 2, wood);
    for (const y of [h * 0.28, h * 0.72]) { const r = G.box(L - 0.08, 0.06, 0.035, 0); r.translate(0, y, -0.045); B.add(r, shade(wood, 0.95)); }
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.1 + i * (L - 0.2) / (n - 1), ph = h * (0.9 + 0.1 * Math.sin((i / (n - 1)) * PI)) + (rr() - 0.5) * 0.02;
      const pk = G.box(0.07, ph - 0.035, 0.022, 0); pk.translate(x, (ph - 0.035) / 2, -0.015);
      B.add(pk, (p, nn, o) => { o.set('#fff6ea').multiplyScalar(0.94 + 0.06 * clamp(nn.z)); if (p.y < 0.07) o.lerp(col('#a89070'), 0.5); });
      for (const s of [1, -1]) { const top = new THREE.CircleGeometry(0.035, 6, 0, PI); if (s < 0) top.rotateY(PI); top.translate(x, ph - 0.035, -0.015 + s * 0.011); B.add(top, '#fff6ea'); }
      for (const y of [h * 0.28, h * 0.72]) { const nl = G.disc(0.007, 4); nl.translate(x, y, -0.003); B.add(nl, C.iron); }
    }
  } else if (style === 'bamboo') {
    const cane = '#b8c870', node = '#8a9a50';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + (i + 0.5) * L / n, hh = h + (rr() - 0.5) * 0.06, g = G.cyl(0.042, 0.047, hh, 6); g.translate(x, hh / 2, 0);
      const ph = rr() * 0.3;
      B.add(g, (p, nn, o) => { o.set(cane).lerp(col('#e0e8a0'), clamp(nn.x * 0.3 + 0.2)); if (((p.y + ph) % 0.3) < 0.025) o.set(node); });
      const cutTop = G.disc(0.04, 6); cutTop.rotateX(-PI / 2); cutTop.translate(x, hh + 0.001, 0); B.add(cutTop, '#e8dca0');
    }
    for (const y of [h * 0.3, h * 0.75]) {
      const r = G.cyl(0.028, 0.028, L + 0.08, 6); r.rotateZ(PI / 2); r.translate(0, y, 0.055); B.add(r, (p, nn, o) => o.set('#9aaa58').lerp(col('#c8d890'), clamp(nn.y)));
      for (let i = 0; i < n; i += 2) { const x = -L / 2 + (i + 0.5) * L / n, t = G.box(0.02, 0.05, 0.1, 0); t.translate(x, y, 0.03); B.add(t, '#3a2a2a'); } // cord lashings
    }
  } else {
    const wood = '#8a6448';
    post(-L / 2, wood, false); post(L / 2, wood, false);
    for (const [y, sag] of [[h * 0.35, 0.02], [h * 0.8, 0.03]]) {
      const pts = [0, 1, 2, 3, 4].map(k => ({ p: V(-L / 2 - 0.06 + (L + 0.12) * k / 4, y - Math.sin(k / 4 * PI) * sag, 0.06), r: 0.035 }));
      B.add(tube(pts, 6, true), (p, n, o) => o.set(wood).lerp(col('#c89a70'), n.y > 0.6 ? 0.45 : 0).multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 40)));
    }
    for (const x of [-L / 2, L / 2]) { const top = G.disc(0.05, 6); top.rotateX(-PI / 2); top.translate(x, h + 0.101, 0); B.add(top, '#e8c08a'); }
  }
}
export function fence(B) {
  const v = B.variant;
  const style = ['picket', 'bamboo', 'rail', 'picket'][v % 4];
  fenceSection(B, style, style === 'bamboo' ? 0.8 : 0.55);
  if (v % 4 === 3) B.at([0.2, 0, 0.2], 0, () => bush(B, { r: 0.14, n: 1, flowers: ['#ff8fb0'] }));
  B.door.set(0, 0, 0.5);
  B.height = 0.9;
}

// Arched vermilion taiko bridge spanning z ∈ [-4.5, 4.5]; deck top = bridgeDeckHeight(z)
export function bridge(B) {
  const W = 2.0, half = BRIDGE.half, n = 36;
  const verm = C.vermilion;
  // deck planks following the arch
  for (let i = 0; i < n; i++) {
    const z0 = -half + i * (2 * half / n), z1 = z0 + 2 * half / n, zm = (z0 + z1) / 2;
    const y0 = bridgeDeckHeight(z0), y1 = bridgeDeckHeight(z1);
    const L = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0);
    const pl = G.box(W, 0.08, L - 0.015, 0); pl.rotateX(-ang); pl.translate(0, (y0 + y1) / 2 - 0.04, zm);
    const pc = B.pick([C.woodLight, '#d8a070', '#c8905e']);
    B.add(pl, (p, nn, o) => { o.set(pc); if (nn.y > 0.5) o.multiplyScalar(0.95 + 0.08 * Math.sin(p.x * 17 + i * 2.3)); }); // grain
    for (const sx of [-1, 1]) { // iron nail heads over the side beams
      const nl = G.disc(0.014, 4); nl.rotateX(-PI / 2 - ang); nl.translate(sx * (W / 2 - 0.08), (y0 + y1) / 2 + 0.001, zm); B.add(nl, '#4a4650');
    }
  }
  // side beams (curved) under the deck
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 18; i++) { const z = -half + i * (2 * half / 18); pts.push({ p: V(sx * (W / 2 - 0.02), bridgeDeckHeight(z) - 0.16, z), r: 0.09 }); }
    B.add(tube(pts, 6, false), verm);
  }
  // railings with giboshi posts
  const posts = 7;
  for (const sx of [-1, 1]) {
    const rail = [], rail2 = [];
    for (let i = 0; i <= 18; i++) { const z = -half + 0.15 + i * ((2 * half - 0.3) / 18); rail.push({ p: V(sx * (W / 2 + 0.02), bridgeDeckHeight(z) + 0.62, z), r: 0.045 }); rail2.push({ p: V(sx * (W / 2 + 0.02), bridgeDeckHeight(z) + 0.3, z), r: 0.03 }); }
    B.add(tube(rail, 6, false), verm); B.add(tube(rail2, 5, false), verm);
    for (let i = 0; i < posts; i++) {
      const z = -half + 0.15 + i * ((2 * half - 0.3) / (posts - 1)), y = bridgeDeckHeight(z);
      const p = G.box(0.1, 0.72, 0.1, 0.02); p.translate(sx * (W / 2 + 0.02), y + 0.32, z); B.add(p, verm);
      const gib = G.lathe([[0.001, 0], [0.07, 0], [0.08, 0.06], [0.05, 0.12], [0.001, 0.2]], 8); gib.translate(sx * (W / 2 + 0.02), y + 0.68, z); B.add(gib, C.gold);
    }
  }
  // pillars into the river + cross beams
  for (const z of [-2.6, -0.9, 0.9, 2.6]) {
    const y = bridgeDeckHeight(z) - 0.2;
    for (const sx of [-1, 1]) { const p = G.cyl(0.09, 0.11, y + 1.3, 8); p.translate(sx * (W / 2 - 0.15), (y - 1.3) / 2, z); B.add(p, (pp, nn, o) => o.set(pp.y < 0.05 ? '#5a4a44' : verm)); }
    const cb = G.box(W - 0.1, 0.1, 0.12, 0.02); cb.translate(0, y - 0.05, z); B.add(cb, verm);
  }
  // stone abutments + end steps down to ground
  for (const s of [-1, 1]) {
    const zE = s * (half - 0.3);
    const ab = G.box(W + 0.5, BRIDGE.end + 0.9, 0.9, 0.08); ab.translate(0, (BRIDGE.end - 0.9) / 2 - 0.02, zE);
    B.add(faceColors(ab, (p, n, o, c) => { // cut-stone courses with staggered joints, moss creeping over the top
      const row = Math.floor((c.y + 1) / 0.3), u = (Math.abs(n.x) > 0.7 ? c.z : c.x) / 0.45 + (row % 2) * 0.5;
      o.set(STONES[(row * 3 + Math.floor(u) * 5 + 99) % STONES.length]).multiplyScalar(0.9 + 0.1 * clamp(n.y));
      if (n.y > 0.7) o.lerp(col(C.moss), 0.35 + 0.3 * clamp(nz(c.x * 3, c.z * 3)));
    }), null);
    for (const sx of [-1, 1]) {
      const cap = G.cyl(0.14, 0.17, 0.95, 8); cap.translate(sx * (W / 2 + 0.2), BRIDGE.end + 0.2, zE); B.add(cap, verm);
      const top = G.lathe([[0.001, 0], [0.13, 0], [0.15, 0.08], [0.08, 0.18], [0.001, 0.28]], 8); top.translate(sx * (W / 2 + 0.2), BRIDGE.end + 0.67, zE); B.add(top, C.gold);
    }
    B.at([s * 0.0, 0, 0], 0, () => {});
  }
  // lanterns on the end posts
  for (const s of [-1, 1]) B.at([s * (W / 2 + 0.2), BRIDGE.end + 0.66, s * (half - 0.3) - s * 0.0], 0, () => {});
  B.light([W / 2 + 0.2, BRIDGE.peak + 0.8, 0], { color: '#ffb070', intensity: 2.4, radius: 5, flicker: 0.6 });
  B.at([W / 2 + 0.02, bridgeDeckHeight(0) + 0.66, 0], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.02 }));
  B.at([-W / 2 - 0.02, bridgeDeckHeight(0) + 0.66, 0], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.02 }));
  B.warpAmt = 0.02;
  B.door.set(0, 0, half + 0.3);
  B.height = BRIDGE.peak + 1.0;
}

export function chewyStatue(B) {
  // stepped plinth with a paw plaque
  const s1 = G.box(1.6, 0.2, 1.6, 0.05); s1.translate(0, 0.1, 0); B.add(s1, STONES[2]);
  const s2 = G.box(1.2, 0.28, 1.2, 0.05); s2.translate(0, 0.34, 0); B.add(s2, STONES[0]);
  const s3 = G.box(0.86, 0.36, 0.86, 0.05); s3.translate(0, 0.66, 0); B.add(s3, STONES[1]);
  B.at([0, 0.64, 0.435], 0, () => { const pl = G.box(0.5, 0.22, 0.03, 0.01); B.add(pl, C.gold); B.at([0, 0, 0.02], 0, () => symbol(B, 'paw', 0.17, { colors: ['#8a5a2c'] })); });
  // sitting dog sculpture (Chewy) in pale stone with a red scarf and a golden bone in its mouth
  const stone = '#e4dcd6', stoneS = '#cfc4c8';
  B.push([0, 0.84, 0.02]);
  const body = G.sph(0.3, 14, 10); body.scale(1, 1.15, 0.95); body.translate(0, 0.32, -0.04); B.add(body, stone);
  const chest = G.sph(0.2, 12, 8); chest.scale(1, 1.2, 0.8); chest.translate(0, 0.36, 0.14); B.add(chest, '#f4eee8');
  for (const sx of [-1, 1]) {
    const leg = G.sph(0.11, 10, 7); leg.scale(0.9, 1.5, 1); leg.translate(sx * 0.12, 0.12, 0.2); B.add(leg, stone);
    const paw = G.sph(0.09, 10, 7); paw.scale(1.1, 0.7, 1.3); paw.translate(sx * 0.13, 0.05, 0.28); B.add(paw, '#f4eee8');
    const hip = G.sph(0.15, 10, 7); hip.scale(1, 0.8, 1.2); hip.translate(sx * 0.2, 0.1, -0.1); B.add(hip, stone);
  }
  const head = G.sph(0.27, 16, 12); head.scale(1.05, 0.95, 1); head.translate(0, 0.78, 0.08); B.add(head, stone);
  const muzzle = G.sph(0.14, 12, 9); muzzle.scale(1.1, 0.8, 1); muzzle.translate(0, 0.7, 0.3); B.add(muzzle, '#f4eee8');
  const nose = G.sph(0.045, 8, 6); nose.scale(1.3, 0.9, 1); nose.translate(0, 0.76, 0.43); B.add(nose, '#5a4a4e');
  for (const sx of [-1, 1]) {
    const eye = G.sph(0.035, 8, 6); eye.scale(1, 1.2, 0.6); eye.translate(sx * 0.1, 0.85, 0.3); B.add(eye, '#5a4a4e');
    const ear = G.sph(0.13, 10, 7); ear.scale(0.55, 1.1, 0.35); ear.rotateZ(sx * 0.5); ear.translate(sx * 0.25, 0.82, 0.02); B.add(ear, stoneS);
    const cheek = G.sph(0.03, 6, 4); cheek.translate(sx * 0.16, 0.74, 0.3); B.add(cheek, '#ffb0b8');
  }
  const tail = tube([{ p: V(0, 0.12, -0.3), r: 0.06 }, { p: V(0.12, 0.2, -0.42), r: 0.055 }, { p: V(0.16, 0.36, -0.4), r: 0.045 }, { p: V(0.1, 0.46, -0.32), r: 0.03 }], 7, true); B.add(tail, stone);
  const scarf = G.torus(0.2, 0.05, 6, 16); scarf.rotateX(PI / 2 - 0.2); scarf.translate(0, 0.58, 0.07); B.add(scarf, C.red);
  const knot = G.box(0.1, 0.16, 0.05, 0.02); knot.rotateZ(0.3); knot.translate(0.12, 0.5, 0.24); B.add(knot, C.red);
  // golden bone held across the mouth
  B.at([0, 0.66, 0.36], 0, () => {
    const shaft = G.cyl(0.05, 0.05, 0.52, 10); shaft.rotateZ(PI / 2); B.add(shaft, (p, n, o) => o.set('#f4c04a').lerp(col('#fff0b0'), clamp(n.y * 0.6)));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const k = G.sph(0.075, 10, 8); k.translate(sx * 0.28, sy * 0.055, 0); B.add(k, (p, n, o) => o.set('#f4c04a').lerp(col('#fff4c0'), clamp(n.y * 0.5 + 0.2))); }
  });
  B.pop();
  // flower ring + corner shrubs
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const f = G.sph(0.055, 6, 4); f.translate(Math.cos(a) * 0.55, 0.51, Math.sin(a) * 0.55); B.add(f, B.pick(['#ff8fb0', '#ffffff', '#ffd24a'])); }
  for (const [x, z] of [[-0.7, 0.7], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7]]) B.at([x, 0.2, z], 0, () => bush(B, { r: 0.13, n: 1, color: '#5aa84a', flowers: ['#ff8fb0'] }));
  B.light([0, 1.9, 0.7], { color: '#ffd080', intensity: 2.2, radius: 5, flicker: 0.2 });
  B.door.set(0, 0, 1.1);
  B.height = 2.3;
}
