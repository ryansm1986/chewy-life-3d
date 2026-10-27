// The waterfall's rock garden (ROADMAP WB-1, the owner's pick: the "chunky toy diorama" mockup,
// tools/blender/work/codex/falls-bridge-style/concepts/option-C-falls.png): big candy-smooth boulders with plump moss
// caps lining the plunge pool's walls and the cliff, the stepped ledges the falls tumble down, a lantern island with
// stepping stones, a little rope-lashed lookout on the west shelf, lily pads with a lotus, cattails, ferns, pink
// flowers on the rim rocks and wisteria hanging over the falls. Static: one kit build (buildings/kit.js), a few merged
// meshes. The water itself (the curtains, the foam, the ripples) is waterfall.js.
import * as THREE from 'three';
import { Builder, instantiate, G, V, PI } from './buildings/kit.js';
import { mossLine, nz, leafGeo, blossomGeo } from './buildings/props.js';
import { puff, tube, paint, mergeVertices } from '../gfx/geom.js';
import { FALLS } from './layout.js';
import { mulberry32, TAU, clamp } from '../core/util.js';

const STONE = ['#8c8689', '#cdc5c0'], MOSS = '#5f9a33', MOSS_HI = '#b2d85a', MOSS_EDGE = '#3f6f2e';

// a candy-smooth stone with a plump moss cushion grown out of its top (like props.mossyStone): welded so it shades
// round, the moss lifted along the normal, a darker band where the cushion meets the stone and a sunny top
function mossyStone(g0, { amt = 0.45, sc = 1, seed = 0, lift = 0.05, stone = STONE } = {}) {
  g0.deleteAttribute('normal'); if (g0.attributes.uv) g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const m = amt > 0 ? clamp((mossLine(n.getY(i), p.getX(i), p.getZ(i), amt, sc, seed) + 0.03) * 9) : 0;
    w[i] = m; const k = m * m * (3 - 2 * m) * lift;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  g.computeVertexNormals();
  const s0 = new THREE.Color(stone[0]), s1 = new THREE.Color(stone[1]), mo = new THREE.Color(MOSS), hi = new THREE.Color(MOSS_HI), ed = new THREE.Color(MOSS_EDGE), t = new THREE.Color();
  return paint(g, (pp, nn, o, i) => {
    o.copy(s0).lerp(s1, clamp(nn.y * 0.55 + 0.35)).multiplyScalar(0.95 + 0.08 * nz(pp.x * 2.3 + seed, pp.y * 2.3));
    const m = w[i], up = clamp(nn.y * 1.25 - 0.2);
    // form shading painted in (the toon ramp flattens it): a dark rim, mid moss on the shoulders, a sunny crown
    t.copy(ed).lerp(mo, clamp(up * 2.2)).lerp(hi, clamp(up * 1.8 - 0.75)).multiplyScalar(0.93 + 0.12 * nz(pp.x * 4.1, pp.z * 4.1));
    t.lerp(ed, clamp(1 - m * 1.6) * 0.6); // (the cushion's edge)
    o.lerp(t, clamp(m * 1.4));
  });
}
const WOOD = '#c98f5e', WOOD_D = '#8f6a52', ROPE = '#cba96b';

