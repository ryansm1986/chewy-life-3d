// Whispering Bamboo Grove props (docs/REGIONS.md §2), built with the building kit (warp + painted ground AO) and
// returned as Builder buckets { body, glow, leaf, cloth, water, lights } for Placer.piece, cached per (kind, seed).
// Ground at y = 0, local +z faces the viewer's side of a piece unless noted.
//  lantern      mossy kasuga toro on a stone pad with moss cushions (a soft daytime glow in the mist)
//  slab / step  irregular flagstones for the winding path, rough stone steps for the climbs (loose geometry, d:stone)
//  shishiOdoshi a tsukubai stone basin fed by a bamboo spout, the rocking bamboo clapper on its crossbar and the
//               striking stone; the rocker is returned separately ({ pc, rocker: { geo, pivot } }) so the biome can
//               animate it (fill, tip, pour, clack)
//  ruinedShrine a moss-swallowed hokora on a cracked stone platform, a broken torii (one pillar standing, the lintel
//               fallen), a toppled lantern, two little kitsune in red bibs, an offering box
//  footbridge   a gently arched plank bridge with bamboo rails lashed to posts (deck along local z)
//  fence        yotsume-gaki bamboo fence along local x
//  chimes       a rope of furin wind chimes with paper tanzaku between two bamboo poles (along local x)
//  torii        a weathered vermilion torii with moss on the kasagi; iwakura: a sacred boulder in shimenawa
//  bambooBench  a bamboo slat bench with a tea tray
import * as THREE from 'three';
import { Builder, G, C, PI, shade, bar } from '../../world/buildings/kit.js';
import { toro, rock as kitRock, mossStone, mossyStone, lrng, leafGeo, bench } from '../../world/buildings/props.js';
import { shimenawa } from '../../world/buildings/props2.js';
import { roof } from '../../world/buildings/roofs.js';
import { STONES } from '../../world/buildings/parts.js';
import { tube, puff, paint, merge } from '../../gfx/geom.js';
import { mulberry32, TAU, clamp } from '../../core/util.js';
import { V, col, nz } from './bambooKit.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
export function kit(seed, fn, warp = 0.025) {
  const B = new Builder(seed); B.warpAmt = warp; B.jitter = 0.04;
  const extra = fn(B);
  const t = B.finish();
  return { ...t.geos, lights: t.lights, ...(extra || {}) };
}
const MOSS = '#74a852', MOSS_HI = '#a6cc68';
const mossPaint = (base, amt, sc = 6) => mossStone(base, amt, sc);
// a bamboo pole segment a -> b with node rings every ~0.35 m (kit geometry)
function pole(B, a, b, r, { color = '#8cbf5a', node = '#5e8e42', bucket = 'body' } = {}) {
  const L = a.distanceTo(b);
  B.add(tube([{ p: a, r }, { p: b, r: r * 0.95 }], 6, false), (p, n, o) => o.set(color).multiplyScalar(0.88 + 0.16 * clamp(n.y + 0.5)), bucket);
  const d = b.clone().sub(a).normalize(), nn = Math.max(1, Math.round(L / 0.36));
  for (let k = 1; k < nn; k++) {
    const q = a.clone().lerp(b, k / nn), g = G.torus(r * 1.02, r * 0.18, 3, 7);
    g.lookAt(d); g.translate(q.x, q.y, q.z); B.add(g, node, bucket);
  }
}
const tie = (B, p) => { const g = G.box(0.03, 0.035, 0.03, 0); g.rotateY(PI / 4); g.translate(p.x, p.y, p.z); B.add(g, '#2a2226'); };

// ------------------------------------------------------------------ lantern
export function lantern(seed = 0, { s = 0.85, pad = true } = {}) {
  return cached(`lantern:${seed}:${s}:${pad}`, () => kit(seed * 7 + 11, B => {
    if (pad) {
      const base = G.cyl(0.42, 0.5, 0.1, 9); base.translate(0, 0.03, 0);
      B.add(base, (p, n, o) => { o.set(STONES[2]).multiplyScalar(n.y > 0.5 ? 1 : 0.86); if (n.y > 0.5 && nz(p.x * 7 + seed, p.z * 7) > 0.05) o.lerp(col(MOSS), 0.7); });
    }
    B.at([0, pad ? 0.08 : 0, 0], B.rand(0, 1), () => toro(B, { s }));
    const r = lrng(B);
    for (let k = 0; k < 3; k++) { // moss cushions round the foot, one up on the platform
      const a = r() * TAU, d = 0.36 + r() * 0.12, m = puff(V(Math.cos(a) * d, 0.08, Math.sin(a) * d), 0.1 + r() * 0.06, { detail: 1, noise: 0.4, squash: 0.45, seed: seed + k });
      B.add(m, (p, n, o) => o.set(MOSS).lerp(col(MOSS_HI), clamp(n.y) * 0.5));
    }
    B.light([0, (pad ? 0.08 : 0) + 0.86 * s, 0], { color: '#ffc27a', intensity: 1.6, radius: 4.5, flicker: 0.6, nightOnly: false });
  }));
}

