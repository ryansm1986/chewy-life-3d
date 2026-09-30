// Reusable props: chochin & stone lanterns, barrels, crates, planters, bushes, little trees, bamboo,
// signboards, mailbox, benches, bells, torii, rocks, log piles... Local frame, ground at y=0.
import * as THREE from 'three';
import { puff, branch, tube, paint, mergeVertices } from '../../gfx/geom.js';
import { G, V, C, PI, shade, mixc, col, bar } from './kit.js';
import { roof, roundRoof } from './roofs.js';
import { symbol, flatSymbol } from './symbols.js';
import { STONES, FLOWERS, flowerBox } from './parts.js';
import { clamp, TAU, mulberry32, Noise } from '../../core/util.js';

// ------------------------------------------------------------------ detail helpers
// A prop's own random stream (one draw from the builder, so the caller's sequence moves by the same amount whatever
// the prop adds).
export const lrng = B => mulberry32((B.r() * 4294967296) >>> 0);
const _nz = new Noise(4177);
export const nz = (x, y) => _nz.n2(x, y);
const MOSS = col('#7cae5a'), MOSS_HI = col('#a8cc6a');
// colour per triangle: fn(vertexPos, faceNormal, out, faceCentroid) -- crisp planks, staves, panels
export function faceColors(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), o = new THREE.Color();
  const ctr = new THREE.Vector3(), fn3 = new THREE.Vector3(), v = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    ctr.set(0, 0, 0); fn3.set(0, 0, 0);
    for (let k = 0; k < 3; k++) { ctr.x += p.getX(f + k) / 3; ctr.y += p.getY(f + k) / 3; ctr.z += p.getZ(f + k) / 3; fn3.x += n.getX(f + k); fn3.y += n.getY(f + k); fn3.z += n.getZ(f + k); }
    fn3.normalize();
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, f + k); fn(v, fn3, o, ctr); c[(f + k) * 3] = o.r; c[(f + k) * 3 + 1] = o.g; c[(f + k) * 3 + 2] = o.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// mossy stone paint: patches of moss on the up-facing surfaces (noise-edged), a lighter lip where it catches the sun
export const mossStone = (base, amt = 0.5, sc = 7) => {
  const b = col(base);
  return (p, n, o) => {
    o.copy(b).multiplyScalar(0.94 + 0.08 * clamp(n.y + 0.3));
    if (amt <= 0) return;
    const m = (n.y - 0.6) * 0.8 + nz(p.x * sc + p.y * 3.1, p.z * sc - p.y * 2.3) * 0.6 - (0.55 - amt);
    if (m > 0) o.lerp(MOSS, clamp(m * 5) * 0.75).lerp(MOSS_HI, clamp(m * 2 - 0.4) * 0.3);
  };
};
// flat flower head in the XZ plane facing +y: a disc whose rim swells into `petals` rounded petals (notches pulled in
// to `pinch`); pointy = sharp lobes instead (maple leaves, stars)
export function blossomGeo(R, petals = 5, pinch = 0.5, pointy = false, per = pointy ? 2 : 3) {
  const g = new THREE.CircleGeometry(R, petals * per);
  const pp = g.attributes.position;
  for (let k = 1; k < pp.count; k++) {
    const u = ((k - 1) % per) / per; // 0 at a petal tip
    const f = pointy ? (u === 0 ? 1 : pinch) : pinch + (1 - pinch) * Math.pow(Math.abs(Math.cos(u * PI)), 0.5);
    pp.setXY(k, pp.getX(k) * f, pp.getY(k) * f);
  }
  g.rotateX(-PI / 2);
  return g;
}
// Moss cap draped over the up-facing part of a lumpy stone: the stone's own triangles where the (noisy) moss line
// allows, lifted a touch along their normals -- a raised, ragged-edged cushion that follows the rock exactly.
// moss line used by mossCap: > 0 where a face with up-component ny at (x, z) is mossy; stones paint a soft green
// halo just below it so the raised cap's edge melts into the rock
export const mossLine = (ny, x, z, amt, sc, seed) => ny - (0.98 - amt * 0.7) + nz(x * sc + seed, z * sc - seed * 1.7) * 0.25;
export function mossCap(geo, { amt = 0.5, lift = 0.025, sc = 3, seed = 0, color = MOSS, hi = MOSS_HI, center = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal, P = [], N = [], d = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    let ny = 0, cx = 0, cz = 0;
    for (let k = 0; k < 3; k++) { ny += n.getY(f + k) / 3; cx += p.getX(f + k) / 3; cz += p.getZ(f + k) / 3; }
    if (mossLine(ny, cx, cz, amt, sc, seed) <= 0) continue;
    for (let k = 0; k < 3; k++) {
      // lift along a smooth direction (radial from `center` when the stone is flat-shaded) so the cap has no cracks
      if (center) d.set(p.getX(f + k) - center.x, p.getY(f + k) - center.y, p.getZ(f + k) - center.z).normalize(); else d.set(n.getX(f + k), n.getY(f + k), n.getZ(f + k));
      P.push(p.getX(f + k) + d.x * lift, p.getY(f + k) + d.y * lift, p.getZ(f + k) + d.z * lift); N.push(n.getX(f + k), n.getY(f + k), n.getZ(f + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const c = col(color), h = col(hi);
  return paint(out, (pp, nn, o) => o.copy(c).lerp(h, clamp(nn.y * 0.9 - 0.2) * 0.55).multiplyScalar(0.9 + 0.14 * nz(pp.x * sc * 7, pp.z * sc * 7)));
}
// A soft mossy stone: the puff is welded so it shades round (no flat facets), the moss grows OUT of the stone as a
// raised cushion (vertices lifted along the smooth normal by the moss weight) and its edge fades into the stone colour,
// so there is no separate cap with a saw-tooth outline. Returns an indexed, painted geometry.
export function mossyStone(g0, { amt = 0.45, sc = 3, seed = 0, lift = 0.03, stone = ['#b0a8bc', '#d8d0d8'], moss = MOSS, hi = MOSS_HI } = {}) {
  g0.deleteAttribute('normal'); if (g0.attributes.uv) g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const m = amt > 0 ? clamp((mossLine(n.getY(i), p.getX(i), p.getZ(i), amt, sc, seed) + 0.04) * 12) : 0; // a clean cushion edge
    w[i] = m; const k = m * m * (3 - 2 * m) * lift;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  g.computeVertexNormals();
  const s0 = col(stone[0]), s1 = col(stone[1]), c = col(moss), h = col(hi), t = new THREE.Color();
  return paint(g, (pp, nn, o, i) => {
    o.copy(s0).lerp(s1, clamp(nn.y * 0.5 + 0.3)).multiplyScalar(0.94 + 0.1 * nz(pp.x * sc * 3 + seed, pp.y * sc * 3));
    t.copy(c).lerp(h, clamp(nn.y * 0.9 - 0.2) * 0.55).multiplyScalar(0.9 + 0.14 * nz(pp.x * sc * 7, pp.z * sc * 7));
    o.lerp(t, w[i]);
  });
}
// a diamond leaf lying along +x from the origin, folded along its midrib; normal ~ +y
export function leafGeo(L, W, fold = 0.35) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, L * 0.45, W * fold, W, L, 0, 0, L * 0.45, W * fold, -W], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}
// scatter leaves over a sphere-ish surface (centre c, radius r, squash sq) in the leaf bucket, tips out and down
export function leafScatter(B, r, c, R, n, colors, { sq = 1, size = 1, up = 0.25 } = {}) {
  const cc = colors.map(col);
  for (let i = 0; i < n; i++) {
    const u = -0.2 + r() * 1.15, th = r() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u));
    const d = V(s * Math.cos(th), u, s * Math.sin(th));
    const p = c.clone().add(V(d.x * R, d.y * R * sq, d.z * R).multiplyScalar(0.98 + r() * 0.14));
    const L = (0.1 + r() * 0.05) * size, g = leafGeo(L, L * 0.36);
    // tip points outward (and a bit down), blade tilted up toward the light
    g.rotateX((r() - 0.5) * 0.6); g.rotateZ(-0.35 - r() * 0.4 + up); g.rotateY(-th + (r() - 0.5) * 0.8);
    g.translate(p.x, p.y, p.z);
    const k = cc[Math.floor(r() * cc.length)];
    B.add(g, (pp, nn, o) => o.copy(k).multiplyScalar(0.9 + 0.2 * clamp(nn.y)), 'leaf');
  }
}

