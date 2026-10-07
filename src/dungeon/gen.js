// Procedural burrow layout: organic rooms joined by wobbly corridors (MST + loops), with spawns, loot and props.
import { RNG, Noise } from '../core/util.js';
import { generateZone } from './zoneGen.js';
import { ZONE_THEMES } from './zoneKits/themes.js';
import { layoutMods, resolveRun } from '../rpg/zoneMods.js';

export const CELL = 2; // world units per cell
// kit: which geometry/shader kit renders the biome (defaults to the theme key); sun/sunI: key light colour & strength
export const THEMES = {
  burrow: { name: 'Mossy Burrow', floor: ['#d2bc9e', '#c4ac8c', '#dcc8aa'], wall: ['#9a7658', '#8a684c', '#a88464'], top: ['#8aac6a', '#7a9c5e', '#a0bc7c'], fog: '#2c2230', ambient: ['#b4acd0', '#6a5648'], ambientI: 1.55, sun: '#fff4e4', sunI: 1.2, accent: '#ffe6a8', light: '#ffc88a', lightI: 9, grade: { gain: [1.0, 1.0, 0.98], sat: 1.0, lift: [0.022, 0.014, 0.026] }, monsters: ['mochi', 'dustbunny', 'kinoko', 'mochi', 'dustbunny'], music: 'dungeon', wobble: 0.9 },
  shrine: { name: 'Fox Shrine Tunnels', floor: ['#c08858', '#b07a4c', '#d09a68'], wall: ['#8a5a50', '#7a4c44', '#9a6a5c'], top: ['#7aa060', '#6a9050', '#e86a5a'], fog: '#241418', ambient: ['#c8a0a0', '#3a2424'], accent: '#ff6a4a', light: '#ffae6a', monsters: ['kasa', 'lantern', 'wisp', 'tanuki', 'kasa'], music: 'dungeon', wobble: 0.25, built: true },
  kitchen: { name: "Oni's Kitchen", floor: ['#9a8078', '#8a7068', '#a89088'], wall: ['#6a5048', '#5a4038', '#7a5c50'], top: ['#8a6a5a', '#6a4a40', '#ff9a5a'], fog: '#20100c', ambient: ['#d8a080', '#402018'], accent: '#ff8a3a', light: '#ff9a4a', monsters: ['oni', 'tanuki', 'lantern', 'mochi', 'oni'], music: 'dungeon', wobble: 0.3, built: true },
  crystal: { name: 'Crystal Grotto', floor: ['#9aa6c8', '#8894b8', '#b0bcd8'], wall: ['#5a4a8a', '#4a3c78', '#6a5a9c'], top: ['#a8e8ff', '#c8b8ff', '#ffc8f0'], fog: '#161430', ambient: ['#8a98e0', '#2a2040'], accent: '#ff8ae0', light: '#7ae8ff', monsters: ['wisp', 'kinoko', 'lantern', 'mochi', 'wisp', 'dustbunny'], music: 'dungeon', wobble: 0.8 },
  // Tamamo's lair: the fox-shrine kit re-lit by moonlight (cool silver key light, warm lanterns, blue foxfire)
  moon: { name: 'Moonlit Fox Sanctum', kit: 'shrine', floor: ['#b89878', '#a88a6c', '#c8a888'], wall: ['#5a5a8a', '#4a4a78', '#6a6a9a'], top: ['#6a8a9a', '#5a7a8a', '#bcd8ff'], fog: '#10122a', ambient: ['#98a8f0', '#262440'], ambientI: 1.4, sun: '#c4d4ff', sunI: 1.6, accent: '#bcd8ff', light: '#ffc890', lightI: 9, grade: { gain: [0.97, 1.0, 1.05], sat: 1.05, lift: [0.01, 0.01, 0.03] }, monsters: ['wisp', 'kasa', 'lantern', 'tanuki', 'wisp'], music: 'dungeon', wobble: 0.25, built: true },
  ...ZONE_THEMES, // the zone dungeons' kits (dungeon/zoneKits/themes.js: bamboo shrine caves, ...)
};
// 1-5 burrow (King Mochi) · 6-10 fox shrine (Lord Karakasa) · 11-15 kitchen (Oni Chef) · 16-19 crystal grotto · 20 moonlit sanctum (Tamamo)
export function themeFor(floor) {
  const f = ((floor - 1) % 20);
  return f < 5 ? 'burrow' : f < 10 ? 'shrine' : f < 15 ? 'kitchen' : f < 19 ? 'crystal' : 'moon';
}
export const BOSSES = { 5: 'mochiKing', 10: 'kasaLord', 15: 'oniChef', 20: 'nineTails' };
export function bossFor(floor) { return floor % 5 === 0 ? BOSSES[((floor - 1) % 20) + 1] || 'mochiKing' : null; }