// ------------------------------------------------------------------ path slabs & steps (loose d:stone geometry)
// irregular flagstone: an n-gon slab, gently domed top, bevelled rim, moss creeping in from part of the edge
export function slab(seed = 0, { R = 0.34, h = 0.08, sx = 1, sz = 1, moss = 0.5, tone = null } = {}) {
  return cached(`slab:${seed}:${R}:${h}:${sx}:${sz}:${moss}:${tone}`, () => {
    const r = mulberry32(seed * 131 + 17), n = 7 + Math.floor(r() * 3), ang = [], rad = [];
    for (let i = 0; i < n; i++) { ang.push((i + (r() - 0.5) * 0.55) / n * TAU); rad.push(R * (0.78 + r() * 0.3)); }
    const rings = [[0.0, h + 0.012, 0], [0.72, h + 0.006, 0], [1.0, h - 0.012, 0], [1.08, h * 0.35, 0], [1.12, -0.06, 0]];
    const pos = [], idx = [];
    pos.push(0, h + 0.016, 0);
    for (const [f, y] of rings.slice(1)) for (let i = 0; i < n; i++) pos.push(Math.cos(ang[i]) * rad[i] * f * sx, y, Math.sin(ang[i]) * rad[i] * f * sz);
    for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
    for (let k = 0; k < rings.length - 2; k++) for (let i = 0; i < n; i++) {
      const a = 1 + k * n + i, b = 1 + k * n + (i + 1) % n, c = a + n, d = b + n;
      idx.push(a, b, c, b, d, c);
    }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g = g.toNonIndexed(); g.computeVertexNormals();
    const base = col(tone || ['#c8c0c8', '#bab2bc', '#d2cac8', '#b4acb8', '#c4bcb0'][Math.floor(r() * 5)]), mc = col(MOSS), mh = col(MOSS_HI), ma = r() * TAU;
    return paint(g, (p, nn, o) => {
      const d = Math.hypot(p.x / sx, p.z / sz) / R, a = Math.atan2(p.z, p.x);
      o.copy(base).multiplyScalar(nn.y > 0.7 ? 0.97 + 0.08 * nz(p.x * 9 + seed, p.z * 9) : 0.8);
      const m = (d - 0.62) * 2 + Math.cos(a - ma) * 0.6 + nz(p.x * 11, p.z * 11 + seed) * 0.5 - (1 - moss);
      if (m > 0) o.lerp(mc, clamp(m * 2) * 0.8).lerp(mh, clamp(m - 0.6) * 0.3);
    });
  });
}
// rough stone step: a long, thick slab (w along local x) with a mossy back edge; top at y = h
export function step(seed = 0, { w = 1.6, h = 0.22 } = {}) {
  return cached(`step:${seed}:${w}:${h}`, () => {
    const r = mulberry32(seed * 71 + 5);
    const g = G.box(w, h + 0.2, 0.52, 0.06); g.translate(0, (h - 0.2) / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + nz(y * 3 + seed, z * 4) * 0.04, y + (y > 0 ? nz(x * 2.3 + seed, z * 2) * 0.03 : 0), z + nz(x * 3, y * 3 + seed) * 0.04); }
    g.computeVertexNormals();
    const base = col(['#b8b0bc', '#c4bcc0', '#aca4b0'][Math.floor(r() * 3)]), mc = col(MOSS);
    return paint(g.index ? g.toNonIndexed() : g, (pp, nn, o) => {
      o.copy(base).multiplyScalar(nn.y > 0.6 ? 1.0 : nn.z > 0.5 ? 0.86 : 0.78).multiplyScalar(0.94 + 0.1 * nz(pp.x * 6, pp.y * 6 + pp.z * 5));
      const m = (-pp.z / 0.26) * 0.8 + (nn.y > 0.5 ? 0.3 : -0.2) + nz(pp.x * 5 + seed, pp.z * 5) * 0.5 - 0.35;
      if (m > 0) o.lerp(mc, clamp(m * 2.5) * 0.85);
    });
  });
}

