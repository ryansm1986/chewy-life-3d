// Shiokaze Tidepools: the heightfield and surface layers (RegionTerrain's recipe.terrain.height / surface), shaped
// around the landmark sites. The sea wraps the north and west (screen-up), with coves, a headland for the grotto, a
// lookout bluff, tide-pool terraces and the arena's steep sea-side rim.
export const LV = -0.3; // sea level
const nrm = (x, z) => { const l = Math.hypot(x, z); return [x / l, z / l]; };
/** landmark sites (world metres) */
export const TP_SITES = {
  start: [18, 94],
  arena: [92, 22], arenaSea: nrm(-0.45, -0.89),
  via: [[22, 78], [20, 62], [24, 47], [31, 33], [44, 23], [58, 22], [73, 20]],
  cove: [47, 0], lookout: [68, 3], wreckBeach: [10, 68],
  terraces: [[14, 45, 8], [57, 16, 5]],
  // tide pools [x, z, r, x-stretch]; the first is the treasure pool
  pools: [[12, 44, 2.3, 1.3], [17, 50.5, 1.6, 1], [9.5, 39, 1.7, 0.9], [18.5, 40.5, 1.2, 1], [56, 15, 1.9, 1.3], [60.5, 18.5, 1.2, 1]],
  grotto: [10, 11], grottoMouth: [21, 21], grottoPool: [20.4, 20.4, 2.2],
  bluffs: [[68, 8, 5.5, 0.72]],
  torii: [47, 9.5], wedded: [38, 6.5], wreck: [11.5, 69], nets: [[26, 90, 0.4], [16, 76, -0.9]],
  open: [[15, 45, 5.5], [25.5, 25.5, 4.5], [68, 12.5, 4.5]],
  stacks: [[4, 58, 4.8, 1.4], [-2, 36, 6.5, 1.9], [30, -1, 5.2, 1.6], [58, -3, 7, 2.1], [80, 2, 4.2, 1.3], [104, 4, 5.6, 1.7], [-3, 80, 5, 1.5], [6, 100, 3.6, 1.1]],
};
const S = TP_SITES;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** the tide pools that survive this plan: a camp clearing (flattened by the engine) wipes out pools near it */
let _pc = null, _pp = null;
export function poolsFor(camps = []) {
  if (_pc !== camps) { _pc = camps; _pp = S.pools.filter((p, i) => i === 0 || camps.every(c => Math.hypot(p[0] - c.x, p[1] - c.z) > (c.r || 6.5) + 1.5 + 6)); }
  return _pp;
}
/** signed distance to the shoreline (+ inland, - out at sea), metres (approximately) */
export function coastDist(x, z) {
  const xw = 8.5 + 3.2 * Math.sin(z * 0.065 + 0.8) + 1.8 * Math.sin(z * 0.16 + 2.1);            // west shore
  let zn = 9 + 2.4 * Math.sin(x * 0.07 + 1.9) + 1.4 * Math.sin(x * 0.17);                        // north shore
  zn += 6 * Math.exp(-(((x - S.cove[0]) / 7) ** 2));                                              // the torii cove bites in
  zn -= 5 * Math.exp(-(((x - S.lookout[0]) / 5) ** 2));                                           // the lookout headland juts out
  let d = smin(x - xw, z - zn, 8);
  d -= 5 * Math.exp(-(((z - S.wreckBeach[1]) / 8) ** 2)) * Math.exp(-(((x - 10) / 10) ** 2));    // the wreck's sandy bay
  // the arena's shore: a gently curved line 13.5 m out from the centre along the sea direction
  const [ax, az] = S.arena, [sx, sz] = S.arenaSea, dx = x - ax, dz = z - az;
  const along = dx * sx + dz * sz, perp = dx * -sz + dz * sx;
  const da = 13.5 - along - perp * perp * 0.012, wA = 1 - sstep(18, 32, Math.hypot(dx, dz));
  d = d + (Math.min(d, da) - d) * wA;
  return d;
}

