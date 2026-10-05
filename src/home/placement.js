// Furniture placement rules (docs/HOUSING.md §2): pure grid math on a room shell (rooms.js) and an item list,
// node-tested. An interior is { wall, floor, items: [...] } with items:
//   floor / rug / ceiling: { k, id, mount, x, z, rot }        x, z = the min cell of the rotated footprint, rot 0..3
//   table:                 { k, id, mount: 'table', on, x, z, rot }   on = the host's k (an item with a `surface`)
//   wall:                  { k, id, mount: 'wall', side: 'n'|'w', x, z, y }   x, z = the floor cell beside the wall at
//                          the item's first cell along it; y = the item's bottom (m)
// k is a small id unique within the house. rot r turns the item's front (+z) to: 0 south, 1 west, 2 north, 3 east
// (yaw = -r * 90°, as village buildings).
import { FURNITURE, CELL, footprint } from './furniture.js';
import { shellOf, WALL_H, CEIL_H, WALL_MIN } from './rooms.js';

export const WALL_STEP = 0.25; // wall items snap to quarter metres vertically
const key = (x, z) => `${x},${z}`;

/** the cells an item covers on its layer: [[x, z], ...] (wall items: none, see wallSpan) */
export function cellsOf(it) {
  const d = FURNITURE[it.id]; if (!d || it.mount === 'wall') return [];
  const [w, dd] = footprint(d, it.rot || 0), out = [];
  for (let z = it.z; z < it.z + dd; z++) for (let x = it.x; x < it.x + w; x++) out.push([x, z]);
  return out;
}
/** a wall item's rectangle on its wall: { side, line, u0, u1 (cells along), y0, y1 (m) } */
export function wallSpan(it) {
  const d = FURNITURE[it.id]; if (!d) return null;
  const w = d.size[0], h = d.size[1] * CELL;
  return it.side === 'n' ? { side: 'n', line: it.z, u0: it.x, u1: it.x + w, y0: it.y, y1: it.y + h } : { side: 'w', line: it.x, u0: it.z, u1: it.z + w, y0: it.y, y1: it.y + h };
}
/** room-local placement of an item's model origin: { x, y, z, yaw } in metres (y: the floor, a table top, the
 *  ceiling minus the drop, or the wall item's bottom) */
export function poseOf(it, items) {
  const d = FURNITURE[it.id];
  if (it.mount === 'wall') {
    const w = d.size[0] * CELL;
    return it.side === 'n' ? { x: it.x * CELL + w / 2, y: it.y, z: it.z * CELL, yaw: 0 } : { x: it.x * CELL, y: it.y, z: it.z * CELL + w / 2, yaw: Math.PI / 2 };
  }
  const [w, dd] = footprint(d, it.rot || 0);
  let y = 0;
  if (it.mount === 'table') { const h = items?.find(o => o.k === it.on); y = h ? FURNITURE[h.id]?.surface || 0 : 0; }
  else if (it.mount === 'ceiling') y = CEIL_H - d.h;
  return { x: (it.x + w / 2) * CELL, y, z: (it.z + dd / 2) * CELL, yaw: -(it.rot || 0) * Math.PI / 2 };
}
/** a room-local bounding box of a placed item (for picking): [x0, y0, z0, x1, y1, z1] */
export function boxOf(it, items) {
  const d = FURNITURE[it.id], p = poseOf(it, items);
  if (it.mount === 'wall') {
    const w = d.size[0] * CELL, h = d.size[1] * CELL, dep = 0.24;
    return it.side === 'n' ? [p.x - w / 2, p.y, p.z, p.x + w / 2, p.y + h, p.z + dep] : [p.x, p.y, p.z - w / 2, p.x + dep, p.y + h, p.z + w / 2];
  }
  const [w, dd] = footprint(d, it.rot || 0), hw = w * CELL / 2, hd = dd * CELL / 2;
  const h = it.mount === 'rug' ? Math.max(0.04, d.h) : d.h;
  return [p.x - hw, p.y, p.z - hd, p.x + hw, p.y + h, p.z + hd];
}

