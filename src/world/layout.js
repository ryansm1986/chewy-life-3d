// Blossom Hollow 2.0, the town plan (docs/VILLAGE_PLAN.md): the island's features, the landmarks, the streets, the
// districts and the keep-outs. Everything that depends on where something is in the village reads it from here
// (terrain, vegetation, details, the sim, the waterfall, the sea, the build camera, villagers...), so moving a landmark
// moves everything tied to it. Pure data + helpers: no three.js, and nothing imported from terrain.js (terrain imports
// this; plots.js holds the plot table and imports nothing).
import { PLOTS, plotSpot, DOOR_DIR } from './plots.js';

export const WORLD = 224; // tiles = metres
export const T = { GRASS: 0, PATH: 1, PLAZA: 2, FIELD: 3, SAND: 4, ROCK: 5, WATER: 6 };

// ------------------------------------------------------------------ the island (2x the old one about the origin)
export const ISLAND = { x: 112, z: 116, r: 100 };           // edge falloff between 0.78 r and r
export const PLATEAU = { x: 112, z: 120, flat: 52, blend: 66 }; // the flat village plateau
export const NORTH = { foot: 54, top: 24, z0: 52, rise: 0.16, step: 2.2 }; // cliffs: blend from z 54 (foot) to z 24
export const HILL = { x: 176, z: 84, top: 13, foot: 24, h: 3.4 }; // the shrine hill (x squashed 0.9)
export const BAMBOO = { x: 36, z: 104, r: 32, h: 0.9 };      // the bamboo rise west of the river
export const POND = { x: 142, z: 146, r: 9 };
export const BASIN = { x: 100, z: 32, r0: 4.5, r1: 8 };      // the waterfall's plunge pool
// the North-West Terraces (rank 4): two shelves above the farms; steps: [riser top z, riser foot z, height]
export const TERRACES = { x0: 85, x1: 109, z0: 58, z1: 82, edge: 3, steps: [[80, 78.5, 1.1], [70, 68.5, 2.2]] };
// river control points (x, z) from the waterfall pool down to the sea
export const RIVER = [[100, 28], [98, 44], [90, 60], [76, 76], [66, 94], [64, 112], [65, 132], [61, 152], [52, 172], [44, 192], [36, 224]];
export const RIVER_W = z => 2.4 + smooth(40, 200, z) * 1.2;  // half-width of the channel (the bridge spans it)
// x of the river centre line at z (bridges sit on it)
export function riverX(z) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    if (z >= az && z <= bz) return ax + (bx - ax) * (z - az) / (bz - az);
  }
  return RIVER[RIVER.length - 1][0];
}
function smooth(a, b, v) { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }

// ------------------------------------------------------------------ squares (paved, rounded rectangles)
// hw / hd: half-size of the straight part, round: corner radius (the paved area is (hw + round) x (hd + round) half-size)
export const PLAZA = { x: 112, z: 121, hw: 6.8, hd: 5.3, round: 2.2 };            // 18 x 15 m civic square
export const SQUARES = {
  plaza: PLAZA,
  forecourt: { x: 112, z: 108.5, hw: 5.2, hd: 1.2, round: 1.3 },                  // in front of the Town Hall
  market: { x: 162, z: 121, hw: 4.2, hd: 4.2, round: 1.8 },                       // the market-stall square
};
export const squareDist = (S, x, z) => { const dx = Math.max(0, Math.abs(x - S.x) - S.hw), dz = Math.max(0, Math.abs(z - S.z) - S.hd); return Math.hypot(dx, dz) - S.round; };
export const PLAZA_HALF = { x: PLAZA.hw + PLAZA.round, z: PLAZA.hd + PLAZA.round }; // 9 x 7.5