export function buildFallsGarden(world) {
  const T = world.terrain, H = (x, z) => T.heightAt(x, z), rnd = mulberry32(6060);
  const B = new Builder(6060); B.warpAmt = 0; B.jitter = 0;
  const cols = []; // [x, z, r] colliders where a rock stands on walkable ground
  const rock = (x, y, z, r, { sq = 0.8, moss = 0.45, stretch = 1.12, yaw = rnd() * TAU, seed = Math.floor(rnd() * 1e4) } = {}) => {
    const g = puff(V(0, 0, 0), r, { detail: r > 0.7 ? 3 : 2, noise: 0.08, squash: sq, seed });
    g.scale(stretch, 1, 1 / Math.sqrt(stretch)); g.rotateY(yaw); g.translate(x, y, z);
    B.add(mossyStone(g, { amt: moss * 0.8, sc: 0.6 / r, seed, lift: r * 0.08 }), null);
    if (H(x, z) > 0.2 && y + r * sq > H(x, z) + 0.5) cols.push([x, z, r * 0.85]);
    return { x, y, z, r, top: y + r * sq };
  };
  const tops = []; // rim rocks to dress with flowers
  // ---- the stepped ledges: a flat-topped rounded block under each lip (the curtain falls down its face), flanked by
  // staggered boulders
  const S = FALLS.steps, X = FALLS.x;
  S.forEach((s, i) => {
    const X = s.x ?? FALLS.x, below = i < S.length - 1 ? S[i + 1].y : -1.1, h = s.y - below, d = 1.7;
    const g = G.box(s.w + 1.1, h, d, 0.34); g.translate(X, below + h / 2, s.z - d / 2 + 0.02);
    B.add(mossyStone(g, { amt: 0, seed: 70 + i }), null); // (bare: the shelf water covers its top)
    for (const sx of [-1, 1]) {
      const r = 0.95 + rnd() * 0.25;
      tops.push(rock(X + sx * (s.w / 2 + 0.75 + rnd() * 0.2), s.y - r * 0.35, s.z - 0.35 + rnd() * 0.2, r, { moss: 0.55 }));
    }
  });
  // the stream above the lip runs between two shoulder boulders
  for (const sx of [-1, 1]) { tops.push(rock(X + sx * 2.3, 6.2, S[0].z - 0.6, 1.25, { moss: 0.6 })); rock(X + sx * 2.9, 6.6, S[0].z - 2.3, 1.1, { moss: 0.6 }); }
  // ---- the north wall either side of the falls: three courses stepping up the cliff
  for (const sx of [-1, 1]) {
    tops.push(rock(X + sx * 3.9, 0.15, 27.9, 1.6, { moss: 0.35 }));
    rock(X + sx * 3.0, 0.2, 26.6, 1.3, { moss: 0.3 });
    tops.push(rock(X + sx * 4.6, 2.5, 26.4, 1.5, { moss: 0.5 }));
    tops.push(rock(X + sx * 4.4, 4.6, 25.1, 1.35, { moss: 0.55 }));
    tops.push(rock(X + sx * 6.2, 4.9, 26.0, 1.4, { moss: 0.6 }));
    rock(X + sx * 6.4, 2.6, 27.6, 1.3, { moss: 0.5 });
    tops.push(rock(X + sx * 3.1, 5.3, 24.3, 1.15, { moss: 0.55 })); // (the cliff's face beside the top step)
  }
  // ---- the side walls down the pool: a course at the waterline and one up the bank, marching south
  const waterline = (z, sx) => { let x = X; while (Math.abs(x - X) < 9 && H(x, z) < 0) x += sx * 0.1; return x; };
  const upTo = (z, sx, h) => { let x = waterline(z, sx); while (Math.abs(x - X) < 12 && H(x, z) < h) x += sx * 0.1; return x; };
  for (const sx of [-1, 1]) {
    for (let z = 29.2 + rnd() * 0.6; z < 44; z += 1.9 + rnd() * 0.7) {
      const k = clamp((z - 29) / 15), r = 1.45 - k * 0.45 + rnd() * 0.25;
      const xw = waterline(z, sx);
      rock(xw - sx * 0.15, -0.35 + r * 0.15, z, r, { moss: 0.35 });
      const xb = upTo(z + 0.9, sx, 1.9), hb = H(xb, z + 0.9);
      if (hb > 1.2) tops.push(rock(xb + sx * 0.2, hb - 0.55, z + 0.9, r * 0.85 + 0.1, { moss: 0.45 }));
    }
  }
  // ---- the lantern island in the north-west of the pool, and the stepping stones to it from the west bank
  const isl = { x: 96.9, z: 30.4 };
  rock(isl.x, -0.25, isl.z, 1.25, { sq: 0.5, moss: 0.4, stretch: 1.3, yaw: 0.6 });
  rock(isl.x + 0.9, -0.2, isl.z + 0.6, 0.5, { sq: 0.6, moss: 0.3 }); rock(isl.x - 0.7, -0.25, isl.z + 0.8, 0.42, { sq: 0.6, moss: 0.2 });
  squatLantern(B, isl.x - 0.05, 0.36, isl.z - 0.05);
  B.light([isl.x, 1.0, isl.z], { color: '#ffc070', intensity: 2.2, radius: 5, flicker: 0.5 });
  [[95.85, 33.4], [96.15, 32.35], [96.55, 31.4]].forEach(([x, z], i) => {
    const g = puff(V(0, 0, 0), 0.42 - i * 0.03, { detail: 2, noise: 0.1, squash: 0.42, seed: 300 + i }); g.scale(1.2, 1, 1); g.rotateY(i * 0.9); g.translate(x, -0.02, z);
    B.add(mossyStone(g, { amt: 0.12, sc: 3, seed: 300 + i, lift: 0.02 }), null);
  });
  // ---- the lookout: a little plank deck on the west shelf, over the pool, posts lashed with rope and a sagging rope rail
  const deck = { x: 93.15, z: 28.4 }; deck.top = lookout(B, world, deck.x, deck.z);
  // ---- lily pads with a lotus in the south-west shallows, cattails and ferns on the west bank
  const padAt = [[96.6, 37.2, 0.5], [97.4, 38.0, 0.38], [96.4, 38.6, 0.44], [97.9, 36.6, 0.3], [102.9, 34.8, 0.4], [103.4, 35.8, 0.3], [97.3, 33.0, 0.45], [98.2, 33.5, 0.32]];
  padAt.forEach(([x, z, r], i) => lilyPad(B, x, z, r, i * 1.3, i === 0 || i === 6));
  for (const [x, z] of [[95.4, 35.6], [95.6, 39.2], [104.3, 37.4]]) cattails(B, x, Math.max(-0.1, H(x, z)), z, rnd);
  for (const t of tops) if (rnd() < 0.8) flowers(B, t, rnd);
  for (const [x, z] of [[92.4, 31.6], [92.0, 34.4], [108.2, 31.0], [107.6, 34.6], [93.2, 30.2], [91.6, 26.6], [94.0, 26.2], [107.0, 29.2], [106.4, 27.6], [93.6, 33.0]]) fern(B, x, H(x, z), z, rnd);
  for (const [x, z] of [[92.2, 27.4], [92.8, 32.6], [107.6, 32.4], [106.8, 30.4]]) flowers(B, { x, z, r: 0.5, top: H(x, z) + 0.02 }, rnd);
  cattails(B, isl.x - 0.95, 0.0, isl.z + 0.5, rnd);
  fern(B, isl.x + 0.55, 0.32, isl.z - 0.35, rnd);
  // ---- wisteria trailing over the cliff by the falls
  for (const [x, y, z, n] of [[97.3, 6.95, 23.6, 4], [102.9, 6.95, 23.6, 4], [96.6, 6.1, 25.0, 3], [103.5, 6.1, 25.0, 3], [94.6, 5.9, 26.4, 3], [105.7, 5.9, 26.6, 3]]) wisteria(B, x, y, z, n, rnd);

  const tpl = B.finish();
  const { group, glow } = instantiate(tpl);
  group.name = 'fallsGarden';
  world.scene.add(group);
  for (const l of tpl.lights) world.lightPool?.addSource({ pos: l.pos, color: l.color, intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly });
  for (const [x, z, r] of cols) world.collision?.addCircle(x, z, r);
  return { group, glow, deck, cols, tris: Object.values(tpl.geos).reduce((a, g) => a + g.attributes.position.count / 3, 0) };
}

