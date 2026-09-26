// Initial hand-planned village layout: plaza, winding paths, bridges, reserved lots and landmarks.
import { T, WORLD } from './terrain.js';

export const LANDMARKS = {
  plaza: { x: 56, z: 60.5 },
  spawn: { x: 56, z: 66 },
  townHall: { x: 56, z: 51, w: 6, d: 4, rot: 0 },
  chewyHouse: { x: 45.5, z: 63.5, w: 3, d: 3, rot: Math.PI / 2 },
  rosieShop: { x: 66.5, z: 57.5, w: 4, d: 3, rot: -Math.PI / 2 },
  dungeon: { x: 90, z: 38.5 },       // torii + burrow entrance on the shrine hill
  shrine: { x: 88, z: 42 },
  bridgeW: { x: 32.2, z: 58.5, len: 9, rot: Math.PI / 2 },
  pond: { x: 71, z: 73 },
  waterfall: { x: 50, z: 12.5 },
  beach: { x: 48, z: 98 },
};

export const PATHS = [
  // east to the shrine hill
  { w: 2.2, pts: [[61, 60], [67, 60], [72, 57.5], [77, 53], [81, 48.5], [85, 45], [88, 42], [90, 39]] },
  // west to the bridge and bamboo
  { w: 2.2, pts: [[51, 61], [45, 61], [40, 59.5], [36.5, 58.5]] },
  { w: 2.0, pts: [[28, 58.5], [24, 57], [19, 55]] },
  // south to the beach
  { w: 2.2, pts: [[56, 65], [56, 71], [54.5, 78], [52, 86], [49, 94]] },
  // north towards the waterfall
  { w: 2.0, pts: [[53, 56], [50.5, 50], [50, 43], [51.5, 35], [52, 28]] },
  // pond loop
  { w: 1.6, pts: [[60, 64], [64, 67], [66.5, 70]] },
  // to chewy's house
  { w: 1.6, pts: [[51, 63.5], [47.5, 63.5]] },
];

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
export function distToPaths(x, z, paths = PATHS) {
  let best = 1e9;
  for (const P of paths) for (let i = 0; i < P.pts.length - 1; i++) {
    const d = segDist(x, z, P.pts[i][0], P.pts[i][1], P.pts[i + 1][0], P.pts[i + 1][1]) - P.w / 2;
    if (d < best) best = d;
  }
  return best;
}

export function applyLayout(terrain) {
  const tiles = terrain.tiles;
  // plaza (rounded rect)
  const pc = LANDMARKS.plaza;
  for (let z = 0; z < WORLD; z++) for (let x = 0; x < WORLD; x++) {
    const cx = x + 0.5, cz = z + 0.5;
    const dx = Math.max(0, Math.abs(cx - pc.x) - 3.2), dz = Math.max(0, Math.abs(cz - pc.z) - 2.7);
    if (Math.hypot(dx, dz) < 2.2) tiles[z * WORLD + x] = T.PLAZA;
  }
  for (let z = 0; z < WORLD; z++) for (let x = 0; x < WORLD; x++) {
    const cx = x + 0.5, cz = z + 0.5;
    if (tiles[z * WORLD + x] === T.PLAZA || tiles[z * WORLD + x] === T.WATER) continue;
    if (distToPaths(cx, cz) < 0) tiles[z * WORLD + x] = T.PATH;
  }
  // bridge deck counts as path for walkability (water underneath stays visual)
  terrain.syncTiles();
}

// Tiles reserved (no vegetation) for landmark buildings and the shrine area
export function reservedAt(x, z) {
  for (const k of ['townHall', 'chewyHouse', 'rosieShop']) {
    const L = LANDMARKS[k];
    const w = (L.rot % Math.PI !== 0 ? L.d : L.w) / 2 + 1.0, d = (L.rot % Math.PI !== 0 ? L.w : L.d) / 2 + 1.0;
    if (Math.abs(x - L.x) < w && Math.abs(z - L.z) < d) return true;
  }
  if (Math.hypot(x - LANDMARKS.dungeon.x, z - LANDMARKS.dungeon.z) < 8) return true;
  if (Math.hypot(x - LANDMARKS.plaza.x, z - LANDMARKS.plaza.z) < 7.5) return true;
  if (Math.hypot(x - LANDMARKS.bridgeW.x, z - LANDMARKS.bridgeW.z) < 5.5) return true;
  return false;
}