/** occupancy of an item list: { floor: Map(cell → item), rug, ceil, tops: Map(hostK → Map(cell → item)), wall: [] } */
export function occupancy(items, skip = null) {
  const o = { floor: new Map(), rug: new Map(), ceil: new Map(), tops: new Map(), wall: [] };
  for (const it of items) {
    if (it === skip || (skip && it.mount === 'table' && it.on === skip.k)) continue;
    if (it.mount === 'wall') { o.wall.push({ it, s: wallSpan(it) }); continue; }
    const layer = it.mount === 'rug' ? o.rug : it.mount === 'ceiling' ? o.ceil : it.mount === 'table' ? (o.tops.get(it.on) || o.tops.set(it.on, new Map()).get(it.on)) : o.floor;
    for (const [x, z] of cellsOf(it)) layer.set(key(x, z), it);
  }
  return o;
}

/** Can `it` (a candidate placement) go here? → { ok, why }. `skip`: the item being moved (ignored, with whatever
 *  sits on it). `player`: { x, z } cell the player stands on (they must not be walled in). */
export function canPlace(layout, items, it, { skip = null, player = null, guests = [] } = {}) {
  const S = shellOf(layout), d = FURNITURE[it.id];
  if (!d) return { ok: false, why: 'Unknown item' };
  const occ = occupancy(items, skip);
  if (it.mount === 'wall') {
    const s = wallSpan(it), slots = S.slots[it.side];
    if (!slots) return { ok: false, why: 'Hang it on a back wall' };
    for (let u = s.u0; u < s.u1; u++) if (!slots.has(it.side === 'n' ? key(u, s.line) : key(s.line, u))) return { ok: false, why: 'Not enough wall here' };
    if (s.y0 < WALL_MIN - 1e-6 || s.y1 > WALL_H - 0.15 + 1e-6) return { ok: false, why: 'Too high or too low' };
    for (let u = s.u0; u < s.u1; u++) {
      const w = S.winCells.get(`${it.side}:${it.side === 'n' ? key(u, s.line) : key(s.line, u)}`);
      if (w && s.y0 < w.y + w.h + 0.05 && s.y1 > w.y - 0.05) return { ok: false, why: "There's a window there" };
    }
    for (const o of occ.wall) if (o.s.side === s.side && o.s.line === s.line && o.s.u0 < s.u1 && o.s.u1 > s.u0 && o.s.y0 < s.y1 - 1e-6 && o.s.y1 > s.y0 + 1e-6) return { ok: false, why: 'Something is already hanging there' };
    // tall furniture standing against the wall would cover it
    for (let u = s.u0; u < s.u1; u++) {
      const f = occ.floor.get(it.side === 'n' ? key(u, s.line) : key(s.line, u));
      if (f && !FURNITURE[f.id].walk && FURNITURE[f.id].h > s.y0 + 0.05) return { ok: false, why: `The ${FURNITURE[f.id].name.toLowerCase()} is in the way` };
    }
    return { ok: true };
  }
  const cells = cellsOf(it);
  for (const [x, z] of cells) if (!S.isFloor(x, z)) return { ok: false, why: "That's outside the room" };
  if (it.mount === 'rug') {
    for (const [x, z] of cells) if (S.doorCells.some(c => c[0] === x && c[1] === z)) return { ok: false, why: 'Keep the door mat clear' };
    for (const [x, z] of cells) if (occ.rug.has(key(x, z))) return { ok: false, why: 'Rugs can\'t overlap' };
    return { ok: true };
  }
  if (it.mount === 'ceiling') {
    for (const [x, z] of cells) {
      if (occ.ceil.has(key(x, z))) return { ok: false, why: 'Another lamp hangs there' };
      const f = occ.floor.get(key(x, z));
      if (f && FURNITURE[f.id].h > CEIL_H - d.h - 0.12) return { ok: false, why: `It would bump the ${FURNITURE[f.id].name.toLowerCase()}` };
    }
    return { ok: true };
  }
  if (it.mount === 'table') {
    const host = items.find(o => o.k === it.on && o !== skip);
    const hd = host && FURNITURE[host.id];
    if (!hd?.surface) return { ok: false, why: 'Put it on a table or a shelf' };
    const hc = new Set(cellsOf(host).map(([x, z]) => key(x, z)));
    for (const [x, z] of cells) if (!hc.has(key(x, z))) return { ok: false, why: 'It would fall off!' };
    const top = occ.tops.get(host.k);
    for (const [x, z] of cells) if (top?.has(key(x, z))) return { ok: false, why: 'No room on top' };
    return { ok: true };
  }
  // floor
  for (const [x, z] of cells) {
    if (S.doorKeep.has(key(x, z))) return { ok: false, why: "Don't block the door!" };
    if (occ.floor.has(key(x, z))) return { ok: false, why: 'Something is already here' };
  }
  // tall pieces must not cover a wall item or a window behind them
  for (const o of occ.wall) {
    for (let u = o.s.u0; u < o.s.u1; u++) {
      const c = o.s.side === 'n' ? key(u, o.s.line) : key(o.s.line, u);
      if (cells.some(([x, z]) => key(x, z) === c) && d.h > o.s.y0 + 0.05 && !d.walk) return { ok: false, why: `The ${FURNITURE[o.it.id].name.toLowerCase()} is in the way` };
    }
  }
  for (const [x, z] of cells) {
    const w = S.winCells.get(`n:${key(x, z)}`) || S.winCells.get(`w:${key(x, z)}`);
    if (w && d.h > w.y + 0.1 && !d.walk) return { ok: false, why: 'That would cover the window' };
  }
  // the room must stay walkable: the door, every household job (bed, chest, stove) and the player
  if (!d.walk) {
    const blocked = new Set(occ.floor.keys()); for (const [x, z] of cells) blocked.add(key(x, z));
    for (const [k, f] of occ.floor) if (FURNITURE[f.id].walk) blocked.delete(k);
    const reach = flood(S, blocked);
    if (!reach) return { ok: false, why: "Don't block the door!" };
    const uses = items.filter(o => o !== skip && o.mount === 'floor' && FURNITURE[o.id]?.use);
    if (d.use) uses.push(it);
    for (const u of uses) if (!touches(cellsOf(u), reach)) return { ok: false, why: `You couldn't reach the ${FURNITURE[u.id].name.toLowerCase()}` };
    if (player && !reach.has(key(player.x, player.z)) && !cells.some(([x, z]) => x === player.x && z === player.z)) return { ok: false, why: "You'd be stuck in a corner!" };
    if (player && cells.some(([x, z]) => x === player.x && z === player.z)) return { ok: false, why: "You're standing there!" };
    if (guests.some(g => cells.some(([x, z]) => x === g.x && z === g.z))) return { ok: false, why: 'Someone is standing there!' };
  }
  return { ok: true };
}
// cells reachable from the door mat over free floor; null when the door itself is blocked
function flood(S, blocked) {
  const out = new Set(), q = [];
  for (const [x, z] of S.doorCells) { const k = key(x, z); if (!blocked.has(k)) { out.add(k); q.push([x, z]); } }
  if (!q.length) return null;
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (out.has(k) || blocked.has(k) || !S.isFloor(nx, nz)) continue;
      out.add(k); q.push([nx, nz]);
    }
  }
  return out;
}
const touches = (cells, reach) => cells.some(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => reach.has(key(x + dx, z + dz))));

/** the next free k for an item list */
export const nextK = items => items.reduce((m, it) => Math.max(m, it.k || 0), 0) + 1;
/** the cell in front of an item (where you stand to use it): [x, z] (floor-mount items) */
export function frontCell(it) {
  const d = FURNITURE[it.id], [w, dd] = footprint(d, it.rot || 0), r = (it.rot || 0) % 4;
  const cx = it.x + Math.floor((w - 1) / 2), cz = it.z + Math.floor((dd - 1) / 2);
  return r === 0 ? [cx, it.z + dd] : r === 1 ? [it.x - 1, cz] : r === 2 ? [cx, it.z - 1] : [it.x + w, cz];
}
/** a placed item's unit facing vector in room space */
export function facing(rot = 0) { const r = rot % 4; return r === 0 ? [0, 1] : r === 1 ? [-1, 0] : r === 2 ? [0, -1] : [1, 0]; }
