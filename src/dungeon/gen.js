// Procedural burrow layout: organic rooms joined by wobbly corridors (MST + loops), with spawns, loot and props.
import { RNG, Noise } from '../core/util.js';

export const CELL = 2; // world units per cell
export const THEMES = {
  burrow: { name: 'Mossy Burrow', floor: ['#b58e68', '#a57e5a', '#c49c74'], wall: ['#8a6a58', '#7a5c4c', '#9a7a64'], top: ['#6aa04e', '#5a9044', '#80b45a'], fog: '#2a2038', ambient: ['#6a6aa0', '#3a2a30'], accent: '#8ad0ff', light: '#ffc47a', monsters: ['mochi', 'dustbunny', 'kinoko', 'mochi', 'dustbunny'], music: 'dungeon' },
  crystal: { name: 'Crystal Grotto', floor: ['#9aa6c8', '#8894b8', '#b0bcd8'], wall: ['#5a4a8a', '#4a3c78', '#6a5a9c'], top: ['#a8e8ff', '#c8b8ff', '#ffc8f0'], fog: '#161430', ambient: ['#8a98e0', '#2a2040'], accent: '#ff8ae0', light: '#7ae8ff', monsters: ['kinoko', 'lantern', 'mochi', 'dustbunny', 'wisp'], music: 'dungeon' },
  shrine: { name: 'Fox Shrine Tunnels', floor: ['#c08858', '#b07a4c', '#d09a68'], wall: ['#8a5a50', '#7a4c44', '#9a6a5c'], top: ['#7aa060', '#6a9050', '#e86a5a'], fog: '#241418', ambient: ['#c8a0a0', '#3a2424'], accent: '#ff6a4a', light: '#ffae6a', monsters: ['kasa', 'lantern', 'wisp', 'tanuki', 'kasa'], music: 'dungeon' },
  kitchen: { name: "Oni's Kitchen", floor: ['#9a8078', '#8a7068', '#a89088'], wall: ['#6a5048', '#5a4038', '#7a5c50'], top: ['#8a6a5a', '#6a4a40', '#ff9a5a'], fog: '#20100c', ambient: ['#d8a080', '#402018'], accent: '#ff8a3a', light: '#ff9a4a', monsters: ['oni', 'tanuki', 'lantern', 'mochi', 'oni'], music: 'dungeon' },
};
export function themeFor(floor) {
  const f = ((floor - 1) % 20);
  return f < 5 ? 'burrow' : f < 10 ? 'crystal' : f < 15 ? 'shrine' : 'kitchen';
}
export const BOSSES = { 5: 'mochiKing', 10: 'kasaLord', 15: 'oniChef', 20: 'nineTails' };
export function bossFor(floor) { return floor % 5 === 0 ? BOSSES[((floor - 1) % 20) + 1] || 'mochiKing' : null; }

export function generate({ floor = 1, seed = 1 } = {}) {
  const rng = new RNG(seed * 7919 + floor * 104729);
  const noise = new Noise(seed + floor * 13);
  const boss = bossFor(floor);
  const W = boss ? 56 : 64 + Math.min(16, floor * 2), H = W;
  const grid = new Uint8Array(W * H); // 0 wall, 1 floor
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : grid[y * W + x];
  const set = (x, y, v = 1) => { if (x > 1 && y > 1 && x < W - 2 && y < H - 2) grid[y * W + x] = v; };
  const rooms = [];
  const want = boss ? 6 : 9 + Math.min(6, Math.floor(floor / 2));
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
      const dx = Math.max(0, Math.abs(x + 0.5 - (r.x + r.w / 2)) - (r.w / 2 - 2.2)), dy = Math.max(0, Math.abs(y + 0.5 - (r.y + r.h / 2)) - (r.h / 2 - 2.2));
      const d = Math.hypot(dx, dy) + noise.n2(x * 0.35, y * 0.35) * 0.9;
      if (d < 2.2) set(x, y);
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
    const wob = rng.range(0, 100);
    const carve = (cx, cy) => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (Math.abs(ox) + Math.abs(oy) < 2 || noise.n2(cx * 0.3 + wob, cy * 0.3) > 0.1) set(cx + ox, cy + oy); };
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y + Math.round(noise.n2(x * 0.15, wob) * 1.2)); } };
    const stepY = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x + Math.round(noise.n2(wob, y * 0.15) * 1.2), y); } };
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
  const spawns = [], chests = [], pots = [], shrines = [], props = [];
  const mlvl = floor + 1;
  for (const r of rooms) {
    if (r.kind === 'start') continue;
    if (r.kind === 'boss') { spawns.push({ x: r.cx, y: r.cy, boss, rank: 'boss', count: 1 }); continue; }
    const packs = r.kind === 'treasure' ? 1 : rng.int(1, 2 + (r.w * r.h > 70 ? 1 : 0));
    for (let p = 0; p < packs; p++) {
      const c = freeCell(r, 2); if (!c) continue;
      const roll = rng.next();
      const rank = roll < 0.06 + floor * 0.004 ? 'unique' : roll < 0.2 ? 'champion' : 'normal';
      spawns.push({ x: c.x, y: c.y, rank, count: rank === 'unique' ? rng.int(3, 5) : rank === 'champion' ? rng.int(2, 4) : rng.int(3, 6) });
    }
    if (r.kind === 'treasure') { const c = freeCell(r, 2); if (c) chests.push({ ...c, quality: 'gold' }); }
    else if (rng.chance(0.35)) { const c = freeCell(r, 1); if (c) chests.push({ ...c, quality: 'wood' }); }
    if (r.kind === 'shrine') { const c = freeCell(r, 2); if (c) shrines.push({ ...c, type: rng.pick(['zoomies', 'goodboy', 'lucky', 'sparkle', 'snack']) }); }
    const np = rng.int(1, 4);
    for (let k = 0; k < np; k++) { const c = freeCell(r, 1); if (c) pots.push(c); }
  }
  // decorative props along walls (cells next to walls)
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    if (!at(x, y)) continue;
    const nearWall = !at(x + 1, y) || !at(x - 1, y) || !at(x, y + 1) || !at(x, y - 1);
    const k = y * W + x;
    if (occupied.has(k)) continue;
    if (nearWall && rng.chance(0.16)) props.push({ x, y, kind: 'edge', r: rng.next() });
    else if (!nearWall && rng.chance(0.025)) props.push({ x, y, kind: 'floor', r: rng.next() });
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
  const stairsCell = far.kind === 'stairs' ? freeCell(far, 2) || { x: far.cx, y: far.cy } : null;
  return { W, H, grid, rooms, start: { x: start.cx, y: start.cy }, stairs: stairsCell, bossRoom: boss ? far : null, boss, spawns, chests, pots, shrines, props, lights, floor, mlvl, theme: themeFor(floor), at, waypoint: floor % 5 === 1 && floor > 1 ? { x: start.cx + 2, y: start.cy } : null };
}