// Paper chochin lantern hanging with its top at local y=0 (so place it at the hook). Returns paper centre y.
export function chochin(B, { r = 0.17, h = 0.36, color = C.red, band = true, cord = 0 } = {}) {
  if (cord > 0) { const c = G.cyl(0.012, 0.012, cord, 4); c.translate(0, -cord / 2, 0); B.add(c, C.ink); }
  const y0 = -cord;
  const cap = G.cyl(r * 0.5, r * 0.56, 0.05, 10); cap.translate(0, y0 - 0.025, 0); B.add(cap, '#2a2226');
  const pts = [];
  const N = 10;
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const rr = r * (0.45 + 0.55 * Math.sin(t * PI)) * (1 + (k % 2 ? 0.035 : 0));
    pts.push([Math.max(0.001, rr), -t * h]);
  }
  const paper = G.lathe(pts, 12); paper.translate(0, y0 - 0.05, 0);
  const cc = col(color), dark = cc.clone().multiplyScalar(0.72), light = cc.clone().lerp(col('#fff0d0'), 0.25);
  const g = paper.index ? paper.toNonIndexed() : paper;
  const pp = g.attributes.position, cols = new Float32Array(pp.count * 3);
  for (let i = 0; i < pp.count; i++) {
    const t = (y0 - 0.05 - pp.getY(i)) / h;
    const c = (band && t > 0.42 && t < 0.58) ? light : dark.clone().lerp(cc, Math.sin(t * PI));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  B.glow(g, null, { flicker: 1, tint: 0.55 });
  const bot = G.cyl(r * 0.56, r * 0.5, 0.05, 10); bot.translate(0, y0 - 0.05 - h - 0.02, 0); B.add(bot, '#2a2226');
  const tas = G.cyl(0.015, 0.03, 0.12, 5); tas.translate(0, y0 - 0.05 - h - 0.1, 0); B.add(tas, C.gold);
  return y0 - 0.05 - h / 2;
}

// Hexagonal lantern roof (kasa): concave slopes sweeping out to upturned corners, a thick rim and a flat underside.
// Corner k sits at angle k/sides*TAU (local +x first). Returns indexed geometry, apex at y = H.
export function kasaGeo(R, H, { sides = 6, per = 3, rings = 4, lift = 0.09, thick = 0.05, curve = 1.8, neck = 0.14, flat = false } = {}) {
  const N = sides * per, seg = TAU / sides, pos = [], idx = [];
  const cornerK = a => { const u = ((a % seg) + seg) % seg; return Math.abs(u - seg / 2) / (seg / 2); }; // 1 at a corner, 0 mid-edge
  const edgeR = a => { const u = ((a % seg) + seg) % seg - seg / 2; return Math.cos(seg / 2) / Math.cos(u); };
  const at = (t, a, dy = 0) => {
    const k = cornerK(a), rr = (neck + (1 - neck) * t) * R * edgeR(a) * (1 + 0.06 * t * t * k * k);
    return [Math.cos(a) * rr, H * Math.pow(1 - t, curve) + lift * t * t * t * k * k * k + dy, Math.sin(a) * rr];
  };
  for (let i = 0; i <= rings; i++) for (let k = 0; k < N; k++) pos.push(...at(i / rings, k / N * TAU));
  for (let k = 0; k < N; k++) pos.push(...at(1, k / N * TAU, -thick)); // lower rim ring
  const lowRim = (rings + 1) * N, ctr = pos.length / 3; pos.push(0, -thick * 0.6, 0);
  for (let i = 0; i < rings; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + (k + 1) % N, c = a + N, d = b + N;
    idx.push(a, b, c, b, d, c);
  }
  for (let k = 0; k < N; k++) { const a = rings * N + k, b = rings * N + (k + 1) % N, c = lowRim + k, d = lowRim + (k + 1) % N; idx.push(a, b, c, b, d, c); idx.push(ctr, lowRim + (k + 1) % N, lowRim + k); }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  if (flat) g = g.toNonIndexed(); // cut-stone facets with crisp hip lines
  g.computeVertexNormals();
  return g;
}

