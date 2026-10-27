// The west group's shared kit (ROADMAP HP-1: Lighthouse Point, the Bamboo Tea Garden, the Tide Pools, Kite Hill): a
// site frame in the place's local metres, candy-smooth mossy boulders (the falls garden's look), rope-and-post fences,
// flowers, ferns, grass tufts, stepping stones and pebbles. Every place builds its kit at its own centre with the
// kit's floor (y0) under the lowest ground, so the kit's painted ground shade never darkens a slope, and local y is
// world y - y0.
import * as THREE from 'three';
import { G, V, PI, col } from '../../buildings/kit.js';
import { mossLine, nz, leafGeo, blossomGeo } from '../../buildings/props.js';
import { puff, tube, paint, mergeVertices } from '../../../gfx/geom.js';
import { makeToon } from '../../../gfx/materials.js';
import { distToRamble } from '../../outskirtsPlan.js';
import { clamp, TAU, mulberry32 } from '../../../core/util.js';

export const WOOD = '#c98a45', WOOD_HI = '#e0a85e', WOOD_D = '#8f5a34', ROPE = '#dcc08a', BRASS = '#d0a040';
export const STONE = ['#8b8694', '#d0c9d0'], MOSS = '#5a9230', MOSS_HI = '#9cbf50', MOSS_EDGE = '#43752c';
export const BLOOMS = ['#ffffff', '#ffb2cc', '#ff8fb4', '#fff3f8', '#ffd76a'];
const LEAF_G = ['#4f9a3c', '#62ad45', '#3f8a38', '#76bd4e'];

/** the place's frame: local metres from its centre (x east, z south), y above the kit floor y0 (world y0) */
export function site(ctx, y0) {
  const { poi } = ctx, rnd = mulberry32(poi.id.length * 7919 + Math.round(poi.x * 13 + poi.z * 7));
  const S = {
    ctx, poi, y0, rnd,
    /** local ground height (kit frame) */
    H: (x, z) => ctx.H(poi.x + x, poi.z + z) - y0,
    /** distance from the trail's centre line */
    trail: (x, z) => distToRamble(poi.x + x, poi.z + z),
    /** world point of a local one */
    W: (x, y, z) => new THREE.Vector3(poi.x + x, y0 + y, poi.z + z),
    kit: (seed, fn, o = {}) => { const inst = ctx.kit(seed, fn, { x: poi.x, z: poi.z, y: y0, yaw: 0, warp: 0.008, ...o }); inst.group.name = `west:${poi.id}`; return inst; },
    /** a solid circle (local); warns if it would stand in the trail */
    collide(x, z, r) {
      const d = S.trail(x, z);
      if (d - r < 1.3) console.warn(`[outskirts:${poi.id}] collider at ${x.toFixed(1)}, ${z.toFixed(1)} r ${r} is ${(d - r).toFixed(2)} m from the trail`);
      return ctx.collide(poi.x + x, poi.z + z, r);
    },
    interact: (o) => ctx.interact({ ...o, x: poi.x + o.x, z: poi.z + o.z, y: o.y != null ? o.y + y0 : null }),
    /** any three.js object at a local position */
    add(obj, x = 0, y = 0, z = 0) { obj.position.set(poi.x + x, y0 + y, poi.z + z); obj.name ||= `west:${poi.id}`; return ctx.add(obj); },
  };
  return S;
}

