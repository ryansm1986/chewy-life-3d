// Furniture meshes (docs/HOUSING.md §2): one cached template per item id (built once with the kit Builder from
// src/home/furnitureModels.js), drawn inside an interior through ONE InstancedMesh per item type and material bucket
// (FurnitureBatches), so a room of 60 placements costs a draw per item type, not per placement.
//  - Templates use the shared building materials (kit MATS(): body / glow / leaf / cloth / water / hot). They are
//    session caches and are NEVER disposed (an interior's teardown frees only its instance buffers).
//  - Local frame of a template (furnitureModels.js): x right, y up, z = the item's front. Floor, rug, table and
//    ceiling items are centred on their footprint with y = 0 at their base (the floor, the table top); ceiling items
//    hang from y = def.h (the cord's top) down to y = 0. Wall items stand on the wall surface (z = 0, front +z) with
//    their bottom centre at the origin.
import * as THREE from 'three';
import { Builder, MATS, G as K, warp } from '../world/buildings/kit.js';
import { merge } from '../gfx/geom.js';
import { FURNITURE, CELL, footprint } from './furniture.js';
import { BUILDERS as B1 } from './furnitureModels.js';
import { BUILDERS2 } from './furnitureModels2.js';
const BUILDERS = { ...B1, ...BUILDERS2 };
import { clamp } from '../core/util.js';

const cache = new Map();
const BUCKETS = ['body', 'glow', 'hot', 'cloth', 'leaf', 'water', 'jet'];
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const CAT_COL = { seating: '#ffb0c8', table: '#e2b988', bed: '#ffd0b0', storage: '#c98f5e', kitchen: '#f0a080', decor: '#8fe0c0', light: '#ffe08a', wall: '#c3b3ff', rug: '#ffbcd6', tabletop: '#ffcf4a' };

// a stand-in when an item has no builder yet: a soft rounded block of its footprint
function placeholder(B, d) {
  const [w, dd] = d.size, W = w * CELL * 0.9, D = d.mount === 'wall' ? 0.08 : dd * CELL * 0.9, H = d.mount === 'wall' ? dd * CELL * 0.8 : Math.max(0.04, d.h);
  const g = K.box(W, H, D, Math.min(0.06, H / 3)); g.translate(0, H / 2, d.mount === 'wall' ? D / 2 : 0);
  B.add(g, CAT_COL[d.cat] || '#ffffff');
}

// painted contact shade near an item's base (gentler than the buildings' groundShade: small things stay bright)
function baseShade(g, d) {
  if (d.mount === 'wall' || d.mount === 'ceiling') return;
  const p = g.attributes.position, c = g.attributes.color, n = g.attributes.normal, H = Math.max(0.12, Math.min(0.45, (d.h || 0.5) * 0.5));
  for (let i = 0; i < p.count; i++) {
    let k = 0.84 + 0.16 * clamp(p.getY(i) / H);
    if (n.getY(i) > 0.6) k *= 1.03;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

/** the cached template of an item → { geos: { bucket: BufferGeometry }, box: Box3 (local), tris } */
export function furnitureTemplate(id) {
  let t = cache.get(id);
  if (t) return t;
  const d = FURNITURE[id];
  if (!d) throw new Error(`[furniture] unknown id ${id}`);
  const B = new Builder(hashStr(id));
  B.id = id; B.detail = 1; B.jitter = 0.025; B.warpAmt = 0.01;
  try { (BUILDERS[id] || placeholder)(B, d); } catch (e) { console.error('[furniture] builder failed', id, e); B.buckets = Object.fromEntries(BUCKETS.map(k => [k, []])); placeholder(B, d); }
  const geos = {};
  for (const k of BUCKETS) {
    const list = B.buckets[k]; if (!list?.length) continue;
    const g = merge(list);
    if (k !== 'jet' && k !== 'water') warp(g, B.seed, B.warpAmt);
    if (k === 'body') baseShade(g, d);
    g.computeBoundingSphere(); g.computeBoundingBox();
    geos[k] = g;
  }
  const box = new THREE.Box3();
  for (const g of Object.values(geos)) box.union(g.boundingBox);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 0.4, 0.2));
  t = { id, geos, box, tris: Object.values(geos).reduce((a, g) => a + g.attributes.position.count / 3, 0), real: !!BUILDERS[id] };
  cache.set(id, t);
  return t;
}
export const hasBuilder = id => !!BUILDERS[id];

/** Live, non-instanced meshes of an item (thumbnails, the decorate ghost, test pages): shared geometry and materials. */
export function furnitureGroup(id) {
  const t = furnitureTemplate(id), M = MATS(), g = new THREE.Group();
  for (const [k, geo] of Object.entries(t.geos)) {
    const m = new THREE.Mesh(geo, M[k]);
    m.castShadow = k !== 'water' && k !== 'jet' && k !== 'hot'; m.receiveShadow = true;
    if (k === 'cloth' || k === 'leaf') m.customDepthMaterial = M[k].userData.depthMat || null;
    g.add(m);
  }
  g.name = `furniture:${id}`;
  return g;
}

/** footprint size in metres after rotation */
export function footMetres(d, rot = 0) { const [w, dd] = footprint(d, rot); return [w * CELL, dd * CELL]; }
