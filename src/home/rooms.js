// Interior room shells (docs/HOUSING.md §1): pure data + grid math, node-tested. Units are 0.5 m cells; cell (0, 0)
// is the north-west corner. The game camera looks from the south-east (yaw 45°), so the NORTH and WEST walls are the
// "back" walls (full height, wallpapered, where wall items hang) and the SOUTH and EAST walls are the "front" walls,
// cut down to a low cap so you always see in. Walls between two rooms are low partitions with an open doorway.
//
// A layout: { id, name, rooms: [{ x, z, w, d }] (floor rectangles), door: { side: 's'|'e', at, w } (a gap in a front
//   wall: cells along it), windows: [{ side: 'n'|'w', at, w, y, h, kind }] (back-wall openings; `at`/`w` in cells
//   along the wall, y/h in metres), partitions: [{ x?, z?, from, to, gap: [a, b] }] (low walls between rooms along a
//   grid line, with a doorway gap), kitchen?: { x, z, w, d } (the cottage's tiled corner, a hint for defaults) }
export const CELL = 0.5;
export const WALL_H = 2.4;   // back walls (m)
export const LOW_H = 0.46;   // the cut-down front walls (m)
export const PART_H = 0.95;  // partitions between rooms (m)
export const CEIL_H = 2.45;  // where ceiling items hang from (m)
export const WAINSCOT = 0.68; // the wood wainscot on the back walls (its rail tops out at 0.72; wall items hang from 0.75)
export const WALL_MIN = 0.75;

export const LAYOUTS = {
  // a villager's home by level (L1 one room 6 x 5 m; L2 7.5 x 6 m plus an alcove; L3 a main room and a second room)
  home1: { id: 'home1', name: 'Cozy room', rooms: [{ x: 0, z: 0, w: 12, d: 10 }], door: { side: 's', at: 5, w: 2 },
    windows: [{ side: 'n', at: 2, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'n', at: 8, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'w', at: 3, w: 2, y: 1.05, h: 0.75, kind: 'round' }] },
  home2: { id: 'home2', name: 'Roomy house', rooms: [{ x: 0, z: 4, w: 15, d: 12 }, { x: 2, z: 0, w: 5, d: 4 }], door: { side: 's', at: 9, w: 2 },
    windows: [{ side: 'n', at: 3, w: 2, y: 1.05, h: 0.75, kind: 'round' }, { side: 'n', at: 10, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'w', at: 8, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }] },
  home3: { id: 'home3', name: 'Grand house', rooms: [{ x: 10, z: 0, w: 15, d: 12 }, { x: 0, z: 2, w: 10, d: 10 }], door: { side: 's', at: 17, w: 2 },
    partitions: [{ x: 10, from: 2, to: 12, gap: [6, 9] }],
    windows: [{ side: 'n', at: 13, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'n', at: 20, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'n', at: 3, w: 2, y: 1.05, h: 0.75, kind: 'round' }, { side: 'w', at: 5, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }] },
  // Chewy's cottage: its own layouts, with the kitchen corner in the north-east (stove, counter, tiles)
  cottage1: { id: 'cottage1', name: "Chewy's Cottage", rooms: [{ x: 0, z: 0, w: 12, d: 10 }], door: { side: 's', at: 7, w: 2 }, kitchen: { x: 8, z: 0, w: 4, d: 3 },
    windows: [{ side: 'n', at: 4, w: 2, y: 1.05, h: 0.75, kind: 'round' }, { side: 'w', at: 4, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }] },
  cottage2: { id: 'cottage2', name: "Chewy's Cottage", rooms: [{ x: 0, z: 4, w: 15, d: 12 }, { x: 0, z: 0, w: 5, d: 4 }], door: { side: 's', at: 10, w: 2 }, kitchen: { x: 11, z: 4, w: 4, d: 3 },
    windows: [{ side: 'n', at: 1, w: 2, y: 1.05, h: 0.75, kind: 'round' }, { side: 'n', at: 7, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'w', at: 9, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }] },
  cottage3: { id: 'cottage3', name: "Chewy's Cottage", rooms: [{ x: 10, z: 0, w: 15, d: 12 }, { x: 0, z: 2, w: 10, d: 10 }], door: { side: 's', at: 18, w: 2 }, kitchen: { x: 21, z: 0, w: 4, d: 3 },
    partitions: [{ x: 10, from: 2, to: 12, gap: [7, 10] }],
    windows: [{ side: 'n', at: 14, w: 2, y: 1.05, h: 0.75, kind: 'round' }, { side: 'n', at: 3, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }, { side: 'w', at: 5, w: 2, y: 1.0, h: 0.8, kind: 'shoji' }] },
};

/** the layout for a building: Chewy's cottage has its own, every other enterable home goes by level */
export function layoutFor(type, level = 1) {
  const L = Math.max(1, Math.min(3, level | 0));
  return LAYOUTS[(type === 'chewyHouse' ? 'cottage' : 'home') + L];
}

// ------------------------------------------------------------------ grid
/** Derived grid of a layout (cached on it): bounds, the floor mask, walls (boundary edges grouped into straight
 *  segments), the door cells, the back-wall slots wall items can use. */