// ------------------------------------------------------------------ stones
// a candy-smooth stone with a plump moss cushion grown out of its top (fallsGarden.js's look): welded so it shades
// round, the moss lifted along the normal, a darker band where the cushion meets the stone and a sunny crown
export function mossyStone(g0, { amt = 0.45, sc = 1, seed = 0, lift = 0.05, stone = STONE, wet = -99 } = {}) {
  g0.deleteAttribute('normal'); if (g0.attributes.uv) g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, w = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const m = amt > 0 ? clamp((mossLine(n.getY(i), p.getX(i), p.getZ(i), amt, sc, seed) + 0.03) * 9) : 0;
    w[i] = m; const k = m * m * (3 - 2 * m) * lift;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  g.computeVertexNormals();
  const s0 = col(stone[0]), s1 = col(stone[1]), mo = col(MOSS), hi = col(MOSS_HI), ed = col(MOSS_EDGE), t = new THREE.Color(), dk = col('#5d5868');
  return paint(g, (pp, nn, o, i) => {
    o.copy(s0).lerp(s1, clamp(nn.y * 0.55 + 0.35)).multiplyScalar(0.95 + 0.08 * nz(pp.x * 2.3 + seed, pp.y * 2.3));
    if (pp.y < wet) o.lerp(dk, clamp((wet - pp.y) * 3) * 0.45); // (a darker wet foot at the waterline)
    const m = w[i], up = clamp(nn.y * 1.25 - 0.2);
    t.copy(ed).lerp(mo, clamp(up * 2.2)).lerp(hi, clamp(up * 1.8 - 0.75)).multiplyScalar(0.93 + 0.12 * nz(pp.x * 4.1, pp.z * 4.1));
    t.lerp(ed, clamp(1 - m * 1.6) * 0.6);
    o.lerp(t, clamp(m * 1.4));
  });
}
/** a rounded boulder at local (x, y, z) (its centre; the bottom third sinks into the ground) → { x, y, z, r, top } */
export function boulder(B, S, x, y, z, r, { sq = 0.75, moss = 0.45, stretch = 1.15, yaw = S.rnd() * TAU, seed = Math.floor(S.rnd() * 1e4), noise = 0.08, wet, stone, detail = r > 1.15 ? 3 : 2 } = {}) {
  const g = puff(V(0, 0, 0), r, { detail, noise, squash: sq, seed });
  g.scale(stretch, 1, 1 / Math.sqrt(stretch)); g.rotateY(yaw); g.translate(x, y, z);
  B.add(mossyStone(g, { amt: moss * 0.8, sc: 0.6 / r, seed, lift: r * 0.08, wet: wet ?? -99, stone }), null);
  return { x, y, z, r, top: y + r * sq };
}
/** a boulder sat on the ground at local (x, z): `sink` of its height below the surface */
export function groundStone(B, S, x, z, r, o = {}) {
  const sq = o.sq ?? 0.75, y = S.H(x, z) + r * sq * (0.62 - (o.sink ?? 0.25));
  return boulder(B, S, x, y, z, r, o);
}
/** a flat stepping stone set into the ground */
export function stepStone(B, S, x, z, r, { yaw = S.rnd() * TAU, lift = 0.07, moss = 0, y = null } = {}) {
  const seed = Math.floor(S.rnd() * 1e4), g = puff(V(0, 0, 0), r, { detail: 2, noise: 0.07, squash: 0.3, seed });
  g.scale(1.15, 1, 0.9); g.rotateY(yaw); g.translate(x, (y ?? S.H(x, z)) + lift, z);
  B.add(mossyStone(g, { amt: moss, sc: 3, seed, lift: 0.015, stone: ['#9d98a6', '#dcd6dc'] }), null);
}
/** a lacy collar of foam round a rock standing in the sea (local water height y): a lumpy flat ring and a few beads */
export function foam(B, S, x, z, r, y, { n = 5 } = {}) {
  const seed = S.rnd() * 50, g = G.torus(r, Math.max(0.07, r * 0.12), 4, 22); g.rotateX(PI / 2); g.scale(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i), a = Math.atan2(pz, px), k = 1 + 0.07 * Math.sin(a * 5 + seed) + 0.05 * Math.sin(a * 9 - seed * 2);
    p.setXYZ(i, px * k, Math.max(-0.01, p.getY(i) * 0.35), pz * k);
  }
  g.computeVertexNormals(); g.translate(x, y + 0.015, z);
  B.add(g, (pp, nn, o) => o.set('#f2fafa').multiplyScalar(0.9 + 0.1 * clamp(nn.y)));
  for (let i = 0; i < n; i++) {
    const a = S.rnd() * TAU, d = r * (1.12 + S.rnd() * 0.18), s = r * (0.07 + S.rnd() * 0.05);
    const b = G.sph(s, 6, 3); b.scale(1.5, 0.3, 1); b.rotateY(-a); b.translate(x + Math.cos(a) * d, y + 0.012, z + Math.sin(a) * d);
    B.add(b, '#eef8f8');
  }
}
/** little pebbles scattered round (x, z) */
export function pebbles(B, S, x, z, n, spread, { size = 0.07, colors = ['#b4adbd', '#cfc8d6', '#9d97a8', '#e0d8d0'] } = {}) {
  for (let i = 0; i < n; i++) {
    const a = S.rnd() * TAU, d = Math.sqrt(S.rnd()) * spread, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, s = size * (0.6 + S.rnd() * 0.8);
    const g = G.ico(s, 0); g.scale(1.3, 0.55, 1); g.rotateY(S.rnd() * TAU); g.translate(px, S.H(px, pz) + s * 0.2, pz);
    B.add(g, colors[i % colors.length]);
  }
}

