// Default furnishings (docs/HOUSING.md §2): what a house holds the first time it's entered (old saves have no
// `interior` on their building records). Deterministic presets per layout and, for the named villagers' homes, per
// owner: a personality layout that matches their sheet and likes (actors/roster.js `home`). A villager's own pieces are
// marked `own: 1`: you can move them around their home, but not take them.
import { DEFAULT_WALL, DEFAULT_FLOOR, FURNITURE } from './furniture.js';
import { layoutFor, LAYOUTS } from './rooms.js';
import { canPlace } from './placement.js';

const F = (id, x, z, rot = 0) => ({ id, mount: FURNITURE[id]?.mount === 'rug' ? 'rug' : FURNITURE[id]?.mount === 'ceiling' ? 'ceiling' : 'floor', x, z, rot });
const W = (id, side, x, z, y) => ({ id, mount: 'wall', side, x, z, y });
const T = (id, onIdx, x, z, rot = 0) => ({ id, mount: 'table', onIdx, x, z, rot });

// Chewy's cottage (L1, 6 x 5 m): the bed in the north-west corner with the treasure chest at its foot, Shadow's
// basket under the round window, the kitchen corner (tiles, counter, stove, plate rack) in the north-east, and the
// chabudai on the rag rug with two cushions, a tea set and a paper pendant over it; the workbench along the west wall
// by the door, with an andon lamp.
const COTTAGE1 = [
  F('futonBed', 0, 0), F('treasureChest', 1, 3), F('pupBasket', 4, 0),
  F('tileMat', 8, 0), F('kitchenCounter', 8, 0), F('kitchenStove', 10, 0), W('plateRack', 'n', 8, 0, 1.25),
  F('ragRug', 4, 4), F('chabudai', 5, 5), F('zabutonPink', 4, 6), F('zabutonPink', 6, 7), T('teaSet', 8, 5, 5),
  F('paperPendant', 5, 5), F('andonLamp', 2, 8), W('cuckooClock', 'w', 0, 1, 1.15), W('wallShelf', 'n', 1, 0, 1.35),
  F('workbench', 0, 6, 3),
];
// a plain home (no owner: townsfolk homes are never entered, but a building without an owner still has a default)
const HOME1 = [F('futonBed', 0, 0), F('ragRug', 4, 4), F('chabudai', 5, 5), F('zabutonBlue', 5, 7), F('andonLamp', 0, 8), F('tansu', 8, 0)];