// the lookout: a plank deck on the rim, its planks running out toward the pool; the two posts at the pool end are tall,
// lashed with rope and strung with a sagging rope rail; every post stands on the ground (the bank falls away under the
// front). Walkable: it joins world.decks.
function lookout(B, world, x, z) {
  const H = (px, pz) => world.terrain.heightAt(px, pz), L = 1.6, W = 1.24;
  const y = Math.max(H(x - L / 2, z - W / 2), H(x - L / 2, z + W / 2)) + 0.08, top = y + 0.36;
  for (let i = 0; i < 5; i++) { const p = G.box(L, 0.08, 0.235, 0.03); p.translate(x, y + 0.32, z - 0.5 + i * 0.25); B.add(p, (pp, n, o) => o.set(i % 2 ? WOOD : '#d79c68').multiplyScalar(n.y > 0.5 ? 1 : 0.82)); }
  for (const sz of [-1, 1]) { const b = G.box(L + 0.2, 0.12, 0.12, 0.03); b.translate(x, y + 0.22, z + sz * W / 2); B.add(b, WOOD_D); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + sx * (L / 2 - 0.05), pz = z + sz * W / 2, g0 = H(px, pz) - 0.12, tall = sx > 0, yt = tall ? top + 0.72 : top + 0.12;
    const p = G.cyl(0.075, 0.085, yt - g0, 8); p.translate(px, (yt + g0) / 2, pz); B.add(p, WOOD_D);
    if (tall) {
      for (let k = 0; k < 3; k++) { const r = G.torus(0.088, 0.028, 5, 10); r.rotateX(PI / 2); r.translate(px, top + 0.18 + k * 0.06, pz); B.add(r, ROPE); }
      const c = G.sph(0.095, 8, 6); c.translate(px, yt + 0.04, pz); B.add(c, '#7a5a46');
    }
  }
  const sag = (a, b, s) => tube([0, 1, 2, 3, 4, 5, 6].map(k => { const t = k / 6; return { p: a.clone().lerp(b, t).add(V(0, -Math.sin(t * PI) * s, 0)), r: 0.026 }; }), 5, false);
  const xf = x + L / 2 - 0.05, xb = x - L / 2 + 0.05;
  B.add(sag(V(xf, top + 0.6, z - W / 2), V(xf, top + 0.6, z + W / 2), 0.14), ROPE);
  for (const sz of [-1, 1]) B.add(sag(V(xf, top + 0.6, z + sz * W / 2), V(xb, top + 0.12, z + sz * W / 2), 0.08), ROPE);
  world.decks?.push({ x0: x - L / 2 - 0.05, z0: z - W / 2 + 0.05, x1: x + L / 2 - 0.12, z1: z + W / 2 - 0.05, h: () => top });
  return top;
}