// ------------------------------------------------------------------ shishi-odoshi
// Local layout: basin at the origin; the clapper rocks about local z at the pivot; the spout pours from behind (-z).
export function shishiOdoshi(seed = 0) {
  return cached('shishi:' + seed, () => {
    const pivot = V(-0.62, 0.52, 0.02);
    const pc = kit(seed * 13 + 3, B => {
      // tsukubai: a hand-hewn round basin with a water disc, on a scatter of river stones
      const bowl = G.lathe([[0.001, 0], [0.34, 0], [0.4, 0.1], [0.42, 0.3], [0.36, 0.4], [0.24, 0.41], [0.22, 0.3], [0.001, 0.28]], 14);
      B.add(bowl, mossPaint('#aaa2ae', 0.45, 5));
      const water = G.disc(0.22, 14); water.rotateX(-PI / 2); water.translate(0, 0.36, 0); B.add(water, '#5ab0c8', 'water');
      for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + B.rand(0, 0.5), d = 0.5 + B.rand(0, 0.3); B.at([Math.cos(a) * d, 0, Math.sin(a) * d], B.rand(0, 3), () => kitRock(B, { r: B.rand(0.08, 0.16), sq: 0.5, moss: 0.3 })); }
      // clapper supports: two stakes with a crossbar (the axle) through the rocker
      for (const sz of [-1, 1]) pole(B, V(pivot.x, -0.05, pivot.z + sz * 0.1), V(pivot.x, pivot.y + 0.08, pivot.z + sz * 0.1), 0.028, { color: '#a8c068' });
      B.add(tube([{ p: V(pivot.x, pivot.y, pivot.z - 0.14), r: 0.012 }, { p: V(pivot.x, pivot.y, pivot.z + 0.14), r: 0.012 }], 4, false), C.woodDark);
      // striking stone under the closed end
      B.at([pivot.x - 0.46, 0, pivot.z], 0.4, () => kitRock(B, { r: 0.14, sq: 0.7, moss: 0.35 }));
      // kakei: the feeder pipe from a post behind, its spout over the clapper's mouth
      const post = V(-0.05, 0, -0.95);
      pole(B, V(post.x, -0.05, post.z), V(post.x, 1.12, post.z), 0.055, { color: '#96b85e' });
      const cap = G.cyl(0.058, 0.058, 0.02, 7); cap.translate(post.x, 1.13, post.z); B.add(cap, '#c8b890');
      pole(B, V(post.x, 1.0, post.z + 0.02), V(-0.2, 0.86, -0.08), 0.03, { color: '#9cc262' });
      const spout = G.disc(0.022, 6); spout.lookAt(V(-0.15, -0.14, 0.87)); spout.translate(-0.2, 0.86, -0.08); B.add(spout, '#3a4a30');
      // a thin trickle of water from the spout into the mouth
      B.add(tube([{ p: V(-0.2, 0.85, -0.07), r: 0.008 }, { p: V(-0.21, 0.74, -0.04), r: 0.006 }], 4, false), '#bfe8f4', 'water');
      // a bamboo ladle resting across the basin, moss at the foot
      B.add(tube([{ p: V(-0.3, 0.42, 0.18), r: 0.012 }, { p: V(0.32, 0.43, -0.06), r: 0.012 }], 4, false), '#c8d890');
      const cup = G.cyl(0.05, 0.045, 0.08, 8); cup.translate(0.34, 0.45, -0.07); B.add(cup, '#c8d890');
      for (let k = 0; k < 3; k++) { const a = B.rand(0, TAU), m = puff(V(Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42), 0.09, { detail: 1, noise: 0.4, squash: 0.4, seed: k + seed }); B.add(m, MOSS); }
    });
    // the clapper, in pivot-local space: a bamboo tube along x (closed end at -x on the stone, mouth cut at +x)
    const RB = new Builder(seed + 99); RB.warpAmt = 0; RB.jitter = 0;
    pole(RB, V(-0.5, 0, 0), V(0.42, 0, 0), 0.052, { color: '#92c25c', node: '#5a8a40' });
    const endCap = G.disc(0.052, 8); endCap.rotateY(-PI / 2); endCap.translate(-0.5, 0, 0); RB.add(endCap, '#c8d890');
    const mouth = G.disc(0.05, 8); mouth.rotateY(PI / 2); mouth.rotateZ(0.55); mouth.translate(0.44, 0.02, 0); RB.add(mouth, '#34402c');
    const rim = G.torus(0.05, 0.008, 3, 8); rim.rotateY(PI / 2); rim.rotateZ(0.55); rim.translate(0.44, 0.02, 0); RB.add(rim, '#d8e0a0');
    const rocker = RB.finish().geos.body;
    return { pc, rocker: { geo: rocker, pivot, axis: V(0, 0, 1) } };
  });
}
/** clapper angle over time: slow fill (mouth rising 0.28 -> -0.1 rad as it tilts toward the tip point), quick tip
 *  (mouth down, pours), swing back and clack. Returns { a, clack (true on the frame it strikes), pour 0..1 } */