// ------------------------------------------------------------------ landmarks
// ri: rotation index of the prebuilt building (0 door +z, 1 -x, 2 -z, 3 +x); rot = the same in radians (keep-outs)
const lm = (o) => ({ ...o, rot: o.ri != null ? -o.ri * Math.PI / 2 : o.rot || 0 });
const BRIDGE_Z = 117.5; // (the bridge is a 3 x 9 model: its centre sits on whole + half tiles)
export const LANDMARKS = {
  plaza: { x: PLAZA.x, z: PLAZA.z },
  fountain: { x: PLAZA.x, z: PLAZA.z },                         // fountain at the centre of the plaza (2x2)
  spawn: { x: PLAZA.x + 1.5, z: PLAZA.z + 4.6 },
  townHall: lm({ x: 112, z: 103, w: 6, d: 4, ri: 0 }),           // door south onto the forecourt
  chewyHouse: lm({ x: 89.5, z: 127.5, w: 3, d: 3, ri: 3 }),      // door east onto West Lane
  rosieShop: lm({ x: 130, z: 115.5, w: 4, d: 3, ri: 0 }),        // the bakery, first on Market Street, door south
  dungeon: { x: 178, z: 78, w: 4, d: 4, ri: 0 },                 // torii + burrow entrance on the shrine hill (gate centre z - 0.5)
  shrine: { x: HILL.x, z: HILL.z },
  bridgeW: { x: Math.round(riverX(BRIDGE_Z) - 4.5) + 4.5, z: BRIDGE_Z, len: 9, rot: Math.PI / 2 },
  pond: { x: POND.x, z: POND.z },
  waterfall: { x: BASIN.x, z: 25 },
  basin: { x: BASIN.x, z: BASIN.z },
  beach: { x: 96, z: 205 },                                     // (the sand: the coast runs ~10 m south of 2x the old one)
  travel: { x: 43, z: 106, rot: 0.35 },                          // the Wayfarer's Post at the end of the west trail (docs/REGIONS.md)
  bamboo: { x: BAMBOO.x, z: BAMBOO.z },
  market: { x: SQUARES.market.x, z: SQUARES.market.z },
  forecourt: { x: SQUARES.forecourt.x, z: SQUARES.forecourt.z },
};
const L = LANDMARKS, BR = L.bridgeW;

