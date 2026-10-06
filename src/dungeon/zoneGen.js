// Zone dungeon floors (docs/ZONES.md §4 and §8.2 as built; ROADMAP Z-C2, Z-C3). Pure (no three.js): tools/qa/gen-fuzz.mjs
// runs it in node. gen.js generate() hands a zone plan (dungeon/defs.js floorPlan: plan.layout === 'zone') to
// generateZone, and the result has the Burrow layout's shape, so DungeonMode, DungeonWorld and roomDressing run it.
//
//   floor 1   ~9 cave chambers: the arrival, a treasure room (a gold chest and its champion guards), a buff shrine, two
//             objective slots (rooms with a cage spot and a guard pack: phase D's rescues), camps; the stairs in the
//             room farthest from the arrival (by walking distance).
//   floor 2   ~8 chambers, then the boss arena at the far end: an authored round room (radius plan.arenaR, ~17 m) reached
//             through one straight approach corridor from the nearest chamber. L.arena = { x, z, r } (world metres:
//             the region bosses read it, as outdoors), L.arenaMouth = where that corridor enters the ring (the seal).
//
// Density (ZONES §4: about 120–160 monsters a floor at tier 0): every chamber but the arrival holds 1–3 packs of
// 8–16 in a cluster formation (spawn.r = the cluster radius, 2–4 m: the members fill a disc, DungeonMode's zone run
// lays them out), a few smaller packs hold the wider corridor bends, and the counts are evened out to the floor's
// target. Elites stay rare: 2 champion packs (one guards the treasure) and 1 unique pack a floor. Packs that may carry
// a quest drop are marked (spawn.mark: 'champion' | 'unique'); slot rooms carry spawn.guard = the slot index.
import { RNG, Noise, clamp } from '../core/util.js';

