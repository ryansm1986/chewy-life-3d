// Land details: the small things that make Blossom Hollow feel lived in. Trodden grass where feet cut corners, curb
// stones (some mossy, with tufts and pebbles) along every path, wildflower drifts, little shrubs and sunk rocks in the
// lawns, ferns / mushrooms / fallen petals and leaves under trees, logs and stumps at the forest edge; at the pond a
// fishing dock (walkable deck) with a rowboat, reeds, lily pads with lotus and a frog, rocks, pebbles, a stone lantern
// and a bench reached by stepping stones; at the bridge bank rocks, reeds, lily pads, a beached rowboat and stone
// lanterns; on the plaza a signpost, lantern bunting and a chalk hopscotch; a stone-lantern and nobori approach with
// jizo up to the shrine; a wayside shrine and a bench on the waterfall trail; shells and driftwood on the beach.
// Big set-pieces (signpost, lanterns, jizo, dock...) reserve their tiles (`reserved`, checked by VillageSim.canPlace)
// and are skipped by vegetation clearing (rec.keep).
// Everything is drawn through vegetation's BatchedMesh batches (per-instance frustum culling, one draw call per
// material) and registered as vegetation records, so a building, path or zone that claims the ground clears them
// exactly like flowers and bushes -- their colliders and lamp lights go with them (VillageWorld.onVegRemoved).
import * as THREE from 'three';
import { Batch, vegToon } from './vegetation.js';
import { puff, tube, paint, merge } from '../gfx/geom.js';
import { brushTexture } from '../gfx/textures.js';
import { mulberry32, TAU, clamp, Noise } from '../core/util.js';
import { T, WORLD } from './terrain.js';
import { LANDMARKS, PATHS, distToPaths } from './layout.js';
import { Builder, G, C, PI, shade, bar } from './buildings/kit.js';
const nz = (() => { const n = new Noise(5151); return (x, y) => n.n2(x, y); })();
import { toro, chochin, crate, bench, pot, bush, rock as kitRock, lanternPost, mossCap, mossLine, leafGeo, lrng } from './buildings/props.js';
import { boat, bucket, nobori } from './buildings/props2.js';
import { symbol } from './buildings/symbols.js';
import { STONES } from './buildings/parts.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const col = h => new THREE.Color(h);
const UP = V(0, 1, 0);
const P0 = LANDMARKS.plaza;

// ------------------------------------------------------------------ materials
// same painted look as the building kit, but batching-aware (vegToon re-derives the world position per instance)
const GLOW_FRAG = /* glsl */`
  totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb * 1.6, vGl.y)
    * (1.0 + vGl.x * (sin(uTime * 8.3 + vCWorld.x * 2.1 + vCWorld.z * 1.7) * 0.09 + sin(uTime * 19.0 + vCWorld.y * 7.0) * 0.05));
`;
const GLOW_DAY = 0.06, GLOW_NIGHT = 2.1;
function detailMats() {
  const flat = vegToon({ vertexColors: true, brush: 0.1, rim: 0.2, term: [-0.3, 0.3], shadowSat: 0.3 });
  flat.polygonOffset = true; flat.polygonOffsetFactor = -1; flat.polygonOffsetUnits = -4; // decals on the ground
  return {
    body: vegToon({ vertexColors: true, brush: 0.16, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35 }),
    stone: vegToon({ vertexColors: true, brush: 0.28, brushScale: 0.8, rim: 0.3, term: [-0.02, 0.36] }),
    flat,
    grass: vegToon({ vertexColors: true, wind: 'grass', windAmt: 0.8, brush: 0.08, rim: 0.4, term: [-0.3, 0.3], side: THREE.DoubleSide }),
    reed: vegToon({ vertexColors: true, wind: 'reed', windAmt: 1.3, brush: 0.1, rim: 0.5, term: [-0.2, 0.35], side: THREE.DoubleSide }),
    leaf: vegToon({ vertexColors: true, wind: 'leaf', windAmt: 0.45, brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }),
    cloth: vegToon({ vertexColors: true, wind: 'cloth', windAmt: 0.6, side: THREE.DoubleSide, brush: 0.12, rim: 0.3 }),
    glow: vegToon({
      vertexColors: true, emissive: '#ffcf7a', emissiveIntensity: GLOW_DAY, brush: 0.06, rim: 0.12, term: [-0.2, 0.4],
      vertexPars: 'varying vec2 vGl;', vertexWorld: 'vGl = uv;', fragPars: 'varying vec2 vGl;', fragColor: GLOW_FRAG,
    }),
  };
}

// ------------------------------------------------------------------ small hand-built geometry (y = 0 is the ground)
// flat card in the XY plane -> lying on the ground (normal +y)
const layFlat = g => g.rotateX(-PI / 2);
// tilt a y-up normal toward the default camera (+x, +z) so flower faces read
const TOWARD_CAM = new THREE.Matrix4().makeRotationAxis(V(1, 0, -1).normalize(), 0.42);