// ------------------------------------------------------------------ streets
// Streets come first; every plot faces one. w: paved width (main 2-3 m, lanes 1.5-2 m). rank > 1: an expansion ring's
// stub street, drawn (Build mode, the map) but only paved when the village reaches that rank.
export const STREETS = {
  // Main Street: east-west through the plaza, from the west bridge to the market
  mainW: { name: 'Main Street', w: 3.0, pts: [[PLAZA.x - PLAZA_HALF.x + 0.5, PLAZA.z], [96, PLAZA.z], [84, 119.8], [BR.x + BR.len / 2 + 1.4, BR.z]] },
  mainE: { name: 'Market Street', w: 3.0, pts: [[PLAZA.x + PLAZA_HALF.x - 0.5, PLAZA.z], [SQUARES.market.x - 5.2, PLAZA.z]] },
  trailW: { name: 'West Trail', w: 2.2, pts: [[BR.x - BR.len / 2 - 1.4, BR.z], [54, 115.6], [48, 111.4], [L.travel.x + 1.6, L.travel.z + 1.6]] },
  avenue: { name: 'North Avenue', w: 4.0, pts: [[PLAZA.x, PLAZA.z - PLAZA_HALF.z + 0.6], [PLAZA.x, SQUARES.forecourt.z + 1.6]] },
  shrine: { name: 'Shrine Road', w: 2.4, pts: [[119.6, 114.6], [126, 108.8], [137, 103.6], [149, 99.2], [160, 94.6], [168.5, 90], [174.5, 85.6], [L.dungeon.x, L.dungeon.z + 3.4]] },
  pond: { name: 'Pond Walk', w: 2.0, pts: [[119.8, 127.4], [126, 132.6], [132.2, 137.6]] },
  beach: { name: 'Beach Lane', w: 2.2, pts: [[PLAZA.x, PLAZA.z + PLAZA_HALF.z - 0.6], [112, 142], [109.6, 156], [105, 172], [99, 187], [97.2, 196], [96.6, 202]] },
  falls: { name: 'Waterfall Trail', w: 2.0, pts: [[SQUARES.forecourt.x - 5.8, SQUARES.forecourt.z - 1.4], [104.6, 98], [100.8, 88.6], [100.6, 78], [102, 68], [104, 57]] },
  // West Lanes: two residential lanes off Main Street joined at the bottom
  laneW1: { name: 'Cottage Lane', w: 2.0, pts: [[96, PLAZA.z + 1.2], [96, 151.5], [98.5, 155], [109, 155.3]] },
  laneW2: { name: 'Willow Lane', w: 2.0, pts: [[79, 120.4], [79, 151.5], [82, 155], [96, 155]] },
  // South Meadows: a crescent off Beach Lane round to the pond park
  crescent: { name: 'Meadow Crescent', w: 2.0, pts: [[111, 148], [127, 148], [131, 152], [131, 168], [127, 172.4], [106, 172.5]] },
  // Pond Park: a loop round the pond, from the Pond Walk to the crescent
  pondLoop: { name: 'Pond Loop', w: 1.6, pts: [[132.2, 137.6], [138, 134.6], [147, 134.4], [152.6, 137.6], [155.4, 145], [153, 153], [146, 158.4], [137.4, 157.6], [131, 152]] },
  // Workshop & Farm Quarter: a lane north from Main Street to the Waterfall Trail
  works: { name: 'Mill Lane', w: 2.0, pts: [[87, 120], [87, 100], [93, 92.5], [100.4, 89.2]] },
  // expansion rings: stub streets, paved when the rank unlocks them
  outerS: { name: 'Seaview Row', w: 2.0, rank: 2, pts: [[117.6, 173.4], [117.6, 189]] },
  hamlet: { name: 'Hamlet Way', w: 2.0, rank: 3, pts: [[SQUARES.market.x + 5.6, PLAZA.z], [180, 121], [186, 125]] },
  terraces: { name: 'Terrace Steps', w: 1.8, rank: 4, pts: [[99.8, 81.2], [87.6, 81.2]] },
  terraces2: { name: 'Upper Terrace', w: 1.8, rank: 4, pts: [[101.2, 70.4], [92.6, 70.4]] },
};
for (const [id, s] of Object.entries(STREETS)) { s.id = id; s.rank ||= 1; }
export const PATHS = Object.values(STREETS);
export const openPaths = (rank = 1) => PATHS.filter(p => p.rank <= rank);

// ------------------------------------------------------------------ distance to the streets (spatial index)
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
// Street segments binned into 16 m cells (each cell lists the segments within IDX_R of it): exact distances up to
// IDX_R, 99 beyond (every caller compares against much smaller thresholds).
const IDX_C = 16, IDX_R = 16, IDX_N = Math.ceil(WORLD / IDX_C);
const index = new Map();
function segIndex(paths) {
  let ix = index.get(paths); if (ix) return ix;
  ix = Array.from({ length: IDX_N * IDX_N }, () => []);
  for (const P of paths) for (let i = 0; i < P.pts.length - 1; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], s = [ax, az, bx, bz, P.w / 2];
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - IDX_R) / IDX_C)), x1 = Math.min(IDX_N - 1, Math.floor((Math.max(ax, bx) + IDX_R) / IDX_C));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - IDX_R) / IDX_C)), z1 = Math.min(IDX_N - 1, Math.floor((Math.max(az, bz) + IDX_R) / IDX_C));
    for (let j = z0; j <= z1; j++) for (let k = x0; k <= x1; k++) ix[j * IDX_N + k].push(s);
  }
  index.set(paths, ix);
  return ix;
}
// distance from (x, z) to the nearest street edge (negative inside a street)
export function distToPaths(x, z, paths = PATHS) {
  const i = Math.floor(x / IDX_C), j = Math.floor(z / IDX_C);
  if (i < 0 || j < 0 || i >= IDX_N || j >= IDX_N) return 99;
  let best = 99;
  for (const s of segIndex(paths)[j * IDX_N + i]) { const d = segDist(x, z, s[0], s[1], s[2], s[3]) - s[4]; if (d < best) best = d; }
  return best;
}
// nearest point on a street's centre line: { x, z, d (to the edge), dx, dz (unit direction of the segment), street }
export function nearestOnStreets(x, z, paths = PATHS) {
  let best = null;
  for (const P of paths) for (let i = 0; i < P.pts.length - 1; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), px = ax + vx * t, pz = az + vz * t;
    const d = Math.hypot(x - px, z - pz) - P.w / 2;
    if (!best || d < best.d) { const l = Math.sqrt(l2); best = { x: px, z: pz, d, dx: vx / l, dz: vz / l, street: P }; }
  }
  return best;
}
// point at distance s along a street (and the segment direction there)
export function alongStreet(P, s) {
  for (let i = 0; i < P.pts.length - 1; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === P.pts.length - 2) { const t = Math.max(0, Math.min(1, s / L)); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / L, dz: (bz - az) / L }; }
    s -= L;
  }
  return null;
}
export const streetLength = P => { let l = 0; for (let i = 0; i < P.pts.length - 1; i++) l += Math.hypot(P.pts[i + 1][0] - P.pts[i][0], P.pts[i + 1][1] - P.pts[i][1]); return l; };