// a squat toy stone lantern: a fat round base on three stubby legs, a boxy chamber with warm paper windows, a broad
// rounded roof with an upturned rim and a ball finial
function squatLantern(B, x, y, z) {
  const st = (p, n, o) => o.set('#b9b2b0').multiplyScalar(0.9 + 0.12 * clamp(n.y) + 0.06 * nz(p.x * 9, p.y * 9));
  const at = (g, dy) => { g.translate(x, y + dy, z); return g; };
  B.add(at(G.cyl(0.3, 0.34, 0.1, 12), 0.05), st);
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4, l = G.cyl(0.07, 0.085, 0.2, 7); l.translate(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17); B.add(at(l, 0.2), st); }
  B.add(at(G.cyl(0.27, 0.24, 0.08, 12), 0.33), st);
  B.add(at(G.box(0.36, 0.3, 0.36, 0.05), 0.52), st);
  for (const [dx, dz, ry] of [[0, 0.181, 0], [0.181, 0, PI / 2], [0, -0.181, 0], [-0.181, 0, PI / 2]]) {
    const w = G.plane(0.2, 0.17); w.rotateY(ry + (dz < 0 || dx < 0 ? PI : 0)); w.translate(x + dx, y + 0.53, z + dz); B.glow(w, '#ffd890', { flicker: 0.5 });
  }
  const roof = G.lathe([[0.001, 0.0], [0.2, 0.0], [0.42, 0.0], [0.46, 0.07], [0.43, 0.04], [0.33, 0.13], [0.16, 0.24], [0.001, 0.26]], 14); // (bottom to top, so it faces out)
  B.add(at(roof, 0.67), st);
  B.add(at(G.sph(0.08, 8, 6), 0.98), st);
  B.add(at(G.cyl(0.04, 0.05, 0.08, 8), 0.92), st);
}

