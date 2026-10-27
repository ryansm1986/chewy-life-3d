// Blossom Hollow's outskirts (ROADMAP HP-1): the Ramble, a packed-earth trail looping round the island outside the
// town, its two footbridges, and the ten cozy places beside it (the owner's picks of the Codex concepts,
// tools/blender/work/codex/hollow-pois/concepts/). Pure data and geometry helpers: layout.js reads it for the
// vegetation keep-outs, the terrain paints the trail, world/outskirts/ builds the places. No imports (layout.js
// imports this file).

// the trail: polylines (x, z) about 2 m wide; packed earth (Terrain.wear), stepping stones where it's wet
export const RAMBLE_W = 2.0;
export const RAMBLE = [
  // the travel post → Lighthouse Point (a spur to the sea tip)
  { id: 'lighthouse', pts: [[41, 105.5], [39, 104.8]] },
  // the travel post → north up the peninsula → Kite Hill → the north footbridge → the northern shelf → the lagoon
  { id: 'north', pts: [[42, 104], [43.5, 92], [47, 82], [55, 72], [66, 64], [78, 57.4], [88.5, 53.3]] },
  { id: 'shelf', pts: [[101.4, 46.9], [110, 49.5], [122, 51.5], [134, 50.5], [144, 48.5], [154, 49.5], [162, 54.5], [166, 57.4]] },
  // the lagoon → down the east coast (round the shrine hill's seaward shoulder) → the Bee Meadow → the south shore
  { id: 'east', pts: [[166, 57.4], [176, 64], [186, 73], [192.5, 88], [193.6, 102], [196.4, 116], [195, 128], [190.5, 140], [182, 150], [170, 162], [156, 174], [138, 186], [118, 197], [104, 201.5]] },
  // the beach → Driftwood Cove → the south footbridge over the river mouth → the Tide Pools → the Tea Garden → the post
  { id: 'south', pts: [[96, 203], [88, 195.5], [82, 188.5], [72, 181], [58.3, 171.3]] },
  { id: 'west', pts: [[48.5, 166.9], [44.5, 158], [41.5, 147], [39.5, 136], [40, 124], [41.6, 112], [42, 106.5]] },
];
// footbridges (a deck from a to b; the trail ends at each end)
export const FOOTBRIDGES = [
  { id: 'northBridge', a: [88.5, 53.3], b: [101.4, 46.9], w: 1.8, rise: 0.6 },
  { id: 'southBridge', a: [58.3, 171.3], b: [48.5, 166.9], w: 1.8, rise: 0.55 },
];
// the places: centre, radius (their clearing: no trees, no clutter; the camera side kept open), the yaw their front
// faces, the name card's words, the map's icon. Each one's builder is world/outskirts/pois/<id>.js.
export const POIS = [
  { id: 'lighthouse', name: 'Lighthouse Point', sub: 'The lamp turns at night', icon: 'star', x: 34.1, z: 103, r: 7 },
  { id: 'tea', name: 'Bamboo Tea Garden', sub: 'Sit for a warm cup of tea', icon: 'leaf', x: 45.4, z: 136.2, r: 7 },
  { id: 'tidepools', name: 'The Tide Pools', sub: 'Shells and little crabs', icon: 'wave', x: 41.5, z: 167.4, r: 7 },
  { id: 'wishtree', name: 'Kite Hill', sub: 'The Wishing Tree and its swing', icon: 'sakura', x: 47.5, z: 71, r: 8 },
  { id: 'windmill', name: 'Windmill Orchard', sub: 'Peaches and persimmons', icon: 'leaf', x: 127.3, z: 58, r: 8 },
  { id: 'moonpond', name: 'Firefly Moon Pond', sub: 'Make a wish when the fireflies are out', icon: 'drop', x: 148, z: 56, r: 7 },
  { id: 'pier', name: 'Lagoon Pier', sub: 'Fishing · a sleepy cat', icon: 'wave', x: 169.2, z: 52.5, r: 7 },
  { id: 'seaarch', name: 'Sea Arch Lookout', sub: 'A bench to watch the sea', icon: 'star', x: 201.4, z: 123.6, r: 7 },
  { id: 'bees', name: 'Bee Meadow', sub: 'Honey from the hives', icon: 'sakura', x: 174.5, z: 148.2, r: 8 },
  { id: 'cove', name: 'Driftwood Cove', sub: 'Rest by the fire', icon: 'home', x: 79.5, z: 193.5, r: 7 },
];
export const POI = Object.fromEntries(POIS.map(p => [p.id, p]));

const segD = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
/** distance from (x, z) to the Ramble's centre line (the footbridges count as trail) */
export function distToRamble(x, z) {
  let best = 99;
  for (const R of RAMBLE) for (let i = 0; i < R.pts.length - 1; i++) {
    const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1];
    if (Math.min(ax, bx) - 16 > x || Math.max(ax, bx) + 16 < x || Math.min(az, bz) - 16 > z || Math.max(az, bz) + 16 < z) continue; // (99 beyond 16 m)
    best = Math.min(best, segD(x, z, ax, az, bx, bz));
  }
  for (const F of FOOTBRIDGES) best = Math.min(best, segD(x, z, F.a[0], F.a[1], F.b[0], F.b[1]));
  return best;
}
/** the place whose clearing (x, z) is in (pad m more), or null */
export function poiAt(x, z, pad = 0) {
  for (const p of POIS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + pad) ** 2) return p;
  return null;
}
/** is (x, z) kept clear of trees and bushes: the trail, the places' clearings and their camera side (+x, +z) */
export function outskirtsKeepOut(x, z, canopy = 2) {
  const band = RAMBLE_W / 2 + 0.9 + canopy * 0.7;
  if (distToRamble(x, z) < band) return true;
  if (distToRamble(x - 2.4, z - 2.4) < band) return true; // (a crown on the camera's side, +x / +z, would hide the walker)
  for (const p of POIS) {
    const dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz < (p.r + canopy) ** 2) return true;
    const u = (dx + dz) / Math.SQRT2, v = (dx - dz) / Math.SQRT2; // (the camera looks from +x / +z)
    if (u > 0 && u < p.r + 7 + canopy && Math.abs(v) < p.r * 0.8 + canopy) return true;
  }
  return false;
}
