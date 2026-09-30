// RegionTerrain (docs/REGIONS.md §3.6): the heightfield, walkability, surface masks and the splat/toon ground shader
// of an outdoor region. The CPU part (heights, masks, the mesh arrays) is built once per region id and cached for the
// session (terrain and landmarks are fixed per region); every visit wraps the cached arrays in fresh GPU objects that
// RegionWorld frees on exit.
//
// Heights: the biome's terrain.height(x, z, ctx) shapes the land (hills, ridges, cliffs, basins; ctx.play(x, z) is 1 on
// the playable skeleton: trail lanes, clearings, arena). The engine then carves the trail (flattened, slightly sunken,
// soft shoulders), flattens the clearings and the arena, and softly keeps playable ground inside the walkable band
// (terrain.band, default [0, 0.8] m). Walkable = inside the band, gentle slope, water shallower than `wade`, 2.5 m in
// from the map edge.
// The mesh is one non-uniform grid: 0.5 m cells over the map (plus an 8 m margin), 2 m cells for the ring of scenery
// beyond it (out to 50 m past the edge), so hills / cliffs / sea continue past the map and the edge never looks cut.
import * as THREE from 'three';
import { Noise, RNG, clamp, lerp, smoothstep } from '../core/util.js';
import { makeToon, POOL_GLSL } from '../gfx/materials.js';

export const SIZE = 112;
const MRES = 2; // surface-mask texels per metre (224 x 224)
export const MASK_RES = MRES;
const MN = SIZE * MRES;
// mesh / heightfield axis: [-50 .. -8] step 2, (-8 .. 120] step 0.5, (120 .. 162] step 2
const AX = (() => {
  const a = [];
  for (let x = -50; x < -8; x += 2) a.push(x);
  for (let x = -8; x <= 120 + 1e-6; x += 0.5) a.push(+x.toFixed(2));
  for (let x = 122; x <= 162; x += 2) a.push(x);
  return Float32Array.from(a);
})();
const NA = AX.length, I_IN = AX.indexOf(-8), I_OUT = AX.indexOf(120);
const EXT0 = AX[0], EXT1 = AX[NA - 1];
/** fractional axis index of coordinate v */
function axisF(v) {
  if (v <= EXT0) return 0;
  if (v >= EXT1) return NA - 1.0001;
  if (v < -8) return (v - EXT0) / 2;
  if (v <= 120) return I_IN + (v + 8) * 2;
  return I_OUT + (v - 120) / 2;
}

// default palette (a fresh spring meadow); recipe.terrain.palette overrides any entry (hex strings)
// Colours are display (sRGB) hex like vertex colours; ground albedo is pale because the toon light and the saturated
// shadows darken it (these defaults are the village ground's own values).
export const DEFAULT_PALETTE = {
  grass: ['#bce795', '#9bd195', '#daeca2', '#aaddad'], // [g1 bright, g2 deep, g3 sunny, g4 cool]
  dirt: ['#cec0aa', '#ddceb5'], pebble: '#b0a290',
  trail: { stone: ['#efe7dd', '#f9f3e7'], joint: '#c5ceaa', dirt: '#e2d2b6', border: '#ecddc5', stones: 1 },
  sand: ['#fcf1d7', '#f7e7ce'], wetSand: '#d6c6ae',
  rock: ['#e5d4c8', '#cec8da', '#efe5d4'], rockMoss: '#adce9e', cliffTop: '#c6e0a4',
  moss: ['#9cc88a', '#bfe09a'], litter: ['#f0c886', '#e6a47e', '#d4d68e'],
  snow: ['#fbfdff', '#e4ecfa'], accent: ['#f2e6c0', '#e2d2a4'], under: '#ceddc8',
};
const PAL_SLOTS = [
  ['grass', 4], ['dirt', 2], ['pebble', 1], ['trail.stone', 2], ['trail.joint', 1], ['trail.dirt', 1], ['trail.border', 1],
  ['sand', 2], ['wetSand', 1], ['rock', 3], ['rockMoss', 1], ['cliffTop', 1], ['moss', 2], ['litter', 3], ['snow', 2], ['accent', 2], ['under', 1],
]; // 30 vec3 slots

const CACHE = new Map();
/** the cached CPU terrain of a region (built on first use) */
export function regionTerrain(def, plan) {
  let T = CACHE.get(def.id);
  if (!T || T.plan !== plan || T.recipe !== def.terrain) { T = new RegionTerrain(def, plan); CACHE.set(def.id, T); }
  return T;
}

