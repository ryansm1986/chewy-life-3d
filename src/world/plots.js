// Plots (docs/VILLAGE_PLAN.md §3-4): the town's lots, hand-authored and deterministic. Pure data + pure helpers, no
// imports (layout.js reads the table for its keep-outs).
// A plot: { id, district, x, z, w, d (the lot rectangle in tiles: x..x+w, z..z+d), door: 'N'|'S'|'E'|'W' (the edge that
// faces its street), allows: [building types], max: 2|3|4 (biggest footprint, square), rank (village rank that unlocks
// it), fixed?: landmark key (a prebuilt building that always stands here), starter?: the building a new game puts here
// (level?: its starting level), zone?: a zone painted here in a new game (1 homes, 2 shops, 3 workshops) }.
// Lots are sized so a building at its max level leaves >= 3 m to the next lot's, with a small yard.

export const DISTRICTS = {
  core: { name: 'Civic Core', color: '#ffd27a', label: [114, 96] },
  market: { name: 'Market Street', color: '#8fc8ff', label: [133, 110] },
  west: { name: 'West Lanes', color: '#ff9ab0', label: [74, 160] },
  meadows: { name: 'South Meadows', color: '#a8e090', label: [113, 167] },
  pond: { name: 'Pond Park', color: '#7ad8e8', label: [146, 160] },
  works: { name: 'Workshop & Farm Quarter', color: '#ffc870', label: [66, 88] },
  shrine: { name: 'Shrine Hill', color: '#c8a0ff', label: [168, 70] },
  outer: { name: 'Outer South Meadows', color: '#c8e8a0', label: [122, 190], ring: 2 },
  hamlet: { name: 'East Hamlet', color: '#b8d8ff', label: [176, 136], ring: 3 },
  terraces: { name: 'North-West Terraces', color: '#ffe0a0', label: [76, 62], ring: 4 },
};

const HOME = ['home'], SHOP = ['shop'], WORKS = ['lumber', 'kiln', 'fishingHut'], FARM = ['farm'];
const DECO = ['park', 'well', 'waterTower', 'koiStatue', 'chewyStatue', 'miniTorii', 'sakuraPlanter', 'fountain'];
const CIVIC = ['clinic', 'school', 'boneSmith', 'waterTower', 'park', 'guild']; // (guild: the Adventurers' Guild, docs/COZY.md §5.1)
const MIXED = ['home', 'shop'];
const P = (id, district, x, z, w, d, door, allows, max = 3, o = {}) => ({ id, district, x, z, w, d, door, allows, max, rank: o.rank || 1, ...o });