export function shishiCycle(t, period = 7.5) {
  const u = ((t % period) + period) % period / period;
  if (u < 0.78) return { a: 0.3 - 0.4 * Math.pow(u / 0.78, 1.6), pour: 0 }; // filling: mouth sinks slowly
  if (u < 0.86) { const k = (u - 0.78) / 0.08; return { a: -0.1 - 0.52 * Math.sin(k * PI / 2), pour: k }; } // tips
  if (u < 0.94) { const k = (u - 0.86) / 0.08; return { a: -0.62 + 0.92 * k * k, pour: 1 - k }; } // swings back
  const k = (u - 0.94) / 0.06; return { a: 0.3 + Math.sin(k * PI) * 0.05 * (1 - k), pour: 0, clackWindow: true };
}

// ------------------------------------------------------------------ ruined shrine
// ~6 x 5 m footprint centred on the origin; the approach faces +z. Colliders (local) in .cols.
export function ruinedShrine(seed = 0) {
  return cached('ruin:' + seed, () => kit(seed * 31 + 7, B => {
    const r = lrng(B);
    // cracked platform: a grid of slabs, some tilted or sunk, moss in the joints
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) {
      if ((i === -2 || i === 2) && j === -2 && r() < 0.5) continue;
      const w = 0.78, sx = i * 0.82 + B.wob(0.03), sz = j * 0.82 - 0.4 + B.wob(0.03), tilt = r() < 0.25 ? B.wob(0.12) : B.wob(0.02);
      B.at([sx, r() < 0.2 ? -0.05 : 0, sz], B.wob(0.08), () => { const g = G.box(w, 0.2, w, 0.04); g.translate(0, 0.06, 0); B.add(g, mossPaint(B.pick(STONES), 0.62, 5)); }, 1, tilt, B.wob(0.06));
    }
    // front steps
    for (let k = 0; k < 2; k++) { const g = G.box(1.7 - k * 0.2, 0.14, 0.4, 0.04); g.translate(0, 0.07 - k * 0.04 + 0.02, 1.25 + k * 0.4); B.add(g, mossPaint(STONES[3], 0.55, 5)); }
    // the hokora: a weathered wooden box with lattice doors, gable roof deep in moss, sagging a little
    B.at([0, 0.16, -1.0], B.wob(0.05), () => {
      const base = G.box(1.3, 0.3, 1.0, 0.04); base.translate(0, 0.15, 0); B.add(base, mossPaint('#a8a0a8', 0.5, 6));
      const box = G.box(1.0, 0.95, 0.8, 0.03); box.translate(0, 0.78, 0); B.add(box, (p, n, o) => { o.set('#8a6a54').multiplyScalar(0.86 + 0.14 * nz(p.x * 20, p.y * 3)); if (p.y < 0.45 + nz(p.x * 6, p.z * 6) * 0.1) o.lerp(col('#6a8a4a'), 0.5); });
      for (const sx of [-1, 1]) { const d = G.box(0.4, 0.66, 0.03, 0.01); d.translate(sx * 0.22, 0.74, 0.41); B.add(d, '#4a3228'); for (let k = 0; k < 4; k++) { const l = G.box(0.38, 0.018, 0.02, 0); l.translate(sx * 0.22, 0.5 + k * 0.16, 0.43); B.add(l, '#c8a878'); } }
      const hole = G.box(0.12, 0.2, 0.02, 0); hole.translate(0.3, 0.9, 0.43); B.add(hole, '#1e1618'); // a broken lattice pane
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = G.box(0.08, 1.0, 0.08, 0.01); p.translate(sx * 0.5, 0.78, sz * 0.4); B.add(p, '#6a4a3a'); }
      roof(B, { type: 'gable', w: 1.08, d: 0.88, y0: 1.26, over: 0.34, gOver: 0.26, H: 0.55, curve: 0.3, lift: 0.1, liftW: 0.4, thick: 0.1, ribW: 0.26, color: '#6a7a6a', moss: 0.95, mossColor: '#72a64e', pastel: 0.05 });
      // moss cushions spilling over the roof and a fern growing from the ridge
      for (let k = 0; k < 7; k++) { const x = B.rand(-0.6, 0.6), m = puff(V(x, 1.72 - Math.abs(x) * 0.5 + B.rand(-0.05, 0.05), B.rand(-0.35, 0.35)), 0.14 + r() * 0.08, { detail: 1, noise: 0.35, squash: 0.5, seed: seed + k }); B.add(m, (p, n, o) => o.set(MOSS).lerp(col(MOSS_HI), clamp(n.y) * 0.6)); }
      for (let k = 0; k < 6; k++) { const lf = leafGeo(0.32 + r() * 0.12, 0.07, 0.3); lf.rotateZ(0.7 + r() * 0.4); lf.rotateY(k / 6 * TAU); lf.translate(-0.25, 1.8, 0); B.add(lf, '#5a9a48', 'leaf'); }
      shimenawa(B, { w: 0.9, y: 1.18, sag: 0.08, z: 0.44, r: 0.03 });
      // offering box and a little mirror stand
      const ob = G.box(0.46, 0.22, 0.26, 0.02); ob.translate(0, 0.41, 0.72); B.add(ob, '#7a5a44');
      for (let k = 0; k < 4; k++) { const s = G.box(0.42, 0.02, 0.025, 0); s.translate(0, 0.53, 0.64 + k * 0.05); B.add(s, '#4a3228'); }
    });
    // broken torii: the left pillar stands with half its lintel, the right one lies across the moss
    B.at([-1.2, 0, 2.3], 0.05, () => {
      const p = G.cyl(0.1, 0.12, 2.3, 10); p.translate(0, 1.15, 0); B.add(p, (pp, n, o) => { o.set('#c8583a').lerp(col('#e2a080'), clamp(nz(pp.y * 4, Math.atan2(n.z, n.x)) + 0.1) * 0.5); if (pp.y < 0.5 + nz(pp.x * 9, pp.z * 9) * 0.2) o.lerp(col('#6a9a48'), 0.6); });
      const b = G.cyl(0.16, 0.18, 0.2, 10); b.translate(0, 0.1, 0); B.add(b, '#4a3e40');
      const k1 = G.box(1.3, 0.16, 0.16, 0.03); k1.rotateZ(-0.12); k1.translate(0.55, 2.28, 0); B.add(k1, (pp, n, o) => o.set(n.y > 0.5 ? '#2a2228' : '#c8583a').lerp(col(MOSS), n.y > 0.5 ? 0.55 : 0));
      const nuki = G.box(0.8, 0.1, 0.1, 0.02); nuki.translate(0.35, 1.85, 0); B.add(nuki, '#c8583a');
    });
    B.at([1.6, 0.12, 2.45], 1.35, () => { // fallen pillar + lintel lying in the moss
      const p = G.cyl(0.1, 0.12, 2.1, 10); p.rotateZ(PI / 2); p.translate(0, 0, 0); B.add(p, (pp, n, o) => { o.set('#c05a3e').lerp(col('#e2a080'), clamp(nz(pp.x * 3, pp.z * 9)) * 0.4); if (n.y > 0.4 && nz(pp.x * 5, pp.z * 5) > -0.2) o.lerp(col(MOSS), 0.7); });
    }, 1, 0, 0.04);
    B.at([2.0, 0.08, 1.4], 0.5, () => { const k2 = G.box(1.5, 0.16, 0.18, 0.03); B.add(k2, (pp, n, o) => o.set(n.y > 0.5 ? '#5a6a4a' : '#2a2228').lerp(col(MOSS), n.y > 0.5 ? 0.6 : 0.1)); }, 1, 0.1, 0.08);
    // toppled lantern: roof and firebox on the ground, the post still standing
    B.at([-2.3, 0, 0.6], 0.3, () => {
      const post = G.cyl(0.09, 0.11, 0.55, 8); post.translate(0, 0.28, 0); B.add(post, mossPaint(STONES[1], 0.5));
      const base = G.cyl(0.24, 0.28, 0.1, 6); base.translate(0, 0.05, 0); B.add(base, mossPaint(STONES[2], 0.6));
    });
    B.at([-2.7, 0.14, 1.35], 0.8, () => toro(B, { s: 0.55 }), 1, 1.35, 0.2);
    // two kitsune guardians in red bibs flanking the steps (little and round)
    for (const sx of [-1, 1]) B.at([sx * 1.25, 0, 1.0], -sx * 0.25, () => {
      const pl = G.box(0.4, 0.3, 0.4, 0.04); pl.translate(0, 0.15, 0); B.add(pl, mossPaint(STONES[0], 0.55));
      const st = '#d0c8c4';
      const body = G.sph(0.17, 10, 8); body.scale(0.9, 1.15, 0.9); body.translate(0, 0.46, 0); B.add(body, mossPaint(st, 0.3));
      const head = G.sph(0.12, 10, 8); head.translate(0, 0.72, 0.04); B.add(head, st);
      const snout = G.cone(0.06, 0.16, 8); snout.rotateX(PI / 2); snout.translate(0, 0.7, 0.18); B.add(snout, st);
      for (const e of [-1, 1]) { const ear = G.cone(0.045, 0.14, 6); ear.rotateZ(-e * 0.25); ear.translate(e * 0.07, 0.86, 0.02); B.add(ear, st); const eye = G.box(0.035, 0.008, 0.01, 0); eye.rotateZ(e * 0.3); eye.translate(e * 0.045, 0.75, 0.12); B.add(eye, '#5a4a50'); }
      const tail = G.sph(0.09, 8, 6); tail.scale(0.8, 1.6, 0.8); tail.rotateX(-0.4); tail.translate(sx * 0.1, 0.5, -0.16); B.add(tail, st);
      const bib = G.cone(0.14, 0.14, 10); bib.rotateX(PI); bib.scale(1, 1, 0.7); bib.translate(0, 0.56, 0.06); B.add(bib, C.red);
      const jewel = G.sph(0.03, 6, 5); jewel.translate(0, 0.49, 0.16); B.add(jewel, C.gold);
    });
    // moss drifts over the platform edge
    for (let k = 0; k < 10; k++) { const a = r() * TAU, d = 1.6 + r() * 1.2, m = puff(V(Math.cos(a) * d, 0.05, Math.sin(a) * d * 0.8 - 0.4), 0.2 + r() * 0.16, { detail: 1, noise: 0.35, squash: 0.35, seed: seed * 3 + k }); B.add(m, (p, n, o) => o.set(MOSS).lerp(col(MOSS_HI), clamp(n.y) * 0.5)); }
    B.light([0, 1.0, 0.2], { color: '#ffd8a0', intensity: 1.2, radius: 4, flicker: 0.4, nightOnly: false });
    return { cols: [{ x: 0, z: -1.0, r: 0.8 }, { x: -1.2, z: 2.3, r: 0.25 }, { x: -2.3, z: 0.6, r: 0.3 }, { x: -1.25, z: 1.0, r: 0.3 }, { x: 1.25, z: 1.0, r: 0.3 }] };
  }, 0.02));
}