// ------------------------------------------------------------------ fences
/** a chunky round post (rope wraps, a rounded cap) at local (x, z), h tall → its top point */
export function post(B, S, x, z, h = 0.8, { r = 0.085, wraps = true, y = null } = {}) {
  const g0 = (y ?? S.H(x, z)) - 0.15, top = g0 + 0.15 + h;
  const p = G.cyl(r * 0.95, r * 1.05, top - g0, 8, true); p.translate(x, (top + g0) / 2, z);
  B.add(p, (pp, n, o) => o.set(WOOD).multiplyScalar(0.86 + 0.14 * clamp(n.x * 0.5 + 0.5) + 0.06 * nz(pp.y * 9, Math.atan2(n.z, n.x) * 2)));
  const cap = G.sph(r * 1.0, 8, 4); cap.scale(1, 0.5, 1); cap.translate(x, top, z); B.add(cap, (pp, n, o) => o.set(WOOD_HI).lerp(col('#b87c3e'), clamp(n.y * 2 - 1.2) * 0.6)); // (a rounded top, darker end grain)
  if (wraps) for (let k = 0; k < 2; k++) { const t = G.torus(r + 0.012, 0.022, 4, 8); t.rotateX(PI / 2); t.translate(x, top - 0.16 - k * 0.055, z); B.add(t, ROPE); }
  return V(x, top - 0.17, z);
}
/** a sagging rope from a to b (local Vector3s) */
export function rope(B, a, b, { sag = 0.12, r = 0.026, color = ROPE } = {}) {
  const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push({ p: a.clone().lerp(b, t).add(V(0, -Math.sin(t * PI) * sag, 0)), r }); }
  B.add(tube(pts, 5, false), (p, n, o) => o.set(color).multiplyScalar(0.88 + 0.14 * clamp(n.y * 0.5 + 0.5)));
}
/** a rope fence along local points [[x, z], ...]; `gaps`: indices of spans left open (an opening between two posts) */
export function ropeFence(B, S, pts, { h = 0.78, gaps = [], solid = true } = {}) {
  const tops = pts.map(([x, z]) => post(B, S, x, z, h));
  for (let i = 0; i < pts.length - 1; i++) if (!gaps.includes(i)) rope(B, tops[i], tops[i + 1], { sag: 0.06 + 0.04 * tops[i].distanceTo(tops[i + 1]) });
  if (solid) for (const [x, z] of pts) S.collide(x, z, 0.16);
  return tops;
}

