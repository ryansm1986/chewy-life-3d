// Region layout generator (docs/REGIONS.md §3.2, engine API §3.6). A Burrow-shaped layout for an open-air map, so
// DungeonMode's monster AI (los / flow field over layout.at), spawning, chests and shrines work unchanged.
//  1. regionPlan(def): the fixed skeleton of a region, seeded by its id and cached for the session: a winding trail
//     (Catmull-Rom through wandering control points, start → arena), camp sites in clearings beside it, POI sites at
//     the end of short spurs, the arrival clearing and the boss arena. Terrain and landmarks are built around it.
//  2. the terrain (regionTerrain.js, also cached per id) carves the trail and flattens the clearings.
//  3. generateRegion(def, { visit }): the per-visit layout. Walkability comes from the terrain (height band, slope,
//     water); camps, ranks, chests and the shrine reroll per visit. RegionWorld later blocks the cells under dense
//     obstacles (populate's ctx.blockCells) so monsters path around them.
import { RNG } from '../core/util.js';
import { regionTerrain } from './regionTerrain.js';

export const REGION_SIZE = 112, RCELL = 2, RN = REGION_SIZE / RCELL; // 56 x 56 cells

const PLANS = new Map();
/** The fixed skeleton of a region (cached per id): { trail, spurs, camps, pois, start, arena, open } in world metres. */
export function regionPlan(def) {
  const key = def.id + ':' + JSON.stringify(def.layout || {});
  let P = PLANS.get(key);
  if (!P) { P = makePlan(def); PLANS.set(key, P); }
  return P;
}

function makePlan(def) {
  const L = def.layout || {};
  const rng = new RNG(hash(def.id) * 7919 + 17);
  const lo = 12, hi = REGION_SIZE - 12, clampW = v => Math.max(lo, Math.min(hi, v));
  const [sx, sz] = L.start || [16, 96];
  const [ax, az, ar] = L.arena || [92, 20, 11];
  const start = { x: sx, z: sz, r: L.startR ?? 7 };
  const arena = { x: ax, z: az, r: ar };
  // control points: the biome's `via` waypoints, or a few wandering ones between start and arena
  let ctrl = [[sx, sz]];
  if (L.via?.length) ctrl.push(...L.via.map(p => [p[0], p[1]]));
  else {
    const n = L.bends ?? 4, dx = ax - sx, dz = az - sz, len = Math.hypot(dx, dz) || 1, px = -dz / len, pz = dx / len;
    const wig = L.wiggle ?? 15;
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1), side = (i % 2 ? 1 : -1) * rng.range(0.45, 1);
      ctrl.push([clampW(sx + dx * k + px * wig * side + rng.range(-3, 3)), clampW(sz + dz * k + pz * wig * side + rng.range(-3, 3))]);
    }
  }
  // the trail ends at the arena's rim (it enters the ring), not its centre
  const last = ctrl[ctrl.length - 1], ex = last[0] - ax, ez = last[1] - az, el = Math.hypot(ex, ez) || 1;
  ctrl.push([ax + ex / el * ar * 0.55, az + ez / el * ar * 0.55]);
  const trail = spline(ctrl, 1.5);
  // camp sites: clearings beside the trail, spaced out, the first stretch left calm; a couple of spares
  const want = (L.camps ?? 7) + 2, camps = [];
  // keep-out discs [[x, z, r]...] where no camp / POI site may land (the biome's landmarks: pools, grottos, gardens)
  const avoided = c => (L.avoid || []).some(([x, z, r]) => Math.hypot(c.x - x, c.z - z) < r + (c.r || 0));
  const campR = L.campR ?? 6.5;
  for (let tries = 0; camps.length < want && tries < 400; tries++) {
    const k = 0.2 + rng.next() * 0.66;
    const [x, z, tx, tz] = alongPath(trail, k, true);
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(4.5, 8.5) * side;
    const c = { x: clampW(x - tz * off), z: clampW(z + tx * off), r: campR, k };
    if (Math.hypot(c.x - sx, c.z - sz) < 22 || Math.hypot(c.x - ax, c.z - az) < ar + 9 || avoided(c)) continue;
    if (camps.some(o => Math.hypot(o.x - c.x, o.z - c.z) < (L.campGap ?? 14)) || (L.poiAt || []).some(([x, z]) => Math.hypot(x - c.x, z - c.z) < c.r + 5)) continue;
    camps.push(c);
  }
  camps.sort((a, b) => a.k - b.k);
  // POIs: off the trail at the end of a short spur
  const pois = [], spurs = [], nP = L.pois ?? 3;
  // fixed POIs first ([[x, z, kind]...]: the biome's landmarks), then random ones for the remaining kinds
  const spurTo = p => { let bi = 0, bd = 1e9; trail.forEach(([x, z], i) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; bi = i; } }); const [x, z] = trail[bi]; p.k = bi / (trail.length - 1); spurs.push(spline([[x, z], [(x + p.x) / 2 + rng.range(-1.5, 1.5), (z + p.z) / 2 + rng.range(-1.5, 1.5)], [p.x, p.z]], 1.2)); };
  for (const [x, z, kind] of L.poiAt || []) { const p = { x, z, r: 4.5, kind }; pois.push(p); spurTo(p); }
  const kinds = (L.poiKinds || ['cache', 'shrine', 'cache', 'feature']).filter(k => !(L.poiAt || []).some(f => f[2] === k));
  for (let i = 0, tries = 0; pois.length < nP && kinds.length && tries < 300; tries++) {
    const k = 0.22 + (pois.length + rng.next()) / nP * 0.6;
    const [x, z, tx, tz] = alongPath(trail, Math.min(0.85, k), true);
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(10, 15) * side;
    const p = { x: clampW(x - tz * off), z: clampW(z + tx * off), r: 4.5, kind: kinds[i % kinds.length], k };
    if ([...camps, ...pois].some(o => Math.hypot(o.x - p.x, o.z - p.z) < (o.r || 5) + 7)) continue;
    if (Math.hypot(p.x - sx, p.z - sz) < 12 || Math.hypot(p.x - ax, p.z - az) < ar + 6 || avoided(p)) continue;
    if (distToPolyline(trail, p.x, p.z) < 7) continue;
    pois.push(p); spurs.push(spline([[x, z], [(x + p.x) / 2 + rng.range(-1.5, 1.5), (z + p.z) / 2 + rng.range(-1.5, 1.5)], [p.x, p.z]], 1.2));
    i++;
  }
  const open = (L.open || []).map(([x, z, r]) => ({ x, z, r }));
  const P = { trail, spurs, camps, pois, start, arena, open, trailW: L.trailW ?? 1.5, lanes: L.lanes ?? 6.5 };
  // playable skeleton as capsules / discs (the terrain's play mask and the placement keep-outs read this)
  P.segs = [];
  for (const path of [trail, ...spurs]) for (let i = 0; i < path.length - 1; i++) P.segs.push([path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], path === trail ? P.lanes : 3.2]);
  P.discs = [{ ...start, r: start.r + 2, kind: 'start' }, ...camps.map(c => ({ ...c, r: c.r + 1.5, kind: 'camp' })), ...pois.map(p => ({ ...p, r: p.r + 1.5, kind: 'poi' })), { ...arena, r: arena.r + 3.5, kind: 'arena' }, ...open.map(o => ({ ...o, kind: 'open' }))];
  return P;
}