// ------------------------------------------------------------------ painting the plan onto the tile layer
// squares, then the open streets (each segment rasterised over its own bounding box only)
export function paintStreet(tiles, P) {
  const r = P.w / 2;
  for (let i = 0; i < P.pts.length - 1; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(WORLD - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - r - 1)), z1 = Math.min(WORLD - 1, Math.ceil(Math.max(az, bz) + r + 1));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = z * WORLD + x, t = tiles[k];
      if (t === T.PLAZA || t === T.WATER) continue;
      if (segDist(x + 0.5, z + 0.5, ax, az, bx, bz) < r) tiles[k] = T.PATH;
    }
  }
}
export function applyLayout(terrain, rank = 1) {
  const tiles = terrain.tiles;
  for (const S of Object.values(SQUARES)) {
    const ex = S.hw + S.round + 1, ez = S.hd + S.round + 1;
    for (let z = Math.floor(S.z - ez); z <= Math.ceil(S.z + ez); z++) for (let x = Math.floor(S.x - ex); x <= Math.ceil(S.x + ex); x++) {
      if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) continue;
      if (squareDist(S, x + 0.5, z + 0.5) < 0) tiles[z * WORLD + x] = T.PLAZA;
    }
  }
  for (const P of openPaths(rank)) paintStreet(tiles, P);
  terrain.syncTiles();
}

// ------------------------------------------------------------------ green belts (tree lines between the districts)
// Polylines with a half-width, laid where the camera-side keep-outs allow trees (the north / west side of a row of
// lots, or open land between districts: see the plan preview, tools/qa/plan-map.mjs). Vegetation plants a tree line
// along each (every `step` m, mostly sakura), and nothing is ever built in them.
export const GREEN_BELTS = [
  { kind: 'sakura', r: 4, step: 3.2, pts: [[124, 108.6], [134, 106], [146, 102.2], [157, 98.6]] },   // behind Market Street, along the Shrine Road
  { kind: 'mixed', r: 2.6, step: 3.4, pts: [[106.8, 151], [106.8, 133.5]] },                         // West Lanes | Beach Lane
  { kind: 'sakura', r: 3, step: 3, pts: [[112.6, 136], [119, 134.4]] },                                // plaza | South Meadows
  { kind: 'mixed', r: 3, step: 3.4, pts: [[76, 96], [74.4, 104]] },                                  // the river bank by the farms
  { kind: 'sakura', r: 2.4, step: 3, pts: [[100.4, 110.6], [104.2, 106.6]] },                        // civic core | the Waterfall Trail
  { kind: 'mixed', r: 3.5, step: 3.4, pts: [[105, 95.6], [116, 95.4], [128, 94.4]] },                // behind the Town Hall
  { kind: 'sakura', r: 3.5, step: 3.2, pts: [[134, 168], [140, 163], [148, 163]] },                  // South Meadows | Pond Park
  { kind: 'sakura', r: 3, step: 3.4, pts: [[160, 151], [168, 158]] },                                // Pond Park | the East Hamlet
  { kind: 'sakura', r: 1.5, step: 3.6, pts: [[101.4, 175.5], [97.6, 186]] },                         // the avenue down to the beach (west side)
];
export function beltAt(x, z) {
  for (const B of GREEN_BELTS) for (let i = 0; i < B.pts.length - 1; i++) {
    if (segDist(x, z, B.pts[i][0], B.pts[i][1], B.pts[i + 1][0], B.pts[i + 1][1]) < B.r) return B;
  }
  return null;
}