// ------------------------------------------------------------------ plants
/** a clump of toy flowers: leaf rosettes, stems and five-petal heads (or white spikes) round local (x, z) */
export function flowers(B, S, x, z, { n = 5, r = 0.4, colors = BLOOMS, size = 1.45, spikes = 0, y = null } = {}) {
  const rnd = S.rnd;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, gy = (y ?? S.H(px, pz)) - 0.01;
    for (let k = 0; k < 3; k++) { const lf = leafGeo(0.17 * size, 0.06 * size, 0.3); lf.rotateZ(0.4 + rnd() * 0.3); lf.rotateY(k * 2.1 + a); lf.translate(px, gy, pz); B.add(lf, LEAF_G[(i + k) % 4], 'leaf'); }
    const hh = (0.16 + rnd() * 0.14) * size;
    const st = G.cyl(0.008, 0.012, hh, 3, true); st.translate(px, gy + hh / 2, pz); B.add(st, '#4a8a3a', 'leaf');
    const c = colors[Math.floor(rnd() * colors.length)];
    if (i < spikes) { // a tall white spike of little bells (foxglove-ish)
      const H = hh + 0.25 * size;
      for (let k = 0; k < 6; k++) { const b = G.ico(0.045 * size * (1 - k * 0.1), 0); b.translate(px + Math.sin(k * 2.3) * 0.02, gy + H * (0.45 + k * 0.11), pz + Math.cos(k * 2.3) * 0.02); B.add(b, k > 3 ? '#fff8f0' : c, 'leaf'); }
      const st2 = G.cyl(0.01, 0.012, H, 3, true); st2.translate(px, gy + H / 2, pz); B.add(st2, '#4a8a3a', 'leaf');
      continue;
    }
    const R = (0.06 + rnd() * 0.03) * size, f = blossomGeo(R, 5, 0.45);
    f.rotateX((rnd() - 0.5) * 0.5 + 0.25); f.rotateZ(-0.25); f.translate(px, gy + hh, pz);
    const fc = col(c), wh = col('#ffffff');
    B.add(f, (p, nn, o) => o.copy(fc).lerp(wh, clamp(Math.hypot(p.x - px, p.z - pz) / R - 0.4) * 0.25), 'leaf');
    const eye = G.ico(R * 0.3, 0); eye.scale(1, 0.55, 1); eye.translate(px, gy + hh + 0.012, pz); B.add(eye, c === '#ffd76a' ? '#ff9a3a' : '#ffd24a', 'leaf');
  }
}
/** a fern: arching fronds of leaf cards */
export function fern(B, S, x, z, { s = 1, y = null, n = 7 } = {}) {
  const gy = y ?? S.H(x, z);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + S.rnd() * 0.4, L = (0.5 + S.rnd() * 0.2) * s;
    const f = leafGeo(L, 0.1 * s, 0.2); f.rotateZ(0.5 + S.rnd() * 0.25); f.rotateY(-a); f.translate(x, gy + 0.04, z);
    B.add(f, i % 2 ? '#4c9b43' : '#66b34a', 'leaf');
  }
}
/** a tuft of long grass blades (beach grass, the lawn's edges) */
export function tuft(B, S, x, z, { h = 0.45, n = 7, colors = ['#7cb84a', '#9acb58', '#5f9e3e'], y = null, lean = 0.35 } = {}) {
  const gy = y ?? S.H(x, z);
  for (let i = 0; i < n; i++) {
    const a = S.rnd() * TAU, L = h * (0.6 + S.rnd() * 0.6), bl = leafGeo(L, 0.035 + S.rnd() * 0.02, 0.25);
    bl.rotateZ(PI / 2 - lean * (0.4 + S.rnd())); bl.rotateY(a); bl.translate(x + Math.cos(a) * 0.04, gy - 0.02, z + Math.sin(a) * 0.04);
    B.add(bl, colors[i % colors.length], 'leaf');
  }
}
/** a round leafy shrub: a hidden mass shapes it, dense diamond leaves make it (no smooth blob shows) */
export function shrub(B, S, x, z, { r = 0.45, color = '#5aa548', y = null, flowers: fl = null, sq = 0.8, nf = 6, fs = 0.07 } = {}) {
  const gy = y ?? S.H(x, z), c = V(x, gy + r * sq * 0.75, z), rnd = S.rnd;
  const base = col(color), hi = base.clone().lerp(col('#d8f08a'), 0.35), lo = base.clone().lerp(col('#24502e'), 0.45);
  const inner = puff(c, r * 0.82, { detail: 1, noise: 0.2, squash: sq, seed: Math.floor(rnd() * 999) }); // (the shaded heart, seen only through gaps)
  B.add(inner, (p, n, o) => o.copy(lo).lerp(base, clamp(n.y * 0.5 + 0.3)), 'leaf');
  const N = Math.round(50 + r * r * 220);
  for (let i = 0; i < N; i++) {
    const u = -0.25 + rnd() * 1.2, th = rnd() * TAU, s = Math.sqrt(Math.max(0, 1 - u * u)), d = V(s * Math.cos(th), u * sq, s * Math.sin(th));
    const p = c.clone().addScaledVector(d, r * (0.92 + rnd() * 0.16)), L = (0.13 + rnd() * 0.06) * Math.min(1.4, 0.6 + r), g = leafGeo(L, L * 0.42, 0.4);
    g.rotateX((rnd() - 0.5) * 0.6); g.rotateZ(-0.3 - rnd() * 0.4 + u * 0.5); g.rotateY(-th + (rnd() - 0.5) * 0.8); g.translate(p.x, p.y, p.z);
    const k = base.clone().lerp(rnd() < 0.5 ? hi : lo, rnd() * 0.45).lerp(hi, clamp(u) * 0.35);
    B.add(g, k, 'leaf');
  }
  if (fl) for (let i = 0; i < nf; i++) {
    const a = rnd() * TAU, u = 0.25 + rnd() * 0.6, s = Math.sqrt(1 - u * u), p = c.clone().add(V(Math.cos(a) * s * r, u * r * sq, Math.sin(a) * s * r));
    const f = blossomGeo(fs * (0.85 + rnd() * 0.3), 5, 0.45); f.rotateX(-Math.sin(a) * (1 - u) * 0.8); f.rotateZ(Math.cos(a) * (1 - u) * 0.8); f.translate(p.x, p.y + 0.02, p.z);
    B.add(f, fl[i % fl.length], 'leaf');
    const e = G.sph(0.022, 5, 3); e.translate(p.x, p.y + 0.03, p.z); B.add(e, '#ffd24a', 'leaf');
  }
}