export function height(x, z, c) {
  const d = coastDist(x, z), n = c.fbm(x * 0.08, z * 0.08, 3), n2 = c.n2(x * 0.21, z * 0.21);
  let h;
  if (d < 0) h = LV - 0.12 + d * 0.06 - 2.6 * sstep(0, 12, -d) + n * 0.3;                           // sea floor
  else {
    const beach = LV - 0.12 + 0.62 * sstep(0, 7, d);                                                   // sand up the beach
    const dunes = 0.45 + 0.4 * n + 0.25 * c.fbm(x * 0.03 + 5, z * 0.03, 3) + Math.max(0, x + z - 150) * 0.06; // rolling dunes, rising to the south-east
    h = beach + (dunes - beach) * sstep(6, 16, d);
    // rocky shelves along the shore: terraced platforms where the rock noise is high
    const rk = sstep(0.1, 0.35, c.fbm(x * 0.05 + 11, z * 0.05 - 4, 2)) * (1 - sstep(4, 12, d));
    if (rk > 0) h += (c.terrace(0.3 + n * 0.5 + d * 0.05, 0.28, 0.35) - 0.05) * rk;
  }
  // the arena's sea rim: a steep sandy ledge dropping into deep water (non-walkable; Umibōzu rises beyond it)
  { const [ax, az] = S.arena, [sx, sz] = S.arenaSea, dx = x - ax, dz = z - az, along = dx * sx + dz * sz, rr = Math.hypot(dx, dz);
    if (rr < 26 && along > 12) { const k = sstep(12, 14.5, along) * (1 - sstep(18, 26, rr)); h = Math.min(h, h + (LV - 3.4 - h) * k); } }
  // tide-pool terraces: rock platforms with pools cut into them (below sea level, so the sea water fills them)
  for (const t of S.terraces) {
    const dt = Math.hypot(x - t[0], z - t[1]); if (dt > t[2] + 5) continue;
    const w = 1 - sstep(t[2] - 2, t[2] + 4, dt);
    h += (Math.max(h, 0.2 + 0.12 * n2 + 0.1 * c.terrace(n * 2 + 1, 0.5, 0.3)) - h) * w;
  }
  for (const p of [...poolsFor(c.camps), [S.grottoPool[0], S.grottoPool[1], S.grottoPool[2], 1]]) {
    const dp = Math.hypot((x - p[0]) / (p[3] || 1), z - p[1]) / p[2]; if (dp > 1.6) continue;
    const floor = LV - 0.3 - 0.14 * (1 - dp) + n2 * 0.03;
    h = dp < 1 ? floor + (Math.max(h, 0.22) - floor) * sstep(0.72, 1.0, dp) : Math.max(h, 0.22) * (1 - sstep(1, 1.6, dp)) + h * sstep(1, 1.6, dp);
  }
  // the lookout bluff: a grassy knoll at the top of the walkable band with cliffs into the sea
  for (const [bx, bz, br, bh] of S.bluffs) { const db = Math.hypot(x - bx, (z - bz) * 1.2); if (db < br + 3) h = Math.max(h, bh * (1 - sstep(br - 1, br + 1.5, db)) + (d < 1 ? -1 : 0)); }
  // the north-west headland: a high rock mass; the sea grotto opens in a notch on its south-east face
  { const g = S.grotto, dh = Math.hypot(x - g[0], z - g[1]), core = 1 - sstep(9, 15, dh + n * 2.5);
    const [mx, mz] = S.grottoMouth, dn = Math.hypot(x - mx + 0.6, z - mz + 0.6), notch = sstep(3.2, 5.5, dn);
    if (core > 0) h = Math.max(h, (0.4 + core * (4.2 + n * 1.2)) * notch + h * (1 - notch)); }
  // bluffs past the south and east map edges (the land rises into wooded dunes behind)
  const e = Math.min(112 - x, 112 - z);
  if (e < 12) h += (12 - e) * 0.32 * sstep(2, 20, d);
  return h;
}

