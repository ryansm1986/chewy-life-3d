// Shared helpers for the zone dungeon kits (dungeon/zoneKits/*.js; docs/ZONES.md §8.2).
//  - addPiece: a world/buildings Builder piece (the region asset kits' lanterns, torii, shrines, bridges...: buckets
//    body / glow / hot / leaf / cloth / water + lights) baked into DungeonWorld's chunked batches. They are the cut-away
//    prop batches (propCutMat: a part standing in front of the hero leaves whole), so a lantern on the camera side never
//    hides him. The pieces' own vertex colours are kept (Batch.addVC).
//  - placer / finishPlacer: the region Placer (regions/assets/bambooKit.js) for the flora that needs the region atlas
//    materials (bamboo stands, ferns, hostas, moss, leaf litter). Its materials are session-long, so the world frees
//    the Placer's batches itself (DungeonWorld.dispose → kit.dispose) before the scene teardown.
//  - topSpan, wall-face frames, the camera-side test and small GLSL / colour helpers.
import * as THREE from 'three';
import { M, col } from '../dungeonWorld.js';
import { Placer } from '../../regions/assets/bambooKit.js';
import { clamp, mulberry32, TAU } from '../../core/util.js';

export const CAMX = Math.SQRT1_2, CAMZ = Math.SQRT1_2, CAM = Math.PI / 4; // toward the (fixed-yaw) dungeon camera; the yaw whose +z faces it
export const CELL = 2;
/** a linear GLSL vec3 literal for a hex colour (as dungeonWorld's glc) */
export const glc = h => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
/** > 0 when (dx, dz) points toward the camera (the camera looks from +x / +z) */
export const toCam = (dx, dz) => dx * CAMX + dz * CAMZ;

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const SOLID = ['body', 'leaf', 'cloth', 'water'], GLOW = ['glow', 'hot'];
/** Bake a Builder piece into the world's cut-away batches at (x, z), turned by rot (yaw), scale s. Lights go to the
 *  world's LightPool (scaled by lightK), each with a soft halo. → the piece's world matrix (a copy) */
export function addPiece(W, pc, x, z, rot = 0, { y = 0, s = 1, rx = 0, rz = 0, lights = true, lightK = 1, halo = 0.55, wall = false, mul = 1 } = {}) {
  if (!pc) return null;
  _m.copy(M(x, y, z, s, s, s, rx, rot, rz));
  const B = wall ? W.wallDeco : W.solid, GL = wall ? W.wallGlow : W.glow;
  for (const k of SOLID) if (pc[k]) B.addVC(pc[k], _m, mul);
  for (const k of GLOW) if (pc[k]) GL.addVC(pc[k], _m);
  if (pc.stone) B.addVC(pc.stone, _m, mul);
  if (lights && pc.lights) for (const l of pc.lights) {
    _v.copy(l.pos).applyMatrix4(_m);
    const c = l.color?.isColor ? l.color : col(l.color || '#ffc27a');
    W.lightPool.addSource({ pos: _v.clone(), color: c.clone(), intensity: (l.intensity ?? 2) * lightK * 2.4, radius: (l.radius ?? 4.5) * 1.15, flicker: l.flicker ?? 0.5 });
    if (halo) W.halos.add(_v.x, _v.y, _v.z, 1.5 * s, '#' + c.getHexString(), halo, 1);
  }
  return _m.clone();
}
/** the kit's flora Placer (created on first use) */
export function placer(W) { return (W.kitPL ||= new Placer({ heightAt: () => 0, name: 'zoneKit' })); }
/** build the Placer into the scene: its colliders, nav blockers stay off (the dungeon grid is the layout's), lights → pool */
export function finishPlacer(W) {
  const PL = W.kitPL; if (!PL) return [];
  const g = PL.build(); W.scene.add(g);
  for (const c of PL.colliders) W.collision.addCircle(c.x, c.z, c.r);
  for (const l of PL.lights) W.lightPool.addSource({ ...l, nightOnly: false, intensity: (l.intensity ?? 3) * 1.6 });
  const out = []; g.traverse(o => { if (o.isMesh) out.push(o); });
  return out;
}
export function disposePlacer(W) { W.kitPL?.dispose(); W.kitPL = null; }