export const PLOTS = [
  // ---- Civic Core: the Town Hall, deco plots on the plaza edges, civic plots by the forecourt
  P('townHall', 'core', 107, 99, 10, 7, 'S', ['townHall'], 6, { fixed: 'townHall' }),
  P('core-nw', 'core', 97, 112, 6, 6, 'S', DECO, 3, { starter: 'park' }),
  P('core-sw', 'core', 98, 124, 5, 6, 'W', DECO, 3, { starter: 'well' }),
  P('core-se', 'core', 123, 124, 6, 5, 'N', DECO, 3),
  P('civic-e', 'core', 120, 99, 7, 7, 'W', CIVIC, 4),
  P('civic-w', 'core', 96, 99, 7, 6, 'E', CIVIC, 4),
  // ---- Market Street (Main Street east of the plaza): Rosie's bakery first, shops both sides, stalls on the square
  P('rosie', 'market', 126, 111, 8, 9, 'S', ['rosieShop'], 4, { fixed: 'rosieShop' }),
  P('mkt-n1', 'market', 135, 112, 6, 8, 'S', SHOP, 3, { starter: 'shop', level: 2 }),
  P('mkt-n2', 'market', 141, 112, 6, 8, 'S', SHOP, 3, { zone: 2 }),
  P('mkt-n3', 'market', 147, 112, 6, 8, 'S', SHOP, 3, { starter: 'shop' }),
  P('mkt-s1', 'market', 130, 124, 6, 7, 'N', SHOP, 3, { starter: 'shop', level: 2 }),
  P('mkt-s2', 'market', 136, 124, 6, 7, 'N', SHOP, 3, { starter: 'shop', level: 2 }),
  P('mkt-s3', 'market', 142, 124, 6, 7, 'N', SHOP),
  P('mkt-s4', 'market', 148, 124, 6, 7, 'N', SHOP),
  P('stall-n1', 'market', 157, 110, 5, 5, 'S', SHOP, 2, { starter: 'shop' }),
  P('stall-n2', 'market', 163, 110, 5, 5, 'S', SHOP, 2),
  P('stall-s1', 'market', 157, 128, 5, 5, 'N', SHOP, 2),
  P('stall-s2', 'market', 163, 128, 5, 5, 'N', SHOP, 2),
  // ---- West Lanes: Chewy's cottage, homes on Cottage Lane and Willow Lane, gardens and wells between them
  P('chewy', 'west', 86, 123, 9, 9, 'E', ['chewyHouse'], 3, { fixed: 'chewyHouse' }),
  P('cl-w1', 'west', 88, 133, 7, 6, 'E', HOME, 3, { starter: 'home', level: 2 }),
  P('cl-w2', 'west', 88, 139, 7, 6, 'E', HOME),
  P('cl-w3', 'west', 88, 145, 7, 6, 'E', HOME, 3, { starter: 'home' }),
  P('cl-e1', 'west', 97, 131, 6, 6, 'W', HOME, 3, { starter: 'home' }),
  P('cl-e2', 'west', 97, 137, 6, 6, 'W', HOME),
  P('cl-e3', 'west', 97, 143, 6, 6, 'W', HOME, 3, { zone: 1 }),
  P('wl-e0', 'west', 80, 123, 6, 7, 'W', DECO, 3, { starter: 'well' }),
  P('wl-e1', 'west', 80, 133, 7, 6, 'W', HOME, 3, { starter: 'home' }),
  P('wl-e2', 'west', 80, 139, 7, 6, 'W', HOME, 3, { zone: 1 }),
  P('wl-e3', 'west', 80, 145, 7, 6, 'W', HOME),
  P('wl-w1', 'west', 73, 123, 5, 7, 'E', HOME, 3),
  P('wl-w2', 'west', 73, 131, 5, 7, 'E', HOME, 3, { starter: 'home' }),
  P('wl-w3', 'west', 73, 139, 5, 7, 'E', HOME),
  P('wl-g1', 'west', 84, 156, 6, 6, 'N', DECO),
  // ---- South Meadows: homes round Meadow Crescent and a park in the middle
  P('sm-n1', 'meadows', 113, 140, 6, 7, 'S', HOME, 3, { starter: 'home', level: 2 }),
  P('sm-n2', 'meadows', 120, 140, 6, 7, 'S', HOME),
  P('sm-s1', 'meadows', 113, 149, 6, 6, 'N', HOME, 3, { zone: 1 }),
  P('sm-s2', 'meadows', 119, 149, 6, 6, 'N', HOME, 3, { starter: 'home' }),
  P('sm-w1', 'meadows', 124, 156, 6, 6, 'E', HOME, 3, { starter: 'home' }),
  P('sm-w2', 'meadows', 124, 162, 6, 5, 'E', HOME),
  P('sm-b1', 'meadows', 110, 165, 6, 6, 'S', HOME),
  P('sm-b2', 'meadows', 116, 165, 6, 6, 'S', HOME),
  P('sm-park', 'meadows', 111, 156, 10, 8, 'W', ['park', 'well', 'waterTower', 'koiStatue'], 4, { starter: 'park' }),
  // ---- Pond Park
  P('pond-e', 'pond', 157, 141, 6, 6, 'W', DECO, 3),
  P('pond-se', 'pond', 150, 158, 6, 6, 'N', DECO, 3),
  // ---- Workshop & Farm Quarter: farm fields west of Mill Lane, workshops east and by the river
  P('farm-1', 'works', 78, 99, 8, 9, 'E', FARM, 3, { field: true, starter: 'farm' }),
  P('farm-2', 'works', 77, 90, 9, 8, 'E', FARM, 3, { field: true }),
  P('works-e1', 'works', 88, 101, 7, 6, 'W', WORKS, 3, { starter: 'lumber' }),
  P('works-e2', 'works', 88, 107, 7, 7, 'W', WORKS, 3, { zone: 3 }),
  P('works-n1', 'works', 90, 83, 6, 7, 'S', WORKS),
  P('works-r1', 'works', 73, 109, 6, 6, 'S', WORKS, 3, { near: 'river' }),
  P('works-r2', 'works', 80, 109, 6, 6, 'S', WORKS),
  // ---- Shrine Hill: the shrine on top, the hot spring beside it (rank 3), the Burrow gate
  P('gate', 'shrine', 175, 74, 6, 6, 'S', ['dungeonGate'], 4, { fixed: 'dungeon' }),
  P('shrine', 'shrine', 165, 79, 6, 6, 'E', ['shrine'], 3),
  P('onsen', 'shrine', 181, 82, 7, 7, 'W', ['onsen'], 4, { rank: 3 }),
  // ---- expansion rings (stub streets drawn but greyed until the rank unlocks them)
  P('os-w1', 'outer', 111, 178, 6, 6, 'E', HOME, 3, { rank: 2 }),
  P('os-w2', 'outer', 111, 184, 6, 6, 'E', HOME, 3, { rank: 2 }),
  P('os-e1', 'outer', 119, 178, 6, 6, 'W', HOME, 3, { rank: 2 }),
  P('os-e2', 'outer', 119, 184, 6, 6, 'W', HOME, 3, { rank: 2 }),
  P('hm-n1', 'hamlet', 170, 113, 6, 7, 'S', MIXED, 3, { rank: 3 }),
  P('hm-n2', 'hamlet', 176, 113, 6, 7, 'S', MIXED, 3, { rank: 3 }),
  P('hm-s1', 'hamlet', 170, 123, 6, 6, 'N', MIXED, 3, { rank: 3 }),
  P('hm-s2', 'hamlet', 176, 123, 6, 7, 'N', MIXED, 3, { rank: 3 }),
  P('tr-1', 'terraces', 87, 72, 6, 6, 'S', HOME, 3, { rank: 4 }),
  P('tr-2', 'terraces', 93, 72, 6, 6, 'S', HOME, 3, { rank: 4 }),
  P('tr-3', 'terraces', 94, 62, 6, 6, 'S', HOME, 3, { rank: 4 }),
  P('tr-4', 'terraces', 103, 72, 6, 6, 'W', HOME, 3, { rank: 4 }),
];
export const PLOT_BY_ID = Object.fromEntries(PLOTS.map(p => [p.id, p]));

