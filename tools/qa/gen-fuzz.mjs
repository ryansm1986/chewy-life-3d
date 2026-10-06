// Node-only fuzz of the Burrow generator (src/dungeon/gen.js has no browser deps).
// For many floors x seeds: no throw, >=2 rooms, every placed thing sits on floor, everything reachable from start,
// exit portal / stairs / waypoint can actually be reached by the player (interaction radius).
// Also the zone dungeons' two floors (dungeon/defs.js floorPlan: stairs on floor 1, the boss room on floor 2).
// usage: node tools/qa/gen-fuzz.mjs [seeds=300] [floors=40]
import { generate, CELL } from '../../src/dungeon/gen.js';
import { DUNGEONS, floorPlan } from '../../src/dungeon/defs.js';

const SEEDS = +(process.argv[2] || 300), FLOORS = +(process.argv[3] || 40);
const fails = {}; let runs = 0;
const bump = (k, info) => { (fails[k] ||= { n: 0, ex: [] }).n++; if (fails[k].ex.length < 4) fails[k].ex.push(info); };

// mirror of DungeonWorld.walkable (keeps a 0.22-cell margin from wall cells)
function walkable(L, x, z) {
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  if (!L.at(cx, cy)) return false;
  const fx = x / CELL - cx, fy = z / CELL - cy, m = 0.22;
  if (fx < m && !L.at(cx - 1, cy)) return false;
  if (fx > 1 - m && !L.at(cx + 1, cy)) return false;
  if (fy < m && !L.at(cx, cy - 1)) return false;
  if (fy > 1 - m && !L.at(cx, cy + 1)) return false;
  return true;
}
const c2w = (x, y) => ({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL });
// can the player stand somewhere within r of p (interaction reach = radius + 0.4)?
function reachable(L, p, r, reach) {
  for (let dz = -r; dz <= r; dz += 0.1) for (let dx = -r; dx <= r; dx += 0.1) {
    if (Math.hypot(dx, dz) > r) continue;
    const x = p.x + dx, z = p.z + dz;
    if (walkable(L, x, z) && reach[Math.floor(z / CELL) * L.W + Math.floor(x / CELL)]) return true;
  }
  return false;
}

// the Burrow's floors, then every zone dungeon's two
const JOBS = [];
for (let floor = 1; floor <= FLOORS; floor++) JOBS.push({ floor, plan: null, name: '' });
for (const d of Object.values(DUNGEONS)) if (d.kind === 'zone') for (let floor = 1; floor <= d.floors; floor++) JOBS.push({ floor, plan: floorPlan(d, floor, { heroLvl: 10 }), name: d.id + ' ' });
for (const { floor, plan, name } of JOBS) for (let s = 1; s <= SEEDS; s++) {
  // the game seeds each entry with state.dungeon.seed + floor*17 + runs*101 (+ a per-dungeon salt): dungeon/defs.js beginRun
  const seed = s + floor * 17;
  let L;
  runs++;
  try { L = generate({ floor, seed, plan }); } catch (e) { bump('generate() threw', `${name}floor ${floor} seed ${seed}: ${e.message}`); continue; }
  const tag = `${name}floor ${floor} seed ${seed}`;
  if (L.rooms.length < 2) bump('fewer than 2 rooms', tag);
  if (L.boss && !L.bossRoom) bump('boss floor without boss room', tag);
  // BFS reachability from start
  const reach = new Uint8Array(L.W * L.H), q = [L.start.y * L.W + L.start.x];
  if (!L.at(L.start.x, L.start.y)) bump('start cell is wall', tag);
  reach[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = i % L.W, y = (i / L.W) | 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, ny = y + oy; if (!L.at(nx, ny)) continue; const j = ny * L.W + nx; if (!reach[j]) { reach[j] = 1; q.push(j); } } }
  const onFloor = (c, what) => { if (!c) return; if (!L.at(c.x, c.y)) bump(`${what} on a wall cell`, `${tag} @${c.x},${c.y}`); else if (!reach[c.y * L.W + c.x]) bump(`${what} unreachable from start`, `${tag} @${c.x},${c.y}`); };
  onFloor(L.stairs, 'stairs');
  onFloor(L.waypoint, 'waypoint');
  for (const r of L.rooms) onFloor({ x: r.cx, y: r.cy }, 'room centre');
  for (const c of L.spawns) onFloor(c, c.boss ? 'boss spawn' : 'monster pack');
  for (const c of L.chests) onFloor(c, 'chest');
  for (const c of L.shrines) onFloor(c, 'shrine');
  for (const c of L.pots) onFloor(c, 'pot');
  if (!L.boss && !L.stairs) bump('non-boss floor without stairs', tag);
  // start position walkable
  const s0 = c2w(L.start.x, L.start.y);
  if (!walkable(L, s0.x, s0.z)) bump('player start position not walkable', tag);
  // exit portal is placed at start + (-1.6, -1.6); interact radius 1.2 (+0.4 slack in nearestInteract)
  const portal = { x: s0.x - 1.6, z: s0.z - 1.6 };
  if (!reachable(L, portal, 1.55, reach)) bump('exit portal cannot be reached (inside rock)', tag);
  if (L.waypoint) { const w = c2w(L.waypoint.x, L.waypoint.y); if (!walkable(L, w.x, w.z)) bump('waypoint centre not walkable (mesh embedded in rock)', tag); if (!reachable(L, w, 1.75, reach)) bump('waypoint cannot be reached at all', tag); }
  if (L.stairs) { const w = c2w(L.stairs.x, L.stairs.y); if (!reachable(L, w, 1.65, reach)) bump('stairs cannot be reached', tag); }
}
console.log(`gen-fuzz: ${runs} layouts (${FLOORS} Burrow floors + ${JOBS.length - FLOORS} zone dungeon floors, x ${SEEDS} seeds)`);
const keys = Object.keys(fails);
if (!keys.length) console.log('PASS: no generator problems found');
for (const k of keys) console.log(`FAIL ${k}: ${fails[k].n}x  e.g. ${fails[k].ex.join(' | ')}`);
process.exit(keys.length ? 1 : 0);