// surface layers: sand on the beaches (and up the dunes in drifts), seaweed on the wet rock, shell hash on the tide line,
// dune grass inland; the engine paints rock on the steep faces and the wet band at the water line
export function surface(x, z, h, slope, c, o) {
  const d = coastDist(x, z), n = c.n2(x * 0.13, z * 0.13);
  o.sand = 1 - sstep(10, 18, d + n * 3);
  o.grass = sstep(7, 13, d + n * 3);
  o.moss = sstep(0.2, 0.05, h - LV) * sstep(0.2, 0.5, c.fbm(x * 0.2, z * 0.2, 2) + 0.4) * (1 - sstep(0.5, 1.2, slope * 3)); // seaweed on wet rock
  o.litter = sstep(0.35, 0.15, Math.abs(h - LV - 0.2)) * sstep(0.3, 0.6, c.n2(x * 0.35, z * 0.35) + 0.3) * 0.7;          // shell hash on the tide line
  for (const t of S.terraces) if (Math.hypot(x - t[0], z - t[1]) < t[2]) { o.sand *= 0.3; o.accent = 0.55 * sstep(-0.2, 0.4, n); }
  if (Math.hypot(x - S.arena[0], z - S.arena[1]) < 13.5) { o.sand = Math.max(o.sand, 0.9); o.grass = 0; o.moss = 0; }
  return o;
}

// ------------------------------------------------------------------ the recipe parts (biomes/tidepool.js)
export const TERRAIN = {
  height, surface, band: [-0.65, 0.8],
  palette: {
    grass: ['#b4cc64', '#7ea650', '#d4d484', '#8cba6c'],
    dirt: ['#c8b088', '#dcc89e'], pebble: '#9a8a7a',
    trail: { stone: ['#e6dcc6', '#f8f0de'], joint: '#d2bf94', dirt: '#e2cfa4', border: '#eadbb4', stones: 0.55 },
    sand: ['#f8e8bc', '#eed8a4'], wetSand: '#c4ac86',
    rock: ['#d0b89c', '#a89cb4', '#e6d2b4'], rockMoss: '#6a7c48', cliffTop: '#a2bc62',
    moss: ['#56683a', '#788c46'], litter: ['#f4ece0', '#e8b8a0', '#fff6ea'],
    snow: ['#f4f8ff', '#d4e0f4'], accent: ['#b8a894', '#a09080'], under: '#58c8bc',
  },
  shader: { caustics: 1.25, wetBand: 0.5, strata: 2.2, rockSlope: 0.34, bare: 0.9 },
  // dune grass: sparse, tall, sun-bleached (the engine's grass layer API: colors [4], density per m², height/width [base, range])
  grass: { colors: ['#b0c864', '#86ac52', '#dcd690', '#98bc6c'], density: 16, height: [0.36, 0.42], width: [0.09, 0.07], tipMul: [1.14, 1.12, 0.86], tipAdd: [0.1, 0.08, 0.02] },
  water: { level: LV, wade: 0.3, deep: '#1a86b8', shallow: '#5ae2d6', foam: '#ffffff', sea: true },
};
export const LAYOUT = {
  start: S.start, startR: 7, arena: [...S.arena, 11], arenaSea: S.arenaSea,
  via: S.via, camps: 7, campR: 6.5, pois: 2, poiKinds: ['cache', 'shrine'], lanes: 6.5, trailW: 1.4,
  open: S.open,
  // landmark sites the engine's camp / POI placement keeps clear of (layout.avoid)
  avoid: [[15, 45, 7], [25.5, 25.5, 6], [68, 12.5, 6], [11.5, 69, 4], [47, 13, 5], [57, 16, 5]],
  // the wild areas (docs/COZY.md §6.2): they keep their yokai once Shiokaze Port is saved; off the coast trail
  wild: [
    { id: 'crabFlats', name: 'the Crab Flats', jp: '蟹の干潟', at: [54, 58], r: 14, packs: 3 },
    { id: 'wreckShoals', name: 'the Wreck Shoals', jp: '難破の浅瀬', at: [86, 68], r: 13, packs: 2 },
  ],
};
export const RECIPE = { terrain: TERRAIN, layout: LAYOUT };
export const SITES = TP_SITES;