// plan: one floor of a dungeon (dungeon/defs.js floorPlan: { theme, boss, mlvl, waypoint, depth, tier, spirit, mods });
// without one, the Burrow's floor (the old behaviour: the theme and boss by floor, monsters floor + 1, waypoints every 5th
// floor). A tier or modded run's layout effects (pack sizes, extra packs, promotions, chests, shrines: rpg/zoneMods.js
// layoutMods) are applied to the finished floor from their own seeded RNG, so a run without them is the same floor exactly.
export function generate({ floor = 1, seed = 1, plan = null } = {}) {
  const L = generateFloor({ floor, seed, plan });
  const R = plan && (plan.tier || plan.spirit || plan.mods?.length) ? resolveRun(plan) : null;
  if (R?.active) layoutMods(L, { ...plan, runMods: R }, new RNG(seed * 6151 + floor * 2477 + 17));
  return L;
}
function generateFloor({ floor = 1, seed = 1, plan = null } = {}) {
  const rng = new RNG(seed * 7919 + floor * 104729);
  const noise = new Noise(seed + floor * 13);
  const P = plan || { theme: themeFor(floor), boss: bossFor(floor), mlvl: floor + 1, waypoint: floor % 5 === 1 && floor > 1, depth: floor };
  const boss = P.boss || null, depth = P.depth ?? floor;
  const theme = THEMES[P.theme] ? P.theme : themeFor(floor), TH = THEMES[theme];
  if (P.layout === 'zone') return generateZone({ floor, seed, plan: { ...P, theme }, TH }); // a zone dungeon's floor (zoneGen.js)
  // built biomes (shrine / kitchen) get cleaner rooms and straight corridors so fences & brick walls read as architecture
  const wob = TH.wobble ?? 0.9, built = !!TH.built, cr = built ? 1.4 : 2.2;
  const W = boss ? 56 : 64 + Math.min(16, depth * 2), H = W;
  const grid = new Uint8Array(W * H); // 0 wall, 1 floor
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : grid[y * W + x];
  const set = (x, y, v = 1) => { if (x > 1 && y > 1 && x < W - 2 && y < H - 2) grid[y * W + x] = v; };
  const rooms = [];
  const want = boss ? 6 : 9 + Math.min(6, Math.floor(depth / 2));
  let tries = 0;
  while (rooms.length < want && tries++ < 600) {
    const big = rooms.length === 1 && boss;
    const w = big ? 15 : rng.int(6, 11), h = big ? 15 : rng.int(6, 11);
    const x = rng.int(3, W - w - 4), y = rng.int(3, H - h - 4);
    if (rooms.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), kind: 'normal' });
  }
  // carve organic rooms (rounded rect with noisy edge)
  for (const r of rooms) {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const dx = Math.max(0, Math.abs(x + 0.5 - (r.x + r.w / 2)) - (r.w / 2 - cr)), dy = Math.max(0, Math.abs(y + 0.5 - (r.y + r.h / 2)) - (r.h / 2 - cr));
      const d = Math.hypot(dx, dy) + noise.n2(x * 0.35, y * 0.35) * wob;
      if (d < cr) set(x, y);
    }
  }
  // connect rooms: MST (Prim) + a few extra loops
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.has(j)) continue;
      const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy);
      if (!best || d < best.d) best = { i, j, d };
    }
    inTree.add(best.j); edges.push([best.i, best.j]);
  }
  for (let k = 0; k < Math.floor(rooms.length / 3); k++) {
    const i = rng.int(0, rooms.length - 1), j = rng.int(0, rooms.length - 1);
    if (i !== j && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
  }
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = rng.chance(0.5);
    const wofs = rng.range(0, 100);
    const bend = built ? 0 : 1.2;
    const carve = (cx, cy) => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (built || Math.abs(ox) + Math.abs(oy) < 2 || noise.n2(cx * 0.3 + wofs, cy * 0.3) > 0.1) set(cx + ox, cy + oy); };
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y + Math.round(noise.n2(x * 0.15, wofs) * bend)); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x + Math.round(noise.n2(wofs, y * 0.15) * bend), y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  };
  for (const [i, j] of edges) corridor(rooms[i], rooms[j]);
  // smooth: remove single-cell pillars / fill single-cell holes
  for (let it = 0; it < 2; it++) {
    const copy = grid.slice();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      let n = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox || oy) n += copy[(y + oy) * W + x + ox];
      if (copy[y * W + x] === 0 && n >= 6) grid[y * W + x] = 1;
      if (copy[y * W + x] === 1 && n <= 1) grid[y * W + x] = 0;
    }
  }
  // assign room roles: start = room 0, stairs/boss = farthest room
  const start = rooms[0]; start.kind = 'start';
  let far = rooms[1], fd = 0;
  for (const r of rooms) { const d = Math.hypot(r.cx - start.cx, r.cy - start.cy); if (d > fd && r !== start) { fd = d; far = r; } }
  far.kind = boss ? 'boss' : 'stairs';
  const others = rooms.filter(r => r.kind === 'normal');
  rng.shuffle(others);
  if (others[0] && !boss) others[0].kind = 'treasure';
  if (others[1] && rng.chance(0.7)) others[1].kind = 'shrine';
  // free floor cells helper
  const occupied = new Set();
  const freeCell = (r, pad = 1) => {
    for (let t = 0; t < 40; t++) {
      const x = rng.int(r.x + pad, r.x + r.w - 1 - pad), y = rng.int(r.y + pad, r.y + r.h - 1 - pad);
      const k = y * W + x;
      if (at(x, y) && at(x + 1, y) && at(x - 1, y) && at(x, y + 1) && at(x, y - 1) && !occupied.has(k)) { occupied.add(k); return { x, y }; }
    }
    return null;
  };
  // decorative centerpieces in larger rooms (reserved before spawns)
  const centers = [];
  for (const r of rooms) {
    if (r.kind !== 'normal' || r.w < 8 || r.h < 8 || !rng.chance(0.6)) continue;
    let ok = true; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!at(r.cx + dx, r.cy + dy)) ok = false;
    if (!ok) continue;
    centers.push({ x: r.cx, y: r.cy, r: rng.next() });
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) occupied.add((r.cy + dy) * W + r.cx + dx);
  }
  const spawns = [], chests = [], pots = [], shrines = [], props = [];
  const mlvl = P.mlvl ?? floor + 1;
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    if (r.kind === 'boss') { spawns.push({ x: r.cx, y: r.cy, boss, rank: 'boss', count: 1 }); continue; }
    const packs = r.kind === 'treasure' ? 1 : rng.int(1, 2 + (r.w * r.h > 70 ? 1 : 0));
    for (let p = 0; p < packs; p++) {
      const c = freeCell(r, 2); if (!c) continue;
      const roll = rng.next();
      const rank = roll < 0.06 + depth * 0.004 ? 'unique' : roll < 0.2 ? 'champion' : 'normal';
      spawns.push({ x: c.x, y: c.y, rank, count: rank === 'unique' ? rng.int(3, 5) : rank === 'champion' ? rng.int(2, 4) : rng.int(3, 6) });
    }
    if (r.kind === 'treasure') { const c = freeCell(r, 2); if (c) chests.push({ ...c, quality: 'gold' }); }
    else if (rng.chance(0.35)) { const c = freeCell(r, 1); if (c) chests.push({ ...c, quality: 'wood' }); }
    if (r.kind === 'shrine') { const c = freeCell(r, 2); if (c) shrines.push({ ...c, type: rng.pick(['zoomies', 'goodboy', 'lucky', 'sparkle', 'snack']) }); }
    const np = rng.int(1, 4);
    for (let k = 0; k < np; k++) { const c = freeCell(r, 1); if (c) pots.push(c); }
  }
  const stairsCell = far.kind === 'stairs' ? freeCell(far, 2) || { x: far.cx, y: far.cy } : null;
  // waypoint: nearest cell to the start whose whole 3x3 neighbourhood is open floor (never inside rock)
  let waypoint = null;
  if (P.waypoint) {
    const open3 = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!at(x + dx, y + dy)) return false; return true; };
    let best = null, bd = 1e9;
    for (let y = start.y - 1; y <= start.y + start.h; y++) for (let x = start.x - 1; x <= start.x + start.w; x++) {
      const d = Math.abs(x - start.cx - 2) + Math.abs(y - start.cy);
      if ((x !== start.cx || y !== start.cy) && open3(x, y) && d < bd) { bd = d; best = { x, y }; }
    }
    waypoint = best;
  }
  // light sources: a few per room along the walls
  const lights = [];
  for (const r of rooms) {
    const n = r.kind === 'boss' ? 6 : 2;
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 30; t++) {
        const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
        const edge = at(x, y) && (!at(x + 1, y) || !at(x - 1, y) || !at(x, y + 1) || !at(x, y - 1));
        if (edge && !occupied.has(y * W + x)) { occupied.add(y * W + x); lights.push({ x, y }); break; }
      }
    }
  }
  // room ownership per cell (0 = corridor, i + 1 = rooms[i]); used for floor patterns & clutter
  const roomId = new Uint8Array(W * H);
  rooms.forEach((r, i) => {
    r.id = i + 1;
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) { const k = y * W + x; if (at(x, y) && !roomId[k]) roomId[k] = i + 1; }
  });
  // keep-clear zones: arrival (player + exit portal + waypoint), stairs, boss fighting ring
  const clear = [[start.cx, start.cy, 3.2]];
  if (stairsCell) clear.push([stairsCell.x, stairsCell.y, 1.6]);
  if (waypoint) clear.push([waypoint.x, waypoint.y, 1.8]);
  if (boss) clear.push([far.cx, far.cy, 4.6]);
  const cleared = (x, y) => clear.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r);
  // decorative clutter: 'corner' clusters, 'edge' props hugging walls, sparse 'floor' props in open room space.
  // wx/wy point toward the adjacent wall(s); big = may carry a collider (never next to a corridor mouth)
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!at(x, y)) continue;
    const k = y * W + x;
    if (occupied.has(k) || cleared(x, y)) continue;
    const wx = (at(x + 1, y) ? 0 : 1) - (at(x - 1, y) ? 0 : 1), wy = (at(x, y + 1) ? 0 : 1) - (at(x, y - 1) ? 0 : 1);
    const nw = (at(x + 1, y) ? 0 : 1) + (at(x - 1, y) ? 0 : 1) + (at(x, y + 1) ? 0 : 1) + (at(x, y - 1) ? 0 : 1);
    const diag = !at(x + 1, y + 1) || !at(x - 1, y - 1) || !at(x + 1, y - 1) || !at(x - 1, y + 1);
    const rid = roomId[k];
    let mouth = false;
    for (let oy = -2; oy <= 2 && !mouth; oy++) for (let ox = -2; ox <= 2; ox++) { const j = (y + oy) * W + x + ox; if (at(x + ox, y + oy) && roomId[j] !== rid) { mouth = true; break; } }
    if (rid && nw >= 2 && (wx || wy) && rng.chance(0.6)) props.push({ x, y, kind: 'corner', r: rng.next(), room: rid, wx, wy, big: !mouth });
    else if (nw >= 1 && (wx || wy) && rng.chance(rid ? 0.26 : 0.12)) props.push({ x, y, kind: 'edge', r: rng.next(), room: rid, wx, wy, big: !!rid && !mouth && rng.chance(0.55) });
    else if (rid && !nw && !diag && rng.chance(0.028)) props.push({ x, y, kind: 'floor', r: rng.next(), room: rid, wx: 0, wy: 0, big: false });
  }
  return { W, H, grid, roomId, rooms, centers, start: { x: start.cx, y: start.cy }, stairs: stairsCell, bossRoom: boss ? far : null, boss, spawns, chests, pots, shrines, props, lights, floor, mlvl, theme, at, waypoint };
}