/** The per-visit layout (docs/REGIONS.md §3.2). */
export function generateRegion(def, { visit = 0, mlvl = def.levels[0] } = {}) {
  const W = RN, H = RN;
  const plan = regionPlan(def);
  const T = regionTerrain(def, plan); // CPU heightfield, cached per region
  const rng = new RNG(hash(def.id) * 7919 + visit * 104729 + 17);
  const grid = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : grid[y * W + x];
  // a cell is open when most of it is walkable (5 samples: centre + the 4 quarter points)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = (x + 0.5) * RCELL, cz = (y + 0.5) * RCELL;
    if (!T.walkable(cx, cz)) continue;
    let n = 0; for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) if (T.walkable(cx + dx, cz + dz)) n++;
    if (n >= 3) grid[y * W + x] = 1;
  }
  // the main trail is always open, even where it crosses water: the biome bridges it (populate's decks). Without this
  // the flood fill below would cut off everything beyond the first river from the monster grid.
  // (sampled every 0.4 m; a step that crosses a cell corner also opens the side cell, so the chain stays 4-connected)
  const open = (cx, cy) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) grid[cy * W + cx] = 1; };
  let px = -1, py = -1;
  for (let i = 1; i < plan.trail.length; i++) {
    const [x0, z0] = plan.trail[i - 1], [x1, z1] = plan.trail[i], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let k = 0; k <= n; k++) {
      const cx = Math.floor((x0 + (x1 - x0) * k / n) / RCELL), cy = Math.floor((z0 + (z1 - z0) * k / n) / RCELL);
      if (px >= 0 && cx !== px && cy !== py) open(cx, py);
      open(cx, cy); px = cx; py = cy;
    }
  }
  keepLargest(grid, W, H, Math.floor(plan.start.x / RCELL), Math.floor(plan.start.z / RCELL));
  const toCell = (x, z) => ({ x: Math.max(0, Math.min(W - 1, Math.floor(x / RCELL))), y: Math.max(0, Math.min(H - 1, Math.floor(z / RCELL))) });
  const openNear = (c, R = 4) => { // nearest open cell (spiral), so a spawn never lands in a blocked cell
    if (at(c.x, c.y)) return c;
    for (let r = 1; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && at(c.x + dx, c.y + dy)) return { x: c.x + dx, y: c.y + dy };
    return c;
  };
  const start = openNear(toCell(plan.start.x, plan.start.z));
  const rooms = [{ ...box(start.x, start.y, 3), kind: 'start', lvl: mlvl }];
  const spawns = [], chests = [], shrines = [];
  // camps: this visit's picks from the fixed sites, level rising toward the boss
  const nCamps = def.layout?.camps ?? 7;
  const sites = rng.shuffle(plan.camps.slice()).slice(0, nCamps).sort((a, b) => a.k - b.k);
  sites.forEach((s, i) => {
    const c = openNear(toCell(s.x, s.z));
    const lvl = mlvl + Math.min(3, Math.floor(s.k * 3.6));
    rooms.push({ ...box(c.x, c.y, 3), kind: 'camp', lvl, site: s });
    const r = rng.next();
    spawns.push({ x: c.x, y: c.y, rank: r < 0.12 ? 'unique' : r < 0.32 ? 'champion' : 'normal', count: rng.int(3, 5), lvl });
  });
  // points of interest: caches and a buff shrine at the spur ends (the biome's own POIs use layout.pois / kind)
  const pois = plan.pois.map(p => ({ x: p.x, z: p.z, r: p.r, kind: p.kind }));
  for (const p of plan.pois) {
    const c = openNear(toCell(p.x, p.z));
    rooms.push({ ...box(c.x, c.y, 2), kind: 'poi', lvl: mlvl, poi: p.kind });
    if (p.kind === 'shrine') shrines.push({ x: c.x, y: c.y, type: rng.pick(['zoomies', 'goodboy', 'lucky', 'sparkle', 'snack']) });
    else if (p.kind === 'cache') chests.push({ x: c.x, y: c.y, quality: rng.chance(0.35) ? 'gold' : 'wood' });
  }
  // a stray chest in a random camp clearing now and then (rerolls per visit)
  if (sites.length && rng.chance(0.5)) { const s = rng.pick(sites), a = rng.range(0, 6.283), c = openNear(toCell(s.x + Math.cos(a) * 3.5, s.z + Math.sin(a) * 3.5)); chests.push({ x: c.x, y: c.y, quality: 'wood' }); }
  const bc = openNear(toCell(plan.arena.x, plan.arena.z));
  const bossRoom = { ...box(bc.x, bc.y, Math.round(plan.arena.r / RCELL)), kind: 'boss', lvl: mlvl + 2 };
  rooms.push(bossRoom);
  spawns.push({ x: bc.x, y: bc.y, rank: 'boss', count: 1, boss: def.boss, lvl: mlvl + 2 });
  const L = {
    W, H, CELL: RCELL, grid, at, rooms, centers: rooms.map(r => ({ x: r.cx, y: r.cy })), start,
    spawns, chests, pots: [], shrines, props: [], lights: [], bossRoom, boss: def.boss, mlvl,
    floor: 0, theme: def.id, region: def.id, waypoint: null, stairs: null,
    paths: [plan.trail, ...plan.spurs], arena: { x: plan.arena.x, z: plan.arena.z, r: plan.arena.r }, pois,
    camps: sites.map(s => ({ x: s.x, z: s.z, r: s.r })), plan, visit,
  };
  Object.defineProperty(L, 'terrain', { value: T, enumerable: false }); // (not serialised; RegionWorld reuses it)
  return L;
}

