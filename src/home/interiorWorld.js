// An interior room scene (docs/HOUSING.md §1). ONE persistent InteriorWorld serves every house: its scene, the light
// rig (1 hemisphere, 1 shadow-casting key light, the 8-light LightPool: identical to the village's, so no shader
// recompiles), its materials and VFX live for the session; each visit load()s a house (the shell for its layout,
// the furniture batches, colliders, interactables) and unload() frees only that visit's geometry and instance
// buffers. Shared things (the kit's MATS(), furniture templates, surface textures) are never disposed.
// The world interface (as VillageWorld / DungeonWorld): scene, hemi, sun, lightPool, collision, interactables,
// heightAt, walkable, decks, updateSun(focus), update(dt, t), onSky(); for nav (core/nav.js) L.W / L.H + cellToWorld.
// Room cell (i, j) (rooms.js, 0.5 m) sits at world (ORIGIN + i * 0.5, ORIGIN + j * 0.5): positive coordinates.
import * as THREE from 'three';
import { LightPool } from '../core/engine.js';
import { Collision } from '../world/collision.js';
import { makeToon, makeGlow, U } from '../gfx/materials.js';
import { Builder, MATS, G as K, C, shade } from '../world/buildings/kit.js';
import { merge } from '../gfx/geom.js';
import { navFor } from '../core/nav.js';
import { CELL, WALL_H, LOW_H, PART_H, WAINSCOT, shellOf, isBack } from './rooms.js';
import { FURNITURE, SURFACES, DEFAULT_WALL, DEFAULT_FLOOR, footprint } from './furniture.js';
import { poseOf, frontCell } from './placement.js';
import { furnitureTemplate } from './furnitureMesh.js';
import { surfaceTexture } from './surfaces.js';
import { clamp, lerp } from '../core/util.js';

export const ORIGIN = 2;
const T = 0.16;              // wall thickness (m)
const NAV_W = 32, NAV_H = 24; // the nav grid covers this many metres (the biggest layout is 12.5 x 6 m)
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// the interior light by time of day (n = the outdoor night factor 0..1)
const DAY = { sky: '#f4f2ff', gnd: '#dcc0a0', hemi: 1.2, key: '#fff4e2', keyI: 1.7, pane: '#ffefc8', paneI: 1.0 };
const NIGHT = { sky: '#8a7ab0', gnd: '#6a4a58', hemi: 0.72, key: '#a8b8ff', keyI: 0.42, pane: '#3c4c94', paneI: 0.55 };
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixHex = (a, b, t, out) => out.copy(_ca.set(a)).lerp(_cb.set(b), t);