// Stone lantern (toro): chunky kasuga-style -- hex base with a lotus plinth, ringed post, flared platform with lotus
// petals, a fire box with open lattice fronts and round moon windows, a sweeping hex roof with curled corners and a
// jewel on a petal cup; moss on the up-facing stone and a cushion or two. Ground at 0; returns the light height.
export function toro(B, { s = 1, moss = true } = {}) {
  B.push([0, 0, 0], B.wob(0.12), s);
  const r = lrng(B), base = B.pick(STONES), m = moss ? 0.3 : 0;
  const tone = k => shade(base, 1 + k + (r() - 0.5) * 0.05);
  const hex = (rt, rb, h, y, c, seg = 6) => { const g = G.cyl(rt, rb, h, seg); g.translate(0, y + h / 2, 0); B.add(g, c); return g; };
  // kiso (base): two hex tiers, the upper one scalloped into a ring of downturned lotus petals
  hex(0.27, 0.3, 0.09, 0, mossStone(tone(-0.04), m));
  const lotus = (y, r0, r1, h, up, c) => {
    const g = G.lathe(up ? [[r0, 0], [r1 * 0.92, h * 0.35], [r1, h * 0.75], [r1 * 0.9, h], [r0 * 0.9, h * 0.8]] : [[r1 * 0.95, 0], [r1, h * 0.4], [r1 * 0.85, h * 0.85], [r0, h]], 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 0.9 + 0.1 * Math.abs(Math.cos(a * 3)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.computeVertexNormals(); g.translate(0, y, 0);
    B.add(g, (pp, n, o) => { o.set(c).multiplyScalar(0.9 + 0.14 * Math.abs(Math.cos(Math.atan2(pp.z, pp.x) * 3))); if (m && n.y > 0.6 && nz(pp.x * 9, pp.z * 9) > 0.35) o.lerp(MOSS, 0.6); });
  };
  lotus(0.09, 0.1, 0.23, 0.08, false, tone(0.02));
  // sao (post) with carved rings
  const post = G.cyl(0.092, 0.11, 0.46, 8, true); post.translate(0, 0.42, 0); B.add(post, (p, n, o) => o.set(tone(0)).multiplyScalar(0.92 + 0.1 * nz(p.y * 8, Math.atan2(p.z, p.x) * 2)));
  for (const [y, rr] of [[0.3, 0.116], [0.58, 0.103]]) { const b = G.cyl(rr, rr, 0.03, 8, true); b.translate(0, y, 0); B.add(b, tone(0.06)); }
  // chudai (platform): flared hex with upturned lotus petals
  hex(0.24, 0.14, 0.09, 0.66, mossStone(tone(0.02), m));
  lotus(0.62, 0.1, 0.16, 0.06, true, tone(0.05));
  // hibukuro (fire box): glowing core, corner posts, sill and lintel; lattice fronts, stone sides with round windows
  const glow = G.cyl(0.14, 0.14, 0.2, 6); glow.translate(0, 0.86, 0); B.glow(glow, '#fff0c8', { flicker: 0.7 });
  // (a 6-sided cylinder has its corners at 30 + k*60 degrees, faces at k*60)
  for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * TAU; const p = G.box(0.05, 0.22, 0.05, 0); p.rotateY(-a); p.translate(Math.cos(a) * 0.15, 0.86, Math.sin(a) * 0.15); B.add(p, tone(0)); }
  hex(0.2, 0.2, 0.03, 0.75, tone(-0.03));
  hex(0.19, 0.21, 0.03, 0.965, tone(-0.05));
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU, dx = Math.cos(a), dz = Math.sin(a), rr = 0.126;
    B.at([dx * rr, 0.86, dz * rr], -a + PI / 2, () => {
      if (k % 3 === 1) { // stone panel with a round moon window glowing through
        const pnl = G.box(0.13, 0.2, 0.02, 0); B.add(pnl, tone(-0.02));
        const win = G.disc(0.045, 10); win.translate(0, 0.01, 0.012); B.glow(win, '#fff4d8', { flicker: 0.7 });
      } else if (k % 3 === 0) { // front: paper with a wooden lattice
        const lat = G.box(0.012, 0.19, 0.012, 0); lat.translate(0, 0, 0.022); B.add(lat, C.woodDark);
        const lat2 = G.box(0.13, 0.012, 0.012, 0); lat2.translate(0, 0.02, 0.022); B.add(lat2, C.woodDark);
      }
    });
  }
  // kasa: sweeping roof with curled warabite corners, a petal cup and the hoju jewel
  const kasa = kasaGeo(0.36, 0.21, { per: 2, rings: 3, lift: 0.07, thick: 0.065, curve: 1.2, flat: true }); kasa.rotateY(PI / 6); kasa.translate(0, 1.03, 0);
  B.add(kasa, (p, n, o) => {
    o.set(tone(-0.04)).multiplyScalar(0.86 + 0.16 * clamp(n.y));
    if (n.y < -0.3) o.set(tone(-0.25)); // dark underside
    else if (n.y < 0.3) o.set(tone(0.06)); // pale rim band
    const mm = m && n.y > 0.35 ? (p.y - 1.12) * 4 + nz(p.x * 8, p.z * 8) * 0.5 - 0.15 : 0;
    if (mm > 0) o.lerp(MOSS, clamp(mm * 3) * 0.7).lerp(MOSS_HI, clamp(mm * 2 - 0.5) * 0.3);
  });
  for (let k = 0; k < 6; k++) { // warabite: a tight stone curl rolled back over each corner
    const a = k / 6 * TAU + PI / 6, dx = Math.cos(a), dz = Math.sin(a), R0 = 0.375;
    const pts = [[R0 - 0.035, 1.075], [R0 + 0.005, 1.1], [R0 + 0.01, 1.14], [R0 - 0.025, 1.15]].map(([rr, y], i) => ({ p: V(dx * rr, y, dz * rr), r: 0.026 - i * 0.003 }));
    B.add(tube(pts, 4, true), tone(0.07));
  }
  const cup = G.lathe([[0.001, 0], [0.05, 0.005], [0.085, 0.04], [0.075, 0.06], [0.001, 0.05]], 8); cup.translate(0, 1.22, 0);
  B.add(cup, (p, n, o) => o.set(tone(0.05)).multiplyScalar(0.88 + 0.14 * Math.abs(Math.cos(Math.atan2(p.z, p.x) * 4))));
  const hj = G.lathe([[0.001, 0], [0.05, 0.015], [0.065, 0.06], [0.04, 0.12], [0.012, 0.16], [0.001, 0.175]], 8); hj.translate(0, 1.26, 0); B.add(hj, tone(0.08));
  // a moss cushion at the foot
  if (moss) {
    const a = r() * TAU, mb = puff(V(Math.cos(a) * 0.27, 0.07, Math.sin(a) * 0.27), 0.09, { detail: 1, noise: 0.4, squash: 0.45, seed: B.seed + 3 });
    B.add(mb, (p, n, o) => o.copy(MOSS).lerp(MOSS_HI, clamp(n.y) * 0.5).multiplyScalar(0.92 + 0.12 * nz(p.x * 30, p.z * 30)));
  }
  B.pop();
  return 0.86 * s;
}