// ------------------------------------------------------------------ footbridge
// deck along local z from -L/2 to +L/2, top at y(z) = deck + rise * (1 - (2z/L)^2); returns .deckAt(z)
export function footbridge(seed = 0, { L = 4.4, w = 1.35, deck = 0.35, rise = 0.18 } = {}) {
  return cached(`bridge:${seed}:${L}:${w}:${deck}:${rise}`, () => {
    const yAt = z => deck + rise * (1 - Math.pow(2 * z / L, 2));
    const pc = kit(seed * 17 + 1, B => {
      const n = Math.round(L / 0.22);
      for (let i = 0; i < n; i++) {
        const z = -L / 2 + (i + 0.5) * L / n, y = yAt(z), t = Math.atan2(yAt(z + 0.05) - yAt(z - 0.05), 0.1);
        B.at([B.wob(0.03), y - 0.035, z], B.wob(0.02), () => {
          const g = G.box(w + B.wob(0.06), 0.07, L / n - 0.03, 0.012);
          const c = B.pick([C.woodMid, C.timber, shade(C.woodMid, 0.9), '#8a6a50']);
          B.add(g, (p, nn, o) => { o.set(c).multiplyScalar(nn.y > 0.5 ? 0.96 + 0.08 * Math.sin(p.x * 21 + i * 3) : 0.8); if (nn.y > 0.5 && Math.abs(z) > L * 0.36 && nz(p.x * 6 + i, z * 6) > 0.1) o.lerp(col(MOSS), 0.6); });
        }, 1, -t);
      }
      for (const sx of [-1, 1]) { // stringers
        const pts = []; for (let k = 0; k <= 8; k++) { const z = -L / 2 + k / 8 * L; pts.push({ p: V(sx * (w / 2 - 0.12), yAt(z) - 0.12, z), r: 0.06 }); }
        B.add(tube(pts, 5, false), C.woodDark);
      }
      // posts with bamboo rails lashed on, a little bowed
      const zs = [-L / 2 + 0.1, 0, L / 2 - 0.1];
      for (const sx of [-1, 1]) {
        for (const z of zs) {
          const x = sx * (w / 2 + 0.02), y = yAt(z);
          const g = G.cyl(0.05, 0.06, y + 0.95, 7); g.translate(x, (y + 0.95) / 2 - 0.3, z); B.add(g, (p, n, o) => { o.set(C.woodDark); if (p.y < 0.1) o.lerp(col('#5a7a4a'), 0.5); });
          const cap = G.cyl(0.062, 0.062, 0.03, 7); cap.translate(x, y + 0.66, z); B.add(cap, '#4a3a30');
        }
        for (const hy of [0.62, 0.3]) {
          const pts = []; for (let k = 0; k <= 8; k++) { const z = -L / 2 + 0.1 + k / 8 * (L - 0.2); pts.push({ p: V(sx * (w / 2 + 0.07), yAt(z) + hy, z), r: 0.032 }); }
          B.add(tube(pts, 6, false), (p, n, o) => o.set('#a8c068').multiplyScalar(0.86 + 0.18 * clamp(n.y + 0.4)));
          for (const z of zs) tie(B, V(sx * (w / 2 + 0.07), yAt(z) + hy, z));
        }
      }
    }, 0.012);
    return { ...pc, deckAt: yAt, L, w };
  });
}