// ------------------------------------------------------------------ keep-outs
// Big-tree keep-out. The default camera looks from +x/+z (yaw 45°, ~43° pitch), so a 5-unit tree up to ~7 tiles
// on that side of a building hides its door and whoever stands there: keep the squares, every plot and the landmarks
// open, each with a sweep toward the camera.
export const CAMERA_SIDE = 7;
const SIGHTLINES = [
  // [landmark key, extra side clearance, camera-side reach]
  ['townHall', 2.5, CAMERA_SIDE], ['rosieShop', 2.5, CAMERA_SIDE + 1], ['chewyHouse', 2.5, CAMERA_SIDE], ['dungeon', 2, CAMERA_SIDE], ['travel', 1.2, CAMERA_SIDE - 1],
];
const sweep = (x, z, cx, cz, hw, hd, side, reach, canopy) => {
  const dx = x - cx, dz = z - cz;
  if (Math.abs(dx) < hw + side + canopy && Math.abs(dz) < hd + side + canopy) return true;
  // sweep the footprint towards the camera along the (+1,+1) diagonal
  const u = (dx + dz) / Math.SQRT2, v = (dx - dz) / Math.SQRT2, ext = (hw + hd) / Math.SQRT2;
  return u > -ext && u < ext + reach + canopy && Math.abs(v) < ext + canopy + 0.5;
};
// plots binned into 16 m cells for the keep-out tests (each cell lists the plots whose keep-out may reach it)
let plotBins = null;
function plotsNear(x, z) {
  if (!plotBins) {
    plotBins = Array.from({ length: IDX_N * IDX_N }, () => []);
    for (const p of PLOTS) {
      const m = 12; // side clearance + camera reach + canopy
      for (let j = Math.max(0, Math.floor((p.z - m) / IDX_C)); j <= Math.min(IDX_N - 1, Math.floor((p.z + p.d + m) / IDX_C)); j++)
        for (let i = Math.max(0, Math.floor((p.x - m) / IDX_C)); i <= Math.min(IDX_N - 1, Math.floor((p.x + p.w + m) / IDX_C)); i++) plotBins[j * IDX_N + i].push(p);
    }
  }
  const i = Math.floor(x / IDX_C), j = Math.floor(z / IDX_C);
  return i < 0 || j < 0 || i >= IDX_N || j >= IDX_N ? [] : plotBins[j * IDX_N + i];
}
export function treeKeepOut(x, z, canopy = 2) {
  for (const S of Object.values(SQUARES)) if (squareDist(S, x, z) < 3 + canopy) return true; // the squares stay open
  for (const [k, side, reach] of SIGHTLINES) {
    const Lk = LANDMARKS[k];
    const rotated = Lk.rot && Lk.rot % Math.PI !== 0;
    const hw = ((rotated ? Lk.d : Lk.w) || 4) / 2, hd = ((rotated ? Lk.w : Lk.d) || 4) / 2;
    if (sweep(x, z, Lk.x, Lk.z, hw, hd, side, reach, canopy)) return true;
  }
  // every plot: the lot itself (a little margin) plus a shorter sweep toward the camera (lots already keep 3 m gaps)
  for (const p of plotsNear(x, z)) if (sweep(x, z, p.x + p.w / 2, p.z + p.d / 2, p.w / 2, p.d / 2, 0.6, CAMERA_SIDE - 2, canopy)) return true;
  return false;
}
// Tiles reserved (no vegetation at all) for the landmark buildings, the squares and the crossings
export function reservedAt(x, z) {
  for (const k of ['townHall', 'chewyHouse', 'rosieShop']) {
    const Lk = LANDMARKS[k];
    const w = (Lk.rot % Math.PI !== 0 ? Lk.d : Lk.w) / 2 + 1.0, d = (Lk.rot % Math.PI !== 0 ? Lk.w : Lk.d) / 2 + 1.0;
    if (Math.abs(x - Lk.x) < w && Math.abs(z - Lk.z) < d) return true;
  }
  if (Math.hypot(x - L.dungeon.x, z - L.dungeon.z) < 8) return true;
  for (const S of Object.values(SQUARES)) if (squareDist(S, x, z) < 1.5) return true;
  if (Math.hypot(x - BR.x, z - BR.z) < 5.5) return true;
  if (Math.hypot(x - L.travel.x, z - L.travel.z) < 3.2) return true;
  return false;
}
// is (x, z) inside the town (the plateau and the districts around it)? Dense ground layers thin out beyond it.
export const inTown = (x, z, pad = 0) => Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < PLATEAU.blend + pad;