// Coopered barrel: rounded staves with dark seams (each its own tone), three iron hoops, a planked lid sunk inside
// the stave tops, and a wooden bung on the belly.
export function barrel(B, { r = 0.2, h = 0.42, wood = C.woodLight, lid = true } = {}) {
  const rr = lrng(B), staves = 11, prof = t => r * (0.86 + 0.14 * Math.sin(t * PI));
  const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([prof(t), t * h]); }
  const g = G.lathe(pts, staves * 2), base = col(wood);
  const tones = Array.from({ length: staves }, () => base.clone().offsetHSL((rr() - 0.5) * 0.02, (rr() - 0.5) * 0.08, (rr() - 0.5) * 0.08));
  B.add(faceColors(g, (p, n, o, c) => {
    const u = ((Math.atan2(c.z, c.x) / TAU + 1) % 1) * staves, si = Math.floor(u) % staves;
    const v = ((Math.atan2(p.z, p.x) / TAU + 1) % 1) * staves, f = v - Math.round(v); // 0 on a seam
    o.copy(tones[si]).multiplyScalar(Math.abs(f) < 0.1 ? 0.7 : 0.92 + 0.1 * clamp(n.y + 0.4));
  }), null);
  for (const t of [0.12, 0.5, 0.88]) {
    const R = prof(t) + 0.007, band = G.cyl(R, R, t === 0.5 ? 0.025 : 0.035, 16, true); band.translate(0, t * h, 0);
    B.add(band, (p, n, o) => o.set(C.iron).lerp(col('#8a8898'), clamp(Math.cos(Math.atan2(p.z, p.x) * 3) * 0.3 + 0.1)));
  }
  if (lid) {
    const L = G.cyl(r * 0.84, r * 0.84, 0.02, 12); L.translate(0, h - 0.025, 0); B.add(L, shade(wood, 0.82));
    for (const x of [-r * 0.28, r * 0.28]) { const seam = G.box(0.008, 0.004, r * 1.5, 0); seam.translate(x, h - 0.013, 0); B.add(seam, shade(wood, 0.5)); }
  }
  const bung = G.cyl(0.022, 0.026, 0.02, 8); bung.rotateX(PI / 2); bung.translate(0, h * 0.5, r + 0.004); B.add(bung, shade(wood, 0.7));
}

// Slatted crate: planked sides over a dark core (the gaps read as seams), corner posts, cross braces on two sides,
// a painted stencil on the front and a planked lid (or open, for produce).
export function crate(B, { s = 0.36, wood = C.woodPale, lid = true, stencil = true } = {}) {
  const rr = lrng(B), h = s * 0.85, base = col(wood), dark = shade(wood, 0.45), th = 0.02, gap = 0.012;
  const tone = () => base.clone().offsetHSL(0, (rr() - 0.5) * 0.06, (rr() - 0.5) * 0.08);
  const core = G.box(s - 0.03, h - 0.02, s - 0.03, 0); core.translate(0, h / 2, 0); B.add(core, dark);
  const ph = (h - gap * 2) / 3;
  for (let side = 0; side < 4; side++) B.at([0, 0, 0], side * PI / 2, () => {
    for (let i = 0; i < 3; i++) { const p = G.box(s - 0.05, ph - gap, th, 0); p.translate(0, gap + ph * (i + 0.5), s / 2 - th / 2 - 0.005); B.add(p, tone()); }
    if (side % 2) { // diagonal brace
      const L = Math.hypot(s - 0.08, h - 0.06), b = G.box(L, 0.045, 0.014, 0); b.rotateZ(Math.atan2(h - 0.06, s - 0.08) * (side === 1 ? 1 : -1)); b.translate(0, h / 2, s / 2 + 0.005);
      B.add(b, shade(wood, 0.82));
    }
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.04, h, 0.04, 0); p.translate(sx * (s / 2 - 0.02), h / 2, sz * (s / 2 - 0.02)); B.add(p, shade(wood, 0.8)); }
  if (lid) for (let i = 0; i < 3; i++) { const p = G.box(s - 0.01, 0.02, s / 3 - gap, 0); p.translate(0, h - 0.01, -s / 3 + i * s / 3); B.add(p, tone()); }
  else { const rim = G.box(s, 0.03, s, 0); rim.translate(0, h * 0.72, 0); B.add(rim, '#e8d49a'); } // straw bed
  if (stencil) {
    const sym = ['star', 'flower', 'fish', 'leaf', 'heart', 'sakura'][Math.floor(rr() * 6)], sg = flatSymbol(sym);
    sg.scale(s * 0.34, s * 0.34, 1); sg.translate(0, h * 0.5, s / 2 + 0.0005);
    B.add(sg, (p, n, o) => o.set(sym === 'leaf' ? '#5a8a4a' : sym === 'fish' ? '#4a6a9a' : '#b8503a').lerp(base, 0.25));
  }
}

// produce crate (fruit / veg / fish heaped in an open crate)
export function produce(B, { kind = 'apple', s = 0.36 } = {}) {
  crate(B, { s, lid: false });
  const pal = { apple: ['#e8403a', '#ff6a50', '#f4c04a'], veg: ['#ff8a3a', '#6ab04c', '#fff0d0'], fish: ['#8ab8e0', '#c0d8f0'], bread: ['#d89050', '#e8b070'], flower: FLOWERS }[kind] || ['#e8403a'];
  for (let i = 0; i < 7; i++) {
    const r = kind === 'fish' ? 0.05 : 0.06;
    const g = kind === 'fish' ? G.sph(r, 8, 5) : G.ico(r, 1);
    if (kind === 'fish') g.scale(2.2, 0.6, 0.9);
    const x = B.rand(-s * 0.3, s * 0.3), y = s * 0.8 + r * 0.6 + B.rand(0, 0.04), z = B.rand(-s * 0.3, s * 0.3);
    g.translate(x, y, z);
    const c = B.pick(pal);
    B.add(g, (p, n, o) => o.set(c).lerp(col('#ffffff'), clamp(n.y - 0.6) * 0.5));
    if (kind === 'apple' && i % 2 === 0) { const st = G.cyl(0.004, 0.006, 0.03, 3); st.translate(x, y + r, z); B.add(st, '#6a4a2a'); const lf = leafGeo(0.035, 0.013); lf.rotateY(i); lf.translate(x, y + r + 0.005, z); B.add(lf, '#5aa84a'); }
  }
}

// small round bush (leaf bucket, sways) with optional flowers: soft leafy puffs covered in little diamond leaves,
// five-petal flowers with yellow eyes on top
export function bush(B, { r = 0.35, color = '#5a9a48', flowers = null, n = 3, sway = true } = {}) {
  const crown = V(0, r * 0.9, 0), bk = sway ? 'leaf' : 'body';
  const base = col(color), hi = col(mixc(color, '#d8f08a', 0.45)), lo = col(mixc(color, '#2f5a3a', 0.35));
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + B.rand(0, 1), d = n > 1 ? r * 0.35 : 0;
    const c = V(Math.cos(a) * d, r * (0.7 + B.rand(0, 0.25)), Math.sin(a) * d), R = r * B.rand(0.7, 0.9);
    const g = puff(c, R, { detail: 1, noise: 0.22, crown, crownMix: 0.5, seed: B.seed + i * 3 });
    B.add(g, (p, nn, o) => o.copy(lo).lerp(base, clamp(nn.y * 0.8 + 0.6)).lerp(hi, clamp(nn.y * 0.6 + 0.1) * 0.7), bk);
    blobs.push({ c, R });
  }
  const rr = lrng(B), leafCols = [mixc(color, '#c8e87a', 0.12), mixc(color, '#c8e87a', 0.25), mixc(color, '#3a6a3a', 0.12)];
  for (const q of blobs) leafScatter(B, rr, q.c, q.R, Math.round(16 + q.R * 80), leafCols, { size: 0.85 * Math.min(1, r / 0.3) });
  if (flowers) for (let i = 0; i < 7; i++) {
    const a = B.rand(0, TAU), u = B.rand(0.2, 0.9), R = 0.055 * (r / 0.35);
    const x = Math.cos(a) * r * 0.8 * Math.sqrt(1 - u * u), y = r * (0.8 + u * 0.7), z = Math.sin(a) * r * 0.8 * Math.sqrt(1 - u * u);
    const f = blossomGeo(R); f.rotateX((rr() - 0.5) * 0.5); f.rotateZ(-Math.cos(a) * 0.5 * (1 - u)); f.translate(x, y + 0.01, z);
    const fc = col(B.pick(flowers));
    B.add(f, (p, nn, o) => o.copy(fc).lerp(col('#ffffff'), clamp(Math.hypot(p.x - x, p.z - z) / R - 0.3) * 0.3), bk);
    const eye = G.sph(R * 0.28, 5, 3); eye.scale(1, 0.5, 1); eye.translate(x, y + 0.012, z); B.add(eye, '#ffd84a', bk);
  }
}