// ------------------------------------------------------------------ geometry helpers
export const plotCentre = p => ({ x: p.x + p.w / 2, z: p.z + p.d / 2 });
// unit vector from the plot centre toward its street
export const DOOR_DIR = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
// rotation index of a building whose door faces the plot's street (0 = +z, 1 = -x, 2 = -z, 3 = +x)
export const DOOR_ROT = { S: 0, W: 1, N: 2, E: 3 };
export const plotAt = (x, z, list = PLOTS) => list.find(p => x >= p.x && x < p.x + p.w && z >= p.z && z < p.z + p.d) || null;
export const rectsOverlap = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.z < b.z + b.d + pad && b.z < a.z + a.d + pad;
// Building types that only stand on plots (zone growth and the palette snap them to one). Everything else (lamps,
// benches, flower beds, fences, small statues, wells) is placed freely, outside the plots' reserved boxes, or on a
// plot that lists it.
export const PLOT_TYPES = new Set(['home', 'shop', 'farm', 'lumber', 'kiln', 'fishingHut', 'park', 'waterTower', 'clinic', 'school', 'shrine', 'onsen', 'boneSmith', 'chewyStatue', 'guild']);
export const ZONE_TYPES = { 1: ['home'], 2: ['shop'], 3: ['farm', 'lumber', 'kiln', 'fishingHut'] };
// the zones a plot can take (zone id -> the building types it would grow there)
export const plotZones = p => Object.keys(ZONE_TYPES).map(Number).filter(z => ZONE_TYPES[z].some(t => p.allows.includes(t)));