// ---------------------------------------------------------------- the villagers' homes (L1: 6 x 5 m, door south at 5)
// (windows: north at x 2-3 and 8-9, west at z 3-4; the cells inside the door, x 5-6 z 8-9, stay clear). Each home is
// 10-14 pieces in two or three clusters against the walls and in the corners — a bed, their own corner, somewhere to
// sit — with a rug under a cluster, a light and a thing or two on the walls; the middle stays a clear walkway from the
// door. They rate about three stars: what's missing is a set bonus, a second lamp or a favourite piece, not furniture.
const OWNER1 = {
  // Kuma: a baking corner (stove and counter on the tiles, the bread shelf, flour), a dining table under a pendant,
  // and a squashy armchair on a rug with a lamp, under the cuckoo clock
  kuma: [
    F('tileMat', 0, 0), F('kitchenStove', 0, 0), F('kitchenCounter', 2, 0), T('fruitBowl', 2, 2, 0), F('breadShelf', 4, 0), F('flourSacks', 6, 0),
    F('futonBed', 8, 0), F('woodTable', 8, 5), F('woodChair', 8, 7, 2), F('paperPendant', 9, 5),
    F('ragRug', 0, 5), F('armchair', 0, 5, 3), F('andonLamp', 0, 8), W('cuckooClock', 'w', 0, 6, 1.1),
  ],
  // Mochi: an artist's corner by the window light (the easel, paint pots on a side table, the cat tower), her bed, and
  // a tea corner on a rug with her painting of the pack on the wall
  mochi: [
    F('futonBed', 0, 0), F('artEasel', 8, 1), F('sideTable', 10, 0), T('paintPots', 2, 10, 0), F('catTower', 11, 1), F('pottedFern', 7, 0),
    F('ragRug', 0, 5), F('chabudai', 1, 6), T('teaSet', 7, 1, 6), F('zabutonPink', 0, 6), F('andonLamp', 0, 9),
    W('packPhoto', 'n', 5, 0, 1.3), W('wallShelf', 'w', 0, 5, 1.4),
  ],
  // Usagi: a plant corner (two plant stands, a lucky bamboo, ferns, a hanging basket), her bed, and a flower-table
  // corner on a rug
  usagi: [
    F('futonBed', 0, 0), F('plantStand', 10, 0), F('plantStand', 11, 1), F('bambooPlanter', 11, 0), F('pottedFern', 7, 0), F('hangingPlanter', 10, 2),
    F('ragRug', 0, 5), F('chabudai', 1, 6), T('flowerVase', 7, 1, 6), F('zabutonPink', 0, 6), F('andonLamp', 0, 9),
    W('wallShelf', 'n', 5, 0, 1.4), F('pottedFern', 11, 7),
  ],
  // Kitsune: a shrine corner (the kamidana over a tansu with incense, a fox on each side), an ikebana under a hanging
  // scroll, and a tea corner on a tatami mat with the folding screen standing behind it along the wall
  kitsune: [
    W('kamidana', 'n', 5, 0, 1.5), F('tansu', 5, 0), T('incenseBurner', 1, 5, 0), F('foxStatue', 4, 0), F('foxStatue', 7, 0),
    F('ikebana', 0, 0), W('hangingScroll', 'w', 0, 0, 1.1), F('futonBed', 8, 0),
    F('byobu', 0, 5, 3), F('tatamiMat', 1, 5), F('chabudai', 2, 5), T('teaSet', 10, 2, 5), F('zabutonBlue', 1, 6), F('andonLamp', 1, 8),
  ],
  // Pan: the nap corner (a huge pillow on a tatami mat, a panda plush on a side table, a bamboo lantern), a bamboo
  // corner along the east wall (planters and the bench), and the bed
  pan: [
    F('tatamiMat', 0, 0), F('napPillow', 0, 0), F('sideTable', 2, 0), T('pandaPlush', 2, 2, 0), F('bambooLantern', 3, 1), W('hangingScroll', 'w', 0, 2, 1.1),
    F('bambooPlanter', 11, 0), F('bambooPlanter', 10, 0), F('bambooBench', 11, 2, 1), F('bambooLantern', 11, 5),
    F('futonBed', 0, 6), F('zabutonBlue', 9, 3),
  ],
  // Tanu: a wall of curios (the cabinet, the tanuki statue "portrait", a tansu with a daruma and a lucky cat), the
  // yokai lantern in the corner, and a lounge on a rug under the cuckoo clock
  tanu: [
    F('futonBed', 8, 0), F('curioCabinet', 4, 0), F('tanukiStatue', 6, 0), F('tansu', 0, 0), T('daruma', 3, 0, 0), T('luckyCat', 3, 1, 0), F('yokaiLantern', 11, 4),
    F('ragRug', 0, 5), F('chabudai', 1, 6), T('teaSet', 8, 1, 6), F('zabutonBlue', 0, 6), W('cuckooClock', 'w', 0, 6, 1.15), F('pottedFern', 0, 9),
  ],
  // Kero: a water corner (the lily tub, the fish tank between the windows, glass floats on the wall), the bed, and a
  // lounge on the wave rug with a frog fountain on the table and a shell lamp on a side table
  kero: [
    F('lilyTub', 0, 0), F('fishTank', 4, 0), W('glassFloats', 'n', 4, 0, 1.4), F('futonBed', 8, 0), F('cypressBucket', 6, 0),
    F('waveRug', 0, 6), F('chabudai', 1, 6), T('frogFountain', 6, 1, 6), F('zabutonBlue', 0, 7), F('sideTable', 4, 6), T('shellLamp', 9, 4, 6), F('bambooPlanter', 11, 7),
  ],
};
// L2 (home2: the main room x 0-14, z 4-15, and an alcove x 2-6, z 0-3; windows: the alcove's north wall at x 3-4, the
// main room's north wall at x 10-11, the west wall at z 8-9; the door south at x 9-10). Laid out by hand like L1, in
// the bigger room: the bed in the alcove, a corner piece in the north-west, their own corner along the north wall,
// a lounge on a rug along the west wall by the front, a seat or a table on the east side; the middle and the way in
// from the door (x 7-10 at the front) stay clear.
const OWNER2_RAW = {
  kuma: [
    F('futonBed', 2, 0), F('andonLamp', 6, 0), F('pottedFern', 0, 4), F('woodChair', 0, 6, 1), F('sideTable', 0, 7), T('teaSet', 'sideTable', 0, 7),
    F('flourSacks', 9, 4), F('flourSacks', 10, 4), W('wallShelf', 'n', 8, 4, 1.5), F('tileMat', 11, 4), F('kitchenStove', 13, 4), F('kitchenCounter', 11, 4), T('fruitBowl', 'kitchenCounter', 11, 4), F('breadShelf', 7, 4),
    F('ragRug', 0, 11), F('armchair', 0, 11, 3), F('sideTable', 0, 13), W('cuckooClock', 'w', 0, 12, 1.1),
    F('woodTable', 11, 9), F('woodChair', 11, 11, 2), F('woodChair', 13, 8), F('paperPendant', 12, 9),
    F('tatamiMat', 5, 8), F('chabudai', 6, 8), T('teaSet', 'chabudai', 6, 8), F('zabutonPink', 5, 9), F('zabutonBlue', 8, 8), // (the middle: tea for guests on a tatami mat)
  ],
  mochi: [
    F('futonBed', 2, 0), F('pottedFern', 6, 0), F('catTower', 0, 4), F('andonLamp', 1, 4), F('sideTable', 0, 7), T('flowerVase', 'sideTable', 0, 7),
    F('bookshelf', 8, 4), F('pottedFern', 10, 4), F('artEasel', 11, 5), F('sideTable', 12, 4), T('paintPots', 'sideTable', 12, 4), F('sideTable', 14, 4), T('mushroomLamp', 'sideTable', 14, 4), W('wallShelf', 'n', 7, 4, 1.4), W('packPhoto', 'n', 13, 4, 1.35),
    F('ragRug', 0, 11), F('chabudai', 1, 12), T('teaSet', 'chabudai', 1, 12), F('zabutonPink', 0, 12), F('armchair', 13, 10, 1),
    F('tatamiMat', 4, 7), F('chabudai', 5, 7), T('fruitBowl', 'chabudai', 5, 7), F('zabutonPink', 7, 8), F('acornStool', 4, 7), // (the middle: a snack table on a tatami mat)
  ],
  usagi: [
    F('futonBed', 2, 0), F('plantStand', 6, 0), F('bambooPlanter', 0, 4), F('pottedFern', 1, 4),
    F('plantStand', 7, 4), F('plantStand', 8, 4), F('sideTable', 12, 4), T('succulent', 'sideTable', 12, 4), W('wallShelf', 'n', 13, 4, 1.4), F('hangingPlanter', 12, 6),
    F('ragRug', 0, 11), F('chabudai', 1, 12), T('flowerVase', 'chabudai', 1, 12), F('zabutonPink', 0, 12), F('andonLamp', 0, 15), F('bambooPlanter', 14, 13),
    F('armchair', 13, 9, 1), F('pottedFern', 14, 8),
    F('tatamiMat', 5, 8), F('chabudai', 6, 8), T('succulent', 'chabudai', 6, 8), F('zabutonPink', 5, 9), F('acornStool', 8, 8), // (the middle: a sunny table on a tatami mat)
  ],
  kitsune: [
    F('futonBed', 2, 0), F('andonLamp', 6, 0), F('ikebana', 0, 5), W('hangingScroll', 'w', 0, 5, 1.1),
    W('kamidana', 'n', 12, 4, 1.5), F('tansu', 12, 4), T('incenseBurner', 'tansu', 12, 4), F('foxStatue', 11, 4), F('foxStatue', 14, 4),
    F('byobu', 0, 10, 3), F('tatamiMat', 1, 10), F('chabudai', 2, 10), T('teaSet', 'chabudai', 2, 10), F('zabutonBlue', 1, 11), F('zabutonBlue', 4, 10), F('andonLamp', 1, 13),
    F('bonsaiStand', 14, 9), F('zabutonBlue', 12, 10), F('andonLamp', 14, 12),
    F('ragRug', 5, 7), F('irori', 6, 8), F('zabutonBlue', 5, 8), F('zabutonBlue', 8, 9), // (the middle: the hearth on a round rag rug)
  ],
  pan: [
    F('futonBed', 2, 0), F('bambooLantern', 6, 0), F('bambooPlanter', 0, 4), F('bambooPlanter', 1, 4),
    F('tatamiMat', 11, 4), F('napPillow', 12, 4), F('sideTable', 11, 4), T('pandaPlush', 'sideTable', 11, 4), F('bambooLantern', 14, 6),
    F('bambooBench', 0, 11, 3), W('hangingScroll', 'w', 0, 12, 1.15), F('zabutonBlue', 2, 12), F('bambooPlanter', 14, 12),
    F('chabudai', 12, 9), T('fruitBowl', 'chabudai', 12, 9), F('zabutonPink', 12, 11), F('napPillow', 13, 13),
    F('ragRug', 5, 7), F('chabudai', 6, 8), T('teaSet', 'chabudai', 6, 8), F('zabutonBlue', 5, 8), F('zabutonPink', 8, 9), // (the middle: tea, then a nap)
  ],
  tanu: [
    F('futonBed', 2, 0), F('yokaiLantern', 6, 0), F('tanukiStatue', 0, 4), F('pottedFern', 1, 4),
    F('curioCabinet', 7, 4), F('tansu', 12, 4), T('daruma', 'tansu', 12, 4), T('luckyCat', 'tansu', 13, 4),
    F('ragRug', 0, 11), F('chabudai', 1, 12), T('teaSet', 'chabudai', 1, 12), F('zabutonBlue', 0, 12), W('cuckooClock', 'w', 0, 13, 1.15), F('pottedFern', 14, 13),
    F('treasureChest', 12, 8), F('armchair', 13, 10, 1), F('andonLamp', 14, 9),
    F('tatamiMat', 5, 8), F('taikoDrum', 6, 8), F('zabutonBlue', 5, 9), F('zabutonPink', 8, 8), // (the middle: the festival drum on a tatami mat, of course)
  ],
  kero: [
    F('futonBed', 2, 0), F('andonLamp', 6, 0), F('bambooPlanter', 0, 4),
    F('fishTank', 7, 4), W('glassFloats', 'n', 7, 4, 1.5), F('lilyTub', 12, 4),
    F('ragRug', 0, 11), F('chabudai', 1, 11), T('frogFountain', 'chabudai', 1, 11), F('zabutonBlue', 0, 12), F('sideTable', 3, 13), T('shellLamp', 'sideTable', 3, 13), F('pottedFern', 14, 13),
    F('bambooBench', 14, 8, 1), F('cypressBucket', 12, 10), F('sideTable', 14, 11), T('goldfishBowl', 'sideTable', 14, 11),
    F('waveRug', 5, 7), F('chabudai', 6, 7), T('goldfishBowl', 'chabudai', 6, 7), F('zabutonBlue', 5, 8), F('zabutonBlue', 8, 8), // (the middle: a goldfish to watch)
  ],
};
// L3 (home3: the main room x 10-24, z 0-11 — L2's main room moved ten across and four up — and a second room x 0-9,
// z 2-11 through a doorway in the partition at x 10): L2's main room keeps its clusters in the main room (pieces
// against the west wall that would stand in front of the partition are re-seated by settle), and the alcove's bed
// corner becomes a little bedroom next door with a rug, a lamp, a plant and a picture.
function toL3(list) {
  const out = list.map(it0 => { const it = { ...it0 }; const [dx, dz] = it.z < 4 ? [-1, 2] : [10, -4]; it.x += dx; it.z += dz; return it; });
  // (the bedroom's rug: one the main room doesn't have — never two of the same rug in a home)
  const has = new Set(list.map(it => it.id)), rug = ['tatamiMat', 'ragRug', 'mapleRug', 'waveRug'].find(r => !has.has(r)) || 'tileMat';
  out.push(F(rug, 1, 7), F('zabutonPink', 2, 8), F('andonLamp', 0, 10), F('pottedFern', 8, 2), W('packPhoto', 'w', 0, 8, 1.3));
  return out;
}
/** settle a preset into a layout: anything that doesn't fit where it was put (a window, a wall that isn't there) tries
 *  the nearby spots along its wall or floor, else it's left out (with whatever stood on it) */