// Terracotta / glazed pot: rolled lip, a glaze band, drainage foot; dark soil with a pebble or two
export function pot(B, { r = 0.17, h = 0.24, color = C.terracotta, plant = 'bush', flowers } = {}) {
  const g = G.lathe([[0.001, 0], [r * 0.66, 0], [r * 0.7, h * 0.06], [r * 0.85, h * 0.2], [r, h * 0.84], [r * 1.02, h * 0.88], [r * 1.12, h * 0.93], [r * 1.1, h * 1.02], [r * 0.93, h * 1.02], [0.001, h * 0.92]], 12);
  const cc = col(color), band = cc.clone().offsetHSL(0.02, -0.05, 0.12);
  B.add(g, (p, n, o) => { o.copy(cc).multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.3)); if (p.y > h * 0.55 && p.y < h * 0.66) o.copy(band); if (p.y > h * 0.86) o.multiplyScalar(1.08); });
  const soil = G.cyl(r * 0.92, r * 0.92, 0.02, 10); soil.translate(0, h * 0.95, 0); B.add(soil, C.soil);
  const pb = G.ico(0.018 * r / 0.17, 0); pb.translate(r * 0.45, h * 0.97, -r * 0.3); B.add(pb, '#d8d0c8');
  B.push([0, h * 0.8, 0]);
  if (plant === 'bush') bush(B, { r: r * 1.35, flowers, n: 2 });
  else if (plant === 'pine') bonsai(B, r * 3);
  else if (plant === 'bamboo') bamboo(B, { n: 3, h: 1.2, spread: r * 0.5 });
  else if (plant === 'flowers') bush(B, { r: r * 1.1, flowers: flowers || [B.pick(FLOWERS), B.pick(FLOWERS)], n: 2, color: '#6aae50' });
  B.pop();
}

export function bonsai(B, s = 0.6) {
  const t = branch(V(0, 0, 0), V(s * 0.25, s * 0.55, 0), 0.05 * s / 0.6, 0.03, V(-0.08, 0, 0.05), 4, 5); B.add(t, '#6e4a3a');
  for (const [x, y, z, r] of [[s * 0.28, s * 0.62, 0, 0.22], [-s * 0.05, s * 0.45, 0.1, 0.16], [s * 0.4, s * 0.4, -0.08, 0.14]]) {
    const g = puff(V(x, y, z), r * s, { detail: 1, noise: 0.2, squash: 0.45, seed: B.seed + x * 10 });
    B.add(g, (p, n, o) => o.set('#3f8f5e').lerp(col('#7cc070'), clamp(n.y)), 'leaf');
  }
}

// Little tree. kind: sakura | round | maple | pine. A flared trunk with root knuckles and striped bark, a few soft
// crown masses, and the species' detail scattered over them: five-petal blossoms (sakura), star leaves (maple),
// diamond leaves (round), needle sprigs (pine); a couple of blossoms or leaves drifting on the ground.
export function tree(B, { kind = 'sakura', s = 1 } = {}) {
  const pal = {
    sakura: ['#ffc4dc', '#f79cc0', '#e27aa8', '#fff2f8'], round: ['#7cc05a', '#5aa84c', '#4a8a44', '#c4e07a'],
    maple: ['#ff9a5a', '#f0604a', '#d8483a', '#ffd488'], pine: ['#4f9a60', '#3a8052', '#2f6a48', '#7cc07a'],
  }[kind];
  B.push([0, 0, 0], B.rand(0, TAU), s);
  const H = kind === 'pine' ? 1.1 : 1.25;
  const top = V(B.wob(0.15), H, B.wob(0.15));
  const bA = col('#5a3a42'), bB = col('#8a6660');
  const bark = (p, n, o) => o.copy(bA).lerp(bB, clamp(0.45 + 0.3 * n.y + 0.28 * Math.sin(Math.atan2(n.z, n.x) * 3 + p.y * 2.5) + nz(p.y * 6, p.x * 6) * 0.2));
  B.add(branch(V(0, -0.05, 0), top, 0.13, 0.08, V(B.wob(0.15), 0, B.wob(0.15)), 5, 7), bark);
  const rr = lrng(B);
  for (let k = 0; k < 4; k++) { // root knuckles flaring into the ground
    const a = k / 4 * TAU + rr() * 0.8;
    B.add(branch(V(0, 0.22, 0), V(Math.cos(a) * 0.3, -0.03, Math.sin(a) * 0.3), 0.075, 0.03, V(0, 0.05, 0), 3, 5), bark);
  }
  const puffs = [];
  const nb = kind === 'pine' ? 3 : 4;
  for (let i = 0; i < nb; i++) {
    const a = i / nb * TAU + B.rand(0, 0.8), d = kind === 'pine' ? 0.55 : 0.6;
    const end = V(top.x + Math.cos(a) * d, H + (kind === 'pine' ? 0.1 + i * 0.25 : 0.35 + B.rand(0, 0.35)), top.z + Math.sin(a) * d);
    B.add(branch(top, end, 0.06, 0.03, V(0, 0.15, 0), 3, 5), bark);
    puffs.push({ c: end.clone().add(V(0, 0.12, 0)), r: kind === 'pine' ? 0.42 : 0.48 + B.rand(0, 0.15), sq: kind === 'pine' ? 0.5 : 0.85 });
  }
  puffs.push({ c: V(top.x, H + (kind === 'pine' ? 1.0 : 0.75), top.z), r: kind === 'pine' ? 0.45 : 0.62, sq: kind === 'pine' ? 0.5 : 0.85 });
  const crown = puffs.reduce((a, q) => a.add(q.c), V()).multiplyScalar(1 / puffs.length);
  const cA = col(pal[0]), cB = col(pal[1]), cC = col(pal[2]), cH = col(pal[3]);
  const UPV = V(0, 1, 0), qt = new THREE.Quaternion();
  puffs.forEach((q, i) => {
    const top = i === puffs.length - 1, R = q.r * 0.9, g = puff(q.c, R, { detail: top ? 2 : 1, noise: 0.24, squash: q.sq, crown, crownMix: 0.45, seed: B.seed * 3 + i });
    const t = clamp((q.c.y - crown.y + 0.6) / 1.2);
    const base = cC.clone().lerp(cB, clamp(t * 1.4)).lerp(cA, clamp(t * 1.6 - 0.4));
    base.offsetHSL(B.wob(0.012), B.wob(0.04), B.wob(0.03));
    B.add(g, (p, n, o) => { o.copy(base).lerp(cH, clamp((n.y - 0.3) * 0.8) * 0.45); if (n.y < -0.3) o.multiplyScalar(0.85); o.multiplyScalar(0.94 + 0.12 * nz(p.x * 5, p.z * 5 + p.y * 3)); }, 'leaf');
    // surface detail: blossoms / leaves stuck all over the upper and outer surface, in the crown's own colours, so
    // the mass reads as a cluster of flowers or leaves rather than a ball
    const n = Math.round((kind === 'round' ? 30 : kind === 'pine' ? 26 : kind === 'sakura' ? 36 : 24) * (top ? 1.3 : 1));
    for (let k = 0; k < n; k++) {
      const u = -0.2 + rr() * 1.15, th = rr() * TAU, sr = Math.sqrt(Math.max(0, 1 - u * u)), d = V(sr * Math.cos(th), u, sr * Math.sin(th));
      const leafy = kind === 'round' || kind === 'pine';
      const p = q.c.clone().add(V(d.x * R, d.y * R * q.sq, d.z * R).multiplyScalar((leafy ? 0.94 : 1.04) + rr() * 0.12));
      let f;
      if (kind === 'sakura') f = blossomGeo(0.05 + rr() * 0.03, 5, 0.45);
      else if (kind === 'maple') f = blossomGeo(0.1 + rr() * 0.03, 7, 0.42, true);
      else f = leafGeo(kind === 'pine' ? 0.2 : 0.16, kind === 'pine' ? 0.025 : 0.06);
      if (leafy) { f.rotateZ(-0.2 - rr() * 0.5); f.rotateY(-th); }
      else f.applyQuaternion(qt.setFromUnitVectors(UPV, d.clone().lerp(UPV, 0.45).normalize()));
      f.translate(p.x, p.y, p.z);
      const fc = kind === 'sakura' ? col(['#ffffff', '#ffe4ee', '#ffd0e2', '#ffb4d0'][Math.floor(rr() * 4)])
        : base.clone().lerp(rr() < 0.5 ? cH : cC, 0.15 + rr() * 0.4).offsetHSL((rr() - 0.5) * 0.03, 0, (rr() - 0.5) * 0.06);
      B.add(f, kind === 'sakura' ? (pp, nn, o) => o.copy(fc).lerp(col('#e8649a'), clamp(1 - Math.hypot(pp.x - p.x, pp.z - p.z) / 0.03) * 0.55) : fc, 'leaf');
    }
  });
  B.pop();
  return H * s + 1.3 * s;
}