// ------------------------------------------------------------------ door sightlines (street trees)
// Every building door that faces the default camera (+x / +z: doors facing S or E) keeps the diagonal toward the
// camera clear, and no tree stands on a building (its biggest footprint, plus canopy). Doors facing N or W are seen
// over their own roof, so only the building box counts there.
const DOORS = (() => {
  const out = [], dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  for (const p of PLOTS) {
    if (p.fixed) continue;
    const b = plotSpot(p, p.max, p.max); if (!b) continue;
    const [dx, dz] = DOOR_DIR[p.door];
    out.push({ x: b.x + b.w / 2 + dx * b.w / 2, z: b.z + b.d / 2 + dz * b.d / 2, box: b, faces: dx + dz > 0 });
  }
  for (const k of ['townHall', 'chewyHouse', 'rosieShop', 'dungeon']) {
    const Lk = L[k], ri = Lk.ri || 0, [dx, dz] = dirs[ri], w = ri % 2 ? Lk.d : Lk.w, d = ri % 2 ? Lk.w : Lk.d;
    out.push({ x: Lk.x + dx * w / 2, z: Lk.z + dz * d / 2, box: { x: Lk.x - w / 2, z: Lk.z - d / 2, w, d }, faces: dx + dz > 0 });
  }
  return out;
})();
// r: the tree's canopy radius; reach: how far toward the camera the canopy could still cut the line of sight (the
// rig looks down ~35°: past ~6.5 m the line to a door passes over a 4.5 m street tree)
export function doorKeepOut(x, z, r = 2.2, reach = CAMERA_SIDE + r) {
  for (const D of DOORS) {
    const b = D.box;
    if (x > b.x - r && x < b.x + b.w + r && z > b.z - r && z < b.z + b.d + r) return true;
    if (!D.faces) continue;
    const dx = x - D.x, dz = z - D.z, u = (dx + dz) / Math.SQRT2, v = (dx - dz) / Math.SQRT2;
    if (u > -0.5 && u < reach && Math.abs(v) < r + 0.4) return true;
  }
  return false;
}
const inPlot = (x, z, m = 0) => plotsNear(x, z).some(p => x > p.x - m && x < p.x + p.w + m && z > p.z - m && z < p.z + p.d + m);

