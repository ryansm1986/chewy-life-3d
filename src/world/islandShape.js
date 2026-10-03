// The island heightfield (pure: no three.js), shaped by the plan in layout.js: the coast, the flat village plateau,
// the northern cliff terraces, the shrine hill, the bamboo rise, the river channel, the waterfall's plunge pool and the
// koi pond. Terrain samples it at boot; tools (the plan preview, QA) can call it from Node too.
import { smoothstep, lerp } from '../core/util.js';
import { ISLAND, PLATEAU, NORTH, HILL, BAMBOO, POND, BASIN, RIVER, RIVER_W, TERRACES } from './layout.js';

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return Math.sqrt(dx * dx + dz * dz);
}
export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    // (cheap reject: the segment's bounding box grown by the bank width)
    if (x < Math.min(ax, bx) - 12 || x > Math.max(ax, bx) + 12 || z < Math.min(az, bz) - 12 || z > Math.max(az, bz) + 12) continue;
    const d = segDist(x, z, ax, az, bx, bz);
    if (d < best) best = d;
  }
  return best;
}

// n: a Noise (core/util.js)
export function islandHeight(n, x, z) {
  const I = ISLAND;
  const dx = (x - I.x) / I.r, dz = (z - I.z) / I.r;
  const edge = Math.sqrt(dx * dx + dz * dz) + n.fbm(x * 0.015, z * 0.015, 3) * 0.12;
  // island falloff to the seabed
  let h = 1.0 - smoothstep(0.78, 1.0, edge) * 2.8 - smoothstep(1.0, 1.15, edge) * 1.4; // (down to the seabed skirt's -3.2)
  // gentle rolling ground
  h += n.fbm(x * 0.035 + 11, z * 0.035, 3) * 0.35;
  // the village plateau
  const vd = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  const flat = 1 - smoothstep(PLATEAU.flat, PLATEAU.blend, vd);
  h = lerp(h, 1.0 + n.fbm(x * 0.08, z * 0.08, 2) * 0.05, flat);
  // the North-West Terraces: shelves stepping up toward the cliffs
  const Tr = TERRACES;
  if (x > Tr.x0 - Tr.edge && x < Tr.x1 + Tr.edge && z > Tr.z0 - Tr.edge && z < Tr.z1 + Tr.edge) {
    const mx = smoothstep(Tr.x0 - Tr.edge, Tr.x0, x) * smoothstep(Tr.x1 + Tr.edge, Tr.x1, x) * smoothstep(Tr.z0 - Tr.edge, Tr.z0, z);
    let rise = 0; for (const [za, zb, hs] of Tr.steps) rise = Math.max(rise, smoothstep(za, zb, z) * hs);
    h += rise * mx;
  }
  // northern mountains: painted terraces with ~2 m cliff risers (the steps are 2.2 m high, 13.75 m deep)
  const N = NORTH;
  const north = smoothstep(N.foot, N.top, z + n.fbm(x * 0.035, 5, 2) * 6);
  if (north > 0) {
    let mnt = 2.4 + (N.z0 - z) * N.rise + n.fbm(x * 0.025, z * 0.025 + 3, 4) * 2.2 + Math.max(0, n.n2(x * 0.04, z * 0.04)) * 1.5;
    const st = N.step, fr = mnt / st - Math.floor(mnt / st);
    mnt = Math.floor(mnt / st) * st + smoothstep(0.85, 1.0, fr) * st;
    h = lerp(h, Math.max(h, mnt), north);
  }
  // the shrine hill (a plateau with a soft rim)
  const hd = Math.hypot((x - HILL.x) * 0.9, z - HILL.z);
  if (hd < HILL.foot) h = lerp(h, HILL.h + n.fbm(x * 0.2, z * 0.2) * 0.08, smoothstep(HILL.foot, HILL.top, hd));
  // the bamboo rise west of the river
  const wd = Math.hypot(x - BAMBOO.x, z - BAMBOO.z);
  if (wd < BAMBOO.r) h += smoothstep(BAMBOO.r, BAMBOO.r * 0.25, wd) * BAMBOO.h;
  // river channel (the old width: the 9 m bridge spans it)
  if (z > BASIN.z - BASIN.r1) {
    const rd = riverDist(x, z);
    const rw = RIVER_W(z);
    if (rd < rw + 3.0) h = lerp(h, Math.min(h, -0.9 - (1 - rd / (rw + 3)) * 0.3), smoothstep(rw + 3.0, rw - 0.2, rd)); // (only ever cuts down: no shallow ridge out in the sea)
  }
  // the waterfall's plunge pool at the foot of the cliff
  const wb = Math.hypot(x - BASIN.x, z - BASIN.z);
  if (wb < BASIN.r1) h = lerp(h, -1.0, smoothstep(BASIN.r1, BASIN.r0, wb));
  // koi pond
  const pd = Math.hypot(x - POND.x, z - POND.z) + n.n2(x * 0.15, z * 0.15) * 0.9;
  if (pd < POND.r + 3.2) h = lerp(h, -0.75, smoothstep(POND.r + 3.0, POND.r - 1.6, pd));
  return h;
}