// ---- a plot's frame: the frontage F runs along its street, the depth D away from it
export function plotFrame(p) { const alongX = p.door === 'E' || p.door === 'W'; return { alongX, F: alongX ? p.d : p.w, D: alongX ? p.w : p.d }; }
// the front yard: a building's front stays this far back from the street edge at every level (it grows toward the back)
export const plotSetback = p => Math.max(1, Math.min(2, Math.round((plotFrame(p).D - p.max) * 0.55)));
// where a building of world dims [ww, dd] (already turned to face the street) stands on plot p: { x, z, w, d, rot }
// in whole tiles, centred along the frontage, its front on the setback line. null when it is bigger than the plot allows.
export function plotSpot(p, ww, dd) {
  const { alongX, F, D } = plotFrame(p), s = plotSetback(p);
  const depthLen = alongX ? ww : dd, latLen = alongX ? dd : ww;
  if (Math.max(ww, dd) > p.max || depthLen + s > D || latLen > F) return null;
  const lat = Math.round((F - latLen) / 2);
  let x, z;
  if (p.door === 'S') { z = p.z + p.d - s - dd; x = p.x + lat; }
  else if (p.door === 'N') { z = p.z + s; x = p.x + lat; }
  else if (p.door === 'E') { x = p.x + p.w - s - ww; z = p.z + lat; }
  else { x = p.x + s; z = p.z + lat; }
  return { x, z, w: ww, d: dd, rot: DOOR_ROT[p.door] };
}
// plot-local (u along the frontage, v inward from the street edge) -> world [x, z]
export function plotLocal(p, u, v) {
  switch (p.door) {
    case 'S': return [p.x + u, p.z + p.d - v];
    case 'N': return [p.x + u, p.z + v];
    case 'E': return [p.x + p.w - v, p.z + u];
    default: return [p.x + v, p.z + u];
  }
}
// the yaw (local +z -> world) of a piece that faces the plot's street
export const plotFacing = p => { const [dx, dz] = DOOR_DIR[p.door]; return Math.atan2(dx, dz); };
// tiles kept clear of free decorations: the biggest building the plot can hold, and the walk from its door to the street
export function plotReserve(p) {
  if (p.fixed) return [{ x: p.x, z: p.z, w: p.w, d: p.d }];
  const box = plotSpot(p, p.max, p.max), { F } = plotFrame(p), s = plotSetback(p);
  const [ax, az] = plotLocal(p, F / 2 - 0.7, 0), [bx, bz] = plotLocal(p, F / 2 + 0.7, s);
  const strip = { x: Math.min(ax, bx), z: Math.min(az, bz), w: Math.abs(bx - ax), d: Math.abs(bz - az) };
  return box ? [box, strip] : [{ x: p.x, z: p.z, w: p.w, d: p.d }];
}