const CELL = 2; // (= gen.js CELL: kept local so gen.js can import this module without a cycle)
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** One zone floor → a layout (gen.js generate's shape plus arena, arenaMouth, slots, zone: true). TH = the theme. */
export function generateZone({ floor = 1, seed = 1, plan, TH = {} }) {
  const rng = new RNG(seed * 7919 + floor * 104729 + 31);
  const noise = new Noise(seed * 3 + floor * 13 + 7);
  const boss = plan.boss || null, depth = plan.depth ?? floor;
  const wob = TH.wobble ?? 0.8;
  const want = plan.rooms ?? (boss ? 8 : 9);
  const W = plan.size ?? (boss ? 84 : 76), H = W;
  const grid = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : grid[y * W + x];
  const set = (x, y, v = 1) => { if (x > 1 && y > 1 && x < W - 2 && y < H - 2) grid[y * W + x] = v; };
  // ---- the arena (boss floor) goes first, in a corner; the arrival in the opposite one
  const corner = rng.int(0, 3), cx0 = corner & 1, cy0 = corner >> 1;
  let arena = null;
  const RA = plan.arenaR ? plan.arenaR / CELL : 8.5;
  if (boss) {
    const m = Math.ceil(RA) + 4;
    const ax = cx0 ? W - m - rng.int(0, 3) : m + rng.int(0, 3), ay = cy0 ? H - m - rng.int(0, 3) : m + rng.int(0, 3);
    arena = { cx: ax, cy: ay, R: RA };
  }
  const rooms = [];
  const fits = (x, y, w, h, gap = 3) => {
    if (x < 3 || y < 3 || x + w > W - 4 || y + h > H - 4) return false;
    if (rooms.some(r => x < r.x + r.w + gap && x + w + gap > r.x && y < r.y + r.h + gap && y + h + gap > r.y)) return false;
    if (arena) { const qx = clamp(arena.cx, x, x + w), qy = clamp(arena.cy, y, y + h); if (Math.hypot(qx - arena.cx, qy - arena.cy) < arena.R + 4) return false; }
    return true;
  };
  // the arrival: a modest chamber in the corner opposite the arena (floor 1: a random corner)
  {
    const sc = boss ? 3 - corner : rng.int(0, 3), sx = sc & 1, sy = sc >> 1;
    for (let t = 0; t < 200 && !rooms.length; t++) {
      const w = rng.int(7, 8), h = rng.int(7, 8);
      const x = sx ? W - w - 4 - rng.int(0, 8) : 4 + rng.int(0, 8), y = sy ? H - h - 4 - rng.int(0, 8) : 4 + rng.int(0, 8);
      if (fits(x, y, w, h)) rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), kind: 'start' });
    }
  }
  for (let tries = 0; rooms.length < want && tries < 1600; tries++) {
    const big = rng.chance(0.45), w = big ? rng.int(11, 14) : rng.int(8, 11), h = big ? rng.int(10, 13) : rng.int(8, 11);
    const x = rng.int(3, W - w - 4), y = rng.int(3, H - h - 4);
    if (!fits(x, y, w, h, tries > 900 ? 2 : 3)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), kind: 'normal' });
  }
  // ---- carve the chambers: a rounded body plus a lobe or two, with a noisy (cave) rim; it stays inside the room's box
  for (const r of rooms) {
    const blobs = [{ x: r.x + r.w / 2, y: r.y + r.h / 2, rx: r.w / 2 - 0.3, ry: r.h / 2 - 0.3 }];
    if (r.kind !== 'start') for (let k = 0, n = r.w * r.h > 90 ? 2 : 1; k < n; k++) {
      const a = rng.next() * Math.PI * 2, rx = r.w * rng.range(0.24, 0.34), ry = r.h * rng.range(0.24, 0.34);
      blobs.push({ x: clamp(r.x + r.w / 2 + Math.cos(a) * r.w * 0.3, r.x + rx, r.x + r.w - rx), y: clamp(r.y + r.h / 2 + Math.sin(a) * r.h * 0.3, r.y + ry, r.y + r.h - ry), rx, ry });
    }
    r.blobs = blobs;
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      let d = 9;
      for (const b of blobs) { const dx = (x + 0.5 - b.x) / b.rx, dy = (y + 0.5 - b.y) / b.ry; d = Math.min(d, Math.hypot(dx, dy)); }
      d += noise.n2(x * 0.35, y * 0.35) * wob * 0.16;
      if (d < 1) set(x, y);
    }
  }
  // ---- the arena: a clean circle (an authored room), its rim smoothed by the wall tracer
  if (arena) for (let y = Math.floor(arena.cy - arena.R) - 1; y <= arena.cy + arena.R + 1; y++) for (let x = Math.floor(arena.cx - arena.R) - 1; x <= arena.cx + arena.R + 1; x++) {
    if (Math.hypot(x + 0.5 - (arena.cx + 0.5), y + 0.5 - (arena.cy + 0.5)) < arena.R) set(x, y);
  }
  // ---- connect: MST (Prim) + a loop or two; corridors 3–4 cells wide with a gentle wander
  const edges = [], inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.has(j)) continue;
      const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy);
      if (!best || d < best.d) best = { i, j, d };
    }
    inTree.add(best.j); edges.push([best.i, best.j]);
  }
  for (let k = 0; k < Math.max(1, Math.floor(rooms.length / 4)); k++) {
    const i = rng.int(1, rooms.length - 1), j = rng.int(1, rooms.length - 1);
    if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i)) && Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy) < W * 0.55) edges.push([i, j]);
  }
  const deg = rooms.map(() => 0); for (const [a, b] of edges) { deg[a]++; deg[b]++; }
  const carveDisc = (cx, cy, hw) => { const R = Math.ceil(hw); for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) if (ox * ox + oy * oy <= hw * hw + 0.6) set(cx + ox, cy + oy); };
  // (corridors keep clear of the arena: the approach must stay its only way in. An L whose elbow would graze the ring
  // takes the other elbow, or detours round the ring's inner side.)
  const keep = arena ? arena.R + 4.6 : 0;
  const grazes = (a, b, hf) => {
    if (!arena) return false;
    const seg = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, t = clamp(((arena.cx - x0) * dx + (arena.cy - y0) * dy) / L2, 0, 1); return Math.hypot(x0 + dx * t - arena.cx, y0 + dy * t - arena.cy) < keep; };
    return hf ? seg(a.cx, a.cy, b.cx, a.cy) || seg(b.cx, a.cy, b.cx, b.cy) : seg(a.cx, a.cy, a.cx, b.cy) || seg(a.cx, b.cy, b.cx, b.cy);
  };
  const corridor = (a, b, depth = 0) => {
    let x = a.cx, y = a.cy;
    let horizFirst = rng.chance(0.5); const wofs = rng.range(0, 100), hw = rng.chance(0.4) ? 1.6 : 1.2;
    if (grazes(a, b, horizFirst)) {
      if (!grazes(a, b, !horizFirst)) horizFirst = !horizFirst;
      else if (depth < 2) { // round the ring: via the point on a wider circle, on the side away from the map's corner
        const ma = Math.atan2((a.cy + b.cy) / 2 - arena.cy, (a.cx + b.cx) / 2 - arena.cx), via = { cx: Math.round(clamp(arena.cx + Math.cos(ma) * (keep + 3), 3, W - 4)), cy: Math.round(clamp(arena.cy + Math.sin(ma) * (keep + 3), 3, H - 4)) };
        corridor(a, via, depth + 1); corridor(via, b, depth + 1); return;
      }
    }
    const carve = (cx, cy) => carveDisc(cx, cy, hw + (noise.n2(cx * 0.2 + wofs, cy * 0.2) > 0.35 ? 0.5 : 0));
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y + Math.round(noise.n2(x * 0.12, wofs) * 1.4)); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x + Math.round(noise.n2(wofs, y * 0.12) * 1.4), y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  for (const [i, j] of edges) corridor(rooms[i], rooms[j]);
  // (and a last guard: the ring's own wall band is solid before the approach cuts the one way in)
  if (arena) for (let y = Math.floor(arena.cy - arena.R) - 3; y <= arena.cy + arena.R + 3; y++) for (let x = Math.floor(arena.cx - arena.R) - 3; x <= arena.cx + arena.R + 3; x++) {
    const dd = Math.hypot(x + 0.5 - (arena.cx + 0.5), y + 0.5 - (arena.cy + 0.5));
    if (dd >= arena.R && dd < arena.R + 1.4 && x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = 0;
  }
  // ---- the approach: one straight, wide corridor from the nearest chamber into the arena (the only way in)
  let approach = null, mouth = null;
  if (arena) {
    let bi = 1, bd = 1e9;
    for (let i = 1; i < rooms.length; i++) { const d = Math.hypot(rooms[i].cx - arena.cx, rooms[i].cy - arena.cy); if (d < bd) { bd = d; bi = i; } }
    approach = rooms[bi]; approach.kind = 'approach';
    const dx = approach.cx - arena.cx, dy = approach.cy - arena.cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    for (let s = arena.R - 1; s <= L; s += 0.5) carveDisc(Math.round(arena.cx + ux * s), Math.round(arena.cy + uy * s), 1.6);
    mouth = { cx: Math.round(arena.cx + ux * (arena.R + 0.2)), cy: Math.round(arena.cy + uy * (arena.R + 0.2)), ux, uy };
  }
  // ---- smooth: no single-cell pillars or holes (as gen.js); then keep only what the arrival can reach
  for (let it = 0; it < 2; it++) {
    const copy = grid.slice();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      let n = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox || oy) n += copy[(y + oy) * W + x + ox];
      if (copy[y * W + x] === 0 && n >= 6) grid[y * W + x] = 1;
      if (copy[y * W + x] === 1 && n <= 1) grid[y * W + x] = 0;
    }
  }
  const start = rooms[0];
  const reach = bfs(grid, W, H, start.cx, start.cy);
  for (let i = 0; i < W * H; i++) if (reach[i] < 0) grid[i] = 0;
  // ---- room ownership (0 = corridor, i + 1 = rooms[i]; the arena is the last room)
  if (arena) rooms.push({ x: Math.floor(arena.cx - arena.R), y: Math.floor(arena.cy - arena.R), w: Math.ceil(arena.R * 2) + 1, h: Math.ceil(arena.R * 2) + 1, cx: arena.cx, cy: arena.cy, kind: 'boss', arena: true });
  const roomId = new Uint8Array(W * H);
  rooms.forEach((r, i) => {
    r.id = i + 1;
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const k = y * W + x; if (grid[k] && !roomId[k] && (!r.arena || Math.hypot(x + 0.5 - (arena.cx + 0.5), y + 0.5 - (arena.cy + 0.5)) < arena.R + 0.6)) roomId[k] = i + 1; }
  });
  const cellsOf = r => { const out = []; for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (at(x, y) && roomId[y * W + x] === r.id) out.push([x, y]); return out; };
  // distance to the nearest wall cell (8-neighbour BFS, capped), for placement
  const wd = wallDist(grid, W, H);
  // ---- roles: the stairs in the farthest chamber by walking distance; treasure in a dead end; a shrine; two slots
  const walk = bfs(grid, W, H, start.cx, start.cy);
  const camps = rooms.filter(r => r.kind === 'normal');
  let far = null;
  if (!boss) { for (const r of camps) if (!far || walk[r.cy * W + r.cx] > walk[far.cy * W + far.cx]) far = r; if (far) far.kind = 'stairs'; }
  const pickRoom = (pred, score) => { let best = null, bs = -1e9; for (const r of rooms) if (r.kind === 'normal' && pred(r)) { const s = score(r); if (s > bs) { bs = s; best = r; } } return best; };
  const leaf = r => deg[rooms.indexOf(r)] === 1;
  const treasure = pickRoom(r => leaf(r) || true, r => (leaf(r) ? 50 : 0) + walk[r.cy * W + r.cx] * 0.2 + rng.next() * 10);
  if (treasure && !boss) treasure.kind = 'treasure';
  else if (treasure && boss && rng.chance(0.5)) treasure.kind = 'treasure'; // (floor 2: half the time a second hoard)
  const shrine = pickRoom(() => true, () => rng.next()); if (shrine) shrine.kind = 'shrine';
  const nSlots = plan.slots ?? 2, slotRooms = [];
  for (let k = 0; k < nSlots; k++) { const r = pickRoom(() => true, r => walk[r.cy * W + r.cx] * 0.05 + rng.next() * 6); if (!r) break; r.kind = 'objective'; slotRooms.push(r); }
  for (const r of rooms) if (r.kind === 'normal') r.kind = 'camp';
  // ---- placement helpers
  const occupied = new Set();
  const free = (x, y, minWd = 2) => at(x, y) && wd[y * W + x] >= minWd && !occupied.has(y * W + x);
  const freeCell = (r, minWd = 2, pred = null) => {
    const cells = cellsOf(r);
    for (let t = 0; t < 60; t++) { const c = cells[Math.floor(rng.next() * cells.length)]; if (c && free(c[0], c[1], minWd) && (!pred || pred(c[0], c[1]))) { occupied.add(c[1] * W + c[0]); return { x: c[0], y: c[1] }; } }
    return null;
  };
  const mouthsOf = r => { const out = []; for (const [x, y] of cellsOf(r)) for (const [ox, oy] of N4) if (at(x + ox, y + oy) && roomId[(y + oy) * W + x + ox] !== r.id) { out.push([x, y]); break; } return out; };
  // decorative centrepieces in some larger chambers (reserved before the packs, as gen.js)
  const centers = [];
  for (const r of rooms) {
    if (r.kind !== 'camp' || r.w < 10 || r.h < 10 || !rng.chance(0.4)) continue;
    let ok = true; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!at(r.cx + dx, r.cy + dy)) ok = false;
    if (!ok) continue;
    centers.push({ x: r.cx, y: r.cy, r: rng.next() });
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) occupied.add((r.cy + dy) * W + r.cx + dx);
  }
  // ---- objective slots: a cage spot against a quiet wall (wall distance 2, off the corridor mouths) + its guard pack
  const slots = [];
  // (a cramped room that can't take a cage hands its slot on to a camp; the second try is less fussy about the wall)
  for (const r of [...slotRooms, ...rng.shuffle(rooms.filter(q => q.kind === 'camp'))]) {
    if (slots.length >= nSlots) { if (r.kind === 'objective') r.kind = 'camp'; continue; }
    const mouths = mouthsOf(r);
    const c = freeCell(r, 2, (x, y) => wd[y * W + x] <= 3 && mouths.every(([mx, my]) => Math.hypot(mx - x, my - y) > 4))
      || freeCell(r, 2, (x, y) => wd[y * W + x] <= 4 && mouths.every(([mx, my]) => Math.hypot(mx - x, my - y) > 2.5));
    if (!c) { r.kind = 'camp'; continue; }
    r.kind = 'objective';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied.add((c.y + dy) * W + c.x + dx);
    slots.push({ room: r.id, x: c.x, y: c.y });
  }
  // ---- packs
  const spawns = [], mlvl = plan.mlvl ?? floor + 1;
  const packAt = (r, minSep, pred = null) => {
    const cells = cellsOf(r);
    for (let t = 0; t < 80; t++) {
      const c = cells[Math.floor(rng.next() * cells.length)]; if (!c) break;
      const [x, y] = c; if (!free(x, y, 3) && !(t > 50 && free(x, y, 2))) continue;
      if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < minSep)) continue;
      if (centers.some(q => Math.hypot(q.x - x, q.y - y) < 3.5)) continue;
      if (pred && !pred(x, y)) continue;
      occupied.add(y * W + x); return { x, y };
    }
    return null;
  };
  for (const r of rooms) {
    if (r.kind === 'start' || r.kind === 'boss') continue;
    const area = cellsOf(r).length;
    let n = clamp(Math.round(area / 58), 1, 3);
    if (r.kind === 'treasure' || r.kind === 'shrine') n = 1;
    for (let p = 0; p < n; p++) {
      const c = packAt(r, 5.2); if (!c) continue;
      spawns.push({ x: c.x, y: c.y, rank: 'normal', count: rng.int(9, 13), room: r.id, kind: r.kind });
    }
    if (r.kind === 'objective') { // the guards stand near the cage
      const s = slots.find(q => q.room === r.id);
      if (s) {
        let g = spawns.filter(q => q.room === r.id).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
        if (!g || Math.hypot(g.x - s.x, g.y - s.y) > 6) { const c = packAt(r, 4, (x, y) => Math.hypot(x - s.x, y - s.y) < 6 && Math.hypot(x - s.x, y - s.y) > 2.2); if (c) { g = { x: c.x, y: c.y, rank: 'normal', count: rng.int(8, 11), room: r.id, kind: r.kind }; spawns.push(g); } }
        if (g) { g.guard = slots.indexOf(s); s.guard = spawns.indexOf(g); }
      }
    }
  }
  // corridor packs on the wider bends (never in the arena's approach)
  const corr = [];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (at(x, y) && !roomId[y * W + x] && wd[y * W + x] >= 2 && !occupied.has(y * W + x)) corr.push([x, y]);
  rng.shuffle(corr);
  const nCorr = clamp(Math.round(rooms.length / 3), 2, 4);
  for (const [x, y] of corr) {
    if (spawns.filter(s => s.kind === 'corridor').length >= nCorr) break;
    if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < 9) || Math.hypot(x - start.cx, y - start.cy) < 12) continue;
    if (arena && Math.hypot(x - arena.cx, y - arena.cy) < arena.R + 6) continue;
    occupied.add(y * W + x);
    spawns.push({ x, y, rank: 'normal', count: rng.int(6, 9), room: 0, kind: 'corridor' });
  }
  // even the counts out to the floor's target (ZONES §4: ~120–160), packs 8–16 (corridors 6–10)
  const [tLo, tHi] = plan.density || [120, 160];
  const target = rng.int(tLo + 10, tHi - 10);
  const lim = s => (s.kind === 'corridor' ? [6, 10] : [8, 16]);
  const total = () => spawns.reduce((a, s) => a + s.count + (s.rank === 'normal' ? 0 : 1), 0);
  for (let guard = 0; guard < 400 && Math.abs(total() - target) > 3; guard++) {
    const up = total() < target, s = spawns[Math.floor(rng.next() * spawns.length)]; if (!s) break;
    const [lo, hi] = lim(s);
    if (up && s.count < hi) s.count++; else if (!up && s.count > lo) s.count--;
    if (guard > 300 && up && spawns.every(q => q.count >= lim(q)[1])) { // still short: one more pack in the roomiest chamber
      const r = rooms.filter(q => q.kind === 'camp').sort((a, b) => cellsOf(b).length - cellsOf(a).length)[0];
      const c = r && packAt(r, 4.2); if (c) spawns.push({ x: c.x, y: c.y, rank: 'normal', count: 8, room: r.id, kind: 'camp' }); else break;
    }
  }
  // elites: 2 champion packs (the treasure's guards first) and 1 unique pack (far from the arrival; floor 2: the approach)
  const roomPacks = spawns.filter(s => s.kind !== 'corridor' && s.guard == null);
  const far2 = (a, b) => walk[b.y * W + b.x] - walk[a.y * W + a.x];
  const tp = roomPacks.find(s => s.kind === 'treasure');
  const uniq = roomPacks.filter(s => s !== tp).sort((a, b) => (b.kind === 'approach') - (a.kind === 'approach') || far2(a, b))[0];
  if (uniq) { uniq.rank = 'unique'; uniq.count = Math.max(8, uniq.count - 1); }
  const champs = [];
  if (tp) champs.push(tp);
  for (const s of rng.shuffle(roomPacks.filter(s => s !== tp && s !== uniq))) { if (champs.length >= 2) break; champs.push(s); }
  for (const s of champs) { s.rank = 'champion'; s.count = Math.max(8, s.count - 2); }
  // quest-drop marks (phase D's { kind: 'drop', from: 'champion' | 'unique' }): a non-treasure champion pack, the unique
  const mc = champs.find(s => s !== tp) || champs[0]; if (mc) mc.mark = 'champion';
  if (uniq) uniq.mark = 'unique';
  // cluster radius: the members fill a disc (2–4 m)
  for (const s of spawns) s.r = clamp(0.62 * Math.sqrt(s.count + 1), 2, 4);
  if (boss && arena) spawns.push({ x: arena.cx, y: arena.cy, boss, rank: 'boss', count: 1, kind: 'boss', room: rooms.length });
  // ---- loot and shrines
  const chests = [], pots = [], shrines = [];
  for (const r of rooms) {
    if (r.kind === 'start' || r.kind === 'boss') continue;
    if (r.kind === 'treasure') { const c = freeCell(r, 2); if (c) chests.push({ ...c, quality: 'gold', mark: true }); }
    else if (rng.chance(0.3)) { const c = freeCell(r, 1); if (c) chests.push({ ...c, quality: 'wood' }); }
    if (r.kind === 'shrine') { const c = freeCell(r, 2); if (c) shrines.push({ ...c, type: rng.pick(['zoomies', 'goodboy', 'lucky', 'sparkle', 'snack']) }); }
    for (let k = 0, np = rng.int(1, 3); k < np; k++) { const c = freeCell(r, 1); if (c) pots.push(c); }
  }
  if (!chests.some(c => c.mark)) { const r = rooms.filter(q => q.kind === 'camp')[0]; const c = r && freeCell(r, 2); if (c) chests.push({ ...c, quality: 'wood', mark: true }); } // (a 'chest' quest drop always has a home)
  const stairs = far ? (freeCell(far, 2) || { x: far.cx, y: far.cy }) : null;
  // ---- lights: a few wall-edge spots per chamber (the kits hang their lanterns there); the arena dresses its own
  const lights = [];
  for (const r of rooms) {
    if (r.kind === 'boss') continue;
    const cells = cellsOf(r);
    for (let k = 0, n = r.kind === 'start' ? 2 : 3; k < n; k++) for (let t = 0; t < 40; t++) {
      const c = cells[Math.floor(rng.next() * cells.length)]; if (!c) break;
      const [x, y] = c, edge = !at(x + 1, y) || !at(x - 1, y) || !at(x, y + 1) || !at(x, y - 1);
      if (edge && !occupied.has(y * W + x) && !lights.some(l => Math.hypot(l.x - x, l.y - y) < 4)) { occupied.add(y * W + x); lights.push({ x, y }); break; }
    }
  }
  // ---- keep-clear zones and the clutter scatter (gen.js's corner / edge / floor props, for DungeonWorld.buildProps)
  const clear = [[start.cx, start.cy, 3.2]];
  if (stairs) clear.push([stairs.x, stairs.y, 1.6]);
  if (arena) clear.push([arena.cx, arena.cy, arena.R + 1.2]);
  for (const s of slots) clear.push([s.x, s.y, 1.5]);
  if (mouth) clear.push([mouth.cx, mouth.cy, 2.5]);
  const cleared = (x, y) => clear.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r);
  const props = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!at(x, y)) continue;
    const k = y * W + x;
    if (occupied.has(k) || cleared(x, y)) continue;
    const wx = (at(x + 1, y) ? 0 : 1) - (at(x - 1, y) ? 0 : 1), wy = (at(x, y + 1) ? 0 : 1) - (at(x, y - 1) ? 0 : 1);
    const nw = (at(x + 1, y) ? 0 : 1) + (at(x - 1, y) ? 0 : 1) + (at(x, y + 1) ? 0 : 1) + (at(x, y - 1) ? 0 : 1);
    const diag = !at(x + 1, y + 1) || !at(x - 1, y - 1) || !at(x + 1, y - 1) || !at(x - 1, y + 1);
    const rid = roomId[k];
    let mo = false;
    for (let oy = -2; oy <= 2 && !mo; oy++) for (let ox = -2; ox <= 2; ox++) { const j = (y + oy) * W + x + ox; if (at(x + ox, y + oy) && roomId[j] !== rid) { mo = true; break; } }
    if (rid && nw >= 2 && (wx || wy) && rng.chance(0.55)) props.push({ x, y, kind: 'corner', r: rng.next(), room: rid, wx, wy, big: !mo });
    else if (nw >= 1 && (wx || wy) && rng.chance(rid ? 0.22 : 0.1)) props.push({ x, y, kind: 'edge', r: rng.next(), room: rid, wx, wy, big: !!rid && !mo && rng.chance(0.5) });
    else if (rid && !nw && !diag && rng.chance(0.02)) props.push({ x, y, kind: 'floor', r: rng.next(), room: rid, wx: 0, wy: 0, big: false });
  }
  const bossRoom = arena ? rooms[rooms.length - 1] : null;
  const L = {
    W, H, grid, roomId, rooms, centers, start: { x: start.cx, y: start.cy }, stairs, bossRoom, boss, spawns, chests, pots, shrines, props, lights,
    floor, mlvl, theme: plan.theme, at, waypoint: null, zone: true, depth, slots,
    arena: arena ? { x: (arena.cx + 0.5) * CELL, z: (arena.cy + 0.5) * CELL, r: arena.R * CELL } : null,
    arenaMouth: mouth ? { x: (mouth.cx + 0.5) * CELL, z: (mouth.cy + 0.5) * CELL, ux: mouth.ux, uz: mouth.uy, cx: mouth.cx, cy: mouth.cy } : null,
  };
  L.packTotal = spawns.reduce((a, s) => a + (s.boss ? 0 : s.count + (s.rank === 'normal' ? 0 : 1)), 0);
  return L;
}

// BFS walking distance (4-neighbour) from a cell; -1 = unreachable
function bfs(grid, W, H, sx, sy) {
  const D = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let h = 0, t = 0;
  if (!grid[sy * W + sx]) return D;
  D[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) {
    const i = q[h++], x = i % W, y = (i / W) | 0;
    for (const [ox, oy] of N4) { const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (grid[j] && D[j] < 0) { D[j] = D[i] + 1; q[t++] = j; } }
  }
  return D;
}
// 8-neighbour distance to the nearest wall cell, capped at 6 (as DungeonWorld.buildInfo)
function wallDist(grid, W, H) {
  const D = new Uint8Array(W * H).fill(255), q = new Int32Array(W * H); let h = 0, t = 0;
  for (let i = 0; i < W * H; i++) if (!grid[i]) { D[i] = 0; q[t++] = i; }
  while (h < t) {
    const i = q[h++], x = i % W, y = (i / W) | 0, d = D[i]; if (d >= 6) continue;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (D[j] > d + 1) { D[j] = d + 1; q[t++] = j; } }
  }
  return D;
}