// a big thick lily pad with a notch (a flattened disc, its rim turned up a touch), optionally a pink lotus on it
function lilyPad(B, x, z, r, rot, lotus) {
  const n = 18, notch = 0.35, pos = [];
  const pt = (a, k) => [Math.cos(a) * r * k, 0.05 * k * k, Math.sin(a) * r * k];
  for (let i = 0; i < n; i++) {
    const a0 = notch / 2 + (i / n) * (TAU - notch), a1 = notch / 2 + ((i + 1) / n) * (TAU - notch);
    pos.push(0, 0.04, 0, ...pt(a1, 1), ...pt(a0, 1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.rotateY(rot); g.translate(x, 0.0, z);
  B.add(g, (p, nn, o) => o.set('#5aa83c').lerp(new THREE.Color('#8fd05a'), clamp(Math.hypot(p.x - x, p.z - z) / r) * 0.6));
  const rim = G.torus(r * 0.985, 0.022, 4, 22, TAU - notch); rim.rotateX(PI / 2); rim.rotateY(-notch / 2 + rot); rim.translate(x, 0.045, z); // (the pad's thick edge)
  B.add(rim, '#4a8f34');
  if (lotus) {
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + ring * 0.45, pl = G.sph(0.08 - ring * 0.015, 6, 4); pl.scale(0.55, 0.35, 1.4); pl.translate(0, 0, 0.09);
      pl.rotateX(-0.6 - ring * 0.5); pl.rotateY(a); pl.translate(x + r * 0.15, 0.1 + ring * 0.03, z - r * 0.1);
      B.add(pl, (p, nn, o) => o.set('#ffc0d8').lerp(new THREE.Color('#ffffff'), clamp((p.y - 0.06) * 6)));
    }
    const c = G.sph(0.045, 8, 5); c.scale(1, 0.6, 1); c.translate(x + r * 0.15, 0.15, z - r * 0.1); B.add(c, '#ffd24a');
  }
}

// a clump of cattails: thick blades and brown seed heads on stalks
function cattails(B, x, y, z, rnd) {
  for (let i = 0; i < 6; i++) {
    const a = rnd() * TAU, d = rnd() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = 0.8 + rnd() * 0.45;
    const bl = leafGeo(h, 0.05, 0.3); bl.rotateZ(PI / 2 - 0.15 - rnd() * 0.3); bl.rotateY(rnd() * TAU); bl.translate(px, y, pz); B.add(bl, '#5f9e44', 'leaf');
    if (i % 2 === 0) {
      const st = G.cyl(0.012, 0.016, h, 4); st.translate(px, y + h / 2, pz); B.add(st, '#6a9a48', 'leaf');
      const hd = G.cyl(0.04, 0.04, 0.2, 7); hd.translate(px, y + h + 0.06, pz); B.add(hd, '#8a5a3a', 'leaf');
    }
  }
}
// a fern: arching fronds of leaf cards round a centre
function fern(B, x, y, z, rnd) {
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + rnd() * 0.4, L = 0.55 + rnd() * 0.2;
    const f = leafGeo(L, 0.09, 0.2); f.rotateZ(0.55 + rnd() * 0.2); f.rotateY(-a); f.translate(x, y + 0.05, z);
    B.add(f, i % 2 ? '#4c9b43' : '#62b04a', 'leaf');
  }
}
// pink toy flowers tucked into a rim rock's moss
function flowers(B, t, rnd) {
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = t.r * (0.15 + rnd() * 0.35), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, y = t.top + 0.02 - (d / t.r) * 0.25 * t.r;
    for (let k = 0; k < 3; k++) { const lf = leafGeo(0.16, 0.06, 0.3); lf.rotateZ(0.35); lf.rotateY(k * 2.1 + a); lf.translate(x, y, z); B.add(lf, '#4c9b43', 'leaf'); }
    const f = blossomGeo(0.13); f.rotateX(-PI / 2); f.translate(x, y + 0.08, z); B.add(f, rnd() < 0.7 ? '#ff9dc1' : '#ffffff', 'leaf');
    const c = G.sph(0.035, 6, 4); c.translate(x, y + 0.095, z); B.add(c, '#ffd24a', 'leaf');
  }
}
// wisteria: purple drops hanging from a rock's edge, each a chain of shrinking beads, light at the top
function wisteria(B, x, y, z, n, rnd) {
  for (let i = 0; i < n; i++) {
    const px = x + (rnd() - 0.5) * 1.1, pz = z + rnd() * 0.3, L = 0.55 + rnd() * 0.4;
    for (let k = 0; k < 7; k++) {
      const t = k / 6, b = G.sph(0.085 * (1 - t * 0.6), 6, 4);
      b.translate(px + Math.sin(k * 1.7) * 0.03, y - t * L, pz + Math.cos(k * 1.3) * 0.03);
      B.add(b, new THREE.Color('#d8b8ff').lerp(new THREE.Color('#9a6ad8'), t).getStyle(), 'leaf');
    }
    for (let k = 0; k < 3; k++) { const lf = leafGeo(0.22, 0.07, 0.3); lf.rotateZ(-0.4); lf.rotateY(k * 2.2 + i); lf.translate(px, y + 0.04, pz); B.add(lf, '#5aa14e', 'leaf'); }
  }
}