// Stones: lumpy, a cool darker foot, faint painted grain; mossy ones get a raised moss cap (props.mossCap) draped over
// the top instead of a painted patch
function stoneGeo(seed, moss = 0) {
  const g = puff(V(0, 0.14, 0), 0.5, { detail: 1, noise: 0.3, squash: 0.44, seed });
  const nz = new Noise(seed * 7 + 3);
  const amt = 0.3 + moss * 0.15, cap = moss ? mossCap(g, { amt, lift: 0.035, sc: 4, seed, color: '#78aa56', hi: '#a6cc6a' }) : null;
  paint(g, (p, n, o) => {
    o.set('#b9b0b6').lerp(col('#e2d9d2'), clamp(n.y * 0.6 + 0.2));
    if (p.y < 0.06) o.multiplyScalar(0.8);
    o.multiplyScalar(0.95 + 0.08 * nz.n2(p.x * 9, p.y * 11 + p.z * 5));
    if (cap) o.lerp(col('#78aa56'), clamp((mossLine(n.y, p.x, p.z, amt, 4, seed) + 0.14) * 5) * 0.65);
  });
  return merge(cap ? [g, cap] : [g]);
}
function boulderGeo(seed) {
  const g = puff(V(0, 0.2, 0), 0.6, { detail: 1, noise: 0.34, squash: 0.62, seed });
  const nz = new Noise(seed * 13 + 1);
  const cap = mossCap(g, { amt: 0.5, lift: 0.04, sc: 2.6, seed, color: '#76a854', hi: '#a4cc68' });
  paint(g, (p, n, o) => {
    o.set('#b4acbc').lerp(col('#e0d8dc'), clamp(n.y * 0.5 + 0.3));
    if (p.y < 0.1) o.multiplyScalar(0.8);
    o.multiplyScalar(0.95 + 0.08 * nz.n2(p.x * 7, p.y * 9 + p.z * 4));
    o.lerp(col('#76a854'), clamp((mossLine(n.y, p.x, p.z, 0.5, 2.6, seed) + 0.14) * 5) * 0.65);
  });
  return merge([g, cap]);
}
// wildflower clump: leaf rosette + a few stems with heads (faces tilted toward the camera)
// (tall enough to stand above the 0.3-0.5 m lawn blades: anything lower just disappears in the grass)
export const CLUMP = {
  daisy: [['#ffffff', '#ffd23a'], ['#fff0f6', '#ffc83a'], ['#ffe8f0', '#ffb830']],
  dandelion: [['#ffd23a'], ['#ffc02a'], ['#ffe060']],
  bell: [['#8ea8ff'], ['#b89cff'], ['#ffa8d8']],
  cosmos: [['#ff9ec8', '#ffd84a'], ['#ffc2dc', '#ffd84a'], ['#e88ad8', '#ffe070']],
  lupine: [['#a890ff'], ['#ff9ac8'], ['#8ab4ff']],
};
function clumpGeo(seed, kind, pal) {
  const r = mulberry32(seed * 977 + kind.length * 31), parts = [];
  const nl = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nl; i++) {
    const L = 0.12 + r() * 0.08;
    const lf = new THREE.CircleGeometry(1, 6); lf.scale(0.03, L, 1); lf.translate(0, L, 0);
    lf.rotateX(-(PI / 2 - 0.55 - r() * 0.4)); lf.rotateY(i / nl * TAU + r() * 0.5);
    paint(lf, (p, nn, o) => o.set('#3f8a3c').lerp(col('#86c460'), clamp(Math.hypot(p.x, p.z) / (L * 1.6))));
    parts.push(lf);
  }
  if (kind === 'lupine') { // two or three spikes of little florets, darker at the base, paler at the tip
    const ns = 2 + Math.floor(r() * 2);
    for (let i = 0; i < ns; i++) {
      const a = r() * TAU, d = 0.03 + r() * 0.05, h = 0.48 + r() * 0.2, base = V(Math.cos(a) * d, 0, Math.sin(a) * d);
      const top = base.clone().add(V((r() - 0.4) * 0.06, h, (r() - 0.4) * 0.06));
      const st = tube([{ p: base, r: 0.01 }, { p: top, r: 0.006 }], 3, false); paint(st, (p, nn, o) => o.set('#3f7f38')); parts.push(st);
      const nfl = 12;
      for (let k = 0; k < nfl; k++) {
        const t = 0.5 + 0.5 * k / nfl, q = base.clone().lerp(top, t), rr = 0.034 * (1.1 - t * 0.7), ang = k * 2.4;
        const f = new THREE.IcosahedronGeometry(0.022 * (1.15 - t * 0.5), 0); f.translate(q.x + Math.cos(ang) * rr, q.y, q.z + Math.sin(ang) * rr);
        const c = col(pal[0]).lerp(col('#ffffff'), (t - 0.5) * 0.8);
        paint(f, (p, nn, o) => o.copy(c).multiplyScalar(0.85 + 0.15 * clamp(nn.y + 0.5))); parts.push(f);
      }
    }
    return merge(parts);
  }
  const nf = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nf; i++) {
    const a = r() * TAU, d = r() * 0.08, h = (kind === 'bell' ? 0.36 : 0.32) + r() * 0.2;
    const base = V(Math.cos(a) * d, 0, Math.sin(a) * d);
    const top = base.clone().add(V((r() - 0.3) * 0.1, h, (r() - 0.3) * 0.1));
    const mid = base.clone().lerp(top, 0.5).add(V((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.04));
    const st = tube([{ p: base, r: 0.008 }, { p: mid, r: 0.007 }, { p: top, r: 0.005 }], 3, false);
    paint(st, (p, nn, o) => o.set('#3f7f38').lerp(col('#6aa84a'), clamp(p.y / h))); parts.push(st);
    const head = [];
    if (kind === 'daisy' || kind === 'cosmos') {
      const R = kind === 'daisy' ? 0.056 : 0.066, nP = kind === 'daisy' ? 12 : 8;
      const pet = new THREE.CircleGeometry(R, nP * 2);
      const pp = pet.attributes.position; // scalloped rim: every other rim vertex pulled in -> petals
      for (let k = 1; k < pp.count; k++) if (k % 2 === 0) pp.setXY(k, pp.getX(k) * 0.72, pp.getY(k) * 0.72);
      paint(pet, (p, nn, o) => o.set(pal[0]).lerp(col('#ffffff'), clamp(Math.hypot(p.x, p.y) / R) * 0.25));
      const ctr = new THREE.CircleGeometry(R * 0.36, 6); ctr.translate(0, 0, 0.006); paint(ctr, (p, nn, o) => o.set(pal[1]));
      head.push(pet, ctr);
    } else if (kind === 'dandelion') {
      const seedHead = r() < 0.3;
      const hd = new THREE.IcosahedronGeometry(seedHead ? 0.056 : 0.045, seedHead ? 1 : 0); hd.rotateX(PI / 2); hd.scale(1, 1, seedHead ? 1 : 0.6);
      paint(hd, (p, nn, o) => o.set(seedHead ? '#fffaf0' : pal[0]).multiplyScalar(0.85 + 0.15 * clamp(nn.z)));
      head.push(hd);
    } else { // bell: three little bells nodding from the stem tip
      for (let k = 0; k < 3; k++) {
        const b = new THREE.ConeGeometry(0.03, 0.048, 6, 1, true); b.rotateX(PI / 2); // opening toward -z (down after the flip below)
        b.translate((k - 1) * 0.04, -0.024 - Math.abs(k - 1) * 0.012, 0);
        paint(b, (p, nn, o) => o.set(pal[0]).lerp(col('#ffffff'), 0.15));
        head.push(b);
      }
    }
    for (const g of head) {
      layFlat(g); // XY-plane faces -> up
      if (kind !== 'bell') g.applyMatrix4(TOWARD_CAM);
      g.rotateY(r() * 0.6 - 0.3);
      g.translate(top.x, top.y + 0.004, top.z);
      parts.push(g);
    }
  }
  return merge(parts);
}
// short tuft of grass blades, sometimes with a tiny flower (nestles against curb stones)
function tuftGeo(seed) {
  const r = mulberry32(seed * 61 + 11), parts = [];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, h = 0.1 + r() * 0.14, w = 0.018 + r() * 0.012, lean = 0.2 + r() * 0.35;
    const g = new THREE.BufferGeometry();
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    g.setAttribute('position', new THREE.Float32BufferAttribute([sx * w, 0, sz * w, -sx * w, 0, -sz * w, dx * lean * h, h, dz * lean * h], 3));
    g.computeVertexNormals();
    paint(g, (p, nn, o) => o.set('#4c8e3e').lerp(col('#a4d46a'), clamp(p.y / h)));
    parts.push(g);
  }
  if (r() < 0.45) {
    const f = new THREE.IcosahedronGeometry(0.022, 0); f.translate((r() - 0.5) * 0.08, 0.14, (r() - 0.5) * 0.08);
    const c = ['#ffffff', '#ffe066', '#ffb0d0', '#b8c8ff'][Math.floor(r() * 4)];
    paint(f, (p, nn, o) => o.set(c)); parts.push(f);
  }
  return merge(parts);
}
// arching fern fronds (serrated ribbons: alternate rim vertices pulled in read as leaflets)
function fernGeo(seed) {
  const r = mulberry32(seed * 17 + 3), parts = [];
  const n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.5, L = 0.42 + r() * 0.25, rise = 0.26 + r() * 0.14;
    const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
    const pos = [], idx = [], S = 9;
    for (let k = 0; k <= S; k++) {
      const t = k / S, c = dir.clone().multiplyScalar(L * t).add(V(0, rise * Math.sin(t * PI * 0.8) + 0.02, 0));
      const w = 0.085 * Math.sin(PI * Math.min(1, t * 1.05 + 0.05)) * (k % 2 ? 1 : 0.55) + 0.004;
      const droop = w * 0.45;
      pos.push(c.x + side.x * w, c.y - droop, c.z + side.z * w, c.x - side.x * w, c.y - droop, c.z - side.z * w, c.x, c.y + 0.01, c.z);
      if (k) { const b = (k - 1) * 3, e = k * 3; idx.push(b, e, b + 2, e, e + 2, b + 2, b + 2, e + 2, b + 1, e + 2, e + 1, b + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    paint(g, (p, nn, o) => { const t = Math.hypot(p.x, p.z) / L; o.set('#2f6e36').lerp(col('#8ccc5c'), clamp(t * 1.1)); });
    parts.push(g);
  }
  return merge(parts);
}
// cute mushrooms: red caps with white dots, or tan caps
function mushroomGeo(seed, red) {
  const r = mulberry32(seed * 29 + (red ? 5 : 9)), parts = [];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? 1 : 0.55 + r() * 0.3, a = r() * TAU, d = i ? 0.07 + r() * 0.06 : 0;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.1 * s, R = 0.07 * s;
    const st = new THREE.CylinderGeometry(0.02 * s, 0.028 * s, h, 6, 1, true); st.translate(x, h / 2, z);
    paint(st, (p, nn, o) => o.set('#f6ecd8')); parts.push(st);
    const cap = new THREE.SphereGeometry(R, 8, 4, 0, TAU, 0, PI / 2); cap.scale(1, 0.72, 1); cap.rotateZ((r() - 0.5) * 0.3); cap.translate(x, h - 0.004, z);
    paint(cap, (p, nn, o) => { if (red) o.set('#e84a3a').lerp(col('#ff7a5a'), clamp(nn.y)); else o.set('#b87a4a').lerp(col('#e8b27a'), clamp(nn.y)); });
    parts.push(cap);
    const gill = new THREE.CircleGeometry(R * 0.96, 8); gill.rotateX(PI / 2); gill.translate(x, h - 0.003, z); paint(gill, (p, nn, o) => o.set('#f4e2c4')); parts.push(gill);
    if (red) for (let k = 0; k < 4; k++) {
      const u = 0.25 + r() * 0.6, t = r() * TAU, sr = Math.sin(u * PI / 2);
      const nrm = V(Math.cos(t) * sr, Math.cos(u * PI / 2) * 0.72, Math.sin(t) * sr).normalize();
      const dot = new THREE.CircleGeometry(R * 0.2, 5);
      dot.lookAt(nrm); dot.translate(x + Math.cos(t) * sr * R * 1.01, h + Math.cos(u * PI / 2) * R * 0.73, z + Math.sin(t) * sr * R * 1.01);
      paint(dot, (p, nn, o) => o.set('#fffaf2')); parts.push(dot);
    }
  }
  return merge(parts);
}
// fallen petals / leaves scattered on the ground
function fallenGeo(seed, kind) {
  const r = mulberry32(seed * 43 + kind.length), parts = [];
  if (kind === 'pine') { // a couple of pine cones and little sprays of dropped needles
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = 0.15 + r() * 0.4, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.8 + r() * 0.4;
      const cone = new THREE.LatheGeometry([[0.001, 0], [0.03, 0.012], [0.042, 0.04], [0.038, 0.07], [0.024, 0.095], [0.001, 0.11]].map(([u, v]) => new THREE.Vector2(u * s, v * s)), 7);
      paint(cone, (p, nn, o) => o.set('#8a5a3a').lerp(col('#c89060'), Math.sin(p.y / s * 150) > 0.2 ? 0.55 : 0).multiplyScalar(0.85 + 0.15 * clamp(nn.y + 0.5)));
      cone.rotateZ(PI / 2 - 0.15); cone.rotateY(r() * TAU); cone.translate(x, 0.035 * s, z); parts.push(cone);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.65, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      for (let k = 0; k < 5; k++) {
        const b = r() * TAU, L = 0.09 + r() * 0.05, g = new THREE.PlaneGeometry(L, 0.008); layFlat(g); g.translate(L / 2, 0, 0); g.rotateY(b); g.translate(cx, 0.008 + k * 0.001, cz);
        const nc = col(['#a8784a', '#8a9a4a', '#c8985a'][Math.floor(r() * 3)]);
        paint(g, (p, nn, o) => o.copy(nc));
        parts.push(g);
      }
    }
    return merge(parts);
  }
  const n = kind === 'sakura' ? 16 : kind === 'momiji' ? 14 : 10;
  const pal = { sakura: ['#ffc4dc', '#ffb0cc', '#ffe0ec', '#f79cc0'], momiji: ['#e8483a', '#f0703a', '#ff9a4a', '#d8383a'], ginkgo: ['#ffd84a', '#f4c43a', '#ffe680'], round: ['#8cc452', '#a8c850', '#d8b44a', '#b88440', '#7cb04c'] }[kind];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.6;
    let g;
    if (kind === 'sakura') { g = new THREE.CircleGeometry(0.036, 5); g.scale(1.45, 1, 1); }
    else if (kind === 'round') { // pointed oval leaf with a midrib crease (folded a touch so it catches the light)
      const s = new THREE.Shape(), L = 0.075 + r() * 0.03, W = L * 0.42;
      s.moveTo(-L / 2, 0); s.quadraticCurveTo(0, W, L / 2, 0); s.quadraticCurveTo(0, -W, -L / 2, 0);
      g = new THREE.ShapeGeometry(s, 3);
      const pp = g.attributes.position; for (let k = 0; k < pp.count; k++) pp.setZ(k, Math.abs(pp.getY(k)) * 0.35);
      g.computeVertexNormals();
    }
    else if (kind === 'momiji') {
      const s = new THREE.Shape(), R = 0.07;
      for (let k = 0; k < 10; k++) { const t = k / 10 * TAU + PI / 2, rr = k % 2 ? R * 0.42 : R; k ? s.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : s.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
      g = new THREE.ShapeGeometry(s, 1);
    } else { g = new THREE.CircleGeometry(0.06, 6, 0.4, PI - 0.8); g.translate(0, -0.02, 0); }
    layFlat(g); g.rotateX((r() - 0.5) * 0.3); g.rotateY(r() * TAU); g.translate(Math.cos(a) * d, 0.012 + r() * 0.012, Math.sin(a) * d);
    const c = col(pal[Math.floor(r() * pal.length)]);
    paint(g, (p, nn, o) => o.copy(c));
    parts.push(g);
  }
  return merge(parts);
}
// cattail / reed clump for the water's edge
function reedGeo(seed) {
  const r = mulberry32(seed * 71 + 13), parts = [];
  const n = 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = r() * 0.18, h = 0.6 + r() * 0.55, lean = 0.12 + r() * 0.3, w = 0.03 + r() * 0.012;
    const b = V(Math.cos(a) * d, 0, Math.sin(a) * d), dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
    const pos = [], idx = [], S = 5;
    for (let k = 0; k <= S; k++) {
      const t = k / S, c = b.clone().addScaledVector(dir, lean * h * t * t).add(V(0, h * t, 0)), ww = w * (1 - t * 0.9);
      pos.push(c.x + side.x * ww, c.y, c.z + side.z * ww, c.x - side.x * ww, c.y, c.z - side.z * ww);
      if (k) { const p0 = (k - 1) * 2; idx.push(p0, p0 + 1, p0 + 2, p0 + 1, p0 + 3, p0 + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    paint(g, (p, nn, o) => o.set('#4a8a42').lerp(col('#a8cc6a'), clamp(p.y / h)));
    parts.push(g);
  }
  const nc = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nc; i++) {
    const a = r() * TAU, d = r() * 0.12, h = 0.85 + r() * 0.4, lx = (r() - 0.5) * 0.12, lz = (r() - 0.5) * 0.12;
    const b = V(Math.cos(a) * d, 0, Math.sin(a) * d), top = b.clone().add(V(lx, h, lz));
    const st = tube([{ p: b, r: 0.009 }, { p: b.clone().lerp(top, 0.6), r: 0.008 }, { p: top.clone().add(V(0, 0.12, 0)), r: 0.004 }], 3, true);
    paint(st, (p, nn, o) => o.set('#5a8a40')); parts.push(st);
    const hd = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6); hd.translate(top.x, top.y - 0.06, top.z);
    paint(hd, (p, nn, o) => o.set('#6e4030').lerp(col('#8a5a3a'), clamp(nn.y * 0.5 + 0.3))); parts.push(hd);
  }
  return merge(parts);
}
// lily pad (notched disc), optionally with a pink lotus flower
function lilyGeo(seed, flower) {
  const r = mulberry32(seed * 37 + (flower ? 3 : 0)), parts = [];
  const R = 0.2 + r() * 0.1, notch = 0.32;
  const pad = new THREE.CircleGeometry(R, 12, notch, TAU - notch * 2); pad.scale(1, 0.94, 1); layFlat(pad);
  paint(pad, (p, nn, o) => { const t = Math.hypot(p.x, p.z) / R; o.set('#4e9a46').lerp(col('#7cc25a'), clamp(t)); if (t > 0.92) o.multiplyScalar(0.86); });
  parts.push(pad);
  if (flower) {
    const cx = (r() - 0.5) * 0.06, cz = (r() - 0.5) * 0.06, pink = r() < 0.7;
    for (let ring = 0; ring < 2; ring++) {
      const np = ring ? 5 : 8, len = ring ? 0.06 : 0.08, up = ring ? 0.95 : 0.55;
      for (let k = 0; k < np; k++) {
        const a = k / np * TAU + ring * 0.4;
        const pg = new THREE.SphereGeometry(1, 6, 4); pg.scale(0.028, 0.012, len); pg.translate(0, 0, len * 0.9);
        pg.rotateX(-up); pg.rotateY(a); pg.translate(cx, 0.03, cz);
        paint(pg, (p, nn, o) => o.set(pink ? '#ff9cc4' : '#fff4f8').lerp(col(pink ? '#ffe4f0' : '#ffffff'), clamp((p.y - 0.03) / 0.06)));
        parts.push(pg);
      }
    }
    const c = new THREE.CylinderGeometry(0.018, 0.022, 0.03, 6); c.translate(cx, 0.045, cz); paint(c, (p, nn, o) => o.set('#ffd84a')); parts.push(c);
  }
  return merge(parts);
}
// a little frog (sits on a lily pad)
function frogGeo() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.08, 10, 7); body.scale(1, 0.72, 1.12); body.translate(0, 0.05, 0);
  paint(body, (p, n, o) => o.set('#6cc05a').lerp(col('#e8f4b0'), clamp(-n.y * 0.8 + (n.z > 0.5 ? 0.3 : 0))));
  parts.push(body);
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.03, 8, 6); eye.translate(sx * 0.042, 0.1, 0.045); paint(eye, (p, n, o) => o.set('#7ccc66')); parts.push(eye);
    const w = new THREE.SphereGeometry(0.021, 8, 6); w.translate(sx * 0.046, 0.104, 0.062); paint(w, (p, n, o) => o.set('#ffffff')); parts.push(w);
    const pu = new THREE.SphereGeometry(0.011, 6, 4); pu.translate(sx * 0.048, 0.106, 0.079); paint(pu, (p, n, o) => o.set('#2a2226')); parts.push(pu);
    const ck = new THREE.CircleGeometry(0.014, 6); ck.lookAt(V(sx * 0.7, 0, 1)); ck.translate(sx * 0.058, 0.055, 0.075); paint(ck, (p, n, o) => o.set('#ff9ab0')); parts.push(ck);
    const leg = new THREE.SphereGeometry(0.035, 6, 4); leg.scale(1, 0.55, 1.5); leg.translate(sx * 0.07, 0.02, -0.03); paint(leg, (p, n, o) => o.set('#5ab04a')); parts.push(leg);
    const arm = new THREE.SphereGeometry(0.018, 6, 4); arm.scale(1, 0.6, 1.4); arm.translate(sx * 0.045, 0.012, 0.08); paint(arm, (p, n, o) => o.set('#5ab04a')); parts.push(arm);
  }
  return merge(parts);
}
// beach: scallop shell, spiral shell, starfish
function shellGeo(seed, kind) {
  const r = mulberry32(seed * 19 + kind.length), parts = [];
  const pal = ['#fff0e0', '#ffd8c8', '#ffe8b8', '#ffc4c8', '#f8f0f8'];
  const c = col(pal[Math.floor(r() * pal.length)]);
  if (kind === 'scallop') {
    const g = new THREE.CircleGeometry(0.075, 10, 0.15, PI - 0.3); g.translate(0, -0.035, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.022 * (1 - (p.getX(i) ** 2 + (p.getY(i) + 0.035) ** 2) / 0.006));
    g.computeVertexNormals(); layFlat(g);
    paint(g, (pp, nn, o) => { const a = Math.atan2(pp.z + 0.035, pp.x); o.copy(c).multiplyScalar(0.84 + 0.16 * Math.abs(Math.sin(a * 5))); });
    parts.push(g);
  } else if (kind === 'spiral') {
    const g = new THREE.ConeGeometry(0.032, 0.09, 7); g.rotateZ(PI / 2 - 0.2); g.translate(0, 0.028, 0);
    paint(g, (p, nn, o) => o.copy(c).lerp(col('#e89a6a'), Math.sin(p.x * 120) > 0.3 ? 0.45 : 0));
    parts.push(g);
  } else {
    const s = new THREE.Shape(), R = 0.08;
    for (let k = 0; k < 10; k++) { const t = k / 10 * TAU + PI / 2, rr = k % 2 ? R * 0.38 : R; k ? s.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : s.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1 });
    layFlat(g); g.translate(0, 0.012, 0);
    const sc = col(['#ff8a5a', '#ff9ab0', '#ffb04a'][Math.floor(r() * 3)]);
    paint(g, (p, nn, o) => o.copy(sc).lerp(col('#fff0d8'), nn.y > 0.8 && Math.hypot(p.x, p.z) < 0.025 ? 0.4 : 0));
    parts.push(g);
  }
  return merge(parts);
}