export function bamboo(B, { n = 5, h = 2.4, spread = 0.4 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = B.wob(spread), z = B.wob(spread), hh = h * B.rand(0.75, 1.1), lx = B.wob(0.2), lz = B.wob(0.2);
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push({ p: V(x + lx * t * t, t * hh, z + lz * t * t), r: 0.045 - t * 0.015 }); }
    B.add(tube(pts, 6, false), (p, nn, o) => { o.set('#8fd06a').lerp(col('#c8e890'), clamp(nn.x * 0.3 + 0.3)); if ((p.y % 0.45) < 0.035) o.set('#5a9a48'); }, 'leaf');
    for (let k = 0; k < 5; k++) {
      const t = 0.5 + k * 0.12, a = B.rand(0, TAU);
      const cx = x + lx * t * t, cz = z + lz * t * t;
      const g = G.sph(0.1, 6, 4); g.scale(2.2, 0.35, 0.8); g.rotateZ(-0.35); g.rotateY(a); g.translate(cx + Math.cos(a) * 0.16, t * hh, cz - Math.sin(a) * 0.16);
      B.add(g, (p, nn, o) => o.set('#6ab84c').lerp(col('#b8e888'), clamp(nn.y)), 'leaf');
    }
  }
}

// Garden rock: lumpy stone with a cool shadow side, a moss cushion draped over the top and pebbles at its foot
export function rock(B, { r = 0.35, sq = 0.6, moss = 0.5 } = {}) {
  const g0 = puff(V(0, r * 0.25, 0), r, { detail: 2, noise: 0.32, squash: sq, seed: B.seed + Math.round(r * 100) });
  B.add(mossyStone(g0, { amt: moss > 0.25 ? moss : 0, sc: 2.2 / r, seed: B.seed, lift: r * 0.09 }), null);
  const rr = lrng(B);
  for (let i = 0; i < 3; i++) {
    const a = rr() * TAU, d = r * (1.0 + rr() * 0.3), pb = G.ico(r * (0.1 + rr() * 0.08), 0); pb.scale(1.2, 0.6, 1); pb.translate(Math.cos(a) * d, 0.01, Math.sin(a) * d);
    B.add(pb, B.pick(STONES));
  }
}

// Signboard. style: 'hang' (bracket from a wall, local z out), 'stand' (two posts), 'plank' (flat on wall), 'roof' (ridge top)
export function signboard(B, { sym = 'star', w = 0.7, h = 0.45, style = 'plank', color = C.woodPale, frame = C.woodDark, symSize, symColors } = {}) {
  const board = (bw, bh) => {
    const g = G.box(bw, bh, 0.07, 0.035); B.add(g, color);
    const f = G.box(bw + 0.06, bh + 0.06, 0.05, 0.03); f.translate(0, 0, -0.02); B.add(f, frame);
    B.at([0, 0, 0.035], 0, () => symbol(B, sym, symSize ?? Math.min(bw, bh) * 0.82, { colors: symColors }));
  };
  if (style === 'hang') {
    const arm = G.box(0.06, 0.06, 0.62, 0.015); arm.translate(0, 0, 0.31); B.add(arm, frame);
    const br = G.box(0.05, 0.3, 0.05, 0.01); br.rotateX(0.8); br.translate(0, -0.12, 0.1); B.add(br, frame);
    for (const s of [-1, 1]) { const ch = G.cyl(0.01, 0.01, 0.16, 4); ch.translate(0, -0.08, 0.34 + s * w * 0.3); B.add(ch, C.iron); }
    B.at([0, -0.16 - h / 2, 0.34], PI / 2, () => board(w, h));
  } else if (style === 'stand') {
    for (const s of [-1, 1]) { const p = G.box(0.08, 1.0, 0.08, 0.02); p.translate(s * (w / 2 + 0.02), 0.5, 0); B.add(p, frame); }
    B.at([0, 0.72, 0.02], 0, () => board(w, h));
  } else if (style === 'aframe') {
    for (const s of [-1, 1]) B.at([0, 0, s * 0.12], 0, () => { B.push([0, 0.34, 0], s > 0 ? 0 : PI, 1, -0.28); board(w, h); B.pop(); });
  } else board(w, h);
}