// ------------------------------------------------------------------ water
// shallow clear water (a rock pool, a basin): see-through turquoise over its own sandy bottom, soft drifting ripple
// lines, caustic glints and a pale foam edge where it meets the rim (uv.x: 0 at the centre, 1 at the edge). Lit by the
// toon ramp, so it dims with the sky at dusk like the rocks round it.
let _pool = null;
export function poolWaterMat() {
  if (_pool) return _pool;
  _pool = makeToon({
    vertexColors: true, transparent: true, opacity: 0.4, rim: 0.15, brush: 0.02, term: [-0.4, 0.5], shadowSat: 0.15,
    vertexPars: 'varying vec2 vPw;', vertexWorld: 'vPw = uv;', fragPars: 'varying vec2 vPw;',
    fragColor: /* glsl */`{
      vec2 q = vCWorld.xz;
      float n = texture2D(uBrush, q * 0.35 + vec2(uTime * 0.03, uTime * 0.02)).r;
      float n2 = texture2D(uBrush, q * 0.6 - vec2(uTime * 0.025, uTime * 0.035)).g;
      float rip = sin((q.x * 0.8 + q.y * 0.6) * 9.0 + (n - 0.5) * 7.0 - uTime * 1.3);
      float line = smoothstep(0.92, 0.99, rip) * 0.4 + smoothstep(0.76, 0.88, n * 0.55 + n2 * 0.45) * 0.35;
      float edge = smoothstep(0.78, 0.97, vPw.x + (n2 - 0.5) * 0.12);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(line * 0.5 + edge * 0.7, 0.0, 1.0));
      diffuseColor.a = mix(diffuseColor.a, 0.92, clamp(line * 0.35 + edge * 0.9, 0.0, 1.0));
    }`,
  });
  _pool.depthWrite = false;
  return _pool;
}
/** a blob outline: n points round (0, 0) of radius r, wobbled → [[x, z], ...] */
export function blob(r, n, wob, seed) {
  const rr = mulberry32(seed), ph = rr() * TAU, ph2 = rr() * TAU;
  return Array.from({ length: n }, (_, i) => { const a = i / n * TAU, k = 1 + wob * (Math.sin(a * 2 + ph) * 0.6 + Math.sin(a * 3 + ph2) * 0.4); return [Math.cos(a) * r * k, Math.sin(a) * r * k]; });
}
/** a flat fan over an outline (local, centred at cx, cz, height y) with uv.x 0 at the centre → 1 at the edge */
export function fanGeo(outline, cx, y, cz, rings = 3) {
  const pos = [], uv = [], n = outline.length;
  const at = (k, t) => { const [x, z] = outline[k % n]; return [cx + x * t, y, cz + z * t]; };
  for (let k = 0; k < n; k++) for (let i = 0; i < rings; i++) {
    const t0 = i / rings, t1 = (i + 1) / rings;
    const a = at(k, t0), b = at(k + 1, t0), c = at(k + 1, t1), d = at(k, t1);
    if (i === 0) { pos.push(...a, ...c, ...d); uv.push(t0, 0, t1, 0, t1, 0); }
    else { pos.push(...a, ...c, ...d, ...a, ...b, ...c); uv.push(t0, 0, t1, 0, t1, 0, t0, 0, t0, 0, t1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** wear the lawn bare where inside(localX, localZ) (terrain wear, like a stall's floor in home/sources.js): the grass
 *  collapses there and the terrain paints trodden earth (wear 255; ~170 is just bare) */
export function bare(S, inside, wear = 255) {
  const G = S.ctx.G, tr = G.sim?.terrain || S.ctx.world.terrain, W = tr?.wear; if (!W) return;
  const N = Math.round(Math.sqrt(W.length)), R = S.poi.r + 5;
  for (let zi = Math.floor(S.poi.z - R); zi <= Math.ceil(S.poi.z + R); zi++) for (let xi = Math.floor(S.poi.x - R); xi <= Math.ceil(S.poi.x + R); xi++) {
    if (xi < 0 || zi < 0 || xi >= N || zi >= N || !inside(xi + 0.5 - S.poi.x, zi + 0.5 - S.poi.z)) continue;
    W[zi * N + xi] = Math.max(W[zi * N + xi], wear);
  }
  if (G.sim?.refreshTiles) G.sim.refreshTiles(); else tr.syncTiles?.();
}
/** distance from (x, z) to the polyline pts [[x, z], ...] */
export function lineDist(x, z, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}
/** a kit whose group's origin is a pivot at local (x, y, z) (so it can be turned / moved as one; order YXZ: yaw, then
 *  pitch about its own x): fn builds round the pivot; the kit's floor sits `lift` below, out of the ground shade */
export function pivotKit(S, seed, fn, { x, y, z, yaw = 0, lift = 1 }) {
  const inst = S.ctx.kit(seed, B => { B.push([0, lift, 0]); fn(B); B.pop(); }, { x: S.poi.x + x, z: S.poi.z + z, y: S.y0 + y - lift, yaw, warp: 0 });
  inst.group.name = `west:${S.poi.id}`;
  for (const c of inst.group.children) c.position.y -= lift;
  inst.group.position.y += lift; inst.group.rotation.order = 'YXZ';
  return inst;
}

/** triangles in a group (for the report) */
export function tris(obj) { let t = 0; obj.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); }); return t; }