// ------------------------------------------------------------------ the streetscape: lanterns, street trees, junctions
// Walks a street every `step` m (starting at `first`) and puts one item on the first side (alternating) whose spot
// passes test(x, z); if neither passes it slides along the street a little. → [{ x, z, face (yaw toward the street) }]
function furnish(P, { step, first, off, test, both = false }) {
  const out = [], len = streetLength(P);
  for (let s = first, k = 0; s < len - 0.5; s += step, k++) {
    let found = 0;
    for (const ds of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, 3.2, -3.2]) {
      const a = alongStreet(P, s + ds); if (!a) continue;
      for (const sd of (k % 2 ? [-1, 1] : [1, -1])) {
        const o = P.w / 2 + off, x = a.x - a.dz * o * sd, z = a.z + a.dx * o * sd;
        if (!test(x, z, out)) continue;
        out.push({ x, z, face: Math.atan2(a.dz * sd, -a.dx * sd), street: P.id });
        found++;
        if (!both || found === 2) break;
      }
      if (found && (!both || found === 2)) break;
    }
  }
  return out;
}
const near = (list, x, z, d) => list.some(q => Math.hypot(q.x - x, q.z - z) < d);
const otherStreets = id => PATHS.filter(q => q.id !== id && q.rank === 1);
const clearOf = (x, z, id, d) => distToPaths(x, z, otherStreets(id)) > d;
const offSquares = (x, z, d) => Object.values(SQUARES).every(S => squareDist(S, x, z) > d);
// paper lanterns on posts (~16 m) along Main Street, Market Street and the North Avenue (a pair flanking it)
export const STREET_LAMPS = [];
for (const [id, step, first, both] of [['mainW', 16, 6, false], ['mainE', 16, 5, false], ['avenue', 9, 1.2, true], ['beach', 16, 9, false]]) {
  const P = STREETS[id];
  STREET_LAMPS.push(...furnish(P, { step, first, both, off: 0.55, test: (x, z, own) =>
    !inPlot(x, z, 0.3) && offSquares(x, z, 0.5) && distToPaths(x, z) > 0.25 && clearOf(x, z, id, 1.2) && Math.hypot(x - BR.x, z - BR.z) > 6 && !near(STREET_LAMPS, x, z, 3) && !near(own, x, z, 3) }));
}
// street trees (small: about 0.75x a park tree) every 10-14 m: cherries and maples off the lots, the squares, the
// junctions and every door sightline
export const STREET_TREES = [];
for (const [id, step, first] of [['mainW', 12, 4], ['mainE', 12, 3], ['avenue', 6, 1], ['beach', 13, 6]]) {
  const P = STREETS[id];
  const list = furnish(P, { step, first, off: 0.85, test: (x, z, own) =>
    !inPlot(x, z, 0.3) && !doorKeepOut(x, z, 1.8, 6.5) && offSquares(x, z, 3) && distToPaths(x, z) > 0.6 && clearOf(x, z, id, 2.5) && Math.hypot(x - BR.x, z - BR.z) > 7 &&
    !near(STREET_LAMPS, x, z, 2.5) && !near(STREET_TREES, x, z, 6) && !near(own, x, z, 6) });
  list.forEach((t, i) => { t.kind = (i + STREET_TREES.length) % 2 ? 'momiji' : 'sakura'; });
  STREET_TREES.push(...list);
}
// junctions: where a street's end meets another street (benches go on their corners; see VillageSim.seedStarterVillage)
export const JUNCTIONS = [];
for (const P of openPaths(1)) for (const e of [P.pts[0], P.pts[P.pts.length - 1]]) {
  const [x, z] = e;
  if (!offSquares(x, z, 4) || distToPaths(x, z, otherStreets(P.id)) > 0.8 || near(JUNCTIONS, x, z, 6)) continue;
  JUNCTIONS.push({ x, z, street: P.id });
}

// ------------------------------------------------------------------ named villagers' anchors (their districts)
export const ANCHORS = {
  kuma: { x: L.rosieShop.x + 6, z: L.rosieShop.z + 5.5 },   // the market bakery row
  mochi: { x: PLAZA.x + 1, z: PLAZA.z - 3 },                // by the plaza
  usagi: { x: 121, z: 158 },                                // the South Meadows gardens
  kitsune: { x: 149, z: 101.5 },                            // on the Shrine Road
  pan: { x: POND.x - 4, z: POND.z + 13 },                   // the Pond Park lawn
  tanu: { x: 152, z: 121 },                                 // Market Street
  kero: { x: POND.x - 9.5, z: POND.z - 4 },                 // at the pond
};