// ------------------------------------------------------------------ furniture batches: one InstancedMesh per item type x bucket
class FurnitureBatches {
  constructor(root) { this.root = root; this.map = new Map(); }
  set(entries) { // entries: [{ id, m: Matrix4 }]
    const by = new Map();
    for (const e of entries) (by.get(e.id) || by.set(e.id, []).get(e.id)).push(e.m);
    const M = MATS();
    for (const [key, b] of this.map) if (!by.has(b.id)) { this.drop(key); }
    for (const [id, list] of by) {
      const t = furnitureTemplate(id);
      for (const [bucket, geo] of Object.entries(t.geos)) {
        const key = id + ':' + bucket;
        let b = this.map.get(key);
        if (b && b.cap < list.length) { this.drop(key); b = null; }
        if (!b) {
          const cap = Math.max(2, 1 << Math.ceil(Math.log2(list.length + 1)));
          const mesh = new THREE.InstancedMesh(geo, M[bucket], cap);
          mesh.castShadow = bucket !== 'water' && bucket !== 'jet' && bucket !== 'hot' && FURNITURE[id]?.mount !== 'ceiling' && FURNITURE[id]?.mount !== 'rug'; mesh.receiveShadow = true; // (a hanging lamp is a light, not a shadow over the room)
          if (bucket === 'cloth' || bucket === 'leaf') mesh.customDepthMaterial = M[bucket].userData.depthMat || null;
          mesh.frustumCulled = false; mesh.name = `furniture:${key}`;
          this.root.add(mesh);
          b = { id, mesh, cap }; this.map.set(key, b);
        }
        for (let i = 0; i < list.length; i++) b.mesh.setMatrixAt(i, list[i]);
        b.mesh.count = list.length; b.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  drop(key) { const b = this.map.get(key); if (!b) return; b.mesh.removeFromParent(); b.mesh.dispose(); this.map.delete(key); }
  clear() { for (const k of [...this.map.keys()]) this.drop(k); }
  get draws() { return this.map.size; }
}

export class InteriorWorld {
  constructor(engine) {
    this.engine = engine; this.isInterior = true;
    const scene = this.scene = new THREE.Scene();
    scene.name = 'interior';
    scene.background = new THREE.Color('#2b2033');
    scene.fog = new THREE.Fog('#2b2033', 60, 120);
    this.hemi = new THREE.HemisphereLight(DAY.sky, DAY.gnd, DAY.hemi); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(DAY.key, DAY.keyI);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    this.sunDir = V(0.42, 1, 0.62).normalize(); // a soft key from the open (camera) side, high: shadows fall to the back walls
    this.lightPool = new LightPool(scene, 8);
    this.collision = new Collision(2); this.collision.blockFn = (x, z) => !this.walkable(x, z);
    this.interactables = [];
    this.decks = [];
    this.L = { W: NAV_W, H: NAV_H };
    this.root = new THREE.Group(); this.root.name = 'interior:room'; scene.add(this.root);
    this.batches = new FurnitureBatches(this.root);
    this.mats = {
      trim: makeToon({ vertexColors: true, brush: 0.16, brushScale: 0.5, rim: 0.28, term: [-0.06, 0.34], shadowSat: 0.35 }),
      pane: makeToon({ vertexColors: true, brush: 0.04, rim: 0.1, emissive: DAY.pane, emissiveIntensity: DAY.paneI }),
      patch: makeGlow({ map: patchTexture(), color: '#ffe6b0', opacity: 0.42 }),
      shaft: makeGlow({ map: shaftTexture(), color: '#fff0c8', opacity: 0.16 }),
    };
    this.mats.patch.depthWrite = false; // (the shell is no x-ray occluder: the low walls only ever hide feet, and the silhouette read as a blob)
    this.surfMats = new Map(); // surface id → material (persistent; the textures are surfaces.js's cache)
    this.own = []; this.sources = []; this.cols = []; this.items = [];
    this.night = 0; this.house = null;
  }
  // ---------------------------------------------------------------- world interface
  cellToWorld(x, y) { return V(x + 0.5, 0, y + 0.5); } // (nav: 1 m "cells" over NAV_W x NAV_H)
  heightAt() { return 0; }
  walkable(x, z) {
    const S = this.S; if (!S) return false;
    if (this.inDoorway(x, z)) return true; // (you can step into the doorway: that's the way out)
    const m = 0.24;
    for (const [dx, dz] of [[-m, -m], [m, -m], [-m, m], [m, m]]) {
      const cx = Math.floor((x + dx - ORIGIN) / CELL), cz = Math.floor((z + dz - ORIGIN) / CELL);
      if (!S.isFloor(cx, cz)) return false;
    }
    return true;
  }
  /** in the door's gap (and a little beyond the wall line): walking in here takes you outside (housing.js) */
  inDoorway(x, z, past = -0.6) {
    const D = this.S?.door; if (!D) return false;
    const lx = x - ORIGIN, lz = z - ORIGIN;
    if (D.side === 's') { const line = D.z * CELL; return lx > D.x0 * CELL + 0.16 && lx < D.x1 * CELL - 0.16 && lz > line + past && lz < line + 0.4; }
    const line = D.x * CELL; return lz > D.z0 * CELL + 0.16 && lz < D.z1 * CELL - 0.16 && lx > line + past && lx < line + 0.4;
  }
  onSky() {}
  updateSun() {
    const c = this.centre || V(8, 0, 6), s = this.sun;
    s.target.position.copy(c); s.position.copy(c).addScaledVector(this.sunDir, 30); s.target.updateMatrixWorld();
    U.uSunDir.value.copy(this.sunDir);
  }
  /** the room's look for the hour: n = the outdoor night factor */
  applyLight(n) {
    this.night = n;
    mixHex(DAY.sky, NIGHT.sky, n, this.hemi.color); mixHex(DAY.gnd, NIGHT.gnd, n, this.hemi.groundColor); this.hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, n);
    mixHex(DAY.key, NIGHT.key, n, this.sun.color); this.sun.intensity = lerp(DAY.keyI, NIGHT.keyI, n);
    mixHex(DAY.pane, NIGHT.pane, n, this.mats.pane.emissive); this.mats.pane.emissiveIntensity = lerp(DAY.paneI, NIGHT.paneI, n);
    const sunny = clamp(1 - n * 1.6);
    this.mats.patch.opacity = 0.42 * sunny; this.mats.shaft.opacity = 0.16 * sunny;
    for (const m of this.sunMeshes || []) m.visible = sunny > 0.02;
  }
  update(dt, t) {
    // dust motes drifting in the window light by day
    if (this.vfx && this.motes?.length && this.night < 0.5) {
      this.moteAcc = (this.moteAcc || 0) + dt * 2.2 * (1 - this.night * 2);
      while (this.moteAcc > 1) {
        this.moteAcc--;
        const m = this.motes[Math.floor(Math.random() * this.motes.length)], k = Math.random();
        const x = m.a.x + (m.b.x - m.a.x) * k + (Math.random() - 0.5) * m.w, z = m.a.z + (m.b.z - m.a.z) * k + (Math.random() - 0.5) * m.w;
        this.vfx.glow.spawn({ x, y: m.a.y + (m.b.y - m.a.y) * k, z, vx: (Math.random() - 0.5) * 0.05, vy: 0.02 + Math.random() * 0.04, vz: (Math.random() - 0.5) * 0.05, life: 3 + Math.random() * 2, size: 0.035 + Math.random() * 0.03, color: '#fff2c8', alpha: 0.75, alpha1: 0, fadeIn: 1, flicker: 2 + Math.random() * 3 });
      }
    }
  }

  // ---------------------------------------------------------------- a visit
  /** Build a house: o = { layout, interior: { wall, floor, items }, name, household (the cottage's jobs), vfx } */
  load(o) {
    this.unload();
    this.house = o; this.layout = o.layout; this.S = shellOf(o.layout); this.vfx = o.vfx || null;
    const S = this.S;
    this.centre = V(ORIGIN + S.W * CELL / 2, 0, ORIGIN + S.D * CELL / 2);
    this.buildShell(o.interior);
    this.setFurniture(o.interior.items);
    this.applyLight(this.night);
    const nav = navFor(this); nav?.build();
    return this;
  }
  unload() {
    this.batches.clear();
    for (const g of this.own) g.dispose();
    this.own.length = 0;
    for (const c of this.root.children.slice()) if (!c.isInstancedMesh) c.removeFromParent();
    for (const s of this.sources) this.lightPool.removeSource(s);
    this.sources.length = 0; this.itemSources = [];
    for (const c of this.cols) this.collision.remove(c);
    this.cols.length = 0; this.itemCols = [];
    this.interactables.length = 0;
    this.items = []; this.house = null; this.S = null; this.sunMeshes = []; this.motes = [];
  }
  // world position of room-local metres
  W(x, z, y = 0) { return V(ORIGIN + x, y, ORIGIN + z); }
  /** the cell under a world point (may be outside the room) */
  cellAt(x, z) { return [Math.floor((x - ORIGIN) / CELL), Math.floor((z - ORIGIN) / CELL)]; }
  cellCentre(cx, cz) { return V(ORIGIN + (cx + 0.5) * CELL, 0, ORIGIN + (cz + 0.5) * CELL); }
  addOwn(geo, mat, { cast = true, receive = true, order = 0, name = '' } = {}) {
    this.own.push(geo);
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = order; m.name = name;
    this.root.add(m); return m;
  }
  surfMat(id) {
    let m = this.surfMats.get(id);
    if (!m) { m = makeToon({ map: surfaceTexture(id).tex, brush: 0.07, brushScale: 0.4, rim: 0.12, term: [-0.1, 0.4], shadowSat: 0.3 }); this.surfMats.set(id, m); }
    return m;
  }

  // ---------------------------------------------------------------- the shell
  buildShell(it) {
    const S = this.S, L = this.layout, wallId = SURFACES[it.wall] ? it.wall : DEFAULT_WALL, floorId = SURFACES[it.floor] ? it.floor : DEFAULT_FLOOR;
    const B = new Builder(9137); B.jitter = 0.03; B.warpAmt = 0; // (straight walls: the wallpaper planes must stay glued to the trim)
    const wp = [], fp = []; // wallpaper / floor quads (positions + uvs)
    const wallT = surfaceTexture(wallId).tile, floorT = surfaceTexture(floorId).tile;
    const quad = (list, a, b, c, d, uv) => list.push({ p: [a, b, c, d], uv });
    const WOOD = '#8f6a52', WOOD_D = '#6b4a3a', WOOD_L = '#c98f5e', PLASTER = '#fff0dc';
    // floor (one quad per room rectangle, uv in metres / tile) and the toy-box plinth under it
    for (const r of L.rooms) {
      const x0 = r.x * CELL, z0 = r.z * CELL, x1 = (r.x + r.w) * CELL, z1 = (r.z + r.d) * CELL;
      quad(fp, [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], u => [u[0] / floorT, -u[2] / floorT]);
      const pl = K.box(x1 - x0 + T * 2 + 0.14, 0.34, z1 - z0 + T * 2 + 0.14, 0.07); pl.translate((x0 + x1) / 2, -0.17 - 0.012, (z0 + z1) / 2);
      B.add(pl, (p, n, o) => o.set(WOOD_D).multiplyScalar(n.y > 0.5 ? 1.22 : 0.92 + 0.08 * Math.sin(p.x * 3 + p.z * 2)));
    }
    // walls
    const winOn = (side, line) => S.windows.filter(w => w.side === side && (side === 'n' ? S.winCells.has(`n:${w.at},${line}`) : S.winCells.has(`w:${line},${w.at}`)));
    const WAIN = WAINSCOT; // the wood wainscot's height on the back walls (wall items hang above its rail: placement.js)
    for (const run of S.walls) {
      const back = isBack(run), H = back ? WALL_H : LOW_H, horiz = run.side === 'n' || run.side === 's';
      const a = (horiz ? run.x0 : run.z0) * CELL, b = (horiz ? run.x1 : run.z1) * CELL, line = (horiz ? run.z0 : run.x0) * CELL;
      // inner normal: n → +z, s → -z, w → +x, e → -x; the wall body sits on the far side of the line
      const sgn = run.side === 'n' || run.side === 'w' ? -1 : 1, mid = line + sgn * T / 2;
      // a box along the wall: u0..u1 along it, y0..y1 up, from depth d0 to d1 off the line (+ into the room)
      const slab = (u0, u1, y0, y1, d0, d1, r = 0.012) => {
        const g = horiz ? K.box(u1 - u0, y1 - y0, Math.abs(d1 - d0), r) : K.box(Math.abs(d1 - d0), y1 - y0, u1 - u0, r);
        const dc = line - sgn * (d0 + d1) / 2;
        if (horiz) g.translate((u0 + u1) / 2, (y0 + y1) / 2, dc); else g.translate(dc, (y0 + y1) / 2, (u0 + u1) / 2);
        return g;
      };
      const holes = back ? winOn(run.side, horiz ? run.z0 : run.x0).map(w => [w.at * CELL, (w.at + w.w) * CELL, w.y, w.y + w.h]) : [];
      // the body: plaster pieces round the window openings, so a window is a real hole through the wall
      for (const [u0, u1, y0, y1] of wallPieces(a, b, H, holes)) B.add(slab(u0, u1, y0, y1, -T, 0, 0.004), (p, n, o) => o.set(PLASTER).multiplyScalar(n.y > 0.5 ? 1.02 : 0.97));
      // the cap beam on top of every wall (the cut-down front walls read as a cross-section)
      const capW = T + 0.08, cap = horiz ? K.box(b - a + 0.02, 0.09, capW, 0.03) : K.box(capW, 0.09, b - a + 0.02, 0.03);
      if (horiz) cap.translate((a + b) / 2, H + 0.035, mid); else cap.translate(mid, H + 0.035, (a + b) / 2);
      B.add(cap, back ? WOOD : WOOD_L);
      if (back) {
        // wainscot: vertical boards in two soft tones with a groove between, a rounded chair rail, a dark skirting
        const bw = 0.2, nb = Math.max(1, Math.round((b - a) / bw)), w0 = (b - a) / nb;
        for (let i = 0; i < nb; i++) {
          const u0 = a + i * w0 + 0.006, u1 = a + (i + 1) * w0 - 0.006, tone = i % 2 ? 0.95 : 1.02;
          B.add(slab(u0, u1, 0.1, WAIN, 0, 0.024, 0.008), (p, n, o) => { o.set(WOOD_L).multiplyScalar(tone * (0.9 + 0.1 * Math.sin((horiz ? p.x : p.z) * 41 + p.y * 3))); if (n.y > 0.5) o.multiplyScalar(1.08); });
        }
        B.add(slab(a, b, 0.1, WAIN, -0.004, 0.012, 0.002), '#7a5442'); // (the grooves: a darker backing)
        B.add(slab(a, b, WAIN - 0.02, WAIN + 0.04, 0, 0.05, 0.02), (p, n, o) => o.set(WOOD).multiplyScalar(n.y > 0.5 ? 1.15 : 1)); // chair rail
        B.add(slab(a, b, 0, 0.12, 0, 0.042, 0.014), WOOD_D); // skirting
        // the head rail (nageshi) and a crown band under the ceiling
        B.add(slab(a, b, 1.98, 2.08, 0, 0.055, 0.018), (p, n, o) => o.set(WOOD).multiplyScalar(n.y > 0.5 ? 1.12 : n.y < -0.5 ? 0.8 : 1));
        B.add(slab(a, b, WALL_H - 0.12, WALL_H, 0, 0.07, 0.02), (p, n, o) => o.set(WOOD_D).multiplyScalar(n.y < -0.5 ? 0.82 : 1));
        // the ceiling joists, cut by the diorama: rounded beam ends on carved brackets
        for (let u = a + 0.9; u < b - 0.35; u += 1.5) {
          const be = slab(u - 0.06, u + 0.06, WALL_H - 0.24, WALL_H - 0.1, 0, 0.3, 0.03);
          B.add(be, (p, n, o) => o.set(WOOD).multiplyScalar(n.y > 0.5 ? 1.15 : n.y < -0.5 ? 0.8 : 0.96));
          const br = slab(u - 0.04, u + 0.04, WALL_H - 0.38, WALL_H - 0.24, 0, 0.12, 0.025);
          B.add(br, WOOD);
          const cap = horiz ? K.box(0.13, 0.15, 0.03, 0.015) : K.box(0.03, 0.15, 0.13, 0.015); const dc = line - sgn * 0.31;
          if (horiz) cap.translate(u, WALL_H - 0.17, dc); else cap.translate(dc, WALL_H - 0.17, u);
          B.add(cap, '#d8a070'); // (the end grain, lighter)
        }
      } else { // a low wall: a skirting inside, and outside a plank skirt
        B.add(slab(a, b, 0, 0.12, 0, 0.035, 0.012), WOOD);
        const os = horiz ? K.box(b - a, 0.1, 0.03, 0.01) : K.box(0.03, 0.1, b - a, 0.01);
        if (horiz) os.translate((a + b) / 2, 0.08, line + sgn * (T + 0.015)); else os.translate(line + sgn * (T + 0.015), 0.08, (a + b) / 2);
        B.add(os, WOOD);
      }
      // the wallpaper on the inner face (above the wainscot on the back walls), with holes for windows
      for (const [u0, u1, y0, y1] of wallPieces(a, b, H, holes)) {
        const yy0 = back ? Math.max(y0, WAIN - 0.02) : y0; if (y1 <= yy0) continue;
        const off = line - sgn * 0.002;
        const c = horiz ? [[u0, yy0, off], [u1, yy0, off], [u1, y1, off], [u0, y1, off]] : [[off, yy0, u1], [off, yy0, u0], [off, y1, u0], [off, y1, u1]];
        if (sgn > 0) c.reverse(); // (front walls face the other way)
        quad(wp, ...c, horiz ? (q => [q[0] / wallT, q[1] / wallT]) : (q => [-q[2] / wallT, q[1] / wallT]));
      }
    }
    // corner posts where runs meet, and posts at run ends (door sides)
    const ends = new Map();
    for (const run of S.walls) {
      const H = isBack(run) ? WALL_H : LOW_H;
      for (const [x, z] of [[run.x0, run.z0], [run.x1, run.z1]]) { const k = x + ',' + z; ends.set(k, Math.max(ends.get(k) || 0, H)); }
    }
    for (const [k, H] of ends) {
      const [x, z] = k.split(',').map(Number), px = x * CELL, pz = z * CELL;
      // push the post toward the solid (non-floor) quadrants round the corner, onto the wall bodies, out of the cells
      let sx = 0, sz = 0;
      for (const [qx, qz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!S.isFloor(x + qx, z + qz)) { sx += qx ? -1 : 1; sz += qz ? -1 : 1; }
      const ox = Math.sign(sx) * T / 2, oz = Math.sign(sz) * T / 2;
      const post = K.box(T + 0.08, H + 0.1, T + 0.08, 0.035); post.translate(px + ox, (H + 0.1) / 2, pz + oz);
      B.add(post, (p, n, o) => o.set(WOOD).multiplyScalar((n.y > 0.5 ? 1.12 : 0.96) * (0.94 + 0.06 * Math.sin(p.y * 23 + p.x * 7))));
      const foot = K.box(T + 0.14, 0.1, T + 0.14, 0.03); foot.translate(px + ox, 0.05, pz + oz); B.add(foot, WOOD_D);
      if (H < 1) { // a low post's turned cap: a collar and a round finial
        const col = K.cyl(0.11, 0.12, 0.05, 16); col.translate(px + ox, H + 0.125, pz + oz); B.add(col, WOOD_D);
        const knob = K.sph(0.085, 16, 12); knob.scale(1, 0.85, 1); knob.translate(px + ox, H + 0.21, pz + oz); B.add(knob, (p, n, o) => o.set(WOOD_L).multiplyScalar(n.y > 0.3 ? 1.12 : 0.92));
      }
    }
    // partitions: low walls with tall posts at the doorway and a beam across it
    for (const p of S.partitions) {
      const horiz = p.z0 === p.z1, a = (horiz ? p.x0 : p.z0) * CELL, b = (horiz ? p.x1 : p.z1) * CELL, line = (horiz ? p.z0 : p.x0) * CELL;
      const g = horiz ? K.box(b - a, PART_H, T, 0.03) : K.box(T, PART_H, b - a, 0.03);
      if (horiz) g.translate((a + b) / 2, PART_H / 2, line); else g.translate(line, PART_H / 2, (a + b) / 2);
      B.add(g, PLASTER);
      const cap = horiz ? K.box(b - a + 0.04, 0.09, T + 0.08, 0.03) : K.box(T + 0.08, 0.09, b - a + 0.04, 0.03);
      if (horiz) cap.translate((a + b) / 2, PART_H + 0.04, line); else cap.translate(line, PART_H + 0.04, (a + b) / 2);
      B.add(cap, WOOD_L);
      const c0 = horiz ? [a, line] : [line, a], c1 = horiz ? [b, line] : [line, b];
      for (const [x, z] of [c0, c1]) { const post = K.box(T + 0.06, 2.1, T + 0.06, 0.03); post.translate(x, 1.05, z); B.add(post, WOOD); }
      const col = horiz ? this.collision.addRect(ORIGIN + a, ORIGIN + line - T / 2, ORIGIN + b, ORIGIN + line + T / 2, 'wall') : this.collision.addRect(ORIGIN + line - T / 2, ORIGIN + a, ORIGIN + line + T / 2, ORIGIN + b, 'wall');
      this.cols.push(col);
    }
    for (const p of this.layout.partitions || []) { // the beam over each doorway
      const horiz = p.z != null, a = p.gap[0] * CELL, b = p.gap[1] * CELL, line = (horiz ? p.z : p.x) * CELL;
      const g = horiz ? K.box(b - a + 0.2, 0.14, T + 0.04, 0.03) : K.box(T + 0.04, 0.14, b - a + 0.2, 0.03);
      if (horiz) g.translate((a + b) / 2, 2.07, line); else g.translate(line, 2.07, (a + b) / 2);
      B.add(g, WOOD_D);
    }
    // windows: frames, sills and lattices; panes in their own daylight material; a patch of sun on the floor
    this.sunMeshes = []; this.motes = [];
    const panes = new Builder(311); panes.jitter = 0; panes.warpAmt = 0;
    for (const w of S.windows) {
      const run = S.walls.find(r => r.side === w.side && (w.side === 'n' ? S.winCells.has(`n:${w.at},${r.z0}`) && w.at >= r.x0 && w.at < r.x1 : S.winCells.has(`w:${r.x0},${w.at}`) && w.at >= r.z0 && w.at < r.z1));
      if (!run) continue;
      const horiz = w.side === 'n', line = (horiz ? run.z0 : run.x0) * CELL, u0 = w.at * CELL, u1 = (w.at + w.w) * CELL, uc = (u0 + u1) / 2, ww = u1 - u0;
      const at = (u, y, d = 0) => (horiz ? [u, y, line - d] : [line - d, y, u]);
      const ry = horiz ? 0 : Math.PI / 2; // local +z = into the room
      B.at(at(uc, w.y), ry, () => windowFrame(B, ww, w.h, w.kind, WOOD, WOOD_L));
      panes.at(at(uc, w.y, 0.06), ry, () => windowPanes(panes, ww, w.h, w.kind));
      // sun patch on the floor in front of the window, and a faint shaft
      const fx = horiz ? 0 : 1, fz = horiz ? 1 : 0, dep = 1.7;
      const pg = new THREE.PlaneGeometry(horiz ? ww * 1.25 : dep, horiz ? dep : ww * 1.25); pg.rotateX(-Math.PI / 2);
      pg.translate(ORIGIN + (horiz ? uc + 0.35 : line + dep / 2 + 0.2), 0.046, ORIGIN + (horiz ? line + dep / 2 + 0.2 : uc + 0.35)); // (just over a rug)
      const pm = this.addOwn(pg, this.mats.patch, { cast: false, receive: false, order: 3, name: 'interior:sunPatch' }); this.sunMeshes.push(pm);
      const sg = new THREE.PlaneGeometry(ww * 0.95, 2.2); sg.translate(0, 1.1, 0);
      const sm = this.addOwn(sg, this.mats.shaft, { cast: false, receive: false, order: 4, name: 'interior:sunShaft' });
      sm.position.set(ORIGIN + (horiz ? uc + 0.3 : line + 0.9), 0, ORIGIN + (horiz ? line + 0.9 : uc + 0.3));
      sm.rotation.set(-0.62, horiz ? 0 : Math.PI / 2, 0, 'YXZ'); // (leaning from the floor back up to the window)
      this.sunMeshes.push(sm);
      this.motes.push({ a: this.W(horiz ? uc : line + 0.2, horiz ? line + 0.2 : uc, w.y + w.h * 0.5), b: this.W(horiz ? uc + 0.35 : line + 1.6, horiz ? line + 1.6 : uc + 0.35, 0.2), w: ww * 0.8 });
    }
    // the door: a gap in the front wall, a threshold, a woven door mat with a paw, a stone step and slippers outside
    const D = S.door;
    if (D) {
      const horiz = D.side === 's', a = (horiz ? D.x0 : D.z0) * CELL, b = (horiz ? D.x1 : D.z1) * CELL, line = (horiz ? D.z : D.x) * CELL;
      const at = (u, y, d) => (horiz ? [u, y, line + d] : [line + d, y, u]);
      const ry = horiz ? 0 : Math.PI / 2;
      B.at(at((a + b) / 2, 0, 0), ry, () => doorway(B, b - a, WOOD, WOOD_L));
      B.at(at((a + b) / 2, 0, -CELL / 2 - 0.02), ry, () => doorMat(B, b - a - 0.12));
      const c = this.S.doorCells, mx = c.reduce((s, q) => s + q[0], 0) / c.length, mz = c.reduce((s, q) => s + q[1], 0) / c.length;
      this.doorMatPos = this.cellCentre(mx, mz);
      this.doorOut = horiz ? V(0, 0, 1) : V(1, 0, 0);
    }
    // merge: trim (vertex colours), wallpaper, floor (textured), panes
    const trim = B.finish().geos;
    for (const [k, g] of Object.entries(trim)) { // (no warp: the wallpaper planes sit only 2 mm in front of the plaster)
      g.translate(ORIGIN, 0, ORIGIN);
      this.addOwn(g, k === 'body' ? this.mats.trim : MATS()[k], { name: 'interior:trim' });
    }
    const pn = panes.finish().geos.body;
    if (pn) { pn.translate(ORIGIN, 0, ORIGIN); this.addOwn(pn, this.mats.pane, { cast: false, name: 'interior:panes' }); }
    this.wallMesh = this.addOwn(quadsGeo(wp), this.surfMat(wallId), { name: 'interior:wallpaper' });
    this.floorMesh = this.addOwn(quadsGeo(fp), this.surfMat(floorId), { cast: false, name: 'interior:floor' });
    this.wallId = wallId; this.floorId = floorId;
  }
  /** swap the wallpaper / floor without rebuilding the room */
  setSurface(kind, id) {
    if (!SURFACES[id]) return;
    if (kind === 'wall') { this.wallMesh.material = this.surfMat(id); this.wallId = id; }
    else { this.floorMesh.material = this.surfMat(id); this.floorId = id; }
  }

  // ---------------------------------------------------------------- furniture
  /** items: the interior's placements; hidden: a Set of k not to draw (the one being moved) */
  setFurniture(items, hidden = null) {
    this.items = items;
    const entries = [];
    for (const it of items) {
      if (hidden?.has(it.k) || (hidden && it.mount === 'table' && hidden.has(it.on))) continue;
      if (!FURNITURE[it.id]) continue;
      entries.push({ id: it.id, m: this.matrixOf(it, items) });
    }
    this.batches.set(entries);
    this.syncColliders(items, hidden);
    this.syncLights(items, hidden);
  }
  matrixOf(it, items = this.items) {
    const p = poseOf(it, items);
    _q.setFromAxisAngle(_up, p.yaw);
    return new THREE.Matrix4().compose(_p.set(ORIGIN + p.x, p.y, ORIGIN + p.z), _q, _s);
  }
  syncColliders(items, hidden) {
    for (const c of this.itemCols || []) { this.collision.remove(c); const i = this.cols.indexOf(c); if (i >= 0) this.cols.splice(i, 1); }
    this.itemCols = [];
    for (const it of items) {
      const d = FURNITURE[it.id];
      if (it.mount !== 'floor' || d.walk || hidden?.has(it.k)) continue;
      const [w, dd] = footprint(d, it.rot || 0), x0 = ORIGIN + it.x * CELL + 0.06, z0 = ORIGIN + it.z * CELL + 0.06;
      const c = this.collision.addRect(x0, z0, x0 + w * CELL - 0.12, z0 + dd * CELL - 0.12, 'furniture');
      this.itemCols.push(c); this.cols.push(c);
    }
  }
  syncLights(items, hidden) {
    for (const s of this.itemSources || []) { this.lightPool.removeSource(s); const i = this.sources.indexOf(s); if (i >= 0) this.sources.splice(i, 1); }
    this.itemSources = [];
    for (const it of items) {
      const d = FURNITURE[it.id]; if (!d.light || hidden?.has(it.k) || (hidden && it.mount === 'table' && hidden.has(it.on))) continue;
      const p = poseOf(it, items);
      const s = this.lightPool.addSource({ pos: V(ORIGIN + p.x, p.y + d.light.y, ORIGIN + p.z), color: new THREE.Color(d.light.color), intensity: d.light.intensity, radius: d.light.radius, flicker: 0.25, nightOnly: true });
      this.itemSources.push(s); this.sources.push(s);
    }
  }
  /** world point in front of a placed floor item, where you stand to use it */
  frontOf(it) { const [cx, cz] = frontCell(it); return this.cellCentre(cx, cz); }
  addSource(o) { const s = this.lightPool.addSource(o); this.sources.push(s); return s; }
}

// ------------------------------------------------------------------ shell helpers
// wall pieces of [a, b] x [0, H] around rectangular holes [u0, u1, y0, y1] → [[u0, u1, y0, y1], ...]
function wallPieces(a, b, H, holes) {
  if (!holes.length) return [[a, b, 0, H]];
  const cuts = [...new Set([a, b, ...holes.flatMap(h => [h[0], h[1]])])].sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const u0 = cuts[i], u1 = cuts[i + 1]; if (u1 - u0 < 1e-4) continue;
    const hs = holes.filter(h => h[0] < u1 - 1e-4 && h[1] > u0 + 1e-4).sort((p, q) => p[2] - q[2]);
    let y = 0;
    for (const h of hs) { if (h[2] > y) out.push([u0, u1, y, h[2]]); y = Math.max(y, h[3]); }
    if (y < H) out.push([u0, u1, y, H]);
  }
  return out;
}
// textured quads → one geometry (two tris each), uv from a function of the corner position
function quadsGeo(list) {
  const P = [], N = [], UV = [];
  for (const q of list) {
    const [a, b, c, d] = q.p, e1 = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), e2 = new THREE.Vector3(...d).sub(new THREE.Vector3(...a)), n = e1.cross(e2).normalize();
    for (const v of [a, b, c, a, c, d]) { P.push(v[0] + ORIGIN, v[1], v[2] + ORIGIN); N.push(n.x, n.y, n.z); UV.push(...q.uv(v)); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
// a window opening's timber frame (local: centred at the bottom edge on the wall face, +z into the room)
function windowFrame(B, w, h, kind, wood, light) {
  const t = 0.085, d = 0.11, shade = (c, k) => (p, n, o) => o.set(c).multiplyScalar(n.y > 0.5 ? 1.12 * k : n.y < -0.5 ? 0.8 * k : k);
  // a rounded timber frame standing proud of the wall, mitred posts and head, a deep sill with a rounded nose
  for (const sx of [-1, 1]) { const g = K.box(t, h + t * 2, d, 0.03); g.translate(sx * (w / 2 + t / 2), h / 2, d / 2 - 0.03); B.add(g, shade(wood, 1)); }
  const top = K.box(w + t * 2 + 0.06, t + 0.02, d + 0.02, 0.035); top.translate(0, h + t / 2, d / 2 - 0.02); B.add(top, shade(wood, 1));
  const sill = K.box(w + t * 2 + 0.16, 0.075, d + 0.13, 0.035); sill.translate(0, -0.03, d / 2 + 0.02); B.add(sill, shade(light, 1));
  const apron = K.box(w + t * 2 - 0.02, 0.06, 0.04, 0.015); apron.translate(0, -0.1, 0.03); B.add(apron, shade(wood, 0.92));
  const rv = K.box(w, h, 0.02, 0); rv.translate(0, h / 2, -0.17); B.add(rv, '#c8b49a'); // (the back of the opening, behind the panes)
  if (kind === 'round') { // a wooden board with a round window (maru-mado) in the square opening, a round lattice
    const R = Math.min(w, h) * 0.45, cy = h / 2;
    const shp = new THREE.Shape(); shp.moveTo(-w / 2, 0); shp.lineTo(w / 2, 0); shp.lineTo(w / 2, h); shp.lineTo(-w / 2, h); shp.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); hole.absarc(0, cy, R, 0, Math.PI * 2, true); shp.holes.push(hole);
    const board = new THREE.ExtrudeGeometry(shp, { depth: 0.04, bevelEnabled: false, curveSegments: 28 }); board.translate(0, 0, -0.05); B.add(board, shade(light, 0.95));
    const ring = K.torus(R, 0.038, 8, 32); ring.translate(0, cy, -0.005); B.add(ring, shade(wood, 1));
    for (const k of [-1, 0, 1]) {
      const L = 2 * Math.sqrt(Math.max(0, R * R - (k * R * 0.42) ** 2));
      const v = K.box(0.026, L, 0.026, 0); v.translate(k * R * 0.42, cy, -0.03); B.add(v, wood);
      const hh = K.box(L, 0.026, 0.026, 0); hh.translate(0, cy + k * R * 0.42, -0.03); B.add(hh, wood);
    }
  } else { // shoji: kumiko lattice, a finer row of squares at the bottom
    for (let i = 1; i < 4; i++) { const v = K.box(0.024, h, 0.026, 0); v.translate(-w / 2 + i * w / 4, h / 2, -0.035); B.add(v, wood); }
    for (let j = 1; j < 3; j++) { const hh = K.box(w, 0.024, 0.026, 0); hh.translate(0, j * h / 3, -0.035); B.add(hh, wood); }
    const kick = K.box(w, h * 0.16, 0.03, 0.006); kick.translate(0, h * 0.08, -0.04); B.add(kick, shade(light, 0.9));
  }
  // tie-back curtains on a rod with round finials
  const rodY = h + t + 0.1, rw = w + t * 2 + 0.34;
  const rod = K.cyl(0.018, 0.018, rw, 10); rod.rotateZ(Math.PI / 2); rod.translate(0, rodY, 0.13); B.add(rod, shade(wood, 1));
  for (const sx of [-1, 1]) {
    const f = K.sph(0.035, 12, 8); f.translate(sx * rw / 2, rodY, 0.13); B.add(f, '#e8b860');
    const br = K.box(0.03, 0.06, 0.12, 0.01); br.translate(sx * (rw / 2 - 0.06), rodY - 0.02, 0.07); B.add(br, wood);
    // the curtain panel: gathered (wavy) at the top, pinched by a tie at two thirds, flaring below
    const cw = 0.24, ch = h + t + 0.06, cx = sx * (w / 2 + t + 0.03), g = K.plane(cw, ch, 6, 10), pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), v = 0.5 - y / ch; // 0 at the top, 1 at the bottom
      const pinch = 1 - 0.55 * Math.exp(-((v - 0.62) ** 2) / 0.02);
      pp.setXYZ(i, x * pinch - sx * (1 - pinch) * 0.05, y, Math.sin(x / cw * Math.PI * 3) * 0.025 + 0.02 * v);
    }
    g.computeVertexNormals(); g.translate(cx, rodY - ch / 2 - 0.02, 0.12);
    B.cloth(g, { grad: ['#f6c8d4', '#fff1f2'] }, { x0: cx - cw / 2, x1: cx + cw / 2, yTop: rodY, yBot: rodY - ch });
    const tie = K.torus(0.06, 0.016, 6, 14); tie.scale(1, 0.55, 1); tie.translate(cx - sx * 0.01, rodY - 0.02 - ch * 0.62, 0.13); B.add(tie, '#e8708a');
  }
  // a little pot of flowers on the sill: petals, not blobs
  const pot = K.lathe([[0.001, 0], [0.055, 0], [0.065, 0.02], [0.07, 0.09], [0.078, 0.1], [0.072, 0.11], [0.001, 0.1]], 14); pot.translate(w / 2 - 0.12, 0.005, 0.06); B.add(pot, (p, n, o) => o.set(p.y > 0.085 ? '#e88a5e' : '#d4774e'));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, fx = w / 2 - 0.12 + Math.cos(a) * 0.035, fz = 0.06 + Math.sin(a) * 0.03, fy = 0.17 + (i % 2) * 0.035;
    const st = K.cyl(0.005, 0.006, fy - 0.1, 4); st.translate(fx, 0.1 + (fy - 0.1) / 2, fz); B.add(st, '#5a9a48');
    const fl = K.disc(0.03, 10); fl.rotateX(-Math.PI / 2.6); fl.translate(fx, fy, fz); B.add(fl, ['#ff8fb0', '#ffd24a', '#ffffff', '#c8a8ff', '#ff8fb0'][i]);
    const c = K.sph(0.009, 6, 4); c.translate(fx, fy + 0.005, fz + 0.004); B.add(c, '#ffe07a');
  }
}
function windowPanes(B, w, h, kind) {
  if (kind === 'round') { const R = Math.min(w, h) * 0.46; const g = K.disc(R, 24); g.translate(0, h / 2, 0); B.add(g, '#fffaf0'); return; }
  const g = K.plane(w, h); g.translate(0, h / 2, 0); B.add(g, '#fffaf0');
}
// the doorway in a front wall (local: centred on the line at the floor; +z = outside)
function doorway(B, w, wood, light) {
  // the threshold with a sliding door's double track, and a stone genkan step outside
  const th = K.box(w + 0.12, 0.05, 0.24, 0.02); th.translate(0, 0.02, 0); B.add(th, (p, n, o) => o.set(light).multiplyScalar(n.y > 0.5 ? 1.08 : 0.9));
  for (const dz of [-0.05, 0.05]) { const r = K.box(w + 0.1, 0.016, 0.022, 0.006); r.translate(0, 0.052, dz); B.add(r, wood); }
  const step = K.box(w + 0.22, 0.2, 0.52, 0.07); step.translate(0, -0.11, 0.44);
  B.add(step, (p, n, o) => { o.set('#cfc5cc').multiplyScalar(n.y > 0.5 ? 1.07 : 0.88); o.multiplyScalar(0.95 + 0.07 * Math.sin(p.x * 13) * Math.sin(p.z * 17)); });
  for (const sx of [-1, 1]) { // a pair of red slippers on the step, toes pointing in: a soft rounded sole, a puffy arched strap
    B.at([sx * 0.11, 0.0, 0.42], sx * 0.12, () => {
      const sole = K.box(0.125, 0.04, 0.27, 0.019); sole.translate(0, 0.004, 0); B.add(sole, (p, n, o) => o.set(n.y > 0.5 ? '#f27058' : '#c8402e').multiplyScalar(n.y > 0.5 && Math.abs(p.x) < 0.04 && p.z > 0 ? 0.92 : 1));
      const strap = K.torus(0.062, 0.024, 8, 14, Math.PI); strap.scale(1, 0.75, 1.15); strap.translate(0, 0.022, -0.05); B.add(strap, (p, n, o) => o.set('#fff4ea').multiplyScalar(n.y > 0.4 ? 1.03 : 0.9));
      const dot = K.sph(0.016, 10, 8); dot.translate(0, 0.07, -0.05); B.add(dot, '#ff8fb0');
    });
  }
  // an umbrella stand by the step (a striped paper parasol furled in a pot)
  B.at([w / 2 + 0.2, -0.01, 0.42], 0, () => {
    const pot = K.lathe([[0.001, 0], [0.08, 0], [0.09, 0.03], [0.085, 0.2], [0.095, 0.22], [0.001, 0.2]], 16); B.add(pot, (p, n, o) => o.set(p.y > 0.2 ? '#4a7ab0' : p.y % 0.07 < 0.012 ? '#ffffff' : '#5a8ac8'));
    const u = K.cone(0.05, 0.42, 10); u.translate(0.01, 0.42, 0); u.rotateZ(-0.08); B.add(u, (p, n, o) => o.set(Math.sin(Math.atan2(p.z, p.x) * 5) > 0 ? '#ff8fb0' : '#fff0f4'));
    const hd = K.torus(0.035, 0.012, 6, 12, Math.PI); hd.translate(0, 0.66, 0); B.add(hd, wood);
  });
}
function doorMat(B, w) {
  // a woven jute mat: a raised pink binding round it, woven rows, a paw print and the word-less "welcome" heart
  const m = K.box(w, 0.03, 0.44, 0.014); m.translate(0, 0.015, 0);
  B.add(m, (p, n, o) => { o.set('#e2bf84'); if (Math.sin(p.z * 95) > 0.35) o.multiplyScalar(0.92); if (Math.sin(p.x * 140 + Math.floor(p.z * 30) * 1.7) > 0.8) o.multiplyScalar(0.94); if (n.y < 0.5) o.multiplyScalar(0.85); });
  for (const sz of [-1, 1]) { const b = K.box(w + 0.02, 0.036, 0.045, 0.016); b.translate(0, 0.018, sz * 0.205); B.add(b, '#ee8aa6'); }
  for (const sx of [-1, 1]) { const b = K.box(0.045, 0.036, 0.42, 0.016); b.translate(sx * (w / 2 - 0.012), 0.018, 0); B.add(b, '#ee8aa6'); }
  const pad = K.cyl(0.07, 0.072, 0.012, 18); pad.scale(1, 1, 0.82); pad.translate(-0.12, 0.033, 0.03); B.add(pad, '#9a6a44');
  for (let i = 0; i < 4; i++) { const t = K.cyl(0.028, 0.03, 0.012, 12); t.translate(-0.12 - 0.075 + i * 0.05, 0.033, -0.065 - (i === 1 || i === 2 ? 0.025 : 0)); B.add(t, '#9a6a44'); }
  const heart = K.box(0.06, 0.012, 0.06, 0.012); heart.rotateY(Math.PI / 4); heart.translate(0.16, 0.033, 0.0); B.add(heart, '#ee8aa6');
  for (const sx of [-1, 1]) { const lobe = K.cyl(0.028, 0.028, 0.012, 12); lobe.translate(0.16 + sx * 0.021, 0.034, -0.021); B.add(lobe, '#ee8aa6'); }
}
// the patch of sun a window throws on the floor: a soft-edged pane with the lattice's shadow in it
let _patch = null;
function patchTexture() {
  if (_patch) return _patch;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.filter = 'blur(7px)'; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(22, 22, S - 44, S - 44, 18); g.fill();
  g.filter = 'blur(2px)'; g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.55)';
  for (const k of [1, 2]) { g.fillRect(22 + k * (S - 44) / 3 - 2, 24, 4, S - 48); g.fillRect(24, 22 + k * (S - 44) / 3 - 2, S - 48, 4); }
  _patch = new THREE.CanvasTexture(c); _patch.colorSpace = THREE.SRGBColorSpace;
  return _patch;
}
// a soft vertical gradient for the window light shafts (bright at the window, fading to the floor)
let _shaft = null;
function shaftTexture() {
  if (_shaft) return _shaft;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
  const gx = g.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.25, 'rgba(0,0,0,0)'); gx.addColorStop(0.75, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
  _shaft = new THREE.CanvasTexture(c); _shaft.colorSpace = THREE.SRGBColorSpace;
  return _shaft;
}