export class RegionTerrain {
  constructor(def, plan) {
    const t0 = performance.now();
    this.def = def; this.plan = plan; this.recipe = def.terrain;
    const td = this.td = def.terrain || {};
    this.N = SIZE; this.RES = 2;
    this.band = td.band || [0, 0.8];
    this.slopeMax = td.slopeMax ?? 0.45;
    const w = td.water;
    this.water = w ? { level: w.level ?? -0.35, wade: w.wade ?? 0.35, deep: w.deep || '#2a86c0', shallow: w.shallow || '#63d8d4', foam: w.foam || '#ffffff', frozen: w.frozen || [], sea: w.sea ?? false } : null;
    this.seed = hashStr(def.id);
    this.noise = new Noise(this.seed + 3);
    this.rng = new RNG(this.seed * 31 + 5);
    this.palette = mergePalette(td.palette);
    this.buildFields();
    this.ctx = this.makeCtx();
    this.buildHeights();
    this.buildMasks();
    this.ms = +(performance.now() - t0).toFixed(1);
  }

  // ------------------------------------------------------------------ skeleton fields (1 m grids over the map)
  // openD: signed distance to the playable skeleton (< 0 inside a lane / clearing); trailD: distance to the main trail
  buildFields() {
    const P = this.plan, n = SIZE + 1;
    const openD = this.openD = new Float32Array(n * n).fill(60), trailD = this.trailD = new Float32Array(n * n).fill(60);
    const segD = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)); const dx = px - ax - vx * t, dz = pz - az - vz * t; return Math.sqrt(dx * dx + dz * dz); };
    const R = 16;
    for (const [ax, az, bx, bz, lane] of P.segs) {
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(SIZE, Math.ceil(Math.max(ax, bx) + R));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - R)), z1 = Math.min(SIZE, Math.ceil(Math.max(az, bz) + R));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = segD(x, z, ax, az, bx, bz), k = z * n + x;
        if (d - lane < openD[k]) openD[k] = d - lane;
      }
    }
    const tr = P.trail;
    for (let i = 0; i < tr.length - 1; i++) {
      const [ax, az] = tr[i], [bx, bz] = tr[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(SIZE, Math.ceil(Math.max(ax, bx) + R));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - R)), z1 = Math.min(SIZE, Math.ceil(Math.max(az, bz) + R));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const d = segD(x, z, ax, az, bx, bz), k = z * n + x; if (d < trailD[k]) trailD[k] = d; }
    }
    for (const c of P.discs) {
      const x0 = Math.max(0, Math.floor(c.x - c.r - R)), x1 = Math.min(SIZE, Math.ceil(c.x + c.r + R));
      const z0 = Math.max(0, Math.floor(c.z - c.r - R)), z1 = Math.min(SIZE, Math.ceil(c.z + c.r + R));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const d = Math.hypot(x - c.x, z - c.z) - c.r, k = z * n + x; if (d < openD[k]) openD[k] = d; }
    }
  }
  /** bilinear sample of a 1 m skeleton field; outside the map: the border value plus the distance past it */
  field(F, x, z) {
    const cx = clamp(x, 0, SIZE), cz = clamp(z, 0, SIZE), out = Math.hypot(x - cx, z - cz);
    const fx = Math.min(cx, SIZE - 0.001), fz = Math.min(cz, SIZE - 0.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, n = SIZE + 1;
    const a = F[j * n + i], b = F[j * n + i + 1], c = F[(j + 1) * n + i], d = F[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz + out;
  }
  openDist(x, z) { return this.field(this.openD, x, z); }
  trailDist(x, z) { return this.field(this.trailD, x, z); }
  /** distance to the trail or any spur */
  pathDist(x, z) { let d = this.trailDist(x, z); if (d > 3) for (const s of this.plan.spurs) d = Math.min(d, distPoly(s, x, z)); return d; }
  /** 1 on the playable skeleton, 0 in the wild, over `soft` metres with a noisy (organic) edge */
  play(x, z, soft = this.td.playSoft ?? 5) {
    const d = this.openDist(x, z) + this.noise.n2(x * 0.09 + 3.1, z * 0.09 - 1.7) * 2.2;
    return 1 - smoothstep(0, soft, d);
  }

  // ------------------------------------------------------------------ the terrain ctx (biome height / surface fns)
  makeCtx() {
    const T = this, N = this.noise, P = this.plan;
    return {
      terrain: T, plan: P, size: SIZE, band: this.band, water: this.water, rng: this.rng, noise: N,
      n2: (x, z) => N.n2(x, z), fbm: (x, z, oct = 4, lac = 2, gain = 0.5) => N.fbm(x, z, oct, lac, gain),
      /** ridged fbm (0..1, sharp crests) */
      ridge: (x, z, oct = 4) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(N.n2(x * f, z * f))); n += a; a *= 0.5; f *= 2; } return s / n; },
      play: (x, z, soft) => T.play(x, z, soft), openDist: (x, z) => T.openDist(x, z), pathDist: (x, z) => T.trailDist(x, z),
      /** distance inside the map border (negative outside the map) */
      edge: (x, z) => Math.min(x, z, SIZE - x, SIZE - z),
      /** painted terraces: h snapped to `step` with a steep riser of width `sharp` (0..1 of the step) */
      terrace: (h, step = 2, sharp = 0.3) => { const f = h / step - Math.floor(h / step); return Math.floor(h / step) * step + smoothstep(1 - sharp, 1, f) * step; },
      lerp, clamp, smoothstep,
      start: P.start, arena: P.arena, camps: P.camps, pois: P.pois,
    };
  }

  // ------------------------------------------------------------------ heights
  rawHeight(x, z) {
    const f = this.td.height;
    if (f) return f(x, z, this.ctx);
    // default: gentle meadow in the play area, soft hills rising in the wild
    const c = this.ctx, p = c.play(x, z);
    const ground = 0.3 + c.fbm(x * 0.05, z * 0.05, 3) * 0.25;
    const hills = 2.5 + c.fbm(x * 0.03 + 7, z * 0.03, 4) * 3 + Math.max(0, -c.edge(x, z)) * 0.12;
    return lerp(hills, ground, p);
  }
  buildHeights() {
    const P = this.plan, h = this.h = new Float32Array(NA * NA);
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) h[j * NA + i] = this.rawHeight(AX[i], AX[j]);
    const [lo, hi] = this.band, mid = (lo + hi) / 2;
    const rawAt = (x, z) => this.gridHeight(x, z);
    // trail profile: raw height along the trail, clamped into the band and smoothed, then carved in (a little sunken)
    const carve = (path, w, sink) => {
      const prof = path.map(([x, z]) => clamp(rawAt(x, z), lo + 0.08, hi - 0.12));
      const sm = prof.map((_, i) => { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { const q = prof[clamp(i + k, 0, prof.length - 1)]; s += q; n++; } return s / n; });
      return { path, prof: sm, w, sink };
    };
    const carves = [carve(P.trail, P.trailW, 0.05), ...P.spurs.map(s => carve(s, 1.0, 0.03))];
    const shoulder = this.td.shoulder ?? 3.2, after = this.td.after || null;
    // clearings: flatten to a level near their natural height (the arena is a flat plane)
    const discs = P.discs.filter(d => d.kind !== 'open').map(d => ({ ...d, lvl: d.kind === 'arena' ? clamp(rawAt(d.x, d.z), lo + 0.1, hi - 0.25) : clamp(rawAt(d.x, d.z), lo + 0.1, hi - 0.15) }));
    const W = new Float32Array(NA * NA), TV = new Float32Array(NA * NA);
    for (let j = I_IN; j <= I_OUT; j++) for (let i = I_IN; i <= I_OUT; i++) {
      const x = AX[i], z = AX[j], k = j * NA + i;
      let hv = h[k];
      // keep playable ground inside the band (softly: a squashed overshoot, weighted by the play mask)
      const p = this.play(x, z, 3);
      if (p > 0) { const cl = hv > hi ? hi + (hv - hi) * 0.08 : hv < lo - 0.3 ? lo - 0.3 + (hv - lo + 0.3) * 0.25 : hv; hv = lerp(hv, cl, p * p); }
      // clearings
      let wsum = 0, tsum = 0;
      for (const d of discs) {
        const dd = Math.hypot(x - d.x, z - d.z);
        const inner = d.kind === 'arena' ? d.r - 2.5 : d.r - 2, outer = d.r + (d.kind === 'arena' ? 2.5 : 3.5);
        if (dd > outer) continue;
        const wt = 1 - smoothstep(inner, outer, dd);
        if (wt > wsum) { wsum = wt; tsum = d.lvl; }
      }
      if (wsum > 0) hv = lerp(hv, tsum, wsum);
      // trail carve: nearest carve point's profile height
      for (const c of carves) {
        const { d, i: si, t } = nearestOn(c.path, x, z);
        const reach = c.w + shoulder;
        if (d > reach) continue;
        const target = lerp(c.prof[si], c.prof[Math.min(si + 1, c.prof.length - 1)], t) - c.sink * (1 - smoothstep(c.w * 0.5, c.w + 0.4, d));
        const wt = 1 - smoothstep(c.w * 0.8, reach, d);
        if (wt > W[k]) { W[k] = wt; TV[k] = target; }
      }
      if (W[k] > 0) hv = lerp(hv, TV[k], W[k] * W[k] * (3 - 2 * W[k]));
      // the biome's last word (streams cut back through the trail under a bridge, a raised deck strip...)
      if (after) hv = after(x, z, hv, this.ctx);
      h[k] = hv;
    }
    // the mesh's outermost ring dips below the scenery so the edge of the world is never a visible cut
    for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) if (i === 0 || j === 0 || i === NA - 1 || j === NA - 1) h[j * NA + i] -= 12;
  }
  /** bilinear height from the grid anywhere on the mesh (in the map: the 0.5 m field) */
  gridHeight(x, z) {
    const fx = axisF(x), fz = axisF(z), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, h = this.h;
    const a = h[j * NA + i], b = h[j * NA + i + 1], c = h[(j + 1) * NA + i], d = h[(j + 1) * NA + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  heightAt(x, z) { return this.gridHeight(x, z); }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.5, hx = this.gridHeight(x + e, z) - this.gridHeight(x - e, z), hz = this.gridHeight(x, z + e) - this.gridHeight(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) {
    const e = 0.5, hx = this.gridHeight(x + e, z) - this.gridHeight(x - e, z), hz = this.gridHeight(x, z + e) - this.gridHeight(x, z - e);
    return 1 - 2 * e / Math.sqrt(hx * hx + 4 * e * e + hz * hz);
  }
  /** water depth at (x, z): the region's water level and any local pools; frozen areas count as 0 (ice is walked on) */
  waterAt(x, z) {
    let d = 0;
    const h = this.gridHeight(x, z), W = this.water;
    if (W) {
      d = W.level - h;
      if (d > 0 && W.frozen.length) for (const f of W.frozen) if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) { d = 0; break; }
    }
    return d > 0 ? d : 0;
  }
  iceAt(x, z) { const W = this.water; if (!W?.frozen.length || W.level <= this.gridHeight(x, z)) return false; return W.frozen.some(f => (x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r); }
  walkable(x, z) {
    if (x < 2.5 || z < 2.5 || x > SIZE - 2.5 || z > SIZE - 2.5) return false;
    const h = this.gridHeight(x, z), [lo, hi] = this.band;
    if (h > hi + 0.25 || h < lo - 0.9) return false;
    if (this.waterAt(x, z) > (this.water?.wade ?? 0.35)) return false;
    return this.slopeAt(x, z) < this.slopeMax;
  }
  /** unit vector (x, z) toward open water from (x, z), or null when no water within `R` metres */
  shoreDir(x, z, R = 14) {
    let bx = 0, bz = 0, best = 0.05;
    for (const r of [3, 6, 10, R]) for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      const d = this.waterAt(x + dx * r, z + dz * r) / (1 + r * 0.05);
      if (d > best) { best = d; bx = dx; bz = dz; }
    }
    return best > 0.05 ? { x: bx, z: bz } : null;
  }

  // ------------------------------------------------------------------ surface masks
  // mask0 = (trail, dirt, sand, grass density), mask1 = (moss, leaf litter, snow, accent), 2 texels / m
  buildMasks() {
    const td = this.td, P = this.plan, surf = td.surface;
    const m0 = this.mask0 = new Uint8Array(MN * MN * 4), m1 = this.mask1 = new Uint8Array(MN * MN * 4);
    const W = this.water, out = {}, N = this.noise, spurW = 1.0;
    const campD = (x, z) => { let d = 99; for (const c of P.camps) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r * 0.55); return d; };
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
      const x = (i + 0.5) / MRES, z = (j + 0.5) / MRES, h = this.gridHeight(x, z), slope = this.slopeAt(x, z);
      // engine layers: the trail (+ spurs), dirt in the camp clearings
      let trail = smoothstep(P.trailW + 1.0, P.trailW - 0.7, this.trailDist(x, z));
      if (P.spurs.length) { let sd = 99; for (const s of P.spurs) sd = Math.min(sd, distPoly(s, x, z)); trail = Math.max(trail, smoothstep(spurW + 0.8, spurW - 0.6, sd) * 0.92); }
      let dirt = smoothstep(1.5, -1.5, campD(x, z) + N.n2(x * 0.3, z * 0.3) * 1.2) * 0.85;
      for (const k in out) delete out[k];
      const s = surf ? surf(x, z, h, slope, this.ctx, out) || out : out;
      dirt = Math.max(dirt, s.dirt || 0); trail = Math.max(trail, s.trail || 0);
      const sand = s.sand || 0, moss = s.moss || 0, litter = s.litter || 0, snow = s.snow || 0, accent = s.accent || 0;
      const wet = W ? W.level + 0.08 - h : -1;
      let grass = s.grass ?? 1;
      grass *= 1 - Math.max(trail * 1.15, dirt * 0.9, sand, snow * 0.9);
      grass *= 1 - smoothstep(0.32, 0.42, slope);
      if (wet > -0.1) grass *= smoothstep(0.02, -0.12, wet);
      const k = (j * MN + i) * 4;
      m0[k] = clamp(trail) * 255; m0[k + 1] = clamp(dirt) * 255; m0[k + 2] = clamp(sand) * 255; m0[k + 3] = clamp(grass) * 255;
      m1[k] = clamp(moss) * 255; m1[k + 1] = clamp(litter) * 255; m1[k + 2] = clamp(snow) * 255; m1[k + 3] = clamp(accent) * 255;
    }
    // height texture (1 texel / m over the whole mesh extent) for water depth / foam and the weather kit
    const HS = this.hSize = Math.round(EXT1 - EXT0), hd = this.hData = new Float32Array(HS * HS);
    for (let j = 0; j < HS; j++) for (let i = 0; i < HS; i++) hd[j * HS + i] = this.gridHeight(EXT0 + i + 0.5, EXT0 + j + 0.5);
    this.hOrigin = EXT0;
  }
  /** surface weights at (x, z) from the masks (0..1 each) */
  surfaceAt(x, z) {
    const i = clamp(Math.floor(x * MRES), 0, MN - 1), j = clamp(Math.floor(z * MRES), 0, MN - 1), k = (j * MN + i) * 4, a = this.mask0, b = this.mask1;
    return { trail: a[k] / 255, dirt: a[k + 1] / 255, sand: a[k + 2] / 255, grass: a[k + 3] / 255, moss: b[k] / 255, litter: b[k + 1] / 255, snow: b[k + 2] / 255, accent: b[k + 3] / 255, water: this.waterAt(x, z) };
  }
  // ------------------------------------------------------------------ GPU objects (per visit; RegionWorld disposes them)
  textures(mask0 = this.mask0, mask1 = this.mask1) {
    const mk = (data, fmt, type, n, filter = THREE.LinearFilter) => { const t = new THREE.DataTexture(data, n, n, fmt, type); t.magFilter = filter; t.minFilter = filter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return t; };
    return {
      mask0: mk(mask0, THREE.RGBAFormat, THREE.UnsignedByteType, MN),
      mask1: mk(mask1, THREE.RGBAFormat, THREE.UnsignedByteType, MN),
      height: mk(this.hData, THREE.RedFormat, THREE.FloatType, this.hSize),
    };
  }
  geometry() {
    if (!this.pos) {
      const pos = this.pos = new Float32Array(NA * NA * 3);
      for (let j = 0; j < NA; j++) for (let i = 0; i < NA; i++) { const k = (j * NA + i) * 3; pos[k] = AX[i]; pos[k + 1] = this.h[j * NA + i]; pos[k + 2] = AX[j]; }
      const idx = this.idx = new Uint32Array((NA - 1) * (NA - 1) * 6);
      let o = 0;
      for (let j = 0; j < NA - 1; j++) for (let i = 0; i < NA - 1; i++) {
        const a = j * NA + i, b = a + 1, c = a + NA, d = c + 1;
        // alternate the diagonal so slopes don't streak in one direction
        if ((i + j) & 1) { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
        else { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      this.nrm = g.attributes.normal.array;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(EXT0, -30, EXT0), new THREE.Vector3(EXT1, 40, EXT1));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  }
  /** the splat / toon ground material (per-biome palette, see DEFAULT_PALETTE; td.shader for extra knobs) */
  material(tex) {
    const td = this.td, sh = td.shader || {}, W = this.water;
    const pal = [];
    for (const [key, n] of PAL_SLOTS) {
      const v = key.includes('.') ? this.palette[key.split('.')[0]][key.split('.')[1]] : this.palette[key];
      const arr = Array.isArray(v) ? v : [v];
      for (let i = 0; i < n; i++) pal.push(new THREE.Color(arr[Math.min(i, arr.length - 1)]));
    }
    const mat = makeToon({
      brush: sh.brush ?? 0.16, brushScale: 0.22, rim: 0.0, shadowSat: sh.shadowSat ?? 0.45,
      uniforms: {
        uMask0: { value: tex.mask0 }, uMask1: { value: tex.mask1 }, uPal: { value: pal },
        // x water level (or -99), y rock slope, z strata scale, w trail flagstone amount
        uTP0: { value: new THREE.Vector4(W ? W.level : -99, sh.rockSlope ?? 0.34, sh.strata ?? 2.6, this.palette.trail.stones ?? 1) },
        // x snow caps on ledges, y litter density, z caustics, w bare-earth amount under thin grass
        uTP1: { value: new THREE.Vector4(sh.snowCap ?? 0, sh.litter ?? 1, sh.caustics ?? (W ? 1 : 0), sh.bare ?? 0.8) },
        // x flagstone scale, y moss cushion scale, z wet-sand band height, w snow sparkle
        uTP2: { value: new THREE.Vector4(sh.stoneScale ?? 1.5, sh.mossScale ?? 2.2, sh.wetBand ?? 0.35, sh.sparkle ?? 0) },
      },
      fragPars: REGION_FRAG_PARS + POOL_GLSL,
      fragColor: REGION_FRAG_COLOR,
      fragOut: REGION_FRAG_OUT,
    });
    return mat;
  }
}

/** paint a surface layer into (a copy of) the masks: layer trail | dirt | sand | grass | moss | litter | snow | accent */
export function paintMask(mask0, mask1, layer, x, z, r, v = 1, soft = 0.5) {
  const ch = { trail: [0, 0], dirt: [0, 1], sand: [0, 2], grass: [0, 3], moss: [1, 0], litter: [1, 1], snow: [1, 2], accent: [1, 3] }[layer];
  if (!ch) return;
  const M = ch[0] ? mask1 : mask0, c = ch[1];
  const i0 = Math.max(0, Math.floor((x - r) * MRES)), i1 = Math.min(MN - 1, Math.ceil((x + r) * MRES)), j0 = Math.max(0, Math.floor((z - r) * MRES)), j1 = Math.min(MN - 1, Math.ceil((z + r) * MRES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot((i + 0.5) / MRES - x, (j + 0.5) / MRES - z) / r; if (d > 1) continue;
    const w = 1 - smoothstep(1 - soft, 1, d), k = (j * MN + i) * 4 + c;
    M[k] = clamp(lerp(M[k] / 255, v, w)) * 255;
  }
}
function mergePalette(p = {}) {
  const d = DEFAULT_PALETTE, o = { ...d, ...p };
  o.trail = { ...d.trail, ...(p.trail || {}) };
  return o;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
function nearestOn(pts, x, z) {
  let best = 1e18, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1));
    const dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { d: Math.sqrt(best), i: bi, t: bt };
}
function distPoly(pts, x, z) { return nearestOn(pts, x, z).d; }

// ------------------------------------------------------------------ the region ground shader
// Layers (bottom to top): grass (4 painted tones) with bare earth where grass is thin, moss cushions, leaf litter
// (stamped painted leaves), camp dirt with pebbles, sand, the wet-sand band at the water line, snow, the accent layer,
// the trail (flagstones in mossy joints, or packed earth with a dusty border), rock / cliff faces with painted strata,
// moss drips and optional snow on ledges, and the underwater tint with animated caustics.
const REGION_FRAG_PARS = /* glsl */`
uniform sampler2D uMask0;
uniform sampler2D uMask1;
uniform vec3 uPal[30];
uniform vec4 uTP0;
uniform vec4 uTP1;
uniform vec4 uTP2;
float rCaus = 0.0;
float rSnow = 0.0;
vec2 rHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// (edge distance, cell id hash, cell centre offset x, y)
vec4 rVoronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float md = 8.0, md2 = 8.0; vec2 id = vec2(0.0), mr = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = rHash2(n + g);
    vec2 r = g + o * 0.85 + 0.075 - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; id = n + g; mr = r; } else if (d < md2) { md2 = d; }
  }
  return vec4(sqrt(md2) - sqrt(md), fract(sin(dot(id, vec2(7.1, 3.3))) * 91.7), mr);
}
`;

const REGION_FRAG_COLOR = /* glsl */`
{
  vec3 wp = vCWorld;
  vec2 muv = wp.xz / 112.0;
  vec4 m0 = texture2D(uMask0, muv);
  vec4 m1 = texture2D(uMask1, muv);
  float h = wp.y;
  float slope = 1.0 - normalize(vCWN).y;
  float n1 = texture2D(uBrush, wp.xz * 0.021).g;
  float n2 = texture2D(uBrush, wp.xz * 0.0071 + 0.31).g;
  float n3 = texture2D(uBrush, wp.xz * 0.09).r;
  float n4 = texture2D(uBrush, wp.xz * 0.23 + 0.5).b;
  // grass: four painted tones in soft patches
  vec3 grass = mix(uPal[1], uPal[0], smoothstep(0.38, 0.62, n1));
  grass = mix(grass, uPal[2], smoothstep(0.52, 0.72, n2) * 0.7);
  grass = mix(grass, uPal[3], smoothstep(0.55, 0.75, 1.0 - n2) * 0.5);
  vec3 soil = mix(uPal[4], uPal[5], n3);
  float bare = smoothstep(0.6, 0.15, m0.a + (n1 - 0.5) * 0.35 + (n4 - 0.5) * 0.25) * uTP1.w;
  vec3 col = mix(grass, mix(grass * 0.85, soil, 0.72), bare);
  // moss carpet: soft cushions (cellular), darker gaps
  float moss = smoothstep(0.3, 0.62, m1.r + (n3 - 0.5) * 0.4);
  if (moss > 0.001) {
    vec4 mv = rVoronoi(wp.xz * uTP2.y);
    vec3 mc = mix(uPal[20], uPal[21], smoothstep(0.2, 0.9, mv.y) * 0.7 + smoothstep(0.0, 0.3, mv.x) * 0.3);
    mc *= 0.8 + 0.2 * smoothstep(0.0, 0.18, mv.x);
    col = mix(col, mc, moss);
  }
  // leaf litter: painted leaves stamped on a jittered grid, rotated, three tones
  float lit = m1.g * uTP1.y;
  if (lit > 0.01) {
    vec2 q = wp.xz * 2.6;
    vec2 cid = floor(q), cf = fract(q) - 0.5;
    vec2 hh = rHash2(cid);
    float ang = hh.x * 6.2831;
    vec2 d = cf - (hh - 0.5) * 0.4;
    d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
    float leaf = 1.0 - smoothstep(0.0, 0.05, abs(d.y) - 0.16 * (1.0 - pow(abs(d.x) / 0.36, 2.0)));
    leaf *= step(abs(d.x), 0.36) * step(hh.y, lit * 1.25);
    vec3 lc = hh.y < 0.33 ? uPal[22] : hh.y < 0.66 ? uPal[23] : uPal[24];
    lc *= 0.85 + 0.3 * fract(hh.x * 7.3);
    col = mix(col, mix(col, uPal[22] * 0.7, 0.35), smoothstep(0.1, 0.6, lit) * 0.5); // a blush of leaf mould under them
    col = mix(col, lc, leaf * 0.95);
  }
  // camp dirt: packed earth with pebbles
  float dirt = smoothstep(0.35, 0.62, m0.g + (n3 - 0.5) * 0.45 + (n1 - 0.5) * 0.2);
  if (dirt > 0.001) {
    vec4 pv = rVoronoi(wp.xz * 3.1);
    vec3 dc = mix(uPal[4], uPal[5], n3 * 0.7 + n4 * 0.3);
    dc = mix(dc, uPal[6], (1.0 - smoothstep(0.0, 0.3, pv.x)) * step(0.82, pv.y) * 0.8);
    col = mix(col, dc, dirt);
  }
  // sand + the wet band at the water line
  float sand = smoothstep(0.35, 0.6, m0.b + (n1 - 0.5) * 0.3);
  col = mix(col, mix(uPal[12], uPal[13], n3), sand);
  if (uTP0.x > -90.0) {
    float wet = (1.0 - smoothstep(0.0, uTP2.z, h - uTP0.x + (n3 - 0.5) * 0.08)) * step(uTP0.x - 0.8, h);
    col = mix(col, uPal[14] * (0.92 + 0.12 * n3), wet * max(sand, 0.55));
  }
  // snow
  float snow = smoothstep(0.35, 0.6, m1.b + (n2 - 0.5) * 0.3);
  rSnow = snow;
  col = mix(col, mix(uPal[25], uPal[26], clamp(smoothstep(0.3, 0.8, n3) * 0.6 + slope * 0.8, 0.0, 1.0)), snow);
  // accent layer (biome-specific: straw, gravel, petals...)
  float acc = smoothstep(0.35, 0.6, m1.a + (n3 - 0.5) * 0.35);
  col = mix(col, mix(uPal[27], uPal[28], n4), acc);
  // the trail: flagstones with mossy joints and a dusty border, or packed earth where stones run out
  float pe = m0.r + (n3 - 0.5) * 0.35 + (n1 - 0.5) * 0.15;
  float trailAmt = smoothstep(0.4, 0.55, pe);
  if (trailAmt > 0.001) {
    vec4 vo = rVoronoi(wp.xz * uTP2.x);
    vec3 stone = mix(uPal[7], uPal[8], vo.y) * (0.94 + 0.1 * n4);
    float gap = smoothstep(0.03, 0.13, vo.x);
    float hasStone = step(vo.y, uTP0.w * 1.02) * smoothstep(0.45, 0.62, pe + vo.y * 0.05);
    vec3 earth = mix(uPal[10], uPal[10] * 0.9, n4);
    vec3 tc = mix(earth, mix(mix(uPal[9], earth, 0.35), stone, gap), hasStone);
    tc = mix(uPal[11], tc, smoothstep(0.5, 0.68, pe));
    col = mix(col, tc, trailAmt);
  }
  // rock / cliff faces: wavy painted strata, dark seams, embedded stones, lichen, moss drips under the lip
  float rockAmt = smoothstep(uTP0.y, uTP0.y + 0.16, slope + (n2 - 0.5) * 0.22);
  if (rockAmt > 0.001) {
    float along = wp.x * 0.83 + wp.z * 0.57;
    float strata = h * uTP0.z * 0.4 + sin(along * 0.9) * 0.22 + sin(along * 2.3 + 1.7) * 0.08 + (n1 - 0.5) * 0.35;
    float band = fract(strata), bandId = floor(strata);
    float bh = fract(sin(bandId * 12.9898) * 43758.5453);
    vec3 rock = bh < 0.4 ? uPal[15] : bh < 0.75 ? uPal[16] : uPal[17];
    rock *= 0.9 + 0.2 * n3;
    rock *= mix(0.62, 1.0, smoothstep(0.0, 0.1, band) * smoothstep(1.0, 0.86, band));
    vec4 cst = rVoronoi(vec2(along * 1.6, h * 3.2));
    rock = mix(rock, rock * vec3(1.08, 1.04, 1.0), (1.0 - smoothstep(0.0, 0.35, cst.x)) * step(0.72, cst.y) * 0.8);
    rock = mix(rock, uPal[18] * 1.1, smoothstep(0.62, 0.82, n2) * 0.4);
    float drip = smoothstep(0.55, 0.95, sin(along * 7.0 + n1 * 5.0) * 0.5 + 0.5) * smoothstep(0.75, 0.35, slope);
    rock = mix(rock, uPal[18], drip * 0.65);
    rock *= mix(0.8, 1.0, smoothstep(-0.4, 0.8, h));
    // flat ledges between the faces: grassy (or snowy) tops
    float ledge = smoothstep(0.62, 0.4, slope) * smoothstep(0.5, 0.7, n4 + 0.3);
    rock = mix(rock, mix(uPal[19], uPal[25], uTP1.x), ledge * 0.7);
    rock = mix(rock, uPal[25], uTP1.x * smoothstep(0.55, 0.3, slope + (n3 - 0.5) * 0.3));
    col = mix(col, rock, rockAmt);
  }
  // under water: a cool tint deepening with depth, animated caustics in the shallows (added as light in fragOut)
  if (uTP0.x > -90.0) {
    float dep = uTP0.x - h;
    float uw = smoothstep(-0.02, 0.4, dep);
    col = mix(col, uPal[29] * (0.9 + 0.2 * n3), uw * 0.75);
    col *= 1.0 - smoothstep(0.2, 2.2, dep) * 0.35;
    if (dep > 0.0 && uTP1.z > 0.0) {
      vec2 cq = wp.xz * 0.9;
      float c1 = texture2D(uBrush, cq * 0.35 + vec2(uTime * 0.04, uTime * 0.03)).r;
      float c2 = texture2D(uBrush, cq * 0.29 - vec2(uTime * 0.03, uTime * 0.05) + 0.5).g;
      float ca = abs(sin(c1 * 16.0 + uTime * 0.9) * sin(c2 * 14.0 - uTime * 0.7));
      rCaus = smoothstep(0.7, 0.98, ca) * smoothstep(0.0, 0.12, dep) * (1.0 - smoothstep(0.4, 1.6, dep)) * uTP1.z;
    }
  }
  diffuseColor.rgb = col;
}
`;

const REGION_FRAG_OUT = /* glsl */`
  outgoingLight += lightPools(vCWorld) * diffuseColor.rgb;
  outgoingLight += vec3(0.75, 1.0, 0.95) * rCaus * 0.35 * cCloud * (1.0 - uNight * 0.7);
  if (uTP2.w > 0.0 && rSnow > 0.5) { // frost sparkle: tiny glints that flicker with the view
    vec2 sq = floor(vCWorld.xz * 9.0);
    float sh = fract(sin(dot(sq, vec2(12.9898, 78.233))) * 43758.5453);
    float tw = step(0.985, sh) * (0.5 + 0.5 * sin(uTime * 3.0 + sh * 40.0 + dot(cameraPosition.xz, vec2(0.7, 0.4))));
    outgoingLight += vec3(1.0, 0.98, 0.92) * tw * uTP2.w * rSnow;
  }
`;

export const TERRAIN_AXIS = { AX, NA, EXT0, EXT1 };