// ------------------------------------------------------------------ bigger pieces, built with the building kit
// (warp + painted ground AO for free); returns bucket geometries + lamp lights in local space
function kit(seed, fn, warp = 0.025) {
  const B = new Builder(seed); B.warpAmt = warp; B.jitter = 0.04;
  fn(B);
  const t = B.finish();
  return { ...t.geos, lights: t.lights };
}
const ringCap = (r0, bark) => (p, n, o) => {
  const d = Math.hypot(p.y, p.z) / r0;
  if (d > 0.86) o.set(bark); else o.set('#ecc890').lerp(col('#c89a68'), (Math.sin(d * 26) * 0.5 + 0.5) * 0.6 + d * 0.2);
};
// bark with ridges: the cylinder's radius wobbles with angle (deep furrows) and a little with length
function ridged(g, n, amt, axis = 'y') {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v, w] = axis === 'y' ? [x, z, y] : [y, z, x];
    const rr = Math.hypot(u, v); if (rr < 1e-4) continue;
    const k = 1 + amt * (Math.pow(Math.abs(Math.sin(Math.atan2(v, u) * n * 0.5)), 0.6) - 0.6) + amt * 0.3 * Math.sin(w * 9 + u * 3);
    if (axis === 'y') p.setXYZ(i, x * k, y, z * k); else p.setXYZ(i, x, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
// Fallen log: furrowed bark (moss on top in patches), cut ends with growth rings and a dark heart crack, a snapped
// branch stub, a knot hole, a shelf of bracket fungi and a row of little mushrooms, a fern sprig at one end
function logPiece(seed, L) {
  return kit(seed, B => {
    const r0 = 0.19, bark = '#7a5642', y = r0 * 0.88, rr = lrng(B);
    const g = new THREE.CylinderGeometry(r0, r0 * 1.1, L, 14, 3, true); g.rotateZ(PI / 2); ridged(g, 14, 0.07, 'x'); g.translate(0, y, 0);
    B.add(g, (p, n, o) => {
      o.set(bark).multiplyScalar(0.82 + 0.2 * clamp(Math.hypot(p.y - y, p.z) / r0 - 0.9) * 2 + 0.06 * Math.sin(p.x * 11));
      const m = n.y - 0.7 + nz(p.x * 3.3 + seed, p.z * 6) * 0.5; if (m > 0) o.lerp(col('#78aa52'), clamp(m * 4) * 0.85);
    });
    for (const sx of [-1, 1]) {
      const cap = G.disc(r0 * (sx > 0 ? 1.1 : 1) - 0.004, 14); cap.rotateY(sx * PI / 2); cap.translate(sx * L / 2, y, 0);
      B.add(cap, (p, n, o) => { ringCap(r0, bark)(p, n, o); if (Math.abs(p.z) < 0.008 && p.y > y) o.multiplyScalar(0.6); });
    }
    const stub = G.cyl(0.05, 0.07, 0.3, 6); stub.rotateZ(-0.9); stub.translate(L * 0.15, y + 0.2, 0.05);
    B.add(stub, (p, n, o) => o.set(n.x * Math.sin(0.9) + n.y * Math.cos(0.9) > 0.9 ? '#e8c08a' : bark)); // pale snapped end
    const knot = G.disc(0.045, 8); knot.translate(-L * 0.12, y + 0.02, r0 + 0.012); B.add(knot, (p, n, o) => o.set(Math.hypot(p.x + L * 0.12, p.y - y - 0.02) < 0.025 ? '#3a2620' : '#a07858'));
    for (let i = 0; i < 3; i++) { // bracket fungi shelf on the camera side
      const f = new THREE.SphereGeometry(0.07 - i * 0.012, 8, 3, 0, PI, 0, PI / 2); f.scale(1, 0.35, 0.8); f.translate(L * 0.3 + i * 0.05, y - 0.02 + i * 0.07, r0 * 0.9);
      B.add(f, (p, n, o) => o.set(n.y > 0.3 ? '#e8b878' : '#c88850').lerp(col('#fff0d0'), clamp(n.y) * 0.3));
    }
    for (let i = 0; i < 3; i++) {
      const x = -L * 0.3 + i * 0.12, s = 1 - i * 0.2;
      const st = G.cyl(0.018 * s, 0.024 * s, 0.07 * s, 5); st.translate(x, y + r0 * 0.3, r0 + 0.02); B.add(st, '#f6ecd8');
      const cap = new THREE.SphereGeometry(0.05 * s, 7, 3, 0, TAU, 0, PI / 2); cap.scale(1, 0.65, 1); cap.translate(x, y + r0 * 0.3 + 0.03 * s, r0 + 0.03); B.add(cap, '#c8864a');
    }
    for (let k = 0; k < 5; k++) { const lf = leafGeo(0.24 + rr() * 0.1, 0.05, 0.3); lf.rotateZ(0.7 + rr() * 0.4); lf.rotateY(-PI / 2 + (k - 2) * 0.5); lf.translate(-L / 2 - 0.02, 0.02, 0.05); B.add(lf, '#5a9a48', 'leaf'); }
  });
}
// Tree stump: furrowed bark with a mossy foot, flaring roots, a sawn top with growth rings, a radial crack and a pale
// cambium ring, a moss cushion or a mushroom pair, a little sapling sprouting from the side
function stumpPiece(seed) {
  return kit(seed, B => {
    const bark = '#6e4e3e', h = 0.34, rr = lrng(B);
    const g = new THREE.CylinderGeometry(0.25, 0.31, h, 16, 2, true); ridged(g, 16, 0.08); g.translate(0, h / 2, 0);
    B.add(g, (p, n, o) => { o.set(bark).multiplyScalar(0.8 + 0.3 * clamp(Math.hypot(p.x, p.z) / 0.28 - 0.85) * 2); if (p.y < 0.1 + nz(p.x * 9, p.z * 9) * 0.06) o.lerp(col('#6e9a4e'), 0.55); });
    const top = G.disc(0.25, 16); top.rotateX(-PI / 2); top.translate(0, h, 0);
    B.add(top, (p, n, o) => {
      const d = Math.hypot(p.x, p.z) / 0.25;
      if (d > 0.9) o.set(bark); else if (d > 0.82) o.set('#f4dca8'); else o.set('#ecc890').lerp(col('#c89a68'), (Math.sin(d * 26) * 0.5 + 0.5) * 0.6 + d * 0.2);
      const a = Math.atan2(p.z, p.x); if (Math.abs(a - 0.6) < 0.08 && d < 0.8) o.multiplyScalar(0.65); // radial check crack
    });
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + B.rand(0, 0.6);
      const rt = tube([{ p: V(Math.cos(a) * 0.2, 0.14, Math.sin(a) * 0.2), r: 0.07 }, { p: V(Math.cos(a) * 0.38, 0.04, Math.sin(a) * 0.38), r: 0.045 }, { p: V(Math.cos(a) * 0.5, -0.02, Math.sin(a) * 0.5), r: 0.02 }], 5, true);
      B.add(rt, bark);
    }
    if (B.chance(0.6)) { const m = puff(V(0.1, h + 0.012, -0.05), 0.08, { detail: 1, noise: 0.4, squash: 0.3, seed }); B.add(m, (p, n, o) => o.set('#7aae58').lerp(col('#a8cc6a'), clamp(n.y) * 0.4)); }
    else for (let i = 0; i < 2; i++) { const s = 1 - i * 0.3, st = G.cyl(0.016 * s, 0.02 * s, 0.06 * s, 5); st.translate(-0.08 + i * 0.07, h + 0.03 * s, 0.05); B.add(st, '#f6ecd8'); const cp = new THREE.SphereGeometry(0.045 * s, 7, 3, 0, TAU, 0, PI / 2); cp.scale(1, 0.6, 1); cp.translate(-0.08 + i * 0.07, h + 0.055 * s, 0.05); B.add(cp, '#e84a3a'); }
    // sapling: a thin stem with three leaves growing out of the bark
    const sa = rr() * TAU, sx = Math.cos(sa) * 0.3, sz = Math.sin(sa) * 0.3;
    B.add(tube([{ p: V(sx, 0.12, sz), r: 0.01 }, { p: V(sx * 1.1, 0.26, sz * 1.1), r: 0.007 }], 3, true), '#6a8a3a');
    for (let k = 0; k < 3; k++) { const lf = leafGeo(0.09, 0.035); lf.rotateZ(0.5); lf.rotateY(k * 2.1 + sa); lf.translate(sx * 1.1, 0.26, sz * 1.1); B.add(lf, '#6ab04c', 'leaf'); }
  });
}
// wooden fishing dock running along local +z from the bank (z = 0) out over the water; deck top at yd
function dockPiece(seed, L, yd) {
  return kit(seed, B => {
    const w = 1.2, n = Math.round(L / 0.23);
    for (let i = 0; i < n; i++) {
      const z = (i + 0.5) * L / n;
      const g = G.box(w + B.wob(0.05), 0.065, L / n - 0.025, 0.012); g.translate(B.wob(0.025), yd - 0.033, z);
      const c = B.pick([C.woodLight, C.woodPale, shade(C.woodLight, 0.92), '#d8a06a']);
      B.add(g, (p, nn, o) => { o.set(c); if (nn.y > 0.5) o.multiplyScalar(0.95 + 0.08 * Math.sin(p.x * 23 + i * 3)); }); // wood grain
      for (const sx of [-1, 1]) for (const dz of [-0.04, 0.04]) { const nl = G.disc(0.01, 4); nl.rotateX(-PI / 2); nl.translate(sx * (w / 2 - 0.12), yd + 0.001, z + dz); B.add(nl, '#5a5460'); } // nail heads over the stringers
    }
    for (const sx of [-1, 1]) { const s = G.box(0.1, 0.1, L, 0.02); s.translate(sx * (w / 2 - 0.12), yd - 0.11, L / 2); B.add(s, C.timber); }
    const wet = (p, nn, o) => { o.set(C.timber); if (p.y < 0.05) o.set('#5a4a3e').lerp(col('#5a7a4a'), clamp((0.05 - p.y) * 3)); };
    for (const z of [0.25, L * 0.52, L - 0.1]) for (const sx of [-1, 1]) {
      const top = z > L - 0.5 ? yd + 0.32 : yd - 0.02, x = sx * (w / 2 - 0.02);
      const g = G.cyl(0.07, 0.08, top + 0.85, 7); g.translate(x, (top - 0.85) / 2, z); B.add(g, wet);
      if (top > yd) {
        const c = G.cyl(0.085, 0.085, 0.04, 7); c.translate(x, top, z); B.add(c, shade(C.timber, 0.85));
        for (let k = 0; k < 3; k++) { const wr = G.cyl(0.075, 0.075, 0.014, 7, true); wr.translate(x, yd + 0.1 + k * 0.022, z); B.add(wr, '#e8d4a0'); } // rope lashing
      }
    }
    // cross braces under the deck between the leg pairs
    for (const z of [0.25, L * 0.52]) B.add(bar(V(-(w / 2 - 0.02), yd - 0.12, z), V(w / 2 - 0.02, -0.25, z), 0.05, 0), C.timber);
    // rope coil on the end post, bucket, tackle box, and a rod propped against the end post with its line in the water
    const coil = G.torus(0.09, 0.025, 5, 12); coil.rotateX(PI / 2); coil.translate(-(w / 2 - 0.02), yd + 0.1, L - 0.1); B.add(coil, '#e8d4a0');
    B.at([0.28, yd, L - 0.62], 0.3, () => bucket(B, { r: 0.1, h: 0.15, color: '#8aa0b8' }));
    B.at([0.3, yd + 0.15, L - 0.62], 0, () => { for (let k = 0; k < 2; k++) { const f = G.sph(0.03, 6, 4); f.scale(2, 0.7, 0.9); f.rotateY(k * 1.3); f.translate(B.wob(0.03), 0, B.wob(0.03)); B.add(f, '#8ab8e0'); } });
    B.at([-0.3, yd, L - 0.95], 0.2, () => crate(B, { s: 0.22, wood: '#6a9ac8' }));
    const tip = V(0.95, yd + 1.25, L + 0.55), grip = V(0.3, yd + 0.02, L - 0.35);
    B.add(tube([{ p: grip, r: 0.022 }, { p: grip.clone().lerp(tip, 0.5).add(V(0, 0.05, 0)), r: 0.014 }, { p: tip, r: 0.007 }], 5, false), C.woodMid);
    const reel = G.cyl(0.035, 0.035, 0.03, 8); reel.rotateZ(PI / 2); reel.translate(grip.x + 0.06, grip.y + 0.1, grip.z + 0.09); B.add(reel, C.iron);
    const bob = V(1.25, 0.03, L + 1.35);
    B.add(tube([{ p: tip, r: 0.004 }, { p: tip.clone().lerp(bob, 0.5).add(V(0, -0.35, 0)), r: 0.004 }, { p: bob.clone().add(V(0, 0.04, 0)), r: 0.004 }], 3, false), '#f4f0e8');
    const b1 = G.sph(0.045, 8, 6); b1.translate(bob.x, bob.y + 0.02, bob.z); B.add(b1, (p, nn, o) => o.set(p.y > bob.y + 0.02 ? '#e8403a' : '#fffaf2'));
    // lantern post at the end corner
    B.at([-(w / 2) - 0.05, yd, L - 0.55], PI / 2, () => lanternPost(B, { h: 1.35, color: C.red }));
    B.light([-(w / 2) + 0.3, yd + 1.1, L - 0.55], { color: '#ffb468', intensity: 3, radius: 6, flicker: 0.6 });
    // a little rowboat tied alongside
    B.at([-(w / 2 + 0.66), -0.1, L * 0.66], -0.08, () => boat(B, { L: 1.5, trim: '#e8807a' }), 1);
    const rope = tube([{ p: V(-(w / 2 - 0.02), yd - 0.05, L * 0.52), r: 0.012 }, { p: V(-(w / 2 + 0.25), 0.15, L * 0.56), r: 0.012 }, { p: V(-(w / 2 + 0.5), 0.2, L * 0.66 - 0.6), r: 0.012 }], 4, false);
    B.add(rope, '#e8d4a0');
  }, 0.02);
}
function beachedBoatPiece(seed) {
  return kit(seed, B => {
    B.at([0, -0.04, 0], 0, () => boat(B, { L: 1.6, color: '#f4ece0', trim: '#5a8ac8' }), 1, 0, 0.12);
    for (const sx of [-1, 1]) {
      const oar = tube([{ p: V(sx * 0.12, 0.26, -0.55), r: 0.018 }, { p: V(sx * 0.18, 0.3, 0.45), r: 0.016 }], 5, true); B.add(oar, C.woodLight);
      const blade = G.box(0.08, 0.015, 0.26, 0.006); blade.translate(sx * 0.19, 0.3, 0.58); B.add(blade, C.woodLight);
    }
    const rope = tube([{ p: V(0, 0.2, -0.78), r: 0.012 }, { p: V(0.05, 0.03, -1.0), r: 0.012 }, { p: V(0.2, 0.02, -1.25), r: 0.012 }], 4, false); B.add(rope, '#e8d4a0');
    const stake = G.cyl(0.03, 0.035, 0.3, 6); stake.translate(0.22, 0.12, -1.28); B.add(stake, C.woodDark);
  });
}
function toroRockPiece(seed, s = 0.72) {
  return kit(seed, B => {
    kitRock(B, { r: 0.46, sq: 0.42, moss: 0.6 });
    B.at([0, 0.14, 0], B.rand(0, 1), () => toro(B, { s }));
    B.light([0, 0.14 + 0.92 * s, 0], { color: '#ffc080', intensity: 3.2, radius: 6, flicker: 0.7 });
  });
}
// path lantern on a pad of fitted flagstones with moss in the joints and a pebble or two
function toroPiece(seed, s = 0.8, lamp = 1) {
  return kit(seed, B => {
    const base = G.cyl(0.36, 0.42, 0.08, 8); base.translate(0, 0.04, 0);
    B.add(base, (p, n, o) => {
      o.set(STONES[2]).multiplyScalar(n.y > 0.5 ? 1 : 0.88);
      if (n.y > 0.5) { const a = Math.atan2(p.z, p.x), seam = Math.abs(Math.sin(a * 2.5 + 0.4)) < 0.1 || Math.abs(Math.hypot(p.x, p.z) - 0.2) < 0.02; if (seam) o.lerp(col('#7cae5a'), 0.7); }
    });
    for (let k = 0; k < 3; k++) { const a = k * 2.3 + seed, pb = G.ico(0.035 + (k % 2) * 0.02, 0); pb.scale(1.2, 0.6, 1); pb.translate(Math.cos(a) * 0.46, 0.015, Math.sin(a) * 0.46); B.add(pb, STONES[k % STONES.length]); }
    B.at([0, 0.07, 0], 0, () => toro(B, { s }));
    B.light([0, 0.07 + 0.92 * s, 0], { color: '#ffb070', intensity: 3 * lamp, radius: 6 * Math.sqrt(lamp), flicker: 0.7 });
  });
}
// signpost with arrow boards. arms: [{a (world angle, direction (cos a, sin a)), sym, color}]
function signpostPiece(seed, arms) {
  return kit(seed, B => {
    const post = G.box(0.11, 1.95, 0.11, 0.03); post.translate(0, 0.975, 0); B.add(post, (p, n, o) => { o.set(C.woodDark).multiplyScalar(0.9 + 0.14 * nz(p.y * 6, p.x * 20 + p.z * 20)); if (p.y < 0.2 + nz(p.x * 30, p.z * 30) * 0.06) o.lerp(col('#6e8a4a'), 0.5); });
    // a little gabled shingle cap over the post top
    for (const s of [-1, 1]) { const r = G.box(0.2, 0.025, 0.24, 0.008); r.rotateZ(-s * 0.6); r.translate(s * 0.075, 2.0, 0); B.add(r, (p, n, o) => o.set('#5d6f9e').multiplyScalar(0.9 + 0.12 * Math.sin(p.z * 60))); }
    const ridge = G.box(0.035, 0.035, 0.26, 0.01); ridge.translate(0, 2.055, 0); B.add(ridge, '#4a5a86');
    const knob = G.sph(0.03, 6, 4); knob.translate(0, 2.08, 0.12); B.add(knob, C.gold);
    // a round sparrow perched on the ridge
    B.at([0.01, 2.08, -0.05], 0.6, () => {
      const body = G.sph(0.05, 8, 6); body.scale(1, 0.9, 1.25); body.translate(0, 0.04, 0); B.add(body, (p, n, o) => o.set(n.y < -0.2 ? '#f6e8d0' : '#a8764a'));
      const head = G.sph(0.034, 8, 6); head.translate(0, 0.085, 0.045); B.add(head, '#8a5a3a');
      const cheek = G.sph(0.018, 5, 4); cheek.translate(0, 0.078, 0.07); B.add(cheek, '#fff6ea');
      const beak = G.cone(0.01, 0.025, 4); beak.rotateX(PI / 2); beak.translate(0, 0.082, 0.085); B.add(beak, '#e8a040');
      for (const sx of [-1, 1]) { const e = G.sph(0.006, 4, 3); e.translate(sx * 0.02, 0.092, 0.072); B.add(e, C.ink); }
      const tail = G.box(0.04, 0.012, 0.06, 0); tail.rotateX(-0.5); tail.translate(0, 0.05, -0.08); B.add(tail, '#6a4a30');
    });
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; B.at([Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14], a, () => kitRock(B, { r: 0.1, sq: 0.5, moss: 0.4 })); }
    arms.forEach((arm, i) => {
      const y = 1.66 - i * 0.3;
      B.at([0, y, 0], -arm.a + B.wob(0.04), () => {
        const s = new THREE.Shape();
        s.moveTo(0.05, -0.1); s.lineTo(0.6, -0.1); s.lineTo(0.72, 0); s.lineTo(0.6, 0.1); s.lineTo(0.05, 0.1); s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
        g.translate(0, 0, -0.0225);
        const c = col(arm.color || C.woodPale);
        B.add(g, (p, n, o) => { o.copy(c); if (Math.abs(n.z) < 0.7) o.multiplyScalar(0.78); else if (p.y > 0.075 || p.y < -0.075 || p.x < 0.08 || p.x > 0.66 - Math.abs(p.y) * 1.2) o.multiplyScalar(0.86); }); // darker bevelled rim
        for (const side of [1, -1]) {
          B.at([0.36, 0, side * 0.036], side > 0 ? 0 : PI, () => symbol(B, arm.sym, 0.15, { depth: 0.015 }));
          for (const x of [0.12, 0.56]) { const nl = G.disc(0.009, 4); if (side < 0) nl.rotateY(PI); nl.translate(x, 0, side * 0.0352); B.add(nl, '#5a5460'); }
        }
      }, 1, 0, B.wob(0.05));
    });
  }, 0.01);
}
// tall bunting pole (the strings are separate pieces)
function polePiece(seed, h) {
  return kit(seed, B => {
    const p = G.cyl(0.055, 0.07, h, 8); p.translate(0, h / 2, 0); B.add(p, C.vermilion);
    const base = G.cyl(0.16, 0.2, 0.14, 8); base.translate(0, 0.07, 0); B.add(base, STONES[1]);
    const top = G.sph(0.075, 8, 6); top.translate(0, h + 0.04, 0); B.add(top, C.gold);
    const ring = G.torus(0.07, 0.015, 4, 10); ring.rotateX(PI / 2); ring.translate(0, h - 0.12, 0); B.add(ring, C.iron);
    B.at([0.3, 0, 0.12], 0, () => pot(B, { r: 0.13, h: 0.2, plant: 'flowers', flowers: ['#ff8fb0', '#ffffff'] }));
    B.at([-0.1, 0, 0.32], 0, () => pot(B, { r: 0.1, h: 0.16, color: '#e8e0d0', plant: 'flowers', flowers: ['#ffd24a', '#ff9ec0'] }));
  }, 0.01);
}
// a sagging string of pennants and paper lanterns from a to b (local coordinates: a at the origin)
function buntingPiece(seed, a, b, sag, lanterns = true) {
  return kit(seed, B => {
    const d = b.clone().sub(a), L = Math.hypot(d.x, d.z), dir = V(d.x / L, 0, d.z / L);
    const at = t => V(dir.x * L * t, d.y * t - Math.sin(t * PI) * sag, dir.z * L * t);
    const pts = []; for (let k = 0; k <= 16; k++) pts.push({ p: at(k / 16), r: 0.012 });
    B.add(tube(pts, 4, false), '#fff0dc');
    const yaw = Math.atan2(-dir.z, dir.x); // local +x along the string
    const pal = ['#ff8fb0', '#ffd24a', '#8fd0ff', '#8fe0c0', '#ffffff', '#c8a8ff'];
    const n = Math.floor(L / 0.42);
    for (let i = 1; i < n; i++) {
      const t = i / n, p = at(t);
      if (lanterns && i % 6 === 3) {
        B.at([p.x, p.y, p.z], 0, () => chochin(B, { r: 0.1, h: 0.2, cord: 0.07, color: i % 12 === 3 ? C.red : C.pink }));
        continue;
      }
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.11, 0, 0, 0.11, 0, 0, 0, -0.27, 0], 3)); tri.computeVertexNormals();
      B.at([p.x, p.y - 0.005, p.z], yaw, () => B.cloth(tri, pal[i % pal.length], { x0: -0.11, x1: 0.11, yTop: 0, yBot: -0.27 }));
    }
  }, 0);
}
// jizo statues: little stone monks in red bibs and knitted caps, with offerings
function jizoPiece(seed, n = 3) {
  return kit(seed, B => {
    const sizes = [0.9, 1.1, 0.78, 1];
    for (let i = 0; i < n; i++) {
      const s = sizes[i % 4], x = (i - (n - 1) / 2) * 0.42;
      B.at([x, 0, B.wob(0.05)], B.wob(0.15), () => {
        const st = B.pick(['#c8c0c4', '#bab2ba', '#d0c8c4']);
        const base = G.box(0.3, 0.1, 0.26, 0.035); base.translate(0, 0.05, 0); B.add(base, B.pick(STONES));
        const body = G.lathe([[0.001, 0], [0.13, 0], [0.135, 0.12], [0.11, 0.26], [0.07, 0.31], [0.001, 0.31]], 10); body.translate(0, 0.1, 0);
        B.add(body, (p, nn, o) => { o.set(st); if (nn.y > 0.7) o.lerp(col(C.moss), 0.35); });
        const head = G.sph(0.105, 10, 8); head.scale(1, 0.95, 0.95); head.translate(0, 0.47, 0); B.add(head, st);
        for (const sx of [-1, 1]) {
          const eye = G.box(0.035, 0.009, 0.01, 0); eye.rotateZ(sx * 0.2); eye.translate(sx * 0.037, 0.475, 0.1); B.add(eye, '#5a4a50');
          const ck = G.disc(0.017, 6); ck.lookAt(V(sx * 0.6, 0, 1)); ck.translate(sx * 0.058, 0.445, 0.087); B.add(ck, '#f0a0a8');
        }
        const smile = G.torus(0.018, 0.005, 3, 6, PI); smile.rotateZ(PI); smile.translate(0, 0.435, 0.1); B.add(smile, '#5a4a50');
        const bib = G.cone(0.15, 0.16, 10); bib.rotateX(PI); bib.scale(1, 1, 0.75); bib.translate(0, 0.3, 0.035); B.add(bib, (p, nn, o) => o.set(C.red).multiplyScalar(nn.z > 0 ? 1 : 0.8));
        const hat = G.cone(0.1, 0.13, 10); hat.rotateX(-0.1); hat.translate(0, 0.585, -0.01); B.add(hat, C.red);
        const pom = G.sph(0.03, 6, 4); pom.translate(0, 0.66, -0.02); B.add(pom, '#fff6ea');
      }, s);
    }
    // offerings: tea cups and a pinwheel
    for (const x of [-0.25, 0.3]) { const c = G.cyl(0.035, 0.028, 0.05, 8); c.translate(x, 0.025, 0.24); B.add(c, '#fff6ea'); }
    const oni = G.sph(0.05, 8, 5); oni.scale(1, 0.9, 0.6); oni.translate(0.05, 0.045, 0.26); B.add(oni, '#ffffff');
    const nori = G.box(0.05, 0.04, 0.035, 0); nori.translate(0.05, 0.022, 0.29); B.add(nori, '#2a3a30');
    const stick = G.cyl(0.008, 0.008, 0.55, 4); stick.translate(-(n / 2) * 0.42 - 0.05, 0.27, 0.1); B.add(stick, C.woodLight);
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.CircleGeometry(0.07, 3, k * PI / 2, 0.9); bl.translate(-(n / 2) * 0.42 - 0.05, 0.55, 0.11);
      B.add(bl, ['#ff6f7f', '#ffd24a', '#6ab0ff', '#8fe0c0'][k]);
    }
  });
}
// tiny wayside shrine (hokora): stone base, wooden box with a little gabled roof, rope and paper
function hokoraPiece(seed) {
  return kit(seed, B => {
    const base = G.box(0.72, 0.22, 0.6, 0.05); base.translate(0, 0.11, 0); B.add(base, STONES[2]);
    const step = G.box(0.46, 0.08, 0.2, 0.03); step.translate(0, 0.04, 0.38); B.add(step, STONES[3]);
    const box = G.box(0.46, 0.44, 0.38, 0.03); box.translate(0, 0.44, 0); B.add(box, C.woodMid);
    const door = G.box(0.3, 0.3, 0.02, 0.01); door.translate(0, 0.43, 0.195); B.add(door, '#5a3a2e');
    for (const sx of [-1, 1]) { const d = G.box(0.016, 0.3, 0.025, 0); d.translate(sx * 0.075, 0.43, 0.205); B.add(d, C.gold); }
    for (const sx of [-1, 1]) {
      const r = G.box(0.36, 0.05, 0.6, 0.02); r.rotateZ(-sx * 0.62); r.translate(sx * 0.14, 0.77, 0.02); B.add(r, C.vermilion);
    }
    const ridge = G.box(0.05, 0.05, 0.64, 0.015); ridge.translate(0, 0.87, 0.02); B.add(ridge, C.gold);
    const rope = tube([0, 1, 2, 3, 4].map(k => ({ p: V(-0.25 + k * 0.125, 0.64 - Math.sin(k / 4 * PI) * 0.04, 0.21), r: 0.018 })), 5, false); B.add(rope, '#ecd8a0');
    for (const x of [-0.12, 0.12]) { const g = G.plane(0.05, 0.1); g.translate(x, 0.56, 0.225); B.add(g, '#ffffff'); }
    for (const x of [-0.22, 0.22]) { const c = G.cyl(0.03, 0.025, 0.045, 7); c.translate(x, 0.245, 0.2); B.add(c, '#fff6ea'); }
    const flag = G.plane(0.14, 0.4, 1, 3); flag.translate(0.07, 0.7, 0);
    B.at([0.45, 0, -0.1], 0, () => { const s = G.cyl(0.012, 0.012, 1.0, 4); s.translate(0, 0.5, 0); B.add(s, C.woodDark); B.cloth(flag, C.red, { x0: 0, x1: 0.14, yTop: 0.9, yBot: 0.5 }); });
  });
}
function benchPiece(seed) {
  return kit(seed, B => {
    bench(B, { w: 1.15 });
    B.at([0.78, 0, -0.05], 0, () => pot(B, { plant: 'flowers', r: 0.13, flowers: ['#ff9ec0', '#ffffff'] }));
  });
}
function driftwoodPiece(seed) {
  return kit(seed, B => {
    const L = B.rand(0.9, 1.4);
    B.add(tube([{ p: V(-L / 2, 0.07, 0), r: 0.08 }, { p: V(0, 0.1, 0.06), r: 0.09 }, { p: V(L / 2, 0.06, -0.04), r: 0.05 }], 7, true), (p, n, o) => o.set('#cfc4b8').multiplyScalar(0.86 + 0.14 * Math.sin(p.x * 30)));
    B.add(tube([{ p: V(0.1, 0.1, 0.05), r: 0.04 }, { p: V(0.3, 0.14, 0.3), r: 0.02 }], 5, true), '#c4b8ac');
  });
}