function settle(layoutId, list) {
  const L = LAYOUTS[layoutId], placed = [], at = new Map(); // old index -> placed index
  list.forEach((it0, i) => {
    let it = { ...it0 };
    if (it.mount === 'table') { const h = at.get(it.onIdx); if (h == null) return; it.onIdx = h; const host = placed[h]; if (it.x < host.x || it.z < host.z) { it.x = host.x; it.z = host.z; } }
    const tries = [it];
    if (it.mount === 'wall') for (let d = 1; d <= 8; d++) for (const s of [d, -d]) tries.push(it.side === 'n' ? { ...it, x: it.x + s } : { ...it, z: it.z + s });
    else if (it.mount !== 'table') for (let d = 1; d <= 3; d++) for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === d) tries.push({ ...it, x: it.x + dx, z: it.z + dz });
    const pl = placed.map((p, k) => ({ ...p, k: k + 1, on: p.mount === 'table' ? p.onIdx + 1 : undefined }));
    const ok = tries.find(c => c.x >= 0 && c.z >= 0 && canPlace(L, pl, { ...c, k: 999, on: c.mount === 'table' ? c.onIdx + 1 : undefined }).ok);
    if (!ok) return;
    at.set(i, placed.length); placed.push(ok);
  });
  return placed;
}
/** T(id, 'chabudai', …): a tabletop piece on the last chabudai listed before it (string host refs → indexes) */
const hosts = list => list.map((it, i) => (it.mount === 'table' && typeof it.onIdx === 'string' ? { ...it, onIdx: list.slice(0, i).map(o => o.id).lastIndexOf(it.onIdx) } : it));
const OWNER2 = Object.fromEntries(Object.entries(OWNER2_RAW).map(([id, l]) => [id, settle('home2', hosts(l))]));
const OWNER3 = Object.fromEntries(Object.entries(OWNER2_RAW).map(([id, l]) => [id, settle('home3', toL3(hosts(l)))]));
export const OWNER_PRESETS = { home1: OWNER1, home2: OWNER2, home3: OWNER3 };