// Red post-box
export function mailbox(B, color = '#e8403a') {
  const post = G.cyl(0.04, 0.05, 0.62, 6); post.translate(0, 0.31, 0); B.add(post, C.woodDark);
  const body = G.box(0.3, 0.26, 0.4, 0.06); body.translate(0, 0.72, 0); B.add(body, color);
  const top = G.cyl(0.15, 0.15, 0.4, 10, false); top.rotateX(PI / 2); top.scale(1, 0.6, 1); top.translate(0, 0.84, 0); B.add(top, color);
  const slot = G.box(0.16, 0.03, 0.02, 0); slot.translate(0, 0.76, 0.205); B.add(slot, C.ink);
  const flag = G.box(0.03, 0.18, 0.08, 0.01); flag.translate(0.17, 0.86, 0.06); B.add(flag, C.gold);
  const heart = G.sph(0.035, 6, 4); heart.translate(0, 0.66, 0.205); B.add(heart, '#ffffff');
}

// Park bench: four seat slats and three back slats (each its own tone), side frames with a raked back post, a seat
// rail and a rounded armrest on the front leg, iron bolt heads, little feet.
export function bench(B, { w = 1.2, wood = C.woodLight, legs = C.woodDark } = {}) {
  const rr = lrng(B), tone = () => shade(wood, 0.9 + rr() * 0.14);
  for (let i = 0; i < 4; i++) { const s = G.box(w, 0.045, 0.092, 0); s.translate(0, 0.43, -0.165 + i * 0.105); B.add(s, (p, n, o) => o.set(tone()).multiplyScalar(n.y > 0.5 ? 1.04 : 0.9)); }
  const rake = 0.142, postZ = y => -0.18 - y * rake; // the rear post leans back
  for (let i = 0; i < 3; i++) { const y = 0.56 + i * 0.105, b = G.box(w - 0.04, 0.07, 0.03, 0); b.rotateX(-Math.atan(rake)); b.translate(0, y, postZ(y) + 0.048); B.add(b, tone()); }
  const bolt = (x, y, z, sx) => { const d = G.disc(0.013, 5); d.rotateY(sx * PI / 2); d.translate(x + sx * 0.001, y, z); B.add(d, C.iron); };
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.1);
    B.add(bar(V(x, 0, postZ(0)), V(x, 0.84, postZ(0.84)), 0.065, 0.015), legs); // raked rear leg + back post
    const fl = G.box(0.065, 0.62, 0.065, 0); fl.translate(x, 0.31, 0.17); B.add(fl, legs); // front leg up to the armrest
    const rail = G.box(0.055, 0.06, 0.42, 0); rail.translate(x, 0.385, 0); B.add(rail, legs);
    const arm = G.box(0.08, 0.04, 0.42, 0); arm.translate(x + sx * 0.005, 0.64, -0.02); B.add(arm, (p, n, o) => o.set(tone()).multiplyScalar(n.y > 0.5 ? 1.05 : 0.88));
    const knob = G.sph(0.04, 6, 4); knob.scale(1.05, 0.55, 1); knob.translate(x + sx * 0.005, 0.64, 0.19); B.add(knob, tone());
    for (const z of [-0.15, 0.15]) { const f = G.box(0.085, 0.025, 0.085, 0); f.translate(x, 0.012, z > 0 ? 0.17 : -0.18); B.add(f, shade(legs, 0.8)); }
    for (const z of [-0.12, 0.12]) bolt(x + sx * 0.028, 0.385, z, sx);
    bolt(x + sx * 0.033, 0.6, 0.17, sx);
  }
}

export function bell(B, { r = 0.18, color = C.bronze } = {}) {
  const g = G.lathe([[0.001, 0.02], [r * 0.5, 0.02], [r * 0.62, -0.1], [r * 0.72, -0.3 * r / 0.18], [r * 1.0, -0.42 * r / 0.18], [r * 0.9, -0.44 * r / 0.18], [0.001, -0.4 * r / 0.18]], 12);
  B.add(g, (p, n, o) => o.set(color).lerp(col('#ffe0a0'), clamp(n.y * 0.3 + 0.1)));
  const lug = G.torus(0.04, 0.015, 4, 8); lug.translate(0, 0.05, 0); B.add(lug, shade(color, 0.7));
  const band = G.torus(r * 0.75, 0.015, 4, 12); band.rotateX(PI / 2); band.translate(0, -0.3 * r / 0.18, 0); B.add(band, shade(color, 0.75));
}

// Torii gate spanning x (width w between pillar centres), height h
export function torii(B, { w = 2, h = 2.2, color = C.vermilion, s = 1, bases = true } = {}) {
  B.push([0, 0, 0], 0, s);
  const pr = 0.09 * Math.max(1, w / 2);
  for (const sx of [-1, 1]) {
    const p = G.cyl(pr * 0.9, pr * 1.05, h, 10); p.rotateZ(sx * 0.03); p.translate(sx * w / 2, h / 2, 0); B.add(p, color);
    if (bases) { const b = G.cyl(pr * 1.3, pr * 1.45, 0.22, 10); b.translate(sx * w / 2, 0.11, 0); B.add(b, '#3a2e34'); }
  }
  const nuki = G.box(w + pr * 4.5, 0.13 * Math.max(1, w / 2) * 0.8, 0.12, 0.02); nuki.translate(0, h * 0.78, 0); B.add(nuki, color);
  // kasagi: curved top lintel with upturned ends
  const L = w + pr * 8, pts = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12 * 2 - 1; pts.push({ p: V(t * L / 2, h + 0.1 + Math.pow(Math.abs(t), 2.6) * 0.22, 0), r: 0.11 * Math.max(1, w / 2) * 0.85 }); }
  const kg = tube(pts, 6, false); kg.scale(1, 0.8, 1.05); B.add(kg, '#2a2228');
  const pts2 = pts.map(q => ({ p: q.p.clone().add(V(0, -0.14, 0)), r: q.r * 0.95 }));
  B.add(tube(pts2, 6, false), color);
  const gaku = G.box(0.26, 0.34, 0.06, 0.03); gaku.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0.05); B.add(gaku, '#2a2228');
  const plate = G.box(0.19, 0.26, 0.04, 0.02); plate.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0.08); B.add(plate, C.gold);
  const post = G.box(0.08, h + 0.05 - h * 0.78, 0.08, 0.01); post.translate(0, h * 0.78 + (h + 0.05 - h * 0.78) / 2, 0); B.add(post, color);
  B.pop();
}