// ------------------------------------------------------------------ validation (boot, dev; the plan preview tool)
// ter: { tile(x, z), heightAt(x, z), slopeAt(x, z) }, lay: layout.js (T, WORLD, LANDMARKS, PATHS, distToPaths,
// SQUARES, squareDist), sizeOf: buildings/catalog.js (optional: spot checks). Checks every plot is on dry, flat, buildable ground, clear of every street and square, faces
// a street with its door edge, doesn't overlap another plot, and holds its landmark.
export function validatePlots(ter, lay, sizeOf = null) {
  const errors = [], { T, WORLD } = lay;
  for (const p of PLOTS) {
    if (p.draft) continue;
    const bad = [];
    if (p.x < 3 || p.z < 3 || p.x + p.w > WORLD - 3 || p.z + p.d > WORLD - 3) bad.push('off the map');
    let hMin = 1e9, hMax = -1e9, wet = 0, rock = 0, paved = 0, street = 0;
    for (let z = Math.floor(p.z); z < Math.ceil(p.z + p.d); z++) for (let x = Math.floor(p.x); x < Math.ceil(p.x + p.w); x++) {
      const cx = Math.max(p.x + 0.25, Math.min(p.x + p.w - 0.25, x + 0.5)), cz = Math.max(p.z + 0.25, Math.min(p.z + p.d - 0.25, z + 0.5));
      const t = ter.tile(cx, cz), h = ter.heightAt(cx, cz);
      if (t === T.WATER || t === T.SAND) wet++; else if (t === T.ROCK) rock++; else if (t === T.PATH || t === T.PLAZA) paved++;
      if (lay.distToPaths(cx, cz) < 0) street++;
      hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
    if (wet) bad.push(`${wet} wet tiles`);
    if (rock) bad.push(`${rock} rocky tiles`);
    if (paved || street) bad.push(`over a street/square (${Math.max(paved, street)} tiles)`);
    if (hMax - hMin > 0.7) bad.push(`bumpy ${(hMax - hMin).toFixed(2)} m`);
    if (hMin < 0.55) bad.push(`low ground ${hMin.toFixed(2)} m`);
    // the door edge must face a street (or a square) within 3.2 m
    const [dx, dz] = DOOR_DIR[p.door], c = plotCentre(p);
    const ex = c.x + dx * p.w / 2, ez = c.z + dz * p.d / 2;
    let front = 1e9;
    for (const t of [-0.3, 0, 0.3]) {
      const qx = ex + (dz ? t * p.w : 0), qz = ez + (dx ? t * p.d : 0);
      front = Math.min(front, lay.distToPaths(qx + dx * 0.2, qz + dz * 0.2, lay.PATHS.filter(s => s.rank <= p.rank)));
      for (const S of Object.values(lay.SQUARES)) front = Math.min(front, lay.squareDist(S, qx + dx * 0.2, qz + dz * 0.2));
    }
    if (front > 3.2) bad.push(`door edge ${p.door} is ${front.toFixed(1)} m from a street`);
    for (const q of PLOTS) if (q !== p && !q.draft && rectsOverlap(p, q, -0.01)) { if (p.id < q.id) bad.push(`overlaps ${q.id}`); }
    if (p.fixed) {
      const L = lay.LANDMARKS[p.fixed]; const rot = (L.ri || 0) % 2, w = rot ? L.d : L.w, d = rot ? L.w : L.d;
      if (L.x - w / 2 < p.x || L.x + w / 2 > p.x + p.w || L.z - d / 2 < p.z || L.z + d / 2 > p.z + p.d) bad.push(`landmark ${p.fixed} sticks out of its plot`);
    } else if (sizeOf) {
      // every type the plot allows has a spot at level 1, and the biggest building fits inside the lot
      if (!plotSpot(p, p.max, p.max)) bad.push(`a ${p.max}x${p.max} building doesn't fit`);
      for (const t of p.allows) { const [w, d] = sizeOf(t, 1), r = DOOR_ROT[p.door] % 2; if (!plotSpot(p, r ? d : w, r ? w : d)) bad.push(`no spot for a ${t}`); }
    }
    if (bad.length) errors.push(`${p.id}: ${bad.join(', ')}`);
  }
  const total = PLOTS.filter(p => !p.draft).length;
  return { total, ok: total - errors.length, errors };
}