const PRESETS = { cottage1: COTTAGE1, home1: HOME1 };
// favourite wallpaper / floor of each villager's home
const SURF = { kuma: ['wp_plaster', 'fl_planks'], mochi: ['wp_dots', 'fl_planks'], usagi: ['wp_sakura', 'fl_planks'], kitsune: ['wp_asanoha', 'fl_walnut'], pan: ['wp_wood', 'fl_planks'], tanu: ['wp_wood', 'fl_walnut'], kero: ['wp_waves', 'fl_stone'] }; // (tatami mats on wood, never on a tatami floor)

/** a fresh interior for a building: { v, layout, wall, floor, items } (k ids assigned, table items linked); owner: the
 *  villager whose home it is (their personality layout; their pieces are marked own) */
export function defaultInterior(type, level = 1, owner = null) {
  const L = layoutFor(type, level);
  const mine = owner && OWNER_PRESETS[L.id]?.[owner];
  const list = mine || PRESETS[L.id] || PRESETS[type === 'chewyHouse' ? 'cottage1' : 'home1'] || [];
  const items = list.map((it, i) => ({ k: i + 1, ...it, ...(mine ? { own: 1 } : {}) }));
  for (const it of items) if (it.mount === 'table') { it.on = items[it.onIdx]?.k ?? 0; delete it.onIdx; }
  const [wall, floor] = (mine && SURF[owner]) || [DEFAULT_WALL, DEFAULT_FLOOR];
  return { v: mine ? 2 : 1, layout: L.id, wall, floor, items }; // (v 2: the fuller villager homes of 2026-10-04)
}