// ------------------------------------------------------------------ fence, chimes, torii, iwakura, bench
export function fence(seed = 0, { L = 3, h = 0.95 } = {}) {
  return cached(`fence:${seed}:${L}:${h}`, () => kit(seed * 5 + 2, B => {
    const np = Math.max(2, Math.round(L / 0.9) + 1);
    for (let i = 0; i < np; i++) { const x = i / (np - 1) * L; pole(B, V(x, -0.05, 0), V(x, h, 0), 0.045, { color: '#b4a868', node: '#8a7a48' }); const c = G.cyl(0.047, 0.047, 0.02, 6); c.translate(x, h, 0); B.add(c, '#e0d4a0'); }
    const nv = Math.round(L / 0.3);
    for (let i = 0; i <= nv; i++) { const x = i / nv * L; pole(B, V(x, 0, 0.05), V(x, h * 0.86, 0.05), 0.02, { color: '#a8b86a', node: '#7a8a4a' }); }
    for (const y of [0.25, 0.55, h * 0.82]) { pole(B, V(-0.05, y, 0.085), V(L + 0.05, y, 0.085), 0.022, { color: '#b8c070', node: '#8a9a50' }); for (let i = 0; i <= nv; i += 2) tie(B, V(i / nv * L, y, 0.1)); }
  }, 0.015));
}
export function chimes(seed = 0, { L = 3.2, h = 2.5 } = {}) {
  return cached(`chimes:${seed}:${L}:${h}`, () => kit(seed * 3 + 9, B => {
    for (const x of [0, L]) { pole(B, V(x, -0.1, 0), V(x, h, 0), 0.05, { color: '#98bc5c' }); const cap = G.sph(0.05, 6, 4); cap.translate(x, h, 0); B.add(cap, '#c8b890'); }
    const sag = 0.28, at = t => V(t * L, h - 0.12 - Math.sin(t * PI) * sag, 0);
    const pts = []; for (let k = 0; k <= 12; k++) pts.push({ p: at(k / 12), r: 0.012 });
    B.add(tube(pts, 4, false), '#ecd8a0');
    const glass = ['#bfe4ff', '#ffd0e0', '#d8f4d0', '#fff0b8', '#e0d4ff'];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / (n + 0.4), p = at(t), gc = glass[i % glass.length];
      const cord = G.cyl(0.004, 0.004, 0.1, 3); cord.translate(p.x, p.y - 0.05, p.z); B.add(cord, C.ink);
      const bell = G.sph(0.075, 10, 6, 0, TAU, 0, PI * 0.62); bell.translate(p.x, p.y - 0.17, p.z);
      B.add(bell, (pp, nn, o) => { o.set(gc).lerp(col('#ffffff'), clamp(nn.y) * 0.4); const a = Math.atan2(pp.z - p.z, pp.x - p.x); if (Math.abs(Math.sin(a * 2)) < 0.2 && pp.y > p.y - 0.14) o.set('#e84a3a'); }); // painted goldfish dabs
      const clapper = G.cyl(0.006, 0.006, 0.12, 3); clapper.translate(p.x, p.y - 0.24, p.z); B.add(clapper, C.ink);
      // tanzaku: a paper strip that catches the wind (cloth: uv.y = 1 at its top)
      const strip = G.plane(0.07, 0.3, 1, 3); strip.translate(p.x, p.y - 0.45, p.z);
      B.cloth(strip, B.pick(['#fff6e8', '#ff9ec0', '#8fd0ff', '#ffe07a', '#b8f0c8']), { x0: p.x - 0.035, x1: p.x + 0.035, yTop: p.y - 0.3, yBot: p.y - 0.6 });
    }
  }, 0.01));
}
export function torii(seed = 0, { w = 2.6, h = 3.0 } = {}) {
  return cached(`torii:${seed}:${w}:${h}`, () => kit(seed * 19 + 4, B => {
    const pr = 0.13, red = '#d25a3c';
    for (const sx of [-1, 1]) {
      const p = G.cyl(pr * 0.9, pr * 1.05, h, 12); p.rotateZ(sx * 0.03); p.translate(sx * w / 2, h / 2, 0);
      B.add(p, (pp, n, o) => { o.set(red).lerp(col('#e8a888'), clamp(nz(pp.y * 3 + sx, Math.atan2(n.z, n.x) * 2) * 0.8) * 0.35); if (pp.y < 0.6 + nz(pp.x * 8, pp.z * 8) * 0.25) o.lerp(col('#6a9448'), 0.55); });
      const b = G.cyl(pr * 1.35, pr * 1.5, 0.28, 12); b.translate(sx * w / 2, 0.14, 0); B.add(b, mossPaint('#4a3e40', 0.5));
      const ring = G.cyl(pr * 1.02, pr * 1.02, 0.06, 12, true); ring.translate(sx * w / 2, 0.35, 0); B.add(ring, '#2a2228');
    }
    const nuki = G.box(w + 0.6, 0.16, 0.14, 0.03); nuki.translate(0, h * 0.76, 0); B.add(nuki, red);
    const L = w + 1.1, pts = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14 * 2 - 1; pts.push({ p: V(t * L / 2, h + 0.12 + Math.pow(Math.abs(t), 2.6) * 0.3, 0), r: 0.13 }); }
    const kg = tube(pts, 7, false);
    B.add(kg, (pp, n, o) => { o.set('#2a2228'); if (n.y > 0.55 && nz(pp.x * 4, pp.z * 9) > -0.3) o.lerp(col(MOSS), 0.75); });
    B.add(tube(pts.map(q => ({ p: q.p.clone().add(V(0, -0.17, 0)), r: 0.12 })), 7, false), red);
    const gaku = G.box(0.32, 0.42, 0.07, 0.03); gaku.translate(0, h * 0.88, 0.06); B.add(gaku, '#2a2228');
    const plate = G.box(0.24, 0.32, 0.04, 0.02); plate.translate(0, h * 0.88, 0.1); B.add(plate, C.gold);
    shimenawa(B, { w: w - 0.15, y: h * 0.7, sag: 0.18, z: 0.1, r: 0.05 });
  }, 0.015));
}
export function iwakura(seed = 0, { R = 0.9 } = {}) {
  return cached(`iwakura:${seed}:${R}`, () => kit(seed * 23 + 8, B => {
    const g0 = puff(V(0, R * 0.35, 0), R, { detail: 3, noise: 0.28, squash: 0.85, seed: seed + 5 });
    B.add(mossyStone(g0, { amt: 0.55, sc: 2.2 / R, seed, lift: R * 0.07, stone: ['#9892a4', '#c8c2cc'] }), null);
    // the rope girdles the stone a little above its widest point
    const y = R * 0.55, pts = [];
    for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; pts.push({ p: V(Math.cos(a) * R * 1.02, y + Math.sin(a * 2) * 0.03, Math.sin(a) * R * 1.02), r: 0.06 }); }
    B.add(tube(pts, 6, false), (p, n, o) => o.set('#ecd8a0').multiplyScalar(0.86 + 0.14 * Math.sin(Math.atan2(p.z, p.x) * 40)));
    for (let k = 0; k < 5; k++) {
      const a = PI / 2 + (k - 2) * 0.42, x = Math.cos(a) * R * 1.06, z = Math.sin(a) * R * 1.06;
      B.at([x, y - 0.06, z], -a + PI / 2, () => { for (let j = 0; j < 3; j++) { const pl = G.plane(0.08, 0.1); pl.translate(j % 2 ? 0.025 : -0.025, -0.05 - j * 0.09, 0.01); B.cloth(pl, '#ffffff', { x0: -0.06, x1: 0.06, yTop: 0, yBot: -0.3 }); } });
    }
  }, 0.01));
}
export function bambooBench(seed = 0) {
  return cached('bbench:' + seed, () => kit(seed * 11 + 6, B => {
    const w = 1.4;
    for (const sx of [-1, 1]) {
      pole(B, V(sx * (w / 2 - 0.1), -0.02, -0.18), V(sx * (w / 2 - 0.1), 0.42, -0.18), 0.04, { color: '#a8b060' });
      pole(B, V(sx * (w / 2 - 0.1), -0.02, 0.18), V(sx * (w / 2 - 0.1), 0.42, 0.18), 0.04, { color: '#a8b060' });
      pole(B, V(sx * (w / 2 - 0.1), 0.38, -0.24), V(sx * (w / 2 - 0.1), 0.38, 0.24), 0.035, { color: '#98a858' });
    }
    for (let i = 0; i < 6; i++) { const z = -0.2 + i * 0.08; pole(B, V(-w / 2, 0.45, z), V(w / 2, 0.45, z), 0.034, { color: i % 2 ? '#c0c878' : '#b4bc6a', node: '#8a9450' }); }
    // tea tray with a little pot and cups
    const tray = G.box(0.4, 0.03, 0.3, 0.01); tray.translate(0.35, 0.5, 0); B.add(tray, '#6a4a3a');
    const pot = G.sph(0.08, 10, 7); pot.scale(1, 0.8, 1); pot.translate(0.3, 0.57, 0); B.add(pot, '#4a5a6a');
    const lid = G.cyl(0.03, 0.04, 0.03, 8); lid.translate(0.3, 0.63, 0); B.add(lid, '#3a4a5a');
    for (const dz of [-0.08, 0.08]) { const c = G.cyl(0.03, 0.025, 0.05, 8); c.translate(0.45, 0.54, dz); B.add(c, '#e8e0d0'); }
  }, 0.01));
}