/** the wall-top (kind-3) run of a wall sample's profile → { o0, o1, yAt(o) } or null (as dungeonWorld.dressTops) */
export function topSpan(s) {
  const P = s.P; if (!P) return null; let a = -1, b = -1;
  for (let k = 0; k < P.length; k++) if (P[k][3] === 3) { if (a < 0) a = k; b = k; }
  if (a < 0 || P[b][0] - P[a][0] < 0.45) return null;
  const yAt = o => { for (let k = a; k < b; k++) { const p0 = P[k], p1 = P[k + 1]; if (p1[0] > p0[0] && o >= p0[0] && o <= p1[0]) return p0[1] + (p1[1] - p0[1]) * (o - p0[0]) / (p1[0] - p0[0]); } return P[a][1]; };
  return { o0: P[a][0], o1: P[b][0], yAt };
}
/** wall tops fade toward the void with depth behind the face (dungeonWorld topFade) */
export const topFade = (o, D) => { const b = Math.max(1.5, D + 0.2), t = clamp((o - 0.9) / (b - 0.9)); return 1 - 0.6 * t * t * (3 - 2 * t); };
/** a vertical-gradient painter for Batch.add (c0 at the bottom / shadow side, c1 lit), multiplied by fd */
export const grad = (c0, c1, fd = 1, k0 = 0.8, k1 = 0.1) => (px, py, pz, nx, ny, nz, o) => o.copy(col(c0)).lerp(col(c1), clamp(ny * k0 + k1)).multiplyScalar(fd);
/** a free floor spot for set dressing (walkable, not kept clear, no collider, not claimed by the room dressing) */
export const freeAt = (W, x, z, pad = 0.25) => W.walkable(x, z) && !W.keepClear(x, z) && !W.collision.solidAt(x, z, pad) && !W.noClutterAt?.(x, z);

// ------------------------------------------------------------------ shared kit passes (every zone kit uses these)
/** the decor map at a world point: [lush, path, stream, accent] (0..1) */
export const decoAt = (W, x, z) => W.decoAt(x, z);
/** is (x, z) in the floor's water channel (decor b: the kit's stream / tide channel / melt run)? */
export const inStream = (W, x, z, k = 0.3) => W.decoAt(x, z)[2] > k;
/** a floor decal painted by the world's own builders (as RoomDresser.decal): kind 1 rug, 4 pond, 5 ice, ... */
export function kitDecal(W, kind, x, z, hx, hz, ang, va = 0, extra = [0, 0, 0, 0]) {
  const D = W.decals; if (D.n >= D.A.length) return false;
  const i = D.n++;
  D.A[i].set(x, z, hx, hz); D.B[i].set(kind, ang, W.krng(), va); D.C[i].set(...extra);
  const L = W.L, map = W.decMap.image.data, R = Math.hypot(hx, hz) + 0.7;
  for (let cy = Math.floor((z - R) / CELL); cy <= Math.floor((z + R) / CELL); cy++) for (let cx = Math.floor((x - R) / CELL); cx <= Math.floor((x + R) / CELL); cx++) {
    if (cx < 0 || cy < 0 || cx >= L.W || cy >= L.H) continue;
    const k = (cy * L.W + cx) * 4; if (!map[k]) map[k] = i + 1; else if (!map[k + 1]) map[k + 1] = i + 1;
  }
  W.decMap.needsUpdate = true;
  return true;
}
/**
 * A few bright shafts of light falling through cracks in the cave roof (kit.buildShafts): at most `max` a floor, in
 * chambers of at least `minCells` cells, `planes` narrow god-ray planes each (base alpha a0 + rand * a1: keep the sum of
 * a shaft's planes under ~0.4 so it never washes the screen), a floor pool and a light under each. Spots go to
 * W.kitState.shafts (the kit's update drifts motes in them). opts: { max, chance, minCells, planes, w0, w1, a0, a1,
 * pool, poolR, poolA, light, lightI, lightR, seed }. The colour of every shaft on a floor is the theme accent
 * (lerped to white), so a kit picks it there.
 */