// keep the connected open area around the start (cut off pockets would trap monsters / confuse the flow field)
function keepLargest(grid, W, H, sx, sy) {
  const seen = new Uint8Array(W * H), q = [];
  let s = -1;
  for (let r = 0; r < 8 && s < 0; r++) for (let dy = -r; dy <= r && s < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x]) { s = y * W + x; break; } }
  if (s < 0) return;
  seen[s] = 1; q.push(s);
  while (q.length) {
    const k = q.pop(), x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (grid[j] && !seen[j]) { seen[j] = 1; q.push(j); } }
  }
  for (let i = 0; i < W * H; i++) if (!seen[i]) grid[i] = 0;
}
function box(cx, cy, r) { return { x: cx - r, y: cy - r, w: r * 2 + 1, h: r * 2 + 1, cx, cy }; }
/** Catmull-Rom through control points, resampled every ~step metres */
export function spline(ctrl, step = 1.5) {
  if (ctrl.length < 2) return ctrl.map(p => [p[0], p[1]]);
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]]);
  return out;
}
/** point at fraction k (0..1) of a polyline's length (withDir: also the unit tangent → [x, z, tx, tz]) */
export function alongPath(pts, k, withDir = false) {
  let total = 0; const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); total += d; }
  let want = total * Math.max(0, Math.min(1, k));
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, want / seg[i]) : 0, dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = seg[i] || 1;
      const x = pts[i][0] + dx * t, z = pts[i][1] + dz * t;
      return withDir ? [x, z, dx / l, dz / l] : [x, z];
    }
    want -= seg[i];
  }
  const e = pts[pts.length - 1];
  return withDir ? [e[0], e[1], 1, 0] : [e[0], e[1]];
}
export function distToPolyline(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], vx = pts[i + 1][0] - ax, vz = pts[i + 1][1] - az, wx = x - ax, wz = z - az;
    const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
    const dx = x - (ax + vx * t), dz = z - (az + vz * t), d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