// ------------------------------------------------------------------ showcase (/?test=props): pieces and loose geometry
export { detailMats };
export const DETAIL_SHOWCASE = {
  log: () => ({ pc: logPiece(11, 1.7) }), stump: () => ({ pc: stumpPiece(21) }), stump2: () => ({ pc: stumpPiece(22) }),
  dock: () => ({ pc: dockPiece(77, 3.3, 0.35) }), rowboat: () => ({ pc: beachedBoatPiece(55) }),
  toroRock: () => ({ pc: toroRockPiece(91, 0.72) }), toroPath: () => ({ pc: toroPiece(40, 0.72) }),
  signpost: () => ({ pc: signpostPiece(5, [{ a: 2.9, sym: 'leaf', color: '#bfe0a0' }, { a: -1.8, sym: 'star', color: '#ffe6b0' }, { a: -0.6, sym: 'bell', color: '#ffc8c8' }, { a: 1.57, sym: 'fish', color: '#c8e4ff' }]) }),
  pole: () => ({ pc: polePiece(3, 3.1) }), jizo: () => ({ pc: jizoPiece(8, 3) }), hokora: () => ({ pc: hokoraPiece(4) }),
  pondBench: () => ({ pc: benchPiece(6) }), driftwood: () => ({ pc: driftwoodPiece(1) }),
  curb: () => ({ geos: [0, 1, 2, 3].map(v => ['stone', stoneGeo(v * 7 + 1, 0)]) }),
  curbMoss: () => ({ geos: [0, 1, 2].map(v => ['stone', stoneGeo(v * 5 + 31, 1)]) }),
  boulder: () => ({ geos: [0, 1, 2].map(v => ['stone', boulderGeo(v * 11 + 5)]) }),
  clumps: () => ({ geos: Object.keys(CLUMP).map((k, i) => ['grass', clumpGeo(i * 3 + 1, k, CLUMP[k][0])]) }),
  tufts: () => ({ geos: [0, 1, 2].map(v => ['grass', tuftGeo(v)]) }), ferns: () => ({ geos: [0, 1].map(v => ['grass', fernGeo(v)]) }),
  mushrooms: () => ({ geos: [[0, true], [2, false]].map(([v, red]) => ['body', mushroomGeo(v, red)]) }),
  fallen: () => ({ geos: ['sakura', 'momiji', 'ginkgo', 'round', 'pine'].map(k => ['flat', fallenGeo(0, k)]) }),
  reeds: () => ({ geos: [0, 1].map(v => ['reed', reedGeo(v)]) }),
  lilies: () => ({ geos: [['flat', lilyGeo(0, false)], ['flat', lilyGeo(10, true)], ['body', frogGeo()]] }),
  shells: () => ({ geos: ['scallop', 'spiral', 'star'].map((k, i) => ['flat', shellGeo(i, k)]) }),
};

