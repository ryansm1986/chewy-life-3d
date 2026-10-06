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
  if (L.zone) zoneChecks(L, plan, reach, tag);
}
// zone dungeon floors (dungeon/zoneGen.js; docs/ZONES.md §8.2): density, elites, objective slots, the boss arena
function zoneChecks(L, plan, reach, tag) {
  const packs = L.spawns.filter(s => !s.boss), n = L.packTotal;
  const [lo, hi] = plan.density || [120, 160];
  if (!(n >= lo && n <= hi)) bump('zone floor density outside the plan', `${tag}: ${n} (${lo}-${hi})`);
  if (packs.some(s => s.count < 1 || s.count > 16)) bump('zone pack size outside 1-16', tag);
  const champ = packs.filter(s => s.rank === 'champion').length, uniq = packs.filter(s => s.rank === 'unique').length;
  if (champ > 3 || uniq > 1 || champ + uniq < 1) bump('zone elites not rare (<=3 champion, <=1 unique packs, at least one)', `${tag}: ${champ}c ${uniq}u`);
  const startRoom = L.roomId[L.start.y * L.W + L.start.x];
  if (packs.some(s => L.roomId[s.y * L.W + s.x] === startRoom && startRoom)) bump('zone pack in the arrival chamber', tag);
  if ((L.slots?.length || 0) < (plan.slots ?? 2)) bump('zone floor short of objective slots', `${tag}: ${L.slots?.length}`);
  for (const s of L.slots || []) {
    if (!L.at(s.x, s.y) || !reach[s.y * L.W + s.x]) bump('objective slot off the floor / unreachable', `${tag} @${s.x},${s.y}`);
    if (s.room === startRoom) bump('objective slot in the arrival chamber', tag);
    if (!(s.guard >= 0) || !L.spawns[s.guard] || L.spawns[s.guard].guard !== L.slots.indexOf(s)) bump('objective slot without its guard pack', tag);
  }
  if (!L.chests.some(c => c.mark)) bump('zone floor without its marked (treasure) chest', tag);
  if (plan.boss) {
    const A = L.arena, M = L.arenaMouth;
    if (!A || !M) { bump('boss floor without its arena / mouth', tag); return; }
    if (L.stairs) bump('boss floor with stairs', tag);
    if (Math.abs(A.r - plan.arenaR) > 0.01) bump('arena radius off the plan', `${tag}: ${A.r}`);
    const ac = { x: Math.floor(A.x / CELL), y: Math.floor(A.z / CELL) };
    if (!reach[ac.y * L.W + ac.x]) bump('arena centre unreachable', tag);
    const b = L.spawns.find(s => s.boss); if (!b || Math.hypot((b.x + 0.5) * CELL - A.x, (b.y + 0.5) * CELL - A.z) > CELL * 1.5) bump('boss not at the arena centre', tag);
    if (packs.some(s => Math.hypot((s.x + 0.5) * CELL - A.x, (s.y + 0.5) * CELL - A.z) < A.r + 1)) bump('a pack inside the arena', tag);
    // one way in: every floor cell just outside the ring lies at the mouth (the approach corridor)
    const R = A.r / CELL, cx = A.x / CELL, cy = A.z / CELL;
    for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
      const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dd < R + 0.8 || dd > R + 1.8 || !L.at(x, y)) continue;
      if (Math.hypot(x - M.cx, y - M.cy) > 3.2) { bump('arena has a second way in', `${tag} @${x},${y}`); break; }
    }
  } else if (L.arena) bump('arena on a non-boss floor', tag);
}
console.log(`gen-fuzz: ${runs} layouts (${FLOORS} Burrow floors + ${JOBS.length - FLOORS} zone dungeon floors, x ${SEEDS} seeds)`);
const keys = Object.keys(fails);
if (!keys.length) console.log('PASS: no generator problems found');
for (const k of keys) console.log(`FAIL ${k}: ${fails[k].n}x  e.g. ${fails[k].ex.join(' | ')}`);
process.exit(keys.length ? 1 : 0);