export function roofShafts(W, o = {}) {
  const L = W.L, r = mulberry32(L.floor * 6151 + (o.seed ?? 17)), SB = W.shaftBatch, dist = W.wallDist; let n = 0;
  const { max = 5, chance = 0.58, minCells = 70, planes = 2, w0 = 1.1, w1 = 0.7, a0 = 0.15, a1 = 0.04, pool = '#e6ffd8', poolR = 1.9, poolA = 0.4, light = '#eaffe0', lightI = 5, lightR = 6.5 } = o;
  (W.kitState ||= {}).shafts = [];
  for (const rm of L.rooms) {
    if (rm.kind === 'boss' || rm.kind === 'start' || rm.w * rm.h < minCells || n >= max || r() > chance) continue;
    for (let t = 0; t < 30; t++) {
      const cx = rm.x + 1 + Math.floor(r() * (rm.w - 2)), cy = rm.y + 1 + Math.floor(r() * (rm.h - 2));
      if (!L.at(cx, cy) || L.roomId[cy * L.W + cx] !== rm.id || dist[cy * L.W + cx] < 2) continue;
      const x = (cx + 0.5) * CELL + (r() - 0.5), z = (cy + 0.5) * CELL + (r() - 0.5);
      if (inStream(W, x, z, 0.12)) continue;
      for (let k = 0; k < planes; k++) SB.add(x + (r() - 0.5) * 0.8, z + (r() - 0.5) * 0.8, w0 + r() * w1, 12, 0.24, r() * TAU, 0.14, a0 + r() * a1, r() * 10);
      W.floorGlows.add(x, 0.04, z, poolR, pool, poolA);
      W.lightPool.addSource({ pos: new THREE.Vector3(x, 3.4, z), color: col(light), intensity: lightI, radius: lightR, flicker: 0.05 });
      (W.shaftSpots ||= []).push(new THREE.Vector3(x, 0, z)); W.kitState.shafts.push({ x, z }); n++;
      break;
    }
  }
  return n;
}
/**
 * Spots for mid-scale dressing hugging the walls and corners of every chamber (root tangles, boulders, lantern groups,
 * drifts...): `per` a chamber (`perBig` in big ones), `gap` m apart, `off` m out from the wall line, never at a
 * corridor mouth, in the arena, on the water, on a kept-clear spot or the room dressing's claims; the chambers' middles
 * stay clear for the fight. fn(spot) is called for each: { s (the wall sample: x, z, nx, nz (into the wall), tx, tz,
 * f (> 0 faces the camera), h), x, z, rid, room, corner, far, face (yaw: local +z away from the wall), r (rng) }. A
 * call returning false gives the spot back. → the number placed
 */
export function wallSpots(W, fn, o = {}) {
  const { per = 4, perBig = 6, big = 110, gap = 4.5, off = 0.9, step = [3.5, 3], seed = 11 } = o;
  const r = mulberry32(W.L.floor * 7027 + seed), L = W.L, placed = [], cnt = new Map();
  const roomAt = (x, z) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return L.at(cx, cz) ? L.roomId[cz * L.W + cx] : -1; };
  for (const { S } of W.wallSamples) {
    const n = S.length; let next = r() * 3;
    for (let i = 0; i < n; i++) {
      const s = S[i]; if (s.u < next || s.thick < 1.0) continue;
      const px = s.x - s.nx * off, pz = s.z - s.nz * off, rid = roomAt(px, pz);
      if (rid <= 0) continue;
      const rm = L.rooms[rid - 1]; if (!rm || rm.kind === 'boss' || rm.arena) continue;
      if (roomAt(px + s.tx * 2.5, pz + s.tz * 2.5) !== rid || roomAt(px - s.tx * 2.5, pz - s.tz * 2.5) !== rid) continue;
      if ((cnt.get(rid) || 0) >= (rm.w * rm.h > big ? perBig : per)) continue;
      if (placed.some(q => Math.hypot(q.x - px, q.z - pz) < gap)) continue;
      if (!freeAt(W, px, pz, 0.7) || !freeAt(W, px - s.nx * 0.9, pz - s.nz * 0.9, 0.3) || inStream(W, px, pz, 0.1) || W.keepClear(px, pz, 1.2)) continue;
      const a = S[(i + 4) % n], b = S[(i - 4 + n) % n];
      const spot = { s, x: px, z: pz, rid, room: rm, corner: Math.abs(a.tx * b.tz - a.tz * b.tx) > 0.5, far: s.f > 0.2, face: Math.atan2(-s.nx, -s.nz), r };
      if (fn(spot) === false) continue;
      placed.push({ x: px, z: pz }); cnt.set(rid, (cnt.get(rid) || 0) + 1); next = s.u + step[0] + r() * step[1];
    }
  }
  return placed.length;
}