// stacked log pile along x
export function logPile(B, { n = 3, L = 1.0, r = 0.12 } = {}) {
  let rows = n, y = r;
  while (rows > 0) {
    for (let i = 0; i < rows; i++) {
      const x0 = (i - (rows - 1) / 2) * r * 2.05;
      const g = G.cyl(r * B.rand(0.9, 1.05), r, L * B.rand(0.9, 1.05), 8); g.rotateX(PI / 2); g.translate(B.wob(0.02), y, x0);
      B.add(g, (p, nn, o) => { if (Math.abs(nn.z) > 0.9) o.set('#e8c08a').lerp(col('#c89868'), clamp(Math.hypot(p.x, p.y - y) / r)); else o.set('#8a5e44'); });
    }
    y += r * 1.75; rows--;
  }
}

export function woodStack(B, { w = 0.8, h = 0.5, d = 0.4 } = {}) {
  for (let y = 0.06; y < h; y += 0.1) {
    for (let x = -w / 2 + 0.05; x < w / 2; x += 0.1) {
      const g = G.cyl(0.045, 0.045, d * B.rand(0.9, 1.05), 5); g.rotateX(PI / 2); g.rotateZ(B.rand(0, 1)); g.translate(x + B.wob(0.01), y, B.wob(0.03));
      B.add(g, (p, nn, o) => { if (Math.abs(nn.z) > 0.9) o.set('#f0cc98'); else o.set(B.pick(['#8a5e44', '#9a6a4a', '#7a5040'])); });
    }
  }
}

// garden stone lantern-like mini shrine / offering box
export function offeringBox(B, w = 0.6) {
  const g = G.box(w, 0.36, w * 0.6, 0.03); g.translate(0, 0.18, 0); B.add(g, C.woodMid);
  for (let i = 0; i < 5; i++) { const s = G.box(w * 0.9, 0.025, 0.035, 0); s.translate(0, 0.365, -w * 0.25 + i * w * 0.12); B.add(s, C.woodDark); }
  const lab = G.box(w * 0.6, 0.12, 0.02, 0.01); lab.translate(0, 0.2, w * 0.3 + 0.005); B.add(lab, C.gold);
}

// Lantern post: mossy hex stone footing, a post with iron bands and a cap, a braced arm with a hook and the chochin
export function lanternPost(B, { h = 1.6, color = C.red, arm = true } = {}) {
  const p = G.cyl(0.05, 0.06, h, 6); p.translate(0, h / 2, 0); B.add(p, (pp, n, o) => o.set(C.woodDark).multiplyScalar(0.9 + 0.14 * nz(pp.y * 6, Math.atan2(n.z, n.x))));
  const b = G.cyl(0.13, 0.16, 0.12, 6); b.translate(0, 0.06, 0); B.add(b, mossStone(STONES[1], 0.4));
  const b2 = G.cyl(0.08, 0.1, 0.06, 6); b2.translate(0, 0.15, 0); B.add(b2, STONES[0]);
  for (const y of [0.3, h - 0.3]) { const band = G.cyl(0.066, 0.066, 0.035, 6, true); band.translate(0, y, 0); B.add(band, C.iron); }
  const cap = G.cyl(0.02, 0.085, 0.07, 6); cap.translate(0, h + 0.035, 0); B.add(cap, C.woodDark);
  const knob = G.sph(0.03, 6, 4); knob.translate(0, h + 0.08, 0); B.add(knob, C.gold);
  if (arm) {
    const a = G.box(0.05, 0.05, 0.42, 0.01); a.translate(0, h - 0.05, 0.19); B.add(a, C.woodDark);
    B.add(bar(V(0, h - 0.3, 0.04), V(0, h - 0.07, 0.22), 0.035, 0), C.woodDark); // brace
    const tip = G.cyl(0.02, 0.03, 0.04, 6); tip.rotateX(PI / 2); tip.translate(0, h - 0.05, 0.41); B.add(tip, C.gold);
    const hook = G.torus(0.02, 0.006, 3, 6); hook.translate(0, h - 0.09, 0.34); B.add(hook, C.iron);
    B.at([0, h - 0.1, 0.34], 0, () => chochin(B, { color, cord: 0.03 }));
  }
}

// flower bed patch (ground level): mounded soil, leaf rosettes, stems of mixed height topped with five-petal
// flowers (yellow eyes) or tulip cups, a few buds
export function flowerPatch(B, { w = 0.8, d = 0.8, n = 14, colors = FLOWERS } = {}) {
  const soil = G.sph(0.5, 10, 4); soil.scale(w / 0.95, 0.12, d / 0.95);
  B.add(soil, (p, nn, o) => o.set('#8a6048').multiplyScalar(0.9 + 0.16 * nz(p.x * 14, p.z * 14)));
  const rr = lrng(B), greens = ['#4f9a48', '#6aae50', '#5aa04a', '#7cbc58'];
  for (let i = 0; i < n; i++) {
    const x = B.rand(-w * 0.42, w * 0.42), z = B.rand(-d * 0.42, d * 0.42);
    for (let k = 0; k < 4; k++) { // leaf rosette
      const lf = leafGeo(0.11 + rr() * 0.04, 0.035); lf.rotateZ(0.35 + rr() * 0.3); lf.rotateY(k / 4 * TAU + rr()); lf.translate(x, 0.05, z);
      B.add(lf, greens[Math.floor(rr() * 4)], 'leaf');
    }
    const hh = 0.16 + rr() * 0.12;
    const stem = G.cyl(0.008, 0.011, hh, 3, true); stem.translate(x, 0.05 + hh / 2, z); B.add(stem, '#4a8a3a', 'leaf');
    const fc = col(B.pick(colors)), y = 0.05 + hh, fx = x + B.wob(0.02);
    const kind = rr();
    if (kind < 0.62) { // five-petal flower tilted toward the camera, yellow eye
      const f = blossomGeo(0.05 + rr() * 0.02, 5, 0.45, false, 4); f.rotateX(0.35); f.rotateZ(-0.3); f.translate(fx, y, z);
      B.add(f, (p, nn, o) => o.copy(fc).lerp(col('#ffffff'), clamp(Math.hypot(p.x - fx, p.z - z) / 0.06 - 0.4) * 0.25), 'leaf');
      const eye = G.ico(0.016, 0); eye.scale(1, 0.6, 1); eye.translate(fx, y + 0.01, z); B.add(eye, fc.getHex() === 0xffd24a ? '#ff9a3a' : '#ffd24a', 'leaf');
    } else if (kind < 0.9) { // tulip cup
      const cup = G.lathe([[0.001, -0.03], [0.03, -0.022], [0.04, 0.01], [0.034, 0.04], [0.02, 0.03]], 6); cup.translate(fx, y + 0.02, z);
      B.add(cup, (p, nn, o) => o.copy(fc).multiplyScalar(0.82 + 0.25 * clamp(p.y - y)), 'leaf');
    } else { const bud = G.sph(0.025, 5, 4); bud.scale(1, 1.4, 1); bud.translate(fx, y, z); B.add(bud, fc.clone().lerp(col('#6aae50'), 0.4), 'leaf'); }
  }
}

export { flowerBox, roundRoof };