export function shellOf(L) {
  if (L._shell) return L._shell;
  let W = 0, D = 0;
  for (const r of L.rooms) { W = Math.max(W, r.x + r.w); D = Math.max(D, r.z + r.d); }
  const floor = new Uint8Array(W * D);
  for (const r of L.rooms) for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) floor[z * W + x] = 1;
  const isFloor = (x, z) => x >= 0 && z >= 0 && x < W && z < D && floor[z * W + x] === 1;
  // partition edges: { x0, z0, x1, z1 } lines on the grid with a doorway gap (cells along the line)
  const part = new Set();
  for (const p of L.partitions || []) {
    for (let k = p.from; k < p.to; k++) {
      if (k >= p.gap[0] && k < p.gap[1]) continue;
      part.add(p.x != null ? `v${p.x},${k}` : `h${k},${p.z}`);
    }
  }
  // walls: every floor cell edge that faces a non-floor cell; v = vertical line x = const, h = horizontal z = const
  const walls = []; // { side: n|s|w|e, x0, z0, x1, z1 } in cells (a unit edge each, merged below)
  const door = L.door, doorSet = new Set();
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!isFloor(x, z)) continue;
    if (!isFloor(x, z - 1)) walls.push({ side: 'n', x0: x, z0: z, x1: x + 1, z1: z });
    if (!isFloor(x, z + 1)) walls.push({ side: 's', x0: x, z0: z + 1, x1: x + 1, z1: z + 1 });
    if (!isFloor(x - 1, z)) walls.push({ side: 'w', x0: x, z0: z, x1: x, z1: z + 1 });
    if (!isFloor(x + 1, z)) walls.push({ side: 'e', x0: x + 1, z0: z, x1: x + 1, z1: z + 1 });
  }
  // the door: a gap in the southernmost (or easternmost) front wall run at `at`
  let doorCells = [], doorLine = null;
  if (door) {
    if (door.side === 's') {
      let zLine = 0; for (const w of walls) if (w.side === 's' && w.x0 >= door.at && w.x0 < door.at + door.w) zLine = Math.max(zLine, w.z0);
      doorLine = { side: 's', z: zLine, x0: door.at, x1: door.at + door.w };
      for (let x = door.at; x < door.at + door.w; x++) { doorCells.push([x, zLine - 1]); doorSet.add(`s${x},${zLine}`); }
    } else {
      let xLine = 0; for (const w of walls) if (w.side === 'e' && w.z0 >= door.at && w.z0 < door.at + door.w) xLine = Math.max(xLine, w.x0);
      doorLine = { side: 'e', x: xLine, z0: door.at, z1: door.at + door.w };
      for (let z = door.at; z < door.at + door.w; z++) { doorCells.push([xLine - 1, z]); doorSet.add(`e${xLine},${z}`); }
    }
  }
  const unit = walls.filter(w => !doorSet.has(`${w.side}${w.x0},${w.z0}`));
  // merge unit edges into straight runs
  const runs = merge(unit);
  // partitions as runs too (low walls with posts)
  const parts = [];
  for (const p of L.partitions || []) {
    let start = null;
    for (let k = p.from; k <= p.to; k++) {
      const solid = k < p.to && !(k >= p.gap[0] && k < p.gap[1]);
      if (solid && start == null) start = k;
      if (!solid && start != null) { parts.push(p.x != null ? { x0: p.x, z0: start, x1: p.x, z1: k } : { x0: start, z0: p.z, x1: k, z1: p.z }); start = null; }
    }
  }
  // back-wall slots: for wall items, the cells along every north / west run (minus windows)
  const slots = { n: new Map(), w: new Map() }; // key "x,z" of the floor cell beside the wall -> true
  for (const r of runs) {
    if (r.side === 'n') for (let x = r.x0; x < r.x1; x++) slots.n.set(`${x},${r.z0}`, true);
    if (r.side === 'w') for (let z = r.z0; z < r.z1; z++) slots.w.set(`${r.x0},${z}`, true);
  }
  const winCells = new Map(); // "side:x,z" -> window (cells covered along the wall)
  for (const w of L.windows || []) {
    for (let k = w.at; k < w.at + w.w; k++) {
      if (w.side === 'n') { const z = northZ(runs, k); if (z != null) winCells.set(`n:${k},${z}`, w); }
      else { const x = westX(runs, k); if (x != null) winCells.set(`w:${x},${k}`, w); }
    }
  }
  const S = L._shell = { W, D, floor, isFloor, walls: runs, partitions: parts, door: doorLine, doorCells, slots, winCells, windows: L.windows || [] };
  // cells kept free in front of the door (the mat and one row inward)
  S.doorKeep = new Set();
  for (const [x, z] of doorCells) { S.doorKeep.add(`${x},${z}`); if (doorLine?.side === 's') S.doorKeep.add(`${x},${z - 1}`); else S.doorKeep.add(`${x - 1},${z}`); }
  return S;
}
function northZ(runs, x) { for (const r of runs) if (r.side === 'n' && x >= r.x0 && x < r.x1) return r.z0; return null; }
function westX(runs, z) { for (const r of runs) if (r.side === 'w' && z >= r.z0 && z < r.z1) return r.x0; return null; }
function merge(unit) {
  const out = [];
  const by = {};
  for (const w of unit) (by[w.side] ||= []).push(w);
  for (const side of Object.keys(by)) {
    const horiz = side === 'n' || side === 's';
    const list = by[side].sort((a, b) => horiz ? (a.z0 - b.z0 || a.x0 - b.x0) : (a.x0 - b.x0 || a.z0 - b.z0));
    let cur = null;
    for (const w of list) {
      if (cur && (horiz ? cur.z0 === w.z0 && cur.x1 === w.x0 : cur.x0 === w.x0 && cur.z1 === w.z0)) { if (horiz) cur.x1 = w.x1; else cur.z1 = w.z1; }
      else { cur = { ...w }; out.push(cur); }
    }
  }
  return out;
}
/** is this run a back wall (full height, visible from the camera)? */
export const isBack = run => run.side === 'n' || run.side === 'w';