// ------------------------------------------------------------------ the builder
const TREE_KINDS = new Set(['sakura', 'momiji', 'pine', 'round', 'ginkgo']);
const STONE_TINTS = ['#ffffff', '#f4f0ff', '#fff6ec', '#eef0f4', '#f8f0f0', '#e8e4ec'].map(col);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Details {
  constructor(world, quality = 2) {
    this.world = world; this.veg = world.veg; this.terrain = world.terrain; this.quality = quality;
    this.group = new THREE.Group(); this.group.name = 'details';
    this.mats = detailMats();
    this.batches = [];
    const mk = (name, opts) => { const b = new Batch('d:' + name, this.mats[name], opts); this.batches.push(b); return b; };
    this.b = {
      body: mk('body'), stone: mk('stone', { sort: false }),
      flat: mk('flat', { castShadow: false, sort: false }), grass: mk('grass', { castShadow: false, sort: false }),
      reed: mk('reed', { castShadow: false, sort: false }), leaf: mk('leaf', { sort: false }),
      cloth: mk('cloth', { castShadow: false, sort: false }), glow: mk('glow', { castShadow: false, sort: false }),
    };
    this.geoCache = new Map();
    this.noise = new Noise(911);
    // tiles under the landmark set-pieces (signpost, bunting, lanterns, jizo, shrine, bench): the village sim won't
    // build there (VillageSim.canPlace), and clearing skips those records (rec.keep)
    this.reserved = new Set();
    this.counts = {};
    // 0.5 m occupancy grid: trunks, bushes, rocks and everything placed here
    this.OS = WORLD * 2; this.occ = new Uint8Array(this.OS * this.OS);
    for (const rec of this.veg.instances) {
      if (!rec.alive || rec.kind === 'flower') continue;
      const r = TREE_KINDS.has(rec.kind) ? 0.55 : rec.kind === 'bamboo' ? 0.9 : rec.kind === 'susuki' ? 0.45 : rec.kind === 'rock' ? 0.55 * rec.s + 0.2 : 0.6 * (rec.s || 1);
      this.mark(rec.x, rec.z, r);
    }
  }
  // ---------------------------------------------------------------- helpers
  H(x, z) { return this.terrain.heightAt(x, z); }
  tile(x, z) { return this.terrain.tile(x, z); }
  slope(x, z) { return this.terrain.slopeAt(x, z); }
  mark(x, z, r) {
    const S = this.OS, x0 = Math.max(0, Math.floor((x - r) * 2)), x1 = Math.min(S - 1, Math.floor((x + r) * 2)), z0 = Math.max(0, Math.floor((z - r) * 2)), z1 = Math.min(S - 1, Math.floor((z + r) * 2));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) if (Math.hypot((i + 0.5) / 2 - x, (j + 0.5) / 2 - z) < r + 0.25) this.occ[j * S + i] = 1;
  }
  free(x, z, r) {
    const S = this.OS, x0 = Math.max(0, Math.floor((x - r) * 2)), x1 = Math.min(S - 1, Math.floor((x + r) * 2)), z0 = Math.max(0, Math.floor((z - r) * 2)), z1 = Math.min(S - 1, Math.floor((z + r) * 2));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) if (this.occ[j * S + i] && Math.hypot((i + 0.5) / 2 - x, (j + 0.5) / 2 - z) < r + 0.25) return false;
    return true;
  }
  geo(key, fn) { let g = this.geoCache.get(key); if (!g) { g = fn(); g.computeBoundingSphere(); this.geoCache.set(key, g); } return g; }
  count(k, n = 1) { this.counts[k] = (this.counts[k] || 0) + n; }
  // a vegetation record: building placement / paths / zones clear it (see Vegetation.clearRect / clearAround)
  rec(x, z, { big = false, col = 0, kind = 'detail', s = 1 } = {}) {
    const r = { kind, x, z, y: this.H(x, z), s, big, parts: [], alive: true };
    if (col) { r.col = { x, z, r: col }; this.veg.colliders.push(r.col); }
    this.veg.instances.push(r);
    return r;
  }
  sat(owner, rec) { if (owner) (owner.sat ||= []).push(rec); return rec; }
  reserve(x, z, r) {
    for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      const cx = Math.max(i, Math.min(x, i + 1)), cz = Math.max(j, Math.min(z, j + 1));
      if (Math.hypot(cx - x, cz - z) < r && i >= 0 && j >= 0 && i < WORLD && j < WORLD) this.reserved.add(j * WORLD + i);
    }
  }
  isReserved(x, z) { return this.reserved.has(z * WORLD + x); }
  // one instance of a geometry in a batch
  put(batch, geo, x, y, z, { rot = 0, s = 1, tilt = 0, color = null, rec } = {}) {
    _e.set(tilt ? (this.noise.n2(x * 3.1, z * 2.7) * tilt) : 0, rot, tilt ? (this.noise.n2(z * 2.9, x * 3.3) * tilt) : 0, 'YXZ');
    _q.setFromEuler(_e);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.setScalar(s);
    _m4.compose(_p.set(x, y, z), _q, _s);
    this.b[batch].add(geo, _m4, color, rec);
  }
  // a kit piece (several buckets) at (x, z) facing yaw `rot` (local +z -> (sin rot, cos rot)); lamps join the LightPool
  piece(pc, x, z, rot = 0, { y, s = 1, rec, col = 0, big = true, light = true, kind = 'detail', keep = 0 } = {}) {
    y ??= this.H(x, z);
    rec ||= this.rec(x, z, { big, col, kind });
    if (keep) { rec.keep = true; this.reserve(x, z, keep); }
    _q.setFromAxisAngle(UP, rot); _m4.compose(_p.set(x, y, z), _q, _s.setScalar(s));
    for (const k of ['body', 'glow', 'leaf', 'cloth', 'water']) if (pc[k]) this.b[k === 'water' ? 'body' : k].add(pc[k], _m4, null, rec);
    if (light) for (const l of pc.lights || []) {
      const src = this.world.lightPool.addSource({ pos: l.pos.clone().applyMatrix4(_m4), color: l.color, intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly });
      (rec.lights ||= []).push(src);
    }
    this.count('piece');
    return rec;
  }
  // painted brush noise (the terrain shader's uBrush), sampled on the CPU so curb stones follow the painted path edge
  brush(u, v, ch) {
    const d = this.brushData; if (!d) return 0.5;
    const S = this.brushS, x = u * S - 0.5, y = (1 - v) * S - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy) => d[((((yy % S) + S) % S) * S + (((xx % S) + S) % S)) * 4 + ch];
    return (at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy) / 255;
  }
  // ---------------------------------------------------------------- build
  build() {
    const t0 = performance.now();
    try {
      const img = brushTexture().image;
      this.brushS = img.width; this.brushData = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    } catch (e) { this.brushData = null; }
    const steps = ['wear', 'pond', 'bridge', 'plaza', 'shrine', 'northPath', 'forest', 'trees', 'paths', 'lawns', 'beach'];
    this.ms = {};
    for (const s of steps) { const t = performance.now(); this[s](); this.ms[s] = +(performance.now() - t).toFixed(1); }
    for (const b of this.batches) b.build(this.group);
    this.brushData = null; this.occ = null;
    this.ms.total = +(performance.now() - t0).toFixed(1);
    return this;
  }
  setNight(n) { this.mats.glow.emissiveIntensity = GLOW_DAY + (GLOW_NIGHT - GLOW_DAY) * clamp(n); }

  // ---------------------------------------------------------------- trodden grass where feet cut corners
  // Grass tiles between two paved sides (inside corners of bends, where a path meets the plaza) and just past the
  // open end of a path get worn: thinner grass and patchy earth (Terrain.wear -> tile alpha -> terrain + grass shaders).
  wear() {
    const tr = this.terrain, tiles = tr.tiles, W = WORLD, N = this.noise;
    const kind = (i, j) => (i < 0 || j < 0 || i >= W || j >= W) ? 0 : tiles[j * W + i] === T.PATH ? 1 : tiles[j * W + i] === T.PLAZA ? 2 : 0;
    for (let j = 1; j < W - 1; j++) for (let i = 1; i < W - 1; i++) {
      if (tiles[j * W + i] !== T.GRASS) continue;
      let n4 = 0, nd = 0, pl = 0, pa = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = kind(i + di, j + dj); if (k) { n4++; if (k === 2) pl++; else pa++; } }
      for (const [di, dj] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (kind(i + di, j + dj)) nd++;
      let w = n4 >= 3 ? 0.95 : n4 === 2 ? 0.8 : n4 === 1 && nd >= 2 ? 0.45 : 0;
      if (pl && pa) w = Math.max(w, 0.85);
      if (!w) continue;
      w *= 0.75 + 0.5 * (N.n2(i * 0.7, j * 0.7) * 0.5 + 0.5);
      tr.wear[j * W + i] = Math.round(clamp(w) * 255);
    }
    // path mouths that open onto grass (a door, the pond bank, trail ends)
    for (const Pt of PATHS) for (const [e, f] of [[Pt.pts[0], Pt.pts[1]], [Pt.pts[Pt.pts.length - 1], Pt.pts[Pt.pts.length - 2]]]) {
      const dx = e[0] - f[0], dz = e[1] - f[1], L = Math.hypot(dx, dz), x = e[0] + dx / L * (Pt.w / 2 + 0.6), z = e[1] + dz / L * (Pt.w / 2 + 0.6);
      const i = Math.floor(x), j = Math.floor(z);
      if (tiles[j * W + i] === T.GRASS) tr.wear[j * W + i] = Math.max(tr.wear[j * W + i], 190);
    }
    tr.syncTiles();
  }
  // ---------------------------------------------------------------- curb stones along every path and around the plaza
  paths() {
    const tiles = this.terrain.tiles, W = WORLD, TH = 0.45;
    const pv = (i, j) => (i < 0 || j < 0 || i >= W || j >= W) ? 0 : tiles[j * W + i] === T.PATH ? 1 : tiles[j * W + i] === T.PLAZA ? 2 : 0;
    // the terrain shader's edge: bilinear paved fraction (tile texture is linear-filtered) + painted noise
    const F = (x, z) => {
      const fx = x - 0.5, fz = z - 0.5, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
      let a = 0, pl = 0;
      const acc = (ii, jj, w) => { const t = pv(ii, jj); if (t === 1) a += w; else if (t === 2) pl += w; };
      acc(i, j, (1 - tx) * (1 - tz)); acc(i + 1, j, tx * (1 - tz)); acc(i, j + 1, (1 - tx) * tz); acc(i + 1, j + 1, tx * tz);
      const n3 = this.brush(x * 0.09, z * 0.09, 0), n1 = this.brush(x * 0.021, z * 0.021, 1);
      return a >= pl ? a + pl + (n3 - 0.5) * 0.45 + (n1 - 0.5) * 0.2 : a + pl + (n3 - 0.5) * 0.3;
    };
    // path ends that stop in the open (bridge heads, doors, the pond, far trail ends): keep their mouths clear
    const caps = [];
    for (const Pt of PATHS) for (const e of [Pt.pts[0], Pt.pts[Pt.pts.length - 1]]) {
      const [x, z] = e;
      let nearPlaza = false;
      for (let dz = -2; dz <= 2 && !nearPlaza; dz++) for (let dx = -2; dx <= 2; dx++) if (pv(Math.floor(x) + dx, Math.floor(z) + dz) === 2) { nearPlaza = true; break; }
      if (!nearPlaza) caps.push([x, z, Pt.w / 2 + 1.1]);
    }
    const br = LANDMARKS.bridgeW;
    const inBridge = (x, z) => Math.abs(x - br.x) < br.len / 2 + 0.9 && Math.abs(z - br.z) < 2.4;
    const cand = [], step = 0.2;
    for (let j = 1; j < W - 1; j++) for (let i = 1; i < W - 1; i++) {
      const c = pv(i, j) ? 1 : 0; let mixed = false;
      for (let dj = -1; dj <= 1 && !mixed; dj++) for (let di = -1; di <= 1; di++) if ((pv(i + di, j + dj) ? 1 : 0) !== c) { mixed = true; break; }
      if (!mixed) continue;
      const f = [];
      for (let sz = 0; sz <= 5; sz++) for (let sx = 0; sx <= 5; sx++) f.push(F(i + sx * step, j + sz * step));
      for (let sz = 0; sz < 5; sz++) for (let sx = 0; sx < 5; sx++) {
        const f0 = f[sz * 6 + sx], f1 = f[sz * 6 + sx + 1], f2 = f[(sz + 1) * 6 + sx];
        const x = i + sx * step, z = j + sz * step;
        if ((f0 - TH) * (f1 - TH) < 0) cand.push([x + step * (TH - f0) / (f1 - f0), z]);
        if ((f0 - TH) * (f2 - TH) < 0) cand.push([x, z + step * (TH - f0) / (f2 - f0)]);
      }
    }
    // thin to a stone every ~0.5-0.8 m, in a stable random order
    const rnd = mulberry32(4242);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
    const acc = new Map(), key = (x, z) => (Math.floor(x) * 1000 + Math.floor(z));
    const near = (x, z, d) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const a = acc.get(key(x + dx, z + dz)); if (a) for (const q of a) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < d * d) return true; } return false; };
    const N = this.noise;
    const stones = [0, 1, 2, 3].map(v => this.geo('stone' + v, () => stoneGeo(v * 7 + 1, 0)));
    const mossy = [0, 1, 2].map(v => this.geo('mstone' + v, () => stoneGeo(v * 5 + 31, 1)));
    const tufts = [0, 1, 2, 3].map(v => this.geo('tuft' + v, () => tuftGeo(v)));
    for (const [x, z] of cand) {
      const big = rnd() < 0.3, r = big ? 0.2 + rnd() * 0.06 : 0.13 + rnd() * 0.05;
      if (near(x, z, r + 0.17 + rnd() * 0.16)) continue;
      if (caps.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr) || inBridge(x, z)) continue;
      // natural gaps: skip stretches, and leave the stone out where the lawn is wet or steep
      if (N.n2(x * 0.3, z * 0.3) < -0.5) continue;
      const gx = F(x + 0.15, z) - F(x - 0.15, z), gz = F(x, z + 0.15) - F(x, z - 0.15), gl = Math.hypot(gx, gz) || 1;
      const nx = -gx / gl, nz = -gz / gl; // outward (toward the lawn)
      const sx = x + nx * (0.04 + r * 0.45), sz = z + nz * (0.04 + r * 0.45);
      const h = this.H(sx, sz);
      if (h < 0.25 || this.slope(sx, sz) > 0.4) continue;
      let a = acc.get(key(x, z)); if (!a) acc.set(key(x, z), a = []); a.push([x, z]);
      const rec = this.rec(sx, sz, { kind: 'curb' });
      const moss = N.n2(sx * 0.12 + 40, sz * 0.12) > 0.1 ? rnd() < 0.7 : rnd() < 0.15;
      const s = r / 0.5;
      this.put('stone', (moss ? mossy : stones)[Math.floor(rnd() * (moss ? 3 : 4))], sx, h - 0.035 * s * 2, sz, { rot: rnd() * TAU, s: [s * (1 + rnd() * 0.3), s * (0.8 + rnd() * 0.4), s], tilt: 0.12, color: STONE_TINTS[Math.floor(rnd() * STONE_TINTS.length)], rec });
      this.count('curb');
      // a pebble or a tuft of grass tucked against it now and then
      if (rnd() < 0.22) {
        const t = rnd() * 2 - 1, px = sx - nz * t * (r + 0.1) + nx * 0.05, pz = sz + nx * t * (r + 0.1) + nz * 0.05;
        if (this.H(px, pz) > 0.25) this.put('stone', stones[Math.floor(rnd() * 4)], px, this.H(px, pz) - 0.02, pz, { rot: rnd() * TAU, s: 0.12 + rnd() * 0.06, color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
      } else if (rnd() < 0.3) {
        const px = sx + nx * (r + 0.12) + (rnd() - 0.5) * 0.2, pz = sz + nz * (r + 0.12) + (rnd() - 0.5) * 0.2;
        if (this.H(px, pz) > 0.4 && this.tile(px, pz) === T.GRASS) this.put('grass', tufts[Math.floor(rnd() * 4)], px, this.H(px, pz) - 0.01, pz, { rot: rnd() * TAU, s: 0.9 + rnd() * 0.5, rec });
      }
    }
  }
  // ---------------------------------------------------------------- lawns: wildflower drifts, little shrubs, sunk rocks
  // The lawn blades are 0.3-0.5 m tall and dense, so only things that stand above them read from the gameplay camera:
  // flowers grow in drifts of a few clumps (two kinds mixed), shrubs and mossy rocks break up the open stretches.
  lawns() {
    const rnd = mulberry32(606), N = this.noise, tr = this.terrain;
    const kinds = Object.keys(CLUMP);
    const clumps = kinds.map(k => [0, 1, 2].map(v => this.geo(`clump:${k}${v}`, () => clumpGeo(v * 3 + 1, k, CLUMP[k][v]))));
    const boulders = [0, 1, 2].map(v => this.geo('boulder' + v, () => boulderGeo(v * 11 + 5)));
    const shrubs = [0, 1, 2, 3].map(v => kit(300 + v, B => bush(B, { r: 0.3 + v * 0.03, n: 3, flowers: v % 2 ? [['#ffb0d0', '#ffffff'], ['#b8a8ff', '#e0d8ff']][v >> 1] : null })));
    const ok = (x, z, r) => tr.tile(x, z) === T.GRASS && this.H(x, z) > 0.5 && this.slope(x, z) < 0.3 && distToPaths(x, z) > 0.6 && this.free(x, z, r);
    const G0 = this.quality >= 2 ? 2.0 : 2.6;
    for (let z = 5; z < WORLD - 5; z += G0) for (let x = 5; x < WORLD - 5; x += G0) {
      const px = x + rnd() * G0, pz = z + rnd() * G0;
      const dP = Math.hypot(px - P0.x, pz - P0.z), dPath = distToPaths(px, pz);
      if (dP > 38 && dPath > 6) continue;
      if (!ok(px, pz, 0.3)) continue;
      const b = N.n2(px * 0.15 + 17, pz * 0.15 - 5), c = N.n2(px * 0.06 - 9, pz * 0.06 + 3);
      const roll = rnd(), pDrift = clamp(0.3 + b * 1.4, 0.16, 0.8);
      if (roll < pDrift) {
        // a drift: 2-7 clumps of one or two kinds (smaller where the noise says the meadow thins out)
        const k1 = Math.floor(clamp(c * 0.5 + 0.5, 0, 0.999) * kinds.length), k2 = (k1 + 1 + Math.floor(rnd() * 2)) % kinds.length;
        const rec = this.rec(px, pz, { kind: 'wildflower' });
        const n = b > 0 ? 3 + Math.floor(rnd() * 5) : 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, d = i ? 0.25 + rnd() * 0.65 : 0, qx = px + Math.cos(a) * d, qz = pz + Math.sin(a) * d;
          if (i && !ok(qx, qz, 0.1)) continue;
          const k = rnd() < 0.7 ? k1 : k2;
          this.put('grass', clumps[k][Math.floor(rnd() * 3)], qx, this.H(qx, qz) - 0.02, qz, { rot: rnd() * TAU, s: 0.95 + rnd() * 0.45, rec });
          this.count('wildflower');
        }
        this.mark(px, pz, 0.5);
      } else if (roll > 0.955 && dP > 7) {
        const rec = this.rec(px, pz, { kind: 'shrub', big: true, col: 0.28 });
        this.piece(shrubs[Math.floor(rnd() * 4)], px, pz, rnd() * TAU, { y: this.H(px, pz) - 0.05, s: 0.9 + rnd() * 0.5, rec, light: false });
        this.mark(px, pz, 0.6); this.count('shrub');
      } else if (roll > 0.93 && dP > 7) {
        const s = 0.35 + rnd() * 0.3;
        const rec = this.rec(px, pz, { kind: 'lawnRock', big: true, col: s > 0.5 ? 0.3 * s : 0 });
        this.put('stone', boulders[Math.floor(rnd() * 3)], px, this.H(px, pz) - 0.08, pz, { rot: rnd() * TAU, s: [s * 1.25, s * 0.8, s], tilt: 0.15, color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
        if (rnd() < 0.6) { const qx = px + (rnd() - 0.5) * 0.9, qz = pz + (rnd() - 0.5) * 0.9; this.put('stone', boulders[Math.floor(rnd() * 3)], qx, this.H(qx, qz) - 0.05, qz, { rot: rnd() * TAU, s: s * 0.45, color: STONE_TINTS[Math.floor(rnd() * 6)], rec }); }
        this.mark(px, pz, 0.5); this.count('lawnRock');
      }
    }
  }
  // ---------------------------------------------------------------- under the trees: petals, leaves, ferns, mushrooms
  trees() {
    const rnd = mulberry32(1717);
    const fallen = {
      sakura: [0, 1, 2].map(v => this.geo('fs' + v, () => fallenGeo(v, 'sakura'))), momiji: [0, 1, 2].map(v => this.geo('fm' + v, () => fallenGeo(v, 'momiji'))), ginkgo: [0, 1].map(v => this.geo('fg' + v, () => fallenGeo(v, 'ginkgo'))),
      round: [0, 1, 2].map(v => this.geo('fr' + v, () => fallenGeo(v, 'round'))), pine: [0, 1].map(v => this.geo('fp' + v, () => fallenGeo(v, 'pine'))),
    };
    const ferns = [0, 1, 2].map(v => this.geo('fern' + v, () => fernGeo(v)));
    const shrooms = [[0, true], [1, true], [2, false], [3, false]].map(([v, red]) => this.geo('mush' + v, () => mushroomGeo(v, red)));
    const trees = this.veg.instances.filter(r => r.alive && TREE_KINDS.has(r.kind));
    for (const t of trees) {
      const dP = Math.hypot(t.x - P0.x, t.z - P0.z);
      if (dP > 44 && distToPaths(t.x, t.z) > 8) continue;
      const kind = t.kind;
      if (fallen[kind]) {
        const n = kind === 'sakura' ? 3 + Math.floor(rnd() * 3) : kind === 'momiji' ? 4 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, d = 0.9 + rnd() * 1.8, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
          const tt = this.tile(x, z); if (tt === T.WATER || tt === T.ROCK || this.H(x, z) < 0.2) continue;
          const rec = this.sat(t, this.rec(x, z, { kind: 'fallen' }));
          this.put('flat', fallen[kind][Math.floor(rnd() * fallen[kind].length)], x, this.H(x, z), z, { rot: rnd() * TAU, s: 0.9 + rnd() * 0.5, rec });
          this.count('fallen');
        }
      }
      if (kind === 'sakura') continue;
      // ferns tuck in around the trunk; mushrooms come up in the shade at the canopy's edge, some on the camera side
      const tries = kind === 'momiji' ? 1 : 3;
      for (let i = 0; i < tries; i++) {
        const front = i === 0 && rnd() < 0.6;
        const a = front ? PI * 0.25 + (rnd() - 0.5) * 1.6 : rnd() * TAU, d = front ? 1.5 + rnd() * 0.7 : 0.65 + rnd() * 0.6;
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        if (this.tile(x, z) !== T.GRASS || this.H(x, z) < 0.5 || distToPaths(x, z) < 0.6 || !this.free(x, z, 0.25)) continue;
        const roll = rnd();
        const rec = this.sat(t, this.rec(x, z, { kind: 'undergrowth' }));
        if (roll < 0.55 && !front) { this.put('grass', ferns[Math.floor(rnd() * 3)], x, this.H(x, z) - 0.02, z, { rot: rnd() * TAU, s: 0.85 + rnd() * 0.5, rec }); this.count('fern'); }
        else { this.put('body', shrooms[Math.floor(rnd() * 4)], x, this.H(x, z) - 0.01, z, { rot: rnd() * TAU, s: 1 + rnd() * 0.5, rec }); this.count('mushroom'); }
        this.mark(x, z, 0.25);
      }
    }
  }
  // ---------------------------------------------------------------- forest edge: fallen logs and stumps beside the trails
  forest() {
    const rnd = mulberry32(3131), trees = this.veg.instances.filter(r => r.alive && TREE_KINDS.has(r.kind));
    const placed = [];
    const logPcs = [logPiece(11, 1.7), logPiece(12, 1.3)], stumpPcs = [stumpPiece(21), stumpPiece(22)];
    for (const Pt of PATHS) for (let s = 0; s < Pt.pts.length - 1; s++) {
      const [ax, az] = Pt.pts[s], [bx, bz] = Pt.pts[s + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let u = 1.5; u < L - 1; u += 2.5) for (const side of [-1, 1]) {
        const off = Pt.w / 2 + 1.7 + rnd() * 1.8, x = ax + dx * u - dz * off * side, z = az + dz * u + dx * off * side;
        if (Math.hypot(x - P0.x, z - P0.z) < 15 || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 8)) continue;
        if (this.tile(x, z) !== T.GRASS || this.H(x, z) < 0.6 || this.slope(x, z) > 0.2 || distToPaths(x, z) < 1.5 || !this.free(x, z, 1.0)) continue;
        if (trees.filter(t => Math.hypot(t.x - x, t.z - z) < 6).length < 2) continue;
        if (rnd() < 0.5) continue;
        const isLog = placed.length % 2 === 0, rot = Math.atan2(dx, dz) + PI / 2 + (rnd() - 0.5) * 0.8;
        if (isLog) {
          const k = Math.floor(rnd() * 2), half = k ? 0.65 : 0.85;
          const rec = this.piece(logPcs[k], x, z, rot, { y: this.H(x, z) - 0.03, col: 0.3, kind: 'log' });
          // a second collider at each end of the log (as satellite records, so a building clears them together)
          const ex = Math.cos(rot) * half * 0.6, ez = -Math.sin(rot) * half * 0.6;
          for (const sg of [-1, 1]) this.sat(rec, this.rec(x + ex * sg, z + ez * sg, { big: true, col: 0.24, kind: 'logEnd' }));
          this.mark(x, z, 1.0);
        } else {
          this.piece(stumpPcs[Math.floor(rnd() * 2)], x, z, rnd() * TAU, { y: this.H(x, z) - 0.02, col: 0.32, kind: 'stump' });
          this.mark(x, z, 0.6);
        }
        placed.push([x, z]); this.count(isLog ? 'log' : 'stump');
      }
    }
  }
  // ---------------------------------------------------------------- the koi pond: dock, reeds, lily pads, a frog, rocks, a lantern
  pond() {
    const Pd = this.terrain.pond, rnd = mulberry32(5150);
    // waterline all around (h crosses 0 marching out from the centre)
    const wl = [];
    for (let k = 0; k < 96; k++) {
      const a = k / 96 * TAU, cx = Math.cos(a), cz = Math.sin(a);
      let d = 2; while (d < 11 && this.H(Pd.x + cx * d, Pd.z + cz * d) < 0) d += 0.05;
      wl.push({ a, d, x: Pd.x + cx * d, z: Pd.z + cz * d, cx, cz });
    }
    // dock: from the end of the pond path straight out along +x
    const zD = 70.9;
    let xs = 63; while (xs < Pd.x && this.H(xs, zD) > 0.12) xs += 0.05;
    const x0 = xs - 0.95, x1 = xs + 2.4, yd = clamp(this.H(x0, zD) + 0.06, 0.26, 0.5);
    const dock = dockPiece(77, x1 - x0, yd);
    this.piece(dock, x0, zD, PI / 2, { y: 0, big: false, kind: 'dock', keep: 0.6 });
    this.world.decks.push({ x0, z0: zD - 0.58, x1: x1 + 0.05, z1: zD + 0.58, h: (x, z) => Math.max(yd, this.terrain.heightAt(x, z)) });
    const onDock = (x, z, m = 1.2) => x > x0 - m && x < x1 + m + 2 && Math.abs(z - zD) < 0.6 + m + 1.2;
    this.mark(x0 + 1.5, zD, 1.2);
    this.dock = { x0, x1, z: zD, y: yd };
    // reeds in three clumps along the waterline, away from the dock and the path mouth
    const reeds = [0, 1, 2, 3].map(v => this.geo('reed' + v, () => reedGeo(v)));
    for (const ca of [0.35, 1.9, 3.55, 4.7]) {
      for (let i = 0; i < 4; i++) {
        const w = wl[Math.floor(((ca + (rnd() - 0.5) * 0.55) / TAU) * 96 + 96) % 96];
        const inset = -0.1 + rnd() * 0.45, x = w.x - w.cx * inset, z = w.z - w.cz * inset;
        if (onDock(x, z)) continue;
        const rec = this.rec(x, z, { kind: 'reeds' });
        this.put('reed', reeds[Math.floor(rnd() * 4)], x, Math.max(-0.08, this.H(x, z)) - 0.02, z, { rot: rnd() * TAU, s: 0.9 + rnd() * 0.4, rec });
        this.count('reeds');
      }
    }
    // lily pads in loose rafts on the open water, a few lotus flowers and a frog
    const pads = [0, 1, 2, 3].map(v => this.geo('lily' + v, () => lilyGeo(v, false))), lotus = [0, 1].map(v => this.geo('lotus' + v, () => lilyGeo(v + 10, true)));
    const frog = this.geo('frog', frogGeo);
    let frogged = false;
    for (const ra of [0.9, 2.6, 4.2, 5.6]) {
      const d0 = 2.4 + rnd() * 1.2, cx = Pd.x + Math.cos(ra) * d0, cz = Pd.z + Math.sin(ra) * d0;
      const rec = this.rec(cx, cz, { kind: 'lilies' });
      const n = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const x = cx + (rnd() - 0.5) * 1.6, z = cz + (rnd() - 0.5) * 1.6;
        if (this.H(x, z) > -0.25 || onDock(x, z, 0.4)) continue;
        const fl = i === 1 || (i === 4 && rnd() < 0.5);
        const rot = rnd() * TAU, s = 0.85 + rnd() * 0.45;
        this.put('flat', fl ? lotus[Math.floor(rnd() * 2)] : pads[Math.floor(rnd() * 4)], x, 0.02, z, { rot, s, rec });
        if (!frogged && !fl && i === 2) { frogged = true; this.put('body', frog, x, 0.03, z, { rot: PI * 0.25 + (rnd() - 0.5) * 0.6, s: 1.1, rec }); }
        this.count('lily');
      }
    }
    // pebbles in little groups on the sandy rim
    const peb = [0, 1, 2, 3].map(v => this.geo('stone' + v, () => stoneGeo(v * 7 + 1, 0)));
    for (let k = 0; k < 96; k += 5 + Math.floor(rnd() * 5)) {
      const w = wl[k];
      if (rnd() < 0.35) continue;
      const out = 0.35 + rnd() * 0.8, x = w.x + w.cx * out, z = w.z + w.cz * out;
      if (onDock(x, z, 0.3) || this.H(x, z) > 0.55 || !this.free(x, z, 0.2)) continue;
      const rec = this.rec(x, z, { kind: 'pebbles' });
      for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
        const qx = x + (rnd() - 0.5) * 0.5, qz = z + (rnd() - 0.5) * 0.5;
        this.put('stone', peb[Math.floor(rnd() * 4)], qx, this.H(qx, qz) - 0.02, qz, { rot: rnd() * TAU, s: 0.12 + rnd() * 0.14, tilt: 0.2, color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
      }
      this.count('pondPebbles');
    }
    // mossy rocks half in the water, and a stone lantern on a rock across from the dock
    for (const ra of [1.3, 2.3, 3.1, 4.3, 5.3]) {
      const w = wl[Math.floor(ra / TAU * 96) % 96], inset = 0.05 + rnd() * 0.35, x = w.x - w.cx * inset, z = w.z - w.cz * inset;
      if (onDock(x, z)) continue;
      const g = this.geo('boulder' + (Math.floor(ra) % 3), () => boulderGeo(Math.floor(ra) * 11 + 5));
      const s = 0.55 + rnd() * 0.4;
      const rec = this.rec(x, z, { kind: 'pondRock', big: true, col: this.H(x, z) > -0.2 ? 0.35 * s : 0 });
      this.put('stone', g, x, Math.max(-0.35, this.H(x, z)) - 0.12, z, { rot: rnd() * TAU, s: [s * 1.2, s * 0.85, s], color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
      this.count('pondRock');
    }
    for (const a of [3.25, 3.05, 3.45, 2.85]) { // west shore, facing the water and the default camera
      const w = wl[Math.floor(a / TAU * 96) % 96], x = w.x + w.cx * 1.9, z = w.z + w.cz * 1.9;
      if (onDock(x, z, 0.8) || this.tile(x, z) !== T.GRASS || this.slope(x, z) > 0.25 || !this.free(x, z, 0.7)) continue;
      const rec = this.piece(benchPiece(6), x, z, Math.atan2(-w.cx, -w.cz), { col: 0.5, kind: 'bench', keep: 0.6 });
      this.mark(x, z, 0.8);
      // stepping stones from the end of the pond path to the bench
      const pe = PATHS[5].pts[PATHS[5].pts.length - 1], sx = pe[0] - 0.9, sz = pe[1] + 0.6;
      if (Math.hypot(sx - x, sz - z) < 6) this.steppingStones(sx, sz, x + w.cx * 0.2 + 0.35, z + w.cz * 0.2 + 0.5, this.sat(rec, this.rec((sx + x) / 2, (sz + z) / 2, { kind: 'stepping' })));
      break;
    }
    {
      const w = wl[Math.floor((Math.atan2(zD - Pd.z, x0 - Pd.x) + PI + 0.35) / TAU * 96 + 96) % 96];
      const x = w.x + w.cx * 0.35, z = w.z + w.cz * 0.35;
      this.piece(toroRockPiece(91, 0.72), x, z, Math.atan2(Pd.x - x, Pd.z - z), { y: this.H(x, z) - 0.06, col: 0.45, kind: 'pondLantern', keep: 0.45 });
      this.mark(x, z, 0.7);
    }
  }
  // ---------------------------------------------------------------- the river crossing: bank rocks, reeds, lanterns
  bridge() {
    const br = LANDMARKS.bridgeW, rnd = mulberry32(2828);
    const x0 = br.x - br.len / 2, x1 = br.x + br.len / 2; // deck x range; the river runs north-south under it
    const boulders = [0, 1, 2].map(v => this.geo('boulder' + v, () => boulderGeo(v * 11 + 5)));
    // rocks at the four bridge heads, on the bank beside the abutments
    for (const [bx, sz] of [[x0 + 0.1, -1], [x0 + 0.1, 1], [x1 - 0.1, -1], [x1 - 0.1, 1]]) {
      const z = br.z + sz * 2.1, x = bx + (bx < br.x ? 0.4 : -0.4);
      const s = 0.6 + rnd() * 0.35;
      const rec = this.rec(x, z, { kind: 'bankRock', big: true, col: this.H(x, z) > -0.2 ? 0.34 * s : 0 });
      this.put('stone', boulders[Math.floor(rnd() * 3)], x, Math.max(-0.3, this.H(x, z)) - 0.1, z, { rot: rnd() * TAU, s: [s * 1.2, s * 0.9, s], color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
      const qx = x + (rnd() - 0.5) * 0.9, qz = z + sz * (0.5 + rnd() * 0.4);
      this.put('stone', boulders[Math.floor(rnd() * 3)], qx, Math.max(-0.3, this.H(qx, qz)) - 0.06, qz, { rot: rnd() * TAU, s: 0.3 + rnd() * 0.15, color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
      this.count('bankRock');
    }
    // reeds along both banks up- and downstream (march sideways from the river centre to the waterline)
    const reeds = [0, 1, 2, 3].map(v => this.geo('reed' + v, () => reedGeo(v)));
    for (let z = br.z - 11; z < br.z + 12; z += 1.4) {
      if (Math.abs(z - br.z) < 2.8) continue;
      for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        let x = br.x; while (Math.abs(x - br.x) < 9 && this.H(x, z) < 0) x += side * 0.1;
        const px = x - side * (rnd() * 0.35), pz = z + (rnd() - 0.5) * 0.8;
        if (this.H(px, pz) > 0.25 || distToPaths(px, pz) < 0.8) continue;
        const rec = this.rec(px, pz, { kind: 'reeds' });
        this.put('reed', reeds[Math.floor(rnd() * 4)], px, Math.max(-0.08, this.H(px, pz)) - 0.02, pz, { rot: rnd() * TAU, s: 0.8 + rnd() * 0.4, rec });
        this.count('reeds');
      }
    }
    // lily pads in the slow shallows along the banks
    const pads = [0, 1, 2, 3].map(v => this.geo('lily' + v, () => lilyGeo(v, false))), lotus = this.geo('lotus0', () => lilyGeo(10, true));
    for (const [z, side] of [[br.z + 4.2, -1], [br.z - 4.6, 1], [br.z + 8.5, 1]]) {
      let x = br.x; while (Math.abs(x - br.x) < 9 && this.H(x, z) < -0.3) x += side * 0.1;
      const cx = x - side * 0.8, rec = this.rec(cx, z, { kind: 'lilies' });
      for (let i = 0; i < 4; i++) {
        const px = cx + (rnd() - 0.5) * 1.1 - side * rnd() * 0.5, pz = z + (rnd() - 0.5) * 1.6;
        if (this.H(px, pz) > -0.2) continue;
        this.put('flat', i === 1 ? lotus : pads[Math.floor(rnd() * 4)], px, 0.02, pz, { rot: rnd() * TAU, s: 0.8 + rnd() * 0.4, rec });
      }
    }
    // a rowboat pulled up on the sandy bank downstream of the bridge
    for (const [z, side] of [[br.z + 5.5, 1], [br.z + 7, -1], [br.z - 6, 1]]) {
      let x = br.x; while (Math.abs(x - br.x) < 9 && this.H(x, z) < 0.06) x += side * 0.1;
      const px = x + side * 0.45, pz = z;
      if (this.H(px, pz) > 0.6 || this.H(px, pz) < 0.02 || distToPaths(px, pz) < 1.2 || !this.free(px, pz, 0.6)) continue;
      const rec = this.piece(beachedBoatPiece(55), px, pz, (rnd() - 0.5) * 0.4, { y: this.H(px, pz), col: 0.45, kind: 'rowboat', keep: 0.5 });
      this.sat(rec, this.rec(px, pz + 0.6, { col: 0.35, kind: 'rowboatEnd' })).keep = true;
      this.mark(px, pz, 1.0);
      break;
    }
    // a pair of stone lanterns at each bridge head
    for (const [x, side] of [[x1 + 0.9, 1], [x0 - 0.9, -1]]) for (const sz of [-1, 1]) {
      let px = x, pz = br.z + sz * 2.2;
      for (let k = 0; k < 8 && (distToPaths(px, pz) < 0.35 || this.H(px, pz) < 0.3); k++) { pz += sz * 0.25; px += side * 0.1; }
      if (this.H(px, pz) < 0.3) continue;
      this.piece(toroPiece(40 + sz + side * 3, 0.72), px, pz, side > 0 ? -PI / 2 : PI / 2, { y: this.H(px, pz) - 0.03, col: 0.32, kind: 'bridgeLantern', keep: 0.35 });
      this.mark(px, pz, 0.5);
    }
  }
  // ---------------------------------------------------------------- the plaza: signpost, lantern bunting, hopscotch
  plaza() {
    const P = P0;
    // village signpost at the west edge of the plaza (arrows point along the paths)
    const sx = 52.3, sz = 62.9;
    const arms = [
      { a: Math.atan2(-1.2, -9), sym: 'leaf', color: '#bfe0a0' },     // west: bridge & bamboo grove
      { a: Math.atan2(-9, -2.5), sym: 'star', color: '#ffe6b0' },     // north: waterfall
      { a: Math.atan2(-9, 13), sym: 'bell', color: '#ffc8c8' },       // east: shrine & the Burrow
      { a: Math.atan2(15, 0), sym: 'fish', color: '#c8e4ff' },        // south: beach
    ];
    this.piece(signpostPiece(5, arms), sx, sz, 0, { col: 0.14, kind: 'signpost', keep: 0.3 });
    // lantern bunting on tall poles at three of the plaza's inner corners (paved, inside the ring the starter village
    // keeps free of random lots): strings along the back (north and west) edges and one garland across the middle that
    // hangs crosswise to the default camera (nothing runs along the view axis or in front of the plaza)
    const ph = 3.1, c = [[P.x - 3.8, P.z - 3.3], [P.x + 3.8, P.z - 3.3], [P.x - 3.8, P.z + 3.7]];
    const pole = polePiece(3, ph);
    const recs = c.map(([x, z]) => { const r = this.piece(pole, x, z, 0, { col: 0.12, kind: 'buntingPole', keep: 0.15 }); r.top = V(x, this.H(x, z) + ph - 0.12, z); return r; });
    const strings = [[0, 1, 0.55], [0, 2, 0.5], [1, 2, 0.85]];
    for (const [a, b, sag] of strings) {
      const A = recs[a].top, Bt = recs[b].top;
      const pc = buntingPiece(a * 7 + b, A, Bt, sag, true);
      const rec = this.rec((A.x + Bt.x) / 2, (A.z + Bt.z) / 2, { kind: 'bunting' }); rec.keep = true;
      recs[a].sat = [...(recs[a].sat || []), rec]; recs[b].sat = [...(recs[b].sat || []), rec];
      this.piece(pc, A.x, A.z, 0, { y: A.y, rec, light: false });
      const mid = A.clone().lerp(Bt, 0.5); mid.y -= sag;
      rec.lights = [this.world.lightPool.addSource({ pos: mid, color: col('#ffb08a'), intensity: 2.6, radius: 6.5, flicker: 0.5, nightOnly: true })];
    }
    // chalk hopscotch (and a heart) drawn on the pavers south of the fountain
    const chalk = this.geo('hopscotch', () => {
      const parts = [], line = (ax, az, bx, bz, c, w = 0.045) => {
        const L = Math.hypot(bx - ax, bz - az), g = new THREE.PlaneGeometry(L + w, w); layFlat(g);
        g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 0, (az + bz) / 2); paint(g, (p, n, o) => o.set(c)); parts.push(g);
      };
      const sq = 0.44, cols = ['#fffaf2', '#ffd8e8', '#fff0b0', '#d8ecff'];
      const rows = [[0], [-0.5, 0.5], [0], [-0.5, 0.5], [0]];
      rows.forEach((r, i) => r.forEach(u => {
        const x = u * sq, z = i * sq, h = sq / 2, c = cols[(i + (u > 0 ? 1 : 0)) % 4];
        line(x - h, z - h, x + h, z - h, c); line(x + h, z - h, x + h, z + h, c); line(x + h, z + h, x - h, z + h, c); line(x - h, z + h, x - h, z - h, c);
      }));
      const zc = rows.length * sq - sq / 2;
      for (let k = 0; k < 8; k++) { const a0 = k / 8 * PI, a1 = (k + 1) / 8 * PI; line(Math.cos(a0) * sq * 0.5, zc + Math.sin(a0) * sq * 0.5, Math.cos(a1) * sq * 0.5, zc + Math.sin(a1) * sq * 0.5, '#fffaf2'); }
      // a little heart doodle beside it
      const hp = [];
      for (let k = 0; k <= 20; k++) { const t = k / 20 * TAU, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); hp.push([0.75 + x * 0.012, 0.5 - y * 0.012]); }
      for (let k = 0; k < hp.length - 1; k++) line(hp[k][0], hp[k][1], hp[k + 1][0], hp[k + 1][1], '#ff9ec0', 0.03);
      return merge(parts);
    });
    const hx = 55.95, hz = 62.05;
    const hrec = this.rec(hx, hz + 1, { kind: 'chalk' }); hrec.keep = true;
    this.put('flat', chalk, hx, this.H(hx, hz) + 0.012, hz, { rot: 0, rec: hrec });
  }
  // a short trail of flat stepping stones across the lawn from (ax, az) to (bx, bz)
  steppingStones(ax, az, bx, bz, rec) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 0.62)), rnd = mulberry32(Math.round(ax * 31 + bz * 17));
    const flat = [0, 1, 2].map(v => this.geo('flat' + v, () => stoneGeo(v * 13 + 7, 0.4)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, side = (i % 2 ? 1 : -1) * 0.1, dx = (bx - ax) / L, dz = (bz - az) / L;
      const x = ax + (bx - ax) * t - dz * side + (rnd() - 0.5) * 0.06, z = az + (bz - az) * t + dx * side + (rnd() - 0.5) * 0.06;
      const s = 0.44 + rnd() * 0.1;
      this.put('stone', flat[i % 3], x, this.H(x, z) - 0.04, z, { rot: rnd() * TAU, s: [s, 0.28, s * 0.85], color: STONE_TINTS[Math.floor(rnd() * 6)], rec });
    }
    this.count('stepping', n);
  }
  // path sides ordered so a piece standing there and facing the path also faces the default camera (+x, +z)
  camSides(dx, dz) { return (dz - dx) > 0 ? [1, -1] : [-1, 1]; }
  // ---------------------------------------------------------------- the way to the shrine: stone lantern pairs, jizo
  shrine() {
    const path = PATHS[0];
    // walk the path from the hill foot up to the gate; a lantern pair every ~4.5 m
    const pts = path.pts;
    let acc = 0, next = 0, n = 0;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let u = 0; u < L; u += 0.25) {
        const x = ax + dx * u, z = az + dz * u, d = acc + u;
        if (x < 76.5 || Math.hypot(x - LANDMARKS.dungeon.x, z - LANDMARKS.dungeon.z) < 4.2 || d < next) continue;
        next = d + 4.6;
        for (const side of [-1, 1]) {
          let off = path.w / 2 + 0.55, px, pz;
          for (let k = 0; k < 6; k++, off += 0.15) { px = x - dz * off * side; pz = z + dx * off * side; if (distToPaths(px, pz) > 0.3 && this.free(px, pz, 0.3)) break; }
          if (this.slope(px, pz) > 0.45 || !this.free(px, pz, 0.3)) continue;
          this.piece(toroPiece(60 + n * 2 + (side > 0 ? 1 : 0), 0.74, 0.62), px, pz, Math.atan2(x - px, z - pz), { y: this.H(px, pz) - 0.03, col: 0.28, kind: 'shrineLantern', light: n % 2 === 0, keep: 0.3 });
          this.mark(px, pz, 0.45);
        }
        n++;
      }
      acc += L;
    }
    // a row of nobori banners along the far side of the approach, between the lanterns, their cloth to the camera
    // (anything spanning this path, like a torii, would be edge-on: the approach runs across the default view)
    const banners = [['#e8403a', 'sakura', '#fff6ea'], ['#fff6ea', 'sakura', '#e8403a'], ['#2f4a7a', 'bell', '#fff6ea']]
      .map(([c, sym, symColor], i) => kit(80 + i, B => B.at([-0.2, 0, 0], 0, () => nobori(B, { h: 2.2, w: 0.38, color: c, sym, symColor, hem: c === '#fff6ea' ? '#e8403a' : '#fff6ea' })), 0.01));
    let nf = 0;
    for (let sg = 2; sg <= 4; sg++) {
      const [ax, az] = pts[sg], [bx, bz] = pts[sg + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      const side = this.camSides(dx, dz)[0];
      for (let u = 1.4; u < L - 0.6; u += 3.1) {
        const off = path.w / 2 + 0.5, px = ax + dx * u - dz * off * side, pz = az + dz * u + dx * off * side;
        if (!this.free(px, pz, 0.35) || this.slope(px, pz) > 0.45 || this.tile(px, pz) === T.PATH) continue;
        this.piece(banners[nf % 3], px, pz, Math.atan2(dz * side, -dx * side), { col: 0.12, kind: 'nobori', light: false, keep: 0.18 });
        this.mark(px, pz, 0.35); nf++;
      }
    }
    // jizo trio beside the path where it starts to climb (facing the path)
    {
      const [ax, az] = pts[2], [bx, bz] = pts[3], t = 0.55, x = ax + (bx - ax) * t, z = az + (bz - az) * t, L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (const side of this.camSides(dx, dz)) {
        const px = x - dz * (path.w / 2 + 0.9) * side, pz = z + dx * (path.w / 2 + 0.9) * side;
        if (!this.free(px, pz, 0.6) || this.tile(px, pz) !== T.GRASS) continue;
        this.piece(jizoPiece(8, 3), px, pz, Math.atan2(x - px, z - pz), { col: 0.45, kind: 'jizo', keep: 0.7 });
        this.mark(px, pz, 0.7);
        break;
      }
    }
  }
  // ---------------------------------------------------------------- the waterfall trail: a wayside shrine and a bench
  northPath() {
    const path = PATHS[4], pts = path.pts;
    const spots = [[1, 0.45, 'hokora'], [2, 0.5, 'bench']];
    for (const [s, t, what] of spots) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const side of this.camSides(dx, dz)) {
        const off = path.w / 2 + (what === 'bench' ? 0.75 : 0.85), px = x - dz * off * side, pz = z + dx * off * side;
        if (!this.free(px, pz, 0.7) || this.tile(px, pz) !== T.GRASS || this.slope(px, pz) > 0.3) continue;
        const face = Math.atan2(x - px, z - pz);
        this.piece(what === 'bench' ? benchPiece(3) : hokoraPiece(4), px, pz, face, { col: what === 'bench' ? 0.5 : 0.45, kind: what, keep: 0.6 });
        this.mark(px, pz, 0.8);
        break;
      }
    }
  }
  // ---------------------------------------------------------------- the beach: shells, starfish, driftwood
  beach() {
    const rnd = mulberry32(8080), B0 = LANDMARKS.beach;
    const kinds = ['scallop', 'scallop', 'spiral', 'star'];
    const shells = kinds.map((k, i) => [0, 1].map(v => this.geo(`shell:${k}${i}${v}`, () => shellGeo(v * 5 + i, k))));
    let n = 0, drift = 0;
    for (let i = 0; i < 1400 && n < 60; i++) {
      const x = B0.x + (rnd() - 0.5) * 60, z = B0.z + (rnd() - 0.5) * 30;
      const h = this.H(x, z);
      if (this.tile(x, z) !== T.SAND || h < 0.04 || h > 0.42 || Math.hypot(x - 56, z - 58) < 36) continue;
      const rec = this.rec(x, z, { kind: 'shell' });
      if (drift < 4 && rnd() < 0.08 && h > 0.12) {
        this.piece(driftwoodPiece(drift + 1), x, z, rnd() * TAU, { y: h - 0.03, rec, light: false });
        drift++;
      } else {
        const k = Math.floor(rnd() * 4);
        this.put('flat', shells[k][Math.floor(rnd() * 2)], x, h, z, { rot: rnd() * TAU, s: 0.9 + rnd() * 0.5, rec });
      }
      n++;
    }
    this.count('beach', n);
  }
}
